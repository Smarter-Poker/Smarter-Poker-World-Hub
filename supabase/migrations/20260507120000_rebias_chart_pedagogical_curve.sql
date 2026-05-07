-- ═══════════════════════════════════════════════════════════════════════
-- 20260507120000_rebias_chart_pedagogical_curve.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE ~250-400 CHART rows across L1-10 — heroHand swap)
-- AUTHOR:       claude (Phase 80 — extend Phase 77/78/79 to CHART engine)
--
-- WHY:
--   Phase 76 audit found CHART (push/fold) rows had 0.6-0.8% premium and
--   86-90% trash hands at L1-3, mirroring the inversion that PIO had
--   pre-Phase-77. CHART correctAnswer split is already healthy (52/48
--   push/fold at L1) so this is purely a pedagogical-fundamentals
--   injection — beginners need to see "AA always pushes" drilled in
--   before tackling marginal A4s/Q9s decisions.
--
--   Lighter targets than PIO because CHART balance is fine and advanced
--   marginal-hand drills are legitimately useful at L8-10. Curve target:
--      L1-3:  0.7%  →  ~50% premium (mirror PIO 77 curve)
--      L4-7:  3-5%  →  ~25% premium (intermediate mix)
--      L8-10: 3-5%  →  ~12% premium (preserve marginal-decision pool)
--
-- HOW:
--   fn_swap_chart_to_premium_hand(qd) helper:
--     Premium hands ALWAYS push at every position × stack 5-20bb in
--     memory_charts_gold (verified across 24 (pos,stack) combinations,
--     all show AA/KK/QQ/JJ/AKs/AKo with push=1). So the swap is
--     deterministic and chart-lookup-free:
--       1. heroHand → new premium
--       2. scenario.heroHand → new premium
--       3. options → [{push,100},{fold,0}]
--       4. correctAnswer → 'push'
--       5. question text "<POS> with X at <STACK>BB" → "<POS> with NEW at <STACK>BB"
--       6. explanation → templated premium-push prose (replaces stale text
--          that may reference old hand)
--
--   Premium pool [AA, KK, QQ, JJ, AKs, AKo, AQs] picked from md5 of
--   row id for deterministic, idempotent selection.
--
-- IDEMPOTENT: WHERE clause excludes already-premium-or-strong hands;
-- re-running skips them.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_swap_chart_to_premium_hand(qd jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  candidates TEXT[] := ARRAY['AA','KK','QQ','JJ','AKs','AKo','AQs'];
  idx INT;
  new_hand TEXT;
  old_q TEXT := qd->>'question';
  new_q TEXT;
  pos TEXT := qd->'scenario'->>'heroPosition';
  stack TEXT := qd->'scenario'->>'stackDepth';
  new_explanation TEXT;
BEGIN
  -- Deterministic premium pick from md5 of id
  idx := (('x' || substr(md5(COALESCE(qd->>'id','x')), 1, 8))::bit(32)::int % 7);
  IF idx < 0 THEN idx := idx + 7; END IF;
  new_hand := candidates[idx + 1];
  IF new_hand IS NULL THEN new_hand := 'AA'; END IF;

  new_q := REGEXP_REPLACE(old_q, 'with \w+ at', 'with ' || new_hand || ' at');

  new_explanation := 'In this short-stack push/fold spot, ' || new_hand
    || ' is a premium hand that pushes 100% from ' || COALESCE(pos,'this position')
    || ' at ' || COALESCE(stack,'this') || 'bb. Premium pocket pairs (AA-JJ) and '
    || 'big aces (AKs/AKo/AQs) are auto-shoves at every short-stack depth — '
    || 'their equity vs any calling range plus fold equity makes pushing '
    || 'strictly +EV vs folding. Per Nash equilibrium push/fold charts, '
    || 'this hand is firmly inside the pushing range with no mixed-strategy '
    || 'consideration. The correct play is to push all-in.';

  RETURN jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
        qd, '{heroHand}', to_jsonb(new_hand)),
        '{scenario,heroHand}', to_jsonb(new_hand)),
        '{options}', jsonb_build_array(
          jsonb_build_object('id','push','text','Push All-In','frequency',100),
          jsonb_build_object('id','fold','text','Fold','frequency',0))),
        '{correctAnswer}', to_jsonb('push'::text)),
        '{question}', to_jsonb(new_q)),
        '{explanation}', to_jsonb(new_explanation));
END;
$$;

BEGIN;

-- ───── L1-3 BLANKET-ish: ~50% of non-premium-strong-medium rows → premium
WITH targets_l1_3 AS (
  SELECT id, fn_swap_chart_to_premium_hand(question_data) AS new_qd
  FROM training_question_cache
  WHERE engine_type = 'CHART' AND level <= 3
    AND question_data->'scenario'->>'heroHand' !~ '^(AA|KK|QQ|JJ|TT|99|88|77|AKs|AKo|AQs|AQo|AJs|AJo|KQs|KQo|KJs|QJs|JTs)$'
    AND substr(md5(id::text || ':chart_l1_3'), 1, 1) < '8'
)
UPDATE training_question_cache c
SET question_data = t.new_qd
FROM targets_l1_3 t
WHERE c.id = t.id
  AND t.new_qd IS NOT NULL
  AND t.new_qd->'scenario'->>'heroHand' != c.question_data->'scenario'->>'heroHand';

-- ───── L4-7 PARTIAL: ~31% of non-premium rows → premium
WITH targets_l4_7 AS (
  SELECT id, fn_swap_chart_to_premium_hand(question_data) AS new_qd
  FROM training_question_cache
  WHERE engine_type = 'CHART' AND level BETWEEN 4 AND 7
    AND question_data->'scenario'->>'heroHand' !~ '^(AA|KK|QQ|JJ|TT|99|88|77|AKs|AKo|AQs|AQo|AJs|AJo|KQs|KQo|KJs|QJs|JTs|ATs|KTs)$'
    AND substr(md5(id::text || ':chart_l4_7'), 1, 1) < '5'
)
UPDATE training_question_cache c
SET question_data = t.new_qd
FROM targets_l4_7 t
WHERE c.id = t.id
  AND t.new_qd IS NOT NULL
  AND t.new_qd->'scenario'->>'heroHand' != c.question_data->'scenario'->>'heroHand';

-- ───── L8-10 LIGHT: ~19% of non-premium rows → premium
WITH targets_l8_10 AS (
  SELECT id, fn_swap_chart_to_premium_hand(question_data) AS new_qd
  FROM training_question_cache
  WHERE engine_type = 'CHART' AND level BETWEEN 8 AND 10
    AND question_data->'scenario'->>'heroHand' !~ '^(AA|KK|QQ|JJ|TT|99|88|77|66|55|AKs|AKo|AQs|AQo|AJs|AJo|ATs|ATo|KQs|KQo|KJs|KJo|KTs|QJs|QJo|QTs|JTs)$'
    AND substr(md5(id::text || ':chart_l8_10'), 1, 1) < '3'
)
UPDATE training_question_cache c
SET question_data = t.new_qd
FROM targets_l8_10 t
WHERE c.id = t.id
  AND t.new_qd IS NOT NULL
  AND t.new_qd->'scenario'->>'heroHand' != c.question_data->'scenario'->>'heroHand';

COMMIT;
