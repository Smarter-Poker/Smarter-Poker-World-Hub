/**
 * Share Hand Landing Page
 * /share/hand?hero=As,Kd&board=Qh,Jh,Th&result=Won&amount=+$420&...
 *
 * Displays the OG image as a card with CTA to sign up / explore more.
 * Includes proper OG meta tags for social sharing.
 *
 * Both view=review (Personal Assistant read-only hand review links) and standard links are HONEST:
 * they render only sanitized parameters that were explicitly passed (never fabricated cards,
 * amounts, pots, stakes, or win results). Review links keep hole cards hidden unless `hero`
 * carries two to six valid cards (NLH, Pineapple, PLO4/5/6), label opponents as anonymized,
 * and are excluded from search indexing.
 */
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';

const SUITS = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_COLORS = { c: '#4DE0A5', d: '#56D8FF', h: '#FF6B7A', s: '#F1F5FC' };

function parseCard(str) {
    if (!str || str.length < 2) return null;
    const rank = str.slice(0, -1).toUpperCase().replace(/^T$/, '10');
    const s = str.slice(-1).toLowerCase();
    return { rank, suit: SUITS[s] || '?', color: SUIT_COLORS[s] || '#F1F5FC' };
}

function PlayingCard({ card, variant = 'hero', compact = false }) {
    const isBoard = variant === 'board';
    const width = isBoard ? 48 : (compact ? 52 : 64);
    const height = isBoard ? 68 : (compact ? 74 : 90);
    const rankSize = isBoard ? 20 : (compact ? 22 : 26);
    const suitSize = isBoard ? 16 : (compact ? 18 : 22);
    return (
        <div
            data-playing-card={variant}
            style={{
                width,
                height,
                borderRadius: isBoard ? 8 : (compact ? 9 : 10),
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
                fontSize: rankSize,
                fontWeight: isBoard ? 800 : 900,
                color: card.color,
                lineHeight: 1.05,
                fontVariantNumeric: 'tabular-nums',
            }}>
                {card.rank}
            </span>
            <span style={{
                fontSize: suitSize,
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

    // Explicit sanitized parameters only (no fabricated defaults in either mode).
    // Supports NLH (2), Pineapple (3), PLO4 (4), PLO5 (5), and PLO6 (6) hole cards.
    const cleanHeroList = reviewCardList(hero, 6);
    const cleanBoardList = reviewCardList(board, 5);
    const reviewHeroShared = isReview && cleanHeroList.length >= 2 && cleanHeroList.length <= 6;
    const reviewAnonymized = firstQuery(anon) !== '0';

    const cleanResult = isReview ? '' : reviewText(result, 24);
    const cleanAmount = isReview ? '' : reviewText(amount, 24);
    const cleanStakes = reviewText(stakes, 24);
    const cleanVenue = reviewText(venue, 24);
    const cleanPot = isReview ? '' : reviewText(pot, 24);
    const cleanPlayer = isReview ? '' : reviewText(player, 40);
    const cleanHand = reviewText(hand, 60);
    const cleanStreet = reviewText(street, 12);
    const cleanPosition = reviewText(position, 8);

    const reviewDetails = isReview
        ? [
            cleanStreet.toUpperCase(),
            cleanPosition.toUpperCase(),
            cleanStakes,
            cleanVenue,
        ].filter(Boolean)
        : [];
    const reviewTitle = isReview ? (reviewText(hand, 60) || 'Poker Hand Review') : '';

    const heroCards = (isReview ? (reviewHeroShared ? cleanHeroList : []) : cleanHeroList)
        .map(c => parseCard(c))
        .filter(Boolean);
    const boardCards = cleanBoardList.map(c => parseCard(c)).filter(Boolean);
    const isWin = !isReview && (cleanResult.toLowerCase().includes('won') || cleanAmount.startsWith('+'));

    const ogParams = isReview
        ? new URLSearchParams({
            view: 'review',
            ...(reviewHeroShared ? { hero: cleanHeroList.join(',') } : {}),
            ...(cleanBoardList.length > 0 ? { board: cleanBoardList.join(',') } : {}),
            ...(cleanStreet ? { street: cleanStreet.toLowerCase() } : {}),
            ...(cleanPosition ? { position: cleanPosition } : {}),
            ...(cleanStakes ? { stakes: cleanStakes } : {}),
            ...(cleanVenue ? { venue: cleanVenue } : {}),
            ...(cleanHand ? { hand: cleanHand } : {}),
        })
        : new URLSearchParams({
            ...(cleanHeroList.length > 0 ? { hero: cleanHeroList.join(',') } : {}),
            ...(cleanBoardList.length > 0 ? { board: cleanBoardList.join(',') } : {}),
            ...(cleanResult ? { result: cleanResult } : {}),
            ...(cleanAmount ? { amount: cleanAmount } : {}),
            ...(cleanStakes ? { stakes: cleanStakes } : {}),
            ...(cleanVenue ? { venue: cleanVenue } : {}),
            ...(cleanPot ? { pot: cleanPot } : {}),
            ...(cleanPlayer ? { player: cleanPlayer } : {}),
            ...(cleanHand ? { hand: cleanHand } : {}),
        });
    const ogQueryString = ogParams.toString();
    const ogImagePath = ogQueryString
        ? `/api/og/hand-card?${ogQueryString}`
        : '/api/og/hand-card';
    const ogImageUrl = `https://smarter.poker${ogImagePath}`;

    const allowedShareKeys = isReview
        ? ['view', 'hero', 'board', 'street', 'position', 'stakes', 'venue', 'hand', 'anon']
        : ['hero', 'board', 'result', 'amount', 'stakes', 'venue', 'pot', 'player', 'hand'];
    const ogUrlParams = new URLSearchParams();
    for (const key of allowedShareKeys) {
        if (key === 'view' && isReview) {
            ogUrlParams.set('view', 'review');
        } else if (key === 'anon' && isReview && anon) {
            ogUrlParams.set('anon', anon === '0' ? '0' : '1');
        } else if (ogParams.has(key)) {
            ogUrlParams.set(key, ogParams.get(key));
        }
    }
    const shareQueryString = ogUrlParams.toString();
    const ogUrl = shareQueryString
        ? `https://smarter.poker/share/hand?${shareQueryString}`
        : 'https://smarter.poker/share/hand';

    const standardHeading = (cleanResult || cleanAmount)
        ? [cleanPlayer || 'A Smarter Player', isWin ? 'Won' : (cleanResult || 'Played'), cleanAmount].filter(Boolean).join(' ')
        : (cleanPlayer ? `${cleanPlayer} Shared A Hand` : 'Smarter.Poker Hand Snapshot');

    const standardDetailParts = [];
    if (cleanStakes && cleanVenue) {
        standardDetailParts.push(`${cleanStakes} At ${cleanVenue}`);
    } else if (cleanStakes) {
        standardDetailParts.push(cleanStakes);
    } else if (cleanVenue) {
        standardDetailParts.push(cleanVenue);
    }
    if (cleanPot) {
        standardDetailParts.push(`Pot: ${cleanPot}`);
    }
    const standardDetailsText = standardDetailParts.join(' - ') || 'Hand Details Not Shared';

    const imageAlt = isReview
        ? (reviewDetails.length ? `${reviewTitle} (${reviewDetails.join(', ')})` : reviewTitle)
        : (cleanPlayer ? `${cleanPlayer}'s Poker Hand` : 'Smarter.Poker Hand Snapshot');

    useEffect(() => {
        setImageError(false);
        setImageLoaded(false);
        if (imgRef.current?.complete) {
            if (imgRef.current.naturalWidth > 0) {
                setImageLoaded(true);
            } else {
                setImageError(true);
            }
        }
    }, [ogImagePath]);

    const title = isReview
        ? `${reviewTitle} | Smarter.Poker`
        : `${standardHeading} | Smarter.Poker`;
    const description = isReview
        ? `Read-only poker hand review${reviewDetails.length ? ` - ${reviewDetails.join(' - ')}` : ''}. Analyze your own hands with the Smarter.Poker Personal Assistant.`
        : `${cleanHand ? `${cleanHand} - ` : ''}${standardDetailsText}. See the full hand analysis on Smarter.Poker!`;

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

    const clubArenaRailStyle = {
        width: '100%',
        maxWidth: 560,
        marginBottom: 32,
        padding: 10,
        borderRadius: 28,
        background: 'linear-gradient(180deg, #8b5530 0%, #5c3318 42%, #331a0c 100%)',
        border: '1px solid rgba(212, 175, 118, 0.42)',
        boxShadow: '0 22px 54px rgba(0, 0, 0, 0.68), inset 0 2px 3px rgba(240, 206, 158, 0.24), inset 0 -4px 10px rgba(0, 0, 0, 0.65)',
        boxSizing: 'border-box',
    };

    const clubArenaFeltStyle = {
        position: 'relative',
        borderRadius: 20,
        padding: '18px 20px 22px',
        background: 'radial-gradient(ellipse at 50% 34%, #1b6b44 0%, #104b2e 58%, #072c1a 100%)',
        border: '1px solid rgba(204, 168, 78, 0.46)',
        boxShadow: 'inset 0 0 0 5px rgba(7, 24, 15, 0.58), inset 0 10px 28px rgba(0, 0, 0, 0.48)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        textAlign: 'center',
    };

    const clubArenaPotPillStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '6px 16px',
        borderRadius: 999,
        background: 'rgba(4, 12, 22, 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(86, 216, 255, 0.42)',
        color: '#f1f5fc',
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: '0.08em',
        fontVariantNumeric: 'tabular-nums',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.42)',
    };

    const clubArenaWatermarkStyle = {
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: '0.16em',
        color: 'rgba(220, 238, 232, 0.48)',
        textTransform: 'uppercase',
        userSelect: 'none',
    };

    const potPillLabel = cleanPot ? `POT · ${cleanPot}` : 'POT · NOT SHARED';

    return (
        <>
            <Head>
                <title>{title}</title>
                <meta key="description" name="description" content={description} />
                <meta key="og-title" property="og:title" content={title} />
                <meta key="og-description" property="og:description" content={description} />
                <meta key="og-image" property="og:image" content={ogImageUrl} />
                <meta key="og-image-width" property="og:image:width" content="1200" />
                <meta key="og-image-height" property="og:image:height" content="630" />
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
                        maxWidth: 560,
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
                            src={ogImagePath}
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
                        {isReview ? reviewTitle : standardHeading}
                    </h1>
                    {!isReview && cleanHand && (
                        <div style={{
                            fontSize: 16,
                            color: '#83deff',
                            fontWeight: 700,
                            marginBottom: 4,
                        }}>
                            {cleanHand}
                        </div>
                    )}
                    <div style={{
                        fontSize: 14,
                        color: '#b6c8d6',
                    }}>
                        {isReview
                            ? (reviewDetails.join(' · ') || 'Details Not Shared')
                            : standardDetailsText}
                    </div>
                </div>

                {/* Review links: explicit cards only, opponents anonymized */}
                {isReview && (
                    <div
                        data-share-review="true"
                        data-share-club-arena-table="true"
                        style={clubArenaRailStyle}
                    >
                        <div style={clubArenaFeltStyle}>
                            <div data-share-felt-watermark="true" style={clubArenaWatermarkStyle}>
                                SMARTER.POKER · CLUB ARENA
                            </div>
                            <div data-share-pot-pill="true" style={clubArenaPotPillStyle}>
                                {potPillLabel}
                            </div>
                            {boardCards.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                    <div style={{ color: '#c4dbd0', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Board</div>
                                    <div style={{ display: 'flex', gap: 6 }} aria-label="Board">
                                        {boardCards.map((c, i) => (
                                            <PlayingCard key={i} card={c} variant="board" />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {heroCards.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                    <div style={{ color: '#c4dbd0', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Hole Cards</div>
                                    <div style={{ display: 'flex', gap: heroCards.length > 4 ? 6 : 8, flexWrap: 'wrap', justifyContent: 'center' }} aria-label="Hole Cards">
                                        {heroCards.map((c, i) => (
                                            <PlayingCard key={i} card={c} variant="hero" compact={heroCards.length > 4} />
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ fontSize: 14, color: '#dce5ef', fontWeight: 600 }}>Hole Cards Hidden By The Player</div>
                            )}
                            <div style={{ fontSize: 13, color: '#cfe0d8' }}>
                                {reviewAnonymized ? 'Opponents: Anonymized Villain' : 'Opponent Names Are Not Included In This Link'}
                            </div>
                        </div>
                    </div>
                )}

                {/* Interactive card display */}
                {!isReview && (heroCards.length > 0 || boardCards.length > 0) && (
                    <div
                        data-share-club-arena-table="true"
                        style={clubArenaRailStyle}
                    >
                        <div style={clubArenaFeltStyle}>
                            <div data-share-felt-watermark="true" style={clubArenaWatermarkStyle}>
                                SMARTER.POKER · CLUB ARENA
                            </div>
                            <div data-share-pot-pill="true" style={clubArenaPotPillStyle}>
                                {potPillLabel}
                            </div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 20,
                                flexWrap: 'wrap',
                                justifyContent: 'center',
                            }}>
                                {heroCards.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                        <div style={{ color: '#c4dbd0', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Hole Cards</div>
                                        <div style={{ display: 'flex', gap: heroCards.length > 4 ? 6 : 8, flexWrap: 'wrap', justifyContent: 'center' }} aria-label="Hole Cards">
                                            {heroCards.map((c, i) => (
                                                <PlayingCard key={i} card={c} variant="hero" compact={heroCards.length > 4} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {heroCards.length > 0 && boardCards.length > 0 && (
                                    <div
                                        aria-hidden="true"
                                        style={{ width: 1, height: 64, background: 'rgba(174, 192, 208, 0.36)' }}
                                    />
                                )}
                                {boardCards.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                        <div data-testid="share-board-label" style={{ color: '#c4dbd0', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Board</div>
                                        <div style={{ display: 'flex', gap: 6 }} aria-label="Board">
                                            {boardCards.map((c, i) => (
                                                <PlayingCard key={i} card={c} variant="board" />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
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
