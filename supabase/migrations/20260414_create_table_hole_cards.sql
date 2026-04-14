-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Create table_hole_cards + insert_hole_cards RPC
-- ═══════════════════════════════════════════════════════════════════
-- WHY: table_hole_cards was dropped by 20260314_drop_orphan_tables.sql.
-- The server's CARDS_DEALT handler calls insert_hole_cards RPC to securely
-- deliver hole cards to each player via Supabase Realtime + RLS.
-- Without this table, players see ZERO hole cards — poker is unplayable.
-- ─────────────────────────────────────────────────────────────────────
-- ARCHITECTURE:
--   1. Server writes via service_role (bypasses RLS) using insert_hole_cards RPC
--   2. Client subscribes to Realtime INSERT events on this table
--   3. RLS policy ensures each player only receives their own cards
--   4. Bot players use valid UUID format so no FK constraint needed
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. Create the table
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.table_hole_cards (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id    UUID        NOT NULL,
  hand_number INTEGER     NOT NULL,
  user_id     UUID        NOT NULL,  -- NO FK to auth.users (bots use synthetic UUIDs)
  seat_number INTEGER     NOT NULL,
  cards       JSONB       NOT NULL,  -- Array of {rank, suit} objects
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Unique constraint (used for upsert in the RPC)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.table_hole_cards
  DROP CONSTRAINT IF EXISTS table_hole_cards_table_hand_user_unique;

ALTER TABLE public.table_hole_cards
  ADD CONSTRAINT table_hole_cards_table_hand_user_unique
  UNIQUE (table_id, hand_number, user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 3. Performance indexes
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_table_hole_cards_lookup
  ON public.table_hole_cards (table_id, hand_number);

CREATE INDEX IF NOT EXISTS idx_table_hole_cards_user
  ON public.table_hole_cards (user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 4. Enable RLS — players only see their own hole cards
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.table_hole_cards ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist from a previous version
DROP POLICY IF EXISTS "Players see own hole cards" ON public.table_hole_cards;
DROP POLICY IF EXISTS "Service role full access" ON public.table_hole_cards;

-- SELECT: authenticated players can only read their own cards (Realtime uses this)
CREATE POLICY "Players see own hole cards"
  ON public.table_hole_cards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE: only service_role (server) — handled via security definer RPC

-- ─────────────────────────────────────────────────────────────────────
-- 5. Enable Realtime on this table
--    Supabase Realtime will apply the SELECT RLS policy, so each client
--    only receives INSERT events for their own user_id rows.
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.table_hole_cards;
EXCEPTION WHEN duplicate_object THEN
  -- Already registered — safe to ignore
  RAISE NOTICE 'table_hole_cards already in supabase_realtime publication';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Create insert_hole_cards RPC
--    Called by ServerTableEngine CARDS_DEALT handler with:
--      p_table_id   UUID
--      p_hand_number INT
--      p_cards      TEXT  (JSON.stringify'd array of {user_id, seat_number, cards})
--
--    This is SECURITY DEFINER so it runs as the owner (service_role level),
--    bypassing RLS even when called from a restricted context.
--
--    Logic:
--      - Delete stale hole cards from PREVIOUS hands on this table
--        (keeps the table lean; current hand rows persist for client delivery)
--      - Upsert each player's hole card row
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insert_hole_cards(
  p_table_id    UUID,
  p_hand_number INTEGER,
  p_cards       TEXT      -- JSON string: [{user_id, seat_number, cards}]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cards    JSONB;
  v_record   JSONB;
  v_user_id  UUID;
BEGIN
  -- Parse the JSON string argument
  v_cards := p_cards::JSONB;

  -- Clean up rows from hands earlier than this one (not the current hand)
  DELETE FROM public.table_hole_cards
  WHERE table_id = p_table_id
    AND hand_number < p_hand_number;

  -- Upsert each player's row
  FOR v_record IN SELECT * FROM jsonb_array_elements(v_cards)
  LOOP
    BEGIN
      v_user_id := (v_record->>'user_id')::UUID;

      INSERT INTO public.table_hole_cards (
        table_id,
        hand_number,
        user_id,
        seat_number,
        cards
      ) VALUES (
        p_table_id,
        p_hand_number,
        v_user_id,
        (v_record->>'seat_number')::INTEGER,
        v_record->'cards'
      )
      ON CONFLICT (table_id, hand_number, user_id)
      DO UPDATE SET
        cards       = EXCLUDED.cards,
        seat_number = EXCLUDED.seat_number,
        created_at  = NOW();

    EXCEPTION WHEN invalid_text_representation THEN
      -- Silently skip rows with invalid user_id (malformed UUID etc.)
      RAISE WARNING '[insert_hole_cards] Skipped row with invalid user_id: %', v_record->>'user_id';
    END;
  END LOOP;
END;
$$;

-- Grant execute to service_role and authenticated (server calls as service_role)
GRANT EXECUTE ON FUNCTION public.insert_hole_cards(UUID, INTEGER, TEXT)
  TO service_role, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Verify
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Check table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'table_hole_cards'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: table_hole_cards was not created';
  END IF;

  -- Check RPC exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'insert_hole_cards'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: insert_hole_cards function was not created';
  END IF;

  RAISE NOTICE '✅ table_hole_cards + insert_hole_cards RPC created successfully';
END $$;
