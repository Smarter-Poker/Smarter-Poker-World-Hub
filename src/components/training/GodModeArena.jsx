/**
 * GOD MODE ARENA — GTO Wizard-Style Training UI
 * ═══════════════════════════════════════════════════════════════════════════
 * Full-immersion training with:
 * - GTO Wizard-style action buttons + 5-tier feedback
 * - GTOW Score tracking + EV Loss metrics
 * - Post-session review with hand history
 * - 25 questions per level, 10 levels total
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import GameUIRouter from './GameUIRouter';
import TrainerConfigModal from './TrainerConfigModal';
import HandReplayViewer from './HandReplayViewer';
import PositionStatsPanel from './PositionStatsPanel';
import PreflopRangeTrainer from './PreflopRangeTrainer';
import LifetimeStatsCard from './LifetimeStatsCard';
import SessionHistoryList from './SessionHistoryList';
// ═══ PHASE 16: Performance Analytics Components ═══
import PerformanceTrends from './PerformanceTrends';
import StreetAccuracyPanel from './StreetAccuracyPanel';
import ActionAccuracyPanel from './ActionAccuracyPanel';
import MistakePatternPanel from './MistakePatternPanel';
import { useTrainingAnalytics } from './PerformanceTrends';
// ═══ PHASE 17: Smart Practice + AI Coaching ═══
import SmartPracticeBanner from './SmartPracticeBanner';
import { getSessionToken } from '../../lib/authUtils';
// ═══ PHASE 18: Leaderboard ═══
import LeaderboardPanel from './LeaderboardPanel';
// ═══ PHASE 19: Share Card + Achievement Toasts ═══
import SessionShareCard from './SessionShareCard';
import AchievementToast from './AchievementToast';
import { checkAllAchievements } from './utils/achievementChecker';
// ═══ PHASE 20: EV Graph + GTO Deviation Heatmap ═══
import EVGraph from './EVGraph';
import GTODeviationHeatmap from './GTODeviationHeatmap';
// ═══ PHASE 21: Study Streak Map + Ghost Replay ═══
import { StudyStreakMapAuto } from './StudyStreakMap';
import GhostReplayEngine from './GhostReplayEngine';

// DYNAMIC IMPORTS — breaks circular dependency (page files importing from src/)
// These page-level components are only used for specific gameIds, so lazy-loading is fine
const SPRTrainer = dynamic(() => import('../../../pages/hub/training/spr-trainer'), { ssr: false });
const QuizGauntlet = dynamic(() => import('../../../pages/hub/training/quiz-gauntlet'), { ssr: false });

// Components defined locally within this file or in other imports
import useGTOTrainer from '../../hooks/useGTOTrainer';
import useSpacedRepetition from '../../hooks/useSpacedRepetition';
import { CLASSIFICATION_CONFIG, MOVE_CLASSIFICATIONS } from '../../hooks/useGTOWScore';
const Confetti = dynamic(() => import('react-confetti'), { ssr: false });
import TRAINING_CONFIG from '../../config/trainingConfig';
import { getGameById } from '../../data/TRAINING_LIBRARY';
import { enqueueMutation } from '../../engine/OfflineSyncQueue';
import { eventBus, EventType, busEmit } from '../../engine/EventBus';
// Extracted utilities
import { saveSession } from './utils/saveSession';
import { checkSpeedBonus } from './utils/achievementChecker';

// ALL GAMES use full-screen immersive UI with GameUIRouter
const FULL_SCREEN_UI_GAMES = [
    // Cash Games (25)
    'cash-001', 'cash-002', 'cash-003', 'cash-004', 'cash-005',
    'cash-006', 'cash-007', 'cash-008', 'cash-009', 'cash-010',
    'cash-011', 'cash-012', 'cash-013', 'cash-014', 'cash-015',
    'cash-016', 'cash-017', 'cash-018', 'cash-019', 'cash-020',
    'cash-021', 'cash-022', 'cash-023', 'cash-024', 'cash-025',
    // MTT Games (25)
    'mtt-001', 'mtt-002', 'mtt-003', 'mtt-004', 'mtt-005',
    'mtt-006', 'mtt-007', 'mtt-008', 'mtt-009', 'mtt-010',
    'mtt-011', 'mtt-012', 'mtt-013', 'mtt-014', 'mtt-015',
    'mtt-016', 'mtt-017', 'mtt-018', 'mtt-019', 'mtt-020',
    'mtt-021', 'mtt-022', 'mtt-023', 'mtt-024', 'mtt-025',
    // Spins Games (10)
    'spins-001', 'spins-002', 'spins-003', 'spins-004', 'spins-005',
    'spins-006', 'spins-007', 'spins-008', 'spins-009', 'spins-010',
    // Psychology Games (20)
    'psy-001', 'psy-002', 'psy-003', 'psy-004', 'psy-005',
    'psy-006', 'psy-007', 'psy-008', 'psy-009', 'psy-010',
    'psy-011', 'psy-012', 'psy-013', 'psy-014', 'psy-015',
    'psy-016', 'psy-017', 'psy-018', 'psy-019', 'psy-020',
    // Advanced Games (20)
    'adv-001', 'adv-002', 'adv-003', 'adv-004', 'adv-005',
    'adv-006', 'adv-007', 'adv-008', 'adv-009', 'adv-010',
    'adv-011', 'adv-012', 'adv-013', 'adv-014', 'adv-015',
    'adv-016', 'adv-017', 'adv-018', 'adv-019', 'adv-020',
    // Special Games (7)
    'tournament-prep', 'final-table-sim', 'quiz-gauntlet',
    'hand-lab', 'bluff-catcher', 'mixed-strategy-lab', 'study-group',
];

// SVG ICON RENDERER for classification badges
function ClassificationSVGIcon({ icon, size = 14, color = 'currentColor' }) {
    const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeLinecap: 'round', strokeLinejoin: 'round' };
    switch (icon) {
        case 'star': return <svg {...props} strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
        case 'check': return <svg {...props} strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>;
        case 'alert': return <svg {...props} strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
        case 'x': return <svg {...props} strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
        case 'warning': return <svg {...props} strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
        default: return <span>{icon || '?'}</span>;
    }
}

function getEngineType(gameId) {

    const game = getGameById(gameId);
    if (!game) return 'PIO';
    if (game.category === 'PSYCHOLOGY') return 'SCENARIO';
    if (game.tags?.includes('gto') || game.tags?.includes('math')) return 'PIO';
    return 'CHART';
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND HISTORY ENTRY — Single row in the post-session review
// ═══════════════════════════════════════════════════════════════════════════

function HandHistoryRow({ entry, index }) {
    const [expanded, setExpanded] = useState(false);
    const config = CLASSIFICATION_CONFIG[entry.classification] || CLASSIFICATION_CONFIG[MOVE_CLASSIFICATIONS.WRONG];
    const handData = entry.handData || {};

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => setExpanded(!expanded)}
            style={{ cursor: 'pointer' }}
        >
            {/* Main row */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    background: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                    borderLeft: `3px solid ${config.borderColor}`,
                    borderRadius: 4,
                }}
            >
                <div style={{ color: '#64748b', fontSize: 11, fontWeight: '600', minWidth: 24 }}>
                    #{entry.handNumber}
                </div>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 12,
                    background: config.bgColor, border: `1px solid ${config.borderColor}`,
                    color: config.color, fontSize: 11, fontWeight: 'bold',
                    minWidth: 80, justifyContent: 'center',
                }}>
                    <span><ClassificationSVGIcon icon={config.icon} size={12} color={config.color} /></span>
                    <span>{config.label}</span>
                </div>
                <div style={{
                    flex: 1, color: '#cbd5e1', fontSize: 12,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {entry.question || `Hand ${entry.handNumber}`}
                </div>
                <div style={{
                    color: entry.evLoss > 0 ? '#ef4444' : '#22c55e',
                    fontSize: 12, fontWeight: 'bold', fontFamily: "'Orbitron', monospace",
                    minWidth: 60, textAlign: 'right',
                }}>
                    {entry.evLoss > 0 ? `-${entry.evLoss.toFixed(2)}` : '0.00'} BB
                </div>
                <span style={{ color: '#64748b', fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
            </div>

            {/* F3: Expanded Hand Replay Detail */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{
                            overflow: 'hidden',
                            background: 'rgba(0,0,0,0.3)',
                            borderLeft: `3px solid ${config.borderColor}`,
                            padding: expanded ? '10px 14px 10px 40px' : 0,
                            fontSize: 11,
                            color: '#94a3b8',
                        }}
                    >
                        {handData.board && (
                            <div style={{ marginBottom: 4 }}>
                                <span style={{ color: '#64748b', fontWeight: 'bold' }}>Board: </span>
                                <span style={{ color: '#e2e8f0' }}>{handData.board}</span>
                            </div>
                        )}
                        {handData.heroCards && (
                            <div style={{ marginBottom: 4 }}>
                                <span style={{ color: '#64748b', fontWeight: 'bold' }}>Hero: </span>
                                <span style={{ color: '#00d4ff' }}>{Array.isArray(handData.heroCards) ? handData.heroCards.join(' ') : handData.heroCards}</span>
                                {handData.heroPosition && <span> ({handData.heroPosition})</span>}
                            </div>
                        )}
                        <div style={{ marginBottom: 4 }}>
                            <span style={{ color: '#64748b', fontWeight: 'bold' }}>Your Action: </span>
                            <span style={{ color: config.color }}>{handData.action || '?'}</span>
                            {handData.correctAction && handData.action !== handData.correctAction && (
                                <span> → Optimal: <span style={{ color: '#22c55e', fontWeight: 'bold' }}>{handData.correctAction}</span></span>
                            )}
                        </div>
                        {entry.isRealData && (
                            <div style={{ marginTop: 4 }}>
                                <span style={{
                                    padding: '1px 6px', borderRadius: 4, fontSize: 9,
                                    background: 'rgba(0,212,255,0.15)', color: '#00d4ff',
                                    border: '1px solid rgba(0,212,255,0.3)', fontWeight: 'bold',
                                }}>PIO DATA</span>
                            </div>
                        )}
                        {/* Enhanced Replay: Pot, Stack, Street, GTO Frequencies */}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                            {handData.pot > 0 && (
                                <span style={{ fontSize: 10, color: '#64748b' }}>
                                    Pot: <strong style={{ color: '#fbbf24' }}>{handData.pot} BB</strong>
                                </span>
                            )}
                            {handData.stackDepth > 0 && (
                                <span style={{ fontSize: 10, color: '#64748b' }}>
                                    Stack: <strong style={{ color: '#e2e8f0' }}>{handData.stackDepth} BB</strong>
                                </span>
                            )}
                            {handData.street && (
                                <span style={{ fontSize: 10, color: '#64748b' }}>
                                    Street: <strong style={{ color: '#e2e8f0' }}>{handData.street}</strong>
                                </span>
                            )}
                        </div>
                        {/* GTO Frequency breakdown if available */}
                        {entry.gtoFrequencies && Object.keys(entry.gtoFrequencies).length > 0 && (
                            <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1, marginBottom: 3 }}>GTO FREQUENCIES</div>
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {Object.entries(entry.gtoFrequencies).map(([action, freq]) => (
                                        <span key={action} style={{ fontSize: 10, color: '#94a3b8' }}>
                                            {action}: <strong style={{ color: '#e2e8f0' }}>{typeof freq === 'number' ? `${freq}%` : freq}</strong>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// F14: ACCURACY BY POSITION — Horizontal bar chart per seat
// ═══════════════════════════════════════════════════════════════════════════

function AccuracyByPositionChart({ handHistory }) {
    if (!handHistory || handHistory.length < 3) return null;
    const posStats = {};
    handHistory.forEach(h => {
        const pos = h.handData?.heroPosition || 'UNK';
        if (!posStats[pos]) posStats[pos] = { correct: 0, total: 0 };
        posStats[pos].total++;
        if (h.classification === 'best' || h.classification === 'correct') posStats[pos].correct++;
    });
    const positions = Object.keys(posStats);
    if (positions.length === 0) return null;
    return (
        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Accuracy by Position
            </div>
            {positions.map(pos => {
                const pct = posStats[pos].total > 0 ? Math.round((posStats[pos].correct / posStats[pos].total) * 100) : 0;
                return (
                    <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ width: 40, fontSize: 11, fontWeight: 600, color: '#00d4ff' }}>{pos}</span>
                        <div style={{ flex: 1, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.6, delay: 0.1 }}
                                style={{ height: '100%', borderRadius: 3, background: pct >= 70 ? '#22c55e' : pct >= 50 ? '#fbbf24' : '#ef4444' }}
                            />
                        </div>
                        <span style={{ width: 35, fontSize: 11, fontWeight: 'bold', color: pct >= 70 ? '#22c55e' : pct >= 50 ? '#fbbf24' : '#ef4444', textAlign: 'right' }}>
                            {pct}%
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// WEAKNESS HEATMAP — Position x Street accuracy grid
// ═══════════════════════════════════════════════════════════════════════════

function WeaknessHeatmap({ handHistory }) {
    if (!handHistory || handHistory.length < 5) return null;
    const grid = {};
    const positions = new Set();
    const streets = ['preflop', 'flop', 'turn', 'river'];
    handHistory.forEach(h => {
        const pos = h.handData?.heroPosition || 'UNK';
        const st = h.handData?.street || 'flop';
        positions.add(pos);
        if (!grid[pos]) grid[pos] = {};
        if (!grid[pos][st]) grid[pos][st] = { correct: 0, total: 0 };
        grid[pos][st].total++;
        if (h.classification === 'best' || h.classification === 'correct') grid[pos][st].correct++;
    });
    const posArr = [...positions];
    if (posArr.length === 0) return null;
    const getColor = (pct) => pct >= 80 ? '#22c55e' : pct >= 60 ? '#fbbf24' : pct >= 40 ? '#f97316' : '#ef4444';
    return (
        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Weakness Heatmap
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${streets.length}, 1fr)`, gap: 3, fontSize: 10 }}>
                <div style={{ color: '#64748b', fontWeight: 700 }}></div>
                {streets.map(s => (
                    <div key={s} style={{ color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', textAlign: 'center', fontSize: 9 }}>
                        {s.slice(0, 3)}
                    </div>
                ))}
                {posArr.map(pos => (
                    <React.Fragment key={pos}>
                        <div style={{ color: '#00d4ff', fontWeight: 700, display: 'flex', alignItems: 'center' }}>{pos}</div>
                        {streets.map(st => {
                            const cell = grid[pos]?.[st];
                            if (!cell || cell.total === 0) return <div key={st} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: 4, textAlign: 'center', color: '#475569' }}>-</div>;
                            const pct = Math.round((cell.correct / cell.total) * 100);
                            return (
                                <motion.div
                                    key={st}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.1 }}
                                    style={{
                                        background: `${getColor(pct)}22`,
                                        border: `1px solid ${getColor(pct)}44`,
                                        borderRadius: 4, padding: '4px 0', textAlign: 'center',
                                        color: getColor(pct), fontWeight: 700,
                                    }}
                                >
                                    {pct}%
                                </motion.div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
            <div style={{ fontSize: 9, color: '#64748b', marginTop: 6, textAlign: 'center' }}>
                Green = 80%+ | Yellow = 60-79% | Orange = 40-59% | Red = under 40%
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCURACY OVER TIME — Rolling accuracy line chart across session
// ═══════════════════════════════════════════════════════════════════════════

function AccuracyOverTimeChart({ handHistory }) {
    if (!handHistory || handHistory.length < 3) return null;
    const points = [];
    for (let i = 0; i < handHistory.length; i++) {
        const windowStart = Math.max(0, i - 4);
        let correct = 0;
        for (let j = windowStart; j <= i; j++) {
            if (handHistory[j].classification === 'best' || handHistory[j].classification === 'correct') correct++;
        }
        points.push(Math.round((correct / (i - windowStart + 1)) * 100));
    }
    const maxH = 60;
    const pathD = points.map((p, i) => {
        const x = (i / Math.max(1, points.length - 1)) * 100;
        const y = maxH - (p / 100) * maxH;
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ');
    return (
        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Accuracy Over Time
            </div>
            <svg viewBox={`0 0 100 ${maxH}`} style={{ width: '100%', height: 60 }} preserveAspectRatio="none">
                <defs>
                    <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={`${pathD} L100,${maxH} L0,${maxH} Z`} fill="url(#accGrad)" />
                <path d={pathD} fill="none" stroke="#00d4ff" strokeWidth="1.5" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginTop: 2 }}>
                <span>Hand 1</span>
                <span>Hand {handHistory.length}</span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// F15: CLASSIFICATION DONUT CHART — SVG donut of move distribution
// ═══════════════════════════════════════════════════════════════════════════

function ClassificationDonut({ handHistory, gtowScore }) {
    const segments = useMemo(() => {
        if (!handHistory || handHistory.length === 0) return [];
        const counts = {};
        Object.values(MOVE_CLASSIFICATIONS).forEach(c => counts[c] = 0);
        handHistory.forEach(h => { if (h.classification) counts[h.classification]++; });
        const total = handHistory.length;
        const colorMap = {};
        Object.entries(CLASSIFICATION_CONFIG).forEach(([key, cfg]) => { colorMap[key] = cfg.color; });

        let cumAngle = 0;
        return Object.entries(counts)
            .filter(([, count]) => count > 0)
            .map(([key, count]) => {
                const pct = count / total;
                const startAngle = cumAngle;
                cumAngle += pct * 360;
                return { key, count, pct, startAngle, endAngle: cumAngle, color: colorMap[key] || '#666' };
            });
    }, [handHistory]);

    if (segments.length === 0) return null;

    const cx = 55, cy = 55, r = 40, strokeWidth = 12;
    const circumference = 2 * Math.PI * r;
    const scoreColor = gtowScore >= 80 ? '#22c55e' : gtowScore >= 60 ? '#fbbf24' : '#ef4444';

    let dashOffset = 0;

    return (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <svg width={110} height={110} viewBox="0 0 110 110">
                {/* Background ring */}
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth} />
                {/* Segments */}
                {segments.map(seg => {
                    const segLen = seg.pct * circumference;
                    const offset = dashOffset;
                    dashOffset += segLen;
                    return (
                        <circle
                            key={seg.key}
                            cx={cx} cy={cy} r={r}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${segLen} ${circumference - segLen}`}
                            strokeDashoffset={-offset}
                            transform={`rotate(-90 ${cx} ${cy})`}
                            strokeLinecap="butt"
                        />
                    );
                })}
                {/* Center score */}
                <text x={cx} y={cy - 4} textAnchor="middle" fill={scoreColor} fontSize="18" fontWeight="bold" fontFamily="'Orbitron', monospace">
                    {gtowScore}
                </text>
                <text x={cx} y={cy + 10} textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="600" letterSpacing="1">
                    GTOW
                </text>
            </svg>
            <div style={{ flex: 1 }}>
                {segments.map(seg => (
                    <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                        <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, flex: 1 }}>
                            {CLASSIFICATION_CONFIG[seg.key]?.label || seg.key}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 'bold', color: seg.color }}>
                            {seg.count} ({Math.round(seg.pct * 100)}%)
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// F4: EV LOSS GRAPH — Cumulative EV loss sparkline
// ═══════════════════════════════════════════════════════════════════════════

function EVLossGraph({ handHistory }) {
    // Build cumulative EV loss data points
    const dataPoints = useMemo(() => {
        if (!handHistory || handHistory.length < 2) return [];
        let cumulative = 0;
        return handHistory.map((h, i) => {
            cumulative += (h.evLoss || 0);
            return cumulative;
        });
    }, [handHistory]);

    if (!handHistory || handHistory.length < 2) return null;

    const maxLoss = Math.max(...dataPoints, 0.1);
    const graphHeight = 60;
    const barWidth = Math.max(2, Math.floor(100 / dataPoints.length) - 1);

    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                EV Loss Trend
            </div>
            <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 1,
                height: graphHeight, padding: '0 4px',
                background: 'rgba(0,0,0,0.2)', borderRadius: 8,
                overflow: 'hidden', width: '100%',
            }}>
                {dataPoints.map((val, i) => {
                    const height = maxLoss > 0 ? (val / maxLoss) * graphHeight : 0;
                    const color = val > maxLoss * 0.7 ? '#ef4444' : val > maxLoss * 0.3 ? '#fbbf24' : '#22c55e';
                    return (
                        <motion.div
                            key={i}
                            initial={{ height: 0 }}
                            animate={{ height: Math.max(2, height) }}
                            transition={{ delay: i * 0.03, duration: 0.3 }}
                            title={`Hand ${i + 1}: -${val.toFixed(2)} BB`}
                            style={{
                                width: barWidth + '%', flexShrink: 0,
                                background: color, borderRadius: '2px 2px 0 0',
                                cursor: 'default',
                            }}
                        />
                    );
                })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginTop: 2 }}>
                <span>Hand 1</span>
                <span>-{maxLoss.toFixed(1)} BB max</span>
                <span>Hand {dataPoints.length}</span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// F7: DRILL FILTERS — Pre-session position/street filter modal
// ═══════════════════════════════════════════════════════════════════════════

function DrillFilters({ show, onClose, onApply, difficulty, setDifficulty, timerMode, setTimerMode }) {
    const [positions, setPositions] = useState(['all']);
    const [streets, setStreets] = useState(['all']);

    if (!show) return null;

    const posOpts = ['all', 'BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB'];
    const streetOpts = ['all', 'preflop', 'flop', 'turn', 'river'];

    const toggleFilter = (arr, setter, val) => {
        if (val === 'all') { setter(['all']); return; }
        const without = arr.filter(x => x !== 'all');
        if (without.includes(val)) {
            const next = without.filter(x => x !== val);
            setter(next.length === 0 ? ['all'] : next);
        } else {
            setter([...without, val]);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
            }}
        >
            <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                style={{
                    background: 'linear-gradient(180deg, #1e1e2e, #0f0f1a)',
                    border: '1px solid rgba(0,212,255,0.3)', borderRadius: 16,
                    padding: 20, width: '90%', maxWidth: 360,
                }}
            >
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#e2e8f0', marginBottom: 16, textAlign: 'center' }}>
                    Drill Filters
                </div>

                <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 'bold', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Position</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {posOpts.map(p => (
                            <button key={p} onClick={() => toggleFilter(positions, setPositions, p)} style={{
                                padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 'bold',
                                minHeight: 44,
                                background: positions.includes(p) ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
                                color: positions.includes(p) ? '#00d4ff' : '#94a3b8',
                                border: `1px solid ${positions.includes(p) ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                cursor: 'pointer',
                            }}>{p.toUpperCase()}</button>
                        ))}
                    </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 'bold', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Street</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {streetOpts.map(s => (
                            <button key={s} onClick={() => toggleFilter(streets, setStreets, s)} style={{
                                padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 'bold',
                                minHeight: 44,
                                background: streets.includes(s) ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)',
                                color: streets.includes(s) ? '#a78bfa' : '#94a3b8',
                                border: `1px solid ${streets.includes(s) ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                cursor: 'pointer', textTransform: 'capitalize',
                            }}>{s}</button>
                        ))}
                    </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 'bold', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Difficulty</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {['beginner', 'standard', 'expert'].map(d => (
                            <button key={d} onClick={() => setDifficulty(d)} style={{
                                flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 11, fontWeight: 'bold',
                                background: difficulty === d ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
                                color: difficulty === d ? '#00d4ff' : '#94a3b8',
                                border: `1px solid ${difficulty === d ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                cursor: 'pointer', textTransform: 'capitalize'
                            }}>{d}</button>
                        ))}
                    </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 'bold', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Timer Mode</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {[
                            { id: 'relaxed', label: 'Relaxed (∞)' },
                            { id: 'standard', label: 'Standard (60s)' },
                            { id: 'blitz', label: 'Blitz (15s)' }
                        ].map(t => (
                            <button key={t.id} onClick={() => setTimerMode(t.id)} style={{
                                flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 11, fontWeight: 'bold',
                                background: timerMode === t.id ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                                color: timerMode === t.id ? '#ef4444' : '#94a3b8',
                                border: `1px solid ${timerMode === t.id ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                cursor: 'pointer'
                            }}>{t.label}</button>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={onClose} style={{
                        flex: 1, padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
                        minHeight: 48, background: 'transparent', color: '#94a3b8',
                        border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                    }}>Cancel</button>
                    <button onClick={() => { onApply({ positions, streets }); onClose(); }} style={{
                        flex: 1, padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
                        minHeight: 48, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        color: '#fff', border: 'none', cursor: 'pointer',
                    }}>Apply & Start</button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// F13: DAILY CHALLENGE BANNER
// ═══════════════════════════════════════════════════════════════════════════

function DailyChallengeBanner({ gtowScore, targetScore = 85 }) {
    const achieved = gtowScore >= targetScore;
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', marginBottom: 12,
                background: achieved
                    ? 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,163,74,0.1))'
                    : 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.1))',
                border: `1px solid ${achieved ? 'rgba(34,197,94,0.3)' : 'rgba(139,92,246,0.3)'}`,
                borderRadius: 10,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{achieved ? '✓' : '◎'}</span>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 'bold', color: achieved ? '#22c55e' : '#a78bfa' }}>
                        {achieved ? 'Daily Challenge Complete!' : 'Daily Challenge'}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                        Score {targetScore}%+ this session
                    </div>
                </div>
            </div>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 8,
                background: achieved ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${achieved ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
            }}>
                <span style={{ fontSize: 14, color: '#60a5fa' }}>◆</span>
                <span style={{ fontSize: 12, fontWeight: 'bold', color: achieved ? '#22c55e' : '#94a3b8' }}>
                    {achieved ? '+25' : '25'}
                </span>
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const TIMER_DURATIONS = { relaxed: 0, standard: 60, blitz: 15 };

function GodModeArenaInner({
    userId,
    gameId,
    gameName,
    level = 1,
    sessionId,
    onComplete,
    onExit,
    autoAdvance = false,
}) {
    // ═══════════════════════════════════════════════════════════════════════════
    // SPECIALIZED TRAINERS (Phase 14) -> Safely moved to exported wrapper
    // ═══════════════════════════════════════════════════════════════════════════

    const engineType = getEngineType(gameId);

    // Trainer config state
    const [trainerConfig, setTrainerConfig] = useState(null);
    const [showConfigModal, setShowConfigModal] = useState(false);

    const handleConfigStart = useCallback((config) => {
        setTrainerConfig(config);
        setShowConfigModal(false);
        // Game will re-mount with new config
    }, []);

    const {
        currentQuestion,
        questionNumber,
        totalQuestions,
        level: currentLevel,
        loading,
        error,
        correctCount,
        streak,
        bestStreak,
        totalXP,
        requiredCorrect,
        passThreshold,
        showFeedback,
        feedbackResult,
        explanation,
        gameComplete,
        levelPassed,
        // GTOW scoring
        moveClassification,
        evLoss,
        gtoFrequencies,
        gtowScore,
        totalEVLoss,
        sessionMistakes,
        handHistory,
        avgEVLossPerHand,
        avgEVLossPerMistake,
        avgFrequencyDiff,
        // Phase 37: Enhanced session metrics
        classificationCounts: gtowClassificationCounts,
        currentStreak: gtowCurrentStreak,
        bestGTOWStreak,
        lastClassification,
        gtowAccuracy,
        // Phase 38: Position & street accuracy
        positionAccuracy,
        streetAccuracy,
        weakestPosition,
        // Phase 40: Mistake patterns
        mistakePatterns,
        handTypePerformance,
        // Multi-street state
        currentStreet,
        isMultiStreetActive,
        handSummary,
        // Actions
        submitAnswer,
        nextQuestion,
        startNextLevel,
        retryLevel,
        retrainMistakes,
        resetGame,
        // ═══ PHASE 15: Weak-spot targeting ═══
        getWeakSpots,
        // ═══ PHASE 251-260: Enhanced training intelligence ═══
        structuredExplanation,
        generateLeakReport,
        getSessionGrade,
        getImprovementVelocity,
        prescribeDrills,
        getFrequencyMasteryScore,
        generateSessionReport,
        // ═══ PHASE 261-280: Deep coaching + analytics ═══
        getTeachingPrinciple,
        getPositionReminder,
        getTextureStrategyGuide,
        getSPRStrategyGuide,
        getVillainRangeNarration,
        getMultiStreetPlanningGuide,
        getFrequencyCorrectionPrompt,
        getTiltRecoveryAdvice,
        getSessionPacingAnalysis,
        estimateSpotDifficultyEnhanced,
        classifyHandStrength,
        estimateEquityVsRange,
        getActionEVComparison,
        getSolverLineComparison,
        getConceptMasteryReport,
        generateHints,
        getRunoutImpactPreview,
        getMixedFrequencyDrillData,
        getHandCategoryBreakdown,
        getSessionComparison,
        // ═══ PHASE 281-290: Advanced analytics + coaching ═══
        getRunningActionFrequencies,
        getMistakeClusters,
        getBoardCoverageAnalysis,
        getBluffToValueRatio,
        getEVLossHeatmap,
        getPositionLeaderboard,
        generateCoachingSummary,
        // ═══ PHASE 291-300: Advanced training intelligence II ═══
        getStreakAnalysis,
        getTimePressureAnalysis,
        getRangeConstructionDrill,
        getExploitativeAdjustments,
        getICMPressureAnalysis,
        getMultiGameTypeStats,
        getBettingSizeAnalysis,
        getHandReadingDrill,
        getVarianceSimulator,
        getPerformanceTrendAnalysis,
    } = useGTOTrainer(gameId, engineType, level, trainerConfig);

    // ═══ PHASE 15: Spaced Repetition (cross-session review) ═══
    const { dueCount: reviewDueCount, getReviewSession, markReviewed } = useSpacedRepetition(gameId);

    // ═══ PHASE 16: Cross-session analytics ═══
    const { analytics: crossSessionAnalytics, loading: analyticsLoading } = useTrainingAnalytics(gameId, 30);

    // ═══ PHASE 17: AI Coaching Debrief ═══
    const [aiCoaching, setAiCoaching] = useState(null);
    const [isLoadingCoaching, setIsLoadingCoaching] = useState(false);
    const coachingFetchedRef = useRef(false);

    useEffect(() => {
        if (!gameComplete || coachingFetchedRef.current || !gameId) return;
        coachingFetchedRef.current = true;

        async function fetchCoaching() {
            setIsLoadingCoaching(true);
            try {
                const token = getSessionToken();
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                // Build cross-session context from analytics
                let crossSessionContext = null;
                if (crossSessionAnalytics) {
                    const findWeakest = (dataMap, labelKey) => {
                        if (!dataMap) return null;
                        const sorted = Object.entries(dataMap)
                            .filter(([, v]) => v.total >= 5)
                            .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total));
                        if (!sorted[0]) return null;
                        const [key, val] = sorted[0];
                        return { [labelKey]: key, accuracy: Math.round((val.correct / val.total) * 100) };
                    };
                    crossSessionContext = {
                        milestones: crossSessionAnalytics.milestones || null,
                        mistakePatterns: crossSessionAnalytics.mistakePatterns?.slice(0, 3) || [],
                        weakPosition: findWeakest(crossSessionAnalytics.positionAccuracy, 'position'),
                        weakStreet: findWeakest(crossSessionAnalytics.streetAccuracy, 'street'),
                    };
                }

                const totalQ = handHistory?.length || 0;
                const correctQ = handHistory?.filter(h => h.classification === 'best' || h.classification === 'correct').length || 0;
                const acc = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : 0;

                // Build position stats
                const posStats = {};
                handHistory?.forEach(h => {
                    const pos = h.handData?.heroPosition || 'UNK';
                    if (!posStats[pos]) posStats[pos] = { correct: 0, total: 0 };
                    posStats[pos].total++;
                    if (h.classification === 'best' || h.classification === 'correct') posStats[pos].correct++;
                });

                // Build weak spots
                const weakSpots = [];
                const spotBuckets = {};
                handHistory?.forEach(h => {
                    if (h.classification === 'best' || h.classification === 'correct') return;
                    const key = `${h.handData?.heroPosition || 'UNK'}|${h.handData?.street || 'flop'}|${h.handData?.spotType || 'general'}`;
                    if (!spotBuckets[key]) spotBuckets[key] = { position: h.handData?.heroPosition || 'UNK', street: h.handData?.street || 'flop', spotType: h.handData?.spotType || 'general', mistakes: 0, total: 0 };
                    spotBuckets[key].mistakes++;
                });
                handHistory?.forEach(h => {
                    const key = `${h.handData?.heroPosition || 'UNK'}|${h.handData?.street || 'flop'}|${h.handData?.spotType || 'general'}`;
                    if (spotBuckets[key]) spotBuckets[key].total++;
                });
                Object.values(spotBuckets).forEach(b => {
                    if (b.total >= 2) weakSpots.push({ ...b, mistakeRate: b.mistakes / b.total });
                });
                weakSpots.sort((a, b) => b.mistakeRate - a.mistakeRate);

                // Build mistakes array
                const mistakesArr = handHistory
                    ?.filter(h => h.classification && h.classification !== 'best' && h.classification !== 'correct')
                    .slice(0, 8)
                    .map(h => ({
                        question: { question: h.questionText || 'GTO Decision', scenario: h.handData },
                        userAnswer: h.userAnswer || '?',
                        correctAnswer: h.correctAnswer || '?',
                    })) || [];

                const res = await fetch('/api/training/coaching-summary', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        gameId,
                        gameName,
                        level: currentLevel,
                        questionsAnswered: totalQ,
                        questionsCorrect: correctQ,
                        accuracy: acc,
                        streak: bestStreak,
                        timeSpentSeconds: sessionElapsed,
                        mistakes: mistakesArr,
                        gtowScore,
                        totalEVLoss,
                        classificationCounts: (() => {
                            const cc = {};
                            handHistory?.forEach(h => { if (h.classification) cc[h.classification] = (cc[h.classification] || 0) + 1; });
                            return cc;
                        })(),
                        positionStats: posStats,
                        weakSpots: weakSpots.slice(0, 5),
                        crossSessionContext,
                    }),
                });

                const data = await res.json();
                if (data.success && data.coaching) {
                    setAiCoaching(data.coaching);
                }
            } catch (err) {
                console.warn('[AICoaching] Fetch error:', err.message);
            }
            setIsLoadingCoaching(false);
        }
        fetchCoaching();
    }, [gameComplete, gameId, crossSessionAnalytics]);

    // Reset coaching when level changes
    useEffect(() => {
        coachingFetchedRef.current = false;
        setAiCoaching(null);
    }, [currentLevel]);

    const [showDrillFilters, setShowDrillFilters] = useState(false);
    const [drillFilters, setDrillFilters] = useState(null);
    const [mistakesFilterActive, setMistakesFilterActive] = useState(false);
    const [shareStatus, setShareStatus] = useState(null); // 'success' | 'error' | null
    // ═══ PHASE 19: Share Card + Achievements ═══
    const [showShareCard, setShowShareCard] = useState(false);
    const [showGhostReplay, setShowGhostReplay] = useState(false);
    const [sessionAchievements, setSessionAchievements] = useState([]);
    const achievementsCheckedRef = useRef(false);

    // Check achievements when game completes
    useEffect(() => {
        if (!gameComplete || achievementsCheckedRef.current) return;
        achievementsCheckedRef.current = true;

        const achievements = checkAllAchievements({
            currentStreak: bestStreak,
            bestStreak,
            accuracy: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
            questionsAnswered: totalQuestions,
            level: currentLevel,
            levelPassed,
            gtowScore,
        });

        if (achievements.length > 0) {
            setSessionAchievements(achievements);
        }
    }, [gameComplete, bestStreak, correctCount, totalQuestions, currentLevel, levelPassed, gtowScore]);

    // Reset on level change
    useEffect(() => {
        achievementsCheckedRef.current = false;
        setSessionAchievements([]);
    }, [currentLevel]);

    // ═══ QW-1: DIFFICULTY SELECTOR (beginner/standard/expert) ═══
    const [difficulty, setDifficulty] = useState(() => {
        if (typeof window !== 'undefined') return localStorage.getItem('gma_difficulty') || 'standard';
        return 'standard';
    });
    useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('gma_difficulty', difficulty); }, [difficulty]);

    // ═══ QW-2: TIMER MODE (relaxed/standard/blitz) ═══
    const [timerMode, setTimerMode] = useState(() => {
        if (typeof window !== 'undefined') return localStorage.getItem('gma_timer') || 'standard';
        return 'standard';
    });
    useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('gma_timer', timerMode); }, [timerMode]);
    const [timerRemaining, setTimerRemaining] = useState(TIMER_DURATIONS[timerMode] || 60);
    const timerIntervalRef = useRef(null);

    // Reset timer when new question loads
    // NOTE: UDT's CountdownTimer now handles the visual countdown + auto-submit.
    // This interval is only kept as a fallback for non-UDT game modes.
    useEffect(() => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        // Skip if UDT CountdownTimer is handling the timer (GTO trainer modes)
        if (trainerConfig?.timerEnabled || timerMode !== 'relaxed') return;
        const duration = TIMER_DURATIONS[timerMode];
        if (!duration || !currentQuestion || showFeedback || gameComplete) return;
        setTimerRemaining(duration);
        timerIntervalRef.current = setInterval(() => {
            setTimerRemaining(prev => {
                if (prev <= 1) {
                    clearInterval(timerIntervalRef.current);
                    // Auto-submit timeout as wrong answer
                    if (currentQuestion?.options?.length > 0) {
                        const wrongOption = currentQuestion.options.find(o => {
                            const id = o.id || o;
                            return id !== currentQuestion.correctAnswer;
                        });
                        if (wrongOption) submitAnswer(wrongOption.id || wrongOption);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerIntervalRef.current);
    }, [timerMode, trainerConfig, currentQuestion, showFeedback, gameComplete, submitAnswer]);

    // ═══ AUTO-ADVANCE FOR MULTI-TABLE BLITZ ═══
    useEffect(() => {
        if (autoAdvance && showFeedback && !gameComplete) {
            const timerId = setTimeout(() => {
                nextQuestion();
            }, 800);
            return () => clearTimeout(timerId);
        }
    }, [autoAdvance, showFeedback, gameComplete, nextQuestion]);

    // Pause timer during feedback
    useEffect(() => {
        if (showFeedback && timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }, [showFeedback]);



    // ═══ Phase 21: Game Phase State Machine ═══
    const [gamePhase, setGamePhase] = useState('splash'); // 'splash' | 'playing' | 'review'
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [reviewTab, setReviewTab] = useState('overview'); // 'overview' | 'hands' | 'analysis'
    const [adaptiveToast, setAdaptiveToast] = useState(null);

    // ═══ Phase 2: Speed Bonus Aggregation ═══
    const [speedBonusDiamonds, setSpeedBonusDiamonds] = useState(0);

    // ═══ Phase 2: Adaptive Difficulty Level (1-10) ═══
    // Phase 50: Enhanced adaptive difficulty using GTOW metrics
    const computedDifficultyLevel = useMemo(() => {
        if (!handHistory || handHistory.length < 3) return currentLevel || 1;
        const base = Math.min(10, Math.max(1, currentLevel || 1));

        // Factor 1: Overall accuracy (weighted by classification quality)
        const classWeights = { best: 1.0, correct: 0.75, inaccuracy: 0.3, wrong: 0, blunder: -0.2 };
        let weightedScore = 0;
        handHistory.forEach(h => {
            weightedScore += classWeights[h.classification] ?? 0;
        });
        const qualityRatio = weightedScore / handHistory.length; // 0-1 scale

        // Factor 2: Recent trend (last 5 hands weighted more heavily)
        const recent = handHistory.slice(-5);
        let recentScore = 0;
        recent.forEach(h => {
            recentScore += classWeights[h.classification] ?? 0;
        });
        const recentRatio = recent.length > 0 ? recentScore / recent.length : qualityRatio;

        // Factor 3: Streak momentum
        const streakBonus = (gtowCurrentStreak >= 5) ? 0.15 : (gtowCurrentStreak >= 3) ? 0.05 : (gtowCurrentStreak <= -3) ? -0.1 : 0;

        // Factor 4: Leak severity penalty — major leaks suggest difficulty is too high
        const leakPenalty = (mistakePatterns || [])
            .filter(p => p.severity === 'high')
            .length * 0.08;

        // Combined score: 60% quality, 25% recent trend, 15% momentum
        const combined = (qualityRatio * 0.6) + (recentRatio * 0.25) + (0.5 + streakBonus) * 0.15 - leakPenalty;

        // Map to difficulty adjustment
        if (combined >= 0.85) return Math.min(10, base + 2);    // Crushing it → jump up
        if (combined >= 0.7) return Math.min(10, base + 1);     // Doing well → step up
        if (combined >= 0.5) return base;                        // Steady → maintain
        if (combined >= 0.35) return Math.max(1, base - 1);     // Struggling → step down
        return Math.max(1, base - 2);                            // Drowning → drop fast
    }, [handHistory, currentLevel, gtowCurrentStreak, mistakePatterns]);

    // ═══ Phase 2: Wrap submitAnswer to capture speed data ═══
    const handleSubmitAnswer = useCallback((answerId, meta) => {
        // Track speed bonus diamonds using utility
        const bonus = checkSpeedBonus(meta);
        if (bonus > 0) {
            setSpeedBonusDiamonds(prev => prev + bonus);
        }
        return submitAnswer(answerId);
    }, [submitAnswer]);

    // ═══ PHASE 18: Splash stays until user clicks Start (no auto-transition) ═══
    const [splashReady, setSplashReady] = useState(false);
    useEffect(() => {
        if (gamePhase === 'splash' && currentQuestion && !loading) {
            setSplashReady(true);
        }
    }, [gamePhase, currentQuestion, loading]);

    const handleStartTraining = useCallback(() => {
        if (splashReady) {
            setGamePhase('playing');
        }
    }, [splashReady]);

    // Phase 8: Listen for adaptive difficulty changes
    useEffect(() => {
        const handler = (eventData) => {
            const { from, to, direction } = eventData || {};
            setAdaptiveToast({
                message: direction === 'up'
                    ? `Difficulty increased! Level ${from} → ${to}`
                    : `Difficulty decreased: Level ${from} → ${to}`,
                direction,
            });
            setTimeout(() => setAdaptiveToast(null), 3000);
        };
        const unsub = eventBus.on('adaptiveDifficultyChange', handler);
        return () => { if (typeof unsub === 'function') unsub(); };
    }, []);

    // Auto-transition to review when game completes + emit bus event
    useEffect(() => {
        if (gameComplete && gamePhase === 'playing') {
            setGamePhase('review');
            // Phase 2: Emit session-complete bus event
            try {
                eventBus.emit(EventType.SESSION_END, {
                    gameId: String(gameId),
                    score: Number(gtowScore),
                    totalHands: totalQuestions,
                    durationSeconds: Math.round((Date.now() - sessionStartRef.current) / 1000),
                    perfectActionCount: correctCount
                }, 'GodModeArena');
                // Also emit training:session-complete for dual-subscription dashboards
                eventBus.emit('training:session-complete', {
                    gameId: String(gameId),
                    score: Number(gtowScore),
                    totalHands: totalQuestions,
                    durationSeconds: Math.round((Date.now() - sessionStartRef.current) / 1000),
                    perfectActionCount: correctCount
                }, 'GodModeArena');
            } catch (e) {
                console.warn('[GodModeArena] Bus emit failed:', e);
            }
        }
    }, [gameComplete, gamePhase, gameId, gameName, gtowScore, totalEVLoss, totalQuestions, sessionMistakes, correctCount, bestStreak, speedBonusDiamonds]);

    // Session timer
    const sessionStartRef = useRef(Date.now());
    const [sessionElapsed, setSessionElapsed] = useState(0);

    // Update elapsed time when review screen shows
    useEffect(() => {
        if (gameComplete) {
            setSessionElapsed(Math.round((Date.now() - sessionStartRef.current) / 1000));
        }
    }, [gameComplete]);

    // Gap 2 Fix: Auto-save rich session data when game completes
    const sessionSavedRef = useRef(false);
    useEffect(() => {
        if (!gameComplete || sessionSavedRef.current) return;
        sessionSavedRef.current = true;

        // Use extracted saveSession utility
        saveSession({
            gameId,
            gameName,
            gtowScore,
            totalEVLoss,
            totalQuestions,
            sessionMistakes,
            correctCount,
            bestStreak,
            levelPassed,
            currentLevel,
            handHistory,
            avgEVLossPerHand,
            avgEVLossPerMistake,
            avgFrequencyDiff,
            trainerConfig,
            speedBonusDiamonds,
        });
    }, [gameComplete, gameId, gameName, gtowScore, totalEVLoss, totalQuestions, sessionMistakes, correctCount, bestStreak, levelPassed, currentLevel, handHistory, avgEVLossPerHand, avgEVLossPerMistake, avgFrequencyDiff, trainerConfig, speedBonusDiamonds]);

    // Wrapped nextQuestion with transition guard
    const handleNextQuestion = useCallback(() => {
        if (isTransitioning) return;
        setIsTransitioning(true);
        // Small delay for visual breathing room
        setTimeout(() => {
            nextQuestion();
            setIsTransitioning(false);
        }, 350);
    }, [nextQuestion, isTransitioning]);

    // ═══ QW-2 / T2-2: KEYBOARD SHORTCUTS ═══
    useEffect(() => {
        const handler = (e) => {
            if (showFeedback && e.key === ' ') {
                e.preventDefault();
                handleNextQuestion();
                return;
            }
            if (!showFeedback && currentQuestion?.options) {
                const idx = parseInt(e.key) - 1;
                if (idx >= 0 && idx < currentQuestion.options.length) {
                    e.preventDefault();
                    const opt = currentQuestion.options[idx];
                    submitAnswer(opt.id || opt);
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showFeedback, currentQuestion, submitAnswer, handleNextQuestion]);

    // F5: Mixed strategy adherence tracking
    const mixedStrategyScore = useMemo(() => {
        if (!handHistory || handHistory.length < 5) return null;
        // Count how often player chose the most common action vs mixing
        const actionCounts = {};
        handHistory.forEach(h => {
            const action = h.handData?.action || 'unknown';
            actionCounts[action] = (actionCounts[action] || 0) + 1;
        });
        const totalHands = handHistory.length;
        const maxActionCount = Math.max(...Object.values(actionCounts));
        // Perfect mixing = evenly distributed. Overfocusing = one action dominates
        const diversityScore = Math.round((1 - (maxActionCount / totalHands)) * 100);
        return Math.min(100, Math.max(0, diversityScore));
    }, [handHistory]);

    // UI-2: Manual advance — no auto-timer. User clicks "Next Hand →" button
    // nextQuestion is passed down as onNextHand to UniversalDynamicTable

    // ═══ QW-1: Filter options by difficulty ═══
    const filteredOptions = useMemo(() => {
        if (!currentQuestion?.options) return [];
        const opts = currentQuestion.options;
        if (difficulty === 'beginner' && opts.length > 2) {
            // Keep correct answer + 1 wrong answer (the most common trap)
            const correct = opts.find(o => (o.id || o) === currentQuestion.correctAnswer);
            const wrong = opts.filter(o => (o.id || o) !== currentQuestion.correctAnswer);
            return [correct, wrong[0]].filter(Boolean);
        }
        return opts; // standard + expert show all
    }, [currentQuestion, difficulty]);

    // BUG-C FIX: Inject filteredOptions into question so GameUIRouter/UDT receives them
    const questionWithFilteredOptions = useMemo(() => {
        if (!currentQuestion) return null;
        if (filteredOptions === currentQuestion.options) return currentQuestion;
        return { ...currentQuestion, options: filteredOptions };
    }, [currentQuestion, filteredOptions]);

    // ═══════════════════════════════════════════════════════════════════════
    // ERROR STATE — Graceful fallback when API fails (auth, network, etc.)
    // ═══════════════════════════════════════════════════════════════════════
    if (error && !gameComplete && !currentQuestion) {
        const isAuthError = error.toLowerCase().includes('auth') || error.toLowerCase().includes('401');
        return (
            <div style={{
                minHeight: '100vh',
                background: '#121212',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
            }}>
                <div style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 16, padding: 40, maxWidth: 420, textAlign: 'center',
                }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>{isAuthError ? (
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                    ) : (
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    )}</div>
                    <h2 style={{ color: '#fff', fontSize: 20, margin: '0 0 12px', fontFamily: "'Orbitron', sans-serif" }}>
                        {isAuthError ? 'Sign In Required' : 'Connection Error'}
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
                        {isAuthError
                            ? 'You need to be signed in to access GTO training. Sign in to track your progress and compete on leaderboards.'
                            : error}
                    </p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                        {isAuthError && (
                            <button
                                onClick={() => window.location.href = '/auth/login'}
                                style={{
                                    padding: '12px 24px', borderRadius: 10, border: 'none',
                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14,
                                }}
                            >
                                Sign In
                            </button>
                        )}
                        <button
                            onClick={onExit}
                            style={{
                                padding: '12px 24px', borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
                                color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14,
                            }}
                        >
                            Back to Training
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST-SESSION REVIEW SCREEN — GTO Wizard-style completion
    // ═══════════════════════════════════════════════════════════════════════

    if (gameComplete) {
        const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
        const scoreColor = gtowScore >= 80 ? '#22c55e' : gtowScore >= 60 ? '#fbbf24' : '#ef4444';

        // Count classification distribution
        const classificationCounts = {};
        Object.values(MOVE_CLASSIFICATIONS).forEach(c => classificationCounts[c] = 0);
        handHistory.forEach(h => {
            if (h.classification) classificationCounts[h.classification]++;
        });

        return (
            <div style={styles.reviewContainer}>
                {levelPassed && typeof window !== 'undefined' && (
                    <Confetti
                        width={window.innerWidth}
                        height={window.innerHeight}
                        recycle={false}
                        numberOfPieces={400}
                        gravity={0.15}
                        style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999, pointerEvents: 'none' }}
                    />
                )}
                {/* ═══ PHASE 19: Achievement Toasts ═══ */}
                <AchievementToast
                    achievements={sessionAchievements}
                    onDismiss={() => setSessionAchievements([])}
                    userId={userId}
                />
                {/* REVIEW HEADER */}
                <div style={styles.reviewHeader}>
                    <button onClick={onExit} style={styles.reviewBackBtn}>← Back</button>
                    <div style={styles.reviewTitle}>Session Review</div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, fontFamily: "'Orbitron', monospace" }}>
                        {Math.floor(sessionElapsed / 60)}:{String(sessionElapsed % 60).padStart(2, '0')}
                    </div>
                </div>

                <div style={styles.reviewScrollArea}>
                    {/* F13: Daily Challenge Banner */}
                    <DailyChallengeBanner gtowScore={gtowScore} />

                    {/* GTOW SCORE — Hero display + Phase 255 Session Grade */}
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={styles.scoreHero}
                    >
                        <div style={{ ...styles.scoreHeroValue, color: scoreColor }}>
                            {gtowScore}%
                        </div>
                        <div style={styles.scoreHeroLabel}>GTOW SCORE</div>
                        {/* Phase 255: Session letter grade */}
                        {(() => {
                            try {
                                const grade = getSessionGrade();
                                if (grade && grade.grade !== '-') return (
                                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                                        <span style={{
                                            fontSize: 28, fontWeight: 900, color: grade.color,
                                            fontFamily: "'Orbitron', monospace",
                                            textShadow: `0 0 12px ${grade.color}44`,
                                        }}>{grade.grade}</span>
                                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{grade.label}</span>
                                    </div>
                                );
                            } catch (_) { /* non-critical */ }
                            return null;
                        })()}
                    </motion.div>

                    {/* SUMMARY STATS ROW */}
                    <div style={styles.summaryRow}>
                        <div style={styles.summaryItem}>
                            <div style={styles.summaryValue}>{totalQuestions}</div>
                            <div style={styles.summaryLabel}>Hands</div>
                        </div>
                        <div style={styles.summaryItem}>
                            <div style={{ ...styles.summaryValue, color: '#ef4444' }}>
                                -{totalEVLoss.toFixed(1)}
                            </div>
                            <div style={styles.summaryLabel}>EV Loss (BB)</div>
                        </div>
                        <div style={styles.summaryItem}>
                            <div style={{ ...styles.summaryValue, color: '#fbbf24' }}>
                                {sessionMistakes}
                            </div>
                            <div style={styles.summaryLabel}>Mistakes</div>
                        </div>
                        <div style={styles.summaryItem}>
                            <div style={styles.summaryValue}>{avgEVLossPerHand.toFixed(2)}</div>
                            <div style={styles.summaryLabel}>EV/Hand</div>
                        </div>
                    </div>

                    {/* TAB NAVIGATION */}
                    <div style={{
                        display: 'flex', gap: 0, marginBottom: 16, borderRadius: 8, overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                        {[{ id: 'overview', label: 'Overview' }, { id: 'hands', label: 'Hands' }, { id: 'analysis', label: 'Analysis' }].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setReviewTab(tab.id)}
                                style={{
                                    flex: 1, padding: '10px 0',
                                    background: reviewTab === tab.id
                                        ? 'rgba(0, 212, 255, 0.15)'
                                        : 'rgba(0,0,0,0.2)',
                                    color: reviewTab === tab.id ? '#00d4ff' : '#64748b',
                                    border: 'none', cursor: 'pointer',
                                    fontSize: 12, fontWeight: 700,
                                    letterSpacing: 0.5,
                                    borderBottom: reviewTab === tab.id ? '2px solid #00d4ff' : '2px solid transparent',
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* ═══ TAB: OVERVIEW ═══ */}
                    {reviewTab === 'overview' && (<>
                        {/* ═══ Phase 54: Session Performance Summary ═══ */}
                        <div style={{
                            marginBottom: 16, padding: '14px 16px',
                            background: 'rgba(0,0,0,0.3)', borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            {/* Key metrics row */}
                            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 12 }}>
                                {[
                                    { label: 'GTOW Score', value: gtowScore, color: gtowScore >= 80 ? '#22c55e' : gtowScore >= 60 ? '#fbbf24' : '#ef4444', suffix: '' },
                                    { label: 'Accuracy', value: Math.round(gtowAccuracy), color: gtowAccuracy >= 80 ? '#22c55e' : gtowAccuracy >= 60 ? '#fbbf24' : '#ef4444', suffix: '%' },
                                    { label: 'EV Loss', value: totalEVLoss?.toFixed(1) || '0.0', color: totalEVLoss > 5 ? '#ef4444' : totalEVLoss > 2 ? '#fbbf24' : '#22c55e', suffix: ' BB', prefix: '-' },
                                    { label: 'Best Streak', value: bestGTOWStreak || 0, color: '#00d4ff', suffix: '' },
                                ].map((stat, i) => (
                                    <div key={i} style={{ textAlign: 'center' }}>
                                        <div style={{
                                            fontSize: 20, fontWeight: 800, color: stat.color,
                                            fontFamily: "'Orbitron', 'Inter', monospace",
                                            lineHeight: 1.2,
                                        }}>
                                            {stat.prefix || ''}{stat.value}{stat.suffix}
                                        </div>
                                        <div style={{ fontSize: 8, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
                                            {stat.label}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Position accuracy breakdown */}
                            {positionAccuracy && Object.keys(positionAccuracy).length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                        By Position
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'].filter(p => positionAccuracy[p]).map(pos => {
                                            const data = positionAccuracy[pos];
                                            const accColor = data.accuracy >= 80 ? '#22c55e' : data.accuracy >= 60 ? '#fbbf24' : '#ef4444';
                                            const isWeakest = weakestPosition === pos;
                                            return (
                                                <div key={pos} style={{
                                                    flex: 1, minWidth: 45, textAlign: 'center',
                                                    padding: '4px 6px', borderRadius: 6,
                                                    background: isWeakest ? `${accColor}15` : 'rgba(255,255,255,0.03)',
                                                    border: `1px solid ${isWeakest ? accColor + '44' : 'rgba(255,255,255,0.06)'}`,
                                                }}>
                                                    <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', marginBottom: 2 }}>{pos}</div>
                                                    <div style={{ fontSize: 12, fontWeight: 800, color: accColor, fontFamily: "'Inter', monospace" }}>{data.accuracy}%</div>
                                                    <div style={{ fontSize: 7, color: '#475569' }}>{data.correct}/{data.total}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Street accuracy breakdown */}
                            {streetAccuracy && Object.keys(streetAccuracy).length > 0 && (
                                <div>
                                    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                        By Street
                                    </div>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {['preflop', 'flop', 'turn', 'river'].filter(s => streetAccuracy[s]).map(st => {
                                            const data = streetAccuracy[st];
                                            const streetColors = { preflop: '#a78bfa', flop: '#4ade80', turn: '#fb923c', river: '#f87171' };
                                            const accColor = data.accuracy >= 80 ? '#22c55e' : data.accuracy >= 60 ? '#fbbf24' : '#ef4444';
                                            return (
                                                <div key={st} style={{
                                                    flex: 1, textAlign: 'center',
                                                    padding: '4px 6px', borderRadius: 6,
                                                    background: 'rgba(255,255,255,0.03)',
                                                    border: '1px solid rgba(255,255,255,0.06)',
                                                }}>
                                                    <div style={{ fontSize: 8, fontWeight: 700, color: streetColors[st], marginBottom: 2, textTransform: 'capitalize' }}>{st}</div>
                                                    <div style={{ fontSize: 12, fontWeight: 800, color: accColor, fontFamily: "'Inter', monospace" }}>{data.accuracy}%</div>
                                                    <div style={{ fontSize: 7, color: '#475569' }}>{data.correct}/{data.total}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Phase 67: Leak-specific coaching tips */}
                            {(() => {
                                const tips = [];

                                // Leak-based tips from mistake patterns
                                if (mistakePatterns && mistakePatterns.length > 0) {
                                    const highLeaks = mistakePatterns.filter(p => p.severity === 'high');
                                    const medLeaks = mistakePatterns.filter(p => p.severity === 'medium' && p.count >= 3);
                                    highLeaks.forEach(leak => {
                                        if (leak.type === 'fold_too_much') tips.push({ priority: 1, text: 'You\'re folding too often. Practice defending wider — use pot odds to decide close calls.', color: '#ef4444' });
                                        else if (leak.type === 'call_too_much') tips.push({ priority: 1, text: 'Over-calling is costing you. Tighten up against aggression — not every pair is worth a call.', color: '#ef4444' });
                                        else if (leak.type === 'bet_too_small') tips.push({ priority: 2, text: 'Your bet sizes are too small. Use larger bets with strong hands to build pots and deny equity.', color: '#f97316' });
                                        else if (leak.type === 'bet_too_big') tips.push({ priority: 2, text: 'You\'re overbetting too often. Use smaller sizes with merged ranges on dry boards.', color: '#f97316' });
                                        else if (leak.type === 'missed_value') tips.push({ priority: 1, text: 'You\'re missing value bets. When you have a strong hand, bet for value — don\'t be afraid to build the pot.', color: '#ef4444' });
                                        else if (leak.type === 'bluff_too_much') tips.push({ priority: 1, text: 'Over-bluffing is a leak. Choose bluff candidates with blockers and backdoor equity, not random air.', color: '#ef4444' });
                                        else tips.push({ priority: 2, text: leak.tip || `Fix your ${leak.type.replace(/_/g, ' ')} leak (${leak.count} times this session).`, color: '#f97316' });
                                    });
                                    medLeaks.forEach(leak => {
                                        tips.push({ priority: 3, text: leak.tip || `Watch for ${leak.type.replace(/_/g, ' ')} patterns (${leak.count}x).`, color: '#fbbf24' });
                                    });
                                }

                                // Position-based tips
                                if (weakestPosition && positionAccuracy) {
                                    const weakAcc = positionAccuracy[weakestPosition];
                                    if (weakAcc !== undefined && weakAcc < 50) {
                                        tips.push({ priority: 2, text: `Your ${weakestPosition} play is weak (${Math.round(weakAcc)}% accuracy). Study ${weakestPosition} ranges and common spots from this seat.`, color: '#f97316' });
                                    }
                                }

                                // Street-based tips
                                if (streetAccuracy) {
                                    const streets = Object.entries(streetAccuracy).filter(([, acc]) => acc < 50);
                                    streets.forEach(([st, acc]) => {
                                        if (st === 'preflop') tips.push({ priority: 2, text: `Preflop accuracy is low (${Math.round(acc)}%). Drill opening ranges and 3-bet/call frequencies.`, color: '#f97316' });
                                        else if (st === 'river') tips.push({ priority: 2, text: `River decisions need work (${Math.round(acc)}%). Focus on bluff-catching frequencies and value bet sizing.`, color: '#f97316' });
                                        else tips.push({ priority: 3, text: `${st.charAt(0).toUpperCase() + st.slice(1)} accuracy is ${Math.round(acc)}% — review board texture analysis for this street.`, color: '#fbbf24' });
                                    });
                                }

                                // Hand type tips
                                if (handTypePerformance && handTypePerformance.length > 0) {
                                    const worstType = handTypePerformance[0]; // sorted worst-first
                                    if (worstType.accuracy < 40 && worstType.total >= 3) {
                                        tips.push({ priority: 1, text: `Your ${worstType.type} play is a major leak (${worstType.accuracy}% accuracy, -${worstType.evLoss}bb). Focus practice on these hands.`, color: '#ef4444' });
                                    }
                                }

                                // EV-based tips
                                if (avgEVLossPerHand > 0.3) {
                                    tips.push({ priority: 1, text: `Average EV loss of ${avgEVLossPerHand.toFixed(2)}bb/hand is high. Focus on avoiding blunders — those cost the most.`, color: '#ef4444' });
                                } else if (avgEVLossPerHand > 0.1) {
                                    tips.push({ priority: 3, text: `Your ${avgEVLossPerHand.toFixed(2)}bb/hand EV loss is moderate. Refine marginal spots to push into the green zone.`, color: '#fbbf24' });
                                }

                                // Sort by priority and take top 3
                                const topTips = tips.sort((a, b) => a.priority - b.priority).slice(0, 3);

                                if (topTips.length === 0) return null;

                                return (
                                    <div style={{ marginTop: 8, marginBottom: 4 }}>
                                        <div style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                            Coaching Tips
                                        </div>
                                        {topTips.map((tip, i) => (
                                            <div key={i} style={{
                                                fontSize: 9, color: tip.color, lineHeight: 1.5,
                                                padding: '3px 6px', marginBottom: 2,
                                                background: `${tip.color}08`, borderRadius: 4,
                                                borderLeft: `2px solid ${tip.color}44`,
                                            }}>
                                                {tip.text}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* Phase 59: Hand type performance */}
                            {handTypePerformance && handTypePerformance.length > 0 && (
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                        By Hand Type
                                    </div>
                                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                        {handTypePerformance.slice(0, 6).map(ht => {
                                            const accColor = ht.accuracy >= 80 ? '#22c55e' : ht.accuracy >= 60 ? '#fbbf24' : '#ef4444';
                                            const isWorst = handTypePerformance[0] === ht && ht.accuracy < 60;
                                            return (
                                                <div key={ht.type} style={{
                                                    flex: '1 1 calc(33% - 4px)', minWidth: 80, textAlign: 'center',
                                                    padding: '3px 4px', borderRadius: 5,
                                                    background: isWorst ? `${accColor}12` : 'rgba(255,255,255,0.03)',
                                                    border: `1px solid ${isWorst ? accColor + '33' : 'rgba(255,255,255,0.06)'}`,
                                                }}>
                                                    <div style={{ fontSize: 7, fontWeight: 600, color: '#94a3b8', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ht.type}</div>
                                                    <div style={{ fontSize: 11, fontWeight: 800, color: accColor, fontFamily: "'Inter', monospace" }}>{ht.accuracy}%</div>
                                                    <div style={{ fontSize: 7, color: '#475569' }}>{ht.correct}/{ht.total} · -{ht.evLoss}bb</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ═══ PHASE 17: Smart Practice Recommendation ═══ */}
                        <SmartPracticeBanner
                            gameId={gameId}
                            onStartSmartPractice={(config) => {
                                // Reset to playing phase with smart practice targeting
                                sessionSavedRef.current = false;
                                if (config.suggestedLevel) {
                                    startNextLevel();
                                } else {
                                    retryLevel();
                                }
                            }}
                        />

                        {/* ═══ PHASE 17: AI Coaching Debrief ═══ */}
                        {(isLoadingCoaching || aiCoaching) && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{
                                    marginBottom: 16, padding: '14px 16px',
                                    background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(0,212,255,0.04) 100%)',
                                    border: '1px solid rgba(139,92,246,0.2)',
                                    borderRadius: 12,
                                }}
                            >
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 14 }}>🧠</span> AI Coach Debrief
                                </div>

                                {isLoadingCoaching && !aiCoaching && (
                                    <motion.div
                                        animate={{ opacity: [0.4, 1, 0.4] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                        style={{ color: '#64748b', fontSize: 11, textAlign: 'center', padding: '8px 0' }}
                                    >
                                        Analyzing your session...
                                    </motion.div>
                                )}

                                {aiCoaching && (
                                    <>
                                        {/* Headline */}
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
                                            {aiCoaching.headline || 'Session Complete'}
                                        </div>

                                        {/* Detailed feedback */}
                                        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6, marginBottom: 10 }}>
                                            {aiCoaching.detailedFeedback}
                                        </div>

                                        {/* Strengths + Areas to improve */}
                                        <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                                            {aiCoaching.strengths?.length > 0 && (
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Strengths</div>
                                                    {aiCoaching.strengths.map((s, i) => (
                                                        <div key={i} style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>• {s}</div>
                                                    ))}
                                                </div>
                                            )}
                                            {aiCoaching.areasToImprove?.length > 0 && (
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 9, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Focus Areas</div>
                                                    {aiCoaching.areasToImprove.map((a, i) => (
                                                        <div key={i} style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>• {a}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Recommended drill */}
                                        {aiCoaching.recommendedDrill && (
                                            <div style={{
                                                padding: '8px 12px', borderRadius: 8,
                                                background: 'rgba(0,212,255,0.06)',
                                                border: '1px solid rgba(0,212,255,0.15)',
                                                marginBottom: 8,
                                            }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#00d4ff', marginBottom: 2 }}>
                                                    Recommended: {aiCoaching.recommendedDrill.name}
                                                </div>
                                                <div style={{ fontSize: 9, color: '#64748b' }}>
                                                    {aiCoaching.recommendedDrill.reason}
                                                </div>
                                            </div>
                                        )}

                                        {/* Motivational quote */}
                                        {aiCoaching.motivationalQuote && (
                                            <div style={{ fontSize: 10, color: '#475569', fontStyle: 'italic', textAlign: 'center', marginTop: 4 }}>
                                                {aiCoaching.motivationalQuote}
                                            </div>
                                        )}
                                    </>
                                )}
                            </motion.div>
                        )}

                        <div style={styles.classBreakdown}>
                            <div style={styles.sectionTitle}>Move Breakdown</div>
                            <div style={styles.classGrid}>
                                {Object.entries(CLASSIFICATION_CONFIG).map(([key, config]) => (
                                    <div key={key} style={styles.classItem}>
                                        <div style={{
                                            ...styles.classCount,
                                            color: config.color,
                                        }}>
                                            {classificationCounts[key] || 0}
                                            {totalQuestions > 0 && (
                                                <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.6, marginLeft: 2 }}>
                                                    ({Math.round(((classificationCounts[key] || 0) / totalQuestions) * 100)}%)
                                                </span>
                                            )}
                                        </div>
                                        <div style={{
                                            ...styles.classBadge,
                                            background: config.bgColor,
                                            borderColor: config.borderColor,
                                            color: config.color,
                                        }}>
                                            <ClassificationSVGIcon icon={config.icon} size={14} color={config.color} /> {config.label}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* F15: CLASSIFICATION DONUT CHART */}
                        <ClassificationDonut handHistory={handHistory} gtowScore={gtowScore} />

                        {/* Phase 40: MISTAKE PATTERN COACHING */}
                        {mistakePatterns && mistakePatterns.length > 0 && (
                            <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
                                <div style={{ fontSize: 12, fontWeight: 'bold', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                                    Leak Detection
                                </div>
                                {mistakePatterns.slice(0, 3).map((pattern, idx) => (
                                    <div key={idx} style={{
                                        marginBottom: idx < Math.min(mistakePatterns.length, 3) - 1 ? 10 : 0,
                                        padding: '8px 10px',
                                        background: pattern.severity === 'high' ? 'rgba(239,68,68,0.08)' : 'rgba(251,191,36,0.06)',
                                        borderRadius: 8,
                                        border: `1px solid ${pattern.severity === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.15)'}`,
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <span style={{ fontSize: 14 }}>{pattern.icon}</span>
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                                                textTransform: 'uppercase',
                                                color: pattern.severity === 'high' ? '#ef4444' : '#fbbf24',
                                            }}>
                                                {pattern.type.replace('_', ' ')} ({pattern.count}x)
                                            </span>
                                            {pattern.severity === 'high' && (
                                                <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(239,68,68,0.2)', color: '#f87171', fontWeight: 700 }}>
                                                    MAJOR LEAK
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5 }}>
                                            {pattern.tip}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* F14: ACCURACY BY POSITION CHART */}
                        <AccuracyByPositionChart handHistory={handHistory} />

                        {/* F4: EV LOSS GRAPH */}
                        <EVLossGraph handHistory={handHistory} />

                        {/* F5: MIXED STRATEGY ADHERENCE */}
                        {mixedStrategyScore !== null && (
                            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
                                <div style={{ fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                                    Action Diversity
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                        width: '100%', height: 6, background: '#1e293b',
                                        borderRadius: 3, overflow: 'hidden',
                                    }}>
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${mixedStrategyScore}%` }}
                                            transition={{ duration: 0.8, delay: 0.3 }}
                                            style={{
                                                height: '100%', borderRadius: 3,
                                                background: mixedStrategyScore >= 50
                                                    ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                                                    : mixedStrategyScore >= 30
                                                        ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                                                        : 'linear-gradient(90deg, #ef4444, #dc2626)',
                                            }}
                                        />
                                    </div>
                                    <span style={{
                                        fontSize: 13, fontWeight: 'bold', minWidth: 40,
                                        color: mixedStrategyScore >= 50 ? '#22c55e' : mixedStrategyScore >= 30 ? '#fbbf24' : '#ef4444',
                                    }}>
                                        {mixedStrategyScore}%
                                    </span>
                                </div>
                                <div style={{ fontSize: 9, color: '#64748b', marginTop: 4 }}>
                                    {mixedStrategyScore >= 60 ? 'Great mixing — GTO-balanced!' : mixedStrategyScore >= 35 ? 'Moderate — try diversifying your actions' : 'Too predictable — mix in more actions'}
                                </div>
                            </div>
                        )}

                        {/* Phase 24: Mistakes-Only Filter + Retrain */}
                        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setMistakesFilterActive(prev => !prev)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    color: '#ef4444',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    letterSpacing: 0.3,
                                }}
                            >
                                Mistakes Only ({sessionMistakes})
                            </motion.button>

                            {sessionMistakes > 0 && (
                                <motion.button
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => {
                                        // Restart with just the mistake hands
                                        retrainMistakes();
                                    }}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: 8,
                                        border: '1px solid rgba(251, 146, 60, 0.3)',
                                        background: 'rgba(251, 146, 60, 0.1)',
                                        color: '#fb923c',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        letterSpacing: 0.3,
                                    }}
                                >
                                    ↻ Retrain Mistakes
                                </motion.button>
                            )}

                            {/* ═══ PHASE 15+18: Spaced Repetition Review Button ═══ */}
                            {reviewDueCount > 0 && (
                                <motion.button
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => {
                                        // Restart level to practice — the spaced repetition system
                                        // tracks which spots need review, and future sessions will
                                        // surface similar spot types via smart practice targeting
                                        sessionSavedRef.current = false;
                                        retryLevel();
                                    }}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: 8,
                                        border: '1px solid rgba(139, 92, 246, 0.3)',
                                        background: 'rgba(139, 92, 246, 0.1)',
                                        color: '#a78bfa',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        letterSpacing: 0.3,
                                    }}
                                >
                                    ↻ Review Weak Spots ({reviewDueCount})
                                </motion.button>
                            )}
                        </div>

                        {/* Phase 24: Per-Street EV Loss Breakdown */}
                        {handHistory.length > 0 && (() => {
                            const streetEV = { flop: 0, turn: 0, river: 0, preflop: 0 };
                            handHistory.forEach(h => {
                                const s = h.handData?.street || 'flop';
                                streetEV[s] = (streetEV[s] || 0) + (h.evLoss || 0);
                            });
                            const maxEV = Math.max(0.01, ...Object.values(streetEV));
                            const streetColors = {
                                preflop: '#8b5cf6', flop: '#22c55e', turn: '#fbbf24', river: '#ef4444'
                            };

                            return (
                                <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
                                    <div style={{ fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                        EV Loss by Street
                                    </div>
                                    {['preflop', 'flop', 'turn', 'river'].map(s => (
                                        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <span style={{ width: 55, fontSize: 10, fontWeight: 600, color: streetColors[s], textTransform: 'uppercase' }}>
                                                {s}
                                            </span>
                                            <div style={{ flex: 1, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${(streetEV[s] / maxEV) * 100}%` }}
                                                    transition={{ duration: 0.6, delay: 0.2 }}
                                                    style={{ height: '100%', background: streetColors[s], borderRadius: 3 }}
                                                />
                                            </div>
                                            <span style={{ width: 45, fontSize: 10, fontWeight: 'bold', color: streetEV[s] > 0 ? '#ef4444' : '#22c55e', textAlign: 'right' }}>
                                                -{streetEV[s].toFixed(1)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}

                        {/* HAND HISTORY — Enhanced Replay Viewer */}

                        {/* WEAKNESS HEATMAP — Position x Street */}
                        <WeaknessHeatmap handHistory={handHistory} />

                        {/* ACCURACY OVER TIME chart */}
                        <AccuracyOverTimeChart handHistory={handHistory} />

                        {/* WEAKEST SPOT CALLOUT */}
                        {handHistory.length >= 5 && (() => {
                            const spotStats = {};
                            handHistory.forEach(h => {
                                const pos = h.handData?.heroPosition || 'UNK';
                                const st = h.handData?.street || 'flop';
                                const key = `${pos} on ${st}`;
                                if (!spotStats[key]) spotStats[key] = { evLoss: 0, mistakes: 0, total: 0 };
                                spotStats[key].total++;
                                spotStats[key].evLoss += (h.evLoss || 0);
                                if (h.classification && h.classification !== 'best' && h.classification !== 'correct') spotStats[key].mistakes++;
                            });
                            const worst = Object.entries(spotStats)
                                .filter(([, v]) => v.total >= 2)
                                .sort(([, a], [, b]) => b.evLoss - a.evLoss)[0];
                            if (!worst || worst[1].evLoss <= 0) return null;
                            return (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        marginBottom: 16, padding: '12px 16px',
                                        background: 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)',
                                        border: '1px solid rgba(239,68,68,0.2)',
                                        borderRadius: 10,
                                    }}
                                >
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', letterSpacing: 0.5, marginBottom: 4 }}>
                                        WEAKEST SPOT
                                    </div>
                                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                                        You leaked {worst[1].evLoss.toFixed(1)} BB on <span style={{ color: '#00d4ff' }}>{worst[0]}</span> decisions
                                    </div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                                        {worst[1].mistakes} mistake{worst[1].mistakes !== 1 ? 's' : ''} out of {worst[1].total} hand{worst[1].total !== 1 ? 's' : ''}
                                    </div>
                                </motion.div>
                            );
                        })()}

                        {/* Phase 2: Speed Bonus Summary */}
                        {speedBonusDiamonds > 0 && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{
                                    marginBottom: 16, padding: '10px 14px',
                                    background: 'rgba(251,191,36,0.06)',
                                    border: '1px solid rgba(251,191,36,0.2)',
                                    borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                }}
                            >
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>Speed Bonus Diamonds</span>
                                <span style={{ fontSize: 14, fontWeight: 800, color: '#fbbf24' }}>+{speedBonusDiamonds}</span>
                            </motion.div>
                        )}

                        {/* ═══ PHASE 19: Share Results (image card + feed) ═══ */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setShowShareCard(true)}
                                style={{
                                    flex: 2, padding: '10px 0',
                                    borderRadius: 10,
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    color: '#fff', fontSize: 13, fontWeight: 700,
                                    cursor: 'pointer', letterSpacing: 0.5,
                                }}
                            >
                                Share Results Card
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={async () => {
                                    try {
                                        const res = await fetch('/api/training/share', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                userId,
                                                shareType: 'session_complete',
                                                data: {
                                                    gameId, gameName, gtowScore,
                                                    totalEVLoss, totalQuestions,
                                                    sessionMistakes, correctCount,
                                                    bestStreak, speedBonusDiamonds,
                                                },
                                            }),
                                        });
                                        if (res.ok) {
                                            setShareStatus('success');
                                            setTimeout(() => setShareStatus(null), 3000);
                                        }
                                    } catch (e) {
                                        console.error('[Share] Error:', e);
                                        setShareStatus('error');
                                        setTimeout(() => setShareStatus(null), 3000);
                                    }
                                }}
                                style={{
                                    flex: 1, padding: '10px 0',
                                    borderRadius: 10, border: '1px solid rgba(0,212,255,0.25)',
                                    background: 'rgba(0,212,255,0.06)',
                                    color: '#00d4ff', fontSize: 12, fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                {shareStatus === 'success' ? '✓ Posted' : shareStatus === 'error' ? 'Failed' : 'Post to Feed'}
                            </motion.button>
                        </div>

                        {/* ═══ PHASE 21: Ghost Replay — Review hands with GTO overlay ═══ */}
                        {handHistory.length > 0 && (
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setShowGhostReplay(true)}
                                style={{
                                    width: '100%', padding: '10px 0', marginBottom: 12,
                                    borderRadius: 10,
                                    border: '1px solid rgba(168, 85, 247, 0.25)',
                                    background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(139,92,246,0.04))',
                                    color: '#a78bfa', fontSize: 12, fontWeight: 700,
                                    cursor: 'pointer', letterSpacing: 0.5,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                }}
                            >
                                <span style={{ fontSize: 14 }}>👻</span> Ghost Replay — Review with GTO Line
                            </motion.button>
                        )}

                    </>)}

                    {/* ═══ TAB: HANDS ═══ */}
                    {reviewTab === 'hands' && (<>
                        <div id="hand-replay-section">
                            <HandReplayViewer handHistory={
                                mistakesFilterActive
                                    ? handHistory.filter(h => h.classification && h.classification !== 'best' && h.classification !== 'correct')
                                    : handHistory
                            } />
                        </div>
                    </>)}

                    {/* ═══ TAB: ANALYSIS ═══ */}
                    {reviewTab === 'analysis' && (<>

                        {/* ═══ PHASE 254: Leak Report + Phase 258: Drill Prescription ═══ */}
                        {(() => {
                            try {
                                const report = generateLeakReport();
                                if (!report || !report.leaks || report.leaks.length === 0) return null;
                                const severityColors = { critical: '#ef4444', high: '#f97316', medium: '#fbbf24', low: '#94a3b8' };
                                return (
                                    <div style={{
                                        marginBottom: 16, padding: '14px 16px',
                                        background: 'linear-gradient(180deg, rgba(239,68,68,0.06) 0%, rgba(0,0,0,0.3) 100%)',
                                        borderRadius: 12,
                                        border: '1px solid rgba(239,68,68,0.15)',
                                    }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                                            Leak Report
                                        </div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12, lineHeight: 1.5 }}>
                                            {report.summary}
                                        </div>
                                        {report.leaks.map((leak, i) => (
                                            <div key={i} style={{
                                                marginBottom: 10, padding: '10px 12px',
                                                background: 'rgba(0,0,0,0.3)', borderRadius: 8,
                                                borderLeft: `3px solid ${severityColors[leak.severity] || '#fbbf24'}`,
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                    <span style={{
                                                        fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                                                        background: `${severityColors[leak.severity]}22`,
                                                        color: severityColors[leak.severity],
                                                        textTransform: 'uppercase', letterSpacing: 0.5,
                                                    }}>{leak.severity}</span>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{leak.title}</span>
                                                </div>
                                                <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5, marginBottom: 4 }}>{leak.detail}</div>
                                                <div style={{
                                                    fontSize: 10, color: '#4ade80', lineHeight: 1.5,
                                                    padding: '4px 8px', background: 'rgba(34,197,94,0.06)', borderRadius: 6,
                                                    border: '1px solid rgba(34,197,94,0.1)',
                                                }}>
                                                    Fix: {leak.fix}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 258: Recommended Drills ═══ */}
                        {(() => {
                            try {
                                const drills = prescribeDrills();
                                if (!drills || drills.length === 0) return null;
                                return (
                                    <div style={{
                                        marginBottom: 16, padding: '14px 16px',
                                        background: 'rgba(0,0,0,0.3)', borderRadius: 12,
                                        border: '1px solid rgba(0,212,255,0.15)',
                                    }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#00d4ff', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                                            Recommended Drills
                                        </div>
                                        {drills.map((drill, i) => (
                                            <div key={i} style={{
                                                marginBottom: 8, padding: '8px 12px',
                                                background: 'rgba(0,212,255,0.04)', borderRadius: 8,
                                                border: '1px solid rgba(0,212,255,0.08)',
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>{drill.name}</span>
                                                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>{drill.duration}</span>
                                                </div>
                                                <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>{drill.description}</div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 257: Improvement Velocity ═══ */}
                        {(() => {
                            try {
                                const velocity = getImprovementVelocity();
                                if (!velocity || velocity.trend === 'INSUFFICIENT_DATA') return null;
                                const trendColors = {
                                    STRONG_IMPROVEMENT: '#22c55e',
                                    IMPROVING: '#4ade80',
                                    STABLE: '#fbbf24',
                                    SLIGHT_DECLINE: '#f97316',
                                    DECLINING: '#ef4444',
                                };
                                const trendColor = trendColors[velocity.trend] || '#94a3b8';
                                return (
                                    <div style={{
                                        marginBottom: 16, padding: '10px 14px',
                                        background: 'rgba(0,0,0,0.2)', borderRadius: 10,
                                        border: `1px solid ${trendColor}22`,
                                    }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: trendColor, marginBottom: 4 }}>
                                            Session Trend: {velocity.trend.replace(/_/g, ' ')}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
                                            {velocity.message}
                                        </div>
                                    </div>
                                );
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 267-269: Frequency Correction + Tilt + Pacing ═══ */}
                        {(() => {
                            try {
                                const freqCorr = getFrequencyCorrectionPrompt();
                                if (!freqCorr || !freqCorr.action) return null;
                                return (<div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(168,85,247,0.06)', borderRadius: 10, border: '1px solid rgba(168,85,247,0.15)' }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc', marginBottom: 4 }}>Frequency Correction</div>
                                    <div style={{ fontSize: 10, color: '#e2e8f0', lineHeight: 1.5 }}>{freqCorr.message || `Your ${freqCorr.action} frequency deviates ${freqCorr.deviation?.toFixed(1)}% from solver.`}</div>
                                </div>);
                            } catch (_) { return null; }
                        })()}
                        {(() => {
                            try {
                                const tiltAdv = getTiltRecoveryAdvice();
                                if (!tiltAdv || tiltAdv.severity === 'none') return null;
                                const tc = { low: '#fbbf24', medium: '#f97316', high: '#ef4444', critical: '#dc2626' };
                                const tiltColor = tc[tiltAdv.severity] || '#fbbf24';
                                return (<div style={{ marginBottom: 16, padding: '10px 14px', background: `${tiltColor}08`, borderRadius: 10, border: `1px solid ${tiltColor}22` }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: tiltColor, marginBottom: 4 }}>{tiltAdv.title || 'Tilt Recovery'}</div>
                                    <div style={{ fontSize: 10, color: '#e2e8f0', lineHeight: 1.5 }}>{tiltAdv.advice}</div>
                                </div>);
                            } catch (_) { return null; }
                        })()}
                        {(() => {
                            try {
                                const pacing = getSessionPacingAnalysis();
                                if (!pacing || !pacing.avgTimePerHand) return null;
                                const paceColor = pacing.recommendation === 'slow_down' ? '#f97316' : pacing.recommendation === 'speed_up' ? '#22c55e' : '#94a3b8';
                                return (<div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 10, border: `1px solid ${paceColor}22` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: paceColor }}>Session Pacing</span>
                                        <span style={{ fontSize: 10, fontFamily: "'Orbitron', monospace", color: '#e2e8f0' }}>{pacing.avgTimePerHand.toFixed(1)}s / hand</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>{pacing.message || `${pacing.fastHands || 0} fast, ${pacing.slowHands || 0} slow decisions`}</div>
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 275: Concept Mastery Report ═══ */}
                        {(() => {
                            try {
                                const mastery = getConceptMasteryReport();
                                if (!mastery || mastery.concepts.length === 0) return null;
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(59,130,246,0.15)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Concept Mastery ({mastery.overallMastery}%)</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                        {mastery.concepts.slice(0, 8).map((c, i) => (
                                            <span key={i} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 6, background: c.mastered ? 'rgba(34,197,94,0.1)' : c.struggling ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)', color: c.mastered ? '#4ade80' : c.struggling ? '#ef4444' : '#94a3b8', border: `1px solid ${c.mastered ? 'rgba(34,197,94,0.2)' : c.struggling ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                                                {c.name}: {c.accuracy}%
                                            </span>
                                        ))}
                                    </div>
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 279: Hand Category Breakdown ═══ */}
                        {(() => {
                            try {
                                const breakdown = getHandCategoryBreakdown();
                                if (!breakdown || breakdown.categories.length === 0) return null;
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(251,191,36,0.15)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Performance by Hand Type</div>
                                    {breakdown.categories.map((cat, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i < breakdown.categories.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                            <span style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 600 }}>{cat.name}</span>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <span style={{ fontSize: 10, color: cat.accuracy >= 70 ? '#4ade80' : cat.accuracy >= 50 ? '#fbbf24' : '#ef4444', fontWeight: 700, fontFamily: "'Orbitron', monospace" }}>{cat.accuracy}%</span>
                                                <span style={{ fontSize: 9, color: '#64748b' }}>({cat.total} hands)</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 280: Session Comparison ═══ */}
                        {(() => {
                            try {
                                const comparison = getSessionComparison();
                                if (!comparison) return null;
                                const hasChanges = comparison.improvements.length > 0 || comparison.regressions.length > 0;
                                if (!hasChanges) return null;
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(0,212,255,0.15)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#00d4ff', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>vs Average Player</div>
                                    {comparison.improvements.map((imp, i) => (
                                        <div key={'imp-' + i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 10 }}>
                                            <span style={{ color: '#94a3b8' }}>{imp.metric}</span>
                                            <span style={{ color: '#4ade80', fontWeight: 700 }}>{imp.delta}</span>
                                        </div>
                                    ))}
                                    {comparison.regressions.map((reg, i) => (
                                        <div key={'reg-' + i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 10 }}>
                                            <span style={{ color: '#94a3b8' }}>{reg.metric}</span>
                                            <span style={{ color: '#ef4444', fontWeight: 700 }}>{reg.delta}</span>
                                        </div>
                                    ))}
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 290: AI Coaching Summary ═══ */}
                        {(() => {
                            try {
                                const coaching = generateCoachingSummary();
                                if (!coaching || !coaching.summary) return null;
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(168,85,247,0.06) 100%)', borderRadius: 12, border: '1px solid rgba(59,130,246,0.15)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>AI Coach</div>
                                    <div style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.6, marginBottom: coaching.tips?.length > 0 ? 8 : 0 }}>{coaching.summary}</div>
                                    {coaching.tips?.length > 0 && coaching.tips.map((tip, i) => (
                                        <div key={i} style={{ fontSize: 10, color: '#4ade80', padding: '3px 8px', marginTop: 4, background: 'rgba(34,197,94,0.06)', borderRadius: 6, border: '1px solid rgba(34,197,94,0.1)', lineHeight: 1.5 }}>{tip}</div>
                                    ))}
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 283: Mistake Clusters ═══ */}
                        {(() => {
                            try {
                                const clusters = getMistakeClusters();
                                if (!clusters || clusters.clusters.length === 0) return null;
                                const sevColors = { critical: '#ef4444', high: '#f97316', medium: '#fbbf24' };
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(239,68,68,0.15)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Mistake Patterns ({clusters.totalMistakes} total)</div>
                                    {clusters.clusters.slice(0, 5).map((c, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <span style={{ fontSize: 10, color: '#e2e8f0', flex: 1 }}>{c.description}</span>
                                            <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: `${sevColors[c.severity] || '#fbbf24'}15`, color: sevColors[c.severity] || '#fbbf24', fontWeight: 700, textTransform: 'uppercase' }}>{c.severity}</span>
                                        </div>
                                    ))}
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 285: Bluff-to-Value Ratio ═══ */}
                        {(() => {
                            try {
                                const bvr = getBluffToValueRatio();
                                if (!bvr) return null;
                                const bvrColor = bvr.assessment === 'balanced' ? '#4ade80' : bvr.assessment === 'over_bluffing' ? '#ef4444' : '#fbbf24';
                                return (<div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 10, border: `1px solid ${bvrColor}22` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: bvrColor }}>Bluff:Value Ratio</span>
                                        <span style={{ fontSize: 10, fontFamily: "'Orbitron', monospace", color: '#e2e8f0' }}>{bvr.userBluffPct}% bluffs (solver: {bvr.solverBluffPct}%)</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>{bvr.message}</div>
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 282: Running Action Frequencies ═══ */}
                        {(() => {
                            try {
                                const freqs = getRunningActionFrequencies();
                                if (!freqs || freqs.frequencies.length === 0) return null;
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(0,212,255,0.15)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#00d4ff', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Action Frequency vs Solver</div>
                                    {freqs.frequencies.map((f, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                                            <span style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 600, minWidth: 50 }}>{f.action}</span>
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                                                <span style={{ fontSize: 9, color: '#94a3b8' }}>You: {f.userFreq}%</span>
                                                <span style={{ fontSize: 9, color: '#64748b' }}>GTO: {f.solverFreq}%</span>
                                                <span style={{ fontSize: 9, fontWeight: 700, color: Math.abs(f.deviation) > 15 ? '#ef4444' : Math.abs(f.deviation) > 8 ? '#fbbf24' : '#4ade80' }}>({f.deviation > 0 ? '+' : ''}{f.deviation}%)</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 289: Position Leaderboard ═══ */}
                        {(() => {
                            try {
                                const posLB = getPositionLeaderboard();
                                if (!posLB || posLB.leaderboard.length === 0) return null;
                                const gradeColors = { A: '#22c55e', B: '#4ade80', C: '#fbbf24', D: '#ef4444' };
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(34,197,94,0.15)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Position Leaderboard</div>
                                    {posLB.leaderboard.map((p, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 12, fontWeight: 800, color: gradeColors[p.grade] || '#94a3b8', fontFamily: "'Orbitron', monospace", minWidth: 18 }}>{p.grade}</span>
                                                <span style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 600 }}>{p.position}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <span style={{ fontSize: 10, color: gradeColors[p.grade], fontWeight: 700, fontFamily: "'Orbitron', monospace" }}>{p.accuracy}%</span>
                                                <span style={{ fontSize: 9, color: '#64748b' }}>({p.total}h)</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 291: Streak Analysis ═══ */}
                        {(() => {
                            try {
                                const sa = getStreakAnalysis();
                                if (!sa) return null;
                                const tiltColor = sa.tiltResistance >= 70 ? '#22c55e' : sa.tiltResistance >= 50 ? '#fbbf24' : '#ef4444';
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: `1px solid ${tiltColor}22` }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: tiltColor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Streak &amp; Tilt Analysis</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Current Streak</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: sa.currentStreakType === 'win' ? '#22c55e' : '#ef4444', fontFamily: "'Orbitron', monospace" }}>{sa.currentStreak} {sa.currentStreakType === 'win' ? 'W' : 'L'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Best Win Streak</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', fontFamily: "'Orbitron', monospace" }}>{sa.longestWinStreak}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Tilt Resistance</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: tiltColor, fontFamily: "'Orbitron', monospace" }}>{sa.tiltResistance}%</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 }}>{sa.insight}</div>
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 292: Session Stamina ═══ */}
                        {(() => {
                            try {
                                const tp = getTimePressureAnalysis();
                                if (!tp) return null;
                                const staminaColors = { Excellent: '#22c55e', Good: '#4ade80', Fair: '#fbbf24', Poor: '#ef4444' };
                                const sColor = staminaColors[tp.staminaRating] || '#94a3b8';
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: `1px solid ${sColor}22` }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: sColor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Session Stamina</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 8 }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0', fontFamily: "'Orbitron', monospace" }}>{tp.earlyAccuracy}%</div>
                                            <div style={{ fontSize: 9, color: '#64748b' }}>Early</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0', fontFamily: "'Orbitron', monospace" }}>{tp.midAccuracy}%</div>
                                            <div style={{ fontSize: 9, color: '#64748b' }}>Mid</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0', fontFamily: "'Orbitron', monospace" }}>{tp.lateAccuracy}%</div>
                                            <div style={{ fontSize: 9, color: '#64748b' }}>Late</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Stamina Rating</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: sColor }}>{tp.staminaRating}</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 }}>{tp.recommendation}</div>
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 294: Exploitative Adjustments ═══ */}
                        {(() => {
                            try {
                                const ea = getExploitativeAdjustments();
                                if (!ea || ea.isBalanced) return null;
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(251,191,36,0.15)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Exploitable Tendencies</div>
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, justifyContent: 'center' }}>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>F: <strong style={{ color: '#e2e8f0' }}>{ea.actionProfile.foldPct}%</strong></span>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>C: <strong style={{ color: '#e2e8f0' }}>{ea.actionProfile.callPct}%</strong></span>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>R: <strong style={{ color: '#e2e8f0' }}>{ea.actionProfile.raisePct}%</strong></span>
                                    </div>
                                    {ea.adjustments.slice(0, 3).map((adj, i) => (
                                        <div key={i} style={{ marginBottom: 6, padding: '6px 8px', background: adj.severity === 'critical' ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.08)', borderRadius: 6, border: `1px solid ${adj.severity === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.1)'}` }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: adj.severity === 'critical' ? '#ef4444' : '#fbbf24' }}>{adj.title}</div>
                                            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{adj.fix}</div>
                                        </div>
                                    ))}
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 296: Multi Game Type Stats ═══ */}
                        {(() => {
                            try {
                                const mgs = getMultiGameTypeStats();
                                if (!mgs || mgs.stats.length < 2) return null;
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(139,92,246,0.15)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Pot Type Performance</div>
                                    {mgs.stats.map((s, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <span style={{ fontSize: 10, color: '#e2e8f0' }}>{s.type}</span>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: s.accuracy >= 70 ? '#22c55e' : s.accuracy >= 50 ? '#fbbf24' : '#ef4444', fontFamily: "'Orbitron', monospace" }}>{s.accuracy}%</span>
                                                <span style={{ fontSize: 9, color: '#64748b' }}>({s.total}h)</span>
                                            </div>
                                        </div>
                                    ))}
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginTop: 6 }}>{mgs.recommendation}</div>
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 297: Bet Sizing Analysis ═══ */}
                        {(() => {
                            try {
                                const bsa = getBettingSizeAnalysis();
                                if (!bsa || bsa.analysis.length === 0) return null;
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(6,182,212,0.15)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Bet Sizing Accuracy</div>
                                    {bsa.analysis.map((a, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <span style={{ fontSize: 10, color: '#e2e8f0' }}>{a.size}</span>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: a.accuracy >= 70 ? '#22c55e' : a.accuracy >= 50 ? '#fbbf24' : '#ef4444', fontFamily: "'Orbitron', monospace" }}>{a.accuracy}% ({a.total})</span>
                                        </div>
                                    ))}
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginTop: 6 }}>{bsa.tip}</div>
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 300: Performance Trend ═══ */}
                        {(() => {
                            try {
                                const pt = getPerformanceTrendAnalysis();
                                if (!pt) return null;
                                const trendColors = { strongly_improving: '#22c55e', slightly_improving: '#4ade80', stable: '#06b6d4', slightly_declining: '#fbbf24', strongly_declining: '#ef4444' };
                                const tColor = trendColors[pt.trend] || '#94a3b8';
                                const trendLabels = { strongly_improving: 'Strongly Improving', slightly_improving: 'Improving', stable: 'Stable', slightly_declining: 'Declining', strongly_declining: 'Strongly Declining' };
                                return (<div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: `1px solid ${tColor}22` }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: tColor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Performance Trend</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Trend</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: tColor }}>{trendLabels[pt.trend] || pt.trend}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Consistency</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', fontFamily: "'Orbitron', monospace" }}>{pt.consistencyScore}%</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Peak</span>
                                        <span style={{ fontSize: 10, color: '#22c55e', fontFamily: "'Orbitron', monospace" }}>{pt.peakAccuracy}% ({pt.peakAt})</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Trough</span>
                                        <span style={{ fontSize: 10, color: '#ef4444', fontFamily: "'Orbitron', monospace" }}>{pt.troughAccuracy}% ({pt.troughAt})</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 }}>{pt.insight}</div>
                                </div>);
                            } catch (_) { return null; }
                        })()}

                        {/* ═══ PHASE 20: EV by Street visualization ═══ */}
                        <EVGraph handHistory={handHistory} title="EV Loss by Street" />

                        {/* ═══ PHASE 20: GTO Deviation Analysis ═══ */}
                        {(() => {
                            // Compute user's actual action frequencies vs solver's GTO frequencies
                            if (!handHistory || handHistory.length < 3) return null;
                            const actionCounts = {};
                            const gtoCounts = {};
                            let totalHands = 0;
                            handHistory.forEach(h => {
                                const hd = h.handData || h;
                                const userAction = (hd.action || '').toLowerCase();
                                const correct = (hd.correctAction || '').toLowerCase();
                                if (!userAction) return;
                                totalHands++;
                                // Normalize action names
                                const normalizeAction = (a) => {
                                    if (a.includes('fold')) return 'Fold';
                                    if (a.includes('check')) return 'Check';
                                    if (a.includes('call')) return 'Call';
                                    if (a.includes('raise') || a.includes('3-bet') || a.includes('4-bet')) return 'Raise';
                                    if (a.includes('bet') || a.includes('pot') || a.includes('overbet')) return 'Bet';
                                    if (a.includes('all-in') || a.includes('push')) return 'All-In';
                                    return 'Other';
                                };
                                const norm = normalizeAction(userAction);
                                const normCorrect = normalizeAction(correct);
                                actionCounts[norm] = (actionCounts[norm] || 0) + 1;
                                gtoCounts[normCorrect] = (gtoCounts[normCorrect] || 0) + 1;
                            });
                            if (totalHands < 3) return null;
                            // Get top actions
                            const actions = [...new Set([...Object.keys(actionCounts), ...Object.keys(gtoCounts)])].filter(a => a !== 'Other');
                            return actions.length > 0 ? (
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                        GTO Deviation Analysis
                                    </div>
                                    {actions.map(action => (
                                        <GTODeviationHeatmap
                                            key={action}
                                            label={`${action} Frequency`}
                                            actualPct={(actionCounts[action] || 0) / totalHands * 100}
                                            gtoPct={(gtoCounts[action] || 0) / totalHands * 100}
                                            description={`You ${action.toLowerCase()} ${actionCounts[action] || 0}/${totalHands} vs GTO ${gtoCounts[action] || 0}/${totalHands}`}
                                        />
                                    ))}
                                </div>
                            ) : null;
                        })()}

                        {/* POSITION STATS -- Per-position breakdown */}
                        <PositionStatsPanel handHistory={handHistory} />

                        {/* LIFETIME STATS -- Aggregated metrics */}
                        <LifetimeStatsCard
                            totalHands={totalQuestions}
                            totalSessions={1}
                            avgGTOWScore={gtowScore}
                            bestGTOWScore={gtowScore}
                            totalEVLoss={totalEVLoss}
                            avgEVPerHand={avgEVLossPerHand}
                            longestStreak={bestStreak}
                            totalMistakes={sessionMistakes}
                            gamesCompleted={1}
                        />

                        {/* ═══ PHASE 21: Study Streak Map — Training consistency ═══ */}
                        {userId && (
                            <StudyStreakMapAuto userId={userId} gameId={gameId} />
                        )}

                        {/* ═══ PHASE 16: Cross-Session Analytics ═══ */}
                        <PerformanceTrends gameId={gameId} userId={userId} days={30} compact={false} />

                        {crossSessionAnalytics?.streetAccuracy && (
                            <StreetAccuracyPanel streetAccuracy={crossSessionAnalytics.streetAccuracy} />
                        )}

                        {crossSessionAnalytics?.actionAccuracy && (
                            <ActionAccuracyPanel actionAccuracy={crossSessionAnalytics.actionAccuracy} />
                        )}

                        {crossSessionAnalytics?.mistakePatterns?.length > 0 && (
                            <MistakePatternPanel mistakePatterns={crossSessionAnalytics.mistakePatterns} />
                        )}

                        {/* SESSION HISTORY -- Past sessions */}
                        <SessionHistoryList gameId={gameId} userId={userId} limit={5} />

                        {/* ═══ PHASE 18: Leaderboard ═══ */}
                        <LeaderboardPanel userId={userId} gameId={gameId} />
                    </>)}

                    {/* ACTION BUTTONS */}
                    <div style={styles.reviewActions}>
                        {levelPassed && currentLevel < TRAINING_CONFIG.totalLevels && (
                            <button onClick={() => { sessionSavedRef.current = false; startNextLevel(); }} style={styles.nextLevelButton}>
                                Next Level ({currentLevel + 1})
                            </button>
                        )}
                        {!levelPassed && (
                            <button onClick={() => { sessionSavedRef.current = false; retryLevel(); }} style={styles.retryButton}>
                                Retry Level {currentLevel}
                            </button>
                        )}
                        <button onClick={() => {
                            onComplete?.({
                                gameId,
                                accuracy,
                                questionsAnswered: totalQuestions,
                                questionsCorrect: correctCount,
                                bestStreak,
                                levelPassed,
                                level: currentLevel,
                                gtowScore,
                                totalEVLoss,
                                sessionMistakes,
                            });
                            onExit?.();
                        }} style={styles.exitButton}>
                            Back to Training
                        </button>
                    </div>

                    {/* MASTERY PROGRESS */}
                    <div style={styles.masteryContainer}>
                        <div style={styles.masteryLabel}>
                            Overall Mastery: {currentLevel * 10}%
                        </div>
                        <div style={styles.masteryBar}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${currentLevel * 10}%` }}
                                transition={{ duration: 1, delay: 0.5 }}
                                style={styles.masteryFill}
                            />
                        </div>
                    </div>

                    {/* F7: Drill Filters */}
                    <AnimatePresence>
                        <DrillFilters
                            show={showDrillFilters}
                            onClose={() => setShowDrillFilters(false)}
                            onApply={(filters) => setDrillFilters(filters)}
                            difficulty={difficulty}
                            setDifficulty={setDifficulty}
                            timerMode={timerMode}
                            setTimerMode={setTimerMode}
                        />
                    </AnimatePresence>

                    {/* ═══ PHASE 21: Ghost Replay Modal ═══ */}
                    {showGhostReplay && (
                        <GhostReplayEngine
                            sessionName={gameName}
                            handHistory={handHistory}
                            onClose={() => setShowGhostReplay(false)}
                        />
                    )}

                    {/* ═══ PHASE 19: Share Card Modal ═══ */}
                    {showShareCard && (
                        <SessionShareCard
                            gameName={gameName}
                            level={currentLevel}
                            gtowScore={gtowScore}
                            totalQuestions={totalQuestions}
                            correctCount={correctCount}
                            totalEVLoss={totalEVLoss}
                            bestStreak={bestStreak}
                            classificationCounts={classificationCounts}
                            sessionMistakes={sessionMistakes}
                            onClose={() => setShowShareCard(false)}
                        />
                    )}
                </div>
            </div >
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // IN-GAME UI — Full screen with GTO Wizard-style GameUIRouter
    // ═══════════════════════════════════════════════════════════════════════

    const hasFullScreenUI = FULL_SCREEN_UI_GAMES.includes(gameId);

    if (hasFullScreenUI) {
        return (
            <div style={styles.fullScreenContainer}>
                {/* Trainer Config Modal */}
                <TrainerConfigModal
                    isOpen={showConfigModal}
                    onClose={() => setShowConfigModal(false)}
                    onStart={handleConfigStart}
                    currentGameId={gameId}
                />

                <AnimatePresence mode="wait">
                    {/* ═══ PHASE 18: ENHANCED PRE-SESSION LOBBY ═══ */}
                    {gamePhase === 'splash' && (
                        <motion.div
                            key="splash"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            transition={{ duration: 0.4 }}
                            style={styles.splashScreen}
                        >
                            <div style={{ width: '100%', maxWidth: 420, padding: '0 16px', overflowY: 'auto', maxHeight: '100vh', paddingBottom: 40 }}>
                                {/* Game Title */}
                                <motion.div
                                    initial={{ y: -20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.1 }}
                                    style={{ textAlign: 'center', marginBottom: 20, marginTop: 20 }}
                                >
                                    <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', letterSpacing: -0.5, fontFamily: "'Inter', -apple-system, sans-serif" }}>
                                        {gameName || 'GTO Training'}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginTop: 4 }}>
                                        Level {currentLevel} of {TRAINING_CONFIG.totalLevels} • {totalQuestions || 25} Questions
                                    </div>
                                </motion.div>

                                {/* Session Goal Card */}
                                <motion.div
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    style={{
                                        padding: '12px 16px', borderRadius: 12, marginBottom: 12,
                                        background: 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(139,92,246,0.06) 100%)',
                                        border: '1px solid rgba(0,212,255,0.15)',
                                    }}
                                >
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#00d4ff', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                                        Session Goal
                                    </div>
                                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                                        Score ≥70% to advance to Level {Math.min(currentLevel + 1, TRAINING_CONFIG.totalLevels)}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                        Answer {Math.ceil((totalQuestions || 25) * 0.7)} of {totalQuestions || 25} questions correctly
                                    </div>
                                </motion.div>

                                {/* Previous Performance (from cross-session analytics) */}
                                {crossSessionAnalytics?.milestones && (
                                    <motion.div
                                        initial={{ y: 10, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: 0.3 }}
                                        style={{
                                            padding: '12px 16px', borderRadius: 12, marginBottom: 12,
                                            background: 'rgba(0,0,0,0.2)',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                        }}
                                    >
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                            Your Performance (30 Days)
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: '#00d4ff', fontFamily: "'Orbitron', monospace" }}>
                                                    {crossSessionAnalytics.milestones.last5Avg || crossSessionAnalytics.milestones.overallAccuracy || '—'}%
                                                </div>
                                                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>Avg Score</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: '#a78bfa', fontFamily: "'Orbitron', monospace" }}>
                                                    {crossSessionAnalytics.milestones.totalSessions || 0}
                                                </div>
                                                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>Sessions</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e', fontFamily: "'Orbitron', monospace" }}>
                                                    {crossSessionAnalytics.milestones.totalHands || 0}
                                                </div>
                                                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>Hands</div>
                                            </div>
                                        </div>
                                        {crossSessionAnalytics.milestones.trending && (
                                            <div style={{ fontSize: 10, color: crossSessionAnalytics.milestones.trending === 'up' ? '#22c55e' : crossSessionAnalytics.milestones.trending === 'down' ? '#ef4444' : '#64748b', textAlign: 'center', marginTop: 6, fontWeight: 600 }}>
                                                {crossSessionAnalytics.milestones.trending === 'up' ? '↑ Trending Up' : crossSessionAnalytics.milestones.trending === 'down' ? '↓ Trending Down' : '→ Steady'}
                                                {crossSessionAnalytics.milestones.trendDelta ? ` (${crossSessionAnalytics.milestones.trendDelta > 0 ? '+' : ''}${crossSessionAnalytics.milestones.trendDelta}pts)` : ''}
                                            </div>
                                        )}
                                    </motion.div>
                                )}

                                {/* Difficulty + Timer Selectors */}
                                <motion.div
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.35 }}
                                    style={{
                                        padding: '12px 16px', borderRadius: 12, marginBottom: 12,
                                        background: 'rgba(0,0,0,0.2)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                    }}
                                >
                                    {/* Difficulty */}
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                                            Difficulty
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {[
                                                { key: 'beginner', label: 'Beginner', color: '#22c55e' },
                                                { key: 'standard', label: 'Standard', color: '#3b82f6' },
                                                { key: 'expert', label: 'Expert', color: '#ef4444' },
                                            ].map(d => (
                                                <button
                                                    key={d.key}
                                                    onClick={() => setDifficulty(d.key)}
                                                    style={{
                                                        flex: 1, padding: '8px 0', borderRadius: 8,
                                                        border: `1px solid ${difficulty === d.key ? d.color + '60' : 'rgba(255,255,255,0.08)'}`,
                                                        background: difficulty === d.key ? d.color + '15' : 'transparent',
                                                        color: difficulty === d.key ? d.color : '#64748b',
                                                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                        transition: 'all 0.15s',
                                                    }}
                                                >
                                                    {d.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Timer */}
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                                            Timer
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {[
                                                { key: 'relaxed', label: 'Relaxed', desc: 'No timer', color: '#22c55e' },
                                                { key: 'standard', label: 'Standard', desc: '60s', color: '#fbbf24' },
                                                { key: 'blitz', label: 'Blitz', desc: '15s', color: '#ef4444' },
                                            ].map(t => (
                                                <button
                                                    key={t.key}
                                                    onClick={() => setTimerMode(t.key)}
                                                    style={{
                                                        flex: 1, padding: '8px 0', borderRadius: 8,
                                                        border: `1px solid ${timerMode === t.key ? t.color + '60' : 'rgba(255,255,255,0.08)'}`,
                                                        background: timerMode === t.key ? t.color + '15' : 'transparent',
                                                        color: timerMode === t.key ? t.color : '#64748b',
                                                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                        transition: 'all 0.15s',
                                                    }}
                                                >
                                                    {t.label}
                                                    <div style={{ fontSize: 8, fontWeight: 600, opacity: 0.7, marginTop: 1 }}>{t.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>

                                {/* Spaced Repetition Due */}
                                {reviewDueCount > 0 && (
                                    <motion.div
                                        initial={{ y: 10, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: 0.4 }}
                                        style={{
                                            padding: '10px 16px', borderRadius: 12, marginBottom: 12,
                                            background: 'rgba(139,92,246,0.08)',
                                            border: '1px solid rgba(139,92,246,0.2)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa' }}>
                                                {reviewDueCount} Weak Spot{reviewDueCount > 1 ? 's' : ''} Due for Review
                                            </div>
                                            <div style={{ fontSize: 9, color: '#64748b' }}>
                                                Reviewing now maximizes long-term retention
                                            </div>
                                        </div>
                                        <span style={{ fontSize: 20 }}>↻</span>
                                    </motion.div>
                                )}

                                {/* START BUTTON */}
                                <motion.div
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.45 }}
                                >
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={handleStartTraining}
                                        disabled={!splashReady}
                                        style={{
                                            width: '100%', padding: '16px 0', borderRadius: 12,
                                            border: 'none',
                                            background: splashReady
                                                ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                                                : 'rgba(100,116,139,0.2)',
                                            color: splashReady ? '#fff' : '#64748b',
                                            fontSize: 16, fontWeight: 800,
                                            cursor: splashReady ? 'pointer' : 'default',
                                            letterSpacing: 0.5,
                                            transition: 'all 0.2s',
                                            fontFamily: "'Inter', -apple-system, sans-serif",
                                        }}
                                    >
                                        {splashReady ? 'Start Training →' : 'Loading Solver Data...'}
                                    </motion.button>
                                </motion.div>

                                {/* Back button */}
                                <motion.button
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    onClick={onExit}
                                    style={{
                                        display: 'block', margin: '12px auto 0', padding: '8px 20px',
                                        background: 'none', border: 'none',
                                        color: '#475569', fontSize: 12, fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    ← Back to Training
                                </motion.button>
                            </div>
                        </motion.div>
                    )}

                    {/* ═══ GAMEPLAY ═══ */}
                    {gamePhase === 'playing' && (
                        <motion.div
                            key="playing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            style={{ width: '100%', height: '100%', position: 'relative' }}
                        >
                            {error ? (
                                <div style={styles.errorState}>
                                    <p style={{ color: '#ef4444', fontSize: 18 }}>⚠️ {error}</p>
                                    <button onClick={() => window.location.reload()} style={styles.retryButton}>
                                        Retry
                                    </button>
                                </div>
                            ) : currentQuestion ? (
                                <GameUIRouter
                                    gameId={gameId}
                                    gameName={gameName}
                                    streak={streak}
                                    question={questionWithFilteredOptions}
                                    level={currentLevel}
                                    questionNumber={questionNumber}
                                    totalQuestions={totalQuestions}
                                    onAnswer={submitAnswer}
                                    showFeedback={showFeedback}
                                    feedbackResult={feedbackResult}
                                    explanation={explanation}
                                    structuredExplanation={structuredExplanation}
                                    // Phase 261-280: Deep coaching callbacks
                                    getTeachingPrinciple={getTeachingPrinciple}
                                    getPositionReminder={getPositionReminder}
                                    getTextureStrategyGuide={getTextureStrategyGuide}
                                    getSPRStrategyGuide={getSPRStrategyGuide}
                                    getVillainRangeNarration={getVillainRangeNarration}
                                    getMultiStreetPlanningGuide={getMultiStreetPlanningGuide}
                                    getFrequencyCorrectionPrompt={getFrequencyCorrectionPrompt}
                                    getTiltRecoveryAdvice={getTiltRecoveryAdvice}
                                    classifyHandStrength={classifyHandStrength}
                                    estimateEquityVsRange={estimateEquityVsRange}
                                    getActionEVComparison={getActionEVComparison}
                                    getSolverLineComparison={getSolverLineComparison}
                                    generateHints={generateHints}
                                    getRunoutImpactPreview={getRunoutImpactPreview}
                                    getRangeConstructionDrill={getRangeConstructionDrill}
                                    getHandReadingDrill={getHandReadingDrill}
                                    getExploitativeAdjustments={getExploitativeAdjustments}
                                    getVarianceSimulator={getVarianceSimulator}
                                    // GTOW scoring props
                                    moveClassification={moveClassification}
                                    evLoss={evLoss}
                                    gtoFrequencies={gtoFrequencies}
                                    gtowScore={gtowScore}
                                    totalSessionEVLoss={totalEVLoss}
                                    sessionMistakes={sessionMistakes}
                                    // Phase 37: Enhanced session metrics
                                    classificationCounts={gtowClassificationCounts}
                                    gtowCurrentStreak={gtowCurrentStreak}
                                    bestGTOWStreak={bestGTOWStreak}
                                    lastClassification={lastClassification}
                                    gtowAccuracy={gtowAccuracy}
                                    positionAccuracy={positionAccuracy}
                                    streetAccuracy={streetAccuracy}
                                    weakestPosition={weakestPosition}
                                    // Phase 49: Live leak detection
                                    mistakePatterns={mistakePatterns}
                                    onNextHand={handleNextQuestion}
                                    isMultiStreetActive={isMultiStreetActive}
                                    currentStreet={currentStreet}
                                    handSummary={handSummary}
                                    onExit={onExit}
                                    difficultyLevel={computedDifficultyLevel}
                                    // Settings gear — relocated to scenario description area
                                    onConfigClick={() => setShowConfigModal(true)}
                                    trainerConfig={{
                                        ...trainerConfig,
                                        // Merge GodModeArena timer settings if no custom config timer
                                        timerEnabled: trainerConfig?.timerEnabled || (timerMode !== 'relaxed'),
                                        timerSeconds: trainerConfig?.timerSeconds || (TIMER_DURATIONS[timerMode] || 60),
                                    }}
                                />
                            ) : null}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    // Default layout with header/footer for games without custom UIs
    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <button onClick={onExit} style={styles.backButton}>← Exit</button>
                <div style={styles.gameTitle}>{gameName || 'Training'}</div>
                <div style={styles.stats}>
                    <span style={{ color: scoreColor, fontWeight: 'bold' }}>
                        {gtowScore}% Score
                    </span>
                </div>
            </div>

            <div style={styles.questionContainer}>
                {error ? (
                    <div style={styles.errorState}>
                        <p style={{ color: '#ef4444', fontSize: 18 }}>{error}</p>
                        <button onClick={() => window.location.reload()} style={styles.retryButton}>
                            Retry
                        </button>
                    </div>
                ) : currentQuestion ? (
                    <GameUIRouter
                        gameId={gameId}
                        gameName={gameName}
                        streak={streak}
                        question={questionWithFilteredOptions}
                        level={currentLevel}
                        questionNumber={questionNumber}
                        totalQuestions={totalQuestions}
                        onAnswer={submitAnswer}
                        showFeedback={showFeedback}
                        feedbackResult={feedbackResult}
                        explanation={explanation}
                        moveClassification={moveClassification}
                        evLoss={evLoss}
                        gtoFrequencies={gtoFrequencies}
                        gtowScore={gtowScore}
                        totalSessionEVLoss={totalEVLoss}
                        sessionMistakes={sessionMistakes}
                        // Phase 37: Enhanced session metrics
                        classificationCounts={gtowClassificationCounts}
                        gtowCurrentStreak={gtowCurrentStreak}
                        bestGTOWStreak={bestGTOWStreak}
                        lastClassification={lastClassification}
                        gtowAccuracy={gtowAccuracy}
                        positionAccuracy={positionAccuracy}
                        streetAccuracy={streetAccuracy}
                        weakestPosition={weakestPosition}
                        // Phase 49: Live leak detection
                        mistakePatterns={mistakePatterns}
                        onNextHand={nextQuestion}
                        isMultiStreetActive={isMultiStreetActive}
                        currentStreet={currentStreet}
                        handSummary={handSummary}
                        onExit={onExit}
                        difficultyLevel={computedDifficultyLevel}
                        trainerConfig={{
                            ...trainerConfig,
                            timerEnabled: trainerConfig?.timerEnabled || (timerMode !== 'relaxed'),
                            timerSeconds: trainerConfig?.timerSeconds || (TIMER_DURATIONS[timerMode] || 60),
                        }}
                    />
                ) : null}
            </div>

            <div style={styles.footer}>
                <div style={styles.footerStat}>
                    <span style={{ color: '#94a3b8' }}>EV Loss:</span>
                    <span style={{ color: '#ef4444', fontWeight: 'bold', marginLeft: 6 }}>
                        -{totalEVLoss.toFixed(1)} BB
                    </span>
                </div>
                <div style={styles.footerStat}>
                    <span style={{ color: '#94a3b8' }}>Mistakes:</span>
                    <span style={{ color: '#fbbf24', fontWeight: 'bold', marginLeft: 6 }}>
                        {sessionMistakes}
                    </span>
                </div>
                <div style={styles.footerStat}>
                    <span style={{ color: '#94a3b8' }}>Streak:</span>
                    <span style={{ color: '#f97316', fontWeight: 'bold', marginLeft: 6 }}>
                        {streak}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const scoreColor = '#22c55e'; // Default, overridden dynamically in render

const styles = {
    fullScreenContainer: {
        width: '100%',
        maxWidth: 900,
        height: '100vh',
        background: '#121212',
        overflow: 'hidden',
        marginLeft: 'auto',
        marginRight: 'auto',
        position: 'relative',
    },

    // ── PHASE 21: SPLASH SCREEN STYLES
    splashScreen: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#121212',
        zIndex: 999,
    },
    splashContent: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
    },
    splashIcon: {
        fontSize: 64,
        filter: 'none',
    },
    splashTitle: {
        fontSize: 28,
        fontWeight: 800,
        color: '#fff',
        textAlign: 'center',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        textShadow: 'none',
    },
    splashSubtitle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#00d4ff',
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    splashLoader: {
        marginTop: 12,
        fontSize: 12,
        color: '#64748b',
        letterSpacing: 1,
    },

    container: {
        width: '100%',
        maxWidth: 900,
        height: '100vh',
        background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', -apple-system, sans-serif",
        overflow: 'hidden',
        marginLeft: 'auto',
        marginRight: 'auto',
    },

    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        background: 'rgba(0,0,0,0.4)',
        borderBottom: '1px solid #1e293b',
    },

    backButton: {
        background: 'linear-gradient(135deg, #0891b2, #0e7490)',
        border: 'none',
        borderRadius: 8,
        padding: '8px 16px',
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        cursor: 'pointer',
    },

    gameTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#00d4ff',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },

    stats: {
        display: 'flex',
        fontSize: 14,
    },

    questionContainer: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        minHeight: 0,
    },

    errorState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },

    footer: {
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '12px 20px',
        background: 'rgba(0,0,0,0.4)',
        borderTop: '1px solid #1e293b',
    },

    footerStat: { fontSize: 13 },

    // ── POST-SESSION REVIEW STYLES
    reviewContainer: {
        width: '100%',
        height: '100vh',
        background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', sans-serif",
        color: '#e2e8f0',
    },

    reviewHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'rgba(0,0,0,0.5)',
        borderBottom: '1px solid #1e293b',
        flexShrink: 0,
    },

    reviewBackBtn: {
        background: 'none',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8,
        padding: '6px 14px',
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '600',
        cursor: 'pointer',
    },

    reviewTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#e2e8f0',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    reviewScrollArea: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
    },

    // Score hero
    scoreHero: {
        textAlign: 'center',
        padding: '24px 0 16px',
    },

    scoreHeroValue: {
        fontSize: 64,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        lineHeight: 1,
    },

    scoreHeroLabel: {
        fontSize: 12,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginTop: 4,
        fontWeight: '600',
    },

    // Summary row
    summaryRow: {
        display: 'flex',
        justifyContent: 'space-around',
        padding: '16px 0',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 16,
    },

    summaryItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
    },

    summaryValue: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#e2e8f0',
        fontFamily: "'Inter', sans-serif",
    },

    summaryLabel: {
        fontSize: 10,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    // Classification breakdown
    classBreakdown: {
        marginBottom: 20,
    },

    sectionTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 10,
    },

    classGrid: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
    },

    classItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
    },

    classCount: {
        fontSize: 18,
        fontWeight: 'bold',
        minWidth: 20,
        textAlign: 'right',
    },

    classBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '3px 8px',
        borderRadius: 10,
        border: '1px solid',
        fontSize: 10,
        fontWeight: 'bold',
    },

    // Hand history
    historySection: {
        marginBottom: 20,
    },

    historyList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 10,
        overflow: 'hidden',
        maxHeight: 300,
        overflowY: 'auto',
    },

    // Action buttons
    reviewActions: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginBottom: 20,
    },

    nextLevelButton: {
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        cursor: 'pointer',
    },

    retryButton: {
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #f97316, #ea580c)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        cursor: 'pointer',
    },

    exitButton: {
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        cursor: 'pointer',
    },

    // Mastery
    masteryContainer: { marginTop: 8, marginBottom: 32 },
    masteryLabel: { color: '#94a3b8', fontSize: 14, marginBottom: 8 },
    masteryBar: {
        width: '100%',
        height: 8,
        background: '#1e293b',
        borderRadius: 4,
        overflow: 'hidden',
    },
    masteryFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
    },
};

function GodModeArena(props) {
    const { gameId, onExit } = props;
    if (gameId === 'cash-001') return <PreflopRangeTrainer onExit={onExit} />;
    if (gameId === 'adv-011') return <SPRTrainer onExit={onExit} />;
    if (gameId === 'quiz-gauntlet') return <QuizGauntlet onExit={onExit} />;
    return <GodModeArenaInner {...props} />;
}

export default memo(GodModeArena);
