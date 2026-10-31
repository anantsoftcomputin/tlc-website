import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LinkWhatsApp } from "@/components/dashboard/link-whatsapp";
export const metadata: Metadata = {
  title: "Connect your WhatsApp traveller",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token || "";
  if (!/^[a-f0-9]{64}$/.test(token))
    return (
      <section className="market-section">
        <h1>Request a new link</h1>
        <p>Send LINK WEBSITE in your TLC WhatsApp conversation.</p>
      </section>
    );
  const user = await getSessionUser();
  if (!user)
    redirect(
      `/login?mode=client&next=${encodeURIComponent(`/connect-whatsapp?token=${token}`)}`,
    );
  if (user.role !== "customer")
    return (
      <section className="market-section">
        <h1>A verified client account is required</h1>
        <p>
          Sign out of your staff account, sign into your client account and
          reopen this link.
        </p>
      </section>
    );
  return (
    <section className="market-section">
      <h1>Connect your WhatsApp traveller</h1>
      <p>
        Confirm only a link you requested from your own WhatsApp conversation.
        It expires after 10 minutes. This adds your verified email to that
        traveller record and gives this account access to its trips. It does not
        merge other travellers or change consent.
      </p>
      <LinkWhatsApp token={token} />
    </section>
  );
}
