import type { TboExchange } from "@tlc/integrations";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const app = getApps()[0] ?? initializeApp();

/**
 * Stores redacted TBO request/response pairs when TBO_LOG_TRAFFIC=true. TBO asks for these
 * JSON logs (per TraceId) during sample verification and certification. Kept 30 days.
 */
export function tboExchangeSink() {
  if (process.env.TBO_LOG_TRAFFIC !== "true") return undefined;
  return async (exchange: TboExchange) => {
    const ref = getFirestore(app).collection("tboApiLogs").doc();
    await ref.set({
      id: ref.id,
      ...exchange,
      request: JSON.stringify(exchange.request).slice(0, 900_000),
      response: JSON.stringify(exchange.response).slice(0, 900_000),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86_400_000),
    });
  };
}
