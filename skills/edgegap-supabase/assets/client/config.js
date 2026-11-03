// Supabase project settings: Project Settings > API Keys in the Supabase dashboard (or
// `npx supabase status` for a local stack). Put your own in client/config.local.js (git-ignored,
// same shape) to keep them out of commits.
//
// Both values are made to ship in browsers: the publishable key (sb_publishable_..., or the legacy
// anon key) only gets what Row Level Security allows. Never put the secret / service_role key, the
// Edgegap API token or the matchmaker token here: those live in Supabase secrets.
export default {
  supabaseUrl: "",
  supabasePublishableKey: "",
};
