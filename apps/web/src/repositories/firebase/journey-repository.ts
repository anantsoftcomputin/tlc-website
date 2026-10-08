import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import {
  journeyPlanSchema,
  publicJourney,
  type JourneyPlan,
  type JourneyRecord,
  type JourneySelection,
  type JourneySnapshot,
} from "@tlc/shared";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { conversationSession } from "@/lib/security/conversation-session";

const orgId = process.env.TLC_ORG_ID || "tlc-vacations";
export class JourneyConflict extends Error {}
export class JourneyAccessError extends Error {}
const collection = () => getAdminFirestore().collection("journeyPlans");
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function owned(
  data: FirebaseFirestore.DocumentData | undefined,
  sessionId: string,
) {
  if (
    !data ||
    data.orgId !== orgId ||
    data.sessionId !== sessionId ||
    Date.parse(data.expiresAt) <= Date.now()
  )
    throw new JourneyAccessError(
      "This trip is unavailable in this browser session.",
    );
  return data;
}
function project(data: FirebaseFirestore.DocumentData): JourneyRecord {
  return {
    id: data.id,
    revision: data.revision,
    updatedAt: data.updatedAt,
    plan: journeyPlanSchema.parse(data.plan),
    messages: data.messages || [],
    ...(data.shareToken ? { shareToken: data.shareToken } : {}),
  };
}
export async function readJourney(id: string, sessionId: string) {
  return project(owned((await collection().doc(id).get()).data(), sessionId));
}
export async function listJourneys(sessionId: string) {
  const result = await collection()
    .where("sessionId", "==", sessionId)
    .limit(50)
    .get();
  return result.docs
    .filter(
      (doc) =>
        doc.data().orgId === orgId &&
        Date.parse(doc.data().expiresAt) > Date.now(),
    )
    .map((doc) => project(doc.data()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveJourney(input: {
  id: string;
  sessionId: string;
  revision: number;
  requestId: string;
  plan: JourneyPlan;
  messages: JourneyRecord["messages"];
}) {
  const ref = collection().doc(input.id);
  return getAdminFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists
      ? owned(snapshot.data(), input.sessionId)
      : undefined;
    if (current?.lastRequestId === input.requestId) return project(current);
    if ((current?.revision || 0) !== input.revision)
      throw new JourneyConflict(
        "This trip changed in another tab. Reload it before editing.",
      );
    const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
    const data = json({
      id: input.id,
      orgId,
      sessionId: input.sessionId,
      revision: input.revision + 1,
      plan: input.plan,
      messages: input.messages.slice(-24),
      lastRequestId: input.requestId,
      updatedAt: new Date().toISOString(),
      expiresAt,
      ...(current?.shareToken ? { shareToken: current.shareToken } : {}),
    });
    transaction.set(ref, {
      ...data,
      deleteAfter: Timestamp.fromMillis(Date.parse(expiresAt)),
    });
    return project(data);
  });
}
export async function shareJourney(
  id: string,
  sessionId: string,
  revision: number,
  remove = false,
) {
  const ref = collection().doc(id);
  return getAdminFirestore().runTransaction(async (transaction) => {
    const data = owned((await transaction.get(ref)).data(), sessionId);
    if (data.revision !== revision)
      throw new JourneyConflict("Reload the latest trip before sharing.");
    const token = data.shareToken || randomBytes(24).toString("hex");
    const shareRef = getAdminFirestore()
      .collection("journeyShares")
      .doc(createHash("sha256").update(token).digest("hex"));
    if (remove) {
      transaction.delete(shareRef);
      transaction.update(ref, { shareToken: null });
      return null;
    }
    transaction.set(shareRef, {
      orgId,
      planId: id,
      revision,
      view: publicJourney(journeyPlanSchema.parse(data.plan)),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      deleteAfter: Timestamp.fromMillis(Date.now() + 30 * 86400000),
    });
    transaction.update(ref, { shareToken: token });
    return token;
  });
}
export async function readSharedJourney(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const data = (
    await getAdminFirestore()
      .collection("journeyShares")
      .doc(createHash("sha256").update(token).digest("hex"))
      .get()
  ).data();
  return data?.orgId === orgId && Date.parse(data.expiresAt) > Date.now()
    ? (data.view as ReturnType<typeof publicJourney>)
    : null;
}
export async function resolveJourney(
  request: Request,
  selection: JourneySelection,
): Promise<JourneySnapshot> {
  await conversationSession(request, selection.sessionId);
  const saved = await readJourney(selection.planId, selection.sessionId);
  if (saved.revision !== selection.revision)
    throw new JourneyConflict(
      "Your itinerary changed. Reload it before requesting a quote.",
    );
  return { planId: saved.id, revision: saved.revision, plan: saved.plan };
}
