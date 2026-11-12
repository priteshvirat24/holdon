import Link from "next/link";
import { Logo } from "./ui";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="flex items-center justify-between">
        <Logo />
        <nav className="flex gap-4 text-sm">
          <Link href="/shop" className="underline">Shop</Link>
          <Link href="/demo" className="underline">Demo panel</Link>
          <Link href="/dashboard" className="underline">Ledger</Link>
        </nav>
      </header>

      <section className="mt-16 max-w-3xl">
        <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl">
          The family wallet that knows when to say <span className="text-marigold">&ldquo;hold on.&rdquo;</span>
        </h1>
        <p className="mt-6 text-xl leading-relaxed text-muted-foreground">
          Siblings chip in for Mom. Mom spends. HoldOn&apos;s AI collects the money so nobody has to nag, and puts every risky
          payment on a real <b className="text-ink">PayPal authorization hold</b> until family says yes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/stage" className="rounded-full bg-ink px-6 py-3 font-semibold text-white">See it in action →</Link>
          <Link href="/demo" className="rounded-full border border-line bg-card px-6 py-3 font-semibold">Run the demo yourself</Link>
        </div>
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {[
          ["📬", "Bad Cop", "PayPal invoices go out monthly. Late siblings get AI-written nudges on an escalating ladder, and the agent handles “pay half”, “next Friday” or “can you cover me?”."],
          ["✋", "Guardian", "Mom's purchase is authorized, not captured. HoldOn checks domain age, the real market price (Channel3) and the page itself, then captures, or asks family."],
          ["💸", "Settled", "When everyone's in, a PayPal Payout sends Mom her allowance. Every PayPal call, agent decision and webhook lands in the family ledger."],
        ].map(([icon, title, text]) => (
          <div key={title} className="rounded-3xl border border-line bg-card p-6">
            <div className="text-3xl">{icon}</div>
            <h2 className="font-display mt-3 text-2xl">{title}</h2>
            <p className="mt-2 text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>

      <footer className="mt-16 border-t border-line pt-6 text-sm text-muted-foreground">
        Built for the PayPal AI Hackathon · PayPal Orders, Payments, Invoicing, Payouts &amp; Webhooks (sandbox) · Mistral · Channel3 (product catalog and UI) · AG Grid &amp; AG Charts
      </footer>
    </main>
  );
}
