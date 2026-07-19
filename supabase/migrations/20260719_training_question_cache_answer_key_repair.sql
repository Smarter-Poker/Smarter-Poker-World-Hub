-- 2026-07-19 Training engine audit — answer-key repair (DATA migration)
-- Applied to production 2026-07-19 in 16 uuid-prefix batches via Supabase MCP
-- (single-statement run exceeded the 60s API budget; logic below is identical,
-- run per left(id::text,1) prefix '0'..'f').
--
-- WHY: 1,471 of 21,631 reconcilable training_question_cache rows had a
-- `correctAnswer` that was NOT the highest-frequency action of the row's own
-- solver `frequencies`; thousands more had gtoFrequencies display bars
-- diverging from those frequencies, and correctAnswerText labels
-- contradicting the answer code (e.g. AA on Qc3h5c: frequencies
-- {c:0.49,b16:0.51} but correctAnswer 'c' + text 'Bet 16% pot' + bars 75/25).
-- Users were being graded against the wrong GTO answer.
--
-- WHAT: recompute correctAnswer (argmax of frequencies), correctAnswerText
-- (matching option label) and gtoFrequencies (normalized whole percentages
-- summing to 100) from the canonical `frequencies` field. Rows are only
-- touched when frequencies form a sane distribution (>=2 numeric entries,
-- total mass in (0,105]) AND every frequency key maps onto a served option
-- id. `frequencies` itself is never modified -> idempotent, re-derivable.
-- Result: 5,174 rows updated; argmax mismatches 1,572 -> 94 (the remainder
-- have frequency keys that don't map onto their options and are left as-is;
-- the same reconciliation also runs at read time in
-- src/utils/trainingApiUtils.js reconcileAnswerKey()).

WITH rows AS (
  SELECT id, question_data AS qd FROM training_question_cache
  WHERE jsonb_typeof(question_data->'frequencies') = 'object'
    AND jsonb_typeof(question_data->'options') = 'array'
),
f AS (
  SELECT r.id, e.key,
         CASE WHEN e.value ~ '^-?[0-9]+\.?[0-9]*([eE][-+]?[0-9]+)?$' THEN e.value::numeric END AS v
  FROM rows r, jsonb_each_text(r.qd->'frequencies') e
),
opt AS (
  SELECT r.id, array_agg(o->>'id') AS oids
  FROM rows r, jsonb_array_elements(r.qd->'options') o
  GROUP BY r.id
),
fa AS (
  SELECT f.id, count(*) AS n, count(f.v) AS nv, sum(f.v) AS total, min(f.v) AS minv,
         bool_and(f.key = ANY(o.oids)) AS keys_ok
  FROM f JOIN opt o ON o.id = f.id
  GROUP BY f.id
),
valid AS (
  SELECT id, total FROM fa
  WHERE n >= 2 AND n = nv AND minv >= 0 AND total > 0 AND total <= 105 AND keys_ok
),
best AS (
  SELECT DISTINCT ON (f.id) f.id, f.key AS best_key
  FROM f JOIN valid USING (id)
  ORDER BY f.id, f.v DESC
),
pct AS (
  SELECT f.id,
         jsonb_object_agg(f.key, round(f.v / v.total * 100)::int) AS pcts,
         sum(round(f.v / v.total * 100)::int) AS psum
  FROM f JOIN valid v USING (id)
  GROUP BY f.id
),
btext AS (
  SELECT DISTINCT ON (r.id) r.id, o->>'text' AS best_text
  FROM rows r
  JOIN best b ON b.id = r.id
  CROSS JOIN LATERAL jsonb_array_elements(r.qd->'options') o
  WHERE o->>'id' = b.best_key
  ORDER BY r.id
),
final AS (
  SELECT b.id, b.best_key, bt.best_text,
         jsonb_set(p.pcts, ARRAY[b.best_key],
                   to_jsonb(GREATEST(0, (p.pcts->>b.best_key)::int + (100 - p.psum)))) AS pcts_fixed
  FROM best b
  JOIN pct p ON p.id = b.id
  LEFT JOIN btext bt ON bt.id = b.id
)
UPDATE training_question_cache t
SET question_data = t.question_data
    || jsonb_build_object('correctAnswer', fin.best_key)
    || CASE WHEN fin.best_text IS NOT NULL
            THEN jsonb_build_object('correctAnswerText', fin.best_text)
            ELSE '{}'::jsonb END
    || jsonb_build_object('gtoFrequencies', fin.pcts_fixed, 'answerKeyReconciled', true)
FROM final fin
WHERE t.id = fin.id
  AND (t.question_data->>'correctAnswer' IS DISTINCT FROM fin.best_key
       OR t.question_data->'gtoFrequencies' IS DISTINCT FROM fin.pcts_fixed);

-- ROLLBACK: re-derive from `frequencies` (untouched) or restore
-- correctAnswer/correctAnswerText/gtoFrequencies from a PITR snapshot;
-- rows are identifiable via question_data->>'answerKeyReconciled' = 'true'.
