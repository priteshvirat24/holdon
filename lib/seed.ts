/**
 * Reset & seed the demo family. Safe to run any time from /demo.
 * State after seeding: Priya and Raj have paid, Anil's invoice went out
 * 4 days ago (so the first Bad Cop nudge is due), fund at 67%.
 */
import "server-only";
import { q } from "./db";
import { DEMO_FAMILY_ID } from "./family";
import { currentPeriod, id } from "./util";
import { createAndSendInvoice } from "./paypal";
import { post } from "./chat";

const env = (k: string, d: string) => process.env[k] || d;

export async function resetAndSeed() {
  const fid = DEMO_FAMILY_ID;
  const keepTelegram = await q<any>(`SELECT telegram_chat_id FROM family WHERE id=$1`, [fid]);
  const keepUsers = await q<any>(`SELECT id, telegram_user_id FROM member WHERE family_id=$1`, [fid]);

  await q(`DELETE FROM family WHERE id=$1`, [fid]);
  await q(`DELETE FROM event WHERE family_id=$1 OR family_id IS NULL`, [fid]);
  await q(`DELETE FROM merchant`);

  await q(`INSERT INTO family (id, name, parent_name, telegram_chat_id, monthly_target_cents) VALUES ($1,$2,$3,$4,$5)`, [
    fid,
    "Sharma",
    "Sunita",
    keepTelegram[0]?.telegram_chat_id ?? process.env.TELEGRAM_FAMILY_CHAT_ID ?? null,
    60000,
  ]);
  const members = [
    { id: "mem_sunita", name: "Sunita", role: "parent", approver: false, email: env("PAYPAL_SANDBOX_MOM_EMAIL", "sunita@holdon.demo"), share: 0 },
    { id: "mem_priya", name: "Priya", role: "sibling", approver: true, email: env("PAYPAL_SANDBOX_PRIYA_EMAIL", "priya@holdon.demo"), share: 20000 },
    { id: "mem_anil", name: "Anil", role: "sibling", approver: false, email: env("PAYPAL_SANDBOX_ANIL_EMAIL", "anil@holdon.demo"), share: 20000 },
    { id: "mem_raj", name: "Raj", role: "sibling", approver: false, email: env("PAYPAL_SANDBOX_RAJ_EMAIL", "raj@holdon.demo"), share: 20000 },
  ];
  for (const m of members) {
    await q(
      `INSERT INTO member (id, family_id, name, role, is_approver, paypal_email, telegram_user_id, share_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [m.id, fid, m.name, m.role, m.approver, m.email, keepUsers.find((u) => u.id === m.id)?.telegram_user_id ?? null, m.share],
    );
  }
  await q(
    `INSERT INTO policy (family_id, per_item_limit_cents, auto_capture_max_cents, hold_timeout_hours, blocked_categories) VALUES ($1,$2,$3,$4,$5)`,
    [fid, 15000, 6000, 24, ["gift_cards", "crypto"]],
  );

  const period = currentPeriod();
  const now = Date.now();
  // Priya and Raj already paid (seeded history, no live invoice needed).
  for (const m of ["mem_priya", "mem_raj"]) {
    await q(
      `INSERT INTO contribution (id, family_id, member_id, period, amount_cents, status, sent_at, paid_at, invoice_id) VALUES ($1,$2,$3,$4,20000,'paid',$5,$6,$7)`,
      [id("con"), fid, m, period, new Date(now - 5 * 86_400_000).toISOString(), new Date(now - 3 * 86_400_000).toISOString(), "SEEDED-HISTORY"],
    );
  }
  // Anil: a REAL sandbox invoice (when keys exist), sent "4 days ago".
  const cid = id("con");
  await q(`INSERT INTO contribution (id, family_id, member_id, period, amount_cents, status) VALUES ($1,$2,'mem_anil',$3,20000,'draft')`, [cid, fid, period]);
  const inv = await createAndSendInvoice({
    contributionId: cid,
    familyId: fid,
    recipientEmail: members[2].email,
    recipientName: "Anil",
    amountCents: 20000,
    itemName: "Sunita's monthly fund",
    note: "Your share for Mom this month. Thank you 💛",
    dueDate: new Date(now + 3 * 86_400_000).toISOString().slice(0, 10),
  });
  await q(`UPDATE contribution SET status='sent', invoice_id=$2, payer_url=$3, sent_at=$4 WHERE id=$1`, [
    cid,
    inv.invoiceId,
    inv.payerUrl,
    new Date(now - 4 * 86_400_000).toISOString(),
  ]);

  await post({ familyId: fid, text: "👋 Hi Sharma family! I'm HoldOn. I collect Mom's monthly fund so nobody has to chase anyone, and I double-check her purchases before money moves." });
  await post({ familyId: fid, text: "Priya ✅ Raj ✅: 67% of this month's fund is in." });
  return { familyId: fid, anilInvoice: inv.invoiceId };
}
