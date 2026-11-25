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

export const REACTION_META = [
    { key: 'ack', emoji: '✅', label: 'Confirm' },
    { key: 'thumbs_up', emoji: '👍', label: 'Like' },
    { key: 'fire', emoji: '🔥', label: 'Fire' },
    { key: 'eyes', emoji: '👀', label: 'Seen' },
];
export const VALID_REACTIONS = new Set(REACTION_META.map(r => r.key));

export const DEFAULT_ALERT_SETTINGS = {
    overdue_threshold_hours: 4,
    followup_threshold_hours: null,
    notify_admins: false,
    auto_escalate_hours: null,
    quiet_hours_start: null,
    quiet_hours_end: null,
    quiet_hours_tz: 'America/Chicago',
    quiet_hours_backup_role: null,
};

export const ALLOWED_ATTACHMENT_MIME = /^(image\/(jpeg|jpg|png|webp|gif)|application\/pdf|text\/csv|text\/plain)$/i;

export function formatRoleLabel(role) {
    return ROLE_META[role]?.label || 'Staff';
}

export function formatSlaMinutes(minutes) {
    const n = Number(minutes);
    if (!Number.isFinite(n) || n < 0) return null;
    if (n < 1) return '<1m';
    if (n < 60) return `${Math.round(n)}m`;
    const h = Math.floor(n / 60);
    const m = Math.round(n % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Pure structured formatter (bold **text**, - bullets, clickable https:// links) with zero HTML injection.
export function parseNoticeFormatting(content) {
    const raw = String(content || '');
    const lines = raw.split('\n');
    const tokenRe = /(\*\*[^*\n]{1,300}\*\*|https:\/\/[^\s<>()[\]"']+)/g;
    return lines.map((line) => {
        const bulletMatch = line.match(/^\s*[-*•]\s+(.*)$/);
        const type = bulletMatch ? 'bullet' : 'line';
        const body = bulletMatch ? bulletMatch[1] : line;
        const segments = [];
        let lastIndex = 0;
        let match;
        tokenRe.lastIndex = 0;
        while ((match = tokenRe.exec(body)) !== null) {
            if (match.index > lastIndex) {
                segments.push({ type: 'text', text: body.slice(lastIndex, match.index) });
            }
            const tok = match[0];
            if (tok.startsWith('**') && tok.endsWith('**')) {
                segments.push({ type: 'bold', text: tok.slice(2, -2) });
            } else {
                const cleaned = tok.replace(/[.,;:!?]+$/, '');
                const trailing = tok.slice(cleaned.length);
                segments.push({ type: 'link', text: cleaned, href: cleaned });
                if (trailing) segments.push({ type: 'text', text: trailing });
            }
            lastIndex = match.index + tok.length;
        }
        if (lastIndex < body.length) {
            segments.push({ type: 'text', text: body.slice(lastIndex) });
        }
        return { type, segments };
    });
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

export function normalizeAlertSettings(raw) {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_ALERT_SETTINGS };
    const overdue = Number(raw.overdue_threshold_hours);
    const followup = raw.followup_threshold_hours === null || raw.followup_threshold_hours === undefined || raw.followup_threshold_hours === ''
        ? null : Number(raw.followup_threshold_hours);
    const autoEsc = raw.auto_escalate_hours === null || raw.auto_escalate_hours === undefined || raw.auto_escalate_hours === ''
        ? null : Number(raw.auto_escalate_hours);
    const qhStart = raw.quiet_hours_start === null || raw.quiet_hours_start === undefined || raw.quiet_hours_start === ''
        ? null : Number(raw.quiet_hours_start);
    const qhEnd = raw.quiet_hours_end === null || raw.quiet_hours_end === undefined || raw.quiet_hours_end === ''
        ? null : Number(raw.quiet_hours_end);
    const validQh = Number.isInteger(qhStart) && qhStart >= 0 && qhStart <= 23 && Number.isInteger(qhEnd) && qhEnd >= 0 && qhEnd <= 23;
    const backupRole = validQh && (raw.quiet_hours_backup_role === 'co_owner' || raw.quiet_hours_backup_role === 'admin')
        ? raw.quiet_hours_backup_role : null;
    const qhTz = typeof raw.quiet_hours_tz === 'string' && raw.quiet_hours_tz.trim()
        ? raw.quiet_hours_tz.trim().slice(0, 64) : 'America/Chicago';
    return {
        overdue_threshold_hours: Number.isFinite(overdue) && overdue >= 1 && overdue <= 72 ? Math.trunc(overdue) : 4,
        followup_threshold_hours: Number.isFinite(followup) ? Math.trunc(followup) : null,
        notify_admins: Boolean(raw.notify_admins),
        auto_escalate_hours: Number.isFinite(autoEsc) ? Math.trunc(autoEsc) : null,
        quiet_hours_start: validQh ? qhStart : null,
        quiet_hours_end: validQh ? qhEnd : null,
        quiet_hours_tz: qhTz,
        quiet_hours_backup_role: backupRole,
    };
}

export function normalizeReactions(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        ack: Number(src.ack || 0),
        thumbs_up: Number(src.thumbs_up || 0),
        fire: Number(src.fire || 0),
        eyes: Number(src.eyes || 0),
    };
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
    if (!result || typeof result !== 'object' || typeof result.canManage !== 'boolean') {
        throw new Error('Notice Board Unavailable');
    }
    if (result.metaOnly === true) {
        const members = Array.isArray(result.members) ? result.members : [];
        const memberCount = Number.isFinite(Number(result.memberCount)) ? Number(result.memberCount) : members.length;
        return {
            metaOnly: true,
            canManage: result.canManage,
            viewerRole: typeof result.viewerRole === 'string' ? result.viewerRole : null,
            memberCount,
            roleCounts: normalizeRoleCounts(result.roleCounts, memberCount),
            members,
            overduePayouts: Array.isArray(result.overduePayouts) ? result.overduePayouts : [],
            alertSettings: result.alertSettings ? normalizeAlertSettings(result.alertSettings) : null,
        };
    }
    const rows = result.rows;
    if (!Array.isArray(rows) || !Array.isArray(result.pinned)) throw new Error('Notice Board Unavailable');
    const hasMore = rows.length > NOTICE_PAGE_SIZE;
    const entries = hasMore ? rows.slice(1) : rows;
    const first = entries[0];
    if (result.paginated === true) {
        return {
            paginated: true,
            entries,
            pinned: [],
            canManage: result.canManage,
            viewerRole: typeof result.viewerRole === 'string' ? result.viewerRole : null,
            hasMore,
            cursor: first ? { before: first.created_at, beforeId: first.id } : null,
        };
    }
    const members = Array.isArray(result.members) ? result.members : [];
    const memberCount = Number.isFinite(Number(result.memberCount)) ? Number(result.memberCount) : members.length;
    const roleCounts = normalizeRoleCounts(result.roleCounts, memberCount);
    const overduePayouts = Array.isArray(result.overduePayouts) ? result.overduePayouts : [];
    return {
        entries,
        pinned: result.pinned,
        scheduledNotices: Array.isArray(result.scheduledNotices) ? result.scheduledNotices : [],
        canManage: result.canManage,
        viewerRole: typeof result.viewerRole === 'string' ? result.viewerRole : null,
        memberCount,
        roleCounts,
        members,
        overduePayouts,
        alertSettings: result.alertSettings ? normalizeAlertSettings(result.alertSettings) : null,
        previousLastReadAt: typeof result.previousLastReadAt === 'string' ? result.previousLastReadAt : null,
        unreadCount: Number.isFinite(Number(result.unreadCount)) ? Number(result.unreadCount) : 0,
        hasMore,
        cursor: first ? { before: first.created_at, beforeId: first.id } : null,
    };
}

const POST_SUBACTIONS = new Set(['entry', 'search', 'list_replies']);
const PATCH_SUBACTIONS = new Set([
    'add_note', 'mark_read', 'toggle_reaction', 'update_alert_settings',
    'create_reply', 'delete_reply', 'vote_poll', 'close_poll',
    'remind_unconfirmed', 'reorder_pins', 'publish_now',
]);
const ISO_TS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/;

export function validateNoticeRequest(method, body) {
    const fail = () => { throw Object.assign(new Error('Invalid Notice Board Request'), { status: 400 }); };
    if (!body || !UUID.test(body.clubId || '')) fail();
    const actions = { POST: 'read', PUT: 'create', PATCH: 'update', DELETE: 'delete' };
    const subAction = method === 'POST' && POST_SUBACTIONS.has(body.action)
        ? body.action
        : method === 'PATCH' && PATCH_SUBACTIONS.has(body.action)
            ? body.action
            : null;
    const action = subAction || actions[method];
    if (body.action !== undefined && !subAction) fail();
    if (!action) throw Object.assign(new Error('Method Not Allowed'), { status: 405 });
    const payload = body.payload || {};
    const allowedByAction = {
        read: ['before', 'beforeId', 'refreshMeta'],
        entry: ['id'],
        search: ['query', 'limit'],
        list_replies: ['id'],
        mark_read: ['lastNoticeId'],
        toggle_reaction: ['id', 'reaction'],
        create_reply: ['id', 'reply_id', 'content'],
        delete_reply: ['reply_id'],
        vote_poll: ['id', 'option_id'],
        close_poll: ['id'],
        remind_unconfirmed: ['id'],
        reorder_pins: ['notice_ids'],
        publish_now: ['id'],
        update_alert_settings: [
            'overdue_threshold_hours', 'followup_threshold_hours', 'notify_admins', 'auto_escalate_hours',
            'quiet_hours_start', 'quiet_hours_end', 'quiet_hours_tz', 'quiet_hours_backup_role',
        ],
        add_note: ['id', 'version', 'note', 'op_id'],
        create: ['id', 'content', 'status', 'is_pinned', 'attachments', 'mention_user_ids', 'mention_all', 'require_confirmation', 'scheduled_for', 'poll'],
        update: ['id', 'version', 'content', 'status', 'is_pinned', 'attachments'],
        delete: ['id', 'version'],
    };
    const allowed = allowedByAction[action];
    if (Array.isArray(payload) || typeof payload !== 'object' || Object.keys(payload).some(k => !allowed.includes(k))) fail();

    if (action === 'read') {
        if (payload.refreshMeta !== undefined && typeof payload.refreshMeta !== 'boolean') fail();
        if (!!payload.before !== !!payload.beforeId) fail();
        if (payload.refreshMeta && payload.before) fail();
        // Preserve microseconds from Postgres; Date round-tripping loses cursor precision.
        if (payload.before && (!ISO_TS.test(payload.before) || !Number.isFinite(Date.parse(payload.before)) || !UUID.test(payload.beforeId))) fail();
    } else if (action === 'entry' || action === 'list_replies' || action === 'close_poll' || action === 'remind_unconfirmed' || action === 'publish_now') {
        if (!UUID.test(payload.id || '')) fail();
    } else if (action === 'search') {
        if (typeof payload.query !== 'string' || !payload.query.trim() || payload.query.trim().length > 200) fail();
        if (payload.limit !== undefined && (!Number.isSafeInteger(payload.limit) || payload.limit < 1 || payload.limit > 50)) fail();
    } else if (action === 'create_reply') {
        if (!UUID.test(payload.id || '')) fail();
        if (payload.reply_id !== undefined && payload.reply_id !== null && !UUID.test(payload.reply_id)) fail();
        if (typeof payload.content !== 'string' || !payload.content.trim() || payload.content.length > 1000) fail();
    } else if (action === 'delete_reply') {
        if (!UUID.test(payload.reply_id || '')) fail();
    } else if (action === 'vote_poll') {
        if (!UUID.test(payload.id || '') || typeof payload.option_id !== 'string' || !payload.option_id.trim() || payload.option_id.length > 64) fail();
    } else if (action === 'reorder_pins') {
        if (!Array.isArray(payload.notice_ids) || payload.notice_ids.length === 0 || payload.notice_ids.length > 50 || payload.notice_ids.some(id => !UUID.test(id || ''))) fail();
    } else if (action === 'mark_read') {
        if (payload.lastNoticeId !== undefined && payload.lastNoticeId !== null && !UUID.test(payload.lastNoticeId)) fail();
    } else if (action === 'toggle_reaction') {
        if (!UUID.test(payload.id || '') || !VALID_REACTIONS.has(payload.reaction)) fail();
    } else if (action === 'update_alert_settings') {
        const th = Number(payload.overdue_threshold_hours);
        if (!Number.isSafeInteger(th) || th < 1 || th > 72) fail();
        if (payload.followup_threshold_hours !== undefined && payload.followup_threshold_hours !== null) {
            const fu = Number(payload.followup_threshold_hours);
            if (!Number.isSafeInteger(fu) || fu <= th || fu > 168) fail();
        }
        if (payload.auto_escalate_hours !== undefined && payload.auto_escalate_hours !== null) {
            const ae = Number(payload.auto_escalate_hours);
            if (!Number.isSafeInteger(ae) || ae < th || ae > 168) fail();
        }
        if (payload.notify_admins !== undefined && typeof payload.notify_admins !== 'boolean') fail();
        const hasQhStart = payload.quiet_hours_start !== undefined && payload.quiet_hours_start !== null;
        const hasQhEnd = payload.quiet_hours_end !== undefined && payload.quiet_hours_end !== null;
        if (hasQhStart !== hasQhEnd) fail();
        if (hasQhStart) {
            const qs = Number(payload.quiet_hours_start);
            const qe = Number(payload.quiet_hours_end);
            if (!Number.isSafeInteger(qs) || qs < 0 || qs > 23 || !Number.isSafeInteger(qe) || qe < 0 || qe > 23) fail();
        }
        if (payload.quiet_hours_tz !== undefined && payload.quiet_hours_tz !== null && (typeof payload.quiet_hours_tz !== 'string' || !payload.quiet_hours_tz.trim() || payload.quiet_hours_tz.length > 64)) fail();
        if (payload.quiet_hours_backup_role !== undefined && payload.quiet_hours_backup_role !== null && !['co_owner', 'admin'].includes(payload.quiet_hours_backup_role)) fail();
    } else {
        if (!UUID.test(payload.id || '')) fail();
        if (action !== 'create' && (!Number.isSafeInteger(payload.version) || payload.version < 1)) fail();
        if (action === 'add_note' && (typeof payload.note !== 'string' || !payload.note.trim() || payload.note.length > 2000 || !UUID.test(payload.op_id || ''))) fail();
        if (action === 'create' && (typeof payload.content !== 'string' || !payload.status)) fail();
        if (payload.content !== undefined && (typeof payload.content !== 'string' || !payload.content.trim() || payload.content.length > 4000)) fail();
        if (payload.status !== undefined && !['notice', 'pending_payout', 'paid'].includes(payload.status)) fail();
        if (payload.is_pinned !== undefined && typeof payload.is_pinned !== 'boolean') fail();
        if (payload.require_confirmation !== undefined && typeof payload.require_confirmation !== 'boolean') fail();
        if (payload.scheduled_for !== undefined && payload.scheduled_for !== null) {
            if (typeof payload.scheduled_for !== 'string' || !ISO_TS.test(payload.scheduled_for) || !Number.isFinite(Date.parse(payload.scheduled_for))) fail();
        }
        if (payload.poll !== undefined && payload.poll !== null) {
            const p = payload.poll;
            if (typeof p !== 'object' || Array.isArray(p)) fail();
            if (typeof p.question !== 'string' || !p.question.trim() || p.question.trim().length > 240) fail();
            if (!Array.isArray(p.options) || p.options.length < 2 || p.options.length > 6) fail();
            for (const opt of p.options) {
                const label = typeof opt === 'string' ? opt : opt?.label;
                if (typeof label !== 'string' || !label.trim() || label.trim().length > 120) fail();
            }
            if (p.allow_multiple !== undefined && typeof p.allow_multiple !== 'boolean') fail();
        }
        if (payload.attachments !== undefined) {
            if (!Array.isArray(payload.attachments) || payload.attachments.length > 4) fail();
            for (const att of payload.attachments) {
                if (!att || typeof att !== 'object' || typeof att.url !== 'string' || !/^https:\/\/\S{1,2040}$/i.test(att.url.trim())) fail();
                if (att.mime !== undefined && (typeof att.mime !== 'string' || !ALLOWED_ATTACHMENT_MIME.test(att.mime.trim()))) fail();
            }
        }
        if (payload.mention_user_ids !== undefined) {
            if (!Array.isArray(payload.mention_user_ids) || payload.mention_user_ids.length > 100 || payload.mention_user_ids.some(id => !UUID.test(id || ''))) fail();
        }
        if (payload.mention_all !== undefined && typeof payload.mention_all !== 'boolean') fail();
    }

    // Match persistence normalization before an idempotent create retry.
    const canonical = { ...payload };
    if (typeof canonical.note === 'string') canonical.note = canonical.note.trim();
    if (typeof canonical.content === 'string') canonical.content = canonical.content.trim();
    if (typeof canonical.query === 'string') canonical.query = canonical.query.trim();
    if (action === 'create' && canonical.status === 'paid') canonical.is_pinned = false;
    if (action === 'create' && canonical.status === 'pending_payout' && canonical.is_pinned === undefined) canonical.is_pinned = true;
    if (canonical.poll && typeof canonical.poll === 'object') {
        canonical.poll = {
            question: canonical.poll.question.trim(),
            options: canonical.poll.options.map(opt => (typeof opt === 'string' ? opt.trim() : opt.label.trim())),
            allow_multiple: Boolean(canonical.poll.allow_multiple),
        };
    }
    if (Array.isArray(canonical.attachments)) {
        canonical.attachments = canonical.attachments.map(a => {
            const mime = typeof a.mime === 'string' && a.mime.trim() ? a.mime.trim().toLowerCase().slice(0, 64) : 'image/jpeg';
            const fallbackName = mime === 'application/pdf' ? 'Document.pdf' : mime.startsWith('text/') ? 'Sheet.csv' : 'Image';
            return {
                url: a.url.trim(),
                name: typeof a.name === 'string' && a.name.trim() ? a.name.trim().slice(0, 120) : fallbackName,
                mime,
            };
        });
    }
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
        const incomingEnriched = (row.reactions && typeof row.reactions === 'object') || row.reply_count !== undefined;
        if (!old || Number(row.version) > Number(old.version) || (Number(row.version) === Number(old.version) && incomingEnriched)) {
            // Preserve enriched metadata when a raw realtime table event arrives.
            map.set(row.id, old ? {
                ...row,
                author_name: row.author_name ?? old.author_name,
                author_avatar: row.author_avatar ?? old.author_avatar,
                author_role: row.author_role ?? old.author_role,
                seen_count: row.seen_count ?? old.seen_count,
                reactions: row.reactions ?? old.reactions,
                my_reactions: row.my_reactions ?? old.my_reactions,
                ack_users: row.ack_users ?? old.ack_users,
                attachments: row.attachments ?? old.attachments,
                mentions: row.mentions ?? old.mentions,
                require_confirmation: row.require_confirmation ?? old.require_confirmation,
                last_reminded_at: row.last_reminded_at ?? old.last_reminded_at,
                unconfirmed_count: row.unconfirmed_count ?? old.unconfirmed_count,
                unconfirmed_users: row.unconfirmed_users ?? old.unconfirmed_users,
                reply_count: row.reply_count ?? old.reply_count,
                recent_replies: row.recent_replies ?? old.recent_replies,
                poll: row.poll !== undefined ? row.poll : old.poll,
                poll_results: row.poll_results !== undefined ? row.poll_results : old.poll_results,
                my_poll_votes: row.my_poll_votes ?? old.my_poll_votes,
                pin_order: row.pin_order ?? old.pin_order,
                scheduled_for: row.scheduled_for !== undefined ? row.scheduled_for : old.scheduled_for,
            } : row);
        }
    }
    return [...map.values()].sort(compareNotices);
}

export function pendingPins(rows) {
    return rows
        .filter(row => !row.is_deleted && row.is_pinned === true && (row.status === 'pending_payout' || row.status === 'notice'))
        .sort((a, b) => (Number(a.pin_order ?? 0) - Number(b.pin_order ?? 0)) || compareNotices(a, b));
}
export const pinnedNotices = pendingPins;
