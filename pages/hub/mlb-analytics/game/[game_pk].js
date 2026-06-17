import SEOHead from '../../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';
import { getMlbSupabase } from '../../../../utils/supabase/mlb';
import Link from 'next/link';

export async function getServerSideProps({ params }) {
    try {
        const mlbDb = getMlbSupabase();
        const gamePk = parseInt(params.game_pk, 10);

        // Fetch game base row
        const { data: game, error: gameErr } = await mlbDb
            .from('fact_games')
            .select('game_pk, official_date, first_pitch_utc, home_team_id, away_team_id, venue_id, home_sp_id, away_sp_id, home_score, away_score, final')
            .eq('game_pk', gamePk)
            .maybeSingle();

        if (gameErr) throw gameErr;
        if (!game) return { props: { game: null, error: 'Game not found.' } };

        // Parallel lookups
        const [teamsRes, stadRes, playersRes, predsRes, propsRes, marketRes] = await Promise.all([
            mlbDb.from('dim_teams').select('team_id, name, abbr'),
            mlbDb.from('dim_stadiums').select('stadium_id, name'),
            mlbDb.from('dim_players').select('player_id, full_name').in('player_id', [game.home_sp_id, game.away_sp_id].filter(Boolean)),
            mlbDb.from('pred_market_output')
                .select('market, selection, model_prob, market_novig_prob, blended_prob, edge_pts, rec, as_of_ts')
                .eq('game_pk', gamePk)
                .order('as_of_ts', { ascending: false }),
            mlbDb.from('pred_props')
                .select('player_id, prop, line, proj_mean, prob_over, rec')
                .eq('game_pk', gamePk),
            mlbDb.from('agg_market')
                .select('novig_home, total_consensus, metrics')
                .eq('game_pk', gamePk)
                .maybeSingle(),
        ]);

        const teamsMap = {};
        (teamsRes.data || []).forEach(t => { teamsMap[t.team_id] = { name: t.name, abbr: t.abbr }; });
        const stadMap = {};
        (stadRes.data || []).forEach(s => { stadMap[s.stadium_id] = s.name; });
        const playersMap = {};
        (playersRes.data || []).forEach(p => { playersMap[p.player_id] = p.full_name; });

        // Keep only the freshest prediction run
        const latestTs = (predsRes.data || []).reduce((max, p) => p.as_of_ts > max ? p.as_of_ts : max, '');
        const preds = (predsRes.data || []).filter(p => p.as_of_ts === latestTs);
        const market = marketRes.data || {};

        const pitchTimeCST = game.first_pitch_utc
            ? new Date(game.first_pitch_utc).toLocaleTimeString('en-US', {
                timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
            })
            : 'TBD';

        return {
            props: {
                game: {
                    game_pk: game.game_pk,
                    official_date: game.official_date,
                    pitch_time_cst: pitchTimeCST,
                    home_team: teamsMap[game.home_team_id]?.abbr || game.home_team_id,
                    away_team: teamsMap[game.away_team_id]?.abbr || game.away_team_id,
                    home_team_name: teamsMap[game.home_team_id]?.name || '',
                    away_team_name: teamsMap[game.away_team_id]?.name || '',
                    venue: stadMap[game.venue_id] || 'TBD',
                    home_sp: game.home_sp_id ? (playersMap[game.home_sp_id] || `ID:${game.home_sp_id}`) : 'TBD',
                    away_sp: game.away_sp_id ? (playersMap[game.away_sp_id] || `ID:${game.away_sp_id}`) : 'TBD',
                    home_score: game.home_score,
                    away_score: game.away_score,
                    final: game.final,
                    novig_home: market.novig_home || null,
                    total_line: market.total_consensus || null,
                },
                preds,
                props: propsRes.data || [],
                error: null,
            }
        };
    } catch (err) {
        return { props: { game: null, preds: [], props: [], error: err.message } };
    }
}

function EdgeBadge({ edge }) {
    if (!edge) return null;
    const color = edge >= 3 ? '#00ff88' : edge >= 1.5 ? '#fbbf24' : '#9ca3af';
    return (
        <span style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${color}`, color, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
            +{edge.toFixed(1)}%
        </span>
    );
}

export default function MlbGameDeepDive({ game, preds, props, error }) {
    if (!game) return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingBottom: 80 }}>
            <SEOHead title="Game Not Found | MLB Engine" />
            <UniversalHeader title="Game Deep Dive" />
            <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', paddingTop: 80 }}>
                <Link href="/hub/mlb-analytics" style={{ color: '#00d4ff', textDecoration: 'none', display: 'inline-block', marginBottom: 20 }}>← Back to Slate</Link>
                <div style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid red', padding: 20, borderRadius: 12, color: '#ff6b6b' }}>
                    {error || 'Game not found.'}
                </div>
            </main>
            <BottomNavBar />
        </div>
    );

    // Split predictions by market type
    const h2h = preds.filter(p => p.market === 'h2h');
    const totals = preds.filter(p => p.market === 'total');
    const runLine = preds.filter(p => p.market === 'run_line');
    const f5 = preds.filter(p => p.market === 'f5_moneyline');
    const nrfi = preds.find(p => p.market === 'nrfi');
    const actionPreds = preds.filter(p => p.rec === true);

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingBottom: 80 }}>
            <SEOHead title={`${game.away_team} @ ${game.home_team} | MLB Engine`} />
            <UniversalHeader title="Game Deep Dive" />

            <main style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto', paddingTop: 80 }}>
                <Link href="/hub/mlb-analytics" style={{ color: '#00d4ff', textDecoration: 'none', display: 'inline-block', marginBottom: 24, fontFamily: 'Orbitron, sans-serif', fontSize: 13 }}>
                    ← Back to Slate
                </Link>

                {/* Hero Header */}
                <div style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(0,255,136,0.05))', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 16, padding: '24px 28px', marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <h1 style={{ fontFamily: 'Orbitron, sans-serif', color: '#fff', fontSize: 28, margin: '0 0 6px 0' }}>
                                {game.away_team} @ {game.home_team}
                            </h1>
                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
                                {game.official_date} • {game.pitch_time_cst} • {game.venue}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 }}>
                                {game.away_sp} vs {game.home_sp}
                            </div>
                        </div>
                        {game.final ? (
                            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 20px' }}>
                                <div style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Final</div>
                                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 26, fontWeight: 700 }}>
                                    {game.away_score} – {game.home_score}
                                </div>
                            </div>
                        ) : (
                            <div style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 12, padding: '12px 20px', color: '#00d4ff', fontWeight: 600, fontSize: 14 }}>
                                {game.novig_home != null ? `Model: ${(game.novig_home * 100).toFixed(1)}% home` : 'Predictions pending'}
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Plays */}
                {actionPreds.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                        <h2 style={{ fontFamily: 'Orbitron, sans-serif', color: '#00ff88', fontSize: 15, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            ✓ Actionable Plays
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {actionPreds.map((p, i) => (
                                <div key={i} style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{p.market?.toUpperCase()} – {p.selection}</span>
                                        {p.blended_prob != null && (
                                            <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 12 }}>
                                                Model: {(p.blended_prob * 100).toFixed(1)}% {p.market_novig_prob != null ? `| Market: ${(p.market_novig_prob * 100).toFixed(1)}%` : ''}
                                            </span>
                                        )}
                                    </div>
                                    <EdgeBadge edge={p.edge_pts} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Market Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>

                    {/* Moneyline */}
                    {h2h.length > 0 && (
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 18 }}>
                            <h3 style={{ color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 13, margin: '0 0 12px 0', textTransform: 'uppercase' }}>Moneyline</h3>
                            {h2h.map((p, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < h2h.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                                    <span style={{ color: '#d4d4d4', fontSize: 13 }}>{p.selection}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ color: '#9ca3af', fontSize: 12 }}>{p.model_prob != null ? (p.model_prob * 100).toFixed(1) + '%' : '–'}</span>
                                        {p.rec && <EdgeBadge edge={p.edge_pts} />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Totals */}
                    {totals.length > 0 && (
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 18 }}>
                            <h3 style={{ color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 13, margin: '0 0 12px 0', textTransform: 'uppercase' }}>
                                Total {game.total_line ? `(${game.total_line})` : ''}
                            </h3>
                            {totals.map((p, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < totals.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                                    <span style={{ color: '#d4d4d4', fontSize: 13 }}>{p.selection}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ color: '#9ca3af', fontSize: 12 }}>{p.model_prob != null ? (p.model_prob * 100).toFixed(1) + '%' : '–'}</span>
                                        {p.rec && <EdgeBadge edge={p.edge_pts} />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Run Line */}
                    {runLine.length > 0 && (
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 18 }}>
                            <h3 style={{ color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 13, margin: '0 0 12px 0', textTransform: 'uppercase' }}>Run Line</h3>
                            {runLine.map((p, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < runLine.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                                    <span style={{ color: '#d4d4d4', fontSize: 13 }}>{p.selection}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ color: '#9ca3af', fontSize: 12 }}>{p.model_prob != null ? (p.model_prob * 100).toFixed(1) + '%' : '–'}</span>
                                        {p.rec && <EdgeBadge edge={p.edge_pts} />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* F5 + NRFI */}
                    {(f5.length > 0 || nrfi) && (
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 18 }}>
                            <h3 style={{ color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 13, margin: '0 0 12px 0', textTransform: 'uppercase' }}>First 5 / NRFI</h3>
                            {f5.map((p, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <span style={{ color: '#d4d4d4', fontSize: 13 }}>F5 {p.selection}</span>
                                    <span style={{ color: '#9ca3af', fontSize: 12 }}>{p.model_prob != null ? (p.model_prob * 100).toFixed(1) + '%' : '–'}</span>
                                </div>
                            ))}
                            {nrfi && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                                    <span style={{ color: '#d4d4d4', fontSize: 13 }}>NRFI</span>
                                    <span style={{ color: '#9ca3af', fontSize: 12 }}>{nrfi.model_prob != null ? (nrfi.model_prob * 100).toFixed(1) + '%' : '–'}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Player Props */}
                {props.length > 0 && (
                    <div>
                        <h2 style={{ fontFamily: 'Orbitron, sans-serif', color: '#fff', fontSize: 15, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Player Props
                        </h2>
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                                        {['Player', 'Prop', 'Line', 'Proj.', 'Prob Over', 'Rec'].map(h => (
                                            <th key={h} style={{ padding: '10px 14px', color: '#9ca3af', fontWeight: 500, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {props.map((p, i) => (
                                        <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: p.rec ? 'rgba(0,255,136,0.03)' : 'transparent' }}>
                                            <td style={{ padding: '9px 14px', color: '#d4d4d4' }}>{p.player_id}</td>
                                            <td style={{ padding: '9px 14px', color: '#d4d4d4' }}>{p.prop}</td>
                                            <td style={{ padding: '9px 14px', color: '#9ca3af' }}>{p.line}</td>
                                            <td style={{ padding: '9px 14px', color: '#9ca3af' }}>{p.proj_mean?.toFixed(2) || '–'}</td>
                                            <td style={{ padding: '9px 14px', color: p.prob_over > 0.55 ? '#00ff88' : '#9ca3af' }}>
                                                {p.prob_over != null ? (p.prob_over * 100).toFixed(1) + '%' : '–'}
                                            </td>
                                            <td style={{ padding: '9px 14px' }}>
                                                {p.rec ? <span style={{ color: '#00ff88', fontWeight: 600 }}>BET</span> : <span style={{ color: '#6b7280' }}>–</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {preds.length === 0 && props.length === 0 && !error && (
                    <div style={{ background: 'rgba(255,255,255,0.04)', padding: 40, borderRadius: 12, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                        No predictions found for this game. Run the daily pipeline to generate predictions.
                    </div>
                )}
            </main>
            <BottomNavBar />
        </div>
    );
}
