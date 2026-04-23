# VeriFry

A production-ready Discord verification system hosted on Vercel. No always-online bot. No Gateway connection. Pure HTTP interactions + a secure verification website backed by Supabase.

---

## Architecture Overview

```
Discord User
    │
    │  /verify or /genurl
    ▼
Discord API ──► POST /api/interactions  (Vercel serverless)
                        │
                        │  Verify Ed25519 signature
                        │  Route to command handler
                        │  Issue token (hashed) → Supabase
                        │  Return ephemeral URL to user
                        ▼
              User opens /v/[token]  (Vercel serverless page)
                        │
                        │  Validate token (server-side)
                        │  Render verification page
                        │
                        │  (Client collects fingerprint)
                        │
                        ▼
              POST /api/v  (Vercel serverless)
                        │
                        ├── Validate token (atomic mark-used)
                        ├── Collect IP, headers, UA
                        ├── Run VPN/proxy check (IPQS)
                        ├── Hash & store fingerprint
                        ├── Write verification_events → Supabase
                        ├── Write audit_log → Supabase
                        └── POST embed → Discord admin channel
                                        (admin reviews manually)
```

### Key Design Decisions

- **No Gateway bot**: All Discord interaction is via HTTP. Commands are registered once and handled as webhooks. Zero always-online infrastructure.
- **Token hashing**: Raw tokens are never stored. Only a SHA-256 hash is persisted. The raw token exists only in the URL and the user's clipboard.
- **Atomic token consumption**: `markTokenUsed` only updates rows where `status = 'pending'`, preventing double-submit races at the database level.
- **Cooldown via DB**: Cooldown is enforced by checking the `created_at` timestamp of the most recent token, regardless of whether it was used. Admins bypass it.
- **No automatic role assignment**: The system sends a full report to an admin channel. Admins review and assign roles manually — this is intentional.
- **Graceful VPN check failure**: If IPQS is misconfigured or times out, verification still completes. The error is noted in the event record.
- **Discord report retry**: Up to 3 attempts with exponential backoff. If all fail, the event is still saved with a failure note — no data is lost.

---

## Folder Structure

```
verifry/
├── config.json                         # Non-secret settings (guild IDs, cooldowns, etc.)
├── .env.example                        # Template for environment variables
├── schema.sql                          # Supabase database schema
├── vercel.json                         # Vercel deployment config
├── scripts/
│   └── register-commands.ts            # One-time Discord command registration
└── src/
    ├── types/
    │   └── index.ts                    # All shared TypeScript types
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── globals.css
    │   ├── api/
    │   │   ├── interactions/
    │   │   │   └── route.ts            # Discord interactions endpoint
    │   │   └── v/
    │   │       └── route.ts            # Verification submission endpoint
    │   └── v/
    │       └── [token]/
    │           ├── page.tsx            # Server component — validates token
    │           ├── VerificationClient.tsx  # Client — fingerprint + submit
    │           └── verification.module.css
    └── lib/
        ├── config/
        │   └── index.ts                # Config + env loader with validation
        ├── db/
        │   ├── client.ts               # Supabase service-role client
        │   ├── tokens.ts               # Token CRUD operations
        │   └── events.ts               # Verification events + audit log
        ├── discord/
        │   ├── client.ts               # Discord REST wrapper + embed builder
        │   └── handlers/
        │       ├── verify.ts           # /verify command
        │       ├── genurl.ts           # /genurl command
        │       └── unverify.ts         # /unverify command
        ├── tokens/
        │   └── index.ts                # Token lifecycle: issue, validate, consume
        ├── fingerprint/
        │   ├── index.ts                # Server-side fingerprint processing
        │   └── device-parser.ts        # UA → DeviceDetails parser
        ├── vpn/
        │   └── index.ts                # IPQS VPN/proxy detection
        └── security/
            └── index.ts                # Token gen, hashing, Discord sig verify, IP extract
```

---

## Setup Guide

### 1. Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and create a new application.
2. Under **Bot**, create a bot and copy the **Bot Token** → `DISCORD_BOT_TOKEN`
3. Under **General Information**, copy:
   - **Application ID** → `DISCORD_APPLICATION_ID`
   - **Public Key** → `DISCORD_PUBLIC_KEY`
4. Under **Bot > Privileged Gateway Intents**: no intents are needed (no Gateway connection).
5. Invite the bot to your server with `applications.commands` scope (no other permissions needed to send messages to a channel — add `Send Messages` if using the bot token to post reports).

### 2. Supabase

1. Create a new Supabase project.
2. Go to **SQL Editor** and run the contents of `schema.sql`.
3. Copy your **Project URL** → `SUPABASE_URL`
4. Under **Project Settings > API**, copy the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

> The service_role key bypasses Row Level Security. Keep it server-side only.

### 3. IPQualityScore (optional)

1. Sign up at [ipqualityscore.com](https://www.ipqualityscore.com) (free tier: 5,000 lookups/month).
2. Copy your API key → `IPQS_API_KEY`
3. If you skip this, VPN detection will be disabled but verification still works.

### 4. config.json

Fill in the Discord IDs in `config.json`:

```json
{
  "discord": {
    "guildId": "your_server_id",
    "verificationChannelId": "your_private_admin_channel_id",
    "verifiedRoleId": "your_verified_role_id",
    "adminRoleIds": ["your_admin_role_id"]
  }
}
```

To find IDs: Enable Developer Mode in Discord → right-click → Copy ID.

### 5. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables
vercel env add DISCORD_APPLICATION_ID
vercel env add DISCORD_BOT_TOKEN
vercel env add DISCORD_PUBLIC_KEY
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add IPQS_API_KEY
vercel env add NEXT_PUBLIC_BASE_URL   # e.g. https://verifry.vercel.app
```

### 6. Register Discord Commands

```bash
DISCORD_APPLICATION_ID=xxx DISCORD_BOT_TOKEN=yyy npm run register-commands
```

### 7. Set Interactions Endpoint URL

In the Discord Developer Portal → your app → **General Information**:

Set **Interactions Endpoint URL** to:

```
https://your-deployment.vercel.app/api/interactions
```

Discord will send a `PING` to verify it. Your endpoint will respond with `PONG` automatically.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DISCORD_APPLICATION_ID` | Yes | Discord app ID |
| `DISCORD_BOT_TOKEN` | Yes | Bot token for REST API calls |
| `DISCORD_PUBLIC_KEY` | Yes | Ed25519 public key for signature verification |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only) |
| `IPQS_API_KEY` | No | IPQualityScore API key for VPN detection |
| `NEXT_PUBLIC_BASE_URL` | Yes | Base URL of the Vercel deployment |

---

## Database Tables

| Table | Purpose |
|---|---|
| `verification_tokens` | Stores hashed tokens, expiry, status |
| `verification_events` | Full record of each completed verification |
| `audit_log` | Immutable log of all system events |
| `blacklist_entries` | Future: block IPs, fingerprints, or users |

---

## Verification Flow (Step by Step)

```
1. User runs /verify in Discord
2. Bot checks cooldown (last token created_at + cooldown window)
3. If on cooldown → ephemeral "try again in X minutes"
4. Invalidate any existing pending tokens for this user
5. Generate 32 bytes of crypto-random entropy, encode as base64url
6. Hash with SHA-256, store hash + metadata in verification_tokens
7. Return ephemeral message with URL: https://[base]/v/[raw_token]

8. User opens URL in browser
9. Server validates token (hash lookup → check status + expiry)
10. If invalid/expired/used → show appropriate error page
11. If valid → render verification page

12. User clicks "Complete Verification"
13. Client collects fingerprint (canvas, WebGL, screen, UA, etc.)
14. Client POSTs { token, fingerprint } to /api/v

15. Server re-validates token
16. Atomically marks token as used (UPDATE WHERE status='pending')
17. If already used (race) → return 409
18. Extracts real IP from proxy headers
19. Runs IPQS VPN/proxy check (async, 5s timeout)
20. Processes fingerprint, parses UA → DeviceDetails
21. Writes verification_event to Supabase
22. Builds full embed with all collected data + risk notes
23. POSTs embed to admin Discord channel (3 retries, exp backoff)
24. If Discord fails → marks event with failure note, continues
25. Writes audit_log entry
26. Returns success to client → shows success page
```

---

## Edge Cases & Failure Handling

| Scenario | Handling |
|---|---|
| Token expired before page load | Server renders error page immediately (no JS needed) |
| Token used between page load and submit | Atomic UPDATE guard returns 409; client shows "already used" |
| VPN check API timeout | Verification continues; `vpnResult.error = true` stored |
| Discord report fails all 3 attempts | Event still saved; `discord_report_sent = false`; `admin_notes` has error detail |
| User reloads success page | Token is already `used`; submit endpoint returns 409 harmlessly |
| Cooldown bypass by admin | `/genurl` always bypasses; prior token invalidated atomically |
| Bot signals in UA | Flagged in `riskNotes` on report; no automatic block |
| User runs /verify twice quickly | Second call sees cooldown from first token's `created_at` |
| Admin runs /genurl for same user | Cooldown bypassed; previous pending token invalidated first |
| Private/localhost IP (dev) | VPN check skipped gracefully; event saved with note |
| Malformed fingerprint payload | API returns 400; token remains pending; user can retry |

---

## Security Notes

- **Token entropy**: 32 bytes = 256 bits via `crypto.randomBytes`. Brute-forcing is computationally infeasible.
- **Token storage**: Only SHA-256 hashes are persisted. A database breach does not expose usable tokens.
- **Signature verification**: Every interaction request is verified with the Discord Ed25519 public key before any business logic runs.
- **RLS**: All Supabase tables have `deny_all` RLS policies. Only the service_role key (server-side only) can read or write.
- **IP extraction**: Checks `x-real-ip` (Vercel), `cf-connecting-ip` (Cloudflare), then `x-forwarded-for` first element — not blindly trusting the chain.
- **Header storage**: Only an allowlisted subset of headers is stored. Authorization and cookie headers are never persisted.
- **config.json vs .env**: Secrets (tokens, keys) are in `.env`. Non-secret settings (IDs, durations) are in `config.json` so they can be reviewed in source control without risk.
# VeriFried-bot
# VeriFried-bot
# VeriFried-bot
