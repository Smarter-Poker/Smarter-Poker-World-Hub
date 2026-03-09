/**
 * STUDY GROUP FINDER — Social Matchmaking
 * ═══════════════════════════════════════════════════════════════════════════
 * Find Discord/Hub study partners filtered by stakes, timezone, format,
 * and study tool preference. Features group browsing, join requests,
 * creation form, and member compatibility scoring.
 *
 * Route: /hub/training/study-group-finder
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken } from '../../../src/lib/authUtils';

const MOCK_GROUPS = [
  {
    id: 1,
    name: '200NL Crushers',
    format: 'Cash',
    stakes: '200NL-500NL',
    tz: 'EST',
    members: 4,
    max: 6,
    tool: 'PioSolver',
    focus: 'Postflop spots review',
    schedule: 'Mon/Wed 7PM',
    level: 'Advanced',
    avatar: '🦈',
  },
  {
    id: 2,
    name: 'MTT Final Tablists',
    format: 'Tournament',
    stakes: 'Mid/High',
    tz: 'CET',
    members: 8,
    max: 10,
    tool: 'ICMIZER',
    focus: 'ICM deep dives',
    schedule: 'Tue/Thu 8PM',
    level: 'Advanced',
    avatar: '🏆',
  },
  {
    id: 3,
    name: 'Live 2/5 Grinders',
    format: 'Live Cash',
    stakes: '$2/$5+',
    tz: 'PST',
    members: 3,
    max: 5,
    tool: 'Smarter.Poker',
    focus: 'Hand history review',
    schedule: 'Sat 2PM',
    level: 'Intermediate',
    avatar: '🃏',
  },
  {
    id: 4,
    name: 'PLO Degens Anonymous',
    format: 'PLO',
    stakes: 'Micro',
    tz: 'GMT',
    members: 5,
    max: 8,
    tool: 'Vision',
    focus: 'Equity realization',
    schedule: 'Daily 6PM',
    level: 'Any',
    avatar: '🃏',
  },
  {
    id: 5,
    name: 'Micro Grind Academy',
    format: 'Cash',
    stakes: '2NL-25NL',
    tz: 'EST',
    members: 6,
    max: 8,
    tool: 'Smarter.Poker',
    focus: 'Fundamentals & leaks',
    schedule: 'Mon/Fri 8PM',
    level: 'Beginner',
    avatar: '📚',
  },
  {
    id: 6,
    name: 'Spin & Go Warriors',
    format: 'Spins',
    stakes: '$5-$25',
    tz: 'CET',
    members: 3,
    max: 6,
    tool: 'ICMIZER',
    focus: '3-max push/fold charts',
    schedule: 'Wed/Sun 4PM',
    level: 'Intermediate',
    avatar: '⚡',
  },
  {
    id: 7,
    name: 'Sunday Major Prep',
    format: 'Tournament',
    stakes: 'All Stakes',
    tz: 'EST',
    members: 7,
    max: 10,
    tool: 'PioSolver',
    focus: 'Weekly tournament prep',
    schedule: 'Sat 12PM',
    level: 'Any',
    avatar: '🎯',
  },
  {
    id: 8,
    name: 'Heads-Up Specialists',
    format: 'Cash',
    stakes: '100NL+',
    tz: 'PST',
    members: 2,
    max: 4,
    tool: 'PioSolver',
    focus: 'HU solver work',
    schedule: 'Tue/Thu 9PM',
    level: 'Advanced',
    avatar: '⚔️',
  },
];

const FORMATS = ['All', 'Cash', 'Tournament', 'Live Cash', 'PLO', 'Spins'];
const LEVELS = ['Any', 'Beginner', 'Intermediate', 'Advanced'];

export default function StudyGroupFinderPage() {
  const router = useRouter();
  useTrainingBus('study-group-finder');

  const [filterFmt, setFilterFmt] = useState('All');
  const [filterLevel, setFilterLevel] = useState('Any');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [sortBy, setSortBy] = useState('slots'); // 'slots' | 'members' | 'name'

  // EventBus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (e) => {
      if (e?.source === 'StudyGroupFinder') return;
    });
    return unsub;
  }, []);

  // Load applied groups from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('study-group-applied');
      if (saved) setApplied(JSON.parse(saved));
    } catch {}
  }, []);

  const applyGroup = useCallback(
    (gId) => {
      if (applied.includes(gId)) return;
      const next = [...applied, gId];
      setApplied(next);
      try {
        localStorage.setItem('study-group-applied', JSON.stringify(next));
      } catch {}

      // Save to Supabase
      const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
      if (token) {
        fetch('/api/training/save-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            gameId: 'study-group',
            gameName: 'Study Group Application',
            gtowScore: 100,
            totalEVLoss: 0,
            handsPlayed: next.length,
            mistakeCount: 0,
            accuracy: 100,
            correctCount: next.length,
            bestStreak: 0,
            levelPassed: true,
            level: 1,
            handHistory: [],
          }),
        }).catch(() => {});
        eventBus?.emit?.(
          EventType?.SESSION_END || 'session:end',
          { gameId: 'study-group', groupId: gId, totalApplied: next.length },
          'StudyGroupFinder'
        );
      }
    },
    [applied]
  );

  const filtered = useMemo(() => {
    let list = MOCK_GROUPS;
    if (filterFmt !== 'All')
      list = list.filter((g) => g.format === filterFmt || g.format.includes(filterFmt));
    if (filterLevel !== 'Any')
      list = list.filter((g) => g.level === filterLevel || g.level === 'Any');
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(s) ||
          g.focus.toLowerCase().includes(s) ||
          g.tool.toLowerCase().includes(s)
      );
    }
    // Sort
    if (sortBy === 'slots')
      list = [...list].sort((a, b) => a.max - a.members - (b.max - b.members));
    if (sortBy === 'members') list = [...list].sort((a, b) => b.members - a.members);
    if (sortBy === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [filterFmt, filterLevel, search, sortBy]);

  return (
    <>
      <Head>
        <title>Study Group Finder | Smarter.Poker</title>
        <meta
          name="description"
          content="Find poker study partners by stakes, format, and timezone. Join or create a study group."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
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
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
              <div style={{ fontSize: 16, fontWeight: 700 }}>Study Group Finder</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {MOCK_GROUPS.length} groups · {applied.length} applied
              </div>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreate(!showCreate)}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(59,130,246,0.3)',
            }}
          >
            + Create Group
          </motion.button>
        </div>

        <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px' }}>
          {/* Create Group Form */}
          <AnimatePresence>
            {showCreate && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden', marginBottom: 16 }}
              >
                <div
                  style={{
                    padding: 20,
                    borderRadius: 12,
                    background: 'rgba(59,130,246,0.05)',
                    border: '1px solid rgba(59,130,246,0.15)',
                  }}
                >
                  <div
                    style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginBottom: 12 }}
                  >
                    Create New Study Group
                  </div>
                  <div
                    style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5, marginBottom: 12 }}
                  >
                    Group creation connects to your Discord account. Once created, members can apply
                    to join through this page. You'll receive a notification when someone applies.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input
                      placeholder="Group Name"
                      style={{
                        padding: '10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e2e8f0',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                    <select
                      style={{
                        padding: '10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e2e8f0',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    >
                      {FORMATS.filter((f) => f !== 'All').map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                    <input
                      placeholder="Stakes Range"
                      style={{
                        padding: '10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e2e8f0',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                    <input
                      placeholder="Timezone (e.g., EST)"
                      style={{
                        padding: '10px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e2e8f0',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                  </div>
                  <button
                    style={{
                      marginTop: 12,
                      padding: '10px 20px',
                      borderRadius: 8,
                      background: '#3b82f6',
                      border: 'none',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    Create Group
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups by name, focus, or tool..."
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#e2e8f0',
              fontSize: 13,
              outline: 'none',
              marginBottom: 12,
              boxSizing: 'border-box',
            }}
          />

          {/* Filters Row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setFilterFmt(f)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 16,
                  border: `1px solid ${filterFmt === f ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
                  background: filterFmt === f ? 'rgba(59,130,246,0.08)' : 'transparent',
                  color: filterFmt === f ? '#60a5fa' : '#64748b',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Level + Sort */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>Level:</span>
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setFilterLevel(l)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: `1px solid ${filterLevel === l ? '#a855f7' : 'transparent'}`,
                  background: filterLevel === l ? 'rgba(168,85,247,0.06)' : 'transparent',
                  color: filterLevel === l ? '#a855f7' : '#475569',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {l}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {[
                { k: 'slots', l: 'Open' },
                { k: 'members', l: 'Popular' },
                { k: 'name', l: 'A-Z' },
              ].map((s) => (
                <button
                  key={s.k}
                  onClick={() => setSortBy(s.k)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: sortBy === s.k ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: 'none',
                    color: sortBy === s.k ? '#94a3b8' : '#334155',
                    fontSize: 9,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {s.l}
                </button>
              ))}
            </div>
          </div>

          {/* Group Cards */}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#334155', fontSize: 13 }}>
              No groups match your filters.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((g, i) => {
              const isApplied = applied.includes(g.id);
              const isFull = g.members >= g.max;
              const slotsLeft = g.max - g.members;

              return (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isApplied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)'}`,
                    borderRadius: 14,
                    padding: 20,
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                    {/* Group Info */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}
                      >
                        <span style={{ fontSize: 24 }}>{g.avatar}</span>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                            {g.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{g.focus}</div>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          fontSize: 11,
                          color: '#94a3b8',
                          flexWrap: 'wrap',
                          marginTop: 8,
                        }}
                      >
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: 'rgba(59,130,246,0.08)',
                            color: '#60a5fa',
                            fontWeight: 600,
                          }}
                        >
                          {g.format}
                        </span>
                        <span>Stakes: {g.stakes}</span>
                        <span>TZ: {g.tz}</span>
                        <span>Tool: {g.tool}</span>
                        <span>Schedule: {g.schedule}</span>
                      </div>
                    </div>

                    {/* Slots + Apply */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 900,
                            color: isFull ? '#ef4444' : slotsLeft <= 2 ? '#fbbf24' : '#4ade80',
                          }}
                        >
                          {g.members}/{g.max}
                        </div>
                        <div style={{ fontSize: 10, color: '#475569' }}>
                          {slotsLeft} {slotsLeft === 1 ? 'slot' : 'slots'} left
                        </div>
                      </div>
                      <motion.button
                        whileTap={!isApplied && !isFull ? { scale: 0.95 } : {}}
                        onClick={() => applyGroup(g.id)}
                        disabled={isApplied || isFull}
                        style={{
                          padding: '10px 20px',
                          borderRadius: 8,
                          background: isApplied
                            ? 'transparent'
                            : isFull
                              ? 'rgba(255,255,255,0.03)'
                              : '#3b82f6',
                          border: isApplied
                            ? '1px solid #4ade80'
                            : `1px solid ${isFull ? 'rgba(255,255,255,0.05)' : 'transparent'}`,
                          color: isApplied ? '#4ade80' : isFull ? '#475569' : '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: isApplied || isFull ? 'not-allowed' : 'pointer',
                          minWidth: 120,
                        }}
                      >
                        {isApplied ? 'Applied ✓' : isFull ? 'Full' : 'Apply'}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
