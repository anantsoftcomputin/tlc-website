import "server-only";
import { createHash } from "node:crypto";
import { getAppCheck } from "firebase-admin/app-check";
import { Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
  getAdminApp,
  getAdminFirestore,
  isFirebaseAdminConfigured,
} from "@/lib/firebase/admin";
import { hasTrustedOrigin } from "./request-origin";
import { consumeRateLimit } from "./rate-limit";
import { appCheckMode } from "./app-check-policy";
let warned = false;
export async function checkPublicRequest(request: Request) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  if (
    appCheckMode() === "off" &&
    process.env.NODE_ENV === "production" &&
    !warned
  ) {
    warned = true;
    console.warn("App Check enforcement is off for public endpoints.");
  }
  if (appCheckMode() === "enforce") {
    try {
      const token = request.headers.get("X-Firebase-AppCheck");
      if (!token) throw new Error("missing");
      await getAppCheck(getAdminApp()).verifyToken(token);
    } catch {
      return NextResponse.json(
        { error: "Please refresh the page to verify this request." },
        { status: 403 },
      );
    }
  }
  return null;
}
export async function consumePublicRateLimit(
  key: string,
  limit = 5,
  windowMs = 10 * 60 * 1000,
) {
  if (!isFirebaseAdminConfigured) return consumeRateLimit(key, limit, windowMs);
  const now = Date.now();
  const id = createHash("sha256")
    .update(`${process.env.TLC_ORG_ID || "tlc-vacations"}:${key}`)
    .digest("hex");
  const db = getAdminFirestore();
  const ref = db.collection("publicRateLimits").doc(id);
  return db.runTransaction(async (transaction) => {
    const data = (await transaction.get(ref)).data();
    const active = data && Number(data.resetAt) > now;
    const count = active ? Number(data.count) : 0;
    const resetAt = active ? Number(data.resetAt) : now + windowMs;
    if (count >= limit)
      return { allowed: false, retryAfter: Math.ceil((resetAt - now) / 1000) };
    transaction.set(ref, {
      count: count + 1,
      resetAt,
      expiresAt: Timestamp.fromMillis(resetAt),
    });
    return { allowed: true, retryAfter: 0 };
  });
}
