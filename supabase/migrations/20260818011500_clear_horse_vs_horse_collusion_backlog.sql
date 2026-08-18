-- Applied to production 2026-08-18 via Supabase MCP apply_migration as
-- 20260818_clear_horse_vs_horse_collusion_backlog. Mirrored per CLAUDE.md RULE 2.
--
-- collusion_tracking held 169,523 open rows dating to 2026-04-20, of which
-- 169,519 are horse-vs-horse. 99.99% are WIN_RATE_ANOMALY at an average
-- suspicion_score of 97, and not one row in four months was ever reviewed -
-- any real signal was unfindable underneath them.
--
-- Horses (profiles.is_horse) are house-run AI and cannot collude with each
-- other. Detector fixed at write time in smarter-poker-workers edf5691.
-- Rows with a human on either side are UNTOUCHED and stay open.
-- Result: 169,519 cleared, 4 left open.

DO $$
DECLARE v_total bigint; v_target bigint;
BEGIN
  SELECT count(*) INTO v_total FROM collusion_tracking;
  SELECT count(*) INTO v_target
    FROM collusion_tracking c
    JOIN profiles pa ON pa.id=c.player_a JOIN profiles pb ON pb.id=c.player_b
   WHERE pa.is_horse AND pb.is_horse AND coalesce(c.status,'open')='open';
  RAISE NOTICE 'Pre-flight: % total, % open horse-vs-horse to clear', v_total, v_target;
  IF v_target = 0 THEN
    RAISE EXCEPTION 'Pre-flight: no open horse-vs-horse rows - investigate before re-running.';
  END IF;
  IF v_target > v_total THEN
    RAISE EXCEPTION 'Pre-flight: target (%) exceeds total (%) - predicate is wrong.', v_target, v_total;
  END IF;
END $$;

UPDATE collusion_tracking c
   SET status='cleared', reviewed_at=now(),
       notes = coalesce(c.notes || ' | ','') ||
               'Auto-cleared 2026-08-18: both players are house-run AI horses, which cannot collude with each other. Detector fixed at write time in smarter-poker-workers edf5691.',
       updated_at=now()
  FROM profiles pa, profiles pb
 WHERE pa.id=c.player_a AND pb.id=c.player_b
   AND pa.is_horse AND pb.is_horse
   AND coalesce(c.status,'open')='open';

DO $$
DECLARE v_open_horse bigint; v_open_human bigint; v_cleared bigint;
BEGIN
  SELECT count(*) INTO v_open_horse FROM collusion_tracking c
    JOIN profiles pa ON pa.id=c.player_a JOIN profiles pb ON pb.id=c.player_b
   WHERE pa.is_horse AND pb.is_horse AND coalesce(c.status,'open')='open';
  SELECT count(*) INTO v_open_human FROM collusion_tracking c
    LEFT JOIN profiles pa ON pa.id=c.player_a LEFT JOIN profiles pb ON pb.id=c.player_b
   WHERE NOT (coalesce(pa.is_horse,false) AND coalesce(pb.is_horse,false))
     AND coalesce(c.status,'open')='open';
  SELECT count(*) INTO v_cleared FROM collusion_tracking WHERE status='cleared';
  IF v_open_horse <> 0 THEN
    RAISE EXCEPTION 'Post-apply: % horse-vs-horse rows still open.', v_open_horse;
  END IF;
  IF v_open_human = 0 THEN
    RAISE EXCEPTION 'Post-apply: zero human-involved rows left open - update was over-broad.';
  END IF;
  RAISE NOTICE 'Post-apply OK: % cleared, % human rows still open', v_cleared, v_open_human;
END $$;

-- ROLLBACK:
--   UPDATE collusion_tracking SET status='open', reviewed_at=NULL, updated_at=now()
--    WHERE status='cleared' AND notes LIKE '%Auto-cleared 2026-08-18%';
