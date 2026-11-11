import { NextResponse } from "next/server";
import { logEvent } from "@/lib/events";
import { DEMO_FAMILY_ID } from "@/lib/family";

export const maxDuration = 30;

/** Mom's voice → text with Mistral Voxtral (verified on this key: voxtral-mini-latest). */
export async function POST(req: Request) {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) return NextResponse.json({ error: "Voice needs a Mistral key" }, { status: 503 });
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size < 1000) return NextResponse.json({ error: "I didn't catch that. Try again?" }, { status: 400 });
  if (audio.size > 8_000_000) return NextResponse.json({ error: "That recording is too long" }, { status: 413 });

  const out = new FormData();
  out.append("model", "voxtral-mini-latest");
  out.append("language", "en");
  out.append("file", audio, (audio as File).name || "voice.webm");
  const started = Date.now();
  const res = await fetch("https://api.mistral.ai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: out,
  });
  const data = await res.json().catch(() => ({}));
  await logEvent({ familyId: DEMO_FAMILY_ID, type: "ai.voice.transcribe", source: "agent", payload: { model: "voxtral-mini-latest", ms: Date.now() - started, status: res.status } });
  if (!res.ok) return NextResponse.json({ error: "Voice didn't work this time. Type instead?" }, { status: 502 });
  return NextResponse.json({ text: String(data.text ?? "").trim() });
}
