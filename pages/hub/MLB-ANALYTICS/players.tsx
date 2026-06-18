import { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { ChevronRight, Search, X, AlertTriangle, Loader2 } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';

export interface PlayerProfile {
    player_id: number;
    full_name: string;
    team_id?: number;
    wrc_plus?: number;
    woba?: number;
    pa?: number;
    fip?: number;
    siera?: number;
    bf?: number;
}

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

const PlayerCard = ({ player, type }: { player: PlayerProfile, type: 'hitters' | 'pitchers' }) => {
    // Premium dynamic headshot using official MLB CDN
    const headshotUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.player_id}/headshot/67/current`;
    const [imgSrc, setImgSrc] = useState(headshotUrl);

    return (
        <Link href={`/hub/MLB-ANALYTICS/players/${player.player_id}`} className="block mb-3 group" style={{ textDecoration: 'none' }}>
            <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 flex items-center justify-between transition-all group-hover:border-[#00D4FF] group-hover:shadow-[0_0_15px_rgba(0,212,255,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] relative overflow-hidden">
                
                {/* Neon strip effect */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#3d4f5f] transition-all group-hover:bg-[#00D4FF] group-hover:shadow-[0_0_10px_rgba(0,212,255,0.8)]" />

                <div className="flex items-center gap-4 z-10 pl-2">
                    <div className="relative w-14 h-14">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                            src={imgSrc} 
                            onError={() => setImgSrc('/default-avatar.png')}
                            alt={player.full_name}
                            loading="lazy"
                            className="w-14 h-14 rounded-full object-cover bg-[#0d1117] border-[2px] border-[#3d4f5f] group-hover:border-[#00D4FF] transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_0_10px_rgba(0,212,255,0.2)]"
                        />
                        {player.team_id && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img 
                                src={`https://www.mlbstatic.com/team-logos/${player.team_id}.svg`} 
                                alt="Team Logo"
                                loading="lazy"
                                className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#0d1117] rounded-full p-0.5 border border-[#3d4f5f] shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                            />
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-extrabold text-white text-lg tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                            {player.full_name}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                            {type === 'pitchers' ? (
                                <>
                                    <span className="text-[#00D4FF] font-extrabold text-sm tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 5px rgba(0,212,255,0.4)' }}>
                                        FIP {player.fip != null ? Number(player.fip).toFixed(2) : 'N/A'}
                                    </span>
                                    <span className="text-slate-600 text-xs">|</span>
                                    <span className="text-slate-400 text-[11px] font-bold tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                        SIERA {player.siera != null ? Number(player.siera).toFixed(2) : 'N/A'}
                                    </span>
                                    <span className="text-slate-600 text-xs">|</span>
                                    <span className="text-slate-400 text-[11px] font-bold tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                        {player.bf || 0} BF
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="text-[#00D4FF] font-extrabold text-sm tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 5px rgba(0,212,255,0.4)' }}>
                                        wRC+ {player.wrc_plus != null ? Number(player.wrc_plus).toFixed(0) : 'N/A'}
                                    </span>
                                    <span className="text-slate-600 text-xs">|</span>
                                    <span className="text-slate-400 text-[11px] font-bold tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                        wOBA {player.woba != null ? Number(player.woba).toFixed(3) : 'N/A'}
                                    </span>
                                    <span className="text-slate-600 text-xs">|</span>
                                    <span className="text-slate-400 text-[11px] font-bold tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                        {player.pa || 0} PA
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className="w-8 h-8 rounded-full bg-[#1a2332] border border-[#3d4f5f] flex items-center justify-center shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)] z-10 group-hover:border-[#00D4FF] group-hover:bg-[#0d1117] transition-all">
                    <ChevronRight size={16} className="text-[#00D4FF]" style={{ filter: 'drop-shadow(0 0 2px rgba(0,212,255,0.5))' }} />
                </div>
            </div>
        </Link>
    );
};

export default function PlayersPage() {
    const { data, error, isLoading } = useSWR('/api/mlb/players', fetcher, {
        refreshInterval: 60000 // Poll every minute
    });

    const hitters = data?.hitters || [];
    const pitchers = data?.pitchers || [];
    const fetchError = error || data?.fetchError || data?.error;

    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('Regular Hitters');

    const filteredPlayers = useMemo(() => {
        let list: PlayerProfile[] = [];
        if (activeTab === 'Regular Hitters') {
            list = hitters.filter((h: PlayerProfile) => (h.pa || 0) >= 150);
        } else if (activeTab === 'Bench / Fringe') {
            list = hitters.filter((h: PlayerProfile) => (h.pa || 0) < 150);
        } else if (activeTab === 'Pitchers') {
            list = pitchers;
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            list = list.filter((p: PlayerProfile) => p.full_name?.toLowerCase().includes(query));
        }
        
        // Optimization: limit the initial render list to prevent DOM bloat on search
        return list.slice(0, 500); 
    }, [hitters, pitchers, activeTab, searchQuery]);

    const tabs = ['Regular Hitters', 'Bench / Fringe', 'Pitchers'];

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
           <SEOHead 
               title="Players Database | MLB Analytics" 
               description="Complete profiles for every MLB hitter and pitcher."
               noIndex={true}
           />

           <UniversalHeader pageDepth={2} />
           <MlbSubNav />

           <div className="p-4 w-full max-w-4xl mx-auto box-border relative">
               
               {/* Background Glows */}
               <div className="absolute top-20 right-0 w-96 h-96 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[120px] opacity-[0.03] pointer-events-none"></div>

               <div className="mb-6">
                   <h1 className="m-0 text-2xl md:text-3xl font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>
                       Player Database
                   </h1>
                   <p className="mt-2 text-sm text-slate-400 font-bold tracking-wide">
                       Complete profiles for every MLB hitter and pitcher. Access situational splits, recent form, and advanced metrics.
                   </p>
               </div>

               <div className="relative mb-6">
                   <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00D4FF] flex pointer-events-none">
                       <Search size={18} style={{ filter: 'drop-shadow(0 0 2px rgba(0,212,255,0.5))' }} />
                   </div>
                   <input 
                       type="text" 
                       inputMode="search"
                       placeholder="SEARCH PLAYERS BY NAME..." 
                       value={searchQuery}
                       onChange={e => setSearchQuery(e.target.value)}
                       className="w-full bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-3 pl-12 pr-12 text-white font-extrabold text-sm tracking-widest uppercase focus:outline-none focus:border-[#00D4FF] focus:shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all placeholder:text-slate-600"
                   />
                   {searchQuery && (
                       <button 
                           onClick={() => setSearchQuery('')}
                           className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                       >
                           <X size={18} />
                       </button>
                   )}
               </div>

               <div className="flex flex-col md:flex-row gap-2 mb-6 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                   <style jsx>{`
                       div::-webkit-scrollbar { display: none; }
                   `}</style>
                   {tabs.map(tab => (
                       <button 
                           key={tab}
                           onClick={() => { setActiveTab(tab); setSearchQuery(''); }}
                           className={`w-full md:w-auto px-4 py-3 md:py-2 rounded-md font-extrabold text-[13px] md:text-[11px] uppercase tracking-widest whitespace-nowrap transition-all ${
                               activeTab === tab 
                                   ? 'bg-gradient-to-b from-[#00D4FF]/20 to-[#1a2332] border-[2px] border-[#00D4FF] text-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3),inset_0_2px_4px_rgba(255,255,255,0.1)]' 
                                   : 'bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-[2px] border-[#3d4f5f] text-slate-500 shadow-[inset_0_2px_4px_rgba(255,255,255,0.05)] hover:border-[#4b637a]'
                           }`}
                           style={{ fontFamily: '"Rajdhani", sans-serif' }}
                       >
                           {tab}
                       </button>
                   ))}
               </div>

               {fetchError && (
                   <div className="bg-gradient-to-b from-red-500/10 to-[#0d1117] border-[2px] border-red-500/50 rounded-xl p-4 mb-6 flex items-center gap-4">
                       <div className="w-10 h-10 rounded-full bg-[#0d1117] border-[2px] border-red-500 flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                           <AlertTriangle className="text-red-500 w-5 h-5" />
                       </div>
                       <div>
                           <div className="text-red-500 font-extrabold text-sm uppercase tracking-widest" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</div>
                           <div className="text-red-300/70 text-xs font-bold tracking-wide mt-1">Data transmission failed. Attempting to reconnect...</div>
                       </div>
                   </div>
               )}

               <div className="flex flex-col">
                   {isLoading ? (
                        <div className="text-center py-20 bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                            <Loader2 className="w-10 h-10 animate-spin text-[#00D4FF] mx-auto mb-4" />
                            <div className="text-[13px] font-extrabold text-[#00D4FF] tracking-widest uppercase animate-pulse" style={{ fontFamily: '"Rajdhani", sans-serif' }}>LOADING DATA...</div>
                        </div>
                   ) : filteredPlayers.length > 0 ? (
                       filteredPlayers.map((player: PlayerProfile) => (
                           <PlayerCard 
                               key={player.player_id} 
                               player={player} 
                               type={activeTab === 'Pitchers' ? 'pitchers' : 'hitters'} 
                           />
                       ))
                   ) : (
                       !fetchError && (
                           <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-10 text-center flex flex-col items-center">
                               <div className="w-16 h-16 rounded-full bg-[#0d1117] border-[2px] border-[#3d4f5f] flex items-center justify-center mb-4 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
                                   <Search size={28} className="text-[#3d4f5f]" />
                               </div>
                               <div className="text-slate-400 font-extrabold text-sm tracking-widest uppercase mb-4" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                   NO PLAYERS FOUND MATCHING "{searchQuery}"
                               </div>
                               {searchQuery && (
                                   <button 
                                       onClick={() => setSearchQuery('')}
                                       className="bg-[#1a2332] text-white border border-[#3d4f5f] px-4 py-2 rounded-sm text-[10px] font-extrabold tracking-widest uppercase hover:bg-[#3d4f5f] transition-colors"
                                   >
                                       CLEAR QUERY
                                   </button>
                               )}
                           </div>
                       )
                   )}
               </div>

           </div>
           
           <BottomNavBar />
        </div>
    );
}
