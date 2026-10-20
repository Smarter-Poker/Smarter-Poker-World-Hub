#!/usr/bin/env python3
"""Native no-default ACL boundary test; minimal schema, no production access."""
import json,os,shutil,subprocess,sys,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[2];pg=Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
scratch=root.parent if str(root).startswith('/Volumes/SmarterWork/agent-work/') else None
if sys.platform=='darwin' and scratch is None:raise SystemExit('Use an owned external SSD checkout')
cluster=Path(tempfile.mkdtemp(prefix='bl-',dir=scratch));env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
cmd=[pg/'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-h',cluster/'socket','-p','55446','-U','postgres','-d','postgres']
def run(args,value=None):return subprocess.run(list(map(str,args)),input=value,text=True,capture_output=True,timeout=60,env=env)
def sql(value):
 r=run(cmd,value);assert r.returncode==0,r.stderr;return r.stdout.strip()
def denied(value,expected='permission denied'):
 r=run(cmd,value);assert r.returncode!=0 and expected in r.stderr,r.stderr
m=json.loads((root/'scripts/ci/reviewed-baseline-caller-access.json').read_text());rows={x['table']:x for x in m['tables']};migration=(root/'supabase/migrations/20261020173409_explicit_legacy_baseline_caller_access.sql').read_text()
actor='11111111-1111-1111-1111-111111111111';other='22222222-2222-2222-2222-222222222222';auth=f"SET ROLE authenticated;SET request.jwt.claim.sub='{actor}';"
# Actual current default metadata identifies five serial defaults, but only two
# have INSERT consumers. The reader-only three must not receive sequence usage.
serials={'article_bookmarks','page_followers','qr_code_scans','tournament_series','venue_live_tables'}
privacy={'club_members','clubs','commander_home_members','live_streams','profiles','social_posts','social_reels','table_seats','trivia_pvp_matches','trivia_pvp_queue','trivia_question_reports','trivia_questions','user_lobby_filters'}
assert len(rows)==148 and not (set(rows)&privacy)
assert not rows['horse_source_assignments']['rights']
assert 'INSERT' not in rows['premium_feature_access']['rights'].get('authenticated',[])
assert 'INSERT' not in rows['diamond_transactions']['rights'].get('authenticated',[])
assert 'INSERT' not in rows['users']['rights'].get('authenticated',[])
def metadata():return sql("SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p),(SELECT jsonb_agg(jsonb_build_array(oid,relrowsecurity,relforcerowsecurity,relowner) ORDER BY oid) FROM pg_class WHERE relnamespace='public'::regnamespace),(SELECT jsonb_agg(jsonb_build_array(adrelid,adnum,adbin::text) ORDER BY adrelid,adnum) FROM pg_attrdef),(SELECT jsonb_agg(to_jsonb(a) ORDER BY attrelid,attnum) FROM pg_attribute a WHERE attacl IS NOT NULL));")
try:
 r=run([pg/'initdb','-D',cluster/'data','-U','postgres','--auth-local=trust','--no-locale','--encoding=UTF8']);assert r.returncode==0,r.stderr
 (cluster/'socket').mkdir()
 with (cluster/'data/postgresql.conf').open('a') as f:f.write(f"\nlisten_addresses=''\nunix_socket_directories='{cluster/'socket'}'\nport=55446\nshared_buffers='16MB'\n")
 r=run([pg/'pg_ctl','-D',cluster/'data','-l',cluster/'server.log','-w','start']);assert r.returncode==0,r.stderr
 sql("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;")
 for t,x in rows.items():
  idtype='bigserial' if t in serials else 'uuid DEFAULT gen_random_uuid()'
  sql(f'CREATE TABLE {t}(id {idtype} PRIMARY KEY,user_id uuid,value integer DEFAULT 0,private_note text);ALTER TABLE {t} ENABLE ROW LEVEL SECURITY;')
  # Ownership fixture verifies that grants do not bypass row policies. It is
  # deliberately not a recreation/certification of all application policies.
  if t in ['diamond_transactions','users']:
   sql(f'CREATE POLICY read_own ON {t} FOR SELECT TO authenticated USING(user_id=auth.uid());')
   if t=='users':sql('CREATE POLICY update_own ON users FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());')
  else:sql(f'CREATE POLICY own_rows ON {t} TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());')
  if t=='scheduled_lives':sql('CREATE POLICY public_read ON scheduled_lives FOR SELECT TO anon USING(true);')
 # Before: independent table permission failure and subsequent serial failure.
 denied(auth+f"INSERT INTO bankroll_goals(user_id) VALUES('{actor}');")
 denied("SET ROLE service_role;SELECT * FROM commander_staff;")
 sql('GRANT INSERT ON page_followers,qr_code_scans TO service_role;')
 for t in ['page_followers','qr_code_scans']:denied(f"SET ROLE service_role;INSERT INTO {t}(user_id) VALUES('{actor}');",'permission denied for sequence')
 sql('REVOKE INSERT ON page_followers,qr_code_scans FROM service_role;')
 before=metadata();sql(migration);assert metadata()==before,'RLS/owner/column/default metadata changed'
 checks=0
 for t,x in rows.items():
  for role in ['anon','authenticated','service_role']:
   expected=set(x['rights'].get(role,[]))
   for op in ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
    assert sql(f"SELECT has_table_privilege('{role}','public.{t}','{op}');")==('t' if op in expected else 'f'),(t,role,op,expected);checks+=1
 assert sql("SELECT has_table_privilege('authenticated','bankroll_goals','SELECT');")=='t'
 sql(auth+f"INSERT INTO bankroll_goals(user_id,value) VALUES('{actor}',4);")
 denied(auth+f"INSERT INTO bankroll_goals(user_id,value) VALUES('{other}',5);",'row-level security')
 sql(f"INSERT INTO bankroll_goals(user_id,value) VALUES('{other}',8);")
 assert sql(auth+'SELECT count(*) FROM bankroll_goals;')=='1'
 sql(auth+f"DELETE FROM bankroll_goals WHERE user_id='{actor}';")
 assert sql('SELECT count(*) FROM bankroll_goals;')=='1'
 for t in ['premium_feature_access','diamond_transactions','users']:denied(auth+f"INSERT INTO {t}(user_id) VALUES('{actor}');")
 for t in ['page_followers','qr_code_scans']:
  sql(f"SET ROLE service_role;INSERT INTO {t}(user_id) VALUES('{actor}');")
  assert sql(f'SELECT count(*) FROM {t};')=='1'
 for t in serials:
  for role in ['anon','authenticated','service_role']:
   expected=role=='service_role' and t in ['page_followers','qr_code_scans']
   for op in ['USAGE','SELECT','UPDATE']:
    assert sql(f"SELECT has_sequence_privilege('{role}','{t}_id_seq','{op}');")==('t' if expected and op=='USAGE' else 'f'),(t,role,op)
 denied('SET ROLE anon;SELECT * FROM commander_api_keys;')
 sql('SET ROLE anon;SELECT * FROM scheduled_lives;')
 # Existing broad ACLs are preserved, rather than rewritten to fixture minimums.
 sql('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;')
 broad=sql("SELECT jsonb_agg(jsonb_build_array(oid,relacl::text) ORDER BY oid) FROM pg_class WHERE relnamespace='public'::regnamespace;")
 sql(migration);assert sql("SELECT jsonb_agg(jsonb_build_array(oid,relacl::text) ORDER BY oid) FROM pg_class WHERE relnamespace='public'::regnamespace;")==broad
 # Admission drift must refuse atomically before any candidate grant.
 sql('REVOKE INSERT ON bankroll_goals FROM authenticated;ALTER TABLE commander_staff DISABLE ROW LEVEL SECURITY;')
 denied(migration,'Expected postgres-owned');assert sql("SELECT has_table_privilege('authenticated','bankroll_goals','INSERT');")=='f'
 sql('ALTER TABLE commander_staff ENABLE ROW LEVEL SECURITY;GRANT SELECT(private_note) ON commander_staff TO authenticated;')
 denied(migration,'Column ACL');assert sql("SELECT has_table_privilege('authenticated','bankroll_goals','INSERT');")=='f'
 sql('REVOKE SELECT(private_note) ON commander_staff FROM authenticated;ALTER SEQUENCE page_followers_id_seq OWNED BY NONE;')
 denied(migration,'Expected reviewed current serial default');assert sql("SELECT has_table_privilege('authenticated','bankroll_goals','INSERT');")=='f'
 print(f'PASS: 148 intent decisions/147 granted tables, {checks} role-operation boundaries, current serial fail-before/pass-after, reader-only sequences denied, own/other RLS, unsafe browser writes denied, existing ACL preservation, atomic owner/RLS/column/default drift refusal. Minimal fixture; not full business schema/reset certification.')
finally:
 run([pg/'pg_ctl','-D',cluster/'data','-m','immediate','-w','stop']);shutil.rmtree(cluster)
