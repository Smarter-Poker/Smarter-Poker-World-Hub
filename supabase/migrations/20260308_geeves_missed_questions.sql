-- ═══════════════════════════════════════════════════════════════════════════
-- Geeves Missed Questions — Auto-Learning Loop
-- Every question that falls through to Grok gets logged here.
-- The Horses admin Geeves tab surfaces the top missed questions so they
-- can be added to the knowledge base, making Geeves smarter over time.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS geeves_missed_questions (
  id            BIGSERIAL    PRIMARY KEY,
  question      TEXT         NOT NULL,
  question_hash TEXT         NOT NULL,
  page          TEXT,
  asked_count   INT          NOT NULL DEFAULT 1,
  first_asked   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_asked    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  resolved      BOOLEAN      NOT NULL DEFAULT FALSE,
  added_to_kb   BOOLEAN      NOT NULL DEFAULT FALSE,
  grok_answer   TEXT,        -- Store the Grok answer so admins can quickly KB-ify it
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Unique on hash so we can ON CONFLICT DO UPDATE asked_count
CREATE UNIQUE INDEX IF NOT EXISTS geeves_mq_hash_idx
  ON geeves_missed_questions (question_hash);

-- Speed up top-missed queries
CREATE INDEX IF NOT EXISTS geeves_mq_count_idx
  ON geeves_missed_questions (asked_count DESC, resolved)
  WHERE resolved = FALSE;

-- RLS: service role only (admin analytics API uses the service key)
ALTER TABLE geeves_missed_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only" ON geeves_missed_questions;
CREATE POLICY "service_role_only" ON geeves_missed_questions
  USING (false) WITH CHECK (false);
