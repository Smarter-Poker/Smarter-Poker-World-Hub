-- ═══════════════════════════════════════════════════════════════════════════
-- Geeves Auto-Learning System — Full SQL Package
-- Run this in Supabase SQL Editor (or via CLI)
-- Includes: table, indexes, RLS, and 2 RPCs used by chat.js
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Table ──────────────────────────────────────────────────────────────
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
  grok_answer   TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Unique on hash for ON CONFLICT upsert
CREATE UNIQUE INDEX IF NOT EXISTS geeves_mq_hash_idx
  ON geeves_missed_questions (question_hash);

-- Speed up top-missed queries (analytics dashboard)
CREATE INDEX IF NOT EXISTS geeves_mq_count_idx
  ON geeves_missed_questions (asked_count DESC, resolved)
  WHERE resolved = FALSE;

-- ── 2. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE geeves_missed_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only" ON geeves_missed_questions;
CREATE POLICY "service_role_only" ON geeves_missed_questions
  USING (false) WITH CHECK (false);

-- ── 3. RPC: geeves_upsert_missed_question ─────────────────────────────────
-- Primary function called from chat.js Step 4.
-- Inserts on first ask, increments asked_count on repeat asks.
-- Security: SECURITY DEFINER so service_role can bypass RLS.
CREATE OR REPLACE FUNCTION geeves_upsert_missed_question(
  p_question   TEXT,
  p_hash       TEXT,
  p_page       TEXT     DEFAULT NULL,
  p_grok_answer TEXT    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO geeves_missed_questions
    (question, question_hash, page, grok_answer, asked_count, first_asked, last_asked)
  VALUES
    (p_question, p_hash, p_page, LEFT(p_grok_answer, 2000), 1, now(), now())
  ON CONFLICT (question_hash) DO UPDATE
    SET asked_count = geeves_missed_questions.asked_count + 1,
        last_asked  = now(),
        -- Update grok_answer only if we have a newer one (not null)
        grok_answer = COALESCE(LEFT(EXCLUDED.grok_answer, 2000), geeves_missed_questions.grok_answer),
        page        = COALESCE(EXCLUDED.page, geeves_missed_questions.page);
END;
$$;

-- ── 4. RPC: geeves_increment_missed_count ─────────────────────────────────
-- Fallback function: called when INSERT returns a 23505 conflict
-- and the primary RPC wasn't available yet.
CREATE OR REPLACE FUNCTION geeves_increment_missed_count(
  p_hash        TEXT,
  p_grok_answer TEXT    DEFAULT NULL,
  p_page        TEXT    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE geeves_missed_questions
  SET asked_count = asked_count + 1,
      last_asked  = now(),
      grok_answer = COALESCE(LEFT(p_grok_answer, 2000), grok_answer),
      page        = COALESCE(p_page, page)
  WHERE question_hash = p_hash;
END;
$$;

-- ── 5. Grant execute to service_role ──────────────────────────────────────
GRANT EXECUTE ON FUNCTION geeves_upsert_missed_question TO service_role;
GRANT EXECUTE ON FUNCTION geeves_increment_missed_count TO service_role;
