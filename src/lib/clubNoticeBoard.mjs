export const NOTICE_PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ROLE_META = {
    owner: { label: 'Owner', plural: 'Owners', rank: 1, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)' },
    co_owner: { label: 'Co-Owner', plural: 'Co-Owners', rank: 2, color: '#fb923c', bg: 'rgba(251, 146, 60, 0.16)' },
    admin: { label: 'Admin', plural: 'Admins', rank: 3, color: '#a855f7', bg: 'rgba(168, 85, 247, 0.16)' },
    super_agent: { label: 'Super Agent', plural: 'Super Agents', rank: 4, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.16)' },
    agent: { label: 'Agent', plural: 'Agents', rank: 5, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.16)' },
    sub_agent: { label: 'Sub-Agent', plural: 'Sub-Agents', rank: 6, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.16)' },
};

export function formatRoleLabel(role) {
    return ROLE_META[role]?.label || 'Staff';
}

export function normalizeRoleCounts(roleCounts, memberCount = 0) {
    const raw = roleCounts && typeof roleCounts === 'object' ? roleCounts : {};
    const owner = Number(raw.owner || 0);
    const co_owner = Number(raw.co_owner || 0);
    const admin = Number(raw.admin || 0);
    const super_agent = Number(raw.super_agent || 0);
    const agent = Number(raw.agent || 0);
    const sub_agent = Number(raw.sub_agent || 0);
    const management = Number(raw.management ?? (owner + co_owner + admin));
    const agents = Number(raw.agents ?? (super_agent + agent + sub_agent));
    const online = Number(raw.online || 0);
    const total = Number(raw.total ?? (memberCount || (management + agents)));
    return { owner, co_owner, admin, super_agent, agent, sub_agent, management, agents, online, total };
}

export function formatMemberSummary(roleCounts, memberCount = 0) {
    const c = normalizeRoleCounts(roleCounts, memberCount);
    if (!c.total) return 'Staff Channel';
    const parts = [`${c.total} ${c.total === 1 ? 'Member' : 'Members'}`];
    if (c.management > 0) parts.push(`${c.management} ${c.management === 1 ? 'Admin' : 'Admins'}`);
    if (c.agents > 0) parts.push(`${c.agents} ${c.agents === 1 ? 'Agent' : 'Agents'}`);
    if (c.online > 0) parts.push(`${c.online} Online`);
    return parts.join(' · ');
}

export function noticePage(result) {
    const rows = result.rows;
    if (!Array.isArray(rows) || !Array.isArray(result.pinned) || typeof result.canManage !== 'boolean') throw new Error('Notice Board Unavailable');
    const hasMore = rows.length > NOTICE_PAGE_SIZE;
    const entries = hasMore ? rows.slice(1) : rows;
    const first = entries[0];
    const members = Array.isArray(result.members) ? result.members : [];
    const memberCount = Number.isFinite(Number(result.memberCount)) ? Number(result.memberCount) : members.length;
    const roleCounts = normalizeRoleCounts(result.roleCounts, memberCount);
    const overduePayouts = Array.isArray(result.overduePayouts) ? result.overduePayouts : [];
    return {
        entries,
        pinned: result.pinned,
        canManage: result.canManage,
        viewerRole: typeof result.viewerRole === 'string' ? result.viewerRole : null,
        memberCount,
        roleCounts,
        members,
        overduePayouts,
        hasMore,
        cursor: first ? { before: first.created_at, beforeId: first.id } : null,
    };
}
export function validateNoticeRequest(method, body) {
    const fail = () => { throw Object.assign(new Error('Invalid Notice Board Request'), { status: 400 }); };
    if (!body || !UUID.test(body.clubId || '')) fail();
    const actions = { POST: 'read', PUT: 'create', PATCH: 'update', DELETE: 'delete' };
    const action = method === 'PATCH' && body.action === 'add_note' ? 'add_note' : actions[method];
    if (body.action !== undefined && !(method === 'PATCH' && body.action === 'add_note')) fail();
    if (!action) throw Object.assign(new Error('Method Not Allowed'), { status: 405 });
    const payload = body.payload || {};
    const allowed = action === 'add_note' ? ['id', 'version', 'note', 'op_id'] : action === 'read' ? ['before', 'beforeId'] : action === 'create'
        ? ['id', 'content', 'status', 'is_pinned'] : ['id', 'version', 'content', 'status', 'is_pinned'];
    if (Array.isArray(payload) || typeof payload !== 'object' || Object.keys(payload).some(k => !allowed.includes(k))) fail();
    if (action === 'read') {
        if (!!payload.before !== !!payload.beforeId) fail();
        // Preserve microseconds from Postgres; Date round-tripping loses cursor precision.
        if (payload.before && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(payload.before) || !Number.isFinite(Date.parse(payload.before)) || !UUID.test(payload.beforeId))) fail();
    } else {
        if (!UUID.test(payload.id || '')) fail();
        if (action !== 'create' && (!Number.isSafeInteger(payload.version) || payload.version < 1)) fail();
        if (action === 'add_note' && (typeof payload.note !== 'string' || !payload.note.trim() || payload.note.length > 2000 || !UUID.test(payload.op_id || ''))) fail();
        if (action === 'create' && (typeof payload.content !== 'string' || !payload.status)) fail();
        if (payload.content !== undefined && (typeof payload.content !== 'string' || !payload.content.trim() || payload.content.length > 4000)) fail();
        if (payload.status !== undefined && !['notice', 'pending_payout', 'paid'].includes(payload.status)) fail();
        if (payload.is_pinned !== undefined && typeof payload.is_pinned !== 'boolean') fail();
    }
    // Match persistence normalization before an idempotent create retry.
    const canonical = { ...payload };
    if (typeof canonical.note === 'string') canonical.note = canonical.note.trim();
    if (typeof canonical.content === 'string') canonical.content = canonical.content.trim();
    if (action === 'create' && canonical.status === 'paid') canonical.is_pinned = false;
    return { clubId: body.clubId, action, payload: canonical };
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
        if (!old || Number(row.version) > Number(old.version)) {
            // Preserve enriched author metadata when a raw realtime table event arrives.
            map.set(row.id, old ? {
                ...row,
                author_name: row.author_name ?? old.author_name,
                author_avatar: row.author_avatar ?? old.author_avatar,
                author_role: row.author_role ?? old.author_role,
            } : row);
        }
    }
    return [...map.values()].sort(compareNotices);
}
export function pendingPins(rows) {
    return rows.filter(row => !row.is_deleted && row.is_pinned === true && (row.status === 'pending_payout' || row.status === 'notice'));
}
export const pinnedNotices = pendingPins;
