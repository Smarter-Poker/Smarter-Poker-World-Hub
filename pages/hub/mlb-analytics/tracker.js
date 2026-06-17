import { useState } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import Link from 'next/link';

export async function getServerSideProps() {
    try {
        const mlbDb = getMlbSupabase();

        // Fetch all graded BET-recommended predictions with results
        const { data: bets, error: betErr } = await mlbDb
            .from('pred_market_output')
            .select('game_pk, official_date, market, selection, blended_prob, market_novig_prob, best_price, stake_units, result, as_of_ts')
            .eq('rec', true)
            .not('result', 'is', null)
            .order('official_date', { ascending: false })
            .limit(500);

        if (betErr) throw betErr;

        // Fetch graded prop bets
        const { data: propBets, error: propErr } = await mlbDb
            .from('pred_props')
            .select('game_pk, player_id, prop, line, prob_over, best_price, pnl, result, as_of_ts')
            .eq('rec', true)
            .not('result', 'is', null)
            .order('as_of_ts', { ascending: false })
            .limit(200);

        // Combine for CLV tracking
        const allBets = [
            ...(bets || []).map(b => ({
                date: b.official_date || b.as_of_ts?.slice(0, 10),
                label: `${b.market?.toUpperCase()} – ${b.selection}`,
                model_prob: b.blended_prob,
                market_prob: b.market_novig_prob,
                price: b.best_price,
                stake: b.stake_units || 1,
                result: b.result,
                type: 'market',
                pnl: b.result === 'WIN' ? (b.best_price > 0 ? (b.best_price / 100) : (-100 / b.best_price)) * (b.stake_units || 1) : b.result === 'LOSS' ? -(b.stake_units || 1) : 0,
            })),
            ...(propBets || []).map(p => ({
                date: p.as_of_ts?.slice(0, 10),
                label: `${p.prop} O ${p.line}`,
                model_prob: p.prob_over,
                market_prob: null,
                price: p.best_price,
                stake: 1,
                result: p.result,
                type: 'prop',
                pnl: p.pnl || 0,
            }))
        ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // Summary stats
        const wins = allBets.filter(b => b.result === 'WIN').length;
        const losses = allBets.filter(b => b.result === 'LOSS').length;
        const voids = allBets.filter(b => b.result === 'VOID').length;
        const totalBets = wins + losses; // exclude voids from winrate
        const winRate = totalBets > 0 ? (wins / totalBets * 100) : 0;
        const totalPnl = allBets.reduce((s, b) => s + (b.pnl || 0), 0);
        const totalStake = allBets.reduce((s, b) => s + (b.result !== 'VOID' ? (b.stake || 1) : 0), 0);
        const roi = totalStake > 0 ? (totalPnl / totalStake * 100) : 0;

        // CLV: avg (model_prob - market_prob) for entries where both exist
        const clvSamples = allBets.filter(b => b.model_prob != null && b.market_prob != null);
        const avgClv = clvSamples.length > 0
            ? clvSamples.reduce((s, b) => s + (b.model_prob - b.market_prob), 0) / clvSamples.length * 100
            : null;

        // Daily PnL series for chart
        const dailyMap = {};
        for (const b of allBets) {
            if (!b.date) continue;
            dailyMap[b.date] = (dailyMap[b.date] || 0) + (b.pnl || 0);
        }
        const dailySeries = Object.entries(dailyMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, pnl]) => ({ date, pnl }));

        // Running cumulative
        let cum = 0;
        const cumSeries = dailySeries.map(({ date, pnl }) => {
            cum += pnl;
            return { date, cum };
        });

        return {
            props: {
                bets: allBets,
                summary: { wins, losses, voids, winRate, totalPnl, roi, avgClv, totalBets: allBets.length },
                cumSeries,
                error: null,
            }
        };
    } catch (err) {
        return {
            props: {
                bets: [],
                summary: { wins: 0, losses: 0, voids: 0, winRate: 0, totalPnl: 0, roi: 0, avgClv: null, totalBets: 0 },
                cumSeries: [],
                error: err.message,
            }
        };
    }
}

function CumChart({ data }) {
    if (!data || data.length < 2) return (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
            📈 Chart will appear after first graded bets
        </div>
    );
    const vals = data.map(d => d.cum);
    const min = Math.min(0, ...vals);
    const max = Math.max(0, ...vals);
    const range = max - min || 1;
    const W = 600, H = 100;
    const yZero = H - ((0 - min) / range) * H;

    const pts = data.map((d, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = H - ((d.cum - min) / range) * H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const lastColor = vals[vals.length - 1] >= 0 ? '#00ff88' : '#ef4444';

    return (
        <svg viewBox={`0 0 ${W} ${H + 10}`} style={{ width: '100%', height: 110, display: 'block' }}>
            <defs>
                <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lastColor} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={lastColor} stopOpacity="0" />
                </linearGradient>
            </defs>
            {/* Zero line */}
            <line x1="0" y1={yZero.toFixed(1)} x2={W} y2={yZero.toFixed(1)} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4,4" />
            {/* Fill */}
            <polygon
                points={`0,${H} ${pts} ${W},${H}`}
                fill="url(#cumGrad)"
            />
            {/* Line */}
            <polyline points={pts} fill="none" stroke={lastColor} strokeWidth="2" strokeLinejoin="round" />
        </svg>
    );
}

const RESULT_STYLE = {
    WIN: { color: '#00ff88', label: '✓ WIN' },
    LOSS: { color: '#ef4444', label: '✗ LOSS' },
    VOID: { color: '#6b7280', label: 'PUSH' },
};

export default function MlbTracker({ bets, summary, cumSeries, error }) {
    const [filterType, setFilterType] = useState('all');

    const displayed = filterType === 'all' ? bets : bets.filter(b => b.type === filterType);

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingBottom: 100 }}>
            <SEOHead title="Bet Tracker | MLB Engine" />
            <UniversalHeader title="Bet Tracker" />

            <main style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto', paddingTop: 80 }}>
                <Link href="/hub/mlb-analytics" style={{ color: '#00d4ff', textDecoration: 'none', display: 'inline-block', marginBottom: 24, fontFamily: 'Orbitron, sans-serif', fontSize: 13 }}>
                    ← Back to Slate
                </Link>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
                    <h1 style={{ fontFamily: 'Orbitron, sans-serif', color: '#00d4ff', fontSize: 22, margin: 0 }}>
                        Paper Bet Tracker — CLV Log
                    </h1>
                    <span style={{ color: '#6b7280', fontSize: 12 }}>Paper mode · No real money</span>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', padding: 16, borderRadius: 10, color: '#fca5a5', marginBottom: 20, fontSize: 14 }}>
                        DB Error: {error}
                    </div>
                )}

                {/* KPI Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 14, marginBottom: 24 }}>
                    {[
                        { label: 'Total Bets', value: summary.totalBets.toLocaleString(), color: '#fff' },
                        { label: 'Win Rate', value: `${summary.winRate.toFixed(1)}%`, color: summary.winRate > 53 ? '#00ff88' : '#fbbf24' },
                        { label: 'Paper P/L', value: `${summary.totalPnl >= 0 ? '+' : ''}${summary.totalPnl.toFixed(2)}u`, color: summary.totalPnl >= 0 ? '#00ff88' : '#ef4444' },
                        { label: 'ROI', value: `${summary.roi >= 0 ? '+' : ''}${summary.roi.toFixed(2)}%`, color: summary.roi >= 0 ? '#00ff88' : '#ef4444' },
                        { label: 'Avg CLV', value: summary.avgClv != null ? `${summary.avgClv >= 0 ? '+' : ''}${summary.avgClv.toFixed(2)}%` : '—', color: summary.avgClv != null && summary.avgClv > 0 ? '#00ff88' : '#fbbf24' },
                        { label: 'W / L / P', value: `${summary.wins} / ${summary.losses} / ${summary.voids}`, color: '#9ca3af' },
                    ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{label}</div>
                            <div style={{ fontWeight: 700, fontSize: 20, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                        </div>
                    ))}
                </div>

                {/* Cumulative P/L Chart */}
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '18px 20px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
                    <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12 }}>Cumulative P/L (units)</div>
                    <CumChart data={cumSeries} />
                    {cumSeries.length > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: 11, marginTop: 4 }}>
                            <span>{cumSeries[0]?.date}</span>
                            <span>{cumSeries[cumSeries.length - 1]?.date}</span>
                        </div>
                    )}
                </div>

                {/* CLV note */}
                <div style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#9ca3af' }}>
                    <strong style={{ color: '#00d4ff' }}>Why CLV matters:</strong> Closing Line Value measures whether our model beats the closing market price — a positive CLV over 300+ bets proves genuine edge, regardless of short-term P/L variance.
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {['all', 'market', 'prop'].map(t => (
                        <button key={t} onClick={() => setFilterType(t)} style={{
                            background: filterType === t ? '#1877f2' : 'transparent',
                            border: '1px solid #1877f2',
                            color: '#fff',
                            padding: '6px 14px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 13,
                            textTransform: 'capitalize',
                        }}>
                            {t === 'all' ? 'All Bets' : t === 'market' ? 'Game Lines' : 'Props'}
                        </button>
                    ))}
                </div>

                {/* Bet Table */}
                {displayed.length === 0 ? (
                    <div style={{ background: 'rgba(255,255,255,0.04)', padding: 60, borderRadius: 12, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>🗂</div>
                        No graded bets yet. The system logs bets automatically after the grader runs nightly.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                                    {['Date', 'Bet', 'Model%', 'Mkt%', 'CLV', 'Price', 'Result', 'P/L'].map(h => (
                                        <th key={h} style={{ padding: '10px 14px', color: '#6b7280', fontWeight: 500, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', fontSize: 12 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {displayed.map((bet, i) => {
                                    const clv = (bet.model_prob != null && bet.market_prob != null)
                                        ? (bet.model_prob - bet.market_prob) * 100 : null;
                                    const rs = RESULT_STYLE[bet.result] || { color: '#9ca3af', label: bet.result };
                                    return (
                                        <tr key={i} style={{
                                            borderTop: '1px solid rgba(255,255,255,0.05)',
                                            background: bet.result === 'WIN' ? 'rgba(0,255,136,0.03)' : bet.result === 'LOSS' ? 'rgba(239,68,68,0.03)' : 'transparent',
                                        }}>
                                            <td style={{ padding: '9px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{bet.date}</td>
                                            <td style={{ padding: '9px 14px', color: '#d4d4d4', maxWidth: 200 }}>{bet.label}</td>
                                            <td style={{ padding: '9px 14px', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
                                                {bet.model_prob != null ? `${(bet.model_prob * 100).toFixed(1)}%` : '—'}
                                            </td>
                                            <td style={{ padding: '9px 14px', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
                                                {bet.market_prob != null ? `${(bet.market_prob * 100).toFixed(1)}%` : '—'}
                                            </td>
                                            <td style={{ padding: '9px 14px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: clv == null ? '#6b7280' : clv > 0 ? '#00ff88' : '#ef4444' }}>
                                                {clv != null ? `${clv >= 0 ? '+' : ''}${clv.toFixed(2)}%` : '—'}
                                            </td>
                                            <td style={{ padding: '9px 14px', color: '#9ca3af', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                                {bet.price != null ? (bet.price > 0 ? `+${bet.price}` : bet.price) : '—'}
                                            </td>
                                            <td style={{ padding: '9px 14px', fontWeight: 700, color: rs.color, whiteSpace: 'nowrap' }}>{rs.label}</td>
                                            <td style={{ padding: '9px 14px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: bet.pnl >= 0 ? '#00ff88' : '#ef4444', whiteSpace: 'nowrap' }}>
                                                {bet.pnl != null ? `${bet.pnl >= 0 ? '+' : ''}${bet.pnl.toFixed(2)}u` : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.25)', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            {displayed.length} bets shown
                        </div>
                    </div>
                )}
            </main>
            <BottomNavBar />
        </div>
    );
}
