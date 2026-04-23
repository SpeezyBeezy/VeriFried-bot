// src/lib/discord/handlers/verify.ts
// Handles the /verify slash command.
// Issues a one-time verification URL for the command user.

import { config } from "@/lib/config";
import { writeAuditLog } from "@/lib/db/events";
import { issueTokenForUser, buildVerificationUrl } from "@/lib/tokens";
import { ephemeralResponse } from "@/lib/discord/client";
import type { DiscordInteraction } from "@/types";

export async function handleVerifyCommand(
  interaction: DiscordInteraction
): Promise<Response> {
  const user = interaction.member?.user ?? interaction.user;
  if (!user) {
    return jsonResponse(ephemeralResponse("Could not identify your user account."));
  }

  const guildId = interaction.guild_id ?? config.discord.guildId;

  const result = await issueTokenForUser({
    userId: user.id,
    guildId,
    createdBy: "self",
    command: "verify",
    bypassCooldown: false,
  });

  if (!result.ok) {
    if (result.reason === "cooldown") {
      const minutes = Math.ceil(result.retryAfterSeconds / 60);
      return jsonResponse(
        ephemeralResponse(
          `You already requested a verification link recently. ` +
            `Please wait ${minutes} minute(s) before requesting a new one.`
        )
      );
    }

    await writeAuditLog({
      eventType: "verification_failure_invalid",
      actorId: user.id,
      metadata: { error: result.message },
      guildId,
    });

    return jsonResponse(
      ephemeralResponse("An error occurred while generating your link. Please try again.")
    );
  }

  const url = buildVerificationUrl(result.rawToken);

  await writeAuditLog({
    eventType: result.isRegenerated ? "token_regenerated" : "token_created",
    actorId: user.id,
    tokenId: result.token.id,
    metadata: { command: "verify" },
    guildId,
  });

  return jsonResponse(
    ephemeralResponse(
      `Your verification link is ready. It expires in ${config.tokens.expirySeconds / 60} minutes.\n\n` +
        `${url}\n\n` +
        `Do not share this link — it is tied to your account. ` +
        `An admin will review your submission and assign your role.`
    )
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
