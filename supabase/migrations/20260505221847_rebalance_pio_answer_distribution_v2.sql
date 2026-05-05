-- ═══════════════════════════════════════════════════════════════════════
-- 20260505221847_rebalance_pio_answer_distribution_v2.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE swapping heroHand on ~6,662 PIO rows)
-- AUTHOR:       claude (Phase 11 PIO answer rebalance)
-- IRREVERSIBLE: yes (heroHand replaced; old hand reference lost)
--
-- WHY:
--   Audit found PIO questions had 88.9% Check / 11.1% Bet correctAnswer
--   distribution. A user always picking "Check" got 89% accuracy without
--   poker knowledge. Root cause: each question randomly picks a hand from
--   the strategy_matrix's frequencies, and most spots have most hands
--   preferring Check (real solver behavior). Random selection skews toward
--   the dominant action.
--
--   Fix: for ~50% of c-correct PIO rows (deterministic md5 selection),
--   swap heroHand to a hand from the SAME rawFrequencies matrix where
--   b16 frequency exceeds c frequency. The matrix is unchanged — only
--   which hand is highlighted changes. correctAnswer recomputes to b16.
--   evData.heroHandEV gets the new hand's EV from handEVs map.
--
--   Result: 88.9/11.1 → 57.1/42.9. Always-pick-Check exploit reduced
--   from 89% to 57% accuracy.
--
-- HOW:
--   PL/pgSQL helper fn_swap_to_bet_hand(jsonb) does the per-row work:
--     1. Find a hand where rawFrequencies.b16[h] > rawFrequencies.c[h]
--     2. Update heroHand, correctAnswer='b16', correctAnswerText
--     3. Rewrite top-level frequencies + gtoFrequencies for new hand
--     4. Update evData.heroHand, evData.heroHandEV from handEVs
--     5. Rewrite question text "You hold X on..." to mention new hand
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION fn_swap_to_bet_hand(qd jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $func$
DECLARE
    raw_b16 jsonb := qd->'rawFrequencies'->'b16';
    raw_c jsonb := qd->'rawFrequencies'->'c';
    new_hand text;
    new_b16_f numeric;
    new_c_f numeric;
    handev jsonb := qd->'evData'->'handEVs';
    new_ev numeric;
    old_q text := qd->>'question';
    new_q text;
BEGIN
    SELECT k INTO new_hand
    FROM jsonb_object_keys(raw_b16) k
    WHERE (raw_b16->>k)::numeric > COALESCE((raw_c->>k)::numeric, 0)
    ORDER BY md5(qd->>'id' || ':' || k)
    LIMIT 1;

    IF new_hand IS NULL THEN
        RETURN qd;
    END IF;

    new_b16_f := COALESCE((raw_b16->>new_hand)::numeric, 0);
    new_c_f := COALESCE((raw_c->>new_hand)::numeric, 0);
    new_ev := COALESCE((handev->>new_hand)::numeric, 0);
    new_q := REGEXP_REPLACE(old_q, 'You hold \w+ on', 'You hold ' || new_hand || ' on');

    RETURN
        jsonb_set(
        jsonb_set(
        jsonb_set(
        jsonb_set(
        jsonb_set(
        jsonb_set(
        jsonb_set(
            qd, '{heroHand}', to_jsonb(new_hand)),
            '{correctAnswer}', to_jsonb('b16'::text)),
            '{correctAnswerText}', to_jsonb('Bet 16% pot'::text)),
            '{question}', to_jsonb(new_q)),
            '{scenario,heroHand}', to_jsonb(new_hand)),
            '{frequencies}', jsonb_build_object(
                'c', to_jsonb(new_c_f), 'b16', to_jsonb(new_b16_f))),
            '{gtoFrequencies}', jsonb_build_object(
                'c', to_jsonb(round(new_c_f * 100)::int),
                'b16', to_jsonb(round(new_b16_f * 100)::int)))
        || jsonb_build_object('evData',
            (qd->'evData')
            || jsonb_build_object('heroHand', new_hand, 'heroHandEV', new_ev));
END;
$func$;

WITH targets AS (
    SELECT id, question_data
    FROM training_question_cache
    WHERE question_data->>'type' = 'PIO'
      AND question_data->>'correctAnswer' = 'c'
      AND question_data->'rawFrequencies'->'b16' IS NOT NULL
      AND question_id NOT LIKE '%_v5bal'
      AND substr(md5(id::text || ':rebal'), 1, 1) < '8'  -- ~50% deterministic
)
UPDATE training_question_cache c
SET question_data = fn_swap_to_bet_hand(c.question_data),
    question_id = c.question_id || '_v5bal'
FROM targets t
WHERE c.id = t.id
  AND fn_swap_to_bet_hand(c.question_data)->>'correctAnswer' = 'b16';

DROP FUNCTION IF EXISTS fn_swap_to_bet_hand(jsonb);

COMMIT;
