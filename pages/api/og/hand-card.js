/**
 * OG Hand Card Image Generator
 * POST/GET /api/og/hand-card?handId=xxx
 * Generates a beautiful shareable poker hand card image using @vercel/og
 */
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SUITS = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_COLORS = { c: '#2ECC71', d: '#3498DB', h: '#E74C3C', s: '#ECF0F1' };

function formatCard(cardStr) {
    if (!cardStr || cardStr.length < 2) return { rank: '?', suit: '?', color: '#fff' };
    const rank = cardStr.slice(0, -1).replace('T', '10');
    const suitChar = cardStr.slice(-1).toLowerCase();
    return {
        rank,
        suit: SUITS[suitChar] || '?',
        color: SUIT_COLORS[suitChar] || '#fff',
    };
}

export default async function handler(req) {
    const { searchParams } = new URL(req.url);
    const heroCards = (searchParams.get('hero') || 'Ah,Kh').split(',');
    const board = (searchParams.get('board') || '').split(',').filter(Boolean);
    const result = searchParams.get('result') || 'Won';
    const amount = searchParams.get('amount') || '+$1,250';
    const stakes = searchParams.get('stakes') || '$1/$3 NLH';
    const venue = searchParams.get('venue') || 'Live Poker';
    const pot = searchParams.get('pot') || '$2,500';
    const player = searchParams.get('player') || 'Smarter.Poker Player';
    const handName = searchParams.get('hand') || '';

    const isWin = result.toLowerCase().includes('won') || amount.startsWith('+');

    return new ImageResponse(
        (
            <div style={{
                width: '100%', height: '100%',
                display: 'flex', flexDirection: 'column',
                background: 'linear-gradient(135deg, #0a0a1e 0%, #1a1a3e 40%, #0d0d2e 100%)',
                padding: '48px', fontFamily: 'sans-serif',
                position: 'relative',
            }}>
                {/* Decorative background elements */}
                <div style={{
                    position: 'absolute', top: 0, right: 0, width: '300px', height: '300px',
                    background: 'radial-gradient(circle, rgba(255,215,0,0.05) 0%, transparent 70%)',
                    display: 'flex',
                }} />

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: '#FFD700', letterSpacing: 1 }}>
                            SMARTER.POKER
                        </div>
                        <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                            {stakes} • {venue}
                        </div>
                    </div>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: isWin ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)',
                        border: `2px solid ${isWin ? '#2ECC71' : '#E74C3C'}`,
                        borderRadius: 12, padding: '8px 20px',
                    }}>
                        <div style={{
                            fontSize: 32, fontWeight: 900, letterSpacing: 1,
                            color: isWin ? '#2ECC71' : '#E74C3C',
                        }}>
                            {amount}
                        </div>
                    </div>
                </div>

                {/* Player */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22, fontWeight: 800, color: '#000',
                    }}>
                        {player.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#E4E6EB' }}>{player}</div>
                        {handName && <div style={{ fontSize: 14, color: '#FFD700', fontWeight: 600 }}>{handName}</div>}
                    </div>
                </div>

                {/* Cards Section */}
                <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', marginBottom: '24px' }}>
                    {/* Hero Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 }}>
                            Hole Cards
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {heroCards.map((c, i) => {
                                const card = formatCard(c.trim());
                                return (
                                    <div key={i} style={{
                                        width: 72, height: 100, borderRadius: 10,
                                        background: 'linear-gradient(135deg, #1a1a3e, #2a2a5e)',
                                        border: '2px solid rgba(255,255,255,0.2)',
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                                    }}>
                                        <div style={{ fontSize: 28, fontWeight: 900, color: card.color, lineHeight: 1 }}>
                                            {card.rank}
                                        </div>
                                        <div style={{ fontSize: 24, color: card.color, marginTop: -2 }}>
                                            {card.suit}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Board */}
                    {board.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 }}>
                                Board
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {board.map((c, i) => {
                                    const card = formatCard(c.trim());
                                    return (
                                        <div key={i} style={{
                                            width: 56, height: 78, borderRadius: 8,
                                            background: 'linear-gradient(135deg, #0d0d2e, #1a1a3e)',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: card.color, lineHeight: 1 }}>
                                                {card.rank}
                                            </div>
                                            <div style={{ fontSize: 18, color: card.color, marginTop: -2 }}>
                                                {card.suit}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Pot info */}
                <div style={{
                    display: 'flex', gap: '24px', marginTop: 'auto',
                    borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px',
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Pot</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#FFD700' }}>{pot}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Result</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: isWin ? '#2ECC71' : '#E74C3C' }}>{result}</div>
                    </div>
                </div>

                {/* Footer branding */}
                <div style={{
                    position: 'absolute', bottom: 16, right: 48,
                    fontSize: 12, color: 'rgba(255,255,255,0.2)', fontWeight: 600,
                    display: 'flex',
                }}>
                    smarter.poker
                </div>
            </div>
        ),
        { width: 800, height: 420 }
    );
}
