import { useState } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import Link from 'next/link';

export async function getServerSideProps() {
    try {
        const mlbDb = getMlbSupabase();
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

        // Fetch today's props
        const { data: props, error } = await mlbDb
            .from('pred_props')
            .select('game_pk, player_id, prop, line, model_prob, edge_pts, rec, best_price, as_of_ts, result')
            .gte('as_of_ts', todayStr)
            .order('edge_pts', { ascending: false })
            .limit(200);

        if (error) throw error;

        // Fetch player names
        const playerIds = [...new Set((props || []).map(p => p.player_id).filter(Boolean))];
        let playersMap = {};
        if (playerIds.length > 0) {
            const { data: players } = await mlbDb
                .from('dim_players')
                .select('player_id, full_name')
                .in('player_id', playerIds.slice(0, 200));
            (players || []).forEach(p => { playersMap[p.player_id] = p.full_name; });
        }

        // Fetch teams for game_pk mapping
        const gamePks = [...new Set((props || []).map(p => p.game_pk).filter(Boolean))];
        let gamesMap = {};
        if (gamePks.length > 0) {
            const { data: teams } = await mlbDb.from('dim_teams').select('team_id, abbr');
            const teamsMap = {};
            (teams || []).forEach(t => { teamsMap[t.team_id] = t.abbr; });
            const { data: games } = await mlbDb
                .from('fact_games')
                .select('game_pk, home_team_id, away_team_id')
                .in('game_pk', gamePks);
            (games || []).forEach(g => {
                gamesMap[g.game_pk] = `${teamsMap[g.away_team_id] || g.away_team_id} @ ${teamsMap[g.home_team_id] || g.home_team_id}`;
            });
        }

        const enriched = (props || []).map(p => ({
            ...p,
            player_name: playersMap[p.player_id] || `#${p.player_id}`,
            matchup: gamesMap[p.game_pk] || `Game ${p.game_pk}`,
            edge_pct: p.edge_pts != null ? (p.edge_pts / 100).toFixed(2) : null,
        }));

        return { props: { rows: enriched, error: null } };
    } catch (err) {
        return { props: { rows: [], error: err.message } };
    }
}

const PROP_LABELS = {
    batter_home_runs: 'HR',
    batter_total_bases: 'Bases',
    pitcher_strikeouts: 'Pitcher Ks',
    batter_rbi: 'RBI',
    batter_hits: 'Hits',
};

const SORT_KEYS = ['edge_pts', 'model_prob', 'line', 'prop'];

export default function MlbPropsSheet({ rows, error }) {
    const [sortKey, setSortKey] = useState('edge_pts');
    const [sortDir, setSortDir] = useState('desc');
    const [filterProp, setFilterProp] = useState('all');
    const [recOnly, setRecOnly] = useState(false);

    const propTypes = ['all', ...Object.keys(PROP_LABELS)];

    const sorted = [...rows]
        .filter(r => filterProp === 'all' || r.prop === filterProp)
        .filter(r => !recOnly || r.rec === 'BET' || r.rec === true)
        .sort((a, b) => {
            const av = a[sortKey] ?? -Infinity;
            const bv = b[sortKey] ?? -Infinity;
            return sortDir === 'desc' ? bv - av : av - bv;
        });

    const toggleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const SortIcon = ({ k }) => (
        <span style={{ opacity: sortKey === k ? 1 : 0.3, marginLeft: 4, fontSize: 10 }}>
            {sortKey === k ? (sortDir === 'desc' ? '▼' : '▲') : '⬍'}
        </span>
    );

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingBottom: 100 }}>
            <SEOHead title="Player Props | MLB Engine" />
            <UniversalHeader title="Prop Sheet" />

            <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', paddingTop: 80 }}>
                <Link href="/hub/mlb-analytics" style={{ color: '#00d4ff', textDecoration: 'none', display: 'inline-block', marginBottom: 20, fontFamily: 'Orbitron, sans-serif', fontSize: 13 }}>
                    ← Back to Slate
                </Link>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                    <h1 style={{ fontFamily: 'Orbitron, sans-serif', color: '#00d4ff', fontSize: 22, margin: 0 }}>
                        Player Props — Today&apos;s Edge Sheet
                    </h1>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <select
                            value={filterProp}
                            onChange={e => setFilterProp(e.target.value)}
                            style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}
                        >
                            {propTypes.map(p => (
                                <option key={p} value={p}>{p === 'all' ? 'All Props' : PROP_LABELS[p] || p}</option>
                            ))}
                        </select>
                        <button
                            onClick={() => setRecOnly(!recOnly)}
                            style={{
                                background: recOnly ? '#00ff88' : 'transparent',
                                border: `1px solid #00ff88`,
                                color: recOnly ? '#000' : '#00ff88',
                                padding: '6px 14px',
                                borderRadius: 8,
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: 12
                            }}
                        >
                            {recOnly ? '✓ BET Only' : 'BET Only'}
                        </button>
                    </div>
                </div>

                {error && (
                    <div style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid red', padding: 15, borderRadius: 8, color: '#ff6b6b', marginBottom: 20 }}>
                        DB Error: {error}
                    </div>
                )}

                {sorted.length === 0 ? (
                    <div style={{ background: 'rgba(255,255,255,0.04)', padding: 60, borderRadius: 12, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
                        <div>No props found for today. The engine publishes props after the daily predict pipeline runs (~9 AM CT).</div>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: 'rgba(0,212,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 11, letterSpacing: 1, whiteSpace: 'nowrap' }}>Player</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 11, letterSpacing: 1, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('prop')}>
                                        Prop <SortIcon k="prop" />
                                    </th>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 11, letterSpacing: 1, whiteSpace: 'nowrap' }}>Matchup</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'right', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 11, letterSpacing: 1, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('line')}>
                                        Line <SortIcon k="line" />
                                    </th>
                                    <th style={{ padding: '12px 14px', textAlign: 'right', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 11, letterSpacing: 1, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('model_prob')}>
                                        Model % <SortIcon k="model_prob" />
                                    </th>
                                    <th style={{ padding: '12px 14px', textAlign: 'right', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 11, letterSpacing: 1, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort('edge_pts')}>
                                        Edge <SortIcon k="edge_pts" />
                                    </th>
                                    <th style={{ padding: '12px 14px', textAlign: 'center', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 11, letterSpacing: 1, whiteSpace: 'nowrap' }}>Rec</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'center', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 11, letterSpacing: 1, whiteSpace: 'nowrap' }}>Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((row, i) => {
                                    const isBet = row.rec === 'BET' || row.rec === true;
                                    const edge = row.edge_pts != null ? row.edge_pts / 100 : null;
                                    const isGoodEdge = edge != null && edge > 2;
                                    return (
                                        <tr key={i} style={{
                                            background: isBet ? 'rgba(0,255,136,0.04)' : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'),
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            borderLeft: isBet ? '3px solid #00ff88' : '3px solid transparent',
                                            transition: 'background 0.15s'
                                        }}>
                                            <td style={{ padding: '10px 14px', fontWeight: isBet ? 600 : 400 }}>{row.player_name}</td>
                                            <td style={{ padding: '10px 14px', color: '#00d4ff' }}>{PROP_LABELS[row.prop] || row.prop}</td>
                                            <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{row.matchup}</td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.line?.toFixed(1) ?? '—'}</td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                {row.model_prob != null ? `${(row.model_prob * 100).toFixed(1)}%` : '—'}
                                            </td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: isGoodEdge ? '#00ff88' : (edge != null && edge > 0 ? '#ffd700' : 'rgba(255,255,255,0.4)'), fontWeight: isGoodEdge ? 700 : 400 }}>
                                                {edge != null ? `+${edge.toFixed(2)}%` : '—'}
                                            </td>
                                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                {isBet ? (
                                                    <span style={{ background: '#00ff88', color: '#000', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>BET</span>
                                                ) : (
                                                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                {row.result === 'WIN' ? <span style={{ color: '#00ff88', fontWeight: 700 }}>✓ WIN</span>
                                                    : row.result === 'LOSS' ? <span style={{ color: '#ff4444', fontWeight: 700 }}>✗ LOSS</span>
                                                    : row.result === 'VOID' ? <span style={{ color: '#888' }}>PUSH</span>
                                                    : <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>Pending</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.35)', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            {sorted.length} props · sorted by {sortKey} ({sortDir}) · {new Date().toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
                        </div>
                    </div>
                )}
            </main>
            <BottomNavBar />
        </div>
    );
}
