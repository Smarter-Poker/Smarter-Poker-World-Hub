-- A hand brief keeps its own confidence.
--
-- WHAT WENT WRONG. `post_briefs` is the summary a horse reads before it
-- comments on a post. Phase 3 writes one for every grounded (hand) post with
-- confidence 1.00, because the brief is built from a settled row in
-- `horse_hand_reviews` - there is nothing about it we are unsure of.
--
-- The reader, `VoiceWriter.loadBrief()`, re-applies the title-quality test on
-- the way out, so a brief cached before a rule tightened cannot make the
-- engine dumber than deriving fresh would. That test, `isUninformativeTitle`,
-- was written for SCRAPED media titles and counts words longer than two
-- letters. A hand title is "AA on Qc 8s Qs 9c 9d": every token is one or two
-- characters, so it scored zero informative words and every hand brief was
-- judged junk and clamped to 0.35. The comment path then wrote that clamped
-- copy back, which made the downgrade permanent - and compounding, since the
-- next read would clamp again.
--
-- Measured 2026-09-06 before the fix: 33 of 67 hand briefs sat at 0.35.
-- Exactly the ones a horse had commented on.
--
-- THE CODE FIX (smarter-poker-workers, same day) is the real one, in two
-- parts: the media-title test is no longer applied to a brief this engine
-- wrote itself, and a brief LOADED from this table is never written back.
-- This migration repairs the rows that were damaged before it shipped.
--
-- SAFE: the correct value is not being guessed. `briefForHand()` and
-- `briefForSession()` emit confidence 1 unconditionally, so 1.00 is the only
-- value a hand brief has ever been written with; anything below it on a
-- `kind = 'hand'` row is the clamp and nothing else. No other kind is
-- touched, and a brief is a cache of a post that already exists - no money,
-- no player-visible record, and a wrong row here costs one bland comment.

BEGIN;

DO $$
DECLARE
  v_damaged int;
  v_left    int;
BEGIN
  SELECT count(*) INTO v_damaged
  FROM public.post_briefs
  WHERE kind = 'hand' AND confidence < 1;

  UPDATE public.post_briefs
  SET confidence = 1
  WHERE kind = 'hand' AND confidence < 1;

  SELECT count(*) INTO v_left
  FROM public.post_briefs
  WHERE kind = 'hand' AND confidence < 1;

  IF v_left <> 0 THEN
    RAISE EXCEPTION 'post_briefs: % hand briefs still below confidence 1 after the repair', v_left;
  END IF;

  RAISE NOTICE 'post_briefs: restored % hand briefs to confidence 1.00', v_damaged;
END $$;

COMMIT;
