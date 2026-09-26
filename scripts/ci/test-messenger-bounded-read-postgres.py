#!/usr/bin/env python3
"""Exercise the maintained bounded Messenger read RPC in disposable PostgreSQL."""
import argparse
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/messenger-bounded-read')
out = parser.parse_args().output.resolve()
out.mkdir(parents=True, exist_ok=False)
pg = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
cluster = Path(tempfile.mkdtemp(prefix='messenger-read-'))
socket = cluster / 'socket'
socket.mkdir(mode=0o700)
results = {'passed': False, 'cases': []}
cmd = [str(pg / 'psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(socket), '-p', '55484', '-U', 'postgres', '-d', 'postgres']

def command(args, sql=None):
    return subprocess.run([str(a) for a in args], input=sql, text=True, capture_output=True, env=env, timeout=45)

def run(name, sql, expected=None, failure=False):
    r = command(cmd, sql)
    (out / (name + '.log')).write_text(r.stdout + r.stderr)
    ok = (r.returncode != 0) if failure else (r.returncode == 0 and (expected is None or r.stdout.strip() == expected))
    results['cases'].append({'name': name, 'passed': ok})
    if not ok:
        raise RuntimeError(name + ': ' + r.stdout[-500:] + r.stderr[-1000:])

u = '00000000-0000-4000-8000-000000000001'
s = '00000000-0000-4000-8000-000000000002'
c = '00000000-0000-4000-8000-000000000003'
m = [f'00000000-0000-4000-8000-{n:012d}' for n in range(11, 16)]
call = lambda mid, who=u: f"SELECT fn_mark_messages_read_through('{c}','{who}','{mid}')->>'success';"
try:
    if not re.search(r'PostgreSQL\) 17\.', command([pg / 'postgres', '--version']).stdout):
        raise RuntimeError('PostgreSQL 17 is required')
    for args in [[pg / 'initdb', '-D', cluster / 'data', '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']]:
        r = command(args)
        if r.returncode: raise RuntimeError(r.stderr)
    with (cluster / 'data/postgresql.conf').open('a') as f:
        f.write("\nlisten_addresses=''\nunix_socket_directories='" + str(socket) + "'\nunix_socket_permissions=0700\nport=55484\nshared_buffers='16MB'\n")
    r = command([pg / 'pg_ctl', '-D', cluster / 'data', '-l', cluster / 'server.log', '-w', 'start'])
    if r.returncode: raise RuntimeError(r.stderr)
    run('fixture', f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE social_messages(id uuid PRIMARY KEY,conversation_id uuid,sender_id uuid,created_at timestamptz,is_deleted boolean);
CREATE TABLE social_conversation_participants(id uuid DEFAULT gen_random_uuid(),conversation_id uuid,user_id uuid,last_read_at timestamptz,UNIQUE(conversation_id,user_id));
CREATE TABLE social_message_reads(id uuid DEFAULT gen_random_uuid(),message_id uuid,user_id uuid,read_at timestamptz,UNIQUE(message_id,user_id));
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
INSERT INTO social_conversation_participants(conversation_id,user_id) VALUES('{c}','{u}');
INSERT INTO social_messages VALUES
('{m[0]}','{c}','{s}','2026-09-26 10:00:00Z',false),
('{m[1]}','{c}','{s}','2026-09-26 10:01:00Z',false),
('{m[2]}','{c}','{s}','2026-09-26 10:02:00Z',false),
('{m[3]}','{c}','{u}','2026-09-26 10:00:00Z',false),
('{m[4]}','{c}','{s}','2026-09-26 10:00:00Z',true);
""")
    # The old RPC's unbounded INSERT includes the later arrival. This baseline
    # uses its maintained April body, and every baseline write rolls back.
    old = (ROOT / 'supabase/migrations/20260417000000_phase13_fix_messenger_rpcs.sql').read_text()
    legacy = re.search(r'CREATE FUNCTION fn_mark_messages_read\([\s\S]*?\$\$;', old).group(0)
    run('legacy-function', legacy)
    run('baseline-marks-later-unseen-arrival', f"BEGIN; SELECT fn_mark_messages_read('{c}','{u}')->>'success'; SELECT count(*) FROM social_message_reads WHERE message_id='{m[2]}'; ROLLBACK;", 'true\n1')
    migration = (ROOT / 'supabase/migrations/20260926215000_messenger_reads_stop_at_displayed_message.sql').read_text()
    run('install', migration)
    run('service-only', f"SET ROLE authenticated; {call(m[1])}", failure=True)
    run('nonparticipant', call(m[1], s), 'false')
    run('foreign-boundary', call('00000000-0000-4000-8000-000000000099'), 'false')
    run('deleted-boundary', call(m[4]), 'false')
    run('bounded-read', 'SET ROLE service_role; ' + call(m[1]), 'true')
    run('new-arrival-own-deleted-excluded', f"SELECT count(*)=2 AND bool_and(message_id IN ('{m[0]}','{m[1]}')) FROM social_message_reads;", 't')
    run('watermark-is-displayed-time', "SELECT last_read_at='2026-09-26 10:01:00Z' FROM social_conversation_participants;", 't')
    run('duplicate-and-old-receipts', call(m[1]) + call(m[0]) + "SELECT count(*) FROM social_message_reads; SELECT last_read_at='2026-09-26 10:01:00Z' FROM social_conversation_participants;", 'true\ntrue\n2\nt')
    run('later-visible-arrival', call(m[2]) + "SELECT count(*) FROM social_message_reads;", 'true\n3')
    run('transaction-rollback', f"BEGIN; DELETE FROM social_message_reads; {call(m[2])} ROLLBACK; SELECT count(*) FROM social_message_reads;", 'true\n3')
    # Concurrent older receipt cannot rewind the watermark after the newer one.
    a = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    a.stdin.write('BEGIN; ' + call(m[2]) + ' SELECT pg_sleep(0.2); COMMIT;')
    a.stdin.close()
    run('concurrent-older-read', call(m[0]), 'true')
    a.wait(timeout=10)
    if a.returncode: raise RuntimeError(a.stderr.read())
    run('concurrent-watermark', "SELECT last_read_at='2026-09-26 10:02:00Z' FROM social_conversation_participants;", 't')
    results['passed'] = True
finally:
    if (cluster / 'data/postmaster.pid').exists():
        stopped = command([pg / 'pg_ctl', '-D', cluster / 'data', '-m', 'fast', '-w', 'stop'])
        if stopped.returncode: raise RuntimeError('Owned test cluster did not stop')
    if (cluster / 'server.log').exists(): shutil.copyfile(cluster / 'server.log', out / 'server.log')
    shutil.rmtree(cluster)
    (out / 'RESULTS.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps({'passed': results['passed'], 'cases': len(results['cases']), 'evidence': str(out)}))
