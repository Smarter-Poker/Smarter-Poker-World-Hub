-- TIER: 3. Existing atomic video RPC lock protocol; signature/ACL unchanged.
-- WHY: 2026-10-19 16:10:33.189Z PostgreSQL error b9a567a9-b00c-4544-93f7-
-- 281e19a03d83 proves publish_horse_video_reel -> social reward trigger ->
-- award_diamonds_v2 timed out upgrading the author's profiles row to UPDATE.
-- The publisher acquired SHARE first, although its mandatory reward path
-- needs UPDATE. Acquire that final lock at entry, without queueing behind a
-- busy player. A refusal occurs before post/Reel/reward/ledger writes.
-- No reward exclusion, skipped reward, higher timeout, retry, guard/rate change,
-- content rewrite or engine restart. Preserve all installed function bytes
-- except the single lock clause. Exact drift check prevents overwriting work.
BEGIN;

-- The existing post trigger pays its normal reward through award_diamonds_v2.
-- Register this transitive money-writing entry before replacing its function;
-- do not change the reward owner, amount, eligibility or accounting path.
INSERT INTO public.ca_money_rpc_registry(proname,status,notes)
VALUES ('publish_horse_video_reel','approved',
  'Existing atomic social publisher and normal social reward trigger; acquire final profile row lock before publication, preserve canonical reward accounting')
ON CONFLICT(proname) DO NOTHING;

DO $migration$
DECLARE
  v_oid oid := 'public.publish_horse_video_reel(uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
  v_before text;
  v_after text;
  v_old constant text := 'FOR SHARE OF p, ca;';
  v_new constant text := 'FOR UPDATE OF p NOWAIT FOR SHARE OF ca NOWAIT;';
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.ca_money_rpc_registry
    WHERE proname='publish_horse_video_reel' AND status='approved') THEN
    RAISE EXCEPTION 'horse video publisher money registry is not approved';
  END IF;
  SELECT pg_get_functiondef(v_oid) INTO v_before;
  IF md5(v_before) <> '7c0a5c39b1a4a7351d3a10c3650a8cc7' THEN
    RAISE EXCEPTION 'horse video publisher drift: qualify current definition before replacement';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='publish_horse_video_reel') <> 1 THEN
    RAISE EXCEPTION 'unexpected horse video publication overload';
  END IF;
  IF length(v_before)-length(replace(v_before,v_old,'')) <> length(v_old) THEN
    RAISE EXCEPTION 'expected exactly one identity lock clause';
  END IF;
  v_after := replace(v_before,v_old,v_new);
  EXECUTE v_after;
  IF pg_get_functiondef(v_oid) IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'installed publisher differs from exact qualified replacement';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=v_oid AND prosecdef
    AND proconfig=ARRAY['search_path=public, extensions']::text[]
    AND pg_get_userbyid(proowner)='postgres')
    OR has_function_privilege('anon',v_oid,'EXECUTE')
    OR has_function_privilege('authenticated',v_oid,'EXECUTE')
    OR NOT has_function_privilege('service_role',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'horse video publication authority changed';
  END IF;
END
$migration$;

COMMIT;

-- ROLLBACK: apply as a NEW migration after inspecting current installed bytes.
-- BEGIN;
-- DO $rollback$ DECLARE d text; BEGIN
-- SELECT pg_get_functiondef('public.publish_horse_video_reel(uuid,text,text,text,text,text,text,jsonb)'::regprocedure) INTO d;
-- IF position('FOR UPDATE OF p NOWAIT FOR SHARE OF ca NOWAIT;' IN d)=0 THEN
--   RAISE EXCEPTION 'unexpected publisher, refusing rollback'; END IF;
-- EXECUTE replace(d,'FOR UPDATE OF p NOWAIT FOR SHARE OF ca NOWAIT;','FOR SHARE OF p, ca;');
-- END $rollback$;
-- COMMIT;
