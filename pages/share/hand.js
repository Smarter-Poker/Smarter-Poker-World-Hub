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
import { useEffect, useRef, useState } from 'react';

const SUITS = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_COLORS = { c: '#4DE0A5', d: '#56D8FF', h: '#FF6B7A', s: '#F1F5FC' };

function parseCard(str) {
    if (!str || str.length < 2) return null;
    const rank = str.slice(0, -1).replace('T', '10');
    const s = str.slice(-1).toLowerCase();
    return { rank, suit: SUITS[s] || '?', color: SUIT_COLORS[s] || '#F1F5FC' };
}

function PlayingCard({ card, variant = 'hero' }) {
    const isBoard = variant === 'board';
    return (
        <div
            data-playing-card={variant}
            style={{
                width: isBoard ? 48 : 64,
                height: isBoard ? 68 : 90,
                borderRadius: isBoard ? 8 : 10,
                background: isBoard
                    ? 'linear-gradient(155deg, #0c1b2c 0%, #06101b 100%)'
                    : 'linear-gradient(155deg, #102235 0%, #07111c 100%)',
                border: isBoard
                    ? '1px solid rgba(140, 161, 180, 0.28)'
                    : '1px solid rgba(86, 216, 255, 0.36)',
                borderTopColor: isBoard ? '#aec0d0' : '#b3eaff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isBoard
                    ? '0 4px 12px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
                    : '0 8px 20px rgba(0, 0, 0, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
            }}
        >
            <span style={{
                fontSize: isBoard ? 20 : 26,
                fontWeight: isBoard ? 800 : 900,
                color: card.color,
                lineHeight: 1.05,
                fontVariantNumeric: 'tabular-nums',
            }}>
                {card.rank}
            </span>
            <span style={{
                fontSize: isBoard ? 16 : 22,
                color: card.color,
                marginTop: isBoard ? -2 : -4,
                lineHeight: 1,
            }}>
                {card.suit}
            </span>
        </div>
    );
}

const REVIEW_CARD = /^(?:10|[2-9TJQKA])[shdc]$/i;

function firstQuery(value) {
    return Array.isArray(value) ? value[0] : value;
}

function scalarParam(value) {
    const first = firstQuery(value);
    return typeof first === 'string' ? first : '';
}

function reviewCardList(raw, max) {
    return scalarParam(raw)
        .split(',')
        .map(c => c.trim())
        .filter(c => REVIEW_CARD.test(c))
        .slice(0, max);
}

function reviewText(raw, max = 48) {
    return scalarParam(raw).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function getServerSideProps({ query = {}, res }) {
    if (scalarParam(query?.view) === 'review' && res) {
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
    const rawQuery = router.isReady && router.query && Object.keys(router.query).length > 0
        ? router.query
        : initialQuery;
    const resolvedQuery = {};
    for (const [k, v] of Object.entries(rawQuery || {})) {
        const val = firstQuery(v);
        if (typeof val === 'string') resolvedQuery[k] = val;
    }
    const hero = scalarParam(resolvedQuery.hero);
    const board = scalarParam(resolvedQuery.board);
    const result = scalarParam(resolvedQuery.result);
    const amount = scalarParam(resolvedQuery.amount);
    const stakes = scalarParam(resolvedQuery.stakes);
    const venue = scalarParam(resolvedQuery.venue);
    const pot = scalarParam(resolvedQuery.pot);
    const player = scalarParam(resolvedQuery.player);
    const hand = scalarParam(resolvedQuery.hand);
    const view = scalarParam(resolvedQuery.view);
    const street = scalarParam(resolvedQuery.street);
    const position = scalarParam(resolvedQuery.position);
    const anon = scalarParam(resolvedQuery.anon);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const imgRef = useRef(null);
    const isReview = view === 'review';

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
    const shareQueryString = new URLSearchParams(resolvedQuery).toString();
    const ogUrl = shareQueryString
        ? `https://smarter.poker/share/hand?${shareQueryString}`
        : 'https://smarter.poker/share/hand';
    const imageAlt = isReview
        ? (reviewDetails.length ? `${reviewTitle} (${reviewDetails.join(', ')})` : reviewTitle)
        : `${player || 'Player'}'s poker hand`;

    useEffect(() => {
        setImageError(false);
        if (imgRef.current?.complete) {
            if (imgRef.current.naturalWidth > 0) {
                setImageLoaded(true);
            } else {
                setImageLoaded(true);
            }
        }
    }, [ogImageUrl]);

    const title = isReview
        ? `${reviewTitle} | Smarter.Poker`
        : `${player || 'Player'} ${result || 'played'} at ${venue || 'Poker'} - ${amount || ''} | Smarter.Poker`;
    const description = isReview
        ? `Read-only poker hand review${reviewDetails.length ? ` - ${reviewDetails.join(' - ')}` : ''}. Analyze your own hands with the Smarter.Poker Personal Assistant.`
        : `${hand ? hand + ' - ' : ''}${stakes || 'Cash Game'} at ${venue || 'Live Poker'}. Pot: ${pot || '?'}. See the full hand analysis on Smarter.Poker!`;

    const primaryCtaStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px 28px',
        minHeight: 44,
        borderRadius: 10,
        background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 55%, #002b68 100%)',
        border: '1px solid #56d8ff',
        borderTopColor: '#b3eaff',
        color: '#ffffff',
        fontWeight: 800,
        fontSize: 16,
        textDecoration: 'none',
        boxShadow: '0 8px 24px rgba(8, 124, 250, 0.32)',
    };

    const secondaryCtaStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px 28px',
        minHeight: 44,
        borderRadius: 10,
        background: 'linear-gradient(180deg, #152639 0%, #06111e 65%)',
        border: '1px solid rgba(140, 161, 180, 0.28)',
        borderTopColor: '#aec0d0',
        color: '#dce5ef',
        fontWeight: 700,
        fontSize: 16,
        textDecoration: 'none',
    };

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
                <meta key="og-url" property="og:url" content={ogUrl} />
                <meta key="twitter-card" name="twitter:card" content="summary_large_image" />
                <meta key="twitter-title" name="twitter:title" content={title} />
                <meta key="twitter-description" name="twitter:description" content={description} />
                <meta key="twitter-image" name="twitter:image" content={ogImageUrl} />
                <meta key="viewport" name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
                {isReview && <meta key="robots" name="robots" content="noindex,nofollow" />}
            </Head>
            <main
                className="share-hand-page"
                style={{
                    minHeight: '100dvh',
                    overflowX: 'clip',
                    background: 'linear-gradient(180deg, #05080c 0%, #040d18 48%, #020407 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px 16px',
                    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
                    color: '#f1f5fc',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
            >
                {/* Logo */}
                <div style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: '#f1f5fc',
                    letterSpacing: '0.08em',
                    marginBottom: 24,
                    textAlign: 'center',
                }}>
                    SMARTER.POKER
                </div>

                {/* Card Image */}
                <div
                    className="share-cardFrame"
                    style={{
                        maxWidth: 520,
                        width: '100%',
                        borderRadius: 12,
                        overflow: 'hidden',
                        background: 'linear-gradient(145deg, #091727, #05080c 74%)',
                        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.65), 0 0 1px rgba(86, 216, 255, 0.28)',
                        border: '1px solid rgba(140, 161, 180, 0.28)',
                        borderTopColor: '#aec0d0',
                        marginBottom: 28,
                        opacity: imageLoaded || imageError ? 1 : 0.78,
                        transition: 'opacity 0.25s ease',
                    }}
                >
                    {!imageError ? (
                        <img
                            ref={imgRef}
                            src={ogImageUrl}
                            alt={imageAlt}
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                            onLoad={() => setImageLoaded(true)}
                            onError={() => {
                                setImageError(true);
                                setImageLoaded(true);
                            }}
                        />
                    ) : (
                        <div
                            data-testid="share-image-fallback"
                            style={{
                                padding: '24px 16px',
                                textAlign: 'center',
                                color: '#b6c8d6',
                                fontSize: 13,
                                fontWeight: 700,
                            }}
                        >
                            Hand Preview Card
                        </div>
                    )}
                </div>

                {/* Hand details text */}
                <div style={{ textAlign: 'center', marginBottom: 28, maxWidth: 500 }}>
                    <h1 style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: '#f1f5fc',
                        margin: '0 0 8px',
                        lineHeight: 1.2,
                    }}>
                        {isReview ? reviewTitle : `${player || 'A Smarter Player'} ${isWin ? 'Won' : 'Played'} ${amount || ''}`}
                    </h1>
                    {!isReview && hand && (
                        <div style={{
                            fontSize: 16,
                            color: '#83deff',
                            fontWeight: 700,
                            marginBottom: 4,
                        }}>
                            {hand}
                        </div>
                    )}
                    <div style={{
                        fontSize: 14,
                        color: '#b6c8d6',
                    }}>
                        {isReview
                            ? (reviewDetails.join(' · ') || 'Details Not Shared')
                            : `${stakes || 'Cash Game'} At ${venue || 'Live Poker'} - Pot: ${pot || '?'}`}
                    </div>
                </div>

                {/* Review links: explicit cards only, opponents anonymized */}
                {isReview && (
                    <div
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 36, maxWidth: 500, textAlign: 'center' }}
                        data-share-review="true"
                    >
                        {heroCards.length > 0 ? (
                            <div style={{ display: 'flex', gap: 8 }} aria-label="Hole Cards">
                                {heroCards.map((c, i) => (
                                    <PlayingCard key={i} card={c} variant="hero" />
                                ))}
                            </div>
                        ) : (
                            <div style={{ fontSize: 14, color: '#dce5ef' }}>Hole Cards Hidden By The Player</div>
                        )}
                        {boardCards.length > 0 && (
                            <div style={{ display: 'flex', gap: 6 }} aria-label="Board">
                                {boardCards.map((c, i) => (
                                    <PlayingCard key={i} card={c} variant="board" />
                                ))}
                            </div>
                        )}
                        <div style={{ fontSize: 13, color: '#9eb4c8' }}>
                            {reviewAnonymized ? 'Opponents: Anonymized Villain' : 'Opponent Names Are Not Included In This Link'}
                        </div>
                    </div>
                )}

                {/* Interactive card display */}
                {!isReview && heroCards.length > 0 && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 20,
                        marginBottom: 36,
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                    }}>
                        <div style={{ display: 'flex', gap: 8 }} aria-label="Hole Cards">
                            {heroCards.map((c, i) => (
                                <PlayingCard key={i} card={c} variant="hero" />
                            ))}
                        </div>
                        {boardCards.length > 0 && (
                            <>
                                <div style={{ color: '#9eb4c8', fontSize: 18, fontWeight: 700 }}>Vs</div>
                                <div style={{ display: 'flex', gap: 6 }} aria-label="Board">
                                    {boardCards.map((c, i) => (
                                        <PlayingCard key={i} card={c} variant="board" />
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
                            className="share-ctaPrimary"
                            style={primaryCtaStyle}
                        >
                            Analyze Your Own Hands
                        </a>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <a
                            href="https://smarter.poker/hub"
                            className="share-ctaPrimary"
                            style={primaryCtaStyle}
                        >
                            Join Smarter.Poker
                        </a>
                        <a
                            href="https://smarter.poker/hub/poker-near-me/lobby"
                            className="share-ctaSecondary"
                            style={secondaryCtaStyle}
                        >
                            Find Games Near You
                        </a>
                    </div>
                )}

                {/* Footer */}
                <div style={{
                    marginTop: 48,
                    fontSize: 12,
                    color: '#9eb4c8',
                    textAlign: 'center',
                }}>
                    The #1 Poker Intelligence Platform - Track, Train, Dominate.
                </div>
            </main>
            <style jsx>{`
                .share-ctaPrimary,
                .share-ctaSecondary {
                    transition: transform 0.14s ease, filter 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
                }
                .share-ctaPrimary:hover {
                    filter: brightness(1.1);
                    box-shadow: 0 10px 28px rgba(86, 216, 255, 0.36);
                }
                .share-ctaSecondary:hover {
                    border-color: #56d8ff !important;
                    color: #ffffff !important;
                    filter: brightness(1.08);
                }
                @media (prefers-reduced-motion: no-preference) {
                    .share-ctaPrimary:active,
                    .share-ctaSecondary:active {
                        transform: scale(0.985);
                    }
                }
                .share-ctaPrimary:focus-visible,
                .share-ctaSecondary:focus-visible {
                    outline: 2px solid #83deff;
                    outline-offset: 2px;
                }
                @media (prefers-reduced-motion: reduce) {
                    .share-ctaPrimary,
                    .share-ctaSecondary,
                    .share-cardFrame {
                        transition: none !important;
                    }
                    .share-ctaPrimary:active,
                    .share-ctaSecondary:active {
                        transform: none !important;
                    }
                }
            `}</style>
        </>
    );
}
