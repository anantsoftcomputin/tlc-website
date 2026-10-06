import { NextResponse } from "next/server";
import { z } from "zod";
import { isManagerRole } from "@tlc/shared";
import { getAdminUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { getAdminFirestore } from "@/lib/firebase/admin";
const schema = z.object({
  id: z
    .string()
    .min(1)
    .max(200)
    .refine((value) => !value.includes("/")),
  reply: z.string().trim().min(1).max(4000),
  status: z.enum(["open", "answered", "closed"]),
});
export async function PATCH(request: Request) {
  const user = await getAdminUser();
  if (
    !hasTrustedOrigin(request) ||
    !user ||
    !hasPermission(user.role, "crm:write")
  )
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid reply." }, { status: 400 });
  const db = getAdminFirestore();
  const ref = db.collection("supportRequests").doc(parsed.data.id);
  try {
    await db.runTransaction(async (tx) => {
      const before = (await tx.get(ref)).data();
      if (
        !before ||
        before.orgId !== user.orgId ||
        (!isManagerRole(user.role) && before.assignedUid !== user.uid)
      )
        throw new Error("Access denied.");
      const now = new Date().toISOString();
      tx.update(ref, {
        reply: parsed.data.reply,
        status: parsed.data.status,
        updatedAt: now,
        updatedBy: user.uid,
      });
      tx.create(db.collection("auditLogs").doc(), {
        orgId: user.orgId,
        actorUid: user.uid,
        action: "client.support.reply",
        docId: ref.id,
        before: { status: before.status },
        after: { status: parsed.data.status },
        ts: now,
      });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
}
