import { body, route } from "@/lib/api";
import { ensureWebhook } from "@/lib/paypal";

/** One-time: register the webhook for a public URL (Render or a tunnel). Put the returned id in PAYPAL_WEBHOOK_ID. */
export const POST = route(async (req) => {
  const { publicUrl } = await body<{ publicUrl?: string }>(req);
  const url = publicUrl || process.env.APP_URL;
  if (!url?.startsWith("https://")) throw new Error("Needs a public https URL (Render URL or tunnel)");
  return { webhookId: await ensureWebhook(url) };
});
