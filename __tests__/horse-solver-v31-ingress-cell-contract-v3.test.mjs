// V31 cell contract v3 at the solver gateway (FLOP-5 D6, dormant).
// Proves: (1) with no v3 registration every request, of every operation, is
// answered exactly as before (same status, same message, no nonce claim, no
// write); (2) a v3 cell is admitted only for a hist215-v3 dataset whose round
// registration declares cell contract v3 and is linked to it; (3) under such a
// registration the seal operations (model freeze authority, the approved and
// held-out physics audits, the preseal cell phases, the seal itself), the
// worker ingest and heartbeats, the dataset registration and the status reads
// are admitted with the v2 rules of the same operation, and refused when the
// registration is linked elsewhere; (4) every v2 envelope takes the old path
// and never reads the registration.
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
  v31Public215PhysicsPayloadIsValid, v31Public215HeldoutPhysicsPayloadIsValid,
  v31Public215ApprovedPhysicsPreparation, v31Public215FrozenHeldoutPreparation, V31_INGRESS_OPERATIONS,
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
  state: 'building', input_approval_status: 'approved', declared_cells: 4, machine_ids: ['M1', 'M2'] });

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
  const calls = [], args = [];
  return { calls, args, rpc(name, callArgs) {
    calls.push(name); args.push(callArgs);
    const answer = answers[name];
    return { abortSignal: async () => (answer instanceof Error
      ? { data: null, error: { message: answer.message, code: 'PGRST202' }, status: 404 }
      : { data: typeof answer === 'function' ? answer(callArgs) : answer ?? null, error: null, status: 200 }) };
  } };
}
async function call(env, answers, { unset = [] } = {}) {
  // One distinct secret per principal (the gateway refuses a shared key).
  const secrets = { M1: HEX('5'), M2: HEX('6'), COMPACTOR: HEX('7') };
  for (const [principal, value] of Object.entries(secrets)) process.env[`HORSE_SOLVER_V31_${principal}_HMAC_SECRET`] = value;
  const secret = secrets[env.principal];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  for (const name of unset) delete process.env[name];
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
  return { ...out, calls: db.calls, args: db.args };
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

test('a linked v3 registration admits a v3 cell build, and refuses a mismatched one', async () => {
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
    ['a compactor cannot ingest', envelope('ingest_artifact', { dataset_id: DATASET_ID }), base],
  ];
  for (const [label, env, answers] of refusals) {
    const out = await call(env, answers);
    assert.ok(out.status === 409 || (label === 'a compactor cannot ingest' && out.status === 400), `${label}: ${out.status}`);
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

// ---- The seal operations, the worker ingest and the registration under v3 ----
const SEAL_ANSWERS = () => ({ fn_gto_v31_registration_cell_contract: registration(), fn_solver_ingress_claim: true,
  fn_gto_v31_worker_contract: workerContract() });
function physicsFixtureV3() {
  const context = v3Context();
  const protocol = { format: 'public_hist215_runtime_parity_protocol_v1', contexts: [{ context, cases: [
    { board: 'KsQd7c2h', own: ['2c', '2d'] }, { board: 'Ks9d5c3h', own: ['2c', '2d'] }] }] };
  const descriptor = { format: 'fixture-encoder' };
  const t = { input_bundle_checksum: HEX('2'), runtime_parity_protocol_checksum: hash(protocol),
    encoder_checksum: hash(descriptor), physics_checksum: HEX('3'), dependency_lock_checksum: HEX('4'),
    producer_commit: 'b'.repeat(40), producer_bundle_checksum: HEX('c') };
  const template = { format: 'public_hist215_template_v1', context };
  const row = { dataset_id: DATASET_ID, cell_key_checksum: HEX('5'), context, policy_representation: 'public_hist215_v1',
    status: 'prepared', public_template: template, template_checksum: hash(template),
    feature_schema_checksum: V31_PUBLIC215_FEATURE_SCHEMA_V3, public_training_provenance: t,
    training_provenance_checksum: hash(t), runtime_parity_protocol: protocol, encoder_descriptor: descriptor };
  row.public_model = { template_sha256: row.template_checksum, feature_schema_sha256: row.feature_schema_checksum,
    provenance_sha256: row.training_provenance_checksum };
  row.model_checksum = hash(row.public_model);
  const receipt = { format: 'public_hist215_build_receipt_v1', dataset_id: DATASET_ID, input_bundle_checksum: HEX('2'),
    ...Object.fromEntries(['model_checksum','template_checksum','feature_schema_checksum','training_provenance_checksum'].map(k => [k, row[k]])),
    ...Object.fromEntries(['encoder_checksum','physics_checksum','dependency_lock_checksum','producer_commit','producer_bundle_checksum'].map(k => [k, t[k]])),
    cases: structuredClone(protocol.contexts[0].cases) };
  const freeze = { context, model_checksum: row.model_checksum, public_model_build_receipt: receipt,
    model_build_receipt_checksum: hash(receipt) };
  return { row, contract: workerContract(), payload: { dataset_id: DATASET_ID, context: freeze, physics_board: 'KsQd7c2h', preparation_offset: 0 } };
}
function heldoutFixtureV3() {
  const f = physicsFixtureV3(), p = f.row, freeze = f.payload.context;
  p.status = 'frozen';
  p.public_training_provenance.capture_receipt_checksum = HEX('8');
  p.training_provenance_checksum = hash(p.public_training_provenance);
  p.public_model.provenance_sha256 = p.training_provenance_checksum;
  p.model_checksum = hash(p.public_model);
  freeze.model_checksum = p.model_checksum;
  for (const key of ['model_checksum', 'training_provenance_checksum']) freeze.public_model_build_receipt[key] = p[key];
  freeze.model_build_receipt_checksum = hash(freeze.public_model_build_receipt);
  p.public_model_build_receipt = structuredClone(freeze.public_model_build_receipt);
  p.model_build_receipt_checksum = freeze.model_build_receipt_checksum;
  delete f.payload.physics_board;
  f.payload.heldout_board_offset = 3;
  f.receipt = { format: 'public215_heldout_physics_v1', dataset_id: DATASET_ID, context: p.context,
    cell_key_checksum: p.cell_key_checksum, model_checksum: p.model_checksum, template_checksum: p.template_checksum,
    model_build_receipt_checksum: p.model_build_receipt_checksum, board: 'AcKd2h3s', board_offset: 3,
    selection_receipt_checksum: HEX('9'), capture_receipt_checksum: HEX('8'), node_checksum: HEX('a'),
    artifact_checksum: HEX('b'), audit_key: HEX('c') };
  return f;
}
function presealPayload(phase = 'prepare_cell', offset = 3) {
  return { dataset_id: DATASET_ID, phase, preparation_offset: offset, cell_key_checksum: HEX('5'),
    model_checksum: HEX('6'), template_checksum: HEX('7'), training_provenance_checksum: HEX('8'),
    model_build_receipt_checksum: HEX('9') };
}
const presealReply = (payload, status = 'prepared') => ({ format: 'public215_preseal_cell_v1', ...payload, phase: undefined,
  receipt_checksum: status === 'missing' ? null : HEX('a'), qualification_fingerprint: HEX('b'), status });
const PREFIX = ['fn_gto_v31_registration_cell_contract', 'fn_solver_ingress_claim', 'fn_gto_v31_worker_contract',
  'fn_gto_v31_registration_cell_contract'];

test('default (v2) physics admission is unchanged; the v3 mode needs a hist215-v3 dataset and a v3 cell', () => {
  const f = physicsFixtureV3(), h = heldoutFixtureV3();
  assert.equal(v31Public215PhysicsPayloadIsValid(f.payload, f.contract), false, 'default refuses a hist215-v3 dataset');
  assert.equal(v31Public215PhysicsPayloadIsValid(f.payload, f.contract, 'v3'), true);
  assert.equal(v31Public215HeldoutPhysicsPayloadIsValid(h.payload, h.contract), false);
  assert.equal(v31Public215HeldoutPhysicsPayloadIsValid(h.payload, h.contract, 'v3'), true);
  assert.equal(v31Public215ApprovedPhysicsPreparation(f.payload, f.contract, [f.row]), null);
  assert.deepEqual(v31Public215ApprovedPhysicsPreparation(f.payload, f.contract, [f.row], 'v3'),
    { cell_key_checksum: HEX('5'), model_checksum: f.row.model_checksum, template_checksum: f.row.template_checksum });
  assert.equal(v31Public215FrozenHeldoutPreparation(h.payload, h.contract, [h.row]), null);
  assert.equal(v31Public215FrozenHeldoutPreparation(h.payload, h.contract, [h.row], 'v3').capture_receipt_checksum, HEX('8'));
  for (const feature of ['holdem-public-hist215-v1', 'holdem-public-hist215-v2']) {
    const c = workerContract(feature);
    assert.equal(v31Public215PhysicsPayloadIsValid(f.payload, c, 'v3'), false, `v3 mode on ${feature}`);
    assert.equal(v31Public215HeldoutPhysicsPayloadIsValid(h.payload, c, 'v3'), false, `v3 mode on ${feature}`);
  }
  const v2freeze = buildEnvelope(v2Context(), V31_PUBLIC215_FEATURE_SCHEMA_V3);
  const v2payload = { ...f.payload, context: { context: v2freeze.context, model_checksum: v2freeze.model_checksum,
    public_model_build_receipt: v2freeze.public_model_build_receipt, model_build_receipt_checksum: v2freeze.model_build_receipt_checksum } };
  assert.equal(v31Public215PhysicsPayloadIsValid(v2payload, f.contract, 'v3'), false, 'a v2 cell under v3');
});

test('no v3 registration: every v3 operation is refused exactly as today, before any write', async () => {
  const principals = (op) => ['dataset_contract'].includes(op) ? ['M1', 'M2', 'COMPACTOR']
    : ['worker_heartbeat', 'ingest_artifact'].includes(op) ? ['M1', 'M2']
      : op === 'model_freeze_authority' ? ['M2', 'COMPACTOR'] : ['COMPACTOR'];
  const payloads = { freeze_model: [{}, physicsFixtureV3().payload, heldoutFixtureV3().payload],
    seal_dataset: [{ dataset_id: DATASET_ID }, presealPayload()] };
  let checked = 0;
  for (const operation of V31_INGRESS_OPERATIONS)
    for (const principal of principals(operation))
      for (const payload of payloads[operation] || [{ dataset_id: DATASET_ID }])
        for (const answer of [undefined, registration('v2'), new Error('function not installed'), registration('v3', DATASET_ID, 'other.key')]) {
          const out = await call(envelope(operation, payload, 'holdem-public-hist215-v3', principal), { ...SEAL_ANSWERS(),
            fn_gto_v31_registration_cell_contract: answer });
          assert.deepEqual({ status: out.status, body: out.body }, TODAY, `${operation} ${principal} ${JSON.stringify(answer)}`);
          assert.deepEqual(out.calls, ['fn_gto_v31_registration_cell_contract'], `${operation}: one read, no nonce claim, no write`);
          checked++;
        }
  assert.equal(checked, 4 * (3 + 2 + 2 + 1 + 1 + 1 + 3 + 2 + 2 + 1 + 1));
});

test('a linked v3 registration admits the approved and held-out physics audits with the v2 rules', async () => {
  const f = physicsFixtureV3();
  const ok = await call(envelope('freeze_model', f.payload), { ...SEAL_ANSWERS(),
    fn_gto_v31_model_preparations: [f.row], fn_gto_v31_prepare_public_physics: HEX('6') });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.calls, [...PREFIX, 'fn_gto_v31_model_preparations', 'fn_gto_v31_prepare_public_physics']);
  assert.deepEqual(ok.args.at(-1), { p_dataset_id: DATASET_ID, p_cell_key_checksum: HEX('5'), p_board: ['Ks', 'Qd', '7c', '2h'] });
  assert.deepEqual(ok.body.result, { format: 'public215_prepared_physics_v1', dataset_id: DATASET_ID, context: f.row.context,
    cell_key_checksum: HEX('5'), model_checksum: f.row.model_checksum, template_checksum: f.row.template_checksum,
    board: 'KsQd7c2h', audit_key: HEX('6') });
  const h = heldoutFixtureV3();
  const held = await call(envelope('freeze_model', h.payload), { ...SEAL_ANSWERS(),
    fn_gto_v31_model_preparations: [h.row], fn_gto_v31_prepare_heldout_public_physics: h.receipt });
  assert.equal(held.status, 200, JSON.stringify(held.body));
  assert.deepEqual(held.calls, [...PREFIX, 'fn_gto_v31_model_preparations', 'fn_gto_v31_prepare_heldout_public_physics']);
  assert.deepEqual(held.args.at(-1), { p_dataset_id: DATASET_ID, p_cell_key_checksum: HEX('5'), p_model_checksum: h.row.model_checksum,
    p_model_build_receipt_checksum: h.row.model_build_receipt_checksum, p_board_offset: 3 });
  assert.deepEqual(held.body.result, h.receipt);
  const other = registration('v3', '33333333-3333-4333-8333-333333333333');
  for (const [label, env, answers, audit] of [
    ['registration linked elsewhere', envelope('freeze_model', f.payload), { fn_gto_v31_registration_cell_contract: (a) => other }, 'fn_gto_v31_prepare_public_physics'],
    ['a v2 cell freeze', envelope('freeze_model', { ...f.payload, context: { ...f.payload.context, context: v2Context() } }), {}, 'fn_gto_v31_prepare_public_physics'],
    ['a foreign board', envelope('freeze_model', { ...f.payload, physics_board: 'AcKd2h3s' }), {}, 'fn_gto_v31_prepare_public_physics'],
    ['an offset past the declared cells', envelope('freeze_model', { ...f.payload, preparation_offset: 4 }), {}, 'fn_gto_v31_prepare_public_physics'],
    ['a prepared row for the held-out audit', envelope('freeze_model', h.payload), { fn_gto_v31_model_preparations: [{ ...h.row, status: 'prepared' }] }, 'fn_gto_v31_prepare_heldout_public_physics'],
    ['a held-out offset of 8', envelope('freeze_model', { ...h.payload, heldout_board_offset: 8 }), {}, 'fn_gto_v31_prepare_heldout_public_physics'],
    ['a dataset that is not hist215-v3', envelope('freeze_model', f.payload), { fn_gto_v31_worker_contract: workerContract('holdem-public-hist215-v2') }, 'fn_gto_v31_prepare_public_physics'],
  ]) {
    const out = await call(env, { ...SEAL_ANSWERS(), fn_gto_v31_model_preparations: [f.row], fn_gto_v31_prepare_public_physics: HEX('6'),
      fn_gto_v31_prepare_heldout_public_physics: h.receipt, ...answers });
    if (label === 'registration linked elsewhere') {
      // The handler's pre-claim read sees v3 for this key; the dispatch then finds it linked to another dataset.
      assert.equal(out.status, 409, label);
      assert.equal(out.body.error, 'No cell contract v3 registration is linked to this dataset', label);
    } else {
      assert.equal(out.status, 409, `${label}: ${out.status} ${JSON.stringify(out.body)}`);
    }
    assert.equal(out.calls.includes(audit), false, label);
  }
  for (const audit of [null, '0'.repeat(64), {}]) {
    const out = await call(envelope('freeze_model', f.payload), { ...SEAL_ANSWERS(), fn_gto_v31_model_preparations: [f.row],
      fn_gto_v31_prepare_public_physics: audit });
    assert.equal(out.status, 503, JSON.stringify(audit));
  }
});

test('a linked v3 registration admits the preseal cell phases and the seal itself', async () => {
  for (const [phase, rpcName, statuses] of [['prepare_cell', 'fn_gto_v31_prepare_seal_cell', ['prepared']],
    ['preparation_status', 'fn_gto_v31_seal_cell_preparation_status', ['prepared', 'missing', 'stale']]]) {
    for (const status of statuses) {
      const payload = presealPayload(phase);
      const reply = presealReply(payload, status); delete reply.phase;
      const out = await call(envelope('seal_dataset', payload), { ...SEAL_ANSWERS(), [rpcName]: reply });
      assert.equal(out.status, 200, `${phase} ${status} ${JSON.stringify(out.body)}`);
      assert.deepEqual(out.calls, [...PREFIX, rpcName]);
      assert.deepEqual(out.args.at(-1), { p_dataset_id: DATASET_ID, p_cell_key_checksum: HEX('5') });
      assert.deepEqual(out.body.result, reply);
    }
  }
  for (const [label, payload, answers] of [
    ['offset past the declared cells', presealPayload('prepare_cell', 4), {}],
    ['negative offset', presealPayload('prepare_cell', -1), {}],
    ['unknown phase', presealPayload('seal_now'), {}],
    ['zero checksum', { ...presealPayload(), model_checksum: '0'.repeat(64) }, {}],
    ['not building', presealPayload(), { fn_gto_v31_worker_contract: { ...workerContract(), state: 'evaluating' } }],
    ['registration linked elsewhere', presealPayload(), { fn_gto_v31_registration_cell_contract: registration('v3', '33333333-3333-4333-8333-333333333333') }],
  ]) {
    const out = await call(envelope('seal_dataset', payload), { ...SEAL_ANSWERS(), ...answers,
      fn_gto_v31_prepare_seal_cell: presealReply(payload) });
    assert.equal(out.status, 409, label);
    assert.equal(out.calls.includes('fn_gto_v31_prepare_seal_cell'), false, label);
  }
  const differs = await call(envelope('seal_dataset', presealPayload()), { ...SEAL_ANSWERS(),
    fn_gto_v31_prepare_seal_cell: { ...presealReply(presealPayload()), phase: undefined, status: 'stale' } });
  assert.deepEqual({ status: differs.status, error: differs.body.error }, { status: 409, error: 'Preseal cell receipt differs' });

  const sealed = await call(envelope('seal_dataset', { dataset_id: DATASET_ID }), { ...SEAL_ANSWERS(), fn_gto_v31_seal_build: HEX('d') });
  assert.equal(sealed.status, 200, JSON.stringify(sealed.body));
  assert.deepEqual(sealed.calls, [...PREFIX, 'fn_gto_v31_seal_build']);
  assert.deepEqual(sealed.body.result, { dataset_checksum: HEX('d'), idempotent: false });
  const again = await call(envelope('seal_dataset', { dataset_id: DATASET_ID }), { ...SEAL_ANSWERS(),
    fn_gto_v31_worker_contract: { ...workerContract(), state: 'evaluating', dataset_checksum: HEX('d') } });
  assert.deepEqual(again.body.result, { dataset_checksum: HEX('d'), idempotent: true });
  assert.deepEqual(again.calls, PREFIX);
  const elsewhere = await call(envelope('seal_dataset', { dataset_id: DATASET_ID }), { ...SEAL_ANSWERS(),
    fn_gto_v31_registration_cell_contract: registration('v3', null), fn_gto_v31_seal_build: HEX('d') });
  assert.equal(elsewhere.status, 409);
  assert.equal(elsewhere.calls.includes('fn_gto_v31_seal_build'), false, 'an unlinked registration never seals');
});

test('a linked v3 registration admits model freeze authority, the worker ingest and heartbeats, and the status reads', async () => {
  for (const principal of ['M2', 'COMPACTOR']) {
    const out = await call(envelope('model_freeze_authority', { dataset_id: DATASET_ID }, undefined, principal),
      { ...SEAL_ANSWERS(), fn_gto_v31_model_freeze_authority: { authority: 'fixture' } });
    assert.equal(out.status, 200, `${principal} ${JSON.stringify(out.body)}`);
    assert.deepEqual(out.calls, [...PREFIX, 'fn_gto_v31_model_freeze_authority']);
  }
  const artifact = { id: '44444444-4444-4444-8444-444444444444', stack_depth: 200 };
  const m1 = await call(envelope('ingest_artifact', { dataset_id: DATASET_ID, artifact }, undefined, 'M1'),
    { ...SEAL_ANSWERS(), fn_gto_v31_ingest_source_artifact: { source_row_id: artifact.id } });
  assert.equal(m1.status, 200, JSON.stringify(m1.body));
  assert.deepEqual(m1.calls, [...PREFIX, 'fn_gto_v31_ingest_source_artifact']);
  assert.deepEqual(m1.args.at(-1), { p_dataset_id: DATASET_ID, p_machine_id: 'M1', p_artifact: artifact });
  const m2 = await call(envelope('ingest_artifact', { dataset_id: DATASET_ID, artifact: { ...artifact, selection_seed: HEX('e') } }, undefined, 'M2'),
    { ...SEAL_ANSWERS(), fn_gto_v31_ingest_source_artifact: { source_row_id: artifact.id } });
  assert.equal(m2.status, 200, JSON.stringify(m2.body));
  for (const [label, principal, art] of [['M2 without the opening', 'M2', artifact], ['M1 with an opening', 'M1', { ...artifact, selection_seed: HEX('e') }]]) {
    const out = await call(envelope('ingest_artifact', { dataset_id: DATASET_ID, artifact: art }, undefined, principal),
      { ...SEAL_ANSWERS(), fn_gto_v31_ingest_source_artifact: {} });
    assert.deepEqual({ status: out.status, error: out.body.error }, { status: 409, error: 'Artifact selection authority is invalid' }, label);
    assert.equal(out.calls.includes('fn_gto_v31_ingest_source_artifact'), false, label);
  }
  const unlinked = await call(envelope('ingest_artifact', { dataset_id: DATASET_ID, artifact }, undefined, 'M1'),
    { ...SEAL_ANSWERS(), fn_gto_v31_registration_cell_contract: registration('v3', null), fn_gto_v31_ingest_source_artifact: {} });
  assert.equal(unlinked.status, 409);
  assert.equal(unlinked.calls.includes('fn_gto_v31_ingest_source_artifact'), false);
  const heartbeat = { run_id: DATASET_ID, sequence: 1, phase_id: 'p', state: 's', rows_planned: 1, rows_done: 0, rows_written: 0,
    invalid_rows: 0, last_artifact_id: null, last_artifact_checksum: null, error_detail: null };
  const beat = await call(envelope('worker_heartbeat', heartbeat, undefined, 'M1'), { ...SEAL_ANSWERS(), fn_solver_worker_heartbeat: true });
  assert.equal(beat.status, 200, JSON.stringify(beat.body));
  assert.equal(beat.args.at(-1).p_heartbeat.machine_id, 'M1');
  const compact = { run_id: DATASET_ID, sequence: 1, state: 's', source_rows: 0, receipt_rows: 0, cells: 0, invalid_rows: 0,
    source_max_at: null, compacted_through: null, dataset_checksum: null, error_detail: null };
  const cbeat = await call(envelope('compact_heartbeat', compact), { ...SEAL_ANSWERS(), fn_solver_compact_heartbeat: true });
  assert.equal(cbeat.status, 200, JSON.stringify(cbeat.body));
  assert.equal(cbeat.args.at(-1).p_heartbeat.dataset_key, KEY);
  const status = await call(envelope('certification_status', { dataset_id: DATASET_ID }), { ...SEAL_ANSWERS(), ca_gto_v31_certification_status: { ok: true } });
  assert.deepEqual(status.body.result, { ok: true });
  assert.deepEqual(status.calls, [...PREFIX, 'ca_gto_v31_certification_status']);
});

test('a v3 dataset registers only against a v3 round registration that is not linked to another dataset', async () => {
  const payload = { input_bundle_id: '55555555-5555-4555-8555-555555555555', declared_coverage: [v3Context()], quality_gates: { min: 1 } };
  const fresh = await call(envelope('register_dataset', payload), { fn_gto_v31_registration_cell_contract: registration('v3', null),
    fn_solver_ingress_claim: true, fn_gto_v31_worker_contract: null, fn_gto_v31_register_dataset: DATASET_ID });
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body));
  assert.deepEqual(fresh.body.result, { dataset_id: DATASET_ID, state: 'building', idempotent: false });
  assert.deepEqual(fresh.calls, ['fn_gto_v31_registration_cell_contract', 'fn_solver_ingress_claim', 'fn_gto_v31_worker_contract',
    'fn_gto_v31_registration_cell_contract', 'fn_gto_v31_register_dataset']);
  const sent = fresh.args.at(-1).p_dataset;
  assert.equal(sent.feature_contract_version, 'holdem-public-hist215-v3');
  assert.equal(sent.policy_export_schema, 'smarter-poker.pio-policy.v4');
  assert.deepEqual(sent.declared_coverage, [v3Context()]);
  assert.deepEqual(sent.machine_ids, ['M1', 'M2']);
  const retry = await call(envelope('register_dataset', payload), { ...SEAL_ANSWERS(), fn_gto_v31_register_dataset: 'never' });
  assert.deepEqual(retry.body.result, { dataset_id: DATASET_ID, state: 'building', idempotent: true });
  assert.equal(retry.calls.includes('fn_gto_v31_register_dataset'), false);
  for (const [label, answers] of [
    ['registration already linked to another dataset', { fn_gto_v31_registration_cell_contract: registration('v3', DATASET_ID), fn_gto_v31_worker_contract: null }],
    ['existing dataset of another build', { fn_gto_v31_worker_contract: { ...workerContract(), solver_binary_checksum: HEX('0') } }],
    ['existing dataset not linked', { fn_gto_v31_registration_cell_contract: registration('v3', null) }],
  ]) {
    const out = await call(envelope('register_dataset', payload), { ...SEAL_ANSWERS(), fn_gto_v31_register_dataset: DATASET_ID, ...answers });
    assert.equal(out.status, 409, label);
    assert.equal(out.calls.includes('fn_gto_v31_register_dataset'), false, label);
  }
  const bad = await call(envelope('register_dataset', { ...payload, extra: 1 }), { fn_gto_v31_registration_cell_contract: registration('v3', null),
    fn_solver_ingress_claim: true });
  assert.deepEqual({ status: bad.status, error: bad.body.error }, { status: 400, error: 'Dataset registration payload is invalid' });
});

test('database authority unavailable: a v3-valid envelope still gets main\'s 400, a v2 envelope main\'s 409', async () => {
  // main never reaches the database for an envelope it refuses, so neither may the v3 read
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL']) {
    for (const env of [buildV3(), envelope('seal_dataset', { dataset_id: DATASET_ID }),
      envelope('ingest_artifact', { dataset_id: DATASET_ID, artifact: {} }, undefined, 'M1'),
      envelope('register_dataset', { input_bundle_id: DATASET_ID, declared_coverage: [], quality_gates: {} })]) {
      const out = await call(env, SEAL_ANSWERS(), { unset: [name] });
      assert.deepEqual({ status: out.status, body: out.body }, TODAY, `${name} ${env.operation}`);
      assert.deepEqual(out.calls, [], `${name} ${env.operation}: no database call`);
    }
    const v2 = await call(envelope('dataset_contract', {}, 'holdem-public-hist215-v2'), SEAL_ANSWERS(), { unset: [name] });
    assert.deepEqual({ status: v2.status, body: v2.body },
      { status: 409, body: { success: false, error: 'V31 gateway database authority is unavailable' } }, `${name} v2`);
  }
});
