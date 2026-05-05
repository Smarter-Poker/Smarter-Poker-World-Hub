-- ═══════════════════════════════════════════════════════════════════════════
-- Live Gift Schema Hardening
-- Migration: 20260505_live_gift_schema_hardening.sql
--
-- Fixes:
--   1. Add missing actor_id + link columns to notifications (idempotent)
--      The gift API inserts { actor_id, link } but these columns were never
--      formally added via migration — only referenced in index creation.
--      Without the columns the notification INSERT silently fails or errors.
--
--   2. Ensure notifications has a Realtime publication entry so watchers
--      see gift-received alerts without a page reload.
--
--   3. Ensure live_gifts table has a composite index for efficient per-stream
--      gift history queries (stream_id + created_at DESC).
--
--   4. Drop any residual CHECK constraints on diamond_transactions.type that
--      would block 'live_gift_sent' / 'live_gift_received' / 'live_gift_refund'
--      transaction types.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Notifications: ensure actor_id and link columns exist ───────────────

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link TEXT;

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_notifications_actor_id
  ON public.notifications (actor_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_type_read
  ON public.notifications (user_id, type, read, created_at DESC);


-- ─── 2. Ensure notifications is in the Realtime publication ────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;


-- ─── 3. live_gifts: composite index for per-stream gift history ─────────────

CREATE INDEX IF NOT EXISTS idx_live_gifts_stream_created
  ON public.live_gifts (stream_id, created_at DESC);


-- ─── 4. Drop any residual type CHECK constraints on diamond_transactions ────
-- The archive migration dropped these in Feb 2026, but defensive idempotent
-- drops here ensure any environment that missed the archive is also clean.

ALTER TABLE public.diamond_transactions
  DROP CONSTRAINT IF EXISTS diamond_transactions_type_check;

ALTER TABLE public.diamond_transactions
  DROP CONSTRAINT IF EXISTS diamond_transactions_type_check1;

ALTER TABLE public.diamond_transactions
  DROP CONSTRAINT IF EXISTS diamond_transactions_transaction_type_check;


-- ─── 5. Ensure live_gift_sent / live_gift_received exist in known set ───────
-- No actual constraint — just a sanity comment. These types are written by
-- deduct_diamonds (p_transaction_type='live_gift_sent') and
-- add_diamonds_to_balance (p_type='live_gift_received'/'live_gift_refund').
-- No CHECK constraint should gate them after step 4 above.

DO $$ BEGIN
  RAISE NOTICE 'live_gift schema hardening applied successfully.';
END $$;
