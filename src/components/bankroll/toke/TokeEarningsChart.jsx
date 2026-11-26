import {
    Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

// ── Tooltip wrapper ────────────────────────────────────────────
function TT({ children }) {
    return (
        <div role="tooltip" style={{
            background: 'linear-gradient(135deg, rgba(12,25,40,0.97), rgba(16,35,52,0.95))',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: 13,
            color: '#eff5fc',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            minWidth: 130,
        }}>
            {children}
        </div>
    );
}

const fmtK = (v) => {
    const abs = Math.abs(v);
    if (abs >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    return `$${v.toLocaleString()}`;
};

function EmptyChart({ msg }) {
    return (
        <div role="status" style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#b7c9db' }}>{msg}</span>
        </div>
    );
}

export default function TokeEarningsChart({ activeChart, trendData, monthlyData, donutData, totalDowns, fmt }) {
    // ── Chart renderers ──────────────────────────────────────
    const renderTrend = () => {
        if (!trendData.length) return <EmptyChart msg="Complete Your First Event To See The Trend" />;
        return (
            <ResponsiveContainer width="100%" height={236}>
                <AreaChart accessibilityLayer title="Cumulative Dealer Earnings" data={trendData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="tokeTrendGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#85d8fb" stopOpacity={0.45} />
                            <stop offset="60%" stopColor="#85d8fb" stopOpacity={0.12} />
                            <stop offset="100%" stopColor="#85d8fb" stopOpacity={0.02} />
                        </linearGradient>
                        <filter id="tokeGlow">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#304860" strokeDasharray="3 5" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false}
                        tick={{ fill: '#bad2e6', fontSize: 12 }}
                        interval="equidistantPreserveStart" />
                    <YAxis axisLine={false} tickLine={false} width="auto"
                        tick={{ fill: '#bad2e6', fontSize: 12 }}
                        tickFormatter={fmtK} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                    <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                            <TT>
                                <div style={{ color: '#85d8fb', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{d.venue}</div>
                                <div style={{ color: '#b7c9db', fontSize: 12, marginBottom: 6 }}>{d.date}</div>
                                <div style={{ color: '#caeaff', fontWeight: 700, fontSize: 15 }}>{fmt(d.tokes)} Tokes</div>
                                <div style={{ color: '#b7c9db', fontSize: 12, marginTop: 3 }}>
                                    {d.hours}h · Running: {fmt(d.cumulative)}
                                </div>
                            </TT>
                        );
                    }} />
                    <Area type="linear" dataKey="cumulative" stroke="#85d8fb" strokeWidth={2.5}
                        fill="url(#tokeTrendGrad)" dot={trendData.length===1?{r:4}:false}
                        activeDot={{ r: 5, fill: '#85d8fb', strokeWidth: 2, stroke: 'rgba(255,255,255,0.3)' }}
                        isAnimationActive={false} />
                </AreaChart>
            </ResponsiveContainer>
        );
    };

    const renderEvents = () => {
        if (!trendData.length) return <EmptyChart msg="No Completed Events Yet" />;
        return (
            <ResponsiveContainer width="100%" height={236}>
                <BarChart accessibilityLayer title="Tokes Per Event" data={trendData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="tokeBarGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#caeaff" stopOpacity={1} />
                            <stop offset="100%" stopColor="#2265b0" stopOpacity={0.8} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#304860" strokeDasharray="3 5" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false}
                        tick={{ fill: '#bad2e6', fontSize: 12 }}
                        interval="equidistantPreserveStart" />
                    <YAxis axisLine={false} tickLine={false} width="auto"
                        tick={{ fill: '#bad2e6', fontSize: 12 }}
                        tickFormatter={fmtK} />
                    <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                            <TT>
                                <div style={{ color: '#85d8fb', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{d.venue}</div>
                                <div style={{ color: '#b7c9db', fontSize: 12, marginBottom: 6 }}>{d.date}</div>
                                <div style={{ color: '#caeaff', fontWeight: 700, fontSize: 15 }}>{fmt(d.tokes)} Tokes</div>
                                <div style={{ color: '#b7c9db', fontSize: 12, marginTop: 3 }}>{d.hours}h Worked</div>
                            </TT>
                        );
                    }} />
                    <Bar dataKey="tokes" radius={[6, 6, 0, 0]} maxBarSize={36} fill="url(#tokeBarGrad)" />
                </BarChart>
            </ResponsiveContainer>
        );
    };

    const renderMonthly = () => {
        const hasMonthlyData = monthlyData.some(m => m.events > 0);
        if (!hasMonthlyData) return <EmptyChart msg="No Monthly Data Yet" />;
        return (
            <ResponsiveContainer width="100%" height={236}>
                <BarChart accessibilityLayer title="Monthly Tokes" data={monthlyData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#9ee5f3" stopOpacity={1} />
                            <stop offset="100%" stopColor="#317da5" stopOpacity={0.8} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#304860" strokeDasharray="3 5" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false}
                        tick={{ fill: '#bad2e6', fontSize: 12 }}
                        interval="preserveStartEnd" minTickGap={12} />
                    <YAxis axisLine={false} tickLine={false} width="auto"
                        tick={{ fill: '#bad2e6', fontSize: 12 }}
                        tickFormatter={fmtK} />
                    <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                            <TT>
                                <div style={{ color: '#b7c9db', fontSize: 12, marginBottom: 4 }}>{d.month}</div>
                                <div style={{ color: '#9ee5f3', fontWeight: 700, fontSize: 15 }}>{fmt(d.tokes)}</div>
                                {d.events > 0 && <div style={{ color: '#b7c9db', fontSize: 12, marginTop: 3 }}>{d.events} event{d.events !== 1 ? 's' : ''}</div>}
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
                <ResponsiveContainer width="100%" height={236}>
                    <PieChart accessibilityLayer title="Downs By Type">
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
                                    <div style={{ color: '#dce8f6', fontWeight: 700, fontSize: 15 }}>{d.value} Downs</div>
                                    <div style={{ color: '#b7c9db', fontSize: 12, marginTop: 2 }}>{pct}% Of Total</div>
                                </TT>
                            );
                        }} />
                    </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div style={{ position: 'absolute', top: 118, left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: 12, color: '#b7c9db', letterSpacing: 1, textTransform: 'uppercase' }}>Total</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#85d8fb', letterSpacing: '-0.5px' }}>{totalDowns}</div>
                    <div style={{ fontSize: 12, color: '#b7c9db' }}>Downs</div>
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


    switch (activeChart) {
        case 'events': return renderEvents();
        case 'monthly': return renderMonthly();
        case 'types': return renderDonut();
        default: return renderTrend();
    }
}
