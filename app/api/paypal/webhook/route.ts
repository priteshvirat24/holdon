import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/paypal";
import { logEvent } from "@/lib/events";
import { onInvoicePaid } from "@/lib/flows/contributions";
import { one } from "@/lib/db";

/** PayPal → HoldOn. Signature-verified; the audit log records every event. */
export async function POST(req: Request) {
  const raw = await req.text();
  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const ok = await verifyWebhook(req.headers, event).catch(() => false);
  if (!ok) {
    await logEvent({ familyId: null, type: "paypal.webhook.rejected", source: "paypal_webhook", payload: { id: event?.id, type: event?.event_type } });
    return NextResponse.json({ error: "signature" }, { status: 401 });
  }
  const r = event.resource ?? {};
  const ref = r.custom_id ?? r.purchase_units?.[0]?.custom_id ?? r.supplementary_data?.related_ids?.order_id ?? null;
  const fam = ref ? await one<any>(`SELECT family_id FROM purchase WHERE id=$1 UNION SELECT family_id FROM contribution WHERE id=$1`, [ref]) : null;
  await logEvent({ familyId: fam?.family_id ?? "fam_sharma", type: `paypal.webhook.${event.event_type}`, source: "paypal_webhook", payload: { id: event.id, resource: r.id, ref } });

  if (event.event_type === "INVOICING.INVOICE.PAID") {
    await onInvoicePaid(r.invoice?.id ?? r.id);
  }
  return NextResponse.json({ ok: true });
}
