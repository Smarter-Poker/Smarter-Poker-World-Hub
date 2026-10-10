import { createHash, randomUUID } from 'node:crypto';
import { EXPORT_ARTIFACT_BUCKET, EXPORT_ARTIFACT_LIMITS } from './exportArtifactRegistry.js';
import { captureExportSource } from './exportArtifactSource.js';
import { hasPermission, legacyPermissionsForProfileRole, mergePermissions } from './permissions.js';
import { toCsv } from '../horsesAdminTokens.js';
import { ApiError } from './apiEnvelope.js';

export const artifactHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function freshExportOperator(db, userId, permission) {
  const [profile, policy, grants] = await Promise.all([
    db.from('profiles').select('id,role').eq('id', userId).maybeSingle(),
    db.from('ca_operator_policy').select('enforce_named_roles').eq('id', true).maybeSingle(),
    db.rpc('fn_ca_operator_permissions', { p_user_id: userId }),
  ]);
  if (profile.error || policy.error || grants.error || !profile.data || !policy.data || !Array.isArray(grants.data?.permissions)) throw new ApiError(503, 'Export Authority Could Not Be Confirmed', 'export_authority_unknown');
  const permissions = policy.data.enforce_named_roles === true ? grants.data.permissions
    : mergePermissions(legacyPermissionsForProfileRole(profile.data.role), grants.data.permissions);
  if (!hasPermission(permissions, permission)) throw new ApiError(403, 'The Report Permission Is No Longer Available', 'export_permission_revoked');
  return { user: { id: userId }, profile: profile.data, role: profile.data.role, permissions, db };
}
export async function exportTransition(db, id, actor, action, lease, details = {}) {
  const result = await db.rpc('fn_ca_operator_export_transition', { p_id: id, p_actor: actor, p_action: action, p_lease: lease, p_details: details });
  if (result.error) {
    const refusal = ['export_not_downloadable','export_expired','export_purge_refused','export_job_not_found'].find((code) => result.error.message?.includes(code));
    if (refusal) throw new ApiError(409, 'The Original Export State Refused This Action. Refresh Its Status', refusal);
    throw new ApiError(503, 'The Export Transition Could Not Be Confirmed. Read The Original Job Before Retrying', 'export_transition_unavailable');
  }
  return result.data;
}
export async function readExportJob(db, id, requester) {
  const result = await db.from('ca_operator_export_artifacts').select('*').eq('id', id).eq('requester_id', requester).maybeSingle();
  if (result.error) throw new Error('export_job_unavailable');
  if (!result.data) throw new Error('export_job_not_found');
  return result.data;
}
export function renderExportArtifact(job, capture) {
  const keys = [...new Set(capture.rows.flatMap((row) => Object.keys(row)))].sort();
  const marker = { __export_state: capture.complete ? 'COMPLETE READ-WINDOW REPORT' : 'INCOMPLETE BOUNDED REPORT',
    __export_scope: `${job.surface}; ${JSON.stringify(job.filters)}; ${capture.startedAt} to ${capture.capturedAt}; ${capture.disclosure}; Cap ${capture.cap}; Total ${capture.total ?? 'UNKNOWN'}` };
  const columns = [['__export_state', 'Export State'], ['__export_scope', 'Export Scope'], ...keys.map((key) => [key, key])];
  const bytes = Buffer.from(`\uFEFF${toCsv([marker, ...capture.rows], columns)}`, 'utf8');
  if (bytes.length > EXPORT_ARTIFACT_LIMITS.bytes) throw new Error('export_artifact_too_large');
  return { bytes, hash: artifactHash(bytes), path: `${job.requester_id}/${job.op_id}.csv` };
}

// Called once by the originating HTTP request's Vercel waitUntil. A timeout
// leaves a durable lease; only an explicit authenticated Resume can reclaim it.
export async function runExportArtifact(db, id, requester, { capture = captureExportSource, authority = freshExportOperator } = {}) {
  const lease = randomUUID();
  const claim = await exportTransition(db, id, requester, 'claim', lease);
  if (!claim?.claimed) return claim;
  try {
    let job = await readExportJob(db, id, requester);
    const op = await authority(db, requester, job.permission);
    let snapshot = job.snapshot;
    if (!snapshot) {
      snapshot = await capture({ db, op, job, onProgress: async (rows, total) => {
        const answer = await exportTransition(db, id, requester, 'progress', lease, { rows, total });
        if (!answer?.owned) throw new Error('export_lease_lost');
      } });
      const saved = await exportTransition(db, id, requester, 'capture', lease, snapshot);
      if (!saved?.owned) return saved;
    }
    await authority(db, requester, job.permission);
    const artifact = renderExportArtifact(job, snapshot);
    const bucket = db.storage.from(EXPORT_ARTIFACT_BUCKET);
    // Immutable key and digest make a lost upload acknowledgement recoverable.
    const upload = await bucket.upload(artifact.path, artifact.bytes, { contentType: 'text/csv', upsert: false });
    if (upload.error) {
      const existing = await bucket.download(artifact.path);
      if (existing.error || !existing.data || artifactHash(Buffer.from(await existing.data.arrayBuffer())) !== artifact.hash) throw new Error('export_upload_unconfirmed');
    }
    // Upload can outlive a role change. The durable receipt becomes available
    // only while the original requester still has the report authority.
    await authority(db, requester, job.permission);
    job = await readExportJob(db, id, requester);
    if (job.state !== 'running' || job.lease_id !== lease || Date.parse(job.expires_at) <= Date.now()) {
      if (job.state === 'cancelled' || Date.parse(job.expires_at) <= Date.now()) await bucket.remove([artifact.path]);
      return { owned: false };
    }
    return await exportTransition(db, id, requester, 'finish', lease, { object_path: artifact.path, sha256: artifact.hash, bytes: artifact.bytes.length });
  } catch (error) {
    const known = /^export_[a-z_]+$/.test(error?.code || error?.message || '') ? (error.code || error.message) : 'export_generation_failed';
    await exportTransition(db, id, requester, 'fail', lease, { code: known });
    return { failed: true, code: known };
  }
}
