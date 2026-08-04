-- Personal Assistant — Section A supporting schema.
--
-- Nothing here is required: every code path degrades gracefully without it
-- (a missing unique index falls back to select-then-update, a missing column
-- is simply not written, a missing index is just slower). Applying it makes
-- leak upserts atomic, persists the AI-generated fix text between detection
-- runs, and gives the per-user time-ordered reads a supporting index.
--
-- All statements are idempotent and non-destructive: IF NOT EXISTS only, no
-- DROP, no data rewrite, no column type changes.

-- ── Leak Finder ────────────────────────────────────────────────────────────
-- Conflict target for POST /api/assistant/leaks and the detect.js batch
-- upsert. Without it both fall back to select-then-update, which works but is
-- not atomic under concurrent detection runs.
CREATE UNIQUE INDEX IF NOT EXISTS user_leaks_user_id_leak_type_key
    ON user_leaks (user_id, leak_type);

-- Conflict target for the batch hand-example upsert in detect.js.
CREATE UNIQUE INDEX IF NOT EXISTS leak_hand_examples_leak_hand_key
    ON leak_hand_examples (leak_id, hand_history_id);

-- Persists the Grok-generated fix suggestion. Without this the text is
-- returned in the API response but recomputed (and re-billed) every run.
ALTER TABLE user_leaks ADD COLUMN IF NOT EXISTS suggested_fix text;

-- Allowed by the PATCH whitelist in /api/assistant/leaks.
ALTER TABLE user_leaks ADD COLUMN IF NOT EXISTS notes text;

-- ── Sandbox ────────────────────────────────────────────────────────────────
-- coach-accuracy can exclude heuristic (non-solver) EV deltas from stats.
ALTER TABLE sandbox_coach_results
    ADD COLUMN IF NOT EXISTS ev_delta_estimated boolean NOT NULL DEFAULT false;

-- Lets the dashboard read EV loss directly instead of parsing full_analysis.
ALTER TABLE sandbox_results ADD COLUMN IF NOT EXISTS ev_loss_bb numeric;

-- ── Indexes for the per-user, time-ordered scans ───────────────────────────
-- GET /api/sandbox/sessions now issues a second query filtered on
-- (user_id, created_at) to attach coach verdicts to archived hands; without
-- this it is a sequential scan on a table that grows one row per coached hand.
CREATE INDEX IF NOT EXISTS idx_sandbox_coach_results_user_created
    ON sandbox_coach_results (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_user_created
    ON sandbox_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_saved_hands_user_created
    ON sandbox_saved_hands (user_id, created_at DESC);

-- Supports the creator-scoped DELETE on /api/sandbox/create-share and any
-- future "my shared links" view. (id is already the primary key.)
CREATE INDEX IF NOT EXISTS idx_sandbox_shared_scenarios_creator
    ON sandbox_shared_scenarios (creator_id);
