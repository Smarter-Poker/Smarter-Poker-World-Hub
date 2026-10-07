-- 20261006050321_a_public_name_is_never_a_copied_legal_name.sql
-- Applied to production 2026-10-06 05:03 UTC as version 20261006050321
-- (reserved as 20261006043256, the name its audit rows carry), after #2167
-- was live; 23 rows cleared, 23 admin_audit_log rows written.
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2 (data correction, audited, reversible)
-- AUTHOR:       Claude, privacy follow-ups 2026-10-06
-- AFFECTS:      public.profiles.display_name (23 rows), public.admin_audit_log
-- IRREVERSIBLE: no (every changed row is listed in admin_audit_log; the
--               revert is display_name = full_name for those target_ids)
--
-- WHY:
--   Ruling 25: a person's legal name is readable only by them and platform
--   staff. Edit Profile had no Display Name field and, on EVERY save, wrote
--   "First Last" into display_name (profileHandlers.js), so anyone who saved
--   their profile published their legal name as their public name without
--   ever being asked. The same change gives the editor a real
--   Display Name field and stops the copy. This clears the copies it left.
--
--   Scope, decided 2026-10-06: ordinary players (role 'user') only. Staff
--   (admin, god) and venue owners are public-facing accounts whose real
--   names are their business identity; they keep what they have and can
--   change it in the new field. Horses: none matched.
--
-- HOW:
--   1. Assert the reviewed count (23) so this refuses if the data moved.
--   2. One admin_audit_log row per account (no name stored; the legal name
--      is still in the owner's own full_name).
--   3. display_name := NULL, so others see the username until the owner
--      chooses a display name.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE _legal_copies ON COMMIT DROP AS
SELECT p.id
  FROM public.profiles p
 WHERE coalesce(p.is_horse, false) = false
   AND coalesce(p.role, 'user') = 'user'
   AND nullif(btrim(p.display_name), '') IS NOT NULL
   AND (lower(btrim(p.display_name)) = lower(btrim(p.full_name))
        OR lower(btrim(p.display_name)) = lower(btrim(concat_ws(' ',
             nullif(btrim(p.first_name), ''), nullif(btrim(p.last_name), '')))));

DO $pre$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM _legal_copies;
  IF v_n <> 23 THEN
    RAISE EXCEPTION 'reviewed 23 players whose display name is a copied legal name, found %; re-read before applying', v_n;
  END IF;
END
$pre$;

INSERT INTO public.admin_audit_log (action, target_type, target_id, details, before_state, after_state, actor_role)
SELECT 'display_name_legal_copy_cleared', 'profile', c.id::text,
       jsonb_build_object('migration', '20261006043256_a_public_name_is_never_a_copied_legal_name',
                          'ruling', 25,
                          'revert', 'UPDATE profiles SET display_name = full_name WHERE id = target_id'),
       jsonb_build_object('display_name_was_legal_name', true),
       jsonb_build_object('display_name', NULL),
       'migration'
  FROM _legal_copies c;

UPDATE public.profiles p
   SET display_name = NULL
  FROM _legal_copies c
 WHERE p.id = c.id;

DO $post$
DECLARE v_left int; v_audit int;
BEGIN
  SELECT count(*) INTO v_left
    FROM public.profiles p
   WHERE coalesce(p.is_horse, false) = false
     AND coalesce(p.role, 'user') = 'user'
     AND nullif(btrim(p.display_name), '') IS NOT NULL
     AND (lower(btrim(p.display_name)) = lower(btrim(p.full_name))
          OR lower(btrim(p.display_name)) = lower(btrim(concat_ws(' ',
               nullif(btrim(p.first_name), ''), nullif(btrim(p.last_name), '')))));
  SELECT count(*) INTO v_audit FROM public.admin_audit_log
   WHERE action = 'display_name_legal_copy_cleared';
  IF v_left <> 0 OR v_audit < 23 THEN
    RAISE EXCEPTION 'post: % copies left, % audit rows', v_left, v_audit;
  END IF;
END
$post$;

COMMIT;
