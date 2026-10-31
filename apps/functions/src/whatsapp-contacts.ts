import {
  FieldValue,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

export const canonicalWhatsAppPhones = (phones: unknown): string[] =>
  Array.isArray(phones)
    ? [
        ...new Set(
          phones
            .filter((phone): phone is string => typeof phone === "string")
            .map((phone) => phone.replace(/\D/g, ""))
            .filter((phone) => /^\d{8,15}$/.test(phone)),
        ),
      ]
    : [];

/** Legacy CRM numbers can contain spaces/brackets. A bounded first-contact scan avoids registering them twice. */
export async function legacyWhatsAppMatches(
  db: Firestore,
  orgId: string,
  address: string,
  collectAll = false,
) {
  const found: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  for (let page = 0; page < 20; page++) {
    const base = db
      .collection("customers")
      .where("orgId", "==", orgId)
      .orderBy("__name__")
      .limit(250);
    const result = await (cursor ? base.startAfter(cursor) : base).get();
    for (const doc of result.docs) {
      if (canonicalWhatsAppPhones(doc.data().phones).includes(address))
        found.push(doc);
      if (!collectAll && found.length >= 2)
        return { docs: found, size: found.length, incomplete: false };
    }
    if (result.size < 250)
      return { docs: found, size: found.length, incomplete: false };
    cursor = result.docs.at(-1);
  }
  // Do not create or choose a profile if uniqueness could not be established.
  return { docs: found, size: found.length, incomplete: true };
}

export const normalizeCustomerWhatsAppPhones = onDocumentWritten(
  { region: "asia-south1", document: "customers/{customerId}", retry: true },
  async (event) => {
    if (!event.data?.after.exists) return;
    const ref = event.data.after.ref;
    await ref.firestore.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      const aliases = canonicalWhatsAppPhones(current?.phones)
        .map((phone) => `+${phone}`)
        .filter((phone) => !current?.phones?.includes(phone));
      if (aliases.length)
        tx.update(ref, { phones: FieldValue.arrayUnion(...aliases) });
    });
  },
);
