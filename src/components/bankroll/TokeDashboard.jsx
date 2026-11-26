/**
 * TOKE DASHBOARD — Dealer Bankroll Manager Analytics
 * ═══════════════════════════════════════════════════════════════
 * Career KPI strip + 3 charts (cumulative trend, per-event bar,
 * down-type donut). Mirrors BankrollTrendChart design patterns.
 * ═══════════════════════════════════════════════════════════════
 */

import view from './toke/TokeWorkspace.module.css';
import { memo, useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import ResponsiveTable from '../ui/ResponsiveTable';
import { getTokeAnalytics } from '../../lib/bankroll/tokeSelectors';

const TokeEarningsChart = dynamic(() => import('./toke/TokeEarningsChart'), { ssr: false });

// ── Chart tab definitions ──────────────────────────────────────
const CHART_TABS = [
    { id: 'trend', label: 'Trend' },
    { id: 'events', label: 'Per Event' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'types', label: 'Down Types' },
];

const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// ── KPI Tile ───────────────────────────────────────────────────
function KpiTile({ label, value, sub, color }) {
    return (
        <div className={'sd-metric ' + view.metricText}>
            <strong style={{ color }}>{value}</strong>
            <span>{label}</span>
            {sub && <small>{sub}</small>}
        </div>
    );
}

function ChartDataTable({ activeChart, trendData, monthlyData, donutData }) {
    const series = activeChart === 'types' ? donutData : activeChart === 'monthly' ? monthlyData : trendData;
    if (!series.length) return null;
    const tokes = { key: 'tokes', label: 'Tokes', align: 'right', render: row => fmt(row.tokes) };
    const columns = activeChart === 'types'
        ? [{ key: 'name', label: 'Down Type' }, { key: 'value', label: 'Downs', align: 'right' }]
        : activeChart === 'monthly'
            ? [{ key: 'month', label: 'Month' }, tokes, { key: 'events', label: 'Events', align: 'right' }]
            : [{ key: 'date', label: 'Date' }, { key: 'venue', label: 'Venue' }, tokes,
                activeChart === 'events' ? { key: 'hours', label: 'Hours', align: 'right' }
                    : { key: 'cumulative', label: 'Cumulative', align: 'right', render: row => fmt(row.cumulative) }];
    return (
        <details className={view.chartData}>
            <summary>View Chart Data</summary>
            <ResponsiveTable columns={columns} rows={series} caption={CHART_TABS.find(t => t.id === activeChart).label + ' Data'} />
        </details>
    );
}

// ── Main Component ─────────────────────────────────────────────
function TokeDashboard({ userId, refreshTrigger, initiallyExpanded = false }) {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeChart, setActiveChart] = useState('trend');
    const [expanded, setExpanded] = useState(initiallyExpanded);
    const [loadError, setLoadError] = useState(false);

    const load = useCallback(async () => {
        if (!userId) return;
        try {
            setLoading(true);
            setLoadError(false);
            const data = await getTokeAnalytics(userId);
            setAnalytics(data);
        } catch (err) {
            setLoadError(true);
            console.warn('TokeDashboard analytics error:', err);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(); }, [load, refreshTrigger]);

    // ── Bus listener: auto-refresh when toke data changes in other components ──
    useEffect(() => {
        const handleUpdate = () => load();
        window.addEventListener('toke-data-updated', handleUpdate);
        window.addEventListener('toke-gig-completed', handleUpdate);
        window.addEventListener('bankroll-updated', handleUpdate);
        return () => {
            window.removeEventListener('toke-data-updated', handleUpdate);
            window.removeEventListener('toke-gig-completed', handleUpdate);
            window.removeEventListener('bankroll-updated', handleUpdate);
        };
    }, [load]);

    // ── Chart data prep ──────────────────────────────────────
    const trendData = useMemo(() => {
        if (!analytics?.eventTrend) return [];
        return analytics.eventTrend.map(e => ({
            ...e,
            date: new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        }));
    }, [analytics]);

    const monthlyData = useMemo(() => analytics?.monthlyTrend || [], [analytics]);

    const donutData = useMemo(() => {
        if (!analytics) return [];
        const { cash, tournament, brush, break: brk } = analytics.downTypes;
        return [
            { name: 'Cash Game', value: cash, color: '#3b82f6' },
            { name: 'Tournament', value: tournament, color: '#85d8fb' },
            { name: 'Brush', value: brush, color: '#8cdeee' },
            { name: 'Break', value: brk, color: '#8aa9cb' },
        ].filter(d => d.value > 0);
    }, [analytics]);

    const totalDowns = useMemo(() => donutData.reduce((s, d) => s + d.value, 0), [donutData]);

    // ── Empty state ──────────────────────────────────────────
    const hasData = analytics && analytics.totalEvents > 0;

    // ── Main render ──────────────────────────────────────────
    return (
        <section className={"sd-panel " + view.panel}>
            {/* Collapsible header */}
            <button type="button" className={view.disclosure} aria-expanded={expanded} onClick={() => setExpanded(e => !e)}>
                <div style={S.headerLeft}>
                    <div>
                        <div className="sd-section-title">Earnings Overview</div>
                        <div style={S.headerSub}>
                            {!userId ? 'Sign In To View Your Earnings' : loading ? 'Loading…' : loadError ? 'Earnings Unavailable' : hasData
                                ? `${analytics.totalEvents} Events · ${fmt(analytics.careerTokes)} Career Tokes`
                                : 'Complete Your First Event To See Analytics'}
                        </div>
                    </div>
                </div>
                <span style={{ ...S.chevron, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
            </button>

            {expanded && (
                <div style={S.body}>
                    {!userId ? <p className={view.status}>Sign In To View Your Dealer Earnings.</p> : loading ? (
                        <div aria-label="Loading Earnings" role="status" style={S.loadingRow}>
                            <div style={S.skeleton} />
                            <div style={S.skeleton} />
                            <div style={{ ...S.skeleton, height: 200, width: '100%' }} />
                        </div>
                    ) : loadError ? (
                        <div role="alert" className={view.status}>
                            Earnings Could Not Be Loaded.
                            <button type="button" className="sd-button" onClick={load}>Retry</button>
                        </div>
                    ) : (
                        <>
                            {/* ── KPI Strip ── */}
                            <div className={view.metrics}>
                                <KpiTile
                                    label="Career Tokes"
                                    value={fmt(analytics?.careerTokes || 0)}
                                    color="#85d8fb"
                                />
                                <KpiTile
                                    label="Total Events"
                                    value={analytics?.totalEvents || 0}
                                    color="#dce8f6"
                                />
                                <KpiTile
                                    label="Hours Worked"
                                    value={`${analytics?.totalHours || 0}h`}
                                    color="#60a5fa"
                                />
                                <KpiTile
                                    label="Avg / Down"
                                    value={fmt(analytics?.avgTokePerDown || 0)}
                                    color="#9ee5f3"
                                />
                                <KpiTile
                                    label="Best Event"
                                    value={analytics?.bestEvent ? fmt(analytics.bestEvent.tokes) : '-'}
                                    sub={analytics?.bestEvent?.venueName || null}
                                    color="#bdd4ea"
                                />
                            </div>

                            {/* ── Chart Tabs ── */}
                            <div className={"sd-tabs " + view.chartChoices} role="group" aria-label="Earnings Charts">
                                {CHART_TABS.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveChart(tab.id)}
                                        type="button" className="sd-button" aria-pressed={activeChart === tab.id}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* ── Chart Area ── */}
                            <div style={S.chartArea}>
                                <TokeEarningsChart {...{ activeChart, trendData, monthlyData, donutData, totalDowns, fmt }} />
                                <ChartDataTable {...{ activeChart, trendData, monthlyData, donutData }} />
                            </div>

                            {/* ── Export Buttons ── */}
                            {hasData && (
                                <div style={S.exportRow}>
                                    <button
                                        className="sd-button"
                                        onClick={() => {
                                            const a = analytics;
                                            const lines = [
                                                `TOKE ANALYTICS SUMMARY`,
                                                `Generated: ${new Date().toLocaleDateString()}`,
                                                ``,
                                                `Career Tokes:   ${fmt(a.careerTokes)}`,
                                                `Total Events:   ${a.totalEvents}`,
                                                `Hours Worked:   ${a.totalHours}h`,
                                                `Avg Toke/Down:  ${fmt(a.avgTokePerDown)}`,
                                                `Best Event:     ${a.bestEvent ? `${fmt(a.bestEvent.tokes)} at ${a.bestEvent.venueName}` : '-'}`,
                                                ``,
                                                `Down Distribution:`,
                                                `  Cash:       ${a.downTypes?.cash || 0}`,
                                                `  Tournament: ${a.downTypes?.tournament || 0}`,
                                                `  Brush:      ${a.downTypes?.brush || 0}`,
                                                `  Break:      ${a.downTypes?.break || 0}`,
                                            ];
                                            if (a.monthlyTrend?.length) {
                                                lines.push(``, `Monthly Breakdown:`);
                                                for (const m of a.monthlyTrend) {
                                                    if (m.tokes > 0) lines.push(`  ${m.month}: ${fmt(m.tokes)} (${m.events} event${m.events !== 1 ? 's' : ''})`);
                                                }
                                            }
                                            navigator.clipboard.writeText(lines.join('\n'))
                                                .then(() => { /* silent success toast handled by parent */ })
                                                .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                                        }}
                                    >
                                        Copy Summary
                                    </button>
                                    <button
                                        className="sd-button"
                                        onClick={() => {
                                            const a = analytics;
                                            const rows = [
                                                ['Metric', 'Value'],
                                                ['Career Tokes', a.careerTokes || 0],
                                                ['Total Events', a.totalEvents || 0],
                                                ['Hours Worked', a.totalHours || 0],
                                                ['Avg Toke/Down', a.avgTokePerDown || 0],
                                                ['Best Event Tokes', a.bestEvent?.tokes || 0],
                                                ['Best Event Venue', a.bestEvent?.venueName || ''],
                                                ['Cash Downs', a.downTypes?.cash || 0],
                                                ['Tournament Downs', a.downTypes?.tournament || 0],
                                                ['Brush Downs', a.downTypes?.brush || 0],
                                                ['Break Downs', a.downTypes?.break || 0],
                                            ];
                                            if (a.eventTrend?.length) {
                                                rows.push([], ['Event Date', 'Venue', 'Tokes', 'Hours', 'Cumulative']);
                                                for (const e of a.eventTrend) {
                                                    rows.push([e.date, e.venue, e.tokes, e.hours, e.cumulative]);
                                                }
                                            }
                                            if (a.monthlyTrend?.length) {
                                                rows.push([], ['Month', 'Tokes', 'Events']);
                                                for (const m of a.monthlyTrend) {
                                                    rows.push([m.month, m.tokes, m.events]);
                                                }
                                            }
                                            const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
                                            const blob = new Blob([csv], { type: 'text/csv' });
                                            const url = URL.createObjectURL(blob);
                                            const link = document.createElement('a');
                                            link.href = url;
                                            link.download = `toke-analytics-${new Date().toISOString().split('T')[0]}.csv`;
                                            link.click();
                                            URL.revokeObjectURL(url);
                                        }}
                                    >
                                        Download CSV
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </section>
    );
}
// ── Styles ─────────────────────────────────────────────────────
const S = {
    headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
    headerSub: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
    chevron: { fontSize: 18, color: '#85d8fb', transition: 'transform 0.2s', lineHeight: 1 },

    body: { padding: '0 14px 16px', borderTop: '1px solid rgba(255,255,255,0.07)' },

    loadingRow: { display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14 },
    skeleton: {
        height: 72, borderRadius: 10,
        background: 'linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.1),rgba(255,255,255,0.06))',
        animation: 'pulse 1.5s infinite',
    },

    chartArea: {
        minHeight: 200,
    },
    exportRow: {
        display: 'flex', gap: 8, marginTop: 14,
        borderTop: '1px solid rgba(255,255,255,0.07)',
        paddingTop: 12,
    },
};

export default memo(TokeDashboard);
