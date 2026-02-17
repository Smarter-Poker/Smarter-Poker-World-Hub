/**
 * TAX REPORT PANEL
 * Futuristic Metal UI - Generate IRS-ready reports with W2-G tracking
 */

import { useState, useEffect } from 'react';
import { FileText, Download, Calendar, AlertTriangle, Loader2, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { METAL, GRADIENTS, GLOWS, ANIMATIONS } from './metalStyles';

export default function TaxReportPanel({ userId }) {
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState(null);

    const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

    const fetchPreview = async () => {
        setLoading(true);
        setError(null);
        setReport(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch(`/api/bankroll/tax-report?year=${selectedYear}&format=json`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch report');

            const data = await res.json();
            setReport(data);
        } catch (err) {
            console.error('Tax report error:', err);
            setError('FAILED TO GENERATE REPORT');
        } finally {
            setLoading(false);
        }
    };

    const downloadPDF = async () => {
        setDownloading(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch(`/api/bankroll/tax-report?year=${selectedYear}&format=pdf`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Download failed');

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `poker_tax_report_${selectedYear}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download error:', err);
            setError('DOWNLOAD FAILED');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div style={styles.container}>
            {/* LED Strip */}
            <div style={styles.ledStrip} />

            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerTitle}>
                    <FileText size={16} style={{ color: METAL.cyan }} />
                    <span>TAX REPORT GENERATOR</span>
                </div>
                <span style={styles.headerHint}>IRS-ready Logs With W2-G Tracking</span>
            </div>

            {/* Year Selector */}
            <div style={styles.selectorRow}>
                <label style={styles.selectorLabel}>
                    <Calendar size={14} />
                    TAX YEAR
                </label>
                <div style={styles.yearBtnGroup}>
                    {years.map(year => (
                        <button
                            key={year}
                            onClick={() => setSelectedYear(year)}
                            style={{
                                ...styles.yearBtn,
                                ...(selectedYear === year ? styles.yearBtnActive : {}),
                            }}
                        >
                            {year}
                        </button>
                    ))}
                </div>
            </div>

            {/* Action Buttons */}
            <div style={styles.actionRow}>
                <button
                    onClick={fetchPreview}
                    disabled={loading}
                    style={styles.previewBtn}
                >
                    {loading ? (
                        <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> GENERATING...</>
                    ) : (
                        <><FileText size={14} /> PREVIEW REPORT</>
                    )}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div style={styles.errorBox}>
                    <AlertTriangle size={14} />
                    {error}
                </div>
            )}

            {/* Report Preview */}
            {report && (
                <div style={styles.reportContainer}>
                    {/* Summary Stats */}
                    <div style={styles.statsGrid}>
                        <div style={styles.statBox}>
                            <div style={styles.statIcon}>
                                <TrendingUp size={16} />
                            </div>
                            <span style={styles.statValue}>
                                ${(report.summary?.totalWinnings || 0).toLocaleString()}
                            </span>
                            <span style={styles.statLabel}>GROSS WINNINGS</span>
                        </div>
                        <div style={styles.statBox}>
                            <div style={{ ...styles.statIcon, background: 'rgba(239,68,68,0.15)', borderColor: METAL.danger }}>
                                <TrendingDown size={16} style={{ color: METAL.danger }} />
                            </div>
                            <span style={{ ...styles.statValue, color: METAL.danger }}>
                                ${(report.summary?.totalLosses || 0).toLocaleString()}
                            </span>
                            <span style={styles.statLabel}>GROSS LOSSES</span>
                        </div>
                        <div style={styles.statBox}>
                            <div style={{ ...styles.statIcon, background: 'rgba(168,85,247,0.15)', borderColor: METAL.purple }}>
                                <DollarSign size={16} style={{ color: METAL.purple }} />
                            </div>
                            <span style={{
                                ...styles.statValue,
                                color: (report.summary?.netGamblingResult || 0) >= 0 ? METAL.success : METAL.danger
                            }}>
                                ${(report.summary?.netGamblingResult || 0).toLocaleString()}
                            </span>
                            <span style={styles.statLabel}>NET RESULT</span>
                        </div>
                    </div>

                    {/* Session Breakdown */}
                    <div style={styles.breakdownSection}>
                        <div style={styles.sectionHeader}>BREAKDOWN</div>
                        <div style={styles.breakdownGrid}>
                            <div style={styles.breakdownCard}>
                                <span style={styles.breakdownLabel}>CASH GAMES</span>
                                <span style={{
                                    ...styles.breakdownValue,
                                    color: (report.breakdown?.cashGame?.net || 0) >= 0 ? METAL.success : METAL.danger
                                }}>
                                    ${(report.breakdown?.cashGame?.net || 0).toLocaleString()}
                                </span>
                            </div>
                            <div style={styles.breakdownCard}>
                                <span style={styles.breakdownLabel}>TOURNAMENTS</span>
                                <span style={{
                                    ...styles.breakdownValue,
                                    color: (report.breakdown?.tournament?.net || 0) >= 0 ? METAL.success : METAL.danger
                                }}>
                                    ${(report.breakdown?.tournament?.net || 0).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* W2-G Alerts */}
                    {report.w2gEvents?.length > 0 && (
                        <div style={styles.w2gSection}>
                            <div style={styles.w2gHeader}>
                                <AlertTriangle size={14} style={{ color: METAL.warning }} />
                                W2-G REPORTABLE ({report.w2gEvents.length})
                            </div>
                            {report.w2gEvents.map((event, i) => (
                                <div key={i} style={styles.w2gRow}>
                                    <div>
                                        <span style={styles.w2gDate}>{event.date}</span>
                                        <span style={styles.w2gVenue}>{event.venue}</span>
                                    </div>
                                    <span style={styles.w2gAmount}>
                                        ${event.amount?.toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Download Button */}
                    <button
                        onClick={downloadPDF}
                        disabled={downloading}
                        style={styles.downloadBtn}
                    >
                        {downloading ? (
                            <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> GENERATING PDF...</>
                        ) : (
                            <><Download size={16} /> DOWNLOAD PDF</>
                        )}
                    </button>
                </div>
            )}

            <style jsx global>{ANIMATIONS}</style>
        </div>
    );
}

const styles = {
    container: {
        position: 'relative',
        background: GRADIENTS.darkPanel,
        border: `1px solid ${METAL.mid}`,
        borderRadius: 12,
        overflow: 'hidden',
    },
    ledStrip: {
        position: 'absolute',
        top: 0,
        left: '10%',
        right: '10%',
        height: 2,
        background: METAL.cyan,
        boxShadow: GLOWS.cyanSubtle,
    },
    header: {
        padding: '16px 18px',
        borderBottom: `1px solid ${METAL.mid}`,
    },
    headerTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.15em',
        color: '#fff',
        marginBottom: 4,
    },
    headerHint: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        marginLeft: 24,
    },
    selectorRow: {
        padding: '16px 18px',
        borderBottom: `1px solid ${METAL.mid}`,
    },
    selectorLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.15em',
        marginBottom: 10,
    },
    yearBtnGroup: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
    },
    yearBtn: {
        padding: '8px 16px',
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.mid}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 13,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.6)',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    yearBtnActive: {
        background: METAL.cyanDim,
        borderColor: METAL.cyan,
        color: METAL.cyan,
        boxShadow: GLOWS.cyanSubtle,
    },
    actionRow: {
        padding: '16px 18px',
    },
    previewBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '14px',
        background: GRADIENTS.cyanAction,
        border: 'none',
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 13,
        fontWeight: 700,
        color: '#000',
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        margin: '0 18px 16px',
        padding: '14px',
        background: 'rgba(239,68,68,0.1)',
        border: `1px solid ${METAL.danger}`,
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        fontWeight: 600,
        color: METAL.danger,
        letterSpacing: '0.1em',
    },
    reportContainer: {
        padding: '0 18px 18px',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
        marginBottom: 16,
    },
    statBox: {
        padding: 14,
        background: 'rgba(0,0,0,0.3)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 10,
        textAlign: 'center',
    },
    statIcon: {
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 8px',
        background: METAL.cyanDim,
        border: `1px solid ${METAL.cyan}`,
        borderRadius: '50%',
        color: METAL.cyan,
    },
    statValue: {
        display: 'block',
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 16,
        fontWeight: 700,
        color: METAL.cyan,
        textShadow: `0 0 10px ${METAL.cyanGlow}`,
    },
    statLabel: {
        display: 'block',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 9,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: '0.1em',
        marginTop: 4,
    },
    breakdownSection: {
        marginBottom: 16,
    },
    sectionHeader: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.15em',
        marginBottom: 10,
    },
    breakdownGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
    },
    breakdownCard: {
        padding: 14,
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 8,
        textAlign: 'center',
    },
    breakdownLabel: {
        display: 'block',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.1em',
        marginBottom: 4,
    },
    breakdownValue: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 18,
        fontWeight: 700,
    },
    w2gSection: {
        background: 'rgba(245,158,11,0.08)',
        border: `1px solid ${METAL.warning}`,
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 16,
    },
    w2gHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 14px',
        background: 'rgba(245,158,11,0.1)',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        color: METAL.warning,
        letterSpacing: '0.1em',
        borderBottom: `1px solid ${METAL.warning}`,
    },
    w2gRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: `1px solid rgba(245,158,11,0.2)`,
    },
    w2gDate: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
        marginRight: 8,
    },
    w2gVenue: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
    },
    w2gAmount: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: METAL.warning,
    },
    downloadBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
        padding: '16px',
        background: GRADIENTS.purplePro,
        border: 'none',
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '0.1em',
        cursor: 'pointer',
        boxShadow: `0 4px 20px ${METAL.purpleGlow}`,
    },
};
