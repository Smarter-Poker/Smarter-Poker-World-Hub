-- ═══════════════════════════════════════════════════════════════════════
-- 20260507210000_fix_phase77_swap_collateral_drift.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE ~5,088 PIO rows — collateral fields from Phase 77/78/79)
-- AUTHOR:       claude (Phase 104 — deep wiring audit caught field drift)
--
-- WHY:
--   Phase 104 deep audit caught two systemic bugs from Phases 77/78/79's
--   incomplete swap-helper logic:
--
--   (A) 5,088 PIO rows have options[].frequency != gtoFrequencies[opt.id]
--       — Phase 77 rebuilt options array from rawFrequencies but did not
--       update top-level gtoFrequencies. Result: UI shows different
--       percentages on option labels vs the gtoFrequencies bar chart.
--
--   (B) 4,243 PIO rows have evData.heroHand != scenario.heroHand
--       — Phase 77 swapped scenario.heroHand but did not update
--       evData.heroHand or evData.heroHandEV. Result: FeedbackCard's
--       EV display references the OLD hand's EV value.
--
--   (C) Phase 103's spins-007 L9 backfill (heroHand=98s) inherited 6 stale
--       fields from its donor: top-level heroHand="85o", question text
--       references 85o, evData has 85o data, frequencies/gtoFrequencies/
--       options[].frequency are 85o's (97/3) not 98s's (100/0). Caught
--       on inspection of the row I just inserted.
--
-- HOW:
--   Three fixes in one migration:
--   (A) Rebuild gtoFrequencies from options[]: for each row, iterate options
--       array and write {id: frequency} into gtoFrequencies.
--   (B) Sync evData.heroHand to scenario.heroHand and update evData.heroHandEV
--       from evData.handEVs[scenario.heroHand] when available.
--   (C) Hand-patch the spins-007 L9 98s row's stale derivative fields.
--
-- IDEMPOTENT: each UPDATE excludes already-consistent rows. Re-running
-- mutates 0 rows post-fix.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ───── Fix (A): gtoFrequencies rebuild from options[] ─────
UPDATE training_question_cache
SET question_data = jsonb_set(
  question_data,
  '{gtoFrequencies}',
  (
    SELECT COALESCE(jsonb_object_agg(opt->>'id', (opt->>'frequency')::int), '{}'::jsonb)
    FROM jsonb_array_elements(question_data->'options') opt
    WHERE opt->>'id' IS NOT NULL AND opt->>'frequency' IS NOT NULL
  )
)
WHERE engine_type = 'PIO'
  AND jsonb_typeof(question_data->'options') = 'array'
  AND jsonb_array_length(question_data->'options') > 0
  AND NOT (
    SELECT bool_and(
      (question_data->'gtoFrequencies'->>(opt->>'id'))::int = (opt->>'frequency')::int
    )
    FROM jsonb_array_elements(question_data->'options') opt
    WHERE opt->>'id' IS NOT NULL AND opt->>'frequency' IS NOT NULL
  );

-- ───── Fix (B): evData.heroHand + heroHandEV resync ─────
UPDATE training_question_cache
SET question_data = jsonb_set(
  jsonb_set(
    question_data,
    '{evData,heroHand}',
    to_jsonb(question_data->'scenario'->>'heroHand')
  ),
  '{evData,heroHandEV}',
  COALESCE(
    question_data->'evData'->'handEVs'->(question_data->'scenario'->>'heroHand'),
    question_data->'evData'->'heroHandEV',
    to_jsonb(0)
  )
)
WHERE engine_type = 'PIO'
  AND question_data->'evData'->>'heroHand' IS NOT NULL
  AND question_data->'scenario'->>'heroHand' IS NOT NULL
  AND question_data->'evData'->>'heroHand' != question_data->'scenario'->>'heroHand';

-- ───── Fix (C): spins-007 L9 98s backfill row's stale fields ─────
UPDATE training_question_cache
SET question_data = jsonb_set(
  jsonb_set(
    jsonb_set(
      question_data,
      '{heroHand}',
      to_jsonb('98s'::text)
    ),
    '{question}',
    to_jsonb('You hold 98s on the turn. Board: 5c 9c Kh Qs. What is the GTO play?'::text)
  ),
  '{options}',
  '[{"id":"c","text":"Check","frequency":100},{"id":"b16","text":"Bet 16%","frequency":0}]'::jsonb
)
WHERE game_id='spins-007' AND level=9
  AND question_data->'scenario'->>'heroHand' = '98s';

COMMIT;
