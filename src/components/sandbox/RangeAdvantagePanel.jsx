/**
 * RangeAdvantagePanel · Deterministic Postflop Range & Nut Advantage Math
 * ═══════════════════════════════════════════════════════════════════════════
 * Pure combinatorial range vs. range bucket breakdown on Flop / Turn / River.
 * Compares Hero's position opening range (plus Hero's exact hand) against the
 * active Villain's range across 5 poker hand-strength buckets:
 *   1. Monsters / Sets+ (Sets, Trips, Straights, Flushes, Full Houses+)
 *   2. Two Pair / Overpair
 *   3. Top Pair
 *   4. Draws / Backdoors (Flush Draw, Straight Draw, Backdoor Draws on Flop)
 *   5. Air / Weak (Underpairs, Weak Made Pairs Without Draws, High Card)
 *
 * 100% pure deterministic math. Zero fabricated GTO grades or solver EV.
 */
import React, { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { expandRangeToCombos } from '../../lib/sandbox/EquityEngine';
import { getRangeGrid } from '../../lib/sandbox/PreflopCharts';
import { getArchetypeRangeString } from '../../lib/sandbox/VillainArchetypeRanges';
import { T, F, S, R, pill, numeric as NUM } from './paTokens';

const RANK_VAL = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

const BUCKETS = [
    { id: 'monsters', label: 'Monsters / Sets+', weight: 1.0, color: '#4DE0A5' },
    { id: 'two_pair', label: 'Two Pair / Overpair', weight: 0.78, color: '#56D8FF' },
    { id: 'top_pair', label: 'Top Pair', weight: 0.56, color: '#2F9BFF' },
    { id: 'draws', label: 'Draws / Backdoors', weight: 0.34, color: '#86DAFF' },
    { id: 'air', label: 'Air / Weak', weight: 0.10, color: '#6E88A1' },
];

function parseCard(card) {
    if (!card || typeof card !== 'string' || card.length < 2) return null;
    const rank = card[0].toUpperCase();
    const suit = card[card.length - 1].toLowerCase();
    const val = RANK_VAL[rank];
    if (!val) return null;
    return { rank, suit, val };
}

function hasStraightInMask(mask) {
    let m = mask;
    if (m & (1 << 14)) m |= (1 << 1);
    for (let high = 14; high >= 5; high -= 1) {
        const need = (1 << high) | (1 << (high - 1)) | (1 << (high - 2)) | (1 << (high - 3)) | (1 << (high - 4));
        if ((m & need) === need) return true;
    }
    return false;
}

function hasStraightDrawInMask(mask) {
    let m = mask;
    if (m & (1 << 14)) m |= (1 << 1);
    for (let high = 14; high >= 5; high -= 1) {
        let hits = 0;
        for (let k = 0; k < 5; k += 1) {
            if (m & (1 << (high - k))) hits += 1;
        }
        if (hits === 4) return true;
    }
    return false;
}

function hasBackdoorStraightInMask(mask) {
    let m = mask;
    if (m & (1 << 14)) m |= (1 << 1);
    for (let high = 14; high >= 5; high -= 1) {
        let hits = 0;
        for (let k = 0; k < 5; k += 1) {
            if (m & (1 << (high - k))) hits += 1;
        }
        if (hits >= 3) return true;
    }
    return false;
}

/**
 * Classify a 2-card holding on a 3..5 card board into one of the 5 buckets.
 */
export function classifyComboOnBoard(comboCards, boardCards) {
    const hole = (comboCards || []).map(parseCard).filter(Boolean);
    const board = (boardCards || []).map(parseCard).filter(Boolean);
    if (hole.length < 2 || board.length < 3) return 'air';

    const all = [...hole, ...board];
    const rankCounts = {};
    const boardRankCounts = {};
    const suitCounts = { s: 0, h: 0, d: 0, c: 0 };
    const holeSuitCounts = { s: 0, h: 0, d: 0, c: 0 };
    let rankMask = 0;

    board.forEach((c) => {
        boardRankCounts[c.val] = (boardRankCounts[c.val] || 0) + 1;
    });
    hole.forEach((c) => {
        holeSuitCounts[c.suit] = (holeSuitCounts[c.suit] || 0) + 1;
    });
    all.forEach((c) => {
        rankCounts[c.val] = (rankCounts[c.val] || 0) + 1;
        suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
        rankMask |= (1 << c.val);
    });

    const sortedBoardVals = [...new Set(board.map((c) => c.val))].sort((a, b) => b - a);
    const topBoardRank = sortedBoardVals[0] || 0;

    const maxSuit = Math.max(suitCounts.s, suitCounts.h, suitCounts.d, suitCounts.c);
    const isFlush = maxSuit >= 5;
    const isStraight = hasStraightInMask(rankMask);

    const counts = Object.values(rankCounts);
    const hasQuads = counts.some((n) => n >= 4);
    const tripRanks = Object.entries(rankCounts).filter(([, n]) => n >= 3).map(([r]) => Number(r));
    const pairRanks = Object.entries(rankCounts).filter(([, n]) => n === 2).map(([r]) => Number(r));
    const isFullHouse = tripRanks.length >= 2 || (tripRanks.length >= 1 && pairRanks.length >= 1);

    // Trips / Sets that actually use at least one hole card
    const heroUsesTrips = tripRanks.some((r) => hole.some((h) => h.val === r));
    if (hasQuads || isFullHouse || isFlush || isStraight || heroUsesTrips) {
        return 'monsters';
    }

    // Two pair using hero cards (avoid counting a double-paired board alone as hero two pair)
    const heroPairs = pairRanks.filter((r) => hole.some((h) => h.val === r));
    const isPocketPair = hole[0].val === hole[1].val;
    const isOverpair = isPocketPair && hole[0].val > topBoardRank;
    if (heroPairs.length >= 2 || (heroPairs.length >= 1 && pairRanks.length >= 2) || isOverpair) {
        return 'two_pair';
    }

    // Top pair (paired with highest board card)
    if (heroPairs.includes(topBoardRank)) {
        return 'top_pair';
    }

    // Draws & Backdoors (only meaningful before river)
    if (board.length < 5) {
        const hasFlushDraw = Object.keys(suitCounts).some((s) => suitCounts[s] === 4 && holeSuitCounts[s] >= 1);
        const hasStraightDraw = hasStraightDrawInMask(rankMask);
        const hasBackdoorFlush = board.length === 3
            && Object.keys(suitCounts).some((s) => suitCounts[s] === 3 && holeSuitCounts[s] >= 1);
        const hasBackdoorStraight = board.length === 3 && hasBackdoorStraightInMask(rankMask)
            && hole.some((h) => Math.abs(h.val - topBoardRank) <= 3);
        if (hasFlushDraw || hasStraightDraw || hasBackdoorFlush || hasBackdoorStraight) {
            return 'draws';
        }
    }

    return 'air';
}

function classifyHeroMultiCard(heroCards, boardCards) {
    if (!Array.isArray(heroCards) || heroCards.length < 2 || !Array.isArray(boardCards) || boardCards.length < 3) {
        return null;
    }
    if (heroCards.length === 2) {
        return classifyComboOnBoard(heroCards, boardCards);
    }
    // PLO4/5/6: evaluate best 2-card subset of Hero's hole cards
    const rankOrder = { monsters: 4, two_pair: 3, top_pair: 2, draws: 1, air: 0 };
    let best = 'air';
    for (let i = 0; i < heroCards.length; i += 1) {
        for (let j = i + 1; j < heroCards.length; j += 1) {
            const b = classifyComboOnBoard([heroCards[i], heroCards[j]], boardCards);
            if (rankOrder[b] > rankOrder[best]) best = b;
        }
    }
    return best;
}

function buildHeroDefaultRangeTokens(heroPosition) {
    const pos = String(heroPosition || 'BTN').toUpperCase();
    const grid = getRangeGrid(pos, 'rfi');
    if (Array.isArray(grid)) {
        const tokens = grid
            .flat()
            .filter((cell) => cell && cell.inRange && cell.action !== 'check')
            .map((cell) => cell.hand);
        if (tokens.length > 0) return tokens;
    }
    const fallback = getArchetypeRangeString('gto_neutral', pos, 'open');
    return fallback ? fallback.split(/[,\s]+/).filter(Boolean) : ['22+', 'A2s+', 'K9s+', 'Q9s+', 'J9s+', 'T9s', '98s', 'ATo+', 'KJo+'];
}

function evaluateRangeBuckets(combos, boardCards) {
    const counts = { monsters: 0, two_pair: 0, top_pair: 0, draws: 0, air: 0 };
    if (!Array.isArray(combos) || combos.length === 0) {
        return { total: 0, pct: { monsters: 0, two_pair: 0, top_pair: 0, draws: 0, air: 0 }, score: 0 };
    }
    combos.forEach((combo) => {
        const bucket = classifyComboOnBoard(combo, boardCards);
        counts[bucket] += 1;
    });
    const total = combos.length;
    const pct = {};
    let weighted = 0;
    BUCKETS.forEach((b) => {
        const share = (counts[b.id] / total) * 100;
        pct[b.id] = Math.round(share * 10) / 10;
        weighted += (counts[b.id] / total) * b.weight;
    });
    return { total, counts, pct, score: Math.round(weighted * 1000) / 10 };
}

export default function RangeAdvantagePanel({
    heroCards = [],
    heroPosition = 'BTN',
    villainRange = '',
    villainPosition = 'BB',
    villainLabel = 'Villain',
    communityCards = [],
    variant = 'nlh',
}) {
    const analysis = useMemo(() => {
        if (!Array.isArray(communityCards) || communityCards.length < 3) return null;
        const boardSet = new Set(communityCards);

        // Hero range: standard opening range for Hero's position, ensuring Hero's exact hand is included
        const heroTokens = buildHeroDefaultRangeTokens(heroPosition);
        const heroCombos = expandRangeToCombos(heroTokens, boardSet);
        if (heroCards.length === 2 && !boardSet.has(heroCards[0]) && !boardSet.has(heroCards[1])) {
            const exists = heroCombos.some(
                (c) => (c[0] === heroCards[0] && c[1] === heroCards[1]) || (c[0] === heroCards[1] && c[1] === heroCards[0]),
            );
            if (!exists) heroCombos.push([heroCards[0], heroCards[1]]);
        }

        // Villain range: explicit range string or default position opening range
        const villainSpec = villainRange && villainRange.trim()
            ? villainRange.trim()
            : (getArchetypeRangeString('gto_neutral', villainPosition || 'BB', 'open') || '22+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,ATo+,KJo+');
        const villainCombos = expandRangeToCombos(villainSpec, boardSet);

        const heroStats = evaluateRangeBuckets(heroCombos, communityCards);
        const villainStats = evaluateRangeBuckets(villainCombos, communityCards);

        const nutDelta = Math.round((heroStats.pct.monsters - villainStats.pct.monsters) * 10) / 10;
        const totalScore = heroStats.score + villainStats.score;
        const heroRangeShare = totalScore > 0 ? Math.round((heroStats.score / totalScore) * 1000) / 10 : 50;
        const rangeDelta = Math.round((heroRangeShare - 50) * 20) / 10; // percentage point lead
        const heroHandBucket = classifyHeroMultiCard(heroCards, communityCards);

        return {
            heroStats,
            villainStats,
            nutDelta,
            heroRangeShare,
            rangeDelta,
            heroHandBucket,
        };
    }, [heroCards, heroPosition, villainRange, villainPosition, communityCards]);

    if (!analysis) return null;

    const { heroStats, villainStats, nutDelta, heroRangeShare, rangeDelta, heroHandBucket } = analysis;
    const heroBucketObj = BUCKETS.find((b) => b.id === heroHandBucket);
    const rangeEdgeTone = rangeDelta > 3 ? 'success' : rangeDelta < -3 ? 'danger' : 'neutral';
    const nutEdgeTone = nutDelta > 2 ? 'success' : nutDelta < -2 ? 'danger' : 'neutral';

    return (
        <section
            data-range-advantage-panel="true"
            aria-label="Range And Nut Advantage Breakdown"
            style={{
                padding: 14,
                border: '5px solid transparent',
                borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
                borderRadius: 10,
                background: 'linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%)',
                boxShadow: 'inset 0 1px 0 rgba(201, 223, 240, 0.16), 0 8px 20px rgba(0, 0, 0, 0.34)',
                display: 'flex',
                flexDirection: 'column',
                gap: S.md,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BarChart3 size={16} strokeWidth={2} color={T.accent} aria-hidden="true" />
                    <h2 style={{
                        margin: 0, color: '#F1F5FC',
                        font: "700 16px / 1.2 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
                    }}>
                        Range &amp; Nut Advantage
                    </h2>
                </div>
                {heroBucketObj && (
                    <span style={{ ...pill('accent'), fontSize: F.caption }}>
                        Hero Hand: {heroBucketObj.label}
                    </span>
                )}
            </div>

            {/* Summary KPI Tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: S.sm }}>
                <div style={{
                    padding: '10px 12px', borderRadius: R.sm,
                    background: T.surface2, border: `1px solid ${T.borderHi}`,
                    display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                    <span style={{ fontSize: F.caption, fontWeight: 700, color: T.textDim, textTransform: 'uppercase' }}>
                        Range Advantage
                    </span>
                    <strong style={{ fontSize: F.h3, fontWeight: 800, color: T.text, ...NUM }}>
                        {heroRangeShare.toFixed(1)}% Vs {(100 - heroRangeShare).toFixed(1)}%
                    </strong>
                    <span style={{ ...pill(rangeEdgeTone), alignSelf: 'flex-start', marginTop: 2 }}>
                        {rangeDelta > 3 ? `Hero +${rangeDelta.toFixed(1)}%` : rangeDelta < -3 ? `Villain +${Math.abs(rangeDelta).toFixed(1)}%` : 'Balanced Range'}
                    </span>
                </div>

                <div style={{
                    padding: '10px 12px', borderRadius: R.sm,
                    background: T.surface2, border: `1px solid ${T.borderHi}`,
                    display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                    <span style={{ fontSize: F.caption, fontWeight: 700, color: T.textDim, textTransform: 'uppercase' }}>
                        Nut Advantage (Sets+)
                    </span>
                    <strong style={{ fontSize: F.h3, fontWeight: 800, color: T.text, ...NUM }}>
                        {heroStats.pct.monsters.toFixed(1)}% Vs {villainStats.pct.monsters.toFixed(1)}%
                    </strong>
                    <span style={{ ...pill(nutEdgeTone), alignSelf: 'flex-start', marginTop: 2 }}>
                        {nutDelta > 2 ? `Hero +${nutDelta.toFixed(1)}%` : nutDelta < -2 ? `Villain +${Math.abs(nutDelta).toFixed(1)}%` : 'Balanced Nuts'}
                    </span>
                </div>
            </div>

            {/* 5-Bucket Combinatorial Distribution */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: F.caption, fontWeight: 700, color: T.textMuted,
                }}>
                    <span>Hero {heroPosition} ({heroStats.total} Combos)</span>
                    <span>{villainLabel} ({villainStats.total} Combos)</span>
                </div>

                {BUCKETS.map((bucket) => {
                    const hPct = heroStats.pct[bucket.id] || 0;
                    const vPct = villainStats.pct[bucket.id] || 0;
                    const isHeroBucket = heroHandBucket === bucket.id;
                    return (
                        <div key={bucket.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                gap: S.xs, fontSize: F.caption,
                            }}>
                                <span style={{ color: bucket.color, fontWeight: 700, ...NUM }}>{hPct.toFixed(1)}%</span>
                                <span style={{
                                    color: isHeroBucket ? '#FFFFFF' : T.textMuted,
                                    fontWeight: isHeroBucket ? 800 : 700,
                                    textAlign: 'center',
                                }}>
                                    {bucket.label}
                                </span>
                                <span style={{ color: '#9EB4C8', fontWeight: 700, ...NUM }}>{vPct.toFixed(1)}%</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, height: 8 }}>
                                <div style={{
                                    background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden',
                                    display: 'flex', justifyContent: 'flex-end',
                                }}>
                                    <div style={{
                                        width: `${Math.min(100, hPct)}%`, height: '100%',
                                        background: bucket.color, borderRadius: 4,
                                    }} />
                                </div>
                                <div style={{
                                    background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden',
                                    display: 'flex', justifyContent: 'flex-start',
                                }}>
                                    <div style={{
                                        width: `${Math.min(100, vPct)}%`, height: '100%',
                                        background: '#7B9AB8', borderRadius: 4,
                                    }} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <p style={{ margin: 0, fontSize: F.caption, color: T.textDim, lineHeight: 1.4 }}>
                {variant !== 'nlh'
                    ? 'Pure Combinatorial Distribution Based On Standard 2-Card Reference Ranges And Best 2-Card Hero Classification.'
                    : 'Pure Combinatorial Distribution Over Current Board Cards. Ungraded Mathematical Reference Only.'}
            </p>
        </section>
    );
}
