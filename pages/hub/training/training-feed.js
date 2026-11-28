/**
 * TRAINING ACTIVITY FEED — Social Training Updates
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Social feed showing what friends are training. See achievements,
 * session completions, and streak milestones from your network.
 *
 * Route: /hub/training/training-feed
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-62 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import { deriveTrainingSessionAccuracy } from '../../../src/lib/training/sessionEvidence.mjs';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import { TrainingConsoleSkeleton } from '../../../src/components/training/console/TrainingConsoleStates';
import sd from '../../../src/styles/training/training-journey-sd.module.css';
// TRAIN-WIRE-EMPTY-2b — adoption: shared empty-state primitive



// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// FEED EVENT TYPES
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

// BUG FIX (TRAIN-FEED-A11Y-1): EVENT_TYPES gains an iconKind discriminator
// so the rendered icon comes from a typed SVG component (EventIcon) instead
// of an emoji string. Legacy `icon` emoji string preserved for any external
// consumer reading the data shape. Same surface-specific a11y pattern as
// PR #320/#322/#324/#327/#328/#329/#330/#331.
const EVENT_TYPES = {
  session:     { icon: '◆', iconKind: 'target',  color: 'var(--sp-accent-blue)', label: 'Training' },
  streak:      { icon: '▲', iconKind: 'flame',   color: '#86daff', label: 'Streak' },
  achievement: { icon: '★', iconKind: 'trophy',  color: '#86daff', label: 'Badge' },
  mastery:     { icon: '★', iconKind: 'star',    color: '#86daff', label: 'Mastery' },
  leaderboard: { icon: '■', iconKind: 'chart',   color: 'var(--sp-accent-green)', label: 'Rank Up' },
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

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// FEED ENGINE (verified user session data only)
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function generateFeedItems(userSessions) {
  const items = [];

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
        accuracy: deriveTrainingSessionAccuracy({
          ...s,
          hands_played: s.hands_played ?? s.total_questions,
        }),
        handsPlayed: s.hands_played || s.total_questions || 0,
        timestamp: new Date(s.created_at).getTime(),
        avatarColor: 'var(--sp-accent-cyan)',
      });
    });
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

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// FEED ITEM COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function FeedItem({ item }) {
  const eventType = EVENT_TYPES[item.type] || EVENT_TYPES.session;

  function renderContent() {
    switch (item.type) {
      case 'session':
        return (
          <>
            <strong className={item.isYou ? sd.ice : sd.strong}>{item.user}</strong>
            {' Completed A '}
            <strong className={sd.ice}>{item.handsPlayed}-Hand</strong>
            {' Session On '}
            <strong className={sd.strong}>{item.game}</strong>
            {' - '}
            <strong
              className={Number.isFinite(item.accuracy)
                ? (item.accuracy >= 80 ? sd.good : sd.ice)
                : sd.muted}
            >
              {Number.isFinite(item.accuracy) ? `${item.accuracy}%` : 'Accuracy Not Available'}
            </strong>
            {Number.isFinite(item.accuracy) ? ' Accuracy' : ''}
          </>
        );
      case 'streak':
        return (
          <>
            <strong className={sd.strong}>{item.user}</strong>
            {' Hit A '}
            <strong className={sd.ice}>{item.streakDays}-Day Streak</strong>
            {' Milestone'}
          </>
        );
      case 'achievement':
        return (
          <>
            <strong className={sd.strong}>{item.user}</strong>
            {' Unlocked The '}
            <strong className={sd.ice}>{item.badge}</strong>
            {' Badge'}
          </>
        );
      case 'mastery':
        return (
          <>
            <strong className={sd.strong}>{item.user}</strong>
            {' Mastered Level '}
            <strong className={sd.ice}>{item.level}</strong>
            {' Of '}
            <strong className={sd.strong}>{item.game}</strong>
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
      className={`${sd.card} ${sd.feedItem}`}
      data-tone={item.isYou ? 'ice' : undefined}
    >
      {/* Avatar */}
      <span className={sd.avatar} aria-hidden>
        {/* TRAIN-FEED-A11Y-1: SVG user */}
        {item.isYou ? <UserSvg size={18} /> : item.user.charAt(0)}
      </span>

      {/* Content */}
      <div className={sd.feedBody}>
        <div className={sd.copy}>{renderContent()}</div>
        <div className={sd.feedMeta}>
          <span className={sd.tag}>
            {/* TRAIN-FEED-A11Y-1: SVG EventIcon */}
            <span className={sd.inline}>
              <EventIcon kind={eventType.iconKind} size={12} />
              {eventType.label}
            </span>
          </span>
          <span className={sd.skillNodeHint}>{formatTimeAgo(item.timestamp)}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function TrainingFeedPage() {
  const router = useRouter();
  useTrainingBus('training-feed');
  const [loading, setLoading] = useState(true);
  const [feedItems, setFeedItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [fetchError, setFetchError] = useState(null);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator !== 'undefined') setIsOnline(navigator.onLine !== false);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);



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

  // A browser event is only an invalidation hint. It is never evidence that a
  // verified session completed, because practice tools and any same-origin
  // script can emit the same EventBus event.
  useEffect(() => {
    const unsub = eventBus.on(
      EventType?.SESSION_END || 'session:end',
      () => fetchFeed(),
    );
    return unsub;
  }, [fetchFeed]);

  const filteredItems =
    filter === 'all' ? feedItems : feedItems.filter((item) => item.type === filter);

  const FILTER_OPTIONS = [
    { id: 'all', label: 'All' },
    { id: 'session', label: 'Sessions' },
  ];

  return (
    <>
      <SEOHead
        title="Community Training Activity Feed"
        description="Follow Live GTO Training Milestones, High-Accuracy Sessions, And Consecutive Daily Streaks From Players Across The Community On Smarter.Poker."
        canonical="/hub/training/training-feed"
      />
      <div className={`sp-training-feed ${sd.root}`}>
        <TrainingPageHead slug="training-training-feed" note="Your Verified Training Activity" />

        <div className={sd.main}>
          {/* Filter tabs */}
          <div className={`${sd.chips} ${sd.chipsEven}`} role="group" aria-label="Filter Training Feed">
            {FILTER_OPTIONS.map((f) => (
              <motion.button
                key={f.id}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setFilter(f.id)}
                aria-label={`Show ${f.label.toLowerCase()} only`}
                aria-pressed={filter === f.id}
                className={sd.chip}
              >
                {f.label}
              </motion.button>
            ))}
          </div>

          {!isOnline && (
            <div role="status" data-offline-banner="true" className={sd.notice}>
              Offline. Verified Feed Sync Will Resume After Reconnection.
            </div>
          )}

          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); fetchFeed(); }} />

          {/* Loading */}
          {loading && (
            <TrainingConsoleSkeleton label="Loading Training Feed" panels={3} rows={2} />
          )}

          {/* Feed Items */}
          {!loading && filteredItems.length > 0 && (
            <div className={sd.list}>
              {filteredItems.map((item) => (
                <FeedItem key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && filteredItems.length === 0 && (
            <TrainerEmptyState
              variant="no-data"
              title="No Activity Yet"
              message="Complete Some Training Sessions To See Activity Here."
              compact
            />
          )}

          {/* Footer */}
          <p className={`${sd.copy} ${sd.center}`}>
            Feed Updates Automatically When Your Saved Training Sessions Complete
          </p>
        </div>
      </div>
      <ConnectionToast />
      <HubPageSummary page="training-training-feed" />
    </>
  );
}
