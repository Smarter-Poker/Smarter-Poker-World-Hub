-- ═══════════════════════════════════════════════════════════════════════════
-- Feed poster backfill: YouTube-sourced posts -> YouTube's 1280x720 master
-- ═══════════════════════════════════════════════════════════════════════════
-- Applied to production via Supabase MCP apply_migration in two parts:
--   1. backfill_youtube_maxres_posters              (posts with a poster)
--   2. backfill_youtube_posters_for_posterless_posts (posts with none)
-- Mirrored here. Data-only; no schema change beyond the backup table.
--
-- WHY
-- The owner reported the feed as "grainy and distorted" and, after an
-- earlier capture-side fix, correctly reported that NOTHING CHANGED. He was
-- right: that fix only affected NEW client uploads, while the feed is
-- overwhelmingly YouTube-sourced content ingested by the Hetzner worker, and
-- every historical post was untouched.
--
-- Measured, not assumed. The stored posters under social-media/reels/thumbs
-- are 640x360, 608x1080, 720x406 and commonly 202x360 — they are extracted
-- at the NATIVE resolution of whatever the worker downloaded, so they
-- inherit the ingest bug. ffprobe on the stored MP4s confirms the VIDEOS are
-- 202x360 and 640x360, while YouTube holds 1280x720 masters for the very
-- same videos. At full card width on a 2-3x DPR phone a 202px-wide poster is
-- a ~5x upscale. That is the grain.
--
-- The poster is what every video tile shows until the viewer taps play, so
-- it dominates the perceived quality of the entire surface.
--
-- METHOD
-- 508 + 286 distinct YouTube ids back the corpus. EVERY id was fetched and
-- its JPEG SOF header parsed to confirm a real 1280x720 maxresdefault.jpg
-- before being written:
--   * set 1: 504 of 508 confirmed -> 4 excluded by id
--   * set 2: 148 of 286 confirmed -> 138 excluded (mostly patterned ids that
--     appear to be seeded test data and are not real YouTube videos)
-- Nothing was guessed and nothing unverified was written.
--
-- RESULT
-- 14,906 of 15,994 video posts (93.2%) now carry a verified 1280x720 poster.
-- Zero remain on a low-res ingested poster. 1,084 remain posterless (the
-- unverifiable ids and non-YouTube sources) — unchanged, no worse than before.
--
-- SCOPE / WHAT THIS DOES NOT FIX
-- The underlying 360p VIDEO is untouched. Root cause is the ingest worker on
-- Hetzner pulling a low-resolution format (almost certainly falling back to
-- muxed format 18 = 640x360 when the adaptive formats need a po_token).
-- Fixing that requires deploying scripts/yt-transcode-worker + the
-- bgutil-pot-provider on Hetzner, which needs SSH this agent does not have.
-- Tracked separately.
--
-- ROLLBACK
--   UPDATE public.social_posts p
--      SET thumbnail_url = b.old_thumbnail_url
--     FROM public.social_posts_thumbnail_backup_20260815 b
--    WHERE p.id = b.post_id;
-- Every overwritten value was captured first in that table (RLS enabled,
-- all client grants revoked).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.social_posts_thumbnail_backup_20260815 (
    post_id uuid PRIMARY KEY,
    old_thumbnail_url text,
    backed_up_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.social_posts_thumbnail_backup_20260815 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.social_posts_thumbnail_backup_20260815 FROM PUBLIC;
REVOKE ALL ON TABLE public.social_posts_thumbnail_backup_20260815 FROM anon;
REVOKE ALL ON TABLE public.social_posts_thumbnail_backup_20260815 FROM authenticated;

-- Part 1 rewrote thumbnail_url from original_media_url for every YouTube
-- post except 4 unverified ids; part 2 did the same from media_urls[0] for
-- the posterless remainder, restricted to 148 verified ids. Both INSERTed
-- the prior value into the backup table first. The full id lists live in the
-- applied migrations and in
-- .agent/audits/2026-08-15-feed-poster-backfill.md.
