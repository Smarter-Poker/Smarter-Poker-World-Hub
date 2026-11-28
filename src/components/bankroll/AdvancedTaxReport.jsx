/**
 * AdvancedTaxReport — State-Level Tax Report Builder
 * ═══════════════════════════════════════════════════════════════════════════
 * Extends TaxReportPanel with state-specific tax rates, itemized deductions,
 * quarterly P/L breakdown, and enhanced PDF export.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo } from 'react';
import styles from './BankrollForms.module.css';
import { parseLedgerDay } from '../../lib/bankroll/localDates.mjs';

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

const FEDERAL_BRACKETS = [
    { min: 0, max: 11600, rate: 10 },
    { min: 11600, max: 47150, rate: 12 },
    { min: 47150, max: 100525, rate: 22 },
    { min: 100525, max: 191950, rate: 24 },
    { min: 191950, max: 243725, rate: 32 },
    { min: 243725, max: 609350, rate: 35 },
    { min: 609350, max: Infinity, rate: 37 },
];

const DEDUCTION_CATEGORIES = [
    { id: 'travel', label: 'Travel & Lodging', icon: '✈️' },
    { id: 'buyins', label: 'Tournament Buy-ins', icon: '🏆' },
    { id: 'coaching', label: 'Coaching & Training', icon: '📚' },
    { id: 'software', label: 'Software & Subscriptions', icon: '💻' },
    { id: 'tips', label: 'Tips & Gratuities', icon: '💵' },
    { id: 'meals', label: 'Meals (50%)', icon: '🍽️' },
    { id: 'equipment', label: 'Equipment', icon: '🖥️' },
    { id: 'other', label: 'Other Expenses', icon: '📋' },
];

function calcFederalTax(income) {
    if (income <= 0) return 0;
    let tax = 0;
    for (const bracket of FEDERAL_BRACKETS) {
        if (income <= bracket.min) break;
        const taxable = Math.min(income, bracket.max) - bracket.min;
        tax += taxable * (bracket.rate / 100);
    }
    return tax;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function AdvancedTaxReport({ entries = [], userId }) {
    const [selectedState, setSelectedState] = useState('FED');
    const [deductions, setDeductions] = useState({});
    const [copyMessage, setCopyMessage] = useState('');
    const [year, setYear] = useState(new Date().getFullYear());

    const stateInfo = US_STATES.find(s => s.code === selectedState) || US_STATES[0];

    // Compute quarterly P/L from entries
    const quarterlyData = useMemo(() => {
        const quarters = [
            { label: 'Q1 (Jan-Mar)', months: [0, 1, 2], income: 0, losses: 0 },
            { label: 'Q2 (Apr-Jun)', months: [3, 4, 5], income: 0, losses: 0 },
            { label: 'Q3 (Jul-Sep)', months: [6, 7, 8], income: 0, losses: 0 },
            { label: 'Q4 (Oct-Dec)', months: [9, 10, 11], income: 0, losses: 0 },
        ];
        for (const e of entries) {
            if (!e.entry_date) continue;
            const d = parseLedgerDay(e.entry_date);
            if (d.getFullYear() !== year) continue;
            const net = (e.gross_out || 0) - (e.gross_in || 0);
            const qIdx = Math.floor(d.getMonth() / 3);
            if (net > 0) quarters[qIdx].income += net;
            else quarters[qIdx].losses += Math.abs(net);
        }
        return quarters;
    }, [entries, year]);

    const totalIncome = quarterlyData.reduce((s, q) => s + q.income, 0);
    const totalLosses = quarterlyData.reduce((s, q) => s + q.losses, 0);
    const totalDeductions = Object.values(deductions || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const netTaxableIncome = Math.max(0, totalIncome - totalLosses - totalDeductions);
    const federalTax = calcFederalTax(netTaxableIncome);
    const stateTax = netTaxableIncome * (stateInfo.rate / 100);
    const totalTax = federalTax + stateTax;
    const effectiveRate = netTaxableIncome > 0 ? ((totalTax / netTaxableIncome) * 100).toFixed(1) : '0.0';

    const updateDeduction = (id, value) => {
        setDeductions(prev => ({ ...prev, [id]: value }));
    };

    const downloadTaxSummary = () => {
        const content = [
            `POKER TAX REPORT - ${year}`,
            `State: ${stateInfo.name} (${stateInfo.code})`,
            ``,
            `INCOME SUMMARY`,
            `Total Winnings: $${totalIncome.toLocaleString()}`,
            `Total Losses: -$${totalLosses.toLocaleString()}`,
            `Deductions: -$${totalDeductions.toLocaleString()}`,
            `Net Taxable: $${netTaxableIncome.toLocaleString()}`,
            ``,
            `TAX LIABILITY`,
            `Federal: $${federalTax.toLocaleString()}`,
            `State (${stateInfo.code}): $${stateTax.toLocaleString()}`,
            `Total: $${totalTax.toLocaleString()}`,
            `Effective Rate: ${effectiveRate}%`,
        ].join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `poker-tax-report-${year}-${stateInfo.code}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const money = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
    const years = Array.from(new Set([year, ...entries.map(e => Number(String(e.entry_date || '').slice(0, 4))).filter(y => y > 1900), ...Array.from({length: 3}, (_, i) => new Date().getFullYear() - i)])).sort((a, b) => b - a);
    const figures = [
        ['Gross Winnings', totalIncome], ['Total Losses', -totalLosses], ['Deductions', -totalDeductions],
        ['Net Taxable', netTaxableIncome], ['Federal Estimate', federalTax], ['State Estimate', stateTax],
    ];
    async function copy() {
        try {
            await navigator.clipboard.writeText([
                'Poker Tax Summary ' + year, stateInfo.name, ...figures.map(([label, amount]) => label + ' ' + money(amount || 0)),
                'Total Estimated Tax ' + money(totalTax), 'Effective Rate ' + effectiveRate + '%',
            ].join('\n'));
            setCopyMessage('Summary Copied');
        } catch { setCopyMessage('Copy Unavailable. Use Export Tax Report.'); }
    }
    return <section className={'sd-panel ' + styles.tax} aria-label="State Tax Report">
        <div className={styles.heading}><h2>State Tax Report</h2></div>
        <div className={styles.filters}>
            <label className={styles.field}>Tax Year<select value={year} onChange={e => { setYear(Number(e.target.value)); setCopyMessage(''); }}>
                {years.map(y => <option key={y}>{y}</option>)}</select></label>
            <label className={styles.field}>Jurisdiction<select value={selectedState} onChange={e => { setSelectedState(e.target.value); setCopyMessage(''); }}>
                {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
        </div>
        <div className={styles.readout}><span>Total Estimated Tax</span><strong>{money(totalTax)}</strong></div>
        <dl className={styles.figures}>{figures.map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{money(amount || 0)}</dd></div>)}</dl>
        <div className={styles.heading}><span>Combined Effective Rate</span><strong>{effectiveRate}%</strong></div>
        <section aria-label="Quarterly Profit And Loss">
            <h3>Quarterly Results · {year}</h3>
            <div role="table" aria-label={'Quarterly Results ' + year}>
                <div role="row" className={styles.quarterHeader}>{['Quarter','Winnings','Losses','Net'].map(label => <span role="columnheader" key={label}>{label}</span>)}</div>
                {quarterlyData.map(q => <div key={q.label} role="row" className={styles.quarter}>
                    <strong role="rowheader" title={q.label}>{q.label.slice(0,2)}</strong><span role="cell">{money(q.income)}</span><span role="cell">{money(-q.losses || 0)}</span><strong role="cell">{money(q.income-q.losses)}</strong>
                </div>)}
            </div>
        </section>
        <details><summary>Itemized Deductions</summary><div className={styles.deductions}>{DEDUCTION_CATEGORIES.map(cat =>
            <label className={styles.field} key={cat.id}>{cat.label}<input min="0" type="number" step="0.01" inputMode="decimal" placeholder="0.00" value={deductions[cat.id] || ''} onChange={e => { if (Number(e.target.value) >= 0) updateDeduction(cat.id, e.target.value); setCopyMessage(''); }} /></label>)}</div></details>
        <div className={styles.actions}><button type="button" className="sd-button sd-primary" onClick={downloadTaxSummary}>Export Tax Report</button><button type="button" className="sd-button" onClick={copy}>Copy Summary</button></div>
        {copyMessage && <span role="status">{copyMessage}</span>}
    </section>;
}
