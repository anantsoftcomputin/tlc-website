import {
  ArrowLeft,
  CalendarClock,
  Clock3,
  IndianRupee,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadWorkspace } from "@/components/admin/lead-workspace";
import { LeadAssistPanel } from "@/components/admin/lead-assist-panel";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreLeadRepository } from "@/repositories/firebase/firestore-lead-repository";

const managerRoles = new Set(["super_admin", "owner", "manager", "admin"]);
function formatDate(value?: string) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "Not scheduled";
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdminUser("crm:read");
  const { id } = await params;
  const canReassign = managerRoles.has(user.role);
  const repository = new FirestoreLeadRepository(user.orgId, {
    uid: user.uid,
    canViewAll: canReassign,
  });
  const [detail, assignees] = await Promise.all([
    repository.getLead(id),
    canReassign ? repository.listAssignees() : Promise.resolve([]),
  ]);
  if (!detail) notFound();
  const { lead, customer, activities } = detail;

  return (
    <>
      <Link className="admin-back" href="/admin/crm">
        <ArrowLeft />
        Lead pipeline
      </Link>
      <header className="lead-detail-hero">
        <div>
          <p className="eyebrow">
            {lead.priority} priority · {lead.source}
          </p>
          <h1>{lead.title}</h1>
          <p>
            {lead.requirement.destinations.join(", ") ||
              "Open destination brief"}{" "}
            ·{" "}
            {lead.requirement.pax.adults +
              lead.requirement.pax.children +
              lead.requirement.pax.infants}{" "}
            traveller(s)
          </p>
        </div>
        <aside>
          <span className={`status-pill status-${lead.status}`}>
            {lead.status}
          </span>
          <strong>
            <IndianRupee />
            {lead.valueEstimate.toLocaleString("en-IN")}
          </strong>
          <small>Expected margin {lead.expectedMargin}%</small>
        </aside>
      </header>
      <div className="lead-detail-grid">
        <main>
          <section className="profile-panel">
            <header>
              <div>
                <span>
                  <UserRound />
                </span>
                <div>
                  <h2>Traveller</h2>
                  <p>Customer record linked to this opportunity</p>
                </div>
              </div>
              {customer && (
                <Link href={`/admin/customers/${customer.id}`}>Open 360°</Link>
              )}
            </header>
            {customer ? (
              <div className="lead-customer">
                <h3>{customer.name}</h3>
                <p>
                  <Phone />
                  {customer.phones.join(", ") || "No phone"}
                </p>
                <p>
                  <Mail />
                  {customer.emails.join(", ") || "No email"}
                </p>
                <p>
                  <MapPin />
                  {customer.city || "City not recorded"}
                </p>
              </div>
            ) : (
              <div className="panel-empty">
                <UserRound />
                <b>Customer unavailable</b>
                <span>The linked customer record could not be found.</span>
              </div>
            )}
          </section>
          <section className="profile-panel">
            <header>
              <div>
                <span>
                  <Clock3 />
                </span>
                <div>
                  <h2>Activity timeline</h2>
                  <p>Append-only history of sales conversations and changes</p>
                </div>
              </div>
            </header>
            {activities.length ? (
              <ol className="lead-timeline">
                {activities.map((activity) => (
                  <li key={activity.id}>
                    <span>{activity.type.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <b>{activity.type.replace(/([A-Z])/g, " $1")}</b>
                      <p>{activity.body}</p>
                      <small>
                        {formatDate(activity.ts)} · {activity.by}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="panel-empty">
                <Clock3 />
                <b>No activity recorded</b>
                <span>
                  Add the first call, note or message from the controls.
                </span>
              </div>
            )}
          </section>
        </main>
        <aside>
          <LeadAssistPanel leadId={lead.id} suggestions={lead.aiSuggestions} />
          <section className="lead-sla-card">
            <h2>
              <CalendarClock />
              SLA & follow-up
            </h2>
            <dl>
              <div>
                <dt>First response due</dt>
                <dd>{formatDate(lead.sla.firstResponseDueAt)}</dd>
              </div>
              <div>
                <dt>First response</dt>
                <dd>{formatDate(lead.sla.firstResponseAt)}</dd>
              </div>
              <div>
                <dt>Next follow-up</dt>
                <dd>{formatDate(lead.sla.nextFollowUpAt)}</dd>
              </div>
              <div>
                <dt>Lead age</dt>
                <dd>{lead.ageDays} day(s)</dd>
              </div>
            </dl>
          </section>
          <section className="lead-requirement-card">
            <h2>Travel requirement</h2>
            <p>{lead.requirement.notes || "No detailed notes yet."}</p>
            <dl>
              {lead.requirement.tripBrief?.originCity && (
                <div>
                  <dt>Starting from</dt>
                  <dd>{lead.requirement.tripBrief.originCity}</dd>
                </div>
              )}
              <div>
                <dt>Party</dt>
                <dd>
                  {lead.requirement.pax.adults} adults ·{" "}
                  {lead.requirement.pax.children} children ·{" "}
                  {lead.requirement.pax.infants} infants
                </dd>
              </div>
              {lead.requirement.tripBrief?.nights && (
                <div>
                  <dt>Duration</dt>
                  <dd>
                    {lead.requirement.tripBrief.nights} nights
                    {lead.requirement.tripBrief.days
                      ? ` · ${lead.requirement.tripBrief.days} days`
                      : ""}
                  </dd>
                </div>
              )}
              {lead.requirement.budgetMax !== undefined && (
                <div>
                  <dt>Budget up to</dt>
                  <dd>₹{lead.requirement.budgetMax.toLocaleString("en-IN")}</dd>
                </div>
              )}
              <div>
                <dt>Flexible</dt>
                <dd>{lead.requirement.flexible ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Preferences</dt>
                <dd>
                  {lead.requirement.preferences.join(", ") || "Not captured"}
                </dd>
              </div>
            </dl>
            {lead.requirement.travellers?.length ? (
              <div className="lead-party-brief">
                {lead.requirement.travellers.map((traveller) => (
                  <article key={traveller.clientId}>
                    <b>{traveller.firstName || traveller.relationship}</b>
                    <span>
                      {traveller.ageBand.replaceAll("_", " ")} ·{" "}
                      {traveller.flight.seat.replaceAll("_", " ")} seat
                    </span>
                    <small>
                      {traveller.interests.join(" · ") ||
                        "Interests not recorded"}
                    </small>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </aside>
      </div>
      <LeadWorkspace
        lead={lead}
        assignees={assignees}
        canReassign={canReassign}
      />
    </>
  );
}
