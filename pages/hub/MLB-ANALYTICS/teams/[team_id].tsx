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
import { ChevronLeft, Activity, Shield, TrendingUp, AlertTriangle } from 'lucide-react';
import { logError } from '@/utils/logger';

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
                src={`https://nscdmxldtyszyvcxxwgr.supabase.co/storage/v1/object/public/team-logos/${teamId}.svg`} 
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

    const { data, error, isValidating } = useSWR('/api/mlb/teams', fetcher, {
        refreshInterval: 60000,
        revalidateOnFocus: true,
    });

    if (error) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Team Detail - Error" description="Data fetch failed" />
                <UniversalHeader pageDepth={3} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#FF00FF]/50 shadow-[0_0_20px_rgba(255,0,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
                        <Shield className="w-12 h-12 text-[#FF00FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(255,0,255,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF00FF] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load Team Details. Please try again later.</p>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    if (!data && isValidating) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200 flex flex-col">
                <UniversalHeader pageDepth={3} />
                <MlbSubNav />
                <div className="flex-1 flex items-center justify-center">
                    <Activity className="w-12 h-12 text-[#00D4FF] animate-pulse" />
                </div>
                <BottomNavBar />
            </div>
        );
    }

    const team = data?.teams?.find((t: any) => t.team_id === team_id);

    if (!team && data) {
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200 flex flex-col">
                <UniversalHeader pageDepth={3} />
                <MlbSubNav />
                <div className="flex-1 flex flex-col items-center justify-center p-4">
                    <h2 className="text-xl font-bold text-white mb-4">Team Not Found</h2>
                    <Link href="/hub/MLB-ANALYTICS/teams" className="text-[#00D4FF] underline">Return to Teams</Link>
                </div>
                <BottomNavBar />
            </div>
        );
    }

    const adv = team?.adv_stats || {};
    const hasEdge = team?.has_active_edge;

    return (
        <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
            <SEOHead title={`Smarter.Poker | MLB Team | ${team?.name || 'Loading...'}`} description={`Advanced MLB analytics for ${team?.name}`} />
            <UniversalHeader pageDepth={3} />
            <MlbSubNav />
            
            <style dangerouslySetInnerHTML={{__html: `
                :root {
                    --metal-dark: #0a0a15;
                    --metal-medium: #151a25;
                    --metal-light: #232d3d;
                    --metal-highlight: #3d4f5f;
                    --neon-cyan: #00D4FF;
                    --neon-cyan-dim: rgba(0, 212, 255, 0.15);
                    --neon-magenta: #FF00FF;
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
                                    {hasEdge && (
                                        <span className="text-[10px] bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E] px-2 py-1 rounded tracking-widest font-black flex items-center">
                                            <AlertTriangle size={12} className="mr-1" /> EDGE DETECTED
                                        </span>
                                    )}
                                </h1>
                                <div className="text-[#00D4FF] font-bold tracking-widest text-sm mb-4">
                                    {team.league} • {team.division}
                                </div>
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

                        {/* Detailed Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            
                            {/* Value & Overall */}
                            <div className="metal-panel">
                                <div className="panel-title flex items-center"><TrendingUp size={14} className="mr-2 text-[#00D4FF]" /> OVERALL VALUE (WAR)</div>
                                <div className="stat-grid">
                                    <div className="stat-box">
                                        <div className="stat-box-title">HITTING WAR</div>
                                        <div className="stat-box-value text-[#F472B6]">{adv.hitting_war?.toFixed(1) || '-'}</div>
                                    </div>
                                    <div className="stat-box">
                                        <div className="stat-box-title">PITCHING WAR</div>
                                        <div className="stat-box-value text-[#60A5FA]">{adv.pitching_war?.toFixed(1) || '-'}</div>
                                    </div>
                                    <div className="stat-box" style={{ background: 'rgba(0, 212, 255, 0.1)', borderColor: '#00D4FF' }}>
                                        <div className="stat-box-title text-[#00D4FF]">TOTAL WAR</div>
                                        <div className="stat-box-value text-white">
                                            {((adv.hitting_war || 0) + (adv.pitching_war || 0)).toFixed(1)}
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
                                        <div className="stat-box-value">{adv.era?.toFixed(2) || '-'}</div>
                                    </div>
                                    <div className="stat-box">
                                        <div className="stat-box-title">FIP</div>
                                        <div className="stat-box-value">{adv.fip?.toFixed(2) || '-'}</div>
                                    </div>
                                    <div className="stat-box">
                                        <div className="stat-box-title">xFIP</div>
                                        <div className="stat-box-value">{adv.xfip?.toFixed(2) || '-'}</div>
                                    </div>
                                    <div className="stat-box">
                                        <div className="stat-box-title">SIERA</div>
                                        <div className="stat-box-value text-[#FCD34D]">{adv.siera?.toFixed(2) || '-'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Hitting Metrics */}
                            <div className="metal-panel">
                                <div className="panel-title flex items-center"><Activity size={14} className="mr-2 text-[#F472B6]" /> HITTING METRICS</div>
                                <div className="stat-grid">
                                    <div className="stat-box">
                                        <div className="stat-box-title">AVG</div>
                                        <div className="stat-box-value">{adv.avg?.toFixed(3).replace(/^0/, '') || '-'}</div>
                                    </div>
                                    <div className="stat-box">
                                        <div className="stat-box-title">OPS</div>
                                        <div className="stat-box-value text-[#34D399]">{adv.ops?.toFixed(3).replace(/^0/, '') || '-'}</div>
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
                                        <div className="stat-box-value">{adv.def?.toFixed(1) || '-'}</div>
                                    </div>
                                    <div className="stat-box">
                                        <div className="stat-box-title">UZR</div>
                                        <div className="stat-box-value">{adv.uzr?.toFixed(1) || '-'}</div>
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
                    </>
                )}
            </main>
        </div>
    );
}
