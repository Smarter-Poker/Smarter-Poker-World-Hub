// A pre-destination feed can contain retained operational originals. Do not
// paint that cached personal list after the destination cutover.
const CACHE_VERSION = 3;
const CACHE_MAX_AGE_MS = 300_000;

export function notificationCache(rows, userId, now = Date.now()) {
    if (!userId) return null;
    const visible = rows.slice(0, 30);
    return JSON.stringify(visible.map((row, index) => index === 0 ? {
        ...row, _cache_ts: now, _cache_user: userId, _cache_version: CACHE_VERSION,
    } : row));
}

export function readNotificationCache(raw, userId, now = Date.now()) {
    if (!raw || !userId) return null;
    try {
        const rows = JSON.parse(raw);
        const first = Array.isArray(rows) ? rows[0] : null;
        const age = now - first?._cache_ts;
        if (!first || first._cache_version !== CACHE_VERSION || first._cache_user !== userId ||
            !Number.isFinite(age) || age < 0 || age >= CACHE_MAX_AGE_MS) return null;
        return rows;
    } catch { return null; }
}
