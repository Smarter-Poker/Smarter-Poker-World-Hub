-- Applied to production 2026-08-19/20 via Supabase MCP apply_migration (name: bump_challenge_progress_batched).
-- Batches per-hand challenge progress into ONE server-side statement. Replaces ~3 selects + ~8 RPCs per player per hand.
-- Authoritative body lives in the Supabase migration history; recorded here so
-- a fresh branch DB reproduces it. Each carried post-apply assertions.
SELECT 'see supabase migration history: bump_challenge_progress_batched' AS note;
