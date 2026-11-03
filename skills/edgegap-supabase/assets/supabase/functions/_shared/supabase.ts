// Shared by the Edge Functions: CORS, JSON replies and the admin (service role) client.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-game-server-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}: npx supabase secrets set ${name}=...`);
  return value;
}

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected into every Edge Function by Supabase.
export const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
