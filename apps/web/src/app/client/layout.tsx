import Link from "next/link";
import type { Metadata } from "next";
import { requireClientUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/dashboard/sign-out";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My journeys",
  robots: { index: false, follow: false },
};
export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireClientUser();
  return (
    <div className="client-workspace">
      <header className="client-topbar">
        <Link href="/" className="client-wordmark">
          TLC<span>HOLIDAYS</span>
        </Link>
        <nav aria-label="Client navigation">
          <Link href="/client">My journeys</Link>
          <Link href="/client/messages">Messages</Link>
          <Link href="/client/preferences">Preferences</Link>
          <Link href="/saved">Saved trips</Link>
          <Link href="/plan-my-trip">Plan a holiday</Link>
          <a href="/client#support">Help & support</a>
        </nav>
        <div>
          <span>{user.name || user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main>{children}</main>
      <footer>
        Thoughtfully planned. Personally supported.{" "}
        <Link href="/contact">Contact TLC</Link>
      </footer>
    </div>
  );
}
