const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

export async function submitReelReport({ reelId, reason, ownerId, accessToken, operationId }) {
  const cleanReason = String(reason || '').trim();
  if (!UUID_RE.test(String(reelId || '')) || !UUID_RE.test(String(ownerId || '')) || !cleanReason || !accessToken) {
    throw new Error('A signed-in account, Reel, and report reason are required');
  }
  const op = operationId || globalThis.crypto?.randomUUID?.();
  if (!UUID_RE.test(String(op || ''))) throw new Error('Report operation identity unavailable');
  const response = await fetch('/api/reels/report', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ operationId: op, ownerId, reelId, reason: cleanReason }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !payload?.receipt?.id) {
    throw new Error(payload?.error || 'Report could not be recorded');
  }
  return payload.receipt;
}
