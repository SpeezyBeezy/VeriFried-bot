// src/app/api/interactions/route.ts
// Discord interactions endpoint.
// Receives slash commands via HTTP POST.
// Protected by Ed25519 signature verification.

import { NextRequest } from "next/server";
import { env } from "@/lib/config";
import { verifyDiscordSignature } from "@/lib/security";
import { handleVerifyCommand } from "@/lib/discord/handlers/verify";
import { handleGenurlCommand } from "@/lib/discord/handlers/genurl";
import { handleUnverifyCommand } from "@/lib/discord/handlers/unverify";
import { pongResponse } from "@/lib/discord/client";
import { writeAuditLog } from "@/lib/db/events";
import type { DiscordInteraction } from "@/types";

// Discord interaction types
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
} as const;

export async function POST(req: NextRequest): Promise<Response> {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const rawBody = await req.text();

  // Signature check is mandatory per Discord requirements
  if (!signature || !timestamp) {
    return new Response("Missing signature headers", { status: 401 });
  }

  const isValid = verifyDiscordSignature(
    env.discordPublicKey,
    signature,
    timestamp,
    rawBody
  );

  if (!isValid) {
    await writeAuditLog({
      eventType: "signature_verification_failed",
      actorId: "unknown",
      metadata: { signature, timestamp: timestamp },
      guildId: "unknown",
      ipAddress: req.headers.get("x-real-ip") ?? undefined,
    }).catch(() => {}); // Fire and forget, don't throw

    return new Response("Invalid request signature", { status: 401 });
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Discord PING — required for endpoint registration
  if (interaction.type === InteractionType.PING) {
    return new Response(JSON.stringify(pongResponse()), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const commandName = interaction.data?.name?.toLowerCase();

    switch (commandName) {
      case "verify":
        return handleVerifyCommand(interaction);
      case "genurl":
        return handleGenurlCommand(interaction);
      case "unverify":
        return handleUnverifyCommand(interaction);
      default:
        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "Unknown command.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } }
        );
    }
  }

  return new Response("Unhandled interaction type", { status: 400 });
}

// Vercel requires the raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};
