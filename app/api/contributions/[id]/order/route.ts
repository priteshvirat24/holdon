import { route } from "@/lib/api";
import { one } from "@/lib/db";
import { getMember } from "@/lib/family";
import { createShareOrder } from "@/lib/paypal";

export const POST = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const c = await one<any>(`SELECT * FROM contribution WHERE id=$1`, [(await params).id]);
  if (!c) throw new Error("Contribution not found");
  if (c.status !== "sent") throw new Error(`This share is already ${c.status}`);
  const m = await getMember(c.member_id);
  return createShareOrder({ contributionId: c.id, familyId: c.family_id, amountCents: c.amount_cents, description: `${m?.name}'s share for Mom's fund` });
});
