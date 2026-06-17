import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import Link from 'next/link';

export async function getServerSideProps() {
    try {
        const mlbDb = getMlbSupabase();

        // Fetch calibration history (last 60 days)
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const since = sixtyDaysAgo.toISOString().slice(0, 10);

        const { data: calRows, error: calErr } = await mlbDb
            .from('pred_calibration')
            .select('as_of, market, n, brier, log_loss, roi')
            .gte('as_of', since)
            .order('as_of', { ascending: false })
            .limit(300);

        if (calErr) throw calErr;

        // Summary stats by market
        const byMarket = {};
        for (const row of (calRows || [])) {
            if (!byMarket[row.market]) byMarket[row.market] = { briers: [], rois: [], ns: [], rows: [] };
            byMarket[row.market].briers.push(row.brier);
            byMarket[row.market].rois.push(row.roi);
            byMarket[row.market].ns.push(row.n);
            byMarket[row.market].rows.push(row);
        }

        const summaries = Object.entries(byMarket).map(([market, d]) => {
            const avgBrier = d.briers.reduce((a, b) => a + b, 0) / d.briers.length;
            const avgRoi = d.rois.reduce((a, b) => a + b, 0) / d.rois.length;
            const totalN = d.ns.reduce((a, b) => a + b, 0);
            return { market, avgBrier, avgRoi, totalN, days: d.briers.length };
        }).sort((a, b) => a.avgBrier - b.avgBrier);

        // Latest brier by market (most recent day)
        const latestDate = (calRows || [])[0]?.as_of || null;
        const latestRows = (calRows || []).filter(r => r.as_of === latestDate);

        // Recent timeline (h2h only for chart)
        const h2hHistory = ((calRows || [])
            .filter(r => r.market === 'h2h')
            .slice(0, 30)
            .reverse()
        );

        return {
            props: {
                summaries,
                latestDate,
                latestRows,
                h2hHistory,
                totalDays: calRows?.length > 0 ? [...new Set(calRows.map(r => r.as_of))].length : 0,
                error: null
            }
        };
    } catch (err) {
        return {
            props: {
                summaries: [],
                latestDate: null,
                latestRows: [],
                h2hHistory: [],
                totalDays: 0,
                error: err.message
            }
        };
    }
}

function BrierMeter({ value }) {
    // Brier score: 0 = perfect, 0.25 = no skill (coin flip). Lower is better.
    // Market baseline for MLB h2h is roughly 0.23-0.24
    const pct = Math.min(1, value / 0.25); // how much of the "worst" we are
    const color = value < 0.22 ? '#00ff88' : value < 0.24 ? '#fbbf24' : '#ff6b6b';
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                    {value.toFixed(4)}
                </span>
                <span style={{ color: '#9ca3af', fontSize: 12, alignSelf: 'flex-end', paddingBottom: 4 }}>
                    baseline: 0.25
                </span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
            </div>
        </div>
    );
}

function MiniChart({ data }) {
    if (!data || data.length < 2) return (
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
            Accumulating data...
        </div>
    );
    const vals = data.map(d => d.brier);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 0.01;
    const W = 400, H = 80;
    const pts = data.map((d, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = H - ((d.brier - min) / range) * (H - 8) - 4;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
            <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#00ff88" stopOpacity="0.9" />
                </linearGradient>
            </defs>
            <polyline points={pts} fill="none" stroke="url(#lineGrad)" strokeWidth="2" strokeLinejoin="round" />
        </svg>
    );
}

const MKT_LABELS = {
    h2h: 'Moneyline',
    total: 'Totals (O/U)',
    run_line: 'Run Line',
    f5_moneyline: 'First 5',
    nrfi: 'NRFI',
    batter_home_runs: 'HR Props',
    batter_total_bases: 'Bases Props',
    pitcher_strikeouts: 'Pitcher K Props',
};

export default function MlbPerformance({ summaries, latestDate, latestRows, h2hHistory, totalDays, error }) {
    const h2hSummary = summaries.find(s => s.market === 'h2h');
    const overallBrier = h2hSummary?.avgBrier;
    const overallRoi = h2hSummary?.avgRoi;

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingBottom: 100 }}>
            <SEOHead title="Model Performance | MLB Engine" />
            <UniversalHeader title="Performance" />

            <main style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto', paddingTop: 80 }}>
                <Link href="/hub/mlb-analytics" style={{ color: '#00d4ff', textDecoration: 'none', display: 'inline-block', marginBottom: 24, fontFamily: 'Orbitron, sans-serif', fontSize: 13 }}>
                    ← Back to Slate
                </Link>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
                    <h1 style={{ fontFamily: 'Orbitron, sans-serif', color: '#00d4ff', fontSize: 22, margin: 0 }}>
                        Calibration & Model Health
                    </h1>
                    {latestDate && (
                        <span style={{ color: '#6b7280', fontSize: 13 }}>
                            Latest: {latestDate} · {totalDays} days tracked
                        </span>
                    )}
                </div>

                {error && (
                    <div style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid #ef4444', padding: 16, borderRadius: 10, color: '#fca5a5', marginBottom: 24, fontSize: 14 }}>
                        ⚠ DB Error: {error}
                    </div>
                )}

                {summaries.length === 0 && !error ? (
                    <div style={{ background: 'rgba(255,255,255,0.04)', padding: 60, borderRadius: 16, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>📈</div>
                        <div>No calibration data yet. Run the daily grader (<code style={{ color: '#00d4ff' }}>evaluate.py</code>) after games complete.</div>
                        <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>Data populates nightly after final scores are posted.</div>
                    </div>
                ) : (
                    <>
                        {/* Hero KPI row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Avg Brier (h2h)</div>
                                {overallBrier != null ? <BrierMeter value={overallBrier} /> : <span style={{ color: '#6b7280' }}>—</span>}
                                <div style={{ color: '#6b7280', fontSize: 11, marginTop: 8 }}>Lower = better · coin flip = 0.25</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Paper ROI (h2h)</div>
                                <div style={{ fontSize: 28, fontWeight: 700, color: overallRoi > 0 ? '#00ff88' : overallRoi < 0 ? '#ff6b6b' : '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
                                    {overallRoi != null ? `${overallRoi > 0 ? '+' : ''}${overallRoi.toFixed(2)}%` : '—'}
                                </div>
                                <div style={{ color: '#6b7280', fontSize: 11, marginTop: 8 }}>Paper bets only · not real money</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Days Graded</div>
                                <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{totalDays}</div>
                                <div style={{ color: '#6b7280', fontSize: 11, marginTop: 8 }}>300 days needed to unlock live bets</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Live Bet Gate</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: totalDays >= 300 && overallBrier != null && overallBrier < 0.23 ? '#00ff88' : '#ef4444' }}>
                                    {totalDays >= 300 && overallBrier != null && overallBrier < 0.23 ? '✓ UNLOCKED' : '🔒 LOCKED'}
                                </div>
                                <div style={{ color: '#6b7280', fontSize: 11, marginTop: 8 }}>Need: 300 days + Brier &lt; 0.23</div>
                            </div>
                        </div>

                        {/* Brier trend sparkline */}
                        {h2hHistory.length > 0 && (
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '18px 20px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
                                <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12 }}>Moneyline Brier Score — 30 Day Trend (lower = better)</div>
                                <MiniChart data={h2hHistory} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: 11, marginTop: 4 }}>
                                    <span>{h2hHistory[0]?.as_of}</span>
                                    <span>{h2hHistory[h2hHistory.length - 1]?.as_of}</span>
                                </div>
                            </div>
                        )}

                        {/* By-market table */}
                        <h2 style={{ fontFamily: 'Orbitron, sans-serif', color: '#fff', fontSize: 15, margin: '0 0 14px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            By Market
                        </h2>
                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 28 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                                        {['Market', 'Avg Brier ↑', 'Avg ROI', 'Total Games', 'Days'].map(h => (
                                            <th key={h} style={{ padding: '11px 16px', color: '#6b7280', fontWeight: 500, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 12 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {summaries.map((s, i) => {
                                        const roiColor = s.avgRoi > 0 ? '#00ff88' : s.avgRoi < -5 ? '#ff6b6b' : '#d4d4d4';
                                        const brierColor = s.avgBrier < 0.22 ? '#00ff88' : s.avgBrier < 0.24 ? '#fbbf24' : '#ff6b6b';
                                        return (
                                            <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                                <td style={{ padding: '10px 16px', color: '#d4d4d4', fontWeight: 500 }}>{MKT_LABELS[s.market] || s.market}</td>
                                                <td style={{ padding: '10px 16px', color: brierColor, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{s.avgBrier.toFixed(4)}</td>
                                                <td style={{ padding: '10px 16px', color: roiColor, fontVariantNumeric: 'tabular-nums' }}>{s.avgRoi > 0 ? '+' : ''}{s.avgRoi.toFixed(2)}%</td>
                                                <td style={{ padding: '10px 16px', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{s.totalN.toLocaleString()}</td>
                                                <td style={{ padding: '10px 16px', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{s.days}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Latest day snapshot */}
                        {latestRows.length > 0 && (
                            <>
                                <h2 style={{ fontFamily: 'Orbitron, sans-serif', color: '#fff', fontSize: 15, margin: '0 0 14px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Latest Run — {latestDate}
                                </h2>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                                    {latestRows.map((r, i) => (
                                        <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.07)' }}>
                                            <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>{MKT_LABELS[r.market] || r.market}</div>
                                            <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                <span style={{ fontSize: 18, fontWeight: 700, color: r.brier < 0.23 ? '#00ff88' : '#fbbf24' }}>{r.brier?.toFixed(4)}</span>
                                                <span style={{ color: '#6b7280', fontSize: 11, marginLeft: 6 }}>n={r.n}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}
            </main>
            <BottomNavBar />
        </div>
    );
}
