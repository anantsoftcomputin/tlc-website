"use client";

import {
  Compass,
  Heart,
  House,
  Phone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const savedEvent = "tlc:saved-changed";

function subscribeToSavedTrips(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(savedEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(savedEvent, callback);
  };
}

function getSavedCount() {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem("tlc-saved") || "[]",
    );
    return Array.isArray(saved) ? saved.length : 0;
  } catch {
    return 0;
  }
}

type MobileNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  matches: string[];
  primary?: boolean;
  saved?: boolean;
};

const items: MobileNavItem[] = [
  { label: "Home", href: "/", icon: House, matches: ["/"] },
  {
    label: "Explore",
    href: "/destinations",
    icon: Compass,
    matches: ["/destinations", "/trips", "/holidays"],
  },
  {
    label: "Plan",
    href: "/plan-my-trip",
    icon: Sparkles,
    matches: ["/plan-my-trip"],
    primary: true,
  },
  {
    label: "Saved",
    href: "/saved",
    icon: Heart,
    matches: ["/saved"],
    saved: true,
  },
  { label: "Contact", href: "/contact", icon: Phone, matches: ["/contact"] },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const savedCount = useSyncExternalStore(
    subscribeToSavedTrips,
    getSavedCount,
    () => 0,
  );

  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/i/") ||
    pathname === "/login"
  )
    return null;

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
      <div className="mobile-nav-dock">
        {items.map(({ label, href, icon: Icon, matches, primary, saved }) => {
          const active = matches.some((prefix) =>
            prefix === "/" ? pathname === "/" : pathname.startsWith(prefix),
          );
          return (
            <Link
              key={label}
              href={href}
              className={`${active ? "active" : ""} ${primary ? "primary" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="mobile-nav-icon">
                <Icon aria-hidden="true" />
                {saved && savedCount > 0 && (
                  <b aria-label={`${savedCount} saved trips`}>
                    {savedCount > 9 ? "9+" : savedCount}
                  </b>
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export { savedEvent };
