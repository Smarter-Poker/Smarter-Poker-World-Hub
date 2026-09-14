"""Exact captured fleet policy and audit helpers on private native PostgreSQL 17."""
import argparse, hashlib, json, os, pathlib, shutil, subprocess, tempfile, time, uuid

repo=pathlib.Path(__file__).resolve().parents[2]
base=repo/'scripts/ci/probes/fleet-policy-audit'
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=pathlib.Path,default=repo/'artifacts/fleet-policy-audit')
out=parser.parse_args().output.resolve();out.mkdir(parents=True,exist_ok=False)
pg=pathlib.Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
installer=(repo/'supabase/migrations/20260914112700_fleet_policy_and_audit_commit_together.sql').read_text()
env={k:v for k,v in os.environ.items() if not k.startswith('PG')};env['LC_ALL']='C'
root=pathlib.Path(tempfile.mkdtemp(prefix='fleet-policy-native-'));sock=root/'socket';sock.mkdir()
psql=[str(pg/'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-h',str(sock),'-p','55787','-U','postgres','-d','postgres']
started=False;children=[];checks=[]
def run(args,source=None,fail=False):
 r=subprocess.run(list(map(str,args)),input=source,text=True,capture_output=True,env=env,timeout=20)
 if fail:
  assert r.returncode,r.stdout;return r.stderr
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
def sql(source,fail=False):return run(psql,source,fail)
def check(name,ok):assert ok,name;checks.append(name)
actor=str(uuid.UUID(int=10))
def write(n,scope='global',scope_id='NULL'):
 return f"SELECT public.fn_ca_fleet_set_policy('{scope}',{scope_id},'{{\"max_horses\":{n}}}','{actor}','native policy audit qualification');"
def wait_for(predicate):
 deadline=time.monotonic()+3
 while time.monotonic()<deadline:
  if sql(predicate)=='1':return
  time.sleep(.02)
 raise AssertionError('native concurrent transaction did not reach expected state')
def concurrent(n,name):
 p=subprocess.Popen(psql,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env);children.append(p)
 p.stdin.write("SET application_name='"+name+"';BEGIN;"+write(n)+'\n');p.stdin.flush();return p
def finish(p):
 p.stdin.write('COMMIT;\n');p.stdin.close();p.stdin=None;o,e=p.communicate(timeout=5)
 assert not p.returncode,e;return json.loads(o.strip().splitlines()[-1])
def fixture():
 sql("TRUNCATE ca_horse_fleet_policy,admin_audit_log; INSERT INTO ca_horse_fleet_policy(scope,max_horses) VALUES('global',100);")
try:
 assert 'PostgreSQL) 17.' in run([pg/'postgres','--version'])
 run([pg/'initdb','-D',root/'data','-U','postgres','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8'])
 run([pg/'pg_ctl','-D',root/'data','-l',root/'log','-o',f"-k {sock} -p 55787 -c listen_addresses='' -c shared_buffers=16MB -c max_connections=8",'-w','start']);started=True
 sql((base/'schema.sql').read_text())
 for r in json.loads((base/'dependencies.json').read_text()):
  body=r['definition'];assert hashlib.md5(body.encode()).hexdigest()==r['md5'];sql(body)
 original=(base/'baseline.sql').read_text();assert hashlib.md5(original.encode()).hexdigest()=='93b73f047fc0aac6d7945ad317c626da';sql(original)
 sql(f"INSERT INTO profiles VALUES('{actor}','admin'); REVOKE ALL ON FUNCTION fn_ca_fleet_set_policy(text,uuid,jsonb,uuid,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION fn_ca_fleet_set_policy(text,uuid,jsonb,uuid,text) TO service_role;")
 fixture()
 sql("CREATE FUNCTION public.reject_policy_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'native audit storage refusal';END$$; CREATE TRIGGER native_audit_failure BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION reject_policy_audit();")
 rejected=json.loads(sql('SET ROLE service_role;'+write(80)))
 assert rejected['ok'] and sql('SELECT max_horses FROM ca_horse_fleet_policy')=='80' and sql('SELECT count(*) FROM admin_audit_log')=='0'
 baseline={'audit_failure_commits_policy':True,'returned_ok':rejected['ok'],'stored_cap':80,'audit_rows':0}
 sql('DROP TRIGGER native_audit_failure ON admin_audit_log;');fixture()
 a=concurrent(80,'fleet_a');wait_for("SELECT count(*) FROM pg_stat_activity WHERE application_name='fleet_a' AND state='idle in transaction'");b=concurrent(120,'fleet_b');wait_for("SELECT count(*) FROM pg_stat_activity WHERE application_name='fleet_b' AND wait_event_type='Lock'");first=finish(a);second=finish(b)
 assert second['before']['max_horses']==100 and second['material'] is False,second
 baseline['concurrent_before_is_stale']={'actual_predecessor':80,'reported_before':100,'requested_after':120,'material':second['material'],'expected_material':True}
 (out/'BASELINE.json').write_text(json.dumps(baseline,indent=2)+'\n')
 sql(installer);fixture()
 check('exact guarded migration installed',sql("SELECT md5(pg_get_functiondef('fn_ca_fleet_set_policy(text,uuid,jsonb,uuid,text)'::regprocedure))")=='264052c785ef4e479a23b8240a93b2e1')
 sql(installer)
 check('guarded migration replay preserves identity',sql("SELECT md5(pg_get_functiondef('fn_ca_fleet_set_policy(text,uuid,jsonb,uuid,text)'::regprocedure))")=='264052c785ef4e479a23b8240a93b2e1')
 sql('CREATE TRIGGER native_audit_failure BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION reject_policy_audit();')
 err=sql('SET ROLE service_role;'+write(80),True)
 check('actual audit insert refusal propagates','native audit storage refusal' in err)
 check('audit refusal rolls back policy',sql('SELECT max_horses FROM ca_horse_fleet_policy')=='100')
 check('audit refusal leaves no receipt',sql('SELECT count(*) FROM admin_audit_log')=='0')
 sql('DROP TRIGGER native_audit_failure ON admin_audit_log;')
 sql("CREATE FUNCTION public.skip_policy_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$; CREATE TRIGGER native_audit_skip BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION skip_policy_audit();")
 err=sql('SET ROLE service_role;'+write(80),True)
 check('silent skipped audit insert is refused','exact stored receipt' in err)
 check('silent audit skip rolls back policy',sql('SELECT max_horses FROM ca_horse_fleet_policy')=='100')
 sql('DROP TRIGGER native_audit_skip ON admin_audit_log;')
 sql("CREATE FUNCTION public.corrupt_policy_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.after_state='{}'::jsonb; RETURN NEW;END$$; CREATE TRIGGER native_audit_corrupt BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION corrupt_policy_audit();")
 err=sql('SET ROLE service_role;'+write(80),True)
 check('altered stored audit snapshot is refused','exact stored receipt' in err)
 check('altered audit snapshot rolls back both rows',sql('SELECT max_horses FROM ca_horse_fleet_policy')=='100' and sql('SELECT count(*) FROM admin_audit_log')=='0')
 sql('DROP TRIGGER native_audit_corrupt ON admin_audit_log;')
 good=json.loads(sql('SET ROLE service_role;'+write(80)))
 check('healthy service caller succeeds',good['ok'] and good['before']['max_horses']==100 and good['after']['max_horses']==80)
 check('exact before after audit stored',sql("SELECT count(*) FROM admin_audit_log WHERE before_state->>'max_horses'='100' AND after_state->>'max_horses'='80' AND target_id='global'")=='1')
 fixture();a=concurrent(80,'fleet_a');wait_for("SELECT count(*) FROM pg_stat_activity WHERE application_name='fleet_a' AND state='idle in transaction'");b=concurrent(120,'fleet_b');wait_for("SELECT count(*) FROM pg_stat_activity WHERE application_name='fleet_b' AND wait_event_type='Lock'");first=finish(a);second=finish(b)
 check('concurrent writers observe committed predecessor',second['before']['max_horses']==80)
 check('concurrent materiality uses committed predecessor',second['material'] is True)
 check('policy version follows actual serialized mutation',second['after']['updated_at']>first['after']['updated_at'])
 check('concurrent audit trail has exact connected snapshots',sql("SELECT count(*) FROM admin_audit_log WHERE before_state->>'max_horses'='80' AND after_state->>'max_horses'='120'")=='1')
 for role in ['anon','authenticated']:
  check(role+' direct policy execution refused','permission denied' in sql('SET ROLE '+role+';'+write(80),True))
 before=sql('SELECT max_horses FROM ca_horse_fleet_policy')
 sql('BEGIN;'+write(70)+'ROLLBACK;')
 check('outer rollback restores policy and audit',sql('SELECT max_horses FROM ca_horse_fleet_policy')==before and sql('SELECT count(*) FROM admin_audit_log')=='2')
 sql('TRUNCATE ca_horse_fleet_policy,admin_audit_log;')
 a=concurrent(80,'fleet_a');wait_for("SELECT count(*) FROM pg_stat_activity WHERE application_name='fleet_a' AND state='idle in transaction'");b=concurrent(120,'fleet_b');wait_for("SELECT count(*) FROM pg_stat_activity WHERE application_name='fleet_b' AND wait_event_type='Lock'");first=finish(a);second=finish(b)
 check('absent scope first writer records creation',first['created'] and first['before'] is None)
 check('absent scope concurrent writer sees first creation',second['created'] is False and second['before']['max_horses']==80)
 check('absent scope has one policy and two exact audits',sql('SELECT count(*) FROM ca_horse_fleet_policy')=='1' and sql('SELECT count(*) FROM admin_audit_log')=='2')
 fixture();a=concurrent(80,'fleet_a');wait_for("SELECT count(*) FROM pg_stat_activity WHERE application_name='fleet_a' AND state='idle in transaction'")
 independent=json.loads(sql('SET ROLE service_role;'+write(30,'club',"'"+str(uuid.UUID(int=20))+"'")))
 check('different scope proceeds while first is uncommitted',independent['ok'] and independent['scope']=='club')
 finish(a)
 sql("CREATE TRIGGER native_audit_failure BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION reject_policy_audit();")
 err=sql('SET ROLE service_role;'+write(40,'club',"'"+str(uuid.UUID(int=21))+"'"),True)
 check('audit failure refuses new scope creation','native audit storage refusal' in err)
 check('failed new scope leaves no policy',sql("SELECT count(*) FROM ca_horse_fleet_policy WHERE scope_id='"+str(uuid.UUID(int=21))+"'")=='0')
 sql('DROP TRIGGER native_audit_failure ON admin_audit_log;')
 before_digest=sql("SELECT md5(pg_get_functiondef('fn_ca_fleet_set_policy(text,uuid,jsonb,uuid,text)'::regprocedure))")
 for d in json.loads((base/'dependencies.json').read_text()):
  changed=d['definition'].replace('AS $function$','AS $function$\n-- deliberate native dependency drift')
  sql(changed)
  check('installer refuses '+d['signature']+' drift','Fleet policy dependency drift' in sql(installer,True))
  check('refused helper drift preserves policy '+d['signature'],sql("SELECT md5(pg_get_functiondef('fn_ca_fleet_set_policy(text,uuid,jsonb,uuid,text)'::regprocedure))")==before_digest)
  sql(d['definition'])
 start=installer.index('CREATE OR REPLACE FUNCTION public.fn_ca_fleet_set_policy')
 opening=installer.index('$function$',start);closing=installer.index('$function$',opening+len('$function$'))+len('$function$\n')
 current=installer[start:closing]
 sql(current.replace('AS $function$','AS $function$\n-- deliberate native policy drift'))
 check('installer refuses unknown policy body','Fleet policy definition drift' in sql(installer,True))
 sql(current)
 digest=sql("SELECT md5(pg_get_functiondef('fn_ca_fleet_set_policy(text,uuid,jsonb,uuid,text)'::regprocedure))")
 result={'observed_at':sql('SELECT clock_timestamp()'),'postgres_version':sql('SHOW server_version'),'baseline':baseline,'candidate_md5':digest,'checks':checks,'checks_passed':len(checks),'production_connections':0,'scope':'Policy/audit atomicity and serialized internal before-state only. Browser approval preview and provider financial acceptance remain separate.'}
 (out/'RESULTS.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:
 for p in children:
  if p.poll() is None:p.kill();p.wait()
 if started:subprocess.run([str(pg/'pg_ctl'),'-D',str(root/'data'),'-m','immediate','-w','stop'],capture_output=True,env=env)
 shutil.rmtree(root)
