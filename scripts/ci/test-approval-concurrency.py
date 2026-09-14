"""Real PostgreSQL17 approval requests, decisions and audit writes in an isolated cluster."""
import argparse
import json
import os
import pathlib
import selectors
import shutil
import subprocess
import tempfile
import time

root = pathlib.Path(__file__).resolve().parents[2]
fixture = root / 'scripts/ci/probes/approval-concurrency'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=pathlib.Path, default=root / 'artifacts/approval-concurrency')
out = parser.parse_args().output.resolve()
out.mkdir(parents=True, exist_ok=False)
pg = pathlib.Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env['LC_ALL'] = 'C'
cluster = pathlib.Path(tempfile.mkdtemp(prefix='approval-concurrency-'))
sock = cluster / 'socket'
sock.mkdir(mode=0o700)
psql = [str(pg / 'psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(sock), '-p', '55769', '-U', 'postgres', '-d', 'postgres']
signature = 'fn_ca_operator_request_approval(text,jsonb,uuid,numeric,text,text,text,text,text,text)'
installer = (root / 'supabase/migrations/20260914091000_operator_approval_concurrent_identity.sql').read_text()
requester = '00000000-0000-0000-0000-000000000001'
approver = '00000000-0000-0000-0000-000000000002'
checks, children, races = [], [], []


def check(name, passed):
    checks.append({'name': name, 'passed': bool(passed)})
    if not passed:
        raise AssertionError(name)


def cmd(argv, sql=None):
    result = subprocess.run(list(map(str, argv)), input=sql, text=True, capture_output=True, env=env, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def run(sql):
    return cmd(psql, sql)


def quote(value):
    return 'NULL' if value is None else "'" + str(value).replace("'", "''") + "'"


def request(key, amount=500, kind='mint', asset='diamonds', target_type='player', target_id='target-a'):
    args = [quote(kind), "'{}'", quote(requester), quote(amount), quote(asset), quote(target_type), quote(target_id), "'native proof'", quote(key), "'native-request'"]
    return 'SELECT public.fn_ca_operator_request_approval(' + ','.join(args) + ');'


def read(key, **kwargs):
    return json.loads(run('SET ROLE service_role;' + request(key, **kwargs)))


def decision(approval_id, actor=approver, choice='approve'):
    return 'SELECT fn_ca_operator_decide_approval(' + ','.join(map(quote, [approval_id, choice, actor, 'native decision'])) + ');'


def start(sql):
    process = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    children.append(process)
    process.stdin.write(sql + '\n')
    process.stdin.flush()
    return process


def first_result(process):
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        if not selector.select(5):
            raise RuntimeError('First transaction did not return within five seconds')
    line = process.stdout.readline()
    if not line:
        raise RuntimeError('First transaction failed: ' + process.stderr.read())
    return json.loads(line)


def finish(process, ending=None):
    if ending:
        process.stdin.write(ending + '\n')
    process.stdin.close()
    process.stdin = None
    stdout, stderr = process.communicate(timeout=5)
    if process.returncode:
        raise RuntimeError(stderr)
    return json.loads(stdout) if stdout.strip() else None


def race(name, first_sql, second_sql, rollback=False):
    first = start('BEGIN;' + first_sql)
    first_answer = first_result(first)
    second = start("SET application_name='approval-racer-b'; SET ROLE service_role;" + second_sql)
    wait = None
    for _ in range(200):
        wait = run("SELECT coalesce(wait_event,'') FROM pg_stat_activity WHERE application_name='approval-racer-b';")
        if wait in ('transactionid', 'advisory', 'tuple'):
            break
        if second.poll() is not None:
            raise RuntimeError(name + ': second transaction never waited')
        time.sleep(.01)
    check(name + '-observed-real-lock-contention', wait in ('transactionid', 'advisory', 'tuple'))
    finish(first, 'ROLLBACK;' if rollback else 'COMMIT;')
    answer = finish(second)
    races.append({'name': name, 'first': first_answer, 'second': answer, 'wait': wait})
    return first_answer, answer


def foreign_insert(key, status='auto_approved', amount=500, expires='NULL'):
    return ('INSERT INTO ca_operator_approvals(kind,status,requested_by,amount,asset,target_type,target_id,op_id,expires_at) '
            'VALUES(\'mint\',' + quote(status) + ',' + quote(requester) + ',' + str(amount) + ", 'diamonds','player','target-a'," + quote(key) + ',' + expires + ') RETURNING jsonb_build_object(\'approval_id\',id);')


try:
    check('postgres17-required', 'PostgreSQL) 17.' in cmd([pg / 'postgres', '--version']))
    cmd([pg / 'initdb', '-D', cluster / 'data', '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8'])
    cmd([pg / 'pg_ctl', '-D', cluster / 'data', '-l', cluster / 'server.log', '-o', f"-k {sock} -p 55769 -c listen_addresses='' -c timezone=UTC -c shared_buffers=16MB -c max_connections=8 -c statement_timeout=10000", '-w', 'start'])
    run((fixture / 'schema.sql').read_text())
    run((fixture / 'dependencies.sql').read_text())
    run((fixture / 'baseline.sql').read_text())
    run('REVOKE ALL ON FUNCTION ' + signature + ' FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION ' + signature + ' TO service_role;')
    digest_sql = 'SELECT md5(pg_get_functiondef(' + quote(signature) + '::regprocedure));'
    check('exact-live-baseline', run(digest_sql) == '39852af5c49ee43cf13e154b9b7543dd')
    check('ordinary-high-amount-requires-approval', read('ordinary-high', amount=5000)['required'] is True)
    first, second = race('baseline', request('baseline'), request('baseline', amount=5000))
    check('baseline-launders-concurrent-amount', first['required'] is False and second['required'] is False and second['raced'] is True)
    run(installer)
    candidate_md5 = run(digest_sql)
    (out / 'candidate-md5.txt').write_text(candidate_md5 + '\n')
    first, second = race('conflicting-amount', request('conflicting'), request('conflicting', amount=5000))
    check('conflicting-request-is-refused', second['required'] is True and second['refused'] is True and second['reason'] == 'payload_mismatch' and second['mismatch'] == ['amount'])
    check('winner-retained-exactly', run("SELECT count(*) FROM ca_operator_approvals WHERE op_id='conflicting' AND amount=500 AND status='auto_approved'") == '1')
    first, second = race('same-request', request('same'), request('same'))
    check('same-request-single-receipt', first['approval_id'] == second['approval_id'] and second['idempotent'] and second['required'] is False)
    check('same-request-single-audit', run("SELECT count(*) FROM admin_audit_log WHERE details->>'op_id'='same'") == '1')
    first, second = race('rolled-back-winner', request('rollback'), request('rollback', amount=5000), rollback=True)
    check('rollback-does-not-grant-clearance', second['required'] is True and second['approval_id'] != first['approval_id'])
    for field, value in [('kind', 'burn'), ('amount', 5000), ('asset', 'chips'), ('target_type', 'club'), ('target_id', 'target-b')]:
        key = 'mismatch-' + field
        read(key)
        answer = read(key, **{field: value})
        check('sequential-identity-' + field, answer.get('mismatch') == [field] and answer['required'] is True and answer['refused'] is True)
    for kind in ('mint', 'burn', 'fund_club', 'cashout'):
        check('threshold-equality-' + kind, read('threshold-' + kind, kind=kind, amount=1000)['required'] is True)
    for kind in ('fleet_policy', 'sanction'):
        check('amountless-policy-' + kind, read('amountless-' + kind, kind=kind, amount=None)['required'] is True)
    for status in ('pending', 'approved', 'auto_approved', 'rejected', 'expired', 'executed', 'failed'):
        key = 'status-' + status
        original = read(key, amount=5000)
        run('UPDATE ca_operator_approvals SET status=' + quote(status) + ' WHERE op_id=' + quote(key))
        answer = read(key, amount=5000)
        check('status-preserved-' + status, answer['approval_id'] == original['approval_id'] and answer['required'] == (status not in ('approved', 'auto_approved', 'executed')))
        if status in ('rejected', 'expired'):
            check('refusal-reason-' + status, answer['refused'] and answer['reason'] == 'approval_' + status)
        if status == 'executed':
            check('execution-receipt-preserved', answer['already_executed'] is True)
        if status == 'failed':
            check('failed-request-rechecks-policy', answer['retried_after_failure'] is True and answer['status'] == 'pending')
    read('past-expiry', amount=5000)
    run("UPDATE ca_operator_approvals SET expires_at=now()-interval '1 second' WHERE op_id='past-expiry'")
    answer = read('past-expiry', amount=5000)
    check('expiry-closes-row-and-refuses', answer['reason'] == 'approval_expired' and run("SELECT status FROM ca_operator_approvals WHERE op_id='past-expiry'") == 'expired')
    first, second = race('legacy-writer', foreign_insert('legacy'), request('legacy', amount=5000))
    check('foreign-writer-conflict-validates-identity', second['refused'] is True and second['required'] is True and second['raced'] is True and second['mismatch'] == ['amount'])
    first, second = race('legacy-expired-writer', foreign_insert('legacy-expiry', status='pending', expires="now()-interval '1 second'"), request('legacy-expiry'))
    check('foreign-writer-conflict-validates-expiry', second['reason'] == 'approval_expired' and second['required'] is True and second['raced'] is True)
    first, second = race('legacy-failed-writer', foreign_insert('legacy-failed', status='failed', amount=5000), request('legacy-failed', amount=5000))
    check('foreign-failed-rechecks-policy', second['retried_after_failure'] is True and second['required'] is True and second['raced'] is True)
    original = read('decision-race', amount=5000)
    denied = json.loads(run('SET ROLE service_role;' + decision(original['approval_id'], actor=requester)))
    check('self-approval-remains-refused', denied['reason'] == 'self_approval_refused')
    denied = json.loads(run('SET ROLE service_role;' + decision(original['approval_id'], actor='00000000-0000-0000-0000-000000000003')))
    check('ungranted-actor-remains-refused', denied['reason'] == 'permission_denied')
    first, second = race('real-decision', decision(original['approval_id']), request('decision-race', amount=5000))
    check('replay-observes-committed-decision', first['status'] == 'approved' and second['status'] == 'approved' and second['required'] is False)
    check('real-decision-audit-retained', run("SELECT count(*) FROM admin_audit_log WHERE action='operator.decide_approval' AND details->>'approval_id'=" + quote(original['approval_id'])) == '1')
    holder = start('BEGIN;' + request('independent-a'))
    first_result(holder)
    independent = read('independent-b', amount=5000)
    check('distinct-keys-do-not-block', independent['required'] is True and holder.poll() is None)
    finish(holder, 'COMMIT;')
    first, second = read(None), read(None)
    check('null-key-preserves-independent-requests', first['approval_id'] != second['approval_id'])
    for role in ('anon', 'authenticated'):
        result = subprocess.run(psql, input='SET ROLE ' + role + ';' + request('forbidden-' + role), text=True, capture_output=True, env=env, timeout=10)
        check(role + '-cannot-create-approval', result.returncode != 0 and 'permission denied' in result.stderr)
    check('service-has-no-direct-approval-table-grant', run("SELECT NOT has_table_privilege('service_role','ca_operator_approvals','INSERT')") == 't')
    check('real-request-audit-recorded', run("SELECT count(*) FROM admin_audit_log WHERE details->>'op_id'='conflicting' AND action='operator.request_approval' AND details->>'amount'='500' AND actor_role='admin'") == '1')
    run(installer)
    check('guarded-migration-idempotent', run(digest_sql) == candidate_md5)
    drift = (fixture / 'baseline.sql').read_text().replace('v_required       boolean := false', 'v_required       boolean := true')
    check('drift-fixture-is-distinct', drift != (fixture / 'baseline.sql').read_text())
    run(drift)
    result = subprocess.run(psql, input='BEGIN;' + installer + 'COMMIT;', text=True, capture_output=True, env=env, timeout=10)
    check('migration-rejects-unreviewed-body', result.returncode != 0 and 'definition drift' in result.stderr)
    check('migration-refusal-preserves-body', run(digest_sql) not in ('39852af5c49ee43cf13e154b9b7543dd', candidate_md5))
    result = {'passed': True, 'checks': checks, 'races': races, 'candidate_md5': candidate_md5, 'scope': 'Exact approval request, decision, permissions, second-approver and audit logger definitions with isolated native schema fixtures. No production request or money operation. Proves approval identity/status concurrency, not financial execution acceptance.'}
    (out / 'RESULTS.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'passed': True, 'checks': len(checks), 'candidate_md5': candidate_md5}))
finally:
    for child in children:
        if child.poll() is None:
            child.kill()
            child.wait()
    subprocess.run([str(pg / 'pg_ctl'), '-D', str(cluster / 'data'), '-m', 'immediate', '-w', 'stop'], capture_output=True, env=env, timeout=15)
    shutil.rmtree(cluster)
