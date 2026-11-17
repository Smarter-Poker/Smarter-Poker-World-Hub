#!/usr/bin/env python3
"""Qualify service-only function catalog proof in disposable PostgreSQL 17."""
import os,json,tempfile,subprocess,socket,hashlib,time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
R=Path(__file__).resolve().parents[2]
PG=Path(os.environ.get('PHASE6_POSTGRES_BIN','/opt/homebrew/opt/postgresql@17/bin' if os.uname().sysname=='Darwin' else '/usr/lib/postgresql/17/bin'))
parent=Path(os.environ.get('NOTICE_PG_ROOT',str(R/'work')));parent.mkdir(parents=True,exist_ok=True)
D=Path(tempfile.mkdtemp(prefix='notice-pg-',dir=parent));env={**os.environ,'TMPDIR':str(D),'LC_ALL':'C'}
sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
started=False;cases=[]
def cmd(name,*args):return subprocess.run([str(PG/name),*args],env=env,text=True,capture_output=True,check=True)
def sql(s,error=None):
 p=subprocess.run([str(PG/'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',str(port),'-U','postgres','-d','postgres'],input=s,env=env,text=True,capture_output=True)
 if error:
  assert p.returncode and error in p.stderr,(error,p.stdout,p.stderr);return
 assert p.returncode==0,p.stderr
 return p.stdout.strip()
def lit(x):return "'"+str(x).replace("'","''")+"'"
def uid(n):return 'e6470000-0000-4000-8000-'+str(n).zfill(12)
try:
 cmd('initdb','-D',str(D/'data'),'-A','trust','-U','postgres','--no-locale','-E','UTF8')
 cmd('pg_ctl','-D',str(D/'data'),'-l',str(D/'server.log'),'-o',f"-p {port} -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c wal_level=logical",'start');started=True
 sql("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;\nCREATE OR REPLACE FUNCTION public.fn_schema_manifest()\n RETURNS jsonb\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\n  SELECT jsonb_build_object(\n    'tables', (SELECT coalesce(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb)\n               FROM information_schema.tables\n               WHERE table_schema='public' AND table_type IN ('BASE TABLE','VIEW')),\n    'functions', (SELECT coalesce(jsonb_agg(DISTINCT proname ORDER BY proname), '[]'::jsonb)\n                  FROM pg_proc WHERE pronamespace='public'::regnamespace)\n  );\n$function$;\nREVOKE ALL ON FUNCTION fn_schema_manifest() FROM PUBLIC,anon,authenticated;\nGRANT EXECUTE ON FUNCTION fn_schema_manifest() TO service_role;\nCREATE FUNCTION private_fixture(p_id uuid,p_amount numeric,OUT answer text) LANGUAGE sql AS $$ SELECT 'no'::text $$;\nREVOKE ALL ON FUNCTION private_fixture(uuid,numeric) FROM PUBLIC,anon,authenticated,service_role;\nCREATE FUNCTION overloaded(p_id uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'uuid'::text $$;\nCREATE FUNCTION overloaded(p_id text) RETURNS text LANGUAGE sql AS $$ SELECT 'text'::text $$;\n")
 old=json.loads(sql('SELECT fn_schema_manifest();'))
 sql((R/'supabase/migrations/20261117211500_schema_manifest_function_contracts.sql').read_text())
 new=json.loads(sql('SET ROLE service_role; SELECT fn_schema_manifest();'))
 assert old['tables']==new['tables'] and old['functions']==new['functions']
 f=next(x for x in new['function_contracts'] if x['name']=='private_fixture')
 assert f['input_argument_names']==['p_id','p_amount'] and f['input_argument_types']==['uuid','numeric'],f
 assert f['execute']=={'anon':False,'authenticated':False,'service_role':False},f
 assert len(f['body_md5'])==32 and len(f['definition_md5'])==32
 assert len([x for x in new['function_contracts'] if x['name']=='overloaded'])==2
 for role in ['anon','authenticated']:sql('SET ROLE '+role+'; SELECT fn_schema_manifest();',error='permission denied')
 sql('SET ROLE service_role; SELECT private_fixture(NULL,NULL);',error='permission denied')
 sql((R/'supabase/migrations/20261117211500_schema_manifest_function_contracts.sql').read_text(),error='Schema Manifest Source Changed')
 print(json.dumps({'passed':True,'cases':['existing keys preserved','service-only manifest','private helper ACL unchanged','OUT excluded and overload signatures distinct','source precondition refuses replay'],'sha256':hashlib.sha256((R/'supabase/migrations/20261117211500_schema_manifest_function_contracts.sql').read_bytes()).hexdigest()}))
finally:
 if started:cmd('pg_ctl','-D',str(D/'data'),'-m','immediate','stop')
 import shutil;shutil.rmtree(D)
