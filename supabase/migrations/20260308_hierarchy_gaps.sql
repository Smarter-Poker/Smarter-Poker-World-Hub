-- ============================================================
-- CLUB ARENA HIERARCHY GAPS — 2026-03-08
-- Adds: commission_history table,
--       fn_increment_club_member_count RPC,
--       fn_increment_agent_player_count RPC
--
-- NOTE: Agent referral codes are profiles.player_number (existing).
-- No separate invite_code column needed on agents table.
-- ============================================================

-- ── 2. commission_history table ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  club_id      UUID NOT NULL,
  period_id    UUID,                   -- references settlement_periods(id) if available
  rake_amount  BIGINT NOT NULL DEFAULT 0,
  commission   BIGINT NOT NULL DEFAULT 0,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_history_agent
  ON public.commission_history (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_history_club
  ON public.commission_history (club_id, created_at DESC);

ALTER TABLE public.commission_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commission_history' AND policyname = 'Agents can read own commission history'
  ) THEN
    CREATE POLICY "Agents can read own commission history"
      ON public.commission_history FOR SELECT
      USING (
        agent_id IN (
          SELECT id FROM public.agents WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commission_history' AND policyname = 'Club owners and union admins can read commission history'
  ) THEN
    CREATE POLICY "Club owners and union admins can read commission history"
      ON public.commission_history FOR SELECT
      USING (
        club_id IN (
          SELECT id FROM public.clubs WHERE owner_id = auth.uid()
        )
        OR club_id IN (
          SELECT c.id FROM public.clubs c
          JOIN public.union_admins ua ON ua.union_id = c.union_id
          WHERE ua.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commission_history' AND policyname = 'Service role can insert commission history'
  ) THEN
    CREATE POLICY "Service role can insert commission history"
      ON public.commission_history FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- ── 3. fn_increment_club_member_count RPC ───────────────────
-- Atomic member count increment — avoids stale-read race conditions
CREATE OR REPLACE FUNCTION public.fn_increment_club_member_count(p_club_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.clubs
  SET member_count = COALESCE(member_count, 0) + 1
  WHERE id = p_club_id;
END;
$$;

-- ── 4. fn_increment_agent_player_count RPC ──────────────────
-- Atomic active_player_count + total_players increment for an agent
CREATE OR REPLACE FUNCTION public.fn_increment_agent_player_count(
  p_agent_user_id UUID,
  p_club_id       UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.agents
  SET
    active_player_count = COALESCE(active_player_count, 0) + 1,
    total_players       = COALESCE(total_players, 0) + 1
  WHERE user_id = p_agent_user_id
    AND club_id = p_club_id;
END;
$$;

-- ── 4. Add commission_history to realtime ───────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['commission_history'] LOOP
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
