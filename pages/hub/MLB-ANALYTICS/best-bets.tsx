import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Info, TrendingUp, TrendingDown, SearchX, CalendarX } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export async function getServerSideProps({ res }: any) {
    try {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        const mlbDb = getMlbSupabase();
        
        // Compute 'today' in America/Chicago
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayStr = formatter.format(new Date());

        // Find the latest official_date
        const { data: latestDateData, error: dateErr } = await mlbDb
            .from('pred_best_bets')
            .select('official_date')
            .order('official_date', { ascending: false })
            .limit(1);
            
        if (dateErr) throw dateErr;
        
        if (!latestDateData || latestDateData.length === 0) {
            return { props: { bets: [], officialDate: null, isStale: true, todayStr } };
        }
        
        const officialDate = latestDateData[0].official_date;
        
        // Fetch all bets for that date
        const { data: bets, error: betsErr } = await mlbDb
            .from('pred_best_bets')
            .select('*')
            .eq('official_date', officialDate)
            .order('rank', { ascending: true });
            
        if (betsErr) throw betsErr;
        
        const isStale = officialDate < todayStr;
        
        return {
            props: {
                bets: bets || [],
                officialDate,
                isStale,
                todayStr
            }
        };
    } catch (err) {
        console.error('Error fetching best bets:', err);
        // Fallback needs todayStr computed as well so UI doesn't crash on null
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayStr = formatter.format(new Date());
        return { props: { bets: [], officialDate: null, isStale: true, todayStr } };
    }
}

const BetCard = ({ bet, isExpanded, onToggle }: any) => {
    // Correct odds formatting for all types (+125, -110, "+125")
    const formatOdds = (o: any) => {
        if (!o) return '';
        const num = Number(o);
        if (isNaN(num)) return o; // already formatted string
        return num > 0 ? `+${num}` : `${num}`;
    };
    
    const tierColorClass = bet.bet_tier === 'ELITE' ? 'text-emerald-500' : (bet.bet_tier === 'STRONG' ? 'text-blue-500' : 'text-amber-500');
    
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
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <div className="p-3 cursor-pointer touch-manipulation" onClick={onToggle}>
                <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 pr-2">
                        <div className="text-[11px] font-bold text-slate-500 mb-0.5">{bet.matchup}</div>
                        <div className="text-[15px] font-extrabold text-slate-900 leading-tight">
                            {bet.selection} {lineStr}
                        </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                        <div className={`text-base font-extrabold ${tierColorClass}`}>{bet.bet_score}</div>
                        <div className={`text-[10px] font-extrabold tracking-widest ${tierColorClass}`}>{bet.bet_tier}</div>
                    </div>
                </div>
                
                <div className="flex justify-between items-center">
                    <div className="flex gap-3 flex-wrap">
                        <div>
                            <span className="text-[10px] text-slate-500">Odds: </span>
                            <span className="text-xs font-bold">{formatOdds(bet.best_price)}</span>
                            <span className="text-[10px] text-slate-400 ml-1">({bet.best_book})</span>
                        </div>
                        <div>
                            <span className="text-[10px] text-slate-500">Win: </span>
                            <span className="text-xs font-bold">{bet.win_confidence?.toFixed(1)}%</span>
                        </div>
                        {bet.ev_pct !== null && bet.ev_pct !== undefined && (
                            <div>
                                <span className="text-[10px] text-slate-500">EV: </span>
                                <span className={`text-xs font-bold ${Number(bet.ev_pct) > 0 ? 'text-emerald-500' : 'text-slate-900'}`}>
                                    {Number(bet.ev_pct) > 0 ? '+' : ''}{Number(bet.ev_pct).toFixed(1)}%
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="text-slate-400 pl-2">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                </div>
            </div>

            {isExpanded && bet.score_factors && (
                <div className="p-3 bg-slate-50 border-t border-slate-200">
                    <div className="text-xs font-bold text-slate-900 mb-2">
                        {bet.score_verdict || "Analysis"}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {bet.score_factors.map((factor: any, i: number) => (
                            <div key={i} className="flex gap-1.5 items-start">
                                <div className="mt-0.5 flex-shrink-0">
                                    {factor.dir === 'up' && <TrendingUp size={12} className="text-emerald-500" />}
                                    {factor.dir === 'down' && <TrendingDown size={12} className="text-red-500" />}
                                    {factor.dir === 'info' && <Info size={12} className="text-blue-500" />}
                                </div>
                                <div className="text-[11px] text-slate-600 leading-snug">
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

export default function BestBetsPage({ bets = [], officialDate, isStale, todayStr }: any) {
    const [filter, setFilter] = useState('ALL');
    const [expandedBetId, setExpandedBetId] = useState<number | null>(null);

    const totalBets = bets.length;
    const eliteBets = bets.filter((b: any) => b.bet_tier?.toUpperCase() === 'ELITE' || b.bet_score >= 80).length;
    const topScore = bets.length > 0 ? Math.max(...bets.map((b: any) => b.bet_score || 0)) : 0;
    const topLock = bets.length > 0 ? Math.max(...bets.map((b: any) => b.win_confidence || 0)) : 0;

    const filteredBets = bets.filter((b: any) => {
        if (filter === 'ALL') return true;
        const type = b.bet_type?.toLowerCase() || '';
        if (filter === 'ML' && (type === 'moneyline' || type === 'ml')) return true;
        if (filter === 'TOTAL' && type === 'total') return true;
        if (filter === 'RUN LINE' && (type === 'run_line' || type === 'runline')) return true;
        if (filter === 'PROPS' && type.startsWith('prop')) return true;
        return false;
    });

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
           <SEOHead 
               title="Best Bets | MLB Analytics" 
               description="Daily MLB betting edges surfaced by AI models."
               noIndex={true}
           />

           <UniversalHeader pageDepth={2} />

           <div className="bg-white border-b border-slate-200 p-4 flex justify-between items-center">
               <div>
                  <Link href="/hub/MLB-ANALYTICS" className="inline-flex items-center gap-1 text-blue-600 text-xs font-bold no-underline tracking-widest">
                     <ArrowLeft size={14} /> DASHBOARD
                  </Link>
                  <h1 className="m-0 mt-2 mb-0.5 text-2xl font-extrabold">Best <span className="text-blue-600">Bets</span></h1>
                  <p className="m-0 text-xs text-slate-500">Ranked By Bet Score • {officialDate || todayStr}</p>
               </div>
               <div className="text-right">
                  <div className="text-blue-600 text-[11px] font-extrabold tracking-widest">MLB EDGE</div>
                  <div className="text-[10px] font-bold text-slate-500 mt-1">SCORE 0–100</div>
                  <div className="text-[9px] text-slate-400">value + confidence</div>
               </div>
           </div>

           <div className="p-4 w-full max-w-2xl mx-auto box-border">
               {isStale && (
                   <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                       <div className="text-amber-600 text-[13px] font-extrabold tracking-widest mb-1">STALE SLATE — NOT ACTIONABLE</div>
                       <div className="text-amber-600 text-xs leading-snug">These picks are from {officialDate || "a previous date"}, not today ({todayStr}). Bets are hidden until today's lines post.</div>
                   </div>
               )}

               <div className="grid grid-cols-4 gap-2 mb-4 metric-grid">
                  <div className="bg-white border border-slate-200 rounded-lg py-3 px-1 text-center">
                     <div className="text-[10px] font-bold text-slate-500 tracking-widest">BETS</div>
                     <div className="text-xl font-extrabold text-slate-900 mt-1">{totalBets}</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg py-3 px-1 text-center">
                     <div className="text-[10px] font-bold text-slate-500 tracking-widest">ELITE</div>
                     <div className="text-xl font-extrabold text-emerald-500 mt-1">{eliteBets}</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg py-3 px-1 text-center">
                     <div className="text-[10px] font-bold text-slate-500 tracking-widest">TOP SCORE</div>
                     <div className="text-xl font-extrabold text-emerald-500 mt-1">{topScore}</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg py-3 px-1 text-center">
                     <div className="text-[10px] font-bold text-slate-500 tracking-widest">TOP LOCK</div>
                     <div className="text-xl font-extrabold text-slate-900 mt-1">{topLock.toFixed(0)}%</div>
                  </div>
               </div>

               <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                   <style dangerouslySetInnerHTML={{__html: `div::-webkit-scrollbar { display: none; }`}} />
                   {['ALL', 'ML', 'TOTAL', 'RUN LINE', 'PROPS'].map(f => (
                       <button 
                           key={f}
                           onClick={() => {
                               setFilter(f);
                               if(navigator.vibrate) try { navigator.vibrate(15); } catch(e){}
                           }}
                           className={`px-4 py-2 rounded-full border text-xs font-bold whitespace-nowrap cursor-pointer touch-manipulation transition-colors ${
                               filter === f 
                               ? 'bg-blue-100 text-blue-600 border-blue-200' 
                               : 'bg-white text-slate-500 border-slate-200'
                           }`}
                       >
                           {f}
                       </button>
                   ))}
               </div>

               {isStale || filteredBets.length === 0 ? (
                   <div className="text-center py-12 px-5 bg-white border border-slate-200 rounded-lg">
                       <div className="mb-3 text-slate-400 flex justify-center">
                           {isStale || (filteredBets.length === 0 && filter === 'ALL') ? <CalendarX size={32} /> : <SearchX size={32} />}
                       </div>
                       <div className="text-[15px] font-bold text-slate-700 mb-2">
                           {isStale || (filteredBets.length === 0 && filter === 'ALL') ? "No qualifying bets for today." : "No bets found for this filter."}
                       </div>
                       <div className="text-[13px] text-slate-500 leading-relaxed">
                           {isStale || (filteredBets.length === 0 && filter === 'ALL') ? "Model is respecting the market." : "Try selecting a different bet type."}
                           <br />Edges surface when the model sees meaningful divergence from the closing line.
                       </div>
                   </div>
               ) : (
                   <div className="flex flex-col gap-3">
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

               <div className="mt-8 text-[11px] text-slate-400 text-center leading-relaxed px-4">
                   Analysis only — not betting advice. <strong>Bet Score</strong> (0–100) ranks VALUE (expected return + confidence). <strong>Top Lock</strong> = most likely to win regardless of price. <strong>EV%</strong> = expected return per $1. Stake = ¼-Kelly. An edge is no guarantee.
               </div>
           </div>
           
           <BottomNavBar />
        </div>
    );
}
