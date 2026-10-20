#!/usr/bin/env python3
"""No-default ACL qualification; exact invoker bodies on minimal local schemas."""
import json,os,shutil,subprocess,sys,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
pg=Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
scratch=root.parent if str(root).startswith('/Volumes/SmarterWork/agent-work/') else None
if sys.platform=='darwin' and scratch is None:raise SystemExit('Use owned external SSD checkout')
cluster=Path(tempfile.mkdtemp(prefix='iv-',dir=scratch));env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
cmd=[pg/'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-h',cluster/'socket','-p','55445','-U','postgres','-d','postgres']
def run(args,value=None):return subprocess.run(list(map(str,args)),input=value,text=True,capture_output=True,timeout=60,env=env)
def sql(value):
 r=run(cmd,value);assert r.returncode==0,r.stderr;return r.stdout.strip()
def denied(value,expect='permission denied'):
 r=run(cmd,value);assert r.returncode!=0 and expect in r.stderr,r.stderr
m=json.loads((root/'scripts/ci/reviewed-invoker-access.json').read_text());fn=json.loads((root/'scripts/ci/reviewed-invoker-function-fixtures.json').read_text())['functions'];migration=(root/'supabase/migrations/20261020172058_explicit_reachable_invoker_and_view_access.sql').read_text()
actor='11111111-1111-1111-1111-111111111111';other='22222222-2222-2222-2222-222222222222';playlist='33333333-3333-3333-3333-333333333333';group='44444444-4444-4444-4444-444444444444'
auth=f"SET ROLE authenticated;SET request.jwt.claim.sub='{actor}';"
shapes={
 'audit_logs':'id uuid primary key,club_id uuid,value integer',
 'club_transactions':'id uuid primary key,club_id uuid,value integer',
 'video_playlists':'id uuid primary key,user_id uuid',
 'video_playlist_items':'id uuid default gen_random_uuid() primary key,playlist_id uuid,video_id text,video_title text,video_source text,sort_order integer,created_at timestamptz default now()',
 'data_audit_log':'id uuid default gen_random_uuid() primary key,table_name text,record_id text,action text,old_data jsonb,new_data jsonb,scrape_proof jsonb,agent_id text',
 'commander_home_group_follows':'id uuid primary key,group_id uuid,user_id uuid,notify_new_games boolean',
 'commander_home_groups':'id uuid primary key,owner_id uuid,vouch_count integer default 0,messenger_conversation_id uuid,name text',
 'conversations':'id uuid default gen_random_uuid() primary key,participant_ids uuid[],created_by uuid,category text,is_pinned boolean,is_read_only boolean,updated_at timestamptz',
 'messenger_participants':'id uuid default gen_random_uuid() primary key,conversation_id uuid,user_id uuid,role text,joined_at timestamptz,unique(conversation_id,user_id)'}
def invariant():return sql("SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p),(SELECT jsonb_agg(jsonb_build_array(oid,relrowsecurity,relforcerowsecurity,relowner,reloptions) ORDER BY oid) FROM pg_class WHERE relnamespace='public'::regnamespace),(SELECT jsonb_agg(to_jsonb(a) ORDER BY attrelid,attnum) FROM pg_attribute a WHERE attacl IS NOT NULL));")
try:
 r=run([pg/'initdb','-D',cluster/'data','-U','postgres','--auth-local=trust','--no-locale','--encoding=UTF8']);assert r.returncode==0,r.stderr
 (cluster/'socket').mkdir()
 with (cluster/'data/postgresql.conf').open('a') as f:f.write(f"\nlisten_addresses=''\nunix_socket_directories='{cluster/'socket'}'\nport=55445\nshared_buffers='16MB'\n")
 r=run([pg/'pg_ctl','-D',cluster/'data','-l',cluster/'server.log','-w','start']);assert r.returncode==0,r.stderr
 sql("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA extensions;GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;")
 for x in m['relations']:
  t=x['table']
  if x['kind']=='v':continue
  else:sql(f"CREATE TABLE {t}({shapes.get(t,'id uuid default gen_random_uuid() primary key,user_id uuid,value integer')});ALTER TABLE {t} ENABLE ROW LEVEL SECURITY;")
 for view,base in [('sandbox_coach_accuracy','sandbox_coach_results'),('video_library_health','video_library_videos'),('unified_events_calendar','poker_venues')]:sql(f'CREATE VIEW {view} WITH(security_invoker=true) AS SELECT id FROM {base};')
 # These are the already-qualified prior migration prerequisites, deliberately
 # separate from the incremental rights being tested.
 sql('GRANT SELECT,INSERT ON video_playlists TO authenticated;GRANT SELECT,DELETE ON video_playlist_items TO authenticated;GRANT SELECT ON wallets,club_chat,table_chat TO service_role;')
 sql("CREATE POLICY owner_parent ON video_playlists TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());CREATE POLICY owner_item ON video_playlist_items TO authenticated USING(EXISTS(SELECT 1 FROM video_playlists p WHERE p.id=playlist_id AND p.user_id=auth.uid())) WITH CHECK(EXISTS(SELECT 1 FROM video_playlists p WHERE p.id=playlist_id AND p.user_id=auth.uid()));")
 for name in ['fn_append_video_playlist','fn_reorder_video_playlist']:sql(fn[name])
 sql(f"INSERT INTO video_playlists VALUES('{playlist}','{actor}');")
 denied(auth+f"SELECT fn_append_video_playlist('{playlist}','abcdefghijk','title','source');")
 # Install actual trigger bodies without requiring EXECUTE on their function
 # at trigger runtime. The table operation still runs with caller rights.
 for name in ['auto_audit_log','fn_sync_home_game_vouch_count','fn_create_home_group_conversation','fn_add_member_to_group_conversation','fn_remove_member_from_group_conversation']:sql(fn[name])
 sql('CREATE TABLE venue_daily_tournaments(id uuid primary key,scrape_html_hash text,scrape_timestamp timestamptz);ALTER TABLE venue_daily_tournaments ENABLE ROW LEVEL SECURITY;GRANT INSERT ON venue_daily_tournaments TO service_role;CREATE TRIGGER audit AFTER INSERT ON venue_daily_tournaments FOR EACH ROW EXECUTE FUNCTION auto_audit_log();')
 denied("SET ROLE service_role;INSERT INTO venue_daily_tournaments VALUES(gen_random_uuid(),'proof',now());")
 sql('CREATE TABLE home_game_vouches(id uuid primary key,group_id uuid);GRANT INSERT,DELETE ON home_game_vouches TO service_role;CREATE TRIGGER vouch AFTER INSERT OR DELETE ON home_game_vouches FOR EACH ROW EXECUTE FUNCTION fn_sync_home_game_vouch_count();')
 sql(f"INSERT INTO commander_home_groups(id,owner_id) VALUES('{group}','{actor}');")
 denied(f"SET ROLE service_role;INSERT INTO home_game_vouches VALUES(gen_random_uuid(),'{group}');")
 sql('CREATE TRIGGER conversation AFTER INSERT ON commander_home_groups FOR EACH ROW EXECUTE FUNCTION fn_create_home_group_conversation();GRANT INSERT ON commander_home_groups TO service_role;')
 denied(f"SET ROLE service_role;INSERT INTO commander_home_groups(id,owner_id) VALUES(gen_random_uuid(),'{actor}');")
 sql('GRANT SELECT ON sandbox_coach_accuracy TO service_role;')
 denied('SET ROLE service_role;SELECT * FROM sandbox_coach_accuracy;')
 before=invariant();sql(migration);assert invariant()==before,'RLS/column ACL/owners/options changed'
 sql(auth+f"SELECT fn_append_video_playlist('{playlist}','abcdefghijk','title','source');SELECT fn_append_video_playlist('{playlist}','lmnopqrstuv','title2','source');SELECT fn_reorder_video_playlist('{playlist}',ARRAY['abcdefghijk','lmnopqrstuv'],ARRAY['lmnopqrstuv','abcdefghijk']);")
 assert sql("SELECT string_agg(video_id,',' ORDER BY sort_order) FROM video_playlist_items;")=='lmnopqrstuv,abcdefghijk'
 denied(auth+f"SELECT fn_reorder_video_playlist('{playlist}',ARRAY['abcdefghijk','lmnopqrstuv'],ARRAY['lmnopqrstuv','abcdefghijk']);",'Playlist changed')
 denied(f"SET ROLE authenticated;SET request.jwt.claim.sub='{other}';SELECT fn_append_video_playlist('{playlist}','zyxwvutsrqp','x','x');",'Playlist unavailable')
 sql("SET ROLE service_role;INSERT INTO venue_daily_tournaments VALUES(gen_random_uuid(),'proof',now());")
 assert sql('SELECT count(*) FROM data_audit_log;')=='1'
 sql(f"SET ROLE service_role;INSERT INTO home_game_vouches VALUES(gen_random_uuid(),'{group}');")
 assert sql(f"SELECT vouch_count FROM commander_home_groups WHERE id='{group}';")=='1'
 sql('SET ROLE service_role;DELETE FROM home_game_vouches;')
 assert sql(f"SELECT vouch_count FROM commander_home_groups WHERE id='{group}';")=='0'
 sql(f"SET ROLE service_role;INSERT INTO commander_home_groups(id,owner_id) VALUES(gen_random_uuid(),'{actor}');")
 assert sql('SELECT count(*) FROM conversations;')=='1';assert sql('SELECT count(*) FROM messenger_participants;')=='1'
 for view in ['sandbox_coach_accuracy','video_library_health','unified_events_calendar']:sql(f'SET ROLE service_role;SELECT * FROM {view};')
 # New service conversation membership add/remove uses the exact installed body.
 sql('CREATE TABLE commander_home_members(id uuid primary key,group_id uuid,user_id uuid,status text,role text,notify_new_games boolean);GRANT INSERT,UPDATE,DELETE ON commander_home_members TO service_role;CREATE TRIGGER add_member AFTER INSERT OR UPDATE ON commander_home_members FOR EACH ROW EXECUTE FUNCTION fn_add_member_to_group_conversation();CREATE TRIGGER remove_member AFTER DELETE OR UPDATE ON commander_home_members FOR EACH ROW EXECUTE FUNCTION fn_remove_member_from_group_conversation();')
 sql(f"SET ROLE service_role;INSERT INTO commander_home_members SELECT gen_random_uuid(),id,'{other}','approved','member',true FROM commander_home_groups WHERE messenger_conversation_id IS NOT NULL;")
 assert sql('SELECT count(*) FROM messenger_participants;')=='2'
 sql('SET ROLE service_role;DELETE FROM commander_home_members;');assert sql('SELECT count(*) FROM messenger_participants;')=='1'
 checks=0
 for x in m['relations']:
  for op in x['operations']:
   assert sql(f"SELECT has_table_privilege('{x['role']}','{x['table']}','{op}');")=='t';checks+=1
  for extra_role,extra_ops in x.get('additionalRights',{}).items():
   for op in extra_ops:
    assert sql(f"SELECT has_table_privilege('{extra_role}','{x['table']}','{op}');")=='t';checks+=1
  if x['role']=='service_role':
   for role in ['anon','authenticated']:assert sql(f"SELECT has_table_privilege('{role}','{x['table']}','INSERT');")=='f',x['table']
 sql(fn['fn_notify_home_game_created'])
 sql("CREATE TABLE social_pages(id uuid primary key,slug text,linked_entity_type text,linked_entity_id text);CREATE TABLE commander_home_games(id uuid primary key,group_id uuid,host_id uuid,title text,scheduled_date timestamptz);GRANT SELECT ON social_pages,commander_home_members TO service_role;GRANT INSERT ON commander_home_games TO service_role;CREATE TRIGGER notify_new AFTER INSERT ON commander_home_games FOR EACH ROW EXECUTE FUNCTION fn_notify_home_game_created();REVOKE SELECT ON commander_home_group_follows FROM service_role;")
 denied(f"SET ROLE service_role;INSERT INTO commander_home_games VALUES(gen_random_uuid(),'{group}','{actor}','test',now());")
 sql(migration);sql(f"SET ROLE service_role;INSERT INTO commander_home_games VALUES(gen_random_uuid(),'{group}','{actor}','test',now());")
 for table in ['audit_logs','club_transactions']:
  sql(f"INSERT INTO {table} VALUES(gen_random_uuid(),'{group}',1);SET ROLE service_role;DELETE FROM {table} WHERE club_id='{group}';")
  assert sql(f'SELECT count(*) FROM {table};')=='0'
 # Drift admission refuses atomically before adding any candidate grant.
 sql('REVOKE INSERT ON poker_goals FROM authenticated;ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;')
 denied(migration,'Expected postgres-owned');assert sql("SELECT has_table_privilege('authenticated','poker_goals','INSERT');")=='f'
 sql('ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;DROP TABLE audit_logs;DROP TABLE club_transactions;');sql(migration)
 assert sql("SELECT to_regclass('public.audit_logs') IS NULL AND to_regclass('public.club_transactions') IS NULL;")=='t'
 print(f'PASS: {len(m["relations"])} incremental relations, {checks} positive rights; exact playlist/audit/vouch/conversation/member trigger paths, before failures, ownership/stale-order denial, RLS/column/options preservation and atomic drift refusal. Minimal fixture, not full schema restore.')
finally:
 run([pg/'pg_ctl','-D',cluster/'data','-m','immediate','-w','stop']);shutil.rmtree(cluster)
