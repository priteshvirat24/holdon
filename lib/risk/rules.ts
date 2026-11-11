/**
 * Deterministic risk rules. Pure. Rules set the floor; the AI judge may only ADD
 * risk (0..25), never subtract. A human decides every hold.
 */
import type { Decision } from "../state/purchase";

export interface RiskSignals {
  amountCents: number;
  category: string | null;
  domainAgeDays: number | null; // null = could not verify
  priceRatio: number | null; // item price / market median; null = no baseline
  firstPurchaseAtMerchant: boolean;
  allowlisted: boolean;
  aiRiskAdd: number; // 0..25 from the judge
  injectionDetected: boolean;
}

export interface RiskPolicy {
  perItemLimitCents: number;
  autoCaptureMaxCents: number;
  blockedCategories: string[];
}

export interface RiskLine {
  label: string;
  points: number;
}

export interface RiskResult {
  score: number;
  lines: RiskLine[];
  decision: Decision;
  reason: string;
  recommendDecline: boolean;
}

export const HOLD_AT = 30;
export const RECOMMEND_DECLINE_AT = 60;

export function scoreRisk(s: RiskSignals, p: RiskPolicy): RiskResult {
  const lines: RiskLine[] = [];
  const add = (label: string, points: number) => points !== 0 && lines.push({ label, points });

  if (s.domainAgeDays === null) add("Shop's registration can't be verified", 20);
  else if (s.domainAgeDays < 30) add(`Shop website is only ${s.domainAgeDays} days old`, 35);
  else if (s.domainAgeDays < 180) add(`Shop website is ${Math.round(s.domainAgeDays / 30)} months old`, 15);

  if (s.priceRatio !== null) {
    const pct = Math.round(s.priceRatio * 100);
    if (s.priceRatio < 0.3) add(`Price is ${pct}% of the usual market price`, 35);
    else if (s.priceRatio < 0.6) add(`Price is ${pct}% of the usual market price`, 15);
  }

  if (s.firstPurchaseAtMerchant && !s.allowlisted) add("First time buying from this shop", 10);
  if (s.injectionDetected) add("Page hides instructions aimed at AI agents", 25);
  const ai = Math.max(0, Math.min(25, Math.round(s.aiRiskAdd)));
  if (ai > 0) add("Red flags spotted on the page", ai);
  if (s.allowlisted) add("Family-trusted shop", -20);

  const score = Math.max(0, Math.min(100, lines.reduce((a, l) => a + l.points, 0)));

  // Hard policy rules first: these never depend on the AI.
  if (s.category && p.blockedCategories.includes(s.category)) {
    return { score: Math.max(score, 90), lines, decision: "HARD_BLOCK", reason: `"${s.category}" purchases are blocked by family policy`, recommendDecline: true };
  }
  if (s.amountCents > p.perItemLimitCents) {
    return { score, lines, decision: "HOLD", reason: "Above Mom's per-item limit", recommendDecline: score >= RECOMMEND_DECLINE_AT };
  }
  if (score >= HOLD_AT) {
    return { score, lines, decision: "HOLD", reason: "Risk signals found", recommendDecline: score >= RECOMMEND_DECLINE_AT };
  }
  if (s.amountCents > p.autoCaptureMaxCents && !s.allowlisted) {
    return { score, lines, decision: "HOLD", reason: "Larger than the auto-approve amount", recommendDecline: false };
  }
  return { score, lines, decision: "AUTO_APPROVE", reason: "Looks safe", recommendDecline: false };
}
