/**
 * 🃏 HAND REPLAY VIEWER — Full visual hand replay for post-session review
 * Shows each hand as a card with board, hero cards, GTO frequencies, and classification
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CLASSIFICATION_CONFIG, MOVE_CLASSIFICATIONS } from '../../hooks/useGTOWScore';
import RangeGrid from './RangeGrid';
import SolverLineSummary from './SolverLineSummary';

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

    const selectedHand = handHistory[selectedHandIndex];
    const handData = selectedHand?.handData || selectedHand || {};
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

                            {/* Hero cards + position */}
                            <div style={styles.heroSection}>
                                <div style={styles.sectionLabel}>
                                    YOUR HAND {handData.heroPosition && <span style={styles.positionBadge}>{handData.heroPosition}</span>}
                                </div>
                                <div style={styles.cardRow}>
                                    {heroCards.map((c, i) => <MiniCard key={i} card={c} size="lg" />)}
                                </div>
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
                            {Object.keys(gtoFreqs).length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <div style={styles.sectionLabel}>GTO FREQUENCIES</div>
                                    <div style={styles.freqBars}>
                                        {Object.entries(gtoFreqs)
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
                        </motion.div>
                    </AnimatePresence>

                    {/* ═══ PHASE 20: Range Grid — Full solver range for this spot ═══ */}
                    {handData.rawFrequencies && Object.keys(handData.rawFrequencies).length > 0 && (
                        <RangeGridSection
                            rawFrequencies={handData.rawFrequencies}
                            heroHand={handData.heroHand || (Array.isArray(handData.heroCards) ? handData.heroCards.map(c => c[0]).join('') : null)}
                            actions={Object.keys(handData.rawFrequencies)}
                            board={handData.board}
                            heroPosition={handData.heroPosition}
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
                    {handHistory.map((entry, i) => {
                        const c = CLASSIFICATION_CONFIG[entry.classification] || CLASSIFICATION_CONFIG[MOVE_CLASSIFICATIONS.WRONG];
                        const hd = entry.handData || entry;
                        return (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.03 }}
                                onClick={() => { setSelectedHandIndex(i); setViewMode('detail'); }}
                                style={styles.listItem}
                            >
                                <div style={{ ...styles.listNum, borderColor: c.borderColor }}>{i + 1}</div>
                                <div style={{
                                    ...styles.listBadge,
                                    background: c.bgColor, borderColor: c.borderColor, color: c.color,
                                }}>
                                    {c.icon} {c.label}
                                </div>
                                <div style={styles.listHand}>
                                    {hd.heroPosition && <span style={styles.listPos}>{hd.heroPosition}</span>}
                                    {Array.isArray(hd.heroCards) ? hd.heroCards.join('') : (hd.heroCards || '')}
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
function RangeGridSection({ rawFrequencies, heroHand, actions, board, heroPosition }) {
    const [expanded, setExpanded] = useState(false);

    // Convert rawFrequencies to RangeGrid's gridData format
    // rawFrequencies format from engine: { action → { hand → freq(0-1) } }
    // RangeGrid gridData format: same — { action → { hand → freq(0-100) } }
    const gridData = useMemo(() => {
        if (!rawFrequencies) return {};
        const data = {};
        for (const [action, handFreqs] of Object.entries(rawFrequencies)) {
            if (typeof handFreqs !== 'object') continue;
            data[action] = {};
            for (const [hand, freq] of Object.entries(handFreqs)) {
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

    if (!gridData || Object.keys(gridData).length === 0) return null;

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
                        <RangeGrid
                            gridData={gridData}
                            actions={actions}
                            heroHand={heroHand}
                            cellSize={22}
                            compact={true}
                        />
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
