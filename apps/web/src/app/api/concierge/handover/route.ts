import { conversationSession } from "@/lib/security/conversation-session";
import { NextResponse } from "next/server";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumePublicRateLimit as consumeRateLimit, checkPublicRequest } from "@/lib/security/public-request";
import { conciergeHandoverSchema } from "@/lib/validation/concierge";
import { FirestoreInquiryRepository } from "@/repositories/firebase/firestore-inquiry-repository";

const inquiries = new FirestoreInquiryRepository();

export async function POST(request: Request) {
  const denied = await checkPublicRequest(request); if (denied) return denied;
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Untrusted request origin." },
      { status: 403 },
    );
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const limit = await consumeRateLimit(
    `concierge-handover:${forwardedFor || "unknown"}`,
    5,
    10 * 60 * 1000,
  );
  if (!limit.allowed)
    return NextResponse.json(
      { error: "Please wait before sending another request." },
      { status: 429 },
    );
  try {
    const parsed = conciergeHandoverSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message || "Please check your details.",
        },
        { status: 400 },
      );
    const input = parsed.data;
    const session = await conversationSession(request, input.sessionId);
    const followUp = {
      conversationId: input.sessionId,
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      preferredContact: input.preferredContact,
      summary: input.summary,
    };
    // A conversation becomes one lead; later handovers add to it rather than failing.
    let inquiry: { id: string };
    if (session.leadId) inquiry = await inquiries.appendHandover(followUp);
    else
      try {
        inquiry = await inquiries.create(
          {
            source: "ai_concierge",
            fullName: input.fullName,
            phone: input.phone,
            email: input.email,
            preferredContact: input.preferredContact,
            destinationIds: input.destinationIds,
            requirements:
              `${input.summary}\n\nAI conversation: ${input.sessionId}`.slice(
                0,
                2000,
              ),
          },
          { idempotencyKey: `handover:${input.sessionId}`, conversationId: input.sessionId, userAgent: request.headers.get("user-agent") || undefined },
        );
      } catch (error) {
        // A concurrent first handover won the race; attach these details to its lead.
        if (!(error instanceof Error) || !error.message.includes("different details")) throw error;
        inquiry = await inquiries.appendHandover(followUp);
      }
    return NextResponse.json({
      ok: true,
      inquiryId: inquiry.id,
      message: "Your conversation is now with the TLC planning desk.",
    });
  } catch (error) {
    console.error(
      "Concierge handover failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      {
        error:
          "We couldn’t connect you just now. Please try WhatsApp or call TLC.",
      },
      { status: 500 },
    );
  }
}
