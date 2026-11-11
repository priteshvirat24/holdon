import { route } from "@/lib/api";
import { DEMO_FAMILY_ID } from "@/lib/family";
import { autoReorder } from "@/lib/flows/reorder";
import { publicPurchase } from "@/lib/flows/purchases";

export const maxDuration = 60;

/** The agent's monthly medicine refill (also triggered by the cron on refill day). */
export const POST = route(async () => publicPurchase(await autoReorder(DEMO_FAMILY_ID)));
