-- ═══════════════════════════════════════════════════════════════════════════
-- Repair blind structures stored under legacy key names.
--
-- APPLIED TO PRODUCTION 2026-08-22 via the Supabase MCP before this file was
-- committed (12 rows backed up, 12 repaired, 0 remaining, 0 length drift).
--
-- WHAT IS WRONG
-- Twelve commander_tournaments rows hold blind_structure levels shaped
--   { "big": 50, "small": 25, "ante": 0, "level": 1, "duration": 20 }
-- instead of the canonical
--   { "big_blind": 50, "small_blind": 25, "ante": 0, "level": 1, "duration": 20 }
--
-- Nothing in the app reads "big"/"small". structureValidation.normalizeStructure
-- aliases them at READ time so the validator does not report a false "no big
-- blind", and any screen that loads through it writes canonical keys back on
-- the next save. But a tournament nobody re-saves never gets repaired, and
-- until it is, the clock display and the settings screen show 0/0 blinds.
-- Two of the twelve were still in 'scheduled'/'registration' status, so this
-- was not purely historic data.
--
-- WHAT THIS DOES
-- Rewrites the affected arrays in place to the canonical keys, element for
-- element, preserving order, length, break rows and every other key. The
-- legacy aliases are DROPPED rather than left alongside the canonical ones:
-- firstDefined() in structureValidation.js prefers big_blind once it exists,
-- so a surviving "big" would be dead data that a later editor could contradict
-- without anything noticing.
--
-- SAFETY
-- Idempotent: the WHERE clause only matches rows that still lack big_blind on
-- a non-break level, so a second run is a no-op. The pre-image of every
-- affected row is copied to commander_blind_structure_backup_20260822 first,
-- and the assertions at the end abort the whole migration if any array changed
-- length or if any affected row came out without canonical keys.
--
-- ROLLBACK
--   UPDATE commander_tournaments t
--      SET blind_structure = b.blind_structure
--     FROM commander_blind_structure_backup_20260822 b
--    WHERE t.id = b.tournament_id;
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS commander_blind_structure_backup_20260822 (
  tournament_id   uuid PRIMARY KEY,
  tournament_name text,
  blind_structure jsonb NOT NULL,
  backed_up_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE commander_blind_structure_backup_20260822 IS
  'Pre-image rollback for the 2026-08-22 legacy blind-key repair ({big,small} -> {big_blind,small_blind}). Safe to drop once the repaired structures have been reviewed.';

-- Lock it down IN THIS FILE. CREATE TABLE in the public schema leaves RLS off
-- and the anon/authenticated grants in place, which trips the
-- `no_rls_off_tables_writable_by_clients` economy invariant and turns the
-- Build Safety Gate red for every branch, not just this one. That is exactly
-- what happened on 2026-08-22. A rollback artifact holding tournament names
-- and structures is service_role-only.
REVOKE ALL ON TABLE commander_blind_structure_backup_20260822 FROM PUBLIC;
REVOKE ALL ON TABLE commander_blind_structure_backup_20260822 FROM anon;
REVOKE ALL ON TABLE commander_blind_structure_backup_20260822 FROM authenticated;
ALTER TABLE commander_blind_structure_backup_20260822 ENABLE ROW LEVEL SECURITY;

WITH affected AS (
  SELECT id, name, blind_structure
    FROM commander_tournaments
   WHERE blind_structure IS NOT NULL
     AND jsonb_typeof(blind_structure) = 'array'
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(blind_structure) e
        WHERE COALESCE((e->>'is_break')::boolean, false) = false
          AND NOT (e ? 'big_blind')
          AND (e ? 'big' OR e ? 'bb' OR e ? 'bigBlind')
     )
)
INSERT INTO commander_blind_structure_backup_20260822 (tournament_id, tournament_name, blind_structure)
SELECT id, name, blind_structure FROM affected
ON CONFLICT (tournament_id) DO NOTHING;

WITH affected AS (
  SELECT id, blind_structure
    FROM commander_tournaments
   WHERE blind_structure IS NOT NULL
     AND jsonb_typeof(blind_structure) = 'array'
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(blind_structure) e
        WHERE COALESCE((e->>'is_break')::boolean, false) = false
          AND NOT (e ? 'big_blind')
          AND (e ? 'big' OR e ? 'bb' OR e ? 'bigBlind')
     )
),
rebuilt AS (
  SELECT a.id,
         (SELECT jsonb_agg(
                   CASE
                     WHEN COALESCE((e.value->>'is_break')::boolean, false) THEN e.value
                     ELSE (e.value - 'big' - 'small' - 'bb' - 'sb' - 'bigBlind' - 'smallBlind')
                          || jsonb_strip_nulls(jsonb_build_object(
                               'big_blind',
                                 NULLIF(COALESCE(e.value->>'big_blind', e.value->>'big',
                                                 e.value->>'bb', e.value->>'bigBlind'), '')::numeric,
                               'small_blind',
                                 NULLIF(COALESCE(e.value->>'small_blind', e.value->>'small',
                                                 e.value->>'sb', e.value->>'smallBlind'), '')::numeric
                             ))
                   END
                   ORDER BY e.ordinality)
            FROM jsonb_array_elements(a.blind_structure) WITH ORDINALITY e) AS fixed
    FROM affected a
)
UPDATE commander_tournaments t
   SET blind_structure = r.fixed,
       updated_at = now()
  FROM rebuilt r
 WHERE t.id = r.id
   AND r.fixed IS NOT NULL
   AND jsonb_array_length(r.fixed) = jsonb_array_length(t.blind_structure);

-- ── Post-apply assertions. Any failure aborts the migration. ───────────────
DO $$
DECLARE
  n_backed   integer;
  n_left     integer;
  n_lenwrong integer;
BEGIN
  SELECT count(*) INTO n_backed FROM commander_blind_structure_backup_20260822;

  -- No non-break level anywhere may still be missing big_blind while carrying
  -- a legacy alias. If any survive, the rewrite did not cover them.
  SELECT count(*) INTO n_left
    FROM commander_tournaments
   WHERE blind_structure IS NOT NULL
     AND jsonb_typeof(blind_structure) = 'array'
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(blind_structure) e
        WHERE COALESCE((e->>'is_break')::boolean, false) = false
          AND NOT (e ? 'big_blind')
          AND (e ? 'big' OR e ? 'bb' OR e ? 'bigBlind')
     );
  IF n_left > 0 THEN
    RAISE EXCEPTION 'Blind repair incomplete: % tournament(s) still hold legacy blind keys', n_left;
  END IF;

  -- Every repaired row must have the same number of levels it started with.
  SELECT count(*) INTO n_lenwrong
    FROM commander_blind_structure_backup_20260822 b
    JOIN commander_tournaments t ON t.id = b.tournament_id
   WHERE jsonb_array_length(t.blind_structure) <> jsonb_array_length(b.blind_structure);
  IF n_lenwrong > 0 THEN
    RAISE EXCEPTION 'Blind repair changed level count on % tournament(s)', n_lenwrong;
  END IF;

  RAISE NOTICE 'Blind key repair complete. % tournament(s) backed up and repaired.', n_backed;
END $$;
