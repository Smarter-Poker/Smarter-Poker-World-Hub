/**
 * TRAINING MILESTONES — Achievement Timeline
 * ═══════════════════════════════════════════════════════════════════════════
 * Visual timeline of career thresholds inferred from verified session history.
 * This page does not settle or verify rewards.
 *
 * Route: /hub/training/milestones
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH5-30 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-23 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { TrainingConsoleSkeleton } from '../../../src/components/training/console/TrainingConsoleStates';
import sd from '../../../src/styles/training/training-journey-sd.module.css';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';



import TrainingPageHead from '../../../src/components/training/TrainingPageHead';


// BUG FIX (TRAIN-MILESTONES-A11Y-1): SVG icon components replacing the 25
// emoji icons in MILESTONE_DEFS, plus the reached-threshold indicator in the
// render path. Each milestone definition gains an
// `iconKind` field consumed by MilestoneIcon. Legacy `icon` emoji string
// preserved for any external consumer reading the data shape. Same surface-
// specific a11y pattern as PR #320/#322/#324/#327/#328/#329/#330.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _SvgRoot({ size, viewBox='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={viewBox}>{children}</svg>;
}
function TargetIcon({ size=24 })       { return <_SvgRoot size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_SvgRoot>; }
function TrendingUpIcon({ size=24 })   { return <_SvgRoot size={size}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></_SvgRoot>; }
function FlameIcon({ size=24 })        { return <_SvgRoot size={size}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.5-.5-2.5-2-3.5l-2 2c-.5-.5-1-1-1-2 0-1 1.5-2 1.5-2s-3 1-4 3.5C5 14 6 17 8.5 19c1.5 1.5 4 2 5.5 1.5C17 19.5 19 17 19 13c0-3-1-5-2.5-7C15 4 12 2 12 2s1 4-1 7c-.7 1-1.5 1.5-2.5 2.5z"/></_SvgRoot>; }
function DiamondIcon({ size=24 })      { return <_SvgRoot size={size}><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M11 3 8 9l4 12 4-12-3-6"/><path d="M2 9h20"/></_SvgRoot>; }
function BookIcon({ size=24 })         { return <_SvgRoot size={size}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></_SvgRoot>; }
function PercentIcon({ size=24 })      { return <_SvgRoot size={size}><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></_SvgRoot>; }
function BoltIcon({ size=24 })         { return <_SvgRoot size={size}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></_SvgRoot>; }
function DumbbellIcon({ size=24 })     { return <_SvgRoot size={size}><path d="M6 9v6"/><path d="M18 9v6"/><path d="M3 11v2"/><path d="M21 11v2"/><line x1="6" y1="12" x2="18" y2="12"/></_SvgRoot>; }
function DragonIcon({ size=24 })       { return <_SvgRoot size={size}><path d="M4 12c0-3 2-6 6-6 3 0 4 3 4 5 0 2-1 4 1 5 1 .6 3 0 3-2"/><path d="M14 13c2 1 3 0 4 -2"/><circle cx="9" cy="10" r="1"/></_SvgRoot>; }
function GalaxyIcon({ size=24 })       { return <_SvgRoot size={size}><circle cx="12" cy="12" r="2"/><path d="M3 12c0-4 3-8 9-8 3 0 5 1 6 3-1 4-5 6-9 6-3 0-4-1-6-1z"/><path d="M21 12c0 4-3 8-9 8-3 0-5-1-6-3 1-4 5-6 9-6 3 0 4 1 6 1z"/></_SvgRoot>; }
function ScaleIcon({ size=24 })        { return <_SvgRoot size={size}><path d="M12 3v18"/><path d="M5 21h14"/><path d="M6 8h12l-2 8H8z"/></_SvgRoot>; }
function ChartBarIcon({ size=24 })     { return <_SvgRoot size={size}><line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="13" width="3" height="7"/><rect x="10" y="8" width="3" height="12"/><rect x="15" y="4" width="3" height="16"/></_SvgRoot>; }
function RobotIcon({ size=24 })        { return <_SvgRoot size={size}><rect x="4" y="7" width="16" height="13" rx="2"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><line x1="12" y1="3" x2="12" y2="7"/></_SvgRoot>; }
function CrystalBallIcon({ size=24 })  { return <_SvgRoot size={size}><circle cx="12" cy="12" r="8"/><path d="M9 9a3 3 0 0 1 3-3"/><path d="M6 20l3-2"/><path d="M18 20l-3-2"/></_SvgRoot>; }
function RunnerIcon({ size=24 })       { return <_SvgRoot size={size}><circle cx="13" cy="4" r="2"/><path d="M4 22l4-9 4 3 3-4 3 5"/></_SvgRoot>; }
function CalendarIcon({ size=24 })     { return <_SvgRoot size={size}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></_SvgRoot>; }
function StarIcon({ size=24 })         { return <_SvgRoot size={size}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></_SvgRoot>; }
function TrophyIcon({ size=24 })       { return <_SvgRoot size={size}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></_SvgRoot>; }
function VolcanoIcon({ size=24 })      { return <_SvgRoot size={size}><path d="M2 22h20"/><path d="M6 22l4-12h4l4 12"/><path d="M10 6V2"/><path d="M14 8V4"/></_SvgRoot>; }
function SearchIcon({ size=24 })       { return <_SvgRoot size={size}><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></_SvgRoot>; }
function DiceIcon({ size=24 })         { return <_SvgRoot size={size}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/><circle cx="12" cy="12" r="1"/></_SvgRoot>; }
function StarShineIcon({ size=24 })    { return <_SvgRoot size={size}><polygon points="12 2 15 9 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 9 9 12 2"/><line x1="12" y1="2" x2="12" y2="0"/></_SvgRoot>; }
function BrainIcon({ size=24 })        { return <_SvgRoot size={size}><path d="M9 4a4 4 0 0 0-4 4c0 1-1 2-1 4s1 3 1 4a4 4 0 0 0 4 4"/><path d="M15 4a4 4 0 0 1 4 4c0 1 1 2 1 4s-1 3-1 4a4 4 0 0 1-4 4"/><line x1="12" y1="4" x2="12" y2="20"/></_SvgRoot>; }
function EyeIcon({ size=24 })          { return <_SvgRoot size={size}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></_SvgRoot>; }
function CrownIcon({ size=24 })        { return <_SvgRoot size={size}><path d="M2 7l5 5 5-9 5 9 5-5-2 12H4L2 7z"/><path d="M4 19h16"/></_SvgRoot>; }
function CheckIcon({ size=24 })        { return <_SvgRoot size={size}><polyline points="20 6 9 17 4 12"/></_SvgRoot>; }
function MilestoneIcon({ kind, size=20 }) {
  switch (kind) {
    case 'target':       return <TargetIcon size={size}/>;
    case 'trending-up':  return <TrendingUpIcon size={size}/>;
    case 'flame':        return <FlameIcon size={size}/>;
    case 'diamond':      return <DiamondIcon size={size}/>;
    case 'book':         return <BookIcon size={size}/>;
    case 'percent':      return <PercentIcon size={size}/>;
    case 'bolt':         return <BoltIcon size={size}/>;
    case 'dumbbell':     return <DumbbellIcon size={size}/>;
    case 'dragon':       return <DragonIcon size={size}/>;
    case 'galaxy':       return <GalaxyIcon size={size}/>;
    case 'scale':        return <ScaleIcon size={size}/>;
    case 'chart-bar':    return <ChartBarIcon size={size}/>;
    case 'robot':        return <RobotIcon size={size}/>;
    case 'crystal-ball': return <CrystalBallIcon size={size}/>;
    case 'runner':       return <RunnerIcon size={size}/>;
    case 'calendar':     return <CalendarIcon size={size}/>;
    case 'star':         return <StarIcon size={size}/>;
    case 'trophy':       return <TrophyIcon size={size}/>;
    case 'volcano':      return <VolcanoIcon size={size}/>;
    case 'search':       return <SearchIcon size={size}/>;
    case 'dice':         return <DiceIcon size={size}/>;
    case 'star-shine':   return <StarShineIcon size={size}/>;
    case 'brain':        return <BrainIcon size={size}/>;
    case 'eye':          return <EyeIcon size={size}/>;
    case 'crown':        return <CrownIcon size={size}/>;
    default:             return <TargetIcon size={size}/>;
  }
}

const MILESTONE_DEFS = [
  // Sessions
  {
    id: 'sess-1',
    tier: 'Bronze',
    name: 'First Steps',
    desc: 'Complete your first training session',
    iconKind: 'target',
    icon: '',
    getProgress: (s) => ({ c: s.totalSessions, t: 1 }),
  },
  {
    id: 'sess-10',
    tier: 'Silver',
    name: 'Getting Serious',
    desc: 'Complete 10 training sessions',
    iconKind: 'trending-up',
    icon: '',
    getProgress: (s) => ({ c: s.totalSessions, t: 10 }),
  },
  {
    id: 'sess-50',
    tier: 'Gold',
    name: 'Dedicated Pro',
    desc: 'Complete 50 training sessions',
    iconKind: 'flame',
    icon: '▲',
    getProgress: (s) => ({ c: s.totalSessions, t: 50 }),
  },
  {
    id: 'sess-100',
    tier: 'Diamond',
    name: 'Centurion',
    desc: 'Complete 100 training sessions',
    iconKind: 'diamond',
    icon: '',
    getProgress: (s) => ({ c: s.totalSessions, t: 100 }),
  },
  {
    id: 'sess-500',
    tier: 'Master',
    name: 'Library Scholar',
    desc: 'Complete 500 training sessions',
    iconKind: 'book',
    icon: '',
    getProgress: (s) => ({ c: s.totalSessions, t: 500 }),
  },

  // Hands
  {
    id: 'hands-100',
    tier: 'Bronze',
    name: 'Century Club',
    desc: 'Train on 100 hands',
    iconKind: 'percent',
    icon: '',
    getProgress: (s) => ({ c: s.totalHands, t: 100 }),
  },
  {
    id: 'hands-500',
    tier: 'Silver',
    name: 'Grinder',
    desc: 'Train on 500 hands',
    iconKind: 'bolt',
    icon: '',
    getProgress: (s) => ({ c: s.totalHands, t: 500 }),
  },
  {
    id: 'hands-1000',
    tier: 'Gold',
    name: 'Iron Will',
    desc: 'Train on 1,000 hands',
    iconKind: 'dumbbell',
    icon: '',
    getProgress: (s) => ({ c: s.totalHands, t: 1000 }),
  },
  {
    id: 'hands-5000',
    tier: 'Diamond',
    name: 'Volume Monster',
    desc: 'Train on 5,000 hands',
    iconKind: 'dragon',
    icon: '',
    getProgress: (s) => ({ c: s.totalHands, t: 5000 }),
  },
  {
    id: 'hands-10k',
    tier: 'Master',
    name: 'GTO Zenith',
    desc: 'Train on 10,000 hands',
    iconKind: 'galaxy',
    icon: '',
    getProgress: (s) => ({ c: s.totalHands, t: 10000 }),
  },

  // Accuracy
  {
    id: 'acc-60',
    tier: 'Bronze',
    name: 'Finding Range',
    desc: 'Achieve 60% overall accuracy',
    iconKind: 'scale',
    icon: '',
    getProgress: (s) => ({ c: s.avgAccuracy, t: 60 }),
  },
  {
    id: 'acc-70',
    tier: 'Silver',
    name: 'Above Average',
    desc: 'Achieve 70% overall accuracy',
    iconKind: 'chart-bar',
    icon: '',
    getProgress: (s) => ({ c: s.avgAccuracy, t: 70 }),
  },
  {
    id: 'acc-80',
    tier: 'Gold',
    name: 'Sharp Shooter',
    desc: 'Achieve 80% overall accuracy',
    iconKind: 'target',
    icon: '',
    getProgress: (s) => ({ c: s.avgAccuracy, t: 80 }),
  },
  {
    id: 'acc-90',
    tier: 'Diamond',
    name: 'GTO Machine',
    desc: 'Achieve 90% overall accuracy',
    iconKind: 'robot',
    icon: '',
    getProgress: (s) => ({ c: s.avgAccuracy, t: 90 }),
  },
  {
    id: 'acc-95',
    tier: 'Master',
    name: 'Solver Incarnate',
    desc: 'Achieve 95% overall accuracy',
    iconKind: 'crystal-ball',
    icon: '',
    getProgress: (s) => ({ c: s.avgAccuracy, t: 95 }),
  },

  // Streaks
  {
    id: 'streak-3',
    tier: 'Bronze',
    name: 'On a Roll',
    desc: '3 consecutive training days',
    iconKind: 'runner',
    icon: '',
    getProgress: (s) => ({ c: s.maxStreak, t: 3 }),
  },
  {
    id: 'streak-7',
    tier: 'Silver',
    name: 'Week Warrior',
    desc: '7 consecutive training days',
    iconKind: 'calendar',
    icon: '',
    getProgress: (s) => ({ c: s.maxStreak, t: 7 }),
  },
  {
    id: 'streak-14',
    tier: 'Gold',
    name: 'Fortnight Focus',
    desc: '14 consecutive training days',
    iconKind: 'star',
    icon: '★',
    getProgress: (s) => ({ c: s.maxStreak, t: 14 }),
  },
  {
    id: 'streak-30',
    tier: 'Diamond',
    name: 'Monthly Legend',
    desc: '30 consecutive training days',
    iconKind: 'trophy',
    icon: '',
    getProgress: (s) => ({ c: s.maxStreak, t: 30 }),
  },
  {
    id: 'streak-100',
    tier: 'Master',
    name: 'Unstoppable Force',
    desc: '100 consecutive training days',
    iconKind: 'volcano',
    icon: '',
    getProgress: (s) => ({ c: s.maxStreak, t: 100 }),
  },

  // Variety
  {
    id: 'var-3',
    tier: 'Bronze',
    name: 'Explorer',
    desc: 'Train on 3 different game types',
    iconKind: 'search',
    icon: '',
    getProgress: (s) => ({ c: s.uniqueGames, t: 3 }),
  },
  {
    id: 'var-5',
    tier: 'Silver',
    name: 'Variety Pack',
    desc: 'Train on 5 different game types',
    iconKind: 'dice',
    icon: '◆',
    getProgress: (s) => ({ c: s.uniqueGames, t: 5 }),
  },
  {
    id: 'var-10',
    tier: 'Gold',
    name: 'Well Rounded',
    desc: 'Train on 10 different game types',
    iconKind: 'star-shine',
    icon: '',
    getProgress: (s) => ({ c: s.uniqueGames, t: 10 }),
  },
  {
    id: 'var-15',
    tier: 'Diamond',
    name: 'Polymath',
    desc: 'Train on 15 different game types',
    iconKind: 'brain',
    icon: '',
    getProgress: (s) => ({ c: s.uniqueGames, t: 15 }),
  },
  {
    id: 'var-20',
    tier: 'Master',
    name: 'Omniscient',
    desc: 'Train on 20 different game types',
    iconKind: 'eye',
    icon: '',
    getProgress: (s) => ({ c: s.uniqueGames, t: 20 }),
  },

  // Special
  {
    id: 'perf-1',
    tier: 'Gold',
    name: 'Perfect Round',
    desc: 'Score 100% in a single session',
    iconKind: 'crown',
    icon: '',
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



  const fetchData = useCallback(async () => {
    const user = getAuthUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setFetchError(null);
    try {
      const res = await authedFetch(`/api/training/get-sessions?limit=500`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (!data.success || !Array.isArray(data.sessions)) {
        throw new Error(data.error || 'Verified session history was not returned');
      }
      setStats(computeStats(data.sessions));
    } catch (e) {
      console.warn('[Milestones] Error:', e);
      setFetchError('Failed to load milestones. Please try again.');
      setStats(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useEffect(() => {
    const h = () => fetchData();
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', h);
    return () => unsub();
  }, [fetchData]);

  const processed = useMemo(() => {
    if (!stats) return [];
    return MILESTONE_DEFS.map((m) => {
      const p = m.getProgress(stats);
      const percent = Math.min(100, Math.max(0, (p.c / p.t) * 100));
      return {
        ...m,
        current: p.c,
        target: p.t,
        percent,
        thresholdReached: percent >= 100,
      };
    });
  }, [stats]);

  const reached = processed.filter((m) => m.thresholdReached);
  const inProgress = processed
    .filter((m) => !m.thresholdReached)
    .sort((a, b) => b.percent - a.percent);

  // Spotlight: the unreached threshold with the highest completion percentage.
  const nextMilestone = inProgress[0];

  return (
    <>
      <Head>
        <title>Milestones | Smarter.Poker GTO Training</title>
              <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={`sp-training-journey sp-training-journey--milestones ${sd.root}`}>
        <TrainingPageHead slug="training-milestones" note="Verified Session Thresholds">
          <p className="sp-head-note" role="status" aria-label={`${reached.length} of ${MILESTONE_DEFS.length} thresholds reached`}>
            <strong>{reached.length}</strong> / {MILESTONE_DEFS.length} Reached
          </p>
        </TrainingPageHead>

        <div className={`sp-journey-main ${sd.main}`}>
          {!isOnline && (
            <div role="status" data-offline-banner="true" className={sd.notice}>
              Offline. Milestone Threshold History Will Resume After Reconnection.
            </div>
          )}

          {fetchError && <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); fetchData(); }} />}

          {loading ? (
            <TrainingConsoleSkeleton label="Loading Milestones" panels={3} rows={2} />
          ) : !stats ? (
            <div role="status" className={sd.card} data-tone="bad">
              <p className={sd.copy}>
                Verified Milestone Progress Is Currently Unavailable. No Threshold Or Reward
                Status Has Been Inferred From Missing Data.
              </p>
            </div>
          ) : (
            <>
              {/* Next Milestone Spotlight */}
              {nextMilestone && (
                <motion.section
                  className={`sp-journey-spotlight ${sd.section}`}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  aria-labelledby="milestone-up-next"
                >
                  <div className={sd.sectionHead}>
                    <h2 id="milestone-up-next" className={sd.sectionTitle}>Up Next</h2>
                    <span className={sd.tag}>{nextMilestone.tier}</span>
                  </div>
                  <div className={sd.milestoneLine}>
                    <span className={sd.badge} aria-hidden>
                      {/* TRAIN-MILESTONES-A11Y-1: SVG milestone icon */}
                      <MilestoneIcon kind={nextMilestone.iconKind} size={24} />
                    </span>
                    <div>
                      <div className={sd.title}>{nextMilestone.name}</div>
                      <div className={sd.copy}>{nextMilestone.desc}</div>
                    </div>
                  </div>
                  {/* Big Progress Bar */}
                  <div>
                    <div className={sd.row}>
                      <span className={`${sd.stateLabel} ${sd.ice}`}>{Math.round(nextMilestone.percent)}% Complete</span>
                      <span className={sd.value}>
                        {nextMilestone.current} / {nextMilestone.target}
                      </span>
                    </div>
                    <div
                      className={sd.meter}
                      role="progressbar"
                      aria-label={`Progress to ${nextMilestone.name}`}
                      aria-valuenow={Math.round(nextMilestone.percent)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <motion.div
                        className={sd.meterFill}
                        initial={{ width: 0 }}
                        animate={{ width: `${nextMilestone.percent}%` }}
                      />
                    </div>
                  </div>
                  {/* Settlement disclosure: this page has no reward ledger source. */}
                  <p className={sd.copy} role="note">
                    <strong className={sd.ice}>Reward Status: Unverified.</strong>{' '}
                    This Progress-Only Page Cannot Confirm Or Issue Diamonds.
                  </p>
                </motion.section>
              )}

              {/* Reached Thresholds */}
              {reached.length > 0 && (
                <section className={sd.section} aria-labelledby="milestones-reached">
                  <div className={sd.sectionHead}>
                    <h2 id="milestones-reached" className={sd.sectionTitle}>Thresholds Reached</h2>
                    <span className={sd.value}>{reached.length}</span>
                  </div>
                  <div className={sd.list}>
                    {reached.map((m, i) => (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`${sd.card} ${sd.milestoneLine}`}
                        data-tone="good"
                      >
                        <span className={sd.badge} aria-hidden>
                          {/* TRAIN-MILESTONES-A11Y-1 */}
                          <MilestoneIcon kind={m.iconKind} size={20} />
                        </span>
                        <div>
                          <div className={sd.title}>{m.name} <span className={sd.tierLabel}>{m.tier}</span></div>
                          <div className={sd.copy}>{m.desc}</div>
                        </div>
                        <div className={sd.milestoneStatus}>
                          <span className={`${sd.good} ${sd.inline}`}>
                            {/* TRAIN-MILESTONES-A11Y-1: SVG check */}
                            <CheckIcon size={14} />
                            Threshold Reached
                          </span>
                          <span className={sd.muted}>Reward Unverified</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}

              {/* Locked In Progress */}
              {inProgress.length > (nextMilestone ? 1 : 0) && (
                <section className={sd.section} aria-labelledby="milestones-in-progress">
                  <div className={sd.sectionHead}>
                    <h2 id="milestones-in-progress" className={sd.sectionTitle}>In Progress</h2>
                    <span className={sd.value}>{inProgress.length - (nextMilestone ? 1 : 0)}</span>
                  </div>
                  <div className={sd.list}>
                    {inProgress
                      .filter((m) => m.id !== nextMilestone?.id)
                      .map((m) => (
                        <div key={m.id} className={`${sd.card} ${sd.milestoneLine}`} data-tone="muted">
                          <span className={`${sd.badge} ${sd.badgeLocked}`} aria-hidden>
                            {/* TRAIN-MILESTONES-A11Y-1 */}
                            <MilestoneIcon kind={m.iconKind} size={18} />
                          </span>
                          <div>
                            <div className={sd.title}>{m.name} <span className={sd.tierLabel}>{m.tier}</span></div>
                            <div className={sd.copy}>{m.desc}</div>
                            {/* Mini Progress Bar */}
                            <div className={sd.row}>
                              <div className={sd.meter} style={{ flex: 1 }}>
                                <div className={sd.meterFill} style={{ width: `${m.percent}%` }} />
                              </div>
                              <span className={`${sd.value} ${sd.small}`}>{Math.round(m.percent)}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}
