-- Phase 1.2 PR-C: persistence columns for DeadlineScheduler + DisconnectEngine FSM.
-- See .memory/specs/phase-1.2-deadline-timer-disconnect-grace.md.
--
-- Applied to production 2026-04-14 via Supabase MCP apply_migration.
-- This file exists for migration history.

-- pending_deadlines: JSON array of { eventId: string, deadlineMs: number }.
-- Used by DeadlineScheduler.persistPending() / rehydrate() so pending turn
-- timers, time-bank grants, and disconnect-grace windows survive an engine
-- restart without drift.
ALTER TABLE public.hand_state_snapshots
  ADD COLUMN IF NOT EXISTS pending_deadlines jsonb NOT NULL DEFAULT '[]'::jsonb;

-- disconnect_states: JSON object keyed by userId with the DisconnectEngine
-- FSM state per seated player. Schema:
--   {
--     "<userId>": {
--       "state": "CONNECTED" | "MISSING" | "DISCONNECTED" | "SAT_OUT",
--       "sinceMs": <epoch_ms>,
--       "graceDeadlineMs": <epoch_ms | null>
--     }
--   }
ALTER TABLE public.hand_state_snapshots
  ADD COLUMN IF NOT EXISTS disconnect_states jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Lightweight index on table_id for rehydrate queries that fetch the most
-- recent snapshot per table at engine start.
CREATE INDEX IF NOT EXISTS hand_state_snapshots_table_updated_idx
  ON public.hand_state_snapshots (table_id, updated_at DESC);
