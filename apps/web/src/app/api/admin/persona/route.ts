import { NextResponse } from "next/server";
import { personaSchema } from "@tlc/shared";
import { getAdminUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { FirestorePersonaRepository } from "@/repositories/firebase/firestore-persona-repository";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await getAdminUser();
  if (!user || !user.orgId || !hasPermission(user.role, "settings:manage"))
    return NextResponse.json({ error: "Persona management access is required." }, { status: 403 });
  const body = (await request.json()) as Record<string, unknown>;
  const now = new Date().toISOString();
  const parsed = personaSchema.safeParse({
    ...body,
    orgId: user.orgId,
    createdAt: now,
    updatedAt: now,
    createdBy: user.uid,
    updatedBy: user.uid,
  });
  if (!parsed.success)
    return NextResponse.json({ error: "The persona settings are invalid.", fields: parsed.error.flatten() }, { status: 400 });
  const saved = await new FirestorePersonaRepository(user.orgId).save(
    parsed.data,
    user.uid,
  );
  return NextResponse.json({ ok: true, version: saved.version });
}
