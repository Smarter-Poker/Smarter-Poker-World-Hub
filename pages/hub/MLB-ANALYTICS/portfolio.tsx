import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { useState } from 'react';
import RecentBetsTable from '../../../components/mlb/RecentBetsTable';
import dynamic from 'next/dynamic';

const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
import { ArrowRight, Activity, Loader2 } from 'lucide-react';

import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { logError } from '@/utils/logger';

const formatCurrency = (val: number, showSign = false) => {
    if (val === undefined || val === null) return '$0.00';
    const isNegative = val < 0;
    const absVal = Math.abs(val);
    const formatted = absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (showSign) {
        return val > 0 ? `+$${formatted}` : val < 0 ? `-$${formatted}` : `$${formatted}`;
    }
    return `$${formatted}`;
};

interface SimBet {
    id?: string;
    as_of_ts: string;
    pnl: number;
    result: string;
    stake: number;
    bankroll_after: number;
    market: string;
    selection: string;
    edge_pts: number;
}

interface WeeklyCurveItem {
    weekOf: string;
    bets: number;
    pnl: number;
    bankroll: number;
}

interface PortfolioPageProps {
    totalBets: number;
    wins: number;
    losses: number;
    pushes: number;
    totalPnl: number;
    currentBankroll: number;
    roi: number;
    peakBankroll: number;
    maxDrawdown: number;
    winRate: number;
    weeklyCurve: WeeklyCurveItem[];
    recentBets: SimBet[];
}


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

export default function PortfolioPage() {
    const router = useRouter();
    const [daysFilter, setDaysFilter] = useState<number | null>(null);
    const [marketFilter, setMarketFilter] = useState<string>('ALL');

    const apiUrl = `/api/mlb/portfolio?${daysFilter ? `days=${daysFilter}&` : ''}market=${marketFilter}`;

    const { data, error, isLoading } = useSWR(apiUrl, fetcher, {
        refreshInterval: 15000
    });

    const {
        totalBets = 0, wins = 0, losses = 0, pushes = 0, totalPnl = 0, currentBankroll = 1000, roi = 0, peakBankroll = 1000, maxDrawdown = 0, winRate = 0
    } = data || {};
    
    const weeklyCurve = data?.weeklyCurve || EMPTY_ARRAY;
    const recentBets = data?.recentBets || EMPTY_ARRAY;

    const hasError = !!error || !!data?.error;

    if (hasError) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Error" description="Data fetch failed" />
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
                title="Portfolio Simulator | MLB Analytics" 
                description="MLB Analytics Portfolio Simulator and virtual bankroll tracking."
                noIndex={true}
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
                            Virtual bankroll · Kelly-sized from {totalBets.toLocaleString()} backtested markets
                        </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Link href="/hub/MLB-ANALYTICS/backtest" passHref>
                            <button className="flex items-center gap-1 py-2 px-4 bg-[#00D4FF]/10 border border-[#00D4FF]/30 rounded-md text-[#00D4FF] text-[13px] font-bold cursor-pointer transition-all duration-200 hover:bg-[#00D4FF]/20">
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

                {isLoading && !data ? (
                    <div className="flex flex-col items-center justify-center py-20 min-h-[400px]">
                        <Loader2 className="w-12 h-12 animate-spin text-[#00D4FF] mb-4" />
                        <div className="text-[#00D4FF] font-bold tracking-widest text-sm animate-pulse">CALCULATING MATRICES...</div>
                    </div>
                ) : (
                    <>
                        {/* Filter Bar */}
                        <div className="flex flex-wrap gap-4 mb-6 items-center justify-between bg-[#0d1117] p-4 rounded-xl border-[2px] border-[#3d4f5f] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] relative z-10">
                            <div className="flex gap-2 items-center">
                                <span className="text-slate-400 text-xs font-semibold mr-2 uppercase tracking-wide">Timeframe:</span>
                                {[7, 14, 30].map(d => (
                                    <button
                                        key={d}
                                        onClick={() => setDaysFilter(d)}
                                        className={`py-1.5 px-3 rounded-md text-xs font-bold cursor-pointer transition-all duration-200 ${daysFilter === d ? 'bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30' : 'bg-transparent text-slate-500 border border-transparent hover:text-slate-300'}`}
                                    >
                                        {d} DAYS
                                    </button>
                                ))}
                                <button
                                    onClick={() => setDaysFilter(null)}
                                    className={`py-1.5 px-3 rounded-md text-xs font-bold cursor-pointer transition-all duration-200 ${daysFilter === null ? 'bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30' : 'bg-transparent text-slate-500 border border-transparent hover:text-slate-300'}`}
                                >
                                    YTD
                                </button>
                            </div>
                            
                            <div className="flex gap-2 items-center flex-wrap">
                                <span className="text-slate-400 text-xs font-semibold mr-2 uppercase tracking-wide">Market:</span>
                                {['ALL', 'Moneyline', 'Run Line', 'Totals'].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setMarketFilter(m)}
                                        className={`py-1.5 px-3 rounded-md text-xs font-bold cursor-pointer transition-all duration-200 ${marketFilter === m ? 'bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30' : 'bg-transparent text-slate-500 border border-transparent hover:text-slate-300'}`}
                                    >
                                        {m === 'ALL' ? 'ALL' : m === 'Moneyline' ? 'ML' : m === 'Run Line' ? 'RL' : 'TOT'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col lg:flex-row gap-4 mb-8 relative z-10">
                            <div className="relative w-full lg:w-1/3 bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-6 flex flex-col justify-center items-center shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[40px] opacity-20 animate-pulse"></div>
                                <div className="relative z-10 text-[11px] font-extrabold text-[#00D4FF] tracking-widest mb-2 uppercase">CURRENT BANKROLL</div>
                                <div className="relative z-10 text-5xl font-extrabold text-white leading-none" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 15px rgba(255,255,255,0.2)' }}>
                                    {isLoading ? <Loader2 className="w-10 h-10 animate-spin mx-auto text-[#00D4FF]" /> : formatCurrency(currentBankroll)}
                                </div>
                                <div className={`relative z-10 text-[13px] font-extrabold tracking-widest mt-2 uppercase ${!isLoading && totalPnl < 0 ? 'text-[#FF4444]' : 'text-[#00D4FF]'}`} style={{ textShadow: `0 0 10px ${!isLoading && totalPnl < 0 ? 'rgba(255,68,68,0.5)' : 'rgba(0,212,255,0.5)'}` }}>
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : formatCurrency(totalPnl, true)} from start
                                </div>
                                <div className="relative z-10 text-[10px] text-slate-500 mt-1 font-bold tracking-widest uppercase">
                                    Simulated Base Bankroll
                                </div>
                            </div>

                            <div className="w-full lg:w-2/3 grid grid-cols-2 sm:grid-cols-3 gap-4">
                                <MetricBox title="TOTAL BETS" value={totalBets} sub={`${wins}W - ${losses}L - ${pushes}P`} isLoading={isLoading} />
                                <MetricBox title="TOTAL P&L" value={formatCurrency(totalPnl, true)} valueColor={totalPnl > 0 ? '#00D4FF' : totalPnl < 0 ? '#FF0055' : '#FFFFFF'} isLoading={isLoading} />
                                <MetricBox title="ROI" value={`${Number(roi || 0) > 0 ? '+' : ''}${Number(roi || 0).toFixed(2)}%`} valueColor={Number(roi || 0) > 0 ? '#00D4FF' : Number(roi || 0) < 0 ? '#FF0055' : '#FFFFFF'} isLoading={isLoading} />
                                <MetricBox title="MAX DRAWDOWN" value={`${Number(maxDrawdown || 0).toFixed(2)}%`} valueColor={Number(maxDrawdown || 0) > 0 ? '#FF0055' : '#FFFFFF'} isLoading={isLoading} />
                                <MetricBox title="PEAK BANKROLL" value={formatCurrency(peakBankroll)} valueColor="#00D4FF" isLoading={isLoading} />
                                <MetricBox title="WIN RATE" value={`${Number(winRate || 0).toFixed(1)}%`} valueColor="#FFFFFF" isLoading={isLoading} />
                            </div>
                        </div>

                        <h2 className="text-lg font-extrabold text-white mb-4 flex items-center gap-2 uppercase tracking-widest relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                            <div className="w-1 h-[18px] bg-[#00D4FF] rounded-sm shadow-[0_0_8px_rgba(0,212,255,0.6)]" />
                            Equity Curve
                        </h2>
                        <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-6 mb-8 h-[350px] shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden z-10">
                            {weeklyCurve.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-slate-500 font-bold tracking-widest text-[11px] uppercase">
                                    NO EQUITY CURVE DATA AVAILABLE
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={weeklyCurve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorBankroll" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.4}/>
                                            <stop offset="95%" stopColor="#00D4FF" stopOpacity={0.0}/>
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

                        <h2 className="text-lg font-extrabold text-white mb-4 flex items-center gap-2 uppercase tracking-widest relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                            <div className="w-1 h-[18px] bg-[#00D4FF] rounded-sm shadow-[0_0_8px_rgba(0,212,255,0.6)]" />
                            Recent Simulated Bets <span className="text-slate-400 font-bold tracking-widest text-[11px]">(LAST 20)</span>
                        </h2>
                        
                        <div className="w-full">
                            {isLoading ? (
                                <div className="bg-[#0d1117] border border-[#2a3a4a] rounded-xl p-12 text-center flex flex-col items-center justify-center w-full">
                                    <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mb-4" />
                                    <div className="text-[#00D4FF] font-bold tracking-widest text-sm animate-pulse">SCANNING DATABASE...</div>
                                </div>
                            ) : (
                                <RecentBetsTable bets={recentBets} />
                            )}
                        </div>
                    </>
                )}
            </div>
            <BottomNavBar />
        </div>
    );
}
