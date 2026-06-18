import SEOHead from '../../../src/components/seo/SEOHead';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
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

export async function getServerSideProps() {
    try {
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
        <div style={{ background: '#F8FAFC', minHeight: '100vh', fontFamily: 'var(--font-inter), sans-serif', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box' }}>
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
                        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#0F172A' }}>
                            Portfolio <span style={{ color: '#10B981' }}>Simulator</span>
                        </h1>
                        <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '14px' }}>
                            Virtual bankroll — $1,000 starting · Kelly-sized from {totalBets.toLocaleString()} backtested markets
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Link href="/hub/MLB-ANALYTICS/backtest" passHref>
                            <button style={{ padding: '8px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '6px', color: '#3B82F6', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Backtest →</button>
                        </Link>
                        <Link href="/hub/MLB-ANALYTICS/model-intel" passHref>
                            <button style={{ padding: '8px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '6px', color: '#3B82F6', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Model →</button>
                        </Link>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '32px' }}>
                    <div style={{ background: '#fff', border: '1px solid #10B981', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.1)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', letterSpacing: '1px', marginBottom: '8px' }}>CURRENT BANKROLL</div>
                        <div style={{ fontSize: '48px', fontWeight: 800, color: '#10B981', lineHeight: 1 }}>
                            {formatCurrency(currentBankroll)}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#10B981', marginTop: '8px' }}>
                            {formatCurrency(totalPnl, true)} from start
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                            Started at $1,000.00
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                        <MetricBox title="TOTAL BETS" value={totalBets} sub={`${wins}W - ${losses}L - ${pushes}P`} />
                        <MetricBox title="TOTAL P&L" value={formatCurrency(totalPnl, true)} valueColor={totalPnl > 0 ? '#10B981' : totalPnl < 0 ? '#EF4444' : '#0F172A'} />
                        <MetricBox title="ROI" value={`${roi > 0 ? '+' : ''}${roi.toFixed(2)}%`} valueColor={roi > 0 ? '#10B981' : roi < 0 ? '#EF4444' : '#0F172A'} />
                        <MetricBox title="MAX DRAWDOWN" value={`${maxDrawdown.toFixed(2)}%`} valueColor={maxDrawdown > 0 ? '#EF4444' : '#0F172A'} />
                        <MetricBox title="PEAK BANKROLL" value={formatCurrency(peakBankroll)} valueColor="#10B981" />
                        <MetricBox title="WIN RATE" value={`${winRate.toFixed(1)}%`} />
                    </div>
                </div>

                <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' }}>Weekly Equity Curve</h2>
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', marginBottom: '32px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Week of</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Bets</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Weekly P&L</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Bankroll</th>
                            </tr>
                        </thead>
                        <tbody>
                            {weeklyCurve.length > 0 ? weeklyCurve.map((w, i) => (
                                <tr key={i} style={{ borderBottom: i < weeklyCurve.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                                    <td style={{ padding: '12px 16px', color: '#475569' }}>{w.weekOf}</td>
                                    <td style={{ padding: '12px 16px', color: '#475569' }}>{w.bets}</td>
                                    <td style={{ padding: '12px 16px', fontWeight: 600, color: w.pnl > 0 ? '#10B981' : (w.pnl < 0 ? '#EF4444' : '#64748B') }}>
                                        {formatCurrency(w.pnl, true)}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right', color: '#0F172A' }}>
                                        {formatCurrency(w.bankroll)}
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan={4} style={{ padding: '16px', textAlign: 'center', color: '#94A3B8' }}>No data available</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' }}>Recent Simulated Bets <span style={{ color: '#94A3B8', fontWeight: 400 }}>(last 20)</span></h2>
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', paddingBottom: '20px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
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
                                    <tr key={bet.id || i} style={{ borderBottom: i < recentBets.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                                        <td style={{ padding: '12px 16px', color: '#64748B' }}>
                                            {dateStr}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ background: '#F1F5F9', padding: '4px 8px', borderRadius: '4px', color: '#475569', fontSize: '11px', fontWeight: 600 }}>
                                                {bet.market || 'Moneyline'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: '#0F172A' }}>{bet.selection || '-'}</td>
                                        <td style={{ padding: '12px 16px', color: '#3B82F6' }}>+{(bet.edge_pts || 0).toFixed(2)}</td>
                                        <td style={{ padding: '12px 16px', color: '#475569' }}>${(bet.stake || 0).toFixed(2)}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ 
                                                background: isWin ? '#D1FAE5' : (isLoss ? '#FEE2E2' : '#F1F5F9'), 
                                                color: isWin ? '#10B981' : (isLoss ? '#EF4444' : '#64748B'),
                                                padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px'
                                            }}>
                                                {bet.result || (isWin ? 'WIN' : (isLoss ? 'LOSS' : 'PUSH'))}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: pnl > 0 ? '#10B981' : (pnl < 0 ? '#EF4444' : '#64748B') }}>
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
