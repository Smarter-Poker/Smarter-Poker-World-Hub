import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';

import { ArrowLeft, Target, SearchX, CalendarX, Loader2, Activity } from 'lucide-react';
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

const PropCard = ({ prop }: any) => {
    // Format odds
    const formatOdds = (o: any) => {
        if (!o) return '';
        const num = Number(o);
        if (isNaN(num)) return o;
        return num > 0 ? `+${num}` : `${num}`;
    };
    
    // Tier Colors - Metallic Future UI
    const isElite = prop.edge_pts >= 5;
    const tierColorClass = isElite 
        ? 'text-[#FF00FF] drop-shadow-[0_0_5px_rgba(255,0,255,0.5)]' 
        : (prop.edge_pts >= 3 ? 'text-[#00D4FF] drop-shadow-[0_0_5px_rgba(0,212,255,0.5)]' : 'text-[#FFD700] drop-shadow-[0_0_5px_rgba(255,215,0,0.5)]');

    return (
        <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-[#FF00FF] group">
            <div className="p-4 relative z-10">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 pr-2">
                        <div className="text-[10px] font-bold text-slate-400 mb-1 tracking-widest uppercase">{prop.team_abbr}</div>
                        <div className="text-lg font-extrabold text-white leading-tight uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                            {prop.player_name}
                        </div>
                        <div className="text-[12px] font-bold text-[#FF00FF] mt-0.5 tracking-wider uppercase">
                            {prop.prop_type} {prop.line !== null ? (Number(prop.line) > 0 && prop.prop_type.includes('Total') ? `O/U ${prop.line}` : prop.line) : ''}
                        </div>
                    </div>
                    <div className="text-right flex-shrink-0 bg-[#1a2332] border border-[#3d4f5f] px-3 py-1.5 rounded-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                        <div className={`text-xl font-extrabold ${tierColorClass}`} style={{ fontFamily: '"Rajdhani", sans-serif' }}>{prop.edge_pts != null ? Number(prop.edge_pts).toFixed(1) : '--'}</div>
                        <div className={`text-[9px] font-extrabold tracking-widest uppercase ${tierColorClass}`}>EDGE PTS</div>
                    </div>
                </div>
                
                <div className="flex justify-between items-center bg-[#1a2332] p-2 rounded-sm border border-[#3d4f5f] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                    <div className="flex gap-4 flex-wrap">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Odds</span>
                            <span className="text-[13px] font-extrabold text-white tracking-wider">
                                {formatOdds(Number(prop.model_proj) > Number(prop.line) ? prop.over_odds : prop.under_odds)}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Projection</span>
                            <span className="text-[13px] font-extrabold text-[#00D4FF] tracking-wider" style={{ textShadow: '0 0 5px rgba(0,212,255,0.4)' }}>
                                {prop.model_proj != null ? Number(prop.model_proj).toFixed(2) : 'N/A'}
                            </span>
                        </div>
                        {prop.ev_pct !== null && prop.ev_pct !== undefined && (
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">EV</span>
                                <span className={`text-[13px] font-extrabold tracking-wider ${Number(prop.ev_pct) > 0 ? 'text-[#22C55E]' : 'text-slate-300'}`}>
                                    {Number(prop.ev_pct) > 0 ? '+' : ''}{Number(prop.ev_pct).toFixed(1)}%
                                </span>
                            </div>
                        )}
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Win Prob</span>
                            <span className="text-[13px] font-extrabold text-slate-300 tracking-wider">
                                {prop.implied_prob != null ? (Number(prop.implied_prob) > 0 && Number(prop.implied_prob) <= 1 ? (Number(prop.implied_prob) * 100).toFixed(1) : Number(prop.implied_prob).toFixed(1)) + '%' : 'N/A'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function PropsPage() {
    const router = useRouter();
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

    const { data, error, isLoading, mutate } = useSWR('/api/mlb/props', fetcher, {
        refreshInterval: 60000,
    });

    if (error || data?.error) {
        logError('UI Error', error || (typeof data !== 'undefined' ? data?.error : null));
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Error" description="Data fetch failed" />
                <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
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

    const props = data?.props || [];
    
    // Check if props are from today (if official_date exists)
    // If official_date is missing, we assume they are live/valid unless empty.
    const isStale = props.length > 0 && props[0].official_date && props[0].official_date < todayStr;

    const filteredProps = props.filter((p: any) => {
        if (filter === 'ALL') return true;
        const market = p.market?.toLowerCase() || '';
        if (filter === 'STRIKEOUTS' && (market.includes('strikeout') || market.includes('so') || market === 'k')) return true;
        if (filter === 'HOME RUNS' && (market.includes('home run') || market.includes('hr'))) return true;
        if (filter === 'HITS' && market.includes('hit')) return true;
        if (filter === 'TOTAL BASES' && (market.includes('total base') || market.includes('tb'))) return true;
        return false;
    });

    const totalProps = props.length;
    const eliteProps = props.filter((p: any) => (p.edge_pts || 0) >= 5).length;

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
           <SEOHead 
               title="Player Props | MLB Analytics" 
               description="Daily MLB Player Prop Edges Surfaced By AI Models."
               noIndex={true}
           />

           <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
           <MlbSubNav />

           <div className="bg-gradient-to-b from-[#0d1117] to-[#1a2332] border-b-[3px] border-[#3d4f5f] p-4 flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
               <div>
                  <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-1 text-[#FF00FF] text-[10px] font-extrabold no-underline tracking-widest uppercase hover:text-white transition-colors">
                     <ArrowLeft size={14} /> DASHBOARD
                  </Link>
                  <h1 className="m-0 mt-2 mb-0.5 text-2xl md:text-3xl font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>Player <span className="text-[#FF00FF]" style={{ textShadow: '0 0 10px rgba(255,0,255,0.4)' }}>Props</span></h1>
                  <p className="m-0 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Ranked By Edge Points • {todayStr || 'Loading...'}</p>
               </div>
               <div className="text-right bg-[#0a0a15] p-2 rounded-sm border border-[#3d4f5f] shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] flex flex-col justify-center items-center">
                  <Target className="w-6 h-6 text-[#FF00FF] drop-shadow-[0_0_5px_rgba(255,0,255,0.5)] mb-1" />
                  <div className="text-[#FF00FF] text-[10px] font-extrabold tracking-widest uppercase">PROP TARGETS</div>
               </div>
           </div>

           <div className="p-4 w-full max-w-2xl mx-auto box-border relative">
               {/* Background Glows */}
               <div className="absolute top-10 right-10 w-64 h-64 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[100px] opacity-[0.03] pointer-events-none"></div>
               <div className="absolute bottom-10 left-10 w-64 h-64 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[100px] opacity-[0.03] pointer-events-none"></div>

               {isStale && !isLoading && (
                   <div className="bg-[#1a2332] border-[3px] border-[#FFD700]/50 rounded-xl p-4 mb-5 shadow-[0_0_15px_rgba(255,215,0,0.1),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                       <div className="absolute top-0 left-0 w-1 h-full bg-[#FFD700]"></div>
                       <div className="text-[#FFD700] text-[13px] font-extrabold tracking-widest mb-1 flex items-center gap-2 uppercase">
                           <CalendarX size={16} /> STALE SLATE — NOT ACTIONABLE
                       </div>
                       <div className="text-slate-300 text-xs font-bold leading-snug tracking-wide">These Props Are From A Previous Date. Bets Are Hidden Until Today's Lines Post.</div>
                   </div>
               )}

               <div className="grid grid-cols-2 gap-3 mb-5 metric-grid">
                  <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-3 px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                     <div className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">TOTAL PROPS</div>
                     {isLoading && !data ? <Loader2 className="w-5 h-5 animate-spin mx-auto mt-2 text-[#00D4FF]" /> : <div className="text-xl font-extrabold text-white mt-1" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{totalProps}</div>}
                  </div>
                  <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-3 px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                     <div className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">ELITE PROPS (&gt;5.0)</div>
                     {isLoading && !data ? <Loader2 className="w-5 h-5 animate-spin mx-auto mt-2 text-[#FF00FF]" /> : <div className="text-xl font-extrabold text-[#FF00FF] mt-1 drop-shadow-[0_0_5px_rgba(255,0,255,0.5)]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{eliteProps}</div>}
                  </div>
               </div>

               <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                   <style dangerouslySetInnerHTML={{__html: `div::-webkit-scrollbar { display: none; }`}} />
                   {['ALL', 'STRIKEOUTS', 'HOME RUNS', 'HITS', 'TOTAL BASES'].map(f => (
                       <button 
                           key={f}
                           onClick={() => {
                               setFilter(f);
                               if(navigator.vibrate) try { navigator.vibrate(15); } catch(e){}
                           }}
                           className={`px-5 py-2 rounded-sm border-[2px] text-[10px] font-extrabold tracking-widest whitespace-nowrap cursor-pointer touch-manipulation transition-all uppercase ${
                               filter === f 
                               ? 'bg-[#1a2332] text-[#FF00FF] border-[#FF00FF] shadow-[0_0_10px_rgba(255,0,255,0.3)]' 
                               : 'bg-[#0d1117] text-slate-400 border-[#3d4f5f] hover:border-[#5a6a7a] hover:text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                           }`}
                       >
                           {f}
                       </button>
                   ))}
               </div>

               {isLoading && !data ? (
                   <div className="text-center py-20 bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                       <Loader2 className="w-10 h-10 animate-spin text-[#FF00FF] mx-auto mb-4" />
                       <div className="text-[13px] font-extrabold text-[#FF00FF] tracking-widest uppercase animate-pulse">SCANNING PROPS...</div>
                   </div>
               ) : isStale || filteredProps.length === 0 ? (
                   <div className="text-center py-16 px-5 bg-[#0d1117] border-[3px] border-dashed border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                       <div className="mb-4 text-[#3d4f5f] flex justify-center drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                           {isStale || (filteredProps.length === 0 && filter === 'ALL') ? <CalendarX size={48} /> : <SearchX size={48} />}
                       </div>
                       <div className="text-[15px] font-extrabold text-white mb-2 uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                           {isStale || (filteredProps.length === 0 && filter === 'ALL') ? "No Props Available." : "No Props Found For This Filter."}
                       </div>
                       <div className="text-[11px] font-bold tracking-wide text-slate-400 leading-relaxed uppercase">
                           {isStale || (filteredProps.length === 0 && filter === 'ALL') ? "Model Has Not Published Props Yet." : "Try Selecting A Different Prop Type."}
                           <br />Props Usually Release 3-4 Hours Before First Pitch.
                       </div>
                   </div>
               ) : (
                   <div className="flex flex-col gap-4">
                       {filteredProps.map((prop: any, idx: number) => (
                           <PropCard 
                               key={`prop-${idx}`} 
                               prop={prop} 
                           />
                       ))}
                   </div>
               )}

               <div className="mt-8 mb-4 p-4 bg-[#1a2332] border border-[#3d4f5f] rounded-sm text-[10px] font-bold tracking-wide text-slate-400 text-center leading-relaxed shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                   <strong className="text-[#FF00FF]">Analysis Only — Not Betting Advice.</strong> 
                   <br/>
                   <span className="uppercase text-slate-300">Edge Points</span> Measure Variance Between Projection & Market Line.
                   <br/>
                   <span className="uppercase text-slate-300">Win Prob</span> = Evaluated Likelihood of Prop Hitting.
                   <br/>
                   <span className="uppercase text-slate-300">EV%</span> = Expected Return Per $1.
               </div>
           </div>
           
           <BottomNavBar />
        </div>
    );
}
