import { conversationSession } from "@/lib/security/conversation-session";
import { NextResponse } from "next/server";
import { conciergePreferenceConfirmationSchema } from "@/lib/validation/concierge";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumePublicRateLimit as consumeRateLimit, checkPublicRequest } from "@/lib/security/public-request";
import { FirestoreConciergeRepository } from "@/repositories/firebase/firestore-concierge-repository";

const repository = new FirestoreConciergeRepository();

export async function POST(request: Request) {
  const denied = await checkPublicRequest(request); if (denied) return denied;
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  const parsed = conciergePreferenceConfirmationSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "The preference confirmation is invalid." }, { status: 400 });
  try { await conversationSession(request, parsed.data.sessionId); } catch { return NextResponse.json({error:"Conversation access denied."},{status:403}); }
  const limit = await consumeRateLimit(`concierge-preferences:${parsed.data.sessionId}`, 20, 10 * 60 * 1000);
  if (!limit.allowed)
    return NextResponse.json({ error: "Please wait before saving more preferences." }, { status: 429 });
  try {
    await repository.confirmPreferences(parsed.data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "The preferences could not be saved." }, { status: 404 });
  }
}
