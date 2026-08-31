/**
 * OG Hand Card Image Generator
 * GET /api/og/hand-card?hero=Ah,Kh&board=Qh,Jh,Th&result=Won&amount=+$1250&stakes=$1/$3 NLH&venue=Horseshoe&pot=$2500&player=Dan&hand=Royal Flush
 * 
 * Generates a beautiful shareable poker hand card image using @vercel/og
 * Every element MUST have display:'flex' for Satori compatibility.
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

function CardElement({ card, size = 'large' }) {
    const isLarge = size === 'large';
    return (
        <div style={{
            width: isLarge ? 72 : 56,
            height: isLarge ? 100 : 78,
            borderRadius: isLarge ? 10 : 8,
            background: 'linear-gradient(135deg, #1a1a3e, #2a2a5e)',
            border: isLarge ? '2px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.12)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isLarge ? '0 4px 12px rgba(0,0,0,0.4)' : 'none',
        }}>
            <div style={{
                display: 'flex',
                fontSize: isLarge ? 28 : 22,
                fontWeight: 900,
                color: card.color,
                lineHeight: 1,
            }}>
                {card.rank}
            </div>
            <div style={{
                display: 'flex',
                fontSize: isLarge ? 24 : 18,
                color: card.color,
                marginTop: -2,
            }}>
                {card.suit}
            </div>
        </div>
    );
}

export default async function handler(req) {
    try {
        const { searchParams } = new URL(req.url);
        const heroCards = (searchParams.get('hero') || 'Ah,Kh').split(',').filter(Boolean);
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
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'linear-gradient(135deg, #0a0a1e 0%, #1a1a3e 40%, #0d0d2e 100%)',
                    padding: '48px',
                    fontFamily: 'sans-serif',
                    position: 'relative',
                }}>
                    {/* Header row */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '20px',
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                                display: 'flex',
                                fontSize: 28,
                                fontWeight: 800,
                                color: '#FFD700',
                                letterSpacing: 1,
                            }}>
                                SMARTER.POKER
                            </div>
                            <div style={{
                                display: 'flex',
                                fontSize: 16,
                                color: 'rgba(255,255,255,0.5)',
                                marginTop: 4,
                            }}>
                                {stakes} - {venue}
                            </div>
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: isWin ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)',
                            border: `2px solid ${isWin ? '#2ECC71' : '#E74C3C'}`,
                            borderRadius: 12,
                            padding: '8px 20px',
                        }}>
                            <div style={{
                                display: 'flex',
                                fontSize: 32,
                                fontWeight: 900,
                                letterSpacing: 1,
                                color: isWin ? '#2ECC71' : '#E74C3C',
                            }}>
                                {amount}
                            </div>
                        </div>
                    </div>

                    {/* Player row */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginBottom: '28px',
                    }}>
                        <div style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 22,
                            fontWeight: 800,
                            color: '#000',
                            marginRight: 12,
                        }}>
                            {player.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                                display: 'flex',
                                fontSize: 20,
                                fontWeight: 700,
                                color: '#E4E6EB',
                            }}>
                                {player}
                            </div>
                            {handName ? (
                                <div style={{
                                    display: 'flex',
                                    fontSize: 14,
                                    color: '#FFD700',
                                    fontWeight: 600,
                                }}>
                                    {handName}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Cards section */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        marginBottom: '24px',
                    }}>
                        {/* Hero Cards */}
                        <div style={{ display: 'flex', flexDirection: 'column', marginRight: 32 }}>
                            <div style={{
                                display: 'flex',
                                fontSize: 11,
                                color: 'rgba(255,255,255,0.4)',
                                textTransform: 'uppercase',
                                letterSpacing: 2,
                                fontWeight: 700,
                                marginBottom: 8,
                            }}>
                                Hole Cards
                            </div>
                            <div style={{ display: 'flex' }}>
                                {heroCards.map((c, i) => (
                                    <div key={i} style={{ display: 'flex', marginRight: i < heroCards.length - 1 ? 8 : 0 }}>
                                        <CardElement card={formatCard(c.trim())} size="large" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Board Cards */}
                        {board.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{
                                    display: 'flex',
                                    fontSize: 11,
                                    color: 'rgba(255,255,255,0.4)',
                                    textTransform: 'uppercase',
                                    letterSpacing: 2,
                                    fontWeight: 700,
                                    marginBottom: 8,
                                }}>
                                    Board
                                </div>
                                <div style={{ display: 'flex' }}>
                                    {board.map((c, i) => (
                                        <div key={i} style={{ display: 'flex', marginRight: i < board.length - 1 ? 6 : 0 }}>
                                            <CardElement card={formatCard(c.trim())} size="small" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* Footer stats */}
                    <div style={{
                        display: 'flex',
                        marginTop: 'auto',
                        borderTop: '1px solid rgba(255,255,255,0.08)',
                        paddingTop: '16px',
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', marginRight: 32 }}>
                            <div style={{
                                display: 'flex',
                                fontSize: 11,
                                color: 'rgba(255,255,255,0.4)',
                                textTransform: 'uppercase',
                                letterSpacing: 1,
                            }}>
                                Pot
                            </div>
                            <div style={{
                                display: 'flex',
                                fontSize: 24,
                                fontWeight: 800,
                                color: '#FFD700',
                            }}>
                                {pot}
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                                display: 'flex',
                                fontSize: 11,
                                color: 'rgba(255,255,255,0.4)',
                                textTransform: 'uppercase',
                                letterSpacing: 1,
                            }}>
                                Result
                            </div>
                            <div style={{
                                display: 'flex',
                                fontSize: 24,
                                fontWeight: 800,
                                color: isWin ? '#2ECC71' : '#E74C3C',
                            }}>
                                {result}
                            </div>
                        </div>
                    </div>

                    {/* Branding footer */}
                    <div style={{
                        display: 'flex',
                        position: 'absolute',
                        bottom: 16,
                        right: 48,
                        fontSize: 12,
                        color: 'rgba(255,255,255,0.2)',
                        fontWeight: 600,
                    }}>
                        smarter.poker
                    </div>
                </div>
            ),
            { width: 800, height: 420 }
        );
    } catch (err) {
        console.warn('[OG Hand Card] Error:', err);
        return new Response('Error generating image', { status: 500 });
    }
}
