/**
 * UNIVERSAL DYNAMIC TABLE — GTO Wizard-Style Poker Trainer
 * ═══════════════════════════════════════════════════════════════════════════
 * A dynamic poker table matching GTO Wizard's professional trainer UI:
 * - Poker-native action buttons (FOLD / CHECK / CALL / RAISE)
 * - 5-tier move classification (Best/Correct/Inaccuracy/Wrong/Blunder)
 * - GTOW Score tracking (-100% to +100%)
 * - Frequency bars showing GTO distribution on feedback
 * - EV loss per decision in BB
 * - Session stats HUD (Score, EV Loss, Mistakes)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import RangeGrid from '../RangeGrid';
import {
    MOVE_CLASSIFICATIONS,
    CLASSIFICATION_CONFIG,
    simulateGTOFrequencies,
    classifyMove,
} from '../../../hooks/useGTOWScore';
import { busEmit } from '../../../engine/EventBus';
import { groupActions, resolveGroupedAction, getGroupedFrequency, DIFFICULTY_MODES } from '../../../utils/actionGrouper';

// ═══════════════════════════════════════════════════════════════════════════
// SVG ICON RENDERER — Maps string icon IDs to professional SVG elements
// ═══════════════════════════════════════════════════════════════════════════

function ClassificationSVGIcon({ icon, size = 18, color = 'currentColor' }) {
    const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeLinecap: 'round', strokeLinejoin: 'round' };
    switch (icon) {
        case 'star':
            return <svg {...props} strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
        case 'check':
            return <svg {...props} strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>;
        case 'alert':
            return <svg {...props} strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
        case 'x':
            return <svg {...props} strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
        case 'warning':
            return <svg {...props} strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
        default:
            return <span>{icon || '?'}</span>;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// F6: BOARD TEXTURE CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════

function classifyBoardTexture(boardCards) {
    if (!boardCards || boardCards.length === 0) return null;

    // Count suits
    const suitCounts = {};
    const ranks = [];
    const rankValues = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 't': 10, 'j': 11, 'q': 12, 'k': 13, 'a': 14 };

    boardCards.forEach(card => {
        if (!card || card.length < 2) return;
        const suit = card[1].toLowerCase();
        const rank = card[0].toLowerCase();
        suitCounts[suit] = (suitCounts[suit] || 0) + 1;
        ranks.push(rankValues[rank] || 0);
    });

    // Suit texture
    const maxSuit = Math.max(...Object.values(suitCounts || {}));
    let suitTexture = 'RAINBOW';
    if (maxSuit >= 3) suitTexture = 'MONOTONE';
    else if (maxSuit === 2) suitTexture = 'TWO-TONE';

    // Connectivity (wetness)
    ranks.sort((a, b) => a - b);
    let maxGap = 0;
    let connected = 0;
    for (let i = 1; i < ranks.length; i++) {
        const gap = ranks[i] - ranks[i - 1];
        maxGap = Math.max(maxGap, gap);
        if (gap <= 2) connected++;
    }

    // Paired
    const uniqueRanks = new Set(ranks);
    const isPaired = uniqueRanks.size < ranks.length;

    let connectTexture = 'STATIC';
    if (connected >= 2 || (ranks.length >= 3 && maxGap <= 3)) connectTexture = 'DYNAMIC';
    if (isPaired) connectTexture = 'PAIRED';

    return { suitTexture, connectTexture };
}

// ═══════════════════════════════════════════════════════════════════════════
// F8: SOUND EFFECTS ENGINE (Web Audio API — no external files needed)
// ═══════════════════════════════════════════════════════════════════════════

const SoundEngine = {
    _ctx: null,
    getCtx() {
        if (!this._ctx && typeof window !== 'undefined') {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this._ctx;
    },
    play(type) {
        try {
            const ctx = this.getCtx();
            if (!ctx) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.value = 0.08;

            const now = ctx.currentTime;
            switch (type) {
                case 'deal': {
                    // Card dealing: short noise burst (shuffling sound)
                    const noise = ctx.createBufferSource();
                    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
                    const noiseData = noiseBuffer.getChannelData(0);
                    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
                    noise.buffer = noiseBuffer;
                    const noiseGain = ctx.createGain();
                    noiseGain.gain.setValueAtTime(0.12, now);
                    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                    noise.connect(noiseGain);
                    noiseGain.connect(ctx.destination);
                    noise.start(now);
                    return; // Early return — skip oscillator
                }
                case 'new_hand': {
                    // New hand: ascending chime
                    osc.frequency.setValueAtTime(440, now);
                    osc.frequency.setValueAtTime(660, now + 0.05);
                    gain.gain.setValueAtTime(0.04, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                    osc.start(now); osc.stop(now + 0.15);
                    break;
                }
                case 'best':
                    osc.frequency.setValueAtTime(880, now);
                    osc.frequency.setValueAtTime(1108, now + 0.08);
                    osc.frequency.setValueAtTime(1320, now + 0.16);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                    osc.start(now); osc.stop(now + 0.4);
                    break;
                case 'correct':
                    osc.frequency.setValueAtTime(660, now);
                    osc.frequency.setValueAtTime(880, now + 0.1);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                    osc.start(now); osc.stop(now + 0.25);
                    break;
                case 'wrong':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(330, now);
                    osc.frequency.setValueAtTime(220, now + 0.15);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                    osc.start(now); osc.stop(now + 0.3);
                    break;
                case 'blunder':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(440, now);
                    osc.frequency.linearRampToValueAtTime(110, now + 0.4);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                    osc.start(now); osc.stop(now + 0.5);
                    break;
                case 'streak':
                    osc.frequency.setValueAtTime(523, now);
                    osc.frequency.setValueAtTime(659, now + 0.07);
                    osc.frequency.setValueAtTime(784, now + 0.14);
                    osc.frequency.setValueAtTime(1047, now + 0.21);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                    osc.start(now); osc.stop(now + 0.5);
                    break;
                case 'level_up': {
                    // Major chord arpeggio C-E-G-C for milestone celebrations
                    osc.frequency.setValueAtTime(523, now);
                    osc.frequency.setValueAtTime(659, now + 0.1);
                    osc.frequency.setValueAtTime(784, now + 0.2);
                    osc.frequency.setValueAtTime(1047, now + 0.3);
                    gain.gain.setValueAtTime(0.12, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
                    osc.start(now); osc.stop(now + 0.7);
                    break;
                }
                case 'speed_bonus': {
                    // Quick ascending trill for speed bonus
                    osc.frequency.setValueAtTime(880, now);
                    osc.frequency.setValueAtTime(1175, now + 0.04);
                    osc.frequency.setValueAtTime(1397, now + 0.08);
                    osc.frequency.setValueAtTime(1760, now + 0.12);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                    osc.start(now); osc.stop(now + 0.25);
                    break;
                }
                case 'card_flip': {
                    // Quick swoosh for card reveal
                    const swoosh = ctx.createBufferSource();
                    const swooshBuf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
                    const swooshData = swooshBuf.getChannelData(0);
                    for (let i = 0; i < swooshData.length; i++) {
                        swooshData[i] = (Math.random() * 2 - 1) * (1 - i / swooshData.length);
                    }
                    swoosh.buffer = swooshBuf;
                    const swooshGain = ctx.createGain();
                    swooshGain.gain.setValueAtTime(0.06, now);
                    swooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                    swoosh.connect(swooshGain);
                    swooshGain.connect(ctx.destination);
                    swoosh.start(now);
                    return;
                }
                case 'session_complete': {
                    // Triumphant fanfare for session end
                    osc.frequency.setValueAtTime(523, now);
                    osc.frequency.setValueAtTime(659, now + 0.15);
                    osc.frequency.setValueAtTime(784, now + 0.3);
                    osc.frequency.setValueAtTime(1047, now + 0.45);
                    gain.gain.setValueAtTime(0.15, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
                    osc.start(now); osc.stop(now + 0.9);
                    break;
                }
                default:
                    osc.frequency.setValueAtTime(440, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                    osc.start(now); osc.stop(now + 0.15);
            }
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// F1: RANGE MATRIX VIEWER — 13×13 hand grid colored by action frequency
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// BUG FIX (TRAIN-FEEDBACK-SYNC-1): defensive guard against the templated
// explanation / solver-line narrative referencing a board, hand, or position
// different from the scenario rendered on the active table.
//
// Symptom from the May 8 handoff: the table shows K8 on AT5 (CO vs BTN) but
// the feedback narrative says "On the Qc Kc 7d flop, you hold 86o from the
// CO." Root cause is upstream — the explanation is built against a stale
// scenario object, likely a pre-rendered DB row that didn't get updated in
// lockstep with the rendered question. Fixing the upstream pipeline is a
// separate ticket (#283); this helper keeps wrong narrative off the screen.
//
// Returns true when `text` is safe to render given the current scenario, or
// when no scenario fingerprint can be extracted (so abstract narratives like
// "Bet 33% is the dominant action" pass through unchanged). Returns false
// only when the text mentions a board / hand / position that demonstrably
// does not match the scenario.
// ═══════════════════════════════════════════════════════════════════════════
function explanationMatchesScenario(text, scenario) {
    if (!text || typeof text !== 'string') return true;
    if (!scenario) return true;

    // 1. BOARD CHECK — extract canonical 'Rs' card codes from scenario.board
    //    (handles both array form ['Ah','Kd','7c'] and concatenated 'AhKd7c'
    //    or space-separated 'Ah Kd 7c').
    let scenarioBoard = null;
    try {
        const b = scenario.board;
        if (b) {
            const tokens = Array.isArray(b)
                ? b.flatMap(c => String(c).match(/[2-9TJQKA][cdhs]/gi) || [])
                : String(b).match(/[2-9TJQKA][cdhs]/gi) || [];
            if (tokens.length >= 3) {
                scenarioBoard = new Set(tokens.map(c => c[0].toUpperCase() + c[1].toLowerCase()));
            }
        }
    } catch (_) { /* best-effort */ }

    // Find rank+suit tokens in the text. If 3+ are mentioned but ZERO appear
    // in the scenario board, the text is referencing a different board.
    if (scenarioBoard) {
        const mentioned = text.match(/\b[2-9TJQKA][cdhs]\b/g);
        if (mentioned && mentioned.length >= 3) {
            const mset = new Set(mentioned.map(c => c[0].toUpperCase() + c[1].toLowerCase()));
            let overlap = 0;
            for (const c of mset) if (scenarioBoard.has(c)) overlap++;
            if (mset.size >= 3 && overlap === 0) return false;
        }
    }

    // 2. HAND CHECK — only when scenario provides a hand notation.
    const scenarioHand = String(scenario.heroHand || '').toUpperCase();
    if (/^[2-9TJQKA]{2}[OS]?$/.test(scenarioHand)) {
        const handsInText = text.match(/\b[2-9TJQKA]{2}[oOsS]?\b/g) || [];
        if (handsInText.length > 0) {
            const r1 = scenarioHand[0];
            const r2 = scenarioHand[1];
            const ok = handsInText.some(h => {
                const hu = h.toUpperCase();
                // Match either ordering (e.g. AKo === KAo for the same hand).
                return (hu.startsWith(r1 + r2) || hu.startsWith(r2 + r1));
            });
            if (!ok) return false;
        }
    }

    return true;
}

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/**
 * Phase 33: GTO Wizard-Style Multi-Action Range Matrix.
 * Each cell colored by DOMINANT action, with mixed strategy gradient.
 * Shows the full solver strategy across all 169 starting hands.
 *
 * Colors match GTO Wizard:
 *   Check = Blue, Call = Green, Bet sizes = Red spectrum,
 *   Raise = Purple, Fold = Gray, All-in = Dark Red
 */
const RANGE_ACTION_COLORS = {
    'c': '#3b82f6', 'x': '#3b82f6', 'check': '#3b82f6',
    'call': '#22c55e',
    'f': '#475569', 'fold': '#475569',
    'allin': '#991b1b',
    'b16': '#16a34a', 'b20': '#16a34a', 'b25': '#16a34a', 'b33': '#059669',
    'b40': '#0891b2', 'b45': '#0891b2', 'b50': '#0891b2', 'b55': '#0891b2',
    'b60': '#2563eb', 'b66': '#2563eb', 'b75': '#1d4ed8', 'b80': '#1d4ed8',
    'b100': '#dc2626',
    'b125': '#f97316', 'b150': '#f59e0b', 'b200': '#f59e0b', 'b300': '#eab308',
    'r50': '#8b5cf6', 'r75': '#7c3aed', 'r100': '#6d28d9', 'r200': '#a855f7', 'r300': '#a855f7',
    'r': '#8b5cf6', 'b': '#dc2626',
};

function getRangeActionColor(action) {
    if (!action) return '#1e293b';
    const a = action.toLowerCase();
    if (RANGE_ACTION_COLORS[a]) return RANGE_ACTION_COLORS[a];
    if (a.startsWith('b')) {
        const m = a.match(/^b(\d+)$/);
        if (m) { const p = parseInt(m[1]); return p <= 33 ? '#059669' : p <= 66 ? '#2563eb' : p <= 100 ? '#dc2626' : '#f59e0b'; }
        return '#dc2626';
    }
    if (a.startsWith('r')) return '#8b5cf6';
    return '#475569';
}

function RangeMatrixViewer({ rawFrequencies, correctAnswer, show, heroHand }) {
    // Build multi-action 13x13 matrix
    const { matrix, actionLegend } = useMemo(() => {
        if (!rawFrequencies) return { matrix: [], actionLegend: [] };
        const grid = [];
        const actions = Object.keys(rawFrequencies || {});
        const actionSet = new Set();

        for (let r = 0; r < 13; r++) {
            const row = [];
            for (let c = 0; c < 13; c++) {
                let hand;
                if (r === c) hand = RANKS[r] + RANKS[c];
                else if (r < c) hand = RANKS[r] + RANKS[c] + 's';
                else hand = RANKS[c] + RANKS[r] + 'o';

                // Find dominant action and all frequencies for this hand
                let bestAction = null;
                let bestFreq = 0;
                let totalFreq = 0;
                const handActions = {};

                for (const action of actions) {
                    const freq = rawFrequencies[action]?.[hand] || 0;
                    if (freq > 0.005) { // Skip noise
                        handActions[action] = freq;
                        totalFreq += freq;
                        actionSet.add(action);
                        if (freq > bestFreq) {
                            bestFreq = freq;
                            bestAction = action;
                        }
                    }
                }

                const isMixed = Object.keys(handActions || {}).length > 1 && bestFreq < 0.9;
                const isHeroHand = heroHand && (hand === heroHand || (heroHand.length === 2 && hand === heroHand));

                row.push({ hand, bestAction, bestFreq, handActions, isMixed, totalFreq, isHeroHand });
            }
            grid.push(row);
        }

        // Build legend from actions actually present
        const legend = [...actionSet].sort((a, b) => {
            const order = { 'f': 0, 'c': 1, 'x': 1, 'call': 2 };
            const aOrd = order[a.toLowerCase()] ?? (a.startsWith('b') ? 3 : a.startsWith('r') ? 4 : 5);
            const bOrd = order[b.toLowerCase()] ?? (b.startsWith('b') ? 3 : b.startsWith('r') ? 4 : 5);
            return aOrd - bOrd;
        });

        return { matrix: grid, actionLegend: legend };
    }, [rawFrequencies, correctAnswer, heroHand]);

    if (!show || !rawFrequencies || matrix.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
            style={{ padding: '8px 4px', overflowX: 'auto' }}
        >
            <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 4, textAlign: 'center', fontWeight: 'bold', letterSpacing: 1 }}>
                RANGE STRATEGY — ALL HANDS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1, maxWidth: 300, margin: '0 auto' }}>
                {matrix.flat().map((cell, i) => {
                    const bgColor = cell.bestAction ? getRangeActionColor(cell.bestAction) : 'rgba(255,255,255,0.03)';
                    const opacity = cell.bestFreq > 0 ? Math.max(0.3, cell.bestFreq) : 0.08;
                    // Mixed strategy: show gradient between top 2 actions
                    let background = bgColor;
                    if (cell.isMixed) {
                        const sorted = Object.entries(cell.handActions || {}).sort((a, b) => b[1] - a[1]);
                        if (sorted.length >= 2) {
                            const c1 = getRangeActionColor(sorted[0][0]);
                            const c2 = getRangeActionColor(sorted[1][0]);
                            const pct = Math.round(sorted[0][1] * 100);
                            background = `linear-gradient(135deg, ${c1} ${pct}%, ${c2} ${pct}%)`;
                        }
                    }

                    // Build tooltip with all actions
                    const tip = cell.bestAction
                        ? `${cell.hand}: ${Object.entries(cell.handActions || {}).sort((a, b) => b[1] - a[1]).map(([a, f]) => `${a} ${(f * 100).toFixed(0)}%`).join(', ')}`
                        : `${cell.hand}: not in range`;

                    return (
                        <div
                            key={i}
                            title={tip}
                            style={{
                                width: '100%',
                                aspectRatio: '1',
                                background: cell.isMixed ? background : bgColor,
                                opacity: cell.bestAction ? opacity : 0.08,
                                borderRadius: 2,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 5.5,
                                fontWeight: cell.isHeroHand ? 900 : 600,
                                color: cell.bestFreq > 0.3 ? '#fff' : '#888',
                                cursor: 'default',
                                boxShadow: cell.isHeroHand ? '0 0 0 1.5px #00d4ff, 0 0 6px rgba(0,212,255,0.4)' : 'none',
                                position: 'relative',
                                zIndex: cell.isHeroHand ? 1 : 0,
                            }}
                        >
                            {cell.hand.replace('10', 'T')}
                        </div>
                    );
                })}
            </div>
            {/* Action color legend */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {actionLegend.slice(0, 6).map(action => {
                    const label = ACTION_LABELS_SHORT[action.toLowerCase()] || action;
                    return (
                        <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 7, color: '#94a3b8' }}>
                            <div style={{ width: 7, height: 7, borderRadius: 2, background: getRangeActionColor(action) }} />
                            {label}
                        </div>
                    );
                })}
            </div>
        </motion.div>
    );
}

// Short labels for range matrix legend
const ACTION_LABELS_SHORT = {
    'c': 'Check', 'x': 'Check', 'call': 'Call', 'f': 'Fold', 'allin': 'All-In',
    'b16': 'B16%', 'b20': 'B20%', 'b25': 'B25%', 'b33': 'B33%',
    'b40': 'B40%', 'b45': 'B45%', 'b50': 'B50%', 'b55': 'B55%',
    'b60': 'B60%', 'b66': 'B67%', 'b75': 'B75%', 'b80': 'B80%',
    'b100': 'Pot', 'b125': 'OB125%', 'b150': 'OB150%', 'b200': 'OB200%', 'b300': 'OB300%',
    'r50': 'R50%', 'r75': 'R75%', 'r100': 'RPot', 'r200': 'R200%', 'r300': 'R300%',
    'r': 'Raise', 'b': 'Bet',
};

// ═══════════════════════════════════════════════════════════════════════════
// F11: STREAK TOAST COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function StreakToast({ message, show }) {
    if (!show) return null;
    return (
        <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 15 }}
            style={{
                position: 'fixed',
                top: 60,
                left: '50%',
                x: '-50%',
                background: 'linear-gradient(135deg, #b45309 0%, #f59e0b 50%, #b45309 100%)',
                color: '#fff',
                padding: '8px 20px',
                borderRadius: 30,
                fontSize: 14,
                fontWeight: 'bold',
                zIndex: 1000,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                letterSpacing: 1,
                textAlign: 'center',
            }}
        >
            {message}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SEAT POSITIONS — 9-Max Layout (portrait orientation)
// ═══════════════════════════════════════════════════════════════════════════

const SEAT_CONFIGS = {
    // 9-Max positions — SPREAD WIDE to prevent overlap
    // Seats hug the outer edge of the felt oval
    9: [
        { id: 0, name: 'BTN', x: 50, y: 82 },   // Hero: Center bottom
        { id: 1, name: 'SB', x: 24, y: 74 },    // Bottom-left (wider)
        { id: 2, name: 'BB', x: 16, y: 52 },    // Mid-left (wider)
        { id: 3, name: 'UTG', x: 22, y: 30 },   // Upper-mid-left
        { id: 4, name: 'UTG+1', x: 38, y: 18 }, // Top-left (higher)
        { id: 5, name: 'MP', x: 62, y: 18 },    // Top-right (higher)
        { id: 6, name: 'MP+1', x: 78, y: 30 },  // Upper-mid-right (wider)
        { id: 7, name: 'HJ', x: 84, y: 52 },    // Mid-right (wider)
        { id: 8, name: 'CO', x: 76, y: 74 },    // Bottom-right (wider)
    ],
    // 6-Max positions — Wider spread
    6: [
        { id: 0, name: 'BTN', x: 50, y: 80 },   // Hero: Center bottom
        { id: 1, name: 'SB', x: 22, y: 58 },    // Mid-left
        { id: 2, name: 'BB', x: 25, y: 30 },    // Upper-left
        { id: 3, name: 'UTG', x: 50, y: 18 },   // Top center
        { id: 4, name: 'HJ', x: 75, y: 30 },    // Upper-right
        { id: 5, name: 'CO', x: 78, y: 58 },    // Mid-right
    ],
    // 3-Max (Spins) — Spread
    3: [
        { id: 0, name: 'BTN', x: 50, y: 78 },   // Hero: Center bottom
        { id: 1, name: 'SB', x: 30, y: 28 },    // Top-left (wider)
        { id: 2, name: 'BB', x: 70, y: 28 },    // Top-right (wider)
    ],
    // Heads-Up
    2: [
        { id: 0, name: 'BTN/SB', x: 50, y: 78 }, // Hero: Center bottom
        { id: 1, name: 'BB', x: 50, y: 22 },     // Villain: Top center
    ],
};

// Position name mapping for display
const POSITION_NAMES = {
    'BTN': 'Button',
    'SB': 'Small-Blind',
    'BB': 'Big-Blind',
    'UTG': 'Under-the-Gun',
    'UTG+1': 'UTG+1',
    'MP': 'Middle Position',
    'MP+1': 'MP+1',
    'HJ': 'Hijack',
    'CO': 'Cutoff',
    'BTN/SB': 'Button/SB',
};

// 3D Illustrated avatar images
const AVATARS = [
    '/avatars/table/free_fox.png',
    '/avatars/table/vip_viking_warrior.png',
    '/avatars/table/free_wizard.png',
    '/avatars/table/free_ninja.png',
    '/avatars/table/vip_wolf.png',
    '/avatars/table/vip_spartan.png',
    '/avatars/table/vip_pharaoh.png',
    '/avatars/table/vip_pirate.png',
    '/avatars/table/free_cowboy.png',
];

// Convert card notation (e.g., 'Ah' for Ace of Hearts) to image path
function getCardPath(card) {
    if (!card || card.length < 2) return '/cards/back.png';

    const rankChar = card[0].toLowerCase();
    const suit = card[1].toLowerCase();

    // Handle tens - card notation uses 'T' but image files use '10'
    const rank = rankChar === 't' ? '10' : rankChar;

    const suitMap = {
        'h': 'hearts',
        'd': 'diamonds',
        'c': 'clubs',
        's': 'spades'
    };

    const suitName = suitMap[suit] || 'hearts';
    return `/cards/${suitName}_${rank}.png`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5: HAND STRENGTH EVALUATOR
// ═══════════════════════════════════════════════════════════════════════════
function evaluateHandStrength(hCards, bCards) {
    if (!hCards || hCards.length < 2 || !bCards || bCards.length === 0) return null;
    // HARDENED: Validate card format (must be 2-3 chars like 'Ah', 'Td', '10s')
    const VALID_CARD = /^[AKQJT2-9][0]?[hdcs]$/i;
    const validHero = hCards.every(c => typeof c === 'string' && VALID_CARD.test(c));
    const validBoard = bCards.every(c => typeof c === 'string' && VALID_CARD.test(c));
    if (!validHero || !validBoard) return null;
    const getRank = c => (c || '').charAt(0).toUpperCase();
    const getSuit = c => (c || '').slice(-1).toLowerCase();
    const allCards = [...hCards, ...bCards];
    const suits = allCards.map(getSuit);
    const heroRanks = hCards.map(getRank);
    const boardRanks = bCards.map(getRank);
    const RANK_ORDER = 'AKQJT98765432';
    const heroHigh = Math.min(...heroRanks.map(r => RANK_ORDER.indexOf(r)));
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuit = Math.max(...Object.values(suitCounts || {}));
    const heroSuits = hCards.map(getSuit);
    const hasFlushDraw = maxSuit === 4 && heroSuits.some(s => suitCounts[s] >= 4);
    const hasFlush = maxSuit >= 5 && heroSuits.some(s => suitCounts[s] >= 5);
    const pairWithBoard = heroRanks.filter(r => boardRanks.includes(r));
    const hasPocketPair = heroRanks[0] === heroRanks[1];
    const isOverpair = hasPocketPair && heroHigh < Math.min(...boardRanks.map(r => RANK_ORDER.indexOf(r)));
    const isTopPair = pairWithBoard.length > 0 && RANK_ORDER.indexOf(pairWithBoard[0]) <= Math.min(...boardRanks.map(r => RANK_ORDER.indexOf(r)));
    if (hasFlush) return { label: 'Flush', color: '#22c55e', tier: 'strong' };
    if (isOverpair) return { label: 'Overpair', color: '#22c55e', tier: 'strong' };
    if (isTopPair) return { label: 'Top Pair', color: '#4ade80', tier: 'strong' };
    if (pairWithBoard.length > 0) return { label: 'Pair', color: '#fbbf24', tier: 'medium' };
    if (hasFlushDraw) return { label: 'Flush Draw', color: '#3b82f6', tier: 'draw' };
    if (hasPocketPair) return { label: 'Pocket Pair', color: '#fbbf24', tier: 'medium' };
    if (heroHigh <= 4) return { label: 'High Card', color: '#94a3b8', tier: 'weak' };
    return { label: 'Air', color: '#ef4444', tier: 'weak' };
}

// Render miniature inline card images for question text
function renderInlineCards(text) {
    if (!text) return text;

    // Pattern to match card notation: Ah, Ks, Td, 2c, etc.
    const cardPattern = /\b([AKQJT2-9])([hdcs])\b/gi;

    const parts = [];
    let lastIndex = 0;
    let match;

    // Create a fresh regex for exec
    const regex = new RegExp(cardPattern);
    while ((match = regex.exec(text)) !== null) {
        // Add text before this match
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        // Add the card image element
        const cardNotation = match[0];
        parts.push({
            type: 'card',
            notation: cardNotation,
            path: getCardPath(cardNotation)
        });

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts;
}

// Parse hero position from string to seat index
// Account for different table sizes having different position mappings
function getHeroSeatIndex(heroPosition, playerCount) {
    const normalized = (heroPosition || 'BTN').toUpperCase().trim();

    // Position mappings for different table sizes
    const positionMaps = {
        9: {
            'BTN': 0, 'BUTTON': 0,
            'SB': 1, 'SMALL BLIND': 1,
            'BB': 2, 'BIG BLIND': 2,
            'UTG': 3,
            'UTG+1': 4,
            'MP': 5, 'MIDDLE': 5,
            'MP+1': 6,
            'HJ': 7, 'HIJACK': 7,
            'CO': 8, 'CUTOFF': 8,
        },
        6: {
            'BTN': 0, 'BUTTON': 0,
            'SB': 1, 'SMALL BLIND': 1,
            'BB': 2, 'BIG BLIND': 2,
            'UTG': 3,
            'HJ': 4, 'HIJACK': 4, 'MP': 4, 'MIDDLE': 4,
            'CO': 5, 'CUTOFF': 5,
        },
        3: {
            'BTN': 0, 'BUTTON': 0,
            'SB': 1, 'SMALL BLIND': 1,
            'BB': 2, 'BIG BLIND': 2,
        },
        2: {
            'BTN': 0, 'BUTTON': 0, 'BTN/SB': 0,
            'BB': 1, 'BIG BLIND': 1,
        }
    };

    const map = positionMaps[playerCount] || positionMaps[6];
    return map[normalized] ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// COUNTDOWN TIMER — GTO Wizard-style time pressure ring
// ═══════════════════════════════════════════════════════════════════════════

function CountdownTimer({ seconds = 60, questionNumber, showFeedback, active = true, onTimeExpired = null }) {
    const [timeLeft, setTimeLeft] = React.useState(seconds);
    const expiredRef = React.useRef(false);
    const radius = 18;
    const circumference = 2 * Math.PI * radius;

    // Reset timer on new question
    React.useEffect(() => {
        setTimeLeft(seconds);
        expiredRef.current = false;
    }, [questionNumber, seconds]);

    // Countdown tick — fires onTimeExpired when hitting 0
    React.useEffect(() => {
        if (!active || showFeedback || timeLeft <= 0) return;
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    // BUG-04 FIX: Fire callback when timer expires
                    if (onTimeExpired && !expiredRef.current) {
                        expiredRef.current = true;
                        setTimeout(() => onTimeExpired(), 0);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [active, showFeedback, timeLeft, onTimeExpired]);

    if (!active || showFeedback) return null;

    const progress = timeLeft / seconds;
    const dashOffset = circumference * (1 - progress);
    const color = timeLeft > 30 ? '#22c55e' : timeLeft > 10 ? '#fbbf24' : '#ef4444';
    const pulseClass = timeLeft <= 5 ? { animation: 'pulse 0.5s infinite' } : {};

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...pulseClass }}
        >
            <svg width={44} height={44} viewBox="0 0 44 44">
                {/* Background ring */}
                <circle cx="22" cy="22" r={radius} fill="none"
                    stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                {/* Progress ring */}
                <circle cx="22" cy="22" r={radius} fill="none"
                    stroke={color} strokeWidth="3"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    transform="rotate(-90 22 22)"
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                />
                {/* Timer text */}
                <text x="22" y="22" textAnchor="middle" dominantBaseline="central"
                    fill={color} fontSize="13" fontWeight="bold"
                    fontFamily="'Inter', monospace"
                >
                    {timeLeft}
                </text>
            </svg>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// DETECT ACTION TYPE — Parse option text to determine poker action type
// ═══════════════════════════════════════════════════════════════════════════

function detectActionType(text) {
    const lower = (text || '').toLowerCase().trim();
    if (/fold/i.test(lower)) return 'fold';
    if (/check/i.test(lower)) return 'check';
    if (/call/i.test(lower)) return 'call';
    if (/all[- ]?in|shove|push|jam/i.test(lower)) return 'allin';
    if (/overbet|1[2-9]\d%|[2-9]\d\d%/i.test(lower)) return 'overbet';
    if (/raise|3[- ]?bet|4[- ]?bet/i.test(lower)) return 'raise';
    if (/bet\s*pot|bet\s*100%/i.test(lower)) return 'betpot';
    if (/bet\s*(6[0-9]|7[0-9]|8[0-9]|9[0-9])%/i.test(lower)) return 'betlarge';
    if (/bet/i.test(lower)) return 'betsmall';
    return 'neutral';
}

// Phase 28: GTO Wizard-style color-coded action buttons with sizing differentiation
// CHECK = green passive, FOLD = muted blue-grey, CALL = teal
// BET/RAISE = red intensity gradient: small bets lighter, big bets deeper, overbet/allin darkest
const ACTION_COLORS = {
    fold: { bg: '#334155', border: '#1e293b', text: '#f8fafc', accent: '#475569' },
    check: { bg: '#059669', border: '#047857', text: '#f0fdf4', accent: '#10b981' },
    call: { bg: '#2563eb', border: '#1d4ed8', text: '#eff6ff', accent: '#3b82f6' },
    betsmall: { bg: '#b91c1c', border: '#991b1b', text: '#fef2f2', accent: '#dc2626' },
    betlarge: { bg: '#dc2626', border: '#b91c1c', text: '#fef2f2', accent: '#ef4444' },
    betpot: { bg: '#ef4444', border: '#dc2626', text: '#fef2f2', accent: '#f87171' },
    raise: { bg: '#dc2626', border: '#b91c1c', text: '#fef2f2', accent: '#ef4444' },
    overbet: { bg: '#7f1d1d', border: '#991b1b', text: '#fecaca', accent: '#b91c1c' },
    allin: { bg: '#450a0a', border: '#7f1d1d', text: '#fecaca', accent: '#991b1c' },
    neutral: { bg: '#334155', border: '#1e293b', text: '#f8fafc', accent: '#475569' },
};

// ═══════════════════════════════════════════════════════════════════════════
// LOADING SKELETON — Shown while question is being fetched
// ═══════════════════════════════════════════════════════════════════════════

function LoadingSkeleton() {
    return (
        <div style={loadingStyles.container}>
            <div style={loadingStyles.questionBar}>
                <div style={loadingStyles.pulse} />
            </div>
            <div style={loadingStyles.tableArea}>
                {/* CSS Felt Table (matches live game) */}
                <div style={{
                    position: 'relative', width: '80%', maxWidth: 500,
                    aspectRatio: '2 / 1.1', borderRadius: '50%',
                    background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)',
                    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                    overflow: 'hidden', opacity: 0.5,
                }}>
                    <div style={{
                        position: 'absolute', inset: 4, borderRadius: '50%',
                        border: '2px solid rgba(251, 191, 36, 0.2)',
                    }} />
                    <div style={{
                        position: 'absolute', inset: 8, borderRadius: '50%',
                        background: 'radial-gradient(ellipse at 50% 40%, #1a472a 0%, #0d2a18 55%, #081a10 100%)',
                    }} />
                </div>
                <div style={loadingStyles.loadingText}>Dealing...</div>
            </div>
            <div style={loadingStyles.buttonsArea}>
                {[1, 2, 3].map(i => (
                    <div key={i} style={loadingStyles.buttonSkeleton} />
                ))}
            </div>
        </div>
    );
}

const loadingStyles = {
    container: {
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#121212',
    },
    questionBar: {
        height: 50,
        background: 'rgba(255,255,255,0.03)',
        margin: '0',
        overflow: 'hidden',
    },
    pulse: {
        width: '100%',
        height: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
        animation: 'pulse 1.5s infinite',
    },
    tableArea: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    tableImage: {
        opacity: 0.15,
        height: '50%',
        objectFit: 'contain',
    },
    loadingText: {
        position: 'absolute',
        color: '#5ac8c8',
        fontSize: 16,
        fontWeight: 700,
        fontFamily: "'Inter', sans-serif",
        letterSpacing: 1,
    },
    buttonsArea: {
        display: 'flex',
        gap: 0,
        padding: 0,
    },
    buttonSkeleton: {
        flex: 1,
        height: 56,
        background: 'rgba(255,255,255,0.03)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// FREQUENCY BAR COMPONENT — Shows GTO frequency under each action button
// ═══════════════════════════════════════════════════════════════════════════

function FrequencyBar({ frequency, color, show }) {
    if (!show) return null;
    return (
        <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{
                height: 6,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.08)',
                marginTop: 4,
                overflow: 'hidden',
                transformOrigin: 'left',
            }}
        >
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${frequency}%` }}
                transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
                style={{
                    height: '100%',
                    background: color,
                    borderRadius: 3,
                }}
            />
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFICATION FLASH BANNER — GTO Wizard-style instant feedback overlay
// ═══════════════════════════════════════════════════════════════════════════

function ClassificationFlashBanner({ classification, evLoss, show }) {
    if (!show || !classification) return null;

    const config = CLASSIFICATION_CONFIG[classification];
    if (!config) return null;

    // GTO Wizard uses large, bold, centered classification banners
    const isBestOrCorrect = classification === 'best' || classification === 'correct';

    return (
        <AnimatePresence>
            <motion.div
                key={classification}
                initial={{ opacity: 0, y: -30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ type: 'spring', stiffness: 350, damping: 22 }}
                style={{
                    width: '100%',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    background: `linear-gradient(180deg, ${config.bgColor || 'rgba(0,0,0,0.3)'} 0%, rgba(0,0,0,0.02) 100%)`,
                    borderBottom: `2px solid ${config.borderColor || 'transparent'}`,
                    zIndex: 100,
                }}
            >
                <ClassificationSVGIcon icon={config.icon} size={20} color={config.color} />
                <span style={{
                    fontSize: 16,
                    fontWeight: 900,
                    color: config.color,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    fontFamily: "'Inter', monospace",
                    textShadow: `0 0 12px ${config.color}44`,
                }}>
                    {config.label}
                </span>
                {evLoss > 0 && (
                    <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#ef4444',
                        background: 'rgba(0,0,0,0.4)',
                        padding: '3px 10px',
                        borderRadius: 6,
                        fontFamily: "'Inter', monospace",
                    }}>
                        -{evLoss.toFixed(2)} EV
                    </span>
                )}
                {evLoss > 0 && (
                    <span style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: evLoss >= 0.5 ? '#fca5a5' : evLoss >= 0.2 ? '#fde68a' : '#94a3b8',
                        fontFamily: "'Inter', sans-serif",
                        opacity: 0.85,
                    }}>
                        {evLoss >= 1.0 ? 'Critical mistake — costs 1+ BB/hand' :
                         evLoss >= 0.5 ? 'Significant — adds up over many hands' :
                         evLoss >= 0.2 ? 'Moderate — small leak to fix' :
                         evLoss >= 0.05 ? 'Minor — close decision' :
                         'Tiny — negligible difference'}
                    </span>
                )}
                {isBestOrCorrect && evLoss === 0 && (
                    <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#22c55e',
                        background: 'rgba(34,197,94,0.08)',
                        padding: '2px 8px',
                        borderRadius: 6,
                    }}>
                        0.00 EV
                    </span>
                )}
            </motion.div>
        </AnimatePresence>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// EV LOSS TICKER — Running session EV loss counter
// ═══════════════════════════════════════════════════════════════════════════

function EVLossTicker({ totalEVLoss, show }) {
    if (!show) return null;

    const evColor = totalEVLoss <= 0 ? '#22c55e' : totalEVLoss < 5 ? '#fbbf24' : '#ef4444';

    return (
        <motion.div
            key={totalEVLoss}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{
                position: 'absolute',
                top: 4,
                right: 4,
                fontSize: 9,
                fontWeight: 700,
                fontFamily: "'Inter', monospace",
                color: evColor,
                background: 'rgba(0,0,0,0.6)',
                padding: '2px 6px',
                borderRadius: 4,
                border: `1px solid ${evColor}33`,
                zIndex: 50,
                letterSpacing: 0.5,
            }}
        >
            EV: -{(totalEVLoss || 0).toFixed(2)} BB
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function UniversalDynamicTable({
    question,
    questionNumber,
    totalQuestions,
    onAnswer,
    showFeedback,
    feedbackResult,
    explanation,
    structuredExplanation = null,
    gameType = 'cash', // 'cash', 'mtt', 'sng', 'spins'
    gameTitle = '',    // Title of the training game
    streak = 0,        // Current streak count (only show if >= 2)
    // GTOW scoring props
    moveClassification = null,     // 'best', 'correct', 'inaccuracy', 'wrong', 'blunder'
    evLoss = 0,                    // EV loss in BB for this decision
    gtoFrequencies = null,         // { a: 60, b: 25, c: 10, d: 5 }
    gtowScore = 100,               // Current session GTOW score
    totalSessionEVLoss = 0,        // Cumulative EV loss
    sessionMistakes = 0,           // Mistake count this session
    // Phase 37: Enhanced session metrics
    classificationCounts = null,   // { best, correct, inaccuracy, wrong, blunder }
    gtowCurrentStreak = 0,         // Current correct/incorrect streak
    bestGTOWStreak = 0,            // Best correct streak this session
    lastClassification = null,     // Last move classification
    gtowAccuracy = 100,            // Session accuracy percentage
    // Phase 38: Position & street accuracy
    positionAccuracy = null,       // { 'BTN': { total, correct, accuracy }, ... }
    streetAccuracy = null,         // { 'flop': { total, correct, accuracy }, ... }
    weakestPosition = null,        // Position string with lowest accuracy
    // Phase 49: Live leak detection
    mistakePatterns = null,        // [{ type, severity, count, pct, tip, icon }]
    // UI-2: Manual advance callback
    onNextHand = null,             // Called when user clicks "Next Hand"
    // Multi-street props
    isMultiStreetActive = false,    // Whether we're mid-hand across streets
    currentStreet = 'flop',         // Current street: 'flop', 'turn', 'river'
    handSummary = null,             // End-of-hand summary from MultiStreetHandManager
    // Quit/Back
    onExit = null,                  // Called when user clicks Quit
    // Enhancement: Adaptive difficulty
    difficultyLevel = 0,            // 0-10 difficulty level for display
    // Player identity
    heroName = null,                 // Player's display name or poker alias
    // Settings config — gear button relocated to scenario area
    onConfigClick = null,
    trainerConfig = null,
    // Phase 261-280: Deep coaching callbacks
    getTeachingPrinciple = null,
    getPositionReminder = null,
    getTextureStrategyGuide = null,
    getSPRStrategyGuide = null,
    getVillainRangeNarration = null,
    getMultiStreetPlanningGuide = null,
    getFrequencyCorrectionPrompt = null,
    getTiltRecoveryAdvice = null,
    classifyHandStrength = null,
    estimateEquityVsRange = null,
    getActionEVComparison = null,
    getSolverLineComparison = null,
    generateHints = null,
    getRunoutImpactPreview = null,
    // Phase 291-300 coaching callbacks
    getRangeConstructionDrill = null,
    getHandReadingDrill = null,
    getExploitativeAdjustments = null,
    getVarianceSimulator = null,
    getOptimalLineNarration = null,
    // Phase 351+: Pre-decision hints
    getPreDecisionPreview = null,
    getKeyConceptReminders = null,
}) {
    const [selectedAnswer, setSelectedAnswer] = React.useState(null);
    const [streakToast, setStreakToast] = React.useState(null);
    const [showWhyDrawer, setShowWhyDrawer] = React.useState(false);
    const [showRangeGrid, setShowRangeGrid] = React.useState(false);

    // Phase 53: Auto-open Why? drawer for blunders (most educational)
    React.useEffect(() => {
        if (showFeedback && moveClassification === 'blunder') {
            setShowWhyDrawer(true);
        } else if (!showFeedback) {
            setShowWhyDrawer(false);
            setShowRangeGrid(false);
        }
    }, [showFeedback, moveClassification]);
    const [streakCelebration, setStreakCelebration] = React.useState(null);
    const [speedBonusToast, setSpeedBonusToast] = React.useState(null);
    const answerStartTime = useRef(Date.now());
    const prevStreakRef = useRef(streak);
    const swipeTouchRef = useRef(null);

    // ═══ MULTI-STREET TRACKING STATE ═══
    // Track previous board cards to detect new cards dealt on street transitions
    const prevBoardCardsRef = useRef([]);
    const [newStreetCardIndex, setNewStreetCardIndex] = React.useState(-1);
    const [streetHistory, setStreetHistory] = React.useState([]);
    const prevStreetRef = useRef(currentStreet);
    const [showHandSummary, setShowHandSummary] = React.useState(false);

    // Auto-read player's poker alias from Supabase session
    const playerName = React.useMemo(() => {
        if (heroName) return heroName;
        try {
            if (typeof window === 'undefined') return null;
            // Primary key: smarter-poker-auth (custom key used by the platform)
            const authKeys = ['smarter-poker-auth', 'smarter-poker-auth-hardened'];
            for (const key of authKeys) {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const data = JSON.parse(raw);
                const meta = data?.user?.user_metadata || data?.user_metadata;
                if (meta?.poker_alias) return meta.poker_alias;
                if (meta?.full_name) return meta.full_name;
                if (meta?.name) return meta.name;
            }
            // Fallback: standard Supabase key pattern
            const keys = Object.keys(localStorage || {});
            const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
            if (sbKey) {
                const session = JSON.parse(localStorage.getItem(sbKey));
                const meta = session?.user?.user_metadata;
                return meta?.poker_alias || meta?.full_name || meta?.name || null;
            }
        } catch { /* silent fallback */ }
        return null;
    }, [heroName]);

    // Phase 3: RNG Mode state
    const [rngMode, setRngMode] = React.useState(false);
    const [rngRoll, setRngRoll] = React.useState(null);

    // Phase 3: Retry Hand state
    const lastQuestionRef = useRef(null);
    const [retryActive, setRetryActive] = React.useState(false);

    // Phase 3: Study Mode (show frequencies before answering)
    const [studyMode, setStudyMode] = React.useState(false);
    const [feedbackCollapsed, setFeedbackCollapsed] = React.useState(false);

    // ═══ MOBILE RESPONSIVE DETECTION ═══
    const [isMobile, setIsMobile] = React.useState(false);
    // ═══ PHASE 16: VIEWPORT SCALE-LOCK — continuous scaling, never repositioning ═══
    const DESIGN_WIDTH = 420; // fixed design canvas width
    const [scaleFactor, setScaleFactor] = React.useState(1);
    useEffect(() => {
        const check = () => {
            const vw = window.innerWidth;
            setIsMobile(vw < 768);
            // Scale factor: ratio of viewport to design width, capped at 1.0 (never upscale)
            setScaleFactor(Math.min(vw / DESIGN_WIDTH, 1));
        };
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Mobile-responsive style overrides (applied inline at render time)
    const m = useMemo(() => ({
        avatar: isMobile ? { width: 32, height: 32, fontSize: 9, border: '1.5px solid #4a4a55' } : {},
        badge: isMobile ? { padding: '2px 5px', fontSize: 8 } : {},
        card: isMobile ? { width: 36, height: 52, borderRadius: 3 } : {},
        boardCard: isMobile ? { width: 34, height: 48, borderRadius: 3 } : {},
        pot: isMobile ? { top: '20%', fontSize: 13 } : {},
        actionButton: isMobile ? { padding: '10px 4px', minHeight: 50, fontSize: 12 } : {},
        villainCard: isMobile ? { width: 16, height: 22 } : {},
        boardCards: isMobile ? { gap: 3 } : {},
        seat: isMobile ? { gap: 2 } : {},
    }), [isMobile]);

    // Phase 16: Computed height for the scale container to prevent layout collapse
    const scaledTableHeight = useMemo(() => {
        // Design height of the table area canvas (fixed) — must match styles.tableArea.height
        const DESIGN_HEIGHT = 600;
        return DESIGN_HEIGHT * scaleFactor;
    }, [scaleFactor]);

    // Phase 3: Floating EV popup
    const [evPopup, setEvPopup] = React.useState(null);

    // F4: In-Trainer Mode Switching Bar
    const [activeMode, setActiveMode] = React.useState('trainer');

    // H2: Memoize mode bar tabs to prevent re-creates on every render
    const MODE_TABS = useMemo(() => [
        { id: 'trainer', icon: '🎯', label: 'Trainer' },
        { id: 'range', icon: '📊', label: 'Range' },
        { id: 'strategy', icon: '📈', label: 'Strategy' },
        { id: 'settings', icon: '⚙️', label: 'Settings' },
    ], []);

    // H6: Auto-reset to trainer mode when a new question loads
    const prevQRef = useRef(questionNumber);
    useEffect(() => {
        if (questionNumber !== prevQRef.current) {
            prevQRef.current = questionNumber;
            setActiveMode('trainer');
        }
    }, [questionNumber]);

    // ═══ CARD PARSING (moved up — must be before handStrength useMemo) ═══
    const scenario = question?.scenario || {};
    const board = scenario.board || '';
    const rawHeroCards = question?.heroCards || scenario.heroHand || scenario.heroCards || 'AsKs';
    const heroCards = useMemo(() => {
        if (Array.isArray(rawHeroCards)) return rawHeroCards;
        if (typeof rawHeroCards === 'string' && rawHeroCards.length >= 4) {
            return [rawHeroCards.substring(0, 2), rawHeroCards.substring(2, 4)];
        }
        // Handle 3-char abstract notation: "K8s" (suited), "ATo" (offsuit)
        if (typeof rawHeroCards === 'string' && rawHeroCards.length === 3) {
            const r1 = rawHeroCards[0], r2 = rawHeroCards[1], suitFlag = rawHeroCards[2];
            if (suitFlag === 's') return [`${r1}s`, `${r2}s`]; // Both spades for suited
            if (suitFlag === 'o') return [`${r1}h`, `${r2}d`]; // Mixed suits for offsuit
            return [`${r1}h`, `${r2}s`]; // Default
        }
        // Handle 2-char pairs: "AA", "KK"
        if (typeof rawHeroCards === 'string' && rawHeroCards.length === 2) {
            return [`${rawHeroCards[0]}h`, `${rawHeroCards[1]}s`];
        }
        return ['As', 'Ks']; // Fallback
    }, [rawHeroCards]);

    const boardCards = useMemo(() => {
        if (Array.isArray(board)) return board;
        if (typeof board === 'string' && board.length > 0) {
            // Handle "Jh 7s 2d" or "Jh7s2d"
            const cleaned = board.replace(/\s+/g, '');
            const cards = [];
            for (let i = 0; i < cleaned.length; i += 2) {
                if (i + 1 < cleaned.length) {
                    cards.push(cleaned.substring(i, i + 2));
                }
            }
            return cards;
        }
        return [];
    }, [board]);

    // ═══ ALL QUESTION DATA EXTRACTION (must be before any hooks that reference these) ═══
    const questionText = question?.question || question?.text || 'Loading question...';
    const correctAnswer = question?.correctAnswer || question?.correct || 'a';

    // BUG-A FIX: Fisher-Yates shuffle options per question to eliminate position bias
    const options = useMemo(() => {
        const rawOpts = question?.options || [];
        const opts = [...rawOpts];
        if (opts.length <= 1) return opts;
        let seed = ((questionNumber || 1) * 2654435761) >>> 0;
        const rng = () => { seed = ((seed * 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        return opts;
    }, [question?.options, questionNumber]);

    // Dynamic table state from question scenario
    const heroPosition = scenario.heroPosition || scenario.position || 'BTN';
    const heroStack = scenario.heroStack || scenario.stackDepth || 100;
    const villainStack = scenario.villainStack || 100;
    const pot = scenario.pot || 0;
    const villainPosition = scenario.villainPosition || 'BB';
    const villainAction = scenario.action || scenario.villainAction || '';
    const street = scenario.street || '';

    // PHASE 5: Hand Strength evaluation
    const handStrength = useMemo(() => {
        if (showFeedback) return null;
        return evaluateHandStrength(heroCards, boardCards);
    }, [heroCards, boardCards, showFeedback]);

    // PHASE 6: Bookmark System (localStorage-backed, HARDENED)
    const [bookmarkedHands, setBookmarkedHands] = React.useState(() => {
        try {
            const raw = JSON.parse(localStorage.getItem('sp_bookmarked_hands') || '[]');
            // HARDENED: Validate shape — must be array of objects with questionId
            if (!Array.isArray(raw)) { localStorage.removeItem('sp_bookmarked_hands'); return []; }
            return raw.filter(b => b && typeof b === 'object' && b.questionId);
        } catch { localStorage.removeItem('sp_bookmarked_hands'); return []; }
    });
    const isCurrentBookmarked = useMemo(() => {
        if (!question) return false;
        return bookmarkedHands.some(b => b.questionId === (question.id || question.scenario?.id));
    }, [bookmarkedHands, question]);
    const toggleBookmark = useCallback(() => {
        if (!question) return;
        const qId = question.id || question.scenario?.id || `q-${questionNumber}`;
        setBookmarkedHands(prev => {
            const exists = prev.some(b => b.questionId === qId);
            let next;
            if (exists) {
                next = prev.filter(b => b.questionId !== qId);
            } else {
                const entry = {
                    questionId: qId,
                    heroCards,
                    boardCards,
                    heroPosition,
                    villainPosition,
                    selectedAnswer,
                    correctAnswer: question?.correctAnswer,
                    classification: moveClassification,
                    evLoss,
                    timestamp: Date.now(),
                    gameTitle,
                };
                // HARDENED: Cap at 500 bookmarks to prevent localStorage overflow
                next = [...prev, entry].slice(-500);
            }
            try { localStorage.setItem('sp_bookmarked_hands', JSON.stringify(next)); } catch (e) { console.warn('[App] Handled exception:', e); }
            // HARDENED: EventBus emission for cross-page sync
            try { busEmit('BOOKMARK_TOGGLED', { questionId: qId, action: exists ? 'removed' : 'added', count: next.length }); } catch (e) { console.warn('[App] Handled exception:', e); }
            return next;
        });
    }, [question, questionNumber, heroCards, boardCards, heroPosition, villainPosition, selectedAnswer, moveClassification, evLoss, gameTitle]);

    // PHASE 6: Session Mistakes Tracker (HARDENED with dedup + EventBus)
    const sessionMistakesListRef = useRef([]);
    useEffect(() => {
        if (showFeedback && moveClassification && question) {
            const isMistake = moveClassification === 'wrong' || moveClassification === 'blunder' || moveClassification === 'inaccuracy';
            if (isMistake) {
                const qId = question.id || question.scenario?.id || `q-${questionNumber}`;
                // HARDENED: Dedup — prevent same question from being tracked twice
                const alreadyTracked = sessionMistakesListRef.current.some(m => m.questionId === qId);
                if (!alreadyTracked) {
                    const entry = {
                        questionId: qId,
                        heroCards,
                        boardCards,
                        heroPosition,
                        selectedAnswer,
                        correctAnswer: question?.correctAnswer,
                        classification: moveClassification,
                        evLoss,
                        explanation: explanation || null,
                    };
                    sessionMistakesListRef.current = [...sessionMistakesListRef.current, entry];
                    // HARDENED: EventBus emission for mistake tracking
                    try { busEmit('MISTAKE_TRACKED', { questionId: qId, classification: moveClassification, total: sessionMistakesListRef.current.length }); } catch (e) { console.warn('[App] Handled exception:', e); }
                }
            }
        }
    }, [showFeedback, moveClassification, question, questionNumber, heroCards, boardCards, heroPosition, selectedAnswer, evLoss, explanation]);
    const [showMistakeReview, setShowMistakeReview] = React.useState(false);
    const [mistakeReviewIndex, setMistakeReviewIndex] = React.useState(0);

    // PHASE 9: Simplified Mode — collapses low-frequency actions for scoring (HARDENED)
    const [simplifiedMode, setSimplifiedMode] = React.useState(() => {
        try { return localStorage.getItem('sp_simplified_mode') === 'true'; } catch { return false; }
    });
    const toggleSimplifiedMode = useCallback(() => {
        setSimplifiedMode(prev => {
            const next = !prev;
            try { localStorage.setItem('sp_simplified_mode', String(next)); } catch (e) { console.warn('[App] Handled exception:', e); }
            // HARDENED: EventBus emission for cross-page awareness
            try { busEmit('SIMPLIFIED_MODE_CHANGED', { enabled: next }); } catch (e) { console.warn('[App] Handled exception:', e); }
            return next;
        });
    }, []);

    // PHASE 5: Adaptive Difficulty Level (computed from session accuracy)
    const computedDifficulty = useMemo(() => {
        const accuracy = questionNumber > 0 ? ((questionNumber - sessionMistakes) / questionNumber) * 100 : 100;
        if (accuracy >= 85) return { label: 'EXPERT', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
        if (accuracy >= 70) return { label: 'HARD', color: '#f97316', bg: 'rgba(249,115,22,0.15)' };
        if (accuracy >= 50) return { label: 'MEDIUM', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' };
        return { label: 'EASY', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' };
    }, [questionNumber, sessionMistakes]);

    // Phase 3: Store question for retry + trigger EV popup on feedback
    useEffect(() => {
        if (question && !showFeedback) {
            lastQuestionRef.current = question;
            setRetryActive(false);
        }
    }, [question, showFeedback]);

    // RNG MODE: Roll BEFORE each decision (GTO Wizard style)
    // The player sees the number and must pick the action whose cumulative
    // frequency range includes that number. e.g., Check 62% = 1-62, Bet 38% = 63-100
    useEffect(() => {
        if (rngMode && !showFeedback && questionNumber) {
            // Generate a new roll for each question
            setRngRoll(Math.floor(Math.random() * 100) + 1);
        } else if (!rngMode) {
            setRngRoll(null);
        }
    }, [rngMode, questionNumber, showFeedback]);

    // Phase 3: EV popup on answer
    useEffect(() => {
        if (showFeedback && moveClassification) {
            const isGood = moveClassification === 'best' || moveClassification === 'correct';
            setEvPopup({
                value: evLoss > 0 ? `-${evLoss.toFixed(1)}` : '+0.0',
                color: isGood ? '#22c55e' : '#ef4444',
            });
            const timer = setTimeout(() => setEvPopup(null), 1500);
            return () => clearTimeout(timer);
        }
    }, [showFeedback, moveClassification, evLoss]);

    // F8: Sound effects on feedback
    useEffect(() => {
        if (!showFeedback || !moveClassification) return;
        const soundMap = {
            best: 'best', correct: 'correct',
            inaccuracy: 'wrong', wrong: 'wrong', blunder: 'blunder'
        };
        SoundEngine.play(soundMap[moveClassification] || 'wrong');
        // Haptic feedback on mobile for wrong/blunder
        if ((moveClassification === 'wrong' || moveClassification === 'blunder') && typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(moveClassification === 'blunder' ? [100, 50, 100] : [80]);
        }
    }, [showFeedback, moveClassification]);



    // F11: Streak milestone celebrations (enhanced)
    useEffect(() => {
        if (streak > prevStreakRef.current && streak >= 3) {
            // Major milestones: 5, 10, 15, 20 — full celebration overlay
            if (streak >= 5 && streak % 5 === 0) {
                const rewards = { 5: 5, 10: 10, 15: 15, 20: 25 };
                const icons = { 5: 'star', 10: 'diamond', 15: 'crown', 20: 'legend' };
                setStreakCelebration({
                    streak,
                    reward: rewards[streak] || 5,
                    icon: icons[streak] || 'star',
                });
                SoundEngine.play('level_up');
                // Auto-dismiss after 2.5s
                setTimeout(() => setStreakCelebration(null), 2500);
            } else if (streak % 3 === 0) {
                // Minor milestones: 3, 6, 9, 12 — toast only
                const messages = {
                    3: '3 in a row!',
                    6: '6 streak! On fire!',
                    9: '9 streak! UNSTOPPABLE!',
                    12: '12 streak! LEGENDARY!',
                };
                const msg = messages[streak] || `${streak} streak!`;
                setStreakToast(msg);
                SoundEngine.play('streak');
                setTimeout(() => setStreakToast(null), 2500);
            }
        }
        prevStreakRef.current = streak;
    }, [streak]);

    // Speed tracking: reset timer on new question
    useEffect(() => {
        answerStartTime.current = Date.now();
        setShowWhyDrawer(false);
        setShowRangeGrid(false);
    }, [questionNumber]);

    // Swipe navigation: swipe left on feedback = Next Hand
    useEffect(() => {
        if (!showFeedback) return;
        const handleTouchStart = (e) => {
            swipeTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        };
        const handleTouchEnd = (e) => {
            if (!swipeTouchRef.current) return;
            const dx = e.changedTouches[0].clientX - swipeTouchRef.current.x;
            const dy = Math.abs(e.changedTouches[0].clientY - swipeTouchRef.current.y);
            // Swipe left with > 60px distance and not vertical
            if (dx < -60 && dy < 100 && onNextHand) {
                onNextHand();
            }
            swipeTouchRef.current = null;
        };
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });
        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [showFeedback, onNextHand]);

    const handleAnswer = useCallback((answerId) => {
        if (showFeedback) return;
        setSelectedAnswer(answerId);
        // Speed bonus tracking
        const elapsed = (Date.now() - answerStartTime.current) / 1000;
        if (onAnswer) onAnswer(answerId, { answerTimeSeconds: elapsed });
        try { busEmit('ARENA_HAND_ANSWERED', { answerId, timeSeconds: elapsed, questionNumber, isCorrect: answerId === correctAnswer }); } catch (e) { console.warn('[App] Handled exception:', e); }
    }, [showFeedback, onAnswer, options, questionNumber, correctAnswer]);

    // Phase 25: Keyboard Shortcuts — UNIFIED handler (1-4, F/C/R, Space/Enter, Esc)
    // This is the SINGLE keyboard handler. Do NOT add duplicates.
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Don't intercept if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const key = e.key;

            // During feedback: Space/Enter = next hand
            if (showFeedback && (key === ' ' || key === 'Enter')) {
                e.preventDefault();
                if (onNextHand) onNextHand();
                return;
            }

            // During question: 1-9 = select answer by index (supports variable action count)
            if (!showFeedback && !selectedAnswer) {
                const keyNum = parseInt(key);
                if (keyNum >= 1 && keyNum <= 9) {
                    e.preventDefault();
                    const opts = options || []; // Use SHUFFLED options
                    if (opts[keyNum - 1]) {
                        const optId = opts[keyNum - 1].id || opts[keyNum - 1];
                        handleAnswer(optId);
                    }
                    return;
                }
                // F/C/R shortcuts for fold/check-call/raise
                const lower = key.toLowerCase();
                if (lower === 'f') {
                    const opts = options || [];
                    const foldOpt = opts.find(o => /fold/i.test(o.text || o.label || ''));
                    if (foldOpt) handleAnswer(foldOpt.id || foldOpt);
                } else if (lower === 'c') {
                    const opts = options || [];
                    const checkCallOpt = opts.find(o => /check|call/i.test(o.text || o.label || ''));
                    if (checkCallOpt) handleAnswer(checkCallOpt.id || checkCallOpt);
                } else if (lower === 'r') {
                    const opts = options || [];
                    const raiseOpt = opts.find(o => /raise|bet|all.in|shove/i.test(o.text || o.label || ''));
                    if (raiseOpt) handleAnswer(raiseOpt.id || raiseOpt);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showFeedback, selectedAnswer, onNextHand, onAnswer, question, handleAnswer]);

    // ═══════════════════════════════════════════════════════════════════════
    // (ALL DYNAMIC DATA EXTRACTION moved above — before hooks that use them)
    // ═══════════════════════════════════════════════════════════════════════

    // Play card deal sound when board cards appear (new question)
    const prevQuestionNum = useRef(questionNumber);
    useEffect(() => {
        if (questionNumber !== prevQuestionNum.current) {
            prevQuestionNum.current = questionNumber;
            SoundEngine.play('new_hand');
            // Reset multi-street tracking for new hand
            prevBoardCardsRef.current = [];
            setNewStreetCardIndex(-1);
            setStreetHistory([]);
            setShowHandSummary(false);
            // Stagger card deal sounds for board cards
            if (boardCards && boardCards.length > 0) {
                boardCards.forEach((_, i) => {
                    setTimeout(() => SoundEngine.play('deal'), 120 * i + 200);
                });
            }
        }
    }, [questionNumber, boardCards]);

    // ═══ MULTI-STREET: Detect street transitions and track new cards ═══
    useEffect(() => {
        if (!isMultiStreetActive) {
            prevBoardCardsRef.current = boardCards;
            return;
        }

        const prevCards = prevBoardCardsRef.current;
        const currCards = boardCards;

        // Detect if a new card was dealt (board grew by 1 card)
        if (currCards.length > prevCards.length && prevCards.length > 0) {
            const newCardIdx = prevCards.length; // The new card is at this index
            setNewStreetCardIndex(newCardIdx);

            // Play deal sound for the new card with a dramatic delay
            setTimeout(() => SoundEngine.play('card_flip'), 400);

            // Track street history for the progress indicator
            setStreetHistory(prev => {
                const streetName = currCards.length === 4 ? 'turn' : currCards.length === 5 ? 'river' : 'flop';
                // Don't add duplicate entries
                if (prev.some(s => s.street === streetName)) return prev;
                return [...prev, {
                    street: streetName,
                    newCard: currCards[newCardIdx],
                    boardSnapshot: [...currCards],
                }];
            });
        }

        prevBoardCardsRef.current = currCards;
    }, [boardCards, isMultiStreetActive]);

    // Track street changes for history
    useEffect(() => {
        if (currentStreet !== prevStreetRef.current && isMultiStreetActive) {
            prevStreetRef.current = currentStreet;
        }
    }, [currentStreet, isMultiStreetActive]);

    // H3: Keyboard shortcut 'M' to cycle through modes
    useEffect(() => {
        const handleModeKey = (e) => {
            if (e.key === 'm' || e.key === 'M') {
                if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
                setActiveMode(prev => {
                    const ids = MODE_TABS.map(t => t.id);
                    const idx = ids.indexOf(prev);
                    return ids[(idx + 1) % ids.length];
                });
            }
        };
        window.addEventListener('keydown', handleModeKey);
        return () => window.removeEventListener('keydown', handleModeKey);
    }, [MODE_TABS]);

    // Determine player count based on game type
    const playerCount = useMemo(() => {
        if (gameType === 'spins' || gameType === 'sng') return 3;
        if (gameType === 'heads-up' || gameType === 'hu') return 2;
        if (gameType === '6max' || gameType === 'cash') return 6;
        return 9; // Default to 9-max for MTT
    }, [gameType]);

    // Get seat configuration
    const seats = SEAT_CONFIGS[playerCount] || SEAT_CONFIGS[9];

    // Find hero seat index based on position
    const heroSeatIndex = getHeroSeatIndex(heroPosition, playerCount);

    // Button is always at seat 0
    const getButtonSeatIndex = 0;

    // Generate STABLE villain stacks — relative to heroStack with ±variance
    const generateVillainStack = useMemo(() => {
        return (seatIndex) => {
            const seed = (questionNumber || 1) * 13 + seatIndex * 7;
            const variance = (seed % 40) - 20; // ±20BB variance around hero stack
            return Math.max(5, Math.round((heroStack || 100) + variance));
        };
    }, [questionNumber, heroStack]);

    // GAP-6: Effective stack (smallest of hero and all active villains)
    const effectiveStack = useMemo(() => {
        const villainStacks = seats
            .filter((_, i) => i !== heroSeatIndex)
            .map((_, i) => {
                const seed = (questionNumber || 1) * 13 + i * 7;
                return 30 + (seed % 120);
            });
        return Math.min(heroStack, ...villainStacks);
    }, [heroStack, seats, heroSeatIndex, questionNumber]);

    // GAP-2: SPR calculation
    const spr = useMemo(() => {
        if (pot <= 0) return null;
        return (effectiveStack / pot).toFixed(1);
    }, [effectiveStack, pot]);

    // GAP-2: Pot odds calculation
    const potOdds = useMemo(() => {
        if (pot <= 0) return null;
        // Find if there's a call option
        const callOpt = options.find(o => /call/i.test(o.text || ''));
        if (!callOpt) return null;
        const callMatch = (callOpt.text || '').match(/(\d+\.?\d*)/);
        if (!callMatch) return null;
        const callSize = parseFloat(callMatch[1]);
        if (callSize <= 0) return null;
        return Math.round((callSize / (pot + callSize)) * 100);
    }, [pot, options]);

    // GAP-1: Parse action history from scenario
    const actionHistory = useMemo(() => {
        const scen = question?.scenario || {};
        const actions = scen.actionHistory || scen.actions || scen.preflop_actions || [];
        if (Array.isArray(actions) && actions.length > 0) return actions;
        // Build from available data
        const built = [];
        if (villainAction) {
            built.push({ position: villainPosition, action: villainAction });
        }
        return built;
    }, [question?.scenario, villainAction, villainPosition]);

    // Compute simulated GTO frequencies for this question (if not passed down)
    const computedFrequencies = useMemo(() => {
        if (gtoFrequencies) return gtoFrequencies;
        return simulateGTOFrequencies(options, correctAnswer, questionNumber);
    }, [gtoFrequencies, options, correctAnswer, questionNumber]);

    // ═══ DIFFICULTY MODE GROUPING (GTO Wizard Simple/Grouped/Standard) ═══
    const activeDifficultyMode = trainerConfig?.difficultyMode || 'standard';
    const { groupedOptions: displayOptions, frequencyMap: displayFrequencies, actionMapping: difficultyActionMapping } = useMemo(() => {
        // BUG FIX (TRAIN-ACTIONS-COUNT-1): the source-of-truth `options` array
        // sometimes arrives with only 2 entries (e.g. ["BET 16%", "CHECK"]) on
        // a postflop spot where ≥4 actions should be available. That happens
        // because the question pipeline pre-trims options by EV or frequency.
        // The fix: if we are in 'standard' difficulty mode AND the spot is not
        // a binary push/fold drill, top-up displayOptions from
        // computedFrequencies (highest-frequency missing actions first) until
        // we have at least 4 buttons. Binary spots (push/fold short-stack
        // trainers) are detected and left at 2 buttons.
        const grouped = groupActions(options, computedFrequencies, activeDifficultyMode);
        if (activeDifficultyMode !== 'standard') return grouped;
        if (!grouped.groupedOptions || grouped.groupedOptions.length >= 4) return grouped;

        // Detect a binary-action spot: only push (allin / 'p') and fold are
        // present in either the existing options or the GTO frequency map.
        const isBinary = (() => {
            const ids = new Set();
            (grouped.groupedOptions || []).forEach(o => ids.add(String(o.id || o).toLowerCase()));
            Object.keys(computedFrequencies || {}).forEach(k => ids.add(String(k).toLowerCase()));
            const allowed = new Set(['allin', 'p', 'push', 'f', 'fold']);
            // Binary if every present id is in {push, fold} AND we have at most 2 distinct ids.
            for (const id of ids) { if (!allowed.has(id)) return false; }
            return ids.size > 0 && ids.size <= 2;
        })();
        if (isBinary) return grouped;

        // Pad: take any action from `options` that wasn't included in groupedOptions
        // first (preserves question-supplied labels), then top up from computedFrequencies
        // sorted by descending frequency. Stop at 4.
        const presentIds = new Set((grouped.groupedOptions || []).map(o => String(o.id || o).toLowerCase()));
        const padded = [...grouped.groupedOptions];
        const freqMap = { ...grouped.frequencyMap };
        const mapping = { ...grouped.actionMapping };

        // Phase 1: pull more from `options` if any are missing
        if (Array.isArray(options)) {
            for (const opt of options) {
                if (padded.length >= 4) break;
                const id = String(opt.id || opt).toLowerCase();
                if (presentIds.has(id)) continue;
                presentIds.add(id);
                padded.push(typeof opt === 'object' ? opt : { id: opt, text: String(opt) });
                const f = computedFrequencies?.[id] ?? computedFrequencies?.[opt?.id] ?? 0;
                freqMap[opt.id || id] = f;
                mapping[opt.id || id] = [opt.id || id];
            }
        }

        // Phase 2: still short — pull from computedFrequencies sorted by freq desc
        if (padded.length < 4 && computedFrequencies) {
            const ranked = Object.entries(computedFrequencies)
                .filter(([k, v]) => v > 0 && !presentIds.has(String(k).toLowerCase()))
                .sort((a, b) => b[1] - a[1]);
            for (const [actionId] of ranked) {
                if (padded.length >= 4) break;
                presentIds.add(String(actionId).toLowerCase());
                padded.push({ id: actionId, text: actionId });
                freqMap[actionId] = computedFrequencies[actionId];
                mapping[actionId] = [actionId];
            }
        }

        return { groupedOptions: padded, frequencyMap: freqMap, actionMapping: mapping };
    }, [options, computedFrequencies, activeDifficultyMode]);

    // Wrap handleAnswer to resolve grouped actions back to solver actions for scoring
    const handleAnswerWithGrouping = useCallback((answerId) => {
        if (showFeedback) return;
        // If using grouped/simple mode, resolve back to the best solver action
        let resolvedId = answerId;
        if (activeDifficultyMode !== 'standard' && difficultyActionMapping[answerId]) {
            resolvedId = resolveGroupedAction(answerId, difficultyActionMapping, computedFrequencies);
        }
        setSelectedAnswer(resolvedId);
        const elapsed = (Date.now() - answerStartTime.current) / 1000;
        if (onAnswer) onAnswer(resolvedId, { answerTimeSeconds: elapsed });
        try { busEmit('ARENA_HAND_ANSWERED', { answerId: resolvedId, timeSeconds: elapsed, questionNumber, isCorrect: resolvedId === correctAnswer }); } catch (e) { console.warn('[App] Handled exception:', e); }
    }, [showFeedback, activeDifficultyMode, difficultyActionMapping, computedFrequencies, onAnswer, questionNumber, correctAnswer]);

    // Compute move classification for feedback display
    const computedClassification = useMemo(() => {
        if (moveClassification) {
            // PHASE 9: Simplified Mode override — if user's selected action has <5% freq, upgrade inaccuracies to 'correct'
            if (simplifiedMode && (moveClassification === 'inaccuracy') && selectedAnswer && computedFrequencies) {
                const userFreq = computedFrequencies[selectedAnswer] || computedFrequencies[selectedAnswer?.toLowerCase()] || 0;
                if (userFreq > 0 && userFreq < 5) return 'correct';
            }
            return moveClassification;
        }
        if (!showFeedback || !selectedAnswer) return null;
        let result = classifyMove(selectedAnswer, correctAnswer, computedFrequencies);
        // PHASE 9: Simplified Mode override for computed classification
        if (simplifiedMode && result.classification === 'inaccuracy') {
            const userFreq = computedFrequencies[selectedAnswer] || computedFrequencies[selectedAnswer?.toLowerCase()] || 0;
            if (userFreq > 0 && userFreq < 5) return 'correct';
        }
        return result.classification;
    }, [moveClassification, showFeedback, selectedAnswer, correctAnswer, computedFrequencies, simplifiedMode]);

    // Get classification config for display
    const classConfig = computedClassification ? CLASSIFICATION_CONFIG[computedClassification] : null;

    // Reset selectedAnswer + feedbackCollapsed on new question (BUG-1 fix)
    React.useEffect(() => {
        setSelectedAnswer(null);
        setFeedbackCollapsed(false);
        try { busEmit('ARENA_HAND_LOADED', { questionNumber, gameId: question?.gameId || null }); } catch (e) { console.warn('[App] Handled exception:', e); }
    }, [questionNumber]);



    // Speed bonus toast on correct feedback
    useEffect(() => {
        if (!showFeedback || !moveClassification) return;
        if (moveClassification === 'best' || moveClassification === 'correct') {
            const elapsed = (Date.now() - answerStartTime.current) / 1000;
            if (elapsed < 5) {
                setSpeedBonusToast({ label: 'LIGHTNING +5', color: '#fbbf24' });
                SoundEngine.play('speed_bonus');
                setTimeout(() => setSpeedBonusToast(null), 2000);
            } else if (elapsed < 10) {
                setSpeedBonusToast({ label: 'SPEED BONUS +2', color: '#22c55e' });
                SoundEngine.play('speed_bonus');
                setTimeout(() => setSpeedBonusToast(null), 2000);
            }
        }
    }, [showFeedback, moveClassification]);

    // Phase 22+: Smart auto-advance with countdown visual
    // Best/Correct: 2s. Inaccuracy: 4s. Wrong/Blunder: stays until user clicks.
    const [autoAdvanceCountdown, setAutoAdvanceCountdown] = React.useState(null); // null = no countdown, number = ms remaining
    const [autoAdvanceTotal, setAutoAdvanceTotal] = React.useState(null);

    useEffect(() => {
        if (!showFeedback || !onNextHand || !computedClassification) {
            setAutoAdvanceCountdown(null);
            setAutoAdvanceTotal(null);
            return;
        }
        const autoAdvEnabled = trainerConfig?.autoAdvance !== false; // Default ON
        if (!autoAdvEnabled) {
            setAutoAdvanceCountdown(null);
            setAutoAdvanceTotal(null);
            return;
        }

        let delay = null;
        if (computedClassification === 'best' || computedClassification === 'correct') {
            delay = 2000;
        } else if (computedClassification === 'inaccuracy') {
            delay = 4000;
        }
        // Wrong/Blunder: no auto-advance — user should study the feedback

        if (delay) {
            setAutoAdvanceTotal(delay);
            setAutoAdvanceCountdown(delay);

            // Tick the countdown every 50ms for smooth visual
            const tickInterval = setInterval(() => {
                setAutoAdvanceCountdown(prev => {
                    if (prev === null || prev <= 0) return 0;
                    return prev - 50;
                });
            }, 50);

            const timerId = setTimeout(() => {
                setAutoAdvanceCountdown(null);
                setAutoAdvanceTotal(null);
                onNextHand();
            }, delay);

            return () => {
                clearTimeout(timerId);
                clearInterval(tickInterval);
                setAutoAdvanceCountdown(null);
                setAutoAdvanceTotal(null);
            };
        } else {
            setAutoAdvanceCountdown(null);
            setAutoAdvanceTotal(null);
        }
    }, [showFeedback, computedClassification, onNextHand, trainerConfig?.autoAdvance]);

    // F9: Keyboard shortcuts — REMOVED (consolidated into Phase 25 unified handler above)
    // Do NOT re-add a second keydown listener here.

    // UI-2: Space/Enter advance — REMOVED (consolidated into Phase 25 unified handler above)
    // Do NOT re-add a second keydown listener here.

    // F6: Board texture classification
    const boardTexture = useMemo(() => classifyBoardTexture(boardCards), [boardCards]);

    // ═══════════════════════════════════════════════════════════════════════
    // ACTION BUTTON STYLES — GTO Wizard-style poker action buttons
    // ═══════════════════════════════════════════════════════════════════════

    const getActionButtonStyle = (option, index) => {
        const optionId = option.id || String.fromCharCode(97 + index);
        const text = typeof option === 'string' ? option : (option.text || option.label || 'Option');
        const actionType = detectActionType(text);
        const colors = ACTION_COLORS[actionType] || ACTION_COLORS.neutral;

        const baseStyle = {
            ...styles.actionButton,
            ...m.actionButton,
            background: colors.bg,
            color: colors.text,
        };

        if (showFeedback) {
            const isCorrect = optionId === correctAnswer || optionId?.toLowerCase() === correctAnswer?.toLowerCase();
            const isSelected = optionId === selectedAnswer || optionId?.toLowerCase() === selectedAnswer?.toLowerCase();
            const freq = computedFrequencies[optionId] || computedFrequencies[optionId?.toLowerCase()] || 0;

            if (isCorrect) {
                // Best action — bright green glow
                return {
                    ...baseStyle,
                    background: '#1a3a2a',
                    borderColor: '#22c55e',
                    color: '#22c55e',
                    boxShadow: '0 0 8px rgba(34, 197, 94, 0.25)',
                };
            }
            if (isSelected && !isCorrect) {
                // Selected wrong — use classification color
                const clsConfig = classConfig || CLASSIFICATION_CONFIG[MOVE_CLASSIFICATIONS.WRONG];
                return {
                    ...baseStyle,
                    background: clsConfig.bgColor,
                    borderColor: clsConfig.borderColor,
                    color: clsConfig.color,
                    boxShadow: `0 0 8px ${clsConfig.borderColor}44`,
                };
            }
            // Unselected options — dim but still colored
            return {
                ...baseStyle,
                opacity: 0.3,
                filter: 'grayscale(0.4)',
            };
        }
        return baseStyle;
    };

    // Determine street label
    const streetLabel = useMemo(() => {
        if (street) return street.toUpperCase();
        if (boardCards.length === 0) return 'PREFLOP';
        if (boardCards.length === 3) return 'FLOP';
        if (boardCards.length === 4) return 'TURN';
        if (boardCards.length === 5) return 'RIVER';
        return '';
    }, [street, boardCards.length]);

    // Build context string (e.g., "BTN vs BB • 3-Bet Pot • Flop")
    const contextString = useMemo(() => {
        // If scenario has a rich context (from DeterministicGTOEngine), use it
        const ctx = scenario.context;
        if (ctx && ctx.actionLine) {
            // Show action line like: "EP opens → CO 3bets → EP calls → Flop"
            return ctx.actionLine;
        }
        const parts = [];
        if (heroPosition) parts.push(heroPosition);
        if (villainPosition && villainPosition !== heroPosition) parts.push(`vs ${villainPosition}`);
        if (villainAction) parts.push(villainAction);
        if (streetLabel) parts.push(streetLabel);
        return parts.join(' • ');
    }, [heroPosition, villainPosition, villainAction, streetLabel, scenario.context]);

    // GTOW Score color
    const scoreColor = gtowScore >= 80 ? '#22c55e' : gtowScore >= 60 ? '#fbbf24' : '#ef4444';

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    // Early return for loading state (must happen after all hooks)
    if (!question) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="gto-trainer-container" style={styles.container}>
            {/* CSS Animation Keyframes + H5: Desktop-responsive layout */}
            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
                @media (min-width: 900px) {
                    .gto-trainer-container {
                        max-width: 900px !important;
                        margin: 0 auto !important;
                        border-left: 1px solid rgba(255,255,255,0.06) !important;
                        border-right: 1px solid rgba(255,255,255,0.06) !important;
                        box-shadow: 0 0 60px rgba(0,0,0,0.5) !important;
                    }
                }
                @media (min-width: 1200px) {
                    .gto-trainer-container {
                        max-width: 800px !important;
                    }
                }
            `}</style>
            {/* F11: Streak Toast */}
            <AnimatePresence>
                <StreakToast message={streakToast} show={!!streakToast} />
            </AnimatePresence>
            {/* F14: Classification Flash Banner */}
            <ClassificationFlashBanner
                classification={moveClassification}
                evLoss={evLoss}
                show={showFeedback}
            />
            {/* F15: Running EV Loss Ticker */}
            <EVLossTicker
                totalEVLoss={totalSessionEVLoss}
                show={questionNumber > 1}
            />
            {/* TOP BAR — Context + Score (GTO Wizard style) */}
            <div style={styles.topBar}>
                <div style={styles.topBarLeft}>
                    <div style={styles.gameTitle}>{gameTitle || 'GTO Training'}</div>
                </div>
                <div style={styles.topBarRight}>
                    {/* PHASE 5: Adaptive Difficulty Badge */}
                    {questionNumber > 1 && (
                        <div style={{
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 9,
                            fontWeight: 'bold',
                            letterSpacing: 1,
                            background: computedDifficulty.bg,
                            color: computedDifficulty.color,
                            border: `1px solid ${computedDifficulty.color}44`,
                        }}>
                            {computedDifficulty.label}
                        </div>
                    )}
                    {/* Data source badge */}
                    {question?.source && (
                        <div style={{
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 9,
                            fontWeight: 'bold',
                            letterSpacing: 1,
                            background: (question.source === 'PIO_DATABASE' || question.source === 'DETERMINISTIC_SOLVER' || question.source === 'CACHED_SCENARIO')
                                ? 'rgba(0, 212, 255, 0.15)'
                                : 'rgba(139, 92, 246, 0.15)',
                            color: (question.source === 'PIO_DATABASE' || question.source === 'DETERMINISTIC_SOLVER' || question.source === 'CACHED_SCENARIO') ? '#00d4ff' : '#a78bfa',
                            border: `1px solid ${(question.source === 'PIO_DATABASE' || question.source === 'DETERMINISTIC_SOLVER' || question.source === 'CACHED_SCENARIO') ? 'rgba(0,212,255,0.3)' : 'rgba(139,92,246,0.3)'}`,
                        }}>
                            {(question.source === 'PIO_DATABASE' || question.source === 'DETERMINISTIC_SOLVER' || question.source === 'CACHED_SCENARIO') ? 'SOLVER' : 'AI'}
                        </div>
                    )}
                    {/* Multi-Street Progress Indicator — GTO Wizard style */}
                    {isMultiStreetActive && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 3,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                            }}
                        >
                            {['flop', 'turn', 'river'].map((st, idx) => {
                                const isActive = currentStreet === st;
                                const isPast = ['flop', 'turn', 'river'].indexOf(currentStreet) > idx;
                                const streetColors = {
                                    flop: '#4ade80', turn: '#fb923c', river: '#f87171',
                                };
                                const color = streetColors[st];
                                return (
                                    <React.Fragment key={st}>
                                        {idx > 0 && (
                                            <div style={{
                                                width: 8, height: 1,
                                                background: isPast ? color : 'rgba(255,255,255,0.1)',
                                            }} />
                                        )}
                                        <div style={{
                                            width: isActive ? 'auto' : 6,
                                            height: 6,
                                            borderRadius: isActive ? 4 : '50%',
                                            padding: isActive ? '0 5px' : 0,
                                            fontSize: 8,
                                            fontWeight: 'bold',
                                            letterSpacing: 0.8,
                                            lineHeight: '6px',
                                            textTransform: 'uppercase',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: isActive ? `${color}22` : isPast ? color : 'rgba(255,255,255,0.1)',
                                            color: isActive ? color : 'transparent',
                                            border: isActive ? `1px solid ${color}66` : 'none',
                                            transition: 'all 0.3s ease',
                                        }}>
                                            {isActive ? st.charAt(0).toUpperCase() + st.slice(1) : ''}
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </motion.div>
                    )}
                    {/* GTOW Score */}
                    <div style={{ ...styles.scoreBadge, borderColor: scoreColor }}>
                        <div style={{ ...styles.scoreValue, color: scoreColor }}>{gtowScore}%</div>
                        <div style={styles.scoreLabel}>SCORE</div>
                    </div>
                    {/* Phase 37: Streak indicator — fire emoji for hot streaks */}
                    {questionNumber > 1 && gtowCurrentStreak !== 0 && (() => {
                        const isPositive = gtowCurrentStreak > 0;
                        const absStreak = Math.abs(gtowCurrentStreak);
                        const streakColor = isPositive
                            ? (absStreak >= 5 ? '#f97316' : '#22c55e')
                            : '#ef4444';
                        const streakIcon = isPositive ? '🔥' : '💀';
                        return absStreak >= 2 ? (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 2,
                                padding: '2px 6px', borderRadius: 6,
                                background: `${streakColor}11`, border: `1px solid ${streakColor}33`,
                            }}>
                                <span style={{ fontSize: 10, lineHeight: 1 }}>{streakIcon}</span>
                                <span style={{ fontSize: 11, fontWeight: 800, color: streakColor, fontFamily: "'Inter', monospace", lineHeight: 1 }}>{absStreak}</span>
                            </div>
                        ) : null;
                    })()}
                    {/* Phase 37: Accuracy % — uses real gtowAccuracy from useGTOWScore */}
                    {questionNumber > 1 && (() => {
                        const accColor = gtowAccuracy >= 80 ? '#22c55e' : gtowAccuracy >= 60 ? '#fbbf24' : '#ef4444';
                        return (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                padding: '2px 6px', borderRadius: 6,
                                background: `${accColor}11`, border: `1px solid ${accColor}33`,
                            }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: accColor, fontFamily: "'Inter', monospace", lineHeight: 1 }}>{gtowAccuracy}%</div>
                                <div style={{ fontSize: 7, fontWeight: 700, color: '#64748b', letterSpacing: 0.8, textTransform: 'uppercase' }}>ACC</div>
                            </div>
                        );
                    })()}
                    {/* Question Counter */}
                    <div style={styles.questionCounter}>
                        {questionNumber}/{totalQuestions}
                    </div>
                    {/* PHASE 9: Simplified Mode Toggle */}
                    <motion.button
                        onClick={toggleSimplifiedMode}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            padding: '2px 8px', borderRadius: 6,
                            fontSize: 8, fontWeight: 700, letterSpacing: 0.8,
                            border: simplifiedMode ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.1)',
                            background: simplifiedMode ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
                            color: simplifiedMode ? '#c084fc' : '#64748b',
                            cursor: 'pointer', textTransform: 'uppercase',
                        }}
                    >
                        {simplifiedMode ? 'SIMPLE' : 'FULL'}
                    </motion.button>
                </div>
            </div>

            {/* GAP-5: Progress bar */}
            <div style={styles.progressBarContainer}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${((questionNumber || 1) / (totalQuestions || 25)) * 100}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    style={styles.progressBarFill}
                />
            </div>

            {/* Phase 37: Classification mini-bar — shows move quality distribution */}
            {classificationCounts && questionNumber > 1 && (() => {
                const total = (classificationCounts.best || 0) + (classificationCounts.correct || 0) +
                    (classificationCounts.inaccuracy || 0) + (classificationCounts.wrong || 0) + (classificationCounts.blunder || 0);
                if (total === 0) return null;
                const segments = [
                    { key: 'best', color: '#4ade80', count: classificationCounts.best || 0, label: '★' },
                    { key: 'correct', color: '#22d3ee', count: classificationCounts.correct || 0, label: '✓' },
                    { key: 'inaccuracy', color: '#fbbf24', count: classificationCounts.inaccuracy || 0, label: '~' },
                    { key: 'wrong', color: '#f97316', count: classificationCounts.wrong || 0, label: '✗' },
                    { key: 'blunder', color: '#ef4444', count: classificationCounts.blunder || 0, label: '!!' },
                ].filter(s => s.count > 0);
                return (
                    <div style={{ padding: '0 16px', marginBottom: 2 }}>
                        <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                            {segments.map(seg => (
                                <motion.div
                                    key={seg.key}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(seg.count / total) * 100}%` }}
                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                    style={{ background: seg.color, height: '100%' }}
                                    title={`${seg.key}: ${seg.count} (${Math.round((seg.count / total) * 100)}%)`}
                                />
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 2 }}>
                            {segments.map(seg => (
                                <span key={seg.key} style={{ fontSize: 8, color: seg.color, fontWeight: 700, fontFamily: "'Inter', monospace" }}>
                                    {seg.label}{seg.count}
                                </span>
                            ))}
                            {bestGTOWStreak > 0 && (
                                <span style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600 }}>
                                    best: {bestGTOWStreak}🔥
                                </span>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* Phase 38: Position & Street accuracy row — shows after 5+ hands */}
            {positionAccuracy && Object.keys(positionAccuracy || {}).length > 0 && questionNumber > 5 && (
                <div style={{ padding: '0 16px', marginBottom: 2, display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {/* Position pills */}
                    {['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'].filter(p => positionAccuracy[p]).map(pos => {
                        const data = positionAccuracy[pos];
                        const accColor = data.accuracy >= 80 ? '#22c55e' : data.accuracy >= 60 ? '#fbbf24' : '#ef4444';
                        const isWeakest = weakestPosition === pos;
                        return (
                            <div key={pos} style={{
                                display: 'flex', alignItems: 'center', gap: 2,
                                padding: '1px 5px', borderRadius: 4,
                                background: isWeakest ? `${accColor}22` : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${isWeakest ? accColor + '55' : 'rgba(255,255,255,0.06)'}`,
                            }}>
                                <span style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5 }}>{pos}</span>
                                <span style={{ fontSize: 8, fontWeight: 800, color: accColor, fontFamily: "'Inter', monospace" }}>{data.accuracy}%</span>
                                <span style={{ fontSize: 7, color: '#475569' }}>({data.total})</span>
                            </div>
                        );
                    })}
                    {/* Street divider + pills */}
                    {streetAccuracy && Object.keys(streetAccuracy || {}).length > 0 && (
                        <>
                            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', alignSelf: 'center' }} />
                            {['preflop', 'flop', 'turn', 'river'].filter(s => streetAccuracy[s]).map(st => {
                                const data = streetAccuracy[st];
                                const streetColors = { preflop: '#a78bfa', flop: '#4ade80', turn: '#fb923c', river: '#f87171' };
                                const accColor = data.accuracy >= 80 ? '#22c55e' : data.accuracy >= 60 ? '#fbbf24' : '#ef4444';
                                return (
                                    <div key={st} style={{
                                        display: 'flex', alignItems: 'center', gap: 2,
                                        padding: '1px 5px', borderRadius: 4,
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                    }}>
                                        <span style={{ fontSize: 8, fontWeight: 700, color: streetColors[st] || '#94a3b8', letterSpacing: 0.5, textTransform: 'capitalize' }}>{st.slice(0, 1).toUpperCase()}</span>
                                        <span style={{ fontSize: 8, fontWeight: 800, color: accColor, fontFamily: "'Inter', monospace" }}>{data.accuracy}%</span>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            )}

            {/* Phase 49: Live Leak Ticker — compact inline leak alerts after 8+ hands */}
            {mistakePatterns && mistakePatterns.length > 0 && questionNumber > 8 && (() => {
                // Show only high/medium severity leaks, max 2
                const significantLeaks = mistakePatterns
                    .filter(p => p.severity === 'high' || (p.severity === 'medium' && p.count >= 3))
                    .slice(0, 2);
                if (significantLeaks.length === 0) return null;
                return (
                    <div style={{
                        padding: '2px 16px', marginBottom: 2,
                        display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap',
                    }}>
                        <span style={{ fontSize: 8, fontWeight: 800, color: '#f59e0b', letterSpacing: 1, textTransform: 'uppercase' }}>
                            LEAK
                        </span>
                        {significantLeaks.map((leak, idx) => {
                            const sevColor = leak.severity === 'high' ? '#ef4444' : '#f59e0b';
                            return (
                                <div key={idx} style={{
                                    display: 'flex', alignItems: 'center', gap: 3,
                                    padding: '1px 6px', borderRadius: 4,
                                    background: `${sevColor}11`,
                                    border: `1px solid ${sevColor}33`,
                                }}>
                                    <span style={{ fontSize: 9 }}>{leak.icon}</span>
                                    <span style={{ fontSize: 8, fontWeight: 700, color: sevColor }}>
                                        {leak.type.replace('_', ' ')}
                                    </span>
                                    <span style={{ fontSize: 7, color: '#94a3b8' }}>({leak.count}x)</span>
                                </div>
                            );
                        })}
                        {significantLeaks.length > 0 && significantLeaks[0].tip && (
                            <span style={{ fontSize: 7, color: '#94a3b8', fontStyle: 'italic', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {significantLeaks[0].tip}
                            </span>
                        )}
                    </div>
                );
            })()}

            {/* Phase 3: RNG / Study Mode Toggles */}
            <div style={{ display: 'flex', gap: 6, padding: '0 16px 4px', justifyContent: 'flex-end' }}>
                <button
                    onClick={() => setRngMode(v => !v)}
                    style={{
                        padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        border: `1px solid ${rngMode ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        background: rngMode ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
                        color: rngMode ? '#a855f7' : '#64748b', cursor: 'pointer',
                        letterSpacing: 0.5, transition: 'all 0.15s ease',
                    }}
                >
                    RNG {rngMode ? 'ON' : 'OFF'}
                </button>
                <button
                    onClick={() => setStudyMode(v => !v)}
                    style={{
                        padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        border: `1px solid ${studyMode ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        background: studyMode ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                        color: studyMode ? '#3b82f6' : '#64748b', cursor: 'pointer',
                        letterSpacing: 0.5, transition: 'all 0.15s ease',
                    }}
                >
                    {studyMode ? 'STUDY' : 'TRAIN'}
                </button>
            </div>

            {/* Phase 3: Session EV Progress Bar */}
            <div style={{
                margin: '0 16px 6px', height: 4, borderRadius: 2,
                background: 'rgba(255,255,255,0.05)', overflow: 'hidden',
                position: 'relative',
            }}>
                <motion.div
                    animate={{ width: `${Math.min(100, Math.max(0, 50 + (totalSessionEVLoss > 0 ? -totalSessionEVLoss * 5 : 0)))}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    style={{
                        height: '100%', borderRadius: 2,
                        background: totalSessionEVLoss > 5
                            ? 'linear-gradient(90deg, #ef4444, #f97316)'
                            : totalSessionEVLoss > 1
                                ? 'linear-gradient(90deg, #fbbf24, #f97316)'
                                : 'linear-gradient(90deg, #22c55e, #4ade80)',
                    }}
                />
                <div style={{
                    position: 'absolute', top: -10, right: 4,
                    fontSize: 8, fontWeight: 700,
                    color: totalSessionEVLoss > 1 ? '#ef4444' : '#22c55e',
                }}>
                    {totalSessionEVLoss > 0 ? `-${totalSessionEVLoss.toFixed(1)} EV` : '0.0 EV'}
                </div>
            </div>



            {/* TABLE AREA - Center */}
            <div style={styles.tableArea}>

                {/* Phase 3: Floating EV Popup */}
                <AnimatePresence>
                    {evPopup && (
                        <motion.div
                            key="ev-popup"
                            initial={{ opacity: 0, y: 10, scale: 0.8 }}
                            animate={{ opacity: 1, y: -20, scale: 1.2 }}
                            exit={{ opacity: 0, y: -40 }}
                            transition={{ duration: 0.6 }}
                            style={{
                                position: 'absolute',
                                top: '45%', left: '50%',
                                x: '-50%',
                                zIndex: 100,
                                fontSize: 28, fontWeight: 900,
                                color: evPopup.color,
                                textShadow: `0 0 20px ${evPopup.color}44, 0 2px 8px rgba(0,0,0,0.5)`,
                                pointerEvents: 'none',
                                fontFamily: "'Inter', -apple-system, sans-serif",
                            }}
                        >
                            {evPopup.value} EV
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* SCENARIO CONTEXT — Fixed at the top of the table area, with settings gear */}
                <div style={{
                    position: 'absolute',
                    top: 3,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 5,
                    pointerEvents: 'none',
                }}>
                    {contextString && (
                        <div style={{
                            fontSize: 15,
                            fontWeight: 900,
                            color: '#ffffff',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                        }}>
                            {contextString}
                        </div>
                    )}
                    {/* Settings Gear — upper right of scenario area */}
                    {onConfigClick && (
                        <button
                            onClick={onConfigClick}
                            style={{
                                position: 'absolute',
                                top: 0,
                                right: 8,
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                border: trainerConfig ? '1.5px solid rgba(0,212,255,0.4)' : '1px solid rgba(255,255,255,0.15)',
                                background: trainerConfig ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.06)',
                                color: trainerConfig ? '#00d4ff' : '#94a3b8',
                                fontSize: 16,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                pointerEvents: 'auto',
                                transition: 'all 0.15s ease',
                                boxShadow: trainerConfig ? '0 0 8px rgba(0,212,255,0.15)' : 'none',
                            }}
                            title={trainerConfig ? `Custom: ${trainerConfig.label || 'Custom'}` : 'Configure Trainer'}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                        </button>
                    )}
                    {/* Active config label */}
                    {trainerConfig && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            right: 46,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'rgba(0,212,255,0.08)',
                            border: '1px solid rgba(0,212,255,0.2)',
                            color: '#00d4ff',
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            pointerEvents: 'none',
                        }}>
                            {trainerConfig.label || 'Custom'}
                        </div>
                    )}
                </div>

                {/* PREMIUM RACETRACK TABLE — GoldenTemplateTable design */}
                {/* NEW CUSTOM STANDALONE RACETRACK TABLE */}
                <div style={styles.basicTable}>

                {/* DYNAMIC PLAYER SEATS — GTO Wizard style: only Hero + active Villain(s) */}
                <div style={styles.seatsContainer}>
                    {seats.map((seat, index) => {
                        const isHero = index === heroSeatIndex;
                        const isButton = index === getButtonSeatIndex;
                        const stackSize = isHero ? heroStack : generateVillainStack(index);
                        // Determine if this villain has folded
                        const villainFolded = !isHero && actionHistory.some(
                            a => a.position?.toUpperCase() === seat.name?.toUpperCase() && /fold/i.test(a.action)
                        );
                        // Determine if this villain has a speech bubble action
                        const villainSeatAction = !isHero ? (
                            actionHistory.find(a => a.position?.toUpperCase() === seat.name?.toUpperCase())
                            || (villainPosition?.toUpperCase() === seat.name?.toUpperCase() && villainAction ? { action: villainAction } : null)
                        ) : null;

                        // GAP 1 FIX: Only show Hero + villain(s) who acted or are the named villain
                        const isActiveVillain = villainPosition?.toUpperCase() === seat.name?.toUpperCase()
                            || actionHistory.some(a => a.position?.toUpperCase() === seat.name?.toUpperCase());
                        if (!isHero && !isActiveVillain) return null;

                        // Phase 13: Strict Standalone Table override — force Hero exact bottom edge, Villain exact top edge
                        const activeCount = seats.filter((s, i) => {
                            if (i === heroSeatIndex) return true;
                            return villainPosition?.toUpperCase() === s.name?.toUpperCase()
                                || actionHistory.some(a => a.position?.toUpperCase() === s.name?.toUpperCase());
                        }).length;
                        let seatX = seat.x;
                        let seatY = seat.y;
                        if (activeCount <= 2) {
                            // Strict Absolute positions: completely outside the table
                            seatX = 50;
                            seatY = isHero ? 82 : -8;
                        }

                        return (
                            <motion.div
                                key={seat.id}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: villainFolded ? 0.35 : 1, scale: 1 }}
                                transition={{ delay: index * 0.05, duration: 0.3 }}
                                style={{
                                    ...styles.seat,
                                    ...m.seat,
                                    left: `${seatX}%`,
                                    top: `${seatY}%`,
                                    x: '-50%',
                                    y: '-50%',
                                }}
                            >
                                {/* Illustrated Avatar — stacked vertically */}
                                <motion.div
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ duration: 0.3, delay: 0.1 }}
                                    style={{
                                        width: isHero ? (isMobile ? 56 : 70) : (isMobile ? 48 : 60),
                                        height: isHero ? (isMobile ? 67 : 84) : (isMobile ? 58 : 72),
                                        position: 'relative',
                                        zIndex: 2,
                                    }}
                                >
                                    <img
                                        src={isHero ? '/avatars/table/free_fox.png' : AVATARS[(index % (AVATARS.length - 1)) + 1]}
                                        alt={isHero ? 'Hero' : 'Villain'}
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'contain',
                                            filter: villainFolded ? 'grayscale(100%) brightness(0.5)' : 'none',
                                        }}
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                </motion.div>

                                {/* Gold Name Badge Container (Relative anchor for absolute decorators) */}
                                <motion.div
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ duration: 0.3, delay: 0.2 }}
                                    style={{
                                        background: isHero
                                            ? 'linear-gradient(180deg, #f0c040 0%, #c4960a 100%)'
                                            : 'linear-gradient(180deg, #555 0%, #333 100%)',
                                        border: isHero ? '2px solid #8b6914' : '2px solid #555',
                                        borderRadius: 8,
                                        padding: '4px 12px',
                                        minWidth: 70,
                                        textAlign: 'center',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                                        marginTop: -8, // Slight overlap with avatar
                                        position: 'relative',
                                        zIndex: 3,
                                    }}
                                >
                                    <div style={{
                                        fontSize: 13,
                                        fontWeight: 'bold',
                                        color: isHero ? '#000' : '#ccc',
                                        textShadow: isHero ? '0 1px 0 rgba(255,255,255,0.3)' : 'none',
                                        whiteSpace: 'nowrap',
                                        letterSpacing: 0.5,
                                    }}>
                                        {isHero ? (playerName || 'HERO') : (villainPosition || seat.name || 'Villain')}
                                    </div>
                                    <div style={{
                                        fontSize: 13,
                                        fontWeight: 'bold',
                                        color: isHero ? '#1a1a00' : '#22c55e',
                                    }}>
                                        {stackSize} bb
                                    </div>

                                    {/* Dealer Button — REMOVED for centering (position shown in scenario text) */}

                                </motion.div>

                                    {/* Hero: face-up cards — CENTERED below badge */}
                                    {isHero && heroCards.length > 0 && (
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'center',
                                            gap: 3,
                                            marginTop: 2,
                                            zIndex: 5,
                                        }}>
                                            {heroCards[0] && (
                                                <motion.img
                                                    key={`hero-seat-0-${questionNumber}`}
                                                    src={getCardPath(heroCards[0])}
                                                    alt={heroCards[0]}
                                                    initial={{ scale: 0.6, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={{ delay: 0.1, duration: 0.3, type: 'spring' }}
                                                    style={{
                                                        width: 44,
                                                        height: 62,
                                                        borderRadius: 4,
                                                        boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
                                                        border: '2px solid rgba(255,255,255,0.4)',
                                                    }}
                                                />
                                            )}
                                            {heroCards[1] && (
                                                <motion.img
                                                    key={`hero-seat-1-${questionNumber}`}
                                                    src={getCardPath(heroCards[1])}
                                                    alt={heroCards[1]}
                                                    initial={{ scale: 0.6, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={{ delay: 0.2, duration: 0.3, type: 'spring' }}
                                                    style={{
                                                        width: 44,
                                                        height: 62,
                                                        borderRadius: 4,
                                                        boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
                                                        border: '2px solid rgba(255,255,255,0.4)',
                                                    }}
                                                />
                                            )}
                                        </div>
                                    )}

                                    {/* Villain: face-down cards — CENTERED below badge */}
                                    {!isHero && !villainFolded && (
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'center',
                                            gap: 2,
                                            marginTop: 2,
                                            zIndex: 1,
                                        }}>
                                            <div style={{
                                                width: 28, height: 40, borderRadius: 4,
                                                background: 'linear-gradient(135deg, #8B0000 0%, #B22222 50%, #8B0000 100%)',
                                                border: '2px solid #FFD700',
                                                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <div style={{
                                                    width: 16, height: 28, borderRadius: 2,
                                                    border: '1px solid rgba(255,215,0,0.4)',
                                                    background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,215,0,0.1) 3px, rgba(255,215,0,0.1) 6px)',
                                                }} />
                                            </div>
                                            <div style={{
                                                width: 28, height: 40, borderRadius: 4,
                                                background: 'linear-gradient(135deg, #8B0000 0%, #B22222 50%, #8B0000 100%)',
                                                border: '2px solid #FFD700',
                                                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <div style={{
                                                    width: 16, height: 28, borderRadius: 2,
                                                    border: '1px solid rgba(255,215,0,0.4)',
                                                    background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,215,0,0.1) 3px, rgba(255,215,0,0.1) 6px)',
                                                }} />
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                        );
                    })}
                </div>

                {/* BOARD CARDS — Multi-street-aware dealing animation */}
                {boardCards.length > 0 && (
                    <div style={{...styles.boardCards, ...m.boardCards}}>
                        {boardCards.map((card, i) => {
                            const isNewStreetCard = isMultiStreetActive && i === newStreetCardIndex && i >= 3;
                            const isExistingCard = isMultiStreetActive && newStreetCardIndex >= 0 && i < newStreetCardIndex;

                            return (
                                <motion.div
                                    key={`${card}-${i}-${questionNumber}`}
                                    initial={isExistingCard
                                        ? { y: 0, rotateY: 0, scale: 1, opacity: 1 } // Existing cards: no re-animation
                                        : isNewStreetCard
                                            ? { y: -80, rotateY: 180, scale: 0.4, opacity: 0 } // New street card: dramatic entrance
                                            : { y: -60, rotateY: 180, scale: 0.6, opacity: 0 } // Initial deal
                                    }
                                    animate={{ y: 0, rotateY: 0, scale: 1, opacity: 1 }}
                                    transition={isExistingCard
                                        ? { duration: 0 } // Instant — no animation for existing cards
                                        : isNewStreetCard
                                            ? { delay: 0.3, duration: 0.7, type: 'spring', stiffness: 120, damping: 14 }
                                            : { delay: i * 0.25, duration: 0.5, type: 'spring', stiffness: 160, damping: 18 }
                                    }
                                    onAnimationComplete={() => {
                                        if (!isExistingCard) SoundEngine.play('card_flip');
                                    }}
                                    style={{ perspective: 600, transformStyle: 'preserve-3d', position: 'relative' }}
                                >
                                    <img
                                        src={getCardPath(card)}
                                        alt={card}
                                        style={{
                                            ...styles.boardCard,
                                            ...m.boardCard,
                                            backfaceVisibility: 'hidden',
                                            // Highlight new street card with a glow
                                            ...(isNewStreetCard ? {
                                                boxShadow: '0 0 12px 3px rgba(251, 146, 60, 0.5), 0 0 24px 6px rgba(251, 146, 60, 0.2)',
                                            } : {}),
                                        }}
                                    />
                                    {/* New card indicator dot */}
                                    {isNewStreetCard && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0 }}
                                            animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
                                            transition={{ delay: 1, duration: 2, repeat: 1 }}
                                            style={{
                                                position: 'absolute', bottom: -6, left: '50%', x: '-50%',
                                                width: 6, height: 6, borderRadius: '50%',
                                                background: '#fb923c', boxShadow: '0 0 6px #fb923c',
                                            }}
                                        />
                                    )}
                                </motion.div>
                            );
                        })}

                        {/* Street separator line between flop and turn/river */}
                        {isMultiStreetActive && boardCards.length > 3 && (
                            <div style={{
                                position: 'absolute', left: `${(3 / boardCards.length) * 100}%`,
                                top: '10%', height: '80%', width: 1,
                                background: 'rgba(251, 146, 60, 0.3)',
                                pointerEvents: 'none',
                            }} />
                        )}
                    </div>
                )}

                {/* PREFLOP: Deck placeholder when no board cards */}
                {boardCards.length === 0 && (
                    <div style={{...styles.boardCards, ...m.boardCards}}>
                        <motion.div
                            animate={{ opacity: [0.3, 0.5, 0.3] }}
                            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                            style={{ display: 'flex', gap: 2 }}
                        >
                            {[0, 1, 2].map(i => (
                                <div key={i} style={{
                                    width: 48, height: 68, borderRadius: 5,
                                    background: 'linear-gradient(180deg, #2a3a2a 0%, #1a2a1a 100%)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                }} />
                            ))}
                        </motion.div>
                    </div>
                )}

                {/* POT DISPLAY — Clean centered display (GAP 5) */}
                {pot > 0 && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{...styles.pot, ...m.pot, x: '-50%', y: '-50%'}}
                    >
                        {/* Chip icon */}
                        <div style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: 'linear-gradient(180deg, #555 0%, #222 100%)',
                            border: '2px solid #666',
                            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1)',
                            flexShrink: 0,
                        }} />
                        <span style={{ fontSize: isMobile ? 14 : 18, fontWeight: 800, color: '#e2e8f0' }}>Pot: {pot} bb</span>
                        {/* SPR + Pot Odds */}
                        <div style={styles.potOverlayRow}>
                            {spr && <span style={styles.potOverlayBadge}>SPR: {spr}</span>}
                            {potOdds && <span style={styles.potOverlayBadge}>Odds: {potOdds}%</span>}
                        </div>
                    </motion.div>
                )}
                </div> {/* END basicTable */}

                {/* Street indicator removed — already shown in header */}
            </div>

            {/* Hand Strength indicator — hidden when hero cards are giant */}
            {/* (Removed to prevent collision with the large hero focal cards) */}

            {/* SESSION STATS HUD — Score, EV Loss, Mistakes + Difficulty Bar */}
            <div style={styles.statsHUD}>
                <div style={styles.statsHUDItem}>
                    <span style={styles.statsHUDLabel}>EV Loss</span>
                    <span style={{ ...styles.statsHUDValue, color: totalSessionEVLoss > 0 ? '#ef4444' : '#22c55e' }}>
                        {totalSessionEVLoss > 0 ? `-${totalSessionEVLoss.toFixed(1)}` : '0.0'} BB
                    </span>
                </div>
                <div style={styles.statsHUDItem}>
                    <span style={styles.statsHUDLabel}>Mistakes</span>
                    <span style={{ ...styles.statsHUDValue, color: sessionMistakes > 0 ? '#fbbf24' : '#22c55e' }}>
                        {sessionMistakes}
                    </span>
                </div>
                <div style={styles.statsHUDItem}>
                    <span style={styles.statsHUDLabel}>Streak</span>
                    <span style={{ ...styles.statsHUDValue, color: streak >= 3 ? '#f97316' : '#94a3b8' }}>
                        {streak >= 2 ? `${streak}` : streak}
                    </span>
                </div>
                {/* Adaptive Difficulty Indicator */}
                {difficultyLevel > 0 && (
                    <div style={styles.statsHUDItem}>
                        <span style={styles.statsHUDLabel}>Difficulty</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <div style={{
                                width: 40, height: 5, borderRadius: 3,
                                background: 'rgba(255,255,255,0.1)',
                                overflow: 'hidden',
                            }}>
                                <motion.div
                                    animate={{ width: `${Math.min(difficultyLevel * 10, 100)}%` }}
                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                    style={{
                                        height: '100%', borderRadius: 3,
                                        background: difficultyLevel <= 3 ? '#22c55e'
                                            : difficultyLevel <= 6 ? '#fbbf24'
                                                : difficultyLevel <= 8 ? '#f97316' : '#ef4444',
                                    }}
                                />
                            </div>
                            <span style={{
                                fontSize: 9, fontWeight: 700, fontFamily: "'Inter', monospace",
                                color: difficultyLevel <= 3 ? '#22c55e'
                                    : difficultyLevel <= 6 ? '#fbbf24'
                                        : difficultyLevel <= 8 ? '#f97316' : '#ef4444',
                            }}>
                                {difficultyLevel}
                            </span>
                            {/* Phase 50: Difficulty labels */}
                            <span style={{ fontSize: 7, color: '#64748b', marginLeft: 1 }}>
                                {difficultyLevel <= 2 ? 'Easy' : difficultyLevel <= 4 ? 'Med' : difficultyLevel <= 6 ? 'Hard' : difficultyLevel <= 8 ? 'Expert' : 'GTO'}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* STREAK CELEBRATION OVERLAY */}
            <AnimatePresence>
                {streakCelebration && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'absolute', inset: 0, zIndex: 200,
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.75)',
                            backdropFilter: 'blur(6px)',
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.3, rotateZ: -20 }}
                            animate={{ scale: 1, rotateZ: 0 }}
                            transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                            style={{
                                width: 80, height: 80, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #fbbf24 0%, #f97316 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 36, boxShadow: '0 0 40px rgba(251,191,36,0.5)',
                                marginBottom: 12,
                            }}
                        >
                            <ClassificationSVGIcon icon="star" size={36} color="#fff" />
                        </motion.div>
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.15 }}
                            style={{
                                fontFamily: "'Inter', sans-serif", fontSize: 22,
                                fontWeight: 900, color: '#fbbf24', letterSpacing: 2,
                                textShadow: '0 2px 8px rgba(251,191,36,0.4)',
                            }}
                        >
                            {streakCelebration.streak} STREAK!
                        </motion.div>
                        <motion.div
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            style={{
                                fontSize: 14, fontWeight: 700, marginTop: 8,
                                color: '#00d4ff', letterSpacing: 1,
                            }}
                        >
                            +{streakCelebration.reward} Diamonds
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* SPEED BONUS TOAST */}
            <AnimatePresence>
                {speedBonusToast && (
                    <motion.div
                        initial={{ y: -30, opacity: 0, scale: 0.8 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: -20, opacity: 0 }}
                        style={{
                            position: 'absolute', top: 80, left: '50%',
                            x: '-50%', zIndex: 150,
                            padding: '8px 20px', borderRadius: 10,
                            background: `linear-gradient(135deg, ${speedBonusToast.color}22 0%, ${speedBonusToast.color}11 100%)`,
                            border: `1px solid ${speedBonusToast.color}66`,
                            color: speedBonusToast.color,
                            fontFamily: "'Inter', monospace",
                            fontSize: 13, fontWeight: 800, letterSpacing: 1.5,
                            boxShadow: `0 0 20px ${speedBonusToast.color}33`,
                        }}
                    >
                        {speedBonusToast.label}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ PRE-DECISION HINTS — Show contextual tips BEFORE user answers ═══ */}
            {!showFeedback && !selectedAnswer && question && (() => {
                try {
                    const sc = question?.scenario || question || {};
                    const hints = [];
                    // Key concept reminders
                    if (getKeyConceptReminders) {
                        const kcr = getKeyConceptReminders(sc.street || 'flop', sc.nodeType || '', sc.heroPosition || '');
                        if (kcr && kcr.reminders && kcr.reminders.length > 0) {
                            hints.push(kcr.reminders[0]);
                        }
                    }
                    // Pre-decision preview
                    if (getPreDecisionPreview && hints.length === 0) {
                        const pdp = getPreDecisionPreview(
                            question?.handCategory || '',
                            sc.street || 'flop',
                            sc.nodeType || '',
                            sc.heroPosition || '',
                            gtoFrequencies || {}
                        );
                        if (pdp && pdp.hint) hints.push(pdp.hint);
                    }
                    if (hints.length === 0) return null;
                    return (
                        <div style={{
                            margin: '0 16px 6px', padding: '6px 12px',
                            background: 'linear-gradient(90deg, rgba(34,211,238,0.08), rgba(14,165,233,0.04))',
                            borderRadius: 8, border: '1px solid rgba(34,211,238,0.15)',
                        }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#22d3ee', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>💡 Hint</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>{hints[0]}</div>
                        </div>
                    );
                } catch (_) { return null; }
            })()}

            {/* ACTION BUTTONS — GTO Wizard-style poker action bar (F2: Dynamic sizing + F9: Keyboard hints) */}
            <div style={{ ...styles.actionBar, position: 'relative' }}>
                {/* YOUR ACTION turn indicator */}
                {!showFeedback && (
                    <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                        style={{
                            position: 'absolute', top: -20, left: '50%',
                            x: '-50%',
                            fontSize: 10, fontWeight: 800, letterSpacing: 2,
                            color: '#00d4ff', textTransform: 'uppercase',
                            textShadow: '0 0 8px rgba(0,212,255,0.3)',
                            whiteSpace: 'nowrap', zIndex: 5,
                        }}
                    >
                        YOUR ACTION
                    </motion.div>
                )}
                {/* RNG MODE: Prominent dice roll display (GTO Wizard style) */}
                {rngMode && rngRoll !== null && !showFeedback && (
                    <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{
                            position: 'absolute', top: -50, right: 8,
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'rgba(168,85,247,0.2)',
                            border: '1px solid rgba(168,85,247,0.5)',
                            borderRadius: 12, padding: '4px 12px',
                            zIndex: 10,
                        }}
                    >
                        <span style={{ fontSize: 16 }}>🎲</span>
                        <span style={{
                            fontSize: 20, fontWeight: 900,
                            color: '#a855f7', fontFamily: "'Orbitron', monospace",
                            textShadow: '0 0 10px rgba(168,85,247,0.4)',
                        }}>
                            {rngRoll}
                        </span>
                    </motion.div>
                )}
                {/* RNG MODE: Show frequency ranges on action buttons during feedback */}
                {rngMode && showFeedback && rngRoll !== null && computedFrequencies && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            position: 'absolute', top: -55, left: 0, right: 0,
                            display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap',
                            zIndex: 10, padding: '0 8px',
                        }}
                    >
                        <span style={{
                            fontSize: 12, fontWeight: 800, color: '#a855f7',
                            background: 'rgba(168,85,247,0.15)',
                            border: '1px solid rgba(168,85,247,0.3)',
                            padding: '2px 10px', borderRadius: 8,
                        }}>
                            🎲 {rngRoll}
                        </span>
                        {(() => {
                            // Build cumulative ranges
                            let cumulative = 0;
                            return displayOptions.slice(0, 9).map(opt => {
                                const id = opt.id || opt;
                                const freq = displayFrequencies[id] || computedFrequencies[id] || 0;
                                if (freq <= 0) return null;
                                const rangeStart = cumulative + 1;
                                cumulative += freq;
                                const rangeEnd = cumulative;
                                const isTarget = rngRoll >= rangeStart && rngRoll <= rangeEnd;
                                const text = typeof opt === 'string' ? opt : (opt.text || '');
                                return (
                                    <span key={id} style={{
                                        fontSize: 9, fontWeight: 700,
                                        color: isTarget ? '#22c55e' : '#94a3b8',
                                        background: isTarget ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${isTarget ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                        padding: '2px 6px', borderRadius: 6,
                                    }}>
                                        {text.toUpperCase()} ({rangeStart}-{rangeEnd})
                                    </span>
                                );
                            }).filter(Boolean);
                        })()}
                    </motion.div>
                )}
                {/* Countdown Timer — Enable via trainer config or settings */}
                <CountdownTimer
                    seconds={trainerConfig?.timerSeconds || 30}
                    questionNumber={questionNumber}
                    showFeedback={showFeedback}
                    active={trainerConfig?.timerEnabled || false}
                    onTimeExpired={() => {
                        // BUG-04 FIX: Auto-submit worst option when timer expires
                        if (!showFeedback && !selectedAnswer && onAnswer) {
                            const opts = question?.options || [];
                            // Find fold option, or use the first option as fallback
                            const foldOpt = opts.find(o => /fold/i.test(o.text || o.label || ''));
                            const worstId = foldOpt ? (foldOpt.id || foldOpt) : (opts[0]?.id || opts[0]);
                            if (worstId) {
                                setSelectedAnswer(worstId);
                                onAnswer(worstId);
                                SoundEngine.play('wrong');
                            }
                        }
                    }}
                />
                {/* Quit/Back Button */}
                {onExit && (
                    <button
                        onClick={onExit}
                        style={{
                            position: 'absolute', top: -40, left: 0,
                            padding: '6px 14px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#94a3b8', fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', zIndex: 10,
                        }}
                    >
                        Quit
                    </button>
                )}
                {/* GTO WIZARD-STYLE: Render grouped/standard actions (up to 9) */}
                {displayOptions.slice(0, 9).map((option, index) => {
                    const optionId = option.id || String.fromCharCode(97 + index);
                    const text = typeof option === 'string' ? option : (option.text || option.label || 'Option');
                    const freq = displayFrequencies[optionId] || computedFrequencies[optionId] || computedFrequencies[optionId?.toLowerCase()] || 0;
                    const actionType = detectActionType(text);
                    const shortcutKey = index + 1;
                    // Responsive sizing: shrink buttons when > 4 options
                    const optionCount = Math.min(displayOptions.length, 9);
                    const isCompact = optionCount > 4;
                    const isVeryCompact = optionCount > 6;

                    return (
                        <div key={optionId} style={{
                            ...styles.actionButtonWrapper,
                            // Flex basis adapts to option count
                            flex: isVeryCompact ? '0 0 auto' : 1,
                            minWidth: isVeryCompact ? `${Math.floor(100 / optionCount) - 1}%` : undefined,
                        }}>
                            <motion.button
                                onClick={() => handleAnswerWithGrouping(optionId)}
                                disabled={showFeedback}
                                style={{
                                    ...getActionButtonStyle(option, index),
                                    // Scale down padding/font for many buttons
                                    ...(isCompact ? { padding: '8px 4px', minHeight: 52 } : {}),
                                    ...(isVeryCompact ? { padding: '6px 2px', minHeight: 44, borderRadius: 6 } : {}),
                                }}
                                whileHover={!showFeedback ? { scale: 1.04, y: -3 } : {}}
                                whileTap={!showFeedback ? { scale: 0.96 } : {}}
                            >
                                {/* Keyboard shortcut hint (1-9) — GTO Wizard-style badge */}
                                {!showFeedback && shortcutKey <= 9 && (
                                    <span style={{
                                        position: 'absolute',
                                        top: 3,
                                        left: 4,
                                        fontSize: isCompact ? 7 : 8,
                                        color: 'rgba(255,255,255,0.55)',
                                        fontWeight: 'bold',
                                        background: 'rgba(255,255,255,0.06)',
                                        borderRadius: 3,
                                        padding: '0 3px',
                                        lineHeight: '14px',
                                        minWidth: 12,
                                        textAlign: 'center',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                    }}>
                                        {shortcutKey}
                                    </span>
                                )}
                                <span style={styles.actionText}>
                                    {/* GTO WIZARD STYLE: Show the ACTUAL action text from solver.
                                        "Bet 33%", "Bet 67%", "Check", "Fold" — exactly as solver provides.
                                        No more generic "BET / RAISE" override. */}
                                    <div style={{
                                        fontSize: isVeryCompact ? 10 : isCompact ? 11 : 13,
                                        fontWeight: '800',
                                        letterSpacing: 0.5,
                                        lineHeight: 1.1,
                                    }}>
                                        {text.toUpperCase()}
                                    </div>
                                    {/* BB sizing beneath action label (if present in text) */}
                                    {(() => {
                                        const betMatch = text.match(/(\d+\.?\d*)\s*(bb|BB)/i);
                                        if (!betMatch) return null;
                                        const betSize = parseFloat(betMatch[1]);
                                        return (
                                            <div style={{
                                                display: 'block',
                                                fontSize: isCompact ? 12 : 16,
                                                fontWeight: '900',
                                                color: '#ffffff',
                                                marginTop: 2,
                                            }}>
                                                {betSize} BB
                                            </div>
                                        );
                                    })()}
                                </span>
                                {/* Frequency label on feedback OR study mode */}
                                {(showFeedback || (studyMode && computedFrequencies)) && (
                                    <motion.span
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: showFeedback ? 0.3 : 0 }}
                                        style={{
                                            ...styles.freqLabel,
                                            fontSize: isCompact ? 9 : 11,
                                            ...(studyMode && !showFeedback ? { opacity: 0.5, fontSize: 9 } : {}),
                                        }}
                                    >
                                        {freq}%
                                    </motion.span>
                                )}
                                {/* Per-Action EV Value */}
                                {showFeedback && question?.evData?.actionEVs && (() => {
                                    const ev = question.evData.actionEVs[optionId] ?? question.evData.actionEVs[optionId?.toLowerCase()];
                                    if (typeof ev !== 'number') return null;
                                    return (
                                        <motion.span
                                            initial={{ opacity: 0, x: -5 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.5 }}
                                            style={{
                                                position: 'absolute',
                                                top: 3,
                                                right: 6,
                                                fontSize: isCompact ? 7 : 8,
                                                fontWeight: 800,
                                                fontFamily: "'Inter', monospace",
                                                color: ev >= 0 ? '#22c55e' : '#ef4444',
                                                letterSpacing: 0.3,
                                            }}
                                        >
                                            {ev >= 0 ? '+' : ''}{ev.toFixed(2)}
                                        </motion.span>
                                    );
                                })()}
                            </motion.button>
                            {/* Frequency bar under button */}
                            <FrequencyBar
                                frequency={freq}
                                color={ACTION_COLORS[actionType]?.border || '#64748b'}
                                show={showFeedback || (studyMode && computedFrequencies)}
                            />
                        </div>
                    );
                })}
            </div>

            {/* F4: MODE SWITCHING BAR — Bottom toolbar */}
            <div style={styles.modeBar}>
                {MODE_TABS.map(mode => (
                    <button
                        key={mode.id}
                        onClick={() => setActiveMode(mode.id)}
                        style={{
                            ...styles.modeBarBtn,
                            color: activeMode === mode.id ? '#00d4ff' : '#64748b',
                            borderTop: activeMode === mode.id ? '2px solid #00d4ff' : '2px solid transparent',
                            background: activeMode === mode.id ? 'rgba(0,212,255,0.06)' : 'transparent',
                        }}
                    >
                        <span style={{ fontSize: 16 }}>{mode.icon}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>{mode.label}</span>
                    </button>
                ))}
            </div>

            {/* F4: RANGE MODE — Show range grid when mode is active */}
            {activeMode === 'range' && !showFeedback && (() => {
                try {
                    return (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                        >
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4, textAlign: 'center' }}>
                                Range Matrix {heroCards?.length === 2 && <span style={{ color: '#00d4ff' }}>• {heroCards.join('')}</span>}
                            </div>
                            <RangeGrid
                                gridData={(() => {
                                    if (!computedFrequencies || !options) return null;
                                    const gridData = {};
                                    options.forEach(opt => {
                                        const optId = opt?.id || opt;
                                        const freq = typeof computedFrequencies[optId] === 'number' ? computedFrequencies[optId] : 0;
                                        if (freq > 0) gridData[optId] = freq;
                                    });
                                    return gridData;
                                })()}
                                actions={options?.map(o => o?.id || o) || []}
                                cellSize={18}
                                heroHand={heroCards?.join('')}
                                compact={true}
                            />
                        </motion.div>
                    );
                } catch (err) {
                    console.warn('[UDT] Range panel render error:', err.message);
                    return null;
                }
            })()}

            {/* F4: STRATEGY MODE — Show full strategy analysis */}
            {activeMode === 'strategy' && !showFeedback && computedFrequencies && Array.isArray(options) && options.length > 0 && (() => {
                try {
                    return (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                        >
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6, textAlign: 'center' }}>
                                GTO Strategy Distribution
                            </div>
                            {options.slice(0, 9).map(opt => {
                                if (!opt) return null;
                                const optId = opt?.id || opt;
                                const text = typeof opt === 'string' ? opt : (opt?.text || opt?.label || 'Option');
                                const freq = typeof computedFrequencies[optId] === 'number' ? computedFrequencies[optId] : 0;
                                const actionType = detectActionType(text);
                                const barColor = ACTION_COLORS[actionType]?.border || '#64748b';
                                return (
                                    <div key={optId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <div style={{ width: 60, fontSize: 10, fontWeight: 600, color: barColor, textAlign: 'right' }}>{text}</div>
                                        <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${freq}%` }}
                                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                                style={{ height: '100%', background: barColor, borderRadius: 4 }}
                                            />
                                        </div>
                                        <div style={{ width: 36, fontSize: 11, fontWeight: 800, color: '#e2e8f0', textAlign: 'right', fontFamily: "'Inter', monospace" }}>{freq}%</div>
                                    </div>
                                );
                            })}
                        </motion.div>
                    );
                } catch (err) {
                    console.warn('[UDT] Strategy panel render error:', err.message);
                    return null;
                }
            })()}

            {/* F4: SETTINGS MODE */}
            {activeMode === 'settings' && !showFeedback && (() => {
                try {
                    return (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <button onClick={() => setStudyMode(!studyMode)} style={styles.settingsBtn}>
                                    {studyMode ? '📖 Study Mode: ON' : '📖 Study Mode: OFF'}
                                </button>
                                <button onClick={() => setRngMode(!rngMode)} style={styles.settingsBtn}>
                                    {rngMode ? '🎲 RNG Mode: ON' : '🎲 RNG Mode: OFF'}
                                </button>
                                {onExit && (
                                    <button onClick={onExit} style={{ ...styles.settingsBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
                                        🚪 Quit Session
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    );
                } catch (err) {
                    console.warn('[UDT] Settings panel render error:', err.message);
                    return null;
                }
            })()}

            {/* INLINE FEEDBACK — Table stays visible, results shown below action bar */}
            {showFeedback && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                    style={styles.feedbackInline}
                >
                    {/* Collapsible toggle for feedback panel (GAP 9) */}
                    <button
                        onClick={() => setFeedbackCollapsed && setFeedbackCollapsed(prev => !prev)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 1,
                            cursor: 'pointer',
                            padding: '4px 8px',
                            alignSelf: 'flex-end',
                            textTransform: 'uppercase',
                        }}
                    >
                        {feedbackCollapsed ? '▼ SHOW GTO DETAILS' : '✕ CLOSE'}
                    </button>

                    {/* Collapsible feedback body - uses display:none for clean collapse */}
                    <div style={{ display: feedbackCollapsed ? 'none' : 'contents', width: '100%', maxWidth: 600 }}>
                    <div style={{ width: '100%', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                                GTO Strategy
                            </div>
                            {/* Phase 22: Mixed strategy indicator — shown when multiple actions ≥20% freq */}
                            {(() => {
                                const significantActions = (Array.isArray(options) ? options : []).filter(opt => {
                                    const f = computedFrequencies?.[opt?.id] || 0;
                                    return f >= 20;
                                }).length;
                                if (significantActions >= 2) {
                                    return (
                                        <span style={{
                                            fontSize: 8, fontWeight: 700, color: '#a855f7',
                                            background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)',
                                            padding: '1px 6px', borderRadius: 4, letterSpacing: 0.5,
                                        }}>
                                            MIXED STRATEGY
                                        </span>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        {(Array.isArray(options) ? options : []).slice(0, 9).map(opt => {
                            if (!opt) return null;
                            const optId = opt?.id || opt;
                            const text = typeof opt === 'string' ? opt : (opt?.text || opt?.label || 'Option');
                            const freq = typeof computedFrequencies?.[optId] === 'number' ? computedFrequencies[optId] : 0;
                            const isCorrect = optId === correctAnswer;
                            const isSelected = optId === selectedAnswer;
                            const actionType = detectActionType(text);
                            const barColor = isCorrect ? '#22c55e' : isSelected ? (classConfig?.color || '#ef4444') : ACTION_COLORS[actionType]?.border || '#475569';
                            return (
                                <div key={optId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                    <div style={{
                                        width: 72, fontSize: 9, fontWeight: 700, textAlign: 'right',
                                        color: isCorrect ? '#22c55e' : isSelected ? (classConfig?.color || '#ef4444') : '#94a3b8',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {isCorrect && '✓ '}{isSelected && !isCorrect && '✗ '}{text}
                                    </div>
                                    <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${freq}%` }}
                                            transition={{ duration: 0.5, delay: 0.15 }}
                                            style={{ height: '100%', background: barColor, borderRadius: 4, minWidth: freq > 0 ? 2 : 0 }}
                                        />
                                    </div>
                                    <div style={{ width: 34, fontSize: 10, fontWeight: 800, textAlign: 'right', fontFamily: "'Inter', monospace", color: '#e2e8f0' }}>
                                        {freq}%
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* Classification + EV Row */}
                    <div style={styles.feedbackTopRow}>
                        <motion.div
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 300 }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 16px', borderRadius: 20,
                                background: classConfig?.bgColor || 'rgba(59,130,246,0.15)',
                                border: `1.5px solid ${classConfig?.borderColor || '#3b82f6'}`,
                            }}
                        >
                            <ClassificationSVGIcon icon={classConfig?.icon} size={16} color={classConfig?.color} />
                            <span style={{
                                fontSize: 13, fontWeight: 800, color: classConfig?.color || '#3b82f6',
                                letterSpacing: 0.8, textTransform: 'uppercase',
                                fontFamily: "'Inter', monospace",
                            }}>{classConfig?.label || 'Unknown'}</span>
                        </motion.div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>EV:</span>
                            <span style={{
                                fontSize: 14, fontWeight: 800,
                                fontFamily: "'Inter', monospace",
                                color: evLoss > 0 ? '#ef4444' : '#22c55e',
                            }}>
                                {evLoss > 0 ? `-${evLoss.toFixed(2)}` : '0.00'} BB
                            </span>
                        </div>
                    </div>

                    {/* Your Pick + Correct Answer Row */}
                    {selectedAnswer && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                            justifyContent: 'center',
                        }}>
                            <span style={{
                                fontSize: 11, fontWeight: 600,
                                color: feedbackResult === 'correct' ? '#22c55e' : '#ef4444',
                            }}>
                                {feedbackResult === 'correct' ? '✓' : '✗'} You: {options.find(o => o.id === selectedAnswer)?.text || selectedAnswer}
                            </span>
                            {selectedAnswer !== correctAnswer && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e' }}>
                                    ✓ Best: {options.find(o => o.id === correctAnswer)?.text || correctAnswer}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Phase 3: RNG Roll Indicator */}
                    {rngMode && rngRoll !== null && computedFrequencies && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '4px 12px', borderRadius: 6,
                            background: 'rgba(168,85,247,0.08)',
                            border: '1px solid rgba(168,85,247,0.2)',
                            fontSize: 11,
                        }}>
                            <span style={{ fontWeight: 900, color: '#a855f7', fontSize: 14 }}>{rngRoll}</span>
                            <span style={{ color: '#a855f7', fontWeight: 700, letterSpacing: 0.5 }}>RNG</span>
                            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                                {(() => {
                                    let cumulative = 0;
                                    for (const [actionId, freq] of Object.entries(computedFrequencies || {})) {
                                        cumulative += freq;
                                        if (rngRoll <= cumulative) {
                                            const opt = options.find(o => o.id === actionId);
                                            return `→ ${opt?.text || actionId}`;
                                        }
                                    }
                                    return `→ ${options[0]?.text || 'Check'}`;
                                })()}
                            </span>
                        </div>
                    )}

                    {/* Phase 44: EV Loss Summary — "Your action: +X BB | Optimal: +Y BB | Cost: Z BB" */}
                    {showFeedback && question?.evData?.actionEVs && selectedAnswer && correctAnswer && selectedAnswer !== correctAnswer && (() => {
                        const selEV = question.evData.actionEVs[selectedAnswer] ?? question.evData.actionEVs[selectedAnswer?.toLowerCase()];
                        const corEV = question.evData.actionEVs[correctAnswer] ?? question.evData.actionEVs[correctAnswer?.toLowerCase()];
                        if (selEV === undefined || corEV === undefined) return null;
                        const evCost = corEV - selEV;
                        if (evCost <= 0) return null; // No cost (shouldn't happen for wrong answers)
                        const selText = options.find(o => o.id === selectedAnswer)?.text || selectedAnswer;
                        const corText = options.find(o => o.id === correctAnswer)?.text || correctAnswer;
                        return (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.1 }}
                                style={{
                                    width: '100%', padding: '8px 12px',
                                    background: 'rgba(239, 68, 68, 0.06)', borderRadius: 8,
                                    border: '1px solid rgba(239, 68, 68, 0.15)',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}
                            >
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>You</div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', fontFamily: "'Inter', monospace" }}>
                                            {selText} ({selEV >= 0 ? '+' : ''}{selEV.toFixed(2)} BB)
                                        </div>
                                    </div>
                                    <div style={{ color: '#475569', fontSize: 12 }}>→</div>
                                    <div>
                                        <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>Optimal</div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', fontFamily: "'Inter', monospace" }}>
                                            {corText} ({corEV >= 0 ? '+' : ''}{corEV.toFixed(2)} BB)
                                        </div>
                                    </div>
                                </div>
                                <div style={{
                                    padding: '3px 8px', borderRadius: 6,
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                }}>
                                    <div style={{ fontSize: 8, color: '#f87171', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' }}>Cost</div>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444', fontFamily: "'Orbitron', monospace", textAlign: 'center' }}>
                                        -{evCost.toFixed(2)} BB
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })()}

                    {/* Phase 32: Stacked GTO Frequency Bar — shows all actions in one visual strip */}
                    {computedFrequencies && Object.keys(computedFrequencies || {}).length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 }}
                            style={{
                                width: '100%', padding: '6px 10px',
                                background: 'rgba(0,0,0,0.2)', borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.04)',
                            }}
                        >
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1.2, marginBottom: 4, textTransform: 'uppercase' }}>
                                GTO Strategy
                            </div>
                            {/* Stacked bar */}
                            <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', gap: 1, background: 'rgba(0,0,0,0.3)' }}>
                                {options.filter(o => {
                                    const f = computedFrequencies[o.id] || computedFrequencies[o.id?.toLowerCase()] || 0;
                                    return f > 0;
                                }).sort((a, b) => {
                                    const fa = computedFrequencies[a.id] || computedFrequencies[a.id?.toLowerCase()] || 0;
                                    const fb = computedFrequencies[b.id] || computedFrequencies[b.id?.toLowerCase()] || 0;
                                    return fb - fa;
                                }).map(opt => {
                                    const freq = computedFrequencies[opt.id] || computedFrequencies[opt.id?.toLowerCase()] || 0;
                                    if (freq <= 0) return null;
                                    const actionType = detectActionType(typeof opt === 'object' ? (opt.text || '') : String(opt));
                                    const colors = ACTION_COLORS[actionType] || ACTION_COLORS.neutral;
                                    const isOptimal = opt.id === correctAnswer;
                                    return (
                                        <motion.div
                                            key={opt.id}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${freq}%` }}
                                            transition={{ duration: 0.5, delay: 0.1 }}
                                            style={{
                                                height: '100%',
                                                background: colors.accent || colors.bg,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: freq >= 15 ? 8 : 6,
                                                fontWeight: 800,
                                                color: '#fff',
                                                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                                                overflow: 'hidden',
                                                whiteSpace: 'nowrap',
                                                border: isOptimal ? '1px solid #22c55e' : 'none',
                                            }}
                                            title={`${typeof opt === 'object' ? opt.text : opt}: ${freq}%`}
                                        >
                                            {freq >= 12 ? `${typeof opt === 'object' ? opt.text : opt} ${freq}%` : freq >= 6 ? `${freq}%` : ''}
                                        </motion.div>
                                    );
                                })}
                            </div>
                            {/* Legend for small segments */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                                {options.filter(o => {
                                    const f = computedFrequencies[o.id] || computedFrequencies[o.id?.toLowerCase()] || 0;
                                    return f > 0;
                                }).map(opt => {
                                    const freq = computedFrequencies[opt.id] || computedFrequencies[opt.id?.toLowerCase()] || 0;
                                    const actionType = detectActionType(typeof opt === 'object' ? (opt.text || '') : String(opt));
                                    const colors = ACTION_COLORS[actionType] || ACTION_COLORS.neutral;
                                    const isOptimal = opt.id === correctAnswer;
                                    return (
                                        <span key={opt.id} style={{ fontSize: 8, display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: 2, background: colors.accent || colors.bg, display: 'inline-block' }} />
                                            <span style={{ color: isOptimal ? '#22c55e' : '#94a3b8', fontWeight: isOptimal ? 800 : 600 }}>
                                                {typeof opt === 'object' ? opt.text : opt} {freq}%
                                            </span>
                                        </span>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* Per-Action EV Comparison */}
                    {question?.evData?.actionEVs && Object.keys(question.evData.actionEVs || {}).length > 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            style={{
                                width: '100%', padding: '6px 10px',
                                background: 'rgba(0,0,0,0.3)', borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1.2, marginBottom: 4, textTransform: 'uppercase' }}>
                                EV by Action
                            </div>
                            {options.slice(0, 9).map(opt => {
                                const optId = opt.id || opt;
                                const ev = question.evData.actionEVs[optId];
                                if (ev === undefined) return null;
                                const maxEV = Math.max(...Object.values(question.evData.actionEVs || {}).filter(v => typeof v === 'number'));
                                const minEV = Math.min(...Object.values(question.evData.actionEVs || {}).filter(v => typeof v === 'number'));
                                const range = maxEV - minEV || 1;
                                const barWidth = Math.max(5, ((ev - minEV) / range) * 100);
                                const isOptimal = optId === correctAnswer;
                                const isSelected = optId === selectedAnswer;
                                const barColor = isOptimal ? '#22c55e' : isSelected ? (classConfig?.color || '#ef4444') : '#475569';

                                return (
                                    <div key={optId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                        <div style={{ width: 42, fontSize: 9, fontWeight: 600, color: isOptimal ? '#22c55e' : '#94a3b8', textAlign: 'right' }}>
                                            {typeof opt === 'object' ? opt.text : opt}
                                        </div>
                                        <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${barWidth}%` }}
                                                transition={{ duration: 0.5, delay: 0.2 }}
                                                style={{ height: '100%', background: barColor, borderRadius: 3 }}
                                            />
                                        </div>
                                        <div style={{ width: 44, fontSize: 9, fontWeight: 'bold', textAlign: 'right', fontFamily: "'Inter', monospace", color: ev >= 0 ? '#22c55e' : '#ef4444' }}>
                                            {ev >= 0 ? '+' : ''}{ev.toFixed(2)}
                                        </div>
                                    </div>
                                );
                            })}
                        </motion.div>
                    )}

                    {/* Phase 25: Explanation + Strategic Why Drawer */}
                    {(() => {
                        const correctOpt = options.find(o => o.id === correctAnswer)?.text || correctAnswer;
                        const selectedOpt = selectedAnswer ? (options.find(o => o.id === selectedAnswer)?.text || selectedAnswer) : '';
                        const selectedFreq = computedFrequencies?.[selectedAnswer] || 0;
                        const correctFreq = computedFrequencies?.[correctAnswer] || 0;

                        // Phase 25: Mistake-specific feedback — tell the player what they did wrong
                        const mistakeFeedback = (() => {
                            if (!selectedAnswer || selectedAnswer === correctAnswer || feedbackResult === 'correct') return '';
                            const selA = selectedAnswer.toLowerCase();
                            const corA = correctAnswer.toLowerCase();
                            const selIsBet = selA.startsWith('b') || selA === 'allin';
                            const selIsCheck = selA === 'c' || selA === 'x';
                            const selIsCall = selA === 'call';
                            const selIsFold = selA === 'f';
                            const selIsRaise = selA.startsWith('r');
                            const corIsBet = corA.startsWith('b') || corA === 'allin';
                            const corIsCheck = corA === 'c' || corA === 'x';
                            const corIsCall = corA === 'call';
                            const corIsFold = corA === 'f';
                            const corIsRaise = corA.startsWith('r');

                            // Hand strength context
                            const hCat = question?.handCategory || '';
                            const hcLow = hCat.toLowerCase();
                            const hasDraw = hcLow.includes('draw') || hcLow.includes('oesd') || hcLow.includes('gutshot');
                            const hasMonster = hcLow.includes('set') || hcLow.includes('two pair') || hcLow.includes('straight') || hcLow.includes('flush') || hcLow.includes('full house');
                            const hasTopPair = hcLow.includes('top pair') || hcLow.includes('overpair');

                            // Player bet when should check
                            if (selIsBet && corIsCheck) {
                                if (hasMonster) return `Betting your monster here is too transparent — ${correctOpt} traps villain and builds a deceptive checking range.`;
                                if (hasTopPair) return `Betting top pair here bloats the pot — ${correctOpt} controls the pot and avoids getting raised off a one-pair hand.`;
                                if (hasDraw) return `Betting your draw here is unnecessary — ${correctOpt} realizes equity for free without putting more chips at risk.`;
                                return `Betting here bloats the pot unnecessarily — ${correctOpt} controls the pot and realizes equity.`;
                            }
                            // Player checked when should bet
                            if (selIsCheck && corIsBet) {
                                if (hasMonster) return `Checking a monster here misses value — ${correctOpt} builds the pot while your hand is strong. Don't slow-play when you should bet.`;
                                if (hasDraw) return `Checking your draw misses fold equity — ${correctOpt} combines semi-bluff equity with the chance to win the pot now.`;
                                return `Checking misses value or lets opponents realize equity for free — ${correctOpt} is more profitable.`;
                            }
                            // Player called when should fold
                            if (selIsCall && corIsFold) {
                                if (hasDraw) return `Calling your draw here is -EV — the sizing prices you out. You need better pot odds or implied odds to continue.`;
                                if (hasTopPair) return `Calling with top pair is too loose here — villain's aggression indicates a range that beats you. Save your chips.`;
                                return `Calling here is unprofitable — the bet prices you out. Folding saves BB in the long run.`;
                            }
                            // Player folded when should call
                            if (selIsFold && corIsCall) {
                                if (hasDraw) return `Folding your draw is too tight — you have enough equity (pot odds + implied odds) to continue profitably.`;
                                if (hasTopPair) return `Folding top pair here is too tight — your hand beats enough of villain's bluffs and thin value to call profitably.`;
                                return `Folding here is too tight — you have enough equity against the betting range to call profitably.`;
                            }
                            // Player called when should raise
                            if (selIsCall && (corIsRaise || corIsBet)) {
                                if (hasMonster) return `Flatting a monster is too passive here — ${correctOpt} builds the pot while you have the nuts. Don't let villain off cheap.`;
                                if (hasDraw) return `Flatting is too passive — raising as a semi-bluff maximizes fold equity while your draw gives backup equity.`;
                                return `Flatting is too passive — raising builds the pot with your equity advantage.`;
                            }
                            // Player raised when should call
                            if (selIsRaise && corIsCall) {
                                if (hasMonster) return `Raising here is too aggressive — calling traps villain's bluffs and weaker value hands. Raising folds out the hands you beat.`;
                                return `Raising bloats the pot against a strong range — calling keeps bluffs in and controls the pot.`;
                            }
                            // Player folded when should bet/raise
                            if (selIsFold && (corIsBet || corIsRaise)) {
                                if (hasDraw) return `Folding a draw when you should be semi-bluffing — ${correctOpt} combines fold equity with draw equity.`;
                                if (hasTopPair) return `Folding the best hand! Your top pair has enough equity to be the aggressor here.`;
                                return `Folding when you should be the aggressor — you have enough equity to put in money here.`;
                            }
                            // Wrong sizing — Phase 35: detailed sizing feedback
                            if (selIsBet && corIsBet) {
                                const selSize = parseInt((selA.match(/^b(\d+)$/) || [])[1] || '0');
                                const corSize = parseInt((corA.match(/^b(\d+)$/) || [])[1] || '0');
                                if (selSize > 0 && corSize > 0) {
                                    if (selSize > corSize) return `Overbetting — ${correctOpt} is more efficient. Larger sizes fold out too many hands you want to get value from.`;
                                    return `Underbetting — ${correctOpt} extracts more value and charges draws properly. Your sizing lets opponents continue too cheaply.`;
                                }
                                return `Wrong sizing — the solver prefers ${correctOpt} here for a better risk/reward ratio.`;
                            }
                            if (selIsRaise && corIsRaise) {
                                const selSize = parseInt((selA.match(/^r(\d+)$/) || [])[1] || '0');
                                const corSize = parseInt((corA.match(/^r(\d+)$/) || [])[1] || '0');
                                if (selSize > 0 && corSize > 0) {
                                    if (selSize > corSize) return `Raise too large — ${correctOpt} keeps more of villain's range in. Smaller raises often extract more.`;
                                    return `Raise too small — ${correctOpt} puts more pressure and sets up better stack dynamics for the next street.`;
                                }
                                return `Wrong raise size — ${correctOpt} creates better SPR dynamics for the next street.`;
                            }
                            // Player bet when should fold
                            if (selIsBet && corIsFold) return `Bluffing in a spot where the solver gives up — not enough fold equity or too much showdown risk.`;
                            // Player checked when should fold (facing bet)
                            if (selIsCheck && corIsFold) return `You can't check here (you're facing a bet) — the solver folds this hand.`;
                            // Player raised when should fold
                            if (selIsRaise && corIsFold) return `Raise-bluffing here is -EV — the solver recognizes this spot has poor bluff equity and folds.`;
                            return `${correctOpt} at ${correctFreq}% is the solver's preferred action here.`;
                        })();

                        // Phase 47: Enhanced feedback messages for all classifications
                        // BUG FIX (TRAIN-FEEDBACK-SYNC-1): only trust the upstream `explanation`
                        // prop when its content matches the rendered scenario; otherwise fall
                        // back to the auto-generated abstract template (which is scenario-free).
                        const explanationOk = explanationMatchesScenario(explanation, question?.scenario);
                        const displayExplanation = (explanation && explanationOk) ? explanation : (() => {
                            if (!moveClassification) return null;
                            if (moveClassification === 'best') {
                                if (correctFreq >= 95) return `Perfect — ${correctOpt} is a pure play here. The solver always takes this action in this spot.`;
                                if (correctFreq >= 70) return `Excellent — ${correctOpt} at ${correctFreq}% is the dominant action. You identified the highest-EV play.`;
                                return `Great read — ${correctOpt} at ${correctFreq}% is the solver's top choice in a mixed strategy spot. Strong instinct.`;
                            }
                            if (moveClassification === 'correct') {
                                const selFreq = computedFrequencies?.[selectedAnswer] || 0;
                                const freqGap = correctFreq - selFreq;
                                // Explain why the primary action is preferred
                                const selA = selectedAnswer?.toLowerCase() || '';
                                const corA = correctAnswer?.toLowerCase() || '';
                                let mixContext = '';
                                if ((corA.startsWith('b') || corA === 'allin') && (selA === 'c' || selA === 'x')) {
                                    mixContext = ' The solver bets more often here to deny equity and extract value.';
                                } else if ((selA.startsWith('b') || selA === 'allin') && (corA === 'c' || corA === 'x')) {
                                    mixContext = ' The solver checks more to trap and balance the checking range.';
                                } else if (selA === 'call' && (corA.startsWith('r') || corA === 'allin')) {
                                    mixContext = ' The solver raises more to build the pot and apply maximum pressure.';
                                } else if ((selA.startsWith('r') || selA === 'allin') && corA === 'call') {
                                    mixContext = ' The solver flats more to keep villain\'s bluffs in and control the pot.';
                                } else if (selA === 'f' && corA === 'call') {
                                    mixContext = ' The solver calls more to defend at the right frequency against bluffs.';
                                }
                                if (selFreq >= 30) return `Good — ${selectedOpt} at ${selFreq}% is a solid part of the GTO mix.${mixContext || ` The solver also uses ${correctOpt} at ${correctFreq}%.`}`;
                                if (selFreq >= 15) return `Acceptable — ${selectedOpt} at ${selFreq}% is in the solver's strategy, though ${correctOpt} at ${correctFreq}% is higher-frequency.${mixContext}`;
                                if (freqGap > 50) return `Part of the mix — ${selectedOpt} is used ${selFreq}% of the time, but ${correctOpt} at ${correctFreq}% is strongly preferred.${mixContext}`;
                                return `Part of the mix — ${selectedOpt} is used ${selFreq}% of the time.${mixContext || ` ${correctOpt} at ${correctFreq}% is the primary action.`}`;
                            }
                            if (moveClassification === 'inaccuracy') return `${correctOpt} is the solver's primary action${correctFreq > 0 ? ` at ${correctFreq}%` : ''}. ${mistakeFeedback}`;
                            if (moveClassification === 'wrong') return `${mistakeFeedback || `The solver prefers ${correctOpt}${correctFreq > 0 ? ` (${correctFreq}%)` : ''}.`}`;
                            return `${mistakeFeedback || `${correctOpt} is the optimal play here.`}`;
                        })();
                        if (!displayExplanation) return null;
                        return (
                            <div style={{ width: '100%' }}>
                                <div style={{ fontSize: 12, lineHeight: 1.5, color: '#cbd5e1', textAlign: 'center' }}>
                                    {displayExplanation}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6, gap: 8 }}>
                                    <button
                                        onClick={() => setShowWhyDrawer(!showWhyDrawer)}
                                        style={{
                                            padding: '4px 12px', borderRadius: 6,
                                            background: 'rgba(0, 212, 255, 0.08)',
                                            border: '1px solid rgba(0, 212, 255, 0.25)',
                                            color: '#00d4ff', fontSize: 10, fontWeight: 700,
                                            cursor: 'pointer', letterSpacing: 0.5,
                                        }}
                                    >
                                        {showWhyDrawer ? 'Hide Details' : 'Why?'}
                                    </button>
                                    {question?.rawFrequencies && (
                                        <button
                                            onClick={() => setShowRangeGrid(!showRangeGrid)}
                                            style={{
                                                padding: '4px 12px', borderRadius: 6,
                                                background: showRangeGrid ? 'rgba(168, 85, 247, 0.15)' : 'rgba(168, 85, 247, 0.08)',
                                                border: `1px solid rgba(168, 85, 247, ${showRangeGrid ? '0.4' : '0.25'})`,
                                                color: '#a855f7', fontSize: 10, fontWeight: 700,
                                                cursor: 'pointer', letterSpacing: 0.5,
                                            }}
                                        >
                                            {showRangeGrid ? 'Hide Range' : 'Range'}
                                        </button>
                                    )}
                                </div>
                                {/* Phase 33: Range Matrix Viewer */}
                                <AnimatePresence>
                                    {showRangeGrid && question?.rawFrequencies && (
                                        <RangeMatrixViewer
                                            rawFrequencies={question.rawFrequencies}
                                            correctAnswer={correctAnswer}
                                            show={showRangeGrid}
                                            heroHand={question?.heroHand || question?.scenario?.heroHand}
                                        />
                                    )}
                                </AnimatePresence>
                                <AnimatePresence>
                                    {showWhyDrawer && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25 }}
                                            style={{ overflow: 'hidden' }}
                                        >
                                            <div style={{
                                                marginTop: 6, padding: '10px 12px',
                                                background: 'rgba(0, 212, 255, 0.04)',
                                                borderRadius: 8,
                                                border: '1px solid rgba(0, 212, 255, 0.12)',
                                                fontSize: 10, color: '#cbd5e1', lineHeight: 1.6,
                                            }}>
                                                <div style={{ fontWeight: 700, color: '#00d4ff', marginBottom: 6, fontSize: 9, letterSpacing: 1 }}>
                                                    SOLVER ANALYSIS
                                                </div>

                                                {/* Phase 53: Hand category for context */}
                                                {question?.handCategory && (
                                                    <div style={{ marginBottom: 4, fontSize: 10, fontStyle: 'italic', color: '#a78bfa' }}>
                                                        Your hand: {question.handCategory}
                                                    </div>
                                                )}

                                                {/* Optimal action with frequency */}
                                                <div style={{ marginBottom: 4 }}>
                                                    <strong style={{ color: '#22c55e' }}>Optimal:</strong>{' '}
                                                    {correctOpt}
                                                    {correctFreq > 0 && (
                                                        <span style={{ color: '#94a3b8' }}> at {correctFreq}%</span>
                                                    )}
                                                </div>

                                                {/* Your pick with mistake reasoning */}
                                                {selectedAnswer && selectedAnswer !== correctAnswer && (
                                                    <div style={{ marginBottom: 4 }}>
                                                        <strong style={{ color: '#ef4444' }}>Your Pick:</strong>{' '}
                                                        {selectedOpt}
                                                        {selectedFreq > 0 ? (
                                                            <span style={{ color: '#f97316' }}> ({selectedFreq}% — part of the mix but suboptimal)</span>
                                                        ) : (
                                                            <span style={{ color: '#ef4444' }}> (0% — not in the solver's strategy)</span>
                                                        )}
                                                        {evLoss > 0 && (
                                                            <span style={{ color: '#ef4444' }}> — loses {evLoss.toFixed(2)} BB</span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Mistake-specific reasoning */}
                                                {mistakeFeedback && selectedAnswer !== correctAnswer && (
                                                    <div style={{
                                                        marginBottom: 4, padding: '4px 8px',
                                                        background: 'rgba(249, 115, 22, 0.08)',
                                                        borderRadius: 6,
                                                        border: '1px solid rgba(249, 115, 22, 0.15)',
                                                        color: '#fbbf24', fontSize: 10,
                                                    }}>
                                                        {mistakeFeedback}
                                                    </div>
                                                )}

                                                {/* Phase 65: EV loss severity context */}
                                                {evLoss > 0 && selectedAnswer !== correctAnswer && (
                                                    <div style={{
                                                        marginBottom: 4, padding: '5px 8px',
                                                        background: evLoss >= 0.5 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(251, 191, 36, 0.06)',
                                                        borderRadius: 6,
                                                        border: `1px solid ${evLoss >= 0.5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(251, 191, 36, 0.12)'}`,
                                                        fontSize: 9, color: evLoss >= 0.5 ? '#fca5a5' : '#fde68a', lineHeight: 1.5,
                                                    }}>
                                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>EV IMPACT: </span>
                                                        {evLoss >= 1.0
                                                            ? `Losing ${evLoss.toFixed(2)} BB/hand is a critical leak. Over 1000 hands, this costs ~${Math.round(evLoss * 10)} BB in profit. Fix this spot immediately.`
                                                            : evLoss >= 0.5
                                                            ? `Losing ${evLoss.toFixed(2)} BB/hand is significant. Over 1000 hands in similar spots (~5% frequency), this costs ~${Math.round(evLoss * 50)} BB.`
                                                            : evLoss >= 0.2
                                                            ? `Losing ${evLoss.toFixed(2)} BB/hand is a moderate leak. Fixing these marginal spots separates good players from great ones.`
                                                            : evLoss >= 0.05
                                                            ? `Losing ${evLoss.toFixed(2)} BB/hand is a small inaccuracy. This was a close decision — both actions have similar EV.`
                                                            : `A ${evLoss.toFixed(2)} BB loss is negligible — the two actions are nearly identical in EV. Don't stress this one.`
                                                        }
                                                    </div>
                                                )}

                                                {/* Board texture context — Phase 29: uses engine's rich description when available */}
                                                {(boardTexture || question?.scenario?.board) && (
                                                    <div style={{ marginBottom: 4 }}>
                                                        <strong style={{ color: '#94a3b8' }}>Board:</strong>{' '}
                                                        {(() => {
                                                            // Try to extract rich texture from question text (engine generates it)
                                                            const qText = question?.question || '';
                                                            const textureMatch = qText.match(/\(([^)]*(?:Wet|Dry|Semi-wet|monotone|rainbow|two-tone|ace-high|king-high|broadway|low|mid-range)[^)]*)\)/i);
                                                            if (textureMatch) return textureMatch[1];
                                                            // Fallback to basic classifier
                                                            if (boardTexture) return `${boardTexture.suitTexture}${boardTexture.connectTexture ? ` + ${boardTexture.connectTexture}` : ''}`;
                                                            return '';
                                                        })()}.
                                                        {heroPosition && ` Hero ${heroPosition}${question?.scenario?.villainPosition ? ` vs ${question.scenario.villainPosition}` : ''}.`}
                                                    </div>
                                                )}

                                                {/* Strategic insight from the engine explanation */}
                                                {explanation && explanation !== displayExplanation && (
                                                    <div style={{
                                                        marginBottom: 4, padding: '4px 8px',
                                                        background: 'rgba(34, 197, 94, 0.06)',
                                                        borderRadius: 6,
                                                        border: '1px solid rgba(34, 197, 94, 0.12)',
                                                        color: '#86efac', fontSize: 10,
                                                    }}>
                                                        {explanation}
                                                    </div>
                                                )}

                                                {/* Phase 53: Full EV comparison table when available */}
                                                {question?.evData?.actionEVs && Object.keys(question.evData.actionEVs || {}).length > 1 && (
                                                    <div style={{ marginTop: 6, marginBottom: 4 }}>
                                                        <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, marginBottom: 3 }}>EV BY ACTION</div>
                                                        {Object.entries(question.evData.actionEVs || {})
                                                            .sort(([, a], [, b]) => b - a)
                                                            .map(([action, ev]) => {
                                                                const isOptimal = action === correctAnswer;
                                                                const isSelected = action === selectedAnswer;
                                                                const optText = question?.options?.find(o => o.id === action)?.text || action;
                                                                const evNum = typeof ev === 'number' ? ev : 0;
                                                                return (
                                                                    <div key={action} style={{
                                                                        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1,
                                                                        padding: '1px 4px', borderRadius: 3,
                                                                        background: isSelected && !isOptimal ? 'rgba(239,68,68,0.06)' : isOptimal ? 'rgba(34,197,94,0.06)' : 'transparent',
                                                                    }}>
                                                                        <span style={{ width: 10, fontSize: 8, color: isOptimal ? '#22c55e' : isSelected ? '#ef4444' : '#64748b' }}>
                                                                            {isOptimal ? '✓' : isSelected ? '✗' : '·'}
                                                                        </span>
                                                                        <span style={{ flex: 1, fontSize: 9, color: isOptimal ? '#4ade80' : isSelected ? '#fca5a5' : '#94a3b8' }}>
                                                                            {optText}
                                                                        </span>
                                                                        <span style={{
                                                                            fontSize: 9, fontWeight: 700, fontFamily: "'Inter', monospace",
                                                                            color: evNum >= 0 ? '#22c55e' : '#ef4444',
                                                                        }}>
                                                                            {evNum >= 0 ? '+' : ''}{evNum.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })
                                                        }
                                                    </div>
                                                )}

                                                {/* Spot metadata */}
                                                {street && (
                                                    <div style={{ color: '#64748b', fontSize: 9, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        <span>{street.charAt(0).toUpperCase() + street.slice(1)}</span>
                                                        <span>Pot: {pot} BB</span>
                                                        {spr && <span>SPR: {spr}</span>}
                                                        {question?.scenario?.stackDepth && <span>Stack: {question.scenario.stackDepth}bb</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })()}

                    {/* ═══ Phase 251: Structured Explanation Sections ═══ */}
                    {showFeedback && structuredExplanation && (
                        <div style={{ width: '100%', marginTop: 6 }}>
                            {/* Concept tag + Spot difficulty */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 6 }}>
                                {structuredExplanation.concept && (
                                    <span style={{
                                        fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                        background: 'rgba(168, 85, 247, 0.12)',
                                        border: '1px solid rgba(168, 85, 247, 0.25)',
                                        color: '#c084fc', letterSpacing: 0.3,
                                    }}>
                                        {structuredExplanation.concept}
                                    </span>
                                )}
                                {structuredExplanation.spotDifficulty && (
                                    <span style={{
                                        fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                                        background: structuredExplanation.spotDifficulty.difficulty >= 7 ? 'rgba(239,68,68,0.1)' : structuredExplanation.spotDifficulty.difficulty >= 4 ? 'rgba(251,191,36,0.1)' : 'rgba(34,197,94,0.1)',
                                        color: structuredExplanation.spotDifficulty.difficulty >= 7 ? '#fca5a5' : structuredExplanation.spotDifficulty.difficulty >= 4 ? '#fde68a' : '#86efac',
                                        border: '1px solid ' + (structuredExplanation.spotDifficulty.difficulty >= 7 ? 'rgba(239,68,68,0.2)' : structuredExplanation.spotDifficulty.difficulty >= 4 ? 'rgba(251,191,36,0.2)' : 'rgba(34,197,94,0.2)'),
                                    }}>
                                        {structuredExplanation.spotDifficulty.label} ({structuredExplanation.spotDifficulty.difficulty}/10)
                                    </span>
                                )}
                            </div>

                            {/* Key takeaway — guarded by TRAIN-FEEDBACK-SYNC-1 */}
                            {structuredExplanation.takeaway && explanationMatchesScenario(structuredExplanation.takeaway, question?.scenario) && (
                                <div style={{
                                    padding: '6px 10px', marginBottom: 6,
                                    background: structuredExplanation.isCorrect ? 'rgba(34, 197, 94, 0.06)' : 'rgba(251, 191, 36, 0.06)',
                                    borderRadius: 8,
                                    border: `1px solid ${structuredExplanation.isCorrect ? 'rgba(34, 197, 94, 0.15)' : 'rgba(251, 191, 36, 0.15)'}`,
                                    fontSize: 10, lineHeight: 1.5,
                                    color: structuredExplanation.isCorrect ? '#86efac' : '#fde68a',
                                }}>
                                    <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, opacity: 0.8 }}>KEY TAKEAWAY: </span>
                                    {structuredExplanation.takeaway}
                                </div>
                            )}

                            {/* Mistake type classification (wrong answers only) */}
                            {structuredExplanation.mistakeType && (
                                <div style={{
                                    padding: '6px 10px', marginBottom: 6,
                                    background: 'rgba(239, 68, 68, 0.05)',
                                    borderRadius: 8,
                                    border: '1px solid rgba(239, 68, 68, 0.12)',
                                    fontSize: 10, lineHeight: 1.5, color: '#fca5a5',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                        <span style={{
                                            fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                                            background: structuredExplanation.mistakeType.severity === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.15)',
                                            color: structuredExplanation.mistakeType.severity === 'high' ? '#ef4444' : '#fbbf24',
                                        }}>
                                            {structuredExplanation.mistakeType.label}
                                        </span>
                                    </div>
                                    <div style={{ color: '#94a3b8' }}>{structuredExplanation.mistakeType.description}</div>
                                </div>
                            )}

                            {/* Pattern detection (recurring mistakes) */}
                            {structuredExplanation.pattern && structuredExplanation.pattern.isRecurring && (
                                <div style={{
                                    padding: '5px 10px', marginBottom: 6,
                                    background: 'rgba(249, 115, 22, 0.06)',
                                    borderRadius: 8,
                                    border: '1px solid rgba(249, 115, 22, 0.15)',
                                    fontSize: 9, lineHeight: 1.5, color: '#fdba74',
                                }}>
                                    <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>PATTERN DETECTED: </span>
                                    {structuredExplanation.pattern.message}
                                </div>
                            )}

                            {/* Actionable fix (wrong answers only) */}
                            {structuredExplanation.fix && (
                                <div style={{
                                    padding: '5px 10px',
                                    background: 'rgba(0, 212, 255, 0.04)',
                                    borderRadius: 8,
                                    border: '1px solid rgba(0, 212, 255, 0.1)',
                                    fontSize: 9, lineHeight: 1.5, color: '#67e8f9',
                                }}>
                                    <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>HOW TO FIX: </span>
                                    {structuredExplanation.fix}
                                </div>
                            )}

                            {/* ═══ PHASE 261-280: Deep coaching insights ═══ */}
                            {(() => {
                                try {
                                    if (!getTeachingPrinciple) return null;
                                    const sc = question?.scenario || {};
                                    const p = getTeachingPrinciple(sc.street || 'flop', sc.nodeType || '', structuredExplanation?.correctAction || question?.correctAnswer || '', question?.handCategory || '', sc.texture || '');
                                    if (!p || !p.principle) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(34,197,94,0.04)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.1)', fontSize: 9, lineHeight: 1.5, color: '#86efac' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: '#4ade80' }}>PRINCIPLE: </span>{p.principle}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {(() => {
                                try {
                                    if (!getPositionReminder) return null;
                                    const sc = question?.scenario || {};
                                    const r = getPositionReminder(sc.heroPosition || sc.position || '', sc.street || 'flop', sc.nodeType || '');
                                    if (!r || !r.tip) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(251,191,36,0.04)', borderRadius: 8, border: '1px solid rgba(251,191,36,0.1)', fontSize: 9, lineHeight: 1.5, color: '#fde68a' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: '#fbbf24' }}>POSITION: </span>{r.tip}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {(() => {
                                try {
                                    if (!getTextureStrategyGuide) return null;
                                    const sc = question?.scenario || {};
                                    if (!sc.texture && !sc.boardTexture) return null;
                                    const g = getTextureStrategyGuide(sc.texture || sc.boardTexture || '', sc.street || 'flop', sc.heroPosition || '', sc.villainPosition || '');
                                    if (!g || !g.strategy) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(168,85,247,0.04)', borderRadius: 8, border: '1px solid rgba(168,85,247,0.1)', fontSize: 9, lineHeight: 1.5, color: '#d8b4fe' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: '#c084fc' }}>TEXTURE: </span>{g.strategy}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {(() => {
                                try {
                                    if (!getSPRStrategyGuide) return null;
                                    const sc = question?.scenario || {};
                                    if (!sc.potSize && !sc.stackDepth) return null;
                                    const spr = getSPRStrategyGuide(sc.potSize || sc.estimatedPot || 0, sc.stackDepth || sc.effectiveStack || 100);
                                    if (!spr || !spr.guidance) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(0,212,255,0.03)', borderRadius: 8, border: '1px solid rgba(0,212,255,0.08)', fontSize: 9, lineHeight: 1.5, color: '#67e8f9' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: '#22d3ee' }}>SPR: </span>{spr.spr && <span style={{ fontFamily: "'Orbitron', monospace", marginRight: 4 }}>{spr.spr.toFixed(1)}</span>}{spr.guidance}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {(() => {
                                try {
                                    if (!getVillainRangeNarration) return null;
                                    const sc = question?.scenario || {};
                                    const n = getVillainRangeNarration(sc.street || 'flop', sc.nodeType || '', sc.villainActions || sc.actionSequence || []);
                                    if (!n || !n.narration) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(239,68,68,0.04)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.1)', fontSize: 9, lineHeight: 1.5, color: '#fca5a5' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: '#ef4444' }}>VILLAIN RANGE: </span>{n.narration}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {(() => {
                                try {
                                    if (!getMultiStreetPlanningGuide) return null;
                                    const sc = question?.scenario || {};
                                    const plan = getMultiStreetPlanningGuide(sc.street || 'flop', question?.handCategory || '', structuredExplanation?.correctAction || question?.correctAnswer || '', sc.potSize || 0, sc.stackDepth || 100);
                                    if (!plan || !plan.plan) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(59,130,246,0.04)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.1)', fontSize: 9, lineHeight: 1.5, color: '#93c5fd' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: '#3b82f6' }}>STREET PLAN: </span>{plan.plan}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {/* Phase 271: Hand Strength Badge */}
                            {(() => {
                                try {
                                    if (!classifyHandStrength) return null;
                                    const sc = question?.scenario || {};
                                    const hs = classifyHandStrength(question?.handCategory || '', sc.boardTexture || sc.texture || '', sc.street || 'flop');
                                    if (!hs) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: `${hs.color}08`, borderRadius: 8, border: `1px solid ${hs.color}22`, fontSize: 9, lineHeight: 1.5, color: hs.color }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>HAND: {hs.icon} {hs.label.toUpperCase()} </span>{hs.description}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {/* Phase 272: Equity vs Range */}
                            {(() => {
                                try {
                                    if (!estimateEquityVsRange) return null;
                                    const sc = question?.scenario || {};
                                    const eq = estimateEquityVsRange(question?.handCategory || '', sc.street || 'flop', sc.nodeType || '', sc.heroPosition || '', sc.villainPosition || '');
                                    if (!eq) return null;
                                    const eqColor = eq.equity >= 60 ? '#4ade80' : eq.equity >= 40 ? '#fbbf24' : '#ef4444';
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: `${eqColor}06`, borderRadius: 8, border: `1px solid ${eqColor}15`, fontSize: 9, lineHeight: 1.5, color: eqColor }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>EQUITY: </span><span style={{ fontFamily: "'Orbitron', monospace" }}>{eq.equity}%</span> — {eq.rangeDescription}
                                    </div>);
                                } catch (_) { return null; }
                            })()}

                            {/* Phase 293: Range Construction Tip */}
                            {(() => {
                                try {
                                    if (!getRangeConstructionDrill) return null;
                                    const sc = question?.scenario || {};
                                    const drill = getRangeConstructionDrill(sc.heroPosition || 'CO', sc.nodeType?.includes('3bet') ? '3bet' : 'open');
                                    if (!drill) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(168,85,247,0.06)', borderRadius: 8, border: '1px solid rgba(168,85,247,0.15)', fontSize: 9, lineHeight: 1.5, color: '#c084fc' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>RANGE TIP: </span>{drill.tip}
                                    </div>);
                                } catch (_) { return null; }
                            })()}

                            {/* Phase 298: Hand Reading Insight */}
                            {(() => {
                                try {
                                    if (!getHandReadingDrill) return null;
                                    const sc = question?.scenario || {};
                                    const drill = getHandReadingDrill(sc.street || 'flop');
                                    if (!drill) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(245,158,11,0.06)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.15)', fontSize: 9, lineHeight: 1.5, color: '#fbbf24' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>HAND READING: </span>{drill.keyPrinciple}
                                    </div>);
                                } catch (_) { return null; }
                            })()}

                            {/* Phase 301: Optimal Line Narration */}
                            {(() => {
                                try {
                                    if (!getOptimalLineNarration || !structuredExplanation?.isCorrect === undefined) return null;
                                    const sc = question?.scenario || {};
                                    const narr = getOptimalLineNarration(structuredExplanation?.primary || '', gtoFrequencies || {}, sc.street || 'flop', sc.nodeType || '', sc.heroPosition || '', question?.handCategory || '');
                                    if (!narr) return null;
                                    // BUG FIX (TRAIN-FEEDBACK-SYNC-1): suppress solver-line narration when it
                                    // references a different board or hand than the active scenario.
                                    if (!explanationMatchesScenario(narr.narration, sc)) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(34,197,94,0.06)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.15)', fontSize: 9, lineHeight: 1.5, color: '#86efac' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: '#4ade80' }}>SOLVER LINE: </span>{narr.narration}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                        </div>
                    )}

                    {/* Range Grid (when raw frequencies available) */}
                    {question?.rawFrequencies && (
                        <div style={{ width: '100%' }}>
                            <div style={{
                                fontSize: 10, color: '#94a3b8', padding: '3px 8px',
                                background: 'rgba(255,255,255,0.03)', borderRadius: 6,
                                textAlign: 'center',
                            }}>
                                <span style={{ fontWeight: 'bold', color: '#64748b' }}>GTO: </span>
                                {options.slice(0, 9).map(o => {
                                    const f = computedFrequencies[o.id] || 0;
                                    if (f <= 0) return null;
                                    return (
                                        <span key={o.id} style={{ marginRight: 6 }}>
                                            {o.text}: <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>{f}%</span>
                                        </span>
                                    );
                                })}
                            </div>
                            {question?.rawFrequencies && (() => {
                                const actions = Object.keys(question.rawFrequencies || {});
                                const gridData = {};
                                const allRanks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
                                for (let r = 0; r < 13; r++) {
                                    for (let c = 0; c < 13; c++) {
                                        let hand;
                                        if (r === c) hand = allRanks[r] + allRanks[c];
                                        else if (r < c) hand = allRanks[r] + allRanks[c] + 's';
                                        else hand = allRanks[c] + allRanks[r] + 'o';
                                        const handFreqs = {};
                                        let hasAny = false;
                                        actions.forEach(action => {
                                            const freq = question.rawFrequencies[action]?.[hand];
                                            if (freq !== undefined && freq > 0) {
                                                handFreqs[action] = Math.round(freq * 1000) / 10;
                                                hasAny = true;
                                            }
                                        });
                                        gridData[hand] = hasAny ? handFreqs : null;
                                    }
                                }
                                const hCards = question?.heroCards || question?.cards;
                                let heroHand = null;
                                if (hCards && hCards.length >= 2) {
                                    const r1 = hCards[0]?.[0]?.toUpperCase();
                                    const r2 = hCards[1]?.[0]?.toUpperCase();
                                    if (r1 && r2) {
                                        const s1 = hCards[0]?.[1];
                                        const s2 = hCards[1]?.[1];
                                        const ranks = 'AKQJT98765432';
                                        const i1 = ranks.indexOf(r1);
                                        const i2 = ranks.indexOf(r2);
                                        if (i1 >= 0 && i2 >= 0) {
                                            if (r1 === r2) heroHand = r1 + r2;
                                            else if (s1 === s2) heroHand = (i1 < i2 ? r1 + r2 : r2 + r1) + 's';
                                            else heroHand = (i1 < i2 ? r1 + r2 : r2 + r1) + 'o';
                                        }
                                    }
                                }
                                return (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        transition={{ duration: 0.3, delay: 0.3 }}
                                        style={{ marginTop: 6 }}
                                    >
                                        <div style={{
                                            fontSize: 9, fontWeight: 700, color: '#64748b',
                                            letterSpacing: 1.2, textTransform: 'uppercase',
                                            marginBottom: 4, textAlign: 'center',
                                        }}>
                                            Range Matrix {heroHand && <span style={{ color: '#00d4ff' }}>• {heroHand}</span>}
                                        </div>
                                        <RangeGrid
                                            gridData={gridData}
                                            actions={actions}
                                            cellSize={20}
                                            heroHand={heroHand}
                                            compact={true}
                                        />
                                    </motion.div>
                                );
                            })()}
                        </div>
                    )}

                    </div>{/* end collapsible feedback body */}

                    {/* ═══ HAND SUMMARY — Shown when multi-street hand completes ═══ */}
                    {handSummary && !isMultiStreetActive && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4 }}
                            style={{
                                marginTop: 6, marginBottom: 6,
                                padding: '8px 12px', borderRadius: 10,
                                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
                                border: '1px solid rgba(139, 92, 246, 0.2)',
                            }}
                        >
                            <div style={{
                                fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                                textTransform: 'uppercase', color: '#a78bfa', marginBottom: 6,
                            }}>
                                Hand Complete — {handSummary.streetsPlayed} Street{handSummary.streetsPlayed > 1 ? 's' : ''} Played
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {(handSummary.evHistory || []).map((ev, idx) => {
                                    const cls = ev.classification;
                                    const clsColors = {
                                        best: '#4ade80', correct: '#22d3ee', inaccuracy: '#fbbf24',
                                        wrong: '#f87171', blunder: '#ef4444',
                                    };
                                    const color = clsColors[cls] || '#94a3b8';
                                    return (
                                        <div key={idx} style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            padding: '3px 8px', borderRadius: 6,
                                            background: `${color}11`, border: `1px solid ${color}33`,
                                        }}>
                                            <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase' }}>
                                                {ev.street}
                                            </span>
                                            <span style={{ fontSize: 9, color: '#94a3b8' }}>•</span>
                                            <span style={{ fontSize: 9, fontWeight: 600, color }}>
                                                {cls?.charAt(0).toUpperCase() + cls?.slice(1)}
                                            </span>
                                            {ev.evLoss > 0 && (
                                                <span style={{ fontSize: 8, color: '#ef4444' }}>
                                                    -{ev.evLoss.toFixed(1)}bb
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {handSummary.totalEVLoss > 0 && (
                                <div style={{
                                    marginTop: 4, fontSize: 10, color: '#94a3b8', textAlign: 'right',
                                }}>
                                    Total EV loss: <span style={{ color: '#ef4444', fontWeight: 700 }}>
                                        -{handSummary.totalEVLoss.toFixed(1)}bb
                                    </span>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Next Hand / Continue Hand buttons — GTOW-style prominent green */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, justifyContent: 'center' }}>
                        {onNextHand ? (
                            <>
                                <motion.button
                                    onClick={onNextHand}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    whileHover={{ scale: 1.04, boxShadow: isMultiStreetActive ? '0 0 16px rgba(251,146,60,0.3)' : '0 0 16px rgba(34,197,94,0.3)' }}
                                    whileTap={{ scale: 0.96 }}
                                    style={{
                                        position: 'relative', overflow: 'hidden',
                                        padding: '12px 32px', borderRadius: 10,
                                        border: isMultiStreetActive
                                            ? '1.5px solid rgba(251, 146, 60, 0.6)'
                                            : '1.5px solid rgba(34, 197, 94, 0.5)',
                                        background: isMultiStreetActive
                                            ? 'linear-gradient(180deg, rgba(251, 146, 60, 0.25) 0%, rgba(251, 146, 60, 0.08) 100%)'
                                            : 'linear-gradient(180deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.06) 100%)',
                                        color: isMultiStreetActive ? '#fb923c' : '#22c55e',
                                        fontSize: 15, fontWeight: 800, cursor: 'pointer',
                                        letterSpacing: 0.8, fontFamily: "'Inter', -apple-system, sans-serif",
                                        boxShadow: isMultiStreetActive
                                            ? '0 0 10px rgba(251,146,60,0.15)'
                                            : '0 0 10px rgba(34,197,94,0.12)',
                                    }}
                                >
                                    {isMultiStreetActive ? 'Continue Hand →' : 'Next Hand →'}
                                    {autoAdvanceCountdown !== null && autoAdvanceTotal && (
                                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginLeft: 8, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                            {Math.max(0, Math.ceil(autoAdvanceCountdown / 1000))}s
                                        </span>
                                    )}
                                    {!autoAdvanceCountdown && (
                                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginLeft: 8, fontWeight: 600 }}>SPACE</span>
                                    )}
                                    {/* Auto-advance progress bar */}
                                    {autoAdvanceCountdown !== null && autoAdvanceTotal && (
                                        <div style={{
                                            position: 'absolute', bottom: 0, left: 0, right: 0,
                                            height: 3, borderRadius: '0 0 10px 10px', overflow: 'hidden',
                                            background: 'rgba(0,0,0,0.3)',
                                        }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${Math.max(0, (autoAdvanceCountdown / autoAdvanceTotal) * 100)}%`,
                                                background: isMultiStreetActive ? '#fb923c' : '#22c55e',
                                                transition: 'width 50ms linear',
                                                borderRadius: '0 0 10px 10px',
                                            }} />
                                        </div>
                                    )}
                                </motion.button>
                                {!isMultiStreetActive && lastQuestionRef.current && (
                                    <motion.button
                                        onClick={() => {
                                            setRetryActive(true);
                                            setSelectedAnswer(null);
                                            if (onNextHand) onNextHand({ retry: true, retryQuestion: lastQuestionRef.current });
                                        }}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.5 }}
                                        whileTap={{ scale: 0.95 }}
                                        style={{
                                            padding: '8px 16px', borderRadius: 8,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: 'rgba(255,255,255,0.03)',
                                            color: '#94a3b8', fontSize: 11, fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Retry
                                    </motion.button>
                                )}
                                {/* PHASE 6: Bookmark Button */}
                                <motion.button
                                    onClick={toggleBookmark}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.6 }}
                                    whileTap={{ scale: 0.95 }}
                                    style={{
                                        padding: '8px 16px', borderRadius: 8,
                                        border: isCurrentBookmarked ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid rgba(255,255,255,0.1)',
                                        background: isCurrentBookmarked ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255,255,255,0.03)',
                                        color: isCurrentBookmarked ? '#fbbf24' : '#94a3b8',
                                        fontSize: 11, fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {isCurrentBookmarked ? '★ Saved' : '☆ Save'}
                                </motion.button>
                            </>
                        ) : (
                            /* PHASE 5: Post-Session Summary Dashboard */
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    gap: 12, padding: '12px 20px',
                                    background: 'rgba(0,0,0,0.3)', borderRadius: 12,
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    width: '100%', maxWidth: 360,
                                }}
                            >
                                <div style={{ fontSize: 14, fontWeight: 800, color: '#00d4ff', letterSpacing: 1 }}>SESSION COMPLETE</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
                                    {[
                                        { label: 'Hands', value: questionNumber || 0, color: '#e2e8f0' },
                                        { label: 'Accuracy', value: `${questionNumber > 0 ? Math.round(((questionNumber - sessionMistakes) / questionNumber) * 100) : 0}%`, color: '#22c55e' },
                                        { label: 'EV Loss', value: `-${(totalSessionEVLoss || 0).toFixed(1)}`, color: totalSessionEVLoss > 3 ? '#ef4444' : '#fbbf24' },
                                        { label: 'Streak', value: streak, color: '#fbbf24' },
                                    ].map((stat, i) => (
                                        <div key={i} style={{
                                            textAlign: 'center', padding: '8px 0',
                                            background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                                        }}>
                                            <div style={{ fontSize: 18, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>{stat.label}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>
                                    {computedDifficulty.label} difficulty • Next hand in 2s...
                                </div>
                                {/* PHASE 6: Review Mistakes Button */}
                                {sessionMistakesListRef.current.length > 0 && (
                                    <motion.button
                                        onClick={() => { setShowMistakeReview(true); setMistakeReviewIndex(0); }}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.3 }}
                                        whileTap={{ scale: 0.96 }}
                                        style={{
                                            padding: '8px 20px', borderRadius: 8,
                                            border: '1px solid rgba(239, 68, 68, 0.4)',
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            color: '#f87171', fontSize: 11, fontWeight: 700,
                                            cursor: 'pointer', letterSpacing: 0.5, marginTop: 4,
                                        }}
                                    >
                                        Review {sessionMistakesListRef.current.length} Mistake{sessionMistakesListRef.current.length > 1 ? 's' : ''}
                                    </motion.button>
                                )}
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            )
            }
        </div >
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#121212',
        fontFamily: "'Inter', -apple-system, sans-serif",
        overflow: 'hidden',
    },

    // ── TOP BAR (replaces old questionBar)
    topBar: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        background: '#1a1a1a',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
    },

    topBarLeft: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },

    topBarRight: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },

    gameTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#e2e8f0',
        fontFamily: "'Inter', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },

    contextString: {
        fontSize: 11,
        color: '#94a3b8',
        fontWeight: '500',
    },

    scoreBadge: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 6,
        border: '1.5px solid #22c55e',
        background: 'rgba(34, 197, 94, 0.08)',
    },

    scoreValue: {
        fontSize: 16,
        fontWeight: 800,
        fontFamily: "'Inter', sans-serif",
        lineHeight: 1,
    },

    scoreLabel: {
        fontSize: 7,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontWeight: '700',
    },

    questionCounter: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontWeight: 'bold',
    },

    // ── QUESTION BAR
    questionBar: {
        padding: '10px 16px',
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },

    inlineCard: {
        width: 24,
        height: 34,
        borderRadius: 3,
        verticalAlign: 'middle',
        marginLeft: 3,
        marginRight: 2,
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    },

    streakBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.25), rgba(251, 146, 60, 0.1))',
        padding: '4px 10px',
        borderRadius: 12,
        border: '1px solid rgba(251, 146, 60, 0.4)',
        flexShrink: 0,
    },

    streakText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#fbbf24',
    },

    // ── TABLE AREA — Phase 17e: Fill ALL available space, overflow hidden
    tableArea: {
        flex: 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: 0,
    },

    // ── RACETRACK TABLE — Phase 18: Tall oval, NO overflow hidden so seats stay visible
    basicTable: {
        position: 'relative',
        width: '90%',
        maxWidth: 420,
        aspectRatio: '1 / 1.45',
        borderRadius: '50% / 25%',
        backgroundColor: '#1E3B22',
        border: '8px solid #1a1a1a',
        boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
        margin: '0 auto',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },

    seatsContainer: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '100%',
        height: '100%',
        zIndex: 2,
        pointerEvents: 'none',
    },

    seat: {
        position: 'absolute',
        // NOTE: Do NOT use CSS transform here — framer-motion's scale animation overrides it.
        // Instead, use framer-motion's x/y style props on the <motion.div> to compose with scale.
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        pointerEvents: 'auto',
        textAlign: 'center',
    },

    // GTO Wizard-style position circle indicator (no avatar images)
    avatar: {
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: '#2a2a32',
        border: '2px solid #4a4a55',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 800,
        color: '#94a3b8',
        letterSpacing: 0.5,
        fontFamily: "'Inter', sans-serif",
    },

    dealerButton: {
        position: 'absolute',
        top: -14,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#2a2a32',
        color: '#e2e8f0',
        fontSize: 9,
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1.5px solid rgba(255,255,255,0.3)',
        zIndex: 10,
    },

    badge: {
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 'bold',
        color: '#94a3b8',
        fontFamily: "'Inter', sans-serif",
        textAlign: 'center',
        whiteSpace: 'nowrap',
        background: '#2a2a32',
        border: '1px solid #4a4a55',
    },

    // F4: Mode Switching Bar styles
    modeBar: {
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'stretch',
        background: '#1a1a1a',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
    },
    modeBarBtn: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: '8px 0',
        border: 'none',
        cursor: 'pointer',
        fontFamily: "'Inter', sans-serif",
        transition: 'all 0.15s ease',
    },
    settingsBtn: {
        padding: '10px 16px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#e2e8f0',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: "'Inter', sans-serif",
    },

    badgeLabel: {
        fontSize: 9,
        fontWeight: 700,
    },

    badgeStack: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#e2e8f0',
    },

    heroRow: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
    },

    heroCardsInline: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 3,
    },

    card: {
        width: 44,
        height: 62,
        borderRadius: 5,
        boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
        border: '1.5px solid rgba(255,255,255,0.3)',
    },

    boardCards: {
        position: 'absolute',
        top: '45%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 5,
        zIndex: 3,
    },

    boardCard: {
        width: 48,
        height: 68,
        borderRadius: 5,
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.15)',
    },

    pot: {
        position: 'absolute',
        top: '20%',
        left: '50%',
        // NOTE: Do NOT use CSS transform here — framer-motion's scale animation overrides it.
        // x/y are set inline on the <motion.div> to compose with scale.
        color: '#e2e8f0',
        fontSize: 16,
        fontWeight: 800,
        fontFamily: "'Inter', sans-serif",
        zIndex: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        background: 'transparent',
        padding: 0,
        border: 'none',
        textAlign: 'center',
        whiteSpace: 'nowrap',
    },

    chipIcon: {
        fontSize: 16,
    },

    // GAP-2: SPR + Pot Odds overlays
    potOverlayRow: {
        display: 'flex',
        justifyContent: 'center',
        gap: 6,
        marginTop: 2,
    },

    potOverlayBadge: {
        fontSize: 9,
        color: '#94a3b8',
        background: 'rgba(255,255,255,0.06)',
        padding: '1px 6px',
        borderRadius: 4,
        fontWeight: '600',
        letterSpacing: 0.5,
    },

    // GAP-5: Progress bar
    progressBarContainer: {
        height: 3,
        background: 'rgba(255,255,255,0.06)',
        width: '100%',
        flexShrink: 0,
    },

    progressBarFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #5ac8c8, #4db8b8)',
        borderRadius: '0 2px 2px 0',
    },

    // GAP-1: Action history strip
    scenarioInfo: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        flex: 1,
        gap: 8,
    },

    scenarioLabel: {
        fontSize: 13,
        color: '#94a3b8',
        // GAP-1: Action history strip — horizontal scrollable chips
    },
    actionHistoryStrip: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        flex: 1,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
    },

    actionHistoryItem: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 4,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
    },

    actionHistoryPos: {
        fontSize: 10,
        fontWeight: 800,
        color: '#5ac8c8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    actionHistoryAction: {
        fontSize: 10,
        color: '#e2e8f0',
        fontWeight: '600',
        textTransform: 'capitalize',
    },

    actionHistorySep: {
        fontSize: 10,
        color: '#4a4a55',
        margin: '0 1px',
    },

    // GAP-6: Effective stack badge
    effStackBadge: {
        fontSize: 10,
        color: '#94a3b8',
        background: 'rgba(255,255,255,0.06)',
        padding: '2px 8px',
        borderRadius: 6,
        fontWeight: '600',
        whiteSpace: 'nowrap',
        flexShrink: 0,
    },

    // GAP-8: Villain card-back images
    villainCardsInline: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },

    villainCard: {
        width: 20,
        height: 28,
        borderRadius: 3,
        opacity: 0.7,
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
    },

    villainActionBubble: {
        position: 'absolute',
        top: '5%',
        right: '8%',
        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
        color: '#fff',
        padding: '5px 12px',
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 'bold',
        zIndex: 10,
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        textAlign: 'center',
        minWidth: 70,
    },

    villainActionHeader: {
        fontSize: 10,
        opacity: 0.85,
        marginBottom: 3,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    villainActionText: {
        fontSize: 14,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },

    speechTail: {
        position: 'absolute',
        bottom: -8,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '10px solid transparent',
        borderRight: '10px solid transparent',
        borderTop: '10px solid #dc2626',
    },

    streetIndicator: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: '#64748b',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 2,
        textTransform: 'uppercase',
        zIndex: 2,
    },

    // ── STATS HUD (compact GTO Wizard style)
    statsHUD: {
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '5px 16px',
        background: '#1a1a1a',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
    },

    statsHUDItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
    },

    statsHUDLabel: {
        fontSize: 11,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: '700',
    },

    statsHUDValue: {
        fontSize: 16,
        fontWeight: 800,
        fontFamily: "'Inter', sans-serif",
    },

    // ── ACTION BAR (GTO Wizard-style — adapts to 2-9 buttons)
    actionBar: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        padding: '10px 12px',
        flexShrink: 0,
    },

    actionButtonWrapper: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
    },

    actionButton: {
        position: 'relative',
        padding: '12px 8px',
        minHeight: 64,
        fontSize: 14,
        fontWeight: 800,
        fontFamily: "'Inter', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        background: '#334155',
        border: 'none',
        borderRadius: 8,
        color: '#ffffff',
        cursor: 'pointer',
        transition: 'all 0.12s ease-out',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        width: '100%',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    },

    actionText: {
        fontSize: 13,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        lineHeight: 1.2,
        textAlign: 'center',
    },

    freqLabel: {
        fontSize: 11,
        opacity: 0.8,
        fontWeight: '600',
    },

    // ── INLINE FEEDBACK (replaces old full-screen overlay)
    feedbackInline: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: 'rgba(5,10,20,0.97)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 8,
        padding: '24px 20px',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        maxWidth: 800,
        marginLeft: 'auto',
        marginRight: 'auto',
    },

    feedbackTopRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        width: '100%',
        flexWrap: 'wrap',
    },

    classificationBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 24px',
        borderRadius: 24,
        border: '2px solid',
        marginBottom: 16,
        fontSize: 18,
        fontWeight: 'bold',
    },

    classificationIcon: {
        fontSize: 22,
        fontWeight: 'bold',
    },

    classificationLabel: {
        fontSize: 18,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    evLossDisplay: {
        display: 'flex',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 14,
        fontSize: 15,
    },

    evLossLabel: {
        color: '#94a3b8',
    },

    evLossValue: {
        color: '#ef4444',
        fontWeight: 'bold',
        fontFamily: "'Inter', 'Courier New', monospace",
    },

    feedbackExplanation: {
        fontSize: 12,
        lineHeight: 1.5,
        color: '#cbd5e1',
        textAlign: 'center',
    },
};

export default memo(UniversalDynamicTable);
