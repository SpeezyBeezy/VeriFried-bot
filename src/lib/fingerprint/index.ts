// src/lib/fingerprint/index.ts
// Server-side fingerprint processing.
// The raw FingerprintData comes from the client-side script on the verification page.

import type { DeviceDetails, FingerprintData } from "@/types";
import { hashFingerprint } from "@/lib/security";
import { parseUserAgent } from "./device-parser";

export interface ProcessedFingerprint {
  hash: string;
  raw: FingerprintData;
  deviceDetails: DeviceDetails;
}

export function processFingerprint(
  data: FingerprintData
): ProcessedFingerprint {
  const hash = hashFingerprint(data as unknown as Record<string, unknown>);
  const deviceDetails = parseUserAgent(data.userAgent);

  return {
    hash,
    raw: data,
    deviceDetails,
  };
}

/**
 * Validates that fingerprint data has the minimum required fields.
 * Rejects obviously fabricated or empty submissions.
 */
export function validateFingerprintPayload(data: unknown): data is FingerprintData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d.userAgent === "string" && d.userAgent.length > 0;
}
