// src/lib/discord/client.ts
// Thin wrapper around Discord REST API.
// Used to send verification reports and interaction responses.

import { env } from "@/lib/config";

const DISCORD_API = "https://discord.com/api/v10";

interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
}

async function discordRequest<T>(options: RequestOptions): Promise<T> {
  const res = await fetch(`${DISCORD_API}${options.path}`, {
    method: options.method,
    headers: {
      Authorization: `Bot ${env.discordBotToken}`,
      "Content-Type": "application/json",
      "User-Agent": "VeriFry/1.0",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text().catch(() => res.statusText);
    throw new Error(`Discord API error ${res.status}: ${error}`);
  }

  // Some Discord endpoints return 204 No Content
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export async function sendChannelMessage(
  channelId: string,
  payload: Record<string, unknown>
): Promise<{ id: string }> {
  return discordRequest({
    method: "POST",
    path: `/channels/${channelId}/messages`,
    body: payload,
  });
}

/**
 * Sends the verification report to the configured admin channel.
 * Returns the sent message ID, or throws on failure.
 * Caller is responsible for retry logic.
 */
export async function sendVerificationReport(
  report: VerificationReport
): Promise<string> {
  const embed = buildReportEmbed(report);
  const { id } = await sendChannelMessage(report.channelId, { embeds: [embed] });
  return id;
}

// ──────────────────────────────────────────────
// Retry logic for Discord message delivery
// ──────────────────────────────────────────────

export async function sendVerificationReportWithRetry(
  report: VerificationReport,
  maxAttempts = 3
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  let lastError: string = "Unknown";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const messageId = await sendVerificationReport(report);
      return { success: true, messageId };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[VeriFry] Discord report delivery attempt ${attempt}/${maxAttempts} failed: ${lastError}`
      );

      if (attempt < maxAttempts) {
        // Exponential backoff: 500ms, 1000ms
        await sleep(500 * attempt);
      }
    }
  }

  return { success: false, error: lastError };
}

// ──────────────────────────────────────────────
// Report embed builder
// ──────────────────────────────────────────────

export interface VerificationReport {
  channelId: string;
  userId: string;
  guildId: string;
  tokenId: string;
  generatedByCommand: "verify" | "genurl";
  isRegenerated: boolean;
  verificationTimestamp: string;
  ipAddress: string;
  userAgent: string;
  deviceDetails: {
    browser: string;
    browserVersion: string;
    os: string;
    osVersion: string;
    deviceType: string;
  };
  fingerprintHash: string;
  vpnDetected: boolean;
  proxyDetected: boolean;
  vpnScore: number | null;
  geoCountry: string | null;
  geoRegion: string | null;
  geoCity: string | null;
  isp: string | null;
  riskNotes: string[];
}

function buildReportEmbed(report: VerificationReport) {
  const riskColor = report.vpnDetected || report.proxyDetected
    ? 0xe67e22 // Orange — flag for review
    : 0x2ecc71;  // Green — clean result

  const riskLabel = report.vpnDetected
    ? "VPN/Proxy Detected — Manual Review Required"
    : report.proxyDetected
    ? "Proxy Detected — Manual Review Required"
    : "No VPN/Proxy Detected";

  const geo = [report.geoCity, report.geoRegion, report.geoCountry]
    .filter(Boolean)
    .join(", ") || "Unknown";

  const fields = [
    {
      name: "Discord User",
      value: `<@${report.userId}> (${report.userId})`,
      inline: false,
    },
    {
      name: "Guild ID",
      value: report.guildId,
      inline: true,
    },
    {
      name: "Token ID",
      value: `\`${report.tokenId}\``,
      inline: true,
    },
    {
      name: "Command Used",
      value: `/${report.generatedByCommand}${report.isRegenerated ? " (regenerated)" : " (first-time)"}`,
      inline: true,
    },
    {
      name: "Verification Time",
      value: new Date(report.verificationTimestamp).toUTCString(),
      inline: false,
    },
    {
      name: "IP Address",
      value: `\`${report.ipAddress}\``,
      inline: true,
    },
    {
      name: "Geolocation",
      value: geo,
      inline: true,
    },
    {
      name: "ISP",
      value: report.isp ?? "Unknown",
      inline: true,
    },
    {
      name: "VPN / Proxy Status",
      value: riskLabel,
      inline: false,
    },
    {
      name: "Fraud Score",
      value: report.vpnScore !== null ? `${report.vpnScore}/100` : "N/A",
      inline: true,
    },
    {
      name: "Device Type",
      value: report.deviceDetails.deviceType,
      inline: true,
    },
    {
      name: "Operating System",
      value: `${report.deviceDetails.os} ${report.deviceDetails.osVersion}`.trim(),
      inline: true,
    },
    {
      name: "Browser",
      value: `${report.deviceDetails.browser} ${report.deviceDetails.browserVersion}`.trim(),
      inline: true,
    },
    {
      name: "User Agent",
      value: `\`\`\`${report.userAgent.slice(0, 1000)}\`\`\``,
      inline: false,
    },
    {
      name: "Fingerprint Hash",
      value: `\`${report.fingerprintHash}\``,
      inline: false,
    },
  ];

  if (report.riskNotes.length > 0) {
    fields.push({
      name: "Risk / Context Notes",
      value: report.riskNotes.map((n) => `- ${n}`).join("\n"),
      inline: false,
    });
  }

  return {
    title: "Verification Report",
    description: `A user has completed the verification flow. Please review and assign the verified role manually.`,
    color: riskColor,
    fields,
    footer: {
      text: "VeriFry — Manual review required before role assignment",
    },
    timestamp: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────
// Interaction response helpers
// ──────────────────────────name────────────────────

export function ephemeralResponse(content: string) {
  return {
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      content,
      flags: 64, // EPHEMERAL
    },
  };
}

export function pongResponse() {
  return { type: 1 }; // PONG
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
