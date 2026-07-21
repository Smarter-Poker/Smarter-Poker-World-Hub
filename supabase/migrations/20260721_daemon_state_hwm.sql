-- Durable high-water-mark for engine daemons (Hetzner). The RakebackSettler
-- kept its last-settled timestamp only in memory, so every engine restart reset
-- it and the 30-min settler re-scanned the last 7 days of rake_records — which
-- INCREMENTED player_stats.hands_played / total_rake again for already-settled
-- hands (the same class of bug the rakeback_periods Round 45 recompute already
-- fixed for its table; player_stats still increments). Persisting the watermark
-- makes the settler resume exactly where it left off across restarts.
--
-- Service-role only (the engine uses the service-role key). RLS enabled with no
-- policies => browser clients cannot read/write it; the engine (service role)
-- bypasses RLS.

CREATE TABLE IF NOT EXISTS public.daemon_state (
  daemon          text PRIMARY KEY,
  high_water_mark timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daemon_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='daemon_state'
  ) THEN
    RAISE EXCEPTION 'daemon_state not created';
  END IF;
END $$;
