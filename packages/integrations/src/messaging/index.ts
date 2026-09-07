export type MarketingChannel = "whatsapp" | "email" | "sms";
export type MarketingRecipient = {
  customerId: string;
  channel: MarketingChannel;
  address: string;
  consent: boolean;
  optedOut: boolean;
};
export type MarketingMessage = {
  campaignId: string;
  body: string;
  subject?: string;
  templateName?: string;
};
export type DeliveryReceipt = {
  externalId: string;
  status: "sent" | "delivered";
  source: string;
  fetchedAt: string;
  reasoning: string;
};

export interface MarketingMessagingProvider {
  readonly key: string;
  send(
    recipient: MarketingRecipient,
    message: MarketingMessage,
  ): Promise<DeliveryReceipt>;
}

export class MockMarketingMessagingProvider implements MarketingMessagingProvider {
  readonly key = "mock-marketing";
  constructor(private readonly clock: () => Date = () => new Date()) {}
  async send(recipient: MarketingRecipient, message: MarketingMessage) {
    if (!recipient.consent || recipient.optedOut)
      throw new Error("Recipient is not eligible for this channel.");
    return {
      externalId: `mock-${message.campaignId}-${recipient.customerId}`,
      status: "delivered" as const,
      source: this.key,
      fetchedAt: this.clock().toISOString(),
      reasoning:
        "Deterministic mock delivery; no external customer message was sent.",
    };
  }
}

export class MetaWhatsAppMarketingProvider implements MarketingMessagingProvider {
  readonly key = "meta-whatsapp-cloud";
  constructor(
    private readonly config: {
      phoneNumberId: string;
      accessToken: string;
      apiVersion?: string;
    },
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async send(recipient: MarketingRecipient, message: MarketingMessage) {
    if (!recipient.consent || recipient.optedOut)
      throw new Error("Recipient is not eligible for this channel.");
    if (recipient.channel !== "whatsapp" || !message.templateName)
      throw new Error(
        "Meta WhatsApp marketing requires an approved template name.",
      );
    const response = await fetch(
      `https://graph.facebook.com/${this.config.apiVersion || "v23.0"}/${this.config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient.address,
          type: "template",
          template: { name: message.templateName, language: { code: "en" } },
        }),
      },
    );
    const payload = (await response.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string };
    };
    if (!response.ok || !payload.messages?.[0]?.id)
      throw new Error(
        payload.error?.message || "Meta WhatsApp delivery failed.",
      );
    return {
      externalId: payload.messages[0].id,
      status: "sent" as const,
      source: this.key,
      fetchedAt: this.clock().toISOString(),
      reasoning:
        "Accepted by Meta WhatsApp Cloud API using the approved campaign template.",
    };
  }
}

export class ResendEmailMarketingProvider implements MarketingMessagingProvider {
  readonly key = "resend-email";
  constructor(
    private readonly config: { apiKey: string; from: string },
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async send(recipient: MarketingRecipient, message: MarketingMessage) {
    if (!recipient.consent || recipient.optedOut)
      throw new Error("Recipient is not eligible for this channel.");
    if (recipient.channel !== "email" || !message.subject)
      throw new Error("Email marketing requires a subject.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [recipient.address],
        subject: message.subject,
        html: message.body,
      }),
    });
    const payload = (await response.json()) as {
      id?: string;
      message?: string;
    };
    if (!response.ok || !payload.id)
      throw new Error(payload.message || "Email delivery failed.");
    return {
      externalId: payload.id,
      status: "sent" as const,
      source: this.key,
      fetchedAt: this.clock().toISOString(),
      reasoning: "Accepted by the configured transactional email provider.",
    };
  }
}
