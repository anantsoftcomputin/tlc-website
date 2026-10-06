import { NextResponse } from "next/server";
import { vacationBriefSchema } from "@tlc/shared";
import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import {
  checkPublicRequest,
  consumePublicRateLimit,
} from "@/lib/security/public-request";
import { searchVacations } from "@/repositories/firebase/vacation-repository";

export const maxDuration = 60;
export async function POST(request: Request) {
  const denied = await checkPublicRequest(request);
  if (denied) return denied;
  if (!isFirebaseAdminConfigured)
    return NextResponse.json(
      {
        error:
          "Personalised options are being configured. You can still send TLC your travel brief.",
      },
      { status: 503 },
    );
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const [visitor, provider] = await Promise.all([
      consumePublicRateLimit(`vacation:${ip}`, 6, 600_000),
      consumePublicRateLimit("vacation:provider", 30, 60_000),
    ]);
    if (!visitor.allowed || !provider.allowed)
      return NextResponse.json(
        { error: "Please wait a moment before searching again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(visitor.retryAfter, provider.retryAfter),
            ),
          },
        },
      );
    const parsed = vacationBriefSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Check your trip details.",
        },
        { status: 400 },
      );
    const today = new Date().toISOString().slice(0, 10);
    if (
      parsed.data.checkIn <= today ||
      Date.parse(parsed.data.checkIn) > Date.now() + 365 * 86_400_000
    )
      return NextResponse.json(
        { error: "Choose a future arrival date within the next year." },
        { status: 400 },
      );
    return NextResponse.json(await searchVacations(parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "We couldn’t load your options. Try again or send your brief to TLC.",
      },
      { status: 503 },
    );
  }
}
