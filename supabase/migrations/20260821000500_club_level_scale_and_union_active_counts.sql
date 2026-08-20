-- ═══════════════════════════════════════════════════════════════════════
-- 20260821000500_club_level_scale_and_union_active_counts.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (1 = doc-only, 2 = additive, 3 = destructive)
-- AUTHOR:      Cowork (Claude)
-- AFFECTS:     tables: public.club_level_thresholds (new)
--              rpcs:   fn_club_level_for_members (new),
--                      fn_union_active_player_counts (new)
-- IRREVERSIBLE: no                            (see ROLLBACK at the bottom)
--
-- WHY:
--   Two things Dan asked for on 2026-08-20.
--
--   1. "we need to create a true 'club level' level 1-55 that is determined
--      based on how many players are inside a club."
--
--      Club level was a MAX() of two axes — a player-count curve and a
--      hierarchy curve counting admins and agents — capped at 50. So a club
--      could level up by appointing agents without gaining a single player,
--      and the number on the card did not answer the question a player asks
--      of it ("how big is this club?"). This makes member count the only
--      input, and publishes the curve as data instead of burying it in a
--      formula, so the UI, the DB and any future report agree by construction.
--
--   2. "'active players' isn't working inside the club cards."
--
--      For a UNION card the client summed per-club active counts across the
--      union's member clubs and ignored the union's OWN club row — which is
--      exactly where its tables live. Midway Union had 384 players seated at
--      72 running tables and its card read 0. Summing per-club counts also
--      double-counted anyone seated in two member clubs at once. One RPC now
--      answers for a union directly, counting DISTINCT users across the
--      union's own club row AND its member clubs.
--
-- HOW (high level):
--   - club_level_thresholds: 55 rows, (level, min_members, tier, tier_label).
--   - fn_club_level_for_members(int): highest level whose threshold is met.
--   - fn_union_active_player_counts(uuid[]): distinct seated users per union.
--
-- THE CURVE (min members to reach each level):
--   Fast early, brutal late. A brand-new club moves every few joins so the
--   number visibly responds; the top five levels are meant to be rare enough
--   that seeing one means something. 578 members (Club JAQK today) lands at
--   29, 1,156 (Midway Union) at 33, and level 55 needs 100,000 — aspirational
--   rather than reachable by any club currently on the platform.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'clubs'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.clubs not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'union_clubs'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.union_clubs not found';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.club_level_thresholds (
    level        smallint PRIMARY KEY CHECK (level BETWEEN 1 AND 55),
    min_members  integer  NOT NULL CHECK (min_members >= 0),
    tier         text     NOT NULL,
    tier_label   text     NOT NULL
);

COMMENT ON TABLE public.club_level_thresholds IS
    'Club level 1-55 keyed on member count. min_members is the lowest member '
    'count that reaches that level. Single source of truth: the client mirrors '
    'these exact numbers in src/utils/clubLevels.ts.';

-- Idempotent seed: safe to re-run, and re-running corrects any drift.
INSERT INTO public.club_level_thresholds (level, min_members, tier, tier_label) VALUES
    (1,      0, 'starter',     'Starter'),
    (2,      5, 'starter',     'Starter'),
    (3,     10, 'starter',     'Starter'),
    (4,     15, 'starter',     'Starter'),
    (5,     20, 'starter',     'Starter'),
    (6,     25, 'small',       'Small Club'),
    (7,     30, 'small',       'Small Club'),
    (8,     35, 'small',       'Small Club'),
    (9,     40, 'small',       'Small Club'),
    (10,    45, 'small',       'Small Club'),
    (11,    50, 'growing',     'Growing Club'),
    (12,    60, 'growing',     'Growing Club'),
    (13,    70, 'growing',     'Growing Club'),
    (14,    80, 'growing',     'Growing Club'),
    (15,    90, 'growing',     'Growing Club'),
    (16,   100, 'established', 'Established'),
    (17,   110, 'established', 'Established'),
    (18,   125, 'established', 'Established'),
    (19,   140, 'established', 'Established'),
    (20,   160, 'established', 'Established'),
    (21,   180, 'large',       'Large Club'),
    (22,   200, 'large',       'Large Club'),
    (23,   230, 'large',       'Large Club'),
    (24,   270, 'large',       'Large Club'),
    (25,   310, 'large',       'Large Club'),
    (26,   360, 'regional',    'Regional Operator'),
    (27,   420, 'regional',    'Regional Operator'),
    (28,   490, 'regional',    'Regional Operator'),
    (29,   570, 'regional',    'Regional Operator'),
    (30,   660, 'regional',    'Regional Operator'),
    (31,   770, 'major',       'Major Operator'),
    (32,   900, 'major',       'Major Operator'),
    (33,  1050, 'major',       'Major Operator'),
    (34,  1200, 'major',       'Major Operator'),
    (35,  1400, 'major',       'Major Operator'),
    (36,  1650, 'network',     'Network-Grade Club'),
    (37,  1900, 'network',     'Network-Grade Club'),
    (38,  2200, 'network',     'Network-Grade Club'),
    (39,  2600, 'network',     'Network-Grade Club'),
    (40,  3000, 'network',     'Network-Grade Club'),
    (41,  3500, 'enterprise',  'Enterprise Club'),
    (42,  4100, 'enterprise',  'Enterprise Club'),
    (43,  4800, 'enterprise',  'Enterprise Club'),
    (44,  5600, 'enterprise',  'Enterprise Club'),
    (45,  6500, 'enterprise',  'Enterprise Club'),
    (46,  7600, 'elite',       'Elite Network Operator'),
    (47,  8900, 'elite',       'Elite Network Operator'),
    (48, 10500, 'elite',       'Elite Network Operator'),
    (49, 12500, 'elite',       'Elite Network Operator'),
    (50, 15000, 'elite',       'Elite Network Operator'),
    (51, 20000, 'legendary',   'Legendary Network'),
    (52, 30000, 'legendary',   'Legendary Network'),
    (53, 45000, 'legendary',   'Legendary Network'),
    (54, 70000, 'legendary',   'Legendary Network'),
    (55, 100000,'legendary',   'Legendary Network')
ON CONFLICT (level) DO UPDATE
   SET min_members = EXCLUDED.min_members,
       tier        = EXCLUDED.tier,
       tier_label  = EXCLUDED.tier_label;

-- Everyone may read the ladder; nobody but the service role may change it.
ALTER TABLE public.club_level_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_level_thresholds_readable ON public.club_level_thresholds;
CREATE POLICY club_level_thresholds_readable
    ON public.club_level_thresholds FOR SELECT
    TO authenticated, anon
    USING (true);

GRANT SELECT ON public.club_level_thresholds TO authenticated, anon;

-- Highest level whose min_members the club has reached.
CREATE OR REPLACE FUNCTION public.fn_club_level_for_members(p_members integer)
RETURNS smallint
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        (SELECT MAX(level)
           FROM public.club_level_thresholds
          WHERE min_members <= GREATEST(COALESCE(p_members, 0), 0)),
        1::smallint
    );
$function$;

COMMENT ON FUNCTION public.fn_club_level_for_members(integer) IS
    'Club level 1-55 from member count. Mirrors getClubLevelFromMembers() in '
    'the Club Arena client exactly.';

GRANT EXECUTE ON FUNCTION public.fn_club_level_for_members(integer) TO authenticated, anon;

-- Distinct players seated at a live table anywhere under a union: its own club
-- row plus every member club. DISTINCT across the whole set, so one player at
-- two of the union's tables counts once.
CREATE OR REPLACE FUNCTION public.fn_union_active_player_counts(p_union_ids uuid[])
RETURNS TABLE(union_id uuid, active_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    WITH union_club_ids AS (
        -- Member clubs of the union
        SELECT uc.union_id, uc.club_id
          FROM public.union_clubs uc
         WHERE uc.union_id = ANY(p_union_ids)
        UNION
        -- The union's OWN club row. This is the half that was missing: a union
        -- hosts tables directly, and those seats belong to nobody else.
        SELECT c.union_id, c.id
          FROM public.clubs c
         WHERE c.union_id = ANY(p_union_ids)
    )
    SELECT u.union_id, COUNT(DISTINCT ts.user_id) AS active_count
      FROM union_club_ids u
      JOIN public.tables t       ON t.club_id = u.club_id
      JOIN public.table_seats ts ON ts.table_id = t.id
     WHERE ts.left_at IS NULL
       AND COALESCE(ts.is_away, false) = false
       AND lower(COALESCE(t.status, '')) NOT IN ('closed','completed','cancelled','finished')
     GROUP BY u.union_id;
$function$;

COMMENT ON FUNCTION public.fn_union_active_player_counts(uuid[]) IS
    'Active (seated, not away, live table) player count per union, counting '
    'the union''s own club row as well as its member clubs, de-duplicated.';

GRANT EXECUTE ON FUNCTION public.fn_union_active_player_counts(uuid[]) TO authenticated, anon;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    n_levels      integer;
    not_monotonic integer;
BEGIN
    SELECT count(*) INTO n_levels FROM public.club_level_thresholds;
    IF n_levels <> 55 THEN
        RAISE EXCEPTION 'post-apply failed: expected 55 threshold rows, found %', n_levels;
    END IF;

    -- The ladder must strictly increase, or a member count could satisfy a
    -- higher level than a lower one and MAX(level) would lie.
    SELECT count(*) INTO not_monotonic
      FROM (
        SELECT level, min_members,
               LAG(min_members) OVER (ORDER BY level) AS prev
          FROM public.club_level_thresholds
      ) s
     WHERE prev IS NOT NULL AND min_members <= prev;
    IF not_monotonic > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % non-increasing threshold(s)', not_monotonic;
    END IF;

    IF public.fn_club_level_for_members(0)   <> 1  THEN RAISE EXCEPTION 'level(0) should be 1';  END IF;
    IF public.fn_club_level_for_members(578) <> 29 THEN RAISE EXCEPTION 'level(578) should be 29'; END IF;
    IF public.fn_club_level_for_members(100000) <> 55 THEN RAISE EXCEPTION 'level(100000) should be 55'; END IF;
    IF public.fn_club_level_for_members(NULL) <> 1 THEN RAISE EXCEPTION 'level(NULL) should be 1'; END IF;
END $$;

COMMIT;

-- ─── ROLLBACK ─────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.fn_union_active_player_counts(uuid[]);
--   DROP FUNCTION IF EXISTS public.fn_club_level_for_members(integer);
--   DROP TABLE IF EXISTS public.club_level_thresholds;
