import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import Link from 'next/link';

const PIPELINE_DEFINITIONS = [
    { key: 'ingest',   label: 'MLB Stats API',      icon: '⚾',  description: 'Schedules, lineups, box scores' },
    { key: 'compute',  label: 'Statcast / Savant',  icon: '📡',  description: 'Exit velocity, spin rate, OAA metrics' },
    { key: 'enrich',   label: 'FanGraphs',          icon: '📊',  description: 'FIP, xFIP, BABIP, wRC+' },
    { key: 'predict',  label: 'Prediction Engine',  icon: '🧠',  description: 'All markets + player props' },
    { key: 'push',     label: 'Odds API',           icon: '💰',  description: 'Market lines & CLV tracking' },
    { key: 'evaluate',       label: 'Daily Grader',       icon: '✅',  description: 'Grades results + calibration' },
    { key: 'optimize_weights', label: 'Weight Optimizer', icon: '⚙️', description: 'Nelder-Mead Brier minimization' },
];

function staleness(lastRunTs) {
    if (!lastRunTs) return { label: 'Never run', color: '#ef4444', ms: Infinity };
    const ms = Date.now() - new Date(lastRunTs).getTime();
    const hrs = ms / 3600000;
    if (hrs < 25)  return { label: `${Math.round(hrs)}h ago`, color: '#00ff88', ms };
    if (hrs < 50)  return { label: `${Math.round(hrs)}h ago`, color: '#fbbf24', ms };
    return { label: `${Math.round(hrs / 24)}d ago`, color: '#ef4444', ms };
}

export async function getServerSideProps() {
    const startTs = Date.now();
    try {
        const mlbDb = getMlbSupabase();

        // Fetch latest run per pipeline step from snapshots table
        const { data: runs, error } = await mlbDb
            .from('snapshots')
            .select('source, as_of_ts, status, row_count, notes')
            .order('as_of_ts', { ascending: false })
            .limit(200);

        if (error) throw error;

        // Keep only the most recent run per step
        const latestByStep = {};
        for (const r of (runs || [])) {
            if (!latestByStep[r.source]) latestByStep[r.source] = {
                step: r.source,
                run_ts: r.as_of_ts,
                status: r.status,
                rows_written: r.row_count,
                error_msg: r.notes
            };
        }

        // Row counts from key tables
        const [gamesRes, predsRes, propsRes, calibRes] = await Promise.all([
            mlbDb.from('fact_games').select('game_pk', { count: 'exact', head: true }),
            mlbDb.from('pred_market_output').select('game_pk', { count: 'exact', head: true }),
            mlbDb.from('pred_props').select('game_pk', { count: 'exact', head: true }),
            mlbDb.from('pred_calibration').select('as_of', { count: 'exact', head: true }),
        ]);

        const queryMs = Date.now() - startTs;

        return {
            props: {
                latestByStep,
                counts: {
                    games: gamesRes.count || 0,
                    preds: predsRes.count || 0,
                    props: propsRes.count || 0,
                    calibDays: calibRes.count || 0,
                },
                queryMs,
                error: null,
                fetchedAt: new Date().toISOString(),
            }
        };
    } catch (err) {
        return {
            props: {
                latestByStep: {},
                counts: { games: 0, preds: 0, props: 0, calibDays: 0 },
                queryMs: Date.now() - startTs,
                error: err.message,
                fetchedAt: new Date().toISOString(),
            }
        };
    }
}

function StatusDot({ color }) {
    return (
        <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: color, marginRight: 8,
            boxShadow: color === '#00ff88' ? `0 0 6px ${color}` : 'none'
        }} />
    );
}

export default function MlbStatus({ latestByStep, counts, queryMs, error, fetchedAt }) {
    const fetchTime = new Date(fetchedAt).toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
    });

    const dbOk = !error;

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingBottom: 100 }}>
            <SEOHead title="System Status | MLB Engine" />
            <UniversalHeader title="Engine Status" />

            <main style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', paddingTop: 80 }}>
                <Link href="/hub/mlb-analytics" style={{ color: '#00d4ff', textDecoration: 'none', display: 'inline-block', marginBottom: 24, fontFamily: 'Orbitron, sans-serif', fontSize: 13 }}>
                    ← Back to Slate
                </Link>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
                    <h1 style={{ fontFamily: 'Orbitron, sans-serif', color: '#00d4ff', fontSize: 22, margin: 0 }}>
                        Pipeline Health
                    </h1>
                    <span style={{ color: '#6b7280', fontSize: 12 }}>
                        As of {fetchTime} · {queryMs}ms
                    </span>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', padding: 16, borderRadius: 10, color: '#fca5a5', marginBottom: 20, fontSize: 14 }}>
                        ⚠ DB Connection Error: {error}
                        <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(252,165,165,0.7)' }}>
                            This usually means the Supabase project is paused. Visit the Supabase dashboard to restore it.
                        </div>
                    </div>
                )}

                {/* DB Connection Card */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px 18px', border: `1px solid ${dbOk ? 'rgba(0,255,136,0.2)' : 'rgba(239,68,68,0.3)'}` }}>
                        <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>DB Connection</div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: dbOk ? '#00ff88' : '#ef4444' }}>
                            <StatusDot color={dbOk ? '#00ff88' : '#ef4444'} />
                            {dbOk ? 'ONLINE' : 'OFFLINE'}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 11, marginTop: 6 }}>{queryMs}ms response</div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Games in DB</div>
                        <div style={{ fontWeight: 700, fontSize: 22, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                            {counts.games.toLocaleString()}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 11, marginTop: 6 }}>fact_games rows</div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Predictions</div>
                        <div style={{ fontWeight: 700, fontSize: 22, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                            {counts.preds.toLocaleString()}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 11, marginTop: 6 }}>market predictions</div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Prop Picks</div>
                        <div style={{ fontWeight: 700, fontSize: 22, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                            {counts.props.toLocaleString()}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 11, marginTop: 6 }}>player props graded</div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Calib. Days</div>
                        <div style={{ fontWeight: 700, fontSize: 22, color: counts.calibDays >= 300 ? '#00ff88' : '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>
                            {counts.calibDays} / 300
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 11, marginTop: 6 }}>for live bet unlock</div>
                    </div>
                </div>

                {/* Pipeline Steps */}
                <h2 style={{ fontFamily: 'Orbitron, sans-serif', color: '#fff', fontSize: 15, margin: '0 0 14px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Daily Pipeline Steps
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {PIPELINE_DEFINITIONS.map((pipe, i) => {
                        const run = latestByStep[pipe.key];
                        const { label: agoLabel, color: staleColor } = staleness(run?.run_ts);
                        const isError = run?.status === 'error';
                        const isOk = run?.status === 'success' || run?.status === 'ok';
                        const dotColor = !run ? '#6b7280' : isError ? '#ef4444' : staleColor;

                        return (
                            <div key={i} style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: `1px solid ${isError ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
                                borderRadius: 12,
                                padding: '14px 18px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 12,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span style={{ fontSize: 20 }}>{pipe.icon}</span>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: '#e5e7eb' }}>
                                            <StatusDot color={dotColor} />
                                            {pipe.label}
                                        </div>
                                        <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{pipe.description}</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 13, color: dotColor, fontWeight: 600 }}>
                                        {run ? (isError ? '✗ Error' : agoLabel) : 'Never run'}
                                    </div>
                                    {run?.rows_written != null && (
                                        <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>
                                            {run.rows_written.toLocaleString()} rows
                                        </div>
                                    )}
                                    {isError && run?.error_msg && (
                                        <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 4, maxWidth: 240, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {run.error_msg}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Cron reference */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '16px 18px', border: '1px dashed rgba(255,255,255,0.1)', marginTop: 24 }}>
                    <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 8, fontWeight: 600 }}>Daily Cron Schedule (CT)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                        {[
                            ['8:30 AM', 'Ingest → Statcast → Enrich'],
                            ['9:00 AM', 'Predict (all markets + props)'],
                            ['9:30 AM', 'Push odds + live CLV'],
                            ['11:00 PM', 'Grade results + calibration'],
                            ['12:00 AM', 'Weight optimizer (weekly)'],
                        ].map(([time, label]) => (
                            <div key={time} style={{ fontSize: 12, color: '#9ca3af' }}>
                                <span style={{ color: '#00d4ff', fontVariantNumeric: 'tabular-nums', display: 'inline-block', width: 65 }}>{time}</span>
                                {label}
                            </div>
                        ))}
                    </div>
                </div>
            </main>
            <BottomNavBar />
        </div>
    );
}
