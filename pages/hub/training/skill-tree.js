/**
 * SKILL TREE — Visual Progression Map
 * ═══════════════════════════════════════════════════════════════════════════
 * Interactive node graph showing skill branches from Preflop → Postflop →
 * Advanced → Mastery. Nodes unlock based on accuracy thresholds.
 *
 * Route: /hub/training/skill-tree
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH5-53 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-46 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

// TRAIN-CSS-MOTION-ADOPT-25 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ═══════════════════════════════════════════════════════════════════════════
// BRANCH ICONS — TRAIN-SKILL-TREE-A11Y-1
// SVG replacements for the previous emoji icons (🃏, 🎯, ⚡, 👑) per handoff
// §4 'no-emoji-icons' anti-pattern. Stroke colour inherits via currentColor
// so each branch's existing colour token still drives the visual.
// ═══════════════════════════════════════════════════════════════════════════

function BranchIcon({ branchId, size = 16, color = 'currentColor' }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth: 2,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, focusable: 'false',
  };
  switch (branchId) {
    case 'preflop':
      // Layered cards icon (Lucide-style)
      return (
        <svg {...common}>
          <rect x="4" y="8" width="13" height="13" rx="2" />
          <path d="M9 8V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9" />
        </svg>
      );
    case 'postflop':
      // Target / crosshair
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case 'advanced':
      // Lightning bolt
      return (
        <svg {...common}>
          <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'mastery':
      // Crown
      return (
        <svg {...common}>
          <path d="M2 19h20l-2-12-5 4-5-7-5 7-5-4 2 12z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL TREE DATA
// ═══════════════════════════════════════════════════════════════════════════

const SKILL_BRANCHES = [
  {
    id: 'preflop',
    name: 'Preflop Foundations',
    color: 'var(--sp-accent-blue)',
    icon: '🃏',
    nodes: [
      { id: 'open-raise', name: 'Open Raise', threshold: 60, xp: 100, gameId: 'cash-preflop' },
      {
        id: 'bb-defense',
        name: 'BB Defense',
        threshold: 65,
        xp: 150,
        gameId: 'cash-bb-defense',
        requires: 'open-raise',
      },
      {
        id: '3bet-ranges',
        name: '3-Bet Ranges',
        threshold: 70,
        xp: 200,
        gameId: 'cash-threeBet-spots',
        requires: 'bb-defense',
      },
      {
        id: 'squeeze-play',
        name: 'Squeeze Play',
        threshold: 75,
        xp: 250,
        gameId: 'cash-squeeze',
        requires: '3bet-ranges',
      },
    ],
  },
  {
    id: 'postflop',
    name: 'Postflop Mastery',
    color: 'var(--sp-accent-green)',
    icon: '🎯',
    nodes: [
      { id: 'cbet-basics', name: 'C-Bet Basics', threshold: 60, xp: 100, gameId: 'cash-cbet' },
      {
        id: 'turn-barrels',
        name: 'Turn Barrels',
        threshold: 65,
        xp: 150,
        gameId: 'cash-turn-play',
        requires: 'cbet-basics',
      },
      {
        id: 'river-decisions',
        name: 'River Decisions',
        threshold: 70,
        xp: 200,
        gameId: 'cash-river-bluffs',
        requires: 'turn-barrels',
      },
      {
        id: 'multistreet',
        name: 'Multi-Street Plans',
        threshold: 75,
        xp: 250,
        gameId: 'cash-multistreet',
        requires: 'river-decisions',
      },
    ],
  },
  {
    id: 'advanced',
    name: 'Advanced Theory',
    color: 'var(--sp-accent-purple)',
    icon: '⚡',
    nodes: [
      {
        id: 'pot-geometry',
        name: 'Pot Geometry',
        threshold: 65,
        xp: 200,
        gameId: 'adv-pot-geometry',
      },
      {
        id: 'range-advantage',
        name: 'Range Advantage',
        threshold: 70,
        xp: 250,
        gameId: 'adv-range-advantage',
        requires: 'pot-geometry',
      },
      {
        id: 'nodelock',
        name: 'Nodelocking',
        threshold: 75,
        xp: 300,
        gameId: 'adv-nodelock',
        requires: 'range-advantage',
      },
      {
        id: 'mixed-strategies',
        name: 'Mixed Strategies',
        threshold: 80,
        xp: 400,
        gameId: 'adv-mixed',
        requires: 'nodelock',
      },
    ],
  },
  {
    id: 'mastery',
    name: 'GTO Mastery',
    color: 'var(--sp-accent-amber)',
    icon: '👑',
    nodes: [
      { id: 'icm-mastery', name: 'ICM Mastery', threshold: 70, xp: 300, gameId: 'mtt-icm' },
      {
        id: 'multiway-pots',
        name: 'Multiway Pots',
        threshold: 75,
        xp: 350,
        gameId: 'cash-multiway',
        requires: 'icm-mastery',
      },
      {
        id: 'exploitative',
        name: 'Exploitative Play',
        threshold: 80,
        xp: 400,
        gameId: 'adv-exploitative',
        requires: 'multiway-pots',
      },
      {
        id: 'gto-master',
        name: 'GTO Master',
        threshold: 85,
        xp: 500,
        gameId: 'adv-gto-master',
        requires: 'exploitative',
      },
    ],
  },
];

function computeSkillData(sessions) {
  const stats = {};
  if (!sessions) return stats;
  sessions.forEach((s) => {
    const gid = (s.game_id || '').toLowerCase();
    const hands = s.hands_played || s.total_questions || 0;
    const correct = s.correct_count || s.correct_answers || 0;
    if (!stats[gid]) stats[gid] = { hands: 0, correct: 0 };
    stats[gid].hands += hands;
    stats[gid].correct += correct;
  });
  return stats;
}

function getNodeStatus(node, stats, unlockedNodes) {
  // Check prerequisite
  if (node.requires && !unlockedNodes.has(node.requires)) {
    return { status: 'locked', accuracy: null, progress: 0 };
  }
  // Find matching stats
  let totalHands = 0,
    totalCorrect = 0;
  Object.entries(stats || {}).forEach(([gid, data]) => {
    if (
      gid.includes(node.gameId?.split('-').pop() || '') ||
      node.gameId?.includes(gid.split('-')[1] || '')
    ) {
      totalHands += data.hands;
      totalCorrect += data.correct;
    }
  });
  const accuracy = totalHands > 0 ? Math.round((totalCorrect / totalHands) * 100) : 0;
  const progress =
    totalHands > 0 ? Math.min(100, Math.round((accuracy / node.threshold) * 100)) : 0;
  const mastered = accuracy >= node.threshold && totalHands >= 10;
  return {
    status: mastered ? 'mastered' : totalHands > 0 ? 'in-progress' : 'available',
    accuracy,
    progress,
    hands: totalHands,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL NODE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function SkillNode({ node, nodeStatus, branchColor, onTap }) {
  const { status, accuracy, progress } = nodeStatus;
  const isLocked = status === 'locked';
  const isMastered = status === 'mastered';

  return (
    <motion.button
      whileTap={!isLocked ? { scale: 0.95 } : {}}
      onClick={() => !isLocked && onTap(node)}
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        width: '100%',
        background: isMastered
          ? `linear-gradient(135deg, ${branchColor}15, ${branchColor}08)`
          : isLocked
            ? 'rgba(255,255,255,0.01)'
            : 'rgba(0,0,0,0.2)',
        border: `1px solid ${isMastered ? `${branchColor}30` : isLocked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'}`,
        cursor: isLocked ? 'not-allowed' : 'pointer',
        opacity: isLocked ? 0.4 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: isMastered
              ? `${branchColor}20`
              : isLocked
                ? 'rgba(255,255,255,0.03)'
                : 'rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
          }}
        >
          {/* TRAIN-SKILL-TREE-A11Y-1: SVG status icon (was emoji 🔒/✅/🎯). */}
          {isLocked ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true" focusable="false">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : isMastered ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true" focusable="false">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4" />
            </svg>
          )}
        </div>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: isMastered ? branchColor : isLocked ? 'var(--sp-fg-faint)' : 'var(--sp-fg)',
            }}
          >
            {node.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--sp-fg-faint)', marginTop: 1 }}>
            {isLocked
              ? 'Locked — complete prerequisite'
              : isMastered
                ? `Mastered at ${accuracy}%`
                : accuracy
                  ? `${accuracy}% — need ${node.threshold}%`
                  : `Goal: ${node.threshold}% accuracy`}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        {!isLocked && (
          <>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: isMastered
                  ? 'var(--sp-accent-green)'
                  : accuracy >= node.threshold * 0.8
                    ? 'var(--sp-accent-amber)'
                    : 'var(--sp-fg-dim)',
              }}
            >
              {accuracy !== null ? `${accuracy}%` : '—'}
            </div>
            <div style={{ fontSize: 9, color: 'var(--sp-fg-faint)' }}>{node.xp} XP</div>
          </>
        )}
      </div>
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function SkillTreePage() {
  const router = useRouter();
  useTrainingBus('skill-tree');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [totalXP, setTotalXP] = useState(0);
  const [fetchError, setFetchError] = useState(null);

  const fetchData = useCallback(async () => {
    setFetchError(null);
    const user = getAuthUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const res = await authedFetch(`/api/training/get-sessions?limit=500`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success && data.sessions) {
        setStats(computeSkillData(data.sessions));
      }
    } catch (e) {
      console.warn('[SkillTree] Fetch error:', e);
      setFetchError('Unable to load skill tree data. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Bus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchData());
    return unsub;
  }, [fetchData]);

  // Compute unlocked nodes and total XP
  const unlockedNodes = new Set();
  let xp = 0;
  SKILL_BRANCHES.forEach((branch) => {
    branch.nodes.forEach((node) => {
      const ns = getNodeStatus(node, stats, unlockedNodes);
      if (ns.status === 'mastered') {
        unlockedNodes.add(node.id);
        xp += node.xp;
      }
    });
  });

  const totalNodes = SKILL_BRANCHES.reduce((s, b) => s + b.nodes.length, 0);
  const masteredCount = unlockedNodes.size;

  const handleNodeTap = (node) => {
    router.push(`/hub/training/arena/spot-trainer?gameId=${node.gameId || 'cash-preflop'}`);
  };

  return (
    <>
      <Head>
        <title>Skill Tree | Smarter.Poker GTO Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {/* TRAIN-SKILL-TREE-A11Y-1: aria-label + SVG arrow (was bare '←' text
              which screen readers announce as 'left pointing arrow'). */}
          <button
            type="button"
            onClick={() => router.push('/hub/training')}
            aria-label="Back to training"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: 'var(--sp-fg-muted)',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            {/* TRAIN-SKILL-TREE-A11Y-1: page heading uses semantic h1 */}
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Skill Tree</h1>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Master your GTO progression</div>
          </div>
          {/* TRAIN-SKILL-TREE-A11Y-1: status role + readable aria-label */}
          <div
            role="status"
            aria-label={`${xp} experience points earned`}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.2)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--sp-accent-amber)', fontVariantNumeric: 'tabular-nums' }}>{xp}</span>
            <span style={{ fontSize: 10, color: 'var(--sp-fg-muted)', marginLeft: 4 }}>XP</span>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); fetchData(); }} />
          {/* Progress Overview */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '16px',
              borderRadius: 14,
              marginBottom: 20,
              background:
                'linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(139,92,246,0.04) 100%)',
              border: '1px solid rgba(0,212,255,0.12)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                NODES MASTERED
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sp-accent-cyan)' }}>
                {masteredCount}/{totalNodes}
              </div>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.06)',
                overflow: 'hidden',
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(masteredCount / totalNodes) * 100}%` }}
                transition={{ duration: MOTION.glacial }}
                style={{
                  height: '100%',
                  borderRadius: 3,
                  background: 'linear-gradient(90deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-purple-rgb), 1))',
                }}
              />
            </div>
          </motion.div>

          {/* Loading */}
          {loading && (
            <div style={{ padding: '20px 0' }}>
              <SkeletonLoader variant="rows" rows={8} />
            </div>
          )}

          {/* Skill Branches */}
          {!loading &&
            SKILL_BRANCHES.map((branch, bIdx) => (
              <motion.div
                key={branch.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: bIdx * 0.1 }}
                style={{ marginBottom: 20 }}
              >
                {/* Branch Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 10,
                    padding: '0 4px',
                  }}
                >
                  {/* TRAIN-SKILL-TREE-A11Y-1: SVG icon (was emoji); semantic <h2> */}
                  <span style={{ color: branch.color, display: 'inline-flex' }}>
                    <BranchIcon branchId={branch.id} size={18} color={branch.color} />
                  </span>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: branch.color, margin: 0 }}>
                    {branch.name}
                  </h2>
                  <div
                    style={{
                      marginLeft: 'auto',
                      fontSize: 10,
                      color: 'var(--sp-fg-faint)',
                    }}
                  >
                    {
                      branch.nodes.filter(
                        (n) => getNodeStatus(n, stats, unlockedNodes).status === 'mastered'
                      ).length
                    }
                    /{branch.nodes.length}
                  </div>
                </div>

                {/* Nodes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {branch.nodes.map((node, nIdx) => {
                    const nodeStatus = getNodeStatus(node, stats, unlockedNodes);
                    return (
                      <div key={node.id} style={{ position: 'relative' }}>
                        {/* Connector line */}
                        {nIdx > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              top: -6,
                              left: 26,
                              width: 2,
                              height: 6,
                              background:
                                nodeStatus.status === 'locked'
                                  ? 'rgba(255,255,255,0.03)'
                                  : `${branch.color}30`,
                            }}
                          />
                        )}
                        <SkillNode
                          node={node}
                          nodeStatus={nodeStatus}
                          branchColor={branch.color}
                          onTap={handleNodeTap}
                        />
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}