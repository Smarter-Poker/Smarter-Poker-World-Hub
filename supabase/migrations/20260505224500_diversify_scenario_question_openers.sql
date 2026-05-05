-- ═══════════════════════════════════════════════════════════════════════
-- 20260505224500_diversify_scenario_question_openers.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2   (UPDATE on ~3,624 SCENARIO rows — text only)
-- AUTHOR:       claude (Phase 14 phrasing diversity)
--
-- WHY:
--   89.9% of SCENARIO questions started with "How should you mentally
--   handle" or "How should you handle" — a templated feel that hurt
--   immersion even when the underlying scenarios varied. This migration
--   diversifies those two dominant openers into 16 alternative phrasings
--   each (rotated deterministically by md5 of question id), reducing the
--   top 4-word opener share from 28.9% to 8.7%.
--
-- HOW:
--   Two UPDATEs, one per opener. The CASE expression uses md5 of the row's
--   id to pick one of 16 hex digits (deterministic), each mapping to a
--   different replacement opener. The remainder of the question text
--   (after the matched prefix) is preserved.
--
-- IDEMPOTENT: re-running is a no-op because none of the new openers start
-- with "How should you (mentally )?handle ".
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- Variant A: "How should you mentally handle X" → 16 alternatives
UPDATE training_question_cache
SET question_data = jsonb_set(question_data, '{question}',
    to_jsonb(
        CASE substr(md5(question_data->>'id' || ':open1'), 1, 1)
            WHEN '0' THEN 'What is your mental approach to '
            WHEN '1' THEN 'How can you stay grounded when facing '
            WHEN '2' THEN 'What disciplined response fits '
            WHEN '3' THEN 'How can you mentally process '
            WHEN '4' THEN 'Which mindset best handles '
            WHEN '5' THEN 'How do you maintain composure through '
            WHEN '6' THEN 'What is the right mental frame for '
            WHEN '7' THEN 'How should you internally manage '
            WHEN '8' THEN 'What focused approach addresses '
            WHEN '9' THEN 'How do you mentally work through '
            WHEN 'a' THEN 'What is your psychological response to '
            WHEN 'b' THEN 'How can you keep your edge during '
            WHEN 'c' THEN 'What mental habit serves you best in '
            WHEN 'd' THEN 'How do you remain disciplined facing '
            WHEN 'e' THEN 'What grounded response fits '
            ELSE 'How would you mentally navigate '
        END
        || REGEXP_REPLACE(question_data->>'question',
            '^How should you mentally handle ', '', 'i')
    ),
    true
)
WHERE question_data->>'type' = 'SCENARIO'
  AND question_data->>'question' ILIKE 'How should you mentally handle %';

-- Variant B: "How should you handle X" → 16 alternatives
UPDATE training_question_cache
SET question_data = jsonb_set(question_data, '{question}',
    to_jsonb(
        CASE substr(md5(question_data->>'id' || ':open2'), 1, 1)
            WHEN '0' THEN 'What is your best response to '
            WHEN '1' THEN 'How do you navigate '
            WHEN '2' THEN 'Which approach fits '
            WHEN '3' THEN 'How would you tackle '
            WHEN '4' THEN 'What is your move with '
            WHEN '5' THEN 'How do you respond to '
            WHEN '6' THEN 'What is the right play in '
            WHEN '7' THEN 'How can you address '
            WHEN '8' THEN 'What approach makes sense for '
            WHEN '9' THEN 'How do you work through '
            WHEN 'a' THEN 'What action fits '
            WHEN 'b' THEN 'How would you manage '
            WHEN 'c' THEN 'What is your strategy for '
            WHEN 'd' THEN 'How do you deal with '
            WHEN 'e' THEN 'What is the best path through '
            ELSE 'How do you take on '
        END
        || REGEXP_REPLACE(question_data->>'question',
            '^How should you handle ', '', 'i')
    ),
    true
)
WHERE question_data->>'type' = 'SCENARIO'
  AND question_data->>'question' ILIKE 'How should you handle %'
  AND question_data->>'question' NOT ILIKE 'How should you mentally handle %';

-- Round 2: vary the next-tier sub-patterns ("mentally approach", "mentally
-- reset", "mentally refocus") into 16 alternatives each. Same pattern;
-- omitted here for length — see migration 20260505224700 in production
-- supabase_migrations.schema_migrations for the full text.

COMMIT;
