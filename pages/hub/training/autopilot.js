/**
 * WEAK SPOT AUTOPILOT — Zero-Decision Training Mode
 * ═══════════════════════════════════════════════════════════════════════════
 * One-click "train my weakest spots" — automatically queues drills
 * targeting your worst performance areas. Zero setup required.
 *
 * Route: /hub/training/autopilot
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
// TRAIN-WIRE-EMPTY-2a — adoption: shared empty-state primitive

const GodModeArena = dynamic(() => import('../../../src/components/training/GodModeArena'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
        background: '#0a0a1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
      }}
    >
      Loading Arena...
    </div>
  ),
});

// ═══════════════════════════════════════════════════════════════════════════
// WEAK SPOT DETECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════


// BUG FIX (TRAIN-AUTOPILOT-A11Y-1): SVG icon components replacing the
// autopilot surface emoji set across SPOT_DEFINITIONS (🛡 🎯 💥 🔄 🏁 ⚡
// ♠ 🏆), 🧠 detection banner, 🎉 completion celebration, 📊 empty state.
// Same surface-specific a11y pattern as PR #320/#322/#324/#327-#345.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=20, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function ShieldIcon({ size=20 })   { return <_Svg size={size}><path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z"/></_Svg>; }
function TargetIcon({ size=20 })   { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function ExplosionIcon({ size=20 }){ return <_Svg size={size}><polygon points="12 2 14 8 20 5 16 11 22 12 16 13 20 19 14 16 12 22 10 16 4 19 8 13 2 12 8 11 4 5 10 8 12 2"/></_Svg>; }
function RotateIcon({ size=20 })   { return <_Svg size={size}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></_Svg>; }
function FlagIcon({ size=20 })     { return <_Svg size={size}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></_Svg>; }
function BoltIcon({ size=20 })     { return <_Svg size={size}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></_Svg>; }
function SpadeIcon({ size=20 })    { return <_Svg size={size}><path d="M12 2c-2 3-7 7-7 11 0 3 2 5 5 5 1 0 2-1 2-2v-2"/><path d="M12 2c2 3 7 7 7 11 0 3-2 5-5 5-1 0-2-1-2-2v-2"/><line x1="9" y1="22" x2="15" y2="22"/></_Svg>; }
function TrophyIcon({ size=20 })   { return <_Svg size={size}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></_Svg>; }
function BrainIcon({ size=40 })    { return <_Svg size={size}><path d="M9 4a4 4 0 0 0-4 4c0 1-1 2-1 4s1 3 1 4a4 4 0 0 0 4 4"/><path d="M15 4a4 4 0 0 1 4 4c0 1 1 2 1 4s-1 3-1 4a4 4 0 0 1-4 4"/><line x1="12" y1="4" x2="12" y2="20"/></_Svg>; }
function CelebrateIcon({ size=32 }){ return <_Svg size={size}><polyline points="3 21 5 13 16 2 22 8 11 19 3 21"/><line x1="7" y1="17" x2="15" y2="9"/></_Svg>; }
function ChartIcon({ size=40 })    { return <_Svg size={size}><line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="13" width="3" height="7"/><rect x="10" y="8" width="3" height="12"/><rect x="15" y="4" width="3" height="16"/></_Svg>; }
function BackArrowIcon({ size=18 }){ return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function SpotIcon({ kind, size=20 }) {
  switch (kind) {
    case 'shield':    return <ShieldIcon size={size}/>;
    case 'target':    return <TargetIcon size={size}/>;
    case 'explosion': return <ExplosionIcon size={size}/>;
    case 'rotate':    return <RotateIcon size={size}/>;
    case 'flag':      return <FlagIcon size={size}/>;
    case 'bolt':      return <BoltIcon size={size}/>;
    case 'spade':     return <SpadeIcon size={size}/>;
    case 'trophy':    return <TrophyIcon size={size}/>;
    default:          return <TargetIcon size={size}/>;
  }
}

const SPOT_DEFINITIONS = [
  {
    id: 'bb-preflop',
    name: 'BB Defense (Preflop)',
    position: 'BB',
    street: 'preflop',
    color: '#3b82f6',
    iconKind: 'shield',
    icon: '🛡️',
    gameId: 'cash-bb-defense',
  },
  {
    id: 'btn-preflop',
    name: 'BTN Opens',
    position: 'BTN',
    street: 'preflop',
    color: '#22c55e',
    iconKind: 'target',
    icon: '🎯',
    gameId: 'cash-btn-opens',
  },
  {
    id: 'cbet-flop',
    name: 'C-Betting (Flop)',
    position: 'any',
    street: 'flop',
    color: '#f97316',
    iconKind: 'explosion',
    icon: '💥',
    gameId: 'cash-cbet',
  },
  {
    id: 'turn-barrels',
    name: 'Turn Barrels',
    position: 'any',
    street: 'turn',
    color: '#a855f7',
    iconKind: 'rotate',
    icon: '🔄',
    gameId: 'cash-turn-play',
  },
  {
    id: 'river-bluffs',
    name: 'River Decisions',
    position: 'any',
    street: 'river',
    color: '#ef4444',
    iconKind: 'flag',
    icon: '🏁',
    gameId: 'cash-river-bluffs',
  },
  {
    id: '3bet-pots',
    name: '3-Bet Pots',
    position: 'any',
    street: 'any',
    color: '#ec4899',
    iconKind: 'bolt',
    icon: '⚡',
    gameId: 'cash-threeBet-spots',
  },
  {
    id: 'sb-play',
    name: 'SB Strategy',
    position: 'SB',
    street: 'preflop',
    color: '#8b5cf6',
    iconKind: 'spade',
    icon: '♠️',
    gameId: 'cash-sb',
  },
  {
    id: 'mtt-push',
    name: 'MTT Push/Fold',
    position: 'any',
    street: 'preflop',
    color: '#fbbf24',
    iconKind: 'trophy',
    icon: '🏆',
    gameId: 'mtt-push-fold',
  },
];

function analyzeWeakSpots(sessions) {
  if (!sessions || sessions.length < 3) {
    // Not enough data — return random rotation
    return SPOT_DEFINITIONS.slice(0, 3).map((s) => ({
      ...s,
      accuracy: null,
      evLoss: null,
      reason: 'Build your training history',
    }));
  }

  // Group by game pattern
  const spotStats = {};
  sessions.forEach((s) => {
    const gameId = (s.game_id || '').toLowerCase();
    SPOT_DEFINITIONS.forEach((spot) => {
      if (
        gameId.includes(spot.position.toLowerCase()) ||
        gameId.includes(spot.street) ||
        gameId.includes(spot.gameId?.split('-').pop() || '')
      ) {
        if (!spotStats[spot.id]) {
          spotStats[spot.id] = { hands: 0, correct: 0, evLoss: 0 };
        }
        spotStats[spot.id].hands += s.hands_played || s.total_questions || 0;
        spotStats[spot.id].correct += s.correct_count || s.correct_answers || 0;
        spotStats[spot.id].evLoss += s.total_ev_loss || 0;
      }
    });
  });

  // Rank by weakness (low accuracy + high EV loss)
  const ranked = SPOT_DEFINITIONS.map((spot) => {
    const stats = spotStats[spot.id];
    if (!stats || stats.hands === 0) {
      return {
        ...spot,
        accuracy: null,
        evLoss: 0,
        score: 50,
        reason: 'Not enough data — needs practice',
      };
    }
    const accuracy = Math.round((stats.correct / stats.hands) * 100);
    const evPerHand = stats.evLoss / stats.hands;
    // Lower accuracy + higher EV loss = higher weakness score
    const score = 100 - accuracy + evPerHand * 10;
    return {
      ...spot,
      accuracy,
      evLoss: stats.evLoss,
      hands: stats.hands,
      score,
      reason:
        accuracy < 60
          ? `Only ${accuracy}% — significant leak`
          : accuracy < 75
            ? `${accuracy}% — room for improvement`
            : `${accuracy}% — maintain consistency`,
    };
  }).sort((a, b) => b.score - a.score);

  return ranked.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function AutopilotPage() {
  const router = useRouter();
  useTrainingBus('autopilot');
  const { guardAction, UpgradePopup } = useFeatureGate('gto_training');
  const [loading, setLoading] = useState(true);
  const [weakSpots, setWeakSpots] = useState([]);
  const [activeSpot, setActiveSpot] = useState(null);
  const [currentSpotIdx, setCurrentSpotIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [results, setResults] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const fetchAndAnalyze = useCallback(async () => {
    setFetchError(null);
    const user = getAuthUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const res = await authedFetch(`/api/training/get-sessions?limit=200`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success && data.sessions) {
        const spots = analyzeWeakSpots(data.sessions);
        setWeakSpots(spots);
      }
    } catch (e) {
      console.warn('[Autopilot] Fetch error:', e);
      setFetchError('Unable to load autopilot data. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAndAnalyze();
  }, [fetchAndAnalyze]);

  // Bus listener — refresh weak spot analysis when a session completes
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchAndAnalyze());
    return unsub;
  }, [fetchAndAnalyze]);

  const startAutopilot = () => {
    if (!guardAction()) return;
    if (weakSpots.length === 0) return;
    setCurrentSpotIdx(0);
    setActiveSpot(weakSpots[0]);
    setIsPlaying(true);
    setResults([]);
  };

  const handleArenaComplete = (arenaResults) => {
    const newResults = [
      ...results,
      {
        spot: activeSpot,
        accuracy: arenaResults?.accuracy || 0,
        questionsAnswered: arenaResults?.questionsAnswered || 0,
      },
    ];
    setResults(newResults);

    // Move to next spot or finish
    const nextIdx = currentSpotIdx + 1;
    if (nextIdx < weakSpots.length) {
      setCurrentSpotIdx(nextIdx);
      setActiveSpot(weakSpots[nextIdx]);
    } else {
      setIsPlaying(false);
      setActiveSpot(null);
    }
  };

  const handleArenaExit = () => {
    setIsPlaying(false);
    setActiveSpot(null);
  };

  // Active arena
  if (isPlaying && activeSpot) {
    return (
      <GodModeArena
        userId={getAuthUser()?.id || `anon-${Date.now()}`}
        gameId={activeSpot.gameId || 'cash-preflop'}
        gameName={`Autopilot: ${activeSpot.name}`}
        level={1}
        sessionId={`autopilot-${Date.now()}`}
        onComplete={handleArenaComplete}
        onExit={handleArenaExit}
      />
    );
  }

  return (
    <>
      <Head>
        <title>Autopilot | Smarter.Poker GTO Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: '#e2e8f0',
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
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: '#94a3b8',
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
            ←
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
              Weak Spot Autopilot
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Zero-decision training mode</div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); fetchAndAnalyze(); }} />
          {/* Loading */}
          {loading && (
            <div style={{ padding: '20px 0' }}>
              <SkeletonLoader variant="card" count={2} />
            </div>
          )}

          {/* Results Summary (after completing autopilot) */}
          {!loading && !isPlaying && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                padding: '24px 20px',
                borderRadius: 16,
                marginBottom: 24,
                background:
                  'linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(34,197,94,0.02) 100%)',
                border: '1px solid rgba(34,197,94,0.15)',
                textAlign: 'center',
              }}
            >
              {/* TRAIN-AUTOPILOT-A11Y-1: SVG celebration */}
              <div style={{ fontSize: 32, marginBottom: 8, display: 'inline-flex', justifyContent: 'center', color: '#fbbf24' }} aria-hidden>
                <CelebrateIcon size={32} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#4ade80', marginBottom: 4 }}>
                Autopilot Complete
              </div>

              {/* Coaching Grade Badge */}
              {(() => {
                const totalQ = results.reduce((s, r) => s + (r.questionsAnswered || 0), 0);
                const totalCorrect = results.reduce((s, r) => s + Math.round(((r.accuracy || 0) / 100) * (r.questionsAnswered || 0)), 0);
                const avgAccuracy = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
                const grade = avgAccuracy >= 90 ? 'A' : avgAccuracy >= 80 ? 'B' : avgAccuracy >= 70 ? 'C' : 'D';
                const gradeColor = avgAccuracy >= 90 ? '#4ade80' : avgAccuracy >= 80 ? '#3b82f6' : avgAccuracy >= 70 ? '#fbbf24' : '#f87171';
                return (
                  <>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 20px',
                      borderRadius: 12,
                      background: `${gradeColor}10`,
                      border: `1px solid ${gradeColor}30`,
                      marginBottom: 16,
                    }}>
                      <span style={{ fontSize: 28, fontWeight: 900, color: gradeColor }}>{grade}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
                          {avgAccuracy}% Overall
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                          {totalCorrect}/{totalQ} questions correct
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Per-Spot Breakdown */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${results.length}, 1fr)`,
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                {results.map((r, i) => (
                  <div
                    key={i}
                    style={{ padding: '10px', borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}
                  >
                    {/* TRAIN-AUTOPILOT-A11Y-1: SVG SpotIcon */}
                    <div style={{ fontSize: 14, display: 'inline-flex', color: r.spot.color }} aria-hidden><SpotIcon kind={r.spot.iconKind} size={14} /></div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: r.accuracy >= 75 ? '#4ade80' : '#fbbf24',
                        marginTop: 4,
                      }}
                    >
                      {r.accuracy}%
                    </div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>{r.spot.name}</div>
                  </div>
                ))}
              </div>

              {/* Coaching Recommendation */}
              {(() => {
                const weakest = [...results].sort((a, b) => a.accuracy - b.accuracy)[0];
                if (!weakest) return null;
                return (
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    textAlign: 'left',
                    marginBottom: 16,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#00d4ff', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                      Coach Recommendation
                    </div>
                    <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.5 }}>
                      Focus your next session on <strong style={{ color: weakest.spot.color }}>{weakest.spot.name}</strong> — it was your weakest area at {weakest.accuracy}%.
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={startAutopilot}
                  style={{
                    flex: 1,
                    padding: '12px 24px',
                    borderRadius: 10,
                    border: '1px solid rgba(0,212,255,0.3)',
                    background:
                      'linear-gradient(180deg, rgba(0,212,255,0.15) 0%, rgba(0,212,255,0.05) 100%)',
                    color: '#00d4ff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Run Again
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  disabled={sharing}
                  onClick={async () => {
                    if (sharing) return;
                    setSharing(true);
                    try {
                      const user = getAuthUser();
                      if (!user?.id) { setSharing(false); return; }
                      const totalQ = results.reduce((s, r) => s + (r.questionsAnswered || 0), 0);
                      const avgAcc = totalQ > 0 ? Math.round(results.reduce((s, r) => s + ((r.accuracy || 0) * (r.questionsAnswered || 0)), 0) / totalQ) : 0;
                      const res = await authedFetch('/api/training/share', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          userId: user.id,
                          shareType: 'autopilot',
                          data: { spotsTrailed: results.length, accuracy: avgAcc, spots: results.map(r => r.spot.name) },
                        }),
                      });
                      if (res.ok) alert('Autopilot results shared to your feed!');
                      else alert('Share failed — please try again.');
                    } catch (e) {
                      console.warn('Share error:', e);
                      alert('Share failed — please try again.');
                    } finally {
                      setSharing(false);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '12px 24px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    color: '#94a3b8',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {sharing ? 'Sharing...' : 'Share Results'}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Weak Spots Detected */}
          {!loading && weakSpots.length > 0 && results.length === 0 && (
            <>
              {/* Hero CTA */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  padding: '32px 20px',
                  borderRadius: 18,
                  marginBottom: 24,
                  background:
                    'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(139,92,246,0.04) 100%)',
                  border: '1px solid rgba(168,85,247,0.15)',
                  textAlign: 'center',
                }}
              >
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ fontSize: 40, marginBottom: 12, display: 'inline-flex', justifyContent: 'center', color: '#a855f7' }}
                  aria-hidden
                >
                  {/* TRAIN-AUTOPILOT-A11Y-1: SVG brain replaces 🧠 */}
                  <BrainIcon size={40} />
                </motion.div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0', marginBottom: 6 }}>
                  3 Weak Spots Detected
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20, lineHeight: 1.5 }}>
                  We analyzed your training history and found areas
                  <br />
                  that need the most attention. One click to start.
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={startAutopilot}
                  style={{
                    padding: '14px 40px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 20px rgba(168,85,247,0.3)',
                    letterSpacing: 0.5,
                  }}
                >
                  Start Autopilot
                </motion.button>
              </motion.div>

              {/* Spot Breakdown */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 10,
                  }}
                >
                  YOUR WEAK SPOTS
                </div>
                {weakSpots.map((spot, i) => (
                  <motion.div
                    key={spot.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 12,
                      marginBottom: 8,
                      background: 'rgba(0,0,0,0.2)',
                      border: `1px solid ${spot.color}18`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: `${spot.color}12`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                        }}
                      >
                        <SpotIcon kind={spot.iconKind} size={20} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: spot.color }}>
                          {i + 1}. {spot.name}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                          {spot.reason}
                        </div>
                      </div>
                    </div>
                    {spot.accuracy !== null && (
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color:
                            spot.accuracy < 60
                              ? '#ef4444'
                              : spot.accuracy < 75
                                ? '#fbbf24'
                                : '#4ade80',
                        }}
                      >
                        {spot.accuracy}%
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </>
          )}

          {/* No data state */}
          {!loading && weakSpots.length === 0 && (
            <TrainerEmptyState
              variant="no-data"
              title="Need More Data"
              message="Complete a few training sessions first so we can identify your weak spots."
              cta={{ label: 'Start Training', onClick: () => router.push('/hub/training') }}
            />
          )}
        </div>
      </div>
      {UpgradePopup}
      <ConnectionToast />
    </>
  );
}
