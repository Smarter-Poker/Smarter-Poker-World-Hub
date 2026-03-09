/**
 * COMMUNITY LEADERBOARD — Global Training Rankings
 * ═══════════════════════════════════════════════════════════════════════════
 * Global leaderboard with accuracy, sessions, streaks. Weekly and all-time.
 * Category-specific rankings with player profile previews.
 *
 * Route: /hub/training/community-leaderboard
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';

import useSWR, { useSWRConfig } from 'swr';

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORIES = [
  { id: 'overall', label: 'Overall', icon: '🏆' },
  { id: 'preflop', label: 'Preflop', icon: '🃏' },
  { id: 'postflop', label: 'Postflop', icon: '🎯' },
  { id: 'streaks', label: 'Streaks', icon: '🔥' },
];

function getAvatarColor(str) {
  if (!str) return '#00d4ff';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 50%)`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function CommunityLeaderboardPage() {
  const router = useRouter();
  useTrainingBus('community-leaderboard');
  const [user, setUser] = useState(null);
  const [category, setCategory] = useState('overall');
  const [period, setPeriod] = useState('weekly');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const u = getAuthUser();
    if (u) setUser(u);
  }, []);

  // 🔌 Bus listener: auto-refresh leaderboard when a training session completes
  const { mutate } = useSWRConfig();
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => {
      mutate((key) => typeof key === 'string' && key.startsWith('/api/training/leaderboard'));
    });
    return unsub;
  }, [mutate]);

  // Fetch real leaderboard data
  const swrKey = `/api/training/leaderboard?period=${period === 'weekly' ? 'weekly' : 'alltime'}&limit=50`;
  const { data: swrData, isLoading: loading } = useSWR(swrKey, (url) =>
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error('Failed to load leaderboard');
        return data.leaderboard.map((entry) => ({
          id: entry.userId,
          name: entry.username || 'Anonymous',
          accuracy: entry.accuracy || 0,
          sessions: entry.sessionsCompleted || 0,
          hands: entry.questionsCorrect || 0, // Approx
          streak: entry.bestStreak || 0,
          score: category === 'streaks' ? entry.bestStreak || 0 : entry.accuracy || 0,
          avatarColor: getAvatarColor(entry.userId),
        }));
      })
  );

  // Sort and rank entries
  const entries = (swrData || [])
    .sort((a, b) => b.score - a.score)
    .map((e, i) => ({ ...e, rank: i + 1, isYou: user?.id === e.id }));

  const userEntry = entries.find((e) => e.isYou);
  const topThree = entries.slice(0, 3);
  const restEntries = entries.slice(3);

  if (!mounted) return null;

  return (
    <>
      <Head>
        <title>Leaderboard | Smarter.Poker GTO Training</title>
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>Community Leaderboard</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Global GTO rankings</div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* Period Toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {['weekly', 'alltime'].map((p) => (
              <motion.button
                key={p}
                whileTap={{ scale: 0.97 }}
                onClick={() => setPeriod(p)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 8,
                  border: `1px solid ${period === p ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                  background: period === p ? 'rgba(0,212,255,0.06)' : 'transparent',
                  color: period === p ? '#00d4ff' : '#64748b',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {p === 'weekly' ? 'This Week' : 'All Time'}
              </motion.button>
            ))}
          </div>

          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto' }}>
            {CATEGORIES.map((c) => (
              <motion.button
                key={c.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => setCategory(c.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  flexShrink: 0,
                  border: `1px solid ${category === c.id ? 'rgba(251,191,36,0.2)' : 'transparent'}`,
                  background: category === c.id ? 'rgba(251,191,36,0.06)' : 'transparent',
                  color: category === c.id ? '#fbbf24' : '#64748b',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {c.icon} {c.label}
              </motion.button>
            ))}
          </div>

          {/* Top 3 Podium */}
          {!loading && topThree.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap: 6,
                marginBottom: 20,
              }}
            >
              {[topThree[1], topThree[0], topThree[2]].map((p, i) => {
                const heights = [80, 100, 65];
                const medals = ['🥈', '🥇', '🥉'];

                if (!p) return <div key={`empty-podium-${i}`} style={{ flex: 1 }} />;

                return (
                  <motion.div
                    key={p.id || `podium-slot-${i}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '12px 6px',
                      borderRadius: 12,
                      height: heights[i],
                      background: p.isYou ? 'rgba(0,212,255,0.06)' : 'rgba(0,0,0,0.2)',
                      border: `1px solid ${p.isYou ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{medals[i]}</div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        marginBottom: 2,
                        color: p.isYou ? '#00d4ff' : '#e2e8f0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.name}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fbbf24' }}>{p.score}</div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Your Position */}
          {userEntry && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                marginBottom: 16,
                background: 'rgba(0,212,255,0.04)',
                border: '1px solid rgba(0,212,255,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: 'rgba(0,212,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                    color: '#00d4ff',
                  }}
                >
                  #{userEntry.rank}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#00d4ff' }}>Your Rank</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#00d4ff' }}>
                {userEntry.score}
                {category !== 'streaks' ? '%' : 'd'}
              </div>
            </div>
          )}

          {/* Remaining Entries */}
          {!loading &&
            restEntries.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  marginBottom: 4,
                  background: entry.isYou ? 'rgba(0,212,255,0.04)' : 'transparent',
                  border: `1px solid ${entry.isYou ? 'rgba(0,212,255,0.1)' : 'transparent'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 24,
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#475569',
                      textAlign: 'center',
                    }}
                  >
                    {entry.rank}
                  </div>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: entry.avatarColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#fff',
                    }}
                  >
                    {entry.name.charAt(0)}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: entry.isYou ? 800 : 600,
                        color: entry.isYou ? '#00d4ff' : '#e2e8f0',
                      }}
                    >
                      {entry.name}
                    </div>
                    <div style={{ fontSize: 9, color: '#475569' }}>
                      {entry.hands} hands · {entry.sessions} sessions
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color:
                      entry.score >= 80 ? '#4ade80' : entry.score >= 65 ? '#fbbf24' : '#f87171',
                  }}
                >
                  {entry.score}
                  {category !== 'streaks' ? '%' : 'd'}
                </div>
              </motion.div>
            ))}

          {loading && (
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
              Loading rankings...
            </div>
          )}
        </div>
      </div>
    </>
  );
}
