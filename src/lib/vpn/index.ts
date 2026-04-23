// src/lib/vpn/index.ts
// VPN and proxy detection using IPQualityScore API.
// Degrades gracefully if the API key is absent or the request fails.

import type { VpnCheckResult } from "@/types";
import { env } from "@/lib/config";

const IPQS_BASE = "https://www.ipqualityscore.com/api/json/ip";

export async function checkIpReputation(
  ip: string
): Promise<VpnCheckResult> {
  const fallback: VpnCheckResult = {
    vpn: false,
    proxy: false,
    tor: false,
    fraud_score: 0,
    country_code: null,
    region: null,
    city: null,
    isp: null,
    error: true,
    error_message: "VPN check skipped",
  };

  if (!env.ipqsApiKey) {
    return { ...fallback, error_message: "IPQS_API_KEY not configured" };
  }

  if (ip === "unknown" || ip === "127.0.0.1" || ip.startsWith("192.168.")) {
    return { ...fallback, error: false, error_message: "Private/local IP, skipped" };
  }

  try {
    const url = `${IPQS_BASE}/${env.ipqsApiKey}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true&fast=true&lighter_penalties=false&mobile=true`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`IPQS returned ${res.status}`);
    }

    const json = await res.json();

    if (!json.success) {
      return { ...fallback, error_message: json.message ?? "IPQS returned success=false" };
    }

    return {
      vpn: json.vpn ?? false,
      proxy: json.proxy ?? false,
      tor: json.tor ?? false,
      fraud_score: json.fraud_score ?? 0,
      country_code: json.country_code ?? null,
      region: json.region ?? null,
      city: json.city ?? null,
      isp: json.ISP ?? null,
      error: false,
      error_message: null,
    };
  } catch (err) {
    console.warn("[VeriFry] VPN check failed:", err);
    return {
      ...fallback,
      error_message: err instanceof Error ? err.message : "Network error",
    };
  }
}
