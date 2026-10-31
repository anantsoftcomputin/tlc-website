import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumePublicRateLimit } from "@/lib/security/public-request";
const schema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  confirmed: z.literal(true),
});
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (
    !hasTrustedOrigin(request) ||
    !user ||
    user.role !== "customer" ||
    !user.emailVerified ||
    !user.email ||
    user.orgId !== (process.env.TLC_ORG_ID || "tlc-vacations")
  )
    return NextResponse.json(
      { error: "Verified client access required." },
      { status: 403 },
    );
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Confirm the connection details." },
      { status: 400 },
    );
  if (
    !(await consumePublicRateLimit(`wa-link:${user.uid}`, 10, 3600000)).allowed
  )
    return NextResponse.json(
      { error: "Please wait before trying again." },
      { status: 429 },
    );
  const db = getAdminFirestore();
  const tokenId = createHash("sha256").update(input.data.token).digest("hex");
  try {
    await db.runTransaction(async (tx) => {
      const linkRef = db.collection("whatsappAccountLinks").doc(tokenId);
      const link = (await tx.get(linkRef)).data();
      if (!link || link.orgId !== user.orgId) throw new Error("invalid");
      const customerRef = db.collection("customers").doc(link.customerId);
      const customer = (await tx.get(customerRef)).data();
      if (
        customer?.orgId !== user.orgId ||
        customer.whatsappRegistrationStatus !== "registered" ||
        !customer.phones?.some(
          (phone: string) => phone.replace(/\D/g, "") === link.address,
        )
      )
        throw new Error("invalid");
      if (link.used) {
        if (
          link.redeemedBy === user.uid &&
          customer.verifiedClientUid === user.uid
        )
          return;
        throw new Error("invalid");
      }
      if (
        !(Date.parse(link.expiresAt) > Date.now()) ||
        (customer.verifiedClientUid && customer.verifiedClientUid !== user.uid)
      )
        throw new Error("invalid");
      const thread = (
        await tx.get(db.collection("conversations").doc(link.conversationId))
      ).data();
      if (
        thread?.orgId !== user.orgId ||
        thread.customerId !== link.customerId ||
        thread.channel !== "whatsapp" ||
        thread.whatsappAddress !== link.address ||
        thread.whatsappIdentityAmbiguous ||
        !(Date.parse(thread.whatsappVerifiedUntil || "") > Date.now())
      )
        throw new Error("invalid");
      const waActor = `wa-${createHash("sha256").update(`${user.orgId}:${customerRef.id}`).digest("hex").slice(0, 40)}`;
      const requests = await tx.get(
        db
          .collection("supportRequests")
          .where("orgId", "==", user.orgId)
          .where("customerId", "==", customerRef.id)
          .where("clientUid", "==", waActor),
      );
      const now = new Date().toISOString();
      const email = user.email!.toLowerCase();
      tx.update(customerRef, {
        emails: [...new Set([...(customer.emails || []), email])],
        verifiedClientUid: user.uid,
        verifiedEmail: email,
        identityVerifiedAt: now,
        updatedAt: now,
        updatedBy: user.uid,
      });
      tx.update(linkRef, { used: true, redeemedBy: user.uid, redeemedAt: now });
      for (const doc of requests.docs)
        tx.update(doc.ref, {
          clientUid: user.uid,
          originalClientUid: waActor,
          updatedAt: now,
          updatedBy: user.uid,
        });
      tx.create(db.collection("auditLogs").doc(), {
        orgId: user.orgId,
        actorUid: user.uid,
        action: "client.whatsapp.account.link",
        collection: "customers",
        docId: customerRef.id,
        ts: now,
      });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        error:
          "This link expired, belongs to another account, or its contact changed. Request a new link in WhatsApp or ask TLC to review your account.",
      },
      { status: 403 },
    );
  }
}
