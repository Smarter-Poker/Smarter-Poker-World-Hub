/**
 * Share Hand Landing Page
 * /share/hand?hero=Ah,Kh&board=Qh,Jh,Th&result=Won&amount=+$1250&...
 * 
 * Displays the OG image as a card with CTA to sign up / explore more.
 * Includes proper OG meta tags for social sharing.
 *
 * view=review is the Personal Assistant read-only hand review link. It is HONEST: it renders only
 * the parameters that were explicitly passed (never default cards, amounts, pots, stakes or player
 * names), keeps hole cards hidden unless `hero` carries two valid cards, labels opponents as
 * anonymized, and is excluded from search indexing. Legacy links keep their existing behaviour.
 */
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState } from 'react';

const SUITS = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_COLORS = { c: '#2ECC71', d: '#3498DB', h: '#E74C3C', s: '#ECF0F1' };

function parseCard(str) {
    if (!str || str.length < 2) return null;
    const rank = str.slice(0, -1).replace('T', '10');
    const s = str.slice(-1).toLowerCase();
    return { rank, suit: SUITS[s] || '?', color: SUIT_COLORS[s] || '#fff' };
}

const REVIEW_CARD = /^(?:10|[2-9TJQKA])[shdc]$/i;

function firstQuery(value) {
    return Array.isArray(value) ? value[0] : value;
}

function reviewCardList(raw, max) {
    return String(firstQuery(raw) || '')
        .split(',')
        .map(c => c.trim())
        .filter(c => REVIEW_CARD.test(c))
        .slice(0, max);
}

function reviewText(raw, max = 48) {
    return String(firstQuery(raw) || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function getServerSideProps({ query = {}, res }) {
    if (firstQuery(query?.view) === 'review' && res) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    }
    const initialQuery = {};
    for (const [k, v] of Object.entries(query || {})) {
        const val = firstQuery(v);
        if (typeof val === 'string') initialQuery[k] = val;
    }
    return { props: { initialQuery } };
}

export default function ShareHandPage({ initialQuery = {} }) {
    const router = useRouter();
    const resolvedQuery = router.isReady && router.query && Object.keys(router.query).length > 0
        ? router.query
        : initialQuery;
    const { hero, board, result, amount, stakes, venue, pot, player, hand, view, street, position, anon } = resolvedQuery;
    const [imageLoaded, setImageLoaded] = useState(false);
    const isReview = firstQuery(view) === 'review';

    // Review links: explicit parameters only. Hole cards show only when exactly two valid cards were passed.
    const reviewHeroList = isReview ? reviewCardList(hero, 2) : [];
    const reviewBoardList = isReview ? reviewCardList(board, 5) : [];
    const reviewHeroShared = reviewHeroList.length === 2;
    const reviewAnonymized = firstQuery(anon) !== '0';
    const reviewDetails = isReview
        ? [
            reviewText(street, 12).toUpperCase(),
            reviewText(position, 8).toUpperCase(),
            reviewText(stakes, 24),
            reviewText(venue, 24),
        ].filter(Boolean)
        : [];
    const reviewTitle = isReview ? (reviewText(hand, 60) || 'Poker Hand Review') : '';

    const heroCards = isReview
        ? (reviewHeroShared ? reviewHeroList : []).map(c => parseCard(c)).filter(Boolean)
        : (hero || 'Ah,Kh').split(',').filter(Boolean).map(c => parseCard(c.trim())).filter(Boolean);
    const boardCards = isReview
        ? reviewBoardList.map(c => parseCard(c)).filter(Boolean)
        : (board || '').split(',').filter(Boolean).map(c => parseCard(c.trim())).filter(Boolean);
    const isWin = !isReview && ((result || '').toLowerCase().includes('won') || (amount || '').startsWith('+'));

    const ogParams = isReview
        ? new URLSearchParams({
            view: 'review',
            ...(reviewHeroShared ? { hero: reviewHeroList.join(',') } : {}),
            ...(reviewBoardList.length > 0 ? { board: reviewBoardList.join(',') } : {}),
            ...(reviewText(street, 12) ? { street: reviewText(street, 12).toLowerCase() } : {}),
            ...(reviewText(position, 8) ? { position: reviewText(position, 8) } : {}),
            ...(reviewText(stakes, 24) ? { stakes: reviewText(stakes, 24) } : {}),
            ...(reviewText(venue, 24) ? { venue: reviewText(venue, 24) } : {}),
            ...(reviewText(hand, 60) ? { hand: reviewText(hand, 60) } : {}),
        })
        : new URLSearchParams({
            hero: hero || 'Ah,Kh',
            board: board || '',
            result: result || 'Won',
            amount: amount || '+$1,250',
            stakes: stakes || '$1/$3 NLH',
            venue: venue || 'Live Poker',
            pot: pot || '$2,500',
            player: player || 'Smarter.Poker Player',
            hand: hand || '',
        });
    const ogImageUrl = `https://smarter.poker/api/og/hand-card?${ogParams.toString()}`;

    const title = isReview
        ? `${reviewTitle} | Smarter.Poker`
        : `${player || 'Player'} ${result || 'played'} at ${venue || 'Poker'} - ${amount || ''} | Smarter.Poker`;
    const description = isReview
        ? `Read-only poker hand review${reviewDetails.length ? ` - ${reviewDetails.join(' - ')}` : ''}. Analyze your own hands with the Smarter.Poker Personal Assistant.`
        : `${hand ? hand + ' - ' : ''}${stakes || 'Cash Game'} at ${venue || 'Live Poker'}. Pot: ${pot || '?'}. See the full hand analysis on Smarter.Poker!`;

    return (
        <>
            <Head>
                <title>{title}</title>
                <meta key="description" name="description" content={description} />
                <meta key="og-title" property="og:title" content={title} />
                <meta key="og-description" property="og:description" content={description} />
                <meta key="og-image" property="og:image" content={ogImageUrl} />
                <meta key="og-image-width" property="og:image:width" content="800" />
                <meta key="og-image-height" property="og:image:height" content="420" />
                <meta key="og-image-type" property="og:image:type" content="image/png" />
                <meta key="og-type" property="og:type" content="website" />
                <meta key="og-url" property="og:url" content={`https://smarter.poker/share/hand`} />
                <meta key="twitter-card" name="twitter:card" content="summary_large_image" />
                <meta key="twitter-title" name="twitter:title" content={title} />
                <meta key="twitter-description" name="twitter:description" content={description} />
                <meta key="twitter-image" name="twitter:image" content={ogImageUrl} />
                <meta key="viewport" name="viewport" content="width=device-width, initial-scale=1" />
                {isReview && <meta key="robots" name="robots" content="noindex,nofollow" />}
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
                        {isReview ? reviewTitle : `${player || 'A Smarter Player'} ${isWin ? 'Won' : 'Played'} ${amount || ''}`}
                    </div>
                    {!isReview && hand && (
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
                        {isReview
                            ? (reviewDetails.join(' · ') || 'Details Not Shared')
                            : `${stakes || 'Cash Game'} At ${venue || 'Live Poker'} - Pot: ${pot || '?'}`}
                    </div>
                </div>

                {/* Review links: explicit cards only, opponents anonymized */}
                {isReview && (
                    <div
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 40, maxWidth: 500, textAlign: 'center' }}
                        data-share-review="true"
                    >
                        {heroCards.length > 0 ? (
                            <div style={{ display: 'flex', gap: 8 }} aria-label="Hole Cards">
                                {heroCards.map((c, i) => (
                                    <div key={i} style={{
                                        width: 64, height: 90, borderRadius: 10,
                                        background: 'linear-gradient(135deg, #1a1a3e, #2a2a5e)',
                                        border: '2px solid rgba(255,215,0,0.3)',
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <span style={{ fontSize: 26, fontWeight: 900, color: c.color }}>{c.rank}</span>
                                        <span style={{ fontSize: 22, color: c.color, marginTop: -4 }}>{c.suit}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>Hole Cards Hidden By The Player</div>
                        )}
                        {boardCards.length > 0 && (
                            <div style={{ display: 'flex', gap: 6 }} aria-label="Board">
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
                        )}
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                            {reviewAnonymized ? 'Opponents: Anonymized Villain' : 'Opponent Names Are Not Included In This Link'}
                        </div>
                    </div>
                )}

                {/* Interactive card display */}
                {!isReview && heroCards.length > 0 && (
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
                                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 20 }}>Vs</div>
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
                {isReview ? (
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <a
                            href="/hub/personal-assistant"
                            style={{
                                padding: '14px 32px',
                                minHeight: 44,
                                borderRadius: 12,
                                background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                                color: '#000',
                                fontWeight: 800,
                                fontSize: 16,
                                textDecoration: 'none',
                                boxShadow: '0 4px 20px rgba(255,215,0,0.3)',
                            }}
                        >
                            Analyze Your Own Hands
                        </a>
                    </div>
                ) : (
                <>
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
                        href="https://smarter.poker/hub/poker-near-me/lobby"
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
                </>
                )}

                {/* Footer */}
                <div style={{
                    marginTop: 48,
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.2)',
                    textAlign: 'center',
                }}>
                    The #1 Poker Intelligence Platform - Track, Train, Dominate.
                </div>
            </div>
        </>
    );
}
