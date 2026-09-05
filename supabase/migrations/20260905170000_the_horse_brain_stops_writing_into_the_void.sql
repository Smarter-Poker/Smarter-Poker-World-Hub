-- ═══════════════════════════════════════════════════════════════════════════
--  THE HORSE BRAIN STOPS WRITING INTO THE VOID
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `scripts/ci/check-phantom-tables.mjs` is a REQUIRED status check on main
-- ("U4.2: No phantom tables") and it has been failing on THIRTEEN tables, so
-- no pull request in this repository can merge. That is the visible symptom.
--
-- THE ACTUAL DEFECT IS WORSE THAN A RED CHECK
--
-- The script's own header says exactly what a phantom table costs, and it is
-- happening right now:
--
--     const { error } = await supabase.from('x').insert(rows);
--     if (error) console.warn('Failed to save:', error);
--
-- PostgREST returns 42P01 in the `error` channel and the call site logs it.
-- The write is discarded, forever, silently. Five of the thirteen are on LIVE
-- paths reached from `pages/api/poker-brain/decide.js` and from
-- `GameController` (six call sites, imported by eight `/api/poker/engine/*`
-- routes): every opponent read, every session analytic, every threat-intel
-- row and every hand the brain thought it was remembering has been going
-- nowhere.
--
-- SEVEN OF THEM STILL EXIST, WITH THEIR DATA, IN `zz_archive`
--
-- Measured 2026-09-05 against production:
--
--     zz_archive.horse_opponent_journals        858 rows
--     zz_archive.horse_sports_source_assignments 200 rows
--     zz_archive.horse_source_assignments        100 rows
--     zz_archive.horse_personality               100 rows
--     zz_archive.horse_memory                    104 rows
--     zz_archive.horse_topic_cooldowns            37 rows
--     zz_archive.horse_hand_history                4 rows
--     zz_archive.horse_analytics                   1 row
--
-- No migration in this repository performed that archival - `git grep
-- zz_archive -- supabase/migrations/*.sql` returns nothing - so it was done
-- out of band. It happened after 2026-08-15, because
-- `20260815_check13_sweep3_columns.sql` runs `ALTER TABLE
-- public.horse_opponent_reads ADD COLUMN ...` and its header records that it
-- was applied to production that day, which is impossible unless the table was
-- in `public` at the time.
--
-- The check reads the PostgREST OpenAPI document, which lists what is EXPOSED
-- on the API schema - the exact caveat its own header calls out. A table in
-- `zz_archive` is invisible to it, and invisible to every client.
--
-- So these seven are MOVED, not recreated. Recreating them would strand 1,404
-- rows and re-randomise 100 horse personalities.
--
-- THREE DELIBERATE DEVIATIONS FROM THE ARCHIVED MIGRATIONS
--
-- The six that exist nowhere have `CREATE TABLE` text in
-- `supabase/migrations/archive/`, a subdirectory the Supabase CLI does not
-- scan, so none of it has ever run. Reusing it verbatim would reintroduce
-- three faults:
--
--   1. `horse_threat_intel.opponent_id` is NOT `uuid REFERENCES profiles(id)`.
--      Its only caller is the HUD route, whose opponent ids come from
--      OCR-scraped screen state and are not accounts. A foreign key there
--      turns every write into a 23503 that `anti-exploit.js`'s catch swallows -
--      the same silent discard this migration exists to end. `text` + UNIQUE.
--   2. `horse_session_stats.profile_id` is `text` and carries no foreign key,
--      for the same reason: `brain/core.js` guards its read with
--      `if (_horseIds.has(row.profile_id))`, which is only meaningful if
--      unmatched rows are expected.
--   3. `horse_opponent_reads` gains `slow_play_tendency numeric`, which the
--      archived text predates. `20260815_check13_sweep3_columns.sql` added it
--      to production and `brain/plo-core.js:2245` selects it.
--
-- AND ONE CONSTRAINT IS DELIBERATELY DROPPED
--
-- `horse_source_assignments` carries `UNIQUE (source_name, is_primary)`
-- alongside the real key. That caps the whole table at two rows per source -
-- one primary, one not - and it is NOT the `onConflict` target the initializer
-- names. A 300-row upsert would raise 23505 on the third horse to share a
-- source. The table holds 100 rows where 300 were intended, which is what that
-- looks like from the outside. Dropped.
--
-- One transaction, per the production DDL policy (CLAUDE.md section 2): every
-- statement here fires a PostgREST schema reload, and this file has enough of
-- them to matter.

BEGIN;

-- ── 0. Assert the world, and abort if it moved ─────────────────────────────
DO $guard$
DECLARE
  v_archived integer;
BEGIN
  SELECT count(*) INTO v_archived
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zz_archive' AND c.relkind = 'r'
     AND c.relname IN ('horse_source_assignments','horse_sports_source_assignments',
                       'horse_personality','horse_topic_cooldowns','horse_analytics',
                       'horse_hand_history','horse_opponent_journals','horse_memory');
  IF v_archived <> 8 THEN
    RAISE EXCEPTION
      'ABORTING: expected 8 archived horse tables in zz_archive, found %. '
      'Someone has moved or dropped them since this was measured - read '
      'zz_archive before applying, because these MOVE data rather than create it.',
      v_archived;
  END IF;
END;
$guard$;

-- ── 1. The seven the code queries come home, with their rows ───────────────
ALTER TABLE zz_archive.horse_source_assignments        SET SCHEMA public;
ALTER TABLE zz_archive.horse_sports_source_assignments SET SCHEMA public;
ALTER TABLE zz_archive.horse_personality               SET SCHEMA public;
ALTER TABLE zz_archive.horse_topic_cooldowns           SET SCHEMA public;
ALTER TABLE zz_archive.horse_analytics                 SET SCHEMA public;
ALTER TABLE zz_archive.horse_hand_history              SET SCHEMA public;
ALTER TABLE zz_archive.horse_opponent_journals         SET SCHEMA public;

-- `horse_memory` is not one of the thirteen (nothing reaches it through a
-- `.from()` in a scanned directory any more) but it is the other half of the
-- memory system and its 104 rows belong beside the personalities. Moved so the
-- set is coherent rather than half restored.
ALTER TABLE zz_archive.horse_memory                    SET SCHEMA public;

-- The constraint that caps the table at two rows per source. See the header.
ALTER TABLE public.horse_source_assignments
  DROP CONSTRAINT IF EXISTS horse_source_assignments_source_name_is_primary_key;

-- Without this, `pages/api/training/horse-opponent.js` asks PostgREST to embed
-- `horse_personality (...)` inside a `content_authors` select and gets PGRST200:
-- an embed needs a relationship, and the archived table never had one.
ALTER TABLE public.horse_personality
  DROP CONSTRAINT IF EXISTS horse_personality_author_id_fkey;
ALTER TABLE public.horse_personality
  ADD CONSTRAINT horse_personality_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.content_authors(id) ON DELETE CASCADE;

COMMENT ON TABLE public.horse_source_assignments IS
  'Which content source each horse draws from. Returned from zz_archive on '
  '2026-09-05 with its 100 rows intact; the UNIQUE (source_name, is_primary) '
  'that capped it at two rows per source was dropped in the same migration.';
COMMENT ON TABLE public.horse_opponent_journals IS
  'Per-horse, per-opponent running read. Returned from zz_archive 2026-09-05 '
  'with 858 rows. Written by brain/session-analytics.js on the live HUD path.';
COMMENT ON TABLE public.horse_personality IS
  'One row per content_authors.id. Returned from zz_archive 2026-09-05 with '
  '100 rows and given the foreign key its PostgREST embed needs.';

-- ── 2. The six that exist nowhere ──────────────────────────────────────────

-- Opponent modelling, written on every hand result by brain/plo-core.js.
CREATE TABLE IF NOT EXISTS public.horse_opponent_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id text NOT NULL,
  opponent_id text NOT NULL,
  bluff_frequency numeric(5,4),
  value_frequency numeric(5,4),
  fold_frequency numeric(5,4),
  call_frequency numeric(5,4),
  slow_play_tendency numeric,
  hands_observed integer DEFAULT 0,
  tendency text DEFAULT 'unknown',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horse_opponent_reads_horse_opponent_key UNIQUE (horse_id, opponent_id)
);
CREATE INDEX IF NOT EXISTS horse_opponent_reads_updated_idx
  ON public.horse_opponent_reads (updated_at DESC);

-- Per-session aggregates, written from brain/session-analytics.js. `table_id`
-- holds synthetic keys like 'evolution_<profileId>' and brain/core.js does
-- `.like('table_id','evolution_%')`, so it is text and never a foreign key.
CREATE TABLE IF NOT EXISTS public.horse_session_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text NOT NULL,
  table_id text NOT NULL,
  hands_played integer DEFAULT 0,
  vpip numeric(5,2),
  pfr numeric(5,2),
  aggression_factor numeric(5,2),
  win_rate_bb100 numeric(8,4),
  wins integer DEFAULT 0,
  losses integer DEFAULT 0,
  session_minutes numeric(8,2),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horse_session_stats_profile_table_key UNIQUE (profile_id, table_id)
);
CREATE INDEX IF NOT EXISTS horse_session_stats_profile_idx
  ON public.horse_session_stats (profile_id);

-- Written by PerformanceTracker.persistSessionStats, which GameController calls
-- from six places. Column set taken verbatim from the block in
-- 20260727161220_worldhub_missing_objects_2026_07_27.sql, which was applied and
-- has since been dropped.
CREATE TABLE IF NOT EXISTS public.horse_session_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id text NOT NULL,
  table_id text NOT NULL,
  variant text,
  big_blind numeric(12,2),
  hands_played integer DEFAULT 0,
  bb_per_100 numeric(10,3),
  total_bb_delta numeric(12,3),
  vpip numeric(6,3),
  pfr numeric(6,3),
  three_bet numeric(6,3),
  aggression_factor numeric(6,3),
  wtsd numeric(6,3),
  wsd numeric(6,3),
  session_duration_min numeric(10,2),
  total_rake_paid numeric(12,2),
  win_rate_class text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horse_session_analytics_horse_table_key UNIQUE (horse_id, table_id)
);

-- Anti-exploit. opponent_id is OCR-derived screen state, NOT an account: see
-- deviation 1 in the header.
CREATE TABLE IF NOT EXISTS public.horse_threat_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opponent_id text NOT NULL,
  suspect_bot_score integer DEFAULT 0,
  pattern_exploit_type text,
  pattern_exploit_bb numeric(12,3) DEFAULT 0,
  cross_table_hits integer DEFAULT 0,
  timebank_abuse_score integer DEFAULT 0,
  total_threat_score integer DEFAULT 0,
  blacklisted_until timestamptz,
  last_seen timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horse_threat_intel_opponent_key UNIQUE (opponent_id)
);

-- The content engine's alert log. `logError` has no callers today, but both
-- read paths are served live by pages/api/horses/analytics.js and currently
-- return empty. created_at carries a default because nothing inserts it and
-- both reads order or filter on it.
CREATE TABLE IF NOT EXISTS public.horse_error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id text,
  error_type text NOT NULL,
  error_message text,
  context jsonb DEFAULT '{}'::jsonb,
  stack_trace text,
  resolved boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS horse_error_log_created_idx
  ON public.horse_error_log (created_at DESC);

-- Horse-to-horse sentiment. sentiment_score is (positive - negative) / total
-- clamped to [-1, 1], so it is real and not an integer.
CREATE TABLE IF NOT EXISTS public.horse_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id integer NOT NULL,
  target_author_id integer NOT NULL,
  relationship_type text DEFAULT 'neutral',
  total_interactions integer DEFAULT 0,
  positive_interactions integer DEFAULT 0,
  negative_interactions integer DEFAULT 0,
  sentiment_score real DEFAULT 0,
  last_interaction_at timestamptz DEFAULT now(),
  CONSTRAINT horse_relationships_pair_key UNIQUE (author_id, target_author_id)
);
CREATE INDEX IF NOT EXISTS horse_relationships_author_idx
  ON public.horse_relationships (author_id);

-- ── 3. RLS. Every one of these is written by the service role only ─────────
DO $rls$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'horse_source_assignments','horse_sports_source_assignments','horse_personality',
    'horse_topic_cooldowns','horse_analytics','horse_hand_history',
    'horse_opponent_journals','horse_memory','horse_opponent_reads',
    'horse_session_stats','horse_session_analytics','horse_threat_intel',
    'horse_error_log','horse_relationships'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    /* No policy is created on purpose. RLS with zero policies denies every
       anon and authenticated request outright, and the service role bypasses
       RLS entirely - which is exactly the access these tables need. A policy
       here would be a wider door than the code asks for. */
  END LOOP;
END;
$rls$;

COMMIT;
