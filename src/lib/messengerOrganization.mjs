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

export function organizeConversations(conversations, { pinnedIds = [], unreadOnly = false, query = '' } = {}) {
    const pins = new Set(pinnedIds);
    const needle = String(query || '').trim().toLowerCase();
    return [...(Array.isArray(conversations) ? conversations : [])]
        .filter((conversation) => {
            if (unreadOnly && !conversationNeedsAttention(conversation)) return false;
            if (!needle) return true;
            const other = conversation.otherUser || {};
            return [other.display_name, other.username, conversation.title, conversation.group_name]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(needle));
        })
        .sort((left, right) => {
            const leftPinned = pins.has(left.id);
            const rightPinned = pins.has(right.id);
            if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
            const leftAttention = conversationNeedsAttention(left);
            const rightAttention = conversationNeedsAttention(right);
            const leftAction = conversationRequiresAction(left);
            const rightAction = conversationRequiresAction(right);
            if (leftAction !== rightAction) return leftAction ? -1 : 1;
            if (leftAttention !== rightAttention) return leftAttention ? -1 : 1;
            return timestamp(right.last_message_at) - timestamp(left.last_message_at);
        });
}
