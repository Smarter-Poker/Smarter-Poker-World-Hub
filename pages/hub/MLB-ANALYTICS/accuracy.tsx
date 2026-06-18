import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import SEOHead from '../../../src/components/seo/SEOHead';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export async function getServerSideProps() {
    try {
        const mlbDb = getMlbSupabase();
        
        const { data: summaryData, error: sumErr } = await mlbDb
            .from('v_backtest_summary')
            .select('*')
            .order('date', { ascending: false });
            
        if (sumErr) throw sumErr;
        
        let totalN = 0;
        let sumBrier = 0;
        let brierCount = 0;
        let sumClv = 0;
        let clvCount = 0;
        
        // For accurate ROI, we sum the total profit and divide by total bets placed
        let totalProfit = 0;
        let totalBets = 0;

        const tableData: any[] = [];

        (summaryData || []).forEach(row => {
            if (!row.n) return;
            totalN += row.n;
            
            if (row.brier !== null) {
                sumBrier += row.brier;
                brierCount++;
            }
            if (row.avg_clv !== null) {
                sumClv += row.avg_clv;
                clvCount++;
            }
            if (row.sum_unit_profit !== null && row.bet_count !== null) {
                totalProfit += row.sum_unit_profit;
                totalBets += row.bet_count;
            }
            tableData.push(row);
        });

        const avgClv = clvCount > 0 ? (sumClv / clvCount).toFixed(2) : '0.00';
        const avgRoi = totalBets > 0 ? ((totalProfit / totalBets) * 100).toFixed(1) : '0.0';
        const avgBrier = brierCount > 0 ? (sumBrier / brierCount).toFixed(3) : '0.000';

        return {
            props: {
                tableData,
                kpi: {
                    n: totalN,
                    clv: avgClv,
                    roi: avgRoi,
                    brier: avgBrier
                }
            }
        };
    } catch (err) {
        console.error('Error fetching backtest summary:', err);
        return { props: { tableData: [], kpi: { n: 0, clv: '0.00', roi: '0.0', brier: '0.000' } } };
    }
}

export default function AccuracyPage({ tableData = [], kpi }) {
    const [filter, setFilter] = useState('All');

    // Filter table
    const filteredTable = tableData.filter((row: any) => {
        if (filter === 'All') return true;
        const type = row.market?.toLowerCase() || '';
        if (filter === 'Moneyline' && (type === 'h2h' || type === 'f5_moneyline')) return true;
        if (filter === 'Totals' && (type === 'total' || type === 'team_total')) return true;
        if (filter === 'Run Line' && type === 'run_line') return true;
        if (filter === 'Props' && !['h2h', 'f5_moneyline', 'total', 'team_total', 'run_line'].includes(type)) return true;
        return false;
    });

    const isGatePassed = kpi.n >= 300 && parseFloat(kpi.roi) > -3.0 && parseFloat(kpi.brier) < 0.23;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
           <SEOHead 
               title="Model Performance | MLB Analytics" 
               description="MLB Analytics Model Performance and backtest results. Track CLV, Brier Scores, and ROI for predictive models." 
               noIndex={true}
           />
           <UniversalHeader pageDepth={2} />

           <div className="p-4 max-w-4xl mx-auto w-full box-border">
                <div className="mb-6">
                    <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-1 text-blue-600 text-[13px] font-bold tracking-wide mb-3 hover:text-blue-700 transition-colors uppercase">
                        <ArrowLeft size={16} /> Dashboard
                    </Link>
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                        <div>
                            <h1 className="m-0 mb-1 text-2xl md:text-[28px] font-extrabold text-slate-900">Model Performance</h1>
                            <p className="m-0 text-[13px] text-slate-500">CLV-first scoring. Populated nightly once games settle.</p>
                        </div>
                        <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                            {['All', 'Moneyline', 'Totals', 'Run Line', 'Props'].map(f => (
                                <button 
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    aria-label={`Filter by ${f}`}
                                    className={`px-3 py-1.5 rounded-md text-[13px] font-semibold transition-all ${
                                        filter === f 
                                            ? 'bg-white text-blue-600 shadow-sm' 
                                            : 'bg-transparent text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 md:p-5 mb-6 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <h2 className="m-0 text-base font-extrabold">Lock-In Gate</h2>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider ${
                                isGatePassed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                                {isGatePassed ? 'PASSED' : 'EVALUATING'}
                            </span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-400 tracking-wide hidden sm:block">
                            REQUIRED BEFORE REAL-MONEY PLAY
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {/* Sample Size */}
                        <div className={`bg-slate-50 rounded-lg p-3 md:p-4 border ${kpi.n >= 300 ? 'border-emerald-200' : 'border-slate-200'}`}>
                            <div className="text-[11px] text-slate-500 mb-2 font-semibold">Sample Size (n≥300)</div>
                            <div className={`text-2xl font-extrabold ${kpi.n >= 300 ? 'text-emerald-500' : 'text-slate-900'}`}>{kpi.n}</div>
                        </div>
                        {/* Avg CLV */}
                        <div className={`bg-slate-50 rounded-lg p-3 md:p-4 border ${parseFloat(kpi.clv) > 0 ? 'border-emerald-200' : 'border-slate-200'}`}>
                            <div className="text-[11px] text-slate-500 mb-2 font-semibold">Avg CLV (&gt;0 pts)</div>
                            <div className={`text-2xl font-extrabold ${parseFloat(kpi.clv) > 0 ? 'text-emerald-500' : 'text-slate-900'}`}>{kpi.clv}</div>
                        </div>
                        {/* Expected ROI */}
                        <div className={`bg-slate-50 rounded-lg p-3 md:p-4 border ${parseFloat(kpi.roi) > -3 ? 'border-emerald-200' : 'border-slate-200'}`}>
                            <div className="text-[11px] text-slate-500 mb-2 font-semibold">Expected ROI (&gt;-3%)</div>
                            <div className={`text-2xl font-extrabold ${parseFloat(kpi.roi) > -3 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {parseFloat(kpi.roi) > 0 ? '+' : ''}{kpi.roi}%
                            </div>
                        </div>
                        {/* Brier Score */}
                        <div className={`bg-slate-50 rounded-lg p-3 md:p-4 border ${parseFloat(kpi.brier) < 0.23 ? 'border-emerald-200' : 'border-slate-200'}`}>
                            <div className="text-[11px] text-slate-500 mb-2 font-semibold">Brier Score (&lt;0.23)</div>
                            <div className={`text-2xl font-extrabold ${parseFloat(kpi.brier) < 0.23 ? 'text-emerald-500' : 'text-red-500'}`}>{kpi.brier}</div>
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[13px] whitespace-nowrap">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                                    <th className="px-4 py-3 font-semibold">Date</th>
                                    <th className="px-4 py-3 font-semibold">Market</th>
                                    <th className="px-4 py-3 font-semibold">n</th>
                                    <th className="px-4 py-3 font-semibold">Brier</th>
                                    <th className="px-4 py-3 font-semibold">Avg CLV</th>
                                    <th className="px-4 py-3 font-semibold">ROI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTable.map((row, i) => (
                                    <tr key={`${row.date}-${row.market}-${i}`} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-semibold text-slate-700">{row.date}</td>
                                        <td className="px-4 py-3">
                                            <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px] text-slate-600 font-medium">
                                                {row.market}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">{row.n}</td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {row.brier !== null ? row.brier.toFixed(3) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {row.avg_clv !== null ? row.avg_clv.toFixed(2) : '—'}
                                        </td>
                                        <td className={`px-4 py-3 font-semibold ${row.roi > 0 ? 'text-emerald-500' : (row.roi < 0 ? 'text-red-500' : 'text-slate-900')}`}>
                                            {row.roi !== null ? `${row.roi > 0 ? '+' : ''}${row.roi.toFixed(1)}%` : '—'}
                                        </td>
                                    </tr>
                                ))}
                                {filteredTable.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                                            No data available for the selected filter.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

           </div>
           <BottomNavBar />
        </div>
    );
}
