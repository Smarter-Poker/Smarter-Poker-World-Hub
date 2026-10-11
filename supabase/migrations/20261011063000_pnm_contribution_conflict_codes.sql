-- TIER: 3. AUTHOR: Codex. AFFECTS: five existing PNM contribution RPCs.
-- WHY: 40001 is a genuine serialization failure, not a business conflict.
-- Managed PostgREST can retry it indefinitely. PT409 returns an immediate 409.
-- The maintained installer owns the single outer SQL/ledger transaction.
-- No persisted rows, permissions, signatures or unrelated exceptions change.
-- IRREVERSIBLE: no data changes; rollback disables affected writers below.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $migration$
DECLARE
  v record; v_oid regprocedure; v_before text; v_after text;
  v_acl aclitem[]; v_owner oid; v_config text[]; v_security boolean;
  v_count integer := 0;
BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('pnm_contribution_replay(uuid,uuid,text,integer,jsonb)','42dfc733dae8857ed396ff91bb7a1557',1),
    ('pnm_contribution_schedule(integer,uuid,jsonb,boolean)','8ae6665490a2f0a289e4dbed6ad279a0',1),
    ('pnm_contribution_venue_patch(integer,uuid,jsonb,timestamp with time zone,boolean)','f175bcd6824512335458f14e851700db',1),
    ('pnm_review_venue_claim(uuid,uuid,uuid,jsonb)','5cad5f7a7fa540ae8a9138a120c6c9eb',3),
    ('pnm_review_venue_correction(uuid,uuid,uuid,jsonb)','fb4982408fb984c06ae9b22fac4fe63f',2)
  ) AS expected(signature,preimage,replacements) LOOP
    v_oid := ('public.'||v.signature)::regprocedure;
    SELECT pg_get_functiondef(p.oid),p.proacl,p.proowner,p.proconfig,p.prosecdef
      INTO v_before,v_acl,v_owner,v_config,v_security FROM pg_proc p WHERE p.oid=v_oid;
    IF md5(v_before)<>v.preimage OR NOT v_security
      OR v_owner<>'postgres'::regrole OR v_config<>ARRAY['search_path=public, extensions'] THEN
      RAISE EXCEPTION 'unexpected installed contribution pre-image: %',v.signature;
    END IF;
    IF (length(v_before)-length(replace(v_before,'ERRCODE=''40001''','')))/length('ERRCODE=''40001''')<>v.replacements THEN
      RAISE EXCEPTION 'unexpected conflict count: %',v.signature;
    END IF;
    v_after := replace(v_before,'ERRCODE=''40001''','ERRCODE=''PT409''');
    EXECUTE v_after;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=v_oid
      AND md5(pg_get_functiondef(p.oid))=md5(v_after)
      AND p.proacl IS NOT DISTINCT FROM v_acl AND p.proowner=v_owner
      AND p.proconfig=v_config AND p.prosecdef=v_security) THEN
      RAISE EXCEPTION 'contribution post-image or privileges changed: %',v.signature;
    END IF;
    v_count := v_count+v.replacements;
  END LOOP;
  IF v_count<>8 THEN RAISE EXCEPTION 'expected exactly eight business conflicts'; END IF;
END $migration$;
NOTIFY pgrst, 'reload schema';

-- ROLLBACK: new forward migration only. Never restore the retry-trap error code.
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.pnm_submit_venue_claim(uuid,integer,jsonb),
-- public.pnm_submit_venue_correction(uuid,integer,jsonb),public.pnm_mutate_venue_schedule(uuid,integer,jsonb),
-- public.pnm_mutate_venue_info(uuid,integer,jsonb),public.pnm_review_venue_claim(uuid,uuid,uuid,jsonb),
-- public.pnm_review_venue_correction(uuid,uuid,uuid,jsonb) FROM authenticated,service_role;
-- COMMIT;
