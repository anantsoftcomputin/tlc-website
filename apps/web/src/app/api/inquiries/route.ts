import { NextResponse } from "next/server";
import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { consumePublicRateLimit as consumeRateLimit, checkPublicRequest } from "@/lib/security/public-request";
import { inquirySchema } from "@/lib/validation/inquiry";
import { FirestoreInquiryRepository } from "@/repositories/firebase/firestore-inquiry-repository";
import { resolveVacationShortlist } from "@/repositories/firebase/vacation-repository";

const repository = new FirestoreInquiryRepository();

export async function POST(request: Request) {
  const denied = await checkPublicRequest(request); if (denied) return denied;
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientKey = forwardedFor || "unknown";
  const rateLimit = await consumeRateLimit(clientKey);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  try {
    const body: unknown = await request.json();
    const result = inquirySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Please check the highlighted information.", issues: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (!isFirebaseAdminConfigured) {
      return NextResponse.json(
        { error: "Online enquiries are being configured. Please contact TLC by WhatsApp or phone." },
        { status: 503 }
      );
    }

    const attribution = Object.fromEntries(
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
        .map((key) => [key, request.headers.get(`x-${key.replace("_", "-")}`)])
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
    );

    let vacation;
    if (result.data.vacationSelection) {
      try { vacation = await resolveVacationShortlist(result.data.vacationSelection); }
      catch { return NextResponse.json({ error: "Your selected options are unavailable or the search expired. Please find options again." }, { status: 400 }); }
    }
    const inquiry = await repository.create(result.data, {
      vacation,
      idempotencyKey: request.headers.get("Idempotency-Key")?.slice(0,128) || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
      attribution,
    });

    return NextResponse.json({ ok: true, inquiryId: inquiry.id, message: "Your request is now with the TLC planning desk." }, { status: 201 });
  } catch (error) {
    console.error("Inquiry submission failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "We couldn't save your request. Please try WhatsApp or call TLC." }, { status: 500 });
  }
}
