/**
 * TRAINING ACTIVITY FEED — Social Training Updates
 * ═══════════════════════════════════════════════════════════════════════════
 * Social feed showing what friends are training. See achievements,
 * session completions, and streak milestones from your network.
 *
 * Route: /hub/training/training-feed
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

// ═══════════════════════════════════════════════════════════════════════════
// FEED EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

// BUG FIX (TRAIN-FEED-A11Y-1): EVENT_TYPES gains an iconKind discriminator
// so the rendered icon comes from a typed SVG component (EventIcon) instead
// of an emoji string. Legacy `icon` emoji string preserved for any external
// consumer reading the data shape. Same surface-specific a11y pattern as
// PR #320/#322/#324/#327/#328/#329/#330/#331.
const EVENT_TYPES = {
  session:     { icon: '🎯', iconKind: 'target',  color: '#3b82f6', label: 'Training' },
  streak:      { icon: '🔥', iconKind: 'flame',   color: '#f97316', label: 'Streak' },
  achievement: { icon: '🏆', iconKind: 'trophy',  color: '#fbbf24', label: 'Badge' },
  mastery:     { icon: '⭐', iconKind: 'star',    color: '#a855f7', label: 'Mastery' },
  leaderboard: { icon: '📊', iconKind: 'chart',   color: '#22c55e', label: 'Rank Up' },
};

const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=12, viewBox='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={viewBox}>{children}</svg>;
}
function TargetSvg({ size })   { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function FlameSvg({ size })    { return <_Svg size={size}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.5-.5-2.5-2-3.5l-2 2c-.5-.5-1-1-1-2 0-1 1.5-2 1.5-2s-3 1-4 3.5C5 14 6 17 8.5 19c1.5 1.5 4 2 5.5 1.5C17 19.5 19 17 19 13c0-3-1-5-2.5-7C15 4 12 2 12 2s1 4-1 7c-.7 1-1.5 1.5-2.5 2.5z"/></_Svg>; }
function TrophySvg({ size })   { return <_Svg size={size}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></_Svg>; }
function StarSvg({ size })     { return <_Svg size={size}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></_Svg>; }
function ChartSvg({ size })    { return <_Svg size={size}><line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="13" width="3" height="7"/><rect x="10" y="8" width="3" height="12"/><rect x="15" y="4" width="3" height="16"/></_Svg>; }
function UserSvg({ size })     { return <_Svg size={size}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></_Svg>; }
function AntennaSvg({ size })  { return <_Svg size={size}><path d="M5 10a7 7 0 0 1 14 0"/><path d="M9 13a3 3 0 0 1 6 0"/><line x1="12" y1="3" x2="12" y2="21"/></_Svg>; }
function BackArrowSvg({ size }) { return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function EventIcon({ kind, size=10 }) {
  switch (kind) {
    case 'target': return <TargetSvg size={size}/>;
    case 'flame':  return <FlameSvg size={size}/>;
    case 'trophy': return <TrophySvg size={size}/>;
    case 'star':   return <StarSvg size={size}/>;
    case 'chart':  return <ChartSvg size={size}/>;
    default:       return <TargetSvg size={size}/>;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEED ENGINE (real user data + simulated community activity)
// ═══════════════════════════════════════════════════════════════════════════

// Simple seed-based pseudo-random to avoid Math.random() flicker on re-renders
function seededRandom(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 49241;
  return x - Math.floor(x);
}

const FRIEND_NAMES = [
  'PokerPro_Mike',
  'AceHunter99',
  'GTO_Sarah',
  'Riverbluff_Dan',
  'ChipStack_King',
  'FlushDraw_Amy',
  'NittyGritty',
  'RangeWizard',
];

const GAME_NAMES = [
  'BB Defense',
  'BTN Opens',
  'C-Bet Mastery',
  'River Bluffs',
  '3-Bet Pots',
  'MTT Push/Fold',
  'Turn Barrels',
  'SB Strategy',
  'Position Mastery',
  'Pot Geometry',
  'ICM Decisions',
  'Bluff Catching',
];

function generateFeedItems(userSessions) {
  const items = [];
  const now = Date.now();

  // Add user's own recent sessions
  if (userSessions && userSessions.length > 0) {
    userSessions.slice(0, 3).forEach((s, i) => {
      items.push({
        id: `user-${i}`,
        type: 'session',
        user: 'You',
        isYou: true,
        game:
          s.game_id?.replace(/-/g, ' ')?.replace(/\b\w/g, (l) => l.toUpperCase()) || 'GTO Training',
        accuracy:
          s.accuracy || Math.round((s.correct_count / Math.max(s.hands_played, 1)) * 100) || 0,
        handsPlayed: s.hands_played || s.total_questions || 0,
        timestamp: new Date(s.created_at).getTime(),
        avatarColor: '#00d4ff',
      });
    });
  }

  // Generate simulated community activity (seeded for deterministic renders)
  const daySeed = Math.floor(now / 86400000); // changes once per day
  for (let i = 0; i < 12; i++) {
    const friendName = FRIEND_NAMES[i % FRIEND_NAMES.length];
    const minutesAgo = Math.floor(seededRandom(daySeed + i) * 1440) + 5;
    const type = i < 6 ? 'session' : i < 9 ? 'streak' : i < 11 ? 'achievement' : 'mastery';

    const item = {
      id: `community-${i}`,
      type,
      user: friendName,
      isYou: false,
      simulated: true,
      timestamp: now - minutesAgo * 60000,
      avatarColor: `hsl(${(i * 47) % 360}, 60%, 55%)`,
    };

    if (type === 'session') {
      item.game = GAME_NAMES[i % GAME_NAMES.length];
      item.accuracy = Math.floor(seededRandom(daySeed + i + 100) * 30) + 65;
      item.handsPlayed = Math.floor(seededRandom(daySeed + i + 200) * 20) + 10;
    } else if (type === 'streak') {
      item.streakDays = Math.floor(seededRandom(daySeed + i + 300) * 25) + 3;
    } else if (type === 'achievement') {
      item.badge = ['First Blood', 'Streak Master', 'GTO Expert', 'Iron Will', 'Diamond Grinder'][
        i % 5
      ];
    } else if (type === 'mastery') {
      item.game = GAME_NAMES[i % GAME_NAMES.length];
      item.level = Math.floor(seededRandom(daySeed + i + 400) * 3) + 1;
    }

    items.push(item);
  }

  // Sort by timestamp (newest first)
  return items.sort((a, b) => b.timestamp - a.timestamp);
}

function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ═══════════════════════════════════════════════════════════════════════════
// FEED ITEM COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function FeedItem({ item, onChallenge }) {
  const eventType = EVENT_TYPES[item.type] || EVENT_TYPES.session;

  function renderContent() {
    switch (item.type) {
      case 'session':
        return (
          <>
            <span style={{ fontWeight: 700, color: item.isYou ? '#00d4ff' : '#e2e8f0' }}>
              {item.user}
            </span>
            {' completed a '}
            <span style={{ fontWeight: 700, color: eventType.color }}>{item.handsPlayed}-hand</span>
            {' session on '}
            <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{item.game}</span>
            {' — '}
            <span
              style={{
                fontWeight: 800,
                color:
                  item.accuracy >= 80 ? '#4ade80' : item.accuracy >= 65 ? '#fbbf24' : '#f87171',
              }}
            >
              {item.accuracy}%
            </span>
            {' accuracy'}
          </>
        );
      case 'streak':
        return (
          <>
            <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{item.user}</span>
            {' hit a '}
            <span style={{ fontWeight: 800, color: '#f97316' }}>{item.streakDays}-day streak</span>
            {' milestone!'}
          </>
        );
      case 'achievement':
        return (
          <>
            <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{item.user}</span>
            {' unlocked the '}
            <span style={{ fontWeight: 800, color: '#fbbf24' }}>{item.badge}</span>
            {' badge'}
          </>
        );
      case 'mastery':
        return (
          <>
            <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{item.user}</span>
            {' mastered Level '}
            <span style={{ fontWeight: 800, color: '#a855f7' }}>{item.level}</span>
            {' of '}
            <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{item.game}</span>
          </>
        );
      default:
        return null;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex',
        gap: 12,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          flexShrink: 0,
          background: `linear-gradient(135deg, ${item.avatarColor}, ${item.avatarColor}88)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 800,
          color: '#fff',
        }}
      >
        {/* TRAIN-FEED-A11Y-1: SVG user replaces 👤 */}
        {item.isYou ? <span aria-hidden style={{ display: 'inline-flex' }}><UserSvg size={18} /></span> : item.user.charAt(0)}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 6 }}>
          {renderContent()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: `${eventType.color}12`,
              border: `1px solid ${eventType.color}22`,
              color: eventType.color,
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {/* TRAIN-FEED-A11Y-1: SVG EventIcon replaces emoji */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <EventIcon kind={eventType.iconKind} size={10} />
              {eventType.label}
            </span>
          </span>
          {item.simulated && (
            <span
              style={{
                padding: '1px 5px',
                borderRadius: 3,
                background: 'rgba(100,116,139,0.1)',
                border: '1px solid rgba(100,116,139,0.15)',
                color: '#475569',
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: 0.3,
              }}
            >
              COMMUNITY
            </span>
          )}
          <span style={{ fontSize: 10, color: '#475569' }}>{formatTimeAgo(item.timestamp)}</span>
          {!item.isYou && item.type === 'session' && (
            <motion.button
              type="button"
              aria-label={`Challenge ${item.user} to a session`}
              whileTap={{ scale: 0.95 }}
              onClick={() => onChallenge(item.user)}
              style={{
                marginLeft: 'auto',
                padding: '3px 10px',
                borderRadius: 6,
                border: '1px solid rgba(168,85,247,0.2)',
                background: 'rgba(168,85,247,0.06)',
                color: '#a855f7',
                fontSize: 9,
                fontWeight: 700,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Challenge
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function TrainingFeedPage() {
  const router = useRouter();
  useTrainingBus('training-feed');
  const [loading, setLoading] = useState(true);
  const [feedItems, setFeedItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [fetchError, setFetchError] = useState(null);

  const fetchFeed = useCallback(async () => {
    setFetchError(null);
    const user = getAuthUser();
    try {
      if (user?.id) {
        const res = await authedFetch(`/api/training/get-sessions?limit=50`);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        if (data.success) {
          const items = generateFeedItems(data.sessions || []);
          setFeedItems(items);
        }
      } else {
        setFeedItems(generateFeedItems([]));
      }
    } catch (e) {
      setFetchError('Unable to load training feed. Please try again.');
      setFeedItems(generateFeedItems([]));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Bus listener — refresh feed when a training session completes or inject payload directly
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (event) => {
      const { source, payload } = event;
      if (payload && typeof payload === 'object') {
        // If a payload is provided directly on the bus, inject it immediately
        const liveItem = {
          id: `live-${Date.now()}`,
          type: 'session',
          user: 'You',
          isYou: true,
          game:
            typeof source === 'string'
              ? source.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
              : 'GTO Training',
          accuracy:
            payload.accuracy ||
            (payload.questionsAnswered > 0
              ? Math.round((payload.questionsCorrect / payload.questionsAnswered) * 100)
              : 0),
          handsPlayed: payload.questionsAnswered || payload.total_questions || 0,
          timestamp: Date.now(),
          avatarColor: '#00d4ff',
          isLiveInjection: true,
        };

        setFeedItems((prev) => [liveItem, ...prev]);
      } else {
        // Fallback to full fetch if no payload
        fetchFeed();
      }
    });
    return unsub;
  }, [fetchFeed]);

  const handleChallenge = (username) => {
    router.push('/hub/training/pvp-lobby');
  };

  const filteredItems =
    filter === 'all' ? feedItems : feedItems.filter((item) => item.type === filter);

  const FILTER_OPTIONS = [
    { id: 'all', label: 'All' },
    { id: 'session', label: 'Sessions' },
    { id: 'streak', label: 'Streaks' },
    { id: 'achievement', label: 'Badges' },
  ];

  return (
    <>
      <Head>
        <title>Training Feed | Smarter.Poker GTO Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
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
            {/* TRAIN-FEED-A11Y-1: SVG back arrow replaces ← entity */}
            <BackArrowSvg size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Training Feed</h1>
            <div style={{ fontSize: 11, color: '#64748b' }}>See what your network is training</div>
          </div>
        </div>

        {/* Filter tabs */}
        <div
          role="tablist"
          aria-label="Filter training feed"
          style={{
            display: 'flex',
            gap: 4,
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(0,0,0,0.15)',
          }}
        >
          {FILTER_OPTIONS.map((f) => (
            <motion.button
              key={f.id}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setFilter(f.id)}
              aria-label={`Show ${f.label.toLowerCase()} only`}
              aria-pressed={filter === f.id}
              style={{
                flex: 1,
                padding: '7px',
                borderRadius: 6,
                border: `1px solid ${filter === f.id ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                background: filter === f.id ? 'rgba(0,212,255,0.06)' : 'transparent',
                color: filter === f.id ? '#00d4ff' : '#64748b',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </motion.button>
          ))}
        </div>

        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); fetchFeed(); }} />

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }} role="status" aria-label="Loading training feed">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{
                  width: 32,
                  height: 32,
                  margin: '0 auto 12px',
                  border: '2px solid rgba(255,255,255,0.05)',
                  borderTopColor: '#00d4ff',
                  borderRadius: '50%',
                }}
              />
              Loading feed...
            </div>
          )}

          {/* Feed Items */}
          {!loading &&
            filteredItems.map((item) => (
              <FeedItem key={item.id} item={item} onChallenge={handleChallenge} />
            ))}

          {/* Empty state */}
          {!loading && filteredItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              {/* TRAIN-FEED-A11Y-1: SVG antenna replaces 📡 */}
              <div style={{ display: 'inline-flex', marginBottom: 8, color: '#475569' }} aria-hidden>
                <AntennaSvg size={32} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>No activity yet</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>
                Complete some training sessions to see activity here
              </div>
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              textAlign: 'center',
              padding: '20px 16px',
              fontSize: 10,
              color: '#334155',
            }}
          >
            Feed updates automatically when you or friends complete sessions
          </div>
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}
