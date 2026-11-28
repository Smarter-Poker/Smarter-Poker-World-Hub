/**
 * TAX SUMMARY MODAL
 * ══════════════════════════════════════════════════════════
 * Annual tax summary with print-to-PDF capability
 * SmarterPoker Dark UI - uses window.print() with @media print styles
 * ══════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import view from './toke/DealerVault.module.css';
import ResponsiveTable from '../ui/ResponsiveTable';
import { defaultTaxYear, formatMileageRates, taxYearOptions, taxYearSummary } from '../../lib/bankroll/dealerTax.mjs';

const METAL = {
    base: '#0d1b2b', mid: '#112338', elevated: '#30485f', darkest: '#07111e',
    highlight: 'rgba(255,255,255,0.09)', primary: '#8acbff', primaryDim: 'rgba(74,144,217,0.15)',
    success: '#8cdeee', warn: '#85d8fb', danger: '#e7effa',
    textPrimary: '#eff5fc', textSecondary: '#bfcee0',
};

const EXPENSE_LABELS = {
    food: 'Meals & Beverages', ride_share: 'Ride Share', gas: 'Gas',
    air_fare: 'Air Travel', lodging: 'Lodging', supplies: 'Supplies',
    tip_out: 'Tip-Out', other: 'Other',
};

export default function TaxSummaryModal({ completedGigs = [], onClose, status = 'ready', onRetry }) {
    const closeRef = useRef(null);
    const dialogRef = useRef(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    useEffect(() => {
        if (!mounted) return;
        const returnFocus = document.activeElement;
        const node = dialogRef.current;
        node.showModal();
        closeRef.current?.focus();
        return () => { node.close(); returnFocus?.focus?.({ preventScroll: true }); };
    }, [mounted]);

    // The year shown is the dealer's choice once made; until then the latest
    // year with events. It used to be fixed on first render, so opening the
    // summary from the menu (?tab=tax) before the gigs had loaded pinned it
    // to a year with nothing in it and an empty year selector.
    const currentYear = new Date().getFullYear();
    const [chosenYear, setChosenYear] = useState(null);
    const availableYears = useMemo(() => taxYearOptions(completedGigs, currentYear), [completedGigs, currentYear]);
    const selectedYear = chosenYear ?? defaultTaxYear(completedGigs, currentYear);
    const summary = useMemo(() => taxYearSummary(completedGigs, selectedYear), [completedGigs, selectedYear]);
    const venueBreakdown = summary.venues;
    const expenseBreakdown = summary.expenses.map((e) => ({ ...e, label: EXPENSE_LABELS[e.cat] || e.cat }));
    const { totalTokes, totalExpenses, totalMiles, mileageDeduction, threshold } = summary;
    const netTaxableIncome = summary.netTaxable;
    const rateText = formatMileageRates(summary.mileageRates);

    const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (!mounted) return null;
    return createPortal(
        <>
            {/* Print styles injected globally */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    body:has(#tax-summary-print-root) > *:not(#tax-summary-print-root) { display: none !important; }
                    #tax-summary-print-root {
                        position: static !important; margin: 0; max-height: none !important; overflow: visible !important; border: 0 !important;
                        width: 100vw; height: auto; z-index: 99999;
                        background: #fff !important; color: #000 !important;
                        padding: 32px; font-family: 'Arial', sans-serif;
                    }
                    #tax-summary-print-root::backdrop { display: none; }
                    #tax-summary-print-root * { color: #101923 !important; background: transparent !important; text-shadow: none !important; }
                    .no-print { display: none !important; }
                    .print-section { page-break-inside: avoid; }
                    .print-footer-row { display: block !important; }
                }
            ` }} />

            <dialog ref={dialogRef} id="tax-summary-print-root" className={'smarterdesign sd-panel ' + view.statement}
                aria-labelledby="tax-summary-title" onCancel={event => { event.preventDefault(); onClose(); }}>
                {/* Header */}
                <div className={view.statementHeader}>
                    <div>
                        <h2 id="tax-summary-title">Annual Tax Summary</h2>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <select
                            style={s.yearSelect}
                            value={selectedYear}
                            onChange={e => setChosenYear(parseInt(e.target.value, 10))}
                            className="no-print"
                            aria-label="Tax Year"
                        >
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <button

                            onClick={() => window.print()}
                            className="no-print sd-button sd-primary"
                            aria-label="Print Or Save Tax Summary As PDF"
                        >Print / PDF</button>
                        <button
                            ref={closeRef}

                            onClick={onClose}
                            className={'no-print sp-icon-btn ' + view.deleteButton}
                            aria-label="Close Tax Summary"
                        >✕</button>
                    </div>
                </div>

                {status === 'loading' ? (
                    <div style={s.empty} role="status">Loading Your Completed Events…</div>
                ) : status === 'error' && summary.events === 0 ? (
                    <div style={s.empty} role="alert">
                        Your Completed Events Could Not Be Loaded.
                        {onRetry && <div style={{ marginTop: 12 }}><button type="button" className="sd-button" onClick={onRetry}>Retry</button></div>}
                    </div>
                ) : status === 'signed-out' ? (
                    <div style={s.empty}>Sign In To See Your Annual Tax Summary.</div>
                ) : summary.events === 0 ? (
                    <div style={s.empty}>No Completed Events In {selectedYear}</div>
                ) : (
                    <div className={view.statementBody}>

                        {/* ── Summary Stats ── */}
                        <div style={s.statsGrid} className="print-section">
                            {[
                                { label: 'Gross Tip Income', value: fmt(totalTokes), color: METAL.success },
                                { label: 'Business Expenses', value: `-${fmt(totalExpenses)}`, color: METAL.danger },
                                { label: totalMiles > 0 ? `Mileage Deduction (${totalMiles.toLocaleString()} mi × ${rateText}/mi)` : 'Mileage Deduction', value: `-${fmt(mileageDeduction)}`, color: METAL.warn },
                                { label: 'Net Taxable Tips', value: fmt(netTaxableIncome), color: METAL.primary },
                            ].map(stat => (
                                <div key={stat.label} className={view.statBox}>
                                    <div style={s.statLabel}>{stat.label}</div>
                                    <div style={{ ...s.statValue, color: stat.color }}>{stat.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* ── Venue Breakdown ── */}
                        <div style={s.section} className="print-section">
                            <div style={s.sectionTitle}>Income By Venue</div>
                            <ResponsiveTable
                                keyField="venue"
                                rows={venueBreakdown}
                                columns={[
                                    { key: 'venue', label: 'Venue' },
                                    { key: 'events', label: 'Events', align: 'right' },
                                    { key: 'tokes', label: 'Tokes', align: 'right', render: (v) => <span style={{ color: METAL.success }}>{fmt(v.tokes)}</span> },
                                    { key: 'form1099', label: '1099?', align: 'right', render: (v) => (v.meets1099
                                        ? <span style={{ color: METAL.warn, fontWeight: 700 }}>Yes</span>
                                        : <span style={{ color: METAL.textSecondary }}>No</span>) },
                                ]}
                            />
                        </div>

                        {/* ── Expense Breakdown ── */}
                        {expenseBreakdown.length > 0 && (
                            <div style={s.section} className="print-section">
                                <div style={s.sectionTitle}>Deductible Expenses</div>
                                <ResponsiveTable
                                    keyField="cat"
                                    rows={[...expenseBreakdown, { cat: '__total', label: 'Total Expenses', amt: totalExpenses, _total: true }]}
                                    columns={[
                                        { key: 'label', label: 'Category', render: (e) => <span style={e._total ? { fontWeight: 700 } : undefined}>{e.label}</span> },
                                        { key: 'amt', label: 'Amount', align: 'right', render: (e) => <span style={{ color: METAL.danger, fontWeight: e._total ? 700 : 400 }}>{fmt(e.amt)}</span> },
                                    ]}
                                />
                            </div>
                        )}

                        {/* ── Mileage ── */}
                        {totalMiles > 0 && (
                            <div style={s.mileageBox} className="print-section">
                                <span style={s.mileageLabel}>Mileage Deduction ({selectedYear})</span>
                                <span style={s.mileageValue}>
                                    {totalMiles.toLocaleString()} Mi × {rateText}/Mi = <strong style={{ color: METAL.warn }}>{fmt(mileageDeduction)}</strong>
                                </span>
                            </div>
                        )}

                        {/* ── IRS Notice ── */}
                        <div style={s.notice}>
                            <strong>IRS Note:</strong> Tips Received From Casino Players Are Generally Taxable Income. Venues That Paid You ${threshold.toLocaleString('en-US')} Or More In {selectedYear} May Issue A 1099-NEC ($600 Through 2025, $2,000 From 2026). Mileage Uses The IRS Rate On Each Event's Date. Keep This Report And Your Supporting Records. Consult A Tax Professional.
                        </div>

                        {/* ── Print footer (only visible when printing - controlled by CSS .print-footer-row class) ── */}
                        <div style={s.printFooter} className="print-footer-row">
                            Generated By Toke Tracker · Smarter.Poker · {selectedYear} Tax Year
                        </div>
                    </div>
                )}
            </dialog>
        </>, document.body
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
        width: 'min(760px, 95vw)',
        // Never taller than the area between the status bar and the home indicator (mobile phase 0b).
        maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)',
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
        padding: '8px 16px', background: '#124fa2', border: 'none',
        borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    closeBtn: {
        padding: '8px 11px', background: METAL.elevated, border: 'none',
        borderRadius: 8, color: METAL.textSecondary, fontSize: 16, cursor: 'pointer',
        minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
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
    th: { padding: '8px 12px', fontSize: 12, fontWeight: 700, color: METAL.textSecondary, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'left', borderBottom: `1px solid ${METAL.elevated}` },
    td: { padding: '10px 12px', fontSize: 14, color: METAL.textSecondary, borderBottom: `1px solid rgba(255,255,255,0.04)` },

    mileageBox: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', background: 'rgba(45,137,234,0.08)',
        border: '1px solid rgba(45,137,234,0.3)', borderRadius: 10,
    },
    mileageLabel: { fontSize: 14, fontWeight: 600, color: METAL.textPrimary },
    mileageValue: { fontSize: 14, color: METAL.textSecondary },

    notice: {
        padding: '12px 16px', background: 'rgba(74,144,217,0.08)',
        border: '1px solid rgba(74,144,217,0.25)', borderRadius: 10,
        fontSize: 12, color: METAL.textSecondary, lineHeight: 1.6,
    },
    printFooter: {
        display: 'none',  // .print-footer-row selector reveals via @media print in <style> above
        fontSize: 12, color: '#a1b8cd', textAlign: 'center', paddingTop: 20,
    },
};
