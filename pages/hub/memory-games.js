/* ═══════════════════════════════════════════════════════════════════════════
    PREFLOP RANGE LAB - AUTHORED LOCAL PRACTICE
   Full Video Game Experience With Pressure And Combos
   Practice Authored Preflop References With No Account Settlement

   Mobile phase 2 (docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md,
   changelog docs/changelog/2026-09-04-mobile-phase2-preflop-charts.md):
   - HubPageShell owns the shell (100dvh, 100vw clamp, header, 900/768 block,
     no page-owned bottom clearance).
   - The mode picker is a wrapping grid, the subpage nav a wrapping row, the
     leaderboard a ResponsiveTable, and the 13x13 matrix fits 375px with no
     sideways scroll (PreflopRangeMatrix: one paint control, drag to paint).
   - useLoadFailsafe / useInitialLoadRef on the first load with a menu
     skeleton; useOnlineStatus guards every mutation; useHaptics on mode
     picks, strokes, submit and results; PullToRefresh around the menu;
     useModalHistory on every overlay the page opens.
   - The page tutorial (src/tutorials/preflop-charts.js) is owned by the app
     shell; this page only listens for TUTORIAL_WILL_OPEN_EVENT and returns
     to the menu, where PreflopMatrixPrimer carries the matrix / legend /
     submit spotlight targets. Nothing here auto-launches a tour.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import SEOHead from '../../src/components/seo/SEOHead';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import HubPageSummary from '../../src/components/seo/HubPageSummary';

// AEO phase 3 (2026-09-17). This module serves /hub/preflop-charts, which
// pages/hub/preflop-charts.js re-exports, so the canonical and the schema
// both name that route.
const PREFLOP_SCHEMA = hubProductSchema({
  path: '/hub/preflop-charts',
  name: 'Smarter.Poker Preflop Range Lab',
  description:
    'Free Local Practice Against Authored Preflop Reference Ranges. Results Stay On The Page And Do Not Change Account Progress, Rank Or Rewards.',
  trail: [['Hub', '/hub'], ['Preflop Charts', '/hub/preflop-charts']],
});
import { useState, useEffect, useRef, useCallback } from 'react';
// confetti loaded lazily on first use
let _confetti = null;
async function fireConfetti(opts) {
  try {
    if (!_confetti) {
      const m = await import('canvas-confetti');
      _confetti = m.default || m;
    }
    _confetti(opts);
  } catch (e) {
    console.warn('[App] Handled exception:', e?.message || e);
  }
}
import { SoundEngine, EffectsEngine, LEVELS, MASTERY_THRESHOLD } from '../../src/games/GameEngine';
import {
  getScenariosByLevel,
  getLevelConfig,
  RANKS,
  getHandName,
  LEVEL_1_SCENARIOS,
  LEVEL_2_SCENARIOS,
  LEVEL_3_SCENARIOS,
  LEVEL_4_SCENARIOS,
  LEVEL_5_SCENARIOS,
  LEVEL_6_SCENARIOS,
  LEVEL_7_SCENARIOS,
} from '../../src/games/ScenarioDatabase';

// God-Mode Stack
import { useMemoryStore } from '../../src/stores/memoryStore';
import { useAvatar } from '../../src/contexts/AvatarContext';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import toast from '../../src/stores/toastStore';

// Mobile phase 0a / 0c foundation
import HubPageShell from '../../src/components/ui/HubPageShell';
import PullToRefresh from '../../src/components/ui/PullToRefresh';
import ResponsiveTable from '../../src/components/ui/ResponsiveTable';
import { useLoadFailsafe, useInitialLoadRef } from '../../src/hooks/useLoadFailsafe';
import { useModalHistory } from '../../src/hooks/useModalHistory';
import { useHaptics } from '../../src/hooks/useHaptics';
import { useOnlineStatus, OFFLINE_TOAST } from '../../src/hooks/useOnlineStatus';
import { TUTORIAL_WILL_OPEN_EVENT } from '../../src/tutorials';

const PageTransition = dynamic(() => import('../../src/components/transitions/PageTransition'), {
  ssr: false,
});
const HamburgerMenu = dynamic(() => import('../../src/components/ui/HamburgerMenu'), {
  ssr: false,
});
import {
  getMemoryGamesPreferences,
  updateMemoryGamesPreferences,
} from '../../src/services/memoryGamesPreferences';

// ═══════════════════════════════════════════════════════════════════════════
// DIAMOND ENGINE - Import Supabase-powered version
// ═══════════════════════════════════════════════════════════════════════════
import DiamondEngine from '../../src/services/DiamondEngine';
import leaderboardService from '../../src/services/LeaderboardService';
import dailyChallengeService from '../../src/services/DailyChallengeService';
import useTrainingBus from '../../src/hooks/useTrainingBus';
// busEmit not needed at page level - DiamondEngine auto-emits, useTrainingBus has own import
import { leakAnalyzer } from '../../src/engine/LeakSignalAnalyzer';

// Off-menu screens and overlays are lazy (mobile phase 2, perf): the menu
// and the matrix are eager, everything else loads when it is opened.
const LazyBlock = ({ height = 220 }) => (
  <div className="preflop-skel" style={{ height }} aria-hidden="true" />
);
const lazyScreen = (loader, height) =>
  dynamic(loader, { ssr: false, loading: () => <LazyBlock height={height} /> });
const EnhancedReviewPanel = lazyScreen(
  () => import('../../src/components/memory-games/EnhancedReviewPanel'),
  320
);
const JarvisExplanationDialog = dynamic(
  () => import('../../src/components/memory-games/JarvisExplanationDialog'),
  { ssr: false }
);
const ScenarioFilterPanel = lazyScreen(() => import('../../src/games/ScenarioFilterPanel'), 260);
const ComboPopup = dynamic(() => import('../../src/components/memory-games/modals/ComboPopup'), {
  ssr: false,
});

const SpotTrainerGame = lazyScreen(() => import('../../src/games/SpotTrainerGame'), 420);
const TournamentModeGame = lazyScreen(() => import('../../src/games/TournamentModeGame'), 420);
const SpeedDrillGame = lazyScreen(() => import('../../src/games/SpeedDrillGame'), 420);
const PressureCookerGame = lazyScreen(() => import('../../src/games/PressureCookerGame'), 420);
const PatternRecognitionGame = lazyScreen(
  () => import('../../src/games/PatternRecognitionGame'),
  420
);
const MixedStrategyGame = lazyScreen(() => import('../../src/games/MixedStrategyGame'), 420);

import { filterScenarios } from '../../src/games/scenarioFilters';
import { getAccessToken, authedFetch } from '../../src/lib/authUtils';
import { getHeaderStats } from '../../src/lib/headerStats';
import {
  boundedCommerceFetch,
  COMMERCE_REQUEST_TIMEOUT_MS,
} from '../../src/lib/store/boundedCommerceFetch';
import {
  getOrCreateCommerceRequestId,
  replaceCommerceRequestId,
} from '../../src/lib/store/checkoutIntentStore';
import {
  checkoutRequestReplacementRequired,
  normalizeVerifiedCheckoutSession,
  subscriptionCheckoutOfferConfirmation,
} from '../../src/lib/store/verifiedCheckoutUrl.mjs';
import { getVerifiedCheckoutAuthorization } from '../../src/lib/store/checkoutAuthorization';
import { VIP_MEMBERSHIP } from '../../src/data/diamondStoreData';
import PreflopRangeMatrix from '../../src/components/memory-games/PreflopRangeMatrix';
import PreflopMatrixPrimer from '../../src/components/memory-games/PreflopMatrixPrimer';
import PreflopSubpageNav from '../../src/components/memory-games/PreflopSubpageNav';
import {
  accuracyToPercent,
  getUnlockedLevel,
  gradeUserGrid,
  normalizeMemoryDashboard,
  normalizeRangeAction,
} from '../../src/lib/preflopRangeLab';
// 2026-05-07 - Lucide icons replace emoji in the menu surface (UI-UX-Pro-Max no-emoji-icons rule)
import {
  Target,
  Zap,
  Bomb,
  Puzzle,
  Dices,
  Crosshair,
  Swords,
  Calendar,
  Trophy,
  Lock,
  Filter,
  ShieldCheck,
  BrainCircuit,
  ChevronRight,
  Gem,
  Clock3,
  Lightbulb,
  Send,
  RotateCcw,
  ArrowRight,
  Undo2,
  Redo2,
  Trash2,
  RefreshCw,
  Medal,
} from 'lucide-react';

const ALL_RANGE_LAB_SCENARIOS = [
  ...LEVEL_1_SCENARIOS,
  ...LEVEL_2_SCENARIOS,
  ...LEVEL_3_SCENARIOS,
  ...LEVEL_4_SCENARIOS,
  ...LEVEL_5_SCENARIOS,
  ...LEVEL_6_SCENARIOS,
  ...LEVEL_7_SCENARIOS,
];

// Range-memory actions live here because MixedStrategyGame is lazy loaded and
// does not export its private palette. Keeping this contract local also avoids
// loading an entire game bundle just to render the range grid.
const ACTION_COLORS = {
  fold: { bg: 'rgba(100, 116, 139, 0.3)', border: '#64748B', label: 'FOLD', key: '1' },
  call: { bg: 'rgba(16, 185, 129, 0.5)', border: '#10B981', label: 'CALL', key: '2' },
  raise: { bg: 'rgba(239, 68, 68, 0.5)', border: '#EF4444', label: 'RAISE', key: '3' },
  raise_small: { bg: 'rgba(249, 115, 22, 0.5)', border: '#F97316', label: 'RAISE SM', key: '4' },
  raise_big: { bg: 'rgba(168, 85, 247, 0.5)', border: '#A855F7', label: 'RAISE BIG', key: '5' },
  all_in: { bg: 'rgba(220, 38, 127, 0.6)', border: '#DC2680', label: 'ALL IN', key: '6' },
};

const LAZY_GAME_MODES = [
  'speed-drill',
  'pressure-cooker',
  'pattern-recognition',
  'mixed-strategy',
  'spot-trainer',
  'tournament',
];
const PREFLOP_ONLY_LOCAL_MODES = new Set(['speed-drill', 'pressure-cooker', 'pattern-recognition']);
const POSTFLOP_STREETS = new Set(['flop', 'turn', 'river']);

function isIllustrativePostflopScenario(scenario) {
  return Boolean(
    scenario &&
    scenario.practiceOnly === true &&
    scenario.authority === 'illustrative_local_heuristic' &&
    scenario.solverVerified === false
  );
}

function isPostflopScenario(scenario) {
  return (
    isIllustrativePostflopScenario(scenario) ||
    POSTFLOP_STREETS.has(String(scenario?.street || '').toLowerCase())
  );
}

function isGradableRangeScenario(scenario) {
  return Boolean(
    scenario &&
    !isPostflopScenario(scenario) &&
    scenario.solution &&
    !Array.isArray(scenario.solution) &&
    Object.keys(scenario.solution).length > 0
  );
}

const MODES = [
  { key: 'range', label: 'Range', Icon: Target, color: '#00D4FF', desc: 'Authored Range Practice' },
  { key: 'speed', label: 'Speed Drill', Icon: Zap, color: '#FFD700', desc: 'Beat The Clock' },
  { key: 'pressure', label: 'Pressure', Icon: Bomb, color: '#FF4444', desc: 'Defuse The Bomb' },
  { key: 'pattern', label: 'Pattern', Icon: Puzzle, color: '#3B82F6', desc: 'Read The Range' },
  { key: 'mixed', label: 'Mixed', Icon: Dices, color: '#A855F7', desc: 'Dial Frequencies' },
  {
    key: 'spot',
    label: 'Spot Trainer',
    Icon: Crosshair,
    color: '#F97316',
    desc: 'Full Hand Trees',
  },
  {
    key: 'tournament',
    label: 'Local VS',
    Icon: Swords,
    color: '#EC4899',
    desc: 'Simulated Practice',
  },
];
const EXTRA_MODES = [
  { key: 'daily', label: 'Daily', Icon: Calendar, color: '#00FF88', special: true },
  { key: 'leaderboard', label: 'Rankings', Icon: Trophy, color: '#FFD700', special: true },
];

const MODE_CARDS = {
  speed: {
    Icon: Zap,
    title: 'SPEED DRILL',
    color: '#FFD700',
    gradient: ['#FFD700', '#F59E0B'],
    difficulty: 'INTERMEDIATE',
    diffColor: '#FFD700',
    desc: 'Flash A Hand, Pick The Action, Build Streaks. Time Gets Shorter The Better You Do. Three Lives, Do Not Lose Them.',
    stats: [
      { label: 'FORMAT', value: '3 Lives' },
      { label: 'SPEED', value: 'Accelerating' },
      { label: 'SETTLEMENT', value: 'Free Local Practice' },
    ],
    mode: 'speed-drill',
    btn: 'START SPEED DRILL',
  },
  pressure: {
    Icon: Bomb,
    title: 'PRESSURE COOKER',
    color: '#FF4444',
    gradient: ['#FF4444', '#FF0066'],
    difficulty: 'HARD',
    diffColor: '#FF4444',
    desc: 'Answer 10 Hands Before The Clock Runs Out. Correct Answers Add Time, Wrong Answers Cost You. Can You Defuse The Bomb?',
    stats: [
      { label: 'FORMAT', value: '10 Hands' },
      { label: 'CLOCK', value: '+/- 3-5 Sec' },
      { label: 'SETTLEMENT', value: 'Free Local Practice' },
    ],
    mode: 'pressure-cooker',
    btn: 'START PRESSURE COOKER',
  },
  pattern: {
    Icon: Puzzle,
    title: 'PATTERN RECOGNITION',
    color: '#3B82F6',
    gradient: ['#3B82F6', '#0088ff'],
    difficulty: 'ADVANCED',
    diffColor: '#3B82F6',
    desc: 'See A Partial Authored Range And Identify The Dominant Action. Is It A Raising, Calling, Or Folding Range? Train Your Range-Reading Instincts.',
    stats: [
      { label: 'FORMAT', value: '8 Patterns' },
      { label: 'SKILL', value: 'Range Reading' },
      { label: 'SETTLEMENT', value: 'Free Local Practice' },
    ],
    mode: 'pattern-recognition',
    btn: 'START PATTERN RECOGNITION',
  },
  mixed: {
    Icon: Dices,
    title: 'MIXED STRATEGY',
    color: '#A855F7',
    gradient: ['#A855F7', '#D946EF'],
    difficulty: 'EXPERT',
    diffColor: '#A855F7',
    desc: 'Exact-Frequency Practice Requires A Verified Solver Source. Open This Mode To Continue In The Audited Training Arena.',
    stats: [
      { label: 'FORMAT', value: '10 Rounds' },
      { label: 'SKILL', value: 'Frequencies' },
      { label: 'SETTLEMENT', value: 'Free Local Practice' },
    ],
    mode: 'mixed-strategy',
    btn: 'START MIXED TRAINER',
  },
  spot: {
    Icon: Crosshair,
    title: 'SPOT TRAINER',
    color: '#F97316',
    gradient: ['#F97316', '#EA580C'],
    difficulty: 'ADVANCED',
    diffColor: '#F97316',
    desc: 'Play Through Entire Hand Trees From Preflop To River. Learn How Ranges Evolve On Each Street And Compare Your EV To Optimal GTO Play.',
    stats: [
      { label: 'FORMAT', value: 'Full Trees' },
      { label: 'SKILL', value: 'EV Analysis' },
      { label: 'SETTLEMENT', value: 'Verified Training Route' },
    ],
    mode: 'spot-trainer',
    btn: 'START SPOT TRAINER',
  },
  tournament: {
    Icon: Swords,
    title: 'LOCAL VS PRACTICE',
    color: '#EC4899',
    gradient: ['#EC4899', '#DB2777'],
    difficulty: 'SIMULATED',
    diffColor: '#EC4899',
    desc: 'Practice A Five-Round Range Drill Against A Scripted Browser Coach. There Is No Live Opponent, Matchmaking, Account Rank, Or Account Reward.',
    stats: [
      { label: 'FORMAT', value: '5 Local Rounds' },
      { label: 'OPPONENT', value: 'Simulated Coach' },
      { label: 'SETTLEMENT', value: 'No Account Changes' },
    ],
    mode: 'tournament',
    btn: 'START LOCAL VS PRACTICE',
  },
};

const LEADERBOARD_MODES = [
  { id: 'range-memory', label: 'Range', color: '#00D4FF' },
  { id: 'speed-drill', label: 'Speed', color: '#FFD700' },
  { id: 'pressure-cooker', label: 'Pressure', color: '#ff4444' },
  { id: 'pattern-recognition', label: 'Pattern', color: '#3B82F6' },
  { id: 'mixed-strategy', label: 'Mixed', color: '#A855F7' },
  { id: 'spot-trainer', label: 'Spot', color: '#F97316' },
];

const LEADERBOARD_COLUMNS = [
  {
    key: 'rank',
    label: 'Rank',
    render: (row) => (
      <span
        style={{ color: row.rank <= 3 ? '#FFD700' : '#fff', fontWeight: row.rank <= 3 ? 700 : 500 }}
      >
        #{row.rank}
      </span>
    ),
  },
  { key: 'player', label: 'Player', render: (row) => row.display_name || 'Anonymous' },
  {
    key: 'score',
    label: 'Score',
    align: 'right',
    render: (row) => (
      <span style={{ color: '#00ff88', fontWeight: 600 }}>
        {Number(row.score || 0).toLocaleString()}
      </span>
    ),
  },
  {
    key: 'streak',
    label: 'Streak',
    align: 'right',
    render: (row) => <span style={{ color: '#FF6B00' }}>{row.streak || 0}</span>,
  },
];

// First-paint skeleton that mirrors the menu: hero, daily card, seven mode
// cards, the level list. One class (.preflop-skel) and one keyframe in
// src/styles/worlds/memory-games.css.
function MenuSkeleton() {
  return (
    <div
      className="preflop-menu preflop-menu-skeleton"
      aria-busy="true"
      aria-label="Loading Preflop Charts"
    >
      <div className="preflop-skel" style={{ height: 230, marginBottom: 16 }} />
      <div className="preflop-skel" style={{ height: 48, marginBottom: 14 }} />
      <div className="preflop-skel" style={{ height: 120, marginBottom: 14 }} />
      <div className="preflop-mode-rail" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="preflop-skel" style={{ height: 112 }} />
        ))}
      </div>
      <div className="preflop-skel" style={{ height: 300, marginTop: 14 }} />
    </div>
  );
}

function DailyLocalPracticeCard({ challenge, loading, onPlay }) {
  if (loading) {
    return (
      <div className="preflop-daily-card is-loading" role="status" data-tutorial="daily">
        Synchronizing The Practice Assignment For Today
      </div>
    );
  }

  if (!challenge) {
    return (
      <section
        className="preflop-daily-card is-empty"
        aria-labelledby="preflop-daily-title"
        data-tutorial="daily"
      >
        <div className="preflop-daily-card-mark" aria-hidden>
          <Calendar size={21} />
        </div>
        <div className="preflop-daily-card-copy">
          <span>DAILY LOCAL PRACTICE</span>
          <h2 id="preflop-daily-title">No Practice Assignment Posted Yet</h2>
          <p>
            The Practice Assignment For Today Appears Here As Soon As It Is Published. Check Back
            Soon.
          </p>
        </div>
      </section>
    );
  }

  const target = accuracyToPercent(challenge.target_accuracy ?? 75);
  return (
    <section
      className="preflop-daily-card"
      aria-labelledby="preflop-daily-title"
      data-tutorial="daily"
    >
      <div className="preflop-daily-card-mark" aria-hidden>
        <Calendar size={21} />
      </div>
      <div className="preflop-daily-card-copy">
        <span>DAILY LOCAL PRACTICE</span>
        <h2 id="preflop-daily-title">
          {challenge.title || `Level ${challenge.level || 1} Practice`}
        </h2>
        <p>
          This Unsigned Drill Does Not Record Challenge Completion, Streaks, Rankings, Or Diamond
          Rewards.
        </p>
      </div>
      <div className="preflop-daily-card-metrics">
        <div>
          <Target size={15} aria-hidden />
          <span>
            <small>Mode</small>
            <strong>{challenge.game_mode || 'Range Lab'}</strong>
          </span>
        </div>
        <div>
          <Clock3 size={15} aria-hidden />
          <span>
            <small>Practice Goal</small>
            <strong>{target.toFixed(target % 1 ? 1 : 0)}% Accuracy</strong>
          </span>
        </div>
        <div>
          <Gem size={15} aria-hidden />
          <span>
            <small>Settlement</small>
            <strong>Local Practice Only</strong>
          </span>
        </div>
      </div>
      <button type="button" onClick={onPlay}>
        Start Local Practice <ChevronRight size={17} aria-hidden />
      </button>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function MemoryGamesPage() {
  const router = useRouter();
  const { user, initializing: authInitializing } = useAvatar();
  useTrainingBus('preflop-charts');
  const userId = user?.id;
  const containerRef = useRef(null);
  const labRef = useRef(null);
  const haptic = useHaptics();
  const online = useOnlineStatus();

  // Offline: mutation buttons explain instead of firing (OfflineBar in
  // pages/_app.js is the global banner; this is the per-action guard).
  const requireOnline = useCallback(() => {
    if (online) return true;
    toast.error(OFFLINE_TOAST);
    return false;
  }, [online]);

  // Start leak analyzer for Jarvis integration - feeds into LeakService + Jarvis PA alerts
  useEffect(() => {
    leakAnalyzer.start();
    leakAnalyzer.setUserId(userId || null);
    return () => {
      leakAnalyzer.setUserId(null);
      leakAnalyzer.stop();
    };
  }, [userId]);

  // Zustand Global State (replaces some local useState)
  const currentLevel = useMemoryStore((s) => s.currentLevel) || 1; // Fallback to level 1 if undefined
  const setCurrentLevel = useMemoryStore((s) => s.setCurrentLevel);

  // Game state (keep local for game session)
  const [mode, setMode] = useState('menu'); // 'menu' | 'game' | 'result' | 'speed-drill' | ...
  const [gameType, setGameType] = useState('range'); // 'range' | 'speed' | 'leaderboard' | 'daily'
  const [currentScenario, setCurrentScenario] = useState(null);
  const [userGrid, setUserGrid] = useState({});
  const [selectedAction, setSelectedAction] = useState('raise');
  const [gradeResult, setGradeResult] = useState(null);
  const [labStatus, setLabStatus] = useState('Raise selected. No hands marked.');
  const [gameNotice, setGameNotice] = useState(null);
  const [lastTouchedHand, setLastTouchedHand] = useState(null);
  const gridHistoryRef = useRef([]);
  const gridRedoRef = useRef([]);
  const strokeRef = useRef(null);

  // Hamburger and deep links use ?mode=. Hydrate that route contract once so
  // every advertised sub-function opens the matching game instead of landing
  // silently on the default Range Lab menu.
  useEffect(() => {
    if (!router.isReady) return;
    const requested = Array.isArray(router.query.mode) ? router.query.mode[0] : router.query.mode;
    const routeModes = {
      speed: ['speed', 'speed-drill'],
      'speed-drill': ['speed', 'speed-drill'],
      pressure: ['pressure', 'pressure-cooker'],
      'pressure-cooker': ['pressure', 'pressure-cooker'],
      pattern: ['pattern', 'pattern-recognition'],
      'pattern-recognition': ['pattern', 'pattern-recognition'],
      mixed: ['mixed', 'mixed-strategy'],
      'mixed-strategy': ['mixed', 'mixed-strategy'],
      spot: ['spot', 'spot-trainer'],
      'spot-trainer': ['spot', 'spot-trainer'],
      tournament: ['tournament', 'tournament'],
    };
    const mapped = routeModes[requested];
    if (!mapped) return;
    setGameType(mapped[0]);
    setMode(mapped[1]);
  }, [router.isReady, router.query.mode]);

  // Leaderboard state
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardMode, setLeaderboardMode] = useState('range-memory');
  const [userRank, setUserRank] = useState(null);

  // Daily Challenge state
  const [dailyChallenge, setDailyChallenge] = useState(null);
  const [challengeLoading, setChallengeLoading] = useState(false);

  // Scenario Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [scenarioFilters, setScenarioFilters] = useState({});

  // AI Generation state
  const [useAIGeneration, setUseAIGeneration] = useState(false);
  const [aiGenerating, setAIGenerating] = useState(false);

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState(90);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef(null);
  const submissionLockedRef = useRef(false);
  const latestGridRef = useRef(userGrid);
  const latestTimeRef = useRef(timeRemaining);
  latestGridRef.current = userGrid;
  latestTimeRef.current = timeRemaining;

  // Combo state
  const [combo, setCombo] = useState(0);
  const [comboName, setComboName] = useState(null);
  const [multiplier, setMultiplier] = useState(1);

  // Economy state is optional for these free local drills. Signed-in values
  // are shown only after the authenticated header-stats endpoint proves them.
  const [diamondBalance, setDiamondBalance] = useState(null);
  const [economyReady, setEconomyReady] = useState(false);
  // 2026-05-07 - single-call dashboard payload from /api/memory/dashboard
  // RPC: public.rpc_memory_dashboard(uuid). Renders grade chip + per-level
  // mastery + daily-challenge state in one round-trip (replaces 5+ fetches).
  const [memoryDashboard, setMemoryDashboard] = useState(null);
  const [memoryDashboardLoading, setMemoryDashboardLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const isInitialLoad = useInitialLoadRef();
  useLoadFailsafe(memoryDashboardLoading, setMemoryDashboardLoading);
  const [isVIP, setIsVIP] = useState(null); // null = loading, true = VIP, false = not VIP

  const [lastReward, setLastReward] = useState(null);

  // Progress state
  const [consecutivePasses, setConsecutivePasses] = useState(0);

  // Session history for trend tracking
  const [sessionHistory, setSessionHistory] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return JSON.parse(localStorage.getItem('preflop_session_history') || '[]');
      } catch {
        return [];
      }
    }
    return [];
  });

  // Visual state
  const [screenShake, setScreenShake] = useState(false);
  const [showComboPopup, setShowComboPopup] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [vipCheckoutPending, setVipCheckoutPending] = useState(false);
  const vipCheckoutRef = useRef(false);
  const vipCheckoutAbortRef = useRef(null);

  useEffect(
    () => () => {
      const activeRequest = vipCheckoutAbortRef.current;
      vipCheckoutAbortRef.current = null;
      activeRequest?.abort();
    },
    []
  );

  // Jarvis Explain Modal state
  const [explainModal, setExplainModal] = useState({
    show: false,
    hand: null,
    correctAction: null,
    userAction: null,
    explanation: null,
    loading: false,
  });

  // Adaptive training state
  const [weakSpots, setWeakSpots] = useState([]);
  const [adaptiveLoading, setAdaptiveLoading] = useState(false);
  const [lobbySuggestions, setLobbySuggestions] = useState([]);

  // Hamburger menu preferences
  const [preferences, setPreferences] = useState({
    soundEffects: true,
    keyboardShortcuts: true,
    showTimer: true,
    visualHints: false,
  });

  // Load preferences from Supabase on mount
  useEffect(() => {
    if (userId) {
      getMemoryGamesPreferences(userId).then(setPreferences);
    }
  }, [userId]);

  const updatePreference = useCallback(
    async (key, value) => {
      if (!requireOnline()) return;
      const newPrefs = { ...preferences, [key]: value };
      setPreferences(newPrefs);

      if (userId) {
        try {
          await updateMemoryGamesPreferences(userId, { [key]: value });
        } catch (error) {
          console.warn('Failed to save preference:', error);
        }
      }
    },
    [preferences, userId, requireOnline]
  );

  const menuConfig = getMenuConfig('preflop-charts', user, preferences, {
    setSoundEffects: (val) => updatePreference('soundEffects', val),
    setKeyboardShortcuts: (val) => updatePreference('keyboardShortcuts', val),
    setShowTimer: (val) => updatePreference('showTimer', val),
    setVisualHints: (val) => updatePreference('visualHints', val),
  });

  // Safe helper to get level config with fallback
  const safeLevelConfig = getLevelConfig(currentLevel) || { timer: 90, gridSize: 13, maxHands: 20 };
  const playSound = useCallback(
    (sound) => {
      if (preferences.soundEffects !== false) SoundEngine.play(sound);
    },
    [preferences.soundEffects]
  );

  // Initialize effects CSS once. Re-initialize the economy only after auth
  // resolves so a signed-in player can never cross into guest/local state.
  useEffect(() => {
    EffectsEngine.initCSS();
  }, []);

  useEffect(() => {
    if (authInitializing) {
      setEconomyReady(false);
      setDiamondBalance(null);
      setIsVIP(null);
      setLastReward(null);
      return undefined;
    }

    let cancelled = false;
    const initializeDiamondEngine = async () => {
      setEconomyReady(false);
      setDiamondBalance(null);
      setIsVIP(null);
      setLastReward(null);
      try {
        // A restored bearer token with no resolved context user is an
        // unresolved authenticated session, not a guest. Fail closed
        // instead of opening a second local economy identity.
        if (!userId && getAccessToken()) {
          throw new Error('Authenticated identity is unresolved');
        }
        await DiamondEngine.init(userId || null);

        let balance;
        let vipStatus = false;
        if (userId) {
          const proof = await getHeaderStats({ userId, force: true });
          if (
            !proof?.success ||
            !proof.profile ||
            !Number.isFinite(Number(proof.profile.diamonds))
          ) {
            throw new Error('Authenticated economy proof unavailable');
          }
          balance = Number(proof.profile.diamonds);
          vipStatus = proof.profile.is_vip === true;
        } else {
          balance = await DiamondEngine.getBalance();
          if (!Number.isFinite(Number(balance)))
            throw new Error('Local practice balance unavailable');
          balance = Number(balance);
        }

        if (cancelled) return;
        setDiamondBalance(balance);
        setIsVIP(vipStatus);
        setEconomyReady(true);
      } catch (e) {
        console.warn('[MemoryGames] Failed to initialize DiamondEngine:', e);
        if (cancelled) return;
        // Never re-initialize an authenticated identity as a guest. The
        // free drills remain playable, but all economy/VIP extras stay
        // unavailable until authenticated proof succeeds.
        setDiamondBalance(null);
        setIsVIP(null);
        setEconomyReady(false);
      }
    };

    initializeDiamondEngine();
    return () => {
      cancelled = true;
    };
  }, [authInitializing, userId]);

  // Timer logic
  useEffect(() => {
    if (timerActive && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            latestTimeRef.current = 0;
            clearInterval(timerRef.current);
            handleTimeUp();
            return 0;
          }
          if (prev <= 10 && preferences.soundEffects !== false) SoundEngine.play('tick');
          const nextTime = prev - 1;
          latestTimeRef.current = nextTime;
          return nextTime;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive, preferences.soundEffects]);

  const handleActionSelect = useCallback(
    (action) => {
      haptic('light');
      setSelectedAction(action);
      setLabStatus(`${ACTION_COLORS[action]?.label || action} selected.`);
    },
    [haptic]
  );

  const handleUndo = useCallback(() => {
    if (gradeResult || !timerActive) return;
    const previousGrid = gridHistoryRef.current.pop();
    if (!previousGrid) return;
    gridRedoRef.current.push(userGrid);
    gridRedoRef.current = gridRedoRef.current.slice(-30);
    setUserGrid(previousGrid);
    const count = Object.keys(previousGrid).length;
    setLabStatus(`Last range edit undone. ${count} hand${count === 1 ? '' : 's'} marked.`);
  }, [gradeResult, timerActive, userGrid]);

  const handleRedo = useCallback(() => {
    if (gradeResult || !timerActive) return;
    const nextGrid = gridRedoRef.current.pop();
    if (!nextGrid) return;
    gridHistoryRef.current.push(userGrid);
    gridHistoryRef.current = gridHistoryRef.current.slice(-30);
    setUserGrid(nextGrid);
    const count = Object.keys(nextGrid).length;
    setLabStatus(`Range edit restored. ${count} hand${count === 1 ? '' : 's'} marked.`);
  }, [gradeResult, timerActive, userGrid]);

  const handleClearRange = useCallback(() => {
    if (gradeResult || !timerActive) return;
    if (Object.keys(userGrid).length === 0) return;
    gridHistoryRef.current.push(userGrid);
    gridHistoryRef.current = gridHistoryRef.current.slice(-30);
    gridRedoRef.current = [];
    setUserGrid({});
    setLabStatus('Range cleared. Use undo to restore it.');
  }, [gradeResult, timerActive, userGrid]);

  const handleFillShape = useCallback(
    (shape) => {
      if (gradeResult || !timerActive) return;
      haptic('light');
      const hands = [];
      RANKS.forEach((_, row) =>
        RANKS.forEach((__, col) => {
          if (shape === 'pairs' && row === col) hands.push(getHandName(row, col));
          if (shape === 'suited' && row < col) hands.push(getHandName(row, col));
          if (shape === 'offsuit' && row > col) hands.push(getHandName(row, col));
        })
      );
      gridHistoryRef.current.push(userGrid);
      gridHistoryRef.current = gridHistoryRef.current.slice(-30);
      gridRedoRef.current = [];
      const nextGrid = { ...userGrid };
      hands.forEach((hand) => {
        nextGrid[hand] = selectedAction;
      });
      setUserGrid(nextGrid);
      setLabStatus(
        `${shape} filled with ${ACTION_COLORS[selectedAction]?.label || selectedAction}. ${Object.keys(nextGrid).length} hands marked.`
      );
    },
    [gradeResult, selectedAction, timerActive, userGrid, haptic]
  );

  // ── Painting (mobile phase 2) ──
  // One stroke = one history entry + one haptic, however many cells the
  // finger crosses. The matrix reports strokes through these three
  // callbacks; the grid itself never touches page state.
  const handleStrokeStart = useCallback(
    (hand) => {
      if (gradeResult || !timerActive) return false;
      const current = latestGridRef.current;
      gridHistoryRef.current.push(current);
      gridHistoryRef.current = gridHistoryRef.current.slice(-30);
      gridRedoRef.current = [];
      strokeRef.current = {
        erase: current[hand] === selectedAction,
        action: selectedAction,
        count: 0,
      };
      haptic('light');
      return true;
    },
    [gradeResult, timerActive, selectedAction, haptic]
  );

  const handlePaintHand = useCallback((hand) => {
    const stroke = strokeRef.current;
    if (!stroke) return;
    stroke.count += 1;
    setLastTouchedHand(hand);
    setUserGrid((prev) => {
      if (stroke.erase) {
        if (!(hand in prev)) return prev;
        const { [hand]: _omit, ...rest } = prev;
        return rest;
      }
      if (prev[hand] === stroke.action) return prev;
      return { ...prev, [hand]: stroke.action };
    });
  }, []);

  const handleStrokeEnd = useCallback(() => {
    const stroke = strokeRef.current;
    if (!stroke) return;
    strokeRef.current = null;
    const count = Object.keys(latestGridRef.current).length;
    const verb = stroke.erase
      ? 'removed'
      : `set to ${ACTION_COLORS[stroke.action]?.label || stroke.action}`;
    setLabStatus(
      `${stroke.count} hand${stroke.count === 1 ? '' : 's'} ${verb}. ${count} hand${count === 1 ? '' : 's'} marked.`
    );
  }, []);

  const handleHandFocus = useCallback((hand) => {
    setLastTouchedHand(hand);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (mode !== 'game' || gradeResult || preferences.keyboardShortcuts === false) return;
      const target = e.target instanceof Element ? e.target : null;
      // The matrix is a focusable grid that owns Enter / Space itself.
      const isInteractiveTarget = target?.closest(
        'button, a, input, select, textarea, [contenteditable="true"], [role="grid"]'
      );
      const isTextEntry = target?.closest('input, select, textarea, [contenteditable="true"]');

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (isTextEntry) return;
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      const key = e.key;
      const actions = Object.entries(ACTION_COLORS);
      const found = actions.find(([_, v]) => v.key === key);
      if (found) {
        if (isTextEntry) return;
        e.preventDefault();
        handleActionSelect(found[0]);
        return;
      }
      if (isInteractiveTarget) return;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    gradeResult,
    userGrid,
    currentScenario,
    preferences.keyboardShortcuts,
    handleActionSelect,
    handleRedo,
    handleUndo,
  ]);

  // Local Range Lab sessions have no entry settlement. The guard prevents a
  // double launch; it is not an economy gate.
  const isGameStartingRef = useRef(false);
  const startGame = async (level, filterOverrides = null) => {
    // Double-click guard - protects ALL users (VIP + non-VIP)
    if (isGameStartingRef.current) return;
    isGameStartingRef.current = true;
    setGameNotice(null);
    try {
      const serverUnlockedLevel = getUnlockedLevel(memoryDashboard?.per_level_mastery || []);
      const sessionUnlockedLevel = Math.min(10, Math.floor(consecutivePasses / 5) + 1);
      const highestUnlocked = Math.max(serverUnlockedLevel, sessionUnlockedLevel);
      if (Number(level) > highestUnlocked) {
        setGameNotice({
          type: 'warning',
          message: `Level ${level} is locked. Master Level ${highestUnlocked} at 85% or better first.`,
        });
        return;
      }

      // Levels 8-10 describe flop, turn, and river decisions. Transfer them
      // before either static lookup or the preflop-only generation endpoint;
      // otherwise AI mode can return a valid preflop matrix under a postflop
      // level label, while static mode returns an ungradable postflop object.
      if (Number(level) >= 8) {
        setCurrentLevel(Number(level));
        setCurrentScenario(null);
        setTimerActive(false);
        toast.info(
          'Postflop Levels Continue In Verified Spot Trainer. Local Heuristic References Are Never Graded As Solver Answers.',
          5000
        );
        setMode('spot-trainer');
        return;
      }

      // Only the authenticated AI scenario request needs the network and a
      // resolved VIP entitlement. Static local practice remains free.
      if (useAIGeneration) {
        if (isVIP !== true) {
          setGameNotice({
            type: 'warning',
            message:
              'AI Mode Is Unavailable Until VIP Access Is Verified. Local Practice Is Still Free.',
          });
          return;
        }
        if (!requireOnline()) return;
      }

      let scenario = null;

      // Use AI Generation if enabled (VIP feature)
      if (useAIGeneration) {
        setAIGenerating(true);
        try {
          // Build filter params from active filters
          const effectiveFilters = filterOverrides || scenarioFilters;
          const requestBody = {
            level,
            position: effectiveFilters.position || undefined,
            stackDepth: effectiveFilters.stackDepth || undefined,
            format: effectiveFilters.format || undefined,
          };

          const response = await authedFetch('/api/gto/generate-scenario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) throw new Error(`Request failed (${response.status})`);
          const result = await response.json();

          if (result.success && result.scenario) {
            scenario = result.scenario;
          } else {
            console.warn('[MemoryGames] AI generation failed:', result.error);
            // Fallback to static scenarios
            scenario = null;
          }
        } catch (error) {
          console.warn('[MemoryGames] AI generation error:', error);
          // Fallback to static scenarios
          scenario = null;
        } finally {
          setAIGenerating(false);
        }
      }

      // Fallback: Use static scenarios if AI generation failed or is disabled
      if (!scenario) {
        let levelScenarios = getScenariosByLevel(level);

        // Apply filters if any are active
        const effectiveFilters = filterOverrides || scenarioFilters;
        if (Object.keys(effectiveFilters || {}).filter((k) => effectiveFilters[k]).length > 0) {
          levelScenarios = filterScenarios(levelScenarios, effectiveFilters);
        }

        // Select random scenario from filtered list
        scenario =
          levelScenarios.length > 0
            ? levelScenarios[Math.floor(Math.random() * levelScenarios.length)]
            : null;
      }

      if (!scenario) {
        setGameNotice({
          type: 'warning',
          message: 'No scenarios match this level. Adjust or reset your filters, then try again.',
        });
        return;
      }

      // The Range Lab is a 13x13 preflop matrix and cannot grade a postflop
      // action tree. Levels 8-10 used to pass heuristic options into this
      // surface with no `solution`; the grader then treated every absent hand
      // as a fold and manufactured a score. Preserve those illustrative local
      // scenarios in their catalog, but transfer play to the server-delivered
      // Spot Trainer rather than laundering them into a verified result.
      if (isPostflopScenario(scenario)) {
        setCurrentLevel(level);
        setCurrentScenario(null);
        setTimerActive(false);
        toast.info(
          'Postflop Levels Continue In Verified Spot Trainer. Local Heuristic References Are Never Graded As Solver Answers.',
          5000
        );
        setMode('spot-trainer');
        return;
      }

      if (!isGradableRangeScenario(scenario)) {
        setGameNotice({
          type: 'warning',
          message:
            'This Scenario Has No Auditable Preflop Range Key And Cannot Be Graded. Choose Another Scenario.',
        });
        return;
      }

      // Get level-specific config for progressive difficulty
      const levelConfig = getLevelConfig(level) || { timer: 90, gridSize: 13, maxHands: 20 };

      haptic('medium');
      setCurrentLevel(level);
      setCurrentScenario(scenario);
      setUserGrid({});
      gridHistoryRef.current = [];
      gridRedoRef.current = [];
      strokeRef.current = null;
      setLastTouchedHand(null);
      setGradeResult(null);
      setLabStatus(
        `${ACTION_COLORS[selectedAction]?.label || selectedAction} selected. No hands marked.`
      );
      setLastReward(null);
      submissionLockedRef.current = false;
      setTimeRemaining(levelConfig.timer); // Progressive: higher levels = less time
      setTimerActive(true);
      setCombo(0);
      setComboName(null);
      setMultiplier(1);
      setMode('game');

      playSound('levelUp');
    } finally {
      isGameStartingRef.current = false;
    }
  };

  // Handle time up
  const handleTimeUp = () => {
    setTimerActive(false);
    playSound('gameOver');
    triggerScreenShake();
    handleSubmit(true);
  };

  // Submit handler
  const handleSubmit = (timedOut = false) => {
    if (submissionLockedRef.current || !currentScenario) return;
    if (!isGradableRangeScenario(currentScenario)) {
      setTimerActive(false);
      clearInterval(timerRef.current);
      setGameNotice({
        type: 'warning',
        message: 'This Scenario Has No Auditable Preflop Range Key, So No Score Was Recorded.',
      });
      setMode('menu');
      return;
    }
    submissionLockedRef.current = true;
    strokeRef.current = null;
    setTimerActive(false);
    clearInterval(timerRef.current);
    haptic('medium');

    // Timer callbacks retain the render that started the interval. Refs
    // guarantee a timeout grades the player's latest grid and elapsed time.
    const submittedGrid = timedOut ? latestGridRef.current : userGrid;
    const submittedTime = timedOut ? latestTimeRef.current : timeRemaining;
    const result = gradeUserGrid(submittedGrid, currentScenario.solution);
    setGradeResult(result);

    // Track session history for trend analysis
    const sessionEntry = {
      score: result.score,
      level: currentLevel,
      position: currentScenario?.title || '',
      mistakes:
        result.missedHands.length + result.extraHands.length + result.wrongActionHands.length,
      timestamp: Date.now(),
    };
    setSessionHistory((prev) => {
      const updated = [...prev, sessionEntry].slice(-50); // Keep last 50
      try {
        localStorage.setItem('preflop_session_history', JSON.stringify(updated));
      } catch (e) {
        console.warn('[App] Handled exception:', e);
      }
      return updated;
    });

    const passed = result.score >= MASTERY_THRESHOLD;

    // Compute totalReward at function scope so it's available for analytics below
    let totalReward = 0;

    if (passed) {
      // Success!
      haptic('success');
      playSound('combo');
      triggerParticles();

      // God-Mode: Confetti celebration on mastery
      fireConfetti({
        particleCount: 200,
        spread: 120,
        origin: { y: 0.6 },
        colors: ['#FFD700', '#00D4FF', '#00ff88'],
      });

      // Update combo
      const newCombo = combo + 1;
      setCombo(newCombo);
      updateComboDisplay(newCombo);

      // Update consecutive passes
      const newPasses = consecutivePasses + 1;
      setConsecutivePasses(newPasses);

      // Award diamonds
      const baseReward = 15;
      const accuracyBonus = Math.floor((result.score - 85) / 5) * 5;
      const perfectBonus = result.score === 100 ? 50 : 0;
      const comboBonus = Math.floor(newCombo * 2);
      totalReward = Math.floor(
        (baseReward + accuracyBonus + perfectBonus + comboBonus) * multiplier
      );

      if (!user?.id && economyReady)
        DiamondEngine.award(totalReward)
          .then((newBalance) => {
            // Signed-in awards require a server catalog action. Never put a
            // Promise or a failure object into balance state, and only show
            // a reward receipt when an award actually landed.
            if (Number.isFinite(newBalance)) {
              setDiamondBalance(newBalance);
              setLastReward({ diamonds: totalReward, timestamp: Date.now() });
            }
          })
          .catch((err) => console.warn('[MemoryGames] Award failed:', err?.message || err));
    } else {
      // Failure
      haptic('medium');
      playSound('wrong');
      triggerScreenShake();
      setCombo(0);
      setComboName(null);
      setMultiplier(1);
      setConsecutivePasses(0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LOCAL PRACTICE AUTHORITY BOUNDARY
    // This legacy range lab grades against a browser-owned answer map. It
    // therefore cannot author sessions, ELO, challenge completions,
    // leaderboard scores, achievements, or Jarvis training records. Those
    // projections are derived only from a persisted server-graded attempt.
    // ═══════════════════════════════════════════════════════════════════════════

    setMode('result');
  };

  // Update combo display
  const updateComboDisplay = (comboCount) => {
    let name = null;
    let mult = 1;

    if (comboCount >= 20) {
      name = 'LEGENDARY!';
      mult = 3.0;
    } else if (comboCount >= 15) {
      name = 'UNSTOPPABLE!';
      mult = 2.5;
    } else if (comboCount >= 10) {
      name = 'ON FIRE!';
      mult = 2.0;
    } else if (comboCount >= 7) {
      name = 'DOMINATING!';
      mult = 1.7;
    } else if (comboCount >= 5) {
      name = 'HOT STREAK!';
      mult = 1.5;
    } else if (comboCount >= 3) {
      name = 'NICE!';
      mult = 1.2;
    }

    setComboName(name);
    setMultiplier(mult);

    if (name) {
      setShowComboPopup(true);
      setTimeout(() => setShowComboPopup(false), 1500);
    }
  };

  // Visual effects
  const triggerScreenShake = () => {
    setScreenShake(true);
    setTimeout(() => setScreenShake(false), 300);
  };

  // The particle burst starts from the centre of the Range Lab section the
  // player is looking at (ref-measured), never from a window-width guess.
  const triggerParticles = () => {
    if (typeof document === 'undefined') return;
    const rect = labRef.current ? labRef.current.getBoundingClientRect() : null;
    const viewportW = document.documentElement.clientWidth || 0;
    const viewportH = document.documentElement.clientHeight || 0;
    const x = rect ? rect.left + rect.width / 2 : viewportW / 2;
    const y = rect
      ? Math.max(40, Math.min(viewportH - 40, rect.top + Math.min(rect.height, viewportH) / 2))
      : viewportH / 2;
    EffectsEngine.particles(x, y, 20, '#00ff88');
  };

  // Next scenario
  const handleNext = () => {
    startGame(currentLevel);
  };

  const handleRetry = () => {
    if (!currentScenario) return;
    const levelConfig = getLevelConfig(currentLevel) || { timer: 90 };
    haptic('light');
    setUserGrid({});
    gridHistoryRef.current = [];
    gridRedoRef.current = [];
    strokeRef.current = null;
    setLastTouchedHand(null);
    setGradeResult(null);
    setLastReward(null);
    setTimeRemaining(levelConfig.timer);
    latestTimeRef.current = levelConfig.timer;
    submissionLockedRef.current = false;
    setTimerActive(true);
    setMode('game');
    setLabStatus(
      `${ACTION_COLORS[selectedAction]?.label || selectedAction} selected. Retry started.`
    );
    playSound('levelUp');
  };

  // Local Range Lab keys are not server-sealed Training answers. Explain
  // that boundary directly instead of laundering a browser-owned key through
  // a paid endpoint and presenting generated prose as solver authority.
  const showLocalRangeKeyNote = (hand, correctAction, userAction) => {
    haptic('light');
    setExplainModal({
      show: true,
      hand,
      correctAction,
      userAction,
      explanation:
        'This Is A Local Range-Key Comparison, Not A Verified Solver Decision. Open The Training Arena For Server-Delivered Questions, Authoritative Grading, And Audited Explanations.',
      panelImageUrl: null,
      loading: false,
    });
  };

  // Fetch user's weak spots for adaptive training
  const fetchWeakSpots = async () => {
    if (!userId) return;

    try {
      const response = await authedFetch('/api/gto/get-weak-spots');
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const result = await response.json();

      if (result.success && result.weakSpots) {
        setWeakSpots(result.weakSpots);
      }
    } catch (error) {
      console.warn('[MemoryGames] Fetch weak spots error:', error);
    }
  };

  // Start adaptive training targeting weaknesses
  const startAdaptiveTraining = async () => {
    if (!userId) {
      router.push('/login?redirect=/hub/preflop-charts');
      return;
    }
    if (!requireOnline()) return;

    haptic('light');
    setAdaptiveLoading(true);

    try {
      const response = await authedFetch('/api/gto/generate-adaptive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const result = await response.json();

      if (result.success && result.scenario) {
        const returnedLevel = Number(result.scenario.level);
        const adaptiveLevel =
          Number.isInteger(returnedLevel) && returnedLevel >= 1 && returnedLevel <= 7
            ? returnedLevel
            : ['CO', 'BTN', 'SB'].includes(String(result.scenario.position || '').toUpperCase())
              ? 2
              : 1;

        if (isPostflopScenario(result.scenario) || returnedLevel >= 8) {
          setCurrentLevel(Number.isInteger(returnedLevel) ? returnedLevel : 8);
          setCurrentScenario(null);
          setTimerActive(false);
          toast.info(
            'Postflop Practice Continues In Verified Spot Trainer. This Range Matrix Does Not Grade Local Heuristics.',
            5000
          );
          setMode('spot-trainer');
          return;
        }
        if (!isGradableRangeScenario(result.scenario)) {
          setGameNotice({
            type: 'warning',
            message:
              'Adaptive Training Returned No Auditable Preflop Range Key. Nothing Was Graded.',
          });
          setMode('menu');
          return;
        }
        // Load the adaptive scenario through the same range-game state
        // contract as a standard level launch.
        const levelConfig = getLevelConfig(adaptiveLevel) || { timer: 90 };
        setCurrentLevel(adaptiveLevel);
        setCurrentScenario(result.scenario);
        setUserGrid({});
        gridHistoryRef.current = [];
        gridRedoRef.current = [];
        strokeRef.current = null;
        setLastTouchedHand(null);
        setGradeResult(null);
        setLastReward(null);
        setTimeRemaining(levelConfig.timer);
        latestTimeRef.current = levelConfig.timer;
        submissionLockedRef.current = false;
        setTimerActive(true);
        setMode('game');
        playSound('levelUp');
      }
    } catch (error) {
      console.warn('[MemoryGames] Adaptive training error:', error);
    } finally {
      setAdaptiveLoading(false);
    }
  };

  // Fetch lobby suggestions for proactive learning
  const fetchLobbySuggestions = async () => {
    if (!userId) return;

    try {
      const response = await authedFetch('/api/gto/lobby-suggestions');
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const result = await response.json();

      if (result.success && result.suggestions) {
        setLobbySuggestions(result.suggestions);
      }
    } catch (error) {
      setAdaptiveLoading(false);
      console.warn('[MemoryGames] Lobby suggestions error:', error);
    }
  };

  // Fetch weak spots and suggestions on mount when user is available
  useEffect(() => {
    if (userId && mode === 'menu') {
      fetchWeakSpots();
      fetchLobbySuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mode]);

  const loadMemoryDashboard = useCallback(
    async (fresh = false) => {
      if (!userId) {
        setMemoryDashboardLoading(false);
        isInitialLoad.current = false;
        setHasLoadedOnce(true);
        return null;
      }
      // Only the first load shows the skeleton; every refresh after it
      // (a recorded session, pull-to-refresh) keeps the menu on screen.
      if (isInitialLoad.current) setMemoryDashboardLoading(true);
      try {
        const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
        const suffix = fresh ? `?refresh=${Date.now()}` : '';
        const r = await authedFetch(`/api/memory/dashboard${suffix}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: fresh ? 'no-store' : 'default',
        });
        if (!r.ok) throw new Error(`memory/dashboard ${r.status}`);
        const json = await r.json();
        if (json?.success) {
          const normalized = normalizeMemoryDashboard(json.stats);
          setMemoryDashboard(normalized);
          return normalized;
        }
      } catch (e) {
        console.warn('[MemoryGames] dashboard fetch failed:', e?.message || e);
      } finally {
        setMemoryDashboardLoading(false);
        isInitialLoad.current = false;
        setHasLoadedOnce(true);
      }
      return null;
    },
    [userId, isInitialLoad]
  );

  // Load aggregated dashboard payload (real grade, per-level mastery, daily-challenge state)
  useEffect(() => {
    let cancelled = false;
    if (!cancelled) loadMemoryDashboard();
    return () => {
      cancelled = true;
    };
  }, [loadMemoryDashboard]);

  // Load leaderboard data
  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
      const result = await leaderboardService.getLeaderboard(leaderboardMode, null, 50);
      if (result.success) {
        setLeaderboardData(result.leaderboard);
      }

      // Get user rank if logged in
      if (userId) {
        const rankResult = await leaderboardService.getUserRank(userId, leaderboardMode, null);
        if (rankResult.success) {
          setUserRank(rankResult);
        }
      }
    } catch (error) {
      console.warn('[MemoryGames] Failed to load leaderboard:', error);
    } finally {
      setLeaderboardLoading(false);
    }
  }, [leaderboardMode, userId]);

  // Load daily challenge data
  const loadDailyChallenge = useCallback(async () => {
    setChallengeLoading(true);
    try {
      const result = await dailyChallengeService.getTodaysChallenge();
      if (result.success && result.challenge) {
        // Parse scenario from scenario_id JSON string
        let challenge = { ...result.challenge };
        if (challenge.scenario_id && typeof challenge.scenario_id === 'string') {
          try {
            const scenario = JSON.parse(challenge.scenario_id);
            // Merge scenario properties into challenge object
            challenge = {
              ...challenge,
              title: scenario.title || challenge.title,
              description: scenario.description || challenge.description,
              tip: scenario.tip,
              solution: scenario.solution,
              position: scenario.position,
              stackDepth: scenario.stackDepth,
              scenario: scenario, // Keep full scenario for gameplay
            };
          } catch (e) {
            console.warn('[App] Handled exception:', e?.message || e);
          }
        }
        setDailyChallenge(challenge);
      }
    } catch (error) {
      console.warn('[MemoryGames] Failed to load daily challenge:', error);
    } finally {
      setChallengeLoading(false);
    }
  }, []);

  // The daily card sits at the top of the menu, so today's assignment is
  // loaded with the page instead of waiting for a tap on Daily.
  useEffect(() => {
    loadDailyChallenge();
  }, [loadDailyChallenge]);

  // Pull-to-refresh reloads everything the menu shows.
  const refreshMenu = useCallback(async () => {
    await Promise.all([
      loadMemoryDashboard(true),
      loadDailyChallenge(),
      gameType === 'leaderboard' ? loadLeaderboard() : Promise.resolve(),
      fetchWeakSpots(),
      fetchLobbySuggestions(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMemoryDashboard, loadDailyChallenge, loadLeaderboard, gameType, userId]);

  const startDailyPractice = useCallback(() => {
    if (!dailyChallenge) return;
    if (!requireOnline()) return;
    haptic('medium');
    const challengeMode = dailyChallenge.game_mode;
    if (!challengeMode || challengeMode === 'range-memory' || challengeMode === 'range') {
      setCurrentLevel(dailyChallenge.level || 1);
      startGame(dailyChallenge.level || 1);
    } else if (LAZY_GAME_MODES.includes(challengeMode)) {
      setMode(challengeMode);
    } else {
      startGame(dailyChallenge.level || 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyChallenge, requireOnline, haptic, setCurrentLevel]);

  // Handle VIP upgrade - initiate Stripe checkout for VIP subscription
  const handleVipUpgrade = useCallback(async () => {
    if (!userId) {
      router.push('/login?redirect=/hub/preflop-charts');
      return;
    }
    if (!requireOnline()) return;

    if (vipCheckoutRef.current) return;
    vipCheckoutRef.current = true;
    setVipCheckoutPending(true);
    setGameNotice(null);
    const requestController = new AbortController();
    vipCheckoutAbortRef.current = requestController;
    let commerceIntent = null;
    let checkoutRequestId = null;
    try {
      const expectedAccountId = userId;
      const offerConfirmation = subscriptionCheckoutOfferConfirmation(
        expectedAccountId,
        VIP_MEMBERSHIP.monthly
      );
      if (!offerConfirmation) {
        throw new Error('The Current VIP Offer Could Not Be Verified. Review It And Try Again.');
      }
      const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: requestController.signal,
      });
      if (!authorization) {
        throw new Error('Your Signed-In Account Changed. Review This Purchase Again.');
      }

      commerceIntent = {
        scope: 'preflop-vip-monthly',
        userId: expectedAccountId,
        paymentMethod: 'card',
        intent: { plan: 'monthly' },
      };
      checkoutRequestId = getOrCreateCommerceRequestId(commerceIntent);
      const response = await boundedCommerceFetch(
        '/api/store/create-checkout-session',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Checkout-Request-ID': checkoutRequestId,
            Authorization: `Bearer ${authorization.accessToken}`,
          },
          signal: requestController.signal,
          body: JSON.stringify({
            type: 'subscription',
            // The server owns price resolution; the browser sends only
            // the plan key accepted by create-checkout-session.
            items: [{ plan: 'monthly' }],
            offerConfirmation,
            successUrl: `${window.location.origin}/hub/preflop-charts?vip_success=true`,
            cancelUrl: `${window.location.origin}/hub/preflop-charts?vip_canceled=true`,
          }),
        },
        COMMERCE_REQUEST_TIMEOUT_MS
      );

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        const checkoutError = new Error(
          result?.error?.message || `Request Failed (${response.status})`
        );
        checkoutError.code = result?.error?.code || null;
        throw checkoutError;
      }

      const checkoutSession = normalizeVerifiedCheckoutSession(
        result,
        checkoutRequestId,
        offerConfirmation
      );
      if (!checkoutSession) {
        throw new Error('Checkout Session Could Not Be Bound To This Purchase Request.');
      }
      const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: requestController.signal,
      });
      if (!confirmedAuthorization) {
        throw new Error('Your Signed-In Account Changed. The Checkout Link Was Not Opened.');
      }
      // Retain the durable identity through navigation. If the browser
      // loses Stripe's return, the same intent can recover this session.
      window.location.assign(checkoutSession.url);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      if (checkoutRequestReplacementRequired(error) && commerceIntent && checkoutRequestId) {
        try {
          replaceCommerceRequestId({
            ...commerceIntent,
            expectedRequestId: checkoutRequestId,
          });
        } catch (replacementError) {
          error = replacementError;
        }
      }
      console.warn('[MemoryGames] VIP upgrade error:', error);
      setGameNotice({
        type: 'warning',
        context: 'checkout',
        message: error?.message || 'VIP checkout could not start. Please try again.',
      });
    } finally {
      if (vipCheckoutAbortRef.current === requestController) {
        vipCheckoutAbortRef.current = null;
        vipCheckoutRef.current = false;
        setVipCheckoutPending(false);
      }
    }
  }, [router, userId, requireOnline]);

  // ── Page tutorial hand-off (mobile phase 0c / 2) ──
  // The app shell opens the tour; every spotlight target lives on the menu
  // (PreflopMatrixPrimer holds the matrix / legend / submit ones), so the
  // page returns there first unless a game is genuinely in progress: a
  // live Range Lab timer, or any of the six lazy game screens.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const timerActiveRef = useRef(timerActive);
  timerActiveRef.current = timerActive;
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onWillOpen = (e) => {
      if (e && e.detail && e.detail.id && e.detail.id !== 'preflop-charts') return;
      const current = modeRef.current;
      const inProgress =
        (current === 'game' && timerActiveRef.current) || LAZY_GAME_MODES.includes(current);
      if (inProgress) return;
      if (current !== 'menu') setMode('menu');
      setGameType('range');
      setShowFilters(false);
    };
    window.addEventListener(TUTORIAL_WILL_OPEN_EVENT, onWillOpen);
    return () => window.removeEventListener(TUTORIAL_WILL_OPEN_EVENT, onWillOpen);
  }, []);

  // The filter panel is page state, so its phone-back history entry lives here.
  // Jarvis dialogs own their own modal history while mounted.
  const closeFilters = useCallback(() => setShowFilters(false), []);
  useModalHistory(showFilters, closeFilters);

  // Timer color
  const getTimerColor = () => {
    if (timeRemaining > 30) return '#00ff88';
    if (timeRemaining > 10) return '#ffaa00';
    return '#ff4444';
  };

  const activeScenarioFilterCount = Object.values(scenarioFilters || {}).filter(Boolean).length;
  const filteredScenarioCount = filterScenarios(ALL_RANGE_LAB_SCENARIOS, scenarioFilters).length;
  const masteredLevelCount =
    memoryDashboard?.mastered_levels_count ??
    memoryDashboard?.per_level_mastery?.filter((level) => level.mastered).length ??
    0;
  const serverUnlockedLevel = getUnlockedLevel(memoryDashboard?.per_level_mastery || []);
  const sessionUnlockedLevel = Math.min(10, Math.floor(consecutivePasses / 5) + 1);
  const highestUnlockedLevel = Math.max(serverUnlockedLevel, sessionUnlockedLevel);
  const markedHandCount = Object.keys(userGrid).length;
  const selectedActionCount = Object.values(userGrid).filter(
    (action) => action === selectedAction
  ).length;
  const showMenuSkeleton = memoryDashboardLoading && !hasLoadedOnce;
  const anySheetOpen = explainModal.show || showFilters || aiGenerating || menuOpen;

  // Readout above the matrix: the last hand touched, what it holds now, and
  // (once graded) what the local range key holds.
  const touchedAction = lastTouchedHand ? userGrid[lastTouchedHand] : null;
  const solverActionForTouched =
    lastTouchedHand && currentScenario?.solution
      ? normalizeRangeAction(currentScenario.solution[lastTouchedHand])
      : null;

  const launchCard = MODE_CARDS[gameType] || null;
  // The three browser-only speed/pattern games consume a preflop range key.
  // Never pass a level 8-10 postflop object into their preflop hand picker.
  const preflopPracticeLevel = Math.min(7, Math.max(1, Number(currentLevel) || 1));
  let personalBest = null;
  if (launchCard && hasLoadedOnce) {
    try {
      const stored =
        typeof window !== 'undefined'
          ? JSON.parse(localStorage.getItem(`pb_${launchCard.mode}`) || 'null')
          : null;
      if (stored && stored.score) personalBest = stored;
    } catch (e) {
      console.warn('[App] Handled exception:', e);
    }
  }

  const leaderboardRows = leaderboardData.map((entry, idx) => ({
    ...entry,
    id: entry.user_id || idx,
    rank: idx + 1,
  }));

  return (
    <>
      {/* AEO phase 3 (2026-09-17): this MUST stay outside <PageTransition>.
          PageTransition is dynamic(..., { ssr: false }), so a head that sits
          inside it never reaches the server HTML. /hub/preflop-charts shipped
          no title, no description and no canonical to any crawler, while
          sitting in the sitemap at priority 0.7. The render-blocking Google
          Fonts stylesheet went with it: the site self-hosts both families
          through next/font, so the link fetched nothing this page used. */}
      <SEOHead
        title="Preflop Range Lab: Free Local Range Practice"
        description="Practice Authored Preflop Reference Ranges In Free Local Drills On Smarter.Poker. Results Stay On The Page: They Do Not Change Account Progress, Rank Or Rewards. Free To Play."
        canonical="/hub/preflop-charts"
        jsonLd={PREFLOP_SCHEMA}
      />

    <PageTransition disableInitialAnimation>

      <HubPageShell
        className="preflop"
        maxWidth={1080}
        background="#02050a"
        onMenuClick={() => setMenuOpen(true)}
      >
        <div
          className="memory-games-page preflop-command-deck"
          ref={containerRef}
          style={{
            ...styles.container,
            transform: screenShake ? 'translate(5px, 5px)' : 'none',
            animation: screenShake ? 'shake 0.3s ease-in-out' : 'none',
          }}
        >
          {/* Background */}
          <div style={styles.bgGrid} />
          <div style={styles.bgGlow} />

          {/* Hamburger Menu */}
          <HamburgerMenu
            isOpen={menuOpen}
            onClose={() => setMenuOpen(false)}
            direction="left"
            theme="dark"
            user={null}
            showProfile={false}
            menuItems={menuConfig.menuItems}
            bottomLinks={menuConfig.bottomLinks}
          />

          {/* Combo Popup */}
          {showComboPopup && comboName && (
            <ComboPopup comboName={comboName} multiplier={multiplier} />
          )}

          {/* Main Content */}
          <div style={styles.content}>
            {mode === 'menu' && showMenuSkeleton && <MenuSkeleton />}

            {mode === 'menu' && !showMenuSkeleton && (
              <PullToRefresh onRefresh={refreshMenu} disabled={anySheetOpen}>
                <div className="preflop-menu">
                  {/* Title */}
                  <div className="preflop-hero">
                    <div className="preflop-hero-copy">
                      <span className="preflop-eyebrow">AUTHORED RANGE PRACTICE</span>
                      <h1>Preflop Charts</h1>
                      <p>
                        Practice Authored Range References. No Solver-Exact Or Account-Progress
                        Claim.
                      </p>
                      {memoryDashboard?.current_grade &&
                        memoryDashboard?.rolling_30d_sessions > 0 && (
                          <div
                            className="preflop-grade-chip"
                            aria-label={`Current memory grade ${memoryDashboard.current_grade}`}
                          >
                            <span>{memoryDashboard.current_grade}</span>
                            <span>{memoryDashboard.rolling_accuracy_pct}% Across Last 30 Days</span>
                            {memoryDashboard.mastered_levels_count > 0 && (
                              <span>{memoryDashboard.mastered_levels_count}/10 Mastered</span>
                            )}
                          </div>
                        )}
                      <div className="preflop-cost-chip">
                        <ShieldCheck size={17} aria-hidden />
                        <span>Free Local Practice / No Entry Fee</span>
                      </div>
                    </div>
                    <div className="preflop-hero-visual" aria-hidden="true">
                      <div className="preflop-range-matrix">
                        {Array.from({ length: 36 }, (_, index) => (
                          <span key={index} />
                        ))}
                      </div>
                      <div className="preflop-diamond-stage">
                        <img src="/images/diamond-icon.png" alt="" />
                      </div>
                    </div>
                  </div>

                  {/* Section links: stats, ranks, awards, guide (tutorial target: subnav) */}
                  <PreflopSubpageNav
                    current="/hub/preflop-charts"
                    sticky={false}
                    tutorialTarget="subnav"
                  />

                  {/* Daily Challenge Card (tutorial target: daily) */}
                  <DailyLocalPracticeCard
                    challenge={dailyChallenge}
                    loading={challengeLoading && !dailyChallenge}
                    onPlay={startDailyPractice}
                  />

                  {/* Smart Practice Card - Adaptive Training (tutorial target: jarvis) */}
                  <section
                    className="preflop-smart-practice"
                    aria-labelledby="smart-practice-title"
                    data-tutorial="jarvis"
                  >
                    <div className="preflop-jarvis-medallion" aria-hidden="true">
                      <img src="/images/jarvis-avatar-new.webp" alt="" />
                    </div>
                    <div className="preflop-smart-copy">
                      <div className="preflop-panel-kicker">
                        <BrainCircuit size={15} aria-hidden /> AI TRAINING LINK
                      </div>
                      <h2 id="smart-practice-title">Smart Practice</h2>
                      <p>
                        {userId
                          ? 'Jarvis Analyzes Your History And Creates Personalized Training.'
                          : 'Sign In And Jarvis Analyzes Your History, Builds Personalized Drills And Explains Every Mistake.'}
                      </p>

                      {/* Weak Spots Display */}
                      {weakSpots.length > 0 && (
                        <div className="preflop-weak-spots">
                          <div className="preflop-weak-label">Areas To Improve</div>
                          {weakSpots.slice(0, 2).map((spot, i) => (
                            <div key={i} className="preflop-weak-row">
                              <span>{spot.area}</span>
                              <span>{spot.errorCount} Errors</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={startAdaptiveTraining}
                      disabled={adaptiveLoading}
                      className="preflop-primary-cta"
                    >
                      <span>
                        {adaptiveLoading
                          ? 'Generating...'
                          : !userId
                            ? 'Sign In For Smart Practice'
                            : weakSpots.length > 0
                              ? `Train ${weakSpots[0]?.area}`
                              : 'Start Smart Practice'}
                      </span>
                      <ChevronRight size={20} aria-hidden />
                    </button>
                  </section>

                  {/* Jarvis Suggestions Panel */}
                  {userId && lobbySuggestions.length > 0 && (
                    <section
                      className="preflop-suggestions"
                      aria-labelledby="jarvis-suggestions-title"
                    >
                      <div className="preflop-suggestions-title" id="jarvis-suggestions-title">
                        Jarvis Suggestions
                      </div>
                      <div className="preflop-suggestions-list">
                        {lobbySuggestions.map((suggestion, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              haptic('light');
                              if (suggestion.actionType === 'daily_challenge') {
                                if (dailyChallenge) {
                                  startDailyPractice();
                                } else {
                                  loadDailyChallenge();
                                }
                              } else if (suggestion.actionType === 'start_level') {
                                const suggestedLevel = Number(suggestion.levelId);
                                if (LEVELS.some((level) => level.level === suggestedLevel)) {
                                  startGame(suggestedLevel);
                                }
                              } else if (suggestion.actionType === 'adaptive_training') {
                                startAdaptiveTraining();
                              } else if (suggestion.actionType === 'quick_game') {
                                startGame(currentLevel);
                              } else if (
                                suggestion.actionType === 'position_training' &&
                                suggestion.position
                              ) {
                                const suggestedFilters = {
                                  ...scenarioFilters,
                                  position: suggestion.position,
                                };
                                setScenarioFilters(suggestedFilters);
                                startGame(currentLevel, suggestedFilters);
                              }
                            }}
                            className="preflop-suggestion-row"
                          >
                            <span>
                              {suggestion.actionType === 'daily_challenge'
                                ? "Practice Today's Posted Range Assignment Locally."
                                : suggestion.message}
                            </span>
                            <span>
                              {suggestion.actionType === 'daily_challenge'
                                ? 'Start Local Practice'
                                : suggestion.action}
                              <ChevronRight size={15} aria-hidden />
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Game Mode Selector (tutorial target: mode-grid). A wrapping
                                grid at every width: every mode card is always visible. */}
                  <div
                    className="preflop-mode-rail"
                    aria-label="Training modes"
                    data-tutorial="mode-grid"
                  >
                    {MODES.map((m) => {
                      const active = gameType === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => {
                            haptic('light');
                            setGameType(m.key);
                          }}
                          className={`preflop-mode-card${active ? ' is-active' : ''}`}
                          style={{ '--mode-accent': m.color }}
                          aria-pressed={active}
                        >
                          <span className="preflop-mode-icon">
                            <m.Icon size={23} aria-hidden />
                          </span>
                          <span className="preflop-mode-label">{m.label}</span>
                          <span className="preflop-mode-desc">{m.desc}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Quick Access Row */}
                  <div className="preflop-quick-row">
                    {EXTRA_MODES.map((m) => {
                      const active = gameType === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => {
                            haptic('light');
                            setGameType(m.key);
                            if (m.key === 'leaderboard') loadLeaderboard();
                            if (m.key === 'daily') loadDailyChallenge();
                          }}
                          className={`preflop-quick-button${active ? ' is-active' : ''}`}
                          style={{ '--mode-accent': m.color }}
                          aria-pressed={active}
                        >
                          <m.Icon size={16} aria-hidden />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Mode Launch Card (CSS enter animation keyed by mode) */}
                  {launchCard && (
                    <div
                      key={gameType}
                      className="preflop-launch-card"
                      style={{
                        '--launch-color': launchCard.color,
                        '--launch-from': launchCard.gradient[0],
                        '--launch-to': launchCard.gradient[1],
                      }}
                    >
                      <div
                        className="preflop-launch-difficulty"
                        style={{
                          color: launchCard.diffColor,
                          borderColor: `${launchCard.diffColor}66`,
                          background: `${launchCard.diffColor}22`,
                        }}
                      >
                        {launchCard.difficulty}
                      </div>
                      <div className="preflop-launch-icon" aria-hidden="true">
                        <launchCard.Icon size={44} />
                      </div>
                      <h2 className="preflop-launch-title">{launchCard.title}</h2>
                      <p className="preflop-launch-desc">{launchCard.desc}</p>

                      <div className="preflop-launch-stats">
                        {launchCard.stats.map((s, i) => (
                          <div key={i}>
                            <span>{s.label}</span>
                            <strong>{s.value}</strong>
                          </div>
                        ))}
                      </div>

                      {personalBest && (
                        <div className="preflop-launch-best">
                          <Medal size={16} aria-hidden />
                          <span>LOCAL BEST</span>
                          <strong>{personalBest.score}</strong>
                          {personalBest.grade && (
                            <em
                              style={{
                                background:
                                  {
                                    S: '#FFD70022',
                                    A: '#22C55E22',
                                    B: '#3B82F622',
                                    C: '#F59E0B22',
                                    D: '#EF444422',
                                  }[personalBest.grade] || '#fff1',
                                color:
                                  {
                                    S: '#FFD700',
                                    A: '#22C55E',
                                    B: '#3B82F6',
                                    C: '#F59E0B',
                                    D: '#EF4444',
                                  }[personalBest.grade] || '#fff',
                              }}
                            >
                              {personalBest.grade}
                            </em>
                          )}
                          {personalBest.plays && <span>{personalBest.plays} Plays</span>}
                        </div>
                      )}

                      <button
                        type="button"
                        className="preflop-launch-button"
                        onClick={() => {
                          haptic('medium');
                          if (
                            PREFLOP_ONLY_LOCAL_MODES.has(launchCard.mode) &&
                            Number(currentLevel) > 7
                          ) {
                            toast.info(
                              'This Local Mode Uses The Level 7 Preflop Range Catalog. Postflop Levels Continue In Verified Spot Trainer.',
                              5000
                            );
                          }
                          setMode(launchCard.mode);
                        }}
                      >
                        {launchCard.btn}
                      </button>
                    </div>
                  )}

                  {/* Leaderboard Section */}
                  {gameType === 'leaderboard' && (
                    <div className="preflop-board-panel is-gold">
                      <div className="preflop-board-heading">
                        <Trophy size={40} aria-hidden />
                        <h2>GLOBAL LEADERBOARD</h2>
                        <p>Compete With Players Worldwide. Top Scores Win Prizes!</p>
                      </div>

                      {/* Mode Toggle: wrapping row */}
                      <div className="preflop-board-modes">
                        {LEADERBOARD_MODES.map((modeRow) => (
                          <button
                            key={modeRow.id}
                            type="button"
                            onClick={() => {
                              haptic('light');
                              setLeaderboardMode(modeRow.id);
                              loadLeaderboard();
                            }}
                            aria-pressed={leaderboardMode === modeRow.id}
                            style={{ '--mode-accent': modeRow.color }}
                          >
                            {modeRow.label}
                          </button>
                        ))}
                      </div>

                      {/* User Rank Display */}
                      {userRank && (
                        <div className="preflop-board-rank">
                          <div>
                            <span>YOUR RANK</span>
                            <strong>#{userRank.rank || '-'}</strong>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span>BEST SCORE</span>
                            <strong style={{ color: '#fff', fontSize: 24 }}>
                              {userRank.score || 0}
                            </strong>
                          </div>
                        </div>
                      )}

                      {/* Leaderboard: a table on desktop, one card per row on phones */}
                      <div className="preflop-board-table">
                        {leaderboardLoading ? (
                          <div className="preflop-board-empty">Loading Rankings...</div>
                        ) : leaderboardRows.length === 0 ? (
                          <div className="preflop-board-empty">No Rankings Yet. Be The First!</div>
                        ) : (
                          <ResponsiveTable
                            columns={LEADERBOARD_COLUMNS}
                            rows={leaderboardRows}
                            keyField="id"
                            caption="Global leaderboard"
                          />
                        )}
                      </div>

                      <div className="preflop-board-actions">
                        <button
                          type="button"
                          onClick={() => {
                            haptic('light');
                            loadLeaderboard();
                          }}
                          disabled={leaderboardLoading}
                        >
                          <RefreshCw size={16} aria-hidden /> Refresh Rankings
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Daily Challenge Section */}
                  {gameType === 'daily' && (
                    <div className="preflop-board-panel is-green">
                      <div className="preflop-board-heading">
                        <Calendar size={40} aria-hidden />
                        <h2 style={{ color: '#00ff88' }}>DAILY LOCAL PRACTICE</h2>
                        <p>
                          Practice The Posted Assignment For Today Without Changing Your Account
                          Progress.
                        </p>
                      </div>

                      {challengeLoading ? (
                        <div className="preflop-board-empty">
                          Loading The Practice Assignment For Today...
                        </div>
                      ) : dailyChallenge ? (
                        <div className="preflop-board-challenge">
                          <div className="preflop-board-challenge-head">
                            <Target size={28} aria-hidden />
                            <div>
                              <strong>{dailyChallenge.title || "Today's Practice"}</strong>
                              <span>
                                Level {dailyChallenge.level || 1} /{' '}
                                {(dailyChallenge.game_mode || 'range')
                                  .replace('-', ' ')
                                  .toUpperCase()}
                              </span>
                            </div>
                          </div>

                          <p>
                            Aim For {accuracyToPercent(dailyChallenge.target_accuracy ?? 80)}%
                            Accuracy In This Local Drill. Results Stay On This Device And Do Not
                            Settle A Daily Challenge.
                          </p>

                          <div className="preflop-board-challenge-meta">
                            <div>
                              <span>PRACTICE GOAL</span>
                              <strong style={{ color: '#00ff88' }}>
                                {accuracyToPercent(dailyChallenge.target_accuracy ?? 80)}%
                              </strong>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span>SETTLEMENT</span>
                              <strong style={{ color: '#FFD700' }}>NO ACCOUNT REWARD</strong>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="preflop-board-start"
                            onClick={startDailyPractice}
                          >
                            START LOCAL PRACTICE
                          </button>
                        </div>
                      ) : (
                        <div className="preflop-board-empty is-warning">
                          <h3>No Practice Available</h3>
                          <p>Check Back Soon For The Practice Assignment For Today!</p>
                        </div>
                      )}

                      <div className="preflop-board-note">
                        <strong>LOCAL PRACTICE ONLY</strong>
                        <span>
                          This Launch Does Not Record Completion, Extend A Streak, Change Rankings,
                          Or Award Diamonds.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Level Grid - Only show for Range Memory */}
                  {gameType === 'range' && (
                    <>
                      {/* Filter Toggle Button + AI Generation Toggle (tutorial target: scenario) */}
                      <div className="preflop-level-toolbar" data-tutorial="scenario">
                        <div>
                          <span className="preflop-panel-kicker">RANGE PROGRESSION</span>
                          <h3>Select A Level</h3>
                        </div>
                        <div className="preflop-level-actions">
                          {/* AI Generation Toggle (VIP Feature) */}
                          <button
                            type="button"
                            onClick={() => {
                              haptic('light');
                              if (isVIP !== true) {
                                setGameNotice({
                                  type: 'warning',
                                  message:
                                    'AI Mode Requires Verified VIP Access. Local Practice Remains Available.',
                                });
                                return;
                              }
                              setUseAIGeneration(!useAIGeneration);
                            }}
                            disabled={isVIP !== true}
                            className={`preflop-tool-button${useAIGeneration ? ' is-active is-gold' : ''}`}
                            title="Generate Unique Scenarios Using Jarvis AI"
                            aria-pressed={useAIGeneration}
                          >
                            <BrainCircuit size={15} aria-hidden />
                            {useAIGeneration ? 'AI On' : 'AI Mode'}
                          </button>

                          {/* Filter Toggle */}
                          <button
                            type="button"
                            onClick={() => {
                              haptic('light');
                              setShowFilters(!showFilters);
                            }}
                            className={`preflop-tool-button${showFilters ? ' is-active' : ''}`}
                            aria-expanded={showFilters}
                          >
                            <Filter size={14} aria-hidden />
                            {showFilters ? 'Hide Filters' : 'Filter Scenarios'}
                            {activeScenarioFilterCount > 0 && (
                              <span className="preflop-filter-count">
                                {activeScenarioFilterCount}
                              </span>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Filter Panel (lazy; closes on the back gesture) */}
                      {showFilters && (
                        <ScenarioFilterPanel
                          onFilterChange={setScenarioFilters}
                          onClose={closeFilters}
                          currentFilters={scenarioFilters}
                          availableScenarios={ALL_RANGE_LAB_SCENARIOS.length}
                          filteredCount={filteredScenarioCount}
                        />
                      )}

                      {gameNotice && gameNotice.context !== 'checkout' && (
                        <div
                          className="preflop-game-notice"
                          data-notice={gameNotice.type}
                          role="status"
                        >
                          <Filter size={16} aria-hidden />
                          <span>{gameNotice.message}</span>
                          <button
                            type="button"
                            onClick={() => setGameNotice(null)}
                            aria-label="Dismiss message"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}

                      <div className="preflop-circuit-status" aria-label="Range progression status">
                        <div className="preflop-circuit-label">
                          <span>PROGRESSION CIRCUIT</span>
                          <strong>Training Path Online</strong>
                        </div>
                        <div className="preflop-circuit-stat is-current">
                          <Target size={16} aria-hidden />
                          <span>
                            <small>Current Station</small>
                            <strong>Level {currentLevel}</strong>
                          </span>
                        </div>
                        <div className="preflop-circuit-stat is-mastery">
                          <ShieldCheck size={16} aria-hidden />
                          <span>
                            <small>Next Mastery Gate</small>
                            <strong>
                              Level {highestUnlockedLevel} Open{' '}
                              <em>{masteredLevelCount} Mastered</em>
                            </strong>
                          </span>
                        </div>
                        <div
                          className={`preflop-circuit-stat is-pool${activeScenarioFilterCount > 0 ? ' has-filters' : ''}`}
                        >
                          <Filter size={15} aria-hidden />
                          <span>
                            <small>Practice Pool</small>
                            <strong>
                              {filteredScenarioCount}/{ALL_RANGE_LAB_SCENARIOS.length}{' '}
                              <em>
                                {activeScenarioFilterCount > 0
                                  ? `${activeScenarioFilterCount} Active`
                                  : 'Full Range'}
                              </em>
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="preflop-level-grid">
                        {LEVELS.map((level, idx) => {
                          const levelScenarios = getScenariosByLevel(level.level);
                          const scenarioCount = levelScenarios.length;
                          const matchingScenarioCount =
                            activeScenarioFilterCount > 0
                              ? filterScenarios(levelScenarios, scenarioFilters).length
                              : scenarioCount;
                          const levelConfig = getLevelConfig(level.level) || {
                            timer: 90,
                            gridSize: 13,
                            maxHands: 20,
                            diamondMultiplier: 1.0,
                          };
                          const opensVerifiedSpotTrainer = level.level >= 8;
                          const isUnlocked = level.level <= highestUnlockedLevel;
                          const isCurrent = level.level === currentLevel;
                          const mastery = memoryDashboard?.per_level_mastery?.find(
                            (x) => x.level === level.level
                          );
                          const isMastered = Boolean(mastery?.mastered);
                          const hasMatchingScenarios = matchingScenarioCount > 0;
                          const isAvailable = isUnlocked && hasMatchingScenarios;
                          const levelState = !isUnlocked
                            ? 'locked'
                            : !hasMatchingScenarios
                              ? 'no-match'
                              : isMastered
                                ? 'mastered'
                                : isCurrent
                                  ? 'current'
                                  : 'ready';
                          const levelStateLabel = {
                            locked: 'Locked',
                            'no-match': 'No Matches',
                            mastered: 'Mastered',
                            current: 'Current',
                            ready: 'Ready',
                          }[levelState];

                          return (
                            <article
                              key={level.level}
                              className={`preflop-level-card${isCurrent ? ' is-current' : ''}${isMastered ? ' is-mastered' : ''}${!isUnlocked ? ' is-locked' : ''}${isUnlocked && !hasMatchingScenarios ? ' is-no-match' : ''}`}
                              style={{ '--level-index': idx }}
                              data-level-state={levelState}
                              aria-current={isCurrent ? 'step' : undefined}
                            >
                              <button
                                type="button"
                                className="preflop-level-card-action"
                                onClick={() => startGame(level.level)}
                                disabled={!isAvailable}
                                aria-label={`${levelStateLabel}: Level ${level.level}, ${level.name}. ${matchingScenarioCount} matching scenarios.${opensVerifiedSpotTrainer ? ' Opens Verified Spot Trainer.' : ''}`}
                              />
                              <div className="preflop-level-node" aria-hidden="true">
                                <span>{level.level}</span>
                              </div>
                              <div className="preflop-level-copy">
                                <div className="preflop-level-heading">
                                  <div className="preflop-level-number">Level {level.level}</div>
                                  <span className={`preflop-level-state is-${levelState}`}>
                                    {levelStateLabel}
                                  </span>
                                </div>
                                <h3>{level.name}</h3>
                                <p>{level.focus}</p>
                              </div>
                              <div className="preflop-level-meta">
                                <span>
                                  {opensVerifiedSpotTrainer
                                    ? 'Verified Spot Trainer'
                                    : `${levelConfig.timer}s`}
                                </span>
                                <span>
                                  {opensVerifiedSpotTrainer
                                    ? 'Server-Graded Route'
                                    : 'Free Local Practice'}
                                </span>
                                <span
                                  className={
                                    activeScenarioFilterCount > 0 ? 'is-filtered-count' : ''
                                  }
                                >
                                  {matchingScenarioCount}{' '}
                                  {activeScenarioFilterCount > 0
                                    ? 'Matching'
                                    : `Scenario${matchingScenarioCount !== 1 ? 's' : ''}`}
                                </span>
                                <div className="preflop-level-locks">
                                  {!isUnlocked && (
                                    <Lock
                                      size={12}
                                      aria-hidden
                                      style={{ color: 'rgba(255,255,255,0.45)' }}
                                    />
                                  )}
                                </div>
                              </div>
                              {/* 2026-05-07 - real progress from memoryDashboard.per_level_mastery */}
                              {(() => {
                                const m = mastery;
                                if (!m || m.attempts === 0) return null;
                                const pct = Math.max(0, Math.min(100, m.best_accuracy));
                                return (
                                  <div className="preflop-level-progress">
                                    <div className="preflop-level-progress-label">
                                      <span>Best {pct}%</span>
                                      {m.mastered && (
                                        <span className="preflop-level-mastered-label">
                                          <ShieldCheck size={12} aria-hidden /> Mastered
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className="preflop-level-progress-track"
                                      role="progressbar"
                                      aria-label={`Level ${level.level} best accuracy`}
                                      aria-valuenow={pct}
                                      aria-valuemin={0}
                                      aria-valuemax={100}
                                    >
                                      <div
                                        className={`preflop-level-progress-fill${m.mastered ? ' is-mastered' : ''}`}
                                        style={{ '--level-progress': `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })()}
                            </article>
                          );
                        })}
                      </div>

                      {/* Mastery Gate */}
                      <div className="preflop-mastery-gate">
                        <div className="preflop-mastery-icon">
                          <ShieldCheck size={24} aria-hidden />
                        </div>
                        <div>
                          <div className="preflop-mastery-title">85% Mastery Gate</div>
                          <div className="preflop-mastery-desc">
                            Master Each Level At 85% Or Better To Permanently Open The Next Station.
                            Five Passes In One Session Also Unlock It Immediately.
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* How to read the matrix: the always-visible primer that carries the
                                tutorial's matrix / legend / submit targets on the menu. */}
                  <PreflopMatrixPrimer
                    ranks={RANKS}
                    getHandName={getHandName}
                    actionColors={ACTION_COLORS}
                  />

                  {/* Recent Sessions */}
                  {sessionHistory.length > 0 && (
                    <div className="preflop-recent">
                      <div className="preflop-recent-head">
                        <span>RECENT SESSIONS</span>
                        <span>Last {Math.min(sessionHistory.length, 8)}</span>
                      </div>

                      {/* Mini Trend Chart */}
                      <div className="preflop-recent-chart" aria-hidden="true">
                        {sessionHistory.slice(-12).map((s, i, arr) => {
                          const maxScore = Math.max(...arr.map((x) => x.score || 0), 1);
                          const pct = ((s.score || 0) / maxScore) * 100;
                          const isLast = i === arr.length - 1;
                          const color =
                            (s.score || 0) >= 85
                              ? '#22C55E'
                              : (s.score || 0) >= 60
                                ? '#3B82F6'
                                : '#F59E0B';
                          return (
                            <div
                              key={i}
                              style={{
                                flex: 1,
                                height: `${Math.max(pct, 8)}%`,
                                background: isLast
                                  ? `linear-gradient(to top, ${color}, ${color}88)`
                                  : `${color}44`,
                                borderRadius: 3,
                                transition: 'height 0.3s ease',
                              }}
                              title={`Score: ${s.score || 0}%`}
                            />
                          );
                        })}
                      </div>

                      {/* Session List */}
                      <div className="preflop-recent-list">
                        {sessionHistory
                          .slice(-5)
                          .reverse()
                          .map((s, i) => {
                            const timeAgo = (() => {
                              const diff = Date.now() - s.timestamp;
                              const mins = Math.floor(diff / 60000);
                              if (mins < 60) return `${mins}m Ago`;
                              const hrs = Math.floor(mins / 60);
                              if (hrs < 24) return `${hrs}h Ago`;
                              return `${Math.floor(hrs / 24)}d Ago`;
                            })();
                            const grade =
                              (s.score || 0) >= 95
                                ? 'S'
                                : (s.score || 0) >= 85
                                  ? 'A'
                                  : (s.score || 0) >= 70
                                    ? 'B'
                                    : (s.score || 0) >= 50
                                      ? 'C'
                                      : 'D';
                            const gradeColor = {
                              S: '#FFD700',
                              A: '#22C55E',
                              B: '#3B82F6',
                              C: '#F59E0B',
                              D: '#EF4444',
                            }[grade];
                            return (
                              <div key={i} className="preflop-recent-row">
                                <div
                                  className="preflop-recent-grade"
                                  style={{
                                    background: `${gradeColor}22`,
                                    border: `1px solid ${gradeColor}55`,
                                    color: gradeColor,
                                  }}
                                >
                                  {grade}
                                </div>
                                <div className="preflop-recent-copy">
                                  Level {s.level || '?'} {s.position ? `/ ${s.position}` : ''}
                                </div>
                                <div className="preflop-recent-score">
                                  <strong style={{ color: gradeColor }}>{s.score || 0}%</strong>
                                  <span>{timeAgo}</span>
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {/* Quick Stats Row */}
                      <div className="preflop-recent-stats">
                        {[
                          { label: 'SESSIONS', value: sessionHistory.length },
                          {
                            label: 'AVG SCORE',
                            value: `${Math.round(sessionHistory.reduce((a, s) => a + (s.score || 0), 0) / sessionHistory.length)}%`,
                          },
                          {
                            label: 'BEST',
                            value: `${Math.max(...sessionHistory.map((s) => s.score || 0))}%`,
                          },
                        ].map((stat, i) => (
                          <div key={i}>
                            <strong>{stat.value}</strong>
                            <span>{stat.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* VIP Upsell - only for confirmed non-VIP users */}
                  {isVIP === false && (
                    <div className="preflop-vip-panel">
                      <div className="preflop-vip-seal">VIP</div>
                      <div className="preflop-vip-copy">
                        <div>Go VIP - $19.99/Month</div>
                        <p>Unlock Verified AI Scenario Generation And Other VIP Features.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          haptic('light');
                          handleVipUpgrade();
                        }}
                        disabled={vipCheckoutPending}
                      >
                        {vipCheckoutPending ? 'Opening Checkout...' : 'Upgrade To VIP'}{' '}
                        <ChevronRight size={18} aria-hidden />
                      </button>
                      {gameNotice?.context === 'checkout' && (
                        <div className="preflop-vip-notice" role="status">
                          <span>{gameNotice.message}</span>
                          <button
                            type="button"
                            onClick={() => setGameNotice(null)}
                            aria-label="Dismiss checkout message"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </PullToRefresh>
            )}

            {/* Speed Drill Mode - Full Implementation */}
            {mode === 'speed-drill' && (
              <SpeedDrillGame
                level={preflopPracticeLevel}
                onExit={() => setMode('menu')}
                onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                DiamondEngine={economyReady ? DiamondEngine : null}
                userId={userId}
              />
            )}

            {/* Pressure Cooker Mode - Full Implementation */}
            {mode === 'pressure-cooker' && (
              <PressureCookerGame
                level={preflopPracticeLevel}
                onExit={() => setMode('menu')}
                onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                DiamondEngine={economyReady ? DiamondEngine : null}
                userId={userId}
              />
            )}

            {/* Pattern Recognition Mode - Full Implementation */}
            {mode === 'pattern-recognition' && (
              <PatternRecognitionGame
                level={preflopPracticeLevel}
                onExit={() => setMode('menu')}
                onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                DiamondEngine={economyReady ? DiamondEngine : null}
                userId={userId}
              />
            )}

            {/* Mixed Strategy Mode - Full Implementation */}
            {mode === 'mixed-strategy' && (
              <MixedStrategyGame
                level={currentLevel}
                onExit={() => setMode('menu')}
                onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                DiamondEngine={economyReady ? DiamondEngine : null}
                userId={userId}
              />
            )}

            {/* Spot Trainer Mode - Full Implementation */}
            {mode === 'spot-trainer' && (
              <SpotTrainerGame
                level={currentLevel}
                onExit={() => setMode('menu')}
                onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                DiamondEngine={economyReady ? DiamondEngine : null}
                userId={userId}
              />
            )}

            {/* Tournament Mode - Full Implementation */}
            {mode === 'tournament' && (
              <TournamentModeGame
                level={currentLevel}
                onExit={() => setMode('menu')}
                onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                DiamondEngine={economyReady ? DiamondEngine : null}
                diamondBalance={Number.isFinite(diamondBalance) ? diamondBalance : 0}
              />
            )}

            {/* AI Generation Loading Overlay */}
            {aiGenerating && (
              <div
                className="preflop-ai-overlay sp-fullscreen-overlay"
                role="status"
                aria-live="polite"
              >
                <div className="preflop-ai-overlay-icon" aria-hidden="true">
                  <BrainCircuit size={48} />
                </div>
                <div className="preflop-ai-overlay-title">
                  Jarvis Is Generating Your Scenario...
                </div>
                <div className="preflop-ai-overlay-sub">
                  Creating A Unique Local Practice Challenge
                </div>
              </div>
            )}

            {(mode === 'game' || mode === 'result') && currentScenario && (
              <section
                className="preflop-range-lab"
                aria-labelledby="preflop-range-lab-title"
                ref={labRef}
              >
                <p className="preflop-lab-live" aria-live="polite" aria-atomic="true">
                  {labStatus}
                </p>
                <header className="preflop-lab-briefing" data-tutorial="scenario">
                  <div className="preflop-lab-briefing-copy">
                    <div className="preflop-lab-kicker">
                      <span>Range Lab</span>
                      <span>Level {currentLevel}</span>
                    </div>
                    <h2 id="preflop-range-lab-title">{currentScenario.title}</h2>
                    <p>{currentScenario.description}</p>
                    {currentScenario.tip && !gradeResult && preferences.visualHints === true && (
                      <div className="preflop-lab-tip">
                        <Lightbulb size={16} aria-hidden />
                        <span>{currentScenario.tip}</span>
                      </div>
                    )}
                  </div>

                  <div className={`preflop-lab-readout${gradeResult ? ' has-result' : ''}`}>
                    {gradeResult ? (
                      <>
                        <strong data-pass={gradeResult.score >= MASTERY_THRESHOLD}>
                          {gradeResult.score}%
                        </strong>
                        <span>
                          {gradeResult.score >= MASTERY_THRESHOLD
                            ? 'Range Passed'
                            : 'Review Required'}
                        </span>
                      </>
                    ) : preferences.showTimer !== false ? (
                      <>
                        <Clock3 size={18} aria-hidden />
                        <strong style={{ color: getTimerColor() }}>{timeRemaining}</strong>
                        <span>Seconds</span>
                      </>
                    ) : (
                      <>
                        <Clock3 size={18} aria-hidden />
                        <strong className="preflop-lab-timer-hidden">-</strong>
                        <span>Timer Hidden</span>
                      </>
                    )}
                  </div>

                  {preferences.showTimer !== false && (
                    <div
                      className="preflop-lab-timer"
                      data-urgency={
                        timeRemaining <= 10
                          ? 'critical'
                          : timeRemaining <= 30
                            ? 'warning'
                            : 'steady'
                      }
                      role="progressbar"
                      aria-label="Scenario time remaining"
                      aria-valuemin="0"
                      aria-valuemax={safeLevelConfig.timer}
                      aria-valuenow={timeRemaining}
                    >
                      <span
                        style={{
                          '--timer-progress': `${Math.max(0, Math.min(100, (timeRemaining / safeLevelConfig.timer) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </header>

                <div className="preflop-lab-console">
                  <div className="preflop-lab-action-header">
                    <div>
                      <span className="preflop-lab-section-index">01</span>
                      <span>Choose Action</span>
                    </div>
                    <span>
                      {markedHandCount} Hand{markedHandCount === 1 ? '' : 's'} Marked
                    </span>
                  </div>
                  <div
                    className="preflop-lab-actions"
                    aria-label="Range actions"
                    data-tutorial="legend"
                  >
                    {Object.entries(ACTION_COLORS).map(([action, { bg, border, label, key }]) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => handleActionSelect(action)}
                        disabled={!!gradeResult}
                        className={selectedAction === action ? 'is-selected' : ''}
                        style={{ '--action-color': border, '--action-fill': bg }}
                        aria-pressed={selectedAction === action}
                      >
                        <kbd>{key}</kbd>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="preflop-lab-shape-tools" aria-label="Quick range shapes">
                    <span>Apply Active Action To</span>
                    <button
                      type="button"
                      onClick={() => handleFillShape('pairs')}
                      disabled={!!gradeResult}
                    >
                      Pairs
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFillShape('suited')}
                      disabled={!!gradeResult}
                    >
                      Suited
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFillShape('offsuit')}
                      disabled={!!gradeResult}
                    >
                      Offsuit
                    </button>
                  </div>
                </div>

                {/* Sticky command strip. On phones it carries the six quick action
                                buttons (a second way to pick the action, beside the full row
                                above) and the edit tools; on desktop the quick buttons are hidden
                                because the full action row is still on screen, and the marked /
                                active counters take their place. The counters ARE shown on phones
                                too (in the active-tool block), so nothing is culled. */}
                <div
                  className="preflop-lab-command-strip"
                  style={{
                    '--selected-color': ACTION_COLORS[selectedAction]?.border,
                    '--selected-fill': ACTION_COLORS[selectedAction]?.bg,
                  }}
                  aria-label="Range editing controls"
                >
                  <div className="preflop-lab-active-tool">
                    <span>Active Tool</span>
                    <strong>
                      <i aria-hidden />
                      {ACTION_COLORS[selectedAction]?.label || selectedAction}
                    </strong>
                    <em className="preflop-lab-active-counts">
                      {markedHandCount} Marked / {selectedActionCount} Active
                    </em>
                  </div>
                  <div className="preflop-lab-command-actions" aria-label="Quick action selector">
                    {Object.entries(ACTION_COLORS).map(([action, { border, label }]) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => handleActionSelect(action)}
                        disabled={!!gradeResult}
                        aria-label={`Use ${label}`}
                        aria-pressed={selectedAction === action}
                        style={{ '--action-color': border }}
                      >
                        <i aria-hidden />
                        <span>{label.replace('RAISE ', 'R-')}</span>
                      </button>
                    ))}
                  </div>
                  <div
                    className="preflop-lab-command-counts"
                    aria-label={`${markedHandCount} hand${markedHandCount === 1 ? '' : 's'} marked; ${selectedActionCount} use the active action`}
                  >
                    <span>
                      <strong>{markedHandCount}</strong> Marked
                    </span>
                    <span>
                      <strong>{selectedActionCount}</strong> Active
                    </span>
                  </div>
                  <div className="preflop-lab-edit-tools">
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        handleUndo();
                      }}
                      disabled={
                        !!gradeResult || !timerActive || gridHistoryRef.current.length === 0
                      }
                      aria-label="Undo last range edit"
                    >
                      <Undo2 size={16} aria-hidden />
                      <span>Undo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        handleRedo();
                      }}
                      disabled={!!gradeResult || !timerActive || gridRedoRef.current.length === 0}
                      aria-label="Redo last undone range edit"
                    >
                      <Redo2 size={16} aria-hidden />
                      <span>Redo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        handleClearRange();
                      }}
                      disabled={!!gradeResult || !timerActive || markedHandCount === 0}
                      aria-label="Clear marked range"
                    >
                      <Trash2 size={16} aria-hidden />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>

                <div className="preflop-lab-matrix-panel">
                  <div className="preflop-lab-matrix-heading">
                    <div>
                      <span className="preflop-lab-section-index">02</span>
                      <span>Build Your Range</span>
                    </div>
                    <span>
                      Tap Or Drag To Apply {ACTION_COLORS[selectedAction]?.label || selectedAction}
                    </span>
                  </div>

                  {/* Readout bar: always visible above the grid so a phone user sees
                                    what they touched even when the cell has no room for a label. */}
                  <div className="preflop-lab-touch-readout" aria-live="polite" aria-atomic="true">
                    {lastTouchedHand ? (
                      <>
                        <strong>{lastTouchedHand}</strong>
                        <span
                          className="preflop-lab-touch-action"
                          style={{
                            '--action-color': touchedAction
                              ? ACTION_COLORS[touchedAction]?.border
                              : 'rgba(129, 167, 194, 0.5)',
                          }}
                        >
                          <i aria-hidden />
                          {touchedAction ? ACTION_COLORS[touchedAction]?.label : 'Not Marked'}
                        </span>
                        {gradeResult && (
                          <span
                            className="preflop-lab-touch-action is-solver"
                            style={{
                              '--action-color':
                                solverActionForTouched && ACTION_COLORS[solverActionForTouched]
                                  ? ACTION_COLORS[solverActionForTouched].border
                                  : ACTION_COLORS.fold.border,
                            }}
                          >
                            <i aria-hidden />
                            Local Key:{' '}
                            {solverActionForTouched && ACTION_COLORS[solverActionForTouched]
                              ? ACTION_COLORS[solverActionForTouched].label
                              : 'FOLD'}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="preflop-lab-touch-hint">
                        {gradeResult
                          ? 'Tap A Hand To Compare It With The Local Range Key'
                          : 'Tap Or Drag To Paint Hands'}
                      </span>
                    )}
                  </div>

                  <PreflopRangeMatrix
                    ranks={RANKS}
                    getHandName={getHandName}
                    actionColors={ACTION_COLORS}
                    userGrid={userGrid}
                    gradeResult={gradeResult}
                    scenario={currentScenario}
                    timerActive={timerActive}
                    onStrokeStart={handleStrokeStart}
                    onPaintHand={handlePaintHand}
                    onStrokeEnd={handleStrokeEnd}
                    onHandFocus={handleHandFocus}
                  />
                </div>

                <div className="preflop-lab-submit-panel">
                  {!gradeResult ? (
                    <button
                      type="button"
                      onClick={() => handleSubmit()}
                      className="preflop-lab-submit"
                      disabled={!timerActive}
                      data-tutorial="submit"
                    >
                      <Send size={18} aria-hidden />
                      <span>Submit Range</span>
                      {preferences.keyboardShortcuts !== false && <kbd>Space</kbd>}
                    </button>
                  ) : (
                    <div className="preflop-lab-result-actions" data-tutorial="submit">
                      <button
                        type="button"
                        onClick={() => {
                          haptic('light');
                          setMode('menu');
                        }}
                      >
                        <RotateCcw size={17} aria-hidden />
                        Training Menu
                      </button>
                      <button type="button" onClick={handleRetry}>
                        <RotateCcw size={17} aria-hidden />
                        Retry This Range
                      </button>
                      <button type="button" onClick={handleNext} className="is-primary">
                        Next Scenario
                        <ArrowRight size={17} aria-hidden />
                      </button>
                    </div>
                  )}
                </div>

                {/* Result Feedback */}
                {gradeResult && (
                  <div className="preflop-lab-feedback" aria-live="polite">
                    <div className="preflop-lab-feedback-grid">
                      <div data-result="correct">
                        <span>Correct</span>
                        <strong>{gradeResult.correctHands}</strong>
                      </div>
                      <div data-result="missed">
                        <span>Missed</span>
                        <strong>{gradeResult.missedHands.length}</strong>
                      </div>
                      <div data-result="extra">
                        <span>Extra</span>
                        <strong>{gradeResult.extraHands.length}</strong>
                      </div>
                      <div data-result="wrong">
                        <span>Wrong Action</span>
                        <strong>{gradeResult.wrongActionHands.length}</strong>
                      </div>
                    </div>
                    {gradeResult.score >= 85 && lastReward && (
                      <div className="preflop-lab-reward">
                        <Gem size={17} aria-hidden />+{lastReward.diamonds} Local Practice Diamonds
                        / x{multiplier} Multiplier
                      </div>
                    )}

                    {/* Ask Jarvis Why Button - shows when there are mistakes (tutorial target: jarvis) */}
                    {(gradeResult.missedHands.length > 0 ||
                      gradeResult.wrongActionHands.length > 0) && (
                      <>
                        <button
                          type="button"
                          className="preflop-lab-jarvis-button"
                          data-tutorial="jarvis"
                          onClick={() => {
                            const firstMistake =
                              gradeResult.wrongActionHands[0] || gradeResult.missedHands[0];
                            const correctAction =
                              currentScenario?.solution?.[firstMistake] || 'call';
                            const userAction = userGrid[firstMistake] || 'fold';
                            showLocalRangeKeyNote(firstMistake, correctAction, userAction);
                          }}
                        >
                          Explain This Local Range Key
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Local range-key review; no solver or exact-EV authority. */}
                {gradeResult && (
                  <EnhancedReviewPanel
                    gradeResult={gradeResult}
                    scenario={currentScenario}
                    userGrid={userGrid}
                    sessionHistory={sessionHistory}
                    onAskJarvis={(hand, correctAction, userAction) =>
                      showLocalRangeKeyNote(hand, correctAction, userAction)
                    }
                  />
                )}

                {explainModal.show && (
                  <JarvisExplanationDialog
                    modal={explainModal}
                    onClose={() => setExplainModal((prev) => ({ ...prev, show: false }))}
                  />
                )}
              </section>
            )}
          </div>
        </div>
      </HubPageShell>

      {/* Inject shake animation */}
      <style>{`
                @keyframes shake {
                    0%, 100% { transform: translate(0, 0); }
                    25% { transform: translate(-5px, 5px); }
                    50% { transform: translate(5px, -5px); }
                    75% { transform: translate(-5px, -5px); }
                }
            `}</style>
    </PageTransition>
    {/* Outside <PageTransition> for the same reason the head is, and
        AFTER it so the app still opens at the top of the page: this is the
        only body copy a crawler that runs no JavaScript ever sees here. */}
    <HubPageSummary page="preflop-charts" as="h1" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// The shell (HubPageShell) owns 100dvh, the 100vw clamp, overflow and the
// bottom clearance; the deck only sets what is its own.
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
  container: {
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'Inter, -apple-system, sans-serif',
    position: 'relative',
    padding: '16px',
    transition: 'transform 0.05s ease-out',
  },
  bgGrid: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: `
            linear-gradient(rgba(0, 255, 255, 0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 255, 0.015) 1px, transparent 1px)
        `,
    backgroundSize: '50px 50px',
    pointerEvents: 'none',
  },
  bgGlow: {
    position: 'fixed',
    top: '30%',
    left: '50%',
    width: '100%',
    height: '100%',
    transform: 'translate(-50%, -50%)',
    background: 'radial-gradient(ellipse at center, rgba(0, 200, 255, 0.06), transparent 60%)',
    pointerEvents: 'none',
  },
  content: {
    maxWidth: 1180,
    margin: '0 auto',
  },
};
