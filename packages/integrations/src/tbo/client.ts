import type { TboConfig } from "./config.js";

export type TboFetch = typeof fetch;

export class TboError extends Error {
  constructor(message: string, readonly code?: string | number, readonly traceId?: string) {
    super(message);
    this.name = "TboError";
  }
}

const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

/** TBO tokens are valid for the calendar day (IST); one token per day is expected. */
export function istDay(date: Date) {
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export type TboExchange = { runId?: string; caseId?: string; httpMethod?: string; sessionId?: string; networkError?: string; method: string; url: string; request: unknown; response: unknown; status: number; startedAt: string; durationMs: number; traceId?: string };

/** Removes credentials and tokens before any request/response is logged. */
export function redactTbo(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactTbo);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) =>
    /^(password|tokenid|authorization)$/i.test(key) ? [key, "[redacted]"] : [key, redactTbo(item)]));
}

export class TboClient {
  private token?: { value: string; day: string };
  private tokenRequest?: Promise<string>;
  /** Optional sink for certification logs (TBO asks for request/response JSON per test case). */
  onExchange?: (exchange: TboExchange) => void | Promise<void>;
  certificationContext?: { runId: string; caseId: string };
  /** Certification runs fail if evidence cannot be persisted. */
  requireEvidence = false;
  constructor(
    readonly config: TboConfig,
    private readonly http: TboFetch = fetch,
    private readonly now: () => Date = () => new Date(),
    private readonly timeoutMs = 45_000,
    private readonly maxTimeoutMs = Infinity,
  ) {}

  async post<T>(url: string, body: unknown, auth: "api" | "static" | "none" = "none", timeoutMs = this.timeoutMs): Promise<T> {
    return this.exchange<T>("POST", url, body, auth, timeoutMs);
  }

  async get<T>(url: string, auth: "static"): Promise<T> {
    return this.exchange<T>("GET", url, null, auth, this.timeoutMs);
  }

  private async exchange<T>(httpMethod: string, url: string, body: unknown, auth: "api" | "static" | "none", timeoutMs: number): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": "gzip" };
    if (auth === "api") headers.Authorization = basic(this.config.apiUsername, this.config.apiPassword);
    if (auth === "static") headers.Authorization = basic(this.config.staticUsername, this.config.staticPassword);
    const startedAt = this.now();
    const context = this.certificationContext ? { ...this.certificationContext } : {};
    let response: Response | undefined;
    let parsed: unknown = null;
    let failure: unknown;
    let nonJson = false;
    try {
      response = await this.http(url, {
        method: httpMethod, headers,
        ...(httpMethod === "POST" ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(Math.min(timeoutMs, this.maxTimeoutMs)),
      });
      const raw = await response.text();
      try { parsed = JSON.parse(raw); }
      catch { parsed = raw; nonJson = true; }
    } catch (error) { failure = error; }
    const findTrace = (value: unknown): string | undefined => {
      if (!value || typeof value !== "object") return undefined;
      const record = value as Record<string, unknown>;
      if (typeof record.TraceId === "string") return record.TraceId;
      for (const nested of Object.values(record)) {
        const trace = findTrace(nested);
        if (trace) return trace;
      }
      return undefined;
    };
    const sessionId = response?.headers.get("sessionId") || response?.headers.get("session-id");
    const traceId = findTrace(body) || findTrace(parsed);
    if (this.onExchange) {
      const evidence: TboExchange = {
        ...context, httpMethod, method: url.replace(/\/+$/, "").split("/").pop() || url, url,
        request: redactTbo(body), response: redactTbo(parsed), status: response?.status || 0,
        startedAt: startedAt.toISOString(), durationMs: this.now().getTime() - startedAt.getTime(),
        ...(traceId ? { traceId } : {}), ...(sessionId ? { sessionId } : {}),
        ...(failure ? { networkError: failure instanceof Error ? failure.name : "NetworkError" } : {}),
      };
      try { await this.onExchange(evidence); }
      catch {
        if (this.requireEvidence) throw new TboError("Certification evidence persistence failed; supplier outcome may be unknown. Reconcile before retrying.", "EVIDENCE_PERSISTENCE");
      }
    }
    if (failure) throw failure;
    if (!response?.ok) throw new TboError(`TBO request failed (${response?.status}).`, response?.status);
    if (nonJson) throw new TboError("TBO returned a response that is not JSON.");
    return parsed as T;
  }

  /** Shared-API token used by air methods and hotel booking-detail/change requests. */
  async tokenId() {
    const day = istDay(this.now());
    if (this.token?.day === day) return this.token.value;
    if (this.tokenRequest) return this.tokenRequest;
    this.tokenRequest = this.authenticate(day);
    try { return await this.tokenRequest; }
    finally { this.tokenRequest = undefined; }
  }

  private async authenticate(day: string) {
    const result = await this.post<{ Status: number; TokenId?: string; Error?: { ErrorCode: number; ErrorMessage: string } }>(
      this.config.urls.authenticate,
      { ClientId: this.config.clientId, UserName: this.config.apiUsername, Password: this.config.apiPassword, EndUserIp: this.config.endUserIp },
    );
    if (result.Status !== 1 || !result.TokenId)
      throw new TboError(result.Error?.ErrorMessage || "TBO authentication failed.", result.Error?.ErrorCode);
    this.token = { value: result.TokenId, day };
    return result.TokenId;
  }

  forgetToken() {
    this.token = undefined;
  }
}

export function assertTboOk(response: { Error?: { ErrorCode?: number; ErrorMessage?: string }; ResponseStatus?: number; TraceId?: string } | undefined, action: string) {
  if (!response) throw new TboError(`TBO ${action} returned no response.`);
  if (response.Error?.ErrorCode && response.Error.ErrorCode !== 0)
    throw new TboError(`TBO ${action}: ${response.Error.ErrorMessage || "request rejected"}.`, response.Error.ErrorCode, response.TraceId);
  if (response.ResponseStatus !== undefined && response.ResponseStatus !== 1)
    throw new TboError(`TBO ${action} did not succeed (status ${response.ResponseStatus}).`, response.ResponseStatus, response.TraceId);
}
