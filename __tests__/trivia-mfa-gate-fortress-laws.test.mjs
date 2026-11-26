import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    TRIVIA_OPERATOR_ACTIONS,
    TRIVIA_PHYSICAL_SIGNOFF_GATE_KEYS,
    parseOperationsActionRequest,
} from '../src/lib/trivia/operationsSnapshot.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const MIGRATION = 'supabase/migrations/20261126053500_trivia_launch_gate_signoff_action.sql';
const OPS_API = 'pages/api/admin/trivia-operations.js';
const CURATE_API = 'pages/api/admin/trivia-pool-curate.js';

test('MFA FORTRESS LAW 1: both Trivia admin write routes verify the HMAC MFA gate BEFORE any mutation RPC', () => {
    const cases = [
        [OPS_API, "client.rpc('trivia_operator_execute_v1'"],
        [CURATE_API, "client.rpc('trivia_pool_batch_curate_v1'"],
    ];
    for (const [file, mutation] of cases) {
        const src = read(file);
        assert.match(src, /import \{[^}]*requireMfaEnrolled[^}]*\} from '..\/..\/..\/src\/lib\/mfaGate'/, `${file} must import requireMfaEnrolled`);
        const gate = src.indexOf('await requireMfaEnrolled(req, client, operator.user)');
        const write = src.indexOf(mutation);
        assert.ok(gate > 0, `${file} must call requireMfaEnrolled`);
        assert.ok(write > gate, `${file} must call requireMfaEnrolled before ${mutation}`);
        assert.match(src, /if \(!mfaGate\.ok\)/);
        assert.match(src, /res\.status\(mfaGate\.status \|\| 403\)/);
        assert.match(src, /requiresMfa: true/);
        assert.match(src, /requiresEnrollment: mfaGate\.requiresEnrollment === true/);
    }
});

test('MFA FORTRESS LAW 2: trusted-device parity and checked proof RPC error', () => {
    const src = read(OPS_API);
    assert.match(src, /verifyTrustedDevice\(req, operator\.user\.id\)/);
    assert.match(src, /verifyMfaCookie\(req, operator\.user\.id\)/);
    assert.match(src, /'trusted_device'/);
    assert.match(src, /method: mfaMethod/);
    assert.match(src, /mfaGate\.ok === true && Number\.isFinite\(mfaGate\.verifiedAt\)/);
    assert.match(src, /const \{ error: proofError \} = await client\.rpc\('trivia_record_mfa_write_proof_v1'/);
    assert.match(src, /if \(proofError\)/);
    assert.match(src, /\[trivia-operations\] mfa proof rpc failed:/);
});

test('MFA FORTRESS LAW 3: launch_gate_signoff migration allows only the 3 physical gates and rejects Gate 2', () => {
    const sql = read(MIGRATION);
    assert.match(sql, /'launch_gate_signoff'/);
    assert.match(sql, /v_gate_key NOT IN \('physical_ios_review', 'physical_android_review', 'physical_push_receipt'\)/);
    assert.match(sql, /'invalid_gate_key'/);
    assert.match(sql, /v_context->'roles' \? 'supervisor'/);
    assert.match(sql, /length\(v_device\) NOT BETWEEN 3 AND 120/);
    assert.match(sql, /length\(v_evidence\) NOT BETWEEN 3 AND 240/);
    assert.match(sql, /length\(v_reason\) < 12/);
    assert.match(sql, /INSERT INTO public\.trivia_launch_gate_signoffs_v1/);
    assert.match(sql, /INSERT INTO public\.trivia_operator_events_v1/);
    assert.match(sql, /idempotency_conflict/);
    assert.match(sql, /trivia_operator_execute_before_launch_signoff_v1/);
    // The only gate_key literal in the NOT IN allow-list must never include Gate 2.
    const allowList = sql.match(/v_gate_key NOT IN \(([^)]*)\)/)[1];
    assert.doesNotMatch(allowList, /operator_mfa_http_write/);
    // Migration itself must never insert sign-off rows outside the function body.
    const outsideFn = sql.split('$function$')[0] + sql.split('$function$').slice(2).join('');
    assert.doesNotMatch(outsideFn, /INSERT INTO public\.trivia_launch_gate_signoffs_v1/);
    assert.doesNotMatch(sql, /ALTER TABLE public\.trivia_launch_gate_signoffs_v1/);
});

test('MFA FORTRESS LAW 3b: parser and UI wire launch_gate_signoff for the 3 physical keys only', () => {
    assert.deepEqual([...TRIVIA_PHYSICAL_SIGNOFF_GATE_KEYS], ['physical_ios_review', 'physical_android_review', 'physical_push_receipt']);
    assert.equal(TRIVIA_OPERATOR_ACTIONS.launch_gate_signoff.roleRequired, 'supervisor');
    const base = {
        requestKey: 'signoff-request-0001',
        action: 'launch_gate_signoff',
        reason: 'Verified on physical hardware',
        targetId: null,
    };
    const good = { gateKey: 'physical_ios_review', device: 'iPhone 15 iOS 19', evidenceRef: 'ticket-1234' };
    assert.equal(parseOperationsActionRequest({ ...base, payload: good }).ok, true);
    for (const gateKey of ['operator_mfa_http_write', 'nope', '']) {
        assert.equal(parseOperationsActionRequest({ ...base, payload: { ...good, gateKey } }).error, 'invalid_gate_key');
    }
    assert.equal(parseOperationsActionRequest({ ...base, payload: { ...good, device: 'ab' } }).error, 'invalid_device');
    assert.equal(parseOperationsActionRequest({ ...base, payload: { ...good, evidenceRef: 'x' } }).error, 'invalid_evidence_ref');
    assert.equal(parseOperationsActionRequest({ ...base, reason: 'too short', payload: good }).error, 'invalid_reason');
    assert.equal(parseOperationsActionRequest({ ...base, payload: { ...good, extra: 1 } }).error, 'invalid_payload_field');

    const ui = read('pages/admin/trivia-operations.js');
    assert.match(ui, /Physical Device Human Sign-Off/);
    assert.match(ui, /action: 'launch_gate_signoff'/);
    assert.match(ui, /physical_ios_review/);
    assert.match(ui, /physical_android_review/);
    assert.match(ui, /physical_push_receipt/);
    assert.doesNotMatch(ui, /<option value="operator_mfa_http_write"/);
    assert.match(ui, /isSupervisor/);
});

test('MFA FORTRESS LAW 4: trivia-pool-status fails closed without the service key and returns 403 for authenticated non-operators', () => {
    const src = read('pages/api/admin/trivia-pool-status.js');
    assert.doesNotMatch(src, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    assert.match(src, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(src, /if \(!url \|\| !key\) return null/);
    assert.match(src, /status\(503\)\.json\(\{ success: false, error: 'server_misconfigured' \}\)/);
    assert.match(src, /access === 'forbidden'/);
    assert.match(src, /status\(403\)\.json\(\{ success: false, error: 'trivia_operator_required' \}\)/);
    const forbid = src.indexOf("access === 'forbidden'");
    const secret = src.indexOf('requireAdminSecret(req, res');
    assert.ok(forbid > 0 && secret > forbid, '403 must be decided before the 401 machine-secret fallback');
});

test('MFA FORTRESS LAW 5: both admin pages route enrollment vs step-up', () => {
    for (const [file, page] of [['pages/admin/trivia-operations.js', 'trivia-operations'], ['pages/admin/trivia-pool.js', 'trivia-pool']]) {
        const src = read(file);
        assert.match(src, /requiresEnrollment === true/, `${file} must read requiresEnrollment`);
        assert.ok(src.includes(`/auth/mfa?enroll=1&next=%2Fadmin%2F${page}`), `${file} must link to MFA enrollment`);
        assert.ok(src.includes(`/auth/mfa?stepup=1&next=%2Fadmin%2F${page}`), `${file} must keep step-up link`);
    }
});
