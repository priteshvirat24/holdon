import { route } from "@/lib/api";
import { resetAndSeed } from "@/lib/seed";

export const POST = route(async () => resetAndSeed());
