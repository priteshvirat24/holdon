import { body, route } from "@/lib/api";
import { searchStores } from "@/lib/stores";
import { channel3Configured, channel3Search } from "@/lib/risk/signals";
import { DEMO_FAMILY_ID } from "@/lib/family";

/** Mom says what she wants → demo-store matches + real products from Channel3. */
export const POST = route(async (req) => {
  const { query } = await body<{ query: string }>(req);
  if (!query?.trim()) throw new Error("Tell me what you'd like to buy");
  const local = searchStores(query).map(({ store, product }) => ({
    kind: "store" as const,
    slug: store.slug,
    sku: product.sku,
    title: product.name,
    priceCents: product.priceCents,
    merchant: store.name,
    domain: store.domain,
    emoji: product.emoji,
    blurb: product.blurb,
  }));
  let market: unknown[] = [];
  if (channel3Configured()) {
    try {
      const products = await channel3Search(query, 6, DEMO_FAMILY_ID);
      market = products.slice(0, 4).map((p: any) => ({ kind: "channel3" as const, query, ...p }));
    } catch (e: any) {
      console.error("channel3 search failed", e?.message);
    }
  }
  return { local, market };
});
