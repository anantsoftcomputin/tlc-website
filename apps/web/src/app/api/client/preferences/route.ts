import { z } from "zod";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { communicationPreferencesSchema } from "@tlc/shared";
import { getSessionUser } from "@/lib/auth/session";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { clientCustomers } from "@/repositories/firebase/client-portal-repository";
import { getAdminFirestore } from "@/lib/firebase/admin";
export async function PUT(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getSessionUser();
  if (
    !user?.orgId ||
    user.role !== "customer" ||
    !user.emailVerified ||
    !user.email
  )
    return NextResponse.json(
      { error: "Verified client account required." },
      { status: 401 },
    );
  const parsed = communicationPreferencesSchema
    .extend({ customerId: z.string().min(1).max(160).optional() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Please check your preferences." },
      { status: 400 },
    );
  const owned = await clientCustomers(user);
  if (owned.length > 1 && !parsed.data.customerId)
    return NextResponse.json(
      { error: "Choose the traveller whose preferences you want to update." },
      { status: 400 },
    );
  if (
    parsed.data.customerId &&
    !owned.some((customer) => customer.id === parsed.data.customerId)
  )
    return NextResponse.json(
      { error: "Traveller record not found for this account." },
      { status: 403 },
    );
  const customers = parsed.data.customerId
    ? owned.filter((customer) => customer.id === parsed.data.customerId)
    : owned;
  const { customerId: _selected, ...preferences } = parsed.data;
  void _selected;
  const db = getAdminFirestore();
  const refs = customers.length
    ? customers.map((doc) => doc.ref)
    : [
        db
          .collection("customers")
          .doc(
            `portal-${createHash("sha256").update(`${user.orgId}:${user.email.toLowerCase()}`).digest("hex").slice(0, 40)}`,
          ),
      ];
  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const rows = await Promise.all(refs.map((ref) => tx.get(ref)));
    rows.forEach((row, i) => {
      if (
        row.exists &&
        (row.data()?.orgId !== user.orgId ||
          !row.data()?.emails?.includes(user.email!.toLowerCase()))
      )
        throw new Error("Client record changed. Please reload.");
      const data = preferences;
      const whatsapp =
        data.whatsappOffers &&
        Boolean(row.data()?.phones?.length) &&
        data.frequency !== "never";
      const email = data.emailOffers && data.frequency !== "never";
      tx.set(
        refs[i],
        {
          ...(!row.exists
            ? {
                id: refs[i].id,
                orgId: user.orgId,
                name: user.name || "Traveller",
                source: "client-portal",
                tags: ["client-portal"],
                segments: [],
                lifecycleStage: "new",
                mergedFrom: [],
                emails: [user.email!.toLowerCase()],
                phones: [],
                ownerUid: "unassigned",
                modelTrainingAllowed: false,
                createdAt: now,
                createdBy: user.uid,
              }
            : {}),
          verifiedClientUid: user.uid,
          verifiedEmail: user.email!.toLowerCase(),
          identityVerifiedAt: now,
          communicationPreferencesConfirmedAt: now,
          communicationPreferences: {
            ...data,
            emailOffers: email,
            whatsappOffers: whatsapp,
          },
          consent: {
            email,
            whatsapp,
            sms: row.data()?.consent?.sms || false,
            timestamp: now,
            source: "verified-client-preferences",
          },
          marketingOptOuts: { email: !email, whatsapp: !whatsapp },
          consentUpdatedAt: now,
          consentSource: "verified-client-preferences",
          updatedAt: now,
          updatedBy: user.uid,
        },
        { merge: true },
      );
    });
    tx.create(db.collection("auditLogs").doc(), {
      orgId: user.orgId,
      actorUid: user.uid,
      action: "client.preferences.update",
      ts: now,
      customerIds: refs.map((ref) => ref.id),
    });
  });
  return NextResponse.json({ ok: true });
}
