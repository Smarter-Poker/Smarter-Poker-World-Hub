/**
 * TRIP ROI CALCULATOR
 * True return on a trip or series: what it cost (buy-ins plus every expense
 * logged to it) against what it made.
 *
 * Built from the trip's own ledger rows (see buildTripReport in
 * src/lib/bankroll/tripMath.mjs). It used to keep a second, hand-typed expense
 * list that it tried to save to a `trips` table that does not exist, and it
 * read session times as clock strings when they are timestamps, so the hourly
 * rate was always zero. Expenses belong in the ledger (Dan's receipt rules):
 * log them as Expense entries on the trip and they appear here.
 */

import React from 'react';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';

const EXPENSE_LABELS = {
    flight: 'Flights',
    hotel: 'Hotel',
    airbnb: 'Airbnb',
    gas: 'Gas',
    rental_car: 'Rental Car',
    rideshare: 'Rideshare',
    meals: 'Meals',
    tips: 'Tips',
    tournament_fee: 'Tournament Fees',
    series_fee: 'Series Fees',
    visa: 'Visa',
    other: 'Other',
};

const signColor = (n) => (n >= 0 ? '#22c55e' : '#ef4444');

export default function TripROICalculator({ report, displayEUR = false }) {
    if (!report?.stats) return null;
    const { stats } = report;
    const expenses = Object.entries(report.expenseBreakdown || {}).sort(([, a], [, b]) => b - a);
    const money = (n) => formatCurrency(n, displayEUR);

    return (
        <div style={styles.container}>
            <h3 style={styles.title}>Trip ROI</h3>

            <div style={styles.roiGrid}>
                <Metric label="Buy-Ins" value={money(stats.buyIns)} />
                <Metric label="Cash-Outs" value={money(stats.cashOuts)} />
                <Metric label="Expenses" value={money(stats.totalExpenses)} />
                <Metric label="Total Cost" value={money(stats.totalCost)} />
                <Metric label="Net Profit" value={money(stats.totalNet)} color={signColor(stats.totalNet)} />
                <Metric
                    label="ROI"
                    value={stats.roi == null ? '-' : `${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`}
                    color={stats.roi == null ? undefined : signColor(stats.roi)}
                />
                <Metric label="Cost / Day" value={money(stats.costPerDay)} />
                <Metric
                    label="Hourly"
                    value={stats.hourlyRate == null ? '-' : `${money(stats.hourlyRate)}/Hr`}
                    color={stats.hourlyRate == null ? undefined : signColor(stats.hourlyRate)}
                />
            </div>
            <p style={styles.note}>
                ROI Is Net Profit Divided By Total Cost (Buy-Ins Plus Expenses).
                {stats.totalHours > 0
                    ? ` ${stats.totalHours.toFixed(1)} Hours Logged.`
                    : ' Add Start And End Times To Sessions To See An Hourly Rate.'}
            </p>

            <h4 style={styles.sectionTitle}>Expenses By Type</h4>
            {expenses.length === 0 ? (
                <p style={styles.note}>No Expenses Logged To This Trip.</p>
            ) : (
                <div style={styles.expenseList}>
                    {expenses.map(([type, amount]) => (
                        <div key={type} style={styles.expenseRow}>
                            <span style={styles.expenseLabel}>{EXPENSE_LABELS[type] || type}</span>
                            <span style={styles.expenseValue}>{money(amount)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Metric({ label, value, color }) {
    return (
        <div style={styles.roiItem}>
            <div style={styles.roiLabel}>{label}</div>
            <div style={{ ...styles.roiValue, color: color || '#fff' }}>{value}</div>
        </div>
    );
}

const styles = {
    container: {
        background: 'rgba(30, 58, 95, 0.2)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 10,
        padding: 16,
    },
    title: {
        fontSize: 14,
        fontWeight: 600,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        margin: '0 0 12px',
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        margin: '16px 0 8px',
    },
    roiGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 130px), 1fr))',
        gap: 8,
    },
    roiItem: {
        padding: '10px 12px',
        background: 'rgba(0,0,0,0.15)',
        borderRadius: 8,
        minWidth: 0,
    },
    roiLabel: {
        fontSize: 14,
        color: '#9aaec3',
        marginBottom: 4,
    },
    roiValue: {
        fontSize: 16,
        fontWeight: 700,
        overflowWrap: 'anywhere',
    },
    note: {
        fontSize: 14,
        color: '#9aaec3',
        lineHeight: 1.5,
        margin: '10px 0 0',
    },
    expenseList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    expenseRow: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        padding: '8px 10px',
        background: 'rgba(0,0,0,0.1)',
        borderRadius: 6,
    },
    expenseLabel: {
        fontSize: 14,
        color: '#cbd5e1',
    },
    expenseValue: {
        fontSize: 14,
        fontWeight: 600,
        color: '#ef4444',
    },
};
