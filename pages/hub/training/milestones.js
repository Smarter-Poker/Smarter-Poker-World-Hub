/**
 * TRAINING MILESTONES — Achievement Timeline
 * ═══════════════════════════════════════════════════════════════════════════
 * Visual timeline of career milestones auto-detected from session history.
 *
 * Route: /hub/training/milestones
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';

const TIERS = {
  Bronze: { color: '#cd7f32', bg: 'rgba(205,127,50,0.1)', reward: '+50 Diamonds' },
  Silver: { color: '#cbd5e1', bg: 'rgba(203,213,225,0.1)', reward: '+150 Diamonds' },
  Gold: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', reward: '+500 Diamonds' },
  Diamond: { color: '#00d4ff', bg: 'rgba(0,212,255,0.1)', reward: 'Profile Badge' },
  Master: { color: '#a855f7', bg: 'rgba(168,85,247,0.1)', reward: 'Master Title' },
};

const MILESTONE_DEFS = [
  // Sessions
  {
    id: 'sess-1',
    tier: 'Bronze',
    name: 'First Steps',
    desc: 'Complete your first training session',
    icon: '🎯',
    getProgress: (s) => ({ c: s.totalSessions, t: 1 }),
  },
  {
    id: 'sess-10',
    tier: 'Silver',
    name: 'Getting Serious',
    desc: 'Complete 10 training sessions',
    icon: '📈',
    getProgress: (s) => ({ c: s.totalSessions, t: 10 }),
  },
  {
    id: 'sess-50',
    tier: 'Gold',
    name: 'Dedicated Pro',
    desc: 'Complete 50 training sessions',
    icon: '🔥',
    getProgress: (s) => ({ c: s.totalSessions, t: 50 }),
  },
  {
    id: 'sess-100',
    tier: 'Diamond',
    name: 'Centurion',
    desc: 'Complete 100 training sessions',
    icon: '💎',
    getProgress: (s) => ({ c: s.totalSessions, t: 100 }),
  },
  {
    id: 'sess-500',
    tier: 'Master',
    name: 'Library Scholar',
    desc: 'Complete 500 training sessions',
    icon: '📚',
    getProgress: (s) => ({ c: s.totalSessions, t: 500 }),
  },

  // Hands
  {
    id: 'hands-100',
    tier: 'Bronze',
    name: 'Century Club',
    desc: 'Train on 100 hands',
    icon: '💯',
    getProgress: (s) => ({ c: s.totalHands, t: 100 }),
  },
  {
    id: 'hands-500',
    tier: 'Silver',
    name: 'Grinder',
    desc: 'Train on 500 hands',
    icon: '⚡',
    getProgress: (s) => ({ c: s.totalHands, t: 500 }),
  },
  {
    id: 'hands-1000',
    tier: 'Gold',
    name: 'Iron Will',
    desc: 'Train on 1,000 hands',
    icon: '🏋️',
    getProgress: (s) => ({ c: s.totalHands, t: 1000 }),
  },
  {
    id: 'hands-5000',
    tier: 'Diamond',
    name: 'Volume Monster',
    desc: 'Train on 5,000 hands',
    icon: '🐉',
    getProgress: (s) => ({ c: s.totalHands, t: 5000 }),
  },
  {
    id: 'hands-10k',
    tier: 'Master',
    name: 'GTO Zenith',
    desc: 'Train on 10,000 hands',
    icon: '🌌',
    getProgress: (s) => ({ c: s.totalHands, t: 10000 }),
  },

  // Accuracy
  {
    id: 'acc-60',
    tier: 'Bronze',
    name: 'Finding Range',
    desc: 'Achieve 60% overall accuracy',
    icon: '⚖️',
    getProgress: (s) => ({ c: s.avgAccuracy, t: 60 }),
  },
  {
    id: 'acc-70',
    tier: 'Silver',
    name: 'Above Average',
    desc: 'Achieve 70% overall accuracy',
    icon: '📊',
    getProgress: (s) => ({ c: s.avgAccuracy, t: 70 }),
  },
  {
    id: 'acc-80',
    tier: 'Gold',
    name: 'Sharp Shooter',
    desc: 'Achieve 80% overall accuracy',
    icon: '🎯',
    getProgress: (s) => ({ c: s.avgAccuracy, t: 80 }),
  },
  {
    id: 'acc-90',
    tier: 'Diamond',
    name: 'GTO Machine',
    desc: 'Achieve 90% overall accuracy',
    icon: '🤖',
    getProgress: (s) => ({ c: s.avgAccuracy, t: 90 }),
  },
  {
    id: 'acc-95',
    tier: 'Master',
    name: 'Solver Incarnate',
    desc: 'Achieve 95% overall accuracy',
    icon: '🔮',
    getProgress: (s) => ({ c: s.avgAccuracy, t: 95 }),
  },

  // Streaks
  {
    id: 'streak-3',
    tier: 'Bronze',
    name: 'On a Roll',
    desc: '3 consecutive training days',
    icon: '🏃',
    getProgress: (s) => ({ c: s.maxStreak, t: 3 }),
  },
  {
    id: 'streak-7',
    tier: 'Silver',
    name: 'Week Warrior',
    desc: '7 consecutive training days',
    icon: '🗓️',
    getProgress: (s) => ({ c: s.maxStreak, t: 7 }),
  },
  {
    id: 'streak-14',
    tier: 'Gold',
    name: 'Fortnight Focus',
    desc: '14 consecutive training days',
    icon: '⭐',
    getProgress: (s) => ({ c: s.maxStreak, t: 14 }),
  },
  {
    id: 'streak-30',
    tier: 'Diamond',
    name: 'Monthly Legend',
    desc: '30 consecutive training days',
    icon: '🏆',
    getProgress: (s) => ({ c: s.maxStreak, t: 30 }),
  },
  {
    id: 'streak-100',
    tier: 'Master',
    name: 'Unstoppable Force',
    desc: '100 consecutive training days',
    icon: '🌋',
    getProgress: (s) => ({ c: s.maxStreak, t: 100 }),
  },

  // Variety
  {
    id: 'var-3',
    tier: 'Bronze',
    name: 'Explorer',
    desc: 'Train on 3 different game types',
    icon: '🔍',
    getProgress: (s) => ({ c: s.uniqueGames, t: 3 }),
  },
  {
    id: 'var-5',
    tier: 'Silver',
    name: 'Variety Pack',
    desc: 'Train on 5 different game types',
    icon: '🎲',
    getProgress: (s) => ({ c: s.uniqueGames, t: 5 }),
  },
  {
    id: 'var-10',
    tier: 'Gold',
    name: 'Well Rounded',
    desc: 'Train on 10 different game types',
    icon: '🌟',
    getProgress: (s) => ({ c: s.uniqueGames, t: 10 }),
  },
  {
    id: 'var-15',
    tier: 'Diamond',
    name: 'Polymath',
    desc: 'Train on 15 different game types',
    icon: '🧠',
    getProgress: (s) => ({ c: s.uniqueGames, t: 15 }),
  },
  {
    id: 'var-20',
    tier: 'Master',
    name: 'Omniscient',
    desc: 'Train on 20 different game types',
    icon: '👁️',
    getProgress: (s) => ({ c: s.uniqueGames, t: 20 }),
  },

  // Special
  {
    id: 'perf-1',
    tier: 'Gold',
    name: 'Perfect Round',
    desc: 'Score 100% in a single session',
    icon: '👑',
    getProgress: (s) => ({ c: s.hadPerfect ? 1 : 0, t: 1 }),
  },
];

function computeStats(sessions) {
  if (!sessions || sessions.length === 0)
    return {
      totalSessions: 0,
      totalHands: 0,
      avgAccuracy: 0,
      hadPerfect: false,
      maxStreak: 0,
      uniqueGames: 0,
    };

  let totalHands = 0,
    totalCorrect = 0,
    hadPerfect = false;
  const gameSet = new Set();
  const daySet = new Set();

  sessions.forEach((s) => {
    const h = s.hands_played || s.total_questions || 0;
    const c = s.correct_count || s.correct_answers || 0;
    totalHands += h;
    totalCorrect += c;
    if (h > 0 && c === h) hadPerfect = true;
    if (s.game_id) gameSet.add(s.game_id);
    if (s.created_at) daySet.add(new Date(s.created_at).toISOString().slice(0, 10));
  });

  const sortedDays = Array.from(daySet).sort();
  let maxStreak = sortedDays.length > 0 ? 1 : 0,
    currentStreak = sortedDays.length > 0 ? 1 : 0;
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1]);
    const curr = new Date(sortedDays[i]);
    const diff = (curr - prev) / 86400000;
    if (diff === 1) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else currentStreak = 1;
  }

  return {
    totalSessions: sessions.length,
    totalHands,
    avgAccuracy: totalHands > 0 ? Math.round((totalCorrect / totalHands) * 100) : 0,
    hadPerfect,
    maxStreak,
    uniqueGames: gameSet.size,
  };
}

export default function MilestonesPage() {
  const router = useRouter();
  useTrainingBus('milestones');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const fetchData = useCallback(async () => {
    const user = getAuthUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/training/get-sessions?limit=500`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success && data.sessions) setStats(computeStats(data.sessions));
      else setStats(computeStats([]));
    } catch (e) {
      console.error('[Milestones] Error:', e);
      setStats(computeStats([]));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useEffect(() => {
    const h = () => fetchData();
    eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
    return () => eventBus.off(EventType?.SESSION_END || 'training:session-complete', h);
  }, [fetchData]);

  const processed = useMemo(() => {
    if (!stats) return [];
    return MILESTONE_DEFS.map((m) => {
      const p = m.getProgress(stats);
      const percent = Math.min(100, Math.max(0, (p.c / p.t) * 100));
      return { ...m, current: p.c, target: p.t, percent, earned: percent >= 100 };
    });
  }, [stats]);

  const earned = processed.filter((m) => m.earned);
  const locked = processed.filter((m) => !m.earned).sort((a, b) => b.percent - a.percent);

  // Spotlight: The unearned milestone with the highest completion %
  const nextMilestone = locked[0];

  return (
    <>
      <Head>
        <title>Milestones | Smarter.Poker GTO Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh',
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>Milestones</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Your Tiered Achievements</div>
          </div>
          <div
            style={{
              marginLeft: 'auto',
              padding: '4px 10px',
              borderRadius: 6,
              background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.2)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24' }}>{earned.length}</span>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>/{MILESTONE_DEFS.length}</span>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{
                  width: 32,
                  height: 32,
                  margin: '0 auto 12px',
                  border: '2px solid rgba(255,255,255,0.05)',
                  borderTopColor: '#fbbf24',
                  borderRadius: '50%',
                }}
              />
              Loading milestones...
            </div>
          ) : (
            <>
              {/* Next Milestone Spotlight */}
              {nextMilestone && (
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  style={{
                    marginBottom: 24,
                    padding: '20px',
                    borderRadius: 16,
                    background:
                      'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                    border: '1px solid rgba(255,255,255,0.1)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: -40,
                      right: -40,
                      fontSize: 120,
                      opacity: 0.05,
                    }}
                  >
                    {nextMilestone.icon}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: '#00d4ff',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 12,
                    }}
                  >
                    UP NEXT
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                    <div
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 12,
                        background: TIERS[nextMilestone.tier].bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 24,
                        border: `1px solid ${TIERS[nextMilestone.tier].color}40`,
                      }}
                    >
                      {nextMilestone.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                        {nextMilestone.name}{' '}
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: TIERS[nextMilestone.tier].bg,
                            color: TIERS[nextMilestone.tier].color,
                            marginLeft: 8,
                          }}
                        >
                          {nextMilestone.tier}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        {nextMilestone.desc}
                      </div>
                    </div>
                  </div>
                  {/* Big Progress Bar */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        marginBottom: 6,
                        fontWeight: 700,
                      }}
                    >
                      <span style={{ color: '#00d4ff' }}>
                        {Math.round(nextMilestone.percent)}% Complete
                      </span>
                      <span style={{ color: '#64748b' }}>
                        {nextMilestone.current} / {nextMilestone.target}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 10,
                        background: 'rgba(0,0,0,0.4)',
                        borderRadius: 5,
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${nextMilestone.percent}%` }}
                        style={{
                          height: '100%',
                          background: 'linear-gradient(90deg, #00d4ff, #3b82f6)',
                        }}
                      />
                    </div>
                  </div>
                  {/* Reward */}
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 11,
                      color: '#4ade80',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>🎁 Reward:</span>{' '}
                    <span style={{ color: '#e2e8f0' }}>{TIERS[nextMilestone.tier].reward}</span>
                  </div>
                </motion.div>
              )}

              {/* Earned Milestones */}
              {earned.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                    }}
                  >
                    EARNED
                  </div>
                  {earned.map((m, i) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 12,
                        marginBottom: 8,
                        background: `linear-gradient(135deg, ${TIERS[m.tier].bg}, rgba(0,0,0,0))`,
                        border: `1px solid ${TIERS[m.tier].color}40`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: TIERS[m.tier].bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                        }}
                      >
                        {m.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <div
                            style={{ fontSize: 14, fontWeight: 700, color: TIERS[m.tier].color }}
                          >
                            {m.name}
                          </div>
                          <div
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: '#64748b',
                              textTransform: 'uppercase',
                            }}
                          >
                            {m.tier}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#e2e8f0', marginTop: 2 }}>{m.desc}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14 }}>✅</div>
                        <div
                          style={{ fontSize: 9, color: '#4ade80', marginTop: 4, fontWeight: 700 }}
                        >
                          REWARDED
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Locked In Progress */}
              {locked.length > (nextMilestone ? 1 : 0) && (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                    }}
                  >
                    IN PROGRESS
                  </div>
                  {locked
                    .filter((m) => m.id !== nextMilestone?.id)
                    .map((m, i) => (
                      <div
                        key={m.id}
                        style={{
                          padding: '12px 16px',
                          borderRadius: 12,
                          marginBottom: 6,
                          background: 'rgba(0,0,0,0.2)',
                          border: '1px solid rgba(255,255,255,0.04)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: 'rgba(255,255,255,0.03)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 16,
                            filter: 'grayscale(1)',
                            opacity: 0.5,
                          }}
                        >
                          {m.icon}
                        </div>
                        <div style={{ flex: 1, opacity: 0.8 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
                              {m.name}
                            </div>
                            <div
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                color: TIERS[m.tier].color,
                                opacity: 0.5,
                              }}
                            >
                              {m.tier}
                            </div>
                          </div>
                          <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                            {m.desc}
                          </div>

                          {/* Mini Progress Bar */}
                          <div
                            style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}
                          >
                            <div
                              style={{
                                flex: 1,
                                height: 4,
                                background: 'rgba(0,0,0,0.5)',
                                borderRadius: 2,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${m.percent}%`,
                                  height: '100%',
                                  background: TIERS[m.tier].color,
                                  opacity: 0.5,
                                }}
                              />
                            </div>
                            <div
                              style={{
                                fontSize: 9,
                                color: '#475569',
                                minWidth: 30,
                                textAlign: 'right',
                              }}
                            >
                              {Math.round(m.percent)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
