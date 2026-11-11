/**
 * The PayPal operations HoldOn uses. Each one has a real sandbox implementation
 * and a simulated one (used only when no sandbox keys are configured, and
 * labelled "SIMULATED" everywhere in the UI).
 */
import "server-only";
import { paypal, paypalMode } from "./client";
import { centsToValue, id } from "../util";

export { paypalMode };

const sim = () => paypalMode() === "simulated";
const fakeId = (p: string) => `SIM-${p}-${id("x").slice(2, 12).toUpperCase()}`;

// ---------------------------------------------------------------- Orders (AUTHORIZE)

export async function createAuthorizeOrder(p: {
  purchaseId: string;
  familyId: string;
  amountCents: number;
  description: string;
  merchantName: string;
}): Promise<{ orderId: string }> {
  if (sim()) return { orderId: fakeId("ORDER") };
  const order = await paypal<any>("POST", "/v2/checkout/orders", {
    familyId: p.familyId,
    requestId: `create-${p.purchaseId}`,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: p.purchaseId,
          custom_id: p.purchaseId,
          description: `${p.description} · ${p.merchantName}`.slice(0, 127),
          soft_descriptor: "HOLDON",
          amount: { currency_code: "USD", value: centsToValue(p.amountCents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "HoldOn",
            shipping_preference: "NO_SHIPPING",
            user_action: "CONTINUE",
          },
        },
      },
    },
  });
  return { orderId: order.id };
}

/** Called after the buyer approves in the PayPal popup. Places the hold. */
export async function authorizeOrder(p: { orderId: string; purchaseId: string; familyId: string }): Promise<{
  authorizationId: string;
  status: string;
  expiresAt: string | null;
}> {
  if (sim()) {
    return {
      authorizationId: fakeId("AUTH"),
      status: "CREATED",
      expiresAt: new Date(Date.now() + 29 * 86400_000).toISOString(),
    };
  }
  const r = await paypal<any>("POST", `/v2/checkout/orders/${p.orderId}/authorize`, {
    familyId: p.familyId,
    requestId: `authorize-${p.purchaseId}`,
    body: {},
  });
  const auth = r.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth?.id) throw new Error("PayPal authorize returned no authorization");
  return { authorizationId: auth.id, status: auth.status, expiresAt: auth.expiration_time ?? null };
}

export async function captureAuthorization(p: { authorizationId: string; purchaseId: string; familyId: string }) {
  if (sim()) return { captureId: fakeId("CAPTURE"), status: "COMPLETED" };
  const r = await paypal<any>("POST", `/v2/payments/authorizations/${p.authorizationId}/capture`, {
    familyId: p.familyId,
    requestId: `capture-${p.purchaseId}`,
    body: { final_capture: true, note_to_payer: "Approved by your family via HoldOn" },
  });
  return { captureId: r.id as string, status: r.status as string };
}

export async function voidAuthorization(p: { authorizationId: string; purchaseId: string; familyId: string }) {
  if (sim()) return { status: "VOIDED" };
  const r = await paypal<any>("POST", `/v2/payments/authorizations/${p.authorizationId}/void`, {
    familyId: p.familyId,
    requestId: `void-${p.purchaseId}`,
  });
  return { status: (r?.status as string) || "VOIDED" };
}

export async function getAuthorization(authorizationId: string) {
  if (sim()) return { status: "SIMULATED" };
  return paypal<any>("GET", `/v2/payments/authorizations/${authorizationId}`);
}

// ---------------------------------------------------------------- Invoicing v2

export async function createAndSendInvoice(p: {
  contributionId: string;
  familyId: string;
  recipientEmail: string;
  recipientName: string;
  amountCents: number;
  itemName: string;
  note: string;
  dueDate: string; // YYYY-MM-DD
}): Promise<{ invoiceId: string; payerUrl: string | null }> {
  if (sim()) return { invoiceId: fakeId("INV"), payerUrl: null };
  const draft = await paypal<any>("POST", "/v2/invoicing/invoices", {
    familyId: p.familyId,
    requestId: `inv-${p.contributionId}`,
    body: {
      detail: {
        currency_code: "USD",
        note: p.note.slice(0, 4000),
        memo: `HoldOn contribution ${p.contributionId}`,
        payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: p.dueDate },
      },
      invoicer: { business_name: "HoldOn Family Fund" },
      primary_recipients: [
        { billing_info: { name: { given_name: p.recipientName }, email_address: p.recipientEmail } },
      ],
      items: [
        {
          name: p.itemName.slice(0, 200),
          quantity: "1",
          unit_amount: { currency_code: "USD", value: centsToValue(p.amountCents) },
        },
      ],
      configuration: { allow_tip: false, tax_inclusive: false },
    },
  });
  const invoiceId: string = draft.id ?? String(draft.href ?? "").split("/").pop();
  await paypal("POST", `/v2/invoicing/invoices/${invoiceId}/send`, {
    familyId: p.familyId,
    requestId: `send-${p.contributionId}`,
    body: { send_to_invoicer: false, send_to_recipient: true, subject: p.itemName },
  });
  const full = await paypal<any>("GET", `/v2/invoicing/invoices/${invoiceId}`, { familyId: p.familyId });
  return { invoiceId, payerUrl: full?.detail?.metadata?.recipient_view_url ?? null };
}

export async function remindInvoice(p: { invoiceId: string; familyId: string; subject: string; note: string }) {
  if (sim()) return;
  await paypal("POST", `/v2/invoicing/invoices/${p.invoiceId}/remind`, {
    familyId: p.familyId,
    body: { subject: p.subject, note: p.note.slice(0, 4000), send_to_invoicer: false, send_to_recipient: true },
  });
}

export async function cancelInvoice(p: { invoiceId: string; familyId: string; note: string }) {
  if (sim()) return;
  await paypal("POST", `/v2/invoicing/invoices/${p.invoiceId}/cancel`, {
    familyId: p.familyId,
    body: { subject: "Replaced by a new HoldOn invoice", note: p.note, send_to_invoicer: false, send_to_recipient: true },
  });
}

export async function getInvoiceStatus(invoiceId: string, familyId: string): Promise<string> {
  if (sim()) return "UNKNOWN";
  const inv = await paypal<any>("GET", `/v2/invoicing/invoices/${invoiceId}`, { familyId });
  return inv.status as string; // DRAFT | SENT | PAID | MARKED_AS_PAID | CANCELLED ...
}

// ---------------------------------------------------------------- Payouts

export async function sendPayout(p: {
  payoutId: string;
  familyId: string;
  receiverEmail: string;
  amountCents: number;
  note: string;
}): Promise<{ batchId: string; status: string }> {
  if (sim()) return { batchId: fakeId("PAYOUT"), status: "SUCCESS" };
  const r = await paypal<any>("POST", "/v1/payments/payouts", {
    familyId: p.familyId,
    requestId: `payout-${p.payoutId}`,
    body: {
      sender_batch_header: {
        sender_batch_id: p.payoutId,
        email_subject: "Your family sent your monthly allowance 💛",
        email_message: p.note,
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: p.receiverEmail,
          amount: { value: centsToValue(p.amountCents), currency: "USD" },
          note: p.note.slice(0, 4000),
          sender_item_id: p.payoutId,
        },
      ],
    },
  });
  return { batchId: r.batch_header.payout_batch_id, status: r.batch_header.batch_status };
}

// ---------------------------------------------------------------- Webhooks

export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  if (sim()) return true;
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const r = await paypal<any>("POST", "/v1/notifications/verify-webhook-signature", {
    body: {
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    },
  });
  return r.verification_status === "SUCCESS";
}
