/**
 * InviteFriendsModal — Share & Referral System
 * ═══════════════════════════════════════════════════════════════
 * Full-featured invite modal with 10 share channels:
 * Copy Link, Native Share, Email, SMS, Facebook, X, WhatsApp,
 * Telegram, LinkedIn, Reddit
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Share channel configurations
const SHARE_MESSAGE = "Join me on Smarter.Poker — the ultimate poker training platform! Use my referral link to get 500 free diamonds on signup!";
const SHARE_TITLE = "Join Smarter.Poker — Get 500 Free Diamonds!";

export default function InviteFriendsModal({
    isOpen,
    onClose,
    user,
    contacts = [],
    onOpenChat = () => { },
    onSearch = () => { },
    searchResults = []
}) {
    const [playerNumber, setPlayerNumber] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [canNativeShare, setCanNativeShare] = useState(false);
    const [q, setQ] = useState('');

    // Check native share support
    useEffect(() => {
        setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share);
    }, []);

    // Fetch player number on open
    useEffect(() => {
        if (!isOpen || !user?.id) return;
        setLoading(true);
        supabase
            .from('profiles')
            .select('player_number')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
                setPlayerNumber(data?.player_number || null);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [isOpen, user?.id]);

    const referralUrl = playerNumber
        ? `https://smarter.poker/auth/signup?ref=${playerNumber}`
        : 'https://smarter.poker';

    const fullMessage = `${SHARE_MESSAGE}\n\n${referralUrl}`;

    // Copy link handler
    const handleCopyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(referralUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = referralUrl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    }, [referralUrl]);

    // Native share handler
    const handleNativeShare = useCallback(async () => {
        try {
            await navigator.share({
                title: SHARE_TITLE,
                text: SHARE_MESSAGE,
                url: referralUrl,
            });
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Share failed:', err);
            }
        }
    }, [referralUrl]);

    // Social share URLs
    const socialChannels = [
        {
            name: 'WhatsApp',
            color: '#25D366',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
            ),
            getUrl: () => `https://wa.me/?text=${encodeURIComponent(fullMessage)}`,
        },
        {
            name: 'Facebook',
            color: '#1877F2',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
            ),
            getUrl: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralUrl)}`,
        },
        {
            name: 'X (Twitter)',
            color: '#000000',
            icon: (
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
            ),
            getUrl: () => `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_MESSAGE)}&url=${encodeURIComponent(referralUrl)}`,
        },
        {
            name: 'Telegram',
            color: '#0088CC',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
            ),
            getUrl: () => `https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(SHARE_MESSAGE)}`,
        },
        {
            name: 'LinkedIn',
            color: '#0A66C2',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
            ),
            getUrl: () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralUrl)}`,
        },
        {
            name: 'Reddit',
            color: '#FF4500',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 000-.462.342.342 0 00-.462 0c-.545.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.205-.095z" />
                </svg>
            ),
            getUrl: () => `https://www.reddit.com/submit?url=${encodeURIComponent(referralUrl)}&title=${encodeURIComponent(SHARE_TITLE)}`,
        },
    ];

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 10000,
                    animation: 'inviteBackdropIn 0.2s ease',
                }}
            />

            {/* Modal */}
            <div
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 'min(420px, 92vw)',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    background: '#242526',
                    border: '1px solid rgba(24, 119, 242, 0.3)',
                    borderRadius: 20,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(24, 119, 242, 0.1)',
                    zIndex: 10001,
                    animation: 'inviteModalIn 0.3s ease',
                    padding: 0,
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '24px 24px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <div>
                        <h2 style={{
                            margin: 0,
                            fontSize: 22,
                            fontWeight: 700,
                            color: '#fff',
                            letterSpacing: '-0.3px',
                        }}>
                            Invite Friends
                        </h2>
                        <p style={{
                            margin: '6px 0 0',
                            fontSize: 13,
                            color: 'rgba(255,255,255,0.5)',
                        }}>
                            Earn <strong style={{ color: '#31A24C' }}>500 Diamonds</strong> For Every Friend Who Signs Up!
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            border: 'none',
                            background: 'rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: 18,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            flexShrink: 0,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    >
                        ✕
                    </button>
                </div>

                {/* Referral Link Display */}
                <div style={{ padding: '16px 24px' }}>
                    <div style={{
                        background: 'rgba(24, 119, 242, 0.06)',
                        border: '1px solid rgba(24, 119, 242, 0.15)',
                        borderRadius: 12,
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                    }}>
                        <div style={{
                            flex: 1,
                            fontSize: 13,
                            color: 'rgba(24, 119, 242, 0.9)',
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {loading ? 'Loading...' : referralUrl}
                        </div>
                        {playerNumber && (
                            <div style={{
                                background: 'rgba(24, 119, 242, 0.2)',
                                border: '1px solid rgba(24, 119, 242, 0.3)',
                                borderRadius: 8,
                                padding: '4px 10px',
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#1877F2',
                                whiteSpace: 'nowrap',
                            }}>
                                #{playerNumber}
                            </div>
                        )}
                    </div>
                </div>

                {/* Primary Actions */}
                <div style={{ padding: '0 24px 16px', display: 'flex', gap: 10 }}>
                    {/* Copy Link */}
                    <button
                        onClick={handleCopyLink}
                        disabled={loading}
                        style={{
                            flex: 1,
                            padding: '14px 16px',
                            background: copied ? '#31A24C' : '#1877F2',
                            border: 'none',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: loading ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            transition: 'all 0.3s',
                            boxShadow: copied
                                ? '0 4px 16px rgba(49, 162, 76, 0.4)'
                                : '0 4px 16px rgba(24, 119, 242, 0.3)',
                        }}
                    >
                        {copied ? 'Copied!' : 'Copy Link'}
                    </button>

                    {/* Native Share - only on supported devices */}
                    {canNativeShare && (
                        <button
                            onClick={handleNativeShare}
                            disabled={loading}
                            style={{
                                flex: 1,
                                padding: '14px 16px',
                                background: '#1877F2',
                                border: 'none',
                                borderRadius: 12,
                                color: '#fff',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: loading ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                transition: 'all 0.3s',
                                boxShadow: '0 4px 16px rgba(24, 119, 242, 0.3)',
                            }}
                        >
                            Share
                        </button>
                    )}
                </div>

                {/* Email & SMS */}
                <div style={{ padding: '0 24px 16px', display: 'flex', gap: 10 }}>
                    <a
                        href={`mailto:?subject=${encodeURIComponent(SHARE_TITLE)}&body=${encodeURIComponent(fullMessage)}`}
                        style={{
                            flex: 1,
                            padding: '12px 16px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 500,
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    >
                        Email
                    </a>
                    <a
                        href={`sms:?body=${encodeURIComponent(fullMessage)}`}
                        style={{
                            flex: 1,
                            padding: '12px 16px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 500,
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    >
                        SMS
                    </a>
                </div>

                {/* Social Media Channels */}
                <div style={{ padding: '0 24px 8px' }}>
                    <div style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.35)',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        marginBottom: 12,
                    }}>
                        Share On Social Media
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 10,
                    }}>
                        {socialChannels.map(channel => (
                            <a
                                key={channel.name}
                                href={channel.getUrl()}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 0,
                                    padding: 0,
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: 0,
                                    textDecoration: 'none',
                                    color: '#fff',
                                    transition: 'all 0.2s',
                                    cursor: 'pointer',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
                                    e.currentTarget.querySelector('.social-icon-circle').style.boxShadow = `0 6px 20px ${channel.color}44`;
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                    e.currentTarget.querySelector('.social-icon-circle').style.boxShadow = 'none';
                                }}
                            >
                                <div
                                    className="social-icon-circle"
                                    style={{
                                        width: 64,
                                        height: 64,
                                        borderRadius: '50%',
                                        background: channel.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#fff',
                                        transition: 'box-shadow 0.2s',
                                    }}
                                >
                                    {channel.icon}
                                </div>
                                <span style={{
                                    marginTop: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: 'rgba(255,255,255,0.7)',
                                    textAlign: 'center',
                                }}>
                                    {channel.name}
                                </span>
                            </a>
                        ))}
                    </div>
                </div>

                {/* Contacts Search Bar Integration */}
                <div style={{ padding: '0 24px 16px' }}>
                    <div style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.35)',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        marginBottom: 12,
                    }}>
                        Search Contacts to Message
                    </div>
                    <div style={{
                        borderRadius: 12,
                        overflow: 'hidden',
                        background: '#18191A',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: 12
                    }}>
                        <input
                            value={q}
                            onChange={e => { setQ(e.target.value); onSearch(e.target.value); }}
                            placeholder=" Search..."
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: 20,
                                border: 'none',
                                background: 'rgba(255,255,255,0.1)',
                                color: 'white',
                                fontSize: 13,
                                outline: 'none',
                                marginBottom: 12,
                                boxSizing: 'border-box'
                            }}
                        />
                        <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                            {q.length >= 2 && searchResults.length > 0 && searchResults.map(u => (
                                <div key={u.id} onClick={() => { onOpenChat(u); onClose(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', borderRadius: 6, transition: 'background 0.2s', ':hover': { background: 'rgba(255,255,255,0.05)' } }}>
                                    <img src={u.avatar_url || '/default-avatar.png'} style={{ width: 32, height: 32, borderRadius: '50%' }} />
                                    <span style={{ fontSize: 13, color: 'white' }}>{u.username}</span>
                                </div>
                            ))}
                            {q.length < 2 && (
                                contacts.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'left', margin: 0 }}>No Contacts Yet</p> : contacts.map(c => (
                                    <div key={c.id} onClick={() => { onOpenChat(c); onClose(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', borderRadius: 6, transition: 'background 0.2s', ':hover': { background: 'rgba(255,255,255,0.05)' } }}>
                                        <div style={{ position: 'relative' }}>
                                            <img src={c.avatar || '/default-avatar.png'} style={{ width: 36, height: 36, borderRadius: '50%' }} />
                                            {c.online && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#42B72A', border: '2px solid #18191A' }} />}
                                        </div>
                                        <span style={{ fontSize: 13, fontWeight: 500, color: 'white' }}>{c.name}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px 20px',
                    textAlign: 'center',
                }}>
                    <p style={{
                        margin: 0,
                        fontSize: 12,
                        color: 'rgba(255,255,255,0.3)',
                        lineHeight: 1.5,
                    }}>
                        Your Referral Code: <strong style={{ color: '#1877F2' }}>#{playerNumber || '...'}</strong>
                        <br />
                        Friends Enter Your Code During Signup And You Earn 500 Diamonds Each Time
                    </p>
                </div>
            </div>

            {/* Animations */}
            <style jsx global>{`
                @keyframes inviteBackdropIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes inviteModalIn {
                    from { opacity: 0; transform: translate(-50%, -48%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
            `}</style>
        </>
    );
}
