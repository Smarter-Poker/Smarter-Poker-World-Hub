import { waitUntil } from '@vercel/functions';
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS, hasPermission } from '../../../src/lib/horses/permissions.js';
import { ApiError, badRequest, forbidden } from '../../../src/lib/horses/apiEnvelope.js';
import { uuid, int } from '../../../src/lib/horses/validate.js';
import { EXPORT_ARTIFACT_BUCKET, EXPORT_ARTIFACT_REGISTRY, exportDescriptor } from '../../../src/lib/horses/exportArtifactRegistry.js';
import { artifactHash, exportTransition, freshExportOperator, readExportJob, runExportArtifact } from '../../../src/lib/horses/exportArtifactWorker.js';

export const config = { maxDuration: 300 };
const publicJob = ({ snapshot, object_path, lease_id, payload_sha256, ...job }) => job;
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
export async function handle({ db, op, body, query, req, res, method, requestId }, { defer = waitUntil, worker = runExportArtifact } = {}) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (method === 'POST' && body.action === 'request') {
    const opId = uuid(body.opId);
    if (!opId) throw badRequest('A Stable Export Operation ID Is Required', 'export_operation_required');
    let descriptor;
    try { descriptor = exportDescriptor(body.surface, body.filters || {}); } catch { throw badRequest('Choose A Supported Report And Filters', 'export_descriptor_invalid'); }
    if (!hasPermission(op.permissions, descriptor.permission)) throw forbidden('Permission Required: ' + descriptor.permission);
    await freshExportOperator(db, op.user.id, descriptor.permission);
    const payloadHash = artifactHash(Buffer.from(JSON.stringify({ surface: descriptor.surface, filters: canonical(descriptor.filters), permission: descriptor.permission })));
    const answer = await db.rpc('fn_ca_operator_export_request', { p_actor: op.user.id, p_op_id: opId, p_request_id: requestId,
      p_surface: descriptor.surface, p_permission: descriptor.permission, p_filters: descriptor.filters, p_payload_sha256: payloadHash });
    if (answer.error) throw new ApiError(409, 'The Export Operation Could Not Be Confirmed. Keep Its Operation ID And Read Status Before Retrying', 'export_request_unconfirmed');
    if (answer.data.state === 'queued') defer(worker(db, answer.data.id, op.user.id));
    res.status(202).json({ success: true, job: publicJob(answer.data), accepted: true, requestId });
    return;
  }
  if (method === 'GET' && !query.id) {
    const limit = query.limit === undefined ? 25 : int(query.limit, { min: 1, max: 100 });
    const offset = query.offset === undefined ? 0 : int(query.offset, { min: 0, max: Number.MAX_SAFE_INTEGER - 100 });
    if (limit === null || offset === null) throw badRequest('Choose A Valid Export History Page', 'export_page_invalid');
    const permissions = [...new Set(Object.values(EXPORT_ARTIFACT_REGISTRY).map((descriptor) => descriptor.permission))].filter((permission) => hasPermission(op.permissions, permission));
    if (!permissions.length) return { jobs: [], rows: [], total: 0, limit, offset, hasMore: false, truncated: false };
    const answer = await db.from('ca_operator_export_artifacts').select('id,op_id,surface,filters,state,progress,total,complete,error_code,content_sha256,byte_size,created_at,updated_at,expires_at,lease_until,permission', { count: 'exact' }).eq('requester_id', op.user.id).in('permission', permissions).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1);
    if (answer.error || !Array.isArray(answer.data) || !Number.isSafeInteger(answer.count) || answer.count < 0) throw new ApiError(503, 'Export Jobs Could Not Be Read', 'export_jobs_unavailable');
    return { jobs: answer.data, rows: answer.data, total: answer.count, limit, offset, hasMore: offset + answer.data.length < answer.count, truncated: answer.count > answer.data.length };
  }
  const id = uuid(method === 'GET' ? query.id : body.id);
  if (!id) throw badRequest('Choose An Export Job', 'export_id_required');
  let job;
  try { job = await readExportJob(db, id, op.user.id); } catch (error) {
    if (error.message === 'export_job_unavailable') throw new ApiError(503, 'Export Status Could Not Be Read', 'export_job_unavailable');
    throw new ApiError(404, 'Export Job Not Found', 'export_job_not_found');
  }
  await freshExportOperator(db, op.user.id, job.permission);
  if (method === 'POST' && body.action === 'cancel') {
    await exportTransition(db, id, op.user.id, 'cancel', null);
    return { job: publicJob(await readExportJob(db, id, op.user.id)) };
  }
  if (method === 'POST' && body.action === 'purge') {
    if (job.state !== 'cancelled' && Date.parse(job.expires_at) > Date.now()) throw new ApiError(409, 'Only Cancelled Or Expired Files Can Be Removed', 'export_purge_refused');
    const removed = await db.storage.from(EXPORT_ARTIFACT_BUCKET).remove([`${job.requester_id}/${job.op_id}.csv`]);
    if (removed.error) throw new ApiError(503, 'File Removal Could Not Be Confirmed. Keep The Job ID And Retry This Removal', 'export_purge_unconfirmed');
    await exportTransition(db, id, op.user.id, 'purged', null, { request_id: requestId });
    return { job: publicJob(job), purged: true };
  }
  if (method === 'POST' && body.action === 'resume') {
    if (!['queued', 'failed', 'running'].includes(job.state) || Date.parse(job.expires_at) <= Date.now()) throw new ApiError(409, 'This Export Cannot Be Resumed', 'export_resume_refused');
    if (job.state === 'running' && Date.parse(job.lease_until) > Date.now()) throw new ApiError(409, 'The Current Export Is Still Running', 'export_still_running');
    defer(worker(db, id, op.user.id));
    res.status(202).json({ success: true, job: publicJob(job), accepted: true, requestId });
    return;
  }
  if (method !== 'GET') throw badRequest('Choose Request, Resume Or Cancel', 'export_action_invalid');
  if (query.download !== '1') return { job: publicJob(job) };
  if (!['ready', 'truncated'].includes(job.state) || Date.parse(job.expires_at) <= Date.now()) throw new ApiError(409, 'This Export Is Not Available For Download', 'export_not_downloadable');
  if (job.state === 'truncated' && query.acknowledge !== '1') throw new ApiError(409, 'Acknowledge The Incomplete Report Before Downloading', 'export_truncation_ack_required');
  const object = await db.storage.from(EXPORT_ARTIFACT_BUCKET).download(job.object_path);
  if (object.error || !object.data) throw new ApiError(503, 'The Private Export File Could Not Be Read', 'export_download_unavailable');
  const bytes = Buffer.from(await object.data.arrayBuffer());
  if (bytes.length !== Number(job.byte_size) || artifactHash(bytes) !== job.content_sha256) throw new ApiError(503, 'The Export File Does Not Match Its Recorded Hash', 'export_hash_mismatch');
  await freshExportOperator(db, op.user.id, job.permission);
  await exportTransition(db, id, op.user.id, 'served', null, { request_id: requestId, sha256: job.content_sha256, bytes: bytes.length });
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${job.surface}-${job.state === 'truncated' ? 'incomplete-' : ''}${job.id}.csv"`);
  res.setHeader('X-Content-SHA256', job.content_sha256);
  res.status(200).end(bytes);
}
export const spec = { name: 'horses.export-artifacts', methods: ['GET','POST'], permission: PERMISSIONS.CONSOLE_READ, limit: { GET: 'read', POST: 'write' }, durable: { POST: { max: 10, windowSeconds: 60 } } };
export default withOperatorRoute(spec, handle);
