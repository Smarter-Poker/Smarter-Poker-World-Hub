-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Fix insert_hole_cards overload conflict
-- ═══════════════════════════════════════════════════════════════════
-- WHY: There's a stale overload (bigint, jsonb) from a previous version
-- conflicting with the new (integer, text) signature. Postgres cannot
-- choose between them — drop the old one and ensure only one version exists.
-- ═══════════════════════════════════════════════════════════════════

-- Drop ALL existing overloads of insert_hole_cards
DROP FUNCTION IF EXISTS public.insert_hole_cards(UUID, BIGINT, JSONB);
DROP FUNCTION IF EXISTS public.insert_hole_cards(UUID, INTEGER, JSONB);
DROP FUNCTION IF EXISTS public.insert_hole_cards(UUID, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.insert_hole_cards(UUID, INTEGER, TEXT);

-- Recreate with the exact signature the server sends:
--   p_hand_number → INTEGER (server sends this.handCount which compiles to a JS number)
--   p_cards       → TEXT   (server sends JSON.stringify([...]), a JS string)
CREATE FUNCTION public.insert_hole_cards(
  p_table_id    UUID,
  p_hand_number INTEGER,
  p_cards       TEXT
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
  -- Parse the JSON string argument (server sends JSON.stringify'd array)
  v_cards := p_cards::JSONB;

  -- Clean up rows from hands earlier than this one (keep table lean)
  DELETE FROM public.table_hole_cards
  WHERE table_id = p_table_id
    AND hand_number < p_hand_number;

  -- Upsert each player's hole card row
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
      RAISE WARNING '[insert_hole_cards] Skipped row with invalid user_id: %', v_record->>'user_id';
    END;
  END LOOP;
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.insert_hole_cards(UUID, INTEGER, TEXT)
  TO service_role, authenticated;

-- Verify: exactly one overload exists now
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'insert_hole_cards';

  IF v_count = 1 THEN
    RAISE NOTICE '✅ insert_hole_cards: exactly 1 overload — conflict resolved';
  ELSE
    RAISE EXCEPTION '❌ insert_hole_cards: % overloads found (expected 1)', v_count;
  END IF;
END $$;
