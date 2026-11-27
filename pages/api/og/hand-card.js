/**
 * OG Hand Card Image Generator
 * GET /api/og/hand-card?hero=As,Kd&board=Qh,Jh,Th&result=Won&amount=+$420&stakes=$1/$3 NLH&venue=Horseshoe&pot=$840&player=Dan&hand=Royal Flush
 *
 * Generates a #SmarterDesign 1200x630 shareable poker hand card image using @vercel/og.
 * Every element MUST have display:'flex' for Satori compatibility.
 *
 * Both view=review (Personal Assistant read-only hand review links) and standard links are HONEST:
 * they render only sanitized, bounded parameters that were explicitly passed. No fabricated hole
 * cards, amounts, pots, stakes, or win results are ever invented when omitted.
 */
import { ImageResponse } from '@vercel/og';
export const config = { runtime: 'edge' };

const SUITS = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_COLORS = { c: '#4DE0A5', d: '#56D8FF', h: '#FF6B7A', s: '#F1F5FC' };

function formatCard(cardStr) {
    if (!cardStr || cardStr.length < 2) return { rank: '?', suit: '?', color: '#F1F5FC' };
    const rank = cardStr.slice(0, -1).toUpperCase().replace(/^T$/, '10');
    const suitChar = cardStr.slice(-1).toLowerCase();
    return {
        rank,
        suit: SUITS[suitChar] || '?',
        color: SUIT_COLORS[suitChar] || '#F1F5FC',
    };
}

function CardElement({ card, size = 'large' }) {
    const isLarge = size === 'large';
    const isMedium = size === 'medium';
    const width = isLarge ? 104 : (isMedium ? 86 : 82);
    const height = isLarge ? 144 : (isMedium ? 124 : 114);
    const borderRadius = isLarge ? 14 : (isMedium ? 13 : 12);
    const rankSize = isLarge ? 42 : (isMedium ? 36 : 32);
    const suitSize = isLarge ? 34 : (isMedium ? 28 : 26);
    const isHeroSized = isLarge || isMedium;
    return (
        <div style={{
            width,
            height,
            borderRadius,
            background: 'linear-gradient(180deg, #132238 0%, #08101C 100%)',
            border: isHeroSized ? '2px solid rgba(86,216,255,0.42)' : '1px solid rgba(174,192,208,0.28)',
            borderTop: isHeroSized ? '2px solid rgba(131,222,255,0.72)' : '1px solid rgba(174,192,208,0.52)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isHeroSized
                ? '0 10px 24px rgba(0,0,0,0.55)'
                : '0 6px 16px rgba(0,0,0,0.45)',
        }}>
            <div style={{
                display: 'flex',
                fontSize: rankSize,
                fontWeight: 900,
                color: card.color,
                lineHeight: 1,
            }}>
                {card.rank}
            </div>
            <div style={{
                display: 'flex',
                fontSize: suitSize,
                color: card.color,
                marginTop: 2,
                lineHeight: 1,
            }}>
                {card.suit}
            </div>
        </div>
    );
}

const REVIEW_CARD = /^(?:10|[2-9TJQKA])[shdc]$/i;

function reviewCards(raw, max) {
    return String(raw || '').split(',').map(c => c.trim()).filter(c => REVIEW_CARD.test(c)).slice(0, max);
}

function reviewText(raw, max = 48) {
    return String(raw || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export default async function handler(req) {
    try {
        const { searchParams } = new URL(req.url);
        const isReview = searchParams.get('view') === 'review';
        // Supports NLH (2), Pineapple (3), PLO4 (4), PLO5 (5), and PLO6 (6) hole cards.
        const heroCards = isReview
            ? (() => {
                const hero = reviewCards(searchParams.get('hero'), 6);
                return hero.length >= 2 && hero.length <= 6 ? hero : [];
            })()
            : reviewCards(searchParams.get('hero'), 6);
        const heroCardSize = heroCards.length >= 5 ? 'medium' : 'large';
        const heroCardGap = heroCards.length >= 5 ? 8 : 12;
        const heroSectionMarginRight = heroCards.length >= 5 ? 32 : (heroCards.length >= 4 ? 40 : 48);
        const board = reviewCards(searchParams.get('board'), 5);
        const result = isReview ? '' : reviewText(searchParams.get('result'), 24);
        const amount = isReview ? '' : reviewText(searchParams.get('amount'), 24);
        const stakes = reviewText(searchParams.get('stakes'), 24);
        const venue = reviewText(searchParams.get('venue'), 24);
        const pot = isReview ? '' : reviewText(searchParams.get('pot'), 24);
        const player = isReview ? 'Smarter.Poker Hand Review' : (reviewText(searchParams.get('player'), 40) || 'Smarter.Poker Player');
        const handName = reviewText(searchParams.get('hand'), 60);
        const reviewStreet = isReview ? reviewText(searchParams.get('street'), 12).toUpperCase() : '';
        const reviewPosition = isReview ? reviewText(searchParams.get('position'), 8).toUpperCase() : '';

        const isWin = !isReview && (result.toLowerCase().includes('won') || amount.startsWith('+'));
        const isLoss = !isReview && !isWin && (result.toLowerCase().includes('lost') || amount.startsWith('-'));
        const accent = isReview
            ? '#83DEFF'
            : (isWin ? '#4DE0A5' : (isLoss ? '#FF6B7A' : '#56D8FF'));
        const accentSoft = isReview
            ? 'rgba(131,222,255,0.14)'
            : (isWin ? 'rgba(77,224,165,0.14)' : (isLoss ? 'rgba(255,107,122,0.14)' : 'rgba(86,216,255,0.14)'));
        const badgeLabel = isReview ? 'Hand Review' : (amount || result || 'Hand Snapshot');
        const subtitle = [stakes, venue].filter(Boolean).join(' - ') || (isReview ? 'Hand Review' : 'Hand Snapshot');

        const headers = isReview
            ? {
                'Cache-Control': 'private, no-store, max-age=0',
                'X-Robots-Tag': 'noindex, nofollow',
            }
            : {
                'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            };

        return new ImageResponse(
            (
                <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'linear-gradient(135deg, #040D18 0%, #091727 52%, #05080C 100%)',
                    padding: '52px 64px',
                    fontFamily: 'sans-serif',
                    position: 'relative',
                    border: '2px solid rgba(174,192,208,0.28)',
                }}>
                    {/* Header row */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '28px',
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                fontSize: 34,
                                fontWeight: 900,
                                color: '#F1F5FC',
                                letterSpacing: 2,
                            }}>
                                SMARTER.POKER
                            </div>
                            <div style={{
                                display: 'flex',
                                fontSize: 18,
                                color: '#9EB4C8',
                                fontWeight: 600,
                                marginTop: 6,
                            }}>
                                {subtitle}
                            </div>
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: accentSoft,
                            border: `2px solid ${accent}`,
                            borderRadius: 14,
                            padding: '10px 26px',
                        }}>
                            <div style={{
                                display: 'flex',
                                fontSize: 34,
                                fontWeight: 900,
                                letterSpacing: 1,
                                color: accent,
                            }}>
                                {badgeLabel}
                            </div>
                        </div>
                    </div>

                    {/* Player row */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginBottom: '34px',
                    }}>
                        <div style={{
                            width: 56,
                            height: 56,
                            borderRadius: 28,
                            background: 'linear-gradient(135deg, #087CFA 0%, #56D8FF 100%)',
                            border: '2px solid rgba(174,192,208,0.28)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 26,
                            fontWeight: 900,
                            color: '#F1F5FC',
                            marginRight: 16,
                        }}>
                            {player.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                                display: 'flex',
                                fontSize: 26,
                                fontWeight: 800,
                                color: '#F1F5FC',
                            }}>
                                {player}
                            </div>
                            {handName ? (
                                <div style={{
                                    display: 'flex',
                                    fontSize: 18,
                                    color: '#83DEFF',
                                    fontWeight: 700,
                                    marginTop: 2,
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
                        marginBottom: '28px',
                    }}>
                        {/* Hero Cards */}
                        <div style={{ display: 'flex', flexDirection: 'column', marginRight: heroSectionMarginRight }}>
                            <div style={{
                                display: 'flex',
                                fontSize: 15,
                                color: '#9EB4C8',
                                textTransform: 'uppercase',
                                letterSpacing: 2,
                                fontWeight: 700,
                                marginBottom: 12,
                            }}>
                                Hole Cards
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', minHeight: 144 }}>
                                {heroCards.length === 0 ? (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        height: 144,
                                        padding: '0 24px',
                                        borderRadius: 14,
                                        background: 'rgba(19,34,56,0.65)',
                                        border: '1px solid rgba(174,192,208,0.28)',
                                        fontSize: 20,
                                        fontWeight: 700,
                                        color: '#9EB4C8',
                                    }}>
                                        {isReview ? 'Hidden By The Player' : 'Not Shared'}
                                    </div>
                                ) : heroCards.map((c, i) => (
                                    <div key={i} style={{ display: 'flex', marginRight: i < heroCards.length - 1 ? heroCardGap : 0 }}>
                                        <CardElement card={formatCard(c.trim())} size={heroCardSize} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Board Cards */}
                        {board.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{
                                    display: 'flex',
                                    fontSize: 15,
                                    color: '#9EB4C8',
                                    textTransform: 'uppercase',
                                    letterSpacing: 2,
                                    fontWeight: 700,
                                    marginBottom: 12,
                                }}>
                                    Board
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', height: 144 }}>
                                    {board.map((c, i) => (
                                        <div key={i} style={{ display: 'flex', marginRight: i < board.length - 1 ? 10 : 0 }}>
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
                        borderTop: '1px solid rgba(174,192,208,0.28)',
                        paddingTop: '22px',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', marginRight: 56 }}>
                                <div style={{
                                    display: 'flex',
                                    fontSize: 15,
                                    color: '#9EB4C8',
                                    textTransform: 'uppercase',
                                    letterSpacing: 1.5,
                                    fontWeight: 700,
                                    marginBottom: 4,
                                }}>
                                    {isReview ? 'Street' : 'Pot'}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    fontSize: 30,
                                    fontWeight: 800,
                                    color: '#83DEFF',
                                }}>
                                    {isReview ? (reviewStreet || 'Not Shared') : (pot || 'Not Shared')}
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{
                                    display: 'flex',
                                    fontSize: 15,
                                    color: '#9EB4C8',
                                    textTransform: 'uppercase',
                                    letterSpacing: 1.5,
                                    fontWeight: 700,
                                    marginBottom: 4,
                                }}>
                                    {isReview ? 'Position' : 'Result'}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    fontSize: 30,
                                    fontWeight: 800,
                                    color: isReview ? '#F1F5FC' : (isWin ? '#4DE0A5' : (isLoss ? '#FF6B7A' : '#F1F5FC')),
                                }}>
                                    {isReview ? (reviewPosition || 'Not Shared') : (result || 'Not Shared')}
                                </div>
                            </div>
                        </div>

                        {/* Branding footer */}
                        <div style={{
                            display: 'flex',
                            fontSize: 16,
                            color: '#9EB4C8',
                            fontWeight: 700,
                            letterSpacing: 1,
                        }}>
                            Smarter.Poker
                        </div>
                    </div>
                </div>
            ),
            { width: 1200, height: 630, headers }
        );
    } catch (err) {
        console.warn('[OG Hand Card] Error:', err);
        return new Response('Error generating image', { status: 500 });
    }
}
