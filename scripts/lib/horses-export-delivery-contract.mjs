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
export function confirmJob(job, opId, id) {
  if (!job || !UUID.test(job.id || '') || job.op_id !== opId || job.surface !== 'stable-live-floor' || id && job.id !== id) throw new Error('export_identity_unconfirmed');
  if (Date.parse(job.expires_at) <= Date.now() || !Number.isFinite(Date.parse(job.expires_at))) throw new Error('export_expired');
  if (['failed', 'cancelled', 'truncated'].includes(job.state)) throw new Error('export_' + job.state);
  if (job.state === 'ready' && (job.complete !== true || !/^[0-9a-f]{64}$/.test(job.content_sha256 || '') || !Number.isSafeInteger(Number(job.byte_size)) || Number(job.byte_size) < 0 || Number(job.byte_size) > 16 * 1024 * 1024)) throw new Error('export_receipt_incomplete');
  if (!['queued', 'running', 'ready'].includes(job.state)) throw new Error('export_state_unknown');
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
