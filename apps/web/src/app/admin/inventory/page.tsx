import type { Metadata } from "next";
import { InventorySearch } from "@/components/admin/inventory-search";
import { requireAdminUser } from "@/lib/auth/session";
import { isManagerRole } from "@tlc/shared";
import { notFound } from "next/navigation";
import { FirestoreLeadRepository } from "@/repositories/firebase/firestore-lead-repository";
import { VacationShortlistPanel } from "@/components/admin/vacation-shortlist-panel";

export const metadata: Metadata = { title: "Live inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ leadId?: string }> }) {
  const user = await requireAdminUser("quotes:write");
  const { leadId } = await searchParams;
  const detail = leadId ? await new FirestoreLeadRepository(user.orgId, { uid: user.uid, canViewAll: isManagerRole(user.role) }).getLead(leadId) : null;
  if (leadId && !detail) notFound();
  const shortlist = detail?.lead.requirement.vacationShortlist;
  return <>{shortlist && <VacationShortlistPanel shortlist={shortlist} leadId={leadId!} />}<InventorySearch initialBrief={shortlist?.brief} initialLeadId={leadId} /></>;
}
