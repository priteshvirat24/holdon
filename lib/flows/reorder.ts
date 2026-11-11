/**
 * Agentic commerce: HoldOn reorders Mom's regular medicine by itself, paying
 * with her PayPal saved in PayPal Vault (buyer not present). The agent gets no
 * special powers: its purchase goes through the same authorize → risk check →
 * capture / hold / void pipeline as Mom's own.
 */
import "server-only";
import { q } from "../db";
import { id, dollars } from "../util";
import { logEvent } from "../events";
import { post } from "../chat";
import { parentOf } from "../family";
import { findProduct } from "../stores";
import { createVaultedAuthorization } from "../paypal";
import { getPurchase, onBuyerApproved, type PurchaseRow } from "./purchases";

export const REFILL = { slug: "carewell", sku: "bp-refill" } as const;

export async function autoReorder(familyId: string): Promise<PurchaseRow> {
  const parent = await parentOf(familyId);
  if (!parent) throw new Error("No parent in this family");
  if (!parent.paypal_vault_id) {
    throw new Error(
      `${parent.name}'s PayPal isn't saved yet. Buy the refill once from CareWell in Mom Mode: PayPal saves it (Vault), then HoldOn can reorder on its own.`,
    );
  }
  const f = findProduct(REFILL.slug, REFILL.sku)!;
  const merchant = (
    await q<any>(
      `INSERT INTO merchant (id, domain, display_name, registered_at, registered_source, allowlisted)
       VALUES ($1,$2,$3,$4,'demo-seed',$5)
       ON CONFLICT (domain) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING *`,
      [id("mer"), f.store.domain, f.store.name, new Date(Date.now() - f.store.registeredDaysAgo * 86_400_000).toISOString(), f.store.allowlisted],
    )
  )[0];

  const purchaseId = id("pur");
  const { orderId, authorizationId } = await createVaultedAuthorization({
    purchaseId,
    familyId,
    amountCents: f.product.priceCents,
    description: f.product.name,
    merchantName: f.store.name,
    vaultId: parent.paypal_vault_id,
  });
  await q(
    `INSERT INTO purchase (id, family_id, merchant_id, item, category, amount_cents, product_url, order_id, authorization_id, state, risk_breakdown, initiated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'AWAITING_BUYER',$10,'agent')`,
    [purchaseId, familyId, merchant.id, f.product.name, f.product.category, f.product.priceCents, `/stores/${f.store.slug}?p=${f.product.sku}`, orderId, authorizationId,
      JSON.stringify({ source: { kind: "store", slug: f.store.slug, sku: f.product.sku } })],
  );
  await logEvent({ familyId, type: "agent.reorder", source: "agent", payload: { purchaseId, item: f.product.name } });
  await post({
    familyId,
    text: `🤖 Monthly refill: ordering ${parent.name}'s ${f.product.name.toLowerCase()} (${dollars(f.product.priceCents)}) with her saved PayPal. Same checks as always.`,
  });
  await onBuyerApproved(purchaseId);
  return (await getPurchase(purchaseId))!;
}
