import "server-only";
import { one } from "../db";
import { getMember } from "../family";
import { decide } from "./purchases";
import { acceptCover, declineCover, snoozeContribution, type ContributionRow } from "./contributions";

/** One entry point for card buttons, from the web chat or Telegram. */
export async function handleCardAction(refId: string, action: string, memberId: string) {
  const member = await getMember(memberId);
  if (!member) throw new Error("Unknown member");

  if (action === "approve" || action === "decline") {
    return decide(refId, memberId, action === "approve");
  }
  if (action === "cover-yes" || action === "cover-self") {
    return acceptCover(refId, memberId);
  }
  if (action === "cover-no") {
    return declineCover(refId, memberId);
  }
  if (action.startsWith("snooze-")) {
    const c = await one<ContributionRow>(`SELECT * FROM contribution WHERE id=$1`, [refId]);
    if (!c || !member.is_approver) throw new Error("Not allowed");
    const days = Number(action.split("-")[1]) || 7;
    return snoozeContribution(c, new Date(Date.now() + days * 86_400_000).toISOString());
  }
  throw new Error(`Unknown action ${action}`);
}
