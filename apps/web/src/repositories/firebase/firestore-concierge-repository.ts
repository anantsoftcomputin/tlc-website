import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { AssistantResponseEnvelope } from "@tlc/shared";
import {
  getAdminFirestore,
  isFirebaseAdminConfigured,
} from "@/lib/firebase/admin";

const ORG_ID = process.env.TLC_ORG_ID || "tlc-vacations";

export class FirestoreConciergeRepository {
  async recordFeedback(input: { sessionId: string; rating: number }) {
    if (!isFirebaseAdminConfigured) return;
    const ref = getAdminFirestore().collection("conversations").doc(input.sessionId);
    await getAdminFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists || snapshot.data()?.orgId !== ORG_ID)
        throw new Error("Conversation was not found.");
      if (typeof snapshot.data()?.satisfaction === "number") return;
      const now = new Date().toISOString();
      transaction.set(
        ref,
        {
          satisfaction: input.rating,
          satisfactionRecordedAt: now,
          updatedAt: now,
          updatedBy: "public-concierge",
        },
        { merge: true },
      );
    });
  }

  async confirmPreferences(input: {
    sessionId: string;
    updates: Array<{
      path: string;
      value: unknown;
      confidence: number;
      evidenceMessageId: string;
    }>;
  }) {
    if (!isFirebaseAdminConfigured) return;
    const database = getAdminFirestore();
    const conversationRef = database.collection("conversations").doc(input.sessionId);
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(conversationRef);
      if (!snapshot.exists || snapshot.data()?.orgId !== ORG_ID)
        throw new Error("Conversation was not found.");
      const pending = Array.isArray(snapshot.data()?.pendingPreferenceUpdates)
        ? (snapshot.data()!.pendingPreferenceUpdates as Array<Record<string, unknown>>)
        : [];
      const serialized = (value: unknown) => JSON.stringify(value);
      const matched = input.updates.map((item) =>
        pending.find(
          (candidate) =>
            candidate.path === item.path &&
            candidate.evidenceMessageId === item.evidenceMessageId &&
            candidate.confidence === item.confidence &&
            serialized(candidate.value) === serialized(item.value),
        ),
      );
      if (matched.some((item) => !item))
        throw new Error("Preference evidence was not found.");
      const now = new Date().toISOString();
      const confirmed = Object.fromEntries(
        input.updates.map((item) => [
          item.path,
          {
            value: item.value,
            confidence: item.confidence,
            evidenceMessageId: item.evidenceMessageId,
            confirmedAt: now,
          },
        ]),
      );
      transaction.set(
        conversationRef,
        {
          confirmedPreferences: confirmed,
          pendingPreferenceUpdates: FieldValue.arrayRemove(...matched),
          updatedAt: now,
          updatedBy: "public-concierge",
        },
        { merge: true },
      );
      const customerId = snapshot.data()?.customerId;
      if (typeof customerId !== "string" || !customerId) return;
      for (const item of input.updates) {
        const signalRef = database.collection("preferenceSignals").doc();
        transaction.create(signalRef, {
          id: signalRef.id,
          orgId: ORG_ID,
          customerId,
          path: item.path,
          value: item.value,
          origin: "explicit_chat",
          confidence: item.confidence,
          capturedAt: now,
          validFrom: now,
          modelTrainingAllowed: false,
          createdAt: now,
          updatedAt: now,
          createdBy: "public-concierge",
          updatedBy: "public-concierge",
        });
      }
    });
  }

  async recordTurn(input: {
    sessionId: string;
    page: string;
    message: string;
    response: AssistantResponseEnvelope & {
      persona: { name: string; tagline: string };
    };
    latencyMs: number;
  }) {
    if (!isFirebaseAdminConfigured) return;
    const database = getAdminFirestore();
    const conversationRef = database
      .collection("conversations")
      .doc(input.sessionId);
    const inboundRef = conversationRef.collection("messages").doc();
    const outboundRef = conversationRef.collection("messages").doc();
    const now = new Date().toISOString();
    const baseAudit = {
      orgId: ORG_ID,
      createdAt: now,
      updatedAt: now,
      createdBy: "public-concierge",
      updatedBy: "public-concierge",
    };
    const batch = database.batch();
    batch.set(
      conversationRef,
      {
        id: input.sessionId,
        ...baseAudit,
        channel: "web",
        mode: "text",
        participants: [
          {
            id: input.sessionId,
            type: "customer",
            displayName: "Website visitor",
          },
          { id: "tara", type: "bot", displayName: input.response.persona.name },
        ],
        status: input.response.handover.required ? "human" : "bot",
        personaSnapshot: input.response.persona,
        summary: input.message.slice(0, 1000),
        landingPage: input.page,
        lastMessageAt: now,
        expiresAt: new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        turnCount: FieldValue.increment(1),
        latencyMsTotal: FieldValue.increment(input.latencyMs),
        assistantTurns: FieldValue.increment(1),
        groundingFailures: FieldValue.increment(
          input.response.grounding.ungroundedClaims.length,
        ),
        handoverCount: FieldValue.increment(
          input.response.handover.required ? 1 : 0,
        ),
        ...(input.response.preferenceUpdates.length
          ? {
              pendingPreferenceUpdates: FieldValue.arrayUnion(
                ...input.response.preferenceUpdates,
              ),
            }
          : {}),
      },
      { merge: true },
    );
    batch.create(inboundRef, {
      id: inboundRef.id,
      ...baseAudit,
      conversationId: input.sessionId,
      direction: "inbound",
      from: { id: input.sessionId, type: "customer" },
      body: input.message,
      inputMode: "text",
      media: [],
      deliveryStatus: "read",
      aiGenerated: false,
      toolCalls: [],
      sentAt: now,
    });
    batch.create(outboundRef, {
      id: outboundRef.id,
      ...baseAudit,
      conversationId: input.sessionId,
      direction: "outbound",
      from: { id: "tara", type: "bot" },
      body: input.response.message,
      inputMode: "text",
      media: [],
      deliveryStatus: "sent",
      aiGenerated: true,
      reasoning:
        "Response generated from current TLC CMS evidence and the active persona.",
      toolCalls: input.response.grounding.toolResultIds.map((id) => ({
        name: "search_tlc_catalogue",
        input: { query: input.message },
        output: {
          entityIds: input.response.cards.map((card) => card.entityId),
        },
        source: id,
        fetchedAt: now,
      })),
      experience: input.response,
      sentAt: now,
    });
    const month = now.slice(0, 7);
    const usageRef = database.collection("usage").doc(`${ORG_ID}-llm-${month}`);
    batch.set(
      usageRef,
      {
        id: usageRef.id,
        orgId: ORG_ID,
        month,
        provider: process.env.OPENAI_API_KEY ? "openai" : "deterministic-fallback",
        domain: "llm",
        calls: FieldValue.increment(1),
        successfulCalls: FieldValue.increment(1),
        failedCalls: FieldValue.increment(0),
        latencyMsTotal: FieldValue.increment(input.latencyMs),
        cost: FieldValue.increment(0),
        currency: "INR",
        createdAt: now,
        updatedAt: now,
        createdBy: "public-concierge",
        updatedBy: "public-concierge",
      },
      { merge: true },
    );
    await batch.commit();
  }

  async attachHandover(input: {
    sessionId: string;
    customerId: string;
    leadId: string;
    inquiryId: string;
  }) {
    if (!isFirebaseAdminConfigured) return;
    const now = new Date().toISOString();
    await getAdminFirestore()
      .collection("conversations")
      .doc(input.sessionId)
      .set(
        {
          customerId: input.customerId,
          leadId: input.leadId,
          inquiryId: input.inquiryId,
          status: "human",
          handoverAt: now,
          updatedAt: now,
          updatedBy: "public-concierge",
        },
        { merge: true },
      );
  }
}
