-- ════════════════════════════════════════════════════════════════════════
-- COMPREHENSIVE BUCKET CAP AUDIT — 2026-04-29
-- ════════════════════════════════════════════════════════════════════════
-- Set every bucket's file_size_limit EXPLICITLY based on its purpose +
-- observed usage. NEVER leave a bucket at NULL — NULL silently falls back
-- to the project-level cap, and history shows that's exactly how the
-- social-media 413 bug was introduced (migration 20260422 set NULL with a
-- wrong-comment claiming it meant "unlimited").
--
-- Project-level cap was raised to 50GB on 2026-04-29 in dashboard.
-- Bucket caps must be ≤ project cap to be effective.
--
-- TIERS
--   50 GB — video-capable buckets (long videos, recordings, transfers)
--   25 MB — high-res image / mixed-media buckets (panoramas, hi-res photos)
--   10 MB — small image buckets (avatars, logos, UI icons)
--
-- BUCKETS_NOT_TOUCHED — already correctly set today:
--   social-media    50GB (set by 20260429_social_media_bucket_5gb_explicit_limit
--                          then bumped by 20260429_bump_social_media_and_live_recordings_to_50gb)
--   live-recordings 50GB (same)

-- ── Tier 1: VIDEO-CAPABLE → 50 GB ──────────────────────────────────────
UPDATE storage.buckets SET file_size_limit = 53687091200
WHERE id IN (
    'messenger_media',   -- chat media incl. videos (was 50MB)
    'user-media',        -- user profile videos (was 50MB)
    'stories',           -- short videos / status (was 50MB; iPhone HEVC 60s ≈ 75MB)
    'social-videos',     -- name says videos (was NULL)
    'public-transfer'    -- one-off generic transfers (was NULL)
);

-- ── Tier 2: HIGH-RES IMAGE / MIXED → 25 MB ─────────────────────────────
UPDATE storage.buckets SET file_size_limit = 26214400
WHERE id IN (
    'images',         -- generic images (was 10MB)
    'media',          -- generic media (was 10MB)
    'uploads',        -- generic uploads (was 10MB) — Dan: too low
    'social-images',  -- social images (was NULL)
    'assets',         -- generic assets (was NULL)
    'social_media',   -- LEGACY underscore-name bucket — image-only (was 5MB, 0 objects)
    'user-covers',    -- cover photos can be larger (was NULL)
    'venue-logos'     -- some venue logos are 9MB+ already (was NULL)
);

-- ── Tier 3: AVATAR / LOGO / UI → 10 MB ─────────────────────────────────
UPDATE storage.buckets SET file_size_limit = 10485760
WHERE id IN (
    'avatars',         -- user avatars (was NULL)
    'custom-avatars',  -- custom avatars (was NULL)
    'user-avatars',    -- user avatars (was NULL)
    'club-logos',      -- club logos (was NULL)
    'series-logos',    -- tournament series logos (was NULL)
    'gto-panels',      -- GTO training UI panels (was NULL)
    'player-photos'    -- pro player photos (was 5MB)
);
