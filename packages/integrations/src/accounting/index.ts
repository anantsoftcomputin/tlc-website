import {
  sourced,
  systemProviderClock,
  type HealthCheckableProvider,
  type ProviderClock,
  type SourcedResult,
} from "../common.js";

export type AccountingDocumentType =
  "invoice" | "bill" | "payment" | "creditNote" | "supplierSettlement";
export type AccountingPushRequest = {
  idempotencyKey: string;
  type: AccountingDocumentType;
  number: string;
  date: string;
  currency: string;
  amount: number;
  partyName: string;
  payload: Record<string, unknown>;
};
export interface AccountingProvider extends HealthCheckableProvider {
  push(
    request: AccountingPushRequest,
  ): Promise<SourcedResult<{ externalId: string; status: "synced" }>>;
}

export class MockAccountingProvider implements AccountingProvider {
  readonly key = "mock";
  constructor(private readonly clock: ProviderClock = systemProviderClock) {}
  async healthCheck() {
    return {
      ok: true,
      reasoning: "Deterministic mock accounting is available.",
    };
  }
  async push(request: AccountingPushRequest) {
    return sourced(
      {
        externalId: `mock_${request.idempotencyKey}`,
        status: "synced" as const,
      },
      this.key,
      this.clock,
    );
  }
}

export class ZohoBooksProvider implements AccountingProvider {
  readonly key = "zohoBooks";
  constructor(
    private readonly accessToken: string,
    private readonly organizationId: string,
    private readonly baseUrl = "https://www.zohoapis.in/books/v3",
    private readonly clock: ProviderClock = systemProviderClock,
  ) {}
  async healthCheck() {
    return {
      ok: Boolean(this.accessToken && this.organizationId),
      reasoning: "Zoho Books credentials are configured.",
    };
  }
  async push(request: AccountingPushRequest) {
    const endpoint: Record<AccountingDocumentType, string> = {
      invoice: "invoices",
      bill: "bills",
      payment: "customerpayments",
      creditNote: "creditnotes",
      supplierSettlement: "vendorpayments",
    };
    const response = await fetch(
      `${this.baseUrl}/${endpoint[request.type]}?organization_id=${encodeURIComponent(this.organizationId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${this.accessToken}`,
          "Content-Type": "application/json",
          "X-Unique-Identifier-Key": request.idempotencyKey,
        },
        body: JSON.stringify(request.payload),
      },
    );
    if (!response.ok)
      throw new Error(`Zoho Books sync failed (${response.status}).`);
    const body = (await response.json()) as Record<string, unknown>;
    const record = (body[request.type] ||
      body.invoice ||
      body.bill ||
      body.payment ||
      body.creditnote) as Record<string, unknown> | undefined;
    return sourced(
      {
        externalId: String(
          record?.invoice_id ||
            record?.bill_id ||
            record?.payment_id ||
            record?.creditnote_id ||
            request.idempotencyKey,
        ),
        status: "synced" as const,
      },
      this.key,
      this.clock,
    );
  }
}

export class TallyAccountingProvider implements AccountingProvider {
  readonly key = "tally";
  constructor(
    private readonly endpoint: string,
    private readonly company: string,
    private readonly clock: ProviderClock = systemProviderClock,
  ) {}
  async healthCheck() {
    return {
      ok: Boolean(this.endpoint && this.company),
      reasoning: "Tally bridge endpoint is configured.",
    };
  }
  async push(request: AccountingPushRequest) {
    const safe = (value: string) => value.replace(/[<>&'"]/g, "");
    const xml = `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${safe(this.company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE><VOUCHER REMOTEID="${safe(request.idempotencyKey)}"><DATE>${request.date.replaceAll("-", "")}</DATE><VOUCHERNUMBER>${safe(request.number)}</VOUCHERNUMBER><NARRATION>${safe(request.partyName)}</NARRATION><AMOUNT>${request.amount}</AMOUNT></VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xml,
    });
    if (!response.ok)
      throw new Error(`Tally sync failed (${response.status}).`);
    return sourced(
      { externalId: request.idempotencyKey, status: "synced" as const },
      this.key,
      this.clock,
    );
  }
}
