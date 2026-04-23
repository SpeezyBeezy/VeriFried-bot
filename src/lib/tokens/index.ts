// src/lib/tokens/index.ts
// Token lifecycle management: creation, cooldown enforcement, validation.

import { config, env } from "@/lib/config";
import {
  createToken,
  getActiveTokenForUser,
  getMostRecentTokenForUser,
  getTokenByHash,
  invalidatePendingTokensForUser,
  markTokenUsed,
} from "@/lib/db/tokens";
import { generateSecureToken, hashToken } from "@/lib/security";
import type { VerificationToken } from "@/types";

// ──────────────────────────────────────────────
// Token creation
// ──────────────────────────────────────────────

export type IssueTokenResult =
  | { ok: true; rawToken: string; token: VerificationToken; isRegenerated: boolean }
  | { ok: false; reason: "cooldown"; retryAfterSeconds: number }
  | { ok: false; reason: "error"; message: string };

/**
 * Issues a verification token for a user.
 * Enforces cooldown, invalidates prior tokens, and persists the new one.
 *
 * @param bypassCooldown - Used by /genurl (admin override)
 */
export async function issueTokenForUser(params: {
  userId: string;
  guildId: string;
  createdBy: string;
  command: "verify" | "genurl";
  bypassCooldown: boolean;
}): Promise<IssueTokenResult> {
  try {
    const { userId, guildId, createdBy, command, bypassCooldown } = params;

    // Check cooldown (unless bypassed by admin)
    if (!bypassCooldown) {
      const cooldownResult = await checkCooldown(userId, guildId);
      if (cooldownResult.onCooldown) {
        return {
          ok: false,
          reason: "cooldown",
          retryAfterSeconds: cooldownResult.retryAfterSeconds,
        };
      }
    }

    // Invalidate any existing pending tokens
    const invalidatedCount = await invalidatePendingTokensForUser(userId, guildId);
    const isRegenerated = invalidatedCount > 0;

    // Generate raw token (never stored)
    const rawToken = generateSecureToken(config.tokens.bytesOfEntropy);

    // Calculate expiry
    const expiresAt = new Date(
      Date.now() + config.tokens.expirySeconds * 1000
    );

    // Persist hashed token
    const token = await createToken({
      rawToken,
      userId,
      guildId,
      createdBy,
      generatedByCommand: command,
      isRegenerated,
      expiresAt,
    });

    return { ok: true, rawToken, token, isRegenerated };
  } catch (err) {
    console.error("[VeriFry] issueTokenForUser error:", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ──────────────────────────────────────────────
// Token validation (used on verification page)
// ──────────────────────────────────────────────

export type ValidateTokenResult =
  | { valid: true; token: VerificationToken }
  | { valid: false; reason: "not_found" | "expired" | "used" | "invalid" };

export async function validateToken(
  rawToken: string
): Promise<ValidateTokenResult> {
  const tokenHash = await hashToken(rawToken);
  const token = await getTokenByHash(tokenHash);

  if (!token) {
    return { valid: false, reason: "not_found" };
  }

  if (token.status === "used") {
    return { valid: false, reason: "used" };
  }

  if (
    token.status === "expired" ||
    token.status === "invalidated" ||
    new Date(token.expires_at) < new Date()
  ) {
    return { valid: false, reason: "expired" };
  }

  if (token.status !== "pending") {
    return { valid: false, reason: "invalid" };
  }

  return { valid: true, token };
}

/**
 * Atomically consumes a token, returning false if it was already consumed
 * (race condition protection for double-submit).
 */
export async function consumeToken(
  tokenId: string
): Promise<{ success: boolean }> {
  return markTokenUsed(tokenId);
}

// ──────────────────────────────────────────────
// Cooldown check
// ──────────────────────────────────────────────

async function checkCooldown(
  userId: string,
  guildId: string
): Promise<{ onCooldown: boolean; retryAfterSeconds: number }> {
  const recent = await getMostRecentTokenForUser(userId, guildId);

  if (!recent) {
    return { onCooldown: false, retryAfterSeconds: 0 };
  }

  const createdAt = new Date(recent.created_at).getTime();
  const cooldownMs = config.tokens.cooldownSeconds * 1000;
  const elapsed = Date.now() - createdAt;

  if (elapsed < cooldownMs) {
    return {
      onCooldown: true,
      retryAfterSeconds: Math.ceil((cooldownMs - elapsed) / 1000),
    };
  }

  return { onCooldown: false, retryAfterSeconds: 0 };
}

// ──────────────────────────────────────────────
// Build verification URL
// ──────────────────────────────────────────────

export function buildVerificationUrl(rawToken: string): string {
  return `${env.baseUrl}/v/${rawToken}`;
}
