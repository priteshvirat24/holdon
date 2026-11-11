/**
 * Purchase state machine. Pure: no I/O. The ONLY place that decides whether
 * money may be captured. The AI never calls capture; it can only influence
 * the score that feeds `decideAfterScoring`.
 */

export type PurchaseState =
  | "AWAITING_BUYER" // order created, waiting for Mom to approve in the PayPal popup
  | "AUTHORIZED" // hold placed on Mom's funds
  | "SCORING"
  | "AUTO_APPROVED"
  | "HELD_FOR_FAMILY"
  | "HELD_APPROVED"
  | "CAPTURED"
  | "DECLINED"
  | "TIMED_OUT"
  | "HARD_BLOCKED"
  | "VOIDED"
  | "FAILED";

export type PurchaseEvent =
  | { type: "BUYER_APPROVED" }
  | { type: "SCORING_STARTED" }
  | { type: "SCORED"; decision: Decision }
  | { type: "FAMILY_APPROVED" }
  | { type: "FAMILY_DECLINED" }
  | { type: "HOLD_EXPIRED" }
  | { type: "CAPTURED" }
  | { type: "VOIDED" }
  | { type: "PAYPAL_FAILED" };

export type Decision = "AUTO_APPROVE" | "HOLD" | "HARD_BLOCK";

const T: Record<PurchaseState, Partial<Record<PurchaseEvent["type"], PurchaseState | ((e: any) => PurchaseState)>>> = {
  AWAITING_BUYER: { BUYER_APPROVED: "AUTHORIZED", PAYPAL_FAILED: "FAILED" },
  AUTHORIZED: { SCORING_STARTED: "SCORING", PAYPAL_FAILED: "FAILED" },
  SCORING: {
    SCORED: (e: { decision: Decision }) =>
      e.decision === "AUTO_APPROVE" ? "AUTO_APPROVED" : e.decision === "HOLD" ? "HELD_FOR_FAMILY" : "HARD_BLOCKED",
  },
  AUTO_APPROVED: { CAPTURED: "CAPTURED", PAYPAL_FAILED: "FAILED" },
  HELD_FOR_FAMILY: { FAMILY_APPROVED: "HELD_APPROVED", FAMILY_DECLINED: "DECLINED", HOLD_EXPIRED: "TIMED_OUT" },
  HELD_APPROVED: { CAPTURED: "CAPTURED", PAYPAL_FAILED: "FAILED" },
  DECLINED: { VOIDED: "VOIDED", PAYPAL_FAILED: "FAILED" },
  TIMED_OUT: { VOIDED: "VOIDED", PAYPAL_FAILED: "FAILED" },
  HARD_BLOCKED: { VOIDED: "VOIDED", PAYPAL_FAILED: "FAILED" },
  CAPTURED: {},
  VOIDED: {},
  FAILED: {},
};

export class IllegalTransition extends Error {}

export function transition(state: PurchaseState, event: PurchaseEvent): PurchaseState {
  const next = T[state]?.[event.type];
  if (!next) throw new IllegalTransition(`${event.type} not allowed in ${state}`);
  return typeof next === "function" ? next(event) : next;
}

/** States from which money may be captured. */
export const CAPTURABLE: PurchaseState[] = ["AUTO_APPROVED", "HELD_APPROVED"];
/** States from which the hold must be released. */
export const VOIDABLE: PurchaseState[] = ["DECLINED", "TIMED_OUT", "HARD_BLOCKED"];

export const isFinal = (s: PurchaseState) => s === "CAPTURED" || s === "VOIDED" || s === "FAILED";

export const STATE_LABEL: Record<PurchaseState, string> = {
  AWAITING_BUYER: "Waiting for PayPal",
  AUTHORIZED: "On hold",
  SCORING: "Checking",
  AUTO_APPROVED: "Safe",
  HELD_FOR_FAMILY: "Asking family",
  HELD_APPROVED: "Family approved",
  CAPTURED: "Paid",
  DECLINED: "Declined",
  TIMED_OUT: "Expired",
  HARD_BLOCKED: "Blocked",
  VOIDED: "Released, $0 moved",
  FAILED: "Failed",
};
