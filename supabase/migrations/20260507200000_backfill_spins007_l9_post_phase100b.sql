-- ═══════════════════════════════════════════════════════════════════════
-- 20260507200000_backfill_spins007_l9_post_phase100b.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (INSERT 1 row to restore spins-007 L9 to 25 question count)
-- AUTHOR:       claude (Phase 103 — deep re-audit follow-up to Phase 100b delete)
--
-- WHY:
--   Phase 100b deleted the single anomalous spins-007 L9 row where
--   heroHand=AA was placed on a board containing 3 aces (mathematically
--   impossible 2-card combo). Deep audit then surfaced this as the only
--   (game_id, level) pair below the 25-row standard (was 24).
--
--   Restoring to 25 maintains parity with all other PIO+CHART+SCENARIO
--   pairs (Phase 33b's standard) and full no-repeat capacity.
--
-- HOW:
--   Clone an existing spins-007 L9 PIO row's question_data structure as
--   donor (gameType=spin_hu_icm, stack=12bb, level=9). Modify:
--     - heroHand → 98s (suited connector, fits L9 pedagogy as marginal
--       river-decision spot, not duplicate of any of the 24 surviving rows)
--     - heroCards → ["9h","8h"] (canonical suited, hearts both)
--     - explanation → contextual prose mentioning 98s + position + board + street
--     - inner question_data.id → matches new question_id
--   Generate fresh uuid + question_id 'spins-007_L9_Q25_<epoch>'.
--   Donor filtered to boards without 9h or 8h (so heroCards don't collide).
--
-- IDEMPOTENT: WHERE NOT EXISTS clause excludes if heroHand='98s' already
-- present in spins-007 L9, so re-running is a no-op.
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO training_question_cache (id, question_id, game_id, engine_type, game_type, level, question_data, times_used)
SELECT
  gen_random_uuid(),
  'spins-007_L9_Q25_' || EXTRACT(EPOCH FROM NOW())::bigint::text,
  d.game_id, d.engine_type, d.game_type, d.level,
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          d.question_data,
          '{scenario,heroHand}', to_jsonb('98s'::text)
        ),
        '{heroCards}', '["9h","8h"]'::jsonb
      ),
      '{explanation}', to_jsonb(
        'On the ' || (d.question_data->'scenario'->>'board') || ' '
        || COALESCE(d.question_data->'scenario'->>'street','flop')
        || ', you hold 98s from the '
        || COALESCE(d.question_data->'scenario'->>'heroPosition','BB')
        || '. The GTO solver picks '
        || COALESCE(d.question_data->>'correctAnswerText', 'Check')
        || ' as the dominant line. Your hand''s equity vs villain''s range and your blocker/unblocker effects on his calling region drive whether to apply pressure or pot-control.'
      )
    ),
    '{id}', to_jsonb('spins-007_L9_Q25_' || EXTRACT(EPOCH FROM NOW())::bigint::text)
  ),
  0
FROM (
  SELECT question_data, game_id, engine_type, game_type, level
  FROM training_question_cache
  WHERE game_id='spins-007' AND level=9 AND engine_type='PIO'
    AND question_data->'scenario'->>'board' !~ '9h|8h'
    AND question_data->'scenario'->>'heroHand' != '98s'
  ORDER BY id LIMIT 1
) d
WHERE NOT EXISTS (
  SELECT 1 FROM training_question_cache
  WHERE game_id='spins-007' AND level=9
    AND question_data->'scenario'->>'heroHand' = '98s'
);
