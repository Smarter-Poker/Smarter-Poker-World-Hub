-- ==============================================================================
-- Migration: Concurrency Lockdown - Single Pending Cashout
-- Enforces strictly ONE pending cashout per player per club at the database level.
-- Solves the TOCTOU (Time-of-Check to Time-of-Use) race condition where two
-- concurrent API requests could bypass the SELECT check and both INSERT a pending request.
-- ==============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_pending_cashout 
ON public.cashout_requests (club_id, player_id) 
WHERE status = 'pending';
