import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Search, SearchX, Activity, Shield, Crosshair } from 'lucide-react';
import useSWR from 'swr';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export interface Streaks {
    record?: string;
    last10_record?: string;
    longest_win_streak?: number;
    last10_run_diff?: number;
    [key: string]: any;
}

export interface Splits {
    home?: string;
    road?: string;
    [key: string]: any;
}

export interface AdvancedStats {
    fip?: number;
    siera?: number;
    hitting_war?: number;
    pitching_war?: number;
    ops?: number;
    oaa?: number;
    [key: string]: any;
}

export interface TeamProfile {
    team_id: number;
    name: string;
    streaks: Streaks | null;
    splits: Splits | null;
    adv_stats?: AdvancedStats | null;
    [key: string]: any;
}

interface TeamsPageProps {
    teams: TeamProfile[];
    todayStr: string;
}

export async function getServerSideProps({ res }: any) {
    try {
        if (res) {
            res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        }
        
        const mlbDb = getMlbSupabase();
        
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayStr = formatter.format(new Date());
        
        const [teamsRes, aggRes] = await Promise.all([
            mlbDb.from('v_team_profile').select('*').order('name', { ascending: true }),
            mlbDb.from('agg_team').select('team_id, era, fip, xfip, siera, pitching_war, avg, obp, slg, ops, hr, sb, hitting_war, def, uzr, drs, oaa').eq('window_kind', 'season')
        ]);
            
        let teams = teamsRes.data || [];
        const aggData = aggRes.data || [];

        // Merge advanced stats into teams
        teams = teams.map(team => {
            const teamStats = aggData.filter(a => a.team_id === team.team_id);
            const latestStats = teamStats.length > 0 ? teamStats[0] : null;
            return {
                ...team,
                adv_stats: latestStats
            };
        });

        return {
            props: {
                teams,
                todayStr
            }
        };
    } catch (err) {
        console.error('[TeamsPage] Error in getServerSideProps:', err);
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayStr = formatter.format(new Date());
        return { props: { teams: [], todayStr } };
    }
}

const TeamLogo = ({ teamId, teamName }: { teamId: number, teamName: string }) => {
    const [imgError, setImgError] = useState(false);
    if (imgError) {
        return (
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1a2332', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#00D4FF', border: '2px solid #3d4f5f' }}>
                {teamName.substring(0, 1).toUpperCase()}
            </div>
        );
    }
    return (
        <div style={{ position: 'relative', width: 40, height: 40, borderRadius: '50%', background: '#0d1117', border: '2px solid #3d4f5f', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <Image 
                unoptimized 
                width={28} 
                height={28} 
                src={`https://nscdmxldtyszyvcxxwgr.supabase.co/storage/v1/object/public/team-logos/${teamId}.svg`} 
                alt={teamName} 
                className="shrink-0"
                style={{ objectFit: 'contain' }}
                onError={() => setImgError(true)}
            />
        </div>
    );
};

const fetcher = (url: string) => fetch(url).then(res => res.json());


export default function TeamsPage({ teams: fallbackTeams, todayStr }: TeamsPageProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterLeague, setFilterLeague] = useState<'ALL' | 'AL' | 'NL'>('ALL');
    const [filterDivision, setFilterDivision] = useState<'ALL' | 'East' | 'Central' | 'West'>('ALL');

    const { data, error } = useSWR('/api/mlb/teams', fetcher, {
        fallbackData: { teams: fallbackTeams },
        refreshInterval: 15000,
        revalidateOnFocus: true,
    });

    const activeTeams = data?.teams || fallbackTeams || [];
    const globalEdgeActive = data?.globalEdgeActive || false;

    const filteredTeams = activeTeams.filter((team: any) => {
        const teamName = team.name || '';
        const teamLeague = team.league || '';
        const teamDivision = team.division || '';

        // Exclude All-Star teams which won't be in our dict
        if (teamName.includes("All-Stars")) return false;

        const matchSearch = teamName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchLeague = filterLeague === 'ALL' || 
            teamLeague === filterLeague || 
            (filterLeague === 'AL' && teamLeague.includes('American')) ||
            (filterLeague === 'NL' && teamLeague.includes('National'));
        
        const matchDivision = filterDivision === 'ALL' || teamDivision.includes(filterDivision);

        return matchSearch && matchLeague && matchDivision;
    });

    return (
        <>
        <style dangerouslySetInnerHTML={{__html: `
            :root {
                --metal-dark: #0a0a15;
                --metal-base: #0d1117;
                --metal-mid: #1a2332;
                --metal-light: #2a3a4a;
                --metal-highlight: #3d4f5f;
                --neon-cyan: #00D4FF;
                --neon-cyan-glow: rgba(0, 212, 255, 0.6);
                --neon-cyan-dim: rgba(0, 212, 255, 0.15);
                --glow-cyan: 0 0 10px var(--neon-cyan), 0 0 20px var(--neon-cyan-glow);
            }
            .futuristic-bg {
                background: #05050A;
                background-image: radial-gradient(circle at 50% 0%, #1a2332 0%, #05050A 70%);
            }
            .metal-frame {
                position: relative;
                background: linear-gradient(180deg, #1a2332 0%, #0d1117 100%);
                border: 2px solid var(--metal-highlight);
                border-radius: 12px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.5);
                transition: all 0.2s ease;
            }
            .metal-frame:hover {
                border-color: var(--neon-cyan-dim);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.5), 0 0 15px var(--neon-cyan-dim);
            }
            .frame-bolt {
                position: absolute;
                width: 10px;
                height: 10px;
                background: radial-gradient(circle, #5a6a7a 30%, #3a4a5a 70%);
                border-radius: 50%;
                border: 1px solid #2a3a4a;
                box-shadow: inset 0 1px 2px rgba(255,255,255,0.2);
            }
            .neon-strip {
                position: absolute;
                width: 3px;
                top: 20%;
                bottom: 20%;
                background: var(--neon-cyan);
                box-shadow: var(--glow-cyan);
                border-radius: 2px;
            }
            .stats-panel {
                display: flex;
                background: #05050A;
                border: 2px solid var(--metal-highlight);
                border-radius: 6px;
                overflow: hidden;
            }
            .stat-segment {
                flex: 1;
                padding: 6px 12px;
                text-align: center;
                border-right: 1px solid var(--metal-highlight);
            }
            .stat-segment:last-child {
                border-right: none;
            }
            .stat-label {
                font-size: 0.65rem;
                color: rgba(255,255,255,0.5);
                text-transform: uppercase;
                letter-spacing: 0.1em;
                margin-bottom: 2px;
                font-family: 'Rajdhani', sans-serif;
            }
            .stat-value {
                font-size: 1.1rem;
                font-weight: 700;
                color: var(--neon-cyan);
                text-shadow: 0 0 8px var(--neon-cyan-glow);
                font-family: 'Orbitron', sans-serif;
            }
            .metal-input {
                background: linear-gradient(180deg, #05050A 0%, #0d1117 100%);
                border: 2px solid var(--metal-highlight);
                border-radius: 8px;
                color: white;
                font-family: 'Rajdhani', sans-serif;
                box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
                transition: all 0.3s ease;
            }
            .metal-input:focus {
                border-color: var(--neon-cyan);
                box-shadow: inset 0 2px 4px rgba(0,0,0,0.5), 0 0 10px var(--neon-cyan-glow);
                outline: none;
            }
            .filter-pill {
                padding: 6px 16px;
                border-radius: 20px;
                font-size: 0.75rem;
                font-weight: 700;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                cursor: pointer;
                border: 1px solid var(--metal-highlight);
                background: #0d1117;
                color: #94A3B8;
                transition: all 0.2s ease;
                white-space: nowrap;
            }
            .filter-pill.active {
                background: var(--neon-cyan-dim);
                border-color: var(--neon-cyan);
                color: var(--neon-cyan);
                box-shadow: 0 0 8px var(--neon-cyan-dim);
            }
            .pipe-connector {
                height: 12px;
                background: linear-gradient(90deg, var(--metal-highlight) 0%, var(--metal-light) 50%, var(--metal-highlight) 100%);
                border-radius: 6px;
                box-shadow: inset 0 1px 2px rgba(255,255,255,0.2), inset 0 -1px 2px rgba(0,0,0,0.3);
                position: relative;
                margin: 0 24px;
                z-index: 10;
            }
            .pipe-joint {
                position: absolute;
                width: 20px;
                height: 20px;
                background: var(--metal-light);
                border: 2px solid var(--metal-highlight);
                border-radius: 50%;
                top: 50%;
                transform: translateY(-50%);
                box-shadow: 0 2px 4px rgba(0,0,0,0.5);
            }
            .scroll-hide::-webkit-scrollbar {
                display: none;
            }
            .scroll-hide {
                -ms-overflow-style: none;
                scrollbar-width: none;
            }
        `}} />
        
        <div className="page-container futuristic-bg" style={{ 
            minHeight: '100vh', 
            color: '#FFFFFF', 
            paddingBottom: 90,
            fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
            width: '100%',
            maxWidth: '100vw',
            overflowX: 'hidden',
            boxSizing: 'border-box'
        }}>
            <SEOHead 
                title="Teams | MLB Analytics" 
                description="MLB Team profiles and tactical terminal."
                noIndex={true} 
            />

            <UniversalHeader pageDepth={2} />
            <MlbSubNav />

            <main className="feed-layout" style={{
                display: 'flex',
                gap: 0,
                justifyContent: 'center',
                width: '100%',
                boxSizing: 'border-box'
            }}>
                <div className="feed-column" style={{ width: '100%', maxWidth: 680, margin: '0 auto', boxSizing: 'border-box' }}>
                    
                    {/* HUD Terminal Header */}
                    <div style={{ background: 'var(--metal-base)', borderBottom: '2px solid var(--metal-highlight)', padding: '24px 16px 20px', position: 'relative', zIndex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <Link href="/hub/MLB-ANALYTICS" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--neon-cyan)', fontSize: 11, fontWeight: 800, textDecoration: 'none', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>
                                    <ArrowLeft size={14} /> SYS_RETURN
                                </Link>
                                <h1 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 900, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    CLUB <span style={{ color: 'var(--neon-cyan)', textShadow: '0 0 15px var(--neon-cyan-glow)' }}>TERMINAL</span>
                                </h1>
                                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: "'Orbitron', sans-serif", letterSpacing: '0.1em' }}>T_SYNC: {todayStr}</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: globalEdgeActive ? 'var(--neon-cyan)' : '#475569', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '4px 8px', background: globalEdgeActive ? 'var(--neon-cyan-dim)' : '#1a2332', borderRadius: 4, border: `1px solid ${globalEdgeActive ? 'var(--neon-cyan)' : '#3d4f5f'}` }}>
                                    MLB EDGE
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {globalEdgeActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', position: 'absolute', animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' }} className="animate-ping" />}
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: globalEdgeActive ? '#22C55E' : '#475569', position: 'relative', boxShadow: globalEdgeActive ? '0 0 8px #22C55E' : 'none' }} />
                                    </div>
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', marginTop: 8, letterSpacing: '0.05em' }}>{activeTeams.length} DATA NODES</div>
                            </div>
                        </div>
                    </div>

                    {/* Pipe Connectors connecting Header to Body */}
                    <div style={{ position: 'relative', height: 24, marginTop: -6 }}>
                        <div className="pipe-connector">
                            <div className="pipe-joint" style={{ left: '-2px' }}></div>
                            <div className="pipe-joint" style={{ right: '-2px' }}></div>
                        </div>
                        {/* Vertical feed lines */}
                        <div style={{ position: 'absolute', width: 4, height: 24, background: 'var(--metal-highlight)', left: 40, top: 0, zIndex: 0 }}></div>
                        <div style={{ position: 'absolute', width: 4, height: 24, background: 'var(--metal-highlight)', right: 40, top: 0, zIndex: 0 }}></div>
                    </div>

                    <div style={{ padding: '8px 16px 24px' }}>
                        {/* Tactical Search Console */}
                        <div style={{ background: 'var(--metal-base)', padding: 16, borderRadius: 12, border: '1px solid var(--metal-highlight)', marginBottom: 24, boxShadow: '0 8px 16px rgba(0,0,0,0.4)' }}>
                            <div style={{ position: 'relative', marginBottom: 16 }}>
                                <div style={{ position: 'absolute', left: 14, top: 12, color: 'var(--neon-cyan)' }}>
                                    <Search size={18} />
                                </div>
                                <input 
                                    type="text"
                                    placeholder="INITIATE SEARCH PROTOCOL..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="metal-input"
                                    style={{ 
                                        width: '100%', 
                                        padding: '12px 12px 12px 42px', 
                                        fontSize: 14,
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>

                            {/* Filters */}
                            <div className="scroll-hide" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                                <div style={{ display: 'flex', gap: 8, paddingRight: 16, borderRight: '1px solid var(--metal-highlight)' }}>
                                    <button onClick={() => setFilterLeague('ALL')} className={`filter-pill ${filterLeague === 'ALL' ? 'active' : ''}`}>ALL</button>
                                    <button onClick={() => setFilterLeague('AL')} className={`filter-pill ${filterLeague === 'AL' ? 'active' : ''}`}>AL</button>
                                    <button onClick={() => setFilterLeague('NL')} className={`filter-pill ${filterLeague === 'NL' ? 'active' : ''}`}>NL</button>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => setFilterDivision('ALL')} className={`filter-pill ${filterDivision === 'ALL' ? 'active' : ''}`}>ALL</button>
                                    <button onClick={() => setFilterDivision('East')} className={`filter-pill ${filterDivision === 'East' ? 'active' : ''}`}>EAST</button>
                                    <button onClick={() => setFilterDivision('Central')} className={`filter-pill ${filterDivision === 'Central' ? 'active' : ''}`}>CENTRAL</button>
                                    <button onClick={() => setFilterDivision('West')} className={`filter-pill ${filterDivision === 'West' ? 'active' : ''}`}>WEST</button>
                                </div>
                            </div>
                        </div>

                        {/* Results */}
                        {filteredTeams.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--metal-base)', border: '2px dashed var(--metal-highlight)', borderRadius: 12 }}>
                                <div style={{ marginBottom: 16, color: '#94A3B8', display: 'flex', justifyContent: 'center' }}>
                                    <SearchX size={40} />
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 8, fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em' }}>
                                    NO TARGETS ACQUIRED
                                </div>
                                <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
                                    ADJUST FILTER PARAMETERS TO LOCATE SQUADRONS.
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {filteredTeams.map((team, idx) => {
                                    const record = team.streaks?.record || '0-0';
                                    const last10 = team.streaks?.last10_record || '0-0';
                                    let isHot = false;
                                    if (last10) {
                                        const [w] = last10.split('-').map(Number);
                                        if (w >= 7) isHot = true; // 7-3 or better in last 10
                                    }
                                    const leagueStr = team.league || '??';
                                    const divStr = team.division || '??';
                                    
                                    return (
                                        <div key={team.team_id} className="metal-frame" style={{ display: 'block', textDecoration: 'none' }}>
                                            {/* Corner Bolts */}
                                            <div className="frame-bolt" style={{ top: 8, left: 8 }} />
                                            <div className="frame-bolt" style={{ top: 8, right: 8 }} />
                                            <div className="frame-bolt" style={{ bottom: 8, left: 8 }} />
                                            <div className="frame-bolt" style={{ bottom: 8, right: 8 }} />
                                            
                                            {isHot && <div className="neon-strip left" />}

                                            <div style={{ display: 'block', padding: '20px', textDecoration: 'none', color: 'inherit' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                        <TeamLogo teamId={team.team_id} teamName={team.name} />
                                                        <div>
                                                            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>{team.name}</h3>
                                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--neon-cyan)', background: 'var(--neon-cyan-dim)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.05em' }}>
                                                                    {leagueStr} {divStr}
                                                                </span>
                                                                {team.has_active_edge && (
                                                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#22C55E', border: '1px solid #22C55E', padding: '1px 4px', borderRadius: 2, letterSpacing: '0.05em', background: 'rgba(34, 197, 94, 0.1)', textShadow: '0 0 5px rgba(34, 197, 94, 0.5)' }}>
                                                                        EDGE
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ color: 'var(--metal-highlight)' }}>
                                                        <Activity size={24} color={isHot ? '#EF4444' : '#475569'} style={{ filter: isHot ? 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))' : 'none' }} />
                                                    </div>
                                                </div>

                                                {/* Stats Panel */}
                                                <div className="stats-panel">
                                                    <div className="stat-segment">
                                                        <div className="stat-label">RECORD</div>
                                                        <div className="stat-value" style={{ color: 'white', textShadow: 'none' }}>{record}</div>
                                                    </div>
                                                    <div className="stat-segment">
                                                        <div className="stat-label">L10</div>
                                                        <div className="stat-value">{last10}</div>
                                                    </div>
                                                    <div className="stat-segment">
                                                        <div className="stat-label">HOME</div>
                                                        <div className="stat-value" style={{ color: '#FCD34D', textShadow: '0 0 8px rgba(252, 211, 77, 0.4)' }}>
                                                            {team.splits?.home || '0-0'}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Advanced Stats Panel */}
                                                {team.adv_stats && (
                                                    <div className="stats-panel" style={{ marginTop: 8, background: '#0a0a15' }}>
                                                        <div className="stat-segment">
                                                            <div className="stat-label" style={{ color: '#F472B6' }}>WAR</div>
                                                            <div className="stat-value" style={{ fontSize: '0.9rem', color: 'white', textShadow: 'none' }}>
                                                                {((team.adv_stats.hitting_war || 0) + (team.adv_stats.pitching_war || 0)).toFixed(1)}
                                                            </div>
                                                        </div>
                                                        <div className="stat-segment">
                                                            <div className="stat-label" style={{ color: '#60A5FA' }}>FIP</div>
                                                            <div className="stat-value" style={{ fontSize: '0.9rem', color: 'white', textShadow: 'none' }}>{team.adv_stats.fip?.toFixed(2) || '-'}</div>
                                                        </div>
                                                        <div className="stat-segment">
                                                            <div className="stat-label" style={{ color: '#34D399' }}>OPS</div>
                                                            <div className="stat-value" style={{ fontSize: '0.9rem', color: 'white', textShadow: 'none' }}>{team.adv_stats.ops?.toFixed(3) || '-'}</div>
                                                        </div>
                                                        <div className="stat-segment">
                                                            <div className="stat-label" style={{ color: '#A78BFA' }}>OAA</div>
                                                            <div className="stat-value" style={{ fontSize: '0.9rem', color: 'white', textShadow: 'none' }}>{team.adv_stats.oaa || '-'}</div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </main>
            
            <BottomNavBar />
        </div>
        </>
    );
}
