import "server-only";
import { one, q } from "./db";
import { currentPeriod } from "./util";

export const DEMO_FAMILY_ID = "fam_sharma";

export interface Family {
  id: string;
  name: string;
  parent_name: string;
  telegram_chat_id: string | null;
  monthly_target_cents: number;
  clock_offset_days: number;
}
export interface Member {
  id: string;
  family_id: string;
  name: string;
  role: "parent" | "sibling";
  is_approver: boolean;
  paypal_email: string | null;
  telegram_user_id: string | null;
  share_cents: number;
  paypal_vault_id?: string | null;
}
export interface Policy {
  per_item_limit_cents: number;
  auto_capture_max_cents: number;
  hold_timeout_hours: number;
  blocked_categories: string[];
}

export async function getFamily(familyId = DEMO_FAMILY_ID) {
  return one<Family>(`SELECT * FROM family WHERE id=$1`, [familyId]);
}

export async function getMembers(familyId: string) {
  return q<Member>(`SELECT * FROM member WHERE family_id=$1 ORDER BY role DESC, name`, [familyId]);
}

export async function getMember(memberId: string) {
  return one<Member>(`SELECT * FROM member WHERE id=$1`, [memberId]);
}

export async function getPolicy(familyId: string) {
  return one<Policy>(`SELECT * FROM policy WHERE family_id=$1`, [familyId]);
}

export async function parentOf(familyId: string) {
  return one<Member>(`SELECT * FROM member WHERE family_id=$1 AND role='parent' LIMIT 1`, [familyId]);
}

export async function approversOf(familyId: string) {
  return q<Member>(`SELECT * FROM member WHERE family_id=$1 AND is_approver ORDER BY name`, [familyId]);
}

/** Demo clock: real time plus an offset the demo panel can advance. */
export function familyNow(f: Pick<Family, "clock_offset_days">) {
  return new Date(Date.now() + f.clock_offset_days * 86_400_000);
}

export async function fundStatus(familyId: string, period = currentPeriod()) {
  const fam = await getFamily(familyId);
  const rows = await q<any>(
    `SELECT c.*, m.name AS member_name FROM contribution c JOIN member m ON m.id=c.member_id
     WHERE c.family_id=$1 AND c.period=$2 AND c.status <> 'cancelled' ORDER BY m.name, c.part`,
    [familyId, period],
  );
  const collected = rows.filter((r) => r.status === "paid").reduce((a, r) => a + r.amount_cents, 0);
  const target = fam?.monthly_target_cents ?? 0;
  return {
    period,
    target,
    collected,
    pct: target ? Math.min(100, Math.round((collected / target) * 100)) : 0,
    contributions: rows,
    outstanding: rows.filter((r) => r.status === "sent"),
  };
}
