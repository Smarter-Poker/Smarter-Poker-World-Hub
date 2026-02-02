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
} from '../../src/lib/bankroll/bankrollSelectors';

// Bankroll components
import LedgerTimeline from '../../src/components/bankroll/LedgerTimeline';
import LogEntryModal from '../../src/components/bankroll/LogEntryModal';
import LeakAlertPanel from '../../src/components/bankroll/LeakAlertPanel';
import BankrollRulesCard from '../../src/components/bankroll/BankrollRulesCard';
import BankrollTrendChart from '../../src/components/bankroll/BankrollTrendChart';
import QuickLogWidget from '../../src/components/bankroll/QuickLogWidget';
import BankrollStreaks from '../../src/components/bankroll/BankrollStreaks';
import JarvisLeakInsights from '../../src/components/bankroll/JarvisLeakInsights';
// Phase 2 Components
import BankrollGoals from '../../src/components/bankroll/BankrollGoals';
import LocationAnalytics from '../../src/components/bankroll/LocationAnalytics';
import WeeklySummary from '../../src/components/bankroll/WeeklySummary';
import BankrollProjection from '../../src/components/bankroll/BankrollProjection';
import PlayerNotes from '../../src/components/bankroll/PlayerNotes';

const SIDEBAR_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: '◎' },
  { id: 'log-session', label: 'Log Session', icon: '' },
  { id: 'trips', label: 'Trips & Expenses', icon: '✈' },
  { id: 'players', label: 'Player Notes', icon: '🎯' },
  { id: 'leaks', label: 'Leaks', icon: '⚠' },
  { id: 'reports', label: 'Reports', icon: '' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'poker_cash', label: 'Cash' },
  { id: 'poker_mtt', label: 'MTT' },
  { id: 'casino_table', label: 'Table' },
  { id: 'slots', label: 'Slots' },
  { id: 'sports', label: 'Sports' },
  { id: 'expense', label: 'Expenses' },
];

const TIME_FILTERS = ['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'This Year', 'All Time'];

function StatCard({ title, value, change, suffix, isRisk, isLoading }) {
  const getRiskColor = (risk) => {
    if (risk === 'HIGH') return '#ef4444';
    if (risk === 'MEDIUM') return '#eab308';
    return '#22c55e';
  };

  return (
    <div style={styles.statCard}>
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

  // Handle query parameters for deep linking
  useEffect(() => {
    if (router.query.view) {
      setActiveSection(router.query.view);
    }
    if (router.query.type) {
      setCategoryFilter(router.query.type);
    }
  }, [router.query]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showProjection, setShowProjection] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

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
  const [includeExpenses, setIncludeExpenses] = useState(false);

  // Dropdowns
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);

  // Data
  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState([]);
  const [trips, setTrips] = useState([]);
  const [locations, setLocations] = useState([]);
  const [leakAnalysis, setLeakAnalysis] = useState(null);

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
          category: categoryFilter,
          locationId: locationFilter,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          includeExpenses: includeExpenses || categoryFilter === 'expense',
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
  }, [userId, categoryFilter, locationFilter, timeFilter, includeExpenses]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogSubmit = async () => {
    setShowLogModal(false);
    await loadData();
  };

  const handleSidebarClick = (sectionId) => {
    if (sectionId === 'log-session') {
      setShowLogModal(true);
    } else {
      setActiveSection(sectionId);
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
    setCurrencyEUR: (val) => updatePreference('currencyEUR', val)
  });

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClick = () => {
      setShowLocationDropdown(false);
      setShowTimeDropdown(false);
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
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          .bankroll-page { width: 100%; max-width: 100%; margin: 0 auto; overflow-x: hidden; }
          
          
          
          
          
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

        {/* Top Bar with Filters */}
        <div style={styles.topBar}>
          <div style={styles.topBarLeft}>
            {/* Location Dropdown */}
            <div style={styles.dropdownContainer} onClick={(e) => e.stopPropagation()}>
              <button
                style={styles.dropdownButton}
                onClick={() => {
                  setShowLocationDropdown(!showLocationDropdown);
                  setShowTimeDropdown(false);
                }}
              >
                {selectedLocationName} <span style={styles.dropdownArrow}>▼</span>
              </button>
              {showLocationDropdown && (
                <div style={styles.dropdownMenu}>
                  <button
                    style={styles.dropdownItem}
                    onClick={() => {
                      setLocationFilter(null);
                      setShowLocationDropdown(false);
                    }}
                  >
                    All Locations
                  </button>
                  {locations.map((loc) => (
                    <button
                      key={loc.id}
                      style={styles.dropdownItem}
                      onClick={() => {
                        setLocationFilter(loc.id);
                        setShowLocationDropdown(false);
                      }}
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
                      onClick={() => {
                        setTimeFilter(tf);
                        setShowTimeDropdown(false);
                      }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={styles.topBarRight}>
            <button style={styles.searchButton}></button>
          </div>
        </div>

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
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          {/* Main Content - Switches based on activeSection */}
          <main style={styles.mainContent}>
            {/* Header */}
            <div style={styles.contentHeader}>
              <h1 style={styles.pageTitle}>
                {activeSection === 'dashboard' && 'Bankroll Manager'}
                {activeSection === 'trips' && 'Trips & Expenses'}
                {activeSection === 'players' && 'Player Notes'}
                {activeSection === 'leaks' && 'Leak Analysis'}
                {activeSection === 'reports' && 'Reports'}
                {activeSection === 'settings' && 'Settings'}
              </h1>
              <div style={styles.headerActions}>
                <button style={styles.logButton} onClick={() => setShowLogModal(true)}>
                  + Log
                </button>
              </div>
            </div>

            {/* Dashboard View */}
            {activeSection === 'dashboard' && (
              <>
                {/* Stats Cards */}
                <div style={styles.statsGrid}>
                  <StatCard
                    title="Total Bankroll"
                    value={stats ? `$${stats.totalBankroll.toLocaleString()}` : '—'}
                    change={stats?.allInNet}
                    isLoading={isLoading}
                  />
                  <StatCard
                    title="All-In Net"
                    value={
                      stats
                        ? `${stats.allInNet < 0 ? '-' : ''}$${Math.abs(stats.allInNet).toLocaleString()}`
                        : '—'
                    }
                    isLoading={isLoading}
                  />
                  <StatCard
                    title="Leak Risk"
                    value={stats?.leakRisk || 'LOW'}
                    isRisk={true}
                    isLoading={isLoading}
                  />
                  <StatCard
                    title="Travel ROI"
                    value={
                      stats
                        ? `${stats.travelROI < 0 ? '-' : ''}$${Math.abs(stats.travelROI).toLocaleString()}`
                        : '—'
                    }
                    suffix="Last Trip"
                    isLoading={isLoading}
                  />
                </div>

                {/* Quick Log Widget */}
                <QuickLogWidget
                  userId={userId}
                  onSubmit={handleLogSubmit}
                  onOpenFullModal={() => setShowLogModal(true)}
                />

                {/* Bankroll Trend Chart */}
                <BankrollTrendChart entries={entries} isLoading={isLoading} />

                {/* Recent Activity Section */}
                <div style={styles.activitySection}>
                  <h2 style={styles.sectionTitle}>Recent Activity</h2>

                  {/* Filter Tabs */}
                  <div style={styles.filterTabs}>
                    <div style={styles.filterTabsLeft}>
                      {CATEGORY_FILTERS.map((filter) => (
                        <button
                          key={filter.id}
                          onClick={() => setCategoryFilter(filter.id)}
                          style={{
                            ...styles.filterTab,
                            ...(categoryFilter === filter.id ? styles.filterTabActive : {}),
                          }}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                    <label style={styles.expenseToggle}>
                      <input
                        type="checkbox"
                        checked={includeExpenses}
                        onChange={(e) => setIncludeExpenses(e.target.checked)}
                        style={styles.checkbox}
                      />
                      Include Expenses
                    </label>
                  </div>

                  {/* Ledger Timeline */}
                  <LedgerTimeline entries={entries} isLoading={isLoading} />

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

            {/* Trips View */}
            {activeSection === 'trips' && (
              <div style={styles.activitySection}>
                <h2 style={styles.sectionTitle}>All Trips</h2>
                {trips.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>✈️</div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 8px' }}>No trips yet</p>
                    <p style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.5)', margin: 0 }}>Create a trip to track travel expenses and poker winnings together</p>
                  </div>
                ) : (
                  trips.map((trip) => (
                    <div key={trip.id} style={styles.tripCard}>
                      <div style={styles.tripInfo}>
                        <span style={styles.tripName}>{trip.name}:</span>
                        <span style={{ ...styles.tripNet, color: (trip.totalNet || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                          {(trip.totalNet || 0) >= 0 ? '+' : '-'}${Math.abs(trip.totalNet || 0).toLocaleString()}
                        </span>
                        <span style={styles.tripExpenses}>Net / ${(trip.totalExpenses || 0).toLocaleString()} Expenses</span>
                      </div>
                      <span style={styles.tripArrow}>›</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Leaks View */}
            {activeSection === 'leaks' && (
              <div style={styles.activitySection}>
                <h2 style={styles.sectionTitle}>Leak Analysis</h2>
                {!leakAnalysis || leakAnalysis.topLeaks?.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>✅</div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: '#22c55e', margin: '0 0 8px' }}>No Leaks Detected</p>
                    <p style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.5)', margin: 0 }}>Keep logging sessions to build your analysis history</p>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: 16, background: leakAnalysis.leakRisk === 'HIGH' ? 'rgba(239, 68, 68, 0.1)' : leakAnalysis.leakRisk === 'MEDIUM' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(34, 197, 94, 0.1)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ fontSize: 32 }}>{leakAnalysis.leakRisk === 'HIGH' ? '🚨' : leakAnalysis.leakRisk === 'MEDIUM' ? '⚠️' : '✅'}</span>
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
                    <span style={{ fontSize: 24 }}>📈</span>
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
                    <span style={{ fontSize: 24 }}>📄</span>
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
                    <span style={{ fontSize: 24 }}>📑</span>
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
                    <input type="checkbox" checked={preferences.autoSave} onChange={(e) => updatePreference('autoSave', e.target.checked)} style={{ accentColor: '#00D4FF' }} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                    <span style={{ fontSize: 14, color: '#fff' }}>Notifications</span>
                    <input type="checkbox" checked={preferences.notifications} onChange={(e) => updatePreference('notifications', e.target.checked)} style={{ accentColor: '#00D4FF' }} />
                  </label>
                </div>
                <button
                  onClick={() => setActiveSection('reports')}
                  style={{ width: '100%', padding: '14px 18px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  Export Data
                  <span style={{ fontSize: 18, opacity: 0.5 }}>›</span>
                </button>
              </div>
            )}
          </main>

          {/* Right Sidebar - Assistant Panel */}
          <aside style={styles.assistantPanel}>
            {/* Jarvis AI Insights */}
            <JarvisLeakInsights userId={userId} onRefresh={loadData} />

            {/* Streaks & Gamification */}
            <BankrollStreaks userId={userId} isLoading={isLoading} />

            {/* Goals */}
            <BankrollGoals
              userId={userId}
              currentBankroll={stats?.currentBankroll || 0}
              periodPL={stats?.monthlyPL || 0}
            />

            {/* Location Analytics */}
            <LocationAnalytics entries={entries} isLoading={isLoading} />

            <LeakAlertPanel
              leakAnalysis={leakAnalysis}
              locationId={locationFilter}
              isLoading={isLoading}
            />

            <BankrollRulesCard userId={userId} />

            <button style={styles.logTodayButton} onClick={() => setShowLogModal(true)}>
              Log Today's Session
              <span style={styles.logArrow}>›</span>
            </button>
          </aside>
        </div>
      </div>

      {/* Log Entry Modal - Shows login prompt if not authenticated */}
      <AnimatePresence>
        {showLogModal && (
          userId ? (
            <LogEntryModal
              userId={userId}
              locations={locations}
              trips={trips}
              onClose={() => setShowLogModal(false)}
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
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 12px' }}>Sign In Required</h2>
                <p style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.6)', margin: '0 0 24px' }}>
                  Please sign in to log your poker sessions and track your bankroll.
                </p>
                <button
                  onClick={() => router.push('/login?redirect=/hub/bankroll-manager')}
                  style={{
                    padding: '14px 32px',
                    background: 'linear-gradient(135deg, #00D4FF, #0099cc)',
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

      {/* Weekly Summary Pop-up (auto-shows once per week) */}
      <WeeklySummary
        userId={userId}
        entries={entries}
        stats={stats}
      />

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
    background: '#0a1628',
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
  },
  sidebarItemActive: {
    background: 'rgba(0, 212, 255, 0.1)',
    color: '#00D4FF',
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
    background: 'linear-gradient(135deg, #00D4FF, #0099cc)',
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
    gridTemplateColumns: 'repeat(4, 1fr)',
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
    background: '#00D4FF',
    borderColor: '#00D4FF',
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
    accentColor: '#00D4FF',
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
    background: 'linear-gradient(135deg, #00D4FF, #0099cc)',
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
};
