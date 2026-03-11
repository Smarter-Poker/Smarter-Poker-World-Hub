-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Union Wallet System
-- 4 wallets on the unions table:
--   chip_balance  — general/operational wallet for sending chips to clubs
--   rake_wallet   — rake collected from clubs each settlement period
--   bbj_wallet    — BBJ contributions routed here from club settlements
--   promo_wallet  — promotional fund pool
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.unions
  ADD COLUMN IF NOT EXISTS chip_balance   NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rake_wallet    NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bbj_wallet     NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_wallet   NUMERIC(20,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.unions.chip_balance  IS 'General-purpose chip balance. Union can send chips to clubs from here.';
COMMENT ON COLUMN public.unions.rake_wallet   IS 'Cumulative rake collected from all member clubs each settlement cycle.';
COMMENT ON COLUMN public.unions.bbj_wallet    IS 'BBJ pool contributions routed here from club-level settlements.';
COMMENT ON COLUMN public.unions.promo_wallet  IS 'Promo fund balance for union-level promotional chip distributions.';

-- ── Safe increment/decrement RPCs ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_union_credit_wallet(
  p_union_id   UUID,
  p_wallet     TEXT,   -- 'chip_balance' | 'rake_wallet' | 'bbj_wallet' | 'promo_wallet'
  p_amount     NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF p_wallet NOT IN ('chip_balance','rake_wallet','bbj_wallet','promo_wallet') THEN
    RAISE EXCEPTION 'invalid wallet name: %', p_wallet;
  END IF;
  EXECUTE format(
    'UPDATE public.unions SET %I = %I + $1 WHERE id = $2',
    p_wallet, p_wallet
  ) USING p_amount, p_union_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_union_debit_wallet(
  p_union_id   UUID,
  p_wallet     TEXT,
  p_amount     NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_bal NUMERIC;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF p_wallet NOT IN ('chip_balance','rake_wallet','bbj_wallet','promo_wallet') THEN
    RAISE EXCEPTION 'invalid wallet name: %', p_wallet;
  END IF;
  EXECUTE format(
    'SELECT %I FROM public.unions WHERE id = $1 FOR UPDATE',
    p_wallet
  ) INTO v_bal USING p_union_id;
  IF v_bal < p_amount THEN
    RAISE EXCEPTION 'insufficient union % balance (have %, need %)', p_wallet, v_bal, p_amount;
  END IF;
  EXECUTE format(
    'UPDATE public.unions SET %I = %I - $1 WHERE id = $2',
    p_wallet, p_wallet
  ) USING p_amount, p_union_id;
END;
$$;

-- ── union_wallet_transactions ledger ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.union_wallet_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  union_id        UUID NOT NULL REFERENCES public.unions(id) ON DELETE CASCADE,
  wallet          TEXT NOT NULL CHECK (wallet IN ('chip_balance','rake_wallet','bbj_wallet','promo_wallet')),
  direction       TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  amount          NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  balance_after   NUMERIC(20,4),
  tx_type         TEXT NOT NULL, -- 'settlement_hold','rakeback_distribution','manual_transfer','bbj_contribution','promo_distribution'
  club_id         UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
  period_id       UUID,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uwt_union_id    ON public.union_wallet_transactions(union_id);
CREATE INDEX IF NOT EXISTS idx_uwt_wallet      ON public.union_wallet_transactions(wallet);
CREATE INDEX IF NOT EXISTS idx_uwt_created_at  ON public.union_wallet_transactions(created_at DESC);

ALTER TABLE public.union_wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Union admins can view their union's transactions
CREATE POLICY "union_admin_view_wallet_txns"
  ON public.union_wallet_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.union_admins
      WHERE union_id = union_wallet_transactions.union_id
        AND user_id = auth.uid()
    )
  );

-- Platform admins can view all
CREATE POLICY "platform_admin_view_wallet_txns"
  ON public.union_wallet_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

-- Add to realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'union_wallet_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.union_wallet_transactions;
  END IF;
END $$;
