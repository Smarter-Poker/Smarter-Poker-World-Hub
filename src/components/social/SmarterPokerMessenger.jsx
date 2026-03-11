/**
 * 💬 smarter-poker-style MESSENGER
 * src/app/social/components/SmarterPokerMessenger.jsx
 * 
 * Chat system with conversation list and message threads
 */

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { SPAvatar, SP_COLORS } from './SmarterPokerStyleCard';
import { busEmit, eventBus, EventType } from '../../engine/EventBus';

// ─── Lazy Supabase Getter ──────────────────────────────────────────────
async function getSupabase() {
    if (typeof window === 'undefined') return null;
    if (window._cachedSupabaseClient) return window._cachedSupabaseClient;
    const { createClient } = await import('../../lib/supabase');
    window._cachedSupabaseClient = createClient();
    return window._cachedSupabaseClient;
}

// ═══════════════════════════════════════════════════════════════════════════
// 💾 PERSISTENCE HOOK (Local + Supabase Background Sync)
// ═══════════════════════════════════════════════════════════════════════════

// Disappearing timer options
const DISAPPEAR_OPTIONS = [
    { label: 'Off', value: 0 },
    { label: '1h', value: 3600000 },
    { label: '6h', value: 21600000 },
    { label: '24h', value: 86400000 },
    { label: '7d', value: 604800000 }
];

// All available label categories (E8)
const LABEL_CATEGORIES = ['Important', 'Action Required', 'Tournament Info', 'Payment'];

// Theme presets — solids + gradients (E6)
const THEME_PRESETS = [
    { label: 'White', value: '#FFFFFF', type: 'solid' },
    { label: 'Ice Blue', value: '#F0F8FF', type: 'solid' },
    { label: 'Linen', value: '#FDF5E6', type: 'solid' },
    { label: 'Mint', value: '#F0FFF0', type: 'solid' },
    { label: 'Rose', value: '#FDEEED', type: 'solid' },
    { label: 'Smoke', value: '#F5F5F5', type: 'solid' },
    { label: 'Sunset', value: 'linear-gradient(180deg, #FFECD2 0%, #FCB69F 100%)', type: 'gradient' },
    { label: 'Ocean', value: 'linear-gradient(180deg, #E0F7FA 0%, #B2EBF2 100%)', type: 'gradient' },
    { label: 'Lavender', value: 'linear-gradient(180deg, #F3E5F5 0%, #E1BEE7 100%)', type: 'gradient' },
    { label: 'Forest', value: 'linear-gradient(180deg, #E8F5E9 0%, #C8E6C9 100%)', type: 'gradient' }
];

// P4-6: Smart reply suggestions (context-aware)
const SMART_REPLIES = [
    { trigger: ['thanks', 'thank you', 'thx'], replies: ['You\'re welcome!', 'No problem!', 'Anytime! 👍'] },
    { trigger: ['hello', 'hi', 'hey'], replies: ['Hey! 👋', 'What\'s up?', 'How can I help?'] },
    { trigger: ['tournament', 'tourney'], replies: ['Good luck! 🍀', 'What buy-in?', 'I\'m in!'] },
    { trigger: ['gg', 'good game'], replies: ['GG! 🤝', 'Well played!', 'Rematch? 😎'] },
    { trigger: ['when', 'time', 'schedule'], replies: ['Let me check...', 'I\'ll get back to you', 'What time works?'] }
];

// P5-2: Emoji categories for reaction picker
const EMOJI_GRID = [
    { cat: 'Smileys', emojis: ['😀','😂','🤣','😍','😎','🤩','😜','🤔','😱','😡','😢','🤯'] },
    { cat: 'Hands', emojis: ['👍','👎','👏','🙌','🤝','✌️','🤞','💪','❤️','🔥','⭐','🎰'] },
    { cat: 'Poker', emojis: ['🃏','♠️','♥️','♦️','♣️','💰','💵','🏆','🎯','🎲','🧪','🚀'] }
];

// P5-7: Auto-link detector
const autoLinkify = (text) => {
    if (!text || typeof text !== 'string') return text;
    return text.replace(
        /(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#0088ff;text-decoration:underline">$1</a>'
    );
};

// P4-3 + P5-7: Markdown parser + auto-link
const parseMarkdown = (text) => {
    if (!text || typeof text !== 'string') return text;
    let result = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
        .replace(/^- (.+)/gm, '• $1');
    return autoLinkify(result);
};

// P4-8: File type icon resolver
const getFileIcon = (filename) => {
    if (!filename) return '📎';
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return '🖼️';
    if (['pdf'].includes(ext)) return '📄';
    if (['doc','docx','txt','rtf'].includes(ext)) return '📝';
    if (['xls','xlsx','csv'].includes(ext)) return '📊';
    if (['mp4','mov','avi','webm'].includes(ext)) return '🎬';
    if (['mp3','wav','ogg'].includes(ext)) return '🎵';
    if (['zip','rar','7z'].includes(ext)) return '📦';
    return '📎';
};

// P6-2: Priority flag constants
const PRIORITY_FLAGS = [
    { label: 'Urgent', emoji: '🔴', value: 'urgent' },
    { label: 'Normal', emoji: '🟡', value: 'normal' },
    { label: 'Low', emoji: '🟢', value: 'low' }
];

// P6-6: Mute timer options
const MUTE_OPTIONS = [
    { label: 'Unmute', value: 0 },
    { label: '1 hour', value: 3600000 },
    { label: '8 hours', value: 28800000 },
    { label: '24 hours', value: 86400000 },
    { label: 'Forever', value: -1 }
];

const useMessengerPrefs = () => {
    const [prefs, setPrefs] = useState({
        bookmarks: [],
        labels: {},
        themes: {},
        disappearing: {},
        scheduledQueue: [],
        pinnedMessages: {},
        archivedConversations: [],
        threadReplies: {},
        editHistory: {},
        reactions: {},
        dndConversations: {},
        mutedConversations: {},
        priorityFlags: {},
        unreadCounts: {},
        templates: [
            "Your funds are ready",
            "Tournament starts in 30 min",
            "Please verify your account"
        ]
    });

    useEffect(() => {
        try {
            const saved = localStorage.getItem('sp-messenger-prefs');
            if (saved) setPrefs(JSON.parse(saved));
        } catch (e) { }
    }, []);

    // Phase 6 Deep Sweep: Background sync to SQL
    const syncToSupabase = async (state) => {
        const sb = await getSupabase();
        if (!sb) return;
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.user?.id) return;
        
        const uid = session.user.id;
        
        // Non-blocking fire-and-forget sync
        setTimeout(async () => {
            try {
                // Bookmarks
                const bms = state.bookmarks || [];
                for (const b of bms) {
                    await sb.from('messenger_bookmarks').upsert({ message_id: b.id, user_id: uid, message_text: b.text }, { onConflict: 'message_id,user_id' });
                }
                
                // Labels
                const lbls = state.labels || {};
                for (const [msgId, msgLabels] of Object.entries(lbls)) {
                    for (const lbl of msgLabels) {
                        await sb.from('messenger_labels').upsert({ message_id: msgId, user_id: uid, label: lbl }, { onConflict: 'message_id,user_id,label' });
                    }
                }
                
                // Themes
                const thms = state.themes || {};
                for (const [convId, themeStr] of Object.entries(thms)) {
                    await sb.from('messenger_themes').upsert({ conversation_id: convId, user_id: uid, theme_value: themeStr }, { onConflict: 'conversation_id,user_id' });
                }
                
                // Note: Other tables (reactions, pins, edit history) can be synced similarly, 
                // but because their structures vary slightly, we prioritize core premium features first.
                // EventBus already transmits real-time actions.
            } catch (err) {
                console.warn('[Messenger] Supabase Sync soft-fail:', err.message);
            }
        }, 100);
    };

    const updatePrefs = (updater) => {
        setPrefs(prev => {
            const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
            try {
                localStorage.setItem('sp-messenger-prefs', JSON.stringify(next));
            } catch (e) { }
            syncToSupabase(next);
            return next;
        });
    };

    return [prefs, updatePrefs];
};

// ═══════════════════════════════════════════════════════════════════════════
// 💬 MESSAGE BUBBLE
// ═══════════════════════════════════════════════════════════════════════════

const MessageBubble = ({ message, isOwn, showAvatar, user, onAction }) => (
    <div className={`message-row ${isOwn ? 'own' : 'other'} ${message.isDisappearing ? 'ephemeral' : ''}`}>
        {!isOwn && showAvatar && (
            <SPAvatar src={user?.avatar} size={28} />
        )}
        {!isOwn && !showAvatar && <div className="avatar-spacer" />}

        <div className={`message-bubble ${isOwn ? 'own' : 'other'} ${message.isDisappearing ? 'ephemeral' : ''} ${message.isPinned ? 'pinned-msg' : ''}`}>
            {/* P4-1: Pin indicator */}
            {message.isPinned && <span className="pin-indicator" title="Pinned">📍</span>}

            {/* P6-2: Priority flag */}
            {message.priorityFlag && message.priorityFlag !== 'normal' && (
                <span className={`priority-flag ${message.priorityFlag}`}>
                    {PRIORITY_FLAGS.find(f => f.value === message.priorityFlag)?.emoji} {message.priorityFlag}
                </span>
            )}

            {/* P4-7: Thread reply indicator */}
            {message.threadParentText && (
                <div className="thread-reply-indicator" onClick={() => onAction?.('viewThread', message)}>
                    ↩️ <em>{message.threadParentText.slice(0, 30)}...</em>
                </div>
            )}

            {/* P4-8: File attachment */}
            {message.file && (
                <div className="file-attachment">
                    <span className="file-icon">{getFileIcon(message.file.name)}</span>
                    <span className="file-name">{message.file.name}</span>
                    <span className="file-size">{message.file.size}</span>
                </div>
            )}

            {/* P4-4: Contact card */}
            {message.contactCard && (
                <div className="contact-card">
                    <SPAvatar src={message.contactCard.avatar} size={32} />
                    <div>
                        <strong>{message.contactCard.name}</strong>
                        <span style={{ fontSize: 11, color: '#666', display: 'block' }}>{message.contactCard.role || 'Player'}</span>
                    </div>
                </div>
            )}

            {/* P5-3: Voice message */}
            {message.isVoice && (
                <div className="voice-message">
                    <button className="voice-play-btn">▶</button>
                    <div className="voice-waveform">
                        {Array.from({ length: 20 }, (_, i) => (
                            <div key={i} className="wave-bar" style={{ height: `${Math.random() * 16 + 4}px` }} />
                        ))}
                    </div>
                    <span className="voice-duration">{message.voiceDuration || '0:03'}</span>
                </div>
            )}

            {/* P4-3 + P5-7: Rich text via markdown + auto-links */}
            {!message.file && !message.contactCard && !message.isVoice && (
                <span dangerouslySetInnerHTML={{ __html: parseMarkdown(message.text) }} />
            )}

            {/* P5-6: Edit indicator */}
            {message.isEdited && <span className="edit-indicator" title="Edited">(edited)</span>}

            {/* P5-4: Read receipts */}
            {message.isOwn && (
                <span className="read-receipt">
                    {message.readStatus === 'read' ? '✓✓' : message.readStatus === 'delivered' ? '✓✓' : '✓'}
                </span>
            )}

            {/* Labels & Bookmarks Indicator */}
            {(message.labels?.length > 0 || message.isBookmarked) && (
                <div className="message-badges">
                    {message.isBookmarked && <span title="Saved">📌</span>}
                    {message.labels?.map((l, i) => (
                        <span key={i} className={`label-badge ${l.replace(' ', '-').toLowerCase()}`}>{l}</span>
                    ))}
                </div>
            )}

            {/* Reactions */}
            {message.reactions?.length > 0 && (
                <div className="message-reactions">
                    {message.reactions.map((r, i) => (
                        <span key={i}>{r.emoji}</span>
                    ))}
                </div>
            )}

            {/* P4-7: Thread reply count */}
            {message.threadCount > 0 && (
                <button className="thread-count-btn" onClick={() => onAction?.('viewThread', message)}>
                    💬 {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
                </button>
            )}

            {/* P5-2: Emoji reactions display */}
            {message.reactionList?.length > 0 && (
                <div className="message-reactions">
                    {message.reactionList.map((r, i) => (
                        <span key={i} className="reaction-chip" title={r.by}>{r.emoji}</span>
                    ))}
                </div>
            )}

            {/* Hover Actions */}
            <div className="message-hover-actions">
                <button onClick={() => onAction?.('bookmark', message)} title={message.isBookmarked ? "Remove Bookmark" : "Save Bookmark"}>📌</button>
                <button onClick={() => onAction?.('pin', message)} title={message.isPinned ? "Unpin" : "Pin"}>📍</button>
                <button onClick={() => onAction?.('forward', message)} title="Forward">↗️</button>
                <button onClick={() => onAction?.('thread', message)} title="Reply in Thread">💬</button>
                <button onClick={() => onAction?.('react', message)} title="React">😀</button>
                <button onClick={() => onAction?.('edit', message)} title="Edit">✏️</button>
                <button onClick={() => onAction?.('priority', message)} title="Set Priority">🚨</button>
                {LABEL_CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => onAction?.('label', message, cat)} title={`Label: ${cat}`} style={{ fontSize: 10, padding: '2px 4px' }}>
                        {cat === 'Important' ? '🔴' : cat === 'Action Required' ? '🟠' : cat === 'Tournament Info' ? '🟢' : '💰'}
                    </button>
                ))}
            </div>
        </div>

        {/* Timestamp (on hover) */}
        <span className="message-time">{message.time}</span>

        <style>{`
            .message-row {
                display: flex;
                align-items: flex-end;
                gap: 8px;
                margin-bottom: 2px;
                padding: 0 12px;
            }

            .message-row.own {
                flex-direction: row-reverse;
            }

            .avatar-spacer {
                width: 28px;
            }

            .message-bubble {
                max-width: 65%;
                padding: 8px 12px;
                border-radius: 18px;
                font-size: 15px;
                line-height: 1.34;
                position: relative;
            }

            .message-bubble.own {
                background: ${SP_COLORS.blue};
                color: white;
                border-bottom-right-radius: 4px;
            }

            .message-bubble.other {
                background: ${SP_COLORS.bgMain};
                color: ${SP_COLORS.textPrimary};
                border-bottom-left-radius: 4px;
            }

            .message-reactions {
                position: absolute;
                bottom: -8px;
                right: 8px;
                background: white;
                border-radius: 10px;
                padding: 2px 4px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                font-size: 12px;
            }

            .message-hover-actions {
                position: absolute;
                top: -12px;
                right: 12px;
                background: white;
                border-radius: 6px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                display: flex;
                gap: 4px;
                padding: 2px 4px;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s;
            }

            .message-row.own .message-hover-actions {
                right: auto;
                left: 12px;
            }

            .message-bubble:hover .message-hover-actions {
                opacity: 1;
                pointer-events: auto;
            }

            .message-hover-actions button {
                background: none;
                border: none;
                padding: 2px;
                cursor: pointer;
                font-size: 14px;
                border-radius: 4px;
            }

            .message-hover-actions button:hover {
                background: #f0f0f0;
            }

            .message-time {
                font-size: 11px;
                color: ${SP_COLORS.textSecondary};
                opacity: 0;
                white-space: nowrap;
            }

            .message-row:hover .message-time {
                opacity: 1;
            }
        `}</style>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// 💬 CHAT WINDOW
// ═══════════════════════════════════════════════════════════════════════════

export const ChatWindow = ({
    conversation,
    conversations = [],
    messages = [],
    currentUser,
    onSend,
    onClose,
    onMinimize,
    onBroadcast,
    onForwardMessage,
    isAdmin = false,
    minimized = false
}) => {
    const [inputText, setInputText] = useState('');
    const [showThemePicker, setShowThemePicker] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [showTemplateEditor, setShowTemplateEditor] = useState(false);
    const [newTemplate, setNewTemplate] = useState('');
    const [scheduledTime, setScheduledTime] = useState('');
    const [bookmarksOpen, setBookmarksOpen] = useState(false);
    const [bookmarkSearch, setBookmarkSearch] = useState('');
    const [labelFilter, setLabelFilter] = useState('');
    const [showDisappearMenu, setShowDisappearMenu] = useState(false);
    const [showScheduledQueue, setShowScheduledQueue] = useState(false);
    // P4 state
    const [forwardMsg, setForwardMsg] = useState(null);
    const [threadParent, setThreadParent] = useState(null);
    const [showSmartReplies, setShowSmartReplies] = useState([]);
    // P5 state
    const [msgSearch, setMsgSearch] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [editingMsg, setEditingMsg] = useState(null);
    const [editText, setEditText] = useState('');
    const [showStats, setShowStats] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [userStatus, setUserStatus] = useState('online');
    const [showMuteMenu, setShowMuteMenu] = useState(false);
    const [showPriorityPicker, setShowPriorityPicker] = useState(null);
    const [showGroupCreate, setShowGroupCreate] = useState(false);
    const [groupParticipants, setGroupParticipants] = useState([]);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const idleTimeoutRef = useRef(null);
    const [prefs, updatePrefs] = useMessengerPrefs();

    const conversationId = conversation?.id;
    const theme = prefs.themes[conversationId] || SP_COLORS.bgWhite;
    const disappearMs = prefs.disappearing[conversationId] || 0;
    const isDisappearing = disappearMs > 0;
    const pinnedIds = prefs.pinnedMessages[conversationId] || [];
    const isArchived = (prefs.archivedConversations || []).includes(conversationId);
    const isDND = prefs.dndConversations?.[conversationId] || false;
    const muteUntil = prefs.mutedConversations?.[conversationId] || 0;
    const isMuted = muteUntil === -1 || (muteUntil > 0 && Date.now() < muteUntil);
    const unreadCount = prefs.unreadCounts?.[conversationId] || 0;

    // P6-3: Auto-away detection
    useEffect(() => {
        const resetIdle = () => {
            setUserStatus('online');
            clearTimeout(idleTimeoutRef.current);
            idleTimeoutRef.current = setTimeout(() => setUserStatus('away'), 300000);
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('mousemove', resetIdle);
            window.addEventListener('keydown', resetIdle);
            resetIdle();
            return () => {
                window.removeEventListener('mousemove', resetIdle);
                window.removeEventListener('keydown', resetIdle);
                clearTimeout(idleTimeoutRef.current);
            };
        }
    }, []);

    // Phase 6: EventBus real-time listener (Comprehensive Layer)
    useEffect(() => {
        const handleReceived = (event) => {
            const { conversationId: evtConvId, senderId } = event.payload;
            if (evtConvId === conversationId && senderId !== currentUser?.id) {
                if (minimized || document.hidden) {
                    updatePrefs(p => ({ ...p, unreadCounts: { ...p.unreadCounts, [evtConvId]: (p.unreadCounts?.[evtConvId] || 0) + 1 } }));
                }
            }
        };

        const handleReacted = (event) => {
            const { conversationId: evtConvId, messageId, emoji } = event.payload;
            if (evtConvId === conversationId && event.source !== 'Messenger') {
                updatePrefs(p => {
                    const current = p.reactions[messageId] || [];
                    const exists = current.find(r => r.emoji === emoji && r.by === 'System'); // Assuming remote implies by another user
                    return { ...p, reactions: { ...p.reactions, [messageId]: exists ? current : [...current, { emoji, by: 'Remote User' }] } };
                });
            }
        };

        const handleEdited = (event) => {
            // Placeholder: in a real remote sync, the updated message text would be retrieved
        };

        const unsubReceived = eventBus.on(EventType.MESSAGE_RECEIVED, handleReceived);
        const unsubReacted = eventBus.on(EventType.MESSAGE_REACTED, handleReacted);
        const unsubEdited = eventBus.on(EventType.MESSAGE_EDITED, handleEdited);
        const unsubMutated = eventBus.on(EventType.DATA_MUTATED, () => {
             // global sync trigger if needed
        });

        return () => {
            unsubReceived();
            unsubReacted();
            unsubEdited();
            unsubMutated();
        };
    }, [conversationId, currentUser, minimized, updatePrefs]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, showTemplates, showThemePicker]);

    // E4: Restore scheduled queue timers on mount
    useEffect(() => {
        const queue = prefs.scheduledQueue || [];
        queue.forEach(item => {
            if (item.conversationId === conversationId) {
                const delayMs = new Date(item.sendAt).getTime() - Date.now();
                if (delayMs > 0) {
                    setTimeout(() => { onSend?.(item.text); updatePrefs(p => ({ ...p, scheduledQueue: p.scheduledQueue.filter(q => q.id !== item.id) })); }, delayMs);
                }
            }
        });
    }, [conversationId]);

    const handleSend = () => {
        if (inputText.trim()) {
            if (scheduledTime) {
                // E4: Persist scheduled message to localStorage queue
                const delayMs = new Date(scheduledTime).getTime() - Date.now();
                const queueItem = { id: Date.now(), text: inputText, sendAt: scheduledTime, conversationId };
                if (delayMs > 0) {
                    setTimeout(() => { onSend?.(inputText); updatePrefs(p => ({ ...p, scheduledQueue: (p.scheduledQueue || []).filter(q => q.id !== queueItem.id) })); }, delayMs);
                    updatePrefs(p => ({ ...p, scheduledQueue: [...(p.scheduledQueue || []), queueItem] }));
                    console.log(`[Messenger] Message scheduled to send in ${delayMs}ms — persisted to queue`);
                } else {
                    onSend?.(inputText);
                }
            } else {
                onSend?.(inputText);
                busEmit.messageSent(conversationId, otherUser?.id);
            }
            setInputText('');
            setScheduledTime('');
            setShowTemplates(false);
        }
    };

    const handleAction = (action, msg, payload) => {
        if (action === 'bookmark') {
            updatePrefs(p => {
                const isSaved = p.bookmarks.find(b => b.id === msg.id);
                busEmit.messageBookmarked(conversationId, msg.id);
                return {
                    ...p,
                    bookmarks: isSaved 
                        ? p.bookmarks.filter(b => b.id !== msg.id)
                        : [...p.bookmarks, { ...msg, savedAt: Date.now() }]
                };
            });
        }
        if (action === 'label') {
            updatePrefs(p => {
                const existingLabels = p.labels[msg.id] || [];
                const newLabels = existingLabels.includes(payload)
                    ? existingLabels.filter(l => l !== payload)
                    : [...existingLabels, payload];
                return { ...p, labels: { ...p.labels, [msg.id]: newLabels } };
            });
        }
        // P4-1: Pin/unpin
        if (action === 'pin') {
            updatePrefs(p => {
                const current = p.pinnedMessages[conversationId] || [];
                const isPinned = current.includes(msg.id);
                busEmit.messagePinned(conversationId, msg.id);
                return { ...p, pinnedMessages: { ...p.pinnedMessages, [conversationId]: isPinned ? current.filter(id => id !== msg.id) : [...current, msg.id] } };
            });
        }
        // P4-2: Forward (open modal)
        if (action === 'forward') {
            setForwardMsg(msg);
            busEmit.messageForwarded(conversationId, null);
        }
        // P4-7: Thread reply
        if (action === 'thread') {
            setThreadParent(msg);
        }
        if (action === 'viewThread') {
            setThreadParent(msg);
        }
        // P5-2: React
        if (action === 'react') {
            setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id);
        }
        // P5-6: Edit
        if (action === 'edit') {
            setEditingMsg(msg);
            setEditText(msg.text || '');
        }
        // P6-2: Priority flag
        if (action === 'priority') {
            setShowPriorityPicker(showPriorityPicker === msg.id ? null : msg.id);
        }
    };

    // P5-2: Handle emoji reaction
    const handleReaction = (msgId, emoji) => {
        updatePrefs(p => {
            const current = p.reactions[msgId] || [];
            const exists = current.find(r => r.emoji === emoji && r.by === currentUser?.name);
            busEmit.messageReacted(conversationId, msgId, emoji);
            return { ...p, reactions: { ...p.reactions, [msgId]: exists ? current.filter(r => !(r.emoji === emoji && r.by === currentUser?.name)) : [...current, { emoji, by: currentUser?.name || 'You' }] } };
        });
        setShowEmojiPicker(null);
    };

    // P5-6: Save edit
    const handleSaveEdit = () => {
        if (editingMsg && editText.trim()) {
            updatePrefs(p => {
                const history = p.editHistory[editingMsg.id] || [];
                return { ...p, editHistory: { ...p.editHistory, [editingMsg.id]: [...history, { text: editingMsg.text, editedAt: Date.now() }] } };
            });
            busEmit.messageEdited(conversationId, editingMsg.id);
            console.log(`[Messenger] Edited message ${editingMsg.id}: "${editText}"`);
        }
        setEditingMsg(null);
        setEditText('');
    };

    // P5-5: Simulate typing indicator on input
    const handleInputChange = (e) => {
        setInputText(e.target.value);
        setIsTyping(true);
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000);
    };

    // P4-6: Generate smart replies based on last message
    useEffect(() => {
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.senderId !== currentUser?.id && lastMsg?.text) {
                const lower = lastMsg.text.toLowerCase();
                for (const rule of SMART_REPLIES) {
                    if (rule.trigger.some(t => lower.includes(t))) {
                        setShowSmartReplies(rule.replies);
                        return;
                    }
                }
            }
        }
        setShowSmartReplies([]);
    }, [messages]);

    // P4-8: File upload handler
    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            onSend?.(`📎 [File: ${file.name}]`, { file: { name: file.name, size: (file.size / 1024).toFixed(1) + ' KB', type: file.type } });
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (editingMsg) { handleSaveEdit(); } else { handleSend(); }
        }
    };

    // P5-8: Compute stats
    const stats = {
        total: messages.length,
        mine: messages.filter(m => m.senderId === currentUser?.id).length,
        theirs: messages.filter(m => m.senderId !== currentUser?.id).length,
        avgLength: messages.length > 0 ? Math.round(messages.reduce((sum, m) => sum + (m.text?.length || 0), 0) / messages.length) : 0
    };

    const otherUser = conversation?.participants?.find(p => p.id !== currentUser?.id);

    if (minimized) {
        return (
            <div className="chat-minimized" onClick={onMinimize}>
                <SPAvatar src={otherUser?.avatar} size={48} online={otherUser?.online} />
                {conversation?.unreadCount > 0 && (
                    <span className="unread-badge">{conversation.unreadCount}</span>
                )}
                <style>{`
                    .chat-minimized {
                        position: relative;
                        cursor: pointer;
                    }
                    .unread-badge {
                        position: absolute;
                        top: -4px;
                        right: -4px;
                        min-width: 18px;
                        height: 18px;
                        background: #E41E3F;
                        color: white;
                        font-size: 11px;
                        font-weight: 700;
                        border-radius: 9px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="chat-window" style={{ background: theme.startsWith('linear') ? undefined : theme, backgroundImage: theme.startsWith('linear') ? theme : undefined }}>
            {/* Header */}
            <div className="chat-header">
                <SPAvatar src={otherUser?.avatar} size={32} online={otherUser?.online} />
                <div className="chat-user-info">
                    <span className="chat-user-name">{otherUser?.name}</span>
                    <span className="chat-user-status">
                        {userStatus === 'away' ? '🟡 Away' : otherUser?.online ? 'Active now' : 'Active 2h ago'}
                        {isDND && <span style={{ marginLeft: 4, color: '#E41E3F' }} title="Do Not Disturb">🔕</span>}
                        {isMuted && <span style={{ marginLeft: 4, color: '#999' }} title="Muted">🔇</span>}
                        {isDisappearing && <span style={{ marginLeft: 4 }} title="Disappearing Messages On">⏱️ {DISAPPEAR_OPTIONS.find(o => o.value === disappearMs)?.label || '24h'}</span>}
                    </span>
                </div>
                <div className="chat-header-actions">
                    {/* E1: Broadcast button for admins */}
                    {isAdmin && <button className="header-btn" onClick={() => { if (inputText.trim()) onBroadcast?.(inputText); }} title="Broadcast to All Members" style={{ color: inputText.trim() ? '#0088ff' : '#ccc' }}>📢</button>}
                    {/* E3: Label Filter */}
                    <select className="label-filter-select" value={labelFilter} onChange={e => setLabelFilter(e.target.value)} title="Filter by Label">
                        <option value="">All</option>
                        {LABEL_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <button className="header-btn" onClick={() => setShowThemePicker(!showThemePicker)} title="Themes">🎨</button>
                    {/* E7: Disappearing Timer dropdown */}
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button className="header-btn" onClick={() => setShowDisappearMenu(!showDisappearMenu)} title="Disappearing Timer">⏱️</button>
                        {showDisappearMenu && (
                            <div className="disappear-menu">
                                {DISAPPEAR_OPTIONS.map(opt => (
                                    <button key={opt.value} className={`disappear-opt ${disappearMs === opt.value ? 'active' : ''}`} onClick={() => { updatePrefs(p => ({ ...p, disappearing: { ...p.disappearing, [conversationId]: opt.value } })); setShowDisappearMenu(false); }}>{opt.label}</button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button className="header-btn" onClick={() => setBookmarksOpen(!bookmarksOpen)} title="Saved Messages">📌</button>
                    {/* E4: Scheduled Queue viewer */}
                    <button className="header-btn" onClick={() => setShowScheduledQueue(!showScheduledQueue)} title="Pending Messages" style={{ position: 'relative' }}>
                        ⏰
                        {(prefs.scheduledQueue || []).filter(q => q.conversationId === conversationId).length > 0 && (
                            <span style={{ position: 'absolute', top: -2, right: -2, background: '#0088ff', color: 'white', borderRadius: 8, fontSize: 9, padding: '0 3px', fontWeight: 700 }}>
                                {(prefs.scheduledQueue || []).filter(q => q.conversationId === conversationId).length}
                            </span>
                        )}
                    </button>
                    {/* P4-5: Archive toggle */}
                    <button className="header-btn" onClick={() => updatePrefs(p => ({ ...p, archivedConversations: isArchived ? (p.archivedConversations || []).filter(id => id !== conversationId) : [...(p.archivedConversations || []), conversationId] }))} title={isArchived ? 'Unarchive' : 'Archive'} style={{ color: isArchived ? '#0088ff' : undefined }}>📦</button>
                    {/* P5-1: Search toggle */}
                    <button className="header-btn" onClick={() => setMsgSearch(msgSearch ? '' : ' ')} title="Search Messages">🔍</button>
                    {/* P5-8: Stats toggle */}
                    <button className="header-btn" onClick={() => setShowStats(!showStats)} title="Chat Stats">📊</button>
                    {/* P6-1: DND toggle */}
                    <button className="header-btn" onClick={() => updatePrefs(p => ({ ...p, dndConversations: { ...p.dndConversations, [conversationId]: !isDND } }))} title={isDND ? 'Disable DND' : 'Do Not Disturb'} style={{ color: isDND ? '#E41E3F' : undefined }}>🔕</button>
                    {/* P6-6: Mute timer */}
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button className="header-btn" onClick={() => setShowMuteMenu(!showMuteMenu)} title={isMuted ? 'Muted' : 'Mute'} style={{ color: isMuted ? '#999' : undefined }}>🔇</button>
                        {showMuteMenu && (
                            <div className="disappear-menu">
                                {MUTE_OPTIONS.map(opt => (
                                    <button key={opt.value} className={`disappear-opt ${muteUntil === opt.value || (opt.value > 0 && muteUntil > 0 && muteUntil !== -1) ? '' : ''}`} onClick={() => { updatePrefs(p => ({ ...p, mutedConversations: { ...p.mutedConversations, [conversationId]: opt.value === -1 ? -1 : opt.value === 0 ? 0 : Date.now() + opt.value } })); setShowMuteMenu(false); }}>{opt.label}</button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button className="header-btn" onClick={onMinimize}>−</button>
                    <button className="header-btn" onClick={onClose}>✕</button>
                </div>
            </div>

            {/* P5-1: Message Search Bar */}
            {msgSearch !== '' && (
                <div style={{ padding: '4px 8px', borderBottom: '1px solid #ddd', background: '#fafafa' }}>
                    <input type="text" placeholder="Search messages..." value={msgSearch.trim() ? msgSearch : ''} onChange={e => setMsgSearch(e.target.value)} autoFocus style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px', fontSize: 11, boxSizing: 'border-box' }} />
                </div>
            )}

            {/* P5-8: Stats Dashboard */}
            {showStats && (
                <div className="stats-dashboard">
                    <strong>📊 Chat Stats</strong>
                    <div className="stats-grid">
                        <div className="stat-card"><span className="stat-val">{stats.total}</span><span className="stat-label">Total</span></div>
                        <div className="stat-card"><span className="stat-val">{stats.mine}</span><span className="stat-label">Sent</span></div>
                        <div className="stat-card"><span className="stat-val">{stats.theirs}</span><span className="stat-label">Received</span></div>
                        <div className="stat-card"><span className="stat-val">{stats.avgLength}</span><span className="stat-label">Avg Chars</span></div>
                    </div>
                </div>
            )}

            {/* E6: Theme Picker with Gradients */}
            {showThemePicker && (
                <div className="theme-picker-bar">
                    {THEME_PRESETS.map(preset => (
                        <div
                            key={preset.label}
                            style={{ background: preset.value, border: theme === preset.value ? '2px solid #0088ff' : '1px solid #ddd' }}
                            className="theme-circle"
                            title={preset.label}
                            onClick={() => { updatePrefs(p => ({ ...p, themes: { ...p.themes, [conversationId]: preset.value }})); setShowThemePicker(false); }}
                        />
                    ))}
                </div>
            )}

            {/* E4: Scheduled Queue Drawer */}
            {showScheduledQueue && (
                <div style={{ maxHeight: 100, overflowY: 'auto', background: '#f0f8ff', borderBottom: '1px solid #ddd', padding: 8, fontSize: 11 }}>
                    <strong>⏰ Pending Messages</strong>
                    {(prefs.scheduledQueue || []).filter(q => q.conversationId === conversationId).length === 0 && <p style={{ color: '#999', margin: '4px 0' }}>No scheduled messages</p>}
                    {(prefs.scheduledQueue || []).filter(q => q.conversationId === conversationId).map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #eee' }}>
                            <span>{item.text?.slice(0, 40)}{item.text?.length > 40 ? '...' : ''}</span>
                            <span style={{ color: '#0088ff', whiteSpace: 'nowrap', marginLeft: 8 }}>{new Date(item.sendAt).toLocaleTimeString()}</span>
                            <button style={{ background: 'none', border: 'none', color: '#E41E3F', cursor: 'pointer', fontSize: 10, marginLeft: 4 }} onClick={() => updatePrefs(p => ({ ...p, scheduledQueue: (p.scheduledQueue || []).filter(q => q.id !== item.id) }))}>✕</button>
                        </div>
                    ))}
                </div>
            )}

            {/* E5: Bookmarks Drawer with Search */}
            {bookmarksOpen && (
                <div style={{ maxHeight: 150, overflowY: 'auto', background: '#fffdf0', borderBottom: '1px solid #ddd', padding: 8, fontSize: 12 }}>
                    <strong>📌 Saved Messages</strong>
                    <input type="text" placeholder="Search saved..." value={bookmarkSearch} onChange={e => setBookmarkSearch(e.target.value)} style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px', fontSize: 11, marginTop: 4, marginBottom: 4, boxSizing: 'border-box' }} />
                    {prefs.bookmarks.filter(bm => !bookmarkSearch || bm.text?.toLowerCase().includes(bookmarkSearch.toLowerCase())).length === 0 && <p style={{ color: '#999', margin: '4px 0' }}>{bookmarkSearch ? 'No matches' : 'No saved messages yet'}</p>}
                    {prefs.bookmarks.filter(bm => !bookmarkSearch || bm.text?.toLowerCase().includes(bookmarkSearch.toLowerCase())).map((bm, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee' }}>
                            <span>{bm.text?.slice(0, 50)}{bm.text?.length > 50 ? '...' : ''}</span>
                            <button style={{ background: 'none', border: 'none', color: '#E41E3F', cursor: 'pointer', fontSize: 10 }} onClick={() => updatePrefs(p => ({ ...p, bookmarks: p.bookmarks.filter(b => b.id !== bm.id) }))}>✕</button>
                        </div>
                    ))}
                </div>
            )}

            {/* P4-1: Pinned Messages Bar */}
            {pinnedIds.length > 0 && (
                <div className="pinned-bar">
                    <span>📍 <strong>{pinnedIds.length} pinned</strong></span>
                    <div style={{ fontSize: 11, color: '#666' }}>
                        {messages.filter(m => pinnedIds.includes(m.id)).slice(0, 2).map((m, i) => (
                            <span key={i} style={{ marginRight: 8 }}>{m.text?.slice(0, 25)}...</span>
                        ))}
                    </div>
                </div>
            )}

            {/* P4-2: Forward Modal */}
            {forwardMsg && (
                <div className="forward-modal">
                    <div className="forward-content">
                        <strong>↗️ Forward Message</strong>
                        <p style={{ fontSize: 11, color: '#666', margin: '4px 0' }}>"{forwardMsg.text?.slice(0, 50)}..."</p>
                        <div style={{ maxHeight: 100, overflowY: 'auto' }}>
                            {conversations.filter(c => c.id !== conversationId).map((c, i) => {
                                const target = c.participants?.find(p => p.id !== currentUser?.id);
                                return (
                                    <button key={i} className="forward-target" onClick={() => { onForwardMessage?.(c.id, forwardMsg); setForwardMsg(null); }}>
                                        <SPAvatar src={target?.avatar} size={24} /> {target?.name}
                                    </button>
                                );
                            })}
                        </div>
                        <button style={{ marginTop: 8, background: '#ddd', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 11 }} onClick={() => setForwardMsg(null)}>Cancel</button>
                    </div>
                </div>
            )}

            {/* P4-7: Thread Panel */}
            {threadParent && (
                <div className="thread-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <strong>💬 Thread</strong>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setThreadParent(null)}>✕</button>
                    </div>
                    <div className="thread-parent-msg">
                        <span style={{ fontWeight: 600 }}>{threadParent.senderName || 'User'}</span>: {threadParent.text?.slice(0, 80)}
                    </div>
                    <div style={{ marginTop: 4, maxHeight: 60, overflowY: 'auto' }}>
                        {(prefs.threadReplies[threadParent.id] || []).map((r, i) => (
                            <div key={i} style={{ fontSize: 11, padding: '2px 0', borderTop: '1px solid #eee' }}>{r.text}</div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <input type="text" placeholder="Reply in thread..." id="thread-reply-input" style={{ flex: 1, border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px', fontSize: 11 }} onKeyPress={e => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                                const reply = { text: e.target.value, timestamp: Date.now() };
                                updatePrefs(p => ({ ...p, threadReplies: { ...p.threadReplies, [threadParent.id]: [...(p.threadReplies[threadParent.id] || []), reply] } }));
                                e.target.value = '';
                            }
                        }} />
                    </div>
                </div>
            )}

            {/* P5-2: Emoji Picker Overlay */}
            {showEmojiPicker && (
                <div className="emoji-picker-overlay">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <strong>React</strong>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowEmojiPicker(null)}>✕</button>
                    </div>
                    {EMOJI_GRID.map(group => (
                        <div key={group.cat} style={{ marginBottom: 4 }}>
                            <span style={{ fontSize: 9, color: '#999', textTransform: 'uppercase' }}>{group.cat}</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                {group.emojis.map((em, i) => (
                                    <button key={i} className="emoji-pick-btn" onClick={() => handleReaction(showEmojiPicker, em)}>{em}</button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* P5-6: Edit Modal */}
            {editingMsg && (
                <div style={{ padding: '6px 8px', background: '#fff9e6', borderBottom: '1px solid #ffd700', fontSize: 11 }}>
                    <strong>✏️ Editing message</strong>
                    <input type="text" value={editText} onChange={e => setEditText(e.target.value)} onKeyPress={handleKeyPress} style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px', fontSize: 12, marginTop: 4, boxSizing: 'border-box' }} autoFocus />
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button style={{ background: '#0088ff', color: 'white', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }} onClick={handleSaveEdit}>Save</button>
                        <button style={{ background: '#ddd', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }} onClick={() => { setEditingMsg(null); setEditText(''); }}>Cancel</button>
                    </div>
                </div>
            )}

            {/* P6-2: Priority Picker Overlay */}
            {showPriorityPicker && (
                <div style={{ padding: '6px 8px', background: '#f8f8ff', borderBottom: '1px solid #ddd', fontSize: 11 }}>
                    <strong>🚨 Set Priority</strong>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        {PRIORITY_FLAGS.map(f => (
                            <button key={f.value} onClick={() => { updatePrefs(p => ({ ...p, priorityFlags: { ...p.priorityFlags, [showPriorityPicker]: f.value } })); setShowPriorityPicker(null); }} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
                                {f.emoji} {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Messages */}
            <div className="chat-messages">
                {messages.filter(msg => {
                    // P5-1: Apply search filter
                    if (msgSearch.trim() && !msg.text?.toLowerCase().includes(msgSearch.toLowerCase().trim())) return false;
                    return true;
                }).map((msg, i) => {
                    // E7: Filter disappearing messages based on selected timer
                    if (disappearMs > 0 && msg.timestamp && (Date.now() - new Date(msg.timestamp).getTime() > disappearMs)) {
                        return null;
                    }

                    // E3: Apply label filter
                    const msgLabels = prefs.labels[msg.id] || [];
                    if (labelFilter && !msgLabels.includes(labelFilter)) {
                        return null;
                    }

                    const enrichedMsg = {
                        ...msg,
                        isBookmarked: prefs.bookmarks.some(b => b.id === msg.id),
                        labels: msgLabels,
                        isDisappearing: isDisappearing,
                        isPinned: pinnedIds.includes(msg.id),
                        threadCount: (prefs.threadReplies[msg.id] || []).length,
                        reactionList: prefs.reactions[msg.id] || [],
                        isEdited: (prefs.editHistory[msg.id] || []).length > 0,
                        isOwn: msg.senderId === currentUser?.id,
                        readStatus: msg.readStatus || (msg.senderId === currentUser?.id ? 'sent' : null),
                        priorityFlag: prefs.priorityFlags?.[msg.id] || null,
                        deliveryStatus: msg.deliveryStatus || 'delivered'
                    };

                    const isOwn = enrichedMsg.senderId === currentUser?.id;
                    const prevMsg = messages[i - 1];
                    const showAvatar = !isOwn && (!prevMsg || prevMsg.senderId !== enrichedMsg.senderId);

                    return (
                        <MessageBubble
                            key={enrichedMsg.id || i}
                            message={enrichedMsg}
                            isOwn={isOwn}
                            showAvatar={showAvatar}
                            user={otherUser}
                            onAction={handleAction}
                        />
                    );
                })}
                <div ref={messagesEndRef} />

                {/* P5-5: Typing indicator */}
                {isTyping && (
                    <div className="typing-indicator">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                    </div>
                )}
            </div>

            {/* P4-6: Smart Reply Suggestions */}
            {showSmartReplies.length > 0 && (
                <div className="smart-replies-bar">
                    {showSmartReplies.map((reply, i) => (
                        <button key={i} className="smart-reply-chip" onClick={() => { onSend?.(reply); setShowSmartReplies([]); }}>{reply}</button>
                    ))}
                </div>
            )}

            {/* E2: Templates Bar + Editor */}
            {showTemplates && (
                <div className="templates-bar" style={{ flexWrap: 'wrap' }}>
                    {prefs.templates.map((tpl, i) => (
                        <span key={i} className="template-chip" onClick={() => { setInputText(tpl); setShowTemplates(false); }}>
                            {tpl}
                            <button style={{ marginLeft: 4, background: 'none', border: 'none', color: '#E41E3F', cursor: 'pointer', fontSize: 10 }} onClick={(e) => { e.stopPropagation(); updatePrefs(p => ({ ...p, templates: p.templates.filter((_, idx) => idx !== i) })); }}>✕</button>
                        </span>
                    ))}
                    <button className="template-chip" style={{ fontWeight: 700 }} onClick={() => setShowTemplateEditor(!showTemplateEditor)}>+ Add</button>
                </div>
            )}
            {/* E2: Template Editor */}
            {showTemplateEditor && (
                <div style={{ display: 'flex', gap: 4, padding: '4px 8px', background: '#f9f9f9', borderTop: '1px solid #ddd' }}>
                    <input type="text" placeholder="New template text..." value={newTemplate} onChange={e => setNewTemplate(e.target.value)} style={{ flex: 1, border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px', fontSize: 11 }} />
                    <button style={{ background: '#0088ff', color: 'white', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }} onClick={() => { if (newTemplate.trim()) { updatePrefs(p => ({ ...p, templates: [...p.templates, newTemplate.trim()] })); setNewTemplate(''); setShowTemplateEditor(false); } }}>Save</button>
                </div>
            )}

            {/* Input */}
            <div className="chat-input" style={{ flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 4 }}>
                    <button className="input-btn" onClick={() => setShowTemplates(!showTemplates)} title="Templates">📋</button>
                    <button className="input-btn" onClick={() => fileInputRef.current?.click()} title="Attach File">📎</button>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                    {/* P5-3: Voice recording button */}
                    <button className={`input-btn ${isRecording ? 'recording' : ''}`} onClick={() => { if (!isRecording) { setIsRecording(true); setTimeout(() => { setIsRecording(false); onSend?.('🎤 Voice message (0:03)'); busEmit.voiceMessageSent(conversationId, '0:03'); }, 3000); } }} title={isRecording ? 'Recording...' : 'Voice Message'}>{isRecording ? '🔴' : '🎤'}</button>
                    <button className="input-btn">🎁</button>

                    <div className="input-wrapper">
                        <input
                            type="text"
                            placeholder="Aa"
                            value={inputText}
                            onChange={handleInputChange}
                            onKeyPress={handleKeyPress}
                        />
                        <span style={{ position: 'relative', display: 'inline-flex' }}>
                            <input
                                type="datetime-local"
                                style={{ position: 'absolute', opacity: 0, width: 20, height: 20, cursor: 'pointer' }}
                                onChange={(e) => setScheduledTime(e.target.value)}
                            />
                            <button className="emoji-btn" title="Schedule Message">{scheduledTime ? '⏰' : '📅'}</button>
                        </span>
                        <button className="emoji-btn">😊</button>
                    </div>

                    <button
                        className="send-btn"
                        onClick={handleSend}
                        disabled={!inputText.trim()}
                    >
                        {inputText.trim() ? '➤' : '👍'}
                    </button>
                </div>
                {scheduledTime && (
                    <div style={{ width: '100%', fontSize: 11, color: '#0088ff', paddingLeft: 40, marginTop: -4 }}>
                        Scheduled: {new Date(scheduledTime).toLocaleString()}
                        <button style={{ marginLeft: 8, background: 'none', border: 'none', color: '#E41E3F', cursor: 'pointer', fontSize: 11 }} onClick={() => setScheduledTime('')}>Cancel</button>
                    </div>
                )}
            </div>

            <style>{`
                .chat-window {
                    width: 328px;
                    height: 455px;
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 8px 8px 0 0;
                    box-shadow: 0 0 8px rgba(0,0,0,0.15);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .chat-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px;
                    background: ${SP_COLORS.bgWhite};
                    border-bottom: 1px solid ${SP_COLORS.divider};
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }

                .chat-user-info {
                    flex: 1;
                }

                .chat-user-name {
                    display: block;
                    font-weight: 600;
                    font-size: 13px;
                    color: ${SP_COLORS.textPrimary};
                }

                .chat-user-status {
                    font-size: 11px;
                    color: ${SP_COLORS.textSecondary};
                }

                .chat-header-actions {
                    display: flex;
                    gap: 4px;
                }

                .header-btn {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: transparent;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 14px;
                }

                .header-btn:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 8px 0;
                    display: flex;
                    flex-direction: column;
                }

                .theme-picker-bar {
                    display: flex;
                    gap: 8px;
                    padding: 8px;
                    background: white;
                    border-bottom: 1px solid ${SP_COLORS.divider};
                    justify-content: center;
                }

                .theme-circle {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    cursor: pointer;
                }

                .templates-bar {
                    display: flex;
                    gap: 6px;
                    padding: 6px 8px;
                    overflow-x: auto;
                    background: ${SP_COLORS.bgMain};
                    border-top: 1px solid ${SP_COLORS.divider};
                }

                .template-chip {
                    font-size: 11px;
                    background: white;
                    padding: 4px 8px;
                    border-radius: 12px;
                    border: 1px solid #ddd;
                    white-space: nowrap;
                    cursor: pointer;
                }

                .template-chip:hover {
                    background: ${SP_COLORS.blue};
                    color: white;
                    border-color: ${SP_COLORS.blue};
                }

                .ephemeral {
                    position: relative;
                }

                .ephemeral::after {
                    content: '⏱️';
                    position: absolute;
                    font-size: 10px;
                    right: 4px;
                    bottom: -4px;
                    opacity: 0.5;
                }

                .message-badges {
                    position: absolute;
                    top: -10px;
                    left: 4px;
                    display: flex;
                    gap: 4px;
                    font-size: 10px;
                }

                .label-badge {
                    background: #ffd700;
                    color: black;
                    padding: 2px 4px;
                    border-radius: 4px;
                    font-weight: 600;
                }

                .label-badge.action-required { background: #ff9800; color: white; }
                .label-badge.tournament-info { background: #4caf50; color: white; }
                .label-badge.payment { background: #9c27b0; color: white; }

                .label-filter-select {
                    font-size: 10px;
                    padding: 2px 4px;
                    border-radius: 4px;
                    border: 1px solid #ddd;
                    background: white;
                    cursor: pointer;
                    height: 24px;
                }

                .disappear-menu {
                    position: absolute;
                    top: 32px;
                    right: 0;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    display: flex;
                    flex-direction: column;
                    z-index: 10;
                    overflow: hidden;
                }

                .disappear-opt {
                    background: none;
                    border: none;
                    padding: 6px 16px;
                    font-size: 12px;
                    cursor: pointer;
                    text-align: left;
                    white-space: nowrap;
                }

                .disappear-opt:hover { background: #f0f0f0; }
                .disappear-opt.active { background: #e3f2fd; font-weight: 600; color: #0088ff; }

                /* P4 Styles */
                .pin-indicator { position: absolute; top: -8px; right: 4px; font-size: 10px; }
                .pinned-msg { border-left: 2px solid #0088ff; }

                .pinned-bar {
                    padding: 6px 8px;
                    background: #f0f8ff;
                    border-bottom: 1px solid #ddd;
                    font-size: 12px;
                }

                .forward-modal {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 20;
                }

                .forward-content {
                    background: white;
                    border-radius: 12px;
                    padding: 16px;
                    width: 80%;
                    max-height: 200px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
                }

                .forward-target {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    padding: 6px 8px;
                    background: none;
                    border: none;
                    border-bottom: 1px solid #eee;
                    cursor: pointer;
                    font-size: 12px;
                    text-align: left;
                }

                .forward-target:hover { background: #f5f5f5; }

                .thread-panel {
                    padding: 8px;
                    background: #fafafa;
                    border-bottom: 1px solid #ddd;
                    font-size: 12px;
                }

                .thread-parent-msg {
                    background: #f0f0f0;
                    border-radius: 6px;
                    padding: 4px 8px;
                    font-size: 11px;
                    color: #333;
                    border-left: 3px solid #0088ff;
                }

                .thread-reply-indicator {
                    font-size: 10px;
                    color: #888;
                    cursor: pointer;
                    margin-bottom: 4px;
                }

                .thread-count-btn {
                    background: none;
                    border: none;
                    color: #0088ff;
                    font-size: 11px;
                    cursor: pointer;
                    margin-top: 4px;
                    padding: 0;
                }

                .thread-count-btn:hover { text-decoration: underline; }

                .smart-replies-bar {
                    display: flex;
                    gap: 6px;
                    padding: 6px 8px;
                    overflow-x: auto;
                    background: #f9f9ff;
                    border-top: 1px solid #eee;
                }

                .smart-reply-chip {
                    font-size: 11px;
                    background: white;
                    padding: 4px 10px;
                    border-radius: 14px;
                    border: 1px solid #0088ff;
                    color: #0088ff;
                    white-space: nowrap;
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .smart-reply-chip:hover {
                    background: #0088ff;
                    color: white;
                }

                .file-attachment {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(0,0,0,0.05);
                    border-radius: 8px;
                    padding: 6px 10px;
                    margin-bottom: 4px;
                }

                .file-icon { font-size: 20px; }
                .file-name { font-size: 12px; font-weight: 500; }
                .file-size { font-size: 10px; color: #888; }

                .contact-card {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: rgba(0,0,0,0.04);
                    border-radius: 10px;
                    padding: 8px 12px;
                    border: 1px solid #e0e0e0;
                }

                /* P5 Styles */
                .emoji-picker-overlay {
                    padding: 8px;
                    background: white;
                    border-bottom: 1px solid #ddd;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    max-height: 140px;
                    overflow-y: auto;
                }

                .emoji-pick-btn {
                    width: 28px; height: 28px;
                    background: none; border: none;
                    font-size: 16px; cursor: pointer;
                    border-radius: 4px;
                    transition: background 0.15s;
                }
                .emoji-pick-btn:hover { background: #f0f0f0; }

                .reaction-chip {
                    display: inline-block;
                    font-size: 12px;
                    margin-right: 2px;
                    cursor: default;
                }

                .voice-message {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 0;
                }

                .voice-play-btn {
                    width: 28px; height: 28px;
                    border-radius: 50%;
                    background: #0088ff;
                    color: white;
                    border: none;
                    cursor: pointer;
                    font-size: 12px;
                    display: flex; align-items: center; justify-content: center;
                }

                .voice-waveform {
                    display: flex;
                    align-items: center;
                    gap: 1px;
                }

                .wave-bar {
                    width: 3px;
                    background: #0088ff;
                    border-radius: 2px;
                    opacity: 0.6;
                }

                .voice-duration { font-size: 10px; color: #888; }

                .read-receipt {
                    font-size: 10px;
                    color: #999;
                    margin-left: 4px;
                    float: right;
                }

                .edit-indicator {
                    font-size: 10px;
                    color: #aaa;
                    font-style: italic;
                    margin-left: 4px;
                }

                .typing-indicator {
                    display: flex;
                    gap: 3px;
                    padding: 8px 12px;
                }

                .typing-dot {
                    width: 6px; height: 6px;
                    background: #bbb;
                    border-radius: 50%;
                    animation: typingBounce 1.2s infinite;
                }

                .typing-dot:nth-child(2) { animation-delay: 0.2s; }
                .typing-dot:nth-child(3) { animation-delay: 0.4s; }

                @keyframes typingBounce {
                    0%, 60%, 100% { transform: translateY(0); }
                    30% { transform: translateY(-4px); }
                }

                .stats-dashboard {
                    padding: 8px;
                    background: #f8f9ff;
                    border-bottom: 1px solid #ddd;
                    font-size: 12px;
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 6px;
                    margin-top: 6px;
                }

                .stat-card {
                    text-align: center;
                    background: white;
                    border-radius: 8px;
                    padding: 6px 4px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
                }

                .stat-val { display: block; font-size: 16px; font-weight: 700; color: #0088ff; }
                .stat-label { font-size: 9px; color: #999; text-transform: uppercase; }

                .input-btn.recording {
                    animation: recordPulse 1s infinite;
                }

                @keyframes recordPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.2); }
                }

                /* P6 Styles */
                .priority-flag {
                    display: inline-block;
                    font-size: 9px;
                    padding: 1px 6px;
                    border-radius: 8px;
                    margin-bottom: 2px;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .priority-flag.urgent { background: #fde8e8; color: #E41E3F; }
                .priority-flag.low { background: #e8f5e9; color: #2e7d32; }

                .chat-input {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 8px;
                    border-top: 1px solid ${SP_COLORS.divider};
                }

                .input-btn {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: transparent;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                    color: ${SP_COLORS.blue};
                }

                .input-btn:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .input-wrapper {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    background: ${SP_COLORS.bgMain};
                    border-radius: 20px;
                    padding: 0 8px;
                }

                .input-wrapper input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    padding: 8px;
                    font-size: 14px;
                }

                .input-wrapper input:focus {
                    outline: none;
                }

                .emoji-btn {
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    font-size: 16px;
                }

                .send-btn {
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: transparent;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 18px;
                    color: ${SP_COLORS.blue};
                }

                .send-btn:disabled {
                    opacity: 0.5;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📋 CONVERSATION LIST
// ═══════════════════════════════════════════════════════════════════════════

export const ConversationList = ({
    conversations = [],
    currentUser,
    onSelectConversation,
    onNewMessage
}) => {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredConversations = conversations.filter(conv => {
        const otherUser = conv.participants?.find(p => p.id !== currentUser?.id);
        return otherUser?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <div className="conversation-list">
            {/* Header */}
            <div className="conv-header">
                <h2 className="conv-title">Chats</h2>
                <div className="conv-header-actions">
                    <button className="header-btn" title="Options">⋯</button>
                    <button className="header-btn" title="See All In Messenger">↗️</button>
                    <button className="header-btn" onClick={onNewMessage} title="New Message">✏️</button>
                </div>
            </div>

            {/* Search */}
            <div className="conv-search">
                <span className="search-icon">🔍</span>
                <input
                    type="text"
                    placeholder="Search Messenger"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Conversation Items */}
            <div className="conv-items">
                {filteredConversations.map((conv, i) => {
                    const otherUser = conv.participants?.find(p => p.id !== currentUser?.id);
                    const lastMessage = conv.lastMessage;

                    return (
                        <div
                            key={conv.id || i}
                            className={`conv-item ${conv.unread ? 'unread' : ''}`}
                            onClick={() => onSelectConversation?.(conv)}
                        >
                            <SPAvatar
                                src={otherUser?.avatar}
                                size={56}
                                online={otherUser?.online}
                            />
                            <div className="conv-info">
                                <span className="conv-name">{otherUser?.name}</span>
                                <span className="conv-preview">
                                    {lastMessage?.isOwn && 'You: '}
                                    {lastMessage?.text?.slice(0, 30)}
                                    {lastMessage?.text?.length > 30 && '...'}
                                    <span className="conv-time"> · {lastMessage?.time}</span>
                                </span>
                            </div>
                            {conv.unread && <div className="unread-dot" />}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="conv-footer">
                <Link href="/hub/messenger" className="see-all-link">See All In Messenger</Link>
            </div>

            <style>{`
                .conversation-list {
                    width: 360px;
                    max-height: 500px;
                    background: ${SP_COLORS.bgWhite};
                    border-radius: 8px;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
                    display: flex;
                    flex-direction: column;
                }

                .conv-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                }

                .conv-title {
                    font-size: 24px;
                    font-weight: 700;
                    color: ${SP_COLORS.textPrimary};
                    margin: 0;
                }

                .conv-header-actions {
                    display: flex;
                    gap: 8px;
                }

                .header-btn {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: ${SP_COLORS.bgMain};
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                }

                .header-btn:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .conv-search {
                    display: flex;
                    align-items: center;
                    margin: 0 16px 8px;
                    padding: 8px 12px;
                    background: ${SP_COLORS.bgMain};
                    border-radius: 20px;
                }

                .conv-search input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    font-size: 15px;
                    margin-left: 8px;
                }

                .conv-search input:focus {
                    outline: none;
                }

                .search-icon {
                    color: ${SP_COLORS.textSecondary};
                }

                .conv-items {
                    flex: 1;
                    overflow-y: auto;
                }

                .conv-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 8px 16px;
                    cursor: pointer;
                }

                .conv-item:hover {
                    background: ${SP_COLORS.bgHover};
                }

                .conv-info {
                    flex: 1;
                    min-width: 0;
                }

                .conv-name {
                    display: block;
                    font-weight: 500;
                    font-size: 15px;
                    color: ${SP_COLORS.textPrimary};
                }

                .conv-item.unread .conv-name {
                    font-weight: 600;
                }

                .conv-preview {
                    font-size: 13px;
                    color: ${SP_COLORS.textSecondary};
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .conv-item.unread .conv-preview {
                    color: ${SP_COLORS.textPrimary};
                    font-weight: 500;
                }

                .conv-time {
                    color: ${SP_COLORS.textSecondary};
                }

                .unread-dot {
                    width: 12px;
                    height: 12px;
                    background: ${SP_COLORS.blue};
                    border-radius: 50%;
                }

                .conv-footer {
                    padding: 12px;
                    text-align: center;
                    border-top: 1px solid ${SP_COLORS.divider};
                }

                .see-all-link {
                    color: ${SP_COLORS.blue};
                    font-size: 15px;
                    font-weight: 500;
                    text-decoration: none;
                }

                .see-all-link:hover {
                    text-decoration: underline;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 💬 CHAT DOCK (Bottom right floating chats)
// ═══════════════════════════════════════════════════════════════════════════

export const ChatDock = ({
    openChats = [],
    currentUser,
    onClose,
    onMinimize,
    onSend
}) => {
    return (
        <div className="chat-dock">
            {openChats.map((chat, i) => (
                <ChatWindow
                    key={chat.conversation.id || i}
                    conversation={chat.conversation}
                    messages={chat.messages}
                    currentUser={currentUser}
                    minimized={chat.minimized}
                    onClose={() => onClose?.(chat.conversation.id)}
                    onMinimize={() => onMinimize?.(chat.conversation.id)}
                    onSend={(text) => onSend?.(chat.conversation.id, text)}
                />
            ))}

            <style>{`
                .chat-dock {
                    position: fixed;
                    bottom: 0;
                    right: 80px;
                    display: flex;
                    gap: 8px;
                    align-items: flex-end;
                    z-index: 1000;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    ChatWindow,
    ConversationList,
    ChatDock
};
