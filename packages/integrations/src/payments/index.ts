import {
  sourced,
  systemProviderClock,
  type HealthCheckableProvider,
  type ProviderClock,
  type SourcedResult,
} from "../common.js";

export type PaymentLinkRequest = {
  referenceId: string;
  amount: number;
  currency: string;
  description: string;
  customer: { name: string; email?: string; phone?: string };
  callbackUrl?: string;
  expiresAt?: string;
};
export type PaymentLink = {
  providerRef: string;
  url: string;
  status: "created" | "pending" | "captured" | "cancelled";
};
export interface PaymentProvider extends HealthCheckableProvider {
  createLink(request: PaymentLinkRequest): Promise<SourcedResult<PaymentLink>>;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly key = "mock-payment";
  constructor(private readonly clock: ProviderClock = systemProviderClock) {}
  async healthCheck() {
    return {
      ok: true,
      reasoning: "Deterministic mock payment links are available.",
    };
  }
  async createLink(request: PaymentLinkRequest) {
    return sourced(
      {
        providerRef: `mock_${request.referenceId}`,
        url: `${request.callbackUrl || "https://tlcholidays.in"}?mockPayment=${encodeURIComponent(request.referenceId)}`,
        status: "created" as const,
      },
      this.key,
      this.clock,
    );
  }
}

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly key = "razorpay";
  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly clock: ProviderClock = systemProviderClock,
  ) {}
  async healthCheck() {
    return {
      ok: Boolean(this.keyId && this.keySecret),
      reasoning: "Razorpay API credentials are configured.",
    };
  }
  async createLink(request: PaymentLinkRequest) {
    const response = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(request.amount * 100),
        currency: request.currency,
        accept_partial: false,
        reference_id: request.referenceId.slice(0, 40),
        description: request.description,
        customer: {
          name: request.customer.name,
          email: request.customer.email,
          contact: request.customer.phone,
        },
        expire_by: request.expiresAt
          ? Math.floor(Date.parse(request.expiresAt) / 1000)
          : undefined,
        callback_url: request.callbackUrl,
        callback_method: request.callbackUrl ? "get" : undefined,
        reminder_enable: true,
        notes: { tlc_reference: request.referenceId },
      }),
    });
    if (!response.ok)
      throw new Error(
        `Razorpay payment-link request failed (${response.status}).`,
      );
    const body = (await response.json()) as {
      id: string;
      short_url: string;
      status: string;
    };
    const status: PaymentLink["status"] =
      body.status === "paid" ? "captured" : "created";
    return sourced(
      { providerRef: body.id, url: body.short_url, status },
      this.key,
      this.clock,
    );
  }
}
