"use server";
/**
 * Server actions behind /shop. Channel3 UI components are presentational: they call these
 * fetchers, and only this server code holds CHANNEL3_API_KEY.
 */
import type { SearchFilters } from "@channel3/sdk/resources";
import { c3, precheckOffer, priceHistory } from "@/lib/channel3";
import { DEMO_FAMILY_ID } from "@/lib/family";
import { logEvent } from "@/lib/events";

const USER = DEMO_FAMILY_ID; // attributes clicks and commissions to this family in Channel3 reporting

export async function searchProducts(input: {
  query: string;
  imageUrl?: string;
  base64Image?: string;
  filters: SearchFilters;
  pageToken?: string;
}) {
  const started = Date.now();
  const page = await c3().products.search({
    query: input.query?.trim() || undefined,
    image_url: input.imageUrl,
    base64_image: input.base64Image,
    filters: input.filters,
    page_token: input.pageToken,
    limit: 24,
    "x-user-id": USER,
  });
  if (!input.pageToken) {
    await logEvent({
      familyId: DEMO_FAMILY_ID,
      type: "channel3.search",
      source: "agent",
      payload: { query: input.query || "(image)", results: page.data.length, ms: Date.now() - started },
    }).catch(() => {});
  }
  return { products: page.data, nextPageToken: page.response.next_page_token ?? null };
}

export async function similarProducts(input: { productId: string; limit: number; filters?: SearchFilters }) {
  try {
    const page = await c3().products.findSimilar({
      product_id: input.productId,
      limit: input.limit,
      filters: input.filters,
      "x-user-id": USER,
    });
    return page.data;
  } catch {
    return []; // 404 when the product isn't fully catalogued yet
  }
}

export async function getProduct(productId: string, selection?: Record<string, string>) {
  return c3().products.retrieve({
    product_id: productId,
    selected_options: selection && Object.keys(selection).length ? selection : undefined,
    "x-user-id": USER,
  });
}

export async function getPriceHistory(productId: string) {
  return priceHistory(productId);
}

export async function searchBrands(query: string) {
  return (await c3().brands.search({ query, limit: 8 })).brands ?? [];
}

export async function searchWebsites(query: string) {
  return (await c3().websites.search({ query, limit: 8 })).websites ?? [];
}

export async function searchCategories(query: string) {
  return (await c3().categories.search({ query, limit: 8 })).categories ?? [];
}

export async function getCategory(slug: string) {
  return c3().categories.retrieve({ slug });
}

/** HoldOn's quick look at one store's offer (domain age, price vs other stores, 90-day history). */
export async function precheck(productId: string, domain: string) {
  const product = await getProduct(productId);
  return precheckOffer(product, domain);
}
