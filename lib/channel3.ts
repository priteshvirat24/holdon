/**
 * Channel3 (real product catalog) on the server, through the official SDK.
 * The key never reaches the browser: the shop UI calls server actions that use this module.
 */
import "server-only";
import { Channel3 } from "@channel3/sdk";
import type { PriceHistoryResponse, Product, ProductOffer } from "@channel3/sdk/resources";
import type { MarketBaseline } from "./risk/signals";
import { domainRegisteredAt } from "./risk/signals";

let client: Channel3 | null = null;

export function c3(): Channel3 {
  const apiKey = process.env.CHANNEL3_API_KEY;
  if (!apiKey) throw new Error("Channel3 isn't set up: add CHANNEL3_API_KEY to .env.local");
  return (client ??= new Channel3({ apiKey }));
}

const inStock = (o: ProductOffer) => o.availability !== "OutOfStock";
const cents = (o: ProductOffer) => Math.round(o.price.price * 100);

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Re-read a product at buy time (free call) so price and buy link come from Channel3, not the browser. */
export async function freshOffer(productId: string, domain: string, selection?: Record<string, string>, userId?: string) {
  const product = await c3().products.retrieve({
    product_id: productId,
    selected_options: selection && Object.keys(selection).length ? selection : undefined,
    "x-user-id": userId,
  });
  const offers = product.offers ?? [];
  const offer = offers.find((o) => o.domain === domain && inStock(o)) ?? offers.find((o) => o.domain === domain);
  if (!offer) throw new Error(`${domain} no longer sells this item`);
  if (offer.price.currency !== "USD") throw new Error("HoldOn's demo family pays in US dollars");
  return { product, offer, priceCents: cents(offer) };
}

export async function priceHistory(productId: string): Promise<PriceHistoryResponse | null> {
  try {
    return await c3().priceTracking.retrieveHistory({ canonical_product_id: productId, days: 90 });
  } catch {
    return null;
  }
}

/**
 * The price check for one exact product: what the other stores selling it charge
 * (and its 90-day typical price when Channel3 has history).
 */
export async function productBaseline(product: Product, excludeDomain?: string): Promise<MarketBaseline | null> {
  const others = (product.offers ?? []).filter((o) => inStock(o) && o.price.currency === "USD" && o.domain !== excludeDomain);
  const prices = others.map(cents);
  const hist = await priceHistory(product.id);
  const mean = hist?.statistics?.mean;
  if (prices.length >= 2 || (prices.length >= 1 && mean)) {
    const pool = mean ? [...prices, Math.round(mean * 100)] : prices;
    return {
      medianCents: median(pool),
      samples: pool.length,
      source: "channel3",
      examples: others.slice(0, 3).map((o) => ({ title: product.title, domain: o.domain, priceCents: cents(o), url: o.url })),
    };
  }
  if (mean) return { medianCents: Math.round(mean * 100), samples: 1, source: "channel3", examples: [] };
  return null;
}

/** Listing text Channel3 extracted from the merchant, given to the AI judge as data. */
export function listingText(product: Product) {
  return [
    product.title,
    product.description ?? "",
    ...(product.key_features ?? []).map((f) => `• ${f}`),
  ]
    .join("\n")
    .slice(0, 6000);
}

export interface ShopPrecheck {
  domain: string;
  priceCents: number;
  domainAgeDays: number | null;
  medianCents: number | null;
  priceRatio: number | null;
  historyStatus: string | null;
  notes: string[];
  tone: "calm" | "careful";
}

/** Quick, deterministic look at one offer before anyone pays (the full AI check runs on the PayPal hold). */
export async function precheckOffer(product: Product, domain: string): Promise<ShopPrecheck> {
  const offer = (product.offers ?? []).find((o) => o.domain === domain);
  if (!offer) throw new Error("That store isn't selling this item any more");
  const [reg, baseline, hist] = await Promise.all([
    domainRegisteredAt(domain),
    productBaseline(product, domain),
    priceHistory(product.id),
  ]);
  const priceCents = cents(offer);
  const domainAgeDays = reg ? Math.floor((Date.now() - reg.getTime()) / 86_400_000) : null;
  const priceRatio = baseline ? priceCents / baseline.medianCents : null;
  const historyStatus = hist?.statistics?.current_status ?? null;
  const notes: string[] = [];
  let careful = false;
  if (domainAgeDays === null) notes.push("Couldn't confirm when this store's website was registered");
  else if (domainAgeDays < 180) {
    notes.push(`Store website is only ${domainAgeDays} days old`);
    careful = true;
  } else notes.push(`Store online for ${Math.floor(domainAgeDays / 365) || "<1"} year${domainAgeDays >= 730 ? "s" : ""}`);
  if (priceRatio !== null) {
    if (priceRatio < 0.5) {
      notes.push(`Price is ${Math.round((1 - priceRatio) * 100)}% below other stores: too good to be true?`);
      careful = true;
    } else if (priceRatio > 1.3) {
      notes.push(`Costs ${Math.round((priceRatio - 1) * 100)}% more than other stores`);
      careful = true;
    } else notes.push("Price is in line with other stores");
  } else notes.push("Only one store sells this, so there's no price to compare");
  if (historyStatus === "high") notes.push("Above its usual price over the last 90 days");
  if (historyStatus === "low") notes.push("Below its usual price over the last 90 days");
  return {
    domain,
    priceCents,
    domainAgeDays,
    medianCents: baseline?.medianCents ?? null,
    priceRatio,
    historyStatus,
    notes,
    tone: careful ? "careful" : "calm",
  };
}
