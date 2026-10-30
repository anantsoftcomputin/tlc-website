import { NextResponse } from "next/server";
import { tripFeedbackSchema } from "@tlc/shared";
import { getSessionUser } from "@/lib/auth/session";
import { clientCustomers } from "@/repositories/firebase/client-portal-repository";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumePublicRateLimit } from "@/lib/security/public-request";
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.role !== "customer" || !user.emailVerified)
    return NextResponse.json(
      { error: "Verified client account required." },
      { status: 401 },
    );
  const parsed = tripFeedbackSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  if (
    !(await consumePublicRateLimit(`trip-feedback:${user.uid}`, 20, 3600000))
      .allowed
  )
    return NextResponse.json(
      { error: "Please wait before updating feedback again." },
      { status: 429 },
    );
  const owned = await clientCustomers(user);
  const db = getAdminFirestore();
  try {
    await db.runTransaction(async (tx) => {
      const bookingRef = db.collection("bookings").doc(parsed.data.bookingId);
      const booking = (await tx.get(bookingRef)).data();
      if (
        !booking ||
        booking.orgId !== user.orgId ||
        booking.status !== "completed" ||
        !owned.some((doc) => doc.id === booking.customerId)
      )
        throw new Error("not-found");
      const customerRef = db.collection("customers").doc(booking.customerId);
      const customer = (await tx.get(customerRef)).data();
      if (
        customer?.orgId !== user.orgId ||
        !customer.emails?.includes(user.email!.toLowerCase())
      )
        throw new Error("not-found");
      const feedbackRef = bookingRef.collection("feedback").doc(user.uid);
      const prior = (await tx.get(feedbackRef)).data();
      const event = customerRef
        .collection("events")
        .doc(`feedback-${user.uid}-${parsed.data.requestId}`);
      if ((await tx.get(event)).exists) return;
      const counts = { ...(customer.feedbackInterestCounts || {}) };
      for (const [field, delta] of [
        ["liked", 1],
        ["disliked", -1],
      ] as const) {
        for (const interest of prior?.[field] || []) {
          counts[interest] = {
            positive: counts[interest]?.positive || 0,
            negative: counts[interest]?.negative || 0,
          };
          counts[interest][delta === 1 ? "positive" : "negative"] = Math.max(
            0,
            counts[interest][delta === 1 ? "positive" : "negative"] - 1,
          );
        }
        for (const interest of parsed.data[field]) {
          counts[interest] = {
            positive: counts[interest]?.positive || 0,
            negative: counts[interest]?.negative || 0,
          };
          counts[interest][delta === 1 ? "positive" : "negative"]++;
        }
      }
      const affinities = Object.fromEntries(
        Object.entries(counts).map(([interest, value]) => {
          const count = value as { positive: number; negative: number };
          return [
            interest,
            (count.positive - count.negative) /
              Math.max(1, count.positive + count.negative),
          ];
        }),
      );
      const now = new Date().toISOString();
      const audit = { orgId: user.orgId, updatedAt: now, updatedBy: user.uid };
      tx.set(feedbackRef, {
        ...parsed.data,
        ...audit,
        clientUid: user.uid,
        createdAt: prior?.createdAt || now,
      });
      tx.update(customerRef, {
        ...audit,
        feedbackInterestCounts: counts,
        feedbackAffinities: affinities,
        lastFeedbackAt: now,
      });
      tx.create(event, {
        ...audit,
        id: event.id,
        type: "tripFeedback",
        channel: "website",
        ts: now,
        createdAt: now,
        createdBy: user.uid,
        payload: {
          bookingId: bookingRef.id,
          rating: parsed.data.rating,
          liked: parsed.data.liked,
          disliked: parsed.data.disliked,
        },
        modelTrainingAllowed: false,
      });
      tx.create(db.collection("auditLogs").doc(), {
        ...audit,
        actorUid: user.uid,
        action: "client.trip.feedback",
        collection: "bookings",
        docId: bookingRef.id,
        ts: now,
      });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Completed trip not found for this account." },
      { status: 404 },
    );
  }
}
