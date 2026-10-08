import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumePublicRateLimit } from "@/lib/security/public-request";
import { clientCustomers } from "@/repositories/firebase/client-portal-repository";
import { getAdminFirestore } from "@/lib/firebase/admin";
const schema = z.object({
  conversationId: z
    .string()
    .regex(/^[\w-]{1,128}$/)
    .optional(),
  body: z.string().trim().min(1).max(4000),
  requestId: z.string().uuid(),
});
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getSessionUser();
  if (!user?.orgId || user.role !== "customer" || !user.emailVerified)
    return NextResponse.json(
      { error: "Verified client account required." },
      { status: 401 },
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Please check your message." },
      { status: 400 },
    );
  if (
    !(await consumePublicRateLimit(`client-message:${user.uid}`, 30, 3600000))
      .allowed
  )
    return NextResponse.json(
      { error: "Please wait before sending another message." },
      { status: 429 },
    );
  const customers = await clientCustomers(user);
  const db = getAdminFirestore();
  const id = parsed.data.conversationId || `portal-${user.uid}`;
  const ref = db.collection("conversations").doc(id);
  const now = new Date().toISOString();
  try {
    await db.runTransaction(async (tx) => {
      const message = ref
        .collection("messages")
        .doc(`${user.uid}-${parsed.data.requestId}`);
      const [thread, existing] = await Promise.all([
        tx.get(ref),
        tx.get(message),
      ]);
      const data = thread.data();
      if (
        data
          ? data.orgId !== user.orgId ||
            (data.clientUid !== user.uid &&
              !customers.some((customer) => customer.id === data.customerId))
          : id !== `portal-${user.uid}`
      )
        throw new Error("not-found");
      if (existing.exists) return;
      tx.set(
        ref,
        {
          ...(!thread.exists
            ? {
                id,
                orgId: user.orgId,
                channel: "web",
                mode: "text",
                clientUid: user.uid,
                customerId: customers[0]?.id || null,
                assignedUid: customers[0]?.data().ownerUid || "unassigned",
                participants: [
                  {
                    id: user.uid,
                    type: "customer",
                    displayName: user.name || "Traveller",
                  },
                ],
                createdAt: now,
                createdBy: user.uid,
              }
            : {}),
          status: "human",
          summary: parsed.data.body.slice(0, 200),
          lastMessageAt: now,
          handoverAt: now,
          handoverReason: "Client sent a message to the TLC team.",
          updatedAt: now,
          updatedBy: user.uid,
        },
        { merge: true },
      );
      tx.create(message, {
        id: message.id,
        orgId: user.orgId,
        conversationId: id,
        direction: "inbound",
        from: { id: user.uid, type: "customer" },
        body: parsed.data.body,
        inputMode: "text",
        media: [],
        deliveryStatus: "read",
        aiGenerated: false,
        toolCalls: [],
        source: "client-portal",
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Conversation could not be found." },
      { status: 404 },
    );
  }
}
