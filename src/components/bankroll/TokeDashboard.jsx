/**
 * TOKE DASHBOARD — Dealer Bankroll Manager Analytics
 * ═══════════════════════════════════════════════════════════════
 * Career KPI strip + 3 charts (cumulative trend, per-event bar,
 * down-type donut). Mirrors BankrollTrendChart design patterns.
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { getTokeAnalytics } from '../../lib/bankroll/tokeSelectors';

// ── Dynamic Recharts imports (no SSR) ──────────────────────────
const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false });
const Cell = dynamic(() => import('recharts').then(m => m.Cell), { ssr: false });
const PieChart = dynamic(() => import('recharts').then(m => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then(m => m.Pie), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const ReferenceLine = dynamic(() => import('recharts').then(m => m.ReferenceLine), { ssr: false });

// ── Chart tab definitions ──────────────────────────────────────
const CHART_TABS = [
    { id: 'trend', label: 'Trend' },
    { id: 'events', label: 'Per Event' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'types', label: 'Down Types' },
];

// ── Tooltip wrapper ────────────────────────────────────────────
function TT({ children }) {
    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(28,30,33,0.97), rgba(36,37,38,0.95))',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 13,
            color: '#E4E6EB',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            minWidth: 130,
        }}>
            {children}
        </div>
    );
}

const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtK = (v) => {
    const abs = Math.abs(v);
    if (abs >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    return `$${v.toLocaleString()}`;
};

// ── KPI Tile ───────────────────────────────────────────────────
function KpiTile({ icon, label, value, sub, color = '#f59e0b' }) {
    return (
        <div style={S.kpiTile}>
            <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...S.kpiValue, color }}>{value}</div>
                <div style={S.kpiLabel}>{label}</div>
                {sub && <div style={S.kpiSub}>{sub}</div>}
            </div>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────
export default function TokeDashboard({ userId, refreshTrigger }) {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeChart, setActiveChart] = useState('trend');
    const [expanded, setExpanded] = useState(false);

    const load = useCallback(async () => {
        if (!userId) return;
        try {
            setLoading(true);
            const data = await getTokeAnalytics(userId);
            setAnalytics(data);
        } catch (err) {
            console.error('TokeDashboard analytics error:', err);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(); }, [load, refreshTrigger]);

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
            { name: 'Tournament', value: tournament, color: '#f59e0b' },
            { name: 'Brush', value: brush, color: '#10b981' },
            { name: 'Break', value: brk, color: '#8b5cf6' },
        ].filter(d => d.value > 0);
    }, [analytics]);

    const totalDowns = useMemo(() => donutData.reduce((s, d) => s + d.value, 0), [donutData]);

    // ── Empty state ──────────────────────────────────────────
    const hasData = analytics && analytics.totalEvents > 0;

    // ── Chart renderers ──────────────────────────────────────
    const renderTrend = () => {
        if (!trendData.length) return <EmptyChart msg="Complete Your First Event To See The Trend" />;
        const maxVal = Math.max(...trendData.map(d => d.cumulative));
        return (
            <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="tokeTrendGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                            <stop offset="60%" stopColor="#f59e0b" stopOpacity={0.12} />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                        </linearGradient>
                        <filter id="tokeGlow">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    </defs>
                    <XAxis dataKey="date" axisLine={false} tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                        interval="equidistantPreserveStart" />
                    <YAxis axisLine={false} tickLine={false} width={58}
                        tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                        tickFormatter={fmtK} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                    <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                            <TT>
                                <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{d.venue}</div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6 }}>{d.date}</div>
                                <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 15 }}>{fmt(d.tokes)} tokes</div>
                                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 3 }}>
                                    {d.hours}h · Running: {fmt(d.cumulative)}
                                </div>
                            </TT>
                        );
                    }} />
                    <Area type="monotone" dataKey="cumulative" stroke="#f59e0b" strokeWidth={2.5}
                        fill="url(#tokeTrendGrad)" dot={false}
                        activeDot={{ r: 5, fill: '#f59e0b', strokeWidth: 2, stroke: 'rgba(255,255,255,0.3)' }}
                        filter="url(#tokeGlow)" />
                </AreaChart>
            </ResponsiveContainer>
        );
    };

    const renderEvents = () => {
        if (!trendData.length) return <EmptyChart msg="No Completed Events Yet" />;
        return (
            <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="tokeBarGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fbbf24" stopOpacity={1} />
                            <stop offset="100%" stopColor="#d97706" stopOpacity={0.8} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="date" axisLine={false} tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                        interval="equidistantPreserveStart" />
                    <YAxis axisLine={false} tickLine={false} width={58}
                        tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                        tickFormatter={fmtK} />
                    <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                            <TT>
                                <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{d.venue}</div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6 }}>{d.date}</div>
                                <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 15 }}>{fmt(d.tokes)} tokes</div>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 3 }}>{d.hours}h worked</div>
                            </TT>
                        );
                    }} />
                    <Bar dataKey="tokes" radius={[6, 6, 0, 0]} maxBarSize={36} fill="url(#tokeBarGrad)" />
                </BarChart>
            </ResponsiveContainer>
        );
    };

    const renderMonthly = () => {
        const hasMonthlyData = monthlyData.some(m => m.tokes > 0);
        if (!hasMonthlyData) return <EmptyChart msg="No Monthly Data Yet" />;
        return (
            <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={1} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="month" axisLine={false} tickLine={false}
                        tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                        interval={0} />
                    <YAxis axisLine={false} tickLine={false} width={58}
                        tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                        tickFormatter={fmtK} />
                    <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                            <TT>
                                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 }}>{d.month}</div>
                                <div style={{ color: '#34d399', fontWeight: 700, fontSize: 15 }}>{fmt(d.tokes)}</div>
                                {d.events > 0 && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 3 }}>{d.events} event{d.events !== 1 ? 's' : ''}</div>}
                            </TT>
                        );
                    }} />
                    <Bar dataKey="tokes" radius={[5, 5, 0, 0]} maxBarSize={32}>
                        {monthlyData.map((m, i) => (
                            <Cell key={i} fill={m.tokes > 0 ? 'url(#monthGrad)' : 'rgba(255,255,255,0.08)'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        );
    };

    const renderDonut = () => {
        if (!donutData.length) return <EmptyChart msg="Log Some Downs To See Distribution" />;
        return (
            <div style={{ position: 'relative' }}>
                <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                        <defs>
                            {donutData.map((d, i) => (
                                <linearGradient key={i} id={`tokeDonutGrad_${i}`} x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor={d.color} stopOpacity={1} />
                                    <stop offset="100%" stopColor={d.color} stopOpacity={0.65} />
                                </linearGradient>
                            ))}
                        </defs>
                        <Pie data={donutData} cx="50%" cy="50%"
                            innerRadius={52} outerRadius={88}
                            paddingAngle={4} dataKey="value"
                            stroke="rgba(0,0,0,0.5)" strokeWidth={2}
                            cornerRadius={5}
                            animationBegin={0} animationDuration={700}>
                            {donutData.map((d, i) => (
                                <Cell key={i} fill={`url(#tokeDonutGrad_${i})`} />
                            ))}
                        </Pie>
                        <Tooltip content={({ active, payload }) => {
                            if (!active || !payload?.[0]) return null;
                            const d = payload[0].payload;
                            const pct = totalDowns > 0 ? Math.round(d.value / totalDowns * 100) : 0;
                            return (
                                <TT>
                                    <div style={{ color: d.color, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{d.name}</div>
                                    <div style={{ color: '#e5e7eb', fontWeight: 700, fontSize: 15 }}>{d.value} downs</div>
                                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>{pct}% of total</div>
                                </TT>
                            );
                        }} />
                    </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase' }}>Total</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b', letterSpacing: '-0.5px' }}>{totalDowns}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>downs</div>
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 14px', marginTop: 8 }}>
                    {donutData.map((d, i) => {
                        const pct = totalDowns > 0 ? Math.round(d.value / totalDowns * 100) : 0;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                                {d.name}
                                <span style={{ color: d.color, fontWeight: 700 }}>{pct}%</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderChart = () => {
        switch (activeChart) {
            case 'trend': return renderTrend();
            case 'events': return renderEvents();
            case 'monthly': return renderMonthly();
            case 'types': return renderDonut();
            default: return renderTrend();
        }
    };

    // ── Main render ──────────────────────────────────────────
    return (
        <div style={S.wrapper}>
            {/* Collapsible header */}
            <button style={S.header} onClick={() => setExpanded(e => !e)}>
                <div style={S.headerLeft}>
                    <span style={S.headerIcon}></span>
                    <div>
                        <div style={S.headerTitle}>Analytics Dashboard</div>
                        <div style={S.headerSub}>
                            {loading ? 'Loading…' : hasData
                                ? `${analytics.totalEvents} Events · ${fmt(analytics.careerTokes)} Career Tokes`
                                : 'Complete Your First Event To See Analytics'}
                        </div>
                    </div>
                </div>
                <span style={{ ...S.chevron, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
            </button>

            {expanded && (
                <div style={S.body}>
                    {loading ? (
                        <div style={S.loadingRow}>
                            <div style={S.skeleton} />
                            <div style={S.skeleton} />
                            <div style={{ ...S.skeleton, height: 200, width: '100%' }} />
                        </div>
                    ) : (
                        <>
                            {/* ── KPI Strip ── */}
                            <div style={S.kpiGrid}>
                                <KpiTile
                                    icon=""
                                    label="Career Tokes"
                                    value={fmt(analytics?.careerTokes || 0)}
                                    color="#f59e0b"
                                />
                                <KpiTile
                                    icon=""
                                    label="Total Events"
                                    value={analytics?.totalEvents || 0}
                                    color="#e5e7eb"
                                />
                                <KpiTile
                                    icon=""
                                    label="Hours Worked"
                                    value={`${analytics?.totalHours || 0}h`}
                                    color="#60a5fa"
                                />
                                <KpiTile
                                    icon=""
                                    label="Avg / Down"
                                    value={fmt(analytics?.avgTokePerDown || 0)}
                                    color="#34d399"
                                />
                                <KpiTile
                                    icon=""
                                    label="Best Event"
                                    value={analytics?.bestEvent ? fmt(analytics.bestEvent.tokes) : '—'}
                                    sub={analytics?.bestEvent?.venueName || null}
                                    color="#a78bfa"
                                />
                            </div>

                            {/* ── Chart Tabs ── */}
                            <div style={S.tabRow}>
                                {CHART_TABS.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveChart(tab.id)}
                                        style={{
                                            ...S.tab,
                                            ...(activeChart === tab.id ? S.tabActive : {}),
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* ── Chart Area ── */}
                            <div style={S.chartArea}>
                                {renderChart()}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function EmptyChart({ msg }) {
    return (
        <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 28, opacity: 0.25 }}></span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>{msg}</span>
        </div>
    );
}

// ── Styles ─────────────────────────────────────────────────────
const S = {
    wrapper: {
        background: '#1c1e21',
        border: '1px solid rgba(245,158,11,0.18)',
        borderRadius: 12,
        marginBottom: 14,
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(245,158,11,0.08)',
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', background: 'none', border: 'none',
        padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
    },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
    headerIcon: { fontSize: 20, lineHeight: 1 },
    headerTitle: { fontSize: 15, fontWeight: 700, color: '#E4E6EB', letterSpacing: '-0.2px' },
    headerSub: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
    chevron: { fontSize: 18, color: '#f59e0b', transition: 'transform 0.2s', lineHeight: 1 },

    body: { padding: '0 14px 16px', borderTop: '1px solid rgba(255,255,255,0.07)' },

    loadingRow: { display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14 },
    skeleton: {
        height: 72, borderRadius: 10,
        background: 'linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.1),rgba(255,255,255,0.06))',
        animation: 'pulse 1.5s infinite',
    },

    kpiGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 8,
        paddingTop: 12,
        paddingBottom: 14,
    },
    kpiTile: {
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.07)',
        padding: '12px 12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
    },
    kpiValue: { fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1 },
    kpiLabel: { fontSize: 11, color: '#64748b', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
    kpiSub: { fontSize: 11, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

    tabRow: {
        display: 'flex', gap: 6, flexWrap: 'wrap',
        marginBottom: 12,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        paddingBottom: 12,
    },
    tab: {
        fontSize: 12, fontWeight: 600, padding: '5px 12px',
        borderRadius: 20, cursor: 'pointer',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#94a3b8', transition: 'all 0.15s',
    },
    tabActive: {
        background: 'rgba(245,158,11,0.12)',
        border: '1px solid rgba(245,158,11,0.4)',
        color: '#f59e0b',
    },

    chartArea: {
        minHeight: 200,
    },
};
