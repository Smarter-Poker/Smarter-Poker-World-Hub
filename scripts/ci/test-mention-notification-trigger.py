#!/usr/bin/env python3
"""Exact mention trigger permission regression on private PG17; no remote connection."""
import json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
pg=Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
scratch=root.parent if str(root).startswith('/Volumes/SmarterWork/agent-work/') else None
if sys.platform=='darwin' and scratch is None: raise SystemExit('Use an owned external-SSD worktree')
cluster=Path(tempfile.mkdtemp(prefix='mn-',dir=scratch))
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
cmd=[pg/'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-h',cluster/'socket','-p','55444','-U','postgres','-d','postgres']
def run(args,value=None):return subprocess.run(list(map(str,args)),input=value,text=True,capture_output=True,timeout=60,env=env)
def sql(value):
 r=run(cmd,value);assert r.returncode==0,r.stderr;return r.stdout.strip()
def denied(value,expected='permission denied'):
 r=run(cmd,value);assert r.returncode!=0 and expected in r.stderr,r.stderr

ORIGINAL="CREATE OR REPLACE FUNCTION public.fn_notify_mention()\n RETURNS trigger\n LANGUAGE plpgsql\n SET search_path TO 'public', 'extensions'\nAS $function$\nDECLARE\n    tagger_name TEXT;\nBEGIN\n    IF NEW.mentioned_user_id != NEW.mentioned_by_id THEN\n        SELECT COALESCE(display_name, username, 'Someone') INTO tagger_name FROM public.profiles WHERE id = NEW.mentioned_by_id;\n        INSERT INTO public.notifications (user_id, type, title, message, data)\n        VALUES (NEW.mentioned_user_id, 'mention', tagger_name || ' tagged you in a post', 'Tap to view', jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.comment_id, 'tagger_id', NEW.mentioned_by_id));\n    END IF;\n    RETURN NEW;\nEND;\n$function$\n"
actor='11111111-1111-1111-1111-111111111111'
recipient='22222222-2222-2222-2222-222222222222'
post='33333333-3333-3333-3333-333333333333'
auth=f"SET ROLE authenticated; SET request.jwt.claim.sub='{actor}'; "
insert=f"INSERT INTO public.mentions(mentioned_by_id,mentioned_user_id,post_id) VALUES('{actor}','{recipient}','{post}');"
migration=(root/'supabase/migrations/20261020171316_mention_notification_trigger_authorization.sql').read_text()
def metadata():return sql("""SELECT jsonb_build_array(
 (SELECT jsonb_agg(jsonb_build_array(c.relname,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,c.relowner) ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','S')),
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p),
 (SELECT jsonb_agg(jsonb_build_array(attrelid,attnum,attacl::text) ORDER BY attrelid,attnum) FROM pg_attribute WHERE attacl IS NOT NULL),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE NOT t.tgisinternal));""")
try:
 r=run([pg/'initdb','-D',cluster/'data','-U','postgres','--auth-local=trust','--no-locale','--encoding=UTF8']);assert r.returncode==0,r.stderr
 (cluster/'socket').mkdir()
 with (cluster/'data/postgresql.conf').open('a') as f:f.write(f"\nlisten_addresses=''\nunix_socket_directories='{cluster/'socket'}'\nport=55444\nshared_buffers='16MB'\n")
 r=run([pg/'pg_ctl','-D',cluster/'data','-l',cluster/'server.log','-w','start']);assert r.returncode==0,r.stderr
 sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA extensions;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,display_name text,username text,private_name text);
 CREATE TABLE public.social_posts(id uuid PRIMARY KEY);
 CREATE TABLE public.social_reels(id uuid PRIMARY KEY);
 CREATE TABLE public.mentions(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,mentioned_by_id uuid,mentioned_user_id uuid,post_id uuid,comment_id uuid);
 CREATE TABLE public.notifications(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid,type text,title text,message text,data jsonb);
 ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY; ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "Users can insert mentions" ON public.mentions FOR INSERT WITH CHECK((SELECT auth.uid())=mentioned_by_id);
 CREATE POLICY "Users can view mentions" ON public.mentions FOR SELECT USING((SELECT auth.uid())=mentioned_user_id OR (SELECT auth.uid())=mentioned_by_id);
 CREATE POLICY "Service role inserts" ON public.notifications FOR INSERT TO service_role WITH CHECK(true);
 GRANT SELECT,INSERT ON public.mentions TO authenticated;
 GRANT SELECT ON public.social_posts,public.social_reels TO authenticated,service_role;
 GRANT SELECT(id,display_name,username) ON public.profiles TO authenticated;
 GRANT SELECT,INSERT ON public.mentions,public.notifications TO service_role;
 CREATE FUNCTION public.validate_mentions_post_id() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$
 BEGIN
   IF NEW.post_id IS NULL THEN RETURN NEW; END IF;
   IF EXISTS (SELECT 1 FROM public.social_posts WHERE id=NEW.post_id) THEN RETURN NEW; END IF;
   IF EXISTS (SELECT 1 FROM public.social_reels WHERE id=NEW.post_id) THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'mentions.post_id % not found in social_posts or social_reels',NEW.post_id;
 END;
 $function$;
 CREATE TRIGGER validate_mentions_post_id_before_insert BEFORE INSERT ON public.mentions FOR EACH ROW EXECUTE FUNCTION public.validate_mentions_post_id();
 CREATE TRIGGER validate_mentions_post_id_before_update BEFORE UPDATE ON public.mentions FOR EACH ROW EXECUTE FUNCTION public.validate_mentions_post_id();
 """)
 sql(ORIGINAL)
 sql('CREATE TRIGGER trg_notify_mention AFTER INSERT ON public.mentions FOR EACH ROW EXECUTE FUNCTION public.fn_notify_mention();')
 assert sql("SELECT has_function_privilege('anon','fn_notify_mention()','EXECUTE') AND has_function_privilege('authenticated','fn_notify_mention()','EXECUTE');")=='t','Actual original CREATE FUNCTION must retain its default PUBLIC EXECUTE for this transition'

 sql(f"INSERT INTO public.profiles VALUES('{actor}','Visible Name','username','private secret'); INSERT INTO public.social_posts VALUES('{post}');")
 assert sql("SELECT md5(prosrc) FROM pg_proc WHERE oid='fn_notify_mention()'::regprocedure;")=='72bbb515ca859e29f5947f975bebfcfd'
 denied(auth+insert,'permission denied for table notifications')
 assert sql('SELECT count(*) FROM mentions;')=='0'
 before=metadata();sql(migration);assert metadata()==before,'table ACLs/column privacy/RLS/policies/trigger bindings changed'
 assert sql("SELECT NOT has_function_privilege('anon','fn_notify_mention()','EXECUTE') AND NOT has_function_privilege('authenticated','fn_notify_mention()','EXECUTE') AND has_function_privilege('service_role','fn_notify_mention()','EXECUTE');")=='t'
 sql(auth+insert)
 assert sql('SELECT count(*) FROM notifications;')=='1'
 assert sql(f"SELECT user_id='{recipient}' AND type='mention' AND title='Visible Name tagged you in a post' AND message='Tap to view' AND data->>'tagger_id'='{actor}' AND data->>'post_id'='{post}' FROM notifications;")=='t'
 denied(auth+"INSERT INTO notifications(user_id) VALUES('"+recipient+"');")
 # Even the observed legacy broad table INSERT cannot bypass notification RLS.
 sql('GRANT INSERT ON notifications TO authenticated;')
 denied(auth+"INSERT INTO notifications(user_id) VALUES('"+recipient+"');",'row-level security')
 sql('REVOKE INSERT ON notifications FROM authenticated;')
 denied(auth+f"INSERT INTO mentions(mentioned_by_id,mentioned_user_id,post_id) VALUES('{recipient}','{actor}','{post}');",'row-level security')
 denied(auth+f"INSERT INTO mentions(mentioned_by_id,mentioned_user_id,post_id) VALUES('{actor}','{recipient}','44444444-4444-4444-4444-444444444444');",'not found')
 denied(auth+'SELECT public.fn_notify_mention();','permission denied for function')
 denied('SET ROLE anon; SELECT public.fn_notify_mention();','permission denied for function')
 denied(auth+'SELECT private_name FROM profiles;')
 # Independently test the definer actor check under a real SET ROLE, even if
 # a future overly broad mention policy exists. Roll back that synthetic policy.
 denied("BEGIN; CREATE POLICY native_broad ON mentions FOR INSERT TO authenticated WITH CHECK(true); "+auth+f"INSERT INTO mentions(mentioned_by_id,mentioned_user_id,post_id) VALUES('{recipient}','{actor}','{post}');",'Mention actor must match')
 assert sql('SELECT count(*) FROM notifications;')=='1'
 sql(auth+f"INSERT INTO mentions(mentioned_by_id,mentioned_user_id,post_id) VALUES('{actor}','{actor}','{post}');")
 assert sql('SELECT count(*) FROM notifications;')=='1','Self mentions must not notify'
 sql('SET ROLE service_role; '+insert)
 assert sql('SELECT count(*) FROM notifications;')=='2'
 assert sql("SELECT prosecdef AND pg_get_userbyid(proowner)='postgres' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid='fn_notify_mention()'::regprocedure;")=='t'
 # Recreate the exact original body with the already-private live ACL. CREATE
 # OR REPLACE preserves that ACL; installing the correction must preserve it too.
 sql(ORIGINAL)
 private_acl_before=sql("SELECT proacl::text FROM pg_proc WHERE oid='fn_notify_mention()'::regprocedure;")
 assert private_acl_before=='{postgres=X/postgres,service_role=X/postgres}'
 private_metadata_before=metadata()
 sql(migration)
 assert private_acl_before==sql("SELECT proacl::text FROM pg_proc WHERE oid='fn_notify_mention()'::regprocedure;")
 assert private_metadata_before==metadata()
 denied(migration,'Mention notification source/owner drift')
 print(json.dumps({'passed':True,'cases':['actual-original-public-execute-default-admitted-and-removed','existing-private-function-acl-preserved','actual-invoker-trigger-fails-before','authenticated-trigger-notification-after','payload-and-display-privacy-preserved','table-column-acls-rls-policies-binding-unchanged','direct-browser-notification-denied-even-with-legacy-insert','forged-actor-rls-and-independent-definer-refusal-under-set-role','invalid-post-before-trigger-refusal','no-direct-browser-execute','self-mention-no-notification','service-writer-preserved','definer-owner-searchpath-verified','replay-refused']}))
finally:
 if (cluster/'data/postmaster.pid').exists():
  r=run([pg/'pg_ctl','-D',cluster/'data','-m','fast','-w','stop']);assert r.returncode==0,r.stderr
 shutil.rmtree(cluster)
