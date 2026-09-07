import { NextResponse } from "next/server";
import { answerConcierge } from "@/lib/ai/concierge-engine";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { conciergeChatRequestSchema } from "@/lib/validation/concierge";
import { FirestoreConciergeRepository } from "@/repositories/firebase/firestore-concierge-repository";

const repository = new FirestoreConciergeRepository();

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
    const response = await answerConcierge(parsed.data);
    await repository.recordTurn({
      sessionId: parsed.data.sessionId,
      page: parsed.data.page,
      message: parsed.data.message,
      response,
    });
    return NextResponse.json(response, {
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
