import React, { useState, useEffect, useRef } from 'react';
import { defaultTheme } from './MessengerTheme';
import { Avatar } from './Avatar';
import { getAccessToken, authedFetch } from '../../lib/authUtils';

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏', '🎯', '💎', '♠️', '♥️'];
const linkPreviewCache = {}; // Module-level cache for link previews

function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 LINK PREVIEW CARD
// ═══════════════════════════════════════════════════════════════════════════
export function LinkPreviewCard({ url, isOwn, theme: C = defaultTheme }) {
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (!url || fetchedRef.current) return;
        fetchedRef.current = true;

        if (linkPreviewCache[url]) {
            setPreview(linkPreviewCache[url]);
            setLoading(false);
            return;
        }

        const fetchPreview = async () => {
            try {
                const token = getAccessToken();
                const resp = await authedFetch('/api/messenger/link-preview', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ url }),
                });
                const data = await resp.json();
                if (data.success && data.preview?.title) {
                    linkPreviewCache[url] = data.preview;
                    setPreview(data.preview);
                }
            } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            setLoading(false);
        };
        fetchPreview();
    }, [url]);

    if (loading || !preview) return null;

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
                display: 'block',
                marginTop: 8,
                borderRadius: 12,
                overflow: 'hidden',
                border: `1px solid ${isOwn ? 'rgba(255,255,255,0.2)' : C.border}`,
                background: isOwn ? 'rgba(255,255,255,0.1)' : '#FAFAFA',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
            {preview.image && (
                <img
                    src={preview.image}
                    alt={preview.title}
                    style={{
                        width: '100%',
                        height: 140,
                        objectFit: 'cover',
                        display: 'block',
                    }}
                    loading="lazy"
                    onError={e => { e.target.style.display = 'none'; }}
                />
            )}
            <div style={{ padding: '10px 12px' }}>
                <div style={{
                    fontSize: 11,
                    color: isOwn ? 'rgba(255,255,255,0.6)' : C.textSec,
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                }}>
                    {preview.favicon && (
                        <img
                            src={preview.favicon}
                            alt=""
                            style={{ width: 12, height: 12, borderRadius: 2 }}
                            onError={e => { e.target.style.display = 'none'; }}
                        />
                    )}
                    {preview.domain}
                </div>
                <div style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: isOwn ? 'white' : C.text,
                    lineHeight: 1.3,
                    marginBottom: preview.description ? 4 : 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                }}>
                    {preview.title}
                </div>
                {preview.description && (
                    <div style={{
                        fontSize: 12,
                        color: isOwn ? 'rgba(255,255,255,0.7)' : C.textSec,
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                    }}>
                        {preview.description}
                    </div>
                )}
            </div>
        </a>
    );
}
LinkPreviewCard.displayName = 'LinkPreviewCard';

// ═══════════════════════════════════════════════════════════════════════════
// 💬 MESSAGE CONTENT (MARKDOWN/HTML DETECTOR)
// ═══════════════════════════════════════════════════════════════════════════
export function MessageContent({ content }) {
    if (!content || typeof content !== 'string') return <span>{content}</span>;

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

    const isForwarded = content.startsWith('[Forwarded] ');
    const displayContent = isForwarded ? content.slice(12) : content;
    
    const parts = displayContent.split(URL_REGEX);
    if (parts.length === 1 && !isForwarded) return <span>{content}</span>;
    
    return (
        <span>
            {isForwarded && <span style={{ display: 'block', fontSize: 11, color: '#58a6ff', marginBottom: 4, fontStyle: 'italic' }}>Forwarded</span>}
            {parts.map((part, i) => {
                URL_REGEX.lastIndex = 0; 
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
                            onClick={e => e.stopPropagation()}
                        >
                            {part}
                        </a>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔊 AUDIO MESSAGE (VOICE MESSAGE PLAYER)
// ═══════════════════════════════════════════════════════════════════════════
export function AudioMessage({ src, isOwn, duration: durationProp, theme: C = defaultTheme }) {
    const audioRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(durationProp || 0);
    const animFrameRef = useRef(null);

    const togglePlay = (e) => {
        e.stopPropagation();
        if (!audioRef.current) return;
        if (playing) {
            audioRef.current.pause();
            setPlaying(false);
            cancelAnimationFrame(animFrameRef.current);
        } else {
            audioRef.current.play().catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
            setPlaying(true);
            const tick = () => {
                if (audioRef.current) {
                    setProgress(audioRef.current.currentTime / (audioRef.current.duration || 1));
                }
                animFrameRef.current = requestAnimationFrame(tick);
            };
            tick();
        }
    };

    const handleEnded = () => {
        setPlaying(false);
        setProgress(0);
        cancelAnimationFrame(animFrameRef.current);
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current?.duration && isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
        }
    };

    const formatDur = (s) => {
        if (!s || !isFinite(s)) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const bars = useRef(
        Array.from({ length: 28 }, (_, i) => {
            const seed = (i * 2654435761) >>> 0;
            return 0.2 + (seed % 100) / 100 * 0.8;
        })
    );

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 200,
            padding: '4px 0',
        }}>
            <audio
                ref={audioRef}
                src={src}
                preload="metadata"
                onEnded={handleEnded}
                onLoadedMetadata={handleLoadedMetadata}
            />
            <button
                onClick={togglePlay}
                style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    border: 'none',
                    background: isOwn ? 'rgba(255,255,255,0.25)' : C.blue,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'transform 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
                {playing ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                )}
            </button>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 1, height: 24 }}>
                    {bars.current.map((h, i) => {
                        const filled = i / bars.current.length <= progress;
                        return (
                            <div
                                key={i}
                                style={{
                                    width: 3,
                                    height: `${h * 100}%`,
                                    borderRadius: 2,
                                    background: filled
                                        ? (isOwn ? 'white' : C.blue)
                                        : (isOwn ? 'rgba(255,255,255,0.3)' : '#D0D0D0'),
                                    transition: 'background 0.1s',
                                }}
                            />
                        );
                    })}
                </div>
                <span style={{
                    fontSize: 11,
                    color: isOwn ? 'rgba(255,255,255,0.7)' : C.textSec,
                }}>
                    {playing ? formatDur(audioRef.current?.currentTime || 0) : formatDur(duration)}
                </span>
            </div>
        </div>
    );
}
AudioMessage.displayName = 'AudioMessage';

// ═══════════════════════════════════════════════════════════════════════════
// CLUB STATEMENT CARD
// ═══════════════════════════════════════════════════════════════════════════
// The union's weekly square-up, delivered into this club's inbox by
// fn_union_send_club_message as message_type 'invoice'. The readable body is
// in content; every figure is also in media_metadata.lines, so this renders
// the numbers rather than re-parsing prose. Anything that does not recognise
// the type still shows the text, which is why both are sent.
const statementMoney = (n) => {
    const v = Number(n || 0);
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export function ClubStatementCard({ meta, isOwn, theme: C = defaultTheme }) {
    const [open, setOpen] = useState(false);
    const lines = meta?.lines || {};
    const outstanding = Number(meta?.outstanding || 0);
    const owes = outstanding < 0;
    const accent = outstanding === 0 ? C.textSec : owes ? '#E41E3F' : '#31A24C';
    const label = outstanding === 0 ? 'Square for the week' : owes ? 'Amount due' : 'Owed to you';

    const period = [meta?.period_start, meta?.period_end]
        .map((d) => (d ? String(d).slice(0, 10) : null))
        .filter(Boolean)
        .join(' to ');

    const row = (text, value, note) => (
        <div key={text} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 12 }}>
            <span style={{ color: isOwn ? 'rgba(255,255,255,0.75)' : C.textSec }}>
                {text}
                {note ? <span style={{ opacity: 0.7 }}> {note}</span> : null}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: isOwn ? '#fff' : C.text }}>
                {statementMoney(value)}
            </span>
        </div>
    );

    return (
        <div
            style={{
                minWidth: 240,
                maxWidth: 320,
                borderRadius: 10,
                overflow: 'hidden',
                border: `1px solid ${isOwn ? 'rgba(255,255,255,0.22)' : C.border || 'rgba(0,0,0,0.12)'}`,
                background: isOwn ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
            }}
        >
            <div style={{ padding: '10px 12px', borderBottom: `1px solid ${isOwn ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)'}` }}>
                <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: isOwn ? 'rgba(255,255,255,0.7)' : C.textSec }}>
                    Weekly statement
                </div>
                {period ? (
                    <div style={{ fontSize: 11, marginTop: 2, color: isOwn ? 'rgba(255,255,255,0.7)' : C.textSec }}>{period}</div>
                ) : null}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 11, color: isOwn ? 'rgba(255,255,255,0.75)' : C.textSec }}>{label}</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: accent, fontVariantNumeric: 'tabular-nums' }}>
                        {statementMoney(Math.abs(outstanding))}
                    </span>
                </div>
                {meta?.due_at && outstanding !== 0 ? (
                    <div style={{ fontSize: 11, marginTop: 2, color: isOwn ? 'rgba(255,255,255,0.6)' : C.textSec }}>
                        Due {String(meta.due_at).slice(0, 10)}
                    </div>
                ) : null}
            </div>

            {open ? (
                <div style={{ padding: '8px 12px 10px' }}>
                    {row('Rake generated', lines.rake_generated)}
                    {row('Your rakeback', lines.rakeback_due, '(90%)')}
                    {row('Union fee kept', lines.union_fee_kept, '(10%)')}
                    {row('Player win/loss', lines.players_won)}
                    {row('Settled in chips', lines.settled_in_chips)}
                    {lines.eco_enabled ? row('ECO adjustment', lines.eco_amount) : null}
                    {Number(lines.presettled || 0) !== 0 ? row('Payments received', lines.presettled) : null}
                    <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.45, color: isOwn ? 'rgba(255,255,255,0.65)' : C.textSec }}>
                        Player win/loss and rakeback already moved in chips during the week.
                        The amount above is what is left to square up.
                    </div>
                </div>
            ) : null}

            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    borderTop: `1px solid ${isOwn ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)'}`,
                    color: isOwn ? '#fff' : C.blue,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                }}
            >
                {open ? 'Hide breakdown' : 'View breakdown'}
            </button>
        </div>
    );
}
ClubStatementCard.displayName = 'ClubStatementCard';

// ═══════════════════════════════════════════════════════════════════════════
// 💬 MESSAGE BUBBLE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function MessageBubble({ 
    message, 
    isOwn, 
    showAvatar, 
    sender, 
    showTime, 
    isLastInGroup, 
    onRetry, 
    onReact, 
    onDelete, 
    onEdit, 
    onForward, 
    onCallBack, 
    onReply, 
    onUnsend, 
    currentUserId,
    theme: C = defaultTheme 
}) {
    if (!message) return null;
    const senderIsVip = sender?.is_vip || false;
    const [showReactions, setShowReactions] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [reactions, setReactions] = useState(message.reactions || []);

    // Reactions used to exist only as optimistic local state, because
    // /api/messenger/get-messages never returned them. It does now, so the
    // bubble has to adopt what the server says - otherwise a reload would
    // still show nothing. Keyed on the serialised value so a fresh array
    // identity from the API mapping does not loop.
    const reactionsKey = JSON.stringify(message.reactions || []);
    useEffect(() => {
        setReactions(message.reactions || []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reactionsKey]);
    const status = message.status || 'sent';
    const longPressTimer = useRef(null);
    const touchMoved = useRef(false);

    const handleTouchStart = (e) => {
        touchMoved.current = false;
        longPressTimer.current = setTimeout(() => {
            if (!touchMoved.current) {
                setShowReactions(true);
                if (navigator.vibrate) navigator.vibrate(30);
            }
        }, 400);
    };

    const handleTouchMove = () => {
        touchMoved.current = true;
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    useEffect(() => {
        if (!showReactions && !showMenu) return;
        const dismiss = () => { setShowReactions(false); setShowMenu(false); };
        const t = setTimeout(() => document.addEventListener('click', dismiss), 50);
        return () => { clearTimeout(t); document.removeEventListener('click', dismiss); };
    }, [showReactions, showMenu]);

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
        if (status === 'delivered') {
            return <span style={{ color: '#31A24C', fontSize: 10 }} title="Delivered">{'\u2713\u2713'}</span>;
        }
        return <span style={{ color: '#65676B', fontSize: 10 }} title="Sent">{'\u2713'}</span>;
    };

    const handleReaction = async (emoji) => {
        const hasReaction = reactions.some(r => r.reaction === emoji && r.user_id === currentUserId);
        if (hasReaction) {
            setReactions(prev => prev.filter(r => !(r.reaction === emoji && r.user_id === currentUserId)));
        } else {
            setReactions(prev => [...prev, { reaction: emoji, user_id: currentUserId }]);
        }
        setShowReactions(false);
        if (navigator.vibrate) navigator.vibrate(15);

        if (onReact) {
            await onReact(message.id, emoji);
        }
    };

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
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {!isOwn && (
                showAvatar ? (
                    <Avatar src={sender?.avatar_url} name={sender?.username} size={28} showOnline={false} theme={C} />
                ) : (
                    <div style={{ width: 28 }} />
                )
            )}

            <div style={{ position: 'relative', maxWidth: '70%' }}>
                {showReactions && status !== 'sending' && (
                    <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: isOwn ? 'auto' : 0,
                        right: isOwn ? 0 : 'auto',
                        marginBottom: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        background: C.card,
                        borderRadius: 24,
                        padding: '6px 8px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                        zIndex: 50,
                        animation: 'reactionPopIn 0.18s ease-out',
                    }}>
                        {REACTION_EMOJIS.map(emoji => (
                            <button
                                key={emoji}
                                onClick={(e) => { e.stopPropagation(); handleReaction(emoji); }}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: 22,
                                    padding: '4px 5px',
                                    borderRadius: 8,
                                    transition: 'transform 0.15s, background 0.15s',
                                    lineHeight: 1,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.35)'; e.currentTarget.style.background = C.hoverBg; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'transparent'; }}
                            >{emoji}</button>
                        ))}
                        <>
                            <div style={{ width: 1, height: 24, background: C.border, margin: '0 2px' }} />
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: 16,
                                    padding: '4px 6px',
                                    color: C.textSec,
                                    borderRadius: 8,
                                }}
                            >⋯</button>
                        </>
                    </div>
                )}

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
                        {!message.is_deleted && (
                            <button
                                onClick={() => {
                                    const text = message.content || message.text || '';
                                    navigator.clipboard?.writeText(text).then(() => {
                                        if (navigator.vibrate) navigator.vibrate(10);
                                    }).catch(e => console.warn('[App] Handled exception:', e?.message || e));
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
                            >Copy Text</button>
                        )}
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
                        {!message.is_deleted && (
                        <button
                            onClick={() => {
                                onReply?.(message);
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
                                color: C.textSec,
                                fontSize: 14,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >Reply</button>
                        )}
                        {isOwn && !message.is_deleted && (Date.now() - new Date(message.created_at).getTime()) < 120000 && (
                        <button
                            onClick={() => {
                                onUnsend?.(message.id);
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
                                color: '#FF6B00',
                                fontSize: 14,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >Unsend</button>
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
                    {(() => {
                        const content = message.content || message.text || '';
                        const replyMatch = content.match(/^\[REPLY:([^\]]+)\]/);
                        if (replyMatch) {
                            const replyText = replyMatch[1];
                            return (
                                <div style={{
                                    padding: '6px 10px',
                                    marginBottom: 6,
                                    borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.5)' : C.blue}`,
                                    borderRadius: '0 8px 8px 0',
                                    background: isOwn ? 'rgba(255,255,255,0.12)' : 'rgba(0,132,255,0.08)',
                                    fontSize: 12,
                                    lineHeight: 1.3,
                                    color: isOwn ? 'rgba(255,255,255,0.8)' : C.textSec,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 250,
                                }}>
                                    {replyText.length > 60 ? replyText.slice(0, 60) + '...' : replyText}
                                </div>
                            );
                        }
                        return null;
                    })()}
                    {(() => {
                        let content = message.content || message.text || '';
                        content = content.replace(/^\[REPLY:[^\]]+\]\s*/, '');

                        // Union weekly square-up, delivered into the club inbox.
                        const meta = message.media_metadata || message.metadata;
                        if (message.message_type === 'invoice' && meta?.kind === 'union_invoice') {
                            return <ClubStatementCard meta={meta} isOwn={isOwn} theme={C} />;
                        }

                        // 2026-08-15 audit: render live co-host invites as a
                        // tappable Join card instead of raw "[LIVE_INVITE]room=…"
                        // text, so acceptance works from the message thread (not
                        // only the transient realtime toast).
                        if (content.startsWith('[LIVE_INVITE]')) {
                            const qs = content.replace('[LIVE_INVITE]', '').trim();
                            const joinHref = `/hub/live/guest?${qs}`;
                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                                    <span style={{ fontSize: 24 }}>🎥</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600 }}>Live co-host invite</div>
                                        <div style={{ fontSize: 12, opacity: 0.8 }}>Tap to join the live stream</div>
                                    </div>
                                    {!isOwn && (
                                        <a
                                            href={joinHref}
                                            onClick={(e) => { e.stopPropagation(); }}
                                            style={{
                                                marginLeft: 'auto', textDecoration: 'none',
                                                background: C.blue, color: 'white', borderRadius: 16,
                                                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                                            }}
                                        >Join Live</a>
                                    )}
                                </div>
                            );
                        }

                        if (content.startsWith('[CALL_RECEIPT]')) {
                            const raw = content.replace('[CALL_RECEIPT]', '');
                            let receiptData = null;
                            let legacyStr = null;
                            try {
                                receiptData = JSON.parse(raw);
                            } catch (_) {
                                legacyStr = raw.replace(/Video call/i, 'Video Call').replace(/Voice call/i, 'Voice Call');
                            }
                            const callData = receiptData || {};
                            const callType = callData.type || 'voice';
                            const callDuration = callData.duration || 0;
                            const callStatus = callData.status || 'completed';

                            const durationStr = callDuration > 0
                                ? (callDuration >= 60
                                    ? ` • ${Math.floor(callDuration / 60)}m ${callDuration % 60}s`
                                    : ` • ${callDuration}s`)
                                : '';

                            const icon = callType === 'video' ? '📹' : '📞';
                            const title = callType === 'video' ? 'Video Call' : 'Voice Call';
                            const statusText = callStatus === 'completed'
                                ? 'Call ended'
                                : callStatus === 'missed'
                                    ? 'Missed call'
                                    : callStatus === 'declined'
                                        ? 'Declined call'
                                        : 'Cancelled call';

                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                                    <span style={{ fontSize: 24 }}>{icon}</span>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{legacyStr || title}</div>
                                        <div style={{ fontSize: 12, opacity: 0.8 }}>{legacyStr ? '' : statusText}{durationStr}</div>
                                    </div>
                                    {callStatus === 'missed' && !isOwn && onCallBack && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onCallBack(callType); }}
                                            style={{
                                                marginLeft: 'auto',
                                                border: 'none',
                                                background: isOwn ? 'rgba(255,255,255,0.2)' : C.blue,
                                                color: isOwn ? 'white' : 'white',
                                                borderRadius: 16,
                                                padding: '6px 12px',
                                                fontSize: 12,
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                            }}
                                        >Call Back</button>
                                    )}
                                </div>
                            );
                        }

                        if (content.startsWith('[MEDIA]')) {
                            const rawMedia = content.replace('[MEDIA]', '');
                            let mediaUrl = rawMedia;
                            let mediaType = 'image';
                            try {
                                const parsed = JSON.parse(rawMedia);
                                mediaUrl = parsed.url;
                                mediaType = parsed.type || 'image';
                            } catch (_) { /* legacy plain URL fallback */ }

                            if (mediaType === 'video') {
                                return (
                                    <video
                                        src={mediaUrl}
                                        controls
                                        style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, display: 'block' }}
                                        onClick={e => e.stopPropagation()}
                                        preload="metadata"
                                    />
                                );
                            }
                            return (
                                <img
                                    src={mediaUrl}
                                    alt="Uploaded Media"
                                    style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, display: 'block', cursor: 'zoom-in' }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(mediaUrl, '_blank');
                                    }}
                                    loading="lazy"
                                />
                            );
                        }

                        if (content.startsWith('[AUDIO]')) {
                            const audioUrl = content.replace('[AUDIO]', '');
                            return <AudioMessage src={audioUrl} isOwn={isOwn} theme={C} />;
                        }

                        if (message.is_deleted) {
                            return (
                                <span style={{ fontStyle: 'italic', opacity: 0.7 }}>
                                    {isOwn ? 'You unsent a message' : 'This message was unsent'}
                                </span>
                            );
                        }

                        return <MessageContent content={content} />;
                    })()}
                    {(() => {
                        let content = message.content || message.text || '';
                        content = content.replace(/^\[REPLY:[^\]]+\]\s*/, '');
                        if (message.is_deleted || content.startsWith('[MEDIA]') || content.startsWith('[AUDIO]') || content.startsWith('[CALL_RECEIPT]') || content.startsWith('[LIVE_INVITE]')) {
                            return null;
                        }
                        const urls = content.match(URL_REGEX);
                        if (urls && urls.length > 0) {
                            return <LinkPreviewCard url={urls[0]} isOwn={isOwn} theme={C} />;
                        }
                        return null;
                    })()}
                </div>

                {reactions.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        bottom: -10,
                        [isOwn ? 'left' : 'right']: 10,
                        background: C.card,
                        borderRadius: 12,
                        padding: '2px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        border: `1px solid ${C.border}`,
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

MessageBubble.displayName = 'MessageBubble';
