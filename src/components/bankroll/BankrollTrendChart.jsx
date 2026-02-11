/**
 * UNIFIED BANKROLL CHART
 * Premium 6-mode visualization system.
 * chartType is driven by parent via prop — no internal selectors.
 */

import { useMemo } from 'react';
import dynamic from 'next/dynamic';

// Dynamic imports (no SSR)
const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false });
const PieChart = dynamic(() => import('recharts').then(m => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then(m => m.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then(m => m.Cell), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const ReferenceLine = dynamic(() => import('recharts').then(m => m.ReferenceLine), { ssr: false });

const CATEGORY_COLORS = {
    poker_cash: '#22c55e',
    poker_mtt: '#3b82f6',
    casino_table: '#f59e0b',
    slots: '#a855f7',
    sports: '#ef4444',
    expense: '#6b7280',
};
const CATEGORY_LABELS = {
    poker_cash: 'Cash Games',
    poker_mtt: 'Tournaments',
    casino_table: 'Table Games',
    slots: 'Slots',
    sports: 'Sports',
    expense: 'Expenses',
};

// Non-gaming categories that should NOT count as "sessions"
const NON_SESSION_CATEGORIES = new Set(['expense', 'withdrawal', 'deposit']);

/** Compute the start date for a given time-filter string */
function getFilterStartDate(timeFilter) {
    const now = new Date();
    switch (timeFilter) {
        case 'Last 7 Days':
            return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        case 'Last 30 Days':
            return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        case 'Last 90 Days':
            return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        case 'This Year':
            return `${now.getFullYear()}-01-01`;
        default:
            return null; // All Time — use data bounds
    }
}

export default function BankrollTrendChart({ entries = [], isLoading = false, chartType = 'line', timeFilter = 'Last 30 Days' }) {
    // ── Data Pipelines ──────────────────────────────────────────

    const filteredEntries = useMemo(() => {
        if (!entries || entries.length === 0) return [];
        return [...entries].sort((a, b) =>
            new Date(a.entry_date + 'T12:00:00') - new Date(b.entry_date + 'T12:00:00')
        );
    }, [entries]);

    // Helper: aggregate entries by day
    const entriesByDay = useMemo(() => {
        const map = {};
        filteredEntries.forEach(e => {
            const day = e.entry_date; // YYYY-MM-DD
            if (!map[day]) map[day] = [];
            map[day].push(e);
        });
        return map;
    }, [filteredEntries]);

    // Helper: generate all days spanning the full time-filter window
    const allDays = useMemo(() => {
        if (filteredEntries.length === 0) return [];
        const dates = filteredEntries.map(e => e.entry_date).sort();
        const filterStart = getFilterStartDate(timeFilter);
        const start = filterStart
            ? new Date(Math.min(new Date(filterStart + 'T12:00:00'), new Date(dates[0] + 'T12:00:00')))
            : new Date(dates[0] + 'T12:00:00');
        const end = new Date(); // always go up to today
        end.setHours(12, 0, 0, 0);
        const days = [];
        const d = new Date(start);
        while (d <= end) {
            days.push(d.toISOString().split('T')[0]);
            d.setDate(d.getDate() + 1);
        }
        return days;
    }, [filteredEntries, timeFilter]);

    // Line / Area — cumulative with every day filled in
    const lineData = useMemo(() => {
        if (allDays.length === 0) return [];
        let cumulative = 0;
        return allDays.map(day => {
            const dayEntries = entriesByDay[day] || [];
            const dayNet = dayEntries.reduce((s, e) => s + ((e.gross_out || 0) - (e.gross_in || 0)), 0);
            cumulative += dayNet;
            const d = new Date(day + 'T12:00:00');
            return {
                date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                value: cumulative,
                net: dayNet,
                sessions: dayEntries.length,
                hasData: dayEntries.length > 0,
                category: dayEntries.length > 0 ? dayEntries[0].category : null,
            };
        });
    }, [allDays, entriesByDay]);

    // Bar — per day net (show every day, $0 for no-session days)
    const barData = useMemo(() =>
        allDays.map(day => {
            const dayEntries = entriesByDay[day] || [];
            const net = dayEntries.reduce((s, e) => s + ((e.gross_out || 0) - (e.gross_in || 0)), 0);
            return {
                date: new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                value: net,
                sessions: dayEntries.length,
                hasData: dayEntries.length > 0,
                category: dayEntries.length > 0 ? dayEntries[0].category : null,
                fill: dayEntries.length === 0 ? 'rgba(255,255,255,0.05)' : net >= 0 ? '#22c55e' : '#ef4444',
            };
        }), [allDays, entriesByDay]);

    // Stacked — grouped by day, split by category
    const stackedData = useMemo(() => {
        const byDay = {};
        filteredEntries.forEach(e => {
            const d = new Date(e.entry_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (!byDay[d]) byDay[d] = { date: d };
            const cat = e.category || 'other';
            byDay[d][cat] = (byDay[d][cat] || 0) + ((e.gross_out || 0) - (e.gross_in || 0));
        });
        return Object.values(byDay);
    }, [filteredEntries]);

    // Histogram — distribution
    const histogramData = useMemo(() => {
        if (filteredEntries.length < 3) return [];
        const nets = filteredEntries.map(e => (e.gross_out || 0) - (e.gross_in || 0));
        const min = Math.min(...nets);
        const max = Math.max(...nets);
        if (min === max) return [{ range: `$${min}`, count: nets.length }];
        const bucketCount = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(nets.length))));
        const step = (max - min) / bucketCount;
        const buckets = [];
        for (let i = 0; i < bucketCount; i++) {
            const lo = min + i * step;
            const hi = lo + step;
            buckets.push({
                range: `$${Math.round(lo)}`,
                rangeLabel: `$${Math.round(lo)} – $${Math.round(hi)}`,
                count: nets.filter(n => n >= lo && (i === bucketCount - 1 ? n <= hi : n < hi)).length,
                lo, hi,
            });
        }
        return buckets;
    }, [filteredEntries]);

    // Heatmap — calendar grid
    const heatmapData = useMemo(() => {
        const byDay = {};
        filteredEntries.forEach(e => {
            const d = e.entry_date;
            byDay[d] = (byDay[d] || 0) + ((e.gross_out || 0) - (e.gross_in || 0));
        });
        return byDay;
    }, [filteredEntries]);

    // Donut — category breakdown (ordered: Cash, MTT, Table Games, Slots, Sports, Expenses)
    const CATEGORY_ORDER = ['poker_cash', 'poker_mtt', 'casino_table', 'slots', 'sports', 'expense'];
    const donutData = useMemo(() => {
        const byCat = {};
        filteredEntries.forEach(e => {
            const cat = e.category || 'other';
            byCat[cat] = (byCat[cat] || 0) + ((e.gross_out || 0) - (e.gross_in || 0));
        });
        // Sort by CATEGORY_ORDER, then any remaining
        const ordered = CATEGORY_ORDER.filter(k => byCat[k] !== undefined);
        const remaining = Object.keys(byCat).filter(k => !CATEGORY_ORDER.includes(k));
        return [...ordered, ...remaining].map(key => ({
            key,
            name: CATEGORY_LABELS[key] || key,
            value: Math.abs(byCat[key]),
            rawValue: byCat[key],
            color: CATEGORY_COLORS[key] || '#888',
        }));
    }, [filteredEntries]);

    // Stats
    const stats = useMemo(() => {
        if (lineData.length === 0) return { current: 0, high: 0, low: 0, sessions: 0 };
        const values = lineData.map(d => d.value);
        // Only count actual gaming sessions — exclude expense/withdrawal/deposit
        const gamingSessions = filteredEntries.filter(e => !NON_SESSION_CATEGORIES.has(e.category));
        return {
            current: values[values.length - 1] || 0,
            high: Math.max(...values),
            low: Math.min(...values),
            sessions: gamingSessions.length,
        };
    }, [lineData, filteredEntries]);

    const categoriesPresent = useMemo(() => new Set(filteredEntries.map(e => e.category)), [filteredEntries]);

    // ── Formatters ──────────────────────────────────────────────
    const fmtVal = (v) => v >= 0 ? `+$${v.toLocaleString()}` : `-$${Math.abs(v).toLocaleString()}`;
    const isPositive = stats.current >= 0;
    const chartHeight = 220;

    // ── Shared Tooltip ──────────────────────────────────────────
    const TT = ({ children }) => (
        <div style={{
            background: 'linear-gradient(135deg, rgba(8,16,36,0.97), rgba(12,24,52,0.95))',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 12,
            color: '#e5e7eb',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(0,212,255,0.08)',
            minWidth: 120,
        }}>
            {children}
        </div>
    );

    // ── Renderers ───────────────────────────────────────────────

    const renderLine = () => (
        <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={lineData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                    <linearGradient id="gradPos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                        <stop offset="50%" stopColor="#22c55e" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradNeg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                        <stop offset="50%" stopColor="#ef4444" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} interval="equidistantPreserveStart" />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} tickFormatter={v => `$${Math.abs(v).toLocaleString()}`} width={52} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                        <TT>
                            <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontSize: 11, letterSpacing: '0.3px' }}>{d.date}</div>
                            <div style={{ color: d.value >= 0 ? '#4ade80' : '#f87171', fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px' }}>{fmtVal(d.value)}</div>
                            <div style={{ color: 'rgba(255,255,255,0.45)', marginTop: 4, fontSize: 11, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 4 }}>
                                {d.hasData ? `${d.sessions} session${d.sessions > 1 ? 's' : ''}: ${d.net >= 0 ? '+' : ''}$${d.net.toLocaleString()}` : 'No sessions'}
                            </div>
                        </TT>
                    );
                }} />
                <Area type="monotone" dataKey="value" stroke={isPositive ? '#22c55e' : '#ef4444'} strokeWidth={2.5} fill={isPositive ? 'url(#gradPos)' : 'url(#gradNeg)'} dot={false} activeDot={{ r: 5, fill: isPositive ? '#22c55e' : '#ef4444', strokeWidth: 2, stroke: 'rgba(255,255,255,0.3)' }} filter="url(#glow)" />
            </AreaChart>
        </ResponsiveContainer>
    );

    const renderBar = () => (
        <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                    <linearGradient id="barGradGreen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4ade80" stopOpacity={1} />
                        <stop offset="100%" stopColor="#16a34a" stopOpacity={0.8} />
                    </linearGradient>
                    <linearGradient id="barGradRed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f87171" stopOpacity={1} />
                        <stop offset="100%" stopColor="#dc2626" stopOpacity={0.8} />
                    </linearGradient>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} interval="equidistantPreserveStart" />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} tickFormatter={v => `$${Math.abs(v).toLocaleString()}`} width={52} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                        <TT>
                            <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontSize: 11 }}>{d.date}{d.hasData && d.category ? ` — ${CATEGORY_LABELS[d.category] || d.category}` : ''}</div>
                            <div style={{ color: d.hasData ? (d.value >= 0 ? '#4ade80' : '#f87171') : 'rgba(255,255,255,0.3)', fontWeight: 700, fontSize: 16 }}>
                                {d.hasData ? fmtVal(d.value) : 'No sessions'}
                            </div>
                            {d.hasData && d.sessions > 1 && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 }}>{d.sessions} sessions</div>}
                        </TT>
                    );
                }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={32}>
                    {barData.map((e, i) => <Cell key={i} fill={!e.hasData ? 'rgba(255,255,255,0.03)' : e.value >= 0 ? 'url(#barGradGreen)' : 'url(#barGradRed)'} />)}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );

    const renderStacked = () => {
        const cats = [...categoriesPresent];
        return (
            <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={stackedData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barCategoryGap="20%">
                    <defs>
                        {Object.entries(CATEGORY_COLORS).map(([key, color]) => (
                            <linearGradient key={key} id={`stackGrad_${key}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity={1} />
                                <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                            </linearGradient>
                        ))}
                    </defs>
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} interval="equidistantPreserveStart" />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} tickFormatter={v => `$${Math.abs(v).toLocaleString()}`} width={52} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const total = payload.reduce((s, p) => s + (p.value || 0), 0);
                        return (
                            <TT>
                                <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 6, fontSize: 11, letterSpacing: '0.3px' }}>{label}</div>
                                {payload.map((p, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, fontSize: 12, marginBottom: 3 }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_COLORS[p.dataKey] || '#ccc', display: 'inline-block' }} />
                                            {CATEGORY_LABELS[p.dataKey] || p.dataKey}
                                        </span>
                                        <span style={{ color: (p.value || 0) >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{fmtVal(p.value || 0)}</span>
                                    </div>
                                ))}
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: 6, paddingTop: 6, fontWeight: 700, fontSize: 13, color: total >= 0 ? '#4ade80' : '#f87171', textAlign: 'right' }}>
                                    Total: {fmtVal(total)}
                                </div>
                            </TT>
                        );
                    }} />
                    {cats.map(cat => (
                        <Bar key={cat} dataKey={cat} stackId="stack" fill={`url(#stackGrad_${cat})`} radius={[3, 3, 0, 0]} maxBarSize={32} />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        );
    };

    const renderHistogram = () => {
        if (histogramData.length === 0) {
            return <div style={S.emptyState}><span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Not enough sessions for a histogram</span></div>;
        }
        return (
            <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={histogramData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barCategoryGap="15%">
                    <defs>
                        <linearGradient id="histGreen" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4ade80" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#16a34a" stopOpacity={0.7} />
                        </linearGradient>
                        <linearGradient id="histRed" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f87171" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#dc2626" stopOpacity={0.7} />
                        </linearGradient>
                        <linearGradient id="histBlue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.7} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9 }} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} width={30} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                            <TT>
                                <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 3, fontSize: 11 }}>{d.rangeLabel}</div>
                                <div style={{ fontWeight: 700, fontSize: 16, color: '#e5e7eb' }}>{d.count} <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}>session{d.count !== 1 ? 's' : ''}</span></div>
                            </TT>
                        );
                    }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={36}>
                        {histogramData.map((e, i) => (
                            <Cell key={i} fill={e.lo >= 0 ? 'url(#histGreen)' : e.hi <= 0 ? 'url(#histRed)' : 'url(#histBlue)'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        );
    };

    const renderHeatmap = () => {
        const days = Object.keys(heatmapData).sort();
        if (days.length === 0) return <div style={S.emptyState}><span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No data for heatmap</span></div>;
        const values = Object.values(heatmapData);
        const maxAbs = Math.max(1, ...values.map(Math.abs));

        // Use full filter window for heatmap
        const filterStart = getFilterStartDate(timeFilter);
        const startDate = filterStart
            ? new Date(Math.min(new Date(filterStart + 'T12:00:00'), new Date(days[0] + 'T12:00:00')))
            : new Date(days[0] + 'T12:00:00');
        const endDate = new Date();
        endDate.setHours(12, 0, 0, 0);

        const cells = [];
        const d = new Date(startDate);
        d.setDate(d.getDate() - d.getDay());
        while (d <= endDate) {
            const key = d.toISOString().split('T')[0];
            cells.push({ date: key, value: heatmapData[key] ?? null, day: d.getDay() });
            d.setDate(d.getDate() + 1);
        }

        // Build month markers for labeling
        const monthMarkers = [];
        let lastMonth = -1;
        cells.forEach((cell, i) => {
            const m = new Date(cell.date + 'T12:00:00').getMonth();
            if (m !== lastMonth && cell.day === 0) {
                monthMarkers.push({ index: Math.floor(i / 7), label: new Date(cell.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }) });
                lastMonth = m;
            }
        });

        const getHeatColor = (value) => {
            if (value === null) return { bg: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)', glow: 'none' };
            const intensity = Math.min(1, Math.abs(value) / maxAbs);
            if (value > 0) {
                const alpha = 0.15 + intensity * 0.65;
                return {
                    bg: `rgba(34,197,94,${alpha})`,
                    border: `1px solid rgba(34,197,94,${0.1 + intensity * 0.3})`,
                    glow: intensity > 0.5 ? `0 0 ${4 + intensity * 8}px rgba(34,197,94,${intensity * 0.3})` : 'none',
                };
            } else {
                const alpha = 0.15 + intensity * 0.65;
                return {
                    bg: `rgba(239,68,68,${alpha})`,
                    border: `1px solid rgba(239,68,68,${0.1 + intensity * 0.3})`,
                    glow: intensity > 0.5 ? `0 0 ${4 + intensity * 8}px rgba(239,68,68,${intensity * 0.3})` : 'none',
                };
            }
        };

        const totalWin = values.filter(v => v > 0).reduce((s, v) => s + v, 0);
        const totalLoss = values.filter(v => v < 0).reduce((s, v) => s + v, 0);
        const winDays = values.filter(v => v > 0).length;
        const lossDays = values.filter(v => v < 0).length;
        const [hoveredCell, setHoveredCell] = [null, () => { }]; // tooltip via title attr

        return (
            <div style={{ padding: '8px 0' }}>
                {/* Mini stats row */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 10, fontSize: 11 }}>
                    <span style={{ color: '#4ade80', fontWeight: 600 }}>{winDays}W ({fmtVal(totalWin)})</span>
                    <span style={{ color: '#f87171', fontWeight: 600 }}>{lossDays}L ({fmtVal(totalLoss)})</span>
                    <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>{winDays + lossDays > 0 ? Math.round(winDays / (winDays + lossDays) * 100) : 0}% win rate</span>
                </div>
                {/* Month labels */}
                {monthMarkers.length > 0 && (
                    <div style={{ display: 'flex', gap: 0, fontSize: 9, color: 'rgba(255,255,255,0.45)', marginBottom: 4, fontWeight: 600, letterSpacing: '0.5px', position: 'relative', height: 14 }}>
                        {monthMarkers.map((m, i) => (
                            <span key={i} style={{ position: 'absolute', left: `${(m.index / Math.ceil(cells.length / 7)) * 100}%`, textTransform: 'uppercase' }}>{m.label}</span>
                        ))}
                    </div>
                )}
                {/* Day labels */}
                <div style={{ display: 'flex', gap: 3, fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 4, paddingLeft: 2, fontWeight: 500 }}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((l, i) => (
                        <div key={i} style={{ width: 'calc((100% - 18px) / 7)', textAlign: 'center' }}>{l}</div>
                    ))}
                </div>
                {/* Calendar grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                    {cells.map((cell, i) => {
                        const colors = getHeatColor(cell.value);
                        const dateObj = new Date(cell.date + 'T12:00:00');
                        const titleText = cell.value !== null
                            ? `${dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${fmtVal(cell.value)}`
                            : dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        return (
                            <div
                                key={i}
                                title={titleText}
                                style={{
                                    aspectRatio: '1',
                                    background: colors.bg,
                                    border: colors.border,
                                    borderRadius: 4,
                                    cursor: cell.value !== null ? 'pointer' : 'default',
                                    minHeight: 14,
                                    maxHeight: 22,
                                    boxShadow: colors.glow,
                                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                    position: 'relative',
                                }}
                                onMouseEnter={e => {
                                    if (cell.value !== null) {
                                        e.currentTarget.style.transform = 'scale(1.3)';
                                        e.currentTarget.style.boxShadow = cell.value > 0
                                            ? '0 0 14px rgba(34,197,94,0.5)'
                                            : '0 0 14px rgba(239,68,68,0.5)';
                                        e.currentTarget.style.zIndex = '10';
                                    }
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = colors.glow;
                                    e.currentTarget.style.zIndex = '1';
                                }}
                            />
                        );
                    })}
                </div>
                {/* Gradient legend */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ display: 'flex', gap: 2 }}>
                            {[0.15, 0.35, 0.55, 0.75].map((a, idx) => (
                                <span key={idx} style={{ width: 10, height: 10, borderRadius: 3, background: `rgba(239,68,68,${a})` }} />
                            ))}
                        </span>
                        Loss
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
                        Off
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ display: 'flex', gap: 2 }}>
                            {[0.15, 0.35, 0.55, 0.75].map((a, idx) => (
                                <span key={idx} style={{ width: 10, height: 10, borderRadius: 3, background: `rgba(34,197,94,${a})` }} />
                            ))}
                        </span>
                        Win
                    </span>
                </div>
            </div>
        );
    };

    const renderDonut = () => {
        if (donutData.length === 0) return <div style={S.emptyState}><span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No category data</span></div>;
        const total = donutData.reduce((s, d) => s + d.rawValue, 0);
        const totalAbs = donutData.reduce((s, d) => s + d.value, 0);

        // Bolder, more saturated colors for donut
        const DONUT_COLORS = {
            poker_cash: ['#22c55e', '#15803d'],
            poker_mtt: ['#60a5fa', '#2563eb'],
            casino_table: ['#fbbf24', '#d97706'],
            slots: ['#c084fc', '#7c3aed'],
            sports: ['#f87171', '#dc2626'],
            expense: ['#94a3b8', '#475569'],
        };

        return (
            <div style={{ position: 'relative' }}>
                <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                        <defs>
                            {donutData.map((d, i) => {
                                const [c1, c2] = DONUT_COLORS[d.key] || [d.color, d.color];
                                return (
                                    <linearGradient key={i} id={`donutGrad_${i}`} x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor={c1} stopOpacity={1} />
                                        <stop offset="100%" stopColor={c2} stopOpacity={0.85} />
                                    </linearGradient>
                                );
                            })}
                            <filter id="donutGlow">
                                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                            <filter id="donutShadow">
                                <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.5)" />
                            </filter>
                        </defs>
                        <Pie
                            data={donutData}
                            cx="50%"
                            cy="48%"
                            innerRadius={56}
                            outerRadius={95}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="rgba(0,0,0,0.6)"
                            strokeWidth={2}
                            cornerRadius={5}
                            filter="url(#donutGlow)"
                            animationBegin={0}
                            animationDuration={800}
                        >
                            {donutData.map((e, i) => <Cell key={i} fill={`url(#donutGrad_${i})`} />)}
                        </Pie>
                        <Tooltip content={({ active, payload }) => {
                            if (!active || !payload?.[0]) return null;
                            const d = payload[0].payload;
                            const pct = totalAbs > 0 ? Math.round(d.value / totalAbs * 100) : 0;
                            return (
                                <TT>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: d.color, display: 'inline-block', boxShadow: `0 0 8px ${d.color}` }} />
                                        <span style={{ color: d.color, fontWeight: 700, fontSize: 14 }}>{d.name}</span>
                                    </div>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: d.rawValue >= 0 ? '#4ade80' : '#f87171', marginBottom: 2 }}>{fmtVal(d.rawValue)}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{pct}% of total volume</div>
                                </TT>
                            );
                        }} />
                    </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div style={{
                    position: 'absolute', top: '44%', left: '50%', transform: 'translate(-50%, -50%)',
                    textAlign: 'center', pointerEvents: 'none',
                }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 }}>Net P/L</div>
                    <div style={{
                        fontSize: 22, fontWeight: 800,
                        color: total >= 0 ? '#4ade80' : '#f87171',
                        letterSpacing: '-0.5px',
                        textShadow: total >= 0 ? '0 0 16px rgba(74,222,128,0.4)' : '0 0 16px rgba(248,113,113,0.4)',
                    }}>{fmtVal(total)}</div>
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, fontSize: 12, marginTop: 6 }}>
                    {donutData.map((d, i) => {
                        const pct = totalAbs > 0 ? Math.round(d.value / totalAbs * 100) : 0;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.75)' }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, display: 'inline-block', boxShadow: `0 0 6px ${d.color}` }} />
                                <span style={{ fontWeight: 500 }}>{d.name}</span>
                                <span style={{ color: d.rawValue >= 0 ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,113,0.7)', fontWeight: 600, fontSize: 11 }}>{pct}%</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // ── Main Render ─────────────────────────────────────────────

    if (isLoading) {
        return (
            <div style={S.container}>
                <div style={S.titleRow}>
                    <h3 style={S.title}>Bankroll Trend</h3>
                </div>
                <div style={S.loadingWrap}>
                    <div style={S.skeleton} />
                </div>
            </div>
        );
    }

    const renderActiveChart = () => {
        if (filteredEntries.length === 0) {
            return (
                <div style={S.emptyState}>
                    <span style={{ fontSize: 24, opacity: 0.3 }}></span>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No data for this period</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Log sessions to see your trend</span>
                </div>
            );
        }
        switch (chartType) {
            case 'bar': return renderBar();
            case 'stacked': return renderStacked();
            case 'histogram': return renderHistogram();
            case 'heatmap': return renderHeatmap();
            case 'donut': return renderDonut();
            default: return renderLine();
        }
    };

    return (
        <div style={S.container}>
            {/* Header */}
            <div style={S.titleRow}>
                <h3 style={S.title}>Bankroll Trend</h3>
                <span style={{ fontSize: 18, fontWeight: 700, color: isPositive ? '#4ade80' : '#f87171', letterSpacing: '-0.3px' }}>
                    {fmtVal(stats.current)}
                </span>
            </div>

            {/* Chart */}
            <div style={{ margin: '0 -4px' }}>
                {renderActiveChart()}
            </div>

            {/* Stats Footer */}
            {filteredEntries.length > 0 && (
                <div style={S.statsRow}>
                    <div style={S.statItem}>
                        <span style={S.statLabel}>High</span>
                        <span style={{ ...S.statValue, color: '#4ade80' }}>{fmtVal(stats.high)}</span>
                    </div>
                    <div style={S.statItem}>
                        <span style={S.statLabel}>Low</span>
                        <span style={{ ...S.statValue, color: stats.low >= 0 ? '#4ade80' : '#f87171' }}>{fmtVal(stats.low)}</span>
                    </div>
                    <div style={S.statItem}>
                        <span style={S.statLabel}>Sessions</span>
                        <span style={S.statValue}>{stats.sessions}</span>
                    </div>
                </div>
            )}
        </div>
    );
}


// ── Styles ────────────────────────────────────────────────────
const S = {
    container: {
        background: 'linear-gradient(160deg, rgba(8,16,32,0.95) 0%, rgba(12,24,48,0.92) 50%, rgba(8,20,40,0.90) 100%)',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.07)',
        padding: '18px 16px 14px',
        marginBottom: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
    },
    titleRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    title: {
        margin: 0,
        fontSize: 15,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.85)',
        letterSpacing: '-0.2px',
    },
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 180,
        gap: 8,
    },
    loadingWrap: {
        height: 180,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    skeleton: {
        width: '100%',
        height: 130,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03))',
        borderRadius: 8,
        animation: 'pulse 1.5s infinite',
    },
    statsRow: {
        display: 'flex',
        justifyContent: 'space-around',
        paddingTop: 12,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        marginTop: 10,
    },
    statItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
    },
    statLabel: {
        fontSize: 9,
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        fontWeight: 500,
    },
    statValue: {
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.9)',
    },
};
