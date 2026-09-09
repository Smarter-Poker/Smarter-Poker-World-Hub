import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  decodeV31IngressSecret,
  parseV31IngressJson,
  signV31IngressRequest,
  V31_INGRESS_PROTOCOL,
  v31IngressBodySha256,
  v31IngressEnvelopeIsValid,
  v31IngressDatabaseFailureStatus,
  verifyV31IngressRequest,
} from '../src/lib/horses/solverV31IngressAuth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE = fs.readFileSync(path.join(ROOT, 'pages/api/internal/horse-solver-v31.js'), 'utf8');
const HEX = (char) => char.repeat(64);

function provenance() {
  return {
    dataset_key: 'horse.v31.phase4.20260908',
    solver_version: 'PioSOLVER-edge-3.0',
    solver_binary_checksum: HEX('a'),
    pipeline_commit: 'b'.repeat(40),
    pipeline_bundle_checksum: HEX('c'),
    manifest_version: 'v31.1',
    manifest_checksum: HEX('d'),
    range_bundle_checksum: HEX('e'),
    source_combo_order_checksum: HEX('f'),
    icm_model_checksum: HEX('1'),
    input_bundle_checksum: HEX('2'),
  };
}

function envelope(principal, operation, payload = {}) {
  return {
    contract: V31_INGRESS_PROTOCOL,
    principal,
    operation,
    provenance: provenance(),
    payload,
  };
}

test('wire bytes, timestamp, principal and body hash are all HMAC bound', () => {
  const principal = 'M1';
  const timestamp = '1788888888';
  const nonce = '11111111-1111-4111-8111-111111111111';
  const rawBody = Buffer.from(JSON.stringify(envelope(principal, 'dataset_contract')));
  const bodySha256 = v31IngressBodySha256(rawBody);
  const secret = Buffer.from(HEX('a'), 'hex');
  const signature = signV31IngressRequest({ principal, timestamp, nonce, bodySha256, secret });
  const nowMs = Number(timestamp) * 1000;
  assert.equal(verifyV31IngressRequest({ principal, timestamp, nonce, bodySha256, signature, rawBody, secret, nowMs }), true);
  assert.equal(verifyV31IngressRequest({ principal: 'M2', timestamp, nonce, bodySha256, signature, rawBody, secret, nowMs }), false);
  assert.equal(verifyV31IngressRequest({ principal, timestamp, nonce, bodySha256, signature, rawBody: Buffer.from(`${rawBody} `), secret, nowMs }), false);
  assert.equal(verifyV31IngressRequest({ principal, timestamp, nonce, bodySha256, signature, rawBody, secret, nowMs: nowMs + 301_000 }), false);
});

test('M1 and M2 cannot use compactor operations', () => {
  assert.equal(v31IngressEnvelopeIsValid(envelope('M1', 'dataset_contract'), 'M1'), true);
  assert.equal(v31IngressEnvelopeIsValid(envelope('M2', 'ingest_artifact'), 'M2'), true);
  assert.equal(v31IngressEnvelopeIsValid(envelope('M1', 'build_cell'), 'M1'), false);
  assert.equal(v31IngressEnvelopeIsValid(envelope('M2', 'seal_dataset'), 'M2'), false);
  assert.equal(v31IngressEnvelopeIsValid(envelope('COMPACTOR', 'build_cell'), 'COMPACTOR'), true);
  assert.equal(v31IngressEnvelopeIsValid(envelope('COMPACTOR', 'ingest_artifact'), 'COMPACTOR'), false);
});

test('provenance identity text is canonical before it reaches the database', () => {
  const spacedSolver = envelope('M1', 'dataset_contract');
  spacedSolver.provenance.solver_version = ' PioSOLVER-edge-3.0';
  assert.equal(v31IngressEnvelopeIsValid(spacedSolver, 'M1'), false);

  const newlineManifest = envelope('M1', 'dataset_contract');
  newlineManifest.provenance.manifest_version = 'v31\n1';
  assert.equal(v31IngressEnvelopeIsValid(newlineManifest, 'M1'), false);
});

test('strict ingress JSON rejects duplicate keys at every depth, including escaped aliases', () => {
  assert.deepEqual(parseV31IngressJson('{"a":1,"nested":{"b":2},"array":[{"c":3}]}'), {
    a: 1,
    nested: { b: 2 },
    array: [{ c: 3 }],
  });
  assert.throws(() => parseV31IngressJson('{"operation":"one","operation":"two"}'), /duplicate JSON key/);
  assert.throws(() => parseV31IngressJson('{"payload":{"dataset_id":1,"dataset_id":2}}'), /duplicate JSON key/);
  assert.throws(() => parseV31IngressJson('{"payload":{"a":1,"\\u0061":2}}'), /duplicate JSON key/);
  assert.throws(() => parseV31IngressJson('{"payload":"\\ud800"}'), /Unicode surrogate/);
  assert.deepEqual(parseV31IngressJson('{"payload":"😀"}'), { payload: '😀' });
  const bomBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":1}')]);
  const bomVisible = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bomBytes);
  assert.throws(() => parseV31IngressJson(bomVisible), /expected JSON value/);
});

test('database outages remain retryable while deterministic conflicts stay 409', () => {
  assert.equal(v31IngressDatabaseFailureStatus({ code: '57014' }, 400), 504);
  assert.equal(v31IngressDatabaseFailureStatus({ code: 'PGRST003' }, 504), 504);
  assert.equal(v31IngressDatabaseFailureStatus({ code: 'PGRST202' }, 404), 503);
  assert.equal(v31IngressDatabaseFailureStatus({ code: '08006' }, 400), 503);
  assert.equal(v31IngressDatabaseFailureStatus({ code: 'P0001' }, 400), 409);
  assert.equal(v31IngressDatabaseFailureStatus({ code: '23505' }, 409), 409);
});

test('strict ingress JSON stays linear on numeric arrays and bounds recursive nesting', () => {
  const numbers = Array.from({ length: 20_000 }, (_, index) => index % 1_000);
  assert.deepEqual(parseV31IngressJson(JSON.stringify(numbers)), numbers);
  assert.throws(() => parseV31IngressJson('{"value":1e400}'), /finite ingress range/);
  assert.deepEqual(parseV31IngressJson('{"value":9007199254740991}'), {
    value: Number.MAX_SAFE_INTEGER,
  });
  assert.throws(
    () => parseV31IngressJson('{"value":9007199254740993}'),
    /exact ingress range/,
  );
  assert.throws(
    () => parseV31IngressJson('{"value":9007199254740993.0}'),
    /exact ingress range/,
  );
  assert.throws(
    () => parseV31IngressJson('{"value":9007199254740991.1}'),
    /exact ingress range/,
  );
  assert.throws(() => parseV31IngressJson('{"value":1e-400}'), /exact ingress range/);
  assert.deepEqual(parseV31IngressJson('{"decimalInteger":1.0,"exponentInteger":1e2}'), {
    decimalInteger: 1,
    exponentInteger: 100,
  });
  const tooDeep = `${'['.repeat(130)}0${']'.repeat(130)}`;
  assert.throws(() => parseV31IngressJson(tooDeep), /nesting exceeds/);
});

test('a shared principal secret fails closed', () => {
  const environment = {
    HORSE_SOLVER_V31_M1_HMAC_SECRET: HEX('a'),
    HORSE_SOLVER_V31_M2_HMAC_SECRET: HEX('a'),
    HORSE_SOLVER_V31_COMPACTOR_HMAC_SECRET: HEX('b'),
  };
  assert.equal(decodeV31IngressSecret('M1', environment), null);
  assert.equal(decodeV31IngressSecret('M2', environment), null);
  assert.equal(decodeV31IngressSecret('COMPACTOR', environment)?.length, 32);
});

test('the route claims a durable nonce before its narrow RPC dispatch', () => {
  const claim = ROUTE.indexOf("await rpc(supabase, 'fn_solver_ingress_claim'");
  const dispatch = ROUTE.indexOf('const result = await dispatch(supabase, envelope);');
  assert.ok(claim > 0 && dispatch > claim, 'nonce must be claimed before dispatch');
  assert.ok(ROUTE.includes('export const config = { api: { bodyParser: false }, maxDuration: 300 };'));
  assert.ok(ROUTE.includes('const LONG_DB_TIMEOUT_MS = 270_000;'));
  assert.ok(ROUTE.includes("'fn_gto_v31_build_cell',\n      { p_dataset_id: payload.dataset_id, p_context: payload.context },\n      LONG_DB_TIMEOUT_MS"));
  assert.ok(ROUTE.includes("'fn_gto_v31_seal_build',\n      { p_dataset_id: payload.dataset_id },\n      LONG_DB_TIMEOUT_MS"));
  assert.ok(ROUTE.includes('Raw JSON request body required'));
  assert.ok(ROUTE.includes('parseV31IngressJson('));
  assert.ok(ROUTE.includes("new TextDecoder('utf-8'"));
  assert.ok(ROUTE.includes('ignoreBOM: true'));
  assert.ok(ROUTE.includes('v31IngressDatabaseFailureStatus(error, status)'));
  assert.ok(ROUTE.includes("typeof contract[field] === 'string'"));
  assert.ok(ROUTE.includes('contract[field] === provenance[field]'));
  assert.ok(!ROUTE.includes('String(contract[field])'));
  assert.ok(!ROUTE.includes('UUID.test(value.toLowerCase())'));
  for (const rpc of [
    'fn_gto_v31_worker_contract',
    'fn_solver_worker_heartbeat',
    'fn_gto_v31_ingest_source_artifact',
    'fn_gto_v31_register_dataset',
    'fn_gto_v31_build_cell',
    'fn_gto_v31_seal_build',
    'fn_solver_compact_heartbeat',
    'ca_gto_v31_certification_status',
  ]) assert.ok(ROUTE.includes(`'${rpc}'`), rpc);
  assert.ok(!ROUTE.includes('fn_gto_v31_promote_dataset'));
  assert.ok(!ROUTE.includes('fn_gto_v31_mark_candidate'));
  assert.ok(!ROUTE.includes("supabase.from('solved_spots_gold')"));
});
