"use client";
import { useState } from "react";
import Link from "next/link";
import { api, dollars, Logo, ModeBadge, useSnapshot } from "../ui";

const ACTIONS = [
  { key: "reset", label: "Reset & seed the Sharma family", hint: "Priya and Raj have paid. Anil's real PayPal invoice went out 4 days ago.", path: "/api/demo/reset", body: {} },
  { key: "sweep", label: "Run scheduled jobs now", hint: "Bad Cop nudge ladder + release holds nobody decided on.", path: "/api/demo/sweep", body: {} },
  { key: "plus3", label: "Fast-forward 3 days ⏩", hint: "Moves the family clock, then runs the jobs: watch the next nudge.", path: "/api/demo/clock", body: { days: 3 } },
  { key: "plus1", label: "Fast-forward 1 day", hint: "Lets an undecided hold expire (24h timeout → void).", path: "/api/demo/clock", body: { days: 1 } },
  { key: "refill", label: "🤖 Agent: monthly medicine refill", hint: "Reorders Mom's tablets with her PayPal saved in Vault (no popup), through the same risk check.", path: "/api/agent/reorder", body: {} },
  { key: "cycle", label: "Start next month's invoices", hint: "Issues PayPal invoices for any sibling without one this month.", path: "/api/demo/cycle", body: {} },
];

export default function DemoPanel() {
  const { snap, refresh } = useSnapshot(2000);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  async function run(a: (typeof ACTIONS)[number]) {
    setBusy(a.key);
    try {
      const r = await api(a.path, a.body);
      setLog((l) => [`✓ ${a.label}: ${JSON.stringify(r).slice(0, 160)}`, ...l]);
      await refresh();
    } catch (e: any) {
      setLog((l) => [`✗ ${a.label}: ${e.message}`, ...l]);
    } finally {
      setBusy(null);
    }
  }

  const i = snap?.integrations;
  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-muted">/ demo panel</span>
        </div>
        <ModeBadge integrations={i} />
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          ["PayPal", i?.paypal === "simulated" ? "simulated" : i?.paypal ?? "…"],
          ["Mistral", i ? (i.mistral ? "connected" : "missing key") : "…"],
          ["Channel3", i ? (i.channel3 ? "connected" : "seeded prices") : "…"],
          ["Telegram", i ? (i.telegram ? "connected" : "web chat only") : "…"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-card px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</div>
            <div className="mt-0.5 font-semibold">{v}</div>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            Family clock: <b className="tabular">{snap?.now ? new Date(snap.now).toLocaleString() : "…"}</b>
            {snap?.family?.clock_offset_days ? <span className="text-muted"> (+{snap.family.clock_offset_days} days)</span> : null}
          </span>
          <span>
            Fund: <b className="tabular">{snap?.fund ? `${dollars(snap.fund.collected)} / ${dollars(snap.fund.target)}` : "…"}</b>
          </span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              disabled={!!busy}
              onClick={() => run(a)}
              className="rounded-xl border border-line bg-paper px-4 py-3 text-left hover:border-marigold disabled:opacity-50"
            >
              <div className="font-semibold">{busy === a.key ? "Working…" : a.label}</div>
              <div className="text-xs text-muted">{a.hint}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href="/stage" className="rounded-2xl bg-ink p-5 text-white">
          <div className="font-display text-2xl">Stage view →</div>
          <div className="mt-1 text-sm text-white/70">Mom&apos;s tablet and Priya&apos;s phone side by side. Use this for the video.</div>
        </Link>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["/mom", "Mom Mode"],
            ["/family", "Family chat"],
            ["/dashboard", "Ledger"],
            ["/stores/luxerelax", "Scam store"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="flex items-center justify-center rounded-2xl border border-line bg-card p-3 font-semibold hover:border-marigold">
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Script</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Reset &amp; seed. In the family chat (as Anil), try &ldquo;can I pay half now?&rdquo; or &ldquo;Priya can you cover me?&rdquo;.</li>
          <li>Fast-forward 3 days to show the Bad Cop ladder escalate (group → PayPal reminder → private note to Priya).</li>
          <li>As Anil, press Pay now. The fund fills, and Sunita&apos;s allowance goes out as a PayPal Payout.</li>
          <li>In Mom Mode, buy the blood-pressure tablets: checked and captured automatically. PayPal also saves her PayPal (Vault).</li>
          <li>Press &ldquo;Agent: monthly medicine refill&rdquo;: HoldOn buys the refill by itself with the saved PayPal, with no popup and the same checks.</li>
          <li>Ask for &ldquo;that massage chair from Facebook&rdquo;: PayPal authorizes, HoldOn holds it, and Priya declines. The authorization is voided, $0 moved.</li>
        </ol>
      </section>

      {log.length > 0 && (
        <pre className="mt-6 max-h-60 overflow-auto rounded-2xl bg-ink p-4 text-xs text-white/90">{log.join("\n")}</pre>
      )}
    </main>
  );
}
