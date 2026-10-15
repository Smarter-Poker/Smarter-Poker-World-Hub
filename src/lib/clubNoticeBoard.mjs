export const NOTICE_PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function noticePage(result) {
    const rows = result.rows;
    if (!Array.isArray(rows) || !Array.isArray(result.pinned) || typeof result.canManage !== 'boolean') throw new Error('Notice Board Unavailable');
    const hasMore = rows.length > NOTICE_PAGE_SIZE;
    const entries = hasMore ? rows.slice(1) : rows;
    const first = entries[0];
    return { entries, pinned: result.pinned, canManage: result.canManage, hasMore,
        cursor: first ? { before: first.created_at, beforeId: first.id } : null };
}
export function validateNoticeRequest(method, body) {
    const fail = () => { throw Object.assign(new Error('Invalid Notice Board Request'), { status: 400 }); };
    if (!body || !UUID.test(body.clubId || '')) fail();
    const actions = { POST: 'read', PUT: 'create', PATCH: 'update', DELETE: 'delete' };
    const action = actions[method];
    if (!action) throw Object.assign(new Error('Method Not Allowed'), { status: 405 });
    const payload = body.payload || {};
    const allowed = action === 'read' ? ['before', 'beforeId'] : action === 'create'
        ? ['id', 'content', 'status', 'is_pinned'] : ['id', 'version', 'content', 'status', 'is_pinned'];
    if (Array.isArray(payload) || typeof payload !== 'object' || Object.keys(payload).some(k => !allowed.includes(k))) fail();
    if (action === 'read') {
        if (!!payload.before !== !!payload.beforeId) fail();
        // Preserve microseconds from Postgres; Date round-tripping loses cursor precision.
        if (payload.before && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(payload.before) || !Number.isFinite(Date.parse(payload.before)) || !UUID.test(payload.beforeId))) fail();
    } else {
        if (!UUID.test(payload.id || '')) fail();
        if (action !== 'create' && (!Number.isSafeInteger(payload.version) || payload.version < 1)) fail();
        if (action === 'create' && (typeof payload.content !== 'string' || !payload.status)) fail();
        if (payload.content !== undefined && (typeof payload.content !== 'string' || !payload.content.trim() || payload.content.length > 4000)) fail();
        if (payload.status !== undefined && !['notice', 'pending_payout', 'paid'].includes(payload.status)) fail();
        if (payload.is_pinned !== undefined && typeof payload.is_pinned !== 'boolean') fail();
    }
    return { clubId: body.clubId, action, payload };
}
// Compare instants without dropping Postgres microseconds or relying on a
// particular timezone suffix from realtime versus the JSON API.
export function compareNotices(a, b) {
    const microseconds = row => Number((row.created_at.match(/\.(\d+)/)?.[1] || '').padEnd(6, '0').slice(3, 6));
    return Date.parse(a.created_at) - Date.parse(b.created_at) || microseconds(a) - microseconds(b) || a.id.localeCompare(b.id);
}
// Keep tombstones while mounted: delayed history/events must never resurrect a delete.
export function mergeNotices(previous, incoming) {
    const map = new Map(previous.map(row => [row.id, row]));
    for (const row of incoming) {
        const old = map.get(row.id);
        if (!old || Number(row.version) > Number(old.version)) map.set(row.id, row);
    }
    return [...map.values()].sort(compareNotices);
}
export function pendingPins(rows) {
    return rows.filter(row => !row.is_deleted && row.is_pinned === true && row.status === 'pending_payout');
}
