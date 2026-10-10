import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { admitExportRequest, confirmJob, verifyDownloadedStream } from '../scripts/lib/horses-export-delivery-contract.mjs';
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
