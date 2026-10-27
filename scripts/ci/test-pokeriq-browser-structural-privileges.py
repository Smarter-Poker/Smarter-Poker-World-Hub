#!/usr/bin/env python3
"""Apply exact structural migration to inert private PG17 relations with captured ACLs.
Never connects remotely; no actual production schema/business policies or rows copied.
"""
import json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
pg=Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
scratch=root.parent if str(root).startswith('/Volumes/SmarterWork/agent-work/') else None
if sys.platform=='darwin' and scratch is None: raise SystemExit('Use an owned external-SSD worktree')
cluster=Path(tempfile.mkdtemp(prefix='iq-acl-',dir=scratch))
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
cmd=[pg/'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-h',cluster/'socket','-p','55441','-U','postgres','-d','postgres']
def run(args,value=None):return subprocess.run(list(map(str,args)),input=value,text=True,capture_output=True,timeout=60,env=env)
def sql(value):
 r=run(cmd,value);assert r.returncode==0,r.stderr;return r.stdout.strip()
def denied(value,expected='permission denied'):
 r=run(cmd,value);assert r.returncode!=0 and expected in r.stderr,r.stderr
q=lambda v:'"'+v.replace('"','""')+'"'
privileges={'a':'INSERT','r':'SELECT','w':'UPDATE','d':'DELETE','D':'TRUNCATE','x':'REFERENCES','t':'TRIGGER','m':'MAINTAIN','U':'USAGE'}
fixture=json.loads((root/'__tests__/fixtures/pokeriq-structural-acls-20261020.json').read_text())
relations=fixture['relations'];columns=fixture['columns']
assert sum(c['kind'] in ['r','p'] for c in relations)==1642
assert len(columns)==392
migration=(root/'supabase/migrations/20261020165600_browser_roles_have_no_table_maintenance_rights.sql').read_text()
def grants(acl,target,column=None):
 statements=[]
 for role,codes in re.findall(r'(?:^|,)(anon|authenticated|service_role|)=([a-zA-Z*]+)/[^,}]+',(acl or '').strip('{}')):
  for i,code in enumerate(codes):
   if code=='*':continue
   right=privileges[code]+(' ('+q(column)+')' if column else '')
   statements.append(f'GRANT {right} ON {target} TO {q(role) if role else "PUBLIC"}'+(' WITH GRANT OPTION' if i+1<len(codes) and codes[i+1]=='*' else '')+';')
 return statements
def snapshot():
 return sql("""SELECT jsonb_build_array(
 (SELECT jsonb_agg(jsonb_build_array(c.relname,r.role,p.privilege,has_table_privilege(r.role,c.oid,p.privilege)) ORDER BY c.relname,r.role,p.privilege) FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN'))p(privilege) WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f') AND (r.role='service_role' OR p.privilege IN ('SELECT','INSERT','UPDATE','DELETE'))),
 (SELECT jsonb_agg(jsonb_build_array(c.relname,a.attname,a.attacl::text) ORDER BY c.relname,a.attnum) FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.relnamespace='public'::regnamespace AND a.attacl IS NOT NULL),
 (SELECT jsonb_agg(jsonb_build_array(c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='public'::regnamespace),
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p));""")
try:
 r=run([pg/'initdb','-D',cluster/'data','-U','postgres','--auth-local=trust','--no-locale','--encoding=UTF8']);assert r.returncode==0,r.stderr
 (cluster/'socket').mkdir()
 with (cluster/'data/postgresql.conf').open('a') as f:f.write(f"\nlisten_addresses=''\nunix_socket_directories='{cluster/'socket'}'\nport=55441\nshared_buffers='16MB'\n")
 r=run([pg/'pg_ctl','-D',cluster/'data','-l',cluster/'server.log','-w','start']);assert r.returncode==0,r.stderr
 sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role; CREATE SCHEMA native_fixture; GRANT USAGE,CREATE ON SCHEMA native_fixture TO anon,authenticated;')
 setup=[]
 for c in relations:
  name='public.'+q(c['table']);names=sorted(set(['id','native_private']+[a['column'] for a in columns if a['table']==c['table']]))
  if c['kind']=='S':setup.append(f'CREATE SEQUENCE {name};')
  elif c['kind'] in ['r','p']:
   fields=','.join(q(n)+(' integer PRIMARY KEY' if n=='id' else ' text') for n in names)
   setup.append(f'CREATE TABLE {name}({fields});')
   if c['rls']:setup.append(f'ALTER TABLE {name} ENABLE ROW LEVEL SECURITY; CREATE POLICY native_deny_rows ON {name} TO anon,authenticated USING(false) WITH CHECK(false);')
  else:
   kind='MATERIALIZED VIEW' if c['kind']=='m' else 'VIEW'
   setup.append(f'CREATE {kind} {name} AS SELECT '+','.join(('1' if n=='id' else 'NULL::text')+' AS '+q(n) for n in names)+';')
  setup.extend(grants(c['acl'],('SEQUENCE ' if c['kind']=='S' else 'TABLE ')+name))
 for c in columns:setup.extend(grants(c['acl'],'TABLE public.'+q(c['table']),c['column']))
 sql('\n'.join(setup))
 sql("CREATE FUNCTION public.native_trigger_fn() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;")
 # RLS does not prohibit attaching trigger/FK machinery when its SQL privilege exists.
 sql('BEGIN; SET ROLE anon; CREATE TRIGGER native_unauthorized BEFORE INSERT ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION public.native_trigger_fn(); ROLLBACK;')
 sql('BEGIN; SET ROLE anon; CREATE TABLE native_fixture.native_fk(id integer REFERENCES public.admin_audit_log(id)); ROLLBACK;')
 assert sql("SELECT count(*) FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated'))r(role) WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f') AND has_table_privilege(r.role,c.oid,'TRUNCATE');")=='0'
 sql('SET ROLE authenticated; SELECT id FROM public.profiles;')
 denied('SET ROLE authenticated; SELECT native_private FROM public.profiles;')
 # Verify empty-default provisioning first, then reproduce observed old defaults.
 sql('CREATE TABLE public.native_no_default(id int); ALTER TABLE public.native_no_default ENABLE ROW LEVEL SECURITY;')
 assert sql("SELECT NOT has_table_privilege('anon','native_no_default','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN');")=='t'
 sql('CREATE ROLE native_other_owner; ALTER DEFAULT PRIVILEGES FOR ROLE native_other_owner IN SCHEMA public GRANT ALL ON TABLES TO anon; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA native_fixture GRANT ALL ON TABLES TO authenticated; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,MAINTAIN ON TABLES TO anon,authenticated; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres,service_role; CREATE TABLE public.native_old_default(id int); ALTER TABLE public.native_old_default ENABLE ROW LEVEL SECURITY;')
 default_other_before=sql("SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d WHERE NOT (defaclrole='postgres'::regrole::oid AND defaclnamespace='public'::regnamespace);")
 default_dml_before=sql("SELECT jsonb_agg(jsonb_build_array(r.role,p.privilege,has_table_privilege(r.role,'native_old_default',p.privilege)) ORDER BY r.role,p.privilege) FROM (VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'))p(privilege);")
 assert sql("SELECT has_table_privilege('anon','native_old_default','REFERENCES,TRIGGER,MAINTAIN');")=='t'
 before=snapshot();sql(migration);assert snapshot()==before,'DML/column ACL/service/owner/RLS/policy changed'
 for role in ['anon','authenticated']:
  denied(f'SET ROLE {role}; CREATE TRIGGER native_unauthorized BEFORE INSERT ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION public.native_trigger_fn();')
  denied(f'SET ROLE {role}; CREATE TABLE native_fixture.native_fk(id integer REFERENCES public.admin_audit_log(id));')
  denied(f'SET ROLE {role}; TRUNCATE public.admin_audit_log;')
 assert sql("SELECT count(*) FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated'))r(role) WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f') AND (has_table_privilege(r.role,c.oid,'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,c.oid,'REFERENCES'));")=='0'
 sql('SET ROLE authenticated; SELECT id FROM public.profiles;')
 denied('SET ROLE authenticated; SELECT native_private FROM public.profiles;')
 # Future postgres-owned tables retain original DML, but no SQL structure rights.
 sql('CREATE TABLE public.native_new_default(id int); ALTER TABLE public.native_new_default ENABLE ROW LEVEL SECURITY;')
 assert default_dml_before==sql("SELECT jsonb_agg(jsonb_build_array(r.role,p.privilege,has_table_privilege(r.role,'native_new_default',p.privilege)) ORDER BY r.role,p.privilege) FROM (VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'))p(privilege);")
 assert sql("SELECT count(*) FROM (VALUES('anon'),('authenticated'))r(role) WHERE has_table_privilege(r.role,'native_new_default','TRUNCATE,REFERENCES,TRIGGER,MAINTAIN');")=='0'
 assert sql("SELECT has_table_privilege('service_role','native_new_default','TRUNCATE') AND has_table_privilege('service_role','native_new_default','REFERENCES') AND has_table_privilege('service_role','native_new_default','TRIGGER') AND has_table_privilege('service_role','native_new_default','MAINTAIN');")=='t'
 assert default_other_before==sql("SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d WHERE NOT (defaclrole='postgres'::regrole::oid AND defaclnamespace='public'::regnamespace);")
 # Unexpected column REFERENCES aborts atomically; no partial revocation commits.
 sql('GRANT TRIGGER ON public.admin_audit_log TO anon; GRANT REFERENCES(id) ON public.admin_audit_log TO anon;')
 denied(migration,'ACL/column privacy/service/owner/RLS/policy boundary changed')
 assert sql("SELECT has_table_privilege('anon','admin_audit_log','TRIGGER');")=='t'
 sql('REVOKE REFERENCES(id) ON public.admin_audit_log FROM anon;')
 # Inherited structural drift also aborts rather than silently reporting success.
 sql('CREATE ROLE native_maintainer; GRANT TRIGGER ON public.admin_audit_log TO native_maintainer; GRANT native_maintainer TO anon;')
 denied(migration,'Browser inherited/column structural privilege remains')
 assert sql("SELECT has_table_privilege('anon','admin_audit_log','TRIGGER');")=='t'
 # Do not take structural rights away from a service relying on PUBLIC:
 # require an intentional service ACL repair instead of altering its behavior.
 sql('REVOKE native_maintainer FROM anon; CREATE TABLE public.native_service_dependency(id int); ALTER TABLE public.native_service_dependency ENABLE ROW LEVEL SECURITY; REVOKE TRIGGER ON public.native_service_dependency FROM service_role; GRANT TRIGGER ON public.native_service_dependency TO PUBLIC;')
 assert sql("SELECT NOT has_table_privilege('anon','native_service_dependency','TRUNCATE,REFERENCES,MAINTAIN');")=='t'
 denied(migration,'ACL/column privacy/service/owner/RLS/policy boundary changed')
 assert sql("SELECT has_table_privilege('service_role','native_service_dependency','TRIGGER');")=='t'
 print(json.dumps({'passed':True,'relations':len(relations),'base_tables':1642,'column_acls':392,'checks':['trigger-and-references-before','truncate-already-denied-before','browser-structural-denial-after','all-dml-column-privacy-service-acls-owner-rls-policies-preserved','column-and-inherited-drift-refused-atomically','service-public-dependency-refused-atomically','future-relation-no-default-dml-grants','old-default-future-structural-denial-dml-service-unchanged','other-owner-and-schema-defaults-unchanged'],'limitation':'Inert ACL fixture; not actual production business schema/policies or live behavior certification'}))
finally:
 if (cluster/'data/postmaster.pid').exists():
  r=run([pg/'pg_ctl','-D',cluster/'data','-m','fast','-w','stop']);assert r.returncode==0,r.stderr
 shutil.rmtree(cluster)
