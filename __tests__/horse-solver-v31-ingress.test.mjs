import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as ingressAuth from '../src/lib/horses/solverV31IngressAuth.mjs';
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
  v31FeatureContractVersion,
  v31PolicyExportSchema,
  v31Public215BuildEnvelopeIsValid,
  v31Public215FreezeEnvelopeIsValid,
} from '../src/lib/horses/solverV31IngressAuth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE = fs.readFileSync(path.join(ROOT, 'pages/api/internal/horse-solver-v31.js'), 'utf8');
const HEX = (char) => char.repeat(64);

test('policy V4 is explicitly signed and declared; omission remains V3', () => {
  const legacy = envelope('COMPACTOR', 'register_dataset');
  assert.equal(v31PolicyExportSchema(legacy.provenance), 'smarter-poker.pio-policy.v3');
  assert.equal(v31IngressEnvelopeIsValid(legacy, 'COMPACTOR'), true);
  const upgraded = {...legacy, provenance: {...legacy.provenance, policy_export_schema: 'smarter-poker.pio-policy.v4'}};
  assert.equal(v31IngressEnvelopeIsValid(upgraded, 'COMPACTOR'), true);
  assert.notEqual(v31IngressBodySha256(Buffer.from(JSON.stringify(upgraded))), v31IngressBodySha256(Buffer.from(JSON.stringify(legacy))));
  for (const invalid of [null, 'smarter-poker.pio-policy.v3', '', 4]) {
    assert.equal(v31IngressEnvelopeIsValid({...legacy, provenance: {...legacy.provenance, policy_export_schema: invalid}}, 'COMPACTOR'), false);
  }
  assert.match(ROUTE, /policy_export_schema: provenance.policy_export_schema/);
  assert.match(ROUTE, /v31PolicyExportSchema\(contract\) !== v31PolicyExportSchema\(provenance\)/);
});

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

test('feature contracts are explicit immutable provenance and omission is legacy only', () => {
  const legacy = envelope('M1', 'dataset_contract');
  assert.equal(v31FeatureContractVersion(legacy.provenance), 'rank-suit-count-v1');
  assert.equal(v31IngressEnvelopeIsValid(legacy, 'M1'), true);
  for (const version of ['rank-suit-count-v1', 'holdem-board-relative-v2']) {
    const versioned = { ...legacy, provenance: { ...legacy.provenance, feature_contract_version: version } };
    assert.equal(v31IngressEnvelopeIsValid(versioned, 'M1'), true);
    assert.notEqual(v31IngressBodySha256(Buffer.from(JSON.stringify(versioned))), v31IngressBodySha256(Buffer.from(JSON.stringify(legacy))));
  }
  for (const version of [null, '', 'future-v3', 2]) {
    const unknown = { ...legacy, provenance: { ...legacy.provenance, feature_contract_version: version } };
    assert.equal(v31IngressEnvelopeIsValid(unknown, 'M1'), false);
  }
  assert.match(ROUTE, /v31FeatureContractVersion\(contract\) !== v31FeatureContractVersion\(provenance\)/);
  assert.match(ROUTE, /feature_contract_version: provenance.feature_contract_version/);
});

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


test('public215 model build transport hashes every separate payload and preserves compactor authority',()=>{
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const hash=v=>createHash('sha256').update(canonical(v),'ascii').digest('hex');
  const context=Object.fromEntries(['street','game_family','objective','utility_context','table_size','pot_type','hero_position','opponent_position','depth_bucket','texture_class','node_role','facing_kind','facing_size_bucket'].map(k=>[k,k==='table_size'?2:k==='depth_bucket'?80:'synthetic']));
  const e={context,policy_representation:'public_hist215_v1',feature_schema_checksum:'0ca054f9bb0463bf6a298a80a29cb4b6d9e6bffcc193e4af9d497e2936ec849f',public_template:{format:'public_hist215_template_v1',context},public_training_provenance:{format:'public_hist215_training_v1'}};
  e.template_checksum=hash(e.public_template);e.training_provenance_checksum=hash(e.public_training_provenance);
  e.public_model={format:'public_hist215_v1',action_ids:['b50','c'],template_sha256:e.template_checksum,feature_schema_sha256:e.feature_schema_checksum,provenance_sha256:e.training_provenance_checksum};e.model_checksum=hash(e.public_model);
  e.public_model_build_receipt={format:'public_hist215_build_receipt_v1',dataset_id:'11111111-1111-4111-8111-111111111111',...Object.fromEntries(['model_checksum','template_checksum','feature_schema_checksum','training_provenance_checksum'].map(k=>[k,e[k]]))};e.model_build_receipt_checksum=hash(e.public_model_build_receipt);
  // Transport agreement only: PostgreSQL still rejects these incomplete synthetic model objects.
  assert.equal(v31Public215BuildEnvelopeIsValid(e,e.public_model_build_receipt.dataset_id),true);
  const prepared=structuredClone(e);delete prepared.public_model_build_receipt;delete prepared.model_build_receipt_checksum;assert.equal(v31Public215BuildEnvelopeIsValid(prepared,e.public_model_build_receipt.dataset_id,false),true);assert.equal(v31Public215BuildEnvelopeIsValid(prepared,e.public_model_build_receipt.dataset_id),false);
  const freeze=Object.fromEntries(['context','model_checksum','public_model_build_receipt','model_build_receipt_checksum'].map(k=>[k,e[k]]));assert.equal(v31Public215FreezeEnvelopeIsValid(freeze,e.public_model_build_receipt.dataset_id),true);assert.equal(v31Public215FreezeEnvelopeIsValid({...freeze,public_model:e.public_model},e.public_model_build_receipt.dataset_id),false);
  for(const change of [e=>e.model_checksum='a'.repeat(64),e=>e.public_model.extra='changed',e=>e.extra=true,e=>e.public_model_build_receipt.dataset_id='wrong',e=>e.public_template.context={...context,street:'changed'},e=>e.public_model_build_receipt.cost=NaN]) {
    const bad=structuredClone(e);change(bad);assert.equal(v31Public215BuildEnvelopeIsValid(bad,e.public_model_build_receipt.dataset_id),false);
  }
  const signed=envelope('COMPACTOR','build_cell');signed.provenance.feature_contract_version='holdem-public-hist215-v1';signed.provenance.policy_export_schema='smarter-poker.pio-policy.v4';assert.equal(v31IngressEnvelopeIsValid(signed,'COMPACTOR'),true);
  assert.equal(v31IngressEnvelopeIsValid({...signed,principal:'M1'},'M1'),false);
  for(const operation of ['prepare_model','freeze_model']){assert.equal(v31IngressEnvelopeIsValid({...signed,operation},'COMPACTOR'),true);assert.equal(v31IngressEnvelopeIsValid({...signed,operation,principal:'M2'},'M2'),false);}
  assert.equal(v31IngressEnvelopeIsValid({...signed,operation:'model_freeze_authority',principal:'M2'},'M2'),true);assert.equal(v31IngressEnvelopeIsValid({...signed,operation:'model_freeze_authority',principal:'M1'},'M1'),false);
  const missingV4=structuredClone(signed);delete missingV4.provenance.policy_export_schema;assert.equal(v31IngressEnvelopeIsValid(missingV4,'COMPACTOR'),false);
});


const physicsCanonical = value => Array.isArray(value)
  ? '[' + value.map(physicsCanonical).join(',') + ']'
  : value && typeof value === 'object'
    ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + physicsCanonical(value[k])).join(',') + '}'
    : JSON.stringify(value);
const physicsHash = value => createHash('sha256').update(physicsCanonical(value), 'ascii').digest('hex');
function physicsFixture() {
  const id = '11111111-1111-4111-8111-111111111111';
  const context = Object.fromEntries(['street','game_family','objective','utility_context','table_size','pot_type','hero_position','opponent_position','depth_bucket','texture_class','node_role','facing_kind','facing_size_bucket'].map(k => [k, k === 'table_size' ? 2 : k === 'depth_bucket' ? 10 : k === 'street' ? 'flop' : 'synthetic']));
  const protocol = {format:'public_hist215_runtime_parity_protocol_v1', contexts:[{context, cases:[
    {board:'KsQd7c', own:['2c','2d']}, {board:'Ks9d5c', own:['2c','2d']},
  ]}]};
  const descriptor = {format:'fixture-encoder'};
  const t = {input_bundle_checksum:HEX('2'), runtime_parity_protocol_checksum:physicsHash(protocol),
    encoder_checksum:physicsHash(descriptor), physics_checksum:HEX('3'), dependency_lock_checksum:HEX('4'),
    producer_commit:'b'.repeat(40), producer_bundle_checksum:HEX('c')};
  const template = {format:'public_hist215_template_v1', context};
  const row = {dataset_id:id, cell_key_checksum:HEX('5'), context, policy_representation:'public_hist215_v1',
    status:'prepared', public_template:template, template_checksum:physicsHash(template),
    feature_schema_checksum:'0ca054f9bb0463bf6a298a80a29cb4b6d9e6bffcc193e4af9d497e2936ec849f',
    public_training_provenance:t, training_provenance_checksum:physicsHash(t),
    runtime_parity_protocol:protocol, encoder_descriptor:descriptor};
  row.public_model = {template_sha256:row.template_checksum, feature_schema_sha256:row.feature_schema_checksum,
    provenance_sha256:row.training_provenance_checksum};
  row.model_checksum = physicsHash(row.public_model);
  const receipt = {format:'public_hist215_build_receipt_v1', dataset_id:id, input_bundle_checksum:HEX('2'),
    ...Object.fromEntries(['model_checksum','template_checksum','feature_schema_checksum','training_provenance_checksum'].map(k => [k,row[k]])),
    ...Object.fromEntries(['encoder_checksum','physics_checksum','dependency_lock_checksum','producer_commit','producer_bundle_checksum'].map(k => [k,t[k]])),
    cases:structuredClone(protocol.contexts[0].cases)};
  const freeze = {context, model_checksum:row.model_checksum, public_model_build_receipt:receipt,
    model_build_receipt_checksum:physicsHash(receipt)};
  const contract = {contract:'smarter-poker.gto-v31-worker-contract.v1', ...provenance(),
    feature_contract_version:'holdem-public-hist215-v1', policy_export_schema:'smarter-poker.pio-policy.v4',
    dataset_id:id, state:'building', declared_cells:107, input_approval_status:'approved'};
  const payload = {dataset_id:id, context:freeze, physics_board:'KsQd7c', preparation_offset:0};
  return {row, contract, payload};
}

// Execute the actual route dispatch with only external module imports replaced.
// Authentication/parser/nonce boundaries remain covered above; no live RPC exists.
function physicsDispatch() {
  const source = ROUTE.replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export const config', 'const config')
    .replace('export default async function handler', 'async function handler');
  return new Function('auth', 'const {' + Object.keys(ingressAuth).join(',') + '} = auth;\n'
    + source + '\nreturn dispatch;')(ingressAuth);
}
async function callPhysicsFixture(fixture, {principal='COMPACTOR', audit=HEX('6'), normal=false} = {}) {
  const calls = [];
  const supabase = {rpc(name,args) {
    calls.push({name,args});
    const data = name === 'fn_gto_v31_worker_contract' ? fixture.contract
      : name === 'fn_gto_v31_model_preparations' ? fixture.rows || [fixture.row]
      : name === 'fn_gto_v31_prepare_public_physics' ? audit
      : name === 'fn_gto_v31_freeze_model' ? fixture.payload.context.model_build_receipt_checksum
      : null;
    return {abortSignal:async () => ({data,error:null,status:200})};
  }};
  const payload = normal ? {dataset_id:fixture.payload.dataset_id, context:fixture.payload.context} : fixture.payload;
  const signedProvenance = Object.fromEntries([...Object.keys(provenance()),'feature_contract_version','policy_export_schema'].map(k => [k,fixture.contract[k]]));
  try {
    const result = await physicsDispatch()(supabase, {principal,operation:'freeze_model',payload,provenance:signedProvenance});
    return {result,calls};
  } catch (error) {return {error,calls};}
}

test('approved physics phase uses authoritative one-row preparation and preserves the exact normal freeze', async () => {
  const f = physicsFixture();
  const actual = await callPhysicsFixture(f);
  assert.equal(actual.error, undefined);
  assert.deepEqual(actual.calls.map(c => c.name), ['fn_gto_v31_worker_contract','fn_gto_v31_model_preparations','fn_gto_v31_prepare_public_physics']);
  assert.deepEqual(actual.calls[1].args, {p_dataset_id:f.contract.dataset_id,p_offset:0,p_limit:1});
  assert.deepEqual(actual.calls[2].args, {p_dataset_id:f.contract.dataset_id,p_cell_key_checksum:f.row.cell_key_checksum,p_board:['Ks','Qd','7c']});
  assert.deepEqual(actual.result, {format:'public215_prepared_physics_v1',dataset_id:f.contract.dataset_id,
    context:f.row.context,cell_key_checksum:f.row.cell_key_checksum,model_checksum:f.row.model_checksum,
    template_checksum:f.row.template_checksum,board:'KsQd7c',audit_key:HEX('6')});
  const normal = await callPhysicsFixture(f,{normal:true});
  assert.equal(normal.result,f.payload.context.model_build_receipt_checksum);
  assert.deepEqual(normal.calls.map(c => c.name),['fn_gto_v31_worker_contract','fn_gto_v31_freeze_model']);
  assert.deepEqual(normal.calls[1].args,{p_dataset_id:f.contract.dataset_id,p_freeze:f.payload.context});
});

test('physics phase refuses authorization, payload and offset faults before physics RPC', async () => {
  for (const principal of ['M1','M2']) {
    const actual = await callPhysicsFixture(physicsFixture(),{principal});
    assert.equal(actual.error.status,403);
    assert.ok(!actual.calls.some(c => c.name === 'fn_gto_v31_prepare_public_physics'));
  }
  for (const mutate of [
    f => f.payload.extra=true, f => delete f.payload.preparation_offset,
    f => f.payload.preparation_offset=-1, f => f.payload.preparation_offset=-0,
    f => f.payload.preparation_offset=0.5, f => f.payload.preparation_offset=107,
    f => f.payload.preparation_offset=Number.MAX_SAFE_INTEGER+1,
    f => f.payload.preparation_offset='0', f => f.payload.dataset_id='foreign',
    f => f.contract.state='candidate', f => f.contract.feature_contract_version='holdem-board-relative-v2',
    f => f.payload.physics_board=['Ks','Qd','7c'], f => f.payload.physics_board='KsKs7c',
    f => f.payload.physics_board='ksQd7c', f => f.payload.physics_board='KsQd',
  ]) {
    const f=physicsFixture();mutate(f);const actual=await callPhysicsFixture(f);
    assert.ok(actual.error);
    assert.ok(!actual.calls.some(c => c.name === 'fn_gto_v31_prepare_public_physics'));
  }
});

test('physics phase refuses forged receipts, foreign boards and changed authoritative bindings', async () => {
  for (const mutate of [
    f => f.rows=[], f => f.rows=[f.row,f.row], f => f.row.status='frozen',
    f => f.row.dataset_id='foreign', f => f.row.context={...f.row.context,street:'river'},
    f => f.row.model_checksum=HEX('7'), f => f.row.template_checksum=HEX('7'),
    f => f.row.cell_key_checksum='0'.repeat(64), f => f.row.public_model.provenance_sha256=HEX('7'),
    f => f.row.runtime_parity_protocol.contexts.push(f.row.runtime_parity_protocol.contexts[0]),
    f => f.row.encoder_descriptor.extra='changed', f => f.payload.physics_board='7cQdKs',
    f => {f.payload.physics_board='AcKd2h';f.payload.context.public_model_build_receipt.cases[0].board='AcKd2h';
      f.payload.context.model_build_receipt_checksum=physicsHash(f.payload.context.public_model_build_receipt);},
    f => {f.payload.context.model_checksum=HEX('7');f.payload.context.public_model_build_receipt.model_checksum=HEX('7');
      f.payload.context.model_build_receipt_checksum=physicsHash(f.payload.context.public_model_build_receipt);},
  ]) {
    const f=physicsFixture();mutate(f);const actual=await callPhysicsFixture(f);
    assert.ok(actual.error);
    assert.ok(!actual.calls.some(c => c.name === 'fn_gto_v31_prepare_public_physics'));
  }
  for (const audit of [null,'0'.repeat(64),'not-an-audit',{}]) {
    const actual=await callPhysicsFixture(physicsFixture(),{audit});
    assert.equal(actual.error.status,503);
  }
});

function heldoutFixture() {
  const f = physicsFixture(), p = f.row, freeze = f.payload.context;
  p.status = 'frozen';
  p.public_training_provenance.capture_receipt_checksum = HEX('8');
  p.training_provenance_checksum = physicsHash(p.public_training_provenance);
  p.public_model.provenance_sha256 = p.training_provenance_checksum;
  p.model_checksum = physicsHash(p.public_model);
  freeze.model_checksum = p.model_checksum;
  for (const key of ['model_checksum','training_provenance_checksum']) {
    freeze.public_model_build_receipt[key] = p[key];
  }
  freeze.model_build_receipt_checksum = physicsHash(freeze.public_model_build_receipt);
  p.public_model_build_receipt = structuredClone(freeze.public_model_build_receipt);
  p.model_build_receipt_checksum = freeze.model_build_receipt_checksum;
  delete f.payload.physics_board;
  f.payload.heldout_board_offset = 0;
  return f;
}
function heldoutReceipt(f) {
  return {format:'public215_heldout_physics_v1', dataset_id:f.contract.dataset_id,
    context:f.row.context, cell_key_checksum:f.row.cell_key_checksum, model_checksum:f.row.model_checksum,
    template_checksum:f.row.template_checksum, model_build_receipt_checksum:f.row.model_build_receipt_checksum,
    board:'AcKd2h', board_offset:f.payload.heldout_board_offset, selection_receipt_checksum:HEX('9'),
    capture_receipt_checksum:f.row.public_training_provenance.capture_receipt_checksum,
    node_checksum:HEX('a'), artifact_checksum:HEX('b'), audit_key:HEX('c')};
}
async function callHeldoutFixture(f, {principal='COMPACTOR', receipt=heldoutReceipt(f), rpcError=null} = {}) {
  const calls = [];
  const supabase = {rpc(name,args) {
    calls.push({name,args});
    const data = name === 'fn_gto_v31_worker_contract' ? f.contract
      : name === 'fn_gto_v31_model_preparations' ? f.rows || [f.row]
      : name === 'fn_gto_v31_prepare_heldout_public_physics' ? receipt : null;
    return {abortSignal:async () => ({data, error:name === 'fn_gto_v31_prepare_heldout_public_physics' ? rpcError : null,
      status:rpcError ? 500 : 200})};
  }};
  const signedProvenance = Object.fromEntries([...Object.keys(provenance()),'feature_contract_version','policy_export_schema'].map(k => [k,f.contract[k]]));
  try {
    const result = await physicsDispatch()(supabase, {principal,operation:'freeze_model',payload:f.payload,provenance:signedProvenance});
    return {result,calls};
  } catch (error) {return {error,calls};}
}

test('heldout physics uses a frozen authoritative receipt and only a server-selected M2 board offset', async () => {
  for (const offset of [0,7]) {
    const f=heldoutFixture();f.payload.heldout_board_offset=offset;
    const expected=heldoutReceipt(f), actual=await callHeldoutFixture(f);
    assert.equal(actual.error,undefined);
    assert.deepEqual(actual.calls.map(c => c.name),['fn_gto_v31_worker_contract','fn_gto_v31_model_preparations','fn_gto_v31_prepare_heldout_public_physics']);
    assert.deepEqual(actual.calls[1].args,{p_dataset_id:f.contract.dataset_id,p_offset:0,p_limit:1});
    assert.deepEqual(actual.calls[2].args,{p_dataset_id:f.contract.dataset_id,p_cell_key_checksum:f.row.cell_key_checksum,
      p_model_checksum:f.row.model_checksum,p_model_build_receipt_checksum:f.row.model_build_receipt_checksum,p_board_offset:offset});
    assert.deepEqual(actual.result,expected);
    assert.ok(!Object.hasOwn(actual.calls[2].args,'p_board'));
    assert.ok(!f.row.runtime_parity_protocol.contexts[0].cases.some(c => c.board===expected.board));
  }
});

test('heldout physics refuses principal, payload and offset faults before the audit RPC', async () => {
  for (const principal of ['M1','M2']) {
    const actual=await callHeldoutFixture(heldoutFixture(),{principal});
    assert.equal(actual.error.status,403);
    assert.ok(!actual.calls.some(c => c.name==='fn_gto_v31_prepare_heldout_public_physics'));
  }
  for (const mutate of [
    f => f.payload.heldout_board_offset=-1, f => f.payload.heldout_board_offset=-0,
    f => f.payload.heldout_board_offset=8, f => f.payload.heldout_board_offset=0.5,
    f => f.payload.heldout_board_offset='0', f => f.payload.heldout_board_offset=true,
    f => delete f.payload.heldout_board_offset, f => delete f.payload.preparation_offset,
    f => f.payload.preparation_offset=-1, f => f.payload.preparation_offset=-0,
    f => f.payload.preparation_offset=107, f => f.payload.preparation_offset='0',
    f => f.payload.preparation_offset=Number.MAX_SAFE_INTEGER+1,
    f => f.payload.physics_board='AcKd2h', f => f.payload.selection_seed='f'.repeat(64),
    f => f.payload.extra=true, f => f.payload.dataset_id='foreign',
    f => f.contract.state='evaluating', f => f.contract.feature_contract_version='holdem-board-relative-v2',
  ]) {
    const f=heldoutFixture();mutate(f);const actual=await callHeldoutFixture(f);
    assert.ok(actual.error);
    assert.ok(!actual.calls.some(c => c.name==='fn_gto_v31_prepare_heldout_public_physics'));
  }
});

test('heldout physics rejects changed frozen model, provenance or original Linux receipt bindings', async () => {
  for (const mutate of [
    f => f.rows=[], f => f.rows=[f.row,f.row], f => f.row.status='prepared',
    f => f.row.dataset_id='foreign', f => f.row.context={...f.row.context,street:'turn'},
    f => f.row.cell_key_checksum='0'.repeat(64), f => f.row.model_checksum=HEX('f'),
    f => f.row.template_checksum=HEX('f'), f => f.row.training_provenance_checksum=HEX('f'),
    f => f.row.public_model.provenance_sha256=HEX('f'), f => f.row.public_template.extra='changed',
    f => f.row.encoder_descriptor.extra='changed', f => f.row.runtime_parity_protocol.extra='changed',
    f => f.row.public_training_provenance.capture_receipt_checksum='0'.repeat(64),
    f => f.row.model_build_receipt_checksum=HEX('f'), f => f.row.public_model_build_receipt.cases[0].board='AcKd2h',
    f => {f.payload.context.public_model_build_receipt.cases[0].board='AcKd2h';
      f.payload.context.model_build_receipt_checksum=physicsHash(f.payload.context.public_model_build_receipt);},
  ]) {
    const f=heldoutFixture();mutate(f);const actual=await callHeldoutFixture(f);
    assert.ok(actual.error);
    assert.ok(!actual.calls.some(c => c.name==='fn_gto_v31_prepare_heldout_public_physics'));
  }
});

test('heldout physics rejects malformed or mismatched SQL receipts and propagates SQL refusal', async () => {
  const changes=[{format:'other'},{dataset_id:'foreign'},{context:{foreign:true}},
    {cell_key_checksum:HEX('f')},{model_checksum:HEX('f')},{template_checksum:HEX('f')},
    {model_build_receipt_checksum:HEX('f')},{capture_receipt_checksum:HEX('f')},
    {board:'AcAc2h'},{board:'AcKd2h3s'},{board:'acKd2h'},{board:['Ac','Kd','2h']},
    {board_offset:1},{board_offset:-0},{board_offset:'0'},{extra:true},
    ...['selection_receipt_checksum','node_checksum','artifact_checksum','audit_key'].flatMap(key =>
      [{[key]:'0'.repeat(64)},{[key]:'not-a-checksum'}])];
  for (const change of changes) {
    const f=heldoutFixture();const actual=await callHeldoutFixture(f,{receipt:{...heldoutReceipt(f),...change}});
    assert.equal(actual.error.status,503);
  }
  for (const receipt of [null,[],{}]) {
    assert.equal((await callHeldoutFixture(heldoutFixture(),{receipt})).error.status,503);
  }
  const refused=await callHeldoutFixture(heldoutFixture(),{rpcError:{message:'complete admitted selection required',code:'P0001'}});
  assert.ok(refused.error);
  assert.equal(refused.calls.filter(c => c.name==='fn_gto_v31_prepare_heldout_public_physics').length,1);
});

function presealFixture() {
  const {contract}=physicsFixture();
  const payload={dataset_id:contract.dataset_id,phase:'prepare_cell',preparation_offset:0,
    cell_key_checksum:HEX('1'),model_checksum:HEX('2'),template_checksum:HEX('3'),
    training_provenance_checksum:HEX('4'),model_build_receipt_checksum:HEX('5')};
  const receipt={format:'public215_preseal_cell_v1',dataset_id:contract.dataset_id,
    preparation_offset:0,...Object.fromEntries(Object.entries(payload).filter(([k])=>k.endsWith('checksum'))),
    receipt_checksum:HEX('6'),qualification_fingerprint:HEX('7'),status:'prepared'};
  return {contract,payload,receipt};
}
async function callPreseal(f,{principal='COMPACTOR'}={}) {
  const calls=[];
  const supabase={rpc(name,args){calls.push({name,args});return {abortSignal:async()=>({
    data:name==='fn_gto_v31_worker_contract'?f.contract:name==='fn_gto_v31_seal_build'?HEX('8'):f.receipt,
    error:null,status:200})};}};
  const signedProvenance=Object.fromEntries([...Object.keys(provenance()),'feature_contract_version','policy_export_schema'].map(k=>[k,f.contract[k]]));
  try{return {result:await physicsDispatch()(supabase,{principal,operation:'seal_dataset',payload:f.payload,provenance:signedProvenance}),calls};}
  catch(error){return {error,calls};}
}
test('bounded preparation and read-only status use existing signed seal operation; ordinary seal stays unchanged',async()=>{
  for(const phase of ['prepare_cell','preparation_status']){
    const f=presealFixture();f.payload.phase=phase;
    const actual=await callPreseal(f);assert.equal(actual.error,undefined);assert.deepEqual(actual.result,f.receipt);
    assert.deepEqual(actual.calls.map(x=>x.name),['fn_gto_v31_worker_contract',phase==='prepare_cell'?'fn_gto_v31_prepare_seal_cell':'fn_gto_v31_seal_cell_preparation_status']);
    assert.deepEqual(actual.calls[1].args,{p_dataset_id:f.contract.dataset_id,p_cell_key_checksum:f.payload.cell_key_checksum});
  }
  const f=presealFixture();f.payload={dataset_id:f.contract.dataset_id};const actual=await callPreseal(f);
  assert.deepEqual(actual.result,{dataset_checksum:HEX('8'),idempotent:false});
  assert.equal(actual.calls[1].name,'fn_gto_v31_seal_build');
});
test('bounded preparation refuses malformed phases and M1/M2 before any preparation write',async()=>{
  for(const mutate of [f=>f.payload.phase='other',f=>f.payload.extra=true,f=>delete f.payload.model_checksum,
    f=>f.payload.preparation_offset=-0,f=>f.payload.preparation_offset=-1,f=>f.payload.preparation_offset=107,
    f=>f.payload.preparation_offset=0.5,f=>f.payload.preparation_offset='0',f=>f.payload.model_checksum=HEX('0'),
    f=>f.contract.state='active',f=>f.contract.feature_contract_version='holdem-board-relative-v2']){
    const f=presealFixture();mutate(f);const actual=await callPreseal(f);assert.ok(actual.error);
    assert.ok(!actual.calls.some(c=>c.name==='fn_gto_v31_prepare_seal_cell'));
  }
  for(const principal of ['M1','M2']){const actual=await callPreseal(presealFixture(),{principal});assert.equal(actual.error.status,403);assert.equal(actual.calls.length,1);}
});
test('bounded preparation rejects mismatched authoritative receipts and permits status-only missing/stale outcomes',async()=>{
  for(const mutate of [f=>f.receipt.model_checksum=HEX('9'),f=>f.receipt.preparation_offset=1,
    f=>f.receipt.receipt_checksum=HEX('0'),f=>f.receipt.qualification_fingerprint=HEX('0'),f=>f.receipt.extra=true,
    f=>f.receipt.status='missing',f=>f.receipt=null]){
    const f=presealFixture();mutate(f);const actual=await callPreseal(f);assert.equal(actual.error.status,409);
    assert.equal(actual.calls.filter(c=>c.name==='fn_gto_v31_prepare_seal_cell').length,1);
  }
  for(const status of ['missing','stale']){const f=presealFixture();f.payload.phase='preparation_status';f.receipt.status=status;if(status==='missing')f.receipt.receipt_checksum=null;
    const actual=await callPreseal(f);assert.equal(actual.error,undefined);assert.equal(actual.result.status,status);
    assert.equal(actual.calls[1].name,'fn_gto_v31_seal_cell_preparation_status');}
});
