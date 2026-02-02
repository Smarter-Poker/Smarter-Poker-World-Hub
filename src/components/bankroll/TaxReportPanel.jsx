/**
 * TAX REPORT PANEL COMPONENT
 * UI for generating and downloading poker tax reports
 */

import { useState } from 'react';
import { FileText, Download, Loader2, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';

export default function TaxReportPanel({ displayEUR = false }) {
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isLoading, setIsLoading] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [error, setError] = useState(null);

    // Generate year options (current year back to 2020)
    const currentYear = new Date().getFullYear();
    const yearOptions = Array.from({ length: currentYear - 2019 }, (_, i) => currentYear - i);

    const fetchPreview = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                setError('Not authenticated');
                return;
            }

            const response = await fetch(`/api/bankroll/tax-report?year=${selectedYear}&format=json`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch');

            const data = await response.json();
            setPreviewData(data);
        } catch (err) {
            console.error('Tax preview error:', err);
            setError('Failed to load tax data');
        } finally {
            setIsLoading(false);
        }
    };

    const downloadPDF = async () => {
        setIsLoading(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch(`/api/bankroll/tax-report?year=${selectedYear}&format=pdf`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `poker_tax_report_${selectedYear}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF download error:', err);
            setError('Failed to download PDF');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.titleRow}>
                    <FileText size={18} style={{ color: '#00D4FF' }} />
                    <h3 style={styles.title}>Tax Report Generator</h3>
                </div>
                <p style={styles.subtitle}>IRS-ready session logs with W2-G tracking</p>
            </div>

            {/* Year Selector */}
            <div style={styles.controls}>
                <div style={styles.yearSelect}>
                    <label style={styles.label}>Tax Year</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => {
                            setSelectedYear(Number(e.target.value));
                            setPreviewData(null);
                        }}
                        style={styles.select}
                    >
                        {yearOptions.map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={fetchPreview}
                    disabled={isLoading}
                    style={styles.previewBtn}
                >
                    {isLoading ? <Loader2 size={14} className="spin" /> : 'Preview'}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div style={styles.errorBox}>
                    <AlertTriangle size={14} />
                    {error}
                </div>
            )}

            {/* Preview Data */}
            {previewData && (
                <div style={styles.preview}>
                    {/* Summary Cards */}
                    <div style={styles.summaryGrid}>
                        <div style={styles.summaryCard}>
                            <div style={styles.cardLabel}>Gross Winnings</div>
                            <div style={{ ...styles.cardValue, color: '#22c55e' }}>
                                {formatCurrency(previewData.summary.totalWinnings, displayEUR)}
                            </div>
                        </div>
                        <div style={styles.summaryCard}>
                            <div style={styles.cardLabel}>Gross Losses</div>
                            <div style={{ ...styles.cardValue, color: '#ef4444' }}>
                                ({formatCurrency(previewData.summary.totalLosses, displayEUR)})
                            </div>
                        </div>
                        <div style={styles.summaryCard}>
                            <div style={styles.cardLabel}>Net Result</div>
                            <div style={{
                                ...styles.cardValue,
                                color: previewData.summary.netGamblingResult >= 0 ? '#22c55e' : '#ef4444'
                            }}>
                                {formatCurrency(previewData.summary.netGamblingResult, displayEUR)}
                            </div>
                        </div>
                        <div style={styles.summaryCard}>
                            <div style={styles.cardLabel}>Deductions</div>
                            <div style={{ ...styles.cardValue, color: '#f59e0b' }}>
                                ({formatCurrency(previewData.summary.totalExpenses, displayEUR)})
                            </div>
                        </div>
                    </div>

                    {/* Taxable Income */}
                    <div style={styles.taxableBox}>
                        <div style={styles.taxableLabel}>Estimated Taxable Income</div>
                        <div style={styles.taxableValue}>
                            {formatCurrency(previewData.summary.taxableIncome, displayEUR)}
                        </div>
                        <div style={styles.taxableNote}>
                            {previewData.summary.totalSessions} sessions across {previewData.summary.totalTrips} trips
                        </div>
                    </div>

                    {/* W2-G Warning */}
                    {previewData.w2gEvents?.length > 0 && (
                        <div style={styles.w2gWarning}>
                            <AlertTriangle size={14} />
                            <span>
                                {previewData.w2gEvents.length} W2-G reportable event(s) totaling{' '}
                                {formatCurrency(
                                    previewData.w2gEvents.reduce((sum, e) => sum + e.amount, 0),
                                    displayEUR
                                )}
                            </span>
                        </div>
                    )}

                    {/* Breakdown */}
                    <div style={styles.breakdown}>
                        <div style={styles.breakdownRow}>
                            <span>💰 Cash Games</span>
                            <span style={{ color: previewData.breakdown.cashGame.net >= 0 ? '#22c55e' : '#ef4444' }}>
                                {formatCurrency(previewData.breakdown.cashGame.net, displayEUR)}
                            </span>
                        </div>
                        <div style={styles.breakdownRow}>
                            <span>🏆 Tournaments</span>
                            <span style={{ color: previewData.breakdown.tournament.net >= 0 ? '#22c55e' : '#ef4444' }}>
                                {formatCurrency(previewData.breakdown.tournament.net, displayEUR)}
                            </span>
                        </div>
                    </div>

                    {/* Download Button */}
                    <button onClick={downloadPDF} style={styles.downloadBtn} disabled={isLoading}>
                        <Download size={14} />
                        Download Tax Report PDF
                    </button>
                </div>
            )}

            <style jsx global>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}

const styles = {
    container: {
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: 16,
    },
    header: {
        marginBottom: 16,
    },
    titleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    title: {
        fontSize: 15,
        fontWeight: 600,
        color: '#fff',
        margin: 0,
    },
    subtitle: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
        margin: 0,
    },
    controls: {
        display: 'flex',
        gap: 10,
        alignItems: 'flex-end',
        marginBottom: 16,
    },
    yearSelect: {
        flex: 1,
    },
    label: {
        display: 'block',
        fontSize: 10,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 4,
    },
    select: {
        width: '100%',
        padding: '8px 10px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        color: '#fff',
        fontSize: 13,
    },
    previewBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        background: 'rgba(0,212,255,0.1)',
        border: '1px solid rgba(0,212,255,0.3)',
        borderRadius: 6,
        color: '#00D4FF',
        fontSize: 12,
        cursor: 'pointer',
    },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: 10,
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 8,
        color: '#ef4444',
        fontSize: 12,
        marginBottom: 12,
    },
    preview: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    summaryGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
    },
    summaryCard: {
        padding: 10,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
        textAlign: 'center',
    },
    cardLabel: {
        fontSize: 9,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 4,
    },
    cardValue: {
        fontSize: 14,
        fontWeight: 700,
    },
    taxableBox: {
        padding: 14,
        background: 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(0,100,150,0.1))',
        border: '1px solid rgba(0,212,255,0.2)',
        borderRadius: 10,
        textAlign: 'center',
    },
    taxableLabel: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 4,
    },
    taxableValue: {
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
    },
    taxableNote: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 4,
    },
    w2gWarning: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: 10,
        background: 'rgba(245,158,11,0.1)',
        border: '1px solid rgba(245,158,11,0.3)',
        borderRadius: 8,
        color: '#f59e0b',
        fontSize: 11,
    },
    breakdown: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 10,
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 8,
    },
    breakdownRow: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
    },
    downloadBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '12px 0',
        background: 'linear-gradient(135deg, #00D4FF, #00A3CC)',
        border: 'none',
        borderRadius: 8,
        color: '#000',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
    },
};
