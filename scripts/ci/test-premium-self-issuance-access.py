#!/usr/bin/env python3
"""Recreate actual migration with absent defaults; never uses a remote database."""
import json, os, shutil, subprocess, tempfile, sys
from pathlib import Path
root = Path(__file__).resolve().parents[2]
pg = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
if not (pg / 'initdb').is_file():
    raise SystemExit('PG_BIN must name a PostgreSQL installation with initdb and pg_ctl')
scratch = root.parent if str(root).startswith('/Volumes/SmarterWork/agent-work/') else None
if sys.platform == 'darwin' and scratch is None:
    raise SystemExit('Run this qualification from an owned external-SSD worktree')
cluster = Path(tempfile.mkdtemp(prefix='pa-', dir=scratch))
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
cmd = [pg/'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', cluster/'socket', '-p', '55443', '-U', 'postgres', '-d', 'postgres']
def run(args, value=None):
    return subprocess.run(list(map(str, args)), input=value, text=True, capture_output=True, timeout=60, env=env)
def sql(value):
    result = run(cmd, value)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()
def denied(value, expected='permission denied'):
    result = run(cmd, value)
    assert result.returncode != 0 and expected in result.stderr, result.stderr
try:
    result=run([pg/'initdb','-D',cluster/'data','-U','postgres','--auth-local=trust','--no-locale','--encoding=UTF8']);assert result.returncode==0,result.stderr
    (cluster/'socket').mkdir()
    with (cluster/'data/postgresql.conf').open('a') as f:f.write(f"\nlisten_addresses=''\nunix_socket_directories='{cluster/'socket'}'\nport=55443\nshared_buffers='16MB'\n")
    result=run([pg/'pg_ctl','-D',cluster/'data','-l',cluster/'server.log','-w','start']);assert result.returncode==0,result.stderr
    sql("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;")
    sql((root/'supabase/migrations/archive/20260202_premium_feature_access.sql').read_text())
    sql((root/'tests/fixtures/premium-private-debit-20261020.sql').read_text())
    uid='11111111-1111-4111-8111-111111111111';other='22222222-2222-4222-8222-222222222222'
    sql(f"INSERT INTO auth.users VALUES('{uid}'),('{other}'); GRANT SELECT,INSERT,UPDATE,DELETE ON premium_feature_access TO anon,authenticated; GRANT ALL ON premium_feature_access TO service_role;")
    session=f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; "
    insert=f"INSERT INTO premium_feature_access(user_id,feature_key,expires_at,diamonds_spent) VALUES('{uid}','daily_unlock_all','2099-01-01',0);"
    sql(session+insert);assert sql('SELECT count(*) FROM premium_feature_access')=='1'
    debit=f"SELECT public.deduct_diamonds('{uid}',150,p_source=>'feature_unlock');"
    denied(session+debit,'permission denied for function deduct_diamonds')
    migration=(root/'supabase/migrations/20261020173825_premium_access_refuses_browser_self_issuance.sql').read_text()
    fn_sql="SELECT pg_get_functiondef('public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)'::regprocedure);"
    before=sql(fn_sql);sql(migration)
    denied(session+insert);denied('SET ROLE anon; '+insert)
    assert sql(session+'SELECT count(*) FROM premium_feature_access')=='1'
    assert sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{other}'; SELECT count(*) FROM premium_feature_access")=='0'
    denied(session+debit,'permission denied for function deduct_diamonds')
    sql('SET ROLE service_role; '+insert);sql(insert)
    assert sql('SELECT count(*) FROM premium_feature_access')=='3';assert before==sql(fn_sql)
    sql('GRANT INSERT(user_id,feature_key,expires_at) ON premium_feature_access TO PUBLIC,authenticated;');sql(migration);denied(session+insert)
    sql('GRANT EXECUTE ON FUNCTION public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer) TO authenticated; GRANT INSERT ON premium_feature_access TO authenticated;')
    denied(migration,'Legacy debit privacy changed');assert sql("SELECT has_table_privilege('authenticated','premium_feature_access','INSERT')")=='t'
    sql('REVOKE EXECUTE ON FUNCTION public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer) FROM authenticated; ALTER TABLE premium_feature_access DISABLE ROW LEVEL SECURITY;');denied(migration,'Premium access relation drift')
    print(json.dumps({'passed':True,'cases':['original-table-policy','free-far-future-insert-before','private-debit-denied-before-after','browser-insert-denied-after','own-select-and-other-rls','service-and-owner-insert','other-acls-metadata-preserved','column-public-insert-closed','debit-drift-atomic-refusal','rls-drift-refusal'],'limit':'Actual private debit installed but financial body not executed; no money path changed'}))
finally:
    if (cluster/'data/postmaster.pid').exists():
        stopped=run([pg/'pg_ctl','-D',cluster/'data','-m','fast','-w','stop']);assert stopped.returncode==0,stopped.stderr
    shutil.rmtree(cluster)
