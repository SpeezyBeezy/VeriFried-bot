// src/lib/fingerprint/device-parser.ts
// Parses user-agent strings into structured device details.
// Uses only stdlib regex — no external UA parser dependency.

import type { DeviceDetails } from "@/types";

export function parseUserAgent(userAgent: string): DeviceDetails {
  const ua = userAgent.toLowerCase();

  return {
    browser: detectBrowser(ua),
    browserVersion: detectBrowserVersion(userAgent),
    os: detectOS(ua),
    osVersion: detectOSVersion(userAgent),
    deviceType: detectDeviceType(ua),
    isMobile: /mobile|android|iphone|ipad|ipod/.test(ua),
    isBot: detectBot(ua),
  };
}

function detectBrowser(ua: string): string {
  if (ua.includes("edg/")) return "Edge";
  if (ua.includes("opr/") || ua.includes("opera")) return "Opera";
  if (ua.includes("chrome") && !ua.includes("chromium")) return "Chrome";
  if (ua.includes("chromium")) return "Chromium";
  if (ua.includes("firefox")) return "Firefox";
  if (ua.includes("safari") && !ua.includes("chrome")) return "Safari";
  if (ua.includes("trident") || ua.includes("msie")) return "Internet Explorer";
  return "Unknown";
}

function detectBrowserVersion(ua: string): string {
  const patterns: [RegExp, number][] = [
    [/edg\/([\d.]+)/i, 1],
    [/opr\/([\d.]+)/i, 1],
    [/chrome\/([\d.]+)/i, 1],
    [/firefox\/([\d.]+)/i, 1],
    [/version\/([\d.]+).*safari/i, 1],
  ];

  for (const [pattern, group] of patterns) {
    const match = ua.match(pattern);
    if (match?.[group]) return match[group];
  }
  return "Unknown";
}

function detectOS(ua: string): string {
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("macintosh") || ua.includes("mac os")) return "macOS";
  if (ua.includes("iphone") || ua.includes("ipad")) return "iOS";
  if (ua.includes("android")) return "Android";
  if (ua.includes("linux")) return "Linux";
  if (ua.includes("chromeos")) return "ChromeOS";
  return "Unknown";
}

function detectOSVersion(ua: string): string {
  const patterns: RegExp[] = [
    /windows nt ([\d.]+)/i,
    /mac os x ([\d_]+)/i,
    /android ([\d.]+)/i,
    /iphone os ([\d_]+)/i,
    /ipad; cpu os ([\d_]+)/i,
  ];

  for (const pattern of patterns) {
    const match = ua.match(pattern);
    if (match?.[1]) return match[1].replace(/_/g, ".");
  }
  return "Unknown";
}

function detectDeviceType(ua: string): DeviceDetails["deviceType"] {
  if (ua.includes("ipad") || ua.includes("tablet")) return "tablet";
  if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android"))
    return "mobile";
  if (
    ua.includes("windows") ||
    ua.includes("macintosh") ||
    ua.includes("linux")
  )
    return "desktop";
  return "unknown";
}

function detectBot(ua: string): boolean {
  const botSignals = [
    "bot", "crawl", "spider", "slurp", "mediapartners", "bingpreview",
    "facebookexternalhit", "twitterbot", "headlesschrome", "phantomjs",
    "puppeteer", "playwright", "selenium",
  ];
  return botSignals.some((signal) => ua.includes(signal));
}
