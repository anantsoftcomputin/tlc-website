import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { journeyPlanSchema } from "@tlc/shared";
import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import {
  checkPublicRequest,
  consumePublicRateLimit,
} from "@/lib/security/public-request";
import { conversationSession } from "@/lib/security/conversation-session";
import { getPublicContent } from "@/lib/public-content";
import { planJourney } from "@/lib/ai/journey-engine";
import { assertJourneyGrounded } from "@/lib/travel/journey-planner";
import {
  JourneyAccessError,
  JourneyConflict,
  listJourneys,
  readJourney,
  saveJourney,
  shareJourney,
} from "@/repositories/firebase/journey-repository";

export const maxDuration = 60;
const schema = z.object({
  sessionId: z.string().uuid(),
  planId: z.string().uuid().optional(),
  revision: z.number().int().min(0).default(0),
  requestId: z.string().uuid(),
  action: z.enum(["generate", "save", "share", "unshare"]),
  message: z.string().trim().min(1).max(2000).optional(),
  plan: journeyPlanSchema.optional(),
});
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = z
      .string()
      .uuid()
      .parse(url.searchParams.get("sessionId"));
    await conversationSession(request, sessionId);
    const id = url.searchParams.get("id");
    return NextResponse.json(
      id
        ? { record: await readJourney(z.string().uuid().parse(id), sessionId) }
        : { records: await listJourneys(sessionId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Your saved trip could not be opened." },
      { status: 404 },
    );
  }
}
export async function POST(request: Request) {
  const denied = await checkPublicRequest(request);
  if (denied) return denied;
  if (!isFirebaseAdminConfigured)
    return NextResponse.json(
      {
        error:
          "Saved trip planning is being configured. You can still browse TLC’s trips or send a travel brief.",
      },
      { status: 503 },
    );
  try {
    const input = schema.parse(await request.json());
    await conversationSession(request, input.sessionId);
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (
      !(await consumePublicRateLimit(`journey:${input.sessionId}`, 40, 600000))
        .allowed ||
      !(await consumePublicRateLimit(`journey-ip:${ip}`, 80, 600000)).allowed
    )
      return NextResponse.json(
        { error: "Please wait a moment before making more changes." },
        { status: 429 },
      );
    if (input.action === "share" || input.action === "unshare") {
      if (!input.planId) throw new Error("Save the trip first.");
      return NextResponse.json({
        token: await shareJourney(
          input.planId,
          input.sessionId,
          input.revision,
          input.action === "unshare",
        ),
      });
    }
    const current = input.planId
      ? await readJourney(input.planId, input.sessionId)
      : undefined;
    if (current && current.revision !== input.revision)
      throw new JourneyConflict(
        "This trip changed in another tab. Reload it before editing.",
      );
    const content = await getPublicContent();
    let plan = input.plan;
    let message = "Your changes are saved.";
    let question = "";
    let usedModel = false;
    if (input.action === "generate") {
      if (!input.message)
        throw new Error("Tell Tara what you would like to plan.");
      const result = await planJourney(
        input.message,
        content.destinations,
        current?.plan,
      );
      plan = result.plan;
      message = result.message;
      question = result.question;
      usedModel = result.usedModel;
    }
    if (!plan) return NextResponse.json({ message, question, usedModel });
    assertJourneyGrounded(plan, content.destinations);
    const messages = [
      ...(current?.messages || []),
      ...(input.message
        ? [{ role: "user" as const, content: input.message }]
        : []),
      { role: "assistant" as const, content: message },
    ];
    const record = await saveJourney({
      id: input.planId || input.requestId || randomUUID(),
      sessionId: input.sessionId,
      revision: input.revision,
      requestId: input.requestId,
      plan,
      messages,
    });
    return NextResponse.json(
      { record, message, question, usedModel },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof JourneyConflict ||
          error instanceof JourneyAccessError
            ? error.message
            : "We couldn’t save that change. Check your trip details and try again.",
      },
      {
        status:
          error instanceof JourneyConflict
            ? 409
            : error instanceof JourneyAccessError
              ? 404
              : 400,
      },
    );
  }
}
