import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumePublicRateLimit } from "@/lib/security/public-request";
import { clientCustomers } from "@/repositories/firebase/client-portal-repository";
import { getAdminFirestore } from "@/lib/firebase/admin";
const schema = z.object({
  subject: z.string().trim().min(3).max(150),
  body: z.string().trim().min(5).max(4000),
  requestId: z.string().uuid(),
});
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.role !== "customer" || !user.emailVerified)
    return NextResponse.json(
      { error: "Please sign in with a verified client account." },
      { status: 401 },
    );
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Please check your message." },
      { status: 400 },
    );
  if (
    !(await consumePublicRateLimit(`support:${user.uid}`, 10, 3600000)).allowed
  )
    return NextResponse.json(
      { error: "Please wait before submitting another request." },
      { status: 429 },
    );
  const customers = await clientCustomers(user);
  const db = getAdminFirestore();
  const ref = db
    .collection("supportRequests")
    .doc(`${user.uid}-${parsed.data.requestId}`);
  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return;
    tx.create(ref, {
      id: ref.id,
      orgId: user.orgId,
      clientUid: user.uid,
      customerId: customers[0]?.id || null,
      assignedUid: customers[0]?.data().ownerUid || "unassigned",
      subject: parsed.data.subject,
      body: parsed.data.body,
      status: "open",
      reply: "",
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
    });
    tx.create(db.collection("auditLogs").doc(), {
      orgId: user.orgId,
      actorUid: user.uid,
      action: "client.support.create",
      collection: "supportRequests",
      docId: ref.id,
      ts: now,
    });
  });
  return NextResponse.json({ ok: true });
}
