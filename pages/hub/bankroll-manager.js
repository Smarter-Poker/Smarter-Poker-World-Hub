/**
 * BANKROLL MANAGER PAGE
 * /hub/bankroll-manager — Financial Truth Engine
 * Military-grade tracking with immutable ledger and Personal Assistant
 */

import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../src/lib/supabase';
import { useAvatar } from '../../src/contexts/AvatarContext';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import FeatureGate from '../../src/components/gates/FeatureGate';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getBankrollPreferences, updateBankrollPreferences } from '../../src/services/bankrollPreferences';

// Bankroll library
import { getBankrollStats } from '../../src/lib/bankroll/calculations';
import { runLeakAnalysis } from '../../src/lib/bankroll/leakDetection';
import { getUserLocations } from '../../src/lib/bankroll/locationMemory';
import {
  fetchLedgerEntries,
  fetchTrips,
  fetchBankrollRules,
  getDateRangeFilter,
  initializeUserBankroll,
  updateLedgerEntry,
  deleteLedgerEntry,
  getActiveSeries,
} from '../../src/lib/bankroll/bankrollSelectors';
import toast from '../../src/stores/toastStore';
import { formatCurrency, formatCurrencyWithSign } from '../../src/lib/bankroll/currencyUtils';

// Bankroll components
import LedgerTimeline from '../../src/components/bankroll/LedgerTimeline';
import LogEntryModal from '../../src/components/bankroll/LogEntryModal';
import LeakAlertPanel from '../../src/components/bankroll/LeakAlertPanel';
import BankrollRulesCard from '../../src/components/bankroll/BankrollRulesCard';
import BankrollTrendChart from '../../src/components/bankroll/BankrollTrendChart';
// QuickLogWidget removed

import JarvisLeakInsights from '../../src/components/bankroll/JarvisLeakInsights';
// Phase 2 Components
import BankrollGoals from '../../src/components/bankroll/BankrollGoals';
import LocationAnalytics from '../../src/components/bankroll/LocationAnalytics';
import WeeklySummary from '../../src/components/bankroll/WeeklySummary';
import BankrollProjection from '../../src/components/bankroll/BankrollProjection';
import PlayerNotes from '../../src/components/bankroll/PlayerNotes';
// Phase 4 Components
import SessionTimer from '../../src/components/bankroll/SessionTimer';
import HistoricalComparison from '../../src/components/bankroll/HistoricalComparison';
import VarianceCalculator from '../../src/components/bankroll/VarianceCalculator';
import BankrollHeatMap from '../../src/components/bankroll/BankrollHeatMap';
// Phase 5 Pro Components
import BankrollProGate from '../../src/components/bankroll/BankrollProGate';
import ReceiptScanner from '../../src/components/bankroll/ReceiptScanner';
import SavedReceipts from '../../src/components/bankroll/SavedReceipts';
import TaxReportPanel from '../../src/components/bankroll/TaxReportPanel';
import StakingTracker from '../../src/components/bankroll/StakingTracker';
import SeriesTracker from '../../src/components/bankroll/SeriesTracker';
import SessionHandReview from '../../src/components/bankroll/SessionHandReview';
import TripTracker from '../../src/components/bankroll/TripTracker';
import CategoryOverview from '../../src/components/bankroll/CategoryOverview';
import StartingBankrollModal from '../../src/components/bankroll/StartingBankrollModal';
import ManageVenuesModal from '../../src/components/bankroll/ManageVenuesModal';
import AdjustBankrollModal from '../../src/components/bankroll/AdjustBankrollModal';
import { getActiveTrip, hasStartingBankroll } from '../../src/lib/bankroll/bankrollSelectors';
import GeofenceService from '../../src/lib/geofence';
import { requestPermission, showVenueAlert } from '../../src/lib/pushAlerts';
import { sendGeofenceNotification } from '../../src/lib/geofencePush';

// Clean Facebook-style navigation (no emojis)
const SIDEBAR_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: '' },
  { id: 'adjust-bankroll', label: 'Adjust Bankroll', icon: '', action: true },
  { id: 'trips', label: 'Trip Tracker', icon: '' },
  { id: 'series', label: 'Series Tracker', icon: '' },
  { id: 'players', label: 'Player Notes', icon: '' },
  { id: 'scan-receipt', label: 'Scan Receipt', icon: '' },
  { id: 'projection', label: 'Run Projections', icon: '' },
  { id: 'staking', label: 'Staking Tracker', icon: '' },
  { id: 'tax', label: 'Tax Reports', icon: '' },
  { id: 'reports', label: 'Reports', icon: '' },
];

// Accounting-only categories: NEVER count as sessions, never affect win rate, projections, or stats
const ACCOUNTING_CATEGORIES = ['expense', 'deposit', 'withdrawal', 'receipt'];

// Map URL ?type= values to database category IDs
const TYPE_TO_CATEGORY = {
  cash: 'poker_cash',
  tournament: 'poker_mtt',
  casino: 'casino_table',
  slots: 'slots',
  sports: 'sports',
  expense: 'expense',
};

const CATEGORY_LABELS = {
  poker_cash: 'Cash Games',
  poker_mtt: 'Tournaments',
  casino_table: 'Table Games',
  slots: 'Slots',
  sports: 'Sports Betting',
  expense: 'Expenses',
};

const TIME_FILTERS = ['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'This Year', 'All Time'];

function StatCard({ title, value, change, suffix, isRisk, isLoading, onClick }) {
  const getRiskColor = (risk) => {
    if (risk === 'HIGH') return '#ef4444';
    if (risk === 'MEDIUM') return '#eab308';
    return '#22c55e';
  };

  return (
    <div style={{ ...styles.statCard, ...(onClick ? { cursor: 'pointer' } : {}) }} onClick={onClick}>
      <span style={styles.statTitle}>{title}</span>
      {isLoading ? (
        <div style={styles.statLoading}>—</div>
      ) : (
        <div style={styles.statValue}>
          <span style={{ color: isRisk ? getRiskColor(value) : '#fff' }}>
            {value}
          </span>
          {isRisk && value === 'HIGH' && <span style={styles.riskDot}>●</span>}
          {change !== undefined && change !== null && !isRisk && (
            <span
              style={{
                ...styles.statChange,
                color: change >= 0 ? '#22c55e' : '#ef4444',
              }}
            >
              {change >= 0 ? '+' : ''}${Math.abs(change).toLocaleString()}
              {change < 0 && <span style={styles.downArrow}>▼</span>}
            </span>
          )}
          {suffix && <span style={styles.statSuffix}>{suffix}</span>}
        </div>
      )}
    </div>
  );
}

export default function BankrollManagerPage() {
  const router = useRouter();
  const { user } = useAvatar();
  const userId = user?.id;

  // UI State
  const [activeSection, setActiveSection] = useState('dashboard');

  const [editEntry, setEditEntry] = useState(null);

  // Handle query parameters for deep linking
  // Use router.asPath as dependency — it's a string that reliably changes on same-page navigation
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.view) {
      setActiveSection(router.query.view);
    }
    if (router.query.type) {
      // Map URL type to DB category
      const dbCategory = TYPE_TO_CATEGORY[router.query.type] || router.query.type;
      setCategoryFilter(dbCategory);
      setActiveSection('dashboard'); // Ensure we show the dashboard when filtering
    } else if (!router.query.view) {
      setCategoryFilter('all');
    }
  }, [router.asPath, router.isReady]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showProjection, setShowProjection] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [showStartingBankroll, setShowStartingBankroll] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [bankrollInitialized, setBankrollInitialized] = useState(null); // null = loading, true/false

  // Hamburger menu preferences
  const [preferences, setPreferences] = useState({
    autoSave: true,
    notifications: true,
    currencyEUR: false
  });

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState(null);
  const [timeFilter, setTimeFilter] = useState('All Time');
  const [gameTypeFilter, setGameTypeFilter] = useState(['poker_cash', 'poker_mtt', 'casino_table', 'slots', 'sports']);

  // Dropdowns
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [showGameTypeDropdown, setShowGameTypeDropdown] = useState(false);
  const [showChartTypeDropdown, setShowChartTypeDropdown] = useState(false);
  const [chartType, setChartType] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bankroll_chart_type') || 'line';
    }
    return 'line';
  });
  const CHART_TYPE_LABELS = { line: 'Line Chart', bar: 'Bar Chart', donut: 'Donut Chart', stacked: 'Stacked Bar', histogram: 'Histogram', heatmap: 'Heatmap' };
  const CHART_TYPES = ['line', 'bar', 'donut', 'stacked', 'histogram', 'heatmap'];
  const handleChartTypeChange = (type) => {
    setChartType(type);
    setShowChartTypeDropdown(false);
    try { localStorage.setItem('bankroll_chart_type', type); } catch (_) { }
  };

  const toggleGameType = (type) => {
    setGameTypeFilter(prev => {
      var idx = prev.indexOf(type);
      if (idx !== -1) {
        var next = prev.slice();
        next.splice(idx, 1);
        return next;
      } else {
        return prev.concat([type]);
      }
    });
  };

  // Data
  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState([]);
  const [trips, setTrips] = useState([]);
  const [activeSeries, setActiveSeries] = useState(null);
  const [locations, setLocations] = useState([]);
  const [leakAnalysis, setLeakAnalysis] = useState(null);
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerStep, setScannerStep] = useState('scan'); // 'scan' | 'post-capture' | 'pick-entry'
  const [scannerEntryId, setScannerEntryId] = useState(null);
  const [scannerImageUrl, setScannerImageUrl] = useState(null);
  const [defaultReceiptCategory, setDefaultReceiptCategory] = useState(null);
  const [defaultReceiptMedia, setDefaultReceiptMedia] = useState(null);
  const [ruleViolations, setRuleViolations] = useState([]);
  const [isVip, setIsVip] = useState(false);

  // Pre-compute report stats to avoid inline IIFEs (Terser mangles Set refs inside IIFEs)
  const gamingSessions = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    return entries.filter(e => {
      const cat = e.category;
      return cat !== 'expense' && cat !== 'deposit' && cat !== 'withdrawal' && cat !== 'receipt';
    });
  }, [entries]);

  const reportTotalSessions = gamingSessions.length;

  const reportWinRate = useMemo(() => {
    if (gamingSessions.length === 0) return 0;
    const wins = gamingSessions.filter(e => (e.gross_out - e.gross_in) > 0).length;
    return Math.round((wins / gamingSessions.length) * 100);
  }, [gamingSessions]);

  const reportAvgSession = useMemo(() => {
    if (gamingSessions.length === 0) return 0;
    const total = gamingSessions.reduce((sum, e) => sum + (e.gross_out - e.gross_in), 0);
    return Math.round(total / gamingSessions.length);
  }, [gamingSessions]);

  // Pre-compute filtered analytics entries (gaming sessions only, matching game type filter)
  const filteredAnalyticsEntries = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    return entries.filter(e => {
      const cat = e.category;
      const isAccounting = cat === 'expense' || cat === 'deposit' || cat === 'withdrawal' || cat === 'receipt';
      return !isAccounting && gameTypeFilter.includes(cat);
    });
  }, [entries, gameTypeFilter]);

  // Pre-compute chart entries (gaming sessions matching filter + always include expenses)
  const chartEntries = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    return entries.filter(e => {
      return e.category === 'expense' || gameTypeFilter.includes(e.category);
    });
  }, [entries, gameTypeFilter]);

  //  INTRO VIDEO STATE - Video plays while page loads in background
  // Only show once per session (not on every reload)
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window !== 'undefined') {
      return !sessionStorage.getItem('bankroll-manager-intro-seen');
    }
    return false;
  });
  const introVideoRef = useRef(null);

  // Mark intro as seen when it ends
  const handleIntroEnd = useCallback(() => {
    sessionStorage.setItem('bankroll-manager-intro-seen', 'true');
    setShowIntro(false);
  }, []);

  // Attempt to unmute video after it starts playing
  const handleIntroPlay = useCallback(() => {
    if (introVideoRef.current) {
      introVideoRef.current.muted = false;
    }
  }, []);

  // Initialize bankroll for new users
  useEffect(() => {
    if (userId) {
      initializeUserBankroll(userId).catch(console.error);
      // Check VIP status
      supabase.from('profiles').select('is_vip').eq('id', userId).single()
        .then(({ data }) => { if (data) setIsVip(!!data.is_vip); });
    }
  }, [userId]);

  // Load all data
  const loadData = useCallback(async () => {
    // Fix: Set isLoading false even when no user (prevents infinite skeleton)
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const dateRange = getDateRangeFilter(timeFilter);

      const [statsData, entriesData, tripsData, locationsData, leakData] = await Promise.all([
        getBankrollStats(userId, dateRange.startDate, dateRange.endDate, locationFilter),
        fetchLedgerEntries(userId, {
          locationId: locationFilter,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          includeExpenses: true,
          limit: 50,
        }),
        fetchTrips(userId),
        getUserLocations(userId),
        runLeakAnalysis(userId, locationFilter),
      ]);

      setStats(statsData);
      setTrips(tripsData);
      setLocations(locationsData);
      setLeakAnalysis(leakData);

      // Fetch active series for dashboard banner
      var seriesData = null;
      try {
        seriesData = await getActiveSeries(userId);
        setActiveSeries(seriesData);
      } catch (e) {
        console.warn('Could not load active series:', e);
      }

      // ── Filter out active trip/series entries ──
      // Entries belonging to an active trip or series stay hidden
      // until the user completes the trip/series. Then they appear
      // as ONE summary row in Recent Activity.

      // 1. Collect active trip IDs
      var activeIds = [];
      for (var t = 0; t < tripsData.length; t++) {
        if (tripsData[t].status === 'active') {
          activeIds.push(tripsData[t].id);
        }
      }
      // 2. Collect active series ID (if any)
      if (seriesData && seriesData.id) {
        activeIds.push(seriesData.id);
      }

      // 3. Separate entries: hide active trip/series, keep the rest
      var visible = [];
      var completedTripMap = {};
      for (var i = 0; i < entriesData.length; i++) {
        var entry = entriesData[i];
        if (entry.trip_id && activeIds.indexOf(entry.trip_id) !== -1) {
          // Entry belongs to an active trip/series — HIDE it
          continue;
        }
        if (entry.trip_id) {
          // Entry belongs to a completed trip/series — group for summary
          if (!completedTripMap[entry.trip_id]) completedTripMap[entry.trip_id] = [];
          completedTripMap[entry.trip_id].push(entry);
        } else {
          // Standalone entry — show directly
          visible.push(entry);
        }
      }

      // 4. Create ONE summary row per completed trip/series
      var completedTripIds = Object.keys(completedTripMap);
      for (var k = 0; k < completedTripIds.length; k++) {
        var tid = completedTripIds[k];
        var items = completedTripMap[tid];
        // Find the trip/series metadata
        var tripMeta = null;
        for (var m = 0; m < tripsData.length; m++) {
          if (tripsData[m].id === tid) { tripMeta = tripsData[m]; break; }
        }
        var net = 0;
        var latestDate = items[0].entry_date || '';
        for (var n = 0; n < items.length; n++) {
          net += (items[n].gross_out || 0) - (items[n].gross_in || 0);
          if (items[n].entry_date > latestDate) latestDate = items[n].entry_date;
        }
        visible.push({
          id: 'trip-summary-' + tid,
          category: 'trip_summary',
          entry_date: latestDate,
          net_result: net,
          gross_in: 0,
          gross_out: 0,
          location_name: (tripMeta ? tripMeta.location_name : '') || (items[0] ? items[0].location_name : '') || '',
          _tripName: (tripMeta ? tripMeta.name : '') || 'Trip',
          _sessionCount: items.length,
          _isTripSummary: true,
        });
      }

      // 5. Sort by date descending
      visible.sort(function (a, b) { return b.entry_date.localeCompare(a.entry_date); });
      setEntries(visible);
    } catch (error) {
      console.error('Error loading bankroll data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, locationFilter, timeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Geofence: start watching when userId is available
  useEffect(() => {
    if (!userId) return;
    const gf = new GeofenceService();

    (async () => {
      try {
        const res = await fetch(`/api/bankroll/linked-venues?userId=${userId}`);
        const data = await res.json();
        if (data.success && data.venues?.length > 0) {
          gf.start(data.venues, async (venue) => {
            // Request permission on first trigger
            await requestPermission();
            // Show browser notification (foreground, current tab)
            showVenueAlert(venue, 'checkin');
            // Send server-side OneSignal push (all devices, background-capable)
            sendGeofenceNotification(venue, userId);
            // Also open log modal pre-filled with this venue
            toast.show(`📍 You're near ${venue.name}! Tap to log a session.`);
          });
        }
      } catch (err) {
        console.warn('[Geofence] Failed to load venues:', err);
      }
    })();

    return () => gf.stop();
  }, [userId]);

  const handleLogSubmit = async () => {
    setShowLogModal(false);
    setEditEntry(null);
    await loadData();

    // Check rules for violations after logging
    if (userId) {
      try {
        const rules = await fetchBankrollRules(userId);
        if (rules && rules.length > 0) {
          // Refresh stats & entries to get latest data
          const dateRange = getDateRangeFilter(timeFilter);
          const [latestStats, latestEntries] = await Promise.all([
            getBankrollStats(userId, dateRange.startDate, dateRange.endDate, locationFilter),
            fetchLedgerEntries(userId, { startDate: dateRange.startDate, endDate: dateRange.endDate, includeExpenses: true, limit: 50 }),
          ]);

          const violations = [];
          const today = new Date().toISOString().split('T')[0];
          const todayEntries = latestEntries.filter(e => e.entry_date === today);
          const todayNet = todayEntries.reduce((sum, e) => sum + ((e.gross_out || 0) - (e.gross_in || 0)), 0);
          const lastEntry = latestEntries[0];
          const lastSessionNet = lastEntry ? ((lastEntry.gross_out || 0) - (lastEntry.gross_in || 0)) : 0;

          for (const rule of rules) {
            const val = rule.value;
            switch (rule.rule_type) {
              case 'stop_loss_session':
                if (lastSessionNet < 0 && Math.abs(lastSessionNet) >= val)
                  violations.push({ rule: 'Session Stop-Loss', limit: `$${val}`, actual: `-$${Math.abs(lastSessionNet)}`, severity: 'high' });
                break;
              case 'stop_loss_day':
                if (todayNet < 0 && Math.abs(todayNet) >= val)
                  violations.push({ rule: 'Daily Stop-Loss', limit: `$${val}`, actual: `-$${Math.abs(todayNet)}`, severity: 'high' });
                break;
              case 'max_buyin_percent': {
                const bankroll = latestStats?.totalBankroll || 0;
                if (bankroll > 0 && lastEntry) {
                  const buyinPercent = ((lastEntry.gross_in || 0) / bankroll) * 100;
                  if (buyinPercent > val)
                    violations.push({ rule: 'Max Buy-In %', limit: `${val}%`, actual: `${buyinPercent.toFixed(1)}%`, severity: 'medium' });
                }
                break;
              }
              case 'win_goal_session':
                if (lastSessionNet > 0 && lastSessionNet >= val)
                  violations.push({ rule: 'Win Goal Reached!', limit: `$${val}`, actual: `+$${lastSessionNet}`, severity: 'info' });
                break;
            }
          }

          if (violations.length > 0) {
            setRuleViolations(violations);
          }
        }
      } catch (err) {
        console.error('[RuleCheck] Error:', err);
      }
    }
  };

  // Gate Log+ behind bankroll check
  const handleLogClick = useCallback(async () => {
    if (!userId) { setShowLogModal(true); return; } // Will show login prompt
    if (bankrollInitialized === false) {
      setShowStartingBankroll(true);
      return;
    }
    // If still loading, do async check
    if (bankrollInitialized === null) {
      const has = await hasStartingBankroll(userId);
      setBankrollInitialized(has);
      if (!has) { setShowStartingBankroll(true); return; }
    }
    setShowLogModal(true);
  }, [userId, bankrollInitialized]);

  // Check starting bankroll on mount
  useEffect(() => {
    if (!userId) return;
    hasStartingBankroll(userId).then(has => setBankrollInitialized(has));
  }, [userId]);

  const handleEditEntry = (entry) => {
    setEditEntry(entry);
    setShowLogModal(true);
  };

  const handleDeleteEntry = async (entryId) => {
    // Optimistic removal — entry disappears immediately
    setEntries(prev => prev.filter(e => e.id !== entryId));
    try {
      await deleteLedgerEntry(userId, entryId);
      toast.success('Entry deleted');
      await loadData(); // Full refresh to sync stats
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Failed to delete entry');
      await loadData(); // Re-fetch to restore if delete failed
    }
  };

  const handleSidebarClick = (sectionId) => {
    if (sectionId === 'scan-receipt') {
      setShowScanner(true);
      setScannerStep('scan');
      setScannerEntryId(null);
      setScannerImageUrl(null);
    } else if (sectionId === 'projection') {
      setShowProjection(true);
    } else if (sectionId === 'staking') {
      setActiveSection('staking');
    } else if (sectionId === 'tax') {
      setActiveSection('tax');
    } else if (sectionId === 'receipts') {
      setActiveSection('receipts');
    } else {
      setActiveSection(sectionId);
      // Reset category filter when going back to Dashboard
      if (sectionId === 'dashboard') {
        setCategoryFilter('all');
        router.push('/hub/bankroll-manager', undefined, { shallow: true });
        loadData(); // Refresh dashboard data (trips, series banners, stats)
      }
    }
  };

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
  const updatePreference = useCallback(async (key, value) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);

    if (userId) {
      try {
        await updateBankrollPreferences(userId, { [key]: value });
      } catch (error) {
        console.error('Failed to save preference:', error);
      }
    }
  }, [userId, preferences]);

  const menuConfig = getMenuConfig('bankroll-manager', user, preferences, {
    setAutoSave: (val) => updatePreference('autoSave', val),
    setNotifications: (val) => updatePreference('notifications', val),
    setCurrencyEUR: (val) => updatePreference('currencyEUR', val),
    onAdjustBankroll: () => { setMenuOpen(false); setShowAdjustModal(true); }
  });

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClick = () => {
      setShowLocationDropdown(false);
      setShowTimeDropdown(false);
      setShowGameTypeDropdown(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <PageTransition>
      {/*  INTRO VIDEO OVERLAY - Plays while page loads behind it */}
      {showIntro && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <video
            ref={introVideoRef}
            src="/videos/bankroll-manager-intro.mp4"
            autoPlay
            muted
            playsInline
            onPlay={handleIntroPlay}
            onEnded={handleIntroEnd}
            onError={handleIntroEnd}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
          {/* Skip button */}
          <button
            onClick={handleIntroEnd}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              padding: '8px 20px',
              background: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 20,
              color: 'white',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              zIndex: 100000
            }}
          >
            Skip
          </button>
        </div>
      )}
      <SEOHead
        title="Bankroll Manager — Track Your Poker Profits"
        description="Professional Bankroll Tracking For Poker Players. Monitor Sessions, Analyze Leaks, Track ROI, And Visualize Trends With Detailed Analytics And Variance Analysis."
        canonical="/hub/bankroll-manager"
      >
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </SEOHead>

      <div className="bankroll-page" style={styles.container}>
        <div style={styles.bgGrid} />
        <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />

        <FeatureGate featureKey="bankroll_manager" userId={userId} cost={25} duration={24} featureName="Bankroll Manager" description="Track Sessions, Analyze Leaks, And Manage Your Poker Bankroll For 24 Hours." hideBadge>
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


          {/* Main Layout */}
          <div className="bankroll-main-layout" style={styles.mainLayout}>
            {/* Left Sidebar — hidden on mobile via CSS */}
            <nav className="bankroll-sidebar" style={styles.sidebar}>
              {SIDEBAR_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => section.action ? setShowAdjustModal(true) : handleSidebarClick(section.id)}
                  style={{
                    ...styles.sidebarItem,
                    ...(activeSection === section.id && !section.action ? styles.sidebarItemActive : {}),
                  }}
                >
                  {section.id === 'dashboard' && activeSection !== 'dashboard' ? '← Dashboard' : section.label}
                </button>
              ))}

              {/* Jarvis AI Insights - moved from right panel */}
              <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
                <JarvisLeakInsights userId={userId} onRefresh={loadData} />
              </div>
            </nav>

            {/* Main Content - Switches based on activeSection */}
            <main className="bankroll-main-content" style={styles.mainContent}>

              {/* Header */}
              <div className="bankroll-content-header" style={styles.contentHeader}>
                <h1 className="bankroll-page-title" style={styles.pageTitle}>
                  {activeSection === 'dashboard' && categoryFilter === 'all' && 'Bankroll Manager'}
                  {activeSection === 'dashboard' && categoryFilter !== 'all' && (CATEGORY_LABELS[categoryFilter] || 'Bankroll Manager')}
                  {activeSection === 'trips' && 'Trip Tracker'}
                  {activeSection === 'players' && 'Player Notes'}
                  {activeSection === 'leaks' && 'Leak Analysis'}
                  {activeSection === 'reports' && 'Reports'}
                  {activeSection === 'pro' && 'Pro Tools'}
                  {activeSection === 'settings' && 'Settings'}
                  {activeSection === 'rules' && 'Bankroll Rules'}
                  {activeSection === 'staking' && 'Staking Tracker'}
                </h1>
                <div style={styles.headerActions}>
                  {activeSection === 'dashboard' && categoryFilter === 'all' && (
                    <button className="bankroll-log-btn" style={styles.logButton} onClick={handleLogClick}>
                      Add +
                    </button>
                  )}
                </div>
              </div>

              {/* Category Overview View (Cash Games, Tournaments, etc.) */}
              {activeSection === 'dashboard' && categoryFilter !== 'all' && (
                <CategoryOverview
                  userId={userId}
                  categoryFilter={categoryFilter}
                  onBack={() => {
                    setCategoryFilter('all');
                    router.push('/hub/bankroll-manager', undefined, { shallow: true });
                  }}
                />
              )}

              {/* Dashboard View */}
              {activeSection === 'dashboard' && categoryFilter === 'all' && (
                <>

                  {/* Active Trip Featured Banner */}
                  {(() => {
                    const activeTrip = trips.find(t => t.status === 'active' && t.trip_type !== 'series');
                    if (!activeTrip) return null;
                    const daysSinceStart = Math.max(1, Math.ceil((Date.now() - new Date(activeTrip.start_date + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)));
                    return (
                      <div
                        style={{
                          background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(59,130,246,0.08) 100%)',
                          border: '1px solid rgba(16,185,129,0.3)',
                          borderRadius: 12,
                          padding: '14px 16px',
                          marginBottom: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          cursor: 'pointer',
                        }}
                        onClick={() => setActiveSection('trips')}
                      >
                        <div style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: '#10b981',
                          boxShadow: '0 0 8px rgba(16,185,129,0.6)',
                          flexShrink: 0,
                          animation: 'metalGlow 2s infinite',
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
                            {activeTrip.name}
                          </div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>
                            {activeTrip.location_name && `${activeTrip.location_name} · `}
                            Day {daysSinceStart} · {activeTrip.entryCount || 0} sessions
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: (activeTrip.totalNet || 0) >= 0 ? '#10b981' : '#ef4444',
                          }}>
                            {(activeTrip.totalNet || 0) >= 0 ? '+' : ''}${Math.abs(activeTrip.totalNet || 0).toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleLogClick(); }}
                          style={{
                            background: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          + Add Entry
                        </button>
                      </div>
                    );
                  })()}

                  {/* Active Series Featured Banner */}
                  {activeSeries && (() => {
                    const daysSinceStart = Math.max(1, Math.ceil((Date.now() - new Date(activeSeries.start_date + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)));
                    return (
                      <div
                        style={{
                          background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(168,85,247,0.08) 100%)',
                          border: '1px solid rgba(59,130,246,0.3)',
                          borderRadius: 12,
                          padding: '14px 16px',
                          marginBottom: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          cursor: 'pointer',
                        }}
                        onClick={() => setActiveSection('series')}
                      >
                        <div style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: '#3b82f6',
                          boxShadow: '0 0 8px rgba(59,130,246,0.6)',
                          flexShrink: 0,
                          animation: 'metalGlow 2s infinite',
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
                            {activeSeries.name}
                          </div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>
                            {activeSeries.location_name && `${activeSeries.location_name} · `}
                            Day {daysSinceStart} · {activeSeries.entryCount || 0} sessions
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: (activeSeries.totalNet || 0) >= 0 ? '#10b981' : '#ef4444',
                          }}>
                            {(activeSeries.totalNet || 0) >= 0 ? '+' : ''}${Math.abs(activeSeries.totalNet || 0).toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveSection('series'); }}
                          style={{
                            background: '#6366f1',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          View Series
                        </button>
                      </div>
                    );
                  })()}

                  {/* === Unified Dashboard Frame === */}
                  <div style={{
                    background: '#1a1b1e',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 14,
                    padding: '16px',
                    marginBottom: 16,
                  }}>

                    {/* Stats Cards */}
                    <div className="bankroll-stats-grid" style={styles.statsGrid}>
                      <StatCard
                        title="Bankroll Balance"
                        value={stats ? formatCurrency(stats.totalBankroll, preferences.currencyEUR) : '—'}
                        isLoading={isLoading}
                        onClick={() => setShowAdjustModal(true)}
                      />
                      <StatCard
                        title="Net Results"
                        value={
                          stats
                            ? formatCurrency(stats.allInNet, preferences.currencyEUR)
                            : '—'
                        }
                        isLoading={isLoading}
                      />
                    </div>

                    {/* Bankroll Trend Chart — filtered by gameTypeFilter, always include expenses */}
                    <BankrollTrendChart entries={chartEntries} isLoading={isLoading} chartType={chartType} timeFilter={timeFilter} />

                    {/* Filters Row */}
                    <div className="bankroll-filters-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                      {/* Location Dropdown */}
                      <div style={styles.dropdownContainer} onClick={(e) => e.stopPropagation()}>
                        <button
                          style={styles.dropdownButton}
                          onClick={() => {
                            setShowLocationDropdown(!showLocationDropdown);
                            setShowTimeDropdown(false);
                            setShowGameTypeDropdown(false);
                            setShowChartTypeDropdown(false);
                          }}
                        >
                          {selectedLocationName} <span style={styles.dropdownArrow}>▼</span>
                        </button>
                        {showLocationDropdown && (
                          <div className="bankroll-dropdown-menu" style={styles.dropdownMenu}>
                            <button
                              style={styles.dropdownItem}
                              onClick={() => { setLocationFilter(null); setShowLocationDropdown(false); }}
                            >
                              All Locations
                            </button>
                            {locations.map((loc) => (
                              <button
                                key={loc.id}
                                style={styles.dropdownItem}
                                onClick={() => { setLocationFilter(loc.id); setShowLocationDropdown(false); }}
                              >
                                {loc.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Time Filter Dropdown */}
                      <div style={styles.dropdownContainer} onClick={(e) => e.stopPropagation()}>
                        <button
                          style={styles.dropdownButton}
                          onClick={() => {
                            setShowTimeDropdown(!showTimeDropdown);
                            setShowLocationDropdown(false);
                            setShowGameTypeDropdown(false);
                            setShowChartTypeDropdown(false);
                          }}
                        >
                          {timeFilter} <span style={styles.dropdownArrow}>▼</span>
                        </button>
                        {showTimeDropdown && (
                          <div className="bankroll-dropdown-menu" style={styles.dropdownMenu}>
                            {TIME_FILTERS.map((tf) => (
                              <button
                                key={tf}
                                style={styles.dropdownItem}
                                onClick={() => { setTimeFilter(tf); setShowTimeDropdown(false); }}
                              >
                                {tf}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Game Type Multi-Select Dropdown */}
                      <div style={styles.dropdownContainer} onClick={(e) => e.stopPropagation()}>
                        <button
                          style={styles.dropdownButton}
                          onClick={() => {
                            setShowGameTypeDropdown(!showGameTypeDropdown);
                            setShowLocationDropdown(false);
                            setShowTimeDropdown(false);
                            setShowChartTypeDropdown(false);
                          }}
                        >
                          Game Type ({gameTypeFilter.length}) <span style={styles.dropdownArrow}>▼</span>
                        </button>
                        {showGameTypeDropdown && (
                          <div className="bankroll-dropdown-menu" style={{ ...styles.dropdownMenu, minWidth: 200 }}>
                            {['poker_cash', 'poker_mtt', 'casino_table', 'slots', 'sports'].map((cat) => (
                              <button
                                key={cat}
                                style={{
                                  ...styles.dropdownItem,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  background: gameTypeFilter.includes(cat) ? 'rgba(35, 116, 225, 0.15)' : 'transparent',
                                }}
                                onClick={() => toggleGameType(cat)}
                              >
                                <span style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: 3,
                                  border: gameTypeFilter.includes(cat) ? '2px solid #2374e1' : '2px solid rgba(255,255,255,0.3)',
                                  background: gameTypeFilter.includes(cat) ? '#2374e1' : 'transparent',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 11,
                                  color: '#fff',
                                  flexShrink: 0,
                                }}>
                                  {gameTypeFilter.includes(cat) ? '✓' : ''}
                                </span>
                                {CATEGORY_LABELS[cat]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Chart Type Dropdown */}
                      <div style={styles.dropdownContainer} onClick={(e) => e.stopPropagation()}>
                        <button
                          style={styles.dropdownButton}
                          onClick={() => {
                            setShowChartTypeDropdown(!showChartTypeDropdown);
                            setShowLocationDropdown(false);
                            setShowTimeDropdown(false);
                            setShowGameTypeDropdown(false);
                          }}
                        >
                          {CHART_TYPE_LABELS[chartType] || 'Line Chart'} <span style={styles.dropdownArrow}>▼</span>
                        </button>
                        {showChartTypeDropdown && (
                          <div className="bankroll-dropdown-menu" style={styles.dropdownMenu}>
                            {CHART_TYPES.map((ct) => (
                              <button
                                key={ct}
                                style={{
                                  ...styles.dropdownItem,
                                  background: chartType === ct ? 'rgba(35, 116, 225, 0.15)' : 'transparent',
                                }}
                                onClick={() => handleChartTypeChange(ct)}
                              >
                                {CHART_TYPE_LABELS[ct]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Analytics Grid — horizontal slider on mobile */}
                  <div style={{ position: 'relative' }}>
                    {!isVip && (
                      <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(10, 12, 20, 0.85)',
                        backdropFilter: 'blur(6px)',
                        borderRadius: 12,
                        zIndex: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 12,
                      }}>
                        <div style={{ fontSize: 32 }}>👑</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#FFD700', textAlign: 'center' }}>VIP Only — Advanced Analytics</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: 280 }}>Variance Analysis, Venue Intelligence & Historical Trends Require VIP Membership.</div>
                        <button
                          onClick={() => router.push('/hub/diamond-store')}
                          style={{
                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                            color: '#000',
                            border: 'none',
                            borderRadius: 8,
                            padding: '10px 24px',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            marginTop: 4,
                          }}
                        >
                          Upgrade to VIP
                        </button>
                      </div>
                    )}
                    <div className="bankroll-analytics-slider" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16, gridTemplateRows: '300px', filter: isVip ? 'none' : 'blur(3px)', pointerEvents: isVip ? 'auto' : 'none' }}>
                      <div style={{ height: 300, minHeight: 300, maxHeight: 300, overflow: 'auto' }}>
                        <LocationAnalytics entries={filteredAnalyticsEntries} isLoading={isLoading} />
                      </div>
                      <div style={{ height: 300, minHeight: 300, maxHeight: 300, overflow: 'auto' }}>
                        <VarianceCalculator entries={filteredAnalyticsEntries} />
                      </div>
                      <div style={{ height: 300, minHeight: 300, maxHeight: 300, overflow: 'auto' }}>
                        <HistoricalComparison entries={filteredAnalyticsEntries} />
                      </div>
                    </div>
                  </div>

                  {/* Recent Activity Section */}
                  <div style={styles.activitySection}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}
                    >
                      <h2 style={styles.sectionTitle}>Recent Activity</h2>
                      {entries.length > 5 && (
                        <button
                          onClick={() => setShowAllEntries(true)}
                          style={{
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: 6,
                            padding: '6px 14px',
                            color: '#3b82f6',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          View All ({entries.length})
                        </button>
                      )}
                    </div>

                    {/* Ledger Timeline — always shows last 5 */}
                    <LedgerTimeline
                      entries={entries.slice(0, 5)}
                      isLoading={isLoading}
                      onEdit={handleEditEntry}
                      onDelete={handleDeleteEntry}
                    />
                  </div>

                  {/* Recent Activity Modal Popup */}
                  {showAllEntries && (
                    <div
                      onClick={() => setShowAllEntries(false)}
                      style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.85)',
                        backdropFilter: 'blur(6px)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 16,
                      }}
                    >
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          maxWidth: 600,
                          maxHeight: '80vh',
                          background: '#1a1b1e',
                          borderRadius: 16,
                          border: '1px solid rgba(255,255,255,0.1)',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {/* Modal Header */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '16px 20px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                          flexShrink: 0,
                        }}>
                          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Recent Activity</h2>
                          <button
                            onClick={() => setShowAllEntries(false)}
                            style={{
                              background: 'rgba(255,255,255,0.1)',
                              border: 'none',
                              borderRadius: 8,
                              width: 32,
                              height: 32,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              fontSize: 16,
                              cursor: 'pointer',
                            }}
                          >
                            ✕
                          </button>
                        </div>
                        {/* Scrollable Content */}
                        <div style={{ overflowY: 'auto', padding: '12px 20px 20px' }}>
                          <LedgerTimeline
                            entries={entries}
                            isLoading={isLoading}
                            onEdit={handleEditEntry}
                            onDelete={handleDeleteEntry}
                          />
                        </div>
                      </div>
                    </div>
                  )}




                </>
              )}

              {/* Trip Tracker View */}
              {activeSection === 'trips' && (
                <TripTracker
                  userId={userId}
                  onOpenLog={handleLogClick}
                  onEditEntry={handleEditEntry}
                  onDeleteEntry={handleDeleteEntry}
                />
              )}

              {/* Series Tracker View */}
              {activeSection === 'series' && (
                <SeriesTracker
                  userId={userId}
                  onOpenLog={handleLogClick}
                  onEditEntry={handleEditEntry}
                  onDeleteEntry={handleDeleteEntry}
                />
              )}

              {/* Leaks View */}
              {activeSection === 'leaks' && (
                <div style={styles.activitySection}>
                  <h2 style={styles.sectionTitle}>Leak Analysis</h2>
                  {!leakAnalysis || leakAnalysis.topLeaks?.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                      <div style={{ marginBottom: 16, opacity: 0.5, fontSize: 18, color: '#22c55e', fontWeight: 600 }}>All Clear</div>
                      <p style={{ fontSize: 16, fontWeight: 600, color: '#22c55e', margin: '0 0 8px' }}>No Leaks Detected</p>
                      <p style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.5)', margin: 0 }}>Keep Logging Sessions To Build Your Analysis History</p>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: 16, background: leakAnalysis.leakRisk === 'HIGH' ? 'rgba(239, 68, 68, 0.1)' : leakAnalysis.leakRisk === 'MEDIUM' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(34, 197, 94, 0.1)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: leakAnalysis.leakRisk === 'HIGH' ? '#ef4444' : leakAnalysis.leakRisk === 'MEDIUM' ? '#eab308' : '#22c55e' }}>{leakAnalysis.leakRisk === 'HIGH' ? 'Alert' : leakAnalysis.leakRisk === 'MEDIUM' ? 'Warning' : 'OK'}</span>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: leakAnalysis.leakRisk === 'HIGH' ? '#ef4444' : leakAnalysis.leakRisk === 'MEDIUM' ? '#eab308' : '#22c55e' }}>{leakAnalysis.leakRisk} RISK</div>
                          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Total Leak Amount: ${leakAnalysis.totalLeakAmount?.toLocaleString() || 0}</div>
                        </div>
                      </div>
                      {leakAnalysis.topLeaks?.map((leak, i) => (
                        <div key={i} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, marginBottom: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{leak.title}</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: leak.severity >= 4 ? '#ef4444' : leak.severity >= 3 ? '#eab308' : '#3b82f6' }}>{leak.value}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{leak.message}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Goals View (from hamburger menu) */}
              {activeSection === 'goals' && (
                <div style={styles.activitySection}>
                  <h2 style={styles.sectionTitle}>Bankroll Goals</h2>
                  <BankrollGoals
                    userId={userId}
                    currentBankroll={stats?.totalBankroll || 0}
                    periodPL={stats?.monthlyPL || 0}
                  />
                </div>
              )}

              {/* Player Notes View */}
              {activeSection === 'players' && (
                <PlayerNotes userId={userId} />
              )}

              {/* Reports View */}
              {activeSection === 'reports' && (
                <div style={styles.activitySection}>
                  <h2 style={styles.sectionTitle}>Performance Reports</h2>

                  {/* Quick Stats Summary */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 12,
                    marginBottom: 20
                  }}>
                    <div style={styles.reportStatBox}>
                      <span style={styles.reportStatLabel}>Total Sessions</span>
                      <span style={styles.reportStatValue}>{reportTotalSessions}</span>
                    </div>
                    <div style={styles.reportStatBox}>
                      <span style={styles.reportStatLabel}>Win Rate</span>
                      <span style={styles.reportStatValue}>
                        {reportWinRate}%
                      </span>
                    </div>
                    <div style={styles.reportStatBox}>
                      <span style={styles.reportStatLabel}>Net P/L</span>
                      <span style={{
                        ...styles.reportStatValue,
                        color: (stats?.totalNetResult || 0) >= 0 ? '#22c55e' : '#ef4444'
                      }}>
                        {(stats?.totalNetResult || 0) >= 0 ? '+' : ''}${Math.abs(stats?.totalNetResult || 0).toLocaleString()}
                      </span>
                    </div>
                    <div style={styles.reportStatBox}>
                      <span style={styles.reportStatLabel}>Avg Session</span>
                      <span style={styles.reportStatValue}>
                        ${reportAvgSession}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Export CSV */}
                    <button
                      onClick={async () => {
                        if (!userId) return;
                        try {
                          const res = await fetch('/api/bankroll/export', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId, format: 'csv' })
                          });
                          const data = await res.json();
                          if (data.success && data.content) {
                            const blob = new Blob([data.content], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = data.filename || `bankroll_export_${new Date().toISOString().split('T')[0]}.csv`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            toast.success(`Exported ${data.summary?.sessions || 0} sessions to CSV`);
                          } else {
                            toast.error(data.message || 'No entries to export');
                          }
                        } catch (err) {
                          console.error('Export failed:', err);
                          toast.error('CSV export failed');
                        }
                      }}
                      style={styles.reportActionBtn}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>CSV</span>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>Export To CSV</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                          Download all sessions for spreadsheet analysis
                        </div>
                      </div>
                      <span style={{ fontSize: 18, opacity: 0.5 }}>›</span>
                    </button>

                    {/* Export JSON */}
                    <button
                      onClick={async () => {
                        if (!userId) return;
                        try {
                          const res = await fetch('/api/bankroll/export', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId, format: 'json' })
                          });
                          const data = await res.json();
                          if (data.success && data.data) {
                            const exportPayload = { entries: data.data, summary: data.summary };
                            const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = data.filename || `bankroll_export_${new Date().toISOString().split('T')[0]}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            toast.success(`Exported ${data.summary?.sessions || 0} sessions to JSON`);
                          } else {
                            toast.error(data.message || 'No entries to export');
                          }
                        } catch (err) {
                          console.error('Export failed:', err);
                          toast.error('JSON export failed');
                        }
                      }}
                      style={styles.reportActionBtn}
                    >
                      <span style={{ fontSize: 14, color: '#65676b' }}>JSON</span>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>Export To JSON</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                          Full data export for backup or API use
                        </div>
                      </div>
                      <span style={{ fontSize: 18, opacity: 0.5 }}>›</span>
                    </button>

                    {/* PDF Export */}
                    <button
                      onClick={async () => {
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          const token = session?.access_token;
                          const res = await fetch('/api/bankroll/export-pdf', {
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          if (res.ok) {
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `bankroll_report_${new Date().toISOString().split('T')[0]}.pdf`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }
                        } catch (err) {
                          console.error('PDF export failed:', err);
                        }
                      }}
                      style={styles.reportActionBtn}
                    >
                      <span style={{ fontSize: 14, color: '#65676b' }}>PDF</span>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>Export To PDF</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                          Formatted report for printing or sharing
                        </div>
                      </div>
                      <span style={{ fontSize: 18, opacity: 0.5 }}>›</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Settings View */}
              {activeSection === 'settings' && (
                <div style={styles.activitySection}>
                  <h2 style={styles.sectionTitle}>Bankroll Settings</h2>
                  <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Preferences</h3>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontSize: 14, color: '#fff' }}>Auto-save Sessions</span>
                      <input type="checkbox" checked={preferences.autoSave} onChange={(e) => updatePreference('autoSave', e.target.checked)} style={{ accentColor: '#2374e1' }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                      <span style={{ fontSize: 14, color: '#fff' }}>Notifications</span>
                      <input type="checkbox" checked={preferences.notifications} onChange={(e) => updatePreference('notifications', e.target.checked)} style={{ accentColor: '#2374e1' }} />
                    </label>
                  </div>
                  <button
                    onClick={() => setShowVenueModal(true)}
                    style={{ width: '100%', padding: '14px 18px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}
                  >
                    Manage Venues
                    <span style={{ fontSize: 18, opacity: 0.5 }}>›</span>
                  </button>
                  <button
                    onClick={() => setActiveSection('reports')}
                    style={{ width: '100%', padding: '14px 18px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    Export Data
                    <span style={{ fontSize: 18, opacity: 0.5 }}>›</span>
                  </button>
                </div>
              )}

              {/* Bankroll Rules View */}
              {activeSection === 'rules' && (
                <div style={styles.activitySection}>
                  <BankrollRulesCard userId={userId} />
                </div>
              )}

              {/* Saved Receipts View */}
              {activeSection === 'receipts' && (
                <div style={styles.activitySection}>
                  <SavedReceipts userId={userId} />
                </div>
              )}

              {/* Tax Reports — dedicated view showing only Tax Report Generator */}
              {activeSection === 'tax' && (
                <div style={styles.proToolsContainer}>
                  <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e4e6eb', margin: 0 }}>
                      Tax Reports
                    </h2>
                    <p style={{ fontSize: 12, color: '#b0b3b8', margin: '4px 0 0' }}>Generate Tax Documents For Your Poker Income</p>
                  </div>
                  <BankrollProGate userId={userId}>
                    <div style={{ padding: 16 }}>
                      <TaxReportPanel userId={userId} />
                    </div>
                  </BankrollProGate>
                </div>
              )}

              {/* Staking Tracker — dedicated standalone view */}
              {activeSection === 'staking' && (
                <div style={styles.activitySection}>
                  <BankrollProGate userId={userId}>
                    <StakingTracker userId={userId} />
                  </BankrollProGate>
                </div>
              )}

              {/* Pro Tools View - Gated for non-VIP */}
              {activeSection === 'pro' && (
                <div style={styles.proToolsContainer}>
                  {/* Pro Tools Header */}
                  <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e4e6eb', margin: 0 }}>
                      Pro Tools
                    </h2>
                    <p style={{ fontSize: 12, color: '#b0b3b8', margin: '4px 0 0' }}>Premium Bankroll Features For Serious Players</p>
                  </div>

                  <BankrollProGate userId={userId}>
                    {/* Pro Features Grid - Only visible after unlock or for VIP */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, padding: 16 }}>
                      <StakingTracker userId={userId} />
                      <SeriesTracker userId={userId} />
                      <SessionHandReview userId={userId} />
                    </div>
                  </BankrollProGate>
                </div>
              )}
            </main>
          </div>
        </FeatureGate>
      </div>

      {/* Receipt Scanner Modal */}
      {
        showScanner && (
          <div style={styles.scannerModal}>
            <div style={styles.scannerModalContent}>
              <div style={styles.scannerModalHeader}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>
                  {scannerStep === 'scan' && 'Scan Receipt'}
                  {scannerStep === 'post-capture' && 'Receipt Saved'}
                  {scannerStep === 'pick-entry' && 'Select Entry'}
                </h2>
                <button
                  onClick={() => { setShowScanner(false); setScannerStep('scan'); setScannerEntryId(null); setScannerImageUrl(null); }}
                  style={styles.scannerCloseBtn}
                >
                  ✕
                </button>
              </div>

              {/* Step 1: Scan — camera captures first */}
              {scannerStep === 'scan' && (
                <div>
                  <ReceiptScanner
                    userId={userId}
                    onScanComplete={({ imageUrl }) => {
                      setScannerImageUrl(imageUrl);
                      setScannerStep('post-capture');
                    }}
                  />
                </div>
              )}

              {/* Step 2: Post-capture — choose what to do */}
              {scannerStep === 'post-capture' && scannerImageUrl && (
                <div style={{ padding: 20 }}>
                  {/* Receipt thumbnail */}
                  <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <img
                      src={scannerImageUrl}
                      alt="Receipt"
                      style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>

                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 0, marginBottom: 20, textAlign: 'center' }}>
                    What would you like to do with this receipt?
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <button
                      onClick={() => {
                        // Open LogEntryModal as NEW entry with receipt pre-attached
                        setDefaultReceiptCategory('expense');
                        setDefaultReceiptMedia([scannerImageUrl]);
                        setEditEntry(null);
                        setShowLogModal(true);
                        setShowScanner(false);
                        setScannerStep('scan');
                        setScannerImageUrl(null);
                      }}
                      style={styles.scannerChoiceBtn}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#4ade80' }}>NEW</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>Create New Expense</div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>Log This As A New Expense Entry</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setScannerStep('pick-entry')}
                      style={styles.scannerChoiceBtn}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#60a5fa' }}>ATTACH</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>Attach To Existing Entry</div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>Add This Receipt To A Recent Session Or Expense</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Pick existing entry to attach receipt */}
              {scannerStep === 'pick-entry' && (
                <div style={{ padding: '0 16px 16px' }}>
                  <button
                    onClick={() => setScannerStep('post-capture')}
                    style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 13, cursor: 'pointer', padding: '12px 4px', fontWeight: 500 }}
                  >
                    ← Back
                  </button>
                  {entries.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
                      No entries yet. Create a new expense instead.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                      {entries.slice(0, 20).map((entry) => {
                        const isPositive = entry.net_result >= 0;
                        const dateStr = entry.entry_date
                          ? new Date(entry.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '';
                        const LABELS = { cash: 'Cash Game', tournament: 'Tournament', expense: 'Expense', deposit: 'Deposit', withdrawal: 'Withdrawal', sports_bet: 'Sports Bet' };
                        return (
                          <button
                            key={entry.id}
                            onClick={async () => {
                              try {
                                // Append receipt URL to entry's media_urls
                                const existing = entry.media_urls || [];
                                const updated = [...existing, scannerImageUrl];
                                await supabase
                                  .from('bankroll_ledger')
                                  .update({ media_urls: updated })
                                  .eq('id', entry.id);
                                await loadData();
                                setShowScanner(false);
                                setScannerStep('scan');
                                setScannerEntryId(null);
                                setScannerImageUrl(null);
                              } catch (err) {
                                console.error('Attach failed:', err);
                              }
                            }}
                            style={styles.scannerEntryBtn}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 8, background: isPositive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                                {isPositive ? '✓' : '−'}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {LABELS[entry.category] || entry.category}
                                </div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                                  {dateStr}{entry.location_name ? ` · ${entry.location_name}` : ''}
                                </div>
                              </div>
                            </div>
                            <span style={{ fontSize: 15, fontWeight: 600, color: isPositive ? '#22c55e' : '#ef4444', flexShrink: 0, marginLeft: 8 }}>
                              {isPositive ? '+' : '-'}${Math.abs(entry.net_result).toLocaleString()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
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
              defaultCategory={defaultReceiptCategory}
              defaultMediaUrls={defaultReceiptMedia}
              onClose={() => { setShowLogModal(false); setEditEntry(null); setDefaultReceiptCategory(null); setDefaultReceiptMedia(null); }}
              onSubmit={() => { handleLogSubmit(); setDefaultReceiptCategory(null); setDefaultReceiptMedia(null); }}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 50,
              }}
              onClick={() => setShowLogModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                style={{
                  background: '#1a2a44',
                  borderRadius: 16,
                  padding: '32px 40px',
                  textAlign: 'center',
                  maxWidth: 400,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ marginBottom: 16, color: '#65676b', fontSize: 32 }}>Sign In</div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 12px' }}>Sign In Required</h2>
                <p style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.6)', margin: '0 0 24px' }}>
                  Please sign in to log your poker sessions and track your bankroll.
                </p>
                <button
                  onClick={() => router.push('/login?redirect=/hub/bankroll-manager')}
                  style={{
                    padding: '14px 32px',
                    background: 'linear-gradient(135deg, #2374e1, #1a5fc9)',
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginRight: 12,
                  }}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setShowLogModal(false)}
                  style={{
                    padding: '14px 24px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: 10,
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* Rule Violation Notification Popup */}
      <AnimatePresence>
        {ruleViolations.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(6px)',
              zIndex: 10000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20,
            }}
            onClick={() => setRuleViolations([])}
          >
            <motion.div
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 30 }}
              transition={{ type: 'spring', damping: 20, stiffness: 250 }}
              style={{
                background: 'linear-gradient(160deg, rgba(15,15,30,0.98), rgba(20,10,35,0.98))',
                borderRadius: 16,
                border: '1px solid rgba(239,68,68,0.35)',
                padding: '24px 28px',
                maxWidth: 420,
                width: '100%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(239,68,68,0.1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: ruleViolations.some(v => v.severity === 'high') ? 'rgba(239,68,68,0.2)' : ruleViolations.some(v => v.severity === 'info') ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {ruleViolations.some(v => v.severity === 'high') ? '!' : ruleViolations.some(v => v.severity === 'info') ? '!' : '!'}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>
                    {ruleViolations.some(v => v.severity === 'info') ? 'Goal Reached!' : 'Rule Violation Alert'}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    {ruleViolations.length} rule{ruleViolations.length > 1 ? 's' : ''} triggered
                  </p>
                </div>
              </div>

              {/* Violations List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {ruleViolations.map((v, i) => (
                  <div key={i} style={{
                    background: v.severity === 'high' ? 'rgba(239,68,68,0.08)' : v.severity === 'info' ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
                    border: `1px solid ${v.severity === 'high' ? 'rgba(239,68,68,0.25)' : v.severity === 'info' ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: v.severity === 'high' ? '#f87171' : v.severity === 'info' ? '#4ade80' : '#fbbf24', marginBottom: 4 }}>
                      {v.rule}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                      <span>Limit: {v.limit}</span>
                      <span style={{ fontWeight: 600, color: v.severity === 'high' ? '#ef4444' : v.severity === 'info' ? '#22c55e' : '#f59e0b' }}>
                        Actual: {v.actual}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Dismiss */}
              <button
                onClick={() => setRuleViolations([])}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Got It
              </button>
            </motion.div>
          </motion.div>
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
            onComplete={() => {
              setShowAdjustModal(false);
              loadData();
            }}
            onClose={() => setShowAdjustModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Weekly Summary removed — data is already visible on dashboard */}

      {/* Bankroll Projection Modal */}
      <AnimatePresence>
        {showProjection && (
          <BankrollProjection
            userId={userId}
            currentBankroll={stats?.totalBankroll || 0}
            onClose={() => setShowProjection(false)}
          />
        )}
      </AnimatePresence>
    </PageTransition >
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#18191a',  // Facebook dark background
    fontFamily: 'Inter, -apple-system, sans-serif',
    position: 'relative',
  },
  bgGrid: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: `
      linear-gradient(rgba(136, 136, 136, 0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(136, 136, 136, 0.02) 1px, transparent 1px)
    `,
    backgroundSize: '60px 60px',
    pointerEvents: 'none',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  topBarLeft: {
    display: 'flex',
    gap: 8,
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  dropdownContainer: {
    position: 'relative',
    width: '100%',
  },
  dropdownButton: {
    padding: '8px 16px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dropdownArrow: {
    fontSize: 10,
    opacity: 0.6,
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    background: '#1a2a44',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 4,
    minWidth: 150,
    zIndex: 100,
    maxHeight: 300,
    overflowY: 'auto',
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: '10px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left',
  },
  searchButton: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#fff',
    fontSize: 16,
    cursor: 'pointer',
  },
  mainLayout: {
    display: 'flex',
    minHeight: 'calc(100vh - 140px)',
  },
  sidebar: {
    width: 160,
    padding: '20px 12px',
    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
  },
  sidebarItem: {
    display: 'block',
    width: '100%',
    padding: '10px 14px',
    background: 'transparent',
    border: 'none',
    borderRadius: 8,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    marginBottom: 2,
    textAlign: 'left',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sidebarItemActive: {
    background: 'rgba(35, 116, 225, 0.15)',  // Facebook blue
    color: '#2374e1',
  },
  sidebarIcon: {
    fontSize: 16,
    width: 20,
    textAlign: 'center',
  },
  mainContent: {
    flex: 1,
    padding: '20px 24px',
    minWidth: 0,
    overflowY: 'auto',
  },
  contentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  pageTitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 24,
    fontWeight: 700,
    color: '#fff',
    margin: 0,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  logButton: {
    padding: '10px 24px',
    background: '#2374e1',  // Facebook blue - clean, sleek
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(0, 212, 255, 0.3)',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: '16px 18px',
  },
  statTitle: {
    display: 'block',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 8,
  },
  statValue: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    fontSize: 24,
    fontWeight: 700,
    color: '#fff',
  },
  statLoading: {
    fontSize: 24,
    fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  statChange: {
    fontSize: 14,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  statSuffix: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: 400,
  },
  riskDot: {
    color: '#ef4444',
    fontSize: 12,
  },
  downArrow: {
    fontSize: 10,
  },
  activitySection: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 16,
  },
  filterTabs: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8,
  },
  filterTabsLeft: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
  },
  filterTab: {
    padding: '8px 14px',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  filterTabActive: {
    background: '#2374e1',
    borderColor: '#2374e1',
    color: '#000',
    fontWeight: 600,
  },
  expenseToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: '#2374e1',
  },
  tripSection: {
    marginTop: 24,
  },
  tripTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 12,
  },
  tripCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    cursor: 'pointer',
    marginBottom: 8,
  },
  tripInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  tripName: {
    fontSize: 14,
    fontWeight: 500,
    color: '#fff',
  },
  tripNet: {
    fontSize: 14,
    fontWeight: 700,
  },
  tripExpenses: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  tripArrow: {
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  // assistantPanel removed - right panel eliminated
  scannerModal: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9000,
    padding: 16,
  },
  scannerModalContent: {
    background: '#1a1b1e',
    borderRadius: 16,
    maxWidth: 500,
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  scannerModalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  scannerCloseBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 20,
    cursor: 'pointer',
    padding: 4,
  },
  scannerChoiceBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 18px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    textAlign: 'left',
  },
  scannerEntryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  logTodayButton: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '14px 18px',
    background: 'linear-gradient(135deg, #2374e1, #1a5fc9)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(0, 212, 255, 0.3)',
  },
  logArrow: {
    fontSize: 18,
  },
  reportStatBox: {
    padding: 16,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  reportStatLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  reportStatValue: {
    fontSize: 20,
    fontWeight: 700,
    color: '#fff',
  },
  reportActionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 18px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  // Pro Tools styles - Futuristic Metal UI
  proToolsContainer: {
    position: 'relative',
    padding: 0,
  },
  proToolsHeader: {
    position: 'relative',
    padding: '24px 20px 16px',
    background: 'linear-gradient(180deg, rgba(0,20,40,0.8) 0%, transparent 100%)',
    borderBottom: '1px solid rgba(0,212,255,0.2)',
    marginBottom: 20,
    textAlign: 'center',
  },
  proToolsLed: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 2,
    background: '#2374e1',
    boxShadow: '0 0 10px rgba(0,212,255,0.6), 0 0 20px rgba(0,212,255,0.3)',
  },
  proToolsTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '0.15em',
    color: '#fff',
    margin: '0 0 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  proToolsSubtitle: {
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: '0.1em',
    margin: 0,
  },
  proToolsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
};
