import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Info, TrendingUp, TrendingDown, SearchX, CalendarX } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export async function getServerSideProps() {
    try {
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

const BetCard = ({ bet, isExpanded, onToggle }) => {
    // Correct odds formatting for all types (+125, -110, "+125")
    const formatOdds = (o) => {
        if (!o) return '';
        const num = Number(o);
        if (isNaN(num)) return o; // already formatted string
        return num > 0 ? `+${num}` : `${num}`;
    };
    
    const tierColor = bet.bet_tier === 'ELITE' ? '#10B981' : (bet.bet_tier === 'STRONG' ? '#3B82F6' : '#F59E0B');
    
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
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '12px', cursor: 'pointer', touchAction: 'manipulation' }} onClick={onToggle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ flex: 1, paddingRight: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 2 }}>{bet.matchup}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
                            {bet.selection} {lineStr}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: tierColor }}>{bet.bet_score}</div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: tierColor, letterSpacing: 1 }}>{bet.bet_tier}</div>
                    </div>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                            <span style={{ fontSize: 10, color: '#64748B' }}>Odds: </span>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{formatOdds(bet.best_price)}</span>
                            <span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 4 }}>({bet.best_book})</span>
                        </div>
                        <div>
                            <span style={{ fontSize: 10, color: '#64748B' }}>Win: </span>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{bet.win_confidence?.toFixed(1)}%</span>
                        </div>
                        {bet.ev_pct !== null && bet.ev_pct !== undefined && (
                            <div>
                                <span style={{ fontSize: 10, color: '#64748B' }}>EV: </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: Number(bet.ev_pct) > 0 ? '#10B981' : '#0F172A' }}>
                                    {Number(bet.ev_pct) > 0 ? '+' : ''}{Number(bet.ev_pct).toFixed(1)}%
                                </span>
                            </div>
                        )}
                    </div>
                    <div style={{ color: '#94A3B8', paddingLeft: 8 }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                </div>
            </div>

            {isExpanded && bet.score_factors && (
                <div style={{ padding: '12px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                        {bet.score_verdict || "Analysis"}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {bet.score_factors.map((factor, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                <div style={{ marginTop: 2, flexShrink: 0 }}>
                                    {factor.dir === 'up' && <TrendingUp size={12} color="#10B981" />}
                                    {factor.dir === 'down' && <TrendingDown size={12} color="#EF4444" />}
                                    {factor.dir === 'info' && <Info size={12} color="#3B82F6" />}
                                </div>
                                <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.4 }}>
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
        <div style={{ 
            minHeight: '100vh', 
            background: '#F8FAFC', 
            color: '#0F172A', 
            paddingBottom: 70, // Required clearance for BottomNavBar 
            fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
            width: '100%',
            maxWidth: '100vw',
            overflowX: 'hidden',
            boxSizing: 'border-box'
        }}>
           <SEOHead 
               title="Best Bets | MLB Analytics" 
               description="Daily MLB betting edges surfaced by AI models."
               noIndex={true} // Hidden from public search to protect proprietary edges
           />

           <UniversalHeader pageDepth={2} />

           <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div>
                  <Link href="/hub/MLB-ANALYTICS" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563EB', fontSize: 12, fontWeight: 700, textDecoration: 'none', letterSpacing: 1 }}>
                     <ArrowLeft size={14} /> DASHBOARD
                  </Link>
                  <h1 style={{ margin: '8px 0 2px', fontSize: 24, fontWeight: 800 }}>Best <span style={{ color: '#2563EB' }}>Bets</span></h1>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>Ranked By Bet Score • {officialDate || todayStr}</p>
               </div>
               <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#2563EB', fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>MLB EDGE</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', marginTop: 4 }}>SCORE 0–100</div>
                  <div style={{ fontSize: 9, color: '#94A3B8' }}>value + confidence</div>
               </div>
           </div>

           <div style={{ padding: '16px', width: '100%', maxWidth: 680, margin: '0 auto', boxSizing: 'border-box' }}>
               {isStale && (
                   <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                       <div style={{ color: '#D97706', fontSize: 13, fontWeight: 800, letterSpacing: 1, marginBottom: 4 }}>STALE SLATE — NOT ACTIONABLE</div>
                       <div style={{ color: '#D97706', fontSize: 12, lineHeight: 1.4 }}>These picks are from {officialDate || "a previous date"}, not today ({todayStr}). Bets are hidden until today's lines post.</div>
                   </div>
               )}

               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 4px', textAlign: 'center' }}>
                     <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: 1 }}>BETS</div>
                     <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{totalBets}</div>
                  </div>
                  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 4px', textAlign: 'center' }}>
                     <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: 1 }}>ELITE</div>
                     <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981', marginTop: 4 }}>{eliteBets}</div>
                  </div>
                  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 4px', textAlign: 'center' }}>
                     <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: 1 }}>TOP SCORE</div>
                     <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981', marginTop: 4 }}>{topScore}</div>
                  </div>
                  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 4px', textAlign: 'center' }}>
                     <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: 1 }}>TOP LOCK</div>
                     <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{topLock.toFixed(0)}%</div>
                  </div>
               </div>

               <div style={{ 
                   display: 'flex', 
                   gap: 8, 
                   overflowX: 'auto', 
                   paddingBottom: 8, 
                   marginBottom: 16, 
                   WebkitOverflowScrolling: 'touch',
                   msOverflowStyle: 'none', 
                   scrollbarWidth: 'none' 
               }}>
                   <style dangerouslySetInnerHTML={{__html: `div::-webkit-scrollbar { display: none; }`}} />
                   {['ALL', 'ML', 'TOTAL', 'RUN LINE', 'PROPS'].map(f => (
                       <button 
                           key={f}
                           onClick={() => {
                               setFilter(f);
                               if(navigator.vibrate) try { navigator.vibrate(15); } catch(e){}
                           }}
                           style={{
                               padding: '8px 16px', 
                               borderRadius: 20, 
                               border: '1px solid #E2E8F0', 
                               fontSize: 12, 
                               fontWeight: 700, 
                               whiteSpace: 'nowrap', 
                               cursor: 'pointer',
                               touchAction: 'manipulation',
                               background: filter === f ? '#DBEAFE' : '#fff',
                               color: filter === f ? '#2563EB' : '#64748B',
                               borderColor: filter === f ? '#BFDBFE' : '#E2E8F0'
                           }}
                       >
                           {f}
                       </button>
                   ))}
               </div>

               {isStale || filteredBets.length === 0 ? (
                   <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                       <div style={{ marginBottom: 12, color: '#94A3B8', display: 'flex', justifyContent: 'center' }}>
                           {isStale || (filteredBets.length === 0 && filter === 'ALL') ? <CalendarX size={32} /> : <SearchX size={32} />}
                       </div>
                       <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                           {isStale || (filteredBets.length === 0 && filter === 'ALL') ? "No qualifying bets for today." : "No bets found for this filter."}
                       </div>
                       <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
                           {isStale || (filteredBets.length === 0 && filter === 'ALL') ? "Model is respecting the market." : "Try selecting a different bet type."}
                           <br />Edges surface when the model sees meaningful divergence from the closing line.
                       </div>
                   </div>
               ) : (
                   <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

               <div style={{ marginTop: 32, fontSize: 11, color: '#94A3B8', textAlign: 'center', lineHeight: 1.6, padding: '0 16px' }}>
                   Analysis only — not betting advice. <strong>Bet Score</strong> (0–100) ranks VALUE (expected return + confidence). <strong>Top Lock</strong> = most likely to win regardless of price. <strong>EV%</strong> = expected return per $1. Stake = ¼-Kelly. An edge is no guarantee.
               </div>
           </div>
           
           <BottomNavBar />
        </div>
    );
}
