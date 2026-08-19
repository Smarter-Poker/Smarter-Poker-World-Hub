-- Applied to production 2026-08-19 (name: push_type_prefs_atomic_merge).
-- Adds set_push_type_pref(), which merges push_type_prefs inside Postgres
-- (|| to set, - to clear). The API route previously did a read-modify-write with
-- the read error discarded, so a transient failure wiped every prior opt-out and
-- two quick toggles raced.
SELECT 'see supabase migration history: push_type_prefs_atomic_merge' AS note;
