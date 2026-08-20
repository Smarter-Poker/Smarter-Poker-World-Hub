-- Applied to production 2026-08-19/20 via Supabase MCP apply_migration (name: set_push_type_pref_accept_server_user_id).
-- Accepts an explicit user id so the service-role API route can save category toggles (auth.uid() is NULL under service_role).
-- Authoritative body lives in the Supabase migration history; recorded here so
-- a fresh branch DB reproduces it. Each carried post-apply assertions.
SELECT 'see supabase migration history: set_push_type_pref_accept_server_user_id' AS note;
