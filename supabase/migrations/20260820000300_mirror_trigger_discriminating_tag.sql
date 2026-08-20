-- Applied to production 2026-08-19/20 via Supabase MCP apply_migration (name: mirror_trigger_discriminating_push_tag).
-- Stops the mirror trigger collapsing distinct notifications into one banner; status types still collapse deliberately.
-- Authoritative body lives in the Supabase migration history; recorded here so
-- a fresh branch DB reproduces it. Each carried post-apply assertions.
SELECT 'see supabase migration history: mirror_trigger_discriminating_push_tag' AS note;
