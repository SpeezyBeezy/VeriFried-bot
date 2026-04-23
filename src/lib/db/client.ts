// src/lib/db/client.ts
// Single Supabase client instance using the service role key.
// This must ONLY be used in server-side code (API routes, server components).
// Never expose the service role key to the client.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config";

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        // Service role key bypasses RLS — keep it server-only
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _client;
}
