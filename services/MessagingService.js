/* ═══════════════════════════════════════════════════════════════════════════
   MESSAGING SERVICE — Full Supabase Integration
   Real-time messaging with read receipts, typing indicators, and settings
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwwwwxktbh.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ═══════════════════════════════════════════════════════════════════════════
// 📦 MESSAGING SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

class MessagingService {
    constructor() {
        this.subscriptions = new Map();
        this.onMessageCallbacks = new Set();
        this.onReadReceiptCallbacks = new Set();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 🔧 USER SETTINGS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Get user's messaging settings
     */
    async getSettings(userId) {
        const { data, error } = await supabase
            .from('social_messaging_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code === 'PGRST116') {
            // No settings found, create default
            return this.createDefaultSettings(userId);
        }

        return data || this.getDefaultSettings(userId);
    }

    /**
     * Create default settings for a user
     */
    async createDefaultSettings(userId) {
        const defaults = {
            user_id: userId,
            read_receipts_enabled: true,
            typing_indicators_enabled: true,
            message_notifications: true,
            online_status_visible: true,
        };

        const { data, error } = await supabase
            .from('social_messaging_settings')
            .upsert(defaults)
            .select()
            .single();

        return data || defaults;
    }

    /**
     * Get default settings object
     */
    getDefaultSettings(userId) {
        return {
            user_id: userId,
            read_receipts_enabled: true,
            typing_indicators_enabled: true,
            message_notifications: true,
            online_status_visible: true,
        };
    }

    /**
     * Update user's messaging settings
     */
    async updateSettings(userId, settings) {
        const { data, error } = await supabase
            .from('social_messaging_settings')
            .upsert({
                user_id: userId,
                ...settings,
                updated_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) {
            console.error('Failed to update settings:', error);
            throw error;
        }

        return data;
    }

    /**
     * Toggle read receipts on/off
     */
    async toggleReadReceipts(userId, enabled) {
        return this.updateSettings(userId, { read_receipts_enabled: enabled });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 💬 CONVERSATIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Get or create a 1-1 conversation between two users
     */
    async getOrCreateConversation(userId, otherUserId) {
        const { data, error } = await supabase
            .rpc('fn_get_or_create_conversation', {
                user1_id: userId,
                user2_id: otherUserId,
            });

        if (error) {
            console.error('Failed to get/create conversation:', error);
            throw error;
        }

        return data;
    }

    /**
     * Get all conversations for a user
     */
    async getConversations(userId) {
        const { data, error } = await supabase
            .from('social_conversation_participants')
            .select(`
                conversation_id,
                last_read_at,
                is_muted,
                read_receipts_enabled,
                social_conversations (
                    id,
                    last_message_at,
                    last_message_preview,
                    is_group,
                    group_name
                )
            `)
            .eq('user_id', userId)
            .order('social_conversations(last_message_at)', { ascending: false });

        if (error) {
            console.error('Failed to get conversations:', error);
            return [];
        }

        // Enrich with other participant info
        const enriched = await Promise.all(
            (data || []).map(async (conv) => {
                const participants = await this.getConversationParticipants(conv.conversation_id);
                const otherParticipant = participants.find(p => p.user_id !== userId);
                const unreadCount = await this.getUnreadCount(conv.conversation_id, userId);

                return {
                    ...conv,
                    ...conv.social_conversations,
                    participants,
                    otherParticipant,
                    unreadCount,
                };
            })
        );

        return enriched;
    }

    /**
     * Get participants of a conversation
     */
    async getConversationParticipants(conversationId) {
        const { data, error } = await supabase
            .from('social_conversation_participants')
            .select(`
                user_id,
                joined_at,
                last_read_at,
                read_receipts_enabled,
                profiles (
                    id,
                    username,
                    avatar_url
                )
            `)
            .eq('conversation_id', conversationId);

        if (error) {
            console.error('Failed to get participants:', error);
            return [];
        }

        return (data || []).map(p => ({
            ...p,
            ...p.profiles,
        }));
    }

    /**
     * Get unread message count for a conversation
     */
    async getUnreadCount(conversationId, userId) {
        const { count, error } = await supabase
            .from('social_messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conversationId)
            .neq('sender_id', userId)
            .not('id', 'in',
                supabase
                    .from('social_message_reads')
                    .select('message_id')
                    .eq('user_id', userId)
            );

        if (error) {
            console.error('Failed to get unread count:', error);
            return 0;
        }

        return count || 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 📨 MESSAGES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Get messages for a conversation
     */
    async getMessages(conversationId, limit = 50, offset = 0) {
        const { data, error } = await supabase
            .from('social_messages')
            .select(`
                id,
                content,
                message_type,
                created_at,
                is_edited,
                sender_id,
                profiles:sender_id (
                    id,
                    username,
                    avatar_url
                ),
                social_message_reads (
                    user_id,
                    read_at,
                    profiles:user_id (
                        username
                    )
                )
            `)
            .eq('conversation_id', conversationId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('Failed to get messages:', error);
            return [];
        }

        return (data || []).map(msg => ({
            id: msg.id,
            text: msg.content,
            type: msg.message_type,
            timestamp: msg.created_at,
            isEdited: msg.is_edited,
            senderId: msg.sender_id,
            sender: msg.profiles,
            readBy: (msg.social_message_reads || []).map(r => ({
                userId: r.user_id,
                readAt: r.read_at,
                username: r.profiles?.username,
            })),
        }));
    }

    /**
     * Send a message
     */
    async sendMessage(conversationId, senderId, content) {
        const { data, error } = await supabase
            .rpc('fn_send_message', {
                p_conversation_id: conversationId,
                p_sender_id: senderId,
                p_content: content,
            });

        if (error) {
            console.error('Failed to send message:', error);
            throw error;
        }

        // Fetch the full message with sender info
        const { data: message } = await supabase
            .from('social_messages')
            .select(`
                id,
                content,
                message_type,
                created_at,
                sender_id,
                profiles:sender_id (
                    id,
                    username,
                    avatar_url
                )
            `)
            .eq('id', data)
            .single();

        return {
            id: message.id,
            text: message.content,
            type: message.message_type,
            timestamp: message.created_at,
            senderId: message.sender_id,
            sender: message.profiles,
            fromMe: true,
            readBy: [{ userId: senderId, readAt: message.created_at }],
        };
    }

    /**
     * Delete a message (soft delete)
     */
    async deleteMessage(messageId, userId) {
        const { error } = await supabase
            .from('social_messages')
            .update({ is_deleted: true })
            .eq('id', messageId)
            .eq('sender_id', userId);

        if (error) {
            console.error('Failed to delete message:', error);
            throw error;
        }

        return true;
    }

    /**
     * Edit a message
     */
    async editMessage(messageId, userId, newContent) {
        const { data, error } = await supabase
            .from('social_messages')
            .update({
                content: newContent,
                is_edited: true,
                updated_at: new Date().toISOString(),
            })
            .eq('id', messageId)
            .eq('sender_id', userId)
            .select()
            .single();

        if (error) {
            console.error('Failed to edit message:', error);
            throw error;
        }

        return data;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ✅ READ RECEIPTS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Mark all messages in a conversation as read
     */
    async markConversationRead(conversationId, userId) {
        const { data, error } = await supabase
            .rpc('fn_mark_messages_read', {
                p_conversation_id: conversationId,
                p_user_id: userId,
            });

        if (error) {
            console.error('Failed to mark messages read:', error);
            return 0;
        }

        return data;
    }

    /**
     * Mark a single message as read
     */
    async markMessageRead(messageId, userId) {
        const { error } = await supabase
            .from('social_message_reads')
            .upsert({
                message_id: messageId,
                user_id: userId,
                read_at: new Date().toISOString(),
            }, {
                onConflict: 'message_id,user_id',
            });

        if (error) {
            console.error('Failed to mark message read:', error);
            return false;
        }

        return true;
    }

    /**
     * Get read receipts for a message
     */
    async getReadReceipts(messageId) {
        const { data, error } = await supabase
            .from('social_message_reads')
            .select(`
                user_id,
                read_at,
                profiles:user_id (
                    username,
                    avatar_url
                )
            `)
            .eq('message_id', messageId);

        if (error) {
            console.error('Failed to get read receipts:', error);
            return [];
        }

        return (data || []).map(r => ({
            userId: r.user_id,
            readAt: r.read_at,
            username: r.profiles?.username,
            avatar: r.profiles?.avatar_url,
        }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 🔴 REAL-TIME SUBSCRIPTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Subscribe to new messages in a conversation
     */
    subscribeToConversation(conversationId, callbacks = {}) {
        const channelKey = `conversation:${conversationId}`;

        // Unsubscribe from existing if any
        this.unsubscribeFromConversation(conversationId);

        const channel = supabase
            .channel(channelKey)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'social_messages',
                    filter: `conversation_id=eq.${conversationId}`,
                },
                (payload) => {
                    callbacks.onNewMessage?.(payload.new);
                    this.onMessageCallbacks.forEach(cb => cb(payload.new));
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'social_message_reads',
                },
                (payload) => {
                    callbacks.onReadReceipt?.(payload.new);
                    this.onReadReceiptCallbacks.forEach(cb => cb(payload.new));
                }
            )
            .subscribe();

        this.subscriptions.set(channelKey, channel);
        return channel;
    }

    /**
     * Unsubscribe from a conversation
     */
    unsubscribeFromConversation(conversationId) {
        const channelKey = `conversation:${conversationId}`;
        const channel = this.subscriptions.get(channelKey);

        if (channel) {
            supabase.removeChannel(channel);
            this.subscriptions.delete(channelKey);
        }
    }

    /**
     * Subscribe to all user's conversations
     */
    subscribeToUserMessages(userId, callbacks = {}) {
        const channel = supabase
            .channel(`user:${userId}:messages`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'social_messages',
                },
                (payload) => {
                    callbacks.onMessage?.(payload);
                }
            )
            .subscribe();

        this.subscriptions.set(`user:${userId}`, channel);
        return channel;
    }

    /**
     * Clean up all subscriptions
     */
    cleanup() {
        this.subscriptions.forEach((channel) => {
            supabase.removeChannel(channel);
        });
        this.subscriptions.clear();
        this.onMessageCallbacks.clear();
        this.onReadReceiptCallbacks.clear();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 🛠️ UTILITIES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Format message for display
     */
    formatMessage(message, currentUserId) {
        return {
            ...message,
            fromMe: message.senderId === currentUserId || message.sender_id === currentUserId,
            isRead: (message.readBy || []).length > 1, // More than just the sender
            formattedTime: this.formatTime(message.timestamp || message.created_at),
        };
    }

    /**
     * Format timestamp for display
     */
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;

        return date.toLocaleDateString();
    }
}

// Export singleton instance
export const messagingService = new MessagingService();
export default messagingService;
