/**
 * 💬 smarter-poker-style MESSENGER
 * src/app/social/components/SmarterPokerMessenger.jsx
 * 
 * Chat system with conversation list and message threads
 */

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { SPAvatar, SP_COLORS } from './SmarterPokerStyleCard';

// ═══════════════════════════════════════════════════════════════════════════
// 💾 PERSISTENCE HOOK (P2 features)
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

const useMessengerPrefs = () => {
    const [prefs, setPrefs] = useState({
        bookmarks: [],
        labels: {},
        themes: {},
        disappearing: {},
        scheduledQueue: [],
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

    const updatePrefs = (updater) => {
        setPrefs(prev => {
            const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
            try {
                localStorage.setItem('sp-messenger-prefs', JSON.stringify(next));
            } catch (e) { }
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

        <div className={`message-bubble ${isOwn ? 'own' : 'other'} ${message.isDisappearing ? 'ephemeral' : ''}`}>
            {message.text}

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
            {/* Hover Actions — E8: Expanded Label Categories */}
            <div className="message-hover-actions">
                <button onClick={() => onAction?.('bookmark', message)} title={message.isBookmarked ? "Remove Bookmark" : "Save Bookmark"}>📌</button>
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
    messages = [],
    currentUser,
    onSend,
    onClose,
    onMinimize,
    onBroadcast,
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
    const messagesEndRef = useRef(null);
    const [prefs, updatePrefs] = useMessengerPrefs();

    const conversationId = conversation?.id;
    const theme = prefs.themes[conversationId] || SP_COLORS.bgWhite;
    const disappearMs = prefs.disappearing[conversationId] || 0;
    const isDisappearing = disappearMs > 0;

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
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
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
                        {otherUser?.online ? 'Active now' : 'Active 2h ago'}
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
                    <button className="header-btn" onClick={onMinimize}>−</button>
                    <button className="header-btn" onClick={onClose}>✕</button>
                </div>
            </div>

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

            {/* Messages */}
            <div className="chat-messages">
                {messages.map((msg, i) => {
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
                        isDisappearing: isDisappearing
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
            </div>

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
                    <button className="input-btn">📷</button>
                    <button className="input-btn">🎁</button>

                    <div className="input-wrapper">
                        <input
                            type="text"
                            placeholder="Aa"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
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
