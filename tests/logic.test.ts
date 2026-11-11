import { describe, expect, it } from "vitest";
import { transition, IllegalTransition, CAPTURABLE } from "../lib/state/purchase";
import { scoreRisk, type RiskSignals } from "../lib/risk/rules";
import { dueNudge, LADDER } from "../lib/badcop/ladder";
import { searchStores, storePageText, findProduct } from "../lib/stores";

const policy = { perItemLimitCents: 15000, autoCaptureMaxCents: 6000, blockedCategories: ["gift_cards"] };
const base: RiskSignals = {
  amountCents: 1200,
  category: "pharmacy",
  domainAgeDays: 4000,
  priceRatio: 0.9,
  firstPurchaseAtMerchant: false,
  allowlisted: true,
  aiRiskAdd: 0,
  injectionDetected: false,
};

describe("purchase state machine", () => {
  it("auto-approve path ends in CAPTURED", () => {
    let s = transition("AWAITING_BUYER", { type: "BUYER_APPROVED" });
    s = transition(s, { type: "SCORING_STARTED" });
    s = transition(s, { type: "SCORED", decision: "AUTO_APPROVE" });
    expect(CAPTURABLE).toContain(s);
    expect(transition(s, { type: "CAPTURED" })).toBe("CAPTURED");
  });
  it("hold → decline → VOIDED", () => {
    let s = transition("SCORING", { type: "SCORED", decision: "HOLD" });
    expect(s).toBe("HELD_FOR_FAMILY");
    s = transition(s, { type: "FAMILY_DECLINED" });
    expect(transition(s, { type: "VOIDED" })).toBe("VOIDED");
  });
  it("cannot capture a held purchase without approval", () => {
    expect(() => transition("HELD_FOR_FAMILY", { type: "CAPTURED" })).toThrow(IllegalTransition);
  });
  it("cannot decide twice", () => {
    expect(() => transition("CAPTURED", { type: "FAMILY_DECLINED" })).toThrow(IllegalTransition);
  });
  it("hold timeout releases money", () => {
    expect(transition(transition("HELD_FOR_FAMILY", { type: "HOLD_EXPIRED" }), { type: "VOIDED" })).toBe("VOIDED");
  });
});

describe("risk rules", () => {
  it("trusted pharmacy refill auto-approves", () => {
    const r = scoreRisk(base, policy);
    expect(r.decision).toBe("AUTO_APPROVE");
    expect(r.score).toBe(0);
  });
  it("9-day-old shop selling a chair at 5% of market is held and decline recommended", () => {
    const r = scoreRisk(
      { ...base, amountCents: 1900, category: "furniture", domainAgeDays: 9, priceRatio: 0.05, firstPurchaseAtMerchant: true, allowlisted: false, aiRiskAdd: 15, injectionDetected: true },
      policy,
    );
    expect(r.decision).toBe("HOLD");
    expect(r.recommendDecline).toBe(true);
    expect(r.score).toBe(100);
  });
  it("AI cannot lower risk (negative aiRiskAdd is ignored)", () => {
    const risky = { ...base, domainAgeDays: 9, allowlisted: false, priceRatio: 0.1 };
    expect(scoreRisk({ ...risky, aiRiskAdd: -50 }, policy).score).toBe(scoreRisk({ ...risky, aiRiskAdd: 0 }, policy).score);
  });
  it("blocked category is a hard block regardless of score", () => {
    expect(scoreRisk({ ...base, category: "gift_cards" }, policy).decision).toBe("HARD_BLOCK");
  });
  it("over per-item limit is held even from a trusted shop", () => {
    expect(scoreRisk({ ...base, amountCents: 54900 }, policy).decision).toBe("HOLD");
  });
  it("unknown shop over auto-capture amount is held", () => {
    const r = scoreRisk({ ...base, allowlisted: false, amountCents: 9000, category: "home" }, policy);
    expect(r.decision).toBe("HOLD");
  });
});

describe("bad cop ladder", () => {
  const sent = new Date("2026-11-01T00:00:00Z");
  const c = { status: "sent", ladder_step: 0, sent_at: sent, last_nudge_at: null, snoozed_until: null };
  const day = (n: number) => new Date(sent.getTime() + n * 86_400_000);
  it("no nudge before day 3", () => expect(dueNudge(c, day(2))).toBeNull());
  it("step 1 on day 3", () => expect(dueNudge(c, day(3))?.step).toBe(1));
  it("respects 72h gap", () => expect(dueNudge({ ...c, ladder_step: 1, last_nudge_at: day(5) }, day(6))).toBeNull());
  it("step 4 escalates privately", () => {
    const s = dueNudge({ ...c, ladder_step: 3, last_nudge_at: day(9) }, day(12));
    expect(s?.channel).toBe("approver-dm");
  });
  it("snooze pauses nudges", () => expect(dueNudge({ ...c, snoozed_until: day(10) }, day(5))).toBeNull());
  it("paid stops nudges", () => expect(dueNudge({ ...c, status: "paid" }, day(9))).toBeNull());
  it("ladder has 4 steps", () => expect(LADDER).toHaveLength(4));
});

describe("demo stores", () => {
  it("scam page text includes the hidden injection note", () => {
    const f = findProduct("luxerelax", "chair")!;
    expect(storePageText(f.store, f.product)).toMatch(/AI shopping agents/);
  });
  it("search finds the massage chair", () => {
    expect(searchStores("buy this massage chair")[0].product.sku).toBe("chair");
  });
});
