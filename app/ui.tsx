"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export const dollars = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 });

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/** Poll the whole family snapshot. Cheap, and keeps every screen in sync during the demo. */
export function useSnapshot(intervalMs = 1500) {
  const [snap, setSnap] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const s = await api("/api/state");
      if (alive.current) {
        setSnap(s);
        setError(null);
      }
    } catch (e: any) {
      if (alive.current) setError(e.message);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [refresh, intervalMs]);
  return { snap, error, refresh };
}

const STATE_TONE: Record<string, string> = {
  CAPTURED: "bg-sage-soft text-sage",
  AUTO_APPROVED: "bg-sage-soft text-sage",
  HELD_APPROVED: "bg-sage-soft text-sage",
  HELD_FOR_FAMILY: "bg-coral-soft text-coral",
  SCORING: "bg-sky-soft text-sky",
  AUTHORIZED: "bg-sky-soft text-sky",
  AWAITING_BUYER: "bg-marigold-soft text-[#8a5a00]",
  VOIDED: "bg-[#efe9df] text-muted",
  DECLINED: "bg-[#efe9df] text-muted",
  TIMED_OUT: "bg-[#efe9df] text-muted",
  HARD_BLOCKED: "bg-coral-soft text-coral",
  FAILED: "bg-coral-soft text-coral",
  paid: "bg-sage-soft text-sage",
  sent: "bg-marigold-soft text-[#8a5a00]",
  cancelled: "bg-[#efe9df] text-muted",
  covered: "bg-sky-soft text-sky",
};

export function Pill({ state, label }: { state: string; label?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_TONE[state] ?? "bg-[#efe9df] text-muted"}`}>
      {label ?? state.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

export function ModeBadge({ integrations }: { integrations?: any }) {
  if (!integrations) return null;
  const sim = integrations.paypal === "simulated";
  return (
    <span
      title={sim ? "No PayPal keys configured: payments are simulated" : "Real PayPal sandbox API calls"}
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${sim ? "bg-coral-soft text-coral" : "bg-sky-soft text-sky"}`}
    >
      {sim ? "SIMULATED PAYMENTS" : "PAYPAL SANDBOX · LIVE"}
    </span>
  );
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`font-display font-semibold tracking-tight ${small ? "text-lg" : "text-2xl"}`}>
      Hold<span className="text-marigold">On</span>
    </span>
  );
}
