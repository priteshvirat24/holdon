import { one } from "@/lib/db";
import { getMember } from "@/lib/family";
import { paypalMode } from "@/lib/paypal";
import PayShare from "./PayShare";

export const dynamic = "force-dynamic";
export const metadata = { title: "HoldOn · Pay your share" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await one<any>(`SELECT * FROM contribution WHERE id=$1`, [id]);
  const m = c ? await getMember(c.member_id) : null;
  return (
    <PayShare
      clientId={process.env.PAYPAL_CLIENT_ID ?? ""}
      simulated={paypalMode() === "simulated"}
      contribution={c ? { id: c.id, amount_cents: c.amount_cents, status: c.status, part: c.part, invoice_id: c.invoice_id, payer_url: c.payer_url } : null}
      memberName={m?.name ?? ""}
    />
  );
}
