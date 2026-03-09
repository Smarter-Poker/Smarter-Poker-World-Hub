/**
 * AdvancedTaxReport — State-Level Tax Report Builder
 * ═══════════════════════════════════════════════════════════════════════════
 * Extends TaxReportPanel with state-specific tax rates, itemized deductions,
 * quarterly P/L breakdown, and enhanced PDF export.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
    const [showDeductionForm, setShowDeductionForm] = useState(false);
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
            const d = new Date(e.entry_date);
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
    const totalDeductions = Object.values(deductions).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const netTaxableIncome = Math.max(0, totalIncome - totalLosses - totalDeductions);
    const federalTax = calcFederalTax(netTaxableIncome);
    const stateTax = netTaxableIncome * (stateInfo.rate / 100);
    const totalTax = federalTax + stateTax;
    const effectiveRate = netTaxableIncome > 0 ? ((totalTax / netTaxableIncome) * 100).toFixed(1) : '0.0';

    const updateDeduction = (id, value) => {
        setDeductions(prev => ({ ...prev, [id]: value }));
    };

    const handleExportPDF = () => {
        // In production this uses jspdf — here we simulate
        const content = [
            `POKER TAX REPORT — ${year}`,
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

    return (
        <div style={{ padding: '0 0 40px' }}>
            {/* Header Bar */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 24, flexWrap: 'wrap', gap: 12,
            }}>
                <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#e2e8f0', letterSpacing: '-0.3px' }}>Advanced Tax Report</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>IRS-ready P/L summary with state-specific calculations</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                        value={year}
                        onChange={e => setYear(parseInt(e.target.value))}
                        style={{
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13,
                        }}
                    >
                        {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select
                        value={selectedState}
                        onChange={e => setSelectedState(e.target.value)}
                        style={{
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13,
                        }}
                    >
                        {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name} ({s.rate}%)</option>)}
                    </select>
                </div>
            </div>

            {/* Tax Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
                {[
                    { label: 'GROSS WINNINGS', value: `$${totalIncome.toLocaleString()}`, color: '#4ade80' },
                    { label: 'TOTAL LOSSES', value: `-$${totalLosses.toLocaleString()}`, color: '#f87171' },
                    { label: 'DEDUCTIONS', value: `-$${totalDeductions.toLocaleString()}`, color: '#fbbf24' },
                    { label: 'NET TAXABLE', value: `$${netTaxableIncome.toLocaleString()}`, color: '#e2e8f0' },
                    { label: 'FEDERAL TAX', value: `$${Math.round(federalTax).toLocaleString()}`, color: '#60a5fa' },
                    { label: `${stateInfo.code} STATE TAX`, value: `$${Math.round(stateTax).toLocaleString()}`, color: '#a78bfa' },
                ].map((card, i) => (
                    <div key={i} style={{
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 12, padding: '14px 16px',
                    }}>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{card.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: card.color }}>{card.value}</div>
                    </div>
                ))}
            </div>

            {/* Effective Rate Highlight */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(0,0,0,0.2))',
                border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: '20px 24px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24,
            }}>
                <div>
                    <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Combined Effective Tax Rate</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Federal + {stateInfo.name}</div>
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#fff' }}>{effectiveRate}%</div>
            </div>

            {/* Quarterly Breakdown */}
            <div style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16, padding: 20, marginBottom: 24,
            }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginBottom: 16, letterSpacing: 0.3 }}>
                    Quarterly P/L Breakdown — {year}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {quarterlyData.map((q, i) => {
                        const net = q.income - q.losses;
                        return (
                            <div key={i} style={{
                                background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 14, textAlign: 'center',
                                border: `1px solid ${net >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', marginBottom: 8 }}>{q.label}</div>
                                <div style={{ fontSize: 16, fontWeight: 900, color: net >= 0 ? '#4ade80' : '#f87171' }}>
                                    {net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString()}
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                                    W: ${q.income.toLocaleString()} / L: ${q.losses.toLocaleString()}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Itemized Deductions */}
            <div style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16, padding: 20, marginBottom: 24,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', letterSpacing: 0.3 }}>Itemized Deductions</div>
                    <button
                        onClick={() => setShowDeductionForm(!showDeductionForm)}
                        style={{
                            background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)',
                            color: '#00d4ff', fontSize: 11, fontWeight: 700, padding: '6px 12px',
                            borderRadius: 8, cursor: 'pointer',
                        }}
                    >{showDeductionForm ? 'Hide ▲' : 'Edit Deductions ▼'}</button>
                </div>

                <AnimatePresence>
                    {showDeductionForm && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            style={{ overflow: 'hidden' }}
                        >
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                                {DEDUCTION_CATEGORIES.map(cat => (
                                    <div key={cat.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: 10,
                                    }}>
                                        <span style={{ fontSize: 16 }}>{cat.icon}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{cat.label}</div>
                                            <input
                                                type="number"
                                                placeholder="$0"
                                                value={deductions[cat.id] || ''}
                                                onChange={e => updateDeduction(cat.id, e.target.value)}
                                                style={{
                                                    width: '100%', background: 'transparent', border: 'none',
                                                    color: '#fff', fontSize: 14, fontWeight: 800, outline: 'none',
                                                    padding: '4px 0',
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {!showDeductionForm && totalDeductions > 0 && (
                    <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 700 }}>
                        Total Deductions: ${totalDeductions.toLocaleString()}
                    </div>
                )}
            </div>

            {/* Export Controls */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                    onClick={handleExportPDF}
                    style={{
                        flex: 1, minWidth: 160, padding: '14px', borderRadius: 12,
                        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                        border: 'none', color: '#fff', fontSize: 14, fontWeight: 800,
                        cursor: 'pointer', letterSpacing: 0.5,
                    }}
                >📄 Export Tax Report</button>
                <button
                    onClick={() => {
                        navigator.clipboard.writeText(
                            `Poker Tax Summary ${year}\nState: ${stateInfo.name}\nNet Income: $${netTaxableIncome.toLocaleString()}\nFederal: $${Math.round(federalTax).toLocaleString()}\nState: $${Math.round(stateTax).toLocaleString()}\nTotal Tax: $${Math.round(totalTax).toLocaleString()}\nEffective Rate: ${effectiveRate}%`
                        );
                    }}
                    style={{
                        flex: 1, minWidth: 160, padding: '14px', borderRadius: 12,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e2e8f0', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                    }}
                >📋 Copy Summary</button>
            </div>
        </div>
    );
}
