"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, dollars, ModeBadge, useSnapshot } from "../ui";

export default function FamilyChat({ initialMemberId, embed }: { initialMemberId: string; embed: boolean }) {
  const { snap, refresh } = useSnapshot(1500);
  const [me, setMe] = useState(initialMemberId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const members: any[] = snap?.members ?? [];
  const meRow = members.find((m) => m.id === me);
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const visible = (snap?.messages ?? []).filter((m: any) => m.audience === "group" || m.audience === me);
  const myOpen = (snap?.fund?.outstanding ?? []).filter((c: any) => c.member_id === me);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visible.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const t = text;
    setText("");
    setBusy("chat");
    setError(null);
    try {
      await api("/api/chat", { memberId: me, text: t });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function press(refId: string, action: string) {
    setBusy(refId + action);
    setError(null);
    try {
      await api("/api/cards", { refId, action, memberId: me });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const fund = snap?.fund;
  return (
    <main className={`mx-auto flex h-dvh max-w-xl flex-col ${embed ? "" : "sm:py-6"}`}>
      <div className="flex flex-1 flex-col overflow-hidden border-line bg-[#f4efe6] sm:rounded-3xl sm:border">
        <header className="border-b border-line bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-marigold text-lg">🏠</span>
              <div>
                <div className="font-semibold leading-tight">{snap?.family?.name ?? "…"} family</div>
                <div className="text-xs text-muted">{members.map((m) => m.name).join(", ")} · HoldOn</div>
              </div>
            </div>
            <ModeBadge integrations={snap?.integrations} />
          </div>
          {fund && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted">
                <span>{snap.family.parent_name}&apos;s fund this month</span>
                <span className="tabular">
                  {dollars(fund.collected)} / {dollars(fund.target)}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#efe9df]">
                <div className="h-full rounded-full bg-sage transition-all duration-700" style={{ width: `${fund.pct}%` }} />
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center gap-1 overflow-x-auto text-sm">
            <span className="mr-1 text-xs text-muted">Viewing as</span>
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => setMe(m.id)}
                className={`rounded-full px-3 py-1 ${me === m.id ? "bg-ink text-white" : "bg-paper text-ink"}`}
              >
                {m.name}
                {m.is_approver ? " ★" : ""}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
          {visible.map((m: any) => {
            const mine = m.author === me;
            const bot = m.author === "holdon";
            const author = bot ? "HoldOn" : byId[m.author]?.name ?? "?";
            return (
              <div key={m.id} className={`rise flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 shadow-sm ${mine ? "rounded-br-md bg-[#dcf3e4]" : "rounded-bl-md bg-card"} ${m.audience !== "group" ? "ring-2 ring-sky/30" : ""}`}
                >
                  {!mine && (
                    <div className={`mb-0.5 text-xs font-semibold ${bot ? "text-[#b07900]" : "text-sky"}`}>
                      {author}
                      {m.audience !== "group" && <span className="ml-1 font-normal text-muted">· private to you</span>}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-[15px] leading-snug">{m.text}</div>
                  {m.card && <CardView card={m.card} me={me} busy={busy} onPress={press} />}
                  <div className="mt-0.5 text-right text-[10px] text-muted">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })}
          {busy === "chat" && <div className="px-2 text-sm text-muted">HoldOn is typing…</div>}
          <div ref={bottom} />
        </div>

        {myOpen.length > 0 && meRow?.role === "sibling" && (
          <div className="border-t border-line bg-marigold-soft px-4 py-2 text-sm">
            {myOpen.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between gap-2 py-1">
                <span>
                  Your share{c.part > 1 ? ` (part ${c.part})` : ""}: <b className="tabular">{dollars(c.amount_cents)}</b>
                </span>
                <span className="flex gap-2">
                  {c.payer_url && (
                    <a href={c.payer_url} target="_blank" rel="noreferrer" className="rounded-full border border-ink/20 px-3 py-1">
                      PayPal invoice
                    </a>
                  )}
                  <Link href={`/pay/${c.id}`} target={embed ? "_blank" : undefined} className="rounded-full bg-ink px-3 py-1 font-semibold text-white">
                    Pay now
                  </Link>
                </span>
              </div>
            ))}
          </div>
        )}

        {error && <div className="bg-coral-soft px-4 py-2 text-sm text-coral">{error}</div>}

        <form onSubmit={send} className="flex gap-2 border-t border-line bg-card p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Message as ${meRow?.name ?? "…"} (e.g. "can I pay half now?")`}
            className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2 outline-none focus:border-marigold"
          />
          <button disabled={busy === "chat"} className="rounded-full bg-ink px-4 font-semibold text-white disabled:opacity-50">
            Send
          </button>
        </form>
      </div>
    </main>
  );
}

function CardView({ card, me, busy, onPress }: { card: any; me: string; busy: string | null; onPress: (refId: string, action: string) => void }) {
  const mineToPress = !card.forMemberId || card.forMemberId === me;
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-line bg-paper">
      <div className="px-3 pt-2.5 font-semibold">{card.title}</div>
      <ul className="space-y-0.5 px-3 py-1.5 text-sm text-ink/80">
        {card.lines.map((l: string, i: number) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {card.resolved ? (
        <div className="border-t border-line bg-[#efe9df] px-3 py-2 text-sm font-semibold">{card.resolved}</div>
      ) : (
        <div className="flex border-t border-line">
          {card.buttons.map((b: any) => (
            <button
              key={b.action}
              disabled={!mineToPress || !!busy}
              onClick={() => onPress(card.refId, b.action)}
              className="flex-1 border-r border-line px-3 py-2.5 text-sm font-semibold last:border-r-0 hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
              title={mineToPress ? "" : "Only the person this was sent to can answer"}
            >
              {busy === card.refId + b.action ? "…" : b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
