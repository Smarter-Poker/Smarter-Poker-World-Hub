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

import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { fetchPortfolioStats } from '../../../utils/mlbStats';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

function getWeekStart(d: string) {
    const date = new Date(d);
    const day = date.getUTCDay();
    const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
    return monday.toISOString().split('T')[0];
}

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
    <div style={{ background: '#131420', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', letterSpacing: '1px', marginBottom: '8px' }}>{title}</div>
        <div style={{ fontSize: '24px', fontWeight: 800, color: valueColor }}>{isLoading ? '--' : value}</div>
        {sub && <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', fontWeight: 500 }}>{isLoading ? '--' : sub}</div>}
    </div>
);

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function PortfolioPage() {
    const [daysFilter, setDaysFilter] = useState<number | null>(7);
    const [marketFilter, setMarketFilter] = useState<string>('ALL');

    const apiUrl = `/api/mlb/portfolio?${daysFilter ? `days=${daysFilter}&` : ''}market=${marketFilter}`;

    const { data, error, isLoading } = useSWR(apiUrl, fetcher, {
        refreshInterval: 15000
    });

    const {
        totalBets = 0, wins = 0, losses = 0, pushes = 0, totalPnl = 0, currentBankroll = 1000, roi = 0, peakBankroll = 1000, maxDrawdown = 0, winRate = 0, weeklyCurve = [], recentBets = []
    } = data || {};

    return (
        <div style={{ background: '#0a0a15', minHeight: '100vh', fontFamily: 'var(--font-inter), sans-serif', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box' }}>
            <SEOHead 
                title="Portfolio Simulator | MLB Analytics" 
                description="MLB Analytics Portfolio Simulator and virtual bankroll tracking."
                noIndex={true}
            />
            
            <UniversalHeader pageDepth={2} />
            <MlbSubNav />
            
            <div className="edge-to-edge-container" style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 16px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }}>
                            Portfolio <span style={{ color: '#00D4FF' }}>Simulator</span>
                        </h1>
                        <p style={{ margin: '4px 0 0', color: '#94A3B8', fontSize: '15px' }}>
                            Virtual bankroll — $1,000 starting · Kelly-sized from {totalBets.toLocaleString()} backtested markets
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <Link href="/hub/MLB-ANALYTICS/backtest" passHref>
                            <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 16px', background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)', borderRadius: '6px', color: '#00D4FF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
                                Backtest <ArrowRight size={16} />
                            </button>
                        </Link>
                        <Link href="/hub/MLB-ANALYTICS/model-intel" passHref>
                            <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 16px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', color: '#E2E8F0', fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
                                Model <ArrowRight size={16} />
                            </button>
                        </Link>
                    </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', alignItems: 'center', justifyContent: 'space-between', background: '#131420', padding: '16px', borderRadius: '12px', border: '1px solid #2a3a4a' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 600, marginRight: '8px' }}>TIMEFRAME:</span>
                        {[7, 14, 30].map(d => (
                            <button
                                key={d}
                                onClick={() => setDaysFilter(d)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: daysFilter === d ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                                    color: daysFilter === d ? '#00D4FF' : '#64748B',
                                    border: daysFilter === d ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid transparent',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {d} DAYS
                            </button>
                        ))}
                        <button
                            onClick={() => setDaysFilter(null)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: daysFilter === null ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                                color: daysFilter === null ? '#00D4FF' : '#64748B',
                                border: daysFilter === null ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid transparent',
                                transition: 'all 0.2s'
                            }}
                        >
                            SEASON
                        </button>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 600, marginRight: '8px' }}>MARKET:</span>
                        {['ALL', 'Moneyline', 'Run Line', 'Totals'].map(m => (
                            <button
                                key={m}
                                onClick={() => setMarketFilter(m)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: marketFilter === m ? 'rgba(255, 0, 255, 0.1)' : 'transparent',
                                    color: marketFilter === m ? '#FF00FF' : '#64748B',
                                    border: marketFilter === m ? '1px solid rgba(255, 0, 255, 0.3)' : '1px solid transparent',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {m === 'ALL' ? 'ALL' : m === 'Moneyline' ? 'ML' : m === 'Run Line' ? 'RL' : 'TOT'}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
                    <div style={{ flex: '1 1 300px', background: '#131420', border: '1px solid rgba(0,212,255,0.2)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', boxShadow: 'inset 0 0 20px rgba(0,212,255,0.05)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#00D4FF', letterSpacing: '1px', marginBottom: '8px' }}>CURRENT BANKROLL</div>
                        <div style={{ fontSize: '48px', fontWeight: 800, color: '#FFFFFF', lineHeight: 1 }}>
                            {isLoading ? '--' : formatCurrency(currentBankroll)}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#00D4FF', marginTop: '8px' }}>
                            {isLoading ? '--' : formatCurrency(totalPnl, true)} from start
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', fontWeight: 500 }}>
                            Started at $1,000.00
                        </div>
                    </div>

                    <div style={{ flex: '2 1 400px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                        <MetricBox title="TOTAL BETS" value={totalBets} sub={`${wins}W - ${losses}L - ${pushes}P`} isLoading={isLoading} />
                        <MetricBox title="TOTAL P&L" value={formatCurrency(totalPnl, true)} valueColor={totalPnl > 0 ? '#00D4FF' : totalPnl < 0 ? '#FF0055' : '#FFFFFF'} isLoading={isLoading} />
                        <MetricBox title="ROI" value={`${(roi || 0) > 0 ? '+' : ''}${(roi || 0).toFixed(2)}%`} valueColor={(roi || 0) > 0 ? '#00D4FF' : (roi || 0) < 0 ? '#FF0055' : '#FFFFFF'} isLoading={isLoading} />
                        <MetricBox title="MAX DRAWDOWN" value={`${(maxDrawdown || 0).toFixed(2)}%`} valueColor={(maxDrawdown || 0) > 0 ? '#FF0055' : '#FFFFFF'} isLoading={isLoading} />
                        <MetricBox title="PEAK BANKROLL" value={formatCurrency(peakBankroll)} valueColor="#00D4FF" isLoading={isLoading} />
                        <MetricBox title="WIN RATE" value={`${(winRate || 0).toFixed(1)}%`} valueColor="#FFFFFF" isLoading={isLoading} />
                    </div>
                </div>

                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#F8FAFC', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '4px', height: '18px', background: '#00D4FF', borderRadius: '2px', boxShadow: '0 0 8px rgba(0, 212, 255, 0.6)' }} />
                    Equity Curve
                </h2>
                <div style={{ background: '#0d1117', border: '1px solid #2a3a4a', borderRadius: '12px', padding: '24px', marginBottom: '32px', height: '350px', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }}>
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
                                    const d = new Date(val);
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

                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#F8FAFC', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '4px', height: '18px', background: '#FF00FF', borderRadius: '2px', boxShadow: '0 0 8px rgba(255, 0, 255, 0.6)' }} />
                    Recent Simulated Bets <span style={{ color: '#94A3B8', fontWeight: 400 }}>(last 20)</span>
                </h2>
                
                <div style={{ width: '100%' }}>
                    {isLoading ? (
                        <div style={{ background: '#0d1117', border: '1px solid #2a3a4a', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#94A3B8', width: '100%' }}>Loading simulator data...</div>
                    ) : (
                        <RecentBetsTable bets={recentBets} />
                    )}
                </div>
            </div>
            <BottomNavBar />
        </div>
    );
}
