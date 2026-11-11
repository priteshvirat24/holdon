import { body, route } from "@/lib/api";
import { DEMO_FAMILY_ID } from "@/lib/family";
import { startPurchase, type PurchaseSource } from "@/lib/flows/purchases";

/** Create the PayPal AUTHORIZE order for Mom's purchase. Returns the order id for the PayPal button. */
export const POST = route(async (req) => {
  const { source } = await body<{ source: PurchaseSource }>(req);
  const p = await startPurchase(DEMO_FAMILY_ID, source);
  return { purchaseId: p.id, orderId: p.order_id };
});
