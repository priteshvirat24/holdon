import { notFound } from "next/navigation";
import { findStore, STORES } from "@/lib/stores";

export function generateStaticParams() {
  return STORES.map((s) => ({ slug: s.slug }));
}

/** Fictional demo storefronts (".demo" domains). The scam store hides text aimed at AI agents in its markup. */
export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const store = findStore((await params).slug);
  if (!store) notFound();
  const { bg, fg, accent } = store.theme;
  return (
    <main style={{ background: bg, color: fg }} className="min-h-dvh">
      <div style={{ background: accent }} className="px-4 py-2 text-center text-sm font-bold text-white">
        {store.urgency?.join("   ·   ") ?? store.tagline}
      </div>
      <div className="mx-auto max-w-4xl px-5 py-10">
        <p className="text-xs opacity-60">{store.domain} · fictional demo store</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight">{store.name}</h1>
        <p className="mt-1 text-lg opacity-80">{store.tagline}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {store.products.map((p) => (
            <div key={p.sku} className="rounded-2xl bg-white/80 p-5 shadow-sm">
              <div className="text-5xl">{p.emoji}</div>
              <h2 className="mt-3 text-xl font-bold">{p.name}</h2>
              <p className="opacity-75">{p.blurb}</p>
              <p className="mt-2 text-3xl font-black" style={{ color: accent }}>
                ${(p.priceCents / 100).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
        {store.hiddenNote && (
          // Invisible to people, visible to any AI agent that reads the page. HoldOn flags it instead of obeying it.
          <div aria-hidden style={{ display: "none" }} data-for="ai-agents">
            {store.hiddenNote}
          </div>
        )}
        <footer className="mt-12 border-t border-current/20 pt-4 text-sm opacity-70">{store.footer}</footer>
      </div>
    </main>
  );
}
