"use client";
import { useEffect, useRef, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { api, dollars, Logo, ModeBadge, useSnapshot } from "../ui";

type Option = {
  kind: "store" | "channel3";
  slug?: string;
  sku?: string;
  title: string;
  priceCents: number;
  merchant: string;
  domain: string;
  emoji?: string;
  blurb?: string;
  url?: string;
  image?: string | null;
  query?: string;
  productId?: string;
};

const SUGGESTIONS = ["My blood-pressure tablets", "That massage chair from Facebook", "A reading lamp", "A $100 gift card"];

function speak(text: string) {
  try {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[💛✅❌🛑⌛]/gu, ""));
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    /* voice is a nicety */
  }
}

export default function MomMode({ clientId, embed }: { clientId: string; embed: boolean }) {
  const { snap } = useSnapshot(2000);
  const [query, setQuery] = useState("");
  const [listening, setListening] = useState(false);
  const [searching, setSearching] = useState(false);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [chosen, setChosen] = useState<Option | null>(null);
  const [purchase, setPurchase] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const purchaseIdRef = useRef<string | null>(null);
  const spoken = useRef<string>("");
  const mom = snap?.members?.find((m: any) => m.role === "parent");
  const approver = snap?.members?.find((m: any) => m.is_approver);
  const sim = snap?.integrations?.paypal === "simulated";

  // Follow the purchase until it settles.
  useEffect(() => {
    if (!purchase?.id) return;
    const final = ["CAPTURED", "VOIDED", "FAILED"];
    if (final.includes(purchase.state)) return;
    const t = setInterval(async () => {
      try {
        setPurchase(await api(`/api/purchases/${purchase.id}`));
      } catch {
        /* keep polling */
      }
    }, 1000);
    return () => clearInterval(t);
  }, [purchase?.id, purchase?.state]);

  // Read the outcome aloud once.
  useEffect(() => {
    const msg = momLine(purchase, approver?.name);
    if (voiceOn && msg && spoken.current !== msg && purchase?.state !== "AWAITING_BUYER") {
      spoken.current = msg;
      speak(msg);
    }
  }, [purchase, voiceOn, approver?.name]);

  async function search(text = query) {
    if (!text.trim()) return;
    setQuery(text);
    setSearching(true);
    setError(null);
    setChosen(null);
    setPurchase(null);
    try {
      const r = await api<{ local: Option[]; market: any[] }>("/api/mom/search", { query: text });
      const market: Option[] = (r.market ?? [])
        .filter((p: any) => p.offers?.[0])
        .map((p: any) => ({
          kind: "channel3",
          title: p.title,
          priceCents: p.offers[0].priceCents,
          merchant: p.offers[0].domain,
          domain: p.offers[0].domain,
          url: p.offers[0].url,
          productId: p.id,
          image: p.image,
          query: p.query,
        }));
      setOptions([...r.local, ...market]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }

  const recRef = useRef<MediaRecorder | null>(null);

  /** Tap to talk, tap again (or wait 7s) to finish. Voice → Mistral Voxtral → search. */
  async function listen() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return browserListen();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, `voice.${(rec.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm"}`);
        setSearching(true);
        try {
          const res = await fetch("/api/mom/transcribe", { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok || !data.text) throw new Error(data.error || "I didn't catch that.");
          await search(data.text);
        } catch (e: any) {
          setError(e.message);
          setSearching(false);
        }
      };
      recRef.current = rec;
      rec.start();
      setListening(true);
      setTimeout(() => rec.state === "recording" && rec.stop(), 7000);
    } catch {
      browserListen();
    }
  }

  /** Fallback: the browser's own speech recognition. */
  function browserListen() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Voice isn't available here. Type instead, that works too.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e: any) => search(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  async function createOrder() {
    setError(null);
    const src =
      chosen!.kind === "store"
        ? { kind: "store", slug: chosen!.slug, sku: chosen!.sku }
        : { kind: "channel3", title: chosen!.title, url: chosen!.url, domain: chosen!.domain, priceCents: chosen!.priceCents, query: chosen!.query, productId: chosen!.productId };
    const r = await api<{ purchaseId: string; orderId: string }>("/api/purchases", { source: src });
    purchaseIdRef.current = r.purchaseId;
    setPurchase({ id: r.purchaseId, state: "AWAITING_BUYER", item: chosen!.title, amount_cents: chosen!.priceCents });
    return r.orderId;
  }

  async function onApproved() {
    const id = purchaseIdRef.current!;
    setPurchase((p: any) => ({ ...p, state: "SCORING" }));
    try {
      setPurchase(await api(`/api/purchases/${id}/approved`, {}));
    } catch (e: any) {
      setError(e.message);
      setPurchase(await api(`/api/purchases/${id}`).catch(() => null));
    }
  }

  const recent = (snap?.purchases ?? []).slice(0, 4);

  return (
    <main className={`mx-auto max-w-2xl px-5 ${embed ? "py-5" : "py-8"}`}>
      <header className="mb-6 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <ModeBadge integrations={snap?.integrations} />
          <button
            onClick={() => setVoiceOn((v) => !v)}
            className="rounded-full border border-line bg-card px-3 py-1 text-sm"
            aria-pressed={voiceOn}
          >
            {voiceOn ? "🔊 Voice on" : "🔇 Voice off"}
          </button>
        </div>
      </header>

      <h1 className="font-display text-4xl leading-tight sm:text-5xl">
        Hello {mom?.name ?? "there"} <span aria-hidden>👋</span>
      </h1>
      <p className="mt-2 text-xl text-muted-foreground">{listening ? "I'm listening… tap the button when you're done." : "What would you like today? Just say it."}</p>

      <div className="mt-6 flex items-stretch gap-3">
        <button
          onClick={listen}
          aria-label="Speak your request"
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-4xl text-white shadow-lg transition active:scale-95 ${listening ? "bg-coral breathe" : "bg-ink"}`}
        >
          {listening ? "■" : "🎙️"}
        </button>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. my blood-pressure tablets"
            className="min-w-0 flex-1 rounded-2xl border-2 border-line bg-card px-5 text-xl outline-none focus:border-marigold"
          />
          <button className="rounded-2xl bg-marigold px-6 text-xl font-semibold text-ink">{searching ? "…" : "Find"}</button>
        </form>
      </div>

      {!options && (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => search(s)} className="rounded-full border border-line bg-card px-4 py-2 text-base hover:border-marigold">
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-4 rounded-xl bg-coral-soft px-4 py-3 text-lg text-coral">{error}</p>}

      {options && !purchase && (
        <section className="mt-6 space-y-3">
          {options.length === 0 && <p className="text-lg text-muted-foreground">I couldn&apos;t find that. Try saying it another way?</p>}
          {options.map((o, i) => {
            const active = chosen === o;
            return (
              <div key={i} className={`rise rounded-3xl border-2 bg-card p-5 transition ${active ? "border-marigold" : "border-line"}`}>
                <button className="flex w-full items-center gap-4 text-left" onClick={() => setChosen(o)}>
                  {o.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.image} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-paper text-4xl">{o.emoji ?? "🛍️"}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xl font-semibold leading-snug">{o.title}</span>
                    <span className="block text-base text-muted-foreground">
                      {o.merchant}
                      {o.blurb ? ` · ${o.blurb}` : ""}
                    </span>
                  </span>
                  <span className="font-display text-2xl tabular">{dollars(o.priceCents)}</span>
                </button>
                {active && (
                  <div className="mt-4 border-t border-line pt-4">
                    {sim ? (
                      <button
                        onClick={async () => {
                          await createOrder();
                          await onApproved();
                        }}
                        className="w-full rounded-2xl bg-[#ffc439] py-4 text-xl font-bold text-[#003087]"
                      >
                        Pay with PayPal (simulated)
                      </button>
                    ) : clientId ? (
                      <PayPalScriptProvider options={{ clientId, intent: "authorize", currency: "USD", components: "buttons" }}>
                        <PayPalButtons
                          style={{ layout: "horizontal", height: 55, tagline: false, label: "pay", shape: "pill" }}
                          fundingSource="paypal"
                          createOrder={createOrder}
                          onApprove={onApproved}
                          onError={(e: any) => setError(String(e?.message ?? e))}
                          onCancel={() => setPurchase(null)}
                        />
                      </PayPalScriptProvider>
                    ) : null}
                    <p className="mt-2 text-center text-sm text-muted-foreground">HoldOn checks every purchase before any money moves.</p>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {purchase && <Status p={purchase} approverName={approver?.name} onDone={() => { setPurchase(null); setOptions(null); setQuery(""); setChosen(null); }} />}

      {!embed && recent.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recently</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
            {recent.map((p: any) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3 text-base">
                <span className="truncate">{p.item}</span>
                <span className="ml-3 shrink-0 text-muted-foreground">{momStateWord(p.state)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function momStateWord(s: string) {
  if (s === "CAPTURED") return "Ordered ✅";
  if (s === "HELD_FOR_FAMILY") return "Waiting for family";
  if (s === "VOIDED" || s === "DECLINED" || s === "TIMED_OUT") return "Skipped · not charged";
  if (s === "HARD_BLOCKED") return "Blocked · not charged";
  return "Checking…";
}

function momLine(p: any, approverName?: string) {
  if (!p) return "";
  switch (p.state) {
    case "AWAITING_BUYER":
      return "";
    case "AUTHORIZED":
    case "SCORING":
      return "One moment, I'm checking this for you.";
    case "HELD_FOR_FAMILY":
      return p.mom_message || `Hold on, let me check with ${approverName ?? "the family"} first. Nothing has been charged.`;
    case "CAPTURED":
      return p.mom_message || `All done! Your ${p.item} is ordered.`;
    default:
      return p.mom_message || "We're skipping this one. Your money is safe, nothing was charged.";
  }
}

function Status({ p, approverName, onDone }: { p: any; approverName?: string; onDone: () => void }) {
  const tone =
    p.state === "CAPTURED"
      ? { bg: "bg-sage-soft", fg: "text-sage", icon: "✅", title: "All done" }
      : p.state === "HELD_FOR_FAMILY"
        ? { bg: "bg-marigold-soft", fg: "text-[#8a5a00]", icon: "✋", title: "Hold on a moment" }
        : ["VOIDED", "DECLINED", "TIMED_OUT", "HARD_BLOCKED", "FAILED"].includes(p.state)
          ? { bg: "bg-[#efe9df]", fg: "text-ink", icon: "💛", title: "We skipped this one" }
          : { bg: "bg-sky-soft", fg: "text-sky", icon: "⏳", title: "Checking…" };
  const settled = ["CAPTURED", "VOIDED", "FAILED"].includes(p.state);
  return (
    <section className={`rise mt-6 rounded-3xl ${tone.bg} p-6`} aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden>
          {tone.icon}
        </span>
        <h2 className={`font-display text-3xl ${tone.fg}`}>{tone.title}</h2>
      </div>
      <p className="mt-3 text-2xl leading-snug">{momLine(p, approverName) || "Waiting for PayPal…"}</p>
      <p className="mt-3 text-lg text-muted-foreground">
        {p.item} · {dollars(p.amount_cents)}
      </p>
      {settled && (
        <button onClick={onDone} className="mt-5 rounded-2xl bg-ink px-6 py-3 text-lg font-semibold text-white">
          OK
        </button>
      )}
    </section>
  );
}
