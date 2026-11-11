/**
 * Run the HoldOn Telegram bot locally with long polling (no public URL needed):
 *   npm run telegram
 * Use it alongside `npm run dev`; both share the same database (.data/pglite or DATABASE_URL).
 * In the family group: /link, then each person sends /iam Priya (etc.).
 * Mention the bot (@yourbot can I pay half?) or reply to it to talk to the agent.
 */
import { getBot, telegramConfigured } from "../lib/telegram";

async function main() {
  if (!telegramConfigured()) {
    console.error("TELEGRAM_BOT_TOKEN is not set in .env.local (create a bot with @BotFather → /newbot).");
    process.exit(1);
  }
  const bot = getBot();
  await bot.api.deleteWebhook(); // polling and webhooks can't both be active
  const me = await bot.api.getMe();
  console.log(`HoldOn bot @${me.username} is polling. Add it to your family group and send /link.`);
  console.log("Tip: in BotFather, /setprivacy → Disable, so the bot sees replies in the group.");
  await bot.start({ drop_pending_updates: true });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
