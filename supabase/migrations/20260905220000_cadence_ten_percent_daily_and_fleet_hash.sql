-- ═══════════════════════════════════════════════════════════════════════
-- 20260905220000_cadence_ten_percent_daily_and_fleet_hash.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (additive + data)
-- AUTHOR:      Claude (Cowork), Fleet Content Programme phase 1 verification
-- AFFECTS:     rpcs: fn_fleet_hash(text,text) (new), fn_fleet_cadence(uuid)
--              (new), fn_socialize_horse(uuid) (replaced)
--              data: content_authors.personality.cadence_per_week (all horses)
-- IRREVERSIBLE: no
--
-- WHY:
--   Dan, 2026-09-05: "POSTING TIMES NEED TO BE SPREAD OUT THROUGH THE ENTIRE
--   DAY / WEEK AND TIMES, HORSES SHOULDN'T BE POSTING EVERY SINGLE DAY EITHER
--   (10% OF HORSES SHOULD BE POSTING DAILY)".
--
--   The workers scheduler (FleetScheduler.postingCadence) now draws 45% once
--   a week, 30% twice, 15% three times, 10% daily. The persona seed written
--   by fn_socialize_horse recorded a cadence from hashtext() with the old
--   buckets, so it described a schedule the scheduler did not run. This
--   migration gives Postgres the SAME hash (FNV-1a 32-bit over
--   '<salt>:<profile_id>', exactly as workers fleetHash()) and the same
--   buckets, then rewrites cadence_per_week for every horse from it. From
--   here on, content_authors.personality.cadence_per_week is the truth the
--   scheduler runs, and the admin console can compute it without Node.
--
-- Production DDL policy: one transaction.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ─────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_socialize_horse') THEN
        RAISE EXCEPTION 'pre-flight failed: fn_socialize_horse missing (20260905121000)';
    END IF;
END $$;

-- ─── 2. THE CHANGES ────────────────────────────────────────────────────

-- FNV-1a, 32-bit, over the bytes of '<salt>:<profile_id>'. Twin of
-- smarter-poker-workers src/lib/content-engine/FleetScheduler.ts fleetHash().
-- Both inputs are ASCII (uuid text and short salts), so bytea == charCodeAt.
CREATE OR REPLACE FUNCTION public.fn_fleet_hash(p_profile_id text, p_salt text)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_bytes bytea := convert_to(p_salt || ':' || p_profile_id, 'UTF8');
  v_h bigint := 2166136261;   -- 0x811c9dc5
  v_i int;
BEGIN
  FOR v_i IN 0 .. length(v_bytes) - 1 LOOP
    v_h := v_h # get_byte(v_bytes, v_i);
    v_h := (v_h * 16777619) % 4294967296;   -- 0x01000193, mod 2^32
  END LOOP;
  RETURN v_h;
END;
$fn$;
COMMENT ON FUNCTION public.fn_fleet_hash(text, text) IS
  'FNV-1a 32-bit over salt:profile_id. Byte-identical to workers FleetScheduler.fleetHash(); test vectors asserted in migration 20260905220000.';

-- The scheduler's buckets. 45 / 30 / 15 / 10 (daily).
CREATE OR REPLACE FUNCTION public.fn_fleet_cadence(p_profile_id uuid)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT CASE
    WHEN (public.fn_fleet_hash(p_profile_id::text, 'cadence') % 100) < 45 THEN 1
    WHEN (public.fn_fleet_hash(p_profile_id::text, 'cadence') % 100) < 75 THEN 2
    WHEN (public.fn_fleet_hash(p_profile_id::text, 'cadence') % 100) < 90 THEN 3
    ELSE 7 END;
$fn$;
COMMENT ON FUNCTION public.fn_fleet_cadence(uuid) IS
  'Posts per week the workers FleetScheduler will actually run for this horse: 1, 2, 3 or 7. Same hash, same buckets.';

-- fn_socialize_horse: identical to 20260905121000 except cadence comes from
-- fn_fleet_cadence and an existing wrong cadence is corrected.
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
  v_cad    := public.fn_fleet_cadence(p_id);
  v_bday   := date '1972-01-01' + ((v_h / 23) % (365 * 30))::int;

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
      personality = COALESCE(personality, '{}'::jsonb)
                    || CASE WHEN COALESCE(personality, '{}'::jsonb) ? 'archetype' THEN '{}'::jsonb ELSE jsonb_build_object('archetype', v_arch) END
                    || jsonb_build_object('cadence_per_week', v_cad)
                    || CASE WHEN COALESCE(personality, '{}'::jsonb) ? 'seeded_by' THEN '{}'::jsonb
                            ELSE jsonb_build_object('seeded_by', 'fn_socialize_horse', 'seeded_at', now()) END
  WHERE profile_id = p_id
    AND (NOT is_active
      OR COALESCE(location,'') = '' OR COALESCE(timezone,'') = '' OR COALESCE(specialty,'') = ''
      OR COALESCE(stakes,'') = '' OR COALESCE(bio,'') = '' OR COALESCE(voice,'') = ''
      OR birthday IS NULL OR avatar_url IS NULL
      OR personality IS NULL OR NOT (personality ? 'archetype')
      OR (personality->>'cadence_per_week') IS DISTINCT FROM v_cad::text);
  IF FOUND THEN v_touched := true; END IF;

  SELECT * INTO ca FROM public.content_authors WHERE profile_id = p_id;

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

REVOKE ALL ON FUNCTION public.fn_fleet_hash(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_fleet_cadence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fleet_hash(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_fleet_cadence(uuid) TO authenticated, service_role;

-- 2b. Correct every horse's recorded cadence (the sweep rewrites any that
--     differ from fn_fleet_cadence).
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.fn_socialize_all_horses();
  RAISE NOTICE 'cadence resync: touched % of % horses', r.touched, r.horses;
END $$;

-- ─── 3. POST-APPLY ASSERTIONS ──────────────────────────────────────────
DO $$
DECLARE v_wrong int; v_daily int; v_horses int; v_dist text;
BEGIN
  -- Test vectors computed with the TypeScript fleetHash() on 2026-09-05.
  IF public.fn_fleet_hash('abc', 'x') <> 4122029385 THEN
    RAISE EXCEPTION 'fn_fleet_hash vector 1 failed: %', public.fn_fleet_hash('abc', 'x');
  END IF;
  IF public.fn_fleet_hash('00000000-0000-0000-0000-000000000028', 'cadence') <> 4222159796 THEN
    RAISE EXCEPTION 'fn_fleet_hash vector 2 failed: %', public.fn_fleet_hash('00000000-0000-0000-0000-000000000028', 'cadence');
  END IF;
  IF public.fn_fleet_cadence('00000000-0000-0000-0000-000000000028') <> 7 THEN
    RAISE EXCEPTION 'fn_fleet_cadence vector failed (96 %% 100 -> daily)';
  END IF;

  SELECT count(*) INTO v_wrong FROM public.content_authors ca
   WHERE ca.profile_id IS NOT NULL
     AND (ca.personality->>'cadence_per_week')::int <> public.fn_fleet_cadence(ca.profile_id);
  IF v_wrong <> 0 THEN
    RAISE EXCEPTION 'post-apply failed: % horses still carry a cadence the scheduler will not run', v_wrong;
  END IF;

  SELECT count(*) INTO v_horses FROM public.profiles WHERE is_horse;
  SELECT count(*) INTO v_daily FROM public.content_authors ca JOIN public.profiles p ON p.id = ca.profile_id AND p.is_horse
   WHERE (ca.personality->>'cadence_per_week')::int = 7;
  IF v_daily < v_horses * 0.06 OR v_daily > v_horses * 0.14 THEN
    RAISE EXCEPTION 'post-apply failed: % of % horses are daily; expected about 10%%', v_daily, v_horses;
  END IF;

  SELECT string_agg(k || '=' || n, ', ' ORDER BY k) INTO v_dist
    FROM (SELECT (ca.personality->>'cadence_per_week')::int k, count(*) n
            FROM public.content_authors ca JOIN public.profiles p ON p.id = ca.profile_id AND p.is_horse
           GROUP BY 1) x;
  RAISE NOTICE 'cadence distribution (posts/week=horses): %', v_dist;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
