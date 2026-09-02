import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { NewLeadForm } from "@/components/admin/new-lead-form";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreLeadRepository } from "@/repositories/firebase/firestore-lead-repository";

export default async function NewLeadPage() { const user = await requireAdminUser("crm:write"); const canAssign = ["super_admin", "owner", "manager", "admin"].includes(user.role); const team = canAssign ? await new FirestoreLeadRepository(user.orgId, { uid: user.uid, canViewAll: true }).listAssignees() : []; return <><Link className="admin-back" href="/admin/crm"><ArrowLeft/>Lead pipeline</Link><header className="admin-page-head"><div><p className="eyebrow">Manual intake</p><h1>Create a lead</h1><p>Capture a phone, walk-in, WhatsApp, email or social enquiry.</p></div></header><section className="profile-panel"><NewLeadForm team={team} canAssign={canAssign}/></section></>; }
