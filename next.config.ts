import type { NextConfig } from "next";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Dev convenience: reuse the Mistral key already saved on this Mac when .env.local leaves it blank.
if (!process.env.MISTRAL_API_KEY) {
  try {
    const f = path.join(os.homedir(), ".config/officevault/mistral.env");
    const k = fs.readFileSync(f, "utf8").match(/^MISTRAL_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
    if (k && /^[A-Za-z0-9_-]{20,120}$/.test(k)) process.env.MISTRAL_API_KEY = k;
  } catch {
    /* no local key file: Mistral features show as not configured */
  }
}

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@electric-sql/pglite", "pg", "grammy"],
};

export default nextConfig;
