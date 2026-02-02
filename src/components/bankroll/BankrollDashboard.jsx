/**
 * BANKROLL DASHBOARD
 * Main dashboard view with stats cards and activity feed
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { getBankrollStats, calculateTravelROI } from '../../lib/bankroll/calculations';
import { runLeakAnalysis } from '../../lib/bankroll/leakDetection';
import { getLocationStats, getUserLocations } from '../../lib/bankroll/locationMemory';
import { fetchLedgerEntries, fetchTrips, getDateRangeFilter } from '../../lib/bankroll/bankrollSelectors';
import LedgerTimeline from './LedgerTimeline';
import LeakAlertPanel from './LeakAlertPanel';
import BankrollRulesCard from './BankrollRulesCard';
import LogEntryModal from './LogEntryModal';

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
          {change !== undefined && change !== null && (
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

export default function BankrollDashboard({ userId }) {
  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState([]);
  const [trips, setTrips] = useState([]);
  const [locations, setLocations] = useState([]);
  const [leakAnalysis, setLeakAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState(null);
  const [timeFilter, setTimeFilter] = useState('Last 30 Days');
  const [includeExpenses, setIncludeExpenses] = useState(false);

  // Dropdowns
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      const dateRange = getDateRangeFilter(timeFilter);

      // Load all data in parallel
      const [statsData, entriesData, tripsData, locationsData, leakData] = await Promise.all([
        getBankrollStats(userId, dateRange.startDate, dateRange.endDate, locationFilter),
        fetchLedgerEntries(userId, {
          category: categoryFilter,
          locationId: locationFilter,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          includeExpenses,
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

  const handleLogSubmit = async (formData) => {
    setShowLogModal(false);
    await loadData(); // Refresh data after logging
  };

  const selectedLocationName = locationFilter
    ? locations.find((l) => l.id === locationFilter)?.name || 'Unknown'
    : 'All Locations';

  return (
    <div style={styles.container}>
      {/* Top Bar with Filters */}
      <div style={styles.topBar}>
        <div style={styles.topBarLeft}>
          {/* Location Dropdown */}
          <div style={styles.dropdownContainer}>
            <button
              style={styles.dropdownButton}
              onClick={() => setShowLocationDropdown(!showLocationDropdown)}
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
          <div style={styles.dropdownContainer}>
            <button
              style={styles.dropdownButton}
              onClick={() => setShowTimeDropdown(!showTimeDropdown)}
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
      </div>

      {/* Main Layout */}
      <div style={styles.mainLayout}>
        {/* Main Content */}
        <main style={styles.mainContent}>
          {/* Header */}
          <div style={styles.contentHeader}>
            <h1 style={styles.pageTitle}>Bankroll Manager</h1>
            <div style={styles.headerActions}>
              <button style={styles.logButton} onClick={() => setShowLogModal(true)}>
                + Log
              </button>
            </div>
          </div>

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
                          color: trip.totalNet >= 0 ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {trip.totalNet >= 0 ? '+' : '~-'}$
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
        </main>

        {/* Right Sidebar - Assistant Panel */}
        <aside style={styles.assistantPanel}>
          {/* Leak Alert Panel */}
          <LeakAlertPanel
            leakAnalysis={leakAnalysis}
            locationId={locationFilter}
            isLoading={isLoading}
          />

          {/* Bankroll Rules */}
          <BankrollRulesCard userId={userId} />

          {/* Log Today's Session Button */}
          <button style={styles.logTodayButton} onClick={() => setShowLogModal(true)}>
            Log Today's Session
            <span style={styles.logArrow}>›</span>
          </button>
        </aside>
      </div>

      {/* Log Entry Modal */}
      {showLogModal && (
        <LogEntryModal
          userId={userId}
          locations={locations}
          trips={trips}
          onClose={() => setShowLogModal(false)}
          onSubmit={handleLogSubmit}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
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
  mainLayout: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  },
  mainContent: {
    flex: 1,
    padding: '20px 24px',
    overflowY: 'auto',
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
    width: 240,
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
};
