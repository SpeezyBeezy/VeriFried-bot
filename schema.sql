-- ============================================================
-- VeriFry — Supabase Schema
-- Run this in the Supabase SQL editor to initialize the database.
-- ============================================================

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ──────────────────────────────────────────────
-- verification_tokens
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS verification_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash            TEXT NOT NULL UNIQUE,           -- SHA-256 of the raw token
  user_id               TEXT NOT NULL,                  -- Discord user snowflake
  guild_id              TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL,
  used_at               TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'used', 'expired', 'invalidated')),
  created_by            TEXT NOT NULL,                  -- "self" or admin Discord user_id
  generated_by_command  TEXT NOT NULL DEFAULT 'verify'
                          CHECK (generated_by_command IN ('verify', 'genurl')),
  is_regenerated        BOOLEAN NOT NULL DEFAULT FALSE
);

-- Fast lookup for active tokens by user
CREATE INDEX IF NOT EXISTS idx_vt_user_guild_status
  ON verification_tokens (user_id, guild_id, status);

-- Fast lookup by hash (used on every verification page load)
CREATE INDEX IF NOT EXISTS idx_vt_token_hash
  ON verification_tokens (token_hash);

-- ──────────────────────────────────────────────
-- verification_events
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS verification_events (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   TEXT NOT NULL,
  token_id                  UUID NOT NULL REFERENCES verification_tokens(id),
  ip_address                TEXT NOT NULL,
  user_agent                TEXT NOT NULL,
  fingerprint_hash          TEXT NOT NULL,
  fingerprint_raw           JSONB,                      -- Raw fingerprint data
  device_details            JSONB,                      -- Parsed OS/browser/device
  vpn_detected              BOOLEAN NOT NULL DEFAULT FALSE,
  proxy_detected            BOOLEAN NOT NULL DEFAULT FALSE,
  vpn_score                 INTEGER,                    -- 0-100 fraud score
  geo_country               TEXT,
  geo_region                TEXT,
  geo_city                  TEXT,
  verification_timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_headers           JSONB,                      -- Safe subset of headers
  discord_report_sent       BOOLEAN NOT NULL DEFAULT FALSE,
  discord_report_message_id TEXT,
  admin_notes               TEXT                        -- Failure notes or manual annotations
);

CREATE INDEX IF NOT EXISTS idx_ve_user_id
  ON verification_events (user_id);

CREATE INDEX IF NOT EXISTS idx_ve_token_id
  ON verification_events (token_id);

CREATE INDEX IF NOT EXISTS idx_ve_fingerprint_hash
  ON verification_events (fingerprint_hash);

CREATE INDEX IF NOT EXISTS idx_ve_ip_address
  ON verification_events (ip_address);

-- ──────────────────────────────────────────────
-- audit_log
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  actor_id    TEXT NOT NULL,                            -- Discord user_id who triggered it
  target_id   TEXT,                                     -- Target user_id if applicable
  token_id    UUID REFERENCES verification_tokens(id),
  metadata    JSONB NOT NULL DEFAULT '{}',
  guild_id    TEXT NOT NULL,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_al_actor_id
  ON audit_log (actor_id);

CREATE INDEX IF NOT EXISTS idx_al_event_type
  ON audit_log (event_type);

CREATE INDEX IF NOT EXISTS idx_al_created_at
  ON audit_log (created_at DESC);

-- ──────────────────────────────────────────────
-- blacklist_entries (optional, future use)
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS blacklist_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('ip', 'fingerprint', 'user_id')),
  value       TEXT NOT NULL,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT NOT NULL,                            -- Admin Discord user_id
  expires_at  TIMESTAMPTZ                               -- NULL = permanent
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bl_type_value
  ON blacklist_entries (type, value);

CREATE INDEX IF NOT EXISTS idx_bl_type
  ON blacklist_entries (type);

-- ──────────────────────────────────────────────
-- Row Level Security
-- The service role key bypasses RLS, so these policies protect
-- against accidental anon/authenticated access from the client.
-- ──────────────────────────────────────────────

ALTER TABLE verification_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist_entries    ENABLE ROW LEVEL SECURITY;

-- Deny all access for non-service-role callers
CREATE POLICY "deny_all_tokens"    ON verification_tokens  FOR ALL USING (FALSE);
CREATE POLICY "deny_all_events"    ON verification_events  FOR ALL USING (FALSE);
CREATE POLICY "deny_all_audit"     ON audit_log            FOR ALL USING (FALSE);
CREATE POLICY "deny_all_blacklist" ON blacklist_entries     FOR ALL USING (FALSE);
