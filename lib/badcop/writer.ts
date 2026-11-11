/**
 * Bad Cop's voice. Ministral 14B (fallback 8B) writes each nudge from context.
 * Falls back to hand-written templates if no Mistral key is configured.
 */
import "server-only";
import { chatJson, MODELS, mistralConfigured } from "../mistral/client";
import type { LadderStep } from "./ladder";

export interface NudgeContext {
  familyId: string;
  siblingName: string;
  parentName: string;
  approverName: string;
  amount: string;
  monthLabel: string;
  daysLate: number;
  fundPct: number;
  paidNames: string[];
  nextNeed: string; // e.g. "Mom's pharmacy order on Friday"
  step: LadderStep;
}

export interface Nudge {
  chat_message: string; // group (steps 1-3) or approver DM (step 4)
  paypal_note: string; // goes into the PayPal invoice reminder
}

const SCHEMA = {
  type: "object",
  properties: { chat_message: { type: "string" }, paypal_note: { type: "string" } },
  required: ["chat_message", "paypal_note"],
  additionalProperties: false,
};

const TONE: Record<LadderStep["tone"], string> = {
  light: "Light and playful, one emoji max. Just a friendly heads-up. Never mention money owed by anyone else.",
  context:
    "Warm and concrete: mention what the fund is for next (the next need) and the fund percentage. No guilt-tripping.",
  direct:
    "Direct but kind. Say they are the last one if true. Offer two easy outs: pay today, or reply 'split' to pay in two parts or 'later' to pick a date.",
  escalate:
    "This is a PRIVATE message to the approver, not the sibling. Calm and factual: who hasn't paid, how late, and offer options: 'cover from buffer', 'ask someone to cover', or 'hold the allowance'. No blame.",
};

export async function writeNudge(c: NudgeContext): Promise<Nudge> {
  if (!mistralConfigured()) return template(c);
  try {
    const { data } = await chatJson<Nudge>({
      purpose: `badcop.nudge.step${c.step.step}`,
      familyId: c.familyId,
      models: [MODELS.writer, MODELS.fast, MODELS.code],
      maxTokens: 800,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `You are HoldOn, a family's money steward bot in their group chat. You collect monthly contributions for their parent so siblings never have to chase each other. You are the "bad cop" so nobody else has to be, but you are never mean, sarcastic or passive-aggressive.
Write:
- chat_message: max 35 words.
- paypal_note: max 30 words, polite, for the PayPal invoice reminder email.
Tone for this step: ${TONE[c.step.tone]}
Address people by first name. Plain text, no hashtags, no quotes around the message.`,
        },
        { role: "user", content: JSON.stringify(c, null, 2) },
      ],
      jsonSchema: { name: "nudge", schema: SCHEMA },
    });
    if (!data.chat_message?.trim()) return template(c);
    return { chat_message: data.chat_message.trim().slice(0, 400), paypal_note: (data.paypal_note || "").trim().slice(0, 400) };
  } catch {
    return template(c);
  }
}

function template(c: NudgeContext): Nudge {
  const note = `Hi ${c.siblingName}, a gentle reminder about your ${c.amount} share of ${c.parentName}'s ${c.monthLabel} fund. Thank you!`;
  switch (c.step.tone) {
    case "light":
      return { chat_message: `${c.siblingName}, quick one: ${c.parentName}'s fund is waiting on you 🙂`, paypal_note: note };
    case "context":
      return { chat_message: `${c.siblingName}, ${c.nextNeed} is coming up and the fund is at ${c.fundPct}%. Your ${c.amount} gets it there.`, paypal_note: note };
    case "direct":
      return { chat_message: `${c.siblingName}, you're the last one for ${c.monthLabel}. Pay today, or reply "split" to do it in two parts or "later" to pick a date.`, paypal_note: note };
    default:
      return {
        chat_message: `${c.approverName}, ${c.siblingName} hasn't paid ${c.amount} for ${c.monthLabel} (${c.daysLate} days). Want me to ask someone to cover, or hold the allowance until it's in?`,
        paypal_note: note,
      };
  }
}
