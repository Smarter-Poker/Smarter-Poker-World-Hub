/**
 * Sandbox Sub-Components
 * - RangeMatrix (13x13 heatmap)
 * - FrequencyBar (animated action bar)
 * - classifyBoardTexture (auto-classify boards)
 * - ActionHistoryBuilder
 * - SizingSensitivity
 * - TreeVisualization
 * - OnboardingTour
 */
import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Check, X as XIcon, Camera, Share2, Spade } from 'lucide-react';
import { SocialService } from '../../services/SocialService';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';
import toast from '../../stores/toastStore';
import { claimReward } from '../../lib/claimReward';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const BET_ACTIONS = [
    { id: 'fold', label: 'Fold' }, { id: 'check', label: 'Check' },
    { id: 'call', label: 'Call' }, { id: 'bet_33', label: 'Bet 33%' },
    { id: 'bet_50', label: 'Bet 50%' }, { id: 'bet_66', label: 'Bet 66%' },
    { id: 'bet_75', label: 'Bet 75%' }, { id: 'bet_100', label: 'Bet Pot' },
    { id: 'bet_150', label: 'Bet 150%' }, { id: 'raise', label: 'Raise' },
    { id: 'allin', label: 'All-In' }, { id: 'custom', label: 'Custom...' },
];

// ═══════════════════════════════════════════════════════════════════════════
// ACTION GRADING — shared by QuizPanel, CoachVerdict and sandbox.js
// Bet/raise sizings are graded on BUCKETS so "Bet Small" is NOT counted as
// correct against "Bet Pot". Buckets: small <=40%, medium 41-75%, large 76-99%,
// pot >=100%.
// ═══════════════════════════════════════════════════════════════════════════
const WORD_BUCKETS = { small: 'small', third: 'small', half: 'medium', medium: 'medium', large: 'large', big: 'large', pot: 'pot', overbet: 'pot' };

export function sizeBucketFromPercent(pct) {
    if (pct == null || !Number.isFinite(pct)) return null;
    if (pct >= 100) return 'pot';
    if (pct > 75) return 'large';
    if (pct > 40) return 'medium';
    return 'small';
}

/**
 * Parse an action label ('Bet 66%', 'bet_150', 'Bet Small', 'All-In', 'Check')
 * into { type, size } where size is a bucket string or null when unknown.
 */
export function parseActionLabel(label) {
    const raw = String(label || '').trim().toLowerCase();
    if (!raw) return { type: null, size: null };

    let type = null;
    if (raw.includes('all-in') || raw.includes('all in') || raw.includes('allin') || raw.includes('shove')) type = 'allin';
    else if (raw.includes('fold')) type = 'fold';
    else if (raw.includes('check')) type = 'check';
    else if (raw.includes('raise') || raw.includes('3bet') || raw.includes('3-bet')) type = 'raise';
    else if (raw.includes('call')) type = 'call';
    else if (raw.includes('bet')) type = 'bet';
    else type = raw.split(/[\s_]/)[0] || null;

    let size = null;
    if (type === 'bet' || type === 'raise') {
        // Percent form ('Bet 66%') or solver id form ('bet_150'). Deliberately
        // NOT a bare \d+ so '3-Bet' is not read as a 3% sizing.
        const numMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/) || raw.match(/^(?:bet|raise)[_\s-](\d+(?:\.\d+)?)$/);
        if (numMatch) {
            size = sizeBucketFromPercent(parseFloat(numMatch[1]));
        } else {
            for (const word of Object.keys(WORD_BUCKETS)) {
                if (raw.includes(word)) { size = WORD_BUCKETS[word]; break; }
            }
        }
    }
    return { type, size };
}

/**
 * Grade a user's action label against the GTO label.
 * Returns true only when the action type matches AND — when both labels carry a
 * usable sizing — the size buckets match too.
 */
export function gradeAction(userLabel, gtoLabel) {
    const a = parseActionLabel(userLabel);
    const b = parseActionLabel(gtoLabel);
    if (!a.type || !b.type) return false;
    if (a.type !== b.type) return false;
    // Only enforce sizing discipline when BOTH sides expose a size
    if (a.size && b.size) return a.size === b.size;
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// FREQUENCY BAR
// ═══════════════════════════════════════════════════════════════════════════
export function FrequencyBar({ action, isOptimal }) {
    return (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{
                    color: isOptimal ? '#22c55e' : '#B0B3B8', fontSize: '13px',
                    fontWeight: isOptimal ? '700' : '500', display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                    {isOptimal && <Check size={12} strokeWidth={3} style={{ color: '#22c55e', flexShrink: 0 }} aria-hidden="true" />}
                    {action.label}
                </span>
                <span style={{
                    color: isOptimal ? '#22c55e' : '#E4E6EB', fontSize: '13px',
                    fontWeight: '700', fontFamily: "'Orbitron', monospace",
                }}>
                    {action.frequency}%
                </span>
            </div>
            <div style={{ height: '8px', background: '#3A3B3C', borderRadius: '4px', overflow: 'hidden' }}>
                <motion.div
                    initial={{ width: 0 }} animate={{ width: `${action.frequency}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{
                        height: '100%', borderRadius: '4px',
                        background: isOptimal
                            ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                            : `linear-gradient(90deg, ${action.color || '#2374E1'}, ${action.color || '#2374E1'}88)`,
                    }}
                />
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// RANGE MATRIX (13x13)
// ═══════════════════════════════════════════════════════════════════════════
function getMatrixHandKey(row, col) {
    if (row === col) return `${RANKS[row]}${RANKS[col]}`;
    if (col > row) return `${RANKS[row]}${RANKS[col]}s`;
    return `${RANKS[col]}${RANKS[row]}o`;
}

function getMatrixColor(freq) {
    if (freq == null) return 'rgba(255,255,255,0.03)';
    if (freq >= 90) return '#22c55e'; if (freq >= 70) return '#4ade80';
    if (freq >= 50) return '#86efac'; if (freq >= 30) return '#fbbf24';
    if (freq >= 15) return '#f97316'; if (freq > 0) return '#ef4444';
    return 'rgba(255,255,255,0.03)';
}

// Module-level memoized cell — only the two cells whose isHovered flips re-render
// when the pointer sweeps across the 169-cell grid.
const MatrixCell = memo(function MatrixCell({ handKey, freq, isHovered, onHover }) {
    return (
        <div
            onMouseEnter={() => onHover(handKey)}
            onMouseLeave={() => onHover(null)}
            style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '9px', fontWeight: '600', color: freq > 50 ? '#000' : '#E4E6EB',
                background: getMatrixColor(freq), cursor: 'pointer', transition: 'all 0.15s',
                opacity: isHovered ? 1 : 0.85,
                border: isHovered ? '1px solid #fff' : '1px solid transparent',
            }}
        >{handKey}</div>
    );
});

export function RangeMatrix({ rangeHeatmap, selectedAction }) {
    const [hoveredHand, setHoveredHand] = useState(null);
    const handleHover = useCallback((hk) => { setHoveredHand(hk); }, []);
    if (!rangeHeatmap?.data) return null;
    const actionId = selectedAction || rangeHeatmap.actions?.[0]?.id;

    return (
        <div style={{ position: 'relative' }}>
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '1px',
                background: '#3A3B3C', borderRadius: '8px', overflow: 'hidden', padding: '1px',
            }}>
                {RANKS.map((_, row) => RANKS.map((_, col) => {
                    const hk = getMatrixHandKey(row, col);
                    const freq = rangeHeatmap.data[hk]?.[actionId] ?? null;
                    return (
                        <MatrixCell key={`${row}-${col}`}
                            handKey={hk} freq={freq}
                            isHovered={hoveredHand === hk}
                            onHover={handleHover}
                        />
                    );
                }))}
            </div>
            {hoveredHand && rangeHeatmap.data[hoveredHand] && (
                <div style={{
                    position: 'absolute', bottom: -55, left: '50%', transform: 'translateX(-50%)',
                    background: '#242526', border: '1px solid #3A3B3C',
                    borderRadius: '8px', padding: '6px 10px', zIndex: 10, whiteSpace: 'nowrap', fontSize: '11px', color: '#E4E6EB',
                }}>
                    <strong>{hoveredHand}</strong>
                    {rangeHeatmap.actions?.slice(0, 4).map(a => (
                        <span key={a.id} style={{ marginLeft: '8px', color: a.id === actionId ? '#22c55e' : '#B0B3B8' }}>
                            {a.label}: {rangeHeatmap.data[hoveredHand][a.id] ?? 0}%
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOARD TEXTURE CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════
const RANK_ORDER = 'AKQJT98765432';

// Connectivity is measured on the tightest 3-card window. The wheel is handled
// by also scoring A as low (rank value 13 => "1"), so A23 / A45 read connected.
function minWindowGap(rankIdxs) {
    const sorted = [...new Set(rankIdxs)].sort((a, b) => a - b);
    if (sorted.length < 3) return 99;
    let best = 99;
    for (let i = 0; i + 2 < sorted.length; i++) {
        best = Math.min(best, sorted[i + 2] - sorted[i]);
    }
    return best;
}

export function classifyBoardTexture(board) {
    const flop = board?.flop || [];
    if (flop.length < 3) return null;

    // Full runout: flop + turn + river (whatever exists)
    const cards = [...flop, board?.turn, board?.river].filter(Boolean);
    const suits = cards.map(c => String(c)[String(c).length - 1]?.toLowerCase()).filter(Boolean);
    const rankChars = cards.map(c => String(c)[0]?.toUpperCase()).filter(Boolean);
    const rankIdxs = rankChars.map(r => RANK_ORDER.indexOf(r)).filter(i => i >= 0);

    // Suit counts across the WHOLE board — used only for "is a flush already
    // possible", never for the monotone/two-tone/rainbow tag: on a complete
    // 5-card board the pigeonhole principle forces maxSuit >= 2, which would
    // make RAINBOW (and therefore DRY) unreachable and would relabel any river
    // holding three of a suit as MONOTONE.
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuit = Object.values(suitCounts).reduce((m, n) => Math.max(m, n), 0);
    const flushPossible = maxSuit >= 3;

    // The monotone/two-tone/rainbow tag is a property of the FLOP.
    const flopSuits = flop.map(c => String(c)[String(c).length - 1]?.toLowerCase()).filter(Boolean);
    const flopSuitCounts = {};
    flopSuits.forEach(s => { flopSuitCounts[s] = (flopSuitCounts[s] || 0) + 1; });
    const maxFlopSuit = Object.values(flopSuitCounts).reduce((m, n) => Math.max(m, n), 0);
    const isMonotone = maxFlopSuit >= 3;                   // all three flop cards same suit
    const isTwoTone = !isMonotone && maxFlopSuit === 2;    // flush draw live off the flop
    const isRainbow = maxFlopSuit <= 1;

    // Rank counts across the whole board
    const rankCounts = {};
    rankIdxs.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    const maxRank = Object.values(rankCounts).reduce((m, n) => Math.max(m, n), 0);
    const isPaired = maxRank >= 2;
    const isTrips = maxRank >= 3;

    // Connectivity — evaluate with A high and, for the wheel, A low
    const gapHigh = minWindowGap(rankIdxs);
    const wheelIdxs = rankIdxs.map(r => (r === 0 ? 13 : r)); // A -> below 2
    const gapLow = minWindowGap(wheelIdxs);
    const gap = Math.min(gapHigh, gapLow);
    const isConnected = gap <= 4 && !isTrips;

    const isHighBoard = rankIdxs.length > 0 && Math.min(...rankIdxs) <= 4; // A=0,K=1,Q=2,J=3,T=4
    const isDry = isRainbow && !flushPossible && !isConnected && !isPaired && gap >= 6;
    const isWet = (flushPossible || isMonotone || isTwoTone) && isConnected;

    let label, color, textColor, strategy;
    if (isTrips) { label = '3-OF-A-KIND BOARD'; color = 'rgba(236,72,153,0.2)'; textColor = '#f472b6'; strategy = 'Very dry — high c-bet frequency, small sizing'; }
    else if (isMonotone) { label = 'MONOTONE'; color = 'rgba(239,68,68,0.2)'; textColor = '#fca5a5'; strategy = 'Flush-heavy board — reduce c-bet freq, check more with non-flush hands'; }
    else if (flushPossible) { label = 'FLUSH POSSIBLE'; color = 'rgba(239,68,68,0.15)'; textColor = '#fca5a5'; strategy = 'Three to a flush on board — size down and check back marginal made hands'; }
    else if (isWet) { label = 'WET / CONNECTED'; color = 'rgba(251,191,36,0.2)'; textColor = '#fde68a'; strategy = 'Many draws possible — polarize bet sizing, protect strong hands'; }
    else if (isDry) { label = 'DRY'; color = 'rgba(34,197,94,0.2)'; textColor = '#86efac'; strategy = 'Few draws — high c-bet frequency, use small sizing (25-33%)'; }
    else if (isPaired) { label = 'PAIRED'; color = 'rgba(139,92,246,0.2)'; textColor = '#c4b5fd'; strategy = 'Paired boards favor preflop raiser — c-bet with high frequency'; }
    else if (isHighBoard) { label = 'HIGH CARDS'; color = 'rgba(59,130,246,0.2)'; textColor = '#93c5fd'; strategy = 'Favors the in-position or preflop aggressor range'; }
    else { label = isTwoTone ? 'TWO-TONE' : 'RAINBOW'; color = 'rgba(100,116,139,0.2)'; textColor = '#94a3b8'; strategy = 'Standard texture — play position and range advantage'; }

    return { label, color, textColor, strategy, isMonotone, isTwoTone, isRainbow, flushPossible, isPaired, isConnected, isDry, isWet };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION HISTORY BUILDER
// ═══════════════════════════════════════════════════════════════════════════
export function ActionHistoryBuilder({ actions, onAdd, onRemove, potSize }) {
    const [adding, setAdding] = useState(false);
    const [newAction, setNewAction] = useState({ position: 'BTN', action: 'bet_66' });
    const [customPct, setCustomPct] = useState(75);
    const sty = { padding: '6px 10px', borderRadius: '6px', fontSize: '12px', background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB' };

    const handleAdd = () => {
        let label;
        if (newAction.action === 'custom') {
            label = `Bet ${customPct}%`;
        } else {
            label = BET_ACTIONS.find(b => b.id === newAction.action)?.label;
        }
        onAdd({ ...newAction, action: newAction.action === 'custom' ? `bet_${customPct}` : newAction.action, label });
        setAdding(false);
    };

    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontWeight: '700' }}>
                    Action History
                </h4>
                <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', fontFamily: "'Orbitron',monospace", background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
                    Pot: {(Number(potSize) || 0).toFixed(1)} BB
                </span>
            </div>
            {actions.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                    {actions.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 8px', borderRadius: '5px', fontSize: '10px', background: '#3A3B3C', color: '#E4E6EB' }}>
                            <span style={{ fontWeight: '700', color: '#4599FF' }}>{a.position}</span>
                            <span>{a.label}</span>
                            <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: '0 2px' }}>x</button>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ color: '#65676B', fontSize: '11px', marginBottom: '8px', fontStyle: 'italic' }}>No actions -- build the betting line</div>
            )}
            {adding ? (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={newAction.position} onChange={e => setNewAction({ ...newAction, position: e.target.value })} style={sty}>
                        {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={newAction.action} onChange={e => setNewAction({ ...newAction, action: e.target.value })} style={sty}>
                        {BET_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                    {newAction.action === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 100%', marginTop: '4px' }}>
                            <input type="range" min="10" max="200" step="5" value={customPct}
                                onChange={e => setCustomPct(Number(e.target.value))}
                                style={{ flex: 1, accentColor: '#8b5cf6' }} />
                            <span style={{ color: '#c4b5fd', fontSize: '12px', fontWeight: '700', minWidth: '40px' }}>{customPct}%</span>
                        </div>
                    )}
                    <button onClick={handleAdd}
                        style={{ ...sty, background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', cursor: 'pointer', fontWeight: '600' }}>OK</button>
                    <button onClick={() => setAdding(false)} style={{ ...sty, background: 'rgba(239,68,68,0.1)', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>X</button>
                </div>
            ) : (
                <button onClick={() => setAdding(true)} style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', background: '#3A3B3C', border: '1px dashed #4E4F50', color: '#B0B3B8', cursor: 'pointer', width: '100%' }}>
                    + Add Action
                </button>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SIZING SENSITIVITY
// ═══════════════════════════════════════════════════════════════════════════
// Column definition — match on a NORMALIZED bet-size percentage, never on label
// substrings ('50%' used to also match 'Bet 150%'). The analyze API emits ids
// like `b25`/`b66`/`b100`; external solver imports may use `bet_66`.
const SIZING_COLUMNS = [
    { label: '25%', pct: 25 },
    { label: '33%', pct: 33 },
    { label: '50%', pct: 50 },
    { label: '66%', pct: 66 },
    { label: '75%', pct: 75 },
    { label: 'Pot', pct: 100 },
    { label: '150%', pct: 150 },
];

/**
 * Extract a bet-size percentage from a solver action.
 * Accepts `b66`, `bet_66`, `raise-75`, 'Bet 66%', 'Overbet 150%' and 'Bet Pot'.
 * Returns null when the action carries no usable sizing.
 */
export function betSizePercent(action) {
    if (!action) return null;
    const id = String(action.id || '').trim().toLowerCase();
    let m = id.match(/^(?:b|bet|r|raise)[_\s-]?(\d+(?:\.\d+)?)$/);
    if (m) return parseFloat(m[1]);
    const label = String(action.label || '').trim().toLowerCase();
    m = label.match(/(\d+(?:\.\d+)?)\s*%/);
    if (m) return parseFloat(m[1]);
    if (/\bpot\b/.test(label) && !/\d/.test(label)) return 100;
    return null;
}

export function SizingSensitivity({ results }) {
    if (!results?.actions) return null;
    const betActions = results.actions.filter(a =>
        betSizePercent(a) != null || /bet/i.test(String(a.label || ''))
    );
    if (betActions.length === 0) return null;

    return (
        <div style={{ background: '#3A3B3C', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
            <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px', fontWeight: '700' }}>
                Sizing Sensitivity
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SIZING_COLUMNS.length}, 1fr)`, gap: '4px' }}>
                {SIZING_COLUMNS.map(({ label: size, pct }) => {
                    // Sum in case the solver returns two ids that normalize to
                    // the same sizing (e.g. `b100` and 'Bet Pot').
                    const freq = Math.round(betActions.reduce((sum, a) => {
                        const p = betSizePercent(a);
                        return p != null && Math.abs(p - pct) < 0.5 ? sum + (Number(a.frequency) || 0) : sum;
                    }, 0));
                    return (
                        <div key={size} style={{ textAlign: 'center' }}>
                            <div style={{
                                height: '40px', background: '#242526', borderRadius: '4px',
                                position: 'relative', overflow: 'hidden',
                            }}>
                                <motion.div initial={{ height: 0 }} animate={{ height: `${freq}%` }}
                                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: freq > 30 ? '#2374E1' : '#1a5db8', borderRadius: '4px' }} />
                            </div>
                            <div style={{ fontSize: '9px', color: '#B0B3B8', marginTop: '3px' }}>{size}</div>
                            <div style={{ fontSize: '10px', color: '#E4E6EB', fontWeight: '600' }}>{freq}%</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TREE VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════
export function TreeVisualization({ actions }) {
    if (!actions || actions.length === 0) return null;

    return (
        <div style={{ background: '#3A3B3C', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
            <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px', fontWeight: '700' }}>
                Decision Tree
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Root node */}
                <div style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                    background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.3)', color: '#4599FF', marginBottom: '8px',
                }}>Hero Decision</div>
                {/* Branches */}
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {actions.filter(a => a.frequency > 0).map((action, i) => (
                        <div key={action.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: '1px', height: '16px', background: action.color || '#2374E1' }} />
                            <div style={{
                                padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                                background: `${action.color || '#2374E1'}22`, border: `1px solid ${action.color || '#2374E1'}44`,
                                color: action.color || '#4599FF', textAlign: 'center', minWidth: '50px',
                            }}>
                                <div>{action.label}</div>
                                <div style={{ fontSize: '11px', fontWeight: '700', marginTop: '2px' }}>{action.frequency}%</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING TOUR
// ═══════════════════════════════════════════════════════════════════════════
const TOUR_STEPS = [
    { target: 'hero-setup', title: 'Hero Setup', text: 'Select your hole cards, position, and stack size. Click cards directly from the visual deck below.' },
    { target: 'board-builder', title: 'Board Builder', text: 'Add flop, turn, and river cards. Use presets for common textures or click "Random" for exploration.' },
    { target: 'action-history', title: 'Action History', text: 'Build the betting line step by step. The pot calculates dynamically as you add actions.' },
    { target: 'run-analysis', title: 'Run Analysis', text: 'Generates GTO-optimal frequencies from PIO solver data. Results show per-action frequencies and EV.' },
    { target: 'results-panel', title: 'Results Panel', text: 'View frequency bars, EV analysis, and the range heatmap. Green badge = real solver data, purple = AI approximation.' },
];

export function OnboardingTour({ isVisible, onClose, onNext, step = 0 }) {
    const current = TOUR_STEPS[step] || null;
    const targetId = current?.target || null;
    const [rect, setRect] = useState(null);

    // Spotlight: scroll the referenced element into view and track its box so the
    // highlight ring stays glued to it. Falls back to a centered modal when the
    // target is not on the page.
    useEffect(() => {
        if (!isVisible || !targetId || typeof document === 'undefined') { setRect(null); return undefined; }
        const el = document.getElementById(targetId);
        if (!el) { setRect(null); return undefined; }

        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

        let cancelled = false;
        const measure = () => {
            if (cancelled) return;
            const r = el.getBoundingClientRect();
            if (!r || (r.width === 0 && r.height === 0)) { setRect(null); return; }
            setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        };
        measure();
        const settle = setTimeout(measure, 350); // after the smooth scroll lands
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            cancelled = true;
            clearTimeout(settle);
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [isVisible, targetId, step]);

    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0;
    const placeBelow = !rect || (rect.top + rect.height + 220 < viewportH) || rect.top < 240;
    const cardStyle = rect
        ? {
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            ...(placeBelow
                ? { top: Math.min(Math.max(rect.top + rect.height + 16, 12), Math.max(viewportH - 220, 12)) }
                : { bottom: Math.min(Math.max(viewportH - rect.top + 16, 12), Math.max(viewportH - 60, 12)) }),
        }
        : {};

    return (
        <AnimatePresence>
            {isVisible && current && (
                <motion.div
                    key="sandbox-tour"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        // When spotlighting, the scrim comes from the ring's huge
                        // box-shadow so the target itself stays un-dimmed.
                        background: rect ? 'transparent' : 'rgba(0,0,0,0.7)',
                        display: rect ? 'block' : 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    {/* Spotlight ring around the referenced element */}
                    {rect && (
                        <motion.div
                            layout
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{
                                position: 'absolute',
                                top: rect.top - 6, left: rect.left - 6,
                                width: rect.width + 12, height: rect.height + 12,
                                borderRadius: '12px', pointerEvents: 'none',
                                border: '2px solid #4599FF',
                                boxShadow: '0 0 0 9999px rgba(0,0,0,0.7), 0 0 24px rgba(69,153,255,0.55)',
                            }}
                        />
                    )}
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
                        style={{
                            background: '#242526', border: '1px solid #3A3B3C',
                            borderRadius: '16px', padding: '24px', maxWidth: '380px', width: '90%',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                            ...cardStyle,
                        }}
                    >
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#E4E6EB', marginBottom: '8px', fontFamily: "'Orbitron',sans-serif" }}>
                            {current.title}
                        </div>
                        <p style={{ color: '#B0B3B8', fontSize: '13px', lineHeight: 1.6, margin: '0 0 16px' }}>
                            {current.text}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#65676B', fontSize: '11px' }}>{step + 1} of {TOUR_STEPS.length}</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={onClose} style={{
                                    padding: '6px 14px', borderRadius: '8px', fontSize: '12px',
                                    background: 'none', border: '1px solid #3A3B3C', color: '#B0B3B8', cursor: 'pointer',
                                }}>Skip</button>
                                <button onClick={() => step < TOUR_STEPS.length - 1 ? onNext() : onClose()} style={{
                                    padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                                    background: 'linear-gradient(135deg, #2374E1, #4599FF)', border: 'none', color: '#fff', cursor: 'pointer',
                                }}>{step < TOUR_STEPS.length - 1 ? 'Next' : 'Get Started'}</button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// SHARE MODAL
// ═══════════════════════════════════════════════════════════════════════
export function ShareAnalysisModal({ isOpen, onClose, results, scenario }) {
    const [isPosting, setIsPosting] = useState(false);
    const closeTimerRef = useRef(null);

    // Never leave a pending auto-close timer behind — it would fire onClose (and
    // the parent setState) after the modal/page has already gone away.
    useEffect(() => () => {
        if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    }, []);

    useEffect(() => {
        if (!isOpen && closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    }, [isOpen]);

    if (!isOpen || !results) return null;

    const shareText = `GTO Analysis: ${results.heroHand || 'Hand'} on ${scenario?.board || 'Board'}\n` +
        `Optimal: ${results.optimalAction?.label} (${results.optimalAction?.frequency}%)\n` +
        `${results.isMixed ? 'Mixed Strategy' : 'Pure Strategy'}\n` +
        `Source: ${results.source}\n` +
        `Analyze your hands at Smarter.Poker`;

    const handleNativeShare = async () => {
        try {
            if (navigator.share) {
                await navigator.share({ title: 'GTO Analysis — Smarter.Poker', text: shareText, url: 'https://smarter.poker/hub/personal-assistant/sandbox' });
            } else { handleCopy(); }
        } catch (e) { console.debug('Share cancelled'); }
    };
    const handleCopy = () => { navigator.clipboard?.writeText(shareText); toast.success('Copied to clipboard!'); };

    const handleInternalPost = async () => {
        try {
            setIsPosting(true);
            const user = getAuthUser();
            if (!user) {
                toast.error('You must be logged in to post.');
                return;
            }

            const socialService = new SocialService(supabase);
            const displayContent = `I just analyzed a hand in the GTO Sandbox!\n\n` +
                `**Hero:** ${results.heroHand || 'Hand'} on ${scenario?.board || 'Preflop'}\n` +
                `**Optimal line:** ${results.optimalAction?.label} (${results.optimalAction?.frequency}%)\n\n` +
                `*${results.explanation?.substring(0, 150) || 'Check out my full analysis on Smarter.Poker.'}...*`;

            const newPost = await socialService.createPost({
                authorId: user.id,
                content: displayContent,
                contentType: 'text',
                visibility: 'public'
            });

            if (newPost) {
                claimReward('/api/rewards/social-post', { userId: user.id, postId: newPost.id }, 'New Post Published');
                toast.success('Posted to your feed!', 2000);
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
                closeTimerRef.current = setTimeout(() => { closeTimerRef.current = null; onClose?.(); }, 1500);
            }
        } catch (err) {
            console.warn('Feed post error:', err);
            toast.error('Failed to post to feed.');
        } finally {
            setIsPosting(false);
        }
    };

    const channels = [
        { label: isPosting ? '...' : 'Smarter.Poker', onClick: handleInternalPost },
        { label: 'Copy', onClick: handleCopy },
        { label: 'Share', onClick: handleNativeShare },
        { label: 'Twitter', onClick: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank') },
        { label: 'Facebook', onClick: () => window.open(`https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(shareText)}`, '_blank') },
    ];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} style={{
                background: '#242526', border: '1px solid #3A3B3C',
                borderRadius: '16px', padding: '24px', maxWidth: '400px', width: '90%',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#E4E6EB' }}>Share Analysis</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#B0B3B8', cursor: 'pointer', fontSize: '18px' }}>×</button>
                </div>
                <div style={{ background: '#3A3B3C', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '12px', color: '#E4E6EB', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                    {shareText}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {channels.map((ch, idx) => (
                        <button key={ch.label} onClick={ch.onClick} disabled={isPosting && idx === 0} style={{
                            padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: '600',
                            background: idx === 0 ? 'linear-gradient(135deg, #2374E1, #4599FF)' : '#3A3B3C',
                            border: idx === 0 ? 'none' : '1px solid #4E4F50',
                            color: '#E4E6EB', cursor: isPosting && idx === 0 ? 'wait' : 'pointer',
                            opacity: isPosting && idx === 0 ? 0.7 : 1,
                            gridColumn: idx === 0 ? '1 / -1' : 'auto'
                        }}>{ch.label}</button>
                    ))}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STREET TIMELINE — Multi-Street Story Mode
// Shows how GTO strategy evolves across streets
// ═══════════════════════════════════════════════════════════════════════════
const STREET_SEQUENCE = ['preflop', 'flop', 'turn', 'river'];
function nextStreetLabel(streetHistory, streets) {
    const last = streetHistory?.[streetHistory.length - 1]?.street;
    const idx = STREET_SEQUENCE.indexOf(String(last || '').toLowerCase());
    if (idx >= 0 && idx < STREET_SEQUENCE.length - 1) {
        const nxt = STREET_SEQUENCE[idx + 1];
        return nxt.charAt(0).toUpperCase() + nxt.slice(1);
    }
    return streets[streetHistory?.length] || 'Next';
}

export function StreetTimeline({ streetHistory, activeStreet, onSelectStreet }) {
    if (!streetHistory || streetHistory.length === 0) return null;

    const streets = ['Flop', 'Turn', 'River'];
    return (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', background: '#242526', borderRadius: '10px', padding: '6px' }}>
            {streetHistory.map((entry, i) => {
                const isActive = activeStreet === i;
                // Label from the data, not the index — an imported scenario can
                // start on the turn, in which case streets[0] would lie.
                const streetLabel = entry?.street
                    ? String(entry.street).charAt(0).toUpperCase() + String(entry.street).slice(1)
                    : (streets[i] || `Street ${i + 1}`);
                return (
                    <button key={i} onClick={() => onSelectStreet(i)} style={{
                        flex: 1, padding: '8px 6px', borderRadius: '8px', border: 'none',
                        background: isActive ? 'rgba(35,116,225,0.2)' : 'transparent',
                        cursor: 'pointer', textAlign: 'center',
                        borderBottom: isActive ? '2px solid #2374E1' : '2px solid transparent',
                    }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: isActive ? '#4599FF' : '#65676B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {streetLabel}
                        </div>
                        {entry.results && (
                            <>
                                <div style={{ fontSize: '11px', fontWeight: '600', color: isActive ? '#E4E6EB' : '#B0B3B8', marginTop: '2px' }}>
                                    {entry.results.optimalAction?.label || '--'}
                                </div>
                                <div style={{ fontSize: '9px', color: entry.results.ev?.hero >= 0 ? '#4ade80' : '#f87171', marginTop: '1px' }}>
                                    {entry.results.ev?.heroDisplay || ''}
                                </div>
                            </>
                        )}
                    </button>
                );
            })}
            {streetHistory.length < 3 && (
                <div style={{ flex: 1, padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px dashed #4E4F50' }}>
                    <div style={{ fontSize: '10px', color: '#65676B' }}>{nextStreetLabel(streetHistory, streets)}</div>
                    <div style={{ fontSize: '9px', color: '#65676B', marginTop: '2px' }}>Deal to unlock</div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYSIS SKELETON — Loading animation during analysis
// ═══════════════════════════════════════════════════════════════════════════
export function AnalysisSkeleton() {
    const pulseStyle = {
        background: 'linear-gradient(90deg, #242526 25%, #3A3B3C 50%, #242526 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        borderRadius: '6px',
    };

    return (
        <div style={{ padding: '16px' }}>
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
            {/* Action bar skeleton */}
            <div style={{ ...pulseStyle, height: '28px', marginBottom: '12px', width: '60%' }} />
            {/* Frequency bars */}
            {[1, 0.7, 0.4, 0.2].map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ ...pulseStyle, height: '14px', width: '50px' }} />
                    <div style={{ ...pulseStyle, height: '14px', flex: 1, maxWidth: `${w * 100}%` }} />
                </div>
            ))}
            {/* EV display skeleton */}
            <div style={{ ...pulseStyle, height: '40px', marginTop: '16px', width: '80%' }} />
            {/* Heatmap skeleton */}
            <div style={{ ...pulseStyle, height: '120px', marginTop: '12px' }} />
            <div style={{ textAlign: 'center', color: '#65676B', fontSize: '11px', marginTop: '12px' }}>
                Analyzing hand...
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PREFLOP CHART OVERLAY — Phase 2.1
// Compact 13x13 range grid with position-specific GTO colors
// ═══════════════════════════════════════════════════════════════════════════
export function PreflopChartOverlay({ position, scenario, rangeGrid, rangePercent, onChangeScenario }) {
    if (!rangeGrid) return null;

    // 'check' is emitted for BB RFI (the BB is never first-in — an unopened pot
    // is checked through), so it needs its own swatch or every cell renders as
    // undifferentiated grey with an `undefined44` border.
    const actionColors = { raise: '#22c55e', '3bet': '#ef4444', call: '#3b82f6', check: '#6b7280', fold: 'transparent' };
    const CELL_FALLBACK = '#3A3B3C';
    const cellColor = (action) => actionColors[action] || CELL_FALLBACK;
    const hasCheck = rangeGrid.flat().some(c => c && c.action === 'check');
    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontWeight: '700' }}>
                    Preflop Range -- {position} ({rangePercent}% of hands{hasCheck ? ', checked through' : ''})
                </h4>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {['rfi', '3bet'].map(s => (
                        <button key={s} onClick={() => onChangeScenario(s)} style={{
                            padding: '3px 8px', borderRadius: '5px', fontSize: '9px', fontWeight: '600',
                            background: scenario === s ? 'rgba(35,116,225,0.2)' : '#3A3B3C',
                            border: scenario === s ? '1px solid rgba(35,116,225,0.3)' : '1px solid #4E4F50',
                            color: scenario === s ? '#4599FF' : '#B0B3B8', cursor: 'pointer',
                        }}>{s === 'rfi' ? 'Open Raise' : '3-Bet'}</button>
                    ))}
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '1px', fontSize: '7px' }}>
                {rangeGrid.flat().map((cell, i) => (
                    <div key={i} style={{
                        padding: '2px 1px', textAlign: 'center', borderRadius: '2px',
                        background: cell.inRange ? cellColor(cell.action) + '33' : '#242526',
                        border: cell.inRange ? `1px solid ${cellColor(cell.action)}44` : '1px solid transparent',
                        color: cell.inRange ? '#E4E6EB' : '#4E4F50',
                        fontWeight: cell.inRange ? '600' : '400',
                    }}>{cell.hand}</div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '9px' }}>
                <span style={{ color: actionColors.raise }}>Raise</span>
                <span style={{ color: actionColors['3bet'] }}>3-Bet</span>
                <span style={{ color: actionColors.call }}>Call</span>
                {hasCheck && <span style={{ color: actionColors.check }}>Check</span>}
                <span style={{ color: '#4E4F50' }}>Fold</span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// RUNOUT CHART — Phase 2.2
// Shows best/worst cards for next street + improve/worsen rates
// ═══════════════════════════════════════════════════════════════════════════
export function RunoutChart({ runoutData }) {
    if (!runoutData || !runoutData.bestCards || runoutData.bestCards.length === 0) return null;

    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
            <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px', fontWeight: '700' }}>
                Runout Simulator
            </h4>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#22c55e', fontFamily: "'Orbitron',monospace" }}>{runoutData.improveRate}%</div>
                    <div style={{ fontSize: '9px', color: '#B0B3B8' }}>Cards improve</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#ef4444', fontFamily: "'Orbitron',monospace" }}>{runoutData.worsenRate}%</div>
                    <div style={{ fontSize: '9px', color: '#B0B3B8' }}>Cards worsen</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#fbbf24', fontFamily: "'Orbitron',monospace" }}>{runoutData.avgEquity}%</div>
                    <div style={{ fontSize: '9px', color: '#B0B3B8' }}>Avg equity</div>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '9px', color: '#22c55e', fontWeight: '600', marginBottom: '4px' }}>Best Cards</div>
                    {runoutData.bestCards.map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '10px' }}>
                            <span style={{ color: '#E4E6EB', fontWeight: '600' }}>{c.card}</span>
                            <span style={{ color: '#22c55e' }}>{c.equity}%</span>
                        </div>
                    ))}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '9px', color: '#ef4444', fontWeight: '600', marginBottom: '4px' }}>Worst Cards</div>
                    {runoutData.worstCards.map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '10px' }}>
                            <span style={{ color: '#E4E6EB', fontWeight: '600' }}>{c.card}</span>
                            <span style={{ color: '#ef4444' }}>{c.equity}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPLOIT TOGGLE — Phase 2.3
// Toggle between GTO and Exploitative recommendations
// ═══════════════════════════════════════════════════════════════════════════
export function ExploitToggle({ mode, onToggle, exploitTip }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <button
                onClick={() => onToggle(mode === 'gto' ? 'exploit' : 'gto')}
                style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '4px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
                    background: mode === 'gto' ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
                    border: `1px solid ${mode === 'gto' ? 'rgba(34,197,94,0.3)' : 'rgba(251,191,36,0.3)'}`,
                    color: mode === 'gto' ? '#4ade80' : '#fde68a',
                    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                {mode === 'gto' ? 'GTO' : 'Exploit'}
            </button>
            {mode === 'exploit' && exploitTip && (
                <span style={{ fontSize: '10px', color: '#fde68a', fontStyle: 'italic' }}>{exploitTip}</span>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUIZ PANEL — Phase 3.1
// "What Would You Do?" — pick an action before seeing the GTO answer
// ═══════════════════════════════════════════════════════════════════════════
export function QuizPanel({ onGuess, correctAction, revealed, userGuess, score }) {
    // Every size bucket the grader knows about must be reachable, otherwise a
    // pot-sized GTO answer would be impossible to get right.
    const actions = ['Fold', 'Check', 'Call', 'Raise', 'Bet Small', 'Bet Medium', 'Bet Large', 'Bet Pot', 'All-In'];

    if (revealed) {
        const isCorrect = !!(userGuess && correctAction) && gradeAction(userGuess, correctAction);
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                style={{
                    padding: '12px', borderRadius: '12px', marginBottom: '12px',
                    background: isCorrect ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${isCorrect ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: isCorrect ? '#4ade80' : '#fca5a5', marginBottom: '4px' }}>
                    {isCorrect ? 'Correct' : 'Incorrect'}
                </div>
                <div style={{ fontSize: '11px', color: '#B0B3B8' }}>
                    You chose: <strong style={{ color: '#E4E6EB' }}>{userGuess}</strong> | GTO: <strong style={{ color: '#4599FF' }}>{correctAction}</strong>
                </div>
                {score && (
                    <div style={{ fontSize: '10px', color: '#B0B3B8', marginTop: '4px' }}>
                        Score: {score.correct}/{score.total} ({score.total > 0 ? Math.round(score.correct / score.total * 100) : 0}%) | Streak: {score.streak}
                    </div>
                )}
            </motion.div>
        );
    }

    return (
        <div style={{ padding: '12px', borderRadius: '12px', marginBottom: '12px', background: 'rgba(35,116,225,0.08)', border: '1px solid rgba(35,116,225,0.2)' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#4599FF', marginBottom: '8px' }}>What Would You Do?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {actions.map(a => (
                    <button key={a} onClick={() => onGuess(a)} style={{
                        padding: '6px 4px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                        background: '#242526', border: '1px solid #3A3B3C', color: '#E4E6EB',
                        cursor: 'pointer', transition: 'all 0.2s',
                    }}>{a}</button>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STUDY REPLAY CARD — Phase 3.2
// Compact flashcard view of a previous analysis
// ═══════════════════════════════════════════════════════════════════════════
export function StudyReplayCard({ session, index, total, onNext, onPrev }) {
    if (!session) return null;

    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '12px', border: '1px solid #3A3B3C' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontWeight: '700' }}>
                    Study Card {index + 1} of {total}
                </h4>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={onPrev} disabled={index === 0} style={{ padding: '4px 8px', borderRadius: '5px', fontSize: '11px', background: '#3A3B3C', border: 'none', color: index === 0 ? '#65676B' : '#E4E6EB', cursor: index === 0 ? 'default' : 'pointer' }}>Prev</button>
                    <button onClick={onNext} disabled={index >= total - 1} style={{ padding: '4px 8px', borderRadius: '5px', fontSize: '11px', background: '#3A3B3C', border: 'none', color: index >= total - 1 ? '#65676B' : '#E4E6EB', cursor: index >= total - 1 ? 'default' : 'pointer' }}>Next</button>
                </div>
            </div>
            <div style={{ fontSize: '11px', color: '#E4E6EB', marginBottom: '4px' }}>
                {session.label || session.hero_position + ' ' + (session.hero_hand || 'Unknown')}
            </div>
            {session.full_analysis && (
                <div style={{ fontSize: '10px', color: '#B0B3B8' }}>
                    Optimal: <strong style={{ color: '#4ade80' }}>{session.full_analysis?.optimalAction?.label || 'N/A'}</strong>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCURACY BADGE — Phase 3.4
// Shows quiz accuracy % and streak in the header
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Props: stats = { correct, total, streak }.
 * Accuracy is computed here so callers can hand the raw quizScore straight
 * through. An explicit stats.accuracy is still honoured for back-compat.
 */
export function AccuracyBadge({ stats }) {
    const total = Number(stats?.total) || 0;
    if (!stats || total === 0) return null;

    const correct = Number(stats.correct) || 0;
    const accuracy = stats.accuracy != null && Number.isFinite(Number(stats.accuracy))
        ? Math.round(Number(stats.accuracy))
        : Math.round((correct / total) * 100);
    const streak = Number(stats.streak) || 0;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '16px', fontSize: '10px', fontWeight: '700',
            background: accuracy >= 70 ? 'rgba(34,197,94,0.1)' : accuracy >= 50 ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${accuracy >= 70 ? 'rgba(34,197,94,0.2)' : accuracy >= 50 ? 'rgba(251,191,36,0.2)' : 'rgba(239,68,68,0.2)'}`,
            color: accuracy >= 70 ? '#4ade80' : accuracy >= 50 ? '#fde68a' : '#fca5a5',
        }}>
            <span>{accuracy}% Accuracy</span>
            {streak > 0 && <span style={{ color: '#fbbf24' }}>{streak} Streak</span>}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// LEADERBOARD CARD — Phase 4.4
// Compact leaderboard for quiz accuracy
// ═══════════════════════════════════════════════════════════════════════════
export function LeaderboardCard({ entries }) {
    if (!entries || entries.length === 0) return null;

    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '12px', border: '1px solid #3A3B3C' }}>
            <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px', fontWeight: '700' }}>
                Leaderboard
            </h4>
            {entries.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '11px', borderBottom: i < entries.length - 1 ? '1px solid #3A3B3C' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: i < 3 ? '#fbbf24' : '#B0B3B8', fontWeight: '700' }}>#{i + 1}</span>
                        <span style={{ color: '#E4E6EB' }}>{e.name || 'Anonymous'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: e.accuracy >= 70 ? '#4ade80' : '#fde68a', fontWeight: '600' }}>{e.accuracy}%</span>
                        {e.streak > 0 && <span style={{ color: '#fbbf24', fontSize: '10px' }}>{e.streak} Streak</span>}
                    </div>
                </div>
            ))}
        </div>
    );
}


// ═══════════════════════════════════════════════════════════════════════════
// EQUITY GRAPH — Wave 2 Feature 4
// SVG line chart: tracks hero equity across streets
// ═══════════════════════════════════════════════════════════════════════════
const STREET_SHORT = { preflop: 'Pre', flop: 'Flop', turn: 'Turn', river: 'River' };
const STREET_SHORT_SEQ = ['Pre', 'Flop', 'Turn', 'River'];

export function EquityGraph({ streetHistory, currentEquity, currentStreet }) {
    const points = useMemo(() => {
        const pts = [];
        // Archived streets come FIRST (oldest -> newest), labelled from their own
        // entry.street, then the LIVE equity for the current street is appended.
        (streetHistory || []).forEach((entry, i) => {
            if (entry?.equity == null) return;
            const key = String(entry.street || '').toLowerCase();
            pts.push({
                street: STREET_SHORT[key] || STREET_SHORT_SEQ[i] || `S${i + 1}`,
                equity: Number(entry.equity),
            });
        });
        if (currentEquity != null && Number.isFinite(Number(currentEquity))) {
            const liveKey = String(currentStreet || '').toLowerCase();
            let liveLabel = STREET_SHORT[liveKey];
            if (!liveLabel) {
                // Derive: the live street is one past the newest archived street
                const lastKey = String(streetHistory?.[streetHistory.length - 1]?.street || '').toLowerCase();
                const lastIdx = STREET_SEQUENCE.indexOf(lastKey);
                liveLabel = lastIdx >= 0
                    ? (STREET_SHORT_SEQ[Math.min(lastIdx + 1, STREET_SHORT_SEQ.length - 1)])
                    : (STREET_SHORT_SEQ[Math.min(streetHistory?.length || 0, STREET_SHORT_SEQ.length - 1)] || 'Now');
            }
            pts.push({ street: liveLabel, equity: Number(currentEquity) });
        }
        return pts.filter(p => Number.isFinite(p.equity));
    }, [streetHistory, currentEquity, currentStreet]);

    if (points.length < 2) return null;

    const W = 260, H = 80, PAD = 16;
    const xStep = (W - PAD * 2) / (points.length - 1);
    const yScale = (v) => PAD + (H - PAD * 2) * (1 - v / 100);
    const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${PAD + i * xStep},${yScale(p.equity)}`).join(' ');
    const areaD = lineD + ` L${PAD + (points.length - 1) * xStep},${H - PAD} L${PAD},${H - PAD} Z`;
    const lastEquity = points[points.length - 1]?.equity || 50;
    const color = lastEquity >= 50 ? '#22c55e' : '#ef4444';

    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                Equity Progression
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
                {[25, 50, 75].map(v => (
                    <line key={v} x1={PAD} y1={yScale(v)} x2={W - PAD} y2={yScale(v)} stroke="#3A3B3C" strokeWidth="1" strokeDasharray="3,3" />
                ))}
                <text x={W - PAD + 2} y={yScale(50) + 4} fontSize="8" fill="#65676B">50%</text>
                <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                    </linearGradient>
                </defs>
                <path d={areaD} fill="url(#eqGrad)" />
                <path d={lineD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {points.map((p, i) => (
                    <g key={i}>
                        <circle cx={PAD + i * xStep} cy={yScale(p.equity)} r="3" fill={color} />
                        <text x={PAD + i * xStep} y={H - 2} textAnchor="middle" fontSize="8" fill="#65676B">{p.street}</text>
                        <text x={PAD + i * xStep} y={yScale(p.equity) - 6} textAnchor="middle" fontSize="8" fill={color} fontWeight="700">
                            {Math.round(p.equity)}%
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION LOG MODAL — Wave 2 Feature 5
// ═══════════════════════════════════════════════════════════════════════════
const SESSION_ACTION_COLORS = { fold: '#ef4444', check: '#94a3b8', call: '#fbbf24', bet: '#22c55e', raise: '#22c55e', allin: '#f97316' };

export function SessionLogModal({ isOpen, onClose, sessionLog, onLoadEntry, onClearSession }) {
    // Two-step confirm — the journal is persisted to IndexedDB, so one stray tap
    // used to destroy it irrecoverably.
    const [confirmClear, setConfirmClear] = useState(false);
    const confirmTimerRef = useRef(null);

    const clearConfirmTimer = useCallback(() => {
        if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
    }, []);
    useEffect(() => clearConfirmTimer, [clearConfirmTimer]);
    useEffect(() => {
        if (!isOpen) { clearConfirmTimer(); setConfirmClear(false); }
    }, [isOpen, clearConfirmTimer]);

    const handleClearClick = useCallback(() => {
        try { navigator.vibrate?.(30); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        if (!confirmClear) {
            setConfirmClear(true);
            clearConfirmTimer();
            confirmTimerRef.current = setTimeout(() => { confirmTimerRef.current = null; setConfirmClear(false); }, 3000);
            return;
        }
        clearConfirmTimer();
        setConfirmClear(false);
        onClearSession?.();
    }, [confirmClear, clearConfirmTimer, onClearSession]);

    if (!isOpen) return null;
    const ACTION_COLORS = SESSION_ACTION_COLORS;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{
            position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={onClose}>
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} onClick={e => e.stopPropagation()} style={{
                background: '#18191A', borderRadius: '20px 20px 0 0', border: '1px solid #3A3B3C',
                width: '100%', maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}>
                <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#E4E6EB' }}>
                        Session Log <span style={{ fontSize: '12px', color: '#65676B', fontWeight: '600' }}>({sessionLog?.length || 0} hands)</span>
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {(sessionLog?.length > 0) && (
                            <button onClick={handleClearClick}
                                style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: confirmClear ? 'rgba(239,68,68,0.22)' : 'rgba(239,68,68,0.1)', border: `1px solid ${confirmClear ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.2)'}`, color: confirmClear ? '#ef4444' : '#fca5a5', cursor: 'pointer' }}>
                                {confirmClear ? 'Confirm clear?' : 'Clear'}
                            </button>
                        )}
                        <button onClick={onClose} style={{ background: '#3A3B3C', border: 'none', color: '#E4E6EB', cursor: 'pointer', fontSize: '18px', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                    {!sessionLog?.length ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#65676B', fontSize: '13px' }}>
                            No hands yet. Run an analysis to start tracking.
                        </div>
                    ) : [...sessionLog].reverse().map((entry, i) => {
                        const actionKey = (entry.optimalAction || '').toLowerCase().split(' ')[0];
                        const badgeColor = ACTION_COLORS[actionKey] || '#4599FF';
                        return (
                            <button key={entry.id || i} onClick={() => { try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } onLoadEntry(entry); onClose(); }}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginBottom: '6px', borderRadius: '10px', background: '#242526', border: '1px solid #3A3B3C', cursor: 'pointer', textAlign: 'left', touchAction: 'manipulation' }}>
                                <div style={{ width: 36, height: 36, borderRadius: '10px', background: `${badgeColor}22`, border: `1px solid ${badgeColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: badgeColor, flexShrink: 0 }}>
                                    {(entry.optimalAction || '??').substring(0, 4)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#E4E6EB' }}>{entry.hand} — {entry.position}</div>
                                    <div style={{ fontSize: '11px', color: '#B0B3B8', marginTop: '2px' }}>{entry.street} · {entry.board || 'Preflop'}{entry.equity != null ? ` · ${Math.round(entry.equity)}% eq` : ''}</div>
                                </div>
                                <div style={{ fontSize: '10px', color: '#65676B', flexShrink: 0 }}>↩</div>
                            </button>
                        );
                    })}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COACH ACTION PICKER — Wave 2 Feature 6 (Socratic Coach)
// ═══════════════════════════════════════════════════════════════════════════
export function CoachActionPicker({ isOpen, onPick, onSkip }) {
    if (!isOpen) return null;
    const ACTIONS = [
        { id: 'fold', label: 'Fold', color: '#ef4444' },
        { id: 'check', label: 'Check', color: '#94a3b8' },
        { id: 'call', label: 'Call', color: '#fbbf24' },
        { id: 'bet_33', label: 'Bet 33%', color: '#4ade80' },
        { id: 'bet_66', label: 'Bet 66%', color: '#22c55e' },
        { id: 'bet_100', label: 'Bet Pot', color: '#16a34a' },
        { id: 'raise', label: 'Raise', color: '#3b82f6' },
        { id: 'allin', label: 'All-In', color: '#f97316' },
    ];
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} style={{ background: '#18191A', border: '1px solid rgba(35,116,225,0.3)', borderRadius: '20px', padding: '24px', maxWidth: '360px', width: '100%', boxShadow: '0 0 60px rgba(35,116,225,0.18)' }}>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                        <Brain size={28} strokeWidth={2} style={{ color: '#4599FF' }} aria-hidden="true" />
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: '#E4E6EB', fontFamily: "'Orbitron', sans-serif" }}>Coach Mode</div>
                    <div style={{ fontSize: '13px', color: '#B0B3B8', marginTop: '4px' }}>What would you do in this spot?</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                    {ACTIONS.map(a => (
                        <button key={a.id} onClick={() => { try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } onPick(a.label); }}
                            style={{ padding: '12px 8px', borderRadius: '12px', fontSize: '13px', fontWeight: '700', background: `${a.color}15`, border: `1px solid ${a.color}40`, color: a.color, cursor: 'pointer', touchAction: 'manipulation' }}>
                            {a.label}
                        </button>
                    ))}
                </div>
                <button onClick={onSkip} style={{ width: '100%', padding: '10px', borderRadius: '10px', fontSize: '12px', background: 'none', border: '1px solid #3A3B3C', color: '#65676B', cursor: 'pointer' }}>
                    Skip — just show the answer
                </button>
            </motion.div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COACH VERDICT — Shows user pick vs GTO verdict
// ═══════════════════════════════════════════════════════════════════════════
export function CoachVerdict({ userPick, gtoAction, evDelta }) {
    if (!userPick || !gtoAction) return null;
    const isCorrect = gradeAction(userPick, gtoAction);
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: '14px', borderRadius: '12px', marginBottom: '12px', background: isCorrect ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${isCorrect ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                {isCorrect
                    ? <Check size={20} strokeWidth={3} style={{ color: '#4ade80', flexShrink: 0 }} aria-hidden="true" />
                    : <XIcon size={20} strokeWidth={3} style={{ color: '#fca5a5', flexShrink: 0 }} aria-hidden="true" />}
                <div style={{ fontSize: '14px', fontWeight: '800', color: isCorrect ? '#4ade80' : '#fca5a5' }}>{isCorrect ? 'Correct!' : 'Not optimal'}</div>
            </div>
            <div style={{ fontSize: '12px', color: '#B0B3B8' }}>
                You: <strong style={{ color: '#E4E6EB' }}>{userPick}</strong>{' '}vs GTO: <strong style={{ color: '#4599FF' }}>{gtoAction}</strong>
                {evDelta != null && <span style={{ marginLeft: 8, color: evDelta >= 0 ? '#4ade80' : '#fca5a5', fontWeight: '700' }}>({evDelta >= 0 ? '+' : ''}{evDelta.toFixed(2)} EV)</span>}
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION REPLAY BAR — Wave 2 Feature 8
// Tappable history scrubber with playhead indicator and haptics
// ═══════════════════════════════════════════════════════════════════════════
export function ActionReplayBar({ actions, replayIndex, onReplayTo, onExitReplay }) {
    if (!actions || actions.length === 0) return null;
    const COLORS = { fold: '#ef4444', check: '#94a3b8', call: '#fbbf24', bet: '#22c55e', raise: '#22c55e', allin: '#f97316' };
    const getBubbleColor = (action) => COLORS[(action || '').toLowerCase().split('_')[0]] || '#2374E1';

    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ color: replayIndex != null ? '#4599FF' : '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontWeight: '700' }}>
                    {replayIndex != null ? '▶ Replay Mode' : 'Action History'}
                </h4>
                {replayIndex != null && (
                    <button onClick={() => { try { navigator.vibrate?.(20); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } onExitReplay(); }}
                        style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', cursor: 'pointer' }}>
                        Exit
                    </button>
                )}
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: replayIndex == null ? '#4599FF' : '#3A3B3C', border: '2px solid #2374E1', flexShrink: 0 }} />
                {actions.map((a, i) => {
                    const color = getBubbleColor(a.action);
                    const isActive = replayIndex === i;
                    const isPast = replayIndex != null && i <= replayIndex;
                    return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: 14, height: 2, background: isPast ? color : '#3A3B3C', transition: 'background 0.2s' }} />
                            <button
                                onClick={() => { try { navigator.vibrate?.(isActive ? 30 : 10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } onReplayTo(isActive ? null : i); }}
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: '700', background: isActive ? `${color}30` : isPast ? `${color}15` : '#3A3B3C', border: `1px solid ${isActive ? color : isPast ? color + '55' : '#4E4F50'}`, color: isActive ? color : isPast ? color + 'cc' : '#B0B3B8', cursor: 'pointer', minWidth: 34, boxShadow: isActive ? `0 0 8px ${color}40` : 'none', touchAction: 'manipulation' }}>
                                <span style={{ color: isPast ? '#4599FF' : '#65676B', fontSize: '8px' }}>{a.position}</span>
                                <span>{a.label}</span>
                            </button>
                        </div>
                    );
                })}
            </div>
            {replayIndex != null && (
                <div style={{ marginTop: '8px', fontSize: '10px', color: '#4599FF', textAlign: 'center' }}>
                    Rewound to: <strong>{actions[replayIndex]?.position} {actions[replayIndex]?.label}</strong>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARE HAND MODAL — Wave 2 Feature 7
// Download PNG + Post to Smarter.Poker profile + Native share sheet
// ═══════════════════════════════════════════════════════════════════════════
export function ShareHandModal({ isOpen, onClose, results, scenario, heroHand, board, cardRef }) {
    const [isPosting, setIsPosting] = useState(false);
    const [capturedUrl, setCapturedUrl] = useState(null);
    const closeTimerRef = useRef(null);

    useEffect(() => () => {
        if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    }, []);
    useEffect(() => {
        if (!isOpen && closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    }, [isOpen]);

    if (!isOpen || !results) return null;

    const captureCanvas = async () => {
        if (!cardRef?.current) return null;
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(cardRef.current, { backgroundColor: '#18191a', scale: 2, useCORS: true });
            const url = canvas.toDataURL('image/png');
            setCapturedUrl(url);
            return url;
        } catch (e) {
            console.warn('[ShareHandModal] Canvas capture failed:', e?.message || e);
            return null;
        }
    };

    // Best-effort upload of the captured PNG so the feed post can render the
    // hand visually. Storage bucket may not exist on every env — never block
    // the post on a failure here.
    const uploadCapture = async (dataUrl) => {
        if (!dataUrl || typeof fetch === 'undefined') return null;
        try {
            const blob = await (await fetch(dataUrl)).blob();
            if (!blob || blob.size > 4 * 1024 * 1024) return null;
            const path = `sandbox/hand-${Date.now()}.png`;
            const { error } = await supabase.storage.from('social-media').upload(path, blob, {
                contentType: 'image/png', upsert: true,
            });
            if (error) { console.warn('[ShareHandModal] Image upload skipped:', error.message || error); return null; }
            const { data } = supabase.storage.from('social-media').getPublicUrl(path);
            return data?.publicUrl || null;
        } catch (e) {
            console.warn('[ShareHandModal] Image upload skipped:', e?.message || e);
            return null;
        }
    };

    const handleDownload = async () => {
        try { navigator.vibrate?.(20); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        const url = capturedUrl || await captureCanvas();
        if (!url) { toast.error('Could not render image'); return; }
        const link = document.createElement('a');
        link.download = `smarter-poker-hand-${Date.now()}.png`;
        link.href = url;
        link.click();
    };

    const handlePostToProfile = async () => {
        try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        setIsPosting(true);
        try {
            const user = getAuthUser();
            if (!user) { toast.error('Log in to post'); setIsPosting(false); return; }
            // Fetch session token for auth header — the server derives identity
            // from this JWT. We deliberately do NOT send a client user_id.
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) { toast.error('Session expired. Please log in again.'); setIsPosting(false); return; }
            const hand = heroHand?.card1 ? `${heroHand.card1}${heroHand.card2 || ''}` : '??';
            const fullBoard = [...(board?.flop || []), board?.turn, board?.river].filter(Boolean);
            const boardStr = fullBoard.length ? fullBoard.join(' ') : 'Preflop';
            const content = `Just analyzed a hand in the GTO Sandbox!\n\n**Hand:** ${hand} — ${scenario?.position || 'BTN'}\n**Board:** ${boardStr}\n**GTO Line:** ${results.optimalAction?.label} (${results.optimalAction?.frequency}%)\n\nTry this hand at smarter.poker/hub/personal-assistant/sandbox`;

            // Attach the rendered hand image when we can produce/host one
            const imageUrl = await uploadCapture(capturedUrl || await captureCanvas());

            const res = await fetch('/api/sandbox/social-export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    content,
                    metadata: {
                        hand,
                        board: boardStr,
                        position: scenario?.position,
                        optimalAction: results.optimalAction?.label,
                        challengeEnabled: true,
                        ...(imageUrl ? { imageUrl } : {}),
                        source: 'Sandbox',
                    },
                }),
            });
            if (res.ok) {
                // Dispatch bus listener event so social feed pages refresh
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('social-post-created', { detail: { type: 'sandbox_hand' } }));
                }
                toast.success('Posted to your feed!');
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
                closeTimerRef.current = setTimeout(() => { closeTimerRef.current = null; onClose?.(); }, 1200);
            } else {
                const errBody = await res.json().catch(() => ({}));
                console.warn('[ShareHandModal] Post failed:', res.status, errBody);
                toast.error('Failed to post');
            }
        } catch (err) {
            console.warn('[ShareHandModal] Post error:', err);
            toast.error('Failed to post');
        }
        setIsPosting(false);
    };


    const handleNativeShare = async () => {
        try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        const shareUrl = `${window.location.origin}/hub/personal-assistant/sandbox`;
        const text = `I analyzed ${heroHand?.card1 || '??'}${heroHand?.card2 || '??'} on the GTO Sandbox — GTO line: ${results.optimalAction?.label}`;
        try {
            if (navigator.share) { await navigator.share({ title: 'GTO Hand Analysis — Smarter.Poker', text, url: shareUrl }); }
            else { navigator.clipboard?.writeText(`${text}\n${shareUrl}`); }
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    };

    const actions = [
        { Icon: Camera, label: 'Download Image', sub: 'Save PNG to device', onClick: handleDownload, color: '#4599FF' },
        { Icon: Spade, label: isPosting ? 'Posting...' : 'Post to My Profile', sub: 'Share to your Smarter.Poker feed', onClick: handlePostToProfile, color: '#22c55e', primary: true },
        { Icon: Share2, label: 'Share Link', sub: 'Copy link or open share sheet', onClick: handleNativeShare, color: '#a78bfa' },
    ];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9995, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <motion.div initial={{ y: 80 }} animate={{ y: 0 }} onClick={e => e.stopPropagation()} style={{ background: '#18191A', borderRadius: '20px 20px 0 0', border: '1px solid #3A3B3C', width: '100%', maxWidth: 500, padding: '24px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#E4E6EB' }}>Share Hand</h3>
                    <button onClick={onClose} style={{ background: '#3A3B3C', border: 'none', color: '#E4E6EB', cursor: 'pointer', fontSize: '18px', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
                <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#E4E6EB' }}>
                        {heroHand?.card1 || '??'}{heroHand?.card2 || '??'} — {scenario?.position || 'BTN'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#B0B3B8', marginTop: '4px' }}>
                        GTO: <span style={{ color: '#22c55e', fontWeight: '600' }}>{results.optimalAction?.label}</span> ({results.optimalAction?.frequency}%)
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {actions.map(a => (
                        <button key={a.label} onClick={a.onClick} disabled={isPosting && a.primary}
                            style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '14px', cursor: isPosting && a.primary ? 'wait' : 'pointer', background: a.primary ? `${a.color}15` : '#242526', border: `1px solid ${a.primary ? a.color + '30' : '#3A3B3C'}`, opacity: isPosting && a.primary ? 0.7 : 1, touchAction: 'manipulation' }}>
                            <span style={{ minWidth: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <a.Icon size={24} strokeWidth={2} style={{ color: a.color }} aria-hidden="true" />
                            </span>
                            <div style={{ textAlign: 'left', flex: 1 }}>
                                <div style={{ fontSize: '14px', fontWeight: '700', color: a.primary ? a.color : '#E4E6EB' }}>{a.label}</div>
                                <div style={{ fontSize: '11px', color: '#65676B', marginTop: '2px' }}>{a.sub}</div>
                            </div>
                            <span style={{ color: '#65676B' }}>›</span>
                        </button>
                    ))}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ── Wave 3: VillainReadCard (W3-5) ──────────────────────────────────────────
const ARCHETYPE_EXPLOITS = {
    nit: ['Steal blinds freely vs this player', 'Fold to raises — they only 3-bet premiums', 'Bet big when they call — value bet relentlessly'],
    tag: ['Stay balanced — they notice unbalanced lines', 'Mix your frequencies vs TAG ranges', 'Respect their raises on scary boards'],
    lag: ['Tighten your calling range vs 3-bets', 'Let them barrel into you with top pair+', 'Float light pre-flop only in position'],
    calling_station: ['Bet very thin for value — they call anything', 'Remove bluffs entirely from your range', 'Overbet the river with strong value hands'],
    maniac: ['Let them hang themselves — trap with premiums', 'Call down lighter vs maniac — bluff ratio is high', 'Raise for value when they show aggression'],
    fish: ["Max bet strong hands — they won't notice odds", "Simplify your range — fancy plays won't work", "Don't slow play big hands — they can't fold"],
    gto_neutral: ['Play balanced GTO frequencies', 'Mixed strategies are optimal here', 'No single exploit — adapt post-flop to tendencies'],
};

export function VillainReadCard({ villain }) {
    const [open, setOpen] = useState(true);
    if (!villain?.archetype?.id) return null;
    const archetypeId = villain.archetype.id;
    const tips = ARCHETYPE_EXPLOITS[archetypeId] || ARCHETYPE_EXPLOITS.gto_neutral;
    // VPIP is unknown until the user picks an archetype/position — do not paint
    // "unknown" green as if it were a confirmed nit.
    const vpipValue = villain.vpip != null && Number.isFinite(Number(villain.vpip)) ? Number(villain.vpip) : null;
    const color = vpipValue == null ? '#B0B3B8' : vpipValue > 40 ? '#f97316' : vpipValue > 25 ? '#fbbf24' : '#4ade80';

    return (
        <div style={{ margin: '12px 0', borderRadius: 10, border: '1px solid rgba(167,139,250,0.25)', background: 'rgba(139,92,246,0.06)', overflow: 'hidden' }}>
            <button onClick={() => { setOpen(o => !o); try { navigator.vibrate?.(8); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa', fontSize: 13, fontWeight: 700 }}>
                <Spade size={14} strokeWidth={2} style={{ color: '#a78bfa', flexShrink: 0 }} aria-hidden="true" />
                Villain Intel — {villain.archetype.name || archetypeId}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#65676B' }}>{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div style={{ padding: '0 14px 12px' }}>
                    {vpipValue != null && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: '#65676B', fontWeight: 600 }}>VPIP</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color }}>{vpipValue}%</span>
                        </div>
                    )}
                    <ul style={{ margin: 0, padding: '0 0 0 16px', listStyle: 'disc', color: '#B0B3B8', fontSize: 11, lineHeight: 1.6 }}>
                        {tips.map((tip, i) => <li key={i}>{tip}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}

// ── Wave 3: ShortcutLegend (W3-6) ──────────────────────────────────────────
export function ShortcutLegend({ isOpen, onClose }) {
    if (!isOpen) return null;
    const shortcuts = [
        ['A', 'Analyze hand'],
        ['R', 'Reset all'],
        ['U', 'Undo last change'],
        ['S', 'Save bookmark'],
        ['C', 'Toggle Coach Mode'],
        ['Esc', 'Close results panel'],
        ['?', 'Toggle this legend'],
    ];
    return (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', top: 80, right: 16, zIndex: 9990, background: '#242526', border: '1px solid #4E4F50', borderRadius: 12, padding: '14px 16px', minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#E4E6EB', textTransform: 'uppercase', letterSpacing: 1 }}>Keyboard Shortcuts</span>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#65676B', cursor: 'pointer', fontSize: 16, padding: 0 }}>✕</button>
            </div>
            {shortcuts.map(([key, label]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: '#B0B3B8' }}>{label}</span>
                    <kbd style={{ fontSize: 10, fontWeight: 700, color: '#E4E6EB', background: '#3A3B3C', border: '1px solid #4E4F50', borderRadius: 4, padding: '2px 6px', fontFamily: 'monospace' }}>{key}</kbd>
                </div>
            ))}
        </motion.div>
    );
}
