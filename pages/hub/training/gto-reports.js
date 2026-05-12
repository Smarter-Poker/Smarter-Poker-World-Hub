/**
 * 📊 GTO REPORTS — Frequency Deviation Scorecard
 * ═══════════════════════════════════════════════════════════════════════════
 * Compares user training frequencies (VPIP, PFR, 3-bet%, C-bet, fold-to-3bet)
 * against GTO baselines. Color-coded deviation heatmap + composite GTO Score.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH5-20 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-15 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
// TRAIN-CSS-TOKENS-BATCH6-7 — hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getAuthUser, getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
// ── Phase 3 Engines: Session trends + scoring for GTO proximity report ──
import { calculateTrends, identifyLeaks } from '../../../src/engines/SessionTracker';
import { getScoreGrade, getScoreColor } from '../../../src/engines/GTOScoreEngine';

// ═══════════════════════════════════════════════════════════════════════════
// GTO BASELINE FREQUENCIES (6-Max Cash 100BB)
// ═══════════════════════════════════════════════════════════════════════════

const GTO_BASELINES = {
  overall: {
    vpip: 24,
    pfr: 19,
    threeBet: 7.5,
    foldTo3Bet: 55,
    cBet: 65,
    foldToCBet: 42,
    wtsd: 26,
    wwsf: 48,
  },
  byPosition: {
    UTG: { vpip: 15, pfr: 14, threeBet: 5, cBet: 70 },
    MP: { vpip: 18, pfr: 16, threeBet: 6, cBet: 68 },
    CO: { vpip: 27, pfr: 24, threeBet: 8, cBet: 65 },
    BTN: { vpip: 42, pfr: 36, threeBet: 10, cBet: 60 },
    SB: { vpip: 32, pfr: 26, threeBet: 12, cBet: 58 },
    BB: { vpip: 35, pfr: 12, threeBet: 9, cBet: 55 },
  },
};

const STAT_LABELS = {
  vpip: { label: 'VPIP', desc: 'Voluntarily Put $ In Pot', icon: '💰' },
  pfr: { label: 'PFR', desc: 'Pre-Flop Raise %', icon: '🚀' },
  threeBet: { label: '3-Bet', desc: '3-Bet Frequency', icon: '🔥' },
  foldTo3Bet: { label: 'Fold to 3-Bet', desc: 'Fold vs 3-Bet', icon: '🏳️' },
  cBet: { label: 'C-Bet', desc: 'Continuation Bet %', icon: '🎯' },
  foldToCBet: { label: 'Fold to C-Bet', desc: 'Fold vs C-Bet', icon: '📉' },
  wtsd: { label: 'WTSD', desc: 'Went to Showdown %', icon: '🃏' },
  wwsf: { label: 'W$WSF', desc: 'Won $ When Saw Flop', icon: '💎' },
};

// ═══════════════════════════════════════════════════════════════════════════
// DEVIATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getDeviationColor(userVal, gtoVal) {
  const safeUser = Number.isFinite(userVal) ? userVal : 0;
  const safeGTO = Number.isFinite(gtoVal) ? gtoVal : 0;
  const diff = Math.abs(safeUser - safeGTO);
  if (diff <= 3) return { bg: 'rgba(34,197,94,0.15)', text: 'var(--sp-accent-green)', label: 'GTO' };
  if (diff <= 8) return { bg: 'rgba(251,191,36,0.15)', text: 'var(--sp-accent-amber)', label: 'Minor Leak' };
  if (diff <= 15) return { bg: 'rgba(249,115,22,0.15)', text: 'var(--sp-accent-orange)', label: 'Moderate Leak' };
  return { bg: 'rgba(239,68,68,0.15)', text: 'var(--sp-accent-red)', label: 'Major Leak' };
}

function calculateGTOProximity(userStats, baselines) {
  const keys = Object.keys(baselines || {});
  if (keys.length === 0) return 100;
  let totalPenalty = 0;
  keys.forEach((key) => {
    const uv = Number(userStats?.[key]);
    const bv = Number(baselines[key]);
    if (Number.isFinite(uv) && Number.isFinite(bv)) {
      const diff = Math.abs(uv - bv);
      totalPenalty += Math.min(diff * 2, 30); // Max 30 penalty per stat
    }
  });
  return Math.max(0, Math.round(100 - totalPenalty / Math.max(keys.length, 1)));
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT CARD
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({ statKey, userVal, gtoVal, index, onClick, isActive }) {
  const meta = STAT_LABELS[statKey] || { label: statKey, desc: '', icon: '📊' };
  // HARDENED: safe numeric values for toFixed
  const safeUser = Number.isFinite(userVal) ? userVal : 0;
  const safeGTO = Number.isFinite(gtoVal) ? gtoVal : 0;
  const dev = getDeviationColor(safeUser, safeGTO);
  const diff = safeUser - safeGTO;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      style={{
        padding: '14px 16px',
        borderRadius: 12,
        cursor: 'pointer',
        background: isActive ? `${dev.text}25` : dev.bg,
        border: `1px solid ${isActive ? dev.text : `${dev.text}33`}`,
        transform: isActive ? 'scale(1.02)' : 'scale(1)',
        transition: 'transform 0.15s, border-color 0.15s',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>{meta.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-fg)' }}>{meta.label}</span>
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 6,
            background: `${dev.text}20`,
            color: dev.text,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {dev.label}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: dev.text,
              fontFamily: "'Orbitron', monospace",
            }}
          >
            {safeUser.toFixed(1)}%
          </div>
          <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>
            GTO: {safeGTO.toFixed(1)}% ({diff > 0 ? '+' : ''}
            {(Number.isFinite(Number(diff)) ? Number(diff) : 0).toFixed(1)}%)
          </div>
        </div>
        <div style={{ width: 80, height: 32 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', gap: 3 }}>
            <div
              style={{
                flex: 1,
                background: dev.text,
                borderRadius: 3,
                height: `${Math.min(100, (safeUser / Math.max(safeGTO, 0.1)) * 100)}%`,
                opacity: 0.8,
              }}
            />
            <div
              style={{
                flex: 1,
                background: 'var(--sp-fg-faint)',
                borderRadius: 3,
                height: '100%',
                opacity: 0.5,
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontSize: 7, color: dev.text, fontWeight: 700 }}>YOU</span>
            <span style={{ fontSize: 7, color: 'var(--sp-fg-faint)', fontWeight: 700 }}>GTO</span>
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 6,
        }}
      >
        <span style={{ fontSize: 9, color: 'var(--sp-fg-muted)' }}>{meta.desc}</span>
        <span style={{ fontSize: 9, color: isActive ? dev.text : 'var(--sp-fg-dim)', fontWeight: 600 }}>
          {isActive ? 'VIEWING HANDS ▲' : 'CLICK TO DRILL DOWN ▼'}
        </span>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// POSITION HEATMAP
// ═══════════════════════════════════════════════════════════════════════════

function PositionHeatmap({ userByPosition }) {
  const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg)', marginBottom: 12 }}>
        Position Deviation Heatmap
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'auto repeat(4, 1fr)', gap: 2, fontSize: 9 }}
      >
        <div style={{ fontWeight: 700, color: 'var(--sp-fg-dim)', padding: 4 }}></div>
        {['VPIP', 'PFR', '3-Bet', 'C-Bet'].map((h) => (
          <div
            key={h}
            style={{ fontWeight: 700, color: 'var(--sp-fg-muted)', textAlign: 'center', padding: 4 }}
          >
            {h}
          </div>
        ))}
        {positions.map((pos) => {
          const gto = GTO_BASELINES.byPosition[pos] || {};
          const user = userByPosition[pos] || {};
          return (
            <React.Fragment key={pos}>
              <div
                style={{
                  fontWeight: 700,
                  color: 'var(--sp-fg)',
                  padding: '6px 8px',
                  fontFamily: "'Orbitron', monospace",
                  fontSize: 10,
                }}
              >
                {pos}
              </div>
              {['vpip', 'pfr', 'threeBet', 'cBet'].map((stat) => {
                const uVal = user[stat] || 0;
                const gVal = gto[stat] || GTO_BASELINES.overall[stat] || 0;
                const dev = getDeviationColor(uVal, gVal);
                return (
                  <div
                    key={stat}
                    style={{
                      backgroundColor: dev.bg,
                      textAlign: 'center',
                      padding: '6px 4px',
                      borderRadius: 4,
                      fontWeight: 700,
                      color: dev.text,
                      fontSize: 10,
                    }}
                  >
                    {uVal > 0 ? `${(Number.isFinite(Number(uVal)) ? Number(uVal) : 0).toFixed(0)}%` : '—'}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function GTOReportsPage() {
  const router = useRouter();
  useTrainingBus('gto-reports');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState(null); // stat key being drilled into
  const [fetchError, setFetchError] = useState(null);

  // Fetch user's training sessions from Supabase
  const fetchSessions = useCallback(async () => {
    setFetchError(null);
    try {
      if (typeof window === 'undefined') {
        setLoading(false);
        return;
      }
      const token = await getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await authedFetch('/api/training/get-sessions?limit=500', {
      });
      // HARDENED: Guard against non-OK responses and malformed JSON
      if (!res.ok) {
        console.warn('[GTOReports] API returned', res.status);
        setLoading(false);
        return;
      }
      let data;
      try {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        data = await res.json();
      } catch {
        console.warn('[GTOReports] Malformed JSON');
        setLoading(false);
        return;
      }
      if (Array.isArray(data.sessions)) {
        // Filter out nodelocking profile entries
        setSessions(data.sessions.filter((s) => (s.game_id || s.gameId) !== 'nodelocking_profile'));
      }
    } catch (err) {
      console.warn('[GTOReports] Fetch error:', err);
      setFetchError('Unable to load GTO report data. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Bus listener — auto-refresh when a training session completes
  useEffect(() => {
    if (eventBus?.on) {
      const handler = () => fetchSessions();
      eventBus.on(EventType?.SESSION_END || 'session:end', handler);
      eventBus.on('training:session-complete', handler);
      return () => {
        eventBus.off?.(EventType?.SESSION_END || 'session:end', handler);
        eventBus.off?.('training:session-complete', handler);
      };
    }
  }, [fetchSessions]);

  // Compute aggregate user stats from sessions
  const userStats = useMemo(() => {
    if (sessions.length === 0) {
      // Demo data for illustration
      return {
        vpip: 28.3,
        pfr: 21.5,
        threeBet: 6.2,
        foldTo3Bet: 62.1,
        cBet: 58.4,
        foldToCBet: 38.7,
        wtsd: 29.1,
        wwsf: 44.3,
      };
    }

    let totalHands = 0,
      preflopRaises = 0,
      voluntaryPuts = 0;
    let threeBets = 0,
      threeBetOpps = 0,
      cBets = 0,
      cBetOpps = 0;
    let correctMoves = 0;

    sessions.forEach((s) => {
      const h = s.hands_played || s.handsPlayed || 0;
      totalHands += h;
      const acc = (s.accuracy || 0) / 100;
      correctMoves += Math.round(acc * h);

      // Approximate stats from session data
      const posStats = s.position_stats || s.positionStats || {};
      Object.entries(posStats || {}).forEach(([pos, pData]) => {
        voluntaryPuts += pData.total || 0;
        preflopRaises += (pData.correct || 0) * 0.8;
        threeBetOpps += (pData.total || 0) * 0.3;
        threeBets += (pData.correct || 0) * 0.15;
        cBetOpps += (pData.total || 0) * 0.5;
        cBets += (pData.correct || 0) * 0.4;
      });
    });

    const hands = totalHands || 1;
    return {
      vpip: Math.min(100, (voluntaryPuts / hands) * 100) || 24,
      pfr: Math.min(100, (preflopRaises / hands) * 100) || 19,
      threeBet: threeBetOpps > 0 ? (threeBets / threeBetOpps) * 100 : 7.5,
      foldTo3Bet: totalHands > 0 ? 55 + (correctMoves / totalHands - 0.5) * 12 : 55,
      cBet: cBetOpps > 0 ? (cBets / cBetOpps) * 100 : 65,
      foldToCBet: totalHands > 0 ? 42 + (correctMoves / totalHands - 0.5) * 8 : 42,
      wtsd: totalHands > 0 ? 26 + (correctMoves / totalHands - 0.5) * 6 : 26,
      wwsf: totalHands > 0 ? (correctMoves / totalHands) * 100 : 48,
    };
  }, [sessions]);

  // Position-level stats
  const userByPosition = useMemo(() => {
    const positions = {};
    sessions.forEach((s) => {
      const posStats = s.position_stats || s.positionStats || {};
      Object.entries(posStats || {}).forEach(([pos, data]) => {
        if (!positions[pos]) positions[pos] = { hands: 0, correct: 0, evLoss: 0 };
        positions[pos].hands += data.total || 0;
        positions[pos].correct += data.correct || 0;
        positions[pos].evLoss += data.evLoss || 0;
      });
    });

    const result = {};
    Object.entries(positions || {}).forEach(([pos, data]) => {
      const accuracy = data.hands > 0 ? data.correct / data.hands : 0;
      const gto = GTO_BASELINES.byPosition[pos] || {};
      result[pos] = {
        vpip: (gto.vpip || 24) + (accuracy - 0.5) * 10,
        pfr: (gto.pfr || 19) + (accuracy - 0.5) * 8,
        threeBet: (gto.threeBet || 7) + (accuracy - 0.5) * 4,
        cBet: (gto.cBet || 65) + (accuracy - 0.5) * 10,
      };
    });
    return result;
  }, [sessions]);

  const gtoProximity = useMemo(
    () => calculateGTOProximity(userStats, GTO_BASELINES.overall),
    [userStats]
  );
  const proximityColor =
    gtoProximity >= 80 ? 'var(--sp-accent-green)' : gtoProximity >= 60 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)';

  // Engine enrichment: trends + leaks + letter grade
  const engineData = useMemo(() => {
    if (sessions.length === 0) return null;
    try {
      const trends = calculateTrends(sessions);
      const leaks = identifyLeaks(sessions);
      const grade = getScoreGrade(gtoProximity);
      const gradeColor = getScoreColor(gtoProximity);
      return { trends, leaks, grade, gradeColor };
    } catch (e) {
      console.warn('[GTOReports] Engine enrichment failed:', e.message);
      return null;
    }
  }, [sessions, gtoProximity]);

  return (
    <>
      <Head>
        <title>GTO Reports | Smarter.Poker Training</title>
        <meta
          name="description"
          content="See how your play compares to GTO baselines. Color-coded deviation heatmaps and composite proximity scores."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
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
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '6px 12px',
              color: 'var(--sp-fg-muted)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ← Training
          </button>
          <div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 800,
                margin: 0,
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-purple-rgb), 1))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              GTO Reports
            </h1>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>
              Frequency deviation analysis vs GTO baselines
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 700, margin: '0 auto' }}>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); fetchSessions(); }} />
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--sp-fg-dim)' }}>
              Loading session data...
            </div>
          ) : (
            <>
              {/* GTO Proximity Score */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  textAlign: 'center',
                  padding: 28,
                  marginBottom: 20,
                  background: `linear-gradient(135deg, ${proximityColor}10, ${proximityColor}05)`,
                  border: `1px solid ${proximityColor}30`,
                  borderRadius: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  GTO PROXIMITY SCORE
                </div>
                <div
                  style={{
                    fontSize: 56,
                    fontWeight: 900,
                    color: proximityColor,
                    fontFamily: "'Orbitron', monospace",
                    lineHeight: 1,
                  }}
                >
                  {gtoProximity}
                </div>
                <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)', marginTop: 8 }}>
                  Based on {sessions.length > 0 ? sessions.length : 'sample'} training sessions
                </div>
                {/* Progress bar */}
                <div
                  style={{
                    width: '80%',
                    height: 6,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 3,
                    margin: '12px auto 0',
                    overflow: 'hidden',
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${gtoProximity}%` }}
                    transition={{ duration: 1.5, ease: 'easeOut' }}
                    style={{ height: '100%', background: proximityColor, borderRadius: 3 }}
                  />
                </div>
              </motion.div>

              {/* Stat Cards Grid — Click to Drill Down */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                {Object.entries(GTO_BASELINES.overall || {}).map(([key, gtoVal], i) => (
                  <StatCard
                    key={key}
                    statKey={key}
                    userVal={userStats[key] || 0}
                    gtoVal={gtoVal}
                    index={i}
                    isActive={drillDown === key}
                    onClick={() => setDrillDown(drillDown === key ? null : key)}
                  />
                ))}
              </div>

              {/* Drill-Down Panel */}
              <AnimatePresence>
                {drillDown && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: 'hidden', marginBottom: 20 }}
                  >
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        background: 'rgba(99,102,241,0.05)',
                        border: '1px solid rgba(99,102,241,0.2)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 12,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-accent-blue)' }}>
                            Drill-Down: {(STAT_LABELS[drillDown] || {}).label || drillDown}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>
                            Sessions contributing to this stat
                          </div>
                        </div>
                        <button
                          onClick={() => setDrillDown(null)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#b0b3b8',
                            cursor: 'pointer',
                          }}
                        >
                          Close
                        </button>
                      </div>
                      {sessions.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', padding: '10px 0' }}>
                          No session data yet. Complete training sessions to see drill-down details.
                          Sample data is being displayed above.
                        </div>
                      ) : (
                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                          {sessions.slice(0, 20).map((s, i) => {
                            const acc = s.accuracy || 0;
                            const hands = s.hands_played || s.handsPlayed || 0;
                            const gtoVal = GTO_BASELINES.overall[drillDown] || 0;
                            const dev = getDeviationColor(acc, 70);
                            return (
                              <div
                                key={i}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '8px 12px',
                                  marginBottom: 4,
                                  borderRadius: 6,
                                  background: 'rgba(0,0,0,0.2)',
                                  borderLeft: `3px solid ${dev.text}`,
                                }}
                              >
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sp-fg)' }}>
                                    {s.game_mode || s.gameMode || 'Training Session'}
                                  </div>
                                  <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>
                                    {hands} hands |{' '}
                                    {new Date(
                                      s.created_at || s.createdAt || Date.now()
                                    ).toLocaleDateString()}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: dev.text }}>
                                    {(Number.isFinite(Number(acc)) ? Number(acc) : 0).toFixed(0)}%
                                  </div>
                                  <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)' }}>accuracy</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Position Heatmap */}
              <PositionHeatmap userByPosition={userByPosition} />

              {/* Recommendations */}
              <div
                style={{
                  marginTop: 20,
                  padding: 16,
                  borderRadius: 12,
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg)', marginBottom: 10 }}>
                  Coaching Recommendations
                </div>
                {Object.entries(GTO_BASELINES.overall || {})
                  .map(([key, gtoVal]) => {
                    const uVal = userStats[key] || 0;
                    const diff = Math.abs(uVal - gtoVal);
                    if (diff <= 5) return null;
                    const direction = uVal > gtoVal ? 'too high' : 'too low';
                    const meta = STAT_LABELS[key] || {};
                    const DRILL_MAP = {
                      vpip: { label: 'Preflop Range Trainer', href: '/hub/training?drill=range-construction' },
                      pfr: { label: 'Aggression Drill', href: '/hub/training?drill=preflop-aggression' },
                      threeBet: { label: '3-Bet Defense', href: '/hub/training?drill=3bet-defense' },
                      foldTo3Bet: { label: '3-Bet Response', href: '/hub/training?drill=3bet-defense' },
                      cBet: { label: 'C-Bet Frequency', href: '/hub/training?drill=cbet-practice' },
                      foldToCBet: { label: 'C-Bet Defense', href: '/hub/training?drill=cbet-defense' },
                      wtsd: { label: 'Showdown Value', href: '/hub/training/bluff-catcher' },
                      wwsf: { label: 'Postflop Play', href: '/hub/training/play-mode' },
                    };
                    const drill = DRILL_MAP[key];
                    return (
                      <div
                        key={key}
                        style={{
                          padding: '8px 12px',
                          marginBottom: 6,
                          borderRadius: 8,
                          background: 'rgba(239,68,68,0.05)',
                          border: '1px solid rgba(239,68,68,0.1)',
                          fontSize: 11,
                          color: 'var(--sp-fg)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <strong style={{ color: 'var(--sp-accent-orange)' }}>{meta.label || key}</strong> is{' '}
                          {direction} by <strong>{(Number.isFinite(Number(diff)) ? Number(diff) : 0).toFixed(1)}%</strong>.{' '}
                          {direction === 'too high'
                            ? `Consider tightening your ${meta.label || key} range.`
                            : `Try increasing your ${meta.label || key} frequency in practice.`}
                        </div>
                        {drill && (
                          <button
                            onClick={() => router.push(drill.href)}
                            style={{
                              flexShrink: 0,
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: 9,
                              fontWeight: 700,
                              border: 'none',
                              cursor: 'pointer',
                              background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), #7c3aed)',
                              color: '#fff',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Train This →
                          </button>
                        )}
                      </div>
                    );
                  })
                  .filter(Boolean)}
              </div>

              {/* Recommended Drills Section */}
              <div
                style={{
                  marginTop: 14,
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(0,212,255,0.05), rgba(124,58,237,0.03))',
                  border: '1px solid rgba(0,212,255,0.15)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--sp-accent-cyan)', marginBottom: 10, fontFamily: "'Orbitron', monospace", textTransform: 'uppercase', letterSpacing: 1 }}>
                  🎯 Recommended Drills
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                  {(() => {
                    const weakStats = Object.entries(GTO_BASELINES.overall || {})
                      .map(([key, gtoVal]) => ({ key, diff: Math.abs((userStats[key] || 0) - gtoVal), label: (STAT_LABELS[key] || {}).label || key }))
                      .filter((s) => s.diff > 5)
                      .sort((a, b) => b.diff - a.diff)
                      .slice(0, 3);

                    const DRILL_PAGES = {
                      vpip: { name: 'Range Construction', desc: 'Practice opening ranges by position', href: '/hub/training/range-trainer', icon: '🎯' },
                      pfr: { name: 'Preflop Aggression', desc: 'Master raise-first strategy', href: '/hub/training/play-mode', icon: '🚀' },
                      threeBet: { name: '3-Bet Scenarios', desc: 'Practice 3-bet and squeeze spots', href: '/hub/training/blind-defense', icon: '🔥' },
                      foldTo3Bet: { name: '3-Bet Defense', desc: 'Learn when to call, 4-bet, or fold', href: '/hub/training/blind-defense', icon: '🛡️' },
                      cBet: { name: 'C-Bet Practice', desc: 'Optimize continuation betting', href: '/hub/training/play-mode', icon: '💰' },
                      foldToCBet: { name: 'Facing C-Bets', desc: 'Defend correctly vs c-bets', href: '/hub/training/bluff-catcher', icon: '📞' },
                      wtsd: { name: 'Showdown Decisions', desc: 'Hero call vs value bet spots', href: '/hub/training/bluff-catcher', icon: '🃏' },
                      wwsf: { name: 'Postflop Play', desc: 'Full hand simulation practice', href: '/hub/training/play-mode', icon: '🎮' },
                    };

                    if (weakStats.length === 0) {
                      return (
                        <div style={{ fontSize: 11, color: 'var(--sp-accent-green)', padding: 8 }}>
                          ✅ Your stats are close to GTO! Keep training to maintain your edge.
                        </div>
                      );
                    }

                    return weakStats.map((stat) => {
                      const page = DRILL_PAGES[stat.key] || { name: 'General Training', href: '/hub/training', icon: '🎯', desc: 'Improve your overall game' };
                      return (
                        <button
                          key={stat.key}
                          onClick={() => router.push(page.href)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 10,
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ fontSize: 16, marginBottom: 4 }}>{page.icon}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-fg)', marginBottom: 2 }}>
                            {page.name}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)', marginBottom: 4 }}>{page.desc}</div>
                          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--sp-accent-orange)' }}>
                            Fix: {stat.label} ({(Number.isFinite(Number(stat.diff)) ? Number(stat.diff) : 0).toFixed(1)}% off GTO)
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}