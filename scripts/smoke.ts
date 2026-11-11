/**
 * Live sandbox smoke test (no UI):
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/smoke.ts
 * Seeds the family (real PayPal invoice for Anil), starts a guarded purchase
 * (real AUTHORIZE order) and prints the buyer-approval link.
 */
import { resetAndSeed } from "../lib/seed";
import { startPurchase } from "../lib/flows/purchases";
import { paypalMode, paypal } from "../lib/paypal/client";
import { fundStatus } from "../lib/family";

async function main() {
  console.log("PayPal mode:", paypalMode());
  const seeded = await resetAndSeed();
  console.log("Seeded. Anil invoice:", seeded.anilInvoice);
  const inv = await paypal("GET", `/v2/invoicing/invoices/${seeded.anilInvoice}`);
  console.log("  invoice status:", inv.status, "| payer view:", inv.detail?.metadata?.recipient_view_url ? "yes" : "no");

  const fund = await fundStatus(seeded.familyId);
  console.log("Fund:", fund.collected / 100, "/", fund.target / 100, `(${fund.pct}%)`);

  const p = await startPurchase(seeded.familyId, { kind: "store", slug: "luxerelax", sku: "chair" }).catch(async (e) => {
    const { STORES } = await import("../lib/stores");
    console.log("  (sku guess failed; skus:", STORES.map((s) => s.products.map((x) => `${s.slug}/${x.sku}`)).flat().join(", "), ")");
    throw e;
  });
  console.log("Purchase:", p.id, p.state, "| order:", p.order_id);
  const order = await paypal("GET", `/v2/checkout/orders/${p.order_id}`);
  console.log("  order intent:", order.intent, "| status:", order.status);
  console.log("  approve link:", order.links?.find((l: any) => l.rel === "payer-action" || l.rel === "approve")?.href);
  process.exit(0);
}
main().catch((e) => {
  console.error("SMOKE FAILED:", e?.name, e?.issue ?? "", e?.message, e?.debugId ?? "");
  process.exit(1);
});
