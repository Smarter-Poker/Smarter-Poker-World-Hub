// Inbox organization is intentionally derived from already-authorized
// conversation data. It must never infer a conversation, invoice, or reply
// obligation that the workspace reader did not return.

function timestamp(value) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
}

export function conversationNeedsAttention(conversation) {
    return conversationRequiresAction(conversation) || Number(conversation?.unreadCount || 0) > 0;
}

// Financial state must originate with the protected invoice reader.  The
// organizer accepts only that explicit, authoritative signal; it never turns
// an unread invoice into a payment or reconciliation obligation by guessing
// from a preview, type, or client metadata.
export function conversationRequiresAction(conversation) {
    return conversation?.requiresAction === true;
}

// A one-to-one thread with nobody on the other side (the other account was
// deleted) has no name to show. Owner rule, 2026-10-24: no "Unknown" rows,
// ever. The inbox reader already drops these; this keeps any stale client
// copy (cache, realtime merge, older API response) from rendering one.
export function conversationHasCounterpart(conversation) {
    if (!conversation) return false;
    if (conversation.is_group || conversation.title || conversation.group_name) return true;
    const other = conversation.otherUser || null;
    return !!(other && (other.display_name || other.username || other.full_name || other.name));
}

// Owner rule, 2026-10-24: "UNREAD MESSAGES MUST 100% ALWAYS APPEAR AT THE TOP
// OF THE MESSAGE FEED". Unread outranks everything, pins included; newest
// unread first. Below that: pins, then invoices that still need action, then
// recency.
export function compareConversations(left, right, pins = new Set()) {
    const leftUnread = Number(left?.unreadCount || 0) > 0;
    const rightUnread = Number(right?.unreadCount || 0) > 0;
    if (leftUnread !== rightUnread) return leftUnread ? -1 : 1;
    if (!leftUnread) {
        const leftPinned = pins.has(left?.id);
        const rightPinned = pins.has(right?.id);
        if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
        const leftAction = conversationRequiresAction(left);
        const rightAction = conversationRequiresAction(right);
        if (leftAction !== rightAction) return leftAction ? -1 : 1;
    }
    return timestamp(right?.last_message_at) - timestamp(left?.last_message_at);
}

export function organizeConversations(conversations, { pinnedIds = [], unreadOnly = false, query = '' } = {}) {
    const pins = new Set(pinnedIds);
    const needle = String(query || '').trim().toLowerCase();
    return [...(Array.isArray(conversations) ? conversations : [])]
        .filter((conversation) => {
            if (!conversationHasCounterpart(conversation)) return false;
            if (unreadOnly && !conversationNeedsAttention(conversation)) return false;
            if (!needle) return true;
            const other = conversation.otherUser || {};
            return [other.display_name, other.username, conversation.title, conversation.group_name]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(needle));
        })
        .sort((left, right) => compareConversations(left, right, pins));
}
