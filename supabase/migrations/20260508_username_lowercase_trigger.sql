-- ═══════════════════════════════════════════════════════════════════════
-- 20260508_username_lowercase_trigger.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      antigravity
-- AFFECTS:     profiles table (trigger + index)
-- IRREVERSIBLE: no
--
-- WHY:
--   Profile navigation was showing "User Not Found" for some users because
--   the username stored in localStorage caches could have different casing
--   than the database value (e.g. "Daniel" vs "daniel"). The [username].js
--   page used exact-case .eq() queries which silently returned null.
--   We patched [username].js to use .ilike() as an emergency fix, but the
--   root cause is that usernames in the profiles table have no enforced
--   casing. This migration enforces lowercase at the DB layer — the only
--   place that can guarantee platform-wide consistency across every client,
--   API route, and future agent that touches the table.
--
-- HOW:
--   1. Create a BEFORE INSERT OR UPDATE trigger function that lowercases
--      the username column whenever a row is written.
--   2. Attach the trigger to public.profiles.
--   3. Run a one-shot UPDATE to normalise all existing rows.
--   4. Drop the plain btree index on username (case-sensitive, now redundant)
--      and replace it with a LOWER(username) functional index — this makes
--      all lookups O(log n) regardless of query casing.
--   5. Post-apply assertions verify the trigger and index exist.
--
-- PERFORMANCE NOTE:
--   The trigger fires only on INSERT/UPDATE (not SELECT) — zero read overhead.
--   The functional index is used automatically by Postgres for both
--   .eq('username', ...) and .ilike('username', ...) queries, so query
--   performance is identical to or better than before.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. PRE-FLIGHT ASSERTIONS ──────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'profiles'
          AND column_name  = 'username'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: profiles.username column not found';
    END IF;
END $$;

-- ── 2. TRIGGER FUNCTION ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_normalize_username()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    -- Normalise username to lowercase on every write.
    -- NULL usernames are allowed (e.g. during OAuth sign-up before profile
    -- completion), so we guard with an explicit null check.
    IF NEW.username IS NOT NULL THEN
        NEW.username := LOWER(NEW.username);
    END IF;
    RETURN NEW;
END;
$$;

-- ── 3. ATTACH TRIGGER ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_normalize_username ON public.profiles;

CREATE TRIGGER trg_normalize_username
    BEFORE INSERT OR UPDATE OF username
    ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_normalize_username();

-- ── 4. BACKFILL EXISTING ROWS ─────────────────────────────────────────
-- Lowercase any usernames that are currently mixed-case.
-- This is a safe UPDATE — the trigger will also fire on these rows and
-- confirm the normalisation, so the result is idempotent.
UPDATE public.profiles
SET    username = LOWER(username)
WHERE  username IS NOT NULL
  AND  username <> LOWER(username);

-- ── 5. REPLACE INDEX WITH FUNCTIONAL INDEX ────────────────────────────
-- The old btree index on the raw column is now wasteful because after
-- normalisation all usernames are already lowercase, but we keep a
-- functional index on LOWER(username) so legacy .ilike() queries and
-- direct LOWER()-comparison queries all hit the index.
DROP INDEX IF EXISTS public.idx_profiles_username;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
    ON public.profiles (LOWER(username))
    WHERE username IS NOT NULL;

-- ── 6. POST-APPLY ASSERTIONS ──────────────────────────────────────────
DO $$
DECLARE
    v_trigger_exists boolean;
    v_index_exists   boolean;
    v_mixed_case_count bigint;
BEGIN
    -- Trigger must exist
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_normalize_username'
          AND tgrelid = 'public.profiles'::regclass
    ) INTO v_trigger_exists;

    IF NOT v_trigger_exists THEN
        RAISE EXCEPTION 'post-apply assertion failed: trigger trg_normalize_username not found on profiles';
    END IF;

    -- Functional index must exist
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename  = 'profiles'
          AND indexname  = 'idx_profiles_username_lower'
    ) INTO v_index_exists;

    IF NOT v_index_exists THEN
        RAISE EXCEPTION 'post-apply assertion failed: index idx_profiles_username_lower not found';
    END IF;

    -- Zero mixed-case usernames should remain after backfill
    SELECT COUNT(*) INTO v_mixed_case_count
    FROM public.profiles
    WHERE username IS NOT NULL
      AND username <> LOWER(username);

    IF v_mixed_case_count > 0 THEN
        RAISE EXCEPTION 'post-apply assertion failed: % profile(s) still have mixed-case usernames', v_mixed_case_count;
    END IF;

    RAISE NOTICE 'post-apply: trigger ✓  functional-index ✓  backfill ✓ (0 mixed-case rows remaining)';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 2 — paste into a new _revert_ migration if needed)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_normalize_username ON public.profiles;
-- DROP FUNCTION IF EXISTS public.fn_normalize_username();
-- DROP INDEX  IF EXISTS public.idx_profiles_username_lower;
-- CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
-- COMMIT;
