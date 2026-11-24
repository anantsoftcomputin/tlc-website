import { gzipSync } from "node:zlib";
import type { TboExchange } from "@tlc/integrations";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const app = getApps()[0] ?? initializeApp();

const chunkBytes = 300_000;
/** A Firestore commit is limited to about 10 MiB; 20 base64 chunks stay near 8 MB. */
const maxChunks = 20;

/** Masks guest identity numbers; they must not sit in cloud logs, redacted or not. */
export function redactTboIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactTboIdentity);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) =>
    /^(pan|passportno|gstnumber)$/i.test(key) && typeof item === "string" && item ? [key, "[redacted]"] : [key, redactTboIdentity(item)]));
}

/**
 * Stores redacted TBO request/response pairs when TBO_LOG_TRAFFIC=true. TBO asks for these
 * JSON logs (per TraceId) during sample verification and certification. Kept 30 days.
 */
export function tboExchangeSink(context?: { runId: string; caseId: string }) {
  if (process.env.TBO_LOG_TRAFFIC !== "true") return undefined;
  return async (exchange: TboExchange) => {
    const ref = getFirestore(app).collection("tboApiLogs").doc();
    const { request, response, ...metadata } = exchange;
    // Compress, then chunk, rather than truncating JSON or exceeding Firestore's document limit.
    const payload = gzipSync(Buffer.from(JSON.stringify({ request: redactTboIdentity(request), response: redactTboIdentity(response) }), "utf8"));
    const count = Math.ceil(payload.length / chunkBytes);
    const expiresAt = Timestamp.fromMillis(Date.now() + 30 * 86_400_000);
    // An oversized exchange keeps its metadata so the gap is visible instead of the write failing silently.
    const parts = count > maxChunks ? [] : Array.from({ length: count }, (_, index) => payload.subarray(index * chunkBytes, (index + 1) * chunkBytes).toString("base64"));
    const batch = getFirestore(app).batch();
    batch.set(ref, {
      id: ref.id, ...metadata, ...context,
      payloadEncoding: "gzip-base64-chunks", payloadParts: parts.length,
      ...(count > maxChunks ? { payloadOmitted: true, payloadBytes: payload.length } : {}),
      expiresAt,
    });
    // Same collection keeps TTL applicable to payload chunks too.
    parts.forEach((data, index) => batch.set(ref.parent.doc(`${ref.id}-part-${index}`), { parentId: ref.id, part: index, data, expiresAt }));
    await batch.commit();
  };
}
