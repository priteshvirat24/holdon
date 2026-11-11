import { route } from "@/lib/api";
import { DEMO_FAMILY_ID } from "@/lib/family";
import { startCycle } from "@/lib/flows/contributions";

export const POST = route(async () => ({ issued: await startCycle(DEMO_FAMILY_ID) }));
