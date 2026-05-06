-- ═══════════════════════════════════════════════════════════════════════
-- 20260506120000_enrich_terse_chart_question_text_and_action.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE up to 1,000 CHART rows — text only)
-- AUTHOR:       claude (Phase 56 quality fix)
--
-- WHY:
--   Phase 56 audit found 250 CHART rows with question text just
--   "Push or Fold?" (15 chars) — no context, user can't see hand or
--   stack from the question alone. Other 750 CHART rows had decent
--   context but used raw action code "fold_to_hero" instead of
--   "Folded to you" — looked like a programming variable leaked into
--   user-facing copy.
--
-- HOW:
--   Two-step migration:
--     1. Compose context-rich question text for the 250 terse rows from
--        scenario fields: "<position> with <hand> at <stack>BB.
--        <action>. Push or Fold?".
--     2. Replace 'fold_to_hero' raw code with 'Folded to you' across
--        all CHART rows (in scenario.action AND in question text).
--
-- VERIFICATION:
--   Post-migration: 0 rows with question text <20 chars, 0 rows with
--   'fold_to_hero' in question text, all CHART rows render with
--   position + hand + stack + action + ask.
--
-- IDEMPOTENT: WHERE clauses skip already-enriched rows.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE training_question_cache
SET question_data = jsonb_set(
  question_data,
  '{question}',
  to_jsonb(
    COALESCE(question_data->'scenario'->>'heroPosition', 'Hero') ||
    ' with ' || COALESCE(question_data->'scenario'->>'heroHand', '?') ||
    ' at ' || COALESCE(question_data->'scenario'->>'stackDepth', '?') || 'BB. ' ||
    COALESCE(NULLIF(question_data->'scenario'->>'action', ''), 'Folded to you') || '. ' ||
    'Push or Fold?'
  ),
  true
)
WHERE question_data->>'type' = 'CHART'
  AND LENGTH(question_data->>'question') < 20;

UPDATE training_question_cache
SET question_data = jsonb_set(question_data, '{scenario,action}', '"Folded to you"', true)
WHERE question_data->>'type' = 'CHART'
  AND question_data->'scenario'->>'action' = 'fold_to_hero';

UPDATE training_question_cache
SET question_data = jsonb_set(
  question_data, '{question}',
  to_jsonb(REPLACE(question_data->>'question', 'fold_to_hero', 'Folded to you')),
  true
)
WHERE question_data->>'type' = 'CHART'
  AND question_data->>'question' LIKE '%fold_to_hero%';

COMMIT;
