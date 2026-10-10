import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { admitExportRequest, admitDownload, confirmJob, recoveryOptions, observeJob, verifyDownloadedStream } from '../scripts/lib/horses-export-delivery-contract.mjs';
const opId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const input = { action: 'request', surface: 'stable-live-floor', filters: {}, opId };
const request = (body = input, method = 'POST', url = 'https://smarter.poker/api/horses/export-artifacts') => ({ url: () => url, method: () => method, postDataJSON: () => body });
test('only one exact real floor export may mutate', () => {
  assert.deepEqual(admitExportRequest(request(), false), { opId });
  assert.equal(admitExportRequest(request(), true), false);
  for (const body of [{ ...input, action: 'resume' }, { ...input, surface: 'admin-audit-log' }, { ...input, filters: { userId: id } }, { ...input, table: 'profiles' }]) assert.equal(admitExportRequest(request(body), false), false);
  assert.equal(admitExportRequest(request(input, 'POST', 'https://smarter.poker/api/horses/engine-control'), false), false);
  assert.equal(admitExportRequest(request(input, 'POST', 'https://attacker.invalid/api/horses/export-artifacts'), false), false);
  assert.equal(admitExportRequest(request(null, 'GET'), true), 'read');
});
const bytes = Buffer.from('table_id,status\nreal-metadata,waiting\n');
const hash = createHash('sha256').update(bytes).digest('hex');
const job = { id, op_id: opId, surface: 'stable-live-floor', state: 'ready', complete: true, content_sha256: hash, byte_size: bytes.length, expires_at: new Date(Date.now() + 60000).toISOString() };
test('receipt must be original complete unexpired job, never truncated or simulated', () => {
  assert.equal(confirmJob(job, opId, id), job);
  for (const candidate of [{ ...job, op_id: id }, { ...job, id: opId }, { ...job, complete: false }, { ...job, state: 'truncated' }, { ...job, state: 'failed' }, { ...job, expires_at: 'invalid' }, { ...job, expires_at: '2000-01-01' }]) assert.throws(() => confirmJob(candidate, opId, id));
});
test('actual streamed bytes must match receipt and served header', async () => {
  assert.deepEqual(await verifyDownloadedStream(Readable.from([bytes.subarray(0, 7), bytes.subarray(7)]), job, hash), { bytes: bytes.length, sha256: hash });
  await assert.rejects(verifyDownloadedStream(Readable.from([Buffer.from('tampered')]), job, hash), /hash_mismatch/);
  await assert.rejects(verifyDownloadedStream(Readable.from([bytes]), job, '0'.repeat(64)), /hash_mismatch/);
  await assert.rejects(verifyDownloadedStream(Readable.from([bytes]), { ...job, byte_size: bytes.length + 1 }, hash), /hash_mismatch/);
});
test('explicit verifier is protected-main only and leaves read-only certificate unchanged', () => {
  const workflow = readFileSync(new URL('../.github/workflows/horses-export-delivery-certificate.yml', import.meta.url), 'utf8');
  const verifier = readFileSync(new URL('../scripts/verify-horses-export-delivery.mjs', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/); assert.doesNotMatch(workflow, /schedule:|push:|deployment_status:/);
  assert.match(workflow, /refs\/heads\/main/); assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.match(workflow, /TEST_USER_PASSWORD: \$\{\{ secrets.TEST_USER_PASSWORD \}\}/);
  assert.doesNotMatch(workflow, /storageState|screenshot|trace|video|deploy/);
  assert.match(verifier, /Export Full Floor/); assert.match(verifier, /Download Verified CSV/);
  assert.match(verifier, /download.createReadStream\(\)/); assert.doesNotMatch(verifier, /route.fulfill|page.evaluate[^;]*access_token|saveAs\(/);
  assert.match(verifier, /before.deploymentId === after.deploymentId/);
});


test('original-job recovery requires both valid identities and never admits a new export', () => {
  assert.deepEqual(recoveryOptions(), { jobId: null, opId: null, bounded: false });
  assert.deepEqual(recoveryOptions(id, opId, true), { jobId: id, opId, bounded: true });
  for (const args of [[id], ['',opId], ['bad',opId], [id,'bad'], ['', '', true]]) assert.throws(() => recoveryOptions(...args), /recovery_invalid/);
  assert.equal(admitExportRequest(request(), Boolean(recoveryOptions(id, opId).jobId)), false);
});
test('terminal observation survives complete-only refusal; pending is not truncated', () => {
  const receipt = { state: 'running' };
  const terminal = { ...job, state: 'truncated', complete: false, progress: 515 };
  assert.throws(() => confirmJob(observeJob(receipt, terminal), opId, id), /export_truncated/);
  assert.deepEqual(receipt, { state: 'truncated', rows: 515, reportComplete: false });
  for (const state of ['queued','running']) assert.equal(confirmJob({ ...job, state, complete: null }, opId, id).state, state);
});
test('explicit bounded download keeps terminal identity, expiry, size, and completeness checks', async () => {
  const truncated = { ...job, state: 'truncated', complete: false };
  assert.equal(confirmJob(truncated, opId, id, { bounded: true }), truncated);
  for (const candidate of [{ ...truncated, complete: true }, { ...truncated, op_id: id }, { ...truncated, state: 'failed' }, { ...truncated, state: 'cancelled' }, { ...truncated, expires_at: '2000-01-01' }, { ...truncated, content_sha256: 'bad' }, { ...truncated, byte_size: 16777217 }]) assert.throws(() => confirmJob(candidate, opId, id, { bounded: true }));
  assert.deepEqual(await verifyDownloadedStream(Readable.from([bytes]), truncated, hash), { bytes: bytes.length, sha256: hash });
});
test('download admission permits exact bounded acknowledgement only for original terminal file', () => {
  const truncated = { ...job, state: 'truncated', complete: false };
  const url = `https://smarter.poker/api/horses/export-artifacts?id=${id}&download=1`;
  assert.equal(admitDownload(request(null, 'GET', url), job, false), true);
  assert.equal(admitDownload(request(null, 'GET', url + '&acknowledge=1'), truncated, true), true);
  for (const [suffix, target, bounded] of [['',truncated,true], ['',truncated,false], ['&acknowledge=1',truncated,false], ['&acknowledge=1',job,true], ['&acknowledge=0',truncated,true], ['&acknowledge=1&extra=1',truncated,true], ['&acknowledge=1',{ ...truncated,state:'running' },true]]) assert.equal(admitDownload(request(null,'GET',url+suffix), target, bounded), false);
  assert.equal(admitDownload(request(null,'GET',url.replace(id,opId)+'&acknowledge=1'), truncated, true), false);
  assert.equal(admitDownload(request(null,'POST',url+'&acknowledge=1'), truncated, true), false);
});
test('same-job console route uses explicit acknowledgement with zero admitted writes', () => {
  const verifier = readFileSync(new URL('../scripts/verify-horses-export-delivery.mjs', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../.github/workflows/horses-export-delivery-certificate.yml', import.meta.url), 'utf8');
  assert.match(verifier, /Boolean\(recovery.jobId\) \|\| receipt.admittedExportRequests > 0/);
  assert.match(verifier, /observeJob\(receipt,[\s\S]*?confirmJob\(ready/);
  assert.match(verifier, /I Acknowledge This Is An Incomplete Bounded Report/);
  assert.match(verifier, /receipt.deliveryVerified = true/);
  for (const input of ['original_job_id','original_op_id','acknowledge_bounded_report']) assert.match(workflow, new RegExp('inputs\\.' + input));
});
