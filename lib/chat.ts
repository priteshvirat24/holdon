/**
 * The family chat. Every message is stored (and shown in-app at /family);
 * when Telegram is configured it is mirrored to the family's group or to a
 * member's DM, with inline buttons for cards.
 */
import "server-only";
import { q } from "./db";
import { id } from "./util";
import { getFamily, getMember } from "./family";

export interface Card {
  kind: "approval" | "cover";
  refId: string; // purchase id or contribution id
  title: string;
  lines: string[];
  buttons: { label: string; action: string }[]; // action e.g. "approve" | "decline" | "cover-yes" | "cover-no"
  forMemberId?: string; // only this member may press
  resolved?: string;
}

export async function post(p: { familyId: string; author?: string; audience?: string; text: string; card?: Card }) {
  const msg = {
    id: id("msg"),
    family_id: p.familyId,
    author: p.author ?? "holdon",
    audience: p.audience ?? "group",
    text: p.text,
    card: p.card ?? null,
  };
  await q(`INSERT INTO message (id, family_id, author, audience, text, card) VALUES ($1,$2,$3,$4,$5,$6)`, [
    msg.id,
    msg.family_id,
    msg.author,
    msg.audience,
    msg.text,
    msg.card ? JSON.stringify(msg.card) : null,
  ]);
  if (msg.author === "holdon") await mirrorToTelegram(msg).catch((e) => console.error("telegram mirror failed", e?.message));
  return msg;
}

export async function resolveCard(refId: string, resolved: string) {
  await q(
    `UPDATE message SET card = jsonb_set(card, '{resolved}', to_jsonb($2::text)) WHERE card IS NOT NULL AND card->>'refId' = $1`,
    [refId, resolved],
  );
}

async function mirrorToTelegram(msg: { family_id: string; audience: string; text: string; card: Card | null }) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const fam = await getFamily(msg.family_id);
  let chatId: string | null = null;
  if (msg.audience === "group") chatId = fam?.telegram_chat_id ?? null;
  else chatId = (await getMember(msg.audience))?.telegram_user_id ?? null;
  if (!chatId) return;
  const { sendTelegram } = await import("./telegram");
  await sendTelegram(chatId, msg.text, msg.card);
}
