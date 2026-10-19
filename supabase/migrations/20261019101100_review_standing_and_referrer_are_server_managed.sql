-- ═══════════════════════════════════════════════════════════════════════
-- 20261019101100_review_standing_and_referrer_are_server_managed.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2
-- AUTHOR:       Claude (launch bug fixes, 2026-10-19)
-- AFFECTS:      column UPDATE grants on public.profiles
-- IRREVERSIBLE: no
--
-- WHY:
--   authenticated held column-level UPDATE on profiles.can_review,
--   deleted_reviews_count and referred_by, and the profiles_update policy
--   admits the owner's own row. So any player could PATCH their own row:
--   set can_review back to true after a review ban (pages/api/poker/reviews.js
--   treats can_review = false as the ban), reset deleted_reviews_count (the
--   strike count that earns the ban), or name any referrer they liked.
--
--   Nothing legitimate writes these from a browser. The writers are
--   server-side: pages/api/horses/admin-reviews.js (service role) for the
--   review columns, and for referred_by the SECURITY DEFINER functions owned
--   by postgres - fn_club_invite_claim, fn_club_invite_mark_verified and the
--   referral settlement fn_settle_signup_referral (Club Arena migration
--   20261017223126, service_role only) used by World Hub PR #2482. A
--   SECURITY DEFINER function runs as its owner, so a column revoke from
--   authenticated does not touch any of them.
--
-- HOW:
--   - assert authenticated has no TABLE-level UPDATE (so the column revoke
--     is what decides) and the three columns exist
--   - REVOKE UPDATE (the three columns) FROM authenticated, anon, PUBLIC
--   - assert the revoke took, service_role kept its grant, and an ordinary
--     player column (friend_preferences) is untouched
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '3s';

DO $pre$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['can_review', 'deleted_reviews_count', 'referred_by'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = c) THEN
      RAISE EXCEPTION 'pre-flight failed: profiles.% not found', c;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.profiles', 'UPDATE') THEN
    RAISE EXCEPTION 'pre-flight failed: authenticated holds table-level UPDATE on profiles, a column revoke would not take effect';
  END IF;
END $pre$;

REVOKE UPDATE (can_review, deleted_reviews_count, referred_by) ON public.profiles FROM authenticated, anon, PUBLIC;

DO $post$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['can_review', 'deleted_reviews_count', 'referred_by'] LOOP
    IF has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE')
       OR has_column_privilege('anon', 'public.profiles', c, 'UPDATE') THEN
      RAISE EXCEPTION 'post-apply failed: a client role can still UPDATE profiles.%', c;
    END IF;
    IF NOT has_column_privilege('service_role', 'public.profiles', c, 'UPDATE') THEN
      RAISE EXCEPTION 'post-apply failed: service_role lost UPDATE on profiles.%', c;
    END IF;
  END LOOP;
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'friend_preferences', 'UPDATE') THEN
    RAISE EXCEPTION 'post-apply failed: an ordinary player column lost its UPDATE grant';
  END IF;
END $post$;

COMMIT;

-- ROLLBACK (forward migration):
-- GRANT UPDATE (can_review, deleted_reviews_count, referred_by) ON public.profiles TO authenticated;
