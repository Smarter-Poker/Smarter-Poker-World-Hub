/**
 * AdvancedTaxReport — State-Level Tax Report Builder
 * ═══════════════════════════════════════════════════════════════════════════
 * Extends TaxReportPanel with state-specific tax rates, itemized deductions,
 * quarterly P/L breakdown, and enhanced PDF export.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import styles from './BankrollForms.module.css';
import { fetchReportLedger } from '../../lib/bankroll/bankrollSelectors';
import { estimateTax, lossDeductionRate, taxYearTotals } from '../../lib/bankroll/taxMath.mjs';

// ═══════════════════════════════════════════════════════════════════════════
// US STATE TAX DATA
// ═══════════════════════════════════════════════════════════════════════════

const US_STATES = [
    { code: 'FED', name: 'Federal Only', rate: 0 },
    { code: 'NV', name: 'Nevada', rate: 0 },
    { code: 'FL', name: 'Florida', rate: 0 },
    { code: 'TX', name: 'Texas', rate: 0 },
    { code: 'CA', name: 'California', rate: 13.3 },
    { code: 'NY', name: 'New York', rate: 10.9 },
    { code: 'NJ', name: 'New Jersey', rate: 10.75 },
    { code: 'PA', name: 'Pennsylvania', rate: 3.07 },
    { code: 'IL', name: 'Illinois', rate: 4.95 },
    { code: 'MI', name: 'Michigan', rate: 4.25 },
    { code: 'OH', name: 'Ohio', rate: 3.99 },
    { code: 'CT', name: 'Connecticut', rate: 6.99 },
    { code: 'MA', name: 'Massachusetts', rate: 5.0 },
    { code: 'WA', name: 'Washington', rate: 0 },
    { code: 'CO', name: 'Colorado', rate: 4.4 },
    { code: 'AZ', name: 'Arizona', rate: 2.5 },
    { code: 'GA', name: 'Georgia', rate: 5.49 },
    { code: 'MD', name: 'Maryland', rate: 5.75 },
];

const DEDUCTION_CATEGORIES = [
    { id: 'travel', label: 'Travel & Lodging' },
    { id: 'buyins', label: 'Tournament Buy-ins' },
    { id: 'coaching', label: 'Coaching & Training' },
    { id: 'software', label: 'Software & Subscriptions' },
    { id: 'tips', label: 'Tips & Gratuities' },
    { id: 'meals', label: 'Meals (50%)' },
    { id: 'equipment', label: 'Equipment' },
    { id: 'other', label: 'Other Expenses' },
];

const money = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v || 0);

// The tax year is read on its own: Jan 1 to Dec 31, every location, every
// trip. The dashboard's rows are filtered by its time and venue pickers and
// hide active trips, so feeding them in produced a "tax year" of 30 days.
function useTaxYearLedger(userId, year, fallbackEntries) {
    const [state, setState] = useState({ key: null, rows: null, error: null });
    const [attempt, setAttempt] = useState(0);
    const key = userId ? userId + ':' + year + ':' + attempt : null;
    useEffect(() => {
        if (!userId) return undefined;
        let live = true;
        setState(prev => (prev.key === key ? prev : { key, rows: null, error: null }));
        fetchReportLedger(userId, { startDate: year + '-01-01', endDate: year + '-12-31', includeExpenses: true })
            .then(rows => { if (live) setState({ key, rows, error: null }); })
            .catch(() => { if (live) setState({ key, rows: null, error: 'Could Not Load Your ' + year + ' Ledger.' }); });
        return () => { live = false; };
    }, [userId, year, key]);
    const retry = useCallback(() => setAttempt(n => n + 1), []);
    if (!userId) return { rows: fallbackEntries, error: null, loading: false, retry };
    const current = state.key === key ? state : { rows: null, error: null };
    return { rows: current.rows, error: current.error, loading: !current.rows && !current.error, retry };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function AdvancedTaxReport({ entries = [], userId }) {
    const [selectedState, setSelectedState] = useState('FED');
    const [deductions, setDeductions] = useState({});
    const [copyMessage, setCopyMessage] = useState('');
    const [year, setYear] = useState(new Date().getFullYear());
    const ledger = useTaxYearLedger(userId, year, entries);

    const stateInfo = US_STATES.find(s => s.code === selectedState) || US_STATES[0];
    const totals = useMemo(() => taxYearTotals(ledger.rows || [], year), [ledger.rows, year]);
    const totalDeductions = Object.values(deductions || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const estimate = estimateTax(totals, { stateRate: stateInfo.rate, deductions: totalDeductions });
    const capped = lossDeductionRate(year) < 1;

    const updateDeduction = (id, value) => {
        setDeductions(prev => ({ ...prev, [id]: value }));
    };

    const figures = [
        ['Gross Winnings', totals.winnings],
        ['Gambling Losses', -totals.losses],
        [capped ? 'Deductible Losses (90%)' : 'Deductible Losses', -totals.deductibleLosses],
        ['Other Deductions', -totalDeductions],
        ['Net Taxable', estimate.taxable],
        ['Federal Estimate', estimate.federal],
        ['State Estimate', estimate.state],
        ['Recorded Expenses', -totals.recordedExpenses],
    ];
    const summaryLines = () => [
        'Poker Tax Summary ' + year,
        'State: ' + stateInfo.name + ' (' + stateInfo.code + ')',
        'Gaming Sessions: ' + totals.sessions,
        ...figures.map(([label, amount]) => label + ': ' + money(amount)),
        'Total Estimated Tax: ' + money(estimate.total),
        'Effective Rate: ' + estimate.effectiveRate + '%',
        ...totals.quarters.map(q => q.label + ': Winnings ' + money(q.winnings) + ', Losses ' + money(-q.losses) + ', Net ' + money(q.net)),
        'Estimate for a single filer with no other income. Consult a tax professional.',
    ];

    const downloadTaxSummary = () => {
        const blob = new Blob([summaryLines().join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `poker-tax-report-${year}-${stateInfo.code}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const thisYear = new Date().getFullYear();
    const years = Array.from(new Set([year, ...entries.map(e => Number(String(e.entry_date || '').slice(0, 4))).filter(y => y > 1900 && y <= thisYear), ...Array.from({ length: 5 }, (_, i) => thisYear - i)])).sort((a, b) => b - a);
    async function copy() {
        try {
            await navigator.clipboard.writeText(summaryLines().join('\n'));
            setCopyMessage('Summary Copied');
        } catch { setCopyMessage('Copy Unavailable. Use Export Tax Report.'); }
    }
    const ready = !ledger.loading && !ledger.error;
    return <section className={'sd-panel ' + styles.tax} aria-label="State Tax Report" aria-busy={ledger.loading}>
        <div className={styles.heading}><h2>State Tax Report</h2></div>
        <div className={styles.filters}>
            <label className={styles.field}>Tax Year<select value={year} onChange={e => { setYear(Number(e.target.value)); setCopyMessage(''); }}>
                {years.map(y => <option key={y}>{y}</option>)}</select></label>
            <label className={styles.field}>Jurisdiction<select value={selectedState} onChange={e => { setSelectedState(e.target.value); setCopyMessage(''); }}>
                {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
        </div>
        {ledger.loading && <p role="status">Loading Your {year} Ledger…</p>}
        {ledger.error && <p role="alert">{ledger.error} <button type="button" className="sd-button" onClick={ledger.retry}>Retry</button></p>}
        {ready && <>
        <div className={styles.readout}><span>Total Estimated Tax</span><strong>{money(estimate.total)}</strong></div>
        <dl className={styles.figures}>{figures.map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{money(amount)}</dd></div>)}</dl>
        <div className={styles.heading}><span>Combined Effective Rate</span><strong>{estimate.effectiveRate}%</strong></div>
        <p>{totals.sessions === 0 ? 'No Gaming Sessions Are Logged For ' + year + '.' : totals.sessions + ' Gaming ' + (totals.sessions === 1 ? 'Session' : 'Sessions') + ' Logged In ' + year + '.'}
            {capped ? ' From 2026 Only 90% Of Gambling Losses Can Be Deducted, And Never More Than Winnings.' : ' Losses Can Be Deducted Up To Winnings.'}
            {' '}Recorded Expenses Are Shown For Your Records And Are Not Subtracted. Estimate For A Single Filer With No Other Income.</p>
        <section aria-label="Quarterly Profit And Loss">
            <h3>Quarterly Results · {year}</h3>
            <div role="table" aria-label={'Quarterly Results ' + year}>
                <div role="row" className={styles.quarterHeader}>{['Quarter','Winnings','Losses','Net'].map(label => <span role="columnheader" key={label}>{label}</span>)}</div>
                {totals.quarters.map(q => <div key={q.label} role="row" className={styles.quarter}>
                    <strong role="rowheader">{q.label}</strong><span role="cell">{money(q.winnings)}</span><span role="cell">{money(-q.losses)}</span><strong role="cell">{money(q.net)}</strong>
                </div>)}
            </div>
        </section>
        <details><summary>Itemized Deductions</summary><div className={styles.deductions}>{DEDUCTION_CATEGORIES.map(cat =>
            <label className={styles.field} key={cat.id}>{cat.label}<input min="0" type="number" step="0.01" inputMode="decimal" placeholder="0.00" value={deductions[cat.id] || ''} onChange={e => { if (e.target.value === '' || Number(e.target.value) >= 0) updateDeduction(cat.id, e.target.value); setCopyMessage(''); }} /></label>)}</div></details>
        <div className={styles.actions}><button type="button" className="sd-button sd-primary" onClick={downloadTaxSummary}>Export Tax Report</button><button type="button" className="sd-button" onClick={copy}>Copy Summary</button></div>
        {copyMessage && <span role="status">{copyMessage}</span>}
        </>}
    </section>;
}
