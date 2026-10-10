const pendingOperations = new Map();
export function captureExportScope(authFetch, explicitScope) {
  const scope = explicitScope || authFetch?.captureScope?.();
  if (!scope || typeof scope.operatorId !== 'string' || !scope.operatorId || typeof scope.isCurrent !== 'function') throw new Error('The Operator Account Could Not Be Confirmed');
  if (scope.isCurrent() !== true) throw new Error('The Account Or View Changed. Refresh The Original Operation.');
  return scope;
}
const requireCurrent = (scope) => { if (scope.isCurrent() !== true) throw new Error('The Account Or View Changed. Refresh The Original Operation.'); };
export async function requestExportArtifact(authFetch, surface, filters = {}, options = {}) {
  if (typeof authFetch !== 'function') throw new Error('An Authenticated Export Path Is Required');
  const scope = captureExportScope(authFetch, options.scope);
  const clean = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  const key = JSON.stringify({ operatorId: scope.operatorId, surface, filters: Object.fromEntries(Object.entries(clean).sort()) });
  const storageKey = `operator-export-pending:${key}`;
  let stored;
  try { stored = globalThis.sessionStorage?.getItem(storageKey); } catch { /* Memory and the visible operation ID remain available. */ }
  const opId = pendingOperations.get(key) || (/^[0-9a-f-]{36}$/i.test(stored || '') ? stored : null) || globalThis.crypto.randomUUID();
  pendingOperations.set(key, opId);
  try { globalThis.sessionStorage?.setItem(storageKey, opId); } catch { /* Storage can be disabled. */ }
  try {
    const response = await authFetch('/api/horses/export-artifacts', { method: 'POST', body: JSON.stringify({ action: 'request', surface, filters: clean, opId }), isCurrent: scope.isCurrent, expectedOperatorId: scope.operatorId });
    requireCurrent(scope);
    const job = (response?.data ?? response)?.job;
    if (!job?.id) throw new Error('The Export Receipt Was Not Confirmed');
    pendingOperations.delete(key);
    try { globalThis.sessionStorage?.removeItem(storageKey); } catch { /* Storage can be disabled. */ }
    globalThis.dispatchEvent?.(new Event('operator-export-requested'));
    return { queued: true, jobId: job.id, state: job.state, complete: null, exported: null, total: job.total ?? null };
  } catch (error) {
    const next = new Error(`${error?.message || 'The Export Outcome Is Unknown'}. Operation ID: ${opId}. Retry This Same Report To Read The Original Outcome.`);
    next.opId = opId;
    throw next;
  }
}

export async function downloadExportArtifact(authFetch, job, acknowledged = false, options = {}) {
  const scope = captureExportScope(authFetch, options.scope);
  const result = await authFetch(`/api/horses/export-artifacts?id=${encodeURIComponent(job.id)}&download=1${acknowledged ? '&acknowledge=1' : ''}`, { responseType: 'blob', isCurrent: scope.isCurrent, expectedOperatorId: scope.operatorId });
  requireCurrent(scope);
  const bytes = await result.blob.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  requireCurrent(scope);
  if (hash !== job.content_sha256 || hash !== result.contentSha256) throw new Error('The Download Does Not Match The Recorded File Hash');
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${job.surface}-${job.state === 'truncated' ? 'incomplete-' : ''}${job.id}.csv`;
  document.body.appendChild(anchor);
  try { requireCurrent(scope); anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

}
