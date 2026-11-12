/**
 * Guardian flow: Mom buys → PayPal order (AUTHORIZE) → hold placed → risk
 * check → auto-capture, or hold for the family → capture / void.
 *
 * Every state change is a conditional UPDATE (WHERE state = expected), so a
 * double-tap on a Telegram button can never capture twice.
 */
import "server-only";
import { one, q } from "../db";
import { id, dollars } from "../util";
import { logEvent } from "../events";
import { post, resolveCard } from "../chat";
import { approversOf, familyNow, getFamily, getMember, getPolicy, parentOf } from "../family";
import { authorizeOrder, captureAuthorization, createAuthorizeOrder, voidAuthorization } from "../paypal";
import { transition, type PurchaseEvent, type PurchaseState, STATE_LABEL } from "../state/purchase";
import { assess, type MerchantRow } from "../risk/assess";
import { findProduct, storePageText } from "../stores";
import { fetchPageText, type MarketBaseline } from "../risk/signals";
import { channel3Configured } from "../risk/signals";
import { freshOffer, listingText, productBaseline, c3 } from "../channel3";
import { topReasons } from "../risk/judge";

export interface PurchaseRow {
  id: string;
  family_id: string;
  merchant_id: string;
  item: string;
  category: string | null;
  amount_cents: number;
  product_url: string | null;
  order_id: string | null;
  authorization_id: string | null;
  capture_id: string | null;
  state: PurchaseState;
  risk_score: number | null;
  risk_breakdown: any;
  risk_flags: any;
  injection_detected: boolean | null;
  mom_message: string | null;
  family_message: string | null;
  decided_by: string | null;
  held_until: string | null;
  created_at: string;
}

export async function getPurchase(purchaseId: string) {
  return one<PurchaseRow>(`SELECT * FROM purchase WHERE id=$1`, [purchaseId]);
}

/** Atomic state change. Returns false if someone else already moved it. */
async function move(p: PurchaseRow, event: PurchaseEvent, extra: Record<string, unknown> = {}): Promise<PurchaseRow | null> {
  const next = transition(p.state, event);
  const keys = Object.keys(extra);
  const sets = keys.map((k, i) => `${k}=$${i + 4}`).join(", ");
  const rows = await q<PurchaseRow>(
    `UPDATE purchase SET state=$2, updated_at=now()${sets ? ", " + sets : ""} WHERE id=$1 AND state=$3 RETURNING *`,
    [p.id, next, p.state, ...keys.map((k) => (typeof extra[k] === "object" && extra[k] !== null ? JSON.stringify(extra[k]) : extra[k]))],
  );
  if (!rows[0]) return null;
  await logEvent({ familyId: p.family_id, type: `purchase.${p.state}->${next}`, source: "user", payload: { purchaseId: p.id, event: event.type } });
  return rows[0];
}

async function upsertMerchant(m: { domain: string; name: string; registeredDaysAgo?: number; allowlisted?: boolean }): Promise<MerchantRow> {
  const existing = await one<MerchantRow>(`SELECT * FROM merchant WHERE domain=$1`, [m.domain]);
  if (existing) return existing;
  const reg = m.registeredDaysAgo != null ? new Date(Date.now() - m.registeredDaysAgo * 86_400_000).toISOString() : null;
  const rows = await q<MerchantRow>(
    `INSERT INTO merchant (id, domain, display_name, registered_at, registered_source, allowlisted)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (domain) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING *`,
    [id("mer"), m.domain, m.name, reg, reg ? "demo-seed" : null, !!m.allowlisted],
  );
  return rows[0];
}

// ------------------------------------------------------------------ 1. start

export type PurchaseSource =
  | { kind: "store"; slug: string; sku: string }
  | {
      kind: "channel3";
      title: string;
      url: string;
      domain: string;
      priceCents: number;
      query: string;
      /** Channel3 product id: when present, price, title and link are re-read from Channel3 on the server. */
      productId?: string;
      selection?: Record<string, string>;
    };

export async function startPurchase(familyId: string, src: PurchaseSource) {
  let item: string, category: string | null, amount: number, merchant: MerchantRow, url: string | null;
  if (src.kind === "store") {
    const found = findProduct(src.slug, src.sku);
    if (!found) throw new Error("Unknown product");
    merchant = await upsertMerchant({
      domain: found.store.domain,
      name: found.store.name,
      registeredDaysAgo: found.store.registeredDaysAgo,
      allowlisted: found.store.allowlisted,
    });
    item = found.product.name;
    category = found.product.category;
    amount = found.product.priceCents;
    url = `/stores/${found.store.slug}?p=${found.product.sku}`;
  } else {
    if (src.productId && channel3Configured()) {
      // Never trust a price from the browser: ask Channel3 what this store charges right now.
      const fresh = await freshOffer(src.productId, src.domain, src.selection, familyId);
      src = { ...src, title: fresh.product.title, url: fresh.offer.url, priceCents: fresh.priceCents, query: src.query || fresh.product.title };
    }
    merchant = await upsertMerchant({ domain: src.domain, name: src.domain });
    item = src.title;
    category = null;
    amount = src.priceCents;
    url = src.url;
  }

  const purchaseId = id("pur");
  const parentRow = await parentOf(familyId);
  const saveForReorder = merchant.allowlisted && !parentRow?.paypal_vault_id;
  const { orderId } = await createAuthorizeOrder({ purchaseId, familyId, amountCents: amount, description: item, merchantName: merchant.display_name, saveForReorder });
  await q(
    `INSERT INTO purchase (id, family_id, merchant_id, item, category, amount_cents, product_url, order_id, state, risk_breakdown)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'AWAITING_BUYER',$9)`,
    [purchaseId, familyId, merchant.id, item, category, amount, url, orderId, JSON.stringify({ source: src })],
  );
  return (await getPurchase(purchaseId))!;
}

// ------------------------------------------------------------------ 2. buyer approved in PayPal → hold + check

export async function onBuyerApproved(purchaseId: string): Promise<PurchaseRow> {
  let p = await getPurchase(purchaseId);
  if (!p) throw new Error("Purchase not found");
  if (p.state !== "AWAITING_BUYER") return p; // idempotent

  try {
    if (p.authorization_id) {
      // Agent reorder with a saved PayPal (Vault): PayPal already placed the hold.
      p = (await move(p, { type: "BUYER_APPROVED" }, { authorization_id: p.authorization_id }))!;
    } else {
      const auth = await authorizeOrder({ orderId: p.order_id!, purchaseId: p.id, familyId: p.family_id });
      p = (await move(p, { type: "BUYER_APPROVED" }, { authorization_id: auth.authorizationId }))!;
      if (auth.vaultId) {
        const parent = await parentOf(p.family_id);
        if (parent && !parent.paypal_vault_id) {
          await q(`UPDATE member SET paypal_vault_id=$2 WHERE id=$1`, [parent.id, auth.vaultId]);
          await logEvent({ familyId: p.family_id, type: "paypal.vault.saved", source: "paypal", payload: { member: parent.name } });
        }
      }
    }
  } catch (e: any) {
    await move(p, { type: "PAYPAL_FAILED" }, { mom_message: "PayPal couldn't place this order. Nothing was charged." });
    throw e;
  }

  p = (await move(p, { type: "SCORING_STARTED" }))!;

  const fam = (await getFamily(p.family_id))!;
  const policy = (await getPolicy(p.family_id))!;
  const parent = await parentOf(p.family_id);
  const approvers = await approversOf(p.family_id);
  const approver = approvers[0];
  const merchant = (await one<MerchantRow>(`SELECT * FROM merchant WHERE id=$1`, [p.merchant_id]))!;
  const src: PurchaseSource = p.risk_breakdown?.source;

  let pageText = "";
  let marketQuery = p.item;
  let marketSeed: number | null = null;
  let baselineOverride: MarketBaseline | null = null;
  if (src?.kind === "store") {
    const f = findProduct(src.slug, src.sku)!;
    pageText = storePageText(f.store, f.product);
    marketQuery = f.product.marketQuery;
    marketSeed = f.product.marketSeedCents;
  } else if (src?.kind === "channel3") {
    marketQuery = src.query;
    if (src.productId && channel3Configured()) {
      // Exact product: compare with the other stores selling it, and read the listing Channel3 extracted.
      // (We don't fetch the buy link itself: that's an affiliate click, not a page to scrape.)
      try {
        const product = await c3().products.retrieve({ product_id: src.productId, selected_options: src.selection });
        baselineOverride = await productBaseline(product, src.domain);
        pageText = listingText(product);
      } catch {
        /* fall back to a search-based baseline below */
      }
    } else if (!/^https:\/\/buy\.trychannel3\.com\//.test(src.url)) {
      pageText = await fetchPageText(src.url);
    }
  }

  const a = await assess({
    familyId: p.family_id,
    purchaseId: p.id,
    parentName: parent?.name ?? "Mom",
    approverName: approver?.name ?? "your family",
    item: p.item,
    category: p.category,
    amountCents: p.amount_cents,
    merchant,
    marketQuery,
    marketSeedCents: marketSeed,
    baselineOverride,
    pageText,
    policy,
    now: familyNow(fam),
  });

  const breakdown = {
    source: src,
    lines: a.risk.lines,
    reason: a.risk.reason,
    recommendDecline: a.risk.recommendDecline,
    domainAgeDays: a.domainAgeDays,
    domainSource: a.domainSource,
    baseline: a.baseline,
    priceRatio: a.priceRatio,
    judgeModel: a.judge.model,
    confidence: a.judge.confidence,
  };
  const heldUntil = new Date(familyNow(fam).getTime() + policy.hold_timeout_hours * 3600_000).toISOString();

  p = (await move(p, { type: "SCORED", decision: a.risk.decision }, {
    risk_score: a.risk.score,
    risk_breakdown: breakdown,
    risk_flags: a.judge.flags,
    injection_detected: a.judge.injection_detected,
    mom_message: a.judge.mom_message,
    family_message: a.judge.family_message,
    held_until: a.risk.decision === "HOLD" ? heldUntil : null,
  }))!;

  if (p.state === "AUTO_APPROVED") return capture(p, "holdon");
  if (p.state === "HARD_BLOCKED") {
    const v = await voidHold(p);
    await post({
      familyId: p.family_id,
      text: `🛑 Blocked ${parent?.name ?? "Mom"}'s ${dollars(p.amount_cents)} purchase at ${merchant.display_name}: ${a.risk.reason}. The PayPal hold was released, so $0 moved.`,
    });
    return v;
  }

  // HOLD: ask the family.
  const reasons = topReasons(a.risk.lines);
  await post({
    familyId: p.family_id,
    text: `✋ HoldOn is holding ${parent?.name ?? "Mom"}'s purchase: ${p.item}, ${dollars(p.amount_cents)} at ${merchant.display_name}. ${approver ? approver.name + ", your call." : ""}`,
    card: {
      kind: "approval",
      refId: p.id,
      title: `${p.item} · ${dollars(p.amount_cents)}`,
      lines: [
        a.judge.family_message,
        ...reasons.map((r) => `• ${r}`),
        `Risk ${a.risk.score}/100${a.risk.recommendDecline ? " · HoldOn recommends declining" : ""}`,
      ].filter(Boolean),
      buttons: [
        { label: "✅ Approve", action: "approve" },
        { label: "❌ Decline", action: "decline" },
      ],
      forMemberId: approver?.id,
    },
  });
  return p;
}

// ------------------------------------------------------------------ 3. family decides

export async function decide(purchaseId: string, memberId: string, approve: boolean) {
  const p = await getPurchase(purchaseId);
  if (!p) throw new Error("Purchase not found");
  const member = await getMember(memberId);
  if (!member || member.family_id !== p.family_id || !member.is_approver) throw new Error("Only a family approver can decide");
  if (p.state !== "HELD_FOR_FAMILY") return p;

  const moved = await move(p, { type: approve ? "FAMILY_APPROVED" : "FAMILY_DECLINED" }, { decided_by: member.id, decided_at: new Date().toISOString() });
  if (!moved) return (await getPurchase(purchaseId))!;
  await resolveCard(p.id, approve ? `Approved by ${member.name}` : `Declined by ${member.name}`);

  if (approve) {
    const done = await capture(moved, member.name);
    return done;
  }
  const voided = await voidHold(moved);
  const parent = await parentOf(p.family_id);
  await post({
    familyId: p.family_id,
    text: `❌ ${member.name} declined. The PayPal hold on ${dollars(p.amount_cents)} was voided, so $0 moved. ${parent?.name ?? "Mom"} gets a gentle note, not a lecture.`,
  });
  await q(`UPDATE purchase SET mom_message=$2 WHERE id=$1`, [
    p.id,
    `${parent?.name ?? "Mom"}, ${member.name} had a look and we're skipping this one. Your money is safe, nothing was charged 💛`,
  ]);
  return voided;
}

// ------------------------------------------------------------------ 4. timeouts (cron)

export async function expireHolds(familyId: string) {
  const fam = (await getFamily(familyId))!;
  const now = familyNow(fam).toISOString();
  const due = await q<PurchaseRow>(`SELECT * FROM purchase WHERE family_id=$1 AND state='HELD_FOR_FAMILY' AND held_until < $2`, [familyId, now]);
  for (const p of due) {
    const moved = await move(p, { type: "HOLD_EXPIRED" });
    if (!moved) continue;
    await resolveCard(p.id, "Expired: nobody decided in time");
    await voidHold(moved);
    await post({ familyId, text: `⌛ Nobody decided on ${p.item} (${dollars(p.amount_cents)}) in time, so HoldOn released the PayPal hold. $0 moved. Safe by default.` });
  }
  return due.length;
}

// ------------------------------------------------------------------ money movers (only these touch capture/void)

async function capture(p: PurchaseRow, by: string): Promise<PurchaseRow> {
  try {
    const r = await captureAuthorization({ authorizationId: p.authorization_id!, purchaseId: p.id, familyId: p.family_id });
    const done = (await move(p, { type: "CAPTURED" }, { capture_id: r.captureId }))!;
    const parent = await parentOf(p.family_id);
    if (by === "holdon") {
      await post({ familyId: p.family_id, text: `✅ ${parent?.name ?? "Mom"} bought ${p.item} (${dollars(p.amount_cents)}). Checked and paid automatically.` });
    } else {
      await post({ familyId: p.family_id, text: `✅ ${by} approved. ${dollars(p.amount_cents)} captured for ${p.item}.` });
      await q(`UPDATE purchase SET mom_message=$2 WHERE id=$1`, [p.id, `Good news ${parent?.name ?? ""}! ${by} said yes. Your ${p.item} is ordered 💛`]);
    }
    return done;
  } catch (e) {
    await move(p, { type: "PAYPAL_FAILED" });
    throw e;
  }
}

async function voidHold(p: PurchaseRow): Promise<PurchaseRow> {
  try {
    await voidAuthorization({ authorizationId: p.authorization_id!, purchaseId: p.id, familyId: p.family_id });
    return (await move(p, { type: "VOIDED" }))!;
  } catch (e) {
    await move(p, { type: "PAYPAL_FAILED" });
    throw e;
  }
}

export function publicPurchase(p: PurchaseRow) {
  return { ...p, state_label: STATE_LABEL[p.state] };
}
