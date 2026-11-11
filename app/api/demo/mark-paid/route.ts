import { body, route } from "@/lib/api";
import { one } from "@/lib/db";
import { recordInvoicePayment } from "@/lib/paypal";
import { markPaid } from "@/lib/flows/contributions";

/**
 * Demo helper: a sibling paid outside the app (bank transfer). Records the payment
 * on the real PayPal invoice (Invoicing API), then runs the normal "paid" flow
 * (celebration, and the allowance Payout once the fund is full).
 */
export const POST = route(async (req) => {
  const { contributionId } = await body<{ contributionId: string }>(req);
  const c = await one<any>(`SELECT * FROM contribution WHERE id=$1`, [contributionId]);
  if (!c || c.status !== "sent") throw new Error("No open share with that id");
  if (c.invoice_id) await recordInvoicePayment({ invoiceId: c.invoice_id, familyId: c.family_id, amountCents: c.amount_cents, orderId: "-", method: "BANK_TRANSFER" });
  return markPaid(c.id, "recorded_bank_transfer");
});
