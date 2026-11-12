"use client";
import { useState } from "react";
import Link from "next/link";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { api, dollars, Logo } from "../../ui";

export default function PayShare({
  clientId,
  simulated,
  contribution: c,
  memberName,
}: {
  clientId: string;
  simulated: boolean;
  contribution: { id: string; amount_cents: number; status: string; part: number; invoice_id: string | null; payer_url: string | null } | null;
  memberName: string;
}) {
  const [done, setDone] = useState(c?.status === "paid");
  const [error, setError] = useState<string | null>(null);

  if (!c) return <main className="p-10 text-center">This share link isn&apos;t valid.</main>;

  async function capture(orderId: string) {
    await api(`/api/contributions/${c!.id}/capture`, { orderId });
    setDone(true);
  }

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <Logo />
      <div className="mt-8 rounded-3xl border border-line bg-card p-6">
        <p className="text-muted-foreground">Hi {memberName} 👋</p>
        <h1 className="font-display mt-1 text-3xl">Mom&apos;s fund · your share{c.part > 1 ? ` (part ${c.part})` : ""}</h1>
        <p className="font-display mt-4 text-5xl tabular">{dollars(c.amount_cents)}</p>
        {c.invoice_id && <p className="mt-2 text-xs text-muted-foreground">PayPal invoice {c.invoice_id}</p>}

        {done ? (
          <div className="rise mt-6 rounded-2xl bg-sage-soft p-4 text-sage">
            <b>Paid. Thank you 💛</b> HoldOn has told the family, and the PayPal invoice is marked paid.
          </div>
        ) : c.status !== "sent" ? (
          <p className="mt-6 text-muted-foreground">This share is {c.status}.</p>
        ) : (
          <div className="mt-6">
            {simulated ? (
              <button
                onClick={() => capture("SIM-ORDER").catch((e) => setError(e.message))}
                className="w-full rounded-2xl bg-[#ffc439] py-3.5 text-lg font-bold text-[#003087]"
              >
                Pay with PayPal (simulated)
              </button>
            ) : (
              <PayPalScriptProvider options={{ clientId, intent: "capture", currency: "USD", components: "buttons" }}>
                <PayPalButtons
                  style={{ layout: "vertical", shape: "pill", label: "pay" }}
                  fundingSource="paypal"
                  createOrder={async () => (await api<{ orderId: string }>(`/api/contributions/${c.id}/order`, {})).orderId}
                  onApprove={async (data) => {
                    try {
                      await capture(data.orderID);
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                  onError={(e: any) => setError(String(e?.message ?? e))}
                />
              </PayPalScriptProvider>
            )}
            {c.payer_url && (
              <a href={c.payer_url} target="_blank" rel="noreferrer" className="mt-3 block text-center text-sm text-sky underline">
                Or pay the PayPal invoice directly
              </a>
            )}
          </div>
        )}
        {error && <p className="mt-4 rounded-xl bg-coral-soft px-3 py-2 text-sm text-coral">{error}</p>}
      </div>
      <Link href="/family" className="mt-6 block text-center text-sm text-muted-foreground underline">
        Back to the family chat
      </Link>
    </main>
  );
}
