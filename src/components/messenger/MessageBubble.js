import React, { useState, useEffect } from 'react';
import C from './MessengerTheme';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏', '🎯', '💎', '♠️', '♥️'];

function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

function MessageContent({ content }) {
    if (!content || typeof content !== 'string') return <span>{content}</span>;

    // GIF message: [GIF](url)
    const gifMatch = content.match(/^\[GIF\]\((.+?)\)$/);
    if (gifMatch) {
        return (
            <img
                src={gifMatch[1]}
                alt="GIF"
                style={{ maxWidth: 260, maxHeight: 260, borderRadius: 8, display: 'block' }}
                loading="lazy"
            />
        );
    }

    // Forwarded message prefix
    const isForwarded = content.startsWith('[Forwarded] ');
    const displayContent = isForwarded ? content.slice(12) : content;
    
    const parts = displayContent.split(URL_REGEX);
    if (parts.length === 1 && !isForwarded) return <span>{content}</span>;
    
    return (
        <span>
            {isForwarded && <span style={{ display: 'block', fontSize: 11, color: '#58a6ff', marginBottom: 4, fontStyle: 'italic' }}>Forwarded</span>}
            {parts.map((part, i) => {
                URL_REGEX.lastIndex = 0; // Reset BEFORE test to prevent alternate-skip
                if (URL_REGEX.test(part)) {
                    return (
                        <a
                            key={i}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: '#58a6ff',
                                textDecoration: 'underline',
                                wordBreak: 'break-all',
                            }}
                        >{part}</a>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MESSAGE BUBBLE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════


function MessageBubble({ message, isOwn, showAvatar, sender, showTime, isLastInGroup, onRetry, onReact, onDelete, onEdit, onForward, currentUserId }) {
    const senderIsVip = sender?.is_vip || false;
    const [showReactions, setShowReactions] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [reactions, setReactions] = useState(message.reactions || []);
    const status = message.status || 'sent';

    const StatusIcon = () => {
        if (!isOwn) return null;
        if (status === 'sending') return <span style={{ opacity: 0.7, fontSize: 10 }}>○</span>;
        if (status === 'failed') return (
            <span
                onClick={() => onRetry?.(message)}
                style={{ color: '#E41E3F', fontSize: 10, cursor: 'pointer' }}
                title="Failed - Tap To Retry"
            >⚠</span>
        );
        if (status === 'read' || message.is_read) {
            return <span style={{ color: '#0084FF', fontSize: 10 }} title="Read">{'\u2713\u2713'}</span>;
        }
        // Delivered/sent
        return <span style={{ color: '#31A24C', fontSize: 10 }} title="Delivered">{'\u2713'}</span>;
    };

    const handleReaction = async (emoji) => {
        // Optimistic update
        const hasReaction = reactions.some(r => r.reaction === emoji && r.user_id === currentUserId);
        if (hasReaction) {
            setReactions(prev => prev.filter(r => !(r.reaction === emoji && r.user_id === currentUserId)));
        } else {
            setReactions(prev => [...prev, { reaction: emoji, user_id: currentUserId }]);
        }
        setShowReactions(false);

        // Call parent handler for DB persistence
        if (onReact) {
            await onReact(message.id, emoji);
        }
    };


    // Note: Delete is handled inline via the context menu buttons below,
    // which call onDelete(message.id, 'for_me'|'for_everyone') directly.

    // Group reactions by emoji
    const groupedReactions = reactions.reduce((acc, r) => {
        acc[r.reaction] = (acc[r.reaction] || 0) + 1;
        return acc;
    }, {});

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: isOwn ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: 8,
                marginBottom: isLastInGroup ? 16 : 2,
                paddingLeft: isOwn ? 60 : 12,
                paddingRight: isOwn ? 12 : 60,
                opacity: status === 'sending' ? 0.7 : 1,
                position: 'relative',
            }}
            onMouseEnter={() => setShowReactions(true)}
            onMouseLeave={() => { setShowReactions(false); setShowMenu(false); }}
        >
            {/* Avatar */}
            {!isOwn && (
                showAvatar ? (
                    <img src={sender?.avatar_url || '/default-avatar.png'} alt={sender?.username || 'User'} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} loading="lazy" />
                ) : (
                    <div style={{ width: 28 }} />
                )
            )}

            {/* Bubble with reactions */}
            <div style={{ position: 'relative', maxWidth: '70%' }}>
                {/* Reaction picker */}
                {showReactions && status !== 'sending' && (
                    <div style={{
                        position: 'absolute',
                        [isOwn ? 'left' : 'right']: '100%',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        marginLeft: isOwn ? 0 : 4,
                        marginRight: isOwn ? 4 : 0,
                        display: 'flex',
                        gap: 2,
                        background: C.card,
                        borderRadius: 16,
                        padding: '4px 6px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        zIndex: 10,
                        flexWrap: 'wrap',
                        maxWidth: 200,
                    }}>
                        {REACTION_EMOJIS.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => handleReaction(emoji)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: 18,
                                    padding: '3px 4px',
                                    borderRadius: 6,
                                    transition: 'transform 0.15s, background 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.25)'; e.currentTarget.style.background = C.hoverBg; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'transparent'; }}
                            >{emoji}</button>
                        ))}
                        {/* Context menu trigger — shows on all messages */}
                        <>
                            <div style={{ width: 1, background: C.border, margin: '4px 2px' }} />
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    padding: 4,
                                    color: C.textSec,
                                }}
                            >⋯</button>
                        </>
                    </div>
                )}

                {/* Context menu for own messages */}
                {showMenu && (
                    <div style={{
                        position: 'absolute',
                        [isOwn ? 'left' : 'right']: '100%',
                        top: '100%',
                        marginLeft: isOwn ? 0 : 4,
                        background: C.card,
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        overflow: 'hidden',
                        zIndex: 20,
                        minWidth: 180,
                    }}>
                        <button
                            onClick={() => {
                                onDelete(message.id, 'for_me');
                                setShowMenu(false);
                            }}
                            style={{
                                display: 'block',
                                width: '100%',
                                padding: '10px 16px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                color: C.text,
                                fontSize: 14,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >Delete For Me</button>
                        {isOwn && !message.is_deleted && (Date.now() - new Date(message.created_at).getTime()) < 300000 && (
                            <button
                                onClick={() => {
                                    onEdit?.(message);
                                    setShowMenu(false);
                                }}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    padding: '10px 16px',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    color: C.text,
                                    fontSize: 14,
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >Edit Message</button>
                        )}
                        {!message.is_deleted && (
                            <button
                                onClick={() => {
                                    onForward?.(message);
                                    setShowMenu(false);
                                }}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    padding: '10px 16px',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    color: C.blue,
                                    fontSize: 14,
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >Forward</button>
                        )}
                        {isOwn && (
                        <button
                            onClick={() => {
                                onDelete(message.id, 'for_everyone');
                                setShowMenu(false);
                            }}
                            style={{
                                display: 'block',
                                width: '100%',
                                padding: '10px 16px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                color: C.red,
                                fontSize: 14,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >Delete For Everyone</button>
                        )}
                    </div>
                )}

                <div style={{
                    padding: '8px 12px',
                    borderRadius: 18,
                    background: isOwn ? C.ownBubble : (senderIsVip ? 'linear-gradient(135deg, rgba(255,215,0,0.08), rgba(255,215,0,0.03))' : C.otherBubble),
                    color: isOwn ? 'white' : C.text,
                    fontSize: 15,
                    lineHeight: 1.4,
                    borderBottomRightRadius: isOwn && !isLastInGroup ? 4 : 18,
                    borderBottomLeftRadius: !isOwn && !isLastInGroup ? 4 : 18,
                    wordBreak: 'break-word',
                    overflow: 'hidden',
                    ...(senderIsVip && !isOwn ? {
                        borderLeft: '3px solid #FFD700',
                        boxShadow: '0 0 6px rgba(255,215,0,0.15)',
                    } : {}),
                }}>
                    {/* Render media content (images/videos) */}
                    {(() => {
                        const content = message.content || message.text || '';

                        // Check for call receipt: [CALL_RECEIPT]📹 Video call • 2m 15s
                        if (content.startsWith('[CALL_RECEIPT]')) {
                            const callInfo = content.replace('[CALL_RECEIPT]', '');
                            return (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '4px 8px',
                                    color: C.muted,
                                    fontSize: 13,
                                    opacity: 0.9,
                                }}>
                                    {callInfo}
                                </div>
                            );
                        }

                        // Check for live invite: [LIVE_INVITE]room=...&invite=...
                        if (content.startsWith('[LIVE_INVITE]')) {
                            const qs = content.replace('[LIVE_INVITE]', '');
                            const joinUrl = `/hub/live/guest?${qs}`;
                            return (
                                <div style={{
                                    background: isOwn ? 'rgba(255,255,255,0.1)' : 'rgba(0,132,255,0.1)',
                                    borderRadius: 12,
                                    padding: 16,
                                    textAlign: 'center',
                                    border: `1px solid ${isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(0,132,255,0.3)'}`,
                                }}>
                                    <div style={{ fontSize: 24, marginBottom: 8 }}>🎥</div>
                                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Live Stream Invite</div>
                                    <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>You have been invited to join as a guest co-host.</div>
                                    <button 
                                        onClick={() => window.location.href = joinUrl}
                                        style={{
                                            background: '#FA383E',
                                            color: '#fff',
                                            border: 'none',
                                            padding: '8px 16px',
                                            borderRadius: 8,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            width: '100%',
                                        }}
                                    >
                                        Join Stream
                                    </button>
                                </div>
                            );
                        }


                        // Check for image markdown: [Image](url) or 📷 [Image](url) - support both
                        const imageMatch = content.match(/(?:📷\s*)?\[Image\]\(([^)]+)\)/);
                        const imageUrl = imageMatch?.[1] || message.media_url;

                        // Check for video markdown: [Video](url) or  [Video](url) - support both
                        const videoMatch = content.match(/(?:\s*)?\[Video\]\(([^)]+)\)/);
                        const videoUrl = videoMatch?.[1];

                        // Check if content is just a direct image/video URL
                        const directImageUrl = content.match(/^https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)(\?[^\s]*)?$/i);
                        const directVideoUrl = content.match(/^https?:\/\/[^\s]+\.(mp4|webm|mov)(\?[^\s]*)?$/i);

                        if (imageUrl || directImageUrl) {
                            const url = imageUrl || directImageUrl[0];
                            return (
                                <div style={{ margin: '-8px -12px', borderRadius: 18, overflow: 'hidden' }}>
                                    <img
                                        src={url}
                                        alt="Shared Image"
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: 300,
                                            display: 'block',
                                            borderRadius: 12,
                                            cursor: 'pointer',
                                        }}
                                        onClick={() => window.open(url, '_blank')}
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.insertAdjacentHTML('afterend', '<span>Image Failed To Load</span>');
                                        }}
                                    />
                                </div>
                            );
                        }

                        if (videoUrl || directVideoUrl) {
                            const url = videoUrl || directVideoUrl[0];
                            return (
                                <div style={{ margin: '-8px -12px', borderRadius: 18, overflow: 'hidden' }}>
                                    <video
                                        src={url}
                                        controls
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: 300,
                                            display: 'block',
                                            borderRadius: 12,
                                        }}
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.insertAdjacentHTML('afterend', '<span>Video Failed To Load</span>');
                                        }}
                                    />
                                </div>
                            );
                        }

                        // Regular text content - make URLs clickable
                        // Check if it's a call invite
                        const isCallInvite = content.includes('[CALL_RECEIPT]') || (content.includes('Call Started!') && content.includes('smarter-poker'));

                        // Convert URLs to clickable links
                        const urlRegex = /(https?:\/\/[^\s]+)/g;
                        const parts = content.split(urlRegex);

                        return (
                            <div style={isCallInvite ? {
                                background: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(0,132,255,0.1)',
                                padding: 8,
                                borderRadius: 12,
                                margin: '-4px -8px',
                            } : {}}>
                                {parts.map((part, i) => {
                                    urlRegex.lastIndex = 0; // Reset BEFORE test to prevent alternate-skip
                                    if (urlRegex.test(part)) {
                                        return (
                                            <a
                                                key={i}
                                                href={part}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    color: isOwn ? '#90CAF9' : C.blue,
                                                    textDecoration: 'underline',
                                                    wordBreak: 'break-all',
                                                }}
                                            >
                                                {part.includes('meet.jit.si') ? '🔗 Join Call' : part}
                                            </a>
                                        );
                                    }
                                    // Preserve newlines
                                    return part.split('\n').map((line, j) => (
                                        <span key={`${i}-${j}`}>
                                            {j > 0 && <br />}
                                            {line}
                                        </span>
                                    ));
                                })}
                            </div>
                        );
                    })()}
                </div>

                {/* Display reactions */}
                {Object.keys(groupedReactions || {}).length > 0 && (
                    <div style={{
                        position: 'absolute',
                        bottom: -8,
                        [isOwn ? 'left' : 'right']: 8,
                        display: 'flex',
                        gap: 2,
                        background: C.card,
                        borderRadius: 10,
                        padding: '2px 4px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                        fontSize: 12,
                    }}>
                        {Object.entries(groupedReactions || {}).map(([emoji, count]) => (
                            <span key={emoji} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {emoji}{count > 1 && <span style={{ fontSize: 10, color: C.textSec }}>{count}</span>}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Time & Status */}
            {showTime && (
                <span style={{
                    fontSize: 11,
                    color: C.textSec,
                    whiteSpace: 'nowrap',
                    alignSelf: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                }}>
                    {message.is_edited && !message.is_deleted && <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Edited · </span>}
                    {formatMessageTime(message.created_at || message.timestamp)}
                    <StatusIcon />
                </span>
            )}
        </div>
    );
}

export { MessageContent, MessageBubble };
export default MessageBubble;
