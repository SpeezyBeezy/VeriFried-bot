// src/lib/db/tokens.ts
// All database operations for verification_tokens.

import { getSupabaseClient } from "./client";
import type { TokenStatus, VerificationToken } from "@/types";
import { hashToken } from "@/lib/security";

const TABLE = "verification_tokens";

export async function getTokenByHash(
  tokenHash: string
): Promise<VerificationToken | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("token_hash", tokenHash)
    .single();

  if (error || !data) return null;
  return data as VerificationToken;
}

export async function getActiveTokenForUser(
  userId: string,
  guildId: string
): Promise<VerificationToken | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("guild_id", guildId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as VerificationToken;
}

/**
 * Returns the most recently created token for the user, regardless of status.
 * Used to enforce the cooldown window.
 */
export async function getMostRecentTokenForUser(
  userId: string,
  guildId: string
): Promise<VerificationToken | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as VerificationToken;
}

export async function createToken(params: {
  rawToken: string;
  userId: string;
  guildId: string;
  createdBy: string;
  generatedByCommand: "verify" | "genurl";
  isRegenerated: boolean;
  expiresAt: Date;
}): Promise<VerificationToken> {
  const db = getSupabaseClient();
  const tokenHash = await hashToken(params.rawToken);

  const row = {
    token_hash: tokenHash,
    user_id: params.userId,
    guild_id: params.guildId,
    expires_at: params.expiresAt.toISOString(),
    status: "pending" as TokenStatus,
    created_by: params.createdBy,
    generated_by_command: params.generatedByCommand,
    is_regenerated: params.isRegenerated,
  };

  const { data, error } = await db
    .from(TABLE)
    .insert(row)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create token: ${error?.message}`);
  }

  return data as VerificationToken;
}

/**
 * Invalidates all pending tokens for a user before issuing a new one.
 * Returns the count of invalidated tokens.
 */
export async function invalidatePendingTokensForUser(
  userId: string,
  guildId: string
): Promise<number> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from(TABLE)
    .update({ status: "invalidated" })
    .eq("user_id", userId)
    .eq("guild_id", guildId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    throw new Error(`Failed to invalidate tokens: ${error.message}`);
  }

  return data?.length ?? 0;
}

/**
 * Atomically marks a token as used. Returns false if the token was already used,
 * preventing double-submission races.
 */
export async function markTokenUsed(
  tokenId: string
): Promise<{ success: boolean }> {
  const db = getSupabaseClient();

  // Only update if status is still "pending" — this is the atomic guard
  const { data, error } = await db
    .from(TABLE)
    .update({
      status: "used",
      used_at: new Date().toISOString(),
    })
    .eq("id", tokenId)
    .eq("status", "pending") // Guard: only transition from pending
    .select("id");

  if (error) {
    throw new Error(`Failed to mark token used: ${error.message}`);
  }

  return { success: (data?.length ?? 0) > 0 };
}

/**
 * Sweeps expired pending tokens to "expired" status.
 * Intended to be called opportunistically, not on a cron.
 */
export async function expireStaleTokens(): Promise<void> {
  const db = getSupabaseClient();
  await db
    .from(TABLE)
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
}

export async function deleteUserTokensAndEvents(
  userId: string,
  guildId: string
): Promise<void> {
  const db = getSupabaseClient();

  // Invalidate all tokens
  await db
    .from(TABLE)
    .update({ status: "invalidated" })
    .eq("user_id", userId)
    .eq("guild_id", guildId);
}
