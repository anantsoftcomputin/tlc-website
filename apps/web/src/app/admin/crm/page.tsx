import { AlertTriangle, CalendarClock, CircleUserRound, IndianRupee, LayoutGrid, List, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { leadStatuses, type Lead } from "@tlc/shared";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreLeadRepository } from "@/repositories/firebase/firestore-lead-repository";

const statusLabels: Record<Lead["status"], string> = {
  new: "New", contacted: "Contacted", quoted: "Quoted", negotiating: "Negotiating",
  won: "Won", lost: "Lost", dormant: "Dormant",
};
const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);

function date(value?: string) {
  return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value)) : "No follow-up";
}

export default async function AdminCRMPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const user = await requireAdminUser("crm:read");
  const repository = new FirestoreLeadRepository(user.orgId, { uid: user.uid, canViewAll: managerRoles.has(user.role) });
  const [allLeads, params] = await Promise.all([repository.listLeads(), searchParams]);
  const query = params.q?.trim().toLowerCase() || "";
  const leads = query ? allLeads.filter((lead) => [lead.title, lead.customerName, lead.source, ...lead.requirement.destinations].some((item) => item.toLowerCase().includes(query))) : allLeads;
  const listView = params.view === "list";
  const now = Date.now();
  const overdue = allLeads.filter((lead) => lead.sla.nextFollowUpAt && new Date(lead.sla.nextFollowUpAt).getTime() < now && !["won", "lost"].includes(lead.status)).length;

  return <><header className="admin-page-head"><div><p className="eyebrow">Sales workspace</p><h1>Lead pipeline</h1><p>Own every opportunity, response deadline and next action.</p></div><div className="admin-head-actions"><span className="admin-count"><UsersRound/>{allLeads.length} leads</span><Link className="button primary" href="/admin/crm/new"><Plus/>New lead</Link></div></header>
    <div className="crm-toolbar"><form><input type="search" name="q" defaultValue={query} placeholder="Search traveller or destination"/><input type="hidden" name="view" value={listView ? "list" : "board"}/><button type="submit">Search</button></form><div><Link className={!listView ? "active" : ""} href={`/admin/crm${query ? `?q=${encodeURIComponent(query)}` : ""}`}><LayoutGrid/>Board</Link><Link className={listView ? "active" : ""} href={`/admin/crm?view=list${query ? `&q=${encodeURIComponent(query)}` : ""}`}><List/>List</Link></div><span className={overdue ? "crm-overdue" : ""}><AlertTriangle/>{overdue} overdue follow-up{overdue === 1 ? "" : "s"}</span></div>
    {listView ? <section className="admin-panel"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Opportunity</th><th>Status</th><th>Priority</th><th>Value</th><th>Next action</th><th></th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><b>{lead.title}</b><span>{lead.customerName} · {lead.requirement.destinations.join(", ") || "Open brief"}</span></td><td><span className={`status-pill status-${lead.status}`}>{statusLabels[lead.status]}</span></td><td>{lead.priority}</td><td>₹{lead.valueEstimate.toLocaleString("en-IN")}</td><td>{date(lead.sla.nextFollowUpAt)}</td><td><Link href={`/admin/crm/${lead.id}`}>Open</Link></td></tr>)}</tbody></table></div></section>
    : <div className="crm-board" aria-label="Lead pipeline">{leadStatuses.map((status) => { const statusLeads = leads.filter((lead) => lead.status === status); return <section className="crm-column" key={status}><header><h2>{statusLabels[status]}</h2><span>{statusLeads.length}</span></header><div>{statusLeads.map((lead) => { const isOverdue = lead.sla.nextFollowUpAt && new Date(lead.sla.nextFollowUpAt).getTime() < now && !["won", "lost"].includes(lead.status); return <Link className={`lead-card${isOverdue ? " overdue" : ""}`} href={`/admin/crm/${lead.id}`} key={lead.id}><p>{lead.title}</p><span><CircleUserRound/>{lead.customerName}</span><span><CalendarClock/>{date(lead.sla.nextFollowUpAt)}</span><b><IndianRupee/>{lead.valueEstimate.toLocaleString("en-IN")}</b></Link>; })}{!statusLeads.length && <div className="crm-empty">No leads</div>}</div></section>; })}</div>}
  </>;
}
