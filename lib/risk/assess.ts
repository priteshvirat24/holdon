import "server-only";
import { judge, type JudgeOutput } from "./judge";
import { scoreRisk, type RiskResult } from "./rules";
import { domainRegisteredAt, marketBaseline, type MarketBaseline } from "./signals";
import { one, q } from "../db";
import { daysBetween } from "../util";
import type { Policy } from "../family";

export interface MerchantRow {
  id: string;
  domain: string;
  display_name: string;
  registered_at: string | null;
  registered_source: string | null;
  allowlisted: boolean;
}

export interface Assessment {
  risk: RiskResult;
  judge: JudgeOutput;
  baseline: MarketBaseline | null;
  domainAgeDays: number | null;
  domainSource: string | null;
  priceRatio: number | null;
  firstPurchase: boolean;
}

/** Fill in RDAP registration for real domains (demo domains are seeded). */
export async function ensureMerchantRegistration(m: MerchantRow): Promise<MerchantRow> {
  if (m.registered_at || m.registered_source === "unknown") return m;
  const reg = await domainRegisteredAt(m.domain);
  await q(`UPDATE merchant SET registered_at=$2, registered_source=$3 WHERE id=$1`, [
    m.id,
    reg ? reg.toISOString() : null,
    reg ? "rdap" : "unknown",
  ]);
  return { ...m, registered_at: reg ? reg.toISOString() : null, registered_source: reg ? "rdap" : "unknown" };
}

export async function assess(p: {
  familyId: string;
  purchaseId: string;
  parentName: string;
  approverName: string;
  item: string;
  category: string | null;
  amountCents: number;
  merchant: MerchantRow;
  marketQuery: string;
  marketSeedCents: number | null;
  /** Exact-product baseline (e.g. the same item at other stores on Channel3); skips the search-based one. */
  baselineOverride?: MarketBaseline | null;
  pageText: string;
  policy: Policy;
  now: Date;
}): Promise<Assessment> {
  const merchant = await ensureMerchantRegistration(p.merchant);
  const domainAgeDays = merchant.registered_at ? daysBetween(new Date(merchant.registered_at), p.now) : null;

  const prior = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM purchase WHERE family_id=$1 AND merchant_id=$2 AND state='CAPTURED' AND id<>$3`,
    [p.familyId, merchant.id, p.purchaseId],
  );
  const firstPurchase = (prior?.n ?? 0) === 0;

  const baseline = p.baselineOverride ?? (await marketBaseline(p.marketQuery, p.familyId, p.marketSeedCents));
  const priceRatio = baseline ? p.amountCents / baseline.medianCents : null;

  const j = await judge({
    familyId: p.familyId,
    parentName: p.parentName,
    approverName: p.approverName,
    item: p.item,
    priceCents: p.amountCents,
    merchantName: merchant.display_name,
    domain: merchant.domain,
    domainAgeDays,
    marketMedianCents: baseline?.medianCents ?? null,
    pageText: p.pageText,
  });

  const risk = scoreRisk(
    {
      amountCents: p.amountCents,
      category: p.category,
      domainAgeDays,
      priceRatio,
      firstPurchaseAtMerchant: firstPurchase,
      allowlisted: merchant.allowlisted,
      aiRiskAdd: j.risk_add,
      injectionDetected: j.injection_detected,
    },
    {
      perItemLimitCents: p.policy.per_item_limit_cents,
      autoCaptureMaxCents: p.policy.auto_capture_max_cents,
      blockedCategories: p.policy.blocked_categories,
    },
  );

  // Messages must match the final decision (the judge writes them for the "held" case).
  const shown = { ...j };
  if (risk.decision === "AUTO_APPROVE") {
    shown.mom_message = `All good, ${p.parentName}! I checked it and your ${p.item.toLowerCase()} is being ordered now 💛`;
    shown.family_message = j.flags.length
      ? `Checked and auto-approved (risk ${risk.score}/100). Noted: ${j.flags[0]}`
      : `Checked and auto-approved (risk ${risk.score}/100): trusted shop, normal price.`;
  } else if (risk.decision === "HARD_BLOCK") {
    shown.mom_message = `${p.parentName}, this one isn't allowed by the family's rules, so I've stopped it. Nothing was charged 💛`;
    shown.family_message = `Blocked by policy: ${risk.reason}. ${j.family_message}`.slice(0, 400);
  }

  return { risk, judge: shown, baseline, domainAgeDays, domainSource: merchant.registered_source, priceRatio, firstPurchase };
}
