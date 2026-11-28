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
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { TrainingConsoleSkeleton } from '../../../src/components/training/console/TrainingConsoleStates';
import sd from '../../../src/styles/training/training-journey-sd.module.css';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
// TRAIN-CSS-MOTION-ADOPT-25 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ═══════════════════════════════════════════════════════════════════════════
// BRANCH ICONS — TRAIN-SKILL-TREE-A11Y-1
// SVG replacements for the previous emoji icons (, , , ) per handoff
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
    icon: '',
    nodes: [
      { id: 'open-raise', name: 'Open Raise', threshold: 60, gameId: 'cash-001' },
      {
        id: 'bb-defense',
        name: 'BB Defense',
        threshold: 65,
        gameId: 'cash-003',
        requires: 'open-raise',
      },
      {
        id: '3bet-ranges',
        name: '3-Bet Ranges',
        threshold: 70,
        gameId: 'cash-007',
        requires: 'bb-defense',
      },
      {
        id: 'squeeze-play',
        name: 'Squeeze Play',
        threshold: 75,
        gameId: 'cash-008',
        requires: '3bet-ranges',
      },
    ],
  },
  {
    id: 'postflop',
    name: 'Postflop Mastery',
    color: 'var(--sp-accent-green)',
    icon: '',
    nodes: [
      { id: 'cbet-basics', name: 'C-Bet Basics', threshold: 60, gameId: 'cash-002' },
      {
        id: 'turn-barrels',
        name: 'Turn Barrels',
        threshold: 65,
        gameId: 'cash-024',
        requires: 'cbet-basics',
      },
      {
        id: 'river-decisions',
        name: 'River Decisions',
        threshold: 70,
        gameId: 'cash-012',
        requires: 'turn-barrels',
      },
      {
        id: 'multistreet',
        name: 'Multi-Street Plans',
        threshold: 75,
        gameId: 'cash-025',
        requires: 'river-decisions',
      },
    ],
  },
  {
    id: 'advanced',
    name: 'Advanced Theory',
    color: '#86daff',
    icon: '',
    nodes: [
      {
        id: 'pot-geometry',
        name: 'Pot Geometry',
        threshold: 65,
        gameId: 'adv-011',
      },
      {
        id: 'range-advantage',
        name: 'Range Advantage',
        threshold: 70,
        gameId: 'adv-008',
        requires: 'pot-geometry',
      },
      {
        id: 'nodelock',
        name: 'Nodelocking',
        threshold: 75,
        gameId: 'adv-003',
        requires: 'range-advantage',
      },
      {
        id: 'mixed-strategies',
        name: 'Mixed Strategies',
        threshold: 80,
        gameId: 'cash-021',
        requires: 'nodelock',
      },
    ],
  },
  {
    id: 'mastery',
    name: 'GTO Mastery',
    color: '#86daff',
    icon: '',
    nodes: [
      { id: 'icm-mastery', name: 'ICM Mastery', threshold: 70, gameId: 'mtt-002' },
      {
        id: 'multiway-pots',
        name: 'Multiway Pots',
        threshold: 75,
        gameId: 'cash-016',
        requires: 'icm-mastery',
      },
      {
        id: 'exploitative',
        name: 'Exploitative Play',
        threshold: 80,
        gameId: 'adv-016',
        requires: 'multiway-pots',
      },
      {
        id: 'gto-master',
        name: 'GTO Master',
        threshold: 85,
        gameId: 'adv-020',
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
  // A node is bound to one canonical game. Substring matching previously let
  // unrelated IDs unlock each other (for example every `*-001` session).
  const nodeStats = stats?.[node.gameId] || { hands: 0, correct: 0 };
  const totalHands = nodeStats.hands;
  const totalCorrect = nodeStats.correct;
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

function SkillNode({ node, nodeStatus, onTap }) {
  const { status, accuracy, hands = 0 } = nodeStatus;
  const isLocked = status === 'locked';
  const isMastered = status === 'mastered';
  const state = isLocked ? 'locked' : isMastered ? 'mastered' : 'open';

  return (
    <motion.button
      type="button"
      whileTap={!isLocked ? { scale: 0.97 } : {}}
      onClick={() => !isLocked && onTap(node)}
      disabled={isLocked}
      className={sd.skillNode}
      data-state={state}
      aria-label={`${node.name}${isLocked ? ', locked' : isMastered ? ', mastered' : ''}`}
    >
      <span className={sd.skillNodeIcon} aria-hidden="true">
        {/* TRAIN-SKILL-TREE-A11Y-1: SVG status icon. */}
        {isLocked ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true" focusable="false">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ) : isMastered ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true" focusable="false">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        )}
      </span>
      <span className={sd.skillNodeText}>
        <span className={sd.skillNodeName}>{node.name}</span>
        <span className={sd.skillNodeHint}>
          {isLocked
            ? 'Locked - Complete Prerequisite'
            : isMastered
              ? `Mastered At ${accuracy}%`
              : accuracy
                ? `${accuracy}% - Need ${node.threshold}%`
                : `Goal: ${node.threshold}% Accuracy`}
        </span>
      </span>
      {!isLocked && (
        <span className={sd.skillNodeScore}>
          <span className={isMastered ? sd.good : accuracy >= node.threshold * 0.8 ? sd.ice : ''}>
            {accuracy !== null ? `${accuracy}%` : '-'}
          </span>
          <span className={sd.skillNodeHint}>
            {hands} Verified {hands === 1 ? 'Hand' : 'Hands'}
          </span>
        </span>
      )}
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
  const [stats, setStats] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setStats(null);
    const user = getAuthUser();
    if (!user?.id) {
      setFetchError('Sign in to load verified skill progress.');
      setLoading(false);
      return;
    }
    try {
      const res = await authedFetch(`/api/training/get-sessions?limit=500`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (!data.success || !Array.isArray(data.sessions)) {
        throw new Error('Verified session history was not returned');
      }
      setStats(computeSkillData(data.sessions));
    } catch (e) {
      console.warn('[SkillTree] Fetch error:', e);
      setStats(null);
      setFetchError('Unable to load verified skill progress. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Bus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchData());
    return unsub;
  }, [fetchData]);

  // Mastery is a projection of verified session history only. Missing history
  // never becomes zero progress or an inferred unlock.
  const unlockedNodes = new Set();
  if (stats) {
    SKILL_BRANCHES.forEach((branch) => {
      branch.nodes.forEach((node) => {
        const ns = getNodeStatus(node, stats, unlockedNodes);
        if (ns.status === 'mastered') unlockedNodes.add(node.id);
      });
    });
  }

  const totalNodes = SKILL_BRANCHES.reduce((s, b) => s + b.nodes.length, 0);
  const masteredCount = unlockedNodes.size;

  const handleNodeTap = (node) => {
    router.push(`/hub/training/arena/${node.gameId}?level=1&source=skill-tree`);
  };

  return (
    <>
      <SEOHead
        title="Interactive Poker Skill Tree Map"
        description="Track Your Poker Mastery Across Connected Competency Branches From Preflop Foundations To River Bluff Catching And Tournament ICM On Smarter.Poker."
        canonical="/hub/training/skill-tree"
      />
      <div className={`sp-training-journey sp-training-journey--skill-tree ${sd.root}`}>
        <TrainingPageHead slug="training-skill-tree" note="Mastery From Sealed Training Sessions">
          <p
            className="sp-head-note"
            role="status"
            aria-label={
              stats
                ? `${masteredCount} of ${totalNodes} skill nodes mastered from verified sessions`
                : 'Verified skill mastery unavailable'
            }
          >
            <strong>{stats ? `${masteredCount}/${totalNodes}` : '-'}</strong> Verified Mastery
          </p>
        </TrainingPageHead>

        <div className={`sp-journey-main ${sd.main}`}>

          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); fetchData(); }} />
          {/* Progress Overview */}
          {!loading && stats && <motion.div
            className={`sp-journey-spotlight ${sd.card}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className={sd.row}>
              <span className={sd.title}>Nodes Mastered</span>
              <span className={sd.value}>{masteredCount}/{totalNodes}</span>
            </div>
            <div className={sd.meter}>
              <motion.div
                className={sd.meterFill}
                initial={{ width: 0 }}
                animate={{ width: `${(masteredCount / totalNodes) * 100}%` }}
                transition={{ duration: MOTION.glacial }}
              />
            </div>
          </motion.div>}

          {/* Loading */}
          {loading && (
            <TrainingConsoleSkeleton label="Loading Skill Tree" panels={3} rows={3} />
          )}

          {!loading && !stats && (
            <div role="status" className={sd.card} data-tone="muted">
              <p className={sd.copy}>
                Verified Skill Progress Is Currently Unavailable. No Mastery Status Has Been
                Inferred From Missing Session Data.
              </p>
            </div>
          )}

          {/* Skill Branches */}
          {!loading && stats &&
            SKILL_BRANCHES.map((branch, bIdx) => (
              <motion.section
                key={branch.id}
                className={sd.section}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: bIdx * 0.1 }}
                aria-labelledby={`skill-branch-${branch.id}`}
              >
                {/* Branch Header */}
                <div className={sd.sectionHead}>
                  {/* TRAIN-SKILL-TREE-A11Y-1: SVG icon; semantic <h2> */}
                  <h2 id={`skill-branch-${branch.id}`} className={sd.sectionTitle}>
                    <BranchIcon branchId={branch.id} size={18} color="currentColor" />
                    {branch.name}
                  </h2>
                  <span className={sd.value}>
                    {
                      branch.nodes.filter(
                        (n) => getNodeStatus(n, stats, unlockedNodes).status === 'mastered'
                      ).length
                    }
                    /{branch.nodes.length}
                  </span>
                </div>

                {/* Nodes */}
                <div className={sd.skillNodes}>
                  {branch.nodes.map((node) => {
                    const nodeStatus = getNodeStatus(node, stats, unlockedNodes);
                    return (
                      <SkillNode
                        key={node.id}
                        node={node}
                        nodeStatus={nodeStatus}
                        onTap={handleNodeTap}
                      />
                    );
                  })}
                </div>
              </motion.section>
            ))}
        </div>
      </div>
      <ConnectionToast />
      <HubPageSummary page="training-skill-tree" />
    </>
  );
}
