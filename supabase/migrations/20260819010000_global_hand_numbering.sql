-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-18. Mirror only. Do not re-run.
-- GLOBAL HAND NUMBERING
-- ═══════════════════════════════════════════════════════════════════════════
-- Dan: "each hand number needs to be 100% completely different and unique with
-- the hand numbers counting upwards forever ... we should be able to grab
-- literally any hand number and identify that hand, see all the action for the
-- hand ... across multiple tables, cash games, clubs, unions etc. Hand numbers
-- can never reset or be reused ever."
--
-- WAS A PER-TABLE COUNTER. Measured: the most recent 20,000 hands carry only
-- 7,468 distinct numbers, because every table counts from its own start and
-- restarts at 0 whenever the engine restarts. "Hand #196" identifies nothing.
--
-- A SEQUENCE, chosen over MAX(hand_number)+1 or an in-engine counter:
--   * cannot issue the same value twice under concurrent deals across tables,
--     clubs and engine instances;
--   * survives engine restarts and redeploys (an in-memory counter does not —
--     that is exactly how the numbers were resetting);
--   * never rolls back, so a crashed hand cannot free its number for reuse.
--
-- GAPS ARE CORRECT. A hand dealt then abandoned consumes its number forever.
-- That is the price of "never reused" and costs nothing: every number still
-- resolves to at most one hand.
--
-- STARTS AT 1,000,000, clear of the legacy range (max legacy 13,811), so the
-- two eras can never collide and it is obvious which era a number belongs to.

CREATE SEQUENCE IF NOT EXISTS public.global_hand_number_seq
  AS bigint START WITH 1000000 MINVALUE 1000000 NO CYCLE;

-- Uniqueness enforced by the DATABASE, not by convention. PARTIAL because the
-- legacy rows below 1,000,000 are genuinely duplicated and rewriting them would
-- falsify history: this guarantees every hand from the cutover forward is
-- unique while leaving the past intact and clearly separable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hand_history_global_hand_number
  ON public.hand_history (hand_number) WHERE hand_number >= 1000000;

-- Investigation entry point: any number -> that one hand and its action log.
CREATE INDEX IF NOT EXISTS idx_hand_history_hand_number_lookup
  ON public.hand_history (hand_number);

CREATE OR REPLACE FUNCTION public.fn_next_hand_number()
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT nextval('public.global_hand_number_seq'); $$;

REVOKE ALL ON FUNCTION public.fn_next_hand_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_next_hand_number() TO service_role;

COMMENT ON SEQUENCE public.global_hand_number_seq IS
  'Single global allocator for hand numbers. Never resets, never reuses, ascends in deal order across every table, club, union, cash game and tournament.';
