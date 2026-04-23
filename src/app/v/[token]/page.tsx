// src/app/v/[token]/page.tsx
// Server-side rendered verification page.
// Validates the token on load and passes state to the client component.

import { validateToken } from "@/lib/tokens";
import { VerificationClient } from "./VerificationClient";
import type { VerificationPageState } from "@/types";

interface Props {
  params: { token: string };
}

export default async function VerificationPage({ params }: Props) {
  const { token } = params;

  let state: VerificationPageState;

  if (!token || token.length < 20) {
    state = { status: "invalid", message: "This verification link is invalid." };
  } else {
    const result = await validateToken(token);

    if (!result.valid) {
      const messages = {
        not_found: "This verification link is invalid.",
        expired: "This verification link has expired. Please return to Discord and use /verify to request a new one.",
        used: "This verification link has already been used.",
        invalid: "This verification link is not valid.",
      };
      state = { status: result.reason === "used" ? "used" : result.reason === "expired" ? "expired" : "invalid", message: messages[result.reason] };
    } else {
      state = {
        status: "valid",
        discordUserId: result.token.user_id,
        message: "Please complete the verification below.",
      };
    }
  }

  return <VerificationClient rawToken={token} initialState={state} />;
}

export const dynamic = "force-dynamic";
