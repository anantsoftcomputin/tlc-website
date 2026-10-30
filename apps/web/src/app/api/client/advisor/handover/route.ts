import { z } from "zod";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumePublicRateLimit } from "@/lib/security/public-request";
const schema = z.object({ planId: z.string().regex(/^[a-f0-9]{64}$/) });
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.role !== "customer" || !user.emailVerified)
    return NextResponse.json(
      { error: "Verified client account required." },
      { status: 401 },
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose your saved trip." },
      { status: 400 },
    );
  if (
    !(await consumePublicRateLimit(`advisor-handover:${user.uid}`, 5, 600000))
      .allowed
  )
    return NextResponse.json(
      { error: "Please wait before requesting another review." },
      { status: 429 },
    );
  const db = getAdminFirestore();
  try {
    await db.runTransaction(async (tx) => {
      const plan = (
        await tx.get(db.collection("personalTripPlans").doc(parsed.data.planId))
      ).data();
      if (plan?.orgId !== user.orgId || plan.clientUid !== user.uid)
        throw new Error("not-found");
      const customerRef = db.collection("customers").doc(plan.customerId);
      const customer = (await tx.get(customerRef)).data();
      if (
        customer?.orgId !== user.orgId ||
        !customer.emails?.includes(user.email!.toLowerCase())
      )
        throw new Error("not-found");
      const ref = db
        .collection("supportRequests")
        .doc(`advisor-${parsed.data.planId}`);
      if ((await tx.get(ref)).exists) return;
      const trip = plan.result.trip;
      const best = plan.result.recommendations[0]?.budget;
      const body = [
        `Please review my confirmed ${trip.brief.destinationSlug} trip, ${trip.brief.checkIn} to ${trip.brief.checkOut}.`,
        `Party: ${JSON.stringify(trip.brief.rooms)}. Total budget INR ${trip.brief.budget}. Included services: ${trip.includedServices.join(", ")}.`,
        `Interests: ${trip.brief.interests.join(", ")}. Hotel needs: ${trip.brief.amenities.join(", ")}.`,
        trip.brief.flights
          ? `Flights: ${trip.brief.flights.origin}–${trip.brief.flights.destination}, ${trip.brief.flights.cabinClass}.`
          : "Flights excluded.",
        best
          ? `Recorded estimate: ${best.total == null ? "incomplete" : `INR ${best.total}`}. ${best.lines.map((line: { title: string; amount: number }) => `${line.title}: INR ${line.amount}`).join("; ")}. Still needed: ${best.missing.join("; ") || "Reprice all inventory before quoting"}. Excluded: ${best.exclusions.join(", ")}.`
          : "Complete pricing needed.",
        "This is a consultant review request. Nothing is booked; verify current rates, availability and inclusions before issuing a quote.",
      ].join("\n\n");
      const now = new Date().toISOString();
      const audit = {
        orgId: user.orgId,
        createdAt: now,
        updatedAt: now,
        createdBy: user.uid,
        updatedBy: user.uid,
      };
      tx.create(ref, {
        ...audit,
        id: ref.id,
        clientUid: user.uid,
        customerId: plan.customerId,
        assignedUid: customer.ownerUid || "unassigned",
        subject: `Personal trip review: ${trip.brief.destinationSlug}`,
        body,
        status: "open",
        reply: "",
        personalTripPlanId: parsed.data.planId,
      });
      tx.create(
        customerRef.collection("events").doc(`advisor-${parsed.data.planId}`),
        {
          ...audit,
          id: `advisor-${parsed.data.planId}`,
          type: "enquiry",
          channel: "website",
          ts: now,
          payload: {
            personalTripPlanId: parsed.data.planId,
            supportRequestId: ref.id,
          },
        },
      );
      tx.create(db.collection("auditLogs").doc(), {
        ...audit,
        actorUid: user.uid,
        action: "client.advisor.handover",
        collection: "supportRequests",
        docId: ref.id,
        ts: now,
      });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Saved trip not found for this account." },
      { status: 404 },
    );
  }
}
