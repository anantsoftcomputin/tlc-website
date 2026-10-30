import { createHash } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { personalClientContext } from "@/lib/personalization/client-context";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumePublicRateLimit } from "@/lib/security/public-request";
const schema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  customerId: z.string().min(1).max(128),
  confirmed: z.literal(true),
});
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.role !== "customer" || !user.emailVerified)
    return NextResponse.json(
      { error: "Sign in with a verified client account." },
      { status: 401 },
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Confirm the connection details." },
      { status: 400 },
    );
  if (
    !(await consumePublicRateLimit(`personal-connect:${user.uid}`, 10, 3600000))
      .allowed
  )
    return NextResponse.json(
      { error: "Please wait before connecting again." },
      { status: 429 },
    );
  const personal = await personalClientContext(parsed.data.customerId, user);
  if (!personal)
    return NextResponse.json(
      {
        error:
          "Choose your own traveller record and enable personalisation first.",
      },
      { status: 403 },
    );
  const db = getAdminFirestore();
  const linkRef = db
    .collection("personalChannelLinks")
    .doc(createHash("sha256").update(parsed.data.token).digest("hex"));
  try {
    await db.runTransaction(async (tx) => {
      const link = (await tx.get(linkRef)).data();
      if (
        !link ||
        link.orgId !== user.orgId ||
        link.used ||
        !(Date.parse(link.expiresAt) > Date.now())
      )
        throw new Error("Invalid link");
      const threadRef = db.collection("conversations").doc(link.conversationId);
      const [thread, customer] = await Promise.all([
        tx.get(threadRef),
        tx.get(db.collection("customers").doc(personal.customerId)),
      ]);
      const data = thread.data(),
        client = customer.data();
      const matches =
        data?.channel === "email"
          ? data.emailAddress === user.email!.toLowerCase()
          : data?.channel === "whatsapp" &&
            client?.phones?.some(
              (phone: string) =>
                phone.replace(/\D/g, "") === data.whatsappAddress,
            );
      if (
        data?.orgId !== user.orgId ||
        client?.orgId !== user.orgId ||
        client?.verifiedClientUid !== user.uid ||
        client?.communicationPreferences?.personalization !== true ||
        !client?.emails?.includes(user.email!.toLowerCase()) ||
        !matches
      )
        throw new Error("Contact does not match");
      const now = new Date().toISOString();
      tx.update(threadRef, {
        customerId: personal.customerId,
        assignedUid:
          data.assignedUid && data.assignedUid !== "unassigned"
            ? data.assignedUid
            : client.ownerUid || "unassigned",
        verifiedClientUid: user.uid,
        personalizationVerifiedAt: now,
        personalizationExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        updatedAt: now,
      });
      tx.update(linkRef, { used: true, redeemedBy: user.uid, redeemedAt: now });
      tx.create(db.collection("auditLogs").doc(), {
        orgId: user.orgId,
        actorUid: user.uid,
        action: "client.channel.personalization.connect",
        collection: "conversations",
        docId: threadRef.id,
        ts: now,
      });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        error:
          "This link expired, was used, or does not match your verified contact. Request a new link in the conversation.",
      },
      { status: 403 },
    );
  }
}
