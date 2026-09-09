import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { getAdminUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { buildStaffAssist } from "@/lib/ai/staff-assist";

const requestSchema = z.object({ leadId: z.string().trim().min(1).max(128) });
const managers = new Set(["super_admin", "owner", "manager", "admin"]);

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await getAdminUser();
  if (!user?.orgId || !hasPermission(user.role, "crm:write"))
    return NextResponse.json({ error: "CRM write access is required." }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "A valid lead is required." }, { status: 400 });
  const database = getAdminFirestore();
  const leadRef = database.collection("leads").doc(parsed.data.leadId);
  const [leadSnapshot, tripSnapshot] = await Promise.all([
    leadRef.get(),
    database.collection("trips").where("status", "==", "published").limit(250).get(),
  ]);
  const lead = leadSnapshot.data();
  if (
    !leadSnapshot.exists ||
    lead?.orgId !== user.orgId ||
    (!managers.has(user.role) && lead?.assignedUid !== user.uid)
  )
    return NextResponse.json({ error: "Lead was not found." }, { status: 404 });
  const suggestions = buildStaffAssist(
    { requirement: lead.requirement, priority: lead.priority || "normal" },
    tripSnapshot.docs
      .filter((item) => item.data().orgId === user.orgId)
      .map((item) => ({
        id: item.id,
        title: String(item.data().title || "TLC trip"),
        destinationSlugs: item.data().destinationSlug
          ? [String(item.data().destinationSlug)]
          : [],
        styleSlugs: [
          ...(Array.isArray(item.data().styles) ? item.data().styles.map(String) : []),
          ...(Array.isArray(item.data().categorySlugs) ? item.data().categorySlugs.map(String) : []),
        ],
      })),
  );
  const now = new Date().toISOString();
  const batch = database.batch();
  batch.update(leadRef, { aiSuggestions: suggestions, updatedAt: now, updatedBy: user.uid });
  const auditRef = database.collection("auditLogs").doc();
  batch.create(auditRef, {
    id: auditRef.id,
    orgId: user.orgId,
    actorUid: user.uid,
    action: "lead.ai_assist.generate",
    collection: "leads",
    docId: leadRef.id,
    before: null,
    after: { packageIds: suggestions.packages, generatedAt: suggestions.generatedAt },
    ts: now,
    createdAt: now,
    updatedAt: now,
    createdBy: user.uid,
    updatedBy: user.uid,
  });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
