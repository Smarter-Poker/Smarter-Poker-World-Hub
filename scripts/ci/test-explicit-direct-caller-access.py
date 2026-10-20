#!/usr/bin/env python3
"""Native absent-default direct-caller qualification; never uses a remote database."""
import json, os, shutil, subprocess, tempfile, sys
from pathlib import Path
root = Path(__file__).resolve().parents[2]
pg = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
if not (pg / 'initdb').is_file():
    raise SystemExit('PG_BIN must name a PostgreSQL installation with initdb and pg_ctl')
scratch = root.parent if str(root).startswith('/Volumes/SmarterWork/agent-work/') else None
if sys.platform == 'darwin' and scratch is None:
    raise SystemExit('Run this qualification from an owned external-SSD worktree')
cluster = Path(tempfile.mkdtemp(prefix='dg-', dir=scratch))
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
cmd = [pg/'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', cluster/'socket', '-p', '55441', '-U', 'postgres', '-d', 'postgres']
def run(args, value=None):
    return subprocess.run(list(map(str, args)), input=value, text=True, capture_output=True, timeout=60, env=env)
def sql(value):
    result = run(cmd, value)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()
def denied(value, expected='permission denied'):
    result = run(cmd, value)
    assert result.returncode != 0 and expected in result.stderr, result.stderr

# Byte-exact original CREATE statements and shell own-user policy from Arena
# 20260830053713 and Hub 20260906095751; not an all-history reset.
# Content RLS models the maintained automatic RLS guard and production state.
ORIGINAL_DECLARATIONS = "CREATE TABLE IF NOT EXISTS public.client_shell_telemetry (\n  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  user_id        uuid REFERENCES auth.users (id) ON DELETE SET NULL,\n  event          text NOT NULL CHECK (event IN ('staleness_checked', 'reloaded')),\n  -- staleness_checked only:\n  stale          boolean,\n  source         text CHECK (source IS NULL OR source IN ('shell-updated', 'controllerchange', 'resume-probe')),\n  running_entry  text,\n  deployed_entry text,\n  -- reloaded only: ms from page start to the reload firing.\n  page_age_ms    integer CHECK (page_age_ms IS NULL OR page_age_ms >= 0),\n  created_at     timestamptz NOT NULL DEFAULT now()\n);\nALTER TABLE public.client_shell_telemetry ENABLE ROW LEVEL SECURITY;\nCREATE POLICY client_shell_telemetry_insert_own\n  ON public.client_shell_telemetry\n  FOR INSERT TO authenticated\n  WITH CHECK (user_id = auth.uid());\nCREATE TABLE IF NOT EXISTS public.content_sources (\n  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  domain               text NOT NULL CHECK (domain IN ('poker','sports')),\n  kind                 text NOT NULL DEFAULT 'youtube_channel',\n  name                 text NOT NULL,\n  handle               text,\n  -- Resolved from the handle once and cached. The RSS feed is keyed on this.\n  channel_id           text,\n  category             text,\n  sport                text,\n  is_active            boolean NOT NULL DEFAULT true,\n  last_scraped_at      timestamptz,\n  last_ok_at           timestamptz,\n  consecutive_failures integer NOT NULL DEFAULT 0,\n  clips_found          integer NOT NULL DEFAULT 0,\n  created_at           timestamptz NOT NULL DEFAULT now(),\n  updated_at           timestamptz NOT NULL DEFAULT now()\n);\nALTER TABLE public.content_sources ENABLE ROW LEVEL SECURITY;"
# Exact Arena20261006024500 content ACL loop, independently qualified below.
CONTENT_ACL_LOOP = "DO $revoke$\nDECLARE t text;\nBEGIN\n  FOREACH t IN ARRAY ARRAY['bot_profiles', 'personas', 'content_settings', 'pipeline_runs', 'content_schedule',\n                           'content_stats', 'clip_library', 'content_sources', 'content_asset_use', 'pipeline_stats']\n  LOOP\n    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);\n    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);\n  END LOOP;\nEND\n$revoke$;"
try:
    result = run([pg/'initdb', '-D', cluster/'data', '-U', 'postgres', '--auth-local=trust', '--no-locale', '--encoding=UTF8'])
    assert result.returncode == 0, result.stderr
    (cluster/'socket').mkdir()
    with (cluster/'data/postgresql.conf').open('a') as config:
        config.write(f"\nlisten_addresses=''\nunix_socket_directories='{cluster/'socket'}'\nport=55441\nshared_buffers='16MB'\n")
    result = run([pg/'pg_ctl', '-D', cluster/'data', '-l', cluster/'server.log', '-w', 'start'])
    assert result.returncode == 0, result.stderr
    sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    INSERT INTO auth.users VALUES('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');""")
    sql(ORIGINAL_DECLARATIONS)
    shell="SET ROLE authenticated; SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111'; INSERT INTO client_shell_telemetry(user_id,event) VALUES('11111111-1111-1111-1111-111111111111','reloaded');"
    content="SET ROLE service_role; INSERT INTO content_sources(domain,name) VALUES('poker','isolated source') RETURNING name;"
    denied(shell,'permission denied for table client_shell_telemetry')
    denied(content,'permission denied for table content_sources')
    # A combined Arena history already covers content_sources explicitly.
    # Prove the actual source loop, rolling back so Hub-only fixture stays absent.
    other_tables=['bot_profiles','personas','content_settings','pipeline_runs','content_schedule','content_stats','clip_library','content_asset_use','pipeline_stats']
    sql('BEGIN; '+''.join(f'CREATE TABLE public.{t}(id integer);' for t in other_tables)+CONTENT_ACL_LOOP+"DO $$ BEGIN IF NOT has_table_privilege('service_role','content_sources','SELECT') OR NOT has_table_privilege('service_role','content_sources','INSERT') OR NOT has_table_privilege('service_role','content_sources','UPDATE') THEN RAISE EXCEPTION 'source loop incomplete'; END IF; END $$; ROLLBACK;")
    migration=(root/'supabase/migrations/20261020165034_explicit_direct_caller_table_access.sql').read_text()
    sql(migration)
    sql(shell)
    assert sql(content) == 'isolated source'
    assert sql("SET ROLE service_role; UPDATE content_sources SET name='updated' WHERE name='isolated source' RETURNING name;") == 'updated'
    assert sql("SET ROLE service_role; SELECT count(*) FROM content_sources;") == '1'
    denied("SET ROLE authenticated; SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111'; INSERT INTO client_shell_telemetry(user_id,event) VALUES('22222222-2222-2222-2222-222222222222','reloaded');",'row-level security')
    for role in ['anon','authenticated']:
        for statement in ['SELECT * FROM content_sources;',"INSERT INTO content_sources(domain,name) VALUES('poker','denied');","UPDATE content_sources SET name='denied';",'DELETE FROM content_sources;']:
            denied(f'SET ROLE {role}; '+statement)
        for statement in ['SELECT * FROM client_shell_telemetry;',"UPDATE client_shell_telemetry SET event='reloaded';",'DELETE FROM client_shell_telemetry;']:
            denied(f'SET ROLE {role}; '+statement)
    denied("SET ROLE anon; INSERT INTO client_shell_telemetry(event) VALUES('reloaded');")
    denied('SET ROLE service_role; DELETE FROM content_sources;')
    assert sql("SELECT has_sequence_privilege('authenticated','client_shell_telemetry_id_seq','USAGE');") == 'f'
    sql('ALTER POLICY client_shell_telemetry_insert_own ON client_shell_telemetry WITH CHECK(user_id=(SELECT auth.uid()));')
    sql(migration)
    assert sql('SELECT count(*) FROM client_shell_telemetry;') == '1'
    assert sql("SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('client_shell_telemetry'::regclass,'content_sources'::regclass);") == 't'
    sql('GRANT ALL ON client_shell_telemetry TO anon,authenticated,service_role; GRANT ALL ON content_sources TO service_role;')
    before=sql("SELECT relname,relacl FROM pg_class WHERE oid IN ('client_shell_telemetry'::regclass,'content_sources'::regclass) ORDER BY 1;")
    sql(migration)
    assert before == sql("SELECT relname,relacl FROM pg_class WHERE oid IN ('client_shell_telemetry'::regclass,'content_sources'::regclass) ORDER BY 1;")
    sql('REVOKE INSERT ON client_shell_telemetry FROM authenticated; CREATE POLICY unexpected ON content_sources FOR SELECT TO authenticated USING(true);')
    denied(migration,'Content sources must retain RLS with no browser policy')
    assert sql("SELECT has_table_privilege('authenticated','client_shell_telemetry','INSERT');") == 'f'
    sql('DROP POLICY unexpected ON content_sources; ALTER POLICY client_shell_telemetry_insert_own ON client_shell_telemetry WITH CHECK(true);')
    denied(migration,'Shell telemetry must retain only its authenticated own-user INSERT policy')
    print(json.dumps({'passed':True,'cases':['original-declarations-with-no-defaults','combined-history-content-loop-already-covers','authenticated-insert-fails-before','service-insert-fails-before','authenticated-own-insert-after','other-user-insert-denied','identity-no-sequence-grant','service-select-insert-update-after','browser-content-denials','browser-telemetry-no-read-update-delete','fresh-service-delete-denied','initplan-policy-compatible','rls-unchanged','production-acls-unchanged','unexpected-content-policy-refuses-atomically','unexpected-shell-policy-refuses']}))
finally:
    if (cluster/'data/postmaster.pid').exists():
        result=run([pg/'pg_ctl','-D',cluster/'data','-m','fast','-w','stop'])
        assert result.returncode == 0,result.stderr
    shutil.rmtree(cluster)
