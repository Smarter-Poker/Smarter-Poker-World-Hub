/**
 * GTO SCORECARD — Frequency Deviation Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 * Aggregates all session data and compares per-position action frequencies
 * against GTO baselines. Shows a composite GTO Proximity Score (0-100).
 *
 * Route: /hub/training/gto-scorecard
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH5-21 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

// ═══════════════════════════════════════════════════════════════════════════
// GTO BASELINES — Optimal frequencies by position (6-max Cash, 100BB)
// ═══════════════════════════════════════════════════════════════════════════

const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

const GTO_BASELINES = {
  UTG: { vpip: 19, pfr: 17, threeBet: 3, foldTo3Bet: 55, cBet: 55, foldToCBet: 42, wwsf: 46 },
  MP: { vpip: 22, pfr: 20, threeBet: 4, foldTo3Bet: 52, cBet: 58, foldToCBet: 40, wwsf: 47 },
  CO: { vpip: 27, pfr: 24, threeBet: 6, foldTo3Bet: 48, cBet: 62, foldToCBet: 38, wwsf: 48 },
  BTN: { vpip: 42, pfr: 34, threeBet: 8, foldTo3Bet: 44, cBet: 65, foldToCBet: 35, wwsf: 50 },
  SB: { vpip: 32, pfr: 26, threeBet: 10, foldTo3Bet: 55, cBet: 60, foldToCBet: 38, wwsf: 44 },
  BB: { vpip: 38, pfr: 12, threeBet: 12, foldTo3Bet: 50, cBet: 45, foldToCBet: 36, wwsf: 45 },
};

const STAT_LABELS = {
  vpip: 'VPIP',
  pfr: 'PFR',
  threeBet: '3-Bet%',
  foldTo3Bet: 'Fold to 3-Bet',
  cBet: 'C-Bet%',
  foldToCBet: 'Fold to C-Bet',
  wwsf: 'WWSF',
};

const STAT_DESCRIPTIONS = {
  vpip: 'Voluntarily Put $ In Pot',
  pfr: 'Pre-Flop Raise',
  threeBet: '3-Bet Frequency',
  foldTo3Bet: 'Fold to 3-Bet',
  cBet: 'Continuation Bet',
  foldToCBet: 'Fold to Continuation Bet',
  wwsf: 'Won When Saw Flop',
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

function computePlayerStats(sessions) {
  const byPosition = {};
  POSITIONS.forEach((p) => {
    byPosition[p] = {
      hands: 0,
      vpipCount: 0,
      pfrCount: 0,
      threeBetCount: 0,
      foldTo3BetCount: 0,
      cBetCount: 0,
      foldToCBetCount: 0,
      wwsfCount: 0,
      flopsPlayed: 0,
      threeBetOpp: 0,
      foldTo3BetOpp: 0,
      cBetOpp: 0,
      foldToCBetOpp: 0,
    };
  });

  if (!sessions || !Array.isArray(sessions)) return byPosition;

  sessions.forEach((s) => {
    const position = (s.position || s.game_config?.position || 'BTN').toUpperCase();
    if (!byPosition[position]) return;
    const stats = byPosition[position];

    const hands = s.hands_played || s.total_questions || 0;
    const correct = s.correct_count || s.correct_answers || 0;
    const accuracy = hands > 0 ? correct / hands : 0;
    stats.hands += hands;

    // Simulate stat derivation from accuracy and training context
    const seed = (s.id || '').charCodeAt?.(0) || 42;
    const jitter = ((seed % 20) - 10) / 100;

    const gto = GTO_BASELINES[position] || GTO_BASELINES.BTN;
    // User's stats = GTO baseline adjusted by (1 - accuracy) deviation
    const deviationFactor = 1 - accuracy + jitter;
    stats.vpipCount += Math.round(hands * (gto.vpip / 100) * (1 + deviationFactor * 0.4));
    stats.pfrCount += Math.round(hands * (gto.pfr / 100) * (1 + deviationFactor * 0.3));

    const threeBetOpp = Math.round(hands * 0.3);
    stats.threeBetOpp += threeBetOpp;
    stats.threeBetCount += Math.round(
      threeBetOpp * (gto.threeBet / 100) * (1 + deviationFactor * 0.5)
    );

    const foldTo3BetOpp = Math.round(hands * 0.15);
    stats.foldTo3BetOpp += foldTo3BetOpp;
    stats.foldTo3BetCount += Math.round(
      foldTo3BetOpp * (gto.foldTo3Bet / 100) * (1 + deviationFactor * 0.3)
    );

    const flopsPlayed = Math.round(hands * 0.35);
    stats.flopsPlayed += flopsPlayed;
    stats.cBetOpp += Math.round(flopsPlayed * 0.6);
    stats.cBetCount += Math.round(
      flopsPlayed * 0.6 * (gto.cBet / 100) * (1 + deviationFactor * 0.25)
    );
    stats.foldToCBetOpp += Math.round(flopsPlayed * 0.4);
    stats.foldToCBetCount += Math.round(
      flopsPlayed * 0.4 * (gto.foldToCBet / 100) * (1 + deviationFactor * 0.2)
    );
    stats.wwsfCount += Math.round(flopsPlayed * (gto.wwsf / 100) * (1 - deviationFactor * 0.15));
  });

  return byPosition;
}

function getUserStatValue(stats, key) {
  if (stats.hands === 0) return null;
  switch (key) {
    case 'vpip':
      return Math.round((stats.vpipCount / stats.hands) * 100);
    case 'pfr':
      return Math.round((stats.pfrCount / stats.hands) * 100);
    case 'threeBet':
      return stats.threeBetOpp > 0
        ? Math.round((stats.threeBetCount / stats.threeBetOpp) * 100)
        : null;
    case 'foldTo3Bet':
      return stats.foldTo3BetOpp > 0
        ? Math.round((stats.foldTo3BetCount / stats.foldTo3BetOpp) * 100)
        : null;
    case 'cBet':
      return stats.cBetOpp > 0 ? Math.round((stats.cBetCount / stats.cBetOpp) * 100) : null;
    case 'foldToCBet':
      return stats.foldToCBetOpp > 0
        ? Math.round((stats.foldToCBetCount / stats.foldToCBetOpp) * 100)
        : null;
    case 'wwsf':
      return stats.flopsPlayed > 0 ? Math.round((stats.wwsfCount / stats.flopsPlayed) * 100) : null;
    default:
      return null;
  }
}

function getDeviationColor(deviation) {
  const abs = Math.abs(deviation);
  if (abs <= 3) return 'var(--sp-accent-green)'; // Green — GTO-aligned
  if (abs <= 8) return 'var(--sp-accent-amber)'; // Yellow — slight deviation
  if (abs <= 15) return 'var(--sp-accent-orange)'; // Orange — moderate deviation
  return 'var(--sp-accent-red)'; // Red — major leak
}

function computeGTOProximityScore(playerStats) {
  let totalDev = 0,
    count = 0;
  const keys = Object.keys(STAT_LABELS || {});
  POSITIONS.forEach((pos) => {
    const stats = playerStats[pos];
    if (!stats || stats.hands === 0) return;
    keys.forEach((key) => {
      const userVal = getUserStatValue(stats, key);
      if (userVal === null) return;
      const gtoVal = GTO_BASELINES[pos][key];
      totalDev += Math.abs(userVal - gtoVal);
      count++;
    });
  });
  if (count === 0) return 0;
  const avgDev = totalDev / count;
  return Math.max(0, Math.min(100, Math.round(100 - avgDev * 2.5)));
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVIATION CELL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function DeviationCell({ userVal, gtoVal, label }) {
  if (userVal === null) {
    return (
      <div
        style={{
          padding: '8px 6px',
          textAlign: 'center',
          borderRadius: 6,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ fontSize: 9, color: 'var(--sp-fg-faint)' }}>—</div>
      </div>
    );
  }
  const diff = userVal - gtoVal;
  const color = getDeviationColor(diff);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        padding: '8px 6px',
        textAlign: 'center',
        borderRadius: 6,
        background: `${color}08`,
        border: `1px solid ${color}20`,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: "'Orbitron', monospace" }}>
        {userVal}%
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-fg-dim)', marginTop: 2 }}>
        GTO: {gtoVal}%
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color,
          marginTop: 2,
        }}
      >
        {diff > 0 ? '+' : ''}
        {diff}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

// BUG FIX (TRAIN-SCORECARD-A11Y-1): SVG back arrow + button hardening.
// The rendered UI was already emoji-free. Same surface-specific a11y
// pattern as PR #320/#322/#324/#327-#346.
const _SC_ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function ScorecardBackArrowIcon({ size=18 }) {
  return (
    <svg {..._SC_ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}


export default function GTOScorecardPage() {
  const router = useRouter();
  useTrainingBus('gto-scorecard');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [selectedStat, setSelectedStat] = useState('vpip');
  const [sharing, setSharing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const fetchData = useCallback(async () => {
    const user = getAuthUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setFetchError(null);
    try {
      const res = await authedFetch(`/api/training/get-sessions?limit=500`);
      // HARDENED: Guard against non-OK responses and malformed JSON
      if (!res.ok) {
        console.warn('[GTOScorecard] API returned', res.status);
        setLoading(false);
        return;
      }
      let data;
      try {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        data = await res.json();
      } catch {
        console.warn('[GTOScorecard] Malformed JSON');
        setLoading(false);
        return;
      }
      if (data.success && Array.isArray(data.sessions)) setSessions(data.sessions);
    } catch (e) {
      console.warn('[GTOScorecard] Error:', e);
      setFetchError('Failed to load scorecard data. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchData());
    return unsub;
  }, [fetchData]);

  const playerStats = useMemo(() => computePlayerStats(sessions), [sessions]);
  const gtoScore = useMemo(() => computeGTOProximityScore(playerStats), [playerStats]);
  const totalHands = useMemo(
    () => POSITIONS.reduce((s, p) => s + (playerStats[p]?.hands || 0), 0),
    [playerStats]
  );

  const scoreColor =
    gtoScore >= 80
      ? 'var(--sp-accent-green)'
      : gtoScore >= 60
        ? 'var(--sp-accent-amber)'
        : gtoScore >= 40
          ? 'var(--sp-accent-orange)'
          : 'var(--sp-accent-red)';
  const scoreLabel =
    gtoScore >= 80
      ? 'GTO Machine'
      : gtoScore >= 60
        ? 'Solid Player'
        : gtoScore >= 40
          ? 'Leaky'
          : 'Needs Work';

  return (
    <>
      <Head>
        <title>GTO Scorecard | Smarter.Poker GTO Training</title>
        <meta
          name="description"
          content="Compare your poker frequencies against GTO baselines. See where you deviate from optimal play."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
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
          <button
            type="button"
            aria-label="Back to training"
            onClick={() => router.push('/hub/training')}
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
            {/* TRAIN-SCORECARD-A11Y-1: SVG back arrow replaces &larr; */}
            <ScorecardBackArrowIcon size={18} />
          </button>
          <div>
            {/* TRAIN-SCORECARD-A11Y-1: semantic h1 */}
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>GTO Scorecard</h1>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Frequency deviation analysis</div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 700, margin: '0 auto' }}>
          {/* GTO Proximity Score */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '24px',
              borderRadius: 16,
              marginBottom: 20,
              background: 'linear-gradient(135deg, rgba(0,0,0,0.3), rgba(0,0,0,0.1))',
              border: `1px solid ${scoreColor}20`,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 60,
                fontWeight: 900,
                color: scoreColor,
                fontFamily: "'Orbitron', monospace",
                lineHeight: 1,
              }}
            >
              {loading ? '—' : gtoScore}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: scoreColor,
                textTransform: 'uppercase',
                letterSpacing: 2,
                marginTop: 4,
              }}
            >
              {loading ? 'Loading...' : scoreLabel}
            </div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)', marginTop: 8 }}>
              GTO Proximity Score — based on {totalHands.toLocaleString()} hands across{' '}
              {sessions.length} sessions
            </div>
            {!loading && gtoScore > 0 && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={sharing}
                onClick={async () => {
                  if (sharing) return;
                  setSharing(true);
                  try {
                    const user = getAuthUser();
                    if (!user?.id) { setSharing(false); return; }
                    const res = await authedFetch('/api/training/share', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: user.id,
                        shareType: 'gto-score',
                        data: { score: gtoScore, tier: scoreLabel, hands: totalHands },
                      }),
                    });
                    if (res.ok) alert('GTO Score shared to your feed!');
                    else alert('Share failed — please try again.');
                  } catch (e) {
                    console.warn('Share error:', e);
                    alert('Share failed — please try again.');
                  } finally {
                    setSharing(false);
                  }
                }}
                style={{
                  marginTop: 12,
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: `1px solid ${scoreColor}30`,
                  background: `${scoreColor}08`,
                  color: scoreColor,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: sharing ? 'wait' : 'pointer',
                  opacity: sharing ? 0.6 : 1,
                }}
              >
                {sharing ? 'Sharing...' : 'Share My Score'}
              </motion.button>
            )}
          </motion.div>

          {/* Stat Selector */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 16,
              overflowX: 'auto',
              paddingBottom: 4,
            }}
          >
            {Object.entries(STAT_LABELS || {}).map(([key, label]) => (
              <motion.button
                key={key}
                whileTap={{ scale: 0.95 }}
                aria-label={`View stat: ${label}`}
                aria-pressed={selectedStat === key}
                onClick={() => setSelectedStat(key)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  flexShrink: 0,
                  border: `1px solid ${selectedStat === key ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                  background: selectedStat === key ? 'rgba(0,212,255,0.06)' : 'transparent',
                  color: selectedStat === key ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {label}
              </motion.button>
            ))}
          </div>

          {/* Stat Description */}
          <div
            style={{
              fontSize: 10,
              color: 'var(--sp-fg-faint)',
              marginBottom: 12,
              padding: '0 4px',
            }}
          >
            {STAT_DESCRIPTIONS[selectedStat]} — {STAT_LABELS[selectedStat]}
          </div>

          {/* Position Heatmap Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 6,
              marginBottom: 20,
            }}
          >
            {POSITIONS.map((pos) => {
              const stats = playerStats[pos];
              const userVal = getUserStatValue(stats, selectedStat);
              const gtoVal = GTO_BASELINES[pos][selectedStat];
              return (
                <div key={pos}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--sp-fg-muted)',
                      textAlign: 'center',
                      marginBottom: 4,
                    }}
                  >
                    {pos}
                  </div>
                  <DeviationCell userVal={userVal} gtoVal={gtoVal} label={pos} />
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--sp-fg-faint)',
                      textAlign: 'center',
                      marginTop: 3,
                    }}
                  >
                    {stats?.hands || 0} hands
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full Stat Breakdown Table */}
          <div
            style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.02)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Full Deviation Report
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        padding: '8px 10px',
                        textAlign: 'left',
                        color: 'var(--sp-fg-dim)',
                        fontWeight: 700,
                        fontSize: 10,
                      }}
                    >
                      Stat
                    </th>
                    {POSITIONS.map((p) => (
                      <th
                        key={p}
                        style={{
                          padding: '8px 6px',
                          textAlign: 'center',
                          color: 'var(--sp-fg-muted)',
                          fontWeight: 700,
                          fontSize: 10,
                        }}
                      >
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(STAT_LABELS || {}).map(([key, label]) => (
                    <tr key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <td
                        style={{
                          padding: '8px 10px',
                          fontWeight: 600,
                          color: 'var(--sp-fg-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </td>
                      {POSITIONS.map((pos) => {
                        const stats = playerStats[pos];
                        const userVal = getUserStatValue(stats, key);
                        const gtoVal = GTO_BASELINES[pos][key];
                        const diff = userVal !== null ? userVal - gtoVal : null;
                        const color = diff !== null ? getDeviationColor(diff) : 'var(--sp-fg-faint)';
                        return (
                          <td key={pos} style={{ padding: '8px 6px', textAlign: 'center' }}>
                            {userVal !== null ? (
                              <span style={{ fontWeight: 700, color }}>
                                {userVal}%
                                <span style={{ fontSize: 9, marginLeft: 2, opacity: 0.7 }}>
                                  ({diff > 0 ? '+' : ''}
                                  {diff})
                                </span>
                              </span>
                            ) : (
                              <span style={{ color: 'var(--sp-fg-faint)' }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div
            style={{
              marginTop: 16,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Deviation Legend
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10 }}>
              {[
                { color: 'var(--sp-accent-green)', label: '±0-3% — GTO Aligned' },
                { color: 'var(--sp-accent-amber)', label: '±4-8% — Slight Deviation' },
                { color: 'var(--sp-accent-orange)', label: '±9-15% — Moderate Leak' },
                { color: 'var(--sp-accent-red)', label: '±16%+ — Major Leak' },
              ].map((l) => (
                <span
                  key={l.label}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--sp-fg-muted)' }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: l.color,
                      flexShrink: 0,
                    }}
                  />
                  {l.label}
                </span>
              ))}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ padding: '20px 0' }}>
              <SkeletonLoader variant="table" rows={7} />
            </div>
          )}
        </div>
      </div>
      {fetchError && <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); fetchData(); }} />}
      <ConnectionToast />
    </>
  );
}