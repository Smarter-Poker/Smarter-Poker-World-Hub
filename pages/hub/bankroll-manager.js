/* ═══════════════════════════════════════════════════════════════════════════
   BANKROLL MANAGER — Financial Truth Engine for Gamblers
   Military-grade tracking with immutable ledger and Personal Assistant
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../src/lib/supabase';
import { useAvatar } from '../../src/contexts/AvatarContext';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY ICONS
// ═══════════════════════════════════════════════════════════════════════════
const CategoryIcons = {
  poker_cash: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#22c55e" />
      <circle cx="12" cy="12" r="6" fill="#16a34a" />
      <circle cx="12" cy="12" r="2" fill="#22c55e" />
    </svg>
  ),
  poker_mtt: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L15 8H21L16 12L18 19L12 15L6 19L8 12L3 8H9L12 2Z" fill="#eab308" />
    </svg>
  ),
  casino_table: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="20" height="12" rx="2" fill="#dc2626" />
      <circle cx="8" cy="12" r="2" fill="#fff" />
      <circle cx="16" cy="12" r="2" fill="#fff" />
    </svg>
  ),
  slots: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="2" fill="#f97316" />
      <rect x="5" y="7" width="4" height="6" fill="#fff" rx="1" />
      <rect x="10" y="7" width="4" height="6" fill="#fff" rx="1" />
      <rect x="15" y="7" width="4" height="6" fill="#fff" rx="1" />
    </svg>
  ),
  sports: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#f97316" stroke="#fff" strokeWidth="1" />
      <path d="M12 2C12 2 8 6 8 12C8 18 12 22 12 22" stroke="#fff" strokeWidth="1.5" />
      <path d="M12 2C12 2 16 6 16 12C16 18 12 22 12 22" stroke="#fff" strokeWidth="1.5" />
      <line x1="2" y1="12" x2="22" y2="12" stroke="#fff" strokeWidth="1.5" />
    </svg>
  ),
  expense: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L4 6V12C4 16 8 20 12 22C16 20 20 16 20 12V6L12 2Z" fill="#6b7280" />
      <path d="M9 12L11 14L15 10" stroke="#fff" strokeWidth="2" />
    </svg>
  ),
  flight: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M21 16V14L13 9V3.5C13 2.67 12.33 2 11.5 2C10.67 2 10 2.67 10 3.5V9L2 14V16L10 13.5V19L8 20.5V22L11.5 21L15 22V20.5L13 19V13.5L21 16Z" fill="#6b7280" />
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA (Replace with Supabase queries)
// ═══════════════════════════════════════════════════════════════════════════
const MOCK_STATS = {
  totalBankroll: 18420,
  bankrollChange: 520,
  allInNet: -1580,
  leakRisk: 'HIGH',
  travelROI: -760,
};

const MOCK_ENTRIES = [
  {
    id: 1,
    category: 'poker_cash',
    label: 'Poker Cash',
    amount: 420,
    duration: 4.2,
    location: 'Rivers Casino',
    date: new Date(),
    details: null,
  },
  {
    id: 2,
    category: 'casino_table',
    label: 'Blackjack',
    amount: -300,
    duration: 1.1,
    location: 'Rivers Casino',
    date: new Date(Date.now() - 86400000),
    details: 'Pit Game',
  },
  {
    id: 3,
    category: 'expense',
    label: 'Flight Expense',
    amount: -350,
    duration: null,
    location: null,
    date: new Date(Date.now() - 86400000 * 2),
    details: 'LAX to PIT',
  },
  {
    id: 4,
    category: 'sports',
    label: 'Sports Bet',
    amount: -200,
    duration: null,
    location: null,
    date: new Date(Date.now() - 86400000 * 3),
    details: 'MLB Parlay — Lost',
  },
];

const MOCK_TRIPS = [
  {
    id: 1,
    name: 'Vegas Trip',
    netResult: -1280,
    expenses: 725,
  },
];

const MOCK_ALERTS = [
  {
    id: 1,
    type: 'venue',
    icon: '◆',
    color: '#eab308',
    title: 'Venue Warning',
    value: '-$4,380',
    subtitle: 'Lifetime at Rivers Casino',
  },
  {
    id: 2,
    type: 'leak',
    icon: '●',
    color: '#ef4444',
    title: 'Slots Losses Here:',
    value: '42%',
    subtitle: 'of Total Loses',
  },
  {
    id: 3,
    type: 'risk',
    icon: '▲',
    color: '#eab308',
    title: '5/10 Risk:',
    value: '-$18/hr',
    subtitle: 'over 94 hours',
  },
];

const MOCK_RULES = [
  { id: 1, label: 'Stop Loss:', value: '$1,000 / day', active: true },
  { id: 2, label: 'Max Buy-In:', value: '5% of bankroll', active: true },
];

const MOCK_LOCATIONS = ['Rivers Casino', 'Bellagio', 'Aria', 'Wynn', 'All Locations'];
const MOCK_TIME_FILTERS = ['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'This Year', 'All Time'];

// ═══════════════════════════════════════════════════════════════════════════
// LOG SESSION MODAL
// ═══════════════════════════════════════════════════════════════════════════
function LogSessionModal({ isOpen, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    category: 'poker_cash',
    amount: '',
    location: '',
    duration: '',
    stakes: '',
    notes: '',
    date: new Date().toISOString().split('T')[0],
  });

  const categories = [
    { value: 'poker_cash', label: 'Poker Cash Game' },
    { value: 'poker_mtt', label: 'Poker Tournament' },
    { value: 'casino_table', label: 'Casino Table Game' },
    { value: 'slots', label: 'Slots' },
    { value: 'sports', label: 'Sports Bet' },
    { value: 'expense', label: 'Expense' },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={styles.modalOverlay}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Log Session</h2>
          <button onClick={onClose} style={styles.modalClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.modalForm}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              style={styles.formSelect}
            >
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Amount ($)</label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="e.g., 420 or -300"
                style={styles.formInput}
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                style={styles.formInput}
                required
              />
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g., Rivers Casino"
                style={styles.formInput}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Duration (hrs)</label>
              <input
                type="number"
                step="0.1"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                placeholder="e.g., 4.2"
                style={styles.formInput}
              />
            </div>
          </div>

          {(formData.category === 'poker_cash' || formData.category === 'poker_mtt') && (
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Stakes / Buy-in</label>
              <input
                type="text"
                value={formData.stakes}
                onChange={(e) => setFormData({ ...formData, stakes: e.target.value })}
                placeholder="e.g., 2/5 NL or $200 MTT"
                style={styles.formInput}
              />
            </div>
          )}

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Notes (optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any additional details..."
              style={styles.formTextarea}
            />
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" style={styles.submitButton}>
              Log Entry
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function StatCard({ title, value, change, changeColor, suffix, isRisk }) {
  return (
    <div style={styles.statCard}>
      <span style={styles.statTitle}>{title}</span>
      <div style={styles.statValue}>
        <span style={{ color: isRisk ? (value === 'HIGH' ? '#ef4444' : value === 'MEDIUM' ? '#eab308' : '#22c55e') : '#fff' }}>
          {value}
        </span>
        {isRisk && value === 'HIGH' && <span style={styles.riskDot}>●</span>}
        {change !== undefined && (
          <span style={{ ...styles.statChange, color: changeColor || (change >= 0 ? '#22c55e' : '#ef4444') }}>
            {change >= 0 ? '+' : ''}{typeof change === 'number' ? `$${Math.abs(change).toLocaleString()}` : change}
            {change < 0 && <span style={styles.downArrow}>▼</span>}
          </span>
        )}
        {suffix && <span style={styles.statSuffix}>{suffix}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY ENTRY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function ActivityEntry({ entry }) {
  const isToday = new Date(entry.date).toDateString() === new Date().toDateString();
  const dateLabel = isToday ? 'Today:' : new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ':';

  return (
    <div style={styles.activityEntry}>
      <div style={styles.entryIcon}>
        {CategoryIcons[entry.category] || CategoryIcons.expense}
      </div>
      <div style={styles.entryContent}>
        <span style={styles.entryDate}>{dateLabel}</span>
        <span style={styles.entryLabel}>{entry.label}</span>
        <span style={{ ...styles.entryAmount, color: entry.amount >= 0 ? '#22c55e' : '#ef4444' }}>
          {entry.amount >= 0 ? '+' : ''}{entry.amount < 0 ? '-' : ''}${Math.abs(entry.amount).toLocaleString()}
        </span>
        {entry.duration && (
          <span style={styles.entryDuration}>({entry.duration} hrs)</span>
        )}
        {entry.location && (
          <span style={styles.entryLocation}>at {entry.location}</span>
        )}
        {entry.details && !entry.location && (
          <span style={styles.entryDetails}>{entry.details}</span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BANKROLL MANAGER PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function BankrollManagerPage() {
  const router = useRouter();
  const { user } = useAvatar();

  // State
  const [activeSection, setActiveSection] = useState('dashboard');
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedLocation, setSelectedLocation] = useState('Rivers Casino');
  const [selectedTimeFilter, setSelectedTimeFilter] = useState('Last 30 Days');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [entries, setEntries] = useState(MOCK_ENTRIES);
  const [stats, setStats] = useState(MOCK_STATS);

  // Filter entries based on active filter
  const filteredEntries = entries.filter((entry) => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Cash') return entry.category === 'poker_cash';
    if (activeFilter === 'MTT') return entry.category === 'poker_mtt';
    if (activeFilter === 'Table') return entry.category === 'casino_table';
    if (activeFilter === 'Slots') return entry.category === 'slots';
    if (activeFilter === 'Sports') return entry.category === 'sports';
    if (activeFilter === 'Expenses') return entry.category === 'expense';
    return true;
  });

  const handleLogSession = (formData) => {
    const newEntry = {
      id: Date.now(),
      category: formData.category,
      label: formData.category.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      amount: parseFloat(formData.amount),
      duration: formData.duration ? parseFloat(formData.duration) : null,
      location: formData.location || null,
      date: new Date(formData.date),
      details: formData.notes || null,
    };
    setEntries([newEntry, ...entries]);
    // Update stats
    setStats((prev) => ({
      ...prev,
      totalBankroll: prev.totalBankroll + parseFloat(formData.amount),
      bankrollChange: prev.bankrollChange + parseFloat(formData.amount),
    }));
  };

  const sidebarSections = [
    { id: 'dashboard', label: 'Dashboard', icon: '◎' },
    { id: 'log-session', label: 'Log Session', icon: '📝' },
    { id: 'trips', label: 'Trips & Expenses', icon: '✈' },
    { id: 'leaks', label: 'Leaks', icon: '⚠' },
    { id: 'reports', label: 'Reports', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  const filters = ['All', 'Cash', 'MTT', 'Table', 'Slots', 'Sports', 'Expenses'];

  return (
    <PageTransition>
      <Head>
        <title>Bankroll Manager — Smarter.Poker</title>
        <meta name="description" content="Professional bankroll tracking and financial truth engine" />
        <meta name="viewport" content="width=800, user-scalable=no" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          .bankroll-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
          @media (max-width: 500px) { .bankroll-page { zoom: 0.5; } }
          @media (min-width: 501px) and (max-width: 700px) { .bankroll-page { zoom: 0.75; } }
          @media (min-width: 701px) and (max-width: 900px) { .bankroll-page { zoom: 0.95; } }
          @media (min-width: 901px) { .bankroll-page { zoom: 1.2; } }
          @media (min-width: 1400px) { .bankroll-page { zoom: 1.5; } }
        `}</style>
      </Head>

      <div className="bankroll-page" style={styles.container}>
        {/* Background Grid */}
        <div style={styles.bgGrid} />

        {/* Universal Header */}
        <UniversalHeader pageDepth={2} />

        {/* Top Bar with Filters */}
        <div style={styles.topBar}>
          <div style={styles.topBarLeft}>
            {/* Location Dropdown */}
            <div style={styles.dropdownContainer}>
              <button
                style={styles.dropdownButton}
                onClick={() => setShowLocationDropdown(!showLocationDropdown)}
              >
                {selectedLocation} <span style={styles.dropdownArrow}>▼</span>
              </button>
              {showLocationDropdown && (
                <div style={styles.dropdownMenu}>
                  {MOCK_LOCATIONS.map((loc) => (
                    <button
                      key={loc}
                      style={styles.dropdownItem}
                      onClick={() => {
                        setSelectedLocation(loc);
                        setShowLocationDropdown(false);
                      }}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Time Filter Dropdown */}
            <div style={styles.dropdownContainer}>
              <button
                style={styles.dropdownButton}
                onClick={() => setShowTimeDropdown(!showTimeDropdown)}
              >
                {selectedTimeFilter} <span style={styles.dropdownArrow}>▼</span>
              </button>
              {showTimeDropdown && (
                <div style={styles.dropdownMenu}>
                  {MOCK_TIME_FILTERS.map((tf) => (
                    <button
                      key={tf}
                      style={styles.dropdownItem}
                      onClick={() => {
                        setSelectedTimeFilter(tf);
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
            <button style={styles.searchButton}>🔍</button>
            <div style={styles.profileIcon}>👤</div>
          </div>
        </div>

        {/* Main Layout */}
        <div style={styles.mainLayout}>
          {/* Left Sidebar */}
          <nav style={styles.sidebar}>
            {sidebarSections.map((section) => (
              <button
                key={section.id}
                onClick={() => {
                  if (section.id === 'log-session') {
                    setShowLogModal(true);
                  } else {
                    setActiveSection(section.id);
                  }
                }}
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

          {/* Main Content */}
          <main style={styles.mainContent}>
            {/* Header */}
            <div style={styles.contentHeader}>
              <h1 style={styles.pageTitle}>Bankroll Manager</h1>
              <div style={styles.headerActions}>
                <button
                  style={styles.logButton}
                  onClick={() => setShowLogModal(true)}
                >
                  + Log
                </button>
                <div style={styles.headerAvatar}>👤</div>
              </div>
            </div>

            {/* Stats Cards */}
            <div style={styles.statsGrid}>
              <StatCard
                title="Total Bankroll"
                value={`$${stats.totalBankroll.toLocaleString()}`}
                change={stats.bankrollChange}
              />
              <StatCard
                title="All-In Net"
                value={`${stats.allInNet < 0 ? '-' : ''}$${Math.abs(stats.allInNet).toLocaleString()}`}
                change={stats.allInNet}
                changeColor="#ef4444"
              />
              <StatCard
                title="Leak Risk"
                value={stats.leakRisk}
                isRisk={true}
              />
              <StatCard
                title="Travel ROI"
                value={`${stats.travelROI < 0 ? '-' : ''}$${Math.abs(stats.travelROI).toLocaleString()}`}
                suffix="Last Trip"
              />
            </div>

            {/* Recent Activity Section */}
            <div style={styles.activitySection}>
              <h2 style={styles.sectionTitle}>Recent Activity</h2>

              {/* Filter Tabs */}
              <div style={styles.filterTabs}>
                <div style={styles.filterTabsLeft}>
                  {filters.map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      style={{
                        ...styles.filterTab,
                        ...(activeFilter === filter ? styles.filterTabActive : {}),
                      }}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
                <button style={styles.filterButton}>
                  Filter <span style={styles.dropdownArrow}>▼</span>
                </button>
              </div>

              {/* Activity List */}
              <div style={styles.activityList}>
                {filteredEntries.map((entry) => (
                  <ActivityEntry key={entry.id} entry={entry} />
                ))}
              </div>

              {/* Trip Expenses Section */}
              <div style={styles.tripSection}>
                <h3 style={styles.tripTitle}>Trip Expenses</h3>
                {MOCK_TRIPS.map((trip) => (
                  <div key={trip.id} style={styles.tripCard}>
                    <div style={styles.tripInfo}>
                      <span style={styles.tripName}>{trip.name}:</span>
                      <span style={styles.tripNet}>
                        ~{trip.netResult < 0 ? '-' : ''}${Math.abs(trip.netResult).toLocaleString()}
                      </span>
                      <span style={styles.tripExpenses}>Net / ${trip.expenses.toLocaleString()} Expenses</span>
                    </div>
                    <span style={styles.tripArrow}>›</span>
                  </div>
                ))}
              </div>
            </div>
          </main>

          {/* Right Sidebar - Assistant Panel */}
          <aside style={styles.assistantPanel}>
            {/* Assistant Alerts */}
            <div style={styles.alertsSection}>
              <h3 style={styles.assistantTitle}>Assistant Alerts</h3>
              {MOCK_ALERTS.map((alert) => (
                <div key={alert.id} style={styles.alertItem}>
                  <span style={{ ...styles.alertIcon, color: alert.color }}>{alert.icon}</span>
                  <div style={styles.alertContent}>
                    <span style={styles.alertTitle}>{alert.title}</span>
                    <span style={{ ...styles.alertValue, color: alert.color }}>{alert.value}</span>
                    <span style={styles.alertSubtitle}>{alert.subtitle}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Bankroll Rules */}
            <div style={styles.rulesSection}>
              <h3 style={styles.assistantTitle}>Bankroll Rules</h3>
              {MOCK_RULES.map((rule) => (
                <div key={rule.id} style={styles.ruleItem}>
                  <span style={styles.ruleIndicator}>○</span>
                  <span style={styles.ruleLabel}>{rule.label}</span>
                  <span style={styles.ruleValue}>{rule.value}</span>
                </div>
              ))}
            </div>

            {/* Log Today's Session Button */}
            <button
              style={styles.logTodayButton}
              onClick={() => setShowLogModal(true)}
            >
              Log Today's Session
              <span style={styles.logArrow}>›</span>
            </button>
          </aside>
        </div>
      </div>

      {/* Log Session Modal */}
      <AnimatePresence>
        {showLogModal && (
          <LogSessionModal
            isOpen={showLogModal}
            onClose={() => setShowLogModal(false)}
            onSubmit={handleLogSession}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
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

  // Top Bar
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
  profileIcon: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
  },

  // Main Layout
  mainLayout: {
    display: 'flex',
    minHeight: 'calc(100vh - 140px)',
  },

  // Sidebar
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

  // Main Content
  mainContent: {
    flex: 1,
    padding: '20px 24px',
    minWidth: 0,
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
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
  },

  // Stats Grid
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

  // Activity Section
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
  },
  filterTabsLeft: {
    display: 'flex',
    gap: 4,
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
  filterButton: {
    padding: '8px 14px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },

  // Activity List
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  activityEntry: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
  },
  entryIcon: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    flexWrap: 'wrap',
  },
  entryDate: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  entryLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
  },
  entryAmount: {
    fontSize: 14,
    fontWeight: 700,
  },
  entryDuration: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  entryLocation: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  entryDetails: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },

  // Trip Section
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
    color: '#ef4444',
  },
  tripExpenses: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  tripArrow: {
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.3)',
  },

  // Assistant Panel (Right Sidebar)
  assistantPanel: {
    width: 220,
    padding: '20px 16px',
    borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
  },
  assistantTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 14,
  },
  alertsSection: {
    marginBottom: 24,
  },
  alertItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '12px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  alertIcon: {
    fontSize: 14,
    marginTop: 2,
  },
  alertContent: {
    flex: 1,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 4,
  },
  alertTitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  alertValue: {
    fontSize: 13,
    fontWeight: 700,
  },
  alertSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    width: '100%',
  },

  // Rules Section
  rulesSection: {
    marginBottom: 24,
    padding: '16px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
  },
  ruleItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
  },
  ruleIndicator: {
    color: '#00D4FF',
    fontSize: 10,
  },
  ruleLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  ruleValue: {
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    marginLeft: 'auto',
  },

  // Log Today Button
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

  // Modal Styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    background: '#1a2a44',
    borderRadius: 16,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#fff',
    margin: 0,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    color: '#fff',
    fontSize: 20,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalForm: {
    padding: 24,
  },
  formGroup: {
    marginBottom: 20,
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  formLabel: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
  },
  formInput: {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    outline: 'none',
  },
  formSelect: {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    cursor: 'pointer',
  },
  formTextarea: {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    minHeight: 80,
    resize: 'vertical',
  },
  modalActions: {
    display: 'flex',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    padding: '14px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  submitButton: {
    flex: 1,
    padding: '14px',
    background: 'linear-gradient(135deg, #00D4FF, #0099cc)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
