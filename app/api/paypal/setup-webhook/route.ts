import { body, route } from "@/lib/api";
import { ensureWebhook } from "@/lib/paypal";

/**
 * One-time: register the PayPal webhook for this app's public URL. Put the returned id in PAYPAL_WEBHOOK_ID.
 * When deployed (CRON_SECRET set), it needs ?secret=CRON_SECRET and only ever registers APP_URL,
 * so nobody else can point the app's webhooks at their own server.
 */
export const POST = route(async (req) => {
  const deployedSecret = process.env.CRON_SECRET;
  if (deployedSecret && new URL(req.url).searchParams.get("secret") !== deployedSecret) {
    return new Response("forbidden", { status: 403 });
  }
  const { publicUrl } = await body<{ publicUrl?: string }>(req).catch(() => ({ publicUrl: undefined }));
  const url = deployedSecret ? process.env.APP_URL : publicUrl || process.env.APP_URL;
  if (!url?.startsWith("https://")) throw new Error("Needs a public https URL (Render URL or tunnel)");
  return { webhookId: await ensureWebhook(url) };
});
