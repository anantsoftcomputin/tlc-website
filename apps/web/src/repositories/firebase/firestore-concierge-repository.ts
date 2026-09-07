import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { AssistantResponseEnvelope } from "@tlc/shared";
import {
  getAdminFirestore,
  isFirebaseAdminConfigured,
} from "@/lib/firebase/admin";

const ORG_ID = process.env.TLC_ORG_ID || "tlc-vacations";

export class FirestoreConciergeRepository {
  async recordTurn(input: {
    sessionId: string;
    page: string;
    message: string;
    response: AssistantResponseEnvelope & {
      persona: { name: string; tagline: string };
    };
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
