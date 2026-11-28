/**
 * TOKE DASHBOARD — Dealer Bankroll Manager Analytics
 * ═══════════════════════════════════════════════════════════════
 * Career KPI strip + 3 charts (cumulative trend, per-event bar,
 * down-type donut). Mirrors BankrollTrendChart design patterns.
 * ═══════════════════════════════════════════════════════════════
 */

import desk from './toke/DealerAnalytics.module.css';
import { Activity, BarChart3, CalendarDays, ChevronDown, Clock3, Coins, Copy, Download, List, Trophy } from 'lucide-react';
import { safeCopyToClipboard } from '../../lib/clipboard';
import { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import ResponsiveTable from '../ui/ResponsiveTable';
import { getTokeAnalytics } from '../../lib/bankroll/tokeSelectors';
import { localDay } from '../../lib/bankroll/localDates.mjs';
import { buildTokeAnalyticsCsv, downloadCsv } from '../../lib/bankroll/tokeReport.mjs';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';

const TokeEarningsChart = dynamic(() => import('./toke/TokeEarningsChart'), { ssr: false });

// ── Chart tab definitions ──────────────────────────────────────
const CHART_TABS = [
    { id: 'trend', label: 'Trend', title: 'Cumulative Tokes' },
    { id: 'events', label: 'Per Event', title: 'Tokes Per Event' },
    { id: 'monthly', label: 'Monthly', title: 'Monthly Earnings' },
    { id: 'types', label: 'Down Types', title: 'Down Distribution' },
];

function localDate(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

// Copied summaries are exports: they stay in US dollars. On-screen figures
// follow Display EUR through currencyUtils (see `show` below).
const usdText = (n) => formatCurrency(n || 0, false, { cents: true });
// ── KPI Tile ───────────────────────────────────────────────────
function KpiTile({ label, value, sub, icon: Icon, primary }) {
    return <div className={'sd-metric ' + (primary ? desk.primaryMetric : desk.metric)}>
        <dt><Icon size={16} aria-hidden="true" />{label}</dt>
        <dd>{value}</dd>
        {sub && <dd className={desk.metricDetail}>{sub}</dd>}
    </div>;
}

function ChartDataTable({ activeChart, trendData, monthlyData, donutData, show }) {
    const series = activeChart === 'types' ? donutData : activeChart === 'monthly' ? monthlyData : trendData;
    if (!series.length) return null;
    const tokes = { key: 'tokes', label: 'Tokes', align: 'right', render: row => show(row.tokes) };
    const columns = activeChart === 'types'
        ? [{ key: 'name', label: 'Down Type' }, { key: 'value', label: 'Downs', align: 'right' }]
        : activeChart === 'monthly'
            ? [{ key: 'month', label: 'Month' }, tokes, { key: 'events', label: 'Events', align: 'right' }]
            : [{ key: 'date', label: 'Date' }, { key: 'venue', label: 'Venue' }, tokes,
                activeChart === 'events' ? { key: 'hours', label: 'Hours', align: 'right' }
                    : { key: 'cumulative', label: 'Cumulative', align: 'right', render: row => show(row.cumulative) }];
    return (
        <details className={desk.chartData}>
            <summary><List size={16} aria-hidden="true" />View Chart Data<ChevronDown size={15} aria-hidden="true" /></summary>
            <ResponsiveTable columns={columns} rows={series} caption={CHART_TABS.find(t => t.id === activeChart).label + ' Data'} />
        </details>
    );
}

// ── Main Component ─────────────────────────────────────────────
function TokeDashboard({ userId, refreshTrigger, initiallyExpanded = false, displayEUR = false }) {
    const show = (n) => formatCurrency(n || 0, displayEUR, { cents: true });
    const [snapshot, setSnapshot] = useState(null);
    const [fetching, setFetching] = useState(true);
    const [activeChart, setActiveChart] = useState('trend');
    const [expanded, setExpanded] = useState(initiallyExpanded);
    const [errorScope, setErrorScope] = useState(null);
    const [range, setRange] = useState(0);
    const [feedback, setFeedback] = useState('');
    const requestId = useRef(0);
    const scope = userId + ':' + range;
    const analytics = snapshot?.scope === scope ? snapshot.data : null;
    const loadError = errorScope === scope;
    const loading = !loadError && (fetching || !analytics);
    const rangeName = range ? 'Last ' + range + ' Days' : 'Career';
    const scopeTitle = range ? 'Period Tokes' : 'Career Tokes';

    const load = useCallback(async () => {
        const request = ++requestId.current;
        if (!userId) return;
        try {
            setFetching(true);
            setErrorScope(null);
            const today = new Date();
            const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - range + 1);
            const data = await getTokeAnalytics(userId,
                range ? localDate(start) : undefined, range ? localDate(today) : undefined);
            if (request === requestId.current) setSnapshot({ scope, data });
        } catch (err) {
            if (request === requestId.current) setErrorScope(scope);
            console.warn('TokeDashboard analytics error:', err);
        } finally {
            if (request === requestId.current) setFetching(false);
        }
    }, [userId, range, scope]);

    useEffect(() => { load(); return () => { ++requestId.current; }; }, [load, refreshTrigger]);

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
            date: new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
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
        <section aria-label="Dealer Earnings" className={desk.earnings}>
            <div className={'sd-panel ' + desk.overview}>
                <header className={desk.overviewHead}>
                    <h2><button type="button" className={desk.disclosure} aria-expanded={expanded}
                        onClick={() => setExpanded(value => !value)}>
                        <span className={desk.icon}><Activity size={23} aria-hidden="true" /></span>
                        Earnings Overview
                        <ChevronDown size={17} aria-hidden="true" />
                    </button></h2>
                    {expanded && userId &&
                        <div className={desk.period} role="group" aria-label="Earnings Period">
                            <CalendarDays size={16} aria-hidden="true" />
                            {[30, 90, 0].map(days =>
                                <button className="sd-button" type="button" key={days} aria-pressed={range === days}
                                    onClick={() => { setRange(days); setFeedback(''); }}>
                                    {days ? days + ' Days' : 'Career'}
                                </button>)}
                        </div>}
                </header>
                {expanded && (!userId ? <p className={desk.status}>Sign In To View Your Dealer Earnings.</p> : loading ? (
                    <p role="status" className={desk.status}>Loading Earnings…</p>
                ) : loadError ? (
                    <div role="alert" className={desk.status}>Earnings Could Not Be Loaded.
                        <button type="button" className="sd-button" onClick={load}>Retry</button>
                    </div>
                ) : (
                    <dl className={desk.metrics}>
                        <KpiTile primary label={scopeTitle} value={show(analytics?.careerTokes)} icon={Coins} />
                        <KpiTile label="Total Events" value={analytics?.totalEvents || 0} icon={CalendarDays} />
                        <KpiTile label="Hours Worked" value={`${analytics?.totalHours || 0}h`}
                            sub={analytics?.totalHours > 0 ? show(analytics.tokesPerHour) + ' Tokes Per Hour' : null} icon={Clock3} />
                        <KpiTile label="Avg / Down" value={show(analytics?.avgTokePerDown)} icon={BarChart3} />
                        <KpiTile label="Best Event" value={analytics?.bestEvent ? show(analytics.bestEvent.tokes) : '-'}
                            sub={analytics?.bestEvent?.venueName} icon={Trophy} />
                    </dl>
                ))}
            </div>
            {expanded && userId && !loading && !loadError && (
                <section aria-label="Earnings Breakdown" className={'sd-panel ' + desk.chart}>
                    <header className={desk.chartHead}>
                        <h2>{CHART_TABS.find(tab => tab.id === activeChart).title}</h2>
                        <span>{rangeName}</span>
                    </header>
                    <div className={'sd-tabs ' + desk.modes} role="group" aria-label="Earnings Charts">
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

                    <div className={desk.plot}>
                        <TokeEarningsChart {...{ activeChart, trendData, monthlyData, donutData, totalDowns, displayEUR }} fmt={show} />
                    </div>
                    <ChartDataTable {...{ activeChart, trendData, monthlyData, donutData, show }} />

                    {/* ── Export Buttons ── */}
                    {hasData && (
                        <div className={desk.exports}>
                            <button
                                className="sd-button"
                                onClick={async () => {
                                    const a = analytics;
                                    const lines = [
                                        `TOKE ANALYTICS SUMMARY`,
                                        `Generated: ${new Date().toLocaleDateString()}`,
                                        ``,
                                        `${scopeTitle}:   ${usdText(a.careerTokes)}`,
                                        `Total Events:   ${a.totalEvents}`,
                                        `Hours Worked:   ${a.totalHours}h`,
                                        `Tokes/Hour:     ${usdText(a.tokesPerHour)}`,
                                        `Avg Toke/Down:  ${usdText(a.avgTokePerDown)}`,
                                        `Best Event:     ${a.bestEvent ? `${usdText(a.bestEvent.tokes)} at ${a.bestEvent.venueName}` : '-'}`,
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
                                            if (m.events > 0) lines.push(`  ${m.month}: ${usdText(m.tokes)} (${m.events} event${m.events !== 1 ? 's' : ''})`);
                                        }
                                    }
                                    const copied = await safeCopyToClipboard(lines.join('\n'));
                                    setFeedback(copied ? 'Earnings Summary Copied.' : 'Clipboard Access Is Unavailable.');
                                }}
                            >
                                <Copy size={15} aria-hidden/> Copy Summary
                            </button>
                            <button
                                className="sd-button"
                                onClick={() => {
                                    try {
                                        downloadCsv(buildTokeAnalyticsCsv(analytics, scopeTitle), `toke-analytics-${localDay()}.csv`);
                                    } catch (err) {
                                        console.warn('TokeDashboard CSV export failed:', err);
                                        setFeedback('The Earnings CSV Could Not Be Created.');
                                        return;
                                    }
                                    setFeedback('Earnings CSV Download Requested.');
                                }}
                            >
                                <Download size={15} aria-hidden/> Download CSV
                            </button>
                            <span role="status">{feedback}</span>
                        </div>
                    )}
                </section>
            )}
        </section>
    );
}

export default memo(TokeDashboard);
