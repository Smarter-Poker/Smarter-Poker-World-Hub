import dynamic from 'next/dynamic';
/**
 * BANKROLL MANAGER PAGE
 * /hub/bankroll-manager - Financial Truth Engine
 * Military-grade tracking with immutable ledger and Personal Assistant
 */

import { useRouter } from 'next/router';
import layout from '../../styles/BankrollManager.module.css';
import SEOHead from '../../src/components/seo/SEOHead';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

// AEO phase 3 (2026-09-17): 3,386 server-rendered words and no structured
// data. FinanceApplication is the honest category for a ledger.
const BANKROLL_MANAGER_FAQS = [
  {
    question: 'How many buy-ins do I need for poker bankroll management?',
    answer:
      'For live cash games, standard bankroll management recommends 20 to 30 buy-ins for recreational players, and 50 to 100 buy-ins for professional players to absorb variance. For multi-table tournaments (MTTs), 100 to 200 buy-ins are standard due to higher variance.',
  },
  {
    question: 'How does Smarter.Poker Bankroll Manager track sessions?',
    answer:
      'Smarter.Poker Bankroll Manager records poker cash games and tournaments, casino table games, slots and sports bets in one ledger. It calculates your net results, hourly win rate, winning-session percentage, trip ROI and variance.',
  },
  {
    question: 'Is the Smarter.Poker Bankroll Manager free to use?',
    answer:
      'Yes, Smarter.Poker Bankroll Manager is 100% free to use. You can log sessions, analyze leaks, export records, and visualize bankroll trends with zero subscription fees.',
  },
  {
    question: 'What is risk of ruin in poker bankroll management?',
    answer:
      'Risk of ruin is the mathematical probability that you will lose your entire poker bankroll before reaching your financial target. The bankroll manager calculates your win rate and standard deviation to estimate safe stakes.',
  },
  {
    question: 'What is the Kelly Criterion in poker bankroll management?',
    answer:
      'The Kelly Criterion calculates the mathematically optimal percentage of your bankroll to risk based on your edge and variance. Fractional Kelly (such as half-Kelly or quarter-Kelly) is standard for poker players to prevent severe drawdowns while maximizing long-term bankroll growth.',
  },
  {
    question: 'How do bankroll requirements differ between cash games and tournaments?',
    answer:
      'Cash games require 20 to 50 buy-ins because variance is lower and you can leave a table whenever needed. Multi-table tournaments (MTTs) require 100 to 200 buy-ins due to massive field sizes and steep payout distributions where 85% of entrants finish outside the money.',
  },
];

const BANKROLL_SCHEMA = hubProductSchema({
  path: '/hub/bankroll-manager',
  name: 'Smarter.Poker Bankroll Manager',
  description:
    'Bankroll Tracking For Poker Players: Log Sessions, Analyse Leaks, Track ROI And See Variance Over Time. Free To Use, No Real-Money Gambling.',
  applicationCategory: 'FinanceApplication',
  trail: [['Hub', '/hub'], ['Bankroll Manager', '/hub/bankroll-manager']],
  faqs: BANKROLL_MANAGER_FAQS,
});
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';
import { AnimatePresence } from 'framer-motion';
import { supabase } from '../../src/lib/supabase';
import { useAvatar } from '../../src/contexts/AvatarContext';
import PageTransition from '../../src/components/transitions/PageTransition';
import HubPageShell from '../../src/components/ui/HubPageShell';
import PullToRefresh from '../../src/components/ui/PullToRefresh';
import { HubErrorBoundary } from '../../src/components/ui/HubErrorBoundary';
import { useLoadFailsafe, useInitialLoadRef } from '../../src/hooks/useLoadFailsafe';
import { useModalHistory } from '../../src/hooks/useModalHistory';
import { useScrimDismiss } from '../../src/hooks/useScrimDismiss';
import { useHaptics } from '../../src/hooks/useHaptics';
import { useOnlineStatus } from '../../src/hooks/useOnlineStatus';
import FeatureGate from '../../src/components/gates/FeatureGate';
import { useFeatureGate } from '../../src/components/gates/FeatureGatePopup';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getBankrollPreferences, updateBankrollPreferences } from '../../src/services/bankrollPreferences';

// Bankroll library
import { getBankrollStats, calculateTotalBankroll } from '../../src/lib/bankroll/calculations';
import { toCents } from '../../src/lib/bankroll/ledgerMath.mjs';
import { sessionReport } from '../../src/lib/bankroll/ledgerReport.mjs';
import { evaluateRuleViolations, monthBounds } from '../../src/lib/bankroll/ruleViolations.mjs';
import {
  GAME_TYPES, sanitizeTimeFilter, sanitizeChartType, sanitizeGameTypes, sanitizeLineAxis, toggleGameType as toggleGameTypeIn,
} from '../../src/lib/bankroll/dashboardFilters.mjs';
import { getUserLocations } from '../../src/lib/bankroll/locationMemory';
import { fetchReportLedger, fetchTrips, fetchSeries, fetchBankrollRules, getDateRangeFilter, initializeUserBankroll, deleteLedgerEntry, createTrip, updateLedgerEntry, createLedgerEntry } from '../../src/lib/bankroll/bankrollSelectors';
import { buildRecentActivity, withoutActiveTripRows } from '../../src/lib/bankroll/tripMath.mjs';
import {
  tripFromReceipt, w2gRowFromReceipt, receiptRowFromScan, ledgerCategoryFor, matchLocationByName, findOpenSessionFor, ledgerEntryFromReceipt, partitionForBulkFiling, entryHoldingImage, receiptNeedingTrip, RECEIPT_ACTIONS, RECEIPT_TARGETS,
} from '../../src/lib/bankroll/receiptInbox.mjs';
import { warmOcr } from '../../src/lib/docscan/ocr.mjs';
import toast from '../../src/stores/toastStore';
import { removeBankrollObject } from '../../src/lib/bankroll/receiptStorage';
import { capture, FunnelEvents } from '../../src/lib/analytics';
import { noteBankrollOpened, noteReceiptFiled } from '../../src/lib/bankroll/funnelSteps.mjs';


// Bankroll components. Eager: the dashboard's first paint (Jarvis insights,
// rules card; the trend chart and stat cards are in DashboardSection, which
// is imported statically below). Everything below the fold or
// off the dashboard is lazy (mobile phase 1b, PERF): each chunk arrives
// when its section mounts and shows the same shimmer block until it does.
// Recharts is never imported at page top level (BankrollTrendChart loads
// it with its own dynamic() calls).
import BankrollRulesCard from '../../src/components/bankroll/BankrollRulesCard';
import JarvisLeakInsights from '../../src/components/bankroll/JarvisLeakInsights';
import BankrollGoals from '../../src/components/bankroll/BankrollGoals';
import BankrollProGate from '../../src/components/bankroll/BankrollProGate';
import ManageVenuesModal from '../../src/components/bankroll/ManageVenuesModal';
import { requestPageTutorial, TUTORIAL_WILL_OPEN_EVENT } from '../../src/tutorials';


const LogEntryModal = dynamic(() => import('../../src/components/bankroll/LogEntryModal'), { ssr: false });
const BankrollProjection = lazySection(() => import('../../src/components/bankroll/BankrollProjection'));
const PlayerNotes = lazySection(() => import('../../src/components/bankroll/PlayerNotes'));
const SavedReceipts = lazySection(() => import('../../src/components/bankroll/SavedReceipts'));
const StakingTracker = lazySection(() => import('../../src/components/bankroll/StakingTracker'));
const SeriesTracker = lazySection(() => import('../../src/components/bankroll/SeriesTracker'));
const SessionHandReview = lazySection(() => import('../../src/components/bankroll/SessionHandReview'));
const TripTracker = lazySection(() => import('../../src/components/bankroll/TripTracker'));
const TokeTracker = lazySection(() => import('../../src/components/bankroll/TokeTracker'));
const CategoryOverview = lazySection(() => import('../../src/components/bankroll/CategoryOverview'));
const BankrollBadges = lazySection(() => import('../../src/components/bankroll/BankrollBadges'));
const SocialStakingProfile = lazySection(() => import('../../src/components/bankroll/SocialStakingProfile'));
const TournamentCalendar = lazySection(() => import('../../src/components/bankroll/TournamentCalendar'));
const LeakAnalysisView = lazySection(() => import('../../src/components/bankroll/LeakAnalysisView'));
const RecentlyDeleted = lazySection(() => import('../../src/components/bankroll/RecentlyDeleted'));
import AdjustBankrollModal from '../../src/components/bankroll/AdjustBankrollModal';
import { hasStartingBankroll } from '../../src/lib/bankroll/bankrollSelectors';
import GeofenceService from '../../src/lib/geofence';
import { requestPermission, showVenueAlert } from '../../src/lib/pushAlerts';
import { sendGeofenceNotification } from '../../src/lib/geofencePush';
import { getAccessToken, getFreshAccessToken } from '../../src/lib/authUtils';
import { loadGeofenceVenues } from '../../src/lib/bankroll/geofenceVenues.mjs';
import { listHeld, releaseHeld, noteAttempt } from '../../src/lib/bankroll/receiptHold.mjs';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import FaqSection from '../../src/components/seo/FaqSection';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import BankrollImageHeader from '../../src/components/bankroll/BankrollImageHeader';
import { BankrollActionTarget } from '../../src/components/bankroll/BankrollHeaderAdd';
// Section modules (2026-11-28 page split). The dashboard is the first paint
// and is server-rendered with the page; every other view and sheet is
// client-only (?view= is read from the router, which is empty while the
// page is prerendered) and arrives as its own chunk when it mounts.
import { styles } from '../../src/components/bankroll/sections/bankrollPageStyles';
import { CATEGORY_LABELS } from '../../src/components/bankroll/sections/bankrollPageConstants';
import { lazySection } from '../../src/components/bankroll/sections/lazySection';
import DashboardSection from '../../src/components/bankroll/sections/DashboardSection';
const ReportsSection = lazySection(() => import('../../src/components/bankroll/sections/ReportsSection'));
const SettingsSection = lazySection(() => import('../../src/components/bankroll/sections/SettingsSection'));
const TaxSection = lazySection(() => import('../../src/components/bankroll/sections/TaxSection'));
const ReceiptScannerSheet = dynamic(() => import('../../src/components/bankroll/sections/ReceiptScannerSheet'), { ssr: false });
const LogSignInPrompt = dynamic(() => import('../../src/components/bankroll/sections/LogSignInPrompt'), { ssr: false });
const RuleViolationsPopup = dynamic(() => import('../../src/components/bankroll/sections/RuleViolationsPopup'), { ssr: false });
const StartingBankrollModal = dynamic(() => import('../../src/components/bankroll/StartingBankrollModal'), { ssr: false });

// Clean SmarterPoker-style navigation (no emojis)
const SIDEBAR_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: '' },
  { id: 'adjust-bankroll', label: 'Adjust Bankroll', icon: '', action: true },
  { id: 'trips', label: 'Trip Tracker', icon: '' },
  { id: 'series', label: 'Series Tracker', icon: '' },
  { id: 'players', label: 'Player Notes', icon: '' },
  // Both views existed with no address that reached them: ?view=leaks fell
  // back to the dashboard, and Session Hand Review was mounted only inside
  // an equally unreachable 'pro' block.
  { id: 'leaks', label: 'Leak Analysis', icon: '' },
  { id: 'hand-review', label: 'Hand Review', icon: '' },
  { id: 'scan-receipt', label: 'Scan Receipt', icon: '' },
  // Reachable from the hamburger (?view=receipts) since it shipped, and from
  // nowhere a thumb could find. The section itself already existed.
  { id: 'receipts', label: 'Saved Receipts', icon: '' },
  { id: 'projection', label: 'Run Projections', icon: '' },
  { id: 'staking', label: 'Staking Tracker', icon: '' },
  { id: 'toke-tracker', label: 'Toke Tracker', icon: '' },
  { id: 'tax', label: 'Tax Reports', icon: '' },

  { id: 'staking-profile', label: 'Staking Profile', icon: '' },
  { id: 'tournament-calendar', label: 'Tournament Calendar', icon: '' },
  { id: 'reports', label: 'Reports', icon: '' },
  { id: 'recently-deleted', label: 'Recently Deleted', icon: '' },
];

// These sections are available from the World Hub menu.
const MENU_SECTION_TITLES = {
  settings: 'Settings',
  rules: 'Bankroll Rules',
  goals: 'Bankroll Goals',
  badges: 'Badges',
};

function resolveBankrollView(requestedView) {
  if (requestedView === 'advanced-tax') return 'tax';
  const section = SIDEBAR_SECTIONS.find(item => item.id === requestedView);
  if (section && !section.action && !['scan-receipt', 'projection'].includes(section.id)) return section.id;
  return Object.hasOwn(MENU_SECTION_TITLES, requestedView) ? requestedView : 'dashboard';
}

// Accounting-only categories never count as gaming sessions.
const ACCOUNTING_CATEGORIES = ['expense', 'deposit', 'withdrawal'];

// Map URL ?type= values to database category IDs
const TYPE_TO_CATEGORY = {
  cash: 'poker_cash',
  tournament: 'poker_mtt',
  casino: 'casino_table',
  slots: 'slots',
  sports: 'sports',
  expense: 'expense',
};

const EMPTY_LEDGER = [];

// Header artwork for views that have none of their own.
const HEADER_ART = { dashboard: 'bankroll', badges: 'goals', leaks: 'jarvis', 'hand-review': 'reports', 'recently-deleted': 'reports' };

function DayPassCountdown({ expiresAt }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();

    const update = () => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${h}h ${m}m`);
    };

    update();
    const interval = setInterval(update, 60000); // update every minute
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt || timeLeft === 'Expired') return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(35,116,225,0.2) 0%, rgba(26,91,184,0.3) 100%)',
      border: '1px solid rgba(35,116,225,0.4)',
      borderRadius: 8,
      padding: '6px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      fontWeight: 600,
      color: '#fff',
      whiteSpace: 'nowrap'
    }}>
      Active Pass: <span style={{ color: '#00D4FF' }}>{timeLeft}</span>
    </div>
  );
}

export default function BankrollManagerPage() {
  const router = useRouter();
  // `initializing` stays true until Supabase restores the session (or a 5s
  // fallback): until then a missing user is unknown, not signed out.
  const { user, initializing: authInitializing } = useAvatar();
  const userId = user?.id;
  const haptic = useHaptics();
  const online = useOnlineStatus();

  // ─── Hardening: mounted ref + debounce timer ────────
  const isMountedRef = useRef(true);
  const rtTimerRef = useRef(null);
  // The first load shows the skeleton; every reload after it (realtime
  // debounce, a mutation's loadData, filter changes) keeps the content on
  // screen so scroll position survives (mobile phase 0a, useInitialLoadRef).
  const isInitialLoad = useInitialLoadRef();
  const [actionTarget, setActionTarget] = useState(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Offline: mutation buttons explain instead of firing (the OfflineBar in
  // pages/_app.js is the global banner; this is the per-action guard).
  const requireOnline = useCallback(() => {
    if (online) return true;
    toast.error('You Are Offline. Try Again When Connected.');
    return false;
  }, [online]);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  // Funnel: the Bankroll Manager was opened, once per browser session, by a
  // signed-in player (src/lib/bankroll/funnelSteps.mjs).
  useEffect(() => { if (userId) noteBankrollOpened({ signedIn: true }); }, [userId]);

  // ═══ ACTION GATE: Users can explore dashboard, but logging/pro tools are gated ═══
  const { guardAction, UpgradePopup, loading: featureAccessLoading, isVip: isGloballyVip, hasAccess: hasProAccess, expiresAt: proExpiresAt } = useFeatureGate('bankroll_pro');

  // UI State - use persisted filters
  const { filters, setFilter } = usePersistedFilters('bankroll-manager', {
    timeFilter: 'All Time',
    chartType: 'line',
    gameTypes: GAME_TYPES,
    lineAxis: 'auto',
  });

  const requestedView = Array.isArray(router.query.view) ? router.query.view[0] : router.query.view;
  const requestedType = Array.isArray(router.query.type) ? router.query.type[0] : router.query.type;
  const requestedTripId = (Array.isArray(router.query.trip) ? router.query.trip[0] : router.query.trip) || null;
  const categoryFilter = Object.hasOwn(TYPE_TO_CATEGORY, requestedType) ? TYPE_TO_CATEGORY[requestedType] :
    Object.hasOwn(CATEGORY_LABELS, requestedType) ? requestedType : 'all';
  const activeSection = categoryFilter !== 'all' ? 'dashboard' : resolveBankrollView(requestedView);
  const headerSection = categoryFilter !== 'all' ? categoryFilter : activeSection === 'toke-tracker' ? 'toke-home' : activeSection;
  const isDashboard = activeSection === 'dashboard' && categoryFilter === 'all';
  // Stored and linked values are read through the allowed options, so a
  // stale label never reaches the dropdown or the date range.
  const timeFilter = sanitizeTimeFilter(filters.timeFilter);
  const chartType = sanitizeChartType(filters.chartType);
  const sectionTitle = activeSection === 'dashboard'
    ? CATEGORY_LABELS[categoryFilter] || 'Bankroll Manager'
    : SIDEBAR_SECTIONS.find(section => section.id === activeSection)?.label
      || MENU_SECTION_TITLES[activeSection]
      || 'Bankroll Manager';

  const setTimeFilter = (val) => setFilter('timeFilter', val);
  const setChartType = (val) => setFilter('chartType', val);
  const setLineAxis = (val) => setFilter('lineAxis', sanitizeLineAxis(val));

  const [editEntry, setEditEntry] = useState(null);

  // The URL owns the current screen. A bare link always opens the dashboard.
  const goToSection = useCallback((sectionId) => {
    const query = sectionId === 'dashboard' ? {} : { view: sectionId };
    void router.push({ pathname: '/hub/bankroll-manager', query }, undefined, { shallow: true, scroll: true });
  }, [router]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showProjection, setShowProjection] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  useLoadFailsafe(isLoading, setIsLoading);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [showStartingBankroll, setShowStartingBankroll] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [bankrollInitialized, setBankrollInitialized] = useState(null); // null = loading, true/false

  const clearActionView = useCallback((view) => {
    const requestedView = Array.isArray(router.query.view) ? router.query.view[0] : router.query.view;
    if (requestedView !== view) return;

    /* STAND DOWN useModalHistory BEFORE replacing the URL (2026-09-03).
       Two mechanisms own history for this modal and they were undoing each
       other. useModalHistory pushes `{ spModal: true }` when the gate opens
       and, when it closes, calls history.back() to pop that entry. Cancel runs
       both: setShowLogModal(false) schedules the hook's effect, and this
       function calls router.replace to strip `?view=log-session`.

       router.replace is ASYNC. The hook's effect ran first, still saw its own
       marker on top, and called back() - which restored the very entry this
       function had just replaced. The dialog closed and the URL stayed at
       `?view=log-session`, so a reload or a share reopened the gate. That is
       what `Bankroll Log deep links ... clean their URL` has been failing on,
       and a red Playwright run makes every open pull request "unstable", which
       is why auto-merge had to be bypassed by hand.

       The hook already guards on `state.spModal`, so clearing the marker
       SYNCHRONOUSLY here - before its effect runs - makes it decline to pop,
       and the replace below stands. Back still works and returns the visitor
       to the deep link they arrived on, which is the honest destination. */
    try {
      const st = window.history.state;
      if (st && st.spModal) {
        window.history.replaceState({ ...st, spModal: false }, '');
      }
    } catch (_) {
      /* history is unavailable (SSR, or a locked-down embed): the replace
         below is still correct, we simply cannot pre-empt the hook. */
    }

    const nextQuery = { ...router.query };
    delete nextQuery.view;
    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true, scroll: false },
    );
  }, [router]);

  const closeLogModal = useCallback(() => {
    // Cancelled without saving: the receipt stays in Receipts Waiting.
    receiptAwaitingEntryRef.current = null;
    setShowLogModal(false);
    setEditEntry(null);
    setDefaultReceiptCategory(null);
    setDefaultReceiptMedia(null);
    setDefaultReceiptData(null);
    clearActionView('log-session');
  }, [clearActionView]);

  // Bankroll preferences (profiles.bankroll_preferences). `notifications`
  // gates the venue arrival alerts below; `currencyEUR` switches every
  // displayed amount. (An Auto-Save toggle sat here for months and nothing
  // read it, so it is gone from Settings and the menu.)
  const [preferences, setPreferences] = useState({
    notifications: true,
    currencyEUR: false
  });
  const notificationsRef = useRef(true);
  notificationsRef.current = preferences.notifications !== false;

  // Filters. The location lives for the visit (a stored id can outlive the
  // venue); the game types persist with the time range and chart type.
  const [locationFilter, setLocationFilter] = useState(null);
  const gameTypeFilter = useMemo(() => sanitizeGameTypes(filters.gameTypes), [filters.gameTypes]);
  const toggleGameType = (type) => setFilter('gameTypes', toggleGameTypeIn(gameTypeFilter, type));

  // One filter menu open at a time (null = none). BankrollFilterMenu closes
  // itself on an outside tap, Escape and tabbing away.
  const [openFilter, setOpenFilter] = useState(null);
  const filterMenuToggle = (id) => (open) => setOpenFilter(open ? id : null);

  // Data
  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState([]);
  const reportScope = JSON.stringify([userId, timeFilter, locationFilter]);
  const [analysisLedger, setAnalysisLedger] = useState(null);
  const [failedScope, setFailedScope] = useState(null);
  const reportReady = analysisLedger?.scope === reportScope;
  const analysisEntries = reportReady ? analysisLedger.rows : EMPTY_LEDGER;
  const latestLoad = useRef(0);
  const [trips, setTrips] = useState([]);
  const [activeSeries, setActiveSeries] = useState(null);
  const [locations, setLocations] = useState([]);
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerStep, setScannerStep] = useState('scan'); // 'scan' | 'post-capture' | 'pick-entry'
  const [scannerEntryId, setScannerEntryId] = useState(null);
  const [scannerImageUrl, setScannerImageUrl] = useState(null);
  const [scannerExtractedData, setScannerExtractedData] = useState(null);
  const [defaultReceiptCategory, setDefaultReceiptCategory] = useState(null);
  const [defaultReceiptMedia, setDefaultReceiptMedia] = useState(null);
  const [defaultReceiptData, setDefaultReceiptData] = useState(null);
  // A SCANNED RECEIPT IS NEVER ABANDONED (Dan, 2026-09-08). Every completed
  // scan is written to bankroll_receipts before the user chooses anything;
  // it stays `unassigned`, and listed on the dashboard, until it is filed.
  const [scannerReceiptId, setScannerReceiptId] = useState(null);
  const [pendingReceipts, setPendingReceipts] = useState([]);
  const [receiptBusy, setReceiptBusy] = useState(false);
  // True while the bankroll_receipts row is being written. The sheet shows at
  // once (so the scanner does not flash empty) but no choice is enabled until
  // there is a row to assign.
  const [receiptSaving, setReceiptSaving] = useState(false);
  // The receipt this scan looks like, if the player has photographed it before.
  const [scannerDuplicate, setScannerDuplicate] = useState(null);
  const [recentHashes, setRecentHashes] = useState([]);
  const [bulkFiling, setBulkFiling] = useState(false);
  // The receipt a LogEntryModal was opened for, so its save marks the receipt assigned.
  const receiptAwaitingEntryRef = useRef(null);
  // The hash of the scan currently on screen, so Retry Listing stores it too.
  const scannerImageHashRef = useRef(null);
  // What the reader did on the scan currently held, so Retry Listing writes
  // the same outcome the first attempt would have.
  const scannerReadOutcomeRef = useRef({ outcome: null, ocrConfidence: null });
  const [discardingReceiptId, setDiscardingReceiptId] = useState(null);
  const [ruleViolations, setRuleViolations] = useState([]);
  const [isVip, setIsVip] = useState(false);

  const gamingSessions = useMemo(
    () => analysisEntries.filter(entry => Object.hasOwn(CATEGORY_LABELS, entry.category) && entry.category !== 'expense'),
    [analysisEntries],
  );
  // Summed in cents by ledgerReport.mjs, like every other figure on the page.
  const report = useMemo(() => sessionReport(gamingSessions), [gamingSessions]);
  const filteredAnalyticsEntries = useMemo(
    () => gamingSessions.filter(entry => gameTypeFilter.includes(entry.category)),
    [gamingSessions, gameTypeFilter],
  );
  const chartEntries = useMemo(
    () => analysisEntries.filter(entry => entry.category === 'expense' || gameTypeFilter.includes(entry.category)),
    [analysisEntries, gameTypeFilter],
  );

  // Initialize bankroll for new users
  useEffect(() => {
    if (userId) {
      initializeUserBankroll(userId).catch(console.warn);
      // Check VIP status
      supabase.from('profiles').select('is_vip').eq('id', userId).maybeSingle()
        .then(({ data }) => { if (data) setIsVip(!!data.is_vip); });
    }
  }, [userId]);

  // Load all data
  const loadData = useCallback(async () => {
    const request = ++latestLoad.current;
    // While the session is still being restored, a missing user is not a
    // signed-out visitor: keep the skeleton. Clearing it here painted an empty
    // dashboard ("No Data For This Period", "-" tiles) for every signed-in
    // load before the real numbers arrived.
    if (!userId && authInitializing) return;
    // Fix: Set isLoading false even when no user (prevents infinite skeleton)
    if (!userId) {
      setAnalysisLedger(null);
      setFailedScope(null);
      setEntries([]);
      setStats(null);
      setIsLoading(false);
      return;
    }

    if (isInitialLoad.current) setIsLoading(true);
    try {
      const dateRange = getDateRangeFilter(timeFilter);

      // The venue list only feeds the Location filter and the log form's
      // picker: if it cannot be read, the last list stays and the ledger still
      // loads. (Leak analysis used to run here on every load for a view no
      // address reached; LeakAnalysisView now reads it while it is open.)
      // Series feed the dashboard banner and Recent Activity. If they cannot
      // be read, their rows are still grouped (never shown loose), because
      // buildRecentActivity treats an unknown trip as possibly active. They
      // are read in the same batch: awaited after it, they held the tiles and
      // the chart for one more round trip (about a second on a phone radio).
      const [statsData, entriesData, tripsData, locationsData, seriesList] = await Promise.all([
        getBankrollStats(userId, dateRange.startDate, dateRange.endDate, locationFilter),
        fetchReportLedger(userId, {
          locationId: locationFilter,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          includeExpenses: true,
        }),
        fetchTrips(userId),
        getUserLocations(userId).catch((error) => {
          console.warn('Could not load venues:', error);
          return null;
        }),
        fetchSeries(userId).catch((e) => {
          console.warn('Could not load series:', e);
          return [];
        }),
      ]);

      if (request !== latestLoad.current || !isMountedRef.current) return;
      setStats(statsData);
      setTrips(tripsData);
      if (locationsData) setLocations(locationsData);
      setActiveSeries(seriesList.find(function (s) { return s.status === 'active'; }) || null);

      // Rows of an active trip or series stay hidden until it is completed;
      // then the trip appears as ONE summary row covering all of its rows.
      var allTrips = tripsData.concat(seriesList);
      setAnalysisLedger({ scope: reportScope, rows: withoutActiveTripRows(entriesData, allTrips) });
      setFailedScope(null);
      setEntries(buildRecentActivity(entriesData, allTrips, 50));
    } catch (error) {
      if (request === latestLoad.current && isMountedRef.current) setFailedScope(reportScope);
      console.warn('Error loading bankroll data:', error);
    } finally {
      if (request === latestLoad.current && isMountedRef.current) {
        setIsLoading(false);
        if (isInitialLoad.current) {
          isInitialLoad.current = false;
          setHasLoadedOnce(true);
        }
      }
    }
  }, [userId, authInitializing, locationFilter, timeFilter, reportScope]);

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3 REALTIME: Bankroll Data Sync


  useEffect(() => {
    loadData();
    window.addEventListener('bankroll-updated', loadData);
    return () => window.removeEventListener('bankroll-updated', loadData);
  }, [loadData]);

  // Geofence: start watching when userId is available
  useEffect(() => {
    if (!userId) return;
    const gf = new GeofenceService();
    let cancelled = false;

    (async () => {
      try {
        // Token-authenticated, no userId in the URL, and only where location
        // is already granted (src/lib/bankroll/geofenceVenues.mjs).
        const { venues } = await loadGeofenceVenues({ getToken: getFreshAccessToken });
        if (!cancelled && venues.length > 0) {
          gf.start(venues, async (venue) => {
            // Venue Alerts off in Settings: arriving at a venue says nothing.
            if (!notificationsRef.current) return;
            // Request permission on first trigger
            await requestPermission();
            // Show browser notification (foreground, current tab)
            showVenueAlert(venue, 'checkin');
            // Send server-side OneSignal push (all devices, background-capable)
            sendGeofenceNotification(venue, userId);
            // Also open log modal pre-filled with this venue
            toast.show(`You Are Near ${venue.name}. Tap To Log A Session.`);
          });
        }
      } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
    })();

    return () => { cancelled = true; gf.stop(); };
  }, [userId]);

  const handleLogSubmit = async (saved) => {
    // The step nothing measured: an account that had never written a bankroll
    // entry just wrote one. `entries` is this user's ledger as it was BEFORE
    // the save, so an empty one means this is the first.
    if (entries.length === 0) capture(FunnelEvents.BANKROLL_FIRST_ENTRY, { source: 'log_entry_modal' });
    setShowLogModal(false);
    setEditEntry(null);
    clearActionView('log-session');
    setRefreshTrigger(prev => prev + 1);
    // No reload here: LogEntryModal dispatched 'bankroll-updated' before
    // calling onSubmit, and the listener below already reloads. Calling it
    // again read the whole ledger twice for every save.

    // Bankroll Rules are judged against the row just saved and its own day and
    // month (src/lib/bankroll/ruleViolations.mjs), never against whatever row
    // happens to be newest or against deposits and withdrawals.
    if (userId && saved && saved.entry_date) {
      try {
        const rules = await fetchBankrollRules(userId);
        if (rules && rules.length > 0) {
          const month = monthBounds(saved.entry_date);
          const [bankroll, monthEntries] = await Promise.all([
            calculateTotalBankroll(userId),
            fetchReportLedger(userId, { startDate: month.startDate, endDate: month.endDate, includeExpenses: true }),
          ]);
          const violations = evaluateRuleViolations({
            rules,
            entry: saved,
            monthEntries,
            bankrollCents: toCents(bankroll),
          });
          if (violations.length > 0) setRuleViolations(violations);
        }
      } catch (err) {
        console.warn('[RuleCheck] Error:', err);
      }
    }
  };

  // Gate Log+ behind bankroll check
  // Resolves true when the log sheet (or, signed out, its sign-in prompt)
  // opened, and undefined when a gate stopped it.
  const handleLogClick = useCallback(async () => {
    if (!userId) { setShowLogModal(true); return true; } // Will show login prompt
    if (!requireOnline()) return;
    // ═══ ACTION GATE: Log entry requires access ═══
    if (!guardAction()) return;
    if (bankrollInitialized === false) {
      setShowStartingBankroll(true);
      return;
    }
    // If still loading, do async check
    if (bankrollInitialized === null) {
      let has;
      try {
        has = await hasStartingBankroll(userId);
      } catch (error) {
        console.warn('Could not check the starting bankroll:', error);
        toast.error('Could Not Open The Log. Check Your Connection.');
        return;
      }
      setBankrollInitialized(has);
      if (!has) { setShowStartingBankroll(true); return; }
    }
    setShowLogModal(true);
    return true;
  }, [userId, bankrollInitialized, guardAction, requireOnline]);

  // A deep link must use the exact same authorization and initialization gates
  // as the visible Log button. Navigating away also closes stale modal state.
  useEffect(() => {
    if (!router.isReady) return;
    const requestedView = Array.isArray(router.query.view) ? router.query.view[0] : router.query.view;
    if (requestedView === 'log-session') {
      void handleLogClick().then((opened) => {
        // A gate (offline, the upgrade popup, the starting-bankroll step) kept
        // the sheet shut. Leave the address, or the footer's Log button points
        // at the URL already showing and does nothing the second time.
        if (!opened) clearActionView('log-session');
      });
      return;
    }
    setShowLogModal(false);
  }, [router.asPath, router.isReady]);

  // Check starting bankroll on mount
  useEffect(() => {
    if (!userId) return;
    hasStartingBankroll(userId)
      .then(has => setBankrollInitialized(has))
      .catch(error => console.warn('Could not check the starting bankroll:', error));
  }, [userId]);

  // A trip summary row is not a ledger row: open its trip's report instead.
  const openTripSummary = (entry) => {
    const view = entry._tripType === 'series' ? 'series' : 'trips';
    void router.push({ pathname: '/hub/bankroll-manager', query: { view, trip: entry._tripId } }, undefined, { shallow: true, scroll: true });
  };

  const handleEditEntry = (entry) => {
    if (entry && entry._isTripSummary) { openTripSummary(entry); return; }
    setEditEntry(entry);
    setShowLogModal(true);
  };

  const handleDeleteEntry = async (entryId) => {
    if (!userId) { toast.error('You Must Be Logged In'); return; }
    if (!requireOnline()) return;
    if (typeof entryId === 'string' && entryId.startsWith('trip-summary-')) {
      toast.info('Open The Trip To Manage Its Entries');
      openTripSummary({ _tripId: entryId.slice('trip-summary-'.length), _tripType: (entries.find(e => e.id === entryId) || {})._tripType });
      return;
    }
    // Optimistic removal - entry disappears immediately
    setEntries(prev => prev.filter(e => e.id !== entryId));
    try {
      await deleteLedgerEntry(userId, entryId);
      toast.success('Entry Deleted');
      setRefreshTrigger(prev => prev + 1);
      await loadData(); // Full refresh to sync stats
    } catch (err) {
      console.warn('Delete failed:', err);
      toast.error('Failed To Delete Entry');
      await loadData(); // Re-fetch to restore if delete failed
    }
  };

  const openAdjustModal = () => {
    haptic('light');
    if (!requireOnline()) return;
    setShowAdjustModal(true);
  };

  // True while ReceiptScanner is holding a captured scan it has not saved.
  // The photograph only exists in memory at that point and the receipt itself
  // is back in someone's pocket, so closing the modal destroys real work.
  const [scannerHasUnsaved, setScannerHasUnsaved] = useState(false);
  // Scans taken with no signal, waiting on this device. Never a number the
  // page invents: it is whatever the hold actually contains, re-read whenever
  // the connection changes, so it cannot drift away from the truth.
  const [heldScans, setHeldScans] = useState([]);
  const [resumingHeld, setResumingHeld] = useState(null);
  // The held scan being sent on its own, with no tap. Distinct from
  // resumingHeld, which is the one the player asked for by pressing Send.
  const [autoFlushing, setAutoFlushing] = useState(null);

  /**
   * WHAT IS WAITING ON THIS DEVICE.
   *
   * Re-read on mount and every time the connection changes, because the only
   * honest source for "you have two scans waiting" is the hold itself. A
   * counter kept in state would be right until the day it was not, and the
   * day it was not is the day somebody loses a receipt.
   */
  const refreshHeldScans = useCallback(async () => {
    try { setHeldScans(await listHeld()); } catch (_e) { setHeldScans([]); }
  }, []);

  useEffect(() => { refreshHeldScans(); }, [refreshHeldScans, online]);

  /**
   * Hand a held scan back to the scanner, which uploads and reads it exactly
   * as it would a fresh photograph.
   *
   * Deliberately NOT a headless background flush. The parse runs through
   * /api/bankroll/scan-receipt - where the bankroll_pro entitlement is checked
   * and where the player's saved venues live - so a second, quieter path
   * would be a second reader, and two readers eventually disagree about what
   * a receipt said. One door.
   */
  const resumeHeldScan = useCallback(async (record) => {
    if (!record || !record.blob) return;
    if (!requireOnline()) return;
    await noteAttempt(record.id);
    setResumingHeld(record);
    setScannerStep('scan');
    setScannerEntryId(null);
    setScannerImageUrl(null);
    setScannerExtractedData(null);
    setScannerRoute(null);
    setScannerReceiptId(null);
    setShowScanner(true);
  }, [requireOnline]);

  /**
   * A HELD SCAN SENDS ITSELF WHEN THE SIGNAL COMES BACK.
   *
   * The branch that shipped this was called "a scan in the basement files
   * itself" and then made the player press Send, which is not what that says.
   *
   * It runs through the SAME ReceiptScanner, the same upload, the same
   * /api/bankroll/scan-receipt with the same bankroll_pro gate, and the same
   * saveReceiptRow. The only difference from a tap is who presses Confirm. A
   * quieter background path that read receipts its own way would be a second
   * reader, and two readers eventually disagree about what a receipt said.
   *
   * ONE AT A TIME, and never while the player is using the scanner: the sheet
   * has one piece of state, and a scan filing itself underneath somebody
   * mid-scan is how the wrong photograph gets the wrong destination.
   *
   * WHERE IT LANDS. Saved and listed under Receipts Waiting, not filed to a
   * trip - Dan's rule is that every scanned receipt is at least saved and
   * assignable later, and WHICH trip a buy-in belongs to is a decision, not a
   * default. The sending is automatic; the filing is still the player's.
   */
  useEffect(() => {
    if (!online || !userId) return;
    if (autoFlushing || resumingHeld || showScanner) return;
    const next = heldScans.find((h) => h && h.blob && (h.attempts || 0) < 3);
    if (!next) return;
    let cancelled = false;
    (async () => {
      await noteAttempt(next.id);
      if (!cancelled) setAutoFlushing(next);
    })();
    return () => { cancelled = true; };
  }, [online, userId, autoFlushing, resumingHeld, showScanner, heldScans]);

  /**
   * The row exists, so the device copy has done its job.
   *
   * A scan whose upload keeps failing is left in the hold with its attempt
   * count climbing rather than retried forever; after three it stops being
   * picked up automatically and the player can still press Send. A queue that
   * retries a poisoned item until the end of time is a queue that never drains.
   */
  const finishAutoFlush = useCallback(async (record, filed) => {
    setAutoFlushing(null);
    if (filed && record) await releaseHeld(record.id);
    refreshHeldScans();
  }, [refreshHeldScans]);

  /** It has a row now, so the device copy can go. Never before. */
  const releaseResumedScan = useCallback(async () => {
    const record = resumingHeld;
    setResumingHeld(null);
    if (record) await releaseHeld(record.id);
    refreshHeldScans();
  }, [resumingHeld, refreshHeldScans]);
  // What the scan was read as, and where its values belong. Set by
  // ReceiptScanner from the shared router so the page and the scanner agree.
  const [scannerRoute, setScannerRoute] = useState(null);

  const closeScanner = useCallback(() => {
    // Only a scan that is still inside the scanner can be lost. Once it has
    // reached "Receipt Saved" it has a bankroll_receipts row and will be
    // listed under Receipts Waiting, so closing here loses nothing.
    if (scannerHasUnsaved && typeof window !== 'undefined') {
      const ok = window.confirm(
        'This Scan Has Not Been Saved Yet. The Receipt Image Will Be Lost. Close Anyway?',
      );
      if (!ok) return;
    }
    if (scannerStep !== 'scan' && scannerImageUrl && !scannerReceiptId && typeof window !== 'undefined') {
      const ok = window.confirm(
        'This Receipt Is Not Listed Anywhere Yet. If You Close Now It Will Not Appear Under Receipts Waiting. Close Anyway?',
      );
      if (!ok) return;
    }
    if (scannerStep !== 'scan' && scannerReceiptId) {
      toast.success('Receipt Kept In Receipts Waiting. Assign It From The Dashboard.');
    }
    // A held scan the player opened and closed stays in the hold; letting go
    // of it here is what lets Send and the automatic sender run again.
    setResumingHeld(null);
    setScannerHasUnsaved(false);
    clearActionView('scan-receipt');
    setShowScanner(false);
    setScannerStep('scan');
    setScannerEntryId(null);
    setScannerImageUrl(null);
    setScannerExtractedData(null);
    setScannerRoute(null);
    setScannerReceiptId(null);
    setReceiptSaving(false);
    setScannerDuplicate(null);
    scannerImageHashRef.current = null;
    scannerReadOutcomeRef.current = { outcome: null, ocrConfidence: null };
  }, [clearActionView, scannerHasUnsaved, scannerStep, scannerReceiptId, scannerImageUrl]);

  /** Unassigned scans, newest first. Shown on the dashboard until filed. */
  const loadPendingReceipts = useCallback(async () => {
    if (!userId) { setPendingReceipts([]); return; }
    try {
      const { data, error } = await supabase
        .from('bankroll_receipts')
        .select('id, image_url, document_type, destination, summary, route, extracted, image_hash, confidence, auto_file, read_outcome, ocr_confidence, created_at')
        .eq('user_id', userId)
        .eq('status', 'unassigned')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setPendingReceipts(data || []);

      // Everything recently scanned, FILED OR NOT, so a receipt photographed
      // again next week is still recognised as one already dealt with.
      const { data: hashes } = await supabase
        .from('bankroll_receipts')
        .select('id, summary, status, created_at, image_hash')
        .eq('user_id', userId)
        .not('image_hash', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);
      setRecentHashes(hashes || []);
    } catch (err) {
      console.warn('[bankroll] pending receipts load failed:', err?.message || err);
    }
  }, [userId]);

  useEffect(() => { loadPendingReceipts(); }, [loadPendingReceipts, refreshTrigger]);

  // Fetch the OCR engine while the page is idle, so the first scan of a
  // session is as fast as the second. Roughly 6.8 MB, once, then cached: paid
  // for during the seconds somebody spends reading their own numbers instead
  // of while they watch a progress bar that has not moved yet.
  useEffect(() => {
    if (!userId) return;
    warmOcr();
  }, [userId]);

  /** Rule 4: the row that makes a completed scan un-losable. */
  const saveReceiptRow = useCallback(async ({ imageUrl, extractedData, route, documentType, imageHash, readOutcome, ocrConfidence }) => {
    if (!userId || !imageUrl) return null;
    try {
      const { data, error } = await supabase
        .from('bankroll_receipts')
        .insert(receiptRowFromScan(userId, { imageUrl, extracted: extractedData, route, documentType, imageHash, readOutcome, ocrConfidence }))
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return data ? data.id : null;
    } catch (err) {
      console.warn('[bankroll] receipt row insert failed:', err?.message || err);
      toast.error('Receipt Uploaded But Could Not Be Listed. File It Now Or Scan Again.');
      return null;
    }
  }, [userId]);

  const markReceiptAssigned = useCallback(async (receiptId, kind, targetId) => {
    if (!receiptId || !kind || !targetId) return;
    try {
      const { error } = await supabase
        .from('bankroll_receipts')
        .update({ status: 'assigned', assigned_kind: kind, assigned_id: targetId, assigned_at: new Date().toISOString() })
        .eq('id', receiptId)
        .eq('user_id', userId);
      if (error) throw error;
      // Funnel: the account's first filed receipt (fire-and-forget).
      void noteReceiptFiled(supabase, userId, { kind });
    } catch (err) {
      console.warn('[bankroll] receipt assignment failed:', err?.message || err);
      toast.error('Filed, But The Receipt Could Not Be Marked. It May Still Show Under Receipts Waiting.');
    }
    loadPendingReceipts();
  }, [userId, loadPendingReceipts]);

  /** Reopen a receipt from Receipts Waiting exactly as it was read. */
  const resumeReceipt = useCallback((receipt) => {
    setScannerHasUnsaved(false);
    setReceiptSaving(false);
    setScannerDuplicate(null);
    scannerImageHashRef.current = receipt.image_hash || null;
    scannerReadOutcomeRef.current = { outcome: receipt.read_outcome || null, ocrConfidence: receipt.ocr_confidence ?? null };
    setScannerReceiptId(receipt.id);
    setScannerImageUrl(receipt.image_url);
    setScannerExtractedData(receipt.extracted || null);
    setScannerRoute(receipt.route || null);
    setScannerEntryId(null);
    setScannerStep('post-capture');
    setShowScanner(true);
  }, []);

  /** The row insert failed after upload; try again from the state we still hold. */
  const retryReceiptListing = useCallback(async () => {
    if (receiptSaving || !scannerImageUrl) return;
    setReceiptSaving(true);
    const id = await saveReceiptRow({
      imageUrl: scannerImageUrl,
      extractedData: scannerExtractedData,
      route: scannerRoute,
      documentType: scannerRoute && scannerRoute.documentType,
      imageHash: scannerImageHashRef.current,
      // The retry writes the same row, so it carries the same read outcome.
      // Dropping it here would make a retried scan look like one nobody read.
      readOutcome: scannerReadOutcomeRef.current.outcome,
      ocrConfidence: scannerReadOutcomeRef.current.ocrConfidence,
    });
    setScannerReceiptId(id);
    setReceiptSaving(false);
    if (id) loadPendingReceipts();
  }, [receiptSaving, scannerImageUrl, scannerExtractedData, scannerRoute, saveReceiptRow, loadPendingReceipts]);

  const closeScannerAfterChoice = useCallback(() => {
    setShowScanner(false);
    setScannerStep('scan');
    setScannerImageUrl(null);
    setScannerExtractedData(null);
    setScannerRoute(null);
    setScannerReceiptId(null);
    setReceiptSaving(false);
    setScannerDuplicate(null);
    scannerImageHashRef.current = null;
    scannerReadOutcomeRef.current = { outcome: null, ocrConfidence: null };
  }, []);

  /**
   * "That is not a receipt."
   *
   * Dan's rule was that a scan can never be ABANDONED. What got built was a
   * table with select, insert and update and no delete anywhere, which is a
   * different thing: a scan could never be REMOVED. Photograph your thumb by
   * accident and it sat in Receipts Waiting permanently, and because the list
   * is limited to twenty, a handful of junk scans quietly pushed real ones out
   * of sight.
   *
   * So this is deliberate and narrow. It asks first, it only ever touches a
   * receipt that is still UNASSIGNED (an assigned one is attached to a ledger
   * entry or a W-2G, and deleting it would leave that pointing at nothing),
   * and closing the sheet still never deletes anything - which is the law
   * a-scanned-receipt-is-never-abandoned holds.
   *
   * The row goes first, then the image. That order matters: an orphaned
   * storage object is invisible and harmless, while a row pointing at a
   * deleted image is a broken thumbnail in the list forever.
   */
  const discardReceipt = useCallback(async (receipt) => {
    if (!receipt || !receipt.id || !userId) return;
    if (receipt.status && receipt.status !== 'unassigned') {
      toast.error('This Receipt Is Already Filed');
      return;
    }
    if (typeof window !== 'undefined') {
      const what = receipt.summary || 'this scan';
      if (!window.confirm(`Delete ${what}? The image is deleted too and this cannot be undone.`)) return;
    }

    setDiscardingReceiptId(receipt.id);
    try {
      const { error } = await supabase
        .from('bankroll_receipts')
        .delete()
        .eq('id', receipt.id)
        .eq('user_id', userId)
        .eq('status', 'unassigned');
      if (error) throw error;

      // Best effort, and never fatal: removeBankrollObject does not throw.
      if (receipt.image_url) await removeBankrollObject(supabase, receipt.image_url);

      if (scannerReceiptId === receipt.id) closeScannerAfterChoice();
      toast.success('Scan Deleted');
      loadPendingReceipts();
    } catch (err) {
      console.warn('[bankroll] discard failed:', err?.message || err);
      toast.error('Could Not Delete That Scan');
    } finally {
      setDiscardingReceiptId(null);
    }
  }, [userId, scannerReceiptId, closeScannerAfterChoice, loadPendingReceipts]);

  /** Open LogEntryModal for this receipt; its save marks the receipt assigned. */
  const openEntryForReceipt = useCallback((category) => {
    receiptAwaitingEntryRef.current = scannerReceiptId;
    setDefaultReceiptCategory(category);
    setDefaultReceiptMedia([scannerImageUrl]);
    setDefaultReceiptData({
      ...(scannerExtractedData || {}),
      ...(scannerRoute ? scannerRoute.prefill : {}),
    });
    setEditEntry(null);
    setShowLogModal(true);
    closeScannerAfterChoice();
  }, [scannerReceiptId, scannerImageUrl, scannerExtractedData, scannerRoute, closeScannerAfterChoice]);

  /**
   * File every waiting receipt the router was confident about, in one tap.
   *
   * "Suggested" means exactly what routeScan decided: confident enough and a
   * legible amount. A W-2G is never in that set however good the read, and
   * anything the router was unsure of stays in the list for a person to look
   * at. Each receipt is filed and marked in turn, so a failure halfway leaves
   * the rest waiting rather than half-filed and forgotten.
   */
  const fileAllSuggested = useCallback(async () => {
    if (bulkFiling || !requireOnline()) return;
    const { willFile } = partitionForBulkFiling(pendingReceipts);
    if (willFile.length === 0) return;
    setBulkFiling(true);
    let activeTrip = trips.find(t => t.status === 'active' && t.trip_type !== 'series') || null;
    // Rule 2 holds in bulk too: a buy-in is never filed onto no trip.
    const tripSeed = receiptNeedingTrip(willFile, activeTrip);
    if (tripSeed) {
      try {
        const seedVenue = tripSeed.route.prefill.location_name || tripSeed.route.prefill.vendor;
        const seedMatch = matchLocationByName(locations, seedVenue);
        activeTrip = await createTrip(userId, { ...tripFromReceipt(tripSeed.route), location_id: seedMatch ? seedMatch.id : null });
        toast.success(`Trip Started: ${activeTrip.name}`);
      } catch (err) {
        console.warn('[bankroll] bulk auto trip failed:', err?.message || err);
        toast.error('Could Not Start A Trip. The Sessions Will Be Filed Without One.');
      }
    }
    let filed = 0;
    let failed = 0;
    for (const receipt of willFile) {
      try {
        // Already on an entry (the last mark failed): mark it, never file twice.
        const holder = entryHoldingImage(entries, receipt.image_url);
        if (holder) {
          await markReceiptAssigned(receipt.id, RECEIPT_TARGETS.LEDGER_ENTRY, holder.id);
          filed++;
          continue;
        }
        const venue = receipt.route && receipt.route.prefill
          && (receipt.route.prefill.location_name || receipt.route.prefill.vendor);
        const match = matchLocationByName(locations, venue);
        const entry = ledgerEntryFromReceipt(receipt.route, {
          imageUrl: receipt.image_url,
          tripId: activeTrip ? activeTrip.id : null,
          locationId: match ? match.id : null,
        });
        if (!entry) { failed++; continue; }
        const saved = await createLedgerEntry(userId, entry);
        await markReceiptAssigned(receipt.id, RECEIPT_TARGETS.LEDGER_ENTRY, saved.id);
        filed++;
      } catch (err) {
        console.warn('[bankroll] bulk file failed for a receipt:', err?.message || err);
        failed++;
      }
    }
    setBulkFiling(false);
    if (filed > 0) {
      capture(FunnelEvents.BANKROLL_RECEIPT_FILED, { bulk: true, count: filed });
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bankroll-updated'));
      setRefreshTrigger(prev => prev + 1);
      await loadData();
    }
    if (failed > 0) toast.error(`Filed ${filed}. ${failed} Could Not Be Filed And Are Still Waiting.`);
    else toast.success(`Filed ${filed} Receipt${filed === 1 ? '' : 's'}.`);
    loadPendingReceipts();
  }, [bulkFiling, requireOnline, pendingReceipts, trips, entries, locations, userId, markReceiptAssigned, loadData, loadPendingReceipts]);

  /**
   * What the Receipt Saved sheet does for each choice (Dan, 2026-09-08):
   * a W-2G goes to the vault, a buy-in goes on a trip (started if none is
   * active), an expense goes to Expenses, and "later" keeps it listed.
   */
  const handleReceiptAction = useCallback(async (actionId) => {
    if (receiptBusy) return;
    if (actionId === RECEIPT_ACTIONS.ATTACH) { setScannerStep('pick-entry'); return; }

    if (actionId === RECEIPT_ACTIONS.SAVE_LATER) {
      if (!scannerReceiptId) {
        toast.error('This Receipt Is Not Listed Yet. Tap Retry Listing First.');
        return;
      }
      toast.success('Receipt Kept In Receipts Waiting. Assign It From The Dashboard.');
      closeScannerAfterChoice();
      loadPendingReceipts();
      return;
    }

    if (actionId === RECEIPT_ACTIONS.NEW_EXPENSE) { openEntryForReceipt('expense'); return; }

    if (actionId === RECEIPT_ACTIONS.LOG_SESSION) {
      if (!requireOnline()) return;
      const activeTrip = trips.find(t => t.status === 'active' && t.trip_type !== 'series');
      if (!activeTrip) {
        // Rule 2: no active trip, so start one. LogEntryModal then finds it
        // and assigns the session to it on its own.
        setReceiptBusy(true);
        try {
          const draft = tripFromReceipt(scannerRoute);
          // The venue the receipt printed, matched to a saved location so the
          // trip carries its id (and GPS) rather than a bare name.
          const venue = scannerRoute && scannerRoute.prefill && (scannerRoute.prefill.location_name || scannerRoute.prefill.vendor);
          const match = matchLocationByName(locations, venue);
          const trip = await createTrip(userId, { ...draft, location_id: match ? match.id : null });
          toast.success(`Trip Started: ${trip.name}`);
          await loadData();
        } catch (err) {
          console.warn('[bankroll] auto trip failed:', err?.message || err);
          toast.error('Could Not Start A Trip. The Session Will Be Logged Without One.');
        } finally {
          setReceiptBusy(false);
        }
      }
      // A real ledger category, or the picker when the scan did not say
      // which. 'session' is not a category and the insert refused it.
      openEntryForReceipt(ledgerCategoryFor(scannerRoute));
      return;
    }

    if (actionId === RECEIPT_ACTIONS.CLOSE_SESSION) {
      if (!requireOnline()) return;
      const open = findOpenSessionFor(scannerRoute, entries);
      if (!open) { toast.error('That Session Is No Longer Open. Log The Cash Out As A New Session.'); return; }
      const prefill = (scannerRoute && scannerRoute.prefill) || {};
      const cashOut = Number(prefill.gross_out ?? prefill.amount);
      if (!Number.isFinite(cashOut)) { toast.error('No Cash Out Amount Was Read. Attach It Instead.'); setScannerStep('pick-entry'); return; }
      setReceiptBusy(true);
      try {
        const updates = {
          gross_out: cashOut,
          media_urls: [...(open.media_urls || []), scannerImageUrl],
        };
        if (open.category === 'poker_mtt' && prefill.finish_position !== null && prefill.finish_position !== undefined) {
          updates.finish_position = prefill.finish_position;
        }
        const saved = await updateLedgerEntry(userId, open.id, updates);
        await markReceiptAssigned(scannerReceiptId, RECEIPT_TARGETS.LEDGER_ENTRY, saved.id);
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bankroll-updated'));
        capture(FunnelEvents.BANKROLL_RECEIPT_FILED, { destination: 'session', bulk: false, closed_open_session: true });
        toast.success(`Session Closed: Cashed Out $${cashOut.toLocaleString()}`);
        closeScannerAfterChoice();
        await loadData();
      } catch (err) {
        console.warn('[bankroll] close session failed:', err?.message || err);
        toast.error('Could Not Close The Session. It Is Kept In Receipts Waiting.');
      } finally {
        setReceiptBusy(false);
      }
      return;
    }

    if (actionId === RECEIPT_ACTIONS.FILE_W2G) {
      if (!requireOnline()) return;
      setReceiptBusy(true);
      try {
        const { data, error } = await supabase
          .from('w2g_forms')
          .insert(w2gRowFromReceipt(userId, scannerRoute, scannerImageUrl))
          .select('id, tax_year')
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('w2g-insert-returned-nothing');
        await markReceiptAssigned(scannerReceiptId, RECEIPT_TARGETS.W2G_FORM, data.id);
        // TaxReportPanel refreshes its vault list on this event.
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bankroll-updated'));
        capture(FunnelEvents.BANKROLL_RECEIPT_FILED, { destination: 'tax', bulk: false });
        toast.success(`W-2G Added To The ${data.tax_year} Vault In Tax Reports`);
        closeScannerAfterChoice();
        setRefreshTrigger(prev => prev + 1);
      } catch (err) {
        console.warn('[bankroll] W-2G vault insert failed:', err?.message || err);
        toast.error('Could Not File The W-2G. It Is Kept In Receipts Waiting.');
      } finally {
        setReceiptBusy(false);
      }
    }
  }, [receiptBusy, closeScannerAfterChoice, loadPendingReceipts, openEntryForReceipt, requireOnline, trips, entries, locations, userId, scannerRoute, scannerImageUrl, scannerReceiptId, markReceiptAssigned, loadData]);

  const handleSidebarClick = (sectionId) => {
    haptic('light');
    // ═══ ACTION GATE: Pro tool sidebar actions require access ═══
    if (sectionId !== 'dashboard' && !guardAction()) return;
    if (sectionId === 'scan-receipt') {
      // NO ONLINE GATE HERE, AND ONLY HERE.
      //
      // Reading a receipt is entirely local: tesseract.js, its core and its
      // language model are served same-origin under /tesseract/<version>/
      // with an immutable year-long cache. Measured against production on
      // 2026-09-09, with a fetch to /api/health throwing to prove the network
      // really was cut: all three assets came back in 8 ms.
      //
      // This line used to refuse - "You Are Offline. Try Again When
      // Connected." - which is an engine built for a poker room basement
      // behind a door locked in a poker room basement. Commander's ID
      // capture shares the engine and has never had this gate.
      //
      // SAVING still needs the network, and that is what src/lib/bankroll/
      // receiptHold.mjs is for: a scan taken with no signal is written to
      // the device and filed when the signal returns. Online-only actions
      // still check connectivity before starting their work.
      setShowScanner(true);
      setScannerStep('scan');
      setScannerEntryId(null);
      setScannerImageUrl(null);
      setScannerExtractedData(null);
      setScannerRoute(null);
      setScannerReceiptId(null);
      setReceiptSaving(false);
    } else if (sectionId === 'projection') {
      setShowProjection(true);
    } else if (sectionId === 'toke-tracker') {
      // Navigate to dedicated Toke Tracker landing page
      router.push('/hub/toke-tracker?from=bankroll');
      return;
    } else if (sectionId === 'dashboard') {
      // Reset category filter when going back to Dashboard
      goToSection('dashboard');
      loadData(); // Refresh dashboard data (trips, series banners, stats)
    } else {
      goToSection(sectionId);
    }
  };

  const openedPopupLink = useRef(null);
  useEffect(() => {
    if (!router.isReady || featureAccessLoading) return;
    if (!['adjust-bankroll', 'scan-receipt', 'projection'].includes(requestedView)) {
      openedPopupLink.current = null;
      return;
    }
    if (openedPopupLink.current === requestedView) return;
    openedPopupLink.current = requestedView;
    // Keep this action address until the user closes the overlay.
    if (requestedView === 'adjust-bankroll') openAdjustModal();
    else handleSidebarClick(requestedView);
  }, [router.isReady, requestedView, featureAccessLoading]);

  // The page tutorial lives in the app shell (TutorialProvider; offered by
  // the three-second prompt and the hamburger's Page Tutorial row). Its
  // spotlight targets (stats, chart, analytics, Add +) only exist on the
  // unfiltered dashboard, so when the provider announces it is about to
  // open, return there first; otherwise every step would render without a
  // ring.
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;
  const categoryFilterRef = useRef(categoryFilter);
  categoryFilterRef.current = categoryFilter;
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onWillOpen = (e) => {
      if (e && e.detail && e.detail.id && e.detail.id !== 'bankroll-manager') return;
      if (activeSectionRef.current !== 'dashboard' || categoryFilterRef.current !== 'all') goToSection('dashboard');
    };
    window.addEventListener(TUTORIAL_WILL_OPEN_EVENT, onWillOpen);
    return () => window.removeEventListener(TUTORIAL_WILL_OPEN_EVENT, onWillOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goToSection]);

  // Page-owned overlays: the phone back gesture closes them (mobile phase 0a).
  useModalHistory(showScanner, closeScanner);
  const closeAllEntries = useCallback(() => setShowAllEntries(false), []);
  useModalHistory(showAllEntries, closeAllEntries);
  // Scrims close on a tap outside, not on a drag that ends outside.
  const scannerScrim = useScrimDismiss(closeScanner);
  const allEntriesScrim = useScrimDismiss(closeAllEntries);
  useModalHistory(showLogModal && !userId, closeLogModal);
  const closeRuleViolations = useCallback(() => setRuleViolations([]), []);
  useModalHistory(ruleViolations.length > 0, closeRuleViolations);
  const signInScrim = useScrimDismiss(closeLogModal);
  const violationsScrim = useScrimDismiss(closeRuleViolations);

  const selectedLocationName = locationFilter
    ? locations.find((l) => l.id === locationFilter)?.name || 'Unknown'
    : 'All Locations';

  // Load preferences from Supabase on mount
  useEffect(() => {
    if (userId) {
      getBankrollPreferences(userId).then(setPreferences);
    }
  }, [userId]);

  // Hamburger menu handlers - save to Supabase
  // The switch moves at once; if the save fails it moves back and says so,
  // instead of showing a setting the next visit will not have.
  const updatePreference = useCallback(async (key, value) => {
    if (!requireOnline()) return;
    let previous;
    setPreferences(prev => { previous = prev[key]; return { ...prev, [key]: value }; });

    if (userId) {
      try {
        await updateBankrollPreferences(userId, { [key]: value });
      } catch (error) {
        console.warn('Failed to save preference:', error);
        if (isMountedRef.current) setPreferences(prev => ({ ...prev, [key]: previous }));
        toast.error('Could Not Save That Setting. Try Again.');
      }
    }
  }, [userId, requireOnline]);

  const menuConfig = getMenuConfig('bankroll-manager', user, preferences, {
    setNotifications: (val) => updatePreference('notifications', val),
    setCurrencyEUR: (val) => updatePreference('currencyEUR', val),
    onAdjustBankroll: () => { setMenuOpen(false); openAdjustModal(); }
  });

  // Leaving the dashboard closes its overlays and filter menus. The page is
  // no longer remounted on every ?view= change (pages/_app.js keeps one
  // instance for /hub/bankroll-manager so the filters survive), so they would
  // otherwise reopen on the way back.
  useEffect(() => {
    setShowAllEntries(false);
    setOpenFilter(null);
  }, [activeSection, categoryFilter]);
  // Realtime subscription - live updates with debounce
  useEffect(() => {
    if (!userId) return;
    const debouncedReload = () => {
      if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
      rtTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) loadData();
      }, 500);
    };
    const _ch = supabase
      .channel(`bankroll:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bankroll_ledger', filter: `user_id=eq.${userId}` }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bankroll_trips', filter: `user_id=eq.${userId}` }, debouncedReload)
      .subscribe();
    return () => {
      if (rtTimerRef.current) clearTimeout(rtTimerRef.current);
      supabase.removeChannel(_ch);
    };
  }, [userId, loadData]);

  // Auth state listener - re-load on session refresh
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && isMountedRef.current) {
        loadData();
      }
    });
    return () => subscription.unsubscribe();
  }, [loadData]);

  // Step 3 of the scanner: attach the scanned image to an existing entry.
  // Kept here, beside the other receipt writes, so the ledger update stays
  // in the file the table-access review lists.
  const attachScannerReceiptToEntry = async (entry) => {
    if (!requireOnline()) return;
    try {
      // Append receipt URL to entry's media_urls
      const existing = entry.media_urls || [];
      const updated = [...existing, scannerImageUrl];
      const { error: err_bankroll_ledger_chehe } = await supabase
        .from('bankroll_ledger')
        .update({ media_urls: updated })
        .eq('id', entry.id);
      if (err_bankroll_ledger_chehe) throw err_bankroll_ledger_chehe;
      await markReceiptAssigned(scannerReceiptId, RECEIPT_TARGETS.LEDGER_ENTRY, entry.id);
      await loadData();
      closeScannerAfterChoice();
      setScannerEntryId(null);
    } catch (err) {
      console.warn('Attach failed:', err);
      toast.error('Could Not Attach The Receipt. It Is Kept In Receipts Waiting.');
    }
  };

  // Each section module receives exactly the state and handlers it reads
  // (src/components/bankroll/sections/).
  const dashboardSectionProps = {
    activeSeries, allEntriesScrim, autoFlushing, bulkFiling, chartEntries,
    chartType, discardReceipt, discardingReceiptId, entries, failedScope,
    fileAllSuggested, filterMenuToggle, filteredAnalyticsEntries, filters,
    finishAutoFlush, gameTypeFilter, goToSection, handleDeleteEntry,
    handleEditEntry, handleLogClick, haptic, hasLoadedOnce, heldScans,
    isLoading, isVip, loadData, loadPendingReceipts, locationFilter,
    locations, online, openAdjustModal, openFilter, pendingReceipts,
    preferences, refreshTrigger, reportReady, reportScope, resumeHeldScan,
    resumeReceipt, resumingHeld, saveReceiptRow, selectedLocationName,
    setChartType, setLineAxis, setLocationFilter, setShowAllEntries,
    setTimeFilter, showAllEntries, stats, timeFilter, toggleGameType, trips,
    userId,
  };
  const reportsSectionProps = {
    failedScope, loadData, locationFilter, preferences, report, reportReady,
    reportScope, selectedLocationName, timeFilter, userId,
  };
  const settingsSectionProps = {
    goToSection, haptic, preferences, setShowVenueModal, updatePreference,
    userId,
  };
  const taxSectionProps = {
    analysisEntries, pendingReceipts, preferences, resumeReceipt, userId,
  };
  const receiptScannerSheetProps = {
    attachScannerReceiptToEntry, closeScanner, entries, handleReceiptAction,
    loadPendingReceipts, preferences, receiptBusy, receiptSaving,
    recentHashes, refreshHeldScans, releaseResumedScan, resumingHeld,
    retryReceiptListing, saveReceiptRow, scannerDuplicate,
    scannerImageHashRef, scannerImageUrl, scannerReadOutcomeRef,
    scannerReceiptId, scannerRoute, scannerScrim, scannerStep,
    setReceiptSaving, setScannerDuplicate, setScannerExtractedData,
    setScannerHasUnsaved, setScannerImageUrl, setScannerReceiptId,
    setScannerRoute, setScannerStep, trips, userId,
  };

  return (
    <PageTransition>
      
      <SEOHead
        title="Bankroll Manager - Track Your Poker Profits"
        description="Professional Bankroll Tracking For Poker Players. Monitor Sessions, Analyze Leaks, Track ROI, And Visualize Trends With Detailed Analytics And Variance Analysis."
        canonical="/hub/bankroll-manager"
        jsonLd={BANKROLL_SCHEMA}
      />

      <HubPageShell className="bankroll" maxWidth={960} background="#06101e" onMenuClick={() => setMenuOpen(true)}>
      {/* Pull down at the top of the page to reload the ledger (mobile
          standard, "Pull-to-refresh": the browser's own gesture is disabled
          app-wide). Off while a sheet is open so a drag inside it cannot
          fire a reload underneath. */}
      <PullToRefresh onRefresh={loadData} disabled={showLogModal || showAdjustModal || showScanner || showProjection}>
      <div className="bankroll-page smarterdesign" style={styles.container}>

        <FeatureGate featureKey="bankroll_pro" userId={userId} cost={25} duration={24} featureName="Bankroll Manager" description="Track Sessions, Analyze Leaks, And Manage Your Poker Bankroll For 24 Hours." hideBadge>
          {/* Hamburger Menu */}
          <HamburgerMenu
            isOpen={menuOpen}
            onClose={() => setMenuOpen(false)}
            direction="left"
            theme="dark"
            user={user}
            showProfile={false}
            menuItems={menuConfig.menuItems}
            bottomLinks={menuConfig.bottomLinks}
          />

          <BankrollImageHeader className={layout.mast} title={sectionTitle}
            art={HEADER_ART[headerSection] || headerSection} section={headerSection}
            parent={sectionTitle !== 'Bankroll Manager' ? 'Bankroll Manager' : undefined}
            onTutorial={requestPageTutorial}
            back={isDashboard ? undefined : { href: '/hub/bankroll-manager', shallow: true }}
            helpContent={
              <>
                {isDashboard && <HubPageSummary page="bankroll-manager" />}
                <FaqSection faqs={BANKROLL_MANAGER_FAQS} />
              </>
            }>
            <div className={layout.headerActions} ref={setActionTarget}>
              {activeSection === 'receipts' && (
                <button type="button" className="bankroll-log-btn sd-button sd-primary" onClick={() => handleSidebarClick('scan-receipt')} aria-label="Add + · Scan Receipt">Add +</button>
              )}
              {!isGloballyVip && hasProAccess && proExpiresAt && <DayPassCountdown expiresAt={proExpiresAt} />}
              {activeSection === 'dashboard' && categoryFilter === 'all' && (
                <button type="button" className="bankroll-log-btn sd-button sd-primary" data-tutorial="add-button" onClick={() => { haptic('light'); handleLogClick(); }}>
                  Add +
                </button>
              )}
            </div>
          </BankrollImageHeader>

          {/* Main Layout */}
          <div className="bankroll-main-layout" style={styles.mainLayout}>
            {isDashboard && (
            <nav className={`bankroll-sidebar ${layout.sidebar}`} aria-label="Bankroll Manager Sections">
              <div className="bankroll-sidebar-list" data-tutorial="nav">
                {SIDEBAR_SECTIONS.map((section) => {
                  const isActive = activeSection === section.id && !section.action;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={`sd-button bankroll-sidebar-item${isActive ? ' active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => section.action ? openAdjustModal() : handleSidebarClick(section.id)}
                    >
                      {section.label}
                      {section.id === 'scan-receipt' && pendingReceipts.length > 0 && (
                        <span style={styles.sidebarBadge} aria-label={`${pendingReceipts.length} Receipts Waiting`}>
                          {pendingReceipts.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

            </nav>
            )}

            <BankrollActionTarget.Provider value={isDashboard ? undefined : actionTarget}>
            {/* Main Content - Switches based on activeSection */}
            <section className={`bankroll-main-content ${layout.content}`} aria-label={sectionTitle}>
              {/* One boundary per view: a crash in one section shows its own
                  fallback and is cleared by moving to another view (the page
                  itself no longer remounts on a ?view= change). */}
              <HubErrorBoundary key={`${activeSection}:${categoryFilter}`} name={`Bankroll ${sectionTitle}`}>

              {/* Category Overview View (Cash Games, Tournaments, etc.) */}
              {activeSection === 'dashboard' && categoryFilter !== 'all' && (
                <HubErrorBoundary name="Category Overview">
                  <CategoryOverview
                    displayEUR={preferences.currencyEUR}
                    userId={userId}
                    categoryFilter={categoryFilter}
                    onAddEntry={handleLogClick}
                    onEditEntry={handleEditEntry}
                  />
                </HubErrorBoundary>
              )}

              {/* Dashboard View */}
              {activeSection === 'dashboard' && categoryFilter === 'all' && (
                <DashboardSection {...dashboardSectionProps} />
              )}

              {/* Trip Tracker View */}
              {activeSection === 'trips' && (
                <HubErrorBoundary name="Trip Tracker">
                  <TripTracker
                    displayEUR={preferences.currencyEUR}
                    userId={userId}
                    onOpenLog={handleLogClick}
                    onEditEntry={handleEditEntry}
                    onDeleteEntry={handleDeleteEntry}
                    refreshTrigger={refreshTrigger}
                    openTripId={requestedTripId}
                  />
                </HubErrorBoundary>
              )}

              {/* Series Tracker View */}
              {activeSection === 'series' && (
                <HubErrorBoundary name="Series Tracker">
                  <SeriesTracker
                    displayEUR={preferences.currencyEUR}
                    userId={userId}
                    onOpenLog={handleLogClick}
                    onEditEntry={handleEditEntry}
                    onDeleteEntry={handleDeleteEntry}
                    refreshTrigger={refreshTrigger}
                    openSeriesId={requestedTripId}
                  />
                </HubErrorBoundary>
              )}

              {/* Leaks View (sidebar Leak Analysis, ?view=leaks) */}
              {activeSection === 'leaks' && (
                <LeakAnalysisView
                  userId={userId}
                  locationId={locationFilter}
                  locationName={locationFilter ? selectedLocationName : null}
                  displayEUR={preferences.currencyEUR}
                />
              )}

              {/* Session Hand Review (sidebar Hand Review, ?view=hand-review) */}
              {activeSection === 'hand-review' && (
                <BankrollProGate userId={userId}>
                  <SessionHandReview userId={userId} displayEUR={preferences.currencyEUR} />
                </BankrollProGate>
              )}

              {activeSection === 'recently-deleted' && (
                <div className={`sd-panel ${layout.panel}`}>
                  <h2 className="sd-section-title">Recently Deleted</h2>
                  <RecentlyDeleted userId={userId} displayEUR={preferences.currencyEUR} />
                </div>
              )}

              {/* Goals View (from hamburger menu) */}
              {activeSection === 'goals' && (
                <div className={`sd-panel ${layout.panel}`}>
                  <h2 className="sd-section-title">Bankroll Goals</h2>
                  <BankrollGoals userId={userId} displayEUR={preferences.currencyEUR} />
                </div>
              )}

              {/* Player Notes View */}
              {activeSection === 'players' && (
                <PlayerNotes userId={userId} />
              )}

              {/* Reports View */}
              {activeSection === 'reports' && (
                <ReportsSection {...reportsSectionProps} />
              )}

              {/* Settings View */}
              {activeSection === 'settings' && (
                <SettingsSection {...settingsSectionProps} />
              )}

              {/* Badges View (footer BADGES button) */}
              {activeSection === 'badges' && (
                <div className={`sd-panel ${layout.panel}`}>
                  <h2 className="sd-section-title">Badges</h2>
                  <BankrollBadges userId={userId} />
                </div>
              )}

              {/* Bankroll Rules View */}
              {activeSection === 'rules' && (
                <div>
                  <BankrollRulesCard userId={userId} displayEUR={preferences.currencyEUR} />
                </div>
              )}

              {/* Saved Receipts View */}
              {activeSection === 'receipts' && (
                <div>
                  <SavedReceipts userId={userId} displayEUR={preferences.currencyEUR} />
                </div>
              )}

              {/* Tax Reports - dedicated view showing only Tax Report Generator */}
              {activeSection === 'tax' && (
                <TaxSection {...taxSectionProps} />
              )}

              {/* Staking Tracker - dedicated standalone view */}
              {activeSection === 'staking' && (
                <div>
                  <BankrollProGate userId={userId}>
                    <HubErrorBoundary name="Staking Tracker">
                      <StakingTracker userId={userId} refreshTrigger={refreshTrigger} displayEUR={preferences.currencyEUR} />
                    </HubErrorBoundary>
                  </BankrollProGate>
                </div>
              )}

              {/* Toke Tracker - Dealer Income & Expense Tracking */}
              {activeSection === 'toke-tracker' && (
                <div>
                  <TokeTracker userId={userId} refreshTrigger={refreshTrigger} displayEUR={preferences.currencyEUR} />
                </div>
              )}

              {activeSection === 'staking-profile' && (
                <div>
                  <BankrollProGate userId={userId}>
                    <HubErrorBoundary name="Staking Profile">
                      <SocialStakingProfile entries={analysisEntries} stats={stats} user={user} displayEUR={preferences.currencyEUR} onClose={() => goToSection('dashboard')} />
                    </HubErrorBoundary>
                  </BankrollProGate>
                </div>
              )}

              {/* Phase 8: Tournament Calendar - Series Event Planner */}
              {activeSection === 'tournament-calendar' && (
                <div>
                  <HubErrorBoundary name="Tournament Calendar">
                    <TournamentCalendar bankrollTotal={stats?.totalBankroll || 0} displayEUR={preferences.currencyEUR} />
                  </HubErrorBoundary>
                </div>
              )}

              </HubErrorBoundary>
            </section>
            </BankrollActionTarget.Provider>
          </div>
          {isDashboard && (
            <div data-tutorial="insights" className={layout.jarvisFooter}>
              <JarvisLeakInsights userId={userId} displayEUR={preferences.currencyEUR} onRefresh={loadData} />
            </div>
          )}
          <div style={{ maxWidth: 1120, margin: '24px auto 0', padding: '0 16px 28px' }}>
            <SmarterAccountUnlockGate
              variant="calculator-pro"
              context="hub-bankroll-manager"
              title="Log Unlimited Live & Online Sessions, Tax Reports & Risk Of Ruin Free"
              redirectPath="/hub/bankroll-manager"
            />
          </div>
        </FeatureGate>
      </div>
      </PullToRefresh>
      </HubPageShell>

      <div className="smarterdesign">
      {/* Receipt Scanner Modal */}
      {
        showScanner && (
          <ReceiptScannerSheet {...receiptScannerSheetProps} />
        )
      }

      {/* Manage Venues Modal */}
      {
        showVenueModal && userId && (
          <ManageVenuesModal
            userId={userId}
            onClose={() => setShowVenueModal(false)}
            onUpdate={loadData}
          />
        )
      }

      {/* Log Entry Modal - Shows login prompt if not authenticated */}
      <AnimatePresence>
        {showLogModal && (
          userId ? (
            <LogEntryModal
              userId={userId}
              locations={locations}
              trips={trips}
              editEntry={editEntry}
              defaultCategory={defaultReceiptCategory || (!editEntry && categoryFilter !== 'all' ? categoryFilter : null)}
              defaultMediaUrls={defaultReceiptMedia}
              defaultPrefillData={defaultReceiptData}
              displayEUR={preferences.currencyEUR}
              onClose={closeLogModal}
              onSubmit={(entry, saved) => {
                const receiptId = receiptAwaitingEntryRef.current;
                receiptAwaitingEntryRef.current = null;
                if (receiptId && saved && saved.id) {
                  markReceiptAssigned(receiptId, RECEIPT_TARGETS.LEDGER_ENTRY, saved.id);
                  capture(FunnelEvents.BANKROLL_RECEIPT_FILED, { destination: entry && entry.category === 'expense' ? 'expense' : 'session', bulk: false });
                }
                handleLogSubmit(saved && saved.id ? saved : null); setDefaultReceiptCategory(null); setDefaultReceiptMedia(null); setDefaultReceiptData(null);
              }}
            />
          ) : (
            <LogSignInPrompt closeLogModal={closeLogModal} router={router} signInScrim={signInScrim} />
          )
        )}
      </AnimatePresence>

      {/* Rule Violation Notification Popup */}
      <AnimatePresence>
        {ruleViolations.length > 0 && (
          <RuleViolationsPopup ruleViolations={ruleViolations} setRuleViolations={setRuleViolations} violationsScrim={violationsScrim} />
        )}
      </AnimatePresence>

      {/* Starting Bankroll Modal */}
      <AnimatePresence>
        {showStartingBankroll && (
          <StartingBankrollModal
            userId={userId}
            onComplete={() => {
              setShowStartingBankroll(false);
              setBankrollInitialized(true);
              loadData();
              setShowLogModal(true); // Now open log modal
            }}
            onClose={() => setShowStartingBankroll(false)}
          />
        )}
      </AnimatePresence>

      {/* Adjust Bankroll Modal */}
      <AnimatePresence>
        {showAdjustModal && (
          <AdjustBankrollModal
            userId={userId}
            currentBalance={stats ? stats.totalBankroll : null}
            onComplete={() => {
              clearActionView('adjust-bankroll');
              setShowAdjustModal(false);
              loadData();
            }}
            onClose={() => { clearActionView('adjust-bankroll'); setShowAdjustModal(false); }}
          />
        )}
      </AnimatePresence>

      {/* Weekly Summary removed - data is already visible on dashboard */}

      {/* Bankroll Projection Modal */}
      <AnimatePresence>
        {showProjection && (
          <BankrollProjection
            userId={userId}
            currentBankroll={stats?.totalBankroll || 0}
            displayEUR={preferences.currencyEUR}
            bankrollKnown={Boolean(stats)}
            onClose={() => { clearActionView('projection'); setShowProjection(false); }}
          />
        )}
      </AnimatePresence>
      {UpgradePopup}
      </div>
    </PageTransition >
  );
}
