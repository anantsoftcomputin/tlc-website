"use client";

import {
  Activity, BellRing, BriefcaseBusiness, Building2, CalendarCheck2, ChevronDown,
  CircleUserRound, Command, ContactRound, CreditCard, ExternalLink, FileClock,
  FileText, Gauge, Globe2, Inbox, Landmark, LayoutDashboard, LogOut, Menu,
  LibraryBig, MapPinned, PanelLeftClose, PanelLeftOpen, PlaneTakeoff, Plus, Search, Settings2, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { hasPermission } from "@/lib/auth/roles";
import type { AdminUser } from "@/lib/auth/session";
import { Logo } from "@/components/logo";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

const navGroups = [
  { label: "Overview", items: [
    { label: "Command centre", href: "/admin", icon: LayoutDashboard },
    { label: "Alerts", href: "/admin/alerts", icon: BellRing, permission: "crm:read" as const },
    { label: "Performance", href: "/admin/management", icon: Gauge, permission: "crm:read" as const },
  ]},
  { label: "Sales", items: [
    { label: "Inquiry inbox", href: "/admin/inquiries", icon: Inbox, permission: "crm:read" as const },
    { label: "Lead pipeline", href: "/admin/crm", icon: BriefcaseBusiness, permission: "crm:read" as const },
    { label: "Customers", href: "/admin/customers", icon: ContactRound, permission: "crm:read" as const },
    { label: "Quotes", href: "/admin/quotes", icon: FileText, permission: "quotes:write" as const },
  ]},
  { label: "Operations", items: [
    { label: "Bookings", href: "/admin/bookings", icon: CalendarCheck2, permission: "crm:read" as const },
    { label: "Live inventory", href: "/admin/inventory", icon: PlaneTakeoff, permission: "quotes:write" as const },
  ]},
  { label: "Website content", items: [
    { label: "Travel catalogue", href: "/admin/content", icon: LibraryBig, permission: "content:read" as const },
    { label: "Destinations", href: "/admin/content/destinations", icon: MapPinned, permission: "content:read" as const },
    { label: "Hotels & resorts", href: "/admin/content/hotels", icon: Building2, permission: "content:read" as const },
    { label: "Tours & packages", href: "/admin/content/trips", icon: FileText, permission: "content:read" as const },
  ]},
  { label: "Finance", items: [
    { label: "Payments", href: "/admin/payments", icon: CreditCard, permission: "finance:read" as const },
    { label: "Finance desk", href: "/admin/finance", icon: Landmark, permission: "finance:read" as const },
  ]},
  { label: "Control", items: [
    { label: "Audit trail", href: "/admin/audit", icon: FileClock, permission: "audit:read" as const },
    { label: "Lead settings", href: "/admin/settings/leads", icon: Settings2, permission: "users:manage" as const },
  ]},
];

const routeNames: Record<string, string> = {
  admin: "Command centre", inquiries: "Inquiry inbox", crm: "Lead pipeline",
  customers: "Customers", quotes: "Quotes", bookings: "Bookings",
  inventory: "Live inventory", payments: "Payments", finance: "Finance desk",
  management: "Performance", alerts: "Alerts", audit: "Audit trail", settings: "Settings",
  content: "Travel catalogue",
};

export function AdminShell({ user, children }: { user: AdminUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const visibleGroups = useMemo(() => navGroups.map((group) => ({
    ...group, items: group.items.filter((item) => !item.permission || hasPermission(user.role, item.permission)),
  })).filter((group) => group.items.length), [user.role]);
  const searchableItems = visibleGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
  const matches = searchableItems.filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(query.toLowerCase()));
  const parts = pathname.split("/").filter(Boolean);
  const currentTitle = routeNames[parts[1] || "admin"] || "TLC Operations";

  useEffect(() => {
    if (window.localStorage.getItem("tlc-admin-collapsed") === "true") setCollapsed(true);
    function keyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen((open) => !open); }
      if (event.key === "Escape") { setCommandOpen(false); setMobileOpen(false); setProfileOpen(false); setQuickOpen(false); }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  useEffect(() => { setMobileOpen(false); setCommandOpen(false); setQuery(""); }, [pathname]);
  useEffect(() => { if (commandOpen) requestAnimationFrame(() => searchRef.current?.focus()); }, [commandOpen]);

  function toggleCollapsed() {
    const next = !collapsed; setCollapsed(next); window.localStorage.setItem("tlc-admin-collapsed", String(next));
  }
  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    if (isFirebaseConfigured) await signOut(getFirebaseAuth());
    router.replace("/login"); router.refresh();
  }

  return <div className={`admin-shell${collapsed ? " is-collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>
    <button className="admin-mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
    <aside className="admin-sidebar">
      <div className="admin-brand"><Logo/><div><b>TLC OS</b><span>Travel operations</span></div><button className="admin-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X/></button></div>
      <nav aria-label="Admin navigation">{visibleGroups.map((group) => <section key={group.label}><p>{group.label}</p>{group.items.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || (!["/admin", "/admin/content"].includes(href) && pathname.startsWith(`${href}/`));
        return <Link className={active ? "active" : ""} key={href} href={href} title={collapsed ? label : undefined} aria-current={active ? "page" : undefined}><Icon/><span>{label}</span></Link>;
      })}</section>)}</nav>
      <div className="admin-sidebar-foot"><a href="/" target="_blank" rel="noreferrer"><Globe2/><span>View website</span><ExternalLink/></a><button onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen/> : <PanelLeftClose/>}<span>Collapse menu</span></button></div>
    </aside>
    <div className="admin-workspace">
      <header className="admin-topbar">
        <div className="admin-topbar-context"><button className="admin-menu-trigger" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu/></button><div><small>Workspace</small><b>{currentTitle}</b></div></div>
        <button className="admin-command-trigger" onClick={() => setCommandOpen(true)}><Search/><span>Search workspace or jump to…</span><kbd><Command/>K</kbd></button>
        <div className="admin-topbar-actions"><div className="admin-quick"><button className="admin-quick-trigger" onClick={() => setQuickOpen(!quickOpen)} aria-expanded={quickOpen}><Plus/><span>Create</span></button>{quickOpen && <div className="admin-quick-menu">
          {hasPermission(user.role, "crm:write") && <Link href="/admin/crm/new"><BriefcaseBusiness/><span><b>New lead</b><small>Capture an opportunity</small></span></Link>}
          {hasPermission(user.role, "quotes:write") && <Link href="/admin/quotes/new"><FileText/><span><b>Build quote</b><small>Create an itinerary</small></span></Link>}
          {hasPermission(user.role, "quotes:write") && <Link href="/admin/inventory"><PlaneTakeoff/><span><b>Search inventory</b><small>Flights and hotels</small></span></Link>}
          {hasPermission(user.role, "content:write") && <Link href="/admin/content/trips/new"><LibraryBig/><span><b>New package</b><small>Publish a website tour</small></span></Link>}
        </div>}</div><Link className="admin-alert-shortcut" href="/admin/alerts" aria-label="Open alerts"><BellRing/><i/></Link>
          <div className="admin-profile"><button onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen}><span>{(user.name || user.email || "T").charAt(0).toUpperCase()}</span><div><b>{user.name || user.email?.split("@")[0] || "TLC team"}</b><small>{user.role.replaceAll("_", " ")}</small></div><ChevronDown/></button>{profileOpen && <div className="admin-profile-menu"><div><CircleUserRound/><span><b>{user.name || "TLC team"}</b><small>{user.email}</small></span></div><button onClick={logout}><LogOut/>Sign out</button></div>}</div>
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </div>
    {commandOpen && <div className="admin-command-backdrop" role="presentation" onMouseDown={() => setCommandOpen(false)}><section className="admin-command" role="dialog" aria-modal="true" aria-label="Search TLC Operations" onMouseDown={(event) => event.stopPropagation()}>
      <header><Search/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Where do you want to go?"/><button onClick={() => setCommandOpen(false)}>ESC</button></header>
      <div><p>{query ? "Search results" : "Quick navigation"}</p>{matches.map(({ label, href, icon: Icon, group }) => <Link key={href} href={href}><span><Icon/></span><div><b>{label}</b><small>{group}</small></div><kbd>↵</kbd></Link>)}{!matches.length && <div className="admin-command-empty"><Activity/><b>No matching workspace</b><span>Try “customer”, “booking”, or “finance”.</span></div>}</div>
      <footer><span>Type to filter workspaces</span><span><kbd>esc</kbd> Close</span></footer>
    </section></div>}
  </div>;
}
