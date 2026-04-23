// src/lib/discord/handlers/genurl.ts
// Handles the /genurl {user} admin command.
// Generates a verification URL for a specified user.
// Only members with a configured admin role can use this command.

import { config } from "@/lib/config";
import { writeAuditLog } from "@/lib/db/events";
import { issueTokenForUser, buildVerificationUrl } from "@/lib/tokens";
import { ephemeralResponse } from "@/lib/discord/client";
import type { DiscordInteraction } from "@/types";

export async function handleGenurlCommand(
  interaction: DiscordInteraction
): Promise<Response> {
  const actor = interaction.member?.user ?? interaction.user;
  if (!actor) {
    return jsonResponse(ephemeralResponse("Could not identify your user account."));
  }

  // Admin role check
  const memberRoles = interaction.member?.roles ?? [];
  const isAdmin = config.discord.adminRoleIds.some((r) => memberRoles.includes(r));
  if (!isAdmin) {
    await writeAuditLog({
      eventType: "admin_genurl",
      actorId: actor.id,
      metadata: { denied: true, reason: "missing_admin_role" },
      guildId: interaction.guild_id ?? config.discord.guildId,
    });
    return jsonResponse(
      ephemeralResponse("You do not have permission to use this command.")
    );
  }

  // Extract the target user option
  const targetOption = interaction.data?.options?.find((o) => o.name === "user");
  if (!targetOption || typeof targetOption.value !== "string") {
    return jsonResponse(ephemeralResponse("Please specify a user."));
  }

  const targetUserId = targetOption.value;
  const guildId = interaction.guild_id ?? config.discord.guildId;

  const result = await issueTokenForUser({
    userId: targetUserId,
    guildId,
    createdBy: actor.id,
    command: "genurl",
    bypassCooldown: true, // Admins bypass the cooldown
  });

  if (!result.ok) {
    return jsonResponse(
      ephemeralResponse(`Failed to generate URL: ${result.reason}`)
    );
  }

  const url = buildVerificationUrl(result.rawToken);

  await writeAuditLog({
    eventType: result.isRegenerated ? "token_regenerated" : "token_created",
    actorId: actor.id,
    targetId: targetUserId,
    tokenId: result.token.id,
    metadata: { command: "genurl" },
    guildId,
  });

  return jsonResponse(
    ephemeralResponse(
      `Verification link generated for <@${targetUserId}>.\n\n` +
        `${url}\n\n` +
        `This link expires in ${config.tokens.expirySeconds / 60} minutes. ` +
        `${result.isRegenerated ? "Their previous token was invalidated." : ""}`
    )
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
