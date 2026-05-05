-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 49 — Trivia engine metadata column
-- Date: 2026-05-05
-- Purpose: Support deterministic engine seeder + Grok seeder for trivia rebuild.
--   - engine_metadata: JSONB blob for solver scenario hash, GTO frequencies,
--     EV data, source ('deterministic' | 'grok-3-web' | 'grok-3-hendonmob' |
--     'grok-3-tda'), citations, validator pass log.
--   - source: cheap text column used as a primary filter when refilling.
-- ═══════════════════════════════════════════════════════════════════════════

-- Add columns idempotently
ALTER TABLE trivia_questions
    ADD COLUMN IF NOT EXISTS engine_metadata JSONB,
    ADD COLUMN IF NOT EXISTS source TEXT;

-- Index for source filter (used by refill crons)
CREATE INDEX IF NOT EXISTS idx_trivia_questions_source
    ON trivia_questions(source)
    WHERE source IS NOT NULL;

-- Partial index on (category, source) for refill targeting
CREATE INDEX IF NOT EXISTS idx_trivia_questions_category_source
    ON trivia_questions(category, source);

-- GIN index on engine_metadata for scenarioHash dedup lookups
CREATE INDEX IF NOT EXISTS idx_trivia_questions_engine_meta
    ON trivia_questions USING GIN (engine_metadata);

COMMENT ON COLUMN trivia_questions.engine_metadata IS
    'JSONB blob from generation pipeline. For deterministic source: scenarioHash, heroHand, board, position, gtoFrequencies, evData. For Grok source: citation, validator_passes, model.';

COMMENT ON COLUMN trivia_questions.source IS
    'Question generation source. One of: deterministic, grok-3-web, grok-3-hendonmob, grok-3-tda, manual_seed, legacy_v12. NULL for pre-Phase-49 rows.';
