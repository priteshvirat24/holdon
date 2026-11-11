import { webhookCallback } from "grammy";
import { getBot, telegramConfigured } from "@/lib/telegram";

export async function POST(req: Request) {
  if (!telegramConfigured()) return new Response("telegram not configured", { status: 404 });
  return webhookCallback(getBot(), "std/http")(req);
}
