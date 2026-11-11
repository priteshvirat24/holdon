import { body, route } from "@/lib/api";
import { one } from "@/lib/db";
import { captureShareOrder, recordInvoicePayment } from "@/lib/paypal";
import { markPaid } from "@/lib/flows/contributions";

/** Sibling approved in the PayPal popup → capture → record on the PayPal invoice → Bad Cop celebrates. */
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { orderId } = await body<{ orderId: string }>(req);
  const c = await one<any>(`SELECT * FROM contribution WHERE id=$1`, [(await params).id]);
  if (!c) throw new Error("Contribution not found");
  const cap = await captureShareOrder({ orderId, contributionId: c.id, familyId: c.family_id });
  if (cap.status !== "COMPLETED") throw new Error(`PayPal capture status ${cap.status}`);
  if (c.invoice_id) await recordInvoicePayment({ invoiceId: c.invoice_id, familyId: c.family_id, amountCents: c.amount_cents, orderId }).catch((e) => console.error("record invoice payment failed", e?.message));
  await markPaid(c.id, "pay_page");
  return { ok: true, captureId: cap.captureId };
});
