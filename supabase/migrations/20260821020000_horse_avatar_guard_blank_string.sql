-- ═══════════════════════════════════════════════════════════════════════
-- 20260821020000_horse_avatar_guard_blank_string.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (1 = doc-only, 2 = additive, 3 = destructive)
-- AUTHOR:      Cowork (Claude)
-- AFFECTS:     rpcs: fn_guard_horse_avatar (fixed)   tables: profiles (data)
-- IRREVERSIBLE: no                            (see ROLLBACK at the bottom)
--
-- WHY:
--   Dan, of the cashier roster: "you need to add the profile pics or avatars
--   for each account." Ten horses were showing letter initials instead of a
--   portrait, and they could not be given one.
--
--   fn_guard_horse_avatar exists to stop a horse's AI-generated PHOTO being
--   overwritten by a stock library path. Its own comment says "keep photo (or
--   stay NULL for regeneration)", so NULL is meant to be the open state. But
--   the test is:
--
--       OLD.avatar_url IS NULL OR OLD.avatar_url NOT LIKE '/avatars/%'
--
--   and an EMPTY STRING is neither NULL nor LIKE '/avatars/%'. So for a horse
--   seeded with avatar_url = '', the guard fires on every attempt to set a
--   library path and silently reverts it to ''. Not an error — the UPDATE
--   reports success and changes nothing. Those horses were locked into
--   blankness permanently, which is the exact opposite of what the guard was
--   written to do.
--
--   Ten of the platform's 584 horses are in that state, and they are the ten
--   on Dan's cashier roster. Another 16 hold NULL, which the guard already
--   treats correctly.
--
-- HOW (high level):
--   - Treat blank the same as NULL in the guard: a horse with no portrait can
--     be given one; a horse WITH a photo is still protected.
--   - Then give every horse that has no portrait a distinct library avatar,
--     using the /avatars/table/{tier}_{slug}@2x.webp derivative every other
--     horse already uses (250x340, ~19 KB).
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_guard_horse_avatar'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: fn_guard_horse_avatar not found';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_guard_horse_avatar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Protect a horse that genuinely HAS a portrait from being overwritten by a
  -- stock library path. "Has a portrait" means a non-blank value: NULL and ''
  -- both mean no portrait, and both must stay open so one can be assigned.
  -- Before this fix only NULL was open, so a horse seeded with '' could never
  -- be given an avatar and the revert was silent.
  IF NEW.is_horse IS TRUE
     AND NEW.avatar_url LIKE '/avatars/%'
     AND coalesce(btrim(OLD.avatar_url), '') <> ''
     AND OLD.avatar_url NOT LIKE '/avatars/%' THEN
    NEW.avatar_url := OLD.avatar_url;  -- keep the real photo
  END IF;
  RETURN NEW;
END;
$function$;

-- Give every portrait-less horse a distinct library avatar. Deterministic:
-- ordered by id so a re-run assigns the same face to the same horse, and the
-- modulo spreads them across the pool instead of making a row of clones.
WITH pool(idx, url) AS (
    VALUES
      (0,  '/avatars/table/free_cowboy@2x.webp'),
      (1,  '/avatars/table/vip_panther@2x.webp'),
      (2,  '/avatars/table/free_fox@2x.webp'),
      (3,  '/avatars/table/vip_badger@2x.webp'),
      (4,  '/avatars/table/vip_wolf@2x.webp'),
      (5,  '/avatars/table/free_owl@2x.webp'),
      (6,  '/avatars/table/free_pirate@2x.webp'),
      (7,  '/avatars/table/vip_boxer@2x.webp'),
      (8,  '/avatars/table/vip_bull@2x.webp'),
      (9,  '/avatars/table/vip_gorilla@2x.webp'),
      (10, '/avatars/table/free_ninja@2x.webp'),
      (11, '/avatars/table/vip_eagle@2x.webp'),
      (12, '/avatars/table/free_knight@2x.webp'),
      (13, '/avatars/table/vip_wrestler@2x.webp')
), blank AS (
    SELECT id, (row_number() OVER (ORDER BY id) - 1) % 14 AS slot
      FROM public.profiles
     WHERE is_horse = true
       AND coalesce(btrim(avatar_url), '') = ''
)
UPDATE public.profiles p
   SET avatar_url = pool.url
  FROM blank JOIN pool ON pool.idx = blank.slot
 WHERE p.id = blank.id;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    still_blank integer;
BEGIN
    SELECT count(*) INTO still_blank
      FROM public.profiles
     WHERE is_horse = true AND coalesce(btrim(avatar_url), '') = '';
    IF still_blank > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % horse(s) still have no portrait', still_blank;
    END IF;
END $$;

COMMIT;

-- ─── ROLLBACK ─────────────────────────────────────────────────────────
-- Restores the original guard. The assigned avatars are left in place; there
-- is nothing to restore them TO, since the previous value was blank.
--
--   CREATE OR REPLACE FUNCTION public.fn_guard_horse_avatar()
--   RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $f$
--   BEGIN
--     IF NEW.is_horse IS TRUE
--        AND NEW.avatar_url LIKE '/avatars/%'
--        AND (OLD.avatar_url IS NULL OR OLD.avatar_url NOT LIKE '/avatars/%') THEN
--       NEW.avatar_url := OLD.avatar_url;
--     END IF;
--     RETURN NEW;
--   END; $f$;
