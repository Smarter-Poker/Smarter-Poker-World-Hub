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

// TRAIN-CSS-TOKENS-SHARED-5 — token adoption in UniversalDynamicTable (5496 lines, 366 hex)
import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import RangeGrid from '../RangeGrid';
import {
    MOVE_CLASSIFICATIONS,
    CLASSIFICATION_CONFIG,
    simulateGTOFrequencies,
    classifyMove,
} from '../../../hooks/useGTOWScore';
import { busEmit } from '../../../engine/EventBus';
import ActionButton from '../../poker/ActionButton';
// TRAIN-WIRE-UDT-ACTIONBTN-1 — adoption: UDT action bar uses shared ActionButton
import { groupActions, resolveGroupedAction, getGroupedFrequency, DIFFICULTY_MODES } from '../../../utils/actionGrouper';
import { toEngineDifficulty } from '../../../engines/DifficultyEngine';
import { formatSignedScore } from '../../../engines/GTOScoreEngine';
import { buildRangeGridData, rangeGridActions, handNotationFromCards } from '../rangeGridData';
import { aggregateByHandClass, buildClassificationData } from '../../../lib/training/handClassStrategy';
import { committedFor, computeDisplayPot } from './potMath';
import { dealSeatAvatars, HERO_DEFAULT_AVATAR } from '../../../lib/tableAvatars';

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
        } catch (e) { console.warn('[App] Handled exception:', (e && e.message) || e); }
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
    'c': 'var(--sp-accent-blue)', 'x': 'var(--sp-accent-blue)', 'check': 'var(--sp-accent-blue)',
    'call': 'var(--sp-accent-green)',
    'f': 'var(--sp-fg-faint)', 'fold': 'var(--sp-fg-faint)',
    'allin': 'var(--sp-accent-red)',
    'b16': 'var(--sp-accent-emerald)', 'b20': 'var(--sp-accent-emerald)', 'b25': 'var(--sp-accent-emerald)', 'b33': 'var(--sp-accent-emerald)',
    'b40': 'var(--sp-accent-cyan)', 'b45': 'var(--sp-accent-cyan)', 'b50': 'var(--sp-accent-cyan)', 'b55': 'var(--sp-accent-cyan)',
    'b60': 'var(--sp-accent-blue)', 'b66': 'var(--sp-accent-blue)', 'b75': 'var(--sp-accent-blue)', 'b80': 'var(--sp-accent-blue)',
    'b100': 'var(--sp-accent-red)',
    'b125': 'var(--sp-accent-orange)', 'b150': 'var(--sp-accent-amber)', 'b200': 'var(--sp-accent-amber)', 'b300': 'var(--sp-accent-amber)',
    'r50': 'var(--sp-accent-purple)', 'r75': 'var(--sp-accent-purple)', 'r100': 'var(--sp-accent-purple)', 'r200': 'var(--sp-accent-purple)', 'r300': 'var(--sp-accent-purple)',
    'r': 'var(--sp-accent-purple)', 'b': 'var(--sp-accent-red)',
};

function getRangeActionColor(action) {
    if (!action) return 'var(--sp-bg-elev2)';
    const a = action.toLowerCase();
    if (RANGE_ACTION_COLORS[a]) return RANGE_ACTION_COLORS[a];
    if (a.startsWith('b')) {
        const m = a.match(/^b(\d+)$/);
        if (m) { const p = parseInt(m[1]); return p <= 33 ? 'var(--sp-accent-emerald)' : p <= 66 ? 'var(--sp-accent-blue)' : p <= 100 ? 'var(--sp-accent-red)' : 'var(--sp-accent-amber)'; }
        return 'var(--sp-accent-red)';
    }
    if (a.startsWith('r')) return 'var(--sp-accent-purple)';
    return 'var(--sp-fg-faint)';
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
            <div style={{ fontSize: 9, color: 'var(--sp-fg-muted)', marginBottom: 4, textAlign: 'center', fontWeight: 'bold', letterSpacing: 1 }}>
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
                        <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 7, color: 'var(--sp-fg-muted)' }}>
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

/**
 * GTOW parity #20 — turn a raw solver action id into something a human can
 * read. Padded action buttons used to be labelled with the id itself, so a
 * player saw "b33" where GTO Wizard shows "Bet 33%".
 *
 * Falls back to parsing the id shape (b<N> / r<N>) so sizings the lookup table
 * doesn't enumerate still render as a percentage rather than a token.
 */
function formatSolverActionLabel(actionId) {
    const id = String(actionId || '').toLowerCase();
    if (!id) return '';
    if (ACTION_LABELS_SHORT[id]) return ACTION_LABELS_SHORT[id];
    const bet = id.match(/^b(\d+)$/);
    if (bet) return `Bet ${bet[1]}%`;
    const raise = id.match(/^r(\d+)$/);
    if (raise) return `Raise ${raise[1]}%`;
    if (id === 'check') return 'Check';
    if (id === 'fold') return 'Fold';
    if (id === 'push' || id === 'p') return 'All-In';
    return id.charAt(0).toUpperCase() + id.slice(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// F11: STREAK TOAST COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

// NOTE: mount/unmount is controlled by the call site inside <AnimatePresence>
// so the exit animation can run — do not early-return null in here.
function StreakToast({ message }) {
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

// Entry 0 is ALWAYS hero and the rest run clockwise from him. This ordering is
// the hero-relative coordinate space that DEALER_BUTTON_SEAT_KEYS,
// DEALER_BUTTON_POSITIONS and CHIP_STACK_POSITIONS are keyed in; absolute
// `seats` indices must be rotated into it before they touch those tables.
//
// 2026-07-27: the mid rows were pulled clear of the board's horizontal band.
// The felt is a 1:1.45 PORTRAIT oval, so a five-card board is nearly as wide as
// the felt is at its waist -- seats parked at 30% / 58% had their nameplates and
// cards running straight through the community cards. Rows moved outward along
// the oval, not sideways, so each seat keeps its relationship to its own dealer
// button and chip slot (both of which sit between the seat and the pot).
const SEAT_CONFIGS = {
    // 9-Max positions — SPREAD WIDE to prevent overlap
    // Seats hug the outer edge of the felt oval
    9: [
        { id: 0, name: 'BTN', x: 50, y: 84 },   // Hero: Center bottom
        { id: 1, name: 'SB', x: 24, y: 76 },    // Bottom-left
        { id: 2, name: 'BB', x: 16, y: 59 },    // Mid-left
        { id: 3, name: 'UTG', x: 21, y: 21 },   // Upper-mid-left
        { id: 4, name: 'UTG+1', x: 38, y: 15 }, // Top-left
        { id: 5, name: 'MP', x: 62, y: 15 },    // Top-right
        { id: 6, name: 'MP+1', x: 79, y: 21 },  // Upper-mid-right
        { id: 7, name: 'HJ', x: 84, y: 59 },    // Mid-right
        { id: 8, name: 'CO', x: 76, y: 76 },    // Bottom-right
    ],
    // 6-Max positions — evenly spaced around the oval, clear of the board band
    6: [
        { id: 0, name: 'BTN', x: 50, y: 84 },   // Hero: Center bottom
        { id: 1, name: 'SB', x: 21, y: 62 },    // Mid-left
        { id: 2, name: 'BB', x: 24, y: 21 },    // Upper-left
        { id: 3, name: 'UTG', x: 50, y: 15 },   // Top center
        { id: 4, name: 'HJ', x: 76, y: 21 },    // Upper-right
        { id: 5, name: 'CO', x: 79, y: 62 },    // Mid-right
    ],
    // 3-Max (Spins) — Spread
    3: [
        { id: 0, name: 'BTN', x: 50, y: 84 },   // Hero: Center bottom
        { id: 1, name: 'SB', x: 28, y: 21 },    // Top-left
        { id: 2, name: 'BB', x: 72, y: 21 },    // Top-right
    ],
    // Heads-Up
    2: [
        { id: 0, name: 'BTN/SB', x: 50, y: 78 }, // Hero: Center bottom
        { id: 1, name: 'BB', x: 50, y: 22 },     // Villain: Top center
    ],
};

// ═══════════════════════════════════════════════════════════════════════════
// DEALER BUTTON POSITIONS — canonical percentages from
// DEALER_BUTTON_AND_CHIP_POSITIONS_LAW.md (hero + v1..v8 clockwise from hero)
// ═══════════════════════════════════════════════════════════════════════════
const DEALER_BUTTON_POSITIONS = {
    hero: { left: 50.49, top: 75.74 },
    v1: { left: 28.73, top: 71.38 },
    v2: { left: 27.26, top: 55.15 },
    v3: { left: 27.85, top: 31.73 },
    v4: { left: 35.05, top: 15.28 },
    v5: { left: 62.55, top: 14.74 },
    v6: { left: 73.14, top: 31.95 },
    v7: { left: 72.70, top: 54.06 },
    v8: { left: 71.96, top: 71.60 },
};

// Map SEAT_CONFIGS index → law position key per table size (approximate:
// the law's v1..v8 run clockwise from hero, nearest match to each seat's x/y)
// Chip stack coordinates, same law, same table-area percentage basis.
// CHIP_STACK_LAW.md: "Chip positions are always calculated as
// button_position + offset" -- these are the user-verified resolved values.
const CHIP_STACK_POSITIONS = {
    hero: { left: 47.70, top: 71.82 },
    v1: { left: 31.67, top: 69.75 },
    v2: { left: 29.61, top: 54.61 },
    v3: { left: 30.79, top: 31.19 },
    v4: { left: 33.29, top: 18.01 },
    v5: { left: 58.29, top: 17.57 },
    v6: { left: 64.61, top: 31.52 },
    v7: { left: 64.32, top: 53.63 },
    v8: { left: 64.17, top: 69.10 },
};

// Height of the strip reserved under the felt on a phone for the countdown and
// the question pill. Every pixel here comes straight off the felt, so it is
// exactly the compact 42px countdown plate plus a hairline.
const CORNER_RAIL_BAND = 44;

const DEALER_BUTTON_SEAT_KEYS = {
    9: ['hero', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'],
    6: ['hero', 'v2', 'v3', 'v4', 'v6', 'v7'],
    3: ['hero', 'v3', 'v6'],
    2: ['hero', 'v4'],
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

// ═══════════════════════════════════════════════════════════════════════════
// SEAT PORTRAITS — moved to src/lib/tableAvatars.js
// ═══════════════════════════════════════════════════════════════════════════
// VILLAIN_AVATAR_POOL, HERO_DEFAULT_AVATAR, hashHandKey, seededRandom and
// dealSeatAvatars used to live here as a component-local block. They are now
// shared with TrainingGameTable.jsx and LivePokerTable.jsx out of
// src/lib/tableAvatars.js (imported above) so all three felts draw seat
// portraits from the same catalogue with the same determinism/distinctness
// guarantees. scripts/avatar-library-check.js lifts the real source of that
// module, not a paraphrase of it.

// Seat portrait. Takes an avatar image URL and degrades to a monogram disc when
// the asset is missing or fails to decode, so a bad path can never leave a
// blank hole on the felt where a character should be. Module-level because it
// owns state and the seats are rendered inside a .map().
function SeatAvatar({ src, label, fontSize }) {
    const [failed, setFailed] = React.useState(false);
    React.useEffect(() => { setFailed(false); }, [src]);
    if (!src || failed) {
        const monogram = ((label || '').trim().charAt(0) || '?').toUpperCase();
        return (
            <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'radial-gradient(circle at 50% 26%, #2a2a2e 0%, #141416 66%, #08080a 100%)',
                color: 'rgba(255,214,122,0.92)',
                fontSize,
                fontWeight: 900,
                letterSpacing: 0.5,
                userSelect: 'none',
            }}>
                {monogram}
            </div>
        );
    }
    return (
        <img
            src={src}
            alt={label || 'Player'}
            onError={() => setFailed(true)}
            style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: '50% 20%',
                display: 'block',
            }}
        />
    );
}

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
    if (hasFlush) return { label: 'Flush', color: 'var(--sp-accent-green)', tier: 'strong' };
    if (isOverpair) return { label: 'Overpair', color: 'var(--sp-accent-green)', tier: 'strong' };
    if (isTopPair) return { label: 'Top Pair', color: 'var(--sp-accent-green)', tier: 'strong' };
    if (pairWithBoard.length > 0) return { label: 'Pair', color: 'var(--sp-accent-amber)', tier: 'medium' };
    if (hasFlushDraw) return { label: 'Flush Draw', color: 'var(--sp-accent-blue)', tier: 'draw' };
    if (hasPocketPair) return { label: 'Pocket Pair', color: 'var(--sp-accent-amber)', tier: 'medium' };
    if (heroHigh <= 4) return { label: 'High Card', color: 'var(--sp-fg-muted)', tier: 'weak' };
    return { label: 'Air', color: 'var(--sp-accent-red)', tier: 'weak' };
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
            'MP': 5, 'MIDDLE': 5, 'UTG+2': 5,
            'MP+1': 6, 'LJ': 6, 'LOJACK': 6,
            'HJ': 7, 'HIJACK': 7,
            'CO': 8, 'CUTOFF': 8,
        },
        6: {
            'BTN': 0, 'BUTTON': 0,
            'SB': 1, 'SMALL BLIND': 1,
            'BB': 2, 'BIG BLIND': 2,
            'UTG': 3, 'LJ': 3, 'LOJACK': 3,
            'HJ': 4, 'HIJACK': 4, 'MP': 4, 'MIDDLE': 4,
            'CO': 5, 'CUTOFF': 5,
        },
        3: {
            'BTN': 0, 'BUTTON': 0, 'BTN/SB': 0,
            'SB': 1, 'SMALL BLIND': 1,
            'BB': 2, 'BIG BLIND': 2,
        },
        2: {
            'BTN': 0, 'BUTTON': 0, 'BTN/SB': 0,
            'SB': 0, 'SMALL BLIND': 0,
            'BB': 1, 'BIG BLIND': 1,
        }
    };

    const map = positionMaps[playerCount] || positionMaps[6];
    return map[normalized] ?? 0;
}

/**
 * Seat index for ANY position name, or null when the ring has no seat for it.
 *
 * getHeroSeatIndex's `?? 0` fallback is right for hero -- hero must sit
 * somewhere, and bottom-centre is the least-wrong somewhere -- and wrong for
 * everyone else: mapping an unknown villain onto the BTN seat is how a
 * mislabeled position ends up drawn on top of the button. Villain and
 * action-history matching need the honest answer instead.
 *
 * Why matching needs this at all: the seat filter and villainFolded compare
 * `a.position === seat.name` as raw strings, but the position maps above are
 * ALIAS tables -- on the 6-max ring, MP and HJ are the same seat 4 and the
 * ring has no seat literally named 'MP'. String matching therefore dropped
 * every MP entry on every 6-max game: the #18 derived history marks MP folded,
 * the plate never draws, and the player counts three folds in the question
 * text but sees two on the felt. Matching by RESOLVED INDEX makes the ring's
 * own alias table the single authority on which name lands on which seat.
 */
function positionSeatIndex(position, playerCount) {
    if (!position) return null;
    const normalized = String(position).toUpperCase().trim();
    const maps = {
        9: {
            'BTN': 0, 'BUTTON': 0, 'SB': 1, 'SMALL BLIND': 1, 'BB': 2, 'BIG BLIND': 2,
            'UTG': 3, 'UTG+1': 4, 'MP': 5, 'MIDDLE': 5, 'UTG+2': 5,
            'MP+1': 6, 'LJ': 6, 'LOJACK': 6, 'HJ': 7, 'HIJACK': 7, 'CO': 8, 'CUTOFF': 8,
        },
        6: {
            'BTN': 0, 'BUTTON': 0, 'SB': 1, 'SMALL BLIND': 1, 'BB': 2, 'BIG BLIND': 2,
            'UTG': 3, 'LJ': 3, 'LOJACK': 3, 'HJ': 4, 'HIJACK': 4, 'MP': 4, 'MIDDLE': 4,
            'CO': 5, 'CUTOFF': 5,
        },
        3: { 'BTN': 0, 'BUTTON': 0, 'BTN/SB': 0, 'SB': 1, 'SMALL BLIND': 1, 'BB': 2, 'BIG BLIND': 2 },
        2: { 'BTN': 0, 'BUTTON': 0, 'BTN/SB': 0, 'SB': 0, 'SMALL BLIND': 0, 'BB': 1, 'BIG BLIND': 1 },
    };
    const map = maps[playerCount] || maps[6];
    const idx = map[normalized];
    return idx === undefined ? null : idx;
}

// ═══════════════════════════════════════════════════════════════════════════
// COUNTDOWN TIMER — GTO Wizard-style time pressure ring
// ═══════════════════════════════════════════════════════════════════════════

function CountdownTimer({ seconds = 60, questionNumber, showFeedback, active = true, onTimeExpired = null, variant = 'ring', compact = false, resetKey = null }) {
    const [timeLeft, setTimeLeft] = React.useState(seconds);
    const expiredRef = React.useRef(false);
    // Urgency pulse honours the OS "reduce motion" setting -- the old CSS
    // `animation: pulse` blinked regardless of it.
    const reduceMotion = useReducedMotion();
    const radius = 18;
    const circumference = 2 * Math.PI * radius;

    // Reset the clock on every new DECISION, not every new question.
    //
    // A multi-street hand is one question that asks three times: flop, then
    // turn, then river. `questionNumber` advances once per HAND (see the
    // "questionNumber only advances once per hand" note in useGTOTrainer), so
    // keying the reset on it alone meant the turn and river decisions inherited
    // whatever the flop left behind. Measured on production: the plate ticked
    // 7..1 on the flop, expired, and then sat frozen at 0 for every later street
    // of that hand -- no clock, no time pressure, no auto-fold. `resetKey`
    // carries the street (and the question identity) so each decision starts
    // fresh. Falls back to questionNumber when the caller passes nothing.
    const decisionKey = resetKey != null ? resetKey : questionNumber;
    React.useEffect(() => {
        setTimeLeft(seconds);
        expiredRef.current = false;
    }, [decisionKey, seconds]);

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

    // A clock at 0 is not a clock. Once it has run out the decision is over --
    // expiry auto-submits -- and the only thing a lingering 0 can do is claim
    // the player is on the clock for a decision that has already been graded.
    // Measured on production: after the flop's feedback closed, the felt sat
    // for fifteen seconds showing the previous decision with a dead 0 on the
    // plate while the next street loaded. Show nothing until the clock re-arms.
    if (timeLeft <= 0) return null;

    const progress = timeLeft / seconds;
    const dashOffset = circumference * (1 - progress);
    const color = timeLeft > 30 ? 'var(--sp-accent-green)' : timeLeft > 10 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)';
    // Under 5s the plate turns urgent: a framer-motion scale pulse, suppressed
    // when the OS asks for reduced motion (the static red ring below still
    // carries the urgency for those users).
    const urgent = timeLeft <= 5;
    const pulseAnim = urgent && !reduceMotion
        ? { opacity: 1, scale: [1, 1.08, 1] }
        : { opacity: 1, scale: 1 };
    const pulseTransition = urgent && !reduceMotion
        ? { duration: 0.55, repeat: Infinity, ease: 'easeInOut' }
        : { duration: 0.2 };

    // PLATE — the template's clock: a large red number in a dark rounded
    // square outside the oval at the lower left. Nothing else on the felt is
    // red, so the number reads as "you are on the clock" at a glance.
    if (variant === 'plate') {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={pulseAnim}
                transition={pulseTransition}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: compact ? 42 : 62,
                    height: compact ? 42 : 62,
                    borderRadius: compact ? 10 : 14,
                    background: 'linear-gradient(180deg, rgba(24,24,28,0.96) 0%, rgba(10,10,13,0.98) 100%)',
                    border: urgent ? '1px solid rgba(239,68,68,0.55)' : '1px solid rgba(255,255,255,0.10)',
                    boxShadow: urgent
                        ? '0 8px 22px rgba(0,0,0,0.65), 0 0 18px rgba(239,68,68,0.35)'
                        : '0 8px 22px rgba(0,0,0,0.65)',
                }}
            >
                <span style={{
                    fontSize: compact ? 21 : 30,
                    fontWeight: 900,
                    lineHeight: 1,
                    color: 'var(--sp-accent-red)',
                    fontFamily: "'Inter', monospace",
                    fontVariantNumeric: 'tabular-nums',
                    textShadow: '0 0 14px rgba(239,68,68,0.55)',
                }}>
                    {timeLeft}
                </span>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={pulseAnim}
            transition={pulseTransition}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
// AUTO-ADVANCE INDICATOR — leaf owner of the 50ms countdown tick
// ═══════════════════════════════════════════════════════════════════════════
// PERF: the remaining-ms state used to live at the top of
// UniversalDynamicTable and was decremented every 50ms, so during every
// auto-advance window the ENTIRE table tree re-rendered at 20Hz for the sake
// of a 9px seconds label and a 3px progress bar inside the Next Hand button.
// The tick now lives here: the parent stores only `autoAdvanceTotal` (set
// once per feedback window) and the actual advance timeout; this leaf owns
// the interval and is the only thing that re-renders per tick. Rendering is
// byte-identical to the inline version, including the final-tick moment
// where the 0s label and the SPACE hint briefly coexist.
function AutoAdvanceIndicator({ total, isMultiStreetActive }) {
    const [remaining, setRemaining] = React.useState(total ?? null);
    React.useEffect(() => {
        setRemaining(total ?? null);
        if (total === null || total === undefined) return;
        // Tick the countdown every 50ms for smooth visual
        const tickInterval = setInterval(() => {
            setRemaining(prev => {
                if (prev === null || prev <= 0) return 0;
                return prev - 50;
            });
        }, 50);
        return () => clearInterval(tickInterval);
    }, [total]);
    return (
        <>
            {remaining !== null && total && (
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginLeft: 8, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {Math.max(0, Math.ceil(remaining / 1000))}s
                </span>
            )}
            {!remaining && (
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginLeft: 8, fontWeight: 600 }}>SPACE</span>
            )}
            {/* Auto-advance progress bar */}
            {remaining !== null && total && (
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: 3, borderRadius: '0 0 10px 10px', overflow: 'hidden',
                    background: 'rgba(0,0,0,0.3)',
                }}>
                    <div style={{
                        height: '100%',
                        width: `${Math.max(0, (remaining / total) * 100)}%`,
                        background: isMultiStreetActive ? 'var(--sp-accent-orange)' : 'var(--sp-accent-green)',
                        transition: 'width 50ms linear',
                        borderRadius: '0 0 10px 10px',
                    }} />
                </div>
            )}
        </>
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
    fold: { bg: 'var(--sp-fg-faint)', border: 'var(--sp-bg-elev2)', text: 'var(--sp-fg)', accent: 'var(--sp-fg-faint)' },
    check: { bg: 'var(--sp-accent-emerald)', border: 'var(--sp-accent-emerald)', text: '#f0fdf4', accent: 'var(--sp-accent-emerald)' },
    call: { bg: 'var(--sp-accent-blue)', border: 'var(--sp-accent-blue)', text: '#eff6ff', accent: 'var(--sp-accent-blue)' },
    betsmall: { bg: 'var(--sp-accent-red)', border: 'var(--sp-accent-red)', text: 'var(--sp-fg)', accent: 'var(--sp-accent-red)' },
    betlarge: { bg: 'var(--sp-accent-red)', border: 'var(--sp-accent-red)', text: 'var(--sp-fg)', accent: 'var(--sp-accent-red)' },
    betpot: { bg: 'var(--sp-accent-red)', border: 'var(--sp-accent-red)', text: 'var(--sp-fg)', accent: 'var(--sp-accent-red)' },
    raise: { bg: 'var(--sp-accent-red)', border: 'var(--sp-accent-red)', text: 'var(--sp-fg)', accent: 'var(--sp-accent-red)' },
    overbet: { bg: 'var(--sp-accent-red)', border: 'var(--sp-accent-red)', text: 'var(--sp-accent-red)', accent: 'var(--sp-accent-red)' },
    allin: { bg: '#450a0a', border: 'var(--sp-accent-red)', text: 'var(--sp-accent-red)', accent: '#991b1c' },
    neutral: { bg: 'var(--sp-fg-faint)', border: 'var(--sp-bg-elev2)', text: 'var(--sp-fg)', accent: 'var(--sp-fg-faint)' },
};

// ═══════════════════════════════════════════════════════════════════════════
// LOADING SKELETON — Shown while question is being fetched
// ═══════════════════════════════════════════════════════════════════════════

function LoadingSkeleton() {
    return (
        <div style={loadingStyles.container}>
            {/* The pulse keyframes normally live in the main component's style
                block, which is NOT rendered while loading — define them here
                so the skeleton shimmer actually animates. */}
            <style>{`@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
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
        color: 'var(--sp-accent-cyan)',
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

// NOTE: rendered conditionally by the call site inside <AnimatePresence> —
// the show/null decision lives there so the exit animation can run.
// GTOW reports EV loss in TWO units: big blinds AND percent of pot, so that
// losses are comparable across pot sizes. We computed the pot percentage in
// the engine (evLossPctPot) and then displayed neither it nor anything else
// derived from it. `pot` is threaded in so the banner can show both.
function ClassificationFlashBanner({ classification, evLoss, pot = 0 }) {
    const config = CLASSIFICATION_CONFIG[classification];
    if (!config) return null;

    // GTO Wizard uses large, bold, centered classification banners
    const isBestOrCorrect = classification === 'best' || classification === 'correct';

    return (
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
                    {config.mark ? `${config.mark} ${config.label}` : config.label}
                </span>
                {evLoss > 0 && (
                    <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--sp-accent-red)',
                        background: 'rgba(0,0,0,0.4)',
                        padding: '3px 10px',
                        borderRadius: 6,
                        fontFamily: "'Inter', monospace",
                    }}>
                        -{evLoss.toFixed(2)} bb
                        {pot > 0 && (
                            <span style={{ opacity: 0.75, marginLeft: 6 }}>
                                ({((evLoss / pot) * 100).toFixed(1)}% pot)
                            </span>
                        )}
                    </span>
                )}
                {evLoss > 0 && (
                    <span style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: evLoss >= 0.5 ? 'var(--sp-accent-red)' : evLoss >= 0.2 ? 'var(--sp-accent-amber)' : 'var(--sp-fg-muted)',
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
                        color: 'var(--sp-accent-green)',
                        background: 'rgba(34,197,94,0.08)',
                        padding: '2px 8px',
                        borderRadius: 6,
                    }}>
                        0.00 EV
                    </span>
                )}
            </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// EV LOSS TICKER — Running session EV loss counter
// ═══════════════════════════════════════════════════════════════════════════

function EVLossTicker({ totalEVLoss, show }) {
    if (!show) return null;

    const evColor = totalEVLoss <= 0 ? 'var(--sp-accent-green)' : totalEVLoss < 5 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)';

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
// INFO PANEL SHELL — dockable / pop-out chrome (GTOW parity #37)
// ═══════════════════════════════════════════════════════════════════════════
// The Range and Strategy panels open UNDER the action bar, which pushes the
// felt up and, on a laptop, off the top of the window. So studying the range
// meant losing sight of the hand the range is about — the exact thing the
// panel exists to help you reason over. GTO Wizard solves this by letting the
// info panel detach into a floating window that hovers beside the table while
// you keep acting.
//
// This shell is the whole mechanism: it renders its children either inline
// (the previous behaviour, unchanged) or inside a draggable fixed-position
// card. Both branches keep the same `key`, so AnimatePresence sees one element
// changing shape rather than one unmounting and another mounting, and the
// panel's own scroll position and internal state survive the toggle.
//
// Deliberately NOT a real browser window (window.open). A popup would be
// blocked by default on most browsers, would lose every style in this file,
// could not read React state without a portal bridge, and would be
// unreachable on mobile. A dragged in-page card gives the same "keep it
// beside the table" affordance with none of that.
function InfoPanelShell({
    panelKey,
    title,
    poppedOut,
    canPop,
    onTogglePop,
    padding = '8px 12px',
    children,
}) {
    // The pop / dock control. Rendered in both branches so the panel can always
    // be put back where it came from.
    const chrome = (
        <button
            type="button"
            onClick={onTogglePop}
            aria-pressed={poppedOut}
            aria-label={poppedOut ? `Dock ${title} panel` : `Pop out ${title} panel`}
            title={poppedOut
                ? 'Dock this panel back under the table'
                : 'Pop this panel out into a floating window you can drag beside the table'}
            style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4,
                color: 'var(--sp-fg-dim)',
                cursor: 'pointer',
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: 1,
                padding: '2px 6px',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                flexShrink: 0,
            }}
        >
            {poppedOut ? 'Dock' : 'Pop out'}
        </button>
    );

    if (poppedOut) {
        return (
            <motion.div
                key={panelKey}
                drag
                dragMomentum={false}
                // Keep the card inside the window no matter how far it is
                // thrown. Without this a panel dragged off-screen is
                // unrecoverable without re-docking blind.
                dragConstraints={{ left: -600, right: 600, top: -300, bottom: 400 }}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                style={{
                    position: 'fixed',
                    top: 72,
                    right: 16,
                    zIndex: 4000,
                    width: 320,
                    maxWidth: 'calc(100vw - 32px)',
                    maxHeight: 'calc(100vh - 120px)',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'rgba(10,12,16,0.97)',
                    border: '1px solid rgba(0,212,255,0.28)',
                    borderRadius: 10,
                    boxShadow: '0 18px 48px rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(6px)',
                }}
            >
                {/* Title bar doubles as the drag handle. cursor: move is the
                    only affordance telling a player it can be moved at all. */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '7px 10px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        cursor: 'move',
                        flexShrink: 0,
                    }}
                >
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--sp-accent-cyan)' }}>
                        {title}
                    </span>
                    {chrome}
                </div>
                <div style={{ padding, overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    {children}
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            key={panelKey}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ padding, background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
            {/* The pop-out control is hidden where it would be a trap: on a
                375px screen a floating card covers the felt it is meant to sit
                beside, so the inline panel is the only sensible layout and
                offering to detach it would make the page worse. */}
            {canPop && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                    {chrome}
                </div>
            )}
            {children}
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
    dealingNextStreet = false,      // Waiting on /api/training/next-street
    handSummary = null,             // End-of-hand summary from MultiStreetHandManager
    // Quit/Back
    onExit = null,                  // Called when user clicks Quit
    // Enhancement: Adaptive difficulty
    difficultyLevel = 0,            // 0-10 difficulty level for display
    // Player identity
    heroName = null,                 // Player's display name or poker alias
    heroAvatarUrl = null,            // Player's chosen avatar image URL (wins over the cached one)
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
    // Synchronous double-grade latch. `selectedAnswer` alone cannot guard the
    // submit path: state reads are per-render, and the timer's expiry callback
    // fires out of setTimeout(0) with the PREVIOUS render's nulls -- so an
    // answer clicked in the same tick the clock hit 0 was graded twice (the
    // old double-answer window). A ref is read at call time, not render time.
    const answerSubmittedRef = React.useRef(false);
    // Which auto-action the expired clock took ('fold' | 'check'), or 'none'
    // when the option list offered neither. Drives the TIME banner so a
    // timeout is never graded silently as if the player chose the action.
    const [timeExpired, setTimeExpired] = React.useState(null);
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

    // HERO'S OWN FACE. The account's chosen avatar wins; the header caches it
    // under the same localStorage key AvatarContext seeds itself from, so the
    // felt and the top bar agree on the very first frame with no round-trip.
    // Falls back to the template's fox. Villains never draw this portrait --
    // dealSeatAvatars filters it out of their pool.
    const heroAvatar = useMemo(() => {
        if (heroAvatarUrl) return heroAvatarUrl;
        try {
            if (typeof window === 'undefined') return HERO_DEFAULT_AVATAR;
            const raw = localStorage.getItem('sp-cached-header-user');
            if (raw) {
                const data = JSON.parse(raw);
                const fresh = !data?._ts || (Date.now() - data._ts) <= 24 * 60 * 60 * 1000;
                if (fresh && data?.avatar) return data.avatar;
            }
        } catch { /* silent fallback */ }
        return HERO_DEFAULT_AVATAR;
    }, [heroAvatarUrl]);

    // Phase 3: RNG Mode state
    const [rngMode, setRngMode] = React.useState(false);
    const [rngRoll, setRngRoll] = React.useState(null);
    // GTOW parity #38 — the reference product's randomiser is not just a number
    // on screen: it has a High/Low mode that decides which END of the 1-100
    // range the FIRST action occupies, and it colours itself to say which mode
    // is live (blue = Low, yellow = High). Without the mode the dice is a
    // single fixed mapping, which is exactly what a randomiser must not be —
    // a player who learns "low numbers mean check" has learned the tool, not
    // the strategy. 'low' keeps the historical mapping so nothing shifts under
    // anyone mid-session.
    const [rngHighLow, setRngHighLow] = React.useState('low');

    // Phase 3: Retry Hand state
    const lastQuestionRef = useRef(null);
    const [retryActive, setRetryActive] = React.useState(false);

    // BUG FIX (TRAIN-FEEDBACK-SNAPSHOT-1): Render feedback against the question
    // that was actually answered, not the live `question` prop. Without this,
    // when the parent (Director.tsx / GameSession.tsx) eagerly preloads the
    // NEXT question while feedback is still on screen, the feedback render
    // path can pick up the new scenario and the narrative desyncs from the
    // hand the user actually played (issue #283 root cause).
    //
    // lastQuestionRef already snapshots `question` while !showFeedback, so by
    // the time showFeedback flips true the ref holds the question being
    // viewed. Read through this getter at feedback-render sites; falls back
    // to the live prop when the ref is empty (initial render edge case).
    const getFeedbackQuestion = () => {
        if (showFeedback && lastQuestionRef.current) return lastQuestionRef.current;
        return question;
    };

    // Phase 3: Study Mode (show frequencies before answering)
    const [studyMode, setStudyMode] = React.useState(false);
    const [feedbackCollapsed, setFeedbackCollapsed] = React.useState(false);
    // Deep analysis starts CLOSED every hand: play first, study on request.
    const [deepAnalysisOpen, setDeepAnalysisOpen] = React.useState(false);

    // ═══ MOBILE RESPONSIVE DETECTION ═══
    const [isMobile, setIsMobile] = React.useState(false);
    // GTOW parity #48. `isMobile` breaks at 768px, which is the TABLET break —
    // it is the right threshold for shrinking card and avatar furniture and the
    // wrong one for the top bar, which only actually runs out of room near
    // 480px. Measured on production at 375px: the right-hand cluster was 299px
    // wide starting at x=147, so it ran 71px past the viewport (hero avatar and
    // the SIMPLE/FULL toggle were both off screen) and the absolutely-centred
    // title landed on top of the RNG and TRAIN chips. `isNarrow` is the phone
    // break, measured against that failure rather than guessed.
    const [isNarrow, setIsNarrow] = React.useState(false);
    // ═══ PHASE 16: VIEWPORT SCALE-LOCK — continuous scaling, never repositioning ═══
    const DESIGN_WIDTH = 420; // fixed design canvas width
    const [scaleFactor, setScaleFactor] = React.useState(1);
    useEffect(() => {
        const check = () => {
            const vw = window.innerWidth;
            setIsMobile(vw < 768);
            setIsNarrow(vw < 480);
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
        pot: isMobile ? { fontSize: 13 } : {},
        actionButton: isMobile ? { padding: '8px 4px', minHeight: 46, fontSize: 12 } : {},
        questionPanel: isMobile ? { margin: '6px 8px 5px', padding: '8px 12px' } : {},
        villainCard: isMobile ? { width: 16, height: 22 } : {},
        boardCards: isMobile ? { gap: 3 } : {},
        seat: isMobile ? { gap: 2 } : {},
    }), [isMobile]);

    // ═══ FELT-FIT SCALE ═══════════════════════════════════════════════════
    // Seat coordinates are percentages of the felt, but seat FURNITURE (avatar,
    // nameplate, hole cards, chips) was sized in fixed pixels. On a short
    // viewport the felt shrinks and the furniture does not, so hero's cards
    // spilled past the bottom of the felt onto the stats strip and the villain
    // bubble climbed over the HUD header -- tableArea is `overflow: visible`, so
    // nothing clipped it, it just sat on top of other chrome. Measuring the felt
    // and scaling every piece of furniture by the same factor makes the felt
    // reserve room for its own furniture at every table size.
    // The felt's own full-size content box: styles.basicTable is maxWidth 440,
    // box-sizing border-box, a 2.5px gold border each side and a 1 / 1.45
    // aspect ratio -- so 440 - 5 wide and 440 * 1.45 - 5 tall.
    const FELT_DESIGN_W = 435;
    const FELT_DESIGN_H = 633;
    const tableRef = useRef(null);
    const [feltBox, setFeltBox] = React.useState({ w: FELT_DESIGN_W, h: FELT_DESIGN_H });
    // The table AREA's content box (the felt's parent). Measured separately
    // because the responsive aspect below must be a function of the space the
    // oval is GIVEN, never of the box the oval already took -- deriving the
    // aspect from feltBox would feed the observer its own output.
    const [areaBox, setAreaBox] = React.useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = tableRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const area = el.parentElement;
        const ro = new ResizeObserver((entries) => {
            for (const e of entries) {
                const r = e.contentRect;
                if (r.width <= 0 || r.height <= 0) continue;
                if (e.target === el) setFeltBox({ w: r.width, h: r.height });
                else setAreaBox({ w: r.width, h: r.height });
            }
        });
        ro.observe(el);
        if (area) ro.observe(area);
        return () => ro.disconnect();
    }, []);

    // 1.0 at full size, never upscaled, floored so text stays legible.
    // BOTH axes matter: when the viewport is short, maxHeight wins over the
    // aspect ratio and the oval squashes vertically while keeping its width.
    // Scaling off the width alone would leave the furniture too tall for the
    // felt it now has to live on -- which is exactly how hero's cards used to
    // end up over the stats strip on a laptop.
    const feltScale = useMemo(() => {
        const byW = feltBox.w / FELT_DESIGN_W;
        const byH = feltBox.h / FELT_DESIGN_H;
        return Math.max(0.58, Math.min(1, byW, byH));
    }, [feltBox.w, feltBox.h]);
    // ui(px) -> px scaled to the measured felt. Use for EVERY fixed dimension
    // drawn inside styles.basicTable.
    const ui = useCallback((n) => Math.round(n * feltScale), [feltScale]);

    // ═══ RESPONSIVE FELT ASPECT ═════════════════════════════════════════════
    // On a height-starved viewport (360x640: ~356px of page chrome) the LOCKED
    // 1/1.45 portrait oval starves its own width -- maxHeight wins, the felt
    // lands at 161x233 and feltScale bottoms out at its 0.58 floor, so the
    // floor-scaled furniture is drawn on a felt that kept shrinking under it.
    // Measured: the top seat row touched the board and the five board cards
    // were WIDER than the felt at 320px.
    //
    // The design call (owner-delegated, 2026-08-08): LET THE OVAL FLATTEN.
    // When the height the area offers would force feltScale below FLATTEN_HI
    // at the locked ratio, interpolate the aspect toward a flatter portrait
    // oval so the oval reclaims the width the viewport actually has. Clamped
    // at FELT_ASPECT_FLAT -- still portrait, never landscape, so the template
    // silhouette (.agent/design/training-table-template.png) survives.
    //
    // The REJECTED alternative, for the record: capping the seat count ("show
    // 6-max when feltScale <= 0.65") shipped once and was reverted for cause
    // -- it re-broke the dealer-button rotation and hid villains who had chips
    // committed in the pot. Seats are never dropped for layout reasons.
    // See .agent/design/TRAINING-UI-SPEC.md ("Height-constrained viewports").
    //
    // `predicted` replays the locked-ratio layout arithmetic (basicTable is
    // width 92% / maxWidth 440 / maxHeight 100% of the area, minus the 2.5px
    // gold border each side), so the aspect is a pure function of the area
    // box and cannot oscillate. Above FLATTEN_HI nothing changes: the felt
    // keeps the template's exact 1/1.45.
    const FELT_ASPECT_FULL = 1.45;
    const FELT_ASPECT_FLAT = 1.12;
    const FLATTEN_HI = 0.68;  // locked-ratio feltScale at/above this: no flatten
    const FLATTEN_LO = 0.52;  // locked-ratio feltScale at/below this: fully flat
    const feltAspect = useMemo(() => {
        if (!areaBox.w || !areaBox.h) return FELT_ASPECT_FULL;
        const availW = Math.min(areaBox.w * 0.92, 440);
        const lockedW = Math.min(availW, areaBox.h / FELT_ASPECT_FULL) - 5;
        const predicted = Math.min(1, lockedW / FELT_DESIGN_W);
        if (predicted >= FLATTEN_HI) return FELT_ASPECT_FULL;
        const t = Math.min(1, (FLATTEN_HI - predicted) / (FLATTEN_HI - FLATTEN_LO));
        return FELT_ASPECT_FULL - t * (FELT_ASPECT_FULL - FELT_ASPECT_FLAT);
    }, [areaBox.w, areaBox.h]);

    // Honour the OS "reduce motion" setting: no deal-in, no travel, no pulse.
    const reduceMotion = useReducedMotion();

    // Phase 16's scaledTableHeight memo lived here for months with exactly one
    // reference -- its own declaration. The scale container it was computed for
    // was rebuilt to size itself, and the memo silently became a per-render
    // computation feeding nothing. Removed rather than kept "just in case": a
    // value nothing reads cannot be needed, and its dependency on scaleFactor
    // made it look load-bearing to anyone auditing what scaleFactor drives.

    // Phase 3: Floating EV popup
    const [evPopup, setEvPopup] = React.useState(null);

    // F4: In-Trainer Mode Switching Bar
    const [activeMode, setActiveMode] = React.useState('trainer');
    // GTOW parity #37 — the Range / Strategy panel can be detached from under
    // the action bar and floated beside the table, so studying a range no
    // longer costs you sight of the hand. One flag for both panels: they share
    // the same slot, only one is ever open, and a player who wants the panel
    // floating wants it floating for whichever tab they switch to.
    const [panelPoppedOut, setPanelPoppedOut] = React.useState(false);
    const togglePanelPopOut = useCallback(() => setPanelPoppedOut(v => !v), []);

    // H2: Memoize mode bar tabs to prevent re-creates on every render
    const MODE_TABS = useMemo(() => [
        { id: 'trainer', icon: '', label: 'Trainer'},
        { id: 'range', icon: '', label: 'Range'},
        { id: 'strategy', icon: '', label: 'Strategy'},
        { id: 'settings', icon: '', label: 'Settings'},
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
    // #17: defaulting an unstated villain stack to a flat 100 misrepresents every
    // short-stack spot — a 25BB hero was drawn facing a 100BB villain, which
    // changes SPR, fold equity and therefore the correct answer. When the
    // scenario does not state a villain stack the solver's assumption is that
    // villain is at the same depth as hero, which is what batch-preload already
    // fills in server-side; this mirrors it for the paths that do not.
    const villainStack = scenario.villainStack || heroStack;
    const pot = scenario.pot || 0;
    const villainPosition = scenario.villainPosition || 'BB';
    const villainAction = scenario.action || scenario.villainAction || '';
    const street = scenario.street || '';

    // Fix: clamp the rendered board to the active street so a scenario whose
    // board string already contains turn/river cards doesn't leak them early.
    const visibleBoard = useMemo(() => {
        const s = ((isMultiStreetActive ? currentStreet : street) || '').toLowerCase();
        if (s === 'preflop') return [];
        if (s === 'flop') return boardCards.slice(0, 3);
        if (s === 'turn') return boardCards.slice(0, 4);
        return boardCards;
    }, [boardCards, street, currentStreet, isMultiStreetActive]);

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
            // Re-read storage instead of trusting the copy this table hydrated
            // at mount. Up to four tables are mounted at once and each held its
            // own snapshot: table A bookmarking wrote [..., h1], then table B
            // bookmarking wrote its OWN stale list plus h2 -- and h1 was gone.
            // A's star stayed lit until reload, so the loss was invisible.
            // The merge is by questionId with the freshest entry winning, so a
            // concurrent add from another table survives this write.
            let base = prev;
            try {
                const stored = JSON.parse(localStorage.getItem('sp_bookmarked_hands') || '[]');
                if (Array.isArray(stored)) {
                    const byId = new Map();
                    for (const b of stored) if (b && typeof b === 'object' && b.questionId) byId.set(b.questionId, b);
                    for (const b of prev) if (b && b.questionId) byId.set(b.questionId, b);
                    base = [...byId.values()];
                }
            } catch (e) { console.warn('[App] Handled exception:', e); }

            const exists = base.some(b => b.questionId === qId);
            const prevList = base;
            let next;
            if (exists) {
                next = prevList.filter(b => b.questionId !== qId);
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
                next = [...prevList, entry].slice(-500);
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
        if (accuracy >= 85) return { label: 'EXPERT', color: 'var(--sp-accent-red)', bg: 'rgba(239,68,68,0.15)' };
        if (accuracy >= 70) return { label: 'HARD', color: 'var(--sp-accent-orange)', bg: 'rgba(249,115,22,0.15)' };
        if (accuracy >= 50) return { label: 'MEDIUM', color: 'var(--sp-accent-amber)', bg: 'rgba(251,191,36,0.15)' };
        return { label: 'EASY', color: 'var(--sp-accent-green)', bg: 'rgba(34,197,94,0.15)' };
    }, [questionNumber, sessionMistakes]);

    // Phase 3: Store question for retry + trigger EV popup on feedback
    useEffect(() => {
        if (question && !showFeedback) {
            lastQuestionRef.current = question;
            setRetryActive(false);
        }
    }, [question, showFeedback]);

    // ONE DECISION, ONE KEY.
    //
    // A multi-street hand is a single question asked up to three times: flop,
    // then turn, then river. `questionNumber` advances once per HAND (see the
    // "questionNumber only advances once per hand" note in useGTOTrainer) and
    // the continuation path there calls setCurrentQuestion/setCurrentStreet
    // WITHOUT touching it. So anything keyed on `questionNumber` alone silently
    // skips every street after the first.
    //
    // Measured on production (Blitz 7s, Preflop Blueprint): on the turn of a
    // hand the clock re-armed but expiry never auto-submitted, because
    // `selectedAnswer` still held the flop's answer and the expiry handler is
    // guarded on `!selectedAnswer`. The hand sat there with a dead 0 on the
    // plate and no way to act.
    //
    // This key changes on every DECISION -- new hand or new street -- and is
    // the single reset signal for every per-decision effect below.
    const decisionKey = `${questionNumber}:${currentStreet}:${question?.id || question?.scenario?.id || ''}`;

    // TELL THE PLAYER THE DECK IS WORKING.
    //
    // Between the flop and the turn the trainer waits on
    // /api/training/next-street. Measured on production that wait was 17.4s
    // (the route ran a leading-wildcard ILIKE across an 8M-row table -- fixed
    // by idx_ssg_next_street) and NOTHING on the felt changed for its whole
    // duration: the previous, already-graded decision just sat there. GTOW
    // never leaves the table silent across a street boundary.
    //
    // Gated behind a short delay on purpose. With the index in place the deal
    // is usually quick, and an indicator that flashes for 200ms is worse than
    // no indicator at all -- so this only appears once the wait is long enough
    // that a player would otherwise wonder whether the app had stalled.
    const [showDealing, setShowDealing] = React.useState(false);
    useEffect(() => {
        if (!dealingNextStreet) { setShowDealing(false); return undefined; }
        const t = setTimeout(() => setShowDealing(true), 450);
        return () => clearTimeout(t);
    }, [dealingNextStreet]);

    // RNG MODE: Roll BEFORE each decision (GTO Wizard style)
    // The player sees the number and must pick the action whose cumulative
    // frequency range includes that number. e.g., Check 62% = 1-62, Bet 38% = 63-100
    //
    // Keyed on the DECISION, not the hand: GTOW rolls once per decision, and
    // keyed on questionNumber the turn and river of a multi-street hand
    // inherited the flop's roll -- the same number graded against a different
    // street's frequency ranges.
    useEffect(() => {
        if (rngMode && !showFeedback && questionNumber) {
            // Generate a new roll for each decision
            setRngRoll(Math.floor(Math.random() * 100) + 1);
        } else if (!rngMode) {
            setRngRoll(null);
        }
    }, [rngMode, decisionKey, questionNumber, showFeedback]);

    // Phase 3: EV popup on answer
    useEffect(() => {
        if (showFeedback && moveClassification) {
            const isGood = moveClassification === 'best' || moveClassification === 'correct';
            setEvPopup({
                value: evLoss > 0 ? `-${evLoss.toFixed(1)}` : '+0.0',
                color: isGood ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
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

    // Speed tracking: restart the clock on every new decision. Keyed on the
    // hand alone this held the flop's start time through the turn and river,
    // so `elapsed < 5` was never true and the speed bonus could not be earned
    // on any street after the first.
    useEffect(() => {
        answerStartTime.current = Date.now();
        setShowWhyDrawer(false);
        setShowRangeGrid(false);
    }, [decisionKey]);

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
    // BUG FIX: moved below displayOptions/handleAnswerWithGrouping so keyboard
    // input drives the exact same option list and answer path as the on-screen
    // action buttons (previously it used the raw `options` + handleAnswer).

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
            // NOTE: per-card deal sounds are played by the board cards'
            // onAnimationComplete handler — do NOT schedule them here too.
        }
    }, [questionNumber]);

    // ═══ MULTI-STREET: Detect street transitions and track new cards ═══
    useEffect(() => {
        if (!isMultiStreetActive) {
            prevBoardCardsRef.current = visibleBoard;
            return;
        }

        const prevCards = prevBoardCardsRef.current;
        const currCards = visibleBoard;

        // Detect if a new card was dealt (board grew by 1 card)
        if (currCards.length > prevCards.length && prevCards.length > 0) {
            const newCardIdx = prevCards.length; // The new card is at this index
            setNewStreetCardIndex(newCardIdx);

            // NOTE: the new card's flip sound plays via onAnimationComplete
            // on the board card itself — no separate scheduler here.

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
    }, [visibleBoard, isMultiStreetActive]);

    // Fix: synchronous new-street-card detection — track the previous board
    // length (per question) in a ref so the render pass can tell new cards
    // from existing ones without waiting for state to catch up.
    const prevBoardLenRef = useRef({ qn: null, len: 0 });
    useEffect(() => {
        prevBoardLenRef.current = { qn: questionNumber, len: visibleBoard.length };
    }, [questionNumber, visibleBoard]);

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

    // Determine player count based on game type.
    //
    // TABLE SIZE IS A PROPERTY OF THE HAND, NOT OF THE VIEWPORT. A
    // `if (feltScale <= 0.65) return 6` cap lived here to stop furniture
    // colliding with the POT pill at 360x640. It was removed, for three
    // reasons:
    //
    //  1. It does not fix the collision. Both SEAT_CONFIGS[9] and
    //     SEAT_CONFIGS[6] put their top row at y = 15%, and potPlacement below
    //     already measures the gap from that same 15% row and re-centres the
    //     pill (splitting the overlap when no gap exists). Dropping three
    //     seats changes nothing the pill reacts to.
    //  2. playerCount is the axis every position table is keyed on.
    //     getHeroSeatIndex's 6-max map has no UTG+1, MP+1 or UTG+2, so an MTT
    //     hand whose hero sits at UTG+1 fell through `?? 0` onto the BTN seat
    //     -- and the dealer button, finding heroSeatIndex === the BTN seat,
    //     went right back onto hero. That is the exact defect fixed in
    //     c2c5cad682, re-introduced by a viewport check.
    //  3. Seats are matched to actionHistory by name. On a 6-seat map an
    //     UTG+1 villain has no seat, so both the villain AND the chips
    //     committedFor() puts in front of him vanish from the felt while the
    //     hand still describes his raise.
    //
    // A 9-max hand renders as 9-max at every size; the clamp in the seat block
    // and potPlacement are what keep it on the felt (scripts/table-geometry-check.js
    // sweeps 360x640 for exactly that).
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

    // PORTRAITS FOR THIS HAND, hero-relative (entry 0 is hero). Seeded off the
    // question's stable identity -- the same key the board uses for its deal
    // animation -- so one hand always shows one cast: re-renders, the feedback
    // flip, street changes and a remount all reproduce it exactly, and the next
    // question deals a fresh set from the full library.
    const handAvatarKey = question?.id || question?.scenario?.id || `q-${questionNumber || 1}`;
    const seatAvatars = useMemo(
        () => dealSeatAvatars(handAvatarKey, playerCount, heroAvatar),
        [handAvatarKey, playerCount, heroAvatar]
    );

    // Resolve the named villain through the SAME alias-aware mapping as hero
    // so alias positions (MP on 6-max, SB heads-up, LJ, etc.) keep their seat.
    const villainSeatIndex = villainPosition ? getHeroSeatIndex(villainPosition, playerCount) : -1;

    // Button is always at seat 0
    const getButtonSeatIndex = 0;

    // LAW: dealer button seat — hero if hero is on the button, else the named
    // villain if they are, else the layout's BTN seat (seat 0 in all configs).
    const dealerButtonSeatIndex = (() => {
        const hp = (heroPosition || '').toUpperCase().trim();
        if (hp === 'BTN' || hp === 'BUTTON' || hp === 'BTN/SB') return heroSeatIndex;
        const vp = (villainPosition || '').toUpperCase().trim();
        if (vp === 'BTN' || vp === 'BUTTON' || vp === 'BTN/SB') return villainSeatIndex;
        const btnIdx = seats.findIndex(s => (s.name || '').toUpperCase().startsWith('BTN'));
        if (btnIdx >= 0) return btnIdx;
        // DEALER_BUTTON_SEAT_KEYS is HERO-RELATIVE -- index 0 is always 'hero'.
        // Falling back to 0 therefore did not mean "unknown", it meant "hero has
        // the button", and that is what shipped: on a BB vs BTN hand the D chip
        // sat on hero while the scenario said hero was the big blind. When we
        // know hero's position and it is not the button, refuse to guess. A
        // button on the wrong seat contradicts the very thing being trained;
        // no button at all is the honest render.
        if (hp) return -1;
        return 0;
    })();

    // GTOW parity #17 — every seat shows a REAL stack, never a fabricated one.
    //
    // This used to be `heroStack + ((seed % 40) - 20)`, a hash of the question
    // number giving each unnamed seat a different depth within ±20BB. That was
    // wrong twice over. First, it was invented data rendered with the same
    // authority as the scenario's own numbers, so a player reading the table to
    // judge fold equity was reading noise. Second — and worse — it contradicted
    // the solve the question came from: a solver tree is built at ONE stack
    // depth, so in the spot being trained every seat is at that depth by
    // construction. A table showing 87BB, 104BB and 119BB is depicting a
    // situation the solution does not describe.
    //
    // The honest render is the depth the solve assumes. That also makes the
    // seats agree with the SPR readout, which has always been computed from
    // effective stack rather than from these per-seat numbers.
    const tableStackDepth = useMemo(
        () => Math.max(1, Math.round(heroStack || 100)),
        [heroStack]
    );

    // GAP-6: Effective stack — uses the scenario's real villain stack (falls
    // back to heroStack) instead of fabricating per-seat stacks, so SPR math
    // matches the stacks actually rendered on the table.
    const effectiveStack = useMemo(() => {
        return Math.min(heroStack, villainStack || heroStack);
    }, [heroStack, villainStack]);

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
            // roadmap #14 -- carry the SIZE, not just the sentence. committedFor
            // reads `amount` first and only then falls back to the first number
            // in the action text; `action` is prose ("CO bets into BTN") and has
            // no number in it, so without this every seat committed 0 and the
            // chip badge never drew. `villainBet` is the number the engine
            // already printed to the player in the question text.
            const bet = Number(scen.villainBet) || 0;
            built.push(bet > 0
                ? { position: villainPosition, action: villainAction, amount: bet }
                : { position: villainPosition, action: villainAction });
        }
        return built;
    }, [question?.scenario, villainAction, villainPosition]);

    // The solver mix for THIS decision.
    //
    // The `gtoFrequencies` prop is `useGTOTrainer.lastGTOFrequencies`, which is
    // written at GRADE time and never cleared. Before this question is answered
    // it therefore still holds the PREVIOUS decision's mix -- and on a
    // multi-street hand, every street after the flop reads the flop's. That is
    // not a display nit: `rngRanges` -> `rngTargetAction` -> `effectiveCorrectAnswer`
    // is built from this value, so RNG mode rolled against the previous
    // decision's frequency bands and GRADED against the resulting action.
    // Study mode ("GTO frequencies shown before you answer") printed the same
    // stale numbers as this spot's solver output.
    //
    // The question carries its own mix and get-question.js:610 guarantees the
    // key is populated, so prefer it and fall back only when it is genuinely
    // absent. The trainer now also clears the stale state on every new
    // decision; both halves are wanted, because either one alone leaves a hole
    // if a caller mounts this table without the other.
    const computedFrequencies = useMemo(() => {
        const own = question?.gtoFrequencies;
        if (own && Object.keys(own).length > 0) return own;
        if (gtoFrequencies) return gtoFrequencies;
        // Third argument is `level` (dominance = max(40, 85 - level*4)), NOT a
        // question index -- passing questionNumber made the fabricated mix a
        // function of how far into the session you were.
        return simulateGTOFrequencies(options, correctAnswer, difficultyLevel || 1);
    }, [question, gtoFrequencies, options, correctAnswer, difficultyLevel]);

    // ═══ RANGE MODE MATRIX (GTOW parity #35) ═══
    // The Range tab needs a per-HAND matrix, which only the solver's
    // rawFrequencies carries. `computedFrequencies` is a per-ACTION summary for
    // the current hand only and can never fill a 13x13 grid — feeding it to
    // RangeGrid is what left the matrix blank. Prefer the live question's
    // matrix; fall back to the answered-question snapshot so the tab keeps
    // working through feedback.
    //
    // GTOW parity #36: the info panels used to be gated on `!showFeedback`, so
    // Range/Strategy vanished the instant you acted — exactly the moment a
    // player wants to compare what they did against the solver. They now stay
    // mounted through feedback, which means they must read the ANSWERED
    // question, not the live prop (the parent may already have swapped in the
    // preloaded next hand). Same rule as `fq` further down.
    const infoPanelQuestion = showFeedback
        ? (lastQuestionRef.current || question)
        : question;

    const rangeModeGrid = useMemo(() => {
        const raw = infoPanelQuestion?.rawFrequencies
            || infoPanelQuestion?.scenario?.rawFrequencies
            || infoPanelQuestion?.gtoData?.rawFrequencies
            || null;
        const gridData = buildRangeGridData(raw);
        if (!gridData) return null;
        const cards = infoPanelQuestion?.heroCards
            || infoPanelQuestion?.cards
            || heroCards;
        return {
            gridData,
            actions: rangeGridActions(raw),
            heroHand: handNotationFromCards(cards),
            // Per-hand EVs for the Range tab's overlay. RangeGrid has accepted
            // `handEVs` / `showEVOverlay` since it was written and this call
            // site passed neither, so the per-cell EV numbers and the EV row in
            // the hand-detail popup have never rendered once. The data was
            // three lines away the whole time -- get-question.js populates
            // evData.handEVs from the solver's hand_evs.
            handEVs: infoPanelQuestion?.evData?.handEVs
                || infoPanelQuestion?.handEVs
                || null,
        };
    }, [infoPanelQuestion, heroCards]);

    // ═══ HAND-CLASS STRATEGY (GTOW parity #36) ═══
    // The Strategy tab showed a flat per-action split for hero's ONE hand,
    // which the felt already tells you. GTOW's Strategy tab answers the
    // range-level question: what does each CLASS of hand do here. Same
    // rawFrequencies matrix the Range tab renders, grouped by what each class
    // is on this board.
    const handClassStrategy = useMemo(() => {
        if (!rangeModeGrid) return null;
        const board = infoPanelQuestion?.scenario?.board
            || infoPanelQuestion?.boardCards
            || boardCards
            || [];
        try {
            return aggregateByHandClass(rangeModeGrid.gridData, rangeModeGrid.actions, board);
        } catch (err) {
            console.warn('[UDT] hand-class aggregation failed:', err.message);
            return null;
        }
    }, [rangeModeGrid, infoPanelQuestion, boardCards]);

    const rangeClassification = useMemo(() => {
        if (!rangeModeGrid) return null;
        const board = infoPanelQuestion?.scenario?.board
            || infoPanelQuestion?.boardCards
            || boardCards
            || [];
        try {
            return buildClassificationData(rangeModeGrid.gridData, board);
        } catch (err) {
            console.warn('[UDT] classification build failed:', err.message);
            return null;
        }
    }, [rangeModeGrid, infoPanelQuestion, boardCards]);

    // Options + frequencies the Strategy panel draws, snapshot-aware for the
    // same reason as above.
    const panelStrategy = useMemo(() => {
        const opts = Array.isArray(infoPanelQuestion?.options) && infoPanelQuestion.options.length > 0
            ? infoPanelQuestion.options
            : options;
        const freqs = (showFeedback && infoPanelQuestion?.gtoFrequencies)
            ? infoPanelQuestion.gtoFrequencies
            : computedFrequencies;
        return { options: opts, frequencies: freqs };
    }, [infoPanelQuestion, options, computedFrequencies, showFeedback]);

    // ═══ SOLVER PROVENANCE (GTOW parity #31) ═══
    // /api/training/batch-preload already computes a `dataQuality` flag. It
    // starts at 'SOLVER_EXACT' and degrades to 'SIMULATED' the moment the route
    // has to fabricate hero cards, a board, or the action mix itself, and it
    // writes the result onto every question it returns. Nothing in the app ever
    // read it — a repo-wide search found zero consumers. The consequence is the
    // one thing a solver trainer cannot afford: a modelled distribution was
    // rendered in exactly the same typeface as a real PioSOLVER one, so a player
    // memorising "the solver bets 62% here" had no way to know whether that
    // number came from the solver or from a hash of the question id.
    //
    // There are two independent routes to a modelled mix and both must be
    // caught: the API's own flag, and the local simulateGTOFrequencies()
    // fallback in `computedFrequencies` that fires whenever no gtoFrequencies
    // prop arrived at all. Reading only the flag would still have let the
    // second one through silently.
    //
    // Snapshot-aware for the same reason as panelStrategy: through feedback the
    // parent may already have swapped in the preloaded next hand, and the badge
    // must describe the hand whose numbers are on screen.
    const frequencySource = useMemo(() => {
        const q = infoPanelQuestion;
        const solverMix = (showFeedback && q?.gtoFrequencies) ? q.gtoFrequencies : gtoFrequencies;
        // DeterministicGTOEngine never sets dataQuality — it tags provenance with
        // `source` instead, and two of its four sources are not solver output.
        // POSTFLOP_ENGINE frequencies come from PostflopScenarioGenerator's
        // heuristics, and hand_history_import is the player's own hand with no
        // solve behind it at all. Both were showing as though PioSOLVER had
        // produced them.
        const MODELLED_SOURCES = ['POSTFLOP_ENGINE', 'hand_history_import'];
        const isModelled =
            q?.dataQuality === 'SIMULATED' ||
            MODELLED_SOURCES.includes(q?.source) ||
            !solverMix;
        return isModelled
            ? { modelled: true, label: 'MODELLED', fg: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.35)', title: 'Modelled distribution - this spot had no exact solver output, so the action mix is estimated. Treat the shape as directional, not exact.' }
            : { modelled: false, label: 'SOLVER', fg: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.35)', title: 'Exact PioSOLVER output for this spot.' };
    }, [infoPanelQuestion, gtoFrequencies, showFeedback]);

    // ═══ DIFFICULTY MODE GROUPING (GTO Wizard Simple/Grouped/Standard) ═══
    // GTOW parity #21: `difficultyMode` is only ever set by TrainerConfigModal.
    // The SessionSetupModal path sets `difficulty` in the UI vocabulary
    // (beginner/standard/expert), which used to fall straight through to
    // 'standard' here — so the table rendered exact solver sizings no matter
    // which tier the player picked. Translate before use.
    const activeDifficultyMode = toEngineDifficulty(
        trainerConfig?.difficultyMode || trainerConfig?.difficulty
    );

    // ●●● ONE remapper per question, not two. ●●●
    // useGTOTrainer.applyDifficultyToQuestion already collapses the action set
    // for Simple and Grouped, aggregating frequencies and per-action EVs onto
    // the new ids and remapping the answer key -- with a fail-safe that serves
    // the question UNSIMPLIFIED rather than unwinnable. It stamps the question
    // with `_difficultyApplied` when it does.
    //
    // This table then ran `groupActions` over that OUTPUT, a second collapse of
    // an already-collapsed set, and the two disagreed about vocabulary: the
    // hook emits `fold`/`check`/`bet`, the grouper knew only `f`/`x`/`b33`. The
    // hook's fail-safe cannot protect against a remap that happens after it
    // returns, so a spot whose answer was Check or Fold arrived on the felt
    // with no button for it. Re-grouping is now skipped when the question has
    // already been through the hook; the felt renders exactly what the hook
    // produced.
    const difficultyAlreadyApplied = Boolean(question?._difficultyApplied);
    const groupingMode = difficultyAlreadyApplied
        ? DIFFICULTY_MODES.STANDARD
        : activeDifficultyMode;
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
        const grouped = groupActions(
            options,
            computedFrequencies,
            groupingMode,
            Number(question?.scenario?.pot) || null
        );
        if (groupingMode !== 'standard') return grouped;
        // The top-up below exists to reach four EXACT-sizing buttons. A
        // question the hook already collapsed has the button count its mode
        // asks for; padding it back to four would re-introduce the sizings the
        // player chose to hide.
        if (difficultyAlreadyApplied) return grouped;
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

        // Phase 2: still short — pull from the SOLVER's frequency map, sorted by
        // freq desc.
        //
        // GTOW parity #20: this phase used to run against `computedFrequencies`,
        // which falls back to simulateGTOFrequencies() when the question carries
        // no solver data. That invented buttons for actions the solver never
        // returned, then graded the player against them. Padding is now gated on
        // real solver frequencies (`gtoFrequencies`) being present — with no
        // solver data we show exactly the actions the question supplied, which
        // is what GTO Wizard does.
        //
        // It also pushed `text: actionId`, so the padded button read "b33"
        // instead of "Bet 33%". Labels now go through the same formatter the
        // rest of the table uses.
        if (padded.length < 4 && gtoFrequencies) {
            const ranked = Object.entries(gtoFrequencies)
                .filter(([k, v]) => v > 0 && !presentIds.has(String(k).toLowerCase()))
                .sort((a, b) => b[1] - a[1]);
            for (const [actionId] of ranked) {
                if (padded.length >= 4) break;
                presentIds.add(String(actionId).toLowerCase());
                padded.push({ id: actionId, text: formatSolverActionLabel(actionId) });
                freqMap[actionId] = gtoFrequencies[actionId];
                mapping[actionId] = [actionId];
            }
        }

        return { groupedOptions: padded, frequencyMap: freqMap, actionMapping: mapping };
    }, [options, computedFrequencies, gtoFrequencies, groupingMode, difficultyAlreadyApplied, question]);

    // Fix 16: single source of truth for RNG cumulative frequency ranges —
    // built from displayOptions order so the pre-answer chips and the
    // feedback indicator always map the roll to the same action.
    //
    // GTOW parity #38: the mapping now honours `rngHighLow`. In 'low' the first
    // action owns the bottom of the dial (1..f1); in 'high' it owns the top
    // (101-f1..100) and each subsequent action steps downward. Both modes are
    // clamped to cover the full 1-100 dial even when the solver frequencies do
    // not sum to exactly 100 — a roll that lands in no range at all would show
    // the player a number with no instruction attached, which is worse than a
    // rounding error of one point on a boundary.
    const rngRanges = useMemo(() => {
        const entries = [];
        (displayOptions || []).slice(0, 9).forEach(opt => {
            const id = opt.id || opt;
            const freq = Number(displayFrequencies[id] ?? computedFrequencies[id] ?? 0);
            if (!Number.isFinite(freq) || freq <= 0) return;
            entries.push({ id, text: typeof opt === 'string' ? opt : (opt.text || ''), freq });
        });
        if (entries.length === 0) return [];

        let ranges;
        if (rngHighLow === 'high') {
            let ceiling = 100;
            ranges = entries.map(e => {
                const end = ceiling;
                const start = Math.max(1, Math.round(ceiling - e.freq) + 1);
                ceiling = start - 1;
                return { id: e.id, text: e.text, start, end };
            });
            // Stretch the last (lowest) band down to 1 so no roll is orphaned.
            const last = ranges[ranges.length - 1];
            if (last) last.start = 1;
        } else {
            let cumulative = 0;
            ranges = entries.map(e => {
                const start = Math.round(cumulative) + 1;
                cumulative += e.freq;
                return { id: e.id, text: e.text, start, end: Math.round(cumulative) };
            });
            const last = ranges[ranges.length - 1];
            if (last) last.end = 100;
        }
        return ranges.filter(r => r.end >= r.start);
    }, [displayOptions, displayFrequencies, computedFrequencies, rngHighLow]);

    // GTOW parity #38 — the action the dice actually selected. The roadmap's
    // pass condition is that "the best action changes with the roll and the
    // chosen High/Low mode", so this value is not decoration: it is forwarded
    // to the grader on every answer submitted while RNG mode is live, which is
    // what stops the on-screen "→ Bet 75%" from being contradicted by a
    // feedback banner that graded against the highest-frequency action instead.
    const rngTargetAction = useMemo(() => {
        if (!rngMode || rngRoll === null || rngRanges.length === 0) return null;
        return rngRanges.find(r => rngRoll >= r.start && rngRoll <= r.end) || rngRanges[0];
    }, [rngMode, rngRoll, rngRanges]);

    // GTOW parity #38 — the reference product does not merely label the mode, it
    // recolours the whole dice affordance so a player mid-session can tell at a
    // glance which end of the dial the first action now sits on. Yellow is High,
    // blue is Low. Every RNG surface in this file reads these three fields, so
    // the badge, the range chips and the feedback indicator can never drift out
    // of agreement with each other or with the mode that is actually live.
    const rngTheme = rngHighLow === 'high'
        ? { fg: '#facc15', strong: 'rgba(250,204,21,0.45)', soft: 'rgba(250,204,21,0.15)', faint: 'rgba(250,204,21,0.08)', hairline: 'rgba(250,204,21,0.3)', glow: 'rgba(250,204,21,0.4)', label: 'HIGH' }
        : { fg: '#38bdf8', strong: 'rgba(56,189,248,0.45)', soft: 'rgba(56,189,248,0.15)', faint: 'rgba(56,189,248,0.08)', hairline: 'rgba(56,189,248,0.3)', glow: 'rgba(56,189,248,0.4)', label: 'LOW' };

    // Wrap handleAnswer to resolve grouped actions back to solver actions for scoring
    const handleAnswerWithGrouping = useCallback((answerId, extraMeta) => {
        // Guard against double-answers (mirrors the keyboard path's guard).
        // The ref is the authoritative latch: unlike the two state reads it is
        // current even inside a stale closure, which is exactly what the timer
        // expiry path is when it races a click (see answerSubmittedRef).
        if (answerSubmittedRef.current) return;
        if (showFeedback || selectedAnswer) return;
        answerSubmittedRef.current = true;
        // If using grouped/simple mode, resolve back to the best solver action
        let resolvedId = answerId;
        if (groupingMode !== 'standard' && difficultyActionMapping[answerId]) {
            resolvedId = resolveGroupedAction(
                answerId,
                difficultyActionMapping,
                computedFrequencies,
                correctAnswer
            );
        }
        setSelectedAnswer(resolvedId);
        const elapsed = (Date.now() - answerStartTime.current) / 1000;
        // GTOW parity #38: hand the grader the action the dice selected. It is
        // ignored entirely when RNG mode is off, so the default grading path is
        // untouched; when RNG mode is on it is the difference between the
        // banner agreeing with the dice and flatly contradicting it.
        const rngMeta = rngMode && rngTargetAction
            ? { rngRoll, rngMode: rngHighLow, rngTargetActionId: rngTargetAction.id }
            : null;
        if (onAnswer) onAnswer(resolvedId, { answerTimeSeconds: elapsed, ...(rngMeta || {}), ...(extraMeta || {}) });
        const gradedAgainst = rngMeta ? rngMeta.rngTargetActionId : correctAnswer;
        try { busEmit('ARENA_HAND_ANSWERED', { answerId: resolvedId, timeSeconds: elapsed, questionNumber, isCorrect: resolvedId === gradedAgainst }); } catch (e) { console.warn('[App] Handled exception:', e); }
    }, [showFeedback, selectedAnswer, groupingMode, difficultyActionMapping, computedFrequencies, onAnswer, questionNumber, correctAnswer, rngMode, rngHighLow, rngRoll, rngTargetAction]);

    // Phase 25: Keyboard Shortcuts — UNIFIED handler (1-9, F/C/R, Space/Enter)
    // Uses the SAME displayOptions list + handleAnswerWithGrouping path as the
    // rendered action buttons so keyboard answers can never diverge from clicks.
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
                    const opts = displayOptions || []; // Same list as the rendered buttons
                    if (opts[keyNum - 1]) {
                        const optId = opts[keyNum - 1].id || opts[keyNum - 1];
                        handleAnswerWithGrouping(optId);
                    }
                    return;
                }
                // F/C/R shortcuts for fold/check-call/raise
                const lower = key.toLowerCase();
                if (lower === 'f') {
                    const opts = displayOptions || [];
                    const foldOpt = opts.find(o => /fold/i.test(o.text || o.label || ''));
                    if (foldOpt) handleAnswerWithGrouping(foldOpt.id || foldOpt);
                } else if (lower === 'c') {
                    const opts = displayOptions || [];
                    const checkCallOpt = opts.find(o => /check|call/i.test(o.text || o.label || ''));
                    if (checkCallOpt) handleAnswerWithGrouping(checkCallOpt.id || checkCallOpt);
                } else if (lower === 'r') {
                    const opts = displayOptions || [];
                    const raiseOpt = opts.find(o => /raise|bet|all.in|shove/i.test(o.text || o.label || ''));
                    if (raiseOpt) handleAnswerWithGrouping(raiseOpt.id || raiseOpt);
                }
            }
        };

        // Claim the number keys for this table. GodModeArena carries a second,
        // older window-level keydown handler that resolves the pressed digit
        // against the RAW question options rather than `displayOptions`, so
        // under Grouped or Simple difficulty the two handlers answer DIFFERENT
        // actions on the same keypress — and both fire. This counter lets the
        // older handler stand down whenever a table with the unified handler is
        // mounted, without removing keyboard play from screens that have no
        // such table. A counter, not a boolean, so multi-table teardown of one
        // table does not release the claim held by its siblings.
        window.__spUnifiedKeyboard = (window.__spUnifiedKeyboard || 0) + 1;
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.__spUnifiedKeyboard = Math.max(0, (window.__spUnifiedKeyboard || 1) - 1);
        };
    }, [showFeedback, selectedAnswer, onNextHand, displayOptions, handleAnswerWithGrouping]);

    // GTOW parity #38 — while the dice is live it, not the solver's modal
    // action, is what "Best" means for this hand. Every display that used to
    // read `correctAnswer` reads this instead, so the chip that says the roll
    // points at Bet 75% and the banner that names the best action can no
    // longer disagree. Off, it is exactly `correctAnswer`.
    const effectiveCorrectAnswer = (rngMode && rngTargetAction)
        ? rngTargetAction.id
        : correctAnswer;

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
        let result = classifyMove(selectedAnswer, effectiveCorrectAnswer, computedFrequencies);
        // PHASE 9: Simplified Mode override for computed classification
        if (simplifiedMode && result.classification === 'inaccuracy') {
            const userFreq = computedFrequencies[selectedAnswer] || computedFrequencies[selectedAnswer?.toLowerCase()] || 0;
            if (userFreq > 0 && userFreq < 5) return 'correct';
        }
        return result.classification;
    }, [moveClassification, showFeedback, selectedAnswer, effectiveCorrectAnswer, computedFrequencies, simplifiedMode]);

    // Get classification config for display
    const classConfig = computedClassification ? CLASSIFICATION_CONFIG[computedClassification] : null;

    // Reset selectedAnswer + feedbackCollapsed on every new DECISION (BUG-1 fix,
    // widened from questionNumber to decisionKey -- see the note above). Leaving
    // a stale `selectedAnswer` across a street boundary blocked the answer
    // handler (`if (showFeedback || selectedAnswer) return;`), hid the action
    // block (`!showFeedback && !selectedAnswer && question`), blocked the
    // timer's auto-submit on expiry, and highlighted the previous street's
    // answer as if it belonged to this one.
    React.useEffect(() => {
        setSelectedAnswer(null);
        setFeedbackCollapsed(false);
        setDeepAnalysisOpen(false);
        answerSubmittedRef.current = false;
        setTimeExpired(null);
    }, [decisionKey]);

    // ARENA_HAND_LOADED is a per-HAND event, so it stays keyed on the hand.
    React.useEffect(() => {
        try { busEmit('ARENA_HAND_LOADED', { questionNumber, gameId: question?.gameId || null }); } catch (e) { console.warn('[App] Handled exception:', e); }
    }, [questionNumber]);



    // Speed bonus toast on correct feedback
    useEffect(() => {
        if (!showFeedback || !moveClassification) return;
        if (moveClassification === 'best' || moveClassification === 'correct') {
            const elapsed = (Date.now() - answerStartTime.current) / 1000;
            if (elapsed < 5) {
                setSpeedBonusToast({ label: 'LIGHTNING +5', color: 'var(--sp-accent-amber)' });
                SoundEngine.play('speed_bonus');
                setTimeout(() => setSpeedBonusToast(null), 2000);
            } else if (elapsed < 10) {
                setSpeedBonusToast({ label: 'SPEED BONUS +2', color: 'var(--sp-accent-green)' });
                SoundEngine.play('speed_bonus');
                setTimeout(() => setSpeedBonusToast(null), 2000);
            }
        }
    }, [showFeedback, moveClassification]);

    // Phase 22+: Smart auto-advance with countdown visual
    // Best/Correct: 2s. Inaccuracy: 4s. Wrong/Blunder: stays until user clicks.
    // PERF: only the TOTAL lives here (one state write per feedback window).
    // The 50ms remaining-time tick is owned by AutoAdvanceIndicator so the
    // table tree no longer re-renders at 20Hz during auto-advance windows.
    const [autoAdvanceTotal, setAutoAdvanceTotal] = React.useState(null);

    useEffect(() => {
        if (!showFeedback || !onNextHand || !computedClassification) {
            setAutoAdvanceTotal(null);
            return;
        }
        // 2026-07-26 UX FIX: this defaulted ON, so correct/best answers flashed
        // their feedback for 2s and moved on before the explanation could be
        // read. GTO Wizard waits for the player. Opt-in now.
        //
        // roadmap #6 — FEEDBACK RULE. GTO Wizard's most important pacing
        // control: 'every' pauses after every action, 'mistakes' pauses ONLY on
        // an error and rolls straight through correct play. We had no
        // equivalent, so a session was either fully manual or fully automatic.
        //   'every'    -> never auto-advance; the player clicks every hand.
        //   'mistakes' -> auto-advance best/correct; stop on inaccuracy+.
        //   'auto'     -> legacy behaviour, auto-advance everything but blunders.
        const isMistake = !(computedClassification === 'best' || computedClassification === 'correct');
        const feedbackRule = trainerConfig?.feedbackRule
            || (trainerConfig?.autoAdvance === true ? 'auto' : 'every');

        if (feedbackRule === 'every') {
            setAutoAdvanceTotal(null);
            return;
        }
        if (feedbackRule === 'mistakes' && isMistake) {
            // The whole point of this mode: stop and make the player read it.
            setAutoAdvanceTotal(null);
            return;
        }

        // roadmap #5 — the delay is configurable. GTOW recommends ~3s.
        const baseDelay = Number(trainerConfig?.autoAdvanceDelayMs) > 0
            ? Number(trainerConfig.autoAdvanceDelayMs)
            : 3000;

        let delay = null;
        if (computedClassification === 'best' || computedClassification === 'correct') {
            delay = baseDelay;
        } else if (computedClassification === 'inaccuracy') {
            delay = Math.round(baseDelay * 2);
        }
        // Wrong/Blunder: never auto-advance — the player should study the feedback

        if (delay) {
            setAutoAdvanceTotal(delay);

            const timerId = setTimeout(() => {
                setAutoAdvanceTotal(null);
                onNextHand();
            }, delay);

            return () => {
                clearTimeout(timerId);
                setAutoAdvanceTotal(null);
            };
        } else {
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
        // The template paints all four actions the same indigo, with white bold
        // centred labels -- the buttons are a set of choices, not a traffic
        // light. The per-action colour survives where it still carries meaning:
        // the frequency bar under each button, and every feedback state below
        // (correct green, chosen-wrong classification colour, dimmed rest).
        const baseStyle = {
            ...styles.actionButton,
            ...m.actionButton,
            background: 'linear-gradient(180deg, #4356e0 0%, #3341c9 55%, #2b37ad 100%)',
            border: '1px solid rgba(146,160,255,0.45)',
            color: '#ffffff',
        };

        if (showFeedback) {
            const isCorrect = optionId === effectiveCorrectAnswer || optionId?.toLowerCase() === effectiveCorrectAnswer?.toLowerCase();
            const isSelected = optionId === selectedAnswer || optionId?.toLowerCase() === selectedAnswer?.toLowerCase();
            const freq = computedFrequencies[optionId] || computedFrequencies[optionId?.toLowerCase()] || 0;

            if (isCorrect) {
                // Best action — bright green glow
                return {
                    ...baseStyle,
                    background: '#1a3a2a',
                    borderColor: 'var(--sp-accent-green)',
                    color: 'var(--sp-accent-green)',
                    boxShadow: '0 0 8px rgba(34, 197, 94, 0.25)',
                    // TRAIN-WIRE-UDT-ACTIONBTN-1 fix: explicit opacity 1 cancels ActionButton's disabled-state 0.55 fade
                    opacity: 1,
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
                    // TRAIN-WIRE-UDT-ACTIONBTN-1 fix: explicit opacity 1 cancels ActionButton's disabled-state 0.55 fade
                    opacity: 1,
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

    // POT BAND — the pill lives in the gap between the bottom of the top row of
    // seats and the top of the board. A fixed 29% is right at a full-size felt
    // and wrong at a tiny one: feltScale is floored at 0.58, so below that the
    // furniture stops shrinking while the felt keeps going, the top row grows
    // as a fraction of the felt, and a fixed band walks straight into it.
    // Centre the pill in whatever gap actually exists.
    // Returns BOTH the percentage and which edge of the pill that percentage
    // names. #48 follow-up: the below-board branch used to place the pill by its
    // CENTRE, which meant it had to predict the pill's own height, and `potH`
    // predicted only the POT row -- it did not count the SPR/Odds row beneath
    // it. Measured on production at 375px the real pill was 41px tall against a
    // predicted 22px, so the centre-anchored placement sat the pill's top edge
    // 3px INSIDE the board cards. A prediction that has to stay in sync with
    // markup it cannot see is the wrong mechanism; anchoring the pill's TOP edge
    // below the board removes the pill's height from the arithmetic entirely, so
    // the clearance holds no matter what rows the pill grows later.
    const potPlacement = useMemo(() => {
        const h = Math.max(1, feltBox.h);
        const villainBoxH = ui(52) + ui(34) - ui(8) + ui(3) + ui(35);
        const topRowBottom = 0.15 * h + villainBoxH / 2;
        const boardTop = 0.38 * h - ui(70) / 2;
        const potH = Math.max(11, ui(15)) + ui(4) + ui(5) + 6;
        const lo = topRowBottom + potH / 2 + 3;
        const hi = boardTop - potH / 2 - 3;
        // #48: "split the overlap" was the wrong call. Half a pill of overlap on
        // each side is still overlap, and at 375px it landed the POT/SPR badge
        // squarely on the BTN nameplate's stack line — the villain's "100 bb"
        // was unreadable, which is a number the player has to act on. When the
        // gap above the board genuinely cannot hold the pill, move the pill
        // BELOW the board instead, where the felt is empty on every table size.
        if (lo > hi) {
            const boardBottom = 0.38 * h + ui(70) / 2;
            return { topPct: (boardBottom / h) * 100, belowBoard: true };
        }
        const centre = Math.min(Math.max(0.29 * h, lo), hi);
        return { topPct: (centre / h) * 100, belowBoard: false };
    }, [feltBox.h, ui]);

    // Pot shown on the felt. Single source of truth with the per-seat chip
    // stacks below (see potMath.js): the pill and the chips are the same money.
    const displayPot = useMemo(() => computeDisplayPot({
        scenarioPot: pot,
        streetLabel,
        seats,
        actionHistory,
    }), [pot, streetLabel, seats, actionHistory]);

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

    // GTOW Score color.
    // GTOW parity #25: gtowScore is on the engine's SIGNED -100..+100 scale
    // (score_scale = 2), not the legacy 0-100 one. The old 80/60 cut-offs map
    // through v*2-100 to 60/20. Kept as CSS custom properties because every
    // other colour on this felt is themed the same way.
    const scoreColor = gtowScore >= 60 ? 'var(--sp-accent-green)' : gtowScore >= 20 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)';

    // TRAIN-FEEDBACK-SNAPSHOT-1 (extended): feedback-gated JSX must read the
    // question that was ANSWERED, not the live prop (which the parent may have
    // already swapped to the preloaded next hand). Use fq/fScenario inside any
    // showFeedback-gated block instead of question/question.scenario.
    const fq = getFeedbackQuestion() || question;
    const fScenario = fq?.scenario || {};

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    // Early return for loading state (must happen after all hooks)
    if (!question) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="gto-trainer-container" style={styles.container}>
            {/* ═══ THE QUESTION — first element on the page, pinned to the top ═══
                This is the single most important thing on screen: it is what the
                player is being asked. It previously rendered nowhere at all, then
                mid-page on top of the villain's cards. It now sits above everything
                and sticks while the felt scrolls under it. */}
            {/* CSS Animation Keyframes + H5: Desktop-responsive layout */}
            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
                @keyframes pulse-glow {
                    0%, 100% { box-shadow: 0 0 20px rgba(255,215,0,0.6), 0 0 40px rgba(255,215,0,0.4); }
                    50% { box-shadow: 0 0 30px rgba(255,215,0,0.8), 0 0 60px rgba(255,215,0,0.6); }
                }
                /* Active-seat rim light: the single strongest cue on the felt.
                   Slow, so it reads as "this seat is live" and not as an alarm. */
                @keyframes sp-seat-rim {
                    0%, 100% {
                        box-shadow: 0 0 0 2px rgba(255,199,84,0.85),
                                    0 0 14px 2px rgba(255,178,44,0.45),
                                    inset 0 2px 6px rgba(0,0,0,0.55);
                    }
                    50% {
                        box-shadow: 0 0 0 2.5px rgba(255,214,120,1),
                                    0 0 26px 7px rgba(255,178,44,0.60),
                                    inset 0 2px 6px rgba(0,0,0,0.55);
                    }
                }
                @media (prefers-reduced-motion: reduce) {
                    .gto-trainer-container *,
                    .gto-trainer-container *::before,
                    .gto-trainer-container *::after {
                        animation-duration: 0.001ms !important;
                        animation-iteration-count: 1 !important;
                        transition-duration: 0.001ms !important;
                    }
                }
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
                {streakToast && <StreakToast key="streak-toast" message={streakToast} />}
            </AnimatePresence>
            {/* F14: Classification Flash Banner — null-condition hoisted to the
                call site so AnimatePresence can run the exit animation; uses
                computedClassification (the value actually shown in feedback)
                instead of the raw moveClassification prop. */}
            <AnimatePresence>
                {showFeedback && computedClassification && (
                    <ClassificationFlashBanner
                        key={`flash-${questionNumber}`}
                        classification={computedClassification}
                        evLoss={evLoss}
                        pot={displayPot}
                    />
                )}
            </AnimatePresence>
            {/* F15: Running EV Loss Ticker */}
            <EVLossTicker
                totalEVLoss={totalSessionEVLoss}
                show={questionNumber > 1}
            />
            {/* TOP BAR — the template's three zones: a Back pill on the left,
                the game name centred in cyan, and the session pills plus the
                player's avatar on the right. The title used to be left-aligned
                and the only way out of a session was a floating "Quit" chip
                pinned over the top-left corner of the felt; that chip is gone
                and this pill is the exit. */}
            <div style={{ ...styles.topBar, ...(isNarrow ? styles.topBarNarrow : null) }}>
                <div style={styles.topBarLeft}>
                    {onExit && (
                        <button
                            onClick={onExit}
                            aria-label="Back to Training"
                            style={{ ...styles.backPill, ...(isNarrow ? styles.backPillNarrow : null) }}
                        >
                            <span style={styles.backPillArrow}>←</span>
                            {/* #48: the words cost 101px of a 375px bar. The arrow
                                alone is the same control and the aria-label above
                                still names it for a screen reader. */}
                            {!isNarrow && 'Back to Training'}
                        </button>
                    )}
                </div>
                {/* Centred on the BAR, not between its neighbours, so the title
                    does not drift when the left or right cluster changes width.
                    #48: absolute centring is only safe while the side clusters
                    leave the middle free. On a phone they do not, so the title
                    becomes an ordinary flex child that ellipsizes instead of a
                    free-floating layer that lands on top of the mode chips. */}
                <div style={{ ...styles.topBarTitle, ...(isNarrow ? styles.topBarTitleNarrow : null) }}>{gameTitle || 'GTO Training'}</div>
                <div style={{ ...styles.topBarRight, ...(isNarrow ? styles.topBarRightNarrow : null) }}>
                    {/* The MEDIUM difficulty chip and the SOLVER/AI data-source chip
                        were build diagnostics wearing gameplay HUD clothing: a
                        player deciding whether to call cannot act on either, and
                        both cost a slot in the busiest row on screen. Gone.

                        RNG and TRAIN/STUDY are real session modes, so they stay -
                        but folded in here as two lit switches instead of owning a
                        full-width strip of their own further down. Lit means on;
                        the word "OFF" no longer has to be printed to say nothing
                        is happening. */}
                    <div style={styles.modeGroup} role="group" aria-label="Session modes">
                        <button
                            data-compact
                            onClick={() => setRngMode(v => !v)}
                            aria-pressed={rngMode}
                            title={rngMode ? 'RNG on - the drill rolls a die for mixed strategies' : 'RNG off'}
                            style={{ ...styles.modeButton, ...(rngMode ? styles.modeButtonRng : null) }}
                        >
                            RNG
                        </button>
                        {/* GTOW parity #38 — the High/Low switch only exists while the
                            dice does. Showing a dead mode selector next to a mode that
                            is off is how a control panel starts lying to the player. */}
                        {rngMode && (
                            <button
                                data-compact
                                onClick={() => setRngHighLow(v => (v === 'low' ? 'high' : 'low'))}
                                aria-pressed={rngHighLow === 'high'}
                                aria-label={`Randomiser direction: ${rngTheme.label}`}
                                title={rngHighLow === 'high'
                                    ? 'High - the first action occupies the TOP of the 1-100 dial'
                                    : 'Low - the first action occupies the BOTTOM of the 1-100 dial'}
                                style={{
                                    ...styles.modeButton,
                                    color: rngTheme.fg,
                                    background: rngTheme.soft,
                                    borderColor: rngTheme.strong,
                                }}
                            >
                                {rngTheme.label}
                            </button>
                        )}
                        <button
                            data-compact
                            onClick={() => setStudyMode(v => !v)}
                            aria-pressed={studyMode}
                            title={studyMode ? 'Study - GTO frequencies shown before you answer' : 'Train - answer first, GTO after'}
                            style={{ ...styles.modeButton, ...(studyMode ? styles.modeButtonStudy : null) }}
                        >
                            {studyMode ? 'STUDY' : 'TRAIN'}
                        </button>
                    </div>
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
                                    flop: 'var(--sp-accent-green)', turn: 'var(--sp-accent-orange)', river: 'var(--sp-accent-red)',
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
                    {/* GOLD PILL — the template's XP slot. This component is
                        handed no XP or diamond balance (GodModeArena keeps
                        totalXP as a permanent 0 stub and never passes the
                        diamond count down), so rather than print a fabricated
                        currency the two pills carry the real session numbers in
                        the template's treatment: score in gold, accuracy in
                        cyan. */}
                    <div style={styles.xpPill}>
                        <span style={styles.xpPillIcon}>◆</span>
                        <span style={{ ...styles.xpPillValue, color: scoreColor }}>{formatSignedScore(gtowScore)}</span>
                        {/* #48: the caption is a label for a number that already
                            carries a gold diamond and a signed percentage. On a
                            phone that redundancy costs the avatar its slot. */}
                        {!isNarrow && <span style={styles.pillCaption}>SCORE</span>}
                    </div>
                    {/* CYAN PILL — the template's diamonds slot. Streak lives on
                        in the session rail and the toast; the question counter
                        moved to the "Question N of M" pill at the lower right of
                        the felt, where the template puts it. */}
                    {questionNumber > 1 && (() => {
                        const accColor = gtowAccuracy >= 80 ? 'var(--sp-accent-green)' : gtowAccuracy >= 60 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)';
                        return (
                            <div style={styles.gemPill}>
                                <span style={styles.gemPillIcon}>◇</span>
                                <span style={{ ...styles.xpPillValue, color: accColor }}>{gtowAccuracy}%</span>
                                {!isNarrow && <span style={styles.pillCaption}>ACC</span>}
                            </div>
                        );
                    })()}
                    {/* PLAYER AVATAR — same portrait component the seats use, so
                        a missing asset degrades to a monogram disc instead of a
                        broken image.
                        #48: dropped on a phone. It is the only purely decorative
                        item in the bar — hero's portrait is already on the felt
                        at the hero seat — and it was the element being pushed off
                        the right edge, so removing it is what buys the rest of
                        the cluster room to fit rather than to overflow. */}
                    {!isNarrow && (
                        <div style={styles.topBarAvatar}>
                            <SeatAvatar src={heroAvatar} label={playerName || 'HERO'} fontSize={13} />
                        </div>
                    )}
                    {/* PHASE 9: Simplified Mode Toggle */}
                    <motion.button
                        onClick={toggleSimplifiedMode}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            padding: '2px 8px', borderRadius: 6,
                            fontSize: 8, fontWeight: 700, letterSpacing: 0.8,
                            border: simplifiedMode ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.1)',
                            background: simplifiedMode ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
                            color: simplifiedMode ? 'var(--sp-accent-purple)' : 'var(--sp-fg-dim)',
                            cursor: 'pointer', textTransform: 'uppercase',
                        }}
                    >
                        {simplifiedMode ? 'SIMPLE' : 'FULL'}
                    </motion.button>
                </div>
            </div>

            {/* ═══ THE QUESTION ═══════════════════════════════════════════
                Full-width panel directly under the top bar: near-black fill,
                cyan border with an outer glow, large bold white centred text.
                It is ABOVE the table, not floating over the felt -- which is
                where it lived until now, at 15px, on top of the top row of
                seats. This is the single most important thing on screen. */}
            {(contextString || (questionText && questionText !== 'Loading question...')) && (
                <div style={{ ...styles.questionPanel, ...m.questionPanel }}>
                    {questionText && questionText !== 'Loading question...' && (
                        <div style={styles.questionPanelText}>{questionText}</div>
                    )}
                    {contextString && (
                        <div style={styles.questionPanelContext}>{contextString}</div>
                    )}
                </div>
            )}

            {/* SESSION RAIL - one bar where there used to be six stacked strips.

                Between the question and the felt this component stacked SIX
                separate full-width rows: a progress bar, a classification
                mini-bar with its own legend, a position/street accuracy pill
                row (up to ten pills), a leak ticker, a mode-toggle row, and a
                second EV progress bar. On a phone that consumed most of the
                screen before a single card was visible - which is exactly the
                "UI is trash and stacked" complaint.

                They are now one rail, and the fill IS the quality breakdown:
                progress and how you are playing are the same object, the way a
                game shows it, with a lit leading edge riding the front. The
                per-position, per-street, leak and distribution numbers are
                session analytics rather than gameplay HUD and belong on the
                review screen, where there is room to actually read them. */}
            <div style={styles.sessionRail}>
                <div style={styles.sessionRailTrack}>
                    {(() => {
                        const pct = Math.min(100, Math.max(0, ((questionNumber || 1) / (totalQuestions || 25)) * 100));
                        const counts = classificationCounts || {};
                        const segments = [
                            { key: 'best', color: '#22c55e', count: counts.best || 0 },
                            { key: 'correct', color: '#00d4ff', count: counts.correct || 0 },
                            { key: 'inaccuracy', color: '#fbbf24', count: counts.inaccuracy || 0 },
                            { key: 'wrong', color: '#f97316', count: counts.wrong || 0 },
                            { key: 'blunder', color: '#ef4444', count: counts.blunder || 0 },
                        ].filter(seg => seg.count > 0);
                        return (
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.4, ease: 'easeOut' }}
                                style={styles.sessionRailFill}
                            >
                                {segments.length > 0
                                    ? segments.map(seg => (
                                        <div
                                            key={seg.key}
                                            title={`${seg.key}: ${seg.count}`}
                                            style={{ flex: seg.count, height: '100%', background: seg.color }}
                                        />
                                    ))
                                    : <div style={{ flex: 1, height: '100%', background: '#00d4ff' }} />}
                                <div style={styles.sessionRailHead} />
                            </motion.div>
                        );
                    })()}
                </div>
                <span
                    style={{
                        ...styles.sessionRailEV,
                        color: totalSessionEVLoss > 1 ? '#ef4444' : totalSessionEVLoss > 0 ? '#fbbf24' : '#22c55e',
                    }}
                    title="Total EV surrendered this session"
                >
                    {totalSessionEVLoss > 0 ? `-${totalSessionEVLoss.toFixed(1)}` : '0.0'} EV
                </span>
            </div>

                        {/* TABLE AREA - Center */}
            <div style={{
                ...styles.tableArea,
                // On a phone the felt fills the table area edge to edge and the
                // gutters beside the oval are too narrow to hold the countdown
                // and the question pill without them reaching into hero's hole
                // cards. Reserve a strip UNDER the felt for them instead, and
                // let the oval shrink into what is left.
                paddingBottom: isMobile ? CORNER_RAIL_BAND : 0,
            }}>

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

                {/* The question used to be printed HERE, as a 15px overlay
                    pinned to the top of the table area -- i.e. on the felt, over
                    the top row of seats. The template puts it in a panel of its
                    own above the table; see styles.questionPanel. Only the
                    settings gear remains in this corner. */}
                <div style={{
                    position: 'absolute',
                    top: 3,
                    left: 0,
                    right: 0,
                    height: 34,
                    zIndex: 5,
                    pointerEvents: 'none',
                }}>
                    {/* Settings Gear — upper right of the table area */}
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
                                color: trainerConfig ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-muted)',
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
                            // #48: the gear disc starts at right:8 and is 32
                            // wide, so right:46 left a 6px gap that read as the
                            // two controls touching. 52 separates them.
                            right: 52,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'rgba(0,212,255,0.08)',
                            border: '1px solid rgba(0,212,255,0.2)',
                            color: 'var(--sp-accent-cyan)',
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
                <div ref={tableRef} style={{ ...styles.basicTable, aspectRatio: `1 / ${feltAspect}` }}>

                {/* THE FELT — inset into the rail above. Purely decorative and
                    pointer-transparent; every seat, chip and card is drawn on
                    top of it in the same percentage coordinate space. */}
                <div style={{ ...styles.feltSurface, inset: ui(15) }} />

                {/* FELT BRAND — the game name burned into the centre of the
                    felt with the product mark beneath it, the way a real table
                    carries the room's logo. Decorative only: pointer-events off
                    and below every seat, chip and card in z-order. */}
                <div style={{
                    position: 'absolute',
                    top: '59%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '68%',
                    textAlign: 'center',
                    pointerEvents: 'none',
                    zIndex: 1,
                    lineHeight: 1.2,
                }}>
                    <div style={{
                        fontSize: Math.max(11, ui(19)),
                        fontWeight: 800,
                        color: 'rgba(255,255,255,0.90)',
                        letterSpacing: 0.4,
                        textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                    }}>
                        {gameTitle || 'GTO Training'}
                    </div>
                    <div style={{
                        marginTop: ui(3),
                        fontSize: Math.max(8, ui(12)),
                        fontWeight: 800,
                        color: 'rgba(226,175,58,0.95)',
                        letterSpacing: 0.3,
                        textShadow: '0 1px 6px rgba(0,0,0,0.85)',
                    }}>
                        Smarter.Poker
                    </div>
                </div>

                {/* DYNAMIC PLAYER SEATS — GTO Wizard style: only Hero + active Villain(s) */}
                <div style={styles.seatsContainer}>
                    {seats.map((seat, index) => {
                        const isHero = index === heroSeatIndex;
                        const isButton = index === getButtonSeatIndex;
                        // #17: the named villain shows the scenario's own stack;
                        // every other seat shows the depth the solve was built at.
                        // Nothing on this table is invented any more.
                        const stackSize = isHero
                            ? heroStack
                            : (index === villainSeatIndex && villainStack ? villainStack : tableStackDepth);
                        // Determine if this villain has folded
                        // HERO-RELATIVE ring index for this ABSOLUTE seat index.
                        // Entry 0 is hero, 1 is the seat to his left, clockwise.
                        const seatRel = ((index - heroSeatIndex) % playerCount + playerCount) % playerCount;
                        // Alias-aware seat matching (see positionSeatIndex).
                        // On the 6-max ring MP and HJ share seat 4 and no seat
                        // is literally named 'MP', so string comparison dropped
                        // every MP entry -- the #18 fold plate simply never
                        // drew on 6-max games. The entry matches this seat when
                        // the ring's own alias table resolves it HERE.
                        const entryMatchesSeat = (a) =>
                            positionSeatIndex(a?.position, playerCount) === index;
                        const villainFolded = !isHero && actionHistory.some(
                            a => entryMatchesSeat(a) && /fold/i.test(a.action)
                        );
                        // Determine if this villain has a speech bubble action
                        const villainSeatAction = !isHero ? (
                            actionHistory.find(entryMatchesSeat)
                            || (index === villainSeatIndex && villainAction ? { action: villainAction } : null)
                        ) : null;

                        // GAP 1 FIX: Only show Hero + villain(s) who acted or are the named villain.
                        // Alias-aware: the named villain resolves via villainSeatIndex (same
                        // mapping as hero) so 'MP'/'SB'/'LJ' aliases don't make villains vanish.
                        const isActiveVillain = index === villainSeatIndex
                            || actionHistory.some(entryMatchesSeat);
                        if (!isHero && !isActiveVillain) return null;

                        // ── SEAT GEOMETRY ────────────────────────────────
                        // SEAT_CONFIGS is HERO-RELATIVE by construction: entry 0
                        // is hero at the bottom of the felt and the rest run
                        // clockwise from him -- the SAME ordering that
                        // DEALER_BUTTON_SEAT_KEYS / DEALER_BUTTON_POSITIONS /
                        // CHIP_STACK_POSITIONS use. Absolute `seats` indices are
                        // rotated into that space with
                        //   ((absolute - heroSeatIndex) % playerCount + playerCount) % playerCount
                        // wherever they meet those tables (dealer button and chip
                        // blocks below).
                        const activeCount = seats.filter((s, i) => {
                            if (i === heroSeatIndex) return true;
                            return i === villainSeatIndex
                                || actionHistory.some(a => positionSeatIndex(a?.position, playerCount) === i);
                        }).length;
                        // ...and the seat ring is one of those tables. `seats` is a
                        // POSITION table: entry 0 is BTN, entry 1 is SB, and so on,
                        // because that is what getHeroSeatIndex maps into. Reading
                        // seat.x/seat.y at the ABSOLUTE index therefore drew every
                        // seat at its POSITION's coordinates while the dealer button
                        // and the chip stacks -- which do rotate -- drew at its
                        // hero-relative ones. With hero on the button the two agreed
                        // and nobody noticed. With hero in the big blind they did
                        // not: hero was pulled to y = 84 but kept the big blind's
                        // x = 16, so he sat in the bottom-LEFT while his own chips
                        // sat in the bottom-CENTRE hero slot, the button seat was
                        // drawn underneath him at bottom-centre, and the D chip was
                        // over on the mid-right rail. Read the ring through the same
                        // rotation as everything else and hero lands at (50, 84)
                        // with the table running clockwise from him, which is the
                        // arrangement the design template shows.
                        const ringSeat = seats[seatRel] || seat;
                        let seatX = ringSeat.x;
                        let seatY = ringSeat.y;
                        // Heads-up used to slam the lone villain to y = -8%, i.e.
                        // clean OFF the felt and on top of the HUD header. Because
                        // tableArea is overflow:visible nothing clipped it -- it
                        // just covered the question. Both seats now sit ON the felt.
                        if (activeCount <= 2) {
                            seatX = 50;
                            seatY = isHero ? 84 : 17;
                        } else if (isHero) {
                            // Hero owns the bottom edge of the oval, centered.
                            seatY = 84;
                        }

                        // ── FURNITURE FOOTPRINT ──────────────────────────
                        // Every fixed dimension below is scaled by ui() against
                        // the MEASURED felt, and the seat centre is then clamped
                        // so the whole cluster stays inside the felt at any table
                        // size. This is what stops hero's cards spilling onto the
                        // stats strip and the villain bubble climbing over the HUD.
                        const avatarPx = isHero ? ui(66) : ui(52);
                        const plateW = isHero ? ui(94) : ui(78);
                        const plateH = ui(34);
                        const heroCardW = ui(46);
                        const heroCardH = ui(64);
                        const vilCardW = ui(25);
                        const vilCardH = ui(35);
                        const bubbleH = ui(26);
                        const boxH = isHero
                            ? (avatarPx + plateH - ui(8))
                            : (avatarPx + plateH - ui(8) + ui(3) + vilCardH);
                        // plateW is the nameplate's FULL width, not its content
                        // width -- boxSizing below is border-box precisely so the
                        // footprint used for the clamp matches what is painted.
                        const boxHalfW = Math.max(avatarPx, plateW) / 2 + 2;
                        // The villain bubble is pinned to the seat's right edge and
                        // hangs `bubbleOverhang` past it; it is also capped at the
                        // nameplate width so a long action string can never widen
                        // the seat's footprint. Hero has no bubble, but his hole
                        // cards hang off the RIGHT of his nameplate instead.
                        const bubbleOverhang = isHero ? 0 : ui(6);
                        const rightExtent = isHero
                            ? (boxHalfW + heroCardW * 1.7)
                            : (boxHalfW + ui(8));
                        const leftExtent = boxHalfW + bubbleOverhang;
                        const topExtent = (boxH / 2) + (isHero ? 0 : bubbleH);
                        const railPx = ui(15) + 10;
                        const pctY = (px) => (px / Math.max(1, feltBox.h)) * 100;
                        const pctX = (px) => (px / Math.max(1, feltBox.w)) * 100;
                        seatY = Math.min(
                            Math.max(seatY, pctY(railPx + topExtent)),
                            100 - pctY(railPx + boxH / 2)
                        );
                        seatX = Math.min(
                            Math.max(seatX, pctX(railPx + leftExtent)),
                            100 - pctX(railPx + rightExtent)
                        );

                        // The strongest single cue on the felt is whose turn it
                        // is. In the trainer that is hero, until he has acted.
                        const isActiveSeat = isHero && !showFeedback;
                        const rimShadow = '0 0 0 2px rgba(255,199,84,0.85), 0 0 16px 3px rgba(255,178,44,0.45), inset 0 2px 6px rgba(0,0,0,0.55)';
                        const seatLabel = isHero
                            ? (playerName || 'HERO')
                            : (index === villainSeatIndex ? (villainPosition || seat.name) : (seat.name || 'Villain'));

                        return (
                            <motion.div
                                key={seat.id}
                                initial={reduceMotion ? false : { opacity: 0, scale: 0.86 }}
                                animate={{ opacity: villainFolded ? 0.42 : 1, scale: 1 }}
                                transition={{ delay: reduceMotion ? 0 : index * 0.04, duration: 0.28 }}
                                style={{
                                    ...styles.seat,
                                    ...m.seat,
                                    left: `${seatX}%`,
                                    top: `${seatY}%`,
                                    x: '-50%',
                                    y: '-50%',
                                }}
                            >
                                {/* CIRCULAR AVATAR — gold rim-light plus outer
                                    glow when this seat is the one to act. */}
                                <motion.div
                                    initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ duration: 0.26, delay: reduceMotion ? 0 : 0.06 }}
                                    style={{
                                        width: avatarPx,
                                        height: avatarPx,
                                        borderRadius: '50%',
                                        overflow: 'hidden',
                                        position: 'relative',
                                        zIndex: 2,
                                        flexShrink: 0,
                                        background: 'radial-gradient(circle at 50% 22%, #24304a 0%, #121a2c 68%, #070b14 100%)',
                                        border: `${Math.max(1.5, ui(2))}px solid ${isActiveSeat ? '#ffc754' : 'rgba(214,163,42,0.55)'}`,
                                        boxShadow: isActiveSeat
                                            ? rimShadow
                                            : 'inset 0 2px 6px rgba(0,0,0,0.55), 0 6px 14px rgba(0,0,0,0.6)',
                                        animation: (isActiveSeat && !reduceMotion)
                                            ? 'sp-seat-rim 2.4s ease-in-out infinite'
                                            : 'none',
                                        filter: villainFolded ? 'grayscale(100%) brightness(0.5)' : 'none',
                                    }}
                                >
                                    {/* seatAvatars is HERO-RELATIVE like every
                                        other seat table here: entry 0 is hero and
                                        1..8 run clockwise from him. `index` is an
                                        ABSOLUTE seat index, so it has to be
                                        rotated -- unrotated, a hero sitting
                                        anywhere but absolute 0 wrapped two
                                        villains onto the same character. Hero is
                                        read straight off heroAvatar rather than
                                        through the rotation, so his own face is
                                        never at the mercy of the deal. */}
                                    <SeatAvatar
                                        src={isHero
                                            ? heroAvatar
                                            : seatAvatars[seatRel]}
                                        label={seatLabel}
                                        fontSize={Math.max(12, Math.round(avatarPx * 0.42))}
                                    />
                                </motion.div>

                                {/* NAMEPLATE — name on one line, stack on the next.
                                    Anchor for hero's hole cards, which hang off
                                    its right edge and overlap it slightly. */}
                                <motion.div
                                    initial={reduceMotion ? false : { y: 8, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ duration: 0.26, delay: reduceMotion ? 0 : 0.12 }}
                                    style={{
                                        position: 'relative',
                                        zIndex: 3,
                                        boxSizing: 'border-box',
                                        marginTop: -ui(8),
                                        minWidth: plateW,
                                        maxWidth: plateW,
                                        padding: `${ui(3)}px ${ui(9)}px ${ui(4)}px`,
                                        borderRadius: ui(8),
                                        textAlign: 'center',
                                        lineHeight: 1.18,
                                        background: 'linear-gradient(180deg, rgba(20,20,23,0.97) 0%, rgba(6,6,8,0.98) 100%)',
                                        border: `1px solid ${isActiveSeat ? 'rgba(255,199,84,0.95)' : 'rgba(214,163,42,0.75)'}`,
                                        boxShadow: isActiveSeat
                                            ? '0 5px 12px rgba(0,0,0,0.6), 0 0 16px rgba(255,199,84,0.45), inset 0 1px 0 rgba(255,255,255,0.06)'
                                            : '0 5px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
                                    }}
                                >
                                    <div style={{
                                        fontSize: Math.max(9, ui(11)),
                                        fontWeight: 800,
                                        letterSpacing: 0.4,
                                        textTransform: 'uppercase',
                                        color: '#ffffff',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {seatLabel}
                                    </div>
                                    <div style={{
                                        fontSize: Math.max(9, ui(11)),
                                        fontWeight: 800,
                                        fontVariantNumeric: 'tabular-nums',
                                        color: isActiveSeat ? '#ffd67a' : '#e2af3a',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {stackSize} bb
                                    </div>

                                    {/* HERO HOLE CARDS — immediately to the RIGHT
                                        of the nameplate, overlapping it, angled and
                                        larger than villain cards. They used to sit
                                        stacked underneath, which pushed the cluster
                                        off the bottom of the felt.
                                        ACTIVE_HAND_GLOW_LAW: active hands pulse a
                                        golden halo. */}
                                    {isHero && heroCards.length > 0 && (
                                        <div style={{
                                            position: 'absolute',
                                            left: '100%',
                                            bottom: -ui(3),
                                            // #48 / Dan's note "cards need to be
                                            // next to the hero box, not above
                                            // it": they were already beside it,
                                            // but a 13px pull-back plus the -9deg
                                            // rake put the first card on top of
                                            // the name and the stack line. A 3px
                                            // tuck still reads as one cluster
                                            // without covering either number.
                                            marginLeft: -ui(3),
                                            display: 'flex',
                                            // #48 follow-up, measured on production
                                            // at 375px: hero's own hole cards were
                                            // rendering 8px and 7px wide against an
                                            // intended ui(46)=27px. An absolutely
                                            // positioned box at left:100% has a
                                            // shrink-to-fit width whose available
                                            // space is ZERO -- the containing block
                                            // ends exactly where the box begins --
                                            // so the default flex-shrink:1 crushed
                                            // both cards to their minimum. The two
                                            // most important cards on the screen
                                            // were slivers. width:max-content sizes
                                            // the row to its content instead of to
                                            // the (nonexistent) space beside the
                                            // nameplate, and flexShrink:0 on each
                                            // image stops the crush even if some
                                            // future ancestor constrains it again.
                                            width: 'max-content',
                                            alignItems: 'flex-end',
                                            zIndex: 6,
                                            borderRadius: ui(6),
                                            pointerEvents: 'none',
                                            animation: reduceMotion ? 'none' : 'pulse-glow 2s ease-in-out infinite',
                                        }}>
                                            {heroCards[0] && (
                                                <motion.img
                                                    key={`hero-seat-0-${questionNumber}`}
                                                    src={getCardPath(heroCards[0])}
                                                    alt={heroCards[0]}
                                                    initial={reduceMotion ? false : { x: -ui(34), y: -ui(26), rotate: -34, opacity: 0, scale: 0.72 }}
                                                    animate={{ x: 0, y: 0, rotate: -9, opacity: 1, scale: 1 }}
                                                    transition={{ delay: reduceMotion ? 0 : 0.04, duration: 0.26, type: 'spring', stiffness: 240, damping: 22 }}
                                                    style={{
                                                        width: heroCardW,
                                                        height: heroCardH,
                                                        flexShrink: 0,
                                                        borderRadius: ui(5),
                                                        transformOrigin: 'bottom center',
                                                        boxShadow: '0 10px 22px rgba(0,0,0,0.8)',
                                                        border: '1px solid rgba(255,255,255,0.55)',
                                                    }}
                                                />
                                            )}
                                            {heroCards[1] && (
                                                <motion.img
                                                    key={`hero-seat-1-${questionNumber}`}
                                                    src={getCardPath(heroCards[1])}
                                                    alt={heroCards[1]}
                                                    initial={reduceMotion ? false : { x: -ui(34), y: -ui(26), rotate: -34, opacity: 0, scale: 0.72 }}
                                                    animate={{ x: 0, y: 0, rotate: 8, opacity: 1, scale: 1 }}
                                                    transition={{ delay: reduceMotion ? 0 : 0.14, duration: 0.26, type: 'spring', stiffness: 240, damping: 22 }}
                                                    style={{
                                                        width: heroCardW,
                                                        height: heroCardH,
                                                        flexShrink: 0,
                                                        marginLeft: -ui(14),
                                                        borderRadius: ui(5),
                                                        transformOrigin: 'bottom center',
                                                        boxShadow: '0 10px 22px rgba(0,0,0,0.8)',
                                                        border: '1px solid rgba(255,255,255,0.55)',
                                                    }}
                                                />
                                            )}
                                        </div>
                                    )}

                                    {/* Dealer Button — rendered at table level per
                                        DEALER_BUTTON_AND_CHIP_POSITIONS_LAW.md */}

                                </motion.div>

                                    {/* Villain: face-down cards, centered under the
                                        plate. ACTIVE_HAND_GLOW_LAW: active hands
                                        pulse a golden halo; folded hands stay
                                        visible but grey out. */}
                                    {!isHero && (
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'center',
                                            gap: ui(2),
                                            marginTop: ui(3),
                                            zIndex: 1,
                                            borderRadius: ui(5),
                                            ...(villainFolded
                                                ? { filter: 'grayscale(100%) brightness(0.5)', opacity: 0.6 }
                                                : { animation: reduceMotion ? 'none' : 'pulse-glow 2s ease-in-out infinite' }),
                                        }}>
                                            {[0, 1].map((ci) => (
                                                <motion.div
                                                    key={`vc-${ci}`}
                                                    initial={reduceMotion ? false : { y: -ui(18), rotate: ci ? 14 : -14, opacity: 0 }}
                                                    animate={{ y: 0, rotate: 0, opacity: 1 }}
                                                    transition={{ delay: reduceMotion ? 0 : 0.06 + ci * 0.06, duration: 0.24 }}
                                                    style={{
                                                        width: vilCardW, height: vilCardH, borderRadius: ui(4),
                                                        background: 'linear-gradient(135deg, #7d0f14 0%, #b02a2a 50%, #7d0f14 100%)',
                                                        border: `1px solid rgba(255,199,84,0.75)`,
                                                        boxShadow: '0 3px 8px rgba(0,0,0,0.6)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}
                                                >
                                                    <div style={{
                                                        width: vilCardW * 0.56, height: vilCardH * 0.68, borderRadius: 2,
                                                        border: '1px solid rgba(255,199,84,0.35)',
                                                        background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,199,84,0.12) 3px, rgba(255,199,84,0.12) 6px)',
                                                    }} />
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Villain action bubble — pinned to the seat's
                                        own upper-right corner so it can never travel
                                        off the felt and over the HUD header. */}
                                    {villainSeatAction && villainSeatAction.action && (
                                        <motion.div
                                            initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.9 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            transition={{ duration: 0.22, delay: reduceMotion ? 0 : 0.18 }}
                                            style={{
                                                ...styles.villainActionBubble,
                                                top: -bubbleH,
                                                right: -bubbleOverhang,
                                                left: 'auto',
                                                padding: `${ui(3)}px ${ui(7)}px`,
                                                fontSize: Math.max(9, ui(11)),
                                                minWidth: ui(54),
                                                maxWidth: plateW + ui(14),
                                                boxSizing: 'border-box',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                borderRadius: ui(9),
                                            }}
                                        >
                                            {villainSeatAction.action}{(villainSeatAction.amount ?? villainSeatAction.size) ? ` ${villainSeatAction.amount ?? villainSeatAction.size}` : ''}
                                            <div style={{
                                                ...styles.speechTail,
                                                bottom: -ui(7),
                                                borderLeft: `${ui(7)}px solid transparent`,
                                                borderRight: `${ui(7)}px solid transparent`,
                                                borderTop: `${ui(7)}px solid #dc2626`,
                                            }} />
                                        </motion.div>
                                    )}
                                </motion.div>
                        );
                    })}
                </div>


                {/* DEALER BUTTON — positions per DEALER_BUTTON_AND_CHIP_POSITIONS_LAW.md */}
                {(() => {
                    if (dealerButtonSeatIndex < 0) return null; // seat unknown: draw nothing
                    const keys = DEALER_BUTTON_SEAT_KEYS[playerCount] || DEALER_BUTTON_SEAT_KEYS[9];
                    // keys is HERO-RELATIVE (index 0 is hero, 1 is the seat to
                    // hero's left, ...) while dealerButtonSeatIndex is an ABSOLUTE
                    // index into `seats`. Indexing one with the other only agreed
                    // when hero happened to sit at absolute 0. Rotate first.
                    const btnRel = ((dealerButtonSeatIndex - heroSeatIndex) % playerCount + playerCount) % playerCount;
                    const lawKey = keys[btnRel];
                    if (!lawKey) return null;
                    const btnPos = DEALER_BUTTON_POSITIONS[lawKey] || DEALER_BUTTON_POSITIONS.hero;
                    return (
                        <div style={{
                            ...styles.dealerButton,
                            top: `${btnPos.top}%`,
                            left: `${btnPos.left}%`,
                            width: ui(22),
                            height: ui(22),
                            fontSize: Math.max(8, ui(11)),
                        }}>
                            D
                        </div>
                    );
                })()}

                {/* BET CHIPS - positions per DEALER_BUTTON_AND_CHIP_POSITIONS_LAW.md.
                    CHIP_STACK_LAW requires a chip stack wherever a seat has money
                    in front of it. Before this the felt showed a pot total but never
                    the per-seat bets that produced it, so a villain "raises 3bb" had
                    no representation on the table at all. */}
                {(() => {
                    const keys = DEALER_BUTTON_SEAT_KEYS[playerCount] || DEALER_BUTTON_SEAT_KEYS[9];
                    const isPreflopStreet = streetLabel === 'PREFLOP';

                    // committedFor() is the SAME function the POT pill sums over
                    // (potMath.js). The chips in front of the seats and the number
                    // in the middle are one calculation, so they cannot disagree.
                    return seats.map((seat, index) => {
                        const amount = committedFor(seat, actionHistory, isPreflopStreet);
                        if (!amount || amount <= 0) return null;
                        // Only seats actually shown on the felt get chips.
                        const isHeroSeat = index === heroSeatIndex;
                        // Same alias-aware match as the seat block above --
                        // a chip must not be hidden (or shown) by a name the
                        // ring spells differently than the history does.
                        const shown = isHeroSeat
                            || index === villainSeatIndex
                            || actionHistory.some(
                                (a) => positionSeatIndex(a?.position, playerCount) === index
                            );
                        if (!shown) return null;
                        // Same absolute-vs-hero-relative mismatch as the dealer
                        // button: `index` walks `seats` from absolute 0, `keys` is
                        // measured from hero. Unrotated, a hero posting the big
                        // blind drew his chips in a villain's chip slot.
                        const chipRel = ((index - heroSeatIndex) % playerCount + playerCount) % playerCount;
                        const chipKey = keys[chipRel];
                        if (!chipKey) return null;
                        const pos = CHIP_STACK_POSITIONS[chipKey];
                        if (!pos) return null;
                        // Chips travel from the seat they were bet from toward
                        // the pot and settle in their law-defined slot. Keyed on
                        // the amount so a NEW bet re-runs the slide and an
                        // unchanged one does not.
                        // Travel from where the seat is DRAWN, which is its
                        // hero-relative ring slot, not from its position's
                        // coordinates -- otherwise the chips fly in from an
                        // empty patch of felt whenever hero is not on the button.
                        const ringSeat = seats[chipRel] || seat;
                        const srcTop = isHeroSeat ? 84 : ringSeat.y;
                        const srcLeft = ringSeat.x;
                        return (
                            <motion.div
                                key={`chip-${index}-${amount}`}
                                initial={reduceMotion
                                    ? false
                                    : { top: `${srcTop}%`, left: `${srcLeft}%`, opacity: 0, scale: 0.55 }}
                                animate={{ top: `${pos.top}%`, left: `${pos.left}%`, opacity: 1, scale: 1 }}
                                transition={{ duration: reduceMotion ? 0 : 0.34, ease: [0.22, 0.9, 0.3, 1] }}
                                style={{
                                    ...styles.chipStack,
                                    top: `${pos.top}%`,
                                    left: `${pos.left}%`,
                                    gap: ui(4),
                                    padding: `${ui(2)}px ${ui(7)}px ${ui(2)}px ${ui(3)}px`,
                                    borderRadius: ui(10),
                                }}
                            >
                                <span style={{ ...styles.chipDisc, width: ui(13), height: ui(13) }} />
                                <span style={{ ...styles.chipAmount, fontSize: Math.max(8, ui(11)) }}>{amount}</span>
                            </motion.div>
                        );
                    });
                })()}

                {/* BOARD CARDS — Multi-street-aware dealing animation */}
                {visibleBoard.length > 0 && (
                    <div style={{...styles.boardCards, ...m.boardCards}}>
                        {(() => {
                            // Stable per-hand key: multi-street streets share the same
                            // questionNumber (see the reset effect), so existing street
                            // cards keep their identity and never re-deal mid-hand.
                            const handKey = isMultiStreetActive
                                ? `ms-${questionNumber}`
                                : (question?.id || question?.scenario?.id || `q-${questionNumber}`);
                            // Synchronous previous-board length (per question) — a card is
                            // "new" when the board grew past the previous street's length.
                            const prevBoardLen = prevBoardLenRef.current.qn === questionNumber
                                ? prevBoardLenRef.current.len
                                : 0;
                            return visibleBoard.map((card, i) => {
                            const isNewStreetCard = isMultiStreetActive && prevBoardLen > 0 && i >= prevBoardLen;
                            const isExistingCard = isMultiStreetActive && prevBoardLen > 0 && i < prevBoardLen;

                            return (
                                <motion.div
                                    key={`${handKey}-${card}-${i}`}
                                    initial={(isExistingCard || reduceMotion)
                                        ? { y: 0, rotateY: 0, scale: 1, opacity: 1 } // Existing cards: no re-animation
                                        : isNewStreetCard
                                            ? { y: -70, rotateY: 180, scale: 0.5, opacity: 0 } // New street card
                                            : { y: -52, rotateY: 180, scale: 0.65, opacity: 0 } // Initial deal
                                    }
                                    animate={{ y: 0, rotateY: 0, scale: 1, opacity: 1 }}
                                    transition={(isExistingCard || reduceMotion)
                                        ? { duration: 0 } // Instant — no animation for existing cards
                                        : isNewStreetCard
                                            ? { delay: 0.06, duration: 0.34, type: 'spring', stiffness: 220, damping: 20 }
                                            // Whole flop is on the felt inside 250ms of stagger.
                                            : { delay: i * 0.06, duration: 0.3, type: 'spring', stiffness: 220, damping: 20 }
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
                                            width: ui(50),
                                            height: ui(70),
                                            borderRadius: ui(6),
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
                                                background: 'var(--sp-accent-orange)', boxShadow: '0 0 6px #fb923c',
                                            }}
                                        />
                                    )}
                                </motion.div>
                            );
                            });
                        })()}

                        {/* DEALING THE NEXT STREET — a face-down slot where the
                            card is about to land. See the showDealing note. */}
                        {showDealing && isMultiStreetActive && visibleBoard.length >= 3 && visibleBoard.length < 5 && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: [0.45, 0.9, 0.45], scale: 1 }}
                                transition={reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                                style={{
                                    width: ui(50),
                                    height: ui(70),
                                    borderRadius: ui(6),
                                    flexShrink: 0,
                                    background: 'linear-gradient(180deg, rgba(9,45,34,0.9) 0%, rgba(5,26,20,0.95) 100%)',
                                    border: '1px dashed rgba(251, 146, 60, 0.55)',
                                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
                                }}
                            />
                        )}

                        {/* Street separator line between flop and turn/river.
                            The denominator counts the dealing placeholder too --
                            it is a flex child, so it widens the row, and leaving
                            it out slid the separator off the flop/turn boundary
                            for the whole time the next card was in flight. */}
                        {isMultiStreetActive && visibleBoard.length > 3 && (
                            <div style={{
                                position: 'absolute',
                                left: `${(3 / (visibleBoard.length + ((showDealing && visibleBoard.length < 5) ? 1 : 0))) * 100}%`,
                                top: '10%', height: '80%', width: 1,
                                background: 'rgba(251, 146, 60, 0.3)',
                                pointerEvents: 'none',
                            }} />
                        )}
                    </div>
                )}

                {/* PREFLOP: Deck placeholder when no board cards */}
                {visibleBoard.length === 0 && (
                    <div style={{...styles.boardCards, ...m.boardCards}}>
                        <motion.div
                            animate={{ opacity: [0.3, 0.5, 0.3] }}
                            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                            style={{ display: 'flex', gap: 2 }}
                        >
                            {[0, 1, 2].map(i => (
                                <div key={i} style={{
                                    width: ui(50), height: ui(70), borderRadius: ui(6),
                                    background: 'linear-gradient(180deg, rgba(9,45,34,0.85) 0%, rgba(5,26,20,0.9) 100%)',
                                    border: '1px solid rgba(0,212,255,0.10)',
                                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
                                }} />
                            ))}
                        </motion.div>
                    </div>
                )}

                {/* POT DISPLAY — Clean centered display (GAP 5).
                    Preflop scenarios without an explicit pot default to the blinds (1.5bb). */}
                {displayPot > 0 && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{
                            ...styles.pot,
                            ...m.pot,
                            top: `${potPlacement.topPct}%`,
                            x: '-50%',
                            // #48 follow-up: below the board the percentage names
                            // the pill's TOP edge, so it is nudged down by a fixed
                            // gap instead of pulled up by half its own height.
                            y: potPlacement.belowBoard ? ui(8) : '-50%',
                            padding: `${ui(4)}px ${ui(12)}px ${ui(5)}px`,
                            borderRadius: ui(11),
                            background: 'linear-gradient(180deg, rgba(6,11,22,0.82) 0%, rgba(3,6,14,0.88) 100%)',
                            border: '1px solid rgba(0,212,255,0.22)',
                            boxShadow: '0 6px 16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)',
                            gap: ui(2),
                        }}
                    >
                        <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: ui(6),
                            fontSize: Math.max(11, ui(15)),
                            fontWeight: 800,
                            color: 'var(--sp-fg)',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            <span style={{
                                width: ui(14),
                                height: ui(14),
                                borderRadius: '50%',
                                background: 'radial-gradient(circle at 34% 28%, #eaf7ff 0%, #7fd6ef 45%, #1c7f9c 100%)',
                                border: '1px solid rgba(0,0,0,0.5)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.6)',
                                flexShrink: 0,
                            }} />
                            <span style={{ fontSize: Math.max(8, ui(10)), fontWeight: 800, letterSpacing: 1.1, color: 'rgba(255,255,255,0.72)' }}>POT</span>
                            {displayPot}
                            <span style={{ fontSize: Math.max(7, ui(9)), fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginLeft: -ui(3) }}>BB</span>
                        </span>
                        {/* SPR + Pot Odds */}
                        <div style={styles.potOverlayRow}>
                            {spr && <span style={styles.potOverlayBadge}>SPR: {spr}</span>}
                            {potOdds && <span style={styles.potOverlayBadge}>Odds: {potOdds}%</span>}
                        </div>
                    </motion.div>
                )}
                </div> {/* END basicTable */}

                {/* ═══ FELT CORNER RAIL ═══════════════════════════════════
                    The template hangs two things off the bottom corners of the
                    table, OUTSIDE the oval: the countdown at the lower left and
                    the "Question N of M" pill at the lower right. This rail is
                    centred like the table and a little wider than it, so on a
                    desktop the pair sit in the gutter beside the oval and on a
                    phone they tuck into the oval's bottom corners -- which the
                    rounded rail leaves empty at every size. Both clear hero's
                    cluster: hero owns the middle of the bottom edge. */}
                <div style={styles.feltCornerRail}>
                    <div style={{
                        ...styles.feltCornerRailInner,
                        width: isMobile ? '100%' : '96%',
                    }}>
                        <div style={{ ...styles.countdownSlot, bottom: isMobile ? 1 : 10 }}>
                            <CountdownTimer
                                seconds={trainerConfig?.timerSeconds || 30}
                                questionNumber={questionNumber}
                                // One decision = one clock. See decisionKey.
                                resetKey={decisionKey}
                                showFeedback={showFeedback}
                                active={trainerConfig?.timerEnabled || false}
                                variant="plate"
                                compact={isMobile}
                                onTimeExpired={() => {
                                    // Expiry takes the real passive action -- fold facing a
                                    // bet, check when checking is free -- graded with the
                                    // classification the solver gives THAT action, and the
                                    // feedback banner says TIME so it is never passed off
                                    // as the player's pick. The old handler fell back to
                                    // opts[0], i.e. it silently graded the FIRST option the
                                    // player never chose. It also called onAnswer directly,
                                    // skipping the grouped-difficulty resolution and the
                                    // double-answer latch; routing through
                                    // handleAnswerWithGrouping closes the race where a
                                    // click lands in the same tick as the clock hitting 0
                                    // (this callback fires from setTimeout(0) with a stale
                                    // closure -- only answerSubmittedRef is current here).
                                    if (answerSubmittedRef.current || showFeedback || selectedAnswer) return;
                                    const opts = displayOptions || [];
                                    const pick = (re) => opts.find(o => re.test(o.text || o.label || ''));
                                    const autoOpt = pick(/fold/i) || pick(/check/i);
                                    if (autoOpt) {
                                        setTimeExpired(/fold/i.test(autoOpt.text || autoOpt.label || '') ? 'fold' : 'check');
                                        handleAnswerWithGrouping(autoOpt.id || autoOpt, { timedOut: true });
                                        SoundEngine.play('wrong');
                                    } else {
                                        // No passive action exists (not a spot the engines
                                        // produce). Mark the expiry visibly and leave the
                                        // decision unanswered rather than invent a pick.
                                        setTimeExpired('none');
                                    }
                                }}
                            />
                        </div>
                        {timeExpired === 'none' && !showFeedback && !selectedAnswer && (
                            <div style={{
                                position: 'absolute', bottom: isMobile ? 1 : 10, left: 0,
                                padding: '4px 9px', borderRadius: 8,
                                fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
                                color: 'var(--sp-accent-red)',
                                border: '1px solid rgba(239,68,68,0.45)',
                                background: 'rgba(20,10,10,0.92)',
                            }}>
                                TIME EXPIRED
                            </div>
                        )}
                        <div style={{ ...styles.questionOfPill, bottom: isMobile ? 3 : 16 }}>
                            Question {questionNumber} of {totalQuestions}
                        </div>
                    </div>
                </div>

                {/* Street indicator removed — already shown in header */}
            </div>

            {/* Hand Strength indicator — hidden when hero cards are giant */}
            {/* (Removed to prevent collision with the large hero focal cards) */}

            {/* SESSION STATS HUD — Score, EV Loss, Mistakes + Difficulty Bar */}
            <div style={styles.statsHUD}>
                <div style={styles.statsHUDItem}>
                    <span style={styles.statsHUDLabel}>EV Loss</span>
                    <span style={{ ...styles.statsHUDValue, color: totalSessionEVLoss > 0 ? 'var(--sp-accent-red)' : 'var(--sp-accent-green)' }}>
                        {totalSessionEVLoss > 0 ? `-${totalSessionEVLoss.toFixed(1)}` : '0.0'} BB
                    </span>
                </div>
                <div style={styles.statsHUDItem}>
                    <span style={styles.statsHUDLabel}>Mistakes</span>
                    <span style={{ ...styles.statsHUDValue, color: sessionMistakes > 0 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-green)' }}>
                        {sessionMistakes}
                    </span>
                </div>
                <div style={styles.statsHUDItem}>
                    <span style={styles.statsHUDLabel}>Streak</span>
                    <span style={{ ...styles.statsHUDValue, color: streak >= 3 ? 'var(--sp-accent-orange)' : 'var(--sp-fg-muted)' }}>
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
                                        background: difficultyLevel <= 3 ? 'var(--sp-accent-green)'
                                            : difficultyLevel <= 6 ? 'var(--sp-accent-amber)'
                                                : difficultyLevel <= 8 ? 'var(--sp-accent-orange)' : 'var(--sp-accent-red)',
                                    }}
                                />
                            </div>
                            <span style={{
                                fontSize: 9, fontWeight: 700, fontFamily: "'Inter', monospace",
                                color: difficultyLevel <= 3 ? 'var(--sp-accent-green)'
                                    : difficultyLevel <= 6 ? 'var(--sp-accent-amber)'
                                        : difficultyLevel <= 8 ? 'var(--sp-accent-orange)' : 'var(--sp-accent-red)',
                            }}>
                                {difficultyLevel}
                            </span>
                            {/* Phase 50: Difficulty labels */}
                            <span style={{ fontSize: 7, color: 'var(--sp-fg-dim)', marginLeft: 1 }}>
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
                                fontWeight: 900, color: 'var(--sp-accent-amber)', letterSpacing: 2,
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
                                color: 'var(--sp-accent-cyan)', letterSpacing: 1,
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
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-accent-cyan)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}> Hint</div>
                            <div style={{ fontSize: 10, color: 'var(--sp-fg-muted)', lineHeight: 1.4 }}>{hints[0]}</div>
                        </div>
                    );
                } catch (_) { return null; }
            })()}

            {/* ACTION BUTTONS — GTO Wizard-style poker action bar (F2: Dynamic sizing + F9: Keyboard hints) */}
            <div style={{
                ...styles.actionBar,
                position: 'relative',
                // The template lays four actions out as a 2x2 GRID, not a single
                // row of four thin slivers. Two columns up to four options;
                // beyond that a third column, because a 2-wide grid of nine
                // buttons would push the felt off a phone screen.
                gridTemplateColumns: `repeat(${Math.min(displayOptions.length, 9) > 4 ? 3 : 2}, minmax(0, 1fr))`,
            }}>
                {/* YOUR ACTION turn indicator */}
                {!showFeedback && (
                    <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                        style={{
                            // #48: inside the bar's reserved top padding, not
                            // hanging over the element above it.
                            position: 'absolute', top: 3, left: '50%',
                            x: '-50%',
                            fontSize: 10, fontWeight: 800, letterSpacing: 2,
                            color: 'var(--sp-accent-cyan)', textTransform: 'uppercase',
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
                            background: rngTheme.soft,
                            border: `1px solid ${rngTheme.strong}`,
                            borderRadius: 12, padding: '4px 12px',
                            zIndex: 10,
                        }}
                    >
                        <span style={{ fontSize: 16, color: rngTheme.fg }}>◆</span>
                        <span style={{
                            fontSize: 20, fontWeight: 900,
                            color: rngTheme.fg, fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            textShadow: `0 0 10px ${rngTheme.glow}`,
                        }}>
                            {rngRoll}
                        </span>
                        <span style={{
                            fontSize: 8, fontWeight: 800, letterSpacing: 1,
                            color: rngTheme.fg, opacity: 0.85,
                        }}>
                            {rngTheme.label}
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
                            fontSize: 12, fontWeight: 800, color: rngTheme.fg,
                            background: rngTheme.soft,
                            border: `1px solid ${rngTheme.hairline}`,
                            padding: '2px 10px', borderRadius: 8,
                        }}>
                            ◆ {rngRoll} {rngTheme.label}
                        </span>
                        {/* Fix 16: ranges come from the shared rngRanges memo.
                            #38: the winning band is the one the grader used, so it
                            is read off rngTargetAction rather than re-derived here —
                            two independent lookups is how the chip and the banner
                            came to disagree in the first place. */}
                        {rngRanges.map(r => {
                            const isTarget = rngTargetAction ? r.id === rngTargetAction.id : (rngRoll >= r.start && rngRoll <= r.end);
                            return (
                                <span key={r.id} style={{
                                    fontSize: 9, fontWeight: 700,
                                    color: isTarget ? 'var(--sp-accent-green)' : 'var(--sp-fg-muted)',
                                    background: isTarget ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${isTarget ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                    padding: '2px 6px', borderRadius: 6,
                                }}>
                                    {r.text.toUpperCase()} ({r.start}-{r.end})
                                </span>
                            );
                        })}
                    </motion.div>
                )}
                {/* The countdown moved out of the action bar and onto the felt's
                    lower-left corner, where the template puts it. */}
                {/* The floating "Quit" chip that used to be pinned over the
                    top-left corner of the viewport is gone: it sat on top of the
                    felt, and the template gives the exit a proper home as the
                    "Back to Training" pill in the top bar. Same onExit. */}
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

                    // TRAIN-WIRE-UDT-ACTIONBTN-1: precomputed slots fed into shared ActionButton
                    const betMatch = text.match(/(\d+\.?\d*)\s*(bb|BB)/i);
                    const betSizeNum = betMatch ? parseFloat(betMatch[1]) : null;
                    const evRaw = (showFeedback && fq?.evData?.actionEVs)
                        ? (fq.evData.actionEVs[optionId] ?? fq.evData.actionEVs[optionId?.toLowerCase()])
                        : null;
                    const evNum = typeof evRaw === 'number' ? evRaw : null;
                    const sizeKey = isVeryCompact ? 'veryCompact' : (isCompact ? 'compact' : 'md');
                    const shortcutChip = (!showFeedback && shortcutKey <= 9) ? (
                        <span style={{
                            fontSize: isCompact ? 7 : 8,
                            color: 'rgba(255,255,255,0.55)',
                            fontWeight: 'bold',
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 3,
                            padding: '0 3px',
                            lineHeight: '14px',
                            minWidth: 12,
                            display: 'inline-block',
                            textAlign: 'center',
                            border: '1px solid rgba(255,255,255,0.08)',
                        }}>
                            {shortcutKey}
                        </span>
                    ) : null;
                    const evChip = evNum !== null ? (
                        <motion.span
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.5 }}
                            style={{
                                fontSize: isCompact ? 7 : 8,
                                fontWeight: 800,
                                fontFamily: "'Inter', monospace",
                                color: evNum >= 0 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                                letterSpacing: 0.3,
                            }}
                        >
                            {evNum >= 0 ? '+' : ''}{evNum.toFixed(2)}
                        </motion.span>
                    ) : null;

                    return (
                        <div key={optionId} style={styles.actionButtonWrapper}>
                            <ActionButton
                                // `action` was hardcoded "fold", so every
                                // button in the arena's action bar carried
                                // data-action="fold" -- Raise, Call and Check
                                // included. The visible styling hid it (the
                                // style prop below overrides the theme), but
                                // the semantic attribute was wrong on every
                                // non-fold button, and anything keying on it
                                // (tests, analytics, assistive tooling walking
                                // data- attributes) read a table where the only
                                // available action was folding. detectActionType
                                // speaks a finer vocabulary than ActionButton
                                // (betsmall/betlarge/betpot/overbet vs 'bet'),
                                // hence the explicit collapse rather than a
                                // pass-through -- an unmapped value would fall
                                // back to the fold THEME and reintroduce the
                                // bug one level down.
                                action={{
                                    fold: 'fold', check: 'check', call: 'call',
                                    allin: 'allin', raise: 'raise',
                                    overbet: 'bet', betpot: 'bet',
                                    betlarge: 'bet', betsmall: 'bet',
                                }[actionType] || 'bet'}
                                size={sizeKey}
                                label={text}
                                onClick={() => handleAnswerWithGrouping(optionId)}
                                disabled={showFeedback}
                                fullWidth
                                topLeftSlot={shortcutChip}
                                topRightSlot={evChip}
                                style={{
                                    ...getActionButtonStyle(option, index),
                                    ...(isCompact ? { padding: '8px 4px', minHeight: 52 } : {}),
                                    ...(isVeryCompact ? { padding: '6px 2px', minHeight: 44, borderRadius: 6 } : {}),
                                }}
                            >
                                {betSizeNum !== null ? (
                                    <div style={{
                                        display: 'block',
                                        fontSize: isCompact ? 12 : 16,
                                        fontWeight: '900',
                                        color: '#ffffff',
                                        marginTop: 2,
                                    }}>
                                        {betSizeNum} BB
                                    </div>
                                ) : null}
                                {(showFeedback || (studyMode && computedFrequencies)) ? (
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
                                ) : null}
                            </ActionButton>
                            {/* Frequency bar under button */}
                            <FrequencyBar
                                frequency={freq}
                                color={ACTION_COLORS[actionType]?.border || 'var(--sp-fg-dim)'}
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
                            color: activeMode === mode.id ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                            borderTop: activeMode === mode.id ? '2px solid #00d4ff' : '2px solid transparent',
                            background: activeMode === mode.id ? 'rgba(0,212,255,0.06)' : 'transparent',
                        }}
                    >
                        <span style={{ fontSize: 16 }}>{mode.icon}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>{mode.label}</span>
                    </button>
                ))}
            </div>

            {/* F4: mode panels — single AnimatePresence wrapper so their
                exit={{...}} props actually animate on unmount */}
            <AnimatePresence>
            {/* F4: RANGE MODE — Show range grid when mode is active */}
            {/* GTOW parity #36: no `!showFeedback` gate. The info panel is most
                useful immediately after you act. */}
            {activeMode === 'range' && (() => {
                try {
                    return (
                        <InfoPanelShell
                            key="mode-panel-range"
                            panelKey="mode-panel-range"
                            title="Range"
                            poppedOut={panelPoppedOut}
                            canPop={!isMobile}
                            onTogglePop={togglePanelPopOut}
                            padding="8px 12px"
                        >
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-fg-dim)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4, textAlign: 'center' }}>
                                Range Matrix {heroCards?.length === 2 && <span style={{ color: 'var(--sp-accent-cyan)' }}>• {heroCards.join('')}</span>}
                            </div>
                            {/* GTOW parity #35: this used to build
                                `{ [actionId]: freq }` from computedFrequencies —
                                a flat, action-keyed object. RangeGrid indexes
                                its gridData by HAND notation, so every one of
                                the 169 cells came back undefined and the matrix
                                rendered blank. The real per-hand matrix is the
                                solver's rawFrequencies; buildRangeGridData owns
                                the transpose for the whole app. */}
                            {rangeModeGrid ? (
                                <RangeGrid
                                    gridData={rangeModeGrid.gridData}
                                    actions={rangeModeGrid.actions}
                                    cellSize={18}
                                    heroHand={rangeModeGrid.heroHand}
                                    compact={true}
                                    handEVs={rangeModeGrid.handEVs}
                                    showEVOverlay={Boolean(rangeModeGrid.handEVs)}
                                    classificationData={rangeClassification}
                                />
                            ) : (
                                <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)', textAlign: 'center', padding: '12px 8px', lineHeight: 1.5 }}>
                                    No solver range matrix for this spot.
                                    <br />
                                    Range data loads with solved spots.
                                </div>
                            )}
                        </InfoPanelShell>
                    );
                } catch (err) {
                    console.warn('[UDT] Range panel render error:', err.message);
                    return null;
                }
            })()}

            {/* F4: STRATEGY MODE — Show full strategy analysis */}
            {activeMode === 'strategy' && panelStrategy.frequencies && Array.isArray(panelStrategy.options) && panelStrategy.options.length > 0 && (() => {
                try {
                    return (
                        <InfoPanelShell
                            key="mode-panel-strategy"
                            panelKey="mode-panel-strategy"
                            title="Strategy"
                            poppedOut={panelPoppedOut}
                            canPop={!isMobile}
                            onTogglePop={togglePanelPopOut}
                            padding="10px 14px"
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-fg-dim)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                                    GTO Strategy Distribution
                                </div>
                                {/* GTOW parity #31 — same provenance badge as the
                                    Action mix strip. The Strategy tab is the surface
                                    a player studies hardest, so it is the last place
                                    an estimate should be able to pass as solved. */}
                                <span
                                    title={frequencySource.title}
                                    style={{
                                        fontSize: 8, fontWeight: 800, letterSpacing: 1,
                                        color: frequencySource.fg,
                                        background: frequencySource.bg,
                                        border: `1px solid ${frequencySource.border}`,
                                        borderRadius: 4, padding: '1px 6px',
                                        whiteSpace: 'nowrap', flexShrink: 0,
                                    }}
                                >
                                    {frequencySource.label}
                                </span>
                            </div>
                            {panelStrategy.options.slice(0, 9).map(opt => {
                                if (!opt) return null;
                                const optId = opt?.id || opt;
                                const text = typeof opt === 'string' ? opt : (opt?.text || opt?.label || 'Option');
                                const freq = typeof panelStrategy.frequencies[optId] === 'number' ? panelStrategy.frequencies[optId] : 0;
                                const actionType = detectActionType(text);
                                const barColor = ACTION_COLORS[actionType]?.border || 'var(--sp-fg-dim)';
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
                                        <div style={{ width: 36, fontSize: 11, fontWeight: 800, color: 'var(--sp-fg)', textAlign: 'right', fontFamily: "'Inter', monospace" }}>{freq}%</div>
                                    </div>
                                );
                            })}

                            {/* ═══ HAND-CLASS STRATEGY (GTOW parity #36) ═══
                                The bars above answer "what do I do with THIS
                                hand", which the felt already answers. This is
                                the range-level question the Strategy tab exists
                                for: what does each class of hand do here. */}
                            {handClassStrategy && (
                                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-fg-dim)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6, textAlign: 'center' }}>
                                        By Hand Class
                                        <span style={{ marginLeft: 6, color: 'var(--sp-fg-muted)', fontWeight: 600, letterSpacing: 0 }}>
                                            {handClassStrategy.totalCombos} combos
                                        </span>
                                    </div>
                                    {handClassStrategy.rows.map(row => (
                                        <div key={row.key} style={{ marginBottom: 5 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
                                                <span style={{ fontWeight: 700, color: 'var(--sp-fg)' }}>{row.label}</span>
                                                <span style={{ color: 'var(--sp-fg-dim)', fontFamily: "'Inter', monospace" }}>
                                                    {row.share}% of range
                                                </span>
                                            </div>
                                            {/* One stacked bar per class: the
                                                whole width is that class, split
                                                by what the solver does with it. */}
                                            <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                                                {panelStrategy.options.slice(0, 9).map(opt => {
                                                    const optId = opt?.id || opt;
                                                    const pct = row.mix[optId] || 0;
                                                    if (pct <= 0) return null;
                                                    const text = typeof opt === 'string' ? opt : (opt?.text || opt?.label || '');
                                                    const c = ACTION_COLORS[detectActionType(text)]?.border || 'var(--sp-fg-dim)';
                                                    return (
                                                        <div
                                                            key={optId}
                                                            title={`${text} ${pct}%`}
                                                            style={{ width: `${pct}%`, background: c }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                    {/* Say what the data cannot resolve rather
                                        than letting the omission read as a
                                        finding. See handClassStrategy.js. */}
                                    {handClassStrategy.suitedNote && (
                                        <div style={{ fontSize: 8, lineHeight: 1.4, color: 'var(--sp-fg-muted)', marginTop: 6 }}>
                                            {handClassStrategy.suitedNote}
                                        </div>
                                    )}
                                </div>
                            )}
                        </InfoPanelShell>
                    );
                } catch (err) {
                    console.warn('[UDT] Strategy panel render error:', err.message);
                    return null;
                }
            })()}

            {/* F4: SETTINGS MODE */}
            {activeMode === 'settings' && (() => {
                try {
                    return (
                        <motion.div
                            key="mode-panel-settings"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <button onClick={() => setStudyMode(!studyMode)} style={styles.settingsBtn}>
                                    {studyMode ? 'Study Mode: ON': 'Study Mode: OFF'}
                                </button>
                                <button onClick={() => setRngMode(!rngMode)} style={styles.settingsBtn}>
                                    {rngMode ? '◆ RNG Mode: ON': '◆ RNG Mode: OFF'}
                                </button>
                                {rngMode && (
                                    <button
                                        onClick={() => setRngHighLow(v => (v === 'low' ? 'high' : 'low'))}
                                        style={{ ...styles.settingsBtn, color: rngTheme.fg, borderColor: rngTheme.strong }}
                                    >
                                        {rngHighLow === 'high' ? '◆ Dial: HIGH (first action at 100)' : '◆ Dial: LOW (first action at 1)'}
                                    </button>
                                )}
                                {onExit && (
                                    <button onClick={onExit} style={{ ...styles.settingsBtn, color: 'var(--sp-accent-red)', borderColor: 'rgba(239,68,68,0.3)' }}>
                                         Quit Session
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
            </AnimatePresence>

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
                            color: 'var(--sp-fg-dim)',
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
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-fg-dim)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
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
                                            fontSize: 8, fontWeight: 700, color: 'var(--sp-accent-purple)',
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
                            const isCorrect = optId === effectiveCorrectAnswer;
                            const isSelected = optId === selectedAnswer;
                            const actionType = detectActionType(text);
                            const barColor = isCorrect ? 'var(--sp-accent-green)' : isSelected ? (classConfig?.color || 'var(--sp-accent-red)') : ACTION_COLORS[actionType]?.border || 'var(--sp-fg-faint)';
                            return (
                                <div key={optId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                    <div style={{
                                        width: 72, fontSize: 9, fontWeight: 700, textAlign: 'right',
                                        color: isCorrect ? 'var(--sp-accent-green)' : isSelected ? (classConfig?.color || 'var(--sp-accent-red)') : 'var(--sp-fg-muted)',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {isCorrect && '✓ '}{isSelected && !isCorrect && '✕ '}{text}
                                    </div>
                                    <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${freq}%` }}
                                            transition={{ duration: 0.5, delay: 0.15 }}
                                            style={{ height: '100%', background: barColor, borderRadius: 4, minWidth: freq > 0 ? 2 : 0 }}
                                        />
                                    </div>
                                    <div style={{ width: 34, fontSize: 10, fontWeight: 800, textAlign: 'right', fontFamily: "'Inter', monospace", color: 'var(--sp-fg)' }}>
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
                                border: `1.5px solid ${classConfig?.borderColor || 'var(--sp-accent-blue)'}`,
                            }}
                        >
                            <ClassificationSVGIcon icon={classConfig?.icon} size={16} color={classConfig?.color} />
                            <span style={{
                                fontSize: 13, fontWeight: 800, color: classConfig?.color || 'var(--sp-accent-blue)',
                                letterSpacing: 0.8, textTransform: 'uppercase',
                                fontFamily: "'Inter', monospace",
                            }}>{classConfig?.label || 'Unknown'}</span>
                        </motion.div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>EV:</span>
                            <span style={{
                                fontSize: 14, fontWeight: 800,
                                fontFamily: "'Inter', monospace",
                                color: evLoss > 0 ? 'var(--sp-accent-red)' : 'var(--sp-accent-green)',
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
                            {timeExpired && timeExpired !== 'none' && (
                                <span style={{
                                    fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
                                    color: 'var(--sp-accent-red)',
                                    padding: '2px 7px', borderRadius: 5,
                                    border: '1px solid rgba(239,68,68,0.45)',
                                    background: 'rgba(239,68,68,0.10)',
                                }}>
                                    TIME — auto-{timeExpired === 'fold' ? 'folded' : 'checked'}
                                </span>
                            )}
                            <span style={{
                                fontSize: 11, fontWeight: 600,
                                color: feedbackResult === 'correct' ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                            }}>
                                {feedbackResult === 'correct'? '✓': '✕'} {timeExpired && timeExpired !== 'none' ? 'Clock' : 'You'}: {options.find(o => o.id === selectedAnswer)?.text || selectedAnswer}
                            </span>
                            {selectedAnswer !== effectiveCorrectAnswer && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sp-accent-green)' }}>
                                    ✓ Best: {options.find(o => o.id === effectiveCorrectAnswer)?.text || effectiveCorrectAnswer}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Phase 3: RNG Roll Indicator */}
                    {rngMode && rngRoll !== null && computedFrequencies && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '4px 12px', borderRadius: 6,
                            background: rngTheme.faint,
                            border: `1px solid ${rngTheme.hairline}`,
                            fontSize: 11,
                        }}>
                            <span style={{ fontWeight: 900, color: rngTheme.fg, fontSize: 14 }}>{rngRoll}</span>
                            <span style={{ color: rngTheme.fg, fontWeight: 700, letterSpacing: 0.5 }}>RNG {rngTheme.label}</span>
                            <span style={{ color: 'var(--sp-fg)', fontWeight: 600 }}>
                                {/* #38: the single source of truth for "which action did
                                    the dice pick" is rngTargetAction — the same value the
                                    grader was handed. */}
                                {`→ ${rngTargetAction?.text || rngRanges[0]?.text || 'Check'}`}
                            </span>
                        </div>
                    )}

                    {/* Phase 44: EV Loss Summary — "Your action: +X BB | Optimal: +Y BB | Cost: Z BB" */}
                    {showFeedback && fq?.evData?.actionEVs && selectedAnswer && correctAnswer && selectedAnswer !== correctAnswer && (() => {
                        const selEV = fq.evData.actionEVs[selectedAnswer] ?? fq.evData.actionEVs[selectedAnswer?.toLowerCase()];
                        const corEV = fq.evData.actionEVs[correctAnswer] ?? fq.evData.actionEVs[correctAnswer?.toLowerCase()];
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
                                        <div style={{ fontSize: 8, color: 'var(--sp-fg-muted)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>You</div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sp-accent-red)', fontFamily: "'Inter', monospace" }}>
                                            {selText} ({selEV >= 0 ? '+' : ''}{selEV.toFixed(2)} BB)
                                        </div>
                                    </div>
                                    <div style={{ color: 'var(--sp-fg-faint)', fontSize: 12 }}>→</div>
                                    <div>
                                        <div style={{ fontSize: 8, color: 'var(--sp-fg-muted)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>Optimal</div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sp-accent-green)', fontFamily: "'Inter', monospace" }}>
                                            {corText} ({corEV >= 0 ? '+' : ''}{corEV.toFixed(2)} BB)
                                        </div>
                                    </div>
                                </div>
                                <div style={{
                                    padding: '3px 8px', borderRadius: 6,
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                }}>
                                    <div style={{ fontSize: 8, color: 'var(--sp-accent-red)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' }}>Cost</div>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sp-accent-red)', fontFamily: "var(--font-orbitron), 'Orbitron', monospace", textAlign: 'center' }}>
                                        -{evCost.toFixed(2)} BB
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })()}

                    {/* Phase 32: Stacked GTO Frequency Bar — shows all actions in one visual strip */}
                    {/* Only render when the solver actually gave us a distribution.
                        Checking that KEYS exist is not enough: a spot with no solver
                        data still yields {call:0, fold:0}, which drew an empty
                        titled box under the feedback -- visible as a blank "GTO
                        STRATEGY" panel on screen. */}
                    {computedFrequencies && Object.values(computedFrequencies).some(v => Number(v) > 0) && (
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
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-fg-dim)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                                    Action mix
                                </div>
                                {/* GTOW parity #31 — say where these numbers came
                                    from. An estimated mix that looks identical to a
                                    solved one teaches the player to trust the wrong
                                    digits. */}
                                <span
                                    title={frequencySource.title}
                                    style={{
                                        fontSize: 8, fontWeight: 800, letterSpacing: 1,
                                        color: frequencySource.fg,
                                        background: frequencySource.bg,
                                        border: `1px solid ${frequencySource.border}`,
                                        borderRadius: 4, padding: '1px 6px',
                                        whiteSpace: 'nowrap', flexShrink: 0,
                                    }}
                                >
                                    {frequencySource.label}
                                </span>
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
                                    const isOptimal = opt.id === effectiveCorrectAnswer;
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
                                    const isOptimal = opt.id === effectiveCorrectAnswer;
                                    return (
                                        <span key={opt.id} style={{ fontSize: 8, display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: 2, background: colors.accent || colors.bg, display: 'inline-block' }} />
                                            <span style={{ color: isOptimal ? 'var(--sp-accent-green)' : 'var(--sp-fg-muted)', fontWeight: isOptimal ? 800 : 600 }}>
                                                {typeof opt === 'object' ? opt.text : opt} {freq}%
                                            </span>
                                        </span>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* DEEP ANALYSIS - everything past this line is opt-in.

                        Between hands a player needs four things: what the move
                        was graded, what it cost, what the solver preferred, and
                        the mix. Those stay above this line, always visible.

                        Below it were another twenty sections rendered
                        unconditionally, every single hand, one after another: a
                        per-action EV table, a strategic-why drawer carrying its
                        own solver-analysis card and a range matrix, five
                        structured explanation cards, five deep-coaching cards,
                        and a 13x13 range grid. Stacked, that is the wall of
                        text -- and it is also the fourth and fifth place the
                        same EV number gets printed.

                        Nothing here is deleted. It is behind one switch that
                        starts closed on every new hand, so the depth is there
                        when someone wants to study and out of the way when they
                        want to play. */}
                    <button
                        onClick={() => setDeepAnalysisOpen(v => !v)}
                        aria-expanded={deepAnalysisOpen}
                        style={{ ...styles.analysisToggle, ...(deepAnalysisOpen ? styles.analysisToggleOpen : null) }}
                    >
                        <span style={styles.analysisToggleCaret}>{deepAnalysisOpen ? '\u25BE' : '\u25B8'}</span>
                        <span>{deepAnalysisOpen ? 'HIDE ANALYSIS' : 'FULL ANALYSIS'}</span>
                    </button>
                    {deepAnalysisOpen && (<>
                    {/* Per-Action EV Comparison */}
                    {fq?.evData?.actionEVs && Object.keys(fq.evData.actionEVs || {}).length > 0 && (
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
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-fg-dim)', letterSpacing: 1.2, marginBottom: 4, textTransform: 'uppercase' }}>
                                EV by Action
                            </div>
                            {options.slice(0, 9).map(opt => {
                                const optId = opt.id || opt;
                                const ev = fq.evData.actionEVs[optId];
                                if (ev === undefined) return null;
                                const maxEV = Math.max(...Object.values(fq.evData.actionEVs || {}).filter(v => typeof v === 'number'));
                                const minEV = Math.min(...Object.values(fq.evData.actionEVs || {}).filter(v => typeof v === 'number'));
                                const range = maxEV - minEV || 1;
                                const barWidth = Math.max(5, ((ev - minEV) / range) * 100);
                                const isOptimal = optId === effectiveCorrectAnswer;
                                const isSelected = optId === selectedAnswer;
                                const barColor = isOptimal ? 'var(--sp-accent-green)' : isSelected ? (classConfig?.color || 'var(--sp-accent-red)') : 'var(--sp-fg-faint)';

                                return (
                                    <div key={optId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                        <div style={{ width: 42, fontSize: 9, fontWeight: 600, color: isOptimal ? 'var(--sp-accent-green)' : 'var(--sp-fg-muted)', textAlign: 'right' }}>
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
                                        <div style={{ width: 44, fontSize: 9, fontWeight: 'bold', textAlign: 'right', fontFamily: "'Inter', monospace", color: ev >= 0 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)' }}>
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
                            const hCat = fq?.handCategory || '';
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
                        // TRAIN-FEEDBACK-SNAPSHOT-1: route through the snapshot so the guard
                        // validates against the question that was actually answered.
                        const explanationOk = explanationMatchesScenario(explanation, fScenario);
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
                                <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--sp-fg)', textAlign: 'center' }}>
                                    {displayExplanation}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6, gap: 8 }}>
                                    <button
                                        onClick={() => setShowWhyDrawer(!showWhyDrawer)}
                                        style={{
                                            padding: '4px 12px', borderRadius: 6,
                                            background: 'rgba(0, 212, 255, 0.08)',
                                            border: '1px solid rgba(0, 212, 255, 0.25)',
                                            color: 'var(--sp-accent-cyan)', fontSize: 10, fontWeight: 700,
                                            cursor: 'pointer', letterSpacing: 0.5,
                                        }}
                                    >
                                        {showWhyDrawer ? 'Hide Details' : 'Why?'}
                                    </button>
                                    {fq?.rawFrequencies && (
                                        <button
                                            onClick={() => setShowRangeGrid(!showRangeGrid)}
                                            style={{
                                                padding: '4px 12px', borderRadius: 6,
                                                background: showRangeGrid ? 'rgba(168, 85, 247, 0.15)' : 'rgba(168, 85, 247, 0.08)',
                                                border: `1px solid rgba(168, 85, 247, ${showRangeGrid ? '0.4' : '0.25'})`,
                                                color: 'var(--sp-accent-purple)', fontSize: 10, fontWeight: 700,
                                                cursor: 'pointer', letterSpacing: 0.5,
                                            }}
                                        >
                                            {showRangeGrid ? 'Hide Range' : 'Range'}
                                        </button>
                                    )}
                                </div>
                                {/* Phase 33: Range Matrix Viewer */}
                                <AnimatePresence>
                                    {showRangeGrid && fq?.rawFrequencies && (
                                        <RangeMatrixViewer
                                            rawFrequencies={fq.rawFrequencies}
                                            correctAnswer={correctAnswer}
                                            show={showRangeGrid}
                                            heroHand={fq?.heroHand || fScenario.heroHand}
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
                                                fontSize: 10, color: 'var(--sp-fg)', lineHeight: 1.6,
                                            }}>
                                                <div style={{ fontWeight: 700, color: 'var(--sp-accent-cyan)', marginBottom: 6, fontSize: 9, letterSpacing: 1 }}>
                                                    SOLVER ANALYSIS
                                                </div>

                                                {/* Phase 53: Hand category for context */}
                                                {fq?.handCategory && (
                                                    <div style={{ marginBottom: 4, fontSize: 10, fontStyle: 'italic', color: 'var(--sp-accent-purple)' }}>
                                                        Your hand: {fq.handCategory}
                                                    </div>
                                                )}

                                                {/* Optimal action with frequency */}
                                                <div style={{ marginBottom: 4 }}>
                                                    <strong style={{ color: 'var(--sp-accent-green)' }}>Optimal:</strong>{' '}
                                                    {correctOpt}
                                                    {correctFreq > 0 && (
                                                        <span style={{ color: 'var(--sp-fg-muted)' }}> at {correctFreq}%</span>
                                                    )}
                                                </div>

                                                {/* Your pick with mistake reasoning */}
                                                {selectedAnswer && selectedAnswer !== correctAnswer && (
                                                    <div style={{ marginBottom: 4 }}>
                                                        <strong style={{ color: 'var(--sp-accent-red)' }}>Your Pick:</strong>{' '}
                                                        {selectedOpt}
                                                        {selectedFreq > 0 ? (
                                                            <span style={{ color: 'var(--sp-accent-orange)' }}> ({selectedFreq}% — part of the mix but suboptimal)</span>
                                                        ) : (
                                                            <span style={{ color: 'var(--sp-accent-red)' }}> (0% — not in the solver's strategy)</span>
                                                        )}
                                                        {evLoss > 0 && (
                                                            <span style={{ color: 'var(--sp-accent-red)' }}> — loses {evLoss.toFixed(2)} BB</span>
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
                                                        color: 'var(--sp-accent-amber)', fontSize: 10,
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
                                                        fontSize: 9, color: evLoss >= 0.5 ? 'var(--sp-accent-red)' : 'var(--sp-accent-amber)', lineHeight: 1.5,
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
                                                {(boardTexture || fScenario.board) && (
                                                    <div style={{ marginBottom: 4 }}>
                                                        <strong style={{ color: 'var(--sp-fg-muted)' }}>Board:</strong>{' '}
                                                        {(() => {
                                                            // Try to extract rich texture from question text (engine generates it)
                                                            const qText = fq?.question || '';
                                                            const textureMatch = qText.match(/\(([^)]*(?:Wet|Dry|Semi-wet|monotone|rainbow|two-tone|ace-high|king-high|broadway|low|mid-range)[^)]*)\)/i);
                                                            if (textureMatch) return textureMatch[1];
                                                            // Fallback to basic classifier
                                                            if (boardTexture) return `${boardTexture.suitTexture}${boardTexture.connectTexture ? ` + ${boardTexture.connectTexture}` : ''}`;
                                                            return '';
                                                        })()}.
                                                        {heroPosition && ` Hero ${heroPosition}${fScenario.villainPosition ? ` vs ${fScenario.villainPosition}` : ''}.`}
                                                    </div>
                                                )}

                                                {/* Strategic insight from the engine explanation */}
                                                {explanation && explanation !== displayExplanation && (
                                                    <div style={{
                                                        marginBottom: 4, padding: '4px 8px',
                                                        background: 'rgba(34, 197, 94, 0.06)',
                                                        borderRadius: 6,
                                                        border: '1px solid rgba(34, 197, 94, 0.12)',
                                                        color: 'var(--sp-accent-green)', fontSize: 10,
                                                    }}>
                                                        {explanation}
                                                    </div>
                                                )}

                                                {/* Phase 53: Full EV comparison table when available */}
                                                {fq?.evData?.actionEVs && Object.keys(fq.evData.actionEVs || {}).length > 1 && (
                                                    <div style={{ marginTop: 6, marginBottom: 4 }}>
                                                        <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--sp-fg-muted)', letterSpacing: 0.5, marginBottom: 3 }}>EV BY ACTION</div>
                                                        {Object.entries(fq.evData.actionEVs || {})
                                                            .sort(([, a], [, b]) => b - a)
                                                            .map(([action, ev]) => {
                                                                const isOptimal = action === correctAnswer;
                                                                const isSelected = action === selectedAnswer;
                                                                const optText = fq?.options?.find(o => o.id === action)?.text || action;
                                                                const evNum = typeof ev === 'number' ? ev : 0;
                                                                return (
                                                                    <div key={action} style={{
                                                                        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1,
                                                                        padding: '1px 4px', borderRadius: 3,
                                                                        background: isSelected && !isOptimal ? 'rgba(239,68,68,0.06)' : isOptimal ? 'rgba(34,197,94,0.06)' : 'transparent',
                                                                    }}>
                                                                        <span style={{ width: 10, fontSize: 8, color: isOptimal ? 'var(--sp-accent-green)' : isSelected ? 'var(--sp-accent-red)' : 'var(--sp-fg-dim)' }}>
                                                                            {isOptimal ? '✓': isSelected ? '✕': '·'}
                                                                        </span>
                                                                        <span style={{ flex: 1, fontSize: 9, color: isOptimal ? 'var(--sp-accent-green)' : isSelected ? 'var(--sp-accent-red)' : 'var(--sp-fg-muted)' }}>
                                                                            {optText}
                                                                        </span>
                                                                        <span style={{
                                                                            fontSize: 9, fontWeight: 700, fontFamily: "'Inter', monospace",
                                                                            color: evNum >= 0 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
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
                                                    <div style={{ color: 'var(--sp-fg-dim)', fontSize: 9, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        <span>{street.charAt(0).toUpperCase() + street.slice(1)}</span>
                                                        <span>Pot: {pot} BB</span>
                                                        {spr && <span>SPR: {spr}</span>}
                                                        {fScenario.stackDepth && <span>Stack: {fScenario.stackDepth}bb</span>}
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
                                        color: 'var(--sp-accent-purple)', letterSpacing: 0.3,
                                    }}>
                                        {structuredExplanation.concept}
                                    </span>
                                )}
                                {structuredExplanation.spotDifficulty && (
                                    <span style={{
                                        fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                                        background: structuredExplanation.spotDifficulty.difficulty >= 7 ? 'rgba(239,68,68,0.1)' : structuredExplanation.spotDifficulty.difficulty >= 4 ? 'rgba(251,191,36,0.1)' : 'rgba(34,197,94,0.1)',
                                        color: structuredExplanation.spotDifficulty.difficulty >= 7 ? 'var(--sp-accent-red)' : structuredExplanation.spotDifficulty.difficulty >= 4 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-green)',
                                        border: '1px solid ' + (structuredExplanation.spotDifficulty.difficulty >= 7 ? 'rgba(239,68,68,0.2)' : structuredExplanation.spotDifficulty.difficulty >= 4 ? 'rgba(251,191,36,0.2)' : 'rgba(34,197,94,0.2)'),
                                    }}>
                                        {structuredExplanation.spotDifficulty.label} ({structuredExplanation.spotDifficulty.difficulty}/10)
                                    </span>
                                )}
                            </div>

                            {/* Key takeaway — guarded by TRAIN-FEEDBACK-SYNC-1 */}
                            {/* TRAIN-FEEDBACK-SNAPSHOT-1: snapshot-based check */}
                            {structuredExplanation.takeaway && explanationMatchesScenario(structuredExplanation.takeaway, fScenario) && (
                                <div style={{
                                    padding: '6px 10px', marginBottom: 6,
                                    background: structuredExplanation.isCorrect ? 'rgba(34, 197, 94, 0.06)' : 'rgba(251, 191, 36, 0.06)',
                                    borderRadius: 8,
                                    border: `1px solid ${structuredExplanation.isCorrect ? 'rgba(34, 197, 94, 0.15)' : 'rgba(251, 191, 36, 0.15)'}`,
                                    fontSize: 10, lineHeight: 1.5,
                                    color: structuredExplanation.isCorrect ? 'var(--sp-accent-green)' : 'var(--sp-accent-amber)',
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
                                    fontSize: 10, lineHeight: 1.5, color: 'var(--sp-accent-red)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                        <span style={{
                                            fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                                            background: structuredExplanation.mistakeType.severity === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.15)',
                                            color: structuredExplanation.mistakeType.severity === 'high' ? 'var(--sp-accent-red)' : 'var(--sp-accent-amber)',
                                        }}>
                                            {structuredExplanation.mistakeType.label}
                                        </span>
                                    </div>
                                    <div style={{ color: 'var(--sp-fg-muted)' }}>{structuredExplanation.mistakeType.description}</div>
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
                                    fontSize: 9, lineHeight: 1.5, color: 'var(--sp-accent-cyan)',
                                }}>
                                    <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>HOW TO FIX: </span>
                                    {structuredExplanation.fix}
                                </div>
                            )}

                            {/* BUG FIX (TRAIN-FB-IA-1): the post-answer feedback layer was
                                stacking up to 10 narrative cards (PRINCIPLE / POSITION / TEXTURE /
                                SPR / VILLAIN RANGE / STREET PLAN / HAND / EQUITY / RANGE TIP /
                                HAND READING) on top of the KEY TAKEAWAY and SOLVER LINE cards.
                                On a 390px mobile viewport this filled the screen and pushed the
                                NEXT HAND button below the fold. Wrap these auxiliary insight
                                cards in a single <details> accordion so the user sees only the
                                two important cards by default and can opt into the deep coaching
                                insights on demand. */}
                            <details
                                style={{
                                    marginTop: 4,
                                    padding: '4px 8px',
                                    borderRadius: 8,
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                }}
                            >
                                <summary
                                    style={{
                                        cursor: 'pointer',
                                        fontSize: 9,
                                        fontWeight: 700,
                                        letterSpacing: 0.5,
                                        color: 'var(--sp-fg-muted)',
                                        userSelect: 'none',
                                        listStyle: 'none',
                                        padding: '4px 2px',
                                    }}
                                >
                                    More coaching insights
                                </summary>
                            {/* ═══ PHASE 261-280: Deep coaching insights ═══ */}
                            {(() => {
                                try {
                                    if (!getTeachingPrinciple) return null;
                                    const sc = fScenario;
                                    const p = getTeachingPrinciple(sc.street || 'flop', sc.nodeType || '', structuredExplanation?.correctAction || fq?.correctAnswer || '', fq?.handCategory || '', sc.texture || '');
                                    if (!p || !p.principle) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(34,197,94,0.04)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.1)', fontSize: 9, lineHeight: 1.5, color: 'var(--sp-accent-green)' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: 'var(--sp-accent-green)' }}>PRINCIPLE: </span>{p.principle}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {(() => {
                                try {
                                    if (!getPositionReminder) return null;
                                    const sc = fScenario;
                                    const r = getPositionReminder(sc.heroPosition || sc.position || '', sc.street || 'flop', sc.nodeType || '');
                                    if (!r || !r.tip) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(251,191,36,0.04)', borderRadius: 8, border: '1px solid rgba(251,191,36,0.1)', fontSize: 9, lineHeight: 1.5, color: 'var(--sp-accent-amber)' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: 'var(--sp-accent-amber)' }}>POSITION: </span>{r.tip}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {(() => {
                                try {
                                    if (!getTextureStrategyGuide) return null;
                                    const sc = fScenario;
                                    if (!sc.texture && !sc.boardTexture) return null;
                                    const g = getTextureStrategyGuide(sc.texture || sc.boardTexture || '', sc.street || 'flop', sc.heroPosition || '', sc.villainPosition || '');
                                    if (!g || !g.strategy) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(168,85,247,0.04)', borderRadius: 8, border: '1px solid rgba(168,85,247,0.1)', fontSize: 9, lineHeight: 1.5, color: 'var(--sp-accent-purple)' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: 'var(--sp-accent-purple)' }}>TEXTURE: </span>{g.strategy}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {(() => {
                                try {
                                    if (!getSPRStrategyGuide) return null;
                                    const sc = fScenario;
                                    if (!sc.potSize && !sc.stackDepth) return null;
                                    const spr = getSPRStrategyGuide(sc.potSize || sc.estimatedPot || 0, sc.stackDepth || sc.effectiveStack || 100);
                                    if (!spr || !spr.guidance) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(0,212,255,0.03)', borderRadius: 8, border: '1px solid rgba(0,212,255,0.08)', fontSize: 9, lineHeight: 1.5, color: 'var(--sp-accent-cyan)' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: 'var(--sp-accent-cyan)' }}>SPR: </span>{spr.spr && <span style={{ fontFamily: "var(--font-orbitron), 'Orbitron', monospace", marginRight: 4 }}>{spr.spr.toFixed(1)}</span>}{spr.guidance}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {(() => {
                                try {
                                    if (!getVillainRangeNarration) return null;
                                    const sc = fScenario;
                                    const n = getVillainRangeNarration(sc.street || 'flop', sc.nodeType || '', sc.villainActions || sc.actionSequence || []);
                                    if (!n || !n.narration) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(239,68,68,0.04)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.1)', fontSize: 9, lineHeight: 1.5, color: 'var(--sp-accent-red)' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: 'var(--sp-accent-red)' }}>VILLAIN RANGE: </span>{n.narration}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {(() => {
                                try {
                                    if (!getMultiStreetPlanningGuide) return null;
                                    const sc = fScenario;
                                    const plan = getMultiStreetPlanningGuide(sc.street || 'flop', fq?.handCategory || '', structuredExplanation?.correctAction || fq?.correctAnswer || '', sc.potSize || 0, sc.stackDepth || 100);
                                    if (!plan || !plan.plan) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(59,130,246,0.04)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.1)', fontSize: 9, lineHeight: 1.5, color: '#93c5fd' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: 'var(--sp-accent-blue)' }}>STREET PLAN: </span>{plan.plan}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                            {/* Phase 271: Hand Strength Badge */}
                            {(() => {
                                try {
                                    if (!classifyHandStrength) return null;
                                    const sc = fScenario;
                                    const hs = classifyHandStrength(fq?.handCategory || '', sc.boardTexture || sc.texture || '', sc.street || 'flop');
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
                                    const sc = fScenario;
                                    const eq = estimateEquityVsRange(fq?.handCategory || '', sc.street || 'flop', sc.nodeType || '', sc.heroPosition || '', sc.villainPosition || '');
                                    if (!eq) return null;
                                    const eqColor = eq.equity >= 60 ? 'var(--sp-accent-green)' : eq.equity >= 40 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)';
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: `${eqColor}06`, borderRadius: 8, border: `1px solid ${eqColor}15`, fontSize: 9, lineHeight: 1.5, color: eqColor }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>EQUITY: </span><span style={{ fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>{eq.equity}%</span> — {eq.rangeDescription}
                                    </div>);
                                } catch (_) { return null; }
                            })()}

                            {/* Phase 293: Range Construction Tip */}
                            {(() => {
                                try {
                                    if (!getRangeConstructionDrill) return null;
                                    const sc = fScenario;
                                    const drill = getRangeConstructionDrill(sc.heroPosition || 'CO', sc.nodeType?.includes('3bet') ? '3bet' : 'open');
                                    if (!drill) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(168,85,247,0.06)', borderRadius: 8, border: '1px solid rgba(168,85,247,0.15)', fontSize: 9, lineHeight: 1.5, color: 'var(--sp-accent-purple)' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>RANGE TIP: </span>{drill.tip}
                                    </div>);
                                } catch (_) { return null; }
                            })()}

                            {/* Phase 298: Hand Reading Insight */}
                            {(() => {
                                try {
                                    if (!getHandReadingDrill) return null;
                                    const sc = fScenario;
                                    const drill = getHandReadingDrill(sc.street || 'flop');
                                    if (!drill) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(245,158,11,0.06)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.15)', fontSize: 9, lineHeight: 1.5, color: 'var(--sp-accent-amber)' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>HAND READING: </span>{drill.keyPrinciple}
                                    </div>);
                                } catch (_) { return null; }
                            })()}

                            </details>
                            {/* Phase 301: Optimal Line Narration */}
                            {(() => {
                                try {
                                    if (!getOptimalLineNarration || structuredExplanation?.isCorrect === undefined) return null;
                                    // TRAIN-FEEDBACK-SNAPSHOT-1: build narration against the snapshot
                                    const fbQuestion = fq;
                                    const sc = fbQuestion?.scenario || {};
                                    const narr = getOptimalLineNarration(structuredExplanation?.primary || '', gtoFrequencies || {}, sc.street || 'flop', sc.nodeType || '', sc.heroPosition || '', fbQuestion?.handCategory || '');
                                    if (!narr) return null;
                                    // BUG FIX (TRAIN-FEEDBACK-SYNC-1): suppress solver-line narration when it
                                    // references a different board or hand than the active scenario.
                                    if (!explanationMatchesScenario(narr.narration, sc)) return null;
                                    return (<div style={{ padding: '5px 10px', marginTop: 4, background: 'rgba(34,197,94,0.06)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.15)', fontSize: 9, lineHeight: 1.5, color: 'var(--sp-accent-green)' }}>
                                        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: 0.5, color: 'var(--sp-accent-green)' }}>SOLVER LINE: </span>{narr.narration}
                                    </div>);
                                } catch (_) { return null; }
                            })()}
                        </div>
                    )}

                    {/* Range Grid (when raw frequencies available) */}
                    {fq?.rawFrequencies && (
                        <div style={{ width: '100%' }}>
                            <div style={{
                                fontSize: 10, color: 'var(--sp-fg-muted)', padding: '3px 8px',
                                background: 'rgba(255,255,255,0.03)', borderRadius: 6,
                                textAlign: 'center',
                            }}>
                                <span style={{ fontWeight: 'bold', color: 'var(--sp-fg-dim)' }}>GTO: </span>
                                {options.slice(0, 9).map(o => {
                                    const f = computedFrequencies[o.id] || 0;
                                    if (f <= 0) return null;
                                    return (
                                        <span key={o.id} style={{ marginRight: 6 }}>
                                            {o.text}: <span style={{ color: 'var(--sp-fg)', fontWeight: 'bold' }}>{f}%</span>
                                        </span>
                                    );
                                })}
                            </div>
                            {fq?.rawFrequencies && (() => {
                                // GTOW parity #35: this transpose used to be
                                // open-coded here (and wrongly in two other
                                // places). buildRangeGridData is the single
                                // owner and also normalizes 0-1 vs 0-100 scale.
                                const actions = rangeGridActions(fq.rawFrequencies);
                                const gridData = buildRangeGridData(fq.rawFrequencies);
                                if (!gridData) return null;
                                const heroHand = handNotationFromCards(fq?.heroCards || fq?.cards);
                                return (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        transition={{ duration: 0.3, delay: 0.3 }}
                                        style={{ marginTop: 6 }}
                                    >
                                        <div style={{
                                            fontSize: 9, fontWeight: 700, color: 'var(--sp-fg-dim)',
                                            letterSpacing: 1.2, textTransform: 'uppercase',
                                            marginBottom: 4, textAlign: 'center',
                                        }}>
                                            Range Matrix {heroHand && <span style={{ color: 'var(--sp-accent-cyan)' }}>• {heroHand}</span>}
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

                    </>)}
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
                            {/* BUG FIX (TRAIN-FB-COPY-1): "Hand Complete — 1 STREET PLAYED" reads
                                awkwardly. Map streetsPlayed to a natural-language summary. */}
                            <div style={{
                                fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                                textTransform: 'uppercase', color: 'var(--sp-accent-purple)', marginBottom: 6,
                            }}>
                                {(() => {
                                    const n = handSummary.streetsPlayed || 1;
                                    const labels = { 1: 'Played to flop', 2: 'Played to turn', 3: 'Played to river', 4: 'Hand to showdown' };
                                    return labels[n] || `Hand summary · ${n} streets played`;
                                })()}
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {(handSummary.evHistory || []).map((ev, idx) => {
                                    const cls = ev.classification;
                                    const clsColors = {
                                        best: 'var(--sp-accent-green)', correct: 'var(--sp-accent-cyan)', inaccuracy: 'var(--sp-accent-amber)',
                                        wrong: 'var(--sp-accent-red)', blunder: 'var(--sp-accent-red)',
                                    };
                                    const color = clsColors[cls] || 'var(--sp-fg-muted)';
                                    return (
                                        <div key={idx} style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            padding: '3px 8px', borderRadius: 6,
                                            background: `${color}11`, border: `1px solid ${color}33`,
                                        }}>
                                            <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase' }}>
                                                {ev.street}
                                            </span>
                                            <span style={{ fontSize: 9, color: 'var(--sp-fg-muted)' }}>•</span>
                                            <span style={{ fontSize: 9, fontWeight: 600, color }}>
                                                {cls?.charAt(0).toUpperCase() + cls?.slice(1)}
                                            </span>
                                            {ev.evLoss > 0 && (
                                                <span style={{ fontSize: 8, color: 'var(--sp-accent-red)' }}>
                                                    -{ev.evLoss.toFixed(1)}bb
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {handSummary.totalEVLoss > 0 && (
                                <div style={{
                                    marginTop: 4, fontSize: 10, color: 'var(--sp-fg-muted)', textAlign: 'right',
                                }}>
                                    Total EV loss: <span style={{ color: 'var(--sp-accent-red)', fontWeight: 700 }}>
                                        -{handSummary.totalEVLoss.toFixed(1)}bb
                                    </span>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* BUG FIX (TRAIN-NEXT-HAND-STICKY-1): When the feedback panel is
                        long (10+ aux insight cards even after the TRAIN-FB-IA-1
                        accordion collapse), the primary 'Next Hand →' CTA used
                        to fall below the fold on mobile, forcing users to
                        scroll back down after reading each answer. Wrapped the
                        button row in position:sticky bottom anchor with
                        env(safe-area-inset-bottom) awareness and a subtle
                        gradient fade so the button stays visible as soon as
                        feedback exceeds the viewport. Desktop behaviour is
                        unchanged because position:sticky has no effect until
                        scrolling past the natural inline position. */}
                    {/* Next Hand / Continue Hand buttons — GTOW-style prominent green */}
                    <div
                        style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            marginTop: 6,
                            justifyContent: 'center',
                            position: 'sticky',
                            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
                            paddingTop: 8,
                            paddingBottom: 4,
                            zIndex: 50,
                            background: 'linear-gradient(180deg, rgba(10,14,28,0) 0%, rgba(10,14,28,0.85) 32%, rgba(10,14,28,0.95) 100%)',
                            backdropFilter: 'blur(2px)',
                            WebkitBackdropFilter: 'blur(2px)',
                        }}
                    >
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
                                        color: isMultiStreetActive ? 'var(--sp-accent-orange)' : 'var(--sp-accent-green)',
                                        fontSize: 15, fontWeight: 800, cursor: 'pointer',
                                        letterSpacing: 0.8, fontFamily: "'Inter', -apple-system, sans-serif",
                                        boxShadow: isMultiStreetActive
                                            ? '0 0 10px rgba(251,146,60,0.15)'
                                            : '0 0 10px rgba(34,197,94,0.12)',
                                    }}
                                >
                                    {isMultiStreetActive ? 'Continue Hand →' : 'Next Hand →'}
                                    {/* PERF: seconds label + progress bar own their 50ms tick
                                        in AutoAdvanceIndicator (see that component). */}
                                    <AutoAdvanceIndicator
                                        total={autoAdvanceTotal}
                                        isMultiStreetActive={isMultiStreetActive}
                                    />
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
                                            color: 'var(--sp-fg-muted)', fontSize: 11, fontWeight: 600,
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
                                        color: isCurrentBookmarked ? 'var(--sp-accent-amber)' : 'var(--sp-fg-muted)',
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
                                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--sp-accent-cyan)', letterSpacing: 1 }}>SESSION COMPLETE</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
                                    {[
                                        { label: 'Hands', value: questionNumber || 0, color: 'var(--sp-fg)' },
                                        { label: 'Accuracy', value: `${questionNumber > 0 ? Math.round(((questionNumber - sessionMistakes) / questionNumber) * 100) : 0}%`, color: 'var(--sp-accent-green)' },
                                        { label: 'EV Loss', value: `-${(totalSessionEVLoss || 0).toFixed(1)}`, color: totalSessionEVLoss > 3 ? 'var(--sp-accent-red)' : 'var(--sp-accent-amber)' },
                                        { label: 'Streak', value: streak, color: 'var(--sp-accent-amber)' },
                                    ].map((stat, i) => (
                                        <div key={i} style={{
                                            textAlign: 'center', padding: '8px 0',
                                            background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                                        }}>
                                            <div style={{ fontSize: 18, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                                            <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>{stat.label}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--sp-fg-faint)', fontWeight: 600 }}>
                                    {computedDifficulty.label} difficulty • Session complete
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
                                            color: 'var(--sp-accent-red)', fontSize: 11, fontWeight: 700,
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

            {/* PHASE 6: Mistake Review overlay — wired to the Review N Mistakes button */}
            {showMistakeReview && (() => {
                const mistakes = sessionMistakesListRef.current || [];
                if (mistakes.length === 0) return null;
                const idx = Math.min(mistakeReviewIndex, mistakes.length - 1);
                const mk = mistakes[idx];
                const navBtnStyle = {
                    padding: '8px 16px', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--sp-fg)', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', letterSpacing: 0.5,
                };
                return (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 500,
                        background: 'rgba(5,10,20,0.95)',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: 12, padding: 20,
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sp-accent-red)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                            Mistake {idx + 1} / {mistakes.length}
                        </div>
                        <div style={{
                            width: '100%', maxWidth: 360, padding: '12px 16px',
                            background: 'rgba(255,255,255,0.04)', borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex', flexDirection: 'column', gap: 6,
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-fg)' }}>
                                Hand: {(mk.heroCards || []).join(' ') || '?'}{mk.heroPosition ? ` (${mk.heroPosition})` : ''}
                            </div>
                            {Array.isArray(mk.boardCards) && mk.boardCards.length > 0 && (
                                <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>Board: {mk.boardCards.join(' ')}</div>
                            )}
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sp-accent-red)' }}>You: {mk.selectedAnswer ?? '-'}</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sp-accent-green)' }}>Correct: {mk.correctAnswer ?? '-'}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sp-accent-amber)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                {mk.classification || 'mistake'}{mk.evLoss > 0 ? ` · -${mk.evLoss.toFixed(2)} BB` : ''}
                            </div>
                            {mk.explanation && (
                                <div style={{ fontSize: 10, color: 'var(--sp-fg-muted)', lineHeight: 1.5 }}>{mk.explanation}</div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={() => setMistakeReviewIndex(i => Math.max(0, i - 1))}
                                disabled={idx === 0}
                                style={{ ...navBtnStyle, opacity: idx === 0 ? 0.4 : 1 }}
                            >
                                Prev
                            </button>
                            <button
                                onClick={() => setMistakeReviewIndex(i => Math.min(mistakes.length - 1, i + 1))}
                                disabled={idx >= mistakes.length - 1}
                                style={{ ...navBtnStyle, opacity: idx >= mistakes.length - 1 ? 0.4 : 1 }}
                            >
                                Next
                            </button>
                            <button
                                onClick={() => setShowMistakeReview(false)}
                                style={{
                                    ...navBtnStyle,
                                    border: '1px solid rgba(239,68,68,0.4)',
                                    background: 'rgba(239,68,68,0.1)',
                                    color: 'var(--sp-accent-red)',
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                );
            })()}
        </div >
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        position: 'relative',
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#121212',
        fontFamily: "'Inter', -apple-system, sans-serif",
        overflow: 'hidden',
    },

    // ── TOP BAR — Back pill | centred cyan title | session pills + avatar
    topBar: {
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: 'linear-gradient(180deg, #141419 0%, #0d0d11 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
        minHeight: 46,
        zIndex: 6,
    },

    // #48: 12px of side padding on a 375px bar is 24px the content cannot use.
    topBarNarrow: {
        padding: '8px 8px',
        gap: 6,
    },

    topBarLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        zIndex: 1,
        flexShrink: 0,
    },

    topBarRight: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        zIndex: 1,
    },

    // #48: the cluster used to be unshrinkable, so it grew straight off the
    // right edge instead of competing with the title for the space available.
    topBarRightNarrow: {
        gap: 5,
        flexShrink: 1,
        minWidth: 0,
    },

    // The exit. Replaces the floating "Quit" chip that used to sit over the felt.
    backPill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 999,
        background: 'linear-gradient(180deg, rgba(28,32,46,0.95) 0%, rgba(15,18,28,0.95) 100%)',
        border: '1px solid rgba(120,150,200,0.35)',
        color: '#dbe7f5',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.2,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        fontFamily: "'Inter', -apple-system, sans-serif",
    },

    // #48: icon-only on a phone. Same tap target, same aria-label, 101px back.
    backPillNarrow: {
        padding: '6px 11px',
        gap: 0,
    },

    backPillArrow: {
        color: 'var(--sp-accent-cyan)',
        fontSize: 13,
        lineHeight: 1,
    },

    // Centred on the bar itself, so it cannot drift with the side clusters.
    // pointerEvents off so it never eats a click meant for a pill behind it.
    topBarTitle: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: 'clamp(11px, 3.2vw, 15px)',
        fontWeight: 800,
        color: 'var(--sp-accent-cyan)',
        fontFamily: "'Inter', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: 2.2,
        textShadow: '0 0 12px rgba(0,212,255,0.35)',
        whiteSpace: 'nowrap',
        maxWidth: '46%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        pointerEvents: 'none',
        zIndex: 0,
    },

    // #48: on a phone the title stops being a free-floating centred layer and
    // becomes the flex child that absorbs whatever width the two clusters leave.
    // It ellipsizes rather than overlapping, which is the only behaviour that
    // cannot collide no matter what the side clusters do.
    topBarTitleNarrow: {
        position: 'static',
        transform: 'none',
        flex: '1 1 auto',
        minWidth: 0,
        maxWidth: 'none',
        textAlign: 'center',
        fontSize: 10,
        letterSpacing: 1,
    },

    // Gold pill (template: XP) and cyan pill (template: diamonds).
    xpPill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 999,
        background: 'rgba(226,175,58,0.10)',
        border: '1px solid rgba(226,175,58,0.55)',
        boxShadow: '0 0 10px rgba(226,175,58,0.15)',
        lineHeight: 1,
    },

    xpPillIcon: {
        color: '#e2af3a',
        fontSize: 10,
        lineHeight: 1,
    },

    gemPill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 999,
        background: 'rgba(0,212,255,0.08)',
        border: '1px solid rgba(0,212,255,0.45)',
        boxShadow: '0 0 10px rgba(0,212,255,0.12)',
        lineHeight: 1,
    },

    gemPillIcon: {
        color: 'var(--sp-accent-cyan)',
        fontSize: 10,
        lineHeight: 1,
    },

    xpPillValue: {
        fontSize: 12,
        fontWeight: 800,
        fontFamily: "'Inter', monospace",
        lineHeight: 1,
    },

    pillCaption: {
        fontSize: 7,
        fontWeight: 700,
        letterSpacing: 0.9,
        color: 'var(--sp-fg-dim)',
        textTransform: 'uppercase',
        lineHeight: 1,
    },

    topBarAvatar: {
        width: 30,
        height: 30,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        border: '1.5px solid rgba(0,212,255,0.55)',
        boxShadow: '0 0 10px rgba(0,212,255,0.20)',
        background: '#12121a',
    },

    // ── THE QUESTION PANEL — full width, above the table.
    questionPanel: {
        flexShrink: 0,
        margin: '8px 10px 6px',
        padding: '11px 16px',
        borderRadius: 14,
        background: 'linear-gradient(180deg, rgba(10,11,15,0.98) 0%, rgba(4,5,8,0.99) 100%)',
        border: '1.5px solid rgba(0,212,255,0.55)',
        boxShadow: [
            '0 0 18px rgba(0,212,255,0.26)',
            '0 0 46px rgba(0,212,255,0.10)',
            'inset 0 1px 0 rgba(255,255,255,0.05)',
        ].join(', '),
        textAlign: 'center',
    },

    questionPanelText: {
        fontSize: 'clamp(13px, 4.1vw, 19px)',
        fontWeight: 800,
        lineHeight: 1.34,
        color: '#ffffff',
        letterSpacing: 0.1,
        textShadow: '0 1px 6px rgba(0,0,0,0.85)',
    },

    questionPanelContext: {
        marginTop: 5,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1.3,
        textTransform: 'uppercase',
        color: 'rgba(0,212,255,0.80)',
    },

    gameTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: 'var(--sp-fg)',
        fontFamily: "'Inter', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },

    contextString: {
        fontSize: 11,
        color: 'var(--sp-fg-muted)',
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
        color: 'var(--sp-fg-muted)',
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
        color: 'var(--sp-accent-amber)',
    },

    // ── TABLE AREA — Phase 17e: Fill ALL available space, overflow hidden
    tableArea: {
        // 2026-07-26 (roadmap #19/#30): this was `overflow: hidden` on a flex:1
        // box whose child is flexShrink:0 with a 1/1.45 aspect ratio. The moment
        // the inline feedback panel (up to 48vh) opened, the table was CLIPPED
        // instead of scaled -- the felt got cut off mid-height and hero's avatar
        // ended up floating in the middle of the visible area. Letting the table
        // scale keeps every seat, the button and the chips proportional, because
        // they are all positioned in percentages.
        flex: 1,
        minHeight: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
        padding: 0,
    },

    // ── THE TABLE — a rounded-oval felt INSET into a deep near-black rail.
    //    `basicTable` is the RAIL (the dark patterned surround); `feltSurface`
    //    is the recessed green felt drawn inside it. Two layers, because the
    //    felt has to read as sunk into the furniture rather than painted on it.
    //    NO overflow hidden so seats stay visible (see tableArea).
    basicTable: {
        position: 'relative',
        boxSizing: 'border-box',
        width: '92%',
        maxWidth: 440,
        aspectRatio: '1 / 1.45',
        borderRadius: '50% / 26%',
        background: [
            'radial-gradient(ellipse at 50% 8%, rgba(255,190,70,0.05) 0%, rgba(255,190,70,0) 55%)',
            'linear-gradient(180deg, #0b0b0d 0%, #060607 58%, #030304 100%)',
        ].join(', '),
        // OUTER GOLD RING of the racetrack rail. The rail reads as two
        // concentric BRIGHT gold hoops with a black channel between them: this
        // border is hoop one, `feltSurface`'s ring is hoop two. Both hoops carry
        // their own soft outer bloom -- in the template they glow, they are not
        // just drawn.
        border: '2.5px solid #e8bd4e',
        boxShadow: [
            '0 26px 60px rgba(0,0,0,0.85)',
            '0 0 26px rgba(232,189,78,0.38)',
            '0 0 60px rgba(232,189,78,0.14)',
            'inset 0 0 0 1px rgba(255,224,150,0.45)',
            'inset 0 -22px 44px rgba(0,0,0,0.55)',
        ].join(', '),
        margin: '0 auto',
        // Shrink with the container rather than overflow it (see tableArea).
        flexShrink: 1,
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },

    // The recessed felt. `inset` is applied inline from ui() so the rail keeps
    // its proportion when the table shrinks.
    feltSurface: {
        position: 'absolute',
        borderRadius: '50% / 26%',
        background: [
            'radial-gradient(ellipse at 50% 34%, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0) 60%)',
            'radial-gradient(ellipse at 50% 44%, #1a1a1c 0%, #121214 38%, #0a0a0b 72%, #050506 100%)',
        ].join(', '),
        boxShadow: [
            'inset 0 12px 30px rgba(0,0,0,0.62)',
            'inset 0 -16px 38px rgba(0,0,0,0.58)',
            // INNER GOLD RING (hoop two of the racetrack rail).
            '0 0 0 2.5px #e8bd4e',
            '0 0 22px rgba(232,189,78,0.32)',
        ].join(', '),
        pointerEvents: 'none',
        zIndex: 0,
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
        color: 'var(--sp-fg-muted)',
        letterSpacing: 0.5,
        fontFamily: "'Inter', sans-serif",
    },

    questionPrompt: {
        position: 'sticky',
        top: 0,
        zIndex: 60,
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: '10px 16px',
        // Depth: a lit rail across the top of the HUD, not a floating card.
        background: 'linear-gradient(180deg, rgba(10,16,30,0.98) 0%, rgba(8,12,24,0.94) 100%)',
        borderBottom: '1px solid rgba(0,212,255,0.28)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)',
        color: '#e8f4f8',
        fontSize: 14,
        lineHeight: 1.4,
        fontWeight: 600,
        flexShrink: 0,
    },
    questionPromptLabel: {
        flexShrink: 0,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 1.4,
        color: '#00d4ff',
        textTransform: 'uppercase',
        textShadow: '0 0 10px rgba(0,212,255,0.5)',
    },
    questionPromptText: {
        flex: 1,
        minWidth: 0,
    },

    // The question and the scenario are ONE unit, and they belong to the table
    // -- they describe the felt directly beneath them. The page header above
    // carries identity and progress (game name, score, hand number); it is not
    // where you read what you are being asked.
    spotBlock: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        width: '100%',
        textTransform: 'none',
        letterSpacing: 'normal',
    },
    spotQuestion: {
        fontSize: 15,
        fontWeight: 700,
        lineHeight: 1.35,
        color: '#eaf6fb',
        textTransform: 'none',
        letterSpacing: 0.1,
        textShadow: '0 1px 6px rgba(0,0,0,0.7)',
    },
    spotContext: {
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 1.3,
        textTransform: 'uppercase',
        color: 'rgba(0,212,255,0.85)',
    },

    // Session modes, folded into the HUD cluster.
    modeGroup: {
        display: 'inline-flex',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 7,
        overflow: 'hidden',
        background: 'rgba(0,0,0,0.25)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
    },
    modeButton: {
        padding: '3px 9px',
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 0.8,
        border: 'none',
        background: 'transparent',
        color: 'var(--sp-fg-dim)',
        cursor: 'pointer',
        transition: 'background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
    },
    modeButtonRng: {
        background: 'rgba(168,85,247,0.22)',
        color: '#c084fc',
        boxShadow: 'inset 0 0 12px rgba(168,85,247,0.35)',
    },
    modeButtonStudy: {
        background: 'rgba(0,212,255,0.18)',
        color: '#00d4ff',
        boxShadow: 'inset 0 0 12px rgba(0,212,255,0.3)',
    },

    // The one rail that replaced six stacked strips.
    sessionRail: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 16px 9px',
        flexShrink: 0,
    },
    sessionRailTrack: {
        position: 'relative',
        flex: 1,
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.05)',
        // Depth: the track is cut into the surface, the fill sits proud of it.
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.65), inset 0 -1px 0 rgba(255,255,255,0.04)',
    },
    sessionRailFill: {
        position: 'relative',
        display: 'flex',
        height: '100%',
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 0 14px rgba(0,212,255,0.35)',
    },
    sessionRailHead: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: 2,
        background: '#ffffff',
        boxShadow: '0 0 8px 2px rgba(0,212,255,0.85)',
    },
    sessionRailEV: {
        flexShrink: 0,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.6,
        fontFamily: "'Inter', sans-serif",
        fontVariantNumeric: 'tabular-nums',
    },

    // The one switch that guards the depth.
    analysisToggle: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        padding: '7px 12px',
        marginTop: 2,
        borderRadius: 8,
        border: '1px solid rgba(0,212,255,0.22)',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.10) 0%, rgba(0,212,255,0.03) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        color: '#7fdfff',
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1.2,
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
    },
    analysisToggleOpen: {
        borderColor: 'rgba(0,212,255,0.45)',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.18) 0%, rgba(0,212,255,0.06) 100%)',
        color: '#00d4ff',
    },
    analysisToggleCaret: {
        fontSize: 11,
        lineHeight: 1,
    },
    chipStack: {
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px 2px 3px',
        borderRadius: 10,
        background: 'rgba(5, 10, 20, 0.72)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        pointerEvents: 'none',
        zIndex: 6,
    },
    chipDisc: {
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #f7d774 0%, #d4a017 55%, #9a7412 100%)',
        border: '1px solid rgba(0, 0, 0, 0.45)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
        display: 'inline-block',
        flexShrink: 0,
    },
    chipAmount: {
        fontSize: 10,
        fontWeight: 700,
        color: '#f8fafc',
        lineHeight: 1,
        whiteSpace: 'nowrap',
    },
    dealerButton: {
        position: 'absolute',
        top: -14,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 34% 28%, #fff6dc 0%, #f3d489 45%, #c99b2a 100%)',
        color: '#3a2a05',
        fontSize: 9,
        fontWeight: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(90,64,10,0.7)',
        boxShadow: '0 3px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.8)',
        zIndex: 10,
    },

    badge: {
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 'bold',
        color: 'var(--sp-fg-muted)',
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
        color: 'var(--sp-fg)',
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
        color: 'var(--sp-fg)',
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
        top: '38%',
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

    // POT — the template floats it in the UPPER middle of the felt, not down
    // by the brand. The window is tight: the top row of villains bottoms out
    // around 24% of the felt and the board's top edge is at 32%, so the pill
    // lives at 29% where it clears both.
    pot: {
        position: 'absolute',
        top: '29%',
        left: '50%',
        // NOTE: Do NOT use CSS transform here — framer-motion's scale animation overrides it.
        // x/y are set inline on the <motion.div> to compose with scale.
        color: 'var(--sp-fg)',
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

    // Centred on the table and a little wider than it, so its two corners land
    // just outside the oval on a desktop and on the oval's dead corners on a
    // phone. pointerEvents off; the pill and the clock are both read-only.
    feltCornerRail: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 4,
    },

    feltCornerRailInner: {
        position: 'relative',
        width: '96%',
        maxWidth: 560,
        height: '100%',
    },

    countdownSlot: {
        position: 'absolute',
        // #48: mirrors the question pill's inset so the two corner items sit on
        // the same margin instead of one hugging the edge and one not.
        left: 10,
        bottom: 10,
    },

    questionOfPill: {
        position: 'absolute',
        // #48: measured at 375px the pill's right edge landed exactly on the
        // viewport edge, so its border and glow were shaved off and it read as
        // clipped rather than placed. An inset is what makes it look deliberate.
        right: 10,
        bottom: 16,
        padding: '6px 12px',
        borderRadius: 8,
        background: 'rgba(4,10,16,0.85)',
        border: '1px solid rgba(0,212,255,0.45)',
        color: 'var(--sp-accent-cyan)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.6,
        whiteSpace: 'nowrap',
        fontFamily: "'Inter', monospace",
        boxShadow: '0 0 12px rgba(0,212,255,0.12)',
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
        color: 'var(--sp-fg-muted)',
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
        color: 'var(--sp-fg-muted)',
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
        color: 'var(--sp-accent-cyan)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    actionHistoryAction: {
        fontSize: 10,
        color: 'var(--sp-fg)',
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
        color: 'var(--sp-fg-muted)',
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
        color: 'var(--sp-fg-dim)',
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
        color: 'var(--sp-fg-muted)',
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
        display: 'grid',
        gap: 8,
        // #48: the "YOUR ACTION" indicator is absolutely positioned against this
        // bar and used to hang ABOVE it at top:-20, straight through whatever
        // sat there — measured on production it overlapped the hint text by 7px.
        // Reserving the strip inside the bar's own padding is the only placement
        // that cannot collide with a sibling whose height it does not control.
        padding: '22px 12px 12px',
        flexShrink: 0,
    },

    actionButtonWrapper: {
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
    },

    actionButton: {
        position: 'relative',
        padding: '10px 8px',
        // Two rows of buttons instead of one: keep each row shorter so the grid
        // does not eat the felt's height on a short phone.
        minHeight: 54,
        fontSize: 14,
        fontWeight: 800,
        fontFamily: "'Inter', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        background: 'var(--sp-fg-faint)',
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

    // ── INLINE FEEDBACK (genuinely inline panel below the action bar —
    //    the table stays visible above; this panel scrolls internally)
    feedbackInline: {
        position: 'relative',
        width: '100%',
        maxHeight: '40vh',
        overflowY: 'auto',
        background: 'rgba(5,10,20,0.92)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 8,
        padding: '24px 20px',
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
        color: 'var(--sp-fg-muted)',
    },

    evLossValue: {
        color: 'var(--sp-accent-red)',
        fontWeight: 'bold',
        fontFamily: "'Inter', 'Courier New', monospace",
    },

    feedbackExplanation: {
        fontSize: 12,
        lineHeight: 1.5,
        color: 'var(--sp-fg)',
        textAlign: 'center',
    },
};

export default memo(UniversalDynamicTable);