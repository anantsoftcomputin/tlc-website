import { getAdminFirestore } from "@/lib/firebase/admin";
import { personalClientContext } from "@/lib/personalization/client-context";
import {
  currentPersonalTrip,
  planPersonalTrip,
} from "@/lib/personalization/advisor";
import { randomUUID } from "node:crypto";
import { conversationSession } from "@/lib/security/conversation-session";
import { NextResponse } from "next/server";
import { answerConcierge } from "@/lib/ai/concierge-engine";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import {
  consumePublicRateLimit as consumeRateLimit,
  checkPublicRequest,
} from "@/lib/security/public-request";
import { conciergeChatRequestSchema } from "@/lib/validation/concierge";
import { FirestoreConciergeRepository } from "@/repositories/firebase/firestore-concierge-repository";

const repository = new FirestoreConciergeRepository();

export async function POST(request: Request) {
  const denied = await checkPublicRequest(request);
  if (denied) return denied;
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Untrusted request origin." },
      { status: 403 },
    );
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const limit = await consumeRateLimit(
    `concierge:${forwardedFor || "unknown"}`,
    30,
    10 * 60 * 1000,
  );
  if (!limit.allowed)
    return NextResponse.json(
      {
        error:
          "Tara is receiving many messages. Please wait a moment and try again.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  try {
    const parsed = conciergeChatRequestSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Please send a shorter message." },
        { status: 400 },
      );
    const startedAt = Date.now();
    const session = await conversationSession(
      request,
      parsed.data.sessionId,
    ).catch(() => null);
    if (!session)
      return NextResponse.json(
        { error: "Conversation access denied. Sign in again if needed." },
        { status: 403 },
      );
    const personal = await personalClientContext(parsed.data.customerId);
    if (parsed.data.customerId && !personal)
      return NextResponse.json(
        {
          error: "Choose your own traveller record and enable personalisation.",
        },
        { status: 403 },
      );
    if (personal)
      await getAdminFirestore().runTransaction(async (tx) => {
        const ref = getAdminFirestore()
          .collection("conversations")
          .doc(parsed.data.sessionId);
        const prior = (await tx.get(ref)).data();
        if (
          !prior ||
          prior.orgId !== personal.user.orgId ||
          (prior.clientUid && prior.clientUid !== personal.user.uid)
        )
          throw new Error("Conversation identity changed.");
        tx.update(ref, {
          clientUid: personal.user.uid,
          hasUsedPersonalization: true,
          customerId: personal.customerId,
          assignedUid: prior.assignedUid || "unassigned",
        });
      });
    let trip = personal ? await currentPersonalTrip(personal) : null;
    if (parsed.data.refreshInventory) {
      if (!personal || !trip)
        return NextResponse.json(
          { error: "Confirm your trip in your personal travel advisor first." },
          { status: 400 },
        );
      if (
        !(
          await consumeRateLimit(
            `personal-trip:${personal.user.uid}`,
            6,
            600000,
          )
        ).allowed
      )
        return NextResponse.json(
          { error: "Please wait before refreshing availability." },
          { status: 429 },
        );
      trip = await planPersonalTrip(
        { ...trip.trip, requestId: randomUUID() },
        personal,
      );
    }
    const safeTrip = trip
      ? {
          brief: trip.trip.brief,
          includedServices: trip.trip.includedServices,
          recommendations: trip.recommendations.map(
            (item: {
              budget: { expiresAt?: string };
              [key: string]: unknown;
            }) =>
              item.budget.expiresAt &&
              Date.parse(item.budget.expiresAt) > Date.now()
                ? item
                : {
                    budget: {
                      status: "incomplete",
                      missing: [
                        "Refresh availability to obtain a current price.",
                      ],
                    },
                  },
          ),
        }
      : null;
    const response =
      session.status === "bot"
        ? await answerConcierge(
            !personal && session.hasUsedPersonalization
              ? { ...parsed.data, history: [] }
              : parsed.data,
            personal,
            safeTrip,
          )
        : undefined;
    if (response && personal && trip && parsed.data.refreshInventory) {
      const best = trip.recommendations[0]?.budget;
      const current =
        best?.status === "complete" &&
        best.expiresAt &&
        Date.parse(best.expiresAt) > Date.now();
      response.message += current
        ? `\n\nYour current itemised estimate is INR ${best.total!.toFixed(2)} for the confirmed services. ${best.withinBudget ? "It fits your confirmed budget." : "It exceeds your confirmed budget."} See your personal advisor for the breakdown and exclusions; nothing has been reserved.`
        : `\n\nThis trip still needs complete pricing: ${best?.missing.join(" ") || "Refresh current supplier evidence."} I cannot call it within budget yet.`;
    }
    const accepted = await repository.recordTurn({
      sessionId: parsed.data.sessionId,
      page: parsed.data.page,
      message: parsed.data.message,
      response,
      latencyMs: Date.now() - startedAt,
    });
    if (!accepted || !response)
      return NextResponse.json({
        status: "human",
        message: "Your message is with the TLC team.",
        cards: [],
        followUpQuestions: [],
        preferenceUpdates: [],
        handover: { required: false },
      });
    const { telemetry: _telemetry, ...publicResponse } = response;
    void _telemetry;
    return NextResponse.json(publicResponse, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "Concierge request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      {
        error:
          "I couldn’t complete that thought. Please try again or ask for a TLC expert.",
      },
      { status: 500 },
    );
  }
}
