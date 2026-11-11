import { route } from "@/lib/api";
import { DEMO_FAMILY_ID } from "@/lib/family";
import { runTick } from "@/lib/tick";

export const POST = route(async () => runTick(DEMO_FAMILY_ID));
