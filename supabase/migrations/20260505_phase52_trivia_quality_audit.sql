-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 52 — Daily Grok question quality audit
-- Date: 2026-05-05
-- Purpose: Catch factual hallucinations in Track B (Grok-generated) trivia
-- questions before they sit in the pool unchecked for weeks.
--
-- The audit cron picks recently-inserted Grok questions that haven't been
-- audited yet, asks Grok-3 (full) to verify factual accuracy, and updates
-- quality_score:
--   - verified true,  confidence ≥ 0.85 → quality_score = 9
--   - verified false, confidence ≥ 0.70 → quality_score = 2 (excluded by minQualityScore=6)
--   - uncertain (everything else)        → quality_score = 5 (between, surfaces via dashboard)
--
-- Every audit decision is logged to trivia_quality_audits so the operator
-- can review exact reasoning for any flagged question.
-- ═══════════════════════════════════════════════════════════════════════════

-- Add audit-tracking columns to trivia_questions
ALTER TABLE trivia_questions
    ADD COLUMN IF NOT EXISTS last_audited_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS audit_verified BOOLEAN,
    ADD COLUMN IF NOT EXISTS audit_confidence NUMERIC(4, 3);

-- Index for "find me un-audited Grok rows" — the audit cron's primary query
CREATE INDEX IF NOT EXISTS idx_trivia_questions_unaudited
    ON trivia_questions(created_at)
    WHERE source IN ('grok-3-mini', 'grok-3') AND last_audited_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_trivia_questions_audit_state
    ON trivia_questions(audit_verified, audit_confidence)
    WHERE audit_verified IS NOT NULL;

-- Audit log table — one row per audit decision
CREATE TABLE IF NOT EXISTS trivia_quality_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES trivia_questions(id) ON DELETE CASCADE,
    audited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verifier_model TEXT NOT NULL DEFAULT 'grok-3',
    verified BOOLEAN NOT NULL,
    confidence NUMERIC(4, 3) NOT NULL,
    reasoning TEXT,
    corrected_answer_text TEXT,
    previous_quality_score INTEGER,
    new_quality_score INTEGER,
    cost_usd NUMERIC(8, 6) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_trivia_quality_audits_question
    ON trivia_quality_audits(question_id);
CREATE INDEX IF NOT EXISTS idx_trivia_quality_audits_audited_at
    ON trivia_quality_audits(audited_at DESC);
CREATE INDEX IF NOT EXISTS idx_trivia_quality_audits_unverified
    ON trivia_quality_audits(audited_at DESC)
    WHERE verified = FALSE;

ALTER TABLE trivia_quality_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage audit log"
    ON trivia_quality_audits FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can read audit log"
    ON trivia_quality_audits FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );

GRANT SELECT ON trivia_quality_audits TO authenticated;

COMMENT ON TABLE trivia_quality_audits IS
    'Phase 52 — log of Grok-3 fact-check decisions on Track B trivia questions. One row per audit. Used by /admin/trivia-pool dashboard to surface flagged questions.';
