-- ═══════════════════════════════════════════════════════════════════════
-- 20260820233500_backfill_avatar_urls_to_optimized_derivatives.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (1 = doc-only, 2 = additive, 3 = destructive)
-- AUTHOR:      Cowork (Claude)
-- AFFECTS:     tables: public.profiles (avatar_url)   rpcs: -   rls: -   triggers: -
-- IRREVERSIBLE: no                            (see ROLLBACK at the bottom)
--
-- WHY:
--   167 profiles hold a raw preset avatar path — /avatars/vip/<slug>.png or
--   /avatars/free/<slug>.png. Those files are 1024x1024 and about 1.1 MB each.
--   They are rendered at roughly 48px in every seat at every table, so a full
--   nine-handed table pulls on the order of 10 MB of avatars. The Hub already
--   generates a 250x340 WebP of every one of them (about 19 KB, ~60x lighter)
--   for exactly this purpose. Handoff .agent/handoffs/2026-08-20-avatar-theme-followups.md,
--   item P0-2.
--
--   This supersedes 20260822211500_backfill_avatar_urls.sql, which was
--   committed but never applied (it is absent from
--   supabase_migrations.schema_migrations) and which had two problems:
--
--     1. Its filename was dated 20260822, two days ahead of the series it
--        belongs to — the same misdating that 83fe4cd61c had just finished
--        correcting across fourteen other migrations.
--     2. It rewrote /avatars/free/rabbit.png to /avatars/table/free_rabbit@2x.webp.
--        Neither file exists. The rabbit artwork was deleted in 2b176e7a56
--        because the library entry pointing at it had never resolved. Four
--        profiles still hold that dead path and are showing a broken avatar
--        right now; the old migration would have carried the breakage forward
--        into a different dead path instead of fixing it.
--
-- HOW (high level):
--   - First repoint the four dead rabbit rows onto the artwork its library
--     entry was repointed to in 2b176e7a56 (free-animal-002 -> viking).
--   - Then rewrite every remaining raw preset path to its @2x.webp derivative.
--   - The second UPDATE in the superseded migration (social-media bucket URLs
--     shaped vip_<slug>.png) is retained for completeness. It currently
--     matches zero rows; verified by dry-run before writing this.
--   - Custom uploads, external OAuth photos, data URIs and NULLs are not
--     touched by either pattern.
--
-- All 62 distinct target paths were probed against production before this was
-- written: 61 returned 200, the 62nd was free_rabbit@2x.webp, handled above.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name = 'avatar_url'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.profiles.avatar_url not found';
    END IF;

    -- If a previous run already landed, there is nothing raw left to convert
    -- and the post-apply assertion below would be trivially true. Say so.
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE avatar_url ~* '^/avatars/(vip|free)/[^/\.]+\.png$'
    ) THEN
        RAISE NOTICE 'pre-flight: no raw preset avatar paths remain; this is a no-op';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────

-- 2a. The four rows pointing at deleted rabbit artwork. Their library entry
--     (free-animal-002) was repointed to viking.png in 2b176e7a56; these rows
--     follow it rather than being rewritten to an equally dead webp.
UPDATE public.profiles
SET avatar_url = '/avatars/table/free_viking@2x.webp'
WHERE avatar_url = '/avatars/free/rabbit.png';

-- 2b. Every remaining raw preset PNG -> its 250x340 WebP derivative.
UPDATE public.profiles
SET avatar_url = regexp_replace(
        avatar_url,
        '^/avatars/(vip|free)/([^/\.]+)\.png$',
        '/avatars/table/\1_\2@2x.webp',
        'i'
    )
WHERE avatar_url ~* '^/avatars/(vip|free)/[^/\.]+\.png$';

-- 2c. Storage-bucket form of the same thing. Zero rows match today; kept so a
--     row arriving in this shape later is handled the same way.
UPDATE public.profiles
SET avatar_url = regexp_replace(
        avatar_url,
        '^.*/social-media/avatars/(vip|free)_([^/\.]+)\.(png|jpg|jpeg|webp)$',
        '/avatars/table/\1_\2@2x.webp',
        'i'
    )
WHERE avatar_url ~* '^.*/social-media/avatars/(vip|free)_[^/\.]+\.(png|jpg|jpeg|webp)$';

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    raw_left     integer;
    rabbit_left  integer;
BEGIN
    SELECT count(*) INTO raw_left
    FROM public.profiles
    WHERE avatar_url ~* '^/avatars/(vip|free)/[^/\.]+\.png$';

    IF raw_left <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % profile(s) still hold a raw preset PNG path', raw_left;
    END IF;

    SELECT count(*) INTO rabbit_left
    FROM public.profiles
    WHERE avatar_url LIKE '%rabbit%';

    IF rabbit_left <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % profile(s) still point at deleted rabbit artwork', rabbit_left;
    END IF;
END $$;

COMMIT;

-- ─── ROLLBACK ─────────────────────────────────────────────────────────
-- Reverses 2b/2c. It cannot distinguish the four rows that were rabbit from
-- genuine viking pickers, so those stay on viking — which is correct, since
-- the rabbit artwork no longer exists to go back to.
--
--   UPDATE public.profiles
--   SET avatar_url = regexp_replace(
--           avatar_url,
--           '^/avatars/table/(vip|free)_([^/\.]+)@2x\.webp$',
--           '/avatars/\1/\2.png',
--           'i'
--       )
--   WHERE avatar_url ~* '^/avatars/table/(vip|free)_[^/\.]+@2x\.webp$';
