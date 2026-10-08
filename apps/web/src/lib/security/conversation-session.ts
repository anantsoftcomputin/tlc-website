import "server-only";
import { getSessionUser } from "@/lib/auth/session";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  getAdminFirestore,
  isFirebaseAdminConfigured,
} from "@/lib/firebase/admin";
export const conversationCookie = "tlc_concierge";
const orgId = process.env.TLC_ORG_ID || "tlc-vacations";
export function sessionCookie(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${conversationCookie}=`))
    ?.slice(conversationCookie.length + 1);
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function conversationSession(request: Request, id: string) {
  const cookie = sessionCookie(request);
  if (!cookie || cookie.split(".")[0] !== id)
    throw new Error("Conversation access denied.");
  if (!isFirebaseAdminConfigured) return { id, orgId, status: "bot" };
  const data = (
    await getAdminFirestore().collection("conversations").doc(id).get()
  ).data();
  const expected = String(data?.sessionHash || "");
  const actual = hash(cookie);
  if (
    !data ||
    data.orgId !== orgId ||
    expected.length !== actual.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual)) ||
    Date.parse(String(data.expiresAt)) <= Date.now()
  )
    throw new Error("Conversation access denied.");
  if (data.clientUid) {
    const user = await getSessionUser();
    if (!user || user.uid !== data.clientUid || user.orgId !== orgId)
      throw new Error("Sign in to continue this conversation.");
  }
  return data;
}
export async function createConversationSession(request: Request) {
  const user = await getSessionUser();
  const clientUid =
    user?.role === "customer" && user.emailVerified && user.orgId === orgId
      ? user.uid
      : undefined;
  const current = sessionCookie(request);
  if (current) {
    try {
      const data = await conversationSession(request, current.split(".")[0]);
      if (
        clientUid &&
        isFirebaseAdminConfigured &&
        !("clientUid" in data && data.clientUid)
      ) {
        const ref = getAdminFirestore()
          .collection("conversations")
          .doc(String(data.id));
        await getAdminFirestore().runTransaction(async (tx) => {
          const prior = (await tx.get(ref)).data();
          if (prior?.orgId === orgId && !prior.clientUid)
            tx.update(ref, { clientUid });
        });
      }
      return { id: String(data.id), cookie: current };
    } catch {
      /* Start a new, private conversation. */
    }
  }
  const id = randomUUID();
  const cookie = `${id}.${randomBytes(32).toString("hex")}`;
  const now = new Date().toISOString();
  if (isFirebaseAdminConfigured)
    await getAdminFirestore()
      .collection("conversations")
      .doc(id)
      .create({
        id,
        orgId,
        status: "bot",
        channel: "web",
        mode: "text",
        sessionHash: hash(cookie),
        ...(clientUid ? { clientUid } : {}),
        createdAt: now,
        updatedAt: now,
        createdBy: "public-concierge",
        updatedBy: "public-concierge",
        expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
      });
  return { id, cookie };
}
