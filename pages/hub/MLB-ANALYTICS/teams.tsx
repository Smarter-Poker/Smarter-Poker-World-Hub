import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Search, SearchX, Activity, Shield, Crosshair, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import useSWR from 'swr';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';

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

export default function TeamsPage({ teams: fallbackTeams, todayStr: fallbackToday, globalEdgeActive: fallbackGlobalEdgeActive }: any = {}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterLeague, setFilterLeague] = useState<'ALL' | 'AL' | 'NL'>('ALL');
    const [filterDivision, setFilterDivision] = useState<'ALL' | 'East' | 'Central' | 'West'>('ALL');
    const [sortBy, setSortBy] = useState<'NAME' | 'WAR' | 'OPS' | 'FIP' | 'EDGE'>('NAME');
    const [todayStr, setTodayStr] = useState<string>(fallbackToday || '');

    React.useEffect(() => {
        if (!todayStr) {
            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Chicago',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            setTodayStr(formatter.format(new Date()));
        }
    }, [todayStr]);

    const { data, error, isValidating } = useSWR('/api/mlb/teams', fetcher, {
        fallbackData: fallbackTeams ? { teams: fallbackTeams, globalEdgeActive: fallbackGlobalEdgeActive } : undefined,
        refreshInterval: 15000,
        revalidateOnFocus: true,
    });

    if (error) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Teams - Error" description="Data fetch failed" />
                <UniversalHeader pageDepth={2} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#FF00FF]/50 shadow-[0_0_20px_rgba(255,0,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
                        <Shield className="w-12 h-12 text-[#FF00FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(255,0,255,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF00FF] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load Teams Database. Please try again later.</p>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    const activeTeams = data?.teams || fallbackTeams || [];
    const globalEdgeActive = data?.globalEdgeActive || fallbackGlobalEdgeActive || false;

    const filteredTeams = useMemo(() => {
        let result = activeTeams.filter((team: any) => {
            const teamName = team.name || '';
            const teamLeague = team.league || '';
            const teamDivision = team.division || '';

            if (teamName.includes("All-Stars")) return false;

            const matchSearch = teamName.toLowerCase().includes(searchQuery.toLowerCase());
            const matchLeague = filterLeague === 'ALL' || 
                teamLeague === filterLeague || 
                (filterLeague === 'AL' && teamLeague.includes('American')) ||
                (filterLeague === 'NL' && teamLeague.includes('National'));
            
            const matchDivision = filterDivision === 'ALL' || teamDivision.includes(filterDivision);

            return matchSearch && matchLeague && matchDivision;
        });

        return result.sort((a: any, b: any) => {
            if (sortBy === 'WAR') return ((b.adv_stats?.hitting_war || 0) + (b.adv_stats?.pitching_war || 0)) - ((a.adv_stats?.hitting_war || 0) + (a.adv_stats?.pitching_war || 0));
            if (sortBy === 'OPS') return (b.adv_stats?.ops || 0) - (a.adv_stats?.ops || 0);
            if (sortBy === 'FIP') return (a.adv_stats?.fip || 99) - (b.adv_stats?.fip || 99);
            if (sortBy === 'EDGE') return (b.has_active_edge ? 1 : 0) - (a.has_active_edge ? 1 : 0);
            return (a.name || '').localeCompare(b.name || '');
        });
    }, [activeTeams, searchQuery, filterLeague, filterDivision, sortBy]);

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
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: "'Orbitron', sans-serif", letterSpacing: '0.1em' }}>T_SYNC: {todayStr}</p>
                                    {isValidating && <RefreshCw size={12} color="var(--neon-cyan)" className="animate-spin" style={{ opacity: 0.8 }} />}
                                    {isValidating && <span style={{ fontSize: 10, color: 'var(--neon-cyan)', fontWeight: 800, letterSpacing: '0.1em', opacity: 0.8 }}>SYNCING</span>}
                                </div>
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

                            {/* Filters and Sorting */}
                            <div className="scroll-hide" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: 8, paddingRight: 16, borderRight: '1px solid var(--metal-highlight)' }}>
                                    <button onClick={() => setFilterLeague('ALL')} className={`filter-pill ${filterLeague === 'ALL' ? 'active' : ''}`}>ALL</button>
                                    <button onClick={() => setFilterLeague('AL')} className={`filter-pill ${filterLeague === 'AL' ? 'active' : ''}`}>AL</button>
                                    <button onClick={() => setFilterLeague('NL')} className={`filter-pill ${filterLeague === 'NL' ? 'active' : ''}`}>NL</button>
                                </div>
                                <div style={{ display: 'flex', gap: 8, paddingRight: 16, borderRight: '1px solid var(--metal-highlight)' }}>
                                    <button onClick={() => setFilterDivision('ALL')} className={`filter-pill ${filterDivision === 'ALL' ? 'active' : ''}`}>ALL</button>
                                    <button onClick={() => setFilterDivision('East')} className={`filter-pill ${filterDivision === 'East' ? 'active' : ''}`}>EAST</button>
                                    <button onClick={() => setFilterDivision('Central')} className={`filter-pill ${filterDivision === 'Central' ? 'active' : ''}`}>CEN</button>
                                    <button onClick={() => setFilterDivision('West')} className={`filter-pill ${filterDivision === 'West' ? 'active' : ''}`}>WEST</button>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#64748B', display: 'flex', alignItems: 'center', letterSpacing: '0.1em' }}>SORT:</span>
                                    <select 
                                        value={sortBy} 
                                        onChange={(e) => setSortBy(e.target.value as any)}
                                        style={{ background: '#0d1117', border: '1px solid var(--metal-highlight)', color: 'var(--neon-cyan)', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 800, outline: 'none' }}
                                    >
                                        <option value="NAME">NAME</option>
                                        <option value="WAR">WAR</option>
                                        <option value="OPS">OPS</option>
                                        <option value="FIP">FIP</option>
                                        <option value="EDGE">EDGE</option>
                                    </select>
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
                                {filteredTeams.map((team: any) => (
                                    <TeamCardComponent key={team.team_id} team={team} />
                                ))}
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
