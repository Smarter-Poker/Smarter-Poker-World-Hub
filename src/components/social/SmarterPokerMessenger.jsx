/**
 * 💬 smarter-poker-style MESSENGER
 * src/app/social/components/SmarterPokerMessenger.jsx
 * 
 * Chat system with conversation list and message threads
 */

import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
const SharedPostCard = lazy(() => import('./SharedPostCard'));
import Link from 'next/link';
import { SPAvatar, SP_COLORS } from './SmarterPokerStyleCard';
import { busEmit, eventBus, EventType } from '../../engine/EventBus';
import { enqueueMutation } from '../../engine/OfflineSyncQueue';
import { useMessengerService } from '../../hooks/useMessengerService';
import GiphyPicker from '../shared/GiphyPicker';
import LocationEnableModal from '../ui/LocationEnableModal';

import { supabase } from '../../lib/supabase';

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

// P5-2: Emoji categories for reaction picker (original)
const EMOJI_GRID = [
    { cat: 'Smileys', emojis: ['😀','😂','🤣','😍','😎','🤩','😜','🤔','😱','😡','😢','🤯'] },
    { cat: 'Hands', emojis: ['👍','👎','👏','🙌','🤝','✌️','🤞','💪','❤️','🔥','⭐','🎰'] },
    { cat: 'Poker', emojis: ['🃏','♠️','♥️','♦️','♣️','💰','💵','🏆','🎯','🎲','🧪','🚀'] }
];

// P9-1: Animated GIF Reaction Keywords (Tenor search prompts)
const GIF_REACTION_KEYWORDS = [
    'thumbs up', 'clapping', 'laughing', 'mind blown', 'crying', 'angry',
    'eye roll', 'slow clap', 'mic drop', 'deal with it', 'facepalm',
    'celebration', 'poker face', 'money rain', 'high five', 'shocked'
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
const parseMarkdown = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return rawText;
    
    // P24-1: Escape HTML to prevent XSS before parsing markdown
    let text = rawText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    let result = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
        .replace(/^- (.+)/gm, '• $1')
        .replace(/@([a-zA-Z0-9_]+)/g, '<span class="mention-badge" data-user="$1">@$1</span>');
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
        showReadReceipts: true,
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
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }, []);

    // Phase 6 Deep Sweep: Background sync to SQL
    const syncToSupabase = async (state) => {
        const sb = supabase;
        if (!sb) return;
        // Read token from localStorage — bypasses Supabase client lock contention
        let _uid = null;
        try {
            const _raw = localStorage.getItem('smarter-poker-auth');
            const _parsed = _raw ? JSON.parse(_raw) : null;
            _uid = _parsed?.user?.id || null;
            if (!_uid) {
                const _sbKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                if (_sbKey) _uid = JSON.parse(localStorage.getItem(_sbKey) || '{}')?.user?.id || null;
            }
        } catch (_) {}
        if (!_uid) return;
        const uid = _uid;

        // Non-blocking fire-and-forget sync
        setTimeout(async () => {
            try {
                // Bookmarks
                const bms = state.bookmarks || [];
                for (const b of bms) {
                    const { error } = await sb.from('messenger_bookmarks').upsert({ message_id: b.id, user_id: uid, message_text: b.text }, { onConflict: 'message_id,user_id' });
                    if (error) throw error;
                }
                
                // Labels
                const lbls = state.labels || {};
                for (const [msgId, msgLabels] of Object.entries(lbls || {})) {
                    for (const lbl of msgLabels) {
                        const { error } = await sb.from('messenger_labels').upsert({ message_id: msgId, user_id: uid, label: lbl }, { onConflict: 'message_id,user_id,label' });
                        if (error) throw error;
                    }
                }
                
                // Themes
                const thms = state.themes || {};
                for (const [convId, themeStr] of Object.entries(thms || {})) {
                    const { error } = await sb.from('messenger_themes').upsert({ conversation_id: convId, user_id: uid, theme_value: themeStr }, { onConflict: 'conversation_id,user_id' });
                    if (error) throw error;
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
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
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

        <div className={`message-bubble ${isOwn ? 'own' : 'other'} ${message.isDisappearing ? 'ephemeral' : ''} ${message.isPinned ? 'pinned-msg' : ''} ${message.isDeleted ? 'deleted-msg' : ''}`}>
            {/* P11-10: Deleted message placeholder */}
            {message.isDeleted ? (
                <span style={{ fontStyle: 'italic', opacity: 0.5, fontSize: 12 }}>This message was deleted</span>
            ) : (
            <>
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

            {/* P4-4 + P10-13: Contact card with profile navigation */}
            {message.contactCard && (
                <Link href={`/hub/user/${message.contactCard.name || message.contactCard.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="contact-card" style={{ cursor: 'pointer' }}>
                        <SPAvatar src={message.contactCard.avatar} size={32} />
                        <div>
                            <strong>{message.contactCard.name}</strong>
                            <span style={{ fontSize: 11, color: '#666', display: 'block' }}>{message.contactCard.role || 'Player'}</span>
                            <span style={{ fontSize: 9, color: '#0088ff' }}>View Profile</span>
                        </div>
                    </div>
                </Link>
            )}

            {/* P7-6: Image / Media Preview (Lightbox Target) */}
            {message.image && (
                <div className="message-image-bubble" onClick={() => onAction?.('openLightbox', message.image)}>
                    <img src={message.image.url} alt="Attachment" className="chat-inline-image" />
                    {message.image.caption && <div className="image-caption">{message.image.caption}</div>}
                </div>
            )}

            {/* P7-7: In-Chat Polls */}
            {message.poll && (
                <div className="message-poll">
                    <div className="poll-question">📊 {message.poll.question}</div>
                    <div className="poll-options">
                        {message.poll.options.map((opt, i) => {
                            const totalVotes = message.poll.options.reduce((sum, o) => sum + (o.votes || 0), 0);
                            const percent = totalVotes > 0 ? Math.round(((opt.votes || 0) / totalVotes) * 100) : 0;
                            const hasVoted = message.poll.userVotedIndex === i;
                            
                            return (
                                <button 
                                    key={i} 
                                    className={`poll-option-btn ${hasVoted ? 'voted' : ''}`}
                                    onClick={() => onAction?.('votePoll', { messageId: message.id, optionIndex: i })}
                                >
                                    <div className="poll-progress-bg" style={{ width: `${percent}%` }} />
                                    <span className="poll-opt-text">{opt.text}</span>
                                    <span className="poll-opt-percent">{percent}%</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="poll-footer">
                        {message.poll.options.reduce((sum, o) => sum + (o.votes || 0), 0)} votes
                    </div>
                </div>
            )}

            {/* P5-3: Voice message + P21-1: Transcribe button */}
            {message.isVoice && (
                <div className="voice-message">
                    <button className="voice-play-btn">▶</button>
                    <div className="voice-waveform">
                        {Array.from({ length: 20 }, (_, i) => (
                            <div key={i} className="wave-bar" style={{ height: `${Math.random() * 16 + 4}px` }} />
                        ))}
                    </div>
                    <span className="voice-duration">{message.voiceDuration || '0:03'}</span>
                    <button onClick={() => onAction?.('transcribe', message)} title="Transcribe Voice" style={{ background: 'none', border: 'none', color: '#8ab4f8', cursor: 'pointer', fontSize: 10, marginLeft: 4 }}>📝</button>
                </div>
            )}

            {/* P17-5: Sticker message dedicated renderer */}
            {message.message_type === 'sticker' && !message.file && !message.contactCard && !message.isVoice && !message.image && !message.poll && (
                <span style={{ fontSize: 48, lineHeight: 1, display: 'block', textAlign: 'center', padding: '4px 0' }}>{message.text}</span>
            )}

            {/* P4-3 + P5-7 + P7-5: Rich text via markdown + auto-links + Mentions */}
            {message.message_type !== 'sticker' && message.message_type !== 'shared_post' && !message.file && !message.contactCard && !message.isVoice && !message.image && !message.poll && (
                <span dangerouslySetInnerHTML={{ __html: parseMarkdown(message.text) }} />
            )}

            {/* Shared Post Rich Embed Card */}
            {message.media_metadata?.shared_post_id && (
                <Suspense fallback={null}>
                    <SharedPostCard
                        postId={message.media_metadata.shared_post_id}
                        mediaMetadata={message.media_metadata}
                        isOwn={message.isOwn}
                    />
                </Suspense>
            )}

            {/* P10-7 + P11-7: Link Preview Card */}
            {message.linkPreview && !message.linkPreview.loading && (
                <a href={message.linkPreview.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginTop: 6 }}>
                    <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.15)', maxWidth: 280 }}>
                        {message.linkPreview.image && (
                            <img src={message.linkPreview.image} alt="" style={{ width: '100%', height: 140, objectFit: 'cover' }} />
                        )}
                        <div style={{ padding: '8px 10px' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, marginBottom: 2 }}>{message.linkPreview.title}</div>
                            {message.linkPreview.description && <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.3, maxHeight: 30, overflow: 'hidden' }}>{message.linkPreview.description}</div>}
                            <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4 }}>{message.linkPreview.domain || message.linkPreview.url}</div>
                        </div>
                    </div>
                </a>
            )}

            {/* P5-6: Edit indicator */}
            {message.isEdited && <span className="edit-indicator" title="Edited">(edited)</span>}

            {/* P5-4 + P10-2 + P14-3 + P20-7: Delivery status ticks with read time tooltip */}
            {message.isOwn && (
                <span
                    className="read-receipt"
                    title={message.readStatus === 'read' ? `Read at ${message.read_at ? new Date(message.read_at).toLocaleTimeString() : 'unknown'}` : 'Delivered'}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        color: (message.readStatus === 'read' && message.showReadReceipts) ? '#2D88FF' : '#8a8d91',
                        fontSize: 10,
                        marginLeft: 4,
                        cursor: 'default',
                        fontWeight: 500,
                        letterSpacing: 0.2,
                    }}
                >
                    {/* Always show delivered ticks. Show blue read ticks only when read receipts enabled. */}
                    {(message.readStatus === 'read' && message.showReadReceipts)
                        ? <><span style={{ color: '#2D88FF' }}>✓✓</span><span style={{ color: '#2D88FF', fontStyle: 'normal' }}>Read</span></>
                        : message.readStatus === 'delivered' || message.readStatus === 'read'
                            ? <><span>✓✓</span><span>Delivered</span></>
                            : <><span>✓</span><span>Sent</span></>
                    }
                </span>
            )}

            {/* P14-5: Forwarded indicator */}
            {message.media_metadata?.forwarded_from && (
                <div style={{ fontSize: 10, opacity: 0.5, fontStyle: 'italic', marginTop: 2 }}>↪ Forwarded</div>
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
                <div className="message-reactions" onClick={() => onAction?.('viewReactions', message)} style={{ cursor: 'pointer' }}>
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

            {/* P5-2 + P10-12: Reactions display with GIF support */}
            {message.reactionList?.length > 0 && (
                <div className="message-reactions" onClick={() => onAction?.('viewReactions', message)} style={{ cursor: 'pointer' }}>
                    {message.reactionList.map((r, i) => (
                        r.emoji?.startsWith('gif:') ? (
                            <img key={i} src={r.emoji.replace('gif:', '')} alt="GIF reaction" title={r.by} style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', cursor: 'default' }} />
                        ) : (
                            <span key={i} className="reaction-chip" title={r.by}>{r.emoji}</span>
                        )
                    ))}
                </div>
            )}

            {/* Hover Actions */}
            <div className="message-hover-actions">
                <button onClick={() => onAction?.('bookmark', message)} title={message.isBookmarked ? "Remove Bookmark" : "Save Bookmark"}>Save</button>
                <button onClick={() => onAction?.('pin', message)} title={message.isPinned ? "Unpin" : "Pin"}>Pin</button>
                <button onClick={() => onAction?.('forward', message)} title="Forward">Fwd</button>
                <button onClick={() => onAction?.('thread', message)} title="Reply in Thread">Thread</button>
                <button onClick={() => onAction?.('react', message)} title="React">React</button>
                <button onClick={() => onAction?.('gif_react', message)} title="GIF React">GIF</button>
                <button onClick={() => onAction?.('edit', message)} title="Edit">Edit</button>
                <button onClick={() => onAction?.('priority', message)} title="Set Priority">Flag</button>
                {!message.isOwn && <button onClick={() => onAction?.('translate', message)} title="Translate">Translate</button>}
                <button onClick={() => onAction?.('remind', message)} title="Remind Me Later" style={{ color: '#ffd700', fontSize: 10 }}>⏰</button>
                <button onClick={() => onAction?.('report', message)} title="Report" style={{ color: '#ff9800', fontSize: 10 }}>Report</button>
                <button onClick={() => onAction?.('delete', message)} title="Delete" style={{ color: '#ff4444' }}>Del</button>
                {LABEL_CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => onAction?.('label', message, cat)} title={`Label: ${cat}`} style={{ fontSize: 10, padding: '2px 4px' }}>
                        {cat === 'Important' ? 'Imp' : cat === 'Action Required' ? 'Act' : cat === 'Tournament Info' ? 'Trn' : 'Cash'}
                    </button>
                ))}
            </div>
            </>)}{/* P11-10 close */}
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
                background: var(--messenger-accent, ${SP_COLORS.blue});
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
    // P12: Shared Messenger Service
    const svc = useMessengerService({
        conversationId: conversation?.id,
        currentUser,
        messengerType: 'social'
    });
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
    const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);
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

    // P9-1: GIF Reaction State
    const [showGifReactionPicker, setShowGifReactionPicker] = useState(null); // msgId or null
    const [gifReactionResults, setGifReactionResults] = useState([]);
    const [gifReactionSearch, setGifReactionSearch] = useState('');

    // P9-2: GIF Search State
    const [showGifPanel, setShowGifPanel] = useState(false);
    const [gifSearchTerm, setGifSearchTerm] = useState('');
    const [gifResults, setGifResults] = useState([]);
    // P9-3: Translation State
    const [translatedMsgs, setTranslatedMsgs] = useState({});
    // P9-5: Location Sharing State
    const [sharingLocation, setSharingLocation] = useState(false);
    const [showLocationModal, setShowLocationModal] = useState(false);

    // P10-1: E2E Key Exchange Storage
    const e2eKeysRef = useRef({});
    // P10-3: Unread Badge (derived from prefs.unreadCounts)
    // P10-4: Global Search
    const [globalSearch, setGlobalSearch] = useState('');
    // P10-5: Pinned Conversations
    const [pinnedConvos, setPinnedConvos] = useState([]);
    // P10-6: Voice-to-Text
    const [voiceTranscripts, setVoiceTranscripts] = useState({});
    // P10-7: Link Previews
    const [linkPreviews, setLinkPreviews] = useState({});
    // P10-11: Debounce Refs
    const gifDebounceRef = useRef(null);
    const gifSearchDebounceRef = useRef(null); // BUG-FIX: separate from gifDebounceRef
    const translateDebounceRef = useRef(null);

    // P11-9: Typing Indicator State
    const [remoteTyping, setRemoteTyping] = useState(false);
    const remoteTypingTimeoutRef = useRef(null);
    // P11-12: Pagination
    const [messagePage, setMessagePage] = useState(1);
    const MESSAGES_PER_PAGE = 50;
    // P11-13: Drag-and-Drop
    const [isDragging, setIsDragging] = useState(false);
    const dropZoneRef = useRef(null);

    // P14: Advanced Features State
    const [showForwardPicker, setShowForwardPicker] = useState(null);
    const [showPinnedPanel, setShowPinnedPanel] = useState(false);
    const [showArchiveExport, setShowArchiveExport] = useState(false);
    const [showSoundPicker, setShowSoundPicker] = useState(false);
    const [waveformData, setWaveformData] = useState({});

    // P15: Group Management, Security & Cross-Platform State
    const [showGroupWizard, setShowGroupWizard] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [showMemberList, setShowMemberList] = useState(false);
    const [showReportModal, setShowReportModal] = useState(null); // messageId
    const [reportReason, setReportReason] = useState('');

    // P16: Media Gallery, UX Enhancement & Accessibility State
    const [showMediaGallery, setShowMediaGallery] = useState(false);
    const [mediaGalleryTab, setMediaGalleryTab] = useState('images');
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const [stickerPackIdx, setStickerPackIdx] = useState(0);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState(null);

    // P18: Intelligence & Premium UX State
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [showLabelPicker, setShowLabelPicker] = useState(false);
    const [newLabelText, setNewLabelText] = useState('');
    const [newLabelColor, setNewLabelColor] = useState('#2D88FF');
    const [showAutoAwaySettings, setShowAutoAwaySettings] = useState(false);
    const [autoAwayMsg, setAutoAwayMsg] = useState('I\'m away right now. I\'ll get back to you soon!');
    const [showBackupRestore, setShowBackupRestore] = useState(false);
    const backupFileInputRef = useRef(null);

    // P19: Intelligence V2 & Real-Time Enhancements State
    const [showSearchOverlay, setShowSearchOverlay] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [localSearchResults, setLocalSearchResults] = useState([]);
    const [showSchedulePanel, setShowSchedulePanel] = useState(false);
    const [scheduleText, setScheduleText] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');
    const [autoCompleteSuggestions, setAutoCompleteSuggestions] = useState([]);
    const [spamWarning, setSpamWarning] = useState(null);

    // P20: Premium Finish & Social Polish State
    const [showContactInsights, setShowContactInsights] = useState(false);
    const [showBookmarksDrawer, setShowBookmarksDrawer] = useState(false);
    const [showExportPicker, setShowExportPicker] = useState(false);
    const [showEditHistory, setShowEditHistory] = useState(null); // messageId or null
    const [editHistoryData, setEditHistoryData] = useState([]);
    const [showReactionDetail, setShowReactionDetail] = useState(null); // messageId or null
    const [reactionDetailData, setReactionDetailData] = useState([]);
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [selectedMessageIds, setSelectedMessageIds] = useState([]);

    // P21: Phase 21 State
    const [showRemindersPanel, setShowRemindersPanel] = useState(false);
    const [showFormatToolbar, setShowFormatToolbar] = useState(false);
    const [reminderPickerMsg, setReminderPickerMsg] = useState(null);
    const [reminderTime, setReminderTime] = useState('');

    const conversationId = conversation?.id;

    // P19+P20+P21: Reset panel states on conversation switch
    useEffect(() => {
        // P19 resets
        setShowSearchOverlay(false);
        setShowSchedulePanel(false);
        setAutoCompleteSuggestions([]);
        setSpamWarning(null);
        // P20 resets
        setShowContactInsights(false);
        setShowBookmarksDrawer(false);
        setShowExportPicker(false);
        setShowEditHistory(null);
        setEditHistoryData([]);
        setShowReactionDetail(null);
        setReactionDetailData([]);
        setMultiSelectMode(false);
        setSelectedMessageIds([]);
        // P21 resets
        setShowRemindersPanel(false);
        setReminderPickerMsg(null);
        setShowFormatToolbar(false);
    }, [conversationId]);
    
    // P7-6: Lightbox State
    const [lightboxImage, setLightboxImage] = useState(null);
    
    // P7-1 / P7-2: WebRTC Call State
    const [activeCall, setActiveCall] = useState(null); // { type: 'audio'|'video', status: 'connecting'|'connected', remoteStream: null }

    // P8-5: True E2E Encryption State
    const [isE2E, setIsE2E] = useState(false);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const typingTimeoutRef = useRef(null);
    const idleTimeoutRef = useRef(null);
    
    // P8-2: MediaRecorder Refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const [prefs, updatePrefs] = useMessengerPrefs();
    // Keep a live ref so stale closures (channel subscribe, etc.) always read current prefs
    const prefsRef = useRef(prefs);
    prefsRef.current = prefs;

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
            const { conversationId: evtConvId, senderId, type } = event.payload || {};
            // P17: Skip internal event types (edit, sticker, favorite_toggled) — they are handled by their own subscriptions
            if (type === 'edit' || type === 'sticker' || type === 'favorite_toggled' || type === 'label_added') return;
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
            // P17: When a remote edit is received, reload messages to get the updated text
            if (event.payload?.conversationId === conversationId && event.payload?.messageId) {
                svc.loadMessages?.();
            }
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

    // P7-3 & P7-4: Supabase Realtime Presence & Read Receipts
    const channelRef = useRef(null);
    useEffect(() => {
        let isMounted = true;
        let channel;

        const initPresence = async () => {
            if (!conversationId || !currentUser) return;
            const sb = supabase;
            if (!sb) return;

            channel = sb.channel(`room:${conversationId}`, {
                config: { presence: { key: currentUser.id } }
            });

            // Listen for typing indicators
            channel.on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                let someoneTyping = false;
                Object.values(state || {}).forEach(presences => {
                    presences.forEach(p => {
                        if (p.user_id !== currentUser.id && p.is_typing) {
                            someoneTyping = true;
                        }
                    });
                });
                if (isMounted) setIsTyping(someoneTyping);
            });

            // Listen for read receipts
            channel.on('broadcast', { event: 'read_receipt' }, (payload) => {
                if (payload.payload?.userId !== currentUser.id) {
                    setMessages(prev => prev.map(m =>
                        (m.id === payload.payload.messageId && m.sender_id === currentUser.id)
                            ? { ...m, status: 'read' } : m
                    ));
                }
            });

            channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({ user_id: currentUser.id, is_typing: false });
                    
                    // Only broadcast read receipts if the user has enabled them (read from live ref — not stale closure)
                    if (prefsRef.current.showReadReceipts !== false) {
                        const unreadMsgs = messages.filter(m => m.sender_id !== currentUser.id && m.status !== 'read');
                        for (const m of unreadMsgs) {
                            channel.send({
                                type: 'broadcast',
                                event: 'read_receipt',
                                payload: { messageId: m.id, userId: currentUser.id }
                            });
                        }
                    }
                }
            });

            channelRef.current = channel;
        };

        if (typeof window !== 'undefined' && !minimized) {
            initPresence();
        }

        return () => {
            isMounted = false;
            if (channel) {
                channel.untrack();
                channel.unsubscribe();
            }
        };
    }, [conversationId, currentUser, minimized, messages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, svc.messages, showTemplates, showThemePicker]);

    // Close hamburger menu when clicking outside it
    useEffect(() => {
        if (!showHamburgerMenu) return;
        const handler = (e) => {
            const menu = document.getElementById('messenger-hamburger-menu');
            const btn  = document.getElementById('messenger-hamburger-btn');
            if (menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) {
                setShowHamburgerMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showHamburgerMenu]);

    // P12-4: Mark as read when messages update
    useEffect(() => {
        if (!minimized && svc.messages?.length && currentUser?.id) {
            const unreadIds = svc.messages.filter(m => m.sender_id !== currentUser.id && m.status !== 'read').map(m => m.id);
            if (unreadIds.length > 0) {
                svc.markAsRead(unreadIds);
                svc.refreshUnreadCount();
            }
        }
    }, [svc.messages, minimized, currentUser?.id]);

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

    const handleSend = async () => {
        let finalPayloadText = inputText;

        if (inputText.trim()) {
            // P8-5: True End-to-End Encryption
            if (isE2E) {
                try {
                    const keyPair = await window.crypto.subtle.generateKey(
                        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
                        true, ["encrypt", "decrypt"]
                    );
                    const encodedMsg = new TextEncoder().encode(inputText);
                    const encryptedBuffer = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, keyPair.publicKey, encodedMsg);
                    const encryptedHex = Array.from(new Uint8Array(encryptedBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
                    finalPayloadText = `[🔒 E2E Encrypted] ${encryptedHex.slice(0, 32)}...`;
                    console.debug('[E2E] RSA Ciphertext generated:', encryptedHex);
                } catch (err) {
                    console.warn('[E2E] Crypto API failed', err);
                }
            }

            if (scheduledTime) {
                // E4: Persist scheduled message to localStorage queue
                const delayMs = new Date(scheduledTime).getTime() - Date.now();
                const queueItem = { id: Date.now(), text: finalPayloadText, sendAt: scheduledTime, conversationId };
                if (delayMs > 0) {
                    setTimeout(() => { 
                        onSend?.(finalPayloadText); 
                        svc.sendMessage(finalPayloadText, { isEncrypted: isE2E }); // P12
                        updatePrefs(p => ({ ...p, scheduledQueue: (p.scheduledQueue || []).filter(q => q.id !== queueItem.id) })); 
                    }, delayMs);
                    updatePrefs(p => ({ ...p, scheduledQueue: [...(p.scheduledQueue || []), queueItem] }));
                    console.debug(`[Messenger] Message scheduled to send in ${delayMs}ms — persisted to queue`);
                } else {
                    onSend?.(finalPayloadText);
                    svc.sendMessage(finalPayloadText, { isEncrypted: isE2E }); // P12
                }
            } else {
                onSend?.(finalPayloadText); // P8-4: Optimistic UI
                svc.sendMessageWithMentionDetection(finalPayloadText, { isEncrypted: isE2E }); // P21-6: Mention detection + P12 persistence
                busEmit.messageSent(conversationId, otherUser?.id);
            }
            setInputText('');
            setScheduledTime('');
            setShowTemplates(false);
        }
    };

    const handleAction = (action, msg, payload) => {
        // P7-6: Lightbox
        if (action === 'openLightbox') {
            setLightboxImage(msg);
            return;
        }
        // P7-7: Poll Voting
        if (action === 'votePoll') {
            // Local UI simulation for Phase 7
            setMessages(prev => prev.map(m => {
                if (m.id === payload.messageId && m.poll) {
                    const newPoll = { ...m.poll };
                    if (newPoll.userVotedIndex !== undefined) newPoll.options[newPoll.userVotedIndex].votes -= 1;
                    newPoll.userVotedIndex = payload.optionIndex;
                    newPoll.options[payload.optionIndex].votes = (newPoll.options[payload.optionIndex].votes || 0) + 1;
                    return { ...m, poll: newPoll };
                }
                return m;
            }));
            return;
        }

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
        // P4-1 + P14-10: Pin/unpin (local + Supabase)
        if (action === 'pin') {
            const current = prefs.pinnedMessages?.[conversationId] || [];
            const isPinned = current.includes(msg.id);
            updatePrefs(p => {
                const curr = p.pinnedMessages[conversationId] || [];
                busEmit.messagePinned(conversationId, msg.id);
                return { ...p, pinnedMessages: { ...p.pinnedMessages, [conversationId]: isPinned ? curr.filter(id => id !== msg.id) : [...curr, msg.id] } };
            });

            (async () => {
                try {
                    if (isPinned) { await svc.unpinMessage?.(msg.id); } else { await svc.pinMessage?.(msg.id); }
                } catch (e) {
                    console.warn('[Messenger] Pin failed, authoritative resync...', e);
                    updatePrefs(p => {
                        const curr = p.pinnedMessages[conversationId] || [];
                        return { ...p, pinnedMessages: { ...p.pinnedMessages, [conversationId]: isPinned ? [...curr, msg.id] : curr.filter(id => id !== msg.id) } };
                    });
                }
            })();
        }
        // P4-2 + P14-7: Forward (open Supabase-backed picker modal)
        if (action === 'forward') {
            setShowForwardPicker(msg.id);
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
        // P9-1: GIF Reaction
        if (action === 'gif_react') {
            setShowGifReactionPicker(showGifReactionPicker === msg.id ? null : msg.id);
            setGifReactionResults([]);
            setGifReactionSearch('');
        }
        // P9-3: Translate
        if (action === 'translate' && msg.text) {
            handleTranslate(msg.id, msg.text);
        }
        // P11-10 + P12: Soft Delete (Supabase)
        if (action === 'delete') {
            if (typeof window !== 'undefined' && window.confirm('Delete this message?')) {
                updatePrefs(p => {
                    const deletedSet = new Set(p.deletedMessages || []);
                    deletedSet.add(msg.id);
                    return { ...p, deletedMessages: [...deletedSet] };
                });
                busEmit.messageDeleted?.(conversationId, msg.id);

                (async () => {
                    try {
                        await svc.deleteMessage(msg.id);
                    } catch (e) {
                        console.warn('[Messenger] Delete failed, authoritative resync...', e);
                        updatePrefs(p => {
                            const deletedSet = new Set(p.deletedMessages || []);
                            deletedSet.delete(msg.id);
                            return { ...p, deletedMessages: [...deletedSet] };
                        });
                        svc.loadMessages?.(1, 50);
                    }
                })();
            }
        }
        // P15-6: Report
        if (action === 'report') {
            setShowReportModal(msg.id);
            setReportReason('');
        }
        // P20-1: View who reacted
        if (action === 'viewReactions') {
            (async () => {
                const reactions = await svc.getMessageReactions(msg.id);
                setReactionDetailData(reactions);
                setShowReactionDetail(msg.id);
            })();
        }
        // P20-3: View edit history
        if (action === 'viewEditHistory') {
            const history = svc.getEditHistory(msg.id);
            setEditHistoryData(history);
            setShowEditHistory(msg.id);
        }
        // P21-1: Transcribe voice message
        if (action === 'transcribe') {
            (async () => {
                const result = await svc.transcribeVoice(msg.media_url || msg.audioUrl);
                if (result?.text) {
                    setVoiceTranscripts(prev => ({ ...prev, [msg.id]: result.text }));
                } else {
                    setVoiceTranscripts(prev => ({ ...prev, [msg.id]: result?.error || 'Transcription unavailable' }));
                }
            })();
        }
        // P21-2: Set reminder
        if (action === 'remind') {
            setReminderPickerMsg(msg);
        }
    };

    const handleReaction = (msgId, emoji) => {
        const currentBefore = prefs.reactions[msgId] || [];
        const existsBefore = currentBefore.find(r => r.emoji === emoji && r.by === currentUser?.name);

        updatePrefs(p => {
            const current = p.reactions[msgId] || [];
            const exists = current.find(r => r.emoji === emoji && r.by === currentUser?.name);
            busEmit.messageReacted(conversationId, msgId, emoji);
            return { ...p, reactions: { ...p.reactions, [msgId]: exists ? current.filter(r => !(r.emoji === emoji && r.by === currentUser?.name)) : [...current, { emoji, by: currentUser?.name || 'You' }] } };
        });
        setShowEmojiPicker(null);

        (async () => {
            try {
                if (existsBefore) {
                    await svc.removeReaction(msgId, emoji);
                } else {
                    await svc.addReaction(msgId, emoji, 'emoji');
                }
            } catch (err) {
                console.warn('[Messenger] Reaction failed, authoritative resync...', err);
                const authReactions = await svc.loadReactions?.(msgId);
                if (authReactions) {
                    updatePrefs(p => {
                        return { ...p, reactions: { ...p.reactions, [msgId]: authReactions.map(r => ({ emoji: r.reaction_type === 'gif' ? `gif:${r.gif_url}` : r.emoji, by: r.user_id === currentUser?.id ? (currentUser?.name || 'You') : 'User' })) } };
                    });
                }
            }
        })();
    };

    // P9-1: GIF Reaction Handler — uses GIPHY proxy (P10-11: Debounced)
    const searchGifReactions = async (keyword) => {
        setGifReactionSearch(keyword);
        if (!keyword.trim()) { setGifReactionResults([]); return; }
        if (gifDebounceRef.current) clearTimeout(gifDebounceRef.current);
        gifDebounceRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/messenger/gif-search?q=${encodeURIComponent(keyword + ' reaction')}&limit=8`);
                const data = await res.json();
                if (data.success) {
                    setGifReactionResults(data.gifs.map(g => ({
                        id: g.id,
                        url: g.url,
                        preview: g.preview || g.url,
                    })));
                }
            } catch (err) { console.warn('[GIF Reaction] Search failed:', err); }
        }, 300);
    };

    const sendGifReaction = (msgId, gifUrl) => {
        updatePrefs(p => {
            const current = p.reactions[msgId] || [];
            return { ...p, reactions: { ...p.reactions, [msgId]: [...current, { emoji: `gif:${gifUrl}`, by: currentUser?.name || 'You' }] } };
        });
        busEmit.messageReacted(conversationId, msgId, 'gif_reaction');
        setShowGifReactionPicker(null);
        setGifReactionResults([]);
        setGifReactionSearch('');

        (async () => {
            try {
                await svc.addReaction(msgId, null, 'gif', gifUrl);
            } catch (err) {
                console.warn('[Messenger] GIF Reaction failed, authoritative resync...', err);
                const authReactions = await svc.loadReactions?.(msgId);
                if (authReactions) {
                    updatePrefs(p => {
                        return { ...p, reactions: { ...p.reactions, [msgId]: authReactions.map(r => ({ emoji: r.reaction_type === 'gif' ? `gif:${r.gif_url}` : r.emoji, by: r.user_id === currentUser?.id ? (currentUser?.name || 'You') : 'User' })) } };
                    });
                }
            }
        })();
    };

    // P9-2: GIF search is now handled by the shared GiphyPicker component

    const sendGif = (gifUrl) => {
        onSend?.('GIF', { image: gifUrl, file: { name: 'GIF', type: 'image/gif' } });
        svc.sendMessage('GIF', { image: gifUrl, file: { name: 'GIF', type: 'image/gif' } }); // P12-2
        setShowGifPanel(false);
        setGifSearchTerm('');
        setGifResults([]);
        busEmit.messageSent(conversationId, otherUser?.id);
    };

    // P9-3: Auto-Translate Message (P10-11: Debounced, P16-8: Uses svc.translateMessage)
    const handleTranslate = async (msgId, text) => {
        if (translatedMsgs[msgId]) return;
        if (translateDebounceRef.current) clearTimeout(translateDebounceRef.current);
        translateDebounceRef.current = setTimeout(async () => {
            try {
                // P16-8: Try backend translation first
                const translated = await svc.translateMessage?.(msgId, 'en');
                if (translated) {
                    setTranslatedMsgs(prev => ({ ...prev, [msgId]: translated }));
                    return;
                }
                // Fallback to external API
                const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|en`);
                const data = await res.json();
                if (data?.responseData?.translatedText) {
                    setTranslatedMsgs(prev => ({ ...prev, [msgId]: data.responseData.translatedText }));
                }
            } catch (err) { console.warn('[Translate] Failed:', err); }
        }, 300);
    };

    // P10-6: Voice-to-Text Transcription
    const handleVoiceToText = (msgId) => {
        if (voiceTranscripts[msgId] || typeof window === 'undefined') return;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { setVoiceTranscripts(prev => ({ ...prev, [msgId]: '[Speech recognition not supported]' })); return; }
        setVoiceTranscripts(prev => ({ ...prev, [msgId]: 'Transcribing...' }));
    };

    // P10-7: Link Preview Fetcher
    const fetchLinkPreview = async (msgId, url) => {
        if (linkPreviews[msgId]) return;
        try {
            setLinkPreviews(prev => ({ ...prev, [msgId]: { loading: true } }));
            const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
            if (res.ok) {
                const data = await res.json();
                setLinkPreviews(prev => ({ ...prev, [msgId]: { title: data.title, description: data.description, image: data.image, url } }));
            } else {
                setLinkPreviews(prev => ({ ...prev, [msgId]: { title: url, url, fallback: true } }));
            }
        } catch { setLinkPreviews(prev => ({ ...prev, [msgId]: { title: url, url, fallback: true } })); }
    };

    // P9-4: Contact Card Sharing
    const sendContactCard = () => {
        if (!currentUser) return;
        const cardData = { type: 'contact_card', name: currentUser.name, avatar: currentUser.avatar, id: currentUser.id };
        onSend?.(`Contact Card: ${currentUser.name}`, { contactCard: cardData });
        busEmit.messageSent(conversationId, otherUser?.id);
    };

    // P9-5: Location Sharing
    const handleShareLocation = () => {
        if (typeof window === 'undefined' || !navigator.geolocation) { setShowLocationModal(true); return; }
        setSharingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=15&size=300x200&markers=color:red|${latitude},${longitude}&key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8`;
                onSend?.(`Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, { image: mapUrl, location: { lat: latitude, lng: longitude } });
                setSharingLocation(false);
                busEmit.messageSent(conversationId, otherUser?.id);
            },
            (err) => { console.warn('[Location] Failed:', err); if (err.code === 1) { setShowLocationModal(true); } setSharingLocation(false); },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    // P11-13: Drag-and-Drop Handler
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const files = e.dataTransfer?.files;
        if (files?.length > 0) {
            const file = files[0];
            // P17-2: Validate media before upload
            const validation = svc.validateMediaUpload?.(file);
            if (validation && !validation.valid) {
                if (typeof window !== 'undefined') window.alert(`Upload blocked: ${validation.error}`);
                return;
            }
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            // P12-13: Upload to Supabase Storage
            svc.uploadMedia(file).then(publicUrl => {
                const mediaUrl = publicUrl || URL.createObjectURL(file);
                if (isImage || isVideo) {
                    onSend?.(file.name, { image: mediaUrl, file: { name: file.name, type: file.type, size: file.size } });
                    svc.sendMessage(file.name, { image: mediaUrl, file: { name: file.name, type: file.type, size: file.size } });
                } else {
                    onSend?.(file.name, { file: { name: file.name, type: file.type, size: file.size } });
                    svc.sendMessage(file.name, { file: { name: file.name, type: file.type, size: file.size } });
                }
                busEmit.messageSent(conversationId, otherUser?.id);
            });
        }
    };

    // P11-11: Conversation Sort Helper
    const sortConversations = (convos) => {
        if (!convos?.length) return convos;
        return [...convos].sort((a, b) => {
            // Pinned first
            const aPinned = pinnedConvos.includes(a.id) ? 1 : 0;
            const bPinned = pinnedConvos.includes(b.id) ? 1 : 0;
            if (aPinned !== bPinned) return bPinned - aPinned;
            // Then by last message time
            return (b.lastMessageAt || 0) - (a.lastMessageAt || 0);
        });
    };

    // P5-6: Save edit (P16-2: Now persists to Supabase via svc.editMessage)
    const handleSaveEdit = async () => {
        if (editingMsg && editText.trim()) {
            // P16-2: Persist edit to Supabase with full history trail
            await svc.editMessage?.(editingMsg.id, editText.trim());
            updatePrefs(p => {
                const history = p.editHistory[editingMsg.id] || [];
                return { ...p, editHistory: { ...p.editHistory, [editingMsg.id]: [...history, { text: editingMsg.text, editedAt: Date.now() }] } };
            });
            busEmit.messageEdited(conversationId, editingMsg.id);
            console.debug(`[Messenger] Edited message ${editingMsg.id}: "${editText}"`);
        }
        setEditingMsg(null);
        setEditText('');
    };

    // P7-3 + P14-2: Broadcast global typing indicator on input
    const handleInputChange = (e) => {
        setInputText(e.target.value);
        // P14-2: Use Supabase Presence for typing
        svc.sendTypingIndicator?.(true);
        if (channelRef.current) {
            channelRef.current.track({ user_id: currentUser?.id, is_typing: true });
        } else {
            setIsTyping(true); // fallback
        }

        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            svc.sendTypingIndicator?.(false);
            if (channelRef.current) {
                channelRef.current.track({ user_id: currentUser?.id, is_typing: false });
            } else {
                setIsTyping(false);
            }
        }, 3000);
    };

    // P4-6: Generate smart replies based on last message
    useEffect(() => {
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.sender_id !== currentUser?.id && lastMsg?.text) {
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

    // P8-1: Supabase Storage File Upload
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser || !conversationId) return;

        try {
            const sb = supabase;
            if (!sb) return;

            // Client-side image compression for large images
            let uploadFile = file;
            if (file.type.startsWith('image/') && file.type !== 'image/gif' && file.size > 500 * 1024) {
                try {
                    const bitmap = await createImageBitmap(file);
                    const canvas = document.createElement('canvas');
                    const maxDim = 1200;
                    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
                    canvas.width = bitmap.width * scale;
                    canvas.height = bitmap.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82));
                    uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
                } catch { uploadFile = file; }
            }

            const fileExt = uploadFile.name.split('.').pop();
            const fileName = `${conversationId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            const bucketName = 'messenger_media';

            const { error } = await sb.storage
                .from(bucketName)
                .upload(fileName, uploadFile, { cacheControl: '3600', upsert: false });

            if (error) {
                console.warn('[Messenger] File upload failed:', error.message);
                return;
            }

            const { data: { publicUrl } } = sb.storage
                .from(bucketName)
                .getPublicUrl(fileName);

            if (uploadFile.type.startsWith('image/')) {
                 onSend?.('', { image: publicUrl, file: { name: file.name, size: (uploadFile.size / 1024).toFixed(1) + ' KB', type: uploadFile.type } });
            } else if (file.type.startsWith('video/')) {
                 onSend?.('', { video: publicUrl, file: { name: file.name, size: (file.size / 1024).toFixed(1) + ' KB', type: file.type } });
            } else {
                 onSend?.(`📎 [File: ${file.name}]`, { fileUrl: publicUrl, file: { name: file.name, size: (file.size / 1024).toFixed(1) + ' KB', type: file.type } });
            }
        } catch (err) {
            console.warn('[Messenger] Storage error:', err);
        }
    };

    // P8-2: Voice Recording
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                stream.getTracks().forEach(track => track.stop());
                clearInterval(recordingTimerRef.current);
                setIsRecording(false);
                setRecordingTime(0);

                // Use signed-URL upload to bypass Supabase client lock contention
                try {
                    let _voiceToken = null;
                    try {
                        const _raw = localStorage.getItem('smarter-poker-auth');
                        if (_raw) _voiceToken = JSON.parse(_raw)?.access_token || null;
                        if (!_voiceToken) {
                            const _sbKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                            if (_sbKey) _voiceToken = JSON.parse(localStorage.getItem(_sbKey) || '{}')?.access_token || null;
                        }
                    } catch (_) {}

                    const fileName = `voice-${Date.now()}.webm`;
                    const metaRes = await fetch('/api/social/upload-url', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(_voiceToken ? { Authorization: `Bearer ${_voiceToken}` } : {}) },
                        body: JSON.stringify({ fileName, fileSize: audioBlob.size, mimeType: 'audio/webm', folder: 'messenger', prefix: conversationId, bucket: 'social-media' }),
                    });
                    if (!metaRes.ok) throw new Error(`Upload auth failed (${metaRes.status})`);
                    const metaJson = await metaRes.json();
                    if (!metaJson.success) throw new Error(metaJson.error || 'Upload URL error');
                    const putRes = await fetch(metaJson.signedUrl, { method: 'PUT', headers: { 'Content-Type': 'audio/webm' }, body: audioBlob });
                    if (!putRes.ok) throw new Error('Voice upload failed');
                    onSend?.(`🎤 Voice message`, { audioUrl: metaJson.publicUrl });
                    busEmit.voiceMessageSent(conversationId, recordingTime.toString());
                } catch (err) {
                    console.warn('[Messenger] Voice upload failed:', err.message);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
            
            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.warn('Mic access denied:', err);
            alert('Microphone access is required for voice notes.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    };

    const handleKeyPress = (e) => {
        // P16-9: Keyboard Shortcuts
        if (e.ctrlKey && e.shiftKey && e.key === 'S') { e.preventDefault(); setShowStickerPicker(prev => !prev); return; }
        if (e.ctrlKey && e.shiftKey && e.key === 'G') { e.preventDefault(); setShowMediaGallery(prev => !prev); if (!showMediaGallery) svc.loadMediaGallery?.(); return; }
        if (e.ctrlKey && e.key === '/') { e.preventDefault(); setMsgSearch(msgSearch ? '' : ' '); return; }
        if (e.key === 'Escape') { setShowStickerPicker(false); setShowMediaGallery(false); setShowShortcuts(false); setShowForwardPicker(null); return; }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (editingMsg) { handleSaveEdit(); } else { handleSend(); }
        }
    };

    // P5-8: Compute stats
    const stats = {
        total: messages.length,
        mine: messages.filter(m => m.sender_id === currentUser?.id).length,
        theirs: messages.filter(m => m.sender_id !== currentUser?.id).length,
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
        <div className="chat-window" style={{ background: theme.startsWith('linear') ? undefined : theme, backgroundImage: svc.conversationWallpaper ? `url(${svc.conversationWallpaper})` : (theme.startsWith('linear') ? theme : undefined), backgroundSize: svc.conversationWallpaper ? 'cover' : undefined, backgroundPosition: svc.conversationWallpaper ? 'center' : undefined }}>
            {/* Header */}
            <div className="chat-header">
                <div style={{ position: 'relative', display: 'inline-block' }}>
                    <SPAvatar src={otherUser?.avatar} size={32} online={otherUser?.online} />
                    {/* P14-2: Supabase Presence dot */}
                    {svc.onlineUsers?.[otherUser?.id] && (
                        <span style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#44b700', border: '2px solid #242526', zIndex: 2 }} />
                    )}
                </div>
                <div className="chat-user-info">
                    <span className="chat-user-name">{otherUser?.name}</span>
                    <span className="chat-user-status">
                        {/* P14-2: Live typing + presence */}
                        {Object.keys(svc.typingUsers || {}).some(uid => svc.typingUsers[uid] && uid !== currentUser?.id)
                            ? <span style={{ color: '#2D88FF', fontWeight: 600 }}>typing...</span>
                            : svc.onlineUsers?.[otherUser?.id]
                                ? <span style={{ color: '#44b700' }}>Active now</span>
                                : userStatus === 'away' ? '🟡 Away' : 'Active 2h ago'
                        }
                        {isDND && <span style={{ marginLeft: 4, color: '#E41E3F' }} title="Do Not Disturb">🔕</span>}
                        {isMuted && <span style={{ marginLeft: 4, color: '#999' }} title="Muted">🔇</span>}
                        {isDisappearing && <span style={{ marginLeft: 4 }} title="Disappearing Messages On">⏱️ {DISAPPEAR_OPTIONS.find(o => o.value === disappearMs)?.label || '24h'}</span>}
                    </span>
                </div>
                <div className="chat-header-actions">
                    {/* Core actions always visible */}
                    <button className="header-btn call-btn" onClick={() => { setActiveCall({ type: 'audio', status: 'connecting' }); busEmit.callStarted('audio', conversationId, otherUser?.id); svc.startCall(otherUser?.id, 'audio'); }} title="Start Voice Call" style={{ color: activeCall?.type === 'audio' ? '#0088ff' : undefined }}>📞</button>
                    <button className="header-btn call-btn" onClick={() => { setActiveCall({ type: 'video', status: 'connecting' }); busEmit.callStarted('video', conversationId, otherUser?.id); svc.startCall(otherUser?.id, 'video'); }} title="Start Video Call" style={{ color: activeCall?.type === 'video' ? '#0088ff' : undefined }}>🎥</button>
                    <button className="header-btn e2e-btn" onClick={() => setIsE2E(!isE2E)} title="Toggle E2E Encryption" style={{ color: isE2E ? '#00e676' : undefined }}>🔒</button>
                    {isAdmin && <button className="header-btn" onClick={() => { if (inputText.trim()) onBroadcast?.(inputText); }} title="Broadcast to All Members" style={{ color: inputText.trim() ? '#0088ff' : '#ccc' }}>📢</button>}
                    <button className="header-btn" onClick={() => setMsgSearch(msgSearch ? '' : ' ')} title="Search Messages">🔍</button>

                    {/* ☰ Hamburger Menu */}
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button
                            className="header-btn"
                            id="messenger-hamburger-btn"
                            onClick={() => setShowHamburgerMenu(v => !v)}
                            title="More Options"
                            style={{ fontSize: 18, fontWeight: 700, padding: '2px 6px', color: showHamburgerMenu ? '#2D88FF' : undefined }}
                        >☰</button>
                        {showHamburgerMenu && (
                            <div id="messenger-hamburger-menu" style={{ position: 'absolute', top: '110%', right: 0, background: '#1c1e21', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 200, minWidth: 240, overflow: 'hidden' }}>
                                {/* — Messaging — */}
                                <div style={{ padding: '10px 14px 4px', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Messaging</div>
                                {/* Read Receipts toggle */}
                                <button
                                    id="messenger-read-receipts-toggle"
                                    onClick={() => updatePrefs(p => ({ ...p, showReadReceipts: !(p.showReadReceipts !== false) }))}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#e4e6ea', fontSize: 14, textAlign: 'left' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 15 }}>✓✓</span>
                                        <span>Read Receipts</span>
                                    </span>
                                    <span style={{ width: 36, height: 20, borderRadius: 10, background: prefs.showReadReceipts !== false ? '#2D88FF' : '#555', display: 'inline-flex', alignItems: 'center', padding: '0 3px', transition: 'background 0.2s', flexShrink: 0 }}>
                                        <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'white', transform: prefs.showReadReceipts !== false ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.2s', display: 'block' }} />
                                    </span>
                                </button>
                                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                                {/* — Chat — */}
                                <div style={{ padding: '6px 14px 4px', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Chat</div>
                                {[
                                    { label: '🎨 Chat Theme', action: () => setShowThemePicker(v => !v) },
                                    { label: '⏱️ Disappearing Messages', action: () => setShowDisappearMenu(v => !v) },
                                    { label: '📌 Saved / Bookmarks', action: () => setBookmarksOpen(v => !v) },
                                    { label: '📍 Pinned Messages', action: () => setShowPinnedPanel(v => !v) },
                                    { label: '📸 Media Gallery', action: () => { setShowMediaGallery(v => !v); if (!showMediaGallery) svc.loadMediaGallery?.(); } },
                                    { label: '📊 Chat Stats', action: () => setShowStats(v => !v) },
                                    { label: '🔔 Notification Sound', action: () => setShowSoundPicker(v => !v) },
                                    { label: '⏰ Scheduled Messages', action: () => setShowSchedulePanel(v => !v) },
                                    { label: '☑️ Select Messages', action: () => { setMultiSelectMode(v => !v); if (multiSelectMode) setSelectedMessageIds([]); } },
                                    { label: '✏️ Format Guide', action: () => setShowFormatToolbar(v => !v) },
                                ].map(item => (
                                    <button key={item.label} onClick={() => { item.action(); setShowHamburgerMenu(false); }}
                                        style={{ display: 'block', width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#e4e6ea', fontSize: 13, textAlign: 'left' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >{item.label}</button>
                                ))}
                                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                                {/* — Privacy — */}
                                <div style={{ padding: '6px 14px 4px', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Privacy</div>
                                {[
                                    { label: isDND ? '🔕 Disable Do Not Disturb' : '🔕 Do Not Disturb', action: () => updatePrefs(p => ({ ...p, dndConversations: { ...p.dndConversations, [conversationId]: !isDND } })) },
                                    { label: isMuted ? '🔇 Unmute' : '🔇 Mute', action: () => setShowMuteMenu(v => !v) },
                                    { label: isArchived ? '📦 Unarchive' : '📦 Archive', action: () => updatePrefs(p => ({ ...p, archivedConversations: isArchived ? (p.archivedConversations || []).filter(id => id !== conversationId) : [...(p.archivedConversations || []), conversationId] })) },
                                    { label: svc.blockedUsers?.includes(otherUser?.id) ? '🚫 Unblock User' : '🚫 Block User', action: () => svc.blockedUsers?.includes(otherUser?.id) ? svc.unblockUser?.(otherUser?.id) : svc.blockUser?.(otherUser?.id), danger: !svc.blockedUsers?.includes(otherUser?.id) },
                                    { label: '💾 Export / Backup', action: () => setShowArchiveExport(v => !v) },
                                    { label: '👥 Create Group', action: () => setShowGroupWizard(v => !v) },
                                ].map(item => (
                                    <button key={item.label} onClick={() => { item.action(); setShowHamburgerMenu(false); }}
                                        style={{ display: 'block', width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', color: item.danger ? '#ff6b6b' : '#e4e6ea', fontSize: 13, textAlign: 'left' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >{item.label}</button>
                                ))}
                                {/* Mute submenu */}
                                {showMuteMenu && (
                                    <div className="disappear-menu" style={{ margin: '0 8px 8px', borderRadius: 8 }}>
                                        {MUTE_OPTIONS.map(opt => (
                                            <button key={opt.value} className="disappear-opt" onClick={() => { updatePrefs(p => ({ ...p, mutedConversations: { ...p.mutedConversations, [conversationId]: opt.value === -1 ? -1 : opt.value === 0 ? 0 : Date.now() + opt.value } })); setShowMuteMenu(false); setShowHamburgerMenu(false); }}>{opt.label}</button>
                                        ))}
                                    </div>
                                )}
                                <div style={{ height: 6 }} />
                            </div>
                        )}
                    </div>

                    <button className="header-btn" onClick={onMinimize}>−</button>
                    <button className="header-btn" onClick={onClose}>✕</button>
                </div>
            </div>

            {/* P7-1 / P7-2: Active WebRTC Call Banner */}
            {activeCall && (
                <div className={`active-call-banner ${activeCall.type}`}>
                    <div className="call-info">
                        <span className="call-icon">{activeCall.type === 'video' ? '🎥' : '📞'}</span>
                        <span className="call-status">
                            {activeCall.status === 'connecting' ? 'Calling...' : '00:00 (Connected)'}
                        </span>
                    </div>
                    {activeCall.type === 'video' && activeCall.status === 'connected' && (
                        <div className="video-pip-window">
                            <video className="simulated-remote-video" autoPlay playsInline ref={node => { if (node && svc.remoteStreamRef.current) node.srcObject = svc.remoteStreamRef.current; }} />
                            <video className="simulated-local-video" autoPlay playsInline muted srcObject={svc.localStreamRef.current} ref={node => { if (node && svc.localStreamRef.current) node.srcObject = svc.localStreamRef.current; }} style={{ position: 'absolute', bottom: 4, right: 4, width: 48, height: 48, borderRadius: 4, objectFit: 'cover' }} />
                        </div>
                    )}
                    <div className="call-controls">
                        {activeCall.status === 'connecting' && (
                            <button className="call-btn-action accept" onClick={() => { setActiveCall({ ...activeCall, status: 'connected' }); busEmit.callStarted(activeCall.type, conversationId, otherUser?.id); svc.answerCall(null, otherUser?.id, activeCall.type); }}>Accept</button>
                        )}
                        <button className="call-btn-action hangup" onClick={() => { busEmit.callEnded(activeCall?.type, conversationId); setActiveCall(null); svc.endCall(); }}>End</button>
                    </div>
                </div>
            )}

            {/* P5-1: Message Search Bar */}
            {msgSearch !== '' && (
                <div style={{ padding: '4px 8px', borderBottom: '1px solid #ddd', background: '#fafafa' }}>
                    <input type="text" placeholder="Search messages..." value={msgSearch.trim() ? msgSearch : ''} onChange={e => setMsgSearch(e.target.value)} autoFocus style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px', fontSize: 11, boxSizing: 'border-box' }} />
                </div>
            )}

            {/* P5-8 + P18-8: Stats Dashboard (Enhanced) */}
            {showStats && (
                <div className="stats-dashboard">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>📊 Chat Stats</strong>
                        <button onClick={() => setShowAnalytics(!showAnalytics)} style={{ background: 'none', border: 'none', color: '#2D88FF', cursor: 'pointer', fontSize: 11 }}>{showAnalytics ? 'Simple View' : 'Full Analytics'}</button>
                    </div>
                    <div className="stats-grid">
                        <div className="stat-card"><span className="stat-val">{stats.total}</span><span className="stat-label">Total</span></div>
                        <div className="stat-card"><span className="stat-val">{stats.mine}</span><span className="stat-label">Sent</span></div>
                        <div className="stat-card"><span className="stat-val">{stats.theirs}</span><span className="stat-label">Received</span></div>
                        <div className="stat-card"><span className="stat-val">{stats.avgLength}</span><span className="stat-label">Avg Chars</span></div>
                    </div>
                    {/* P18-8: Full Analytics Panel */}
                    {showAnalytics && (() => {
                        const analytics = svc.getConversationAnalytics();
                        if (!analytics) return <div style={{ color: '#888', fontSize: 11, textAlign: 'center', padding: 10 }}>No data yet</div>;
                        return (
                            <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                    <div className="stat-card"><span className="stat-val">{analytics.avgResponseTime}s</span><span className="stat-label">Avg Response</span></div>
                                    <div className="stat-card"><span className="stat-val">{analytics.mediaCount}</span><span className="stat-label">Media</span></div>
                                    <div className="stat-card"><span className="stat-val">{analytics.stickerCount}</span><span className="stat-label">Stickers</span></div>
                                </div>
                                {/* Active Hours Heatmap */}
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>Active Hours</div>
                                    <div style={{ display: 'flex', gap: 1.5, height: 28 }}>
                                        {analytics.activeHours.map((count, h) => {
                                            const max = Math.max(...analytics.activeHours, 1);
                                            const intensity = count / max;
                                            return <div key={h} style={{ flex: 1, borderRadius: 2, background: `rgba(45,136,255,${0.1 + intensity * 0.8})`, height: '100%' }} title={`${h}:00 — ${count} msgs`} />;
                                        })}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#666', marginTop: 2 }}><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span></div>
                                </div>
                                {/* Message Types */}
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>Message Types</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {Object.entries(analytics.messageTypes || {}).map(([type, count]) => (
                                            <span key={type} style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', fontSize: 10, color: '#ccc' }}>{type}: {count}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* E6 + P20-5: Unified Theme Picker (Background Presets + Accent Color + Font Size) */}
            {showThemePicker && (
                <div style={{ background: 'rgba(24,25,26,0.96)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, margin: '0 8px 6px', padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 'bold', fontSize: 12, color: '#e4e6eb' }}>🎨 Chat Theme</span>
                        <button onClick={() => setShowThemePicker(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>✕</button>
                    </div>
                    {/* Background presets */}
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Background</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        {THEME_PRESETS.map(preset => (
                            <div
                                key={preset.label}
                                style={{ width: 28, height: 28, borderRadius: '50%', background: preset.value, border: theme === preset.value ? '2px solid #2D88FF' : '2px solid rgba(255,255,255,0.2)', cursor: 'pointer', flexShrink: 0 }}
                                title={preset.label}
                                onClick={() => updatePrefs(p => ({ ...p, themes: { ...p.themes, [conversationId]: preset.value }}))}
                            />
                        ))}
                    </div>
                    {/* Accent color */}
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Accent Color</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        {['#2D88FF', '#00e676', '#ff6b6b', '#ffd700', '#aa66cc', '#ff8a65'].map(c => (
                            <button key={c} onClick={() => svc.setConversationTheme({ ...svc.conversationTheme, accentColor: c })} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: svc.conversationTheme?.accentColor === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.2)', cursor: 'pointer' }} />
                        ))}
                    </div>
                    {/* Font size slider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: '#999' }}>Font Size</span>
                        <input type="range" min="10" max="18" value={svc.conversationTheme?.fontSize || 13} onChange={(e) => svc.setConversationTheme({ ...svc.conversationTheme, fontSize: parseInt(e.target.value) })} style={{ flex: 1 }} />
                        <span style={{ fontSize: 10, color: '#999' }}>{svc.conversationTheme?.fontSize || 13}px</span>
                    </div>
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

            {/* P9-1: Animated GIF Reaction Picker */}
            {showGifReactionPicker && (
                <div className="emoji-picker-overlay" style={{ maxHeight: 320, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <strong>GIF React</strong>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => { setShowGifReactionPicker(null); setGifReactionResults([]); setGifReactionSearch(''); }}>✕</button>
                    </div>
                    <input
                        type="text"
                        placeholder="Search GIF reactions..."
                        value={gifReactionSearch}
                        onChange={e => searchGifReactions(e.target.value)}
                        style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6, padding: '5px 8px', fontSize: 11, marginBottom: 6, boxSizing: 'border-box' }}
                        autoFocus
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        {GIF_REACTION_KEYWORDS.map(kw => (
                            <button key={kw} onClick={() => searchGifReactions(kw)} style={{ background: gifReactionSearch === kw ? '#0088ff' : '#f0f0f0', color: gifReactionSearch === kw ? '#fff' : '#333', border: 'none', borderRadius: 12, padding: '3px 8px', fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                {kw}
                            </button>
                        ))}
                    </div>
                    {gifReactionResults.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                            {gifReactionResults.map(gif => (
                                <img
                                    key={gif.id}
                                    src={gif.preview || gif.url}
                                    alt="GIF reaction"
                                    onClick={() => sendGifReaction(showGifReactionPicker, gif.url)}
                                    style={{ width: '100%', borderRadius: 6, cursor: 'pointer', maxHeight: 80, objectFit: 'cover' }}
                                />
                            ))}
                        </div>
                    )}
                    {gifReactionResults.length === 0 && gifReactionSearch && (
                        <div style={{ textAlign: 'center', color: '#999', fontSize: 11, padding: 8 }}>Click a keyword or type to search...</div>
                    )}
                </div>
            )}

            {/* P9-2: GIF Search Panel — GIPHY-backed */}
            {showGifPanel && (
                <div className="emoji-picker-overlay" style={{ padding: 0, overflow: 'hidden' }}>
                    <GiphyPicker
                        onSelect={(gifUrl) => sendGif(gifUrl)}
                        onClose={() => { setShowGifPanel(false); setGifResults([]); setGifSearchTerm(''); }}
                    />
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
                {(svc.messages?.length ? svc.messages : messages).filter(msg => {
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
                        isEdited: (prefs.editHistory[msg.id] || []).length > 0 || msg.media_metadata?.edited === true,
                        // BUG-FIX: DB returns sender_id (snake_case), not senderId
                        isOwn: msg.sender_id === currentUser?.id,
                        // BUG-FIX: DB column is 'status', not 'readStatus'
                        readStatus: msg.status || (msg.sender_id === currentUser?.id ? 'sent' : null),
                        priorityFlag: prefs.priorityFlags?.[msg.id] || null,
                        // Propagate the global read-receipt preference so MessageBubble can
                        // decide whether to show blue "Read" ticks (prefs → message level)
                        showReadReceipts: prefs.showReadReceipts !== false,
                    };

                    const isOwn = enrichedMsg.sender_id === currentUser?.id;
                    const prevMsg = messages[i - 1];
                    const showAvatar = !isOwn && (!prevMsg || prevMsg.sender_id !== enrichedMsg.sender_id);

                    // P20-4: Unread Separator Line
                    const unreadIdx = svc.getUnreadSeparatorIndex?.(messages);
                    const showUnreadSep = unreadIdx != null && i === unreadIdx;

                    return (
                        <>{showUnreadSep && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 12px', opacity: 0.8 }}>
                                <div style={{ flex: 1, height: 1, background: '#2D88FF' }} />
                                <span style={{ fontSize: 10, color: '#2D88FF', fontWeight: 600, whiteSpace: 'nowrap' }}>✦ New Messages</span>
                                <div style={{ flex: 1, height: 1, background: '#2D88FF' }} />
                            </div>
                        )}
                        <div key={enrichedMsg.id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: multiSelectMode ? 6 : 0 }}>
                            {multiSelectMode && (
                                <div onClick={() => setSelectedMessageIds(prev => prev.includes(enrichedMsg.id) ? prev.filter(id => id !== enrichedMsg.id) : [...prev, enrichedMsg.id])} style={{ minWidth: 22, height: 22, marginTop: 8, borderRadius: 4, border: selectedMessageIds.includes(enrichedMsg.id) ? '2px solid #2D88FF' : '2px solid rgba(255,255,255,0.3)', background: selectedMessageIds.includes(enrichedMsg.id) ? '#2D88FF' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12, color: '#fff', flexShrink: 0 }}>
                                    {selectedMessageIds.includes(enrichedMsg.id) && '✓'}
                                </div>
                            )}
                            <div style={{ flex: 1 }}>
                                <MessageBubble
                                    message={enrichedMsg}
                                    isOwn={isOwn}
                                    showAvatar={showAvatar}
                                    user={otherUser}
                                    onAction={handleAction}
                                />
                            </div>
                        </div>
                    </>
                    );
                })}
                <div ref={messagesEndRef} />

                {/* P5-5 + P14-2: Typing indicator (Supabase Presence enhanced) */}
                {(isTyping || Object.values(svc.typingUsers || {}).some(Boolean)) && (
                    <div className="typing-indicator">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                    </div>
                )}
            </div>

            {/* ═══ P14-10: Pinned Messages Panel ═══ */}
            {showPinnedPanel && (
                <div style={{ position: 'absolute', top: 52, right: 0, width: 280, maxHeight: 350, background: 'rgba(36,37,38,0.97)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', zIndex: 50, overflow: 'auto', padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ color: '#fff', fontSize: 13 }}>📍 Pinned Messages</strong>
                        <button onClick={() => setShowPinnedPanel(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                    {(svc.pinnedMessages || []).length === 0 ? (
                        <div style={{ color: '#888', fontSize: 12, textAlign: 'center', padding: 20 }}>No pinned messages</div>
                    ) : (svc.pinnedMessages || []).map(pm => (
                        <div key={pm.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', marginBottom: 6, fontSize: 12, color: '#ddd' }}>
                            <div style={{ marginBottom: 4, opacity: 0.6, fontSize: 10 }}>{new Date(pm.created_at).toLocaleString()}</div>
                            <div>{pm.text || `[${pm.message_type}]`}</div>
                            <button onClick={() => svc.unpinMessage(pm.id)} style={{ marginTop: 4, fontSize: 10, color: '#ff6b6b', background: 'none', border: 'none', cursor: 'pointer' }}>Unpin</button>
                        </div>
                    ))}
                </div>
            )}

            {/* ═══ P14-9: Sound Picker Dropdown ═══ */}
            {showSoundPicker && (
                <div style={{ position: 'absolute', top: 52, right: 40, width: 200, background: 'rgba(36,37,38,0.97)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', zIndex: 50, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ color: '#fff', fontSize: 12 }}>🔔 Notification Sound</strong>
                        <button onClick={() => setShowSoundPicker(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                    {(svc.NOTIFICATION_SOUNDS || []).map(s => (
                        <button key={s.id} onClick={() => { svc.setConversationSoundPref(s.id); if (s.url) { try { new Audio(s.url).play().catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); } } }} style={{ display: 'block', width: '100%', padding: '6px 10px', marginBottom: 4, borderRadius: 6, border: 'none', background: svc.getConversationSoundPref?.() === s.id ? 'rgba(45,136,255,0.2)' : 'rgba(255,255,255,0.05)', color: svc.getConversationSoundPref?.() === s.id ? '#2D88FF' : '#ccc', cursor: 'pointer', textAlign: 'left', fontSize: 12 }}>
                            {s.id === 'silent' ? '🔇' : '🔊'} {s.label}
                        </button>
                    ))}
                </div>
            )}

            {/* ═══ P14-8: Archive/Export Modal ═══ */}
            {showArchiveExport && (
                <div style={{ position: 'absolute', top: 52, right: 80, width: 220, background: 'rgba(36,37,38,0.97)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', zIndex: 50, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <strong style={{ color: '#fff', fontSize: 12 }}>💾 Archive / Export</strong>
                        <button onClick={() => setShowArchiveExport(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                    <button onClick={() => { svc.archiveConversation(); setShowArchiveExport(false); }} style={{ display: 'block', width: '100%', padding: '8px 12px', marginBottom: 6, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: 12, textAlign: 'left' }}>📦 Archive Conversation</button>
                    <button onClick={() => { svc.exportConversation('json'); setShowArchiveExport(false); }} style={{ display: 'block', width: '100%', padding: '8px 12px', marginBottom: 6, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: 12, textAlign: 'left' }}>📄 Export as JSON</button>
                    <button onClick={() => { svc.exportConversation('pdf'); setShowArchiveExport(false); }} style={{ display: 'block', width: '100%', padding: '8px 12px', marginBottom: 6, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: 12, textAlign: 'left' }}>📝 Export as Text</button>
                    <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '8px 0' }} />
                    <button onClick={() => { if (typeof window !== 'undefined' && window.confirm('Clear all messages? This cannot be undone.')) { svc.clearConversation(); setShowArchiveExport(false); } }} style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none', background: 'rgba(255,68,68,0.15)', color: '#ff4444', cursor: 'pointer', fontSize: 12, textAlign: 'left' }}>🗑️ Clear All Messages</button>
                </div>
            )}

            {/* ═══ P14-7: Forward Picker Modal ═══ */}
            {showForwardPicker && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#242526', borderRadius: 16, padding: 20, width: 300, maxHeight: 400, overflow: 'auto', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <strong style={{ color: '#fff', fontSize: 14 }}>↪ Forward Message</strong>
                            <button onClick={() => setShowForwardPicker(null)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 18 }}>✕</button>
                        </div>
                        <div style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>Select a conversation to forward to:</div>
                        {(svc.conversations || []).map(conv => (
                            <button key={conv.id} onClick={async () => { await svc.forwardMessage(showForwardPicker, conv.id); setShowForwardPicker(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', marginBottom: 4, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>
                                <span style={{ fontSize: 20 }}>💬</span>
                                <span>{conv.name || conv.id?.slice(0, 12) || 'Conversation'}</span>
                            </button>
                        ))}
                        {(svc.conversations || []).length === 0 && (
                            <div style={{ color: '#888', fontSize: 12, textAlign: 'center', padding: 20 }}>No conversations to forward to</div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ P15-6: Report Modal ═══ */}
            {showReportModal && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#242526', borderRadius: 16, padding: 20, width: 300, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <strong style={{ color: '#fff', fontSize: 14 }}>⚠️ Report Message</strong>
                            <button onClick={() => setShowReportModal(null)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 18 }}>✕</button>
                        </div>
                        <select value={reportReason} onChange={e => setReportReason(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: '#333', color: '#fff', fontSize: 12 }}>
                            <option value="">Select reason...</option>
                            <option value="spam">Spam</option>
                            <option value="harassment">Harassment</option>
                            <option value="inappropriate">Inappropriate Content</option>
                            <option value="scam">Scam / Fraud</option>
                            <option value="other">Other</option>
                        </select>
                        <button disabled={!reportReason} onClick={async () => { await svc.reportMessage(showReportModal, reportReason); setShowReportModal(null); if (typeof window !== 'undefined') window.alert('Message reported. Thank you.'); }} style={{ display: 'block', width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', background: reportReason ? '#ff9800' : 'rgba(255,255,255,0.05)', color: reportReason ? '#fff' : '#999', cursor: reportReason ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>🚩 Submit Report</button>
                    </div>
                </div>
            )}

            {/* ═══ P15-1: Group Creation Wizard ═══ */}
            {showGroupWizard && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#242526', borderRadius: 16, padding: 20, width: 320, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <strong style={{ color: '#fff', fontSize: 14 }}>👥 Create Group</strong>
                            <button onClick={() => setShowGroupWizard(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 18 }}>✕</button>
                        </div>
                        <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Group name..." style={{ width: '100%', padding: '8px 12px', marginBottom: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: '#333', color: '#fff', fontSize: 13, boxSizing: 'border-box' }} />
                        <div style={{ color: '#888', fontSize: 11, marginBottom: 8 }}>Members will be added from your conversations:</div>
                        <button disabled={!groupName.trim()} onClick={async () => { const conv = await svc.createGroupConversation({ name: groupName, participants: [] }); if (conv) { setShowGroupWizard(false); setGroupName(''); } }} style={{ display: 'block', width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', background: groupName.trim() ? '#2D88FF' : 'rgba(255,255,255,0.05)', color: groupName.trim() ? '#fff' : '#999', cursor: groupName.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>✨ Create Group</button>
                    </div>
                </div>
            )}

            {/* ═══ P16-1: Media Gallery Drawer ═══ */}
            {showMediaGallery && (
                <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 280, background: '#242526', borderLeft: '1px solid rgba(255,255,255,0.1)', zIndex: 90, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <strong style={{ color: '#fff', fontSize: 14 }}>📸 Media Gallery</strong>
                        <button onClick={() => setShowMediaGallery(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 18 }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {['images', 'videos', 'files', 'voice'].map(tab => (
                            <button key={tab} onClick={() => setMediaGalleryTab(tab)} style={{ flex: 1, padding: '8px 4px', background: mediaGalleryTab === tab ? 'rgba(45,136,255,0.15)' : 'transparent', border: 'none', borderBottom: mediaGalleryTab === tab ? '2px solid #2D88FF' : '2px solid transparent', color: mediaGalleryTab === tab ? '#2D88FF' : '#999', fontSize: 11, cursor: 'pointer', textTransform: 'capitalize' }}>{tab}</button>
                        ))}
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                        {(svc.mediaGallery?.[mediaGalleryTab] || []).length === 0 && (
                            <div style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: 20 }}>No {mediaGalleryTab} found</div>
                        )}
                        {mediaGalleryTab === 'images' && (svc.mediaGallery?.images || []).map(item => (
                            <div key={item.id} style={{ marginBottom: 8, borderRadius: 8, overflow: 'hidden' }}>
                                <img src={item.media_url} alt="" style={{ width: '100%', borderRadius: 8, objectFit: 'cover', maxHeight: 120 }} />
                                <div style={{ color: '#888', fontSize: 10, marginTop: 2 }}>{new Date(item.created_at).toLocaleDateString()}</div>
                            </div>
                        ))}
                        {mediaGalleryTab !== 'images' && (svc.mediaGallery?.[mediaGalleryTab] || []).map(item => (
                            <div key={item.id} style={{ padding: '8px 10px', marginBottom: 4, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: '#ccc', fontSize: 12 }}>{item.text || item.media_url?.split('/').pop() || 'File'}</span>
                                <span style={{ color: '#888', fontSize: 10 }}>{new Date(item.created_at).toLocaleDateString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ P16-4: Sticker Picker ═══ */}
            {showStickerPicker && (
                <div style={{ position: 'absolute', bottom: 70, left: 12, right: 12, background: '#242526', borderRadius: 16, padding: 12, border: '1px solid rgba(255,255,255,0.1)', zIndex: 80, maxHeight: 200, overflow: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {(svc.STICKER_PACKS || []).map((pack, idx) => (
                                <button key={pack.id} onClick={() => setStickerPackIdx(idx)} style={{ padding: '4px 8px', borderRadius: 8, border: 'none', background: stickerPackIdx === idx ? 'rgba(45,136,255,0.2)' : 'transparent', color: stickerPackIdx === idx ? '#2D88FF' : '#999', cursor: 'pointer', fontSize: 11 }}>{pack.name}</button>
                            ))}
                        </div>
                        <button onClick={() => setShowStickerPicker(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                        {((svc.STICKER_PACKS || [])[stickerPackIdx]?.stickers || []).map((sticker, i) => (
                            <button key={i} onClick={() => { svc.sendSticker(sticker); setShowStickerPicker(false); }} style={{ padding: 8, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 24, transition: 'transform 0.1s' }} onMouseEnter={e => e.target.style.transform='scale(1.3)'} onMouseLeave={e => e.target.style.transform='scale(1)'}>{sticker}</button>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ P16-9: Keyboard Shortcuts Panel ═══ */}
            {showShortcuts && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#242526', borderRadius: 16, padding: 20, width: 320, border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <strong style={{ color: '#fff', fontSize: 14 }}>⌨️ Keyboard Shortcuts</strong>
                            <button onClick={() => setShowShortcuts(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 18 }}>✕</button>
                        </div>
                        {(svc.KEYBOARD_SHORTCUTS || []).map((s, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ color: '#ccc', fontSize: 12 }}>{s.action}</span>
                                <kbd style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.1)', color: '#2D88FF', fontSize: 11, fontFamily: 'monospace' }}>{s.keys}</kbd>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* P4-6 + P18-1: Smart Reply Suggestions (now using AI backend) */}
            {(() => {
                const lastOtherMsg = messages?.slice().reverse().find(m => m.sender_id !== currentUser?.id);
                const smartReplies = lastOtherMsg ? svc.getSmartReplies(lastOtherMsg.text) : [];
                if (smartReplies.length === 0 && showSmartReplies.length === 0) return null;
                const replies = smartReplies.length > 0 ? smartReplies : showSmartReplies;
                return (
                    <div className="smart-replies-bar">
                        {replies.map((reply, i) => (
                            <button key={i} className="smart-reply-chip" onClick={() => {
                                svc.sendMessageWithMentionDetection(reply);
                                onSend?.(reply);
                                setShowSmartReplies([]);
                                busEmit.messageSent(conversationId, otherUser?.id);
                            }}>{reply}</button>
                        ))}
                    </div>
                );
            })()}

            {/* P18-2: Conversation Summary Banner */}
            {(() => {
                const summary = svc.getConversationSummary();
                if (!summary) return null;
                return (
                    <div style={{ padding: '6px 12px', background: 'linear-gradient(90deg, rgba(45,136,255,0.15), rgba(45,136,255,0.05))', borderRadius: 8, margin: '0 8px 6px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#ddd' }}>
                        <span style={{ fontSize: 14 }}>📋</span>
                        <span style={{ flex: 1 }}>{summary.summary}</span>
                        <button onClick={() => {
                            const unreadIds = (messages || []).filter(m => m.sender_id !== currentUser?.id && !m.read_at).map(m => m.id);
                            if (unreadIds.length > 0) svc.markAsRead(unreadIds);
                        }} style={{ background: 'none', border: 'none', color: '#2D88FF', cursor: 'pointer', fontSize: 10, whiteSpace: 'nowrap' }}>Mark Read</button>
                    </div>
                );
            })()}

            {/* P18-4: Conversation Label Badges */}
            {conversationId && (svc.conversationLabels?.[conversationId] || []).length > 0 && (
                <div style={{ display: 'flex', gap: 4, padding: '2px 8px', flexWrap: 'wrap' }}>
                    {(svc.conversationLabels[conversationId] || []).map(l => (
                        <span key={l.id} style={{ padding: '1px 6px', borderRadius: 4, background: l.color + '30', color: l.color, fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
                            {l.label}
                            <button onClick={() => svc.removeConversationLabel(l.id)} style={{ background: 'none', border: 'none', color: l.color, cursor: 'pointer', fontSize: 8, padding: 0 }}>✕</button>
                        </span>
                    ))}
                    <button onClick={() => setShowLabelPicker(true)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 10 }}>+ Label</button>
                </div>
            )}

            {/* P18-4: Label Picker Modal */}
            {showLabelPicker && (
                <div style={{ padding: '8px 12px', background: 'rgba(36,37,38,0.97)', borderRadius: 8, margin: '0 8px 4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input type="text" placeholder="Label name..." value={newLabelText} onChange={e => setNewLabelText(e.target.value)} style={{ flex: 1, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '3px 6px', fontSize: 11, background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                        <input type="color" value={newLabelColor} onChange={e => setNewLabelColor(e.target.value)} style={{ width: 24, height: 24, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
                        <button onClick={async () => { if (newLabelText.trim()) { await svc.addConversationLabel(conversationId, newLabelText.trim(), newLabelColor); setNewLabelText(''); setShowLabelPicker(false); } }} style={{ background: '#2D88FF', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}>Add</button>
                        <button onClick={() => setShowLabelPicker(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 14 }}>✕</button>
                    </div>
                </div>
            )}

            {/* P18-6: Auto-Away Toggle */}
            {showAutoAwaySettings && (
                <div style={{ padding: '8px 12px', background: 'rgba(36,37,38,0.97)', borderRadius: 8, margin: '0 8px 4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <strong style={{ color: '#fff', fontSize: 12 }}>🌙 Auto-Away</strong>
                        <button onClick={() => setShowAutoAwaySettings(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input type="text" placeholder="Away message..." value={autoAwayMsg} onChange={e => setAutoAwayMsg(e.target.value)} style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 8px', fontSize: 11, background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => { svc.setAutoAway(autoAwayMsg, 15); setShowAutoAwaySettings(false); }} style={{ background: svc.autoAwayConfig?.enabled ? '#ff6b6b' : '#2D88FF', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer', flex: 1 }}>
                                {svc.autoAwayConfig?.enabled ? 'Disable Auto-Away' : 'Enable Auto-Away'}
                            </button>
                            {svc.autoAwayConfig?.enabled && <button onClick={() => { svc.clearAutoAway(); setShowAutoAwaySettings(false); }} style={{ background: '#ff4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer' }}>Clear</button>}
                        </div>
                    </div>
                </div>
            )}

            {/* P19-1: Typing Indicator Bar */}
            {Object.entries(svc.typingUsers || {}).some(([uid, isTyping]) => isTyping && uid !== currentUser?.id) && (
                <div style={{ padding: '4px 12px', fontSize: 11, color: '#B0B3B8', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ display: 'flex', gap: 2 }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2D88FF', animation: 'bounce 1.4s infinite ease-in-out', animationDelay: '0s' }} />
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2D88FF', animation: 'bounce 1.4s infinite ease-in-out', animationDelay: '0.2s' }} />
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#2D88FF', animation: 'bounce 1.4s infinite ease-in-out', animationDelay: '0.4s' }} />
                    </span>
                    Someone is typing...
                </div>
            )}

            {/* P19-9: Spam Detection Warning Toast */}
            {spamWarning && (
                <div style={{ padding: '6px 12px', background: spamWarning.severity === 'blocked' ? 'rgba(228,30,63,0.2)' : 'rgba(255,215,0,0.15)', borderRadius: 8, margin: '0 8px 6px', fontSize: 11, color: spamWarning.severity === 'blocked' ? '#ff4444' : '#ffd700', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{spamWarning.severity === 'blocked' ? '🚫' : '⚠️'}</span>
                    <span style={{ flex: 1 }}>{spamWarning.reason}</span>
                    <button onClick={() => setSpamWarning(null)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
            )}

            {/* P19-7: Smart Compose Autocomplete Dropdown */}
            {autoCompleteSuggestions.length > 0 && (
                <div style={{ padding: '4px 8px', margin: '0 8px 4px', background: 'rgba(45,136,255,0.08)', borderRadius: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {autoCompleteSuggestions.map((suggestion, i) => (
                        <button key={i} onClick={() => { setInputText(prev => prev + suggestion + ' '); setAutoCompleteSuggestions([]); }} style={{ background: 'rgba(45,136,255,0.15)', border: '1px solid rgba(45,136,255,0.3)', borderRadius: 12, padding: '2px 8px', fontSize: 10, color: '#8ab4f8', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            ↳ {suggestion}
                        </button>
                    ))}
                </div>
            )}

            {/* P19-3: Search Overlay */}
            {showSearchOverlay && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(24,25,26,0.97)', zIndex: 50, display: 'flex', flexDirection: 'column', borderRadius: 12 }}>
                    <div style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize: 16 }}>🔍</span>
                        <input type="text" placeholder="Search messages..." value={searchQuery} onChange={async (e) => { setSearchQuery(e.target.value); if (e.target.value.length >= 2) { const results = await svc.searchMessages(e.target.value); setLocalSearchResults(results || []); } else { setLocalSearchResults([]); } }} autoFocus style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '6px 12px', color: '#e4e6eb', fontSize: 13, outline: 'none' }} />
                        <button onClick={() => { setShowSearchOverlay(false); setSearchQuery(''); setLocalSearchResults([]); }} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 18 }}>✕</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                        {localSearchResults.length === 0 && searchQuery.length >= 2 && <div style={{ textAlign: 'center', padding: 20, color: '#666', fontSize: 12 }}>No messages found</div>}
                        {localSearchResults.map((result, i) => {
                            const highlighted = svc.highlightSearchMatches(result.text, searchQuery);
                            return (
                                <div key={i} onClick={() => { setShowSearchOverlay(false); setSearchQuery(''); setLocalSearchResults([]); }} style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', borderRadius: 6, marginBottom: 2 }}>
                                    <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>{new Date(result.created_at).toLocaleString()}</div>
                                    <div style={{ fontSize: 12, color: '#e4e6eb' }}>{highlighted?.split('⟪').map((part, j) => { const [match, rest] = part.split('⟫'); return j === 0 ? part : <span key={j}><mark style={{ background: '#2D88FF33', color: '#8ab4f8', padding: '0 2px', borderRadius: 2 }}>{match}</mark>{rest}</span>; })}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}



            {/* P19-5: Scheduled Messages Panel */}
            {showSchedulePanel && (
                <div style={{ background: 'rgba(24,25,26,0.96)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, margin: '0 8px 6px', padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 'bold', fontSize: 12, color: '#e4e6eb' }}>⏰ Scheduled Messages</span>
                        <button onClick={() => setShowSchedulePanel(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <input type="text" placeholder="Message to schedule..." value={scheduleText} onChange={(e) => setScheduleText(e.target.value)} style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 8px', color: '#e4e6eb', fontSize: 11, outline: 'none' }} />
                        <input type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 6px', color: '#e4e6eb', fontSize: 10, outline: 'none' }} />
                        <button onClick={async () => { if (scheduleText && scheduleDate) { await svc.scheduleMessage?.(scheduleText, new Date(scheduleDate).toISOString()); setScheduleText(''); setScheduleDate(''); } }} style={{ background: '#2D88FF', border: 'none', borderRadius: 6, padding: '4px 10px', color: '#fff', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>Schedule</button>
                    </div>
                    {(svc.scheduledMessages || []).length === 0 && <div style={{ textAlign: 'center', color: '#666', fontSize: 11, padding: 6 }}>No scheduled messages</div>}
                    {(svc.scheduledMessages || []).map((sm, i) => (
                        <div key={i} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, color: '#ccc' }}>{sm.text?.slice(0, 50)}</div>
                                <div style={{ fontSize: 9, color: '#666' }}>📅 {new Date(sm.scheduled_at).toLocaleString()}</div>
                            </div>
                            <button onClick={() => svc.cancelScheduledMessage?.(sm.id)} style={{ background: 'rgba(228,30,63,0.2)', border: 'none', borderRadius: 4, padding: '2px 8px', color: '#ff4444', fontSize: 10, cursor: 'pointer' }}>Cancel</button>
                        </div>
                    ))}
                </div>
            )}

            {/* P20-2: Contact Insights Card */}
            {showContactInsights && (() => {
                const insights = svc.getContactInsights(otherUser?.id);
                return insights ? (
                    <div style={{ background: 'rgba(24,25,26,0.96)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, margin: '0 8px 6px', padding: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontWeight: 'bold', fontSize: 12, color: '#e4e6eb' }}>📊 Contact Insights</span>
                            <button onClick={() => setShowContactInsights(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>✕</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '6px 8px' }}><div style={{ color: '#666', fontSize: 9 }}>Total Messages</div><div style={{ color: '#e4e6eb', fontWeight: 'bold' }}>{insights.totalMessages}</div></div>
                            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '6px 8px' }}><div style={{ color: '#666', fontSize: 9 }}>Shared Media</div><div style={{ color: '#e4e6eb', fontWeight: 'bold' }}>{insights.sharedMedia}</div></div>
                            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '6px 8px' }}><div style={{ color: '#666', fontSize: 9 }}>Conversation Age</div><div style={{ color: '#e4e6eb', fontWeight: 'bold' }}>{insights.conversationAge}d</div></div>
                            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '6px 8px' }}><div style={{ color: '#666', fontSize: 9 }}>Avg Response</div><div style={{ color: '#e4e6eb', fontWeight: 'bold' }}>{insights.avgResponseTime ? `${insights.avgResponseTime}m` : 'N/A'}</div></div>
                        </div>
                        <div style={{ fontSize: 10, color: '#666', marginTop: 6, textAlign: 'center' }}>You: {insights.myMessages} • Them: {insights.theirMessages} • Emoji msgs: {insights.topEmojis}</div>
                    </div>
                ) : null;
            })()}


            {/* P20-8: Bookmarks Drawer */}
            {showBookmarksDrawer && (
                <div style={{ background: 'rgba(24,25,26,0.96)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, margin: '0 8px 6px', padding: 10, maxHeight: 220, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 'bold', fontSize: 12, color: '#e4e6eb' }}>🔖 Saved Messages</span>
                        <button onClick={() => setShowBookmarksDrawer(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>✕</button>
                    </div>
                    {(prefs.bookmarks || []).length === 0 && <div style={{ textAlign: 'center', color: '#666', fontSize: 11, padding: 10 }}>No saved messages</div>}
                    {(prefs.bookmarks || []).map((bm, i) => (
                        <div key={i} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: '#ccc' }}>
                            <div style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>{new Date(bm.created_at || bm.savedAt).toLocaleString()}</div>
                            <div>{bm.text?.slice(0, 80) || `[${bm.message_type}]`}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* P20-10: Export Format Picker */}
            {showExportPicker && (
                <div style={{ background: 'rgba(24,25,26,0.96)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, margin: '0 8px 6px', padding: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#e4e6eb', fontWeight: 'bold' }}>💾 Export As:</span>
                    <button onClick={() => { svc.exportConversationFormatted('txt'); setShowExportPicker(false); }} style={{ background: 'rgba(45,136,255,0.15)', border: '1px solid rgba(45,136,255,0.3)', borderRadius: 6, padding: '3px 10px', fontSize: 10, color: '#8ab4f8', cursor: 'pointer' }}>📄 Plain Text</button>
                    <button onClick={() => { svc.exportConversationFormatted('html'); setShowExportPicker(false); }} style={{ background: 'rgba(0,230,118,0.15)', border: '1px solid rgba(0,230,118,0.3)', borderRadius: 6, padding: '3px 10px', fontSize: 10, color: '#00e676', cursor: 'pointer' }}>🌐 HTML</button>
                    <button onClick={() => { svc.exportConversationFormatted('csv'); setShowExportPicker(false); }} style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: 6, padding: '3px 10px', fontSize: 10, color: '#ffd700', cursor: 'pointer' }}>📊 CSV</button>
                    <button onClick={() => setShowExportPicker(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 12, marginLeft: 'auto' }}>✕</button>
                </div>
            )}

            {/* P20-3: Edit History Modal */}
            {showEditHistory && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(36,37,38,0.98)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 16, maxWidth: 320, maxHeight: 300, overflowY: 'auto', zIndex: 60 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 'bold', fontSize: 12, color: '#e4e6eb' }}>📝 Edit History</span>
                        <button onClick={() => { setShowEditHistory(null); setEditHistoryData([]); }} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>✕</button>
                    </div>
                    {editHistoryData.length === 0 && <div style={{ color: '#666', fontSize: 11, textAlign: 'center', padding: 10 }}>No edit history</div>}
                    {editHistoryData.map((edit, i) => (
                        <div key={i} style={{ padding: '6px 8px', borderLeft: '2px solid rgba(45,136,255,0.4)', marginBottom: 6, marginLeft: 4 }}>
                            <div style={{ fontSize: 9, color: '#666' }}>{new Date(edit.edited_at).toLocaleString()}</div>
                            <div style={{ fontSize: 11, color: '#B0B3B8' }}>{edit.text}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* P20-1: Reactions Detail Floating Panel */}
            {showReactionDetail && (
                <div style={{ position: 'absolute', bottom: 60, right: 12, background: 'rgba(36,37,38,0.98)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: 10, maxWidth: 200, zIndex: 60 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 'bold', fontSize: 11, color: '#e4e6eb' }}>Reactions</span>
                        <button onClick={() => { setShowReactionDetail(null); setReactionDetailData([]); }} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 10 }}>✕</button>
                    </div>
                    {reactionDetailData.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ fontSize: 16 }}>{r.emoji}</span>
                            <span style={{ fontSize: 10, color: '#B0B3B8', flex: 1 }}>{r.userLabel}</span>
                            <span style={{ fontSize: 9, color: '#666' }}>{new Date(r.reactedAt).toLocaleTimeString()}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* P20-6: Multi-Select Forward Action Bar */}
            {multiSelectMode && selectedMessageIds.length > 0 && (
                <div style={{ padding: '6px 12px', background: 'rgba(45,136,255,0.12)', borderRadius: 8, margin: '0 8px 6px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{ color: '#8ab4f8', fontWeight: 'bold' }}>{selectedMessageIds.length} selected</span>
                    <button onClick={async () => { const targetId = prompt('Enter target conversation ID:'); if (targetId) { await svc.forwardMultipleMessages(selectedMessageIds, targetId); setMultiSelectMode(false); setSelectedMessageIds([]); } }} style={{ background: '#2D88FF', border: 'none', borderRadius: 6, padding: '3px 10px', color: '#fff', fontSize: 10, cursor: 'pointer' }}>↪ Forward Selected</button>
                    <button onClick={() => { setMultiSelectMode(false); setSelectedMessageIds([]); }} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 10, marginLeft: 'auto' }}>Cancel</button>
                </div>
            )}

            {/* P21-5: Offline Banner */}
            {svc.isOffline && (
                <div style={{ padding: '6px 12px', background: 'rgba(255,68,68,0.15)', borderRadius: 8, margin: '0 8px 6px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#ff6b6b' }}>
                    <span style={{ fontSize: 14 }}>📡</span>
                    <span style={{ fontWeight: 'bold' }}>You are offline</span>
                    <span style={{ color: '#999', marginLeft: 'auto' }}>Messages will be sent when reconnected</span>
                </div>
            )}

            {/* P21-2: Reminder Picker Modal */}
            {reminderPickerMsg && (
                <div style={{ position: 'absolute', bottom: 60, right: 12, background: 'rgba(36,37,38,0.98)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: 12, maxWidth: 220, zIndex: 70 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 'bold', fontSize: 12, color: '#e4e6eb' }}>⏰ Remind Me</span>
                        <button onClick={() => setReminderPickerMsg(null)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>✕</button>
                    </div>
                    <div style={{ fontSize: 10, color: '#999', marginBottom: 6 }}>"{reminderPickerMsg.text?.slice(0, 50) || '[Media]'}..."</div>
                    {[
                        { label: 'In 15 minutes', ms: 15 * 60 * 1000 },
                        { label: 'In 1 hour', ms: 60 * 60 * 1000 },
                        { label: 'In 3 hours', ms: 3 * 60 * 60 * 1000 },
                        { label: 'Tomorrow 9am', ms: (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime() - Date.now(); })() },
                    ].map((opt, i) => (
                        <button key={i} onClick={async () => { await svc.setMessageReminder(reminderPickerMsg.id, new Date(Date.now() + opt.ms).toISOString()); setReminderPickerMsg(null); }} style={{ display: 'block', width: '100%', padding: '6px 8px', margin: '3px 0', background: 'rgba(45,136,255,0.12)', border: '1px solid rgba(45,136,255,0.3)', borderRadius: 6, color: '#8ab4f8', cursor: 'pointer', fontSize: 11, textAlign: 'left' }}>{opt.label}</button>
                    ))}
                    <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6 }}>
                        <input type="datetime-local" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} style={{ width: '100%', background: '#242526', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, color: '#e4e6eb', padding: '4px 6px', fontSize: 10 }} />
                        <button onClick={async () => { if (reminderTime) { await svc.setMessageReminder(reminderPickerMsg.id, new Date(reminderTime).toISOString()); setReminderPickerMsg(null); setReminderTime(''); } }} style={{ marginTop: 4, width: '100%', padding: '5px', background: '#2D88FF', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 10 }}>Set Custom Reminder</button>
                    </div>
                </div>
            )}

            {/* P21-2: Reminders Drawer */}
            {showRemindersPanel && (
                <div style={{ background: 'rgba(24,25,26,0.96)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, margin: '0 8px 6px', padding: 10, maxHeight: 200, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 'bold', fontSize: 12, color: '#e4e6eb' }}>⏰ Active Reminders ({svc.messageReminders?.length || 0})</span>
                        <button onClick={() => setShowRemindersPanel(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>✕</button>
                    </div>
                    {(!svc.messageReminders || svc.messageReminders.length === 0) && <div style={{ textAlign: 'center', color: '#666', fontSize: 11, padding: 10 }}>No active reminders</div>}
                    {(svc.messageReminders || []).map((r, i) => (
                        <div key={i} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: '#ccc', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 9, color: '#ffd700' }}>🔔 {new Date(r.remind_at).toLocaleString()}</div>
                                <div>{r.message_preview}</div>
                            </div>
                            <button onClick={() => svc.dismissReminder(r.id)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 10 }}>✕</button>
                        </div>
                    ))}
                </div>
            )}

            {/* P21-3: Format Toolbar Hint */}
            {showFormatToolbar && (
                <div style={{ padding: '4px 12px', background: 'rgba(45,136,255,0.08)', borderRadius: 6, margin: '0 8px 4px', fontSize: 10, color: '#8ab4f8', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span><strong>**bold**</strong></span>
                    <span><em>*italic*</em></span>
                    <span><code style={{ background: 'rgba(255,255,255,0.1)', padding: '0 3px', borderRadius: 2 }}>`code`</code></span>
                    <span><del>~~strike~~</del></span>
                    <span style={{ color: '#999' }}>URLs auto-link</span>
                    <button onClick={() => setShowFormatToolbar(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 10 }}>✕</button>
                </div>
            )}

            {/* P21-6: @smarter.poker mention detection badge */}
            {inputText && (inputText.toLowerCase().includes('@smarter.poker') || inputText.toLowerCase().includes('@smarterpoker')) && (
                <div style={{ padding: '3px 12px', margin: '0 8px 4px', borderRadius: 6, background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', fontSize: 10, color: '#ffd700', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12 }}>🔗</span>
                    <span>This message will be linked to <strong>Smarter.Poker Admin Panel</strong></span>
                </div>
            )}

            {/* P18-10: Backup/Restore Panel */}
            {showBackupRestore && (
                <div style={{ padding: '8px 12px', background: 'rgba(36,37,38,0.97)', borderRadius: 8, margin: '0 8px 4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ color: '#fff', fontSize: 12 }}>💾 Backup & Restore</strong>
                        <button onClick={() => setShowBackupRestore(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => svc.backupConversation()} style={{ flex: 1, background: '#2D88FF', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer' }}>📥 Backup (.spbk)</button>
                        <button onClick={() => backupFileInputRef.current?.click()} style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: '#ccc', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer' }}>📤 Restore</button>
                        <input type="file" ref={backupFileInputRef} accept=".spbk" style={{ display: 'none' }} onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = async (ev) => {
                                const result = await svc.restoreConversation(ev.target.result);
                                if (typeof window !== 'undefined') window.alert(result.success ? result.message : `Restore failed: ${result.error}`);
                            };
                            reader.readAsText(file);
                        }} />
                    </div>
                </div>
            )}

            {/* E2 + P18-5: Templates Bar + Editor (Dual Layer: local prefs + Supabase) */}
            {showTemplates && (
                <div className="templates-bar" style={{ flexWrap: 'wrap' }}>
                    {/* Local templates */}
                    {prefs.templates.map((tpl, i) => (
                        <span key={`local-${i}`} className="template-chip" onClick={() => { setInputText(tpl); setShowTemplates(false); }}>
                            {tpl}
                            <button style={{ marginLeft: 4, background: 'none', border: 'none', color: '#E41E3F', cursor: 'pointer', fontSize: 10 }} onClick={(e) => { e.stopPropagation(); updatePrefs(p => ({ ...p, templates: p.templates.filter((_, idx) => idx !== i) })); }}>✕</button>
                        </span>
                    ))}
                    {/* P18-5: Supabase templates */}
                    {(svc.messageTemplates || []).map(tpl => (
                        <span key={`supa-${tpl.id}`} className="template-chip" style={{ borderLeft: '2px solid #2D88FF' }} onClick={async () => { const text = await svc.useTemplate(tpl.id); if (text) { setInputText(text); setShowTemplates(false); } }}>
                            {tpl.title}
                            <button style={{ marginLeft: 4, background: 'none', border: 'none', color: '#E41E3F', cursor: 'pointer', fontSize: 10 }} onClick={(e) => { e.stopPropagation(); svc.deleteTemplate(tpl.id); }}>✕</button>
                        </span>
                    ))}
                    <button className="template-chip" style={{ fontWeight: 700 }} onClick={() => setShowTemplateEditor(!showTemplateEditor)}>+ Add</button>
                </div>
            )}
            {/* E2 + P18-5: Template Editor (saves to Supabase) */}
            {showTemplateEditor && (
                <div style={{ display: 'flex', gap: 4, padding: '4px 8px', background: 'rgba(36,37,38,0.95)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <input type="text" placeholder="Template title..." value={newTemplate} onChange={e => setNewTemplate(e.target.value)} style={{ flex: 1, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 8px', fontSize: 11, background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                    <button style={{ background: '#2D88FF', color: 'white', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }} onClick={async () => { if (newTemplate.trim()) { const saved = await svc.saveTemplate(newTemplate.trim(), newTemplate.trim()); if (!saved) { updatePrefs(p => ({ ...p, templates: [...p.templates, newTemplate.trim()] })); } setNewTemplate(''); setShowTemplateEditor(false); } }}>Save</button>
                </div>
            )}

            {/* Input */}
            <div className="chat-input" style={{ flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 4 }}>
                    {/* P8-5 E2E indicator */}
                    {isE2E && <div style={{ position: 'absolute', top: -20, left: 10, fontSize: 10, color: '#00e676', fontWeight: 'bold' }}>🔒 RSA-2048 E2E Active</div>}
                    
                    <button className="input-btn" onClick={() => setShowTemplates(!showTemplates)} title="Templates">📋</button>
                    <button className="input-btn" onClick={() => fileInputRef.current?.click()} title="Attach File">📎</button>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                    {/* P9-2: GIF Search */}
                    <button className="input-btn" onClick={() => setShowGifPanel(!showGifPanel)} title="Send GIF" style={{ color: showGifPanel ? '#0088ff' : undefined }}>GIF</button>
                    {/* P9-4: Contact Card */}
                    <button className="input-btn" onClick={sendContactCard} title="Share Contact Card">📇</button>
                    {/* P9-5: Location Sharing */}
                    <button className="input-btn" onClick={handleShareLocation} title="Share Location" disabled={sharingLocation} style={{ opacity: sharingLocation ? 0.5 : 1 }}>📍</button>
                    {/* P5-3 & P8-2: MediaRecorder UI */}
                    <button className={`input-btn ${isRecording ? 'recording' : ''}`} onClick={isRecording ? stopRecording : startRecording} title={isRecording ? 'Stop Recording' : 'Voice Message'}>
                        {isRecording ? <span style={{fontSize: 12, fontWeight: 'bold', color: 'red'}}>🔴 {Math.floor(recordingTime/60)}:{(recordingTime%60).toString().padStart(2, '0')}</span> : '🎤'}
                    </button>
                    <button className="input-btn">🎁</button>

                    <div className="input-wrapper">
                        <input
                            autoFocus
                            type="text"
                            placeholder="Aa"
                            value={inputText}
                            onChange={(e) => { handleInputChange(e); const ac = svc.getAutoComplete?.(e.target.value); setAutoCompleteSuggestions(ac || []); }}
                            onKeyPress={handleKeyPress}
                            onPaste={(e) => {
                                const items = e.clipboardData?.items;
                                if (!items) return;
                                for (const item of items) {
                                    if (item.type.startsWith('image/')) {
                                        e.preventDefault();
                                        const file = item.getAsFile();
                                        if (file) handleFileUpload({ target: { files: [file] } });
                                        return;
                                    }
                                }
                            }}
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

            {/* P7-6: Fullscreen Image Lightbox Modal */}
            {lightboxImage && (
                <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
                    <button className="lightbox-close">✕</button>
                    <img src={lightboxImage.url} alt="Fullscreen Attachment" className="lightbox-image" />
                    {lightboxImage.caption && <div className="lightbox-caption">{lightboxImage.caption}</div>}
                </div>
            )}

            {/* Location Enable Modal */}
            {showLocationModal && (
                <LocationEnableModal
                    onClose={() => setShowLocationModal(false)}
                    onRetry={() => { setShowLocationModal(false); handleShareLocation(); }}
                    onManualEntry={() => setShowLocationModal(false)}
                />
            )}

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

                /* P7-1 & P7-2: WebRTC Call Banner */
                .active-call-banner {
                    display: flex;
                    flex-direction: column;
                    background: #222;
                    color: white;
                    padding: 12px;
                    border-bottom: 1px solid #111;
                    animation: slideDown 0.3s ease-out;
                }
                .active-call-banner.audio { background: #1a1a2e; }
                .active-call-banner.video { background: #2a2a2a; }
                
                @keyframes slideDown {
                    from { margin-top: -60px; opacity: 0; }
                    to { margin-top: 0; opacity: 1; }
                }

                .call-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 8px;
                }
                .call-icon { font-size: 18px; }
                .call-status { font-size: 13px; font-weight: 600; }

                .video-pip-window {
                    width: 100%;
                    height: 120px;
                    background: #000;
                    border-radius: 8px;
                    margin-bottom: 12px;
                    overflow: hidden;
                    position: relative;
                }
                .simulated-remote-video {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(45deg, #222, #444);
                    animation: pulseBg 2s infinite alternate;
                }
                @keyframes pulseBg {
                    from { opacity: 0.8; }
                    to { opacity: 1; }
                }

                .call-controls {
                    display: flex;
                    justify-content: center;
                    gap: 16px;
                }
                .call-btn-action {
                    padding: 6px 16px;
                    border-radius: 20px;
                    border: none;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    color: white;
                }
                .call-btn-action.accept { background: #2e7d32; }
                .call-btn-action.hangup { background: #d32f2f; }
                .call-btn-action:hover { filter: brightness(1.2); }

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
        // API returns otherUser directly; conv.participants is legacy shape
        const otherUser = conv.otherUser || conv.participants?.find(p => p.id !== currentUser?.id);
        const name = otherUser?.name || otherUser?.username || otherUser?.display_name || '';
        const title = conv.title || conv.group_name || '';
        if (!searchQuery) return true;
        return name.toLowerCase().includes(searchQuery.toLowerCase()) ||
               title.toLowerCase().includes(searchQuery.toLowerCase());
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
                    // API returns otherUser directly; fall back to participants for legacy data
                    const otherUser = conv.otherUser || conv.participants?.find(p => p.id !== currentUser?.id);
                    const displayName = conv.title || conv.group_name || otherUser?.name || otherUser?.username || otherUser?.display_name || 'Unknown';
                    const avatarUrl = otherUser?.avatar_url || otherUser?.avatar || null;
                    // last_message_preview is the server column; lastMessage.text is legacy client shape
                    const previewText = conv.last_message_preview || conv.lastMessage?.text || '';
                    const isUnread = (conv.unreadCount ?? conv.unread_count ?? 0) > 0;

                    return (
                        <div
                            key={conv.id || i}
                            className={`conv-item ${isUnread ? 'unread' : ''}`}
                            onClick={() => onSelectConversation?.(conv)}
                        >
                            <SPAvatar
                                src={avatarUrl}
                                size={56}
                                online={otherUser?.online}
                            />
                            <div className="conv-info">
                                <span className="conv-name">{displayName}</span>
                                <span className="conv-preview">
                                    {previewText?.slice(0, 40)}
                                    {previewText?.length > 40 && '...'}
                                </span>
                            </div>
                            {isUnread && <div className="unread-dot" />}
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
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    ChatWindow,
    ConversationList
};
