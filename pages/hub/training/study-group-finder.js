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

// TRAIN-CSS-TOKENS-BATCH5-56 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
// TRAIN-WIRE-EMPTY-9b — adoption: shared empty-state primitive

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
    avatarKind: 'shark',
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
    avatarKind: 'trophy',
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
    avatarKind: 'book',
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
    avatarKind: 'bolt',
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
    avatarKind: 'target',
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
    avatarKind: 'swords',
    avatar: '⚔️',
  },
];

const FORMATS = ['All', 'Cash', 'Tournament', 'Live Cash', 'PLO', 'Spins'];
const LEVELS = ['Any', 'Beginner', 'Intermediate', 'Advanced'];

// BUG FIX (TRAIN-STUDYFINDER-A11Y-1): SVG icons replacing the study-group
// avatar emoji set (🦈 🏆 📚 ⚡ 🎯 ⚔️) plus ✓ applied indicator and ← back.
// Groups gain avatarKind discriminator; AvatarIcon renders by kind. Legacy
// `avatar` emoji string preserved. Same surface-specific a11y pattern as
// PR #320/#322/#324/#327-#357.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=24, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function SharkIcon({ size=24 })    { return <_Svg size={size}><path d="M2 12c4-6 9-7 13-5 3 2 5 5 7 8-3 1-7 1-10-1-3-2-7-2-10-2z"/><circle cx="9" cy="11" r="0.6" fill="currentColor"/></_Svg>; }
function TrophyIcon({ size=24 })   { return <_Svg size={size}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></_Svg>; }
function BookIcon({ size=24 })     { return <_Svg size={size}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></_Svg>; }
function BoltIcon({ size=24 })     { return <_Svg size={size}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></_Svg>; }
function TargetIcon({ size=24 })   { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function SwordsIcon({ size=24 })   { return <_Svg size={size}><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><polyline points="19 21 21 21 21 19 14 12"/></_Svg>; }
function CheckIcon({ size=12 })    { return <_Svg size={size}><polyline points="20 6 9 17 4 12"/></_Svg>; }
function BackArrowIcon({ size=18 }){ return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function AvatarIcon({ kind, size=24 }) {
  switch (kind) {
    case 'shark':  return <SharkIcon size={size}/>;
    case 'trophy': return <TrophyIcon size={size}/>;
    case 'book':   return <BookIcon size={size}/>;
    case 'bolt':   return <BoltIcon size={size}/>;
    case 'target': return <TargetIcon size={size}/>;
    case 'swords': return <SwordsIcon size={size}/>;
    default:       return <TargetIcon size={size}/>;
  }
}


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
    } catch (e) { console.warn('[App] Handled exception:', e); }
  }, []);

  const applyGroup = useCallback(
    (gId) => {
      if (applied.includes(gId)) return;
      const next = [...applied, gId];
      setApplied(next);
      try {
        localStorage.setItem('study-group-applied', JSON.stringify(next));
      } catch (e) { console.warn('[App] Handled exception:', e); }

      // Save to Supabase
      const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
      if (token) {
        authedFetch('/api/training/save-session', {
          method: 'POST',
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
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
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
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                padding: '6px 10px',
                borderRadius: 6,
              }}
            >
              {/* TRAIN-STUDYFINDER-A11Y-1: SVG back arrow */}
              <BackArrowIcon size={18} />
            </button>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Study Group Finder</div>
              <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>
                {MOCK_GROUPS.length} groups · {applied.length} applied
              </div>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreate(!showCreate)}
            style={{
              background: 'var(--sp-accent-blue)',
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
                    style={{ fontSize: 11, color: 'var(--sp-fg-dim)', lineHeight: 1.5, marginBottom: 12 }}
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
                        color: 'var(--sp-fg)',
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
                        color: 'var(--sp-fg)',
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
                        color: 'var(--sp-fg)',
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
                        color: 'var(--sp-fg)',
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
                      background: 'var(--sp-accent-blue)',
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
              color: 'var(--sp-fg)',
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
                  border: `1px solid ${filterFmt === f ? 'var(--sp-accent-blue)' : 'rgba(255,255,255,0.08)'}`,
                  background: filterFmt === f ? 'rgba(59,130,246,0.08)' : 'transparent',
                  color: filterFmt === f ? '#60a5fa' : 'var(--sp-fg-dim)',
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
            <span style={{ fontSize: 10, color: 'var(--sp-fg-faint)', fontWeight: 600 }}>Level:</span>
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setFilterLevel(l)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: `1px solid ${filterLevel === l ? 'var(--sp-accent-purple)' : 'transparent'}`,
                  background: filterLevel === l ? 'rgba(168,85,247,0.06)' : 'transparent',
                  color: filterLevel === l ? 'var(--sp-accent-purple)' : 'var(--sp-fg-faint)',
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
                    color: sortBy === s.k ? 'var(--sp-fg-muted)' : 'var(--sp-fg-faint)',
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
            <TrainerEmptyState
              variant="no-data"
              title="No groups match"
              message="Try a different filter combination to find study groups."
              compact
            />
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
                        {/* TRAIN-STUDYFINDER-A11Y-1: SVG AvatarIcon */}
                        <span style={{ fontSize: 24, display: 'inline-flex' }} aria-hidden>
                          <AvatarIcon kind={g.avatarKind} size={24} />
                        </span>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                            {g.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>{g.focus}</div>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          fontSize: 11,
                          color: 'var(--sp-fg-muted)',
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
                            color: isFull ? 'var(--sp-accent-red)' : slotsLeft <= 2 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-green)',
                          }}
                        >
                          {g.members}/{g.max}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--sp-fg-faint)' }}>
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
                              : 'var(--sp-accent-blue)',
                          border: isApplied
                            ? '1px solid #4ade80'
                            : `1px solid ${isFull ? 'rgba(255,255,255,0.05)' : 'transparent'}`,
                          color: isApplied ? 'var(--sp-accent-green)' : isFull ? 'var(--sp-fg-faint)' : '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: isApplied || isFull ? 'not-allowed' : 'pointer',
                          minWidth: 120,
                        }}
                      >
                        {isApplied ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Applied <CheckIcon size={12} /></span> : isFull ? 'Full' : 'Apply'}
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