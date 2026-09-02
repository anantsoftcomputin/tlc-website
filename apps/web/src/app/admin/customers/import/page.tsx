import { CustomerImportWizard } from "@/components/admin/customer-import-wizard";
import { requireAdminUser } from "@/lib/auth/session";

export default async function CustomerImportPage() {
  await requireAdminUser("users:manage");
  return <><header className="admin-page-head"><div><p className="eyebrow">Guided data migration</p><h1>Import customers</h1><p>Map, validate and resolve duplicates before any customer record changes.</p></div></header><CustomerImportWizard/></>;
}
