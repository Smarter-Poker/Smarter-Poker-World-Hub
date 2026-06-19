import { useRouter } from 'next/router';
import { useState, useMemo, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { ChevronRight, Search, X, AlertTriangle, Loader2, Activity } from 'lucide-react';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';
import { logError } from '@/utils/logger';

const fuzzyMatch = (str: string, query: string) => {
    if (!query) return true;
    if (!str) return false;
    let i = 0, j = 0;
    const s = str.toLowerCase();
    const q = query.toLowerCase();
    while (i < s.length && j < q.length) {
        if (s[i] === q[j]) j++;
        i++;
    }
    return j === q.length;
};

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

    useEffect(() => {
        setImgSrc(headshotUrl);
    }, [headshotUrl]);

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
    const router = useRouter();
    const { data, error, isLoading } = useSWR('/api/mlb/players', fetcher, {
        refreshInterval: 60000 // Poll every minute
    });

    const EMPTY_ARRAY: any[] = [];
    const hitters = data?.hitters || EMPTY_ARRAY;
    const pitchers = data?.pitchers || EMPTY_ARRAY;
    const fetchError = error || data?.fetchError || data?.error;

    const [searchQuery, setSearchQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeTab, setActiveTab] = useState('Regular Hitters');
    const [selectedTeam, setSelectedTeam] = useState<number | null>(null);

    const uniqueTeams = useMemo(() => {
        const teams = new Set<number>();
        hitters.forEach((p: PlayerProfile) => p.team_id && teams.add(p.team_id));
        pitchers.forEach((p: PlayerProfile) => p.team_id && teams.add(p.team_id));
        // Common MLB team IDs usually range from 108 to 158.
        return Array.from(teams).sort((a, b) => a - b);
    }, [hitters, pitchers]);

    const filteredPlayers = useMemo(() => {
        let list: PlayerProfile[] = [];
        if (activeTab === 'Regular Hitters') {
            list = hitters.filter((h: PlayerProfile) => (h.pa || 0) >= 150);
        } else if (activeTab === 'Bench / Fringe') {
            list = hitters.filter((h: PlayerProfile) => (h.pa || 0) < 150);
        } else if (activeTab === 'Pitchers') {
            list = pitchers;
        }

        if (selectedTeam) {
            list = list.filter((p: PlayerProfile) => p.team_id === selectedTeam);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.trim();
            list = list.filter((p: PlayerProfile) => fuzzyMatch(p.full_name || '', query));
            
            // Sort to put exact substring matches first
            const lowerQuery = query.toLowerCase();
            list.sort((a, b) => {
                const aExact = a.full_name?.toLowerCase().includes(lowerQuery) ? 1 : 0;
                const bExact = b.full_name?.toLowerCase().includes(lowerQuery) ? 1 : 0;
                return bExact - aExact;
            });
        }
        
        return list; 
    }, [hitters, pitchers, activeTab, searchQuery, selectedTeam]);

    const DISPLAY_LIMIT = 50;
    const isCapped = !selectedTeam && filteredPlayers.length > DISPLAY_LIMIT;
    const visiblePlayers = isCapped ? filteredPlayers.slice(0, DISPLAY_LIMIT) : filteredPlayers;
    const suggestions = searchQuery.length >= 3 ? filteredPlayers.slice(0, 5) : [];

    const tabs = ['Regular Hitters', 'Bench / Fringe', 'Pitchers'];

    const hasError = !!error || !!fetchError;

    if (hasError) {
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
                        <p className="text-[#FF00FF] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load data. Please try again later.</p>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

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
                       onFocus={() => setShowSuggestions(true)}
                       onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                       onChange={e => {
                           setSearchQuery(e.target.value);
                           if (e.target.value && selectedTeam) setSelectedTeam(null);
                           setShowSuggestions(true);
                       }}
                       className="w-full bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-3 pl-12 pr-12 text-white font-extrabold text-sm tracking-widest uppercase focus:outline-none focus:border-[#00D4FF] focus:shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all placeholder:text-slate-600 relative z-20"
                   />
                   {(searchQuery || selectedTeam) && (
                       <button 
                           onClick={() => { setSearchQuery(''); setSelectedTeam(null); }}
                           className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#00D4FF] transition-colors flex items-center gap-1 text-[10px] font-extrabold tracking-widest uppercase z-30"
                       >
                           CLEAR <X size={14} />
                       </button>
                   )}
                   
                   {/* Suggestions Dropdown */}
                   {showSuggestions && searchQuery.length >= 3 && suggestions.length > 0 && (
                       <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[100] overflow-hidden divide-y divide-[#3d4f5f]">
                           <div className="px-4 py-2 bg-[#1a2332] text-slate-400 text-[10px] font-extrabold tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                               Top Suggestions
                           </div>
                           {suggestions.map(p => (
                               <Link 
                                   key={p.player_id} 
                                   href={`/hub/MLB-ANALYTICS/players/${p.player_id}`}
                                   className="flex items-center gap-3 p-3 hover:bg-[#1a2332] transition-colors group"
                                   style={{ textDecoration: 'none' }}
                               >
                                   {p.team_id ? (
                                       // eslint-disable-next-line @next/next/no-img-element
                                       <img src={`https://www.mlbstatic.com/team-logos/${p.team_id}.svg`} className="w-8 h-8 object-contain drop-shadow-md" alt="Team" />
                                   ) : (
                                       <div className="w-8 h-8 rounded-full bg-[#3d4f5f]" />
                                   )}
                                   <div className="flex flex-col">
                                       <span className="text-white font-extrabold tracking-widest text-sm uppercase group-hover:text-[#00D4FF] transition-colors" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                           {p.full_name}
                                       </span>
                                   </div>
                                   <ChevronRight size={16} className="ml-auto text-slate-500 group-hover:text-[#00D4FF] transition-colors" />
                               </Link>
                           ))}
                       </div>
                   )}
               </div>

               <div className="flex flex-col md:flex-row gap-2 mb-6 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                   <style jsx>{`
                       div::-webkit-scrollbar { display: none; }
                   `}</style>
                   {tabs.map(tab => (
                       <button 
                           key={tab}
                           onClick={() => { setActiveTab(tab); }}
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
                    <div className="bg-gradient-to-b from-[#FF00FF]/10 to-[#0d1117] border-[2px] border-[#FF00FF]/50 rounded-xl p-4 mb-6 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#0d1117] border-[2px] border-[#FF00FF] flex items-center justify-center shadow-[0_0_10px_rgba(255,0,255,0.5)]">
                            <AlertTriangle className="text-[#FF00FF] w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-[#FF00FF] font-extrabold text-sm uppercase tracking-widest" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</div>
                            <div className="text-[#FF00FF]/70 text-xs font-bold tracking-wide mt-1">Data transmission failed. Attempting to reconnect...</div>
                       </div>
                   </div>
               )}

               <div className="flex flex-col">
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 flex items-center justify-between animate-pulse shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                                    <div className="flex items-center gap-4 pl-2">
                                        <div className="w-14 h-14 rounded-full bg-[#3d4f5f]"></div>
                                        <div className="flex flex-col gap-2">
                                            <div className="h-5 w-32 bg-[#3d4f5f] rounded"></div>
                                            <div className="h-3 w-48 bg-[#3d4f5f] rounded"></div>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-[#3d4f5f]"></div>
                                </div>
                            ))}
                        </div>
                    ) : !searchQuery && !selectedTeam ? (
                        <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]">
                            <h2 className="text-sm font-extrabold text-white mb-6 uppercase tracking-widest text-center" style={{ fontFamily: '"Rajdhani", sans-serif' }}>Select a Team</h2>
                            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-4">
                                {uniqueTeams.map((teamId) => (
                                    <button
                                        key={teamId}
                                        onClick={() => setSelectedTeam(teamId)}
                                        className="aspect-square bg-[#1a2332] border-[2px] border-[#3d4f5f] rounded-xl p-2 hover:border-[#00D4FF] hover:bg-[#0d1117] hover:shadow-[0_0_15px_rgba(0,212,255,0.4),inset_0_2px_10px_rgba(0,0,0,0.5)] transition-all flex flex-col items-center justify-center group relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 w-8 h-8 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[15px] opacity-0 group-hover:opacity-40 transition-opacity"></div>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img 
                                            src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`} 
                                            alt={`Team ${teamId}`}
                                            className="w-10 h-10 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] group-hover:scale-110 transition-transform duration-300"
                                            loading="lazy"
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : visiblePlayers.length > 0 ? (
                        <div className="space-y-3">
                            {visiblePlayers.map((player: PlayerProfile) => (
                                <PlayerCard 
                                    key={player.player_id} 
                                    player={player} 
                                    type={activeTab === 'Pitchers' ? 'pitchers' : 'hitters'} 
                                />
                            ))}
                            
                            {isCapped && (
                                <div className="text-center py-6 pb-8 text-slate-500 font-extrabold text-[11px] tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                    Showing Top {DISPLAY_LIMIT} Results. Keep Typing To Refine Your Search.
                                </div>
                            )}
                        </div>
                    ) : (
                        !fetchError && (
                            <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-10 text-center flex flex-col items-center">
                                <div className="w-16 h-16 rounded-full bg-[#0d1117] border-[2px] border-[#3d4f5f] flex items-center justify-center mb-4 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
                                    <Search size={28} className="text-[#3d4f5f]" />
                                </div>
                                <div className="text-slate-400 font-extrabold text-sm tracking-widest uppercase mb-4" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                    {searchQuery ? `NO PLAYERS FOUND MATCHING "${searchQuery}"` : "NO PLAYERS FOUND FOR THIS TEAM"}
                                </div>
                                <button 
                                    onClick={() => { setSearchQuery(''); setSelectedTeam(null); }}
                                    className="bg-[#1a2332] text-[#00D4FF] border border-[#00D4FF] px-6 py-2 rounded-sm text-[12px] font-extrabold tracking-widest uppercase hover:bg-[#00D4FF]/10 transition-colors shadow-[0_0_10px_rgba(0,212,255,0.2)]"
                                >
                                    CLEAR FILTERS
                                </button>
                            </div>
                        )
                    )}
               </div>

           </div>
           
           <BottomNavBar />
        </div>
    );
}
