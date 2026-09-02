import { ArrowRight, CircleCheckBig, FileClock, Inbox, MapPinned, UsersRound } from "lucide-react";
import Link from "next/link";
import { InquiryTable } from "@/components/admin/inquiry-table";
import { MetricCard } from "@/components/admin/metric-card";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreAdminRepository } from "@/repositories/firebase/firestore-admin-repository";
import { hasPermission } from "@/lib/auth/roles";

export default async function AdminDashboard() {
  const user = await requireAdminUser(); const canViewAll = ["super_admin", "owner", "manager", "admin"].includes(user.role); const repository = new FirestoreAdminRepository(user.orgId, { uid: user.uid, canViewAll });
  if (!hasPermission(user.role, "crm:read")) {
    const publishedTrips = await repository.countPublishedTrips();
    return <><header className="admin-page-head"><div><p className="eyebrow">TLC content</p><h1>Content workspace</h1><p>Your publishing tools are being prepared for the next admin sprint.</p></div></header><section className="admin-metrics admin-metrics-single"><MetricCard label="Published trips" value={publishedTrips} note="Visible on the website" icon={MapPinned}/></section><section className="admin-panel"><div className="admin-empty"><span>Next</span><h3>Destination and trip editing</h3><p>The content repository and role boundary are ready. Authoring, preview and publishing controls are the next module.</p></div></section></>;
  }
  const snapshot = await repository.getDashboardSnapshot();
  const { metrics } = snapshot;
  return <><header className="admin-page-head"><div><p className="eyebrow">Today at TLC</p><h1>Operations overview</h1><p>Live activity from enquiries, sales and published travel content.</p></div><Link className="button button-gold" href="/admin/inquiries">Open inquiry inbox <ArrowRight/></Link></header>
    <section className="admin-metrics"><MetricCard label="New inquiries" value={metrics.newInquiries} note="Awaiting first response" icon={Inbox}/><MetricCard label="Open leads" value={metrics.openLeads} note="Across the active pipeline" icon={UsersRound}/><MetricCard label="Quotes pending" value={metrics.pendingQuotes} note="Draft, sent or viewed" icon={FileClock}/><MetricCard label="Published trips" value={metrics.publishedTrips} note="Visible on the website" icon={MapPinned}/></section>
    <section className="admin-panel"><header><div><span><CircleCheckBig/></span><div><h2>Recent inquiries</h2><p>The newest customer requirements requiring attention.</p></div></div><Link href="/admin/inquiries">View all <ArrowRight/></Link></header><InquiryTable inquiries={snapshot.recentInquiries} compact/></section></>;
}
