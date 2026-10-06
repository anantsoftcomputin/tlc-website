import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
const schema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  name: z.string().trim().min(2).max(120),
  role: z.enum([
    "sales",
    "travel_consultant",
    "accounts",
    "marketing",
    "content_editor",
    "readonly",
    "manager",
    "admin",
  ]),
  active: z.boolean(),
});
export async function POST(request: Request) {
  const actor = await getAdminUser();
  if (
    !hasTrustedOrigin(request) ||
    !actor ||
    !hasPermission(actor.role, "users:manage")
  )
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check account details." },
      { status: 400 },
    );
  const input = parsed.data;
  const owner = ["owner", "super_admin"].includes(actor.role);
  if (!owner && ["manager", "admin"].includes(input.role))
    return NextResponse.json(
      { error: "Only the owner can appoint managers." },
      { status: 403 },
    );
  const auth = getAdminAuth();
  const db = getAdminFirestore();
  try {
    let account;
    try {
      account = await auth.getUserByEmail(input.email);
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found")
        throw error;
      account = await auth.createUser({
        email: input.email,
        displayName: input.name,
      });
    }
    const previous = account.customClaims || {};
    if (
      account.uid === actor.uid ||
      (previous.orgId && previous.orgId !== actor.orgId) ||
      ["owner", "super_admin"].includes(String(previous.role)) ||
      (!owner && ["manager", "admin"].includes(String(previous.role)))
    )
      return NextResponse.json(
        { error: "This account cannot be changed from your workspace." },
        { status: 403 },
      );
    const now = new Date().toISOString();
    await auth.setCustomUserClaims(account.uid, {
      ...previous,
      orgId: actor.orgId,
      role: input.role,
    });
    try {
      await db.runTransaction(async (tx) => {
        const ref = db.collection("users").doc(account.uid);
        const existing = await tx.get(ref);
        if (existing.exists && existing.data()?.orgId !== actor.orgId)
          throw new Error("Account belongs to another organization.");
        tx.set(
          ref,
          {
            uid: account.uid,
            orgId: actor.orgId,
            email: input.email,
            displayName: input.name,
            role: input.role,
            active: input.active,
            createdAt: existing.data()?.createdAt || now,
            createdBy: existing.data()?.createdBy || actor.uid,
            updatedAt: now,
            updatedBy: actor.uid,
          },
          { merge: true },
        );
        tx.create(db.collection("auditLogs").doc(), {
          orgId: actor.orgId,
          actorUid: actor.uid,
          action: "staff.access.update",
          collection: "users",
          docId: account.uid,
          before: existing.data() || null,
          after: { role: input.role, active: input.active },
          ts: now,
        });
      });
    } catch (error) {
      await auth.setCustomUserClaims(account.uid, previous);
      throw error;
    }
    await auth.updateUser(account.uid, {
      disabled: !input.active,
      displayName: input.name,
    });
    await auth.revokeRefreshTokens(account.uid);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        error:
          "The account could not be updated. Check its organization and try again.",
      },
      { status: 400 },
    );
  }
}
