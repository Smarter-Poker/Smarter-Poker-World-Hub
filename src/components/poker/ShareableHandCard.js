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

    if (!hand) return null;

    // Build the OG image URL
    const params = new URLSearchParams({
        hero: (hand.heroCards || []).join(','),
        board: (hand.board || []).join(','),
        result: hand.result || 'Played',
        amount: hand.amount || '$0',
        stakes: hand.stakes || 'Cash Game',
        venue: hand.venue || 'Live Poker',
        pot: hand.pot || '$0',
        player: hand.playerName || 'Smarter.Poker Player',
        hand: hand.handName || '',
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
                    title: `${hand.result || 'Hand'} at ${hand.venue || 'Poker'}`,
                    text: `Check out my ${hand.handName || 'hand'} — ${hand.amount || ''} at ${hand.stakes || 'cash game'}!`,
                    url: shareUrl,
                });
            } catch { }
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
