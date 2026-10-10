import assert from 'node:assert/strict';
import test from 'node:test';
import { exportDescriptor, EXPORT_ARTIFACT_REGISTRY } from '../src/lib/horses/exportArtifactRegistry.js';
import { captureExportSource } from '../src/lib/horses/exportArtifactSource.js';
import { renderExportArtifact, artifactHash, freshExportOperator } from '../src/lib/horses/exportArtifactWorker.js';
import { requestExportArtifact } from '../src/components/horses/exportArtifactClient.js';

test('export descriptors refuse arbitrary services, filters and permissions', () => {
  assert.throws(() => exportDescriptor('profiles'), /surface_invalid/);
  assert.throws(() => exportDescriptor('mint-register', { table: 'profiles' }), /filter_invalid/);
  assert.throws(() => exportDescriptor('mint-register', { action: { sql: 'DROP' } }), /filter_invalid/);
  assert.equal(EXPORT_ARTIFACT_REGISTRY['mint-register'].permission, 'money.read');
  assert.equal(EXPORT_ARTIFACT_REGISTRY['admin-audit-log'].permission, 'audit.read');
  assert.equal(EXPORT_ARTIFACT_REGISTRY['stable-live-floor'].permission, 'clubs.read');
  assert.equal(EXPORT_ARTIFACT_REGISTRY['fleet-roster'].permission, 'fleet.read');
});
const capture = (read, extra = {}) => captureExportSource({ db: {}, op: {}, job: { surface: 'mint-register', filters: {} }, readOwners: { mint: read }, ...extra });
test('authoritative page capture walks the source and retains read-window provenance', async () => {
  const calls = [];
  const result = await capture(async ({ query }) => { calls.push(query); return { rows: [{ id: query.offset ? 'b' : 'a' }], total: 2 }; });
  assert.equal(result.complete, true);
  assert.equal(result.consistency, 'read_window');
  assert.deepEqual(result.rows.map((row) => row.id), ['a','b']);
  assert.deepEqual(calls.map((query) => query.offset), [0,1,0]);
  assert.equal(calls[0].section, 'ledger');
  assert.equal(calls[0].action, undefined);
});
test('source count drift and shifted page refuse a falsely complete report', async () => {
  await assert.rejects(capture(async ({ query }) => ({ rows: [{ id: query.offset }], total: query.offset ? 3 : 2 })), /source_changed/);
  let reads = 0;
  await assert.rejects(capture(async () => ({ rows: [{ id: ++reads }], total: 2 })), /source_changed/);
});
test('bounded aggregates and execution ceilings retain an incomplete marker', async () => {
  const aggregate = await capture(async () => ({ rows: [{ id: 'bounded' }] }));
  assert.equal(aggregate.complete, false);
  let time = 0;
  const timed = await capture(async () => ({ rows: [{ id: 1 }], total: 200 }), { now: () => time += 180000 });
  assert.equal(timed.complete, false);
  const job = { requester_id: 'actor', op_id: 'operation', surface: 'mint-register', filters: {} };
  const file = renderExportArtifact(job, aggregate);
  assert.match(file.bytes.toString(), /INCOMPLETE BOUNDED REPORT/);
  assert.match(file.bytes.toString(), /Recorded Read Window/);
  assert.equal(artifactHash(file.bytes), file.hash);
  assert.equal(file.path, 'actor/operation.csv');
});
test('private CSV preserves negative money, nested evidence and formula safety', () => {
  const file = renderExportArtifact({ requester_id:'actor', op_id:'operation', surface:'mint-register', filters:{} }, { rows:[{ amount:-2.25, name:'=HYPERLINK("evil")', details:{ reason:'source' } }], complete:true, total:1, cap:20000, disclosure:'Read Window' });
  assert.match(file.bytes.toString(), /-2\.25/);
  assert.match(file.bytes.toString(), /'=HYPERLINK/);
  assert.match(file.bytes.toString(), /source/);
});
test('unknown request acknowledgement retries the original operation identity', async () => {
  const ids = [];
  const scope = { operatorId: 'actor', isCurrent: () => true };
  const authFetch = async (_url, options) => { const body = JSON.parse(options.body); ids.push(body.opId); if(ids.length===1) throw new Error('timeout'); return { job:{ id:'job', state:'queued' } }; };
  await assert.rejects(requestExportArtifact(authFetch,'mint-register',{asset:'chips'},{scope}), /Operation ID/);
  const answer = await requestExportArtifact(authFetch,'mint-register',{asset:'chips'},{scope});
  assert.equal(answer.queued,true); assert.equal(ids[0],ids[1]);
});
test('artifact execution and download authority fail closed on unknown or revoked grants', async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({error:{message:'outage'}}) }) }) }), rpc:async()=>({error:{message:'outage'}}) };
  await assert.rejects(freshExportOperator(db,'actor','money.read'), (error) => error.status===503 && error.code==='export_authority_unknown');
});
