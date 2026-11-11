/**
 * Point the Telegram bot at a deployed HoldOn (Render):
 *   npx tsx --env-file=.env.local scripts/telegram-webhook.ts https://your-app.onrender.com
 */
const url = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!url?.startsWith("https://") || !token) {
  console.error("Usage: telegram-webhook.ts https://your-app (TELEGRAM_BOT_TOKEN must be set)");
  process.exit(1);
}
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: `${url.replace(/\/$/, "")}/api/telegram`, drop_pending_updates: true }),
});
console.log(await res.json());

export {};
