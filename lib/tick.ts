import "server-only";
import { nudgeSweep } from "./flows/contributions";
import { expireHolds } from "./flows/purchases";
import { logEvent } from "./events";

/** The scheduled job: Bad Cop nudge ladder + releasing holds nobody decided on. */
export async function runTick(familyId: string) {
  const nudges = await nudgeSweep(familyId);
  const expired = await expireHolds(familyId);
  await logEvent({ familyId, type: "cron.tick", source: "cron", payload: { nudges, expired } });
  return { nudges, expired };
}
