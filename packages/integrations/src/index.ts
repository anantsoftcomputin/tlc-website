export type SourcedResult<T> = { data: T; source: string; fetchedAt: string };

export interface HealthCheckableProvider {
  readonly key: string;
  healthCheck(): Promise<{ ok: boolean; reasoning: string }>;
}

export class MockProvider implements HealthCheckableProvider {
  readonly key = "mock";
  async healthCheck() { return { ok: true, reasoning: "Deterministic local mock is available." }; }
}

export type InboundLeadSource = "website" | "email" | "whatsapp" | "social" | "phone" | "walkin" | "api" | "chatbot";

export type InboundLeadEnvelope = {
  externalId: string;
  source: InboundLeadSource;
  receivedAt: string;
  customer: { fullName: string; phone: string; email?: string };
  destinations: string[];
  requirements?: string;
  metadata: Record<string, string>;
};

export interface InboundLeadAdapter<TPayload = unknown> {
  readonly key: string;
  verify(payload: TPayload, headers?: Record<string, string>): Promise<boolean>;
  parse(payload: TPayload): Promise<InboundLeadEnvelope[]>;
}

export class MockWhatsAppInboundAdapter implements InboundLeadAdapter<Record<string, unknown>> {
  readonly key = "mock-whatsapp";
  async verify() { return true; }
  async parse(payload: Record<string, unknown>) {
    return [{
      externalId: String(payload.id || `mock-${Date.now()}`), source: "whatsapp" as const,
      receivedAt: String(payload.receivedAt || new Date().toISOString()),
      customer: { fullName: String(payload.fullName || "WhatsApp traveller"), phone: String(payload.phone || "") },
      destinations: Array.isArray(payload.destinations) ? payload.destinations.map(String) : [],
      requirements: payload.message ? String(payload.message) : undefined, metadata: { adapter: this.key },
    }];
  }
}

export class GmailInboundAdapter implements InboundLeadAdapter<Record<string, unknown>> {
  readonly key = "gmail";
  async verify(_payload: Record<string, unknown>, headers: Record<string, string> = {}) { return Boolean(headers["x-goog-channel-token"]); }
  async parse(payload: Record<string, unknown>) {
    return [{
      externalId: String(payload.messageId || payload.id || ""), source: "email" as const,
      receivedAt: String(payload.receivedAt || new Date().toISOString()),
      customer: { fullName: String(payload.fromName || "Email traveller"), phone: String(payload.phone || ""), ...(payload.fromEmail ? { email: String(payload.fromEmail) } : {}) },
      destinations: Array.isArray(payload.destinations) ? payload.destinations.map(String) : [],
      requirements: payload.subject || payload.body ? [payload.subject, payload.body].filter(Boolean).map(String).join("\n\n") : undefined,
      metadata: { adapter: this.key },
    }];
  }
}

export class SocialInboundAdapter implements InboundLeadAdapter<Record<string, unknown>> {
  readonly key = "social";
  async verify(_payload: Record<string, unknown>, headers: Record<string, string> = {}) { return Boolean(headers["x-provider-signature"]); }
  async parse(payload: Record<string, unknown>) {
    return [{
      externalId: String(payload.id || ""), source: "social" as const, receivedAt: String(payload.receivedAt || new Date().toISOString()),
      customer: { fullName: String(payload.fullName || "Social traveller"), phone: String(payload.phone || "") },
      destinations: Array.isArray(payload.destinations) ? payload.destinations.map(String) : [], requirements: payload.message ? String(payload.message) : undefined,
      metadata: { adapter: String(payload.provider || this.key) },
    }];
  }
}
