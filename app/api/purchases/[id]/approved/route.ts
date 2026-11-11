import { route } from "@/lib/api";
import { onBuyerApproved, publicPurchase } from "@/lib/flows/purchases";

export const maxDuration = 60;

/** Mom approved in the PayPal popup → place the authorization hold → risk check → capture / hold / void. */
export const POST = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  return publicPurchase(await onBuyerApproved((await params).id));
});
