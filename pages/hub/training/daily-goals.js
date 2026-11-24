/**
 * DAILY GOALS - #SMARTERCASINOREALISM MICRO-CHALLENGE VAULT
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Auto-generated daily challenges (volume, accuracy, streaks, diversity)
 * with streak tracking, motivational badges, and Supabase persistence.
 *
 * Route: /hub/training/daily-goals
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-9 - hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-DAILY-GOALS-A11Y-1 - semantic SVG icons and accessible daily goal plates
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';
import casinoStyles from '../../../src/styles/training/daily-goals-casino.module.css';

const HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
};

const BOARD_CARDS = ['8d', '5c', '2s', '6h', '3d'];

const BOARD_CARDS_BY_STREET = {
  preflop: [],
  flop: BOARD_CARDS.slice(0, 3),
  turn: BOARD_CARDS.slice(0, 4),
  river: BOARD_CARDS.slice(0, 5),
};

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
function TargetIcon({ size })     { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function TrendingUpIcon({ size }) { return <_Svg size={size}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></_Svg>; }
function BoltIcon({ size })       { return <_Svg size={size}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></_Svg>; }
function GamepadIcon({ size })    { return <_Svg size={size}><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="18.5" cy="11.5" r="1"/><rect x="2" y="6" width="20" height="12" rx="3"/></_Svg>; }
function FlameIcon({ size })      { return <_Svg size={size}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.5-.5-2.5-2-3.5l-2 2c-.5-.5-1-1-1-2 0-1 1.5-2 1.5-2s-3 1-4 3.5C5 14 6 17 8.5 19c1.5 1.5 4 2 5.5 1.5C17 19.5 19 17 19 13c0-3-1-5-2.5-7C15 4 12 2 12 2s1 4-1 7c-.7 1-1.5 1.5-2.5 2.5z"/></_Svg>; }
function CrownIcon({ size })      { return <_Svg size={size}><path d="M2 7l5 5 5-9 5 9 5-5-2 12H4L2 7z"/><path d="M4 19h16"/></_Svg>; }
function CheckIcon({ size })      { return <_Svg size={size}><polyline points="20 6 9 17 4 12"/></_Svg>; }
function BackArrowIcon({ size })  { return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function GoalIcon({ kind, size=20 }) {
  switch (kind) {
    case 'target':      return <TargetIcon size={size}/>;
    case 'trending-up': return <TrendingUpIcon size={size}/>;
    case 'bolt':        return <BoltIcon size={size}/>;
    case 'gamepad':     return <GamepadIcon size={size}/>;
    case 'flame':       return <FlameIcon size={size}/>;
    default:            return <TargetIcon size={size}/>;
  }
}

function generateGoals(sessionsParams) {
  const today = getTodayCST();
  const sessions = sessionsParams || [];
  const todaySessions = sessions.filter((session) => {
    if (!session.created_at) return false;
    const createdAt = new Date(session.created_at);
    return !Number.isNaN(createdAt.getTime()) && getTodayCST(createdAt) === today;
  });

  let todayHands = 0;
  let todayCorrect = 0;
  const uniqueGames = new Set();
  todaySessions.forEach((s) => {
    todayHands += s.hands_played || s.total_questions || 0;
    todayCorrect += s.correct_count || s.correct_answers || 0;
    if (s.game_id) uniqueGames.add(s.game_id);
  });

  // Best accuracy from any single session today
  const bestAccuracy = todaySessions.reduce((best, s) => {
    const acc =
      s.accuracy ||
      (s.correct_count && s.total_questions
        ? Math.round((s.correct_count / s.total_questions) * 100)
        : 0);
    return Math.max(best, acc);
  }, 0);

  const goals = [
    {
      id: 'vol',
      iconKind: 'target',
      label: 'Play 50 Hands',
      target: 50,
      current: todayHands,
      type: 'count',
      color: '#25c8ff',
      icon: '◆',
    },
    {
      id: 'acc',
      iconKind: 'trending-up',
      label: '75%+ Accuracy Today',
      target: 75,
      current: todayHands >= 10 ? Math.round((todayCorrect / todayHands) * 100) : 0,
      type: 'percent',
      color: '#39d59b',
      icon: '▲',
    },
    {
      id: 'sesh',
      iconKind: 'bolt',
      label: 'Complete 3 Sessions',
      target: 3,
      current: todaySessions.length,
      type: 'count',
      color: '#f2b84b',
      icon: '⌁',
    },
    {
      id: 'div',
      iconKind: 'gamepad',
      label: 'Play 3 Different Games',
      target: 3,
      current: uniqueGames.size,
      type: 'count',
      color: '#25c8ff',
      icon: '●',
    },
    {
      id: 'peak',
      iconKind: 'flame',
      label: 'Score 90%+ in Any Session',
      target: 90,
      current: bestAccuracy,
      type: 'percent',
      color: '#f2b84b',
      icon: '▲',
    },
  ];

  return {
    goals,
    completeCount: goals.filter((g) => g.current >= g.target).length,
    totalGoals: goals.length,
  };
}

export default function DailyGoalsPage() {
  const router = useRouter();
  useTrainingBus('daily-goals');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [dailyBonus, setDailyBonus] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [signedOut, setSignedOut] = useState(false);
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [activeStreet, setActiveStreet] = useState('flop');
  const streakDays = Number(dailyBonus?.streakDays) || 0;

  const brainEval = useMemo(() => {
    const heroCards = HERO_CARDS_BY_VARIANT[activeVariant] || HERO_CARDS_BY_VARIANT.nlh;
    const boardCards = BOARD_CARDS_BY_STREET[activeStreet] || BOARD_CARDS_BY_STREET.flop;
    return evaluateTrainingSpotWithHorseBrain({
      variant: activeVariant,
      street: activeStreet,
      heroCards,
      boardCards,
      heroPosition,
      villainPosition: heroPosition === 'BB' ? 'BTN' : 'BB',
      pot: activeStreet === 'preflop' ? 1.5 : 6.5,
      toCall: activeStreet === 'preflop' ? 1 : 2.2,
      effectiveStackBb: 100,
    });
  }, [activeVariant, activeStreet, heroPosition]);

  const arenaHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          gameId: activeVariant === 'nlh' ? 'cash-002' : 'cash-005',
          variant: activeVariant,
          street: activeStreet,
          position: heroPosition,
        },
        'daily-goals',
      ),
    [activeVariant, activeStreet, heroPosition],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const user = getAuthUser();
    if (!user?.id) {
      setSignedOut(true);
      setData(null);
      setDailyBonus(null);
      setLoading(false);
      return;
    }
    setSignedOut(false);
    try {
      const [sessionsResponse, bonusResponse] = await Promise.all([
        authedFetch(`/api/training/get-sessions?limit=50`),
        authedFetch('/api/training/daily-bonus'),
      ]);
      if (!sessionsResponse.ok) {
        throw new Error(`Training history request failed (${sessionsResponse.status})`);
      }
      if (!bonusResponse.ok) {
        throw new Error(`Training streak request failed (${bonusResponse.status})`);
      }
      const [sessionsPayload, bonusPayload] = await Promise.all([
        sessionsResponse.json(),
        bonusResponse.json(),
      ]);
      if (sessionsPayload?.success !== true || !Array.isArray(sessionsPayload.sessions)) {
        throw new Error('Verified Training history was not returned.');
      }
      if (bonusPayload?.success !== true || !Number.isFinite(Number(bonusPayload.streakDays))) {
        throw new Error('Verified Training streak was not returned.');
      }
      setData(generateGoals(sessionsPayload.sessions));
      setDailyBonus(bonusPayload);
    } catch (e) {
      console.warn('[DailyGoals]', e);
      setData(null);
      setDailyBonus(null);
      setFetchError('Unable To Verify Daily Goals And Streak Data. Please Try Again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (e) => {
      if (e?.source === 'DailyGoals') return;
      fetchData();
    });
    return unsub;
  }, [fetchData]);

  return (
    <>
      <Head>
        <title>Daily Goals | Smarter.Poker Training</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={`sp-training-journey sp-training-journey--daily-goals ${casinoStyles.shell}`}>
        <div className={`sp-journey-header ${casinoStyles.header}`}>
          <div className={casinoStyles.headerLead}>
            <button
              type="button"
              aria-label="Back To Training"
              className={casinoStyles.backButton}
              onClick={() => router.push('/hub/training')}
            >
              <BackArrowIcon size={18} />
            </button>
            <div className={casinoStyles.headerCopy}>
              <h1>Daily Goals</h1>
              <div>Casino Realism Vault · Resets At Midnight</div>
            </div>
          </div>

          <nav className={casinoStyles.subpageNav} aria-label="Daily Challenges Subpages">
            <Link href="/hub/training/daily-challenge" className={casinoStyles.navPlate}>
              Hand Of The Day
            </Link>
            <Link href="/hub/training/daily-goals" className={`${casinoStyles.navPlate} ${casinoStyles.navPlateActive}`}>
              Daily Goals Vault
            </Link>
            <Link href="/hub/training/challenges" className={casinoStyles.navPlate}>
              Weekly &amp; Monthly Goals
            </Link>
          </nav>
        </div>

        <div className={`sp-journey-main ${casinoStyles.main}`}>
          {brainEval && (
            <div
              data-specialty-brain-panel="true"
              data-brain-engine={brainEval.engineModule}
              data-recommended-action={brainEval.correctAnswer}
              data-active-variant={activeVariant}
              data-hero-position={heroPosition}
              className={casinoStyles.panel}
              style={{
                padding: '16px 18px',
                marginBottom: 16,
                border: '1px solid rgba(37, 200, 255, 0.35)',
                background: 'rgba(6, 15, 24, 0.85)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 900, color: '#25c8ff', textTransform: 'uppercase' }}>
                  Horse Brain Daily Goal Spot Preview
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#39d59b' }}>
                  Engine: {brainEval.engineModule} | Recommended: {brainEval.correctAnswerText}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#8ca4b0', marginBottom: 4 }}>
                    Variant
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['nlh', 'plo4', 'plo5', 'plo6'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        data-variant-option={v}
                        aria-pressed={activeVariant === v}
                        onClick={() => setActiveVariant(v)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 2,
                          border: activeVariant === v ? '1px solid #25c8ff' : '1px solid rgba(255,255,255,0.16)',
                          background: activeVariant === v ? 'rgba(37, 200, 255, 0.2)' : 'rgba(255,255,255,0.04)',
                          color: activeVariant === v ? '#e8fbff' : '#cbd5e1',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {v.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#8ca4b0', marginBottom: 4 }}>
                    Position
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['BTN', 'CO', 'SB', 'BB'].map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        data-position-option={pos}
                        aria-pressed={heroPosition === pos}
                        onClick={() => setHeroPosition(pos)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 2,
                          border: heroPosition === pos ? '1px solid #39d59b' : '1px solid rgba(255,255,255,0.16)',
                          background: heroPosition === pos ? 'rgba(57, 213, 155, 0.18)' : 'rgba(255,255,255,0.04)',
                          color: heroPosition === pos ? '#39d59b' : '#cbd5e1',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#8ca4b0', marginBottom: 4 }}>
                    Street
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['preflop', 'flop', 'turn', 'river'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        data-street-option={st}
                        aria-pressed={activeStreet === st}
                        onClick={() => setActiveStreet(st)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 2,
                          border: activeStreet === st ? '1px solid #f2b84b' : '1px solid rgba(255,255,255,0.16)',
                          background: activeStreet === st ? 'rgba(242, 184, 75, 0.18)' : 'rgba(255,255,255,0.04)',
                          color: activeStreet === st ? '#f2b84b' : '#cbd5e1',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {st.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.55, marginBottom: 12 }}>
                {brainEval.explanation}
              </div>

              <button
                type="button"
                data-launch-club-arena-cta="true"
                onClick={() => router.push(arenaHref)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 2,
                  border: '1px solid #25c8ff',
                  background: 'rgba(37, 200, 255, 0.2)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Launch Daily Goal Spot In Club Arena →
              </button>
            </div>
          )}

          {loading && (
            <div style={{ padding: '20px 0' }} role="status" aria-label="Loading Daily Goals">
              <SkeletonLoader variant="rows" rows={4} />
            </div>
          )}

          {!loading && signedOut && (
            <div className={casinoStyles.panel} role="status" style={{ padding: '20px 18px', marginBottom: 16 }}>
              <strong style={{ display: 'block', color: '#f2f7f9', fontSize: 16, marginBottom: 6 }}>
                Sign In To View Daily Goals
              </strong>
              <span style={{ color: '#9cb0ba', fontSize: 13, lineHeight: 1.6, display: 'block' }}>
                Goal Progress And Streaks Come From Your Verified Training Sessions.
              </span>
              <button
                type="button"
                className={casinoStyles.returnButton}
                onClick={() => router.push('/auth/login?redirect=/hub/training/daily-goals')}
              >
                Sign In
              </button>
            </div>
          )}

          {!loading && !signedOut && (fetchError || !data || !dailyBonus) && (
            <ErrorBanner
              message={fetchError || 'Verified Daily Goal Data Is Unavailable.'}
              onRetry={fetchData}
            />
          )}

          {!loading && !signedOut && !fetchError && data && dailyBonus && (
            <>
              {/* Daily Bonus Status */}
              {dailyBonus?.settlementStatus === 'verified_completion_required' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`${casinoStyles.panel} ${casinoStyles.bonusPanel}`}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f2b84b' }}>
                      Daily Bonus Settlement Paused
                    </div>
                    <div style={{ fontSize: 12, color: '#a8bbc4', marginTop: 4 }}>
                      Goal Progress Is Live. No Daily-Goal Currency Is Promised Until Settlement Is Bound To A Verified Completion.
                    </div>
                  </div>
                </motion.div>
              )}
              {dailyBonus && dailyBonus.alreadyClaimed && (
                <div
                  className={`${casinoStyles.panel} ${casinoStyles.claimedPanel}`}
                  style={{
                    fontSize: 12,
                    color: '#39d59b',
                    fontWeight: 700,
                  }}
                >
                  Daily Bonus Claimed - +{dailyBonus.diamondsAwarded || dailyBonus.totalBonus} Diamonds
                </div>
              )}

              {/* Header Summary */}
              <div className={casinoStyles.summaryGrid}>
                <div className={`${casinoStyles.panel} ${casinoStyles.summaryPanel}`}>
                  <div
                    style={{
                      fontSize: 48,
                      marginBottom: 8,
                      display: 'inline-flex',
                      justifyContent: 'center',
                      color: data.completeCount === data.totalGoals ? '#39d59b' : '#25c8ff',
                    }}
                    aria-hidden
                  >
                    {data.completeCount === data.totalGoals ? <CrownIcon size={44} /> : <TargetIcon size={44} />}
                  </div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 900,
                      color: data.completeCount === data.totalGoals ? '#39d59b' : '#f2f7f9',
                      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                    }}
                    role="status"
                    aria-label={`${data.completeCount} of ${data.totalGoals} goals completed`}
                  >
                    {data.completeCount}/{data.totalGoals}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#8ca4b0',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginTop: 4,
                      fontWeight: 700,
                    }}
                  >
                    Goals Completed
                  </div>
                </div>

                {/* Streak */}
                <div className={`${casinoStyles.panel} ${casinoStyles.streakPanel}`}>
                  <div
                    style={{
                      fontSize: 24,
                      color: streakDays > 0 ? '#f2b84b' : '#6c8593',
                      display: 'inline-flex',
                      marginBottom: 4,
                    }}
                    aria-hidden
                  >
                    <FlameIcon size={26} />
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      color: streakDays > 0 ? '#f2b84b' : '#8ca4b0',
                      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                    }}
                    role="status"
                    aria-label={`${streakDays} day streak`}
                  >
                    {streakDays}
                  </div>
                  <div style={{ fontSize: 12, color: '#8ca4b0', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                    Day Streak
                  </div>
                </div>
              </div>

              {/* All Complete Banner */}
              {data.completeCount === data.totalGoals && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`${casinoStyles.panel} ${casinoStyles.completePanel}`}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#39d59b' }}>
                    All Goals Complete For Today
                  </div>
                </motion.div>
              )}

              {/* Goals List */}
              {(() => {
                const goals = Array.isArray(data?.goals) ? data.goals : [];
                if (goals.length === 0) {
                  return (
                    <TrainerEmptyState
                      variant="no-data"
                      title="No Daily Goals Found"
                      message="Start A Verified Training Session To Populate Your Daily Challenges."
                      compact
                    />
                  );
                }
                return null;
              })()}
              <AnimatePresence>
                {(data.goals || []).map((g, i) => {
                  const isComplete = g.current >= g.target;
                  const percent = Math.min(100, (g.current / g.target) * 100);
                  return (
                    <motion.div
                      key={g.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className={`${casinoStyles.goalPanel} ${isComplete ? casinoStyles.goalComplete : ''}`}
                    >
                      <div className={casinoStyles.goalHeading}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ fontSize: 20, color: isComplete ? '#39d59b' : g.color, display: 'inline-flex' }} aria-hidden>
                            <GoalIcon kind={g.iconKind} size={20} />
                          </div>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 700,
                              color: isComplete ? '#ffffff' : '#eaf2f6',
                            }}
                          >
                            {g.label}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: isComplete ? '#39d59b' : '#25c8ff',
                            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                          }}
                        >
                          {g.current}{' '}
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#8ca4b0' }}>
                            / {g.target}
                            {g.type === 'percent' ? '%' : ''}
                          </span>
                        </div>
                      </div>
                      {/* Progress Bar */}
                      <div
                        className={casinoStyles.goalProgress}
                        role="progressbar"
                        aria-label={`${g.label} progress`}
                        aria-valuenow={Math.round(percent)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percent}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                          className={casinoStyles.goalProgressFill}
                          style={{
                            background: isComplete
                              ? '#39d59b'
                              : `linear-gradient(90deg, ${g.color}, #f2b84b)`,
                          }}
                        />
                      </div>
                      {isComplete && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#39d59b',
                            marginTop: 8,
                            textAlign: 'right',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <CheckIcon size={12} />Completed
                          </span>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              <motion.button
                type="button"
                aria-label="Back To Training"
                className={casinoStyles.returnButton}
                whileTap={{ scale: 0.97 }}
                onClick={() => router.push('/hub/training')}
              >
                Back To Training
              </motion.button>
            </>
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}
