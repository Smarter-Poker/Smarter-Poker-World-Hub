import { enrichMessengerClubRelationships } from './messengerClubRelationships.mjs';
import { compareConversations, conversationHasCounterpart } from './messengerOrganization.mjs';
// Server-side workspace selection. A page identity or URL is never membership.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_ROLES = new Set(['owner', 'co_owner', 'admin']);
const AGENT_ROLES = new Set(['super_agent', 'agent', 'sub_agent']);
const STAFF_ROLES = new Set(['owner', 'co_owner', 'admin', 'super_agent', 'agent', 'sub_agent']);

function fail(status, message) {
    throw Object.assign(new Error(message), { status });
}

// PostgREST filters travel in the URL. Every IN list over a caller-sized set
// (inbox threads, peers, members) must be batched; 100 UUIDs is ~3.7KB.
export const IN_BATCH_SIZE = 100;
export function idBatches(ids, size = IN_BATCH_SIZE) {
    const list = [...new Set(ids)];
    const batches = [];
    for (let start = 0; start < list.length; start += size) batches.push(list.slice(start, start + size));
    return batches;
}

async function rows(query, label = 'query') {
    const { data, error } = await query;
    if (error || !Array.isArray(data)) {
        // Keep the user-facing message generic, but never hide the cause from
        // the server log again: the 2026-11-06 outage logged only this text.
        console.warn(`[messengerWorkspace] ${label} failed:`, error?.code || '', error?.message || (Array.isArray(data) ? '' : 'non-array result'));
        fail(503, 'Messenger Is Temporarily Unavailable');
    }
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
    const clubs = await byIds(db, 'clubs', 'id,name,avatar_url,owner_id', 'id', ids);
    const socialPages = (await byIds(db, 'social_pages', 'id,name,avatar_url,linked_entity_id,linked_entity_type', 'linked_entity_id', ids))
        .filter(p => p.linked_entity_type === 'club');
    const agentClubIds = memberships.filter(m => AGENT_ROLES.has(m.role)).map(m => m.club_id);
    let activeAgentClubs = null;
    if (agentClubIds.length) {
        try {
            const collected = new Set();
            let readable = true;
            for (const batch of idBatches(agentClubIds)) {
                const { data: agentRows, error: agentErr } = await db.from('agents')
                    .select('club_id,status').eq('user_id', userId).in('club_id', batch);
                if (agentErr || !Array.isArray(agentRows)) { readable = false; break; }
                for (const row of agentRows) {
                    if (row.status === 'active') collected.add(row.club_id);
                }
            }
            if (readable) activeAgentClubs = collected;
        } catch {
            activeAgentClubs = null;
        }
    }
    return clubs.map(club => {
        const rawRole = memberships.find(m => m.club_id === club.id)?.role || null;
        const isOwner = club.owner_id === userId || rawRole === 'owner';
        const role = isOwner ? 'owner' : rawRole;
        const canAccessNoticeBoard = isOwner
            || ADMIN_ROLES.has(role)
            || (AGENT_ROLES.has(role) && (activeAgentClubs === null || activeAgentClubs.has(club.id)));
        return {
            id: club.id, name: club.name, avatar_url: club.avatar_url,
            pageId: socialPages.find(p => p.linked_entity_id === club.id)?.id || null,
            canManage: isOwner || ADMIN_ROLES.has(role),
            canAccessNoticeBoard: canAccessNoticeBoard && STAFF_ROLES.has(role),
            role,
        };
    });
}

async function accountingMap(db, ids, userId) {
    const map = new Map();
    // The mapping is unique by audience, not by a synthetic row id.
    for (let start = 0; start < ids.length; start += 100) {
        const records = await rows(db.from('accounting_conversations')
            .select('conversation_id,scope_id,recipient_id,sender_id,issuer_type,last_discussion_at')
            .in('conversation_id', ids.slice(start, start + 100)));
        if (records.length) {
            const conversationIds = records.map(record => record.conversation_id);
            // Visibility and action state are separate protected reads. An
            // invoice cannot become actionable because of message metadata or
            // a preview: only the delivery-linked settlement reader may say so.
            const [visibilityResult, attentionResult] = await Promise.all([
                db.rpc('fn_messenger_private_accounting_threads', {
                    p_user_id: userId, p_conversation_ids: conversationIds,
                }),
                db.rpc('fn_messenger_private_invoice_attention', {
                    p_user_id: userId, p_conversation_ids: conversationIds,
                }),
            ]);
            const { data: visibility, error } = visibilityResult;
            if (error || !Array.isArray(visibility) || attentionResult.error || !Array.isArray(attentionResult.data)) {
                fail(503, 'Invoice Threads Unavailable');
            }
            const actionable = new Set(attentionResult.data
                .filter(row => conversationIds.includes(row?.conversation_id) && row.requires_action === true)
                .map(row => row.conversation_id));
            for (const record of records) {
                const visible = visibility.find(row => row.conversation_id === record.conversation_id);
                if (!visible) fail(503, 'Invoice Thread Unavailable');
                map.set(record.conversation_id, { ...record, ...visible, requiresAction: actionable.has(record.conversation_id) });
            }
        }
    }
    return map;
}

export function isVisibleInvoiceThread(invoice, userId, clubId, { requireRecipientVisible = true } = {}) {
    return !!invoice && !!clubId && invoice.scope_id === clubId && (
        (invoice.recipient_id === userId && (!requireRecipientVisible || !!invoice.recipient_visible))
        || (invoice.sender_id === userId && !!invoice.last_discussion_at)
    );
}

export function selectWorkspaceConversations(conversations, accounting, userId, club, folder) {
    return conversations.filter(c => {
        const invoice = accounting.get(c.id);
        if (folder === 'invoices') {
            // An issuer's participation allows replies but must not turn every
            // agent's private invoice into a separate club inbox item.
            return isVisibleInvoiceThread(invoice, userId, club?.id);
        }
        return !invoice;
    }).map(c => ({ ...c, isAccounting: accounting.has(c.id), requiresAction: accounting.get(c.id)?.requiresAction === true, clubId: club?.id || null }));
}

// ═══════════════════════════════════════════════════════════════════════════
//  THE DOCK LOADS WHAT THE DOCK SHOWS (2026-11-18)
// ═══════════════════════════════════════════════════════════════════════════
// The dock is the small chat launcher on every page. It refreshes on mount, on
// every tab focus, on reconnect and on every incoming message, and each
// refresh ran the FULL inbox waterfall for the personal inbox and then TWICE
// for every club (once per folder, over the same rows): thread details and
// the two accounting authority reads for every thread the person has ever
// had, 100 at a time. An owner with 5,895 threads across six clubs made
// several hundred sequential database round trips per refresh, the request
// passed the dock's 30 second ceiling, and the browser's own abort text
// ("signal timed out") was printed over the poker table.
//
// Two changes, neither of which alters who may see what:
//   1. One load per club serves both of its folders. They were always the
//      same rows filtered two ways.
//   2. The dock asks only for what it shows: every thread with something
//      unread, and the most recent DOCK_RECENT_LIMIT of the rest, per inbox.
//      Unread counts are unchanged because every unread thread is still read.
//      The full Messenger page is untouched and still lists everything.
export const DOCK_RECENT_LIMIT = 30;
const DOCK_CLUBS_AT_ONCE = 4;

// `list` is in inbox order: staff notice groups with no messages first, then
// the reader's own order (unread first, then newest). Keeps every unread
// thread and every empty staff group, and the newest `limit` of the others.
export function dockInboxSlice(list, limit, alwaysKeep = 0) {
    if (!(limit > 0) || list.length <= limit) return list;
    let recent = 0;
    return list.filter((conversation, index) =>
        index < alwaysKeep || Number(conversation.unread_count || 0) > 0 || recent++ < limit);
}

// A pair receives at most two welcomes per admission, so a thread that reaches
// this many rows is not proved welcome-only and is left to the inbox's answer.
const OWN_WELCOME_PROOF_ROWS = 200;

// ════════════════════════════════════════════════════════════════════════
//  THE MAIN INBOX LOADS A WINDOW (2026-11-18)
// ════════════════════════════════════════════════════════════════════════
// `feed` is the Messenger page's own main inbox (pages/hub/messenger.js asks
// for it whenever no club is selected): every personal thread plus each
// club's invoices and unread discussions. It read thread details and the two
// accounting authority functions for every thread the person ever had. The
// owner account has 5,895.
//
// The feed now reads, per inbox:
//   - every thread with something unread (unread counts stay exact),
//   - every pinned thread the caller named (a pin never grants visibility: it
//     only keeps a row the inbox reader already returned for this caller),
//   - every invoice that still requires action (one bounded call to
//     fn_messenger_private_invoice_attention_ids; when that function is not
//     installed, every invoice is read exactly as before),
//   - the newest `window` of the remaining read threads.
// In a club inbox the feed only ever showed unread discussions and the
// caller's own invoices, so read threads that are neither are not read at
// all. That part removes nothing from the answer.
// `hasOlder` says a read thread was left out; asking again with `olderWindow`
// returns it. The club and resolve workspaces are not sliced.
export const FEED_WINDOW = 100;
export const FEED_WINDOW_MAX = 10000;
export const FEED_PINNED_MAX = 200;

export function feedWindow(value) {
    const size = Number(value);
    if (!Number.isInteger(size) || size < FEED_WINDOW) return FEED_WINDOW;
    return Math.min(size, FEED_WINDOW_MAX);
}

export function feedPinnedIds(value) {
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter(id => typeof id === 'string' && UUID.test(id))
        .slice(0, FEED_PINNED_MAX).map(id => id.toLowerCase()));
}

// `list` is one inbox in reader order. `shown` (club inboxes) is the set of
// threads the feed can show once read; null means every thread. `attention`
// is the set of invoices that still require action; null means unknown, and
// then no shown thread is left out.
export function feedInboxSlice(list, { window, alwaysKeep = 0, pinned = new Set(), shown = null, attention = new Set(), unreadShown = true }) {
    const idOf = conversation => conversation.conversation_id || conversation.id;
    const kept = new Set();
    const read = [];
    list.forEach((conversation, index) => {
        const id = idOf(conversation);
        const isShown = !shown || shown.has(id);
        if (index < alwaysKeep) kept.add(id);
        else if (Number(conversation.unread_count || 0) > 0) { if (unreadShown || isShown) kept.add(id); }
        else if (!isShown) return;
        else if (pinned.has(String(id).toLowerCase()) || !attention || attention.has(id)) kept.add(id);
        else read.push(conversation);
    });
    const time = conversation => Date.parse(conversation.last_message_at || '') || 0;
    for (const conversation of [...read].sort((a, b) => time(b) - time(a)).slice(0, window)) kept.add(idOf(conversation));
    return { conversations: list.filter(conversation => kept.has(idOf(conversation))), hasOlder: read.length > window && window < FEED_WINDOW_MAX };
}

function missingFunction(error) {
    return String(error?.code || '') === 'PGRST202'
        || /could not find the function|function .* does not exist/i.test(String(error?.message || ''));
}

// One call for every invoice of this caller that still requires action. The
// answer only decides which threads are read; whether a returned thread
// requires action is still said by fn_messenger_private_invoice_attention.
async function feedAttentionIds(db, userId, clubs) {
    if (!clubs.length) return new Set();
    const { data, error } = await db.rpc('fn_messenger_private_invoice_attention_ids', { p_user_id: userId });
    if (error && missingFunction(error)) return null;
    if (error || !Array.isArray(data)) fail(503, 'Invoice Threads Unavailable');
    return new Set(data);
}

// The same two conditions selectWorkspaceConversations applies to an invoice,
// asked of the table by audience instead of by every thread id.
async function feedInvoiceThreadIds(db, userId, club) {
    const scoped = () => db.from('accounting_conversations')
        .select('conversation_id,scope_id,recipient_id,sender_id,last_discussion_at')
        .eq('scope_id', club.id);
    const [received, discussed] = await Promise.all([
        pages(() => scoped().eq('recipient_id', userId), 'conversation_id'),
        pages(() => scoped().eq('sender_id', userId).not('last_discussion_at', 'is', null), 'conversation_id'),
    ]);
    return new Set([...received, ...discussed]
        .filter(row => isVisibleInvoiceThread(row, userId, club.id, { requireRecipientVisible: false }))
        .map(row => row.conversation_id));
}

// Invoices the caller issued in this club with no discussion are dropped by
// selectWorkspaceConversations. Exclude them before dockInboxSlice so bulk
// weekly invoice issuance cannot consume all DOCK_RECENT_LIMIT read slots.
async function dockHiddenInvoiceThreadIds(db, userId, club) {
    const issued = await pages(() => db.from('accounting_conversations')
        .select('conversation_id,scope_id,recipient_id,sender_id,last_discussion_at')
        .eq('scope_id', club.id).eq('sender_id', userId), 'conversation_id');
    return new Set(issued
        .filter(row => !isVisibleInvoiceThread(row, userId, club.id, { requireRecipientVisible: false }))
        .map(row => row.conversation_id));
}

async function noticeBoardUnreadMap(db, userId, clubs) {
    const staffClubIds = clubs.filter(c => c.canAccessNoticeBoard !== false).map(c => c.id);
    if (!staffClubIds.length || typeof db?.rpc !== 'function') return {};
    try {
        const { data, error } = await db.rpc('fn_club_notice_unread_counts', { p_user: userId, p_clubs: staffClubIds });
        if (error || !data || typeof data !== 'object') return {};
        return data;
    } catch {
        return {};
    }
}

export async function getMessengerWorkspace(db, userId, request, internal = {}) {
    if (request.workspace === 'club' && request.folder === 'statements') {
        const inbox = await getMessengerWorkspace(db, userId, { ...request, folder: 'invoices' }, { ...internal, countsOnly: true });
        return { ...inbox, folder: 'statements', conversations: [], weeklySummary: null };
    }
    const clubs = internal.clubs || await getMessengerClubs(db, userId);
    const workspace = request.workspace || 'social';
    if (workspace === 'dock' || workspace === 'feed') {
        // Global reconnect/inbox reads must cover each currently authorized
        // workspace, including club discussions missed while offline.
        const [attention, draftStates] = await Promise.all([
            workspace === 'feed' ? feedAttentionIds(db, userId, clubs) : Promise.resolve(null),
            rows(db.from('messenger_conversation_state').select('conversation_id,draft_text,updated_at')
                .eq('user_id', userId).neq('draft_text', '').limit(50), 'draft conversations'),
        ]);
        const feed = workspace === 'feed' ? { window: feedWindow(request.window), pinned: feedPinnedIds(request.pinnedIds), attention } : null;
        const options = { clubs, countsOnly: true, bothFolders: true, draftStates,
            ...(feed ? { feed } : { recentLimit: DOCK_RECENT_LIMIT }) };
        const workspaces = [await getMessengerWorkspace(db, userId, { workspace: 'social' }, options)];
        for (let start = 0; start < clubs.length; start += DOCK_CLUBS_AT_ONCE) {
            const batch = await Promise.all(clubs.slice(start, start + DOCK_CLUBS_AT_ONCE).map(club =>
                getMessengerWorkspace(db, userId, { workspace: 'club', clubId: club.id, folder: 'messages' }, options)));
            // Same order as before: each club's messages, then its invoices.
            for (const loaded of batch) {
                for (const folder of ['messages', 'invoices']) {
                    workspaces.push({ ...loaded, folder, conversations: loaded.folders[folder] });
                }
            }
        }
        const combined = workspaces.flatMap(selected => selected.conversations.filter(conversation =>
            workspace === 'dock' || selected.workspace === 'social' ||
            // Reading a saved invoice or summary must not remove it from the
            // main inbox. Workspace selection already enforces recipient
            // visibility and explicit deletion before this feed is assembled.
            conversation.isAccounting || Number(conversation.unreadCount) > 0).map(conversation => ({
            ...conversation, dockWorkspace: { workspace: selected.workspace, clubId: selected.clubId, folder: selected.folder },
        })));
        const conversations = await enrichMessengerClubRelationships(db, userId,
            [...new Map(combined.map(conversation => [conversation.id, conversation])).values()]);
        return { success: true, clubs, workspace: workspace === 'feed' ? 'social' : 'dock', clubId: null, folder: 'messages',
            unreadCounts: workspaces[0].unreadCounts, attentionCounts: workspaces[0].attentionCounts,
            ...(feed ? { hasOlder: workspaces.some(selected => selected.hasOlder === true), window: feed.window,
                olderWindow: Math.min(feed.window + FEED_WINDOW, FEED_WINDOW_MAX) } : {}),
            conversations: conversations.sort((a, b) => compareConversations(a, b)) };
    }
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
    if (!['messages', 'invoices', 'notice-board'].includes(folder)) fail(400, 'Invalid Messenger Tab');
    // A club with no social page has no ordinary club-context messages. Its
    // accounting conversations are still found through the authoritative map.
    const { data, error } = await db.rpc('fn_get_user_conversations', {
        p_user_id: userId, p_context_entity_id: contextId,
    });
    if (error || !Array.isArray(data)) fail(503, 'Messenger Is Temporarily Unavailable');
    // Authorization of ONE conversation (read receipt, send, history, search)
    // needs only that conversation's row. Every visibility rule below is
    // decided per conversation, so narrowing to it gives the same answer as
    // the full inbox without reading metadata, invoices, branding and club
    // relationships for every other thread (a 673-thread agent inbox made
    // each read receipt ~36 requests).
    const authorizeOne = !!(internal.authorizeOnly && resolvedId);
    const listed = authorizeOne ? data.filter(c => (c.conversation_id || c.id) === resolvedId) : data;
    // Staff groups have no synthetic opening post. Include authorized empty
    // groups so promotion enrollment is visible before anybody sends a message.
    const managed = !contextId && clubs.length && !(authorizeOne && listed.length) && !internal.unreadOnly ? await rows(db.from('club_messenger_staff_notice_groups')
        .select('club_id,conversation_id').in('club_id', clubs.map(c => c.id))) : [];
    const participation = [];
    for (const batch of idBatches(managed.map(g => g.conversation_id))) {
        participation.push(...await rows(db.from('social_conversation_participants')
            .select('conversation_id').eq('user_id', userId).in('conversation_id', batch), 'staff group participation'));
    }
    const emptyGroups = managed.filter(g => participation.some(p => p.conversation_id === g.conversation_id)
        && (!authorizeOne || g.conversation_id === resolvedId))
        .map(g => ({ conversation_id: g.conversation_id, is_group: true, unread_count: 0 }));

    // Empty (0-message) threads with an active server-saved draft are omitted
    // by fn_get_user_conversations. Surface strictly message-less, authorized,
    // non-accounting draft threads in their matching workspace (including when
    // resolving a deep-linked or reloaded draft thread) so users never lose an
    // unsent new-conversation draft.
    const existingIds = new Set([...emptyGroups, ...listed].map(c => c.conversation_id || c.id));
    const draftThreads = [];
    const draftPreviewMap = new Map();
    if (folder === 'messages' && !authorizeOne && !internal.unreadOnly && (!resolvedId || !existingIds.has(resolvedId))) {
        const draftStates = Array.isArray(internal.draftStates)
            ? internal.draftStates
            : await rows(
                (resolvedId
                    ? db.from('messenger_conversation_state').select('conversation_id,draft_text,updated_at')
                        .eq('user_id', userId).eq('conversation_id', resolvedId).neq('draft_text', '').limit(1)
                    : db.from('messenger_conversation_state').select('conversation_id,draft_text,updated_at')
                        .eq('user_id', userId).neq('draft_text', '').limit(50)),
                'draft conversations',
            );
        const candidateDrafts = draftStates.filter(d => d && typeof d.draft_text === 'string' && d.draft_text.trim()
            && !existingIds.has(d.conversation_id)
            && (!resolvedId || d.conversation_id === resolvedId));
        if (candidateDrafts.length) {
            const candidateIds = candidateDrafts.map(d => d.conversation_id);
            const draftParts = [];
            const draftAccounting = [];
            const draftMessages = [];
            for (const batch of idBatches(candidateIds)) {
                const [partsBatch, accountingBatch, messagesBatch] = await Promise.all([
                    rows(db.from('social_conversation_participants').select('conversation_id,context_entity_id')
                        .eq('user_id', userId).in('conversation_id', batch), 'draft participation'),
                    rows(db.from('accounting_conversations').select('conversation_id')
                        .in('conversation_id', batch), 'draft accounting'),
                    rows(db.from('social_messages').select('conversation_id')
                        .in('conversation_id', batch).limit(200), 'draft messages'),
                ]);
                draftParts.push(...partsBatch);
                draftAccounting.push(...accountingBatch);
                draftMessages.push(...messagesBatch);
            }
            const accountingIds = new Set(draftAccounting.map(a => a.conversation_id));
            const nonEmptyIds = new Set(draftMessages.map(m => m.conversation_id));
            const validIds = draftParts
                .filter(p => (p.context_entity_id ?? null) === (contextId ?? null)
                    && !accountingIds.has(p.conversation_id)
                    && !nonEmptyIds.has(p.conversation_id))
                .map(p => p.conversation_id);
            if (validIds.length) {
                const otherParts = [];
                for (const batch of idBatches(validIds)) {
                    otherParts.push(...await rows(db.from('social_conversation_participants').select('conversation_id,user_id')
                        .in('conversation_id', batch).neq('user_id', userId), 'draft counterparts'));
                }
                const otherUserIds = [...new Set(otherParts.map(p => p.user_id).filter(Boolean))];
                const otherProfiles = otherUserIds.length
                    ? await byIds(db, 'profiles', 'id,username,display_name,avatar_url', 'id', otherUserIds)
                    : [];
                const profileById = new Map(otherProfiles.map(p => [p.id, p]));
                const otherByConv = new Map();
                for (const part of otherParts) {
                    if (!otherByConv.has(part.conversation_id)) otherByConv.set(part.conversation_id, profileById.get(part.user_id) || null);
                }
                const draftByConv = new Map(candidateDrafts.map(d => [d.conversation_id, d]));
                for (const convId of validIds) {
                    const draftRow = draftByConv.get(convId);
                    const other = otherByConv.get(convId);
                    draftPreviewMap.set(convId, draftRow.draft_text.trim());
                    draftThreads.push({
                        conversation_id: convId,
                        is_group: false,
                        unread_count: 0,
                        last_message_at: draftRow.updated_at || null,
                        other_user_id: other?.id || null,
                        other_user_username: other?.display_name || other?.username || null,
                        other_user_avatar: other?.avatar_url || null,
                    });
                }
            }
        }
    }

    const pinnedEmptyCount = emptyGroups.length + draftThreads.length;
    const everyThread = [...new Map([...emptyGroups, ...draftThreads, ...listed].map(c => [c.conversation_id || c.id, c])).values()];
    let unique = everyThread;
    let hasOlder = false;
    if (internal.unreadOnly && !authorizeOne) {
        unique = everyThread.filter(c => Number(c.unread_count || 0) > 0);
    } else if (internal.feed && !authorizeOne) {
        const sliced = feedInboxSlice(everyThread, club ? {
            window: internal.feed.window, pinned: internal.feed.pinned, attention: internal.feed.attention,
            shown: await feedInvoiceThreadIds(db, userId, club), unreadShown: !!club.pageId,
        } : { window: internal.feed.window, pinned: internal.feed.pinned, alwaysKeep: pinnedEmptyCount });
        unique = sliced.conversations;
        hasOlder = sliced.hasOlder;
    } else if (internal.recentLimit && !authorizeOne) {
        let dockCandidates = everyThread;
        if (club) {
            const hiddenInvoices = await dockHiddenInvoiceThreadIds(db, userId, club);
            if (hiddenInvoices.size) {
                dockCandidates = everyThread.filter(c => !hiddenInvoices.has(c.conversation_id || c.id));
            }
        }
        unique = dockInboxSlice(dockCandidates, internal.recentLimit, pinnedEmptyCount);
    }
    const ids = unique.map(c => c.conversation_id || c.id);
    const [meta, accounting] = await Promise.all([
        byIds(db, 'social_conversations', 'id,is_request,request_sender_id,last_message_preview,group_name', 'id', ids),
        accountingMap(db, ids, userId),
    ]);
    const metadata = new Map(meta.map(c => [c.id, c]));
    const clubBrands = new Map();
    if (ids.length && !internal.countsOnly && !authorizeOne) {
        // Bounded batches. One unbatched IN list of every inbox id exceeded the
        // database gateway's URL limit once an agent's inbox passed ~650
        // threads (2026-11-06: 673 ids = 26.7KB -> plain 400 Bad Request), and
        // because every resolve runs this, opening, reading and sending in ANY
        // conversation failed with "Read Status Could Not Be Saved".
        const branded = [];
        for (const batch of idBatches(ids)) {
            branded.push(...await rows(db.from('social_messages').select('conversation_id,media_metadata,created_at')
                .in('conversation_id', batch).neq('sender_id', userId).contains('media_metadata', { is_club_identity: true })
                .order('created_at', { ascending: false }).limit(500), 'club identity messages'));
        }
        branded.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
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
            ...(draftPreviewMap.has(id) ? { draftPreview: draftPreviewMap.get(id) } : {}),
            unreadCount: Number(c.unread_count || 0), last_read_at: c.last_read_at || null,
            isRequest: !!m.is_request, requestSenderId: m.request_sender_id,
            otherUser: c.other_user_id ? {
                id: c.other_user_id, username: name,
                display_name: name, full_name: name,
                avatar_url: brand?.club_avatar || c.other_user_avatar,
                is_club_identity: !!brand, club_id: brand?.club_id || null,
            } : null,
        };
    }).filter(c => (!c.isRequest || c.requestSenderId === userId)
        // Owner rule 2026-10-24: never list or count a nameless one-to-one
        // thread (its other account was deleted). Groups keep their title.
        && conversationHasCounterpart(c));
    const selected = folder === 'notice-board' || (club && !club.pageId && folder === 'messages') ? []
        : selectWorkspaceConversations(conversations, accounting, userId, club, folder);
    const countUnread = list => list.reduce((sum, c) => sum + c.unreadCount, 0);
    // Invoice attention preserves the real unread-message total. A separate
    // indicator is added only after the conversation itself is fully read.
    const countInvoiceAttention = list => list.reduce((sum, c) => sum + c.unreadCount + (c.requiresAction && c.unreadCount === 0 ? 1 : 0), 0);
    const unreadCounts = {
        messages: club && !club.pageId ? 0 : countUnread(selectWorkspaceConversations(conversations, accounting, userId, club, 'messages')),
        invoices: club ? countUnread(selectWorkspaceConversations(conversations, accounting, userId, club, 'invoices')) : 0,
    };
    const attentionCounts = {
        messages: unreadCounts.messages,
        invoices: club ? countInvoiceAttention(selectWorkspaceConversations(conversations, accounting, userId, club, 'invoices')) : 0,
    };
    let conversation = resolvedId ? selected.find(c => c.id === resolvedId) : null;
    // The inbox RPC deliberately omits empty threads. A just-created, authorized
    // conversation must still resolve so its first message can be sent/read.
    // Never use this path to resurrect a hidden/deleted or invoice-only thread:
    // prove there are no message rows at all, after the participation/context
    // and active-club/private-accounting checks above have already succeeded.
    //
    // The inbox also omits a one-to-one thread that holds only the caller's own
    // club welcome messages, until somebody writes in it (Club Arena migration
    // 20261119015312). The sender must still be able to open that thread and
    // write the first real message, so it resolves here on the same proof: every
    // message row is a club welcome this caller sent. Any other row (a reply, an
    // invoice, a message with no welcome flag) means the inbox had its own reason
    // to omit the thread, and it stays unavailable.
    if (resolvedId && !conversation && !accounting.has(resolvedId)) {
        const existing = await rows(db.from('social_messages').select('id,sender_id,media_metadata')
            .eq('conversation_id', resolvedId).limit(OWN_WELCOME_PROOF_ROWS));
        const ownWelcomesOnly = existing.length > 0 && existing.length < OWN_WELCOME_PROOF_ROWS
            && existing.every(message => message.sender_id === userId && message.media_metadata?.club_welcome === true);
        if (!existing.length || ownWelcomesOnly) {
            const metadata = await rows(db.from('social_conversations')
                .select('id,is_group,group_name,is_request,request_sender_id').eq('id', resolvedId).limit(1));
            const empty = metadata[0];
            if (empty && (!empty.is_request || empty.request_sender_id === userId)) {
                const others = await rows(db.from('social_conversation_participants').select('user_id')
                    .eq('conversation_id', resolvedId).neq('user_id', userId).limit(1));
                const profiles = others.length ? await rows(db.from('profiles').select('id,username,display_name,avatar_url')
                    .eq('id', others[0].user_id).limit(1)) : [];
                conversation = { id: resolvedId, title: empty.group_name || null, is_group: !!empty.is_group,
                    last_message_at: null, last_message_preview: null, unreadCount: 0, last_read_at: null,
                    isRequest: !!empty.is_request, requestSenderId: empty.request_sender_id,
                    otherUser: profiles[0] || null, isAccounting: false, requiresAction: false, clubId: club?.id || null };
                // A welcome-only thread opens only while its other person still
                // exists: the inbox never shows a nameless one-to-one thread.
                if (ownWelcomesOnly && (empty.is_group || !conversation.otherUser)) conversation = null;
                else selected.push(conversation);
            }
        }
    }
    if (resolvedId && !conversation) fail(404, 'Conversation Unavailable');
    let weeklySummary = null;
    if (club?.canManage && folder === 'invoices' && !internal.countsOnly && !authorizeOne) {
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
    const visible = internal.countsOnly || authorizeOne ? selected : await enrichMessengerClubRelationships(db, userId, selected);
    if (resolvedId) conversation = visible.find(row => row.id === resolvedId);
    // An authorize-only answer carries the one conversation; its list and
    // counts cover that conversation alone and must not be shown as an inbox.
    // Both folders of one club, from the one load (see DOCK_RECENT_LIMIT).
    const folders = internal.bothFolders && club ? {
        messages: club.pageId ? selectWorkspaceConversations(conversations, accounting, userId, club, 'messages') : [],
        invoices: selectWorkspaceConversations(conversations, accounting, userId, club, 'invoices'),
    } : null;
    const noticeUnread = club && club.canAccessNoticeBoard !== false
        ? (internal.noticeUnreadMap
            ? Number(internal.noticeUnreadMap[club.id] || 0)
            : Number((await noticeBoardUnreadMap(db, userId, [club]))[club.id] || 0))
        : 0;
    return { success: true, clubs, conversations: visible, conversation, weeklySummary, unreadCounts, attentionCounts,
        ...(club && noticeUnread > 0 ? { noticeBoardUnread: noticeUnread } : (club ? { noticeBoardUnread: 0 } : {})),
        workspace: club ? 'club' : 'social', clubId: club?.id || null, folder, ...(authorizeOne ? { authorizedOnly: true } : {}),
        ...(folders ? { folders } : {}), ...(internal.feed ? { hasOlder } : {}) };
}

// Use the exact inbox visibility rules, including private invoices and active
// membership. Raw participant/message counts include threads nobody can open.
export async function getMessengerUnreadSummary(db, userId) {
    const clubs = await getMessengerClubs(db, userId);
    const noticeUnreadMap = await noticeBoardUnreadMap(db, userId, clubs);
    const options = { clubs, countsOnly: true, unreadOnly: true, noticeUnreadMap };
    const social = await getMessengerWorkspace(db, userId, { workspace: 'social' }, options);
    const summary = { social: social.unreadCounts.messages, clubs: {}, noticeBoard: {}, total: social.unreadCounts.messages };
    // Bound query concurrency for accounts that belong to many clubs.
    for (let start = 0; start < clubs.length; start += 4) {
        const batch = await Promise.all(clubs.slice(start, start + 4).map(club =>
            getMessengerWorkspace(db, userId, { workspace: 'club', clubId: club.id }, options)));
        for (const workspace of batch) {
            const nbCount = Number(noticeUnreadMap[workspace.clubId] || 0);
            summary.clubs[workspace.clubId] = workspace.unreadCounts;
            summary.noticeBoard[workspace.clubId] = nbCount;
            summary.total += workspace.unreadCounts.messages + workspace.unreadCounts.invoices + nbCount;
        }
    }
    return summary;
}


export async function authorizeMessengerConversation(db, userId, conversationId) {
    return getMessengerWorkspace(db, userId, { workspace: 'resolve', conversationId }, { authorizeOnly: true });
}

export async function readMessengerMessages(db, userId, request) {
    await authorizeMessengerConversation(db, userId, request.conversationId);
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
    const workspace = await getMessengerWorkspace(db, userId, selection, request.conversationId ? { authorizeOnly: true } : {});
    const ids = request.conversationId ? [workspace.conversation.id] : workspace.conversations.map(conversation => conversation.id);
    if (!ids.length) return [];
    if (ids.length > 500) fail(503, 'Choose A Smaller Search Scope');
    const { data, error } = await db.rpc('fn_messenger_private_search_messages', {
        p_user_id: userId, p_conversation_ids: ids, p_query: request.query.trim(), p_limit: limit,
    });
    if (error || !Array.isArray(data)) fail(error?.code === '42501' ? 403 : 503, 'Message Search Unavailable');
    return data;
}
