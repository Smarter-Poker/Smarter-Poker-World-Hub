/**
 * UNIFIED BANKROLL CHART SYSTEM
 * 6 visualization modes over the same financial dataset:
 * Line/Area (default), Bar, Stacked Bar, Histogram, Heatmap, Donut/Pie
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Dynamic imports — Recharts (no SSR)
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
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const ReferenceLine = dynamic(() => import('recharts').then(m => m.ReferenceLine), { ssr: false });

const TIME_RANGES = [
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: '90d', label: '90D' },
    { key: '1y', label: '1Y' },
    { key: 'all', label: 'All' },
];

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

// Primary chart types (always visible)
const PRIMARY_CHARTS = [
    { key: 'line', label: 'Line', icon: '📈' },
    { key: 'bar', label: 'Bar', icon: '📊' },
    { key: 'donut', label: 'Donut', icon: '🍩' },
];

// Advanced chart types (behind "More" toggle)
const ADVANCED_CHARTS = [
    { key: 'stacked', label: 'Stacked', icon: '📚' },
    { key: 'histogram', label: 'Histogram', icon: '📉' },
    { key: 'heatmap', label: 'Heatmap', icon: '🗓️' },
];

const STORAGE_KEY = 'bankroll_chart_type';

export default function BankrollTrendChart({ entries = [], isLoading = false }) {
    const [timeRange, setTimeRange] = useState('30d');
    const [chartType, setChartType] = useState('line');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [hoveredDisabled, setHoveredDisabled] = useState(null);

    // Restore persisted chart type
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) setChartType(saved);
        } catch (_) { }
    }, []);

    const persistChartType = useCallback((type) => {
        setChartType(type);
        try { localStorage.setItem(STORAGE_KEY, type); } catch (_) { }
    }, []);

    // ── Data Processing ──────────────────────────────────────────
    const filteredEntries = useMemo(() => {
        if (!entries || entries.length === 0) return [];
        const now = new Date();
        let startDate = new Date();
        switch (timeRange) {
            case '7d': startDate.setDate(now.getDate() - 7); break;
            case '30d': startDate.setDate(now.getDate() - 30); break;
            case '90d': startDate.setDate(now.getDate() - 90); break;
            case '1y': startDate.setFullYear(now.getFullYear() - 1); break;
            case 'all': startDate = new Date(0); break;
        }
        return entries
            .filter(e => new Date(e.entry_date + 'T12:00:00') >= startDate)
            .sort((a, b) => new Date(a.entry_date + 'T12:00:00') - new Date(b.entry_date + 'T12:00:00'));
    }, [entries, timeRange]);

    // Line / Area data (cumulative)
    const lineData = useMemo(() => {
        let cumulative = 0;
        return filteredEntries.map(e => {
            const net = (e.gross_out || 0) - (e.gross_in || 0);
            cumulative += net;
            const d = new Date(e.entry_date + 'T12:00:00');
            return {
                date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                value: cumulative,
                net,
                category: e.category,
            };
        });
    }, [filteredEntries]);

    // Bar data (per-session net)
    const barData = useMemo(() => {
        return filteredEntries.map(e => {
            const net = (e.gross_out || 0) - (e.gross_in || 0);
            const d = new Date(e.entry_date + 'T12:00:00');
            return {
                date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                value: net,
                category: e.category,
                fill: net >= 0 ? '#22c55e' : '#ef4444',
            };
        });
    }, [filteredEntries]);

    // Stacked bar data (grouped by day, split by category)
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

    // Histogram data (distribution of session results)
    const histogramData = useMemo(() => {
        if (filteredEntries.length < 5) return [];
        const nets = filteredEntries.map(e => (e.gross_out || 0) - (e.gross_in || 0));
        const min = Math.min(...nets);
        const max = Math.max(...nets);
        if (min === max) return [{ range: `$${min}`, count: nets.length }];
        const bucketCount = Math.min(10, Math.ceil(Math.sqrt(nets.length)));
        const step = (max - min) / bucketCount;
        const buckets = [];
        for (let i = 0; i < bucketCount; i++) {
            const lo = min + i * step;
            const hi = lo + step;
            const count = nets.filter(n => n >= lo && (i === bucketCount - 1 ? n <= hi : n < hi)).length;
            buckets.push({
                range: `$${Math.round(lo)} – $${Math.round(hi)}`,
                count,
                lo, hi,
            });
        }
        return buckets;
    }, [filteredEntries]);

    // Heatmap data (calendar grid)
    const heatmapData = useMemo(() => {
        const byDay = {};
        filteredEntries.forEach(e => {
            const d = e.entry_date;
            byDay[d] = (byDay[d] || 0) + ((e.gross_out || 0) - (e.gross_in || 0));
        });
        return byDay;
    }, [filteredEntries]);

    // Donut data (by category)
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

    // Categories present
    const categoriesPresent = useMemo(() => {
        const cats = new Set(filteredEntries.map(e => e.category));
        return cats;
    }, [filteredEntries]);

    const uniqueDays = useMemo(() => {
        return new Set(filteredEntries.map(e => e.entry_date)).size;
    }, [filteredEntries]);

    // ── Contextual Disable Logic ─────────────────────────────────
    const disabledReasons = useMemo(() => {
        const reasons = {};
        if (filteredEntries.length < 20) reasons.histogram = `Need 20+ sessions (${filteredEntries.length} available)`;
        if (categoriesPresent.size <= 1) {
            reasons.stacked = 'Need 2+ categories';
            reasons.donut = 'Need 2+ categories';
        }
        if (uniqueDays <= 1) reasons.heatmap = 'Need 2+ days of data';
        const totalDonut = donutData.reduce((s, d) => s + d.value, 0);
        if (totalDonut === 0) reasons.donut = 'No data to display';
        return reasons;
    }, [filteredEntries, categoriesPresent, uniqueDays, donutData]);

    const isDisabled = (key) => !!disabledReasons[key];

    // ── Formatters ───────────────────────────────────────────────
    const formatValue = (v) => v >= 0 ? `+$${v.toLocaleString()}` : `-$${Math.abs(v).toLocaleString()}`;
    const isPositive = stats.current >= 0;

    // ── Renderers ────────────────────────────────────────────────

    const renderLineChart = () => (
        <div style={S.chartContainer}>
            <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={lineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} tickFormatter={v => `$${Math.abs(v)}`} width={50} />
                    <Tooltip content={({ active, payload }) => {
                        if (active && payload?.[0]) {
                            const d = payload[0].payload;
                            return (
                                <div style={S.tooltip}>
                                    <div style={S.tooltipDate}>{d.date}</div>
                                    <div style={{ color: d.value >= 0 ? '#22c55e' : '#ef4444' }}>{formatValue(d.value)}</div>
                                    <div style={S.tooltipSession}>Session: {d.net >= 0 ? '+' : ''}${d.net.toLocaleString()}</div>
                                </div>
                            );
                        }
                        return null;
                    }} />
                    <Area type="monotone" dataKey="value" stroke={isPositive ? '#22c55e' : '#ef4444'} strokeWidth={2} fill={isPositive ? 'url(#colorPos)' : 'url(#colorNeg)'} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );

    const renderBarChart = () => (
        <div style={S.chartContainer}>
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} tickFormatter={v => `$${Math.abs(v)}`} width={50} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                    <Tooltip content={({ active, payload }) => {
                        if (active && payload?.[0]) {
                            const d = payload[0].payload;
                            return (
                                <div style={S.tooltip}>
                                    <div style={S.tooltipDate}>{d.date} — {CATEGORY_LABELS[d.category] || d.category}</div>
                                    <div style={{ color: d.value >= 0 ? '#22c55e' : '#ef4444' }}>{formatValue(d.value)}</div>
                                </div>
                            );
                        }
                        return null;
                    }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {barData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );

    const renderStackedChart = () => {
        const cats = [...categoriesPresent];
        return (
            <div style={S.chartContainer}>
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={stackedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} tickFormatter={v => `$${Math.abs(v)}`} width={50} />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                        <Tooltip content={({ active, payload, label }) => {
                            if (active && payload?.length) {
                                const total = payload.reduce((s, p) => s + (p.value || 0), 0);
                                return (
                                    <div style={S.tooltip}>
                                        <div style={S.tooltipDate}>{label}</div>
                                        {payload.map((p, i) => (
                                            <div key={i} style={{ color: CATEGORY_COLORS[p.dataKey] || '#fff', fontSize: 11 }}>
                                                {CATEGORY_LABELS[p.dataKey] || p.dataKey}: {formatValue(p.value || 0)}
                                            </div>
                                        ))}
                                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 4, paddingTop: 4, color: total >= 0 ? '#22c55e' : '#ef4444' }}>
                                            Total: {formatValue(total)}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        }} />
                        {cats.map(cat => (
                            <Bar key={cat} dataKey={cat} stackId="stack" fill={CATEGORY_COLORS[cat] || '#888'} radius={[2, 2, 0, 0]} />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        );
    };

    const renderHistogram = () => (
        <div style={S.chartContainer}>
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={histogramData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 9 }} interval={0} angle={-15} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} width={30} />
                    <Tooltip content={({ active, payload }) => {
                        if (active && payload?.[0]) {
                            const d = payload[0].payload;
                            return (
                                <div style={S.tooltip}>
                                    <div style={S.tooltipDate}>{d.range}</div>
                                    <div>{d.count} session{d.count !== 1 ? 's' : ''}</div>
                                </div>
                            );
                        }
                        return null;
                    }} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );

    const renderHeatmap = () => {
        const days = Object.keys(heatmapData).sort();
        if (days.length === 0) return <div style={S.emptyState}><span>No data for heatmap</span></div>;
        const values = Object.values(heatmapData);
        const maxAbs = Math.max(1, ...values.map(Math.abs));

        // Build a calendar-style 7-col grid
        const startDate = new Date(days[0] + 'T12:00:00');
        const endDate = new Date(days[days.length - 1] + 'T12:00:00');
        const cells = [];
        const d = new Date(startDate);
        // Pad to start of week (Sunday)
        d.setDate(d.getDate() - d.getDay());
        while (d <= endDate) {
            const key = d.toISOString().split('T')[0];
            const val = heatmapData[key] || null;
            cells.push({ date: key, value: val, day: d.getDay() });
            d.setDate(d.getDate() + 1);
        }

        return (
            <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'flex', gap: 2, fontSize: 9, color: '#666', marginBottom: 4, paddingLeft: 2 }}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => (
                        <div key={i} style={{ width: 'calc((100% - 12px) / 7)', textAlign: 'center' }}>{l}</div>
                    ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                    {cells.map((cell, i) => {
                        let bg = 'rgba(255,255,255,0.04)';
                        let title = cell.date;
                        if (cell.value !== null) {
                            const intensity = Math.min(1, Math.abs(cell.value) / maxAbs);
                            if (cell.value > 0) {
                                bg = `rgba(34,197,94,${0.15 + intensity * 0.6})`;
                            } else if (cell.value < 0) {
                                bg = `rgba(239,68,68,${0.15 + intensity * 0.6})`;
                            }
                            title = `${cell.date}: ${formatValue(cell.value)}`;
                        }
                        return (
                            <div
                                key={i}
                                title={title}
                                style={{
                                    aspectRatio: '1',
                                    background: bg,
                                    borderRadius: 3,
                                    cursor: cell.value !== null ? 'pointer' : 'default',
                                    minHeight: 14,
                                }}
                            />
                        );
                    })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8, fontSize: 10, color: '#888' }}>
                    <span>🟥 Loss</span>
                    <span>⬜ No data</span>
                    <span>🟩 Win</span>
                </div>
            </div>
        );
    };

    const renderDonutChart = () => {
        const total = donutData.reduce((s, d) => s + d.rawValue, 0);
        return (
            <div style={S.chartContainer}>
                <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                        <Pie
                            data={donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                        >
                            {donutData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip content={({ active, payload }) => {
                            if (active && payload?.[0]) {
                                const d = payload[0].payload;
                                const pct = donutData.reduce((s, x) => s + x.value, 0);
                                return (
                                    <div style={S.tooltip}>
                                        <div style={{ color: d.color, fontWeight: 600 }}>{d.name}</div>
                                        <div>{formatValue(d.rawValue)} ({pct > 0 ? Math.round(d.value / pct * 100) : 0}%)</div>
                                    </div>
                                );
                            }
                            return null;
                        }} />
                    </PieChart>
                </ResponsiveContainer>
                <div style={{ textAlign: 'center', marginTop: -100, position: 'relative', pointerEvents: 'none' }}>
                    <div style={{ fontSize: 11, color: '#888' }}>Total</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: total >= 0 ? '#22c55e' : '#ef4444' }}>{formatValue(total)}</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 60, fontSize: 11 }}>
                    {donutData.map((d, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ccc' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                            {d.name}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderChart = () => {
        if (lineData.length === 0) {
            return (
                <div style={S.emptyState}>
                    <span>No data for this period</span>
                    <span style={S.emptyHint}>Log sessions to see your trend</span>
                </div>
            );
        }
        // If current chart type is disabled, fall back to line
        const active = isDisabled(chartType) ? 'line' : chartType;
        switch (active) {
            case 'line': return renderLineChart();
            case 'bar': return renderBarChart();
            case 'stacked': return renderStackedChart();
            case 'histogram': return renderHistogram();
            case 'heatmap': return renderHeatmap();
            case 'donut': return renderDonutChart();
            default: return renderLineChart();
        }
    };

    // ── Render ───────────────────────────────────────────────────

    if (isLoading) {
        return (
            <div style={S.container}>
                <div style={S.header}><h3 style={S.title}>Bankroll Trend</h3></div>
                <div style={S.loadingContainer}><div style={S.skeleton} /></div>
            </div>
        );
    }

    const renderChartToggle = (chart) => {
        const disabled = isDisabled(chart.key);
        const active = chartType === chart.key;
        return (
            <div
                key={chart.key}
                style={{ position: 'relative', display: 'inline-block' }}
                onMouseEnter={() => disabled && setHoveredDisabled(chart.key)}
                onMouseLeave={() => setHoveredDisabled(null)}
            >
                <button
                    onClick={() => !disabled && persistChartType(chart.key)}
                    disabled={disabled}
                    style={{
                        ...S.chartBtn,
                        ...(active ? S.chartBtnActive : {}),
                        ...(disabled ? S.chartBtnDisabled : {}),
                    }}
                >
                    {chart.label}
                </button>
                {hoveredDisabled === chart.key && disabledReasons[chart.key] && (
                    <div style={S.disabledTooltip}>
                        {disabledReasons[chart.key]}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={S.container}>
            <div style={S.header}>
                <div style={S.titleRow}>
                    <h3 style={S.title}>Bankroll Trend</h3>
                    <div style={S.currentValue}>
                        <span style={{ color: isPositive ? '#22c55e' : '#ef4444' }}>
                            {formatValue(stats.current)}
                        </span>
                    </div>
                </div>

                {/* Time Range Selector */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <div style={S.timeSelector}>
                        {TIME_RANGES.map(range => (
                            <button
                                key={range.key}
                                onClick={() => setTimeRange(range.key)}
                                style={{
                                    ...S.timeBtn,
                                    ...(timeRange === range.key ? S.timeBtnActive : {}),
                                }}
                            >
                                {range.label}
                            </button>
                        ))}
                    </div>

                    {/* Chart Type Toggles */}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        {PRIMARY_CHARTS.map(renderChartToggle)}
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            style={{
                                ...S.chartBtn,
                                fontSize: 10,
                                padding: '3px 6px',
                                ...(showAdvanced ? S.chartBtnActive : {}),
                            }}
                        >
                            {showAdvanced ? '◀' : 'More ▶'}
                        </button>
                        {showAdvanced && ADVANCED_CHARTS.map(renderChartToggle)}
                    </div>
                </div>
            </div>

            {/* Chart Area */}
            {renderChart()}

            {/* Stats Row (always visible) */}
            {lineData.length > 0 && (
                <div style={S.statsRow}>
                    <div style={S.statItem}>
                        <span style={S.statLabel}>High</span>
                        <span style={{ ...S.statValue, color: '#22c55e' }}>{formatValue(stats.high)}</span>
                    </div>
                    <div style={S.statItem}>
                        <span style={S.statLabel}>Low</span>
                        <span style={{ ...S.statValue, color: '#ef4444' }}>{formatValue(stats.low)}</span>
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

// ── Styles ───────────────────────────────────────────────────────
const S = {
    container: {
        background: 'linear-gradient(135deg, rgba(0,20,40,0.9), rgba(0,40,60,0.8))',
        borderRadius: 16,
        border: '1px solid rgba(0,212,255,0.2)',
        padding: 16,
        marginBottom: 16,
    },
    header: { marginBottom: 12 },
    titleRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    title: { margin: 0, fontSize: 16, fontWeight: 600, color: '#fff' },
    currentValue: { fontSize: 18, fontWeight: 700 },
    timeSelector: { display: 'flex', gap: 6 },
    timeBtn: {
        padding: '4px 10px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        color: '#888',
        fontSize: 11,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    timeBtnActive: {
        background: 'rgba(0,212,255,0.15)',
        borderColor: 'rgba(0,212,255,0.3)',
        color: '#2374e1',
    },
    chartBtn: {
        padding: '3px 8px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        color: '#888',
        fontSize: 10,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    chartBtnActive: {
        background: 'rgba(0,212,255,0.15)',
        borderColor: 'rgba(0,212,255,0.3)',
        color: '#2374e1',
    },
    chartBtnDisabled: {
        opacity: 0.35,
        cursor: 'not-allowed',
    },
    disabledTooltip: {
        position: 'absolute',
        bottom: '110%',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.9)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 10,
        color: '#ccc',
        whiteSpace: 'nowrap',
        zIndex: 10,
        pointerEvents: 'none',
    },
    chartContainer: { margin: '0 -8px' },
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 180,
        color: '#666',
        gap: 8,
    },
    emptyHint: { fontSize: 12, opacity: 0.7 },
    loadingContainer: {
        height: 180,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    skeleton: {
        width: '100%',
        height: 120,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
        borderRadius: 8,
        animation: 'pulse 1.5s infinite',
    },
    statsRow: {
        display: 'flex',
        justifyContent: 'space-around',
        paddingTop: 12,
        borderTop: '1px solid rgba(255,255,255,0.1)',
        marginTop: 8,
    },
    statItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
    },
    statLabel: { fontSize: 10, color: '#666', textTransform: 'uppercase' },
    statValue: { fontSize: 14, fontWeight: 600, color: '#fff' },
    tooltip: {
        background: 'rgba(0,0,0,0.9)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
    },
    tooltipDate: { color: '#888', marginBottom: 4 },
    tooltipSession: { color: '#888', marginTop: 4, fontSize: 11 },
};
