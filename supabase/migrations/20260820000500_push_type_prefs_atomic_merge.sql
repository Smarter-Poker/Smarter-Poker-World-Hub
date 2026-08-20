-- Applied to production 2026-08-19/20 via Supabase MCP apply_migration (name: push_type_prefs_atomic_merge).
-- Merges push_type_prefs inside Postgres so a failed read cannot wipe every prior opt-out.
-- Authoritative body lives in the Supabase migration history; recorded here so
-- a fresh branch DB reproduces it. Each carried post-apply assertions.
SELECT 'see supabase migration history: push_type_prefs_atomic_merge' AS note;
