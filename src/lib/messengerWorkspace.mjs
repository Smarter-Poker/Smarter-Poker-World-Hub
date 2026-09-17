// Server-side workspace selection. A page identity or URL is never membership.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_ROLES = new Set(['owner', 'co_owner', 'admin']);

function fail(status, message) {
    throw Object.assign(new Error(message), { status });
}

async function rows(query) {
    const { data, error } = await query;
    if (error || !Array.isArray(data)) fail(503, 'Messenger Is Temporarily Unavailable');
    return data;
}

// Read to exhaustion, including when the server applies a smaller page cap.
async function pages(makeQuery, key) {
    const result = [];
    let after = null;
    for (;;) {
        let query = makeQuery().order(key, { ascending: true }).limit(200);
        if (after) query = query.gt(key, after);
        const next = await rows(query);
        if (!next.length) return result;
        const cursor = next.at(-1)[key];
        if (!cursor || (after && cursor <= after)) fail(503, 'Messenger Pagination Failed');
        result.push(...next);
        after = cursor;
    }
}

async function byIds(db, table, columns, field, ids) {
    const result = [];
    for (let start = 0; start < ids.length; start += 100) {
        result.push(...await pages(() => db.from(table).select(columns).in(field, ids.slice(start, start + 100)), 'id'));
    }
    return result;
}

export async function getMessengerClubs(db, userId) {
    const memberships = await pages(() => db.from('club_members')
        .select('club_id,role').eq('user_id', userId).eq('is_active', true)
        .eq('membership_lifecycle_status', 'active').in('status', ['active', 'approved']), 'club_id');
    const ids = memberships.map(m => m.club_id);
    if (!ids.length) return [];
    const clubs = await byIds(db, 'clubs', 'id,name,avatar_url', 'id', ids);
    const socialPages = (await byIds(db, 'social_pages', 'id,name,avatar_url,linked_entity_id,linked_entity_type', 'linked_entity_id', ids))
        .filter(p => p.linked_entity_type === 'club');
    return clubs.map(club => ({
        id: club.id, name: club.name, avatar_url: club.avatar_url,
        pageId: socialPages.find(p => p.linked_entity_id === club.id)?.id || null,
        canManage: ADMIN_ROLES.has(memberships.find(m => m.club_id === club.id)?.role),
    }));
}

async function accountingMap(db, ids, userId) {
    const map = new Map();
    // The mapping is unique by audience, not by a synthetic row id.
    for (let start = 0; start < ids.length; start += 100) {
        const records = await rows(db.from('accounting_conversations')
            .select('conversation_id,scope_id,recipient_id,sender_id,issuer_type,last_discussion_at')
            .in('conversation_id', ids.slice(start, start + 100)));
        if (records.length) {
            const { data: visibility, error } = await db.rpc('fn_messenger_private_accounting_threads', {
                p_user_id: userId, p_conversation_ids: records.map(record => record.conversation_id),
            });
            if (error || !Array.isArray(visibility)) fail(503, 'Invoice Threads Unavailable');
            for (const record of records) {
                const visible = visibility.find(row => row.conversation_id === record.conversation_id);
                if (!visible) fail(503, 'Invoice Thread Unavailable');
                map.set(record.conversation_id, { ...record, ...visible });
            }
        }
    }
    return map;
}

export function selectWorkspaceConversations(conversations, accounting, userId, club, folder) {
    return conversations.filter(c => {
        const invoice = accounting.get(c.id);
        if (folder === 'invoices') {
            // An issuer's participation allows replies but must not turn every
            // agent's private invoice into a separate club inbox item.
            return invoice?.scope_id === club?.id && ((invoice.recipient_id === userId && invoice.recipient_visible) || (invoice.sender_id === userId && !!invoice.last_discussion_at));
        }
        return !invoice;
    }).map(c => ({ ...c, isAccounting: accounting.has(c.id), clubId: club?.id || null }));
}

export async function getMessengerWorkspace(db, userId, request) {
    const clubs = await getMessengerClubs(db, userId);
    const workspace = request.workspace || 'social';
    if (!['social', 'club', 'resolve'].includes(workspace)) fail(400, 'Invalid Messenger Workspace');
    let club = null;
    let folder = request.folder || 'messages';
    let contextId = null;
    let resolvedId = null;
    if (workspace === 'resolve') {
        if (!UUID.test(request.conversationId || '')) fail(400, 'Invalid Conversation');
        const participation = await rows(db.from('social_conversation_participants').select('conversation_id,context_entity_id')
            .eq('user_id', userId).eq('conversation_id', request.conversationId));
        if (participation.length !== 1) fail(403, 'Conversation Unavailable');
        const mapping = (await accountingMap(db, [request.conversationId], userId)).get(request.conversationId);
        contextId = participation[0].context_entity_id;
        club = clubs.find(c => mapping ? c.id === mapping.scope_id : c.pageId === contextId) || null;
        if ((mapping || contextId) && !club) fail(403, 'Active Club Membership Required');
        folder = mapping ? 'invoices' : 'messages';
        if (mapping && !(mapping.recipient_id === userId && mapping.recipient_visible) && !(mapping.sender_id === userId && mapping.last_discussion_at)) fail(403, 'Open The Club Weekly Statement');
        resolvedId = request.conversationId;
    } else if (workspace === 'club') {
        if (!UUID.test(request.clubId || '')) fail(400, 'Choose A Club');
        club = clubs.find(c => c.id === request.clubId);
        if (!club) fail(403, 'Active Club Membership Required');
        contextId = club.pageId;
    } else {
        folder = 'messages';
    }
    if (!['messages', 'invoices'].includes(folder)) fail(400, 'Invalid Messenger Tab');
    // A club with no social page has no ordinary club-context messages. Its
    // accounting conversations are still found through the authoritative map.
    const { data, error } = await db.rpc('fn_get_user_conversations', {
        p_user_id: userId, p_context_entity_id: contextId,
    });
    if (error || !Array.isArray(data)) fail(503, 'Messenger Is Temporarily Unavailable');
    const unique = [...new Map(data.map(c => [c.conversation_id || c.id, c])).values()];
    const ids = unique.map(c => c.conversation_id || c.id);
    const [meta, accounting] = await Promise.all([
        byIds(db, 'social_conversations', 'id,is_request,request_sender_id,last_message_preview,group_name', 'id', ids),
        accountingMap(db, ids, userId),
    ]);
    const metadata = new Map(meta.map(c => [c.id, c]));
    const clubBrands = new Map();
    if (ids.length) {
        const branded = await rows(db.from('social_messages').select('conversation_id,media_metadata')
            .in('conversation_id', ids).neq('sender_id', userId).contains('media_metadata', { is_club_identity: true })
            .order('created_at', { ascending: false }).limit(500));
        for (const message of branded) {
            if (!clubBrands.has(message.conversation_id)) clubBrands.set(message.conversation_id, message.media_metadata);
        }
    }
    const conversations = unique.map(c => {
        const id = c.conversation_id || c.id;
        const m = metadata.get(id);
        if (!m) fail(503, 'Conversation Details Unavailable');
        const brand = clubBrands.get(id);
        const name = brand?.club_name || c.other_user_username;
        return {
            id, title: c.title || m.group_name, is_group: !!c.is_group,
            last_message_at: accounting.get(id)?.last_message_at ?? c.last_message_at,
            last_message_preview: accounting.has(id) ? accounting.get(id).last_message_preview : m.last_message_preview,
            unreadCount: Number(c.unread_count || 0), last_read_at: c.last_read_at || null,
            isRequest: !!m.is_request, requestSenderId: m.request_sender_id,
            otherUser: c.other_user_id ? {
                id: c.other_user_id, username: name,
                display_name: name, full_name: name,
                avatar_url: brand?.club_avatar || c.other_user_avatar,
                is_club_identity: !!brand, club_id: brand?.club_id || null,
            } : null,
        };
    }).filter(c => !c.isRequest || c.requestSenderId === userId);
    const selected = club && !club.pageId && folder === 'messages' ? []
        : selectWorkspaceConversations(conversations, accounting, userId, club, folder);
    const conversation = resolvedId ? selected.find(c => c.id === resolvedId) : null;
    if (resolvedId && !conversation) fail(404, 'Conversation Unavailable');
    let weeklySummary = null;
    if (club?.canManage && folder === 'invoices') {
        // The period's recorded book decides union versus standalone scope.
        // Current membership does not decide where historical rake was earned.
        const periods = await rows(db.from('settlement_periods').select('id,club_id,union_id,start_at,end_at')
            .eq('club_id', club.id).lte('end_at', new Date().toISOString())
            .order('end_at', { ascending: false }).limit(2));
        if (periods.length) {
            const period = periods[0];
            // Two recorded books ending together require a canonical combined
            // statement. Do not pick one arbitrarily or add money in Messenger.
            if (periods[1] && Date.parse(periods[1].end_at) === Date.parse(period.end_at)) fail(503, 'Weekly Statement Unavailable');
            // Authorization and canonical summary run in one database snapshot.
            // This trusted server must pass the JWT actor, not rely on its own
            // service-role bypass or a prior membership query remaining current.
            const { data: receipt, error: reportError } = await db.rpc('fn_messenger_private_weekly_summary', {
                p_user_id: userId, p_club_id: club.id, p_period_id: period.id,
            });
            const report = receipt?.summary;
            const sameTime = (left, right) => Number.isFinite(Date.parse(left)) && Date.parse(left) === Date.parse(right);
            if (reportError || receipt?.contract_version !== 1 || receipt.user_id !== userId ||
                receipt.club_id !== club.id || receipt.period_id !== period.id || !report ||
                period.club_id !== club.id || report.period_id !== period.id || report.club_id !== club.id ||
                report.union_id !== period.union_id || report.accounting_version !== 3 || report.currency !== 'CHIPS' ||
                report.scope_kind !== (period.union_id === null ? 'club' : 'union') ||
                report.scope_id !== (period.union_id === null ? club.id : period.union_id) ||
                !sameTime(report.period_start, period.start_at) || !sameTime(report.period_end, period.end_at) ||
                !['needs_reconciliation', 'complete'].includes(report.status)) fail(503, 'Weekly Statement Unavailable');
            // Delivered complete statements are already in the invoice inbox.
            // This preview keeps unresolved posted amounts visible without certifying them.
            if (report.status === 'needs_reconciliation') {
                weeklySummary = report;
            }
        }
    }
    return { success: true, clubs, conversations: selected, conversation, weeklySummary,
        workspace: club ? 'club' : 'social', clubId: club?.id || null, folder };
}


export async function readMessengerMessages(db, userId, request) {
    await getMessengerWorkspace(db, userId, { workspace: 'resolve', conversationId: request.conversationId });
    // The private reader name is an installation contract: an older database
    // cannot silently supply the participant-only invoice reader.
    const { data, error } = await db.rpc('fn_messenger_private_message_page', {
        p_user_id: userId, p_conversation_id: request.conversationId,
        p_before: request.before || null, p_before_id: request.beforeId || null, p_limit: request.limit,
    });
    if (error || !Array.isArray(data)) fail(error?.code === '42501' ? 403 : 503, 'Messages Unavailable');
    return data;
}

export async function searchMessengerWorkspace(db, userId, request, limit = 50) {
    if (typeof request.query !== 'string' || request.query.trim().length < 2 || request.query.length > 500 ||
        !Number.isInteger(limit) || limit < 1 || limit > 100) fail(400, 'Invalid Message Search');
    const selection = request.conversationId
        ? { workspace: 'resolve', conversationId: request.conversationId }
        : { workspace: request.workspace || 'social', clubId: request.clubId, folder: request.folder };
    const workspace = await getMessengerWorkspace(db, userId, selection);
    const ids = request.conversationId ? [workspace.conversation.id] : workspace.conversations.map(conversation => conversation.id);
    if (!ids.length) return [];
    if (ids.length > 500) fail(503, 'Choose A Smaller Search Scope');
    const { data, error } = await db.rpc('fn_messenger_private_search_messages', {
        p_user_id: userId, p_conversation_ids: ids, p_query: request.query.trim(), p_limit: limit,
    });
    if (error || !Array.isArray(data)) fail(error?.code === '42501' ? 403 : 503, 'Message Search Unavailable');
    return data;
}
