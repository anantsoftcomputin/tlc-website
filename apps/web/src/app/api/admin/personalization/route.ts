import { z } from "zod";
import { NextResponse } from "next/server";
import { pricingPolicySchema, planningRateSchema } from "@tlc/shared";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { getAdminFirestore } from "@/lib/firebase/admin";
const schema = z
  .object({
    pricing: pricingPolicySchema,
    rates: z.array(planningRateSchema).max(100),
  })
  .refine(
    (value) =>
      new Set(value.rates.map((rate) => rate.id)).size === value.rates.length,
    "Rate references must be unique.",
  );
export async function PUT(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getSessionUser();
  if (!user || !hasPermission(user.role, "personalization:manage"))
    return NextResponse.json(
      { error: "Manager access required." },
      { status: 403 },
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  const db = getAdminFirestore();
  const now = new Date().toISOString();
  try {
    await db.runTransaction(async (tx) => {
      const orgRef = db.collection("orgs").doc(user.orgId);
      const org = await tx.get(orgRef);
      if (!org.exists) throw new Error("Organization not found.");
      const existing = await tx.get(
        db.collection("planningRates").where("orgId", "==", user.orgId),
      );
      const refs = parsed.data.rates.map((rate) =>
        db.collection("planningRates").doc(rate.id),
      );
      const records = await Promise.all(refs.map((ref) => tx.get(ref)));
      if (
        records.some(
          (record) => record.exists && record.data()?.orgId !== user.orgId,
        )
      )
        throw new Error(
          "A rate reference belongs to another organization. Choose a unique reference.",
        );
      tx.update(orgRef, {
        "settings.personalization.pricing": parsed.data.pricing,
        updatedAt: now,
        updatedBy: user.uid,
      });
      parsed.data.rates.forEach((rate, index) =>
        tx.set(refs[index], {
          ...rate,
          orgId: user.orgId,
          createdAt: records[index].data()?.createdAt || now,
          createdBy: records[index].data()?.createdBy || user.uid,
          updatedAt: now,
          updatedBy: user.uid,
        }),
      );
      for (const doc of existing.docs)
        if (!parsed.data.rates.some((rate) => rate.id === doc.id))
          tx.update(doc.ref, {
            status: "paused",
            updatedAt: now,
            updatedBy: user.uid,
          });
      tx.create(db.collection("auditLogs").doc(), {
        orgId: user.orgId,
        actorUid: user.uid,
        action: "personalization.pricing.update",
        collection: "orgs",
        docId: user.orgId,
        before: org.data()?.settings?.personalization?.pricing || null,
        after: parsed.data.pricing,
        rateIds: parsed.data.rates.map((rate) => rate.id),
        ts: now,
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save rates.",
      },
      { status: 400 },
    );
  }
}
