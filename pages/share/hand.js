/**
 * Share Hand Landing Page
 * /share/hand?hero=Ah,Kh&board=Qh,Jh,Th&result=Won&amount=+$1250&...
 * 
 * Displays the OG image as a card with CTA to sign up / explore more.
 * Includes proper OG meta tags for social sharing.
 */
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

const SUITS = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_COLORS = { c: '#2ECC71', d: '#3498DB', h: '#E74C3C', s: '#ECF0F1' };

function parseCard(str) {
    if (!str || str.length < 2) return null;
    const rank = str.slice(0, -1).replace('T', '10');
    const s = str.slice(-1).toLowerCase();
    return { rank, suit: SUITS[s] || '?', color: SUIT_COLORS[s] || '#fff' };
}

export default function ShareHandPage() {
    const router = useRouter();
    const { hero, board, result, amount, stakes, venue, pot, player, hand } = router.query;
    const [imageLoaded, setImageLoaded] = useState(false);

    const heroCards = (hero || 'Ah,Kh').split(',').filter(Boolean).map(c => parseCard(c.trim())).filter(Boolean);
    const boardCards = (board || '').split(',').filter(Boolean).map(c => parseCard(c.trim())).filter(Boolean);
    const isWin = (result || '').toLowerCase().includes('won') || (amount || '').startsWith('+');

    const ogImageUrl = `https://smarter.poker/api/og/hand-card?${new URLSearchParams({
        hero: hero || 'Ah,Kh',
        board: board || '',
        result: result || 'Won',
        amount: amount || '+$1,250',
        stakes: stakes || '$1/$3 NLH',
        venue: venue || 'Live Poker',
        pot: pot || '$2,500',
        player: player || 'Smarter.Poker Player',
        hand: hand || '',
    }).toString()}`;

    const title = `${player || 'Player'} ${result || 'played'} at ${venue || 'Poker'} — ${amount || ''} | Smarter.Poker`;
    const description = `${hand ? hand + ' — ' : ''}${stakes || 'Cash Game'} at ${venue || 'Live Poker'}. Pot: ${pot || '?'}. See the full hand analysis on Smarter.Poker!`;

    return (
        <>
            <Head>
                <title>{title}</title>
                <meta name="description" content={description} />
                <meta property="og:title" content={title} />
                <meta property="og:description" content={description} />
                <meta property="og:image" content={ogImageUrl} />
                <meta property="og:image:width" content="800" />
                <meta property="og:image:height" content="420" />
                <meta property="og:type" content="website" />
                <meta property="og:url" content={`https://smarter.poker/share/hand`} />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={title} />
                <meta name="twitter:description" content={description} />
                <meta name="twitter:image" content={ogImageUrl} />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #0a0a1e 0%, #1a1a3e 40%, #0d0d2e 100%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px 16px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}>
                {/* Logo */}
                <div style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: '#FFD700',
                    letterSpacing: 1,
                    marginBottom: 32,
                    textAlign: 'center',
                }}>
                    SMARTER.POKER
                </div>

                {/* Card Image */}
                <div style={{
                    maxWidth: 520,
                    width: '100%',
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 1px rgba(255,215,0,0.3)',
                    border: '1px solid rgba(255,215,0,0.2)',
                    marginBottom: 32,
                    opacity: imageLoaded ? 1 : 0.5,
                    transition: 'opacity 0.3s ease',
                }}>
                    <img
                        src={ogImageUrl}
                        alt={`${player || 'Player'}'s poker hand`}
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                        onLoad={() => setImageLoaded(true)}
                    />
                </div>

                {/* Hand details text */}
                <div style={{ textAlign: 'center', marginBottom: 32, maxWidth: 500 }}>
                    <div style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: '#E4E6EB',
                        marginBottom: 8,
                    }}>
                        {player || 'A Smarter Player'} {isWin ? 'Won' : 'Played'} {amount || ''}
                    </div>
                    {hand && (
                        <div style={{
                            fontSize: 16,
                            color: '#FFD700',
                            fontWeight: 600,
                            marginBottom: 4,
                        }}>
                            {hand}
                        </div>
                    )}
                    <div style={{
                        fontSize: 14,
                        color: 'rgba(255,255,255,0.5)',
                    }}>
                        {stakes || 'Cash Game'} at {venue || 'Live Poker'} — Pot: {pot || '?'}
                    </div>
                </div>

                {/* Interactive card display */}
                {heroCards.length > 0 && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 24,
                        marginBottom: 40,
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                    }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {heroCards.map((c, i) => (
                                <div key={i} style={{
                                    width: 64, height: 90, borderRadius: 10,
                                    background: 'linear-gradient(135deg, #1a1a3e, #2a2a5e)',
                                    border: '2px solid rgba(255,215,0,0.3)',
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                                }}>
                                    <span style={{ fontSize: 26, fontWeight: 900, color: c.color }}>{c.rank}</span>
                                    <span style={{ fontSize: 22, color: c.color, marginTop: -4 }}>{c.suit}</span>
                                </div>
                            ))}
                        </div>
                        {boardCards.length > 0 && (
                            <>
                                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 20 }}>vs</div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {boardCards.map((c, i) => (
                                        <div key={i} style={{
                                            width: 48, height: 68, borderRadius: 8,
                                            background: 'linear-gradient(135deg, #0d0d2e, #1a1a3e)',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <span style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.rank}</span>
                                            <span style={{ fontSize: 16, color: c.color, marginTop: -2 }}>{c.suit}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* CTAs */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <a
                        href="https://smarter.poker/hub"
                        style={{
                            padding: '14px 32px',
                            borderRadius: 12,
                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                            color: '#000',
                            fontWeight: 800,
                            fontSize: 16,
                            textDecoration: 'none',
                            boxShadow: '0 4px 20px rgba(255,215,0,0.3)',
                            transition: 'transform 0.2s ease',
                        }}
                    >
                        Join Smarter.Poker
                    </a>
                    <a
                        href="https://smarter.poker/hub/poker-near-me-lobby"
                        style={{
                            padding: '14px 32px',
                            borderRadius: 12,
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#E4E6EB',
                            fontWeight: 700,
                            fontSize: 16,
                            textDecoration: 'none',
                        }}
                    >
                        Find Games Near You
                    </a>
                </div>

                {/* Footer */}
                <div style={{
                    marginTop: 48,
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.2)',
                    textAlign: 'center',
                }}>
                    The #1 Poker Intelligence Platform — Track, Train, Dominate.
                </div>
            </div>
        </>
    );
}
