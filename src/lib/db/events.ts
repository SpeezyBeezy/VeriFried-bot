// src/lib/db/events.ts
// Database operations for verification_events and audit_log.

import { getSupabaseClient } from "./client";
import type {
  AuditEventType,
  AuditLogEntry,
  DeviceDetails,
  FingerprintData,
  VerificationEvent,
  VpnCheckResult,
} from "@/types";

// ──────────────────────────────────────────────
// Verification Events
// ──────────────────────────────────────────────

export async function createVerificationEvent(params: {
  userId: string;
  tokenId: string;
  ipAddress: string;
  userAgent: string;
  fingerprintHash: string;
  fingerprintRaw: FingerprintData;
  deviceDetails: DeviceDetails;
  vpnResult: VpnCheckResult;
  requestHeaders: Record<string, string>;
}): Promise<VerificationEvent> {
  const db = getSupabaseClient();

  const row = {
    user_id: params.userId,
    token_id: params.tokenId,
    ip_address: params.ipAddress,
    user_agent: params.userAgent,
    fingerprint_hash: params.fingerprintHash,
    fingerprint_raw: params.fingerprintRaw,
    device_details: params.deviceDetails,
    vpn_detected: params.vpnResult.vpn || params.vpnResult.tor,
    proxy_detected: params.vpnResult.proxy,
    vpn_score: params.vpnResult.fraud_score,
    geo_country: params.vpnResult.country_code,
    geo_region: params.vpnResult.region,
    geo_city: params.vpnResult.city,
    verification_timestamp: new Date().toISOString(),
    request_headers: params.requestHeaders,
    discord_report_sent: false,
  };

  const { data, error } = await db
    .from("verification_events")
    .insert(row)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create verification event: ${error?.message}`);
  }

  return data as VerificationEvent;
}

export async function markReportSent(
  eventId: string,
  messageId: string
): Promise<void> {
  const db = getSupabaseClient();
  await db
    .from("verification_events")
    .update({
      discord_report_sent: true,
      discord_report_message_id: messageId,
    })
    .eq("id", eventId);
}

export async function markReportFailed(
  eventId: string,
  note: string
): Promise<void> {
  const db = getSupabaseClient();
  await db
    .from("verification_events")
    .update({ admin_notes: note })
    .eq("id", eventId);
}

// ──────────────────────────────────────────────
// Audit Log
// ──────────────────────────────────────────────

export async function writeAuditLog(params: {
  eventType: AuditEventType;
  actorId: string;
  targetId?: string;
  tokenId?: string;
  metadata?: Record<string, unknown>;
  guildId: string;
  ipAddress?: string;
}): Promise<void> {
  const db = getSupabaseClient();

  const row: Omit<AuditLogEntry, "id" | "created_at"> = {
    event_type: params.eventType,
    actor_id: params.actorId,
    target_id: params.targetId ?? null,
    token_id: params.tokenId ?? null,
    metadata: params.metadata ?? {},
    guild_id: params.guildId,
    ip_address: params.ipAddress ?? null,
  };

  // Fire-and-forget with error swallow — audit log must not break the main flow
  const { error } = await db.from("audit_log").insert(row);
  if (error) {
    console.error("[VeriFry] Audit log write failed:", error.message);
  }
}
