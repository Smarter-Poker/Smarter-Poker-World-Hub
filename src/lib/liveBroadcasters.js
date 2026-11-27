/**
 * Attach the broadcaster's display-safe identity to live_streams and
 * scheduled_lives rows, for signed-in and signed-out visitors alike.
 *
 * /hub/lives used to embed `broadcaster:profiles!broadcaster_id(...)` in its
 * reads. That embed needs SELECT on profiles, which `anon` does not have, so a
 * signed-out visitor's whole read failed and the page said "No Lives Yet".
 * The rows themselves are readable by anon; only the names were not. They now
 * come from GET /api/live/broadcasters, which returns id, username,
 * display_name and avatar_url for broadcasters of publicly visible streams.
 *
 * A failed name lookup never hides a stream: the rows come back with a null
 * identity and `failed: true`, and the page shows them without names.
 */

export const BROADCASTERS_ENDPOINT = '/api/live/broadcasters';
const MAX_IDS_PER_REQUEST = 60;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** { [broadcasterId]: { id, username, display_name, avatar_url } }; throws when it cannot read. */
export async function fetchBroadcasters(ids, fetchImpl = typeof fetch === 'function' ? fetch : null) {
  const unique = [...new Set((ids || []).filter(Boolean).map((id) => String(id).toLowerCase()))];
  if (unique.length === 0) return {};
  if (!fetchImpl) throw new Error('fetch is unavailable');
  const merged = {};
  for (const part of chunk(unique, MAX_IDS_PER_REQUEST)) {
    const resp = await fetchImpl(`${BROADCASTERS_ENDPOINT}?ids=${encodeURIComponent(part.join(','))}`, {
      credentials: 'same-origin',
    });
    let body = null;
    try {
      body = await resp.json();
    } catch (_) {
      body = null;
    }
    if (!resp.ok || !body?.success || !body.broadcasters || typeof body.broadcasters !== 'object') {
      throw new Error(body?.error || `Broadcaster lookup failed (${resp.status})`);
    }
    Object.assign(merged, body.broadcasters);
  }
  return merged;
}

/**
 * Returns { rows, failed }. Each row gains `field` (default `broadcaster`)
 * holding its broadcaster's identity, or null when it is unknown.
 */
export async function attachBroadcasters(rows, { field = 'broadcaster', fetchImpl } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  try {
    const byId = await fetchBroadcasters(
      list.map((row) => row?.broadcaster_id),
      fetchImpl,
    );
    return {
      rows: list.map((row) => ({
        ...row,
        [field]: byId[String(row?.broadcaster_id || '').toLowerCase()] || null,
      })),
      failed: false,
    };
  } catch (error) {
    console.warn('[lives] broadcaster names could not be read:', error?.message || error);
    return { rows: list.map((row) => ({ ...row, [field]: row?.[field] ?? null })), failed: true };
  }
}
