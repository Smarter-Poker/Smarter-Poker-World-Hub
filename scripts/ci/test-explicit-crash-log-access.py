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
cluster = Path(tempfile.mkdtemp(prefix='grant-check-', dir=scratch))
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
cmd = [pg/'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', cluster/'socket', '-p', '55439', '-U', 'postgres', '-d', 'postgres']
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
    result = run([pg/'initdb', '-D', cluster/'data', '-U', 'postgres', '--auth-local=trust', '--no-locale', '--encoding=UTF8'])
    assert result.returncode == 0, result.stderr
    (cluster/'socket').mkdir()
    with (cluster/'data/postgresql.conf').open('a') as config:
        config.write(f"\nlisten_addresses=''\nunix_socket_directories='{cluster/'socket'}'\nport=55439\nshared_buffers='16MB'\n")
    result = run([pg/'pg_ctl', '-D', cluster/'data', '-l', cluster/'server.log', '-w', 'start'])
    assert result.returncode == 0, result.stderr
    sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;')
    sql((root/'supabase/migrations/20260819_client_crash_log.sql').read_text())
    insert = "SET ROLE service_role; INSERT INTO client_crash_log(boundary,message) VALUES('hub','isolated permission test');"
    denied(insert, 'permission denied for table client_crash_log')
    denied('BEGIN; GRANT INSERT ON client_crash_log TO service_role; ' + insert, 'permission denied for sequence client_crash_log_id_seq')
    assert sql('SELECT count(*) FROM client_crash_log;') == '0'
    migration = (root/'supabase/migrations/20261020162929_explicit_service_crash_log_access.sql').read_text()
    sql(migration)
    sql(insert)
    for role in ['anon', 'authenticated']:
        denied(f'SET ROLE {role}; SELECT * FROM client_crash_log;')
        denied(f"SET ROLE {role}; INSERT INTO client_crash_log(boundary) VALUES('hub');")
        denied(f"SET ROLE {role}; SELECT nextval('client_crash_log_id_seq');")
    denied('SET ROLE service_role; SELECT * FROM client_crash_log;')
    denied("SET ROLE service_role; UPDATE client_crash_log SET message='changed';")
    denied('SET ROLE service_role; DELETE FROM client_crash_log;')
    assert sql('SELECT count(*) FROM client_crash_log;') == '1'
    assert sql("SELECT relrowsecurity AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=c.oid) FROM pg_class c WHERE oid='client_crash_log'::regclass;") == 't'
    # Existing production rights are preserved: qualification of transition,
    # not permission to replay a recorded production migration.
    sql('GRANT ALL ON client_crash_log TO service_role; GRANT ALL ON SEQUENCE client_crash_log_id_seq TO service_role;')
    before = sql("SELECT relname,relacl FROM pg_class WHERE relname IN ('client_crash_log','client_crash_log_id_seq') ORDER BY 1;")
    sql(migration)
    assert before == sql("SELECT relname,relacl FROM pg_class WHERE relname IN ('client_crash_log','client_crash_log_id_seq') ORDER BY 1;")
    sql('CREATE POLICY unexpected ON client_crash_log FOR SELECT TO authenticated USING(true);')
    denied(migration, 'Client crash log must remain service-only')
    print(json.dumps({'passed': True, 'cases': ['actual-original-migration-no-defaults', 'table-denial-before', 'sequence-denial-before', 'service-insert-after', 'browser-table-and-sequence-denied', 'fresh-service-no-read-update-delete', 'rls-and-no-policy-preserved', 'existing-production-acl-unchanged', 'unexpected-policy-refused']}))
finally:
    if (cluster/'data/postmaster.pid').exists():
        stopped = run([pg/'pg_ctl', '-D', cluster/'data', '-m', 'fast', '-w', 'stop'])
        assert stopped.returncode == 0, stopped.stderr
    shutil.rmtree(cluster)
