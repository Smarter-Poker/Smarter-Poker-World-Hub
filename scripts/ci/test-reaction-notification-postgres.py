#!/usr/bin/env python3
"""Prove one reaction invokes the existing notification handler once in PG17."""
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
parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/reaction-notification')
out = parser.parse_args().output.resolve()
out.mkdir(parents=True, exist_ok=False)
pg = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env['LC_ALL'] = 'C'
cluster = Path(tempfile.mkdtemp(prefix='reaction-trigger-', dir='/tmp'))
socket = cluster / 'socket'
socket.mkdir(mode=0o700)
cmd = [str(pg / 'psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
       '-h', str(socket), '-p', '55693', '-U', 'postgres', '-d', 'postgres']
results = {'scope': 'trigger dispatch and notification rows; no production notification or push test', 'cases': [], 'passed': False}
author = '00000000-0000-4000-8000-000000000001'
actor = '00000000-0000-4000-8000-000000000002'
post = '00000000-0000-4000-8000-000000000003'
reel = '00000000-0000-4000-8000-000000000004'
installer = (ROOT / 'supabase/migrations/20260913180130_reaction_notification_trigger_runs_once.sql').read_text()


def command(argv, sql=None):
    return subprocess.run([str(a) for a in argv], input=sql, text=True, capture_output=True, env=env, timeout=45)


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def run(name, sql, expected=None, error=None):
    r = command(cmd, sql)
    (out / (name + '.log')).write_text(r.stdout + r.stderr)
    passed = (r.returncode != 0 and error in r.stderr) if error else r.returncode == 0
    if expected is not None:
        passed = passed and r.stdout.rstrip('\n') == expected
    results['cases'].append({'name': name, 'passed': passed, 'expectedSqlstate': error})
    require(passed, name + ': ' + r.stdout[-500:] + r.stderr[-1000:])
    return r.stdout.rstrip('\n')


def react(kind='like', who=actor, target=post, number=1):
    return f"INSERT INTO social_interactions VALUES({number},'{who}','{target}','{kind}');"


def probe(name, body, expected=None, error=None):
    return run(name, 'BEGIN;\n' + body + '\nROLLBACK;', expected, error)


count = 'SELECT count(*) FROM notifications;'
try:
    require(re.search(r'PostgreSQL\) 17\.', command([pg / 'postgres', '--version']).stdout), 'PostgreSQL 17 required')
    r = command([pg / 'initdb', '-D', cluster / 'data', '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8'])
    require(r.returncode == 0, r.stderr)
    with (cluster / 'data/postgresql.conf').open('a') as f:
        f.write("\nlisten_addresses=''\nunix_socket_directories='" + str(socket) + "'\nunix_socket_permissions=0700\nport=55693\nshared_buffers='16MB'\nmax_connections=10\n")
    r = command([pg / 'pg_ctl', '-D', cluster / 'data', '-l', cluster / 'server.log', '-w', 'start'])
    require(r.returncode == 0, r.stderr)
    run('fixture', (ROOT / 'scripts/ci/probes/reaction-notification/fixture.sql').read_text())
    probe('baseline-single-reaction-duplicates-notification', react() + count, '2')
    run('baseline-rollback', count, '0')
    run('refuse-disabled-replacement-atomically', 'BEGIN; ALTER TABLE social_interactions DISABLE TRIGGER trg_notify_interaction_like;\n' + installer, error='P0001')
    run('refusal-preserves-two-enabled-handlers', "SELECT count(*) FROM pg_trigger WHERE tgrelid='social_interactions'::regclass AND tgfoid='fn_notify_post_like()'::regprocedure AND tgenabled='O';", '2')
    run('install', installer)
    run('install-does-not-rewrite-notifications', count, '0')
    for kind in ['like', 'love', 'haha', 'wow', 'sad', 'angry']:
        probe('one-notification-for-' + kind, react(kind) + count, '1')
    probe('reel-notification', react(target=reel) + count, '1')
    probe('self-reaction-stays-quiet', react(who=author) + count, '0')
    probe('unrecognized-reaction-stays-quiet', react('bookmark') + count, '0')
    probe('unknown-post-stays-quiet', react(target='00000000-0000-4000-8000-000000000099') + count, '0')
    probe('existing-active-author-filter-preserved', f"INSERT INTO content_authors VALUES('{actor}',true);" + react() + count, '0')
    probe('inactive-author-notification-preserved', f"INSERT INTO content_authors VALUES('{actor}',false);" + react() + count, '1')
    probe('notification-payload-preserved', react() + f"SELECT user_id='{author}' AND actor_id='{actor}' AND type='like' AND title='Actor' AND message='liked your post' AND data=jsonb_build_object('post_id','{post}'::uuid,'actor_id','{actor}'::uuid,'actor_name','Actor') FROM notifications;", 't')
    probe('distinct-admitted-reactions-stay-distinct', react() + react('love', number=2) + count, '2')
    probe('conflict-do-nothing-does-not-reemit', react() + react().replace(';', ' ON CONFLICT DO NOTHING;') + count, '1')
    probe('later-statement-failure-rolls-back-notification', react() + react(), error='23505')
    run('all-probes-rolled-back', count, '0')
    run('handler-body-and-grants-unchanged', "SELECT md5(pg_get_functiondef(oid))='b23bbee40aba1044acf5a5f5f02680d0' AND NOT has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE') AND has_function_privilege('service_role',oid,'EXECUTE') FROM pg_proc WHERE oid='fn_notify_post_like()'::regprocedure;", 't')
    run('sole-enabled-handler', "SELECT count(*)=1 AND bool_and(tgname='trg_notify_interaction_like' AND tgenabled='O') FROM pg_trigger WHERE tgrelid='social_interactions'::regclass AND tgfoid='fn_notify_post_like()'::regprocedure;", 't')
    results['passed'] = True
finally:
    if (cluster / 'data/postmaster.pid').exists():
        r = command([pg / 'pg_ctl', '-D', cluster / 'data', '-m', 'fast', '-w', 'stop'])
        require(r.returncode == 0, 'Could not stop owned cluster: ' + r.stderr)
    if (cluster / 'server.log').exists():
        shutil.copyfile(cluster / 'server.log', out / 'server.log')
    require(not (cluster / 'data/postmaster.pid').exists(), 'Owned cluster still running')
    shutil.rmtree(cluster)
    results['ownedClusterRemoved'] = not cluster.exists()
    (out / 'RESULTS.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps({'passed': results['passed'], 'cases': len(results['cases']), 'evidence': str(out)}))
