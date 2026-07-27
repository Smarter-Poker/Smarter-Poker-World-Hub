/**
 * SolverLineSummary — Human-Readable Strategy Paragraph
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Auto-generates a natural language summary of the solver's strategy
 * from grid data, classification data, and board texture.
 * This is a premium feature — GTO Wizard charges extra for this.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const RANK_NAMES = {
    A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: 'Ten',
    '9': 'Nine', '8': 'Eight', '7': 'Seven', '6': 'Six',
    '5': 'Five', '4': 'Four', '3': 'Three', '2': 'Deuce',
};

function getHighCard(board) {
    if (!board || board.length === 0) return 'unknown';
    const order = 'AKQJT98765432';
    let best = board[0][0].toUpperCase();
    board.forEach(c => {
        const r = c[0].toUpperCase();
        if (order.indexOf(r) < order.indexOf(best)) best = r;
    });
    return RANK_NAMES[best] || best;
}

function getBoardTexture(board) {
    if (!board || board.length < 3) return 'unknown';
    const suits = board.map(c => c[1].toLowerCase());
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuit = Math.max(...Object.values(suitCounts || {}));

    const ranks = board.map(c => {
        const r = c[0].toUpperCase();
        const vals = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
        return vals[r] || parseInt(r);
    }).sort((a, b) => b - a);

    const unique = [...new Set(ranks)];
    let totalGaps = 0;
    for (let i = 0; i < unique.length - 1; i++) {
        totalGaps += unique[i] - unique[i + 1] - 1;
    }

    const paired = ranks.length !== new Set(ranks).size;
    const connected = totalGaps <= 2;
    const wet = (maxSuit >= 2 && connected) || maxSuit >= 3;

    if (maxSuit >= 3) return 'monotone';
    if (paired && !connected) return 'dry paired';
    if (paired && connected) return 'coordinated paired';
    if (wet) return 'wet';
    if (connected) return 'coordinated';
    return 'dry';
}

function getStreetName(boardLen) {
    if (boardLen === 3) return 'flop';
    if (boardLen === 4) return 'turn';
    if (boardLen === 5) return 'river';
    return 'board';
}

/**
 * @param {Object} props
 * @param {Object} props.gridData - Hand -> { action: freq } data
 * @param {Array} props.classificationGroups - From groupByClassification()
 * @param {string[]} props.board - Board cards
 * @param {string[]} props.actions - Available actions
 * @param {string} props.heroPosition - Hero's position
 */
export default function SolverLineSummary({ gridData = {}, classificationGroups = [], board = [], actions = [], heroPosition = 'Hero' }) {
    const summary = useMemo(() => {
        if (!gridData || Object.keys(gridData || {}).length === 0) return null;

        const handsInRange = Object.entries(gridData || {}).filter(([_, v]) => v !== null && v !== undefined);
        if (handsInRange.length === 0) return null;

        // Aggregate actions across the entire range
        const actionTotals = {};
        let totalWeight = 0;
        handsInRange.forEach(([hand, freqs]) => {
            Object.entries(freqs || {}).forEach(([action, freq]) => {
                if (freq > 0) {
                    actionTotals[action] = (actionTotals[action] || 0) + freq;
                    totalWeight += freq;
                }
            });
        });

        // Normalize to percentages
        const actionPcts = {};
        Object.entries(actionTotals || {}).forEach(([action, total]) => {
            actionPcts[action] = totalWeight > 0 ? Math.round((total / totalWeight) * 1000) / 10 : 0;
        });

        // Sort by percentage
        const sortedActions = Object.entries(actionPcts || {}).sort((a, b) => b[1] - a[1]);

        // Board analysis
        const highCard = getHighCard(board);
        const texture = getBoardTexture(board);
        const street = getStreetName(board.length);

        // Classification summary
        const madeHands = classificationGroups.filter(g => g.category === 'made');
        const draws = classificationGroups.filter(g => g.category === 'draw');
        const topMade = madeHands.sort((a, b) => b.handCount - a.handCount).slice(0, 2);
        const topDraw = draws.sort((a, b) => b.handCount - a.handCount).slice(0, 1);

        // Build summary sentences
        const sentences = [];

        // Opening sentence about board texture
        sentences.push(`On this ${texture} ${highCard}-high ${street}`);

        // Primary strategy
        if (sortedActions.length > 0) {
            const primary = sortedActions[0];
            const actionName = getActionName(primary[0]);
            if (sortedActions.length > 1 && sortedActions[1][1] > 20) {
                const secondary = sortedActions[1];
                const secName = getActionName(secondary[0]);
                sentences[0] += `, ${heroPosition} ${actionName}s ${primary[1].toFixed(0)}% and ${secName}s ${secondary[1].toFixed(0)}% of the time.`;
            } else {
                sentences[0] += `, ${heroPosition} predominantly ${actionName}s at ${primary[1].toFixed(0)}% frequency.`;
            }
        }

        // Range composition
        const totalMade = madeHands.reduce((s, g) => s + g.handCount, 0);
        const totalDraws = draws.reduce((s, g) => s + g.handCount, 0);
        if (totalMade > 0 || totalDraws > 0) {
            const parts = [];
            if (totalMade > 0) parts.push(`${totalMade} made hand${totalMade > 1 ? 's' : ''}`);
            if (totalDraws > 0) parts.push(`${totalDraws} draw${totalDraws > 1 ? 's' : ''}`);
            sentences.push(`The range contains ${parts.join(' and ')}.`);
        }

        // Key hand types
        if (topMade.length > 0) {
            const madeList = topMade.map(g => `${g.label} (${g.handCount})`).join(', ');
            sentences.push(`Key made hands: ${madeList}.`);
        }

        // Strategy character
        if (sortedActions.length >= 2) {
            const betPct = sortedActions.find(([a]) => isBetRaise(a));
            const checkPct = sortedActions.find(([a]) => isCheckCall(a));
            if (betPct && checkPct && betPct[1] > 30 && checkPct[1] > 30) {
                sentences.push('The strategy is well-balanced between aggression and protection.');
            } else if (betPct && betPct[1] > 65) {
                sentences.push('The strategy is heavily polarized toward aggression.');
            } else if (checkPct && checkPct[1] > 65) {
                sentences.push('The strategy favors a passive, check-heavy approach.');
            }
        }

        return sentences.join(' ');
    }, [gridData, classificationGroups, board, heroPosition]);

    if (!summary) {
        return (
            <div style={{
                padding: '12px 14px', background: 'rgba(255,255,255,0.02)',
                borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
                fontSize: 11, color: '#475569', fontStyle: 'italic',
            }}>
                Select a spot to see the solver line summary.
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                padding: '12px 14px',
                background: 'linear-gradient(145deg, rgba(0,212,255,0.04) 0%, rgba(124,58,237,0.04) 100%)',
                borderRadius: 10,
                border: '1px solid rgba(0,212,255,0.15)',
            }}
        >
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
            }}>
                <span style={{ fontSize: 12 }}>AI</span>
                <span style={{
                    fontSize: 9, fontWeight: 800, color: '#00d4ff',
                    textTransform: 'uppercase', letterSpacing: 1,
                    fontFamily: "'Orbitron', monospace",
                }}>
                    Solver Insight
                </span>
            </div>
            <p style={{
                margin: 0, fontSize: 12, lineHeight: 1.6,
                color: '#cbd5e1', fontFamily: "'Inter', sans-serif",
            }}>
                {summary}
            </p>
        </motion.div>
    );
}

// Helpers
function getActionName(action) {
    const a = action.toLowerCase();
    if (a === 'r' || a === 'raise') return 'raise';
    if (a === 'b' || a === 'bet') return 'bet';
    if (a === 'c' || a === 'call') return 'call';
    if (a === 'x' || a === 'check') return 'check';
    if (a === 'f' || a === 'fold') return 'fold';
    if (a === 'allin') return 'shove';
    return action;
}

function isBetRaise(action) {
    const a = action.toLowerCase();
    return a === 'r' || a === 'b' || a === 'raise' || a === 'bet' || a === 'allin';
}

function isCheckCall(action) {
    const a = action.toLowerCase();
    return a === 'c' || a === 'x' || a === 'check' || a === 'call';
}

