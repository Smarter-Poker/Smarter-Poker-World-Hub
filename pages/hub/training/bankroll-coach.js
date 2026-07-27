/**
 * BANKROLL IMPACT COACH — GTO Leaks × Dollar Impact
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Bridges training performance to bankroll — shows estimated dollar impact
 * of GTO leaks at your current stakes.
 *
 * Route: /hub/training/bankroll-coach
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-4 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-4 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
// TRAIN-WIRE-EMPTY-6b — adoption: shared empty-state primitive

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STAKES PRESETS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const STAKES = [
  { id: '1-2', label: '$1/$2', bb: 2 },
  { id: '1-3', label: '$1/$3', bb: 3 },
  { id: '2-5', label: '$2/$5', bb: 5 },
  { id: '5-10', label: '$5/$10', bb: 10 },
  { id: '10-25', label: '$10/$25', bb: 25 },
  { id: '25-50', label: '$25/$50', bb: 50 },
];

const HANDS_PER_HOUR = 30;

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// LEAK CALCULATION ENGINE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function calculateLeakImpact(sessions, bbSize) {
  if (!sessions || sessions.length === 0) return null;

  let totalHands = 0;
  let totalEVLoss = 0;
  let totalCorrect = 0;
  const positionLeaks = {};
  const gameLeaks = {};

  sessions.forEach((s) => {
    const hands = s.hands_played || s.total_questions || 0;
    const correct = s.correct_count || s.correct_answers || 0;
    const evLoss = s.total_ev_loss || 0;
    const gameId = s.game_id || 'unknown';

    totalHands += hands;
    totalEVLoss += evLoss;
    totalCorrect += correct;

    // Track by game category
    const category = gameId.split('-').slice(0, 2).join('-');
    if (!gameLeaks[category]) {
      gameLeaks[category] = {
        hands: 0,
        evLoss: 0,
        correct: 0,
        name: gameId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      };
    }
    gameLeaks[category].hands += hands;
    gameLeaks[category].evLoss += evLoss;
    gameLeaks[category].correct += correct;
  });

  // Calculate key metrics
  const evLossPerHand = totalHands > 0 ? totalEVLoss / totalHands : 0;
  const dollarLossPerHand = evLossPerHand * bbSize;
  const dollarLossPerHour = dollarLossPerHand * HANDS_PER_HOUR;
  const dollarLossPer100 = dollarLossPerHand * 100;
  const accuracy = totalHands > 0 ? Math.round((totalCorrect / totalHands) * 100) : 0;

  // Rank leaks by impact
  const leaks = Object.entries(gameLeaks || {})
    .map(([id, data]) => ({
      id,
      name: data.name,
      hands: data.hands,
      evLoss: data.evLoss,
      accuracy: data.hands > 0 ? Math.round((data.correct / data.hands) * 100) : 0,
      dollarImpact: (data.evLoss / Math.max(data.hands, 1)) * bbSize * HANDS_PER_HOUR,
    }))
    .sort((a, b) => b.dollarImpact - a.dollarImpact)
    .slice(0, 6);

  return {
    totalHands,
    totalEVLoss,
    accuracy,
    evLossPerHand,
    dollarLossPerHand,
    dollarLossPerHour,
    dollarLossPer100,
    leaks,
  };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

// BUG FIX (TRAIN-BANKROLL-A11Y-1): SVG icon components replacing the
// bankroll-coach emojis (● empty-state, ← back). Stakes selector +
// CTA buttons gain type+aria-label. Same surface-specific a11y pattern
// as PR #320/#322/#324/#327-#340.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=18, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function DollarIcon({ size=40 })   { return <_Svg size={size}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></_Svg>; }
function BackArrowIcon({ size=18 }) { return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }


export default function BankrollCoachPage() {
  const router = useRouter();
  useTrainingBus('bankroll-coach');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [selectedStake, setSelectedStake] = useState(STAKES[1]); // Default $1/$3
  const [impact, setImpact] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  const fetchSessions = useCallback(async () => {
    setFetchError(null);
    const user = getAuthUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const res = await authedFetch(`/api/training/get-sessions?limit=300`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success && data.sessions) {
        setSessions(data.sessions);
      }
    } catch (e) {
      console.warn('[BankrollCoach] Fetch error:', e);
      setFetchError('Unable to load session data. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Recalculate when sessions or stakes change
  useEffect(() => {
    if (sessions.length > 0) {
      setImpact(calculateLeakImpact(sessions, selectedStake.bb));
    }
  }, [sessions, selectedStake]);

  // Bus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchSessions());
    return unsub;
  }, [fetchSessions]);

  return (
    <>
      <Head>
        <title>Bankroll Coach | Smarter.Poker GTO Training</title>
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
            {/* TRAIN-BANKROLL-A11Y-1: SVG back arrow */}
            <BackArrowIcon size={18} />
          </button>
          <div>
            {/* TRAIN-BANKROLL-A11Y-1: semantic h1 */}
            <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--sp-fg)', margin: 0 }}>
              Bankroll Impact Coach
            </h1>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>
              See what your leaks cost in real dollars
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); fetchSessions(); }} />
          {/* Stakes Selector */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              YOUR STAKES
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STAKES.map((s) => (
                <motion.button
                  key={s.id}
                  type="button"
                  aria-pressed={selectedStake?.id === s.id}
                  aria-label={`Select stakes: ${s.label || s.id}`}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedStake(s)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: `1px solid ${selectedStake.id === s.id ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    background:
                      selectedStake.id === s.id ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.2)',
                    color: selectedStake.id === s.id ? 'var(--sp-accent-green)' : 'var(--sp-fg-muted)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {s.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--sp-fg-dim)' }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{
                  width: 32,
                  height: 32,
                  margin: '0 auto 12px',
                  border: '2px solid rgba(255,255,255,0.05)',
                  borderTopColor: 'var(--sp-accent-green)',
                  borderRadius: '50%',
                }}
              />
              Calculating your leak impact...
            </div>
          )}

          {/* Main Impact Card */}
          {!loading && impact && (
            <>
              {/* Headline */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  padding: '24px 20px',
                  borderRadius: 16,
                  marginBottom: 16,
                  background:
                    'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 6,
                  }}
                >
                  YOUR LEAKS COST YOU
                </div>
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                  style={{
                    fontSize: 42,
                    fontWeight: 900,
                    color: 'var(--sp-accent-red)',
                    letterSpacing: -1,
                  }}
                >
                  $
                  {(Number.isFinite(impact.dollarLossPerHour)
                    ? Math.abs(impact.dollarLossPerHour)
                    : 0
                  ).toFixed(2)}
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--sp-fg-muted)' }}>/hr</span>
                </motion.div>
                <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', marginTop: 4 }}>
                  at {selectedStake.label} NLH playing {HANDS_PER_HOUR} hands/hr
                </div>
              </motion.div>

              {/* Key Metrics */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    padding: '14px 10px',
                    borderRadius: 12,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--sp-accent-red)' }}>
                    $
                    {(Number.isFinite(impact.dollarLossPer100)
                      ? Math.abs(impact.dollarLossPer100)
                      : 0
                    ).toFixed(0)}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--sp-fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    PER 100 HANDS
                  </div>
                </div>
                <div
                  style={{
                    padding: '14px 10px',
                    borderRadius: 12,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--sp-accent-amber)' }}>
                    {(Number.isFinite(impact.evLossPerHand) ? impact.evLossPerHand : 0).toFixed(2)}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--sp-fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    BB LOST/HAND
                  </div>
                </div>
                <div
                  style={{
                    padding: '14px 10px',
                    borderRadius: 12,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color:
                        impact.accuracy >= 80
                          ? 'var(--sp-accent-green)'
                          : impact.accuracy >= 65
                            ? 'var(--sp-accent-amber)'
                            : 'var(--sp-accent-red)',
                    }}
                  >
                    {impact.accuracy}%
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--sp-fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    GTO ACCURACY
                  </div>
                </div>
              </div>

              {/* Motivational Target */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  marginBottom: 20,
                  background: 'rgba(34,197,94,0.04)',
                  border: '1px solid rgba(34,197,94,0.12)',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700, color: 'var(--sp-accent-green)' }}>Target:</span> Improving to{' '}
                  <span style={{ fontWeight: 800, color: 'var(--sp-accent-green)' }}>
                    {Math.min(impact.accuracy + 10, 100)}%
                  </span>
                  {' accuracy would save you ~'}
                  <span style={{ fontWeight: 800, color: 'var(--sp-accent-green)' }}>
                    $
                    {(Number.isFinite(impact.dollarLossPerHour)
                      ? Math.abs(impact.dollarLossPerHour) * 0.3
                      : 0
                    ).toFixed(2)}
                    /hr
                  </span>
                  {', or '}
                  <span style={{ fontWeight: 800, color: 'var(--sp-accent-green)' }}>
                    $
                    {(Number.isFinite(impact.dollarLossPerHour)
                      ? Math.abs(impact.dollarLossPerHour) * 0.3 * 160
                      : 0
                    ).toFixed(0)}
                    /month
                  </span>
                  {' (20hr/week).'}
                </div>
              </motion.div>

              {/* Top Leaks */}
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 10,
                  }}
                >
                  BIGGEST LEAKS
                </div>
                {impact.leaks.map((leak, i) => (
                  <motion.div
                    key={leak.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 12,
                      marginBottom: 8,
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: i < 2 ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 800,
                          color: i < 2 ? 'var(--sp-accent-red)' : 'var(--sp-accent-amber)',
                        }}
                      >
                        {i + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg)' }}>
                          {leak.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)', marginTop: 1 }}>
                          {leak.accuracy}% accuracy · {leak.hands} hands
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sp-accent-red)' }}>
                        -${(Number.isFinite(leak.dollarImpact) ? leak.dollarImpact : 0).toFixed(2)}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)' }}>per hour</div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Fix It CTA */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                aria-label="Open Autopilot to fix detected leaks"
                onClick={() => router.push('/hub/training/autopilot')}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'linear-gradient(135deg, rgba(var(--sp-accent-green-rgb), 1), #16a34a)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(34,197,94,0.25)',
                  letterSpacing: 0.5,
                }}
              >
                Fix My Leaks (Autopilot)
              </motion.button>
            </>
          )}
          {/* No data */}
          {!loading && !impact && (
            <TrainerEmptyState
              variant="no-data"
              title="Need training data"
              message="Complete some training sessions first. We'll calculate the dollar impact of your leaks."
              cta={{ label: 'Start Training', onClick: () => router.push('/hub/training') }}
            />
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}
