// src/lib/config/index.ts
// Loads and validates config.json and required environment variables.
// Throws at startup if anything critical is missing.

import rawConfig from "../../../config.json";
import type { AppConfig } from "@/types";

// ──────────────────────────────────────────────
// Typed config from config.json
// ──────────────────────────────────────────────

function loadConfig(): AppConfig {
  const cfg = rawConfig as AppConfig;

  const required = [
    cfg.discord?.guildId,
    cfg.discord?.verificationChannelId,
    cfg.discord?.verifiedRoleId,
  ];

  for (const val of required) {
    if (!val || val.startsWith("YOUR_")) {
      throw new Error(
        `[VeriFry] config.json is missing required Discord IDs. ` +
          `Please fill in guildId, verificationChannelId, and verifiedRoleId.`
      );
    }
  }

  return cfg;
}

// ──────────────────────────────────────────────
// Environment variable loader
// ──────────────────────────────────────────────

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(
      `[VeriFry] Missing required environment variable: ${key}. ` +
        `Check your .env.local or Vercel project settings.`
    );
  }
  return val;
}

export const env = {
  get discordApplicationId() {
    return requireEnv("DISCORD_APPLICATION_ID");
  },
  get discordBotToken() {
    return requireEnv("DISCORD_BOT_TOKEN");
  },
  get discordPublicKey() {
    return requireEnv("DISCORD_PUBLIC_KEY");
  },
  get supabaseUrl() {
    return requireEnv("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  get ipqsApiKey() {
    // Optional — VPN check is skipped gracefully if absent
    return process.env.IPQS_API_KEY ?? null;
  },
  get baseUrl() {
    return requireEnv("NEXT_PUBLIC_BASE_URL");
  },
};

export const config: AppConfig = loadConfig();
