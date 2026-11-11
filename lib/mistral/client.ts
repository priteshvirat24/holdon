/**
 * Mistral client with the behaviours verified on this free-tier key:
 * - mistral-large-4 returns content as a list of chunks → normalise to text
 * - temperature 0 needs top_p 1 → default temperature 0.2, top_p 1
 * - finish_reason "length" = failure → fall through to the next model
 * - 429 with limit 0 = no quota → skip model; 5xx / dropped connection → retry
 * - tool-call arguments are a JSON string
 */
import "server-only";
import { logEvent } from "../events";

const BASE = "https://api.mistral.ai/v1";

export const MODELS = {
  fast: "ministral-8b-latest", // tool calls, routing, extraction (188 req/min)
  writer: "ministral-14b-latest", // warm prose with json_schema (30 req/min)
  judge: "mistral-large-4", // reasoning, low volume (20k tokens/min)
  code: "codestral-latest", // exact JSON fallback
} as const;

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; name: string; content: string; tool_call_id: string };

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatOptions {
  models: string[]; // tried in order
  messages: ChatMessage[];
  tools?: ToolDef[];
  toolChoice?: "auto" | "any" | "none";
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: "low" | "medium" | "high";
  familyId?: string | null;
  purpose: string;
}

export interface ChatResult {
  model: string;
  text: string;
  toolCalls: ToolCall[];
  finishReason: string;
}

export function mistralConfigured() {
  const k = process.env.MISTRAL_API_KEY || "";
  return /^[A-Za-z0-9_-]{20,120}$/.test(k);
}

const deadModels = new Map<string, number>(); // model -> unusable until (ms)

export async function chat(o: ChatOptions): Promise<ChatResult> {
  if (!mistralConfigured()) throw new Error("MISTRAL_API_KEY missing or malformed");
  const errors: string[] = [];

  for (const model of o.models) {
    if ((deadModels.get(model) ?? 0) > Date.now()) continue;
    const body: Record<string, unknown> = {
      model,
      messages: o.messages,
      temperature: o.temperature ?? 0.2,
      top_p: 1,
      max_tokens: o.maxTokens ?? (model === MODELS.judge ? 5000 : 1500),
    };
    if (o.tools?.length) {
      body.tools = o.tools;
      body.tool_choice = o.toolChoice ?? "auto";
    }
    if (o.jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: o.jsonSchema.name, strict: true, schema: o.jsonSchema.schema },
      };
    }
    if (model === MODELS.judge) body.reasoning_effort = o.reasoningEffort ?? "low";

    for (let attempt = 0; attempt < 3; attempt++) {
      const started = Date.now();
      let res: Response;
      try {
        res = await fetch(`${BASE}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45_000),
        });
      } catch (e: any) {
        errors.push(`${model}: network ${e?.message}`);
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }

      if (res.status === 429) {
        const limit = res.headers.get("x-ratelimit-limit-req-minute");
        if (limit === "0") {
          deadModels.set(model, Date.now() + 3 * 3600_000);
          errors.push(`${model}: no quota`);
          break;
        }
        const wait = Number(res.headers.get("retry-after") || 2) * 1000;
        errors.push(`${model}: rate limited`);
        await new Promise((r) => setTimeout(r, Math.min(wait, 8000)));
        continue;
      }
      if ([401, 402].includes(res.status)) throw new Error(`Mistral ${res.status}: check key / usage`);
      if ([403, 404].includes(res.status)) {
        deadModels.set(model, Date.now() + 24 * 3600_000);
        errors.push(`${model}: ${res.status}`);
        break;
      }
      if (res.status >= 500) {
        errors.push(`${model}: ${res.status}`);
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      const data = await res.json();
      if (!res.ok) {
        errors.push(`${model}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
        break;
      }
      const choice = data.choices?.[0];
      const text = normalise(choice?.message?.content);
      const toolCalls: ToolCall[] = choice?.message?.tool_calls ?? [];
      const finishReason: string = choice?.finish_reason ?? "";

      await logEvent({
        familyId: o.familyId ?? null,
        type: `ai.${o.purpose}`,
        source: "agent",
        payload: { model, ms: Date.now() - started, finishReason, usage: data.usage, tools: toolCalls.map((t) => t.function.name) },
      });

      if (finishReason === "length") {
        errors.push(`${model}: truncated`);
        break; // fall through to next model
      }
      if (o.jsonSchema && !toolCalls.length && !text.trim()) {
        errors.push(`${model}: empty`);
        break;
      }
      return { model, text, toolCalls, finishReason };
    }
  }
  throw new Error(`All models failed for ${o.purpose}: ${errors.join(" | ")}`);
}

/** Chat that must return JSON matching a schema; parsed + fence-stripped. */
export async function chatJson<T>(o: ChatOptions & { jsonSchema: NonNullable<ChatOptions["jsonSchema"]> }): Promise<{ data: T; model: string }> {
  const r = await chat(o);
  return { data: parseJson<T>(r.text), model: r.model };
}

export function normalise(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .filter((x: any) => x && typeof x === "object" && x.type === "text")
      .map((x: any) => x.text ?? "")
      .join("");
  }
  return "";
}

export function parseJson<T>(text: string): T {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(stripped) as T;
}
