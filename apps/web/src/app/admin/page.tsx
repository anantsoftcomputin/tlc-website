import {
  ArrowRight, BellRing, BriefcaseBusiness, CircleCheckBig, FileClock, Inbox,
  MapPinned, PlaneTakeoff, Plus, Sparkles, UsersRound,
} from "lucide-react";
import Link from "next/link";
import { InquiryTable } from "@/components/admin/inquiry-table";
import { MetricCard } from "@/components/admin/metric-card";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreAdminRepository } from "@/repositories/firebase/firestore-admin-repository";
import { hasPermission } from "@/lib/auth/roles";

export default async function AdminDashboard() {
  const user = await requireAdminUser();
  const canViewAll = ["super_admin", "owner", "manager", "admin"].includes(user.role);
  const repository = new FirestoreAdminRepository(user.orgId, { uid: user.uid, canViewAll });
  if (!hasPermission(user.role, "crm:read")) {
    const publishedTrips = await repository.countPublishedTrips();
    return <><header className="admin-page-head"><div><p className="eyebrow">TLC content</p><h1>Content workspace</h1><p>Your publishing tools are being prepared for the next admin sprint.</p></div></header><section className="admin-metrics admin-metrics-single"><MetricCard label="Published trips" value={publishedTrips} note="Visible on the website" icon={MapPinned}/></section><section className="admin-panel"><div className="admin-empty"><span>Next</span><h3>Destination and trip editing</h3><p>The content repository and role boundary are ready. Authoring, preview and publishing controls are the next module.</p></div></section></>;
  }
  const snapshot = await repository.getDashboardSnapshot();
  const { metrics } = snapshot;
  const firstName = (user.name || user.email?.split("@")[0] || "team").split(" ")[0];
  const attentionTotal = metrics.newInquiries + metrics.pendingQuotes;

  return <div className="admin-dashboard">
    <section className="admin-welcome">
      <div><p><Sparkles/> Live command centre</p><h1>Good to see you, {firstName}.</h1><span>Here is what needs the team&apos;s attention across sales and operations.</span></div>
      <div className="admin-welcome-actions">{hasPermission(user.role, "crm:write") && <Link href="/admin/crm/new"><Plus/>New lead</Link>}<Link href="/admin/inquiries">Open inbox<ArrowRight/></Link></div>
    </section>

    <section className="admin-metrics dashboard-metrics">
      <MetricCard label="New inquiries" value={metrics.newInquiries} note="Awaiting first response" icon={Inbox}/>
      <MetricCard label="Open opportunities" value={metrics.openLeads} note="Across the active pipeline" icon={UsersRound}/>
      <MetricCard label="Quotes in progress" value={metrics.pendingQuotes} note="Draft, sent or viewed" icon={FileClock}/>
      <MetricCard label="Published trips" value={metrics.publishedTrips} note="Live on the website" icon={MapPinned}/>
    </section>

    <section className="admin-dashboard-grid">
      <div className="admin-dashboard-main">
        <section className="admin-panel admin-priority-panel"><header><div><span><CircleCheckBig/></span><div><h2>Newest inquiries</h2><p>Fresh traveller briefs, ordered by arrival.</p></div></div><Link href="/admin/inquiries">View inbox <ArrowRight/></Link></header><InquiryTable inquiries={snapshot.recentInquiries} compact/></section>
      </div>
      <aside className="admin-dashboard-side">
        <section className="admin-focus-card"><header><span>Focus now</span><b>{attentionTotal}</b></header><h2>{attentionTotal ? "Customer moments need attention" : "You’re all caught up"}</h2><p>{attentionTotal ? "Prioritise new enquiries, then move active quotes towards a decision." : "No new enquiries or pending quotes are waiting right now."}</p><div><Link href="/admin/inquiries"><span><Inbox/></span><div><b>Respond to inquiries</b><small>{metrics.newInquiries} waiting</small></div><ArrowRight/></Link><Link href="/admin/quotes"><span><FileClock/></span><div><b>Progress quotes</b><small>{metrics.pendingQuotes} in progress</small></div><ArrowRight/></Link></div></section>
        <section className="admin-shortcuts"><header><h2>Quick launch</h2><span>Frequent tools</span></header><div><Link href="/admin/crm"><BriefcaseBusiness/><span>Pipeline</span></Link>{hasPermission(user.role, "quotes:write") && <Link href="/admin/inventory"><PlaneTakeoff/><span>Inventory</span></Link>}<Link href="/admin/alerts"><BellRing/><span>Alerts</span></Link><Link href="/admin/customers"><UsersRound/><span>Customers</span></Link></div></section>
      </aside>
    </section>
  </div>;
}
