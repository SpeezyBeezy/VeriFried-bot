// src/lib/discord/handlers/unverify.ts
// Handles the /unverify {user} admin command.
// Removes a user's verification record and allows them to re-verify.

import { config } from "@/lib/config";
import { writeAuditLog } from "@/lib/db/events";
import { deleteUserTokensAndEvents } from "@/lib/db/tokens";
import { ephemeralResponse } from "@/lib/discord/client";
import type { DiscordInteraction } from "@/types";

export async function handleUnverifyCommand(
  interaction: DiscordInteraction
): Promise<Response> {
  const actor = interaction.member?.user ?? interaction.user;
  if (!actor) {
    return jsonResponse(ephemeralResponse("Could not identify your user account."));
  }

  const memberRoles = interaction.member?.roles ?? [];
  const isAdmin = config.discord.adminRoleIds.some((r) => memberRoles.includes(r));
  if (!isAdmin) {
    return jsonResponse(
      ephemeralResponse("You do not have permission to use this command.")
    );
  }

  const targetOption = interaction.data?.options?.find((o) => o.name === "user");
  if (!targetOption || typeof targetOption.value !== "string") {
    return jsonResponse(ephemeralResponse("Please specify a user."));
  }

  const targetUserId = targetOption.value;
  const guildId = interaction.guild_id ?? config.discord.guildId;

  await deleteUserTokensAndEvents(targetUserId, guildId);

  await writeAuditLog({
    eventType: "admin_unverify",
    actorId: actor.id,
    targetId: targetUserId,
    metadata: {},
    guildId,
  });

  return jsonResponse(
    ephemeralResponse(
      `User <@${targetUserId}> has been unverified. ` +
        `Their tokens have been invalidated and they may re-verify. ` +
        `Remember to remove the verified role in Discord manually.`
    )
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
