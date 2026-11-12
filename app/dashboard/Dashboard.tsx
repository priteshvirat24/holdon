"use client";
import { useMemo } from "react";
import Link from "next/link";
import { AgGridReact } from "ag-grid-react";
import { AgCharts } from "ag-charts-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { dollars, Logo, ModeBadge, Pill, useSnapshot } from "../ui";
import evalResults from "@/evals/results.json";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  backgroundColor: "#ffffff",
  foregroundColor: "#1f1a14",
  headerBackgroundColor: "#fbf7f0",
  headerTextColor: "#6f655a",
  borderColor: "#e9e1d4",
  rowHoverColor: "#fdf6e7",
  accentColor: "#e8a317",
  fontFamily: "var(--font-inter)",
  headerFontWeight: 600,
  wrapperBorderRadius: 16,
  spacing: 7,
});

type Row = {
  when: string;
  kind: "Purchase" | "Contribution" | "Allowance";
  who: string;
  what: string;
  amount: number;
  direction: "in" | "out";
  state: string;
  stateLabel?: string;
  risk: number | null;
  paypalId: string | null;
  why?: string | null;
};

function RiskCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const color = value >= 60 ? "#d9534f" : value >= 30 ? "#e8a317" : "#2f7d5b";
  return (
    <span className="flex h-full items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[#efe9df]">
        <span className="block h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </span>
      <span className="tabular text-xs">{value}</span>
    </span>
  );
}

export default function Dashboard() {
  const { snap } = useSnapshot(2000);

  const rows: Row[] = useMemo(() => {
    if (!snap?.family) return [];
    const names = Object.fromEntries((snap.members ?? []).map((m: any) => [m.id, m.name]));
    const parent = snap.family.parent_name;
    const purchases: Row[] = snap.purchases.map((p: any) => ({
      when: p.created_at,
      kind: "Purchase",
      who: parent,
      what: `${p.item} · ${p.merchant_name}`,
      amount: p.amount_cents,
      direction: "out",
      state: p.state,
      stateLabel: p.state_label,
      risk: p.risk_score,
      paypalId: p.capture_id ?? p.authorization_id ?? p.order_id,
      why: p.family_message,
    }));
    const contributions: Row[] = snap.fund.contributions.map((c: any) => ({
      when: c.paid_at ?? c.sent_at ?? c.created_at,
      kind: "Contribution",
      who: c.member_name,
      what: `Share for ${snap.fund.period}${c.part > 1 ? ` (part ${c.part})` : ""}${c.ladder_step ? ` · nudged ×${c.ladder_step}` : ""}`,
      amount: c.amount_cents,
      direction: "in",
      state: c.status,
      risk: null,
      paypalId: c.invoice_id,
    }));
    const payouts: Row[] = (snap.payouts ?? []).map((p: any) => ({
      when: p.created_at,
      kind: "Allowance",
      who: names[p.member_id] ?? parent,
      what: `Monthly allowance ${p.period}`,
      amount: p.amount_cents,
      direction: "out",
      state: p.status === "SUCCESS" || p.status === "PENDING" ? "paid" : p.status,
      risk: null,
      paypalId: p.batch_id,
    }));
    return [...purchases, ...contributions, ...payouts].sort((a, b) => +new Date(b.when) - +new Date(a.when));
  }, [snap]);

  const cols = useMemo<ColDef<Row>[]>(
    () => [
      { field: "when", headerName: "When", width: 150, valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "") },
      { field: "kind", headerName: "Type", width: 130, filter: true },
      { field: "who", headerName: "Who", width: 110, filter: true },
      { field: "what", headerName: "What", flex: 1, minWidth: 220, tooltipField: "why" },
      {
        field: "amount",
        headerName: "Amount",
        width: 120,
        type: "rightAligned",
        cellRenderer: (p: any) => (
          <span className={`tabular font-semibold ${p.data.direction === "in" ? "text-sage" : ""}`}>
            {p.data.direction === "in" ? "+" : "−"}
            {dollars(p.value)}
          </span>
        ),
      },
      { field: "state", headerName: "Status", width: 170, filter: true, cellRenderer: (p: any) => <Pill state={p.value} label={p.data.stateLabel} /> },
      { field: "risk", headerName: "Risk", width: 130, cellRenderer: RiskCell },
      { field: "paypalId", headerName: "PayPal ID", width: 210, cellClass: "font-mono text-xs" },
    ],
    [],
  );

  const k = snap?.kpis;
  const feed = (snap?.events ?? []).filter((e: any) => !String(e.type).startsWith("cron.")).slice(0, 40);

  return (
    <main className="mx-auto max-w-7xl px-5 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-muted-foreground">/ {snap?.family?.name ?? "…"} family ledger</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <ModeBadge integrations={snap?.integrations} />
          <Link href="/family" className="underline">Family chat</Link>
          <Link href="/mom" className="underline">Mom Mode</Link>
          <Link href="/demo" className="underline">Demo panel</Link>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={`${snap?.family?.parent_name ?? "Mom"}'s fund`} value={k ? `${k.fundPct}%` : "…"} sub={k ? `${dollars(k.collectedCents)} of ${dollars(k.targetCents)}` : ""} bar={k?.fundPct} />
        <Kpi label="Protected by holds" value={k ? dollars(k.protectedCents) : "…"} sub={k ? `${k.scamsStopped} risky purchase${k.scamsStopped === 1 ? "" : "s"} stopped · $0 moved` : ""} tone="coral" />
        <Kpi label="Spent safely" value={k ? dollars(k.spentCents) : "…"} sub="captured after checks" tone="sage" />
        <Kpi label="Bad Cop nudges" value={k ? String(k.nudgesSent) : "…"} sub={k ? `${k.held} purchase${k.held === 1 ? "" : "s"} waiting on family` : ""} />
      </section>

      <EvalStrip />

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div style={{ height: 520 }}>
          <AgGridReact<Row> theme={theme} rowData={rows} columnDefs={cols} tooltipShowDelay={200} animateRows rowHeight={44} />
        </div>
        <aside className="flex flex-col gap-4">
          <OutcomeChart purchases={snap?.purchases ?? []} />
          <div className="rounded-2xl border border-line bg-card">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Under the hood</h2>
          <ol className="max-h-[300px] space-y-1 overflow-y-auto p-3 text-xs">
            {feed.map((e: any) => (
              <li key={e.id} className="rounded-lg px-2 py-1.5 hover:bg-paper">
                <div className="flex justify-between gap-2">
                  <span className={`font-mono font-semibold ${e.type.includes("error") ? "text-coral" : e.source === "paypal" || e.source === "paypal_webhook" ? "text-sky" : e.source === "agent" ? "text-[#8a5a00]" : "text-ink"}`}>
                    {e.type}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
                <div className="truncate text-muted-foreground">{summarize(e)}</div>
              </li>
            ))}
          </ol>
          </div>
        </aside>
      </section>
    </main>
  );
}

function summarize(e: any) {
  const p = e.payload ?? {};
  if (e.type.startsWith("paypal.call") || e.type.startsWith("paypal.error")) return `${p.method} ${p.path} → ${p.status} (${p.ms}ms)`;
  if (e.type.startsWith("mistral")) return `${p.model ?? ""} ${p.purpose ?? ""} ${p.ms ? `(${p.ms}ms)` : ""}`;
  if (e.type.startsWith("agent.tool")) return `${p.speaker}: ${JSON.stringify(p.args)}`;
  if (e.type.startsWith("badcop")) return `${p.member} via ${p.channel}`;
  return JSON.stringify(p).slice(0, 90);
}

function Kpi({ label, value, sub, tone, bar }: { label: string; value: string; sub?: string; tone?: "sage" | "coral"; bar?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-display mt-1 text-3xl tabular ${tone === "sage" ? "text-sage" : tone === "coral" ? "text-coral" : ""}`}>{value}</div>
      {bar != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#efe9df]">
          <div className="h-full rounded-full bg-sage transition-all duration-700" style={{ width: `${bar}%` }} />
        </div>
      )}
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function EvalStrip() {
  const e = (evalResults as any).summary;
  if (!e) return null;
  const items = [
    [`${e.accuracy}/${e.cases}`, "decisions correct"],
    [`${e.scamsCaught}/${e.scams}`, "scams stopped"],
    [`${e.falseAlarms}/${e.legitAuto}`, "everyday buys wrongly held"],
    [`${e.injectionsCaught}/${e.injections}`, "hidden AI-agent instructions caught"],
  ];
  return (
    <section className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-card px-4 py-3 text-sm">
      <span className="font-semibold">Risk engine eval</span>
      {items.map(([v, l]) => (
        <span key={l}>
          <b className="font-display text-lg tabular">{v}</b> <span className="text-muted-foreground">{l}</span>
        </span>
      ))}
      <a href="https://github.com/priteshvirat24/holdon/blob/main/evals/SCORECARD.md" className="ml-auto text-xs text-muted-foreground underline">
        20 labelled shops · npm run eval
      </a>
    </section>
  );
}

/** Where Mom's purchases ended up, by dollars. */
function OutcomeChart({ purchases }: { purchases: any[] }) {
  const sum = (states: string[]) => purchases.filter((p) => states.includes(p.state)).reduce((a, p) => a + p.amount_cents / 100, 0);
  const data = [
    { label: "Paid after checks", value: sum(["CAPTURED"]), color: "#2f7d5b" },
    { label: "Waiting on family", value: sum(["HELD_FOR_FAMILY", "SCORING", "AUTHORIZED"]), color: "#e8a317" },
    { label: "Stopped, $0 moved", value: sum(["VOIDED", "DECLINED", "TIMED_OUT", "HARD_BLOCKED"]), color: "#d9534f" },
  ].filter((d) => d.value > 0);
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <h2 className="px-1 text-sm font-semibold">Mom&apos;s purchases by outcome</h2>
      {data.length === 0 ? (
        <p className="px-1 py-10 text-center text-sm text-muted-foreground">No purchases yet. Try Mom Mode.</p>
      ) : (
        <div style={{ height: 190 }}>
          <AgCharts
            options={{
              data,
              background: { visible: false },
              padding: { top: 6, bottom: 6, left: 6, right: 6 },
              series: [
                {
                  type: "donut",
                  angleKey: "value",
                  legendItemKey: "label",
                  innerRadiusRatio: 0.62,
                  fills: data.map((d) => d.color),
                  strokeWidth: 0,
                } as any,
              ],
              legend: { position: "right", item: { label: { fontSize: 11, color: "#6f655a" } } },
            }}
          />
        </div>
      )}
    </div>
  );
}
