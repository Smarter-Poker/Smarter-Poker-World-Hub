import SEOHead from '../../../src/components/seo/SEOHead';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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

export async function getServerSideProps({ res }) {
    try {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        const mlbDb = getMlbSupabase();
        const stats = await fetchPortfolioStats(mlbDb);

        return {
            props: {
                fallbackData: stats
            }
        };
    } catch (err) {
        console.error('Error fetching sim_bets:', err);
        return { 
            props: { 
                fallbackData: {
                    totalBets: 0, wins: 0, losses: 0, pushes: 0, totalPnl: 0, currentBankroll: 1000, 
                    roi: 0, peakBankroll: 1000, maxDrawdown: 0, winRate: 0, weeklyCurve: [], recentBets: [] 
                }
            } 
        };
    }
}

interface MetricBoxProps {
    title: string;
    value: string | number;
    sub?: string;
    valueColor?: string;
}

const MetricBox = ({ title, value, sub, valueColor = '#0F172A' }: MetricBoxProps) => (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', letterSpacing: '1px', marginBottom: '8px' }}>{title}</div>
        <div style={{ fontSize: '24px', fontWeight: 800, color: valueColor }}>{value}</div>
        {sub && <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>{sub}</div>}
    </div>
);

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function PortfolioPage({ fallbackData }: { fallbackData: PortfolioPageProps }) {
    const { data } = useSWR('/api/mlb/portfolio', fetcher, {
        fallbackData,
        refreshInterval: 15000 // Poll every 15 seconds
    });

    const {
        totalBets, wins, losses, pushes, totalPnl, currentBankroll, roi, peakBankroll, maxDrawdown, winRate, weeklyCurve, recentBets
    } = data || fallbackData;

    return (
        <div style={{ background: '#0a0a15', minHeight: '100vh', fontFamily: 'var(--font-inter), sans-serif', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box' }}>
            <SEOHead 
                title="Portfolio Simulator | MLB Analytics" 
                description="MLB Analytics Portfolio Simulator and virtual bankroll tracking."
                noIndex={true}
            />
            
            <UniversalHeader pageDepth={2} />
            <MlbSubNav />
            
            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#F8FAFC' }}>
                            Portfolio <span style={{ color: '#00D4FF' }}>Simulator</span>
                        </h1>
                        <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '14px' }}>
                            Virtual bankroll — $1,000 starting · Kelly-sized from {totalBets.toLocaleString()} backtested markets
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Link href="/hub/MLB-ANALYTICS/backtest" passHref>
                            <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 16px', background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)', borderRadius: '6px', color: '#00D4FF', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                Backtest <ArrowRight size={16} />
                            </button>
                        </Link>
                        <Link href="/hub/MLB-ANALYTICS/model-intel" passHref>
                            <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 16px', background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)', borderRadius: '6px', color: '#00D4FF', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                Model <ArrowRight size={16} />
                            </button>
                        </Link>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div style={{ background: '#fff', border: '1px solid #10B981', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.1)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', letterSpacing: '1px', marginBottom: '8px' }}>CURRENT BANKROLL</div>
                        <div style={{ fontSize: '48px', fontWeight: 800, color: '#00D4FF', lineHeight: 1 }}>
                            {formatCurrency(currentBankroll)}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#00D4FF', marginTop: '8px' }}>
                            {formatCurrency(totalPnl, true)} from start
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                            Started at $1,000.00
                        </div>
                    </div>

                    <div className="col-span-1 md:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <MetricBox title="TOTAL BETS" value={totalBets} sub={`${wins}W - ${losses}L - ${pushes}P`} />
                        <MetricBox title="TOTAL P&L" value={formatCurrency(totalPnl, true)} valueColor={totalPnl > 0 ? '#00D4FF' : totalPnl < 0 ? '#FF0055' : '#F8FAFC'} />
                        <MetricBox title="ROI" value={`${(roi || 0) > 0 ? '+' : ''}${(roi || 0).toFixed(2)}%`} valueColor={(roi || 0) > 0 ? '#10B981' : (roi || 0) < 0 ? '#EF4444' : '#0F172A'} />
                        <MetricBox title="MAX DRAWDOWN" value={`${(maxDrawdown || 0).toFixed(2)}%`} valueColor={(maxDrawdown || 0) > 0 ? '#EF4444' : '#0F172A'} />
                        <MetricBox title="PEAK BANKROLL" value={formatCurrency(peakBankroll)} valueColor="#00D4FF" />
                        <MetricBox title="WIN RATE" value={`${(winRate || 0).toFixed(1)}%`} />
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
                    Recent Simulated Bets <span style={{ color: '#94A3B8', fontWeight: 400 }}>(last 20)</span></h2>
                <div style={{ background: '#0d1117', border: '1px solid #2a3a4a', borderRadius: '12px', overflow: 'hidden', paddingBottom: '20px', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #2a3a4a', color: '#8b9bb4', backgroundColor: '#1a2332' }}>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Date</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Market</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Selection</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Edge</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Stake</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Result</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>P&L</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Bankroll</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentBets.length > 0 ? recentBets.map((bet, i) => {
                                const dateObj = bet.as_of_ts ? new Date(bet.as_of_ts) : new Date();
                                const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
                                
                                const pnl = bet.pnl || 0;
                                const isWin = pnl > 0 || bet.result === 'WIN';
                                const isLoss = pnl < 0 || bet.result === 'LOSS';
                                
                                return (
                                    <tr key={bet.id || i} style={{ borderBottom: i < recentBets.length - 1 ? '1px solid #2a3a4a' : 'none' }}>
                                        <td style={{ padding: '12px 16px', color: '#64748B' }}>
                                            {dateStr}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '4px 8px', borderRadius: '4px', color: '#475569', fontSize: '11px', fontWeight: 600 }}>
                                                {bet.market || 'Moneyline'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: '#F8FAFC' }}>{bet.selection || '-'}</td>
                                        <td style={{ padding: '12px 16px', color: '#3B82F6' }}>+{(bet.edge_pts || 0).toFixed(2)}</td>
                                        <td style={{ padding: '12px 16px', color: '#475569' }}>${(bet.stake || 0).toFixed(2)}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ 
                                                background: isWin ? 'rgba(0, 212, 255, 0.1)' : (isLoss ? 'rgba(255, 0, 85, 0.1)' : 'rgba(255, 255, 255, 0.05)'), 
                                                color: isWin ? '#00D4FF' : (isLoss ? '#FF0055' : '#8b9bb4'),
                                                padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px'
                                            }}>
                                                {bet.result || (isWin ? 'WIN' : (isLoss ? 'LOSS' : 'PUSH'))}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: pnl > 0 ? '#00D4FF' : (pnl < 0 ? '#FF0055' : '#8b9bb4') }}>
                                            {formatCurrency(pnl, true)}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#64748B', textAlign: 'right' }}>
                                            {formatCurrency(bet.bankroll_after || 0)}
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr><td colSpan={8} style={{ padding: '16px', textAlign: 'center', color: '#94A3B8' }}>No data available</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <BottomNavBar />
        </div>
    );
}
