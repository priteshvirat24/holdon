import { body, route } from "@/lib/api";
import { handleCardAction } from "@/lib/flows/cards";

/** Card buttons pressed in the web family chat (Telegram presses go through the bot). */
export const POST = route(async (req) => {
  const { refId, action, memberId } = await body<{ refId: string; action: string; memberId: string }>(req);
  await handleCardAction(refId, action, memberId);
  return { ok: true };
});
