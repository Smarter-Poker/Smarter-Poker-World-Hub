DO $$
DECLARE v jsonb := public.fn_sp_digest_player_report('2026-10-26');
BEGIN
  IF (v#>>'{totals,bbj_rake}')::numeric <> 3.57
    OR (v#>>'{players,0,bbj_rake}')::numeric <> 1.23
    OR (v#>>'{players,1,bbj_rake}')::numeric <> 2.34
    OR (v#>>'{period,week,bbj_rake}')::numeric <> 7.02
    OR (v#>>'{period,month,bbj_rake}')::numeric <> 11.58
    OR (v#>>'{totals,net}')::numeric <> 226.47
    OR (v#>>'{totals,won}')::numeric <> 500
    OR (v#>>'{totals,lost}')::numeric <> 273.53 THEN
    RAISE EXCEPTION 'report regression: %',v;
  END IF;
  IF public.fn_sp_digest_player_report('2026-10-26') IS DISTINCT FROM v THEN
    RAISE EXCEPTION 'repeated report changed';
  END IF;
END $$;
SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.fn_sp_digest_player_report('2026-10-26');
    RAISE EXCEPTION 'anon was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT 'PASS: BBJ attribution, bounds, currencies, human scope, net preserved, repeated reads and ACL' AS result;
