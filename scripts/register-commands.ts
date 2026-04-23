// scripts/register-commands.ts
// Run once (or after command changes) to register slash commands with Discord.
// Usage: npm run register-commands
//
// This uses the Guild Commands endpoint for instant registration.
// To deploy globally (1hr propagation), remove the guildId from the URL.

import rawConfig from "../config.json";

const DISCORD_API = "https://discord.com/api/v10";

const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = rawConfig.discord.guildId;

if (!APPLICATION_ID || !BOT_TOKEN) {
  console.error(
    "Missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN environment variables.\n" +
    "Run: DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... npm run register-commands"
  );
  process.exit(1);
}

const commands = [
  {
    name: "verify",
    description: "Request a one-time verification link for yourself.",
    dm_permission: false,
  },
  {
    name: "genurl",
    description: "Generate a verification link for another user (admin only).",
    dm_permission: false,
    options: [
      {
        name: "user",
        description: "The user to generate a verification link for.",
        type: 6, // USER type
        required: true,
      },
    ],
  },
  {
    name: "unverify",
    description: "Remove a user's verification record (admin only).",
    dm_permission: false,
    options: [
      {
        name: "user",
        description: "The user to unverify.",
        type: 6, // USER type
        required: true,
      },
    ],
  },
];

async function registerCommands() {
  const url = `${DISCORD_API}/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/commands`;

  console.log(`Registering ${commands.length} commands to guild ${GUILD_ID}...`);

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Failed to register commands (HTTP ${res.status}):\n${body}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log("Commands registered successfully:");
  for (const cmd of data) {
    console.log(`  /${cmd.name}  (id: ${cmd.id})`);
  }
}

registerCommands();
