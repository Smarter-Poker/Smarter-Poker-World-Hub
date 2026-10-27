-- TIER: 2. The authenticated social composer inserts public.mentions; its
-- enabled AFTER INSERT fn_notify_mention ran as SECURITY INVOKER and attempted
-- a notifications INSERT that is deliberately service/owner-only under RLS.
-- Elevate only this bound trigger, validate the browser actor independently,
-- and preserve display_name/username privacy plus the original payload.
-- Never grant browser notifications INSERT or direct function EXECUTE.
-- Read-only live source hash and trigger binding checked 2026-10-20.
-- Rollback: restore the captured original INVOKER definition in a new migration;
-- that restores the known failed mention-notification behavior. No row undo.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $pre$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.fn_notify_mention()')
      AND pg_get_userbyid(p.proowner)='postgres' AND NOT p.prosecdef
      AND p.prorettype='trigger'::regtype
      AND md5(p.prosrc)='72bbb515ca859e29f5947f975bebfcfd'
  ) THEN RAISE EXCEPTION 'Mention notification source/owner drift; review before replacement'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE t.tgrelid='public.mentions'::regclass AND t.tgname='trg_notify_mention'
      AND t.tgfoid='public.fn_notify_mention()'::regprocedure AND t.tgenabled='O'
      AND t.tgtype=5 AND NOT t.tgisinternal AND c.relrowsecurity
      AND pg_get_userbyid(c.relowner)='postgres'
  ) OR EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgfoid='public.fn_notify_mention()'::regprocedure
      AND (tgrelid<>'public.mentions'::regclass OR tgname<>'trg_notify_mention')
  ) THEN RAISE EXCEPTION 'Expected only the enabled canonical mention INSERT trigger'; END IF;
  IF NOT (SELECT relrowsecurity AND pg_get_userbyid(relowner)='postgres'
          FROM pg_class WHERE oid='public.notifications'::regclass)
     OR EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid='public.notifications'::regclass
       AND p.polcmd IN ('a','*') AND p.polpermissive
       AND p.polroles && ARRAY[0::oid,'anon'::regrole::oid,'authenticated'::regrole::oid]) THEN
    RAISE EXCEPTION 'Notifications must retain owner/service-only INSERT under RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL
      aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid='public.fn_notify_mention()'::regprocedure
      AND a.grantee NOT IN (0,'postgres'::regrole::oid,'service_role'::regrole::oid,
        'anon'::regrole::oid,'authenticated'::regrole::oid)) THEN
    RAISE EXCEPTION 'Unknown mention function execution grantee; review before narrowing';
  END IF;
  -- Historical CREATE FUNCTION may still have default PUBLIC EXECUTE.
  -- The exact admitted body is RETURNS trigger and only its canonical binding
  -- is accepted; revoke inherited/default browser execution below. Do not
  -- depend on a later global routine-ACL cleanup having run on fresh history.
END $pre$;
CREATE OR REPLACE FUNCTION public.fn_notify_mention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  tagger_name text;
  trusted_writer boolean;
BEGIN
  IF TG_RELID <> 'public.mentions'::regclass OR TG_NAME <> 'trg_notify_mention'
     OR TG_OP <> 'INSERT' OR TG_WHEN <> 'AFTER' OR TG_LEVEL <> 'ROW' THEN
    RAISE EXCEPTION 'Mention notification requires its canonical INSERT trigger' USING ERRCODE='42501';
  END IF;
  -- current_user is the definer here; authorize against the original SQL role.
  trusted_writer := current_setting('role',true)='service_role'
    OR (current_setting('role',true)='none' AND session_user='postgres');
  IF NOT trusted_writer AND (
      current_setting('role',true) IS DISTINCT FROM 'authenticated'
      OR auth.uid() IS NULL OR NEW.mentioned_by_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Mention actor must match the authenticated caller' USING ERRCODE='42501';
  END IF;
  IF NEW.mentioned_user_id != NEW.mentioned_by_id THEN
    SELECT COALESCE(display_name,username,'Someone') INTO tagger_name
      FROM public.profiles WHERE id=NEW.mentioned_by_id;
    INSERT INTO public.notifications(user_id,type,title,message,data)
      VALUES(NEW.mentioned_user_id,'mention',tagger_name||' tagged you in a post','Tap to view',
        jsonb_build_object('post_id',NEW.post_id,'comment_id',NEW.comment_id,'tagger_id',NEW.mentioned_by_id));
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_notify_mention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_notify_mention() TO service_role;
DO $post$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.fn_notify_mention()'::regprocedure
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
      AND p.proconfig=ARRAY['search_path=public, extensions'])
     OR has_function_privilege('anon','public.fn_notify_mention()','EXECUTE')
     OR has_function_privilege('authenticated','public.fn_notify_mention()','EXECUTE')
     OR NOT has_function_privilege('service_role','public.fn_notify_mention()','EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
       WHERE p.oid='public.fn_notify_mention()'::regprocedure
         AND a.grantee NOT IN ('postgres'::regrole::oid,'service_role'::regrole::oid)) THEN
    RAISE EXCEPTION 'Mention trigger definer or execution boundary incomplete';
  END IF;
END $post$;
COMMIT;
