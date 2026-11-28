/* The dashboard view: held and waiting scans, the active trip and series banners, the stat tiles, the trend chart and its filters, the analytics grid, stake affordability and Recent Activity. Imported statically: it is the page's first paint, server-rendered with it.

   Moved verbatim out of pages/hub/bankroll-manager.js in the 2026-11-28 page
   split. The page still owns every piece of state and every handler and
   passes in exactly the ones this view reads, so its behaviour, text,
   accessible names and test ids are unchanged. */

import dynamic from 'next/dynamic';
import layout from '../../../../styles/BankrollManager.module.css';
import { formatCurrency, formatCurrencyWithSign } from '../../../lib/bankroll/currencyUtils';
import { CHART_TYPES, CHART_TYPE_LABELS, GAME_TYPES, TIME_FILTERS, sanitizeLineAxis } from '../../../lib/bankroll/dashboardFilters.mjs';
import { centsToDollars, resultsCents } from '../../../lib/bankroll/ledgerMath.mjs';
import { partitionForBulkFiling } from '../../../lib/bankroll/receiptInbox.mjs';
import { tripDayLabel } from '../../../lib/bankroll/tripMath.mjs';
import toast from '../../../stores/toastStore';
import { HubErrorBoundary } from '../../ui/HubErrorBoundary';
import { VipUpgradePrompt } from '../../vip/VipKit';
import BankrollFilterMenu from '../BankrollFilterMenu';
import BankrollTrendChart from '../BankrollTrendChart';
import { CATEGORY_LABELS } from './bankrollPageConstants';
import { styles } from './bankrollPageStyles';
import { lazySection } from './lazySection';

const ClubArenaSessionsPrompt = dynamic(() => import('../ClubArenaSessions').then((m) => m.ClubArenaSessionsPrompt), { ssr: false });
const HistoricalComparison = lazySection(() => import('../HistoricalComparison'));
const ImportSessionsPrompt = dynamic(() => import('../ImportSessionsPrompt'), { ssr: false });
const LedgerTimeline = lazySection(() => import('../LedgerTimeline'));
const LocationAnalytics = lazySection(() => import('../LocationAnalytics'));
const ReceiptScanner = lazySection(() => import('../ReceiptScanner'));
const StakeAffordability = dynamic(() => import('../StakeAffordability'), { ssr: false });
const VarianceCalculator = lazySection(() => import('../VarianceCalculator'));

function StatCard({ title, value, change, suffix, isRisk, isLoading, onClick, tutorialId, displayEUR = false }) {
  const getRiskColor = (risk) => {
    if (risk === 'HIGH') return '#ef4444';
    if (risk === 'MEDIUM') return '#61d0e8';
    return '#22c55e';
  };

  return (
    <div
      className={`sd-metric ${layout.metric}`}
      style={{ ...(onClick ? { cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', minHeight: 44 } : {}) }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      data-tutorial={tutorialId}
    >
      <span style={styles.statTitle}>{title}</span>
      {isLoading ? (
        <div style={styles.statLoading}>-</div>
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
              {formatCurrencyWithSign(change, displayEUR)}
              {change < 0 && <span style={styles.downArrow}>▼</span>}
            </span>
          )}
          {suffix && <span style={styles.statSuffix}>{suffix}</span>}
        </div>
      )}
    </div>
  );
}

export default function DashboardSection({
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
  setTimeFilter, showAllEntries, stats, timeFilter, toggleGameType,
  trips, userId
}) {
  return (
    <>

      {/*
        HELD ON THIS DEVICE: photographed with no signal, never sent.
        Listed ABOVE Receipts Waiting because these are the ones at
        risk - a receipt in Receipts Waiting is already on the
        server, and one here exists nowhere else. Clearing the
        browser's data would take it.
      */}
      {/*
        THE SENDER. Mounted only while a held scan is on its way,
        and deliberately off-screen rather than in the modal: the
        player did not ask for a sheet to open, they asked for their
        receipt not to be lost. Progress is the banner below.

        It is the same component the visible scanner uses, so there
        is one upload path, one read through the paid route, and one
        set of numbers. autoConfirm only changes who presses
        Confirm.
      */}
      {autoFlushing && (
        <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
          <ReceiptScanner
            userId={userId}
            resumeScan={autoFlushing}
            autoConfirm
            onScanComplete={async ({ imageUrl, extractedData, route, documentType, imageHash, readOutcome, ocrConfidence }) => {
              const id = await saveReceiptRow({ imageUrl, extractedData, route, documentType, imageHash, readOutcome, ocrConfidence });
              await finishAutoFlush(autoFlushing, Boolean(id));
              if (id) {
                loadPendingReceipts();
                toast.success('A Scan You Took Offline Has Been Sent. It Is Waiting To Be Filed.');
              } else {
                // The row did not land, so the device copy STAYS.
                toast.error('A Held Scan Uploaded But Could Not Be Listed. It Is Still On This Device.');
              }
            }}
            onHeld={() => { finishAutoFlush(autoFlushing, false); }}
            onUploadFailed={() => { finishAutoFlush(autoFlushing, false); }}
          />
        </div>
      )}

      {(heldScans.length > 0 || autoFlushing) && (
        <div style={styles.receiptsWaiting} data-testid="scans-held-on-device">
          <div style={styles.receiptsWaitingHead}>
            <span>{autoFlushing ? 'Sending A Scan You Took Offline' : online ? 'Scans Waiting To Be Sent' : 'Scans Held On This Device'}</span>
            <span style={styles.receiptsWaitingCount}>{heldScans.length}</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '2px 0 8px' }}>
            {autoFlushing
              ? 'Reading It And Saving It To Receipts Waiting. You Do Not Need To Do Anything.'
              : online
                ? 'These Were Taken With No Signal And Are Only On This Phone. Sending Them Now.'
                : 'Saved Here Until You Are Back Online. They Send Themselves When You Reconnect.'}
          </div>
          {heldScans.map((held) => (
            <button
              key={held.id}
              type="button"
              className="sp-btn"
              disabled={!online || Boolean(resumingHeld)}
              onClick={() => resumeHeldScan(held)}
              style={{ width: '100%', marginBottom: 6, textAlign: 'left' }}
            >
              {`Send Scan From ${new Date(held.capturedAt).toLocaleString()}`}
            </button>
          ))}
        </div>
      )}

      {/* Receipts Waiting: scans not yet filed anywhere. Listed until they are. */}
      {pendingReceipts.length > 0 && (
        <div style={styles.receiptsWaiting} data-testid="receipts-waiting">
          <div style={styles.receiptsWaitingHead}>
            <span>Receipts Waiting To Be Filed</span>
            <span style={styles.receiptsWaitingCount}>{pendingReceipts.length}</span>
          </div>
          {partitionForBulkFiling(pendingReceipts).willFile.length > 0 && (
            <button
              type="button"
              onClick={fileAllSuggested}
              disabled={bulkFiling}
              style={{ ...styles.receiptsWaitingBulk, opacity: bulkFiling ? 0.6 : 1 }}
            >
              {bulkFiling
                ? 'Filing...'
                : `File ${partitionForBulkFiling(pendingReceipts).willFile.length} Suggested`}
            </button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingReceipts.slice(0, 5).map((receipt) => (
              // A row, not a button. The discard control has to sit
              // inside it, and a button inside a button is invalid
              // HTML that browsers resolve by dropping one of them.
              <div key={receipt.id} style={styles.receiptsWaitingRow}>
                <button
                  type="button"
                  onClick={() => resumeReceipt(receipt)}
                  style={styles.receiptsWaitingOpen}
                >
                  <img src={receipt.image_url} alt="" loading="lazy" style={styles.receiptsWaitingThumb} />
                  <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                    <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {receipt.summary || 'Receipt'}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 }}>
                      {(receipt.route && receipt.route.label) || 'Choose Where This Goes'}
                    </div>
                  </div>
                  <span style={{ color: '#60a5fa', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>FILE</span>
                </button>
                {/* The way out for a photograph of somebody's thumb.
                    Without it the list only ever grows, and at
                    twenty rows the junk pushes the real scans off
                    the end. */}
                <button
                  type="button"
                  onClick={() => discardReceipt(receipt)}
                  disabled={discardingReceiptId === receipt.id}
                  aria-label={`Delete ${receipt.summary || 'this scan'}`}
                  title="Not A Receipt"
                  style={{
                    ...styles.receiptsWaitingDiscard,
                    opacity: discardingReceiptId === receipt.id ? 0.4 : 1,
                  }}
                >
                  {discardingReceiptId === receipt.id ? '...' : 'Delete'}
                </button>
              </div>
            ))}
            {pendingReceipts.length > 5 && (
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center' }}>
                And {pendingReceipts.length - 5} More
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Trip Featured Banner */}
      {(() => {
        const activeTrip = trips.find(t => t.status === 'active' && t.trip_type !== 'series');
        if (!activeTrip) return null;
        const dayLabel = tripDayLabel(activeTrip.start_date);
        return (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(59,130,246,0.08) 100%)',
              border: '2px solid rgba(16,185,129,0.3)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              cursor: 'pointer',
              touchAction: 'manipulation',
              minHeight: 44,
            }}
            role="button"
            tabIndex={0}
            onClick={() => { haptic('light'); goToSection('trips'); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToSection('trips'); } }}
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
              <div style={{ fontSize: 14, color: '#94a3b8' }}>
                {activeTrip.location_name && `${activeTrip.location_name} · `}
                {dayLabel} · {activeTrip.sessionCount || 0} Sessions
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontSize: 16,
                fontWeight: 700,
                color: (activeTrip.totalNet || 0) >= 0 ? '#10b981' : '#ef4444',
              }}>
                {formatCurrencyWithSign(activeTrip.totalNet || 0, preferences.currencyEUR)}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); haptic('light'); handleLogClick(); }}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 14,
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
        const dayLabel = tripDayLabel(activeSeries.start_date);
        return (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(169, 198, 230,0.08) 100%)',
              border: '2px solid rgba(59,130,246,0.3)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              cursor: 'pointer',
              touchAction: 'manipulation',
              minHeight: 44,
            }}
            role="button"
            tabIndex={0}
            onClick={() => { haptic('light'); goToSection('series'); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToSection('series'); } }}
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
              <div style={{ fontSize: 14, color: '#94a3b8' }}>
                {activeSeries.location_name && `${activeSeries.location_name} · `}
                {dayLabel} · {activeSeries.sessionCount || 0} Sessions
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontSize: 16,
                fontWeight: 700,
                color: (activeSeries.totalNet || 0) >= 0 ? '#10b981' : '#ef4444',
              }}>
                {formatCurrencyWithSign(activeSeries.totalNet || 0, preferences.currencyEUR)}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); haptic('light'); goToSection('series'); }}
              style={{
                background: '#4795f3',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 14,
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

      {/* First paint only: a skeleton that mirrors the dashboard
          (stats grid, chart block, three analytics cards). Background
          reloads never show it (isInitialLoad). */}
      {isLoading && !hasLoadedOnce && (
        <div className="bankroll-dashboard-skeleton" aria-busy="true" aria-label="Loading Bankroll">
          <div className="bankroll-skel-stats">
            <div className="bankroll-skel" style={{ height: 92 }} />
            <div className="bankroll-skel" style={{ height: 92 }} />
          </div>
          <div className="bankroll-skel" style={{ height: 260, marginBottom: 16 }} />
          <div className="bankroll-skel-analytics bankroll-analytics-grid">
            <div className="bankroll-skel" style={{ height: 180 }} />
            <div className="bankroll-skel" style={{ height: 180 }} />
            <div className="bankroll-skel" style={{ height: 180 }} />
          </div>
        </div>
      )}

      {/* A failed read is not an empty bankroll: the tiles would
          show '-' and the chart nothing, as if no session had
          ever been logged. */}
      {failedScope === reportScope && (
        <div role="alert" className={`sd-panel ${layout.panel}`} data-testid="bankroll-load-failed" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: '#fca5a5', fontSize: 14, fontWeight: 600 }}>Could Not Load Your Bankroll. Check Your Connection.</span>
          <button type="button" className="sd-button" onClick={loadData}>Retry</button>
        </div>
      )}

      {/* Finished Club Arena sessions not yet in the ledger. */}
      {userId && <ClubArenaSessionsPrompt userId={userId} />}

      {/* An empty ledger is offered Import Sessions (it checks the whole ledger itself). */}
      {hasLoadedOnce && failedScope !== reportScope && userId && <ImportSessionsPrompt userId={userId} />}

      {/* === Unified Dashboard Frame === */}
      {!(isLoading && !hasLoadedOnce) && (
      <div className={`sd-panel ${layout.dashboard}`}>

        {/* Stats Cards */}
        <div className="bankroll-stats-grid" data-tutorial="stats" style={styles.statsGrid}>
          <StatCard
            title="Bankroll Balance"
            value={stats ? formatCurrency(stats.totalBankroll, preferences.currencyEUR) : '-'}
            isLoading={isLoading}
            onClick={openAdjustModal}
          />
          <StatCard
            title="Net Results"
            value={
              // Summed from the rows the trend chart plots, so the
              // tile and the chart's last point always agree.
              reportReady
                ? formatCurrency(centsToDollars(resultsCents(chartEntries)), preferences.currencyEUR)
                : stats
                  ? formatCurrency(stats.allInNet, preferences.currencyEUR)
                  : '-'
            }
            isLoading={isLoading}
          />
        </div>

        {/* Bankroll Trend Chart, filtered by gameTypeFilter, always include expenses */}
        <div data-tutorial="chart">
        <BankrollTrendChart displayEUR={preferences.currencyEUR} entries={chartEntries} isLoading={isLoading} chartType={chartType} timeFilter={timeFilter} lineAxis={sanitizeLineAxis(filters.lineAxis)} onLineAxisChange={setLineAxis} />

        {/* Filters Row. Two columns at phone width (bankroll.css),
            so the right column's menus open leftward to stay on
            a 375px screen. */}
        <div className="bankroll-filters-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
          <BankrollFilterMenu
            label="Location"
            buttonText={selectedLocationName}
            open={openFilter === 'location'}
            onOpenChange={filterMenuToggle('location')}
            onSelect={(value) => setLocationFilter(value === 'all' ? null : value)}
            options={[{ value: 'all', label: 'All Locations', selected: !locationFilter }]
              .concat(locations.map((loc) => ({ value: loc.id, label: loc.name, selected: locationFilter === loc.id })))}
          />
          <BankrollFilterMenu
            label="Time Range"
            buttonText={timeFilter}
            align="right"
            open={openFilter === 'time'}
            onOpenChange={filterMenuToggle('time')}
            onSelect={setTimeFilter}
            options={TIME_FILTERS.map((tf) => ({ value: tf, label: tf, selected: timeFilter === tf }))}
          />
          <BankrollFilterMenu
            label="Game Types"
            buttonText={`Game Type (${gameTypeFilter.length})`}
            multiple
            minWidth={200}
            open={openFilter === 'game'}
            onOpenChange={filterMenuToggle('game')}
            onSelect={toggleGameType}
            options={GAME_TYPES.map((cat) => ({ value: cat, label: CATEGORY_LABELS[cat], selected: gameTypeFilter.includes(cat) }))}
          />
          <BankrollFilterMenu
            label="Chart Type"
            buttonText={CHART_TYPE_LABELS[chartType]}
            align="right"
            open={openFilter === 'chart'}
            onOpenChange={filterMenuToggle('chart')}
            onSelect={setChartType}
            options={CHART_TYPES.map((ct) => ({ value: ct, label: CHART_TYPE_LABELS[ct], selected: chartType === ct }))}
          />
        </div>
        </div>

      </div>
      )}

      {/* Analytics grid */}
      {!(isLoading && !hasLoadedOnce) && (
      <div style={{ position: 'relative' }} data-tutorial="analytics">
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
            padding: 12,
            overflowY: 'auto',
          }}>
            <VipUpgradePrompt
              accountId={userId || null}
              title="VIP Analytics"
              copy="Variance Analysis, Venue Intelligence And Historical Trends Require VIP."
              onNavigate={() => haptic('light')}
            />
          </div>
        )}
        {/* Analytics: a grid at every width. Three across on
            desktop, one column stacked on phones. Was a
            scroll-snap slider with 85% cards (slide to see). */}
        <div className={layout.analyticsGrid} style={{ filter: isVip ? 'none' : 'blur(3px)', pointerEvents: isVip ? 'auto' : 'none' }}>
          <div className={layout.analyticsCard}>
            <HubErrorBoundary name="Location Analytics">
              <LocationAnalytics displayEUR={preferences.currencyEUR} entries={filteredAnalyticsEntries} isLoading={isLoading} />
            </HubErrorBoundary>
          </div>
          <div className={layout.analyticsCard}>
            <HubErrorBoundary name="Variance Calculator">
              <VarianceCalculator displayEUR={preferences.currencyEUR} entries={filteredAnalyticsEntries} />
            </HubErrorBoundary>
          </div>
          <div className={layout.analyticsCard}>
            <HubErrorBoundary name="Historical Comparison">
              <HistoricalComparison displayEUR={preferences.currencyEUR} entries={filteredAnalyticsEntries} />
            </HubErrorBoundary>
          </div>
        </div>
      </div>
      )}

      {userId && !(isLoading && !hasLoadedOnce) && (
        <HubErrorBoundary name="Stake Affordability">
          <StakeAffordability userId={userId} bankroll={stats ? stats.totalBankroll : null} displayEUR={preferences.currencyEUR} refreshKey={refreshTrigger} />
        </HubErrorBoundary>
      )}

      {/* Recent Activity Section */}
      <div className={`sd-panel ${layout.panel}`}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}
        >
          <h2 className="sd-section-title">Recent Activity</h2>
          {entries.length > 5 && (
            <button
              type="button"
              onClick={() => { haptic('light'); setShowAllEntries(true); }}
              style={{
                minHeight: 44,
                touchAction: 'manipulation',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '2px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 6,
                padding: '6px 14px',
                color: '#3b82f6',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              View All ({entries.length})
            </button>
          )}
        </div>

        {/* Ledger Timeline - always shows last 5 */}
        <LedgerTimeline
          displayEUR={preferences.currencyEUR}
          entries={entries.slice(0, 5)}
          isLoading={isLoading}
          onEdit={handleEditEntry}
          onDelete={handleDeleteEntry}
        />
      </div>

      {/* Recent Activity Modal Popup */}
      {showAllEntries && (
        <div
          className="bankroll-modal-overlay"
          {...allEntriesScrim}
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
            className="bankroll-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 600,
              maxHeight: '80dvh',
              borderRadius: 16,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              boxSizing: 'border-box',
            }}
          >
            <div className="bankroll-sheet-handle" aria-hidden="true" />
            {/* Modal Header */}
            <div className="bankroll-modal-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              flexShrink: 0,
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Recent Activity</h2>
              <button
                type="button"
                aria-label="Close"
                className="bankroll-modal-close sp-icon-btn"
                onClick={() => setShowAllEntries(false)}
                style={{ '--sp-btn-size': '44px',
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  minWidth: 44,
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 18,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
              >
                ✕
              </button>
            </div>
            {/* Scrollable Content */}
            <div className="bankroll-modal-body" style={{ overflowY: 'auto', padding: '12px 20px 20px' }}>
              <LedgerTimeline
                displayEUR={preferences.currencyEUR}
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
  );
}
