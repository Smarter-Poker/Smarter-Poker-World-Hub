"""Actual PostgreSQL17 function with isolated hand-history fixtures. No production connection."""
import argparse, json, os, pathlib, subprocess, tempfile, shutil
root=pathlib.Path(__file__).resolve().parents[2]
p=root/'scripts/ci/probes/integrity-hands'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=pathlib.Path,default=root/'artifacts/integrity-hands')
out=parser.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False)
pg=pathlib.Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
installer=(root/'supabase/migrations/20260914080500_integrity_hand_search_continuation.sql').read_text()
env={k:v for k,v in os.environ.items() if not k.startswith('PG')};env['LC_ALL']='C'
cluster=pathlib.Path(tempfile.mkdtemp(prefix='integrity-hands-native-'));sock=cluster/'socket';sock.mkdir(mode=0o700)
psql=[str(pg/'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-h',str(sock),'-p','55764','-U','postgres','-d','postgres']
checks=[]
def cmd(argv,sql=None):
 r=subprocess.run(list(map(str,argv)),input=sql,text=True,capture_output=True,env=env,timeout=30)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
def run(sql):return cmd(psql,sql)
def check(name,test):
 checks.append({'name':name,'passed':bool(test)})
 if not test:raise AssertionError(name)
def quote(s):return "'"+str(s).replace("'","''")+"'"
subject='00000000-0000-0000-0000-000000000001';pair='00000000-0000-0000-0000-000000000002'
def read(cursor=None,who=subject,partner=None,limit=25):
 args=[quote(who)+'::uuid' if who else 'NULL',quote(partner)+'::uuid' if partner else 'NULL',"'2026-09-14 07:00Z'",str(limit),quote(json.dumps(cursor))+'::jsonb' if cursor is not None else 'NULL','true']
 return json.loads(run('SET ROLE service_role; SELECT fn_ca_integrity_hands('+','.join(args)+');'))
try:
 check('postgres17-required','PostgreSQL) 17.' in cmd([pg/'postgres','--version']))
 cmd([pg/'initdb','-D',cluster/'data','-U','postgres','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8'])
 cmd([pg/'pg_ctl','-D',cluster/'data','-l',cluster/'server.log','-o',f"-k {sock} -p 55764 -c listen_addresses='' -c timezone=UTC -c shared_buffers=16MB -c max_connections=8",'-w','start'])
 run('''CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE hand_history(id uuid PRIMARY KEY,table_id uuid,tournament_id uuid,hand_number bigint,game_variant text,pot_size numeric,big_blind numeric,small_blind numeric,players jsonb,winners jsonb,actions jsonb,created_at timestamptz);
 CREATE INDEX hand_order ON hand_history(created_at DESC,id DESC);
 INSERT INTO hand_history SELECT lpad(to_hex(i),32,'0')::uuid,NULL,NULL,i,'nlh',0,2,1,
 CASE WHEN i IN(551,701,1201) THEN '[{"userId":"00000000-0000-0000-0000-000000000001"}]'::jsonb ELSE '[]'::jsonb END
 ||CASE WHEN i IN(701,1201) THEN '[{"user_id":"00000000-0000-0000-0000-000000000002"}]'::jsonb ELSE '[]'::jsonb END,
 '[]'::jsonb,'[]'::jsonb,'2026-09-14 07:00Z'::timestamptz-i*interval '1 second' FROM generate_series(1,1201)i;''')
 run((p/'baseline.sql').read_text())
 run('REVOKE ALL ON FUNCTION fn_ca_integrity_hands(uuid,uuid,timestamptz,integer,jsonb,boolean) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION fn_ca_integrity_hands(uuid,uuid,timestamptz,integer,jsonb,boolean) TO service_role;')
 check('exact-live-definition',run("SELECT md5(pg_get_functiondef('fn_ca_integrity_hands(uuid,uuid,timestamptz,integer,jsonb,boolean)'::regprocedure))")=='33c571e374bf6a57aa79f349944e833b')
 baseline=read();check('baseline-loses-older-player-evidence',baseline['hands']==[] and baseline['next_cursor'] is None and baseline['state']=='nothing_to_review')
 run(installer);candidate_md5=run("SELECT md5(pg_get_functiondef('fn_ca_integrity_hands(uuid,uuid,timestamptz,integer,jsonb,boolean)'::regprocedure))")
 pages=[];cursor=None
 for _ in range(5):
  page=read(cursor);pages.append(page);cursor=page['next_cursor']
  check('candidate-scan-bounded-'+str(len(pages)),page['scanned_count']<=500 and len(page['hands'])<=25)
  if cursor is None:break
 check('empty-full-sample-retains-continuation',pages[0]['hands']==[] and pages[0]['state']=='search_incomplete' and pages[0]['next_cursor'] is not None)
 check('sparse-matches-remain-reachable-across-all-windows',[h['hand_number'] for page in pages for h in page['hands']]==[551,701,1201])
 check('exhaustion-stops-with-known-coverage',len(pages)==3 and pages[-1]['next_cursor'] is None and pages[-1]['truncated'] is False)
 cursor=None;pair_hands=[]
 for _ in range(5):
  page=read(cursor,partner=pair);pair_hands.extend(h['hand_number'] for h in page['hands']);cursor=page['next_cursor']
  if cursor is None:break
 check('pair-search-keeps-both-player-filters',pair_hands==[701,1201])
 first=read(who=None,limit=50);second=read(first['next_cursor'],who=None,limit=50)
 check('dense-results-use-last-returned-match',[h['hand_number'] for h in first['hands']+second['hands']]==list(range(1,101)))
 check('pair-without-primary-refused',read(who=None,partner=pair)['code']=='PLAYER_ID_REQUIRED')
 for i,bad in enumerate([{},[],['created_at','id'],{'created_at':None,'id':subject},{'created_at':'2026-09-14 07:00Z','id':None},{'created_at':'bad','id':subject},{'created_at':'2026-09-14 07:00Z','id':'bad'}]):
  check('invalid-cursor-'+str(i),read(bad)['ok'] is False)
 run("UPDATE hand_history SET created_at='2026-09-14 06:00:00.123456+00';")
 cursor=None;ids=[]
 for _ in range(30):
  page=read(cursor,who=None,limit=50);ids.extend(h['id'] for h in page['hands']);cursor=page['next_cursor']
  if cursor is None:break
 check('microsecond-ties-covered-once',len(ids)==1201 and len(set(ids))==1201)
 check('full-history-order-matches-native-query',ids==json.loads(run('SELECT jsonb_agg(id ORDER BY created_at DESC,id DESC) FROM hand_history;')))
 for role in ('anon','authenticated'):
  r=subprocess.run(psql,input='SET ROLE '+role+'; SELECT fn_ca_integrity_hands();',text=True,capture_output=True,env=env,timeout=10)
  check(role+'-cannot-read-private-history',r.returncode!=0 and 'permission denied' in r.stderr)
 check('service-has-no-direct-fixture-access',run("SELECT NOT has_table_privilege('service_role','hand_history','SELECT')")=='t')
 check('candidate-body-is-qualified',candidate_md5=='13ef06d17be466008dacf2ee9dab791e')
 run(installer)
 check('migration-replay-preserves-body',run("SELECT md5(pg_get_functiondef('fn_ca_integrity_hands(uuid,uuid,timestamptz,integer,jsonb,boolean)'::regprocedure))")==candidate_md5)
 altered=(p/'baseline.sql').read_text().replace('v_candidate  integer := 500','v_candidate  integer := 499')
 check('drift-fixture-differs',altered!=(p/'baseline.sql').read_text());run(altered)
 r=subprocess.run(psql,input='BEGIN;\n'+installer+'\nCOMMIT;',text=True,capture_output=True,env=env,timeout=10)
 check('migration-refuses-unreviewed-definition',r.returncode!=0 and 'definition drift' in r.stderr)
 check('refused-migration-preserves-drift',run("SELECT md5(pg_get_functiondef('fn_ca_integrity_hands(uuid,uuid,timestamptz,integer,jsonb,boolean)'::regprocedure))") not in ('33c571e374bf6a57aa79f349944e833b',candidate_md5))
 result={'passed':True,'checks':checks,'baseline':baseline,'candidate_md5':candidate_md5,'page_counts':[len(x['hands']) for x in pages],'scope':'Read-only exact function with isolated fixture rows. No production query or write; all horses and humans remain included; no identity exclusion added.'}
 (out/'RESULTS.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'passed':True,'checks':len(checks),'candidate_md5':candidate_md5,'player_page_counts':result['page_counts']}))
finally:
 subprocess.run([str(pg/'pg_ctl'),'-D',str(cluster/'data'),'-m','immediate','-w','stop'],capture_output=True,env=env,timeout=15)
 shutil.rmtree(cluster)
