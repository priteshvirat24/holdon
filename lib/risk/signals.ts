/**
 * External signals for the risk engine:
 * - RDAP: domain registration date (free, no key)
 * - Channel3: market price baseline (median of in-stock offers)
 * - Page text: what the shop page actually says (fed to the AI judge as DATA)
 */
import "server-only";
import { logEvent } from "../events";

// ------------------------------------------------------------------ RDAP

export async function domainRegisteredAt(domain: string): Promise<Date | null> {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const reg = (data.events ?? []).find((e: any) => e.eventAction === "registration");
    return reg?.eventDate ? new Date(reg.eventDate) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ Channel3

export interface MarketBaseline {
  medianCents: number;
  samples: number;
  source: "channel3" | "seed";
  examples: { title: string; domain: string; priceCents: number; url: string }[];
}

export function channel3Configured() {
  return !!process.env.CHANNEL3_API_KEY;
}

export interface Channel3Product {
  id: string;
  title: string;
  image: string | null;
  offers: { url: string; domain: string; priceCents: number; inStock: boolean }[];
}

export async function channel3Search(query: string, limit = 10, familyId?: string): Promise<Channel3Product[]> {
  if (!channel3Configured()) return [];
  const started = Date.now();
  const res = await fetch("https://api.trychannel3.com/v1/search", {
    method: "POST",
    headers: {
      "x-api-key": process.env.CHANNEL3_API_KEY!,
      "Content-Type": "application/json",
      ...(familyId ? { "x-user-id": familyId } : {}),
    },
    body: JSON.stringify({ query, limit }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    await logEvent({ familyId: familyId ?? null, type: "channel3.search.error", source: "agent", payload: { status: res.status, query } });
    return [];
  }
  const data = await res.json();
  const products: Channel3Product[] = (data.products ?? []).map((p: any) => ({
    id: p.id,
    title: p.title,
    image: (p.images ?? []).find((i: any) => i.is_main_image)?.url ?? p.images?.[0]?.url ?? null,
    offers: (p.offers ?? [])
      .filter((o: any) => typeof o?.price?.price === "number")
      .map((o: any) => ({
        url: o.url,
        domain: o.domain,
        priceCents: Math.round(o.price.price * 100),
        inStock: o.availability !== "OutOfStock",
      })),
  }));
  await logEvent({ familyId: familyId ?? null, type: "channel3.search", source: "agent", payload: { query, results: products.length, ms: Date.now() - started } });
  return products;
}

export async function marketBaseline(query: string, familyId?: string, seedCents?: number | null): Promise<MarketBaseline | null> {
  const products = await channel3Search(query, 15, familyId).catch(() => []);
  const offers = products.flatMap((p) => p.offers.filter((o) => o.inStock).map((o) => ({ ...o, title: p.title })));
  if (offers.length >= 3) {
    const prices = offers.map((o) => o.priceCents).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
    return {
      medianCents: median,
      samples: offers.length,
      source: "channel3",
      examples: offers.slice(0, 3).map((o) => ({ title: o.title, domain: o.domain, priceCents: o.priceCents, url: o.url })),
    };
  }
  if (seedCents) return { medianCents: seedCents, samples: 0, source: "seed", examples: [] };
  return null;
}

// ------------------------------------------------------------------ Page text

export async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "HoldOn-RiskCheck/1.0" } });
    const html = await res.text();
    return htmlToText(html).slice(0, 6000);
  } catch {
    return "";
  }
}

export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " [html comment: $1] ") // comments can hide injections; keep them visible to the judge
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
