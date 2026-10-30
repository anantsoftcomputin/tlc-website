import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { clientCustomers } from "@/repositories/firebase/client-portal-repository";
import { ConnectTravel } from "@/components/dashboard/connect-travel";
export const metadata: Metadata = {
  title: "Connect your personal travel conversation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token || "";
  if (!/^[a-f0-9]{64}$/.test(token))
    return (
      <section className="market-section">
        <h1>Request a new connection link in your conversation.</h1>
      </section>
    );
  const user = await getSessionUser();
  if (!user)
    redirect(
      `/login?next=${encodeURIComponent(`/connect-travel?token=${token}`)}`,
    );
  if (user.role !== "customer" || !user.emailVerified) redirect("/login");
  const clients = (await clientCustomers(user))
    .filter(
      (client) =>
        client.data().communicationPreferences?.personalization === true &&
        client.data().verifiedClientUid === user.uid,
    )
    .map((client) => ({
      id: client.id,
      name: String(client.data().name || "Traveller"),
    }));
  return (
    <section className="market-section">
      <h1>Connect your personal travel conversation</h1>
      <p>
        Only connect a conversation you started. Its contact address must match
        the selected traveller record.
      </p>
      {clients.length ? (
        <ConnectTravel token={token} clients={clients} />
      ) : (
        <p>
          <Link href="/client/preferences">
            Enable personalisation for your traveller first
          </Link>
          , then reopen this link.
        </p>
      )}
    </section>
  );
}
