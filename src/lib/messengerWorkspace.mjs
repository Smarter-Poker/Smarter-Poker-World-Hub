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

async function accountingMap(db, ids) {
    const map = new Map();
    // The mapping is unique by audience, not by a synthetic row id.
    for (let start = 0; start < ids.length; start += 100) {
        const records = await rows(db.from('accounting_conversations')
            .select('conversation_id,scope_id,recipient_id,sender_id,issuer_type')
            .in('conversation_id', ids.slice(start, start + 100)));
        for (const record of records) map.set(record.conversation_id, record);
    }
    return map;
}

export function selectWorkspaceConversations(conversations, accounting, userId, club, folder) {
    return conversations.filter(c => {
        const invoice = accounting.get(c.id);
        if (folder === 'invoices') {
            // An issuer's participation allows replies but must not turn every
            // agent's private invoice into a separate club inbox item.
            return invoice?.scope_id === club?.id && invoice.recipient_id === userId;
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
        const mapping = (await accountingMap(db, [request.conversationId])).get(request.conversationId);
        contextId = participation[0].context_entity_id;
        club = clubs.find(c => mapping ? c.id === mapping.scope_id : c.pageId === contextId) || null;
        if ((mapping || contextId) && !club) fail(403, 'Active Club Membership Required');
        folder = mapping ? 'invoices' : 'messages';
        if (mapping && mapping.recipient_id !== userId) fail(403, 'Open The Club Weekly Statement');
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
        accountingMap(db, ids),
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
            last_message_at: c.last_message_at, last_message_preview: m.last_message_preview,
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
    return { success: true, clubs, conversations: selected, conversation,
        workspace: club ? 'club' : 'social', clubId: club?.id || null, folder };
}
