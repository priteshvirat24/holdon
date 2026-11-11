/**
 * PayPal REST client (sandbox).
 * - OAuth client-credentials token, cached until ~1 min before expiry.
 * - Every mutation carries a PayPal-Request-Id for idempotency.
 * - Every call is written to the audit log.
 */
import "server-only";
import { logEvent } from "../events";

const BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

export function paypalMode(): "sandbox" | "simulated" {
  return process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? "sandbox" : "simulated";
}

export class PayPalError extends Error {
  constructor(
    public status: number,
    public body: any,
    public path: string,
  ) {
    super(`PayPal ${status} on ${path}: ${body?.name || ""} ${body?.message || JSON.stringify(body)?.slice(0, 300)}`);
  }
}

let token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const body = await res.json();
  if (!res.ok) throw new PayPalError(res.status, body, "/v1/oauth2/token");
  token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return token.value;
}

export async function paypal<T = any>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: { body?: unknown; requestId?: string; familyId?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getToken()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;

  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    if (res.status < 500) break;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  const text = await res!.text();
  const body = text ? safeJson(text) : null;

  await logEvent({
    familyId: opts.familyId ?? null,
    type: `paypal.${method} ${path.replace(/[A-Z0-9]{10,}/g, ":id")}`,
    source: "paypal",
    payload: { status: res!.status, debug_id: res!.headers.get("paypal-debug-id"), path },
  });

  if (!res!.ok) throw new PayPalError(res!.status, body, path);
  return body as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t };
  }
}
