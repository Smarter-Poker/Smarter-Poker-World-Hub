/**
 * BLOCKER SCORE PANEL — Card Removal Effect Analysis
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculates how holding specific cards changes villain's range composition.
 * Shows blocker impact score for value combos vs bluff combos.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// BLOCKER MATH ENGINE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['s', 'h', 'd', 'c'];

/**
 * Count how many combos of a hand class are blocked by held cards.
 * For pairs: 6 total combos, each held card of that rank removes 3.
 * For suited: 4 total combos, each held card removes 1 matching suit.
 * For offsuit: 12 total combos, each held card removes 3 or 4 combos.
 */
export function countBlockedCombos(handClass, heldCards) {
    if (!handClass || !heldCards || heldCards.length === 0) return { total: 0, blocked: 0 };

    const r1 = handClass[0];
    const r2 = handClass.length >= 2 ? handClass[1] : r1;
    const isPair = r1 === r2;
    const isSuited = handClass.length === 3 && handClass[2] === 's';

    const heldRanks = heldCards.map(c => c[0].toUpperCase());
    const heldSuits = heldCards.map(c => c[c.length - 1].toLowerCase());

    if (isPair) {
        const total = 6;
        const matchingCards = heldRanks.filter(r => r === r1).length;
        const blocked = matchingCards * 3 - (matchingCards > 1 ? matchingCards - 1 : 0);
        return { total, blocked: Math.min(blocked, total) };
    }

    if (isSuited) {
        const total = 4;
        let blocked = 0;
        heldCards.forEach(c => {
            const cr = c[0].toUpperCase();
            if (cr === r1 || cr === r2) blocked++;
        });
        return { total, blocked: Math.min(blocked, total) };
    }

    // Offsuit
    const total = 12;
    let blocked = 0;
    heldCards.forEach(c => {
        const cr = c[0].toUpperCase();
        if (cr === r1) blocked += 3;
        else if (cr === r2) blocked += 3;
    });
    return { total, blocked: Math.min(blocked, total) };
}

/**
 * Categorize hands into value/bluff/marginal based on action frequencies.
 * Value: high raise/bet frequency (>50%)
 * Bluff: high fold frequency (>50%)
 * Marginal: everything else (call/check heavy)
 */
function categorizeHands(gridData, actions) {
    if (!gridData || !actions) return { value: [], bluff: [], marginal: [] };

    const value = [];
    const bluff = [];
    const marginal = [];

    // gridData is 13x13 with action frequencies per cell
    RANKS.forEach((r1, i) => {
        RANKS.forEach((r2, j) => {
            const handKey = i <= j
                ? (i === j ? `${r1}${r2}` : `${r1}${r2}s`)
                : `${r2}${r1}o`;

            const cell = gridData?.[i]?.[j];
            if (!cell || !cell.actions) return;

            const raiseFreq = (cell.actions.r || 0) + (cell.actions.R || 0) + (cell.actions.b || 0) + (cell.actions.B || 0);
            const foldFreq = cell.actions.f || cell.actions.F || 0;
            const total = Object.values(cell.actions || {}).reduce((s, v) => s + v, 0);

            if (total === 0) return;

            const raisePct = (raiseFreq / total) * 100;
            const foldPct = (foldFreq / total) * 100;

            if (raisePct > 50) value.push(handKey);
            else if (foldPct > 50) bluff.push(handKey);
            else marginal.push(handKey);
        });
    });

    return { value, bluff, marginal };
}

/**
 * Calculate overall blocker score for held cards against a range category.
 */
function calculateBlockerScore(hands, heldCards) {
    if (!hands || hands.length === 0 || !heldCards || heldCards.length === 0) return 0;

    let totalCombos = 0;
    let blockedCombos = 0;

    hands.forEach(hand => {
        const { total, blocked } = countBlockedCombos(hand, heldCards);
        totalCombos += total;
        blockedCombos += blocked;
    });

    if (totalCombos === 0) return 0;
    return Math.round((blockedCombos / totalCombos) * 100);
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CARD DISPLAY
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function MiniCard({ card, size = 20 }) {
    if (!card) return null;
    const rank = card[0] === 'T' ? '10' : card[0].toUpperCase();
    const suit = card[card.length - 1].toLowerCase();
    const suitSymbol = { s: '♠', h: '♥', d: '♦', c: '♣' }[suit] || '?';
    const suitColor = { s: '#e2e8f0', h: '#ef4444', d: '#3b82f6', c: '#22c55e' }[suit] || '#fff';

    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: size, height: size * 1.35, background: '#fff', borderRadius: 3,
            fontSize: size * 0.38, fontWeight: 800, color: suitColor,
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }}>
            {rank}{suitSymbol}
        </span>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// SCORE BAR COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function ScoreBar({ label, score, color, detail }) {
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace" }}>
                    {score}%
                </span>
            </div>
            <div style={{
                height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
            }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(score, 100)}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    style={{ height: '100%', borderRadius: 4, background: color }}
                />
            </div>
            {detail && (
                <div style={{ fontSize: 9, color: '#64748b', marginTop: 3, fontWeight: 600 }}>
                    {detail}
                </div>
            )}
        </div>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PANEL COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function BlockerScorePanel({ board, gridData, actions, heldCards }) {
    const analysis = useMemo(() => {
        if (!board || board.length < 3 || !gridData) return null;

        // Parse held cards from board context or explicit prop
        const cards = heldCards || [];
        if (cards.length === 0) return null;

        const categories = categorizeHands(gridData, actions);
        const valueBlocker = calculateBlockerScore(categories.value, cards);
        const bluffBlocker = calculateBlockerScore(categories.bluff, cards);
        const marginalBlocker = calculateBlockerScore(categories.marginal, cards);

        // Composite score: blocking value is bad (villain folds), blocking bluffs is good
        const compositeScore = Math.round(
            (bluffBlocker * 0.5 + marginalBlocker * 0.3 - valueBlocker * 0.2 + 50)
        );

        return {
            valueBlocker,
            bluffBlocker,
            marginalBlocker,
            compositeScore: Math.max(0, Math.min(100, compositeScore)),
            valueCombos: categories.value.length,
            bluffCombos: categories.bluff.length,
            marginalCombos: categories.marginal.length,
        };
    }, [board, gridData, actions, heldCards]);

    if (!analysis) {
        return (
            <div style={{
                padding: 20, textAlign: 'center', color: '#475569', fontSize: 12,
            }}>
                Select a hand combo from the grid to see blocker analysis
            </div>
        );
    }

    const compositeColor = analysis.compositeScore >= 70 ? '#22c55e'
        : analysis.compositeScore >= 40 ? '#eab308' : '#ef4444';

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: 16,
            }}
        >
            {/* Header */}
            <div style={{
                fontSize: 11, fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
                fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                display: 'flex', alignItems: 'center', gap: 8,
            }}>
                <span>Blocker Analysis</span>
                {heldCards && heldCards.length > 0 && (
                    <div style={{ display: 'flex', gap: 2 }}>
                        {heldCards.map((c, i) => <MiniCard key={i} card={c} size={18} />)}
                    </div>
                )}
            </div>

            {/* Composite Score */}
            <div style={{
                textAlign: 'center', padding: '12px 0', marginBottom: 12,
                background: 'rgba(0,0,0,0.2)', borderRadius: 10,
            }}>
                <div style={{
                    fontSize: 32, fontWeight: 900, color: compositeColor,
                    fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                }}>
                    {analysis.compositeScore}
                </div>
                <div style={{
                    fontSize: 9, fontWeight: 700, color: '#64748b',
                    textTransform: 'uppercase', letterSpacing: 1.5,
                }}>
                    Blocker Score
                </div>
            </div>

            {/* Breakdown Bars */}
            <ScoreBar
                label="Blocks Value Hands"
                score={analysis.valueBlocker}
                color="#ef4444"
                detail={`${analysis.valueCombos} value combos in range`}
            />
            <ScoreBar
                label="Blocks Bluff Hands"
                score={analysis.bluffBlocker}
                color="#22c55e"
                detail={`${analysis.bluffCombos} bluff combos in range`}
            />
            <ScoreBar
                label="Blocks Marginal Hands"
                score={analysis.marginalBlocker}
                color="#eab308"
                detail={`${analysis.marginalCombos} marginal combos in range`}
            />

            {/* Legend */}
            <div style={{
                marginTop: 10, padding: '8px 10px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                fontSize: 10, color: '#64748b', lineHeight: 1.5,
            }}>
                <strong style={{ color: '#94a3b8' }}>How to read:</strong> Blocking villain's{' '}
                <span style={{ color: '#22c55e' }}>bluffs</span> is good (they can't bluff as often).
                Blocking their <span style={{ color: '#ef4444' }}>value</span> means they fold those combos
                (bad for your bluff catch equity). High composite = strong blocker hand.
            </div>
        </motion.div>
    );
}
