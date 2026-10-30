import { NextResponse } from "next/server";
import { z } from "zod";
import { emailTemplate, emailSampleData, renderEmail } from "@tlc/integrations";
import { getAdminUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
const schema = z.object({
  templateId: z.string().min(1).max(60),
  firstName: z.string().trim().max(80).optional(),
  destination: z.string().trim().max(100).optional(),
  message: z.string().trim().max(5000).optional(),
});
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getAdminUser();
  if (
    !user ||
    !(
      hasPermission(user.role, "crm:read") ||
      hasPermission(user.role, "marketing:read")
    )
  )
    return NextResponse.json(
      { error: "Staff access required." },
      { status: 403 },
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Please check the preview fields." },
      { status: 400 },
    );
  try {
    const template = emailTemplate(parsed.data.templateId);
    const siteUrl = new URL(request.url).origin;
    const sample = emailSampleData(template.id, siteUrl);
    const { templateId: _id, ...overrides } = parsed.data;
    void _id;
    const rendered = renderEmail(
      template.id,
      {
        ...sample,
        ...Object.fromEntries(
          Object.entries(overrides).filter(([, value]) => value !== ""),
        ),
      },
      { siteUrl, preview: true, year: 2026 },
    );
    return NextResponse.json(
      { rendered },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "This email preview could not be rendered." },
      { status: 400 },
    );
  }
}
