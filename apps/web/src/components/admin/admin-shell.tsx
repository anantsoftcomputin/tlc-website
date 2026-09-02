"use client";

import {
  BarChart3,
  BellRing,
  BookOpen,
  BriefcaseBusiness,
  ChevronDown,
  CircleUserRound,
  ContactRound,
  FileClock,
  FileText,
  Gauge,
  Globe2,
  Images,
  Inbox,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Search,
  Settings,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "firebase/auth";
import { hasPermission } from "@/lib/auth/roles";
import type { AdminUser } from "@/lib/auth/session";
import { Logo } from "@/components/logo";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      {
        label: "Inquiries",
        href: "/admin/inquiries",
        icon: Inbox,
        permission: "crm:read" as const,
      },
      {
        label: "Customers",
        href: "/admin/customers",
        icon: ContactRound,
        permission: "crm:read" as const,
      },
      {
        label: "CRM pipeline",
        href: "/admin/crm",
        icon: BriefcaseBusiness,
        permission: "crm:read" as const,
      },
      {
        label: "Alerts",
        href: "/admin/alerts",
        icon: BellRing,
        permission: "crm:read" as const,
      },
      {
        label: "Management",
        href: "/admin/management",
        icon: Gauge,
        permission: "crm:read" as const,
      },
      {
        label: "Quotes",
        href: "/admin/quotes",
        icon: FileText,
        permission: "quotes:write" as const,
        disabled: true,
      },
    ],
  },
  {
    label: "Travel content",
    items: [
      {
        label: "Trips",
        href: "/admin/trips",
        icon: MapPinned,
        permission: "content:read" as const,
        disabled: true,
      },
      {
        label: "Destinations",
        href: "/admin/destinations",
        icon: Globe2,
        permission: "content:read" as const,
        disabled: true,
      },
      {
        label: "Travel stories",
        href: "/admin/stories",
        icon: BookOpen,
        permission: "content:read" as const,
        disabled: true,
      },
      {
        label: "Media",
        href: "/admin/media",
        icon: Images,
        permission: "content:read" as const,
        disabled: true,
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Audit trail",
        href: "/admin/audit",
        icon: FileClock,
        permission: "audit:read" as const,
      },
      {
        label: "Lead settings",
        href: "/admin/settings/leads",
        icon: Settings,
        permission: "users:manage" as const,
      },
      {
        label: "Team users",
        href: "/admin/users",
        icon: UsersRound,
        permission: "users:manage" as const,
        disabled: true,
      },
      {
        label: "SEO & analytics",
        href: "/admin/seo",
        icon: BarChart3,
        permission: "content:read" as const,
        disabled: true,
      },
      {
        label: "Settings",
        href: "/admin/settings",
        icon: Settings,
        permission: "settings:manage" as const,
        disabled: true,
      },
    ],
  },
];

export function AdminShell({
  user,
  children,
}: {
  user: AdminUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    if (isFirebaseConfigured) await signOut(getFirebaseAuth());
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <Logo />
          <span>Operations</span>
        </div>
        <nav aria-label="Admin navigation">
          {navGroups.map((group) => {
            const items = group.items.filter(
              (item) =>
                !item.permission || hasPermission(user.role, item.permission),
            );
            if (!items.length) return null;
            return (
              <section key={group.label}>
                <p>{group.label}</p>
                {items.map(({ label, href, icon: Icon, disabled }) =>
                  disabled ? (
                    <span className="admin-nav-disabled" key={label}>
                      <Icon />
                      {label}
                      <small>Soon</small>
                    </span>
                  ) : (
                    <Link
                      className={
                        pathname === href ||
                        (href !== "/admin" && pathname.startsWith(`${href}/`))
                          ? "active"
                          : ""
                      }
                      key={href}
                      href={href}
                    >
                      <Icon />
                      {label}
                    </Link>
                  ),
                )}
              </section>
            );
          })}
        </nav>
        <div className="admin-sidebar-foot">
          <a href="/" target="_blank" rel="noreferrer">
            <Globe2 />
            View website
          </a>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-mobile-brand">
            <Logo />
          </div>
          <label className="admin-search">
            <Search />
            <input
              placeholder="Search leads, contacts, trips…"
              aria-label="Search workspace"
              disabled
            />
            <span>Coming soon</span>
          </label>
          <div className="admin-profile">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              aria-expanded={profileOpen}
            >
              <span>
                <CircleUserRound />
              </span>
              <div>
                <b>{user.name || user.email?.split("@")[0] || "TLC team"}</b>
                <small>{user.role.replaceAll("_", " ")}</small>
              </div>
              <ChevronDown />
            </button>
            {profileOpen && (
              <div className="admin-profile-menu">
                <button onClick={logout}>
                  <LogOut />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
