-- ═══════════════════════════════════════════════════════════════
-- SANDBOX WAVE 2 TABLES
-- Supports: Coach Mode Results, Equity History, Session Logs
-- Date: 2026-03-08
-- ═══════════════════════════════════════════════════════════════

-- ── Coach Mode Results ──────────────────────────────────────────────────────
-- Persists every Socratic coach mode evaluation: what the user picked,
-- what GTO recommended, and the EV delta
CREATE TABLE IF NOT EXISTS sandbox_coach_results (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES sandbox_sessions(id) ON DELETE SET NULL,
  hero_hand     TEXT NOT NULL,
  hero_position TEXT,
  street        TEXT,
  board         TEXT,
  user_pick     TEXT NOT NULL,           -- action user chose
  gto_action    TEXT,                    -- GTO optimal action label
  is_correct    BOOLEAN,                 -- user_pick == gto_action
  ev_delta      NUMERIC(8,4),            -- EV difference (negative = leak)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sandbox_coach_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own coach results"
  ON sandbox_coach_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own coach results"
  ON sandbox_coach_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_coach_results_user ON sandbox_coach_results(user_id);
CREATE INDEX IF NOT EXISTS idx_coach_results_correct ON sandbox_coach_results(user_id, is_correct);
CREATE INDEX IF NOT EXISTS idx_coach_results_created ON sandbox_coach_results(user_id, created_at DESC);


-- ── Equity History ──────────────────────────────────────────────────────────
-- Tracks hero equity at each street for multi-street equity graph rendering
-- (client-side EquityGraph reads from state, this table enables cross-session replay)
CREATE TABLE IF NOT EXISTS sandbox_equity_history (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES sandbox_sessions(id) ON DELETE CASCADE,
  hero_hand     TEXT NOT NULL,
  villain_range TEXT,
  street        TEXT NOT NULL,           -- 'preflop','flop','turn','river'
  equity_pct    NUMERIC(6,3),            -- hero win equity 0-100
  ev_hero       NUMERIC(8,4),            -- hero EV at this street
  board_cards   TEXT,                    -- space-separated card list
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sandbox_equity_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own equity history"
  ON sandbox_equity_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own equity history"
  ON sandbox_equity_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_eq_history_user ON sandbox_equity_history(user_id);
CREATE INDEX IF NOT EXISTS idx_eq_history_session ON sandbox_equity_history(session_id);


-- ── User Coach Accuracy Aggregate View ─────────────────────────────────────
-- Real-time accuracy stats for the coach mode — used by Leak Finder page
CREATE OR REPLACE VIEW sandbox_coach_accuracy AS
SELECT
  user_id,
  COUNT(*)                                          AS total_hands,
  COUNT(*) FILTER (WHERE is_correct = true)         AS correct_count,
  COUNT(*) FILTER (WHERE is_correct = false)        AS incorrect_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE is_correct = true) / NULLIF(COUNT(*), 0),
    1
  )                                                 AS accuracy_pct,
  AVG(CASE WHEN is_correct = false THEN ABS(ev_delta) END) AS avg_leak_ev
FROM sandbox_coach_results
GROUP BY user_id;


-- ── Realtime enabled for live badge updates ─────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE sandbox_coach_results;
ALTER PUBLICATION supabase_realtime ADD TABLE sandbox_equity_history;
