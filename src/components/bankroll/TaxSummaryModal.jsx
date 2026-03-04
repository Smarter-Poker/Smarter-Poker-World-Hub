/**
 * TAX SUMMARY MODAL
 * ══════════════════════════════════════════════════════════
 * Annual tax summary with print-to-PDF capability
 * Facebook Dark UI — uses window.print() with @media print styles
 * ══════════════════════════════════════════════════════════
 */

import { useState, useMemo } from 'react';

const IRS_MILEAGE_RATES = { 2025: 0.70, 2024: 0.67, 2023: 0.655, 2022: 0.585, 2021: 0.56 };

const METAL = {
    base: '#1C1E21', mid: '#242526', elevated: '#3A3B3C', darkest: '#18191A',
    highlight: 'rgba(255,255,255,0.09)', primary: '#4A90D9', primaryDim: 'rgba(74,144,217,0.15)',
    success: '#36bb6a', warn: '#f59e0b', danger: '#F02849',
    textPrimary: '#E4E6EB', textSecondary: '#B0B3B8',
};

const EXPENSE_LABELS = {
    food: 'Meals & Beverages', ride_share: 'Ride Share', gas: 'Gas',
    air_fare: 'Air Travel', lodging: 'Lodging', supplies: 'Supplies',
    tip_out: 'Tip-Out', other: 'Other',
};

function getYear(gig) {
    return gig.start_date ? parseInt(gig.start_date.slice(0, 4), 10) : null;
}

function computeGigTokes(gig) {
    return (gig.days || []).reduce((sum, day) =>
        sum + (day.downs || []).reduce((s, d) => s + (d.toke_amount || 0), 0), 0
    );
}

function computeGigExpenses(gig) {
    return (gig.days || []).reduce((sum, day) =>
        sum + (day.expenses || []).reduce((s, e) => s + (e.amount || 0), 0), 0
    );
}

export default function TaxSummaryModal({ completedGigs = [], onClose }) {
    const availableYears = useMemo(() => {
        const years = new Set();
        for (const g of completedGigs) {
            const y = getYear(g);
            if (y) years.add(y);
        }
        return Array.from(years).sort((a, b) => b - a);
    }, [completedGigs]);

    const [selectedYear, setSelectedYear] = useState(availableYears[0] || new Date().getFullYear());

    const yearGigs = useMemo(
        () => completedGigs.filter(g => getYear(g) === selectedYear),
        [completedGigs, selectedYear]
    );

    const irsRate = IRS_MILEAGE_RATES[selectedYear] || 0.67;

    // Per-venue breakdown
    const venueBreakdown = useMemo(() => {
        const map = {};
        for (const gig of yearGigs) {
            const venue = gig.venue_name || 'Unknown Venue';
            if (!map[venue]) map[venue] = { tokes: 0, expenses: 0, miles: 0, events: 0 };
            map[venue].tokes += computeGigTokes(gig);
            map[venue].expenses += computeGigExpenses(gig);
            map[venue].miles += gig.mileage || 0;
            map[venue].events += 1;
        }
        return Object.entries(map)
            .map(([venue, data]) => ({ venue, ...data }))
            .sort((a, b) => b.tokes - a.tokes);
    }, [yearGigs]);

    // Expense breakdown by category
    const expenseBreakdown = useMemo(() => {
        const map = {};
        for (const gig of yearGigs) {
            for (const day of gig.days || []) {
                for (const e of day.expenses || []) {
                    const cat = e.category || 'other';
                    map[cat] = (map[cat] || 0) + (e.amount || 0);
                }
            }
        }
        return Object.entries(map)
            .map(([cat, amt]) => ({ cat, label: EXPENSE_LABELS[cat] || cat, amt }))
            .sort((a, b) => b.amt - a.amt);
    }, [yearGigs]);

    const totalTokes = venueBreakdown.reduce((s, v) => s + v.tokes, 0);
    const totalExpenses = venueBreakdown.reduce((s, v) => s + v.expenses, 0);
    const totalMiles = yearGigs.reduce((s, g) => s + (g.mileage || 0), 0);
    const mileageDeduction = totalMiles * irsRate;
    const totalDeductions = totalExpenses + mileageDeduction;
    const netTaxableIncome = Math.max(0, totalTokes - totalDeductions);

    const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <>
            {/* Print styles injected globally */}
            <style>{`
                @media print {
                    body > *:not(#tax-summary-print-root) { display: none !important; }
                    #tax-summary-print-root {
                        position: fixed !important; top: 0; left: 0;
                        width: 100vw; height: auto; z-index: 99999;
                        background: #fff !important; color: #000 !important;
                        padding: 32px; font-family: 'Arial', sans-serif;
                    }
                    .no-print { display: none !important; }
                    .print-section { page-break-inside: avoid; }
                }
            `}</style>

            {/* Overlay backdrop */}
            <div style={s.backdrop} onClick={onClose} />

            {/* Modal */}
            <div id="tax-summary-print-root" style={s.modal}>
                {/* Header */}
                <div style={s.header}>
                    <div>
                        <div style={s.title}>📄 Annual Tax Summary</div>
                        <div style={s.subtitle}>Toke Tracker · Smarter.Poker</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <select
                            style={s.yearSelect}
                            value={selectedYear}
                            onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
                            className="no-print"
                        >
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <button
                            style={s.printBtn}
                            onClick={() => window.print()}
                            className="no-print"
                        >🖨️ Print / PDF</button>
                        <button style={s.closeBtn} onClick={onClose} className="no-print">✕</button>
                    </div>
                </div>

                {yearGigs.length === 0 ? (
                    <div style={s.empty}>No completed events in {selectedYear}</div>
                ) : (
                    <div style={s.body}>

                        {/* ── Summary Stats ── */}
                        <div style={s.statsGrid} className="print-section">
                            {[
                                { label: 'Gross Tip Income', value: fmt(totalTokes), color: METAL.success },
                                { label: 'Business Expenses', value: `-${fmt(totalExpenses)}`, color: METAL.danger },
                                { label: `Mileage Deduction (${totalMiles.toLocaleString()} mi × $${irsRate}/mi)`, value: `-${fmt(mileageDeduction)}`, color: METAL.warn },
                                { label: 'Net Taxable Tips', value: fmt(netTaxableIncome), color: METAL.primary },
                            ].map(stat => (
                                <div key={stat.label} style={s.statBox}>
                                    <div style={s.statLabel}>{stat.label}</div>
                                    <div style={{ ...s.statValue, color: stat.color }}>{stat.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* ── Venue Breakdown ── */}
                        <div style={s.section} className="print-section">
                            <div style={s.sectionTitle}>🏛️ Income by Venue</div>
                            <table style={s.table}>
                                <thead>
                                    <tr style={s.thead}>
                                        <th style={s.th}>Venue</th>
                                        <th style={{ ...s.th, textAlign: 'right' }}>Events</th>
                                        <th style={{ ...s.th, textAlign: 'right' }}>Tokes</th>
                                        <th style={{ ...s.th, textAlign: 'right' }}>1099?</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {venueBreakdown.map((v, i) => (
                                        <tr key={v.venue} style={i % 2 === 0 ? {} : { background: 'rgba(0,0,0,0.12)' }}>
                                            <td style={s.td}>{v.venue}</td>
                                            <td style={{ ...s.td, textAlign: 'right' }}>{v.events}</td>
                                            <td style={{ ...s.td, textAlign: 'right', color: METAL.success }}>{fmt(v.tokes)}</td>
                                            <td style={{ ...s.td, textAlign: 'right' }}>
                                                {v.tokes >= 600
                                                    ? <span style={{ color: METAL.warn, fontWeight: 700 }}>⚠️ Yes</span>
                                                    : <span style={{ color: METAL.textSecondary }}>No</span>
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* ── Expense Breakdown ── */}
                        {expenseBreakdown.length > 0 && (
                            <div style={s.section} className="print-section">
                                <div style={s.sectionTitle}>📋 Deductible Expenses</div>
                                <table style={s.table}>
                                    <thead>
                                        <tr style={s.thead}>
                                            <th style={s.th}>Category</th>
                                            <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {expenseBreakdown.map((e, i) => (
                                            <tr key={e.cat} style={i % 2 === 0 ? {} : { background: 'rgba(0,0,0,0.12)' }}>
                                                <td style={s.td}>{e.label}</td>
                                                <td style={{ ...s.td, textAlign: 'right', color: METAL.danger }}>{fmt(e.amt)}</td>
                                            </tr>
                                        ))}
                                        <tr style={{ borderTop: `2px solid ${METAL.elevated}` }}>
                                            <td style={{ ...s.td, fontWeight: 700 }}>Total Expenses</td>
                                            <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: METAL.danger }}>{fmt(totalExpenses)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ── Mileage ── */}
                        {totalMiles > 0 && (
                            <div style={s.mileageBox} className="print-section">
                                <span style={s.mileageLabel}>🚗 Mileage Deduction ({selectedYear})</span>
                                <span style={s.mileageValue}>
                                    {totalMiles.toLocaleString()} mi × ${irsRate}/mi = <strong style={{ color: METAL.warn }}>{fmt(mileageDeduction)}</strong>
                                </span>
                            </div>
                        )}

                        {/* ── IRS Notice ── */}
                        <div style={s.notice}>
                            <strong>⚠️ IRS Note:</strong> Tips received from casino players are generally taxable income. Venues that paid you ≥$600/year may issue a 1099-NEC. Keep this report and your supporting records. Consult a tax professional.
                        </div>

                        {/* ── Print footer (only visible when printing) ── */}
                        <div style={s.printFooter}>
                            Generated by Toke Tracker · Smarter.Poker · {selectedYear} Tax Year
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

// ── Styles ───────────────────────────────────────────────────────
const s = {
    backdrop: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 3000, cursor: 'pointer',
    },
    modal: {
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(760px, 95vw)', maxHeight: '90vh',
        background: METAL.mid, border: `1px solid ${METAL.elevated}`,
        borderRadius: 16, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        zIndex: 3001, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 24px', borderBottom: `1px solid ${METAL.elevated}`,
        flexShrink: 0,
    },
    title: { fontSize: 18, fontWeight: 700, color: METAL.textPrimary },
    subtitle: { fontSize: 12, color: METAL.textSecondary, marginTop: 2 },
    yearSelect: {
        padding: '7px 12px', background: METAL.darkest, border: `1px solid ${METAL.elevated}`,
        borderRadius: 8, color: METAL.textPrimary, fontSize: 14, cursor: 'pointer',
    },
    printBtn: {
        padding: '8px 16px', background: METAL.primary, border: 'none',
        borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    closeBtn: {
        padding: '8px 11px', background: METAL.elevated, border: 'none',
        borderRadius: 8, color: METAL.textSecondary, fontSize: 16, cursor: 'pointer',
    },
    body: { overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 },
    empty: { padding: 40, textAlign: 'center', color: METAL.textSecondary, fontSize: 15 },

    statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
    statBox: {
        padding: '14px 16px', background: METAL.darkest,
        border: `1px solid ${METAL.elevated}`, borderRadius: 10,
    },
    statLabel: { fontSize: 12, color: METAL.textSecondary, marginBottom: 6 },
    statValue: { fontSize: 20, fontWeight: 700 },

    section: {},
    sectionTitle: { fontSize: 13, fontWeight: 700, color: METAL.textSecondary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },
    table: { width: '100%', borderCollapse: 'collapse' },
    thead: { background: METAL.darkest },
    th: { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: METAL.textSecondary, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'left', borderBottom: `1px solid ${METAL.elevated}` },
    td: { padding: '10px 12px', fontSize: 14, color: METAL.textSecondary, borderBottom: `1px solid rgba(255,255,255,0.04)` },

    mileageBox: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10,
    },
    mileageLabel: { fontSize: 14, fontWeight: 600, color: METAL.textPrimary },
    mileageValue: { fontSize: 14, color: METAL.textSecondary },

    notice: {
        padding: '12px 16px', background: 'rgba(74,144,217,0.08)',
        border: '1px solid rgba(74,144,217,0.25)', borderRadius: 10,
        fontSize: 12, color: METAL.textSecondary, lineHeight: 1.6,
    },
    printFooter: {
        display: 'none',
        fontSize: 11, color: '#666', textAlign: 'center', paddingTop: 20,
        '@media print': { display: 'block' },
    },
};
