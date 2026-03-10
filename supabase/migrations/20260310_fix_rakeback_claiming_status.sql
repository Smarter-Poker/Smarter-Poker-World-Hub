-- ================================================================
-- HOTFIX: Add 'claiming' status to rakeback_periods CHECK constraint
--
-- The claim flow sets status to 'claiming' as a lock mechanism
-- to prevent double-claim races. Without this status in the CHECK
-- constraint, the claim flow errors with a constraint violation.
-- ================================================================
ALTER TABLE rakeback_periods DROP CONSTRAINT IF EXISTS rakeback_periods_status_check;
ALTER TABLE rakeback_periods ADD CONSTRAINT rakeback_periods_status_check
  CHECK (status IN ('open', 'closed', 'claiming', 'claimed'));
