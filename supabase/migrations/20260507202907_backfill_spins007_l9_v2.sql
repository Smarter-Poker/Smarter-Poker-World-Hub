-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: backfill_spins007_l9_v2
-- Version:   20260507202907
-- Applied:   2026-05-07 via Supabase MCP apply_migration
-- Audit:     Rule 2 backfill — registered in supabase_migrations.schema_migrations
--            but missing repo file. Captured here from the schema_migrations
--            statements column verbatim.
--
-- Context (from migration SQL): Phase 103 retry of the spins-007 L9 question
--            backfill, including the previously missing game_type column to
--            satisfy NOT NULL. Adds one new training_question_cache row for
--            level 9 by cloning a donor row and rewriting heroHand=98s,
--            heroCards=[9h,8h], a fresh question id, and a new explanation.
-- ═══════════════════════════════════════════════════════════════════════════

-- Phase 103 retry: include game_type column (NOT NULL constraint)
WITH donor AS (
  SELECT question_data, game_id, engine_type, game_type, level
  FROM training_question_cache
  WHERE game_id='spins-007' AND level=9 AND engine_type='PIO'
    AND question_data->'scenario'->>'board' !~ '9h|8h'
    AND question_data->'scenario'->>'heroHand' != '98s'
  ORDER BY id LIMIT 1
), new_row AS (
  SELECT 
    gen_random_uuid() AS new_id,
    'spins-007_L9_Q25_' || EXTRACT(EPOCH FROM NOW())::bigint::text AS new_qid,
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
    ) AS new_qd,
    d.game_id, d.engine_type, d.game_type, d.level
  FROM donor d
)
INSERT INTO training_question_cache (id, question_id, game_id, engine_type, game_type, level, question_data, times_used)
SELECT new_id, new_qid, game_id, engine_type, game_type, level, new_qd, 0 FROM new_row;
