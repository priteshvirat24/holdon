/**
 * Bad Cop nudge ladder. Pure. Decides WHETHER and WHICH nudge is due; the
 * copywriter model decides the words.
 */

export interface LadderStep {
  step: 1 | 2 | 3 | 4;
  afterDays: number;
  tone: "light" | "context" | "direct" | "escalate";
  channel: "group" | "group+paypal" | "approver-dm";
}

export const LADDER: LadderStep[] = [
  { step: 1, afterDays: 3, tone: "light", channel: "group" },
  { step: 2, afterDays: 6, tone: "context", channel: "group+paypal" },
  { step: 3, afterDays: 9, tone: "direct", channel: "group+paypal" },
  { step: 4, afterDays: 12, tone: "escalate", channel: "approver-dm" },
];

export const MIN_HOURS_BETWEEN_NUDGES = 72;

export interface ContributionLike {
  status: string;
  ladder_step: number;
  sent_at: Date | null;
  last_nudge_at: Date | null;
  snoozed_until: Date | null;
}

export function dueNudge(c: ContributionLike, now: Date): LadderStep | null {
  if (c.status !== "sent" || !c.sent_at) return null;
  if (c.snoozed_until && now < c.snoozed_until) return null;
  if (c.last_nudge_at && now.getTime() - c.last_nudge_at.getTime() < MIN_HOURS_BETWEEN_NUDGES * 3600_000) return null;
  const daysLate = (now.getTime() - c.sent_at.getTime()) / 86_400_000;
  const next = LADDER.find((s) => s.step === c.ladder_step + 1);
  if (!next || daysLate < next.afterDays) return null;
  return next;
}
