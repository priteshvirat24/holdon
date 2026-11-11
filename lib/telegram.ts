/**
 * Telegram bot (grammY). Optional: everything also works in-app at /family.
 *
 * Setup in a group:  /link   → binds the group to the Sharma family
 *                    /iam Priya → binds your Telegram user to a member
 * Then: approval cards arrive with buttons, and anyone can talk to HoldOn by
 * mentioning it or replying to it.
 */
import "server-only";
import { Bot, InlineKeyboard } from "grammy";
import { q, one } from "./db";
import { DEMO_FAMILY_ID } from "./family";
import type { Card } from "./chat";

const g = globalThis as unknown as { __holdonBot?: Bot };

export function telegramConfigured() {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export function getBot(): Bot {
  if (g.__holdonBot) return g.__holdonBot;
  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

  bot.command("link", async (ctx) => {
    await q(`UPDATE family SET telegram_chat_id=$2 WHERE id=$1`, [DEMO_FAMILY_ID, String(ctx.chat.id)]);
    await ctx.reply("🔗 This chat is now the Sharma family's HoldOn group. Each of you: send /iam YourName (e.g. /iam Priya).");
  });

  bot.command("iam", async (ctx) => {
    const name = (ctx.match || "").trim();
    const m = await one<any>(`SELECT * FROM member WHERE family_id=$1 AND lower(name)=lower($2)`, [DEMO_FAMILY_ID, name]);
    if (!m || !ctx.from) return ctx.reply("I don't know that name. Try /iam Priya, /iam Anil, /iam Raj or /iam Sunita.");
    await q(`UPDATE member SET telegram_user_id=$2 WHERE id=$1`, [m.id, String(ctx.from.id)]);
    await ctx.reply(`Hi ${m.name} 👋 I'll recognise you from now on. (For private messages, open a DM with me and press Start.)`);
  });

  bot.on("callback_query:data", async (ctx) => {
    const [refId, action] = ctx.callbackQuery.data.split("|");
    const member = await one<any>(`SELECT * FROM member WHERE family_id=$1 AND telegram_user_id=$2`, [DEMO_FAMILY_ID, String(ctx.from.id)]);
    if (!member) return ctx.answerCallbackQuery({ text: "Send /iam YourName first", show_alert: true });
    const { handleCardAction } = await import("./flows/cards");
    try {
      await handleCardAction(refId, action, member.id);
      await ctx.answerCallbackQuery({ text: "Done ✅" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    } catch (e: any) {
      await ctx.answerCallbackQuery({ text: e?.message?.slice(0, 180) || "Not allowed", show_alert: true });
    }
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const me = ctx.me.username;
    const isPrivate = ctx.chat.type === "private";
    const mentioned = me && ctx.message.text.includes(`@${me}`);
    const replyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
    if (!isPrivate && !mentioned && !replyToBot) return;
    const member = await one<any>(`SELECT * FROM member WHERE family_id=$1 AND telegram_user_id=$2`, [DEMO_FAMILY_ID, String(ctx.from.id)]);
    if (!member) return ctx.reply("Send /iam YourName first so I know who you are.");
    const { handleChat } = await import("./agent/steward");
    await handleChat({ familyId: DEMO_FAMILY_ID, memberId: member.id, text: ctx.message.text.replace(`@${me}`, "").trim() });
  });

  g.__holdonBot = bot;
  return bot;
}

export async function sendTelegram(chatId: string, text: string, card: Card | null) {
  if (!telegramConfigured()) return;
  const bot = getBot();
  if (!card) {
    await bot.api.sendMessage(chatId, text);
    return;
  }
  const kb = new InlineKeyboard();
  card.buttons.forEach((b) => kb.text(b.label, `${card.refId}|${b.action}`));
  const body = [text, "", `*${card.title}*`, ...card.lines].join("\n");
  await bot.api.sendMessage(chatId, body, { reply_markup: kb, parse_mode: "Markdown" }).catch(() =>
    bot.api.sendMessage(chatId, body.replace(/\*/g, ""), { reply_markup: kb }),
  );
}
