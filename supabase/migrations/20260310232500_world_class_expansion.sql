-- ═══════════════════════════════════════════════════════════════
-- World Class Expansion: Engine Action Idempotency
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.game_action_idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    table_id UUID NOT NULL,
    operation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'success', 'failed')),
    response_body JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
);

CREATE INDEX IF NOT EXISTS idx_game_action_idempotency_expires ON public.game_action_idempotency_keys(expires_at);

ALTER TABLE public.game_action_idempotency_keys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'game_action_idempotency_keys' AND policyname = 'game_action_idempotency_service_role'
  ) THEN
    CREATE POLICY "Service Role Full Access" ON public.game_action_idempotency_keys
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Cleanup function to automatically sweep expired keys
CREATE OR REPLACE FUNCTION public.cleanup_game_action_idempotency_keys()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.game_action_idempotency_keys
    WHERE expires_at < NOW() OR created_at < NOW() - INTERVAL '1 hour';
END;
$$;
