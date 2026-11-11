import "server-only";
import { q } from "./db";
import { DEMO_FAMILY_ID, familyNow, fundStatus, getFamily, getMembers, getPolicy } from "./family";
import { paypalMode } from "./paypal";
import { mistralConfigured } from "./mistral/client";
import { telegramConfigured } from "./telegram";
import { channel3Configured } from "./risk/signals";
import { STATE_LABEL } from "./state/purchase";

/** Everything the screens poll, in one round trip. */
export async function snapshot(familyId = DEMO_FAMILY_ID) {
  const family = await getFamily(familyId);
  const integrations = {
    paypal: paypalMode(),
    mistral: mistralConfigured(),
    telegram: telegramConfigured(),
    channel3: channel3Configured(),
  };
  if (!family) return { family: null, integrations };

  const [members, policy, fund, purchases, messages, events, payouts] = await Promise.all([
    getMembers(familyId),
    getPolicy(familyId),
    fundStatus(familyId),
    q<any>(
      `SELECT p.*, m.display_name AS merchant_name, m.domain AS merchant_domain
         FROM purchase p JOIN merchant m ON m.id = p.merchant_id
        WHERE p.family_id=$1 ORDER BY p.created_at DESC LIMIT 50`,
      [familyId],
    ),
    q<any>(`SELECT * FROM message WHERE family_id=$1 ORDER BY created_at DESC LIMIT 80`, [familyId]),
    q<any>(`SELECT * FROM event WHERE family_id=$1 ORDER BY created_at DESC LIMIT 120`, [familyId]),
    q<any>(`SELECT * FROM payout WHERE family_id=$1 ORDER BY created_at DESC`, [familyId]),
  ]);

  const captured = purchases.filter((p) => p.state === "CAPTURED");
  const stopped = purchases.filter((p) => p.state === "VOIDED" && (p.risk_score ?? 0) >= 30);
  return {
    family,
    now: familyNow(family).toISOString(),
    integrations,
    members,
    policy,
    fund,
    purchases: purchases.map((p) => ({ ...p, state_label: STATE_LABEL[p.state as keyof typeof STATE_LABEL] ?? p.state })),
    messages: messages.reverse(),
    events,
    payouts,
    kpis: {
      fundPct: fund.pct,
      collectedCents: fund.collected,
      targetCents: fund.target,
      spentCents: captured.reduce((a, p) => a + p.amount_cents, 0),
      protectedCents: stopped.reduce((a, p) => a + p.amount_cents, 0),
      held: purchases.filter((p) => p.state === "HELD_FOR_FAMILY").length,
      scamsStopped: stopped.length,
      nudgesSent: events.filter((e) => String(e.type).startsWith("badcop.nudge")).length,
    },
  };
}
