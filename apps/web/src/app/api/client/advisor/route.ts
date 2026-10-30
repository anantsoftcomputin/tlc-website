import { NextResponse } from "next/server";
import { personalTripInputSchema } from "@tlc/shared";
import { getSessionUser } from "@/lib/auth/session";
import { personalClientContext } from "@/lib/personalization/client-context";
import { planPersonalTrip } from "@/lib/personalization/advisor";
import { hasTrustedOrigin } from "@/lib/security/request-origin";
import { consumePublicRateLimit } from "@/lib/security/public-request";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.role !== "customer" || !user.emailVerified)
    return NextResponse.json(
      { error: "Sign in with a verified client account." },
      { status: 401 },
    );
  const parsed = personalTripInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message || "Confirm your trip details.",
      },
      { status: 400 },
    );
  const personal = await personalClientContext(parsed.data.customerId, user);
  if (!personal)
    return NextResponse.json(
      {
        error:
          "Enable personalisation in your preferences and choose your own traveller record.",
      },
      { status: 403 },
    );
  if (
    !(await consumePublicRateLimit(`personal-trip:${user.uid}`, 6, 600000))
      .allowed ||
    !(
      await consumePublicRateLimit(
        `personal-trip-provider:${user.orgId}`,
        30,
        60000,
      )
    ).allowed
  )
    return NextResponse.json(
      { error: "Please wait before searching again." },
      { status: 429 },
    );
  try {
    return NextResponse.json(
      { result: await planPersonalTrip(parsed.data, personal) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "Personal trip search failed",
      error instanceof Error ? error.message : "Unknown",
    );
    return NextResponse.json(
      {
        error:
          "We could not check this trip. Confirm future dates and try again, or ask TLC for a quote.",
      },
      { status: 400 },
    );
  }
}
