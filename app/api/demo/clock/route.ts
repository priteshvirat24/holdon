import { body, route } from "@/lib/api";
import { q } from "@/lib/db";
import { DEMO_FAMILY_ID } from "@/lib/family";
import { runTick } from "@/lib/tick";

/** Fast-forward the family's clock (demo only), then run the scheduled jobs so the ladder reacts. */
export const POST = route(async (req) => {
  const { days = 3 } = await body<{ days?: number }>(req);
  await q(`UPDATE family SET clock_offset_days = clock_offset_days + $2 WHERE id=$1`, [DEMO_FAMILY_ID, Math.max(-30, Math.min(30, days))]);
  return runTick(DEMO_FAMILY_ID);
});
