/**
 * Run the risk engine on demo products without PayPal:
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/risk-check.ts
 */
import { assess, type MerchantRow } from "../lib/risk/assess";
import { findProduct, storePageText } from "../lib/stores";

const cases = [
  ["carewell", "bp-refill"],
  ["greenleaf", "kettle"],
  ["luxerelax", "chair"],
  ["quickgift", "gc100"],
] as const;

async function main() {
  for (const [slug, sku] of cases) {
    const f = findProduct(slug, sku)!;
    const merchant: MerchantRow = {
      id: `mer_${slug}`,
      domain: f.store.domain,
      display_name: f.store.name,
      registered_at: new Date(Date.now() - f.store.registeredDaysAgo * 86_400_000).toISOString(),
      registered_source: "demo-seed",
      allowlisted: f.store.allowlisted,
    } as MerchantRow;
    const t = Date.now();
    const a = await assess({
      familyId: "fam_riskcheck",
      purchaseId: `pur_${sku}`,
      parentName: "Sunita",
      approverName: "Priya",
      item: f.product.name,
      category: f.product.category,
      amountCents: f.product.priceCents,
      merchant,
      marketQuery: f.product.marketQuery,
      marketSeedCents: f.product.marketSeedCents,
      pageText: storePageText(f.store, f.product),
      policy: { per_item_limit_cents: 15000, auto_capture_max_cents: 6000, hold_timeout_hours: 24, blocked_categories: ["gift_cards", "crypto"] },
      now: new Date(),
    });
    console.log(`\n■ ${f.store.name} · ${f.product.name} · $${f.product.priceCents / 100}  (${Date.now() - t}ms, ${a.judge.model})`);
    console.log(`  decision=${a.risk.decision} score=${a.risk.score} injection=${a.judge.injection_detected}`);
    console.log(`  lines: ${a.risk.lines.map((l: any) => `${l.label ?? l.reason}(${l.points > 0 ? "+" : ""}${l.points})`).join(", ")}`);
    console.log(`  mom: ${a.judge.mom_message}`);
    console.log(`  family: ${a.judge.family_message}`);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
