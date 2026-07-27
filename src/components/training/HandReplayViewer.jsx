/**
 * HAND REPLAY VIEWER — Full visual hand replay for post-session review
 * Shows each hand as a card with board, hero cards, GTO frequencies, and classification
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CLASSIFICATION_CONFIG, MOVE_CLASSIFICATIONS } from '../../hooks/useGTOWScore';
import RangeGrid from './RangeGrid';
import SolverLineSummary from './SolverLineSummary';
// ═══ PHASE 21: Blocker Analysis + Equity Matchup ═══
import BlockerScorePanel from './BlockerScorePanel';
import EquityMatchup from './EquityMatchup';
// ═══ PHASE 21+: Runout Heatmap + Solver Tree ═══
import RunoutHeatmap from './RunoutHeatmap';
import SolverTreeViewer from './SolverTreeViewer';

// Card display helper — renders a poker card (value + suit)
function MiniCard({ card, size = 'sm' }) {
    if (!card || card.length < 2) return null;
    const rank = card[0].toUpperCase();
    const suit = card[1].toLowerCase();
    const suitMap = { h: '♥', d: '♦', c: '♣', s: '♠' };
    const colorMap = { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#e2e8f0' };
    const dims = size === 'lg' ? { w: 38, h: 52, fs: 14 } : { w: 28, h: 38, fs: 11 };

    return (
        <div style={{
            width: dims.w,
            height: dims.h,
            borderRadius: 4,
            background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
            border: '1px solid rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: dims.fs,
            fontWeight: 'bold',
            color: colorMap[suit] || '#1e293b',
            lineHeight: 1.1,
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}>
            <span>{rank}</span>
            <span style={{ fontSize: dims.fs - 2 }}>{suitMap[suit] || suit}</span>
        </div>
    );
}

export default function HandReplayViewer({ handHistory, onClose }) {
    const [selectedHandIndex, setSelectedHandIndex] = useState(0);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'detail'
    const [filterMistakesOnly, setFilterMistakesOnly] = useState(false); // Phase 39: mistakes filter
    // 2026-07-19: saved sessions are compacted (rawFrequencies/handEVs stripped
    // to fix the save-session 413) — refetch the solver matrix by scenarioHash
    // on demand so replays of SAVED hands keep the range grid + EV overlay.
    const [fetchedMatrices, setFetchedMatrices] = useState({});

    const selectedHand = handHistory[selectedHandIndex];
    const baseHandData = selectedHand?.handData || selectedHand || {};
    const fetched = baseHandData.scenarioHash ? fetchedMatrices[baseHandData.scenarioHash] : null;
    const handData = fetched && !baseHandData.rawFrequencies
        ? {
              ...baseHandData,
              rawFrequencies: fetched.rawFrequencies,
              evData: { ...(baseHandData.evData || {}), handEVs: fetched.handEVs || null },
          }
        : baseHandData;

    React.useEffect(() => {
        const hash = baseHandData.scenarioHash;
        if (!hash || baseHandData.rawFrequencies || fetchedMatrices[hash] !== undefined) return;
        let cancelled = false;
        (async () => {
            try {
                const { getSessionToken } = await import('../../lib/authUtils');
                const token = getSessionToken();
                if (!token) return;
                const res = await fetch(
                    `/api/training/browse-solutions?scenarioHash=${encodeURIComponent(hash)}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const data = await res.json();
                if (cancelled) return;
                setFetchedMatrices((prev) => ({
                    ...prev,
                    [hash]: data?.spot?.rawFrequencies
                        ? { rawFrequencies: data.spot.rawFrequencies, handEVs: data.spot.handEVs || null }
                        : null, // cache misses too, so we don't refetch forever
                }));
            } catch (e) {
                if (!cancelled) setFetchedMatrices((prev) => ({ ...prev, [hash]: null }));
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseHandData.scenarioHash, baseHandData.rawFrequencies]);
    const config = CLASSIFICATION_CONFIG[selectedHand?.classification] || CLASSIFICATION_CONFIG[MOVE_CLASSIFICATIONS.WRONG];

    // Parse board cards
    const boardCards = useMemo(() => {
        const board = handData.board || '';
        if (Array.isArray(board)) return board;
        const cleaned = board.replace(/\s+/g, '');
        const cards = [];
        for (let i = 0; i < cleaned.length; i += 2) {
            if (i + 1 < cleaned.length) cards.push(cleaned.substring(i, i + 2));
        }
        return cards;
    }, [handData.board]);

    // Parse hero cards
    const heroCards = useMemo(() => {
        const hc = handData.heroCards;
        if (Array.isArray(hc)) return hc;
        if (typeof hc === 'string') return hc.split(' ').filter(Boolean);
        return [];
    }, [handData.heroCards]);

    // GTO frequencies from hand data
    const gtoFreqs = handData.gtoFrequencies || {};

    if (!handHistory || handHistory.length === 0) return null;

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerTitle}>Hand Replay</div>
                <div style={styles.viewToggle}>
                    <button
                        onClick={() => setViewMode('list')}
                        style={{ ...styles.toggleBtn, ...(viewMode === 'list' ? styles.toggleBtnActive : {}) }}
                    >
                        List
                    </button>
                    <button
                        onClick={() => setViewMode('detail')}
                        style={{ ...styles.toggleBtn, ...(viewMode === 'detail' ? styles.toggleBtnActive : {}) }}
                    >
                        Detail
                    </button>
                    {/* Phase 39+51: Classification filter buttons */}
                    {[
                        { key: 'all', label: 'All', color: '#94a3b8' },
                        { key: 'mistakes', label: '✕', color: '#f87171'},
                        { key: 'blunder', label: '!!', color: '#ef4444' },
                    ].map(f => {
                        const isActive = (f.key === 'all' && !filterMistakesOnly) || (f.key === 'mistakes' && filterMistakesOnly === true) || (f.key === 'blunder' && filterMistakesOnly === 'blunder');
                        return (
                            <button
                                key={f.key}
                                onClick={() => {
                                    if (f.key === 'all') setFilterMistakesOnly(false);
                                    else if (f.key === 'mistakes') setFilterMistakesOnly(true);
                                    else setFilterMistakesOnly('blunder');
                                }}
                                style={{
                                    ...styles.toggleBtn,
                                    ...(isActive ? {
                                        background: `${f.color}22`,
                                        color: f.color,
                                        borderColor: `${f.color}44`,
                                    } : {}),
                                }}
                            >
                                {f.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {viewMode === 'detail' ? (
                /* DETAIL VIEW — Full hand card with board + frequencies */
                <div style={styles.detailView}>
                    {/* Hand navigation */}
                    <div style={styles.handNav}>
                        <button
                            onClick={() => setSelectedHandIndex(Math.max(0, selectedHandIndex - 1))}
                            disabled={selectedHandIndex === 0}
                            style={styles.navBtn}
                        >
                            ← Prev
                        </button>
                        <div style={styles.handCounter}>
                            Hand {selectedHandIndex + 1} / {handHistory.length}
                        </div>
                        <button
                            onClick={() => setSelectedHandIndex(Math.min(handHistory.length - 1, selectedHandIndex + 1))}
                            disabled={selectedHandIndex === handHistory.length - 1}
                            style={styles.navBtn}
                        >
                            Next →
                        </button>
                    </div>

                    {/* Hand card */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={selectedHandIndex}
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            style={styles.handCard}
                        >
                            {/* Classification badge */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <div style={{
                                    ...styles.classBadge,
                                    background: config.bgColor,
                                    borderColor: config.borderColor,
                                    color: config.color,
                                }}>
                                    {config.icon} {config.label}
                                </div>
                                <div style={{ color: selectedHand.evLoss > 0 ? '#ef4444' : '#22c55e', fontWeight: 'bold', fontSize: 14, fontFamily: "'Orbitron', monospace" }}>
                                    {selectedHand.evLoss > 0 ? `-${selectedHand.evLoss.toFixed(2)}` : '0.00'} BB
                                </div>
                            </div>

                            {/* Board cards */}
                            {boardCards.length > 0 && (
                                <div style={styles.boardSection}>
                                    <div style={styles.sectionLabel}>BOARD</div>
                                    <div style={styles.cardRow}>
                                        {boardCards.map((c, i) => <MiniCard key={i} card={c} size="lg" />)}
                                    </div>
                                </div>
                            )}

                            {/* Hero cards + position + hand category */}
                            <div style={styles.heroSection}>
                                <div style={styles.sectionLabel}>
                                    YOUR HAND {handData.heroPosition && <span style={styles.positionBadge}>{handData.heroPosition}</span>}
                                    {handData.street && (
                                        <span style={{
                                            fontSize: 9, fontWeight: 600, marginLeft: 6, padding: '1px 5px', borderRadius: 3,
                                            background: handData.street === 'preflop' ? 'rgba(167,139,250,0.15)' :
                                                handData.street === 'flop' ? 'rgba(74,222,128,0.15)' :
                                                handData.street === 'turn' ? 'rgba(251,146,60,0.15)' : 'rgba(248,113,113,0.15)',
                                            color: handData.street === 'preflop' ? '#a78bfa' :
                                                handData.street === 'flop' ? '#4ade80' :
                                                handData.street === 'turn' ? '#fb923c' : '#f87171',
                                        }}>
                                            {handData.street}
                                        </span>
                                    )}
                                </div>
                                <div style={styles.cardRow}>
                                    {heroCards.map((c, i) => <MiniCard key={i} card={c} size="lg" />)}
                                </div>
                                {/* Phase 51: Hand categorization */}
                                {handData.handCategory && (
                                    <div style={{
                                        marginTop: 6, fontSize: 11, fontWeight: 600, fontStyle: 'italic',
                                        color: handData.handCategory.includes('monster') ? '#f97316' :
                                            handData.handCategory.includes('nut') ? '#22c55e' :
                                            handData.handCategory.includes('combo') ? '#a855f7' :
                                            handData.handCategory.includes('draw') ? '#3b82f6' :
                                            handData.handCategory.includes('top pair') ? '#4ade80' :
                                            handData.handCategory.includes('overpair') ? '#22d3ee' :
                                            handData.handCategory.includes('air') ? '#64748b' : '#cbd5e1',
                                    }}>
                                        {handData.handCategory}
                                    </div>
                                )}
                            </div>

                            {/* Action taken vs optimal */}
                            <div style={styles.actionSection}>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div>
                                        <div style={styles.sectionLabel}>YOUR ACTION</div>
                                        <div style={{ color: config.color, fontWeight: 'bold', fontSize: 14 }}>
                                            {handData.action || 'Unknown'}
                                        </div>
                                    </div>
                                    {handData.correctAction && handData.action !== handData.correctAction && (
                                        <div>
                                            <div style={styles.sectionLabel}>OPTIMAL</div>
                                            <div style={{ color: '#22c55e', fontWeight: 'bold', fontSize: 14 }}>
                                                {handData.correctAction}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* GTO Frequencies */}
                            {Object.keys(gtoFreqs || {}).length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <div style={styles.sectionLabel}>GTO FREQUENCIES</div>
                                    <div style={styles.freqBars}>
                                        {Object.entries(gtoFreqs || {})
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([action, freq]) => (
                                                <div key={action} style={styles.freqRow}>
                                                    <div style={styles.freqLabel}>{action}</div>
                                                    <div style={styles.freqBarBg}>
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${freq}%` }}
                                                            transition={{ duration: 0.5 }}
                                                            style={{
                                                                ...styles.freqBarFill,
                                                                background: action === handData.action
                                                                    ? config.color
                                                                    : action === handData.correctAction
                                                                        ? '#22c55e'
                                                                        : '#475569',
                                                            }}
                                                        />
                                                    </div>
                                                    <div style={styles.freqValue}>{freq}%</div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {/* Phase 39: Spot Context — rich question text from engine */}
                            {handData.question && (
                                <div style={{
                                    marginTop: 12, padding: '8px 12px',
                                    background: 'rgba(255,255,255,0.02)',
                                    borderRadius: 8,
                                    border: '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    <div style={{
                                        fontSize: 9, fontWeight: 700, color: '#94a3b8',
                                        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
                                    }}>
                                        SPOT CONTEXT
                                    </div>
                                    <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5 }}>
                                        {handData.question}
                                    </div>
                                </div>
                            )}

                            {/* Phase 27: Strategic Explanation */}
                            {handData.explanation && (
                                <div style={{
                                    marginTop: 12, padding: '10px 12px',
                                    background: 'rgba(0, 212, 255, 0.04)',
                                    borderRadius: 8,
                                    border: '1px solid rgba(0, 212, 255, 0.12)',
                                }}>
                                    <div style={{
                                        fontSize: 9, fontWeight: 700, color: '#00d4ff',
                                        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
                                    }}>
                                        WHY THIS IS OPTIMAL
                                    </div>
                                    <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.6 }}>
                                        {handData.explanation}
                                    </div>
                                </div>
                            )}

                            {/* Phase 27: Per-Action EV comparison */}
                            {handData.evData?.actionEVs && Object.keys(handData.evData.actionEVs || {}).length > 0 && (
                                <div style={{ marginTop: 10 }}>
                                    <div style={styles.sectionLabel}>EV BY ACTION</div>
                                    {Object.entries(handData.evData.actionEVs || {})
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([action, ev]) => {
                                            const isOptimal = action === handData.correctAction ||
                                                (handData.correctAction && action.toLowerCase() === handData.correctAction.toLowerCase());
                                            const isSelected = action === handData.action ||
                                                (handData.action && action.toLowerCase() === handData.action.toLowerCase());
                                            return (
                                                <div key={action} style={{
                                                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3,
                                                }}>
                                                    <div style={{
                                                        width: 55, fontSize: 10, fontWeight: 600,
                                                        color: isOptimal ? '#22c55e' : isSelected ? config.color : '#94a3b8',
                                                        textAlign: 'right',
                                                    }}>
                                                        {isOptimal && '✓ '}{isSelected && !isOptimal && '✕ '}{action}
                                                    </div>
                                                    <div style={{
                                                        fontSize: 11, fontWeight: 700,
                                                        fontFamily: "'Inter', monospace",
                                                        color: ev >= 0 ? '#22c55e' : '#ef4444',
                                                    }}>
                                                        {ev >= 0 ? '+' : ''}{typeof ev === 'number' ? ev.toFixed(2) : ev} BB
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* ═══ PHASE 20: Range Grid — Full solver range for this spot ═══ */}
                    {handData.rawFrequencies && Object.keys(handData.rawFrequencies || {}).length > 0 && (
                        <RangeGridSection
                            rawFrequencies={handData.rawFrequencies}
                            heroHand={handData.heroHand || (Array.isArray(handData.heroCards) ? handData.heroCards.map(c => c[0]).join('') : null)}
                            actions={Object.keys(handData.rawFrequencies || {})}
                            board={handData.board}
                            heroPosition={handData.heroPosition}
                            heroCards={handData.heroCards}
                            handEVs={handData.evData?.handEVs || null}
                        />
                    )}

                    {/* Hand strip — clickable thumbnails */}
                    <div style={styles.handStrip}>
                        {handHistory.map((h, i) => {
                            const c = CLASSIFICATION_CONFIG[h.classification] || CLASSIFICATION_CONFIG[MOVE_CLASSIFICATIONS.WRONG];
                            return (
                                <motion.button
                                    key={i}
                                    whileHover={{ scale: 1.15 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => setSelectedHandIndex(i)}
                                    style={{
                                        ...styles.stripDot,
                                        background: i === selectedHandIndex ? c.color : c.bgColor,
                                        border: `2px solid ${i === selectedHandIndex ? c.color : c.borderColor}`,
                                    }}
                                    title={`Hand ${i + 1}: ${c.label}`}
                                >
                                    {i + 1}
                                </motion.button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                /* LIST VIEW — Compact scrollable list */
                <div style={styles.listView}>
                    {handHistory.filter(entry => {
                        if (!filterMistakesOnly) return true;
                        if (filterMistakesOnly === 'blunder') return entry.classification === 'blunder';
                        return ['inaccuracy', 'wrong', 'blunder'].includes(entry.classification);
                    }).map((entry, i) => {
                        const originalIndex = handHistory.indexOf(entry);
                        const c = CLASSIFICATION_CONFIG[entry.classification] || CLASSIFICATION_CONFIG[MOVE_CLASSIFICATIONS.WRONG];
                        const hd = entry.handData || entry;
                        return (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.03 }}
                                onClick={() => { setSelectedHandIndex(originalIndex); setViewMode('detail'); }}
                                style={styles.listItem}
                            >
                                <div style={{ ...styles.listNum, borderColor: c.borderColor }}>{originalIndex + 1}</div>
                                <div style={{
                                    ...styles.listBadge,
                                    background: c.bgColor, borderColor: c.borderColor, color: c.color,
                                }}>
                                    {c.icon} {c.label}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={styles.listHand}>
                                        {hd.heroPosition && <span style={styles.listPos}>{hd.heroPosition}</span>}
                                        {hd.street && <span style={{ fontSize: 9, color: '#64748b', marginRight: 4 }}>{hd.street}</span>}
                                        {Array.isArray(hd.heroCards) ? hd.heroCards.join('') : (hd.heroCards || '')}
                                    </div>
                                    {/* Phase 27: Show action taken + correct action in list view */}
                                    <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {hd.action && (
                                            <span style={{ color: entry.classification === 'best' || entry.classification === 'correct' ? '#22c55e' : c.color }}>
                                                {hd.action}
                                            </span>
                                        )}
                                        {hd.correctAction && hd.action !== hd.correctAction && (
                                            <span style={{ color: '#64748b' }}> → <span style={{ color: '#22c55e' }}>{hd.correctAction}</span></span>
                                        )}
                                        {/* Phase 51: Hand category in list */}
                                        {hd.handCategory && (
                                            <span style={{ color: '#64748b', marginLeft: 4, fontStyle: 'italic' }}>
                                                ({hd.handCategory})
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{
                                    ...styles.listEV,
                                    color: entry.evLoss > 0 ? '#ef4444' : '#22c55e',
                                }}>
                                    {entry.evLoss > 0 ? `-${entry.evLoss.toFixed(1)}` : '0.0'}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/**
 * ═══ PHASE 20: Collapsible Range Grid Section ═══
 * Shows the full 13×13 solver range colored by action frequency.
 * Collapsed by default to avoid overwhelming the hand review.
 */
function RangeGridSection({ rawFrequencies, heroHand, actions, board, heroPosition, heroCards, handEVs }) {
    const [expanded, setExpanded] = useState(false);

    // Convert rawFrequencies to RangeGrid's gridData format
    // rawFrequencies format from engine: { action → { hand → freq(0-1) } }
    // RangeGrid gridData format: same — { action → { hand → freq(0-100) } }
    const gridData = useMemo(() => {
        if (!rawFrequencies) return {};
        const data = {};
        for (const [action, handFreqs] of Object.entries(rawFrequencies || {})) {
            if (typeof handFreqs !== 'object') continue;
            data[action] = {};
            for (const [hand, freq] of Object.entries(handFreqs || {})) {
                // Engine stores 0.0-1.0, RangeGrid expects 0-100
                data[action][hand] = typeof freq === 'number' ? Math.round(freq * 100) : 0;
            }
        }
        return data;
    }, [rawFrequencies]);

    // Parse board cards for SolverLineSummary
    const boardCards = useMemo(() => {
        if (!board) return [];
        if (Array.isArray(board)) return board;
        const cleaned = board.replace(/\s+/g, '');
        const cards = [];
        for (let i = 0; i < cleaned.length; i += 2) {
            if (i + 1 < cleaned.length) cards.push(cleaned.substring(i, i + 2));
        }
        return cards;
    }, [board]);

    // ═══ PHASE 21: Parse hero's held cards for blocker analysis ═══
    const heldCards = useMemo(() => {
        if (heroCards && Array.isArray(heroCards)) return heroCards;
        if (heroCards && typeof heroCards === 'string') {
            // Parse "AhKd" style string into ['Ah', 'Kd']
            const cleaned = heroCards.replace(/\s+/g, '');
            const cards = [];
            for (let i = 0; i < cleaned.length; i += 2) {
                if (i + 1 < cleaned.length) cards.push(cleaned.substring(i, i + 2));
            }
            return cards;
        }
        return [];
    }, [heroCards]);

    // ═══ PHASE 21: Compute approximate equity from solver frequencies ═══
    const equityData = useMemo(() => {
        if (!gridData || Object.keys(gridData || {}).length === 0) return null;
        // Hero equity approximation: higher betting/raising frequency = more equity
        // Fold-heavy range = less equity for hero
        let totalFreq = 0;
        let aggressiveFreq = 0;
        let passiveFreq = 0;
        let foldFreq = 0;
        for (const [action, handFreqs] of Object.entries(gridData || {})) {
            const sum = Object.values(handFreqs || {}).reduce((s, v) => s + (v || 0), 0);
            const actionLower = action.toLowerCase();
            if (actionLower.includes('fold') || actionLower === 'f') {
                foldFreq += sum;
            } else if (actionLower.includes('bet') || actionLower.includes('raise') || actionLower === 'r' || actionLower.startsWith('b')) {
                aggressiveFreq += sum;
            } else {
                passiveFreq += sum;
            }
            totalFreq += sum;
        }
        if (totalFreq === 0) return null;
        // Approximate: high aggression = ~55-65% equity, balanced = ~48-52%, fold-heavy = ~35-45%
        const aggressiveRatio = aggressiveFreq / totalFreq;
        const foldRatio = foldFreq / totalFreq;
        const heroEq = Math.round(40 + aggressiveRatio * 25 - foldRatio * 15);
        return { heroEquity: Math.max(15, Math.min(85, heroEq)), villainEquity: Math.max(15, Math.min(85, 100 - heroEq)) };
    }, [gridData]);

    // ═══ PHASE 21: Build gridData for BlockerScorePanel (13x13 with cell.actions) ═══
    // Must be before early return to satisfy Rules of Hooks
    const blockerGridData = useMemo(() => {
        if (!gridData) return null;
        const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
        const grid = Array.from({ length: 13 }, () => Array.from({ length: 13 }, () => null));
        for (let i = 0; i < 13; i++) {
            for (let j = 0; j < 13; j++) {
                const handKey = i === j ? `${RANKS[i]}${RANKS[j]}`
                    : i < j ? `${RANKS[i]}${RANKS[j]}s`
                    : `${RANKS[j]}${RANKS[i]}o`;
                const cellActions = {};
                for (const [action, handFreqs] of Object.entries(gridData || {})) {
                    cellActions[action] = handFreqs[handKey] || 0;
                }
                grid[i][j] = { actions: cellActions };
            }
        }
        return grid;
    }, [gridData]);

    if (!gridData || Object.keys(gridData || {}).length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ marginTop: 16 }}
        >
            <button
                onClick={() => setExpanded(prev => !prev)}
                style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: expanded ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${expanded ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 8,
                    color: expanded ? '#00d4ff' : '#64748b',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease',
                }}
            >
                <span>Solver Range View</span>
                <span style={{ fontSize: 14, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                    ▼
                </span>
            </button>
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        style={{ overflow: 'hidden', marginTop: 8 }}
                    >
                        {/* ═══ PHASE 21: Equity Matchup bar ═══ */}
                        {equityData && (
                            <div style={{ marginBottom: 10 }}>
                                <EquityMatchup
                                    heroEquity={equityData.heroEquity}
                                    villainEquity={equityData.villainEquity}
                                    heroPosition={heroPosition || 'Hero'}
                                    villainPosition="Villain"
                                />
                            </div>
                        )}

                        <RangeGrid
                            gridData={gridData}
                            actions={actions}
                            heroHand={heroHand}
                            cellSize={22}
                            compact={true}
                            handEVs={handEVs || undefined}
                            showEVOverlay={!!handEVs}
                        />

                        {/* ═══ PHASE 21: Blocker Score Analysis ═══ */}
                        {heldCards.length > 0 && blockerGridData && boardCards.length >= 3 && (
                            <div style={{ marginTop: 10 }}>
                                <BlockerScorePanel
                                    board={boardCards}
                                    gridData={blockerGridData}
                                    actions={actions}
                                    heldCards={heldCards}
                                />
                            </div>
                        )}

                        {/* ═══ PHASE 21+: Runout Heatmap — How each card affects strategy ═══ */}
                        {boardCards.length >= 3 && boardCards.length < 5 && heldCards.length > 0 && (
                            <RunoutHeatmapSection
                                boardCards={boardCards}
                                heldCards={heldCards}
                                gridData={gridData}
                                actions={actions}
                            />
                        )}

                        {/* ═══ PHASE 21+: Solver Tree Viewer — Decision tree ═══ */}
                        {gridData && Object.keys(gridData || {}).length > 0 && (
                            <SolverTreeSection
                                gridData={gridData}
                                actions={actions}
                                street={boardCards.length <= 3 ? 'flop' : boardCards.length === 4 ? 'turn' : 'river'}
                            />
                        )}

                        {/* Solver strategy summary in natural language */}
                        {boardCards.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                                <SolverLineSummary
                                    gridData={gridData}
                                    board={boardCards}
                                    actions={actions}
                                    heroPosition={heroPosition || 'Hero'}
                                />
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/**
 * ═══ PHASE 21+: Runout Heatmap Section ═══
 * Generates approximate runout data from solver frequencies and hero cards.
 * Shows which cards help/hurt hero's strategy on the next street.
 */
function RunoutHeatmapSection({ boardCards, heldCards, gridData, actions }) {
    const [expanded, setExpanded] = useState(false);

    const { runoutData, deadCards } = useMemo(() => {
        const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
        const SUITS = ['s', 'h', 'd', 'c'];
        const dead = [...boardCards.map(c => c.toLowerCase()), ...heldCards.map(c => c.toLowerCase())];
        const deadSet = new Set(dead);
        const data = {};

        // Parse hero cards for draw detection
        const heroRanks = heldCards.map(c => c[0]?.toUpperCase());
        const heroSuits = heldCards.map(c => c[c.length - 1]?.toLowerCase());
        const boardRanks = boardCards.map(c => c[0]?.toUpperCase());
        const boardSuits = boardCards.map(c => c[c.length - 1]?.toLowerCase());

        // Count flush draw potential
        const suitCounts = {};
        [...boardSuits, ...heroSuits].forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
        const flushDrawSuit = Object.entries(suitCounts || {}).find(([, c]) => c >= 4)?.[0] || null;
        const hasFlushDraw = Object.values(suitCounts || {}).some(c => c === 4);

        // Detect straight draw potential (simplified)
        const rankValues = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, 'T': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
        const allRankVals = [...boardRanks, ...heroRanks].map(r => rankValues[r] || 0).sort((a, b) => a - b);

        // Hero's aggression level from solver
        let heroAggrPct = 0;
        let totalPct = 0;
        if (gridData) {
            for (const [action, handFreqs] of Object.entries(gridData || {})) {
                const al = action.toLowerCase();
                const sum = Object.values(handFreqs || {}).reduce((s, v) => s + (v || 0), 0);
                if (al.includes('bet') || al.includes('raise') || al === 'r' || al.startsWith('b')) {
                    heroAggrPct += sum;
                }
                totalPct += sum;
            }
        }
        const aggrRatio = totalPct > 0 ? heroAggrPct / totalPct : 0.5;

        for (const rank of RANKS) {
            for (const suit of SUITS) {
                const card = `${rank}${suit}`;
                if (deadSet.has(card.toLowerCase())) continue;

                let evDelta = 0;

                // Flush completing
                if (hasFlushDraw && suit === flushDrawSuit) {
                    evDelta += heroSuits.filter(s => s === flushDrawSuit).length >= 1 ? 2.5 : -1.5;
                }

                // Pair the board (generally bad for bluffs, good for value)
                if (boardRanks.includes(rank)) {
                    evDelta -= 0.8 * (1 - aggrRatio);
                }

                // Overcard to board
                const maxBoardRank = Math.max(...boardRanks.map(r => rankValues[r] || 0));
                if ((rankValues[rank] || 0) > maxBoardRank) {
                    evDelta += heroRanks.includes(rank) ? 1.8 : -0.5;
                }

                // Hero pairs up
                if (heroRanks.includes(rank)) {
                    evDelta += 1.5;
                }

                // Straight helper (simplified)
                const rv = rankValues[rank] || 0;
                const nearbyCount = allRankVals.filter(v => Math.abs(v - rv) <= 2 && v !== rv).length;
                if (nearbyCount >= 3) {
                    evDelta += 0.6;
                }

                // Add noise based on aggression profile
                evDelta *= (0.8 + aggrRatio * 0.4);

                data[card] = {
                    ev_delta: Math.round(evDelta * 100) / 100,
                    eq_shift: evDelta > 0 ? evDelta * 2 : evDelta * 1.5,
                    has_data: true,
                };
            }
        }

        return { runoutData: data, deadCards: dead };
    }, [boardCards, heldCards, gridData, actions]);

    if (!runoutData || Object.keys(runoutData || {}).length === 0) return null;

    return (
        <div style={{ marginTop: 10 }}>
            <button
                onClick={() => setExpanded(prev => !prev)}
                style={{
                    width: '100%', padding: '8px 14px',
                    background: expanded ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${expanded ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 8, color: expanded ? '#f87171' : '#64748b',
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'all 0.2s ease',
                }}
            >
                <span>Runout Analysis</span>
                <span style={{ fontSize: 14, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>▼</span>
            </button>
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        style={{ overflow: 'hidden', marginTop: 6 }}
                    >
                        <RunoutHeatmap runoutData={runoutData} deadCards={deadCards} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/**
 * ═══ PHASE 21+: Solver Tree Section ═══
 * Shows the decision tree for this spot.
 */
function SolverTreeSection({ gridData, actions, street }) {
    const [expanded, setExpanded] = useState(false);

    // Build spot detail from gridData for SolverTreeViewer
    const spotDetail = useMemo(() => {
        if (!gridData) return null;
        // Aggregate action frequencies across all hands
        const actionTotals = {};
        for (const [action, handFreqs] of Object.entries(gridData || {})) {
            const sum = Object.values(handFreqs || {}).reduce((s, v) => s + (v || 0), 0);
            const count = Object.values(handFreqs || {}).filter(v => v > 0).length;
            actionTotals[action] = count > 0 ? sum / count : 0; // average frequency
        }
        return { actions: actionTotals, street };
    }, [gridData, street]);

    if (!spotDetail) return null;

    return (
        <div style={{ marginTop: 10 }}>
            <button
                onClick={() => setExpanded(prev => !prev)}
                style={{
                    width: '100%', padding: '8px 14px',
                    background: expanded ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${expanded ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 8, color: expanded ? '#a78bfa' : '#64748b',
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'all 0.2s ease',
                }}
            >
                <span>Decision Tree</span>
                <span style={{ fontSize: 14, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>▼</span>
            </button>
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        style={{ overflow: 'hidden', marginTop: 6 }}
                    >
                        <SolverTreeViewer spotDetail={spotDetail} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const styles = {
    container: { marginBottom: 16 },
    header: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10,
    },
    headerTitle: {
        fontSize: 12, fontWeight: 'bold', color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: 1,
    },
    viewToggle: { display: 'flex', gap: 4 },
    toggleBtn: {
        padding: '4px 12px', borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
        color: '#64748b', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    },
    toggleBtnActive: {
        border: '1px solid rgba(0,212,255,0.4)', background: 'rgba(0,212,255,0.1)',
        color: '#00d4ff',
    },
    detailView: {},
    handNav: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10,
    },
    navBtn: {
        padding: '6px 14px', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
        color: '#94a3b8', fontSize: 12, cursor: 'pointer',
    },
    handCounter: { color: '#64748b', fontSize: 12, fontWeight: 600 },
    handCard: {
        background: 'rgba(0,0,0,0.3)', borderRadius: 12,
        padding: 16, border: '1px solid rgba(255,255,255,0.06)',
    },
    classBadge: {
        padding: '4px 12px', borderRadius: 12, fontSize: 12,
        fontWeight: 'bold', border: '1px solid',
    },
    boardSection: { marginBottom: 12 },
    heroSection: { marginBottom: 12 },
    actionSection: { marginBottom: 4 },
    sectionLabel: {
        fontSize: 9, fontWeight: 700, color: '#64748b',
        letterSpacing: 1.2, marginBottom: 6,
    },
    positionBadge: {
        marginLeft: 6, padding: '1px 6px', borderRadius: 4,
        background: 'rgba(0,212,255,0.15)', color: '#00d4ff',
        fontSize: 9, fontWeight: 'bold', letterSpacing: 0.5,
    },
    cardRow: { display: 'flex', gap: 4 },
    freqBars: { display: 'flex', flexDirection: 'column', gap: 4 },
    freqRow: { display: 'flex', alignItems: 'center', gap: 8 },
    freqLabel: { width: 50, fontSize: 11, color: '#94a3b8', fontWeight: 600 },
    freqBarBg: {
        flex: 1, height: 8, background: 'rgba(255,255,255,0.05)',
        borderRadius: 4, overflow: 'hidden',
    },
    freqBarFill: { height: '100%', borderRadius: 4 },
    freqValue: { width: 36, fontSize: 11, color: '#94a3b8', textAlign: 'right', fontWeight: 600 },
    handStrip: {
        display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 12,
        justifyContent: 'center',
    },
    stripDot: {
        width: 24, height: 24, borderRadius: 6, fontSize: 9,
        fontWeight: 'bold', color: '#fff', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    listView: {
        maxHeight: 300, overflowY: 'auto',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
    },
    listItem: {
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
    },
    listNum: {
        width: 22, height: 22, borderRadius: 4, fontSize: 10,
        fontWeight: 'bold', color: '#64748b', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        borderLeft: '2px solid',
    },
    listBadge: {
        padding: '2px 8px', borderRadius: 8, fontSize: 10,
        fontWeight: 'bold', border: '1px solid', minWidth: 65, textAlign: 'center',
    },
    listHand: {
        flex: 1, fontSize: 12, color: '#cbd5e1', fontWeight: 600,
    },
    listPos: {
        marginRight: 4, padding: '1px 4px', borderRadius: 3,
        background: 'rgba(0,212,255,0.1)', color: '#00d4ff', fontSize: 9,
    },
    listEV: {
        fontSize: 12, fontWeight: 'bold', fontFamily: "'Orbitron', monospace",
        minWidth: 40, textAlign: 'right',
    },
};
