import {
  emailTemplates,
  emailSampleData,
  renderEmail,
} from "@tlc/integrations";
import { requireAdminUser } from "@/lib/auth/session";
import { headers } from "next/headers";
import { EmailDesignStudio } from "@/components/admin/email-design-studio";
export default async function EmailDesignsPage() {
  await requireAdminUser("crm:read");
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const siteUrl = `${host.startsWith("localhost:") || host.startsWith("127.0.0.1:") ? "http" : "https"}://${host}`;
  const rendered = renderEmail(
    "quote-ready",
    emailSampleData("quote-ready", siteUrl),
    { siteUrl, preview: true, year: 2026 },
  );
  return (
    <EmailDesignStudio
      templates={emailTemplates.map(
        ({ id, name, category, layout, trigger, integration }) => ({
          id,
          name,
          category,
          layout,
          trigger,
          integration,
        }),
      )}
      initial={rendered}
    />
  );
}
