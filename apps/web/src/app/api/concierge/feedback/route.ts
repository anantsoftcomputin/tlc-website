import { conversationSession } from "@/lib/security/conversation-session";
import { NextResponse } from "next/server";
import { conciergeFeedbackSchema } from "@/lib/validation/concierge";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumePublicRateLimit as consumeRateLimit, checkPublicRequest } from "@/lib/security/public-request";
import { FirestoreConciergeRepository } from "@/repositories/firebase/firestore-concierge-repository";

export async function POST(request: Request) {
  const denied = await checkPublicRequest(request); if (denied) return denied;
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  const parsed = conciergeFeedbackSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  try { await conversationSession(request, parsed.data.sessionId); } catch { return NextResponse.json({error:"Conversation access denied."},{status:403}); }
  if (!(await consumeRateLimit(`concierge-feedback:${parsed.data.sessionId}`, 5, 60 * 60 * 1000)).allowed)
    return NextResponse.json({ error: "Feedback has already been recorded." }, { status: 429 });
  try {
    await new FirestoreConciergeRepository().recordFeedback(parsed.data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Conversation was not found." }, { status: 404 });
  }
}
