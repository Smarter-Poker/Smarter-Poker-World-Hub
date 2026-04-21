/**
 * ShareableHandCard — Generates and shares an OG image for a poker hand
 * ═══════════════════════════════════════════════════════════════════════════
 * Renders a preview card and provides sharing options for social media.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback } from 'react';

const T = {
    bg: '#0a0a0a',
    card: '#18191a',
    border: '#3E4042',
    text: '#E4E6EB',
    textSec: '#B0B3B8',
    gold: '#FFD700',
    accent: '#4facfe',
};

/**
 * @param {{ hand: object, onClose: function }} props
 * hand shape: { heroCards, board, result, amount, stakes, venue, pot, handName, playerName }
 */
export default function ShareableHandCard({ hand, onClose }) {
    const [copied, setCopied] = useState(false);
    const [sharing, setSharing] = useState(false);

    // Build the OG image URL (safe to call even if hand is null — hooks must always run)
    const params = new URLSearchParams({
        hero: (hand?.heroCards || []).join(','),
        board: (hand?.board || []).join(','),
        result: hand?.result || 'Played',
        amount: hand?.amount || '$0',
        stakes: hand?.stakes || 'Cash Game',
        venue: hand?.venue || 'Live Poker',
        pot: hand?.pot || '$0',
        player: hand?.playerName || 'Smarter.Poker Player',
        hand: hand?.handName || '',
    });

    const imageUrl = `/api/og/hand-card?${params.toString()}`;
    const shareUrl = `https://smarter.poker/share/hand?${params.toString()}`;

    const copyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = shareUrl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [shareUrl]);

    const shareNative = useCallback(async () => {
        if (navigator.share) {
            setSharing(true);
            try {
                await navigator.share({
                    title: `${hand?.result || 'Hand'} at ${hand?.venue || 'Poker'}`,
                    text: `Check out my ${hand?.handName || 'hand'} — ${hand?.amount || ''} at ${hand?.stakes || 'cash game'}!`,
                    url: shareUrl,
                });
            } catch (e) { console.warn('[App] Handled exception:', e); }
            setSharing(false);
        } else {
            copyLink();
        }
    }, [hand, shareUrl, copyLink]);

    const downloadImage = useCallback(async () => {
        try {
            const resp = await fetch(imageUrl);
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `poker-hand-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('[ShareCard] Download failed:', err);
        }
    }, [imageUrl]);

    // Early return AFTER all hooks — never before
    if (!hand) return null;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: 16,
            }}
            onClick={onClose}
        >
            <div onClick={e => e.stopPropagation()} style={{ maxWidth: 440, width: '100%' }}>
                {/* Preview Image */}
                <div style={{
                    borderRadius: 16, overflow: 'hidden', marginBottom: 16,
                    boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
                    border: `1px solid ${T.border}`,
                }}>
                    <img
                        src={imageUrl}
                        alt="Hand card preview"
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                    />
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        onClick={shareNative}
                        disabled={sharing}
                        style={{
                            flex: 1, padding: '12px 16px', borderRadius: 10,
                            background: 'linear-gradient(135deg, #4facfe, #00f2fe)',
                            border: 'none', color: '#000', fontWeight: 800, fontSize: 14,
                            cursor: 'pointer', minWidth: 120,
                        }}
                    >
                        {sharing ? 'Sharing...' : 'Share'}
                    </button>
                    <button
                        onClick={copyLink}
                        style={{
                            flex: 1, padding: '12px 16px', borderRadius: 10,
                            background: copied ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${copied ? '#2ECC71' : T.border}`,
                            color: copied ? '#2ECC71' : T.text, fontWeight: 700, fontSize: 14,
                            cursor: 'pointer', minWidth: 120,
                        }}
                    >
                        {copied ? 'Copied!' : 'Copy Link'}
                    </button>
                    <button
                        onClick={downloadImage}
                        style={{
                            flex: 1, padding: '12px 16px', borderRadius: 10,
                            background: 'rgba(255,215,0,0.08)',
                            border: `1px solid ${T.gold}44`,
                            color: T.gold, fontWeight: 700, fontSize: 14,
                            cursor: 'pointer', minWidth: 120,
                        }}
                    >
                        Download
                    </button>
                </div>

                {/* Social Share Buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                        onClick={() => {
                            const text = encodeURIComponent(`${hand.result || 'Played'} ${hand.amount || ''} at ${hand.stakes || 'poker'} — ${hand.handName || 'Check out my hand!'}`);
                            const url = encodeURIComponent(shareUrl);
                            window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'width=550,height=420');
                        }}
                        style={{
                            flex: 1, padding: '10px 16px', borderRadius: 10,
                            background: 'rgba(29,161,242,0.1)',
                            border: '1px solid rgba(29,161,242,0.3)',
                            color: '#1DA1F2', fontWeight: 700, fontSize: 13,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        Post to X
                    </button>
                    <button
                        onClick={() => {
                            const url = encodeURIComponent(shareUrl);
                            window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'width=550,height=420');
                        }}
                        style={{
                            flex: 1, padding: '10px 16px', borderRadius: 10,
                            background: 'rgba(24,119,242,0.1)',
                            border: '1px solid rgba(24,119,242,0.3)',
                            color: '#1877F2', fontWeight: 700, fontSize: 13,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        Share on Facebook
                    </button>
                </div>

                {/* Close */}
                <button
                    onClick={onClose}
                    style={{
                        width: '100%', marginTop: 10, padding: 10,
                        background: 'none', border: 'none',
                        color: T.textSec, fontSize: 13, cursor: 'pointer',
                    }}
                >
                    Close
                </button>
            </div>
        </div>
    );
}
