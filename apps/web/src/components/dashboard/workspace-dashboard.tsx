import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  CircleCheck,
  Compass,
  CreditCard,
  FileCheck2,
  Globe2,
  LayoutGrid,
  LifeBuoy,
  Megaphone,
  Plus,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { hasPermission } from "@tlc/shared";
import type { AdminUser } from "@/lib/auth/session";
import {
  getWorkspaceDashboard,
  type DashboardRow,
} from "@/repositories/firebase/dashboard-repository";
const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
export function DashboardList({
  title,
  subtitle,
  rows,
  empty,
  href,
}: {
  title: string;
  subtitle?: string;
  rows: DashboardRow[];
  empty: string;
  href?: string;
}) {
  return (
    <section className="workspace-panel">
      <header>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} aria-label={`View all ${title.toLowerCase()}`}>
            <ArrowUpRight />
          </Link>
        )}
      </header>
      {rows.length ? (
        <div className="workspace-list">
          {rows.map((row) => (
            <Link key={row.id} href={row.href}>
              <span className="workspace-row-icon">
                <Compass />
              </span>
              <div>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
                {row.date && (
                  <small>
                    {new Date(row.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </small>
                )}
              </div>
              <span className="workspace-status">
                {row.status.replaceAll("_", " ")}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="workspace-empty">
          <CircleCheck />
          <p>{empty}</p>
        </div>
      )}
    </section>
  );
}
export async function WorkspaceDashboard({
  user,
  business,
}: {
  user: AdminUser;
  business: boolean;
}) {
  const data = await getWorkspaceDashboard(user);
  const m = data.metrics;
  const tools = [
    {
      title: "Lead pipeline",
      copy: "Enquiries, ownership & follow-ups",
      href: "/admin/crm",
      icon: Users,
      permission: "leads:read" as const,
    },
    {
      title: "Customers",
      copy: "Traveller profiles & history",
      href: "/admin/customers",
      icon: Users,
      permission: "customers:read" as const,
    },
    {
      title: "Quotes & itineraries",
      copy: "Build, review & share proposals",
      href: "/admin/quotes",
      icon: FileCheck2,
      permission: "quotes:read" as const,
    },
    {
      title: "Bookings",
      copy: "Departures & supplier confirmations",
      href: "/admin/bookings",
      icon: CalendarDays,
      permission: "customers:read" as const,
    },
    {
      title: "Finance",
      copy: "Receivables, refunds & period close",
      href: "/admin/finance",
      icon: Wallet,
      permission: "finance:read" as const,
    },
    {
      title: "Payments",
      copy: "Collection links & reconciliation",
      href: "/admin/payments",
      icon: CreditCard,
      permission: "finance:read" as const,
    },
    {
      title: "Marketing",
      copy: "Offers, audiences & campaigns",
      href: "/admin/marketing",
      icon: Megaphone,
      permission: "campaigns:manage" as const,
    },
    {
      title: "Website catalogue",
      copy: "Destinations, stays & tours",
      href: "/admin/content",
      icon: Globe2,
      permission: "content:read" as const,
    },
    {
      title: "Performance",
      copy: "Revenue & team reporting",
      href: "/admin/management",
      icon: LayoutGrid,
      permission: "business:read" as const,
    },
    {
      title: "Conversations",
      copy: "Tara handovers & team replies",
      href: "/admin/conversations",
      icon: LifeBuoy,
      permission: "leads:write" as const,
    },
    {
      title: "Audit trail",
      copy: "Review recorded business actions",
      href: "/admin/audit",
      icon: ShieldCheck,
      permission: "audit:read" as const,
    },
    {
      title: "Client support",
      copy: "Requests, replies & resolutions",
      href: "/admin/support",
      icon: LifeBuoy,
      permission: "leads:write" as const,
    },
    {
      title: "Team & access",
      copy: "Staff roles and account status",
      href: "/admin/team",
      icon: Users,
      permission: "users:manage" as const,
    },
  ].filter((tool) => hasPermission(user.role, tool.permission));
  const metrics = data.canFinance
    ? [
        ["Approved booking value", money(m.revenue), "All-time · INR bookings"],
        ["Collected", money(m.collected), "Captured INR payments"],
        [
          "Receivables outstanding",
          money(m.outstanding),
          "Open INR ledger balances",
        ],
        [
          "Needs reconciliation",
          String(m.unreconciled),
          `${m.syncFailures} accounting sync failures`,
        ],
      ]
    : user.role === "marketing"
      ? [
          ["Active offers", String(m.activeOffers), "Ready for audiences"],
          ["Campaigns", String(m.campaigns), "Recorded campaigns"],
          ["Published tours", String(m.published), "Visible on the website"],
          ["Draft tours", String(m.drafts), "Awaiting publication"],
        ]
      : user.role === "content_editor"
        ? [
            ["Published tours", String(m.published), "Visible on the website"],
            ["Draft tours", String(m.drafts), "Ready for your next edit"],
          ]
        : [
            ["My open leads", String(m.openLeads), "Assigned opportunities"],
            ["Follow-ups overdue", String(m.overdue), "Start with these today"],
            [
              "Quotes in progress",
              String(m.waitingQuotes),
              "Draft, sent or viewed",
            ],
            [
              "Active bookings",
              String(m.activeBookings),
              "Your assigned travel work",
            ],
          ];
  return (
    <div className="workspace-dashboard">
      <section className="workspace-hero">
        <div>
          <p className="workspace-kicker">
            TLC / {business ? "BUSINESS OVERVIEW" : "MY WORKSPACE"}
          </p>
          <h1>
            {business
              ? "The whole journey, in view."
              : `Make today a great travel day.`}
          </h1>
          <p>
            {business
              ? "A clear view of your business, your team and the promises still to deliver."
              : `Welcome back, ${(user.name || user.email || "team").split(/[ @]/)[0]}. Here is your ${user.role.replaceAll("_", " ")} workspace.`}
          </p>
        </div>
        <div className="workspace-hero-aside">
          <span>
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "Asia/Kolkata",
            })}
          </span>
          {hasPermission(user.role, "leads:write") && (
            <Link href="/admin/crm/new">
              <Plus size={17} /> Create a lead
            </Link>
          )}
        </div>
      </section>
      <div className="workspace-stat-grid">
        {metrics.map(([label, value, note]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      {business && (
        <div className="workspace-pulse">
          <span>
            <b>{m.openLeads}</b> open opportunities
          </span>
          <span>
            <b>{data.approvalCount}</b> approvals waiting
          </span>
          <span>
            <b>{m.overdue}</b> overdue follow-ups
          </span>
          <span>
            <b>{m.published}</b> published tours
          </span>
          <span>
            <b>{data.periods}</b> closed finance periods
          </span>
        </div>
      )}
      <section className="workspace-tools">
        <div className="workspace-section-title">
          <span className="workspace-kicker">YOUR TOOLS</span>
          <h2>Everything in its place.</h2>
        </div>
        <div>
          {tools.map(({ title, copy, href, icon: Icon }) => (
            <Link href={href} key={href}>
              <Icon />
              <strong>{title}</strong>
              <p>{copy}</p>
              <ArrowUpRight className="tool-arrow" />
            </Link>
          ))}
        </div>
      </section>
      <div className="workspace-columns">
        {business && (
          <DashboardList
            title="Decisions waiting"
            subtitle="Review the details before approving"
            rows={data.approvals}
            empty="No approvals are waiting."
          />
        )}
        {data.canSales && (
          <DashboardList
            title={business ? "Team follow-ups" : "My follow-ups"}
            subtitle="Earliest deadlines first"
            rows={data.followUps}
            empty="No scheduled follow-ups."
            href="/admin/crm"
          />
        )}
        {(data.canSales || data.canFinance) && (
          <DashboardList
            title="Upcoming departures"
            rows={data.departures}
            empty="No upcoming departures in your workspace."
            href="/admin/bookings"
          />
        )}
        {data.canSales && (
          <DashboardList
            title="Needs attention"
            rows={data.alerts}
            empty="No open operational alerts."
            href="/admin/alerts"
          />
        )}
        {hasPermission(user.role, "leads:write") && (
          <DashboardList
            title="Client support"
            rows={data.support}
            empty="No open client requests."
            href="/admin/support"
          />
        )}
        {business && (
          <DashboardList
            title="Your team"
            subtitle="Active staff and their current workload"
            rows={data.team}
            empty="Add staff accounts to build your team."
            href="/admin/team"
          />
        )}
      </div>
    </div>
  );
}
