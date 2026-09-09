import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { getAdminUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { hasTrustedOrigin } from "@/lib/security/request-origin";

const actionSchema = z.object({
  id: z.string().trim().min(1).max(128),
  action: z.enum(["takeover", "resume", "close", "reply"]),
  body: z.string().trim().max(20000).optional(),
});
const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);

export async function PATCH(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await getAdminUser();
  if (!user?.orgId || !hasPermission(user.role, "crm:write"))
    return NextResponse.json({ error: "Conversation write access is required." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success || (parsed.data.action === "reply" && !parsed.data.body))
    return NextResponse.json({ error: "The conversation action is invalid." }, { status: 400 });

  const database = getAdminFirestore();
  const ref = database.collection("conversations").doc(parsed.data.id);
  try {
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      if (!snapshot.exists || data?.orgId !== user.orgId)
        throw new Error("not-found");
      if (
        !managerRoles.has(user.role) &&
        data?.assignedUid &&
        data.assignedUid !== user.uid
      )
        throw new Error("forbidden");
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        updatedAt: now,
        updatedBy: user.uid,
      };
      if (parsed.data.action === "takeover")
        Object.assign(updates, { status: "human", assignedUid: user.uid, handoverAt: now });
      if (parsed.data.action === "resume")
        Object.assign(updates, { status: "bot", resumedAt: now, resumedBy: user.uid });
      if (parsed.data.action === "close")
        Object.assign(updates, { status: "closed", closedAt: now, closedBy: user.uid });
      if (parsed.data.action === "reply") {
        Object.assign(updates, { status: "human", assignedUid: user.uid, lastMessageAt: now });
        const messageRef = ref.collection("messages").doc();
        transaction.create(messageRef, {
          id: messageRef.id,
          orgId: user.orgId,
          conversationId: ref.id,
          direction: "outbound",
          from: { id: user.uid, type: "staff" },
          body: parsed.data.body,
          inputMode: "text",
          media: [],
          deliveryStatus: data?.channel === "whatsapp" ? "queued" : "sent",
          aiGenerated: false,
          toolCalls: [],
          sentAt: now,
          createdAt: now,
          updatedAt: now,
          createdBy: user.uid,
          updatedBy: user.uid,
        });
      }
      transaction.set(ref, updates, { merge: true });
      const auditRef = database.collection("auditLogs").doc();
      transaction.create(auditRef, {
        id: auditRef.id,
        orgId: user.orgId,
        actorUid: user.uid,
        action: `conversation.${parsed.data.action}`,
        collection: "conversations",
        docId: ref.id,
        before: { status: data?.status || "bot", assignedUid: data?.assignedUid || null },
        after: { status: updates.status || data?.status, assignedUid: updates.assignedUid || data?.assignedUid },
        ts: now,
        createdAt: now,
        updatedAt: now,
        createdBy: user.uid,
        updatedBy: user.uid,
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    return NextResponse.json(
      { error: reason === "forbidden" ? "This conversation belongs to another consultant." : "Conversation could not be updated." },
      { status: reason === "forbidden" ? 403 : 404 },
    );
  }
}
