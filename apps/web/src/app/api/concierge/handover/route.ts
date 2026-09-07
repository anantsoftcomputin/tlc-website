import { NextResponse } from "next/server";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { conciergeHandoverSchema } from "@/lib/validation/concierge";
import { FirestoreConciergeRepository } from "@/repositories/firebase/firestore-concierge-repository";
import { FirestoreInquiryRepository } from "@/repositories/firebase/firestore-inquiry-repository";

const conversations = new FirestoreConciergeRepository();
const inquiries = new FirestoreInquiryRepository();

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Untrusted request origin." },
      { status: 403 },
    );
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const limit = consumeRateLimit(
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
    const inquiry = await inquiries.create(
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
      { userAgent: request.headers.get("user-agent") || undefined },
    );
    await conversations.attachHandover({
      sessionId: input.sessionId,
      inquiryId: inquiry.id,
      customerId: `inquiry-${inquiry.id}`,
      leadId: `inquiry-${inquiry.id}`,
    });
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
