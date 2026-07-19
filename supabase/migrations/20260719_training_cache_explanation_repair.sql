-- 2026-07-19 Training engine audit phase 2 (DATA migration, applied via MCP)
-- The 5,174 answer-key-repaired training_question_cache rows kept their
-- pre-repair explanation prose, which could still describe the OLD wrong
-- strategy (e.g. bars showing Check 100% next to "the solver mixes Check
-- 75% / Bet 25%"). Regenerate explanation deterministically from the
-- reconciled gtoFrequencies + option labels. Idempotent.

WITH rows AS (
  SELECT id, question_data AS qd FROM training_question_cache
  WHERE question_data->>'answerKeyReconciled' = 'true'
    AND jsonb_typeof(question_data->'gtoFrequencies') = 'object'
    AND jsonb_typeof(question_data->'options') = 'array'
),
pcts AS (
  SELECT r.id, e.key, e.value::numeric AS pct
  FROM rows r, jsonb_each_text(r.qd->'gtoFrequencies') e
  WHERE e.value ~ '^[0-9]+$'
),
labels AS (
  SELECT r.id, o->>'id' AS oid, COALESCE(o->>'text', o->>'id') AS label
  FROM rows r, jsonb_array_elements(r.qd->'options') o
),
joined AS (
  SELECT p.id, p.key, p.pct, COALESCE(l.label, p.key) AS label
  FROM pcts p LEFT JOIN labels l ON l.id = p.id AND l.oid = p.key
),
agg AS (
  SELECT id,
         max(pct) AS maxpct,
         (array_agg(label ORDER BY pct DESC))[1] AS best_label,
         string_agg(label || ' ' || pct::int || '%', ', ' ORDER BY pct DESC)
           FILTER (WHERE pct > 0) AS mix_text
  FROM joined GROUP BY id
),
final AS (
  SELECT id,
         CASE WHEN maxpct >= 95
              THEN 'According to GTO, this is a pure ' || best_label || ' (' || maxpct::int || '% frequency).'
              ELSE 'GTO mixes here: ' || mix_text || '. The highest-frequency play is ' || best_label || '.'
         END AS new_explanation
  FROM agg
)
UPDATE training_question_cache t
SET question_data = t.question_data || jsonb_build_object('explanation', f.new_explanation)
FROM final f
WHERE t.id = f.id
  AND t.question_data->>'explanation' IS DISTINCT FROM f.new_explanation;
