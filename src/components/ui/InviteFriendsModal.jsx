/**
 * InviteFriendsModal — Share & Referral System
 * ═══════════════════════════════════════════════════════════════
 * Full-featured invite modal with share channels:
 * Copy Link, Native Share, Email, SMS, WhatsApp, SmarterPoker, X,
 * Telegram, Instagram, Snapchat, LinkedIn, Reddit, Discord
 * Uses native app deep links (URI schemes) so mobile users
 * open the native app instead of the browser
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

let _supabase;
function getSupabase() {
    if (!_supabase && typeof window !== 'undefined') {
        _supabase = typeof window !== 'undefined' ? createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ) : null;
    }
    return _supabase;
}

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
    searchResults = [],
    // Optional overrides — used by agent invite, club invite, etc.
    customUrl = null,         // If set, skips player_number fetch and uses this URL directly
    customTitle = null,       // Override share title
    customMessage = null,     // Override share message
    customCodeLabel = null,   // Override "Your Referral Code" footer label
    customCodeValue = null,   // Override the code value shown in footer
}) {
    const [playerNumber, setPlayerNumber] = useState(null);
    const [loading, setLoading] = useState(!customUrl); // skip loading if custom URL provided
    const [copied, setCopied] = useState(false);
    const [canNativeShare, setCanNativeShare] = useState(false);
    const [q, setQ] = useState('');

    // Check native share support
    useEffect(() => {
        setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share);
    }, []);

    // Fetch player number on open — skipped when customUrl is provided
    useEffect(() => {
        if (!isOpen || !user?.id || customUrl) return;
        setLoading(true);
        const supabase = getSupabase();
        if (!supabase) { setLoading(false); return; }
        supabase
            .from('profiles')
            .select('player_number')
            .eq('id', user.id)
            .maybeSingle()
            .then(({ data }) => {
                setPlayerNumber(data?.player_number || null);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [isOpen, user?.id, customUrl]);

    const shareTitle = customTitle || SHARE_TITLE;
    const referralUrl = customUrl || (playerNumber
        ? `https://smarter.poker/auth/signup?ref=${playerNumber}`
        : 'https://smarter.poker');
    const shareMsg = customMessage || SHARE_MESSAGE;
    const fullMessage = `${shareMsg}\n\n${referralUrl}`;

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
                title: shareTitle,
                text: shareMsg,
                url: referralUrl,
            });
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Share failed:', err);
            }
        }
    }, [referralUrl]);

    // Social share URLs — using native app deep links for mobile
    // Falls back to browser if app not installed
    const socialChannels = [
        {
            name: 'WhatsApp',
            color: '#25D366',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
            ),
            getUrl: () => `whatsapp://send?text=${encodeURIComponent(fullMessage)}`,
        },
        {
            name: 'Facebook',
            color: '#1877F2',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
            ),
            getUrl: () => `fb://share/?link=${encodeURIComponent(referralUrl)}`,
        },
        {
            name: 'X (Twitter)',
            color: '#000000',
            icon: (
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
            ),
            getUrl: () => `twitter://post?message=${encodeURIComponent(shareMsg + '\n' + referralUrl)}`,
        },
        {
            name: 'Telegram',
            color: '#0088CC',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
            ),
            getUrl: () => `tg://msg_url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent(shareMsg)}`,
        },
        {
            name: 'Instagram',
            color: '#E4405F',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z" />
                </svg>
            ),
            getUrl: () => `instagram://sharesheet?text=${encodeURIComponent(fullMessage)}`,
        },
        {
            name: 'Snapchat',
            color: '#FFFC00',
            textColor: '#000',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12.959-.315.09-.06.194-.089.292-.089.14 0 .292.06.395.165.19.2.195.502.009.7-.224.243-.61.45-1.035.57-.15.045-.3.076-.435.091a1.057 1.057 0 00-.135.03c-.06.025-.12.06-.165.12-.04.06-.06.135-.045.21.12.51.33 1.02.614 1.5.375.645.855 1.215 1.425 1.696.21.18.44.32.675.44.15.075.275.12.319.136.435.165.584.464.584.644 0 .255-.18.465-.48.585-.33.135-.765.21-1.29.24-.315.015-.6.066-.764.105-.18.045-.33.12-.449.225-.18.164-.255.375-.3.51-.06.18-.105.315-.525.356a7.2 7.2 0 01-.959-.03 5.77 5.77 0 00-.704-.03c-.228 0-.48.015-.749.075-.27.06-.539.165-.839.33-.75.405-1.38.624-1.889.624-.165 0-.315-.015-.448-.045-.524-.104-1.035-.45-1.559-.795-.704-.48-1.26-.66-1.6-.66h-.029c-.34 0-.899.18-1.589.66-.525.345-1.034.69-1.558.795a1.53 1.53 0 01-.449.045c-.51 0-1.139-.225-1.889-.63-.3-.165-.569-.27-.839-.33a3.7 3.7 0 00-.75-.075c-.27 0-.51.015-.704.03-.33.024-.66.045-.959.03-.42-.045-.465-.18-.525-.356-.045-.135-.12-.345-.3-.51a1.303 1.303 0 00-.449-.225c-.165-.045-.449-.09-.764-.105-.525-.03-.96-.105-1.29-.24-.3-.12-.48-.33-.48-.585 0-.18.149-.479.584-.644.044-.015.17-.06.319-.135a4.5 4.5 0 00.675-.44c.57-.48 1.05-1.05 1.425-1.695.284-.48.494-.99.614-1.5a.404.404 0 00-.045-.21c-.045-.06-.105-.1-.165-.12a1.057 1.057 0 00-.135-.03c-.135-.015-.285-.045-.435-.09-.42-.12-.81-.33-1.035-.57-.186-.2-.181-.5.009-.7a.507.507 0 01.395-.165c.098 0 .202.03.292.09.3.194.659.314.959.314.198 0 .326-.044.401-.089-.008-.165-.018-.33-.03-.51l-.003-.06c-.104-1.628-.23-3.654.3-4.847C7.86 1.069 11.215.793 12.206.793z" />
                </svg>
            ),
            getUrl: () => `snapchat://creativeKitWeb/camera/1?attachmentUrl=${encodeURIComponent(referralUrl)}`,
        },
        {
            name: 'LinkedIn',
            color: '#0A66C2',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
            ),
            getUrl: () => `linkedin://sharing/share-offsite/?url=${encodeURIComponent(referralUrl)}`,
        },
        {
            name: 'Reddit',
            color: '#FF4500',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 000-.462.342.342 0 00-.462 0c-.545.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.205-.095z" />
                </svg>
            ),
            getUrl: () => `reddit://submit?url=${encodeURIComponent(referralUrl)}&title=${encodeURIComponent(shareTitle)}`,
        },
        {
            name: 'Discord',
            color: '#5865F2',
            icon: (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
                </svg>
            ),
            getUrl: () => `discord://share?text=${encodeURIComponent(fullMessage)}`,
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
                            {customUrl
                                ? <span>{shareMsg}</span>
                                : <>Earn <strong style={{ color: '#31A24C' }}>500 Diamonds</strong> For Every Friend Who Signs Up!</>
                            }
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
                            background: copied ? '#31A24C' : 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
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
                                : 'none',
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
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.1)',
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
                                boxShadow: 'none',
                            }}
                        >
                            Share
                        </button>
                    )}
                </div>

                {/* Email & SMS */}
                <div style={{ padding: '0 24px 16px', display: 'flex', gap: 10 }}>
                    <a
                        href={`mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(fullMessage)}`}
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
                                        color: channel.textColor || '#fff',
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
                                    <img src={u.avatar_url || '/default-avatar.png'} style={{ width: 32, height: 32, borderRadius: '50%' }} alt="User avatar" />
                                    <span style={{ fontSize: 13, color: 'white' }}>{u.username}</span>
                                </div>
                            ))}
                            {q.length < 2 && (
                                contacts.length === 0 ? <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'left', margin: 0 }}>No Contacts Yet</p> : contacts.map(c => (
                                    <div key={c.id} onClick={() => { onOpenChat(c); onClose(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', borderRadius: 6, transition: 'background 0.2s', ':hover': { background: 'rgba(255,255,255,0.05)' } }}>
                                        <div style={{ position: 'relative' }}>
                                            <img src={c.avatar || '/default-avatar.png'} style={{ width: 36, height: 36, borderRadius: '50%' }} alt="User avatar" />
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
                        {customCodeLabel || 'Your Referral Code'}: <strong style={{ color: '#1877F2' }}>{customCodeValue || `#${playerNumber || '...'}`}</strong>
                        <br />
                        {customUrl
                            ? 'Share this link and let your friends join directly.'
                            : 'Friends Enter Your Code During Signup And You Earn 500 Diamonds Each Time'
                        }
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
