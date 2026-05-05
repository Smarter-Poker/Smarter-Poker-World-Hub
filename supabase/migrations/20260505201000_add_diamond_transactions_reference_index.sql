-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Add index to diamond_transactions.reference_id
-- ══════════════════════════════════════════════════════════════════════════
-- BUG FOUND: The idempotency logic in deduct_diamonds and 
-- add_diamonds_to_balance uses a SELECT WHERE reference_id = p_reference_id.
-- Without an index on reference_id, this results in a sequential scan
-- of the entire diamond_transactions table for every transfer and live gift.
--
-- FIX:
-- Create a B-tree index on reference_id to ensure the idempotency check
-- resolves in milliseconds.
-- ══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_diamond_tx_reference_id 
ON public.diamond_transactions(reference_id)
WHERE reference_id IS NOT NULL;
