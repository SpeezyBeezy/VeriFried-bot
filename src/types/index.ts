// src/types/index.ts
// Central type definitions for VeriFry

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────

export interface AppConfig {
  discord: {
    guildId: string;
    verificationChannelId: string;
    verifiedRoleId: string;
    adminRoleIds: string[];
  };
  tokens: {
    expirySeconds: number;
    cooldownSeconds: number;
    bytesOfEntropy: number;
  };
  rateLimits: {
    interactionsPerMinute: number;
    verificationPagePerMinute: number;
  };
  vpn: {
    enabled: boolean;
    flagAsRiskyThreshold: number;
  };
  features: {
    geoLookup: boolean;
    blacklistCheck: boolean;
  };
}

// ──────────────────────────────────────────────
// Database row shapes (snake_case matches Supabase)
// ──────────────────────────────────────────────

export type TokenStatus = "pending" | "used" | "expired" | "invalidated";

export interface VerificationToken {
  id: string;
  token_hash: string;
  user_id: string;
  guild_id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  status: TokenStatus;
  created_by: string; // "self" | discord user_id of admin
  generated_by_command: "verify" | "genurl";
  is_regenerated: boolean;
}

export interface VerificationEvent {
  id: string;
  user_id: string;
  token_id: string;
  ip_address: string;
  user_agent: string;
  fingerprint_hash: string;
  fingerprint_raw: Record<string, unknown>;
  device_details: DeviceDetails;
  vpn_detected: boolean;
  proxy_detected: boolean;
  vpn_score: number | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_city: string | null;
  verification_timestamp: string;
  request_headers: Record<string, string>;
  discord_report_sent: boolean;
  discord_report_message_id: string | null;
  admin_notes: string | null;
}

export interface AuditLogEntry {
  id: string;
  event_type: AuditEventType;
  actor_id: string; // Discord user_id of who triggered it
  target_id: string | null; // Discord user_id target if applicable
  token_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  guild_id: string;
  ip_address: string | null;
}

export type AuditEventType =
  | "token_created"
  | "token_regenerated"
  | "token_invalidated"
  | "verification_success"
  | "verification_failure_expired"
  | "verification_failure_used"
  | "verification_failure_invalid"
  | "admin_genurl"
  | "admin_unverify"
  | "rate_limit_hit"
  | "signature_verification_failed"
  | "discord_report_failed"
  | "discord_report_retried";

export interface BlacklistEntry {
  id: string;
  type: "ip" | "fingerprint" | "user_id";
  value: string;
  reason: string;
  created_at: string;
  created_by: string;
  expires_at: string | null;
}

// ──────────────────────────────────────────────
// Fingerprinting
// ──────────────────────────────────────────────

export interface DeviceDetails {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  isMobile: boolean;
  isBot: boolean;
}

export interface FingerprintData {
  userAgent: string;
  language: string | null;
  platform: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  colorDepth: number | null;
  timezone: string | null;
  canvasHash: string | null;
  webglHash: string | null;
  fonts: string[] | null;
  plugins: string[] | null;
  cookiesEnabled: boolean | null;
  doNotTrack: string | null;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  touchPoints: number | null;
  connectionType: string | null;
}

// ──────────────────────────────────────────────
// VPN/Proxy lookup
// ──────────────────────────────────────────────

export interface VpnCheckResult {
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
  fraud_score: number;
  country_code: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  error: boolean;
  error_message: string | null;
}

// ──────────────────────────────────────────────
// Discord interaction shapes (minimal, what we need)
// ──────────────────────────────────────────────

export interface DiscordInteraction {
  id: string;
  type: number;
  data?: {
    name: string;
    options?: Array<{
      name: string;
      type: number;
      value: string | number;
    }>;
  };
  guild_id?: string;
  channel_id?: string;
  member?: {
    user: DiscordUser;
    roles: string[];
  };
  user?: DiscordUser;
  token: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string | null;
}

// ──────────────────────────────────────────────
// Verification page
// ──────────────────────────────────────────────

export interface VerificationPageState {
  status: "valid" | "expired" | "used" | "invalid" | "error";
  discordUserId?: string;
  message: string;
}

export interface VerificationSubmitPayload {
  token: string;
  fingerprint: FingerprintData;
}

export interface VerificationSubmitResult {
  success: boolean;
  message: string;
}
