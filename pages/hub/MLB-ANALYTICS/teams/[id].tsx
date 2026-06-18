import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { ArrowLeft, Loader2, Shield, Swords, Activity, MapPin, SearchX } from 'lucide-react';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../../src/components/seo/SEOHead';
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

export default function TeamDashboardPage() {
    const router = useRouter();
    const { id } = router.query;
    
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'GAMES' | 'PROPS'>('OVERVIEW');

    const { data, error, isLoading } = useSWR(id ? `/api/mlb/teams/${id}` : null, fetcher, {
        refreshInterval: 60000,
    });

    if (error || data?.error) {
        logError('UI Error', error || (typeof data !== 'undefined' ? data?.error : null));
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Error" description="Data fetch failed" />
                <UniversalHeader pageDepth={3} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#FF00FF]/50 shadow-[0_0_20px_rgba(255,0,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
                        <Activity className="w-12 h-12 text-[#FF00FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(255,0,255,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF00FF] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load team data. Please try again later.</p>
                        <Link href="/hub/MLB-ANALYTICS/teams" className="mt-6 inline-block bg-[#1a2332] text-white px-6 py-2 rounded-sm border border-[#3d4f5f] text-[10px] font-extrabold tracking-widest uppercase hover:bg-[#2a3a4a] relative z-10">
                            BACK TO TEAMS
                        </Link>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    const team = data?.team;
    const stats = data?.stats;
    const games = data?.games || [];
    const props = data?.props || [];

    const isMissingData = !isLoading && !team;

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
           <SEOHead 
               title={`${team?.name || 'Team'} Dashboard | MLB Analytics`} 
               description="Advanced MLB Team Intel & Projections."
               noIndex={true}
           />

           <UniversalHeader pageDepth={3} />
           <MlbSubNav />

           <div className="bg-gradient-to-b from-[#0d1117] to-[#1a2332] border-b-[3px] border-[#3d4f5f] p-4 flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
               <div>
                  <Link href="/hub/MLB-ANALYTICS/teams" className="inline-flex items-center gap-1 text-[#00D4FF] text-[10px] font-extrabold no-underline tracking-widest uppercase hover:text-white transition-colors">
                     <ArrowLeft size={14} /> ALL TEAMS
                  </Link>
                  {isLoading ? (
                      <div className="h-8 w-48 bg-[#1a2332] animate-pulse rounded mt-2"></div>
                  ) : (
                      <h1 className="m-0 mt-2 mb-0.5 text-2xl md:text-3xl font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>
                          {team?.name || id}
                      </h1>
                  )}
                  <p className="m-0 text-[10px] font-bold tracking-widest text-slate-400 uppercase flex items-center gap-1">
                      <MapPin size={10} /> {team?.league || 'MLB'} {team?.division ? `| ${team.division}` : ''}
                  </p>
               </div>
               <div className="text-right bg-[#0a0a15] p-2 rounded-sm border border-[#3d4f5f] shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] flex flex-col justify-center items-center">
                  <Shield className="w-6 h-6 text-[#00D4FF] drop-shadow-[0_0_5px_rgba(0,212,255,0.5)] mb-1" />
                  <div className="text-[#00D4FF] text-[10px] font-extrabold tracking-widest uppercase">INTEL HQ</div>
               </div>
           </div>

           <div className="p-4 w-full max-w-2xl mx-auto box-border relative">
               {/* Background Glows */}
               <div className="absolute top-10 right-10 w-64 h-64 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[100px] opacity-[0.03] pointer-events-none"></div>

               {isMissingData ? (
                   <div className="text-center py-16 px-5 bg-[#0d1117] border-[3px] border-dashed border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                       <div className="mb-4 text-[#3d4f5f] flex justify-center drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                           <SearchX size={48} />
                       </div>
                       <div className="text-[15px] font-extrabold text-white mb-2 uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                           Team Profile Not Found.
                       </div>
                   </div>
               ) : (
                   <>
                       <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                           <style dangerouslySetInnerHTML={{__html: `div::-webkit-scrollbar { display: none; }`}} />
                           {['OVERVIEW', 'GAMES', 'PROPS'].map((tab: any) => (
                               <button 
                                   key={tab}
                                   onClick={() => {
                                       setActiveTab(tab);
                                       if(navigator.vibrate) try { navigator.vibrate(15); } catch(e){}
                                   }}
                                   className={`px-5 py-2 rounded-sm border-[2px] text-[10px] font-extrabold tracking-widest whitespace-nowrap cursor-pointer touch-manipulation transition-all uppercase ${
                                       activeTab === tab 
                                       ? 'bg-[#1a2332] text-[#00D4FF] border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]' 
                                       : 'bg-[#0d1117] text-slate-400 border-[#3d4f5f] hover:border-[#5a6a7a] hover:text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                                   }`}
                               >
                                   {tab}
                               </button>
                           ))}
                       </div>

                       {isLoading ? (
                           <div className="text-center py-20 bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                               <Loader2 className="w-10 h-10 animate-spin text-[#00D4FF] mx-auto mb-4" />
                               <div className="text-[13px] font-extrabold text-[#00D4FF] tracking-widest uppercase animate-pulse">LOADING PROFILE...</div>
                           </div>
                       ) : (
                           <div className="flex flex-col gap-4">
                               {activeTab === 'OVERVIEW' && (
                                   <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]">
                                       <div className="bg-[#1a2332] p-3 border-b border-[#3d4f5f] flex items-center gap-2">
                                           <Activity size={16} className="text-[#00D4FF]" />
                                           <h3 className="m-0 text-[12px] font-extrabold tracking-widest uppercase text-white">Advanced Metrics</h3>
                                       </div>
                                       <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                                           {stats ? (
                                               <>
                                                   <div className="flex flex-col">
                                                       <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Team wOBA</span>
                                                       <span className="text-[16px] font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{stats.woba || 'N/A'}</span>
                                                   </div>
                                                   <div className="flex flex-col">
                                                       <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Team wRC+</span>
                                                       <span className="text-[16px] font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{stats.wrc_plus || 'N/A'}</span>
                                                   </div>
                                                   <div className="flex flex-col">
                                                       <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Team ERA</span>
                                                       <span className="text-[16px] font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{stats.era || 'N/A'}</span>
                                                   </div>
                                                   <div className="flex flex-col">
                                                       <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Team FIP</span>
                                                       <span className="text-[16px] font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{stats.fip || 'N/A'}</span>
                                                   </div>
                                               </>
                                           ) : (
                                               <div className="col-span-full text-center py-4 text-slate-500 text-[11px] font-bold uppercase tracking-widest">No advanced stats available</div>
                                           )}
                                       </div>
                                   </div>
                               )}

                               {activeTab === 'GAMES' && (
                                   <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]">
                                       <div className="bg-[#1a2332] p-3 border-b border-[#3d4f5f] flex items-center gap-2">
                                           <Swords size={16} className="text-[#00D4FF]" />
                                           <h3 className="m-0 text-[12px] font-extrabold tracking-widest uppercase text-white">Recent & Upcoming</h3>
                                       </div>
                                       <div className="p-0">
                                           {games.length > 0 ? (
                                               games.map((game: any, idx: number) => (
                                                   <div key={idx} className="p-3 border-b border-[#2a3a4a] flex justify-between items-center bg-[#0d1117] hover:bg-[#1a2332] transition-colors">
                                                       <div className="flex flex-col gap-1">
                                                           <div className="text-[12px] font-bold text-white tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                               {game.away_team || game.away_team_name || 'Away'} @ {game.home_team || game.home_team_name || 'Home'}
                                                           </div>
                                                           <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                                                               {game.status || 'Scheduled'} | {game.start_time || 'TBD'}
                                                           </div>
                                                       </div>
                                                       <div className="text-right">
                                                           <span className="text-[14px] font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                               {game.status === 'Final' || game.status === 'Completed' ? `${game.away_score} - ${game.home_score}` : '-'}
                                                           </span>
                                                       </div>
                                                   </div>
                                               ))
                                           ) : (
                                               <div className="p-6 text-center text-slate-500 text-[11px] font-bold uppercase tracking-widest">No recent games found</div>
                                           )}
                                       </div>
                                   </div>
                               )}

                               {activeTab === 'PROPS' && (
                                   <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]">
                                       <div className="bg-[#1a2332] p-3 border-b border-[#3d4f5f] flex items-center gap-2">
                                           <Target size={16} className="text-[#FF00FF]" />
                                           <h3 className="m-0 text-[12px] font-extrabold tracking-widest uppercase text-white">Active Prop Edges</h3>
                                       </div>
                                       <div className="p-0">
                                           {props.length > 0 ? (
                                               props.map((prop: any, idx: number) => (
                                                   <div key={idx} className="p-3 border-b border-[#2a3a4a] flex justify-between items-center bg-[#0d1117] hover:bg-[#1a2332] transition-colors">
                                                       <div className="flex flex-col gap-1">
                                                           <div className="text-[12px] font-bold text-white tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                               {prop.player_name}
                                                           </div>
                                                           <div className="text-[9px] font-bold text-[#FF00FF] uppercase tracking-widest">
                                                               {prop.market} {prop.line !== null ? (Number(prop.line) > 0 && prop.market.includes('Total') ? `O/U ${prop.line}` : prop.line) : ''}
                                                           </div>
                                                       </div>
                                                       <div className="text-right flex flex-col items-end">
                                                           <span className="text-[14px] font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                                               {prop.edge_pts != null ? Number(prop.edge_pts).toFixed(1) : '--'}
                                                           </span>
                                                           <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Edge Pts</span>
                                                       </div>
                                                   </div>
                                               ))
                                           ) : (
                                               <div className="p-6 text-center text-slate-500 text-[11px] font-bold uppercase tracking-widest">No active props found for this team</div>
                                           )}
                                       </div>
                                   </div>
                               )}
                           </div>
                       )}
                   </>
               )}
           </div>
           
           <BottomNavBar />
        </div>
    );
}
