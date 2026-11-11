/**
 * End-to-end Bad Cop scenario against a running app (real PayPal sandbox + Mistral):
 *   node scripts/e2e.mjs [http://localhost:3000]
 * Resets the family, exercises every steward tool and the full nudge ladder,
 * and prints the family chat as it evolves. Exits non-zero on a failed check.
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
let failures = 0;

async function call(path, body) {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${data.error ?? ""}`);
  return data;
}
const state = () => call("/api/state");
let seen = 0;
async function showNew(label) {
  const s = await state();
  const msgs = s.messages.slice(seen);
  seen = s.messages.length;
  console.log(`\n── ${label}`);
  for (const m of msgs) {
    const who = m.author === "holdon" ? "HoldOn" : s.members.find((x) => x.id === m.author)?.name ?? m.author;
    const to = m.audience === "group" ? "" : ` → (private to ${s.members.find((x) => x.id === m.audience)?.name})`;
    console.log(`  ${who}${to}: ${m.text}${m.card ? `  [card: ${m.card.title} | ${m.card.buttons.map((b) => b.label).join(" / ")}${m.card.resolved ? ` | ${m.card.resolved}` : ""}]` : ""}`);
  }
  return s;
}
function check(cond, msg) {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
}
const lastTools = async (n = 6) => (await state()).events.slice(0, n).filter((e) => e.type.startsWith("agent.tool.")).map((e) => e.type.replace("agent.tool.", ""));

console.log(`HoldOn e2e against ${BASE}`);
await call("/api/demo/reset", {});
let s = await showNew("reset");
check(s.integrations.paypal !== "simulated", `PayPal mode: ${s.integrations.paypal}`);
check(s.fund.pct === 67, `fund starts at 67% (got ${s.fund.pct}%)`);

await call("/api/chat", { memberId: "mem_raj", text: "how is mom's fund looking this month?" });
s = await showNew("Raj asks for status");
check((await lastTools()).includes("fund_status"), "agent used fund_status");

await call("/api/chat", { memberId: "mem_anil", text: "I already paid this yesterday I think?" });
s = await showNew("Anil claims he paid");
check((await lastTools()).includes("check_my_contribution"), "agent checked PayPal invoice status instead of trusting the claim");
check(s.fund.outstanding.some((c) => c.member_name === "Anil"), "Anil still shows as outstanding (PayPal says unpaid)");
check(!/all set|you're paid|is paid/i.test(s.messages.at(-1).text), "agent did NOT tell Anil he's paid");
check(!s.messages.some((m) => /₹|€|£/.test(m.text)), "all amounts in $");

// Ladder: invoice was sent 4 days ago → step 1 due now.
for (const [i, days] of [[1, 0], [2, 3], [3, 3], [4, 3]]) {
  const r = days ? await call("/api/demo/clock", { days }) : await call("/api/demo/sweep", {});
  s = await showNew(`ladder step ${i} (+${days}d)`);
  check(r.nudges === 1, `step ${i} nudge sent`);
}
const anil = s.fund.contributions.find((c) => c.member_name === "Anil");
check(anil?.ladder_step === 4, `Anil's ladder at step 4 (got ${anil?.ladder_step})`);
check(s.events.some((e) => e.type === "paypal.call" && String(e.payload?.path).endsWith("/remind")), "PayPal invoice remind endpoint was called");
const coverCard = s.messages.find((m) => m.card?.kind === "cover" && m.audience === "mem_priya");
check(!!coverCard, "step 4 escalated privately to Priya with a cover card");

await call("/api/chat", { memberId: "mem_anil", text: "sorry sorry, can you stop reminding me until the 28th? I get paid then" });
s = await showNew("Anil asks to snooze");
check((await lastTools()).includes("snooze_my_contribution"), "agent used snooze_my_contribution");

await call("/api/chat", { memberId: "mem_anil", text: "actually Priya can you cover me this month? I'll pay you back" });
s = await showNew("Anil asks Priya to cover");
check((await lastTools()).includes("request_cover"), "agent used request_cover");
const ask = s.messages.filter((m) => m.card?.kind === "cover" && !m.card.resolved).pop();
check(!!ask, "Priya got a cover card");
if (ask) {
  await call("/api/cards", { refId: ask.card.refId, action: ask.card.buttons[0].action, memberId: "mem_priya" });
  s = await showNew("Priya taps " + ask.card.buttons[0].label);
  const priyaOpen = s.fund.outstanding.find((c) => c.member_name === "Priya");
  check(!!priyaOpen?.invoice_id?.startsWith("INV2-"), `Priya got a real PayPal invoice for the cover (${priyaOpen?.invoice_id})`);
  check(!s.fund.outstanding.some((c) => c.member_name === "Anil"), "Anil's invoice was cancelled");
  if (priyaOpen) {
    await call("/api/demo/mark-paid", { contributionId: priyaOpen.id });
    s = await showNew("Priya pays (recorded on the PayPal invoice)");
    check(s.fund.pct === 100, `fund reaches 100% (got ${s.fund.pct}%)`);
    const po = s.payouts?.[0];
    check(!!po, `allowance Payout attempted (${po?.status ?? "none"}${po?.batch_id ? `, batch ${po.batch_id}` : ""})`);
    if (po?.status === "FAILED") console.log("  ! PayPal refused the Payout for this sandbox account (see chat). Use a US sandbox business account for Payouts.");
  }
}

console.log(`\n${failures ? `✗ ${failures} check(s) failed` : "✓ all checks passed"}`);
process.exit(failures ? 1 : 0);
