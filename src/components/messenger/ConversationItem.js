import React, { useState, useEffect, useRef } from 'react';
import { defaultTheme } from './MessengerTheme';
import { Avatar } from './Avatar';

function timeAgo(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const date = new Date(timestamp);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return date.toLocaleDateString();
}

export function ConversationItem({ 
    conversation, 
    isActive, 
    onClick, 
    currentUserId, 
    onlineUsers, 
    isPinned,
    onPin,
    onDelete,
    onBlock,
    isBlocked,
    theme: C = defaultTheme
}) {
    const otherUser = conversation.otherUser || conversation.participants?.find(p => p.id !== currentUserId);
    const lastMsg = conversation.last_message_preview || conversation.lastMessage;
    const isUnread = conversation.unreadCount > 0;
    
    // Real-time online status from Supabase Presence channel
    const isOtherOnline = onlineUsers?.has?.(otherUser?.id) || false;
    
    // Conversation context menu (long-press on mobile)
    const [showConvoMenu, setShowConvoMenu] = useState(false);
    const convoLongPress = useRef(null);
    const convoTouchMoved = useRef(false);

    useEffect(() => {
        if (!showConvoMenu) return;
        const handleClickAway = () => setShowConvoMenu(false);
        const t = setTimeout(() => document.addEventListener('click', handleClickAway), 50);
        return () => { clearTimeout(t); document.removeEventListener('click', handleClickAway); };
    }, [showConvoMenu]);

    return (
        <div
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                cursor: 'pointer',
                background: isActive ? C.hoverBg : 'transparent',
                borderRadius: 8,
                margin: '2px 8px',
                transition: 'background 0.15s',
                position: 'relative',
            }}
            onMouseEnter={e => !isActive && (e.currentTarget.style.background = C.hoverBg)}
            onMouseLeave={e => { !isActive && (e.currentTarget.style.background = 'transparent'); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setShowConvoMenu(true); }}
            onTouchStart={() => {
                convoTouchMoved.current = false;
                convoLongPress.current = setTimeout(() => {
                    if (!convoTouchMoved.current) {
                        setShowConvoMenu(true);
                        if (navigator.vibrate) navigator.vibrate(25);
                    }
                }, 500);
            }}
            onTouchMove={() => { convoTouchMoved.current = true; clearTimeout(convoLongPress.current); }}
            onTouchEnd={() => clearTimeout(convoLongPress.current)}
        >
            {/* Conversation context menu */}
            {showConvoMenu && (
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'absolute',
                        top: 0,
                        right: 8,
                        background: C.card,
                        borderRadius: 10,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                        zIndex: 50,
                        minWidth: 160,
                        overflow: 'hidden',
                    }}
                >
                    <button
                        onClick={() => { onPin?.(conversation.id); setShowConvoMenu(false); }}
                        style={{ display: 'block', width: '100%', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: C.text, fontSize: 14 }}
                        onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >{isPinned ? 'Unpin' : 'Pin To Top'}</button>
                    {/* Blocking had no control anywhere in this messenger, so
                        messenger_blocked was empty and the server-side
                        enforcement in send-message / start-conversation had
                        nothing to enforce. Group threads have no single other
                        party, so the action is offered only on direct ones. */}
                    {otherUser?.id && !conversation.is_group && (
                        <button
                            onClick={() => { onBlock?.(otherUser.id, !isBlocked); setShowConvoMenu(false); }}
                            style={{ display: 'block', width: '100%', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: isBlocked ? C.text : C.red, fontSize: 14 }}
                            onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >{isBlocked ? 'Unblock' : 'Block'}</button>
                    )}
                    <button
                        onClick={() => { onDelete?.(conversation.id); setShowConvoMenu(false); }}
                        style={{ display: 'block', width: '100%', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: C.red, fontSize: 14 }}
                        onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >Delete Conversation</button>
                </div>
            )}

            <Avatar
                src={otherUser?.avatar_url}
                name={otherUser?.full_name || otherUser?.display_name || otherUser?.username || otherUser?.name}
                size={56}
                online={isOtherOnline}
                theme={C}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontWeight: isUnread ? 600 : 500,
                    fontSize: 15,
                    color: C.text,
                    marginBottom: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                }}>
                    {isPinned && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill={C.blue} style={{ flexShrink: 0, opacity: 0.7 }}>
                            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                        </svg>
                    )}
                    {otherUser?.full_name || otherUser?.display_name || otherUser?.username || otherUser?.name || 'Unknown'}
                </div>
                <div style={{
                    fontSize: 13,
                    color: isUnread ? C.text : C.textSec,
                    fontWeight: isUnread ? 500 : 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}>
                    {(() => {
                        let preview = lastMsg || '';

                        if (preview.startsWith('[LIVE_INVITE]')) {
                            return '🎥 Live Stream Invite';
                        }

                        if (preview.startsWith('[CALL_RECEIPT]')) {
                            const rawReceipt = preview.replace('[CALL_RECEIPT]', '');
                            try {
                                const rd = JSON.parse(rawReceipt);
                                const tp = rd.type === 'video' ? '📹' : '📞';
                                const st = rd.status || 'completed';
                                const dur = rd.duration || 0;
                                const durStr = dur > 0 ? (dur >= 60 ? ` • ${Math.floor(dur / 60)}m ${dur % 60}s` : ` • ${dur}s`) : '';
                                const callTypeName = rd.type === 'video' ? 'Video Call' : 'Voice Call';
                                const statusLabel = st === 'completed' ? '' : st === 'missed' ? 'Missed ' : st === 'declined' ? 'Declined ' : 'Cancelled ';
                                preview = `${tp} ${statusLabel}${callTypeName}${durStr}`;
                            } catch (_) {
                                preview = rawReceipt; 
                            }
                        }

                        const displayText = preview.slice(0, 35) + (preview.length > 35 ? '...' : '');
                        return displayText;
                    })()}
                    <span style={{ color: C.textSec }}> · {timeAgo(conversation.last_message_at)}</span>
                </div>
            </div>

            {isUnread && (
                <div style={{
                    minWidth: 20,
                    height: 20,
                    borderRadius: 10,
                    background: C.blue,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '0 5px',
                }}>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</div>
            )}
        </div>
    );
}

ConversationItem.displayName = 'ConversationItem';
