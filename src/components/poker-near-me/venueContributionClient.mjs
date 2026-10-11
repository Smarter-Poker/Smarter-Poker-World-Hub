/** Finite contribution requests. An unreadable write is unknown, never failed. */
export function newContributionOperationId() {
  if (!globalThis.crypto?.randomUUID) throw new Error('A secure request ID is unavailable. Refresh this browser before submitting.');
  return globalThis.crypto.randomUUID();
}

export async function readContributionJson(response) {
  const payload = await response.json();
  if (!response.ok || payload?.success !== true) {
    const error = new Error(payload?.error || `Request was refused (${response.status}).`);
    error.status = response.status;
    error.confirmedRefusal = response.status >= 400 && response.status < 500;
    throw error;
  }
  return payload;
}

export async function sendContributionRequest(request, token, fetcher = fetch) {
  if (!token) {
    const error = new Error('Sign in before submitting a venue contribution.');
    error.confirmedRefusal = true;
    error.status = 401;
    throw error;
  }
  const response = await fetcher(request.url, {
    method: request.method || 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(request.body),
  });
  const payload = await readContributionJson(response);
  if (payload.operation_id !== request.body.operation_id || typeof payload.status !== 'string' || !payload.status) {
    throw new Error('The server did not return the original request receipt. Check its status before submitting again.');
  }
  return payload;
}

export async function readContributionOperation(operationId, token, fetcher = fetch) {
  if (!token) throw new Error('Sign in to check your original request.');
  const response = await fetcher(`/api/poker/venue-contributions?operation_id=${encodeURIComponent(operationId)}`, {
    credentials: 'include', cache: 'no-store', headers: { Authorization: `Bearer ${token}` },
  });
  const operation = (await readContributionJson(response)).operation;
  if (operation != null && (operation.operation_id !== operationId || typeof operation.status !== 'string' || !operation.status)) {
    throw new Error('The original request receipt could not be verified. Keep its ID and check again.');
  }
  return operation;
}

export function contributionPendingKey(userId, context) {
  return userId ? `pnm-contribution-pending:${userId}:${context}` : null;
}

export function savePendingContribution(storage, key, request) {
  if (key) storage.setItem(key, JSON.stringify(request));
}

export function loadPendingContribution(storage, key) {
  if (!key) return null;
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return value?.body?.operation_id && value?.url?.startsWith('/api/') ? value : null;
  } catch (_) { return null; }
}
