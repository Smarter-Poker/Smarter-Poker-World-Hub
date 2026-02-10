/**
 * BANKROLL MANAGER PAGE
 * /hub/bankroll-manager — Financial Truth Engine
 * Military-grade tracking with immutable ledger and Personal Assistant
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../src/lib/supabase';
import { useAvatar } from '../../src/contexts/AvatarContext';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
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

// Clean Facebook-style navigation (no emojis)
const SIDEBAR_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: '' },
  { id: 'trips', label: 'Trip Tracker', icon: '' },
  { id: 'series', label: 'Series Tracker', icon: '' },
  { id: 'scan-receipt', label: 'Scan Receipt', icon: '' },
  { id: 'players', label: 'Player Notes', icon: '' },
  { id: 'leaks', label: 'Leaks', icon: '' },
  { id: 'reports', label: 'Reports', icon: '' },
  { id: 'pro', label: 'Pro Tools', icon: '' },
  { id: 'settings', label: 'Settings', icon: '' },
];

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
  const [timeFilter, setTimeFilter] = useState('Last 30 Days');
  const [gameTypeFilter, setGameTypeFilter] = useState(new Set(['poker_cash', 'poker_mtt', 'casino_table', 'slots', 'sports']));

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
      const next = new Set(prev);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      return next;
    });
  };

  // Data
  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState([]);
  const [trips, setTrips] = useState([]);
  const [locations, setLocations] = useState([]);
  const [leakAnalysis, setLeakAnalysis] = useState(null);
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [ruleViolations, setRuleViolations] = useState([]);

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
      setEntries(entriesData);
      setTrips(tripsData);
      setLocations(locationsData);
      setLeakAnalysis(leakData);
    } catch (error) {
      console.error('Error loading bankroll data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, locationFilter, timeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      // TODO: Open scan receipt flow
      handleLogClick();
    } else if (sectionId === 'series') {
      router.push('/hub/bankroll-manager?view=series');
    } else {
      setActiveSection(sectionId);
      // Reset category filter when going back to Dashboard
      if (sectionId === 'dashboard') {
        setCategoryFilter('all');
        router.push('/hub/bankroll-manager', undefined, { shallow: true });
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
      <Head>
        <title>Bankroll Manager — Smarter.Poker</title>
        <meta name="description" content="Professional bankroll tracking and financial truth engine" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          .bankroll-page { width: 100%; max-width: 100%; margin: 0 auto; overflow-x: hidden; }
          @keyframes metalGlow { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
          @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
          @keyframes scanLine { 0% { top: 0; } 100% { top: 100%; } }
        `}</style>
      </Head>

      <div className="bankroll-page" style={styles.container}>
        <div style={styles.bgGrid} />
        <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />

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
        <div style={styles.mainLayout}>
          {/* Left Sidebar */}
          <nav style={styles.sidebar}>
            {SIDEBAR_SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => handleSidebarClick(section.id)}
                style={{
                  ...styles.sidebarItem,
                  ...(activeSection === section.id ? styles.sidebarItemActive : {}),
                }}
              >
                <span style={styles.sidebarIcon}>{section.icon}</span>
                <span>{section.id === 'dashboard' && activeSection !== 'dashboard' ? '← Back to Dashboard' : section.label}</span>
              </button>
            ))}
          </nav>

          {/* Main Content - Switches based on activeSection */}
          <main style={styles.mainContent}>
            {/* Header */}
            <div style={styles.contentHeader}>
              <h1 style={styles.pageTitle}>
                {activeSection === 'dashboard' && categoryFilter === 'all' && 'Bankroll Manager'}
                {activeSection === 'dashboard' && categoryFilter !== 'all' && (CATEGORY_LABELS[categoryFilter] || 'Bankroll Manager')}
                {activeSection === 'trips' && 'Trip Tracker'}
                {activeSection === 'players' && 'Player Notes'}
                {activeSection === 'leaks' && 'Leak Analysis'}
                {activeSection === 'reports' && 'Reports'}
                {activeSection === 'pro' && 'Pro Tools'}
                {activeSection === 'settings' && 'Settings'}
              </h1>
              <div style={styles.headerActions}>
                {activeSection !== 'notes' && categoryFilter === 'all' && (
                  <button style={styles.logButton} onClick={handleLogClick}>
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
                {/* Stats Cards */}
                <div style={styles.statsGrid}>
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

                {/* Active Trip Featured Banner */}
                {(() => {
                  const activeTrip = trips.find(t => t.status === 'active');
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
                          {activeTrip.location_name && `📍 ${activeTrip.location_name} · `}
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

                {/* Filters Row */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
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
                      <div style={styles.dropdownMenu}>
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
                      <div style={styles.dropdownMenu}>
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
                      Game Type ({gameTypeFilter.size}) <span style={styles.dropdownArrow}>▼</span>
                    </button>
                    {showGameTypeDropdown && (
                      <div style={{ ...styles.dropdownMenu, minWidth: 200 }}>
                        {['poker_cash', 'poker_mtt', 'casino_table', 'slots', 'sports'].map((cat) => (
                          <button
                            key={cat}
                            style={{
                              ...styles.dropdownItem,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              background: gameTypeFilter.has(cat) ? 'rgba(35, 116, 225, 0.15)' : 'transparent',
                            }}
                            onClick={() => toggleGameType(cat)}
                          >
                            <span style={{
                              width: 16,
                              height: 16,
                              borderRadius: 3,
                              border: gameTypeFilter.has(cat) ? '2px solid #2374e1' : '2px solid rgba(255,255,255,0.3)',
                              background: gameTypeFilter.has(cat) ? '#2374e1' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              color: '#fff',
                              flexShrink: 0,
                            }}>
                              {gameTypeFilter.has(cat) ? '✓' : ''}
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
                      <div style={styles.dropdownMenu}>
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

                {/* Bankroll Trend Chart — filtered by gameTypeFilter, always include expenses */}
                <BankrollTrendChart entries={entries.filter(e => e.category === 'expense' || gameTypeFilter.has(e.category))} isLoading={isLoading} chartType={chartType} />

                {/* Analytics Grid — relocated from right panel */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  <HistoricalComparison entries={entries.filter(e => e.category === 'expense' || gameTypeFilter.has(e.category))} />
                  <VarianceCalculator entries={entries.filter(e => e.category === 'expense' || gameTypeFilter.has(e.category))} />
                  <LocationAnalytics entries={entries.filter(e => e.category === 'expense' || gameTypeFilter.has(e.category))} isLoading={isLoading} />
                </div>

                {/* Recent Activity Section */}
                <div style={styles.activitySection}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, cursor: 'pointer' }}
                    onClick={() => setShowAllEntries(!showAllEntries)}
                  >
                    <h2 style={styles.sectionTitle}>Recent Activity</h2>
                    {entries.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowAllEntries(!showAllEntries); }}
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
                        {showAllEntries ? 'Show Less' : `View All (${entries.length})`}
                      </button>
                    )}
                  </div>

                  {/* Ledger Timeline — shows last 5 or all */}
                  <LedgerTimeline
                    entries={showAllEntries ? entries : entries.slice(0, 5)}
                    isLoading={isLoading}
                    onEdit={handleEditEntry}
                    onDelete={handleDeleteEntry}
                  />

                  {/* Trip Expenses Section */}
                  {trips.length > 0 && (
                    <div style={styles.tripSection}>
                      <h3 style={styles.tripTitle}>Trip Expenses</h3>
                      {trips.slice(0, 3).map((trip) => (
                        <div key={trip.id} style={styles.tripCard}>
                          <div style={styles.tripInfo}>
                            <span style={styles.tripName}>{trip.name}:</span>
                            <span
                              style={{
                                ...styles.tripNet,
                                color: (trip.totalNet || 0) >= 0 ? '#22c55e' : '#ef4444',
                              }}
                            >
                              {(trip.totalNet || 0) >= 0 ? '+' : '~-'}$
                              {Math.abs(trip.totalNet || 0).toLocaleString()}
                            </span>
                            <span style={styles.tripExpenses}>
                              Net / ${(trip.totalExpenses || 0).toLocaleString()} Expenses
                            </span>
                          </div>
                          <span style={styles.tripArrow}>›</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Trip Tracker View */}
            {activeSection === 'trips' && (
              <TripTracker
                userId={userId}
                onOpenLog={handleLogClick}
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
                    <p style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.5)', margin: 0 }}>Keep logging sessions to build your analysis history</p>
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
                  currentBankroll={stats?.currentBankroll || 0}
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
                    <span style={styles.reportStatValue}>{entries?.length || 0}</span>
                  </div>
                  <div style={styles.reportStatBox}>
                    <span style={styles.reportStatLabel}>Win Rate</span>
                    <span style={styles.reportStatValue}>
                      {entries?.length > 0
                        ? Math.round((entries.filter(e => (e.gross_out - e.gross_in) > 0).length / entries.length) * 100)
                        : 0}%
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
                      ${entries?.length > 0
                        ? Math.round(entries.reduce((sum, e) => sum + (e.gross_out - e.gross_in), 0) / entries.length)
                        : 0}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Run Projection */}
                  <button
                    onClick={() => setShowProjection(true)}
                    style={styles.reportActionBtn}
                  >
                    <span style={{ fontSize: 14, color: '#65676b' }}>Projection</span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>Run Projection</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                        Monte Carlo simulation for bankroll growth
                      </div>
                    </div>
                    <span style={{ fontSize: 18, opacity: 0.5 }}>›</span>
                  </button>

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
                        if (data.success && data.csv) {
                          const blob = new Blob([data.csv], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `bankroll_export_${new Date().toISOString().split('T')[0]}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }
                      } catch (err) {
                        console.error('Export failed:', err);
                      }
                    }}
                    style={styles.reportActionBtn}
                  >
                    <span style={{ fontSize: 24 }}>📥</span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>Export to CSV</div>
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
                        if (data.success) {
                          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `bankroll_export_${new Date().toISOString().split('T')[0]}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }
                      } catch (err) {
                        console.error('Export failed:', err);
                      }
                    }}
                    style={styles.reportActionBtn}
                  >
                    <span style={{ fontSize: 14, color: '#65676b' }}>JSON</span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>Export to JSON</div>
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
                      <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>Export to PDF</div>
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
                    <span style={{ fontSize: 14, color: '#fff' }}>Auto-save sessions</span>
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

            {/* Pro Tools View - Gated for non-VIP */}
            {activeSection === 'pro' && (
              <div style={styles.proToolsContainer}>
                {/* Pro Tools Header */}
                <div style={styles.proToolsHeader}>
                  <div style={styles.proToolsLed} />
                  <h2 style={styles.proToolsTitle}>
                    PRO TOOLS
                  </h2>
                  <p style={styles.proToolsSubtitle}>Premium bankroll features for serious players</p>
                </div>

                <BankrollProGate userId={userId}>
                  {/* Pro Features Grid - Only visible after unlock or for VIP */}
                  <div style={styles.proToolsGrid}>
                    <ReceiptScanner userId={userId} onScanComplete={loadData} />
                    <TaxReportPanel userId={userId} />
                    <StakingTracker userId={userId} />
                    <SeriesTracker userId={userId} />
                    <SessionHandReview userId={userId} />
                  </div>
                </BankrollProGate>
              </div>
            )}
          </main>

          {/* Right Sidebar - Assistant Panel */}
          <aside style={styles.assistantPanel}>
            {/* Jarvis AI Insights */}
            <JarvisLeakInsights userId={userId} onRefresh={loadData} />

            {/* Analytics widgets moved to main dashboard content area */}
          </aside>
        </div>
      </div>

      {/* Manage Venues Modal */}
      {showVenueModal && userId && (
        <ManageVenuesModal
          userId={userId}
          onClose={() => setShowVenueModal(false)}
          onUpdate={loadData}
        />
      )}

      {/* Log Entry Modal - Shows login prompt if not authenticated */}
      <AnimatePresence>
        {showLogModal && (
          userId ? (
            <LogEntryModal
              userId={userId}
              locations={locations}
              trips={trips}
              editEntry={editEntry}
              onClose={() => { setShowLogModal(false); setEditEntry(null); }}
              onSubmit={handleLogSubmit}
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
                  {ruleViolations.some(v => v.severity === 'high') ? '⚠️' : ruleViolations.some(v => v.severity === 'info') ? '🎯' : '⚡'}
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
            currentBankroll={stats?.currentBankroll || 0}
            onClose={() => setShowProjection(false)}
          />
        )}
      </AnimatePresence>
    </PageTransition>
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
  },
  dropdownButton: {
    padding: '8px 16px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
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
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '12px 14px',
    background: 'transparent',
    border: 'none',
    borderRadius: 8,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    cursor: 'pointer',
    marginBottom: 4,
    textAlign: 'left',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
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
  assistantPanel: {
    width: 220,
    padding: '20px 16px',
    borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
    overflowY: 'auto',
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
