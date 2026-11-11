import "server-only";
import { q } from "./db";
import { id } from "./util";

export async function logEvent(e: { familyId: string | null; type: string; source: string; payload?: unknown }) {
  try {
    await q(`INSERT INTO event (id, family_id, type, source, payload) VALUES ($1,$2,$3,$4,$5)`, [
      id("evt"),
      e.familyId,
      e.type,
      e.source,
      JSON.stringify(e.payload ?? {}),
    ]);
  } catch (err) {
    // Audit logging must never break a money flow.
    console.error("logEvent failed", err);
  }
}
