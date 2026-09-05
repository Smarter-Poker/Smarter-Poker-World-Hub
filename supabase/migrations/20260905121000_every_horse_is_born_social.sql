-- ═══════════════════════════════════════════════════════════════════════
-- 20260905121000_every_horse_is_born_social.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (additive + data)
-- AUTHOR:      Claude (Cowork), Fleet Content Programme phase 1
-- AFFECTS:     tables: content_authors, profiles (data)
--              rpcs: fn_socialize_horse(uuid), fn_socialize_all_horses(),
--                    fn_horses_not_social_ready()
--              triggers: trg_profiles_horse_is_born_social ON profiles
-- IRREVERSIBLE: no (data fills only where NULL/false; trigger can be dropped)
--
-- WHY:
--   Dan, 2026-09-05: "UPGRADE AND ADD ALL SOCIAL POSTING SKILLS OR CREDENTIALS
--   TO ALL THE HORSES IN THE STABLE THAT HAVEN'T BEEN UPGRADED TO SOCIAL
--   HORSES YET" and "ANYTIME A NEW HORSE IS CREATED, IT INHERITS ALL THE
--   SOCIAL POSTING SKILLS AND ABILITIES AS WELL."
--
--   Measured before this ran (1,000 horses):
--     social_profile_completed = false ....... 426
--     profiles.bio empty ..................... 593
--     profiles.city / favorite_game empty .... 592 / 693
--     content_authors.voice NULL ............. 593
--     content_authors.personality NULL ...... 1000
--     content_authors.birthday NULL .......... 900
--   Every creation path (008_hydra_horse_fleet, 009_fleet_300_parity, the
--   2026-09-01 Deep Stack batch, HorseOnboarding.createHorse) wrote a
--   different subset. club-arena's HorseOnboarding sweep repairs the
--   content_authors row at engine boot, but nothing owns the social profile
--   fields and nothing runs at the moment of creation for a horse minted
--   by a migration or a script. A database trigger is the only place that
--   covers every path.
--
-- HOW:
--   - fn_socialize_horse(p_id): idempotent. Ensures the content_authors row
--     (mints alias with fn_mint_social_alias, same 20 cities / 10
--     specialties / 7 stakes as the 09-01 batch), fills voice, gender-neutral
--     defaults, birthday, a personality seed (archetype + posting cadence,
--     recorded as data so the persona sheet says what the scheduler does),
--     then fills profiles.bio / city / favorite_game / birth_year and sets
--     social_profile_completed. Never overwrites a non-empty value.
--   - fn_socialize_all_horses(): sweep, returns rows touched. Called here.
--   - trigger AFTER INSERT OR UPDATE OF is_horse ON profiles: when
--     is_horse, call fn_socialize_horse. Wrapped so a failure is a WARNING
--     and never blocks the insert - a horse with a half profile is better
--     than no horse; the sweep catches it.
--   - fn_horses_not_social_ready(): the drift detector, for the admin
--     console and the daily audit.
--
-- Production DDL policy: one transaction.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ─────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_mint_social_alias') THEN
        RAISE EXCEPTION 'pre-flight failed: fn_mint_social_alias missing (club-arena 20260902182717)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='content_authors' AND column_name='personality') THEN
        RAISE EXCEPTION 'pre-flight failed: content_authors.personality missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='profiles' AND column_name='social_profile_completed') THEN
        RAISE EXCEPTION 'pre-flight failed: profiles.social_profile_completed missing';
    END IF;
END $$;

-- ─── 2. THE CHANGES ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_socialize_horse(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  p         record;
  ca        record;
  v_h       bigint;
  v_loc     text;
  v_tz      text;
  v_spec    text;
  v_stakes  text;
  v_alias   text;
  v_voice   text;
  v_arch    text;
  v_cad     int;
  v_bday    date;
  v_touched boolean := false;
  v_locs text[] := ARRAY['Atlantic City, NJ','Austin, TX','Barcelona, ES','Berlin, DE',
    'Brooklyn, NY','Chicago, IL','Dallas, TX','Denver, CO','Dublin, IE','Las Vegas, NV',
    'Lisbon, PT','London, UK','Los Angeles, CA','Manchester, UK','Manila, PH',
    'Melbourne, AU','Miami, FL','Phoenix, AZ','Seattle, WA','Toronto, CA'];
  v_tzs text[] := ARRAY['America/New_York','America/Chicago','Europe/Madrid','Europe/Berlin',
    'America/New_York','America/Chicago','America/Chicago','America/Denver','Europe/Dublin','America/Los_Angeles',
    'Europe/Lisbon','Europe/London','America/Los_Angeles','Europe/London','Asia/Manila',
    'Australia/Melbourne','America/New_York','America/Phoenix','America/Los_Angeles','America/Toronto'];
  v_specs text[] := ARRAY['bounty tournaments','cash games','heads-up','live cash','mixed games',
    'PLO','satellites','short deck','spins','tournaments'];
  v_stk text[] := ARRAY['1/2','1/3','10/25','2/3','2/5','25/50','5/10'];
  -- The 51 voices ContentCommander.VOICE_PROMPTS knows, reduced to the ten
  -- HumanVoiceEngine archetypes plus the persona.json voices already in use.
  v_voices text[] := ARRAY['analytical','blunt','hype','dry','veteran','casual',
    'skeptical','excitable','terse','conversational','community','technical',
    'storyteller','grinder','coach'];
  v_archs text[] := ARRAY['blunt','analytical','hype','dry','veteran','casual',
    'skeptical','excitable','terse','conversational'];
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_id;
  IF NOT FOUND OR NOT COALESCE(p.is_horse, false) THEN
    RETURN false;
  END IF;

  v_h      := abs(hashtext(p_id::text));
  v_loc    := v_locs [1 + (v_h % 20)];
  v_tz     := v_tzs  [1 + (v_h % 20)];
  v_spec   := v_specs[1 + ((v_h / 7) % 10)];
  v_stakes := v_stk  [1 + ((v_h / 11) % 7)];
  v_voice  := v_voices[1 + ((v_h / 13) % array_length(v_voices, 1))];
  v_arch   := v_archs [1 + ((v_h / 17) % array_length(v_archs, 1))];
  -- Cadence mirrors workers FleetScheduler.postingCadence buckets as a
  -- description; the scheduler derives the truth from its own hash.
  v_cad    := CASE WHEN (v_h / 19) % 100 < 60 THEN 1
                   WHEN (v_h / 19) % 100 < 85 THEN 2
                   WHEN (v_h / 19) % 100 < 95 THEN 3 ELSE 5 END;
  v_bday   := date '1972-01-01' + ((v_h / 23) % (365 * 30))::int;

  -- 2a. The social identity row. This is the credential: without it the
  --     content engine cannot see the horse at all.
  SELECT * INTO ca FROM public.content_authors WHERE profile_id = p_id;
  IF NOT FOUND THEN
    v_alias := public.fn_mint_social_alias(p_id::text);
    INSERT INTO public.content_authors
      (name, alias, location, timezone, specialty, stakes, bio, avatar_seed,
       avatar_url, profile_id, is_active, voice, birthday, personality)
    VALUES
      (COALESCE(NULLIF(p.display_name, ''), NULLIF(p.full_name, ''), p.username),
       v_alias, v_loc, v_tz, v_spec, v_stakes,
       v_spec || ' regular out of ' || v_loc || '. Mostly ' || v_stakes || '.',
       lower(v_alias) || '_' || substr(md5(p_id::text), 1, 8),
       p.avatar_url, p_id, true, v_voice, v_bday,
       jsonb_build_object('archetype', v_arch, 'cadence_per_week', v_cad,
                          'seeded_by', 'fn_socialize_horse', 'seeded_at', now()));
    v_touched := true;
    SELECT * INTO ca FROM public.content_authors WHERE profile_id = p_id;
  END IF;

  -- 2b. Fill what the row lacks. Never overwrite a value somebody wrote.
  UPDATE public.content_authors SET
      is_active   = true,
      location    = COALESCE(NULLIF(location, ''), v_loc),
      timezone    = COALESCE(NULLIF(timezone, ''), v_tz),
      specialty   = COALESCE(NULLIF(specialty, ''), v_spec),
      stakes      = COALESCE(NULLIF(stakes, ''), v_stakes),
      bio         = COALESCE(NULLIF(bio, ''), v_spec || ' regular out of ' || COALESCE(NULLIF(location,''), v_loc) || '. Mostly ' || COALESCE(NULLIF(stakes,''), v_stakes) || '.'),
      voice       = COALESCE(NULLIF(voice, ''), v_voice),
      birthday    = COALESCE(birthday, v_bday),
      avatar_url  = COALESCE(avatar_url, p.avatar_url),
      personality = CASE
                      WHEN personality IS NULL THEN
                        jsonb_build_object('archetype', v_arch, 'cadence_per_week', v_cad,
                                           'seeded_by', 'fn_socialize_horse', 'seeded_at', now())
                      ELSE personality
                        || CASE WHEN personality ? 'archetype' THEN '{}'::jsonb ELSE jsonb_build_object('archetype', v_arch) END
                        || CASE WHEN personality ? 'cadence_per_week' THEN '{}'::jsonb ELSE jsonb_build_object('cadence_per_week', v_cad) END
                    END
  WHERE profile_id = p_id
    AND (NOT is_active
      OR COALESCE(location,'') = '' OR COALESCE(timezone,'') = '' OR COALESCE(specialty,'') = ''
      OR COALESCE(stakes,'') = '' OR COALESCE(bio,'') = '' OR COALESCE(voice,'') = ''
      OR birthday IS NULL OR avatar_url IS NULL
      OR personality IS NULL OR NOT (personality ? 'archetype') OR NOT (personality ? 'cadence_per_week'));
  IF FOUND THEN v_touched := true; END IF;

  SELECT * INTO ca FROM public.content_authors WHERE profile_id = p_id;

  -- 2c. The public social profile: what a human sees when they tap the horse.
  UPDATE public.profiles SET
      bio                      = COALESCE(NULLIF(bio, ''), ca.bio),
      city                     = COALESCE(NULLIF(city, ''), split_part(ca.location, ',', 1)),
      favorite_game            = COALESCE(NULLIF(favorite_game, ''), ca.specialty),
      birth_year               = COALESCE(birth_year, EXTRACT(YEAR FROM ca.birthday)::int),
      social_profile_completed = true,
      updated_at               = now()
  WHERE id = p_id
    AND (COALESCE(bio,'') = '' OR COALESCE(city,'') = '' OR COALESCE(favorite_game,'') = ''
      OR birth_year IS NULL OR NOT COALESCE(social_profile_completed, false));
  IF FOUND THEN v_touched := true; END IF;

  RETURN v_touched;
END;
$fn$;
COMMENT ON FUNCTION public.fn_socialize_horse(uuid) IS
  'Idempotent. Gives one horse everything the social content engine needs: content_authors row (alias, city, tz, specialty, stakes, bio, voice, birthday, personality seed) and a completed public profile. Fills only what is empty. Fired by trg_profiles_horse_is_born_social and by fn_socialize_all_horses().';

CREATE OR REPLACE FUNCTION public.fn_socialize_all_horses()
RETURNS TABLE (touched integer, horses integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE r record; v_t integer := 0; v_n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE is_horse ORDER BY created_at, id LOOP
    v_n := v_n + 1;
    IF public.fn_socialize_horse(r.id) THEN v_t := v_t + 1; END IF;
  END LOOP;
  touched := v_t; horses := v_n;
  RETURN NEXT;
END;
$fn$;
COMMENT ON FUNCTION public.fn_socialize_all_horses() IS
  'Sweep: fn_socialize_horse over every is_horse profile. Safe to run any time; returns (touched, horses).';

CREATE OR REPLACE FUNCTION public.fn_horses_not_social_ready()
RETURNS TABLE (profile_id uuid, username text, missing text[])
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT p.id, p.username,
         array_remove(ARRAY[
           CASE WHEN ca.profile_id IS NULL THEN 'content_authors' END,
           CASE WHEN ca.profile_id IS NOT NULL AND NOT ca.is_active THEN 'is_active' END,
           CASE WHEN COALESCE(ca.voice,'') = '' THEN 'voice' END,
           CASE WHEN ca.personality IS NULL THEN 'personality' END,
           CASE WHEN COALESCE(ca.timezone,'') = '' THEN 'timezone' END,
           CASE WHEN COALESCE(p.bio,'') = '' THEN 'bio' END,
           CASE WHEN NOT COALESCE(p.social_profile_completed,false) THEN 'social_profile_completed' END,
           CASE WHEN p.avatar_url IS NULL THEN 'avatar_url' END
         ], NULL) AS missing
    FROM public.profiles p
    LEFT JOIN public.content_authors ca ON ca.profile_id = p.id
   WHERE p.is_horse
     AND (ca.profile_id IS NULL OR NOT ca.is_active OR COALESCE(ca.voice,'') = ''
          OR ca.personality IS NULL OR COALESCE(ca.timezone,'') = ''
          OR COALESCE(p.bio,'') = '' OR NOT COALESCE(p.social_profile_completed,false)
          OR p.avatar_url IS NULL);
$fn$;
COMMENT ON FUNCTION public.fn_horses_not_social_ready() IS
  'Drift detector: horses missing any social credential. Expected empty; each row names what is missing.';

-- The trigger. AFTER so the profile row exists; wrapped so it can never
-- refuse the insert that made the horse.
CREATE OR REPLACE FUNCTION public.trg_fn_horse_is_born_social()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF COALESCE(NEW.is_horse, false) THEN
    BEGIN
      PERFORM public.fn_socialize_horse(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fn_socialize_horse(%) failed in trigger: % (the sweep will catch it)', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_profiles_horse_is_born_social ON public.profiles;
CREATE TRIGGER trg_profiles_horse_is_born_social
  AFTER INSERT OR UPDATE OF is_horse ON public.profiles
  FOR EACH ROW
  WHEN (NEW.is_horse IS TRUE)
  EXECUTE FUNCTION public.trg_fn_horse_is_born_social();

REVOKE ALL ON FUNCTION public.fn_socialize_horse(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_socialize_all_horses() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_horses_not_social_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_horses_not_social_ready() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_socialize_horse(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_socialize_all_horses() TO service_role;

-- 2d. The stable, today.
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.fn_socialize_all_horses();
  RAISE NOTICE 'fn_socialize_all_horses: touched % of % horses', r.touched, r.horses;
END $$;

-- ─── 3. POST-APPLY ASSERTIONS ──────────────────────────────────────────
DO $$
DECLARE v_missing integer; v_horses integer; v_done integer;
BEGIN
  SELECT count(*) INTO v_missing FROM public.fn_horses_not_social_ready();
  SELECT count(*) INTO v_horses FROM public.profiles WHERE is_horse;
  SELECT count(*) INTO v_done FROM public.profiles WHERE is_horse AND social_profile_completed;
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'post-apply failed: % horses still not social-ready', v_missing;
  END IF;
  IF v_done <> v_horses THEN
    RAISE EXCEPTION 'post-apply failed: % of % horses have social_profile_completed', v_done, v_horses;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_horse_is_born_social') THEN
    RAISE EXCEPTION 'post-apply failed: trigger missing';
  END IF;
  RAISE NOTICE 'every horse is social: % of %', v_done, v_horses;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
