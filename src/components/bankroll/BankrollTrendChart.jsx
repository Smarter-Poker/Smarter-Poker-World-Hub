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

export default function BankrollTrendChart({ entries = [], isLoading = false, chartType = 'line' }) {
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

    // Helper: generate all days between start and end (inclusive)
    const allDays = useMemo(() => {
        if (filteredEntries.length === 0) return [];
        const dates = filteredEntries.map(e => e.entry_date).sort();
        const start = new Date(dates[0] + 'T12:00:00');
        const end = new Date(dates[dates.length - 1] + 'T12:00:00');
        const days = [];
        const d = new Date(start);
        while (d <= end) {
            days.push(d.toISOString().split('T')[0]);
            d.setDate(d.getDate() + 1);
        }
        return days;
    }, [filteredEntries]);

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

    // Donut — category breakdown
    const donutData = useMemo(() => {
        const byCat = {};
        filteredEntries.forEach(e => {
            const cat = e.category || 'other';
            byCat[cat] = (byCat[cat] || 0) + ((e.gross_out || 0) - (e.gross_in || 0));
        });
        return Object.entries(byCat).map(([key, value]) => ({
            name: CATEGORY_LABELS[key] || key,
            value: Math.abs(value),
            rawValue: value,
            color: CATEGORY_COLORS[key] || '#888',
        }));
    }, [filteredEntries]);

    // Stats
    const stats = useMemo(() => {
        if (lineData.length === 0) return { current: 0, high: 0, low: 0, sessions: 0 };
        const values = lineData.map(d => d.value);
        return {
            current: values[values.length - 1] || 0,
            high: Math.max(...values),
            low: Math.min(...values),
            sessions: lineData.length,
        };
    }, [lineData]);

    const categoriesPresent = useMemo(() => new Set(filteredEntries.map(e => e.category)), [filteredEntries]);

    // ── Formatters ──────────────────────────────────────────────
    const fmtVal = (v) => v >= 0 ? `+$${v.toLocaleString()}` : `-$${Math.abs(v).toLocaleString()}`;
    const isPositive = stats.current >= 0;
    const chartHeight = 200;

    // ── Shared Tooltip ──────────────────────────────────────────
    const TT = ({ children }) => (
        <div style={{
            background: 'rgba(10,15,30,0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 12,
            color: '#e5e7eb',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
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
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradNeg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} interval="equidistantPreserveStart" />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} tickFormatter={v => `$${Math.abs(v)}`} width={52} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                        <TT>
                            <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>{d.date}</div>
                            <div style={{ color: d.value >= 0 ? '#4ade80' : '#f87171', fontWeight: 600, fontSize: 14 }}>{fmtVal(d.value)}</div>
                            <div style={{ color: 'rgba(255,255,255,0.45)', marginTop: 3, fontSize: 11 }}>
                                {d.hasData ? `${d.sessions} session${d.sessions > 1 ? 's' : ''}: ${d.net >= 0 ? '+' : ''}$${d.net.toLocaleString()}` : 'No sessions'}
                            </div>
                        </TT>
                    );
                }} />
                <Area type="monotone" dataKey="value" stroke={isPositive ? '#22c55e' : '#ef4444'} strokeWidth={2.5} fill={isPositive ? 'url(#gradPos)' : 'url(#gradNeg)'} dot={false} activeDot={{ r: 4, fill: isPositive ? '#22c55e' : '#ef4444', strokeWidth: 0 }} />
            </AreaChart>
        </ResponsiveContainer>
    );

    const renderBar = () => (
        <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} interval="equidistantPreserveStart" />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} tickFormatter={v => `$${Math.abs(v)}`} width={52} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                        <TT>
                            <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>{d.date}{d.hasData && d.category ? ` — ${CATEGORY_LABELS[d.category] || d.category}` : ''}</div>
                            <div style={{ color: d.hasData ? (d.value >= 0 ? '#4ade80' : '#f87171') : 'rgba(255,255,255,0.3)', fontWeight: 600, fontSize: 14 }}>
                                {d.hasData ? fmtVal(d.value) : 'No sessions'}
                            </div>
                        </TT>
                    );
                }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {barData.map((e, i) => <Cell key={i} fill={e.fill} fillOpacity={0.85} />)}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );

    const renderStacked = () => {
        const cats = [...categoriesPresent];
        return (
            <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={stackedData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} interval="equidistantPreserveStart" />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} tickFormatter={v => `$${Math.abs(v)}`} width={52} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                    <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const total = payload.reduce((s, p) => s + (p.value || 0), 0);
                        return (
                            <TT>
                                <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{label}</div>
                                {payload.map((p, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 11 }}>
                                        <span style={{ color: CATEGORY_COLORS[p.dataKey] || '#ccc' }}>{CATEGORY_LABELS[p.dataKey] || p.dataKey}</span>
                                        <span style={{ color: '#e5e7eb' }}>{fmtVal(p.value || 0)}</span>
                                    </div>
                                ))}
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: 5, paddingTop: 5, fontWeight: 600, color: total >= 0 ? '#4ade80' : '#f87171' }}>
                                    Total: {fmtVal(total)}
                                </div>
                            </TT>
                        );
                    }} />
                    {cats.map(cat => (
                        <Bar key={cat} dataKey={cat} stackId="stack" fill={CATEGORY_COLORS[cat] || '#888'} fillOpacity={0.8} radius={[2, 2, 0, 0]} maxBarSize={28} />
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
                <BarChart data={histogramData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9 }} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} width={30} allowDecimals={false} />
                    <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return <TT><div style={{ marginBottom: 2 }}>{d.rangeLabel}</div><div style={{ fontWeight: 600 }}>{d.count} session{d.count !== 1 ? 's' : ''}</div></TT>;
                    }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {histogramData.map((e, i) => (
                            <Cell key={i} fill={e.lo >= 0 ? 'rgba(34,197,94,0.7)' : e.hi <= 0 ? 'rgba(239,68,68,0.7)' : 'rgba(59,130,246,0.7)'} />
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

        const startDate = new Date(days[0] + 'T12:00:00');
        const endDate = new Date(days[days.length - 1] + 'T12:00:00');
        const cells = [];
        const d = new Date(startDate);
        d.setDate(d.getDate() - d.getDay());
        while (d <= endDate) {
            const key = d.toISOString().split('T')[0];
            cells.push({ date: key, value: heatmapData[key] ?? null, day: d.getDay() });
            d.setDate(d.getDate() + 1);
        }

        return (
            <div style={{ padding: '10px 0' }}>
                <div style={{ display: 'flex', gap: 3, fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 6, paddingLeft: 2 }}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => (
                        <div key={i} style={{ width: 'calc((100% - 18px) / 7)', textAlign: 'center' }}>{l}</div>
                    ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                    {cells.map((cell, i) => {
                        let bg = 'rgba(255,255,255,0.03)';
                        let border = 'none';
                        if (cell.value !== null) {
                            const intensity = Math.min(1, Math.abs(cell.value) / maxAbs);
                            if (cell.value > 0) bg = `rgba(34,197,94,${0.12 + intensity * 0.55})`;
                            else if (cell.value < 0) bg = `rgba(239,68,68,${0.12 + intensity * 0.55})`;
                            border = '1px solid rgba(255,255,255,0.06)';
                        }
                        return (
                            <div
                                key={i}
                                title={cell.value !== null ? `${cell.date}: ${fmtVal(cell.value)}` : cell.date}
                                style={{
                                    aspectRatio: '1',
                                    background: bg,
                                    border,
                                    borderRadius: 4,
                                    cursor: cell.value !== null ? 'pointer' : 'default',
                                    minHeight: 16,
                                    transition: 'transform 0.15s, box-shadow 0.15s',
                                }}
                                onMouseEnter={e => { if (cell.value !== null) { e.target.style.transform = 'scale(1.15)'; e.target.style.boxShadow = '0 0 8px rgba(255,255,255,0.15)'; } }}
                                onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = 'none'; }}
                            />
                        );
                    })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(239,68,68,0.5)' }} /> Loss
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }} /> No data
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(34,197,94,0.5)' }} /> Win
                    </span>
                </div>
            </div>
        );
    };

    const renderDonut = () => {
        if (donutData.length === 0) return <div style={S.emptyState}><span>No category data</span></div>;
        const total = donutData.reduce((s, d) => s + d.rawValue, 0);
        const totalAbs = donutData.reduce((s, d) => s + d.value, 0);
        return (
            <div style={{ position: 'relative' }}>
                <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                        <Pie
                            data={donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="rgba(0,0,0,0.3)"
                            strokeWidth={1}
                        >
                            {donutData.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={0.85} />)}
                        </Pie>
                        <Tooltip content={({ active, payload }) => {
                            if (!active || !payload?.[0]) return null;
                            const d = payload[0].payload;
                            return (
                                <TT>
                                    <div style={{ color: d.color, fontWeight: 600, marginBottom: 2 }}>{d.name}</div>
                                    <div>{fmtVal(d.rawValue)} ({totalAbs > 0 ? Math.round(d.value / totalAbs * 100) : 0}%)</div>
                                </TT>
                            );
                        }} />
                    </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -55%)',
                    textAlign: 'center', pointerEvents: 'none',
                }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 2 }}>Total</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: total >= 0 ? '#4ade80' : '#f87171' }}>{fmtVal(total)}</div>
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, fontSize: 11, marginTop: 4 }}>
                    {donutData.map((d, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.6)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                            {d.name}
                        </div>
                    ))}
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
                    <span style={{ fontSize: 24, opacity: 0.3 }}>📊</span>
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
