import React, { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { ChevronLeft, Activity, Shield, TrendingUp, AlertTriangle, Swords, Target, MapPin } from 'lucide-react';
import { logError } from '@/utils/logger';
import { BetScoreBadge } from '../../../../src/components/mlb/BetScoreBadge';

const fetcher = async (url: string) => {
    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return await res.json();
    } catch (err) {
        logError('SWR Fetch', err);
        throw err;
    }
};

const TeamLogo = ({ teamId, teamName }: { teamId: string, teamName: string }) => {
    const [imgError, setImgError] = useState(false);
    if (imgError) {
        return (
            <div style={{ position: 'relative', width: 64, height: 64, borderRadius: '50%', background: '#0d1117', border: '2px solid #3d4f5f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 24, fontWeight: 800 }}>
                {teamName.substring(0, 1).toUpperCase()}
            </div>
        );
    }
    return (
        <div style={{ position: 'relative', width: 64, height: 64, borderRadius: '50%', background: '#0d1117', border: '2px solid #3d4f5f', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 0 15px rgba(0,0,0,0.5)' }}>
            <Image 
                unoptimized 
                width={48} 
                height={48} 
                src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`} 
                alt={teamName} 
                className="shrink-0"
                style={{ objectFit: 'contain' }}
                onError={() => setImgError(true)}
            />
        </div>
    );
};

export default function TeamDetailPage() {
    const router = useRouter();
    const { team_id } = router.query;
    
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'GAMES' | 'PROPS'>('OVERVIEW');

    const { data, error, isValidating } = useSWR(team_id ? `/api/mlb/teams/${team_id}` : null, fetcher, {
        refreshInterval: 60000,
        revalidateOnFocus: true,
    });

    if (error || data?.error) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Team Detail - Error" description="Data fetch failed" />
                <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS/teams')} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#00D4FF]/50 shadow-[0_0_20px_rgba(0,212,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
                        <Shield className="w-12 h-12 text-[#00D4FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF4444] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load Team Details. Please try again later.</p>
                        <Link href="/hub/MLB-ANALYTICS/teams" className="mt-6 inline-block bg-[#1a2332] text-white px-6 py-2 rounded-sm border border-[#3d4f5f] text-[10px] font-extrabold tracking-widest uppercase hover:bg-[#2a3a4a] relative z-10">
                            BACK TO TEAMS
                        </Link>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    if (!data && isValidating) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200 flex flex-col">
                <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS/teams')} />
                <MlbSubNav />
                <div className="flex-1 flex items-center justify-center min-h-[50vh]">
                    <Activity className="w-12 h-12 text-[#00D4FF] animate-pulse" />
                </div>
                <BottomNavBar />
            </div>
        );
    }

    const team = data?.team;
    const adv = data?.stats || {};
    const games = data?.games || [];
    const props = data?.props || [];
    const hasEdge = props.length > 0;

    if (!team && data) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200 flex flex-col">
                <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS/teams')} />
                <MlbSubNav />
                <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-[50vh]">
                    <h2 className="text-xl font-bold text-white mb-4">Team Not Found</h2>
                    <Link href="/hub/MLB-ANALYTICS/teams" className="text-[#00D4FF] underline">Return to Teams</Link>
                </div>
                <BottomNavBar />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
            <SEOHead title={`Smarter.Poker | MLB Team | ${team?.name || 'Loading...'}`} description={`Advanced MLB analytics for ${team?.name}`} />
            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS/teams')} />
            <MlbSubNav />
            
            <style dangerouslySetInnerHTML={{__html: `
                :root {
                    --metal-dark: #0a0a15;
                    --metal-medium: #151a25;
                    --metal-light: #232d3d;
                    --metal-highlight: #3d4f5f;
                    --neon-cyan: #00D4FF;
                    --neon-cyan-dim: rgba(0, 212, 255, 0.15);
                    --neon-cyan-glow: rgba(0, 212, 255, 0.6);
                    --glow-cyan: 0 0 10px var(--neon-cyan), 0 0 20px var(--neon-cyan-glow);
                    --neon-magenta: #00D4FF;
                    --neon-magenta-dim: rgba(255, 0, 255, 0.15);
                    --alert-red: #EF4444;
                    --success-green: #22C55E;
                }
                .metal-panel {
                    background: linear-gradient(180deg, var(--metal-medium) 0%, var(--metal-dark) 100%);
                    border: 1px solid var(--metal-highlight);
                    border-radius: 12px;
                    padding: 24px;
                    position: relative;
                    overflow: hidden;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.5);
                }
                .panel-title {
                    font-size: 11px;
                    font-weight: 800;
                    letter-spacing: 0.15em;
                    color: var(--metal-highlight);
                    margin-bottom: 16px;
                    border-bottom: 1px solid rgba(61, 79, 95, 0.5);
                    padding-bottom: 8px;
                    text-transform: uppercase;
                }
                .stat-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                    gap: 16px;
                }
                .stat-box {
                    background: rgba(0,0,0,0.2);
                    border: 1px solid rgba(61, 79, 95, 0.5);
                    border-radius: 8px;
                    padding: 12px;
                    text-align: center;
                }
                .stat-box-title {
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 0.1em;
                    color: #94A3B8;
                    margin-bottom: 4px;
                }
                .stat-box-value {
                    font-size: 20px;
                    font-weight: 800;
                    color: white;
                }
                .edge-glow {
                    box-shadow: 0 0 15px rgba(34, 197, 94, 0.3), inset 0 0 15px rgba(34, 197, 94, 0.1);
                    border-color: rgba(34, 197, 94, 0.5) !important;
                }
            `}} />

            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Back Button */}
                <Link href="/hub/MLB-ANALYTICS/teams" className="inline-flex items-center text-sm font-bold tracking-wider text-[#94A3B8] hover:text-white transition-colors mb-6 uppercase">
                    <ChevronLeft size={16} className="mr-1" /> Back to Teams
                </Link>

                {team && (
                    <>
                        {/* Header Profile */}
                        <div className={`metal-panel mb-8 flex flex-col md:flex-row items-center md:items-start gap-6 ${hasEdge ? 'edge-glow' : ''}`}>
                            <TeamLogo teamId={team.team_id} teamName={team.name} />
                            
                            <div className="flex-1 text-center md:text-left">
                                <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2 flex items-center justify-center md:justify-start gap-3">
                                    {team.name}
                                </h1>
                                <div className="text-[#00D4FF] font-bold tracking-widest text-sm mb-4 flex items-center gap-2 justify-center md:justify-start">
                                    <MapPin size={14} /> {[team.league, team.division].filter(Boolean).join(' • ') || 'MLB'}
                                </div>
                                {team.grade && (
                                    <div className="flex items-center gap-2 mb-1 justify-center md:justify-start">
                                        <span className="text-[10px] font-extrabold tracking-widest text-slate-500 uppercase">Top Edge</span>
                                        <BetScoreBadge pWin={team.grade.pWin} price={team.grade.price} pMarket={team.grade.pMarket} />
                                        <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">{team.grade.edgeCount} active</span>
                                    </div>
                                )}
                                <div className="flex flex-wrap justify-center md:justify-start gap-4">
                                    <div className="bg-[#000] px-4 py-2 rounded border border-[#3d4f5f]">
                                        <div className="text-[10px] text-[#94A3B8] font-bold tracking-widest mb-1">RECORD</div>
                                        <div className="text-xl text-white font-black">{team.streaks?.record || '0-0'}</div>
                                    </div>
                                    <div className="bg-[#000] px-4 py-2 rounded border border-[#3d4f5f]">
                                        <div className="text-[10px] text-[#94A3B8] font-bold tracking-widest mb-1">LAST 10</div>
                                        <div className="text-xl text-white font-black">{team.streaks?.last10_record || '0-0'}</div>
                                    </div>
                                    <div className="bg-[#000] px-4 py-2 rounded border border-[#3d4f5f]">
                                        <div className="text-[10px] text-[#94A3B8] font-bold tracking-widest mb-1">HOME SPLIT</div>
                                        <div className="text-xl text-[#FCD34D] font-black">{team.splits?.home || '0-0'}</div>
                                    </div>
                                    <div className="bg-[#000] px-4 py-2 rounded border border-[#3d4f5f]">
                                        <div className="text-[10px] text-[#94A3B8] font-bold tracking-widest mb-1">AWAY SPLIT</div>
                                        <div className="text-xl text-[#FCD34D] font-black">{team.splits?.away || '0-0'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                            <style dangerouslySetInnerHTML={{__html: `div::-webkit-scrollbar { display: none; }`}} />
                            {['OVERVIEW', 'GAMES', 'PROPS'].map((tab: any) => (
                                <button 
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-5 py-2 rounded-sm border-[2px] text-[10px] font-extrabold tracking-widest whitespace-nowrap cursor-pointer transition-all uppercase ${
                                        activeTab === tab 
                                        ? 'bg-[#1a2332] text-[#00D4FF] border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]' 
                                        : 'bg-[#0d1117] text-slate-400 border-[#3d4f5f] hover:border-[#5a6a7a] hover:text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                                    }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {activeTab === 'OVERVIEW' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {/* Value & Overall */}
                                <div className="metal-panel">
                                    <div className="panel-title flex items-center"><TrendingUp size={14} className="mr-2 text-[#00D4FF]" /> OVERALL VALUE (WAR)</div>
                                    <div className="stat-grid">
                                        <div className="stat-box">
                                            <div className="stat-box-title">HITTING WAR</div>
                                            <div className="stat-box-value text-[#F472B6]">{(adv.hitting_war != null ? Number(adv.hitting_war).toFixed(1) : null) || '-'}</div>
                                        </div>
                                        <div className="stat-box">
                                            <div className="stat-box-title">PITCHING WAR</div>
                                            <div className="stat-box-value text-[#60A5FA]">{(adv.pitching_war != null ? Number(adv.pitching_war).toFixed(1) : null) || '-'}</div>
                                        </div>
                                        <div className="stat-box" style={{ background: 'rgba(0, 212, 255, 0.1)', borderColor: '#00D4FF' }}>
                                            <div className="stat-box-title text-[#00D4FF]">TOTAL WAR</div>
                                            <div className="stat-box-value text-white">
                                                {(Number(adv.hitting_war || 0) + Number(adv.pitching_war || 0)).toFixed(1)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Pitching Metrics */}
                                <div className="metal-panel">
                                    <div className="panel-title flex items-center"><Activity size={14} className="mr-2 text-[#60A5FA]" /> PITCHING METRICS</div>
                                    <div className="stat-grid">
                                        <div className="stat-box">
                                            <div className="stat-box-title">ERA</div>
                                            <div className="stat-box-value">{(adv.era != null ? Number(adv.era).toFixed(2) : null) || '-'}</div>
                                        </div>
                                        <div className="stat-box">
                                            <div className="stat-box-title">FIP</div>
                                            <div className="stat-box-value">{(adv.fip != null ? Number(adv.fip).toFixed(2) : null) || '-'}</div>
                                        </div>
                                        <div className="stat-box">
                                            <div className="stat-box-title">xFIP</div>
                                            <div className="stat-box-value">{(adv.xfip != null ? Number(adv.xfip).toFixed(2) : null) || '-'}</div>
                                        </div>
                                        <div className="stat-box">
                                            <div className="stat-box-title">SIERA</div>
                                            <div className="stat-box-value text-[#FCD34D]">{(adv.siera != null ? Number(adv.siera).toFixed(2) : null) || '-'}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Hitting Metrics */}
                                <div className="metal-panel">
                                    <div className="panel-title flex items-center"><Activity size={14} className="mr-2 text-[#F472B6]" /> HITTING METRICS</div>
                                    <div className="stat-grid">
                                        <div className="stat-box">
                                            <div className="stat-box-title">AVG</div>
                                            <div className="stat-box-value">{(adv.avg != null ? Number(adv.avg || 0).toFixed(3).replace(/^0/, '') : '-')}</div>
                                        </div>
                                        <div className="stat-box">
                                            <div className="stat-box-title">OPS</div>
                                            <div className="stat-box-value text-[#34D399]">{(adv.ops != null ? Number(adv.ops || 0).toFixed(3).replace(/^0/, '') : '-')}</div>
                                        </div>
                                        <div className="stat-box">
                                            <div className="stat-box-title">HR</div>
                                            <div className="stat-box-value">{adv.hr || '-'}</div>
                                        </div>
                                        <div className="stat-box">
                                            <div className="stat-box-title">SB</div>
                                            <div className="stat-box-value">{adv.sb || '-'}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Fielding Metrics */}
                                <div className="metal-panel">
                                    <div className="panel-title flex items-center"><Shield size={14} className="mr-2 text-[#A78BFA]" /> FIELDING METRICS</div>
                                    <div className="stat-grid">
                                        <div className="stat-box">
                                            <div className="stat-box-title">DEF</div>
                                            <div className="stat-box-value">{(adv.def != null ? Number(adv.def).toFixed(1) : null) || '-'}</div>
                                        </div>
                                        <div className="stat-box">
                                            <div className="stat-box-title">UZR</div>
                                            <div className="stat-box-value">{(adv.uzr != null ? Number(adv.uzr).toFixed(1) : null) || '-'}</div>
                                        </div>
                                        <div className="stat-box">
                                            <div className="stat-box-title">DRS</div>
                                            <div className="stat-box-value">{adv.drs || '-'}</div>
                                        </div>
                                        <div className="stat-box">
                                            <div className="stat-box-title">OAA</div>
                                            <div className="stat-box-value">{adv.oaa || '-'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'GAMES' && (
                            <div className="metal-panel">
                                <div className="panel-title flex items-center"><Swords size={14} className="mr-2 text-[#00D4FF]" /> Recent & Upcoming Games</div>
                                <div className="flex flex-col gap-2 mt-4">
                                    {games.length > 0 ? (
                                        games.map((game: any) => {
                                            const dateLabel = game.official_date
                                                ? new Date(`${game.official_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                                : 'TBD';
                                            const timeLabel = game.first_pitch_utc
                                                ? new Date(game.first_pitch_utc).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET'
                                                : 'TBD';
                                            return (
                                                <div key={game.game_pk} className="p-4 border border-[#3d4f5f] rounded bg-[rgba(0,0,0,0.3)] flex justify-between items-center gap-3 hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <div className="text-[14px] font-bold text-white tracking-wider truncate">
                                                            <span className="text-slate-500">{game.is_home ? 'vs' : '@'}</span> {game.opponent || (game.is_home ? game.away_team : game.home_team)}
                                                        </div>
                                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                            {dateLabel}{game.final ? ` · ${game.status}` : ` · ${timeLabel}`}
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex items-center gap-3 flex-shrink-0">
                                                        {game.final && game.team_score != null && game.opp_score != null ? (
                                                            <>
                                                                {game.result && (
                                                                    <span className={`text-[11px] font-black w-5 h-5 flex items-center justify-center rounded ${game.result === 'W' ? 'bg-[rgba(34,197,94,0.15)] text-[#22C55E]' : 'bg-[rgba(239,68,68,0.15)] text-[#EF4444]'}`}>
                                                                        {game.result}
                                                                    </span>
                                                                )}
                                                                <span className="text-[16px] font-extrabold text-white tabular-nums">
                                                                    {game.team_score}-{game.opp_score}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <span className="text-[11px] font-bold text-[#00D4FF] uppercase tracking-widest">{game.status || 'Scheduled'}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="p-6 text-center text-slate-500 text-[11px] font-bold uppercase tracking-widest">No games found</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'PROPS' && (
                            <div className="metal-panel">
                                <div className="panel-title flex items-center"><Target size={14} className="mr-2 text-[#00D4FF]" /> Active Prop Edges</div>
                                <div className="flex flex-col gap-2 mt-4">
                                    {props.length > 0 ? (
                                        props.map((prop: any, idx: number) => {
                                            const label = String(prop.prop_type || prop.prop || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                                            const lineLabel = prop.line != null ? `${prop.side ? prop.side + ' ' : ''}${prop.line}` : (prop.side || '');
                                            return (
                                                <div key={idx} className="p-4 border border-[#3d4f5f] rounded bg-[rgba(0,0,0,0.3)] flex justify-between items-center gap-3 hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <div className="text-[14px] font-bold text-white tracking-wider truncate">
                                                            {prop.player_name}
                                                        </div>
                                                        <div className="text-[10px] font-bold text-[#00D4FF] uppercase tracking-widest truncate">
                                                            {label}{lineLabel ? ` · ${lineLabel}` : ''}
                                                        </div>
                                                        {prop.ev_pct != null && (
                                                            <div className="text-[10px] font-bold text-slate-500 tracking-widest">
                                                                EV {prop.ev_pct > 0 ? '+' : ''}{Number(prop.ev_pct).toFixed(1)}%{prop.edge_pts != null ? ` · ${Number(prop.edge_pts).toFixed(1)} edge` : ''}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-shrink-0">
                                                        {prop.p_win != null && prop.price != null
                                                            ? <BetScoreBadge pWin={prop.p_win} price={prop.price} pMarket={prop.p_market} />
                                                            : <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Awaiting price</span>}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="p-6 text-center text-slate-500 text-[11px] font-bold uppercase tracking-widest">No active props found for this team</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
