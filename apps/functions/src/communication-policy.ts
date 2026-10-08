import { createHmac, timingSafeEqual } from "node:crypto";

export function validEmailWebhook(
  raw: Buffer,
  headers: { id?: string; timestamp?: string; signature?: string },
  secret: string,
  now = Date.now(),
) {
  if (
    !headers.id ||
    !headers.timestamp ||
    !headers.signature ||
    !secret.startsWith("whsec_")
  )
    return false;
  const seconds = Number(headers.timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > 300)
    return false;
  const expected = createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
    .update(`${headers.id}.${headers.timestamp}.`)
    .update(raw)
    .digest();
  return headers.signature.split(" ").some((item) => {
    const [version, encoded] = item.split(",");
    if (version !== "v1" || !encoded) return false;
    const supplied = Buffer.from(encoded, "base64");
    return (
      supplied.length === expected.length && timingSafeEqual(expected, supplied)
    );
  });
}

export function normalizeChannelAddress(
  channel: "whatsapp" | "email",
  address: string,
) {
  if (channel === "whatsapp") {
    const digits = address.replace(/^\+/, "");
    if (!/^\d{8,15}$/.test(digits))
      throw new Error("Invalid WhatsApp address.");
    return digits;
  }
  const email = (address.match(/<([^<>]+)>/)?.[1] || address)
    .trim()
    .toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 254)
    throw new Error("Invalid email address.");
  return email;
}

export function communicationIntent(body: string) {
  const text = body.trim();
  return {
    optOut: /^(stop|unsubscribe|stop promotions|remove me)[.!\s]*$/i.test(text),
    human: /\b(human|agent|person|expert|complaint|refund|emergency)\b/i.test(
      text,
    ),
  };
}

export function deliveryStatusCanAdvance(current: string, next: string) {
  const ranks: Record<string, number> = {
    queued: 0,
    pending_configuration: 0,
    sending: 1,
    unknown: 1,
    sent: 2,
    delivered: 3,
    read: 4,
  };
  if (next === "failed") return current !== "read" && current !== "delivered";
  return next in ranks && ranks[next] > (ranks[current] ?? -1);
}
