// src/app/api/v/route.ts
// Verification submission endpoint.
// Called by the client-side verification page after collecting fingerprint data.
// Validates the token, stores all data, and sends the Discord report.

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { validateToken, consumeToken } from "@/lib/tokens";
import { processFingerprint, validateFingerprintPayload } from "@/lib/fingerprint";
import { checkIpReputation } from "@/lib/vpn";
import { createVerificationEvent, markReportSent, markReportFailed, writeAuditLog } from "@/lib/db/events";
import { sendVerificationReportWithRetry, type VerificationReport } from "@/lib/discord/client";
import { extractClientIp, safeRequestHeaders } from "@/lib/security";
import { expireStaleTokens } from "@/lib/db/tokens";
import type { VerificationSubmitPayload } from "@/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Opportunistically sweep expired tokens — lightweight, no cron needed
  expireStaleTokens().catch(() => {});

  let payload: VerificationSubmitPayload;
  try {
    payload = (await req.json()) as VerificationSubmitPayload;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }

  const { token: rawToken, fingerprint } = payload;

  if (!rawToken || typeof rawToken !== "string") {
    return NextResponse.json({ success: false, message: "Missing token." }, { status: 400 });
  }

  if (!validateFingerprintPayload(fingerprint)) {
    return NextResponse.json({ success: false, message: "Invalid fingerprint data." }, { status: 400 });
  }

  // ── Token validation ──────────────────────────────────────────────────────
  const tokenResult = await validateToken(rawToken);

  if (!tokenResult.valid) {
    const messages: Record<typeof tokenResult.reason, string> = {
      not_found: "This verification link is invalid.",
      expired: "This verification link has expired. Please request a new one.",
      used: "This verification link has already been used.",
      invalid: "This verification link is not valid.",
    };

    await writeAuditLog({
      eventType: `verification_failure_${tokenResult.reason}` as "verification_failure_expired" | "verification_failure_used" | "verification_failure_invalid",
      actorId: "unknown",
      metadata: { reason: tokenResult.reason },
      guildId: config.discord.guildId,
    }).catch(() => {});

    return NextResponse.json(
      { success: false, message: messages[tokenResult.reason] },
      { status: 400 }
    );
  }

  const token = tokenResult.token;

  // ── Atomically consume the token ─────────────────────────────────────────
  const consumed = await consumeToken(token.id);
  if (!consumed.success) {
    // Another request beat us to it — double-submit protection
    return NextResponse.json(
      { success: false, message: "This verification link has already been used." },
      { status: 409 }
    );
  }

  // ── Collect request metadata ──────────────────────────────────────────────
  const headersMap = Object.fromEntries(req.headers.entries());
  const ipAddress = extractClientIp(headersMap);
  const userAgent = req.headers.get("user-agent") ?? "Unknown";
  const safeHeaders = safeRequestHeaders(headersMap);

  // ── Process fingerprint ───────────────────────────────────────────────────
  const processed = processFingerprint({ ...fingerprint, userAgent });

  // ── VPN/Proxy check ───────────────────────────────────────────────────────
  const vpnResult = config.vpn.enabled
    ? await checkIpReputation(ipAddress)
    : {
        vpn: false, proxy: false, tor: false,
        fraud_score: 0, country_code: null, region: null,
        city: null, isp: null, error: false, error_message: null,
      };

  // ── Persist verification event ────────────────────────────────────────────
  const event = await createVerificationEvent({
    userId: token.user_id,
    tokenId: token.id,
    ipAddress,
    userAgent,
    fingerprintHash: processed.hash,
    fingerprintRaw: processed.raw,
    deviceDetails: processed.deviceDetails,
    vpnResult,
    requestHeaders: safeHeaders,
  });

  // ── Build risk notes for the report ──────────────────────────────────────
  const riskNotes: string[] = [];
  if (vpnResult.vpn) riskNotes.push("VPN detected");
  if (vpnResult.proxy) riskNotes.push("Proxy detected");
  if (vpnResult.tor) riskNotes.push("Tor exit node detected");
  if (vpnResult.fraud_score >= config.vpn.flagAsRiskyThreshold) {
    riskNotes.push(`High fraud score: ${vpnResult.fraud_score}/100`);
  }
  if (processed.deviceDetails.isBot) {
    riskNotes.push("Automated browser / bot signals detected in user agent");
  }

  // ── Send Discord report ───────────────────────────────────────────────────
  const report: VerificationReport = {
    channelId: config.discord.verificationChannelId,
    userId: token.user_id,
    guildId: token.guild_id,
    tokenId: token.id,
    generatedByCommand: token.generated_by_command,
    isRegenerated: token.is_regenerated,
    verificationTimestamp: event.verification_timestamp,
    ipAddress,
    userAgent,
    deviceDetails: processed.deviceDetails,
    fingerprintHash: processed.hash,
    vpnDetected: vpnResult.vpn || vpnResult.tor,
    proxyDetected: vpnResult.proxy,
    vpnScore: vpnResult.fraud_score,
    geoCountry: vpnResult.country_code,
    geoRegion: vpnResult.region,
    geoCity: vpnResult.city,
    isp: vpnResult.isp,
    riskNotes,
  };

  const reportResult = await sendVerificationReportWithRetry(report, 3);

  if (reportResult.success && reportResult.messageId) {
    await markReportSent(event.id, reportResult.messageId);
  } else {
    // Store the failure for manual review / retry — don't lose the event
    await markReportFailed(
      event.id,
      `Discord report failed after 3 attempts: ${reportResult.error}`
    );
    console.error("[VeriFry] Failed to send Discord report:", reportResult.error);
  }

  // Audit log
  await writeAuditLog({
    eventType: "verification_success",
    actorId: token.user_id,
    tokenId: token.id,
    metadata: {
      eventId: event.id,
      ipAddress,
      vpnDetected: vpnResult.vpn,
      reportSent: reportResult.success,
    },
    guildId: token.guild_id,
    ipAddress,
  });

  return NextResponse.json({
    success: true,
    message: "Verification complete. An admin will review your submission and assign your role.",
  });
}
