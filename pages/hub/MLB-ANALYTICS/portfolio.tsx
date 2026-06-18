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
import { ArrowRight } from 'lucide-react';

import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

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
    <div className="bg-[#131420] border border-white/5 rounded-xl p-4 flex flex-col shadow-md">
        <div className="text-[11px] font-extrabold text-slate-400 tracking-widest mb-2 uppercase">{title}</div>
        <div className="text-2xl font-extrabold" style={{ color: valueColor }}>{isLoading ? '--' : value}</div>
        {sub && <div className="text-xs text-slate-500 mt-1 font-medium">{isLoading ? '--' : sub}</div>}
    </div>
);

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function PortfolioPage() {
    const [daysFilter, setDaysFilter] = useState<number | null>(null);
    const [marketFilter, setMarketFilter] = useState<string>('ALL');

    const apiUrl = `/api/mlb/portfolio?${daysFilter ? `days=${daysFilter}&` : ''}market=${marketFilter}`;

    const { data, error, isLoading } = useSWR(apiUrl, fetcher, {
        refreshInterval: 15000
    });

    const {
        totalBets = 0, wins = 0, losses = 0, pushes = 0, totalPnl = 0, currentBankroll = 1000, roi = 0, peakBankroll = 1000, maxDrawdown = 0, winRate = 0, weeklyCurve = [], recentBets = []
    } = data || {};

    const hasError = !!error;

    return (
        <div className="bg-[#0a0a15] min-h-screen font-inter pb-[70px] w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
            <SEOHead 
                title="Portfolio Simulator | MLB Analytics" 
                description="MLB Analytics Portfolio Simulator and virtual bankroll tracking."
                noIndex={true}
            />
            
            <UniversalHeader pageDepth={2} />
            <MlbSubNav />
            
            <div className="edge-to-edge-container max-w-[1000px] mx-auto px-4 py-6">
                <div className="flex flex-wrap gap-4 justify-between items-start mb-6">
                    <div>
                        <h1 className="m-0 text-[28px] font-extrabold text-slate-50 tracking-tight">
                            Portfolio <span className="text-[#00D4FF]">Simulator</span>
                        </h1>
                        <p className="m-0 mt-1 text-slate-400 text-[15px]">
                            Virtual bankroll — $1,000 starting · Kelly-sized from {totalBets.toLocaleString()} backtested markets
                        </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Link href="/hub/MLB-ANALYTICS/backtest" passHref>
                            <button className="flex items-center gap-1 py-2 px-4 bg-[#00D4FF]/10 border border-[#00D4FF]/30 rounded-md text-[#00D4FF] text-[13px] font-bold cursor-pointer transition-all duration-200 hover:bg-[#00D4FF]/20">
                                Backtest <ArrowRight size={16} />
                            </button>
                        </Link>
                        <Link href="/hub/MLB-ANALYTICS/model-intel" passHref>
                            <button className="flex items-center gap-1 py-2 px-4 bg-white/5 border border-white/10 rounded-md text-slate-200 text-[13px] font-bold cursor-pointer transition-all duration-200 hover:bg-white/10">
                                Model <ArrowRight size={16} />
                            </button>
                        </Link>
                    </div>
                </div>

                {hasError ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-[#131420] border border-[#ef4444]/50 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)] mb-8">
                        <div className="text-[13px] font-extrabold text-[#ef4444] tracking-[1px] mb-2">SYSTEM ERROR DETECTED</div>
                        <div className="text-sm text-slate-400 max-w-[300px] text-center">
                            Failed to load portfolio simulation data. The database might be unreachable.
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Filter Bar */}
                        <div className="flex flex-wrap gap-4 mb-6 items-center justify-between bg-[#131420] p-4 rounded-xl border border-[#2a3a4a]">
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
                                        className={`py-1.5 px-3 rounded-md text-xs font-bold cursor-pointer transition-all duration-200 ${marketFilter === m ? 'bg-[#FF00FF]/10 text-[#FF00FF] border border-[#FF00FF]/30' : 'bg-transparent text-slate-500 border border-transparent hover:text-slate-300'}`}
                                    >
                                        {m === 'ALL' ? 'ALL' : m === 'Moneyline' ? 'ML' : m === 'Run Line' ? 'RL' : 'TOT'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col lg:flex-row gap-4 mb-8">
                            <div className="w-full lg:w-1/3 bg-[#131420] border border-[#00D4FF]/20 rounded-xl p-6 flex flex-col justify-center items-center shadow-[inset_0_0_20px_rgba(0,212,255,0.05)]">
                                <div className="text-xs font-extrabold text-[#00D4FF] tracking-widest mb-2">CURRENT BANKROLL</div>
                                <div className="text-5xl font-extrabold text-white leading-none">
                                    {isLoading ? '--' : formatCurrency(currentBankroll)}
                                </div>
                                <div className={`text-sm font-bold mt-2 ${!isLoading && totalPnl < 0 ? 'text-[#FF0055]' : 'text-[#00D4FF]'}`}>
                                    {isLoading ? '--' : formatCurrency(totalPnl, true)} from start
                                </div>
                                <div className="text-xs text-slate-500 mt-1 font-medium">
                                    Started at $1,000.00
                                </div>
                            </div>

                            <div className="w-full lg:w-2/3 grid grid-cols-2 sm:grid-cols-3 gap-4">
                                <MetricBox title="TOTAL BETS" value={totalBets} sub={`${wins}W - ${losses}L - ${pushes}P`} isLoading={isLoading} />
                                <MetricBox title="TOTAL P&L" value={formatCurrency(totalPnl, true)} valueColor={totalPnl > 0 ? '#00D4FF' : totalPnl < 0 ? '#FF0055' : '#FFFFFF'} isLoading={isLoading} />
                                <MetricBox title="ROI" value={`${(roi || 0) > 0 ? '+' : ''}${(roi || 0).toFixed(2)}%`} valueColor={(roi || 0) > 0 ? '#00D4FF' : (roi || 0) < 0 ? '#FF0055' : '#FFFFFF'} isLoading={isLoading} />
                                <MetricBox title="MAX DRAWDOWN" value={`${(maxDrawdown || 0).toFixed(2)}%`} valueColor={(maxDrawdown || 0) > 0 ? '#FF0055' : '#FFFFFF'} isLoading={isLoading} />
                                <MetricBox title="PEAK BANKROLL" value={formatCurrency(peakBankroll)} valueColor="#00D4FF" isLoading={isLoading} />
                                <MetricBox title="WIN RATE" value={`${(winRate || 0).toFixed(1)}%`} valueColor="#FFFFFF" isLoading={isLoading} />
                            </div>
                        </div>

                        <h2 className="text-lg font-extrabold text-slate-50 mb-4 flex items-center gap-2">
                            <div className="w-1 h-[18px] bg-[#00D4FF] rounded-sm shadow-[0_0_8px_rgba(0,212,255,0.6)]" />
                            Equity Curve
                        </h2>
                        <div className="bg-[#0d1117] border border-[#2a3a4a] rounded-xl p-6 mb-8 h-[350px] shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
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
                        </div>

                        <h2 className="text-lg font-extrabold text-slate-50 mb-4 flex items-center gap-2">
                            <div className="w-1 h-[18px] bg-[#FF00FF] rounded-sm shadow-[0_0_8px_rgba(255,0,255,0.6)]" />
                            Recent Simulated Bets <span className="text-slate-400 font-normal text-sm">(last 20)</span>
                        </h2>
                        
                        <div className="w-full">
                            {isLoading ? (
                                <div className="bg-[#0d1117] border border-[#2a3a4a] rounded-xl p-6 text-center text-slate-400 w-full">Loading simulator data...</div>
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
