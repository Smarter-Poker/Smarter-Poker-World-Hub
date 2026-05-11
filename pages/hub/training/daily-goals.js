/**
 * DAILY GOALS — Micro-Challenge System
 * ═══════════════════════════════════════════════════════════════════════════
 * Auto-generated daily challenges (volume, accuracy, streaks, diversity)
 * with streak tracking, motivational badges, and Supabase persistence.
 *
 * Route: /hub/training/daily-goals
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';


// BUG FIX (TRAIN-DAILY-GOALS-A11Y-1): SVG icon components replacing the
// seven emojis on the daily-goals surface (header crown/target, streak
// flame, ← back, ✓ completion). Goal definitions get an `iconKind` field;
// GoalIcon switches by kind. Legacy `icon` emoji string preserved for
// back-compat. Same surface-specific a11y pattern as PR #320/#322/#324/
// #327/#328/#329/#330/#331/#332/#333/#334.
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
  const today = new Date().toISOString().slice(0, 10);
  const sessions = sessionsParams || [];
  const todaySessions = sessions.filter((s) => s.created_at && s.created_at.startsWith(today));

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
      color: '#3b82f6',
      icon: '🎯',
    },
    {
      id: 'acc',
      iconKind: 'trending-up',
      label: '75%+ Accuracy Today',
      target: 75,
      current: todayHands >= 10 ? Math.round((todayCorrect / todayHands) * 100) : 0,
      type: 'percent',
      color: '#4ade80',
      icon: '📈',
    },
    {
      id: 'sesh',
      iconKind: 'bolt',
      label: 'Complete 3 Sessions',
      target: 3,
      current: todaySessions.length,
      type: 'count',
      color: '#fbbf24',
      icon: '⚡',
    },
    {
      id: 'div',
      iconKind: 'gamepad',
      label: 'Play 3 Different Games',
      target: 3,
      current: uniqueGames.size,
      type: 'count',
      color: '#a855f7',
      icon: '🎮',
    },
    {
      id: 'peak',
      iconKind: 'flame',
      label: 'Score 90%+ in Any Session',
      target: 90,
      current: bestAccuracy,
      type: 'percent',
      color: '#ef4444',
      icon: '🔥',
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
  const [data, setData] = useState({ goals: [], completeCount: 0, totalGoals: 5 });
  const [streakDays, setStreakDays] = useState(0);
  const [prevComplete, setPrevComplete] = useState(0);
  const [dailyBonus, setDailyBonus] = useState(null); // { available, totalBonus, streakBonus, alreadyClaimed }
  const [fetchError, setFetchError] = useState(null);

  // Load streak
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('daily-goals-streak') || '{}');
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (saved.lastDate === today) setStreakDays(saved.streak || 0);
      else if (saved.lastDate === yesterday) setStreakDays(saved.streak || 0);
      else setStreakDays(0);
    } catch (e) { console.warn('[App] Handled exception:', e); }
  }, []);

  // Fetch daily bonus status
  useEffect(() => {
    async function checkBonus() {
      try {
        const res = await authedFetch('/api/training/daily-bonus');
        if (res.ok) {
          const d = await res.json();
          if (d.success) setDailyBonus(d);
        }
      } catch (e) { console.warn('[App] Handled exception:', e); }
    }
    checkBonus();
  }, []);

  const fetchData = useCallback(async () => {
    setFetchError(null);
    const user = getAuthUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const res = await authedFetch(`/api/training/get-sessions?limit=50`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const d = await res.json();
      if (d.success && d.sessions) {
        const result = generateGoals(d.sessions);
        setData(result);
        // Check if all goals completed — update streak
        if (result.completeCount === result.totalGoals && prevComplete < result.totalGoals) {
          const today = new Date().toISOString().slice(0, 10);
          const newStreak = streakDays + 1;
          setStreakDays(newStreak);
          try {
            localStorage.setItem(
              'daily-goals-streak',
              JSON.stringify({ streak: newStreak, lastDate: today })
            );
          } catch (e) { console.warn('[App] Handled exception:', e); }
          eventBus?.emit?.(
            EventType?.SESSION_END || 'session:end',
            { gameId: 'daily-goals', allComplete: true, streak: newStreak },
            'DailyGoals'
          );
          // Auto-claim daily bonus when all goals complete
          try {
            const bonusRes = await authedFetch('/api/training/daily-bonus', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ claimNow: true }),
            });
            if (bonusRes.ok) {
              const bonusData = await bonusRes.json();
              if (bonusData.claimed) {
                setDailyBonus((prev) => ({ ...prev, available: false, alreadyClaimed: true, diamondsAwarded: bonusData.totalAwarded }));
              }
            }
          } catch (e) { console.warn('[App] Handled exception:', e); }
        }
        setPrevComplete(result.completeCount);
      }
    } catch (e) {
      console.warn('[DailyGoals]', e);
      setFetchError('Unable to load daily goals. Please try again.');
    }
    setLoading(false);
  }, [prevComplete, streakDays]);

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
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: '#e2e8f0',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
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
            {/* TRAIN-DAILY-GOALS-A11Y-1: SVG back arrow */}
            <BackArrowIcon size={18} />
          </button>
          <div>
            {/* TRAIN-DAILY-GOALS-A11Y-1: semantic h1 */}
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Daily Goals</h1>
            <div style={{ fontSize: 11, color: '#64748b' }}>Resets at midnight</div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {loading && (
            <div style={{ padding: '20px 0' }} role="status" aria-label="Loading daily goals">
              <SkeletonLoader variant="rows" rows={4} />
            </div>
          )}

          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); fetchData(); }} />

          {!loading && (
            <>
              {/* Daily Bonus Banner */}
              {dailyBonus && dailyBonus.available && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(245,158,11,0.04))',
                    border: '1px solid rgba(251,191,36,0.2)',
                    marginBottom: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>
                      Daily Bonus Available
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      Complete all goals to claim +{dailyBonus.totalBonus} diamonds
                      {dailyBonus.streakBonus > 0 && (
                        <span style={{ color: '#fbbf24' }}> (includes {dailyBonus.streakBonus} streak bonus)</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#fbbf24' }}>
                    +{dailyBonus.totalBonus}
                  </div>
                </motion.div>
              )}
              {dailyBonus && dailyBonus.alreadyClaimed && (
                <div
                  style={{
                    padding: '10px 16px',
                    borderRadius: 10,
                    background: 'rgba(34,197,94,0.06)',
                    border: '1px solid rgba(34,197,94,0.15)',
                    marginBottom: 16,
                    fontSize: 12,
                    color: '#4ade80',
                    fontWeight: 600,
                    textAlign: 'center',
                  }}
                >
                  Daily bonus claimed — +{dailyBonus.diamondsAwarded || dailyBonus.totalBonus} diamonds
                </div>
              )}

              {/* Header Summary */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <div
                  style={{
                    flex: 1,
                    padding: '20px',
                    borderRadius: 16,
                    background:
                      data.completeCount === data.totalGoals
                        ? 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(0,0,0,0.2))'
                        : 'rgba(0,0,0,0.2)',
                    border: `1px solid ${data.completeCount === data.totalGoals ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.05)'}`,
                    textAlign: 'center',
                  }}
                >
                  {/* TRAIN-DAILY-GOALS-A11Y-1: SVG crown/target replaces 👑/🎯 */}
                  <div style={{ fontSize: 48, marginBottom: 8, display: 'inline-flex', justifyContent: 'center', color: data.completeCount === data.totalGoals ? '#4ade80' : '#94a3b8' }} aria-hidden>
                    {data.completeCount === data.totalGoals ? <CrownIcon size={48} /> : <TargetIcon size={48} />}
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      color: data.completeCount === data.totalGoals ? '#4ade80' : '#e2e8f0',
                    }}
                    role="status"
                    aria-label={`${data.completeCount} of ${data.totalGoals} goals completed`}
                  >
                    {data.completeCount}/{data.totalGoals}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginTop: 4,
                    }}
                  >
                    Goals Completed
                  </div>
                </div>
                {/* Streak */}
                <div
                  style={{
                    width: 100,
                    padding: '20px 12px',
                    borderRadius: 16,
                    background: streakDays > 0 ? 'rgba(251,191,36,0.05)' : 'rgba(0,0,0,0.2)',
                    border: `1px solid ${streakDays > 0 ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.05)'}`,
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* TRAIN-DAILY-GOALS-A11Y-1: SVG flame replaces 🔥 */}
                  <div style={{ fontSize: 24, color: streakDays > 0 ? '#fbbf24' : '#475569', display: 'inline-flex' }} aria-hidden>
                    <FlameIcon size={24} />
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 900,
                      color: streakDays > 0 ? '#fbbf24' : '#475569',
                    }}
                    role="status"
                    aria-label={`${streakDays} day streak`}
                  >
                    {streakDays}
                  </div>
                  <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>
                    day streak
                  </div>
                </div>
              </div>

              {/* All Complete Banner */}
              {data.completeCount === data.totalGoals && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 10,
                    background:
                      'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(251,191,36,0.08))',
                    border: '1px solid rgba(34,197,94,0.2)',
                    marginBottom: 16,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>
                    All goals complete! +25 diamonds earned
                  </div>
                </motion.div>
              )}

              {/* Goals List */}
              <AnimatePresence>
                {data.goals.map((g, i) => {
                  const isComplete = g.current >= g.target;
                  const percent = Math.min(100, (g.current / g.target) * 100);
                  return (
                    <motion.div
                      key={g.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.1 }}
                      style={{
                        padding: '16px',
                        borderRadius: 16,
                        marginBottom: 12,
                        background: isComplete ? `${g.color}15` : 'rgba(0,0,0,0.2)',
                        border: `1px solid ${isComplete ? `${g.color}30` : 'rgba(255,255,255,0.05)'}`,
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {/* TRAIN-DAILY-GOALS-A11Y-1: SVG GoalIcon replaces emoji */}
                          <div style={{ fontSize: 20, color: isComplete ? g.color : '#94a3b8', display: 'inline-flex' }} aria-hidden>
                            <GoalIcon kind={g.iconKind} size={20} />
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: isComplete ? '#fff' : '#e2e8f0',
                            }}
                          >
                            {g.label}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: isComplete ? g.color : '#94a3b8',
                          }}
                        >
                          {g.current}{' '}
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>
                            / {g.target}
                            {g.type === 'percent' ? '%' : ''}
                          </span>
                        </div>
                      </div>
                      {/* Progress Bar */}
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          background: 'rgba(255,255,255,0.05)',
                          overflow: 'hidden',
                        }}
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
                          style={{
                            height: '100%',
                            background: isComplete
                              ? g.color
                              : `linear-gradient(90deg, ${g.color}66, ${g.color})`,
                            borderRadius: 3,
                          }}
                        />
                      </div>
                      {isComplete && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: g.color,
                            marginTop: 8,
                            textAlign: 'right',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckIcon size={12} />COMPLETED</span>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              <motion.button
                type="button"
                aria-label="Back to training"
                whileTap={{ scale: 0.97 }}
                onClick={() => router.push('/hub/training')}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e2e8f0',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginTop: 12,
                }}
              >
                Back to Training
              </motion.button>
            </>
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}
