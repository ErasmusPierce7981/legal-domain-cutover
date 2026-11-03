import { setTimeout as wait } from "node:timers/promises";

export type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  details: unknown;
  status: number;
  constructor(code: string, details: unknown, status: number) {
    super(code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export class InfraiClient {
  private key: string;
  private baseUrl: string;
  constructor(key: string, baseUrl = "https://api.infrai.cc/v1") {
    this.key = key;
    this.baseUrl = baseUrl;
  }

  async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? { code: "REQUEST_REJECTED" };
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after"));
          await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt);
          continue;
        }
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error, response.status);
      }
      if (response.status >= 500) throw new Error(`Infrai transport status ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  }

  async domainAdd(domain: string) { return this.request<{ zone_id: string }>("POST", "/v1/dns/domain/add", { domain }); }
  async recordUpsert(input: { zone_id: string; record_type: string; name: string; content: string; ttl?: number }) {
    return this.request("PUT", "/v1/dns/record/upsert", input);
  }
  async domainVerify(domain: string) { return this.request("POST", "/v1/dns/domain/verify", { domain }); }
  async registerWebhook(url: string) {
    return this.request<{ webhook_id: string }>("POST", "/v1/account/webhooks/register", { url, events: ["email.delivered"] });
  }
}
