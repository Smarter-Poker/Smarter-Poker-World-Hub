-- ═══════════════════════════════════════════════════════════════════════
-- owner_approves_the_five_horse_content_modes
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (data: five rows of public.horse_post_modes; no schema change)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4), Fleet Content Programme Phase 6 closeout
-- AFFECTS:     public.horse_post_modes rows grounded_hand, grounded_session, club_data_digest, local_event,
--              seasonal_local (enabled, approved_by, approved_at); nothing else
-- IRREVERSIBLE: no (rollback block at the end restores the observed state)
--
-- WHY:
--   On 2026-09-29 the owner (Dan) reviewed the fresh zero-write samples for all five modes
--   (Horse Content Samples review page) and replied "everything is approved". The programme's
--   hold was: no horse content mode is enabled without owner approval of visible samples for
--   that mode. This records that approval on each row. content_settings.engine_enabled is not
--   touched here: while the master switch is off, every route still skips (engine_disabled),
--   so this change publishes nothing by itself.
--
-- EVIDENCE: all five rows enabled=false with approved_at IS NULL at 2026-09-29 17:03:35Z and again
--   at pre-flight; the four pre-existing modes (poker_news, poker_video, sports_news, sports_video)
--   are enabled and are not touched.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. PRE-FLIGHT: exactly the five rows, all still unapproved and disabled.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.horse_post_modes
   WHERE mode IN ('grounded_hand', 'grounded_session', 'club_data_digest', 'local_event', 'seasonal_local')
     AND enabled = false AND approved_at IS NULL;
  IF n <> 5 THEN RAISE EXCEPTION 'pre-flight: expected 5 unapproved disabled mode rows, found %', n; END IF;
END $$;

-- 2. CHANGE
UPDATE public.horse_post_modes
   SET enabled = true,
       approved_by = 'Dan (owner), chat approval of the 2026-09-29 sample review',
       approved_at = now()
 WHERE mode IN ('grounded_hand', 'grounded_session', 'club_data_digest', 'local_event', 'seasonal_local')
   AND enabled = false AND approved_at IS NULL;

-- 3. POST-APPLY
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.horse_post_modes
   WHERE mode IN ('grounded_hand', 'grounded_session', 'club_data_digest', 'local_event', 'seasonal_local')
     AND enabled = true AND approved_at IS NOT NULL;
  IF n <> 5 THEN RAISE EXCEPTION 'post-apply: expected 5 approved enabled mode rows, found %', n; END IF;
  SELECT count(*) INTO n FROM public.horse_post_modes WHERE enabled = true;
  IF n <> 9 THEN RAISE EXCEPTION 'post-apply: expected 9 enabled modes in total, found %', n; END IF;
END $$;

COMMIT;

-- ROLLBACK (manual, if ever needed):
-- BEGIN;
-- UPDATE public.horse_post_modes SET enabled = false, approved_by = NULL, approved_at = NULL
--  WHERE mode IN ('grounded_hand', 'grounded_session', 'club_data_digest', 'local_event', 'seasonal_local');
-- COMMIT;
