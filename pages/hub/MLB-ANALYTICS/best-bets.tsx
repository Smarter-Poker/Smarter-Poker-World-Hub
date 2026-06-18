import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ChevronDown, ChevronUp, Info, TrendingUp, TrendingDown, SearchX, CalendarX, Loader2 } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const BetCard = ({ bet, isExpanded, onToggle }: any) => {
    // Correct odds formatting for all types (+125, -110, "+125")
    const formatOdds = (o: any) => {
        if (!o) return '';
        const num = Number(o);
        if (isNaN(num)) return o; // already formatted string
        return num > 0 ? `+${num}` : `${num}`;
    };
    
    // Tier Colors - Metallic Future UI
    const isElite = bet.bet_tier === 'ELITE';
    const tierColorClass = isElite 
        ? 'text-[#FF00FF] drop-shadow-[0_0_5px_rgba(255,0,255,0.5)]' 
        : (bet.bet_tier === 'STRONG' ? 'text-[#00D4FF] drop-shadow-[0_0_5px_rgba(0,212,255,0.5)]' : 'text-[#FFD700] drop-shadow-[0_0_5px_rgba(255,215,0,0.5)]');
    
    // Formatting line safely - only add '+' for run lines/spreads
    let lineStr = '';
    if (bet.line !== null && bet.line !== undefined) {
        const numLine = Number(bet.line);
        const type = bet.bet_type?.toLowerCase() || '';
        const isSpread = type === 'run_line' || type === 'runline' || type === 'spread';
        
        if (isSpread && numLine > 0) {
            lineStr = `+${numLine}`;
        } else {
            lineStr = `${numLine}`;
        }
    }

    return (
        <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-[#00D4FF] group">
            <div className="p-4 cursor-pointer touch-manipulation relative z-10" onClick={onToggle}>
                <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 pr-2">
                        <div className="text-[10px] font-bold text-slate-400 mb-1 tracking-widest uppercase">{bet.matchup}</div>
                        <div className="text-lg font-extrabold text-white leading-tight uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                            {bet.selection} {lineStr}
                        </div>
                    </div>
                    <div className="text-right flex-shrink-0 bg-[#1a2332] border border-[#3d4f5f] px-3 py-1.5 rounded-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                        <div className={`text-xl font-extrabold ${tierColorClass}`} style={{ fontFamily: '"Rajdhani", sans-serif' }}>{bet.bet_score}</div>
                        <div className={`text-[9px] font-extrabold tracking-widest uppercase ${tierColorClass}`}>{bet.bet_tier}</div>
                    </div>
                </div>
                
                <div className="flex justify-between items-center bg-[#1a2332] p-2 rounded-sm border border-[#3d4f5f] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                    <div className="flex gap-4 flex-wrap">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Odds</span>
                            <span className="text-[13px] font-extrabold text-white tracking-wider">{formatOdds(bet.best_price)} <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">({bet.best_book})</span></span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Win Prob</span>
                            <span className="text-[13px] font-extrabold text-slate-300 tracking-wider">
                                {bet.win_confidence != null ? bet.win_confidence.toFixed(1) + '%' : 'N/A'}
                            </span>
                        </div>
                        {bet.ev_pct !== null && bet.ev_pct !== undefined && (
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">EV</span>
                                <span className={`text-[13px] font-extrabold tracking-wider ${Number(bet.ev_pct) > 0 ? 'text-[#00D4FF]' : 'text-slate-300'}`} style={Number(bet.ev_pct) > 0 ? { textShadow: '0 0 5px rgba(0,212,255,0.4)' } : {}}>
                                    {Number(bet.ev_pct) > 0 ? '+' : ''}{Number(bet.ev_pct).toFixed(1)}%
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="text-[#00D4FF] pl-2 group-hover:scale-110 transition-transform">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                </div>
            </div>

            {isExpanded && bet.score_factors && (
                <div className="p-4 bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-t border-[#3d4f5f] relative z-0 shadow-[inset_0_2px_10px_rgba(0,0,0,0.3)]">
                    <div className="text-[11px] font-extrabold text-[#00D4FF] mb-3 uppercase tracking-widest border-b border-[#3d4f5f] pb-1">
                        {bet.score_verdict || "Analysis"}
                    </div>
                    <div className="flex flex-col gap-2">
                        {bet.score_factors.map((factor: any, i: number) => (
                            <div key={i} className="flex gap-2 items-start bg-[#1a2332] p-2 rounded-sm border border-[#2a3a4a]">
                                <div className="mt-0.5 flex-shrink-0 bg-[#0d1117] p-1 rounded-sm border border-[#3d4f5f]">
                                    {factor.dir === 'up' && <TrendingUp size={12} className="text-[#00D4FF]" />}
                                    {factor.dir === 'down' && <TrendingDown size={12} className="text-[#FF00FF]" />}
                                    {factor.dir === 'info' && <Info size={12} className="text-slate-400" />}
                                </div>
                                <div className="text-[11px] text-slate-300 leading-relaxed font-bold tracking-wide">
                                    {factor.text}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default function BestBetsPage() {
    const [filter, setFilter] = useState('ALL');
    const [expandedBetId, setExpandedBetId] = useState<number | null>(null);
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

    const { data, error, isLoading } = useSWR('/api/mlb/best-bets', fetcher, {
        refreshInterval: 60000,
    });

    const bets = data?.bets || [];
    const officialDate = data?.officialDate || null;
    const stats = data?.stats || { totalBets: 0, eliteBets: 0, topScore: 0, topLock: 0 };
    
    const isStale = !!(todayStr && officialDate && officialDate < todayStr);

    const filteredBets = bets.filter((b: any) => {
        if (filter === 'ALL') return true;
        const type = b.bet_type?.toLowerCase() || '';
        if (filter === 'ML' && (type === 'moneyline' || type === 'ml')) return true;
        if (filter === 'TOTAL' && type === 'total') return true;
        if (filter === 'RUN LINE' && (type === 'run_line' || type === 'runline')) return true;
        if (filter === 'PROPS' && type.includes('prop')) return true;
        return false;
    });

    return (
        <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
           <SEOHead 
               title="Best Bets | MLB Analytics" 
               description="Daily MLB Betting Edges Surfaced By AI Models."
               noIndex={true}
           />

           <UniversalHeader pageDepth={2} />

           <div className="bg-gradient-to-b from-[#0d1117] to-[#1a2332] border-b-[3px] border-[#3d4f5f] p-4 flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
               <div>
                  <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-1 text-[#00D4FF] text-[10px] font-extrabold no-underline tracking-widest uppercase hover:text-white transition-colors">
                     <ArrowLeft size={14} /> DASHBOARD
                  </Link>
                  <h1 className="m-0 mt-2 mb-0.5 text-2xl md:text-3xl font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>Best <span className="text-[#00D4FF]" style={{ textShadow: '0 0 10px rgba(0,212,255,0.4)' }}>Bets</span></h1>
                  <p className="m-0 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Ranked By Bet Score • {officialDate || todayStr || 'Loading...'}</p>
               </div>
               <div className="text-right bg-[#0a0a15] p-2 rounded-sm border border-[#3d4f5f] shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                  <div className="text-[#00D4FF] text-[11px] font-extrabold tracking-widest uppercase" style={{ textShadow: '0 0 5px rgba(0,212,255,0.3)' }}>MLB EDGE</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest border-t border-[#3d4f5f] pt-1 mt-1">SCORE 0–100</div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Value + Confidence</div>
               </div>
           </div>

           <div className="p-4 w-full max-w-2xl mx-auto box-border relative">
               {/* Background Glows */}
               <div className="absolute top-10 left-10 w-64 h-64 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[100px] opacity-[0.03] pointer-events-none"></div>
               <div className="absolute bottom-10 right-10 w-64 h-64 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[100px] opacity-[0.02] pointer-events-none"></div>

               {isStale && !isLoading && (
                   <div className="bg-[#1a2332] border-[3px] border-[#FFD700]/50 rounded-xl p-4 mb-5 shadow-[0_0_15px_rgba(255,215,0,0.1),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                       <div className="absolute top-0 left-0 w-1 h-full bg-[#FFD700]"></div>
                       <div className="text-[#FFD700] text-[13px] font-extrabold tracking-widest mb-1 flex items-center gap-2 uppercase">
                           <CalendarX size={16} /> STALE SLATE — NOT ACTIONABLE
                       </div>
                       <div className="text-slate-300 text-xs font-bold leading-snug tracking-wide">These Picks Are From {officialDate || "A Previous Date"}, Not Today ({todayStr}). Bets Are Hidden Until Today's Lines Post.</div>
                   </div>
               )}

               <div className="grid grid-cols-4 gap-3 mb-5 metric-grid">
                  <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-3 px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                     <div className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">BETS</div>
                     {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto mt-2 text-slate-400" /> : <div className="text-xl font-extrabold text-white mt-1" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{stats.totalBets}</div>}
                  </div>
                  <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-3 px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                     <div className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">ELITE</div>
                     {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto mt-2 text-[#FF00FF]" /> : <div className="text-xl font-extrabold text-[#FF00FF] mt-1 drop-shadow-[0_0_5px_rgba(255,0,255,0.5)]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{stats.eliteBets}</div>}
                  </div>
                  <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-3 px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                     <div className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">TOP SCORE</div>
                     {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto mt-2 text-[#00D4FF]" /> : <div className="text-xl font-extrabold text-[#00D4FF] mt-1 drop-shadow-[0_0_5px_rgba(0,212,255,0.5)]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{stats.topScore}</div>}
                  </div>
                  <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-lg py-3 px-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                     <div className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">TOP LOCK</div>
                     {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto mt-2 text-slate-300" /> : <div className="text-xl font-extrabold text-slate-300 mt-1" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{(stats.topLock || 0).toFixed(0)}%</div>}
                  </div>
               </div>

               <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                   <style dangerouslySetInnerHTML={{__html: `div::-webkit-scrollbar { display: none; }`}} />
                   {['ALL', 'ML', 'TOTAL', 'RUN LINE', 'PROPS'].map(f => (
                       <button 
                           key={f}
                           onClick={() => {
                               setFilter(f);
                               if(navigator.vibrate) try { navigator.vibrate(15); } catch(e){}
                           }}
                           className={`px-5 py-2 rounded-sm border-[2px] text-[10px] font-extrabold tracking-widest whitespace-nowrap cursor-pointer touch-manipulation transition-all uppercase ${
                               filter === f 
                               ? 'bg-[#1a2332] text-[#00D4FF] border-[#00D4FF] shadow-[0_0_10px_rgba(0,212,255,0.3)]' 
                               : 'bg-[#0d1117] text-slate-400 border-[#3d4f5f] hover:border-[#5a6a7a] hover:text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                           }`}
                       >
                           {f}
                       </button>
                   ))}
               </div>

               {isLoading ? (
                   <div className="text-center py-20 bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                       <Loader2 className="w-10 h-10 animate-spin text-[#00D4FF] mx-auto mb-4" />
                       <div className="text-[13px] font-extrabold text-[#00D4FF] tracking-widest uppercase animate-pulse">Running Analytics Models...</div>
                   </div>
               ) : isStale || filteredBets.length === 0 ? (
                   <div className="text-center py-16 px-5 bg-[#0d1117] border-[3px] border-dashed border-[#3d4f5f] rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                       <div className="mb-4 text-[#3d4f5f] flex justify-center drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                           {isStale || (filteredBets.length === 0 && filter === 'ALL') ? <CalendarX size={48} /> : <SearchX size={48} />}
                       </div>
                       <div className="text-[15px] font-extrabold text-white mb-2 uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                           {isStale || (filteredBets.length === 0 && filter === 'ALL') ? "No Qualifying Bets For Today." : "No Bets Found For This Filter."}
                       </div>
                       <div className="text-[11px] font-bold tracking-wide text-slate-400 leading-relaxed uppercase">
                           {isStale || (filteredBets.length === 0 && filter === 'ALL') ? "Model Is Respecting The Market." : "Try Selecting A Different Bet Type."}
                           <br />Edges Surface When The Model Sees Meaningful Divergence From The Closing Line.
                       </div>
                   </div>
               ) : (
                   <div className="flex flex-col gap-4">
                       {filteredBets.map((bet: any, idx: number) => (
                           <BetCard 
                               key={`${bet.game_pk}-${bet.selection}-${idx}`} 
                               bet={bet} 
                               isExpanded={expandedBetId === idx}
                               onToggle={() => {
                                   setExpandedBetId(expandedBetId === idx ? null : idx);
                                   if(navigator.vibrate) try { navigator.vibrate(10); } catch(e){}
                               }}
                           />
                       ))}
                   </div>
               )}

               <div className="mt-8 mb-4 p-4 bg-[#1a2332] border border-[#3d4f5f] rounded-sm text-[10px] font-bold tracking-wide text-slate-400 text-center leading-relaxed shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                   <strong className="text-[#00D4FF]">Analysis Only — Not Betting Advice.</strong> 
                   <br/>
                   <span className="uppercase text-slate-300">Bet Score (0–100)</span> Ranks VALUE (Expected Return + Confidence). 
                   <br/>
                   <span className="uppercase text-slate-300">Top Lock</span> = Most Likely To Win Regardless Of Price. 
                   <br/>
                   <span className="uppercase text-slate-300">EV%</span> = Expected Return Per $1. Stake = ¼-Kelly. An Edge Is No Guarantee.
               </div>
           </div>
           
           <BottomNavBar />
        </div>
    );
}
