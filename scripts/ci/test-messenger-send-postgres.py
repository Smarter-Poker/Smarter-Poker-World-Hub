#!/usr/bin/env python3
"""Qualify Messenger atomic send, rollback, permissions and concurrency in PostgreSQL 17."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/messenger-send-postgres')
out = parser.parse_args().output.resolve()
out.mkdir(parents=True, exist_ok=False)
pg = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
cluster = Path(tempfile.mkdtemp(prefix='messenger-send-'))
socket = cluster / 'socket'
socket.mkdir(mode=0o700)
results = {'passed': False, 'cases': []}
cmd = [str(pg / 'psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(socket), '-p', '55485', '-U', 'postgres', '-d', 'postgres']

def command(args, sql=None):
    return subprocess.run([str(a) for a in args], input=sql, text=True, capture_output=True, env=env, timeout=45)

def run(name, sql, expected=None, failure=None):
    r = command(cmd, sql)
    (out / (name + '.log')).write_text(r.stdout + r.stderr)
    ok = (r.returncode != 0 and failure in r.stderr) if failure else (r.returncode == 0 and (expected is None or r.stdout.strip() == expected))
    results['cases'].append({'name': name, 'passed': ok})
    if not ok: raise RuntimeError(name + ': ' + r.stdout[-500:] + r.stderr[-1500:])

uid = lambda n: f'00000000-0000-4000-8000-{n:012d}'
u, peer, outsider, c, c2 = [uid(n) for n in range(1,6)]
def call(n, content='Hello', actor=u, conv=c, metadata='{}'):
    return f"SELECT fn_send_message_once('{conv}','{actor}','{uid(n)}','{content}','text','{metadata}')"

try:
    if not re.search(r'PostgreSQL\) 17\.', command([pg / 'postgres', '--version']).stdout): raise RuntimeError('PostgreSQL 17 is required')
    r = command([pg / 'initdb', '-D', cluster / 'data', '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8'])
    if r.returncode: raise RuntimeError(r.stderr)
    with (cluster / 'data/postgresql.conf').open('a') as f:
        f.write("\nlisten_addresses=''\nunix_socket_directories='" + str(socket) + "'\nunix_socket_permissions=0700\nport=55485\nshared_buffers='16MB'\n")
    r = command([pg / 'pg_ctl', '-D', cluster / 'data', '-l', cluster / 'server.log', '-w', 'start'])
    if r.returncode: raise RuntimeError(r.stderr)
    run('fixture', f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
CREATE TABLE social_conversations(id uuid PRIMARY KEY,last_message_at timestamptz,last_message_preview text,updated_at timestamptz);
CREATE TABLE social_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid REFERENCES social_conversations,sender_id uuid,content text,message_type text,media_metadata jsonb,created_at timestamptz DEFAULT now(),is_deleted boolean DEFAULT false);
CREATE TABLE social_conversation_participants(id uuid DEFAULT gen_random_uuid(),conversation_id uuid,user_id uuid,UNIQUE(conversation_id,user_id));
CREATE TABLE messenger_blocked(blocker_id uuid,blocked_id uuid);
ALTER TABLE social_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY sender_owns_message ON social_messages FOR INSERT TO authenticated WITH CHECK(sender_id=auth.uid());
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT INSERT ON social_messages TO authenticated;
INSERT INTO social_conversations(id) VALUES('{c}'),('{c2}');
INSERT INTO social_conversation_participants(conversation_id,user_id) VALUES('{c}','{u}'),('{c}','{peer}'),('{c2}','{u}');
""")
    legacy = (ROOT / 'supabase/migrations/20260501140000_add_media_metadata_to_social_messages.sql').read_text()
    legacy = re.search(r'CREATE OR REPLACE FUNCTION public.fn_send_message\([\s\S]*?\$\$;', legacy).group(0)
    run('legacy-function', legacy)
    run('baseline-retry-duplicates', f"BEGIN; SELECT fn_send_message('{c}','{u}','Baseline')->>'success'; SELECT fn_send_message('{c}','{u}','Baseline')->>'success'; SELECT count(*) FROM social_messages; ROLLBACK;", 'true\ntrue\n2')
    run('install', (ROOT / 'supabase/migrations/20260927150500_messenger_sends_keep_request_identity.sql').read_text())
    run('authenticated-cannot-call-service-rpc', 'SET ROLE authenticated; '+call(11)+';', failure='permission denied')
    run('anonymous-cannot-call-service-rpc', 'SET ROLE anon; '+call(11)+';', failure='permission denied')
    run('receipt-table-private', 'SET ROLE authenticated; SELECT * FROM messenger_send_requests;', failure='permission denied')
    run('first-send', 'SET ROLE service_role; '+call(11)+"->>'replayed';", 'false')
    run('same-request-replay', call(11)+"->>'replayed';", 'true')
    run('one-message-and-receipt', "SELECT (SELECT count(*) FROM social_messages)=1 AND (SELECT count(*) FROM messenger_send_requests)=1 AND (SELECT m.id=r.message_id AND m.request_id=r.request_id FROM social_messages m CROSS JOIN messenger_send_requests r);", 't')
    run('changed-content-conflicts', call(11,'Changed')+';', failure='Message Request Conflicts With Previous Send')
    run('changed-conversation-conflicts', call(11,conv=c2)+';', failure='Message Request Conflicts With Previous Send')
    run('changed-metadata-conflicts', call(11,metadata='{"reply_to":"other"}')+';', failure='Message Request Conflicts With Previous Send')
    run('nonparticipant-denied', call(12,actor=outsider)+';', failure='Cannot Send To This Conversation')
    run('mutual-block-fixture', f"INSERT INTO messenger_blocked VALUES('{peer}','{u}');")
    run('incoming-block-denies-send', call(12)+';', failure='Cannot Send To This Conversation')
    run('block-denies-direct-table-bypass', f"SET ROLE authenticated; SET request.jwt.claim.sub='{u}'; INSERT INTO social_messages(conversation_id,sender_id,content) VALUES('{c}','{u}','Bypass');", failure='row-level security')
    run('reverse-block-fixture', f"DELETE FROM messenger_blocked; INSERT INTO messenger_blocked VALUES('{u}','{peer}');")
    run('outgoing-block-denies-send', call(12)+';', failure='Cannot Send To This Conversation')
    run('unblock', 'DELETE FROM messenger_blocked;')
    run('no-failed-request-residue', f"SELECT NOT EXISTS(SELECT 1 FROM messenger_send_requests WHERE request_id='{uid(12)}');", 't')
    run('transaction-rollback', 'BEGIN; '+call(13)+"->>'success'; ROLLBACK; SELECT count(*) FROM social_messages;", 'true\n1')
    run('rollback-retry-creates-once', call(13)+"->>'replayed';", 'false')
    # Force a failure after message INSERT: the receipt and message must both
    # roll back, so the same operation remains safely retryable.
    run('failure-trigger', "CREATE FUNCTION fail_preview() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected preview failure'; END$$; CREATE TRIGGER fail_preview BEFORE UPDATE ON social_conversations FOR EACH ROW EXECUTE FUNCTION fail_preview();")
    run('midtransaction-fails', call(14)+';', failure='injected preview failure')
    run('midtransaction-atomic', f"SELECT NOT EXISTS(SELECT 1 FROM social_messages WHERE request_id='{uid(14)}') AND NOT EXISTS(SELECT 1 FROM messenger_send_requests WHERE request_id='{uid(14)}');", 't')
    run('remove-failure-trigger', 'DROP TRIGGER fail_preview ON social_conversations;')
    run('midtransaction-retry', call(14)+"->>'replayed';", 'false')
    # All contenders use independent connections and the exact same identity.
    workers = [subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env) for _ in range(8)]
    for worker in workers:
        worker.stdin.write(call(15)+"->>'message_id';"); worker.stdin.close()
    ids = []
    for worker in workers:
        worker.wait(timeout=20)
        if worker.returncode: raise RuntimeError(worker.stderr.read())
        ids.append(worker.stdout.read().strip())
    if len(set(ids)) != 1: raise RuntimeError('Concurrent calls returned different messages')
    (out / 'concurrent-results.json').write_text(json.dumps(ids))
    run('concurrent-one-message', f"SELECT count(*) FROM social_messages WHERE request_id='{uid(15)}';", '1')
    run('sender-scope-independent', call(15,actor=peer)+"->>'replayed';", 'false')
    run('no-resurrection-after-delete', f"DELETE FROM social_messages WHERE request_id='{uid(11)}';"+call(11)+f"->>'replayed'; SELECT count(*) FROM social_messages WHERE request_id='{uid(11)}';", 'true\n0')
    run('participant-removal-denies-replay', f"DELETE FROM social_conversation_participants WHERE conversation_id='{c}' AND user_id='{u}';"+call(15)+';', failure='Cannot Send To This Conversation')
    results['passed'] = True
finally:
    if (cluster / 'data/postmaster.pid').exists():
        stopped = command([pg / 'pg_ctl', '-D', cluster / 'data', '-m', 'fast', '-w', 'stop'])
        if stopped.returncode: raise RuntimeError('Owned test cluster did not stop')
    if (cluster / 'server.log').exists(): shutil.copyfile(cluster / 'server.log', out / 'server.log')
    shutil.rmtree(cluster)
    (out / 'RESULTS.json').write_text(json.dumps(results, indent=2)+'\n')
    print(json.dumps({'passed': results['passed'], 'cases': len(results['cases']), 'evidence': str(out)}))
