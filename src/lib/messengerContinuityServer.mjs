import { getMessengerWorkspace } from './messengerWorkspace.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const uuid = value => typeof value === 'string' && UUID.test(value);
const time = value => typeof value === 'string' && TIME.test(value) && Number.isFinite(Date.parse(value));
const fields = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));

async function rpc(db, name, args) {
    const { data, error } = await db.rpc(name, args);
    if (error) fail(error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : ['22023', '22P02'].includes(error.code) ? 400 : 503, 'Messenger State Unavailable');
    if (!object(data)) fail(503, 'Messenger State Unavailable');
    return data;
}

export function validateContinuityWrite(body) {
    if (!object(body) || !uuid(body.conversationId) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) fail(400, 'Invalid Messenger State');
    const { field, value } = body;
    let valid = false;
    if (field === 'draft') valid = fields(value, ['text', 'replyToId']) && typeof value.text === 'string' && value.text.length <= 2000 && (value.replyToId == null || uuid(value.replyToId));
    if (field === 'pin') valid = typeof value === 'boolean';
    if (field === 'position') valid = fields(value, ['messageId', 'offset']) && (value.messageId == null || uuid(value.messageId)) && Number.isInteger(value.offset) && Math.abs(value.offset) <= 100000;
    if (field === 'saved') valid = fields(value, ['messageId', 'saved']) && uuid(value.messageId) && typeof value.saved === 'boolean';
    if (!valid) fail(400, 'Invalid Messenger State');
    return field === 'draft' ? { text: value.text, replyToId: value.replyToId || null }
        : field === 'position' ? { messageId: value.messageId || null, offset: value.offset } : value;
}

export async function writeMessengerContinuity(db, userId, body) {
    const value = validateContinuityWrite(body);
    // Repeat access inside the database CAS; only owned-save cleanup may run
    // after membership loss, returning its own ID/revision and no content.
    if (!(body.field === 'saved' && value.saved === false)) {
        await getMessengerWorkspace(db, userId, { workspace: 'resolve', conversationId: body.conversationId }, { countsOnly: true });
    }
    const result = await rpc(db, 'fn_messenger_continuity_write', {
        p_user_id: userId, p_conversation_id: body.conversationId, p_field: body.field,
        p_expected_revision: body.expectedRevision, p_value: value,
    });
    if (typeof result.success !== 'boolean' || result.field !== body.field || !Number.isSafeInteger(result.revision) || result.revision < 0 || !Object.hasOwn(result, 'value')) fail(503, 'Messenger State Unavailable');
    return result.success ? result : { ...result, error: 'Changed On Another Device' };
}

export async function readMessengerContinuity(db, userId, body) {
    if (!object(body) || (body.conversationId !== undefined && !uuid(body.conversationId)) ||
        (body.workspace !== undefined && !object(body.workspace))) fail(400, 'Invalid Messenger State');
    const cursor = body.savedCursor;
    if (cursor != null && (!fields(cursor, ['createdAt', 'messageId']) || !time(cursor.createdAt) || !uuid(cursor.messageId))) fail(400, 'Invalid Saved Message Cursor');
    const selection = body.conversationId ? { workspace: 'resolve', conversationId: body.conversationId } : body.workspace || { workspace: 'social' };
    const scope = await getMessengerWorkspace(db, userId, selection, { countsOnly: true });
    const ids = body.conversationId ? [scope.conversation.id] : scope.conversations.map(row => row.id);
    const states = {};
    const candidates = [];
    // Bounded batches merge into the newest global saved page.
    for (let start = 0; start < ids.length; start += 100) {
        const batch = ids.slice(start, start + 100);
        const result = await rpc(db, 'fn_messenger_continuity_read', {
            p_user_id: userId, p_conversation_ids: batch,
            p_before: cursor?.createdAt || null, p_before_id: cursor?.messageId || null,
        });
        if (result.success !== true || !object(result.states) || !Array.isArray(result.saved) ||
            Object.keys(result.states).some(id => !batch.includes(id)) ||
            result.saved.some(item => !batch.includes(item.conversationId) || !uuid(item.messageId) || !time(item.createdAt) || !Number.isSafeInteger(item.revision))) fail(503, 'Messenger State Unavailable');
        Object.assign(states, result.states);
        candidates.push(...result.saved);
    }
    if (body.conversationId && !states[body.conversationId]) fail(403, 'Conversation Unavailable');
    const stamp = value => {
        const [whole, fraction = ''] = value.replace(/(?:Z|\+00:00)$/, '').split('.');
        return `${whole}.${fraction.padEnd(6, '0')}`;
    };
    candidates.sort((a, b) => stamp(b.createdAt).localeCompare(stamp(a.createdAt)) || b.messageId.localeCompare(a.messageId));
    const selected = candidates.slice(0, 50);
    const saved = [];
    for (let start = 0; start < selected.length; start += 4) {
        const hydrated = await Promise.all(selected.slice(start, start + 4).map(async item => {
            try {
                // The workspace has already resolved the scope. The window
                // RPC itself repeats current private access, so avoid loading
                // the whole inbox again for each saved item.
                const page = await navigationWindow(db, userId, { conversationId: item.conversationId, anchorMessageId: item.messageId, limit: 1 });
                const message = page.messages.find(row => row.id === item.messageId);
                return message && !page.anchorUnavailable ? { ...item, message } : null;
            } catch (error) {
                if ([403, 404].includes(error.status)) return null;
                throw error;
            }
        }));
        saved.push(...hydrated.filter(Boolean));
    }
    return { success: true, ...(body.conversationId ? { state: states[body.conversationId] } : {}), states,
        pins: Object.keys(states).filter(id => states[id].pin?.value), saved,
        hasMoreSaved: candidates.length > 50,
        nextSavedCursor: candidates.length > 50 && selected.length ? { createdAt: selected.at(-1).createdAt, messageId: selected.at(-1).messageId } : null };
}

export function navigationArgs(request) {
    if (!object(request) || !uuid(request.conversationId)) fail(400, 'Invalid Conversation');
    const limit = request.limit === undefined ? 50 : Number(request.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) fail(400, 'Invalid Message Limit');
    const modes = [request.anchorMessageId != null, request.firstUnread === true, request.before != null, request.after != null].filter(Boolean).length;
    if (modes > 1 || (request.firstUnread !== undefined && typeof request.firstUnread !== 'boolean') ||
        (request.anchorMessageId != null && !uuid(request.anchorMessageId)) ||
        (request.before != null && (!time(request.before) || (request.beforeId != null && !uuid(request.beforeId)))) ||
        (request.after != null && (!time(request.after) || !uuid(request.afterId))) ||
        (request.beforeId != null && request.before == null) || (request.afterId != null && request.after == null)) fail(400, 'Invalid Message Navigation');
    return { p_conversation_id: request.conversationId, p_limit: limit,
        p_mode: request.anchorMessageId ? 'anchor' : request.firstUnread ? 'firstUnread' : request.before ? 'before' : request.after ? 'after' : 'latest',
        p_anchor: request.anchorMessageId || null, p_at: request.before || request.after || null, p_at_id: request.beforeId || request.afterId || null };
}

export async function readMessengerNavigation(db, userId, request) {
    navigationArgs(request);
    await getMessengerWorkspace(db, userId, { workspace: 'resolve', conversationId: request.conversationId }, { countsOnly: true });
    return navigationWindow(db, userId, request);
}

async function navigationWindow(db, userId, request) {
    const args = navigationArgs(request);
    const result = await rpc(db, 'fn_messenger_continuity_window', { p_user_id: userId, ...args });
    if (!Array.isArray(result.messages) || result.messages.length > args.p_limit ||
        typeof result.hasOlder !== 'boolean' || typeof result.hasNewer !== 'boolean' || typeof result.anchorUnavailable !== 'boolean' ||
        (result.firstUnreadMessageId !== null && !uuid(result.firstUnreadMessageId)) ||
        (result.anchorMessageId !== null && !uuid(result.anchorMessageId)) ||
        result.messages.some(row => !uuid(row.id) || row.conversation_id !== request.conversationId) ||
        !Array.isArray(result.savedItems) || result.savedItems.length !== result.messages.length ||
        result.savedItems.some(item => item.conversationId !== request.conversationId ||
            !result.messages.some(message => message.id === item.messageId) || typeof item.saved !== 'boolean' || !Number.isSafeInteger(item.revision) || item.revision < 0)) fail(503, 'Message Navigation Unavailable');
    return result;
}
