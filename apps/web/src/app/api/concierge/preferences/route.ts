import { NextResponse } from "next/server";
import { conciergePreferenceConfirmationSchema } from "@/lib/validation/concierge";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { FirestoreConciergeRepository } from "@/repositories/firebase/firestore-concierge-repository";

const repository = new FirestoreConciergeRepository();

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  const parsed = conciergePreferenceConfirmationSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "The preference confirmation is invalid." }, { status: 400 });
  const limit = consumeRateLimit(`concierge-preferences:${parsed.data.sessionId}`, 20, 10 * 60 * 1000);
  if (!limit.allowed)
    return NextResponse.json({ error: "Please wait before saving more preferences." }, { status: 429 });
  try {
    await repository.confirmPreferences(parsed.data);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "The preferences could not be saved." }, { status: 404 });
  }
}
