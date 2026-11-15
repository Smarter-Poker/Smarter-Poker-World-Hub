// V31 cell contract v3 at the solver gateway (FLOP-5 D6, dormant).
// Proves: (1) with no v3 registration every request is answered exactly as
// before (same status, same message, no nonce claim, no write); (2) a v3 cell
// is admitted only for a hist215-v3 dataset whose round registration declares
// cell contract v3 and is linked to it; (3) every v2 envelope takes the old
// path and never reads the registration.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as ingressAuth from '../src/lib/horses/solverV31IngressAuth.mjs';

const {
  V31_INGRESS_PROTOCOL, V31_PUBLIC215_FEATURE_SCHEMA_V3, V31_REGISTRATION_CELL_CONTRACT_PROTOCOL,
  signV31IngressRequest, v31IngressBodySha256, v31IngressEnvelopeIsValid, v31ContextCellContract,
  v31LineClassValidV3, v31RegistrationCellContract, v31Public215BuildEnvelopeIsValid,
  v31Public215FreezeEnvelopeIsValid, v31FeatureContractVersion, v31FeatureContractVersionV3,
} = ingressAuth;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE = fs.readFileSync(path.join(ROOT, 'pages/api/internal/horse-solver-v31.js'), 'utf8');
const HEX = (c) => c.repeat(64);
const DATASET_ID = '11111111-1111-4111-8111-111111111111';
const KEY = 'horse.v31.v3.pilot';
const V1_SCHEMA = '0ca054f9bb0463bf6a298a80a29cb4b6d9e6bffcc193e4af9d497e2936ec849f';
const V2_KEYS = ['street','game_family','objective','utility_context','table_size','pot_type','hero_position',
  'opponent_position','depth_bucket','texture_class','node_role','facing_kind','facing_size_bucket'];

const canonical = (v) => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
  : JSON.stringify(v);
const hash = (v) => createHash('sha256').update(canonical(v), 'ascii').digest('hex');

function provenance(feature = 'holdem-public-hist215-v3') {
  return { dataset_key: KEY, solver_version: 'PioSOLVER-edge-3.0', solver_binary_checksum: HEX('a'),
    pipeline_commit: 'b'.repeat(40), pipeline_bundle_checksum: HEX('c'), manifest_version: 'v31.1',
    manifest_checksum: HEX('d'), range_bundle_checksum: HEX('e'), source_combo_order_checksum: HEX('f'),
    icm_model_checksum: HEX('1'), input_bundle_checksum: HEX('2'),
    ...(feature ? { feature_contract_version: feature, policy_export_schema: 'smarter-poker.pio-policy.v4' } : {}) };
}
function v2Context() {
  return Object.fromEntries(V2_KEYS.map(k => [k, k === 'table_size' ? 2 : k === 'depth_bucket' ? 150 : k === 'street' ? 'turn' : 'synthetic']));
}
function v3Context(line = 'x.b-big.c/x') {
  return { ...v2Context(), depth_bucket: 200, cell_contract: 'v3', line_class: line };
}
function buildEnvelope(context, schema = V31_PUBLIC215_FEATURE_SCHEMA_V3) {
  const e = { context, policy_representation: 'public_hist215_v1', feature_schema_checksum: schema,
    public_template: { format: 'public_hist215_template_v1', context },
    public_training_provenance: { format: 'public_hist215_training_v1' } };
  e.template_checksum = hash(e.public_template);
  e.training_provenance_checksum = hash(e.public_training_provenance);
  e.public_model = { format: 'public_hist215_v1', action_ids: ['b50', 'c'], template_sha256: e.template_checksum,
    feature_schema_sha256: e.feature_schema_checksum, provenance_sha256: e.training_provenance_checksum };
  e.model_checksum = hash(e.public_model);
  e.public_model_build_receipt = { format: 'public_hist215_build_receipt_v1', dataset_id: DATASET_ID,
    ...Object.fromEntries(['model_checksum','template_checksum','feature_schema_checksum','training_provenance_checksum'].map(k => [k, e[k]])) };
  e.model_build_receipt_checksum = hash(e.public_model_build_receipt);
  return e;
}
function envelope(operation, payload, feature = 'holdem-public-hist215-v3', principal = 'COMPACTOR') {
  return { contract: V31_INGRESS_PROTOCOL, principal, operation, provenance: provenance(feature), payload };
}
const registration = (cell_contract = 'v3', dataset_id = DATASET_ID, dataset_key = KEY) => ({
  contract: V31_REGISTRATION_CELL_CONTRACT_PROTOCOL, dataset_key, dataset_id, cell_contract });
const workerContract = (feature = 'holdem-public-hist215-v3') => ({
  contract: 'smarter-poker.gto-v31-worker-contract.v1', ...provenance(feature), dataset_id: DATASET_ID,
  state: 'building', input_approval_status: 'approved', declared_cells: 4 });

test('line class and context shape follow the v3 grammar, street by street', () => {
  assert.equal(v31LineClassValidV3('', 'flop'), true);
  assert.equal(v31LineClassValidV3('x.b-mid.c/', 'turn'), true);
  assert.equal(v31LineClassValidV3('x.b-big.c/x.b-small.r-mid.c/', 'river'), true);
  for (const [line, street] of [['x', 'turn'], ['x/x', 'flop'], ['b-huge', 'flop'], ['x..c', 'flop'], ['x/x/x/x', 'river'], [null, 'flop'], ['', 'preflop']])
    assert.equal(v31LineClassValidV3(line, street), false, `${line} ${street}`);
  assert.equal(v31ContextCellContract(v2Context()), 'v2');
  assert.equal(v31ContextCellContract(v3Context()), 'v3');
  assert.equal(v31ContextCellContract({ ...v3Context(), cell_contract: 'v4' }), null);
  assert.equal(v31ContextCellContract({ ...v3Context(), line_class: 'x' }), null, 'a flop line on the turn');
  assert.equal(v31ContextCellContract({ ...v2Context(), line_class: 'x/x' }), null, 'a v2 context with a line');
  assert.equal(v31ContextCellContract({ ...v3Context(), extra: 1 }), null);
  assert.equal(v31ContextCellContract(null), null);
});

test('default (v2) admission is unchanged: hist215-v3 and v3 cells are refused without the v3 mode', () => {
  assert.equal(v31FeatureContractVersion({ feature_contract_version: 'holdem-public-hist215-v3' }), null);
  assert.equal(v31FeatureContractVersionV3({ feature_contract_version: 'holdem-public-hist215-v3' }), 'holdem-public-hist215-v3');
  assert.equal(v31FeatureContractVersionV3({ feature_contract_version: 'holdem-public-hist215-v9' }), null);
  const v3 = envelope('build_cell', {});
  assert.equal(v31IngressEnvelopeIsValid(v3, 'COMPACTOR'), false);
  assert.equal(v31IngressEnvelopeIsValid(v3, 'COMPACTOR', 'v3'), true);
  assert.equal(v31IngressEnvelopeIsValid(v3, 'M1', 'v3'), false, 'principal rules still apply');
  const noV4 = structuredClone(v3); delete noV4.provenance.policy_export_schema;
  assert.equal(v31IngressEnvelopeIsValid(noV4, 'COMPACTOR', 'v3'), false);
  // Every v2 envelope answers the same in both modes.
  for (const feature of [null, 'rank-suit-count-v1', 'holdem-board-relative-v2', 'holdem-public-hist215-v1', 'holdem-public-hist215-v2', 'holdem-public-hist215-v9'])
    for (const operation of ['dataset_contract', 'build_cell', 'prepare_model', 'freeze_model', 'ingest_artifact'])
      for (const principal of ['M1', 'M2', 'COMPACTOR']) {
        const e = envelope(operation, {}, feature, principal);
        assert.equal(v31IngressEnvelopeIsValid(e, principal, 'v3'), v31IngressEnvelopeIsValid(e, principal), `${feature} ${operation} ${principal}`);
      }
  const built = buildEnvelope(v3Context());
  assert.equal(v31Public215BuildEnvelopeIsValid(built, DATASET_ID), false);
  assert.equal(v31Public215BuildEnvelopeIsValid(built, DATASET_ID, true, 'v3'), true);
  assert.equal(v31Public215BuildEnvelopeIsValid(buildEnvelope(v3Context(), V1_SCHEMA), DATASET_ID, true, 'v3'), false, 'v3 cell with a v1 descriptor');
  assert.equal(v31Public215BuildEnvelopeIsValid(buildEnvelope(v2Context(), V31_PUBLIC215_FEATURE_SCHEMA_V3), DATASET_ID, true, 'v3'), false, 'v2 cell in v3 mode');
  assert.equal(v31Public215BuildEnvelopeIsValid(buildEnvelope(v2Context(), V1_SCHEMA), DATASET_ID), true, 'v2 unchanged');
  assert.equal(v31Public215BuildEnvelopeIsValid(buildEnvelope(v3Context('x'), V31_PUBLIC215_FEATURE_SCHEMA_V3), DATASET_ID, true, 'v3'), false, 'bad line');
  const freeze = (b) => ({ context: b.context, model_checksum: b.model_checksum, public_model_build_receipt: b.public_model_build_receipt, model_build_receipt_checksum: b.model_build_receipt_checksum });
  assert.equal(v31Public215FreezeEnvelopeIsValid(freeze(built), DATASET_ID), false);
  assert.equal(v31Public215FreezeEnvelopeIsValid(freeze(built), DATASET_ID, 'v3'), true);
  assert.equal(v31Public215FreezeEnvelopeIsValid(freeze(buildEnvelope(v2Context(), V1_SCHEMA)), DATASET_ID), true);
  assert.equal(v31Public215FreezeEnvelopeIsValid(freeze(buildEnvelope(v2Context(), V1_SCHEMA)), DATASET_ID, 'v3'), false);
});

test('only an exact registration reply for this key can say v3', () => {
  assert.equal(v31RegistrationCellContract(registration(), KEY), 'v3');
  assert.equal(v31RegistrationCellContract(registration('v2'), KEY), 'v2');
  assert.equal(v31RegistrationCellContract(registration('v3', null), KEY), 'v3');
  for (const bad of [null, [], 'v3', registration('v4'), registration('v3', DATASET_ID, 'other.key'),
    { ...registration(), extra: true }, { ...registration(), contract: 'x' }, registration('v3', 'not-a-uuid')])
    assert.equal(v31RegistrationCellContract(bad, KEY), null, JSON.stringify(bad));
});

// ---- The real route, with only external imports replaced -----------------
function loadRoute(supabase) {
  const source = ROUTE.replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export const config', 'const config')
    .replace('export default async function handler', 'async function handler');
  return new Function('auth', 'applyRateLimit', 'createClient', 'TextDecoder',
    'const {' + Object.keys(ingressAuth).join(',') + '} = auth;\n' + source + '\nreturn {handler, dispatch, dispatchV3};')(
    ingressAuth, () => true, () => supabase, globalThis.TextDecoder);
}
function fakeDb(answers) {
  const calls = [];
  return { calls, rpc(name, args) {
    calls.push(name);
    const answer = answers[name];
    return { abortSignal: async () => (answer instanceof Error
      ? { data: null, error: { message: answer.message, code: 'PGRST202' }, status: 404 }
      : { data: typeof answer === 'function' ? answer(args) : answer ?? null, error: null, status: 200 }) };
  } };
}
async function call(env, answers) {
  const secret = HEX('7');
  process.env.HORSE_SOLVER_V31_COMPACTOR_HMAC_SECRET = secret;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  const db = fakeDb(answers);
  const { handler } = loadRoute(db);
  const rawBody = Buffer.from(JSON.stringify(env));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = '22222222-2222-4222-8222-222222222222';
  const bodySha256 = v31IngressBodySha256(rawBody);
  const signature = signV31IngressRequest({ principal: env.principal, timestamp, nonce, bodySha256, secret: Buffer.from(secret, 'hex') });
  const out = {};
  const res = { setHeader() {}, status(code) { out.status = code; return this; }, json(body) { out.body = body; return this; } };
  const origError = console.error; console.error = () => {};
  try {
    await handler({ method: 'POST', body: rawBody, headers: { 'content-type': 'application/json',
      'x-sp-v31-principal': env.principal, 'x-sp-v31-timestamp': timestamp, 'x-sp-v31-nonce': nonce,
      'x-sp-v31-content-sha256': bodySha256, 'x-sp-v31-signature': signature } }, res);
  } finally { console.error = origError; }
  return { ...out, calls: db.calls };
}
const TODAY = { status: 400, body: { success: false, error: 'V31 gateway envelope is invalid' } };
const buildV3 = () => envelope('build_cell', { dataset_id: DATASET_ID, context: buildEnvelope(v3Context()) });

test('no v3 registration: a v3 build is refused exactly as today, before any write', async () => {
  for (const answer of [undefined, registration('v2'), new Error('function not installed'), { nonsense: true },
    registration('v3', DATASET_ID, 'other.key'), registration('v4')]) {
    const out = await call(buildV3(), { fn_gto_v31_registration_cell_contract: answer });
    assert.deepEqual({ status: out.status, body: out.body }, TODAY, JSON.stringify(answer));
    assert.deepEqual(out.calls, ['fn_gto_v31_registration_cell_contract'], 'one read, no nonce claim, no write');
  }
  // An unknown contract never even reads the registration.
  const unknown = await call(envelope('build_cell', {}, 'holdem-public-hist215-v9'), {});
  assert.deepEqual({ status: unknown.status, body: unknown.body }, TODAY);
  assert.deepEqual(unknown.calls, []);
});

test('a linked v3 registration admits a v3 cell build and nothing broader', async () => {
  const ok = await call(buildV3(), { fn_gto_v31_registration_cell_contract: registration(),
    fn_gto_v31_worker_contract: workerContract(), fn_solver_ingress_claim: true, fn_gto_v31_build_cell: HEX('9') });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.result, { cell_key_checksum: HEX('9') });
  assert.deepEqual(ok.calls, ['fn_gto_v31_registration_cell_contract', 'fn_solver_ingress_claim',
    'fn_gto_v31_worker_contract', 'fn_gto_v31_registration_cell_contract', 'fn_gto_v31_build_cell']);
  const base = { fn_gto_v31_registration_cell_contract: registration(), fn_gto_v31_worker_contract: workerContract(),
    fn_solver_ingress_claim: true, fn_gto_v31_build_cell: HEX('9') };
  const refusals = [
    ['registration linked to another dataset', buildV3(), { ...base, fn_gto_v31_registration_cell_contract: registration('v3', '33333333-3333-4333-8333-333333333333') }],
    ['registration not yet linked', buildV3(), { ...base, fn_gto_v31_registration_cell_contract: registration('v3', null) }],
    ['dataset is not hist215-v3', buildV3(), { ...base, fn_gto_v31_worker_contract: workerContract('holdem-public-hist215-v2') }],
    ['dataset not building', buildV3(), { ...base, fn_gto_v31_worker_contract: { ...workerContract(), state: 'evaluating' } }],
    ['a v2 cell under v3', envelope('build_cell', { dataset_id: DATASET_ID, context: buildEnvelope(v2Context(), V31_PUBLIC215_FEATURE_SCHEMA_V3) }), base],
    ['a malformed line', envelope('build_cell', { dataset_id: DATASET_ID, context: buildEnvelope(v3Context('x')) }), base],
    ['ingest is not admitted', envelope('ingest_artifact', { dataset_id: DATASET_ID }), base],
    ['seal is not admitted', envelope('seal_dataset', { dataset_id: DATASET_ID }), base],
    ['physics freeze is not admitted', envelope('freeze_model', { dataset_id: DATASET_ID, physics_board: 'KsQd7c' }), base],
  ];
  for (const [label, env, answers] of refusals) {
    const out = await call(env, answers);
    assert.ok(out.status === 409 || (label === 'ingest is not admitted' && out.status === 400), `${label}: ${out.status}`);
    assert.equal(out.body.success, false, label);
    assert.equal(out.calls.includes('fn_gto_v31_build_cell'), false, label);
  }
});

test('every v2 envelope keeps the old path and never reads the registration', async () => {
  for (const feature of [null, 'holdem-board-relative-v2', 'holdem-public-hist215-v1', 'holdem-public-hist215-v2']) {
    const out = await call(envelope('dataset_contract', {}, feature), {
      fn_solver_ingress_claim: true, fn_gto_v31_worker_contract: workerContract(feature) });
    assert.equal(out.status, 200, feature);
    assert.deepEqual(out.calls, ['fn_solver_ingress_claim', 'fn_gto_v31_worker_contract'], feature);
  }
  // A v3-shaped context on a hist215-v1 dataset is refused by the old path, as before.
  const v1 = await call(envelope('build_cell', { dataset_id: DATASET_ID, context: buildEnvelope(v3Context(), V1_SCHEMA) }, 'holdem-public-hist215-v1'),
    { fn_solver_ingress_claim: true, fn_gto_v31_worker_contract: workerContract('holdem-public-hist215-v1') });
  assert.deepEqual({ status: v1.status, body: v1.body }, { status: 409, body: { success: false, error: 'Compact-cell representation envelope is invalid' } });
  assert.equal(v1.calls.includes('fn_gto_v31_registration_cell_contract'), false);
});
