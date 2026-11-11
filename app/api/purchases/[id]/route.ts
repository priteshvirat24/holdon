import { route } from "@/lib/api";
import { getPurchase, publicPurchase } from "@/lib/flows/purchases";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const p = await getPurchase((await params).id);
  if (!p) throw new Error("Not found");
  return publicPurchase(p);
});
