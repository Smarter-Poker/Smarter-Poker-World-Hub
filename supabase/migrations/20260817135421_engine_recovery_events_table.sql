-- APPLIED TO PRODUCTION 2026-08-17 (engine_recovery_events_table)
-- One row per automatic freeze/pause recovery action taken by the game engine.
-- Written best-effort by ServerTableEngine (service_role). This is the
-- DB-visible deploy/behaviour signal for the recovery stack (CA e5aedd153).
CREATE TABLE IF NOT EXISTS public.engine_recovery_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   uuid,
  event      text NOT NULL CHECK (event IN (
               'watchdog_rearm_clock', 'watchdog_forced_action',
               'watchdog_kill_rebuild', 'paused_too_long')),
  detail     text,
  hand_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_engine_recovery_events_created
  ON public.engine_recovery_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_recovery_events_table
  ON public.engine_recovery_events (table_id, created_at DESC);
ALTER TABLE public.engine_recovery_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.engine_recovery_events IS
  'One row per automatic freeze/pause recovery action taken by the game engine. Written best-effort by ServerTableEngine (service_role).';
