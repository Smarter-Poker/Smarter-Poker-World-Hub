-- ═══════════════════════════════════════════════════════════
-- Migration: Atomic chip transfer RPC
-- Prevents TOCTOU race conditions in player-to-player transfers
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_transfer_chips(
  p_club_id UUID,
  p_from_user_id UUID,
  p_to_user_id UUID,
  p_amount INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sender_balance INT;
  v_receiver_balance INT;
BEGIN
  -- Validate amount
  IF p_amount <= 0 OR p_amount > 10000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  -- Lock sender row and check balance atomically
  SELECT chip_balance INTO v_sender_balance
  FROM public.club_members
  WHERE club_id = p_club_id AND user_id = p_from_user_id AND status = 'active'
  FOR UPDATE;

  IF v_sender_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender not found or inactive');
  END IF;

  IF v_sender_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance',
      'available', v_sender_balance, 'requested', p_amount);
  END IF;

  -- Lock receiver row
  SELECT chip_balance INTO v_receiver_balance
  FROM public.club_members
  WHERE club_id = p_club_id AND user_id = p_to_user_id AND status = 'active'
  FOR UPDATE;

  IF v_receiver_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receiver not found or inactive');
  END IF;

  -- Atomic deduct + credit (both within same transaction)
  UPDATE public.club_members
  SET chip_balance = chip_balance - p_amount
  WHERE club_id = p_club_id AND user_id = p_from_user_id;

  UPDATE public.club_members
  SET chip_balance = chip_balance + p_amount
  WHERE club_id = p_club_id AND user_id = p_to_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'transferred', p_amount,
    'sender_balance', v_sender_balance - p_amount,
    'receiver_balance', v_receiver_balance + p_amount
  );
END;
$$;

-- Verify
DO $$ BEGIN RAISE NOTICE 'fn_transfer_chips created'; END $$;

-- ═══════════════════════════════════════════════════════════
-- Atomic chip credit — used by cancel-my-cashout and similar
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_credit_chips(
  p_club_id UUID,
  p_user_id UUID,
  p_amount INT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance INT;
BEGIN
  UPDATE public.club_members
  SET chip_balance = chip_balance + p_amount
  WHERE club_id = p_club_id AND user_id = p_user_id
  RETURNING chip_balance INTO v_new_balance;

  RETURN COALESCE(v_new_balance, -1);
END;
$$;

DO $$ BEGIN RAISE NOTICE 'fn_credit_chips created'; END $$;
