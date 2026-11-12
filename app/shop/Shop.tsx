"use client";
/**
 * HoldOn Shop: real products from Channel3 (text or photo search, filters, product pages with
 * variants, other stores, price history and similar items). Buying goes through HoldOn:
 * PayPal authorization hold → safety check → capture, or ask the family.
 * Store links are Channel3's commission-earning links.
 */
import * as React from "react";
import Link from "next/link";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { Product, ProductOffer } from "@channel3/sdk/resources";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { ArrowLeft, ShieldCheck, TriangleAlert } from "lucide-react";
import { ProductSearch } from "@/components/product-search";
import {
  ProductDetailsAttributes,
  ProductDetailsDescription,
  ProductDetailsGallery,
  ProductDetailsHeader,
  ProductDetailsOffers,
  ProductDetailsPriceHistory,
  ProductDetailsRecommendations,
  ProductDetailsRoot,
  ProductDetailsVariants,
} from "@/components/product-details";
import { Skeleton } from "@/components/ui/skeleton";
import { useVariantSelection } from "@/hooks/use-variant-selection";
import { formatDomain, isInStock } from "@/lib/format";
import { api, dollars, Logo, Pill } from "../ui";
import * as actions from "./actions";

const SUGGESTIONS = ["shiatsu massage chair", "blood pressure monitor", "reading glasses", "orthopedic slippers"];

export default function Shop({ clientId, simulated, channel3 }: { clientId: string; simulated: boolean; channel3: boolean }) {
  const [qc] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={qc}>
      <ShopInner clientId={clientId} simulated={simulated} channel3={channel3} />
    </QueryClientProvider>
  );
}

function ShopInner({ clientId, simulated, channel3 }: { clientId: string; simulated: boolean; channel3: boolean }) {
  const [open, setOpen] = React.useState<Product | null>(null);
  const [seed, setSeed] = React.useState<{ q: string; n: number }>({ q: "", n: 0 });
  const pushed = React.useRef(0);

  // Browser back closes the product page and returns to the grid (which stays mounted, so results and scroll survive).
  React.useEffect(() => {
    const onPop = () => {
      if (!new URL(window.location.href).searchParams.get("p")) setOpen(null);
      pushed.current = Math.max(0, pushed.current - 1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A shared or refreshed /shop?p=<id> link opens that product directly.
  React.useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("p");
    if (!id || !channel3) return;
    actions
      .getProduct(id)
      .then((p) => setOpen(p))
      .catch(() => window.history.replaceState(null, "", "/shop"));
  }, [channel3]);

  const show = React.useCallback((p: Product) => {
    window.history.pushState(null, "", `/shop?p=${encodeURIComponent(p.id)}`);
    pushed.current += 1;
    setOpen(p);
    window.scrollTo({ top: 0 });
  }, []);

  const back = React.useCallback(() => {
    if (pushed.current > 0) window.history.back();
    else {
      window.history.replaceState(null, "", "/shop");
      setOpen(null);
    }
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="flex items-baseline gap-3">
          <Link href="/">
            <Logo />
          </Link>
          <span className="font-display text-2xl text-muted-foreground">Shop</span>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/mom" className="underline">Mom Mode</Link>
          <Link href="/family" className="underline">Family chat</Link>
          <Link href="/dashboard" className="underline">Ledger</Link>
        </nav>
      </header>

      {!channel3 ? (
        <div className="rounded-2xl border border-line bg-card p-6">
          <p className="font-semibold">Channel3 isn&apos;t set up.</p>
          <p className="mt-1 text-muted-foreground">
            Add <code>CHANNEL3_API_KEY</code> to <code>.env.local</code> (free key at trychannel3.com) and restart.
          </p>
        </div>
      ) : (
        <>
          <div className={open ? "hidden" : "block"}>
            <section className="mb-5 rounded-3xl border border-line bg-card p-5 sm:p-6">
              <h1 className="font-display text-3xl leading-tight sm:text-4xl">Shop real stores. HoldOn checks before money moves.</h1>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                Search millions of products from thousands of stores, or search with a photo. When you buy, PayPal only
                <b className="text-ink"> holds</b> the money. HoldOn checks the store and the price, then pays or asks the family first.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSeed((x) => ({ q: s, n: x.n + 1 }))}
                    className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm hover:border-marigold"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>
            <ProductSearch
              key={seed.n}
              initialQuery={seed.q}
              searchOnMount={!!seed.q}
              fetchSearch={actions.searchProducts}
              searchBrands={actions.searchBrands}
              searchWebsites={actions.searchWebsites}
              searchCategories={actions.searchCategories}
              getCategory={actions.getCategory}
              filtersLayout="bar"
              imageSearch
              showSwatches
              placeholder="Search for anything, or add a photo"
              locale="en-US"
              onSelect={show}
            />
          </div>
          {open ? (
            <ProductPage key={open.id} initial={open} onBack={back} onOpen={show} clientId={clientId} simulated={simulated} />
          ) : null}
        </>
      )}
    </main>
  );
}

// ------------------------------------------------------------------ product page

function ProductPage(props: {
  initial: Product;
  onBack: () => void;
  onOpen: (p: Product) => void;
  clientId: string;
  simulated: boolean;
}) {
  // Search results don't carry hydrated variants or the freshest offers; product details are free to re-fetch.
  const fresh = useQuery({ queryKey: ["c3-product", props.initial.id], queryFn: () => actions.getProduct(props.initial.id) });
  return (
    <div className="rise">
      <button onClick={props.onBack} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Back to results
      </button>
      <ProductBody key={fresh.data ? "fresh" : "initial"} {...props} product={fresh.data ?? props.initial} loading={fresh.isLoading} />
    </div>
  );
}

function ProductBody({
  product: start,
  loading,
  onOpen,
  clientId,
  simulated,
}: {
  product: Product;
  loading: boolean;
  onOpen: (p: Product) => void;
  clientId: string;
  simulated: boolean;
}) {
  const { product, selection, select, isResolving } = useVariantSelection({
    product: start,
    resolve: ({ product: p, value, selection: sel }) =>
      actions.getProduct(value.product_id ?? p.id, value.product_id ? undefined : sel),
  });
  const history = useQuery({ queryKey: ["c3-history", product.id], queryFn: () => actions.getPriceHistory(product.id) });

  return (
    <ProductDetailsRoot
      product={product}
      selection={selection}
      onSelectVariant={loading ? undefined : select}
      isResolving={isResolving || loading}
      priceHistory={history.data ?? undefined}
      buyLinkRel="sponsored noopener noreferrer"
      locale="en-US"
      fetchSimilar={actions.similarProducts}
      recommendations={{ title: "Similar products", onSelect: onOpen, limit: 12, showSwatches: true }}
      className="flex flex-col gap-12"
    >
      <div className="grid gap-8 md:grid-cols-2 md:items-start lg:gap-12">
        <ProductDetailsGallery className="self-start md:sticky md:top-4" />
        <div className="flex flex-col gap-6">
          <ProductDetailsHeader />
          <ProductDetailsVariants />
          <GuardedBuy product={product} selection={selection} clientId={clientId} simulated={simulated} busy={isResolving || loading} />
          <div className="flex flex-col gap-2">
            <ProductDetailsOffers />
            <p className="text-xs text-muted-foreground">
              Store links are Channel3 partner links: a purchase through them can earn HoldOn a commission, which keeps HoldOn
              free for families. They go straight to the store, without HoldOn&apos;s check.
            </p>
          </div>
          <ProductDetailsDescription />
          <ProductDetailsAttributes />
          <ProductDetailsPriceHistory />
        </div>
      </div>
      <ProductDetailsRecommendations />
    </ProductDetailsRoot>
  );
}

// ------------------------------------------------------------------ HoldOn guarded buy

const usd = (o: ProductOffer) => o.price.currency === "USD";

function GuardedBuy({
  product,
  selection,
  clientId,
  simulated,
  busy,
}: {
  product: Product;
  selection: Record<string, string>;
  clientId: string;
  simulated: boolean;
  busy: boolean;
}) {
  const offers = React.useMemo(
    () => (product.offers ?? []).filter((o) => isInStock(o.availability) && usd(o)).sort((a, b) => a.price.price - b.price.price),
    [product.offers],
  );
  const [domain, setDomain] = React.useState<string | null>(null);
  const chosen = offers.find((o) => o.domain === domain) ?? offers[0];
  const [purchase, setPurchase] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const purchaseId = React.useRef<string | null>(null);

  const check = useQuery({
    queryKey: ["holdon-precheck", product.id, chosen?.domain],
    queryFn: () => actions.precheck(product.id, chosen!.domain),
    enabled: !!chosen && !busy,
  });

  // Follow the purchase until it settles.
  React.useEffect(() => {
    if (!purchase?.id || ["CAPTURED", "VOIDED", "FAILED"].includes(purchase.state)) return;
    const t = setInterval(async () => {
      try {
        setPurchase(await api(`/api/purchases/${purchase.id}`));
      } catch {
        /* keep polling */
      }
    }, 1200);
    return () => clearInterval(t);
  }, [purchase?.id, purchase?.state]);

  if (!chosen) {
    return (
      <div className="rounded-2xl border border-line bg-card p-4 text-sm text-muted-foreground">
        No store has this in stock in US dollars right now, so HoldOn can&apos;t buy it.
      </div>
    );
  }

  async function createOrder() {
    setError(null);
    const r = await api<{ purchaseId: string; orderId: string }>("/api/purchases", {
      source: {
        kind: "channel3",
        productId: product.id,
        selection,
        domain: chosen!.domain,
        title: product.title,
        url: chosen!.url,
        priceCents: Math.round(chosen!.price.price * 100),
        query: product.title,
      },
    });
    purchaseId.current = r.purchaseId;
    setPurchase({ id: r.purchaseId, state: "AWAITING_BUYER", item: product.title, amount_cents: Math.round(chosen!.price.price * 100) });
    return r.orderId;
  }

  async function onApproved() {
    const id = purchaseId.current!;
    setPurchase((p: any) => ({ ...p, state: "SCORING" }));
    try {
      setPurchase(await api(`/api/purchases/${id}/approved`, {}));
    } catch (e: any) {
      setError(e.message);
      setPurchase(await api(`/api/purchases/${id}`).catch(() => null));
    }
  }

  const c = check.data;
  const settled = purchase && purchase.state !== "AWAITING_BUYER";

  return (
    <section className="rounded-2xl border-2 border-marigold/60 bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl">Buy safely with HoldOn</h2>
        <span className="font-display text-2xl tabular">{dollars(Math.round(chosen.price.price * 100))}</span>
      </div>

      {offers.length > 1 ? (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">From</span>
          <select
            value={chosen.domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setPurchase(null);
            }}
            disabled={!!purchase}
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1.5"
          >
            {offers.map((o) => (
              <option key={o.domain} value={o.domain}>
                {formatDomain(o.domain)} · {dollars(Math.round(o.price.price * 100))}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">From {formatDomain(chosen.domain)}</p>
      )}

      <div className={`mt-3 rounded-xl p-3 text-sm ${c?.tone === "careful" ? "bg-coral-soft" : "bg-sage-soft"}`}>
        {check.isLoading || !c ? (
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <>
            <p className={`flex items-center gap-1.5 font-semibold ${c.tone === "careful" ? "text-coral" : "text-sage"}`}>
              {c.tone === "careful" ? <TriangleAlert className="size-4" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
              {c.tone === "careful" ? "Worth a closer look" : "Looks normal so far"}
            </p>
            <ul className="mt-1 space-y-0.5 text-ink">
              {c.notes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {!settled ? (
        <div className="mt-4">
          {simulated ? (
            <button
              onClick={async () => {
                try {
                  await createOrder();
                  await onApproved();
                } catch (e: any) {
                  setError(e.message);
                }
              }}
              className="w-full rounded-full bg-[#ffc439] py-3 text-lg font-bold text-[#003087]"
            >
              Pay with PayPal (simulated)
            </button>
          ) : clientId ? (
            <PayPalScriptProvider options={{ clientId, intent: "authorize", currency: "USD", components: "buttons" }}>
              <PayPalButtons
                style={{ layout: "horizontal", height: 48, tagline: false, label: "pay", shape: "pill" }}
                fundingSource="paypal"
                disabled={busy}
                forceReRender={[chosen.domain, product.id]}
                createOrder={createOrder}
                onApprove={onApproved}
                onError={(e: any) => setError(String(e?.message ?? e))}
                onCancel={() => setPurchase(null)}
              />
            </PayPalScriptProvider>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            PayPal places a hold, nothing is charged yet. HoldOn&apos;s AI checks the store and price, then captures the payment
            or asks the family. If nobody says yes, the hold is released and $0 moves. (Sandbox demo: the hold is placed
            with HoldOn&apos;s test merchant, not the real store.)
          </p>
        </div>
      ) : (
        <Outcome p={purchase} />
      )}
      {error ? <p className="mt-2 text-sm text-coral">{error}</p> : null}
    </section>
  );
}

function Outcome({ p }: { p: any }) {
  const final = ["CAPTURED", "VOIDED", "FAILED"].includes(p.state);
  return (
    <div className="mt-4 rounded-xl border border-line bg-paper p-3">
      <div className="flex items-center gap-2">
        <Pill state={p.state} label={p.state_label} />
        {!final ? <span className="text-xs text-muted-foreground">checking…</span> : null}
      </div>
      <p className="mt-2">{p.mom_message || (p.state === "SCORING" ? "HoldOn is checking the store and the price…" : "")}</p>
      {p.state === "HELD_FOR_FAMILY" ? (
        <p className="mt-2 text-sm">
          The family has been asked.{" "}
          <Link href="/family" className="font-semibold underline">
            Open the family chat
          </Link>
        </p>
      ) : null}
      {typeof p.risk_score === "number" ? (
        <p className="mt-1 text-xs text-muted-foreground">Risk score {p.risk_score}/100 · details in the ledger</p>
      ) : null}
    </div>
  );
}
