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
    sessionId: string; page: string; message: string;
    response?: AssistantResponseEnvelope & { persona: { name: string; tagline: string }; telemetry?: { provider: string; failed: boolean; inputTokens: number; outputTokens: number; cost: number | null; groundingIssues: string[] } };
    latencyMs: number;
  }) {
    if (!isFirebaseAdminConfigured) return Boolean(input.response);
    const database=getAdminFirestore(); const ref=database.collection("conversations").doc(input.sessionId);
    return database.runTransaction(async transaction=>{
      const snapshot=await transaction.get(ref);const current=snapshot.data();
      if(!current || current.orgId!==ORG_ID)throw new Error("Conversation not found.");
      const accepted=current.status === "bot" && Boolean(input.response);
      const response=accepted ? input.response : undefined;
      const now=new Date().toISOString();
      const audit={orgId:ORG_ID,createdAt:now,updatedAt:now,createdBy:"public-concierge",updatedBy:"public-concierge"};
      const inbound=ref.collection("messages").doc();
      transaction.create(inbound,{id:inbound.id,...audit,conversationId:ref.id,direction:"inbound",from:{id:ref.id,type:"customer"},body:input.message,inputMode:"text",media:[],deliveryStatus:"read",aiGenerated:false,toolCalls:[],sentAt:now});
      transaction.set(ref,{updatedAt:now,updatedBy:"public-concierge",lastMessageAt:now,summary:input.message.slice(0,1000),landingPage:input.page,turnCount:FieldValue.increment(1),
        status:response ? (response.handover.required ? "human" : "bot") : current.status === "closed" ? "human" : current.status,
        ...(response ? {personaSnapshot:response.persona,assistantTurns:FieldValue.increment(1),latencyMsTotal:FieldValue.increment(input.latencyMs),groundingFailures:FieldValue.increment(response.telemetry?.groundingIssues.length || 0),handoverCount:FieldValue.increment(response.handover.required?1:0),...(response.preferenceUpdates.length?{pendingPreferenceUpdates:FieldValue.arrayUnion(...response.preferenceUpdates)}:{})}:{}),
      },{merge:true});
      if(response){
        const out=ref.collection("messages").doc();
        const {telemetry,...experience}=response; void telemetry;
        transaction.create(out,{id:out.id,...audit,conversationId:ref.id,direction:"outbound",from:{id:"tara",type:"bot"},body:response.message,inputMode:"text",media:[],deliveryStatus:"sent",aiGenerated:true,toolCalls:[],experience,sentAt:now});
      }
      // Count a provider call even when staff took over while it was in flight.
      if(input.response){const telemetry=input.response.telemetry;const provider=telemetry?.provider||"deterministic-fallback";
        const usage=database.collection("usage").doc(`${ORG_ID}-llm-${provider}-${now.slice(0,7)}`);
        transaction.set(usage,{id:usage.id,orgId:ORG_ID,month:now.slice(0,7),provider,domain:"llm",calls:FieldValue.increment(1),successfulCalls:FieldValue.increment(telemetry?.failed?0:1),failedCalls:FieldValue.increment(telemetry?.failed?1:0),inputTokens:FieldValue.increment(telemetry?.inputTokens||0),outputTokens:FieldValue.increment(telemetry?.outputTokens||0),unpricedCalls:FieldValue.increment(telemetry?.cost===null?1:0),cost:FieldValue.increment(telemetry?.cost||0),currency:"INR",latencyMsTotal:FieldValue.increment(input.latencyMs),updatedAt:now,updatedBy:"public-concierge"},{merge:true});
      }
      return accepted;
    });
  }

}
