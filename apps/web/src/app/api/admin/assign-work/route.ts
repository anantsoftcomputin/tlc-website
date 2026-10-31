import { NextResponse } from "next/server";
import { z } from "zod";
import { isManagerRole } from "@tlc/shared";
import { getAdminUser } from "@/lib/auth/session";
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase/admin";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const schema = z.object({
  kind: z.enum(["conversation", "support"]),
  id,
  assignedUid: id,
  expectedUid: id,
  requestId: z.string().uuid(),
});
export async function PATCH(request: Request) {
  const actor = await getAdminUser();
  if (!hasTrustedOrigin(request) || !actor || !isManagerRole(actor.role))
    return NextResponse.json(
      { error: "Manager access required." },
      { status: 403 },
    );
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Choose the work and an eligible staff member." },
      { status: 400 },
    );
  const data = input.data;
  const db = getAdminFirestore();
  try {
    if (data.assignedUid !== "unassigned") {
      const account = await getAdminAuth().getUser(data.assignedUid);
      if (
        account.disabled ||
        account.customClaims?.orgId !== actor.orgId ||
        ![
          "super_admin",
          "owner",
          "manager",
          "admin",
          "sales",
          "travel_consultant",
        ].includes(account.customClaims?.role || "")
      )
        throw new Error("staff");
    }
    await db.runTransaction(async (tx) => {
      const workRef = db
        .collection(
          data.kind === "conversation" ? "conversations" : "supportRequests",
        )
        .doc(data.id);
      const work = (await tx.get(workRef)).data();
      const auditRef = db
        .collection("auditLogs")
        .doc(`dispatch-${data.requestId}`);
      const prior = await tx.get(auditRef);
      if (prior.exists) {
        if (
          prior.data()?.actorUid !== actor.uid ||
          prior.data()?.orgId !== actor.orgId ||
          prior.data()?.docId !== data.id ||
          prior.data()?.after?.assignedUid !== data.assignedUid
        )
          throw new Error("conflict");
        return;
      }
      if (work?.orgId !== actor.orgId) throw new Error("not-found");
      if ((work.assignedUid || "unassigned") !== data.expectedUid)
        throw new Error("conflict");
      const staff =
        data.assignedUid === "unassigned"
          ? null
          : (await tx.get(db.collection("users").doc(data.assignedUid))).data();
      if (
        data.assignedUid !== "unassigned" &&
        (staff?.orgId !== actor.orgId ||
          staff.active === false ||
          staff.disabled === true ||
          ![
            "super_admin",
            "owner",
            "manager",
            "admin",
            "sales",
            "travel_consultant",
          ].includes(staff.role))
      )
        throw new Error("staff");
      const customerRef = work.customerId
        ? db.collection("customers").doc(work.customerId)
        : null;
      const customer = customerRef ? (await tx.get(customerRef)).data() : null;
      if (customerRef && customer?.orgId !== actor.orgId)
        throw new Error("not-found");
      const threadRef =
        data.kind === "conversation"
          ? workRef
          : work.conversationId
            ? db.collection("conversations").doc(work.conversationId)
            : null;
      const thread = threadRef ? (await tx.get(threadRef)).data() : null;
      if (
        threadRef &&
        (thread?.orgId !== actor.orgId ||
          (work.customerId && thread.customerId !== work.customerId))
      )
        throw new Error("not-found");
      const leadRef = thread?.leadId
        ? db.collection("leads").doc(thread.leadId)
        : null;
      const lead = leadRef ? (await tx.get(leadRef)).data() : null;
      if (
        leadRef &&
        (lead?.orgId !== actor.orgId ||
          (work.customerId && lead.customerId !== work.customerId))
      )
        throw new Error("not-found");
      const related = threadRef
        ? await tx.get(
            db
              .collection("supportRequests")
              .where("orgId", "==", actor.orgId)
              .where("conversationId", "==", threadRef.id),
          )
        : null;
      const now = new Date().toISOString();
      const update = {
        assignedUid: data.assignedUid,
        updatedAt: now,
        updatedBy: actor.uid,
      };
      tx.update(workRef, update);
      if (threadRef && threadRef.path !== workRef.path)
        tx.update(threadRef, update);
      if (customerRef)
        tx.update(customerRef, {
          ownerUid: data.assignedUid,
          updatedAt: now,
          updatedBy: actor.uid,
        });
      if (leadRef)
        tx.update(leadRef, { ...update, assignedTo: data.assignedUid });
      for (const row of related?.docs || [])
        if (
          row.ref.path !== workRef.path &&
          ["open", "answered"].includes(row.data().status) &&
          row.data().customerId === work.customerId
        )
          tx.update(row.ref, update);
      tx.create(auditRef, {
        orgId: actor.orgId,
        actorUid: actor.uid,
        action: "work.assign",
        collection: workRef.parent.id,
        docId: data.id,
        before: { assignedUid: work.assignedUid || "unassigned" },
        after: { assignedUid: data.assignedUid },
        ts: now,
      });
      if (data.assignedUid !== "unassigned" && work.customerId)
        tx.set(db.collection("alerts").doc(`assignment-${data.requestId}`), {
          id: `assignment-${data.requestId}`,
          orgId: actor.orgId,
          assignedUid: data.assignedUid,
          severity: "LOW",
          ruleKey: "client_work_assigned",
          entity: { type: "customer", id: work.customerId },
          reasoning:
            "A client conversation or support request is assigned to you. Open your inbox to continue.",
          evidence: [
            {
              label: "Assignment source",
              value: "Client conversation",
              observedAt: now,
            },
          ],
          status: "open",
          dedupeKey: data.requestId,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.uid,
          updatedBy: actor.uid,
        });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const conflict = error instanceof Error && error.message === "conflict";
    return NextResponse.json(
      {
        error: conflict
          ? "This assignment changed. Refresh before assigning again."
          : "Work or eligible staff could not be verified.",
      },
      { status: conflict ? 409 : 403 },
    );
  }
}
