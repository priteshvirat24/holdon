/**
 * Bad Cop flows: monthly invoices, nudge ladder, split / snooze / cover,
 * paid webhook, and the allowance payout when the fund is full.
 */
import "server-only";
import { one, q } from "../db";
import { currentPeriod, dollars, id, periodLabel, daysBetween } from "../util";
import { post, resolveCard } from "../chat";
import { approversOf, familyNow, fundStatus, getFamily, getMember, getMembers, parentOf, type Member } from "../family";
import { cancelInvoice, createAndSendInvoice, getInvoiceStatus, remindInvoice, sendPayout } from "../paypal";
import { dueNudge } from "../badcop/ladder";
import { writeNudge } from "../badcop/writer";
import { logEvent } from "../events";

export interface ContributionRow {
  id: string;
  family_id: string;
  member_id: string;
  period: string;
  amount_cents: number;
  part: number;
  invoice_id: string | null;
  payer_url: string | null;
  status: "draft" | "sent" | "paid" | "cancelled" | "covered";
  ladder_step: number;
  last_nudge_at: string | null;
  snoozed_until: string | null;
  covered_by: string | null;
  sent_at: string | null;
  paid_at: string | null;
}

const NEXT_NEED = "Mom's pharmacy order on Friday";

function dueDate(now: Date, days = 7) {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

async function issueInvoice(familyId: string, member: Member, amountCents: number, period: string, part: number, note: string, now: Date) {
  const parent = await parentOf(familyId);
  const cid = id("con");
  await q(
    `INSERT INTO contribution (id, family_id, member_id, period, amount_cents, part, status) VALUES ($1,$2,$3,$4,$5,$6,'draft')`,
    [cid, familyId, member.id, period, amountCents, part],
  );
  const inv = await createAndSendInvoice({
    contributionId: cid,
    familyId,
    recipientEmail: member.paypal_email || `${member.name.toLowerCase()}@holdon.demo`,
    recipientName: member.name,
    amountCents,
    itemName: `${parent?.name ?? "Mom"}'s ${periodLabel(period)} fund${part > 1 ? ` (part ${part})` : ""}`,
    note,
    dueDate: dueDate(now),
  });
  await q(`UPDATE contribution SET invoice_id=$2, payer_url=$3, status='sent', sent_at=$4 WHERE id=$1`, [
    cid,
    inv.invoiceId,
    inv.payerUrl,
    now.toISOString(),
  ]);
  return cid;
}

// ------------------------------------------------------------------ monthly cycle

export async function startCycle(familyId: string, period = currentPeriod()) {
  const fam = (await getFamily(familyId))!;
  const now = familyNow(fam);
  const parent = await parentOf(familyId);
  const siblings = (await getMembers(familyId)).filter((m) => m.role === "sibling");
  const existing = await q(`SELECT member_id FROM contribution WHERE family_id=$1 AND period=$2 AND status<>'cancelled'`, [familyId, period]);
  const have = new Set(existing.map((r: any) => r.member_id));
  let issued = 0;
  for (const s of siblings) {
    if (have.has(s.id) || s.share_cents <= 0) continue;
    await issueInvoice(familyId, s, s.share_cents, period, 1, `Your share for ${parent?.name ?? "Mom"} this month. Thank you 💛`, now);
    issued++;
  }
  if (issued) {
    await post({
      familyId,
      text: `📬 ${periodLabel(period)} fund for ${parent?.name ?? "Mom"}: ${dollars(fam.monthly_target_cents)}. PayPal invoices are out to ${siblings.map((s) => s.name).join(", ")}. I'll do the chasing so nobody else has to 🙂`,
    });
  }
  return issued;
}

// ------------------------------------------------------------------ paid (webhook or check)

export async function markPaid(contributionId: string, source: string) {
  const rows = await q<ContributionRow>(
    `UPDATE contribution SET status='paid', paid_at=now() WHERE id=$1 AND status='sent' RETURNING *`,
    [contributionId],
  );
  const c = rows[0];
  if (!c) return null;
  await logEvent({ familyId: c.family_id, type: "contribution.paid", source, payload: { contributionId, invoice: c.invoice_id } });
  const status = await fundStatus(c.family_id, c.period);
  const paidNames = Array.from(new Set(status.contributions.filter((r: any) => r.status === "paid").map((r: any) => r.member_name)));
  const member = await getMember(c.member_id);
  if (status.collected >= status.target) {
    await post({ familyId: c.family_id, text: `🎉 ${member?.name} is in. That's everyone: ${dollars(status.collected)} of ${dollars(status.target)}.` });
    await maybePayAllowance(c.family_id, c.period);
  } else {
    await post({
      familyId: c.family_id,
      text: `${paidNames.map((n) => `${n} ✅`).join(" ")}: ${status.pct}% of ${periodLabel(c.period)}'s fund is in.`,
    });
  }
  return c;
}

export async function onInvoicePaid(invoiceId: string) {
  const c = await one<ContributionRow>(`SELECT * FROM contribution WHERE invoice_id=$1`, [invoiceId]);
  if (!c) return null;
  return markPaid(c.id, "paypal_webhook");
}

// ------------------------------------------------------------------ nudge ladder (cron)

export async function nudgeSweep(familyId: string) {
  const fam = (await getFamily(familyId))!;
  const now = familyNow(fam);
  const parent = await parentOf(familyId);
  const approver = (await approversOf(familyId))[0];
  const open = await q<ContributionRow>(`SELECT * FROM contribution WHERE family_id=$1 AND status='sent'`, [familyId]);
  let sent = 0;
  for (const c of open) {
    const step = dueNudge(
      {
        status: c.status,
        ladder_step: c.ladder_step,
        sent_at: c.sent_at ? new Date(c.sent_at) : null,
        last_nudge_at: c.last_nudge_at ? new Date(c.last_nudge_at) : null,
        snoozed_until: c.snoozed_until ? new Date(c.snoozed_until) : null,
      },
      now,
    );
    if (!step) continue;
    const member = (await getMember(c.member_id))!;
    const status = await fundStatus(familyId, c.period);
    const paidNames = Array.from(new Set(status.contributions.filter((r: any) => r.status === "paid").map((r: any) => r.member_name)));
    const nudge = await writeNudge({
      familyId,
      siblingName: member.name,
      parentName: parent?.name ?? "Mom",
      approverName: approver?.name ?? "the family",
      amount: dollars(c.amount_cents),
      monthLabel: periodLabel(c.period),
      daysLate: daysBetween(new Date(c.sent_at!), now),
      fundPct: status.pct,
      paidNames,
      nextNeed: NEXT_NEED.replace("Mom", parent?.name ?? "Mom"),
      step,
    });

    if (step.channel === "approver-dm" && approver) {
      await post({
        familyId,
        audience: approver.id,
        text: `🔒 (private) ${nudge.chat_message}`,
        card: {
          kind: "cover",
          refId: c.id,
          title: `${member.name}'s ${dollars(c.amount_cents)} is ${daysBetween(new Date(c.sent_at!), now)} days late`,
          lines: ["Only you can see this."],
          buttons: [
            { label: "I'll cover it", action: "cover-self" },
            { label: "Snooze a week", action: "snooze-7" },
          ],
          forMemberId: approver.id,
        },
      });
    } else {
      await post({ familyId, text: nudge.chat_message });
      if (step.channel === "group+paypal" && c.invoice_id) {
        await remindInvoice({ invoiceId: c.invoice_id, familyId, subject: `Reminder: ${parent?.name ?? "Mom"}'s fund`, note: nudge.paypal_note });
      }
    }
    await q(`UPDATE contribution SET ladder_step=$2, last_nudge_at=$3 WHERE id=$1`, [c.id, step.step, now.toISOString()]);
    await logEvent({ familyId, type: `badcop.nudge.step${step.step}`, source: "cron", payload: { contribution: c.id, member: member.name, channel: step.channel } });
    sent++;
  }
  return sent;
}

// ------------------------------------------------------------------ reply actions (called by the steward agent with the SPEAKER's identity)

export async function openContributionFor(memberId: string, familyId: string) {
  return one<ContributionRow>(
    `SELECT * FROM contribution WHERE family_id=$1 AND member_id=$2 AND status='sent' ORDER BY created_at DESC LIMIT 1`,
    [familyId, memberId],
  );
}

export async function splitContribution(c: ContributionRow, parts: number) {
  parts = Math.max(2, Math.min(4, Math.round(parts)));
  const fam = (await getFamily(c.family_id))!;
  const now = familyNow(fam);
  const member = (await getMember(c.member_id))!;
  if (c.invoice_id) await cancelInvoice({ invoiceId: c.invoice_id, familyId: c.family_id, note: `Replaced by ${parts} smaller invoices.` });
  await q(`UPDATE contribution SET status='cancelled' WHERE id=$1`, [c.id]);
  const base = Math.floor(c.amount_cents / parts);
  const amounts = Array.from({ length: parts }, (_, i) => (i === parts - 1 ? c.amount_cents - base * (parts - 1) : base));
  const ids: string[] = [];
  for (let i = 0; i < parts; i++) {
    const cid = await issueInvoice(c.family_id, member, amounts[i], c.period, i + 1, `Part ${i + 1} of ${parts}. No stress 💛`, now);
    if (i > 0) {
      // later parts are due later: snooze their nudges
      await q(`UPDATE contribution SET snoozed_until=$2 WHERE id=$1`, [cid, new Date(now.getTime() + i * 14 * 86_400_000).toISOString()]);
    }
    ids.push(cid);
  }
  return {
    parts,
    amounts: amounts.map(dollars),
    ids,
    allInvoicesSentNow: true,
    reminders: amounts.map((_, i) =>
      i === 0 ? "part 1: reminders as usual" : `part ${i + 1}: no reminders before ${new Date(now.getTime() + i * 14 * 86_400_000).toISOString().slice(0, 10)}`,
    ),
  };
}

export async function snoozeContribution(c: ContributionRow, untilISO: string) {
  const fam = (await getFamily(c.family_id))!;
  const now = familyNow(fam);
  let until = new Date(untilISO);
  if (isNaN(until.getTime()) || until < now) until = new Date(now.getTime() + 7 * 86_400_000);
  const max = new Date(now.getTime() + 21 * 86_400_000);
  if (until > max) until = max;
  await q(`UPDATE contribution SET snoozed_until=$2 WHERE id=$1`, [c.id, until.toISOString()]);
  return until.toISOString().slice(0, 10);
}

export async function requestCover(c: ContributionRow, fromMemberId: string) {
  const debtor = (await getMember(c.member_id))!;
  const coverer = await getMember(fromMemberId);
  if (!coverer || coverer.family_id !== c.family_id || coverer.id === debtor.id) throw new Error("Invalid cover request");
  await post({
    familyId: c.family_id,
    audience: coverer.id,
    text: `${debtor.name} asked if you could cover their ${dollars(c.amount_cents)} for ${periodLabel(c.period)}. I'd add it to next month's invoice for ${debtor.name}.`,
    card: {
      kind: "cover",
      refId: c.id,
      title: `Cover ${debtor.name}'s ${dollars(c.amount_cents)}?`,
      lines: [`${debtor.name} pays you back next month (tracked as an IOU).`],
      buttons: [
        { label: "Yes, cover it", action: "cover-yes" },
        { label: "Not this time", action: "cover-no" },
      ],
      forMemberId: coverer.id,
    },
  });
  return coverer.name;
}

/** Coverer (or approver via "cover-self") accepts: invoice them, cancel debtor's, record IOU. */
export async function acceptCover(contributionId: string, covererId: string) {
  const c = await one<ContributionRow>(`SELECT * FROM contribution WHERE id=$1`, [contributionId]);
  if (!c || c.status !== "sent") return null;
  const coverer = (await getMember(covererId))!;
  const debtor = (await getMember(c.member_id))!;
  const fam = (await getFamily(c.family_id))!;
  if (c.invoice_id) await cancelInvoice({ invoiceId: c.invoice_id, familyId: c.family_id, note: `${coverer.name} is covering this month.` });
  await q(`UPDATE contribution SET status='covered', covered_by=$2 WHERE id=$1`, [c.id, coverer.id]);
  await issueInvoice(c.family_id, coverer, c.amount_cents, c.period, 1, `Covering ${debtor.name} this month. You're a star ⭐`, familyNow(fam));
  await q(`INSERT INTO iou (id, family_id, debtor_id, creditor_id, amount_cents, period) VALUES ($1,$2,$3,$4,$5,$6)`, [
    id("iou"),
    c.family_id,
    debtor.id,
    coverer.id,
    c.amount_cents,
    c.period,
  ]);
  await resolveCard(c.id, `${coverer.name} is covering`);
  await post({ familyId: c.family_id, text: `🤝 ${coverer.name} is covering ${debtor.name} this month (${dollars(c.amount_cents)}). ${coverer.name}, your PayPal invoice is out. IOU noted on the ledger for next month. No drama.` });
  return c;
}

export async function declineCover(contributionId: string, covererId: string) {
  const c = await one<ContributionRow>(`SELECT * FROM contribution WHERE id=$1`, [contributionId]);
  if (!c) return;
  const coverer = await getMember(covererId);
  await resolveCard(c.id, `${coverer?.name} can't cover`);
  await post({ familyId: c.family_id, audience: c.member_id, text: `${coverer?.name} can't cover this time. Want to split it in two instead? Just reply "split".` });
}

/** "Already paid!": check PayPal directly and answer truthfully. */
export async function checkContribution(c: ContributionRow) {
  if (!c.invoice_id) return { paid: c.status === "paid", meaning: `HoldOn shows this share as ${c.status}.` };
  const s = await getInvoiceStatus(c.invoice_id, c.family_id).catch(() => "UNKNOWN");
  if ((s === "PAID" || s === "MARKED_AS_PAID") && c.status === "sent") {
    await markPaid(c.id, "agent_check");
    return { paid: true, paypal_invoice_status: s, meaning: "PayPal confirms it is paid. Fund updated." };
  }
  const paid = c.status === "paid" || s === "PAID" || s === "MARKED_AS_PAID";
  return {
    paid,
    amount: dollars(c.amount_cents),
    paypal_invoice_status: s,
    meaning: paid
      ? "Paid."
      : `NOT paid yet: the PayPal invoice is still open (status ${s}). Payment can take a minute to show; otherwise use the Pay now link.`,
  };
}

// ------------------------------------------------------------------ allowance

export async function maybePayAllowance(familyId: string, period: string) {
  const status = await fundStatus(familyId, period);
  if (status.collected < status.target) return null;
  const done = await one(`SELECT id FROM payout WHERE family_id=$1 AND period=$2`, [familyId, period]);
  if (done) return null;
  const parent = (await parentOf(familyId))!;
  const pid = id("pay");
  await q(`INSERT INTO payout (id, family_id, member_id, period, amount_cents, status) VALUES ($1,$2,$3,$4,$5,'pending')`, [
    pid,
    familyId,
    parent.id,
    period,
    status.target,
  ]);
  let r: { batchId: string; status: string };
  try {
    r = await sendPayout({
      payoutId: pid,
      familyId,
      receiverEmail: parent.paypal_email || "mom@holdon.demo",
      amountCents: status.target,
      note: `Your ${periodLabel(period)} allowance from the family. Love you 💛`,
    });
  } catch (e: any) {
    // e.g. sandbox business accounts in some countries can't send Payouts. Never break the "paid" flow.
    await q(`UPDATE payout SET status='FAILED' WHERE id=$1`, [pid]);
    await logEvent({ familyId, type: "payout.failed", source: "paypal", payload: { message: e?.message, issue: e?.issue } });
    await post({ familyId, text: `⚠️ The fund is full, but PayPal didn't accept the allowance payout to ${parent.name}: "${e?.message ?? "unknown error"}". The money is safe in the family fund.` });
    return pid;
  }
  await q(`UPDATE payout SET batch_id=$2, status=$3 WHERE id=$1`, [pid, r.batchId, r.status]);
  await post({ familyId, text: `💸 ${parent.name}'s ${periodLabel(period)} allowance (${dollars(status.target)}) just landed in her PayPal.` });
  return pid;
}
