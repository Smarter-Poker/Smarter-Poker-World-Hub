import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, Activity, SearchX, CalendarX, Loader2, Radio } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
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

const GameCard = ({ game }: any) => {
    const isLive = game.status === 'Live' || game.status === 'In Progress';
    const isFinal = game.status === 'Final' || game.status === 'Completed';
    const isScheduled = game.status === 'Scheduled' || game.status === 'Preview';

    const statusColor = isLive 
        ? 'text-[#22C55E] drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]' 
        : (isFinal ? 'text-slate-400' : 'text-[#00D4FF]');

    return (
        <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-[#00D4FF] group">
            <div className="p-4 relative z-10">
                <div className="flex justify-between items-start mb-3 border-b border-[#3d4f5f] pb-3">
                    <div className="flex flex-col gap-2 w-full">
                        <div className="flex justify-between items-center w-full">
                            <span className="text-[14px] font-extrabold text-white tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                {game.away_team_abbr || 'Away'}
                            </span>
                            <span className="text-[16px] font-extrabold text-white">{game.away_score != null ? game.away_score : '-'}</span>
                        </div>
                        <div className="flex justify-between items-center w-full">
                            <span className="text-[14px] font-extrabold text-white tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                {game.home_team_abbr || 'Home'}
                            </span>
                            <span className="text-[16px] font-extrabold text-white">{game.home_score != null ? game.home_score : '-'}</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end justify-center w-[25%] bg-[#0f1520] border-l border-[#2a3a4a] px-3">
                        <div className={`text-[11px] font-bold tracking-widest uppercase mb-1 ${isLive ? 'text-[#FF00FF]' : isFinal ? 'text-slate-400' : 'text-[#00D4FF]'}`}>
                            {game.status || 'Scheduled'}
                        </div>
                        <div className="text-[14px] font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                            {isLive ? `${game.is_top_inning ? 'Top' : 'Bot'} ${game.inning || ''}` : (isFinal ? 'F' : (game.start_time ? new Date(game.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'TBD'))}
                        </div>
                    </div>
                </div>
                
                <div className="flex justify-between items-center bg-[#1a2332] p-2 rounded-sm border border-[#3d4f5f] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                    <div className="flex gap-4 flex-wrap w-full items-center justify-between">
                        <div className="flex flex-col">
                            <span className={`text-[11px] font-extrabold uppercase tracking-widest flex items-center gap-1 ${statusColor}`}>
                                {isLive && <Radio size={10} className="animate-pulse" />}
                                {game.status || 'Scheduled'}
                            </span>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Inning / Time</span>
                            <span className="text-[11px] font-extrabold text-slate-300 tracking-wider">
                                {isLive ? `${game.inning_state || ''} ${game.inning || ''}` : (isFinal ? 'F' : (game.start_time || 'TBD'))}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function TrackerPage() {
    const [filter, setFilter] = useState('ALL');
    const [todayStr, setTodayStr] = useState<string>('');

    useEffect(() => {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        setTodayStr(formatter.format(new Date()));
    }, []);

    // Fetch every 60 seconds as a fallback, rely on WebSockets for real-time
    const { data, error, isLoading, mutate } = useSWR('/api/mlb/tracker', fetcher, {
        refreshInterval: 60000,
    });

    useEffect(() => {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        
        if (!supabaseUrl || !supabaseAnonKey) return;
        
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const channel = supabase.channel('realtime:raw_games')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_games' }, () => {
                mutate();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [mutate]);

    if (error || data?.error) {
        logError('UI Error', error || (typeof data !== 'undefined' ? data?.error : null));
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Error" description="Data fetch failed" />
                <UniversalHeader pageDepth={2} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#FF00FF]/50 shadow-[0_0_20px_rgba(255,0,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
                        <Activity className="w-12 h-12 text-[#FF00FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(255,0,255,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF00FF] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load live data. Please try again later.</p>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    const games = data?.games || [];

    const filteredGames = games.filter((g: any) => {
        if (filter === 'ALL') return true;
        const status = g.status?.toLowerCase() || '';
        if (filter === 'LIVE' && (status === 'live' || status === 'in progress')) return true;
        if (filter === 'UPCOMING' && (status === 'scheduled' || status === 'preview')) return true;
        if (filter === 'FINAL' && (status === 'final' || status === 'completed')) return true;
        return false;
    });

    const liveCount = games.filter((g: any) => g.status === 'Live' || g.status === 'In Progress').length;
    const totalCount = games.length;

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
           <SEOHead 
               title="Live Tracker | MLB Analytics" 
               description="Real-time MLB Game Tracking & Edge Updates."
               noIndex={true}
           />

           <UniversalHeader pageDepth={2} />
           <MlbSubNav />

           <div className="bg-gradient-to-b from-[#0d1117] to-[#1a2332] border-b-[3px] border-[#3d4f5f] p-4 flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
               <div>
                  <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-1 text-[#22C55E] text-[10px] font-extrabold no-underline tracking-widest uppercase hover:text-white transition-colors">
                     <ArrowLeft size={14} /> DASHBOARD
                  </Link>
                  <h1 className="m-0 mt-2 mb-0.5 text-2xl md:text-3xl font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>Live <span className="text-[#22C55E]" style={{ textShadow: '0 0 10px rgba(34,197,94,0.4)' }}>Tracker</span></h1>
                  <p className="m-0 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Real-Time Scoreboard • {todayStr || 'Loading...'}</p>
               </div>
               <div className="text-right bg-[#0a0a15] p-2 rounded-sm border border-[#3d4f5f] shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] flex flex-col justify-center items-center">
                  <Activity className={`w-6 h-6 mb-1 ${liveCount > 0 ? 'text-[#22C55E] drop-shadow-[0_0_5px_rgba(34,197,94,0.5)] animate-pulse' : 'text-slate-500'}`} />
                  <div className={`text-[10px] font-extrabold tracking-widest uppercase ${liveCount > 0 ? 'text-[#22C55E]' : 'text-slate-500'}`}>
                      {liveCount > 0 ? 'GAMES LIVE' : 'NO GAMES LIVE'}
                  </div>
               </div>
           </div>

           <div className="p-4 w-full max-w-2xl mx-auto box-border relative">
               {/* Background Glows */}
               <div className="absolute top-10 right-10 w-64 h-64 bg-[#22C55E] rounded-full mix-blend-screen filter blur-[100px] opacity-[0.03] pointer-events-none"></div>

               <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                   <style dangerouslySetInnerHTML={{__html: `div::-webkit-scrollbar { display: none; }`}} />
                   {['ALL', 'LIVE', 'UPCOMING', 'FINAL'].map(f => (
                       <button 
                           key={f}
                           onClick={() => {
                               setFilter(f);
                               if(navigator.vibrate) try { navigator.vibrate(15); } catch(e){}
                           }}
                           className={`px-5 py-2 rounded-sm border-[2px] text-[10px] font-extrabold tracking-widest whitespace-nowrap cursor-pointer touch-manipulation transition-all uppercase ${
                               filter === f 
                               ? 'bg-[#1a2332] text-[#22C55E] border-[#22C55E] shadow-[0_0_10px_rgba(34,197,94,0.3)]' 
                               : 'bg-[#0d1117] text-slate-400 border-[#3d4f5f] hover:border-[#5a6a7a] hover:text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                           }`}
                       >
                           {f}
                       </button>
                   ))}
               </div>

               {isLoading && !data ? (
                   <div className="text-center py-20 bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                       <Loader2 className="w-10 h-10 animate-spin text-[#22C55E] mx-auto mb-4" />
                       <div className="text-[13px] font-extrabold text-[#22C55E] tracking-widest uppercase animate-pulse">CONNECTING TO FEED...</div>
                   </div>
               ) : filteredGames.length === 0 ? (
                   <div className="text-center py-16 px-5 bg-[#0d1117] border-[3px] border-dashed border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                       <div className="mb-4 text-[#3d4f5f] flex justify-center drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                           <SearchX size={48} />
                       </div>
                       <div className="text-[15px] font-extrabold text-white mb-2 uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                           {filter === 'ALL' ? "No Games Scheduled Today." : `No ${filter} Games Found.`}
                       </div>
                   </div>
               ) : (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {filteredGames.map((game: any, idx: number) => (
                           <GameCard 
                               key={`game-${idx}`} 
                               game={game} 
                           />
                       ))}
                   </div>
               )}

               <div className="mt-8 mb-4 p-4 bg-[#1a2332] border border-[#3d4f5f] rounded-sm text-[10px] font-bold tracking-wide text-slate-400 text-center leading-relaxed shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                   <strong className="text-[#22C55E]">Real-Time WebSockets Active.</strong> 
                   <br/>
                   <span className="uppercase text-slate-300">Data Feed</span> provided by MLB Stats API via Supabase `fct_games`.
               </div>
           </div>
           
           <BottomNavBar />
        </div>
    );
}
