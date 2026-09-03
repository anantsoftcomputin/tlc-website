import { requireAdminUser } from "@/lib/auth/session";
import { QuoteBuilder } from "@/components/admin/quote-builder";
import { FirestoreLeadRepository } from "@/repositories/firebase/firestore-lead-repository";
import { FirestoreQuoteRepository } from "@/repositories/firebase/firestore-quote-repository";

const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string; revise?: string }>;
}) {
  const user = await requireAdminUser("quotes:write");
  const canViewAll = managerRoles.has(user.role);
  const params = await searchParams;
  const [leads, revision] = await Promise.all([
    new FirestoreLeadRepository(user.orgId, {
      uid: user.uid,
      canViewAll,
    }).listLeads(),
    params.revise
      ? new FirestoreQuoteRepository(user.orgId || "", {
          uid: user.uid,
          canViewAll,
        }).get(params.revise)
      : Promise.resolve(null),
  ]);
  return (
    <QuoteBuilder
      leads={leads.map((lead) => ({
        id: lead.id,
        title: lead.title,
        customerName: lead.customerName,
      }))}
      initialLeadId={params.leadId || revision?.leadId}
      revision={
        revision
          ? {
              id: revision.id,
              version: revision.version,
              items: revision.items,
            }
          : undefined
      }
    />
  );
}
