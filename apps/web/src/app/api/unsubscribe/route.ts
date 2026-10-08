import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
// A random capability token authorizes only opting out. POST supports RFC 8058; GET never changes consent.
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    return NextResponse.json(
      { error: "Invalid unsubscribe link." },
      { status: 400 },
    );
  const db = getAdminFirestore();
  const ref = db
    .collection("marketingUnsubscribes")
    .doc(createHash("sha256").update(token).digest("hex"));
  const found = await db.runTransaction(async (tx) => {
    const record = (await tx.get(ref)).data();
    if (!record) return false;
    const customer = db.collection("customers").doc(record.customerId);
    const data = (await tx.get(customer)).data();
    if (!data || data.orgId !== record.orgId) return false;
    tx.update(customer, {
      "consent.email": false,
      "marketingOptOuts.email": true,
      "communicationPreferences.emailOffers": false,
      updatedAt: new Date().toISOString(),
      updatedBy: "email-unsubscribe",
    });
    tx.set(ref, { usedAt: new Date().toISOString() }, { merge: true });
    return true;
  });
  return NextResponse.json(
    found
      ? { ok: true }
      : { error: "This link is unavailable. Contact TLC to unsubscribe." },
    {
      status: found ? 200 : 404,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
