import { Inbox } from "lucide-react";
import { InquiryTable } from "@/components/admin/inquiry-table";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreAdminRepository } from "@/repositories/firebase/firestore-admin-repository";
import { hasPermission } from "@/lib/auth/roles";

export default async function AdminInquiriesPage() {
  const user = await requireAdminUser("crm:read"); const canViewAll = ["super_admin", "owner", "manager", "admin"].includes(user.role); const inquiries = await new FirestoreAdminRepository(user.orgId, { uid: user.uid, canViewAll }).listInquiries(100);
  return <><header className="admin-page-head"><div><p className="eyebrow">Lead intake</p><h1>Inquiry inbox</h1><p>Every website brief, in one place and ready for qualification.</p></div><span className="admin-count"><Inbox/>{inquiries.length} shown</span></header><section className="admin-panel admin-panel-flat"><InquiryTable inquiries={inquiries} canConvert={hasPermission(user.role, "crm:write")}/></section></>;
}
