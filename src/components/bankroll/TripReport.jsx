/**
 * TRIP REPORT COMPONENT
 * ═══════════════════════════════════════════════════════════════
 * Full overview report for a completed trip
 * ═══════════════════════════════════════════════════════════════
 */

import { GRADIENTS, METAL } from './metalStyles';
import React from 'react';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';
import { parseLedgerDay } from '../../lib/bankroll/localDates.mjs';
import { tripContribution } from '../../lib/bankroll/tripMath.mjs';
import TripROICalculator from './TripROICalculator';

const CATEGORY_LABELS = {
    poker_cash: 'Cash Games',
    poker_mtt: 'Tournaments',
    casino_table: 'Casino',
    slots: 'Slots',
    sports: 'Sports Betting',
    expense: 'Expenses',
};

const orDash = (value) => (value == null ? '-' : formatCurrency(value));
const signColor = (value) => (value == null ? '#fff' : value >= 0 ? '#10b981' : '#ef4444');

function TripReport({ report, onBack, onReopen, kind = 'trip' }) {
    const { trip, stats, categoryBreakdown, dailyBreakdown, entries = [] } = report;
    const noun = kind === 'series' ? 'Series' : 'Trip';

    return (
        <div className="sd-panel" style={styles.container}>
            <div style={styles.topActions}>
                <button type="button" onClick={onBack} style={styles.backBtn}>← Back To {noun} Tracker</button>
                {onReopen && (
                    <button type="button" onClick={onReopen} style={styles.backBtn}>Reopen {noun}</button>
                )}
            </div>

            {/* Trip Header */}
            <div style={styles.header}>
                <h2 style={styles.tripName}>{trip.name}</h2>
                <p style={styles.tripMeta}>
                    {trip.location_name && `${trip.location_name} · `}
                    {parseLedgerDay(trip.start_date).toLocaleDateString()}
                    {trip.end_date && ` - ${parseLedgerDay(trip.end_date).toLocaleDateString()}`}
                    {trip.purpose && ` · ${trip.purpose}`}
                </p>
            </div>

            {/* Summary Stats Grid */}
            <div style={styles.statsGrid}>
                <StatBox label="Total P/L" value={formatCurrency(stats.totalNet)} color={stats.totalNet >= 0 ? '#10b981' : '#ef4444'} large />
                <StatBox label="Gaming Net" value={formatCurrency(stats.totalGrossNet)} color={signColor(stats.totalGrossNet)} />
                <StatBox label="Expenses" value={formatCurrency(stats.totalExpenses)} color="#ef4444" />
                <StatBox label="Sessions" value={stats.sessionCount} />
                <StatBox label="Win Rate" value={`${stats.winRate}%`} color={stats.winRate >= 50 ? '#10b981' : '#ef4444'} />
                <StatBox label="Duration" value={`${stats.durationDays} ${stats.durationDays === 1 ? 'Day' : 'Days'}`} />
                <StatBox label="Avg/Day" value={formatCurrency(stats.avgPerDay)} color={stats.avgPerDay >= 0 ? '#10b981' : '#ef4444'} />
                <StatBox label="Avg/Session" value={formatCurrency(stats.avgPerSession)} color={stats.avgPerSession >= 0 ? '#10b981' : '#ef4444'} />
                <StatBox label="Best Session" value={orDash(stats.biggestWin)} color={signColor(stats.biggestWin)} />
                <StatBox label="Worst Session" value={orDash(stats.biggestLoss)} color={signColor(stats.biggestLoss)} />
            </div>

            <TripROICalculator report={report} />

            {/* Category Breakdown */}
            {Object.keys(categoryBreakdown || {}).length > 0 && (
                <div style={styles.section}>
                    <h3 style={styles.sectionTitle}>Breakdown By Category</h3>
                    <div style={styles.catGrid}>
                        {Object.entries(categoryBreakdown || {}).map(([cat, data]) => (
                            <div key={cat} style={styles.catCard}>
                                <div style={styles.catName}>{CATEGORY_LABELS[cat] || cat}</div>
                                <div style={{
                                    ...styles.catNet,
                                    color: data.net >= 0 ? '#10b981' : '#ef4444',
                                }}>
                                    {formatCurrency(data.net)}
                                </div>
                                <div style={styles.catMeta}>
                                    {data.count} {data.count === 1 ? 'entry' : 'entries'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Daily Breakdown */}
            {Object.keys(dailyBreakdown || {}).length > 0 && (
                <div style={styles.section}>
                    <h3 style={styles.sectionTitle}>Daily Results</h3>
                    <div style={styles.dailyList}>
                        {Object.entries(dailyBreakdown || {})
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([day, net]) => (
                                <div key={day} style={styles.dailyRow}>
                                    <span style={styles.dailyDate}>{parseLedgerDay(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                    <span style={{
                                        ...styles.dailyNet,
                                        color: net >= 0 ? '#10b981' : '#ef4444',
                                    }}>
                                        {net >= 0 ? '+' : ''}{formatCurrency(net)}
                                    </span>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {entries.length === 0 && (
                <div style={styles.section}>
                    <p style={styles.notesText}>No Entries Were Logged To This {noun}.</p>
                </div>
            )}

            {/* Entry Log */}
            {entries.length > 0 && (
                <div style={styles.section}>
                    <h3 style={styles.sectionTitle}>All Entries ({entries.length})</h3>
                    <div style={styles.entryList}>
                        {entries.map(entry => (
                            <div key={entry.id} style={styles.entryRow}>
                                <div style={styles.entryLeft}>
                                    <span style={styles.entryDate}>{parseLedgerDay(entry.entry_date).toLocaleDateString()}</span>
                                    <span style={styles.entryCat}>{CATEGORY_LABELS[entry.category] || entry.category}</span>
                                    {entry.notes && <span style={styles.entryNotes}>{entry.notes}</span>}
                                </div>
                                <span style={{
                                    ...styles.entryNet,
                                    color: tripContribution(entry) >= 0 ? '#10b981' : '#ef4444',
                                }}>
                                    {formatCurrency(tripContribution(entry))}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Notes */}
            {trip.notes && (
                <div style={styles.section}>
                    <h3 style={styles.sectionTitle}>{noun} Notes</h3>
                    <p style={styles.notesText}>{trip.notes}</p>
                </div>
            )}
        </div>
    );
}

function StatBox({ label, value, color, large }) {
    return (
        <div style={{ ...styles.statBox, ...(large ? styles.statBoxLarge : {}) }}>
            <span style={styles.statLabel}>{label}</span>
            <span style={{ ...styles.statValue, color: color || '#fff', ...(large ? { fontSize: 24 } : {}) }}>
                {value}
            </span>
        </div>
    );
}

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
    },
    backBtn: {
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        padding: '8px 16px',
        color: '#edf6ff',
        fontSize: 14,
        cursor: 'pointer',
    },
    topActions: {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 10,
    },
    header: {
        marginBottom: 4,
    },
    tripName: {
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
        margin: 0,
        overflowWrap: 'anywhere',
    },
    tripMeta: {
        fontSize: 14,
        color: '#94a3b8',
        margin: '6px 0 0',
    },

    // Stats Grid
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 130px), 1fr))',
        gap: 10,
    },
    statBox: {
        background: 'rgba(30, 58, 95, 0.3)',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    statBoxLarge: {
        gridColumn: '1 / -1',
        background: 'rgba(30, 58, 95, 0.5)',
        border: '2px solid rgba(59, 130, 246, 0.2)',
    },
    statLabel: {
        fontSize: 14,
        color: '#9aaec3',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    statValue: {
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
    },

    // Sections
    section: {
        background: 'rgba(30, 58, 95, 0.2)',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 10,
        padding: 16,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        margin: '0 0 12px',
    },

    // Category Breakdown
    catGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))',
        gap: 8,
    },
    catCard: {
        background: 'rgba(0,0,0,0.15)',
        borderRadius: 8,
        padding: '10px 12px',
    },
    catName: {
        fontSize: 14,
        color: '#94a3b8',
        marginBottom: 4,
    },
    catNet: {
        fontSize: 16,
        fontWeight: 700,
    },
    catMeta: {
        fontSize: 14,
        color: '#9aaec3',
        marginTop: 2,
    },

    // Daily
    dailyList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    dailyRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 10px',
        background: 'rgba(0,0,0,0.1)',
        borderRadius: 6,
    },
    dailyDate: {
        fontSize: 14,
        color: '#94a3b8',
    },
    dailyNet: {
        fontSize: 14,
        fontWeight: 600,
    },

    // Entry Log
    entryList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        maxHeight: 400,
        overflowY: 'auto',
    },
    entryRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 10px',
        background: 'rgba(0,0,0,0.1)',
        borderRadius: 6,
    },
    entryLeft: {
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        flex: 1,
        minWidth: 0,
    },
    entryDate: {
        fontSize: 14,
        color: '#9aaec3',
        flexShrink: 0,
    },
    entryCat: {
        fontSize: 14,
        color: '#94a3b8',
        fontWeight: 500,
        flexShrink: 0,
    },
    entryNotes: {
        fontSize: 14,
        color: '#8193a8',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
    },
    entryNet: {
        fontSize: 14,
        fontWeight: 600,
        flexShrink: 0,
        marginLeft: 10,
    },

    // Notes
    notesText: {
        fontSize: 14,
        color: '#94a3b8',
        lineHeight: 1.5,
        margin: 0,
    },
};

export default React.memo(TripReport);
