// src/lib/security/index.ts
// Cryptographic utilities: token generation, hashing, Discord signature verification.

import { createHash, randomBytes } from "crypto";
import nacl from "tweetnacl";

// ──────────────────────────────────────────────
// Token generation
// ──────────────────────────────────────────────

/**
 * Generates a cryptographically secure, URL-safe token.
 * Default: 32 bytes = 256 bits of entropy, base64url encoded (~43 chars).
 */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes)
    .toString("base64url") // URL-safe, no padding
    .replace(/[^a-zA-Z0-9_-]/g, ""); // Ensure URL safety
}

/**
 * Hashes a raw token with SHA-256 for safe database storage.
 * The raw token is never stored — only the hash is persisted.
 */
export async function hashToken(rawToken: string): Promise<string> {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Hashes fingerprint data for the fingerprint_hash column.
 */
export function hashFingerprint(data: Record<string, unknown>): string {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

// ──────────────────────────────────────────────
// Discord signature verification
// ──────────────────────────────────────────────

/**
 * Verifies the Ed25519 signature on an incoming Discord interaction.
 * Discord requires this for all interaction endpoints.
 * Returns true if the signature is valid.
 */
export function verifyDiscordSignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  try {
    const publicKeyBytes = hexToUint8Array(publicKey);
    const signatureBytes = hexToUint8Array(signature);
    const message = new TextEncoder().encode(timestamp + body);

    return nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const pairs = hex.match(/.{1,2}/g) ?? [];
  return new Uint8Array(pairs.map((byte) => parseInt(byte, 16)));
}

// ──────────────────────────────────────────────
// IP extraction — handles reverse proxy headers correctly
// ──────────────────────────────────────────────

/**
 * Extracts the real client IP address from a request.
 * Checks Vercel / Cloudflare proxy headers before falling back.
 */
export function extractClientIp(headers: Record<string, string | undefined>): string {
  // Vercel sets x-real-ip for the originating client
  const candidates = [
    headers["x-real-ip"],
    // CF-Connecting-IP from Cloudflare
    headers["cf-connecting-ip"],
    // x-forwarded-for can contain a chain; take the first (originating) IP
    headers["x-forwarded-for"]?.split(",")[0]?.trim(),
    headers["x-client-ip"],
    "unknown",
  ];

  for (const candidate of candidates) {
    if (candidate && candidate !== "unknown" && isValidIp(candidate)) {
      return candidate;
    }
  }

  return "unknown";
}

function isValidIp(ip: string): boolean {
  // Minimal check — rejects obviously malformed values
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  return ipv4.test(ip) || ipv6.test(ip);
}

// ──────────────────────────────────────────────
// Safe header extraction for storage
// ──────────────────────────────────────────────

/**
 * Extracts a safe subset of request headers for audit storage.
 * Excludes authorization headers or anything sensitive.
 */
export function safeRequestHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const allowList = [
    "user-agent",
    "accept",
    "accept-language",
    "accept-encoding",
    "referer",
    "origin",
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
    "cf-ipcountry",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
  ];

  const result: Record<string, string> = {};
  for (const key of allowList) {
    const val = headers[key];
    if (val) result[key] = Array.isArray(val) ? val.join(", ") : val;
  }
  return result;
}
