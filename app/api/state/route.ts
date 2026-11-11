import { route } from "@/lib/api";
import { snapshot } from "@/lib/views";

export const dynamic = "force-dynamic";
export const GET = route(async () => snapshot());
