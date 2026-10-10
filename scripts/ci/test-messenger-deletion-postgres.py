#!/usr/bin/env python3
"""Qualify the exact tombstone migration in an isolated PostgreSQL 17 cluster.
Prior finance projection functions are installed verbatim with deferred body validation;
this fixture exercises deletion, common visibility, counts and grants, not finance hydration.
"""
import argparse,json,os,re,shutil,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,default=ROOT/'artifacts/messenger-deletion-postgres')
out=parser.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False)
pg=Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
cluster=Path(tempfile.mkdtemp(prefix='messenger-deletion-'));socket=cluster/'socket';socket.mkdir(mode=0o700)
cmd=[str(pg/'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-h',str(socket),'-p','55488','-U','postgres','-d','postgres']
results={'passed':False,'cases':[]}
def command(args,sql=None):return subprocess.run([str(x) for x in args],input=sql,text=True,capture_output=True,env=env,timeout=45)
def run(name,sql,expected=None,failure=None):
 r=command(cmd,sql);(out/(name+'.log')).write_text(r.stdout+r.stderr)
 ok=(r.returncode!=0 and failure in r.stderr) if failure else (r.returncode==0 and (expected is None or r.stdout.strip()==expected))
 results['cases'].append({'name':name,'passed':ok})
 if not ok:raise RuntimeError(name+': '+r.stdout[-2000:]+r.stderr[-2000:])
id=lambda n:f'00000000-0000-4000-8000-{n:012d}'
u,peer,outsider,c,m=[id(n) for n in range(1,6)]
migration=(ROOT/'supabase/migrations/20261010050330_messenger_durable_message_deletion.sql').read_text()
rollback='\n'.join(line[3:] for line in migration.split('-- ROLLBACK (apply as a new migration; retain installed history):')[1].splitlines() if line.startswith('-- '))
# Captured before-image definitions are the exact installation precondition.
baseline=rollback.split('-- DROP FUNCTION')[0] if '-- DROP FUNCTION' in rollback else rollback[:rollback.index('DROP FUNCTION')]
try:
 if not re.search(r'PostgreSQL\) 17\.',command([pg/'postgres','--version']).stdout):raise RuntimeError('PostgreSQL 17 required')
 r=command([pg/'initdb','-D',cluster/'data','-U','postgres','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8','--set=dynamic_shared_memory_type=mmap'])
 if r.returncode:raise RuntimeError(r.stderr)
 with (cluster/'data/postgresql.conf').open('a') as f:f.write("\nlisten_addresses=''\nunix_socket_directories='"+str(socket)+"'\nunix_socket_permissions=0700\nport=55488\nshared_buffers='16MB'\n")
 r=command([pg/'pg_ctl','-D',cluster/'data','-l',cluster/'server.log','-w','start'])
 if r.returncode:raise RuntimeError(r.stderr)
 run('fixture',f"""
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA extensions; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('fixture.user',true),'')::uuid $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,display_name text,username text,avatar_url text);
 CREATE TABLE social_conversations(id uuid PRIMARY KEY,group_name text,is_group boolean,last_message_at timestamptz);
 CREATE TABLE social_conversation_participants(conversation_id uuid,user_id uuid,context_entity_id uuid,context_entity_type text,last_read_at timestamptz);
 CREATE TABLE social_messages(id uuid PRIMARY KEY,conversation_id uuid,sender_id uuid,created_at timestamptz,is_deleted boolean DEFAULT false);
 CREATE TABLE accounting_invoice_deliveries(message_id uuid,delivery_mode text);
 CREATE FUNCTION fn_caller_is_engine() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
 CREATE FUNCTION fn_messenger_continuity_allowed(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.social_conversation_participants WHERE user_id=$1 AND conversation_id=$2)$$;
 CREATE FUNCTION fn_messenger_message_visible_to(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
 CREATE FUNCTION fn_accounting_correction_legacy_identity(uuid,uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT NULL::jsonb$$;
 GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
 INSERT INTO profiles(id) VALUES('{u}'),('{peer}'),('{outsider}');
 INSERT INTO social_conversations VALUES('{c}','Fixture',false,now());
 INSERT INTO social_conversation_participants(conversation_id,user_id) VALUES('{c}','{u}'),('{c}','{peer}');
 INSERT INTO social_messages VALUES('{m}','{c}','{peer}',now(),false);
 """)
 run('exact-before-images','SET check_function_bodies=off; '+baseline+'COMMIT;')
 run('install-exact-migration','SET check_function_bodies=off; '+migration)
 run('anonymous-hide-denied',f"SET ROLE anon; SELECT fn_messenger_hide_message('{m}','{u}');",failure='permission denied')
 run('authenticated-hide-denied',f"SET ROLE authenticated; SELECT fn_messenger_hide_message('{m}','{u}');",failure='permission denied')
 run('nonparticipant-rejected',f"SET ROLE service_role; SELECT fn_messenger_hide_message('{m}','{outsider}')->>'success';",'false')
 run('own-delete',f"SET ROLE service_role; SELECT fn_messenger_hide_message('{m}','{u}')->>'success';",'true')
 run('repeat-delete',f"SET ROLE service_role; SELECT fn_messenger_hide_message('{m}','{u}')->>'success'; SELECT count(*) FROM messenger_hidden_messages;",'true\n1')
 run('fresh-read-hides',f"SELECT count(*) FROM fn_messenger_continuity_visible('{u}','{c}');",'0')
 run('peer-retains-message',f"SELECT count(*) FROM fn_messenger_continuity_visible('{peer}','{c}');",'1')
 run('unread-drops-only-owner',f"SELECT unread_count FROM fn_get_user_conversations('{u}'); SELECT unread_count FROM fn_get_user_conversations('{peer}');",'0\n0')
 run('source-message-retained',f"SELECT NOT is_deleted FROM social_messages WHERE id='{m}';",'t')
 run('rls-owner-can-read',f"SET fixture.user='{u}'; SET ROLE authenticated; SELECT count(*) FROM messenger_hidden_messages;",'1')
 run('rls-peer-cannot-read',f"SET fixture.user='{peer}'; SET ROLE authenticated; SELECT count(*) FROM messenger_hidden_messages;",'0')
 run('direct-insert-denied',f"SET ROLE authenticated; INSERT INTO messenger_hidden_messages VALUES('{peer}','{m}',now());",failure='permission denied')
 run('role-function-grants',"SELECT has_function_privilege('service_role','fn_messenger_hide_message(uuid,uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','fn_messenger_hide_message(uuid,uuid)','EXECUTE');",'t')
 # Distinct connections race against the unique account/message key.
 workers=[subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env) for _ in range(6)]
 for w in workers:w.stdin.write(f"SET ROLE service_role; SELECT fn_messenger_hide_message('{m}','{peer}')->>'success';");w.stdin.close()
 for w in workers:
  w.wait(timeout=20)
  if w.returncode or w.stdout.read().strip()!='true':raise RuntimeError('Concurrent deletion failed: '+w.stderr.read())
 run('concurrent-duplicates-one-row',f"SELECT count(*) FROM messenger_hidden_messages WHERE user_id='{peer}';",'1')
 run('revoked-participant-denied',f"DELETE FROM social_conversation_participants WHERE user_id='{u}'; SELECT fn_messenger_hide_message('{m}','{u}')->>'success';",'false')
 run('rollback-is-executable','SET check_function_bodies=off; '+rollback)
 run('rollback-restores-functions',"SELECT to_regclass('public.messenger_hidden_messages') IS NULL AND to_regprocedure('public.fn_messenger_hide_message(uuid,uuid)') IS NULL;",'t')
 run('reinstall-after-rollback','SET check_function_bodies=off; '+migration)
 results['passed']=True
finally:
 if (cluster/'data/postmaster.pid').exists():
  r=command([pg/'pg_ctl','-D',cluster/'data','-m','fast','-w','stop'])
  if r.returncode:raise RuntimeError('Owned PostgreSQL did not stop')
 if (cluster/'server.log').exists():shutil.copyfile(cluster/'server.log',out/'server.log')
 shutil.rmtree(cluster)
 (out/'RESULTS.json').write_text(json.dumps(results,indent=2)+'\n')
 print(json.dumps({'passed':results['passed'],'cases':len(results['cases']),'evidence':str(out)}))
