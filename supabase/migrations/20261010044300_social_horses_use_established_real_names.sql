-- TIER: 2; AUTHOR: Codex; AFFECTS: public.profiles public display names.
-- Owner request 2026-10-09: social horse names are real persona names, not aliases.
-- Available horses already have authored full_name/first_name/last_name and
-- use_real_name=true, but their public display_name still holds a poker alias.
-- Normalize that public field at its source. Never expose a human legal name,
-- alter username/alias, revive disabled horses, or grant private-column access.
-- The row-local trigger retains this rule for subsequent persona/profile writes.
-- Qualification: __tests__/social-horse-real-name-postgres.test.mjs (PG17).
-- Apply only outside the enforced :50-:03 UTC DDL window; never replay.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'horse public name preflight: profiles is absent';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE is_horse IS TRUE AND horse_status = 'available'
      AND (nullif(btrim(full_name), '') IS NULL
        OR regexp_replace(btrim(full_name), '[[:space:]]+', ' ', 'g') IS DISTINCT FROM
           btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), ''))))
  ) THEN
    RAISE EXCEPTION 'horse public name preflight: available persona name is missing or disagrees';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles h JOIN public.profiles u
      ON lower(btrim(u.display_name)) = lower(regexp_replace(btrim(h.full_name), '[[:space:]]+', ' ', 'g'))
    WHERE h.is_horse IS TRUE AND h.horse_status = 'available'
      AND NOT coalesce(u.is_horse, false)
  ) THEN
    RAISE EXCEPTION 'horse public name preflight: human public name collision';
  END IF;
END
$preflight$;

CREATE FUNCTION public.fn_social_horse_public_real_name()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.is_horse IS TRUE AND NEW.horse_status = 'available'
     AND nullif(btrim(NEW.full_name), '') IS NOT NULL THEN
    NEW.display_name := regexp_replace(btrim(NEW.full_name), '[[:space:]]+', ' ', 'g');
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_social_horse_public_real_name() FROM PUBLIC;

-- BEFORE triggers run by name. This precedes the existing collision guard,
-- which must validate the normalized name, not the old alias.
CREATE TRIGGER trg_00_social_horse_public_real_name
BEFORE INSERT OR UPDATE OF display_name, full_name, first_name, last_name,
  is_horse, horse_status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_social_horse_public_real_name();

UPDATE public.profiles
   SET display_name = regexp_replace(btrim(full_name), '[[:space:]]+', ' ', 'g')
 WHERE is_horse IS TRUE AND horse_status = 'available'
   AND display_name IS DISTINCT FROM regexp_replace(btrim(full_name), '[[:space:]]+', ' ', 'g');

DO $post$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE is_horse IS TRUE AND horse_status = 'available'
      AND display_name IS DISTINCT FROM regexp_replace(btrim(full_name), '[[:space:]]+', ' ', 'g')
  ) THEN
    RAISE EXCEPTION 'horse public name post-image: an available horse retains an alias';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'trg_00_social_horse_public_real_name' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'horse public name post-image: trigger missing or disabled';
  END IF;
END
$post$;
COMMIT;

-- SAFE RECOVERY: as a NEW migration, drop only the named trigger and function
-- (RESTRICT). Retain the owner-requested public names; never restore aliases
-- or write human/disabled identity fields as an automatic recovery action.
