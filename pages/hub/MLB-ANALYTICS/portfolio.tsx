import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import useSWR from 'swr';
import React, { useState } from 'react';
import RecentBetsTable from '../../../components/mlb/RecentBetsTable';
import dynamic from 'next/dynamic';

const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
import { ArrowRight, Activity, Loader2, Download } from 'lucide-react';

import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { logError } from '@/utils/logger';

const formatCurrency = (val: number, showSign = false) => {
    if (val === undefined || val === null || isNaN(val)) return '$0.00';
    const absVal = Math.abs(val);
    const formatted = absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (showSign) {
        return val > 0 ? `+$${formatted}` : val < 0 ? `-$${formatted}` : `$${formatted}`;
    }
    return `$${formatted}`;
};

const formatPct = (val: number, showSign = false) => {
    const n = Number(val || 0);
    return `${showSign && n > 0 ? '+' : ''}${n.toFixed(2)}%`;
};

// Friendly market labels — the DB stores raw 'h2h' / 'total'.
const marketLabel = (m: string) => (m === 'h2h' ? 'Moneyline' : m === 'total' ? 'Totals' : (m || '—'));

const fmtDay = (d?: string | null) =>
    d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';

// Canonical five-tier palette — identical to src/lib/betScore.ts TIER_STYLE and best-bets.
const tierColor = (tier: string) => {
    switch ((tier || '').toUpperCase()) {
        case 'ELITE': return { color: '#00D4FF', bg: 'rgba(0,212,255,0.12)', border: 'rgba(0,212,255,0.4)' };
        case 'STRONG': return { color: '#34D399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.4)' };
        case 'LEAN': return { color: '#38BDF8', bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.4)' };
        case 'THIN': return { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.4)' };
        default: return { color: '#64748B', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.3)' };
    }
};

const winPct = (wins: number, losses: number) => {
    const d = (wins || 0) + (losses || 0);
    return d > 0 ? ((wins || 0) / d) * 100 : 0;
};

interface MetricBoxProps {
    title: string;
    value: string | number;
    sub?: string;
    valueColor?: string;
    isLoading?: boolean;
}

const MetricBox = ({ title, value, sub, valueColor = '#FFFFFF', isLoading }: MetricBoxProps) => (
    <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 flex flex-col shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_0_10px_rgba(0,0,0,0.5)] transition-all hover:border-[#00D4FF] hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_0_15px_rgba(0,212,255,0.2)]">
        <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-2 uppercase">{title}</div>
        <div className="text-2xl font-extrabold" style={{ color: isLoading ? '#00D4FF' : valueColor, textShadow: isLoading || valueColor !== '#FFFFFF' ? `0 0 10px ${isLoading ? '#00D4FF' : valueColor}80` : 'none', fontFamily: '"Rajdhani", sans-serif' }}>
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#00D4FF]" /> : value}
        </div>
        {sub && <div className="text-[11px] text-slate-500 mt-1 font-bold tracking-widest uppercase">{isLoading ? '--' : sub}</div>}
    </div>
);

const SectionTitle = ({ children, tag }: { children: React.ReactNode; tag?: string }) => (
    <h2 className="text-lg font-extrabold text-white mb-4 flex items-center gap-2 uppercase tracking-widest relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
        <div className="w-1 h-[18px] bg-[#00D4FF] rounded-sm shadow-[0_0_8px_rgba(0,212,255,0.6)]" />
        {children}
        {tag && <span className="text-slate-400 font-bold tracking-widest text-[10px] border border-[#3d4f5f] rounded px-1.5 py-0.5">{tag}</span>}
    </h2>
);

const fetcher = async (url: string) => {
    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return await res.json();
    } catch (err) {
        logError('SWR Fetch', err);
        throw err;
    }
};

const EMPTY_ARRAY: any[] = [];

// Market chips map UI label -> raw DB value. Only h2h + total exist in sim_bets,
// so we expose exactly those (no phantom "Run Line").
const MARKETS = [
    { val: 'ALL', short: 'ALL' },
    { val: 'h2h', short: 'ML' },
    { val: 'total', short: 'TOT' },
];

export default function PortfolioPage() {
    const router = useRouter();
    const [daysFilter, setDaysFilter] = useState<number | null>(null);
    const [marketFilter, setMarketFilter] = useState<string>('ALL');

    const apiUrl = `/api/mlb/portfolio?${daysFilter ? `days=${daysFilter}&` : ''}market=${marketFilter}`;

    const { data, error, isLoading } = useSWR(apiUrl, fetcher, {
        refreshInterval: 600000, // 10 min — portfolio stats update nightly
        revalidateOnFocus: false,
    });

    // Full-backtest analytics (filter-independent). Never blocks the page.
    const { data: extras } = useSWR('/api/mlb/portfolio-extras', fetcher, {
        refreshInterval: 600000,
        revalidateOnFocus: false,
    });

    const {
        totalBets = 0, wins = 0, losses = 0, pushes = 0, totalPnl = 0, currentBankroll = 1000, roi = 0, peakBankroll = 1000, maxDrawdown = 0, winRate = 0
    } = data || {};

    const weeklyCurve = data?.weeklyCurve || EMPTY_ARRAY;
    const recentBets = data?.recentBets || EMPTY_ARRAY;

    const risk = extras?.riskMetrics;
    const markets = extras?.marketSummary || EMPTY_ARRAY;
    const baseline = extras?.baseline;
    const grades = extras?.gradeSummary || EMPTY_ARRAY;
    const equityDaily = extras?.equityDaily || EMPTY_ARRAY;
    const dataWindow = extras?.dataWindow;

    // Only show the page-level spinner on the very first load (no cached data yet).
    const loading = isLoading && !data;

    const csvHref = `/api/mlb/portfolio-csv?${daysFilter ? `days=${daysFilter}&` : ''}market=${marketFilter}`;

    // Kelly-vs-flat (full backtest): Kelly final = last daily end_bankroll; flat from baseline view.
    const kellyFinal = equityDaily.length > 0 ? Number(equityDaily[equityDaily.length - 1].end_bankroll) : null;
    const startBankroll = baseline ? Number(baseline.starting_bankroll) : 1000;
    const flatFinal = baseline ? Number(baseline.flat_final_bankroll) : null;
    const kellyGrowth = kellyFinal != null && startBankroll > 0 ? (kellyFinal / startBankroll - 1) * 100 : null;
    const flatGrowth = flatFinal != null && startBankroll > 0 ? (flatFinal / startBankroll - 1) * 100 : null;
    const kellyMultiple = kellyFinal != null && flatFinal && flatFinal !== startBankroll
        ? (kellyFinal - startBankroll) / (flatFinal - startBankroll)
        : null;

    const hasError = !!error || !!data?.error;

    if (hasError) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Betting Portfolio — Simulated P&amp;L &amp; Unit Tracking | Smarter.Poker" description="Simulated MLB betting portfolio tracker by Smarter.Poker." noindex={true} />
                <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#00D4FF]/50 shadow-[0_0_20px_rgba(0,212,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
                        <Activity className="w-12 h-12 text-[#00D4FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF4444] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load data. Please try again later.</p>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    return (
        <div className="bg-[#0a0a15] min-h-screen font-inter pb-[70px] w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
            <SEOHead
                title="MLB Betting Portfolio — Simulated P&L & Unit Tracking | Smarter.Poker"
                description="Simulated MLB betting portfolio for Smarter.Poker model picks: cumulative bankroll, ROI, win rate, profit factor, max drawdown, per-market and per-tier results, and the full bet log across the 2026 MLB season."
                canonical="/hub/MLB-ANALYTICS/portfolio"
                ogImage="/images/mlb/og.png"
                jsonLd={{
                    "@context": "https://schema.org",
                    "@type": "Dataset",
                    "name": "MLB Portfolio Analytics — Cumulative ROI & Performance Tracking",
                    "description": "Full-season simulated portfolio performance for Smarter.Poker MLB model picks: cumulative bankroll, ROI, win rate, profit factor, max drawdown, and per-market / per-Bet-Score-tier breakdowns over the 2026 MLB season.",
                    "url": "https://smarter.poker/hub/MLB-ANALYTICS/portfolio",
                    "provider": { "@type": "Organization", "name": "Smarter.Poker", "url": "https://smarter.poker" }
                }}
            />

            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
            <MlbSubNav />

            <div className="edge-to-edge-container max-w-[1000px] mx-auto px-4 py-6 relative">
                {/* Background Glows */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.03] pointer-events-none"></div>
                <div className="absolute bottom-40 left-0 w-96 h-96 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.02] pointer-events-none"></div>

                <div className="flex flex-wrap gap-4 justify-between items-start mb-6 relative z-10">
                    <div>
                        <h1 className="m-0 text-3xl font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 15px rgba(255,255,255,0.2)' }}>
                            PORTFOLIO <span className="text-[#00D4FF]" style={{ textShadow: '0 0 15px rgba(0,212,255,0.4)' }}>SIMULATOR</span>
                        </h1>
                        <p className="m-0 mt-1 text-[#00D4FF] font-bold uppercase tracking-wider text-[11px]">
                            Virtual bankroll · Kelly-sized from {totalBets.toLocaleString()} model-graded markets
                        </p>
                        {dataWindow?.firstDay && dataWindow?.lastDay && (
                            <p className="m-0 mt-1 text-slate-500 font-semibold text-[11px] tracking-wide">
                                Backtest window: {fmtDay(dataWindow.firstDay)} – {fmtDay(dataWindow.lastDay)}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <a
                            href={csvHref}
                            className="flex items-center gap-1 py-2 px-4 bg-[#00D4FF]/10 border border-[#00D4FF]/30 rounded-md text-[#00D4FF] text-[13px] font-bold cursor-pointer transition-all duration-200 hover:bg-[#00D4FF]/20"
                            aria-label="Download bet log as CSV"
                        >
                            <Download size={16} /> CSV
                        </a>
                        <Link href="/hub/MLB-ANALYTICS/backtest" passHref>
                            <button className="flex items-center gap-1 py-2 px-4 bg-[#1a2332] border border-[#3d4f5f] rounded-md text-slate-200 text-[13px] font-bold cursor-pointer transition-all duration-200 hover:bg-[#3d4f5f]">
                                Backtest <ArrowRight size={16} />
                            </button>
                        </Link>
                        <Link href="/hub/MLB-ANALYTICS/model-intel" passHref>
                            <button className="flex items-center gap-1 py-2 px-4 bg-[#1a2332] border border-[#3d4f5f] rounded-md text-slate-200 text-[13px] font-bold cursor-pointer transition-all duration-200 hover:bg-[#3d4f5f]">
                                Model <ArrowRight size={16} />
                            </button>
                        </Link>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 min-h-[400px]">
                        <Loader2 className="w-12 h-12 animate-spin text-[#00D4FF] mb-4" />
                        <div className="text-[#00D4FF] font-bold tracking-widest text-sm animate-pulse">CALCULATING MATRICES...</div>
                    </div>
                ) : (
                    <>
                        {/* Filter Bar */}
                        <div className="flex flex-wrap gap-4 mb-6 items-center justify-between bg-[#0d1117] p-4 rounded-xl border-[2px] border-[#3d4f5f] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] relative z-10">
                            <div className="flex gap-2 items-center" role="group" aria-label="Timeframe filter">
                                <span className="text-slate-400 text-xs font-semibold mr-2 uppercase tracking-wide">Timeframe:</span>
                                {[7, 14, 30].map(d => (
                                    <button
                                        key={d}
                                        onClick={() => setDaysFilter(d)}
                                        aria-pressed={daysFilter === d}
                                        className={`min-h-[36px] py-1.5 px-3 rounded-md text-xs font-bold cursor-pointer transition-all duration-200 ${daysFilter === d ? 'bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30' : 'bg-transparent text-slate-500 border border-transparent hover:text-slate-300'}`}
                                    >
                                        {d} DAYS
                                    </button>
                                ))}
                                <button
                                    onClick={() => setDaysFilter(null)}
                                    aria-pressed={daysFilter === null}
                                    className={`min-h-[36px] py-1.5 px-3 rounded-md text-xs font-bold cursor-pointer transition-all duration-200 ${daysFilter === null ? 'bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30' : 'bg-transparent text-slate-500 border border-transparent hover:text-slate-300'}`}
                                >
                                    YTD
                                </button>
                            </div>

                            <div className="flex gap-2 items-center flex-wrap" role="group" aria-label="Market filter">
                                <span className="text-slate-400 text-xs font-semibold mr-2 uppercase tracking-wide">Market:</span>
                                {MARKETS.map(m => (
                                    <button
                                        key={m.val}
                                        onClick={() => setMarketFilter(m.val)}
                                        aria-pressed={marketFilter === m.val}
                                        className={`min-h-[36px] py-1.5 px-3 rounded-md text-xs font-bold cursor-pointer transition-all duration-200 ${marketFilter === m.val ? 'bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30' : 'bg-transparent text-slate-500 border border-transparent hover:text-slate-300'}`}
                                    >
                                        {m.short}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col lg:flex-row gap-4 mb-8 relative z-10">
                            <div className="relative w-full lg:w-1/3 bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-6 flex flex-col justify-center items-center shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[40px] opacity-20 animate-pulse"></div>
                                <div className="relative z-10 text-[11px] font-extrabold text-[#00D4FF] tracking-widest mb-2 uppercase">CURRENT BANKROLL</div>
                                <div className="relative z-10 text-5xl font-extrabold text-white leading-none" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 15px rgba(255,255,255,0.2)' }}>
                                    {formatCurrency(currentBankroll)}
                                </div>
                                <div className={`relative z-10 text-[13px] font-extrabold tracking-widest mt-2 uppercase ${totalPnl < 0 ? 'text-[#FF4444]' : 'text-[#00D4FF]'}`} style={{ textShadow: `0 0 10px ${totalPnl < 0 ? 'rgba(255,68,68,0.5)' : 'rgba(0,212,255,0.5)'}` }}>
                                    {formatCurrency(totalPnl, true)} from start
                                </div>
                                <div className="relative z-10 text-[10px] text-slate-500 mt-1 font-bold tracking-widest uppercase">
                                    $1,000 Simulated Base
                                </div>
                            </div>

                            <div className="w-full lg:w-2/3 grid grid-cols-2 sm:grid-cols-3 gap-4">
                                <MetricBox title="TOTAL BETS" value={totalBets} sub={`${wins}W - ${losses}L - ${pushes}P`} />
                                <MetricBox title="TOTAL P&L" value={formatCurrency(totalPnl, true)} valueColor={totalPnl > 0 ? '#00D4FF' : totalPnl < 0 ? '#FF0055' : '#FFFFFF'} />
                                <MetricBox title="ROI" value={formatPct(roi, true)} valueColor={Number(roi || 0) > 0 ? '#00D4FF' : Number(roi || 0) < 0 ? '#FF0055' : '#FFFFFF'} />
                                <MetricBox title="MAX DRAWDOWN" value={formatPct(maxDrawdown)} valueColor={Number(maxDrawdown || 0) > 0 ? '#FF0055' : '#FFFFFF'} />
                                <MetricBox title="PEAK BANKROLL" value={formatCurrency(peakBankroll)} valueColor="#00D4FF" />
                                <MetricBox title="WIN RATE" value={`${Number(winRate || 0).toFixed(1)}%`} valueColor="#FFFFFF" />
                            </div>
                        </div>

                        <SectionTitle>Equity Curve</SectionTitle>
                        <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-6 mb-8 h-[350px] shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden z-10" role="img" aria-label="Cumulative bankroll equity curve by week">
                            {weeklyCurve.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-slate-500 font-bold tracking-widest text-[11px] uppercase">
                                    NO EQUITY CURVE DATA AVAILABLE
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={weeklyCurve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorBankroll" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.4} />
                                                <stop offset="95%" stopColor="#00D4FF" stopOpacity={0.0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4a" vertical={false} />
                                        <XAxis
                                            dataKey="weekOf"
                                            stroke="#64748B"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(val) => {
                                                if (!val) return '';
                                                const d = new Date(val);
                                                if (isNaN(d.getTime())) return '';
                                                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
                                            }}
                                        />
                                        <YAxis
                                            stroke="#64748B"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            domain={['auto', 'auto']}
                                            tickFormatter={(val) => `${val}`}
                                        />
                                        <Tooltip
                                            contentStyle={{ background: '#0a0a15', border: '1px solid #00D4FF', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)' }}
                                            itemStyle={{ color: '#00D4FF', fontWeight: 700 }}
                                            labelStyle={{ color: '#F8FAFC', marginBottom: '4px' }}
                                            formatter={(value: number) => [formatCurrency(value), 'Bankroll']}
                                            labelFormatter={(label) => `Week of ${label}`}
                                        />
                                        <Area type="monotone" dataKey="bankroll" stroke="#00D4FF" strokeWidth={3} fillOpacity={1} fill="url(#colorBankroll)" activeDot={{ r: 6, fill: '#00D4FF', stroke: '#0a0a15', strokeWidth: 2 }} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* ───────── FULL BACKTEST ANALYTICS (filter-independent) ───────── */}
                        {(risk || baseline || markets.length > 0 || grades.length > 0) && (
                            <div className="mb-2 mt-2 flex items-center gap-3 relative z-10">
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#3d4f5f] to-[#3d4f5f]" />
                                <span className="text-[10px] font-extrabold tracking-[0.2em] text-slate-500 uppercase">Full Backtest Analytics</span>
                                <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[#3d4f5f] to-[#3d4f5f]" />
                            </div>
                        )}

                        {/* Kelly vs Flat */}
                        {baseline && kellyFinal != null && flatFinal != null && (
                            <div className="mb-8 relative z-10">
                                <SectionTitle tag="FULL BACKTEST">Kelly Sizing vs Flat Staking</SectionTitle>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="bg-[#0d1117] border-[2px] border-[#00D4FF]/40 rounded-xl p-5 shadow-[0_0_15px_rgba(0,212,255,0.1)]">
                                        <div className="text-[10px] font-bold text-[#00D4FF] tracking-widest mb-2 uppercase">Model (Kelly-Sized)</div>
                                        <div className="text-3xl font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{formatCurrency(kellyFinal)}</div>
                                        <div className="text-[12px] font-bold text-[#00D4FF] mt-1 tracking-wide">{formatPct(kellyGrowth || 0, true)} bankroll growth</div>
                                    </div>
                                    <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-5">
                                        <div className="text-[10px] font-bold text-slate-400 tracking-widest mb-2 uppercase">Flat {formatCurrency(Number(baseline.unit_size))}/Unit</div>
                                        <div className="text-3xl font-extrabold text-slate-200" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{formatCurrency(flatFinal)}</div>
                                        <div className="text-[12px] font-bold text-slate-400 mt-1 tracking-wide">{formatPct(flatGrowth || 0, true)} bankroll growth</div>
                                    </div>
                                </div>
                                {kellyMultiple != null && kellyMultiple > 0 && (
                                    <p className="text-[11px] text-slate-500 mt-3 font-semibold tracking-wide">
                                        Same picks, same {formatCurrency(startBankroll)} start — Kelly-fractional sizing produced {kellyMultiple.toFixed(1)}x the profit of flat {formatCurrency(Number(baseline.unit_size))} units.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Risk & Quality */}
                        {risk && (
                            <div className="mb-8 relative z-10">
                                <SectionTitle tag="FULL BACKTEST">Risk &amp; Quality</SectionTitle>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    <MetricBox title="PROFIT FACTOR" value={`${Number(risk.profit_factor || 0).toFixed(2)}x`} sub="Gross won / lost" valueColor={Number(risk.profit_factor || 0) >= 1 ? '#00D4FF' : '#FF0055'} />
                                    <MetricBox title="EXPECTANCY / BET" value={formatCurrency(Number(risk.expectancy || 0), true)} sub="Avg profit per bet" valueColor={Number(risk.expectancy || 0) >= 0 ? '#00D4FF' : '#FF0055'} />
                                    <MetricBox title="AVG STAKE" value={formatCurrency(Number(risk.avg_stake || 0))} sub="Per bet" />
                                    <MetricBox title="LONGEST WIN RUN" value={`${risk.longest_win_streak || 0}`} sub={`${risk.longest_loss_streak || 0} loss run`} valueColor="#00D4FF" />
                                    <MetricBox title="BEST DAY" value={formatCurrency(Number(risk.best_day || 0), true)} valueColor="#00D4FF" />
                                    <MetricBox title="WORST DAY" value={formatCurrency(Number(risk.worst_day || 0), true)} valueColor="#FF0055" />
                                </div>
                            </div>
                        )}

                        {/* By Market */}
                        {markets.length > 0 && (
                            <div className="mb-8 relative z-10">
                                <SectionTitle tag="FULL BACKTEST">Results by Market</SectionTitle>
                                <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl overflow-x-auto shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                                    <table className="w-full min-w-[460px] border-collapse text-left text-[13px]">
                                        <thead>
                                            <tr className="border-b-[2px] border-[#3d4f5f] text-[#8b9bb4] bg-[#1a2332] uppercase tracking-widest text-[11px]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                <th className="py-3 px-4 font-semibold">Market</th>
                                                <th className="py-3 px-4 font-semibold text-right">Bets</th>
                                                <th className="py-3 px-4 font-semibold text-right">Win%</th>
                                                <th className="py-3 px-4 font-semibold text-right">P&amp;L</th>
                                                <th className="py-3 px-4 font-semibold text-right">ROI</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {markets.map((m: any) => (
                                                <tr key={m.market} className="border-b border-[#2a3a4a] hover:bg-[#1a2332]/50 transition-colors">
                                                    <td className="py-3 px-4 font-bold text-slate-100">{marketLabel(m.market)}</td>
                                                    <td className="py-3 px-4 text-right text-slate-300">{m.bets}</td>
                                                    <td className="py-3 px-4 text-right text-slate-300">{winPct(m.wins, m.losses).toFixed(1)}%</td>
                                                    <td className={`py-3 px-4 text-right font-semibold ${Number(m.pnl) >= 0 ? 'text-[#00D4FF]' : 'text-[#FF0055]'}`}>{formatCurrency(Number(m.pnl), true)}</td>
                                                    <td className={`py-3 px-4 text-right font-bold ${Number(m.roi) >= 0 ? 'text-[#00D4FF]' : 'text-[#FF0055]'}`}>{formatPct(Number(m.roi), true)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* By Bet Score Tier */}
                        {grades.length > 0 && (
                            <div className="mb-8 relative z-10">
                                <SectionTitle tag="FULL BACKTEST">Results by Bet Score Tier</SectionTitle>
                                <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl overflow-x-auto shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                                    <table className="w-full min-w-[460px] border-collapse text-left text-[13px]">
                                        <thead>
                                            <tr className="border-b-[2px] border-[#3d4f5f] text-[#8b9bb4] bg-[#1a2332] uppercase tracking-widest text-[11px]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                <th className="py-3 px-4 font-semibold">Tier</th>
                                                <th className="py-3 px-4 font-semibold text-right">Bets</th>
                                                <th className="py-3 px-4 font-semibold text-right">Win%</th>
                                                <th className="py-3 px-4 font-semibold text-right">P&amp;L</th>
                                                <th className="py-3 px-4 font-semibold text-right">ROI</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {grades.map((g: any) => {
                                                const tc = tierColor(g.bet_tier);
                                                return (
                                                    <tr key={g.bet_tier} className="border-b border-[#2a3a4a] hover:bg-[#1a2332]/50 transition-colors">
                                                        <td className="py-3 px-4">
                                                            <span className="py-1 px-2 rounded text-[11px] font-extrabold tracking-wide" style={{ color: tc.color, background: tc.bg, border: `1px solid ${tc.border}` }}>
                                                                {g.bet_tier}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 text-right text-slate-300">{g.bets}</td>
                                                        <td className="py-3 px-4 text-right text-slate-300">{winPct(g.wins, g.losses).toFixed(1)}%</td>
                                                        <td className={`py-3 px-4 text-right font-semibold ${Number(g.pnl) >= 0 ? 'text-[#00D4FF]' : 'text-[#FF0055]'}`}>{formatCurrency(Number(g.pnl), true)}</td>
                                                        <td className={`py-3 px-4 text-right font-bold ${Number(g.roi) >= 0 ? 'text-[#00D4FF]' : 'text-[#FF0055]'}`}>{formatPct(Number(g.roi), true)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Drawdown (underwater) */}
                        {equityDaily.length > 0 && (
                            <div className="mb-8 relative z-10">
                                <SectionTitle tag="FULL BACKTEST">Drawdown</SectionTitle>
                                <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-6 h-[260px] shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden" role="img" aria-label="Daily drawdown from peak bankroll (underwater chart)">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={equityDaily} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#FF0055" stopOpacity={0.0} />
                                                    <stop offset="95%" stopColor="#FF0055" stopOpacity={0.4} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4a" vertical={false} />
                                            <XAxis
                                                dataKey="day"
                                                stroke="#64748B"
                                                fontSize={12}
                                                tickLine={false}
                                                axisLine={false}
                                                minTickGap={28}
                                                tickFormatter={(val) => {
                                                    if (!val) return '';
                                                    const d = new Date(`${val}T00:00:00Z`);
                                                    if (isNaN(d.getTime())) return '';
                                                    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
                                                }}
                                            />
                                            <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin', 0]} tickFormatter={(val) => `${val}%`} />
                                            <Tooltip
                                                contentStyle={{ background: '#0a0a15', border: '1px solid #FF0055', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)' }}
                                                itemStyle={{ color: '#FF0055', fontWeight: 700 }}
                                                labelStyle={{ color: '#F8FAFC', marginBottom: '4px' }}
                                                formatter={(value: number) => [`${Number(value).toFixed(2)}%`, 'Drawdown']}
                                                labelFormatter={(label) => `${fmtDay(label)}`}
                                            />
                                            <Area type="monotone" dataKey="drawdown" stroke="#FF0055" strokeWidth={2} fillOpacity={1} fill="url(#colorDrawdown)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        <SectionTitle>
                            Recent Simulated Bets <span className="text-slate-400 font-bold tracking-widest text-[11px]">(LAST 20)</span>
                        </SectionTitle>

                        <div className="w-full">
                            <RecentBetsTable bets={recentBets} isLoading={isLoading && !data} />
                        </div>

                        {/* Methodology / disclaimer */}
                        <div className="mt-8 bg-[#0d1117] border border-[#2a3a4a] rounded-xl p-5 text-[12px] leading-relaxed text-slate-400 relative z-10">
                            <div className="text-[10px] font-extrabold tracking-widest text-slate-500 uppercase mb-2">Methodology</div>
                            <p className="m-0">
                                A virtual {formatCurrency(startBankroll)} bankroll is staked on every model-graded MLB pick using Kelly-fractional
                                sizing. Results are simulated at the model&apos;s graded price across moneyline and totals markets
                                {dataWindow?.firstDay && dataWindow?.lastDay ? ` from ${fmtDay(dataWindow.firstDay)} to ${fmtDay(dataWindow.lastDay)}` : ''}.
                                Past simulated performance does not guarantee future results. Analysis only — not betting advice.
                            </p>
                        </div>
                    </>
                )}
            </div>
            <BottomNavBar />
        </div>
    );
}
