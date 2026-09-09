import { NextResponse } from "next/server";
import { conciergeFeedbackSchema } from "@/lib/validation/concierge";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { FirestoreConciergeRepository } from "@/repositories/firebase/firestore-concierge-repository";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  const parsed = conciergeFeedbackSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  if (!consumeRateLimit(`concierge-feedback:${parsed.data.sessionId}`, 5, 60 * 60 * 1000).allowed)
    return NextResponse.json({ error: "Feedback has already been recorded." }, { status: 429 });
  try {
    await new FirestoreConciergeRepository().recordFeedback(parsed.data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Conversation was not found." }, { status: 404 });
  }
}
