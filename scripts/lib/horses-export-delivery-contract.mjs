import { createHash } from 'node:crypto';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function admitExportRequest(request, admitted) {
  const url = new URL(request.url());
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return 'read';
  if (admitted || request.method() !== 'POST' || url.origin !== 'https://smarter.poker' || url.pathname !== '/api/horses/export-artifacts' || url.search) return false;
  let body; try { body = request.postDataJSON(); } catch { return false; }
  if (!body || Object.keys(body).sort().join(',') !== 'action,filters,opId,surface' || body.action !== 'request' || body.surface !== 'stable-live-floor' || !UUID.test(body.opId || '') || !body.filters || Array.isArray(body.filters) || Object.keys(body.filters).length) return false;
  return { opId: body.opId };
}
export function recoveryOptions(jobId = '', opId = '', bounded = false) {
  if (Boolean(jobId) !== Boolean(opId) || jobId && (!UUID.test(jobId) || !UUID.test(opId)) || bounded && !jobId) throw new Error('export_recovery_invalid');
  return { jobId: jobId || null, opId: opId || null, bounded: bounded === true };
}
export function observeJob(receipt, job) {
  receipt.state = job?.state ?? null;
  receipt.rows = job?.progress ?? null;
  receipt.reportComplete = job?.complete ?? null;
  return job;
}
export function admitDownload(request, job, bounded) {
  const url = new URL(request.url());
  if (request.method() !== 'GET' || url.origin !== 'https://smarter.poker' || url.pathname !== '/api/horses/export-artifacts' || !job || !['ready','truncated'].includes(job.state)) return false;
  const allowed = job.state === 'truncated' && bounded === true;
  if (job.state === 'truncated' && !allowed) return false;
  return url.searchParams.get('id') === job.id && url.searchParams.get('download') === '1'
    && [...url.searchParams.keys()].sort().join(',') === (allowed ? 'acknowledge,download,id' : 'download,id')
    && (!allowed || url.searchParams.get('acknowledge') === '1');
}
export function confirmJob(job, opId, id, { bounded = false } = {}) {
  if (!job || !UUID.test(job.id || '') || job.op_id !== opId || job.surface !== 'stable-live-floor' || id && job.id !== id) throw new Error('export_identity_unconfirmed');
  if (Date.parse(job.expires_at) <= Date.now() || !Number.isFinite(Date.parse(job.expires_at))) throw new Error('export_expired');
  if (['failed', 'cancelled'].includes(job.state) || job.state === 'truncated' && !bounded) throw new Error('export_' + job.state);
  if (['ready','truncated'].includes(job.state) && (job.complete !== (job.state === 'ready') || !/^[0-9a-f]{64}$/.test(job.content_sha256 || '') || !Number.isSafeInteger(Number(job.byte_size)) || Number(job.byte_size) < 0 || Number(job.byte_size) > 16 * 1024 * 1024)) throw new Error('export_receipt_incomplete');
  if (!['queued', 'running', 'ready','truncated'].includes(job.state)) throw new Error('export_state_unknown');
  return job;
}
export async function verifyDownloadedStream(stream, job, headerHash) {
  if (!stream) throw new Error('export_download_missing');
  const digest = createHash('sha256'); let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.length;
    if (bytes > 16 * 1024 * 1024) throw new Error('export_download_bound_exceeded');
    digest.update(chunk);
  }
  const hash = digest.digest('hex');
  if (hash !== job.content_sha256 || hash !== headerHash || bytes !== Number(job.byte_size)) throw new Error('export_download_hash_mismatch');
  return { bytes, sha256: hash };
}
