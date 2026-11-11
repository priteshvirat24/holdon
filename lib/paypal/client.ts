import "server-only";
import { logEvent } from "../events";

/** "sandbox" when keys are configured, "simulated" otherwise (labelled SIMULATED in the UI). */
export function paypalMode(): "sandbox" | "live" | "simulated" {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return "simulated";
  return process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
}

const base = () =>
  process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    public status: number,
    public issue: string,
    message: string,
    public debugId?: string,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) throw new PayPalError(res.status, body.error ?? "AUTH_FAILED", body.error_description ?? "PayPal token failed");
  cached = { token: body.access_token, exp: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

/**
 * Call the PayPal REST API.
 * - requestId → PayPal-Request-Id header, so retried writes are idempotent (use a stable key).
 * - familyId → every call is written to the audit log (event table) for the dashboard.
 */
export async function paypal<T = any>( // eslint-disable-line @typescript-eslint/no-explicit-any
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: { body?: unknown; familyId?: string; requestId?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;

  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base()}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
    });
    if (res.status >= 500 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    const debugId = data.debug_id ?? res.headers.get("paypal-debug-id") ?? undefined;
    if (opts.familyId) {
      await logEvent({
        familyId: opts.familyId,
        type: res.ok ? "paypal.call" : "paypal.error",
        source: "paypal",
        payload: { method, path, status: res.status, ms: Date.now() - started, debugId, id: data.id ?? null },
      });
    }
    if (!res.ok) {
      const d = data.details?.[0];
      throw new PayPalError(
        res.status,
        d?.issue ?? data.name ?? data.error ?? "PAYPAL_ERROR",
        d?.description ?? data.message ?? data.error_description ?? `PayPal ${method} ${path} failed (${res.status})`,
        debugId,
      );
    }
    return data as T;
  }
}
