import { body, route } from "@/lib/api";
import { DEMO_FAMILY_ID } from "@/lib/family";
import { handleChat } from "@/lib/agent/steward";

export const maxDuration = 60;

/** A family member writes in the web chat → the steward agent replies (and may act via tools). */
export const POST = route(async (req) => {
  const { memberId, text } = await body<{ memberId: string; text: string }>(req);
  if (!text?.trim()) throw new Error("Empty message");
  await handleChat({ familyId: DEMO_FAMILY_ID, memberId, text: text.slice(0, 1000) });
  return { ok: true };
});
