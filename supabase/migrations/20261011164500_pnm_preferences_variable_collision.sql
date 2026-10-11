-- TIER: 2. AUTHOR: Codex. AFFECTS: public.pnm_patch_preferences(uuid,jsonb).
-- IRREVERSIBLE: no. No persisted data, signature, permissions or schema changes.
-- WHY: live qualification 38156148955 returned preference PATCH 503. Production
-- profiles.preferences collides with the installed RPC's PL/pgSQL local variable
-- in its UPDATE RHS (42702). The old migration is immutable and is not replayed.
-- HOW: require the exact installed preimage, rename only seven local-variable
-- references, replace in place and assert the complete definition and metadata.
-- Recovery: deploy a separately qualified forward correction if necessary;
-- restoring this known-broken preimage is not a safe functional rollback.
DO $repair$
DECLARE
  v_oid oid := 'public.pnm_patch_preferences(uuid,jsonb)'::regprocedure;
  v_old text; v_new text; v_metadata jsonb; v_generic text;
BEGIN
  SELECT pg_get_functiondef(v_oid), jsonb_build_object('owner',proowner,'acl',proacl,
    'config',proconfig,'security',prosecdef,'args',proargtypes::text,'result',prorettype)
    INTO v_old,v_metadata FROM pg_proc WHERE oid=v_oid;
  IF md5(v_old) <> 'e656b6480d0cdbe30a3e31e3c32080a1' THEN
    RAISE EXCEPTION 'PNM preference repair preimage mismatch';
  END IF;
  v_generic := pg_get_functiondef('public.update_page_preferences(uuid,text,jsonb)'::regprocedure);
  v_new := replace(v_old,'; preferences jsonb;','; v_preferences jsonb;');
  v_new := replace(v_new,'INTO preferences FROM','INTO v_preferences FROM');
  v_new := replace(v_new,'jsonb_typeof(preferences)','jsonb_typeof(v_preferences)');
  v_new := replace(v_new,'THEN preferences:=','THEN v_preferences:=');
  v_new := replace(v_new,'preferences:=preferences||p_patch','v_preferences:=v_preferences||p_patch');
  v_new := replace(v_new,'poker_near_me_preferences=preferences,','poker_near_me_preferences=v_preferences,');
  v_new := replace(v_new,'''preferences'',preferences)', '''preferences'',v_preferences)');
  IF v_new=v_old OR position('; preferences jsonb;' IN v_new)>0 THEN
    RAISE EXCEPTION 'PNM preference repair replacement failed';
  END IF;
  EXECUTE v_new;
  IF pg_get_functiondef(v_oid)<>v_new OR
    (SELECT jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,
      'security',prosecdef,'args',proargtypes::text,'result',prorettype)
      FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_metadata OR
    pg_get_functiondef('public.update_page_preferences(uuid,text,jsonb)'::regprocedure)<>v_generic THEN
    RAISE EXCEPTION 'PNM preference repair postimage or metadata mismatch';
  END IF;
END $repair$;
NOTIFY pgrst, 'reload schema';
