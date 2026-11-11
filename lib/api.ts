import "server-only";
import { NextResponse } from "next/server";
import { PayPalError } from "./paypal/client";

/** Wrap a route handler: JSON in/out, errors become { error } with a useful status. */
export function route<C>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e: any) {
      const status = e instanceof PayPalError ? (e.status >= 400 && e.status < 500 ? 422 : 502) : 400;
      const body =
        e instanceof PayPalError
          ? { error: e.message, paypalIssue: e.issue, debugId: e.debugId }
          : { error: e?.message ?? "Something went wrong" };
      console.error("[api]", req.method, new URL(req.url).pathname, body);
      return NextResponse.json(body, { status });
    }
  };
}

export async function body<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
