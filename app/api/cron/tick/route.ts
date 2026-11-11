import { route } from "@/lib/api";
import { q } from "@/lib/db";
import { runTick } from "@/lib/tick";

export const dynamic = "force-dynamic";

/** Called by the Render cron job: GET /api/cron/tick?secret=CRON_SECRET */
export const GET = route(async (req) => {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) return new Response("forbidden", { status: 403 });
  const fams = await q<{ id: string }>(`SELECT id FROM family`);
  const out: Record<string, unknown> = {};
  for (const f of fams) out[f.id] = await runTick(f.id);
  return out;
});
