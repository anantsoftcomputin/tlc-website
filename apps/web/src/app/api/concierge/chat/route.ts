import { conversationSession } from "@/lib/security/conversation-session";
import { NextResponse } from "next/server";
import { answerConcierge } from "@/lib/ai/concierge-engine";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumePublicRateLimit as consumeRateLimit, checkPublicRequest } from "@/lib/security/public-request";
import { conciergeChatRequestSchema } from "@/lib/validation/concierge";
import { FirestoreConciergeRepository } from "@/repositories/firebase/firestore-concierge-repository";

const repository = new FirestoreConciergeRepository();

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
    `concierge:${forwardedFor || "unknown"}`,
    30,
    10 * 60 * 1000,
  );
  if (!limit.allowed)
    return NextResponse.json(
      {
        error:
          "Tara is receiving many messages. Please wait a moment and try again.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  try {
    const parsed = conciergeChatRequestSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Please send a shorter message." },
        { status: 400 },
      );
    const startedAt = Date.now();
    const session = await conversationSession(request, parsed.data.sessionId);
    const response = session.status === "bot" ? await answerConcierge(parsed.data) : undefined;
    const accepted = await repository.recordTurn({
      sessionId: parsed.data.sessionId,
      page: parsed.data.page,
      message: parsed.data.message,
      response,
      latencyMs: Date.now() - startedAt,
    });
    if (!accepted || !response) return NextResponse.json({ status: "human", message: "Your message is with the TLC team.", cards: [], followUpQuestions: [], preferenceUpdates: [], handover: { required: false } });
    const { telemetry: _telemetry, ...publicResponse } = response;
    void _telemetry;
    return NextResponse.json(publicResponse, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "Concierge request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      {
        error:
          "I couldn’t complete that thought. Please try again or ask for a TLC expert.",
      },
      { status: 500 },
    );
  }
}
