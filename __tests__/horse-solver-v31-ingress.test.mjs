import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  decodeV31IngressSecret,
  signV31IngressRequest,
  V31_INGRESS_PROTOCOL,
  v31IngressBodySha256,
  v31IngressEnvelopeIsValid,
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
