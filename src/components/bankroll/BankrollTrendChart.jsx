/**
 * BANKROLL TREND CHART
 * Visual P/L trend chart using Recharts
 */

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with Recharts
const AreaChart = dynamic(() => import('recharts').then(mod => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(mod => mod.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false });

const TIME_RANGES = [
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: '90d', label: '90D' },
    { key: '1y', label: '1Y' },
    { key: 'all', label: 'All' },
];

export default function BankrollTrendChart({ entries = [], isLoading = false }) {
    const [timeRange, setTimeRange] = useState('30d');

    // Process entries into cumulative chart data
    const chartData = useMemo(() => {
        if (!entries || entries.length === 0) return [];

        // Filter by time range
        const now = new Date();
        let startDate = new Date();

        switch (timeRange) {
            case '7d':
                startDate.setDate(now.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(now.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(now.getDate() - 90);
                break;
            case '1y':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
            case 'all':
                startDate = new Date(0);
                break;
        }

        // Filter and sort entries (append T12:00:00 to avoid UTC midnight → wrong day in CST)
        const filtered = entries
            .filter(e => new Date(e.entry_date + 'T12:00:00') >= startDate)
            .sort((a, b) => new Date(a.entry_date + 'T12:00:00') - new Date(b.entry_date + 'T12:00:00'));

        if (filtered.length === 0) return [];

        // Calculate cumulative P/L
        let cumulative = 0;
        const data = filtered.map(entry => {
            const net = (entry.gross_out || 0) - (entry.gross_in || 0);
            cumulative += net;

            const date = new Date(entry.entry_date + 'T12:00:00');
            const formattedDate = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });

            return {
                date: formattedDate,
                value: cumulative,
                net,
                category: entry.category,
            };
        });

        return data;
    }, [entries, timeRange]);

    // Calculate stats
    const stats = useMemo(() => {
        if (chartData.length === 0) {
            return { current: 0, high: 0, low: 0, sessions: 0 };
        }

        const values = chartData.map(d => d.value);
        return {
            current: values[values.length - 1] || 0,
            high: Math.max(...values),
            low: Math.min(...values),
            sessions: chartData.length,
        };
    }, [chartData]);

    const formatValue = (value) => {
        if (value >= 0) return `+$${value.toLocaleString()}`;
        return `-$${Math.abs(value).toLocaleString()}`;
    };

    const isPositive = stats.current >= 0;

    if (isLoading) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <h3 style={styles.title}>Bankroll Trend</h3>
                </div>
                <div style={styles.loadingContainer}>
                    <div style={styles.skeleton} />
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.titleRow}>
                    <h3 style={styles.title}>Bankroll Trend</h3>
                    <div style={styles.currentValue}>
                        <span style={{ color: isPositive ? '#22c55e' : '#ef4444' }}>
                            {formatValue(stats.current)}
                        </span>
                    </div>
                </div>
                <div style={styles.timeSelector}>
                    {TIME_RANGES.map(range => (
                        <button
                            key={range.key}
                            onClick={() => setTimeRange(range.key)}
                            style={{
                                ...styles.timeBtn,
                                ...(timeRange === range.key ? styles.timeBtnActive : {}),
                            }}
                        >
                            {range.label}
                        </button>
                    ))}
                </div>
            </div>

            {chartData.length === 0 ? (
                <div style={styles.emptyState}>
                    <span style={styles.emptyIcon}></span>
                    <span>No data for this period</span>
                    <span style={styles.emptyHint}>Log sessions to see your trend</span>
                </div>
            ) : (
                <>
                    <div style={styles.chartContainer}>
                        <ResponsiveContainer width="100%" height={180}>
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#666', fontSize: 10 }}
                                    interval="preserveStartEnd"
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#666', fontSize: 10 }}
                                    tickFormatter={(v) => `$${v >= 0 ? v : -v}${v < 0 ? '' : ''}`}
                                    width={50}
                                />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div style={styles.tooltip}>
                                                    <div style={styles.tooltipDate}>{data.date}</div>
                                                    <div style={{ color: data.value >= 0 ? '#22c55e' : '#ef4444' }}>
                                                        {formatValue(data.value)}
                                                    </div>
                                                    <div style={styles.tooltipSession}>
                                                        Session: {data.net >= 0 ? '+' : ''}${data.net.toLocaleString()}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke={isPositive ? '#22c55e' : '#ef4444'}
                                    strokeWidth={2}
                                    fill={isPositive ? 'url(#colorPositive)' : 'url(#colorNegative)'}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    <div style={styles.statsRow}>
                        <div style={styles.statItem}>
                            <span style={styles.statLabel}>High</span>
                            <span style={{ ...styles.statValue, color: '#22c55e' }}>
                                {formatValue(stats.high)}
                            </span>
                        </div>
                        <div style={styles.statItem}>
                            <span style={styles.statLabel}>Low</span>
                            <span style={{ ...styles.statValue, color: '#ef4444' }}>
                                {formatValue(stats.low)}
                            </span>
                        </div>
                        <div style={styles.statItem}>
                            <span style={styles.statLabel}>Sessions</span>
                            <span style={styles.statValue}>{stats.sessions}</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

const styles = {
    container: {
        background: 'linear-gradient(135deg, rgba(0,20,40,0.9), rgba(0,40,60,0.8))',
        borderRadius: 16,
        border: '1px solid rgba(0,212,255,0.2)',
        padding: 16,
        marginBottom: 16,
    },
    header: {
        marginBottom: 12,
    },
    titleRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    title: {
        margin: 0,
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
    },
    currentValue: {
        fontSize: 18,
        fontWeight: 700,
    },
    timeSelector: {
        display: 'flex',
        gap: 6,
    },
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
    chartContainer: {
        margin: '0 -8px',
    },
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 180,
        color: '#666',
        gap: 8,
    },
    emptyIcon: {
        fontSize: 32,
        opacity: 0.5,
    },
    emptyHint: {
        fontSize: 12,
        opacity: 0.7,
    },
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
    statLabel: {
        fontSize: 10,
        color: '#666',
        textTransform: 'uppercase',
    },
    statValue: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
    },
    tooltip: {
        background: 'rgba(0,0,0,0.9)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
    },
    tooltipDate: {
        color: '#888',
        marginBottom: 4,
    },
    tooltipSession: {
        color: '#888',
        marginTop: 4,
        fontSize: 11,
    },
};
