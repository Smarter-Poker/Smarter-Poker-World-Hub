import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runExportArtifact } from '../src/lib/horses/exportArtifactWorker.js';
import { ApiError } from '../src/lib/horses/apiEnvelope.js';

const requester = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const operation = '33333333-3333-4333-8333-333333333333';
const snapshot = {
  rows: [{ table_id: 'synthetic-table', player_count: 3 }],
  startedAt: '2026-10-09T12:00:00Z', capturedAt: '2026-10-09T12:00:01Z',
  complete: true, total: 1, cap: 500, disclosure: 'Synthetic complete capture',
};

function harness({ retained = null, uploadError = false, mismatch = false, cancelUpload = false, revokeUpload = false } = {}) {
  const job = {
    id, requester_id: requester, op_id: operation, permission: 'clubs.read',
    surface: 'stable-live-floor', filters: {}, snapshot: retained,
    state: 'queued', lease_id: null, expires_at: new Date(Date.now() + 60000).toISOString(),
  };
  const calls = { transitions: [], uploads: [], downloads: [], removes: [], captures: 0, authority: 0 };
  let uploaded = false;
  let object;
  const bucket = {
    async upload(path, bytes, options) {
      calls.uploads.push({ path, bytes, options }); object = Buffer.from(bytes); uploaded = true;
      if (cancelUpload) job.state = 'cancelled';
      return { error: uploadError ? { message: 'Acknowledgement lost after upload' } : null };
    },
    async download(path) {
      calls.downloads.push(path);
      const bytes = mismatch ? Buffer.from('A different original artifact') : object;
      return { error: null, data: { arrayBuffer: async () => bytes } };
    },
    async remove(paths) { calls.removes.push(paths); return { error: null }; },
  };
  const db = {
    from(name) {
      assert.equal(name, 'ca_operator_export_artifacts');
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { ...job }, error: null }) };
      return query;
    },
    async rpc(name, args) {
      assert.equal(name, 'fn_ca_operator_export_transition');
      assert.equal(args.p_id, id); assert.equal(args.p_actor, requester);
      calls.transitions.push(args);
      const action = args.p_action;
      if (action === 'claim') { job.state = 'running'; job.lease_id = args.p_lease; return { data: { claimed: true }, error: null }; }
      assert.equal(args.p_lease, job.lease_id);
      if (action === 'capture') job.snapshot = args.p_details;
      if (action === 'finish') job.state = 'complete';
      if (action === 'fail' && job.state !== 'cancelled') job.state = 'failed';
      return { data: { owned: true, state: job.state }, error: null };
    },
    storage: { from: () => bucket },
  };
  const seam = {
    capture: async ({ onProgress }) => { calls.captures++; await onProgress(1, 1); return snapshot; },
    authority: async () => {
      calls.authority++;
      if (revokeUpload && uploaded) throw new ApiError(403, 'Permission revoked', 'export_permission_revoked');
      return { user: { id: requester }, permissions: ['clubs.read'], db };
    },
  };
  return { db, calls, job, seam };
}
const finishes = (h) => h.calls.transitions.filter((call) => call.p_action === 'finish');

test('a lost upload acknowledgement reuses only the identical original digest', async () => {
  const h = harness({ uploadError: true });
  const result = await runExportArtifact(h.db, id, requester, h.seam);
  assert.equal(result.state, 'complete'); assert.equal(h.calls.captures, 1);
  assert.equal(h.calls.downloads.length, 1); assert.equal(finishes(h).length, 1);
  const upload = h.calls.uploads[0];
  assert.equal(upload.options.upsert, false);
  assert.equal(upload.path, `${requester}/${operation}.csv`);
  assert.equal(finishes(h)[0].p_details.sha256, createHash('sha256').update(upload.bytes).digest('hex'));
});

test('a different object at the immutable upload key never finishes the export', async () => {
  const h = harness({ uploadError: true, mismatch: true });
  const result = await runExportArtifact(h.db, id, requester, h.seam);
  assert.deepEqual(result, { failed: true, code: 'export_upload_unconfirmed' });
  assert.equal(finishes(h).length, 0); assert.equal(h.job.state, 'failed');
});

test('resuming a durable snapshot never captures newer report data', async () => {
  const h = harness({ retained: snapshot });
  h.seam.capture = async () => { throw new Error('A retained capture must not be replaced'); };
  const result = await runExportArtifact(h.db, id, requester, h.seam);
  assert.equal(result.state, 'complete');
  assert.equal(h.calls.transitions.filter((call) => call.p_action === 'capture').length, 0);
  assert.match(h.calls.uploads[0].bytes.toString('utf8'), /synthetic-table/);
});

test('cancellation during upload removes the object and cannot finish its cancelled receipt', async () => {
  const h = harness({ cancelUpload: true });
  const result = await runExportArtifact(h.db, id, requester, h.seam);
  assert.deepEqual(result, { owned: false }); assert.equal(h.job.state, 'cancelled');
  assert.equal(finishes(h).length, 0);
  assert.deepEqual(h.calls.removes, [[`${requester}/${operation}.csv`]]);
});

test('permission revoked after upload prevents the original worker from finishing', async () => {
  const h = harness({ revokeUpload: true });
  const result = await runExportArtifact(h.db, id, requester, h.seam);
  assert.deepEqual(result, { failed: true, code: 'export_permission_revoked' });
  assert.equal(finishes(h).length, 0);
  assert.ok(h.calls.authority >= 3, 'Authority is checked after the object upload');
});
