/**
 * GOD MODE ARENA — GTO Wizard-Style Training UI
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Full-immersion training with:
 * - GTO Wizard-style action buttons + 5-tier feedback
 * - GTOW Score tracking + EV Loss metrics
 * - Post-session review with hand history
 * - 20 questions per level, 12 levels total (Foundations → Boss Mode)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { shareResult } from '../../utils/shareCard';
import GameUIRouter from './GameUIRouter';
import TrainerConfigModal from './TrainerConfigModal';
import VerifiedToolGateway from './VerifiedToolGateway';
import SessionHistoryList from './SessionHistoryList';
// ●●● PHASE 16: Performance Analytics Components ●●●
import { useTrainingAnalytics } from './PerformanceTrends';
// ●●● PHASE 17: Smart Practice + AI Coaching ●●●
import { getSessionToken } from '../../lib/authUtils';
import {
  handFieldOf,
  heroPositionOf,
  streetOf,
  playerActionOf,
} from '../../lib/training/handHistoryEntry';
import {
  normalizeTrainingSessionConfig,
  withTrainingSessionDifficulty,
} from '../../lib/training/sessionConfigContract.mjs';
// ●●● PHASE 18: Leaderboard ●●●
import LeaderboardPanel from './LeaderboardPanel';
// ●●● PHASE 19: Share Card + Achievement Toasts ●●●
import SessionShareCard from './SessionShareCard';
// ●●● PHASE 20: Verified EV Graph ●●●
import EVGraph from './EVGraph';
// ●●● PHASE 21: Study Streak Map + Ghost Replay ●●●
import { StudyStreakMapAuto } from './StudyStreakMap';
// ●●● Phase 3 Engines: Real-time scoring + diamond rewards ●●●
import { getScoreGrade, getArenaScoreColor, formatSignedScore } from '../../engines/GTOScoreEngine';

// Components defined locally within this file or in other imports
import useGTOTrainer from '../../hooks/useGTOTrainer';
import useSpacedRepetition from '../../hooks/useSpacedRepetition';
import { CLASSIFICATION_CONFIG, MOVE_CLASSIFICATIONS } from '../../hooks/useGTOWScore';
// SESSION ANALYTICS (2026-08-08): pure selectors over the one handHistory
// accumulator — the same functions the session-analytics harness asserts.
import { deriveTopLeaks } from '../../lib/sessionAnalytics';
const Confetti = dynamic(() => import('react-confetti'), { ssr: false });
import { getLevel } from '../../config/LevelRegistry';
import { getGameConfig as getGameEngineConfig } from '../../config/gameConfigs';
import { eventBus, EventType } from '../../engine/EventBus';
import { acquireScrollLock } from '../../lib/scrollLock';

// ALL GAMES use full-screen immersive UI with GameUIRouter
const FULL_SCREEN_UI_GAMES = [
  // Cash Games (25)
  'cash-001',
  'cash-002',
  'cash-003',
  'cash-004',
  'cash-005',
  'cash-006',
  'cash-007',
  'cash-008',
  'cash-009',
  'cash-010',
  'cash-011',
  'cash-012',
  'cash-013',
  'cash-014',
  'cash-015',
  'cash-016',
  'cash-017',
  'cash-018',
  'cash-019',
  'cash-020',
  'cash-021',
  'cash-022',
  'cash-023',
  'cash-024',
  'cash-025',
  // MTT Games (25)
  'mtt-001',
  'mtt-002',
  'mtt-003',
  'mtt-004',
  'mtt-005',
  'mtt-006',
  'mtt-007',
  'mtt-008',
  'mtt-009',
  'mtt-010',
  'mtt-011',
  'mtt-012',
  'mtt-013',
  'mtt-014',
  'mtt-015',
  'mtt-016',
  'mtt-017',
  'mtt-018',
  'mtt-019',
  'mtt-020',
  'mtt-021',
  'mtt-022',
  'mtt-023',
  'mtt-024',
  'mtt-025',
  // Spins Games (10)
  'spins-001',
  'spins-002',
  'spins-003',
  'spins-004',
  'spins-005',
  'spins-006',
  'spins-007',
  'spins-008',
  'spins-009',
  'spins-010',
  // Psychology Games (20)
  'psy-001',
  'psy-002',
  'psy-003',
  'psy-004',
  'psy-005',
  'psy-006',
  'psy-007',
  'psy-008',
  'psy-009',
  'psy-010',
  'psy-011',
  'psy-012',
  'psy-013',
  'psy-014',
  'psy-015',
  'psy-016',
  'psy-017',
  'psy-018',
  'psy-019',
  'psy-020',
  // Advanced Games (20)
  'adv-001',
  'adv-002',
  'adv-003',
  'adv-004',
  'adv-005',
  'adv-006',
  'adv-007',
  'adv-008',
  'adv-009',
  'adv-010',
  'adv-011',
  'adv-012',
  'adv-013',
  'adv-014',
  'adv-015',
  'adv-016',
  'adv-017',
  'adv-018',
  'adv-019',
  'adv-020',
  // Special Games (7)
  'tournament-prep',
  'final-table-sim',
  'quiz-gauntlet',
  'hand-lab',
  'bluff-catcher',
  'mixed-strategy-lab',
  'study-group',
];

// SVG ICON RENDERER for classification badges
function ClassificationSVGIcon({ icon, size = 14, color = 'currentColor' }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  switch (icon) {
    case 'star':
      return (
        <svg {...props} strokeWidth="2.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case 'check':
      return (
        <svg {...props} strokeWidth="3">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...props} strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'x':
      return (
        <svg {...props} strokeWidth="3">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case 'warning':
      return (
        <svg {...props} strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    default:
      return <span>{icon || '?'}</span>;
  }
}

function getEngineType(gameId) {
  const cfg = getGameEngineConfig?.(gameId);
  return cfg?.engine || 'PIO';
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// HAND HISTORY ENTRY — Single row in the post-session review
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●


// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// F14: ACCURACY BY POSITION — Horizontal bar chart per seat
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function AccuracyByPositionChart({ handHistory }) {
  if (!handHistory || handHistory.length < 3) return null;
  const posStats = {};
  handHistory.forEach((h) => {
    const pos = heroPositionOf(h);
    if (!posStats[pos]) posStats[pos] = { correct: 0, total: 0 };
    posStats[pos].total++;
    if (h.classification === 'best' || h.classification === 'correct') posStats[pos].correct++;
  });
  const positions = Object.keys(posStats || {});
  if (positions.length === 0) return null;
  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 14px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 'bold',
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 8,
        }}
      >
        Accuracy By Position
      </div>
      {positions.map((pos) => {
        const pct =
          posStats[pos].total > 0
            ? Math.round((posStats[pos].correct / posStats[pos].total) * 100)
            : 0;
        return (
          <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 40, fontSize: 11, fontWeight: 600, color: '#00d4ff' }}>
              {pos}
            </span>
            <div
              style={{
                flex: 1,
                height: 6,
                background: '#1e293b',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, delay: 0.1 }}
                style={{
                  height: '100%',
                  borderRadius: 3,
                  background: pct >= 70 ? '#22c55e' : pct >= 50 ? '#fbbf24' : '#ef4444',
                }}
              />
            </div>
            <span
              style={{
                width: 35,
                fontSize: 11,
                fontWeight: 'bold',
                color: pct >= 70 ? '#22c55e' : pct >= 50 ? '#fbbf24' : '#ef4444',
                textAlign: 'right',
              }}
            >
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// WEAKNESS HEATMAP — Position x Street accuracy grid
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function WeaknessHeatmap({ handHistory }) {
  if (!handHistory || handHistory.length < 5) return null;
  const grid = {};
  const positions = new Set();
  const streets = ['preflop', 'flop', 'turn', 'river'];
  handHistory.forEach((h) => {
    const pos = heroPositionOf(h);
    const st = streetOf(h) || 'preflop';
    positions.add(pos);
    if (!grid[pos]) grid[pos] = {};
    if (!grid[pos][st]) grid[pos][st] = { correct: 0, total: 0 };
    grid[pos][st].total++;
    if (h.classification === 'best' || h.classification === 'correct') grid[pos][st].correct++;
  });
  const posArr = [...positions];
  if (posArr.length === 0) return null;
  const getColor = (pct) =>
    pct >= 80 ? '#22c55e' : pct >= 60 ? '#fbbf24' : pct >= 40 ? '#f97316' : '#ef4444';
  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 14px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 'bold',
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 10,
        }}
      >
        Weakness Heatmap
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `60px repeat(${streets.length}, 1fr)`,
          gap: 3,
          fontSize: 10,
        }}
      >
        <div style={{ color: '#64748b', fontWeight: 700 }}></div>
        {streets.map((s) => (
          <div
            key={s}
            style={{
              color: '#94a3b8',
              fontWeight: 700,
              textTransform: 'uppercase',
              textAlign: 'center',
              fontSize: 9,
            }}
          >
            {s.slice(0, 3)}
          </div>
        ))}
        {posArr.map((pos) => (
          <React.Fragment key={pos}>
            <div
              style={{ color: '#00d4ff', fontWeight: 700, display: 'flex', alignItems: 'center' }}
            >
              {pos}
            </div>
            {streets.map((st) => {
              const cell = grid[pos]?.[st];
              if (!cell || cell.total === 0)
                return (
                  <div
                    key={st}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 4,
                      padding: 4,
                      textAlign: 'center',
                      color: '#475569',
                    }}
                  >
                    -
                  </div>
                );
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
                    borderRadius: 4,
                    padding: '4px 0',
                    textAlign: 'center',
                    color: getColor(pct),
                    fontWeight: 700,
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
        Green = 80%+ | Yellow = 60-79% | Orange = 40-59% | Red = Under 40%
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// ACCURACY OVER TIME — Rolling accuracy line chart across session
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function AccuracyOverTimeChart({ handHistory }) {
  if (!handHistory || handHistory.length < 3) return null;
  const points = [];
  for (let i = 0; i < handHistory.length; i++) {
    const windowStart = Math.max(0, i - 4);
    let correct = 0;
    for (let j = windowStart; j <= i; j++) {
      if (handHistory[j].classification === 'best' || handHistory[j].classification === 'correct')
        correct++;
    }
    points.push(Math.round((correct / (i - windowStart + 1)) * 100));
  }
  const maxH = 60;
  const pathD = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * 100;
      const y = maxH - (p / 100) * maxH;
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 14px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 'bold',
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 8,
        }}
      >
        Accuracy Over Time
      </div>
      <svg
        viewBox={`0 0 100 ${maxH}`}
        style={{ width: '100%', height: 60 }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${pathD} L100,${maxH} L0,${maxH} Z`} fill="url(#accGrad)" />
        <path d={pathD} fill="none" stroke="#00d4ff" strokeWidth="1.5" />
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          color: '#64748b',
          marginTop: 2,
        }}
      >
        <span>Hand 1</span>
        <span>Hand {handHistory.length}</span>
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// F15: CLASSIFICATION DONUT CHART — SVG donut of move distribution
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function ClassificationDonut({ handHistory, gtowScore }) {
  const segments = useMemo(() => {
    if (!handHistory || handHistory.length === 0) return [];
    const counts = {};
    Object.values(MOVE_CLASSIFICATIONS || {}).forEach((c) => (counts[c] = 0));
    handHistory.forEach((h) => {
      if (h.classification) counts[h.classification]++;
    });
    const total = handHistory.length;
    const colorMap = {};
    Object.entries(CLASSIFICATION_CONFIG || {}).forEach(([key, cfg]) => {
      colorMap[key] = cfg.color;
    });

    let cumAngle = 0;
    return Object.entries(counts || {})
      .filter(([, count]) => count > 0)
      .map(([key, count]) => {
        const pct = count / total;
        const startAngle = cumAngle;
        cumAngle += pct * 360;
        return { key, count, pct, startAngle, endAngle: cumAngle, color: colorMap[key] || '#666' };
      });
  }, [handHistory]);

  if (segments.length === 0) return null;

  const cx = 55,
    cy = 55,
    r = 40,
    strokeWidth = 12;
  const circumference = 2 * Math.PI * r;
  const scoreColor = getArenaScoreColor(gtowScore);

  let dashOffset = 0;

  return (
    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={110} height={110} viewBox="0 0 110 110">
        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        {/* Segments */}
        {segments.map((seg) => {
          const segLen = seg.pct * circumference;
          const offset = dashOffset;
          dashOffset += segLen;
          return (
            <circle
              key={seg.key}
              cx={cx}
              cy={cy}
              r={r}
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
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fill={scoreColor}
          fontSize="18"
          fontWeight="bold"
          style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace" }}
        >
          {gtowScore}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fill="#64748b"
          fontSize="7"
          fontWeight="600"
          letterSpacing="1"
        >
          GTOW
        </text>
      </svg>
      <div style={{ flex: 1 }}>
        {segments.map((seg) => (
          <div
            key={seg.key}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}
          >
            <div
              style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }}
            />
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

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// F4: EV LOSS GRAPH — Cumulative EV loss sparkline
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●


// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// F7: DRILL FILTERS — Pre-session position/street filter modal
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function DrillFilters({
  show,
  onClose,
  onApply,
  difficulty,
  setDifficulty,
  timerMode,
  setTimerMode,
}) {
  const [positions, setPositions] = useState(['all']);
  const [streets, setStreets] = useState(['all']);

  if (!show) return null;

  const posOpts = ['all', 'BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB'];
  const streetOpts = ['all', 'preflop', 'flop', 'turn', 'river'];

  const toggleFilter = (arr, setter, val) => {
    if (val === 'all') {
      setter(['all']);
      return;
    }
    const without = arr.filter((x) => x !== 'all');
    if (without.includes(val)) {
      const next = without.filter((x) => x !== val);
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
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        style={{
          background: 'linear-gradient(180deg, #1e1e2e, #0f0f1a)',
          border: '1px solid rgba(0,212,255,0.3)',
          borderRadius: 16,
          padding: 20,
          width: '90%',
          maxWidth: 360,
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 'bold',
            color: '#e2e8f0',
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          Drill Filters
        </div>

        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 11,
              color: '#94a3b8',
              fontWeight: 'bold',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Position
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {posOpts.map((p) => (
              <button
                key={p}
                onClick={() => toggleFilter(positions, setPositions, p)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 'bold',
                  minHeight: 44,
                  background: positions.includes(p)
                    ? 'rgba(0,212,255,0.2)'
                    : 'rgba(255,255,255,0.05)',
                  color: positions.includes(p) ? '#00d4ff' : '#94a3b8',
                  border: `1px solid ${positions.includes(p) ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer',
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: '#94a3b8',
              fontWeight: 'bold',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Street
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {streetOpts.map((s) => (
              <button
                key={s}
                onClick={() => toggleFilter(streets, setStreets, s)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 'bold',
                  minHeight: 44,
                  background: streets.includes(s)
                    ? 'rgba(139,92,246,0.2)'
                    : 'rgba(255,255,255,0.05)',
                  color: streets.includes(s) ? '#a78bfa' : '#94a3b8',
                  border: `1px solid ${streets.includes(s) ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 11,
              color: '#94a3b8',
              fontWeight: 'bold',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Difficulty
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['beginner', 'standard', 'expert'].map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 'bold',
                  background: difficulty === d ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
                  color: difficulty === d ? '#00d4ff' : '#94a3b8',
                  border: `1px solid ${difficulty === d ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: '#94a3b8',
              fontWeight: 'bold',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Timer Mode
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'relaxed', label: 'Relaxed (∞)' },
              { id: 'standard', label: 'Standard (25s)' },
              { id: 'quick', label: 'Quick (15s)' },
              { id: 'blitz', label: 'Blitz (7s)' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTimerMode(t.id)}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 'bold',
                  background: timerMode === t.id ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                  color: timerMode === t.id ? '#ef4444' : '#94a3b8',
                  border: `1px solid ${timerMode === t.id ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 'bold',
              minHeight: 48,
              background: 'transparent',
              color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onApply({ positions, streets });
              onClose();
            }}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 'bold',
              minHeight: 48,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Apply & Start
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// F13: SESSION SCORE TARGET
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function SessionScoreTarget({ gtowScore, targetScore = 70 }) {
  const achieved = gtowScore >= targetScore;
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        marginBottom: 12,
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
          <div
            style={{ fontSize: 12, fontWeight: 'bold', color: achieved ? '#22c55e' : '#a78bfa' }}
          >
            {achieved ? 'Session Score Target Met' : 'Session Score Target'}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>Score {formatSignedScore(targetScore)}+ This Session</div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          borderRadius: 8,
          background: achieved ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${achieved ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 'bold', color: achieved ? '#22c55e' : '#94a3b8' }}>
          {achieved ? 'Goal met' : 'Goal'}
        </span>
      </div>
    </motion.div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

// GTOW timebank: 7 / 15 / 25s. 'standard' was 60s -- four times the
// reference product's longest tier. 'quick' is the new middle tier; the old
// id set is kept so any persisted localStorage value still resolves.
const TIMER_DURATIONS = { relaxed: 0, standard: 25, quick: 15, blitz: 7 };

// GTOW parity #4 deleted the 60-second tier -- GTOW's longest timebank is 25s,
// so a minute is four times the reference product's most generous setting. It
// came back anyway, through `TIMER_DURATIONS[timerMode] || 60` at three call
// sites. That expression is wrong twice over.
//
// (a) An UNKNOWN key falls through to 60. `/hub/training/multi-table` defaulted
//     its timer to 'off', which is a value from the AUTO-ADVANCE vocabulary
//     ('on' | 'off'), not this one. Measured on production: a direct visit to
//     the multi-table screen ran a 60-second clock. That is the same class of
//     bug as the three difficulty vocabularies -- two controls whose value sets
//     look interchangeable and are not.
// (b) `relaxed` maps to 0, which is FALSY, so even the correct no-timer key
//     resolves to 60 here. It never showed because `timerEnabled` happened to
//     be computed as `timerMode !== 'relaxed'` and masked it. Two bugs
//     cancelling is not a fix; either one moving exposes the other.
//
// Resolve through these instead. An unrecognised mode means NO timer, never a
// minute, and "is there a timer" is derived from the duration rather than from
// a second string comparison that can drift away from the table above.
const resolveTimerSeconds = (mode) => (
  Object.prototype.hasOwnProperty.call(TIMER_DURATIONS, mode) ? TIMER_DURATIONS[mode] : 0
);
const isTimerEnabled = (mode) => resolveTimerSeconds(mode) > 0;

function GodModeArenaInner({
  userId,
  gameId,
  gameName,
  level = 1,
  sessionId,
  onComplete,
  onExit,
  // 2026-07-26 UX FIX: when the caller has ALREADY collected difficulty /
  // timer / mode (SessionSetupModal on the dashboard), pass them here.
  // The arena then starts straight into play instead of showing its own
  // splash asking for the same three things a second time.
  initialConfig = null,
  // GTOW parity #10. Multi-tabling puts several arenas on screen at once, and
  // two of this component's behaviours are viewport-global rather than
  // table-local: the keyboard handler listens on `window`, and the win confetti
  // is a position:fixed canvas. With four arenas mounted, one "1" keypress
  // submitted an answer on all four, and one table passing its level painted
  // 1600 confetti pieces over the other three.
  //
  // Defaults to true so every existing single-table caller is untouched — the
  // one-arena case IS the focused arena. Multi-table passes false for the
  // tables the player is not currently looking at.
  isFocused = true,
}) {
  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
  // SPECIALIZED TRAINERS (Phase 14) -> Safely moved to exported wrapper
  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

  const engineType = getEngineType(gameId);

  // Resolve every entry path (Hub setup, multi-table, direct Arena, and old
  // saved aliases) once through the same vocabulary before the question hook
  // performs its first preload.
  const [bootstrapSessionConfig] = useState(() => normalizeTrainingSessionConfig(
    initialConfig || {},
    {
      difficulty: typeof window !== 'undefined'
        ? localStorage.getItem('gma_difficulty') || 'standard'
        : 'standard',
      timer: typeof window !== 'undefined'
        ? localStorage.getItem('gma_timer') || 'standard'
        : 'standard',
    },
  ));

  // Trainer config state
  const [trainerConfig, setTrainerConfig] = useState(() => {
    return bootstrapSessionConfig;
  });
  const [showConfigModal, setShowConfigModal] = useState(false);

  const handleConfigStart = useCallback((config) => {
    setTrainerConfig((current) => normalizeTrainingSessionConfig(config, current));
    setShowConfigModal(false);
    // The hook rotates to a fresh server-attempt identity and clears every
    // attempt-scoped value when this normalized contract changes.
  }, []);

  const {
    currentQuestion,
    questionNumber,
    totalQuestions,
    level: currentLevel,
    trainingSessionId,
    loading,
    error,
    answerSaveError,
    answerSaveRetrying,
    answerSaveRequiresRefresh,
    transitionError,
    transitionRetrying,
    correctCount,
    streak,
    bestStreak,
    requiredCorrect,
    passThreshold,
    totalLevels,
    // ●●● MASTERY GATE ●●●
    masteryToken,
    masteryStatus,
    showFeedback,
    feedbackResult,
    explanation,
    gameComplete,
    levelPassed,
    diamondsEarned,
    // GTOW scoring
    moveClassification,
    evLoss,
    evLossMeasured,
    gtoFrequencies,
    gtowScore,
    measuredTotalEVLoss,
    measuredEVDecisions,
    sessionMistakes,
    handHistory,
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
    retryAnswerPersistence,
    retryTransition,
    startNextLevel,
    retryLevel,
    retrainMistakes,
    resetGame,
    reloadQuestions,
    // Review and gameplay adapters that still have a visible consumer.
    structuredExplanation,
    getSessionGrade,
    getTeachingPrinciple,
    getPositionReminder,
    getTextureStrategyGuide,
    getSPRStrategyGuide,
    getVillainRangeNarration,
    getMultiStreetPlanningGuide,
    getFrequencyCorrectionPrompt,
    getTiltRecoveryAdvice,
    classifyHandStrength,
    estimateEquityVsRange,
    getActionEVComparison,
    getSolverLineComparison,
    generateHints,
    getRunoutImpactPreview,
    getRangeConstructionDrill,
    getExploitativeAdjustments,
    getHandReadingDrill,
    getVarianceSimulator,
    getOptimalLineNarration,
    getComprehensiveSessionReport,
    getEndgameReport,
    getKeyConceptReminders,
    getSessionSummaryCard,
    getPreDecisionPreview,
  } = useGTOTrainer(gameId, engineType, level, trainerConfig, sessionId);

  // ●●● PHASE 15: Spaced Repetition (cross-session review) ●●●
  const { dueCount: reviewDueCount, getReviewSession, markReviewed } = useSpacedRepetition(gameId);

  // ●●● PHASE 16: Cross-session analytics ●●●
  const { analytics: crossSessionAnalytics, loading: analyticsLoading } = useTrainingAnalytics(
    gameId,
    30
  );

  // ●●● PHASE 17: Deterministic graded-answer debrief ●●●
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
            const sorted = Object.entries(dataMap || {})
              .filter(([, v]) => v.total >= 5)
              .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);
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
        const correctQ =
          handHistory?.filter((h) => h.classification === 'best' || h.classification === 'correct')
            .length || 0;
        const acc = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : 0;

        // Build position stats.
        // roadmap #39/#40 sibling defect: useGTOWScore.recordMove stores the
        // hand entry as `{ handNumber, classification, ..., ...handData }` --
        // handData is SPREAD FLAT, there is no `h.handData` key. Every
        // `h.handData?.x` read below therefore returned undefined, so every
        // position bucketed as 'UNK' and every weak spot as 'general'. Read
        // both shapes, the way the shared history accessors already do.
        const hdOf = (h) => (h && h.handData) || h || {};
        const posStats = {};
        handHistory?.forEach((h) => {
          const pos = hdOf(h).heroPosition || 'UNK';
          if (!posStats[pos]) posStats[pos] = { correct: 0, total: 0 };
          posStats[pos].total++;
          if (h.classification === 'best' || h.classification === 'correct')
            posStats[pos].correct++;
        });

        // Build weak spots
        const weakSpots = [];
        const spotBuckets = {};
        handHistory?.forEach((h) => {
          if (h.classification === 'best' || h.classification === 'correct') return;
          const key = `${hdOf(h).heroPosition || 'UNK'}|${hdOf(h).street || 'flop'}|${hdOf(h).spotType || 'general'}`;
          if (!spotBuckets[key])
            spotBuckets[key] = {
              position: hdOf(h).heroPosition || 'UNK',
              street: hdOf(h).street || 'flop',
              spotType: hdOf(h).spotType || 'general',
              mistakes: 0,
              total: 0,
            };
          spotBuckets[key].mistakes++;
        });
        handHistory?.forEach((h) => {
          const key = `${hdOf(h).heroPosition || 'UNK'}|${hdOf(h).street || 'flop'}|${hdOf(h).spotType || 'general'}`;
          if (spotBuckets[key]) spotBuckets[key].total++;
        });
        Object.values(spotBuckets || {}).forEach((b) => {
          if (b.total >= 2) weakSpots.push({ ...b, mistakeRate: b.mistakes / b.total });
        });
        weakSpots.sort((a, b) => b.mistakeRate - a.mistakeRate);

        // Build mistakes array
        const mistakesArr =
          handHistory
            ?.filter(
              (h) =>
                h.classification && h.classification !== 'best' && h.classification !== 'correct'
            )
            .slice(0, 8)
            .map((h) => ({
              question: { question: h.questionText || 'GTO Decision', scenario: h.handData },
              userAnswer: h.userAnswer || '?',
              correctAnswer: h.correctAnswer || '?',
            })) || [];

        // ●●● Phase GTO-CLONE: Engine-only coaching (no AI API) ●●●
        const cc = {};
        handHistory?.forEach((h) => {
          if (h.classification) cc[h.classification] = (cc[h.classification] || 0) + 1;
        });

        const strengths = [];
        if (acc >= 80) strengths.push('Consistent graded-answer accuracy');
        if (bestStreak >= 8) strengths.push(`Excellent streak of ${bestStreak} correct`);
        else if (bestStreak >= 5) strengths.push('Good streak management');
        const strongPositions = Object.entries(posStats || {})
          .filter(([, v]) => v.total >= 3 && v.correct / v.total >= 0.8)
          .map(([pos]) => pos);
        if (strongPositions.length > 0) strengths.push(`Strong from ${strongPositions.join(', ')}`);
        if (strengths.length === 0) strengths.push('Session completed');

        const areas = [];
        if (cc.blunder > 0)
          areas.push(`${cc.blunder} blunder${cc.blunder > 1 ? 's' : ''} - review these hands`);
        if (weakSpots.length > 0) {
          const worst = weakSpots[0];
          areas.push(
            `Weakest spot: ${worst.position || ''} ${worst.street || ''} ${worst.spotType || ''}`.trim()
          );
        }
        if (acc < 60) areas.push('Training-answer fundamentals need review');

        let feedback = `Your ${totalQ} graded Training answers were ${acc}% accurate.`;
        if (gtowScore !== undefined) feedback += ` GTOW Score: ${gtowScore}.`;
        feedback +=
          bestStreak > 5
            ? ` Great streak of ${bestStreak}!`
            : ' Work on building longer correct streaks.';

        setAiCoaching({
          overallGrade:
            acc >= 90 ? 'A+' : acc >= 80 ? 'A' : acc >= 70 ? 'B' : acc >= 60 ? 'C' : 'D',
          headline:
            acc >= 90
              ? 'Exceptional graded-answer accuracy this session.'
              : acc >= 80
                ? 'Strong graded-answer accuracy this session.'
                : acc >= 70
                  ? 'Good graded-answer accuracy with a few spots to review.'
                  : acc >= 60
                    ? 'Decent session with room for improvement.'
                    : 'Focus on the basics - review your biggest mistakes.',
          strengths,
          areasToImprove: areas,
          detailedFeedback: feedback,
          readyForNextLevel: acc >= 85 && (gtowScore === undefined || gtowScore >= 40),
        });
      } catch (err) {
        console.warn('[SessionDebrief] Build error:', err.message);
      }
      setIsLoadingCoaching(false);
    }
    fetchCoaching();
  }, [gameComplete, gameId, crossSessionAnalytics, bestStreak, gtowScore, handHistory]);

  // Reset coaching when level changes
  useEffect(() => {
    coachingFetchedRef.current = false;
    setAiCoaching(null);
  }, [currentLevel]);

  const [showDrillFilters, setShowDrillFilters] = useState(false);
  const [drillFilters, setDrillFilters] = useState(null);

  // The Arena has one authority path: a signed server-delivered question,
  // server grading, durable feedback, and explicit manual Next. Browser-made
  // flashcards, quick-fire grading, and imported-question grading are retired
  // until equivalent authenticated server contracts exist.
  // ●●● PHASE 19: Local share card ●●●
  const [showShareCard, setShowShareCard] = useState(false);

  // ●●● QW-1: DIFFICULTY SELECTOR (beginner/standard/expert) ●●●
  const [difficulty, setDifficulty] = useState(bootstrapSessionConfig.difficulty);
  useEffect(() => {
    // A table-scoped arena READS its preference from its own trainerConfig
    // (prefsScope: 'table'), so it must not WRITE the shared key either.
    //
    // It did, and unconditionally on mount, with the value multi-table
    // DEFAULTS rather than one the player picked: /hub/training/multi-table
    // supplies `difficulty: 'standard'` and `timer: 'relaxed'` when the setup
    // modal forwards neither. So opening two tables silently overwrote the
    // Expert + Blitz a player had set on the single-table arena, and the next
    // visit there -- which passes no initialConfig and therefore reads these
    // keys -- came back Standard with no clock at all. Nothing the player
    // touched caused it and nothing told them it had happened.
    const tableScoped = bootstrapSessionConfig.prefsScope === 'table';
    if (!tableScoped && typeof window !== 'undefined') {
      localStorage.setItem('gma_difficulty', difficulty);
    }
    // A mid-game settings change still has to reach THIS table's engine.
    setTrainerConfig((current) => withTrainingSessionDifficulty(
      current,
      difficulty,
      bootstrapSessionConfig,
    ));
  }, [difficulty, bootstrapSessionConfig]);

  // ●●● QW-2: TIMER MODE (relaxed/standard/quick/blitz) ●●●
  //
  // Both sources are sanitised against TIMER_DURATIONS. `gma_timer` is a
  // PERSISTED string, and every build that shipped `timer: 'off'` into this
  // component wrote that out-of-vocabulary value straight back into it on the
  // very next render. Reading it back unfiltered would hand a player who once
  // opened the multi-table screen a permanently timer-less arena everywhere
  // else too, because resolveTimerSeconds maps anything unknown to 0. So an
  // unrecognised stored value falls back to the default tier instead of being
  // trusted -- the stale key is repaired the first time the arena mounts.
  const [timerMode, setTimerMode] = useState(bootstrapSessionConfig.timer);
  useEffect(() => {
    // Same rule as gma_difficulty above: a table-scoped arena does not own the
    // shared preference and must not overwrite it with its own default. The
    // sanitiser on READ is unaffected -- a stale out-of-vocabulary value is
    // still repaired the next time a non-scoped arena mounts.
    if (bootstrapSessionConfig.prefsScope === 'table') return;
    if (typeof window !== 'undefined') localStorage.setItem('gma_timer', timerMode);
  }, [timerMode, bootstrapSessionConfig.prefsScope]);
  // The in-hand countdown lives in UDT's CountdownTimer, fed timerSeconds /
  // timerEnabled through trainerConfig below. A "fallback" interval used to
  // sit here -- it was DEAD both ways (timer enabled: early return; timer
  // disabled: duration 0, early return), and its expiry branch deliberately
  // submitted a WRONG option the player never chose, silently. Removed rather
  // than left to be resurrected by the next refactor; UDT's expiry path
  // auto-folds/checks with the solver's own classification and says TIME.

  // ●●● Phase 21: Game Phase State Machine ●●●
  // Skip the splash entirely when the caller already gathered the config.
  const [gamePhase, setGamePhase] = useState(() => (
    initialConfig ? 'playing' : 'splash'
  )); // 'splash' | 'playing' | 'review'
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [reviewTab, setReviewTab] = useState('overview'); // 'overview' | 'hands' | 'analysis' | 'gametree'
  const [gameTreeData, setGameTreeData] = useState(null);
  const [adaptiveToast, setAdaptiveToast] = useState(null);

  // GodModeArena is normally remounted for a new configured launch, but keep
  // prop transitions correct for embedded/multi-table callers that reuse it.
  // Every legacy mode value is normalized into the same signed Arena flow.
  useEffect(() => {
    if (!initialConfig) return;
    const next = normalizeTrainingSessionConfig(initialConfig, bootstrapSessionConfig);
    setTrainerConfig(next);
    setDifficulty(next.difficulty);
    setTimerMode(next.timer);
    setGamePhase('playing');
  }, [initialConfig, bootstrapSessionConfig]);

  // ●●● Phase 2: Adaptive Difficulty Level (1-10) ●●●
  // Phase 50: Enhanced adaptive difficulty using GTOW metrics
  const computedDifficultyLevel = useMemo(() => {
    if (!handHistory || handHistory.length < 3) return currentLevel || 1;
    const base = Math.min(10, Math.max(1, currentLevel || 1));

    // Factor 1: Overall accuracy (weighted by classification quality)
    const classWeights = { best: 1.0, correct: 0.75, inaccuracy: 0.3, wrong: 0, blunder: -0.2 };
    let weightedScore = 0;
    handHistory.forEach((h) => {
      weightedScore += classWeights[h.classification] ?? 0;
    });
    const qualityRatio = weightedScore / handHistory.length; // 0-1 scale

    // Factor 2: Recent trend (last 5 hands weighted more heavily)
    const recent = handHistory.slice(-5);
    let recentScore = 0;
    recent.forEach((h) => {
      recentScore += classWeights[h.classification] ?? 0;
    });
    const recentRatio = recent.length > 0 ? recentScore / recent.length : qualityRatio;

    // Factor 3: Streak momentum
    const streakBonus =
      gtowCurrentStreak >= 5
        ? 0.15
        : gtowCurrentStreak >= 3
          ? 0.05
          : gtowCurrentStreak <= -3
            ? -0.1
            : 0;

    // Factor 4: Leak severity penalty — major leaks suggest difficulty is too high
    const leakPenalty = (mistakePatterns || []).filter((p) => p.severity === 'high').length * 0.08;

    // Combined score: 60% quality, 25% recent trend, 15% momentum
    const combined =
      qualityRatio * 0.6 + recentRatio * 0.25 + (0.5 + streakBonus) * 0.15 - leakPenalty;

    // Map to difficulty adjustment
    if (combined >= 0.85) return Math.min(10, base + 2); // Crushing it → jump up
    if (combined >= 0.7) return Math.min(10, base + 1); // Doing well → step up
    if (combined >= 0.5) return base; // Steady → maintain
    if (combined >= 0.35) return Math.max(1, base - 1); // Struggling → step down
    return Math.max(1, base - 2); // Drowning → drop fast
  }, [handHistory, currentLevel, gtowCurrentStreak, mistakePatterns]);

  // Preserve the table metadata (including signed RNG guidance) without
  // manufacturing any client-side currency entitlement.
  const handleSubmitAnswer = useCallback(
    (answerId, meta) => {
      // Forward `meta` intact. The RNG randomiser (GTOW parity #38) rides in
      // here as `rngTargetActionId`; dropping it meant the table drew a dice
      // pointing at one action while the grader scored a different one.
      return submitAnswer(answerId, meta);
    },
    [submitAnswer]
  );

  // ●●● PHASE 18: Splash stays until user clicks Start (no auto-transition) ●●●
  const splashReady = gamePhase === 'splash' && Boolean(currentQuestion) && !loading && !error;

  /**
   * THE LOBBY MUST BE ABLE TO SAY "THIS FAILED" (2026-09-07).
   *
   * A sticky `splashReady` flag used to stay true after session/config
   * invalidation, and the Start button's label was a
   * two-way choice between it and `Loading Solver Data...`. So a failed
   * question fetch — which sets `error` and leaves `currentQuestion` null —
   * rendered as a permanently disabled button that claimed to still be
   * loading. There was no retry and no timeout; the arena was dead until the
   * page was reloaded, and the E2E suite could only report it as a 60-second
   * timeout on `toBeEnabled()`, which reads like flakiness rather than an
   * outage.
   */
  const loadFailed = gamePhase === 'splash' && !currentQuestion && !loading && Boolean(error);
  const handleRetryLoad = useCallback(() => {
    reloadQuestions?.();
  }, [reloadQuestions]);

  // The setup surface is taller than the gameplay viewport. Preserve its
  // selection state, but never preserve its scroll position: doing so launched
  // the Club Arena table with the header/question region already above the
  // viewport. Club Arena table routes always begin at their visual origin.
  useEffect(() => {
    if (gamePhase !== 'playing' || typeof window === 'undefined') return;
    window.scrollTo(0, 0);
  }, [gamePhase]);

  const handleStartTraining = useCallback(() => {
    // 2026-07-26 VERIFIED IN PRODUCTION: "Start Training" did nothing on the
    // /hub/training/arena/[gameId] route. The button rendered enabled and its
    // onClick fired without throwing, but the session never began.
    //
    // This guard was the cause. handleStartTraining is a useCallback over
    // [splashReady, the legacy training mode]; the button is ALSO already
    // disabled={!splashReady}, so the guard is redundant -- and when the
    // handler closure lags the render that enabled the button, it early-returns
    // against a stale `false` while the button looks perfectly clickable. The
    // disabled attribute is the correct and sufficient gate.
    if (typeof splashReady !== 'undefined' && splashReady === false && !currentQuestion) {
      // Only refuse when there is genuinely nothing to play.
      return;
    }
    setGamePhase('playing');
  }, [splashReady, currentQuestion]);

  // Phase 8: Listen for adaptive difficulty changes
  useEffect(() => {
    const handler = (eventData) => {
      const { from, to, direction, gameId: fromGameId } = eventData || {};
      // Multi-table: useGTOTrainer stamps gameId on the emission; without this
      // filter every mounted table toasts table A's adaptive level change.
      if (fromGameId && String(fromGameId) !== String(gameId)) return;
      setAdaptiveToast({
        message:
          direction === 'up'
            ? `Difficulty increased! Level ${from} → ${to}`
            : `Difficulty decreased: Level ${from} → ${to}`,
        direction,
      });
      setTimeout(() => setAdaptiveToast(null), 3000);
    };
    const unsub = eventBus.on('adaptiveDifficultyChange', handler);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [gameId]);

  // Auto-transition to review when game completes + emit bus event
  useEffect(() => {
    if (gameComplete && gamePhase === 'playing') {
      setGamePhase('review');
      // Phase 2: Emit session-complete bus event with engine scoring
      try {
        // Engine: Calculate diamond rewards + grade from GTOScoreEngine
        let engineGrade = null;
        try {
          engineGrade = getScoreGrade(Number(gtowScore));
        } catch (e) {
          console.warn('[GodModeArena] Engine scoring failed:', e.message);
        }

        // BUG FIX (2026-05-08, MAX-RIGOR audit): Include `gameName` + `accuracy`
        // + canonical questionsAnswered/questionsCorrect aliases so
        // TrainingEventAggregator and other listeners can render meaningful
        // toasts ("◆ MTT Push-Fold — 88% Accuracy") instead of falling
        // through to the generic "Session Completed" branch every time.
        const _accuracy =
          totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
        const sessionPayload = {
          gameId: String(gameId),
          gameName: gameName || String(gameId),
          score: Number(gtowScore),
          accuracy: _accuracy,
          totalHands: totalQuestions,
          questionsAnswered: totalQuestions,
          questionsCorrect: correctCount,
          durationSeconds: Math.round((Date.now() - sessionStartRef.current) / 1000),
          perfectActionCount: correctCount,
          engineGrade,
          // This is the amount already settled by the server's idempotent
          // completion transaction, never an estimate from browser scores.
          diamondReward: diamondsEarned,
          // EV is evidence-bearing only when the answer receipt sealed exact
          // per-action values. A compatibility zero on an authored or legacy
          // question is absence, not proof of a perfect decision.
          totalEVLoss: measuredEVDecisions > 0
            && Number.isFinite(measuredTotalEVLoss)
            ? Number(measuredTotalEVLoss)
            : null,
          measuredEVDecisions,
          // Which RUN this completion belongs to.
          //
          // EventBus mirrors every emit onto a BroadcastChannel, so SESSION_END
          // crosses TABS. The multi-table aggregator's only guards were
          // `source !== 'MultiTable'` (which a real arena's event passes) and a
          // per-tab dedupe ref (which knows nothing about the other tab). So a
          // second tab open on the training arena ingested this tab's
          // completion, folded its hands and EV loss into ITS combined stats,
          // and -- once the borrowed completion pushed its count to the table
          // total -- fired the auto-save and POSTed a session the player never
          // played to /api/training/save-session. A phantom row, not a UI
          // artifact. The multi-table route already hands each arena a
          // `<runId>-<gameId>` sessionId; it just never travelled with the
          // event that needed it.
          sessionId: trainingSessionId || sessionId || null,
        };

        eventBus.emit(EventType.SESSION_END, sessionPayload, 'GodModeArena');
        // Also emit training:session-complete for dual-subscription dashboards
        eventBus.emit('training:session-complete', sessionPayload, 'GodModeArena');
      } catch (e) {
        console.warn('[GodModeArena] Bus emit failed:', e);
      }
    }
  }, [
    gameComplete,
    gamePhase,
    gameId,
    gameName,
    gtowScore,
    measuredTotalEVLoss,
    measuredEVDecisions,
    totalQuestions,
    sessionMistakes,
    correctCount,
    bestStreak,
    diamondsEarned,
    currentLevel,
    sessionId,
    trainingSessionId,
  ]);

  // Restart actions (retryLevel/retrainMistakes/startNextLevel) reset gameComplete
  // but not gamePhase — return to playing so the review screen doesn't dead-end
  useEffect(() => {
    if (!gameComplete && gamePhase === 'review') setGamePhase('playing');
  }, [gameComplete, gamePhase]);

  // Session timer
  const sessionStartRef = useRef(Date.now());
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // Update elapsed time when review screen shows
  useEffect(() => {
    if (gameComplete) {
      setSessionElapsed(Math.round((Date.now() - sessionStartRef.current) / 1000));
    }
  }, [gameComplete]);

  // Reset one-shot coaching refs whenever a new run starts. Canonical session
  // analytics are materialized by useGTOTrainer only after its server-owned
  // attempt completes; this component must never post browser-computed totals.
  useEffect(() => {
    if (!gameComplete) {
      coachingFetchedRef.current = false;
      sessionStartRef.current = Date.now();
      setAiCoaching(null);
    }
  }, [gameComplete]);

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

  // ●●● GLOBAL KEYBOARD LISTENER & SCROLL LOCK ●●●
  useEffect(() => {
    // 2026-07-26 (roadmap #47 hardening): the previous version captured
    // document.body.style.overflow at MOUNT and restored that value on unmount.
    // If the arena ever mounted while the body was already locked -- a modal
    // open, a route transition, a second arena instance -- it restored
    // 'hidden' and left the whole app permanently unscrollable, which is
    // exactly the symptom #47 describes on /hub/training.
    //
    // Reference-count instead: the last component to release always CLEARS the
    // property rather than restoring a possibly-stale value. Overlapping locks
    // are now safe and the page can never be stranded.
    //
    // 2026-08-06 (roadmap #47, second pass): the bare counter fixed stranding
    // by a stale captured value but could itself get stuck positive — an
    // unmount whose cleanup did not run leaves it at 1 forever, and every
    // safety valve in the app stands down when it is positive, so the page
    // becomes permanently unscrollable with no recovery. src/lib/scrollLock.js
    // holds the same reference count in an auditable registry that heals
    // itself on the next navigation. Behaviour here is otherwise identical.
    if (typeof window === 'undefined') return undefined;
    return acquireScrollLock('GodModeArena');
  }, []);

  // ●●● QW-2 / T2-2: KEYBOARD SHORTCUTS ●●●
  useEffect(() => {
    const handler = (e) => {
      if (gamePhase !== 'playing') return;
      // #10: this listener is on `window`, so in a multi-table grid every
      // mounted arena would receive the same keypress and answer its own
      // question with it. Only the table the player has focused may act.
      if (!isFocused) return;
      // A mounted UniversalDynamicTable owns the keyboard. Its handler resolves
      // the digit against `displayOptions` (what is actually on screen under the
      // active difficulty), whereas this one resolves against the raw question
      // options — so with both live, one keypress submitted two answers and, in
      // Grouped or Simple mode, the wrong one. Stand down when it is present.
      if (typeof window !== 'undefined' && window.__spUnifiedKeyboard > 0) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (!showFeedback && currentQuestion?.options) {
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < currentQuestion.options.length) {
          e.preventDefault();
          const opt = currentQuestion.options[idx];
          handleSubmitAnswer(opt.id || opt);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gamePhase, showFeedback, currentQuestion, handleSubmitAnswer, isFocused]);

  // F5: Mixed strategy adherence tracking
  const mixedStrategyScore = useMemo(() => {
    if (!handHistory || handHistory.length < 5) return null;
    // Count how often player chose the most common action vs mixing
    const actionCounts = {};
    handHistory.forEach((h) => {
      const action = playerActionOf(h) || 'unknown';
      actionCounts[action] = (actionCounts[action] || 0) + 1;
    });
    const totalHands = handHistory.length;
    const maxActionCount = Math.max(...Object.values(actionCounts || {}));
    // Perfect mixing = evenly distributed. Overfocusing = one action dominates
    const diversityScore = Math.round((1 - maxActionCount / totalHands) * 100);
    return Math.min(100, Math.max(0, diversityScore));
  }, [handHistory]);

  // UI-2: Manual advance — no auto-timer. User clicks "Next Hand →" button
  // nextQuestion is passed down as onNextHand to UniversalDynamicTable

  // ●●● QW-1: Options by difficulty ●●●
  // GTOW parity #21: difficulty remaps the BUTTON VOCABULARY — it never turns
  // the spot into a two-way multiple-guess. The old 'beginner' branch here
  // kept only the correct answer plus one distractor, which (a) made beginner
  // a coin flip rather than an easier read of the same spot, and (b) ran AFTER
  // applyDifficultyToQuestion had already collapsed the tree to SIMPLE and
  // aggregated the solver frequencies onto those buttons — so the surviving
  // two no longer summed to 100% and every frequency shown was wrong.
  // Simplification now happens in exactly one place: applyDifficultyToQuestion.
  const filteredOptions = useMemo(
    () => currentQuestion?.options || [],
    [currentQuestion]
  );

  // BUG-C FIX: Inject filteredOptions into question so GameUIRouter/UDT receives them
  const questionWithFilteredOptions = useMemo(() => {
    if (!currentQuestion) return null;
    if (filteredOptions === currentQuestion.options) return currentQuestion;
    return { ...currentQuestion, options: filteredOptions };
  }, [currentQuestion, filteredOptions]);

  // PERF: UniversalDynamicTable is wrapped in React.memo, but three props at
  // the GameUIRouter call sites were re-created on every GodModeArena render
  // -- an inline `trainerConfig={{ ...trainerConfig, timerEnabled,
  // timerSeconds }}` object and inline arrow functions for onConfigClick /
  // onNextHand -- so the memo NEVER held: every arena re-render (a toast, a
  // stat update, an achievement) re-rendered the entire table tree. These
  // are the same values, with stable identities.
  const resolvedTrainerConfig = useMemo(() => ({
    ...trainerConfig,
    // Merge GodModeArena timer settings if no custom config timer
    timerEnabled: trainerConfig?.timerEnabled ?? isTimerEnabled(timerMode),
    timerSeconds: trainerConfig?.timerSeconds ?? resolveTimerSeconds(timerMode),
    feedbackRule: 'every',
    autoAdvance: false,
    autoAdvanceDelayMs: 0,
  }), [trainerConfig, timerMode]);
  const handleConfigClick = useCallback(() => setShowConfigModal(true), []);
  const handleDefaultNextHand = useCallback(() => nextQuestion(), [nextQuestion]);

  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
  // ERROR STATE — Graceful fallback when API fails (auth, network, etc.)
  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
  if (error && !gameComplete && !currentQuestion) {
    const isAuthError = error.toLowerCase().includes('auth') || error.toLowerCase().includes('401');
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#121212',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <div
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: 40,
            maxWidth: 420,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {isAuthError ? (
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            ) : (
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            )}
          </div>
          <h2
            style={{
              color: '#fff',
              fontSize: 20,
              margin: '0 0 12px',
              fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif",
            }}
          >
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
                onClick={() => {
                  try {
                    window.top.location.href = '/auth/login';
                  } catch (err) {
                    window.location.href = '/auth/login';
                  }
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Sign In
              </button>
            )}
            <button
              onClick={onExit}
              style={{
                padding: '12px 24px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Back To Training
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
  // POST-SESSION REVIEW SCREEN — GTO Wizard-style completion
  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

  if (gameComplete) {
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const scoreColor = getArenaScoreColor(gtowScore);

    // Classification distribution — the SAME derived counts the in-hand
    // session rail paints (useGTOWScore -> deriveClassificationCounts over
    // handHistory). The review screen used to recount handHistory locally;
    // identical math, but two code paths for one number is how screens drift.
    const classificationCounts = gtowClassificationCounts;
    const movesGraded = handHistory.length;
    // Solver-facing review widgets must consume only answer evidence the
    // server explicitly marked as solver verified. EV charts need the tighter
    // measured-EV contract as well; an unmeasured decision carrying numeric
    // zero is absence, not proof that the play lost exactly 0.00 BB.
    const solverVerifiedReviewHistory = handHistory.filter(
      (entry) => handFieldOf(entry, 'solverVerified') === true
    );
    const measuredEVReviewHistory = solverVerifiedReviewHistory.filter(
      (entry) =>
        handFieldOf(entry, 'evLossMeasured') === true &&
        Number.isFinite(Number(handFieldOf(entry, 'evLoss')))
    );
    const measuredEVGraphHistory = measuredEVReviewHistory.map((entry) => ({
      street: streetOf(entry),
      evLoss: -Math.abs(Number(handFieldOf(entry, 'evLoss'))),
    }));
    const measuredEVTotal = measuredEVReviewHistory.reduce(
      (sum, entry) => sum + Number(handFieldOf(entry, 'evLoss')),
      0
    );
    const measuredEVMistakes = measuredEVReviewHistory.filter((entry) =>
      ['inaccuracy', 'wrong', 'blunder'].includes(String(entry?.classification || '').toLowerCase())
    ).length;
    const measuredEVPerDecision = measuredEVReviewHistory.length > 0
      ? measuredEVTotal / measuredEVReviewHistory.length
      : null;
    const measuredEVPerMistake = measuredEVMistakes > 0
      ? measuredEVTotal / measuredEVMistakes
      : null;
    const verifiedFrequencyDiffs = solverVerifiedReviewHistory
      .map((entry) => Number(handFieldOf(entry, 'frequencyDiff')))
      .filter(Number.isFinite);
    const verifiedAvgFrequencyDiff = verifiedFrequencyDiffs.length > 0
      ? verifiedFrequencyDiffs.reduce((sum, value) => sum + value, 0) / verifiedFrequencyDiffs.length
      : null;

    return (
      <div
        className="sp-arena-review"
        data-training-ui="club-arena-completion"
        data-training-visual-state="completion"
        style={styles.reviewContainer}
      >
        {/* #10: confetti is a position:fixed full-viewport canvas, so an
            unfocused table in a multi-table grid would paint 400 pieces over
            every other table. Only the focused arena celebrates. */}
        {levelPassed && isFocused && typeof window !== 'undefined' && (
          <Confetti
            width={window.innerWidth}
            height={window.innerHeight}
            recycle={false}
            numberOfPieces={400}
            gravity={0.15}
            style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999, pointerEvents: 'none' }}
          />
        )}
        {/* REVIEW HEADER */}
        <div className="sp-arena-review__header" style={styles.reviewHeader}>
          <button onClick={onExit} style={styles.reviewBackBtn}>
            ← Back
          </button>
          <div className="sp-arena-review__title" style={styles.reviewTitle}>Session Review</div>
          <div
            style={{
              fontSize: 11,
              color: '#64748b',
              fontWeight: 600,
              fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
            }}
          >
            {Math.floor(sessionElapsed / 60)}:{String(sessionElapsed % 60).padStart(2, '0')}
          </div>
        </div>

        <div className="sp-arena-review__scroll" style={styles.reviewScrollArea}>
          {/* F13: Session-only score target. This does not award Daily Challenge progress. */}
          <SessionScoreTarget gtowScore={gtowScore} />

          {/* GTOW SCORE — Hero display + Phase 255 Session Grade */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="sp-arena-review__score"
            style={styles.scoreHero}
          >
            <div style={{ ...styles.scoreHeroValue, color: scoreColor }}>{formatSignedScore(gtowScore)}</div>
            <div style={styles.scoreHeroLabel}>GTOW SCORE</div>
            {/* Phase 255: Session letter grade */}
            {(() => {
              try {
                const grade = getSessionGrade();
                if (grade && grade.grade !== '-')
                  return (
                    <div
                      style={{
                        marginTop: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        justifyContent: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 28,
                          fontWeight: 900,
                          color: grade.color,
                          fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                          textShadow: `0 0 12px ${grade.color}44`,
                        }}
                      >
                        {grade.grade}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                        {grade.label}
                      </span>
                    </div>
                  );
              } catch (_) {
                console.warn('[App] Handled exception:', _?.message || _);
              }
              return null;
            })()}
          </motion.div>

          {/* DIAMOND REWARD CARD */}
          {(() => {
            const totalReward = Number(diamondsEarned) || 0;
            return (
              <motion.div
                className="sp-arena-review__reward"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{
                  background:
                    'linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(245, 158, 11, 0.04))',
                  border: '1px solid rgba(251, 191, 36, 0.2)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 22, color: '#fbbf24' }}>◆</span>
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.4)',
                        fontWeight: 600,
                        letterSpacing: 1,
                      }}
                    >
                      DIAMONDS EARNED
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 900,
                        color: '#fbbf24',
                        fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                      }}
                    >
                      +{totalReward}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 4,
                  }}
                >
                  {(() => {
                    const lvlDef = getLevel(currentLevel);
                    const mult = lvlDef?.diamondMultiplier || 1.0;
                    return mult > 1.0 ? (
                      <div
                        style={{
                          padding: '4px 10px',
                          borderRadius: 8,
                          background: 'rgba(139, 92, 246, 0.15)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#a78bfa',
                        }}
                      >
                        {mult}x LEVEL BONUS
                      </div>
                    ) : null;
                  })()}
                  <div style={{ fontSize: 9, color: '#94a3b8', letterSpacing: '.08em' }}>
                    SERVER SETTLED
                  </div>
                </div>
              </motion.div>
            );
          })()}

          {/* SUMMARY STATS ROW */}
          <div className="sp-arena-review__summary" style={styles.summaryRow}>
            <div style={styles.summaryItem}>
              <div style={styles.summaryValue}>{totalQuestions}</div>
              <div style={styles.summaryLabel}>Hands</div>
            </div>
            <div style={styles.summaryItem}>
              <div style={{ ...styles.summaryValue, color: '#ef4444' }}>
                {measuredEVReviewHistory.length > 0 ? `-${measuredEVTotal.toFixed(1)}` : '—'}
              </div>
              <div style={styles.summaryLabel}>Measured EV Loss (BB)</div>
            </div>
            <div style={styles.summaryItem}>
              <div style={{ ...styles.summaryValue, color: '#fbbf24' }}>{sessionMistakes}</div>
              <div style={styles.summaryLabel}>Mistakes</div>
            </div>
            <div style={styles.summaryItem}>
              <div style={styles.summaryValue}>
                {measuredEVPerDecision === null
                  ? '—'
                  : `-${Math.abs(measuredEVPerDecision).toFixed(2)}`}
              </div>
              <div style={styles.summaryLabel}>Measured EV/Decision</div>
            </div>
            <div style={styles.summaryItem}>
              <div style={{ ...styles.summaryValue, color: '#f97316' }}>
                {measuredEVPerMistake === null
                  ? '—'
                  : `-${Math.abs(measuredEVPerMistake).toFixed(2)}`}
              </div>
              <div style={styles.summaryLabel}>Measured EV/Mistake</div>
            </div>
            <div style={styles.summaryItem}>
              <div style={{ ...styles.summaryValue, color: '#38bdf8' }}>
                {verifiedAvgFrequencyDiff === null
                  ? '—'
                  : `${Math.abs(verifiedAvgFrequencyDiff).toFixed(1)}%`}
              </div>
              <div style={styles.summaryLabel}>Verified Freq Diff</div>
            </div>
          </div>

          {/* SESSION DISTRIBUTION BAR — the review-screen home of the data the
              in-hand HUD gave up when six strips collapsed into one rail. Same
              vocabulary as the rail: one segmented track, fill IS the quality
              breakdown, best->blunder in the fixed classification colors. Same
              accumulator too (deriveClassificationCounts over handHistory), so
              this bar and the rail can never tell different stories. */}
          {movesGraded > 0 && (() => {
            const segments = [
              { key: 'best', label: 'Best', color: '#22c55e', count: classificationCounts.best || 0 },
              { key: 'correct', label: 'Correct', color: '#00d4ff', count: classificationCounts.correct || 0 },
              { key: 'inaccuracy', label: 'Inaccuracy', color: '#fbbf24', count: classificationCounts.inaccuracy || 0 },
              { key: 'wrong', label: 'Wrong', color: '#f97316', count: classificationCounts.wrong || 0 },
              { key: 'blunder', label: 'Blunder', color: '#ef4444', count: classificationCounts.blunder || 0 },
            ];
            const lit = segments.filter((seg) => seg.count > 0);
            return (
              <div
                style={{
                  marginBottom: 16,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    height: 14,
                    borderRadius: 7,
                    overflow: 'hidden',
                    background: 'rgba(255,255,255,0.04)',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
                  }}
                >
                  {lit.map((seg) => (
                    <motion.div
                      key={seg.key}
                      initial={{ flexGrow: 0 }}
                      animate={{ flexGrow: seg.count }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      title={`${seg.label}: ${seg.count}`}
                      style={{
                        flexBasis: 0,
                        height: '100%',
                        background: seg.color,
                        boxShadow: `0 0 8px ${seg.color}55`,
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  {segments.map((seg) => (
                    <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: seg.count > 0 ? seg.color : 'rgba(255,255,255,0.15)',
                          display: 'inline-block',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: seg.count > 0 ? '#cbd5e1' : '#475569',
                          letterSpacing: 0.5,
                        }}
                      >
                        {seg.label}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: seg.count > 0 ? seg.color : '#475569',
                          fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                        }}
                      >
                        {seg.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* TAB NAVIGATION */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              marginBottom: 16,
              borderRadius: 8,
              overflowX: 'auto',
              overflowY: 'hidden',
              flexWrap: 'nowrap',
              WebkitOverflowScrolling: 'touch',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {[
              /* REVIEW NAV CONSOLIDATION (2026-08-08): this registry held 278
                 tabs. 7 rendered session content; 271 rendered a single generic
                 study-tool component with no session data (one, 'analytics',
                 was an explicit sample-data placeholder). Their imports and
                 review branches have been removed; only this closed seven-tab
                 review graph remains. */
              { id: 'overview', label: 'Overview' },
              { id: 'mistakes', label: 'Mistakes' },
              { id: 'positions', label: 'Positions & Streets' },
              { id: 'concepts', label: 'Concepts' },
              { id: 'hands', label: 'Hands' },
              { id: 'solver', label: 'Solver' },
              { id: 'analysis', label: 'Deep Analysis' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setReviewTab(tab.id)}
                style={{
                  flex: '0 0 auto',
                  whiteSpace: 'nowrap',
                  padding: '10px 12px',
                  background: reviewTab === tab.id ? 'rgba(0, 212, 255, 0.15)' : 'rgba(0,0,0,0.2)',
                  color: reviewTab === tab.id ? '#00d4ff' : '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  borderBottom:
                    reviewTab === tab.id ? '2px solid #00d4ff' : '2px solid transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ●●● TAB: OVERVIEW ●●● */}
          {reviewTab === 'overview' && (
            <>
              {/* ●●● ENDGAME REPORT — Beautiful session recap ●●● */}
              {(() => {
                try {
                  const eg = getEndgameReport();
                  if (!eg) return null;
                  const gradeColors = {
                    S: '#f59e0b',
                    A: '#22c55e',
                    B: '#4ade80',
                    C: '#06b6d4',
                    D: '#fbbf24',
                    F: '#ef4444',
                  };
                  const gColor = gradeColors[eg.grade] || '#94a3b8';
                  return (
                    <div
                      style={{
                        marginBottom: 16,
                        padding: '18px',
                        borderRadius: 14,
                        background: `linear-gradient(135deg, rgba(0,0,0,0.4) 0%, ${gColor}08 100%)`,
                        border: `2px solid ${gColor}30`,
                      }}
                    >
                      <div style={{ textAlign: 'center', marginBottom: 12 }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: gColor,
                            textTransform: 'uppercase',
                            letterSpacing: 2,
                          }}
                        >
                          Session Complete
                        </div>
                        <div
                          style={{
                            fontSize: 42,
                            fontWeight: 900,
                            color: gColor,
                            fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                            lineHeight: 1,
                            marginTop: 4,
                          }}
                        >
                          {eg.grade}
                        </div>
                        {eg.title && (
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#e2e8f0',
                              marginTop: 4,
                            }}
                          >
                            {eg.title}
                          </div>
                        )}
                      </div>
                      {eg.highlights && eg.highlights.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: '#4ade80',
                              textTransform: 'uppercase',
                              letterSpacing: 1,
                              marginBottom: 4,
                            }}
                          >
                            Highlights
                          </div>
                          {eg.highlights.slice(0, 3).map((h, i) => (
                            <div
                              key={i}
                              style={{ fontSize: 10, color: '#e2e8f0', padding: '2px 0' }}
                            >
                              ✓ {h}
                            </div>
                          ))}
                        </div>
                      )}
                      {eg.improvementAreas && eg.improvementAreas.length > 0 && (
                        <div>
                          <div
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: '#fbbf24',
                              textTransform: 'uppercase',
                              letterSpacing: 1,
                              marginBottom: 4,
                            }}
                          >
                            Focus Areas
                          </div>
                          {eg.improvementAreas.slice(0, 3).map((a, i) => (
                            <div
                              key={i}
                              style={{ fontSize: 10, color: '#94a3b8', padding: '2px 0' }}
                            >
                              → {a}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                } catch (_) {
                  return null;
                }
              })()}

              {/* ●●● Session Summary Card (getSessionSummaryCard) ●●● */}
              {(() => {
                try {
                  const ssc = getSessionSummaryCard();
                  if (!ssc || !ssc.title) return null;
                  return (
                    <div
                      style={{
                        marginBottom: 12,
                        padding: '12px 16px',
                        borderRadius: 12,
                        background: 'rgba(139,92,246,0.06)',
                        border: '1px solid rgba(139,92,246,0.15)',
                      }}
                    >
                      <div
                        style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', marginBottom: 6 }}
                      >
                        {ssc.title}
                      </div>
                      {ssc.summary && (
                        <div
                          style={{
                            fontSize: 11,
                            color: '#cbd5e1',
                            lineHeight: 1.5,
                            marginBottom: 6,
                          }}
                        >
                          {ssc.summary}
                        </div>
                      )}
                      {ssc.keyStats && ssc.keyStats.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {ssc.keyStats.slice(0, 4).map((s, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: 'rgba(0,0,0,0.2)',
                                border: '1px solid rgba(255,255,255,0.06)',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: '#e2e8f0',
                                  fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                                }}
                              >
                                {s.value}
                              </div>
                              <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>
                                {s.label}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                } catch (_) {
                  return null;
                }
              })()}

              {/* ●●● Comprehensive Report — Next Session Prep ●●● */}
              {(() => {
                try {
                  const csr = getComprehensiveSessionReport();
                  if (!csr || !csr.nextSessionPlan) return null;
                  const plan = csr.nextSessionPlan;
                  return (
                    <div
                      style={{
                        marginBottom: 12,
                        padding: '12px 16px',
                        borderRadius: 12,
                        background: 'rgba(6,182,212,0.05)',
                        border: '1px solid rgba(6,182,212,0.15)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: '#06b6d4',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          marginBottom: 6,
                        }}
                      >
                        Next Session Plan
                      </div>
                      {plan.focus && (
                        <div
                          style={{
                            fontSize: 11,
                            color: '#e2e8f0',
                            fontWeight: 600,
                            marginBottom: 4,
                          }}
                        >
                          Focus: {plan.focus}
                        </div>
                      )}
                      {plan.drills &&
                        plan.drills.length > 0 &&
                        plan.drills.slice(0, 3).map((d, i) => (
                          <div key={i} style={{ fontSize: 10, color: '#94a3b8', padding: '1px 0' }}>
                            • {d}
                          </div>
                        ))}
                    </div>
                  );
                } catch (_) {
                  return null;
                }
              })()}

              {/* ●●● Phase 54: Session Performance Summary ●●● */}
              <div
                style={{
                  marginBottom: 16,
                  padding: '14px 16px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {/* Key metrics row */}
                <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 12 }}>
                  {[
                    {
                      label: 'GTOW Score',
                      value: gtowScore,
                      color: getArenaScoreColor(gtowScore),
                      suffix: '',
                    },
                    {
                      label: 'Accuracy',
                      value: Math.round(gtowAccuracy),
                      color:
                        gtowAccuracy >= 80 ? '#22c55e' : gtowAccuracy >= 60 ? '#fbbf24' : '#ef4444',
                      suffix: '%',
                    },
                    {
                      label: 'Measured EV Loss',
                      value:
                        measuredEVReviewHistory.length > 0
                          ? measuredEVTotal.toFixed(1)
                          : '—',
                      color:
                        measuredEVReviewHistory.length === 0
                          ? '#64748b'
                          : measuredEVTotal > 5
                            ? '#ef4444'
                            : measuredEVTotal > 2
                              ? '#fbbf24'
                              : '#22c55e',
                      suffix: measuredEVReviewHistory.length > 0 ? ' BB' : '',
                      prefix: measuredEVReviewHistory.length > 0 ? '-' : '',
                    },
                    {
                      label: 'Best Streak',
                      value: bestGTOWStreak || 0,
                      color: '#00d4ff',
                      suffix: '',
                    },
                  ].map((stat, i) => (
                    <div key={i} style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          color: stat.color,
                          fontFamily: "var(--font-rajdhani), 'Rajdhani', 'Inter', monospace",
                          lineHeight: 1.2,
                        }}
                      >
                        {stat.prefix || ''}
                        {stat.value}
                        {stat.suffix}
                      </div>
                      <div
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          color: '#64748b',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Position accuracy breakdown */}
                {positionAccuracy && Object.keys(positionAccuracy || {}).length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}
                    >
                      By Position
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']
                        .filter((p) => positionAccuracy[p])
                        .map((pos) => {
                          const data = positionAccuracy[pos];
                          const accColor =
                            data.accuracy >= 80
                              ? '#22c55e'
                              : data.accuracy >= 60
                                ? '#fbbf24'
                                : '#ef4444';
                          const isWeakest = weakestPosition === pos;
                          return (
                            <div
                              key={pos}
                              style={{
                                flex: 1,
                                minWidth: 45,
                                textAlign: 'center',
                                padding: '4px 6px',
                                borderRadius: 6,
                                background: isWeakest ? `${accColor}15` : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${isWeakest ? accColor + '44' : 'rgba(255,255,255,0.06)'}`,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  color: '#94a3b8',
                                  marginBottom: 2,
                                }}
                              >
                                {pos}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: accColor,
                                  fontFamily: "'Inter', monospace",
                                }}
                              >
                                {data.accuracy}%
                              </div>
                              <div style={{ fontSize: 7, color: '#475569' }}>
                                {data.correct}/{data.total}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Street accuracy breakdown */}
                {streetAccuracy && Object.keys(streetAccuracy || {}).length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}
                    >
                      By Street
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {['preflop', 'flop', 'turn', 'river']
                        .filter((s) => streetAccuracy[s])
                        .map((st) => {
                          const data = streetAccuracy[st];
                          const streetColors = {
                            preflop: '#a78bfa',
                            flop: '#4ade80',
                            turn: '#fb923c',
                            river: '#f87171',
                          };
                          const accColor =
                            data.accuracy >= 80
                              ? '#22c55e'
                              : data.accuracy >= 60
                                ? '#fbbf24'
                                : '#ef4444';
                          return (
                            <div
                              key={st}
                              style={{
                                flex: 1,
                                textAlign: 'center',
                                padding: '4px 6px',
                                borderRadius: 6,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  color: streetColors[st],
                                  marginBottom: 2,
                                  textTransform: 'capitalize',
                                }}
                              >
                                {st}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: accColor,
                                  fontFamily: "'Inter', monospace",
                                }}
                              >
                                {data.accuracy}%
                              </div>
                              <div style={{ fontSize: 7, color: '#475569' }}>
                                {data.correct}/{data.total}
                              </div>
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
                    const highLeaks = mistakePatterns.filter((p) => p.severity === 'high');
                    const medLeaks = mistakePatterns.filter(
                      (p) => p.severity === 'medium' && p.count >= 3
                    );
                    highLeaks.forEach((leak) => {
                      if (leak.type === 'fold_too_much')
                        tips.push({
                          priority: 1,
                          text: "You're folding too often. Practice defending wider - use pot odds to decide close calls.",
                          color: '#ef4444',
                        });
                      else if (leak.type === 'call_too_much')
                        tips.push({
                          priority: 1,
                          text: 'Over-calling is costing you. Tighten up against aggression - not every pair is worth a call.',
                          color: '#ef4444',
                        });
                      else if (leak.type === 'bet_too_small')
                        tips.push({
                          priority: 2,
                          text: 'Your bet sizes are too small. Use larger bets with strong hands to build pots and deny equity.',
                          color: '#f97316',
                        });
                      else if (leak.type === 'bet_too_big')
                        tips.push({
                          priority: 2,
                          text: "You're overbetting too often. Use smaller sizes with merged ranges on dry boards.",
                          color: '#f97316',
                        });
                      else if (leak.type === 'missed_value')
                        tips.push({
                          priority: 1,
                          text: "You're missing value bets. When you have a strong hand, bet for value - don't be afraid to build the pot.",
                          color: '#ef4444',
                        });
                      else if (leak.type === 'bluff_too_much')
                        tips.push({
                          priority: 1,
                          text: 'Over-bluffing is a leak. Choose bluff candidates with blockers and backdoor equity, not random air.',
                          color: '#ef4444',
                        });
                      else
                        tips.push({
                          priority: 2,
                          text:
                            leak.tip ||
                            `Fix your ${leak.type.replace(/_/g, ' ')} leak (${leak.count} times this session).`,
                          color: '#f97316',
                        });
                    });
                    medLeaks.forEach((leak) => {
                      tips.push({
                        priority: 3,
                        text:
                          leak.tip ||
                          `Watch for ${leak.type.replace(/_/g, ' ')} patterns (${leak.count}x).`,
                        color: '#fbbf24',
                      });
                    });
                  }

                  // Position-based tips
                  if (weakestPosition && positionAccuracy) {
                    const weakAcc = positionAccuracy[weakestPosition]?.accuracy;
                    if (weakAcc !== undefined && weakAcc < 50) {
                      tips.push({
                        priority: 2,
                        text: `Your ${weakestPosition} play is weak (${Math.round(weakAcc)}% accuracy). Study ${weakestPosition} ranges and common spots from this seat.`,
                        color: '#f97316',
                      });
                    }
                  }

                  // Street-based tips
                  if (streetAccuracy) {
                    const streets = Object.entries(streetAccuracy || {}).filter(
                      ([, v]) => (v?.accuracy ?? 100) < 50
                    );
                    streets.forEach(([st, v]) => {
                      const acc = v.accuracy;
                      if (st === 'preflop')
                        tips.push({
                          priority: 2,
                          text: `Preflop accuracy is low (${Math.round(acc)}%). Drill opening ranges and 3-bet/call frequencies.`,
                          color: '#f97316',
                        });
                      else if (st === 'river')
                        tips.push({
                          priority: 2,
                          text: `River decisions need work (${Math.round(acc)}%). Focus on bluff-catching frequencies and value bet sizing.`,
                          color: '#f97316',
                        });
                      else
                        tips.push({
                          priority: 3,
                          text: `${st.charAt(0).toUpperCase() + st.slice(1)} accuracy is ${Math.round(acc)}% - review board texture analysis for this street.`,
                          color: '#fbbf24',
                        });
                    });
                  }

                  // Hand type tips
                  if (handTypePerformance && handTypePerformance.length > 0) {
                    const worstType = handTypePerformance[0]; // sorted worst-first
                    if (worstType.accuracy < 40 && worstType.total >= 3) {
                      tips.push({
                        priority: 1,
                        text: `Your ${worstType.type} play is a major leak (${worstType.accuracy}% accuracy). Focus practice on these hands.`,
                        color: '#ef4444',
                      });
                    }
                  }

                  // EV-based tips require explicitly measured solver evidence.
                  if (measuredEVPerDecision !== null && measuredEVPerDecision > 0.3) {
                    tips.push({
                      priority: 1,
                      text: `Measured EV loss of ${measuredEVPerDecision.toFixed(2)}bb/decision is high. Focus on avoiding blunders - those cost the most.`,
                      color: '#ef4444',
                    });
                  } else if (measuredEVPerDecision !== null && measuredEVPerDecision > 0.1) {
                    tips.push({
                      priority: 3,
                      text: `Your ${measuredEVPerDecision.toFixed(2)}bb/decision measured EV loss is moderate. Refine marginal spots to push into the green zone.`,
                      color: '#fbbf24',
                    });
                  }

                  // Sort by priority and take top 3
                  const topTips = tips.sort((a, b) => a.priority - b.priority).slice(0, 3);

                  if (topTips.length === 0) return null;

                  return (
                    <div style={{ marginTop: 8, marginBottom: 4 }}>
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: '#a78bfa',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          marginBottom: 4,
                        }}
                      >
                        Coaching Tips
                      </div>
                      {topTips.map((tip, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: 9,
                            color: tip.color,
                            lineHeight: 1.5,
                            padding: '3px 6px',
                            marginBottom: 2,
                            background: `${tip.color}08`,
                            borderRadius: 4,
                            borderLeft: `2px solid ${tip.color}44`,
                          }}
                        >
                          {tip.text}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Phase 59: Hand type performance */}
                {handTypePerformance && handTypePerformance.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}
                    >
                      By Hand Type
                    </div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {handTypePerformance.slice(0, 6).map((ht) => {
                        const accColor =
                          ht.accuracy >= 80 ? '#22c55e' : ht.accuracy >= 60 ? '#fbbf24' : '#ef4444';
                        const isWorst = handTypePerformance[0] === ht && ht.accuracy < 60;
                        return (
                          <div
                            key={ht.type}
                            style={{
                              flex: '1 1 calc(33% - 4px)',
                              minWidth: 80,
                              textAlign: 'center',
                              padding: '3px 4px',
                              borderRadius: 5,
                              background: isWorst ? `${accColor}12` : 'rgba(255,255,255,0.03)',
                              border: `1px solid ${isWorst ? accColor + '33' : 'rgba(255,255,255,0.06)'}`,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 7,
                                fontWeight: 600,
                                color: '#94a3b8',
                                textTransform: 'capitalize',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {ht.type}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: accColor,
                                fontFamily: "'Inter', monospace",
                              }}
                            >
                              {ht.accuracy}%
                            </div>
                            <div style={{ fontSize: 7, color: '#475569' }}>
                              {ht.correct}/{ht.total} graded decisions
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <VerifiedToolGateway
                eyebrow="Authenticated Practice Planning"
                title="Build Your Next Session"
                description="Open the session dashboard for recommendations derived from sealed Training attempts. The Arena does not infer EV leaks from unmeasured answer rows or silently turn them into solver-backed drills."
                href="/hub/training/session-dashboard"
                action="Open Session Dashboard"
                source="Sealed Non-Practice Attempts"
              />

              {/* ●●● PHASE 17: Deterministic graded-answer debrief ●●● */}
              {(isLoadingCoaching || aiCoaching) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginBottom: 16,
                    padding: '14px 16px',
                    background:
                      'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(0,212,255,0.04) 100%)',
                    border: '1px solid rgba(139,92,246,0.2)',
                    borderRadius: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#a78bfa',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>◇</span> Session Answer Debrief
                  </div>

                  {isLoadingCoaching && !aiCoaching && (
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      style={{
                        color: '#64748b',
                        fontSize: 11,
                        textAlign: 'center',
                        padding: '8px 0',
                      }}
                    >
                      Summarizing Graded Answers...
                    </motion.div>
                  )}

                  {aiCoaching && (
                    <>
                      {/* Headline */}
                      <div
                        style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}
                      >
                        {aiCoaching.headline || 'Session Complete'}
                      </div>

                      {/* Detailed feedback */}
                      <div
                        style={{
                          fontSize: 11,
                          color: '#94a3b8',
                          lineHeight: 1.6,
                          marginBottom: 10,
                        }}
                      >
                        {aiCoaching.detailedFeedback}
                      </div>

                      {/* Strengths + Areas to improve */}
                      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                        {aiCoaching.strengths?.length > 0 && (
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: '#22c55e',
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                marginBottom: 4,
                              }}
                            >
                              Strengths
                            </div>
                            {aiCoaching.strengths.map((s, i) => (
                              <div
                                key={i}
                                style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}
                              >
                                • {s}
                              </div>
                            ))}
                          </div>
                        )}
                        {aiCoaching.areasToImprove?.length > 0 && (
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: '#f97316',
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                marginBottom: 4,
                              }}
                            >
                              Focus Areas
                            </div>
                            {aiCoaching.areasToImprove.map((a, i) => (
                              <div
                                key={i}
                                style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}
                              >
                                • {a}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Recommended drill */}
                      {aiCoaching.recommendedDrill && (
                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'rgba(0,212,255,0.06)',
                            border: '1px solid rgba(0,212,255,0.15)',
                            marginBottom: 8,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#00d4ff',
                              marginBottom: 2,
                            }}
                          >
                            Recommended: {aiCoaching.recommendedDrill.name}
                          </div>
                          <div style={{ fontSize: 9, color: '#64748b' }}>
                            {aiCoaching.recommendedDrill.reason}
                          </div>
                        </div>
                      )}

                      {/* Motivational quote */}
                      {aiCoaching.motivationalQuote && (
                        <div
                          style={{
                            fontSize: 10,
                            color: '#475569',
                            fontStyle: 'italic',
                            textAlign: 'center',
                            marginTop: 4,
                          }}
                        >
                          {aiCoaching.motivationalQuote}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}

              <div className="sp-arena-review__classification" style={styles.classBreakdown}>
                <div style={styles.sectionTitle}>Move Breakdown</div>
                <div style={styles.classGrid}>
                  {Object.entries(CLASSIFICATION_CONFIG || {}).map(([key, config]) => (
                    <div key={key} style={styles.classItem}>
                      <div
                        style={{
                          ...styles.classCount,
                          color: config.color,
                        }}
                      >
                        {classificationCounts[key] || 0}
                        {movesGraded > 0 && (
                          <span
                            style={{ fontSize: 9, fontWeight: 600, opacity: 0.6, marginLeft: 2 }}
                          >
                            {/* divide by graded MOVES, not questions — a
                                multi-street session grades several moves per
                                question and these counts are per-move */}
                            ({Math.round(((classificationCounts[key] || 0) / movesGraded) * 100)}
                            %)
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          ...styles.classBadge,
                          background: config.bgColor,
                          borderColor: config.borderColor,
                          color: config.color,
                        }}
                      >
                        <ClassificationSVGIcon icon={config.icon} size={14} color={config.color} />{' '}
                        {config.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* F15: CLASSIFICATION DONUT CHART */}
              <ClassificationDonut handHistory={handHistory} gtowScore={gtowScore} />

              {/* Phase 40: MISTAKE PATTERN COACHING */}
              {mistakePatterns && mistakePatterns.length > 0 && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '12px 14px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 'bold',
                      color: '#f59e0b',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                    }}
                  >
                    Leak Detection
                  </div>
                  {mistakePatterns.slice(0, 3).map((pattern, idx) => (
                    <div
                      key={idx}
                      style={{
                        marginBottom: idx < Math.min(mistakePatterns.length, 3) - 1 ? 10 : 0,
                        padding: '8px 10px',
                        background:
                          pattern.severity === 'high'
                            ? 'rgba(239,68,68,0.08)'
                            : 'rgba(251,191,36,0.06)',
                        borderRadius: 8,
                        border: `1px solid ${pattern.severity === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.15)'}`,
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}
                      >
                        <span style={{ fontSize: 14 }}>{pattern.icon}</span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            textTransform: 'uppercase',
                            color: pattern.severity === 'high' ? '#ef4444' : '#fbbf24',
                          }}
                        >
                          {pattern.type.replace('_', ' ')} ({pattern.count}x)
                        </span>
                        {pattern.severity === 'high' && (
                          <span
                            style={{
                              fontSize: 8,
                              padding: '1px 4px',
                              borderRadius: 3,
                              background: 'rgba(239,68,68,0.2)',
                              color: '#f87171',
                              fontWeight: 700,
                            }}
                          >
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

              {/* MOST COSTLY SPOTS — the hands that paid for the session's EV
                  loss, largest first, straight from the one handHistory
                  accumulator via deriveTopLeaks (the same selector the
                  session-analytics harness asserts). Each row: where you were,
                  what you did, what the solver does, what it cost. */}
              {(() => {
                const leaks = deriveTopLeaks(measuredEVReviewHistory, 5);
                if (leaks.length === 0) return null;
                const classColors = {
                  inaccuracy: '#fbbf24',
                  wrong: '#f97316',
                  blunder: '#ef4444',
                };
                const streetColors = {
                  preflop: '#a78bfa',
                  flop: '#4ade80',
                  turn: '#fb923c',
                  river: '#f87171',
                };
                return (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: '12px 14px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: 10,
                      border: '1px solid rgba(239,68,68,0.12)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 'bold',
                          color: '#ef4444',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        Most Costly Spots
                      </div>
                      <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>
                        {measuredEVReviewHistory.length > 0
                          ? `-${measuredEVTotal.toFixed(1)} BB measured total`
                          : 'Measured EV unavailable'}
                      </div>
                    </div>
                    {leaks.map((leak, idx) => {
                      const cColor = classColors[leak.classification] || '#ef4444';
                      return (
                        <div
                          key={`${leak.handNumber}-${idx}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '7px 8px',
                            marginBottom: idx < leaks.length - 1 ? 4 : 0,
                            borderRadius: 8,
                            background: 'rgba(255,255,255,0.03)',
                            borderLeft: `3px solid ${cColor}`,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              color: '#475569',
                              fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                              minWidth: 18,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: '#94a3b8',
                              minWidth: 30,
                            }}
                          >
                            {leak.heroPosition || '-'}
                          </span>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: 'capitalize',
                              color: streetColors[(leak.street || '').toLowerCase()] || '#64748b',
                              minWidth: 42,
                            }}
                          >
                            {leak.street || '-'}
                          </span>
                          <span
                            style={{
                              flex: 1,
                              fontSize: 10,
                              color: '#cbd5e1',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ color: cColor, fontWeight: 700 }}>
                              ✕ {leak.action || '?'}
                            </span>
                            <span style={{ color: '#475569' }}> → </span>
                            <span style={{ color: '#22c55e', fontWeight: 700 }}>
                              ✓ {leak.correctAction || '?'}
                            </span>
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: '#ef4444',
                              fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                            }}
                          >
                            -{leak.evLoss.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* F14: ACCURACY BY POSITION CHART */}
              <AccuracyByPositionChart handHistory={handHistory} />

              {/* Exact EV evidence belongs in authenticated hand history. */}
              <VerifiedToolGateway
                eyebrow="Authenticated Decision Evidence"
                title="Review Measured EV"
                description="Open Replay Theater to inspect EV only where the signed answer evidence recorded a measured solver value. Unmeasured decisions are never displayed as zero-loss solves."
                href="/hub/training/replay-theater"
                action="Open Replay Theater"
                source="Authenticated Hand History"
              />

              {/* F5: MIXED STRATEGY ADHERENCE */}
              {mixedStrategyScore !== null && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '10px 14px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 'bold',
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 6,
                    }}
                  >
                    Action Variety
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: '100%',
                        height: 6,
                        background: '#1e293b',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${mixedStrategyScore}%` }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                        style={{
                          height: '100%',
                          borderRadius: 3,
                          background:
                            mixedStrategyScore >= 50
                              ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                              : mixedStrategyScore >= 30
                                ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                                : 'linear-gradient(90deg, #ef4444, #dc2626)',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 'bold',
                        minWidth: 40,
                        color:
                          mixedStrategyScore >= 50
                            ? '#22c55e'
                            : mixedStrategyScore >= 30
                              ? '#fbbf24'
                              : '#ef4444',
                      }}
                    >
                      {mixedStrategyScore}%
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: '#64748b', marginTop: 4 }}>
                    {mixedStrategyScore >= 60
                      ? 'Broad action mix in this session'
                      : mixedStrategyScore >= 35
                        ? 'Moderate variety across recorded actions'
                        : 'One action dominated this session'}
                    {' · Descriptive only; not solver-frequency adherence.'}
                  </div>
                </div>
              )}

              {/* Phase 24: Authenticated Mistake Review + Retrain */}
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <motion.a
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  href="/hub/training/replay-theater"
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
                    textDecoration: 'none',
                  }}
                >
                  Review Recorded Mistakes ({sessionMistakes})
                </motion.a>

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

                {/* ●●● PHASE 15+18: Spaced Repetition Review Button ●●● */}
                {reviewDueCount > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      // Restart level to practice — the spaced repetition system
                      // tracks which spots need review, and future sessions will
                      // surface similar spot types via smart practice targeting
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

              {/* Per-street EV is rendered only from measured solver evidence. */}
              {measuredEVReviewHistory.length > 0 &&
                (() => {
                  const streetEV = { flop: 0, turn: 0, river: 0, preflop: 0 };
                  const streetDecisions = { flop: 0, turn: 0, river: 0, preflop: 0 };
                  measuredEVReviewHistory.forEach((h) => {
                    // No street recorded means the decision cannot be
                    // attributed. Defaulting to 'flop' -- which this did --
                    // charged every preflop mistake to the flop bar.
                    const s = streetOf(h);
                    if (!s || !Object.prototype.hasOwnProperty.call(streetEV, s)) return;
                    streetEV[s] =
                      (streetEV[s] || 0) + Number(handFieldOf(h, 'evLoss'));
                    streetDecisions[s] = (streetDecisions[s] || 0) + 1;
                  });
                  const maxEV = Math.max(0.01, ...Object.values(streetEV || {}));
                  const streetColors = {
                    preflop: '#8b5cf6',
                    flop: '#22c55e',
                    turn: '#fbbf24',
                    river: '#ef4444',
                  };

                  return (
                    <div
                      style={{
                        marginBottom: 16,
                        padding: '12px 14px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 'bold',
                          color: '#94a3b8',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          marginBottom: 8,
                        }}
                      >
                        EV Loss By Street
                      </div>
                      {['preflop', 'flop', 'turn', 'river'].map((s) => (
                        <div
                          key={s}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
                        >
                          <span
                            style={{
                              width: 55,
                              fontSize: 10,
                              fontWeight: 600,
                              color: streetColors[s],
                              textTransform: 'uppercase',
                            }}
                          >
                            {s}
                          </span>
                          <div
                            style={{
                              flex: 1,
                              height: 6,
                              background: '#1e293b',
                              borderRadius: 3,
                              overflow: 'hidden',
                            }}
                          >
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{
                                width:
                                  streetDecisions[s] > 0
                                    ? `${(streetEV[s] / maxEV) * 100}%`
                                    : '0%',
                              }}
                              transition={{ duration: 0.6, delay: 0.2 }}
                              style={{
                                height: '100%',
                                background: streetColors[s],
                                borderRadius: 3,
                              }}
                            />
                          </div>
                          <span
                            style={{
                              width: 45,
                              fontSize: 10,
                              fontWeight: 'bold',
                              color:
                                streetDecisions[s] === 0
                                  ? '#64748b'
                                  : streetEV[s] > 0
                                    ? '#ef4444'
                                    : '#22c55e',
                              textAlign: 'right',
                            }}
                          >
                            {streetDecisions[s] > 0 ? `-${streetEV[s].toFixed(1)}` : '—'}
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
              {measuredEVReviewHistory.length >= 5 &&
                (() => {
                  const spotStats = {};
                  measuredEVReviewHistory.forEach((h) => {
                    const pos = heroPositionOf(h);
                    const st = streetOf(h) || 'preflop';
                    const key = `${pos} on ${st}`;
                    if (!spotStats[key]) spotStats[key] = { evLoss: 0, mistakes: 0, total: 0 };
                    spotStats[key].total++;
                    spotStats[key].evLoss += Number(handFieldOf(h, 'evLoss'));
                    if (
                      h.classification &&
                      h.classification !== 'best' &&
                      h.classification !== 'correct'
                    )
                      spotStats[key].mistakes++;
                  });
                  const worst = Object.entries(spotStats || {})
                    .filter(([, v]) => v.total >= 2)
                    .sort(([, a], [, b]) => b.evLoss - a.evLoss)[0];
                  if (!worst || worst[1].evLoss <= 0) return null;
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        marginBottom: 16,
                        padding: '12px 16px',
                        background:
                          'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#ef4444',
                          letterSpacing: 0.5,
                          marginBottom: 4,
                        }}
                      >
                        WEAKEST SPOT
                      </div>
                      <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                        You Leaked {worst[1].evLoss.toFixed(1)} BB on{' '}
                        <span style={{ color: '#00d4ff' }}>{worst[0]}</span> Decisions
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                        {worst[1].mistakes} mistake{worst[1].mistakes !== 1 ? 's' : ''} Out of{' '}
                        {worst[1].total} hand{worst[1].total !== 1 ? 's' : ''}
                      </div>
                    </motion.div>
                  );
                })()}

              {/* ●●● PHASE 19: Share Results (image card + feed) ●●● */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowShareCard(true)}
                  style={{
                    flex: 2,
                    padding: '10px 0',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    letterSpacing: 0.5,
                  }}
                >
                  Share Results Card
                </motion.button>
                <motion.button
                  disabled
                  title="Feed Sharing Reopens After Server-Verified Settlement Is Certified"
                  aria-label="Posting Training results to the feed is unavailable"
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 10,
                    border: '1px solid rgba(0,212,255,0.25)',
                    background: 'rgba(0,212,255,0.06)',
                    color: '#00d4ff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'not-allowed',
                    opacity: 0.6,
                  }}
                >
                  Feed Posting Unavailable
                </motion.button>
              </div>

              <VerifiedToolGateway
                eyebrow="Authenticated Hand Review"
                title="Replay Recorded Decisions"
                description="Open Replay Theater for persisted hand and answer evidence. The Arena never treats an unmeasured decision as a perfect zero-EV solve or invents a GTO replay overlay."
                href="/hub/training/replay-theater"
                action="Open Replay Theater"
                source="Authenticated Hand History"
              />
            </>
          )}

          {reviewTab === 'mistakes' && (
            <VerifiedToolGateway
              eyebrow="Authenticated Mistake Evidence"
              title="Review Recorded Mistakes"
              description="Open Replay Theater for server-revealed answers and measured solver evidence. Unavailable legacy cluster methods never render a false clean-session result or zero-EV hand."
              href="/hub/training/replay-theater"
              action="Open Replay Theater"
              source="Authenticated Hand History"
            />
          )}

          {reviewTab === 'positions' && (
            <VerifiedToolGateway
              eyebrow="Authenticated Position Evidence"
              title="Review Position And Street Results"
              description="Open the session dashboard for sealed cross-session breakdowns. The Arena does not label an unavailable legacy heatmap as zero-loss play or invent position grades."
              href="/hub/training/session-dashboard"
              action="Open Session Dashboard"
              source="Sealed Non-Practice Attempts"
            />
          )}

          {reviewTab === 'concepts' && (
            <VerifiedToolGateway
              eyebrow="Authenticated Mastery Evidence"
              title="Review Skill Progress"
              description="Open Progress for mastery derived from sealed Training attempts. The Arena does not manufacture concept mastery from an unavailable browser insight method."
              href="/hub/training/progress"
              action="Open Progress"
              source="Sealed Training Attempts"
            />
          )}

          {/* ●●● TAB: HANDS ●●● */}
          {reviewTab === 'hands' && (
            <VerifiedToolGateway
              eyebrow="Authenticated Hand Review"
              title="Replay Recorded Decisions"
              description="Open Replay Theater for the exact hand and answer evidence preserved by authenticated Training sessions. The Arena never derives equity, future runout EV, blocker scores, or game-tree branches from a single frequency matrix."
              href="/hub/training/replay-theater"
              action="Open Replay Theater"
              source="Authenticated Hand History"
            />
          )}

          {/* ●●● TAB: SOLVER COMPARISON ●●● */}
          {reviewTab === 'solver' && (
            <VerifiedToolGateway
              eyebrow="Verified Solver Workspace"
              title="Inspect Solver-Backed Solutions"
              description="Open the solutions browser for versioned corpus results and explicit data provenance. The session review does not extrapolate missing street actions, opponent responses, range equity, or game-tree branches."
              href="/hub/training/solutions"
              action="Open Solutions Browser"
              source="Training Corpus And Solver APIs"
            />
          )}

          {/* TAB: ANALYSIS — measured and authenticated evidence only. */}
          {reviewTab === 'analysis' && (
            <>
              <VerifiedToolGateway
                eyebrow="Verified Solver Workspace"
                title="Inspect Frequency Evidence"
                description="Open the Solutions Browser for versioned, spot-specific solver frequencies. The Arena does not pool unrelated decisions into a fabricated frequency-adherence grade."
                href="/hub/training/solutions"
                action="Open Solutions Browser"
                source="Audited PioSOLVER V2 Corpus"
              />

              <EVGraph handHistory={measuredEVGraphHistory} title="Measured EV Loss By Street" />

              <VerifiedToolGateway
                eyebrow="Authenticated Performance History"
                title="Review Verified Session Trends"
                description="Open the session dashboard for cross-session results loaded from authenticated Training history. This current-session drawer never relabels one run as lifetime data or treats the modal correct action as a solver frequency distribution."
                href="/hub/training/session-dashboard"
                action="Open Session Dashboard"
                source="Sealed Non-Practice Attempts"
              />

              {userId && <StudyStreakMapAuto userId={userId} gameId={gameId} />}
              <SessionHistoryList gameId={gameId} userId={userId} limit={5} />
              <LeaderboardPanel userId={userId} gameId={gameId} />
            </>
          )}

          {/* END VISIBLE REVIEW TABS */}

          {/* ACTION BUTTONS */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginBottom: 20,
              flexDirection: levelPassed ? 'row' : 'column',
            }}
          >
            {levelPassed && currentLevel < (totalLevels || 12) && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  startNextLevel();
                }}
                style={{
                  flex: 1,
                  padding: '16px 24px',
                  fontSize: 15,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                  border: 'none',
                  borderRadius: 14,
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(34, 197, 94, 0.3)',
                  letterSpacing: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>{'\u2192'}</span>
                Next Level ({currentLevel + 1})
              </motion.button>
            )}
            {!levelPassed && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  retryLevel();
                }}
                style={{
                  padding: '16px 24px',
                  fontSize: 15,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  border: 'none',
                  borderRadius: 14,
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(249, 115, 22, 0.3)',
                  letterSpacing: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>{'\u21BB'}</span>
                Retry Level {currentLevel}
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onComplete?.({
                  gameId,
                  accuracy,
                  questionsAnswered: totalQuestions,
                  questionsCorrect: correctCount,
                  bestStreak,
                  levelPassed,
                  level: currentLevel,
                  gtowScore,
                  totalEVLoss:
                    measuredEVReviewHistory.length > 0 ? measuredEVTotal : null,
                  measuredEVDecisions: measuredEVReviewHistory.length,
                  sessionMistakes,
                });
                onExit?.();
              }}
              style={{
                flex: levelPassed ? 1 : undefined,
                padding: '16px 24px',
                fontSize: 15,
                fontWeight: 700,
                background: 'rgba(255,255,255,0.06)',
                border: '2px solid rgba(255,255,255,0.15)',
                borderRadius: 14,
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>{'\u2190'}</span>
              Back To Training
            </motion.button>
          </div>

          {/* SHARE RESULT */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const grade = (() => {
                  try {
                    const g = getSessionGrade();
                    return (
                      g?.grade ||
                      (gtowScore >= 90
                        ? 'S'
                        : gtowScore >= 60
                          ? 'A'
                          : gtowScore >= 30
                            ? 'B'
                            : gtowScore >= -10
                              ? 'C'
                              : 'D')
                    );
                  } catch {
                    return gtowScore >= 90
                      ? 'S'
                      : gtowScore >= 60
                        ? 'A'
                        : gtowScore >= 30
                          ? 'B'
                          : gtowScore >= -10
                            ? 'C'
                            : 'D';
                  }
                })();
                shareResult({
                  gameTitle: gameName || 'GTO Training',
                  grade,
                  score: gtowScore,
                  scoreLabel: 'GTOW SCORE',
                  subtitle: `Level ${currentLevel} \u2022 ${totalQuestions} hands`,
                  color: '#00D4FF',
                  stats: [
                    { label: 'HANDS', value: totalQuestions },
                    {
                      label: 'MEASURED EV LOSS',
                      value:
                        measuredEVReviewHistory.length > 0
                          ? `-${measuredEVTotal.toFixed(1)}`
                          : '—',
                    },
                    { label: 'MISTAKES', value: sessionMistakes },
                    { label: 'STREAK', value: bestStreak },
                  ],
                });
              }}
              style={{
                padding: '10px 24px',
                fontSize: 12,
                fontWeight: 700,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                color: 'rgba(255,255,255,0.45)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                letterSpacing: 0.5,
              }}
            >
              {'\uD83D\uDCF7'} Share Result
            </motion.button>
          </div>

          {/* MASTERY PROGRESS */}
          <div style={styles.masteryContainer}>
            <div style={styles.masteryLabel}>
              Overall Mastery: {Math.round((currentLevel / (totalLevels || 12)) * 100)}%
            </div>
            <div style={styles.masteryBar}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.round((currentLevel / (totalLevels || 12)) * 100)}%` }}
                transition={{ duration: 1, delay: 0.5 }}
                style={styles.masteryFill}
              />
            </div>
            {masteryStatus && (
              <div
                style={{
                  fontSize: 11,
                  color: masteryStatus.passed ? '#22c55e' : '#f97316',
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                {masteryStatus.message}
              </div>
            )}
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

          {/* ●●● PHASE 19: Share Card Modal ●●● */}
          {showShareCard && (
            <SessionShareCard
              gameName={gameName}
              level={currentLevel}
              gtowScore={gtowScore}
              totalQuestions={totalQuestions}
              correctCount={correctCount}
              totalEVLoss={measuredEVTotal}
              measuredEVDecisions={measuredEVReviewHistory.length}
              bestStreak={bestStreak}
              classificationCounts={classificationCounts}
              sessionMistakes={sessionMistakes}
              onClose={() => setShowShareCard(false)}
            />
          )}
        </div>
      </div>
    );
  }

  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
  // IN-GAME UI — Full screen with GTO Wizard-style GameUIRouter
  // ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

  const hasFullScreenUI = FULL_SCREEN_UI_GAMES.includes(gameId);
  const answerSaveNotice = answerSaveError ? (
    <div
      role="alert"
      data-testid="training-answer-save-error"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
        transform: 'translateX(-50%)',
        zIndex: 500,
        width: 'min(92vw, 560px)',
        padding: '14px 16px',
        background: 'linear-gradient(180deg, rgba(54,20,22,.98), rgba(13,7,10,.98))',
        border: '1px solid rgba(255,102,112,.72)',
        boxShadow: 'inset 0 1px rgba(255,255,255,.16), 0 14px 36px rgba(0,0,0,.62), 0 0 22px rgba(255,70,86,.18)',
        color: '#f8d8dc',
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ color: '#ff8b95', fontSize: 13, fontWeight: 900, letterSpacing: '.06em' }}>
          {answerSaveRequiresRefresh ? 'Hand Expired' : 'Answer Save Failed'}
        </div>
        <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.45 }}>
          {answerSaveRequiresRefresh
            ? 'No Result Was Recorded. Load A Fresh Signed Hand To Continue.'
            : 'Your Result Is Still Open. Retry The Same Save Before Moving To The Next Question.'}
        </div>
      </div>
      <button
        type="button"
        onClick={retryAnswerPersistence}
        disabled={answerSaveRetrying}
        data-testid="training-answer-retry-save"
        style={{
          minWidth: 112,
          minHeight: 44,
          border: '1px solid rgba(255,180,188,.72)',
          background: 'linear-gradient(180deg, #7f2630, #3b1017)',
          color: '#fff',
          fontWeight: 850,
          cursor: answerSaveRetrying ? 'wait' : 'pointer',
          opacity: answerSaveRetrying ? .7 : 1,
        }}
      >
        {answerSaveRetrying
          ? (answerSaveRequiresRefresh ? 'Loading…' : 'Saving…')
          : (answerSaveRequiresRefresh ? 'Load Fresh Hand' : 'Retry Save')}
      </button>
    </div>
  ) : null;
  const transitionKind = transitionError?.kind || 'next-hand';
  const transitionTitle = transitionKind === 'continuation'
    ? 'Next Street Failed'
    : transitionKind === 'completion'
      ? 'Completion Failed'
      : 'Next Hand Failed';
  const transitionRetryLabel = transitionKind === 'continuation'
    ? 'Retry Next Street'
    : transitionKind === 'completion'
      ? 'Retry Completion'
      : 'Retry Next Hand';
  const transitionNotice = transitionError ? (
    <div
      role="alert"
      data-testid="training-transition-error"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
        transform: 'translateX(-50%)',
        zIndex: 500,
        width: 'min(92vw, 560px)',
        padding: '14px 16px',
        background: 'linear-gradient(180deg, rgba(54,35,12,.98), rgba(13,9,5,.98))',
        border: '1px solid rgba(251,191,36,.72)',
        boxShadow: 'inset 0 1px rgba(255,255,255,.16), 0 14px 36px rgba(0,0,0,.62)',
        color: '#fef3c7',
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ color: '#fbbf24', fontSize: 13, fontWeight: 900, letterSpacing: '.06em' }}>
          {transitionTitle}
        </div>
        <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.45 }}>
          {transitionError.message || 'The answered hand is still on screen. Retry this transition to continue.'}
        </div>
      </div>
      <button
        type="button"
        onClick={retryTransition}
        disabled={transitionRetrying}
        data-testid="training-transition-retry"
        style={{
          minWidth: 136,
          minHeight: 44,
          border: '1px solid rgba(253,230,138,.72)',
          background: 'linear-gradient(180deg, #92400e, #451a03)',
          color: '#fff',
          fontWeight: 850,
          cursor: transitionRetrying ? 'wait' : 'pointer',
          opacity: transitionRetrying ? .7 : 1,
        }}
      >
        {transitionRetrying ? 'Retrying…' : transitionRetryLabel}
      </button>
    </div>
  ) : null;

  if (hasFullScreenUI) {
    return (
      <div className="sp-arena-shell" style={styles.fullScreenContainer}>
        {/* Trainer Config Modal */}
        <TrainerConfigModal
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          onStart={handleConfigStart}
          currentGameId={gameId}
        />

        <AnimatePresence mode="wait">
          {/* ●●● PHASE 18: ENHANCED PRE-SESSION LOBBY ●●● */}
          {gamePhase === 'splash' && (
            <motion.div
              className="sp-arena-lobby"
              key="splash"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4 }}
              style={styles.splashScreen}
            >
              <div
                className="sp-arena-lobby__content"
                style={{
                  width: '100%',
                  maxWidth: 420,
                  padding: '0 16px',
                  overflowY: 'auto',
                  maxHeight: '100vh',
                  paddingBottom: 40,
                }}
              >
                {/* Game Title */}
                <motion.div
                  className="sp-arena-lobby__heading"
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  style={{ textAlign: 'center', marginBottom: 20, marginTop: 20 }}
                >
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      color: '#f1f5f9',
                      letterSpacing: -0.5,
                      fontFamily: "'Inter', -apple-system, sans-serif",
                    }}
                  >
                    {gameName || 'GTO Training'}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginTop: 4 }}>
                    Level {currentLevel} Of {totalLevels || 12} • {totalQuestions || 25} Questions
                  </div>
                  {(() => {
                    const levelDef = getLevel(currentLevel);
                    return levelDef ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: levelDef.accentColor || '#00d4ff',
                          fontWeight: 700,
                          marginTop: 2,
                          textTransform: 'capitalize',
                          letterSpacing: 0.5,
                        }}
                      >
                        {levelDef.name} - {String(levelDef.tier || '').toLowerCase()}
                      </div>
                    ) : null;
                  })()}
                </motion.div>

                {/* Session Goal Card */}
                <motion.div
                  className="sp-arena-lobby__panel sp-arena-lobby__panel--goal"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    marginBottom: 12,
                    background:
                      'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(139,92,246,0.06) 100%)',
                    border: '1px solid rgba(0,212,255,0.15)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#00d4ff',
                      textTransform: 'capitalize',
                      letterSpacing: 1,
                      marginBottom: 6,
                    }}
                  >
                    Session Goal
                  </div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                    Score ≥{passThreshold || 85}% To Advance To Level{' '}
                    {Math.min(currentLevel + 1, totalLevels || 12)}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    Answer {requiredCorrect || Math.ceil((totalQuestions || 25) * 0.85)} of{' '}
                    {totalQuestions || 25} Questions Correctly
                  </div>
                </motion.div>

                {/* Previous Performance (from cross-session analytics) */}
                {crossSessionAnalytics?.milestones && (
                  <motion.div
                    className="sp-arena-lobby__panel sp-arena-lobby__panel--performance"
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      marginBottom: 12,
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'capitalize',
                        letterSpacing: 1,
                        marginBottom: 8,
                      }}
                    >
                      Your Performance (30 Days)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: '#00d4ff',
                            fontFamily: "var(--font-inter), Inter, system-ui, sans-serif", fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {Number.isFinite(crossSessionAnalytics.milestones.overallAccuracy)
                            ? `${crossSessionAnalytics.milestones.overallAccuracy}%`
                            : '—'}
                        </div>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>
                          Accuracy
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: '#00d4ff',
                            fontFamily: "var(--font-inter), Inter, system-ui, sans-serif", fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {crossSessionAnalytics.milestones.totalSessions ?? 0}
                        </div>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>
                          Sessions
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: '#22c55e',
                            fontFamily: "var(--font-inter), Inter, system-ui, sans-serif", fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {crossSessionAnalytics.milestones.totalHands ?? 0}
                        </div>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>Hands</div>
                      </div>
                    </div>
                    {crossSessionAnalytics.milestones.trending && (
                      <div
                        style={{
                          fontSize: 10,
                          color:
                            crossSessionAnalytics.milestones.trending === 'up'
                              ? '#22c55e'
                              : crossSessionAnalytics.milestones.trending === 'down'
                                ? '#ef4444'
                                : '#64748b',
                          textAlign: 'center',
                          marginTop: 6,
                          fontWeight: 600,
                        }}
                      >
                        {crossSessionAnalytics.milestones.trending === 'up'
                          ? '↑ Trending Up'
                          : crossSessionAnalytics.milestones.trending === 'down'
                            ? '↓ Trending Down'
                            : '→ Steady'}
                        {crossSessionAnalytics.milestones.trendDelta
                          ? ` (${crossSessionAnalytics.milestones.trendDelta > 0 ? '+' : ''}${crossSessionAnalytics.milestones.trendDelta}pts)`
                          : ''}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Difficulty + Timer Selectors */}
                <motion.div
                  className="sp-arena-lobby__panel sp-arena-lobby__panel--controls"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    marginBottom: 12,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {/* Difficulty */}
                  <div style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'capitalize',
                        letterSpacing: 1,
                        marginBottom: 6,
                      }}
                    >
                      Difficulty
                    </div>
                    <div className="sp-arena-lobby__option-grid sp-arena-lobby__option-grid--three">
                      {[
                        { key: 'beginner', label: 'Beginner', color: '#22c55e' },
                        { key: 'standard', label: 'Standard', color: '#00d4ff' },
                        { key: 'expert', label: 'Expert', color: '#ef4444' },
                      ].map((d) => (
                        <button
                          className="sp-arena-lobby__option"
                          key={d.key}
                          data-selected={difficulty === d.key}
                          onClick={() => setDifficulty(d.key)}
                          style={{
                            flex: 1,
                            padding: '8px 0',
                            borderRadius: 8,
                            border: `1px solid ${difficulty === d.key ? d.color + '60' : 'rgba(255,255,255,0.08)'}`,
                            background: difficulty === d.key ? d.color + '15' : 'transparent',
                            color: difficulty === d.key ? d.color : '#64748b',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
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
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'capitalize',
                        letterSpacing: 1,
                        marginBottom: 6,
                      }}
                    >
                      Timer
                    </div>
                    <div className="sp-arena-lobby__option-grid sp-arena-lobby__option-grid--four">
                      {[
                        { key: 'relaxed', label: 'Relaxed', desc: 'No timer', color: '#22c55e' },
                        { key: 'standard', label: 'Standard', desc: '25s', color: '#fbbf24' },
                        { key: 'quick', label: 'Quick', desc: '15s', color: '#f59e0b' },
                        { key: 'blitz', label: 'Blitz', desc: '7s', color: '#ef4444' },
                      ].map((t) => (
                        <button
                          className="sp-arena-lobby__option"
                          key={t.key}
                          data-selected={timerMode === t.key}
                          onClick={() => setTimerMode(t.key)}
                          style={{
                            flex: 1,
                            padding: '8px 0',
                            borderRadius: 8,
                            border: `1px solid ${timerMode === t.key ? t.color + '60' : 'rgba(255,255,255,0.08)'}`,
                            background: timerMode === t.key ? t.color + '15' : 'transparent',
                            color: timerMode === t.key ? t.color : '#64748b',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {t.label}
                          <div style={{ fontSize: 8, fontWeight: 600, opacity: 0.7, marginTop: 1 }}>
                            {t.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>

                {/* Spaced Repetition Due */}
                {reviewDueCount > 0 && (
                  <motion.div
                    className="sp-arena-lobby__panel sp-arena-lobby__panel--review"
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 12,
                      marginBottom: 12,
                      background: 'rgba(139,92,246,0.08)',
                      border: '1px solid rgba(139,92,246,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#00d4ff' }}>
                        {reviewDueCount} Weak Spot{reviewDueCount > 1 ? 's' : ''} Due For Review
                      </div>
                      <div style={{ fontSize: 9, color: '#64748b' }}>
                        Reviewing Now Maximizes Long-Term Retention
                      </div>
                    </div>
                    <span style={{ fontSize: 20 }}>↻</span>
                  </motion.div>
                )}

                {/* START BUTTON */}
                <motion.div
                  className="sp-arena-lobby__launch"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.45 }}
                >
                  <motion.button
                    className="sp-arena-lobby__start"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={loadFailed ? handleRetryLoad : handleStartTraining}
                    disabled={!splashReady && !loadFailed}
                    style={{
                      width: '100%',
                      padding: '16px 0',
                      borderRadius: 12,
                      border: 'none',
                      background: splashReady || loadFailed
                        ? 'linear-gradient(135deg, #00d4ff, #0891b2)'
                        : 'rgba(100,116,139,0.2)',
                      color: splashReady || loadFailed ? '#fff' : '#64748b',
                      fontSize: 16,
                      fontWeight: 800,
                      cursor: splashReady || loadFailed ? 'pointer' : 'default',
                      letterSpacing: 0.5,
                      transition: 'all 0.2s',
                      fontFamily: "'Inter', -apple-system, sans-serif",
                    }}
                  >
                    {!splashReady
                      ? loadFailed
                        ? 'Could Not Load Solver Data. Retry'
                        : 'Loading Solver Data...'
                      : trainingMode === 'flashcard'
                        ? 'Start Flashcards'
                        : trainingMode === 'drill'
                          ? 'Start Speed Drill'
                          : 'Start Training →'}
                  </motion.button>
                  {/* A DEAD BUTTON MUST SAY SO (2026-09-07). When the question
                      fetch failed, this read "Loading Solver Data..." for ever
                      on a disabled button: the lobby could not distinguish
                      still-loading from permanently-failed, and there was no
                      way back except reloading the page. */}
                  {loadFailed && (
                    <div
                      role="alert"
                      style={{
                        marginTop: 10,
                        fontSize: 12,
                        lineHeight: 1.4,
                        color: '#fca5a5',
                        textAlign: 'center',
                      }}
                    >
                      {String(error)}
                    </div>
                  )}
                </motion.div>

                {/* Back button */}
                <motion.button
                  className="sp-arena-lobby__back"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  onClick={onExit}
                  style={{
                    display: 'block',
                    margin: '12px auto 0',
                    padding: '8px 20px',
                    background: 'none',
                    border: 'none',
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ← Back To Training
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ●●● GAMEPLAY ●●● */}
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
                  <p style={{ color: '#ef4444', fontSize: 18 }}>▲ {error}</p>
                  <button onClick={() => window.location.reload()} style={styles.retryButton}>
                    Retry
                  </button>
                </div>
              ) : currentQuestion ? (
                <>
                <GameUIRouter
                  gameId={gameId}
                  gameName={gameName}
                  trainingSessionId={trainingSessionId}
                  streak={streak}
                  question={questionWithFilteredOptions}
                  level={currentLevel}
                  questionNumber={questionNumber}
                  totalQuestions={totalQuestions}
                  onAnswer={handleSubmitAnswer}
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
                  getOptimalLineNarration={getOptimalLineNarration}
                  // Phase 351+: Pre-decision hints & concept reminders
                  getPreDecisionPreview={getPreDecisionPreview}
                  getKeyConceptReminders={getKeyConceptReminders}
                  // GTOW scoring props
                  moveClassification={moveClassification}
                  evLoss={evLoss}
                  evLossMeasured={evLossMeasured}
                  gtoFrequencies={gtoFrequencies}
                  gtowScore={gtowScore}
                  totalSessionEVLoss={measuredEVDecisions > 0 ? measuredTotalEVLoss : null}
                  measuredEVDecisions={measuredEVDecisions}
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
                  onNextHand={answerSaveError ? null : handleNextQuestion}
                  isMultiStreetActive={isMultiStreetActive}
                  currentStreet={currentStreet}
                  dealingNextStreet={loading && isMultiStreetActive}
                  handSummary={handSummary}
                  onExit={onExit}
                  difficultyLevel={computedDifficultyLevel}
                  // Settings gear — relocated to scenario description area
                  onConfigClick={handleConfigClick}
                  trainerConfig={resolvedTrainerConfig}
                />
                {answerSaveNotice}
                {transitionNotice}
                </>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Default layout with header/footer for games without custom UIs
  const headerScoreColor = getArenaScoreColor(gtowScore);
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onExit} style={styles.backButton}>
          ← Exit
        </button>
        <div style={styles.gameTitle}>{gameName || 'Training'}</div>
        <div style={styles.stats}>
          <span style={{ color: headerScoreColor, fontWeight: 'bold' }}>{formatSignedScore(gtowScore)} Score</span>
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
          <>
          <GameUIRouter
            gameId={gameId}
            gameName={gameName}
            trainingSessionId={trainingSessionId}
            streak={streak}
            question={questionWithFilteredOptions}
            level={currentLevel}
            questionNumber={questionNumber}
            totalQuestions={totalQuestions}
            onAnswer={handleSubmitAnswer}
            showFeedback={showFeedback}
            feedbackResult={feedbackResult}
            explanation={explanation}
            moveClassification={moveClassification}
            evLoss={evLoss}
            evLossMeasured={evLossMeasured}
            gtoFrequencies={gtoFrequencies}
            gtowScore={gtowScore}
            totalSessionEVLoss={measuredEVDecisions > 0 ? measuredTotalEVLoss : null}
            measuredEVDecisions={measuredEVDecisions}
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
            onNextHand={answerSaveError ? null : handleDefaultNextHand}
            isMultiStreetActive={isMultiStreetActive}
            currentStreet={currentStreet}
            dealingNextStreet={loading && isMultiStreetActive}
            handSummary={handSummary}
            onExit={onExit}
            difficultyLevel={computedDifficultyLevel}
            // Phase 351+: Pre-decision hints
            getPreDecisionPreview={getPreDecisionPreview}
            getKeyConceptReminders={getKeyConceptReminders}
            trainerConfig={resolvedTrainerConfig}
          />
          {answerSaveNotice}
          {transitionNotice}
          </>
        ) : null}
      </div>

      <div style={styles.footer}>
        <div style={styles.footerStat}>
          <span style={{ color: '#94a3b8' }}>EV Loss:</span>
          <span style={{ color: measuredEVDecisions > 0 ? '#ef4444' : '#94a3b8', fontWeight: 'bold', marginLeft: 6 }}>
            {measuredEVDecisions > 0 ? `-${measuredTotalEVLoss.toFixed(1)} BB` : '— Unmeasured'}
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
          <span style={{ color: '#f97316', fontWeight: 'bold', marginLeft: 6 }}>{streak}</span>
        </div>
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STYLES
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const styles = {
  fullScreenContainer: {
    width: '100%',
    maxWidth: 1180,
    height: '100vh',
    background: 'radial-gradient(circle at 50% 42%, rgba(0, 111, 177, 0.22), transparent 42%), linear-gradient(180deg, #06111d 0%, #02070d 100%)',
    overflow: 'hidden',
    marginLeft: 'auto',
    marginRight: 'auto',
    position: 'relative',
  },

  // ●● PHASE 21: SPLASH SCREEN STYLES
  splashScreen: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 50% 45%, rgba(0, 157, 229, 0.2), transparent 38%), linear-gradient(180deg, #071522 0%, #02070d 100%)',
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
    maxWidth: 1180,
    height: '100vh',
    background: 'radial-gradient(circle at 50% 44%, rgba(0, 119, 184, 0.24), transparent 44%), linear-gradient(180deg, #06111d 0%, #02070d 100%)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Inter', -apple-system, sans-serif",
    overflow: 'hidden',
    marginLeft: 'auto',
    marginRight: 'auto',
    borderLeft: '1px solid rgba(127, 220, 255, 0.28)',
    borderRight: '1px solid rgba(127, 220, 255, 0.28)',
    boxShadow: 'inset 0 0 54px rgba(0, 136, 214, 0.1)',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    background: 'linear-gradient(180deg, rgba(215, 246, 255, 0.18) 0%, rgba(17, 41, 57, 0.92) 12%, rgba(2, 10, 17, 0.98) 100%)',
    borderBottom: '1px solid rgba(125, 220, 255, 0.46)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.42), 0 10px 26px rgba(0,0,0,0.36)',
  },

  backButton: {
    background: 'linear-gradient(180deg, #d8faff 0%, #43d8f7 15%, #087ba4 100%)',
    border: '1px solid #bff5ff',
    borderRadius: 0,
    padding: '8px 16px',
    color: '#00131d',
    fontSize: 14,
    fontWeight: 'bold',
    cursor: 'pointer',
  },

  gameTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#dff8ff',
    letterSpacing: 1,
    textTransform: 'capitalize',
    textShadow: '0 0 14px rgba(56, 210, 255, 0.42)',
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
    background: 'linear-gradient(180deg, rgba(6, 19, 31, 0.2), rgba(1, 7, 13, 0.4))',
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
    background: 'linear-gradient(0deg, rgba(206, 244, 255, 0.14) 0%, rgba(14, 34, 48, 0.94) 12%, rgba(2, 9, 16, 0.98) 100%)',
    borderTop: '1px solid rgba(125, 220, 255, 0.42)',
    boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.24), 0 -10px 28px rgba(0,0,0,0.32)',
  },

  footerStat: { fontSize: 13 },

  // ●● POST-SESSION REVIEW STYLES
  reviewContainer: {
    width: '100%',
    height: '100vh',
    background: 'radial-gradient(circle at 50% 26%, rgba(0, 133, 205, 0.2), transparent 38%), linear-gradient(180deg, #06111d 0%, #02070d 100%)',
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
    background: 'linear-gradient(180deg, rgba(215, 246, 255, 0.17), rgba(9, 25, 37, 0.96) 16%, rgba(2, 9, 16, 0.98))',
    borderBottom: '1px solid rgba(125, 220, 255, 0.42)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
    flexShrink: 0,
  },

  reviewBackBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 0,
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
    textTransform: 'capitalize',
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
    fontFamily: "var(--font-rajdhani), 'Rajdhani', 'Courier New', monospace",
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
    // roadmap #28/#41 grew this from four tiles to six. `space-around` on a
    // non-wrapping flex row crushed the two longest labels ("EV Loss/Mistake",
    // "Freq Diff") into overlap at 375px, so it is a 3-column grid now:
    // 3x2 on mobile, still a single tidy band on desktop.
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '14px 4px',
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
  // GTOW parity #10 — the multi-table branch that used to live here has been
  // removed, not relocated. It rendered N copies of GodModeArenaInner with
  // IDENTICAL props: same gameId, same userId, same sessionId. Every copy was a
  // fully independent arena, so a "4 tables" session produced four separate
  // question fetches of the SAME drill, four SESSION_END emissions carrying the
  // same gameId, and four diamond awards for one session's work. It also
  // stacked four position:fixed full-viewport confetti canvases and four global
  // window keydown listeners, so one "1" keypress submitted an answer on all
  // four tables at once.
  //
  // /hub/training/multi-table is the real implementation — distinct drills per
  // table, one combined session, one save — and pages/hub/training.js now
  // routes there when the setup modal's table count is greater than one. This
  // wrapper renders exactly one arena, which is the only thing it was ever able
  // to do correctly.
  //
  // `initialConfig.tables` is deliberately still accepted and ignored here: the
  // setup modal keeps collecting it, and silently rendering one table is the
  // correct degradation for any caller that has not been routed yet.
  return <GodModeArenaInner {...props} />;
}

export default memo(GodModeArena);
