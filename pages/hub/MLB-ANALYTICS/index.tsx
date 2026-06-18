import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { ChevronRight, TrendingUp, ShieldAlert, BarChart3, Activity, Loader2 } from 'lucide-react';
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

export default function MlbSlateDashboard() {
    const { data, error, isLoading } = useSWR('/api/mlb/dashboard', fetcher, {
        refreshInterval: 15000,
    });

    const todayStr = data?.todayStr || new Date().toISOString().split('T')[0];
    const topBets = data?.topBets || [];
    const lastUpdate = data?.lastUpdate || null;
    const slateGames = data?.slateGames || [];

    const formattedDate = new Date(todayStr + 'T12:00:00Z').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
    });

    const isStale = lastUpdate ? new Date().getTime() - new Date(lastUpdate).getTime() > 1000 * 60 * 60 * 12 : true;

    if (error || data?.error) {
        logError('UI Error', error || (typeof data !== 'undefined' ? data?.error : null));
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <SEOHead title="MLB Slate - Error" description="Daily MLB Slate" />
                <UniversalHeader pageDepth={2} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-[#0d1117] p-8 rounded-xl border-[2px] border-[#FF00FF]/50 shadow-[0_0_20px_rgba(255,0,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
                        <ShieldAlert className="w-12 h-12 text-[#FF00FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(255,0,255,0.8))' }} />
                        <h2 className="text-2xl font-extrabold text-white uppercase tracking-wider mb-2 relative z-10" style={{ fontFamily: '"Rajdhani", sans-serif' }}>System Error</h2>
                        <p className="text-[#FF00FF] font-bold uppercase tracking-widest text-[11px] relative z-10">Failed to load dashboard data. Please try again later.</p>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
            <SEOHead 
                title={`MLB Slate - ${formattedDate}`}
                description="Daily MLB Slate, predictive analytics, and top game insights."
            />
            
            <UniversalHeader pageDepth={2} />
            <MlbSubNav />

            <main className="max-w-7xl mx-auto px-4 py-6">
                {/* Header Section */}
                <div className="mb-6 relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
                    {/* Metal Frame Details */}
                    <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center z-20"><span className="text-[6px] text-[#1a2a3a]">+</span></div>
                    <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center z-20"><span className="text-[6px] text-[#1a2a3a]">+</span></div>
                    <div className="absolute bottom-2 left-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center z-20"><span className="text-[6px] text-[#1a2a3a]">+</span></div>
                    <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-gradient-to-b from-[#5a6a7a] to-[#3a4a5a] border border-[#2a3a4a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center z-20"><span className="text-[6px] text-[#1a2a3a]">+</span></div>

                    <div className="bg-gradient-to-r from-[#0d1117] via-[#1a2332] to-[#0d1117] px-6 py-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[80px] opacity-10 animate-pulse"></div>
                        <div className="absolute bottom-0 left-32 w-64 h-64 bg-[#FF00FF] rounded-full mix-blend-screen filter blur-[80px] opacity-5"></div>
                        
                        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4 pl-4 md:pl-6">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="bg-[#1a2332] text-[#00D4FF] text-[10px] font-bold px-2 py-0.5 rounded-sm border border-[#00D4FF]/30 uppercase tracking-widest shadow-[0_0_8px_rgba(0,212,255,0.2)]">MLB ANALYTICS</span>
                                    {isStale && (
                                        <span className="flex items-center gap-1 bg-[#FFD700]/10 text-[#FFD700] text-[10px] font-bold px-2 py-0.5 rounded-sm border border-[#FFD700]/30 uppercase tracking-widest shadow-[0_0_8px_rgba(255,215,0,0.2)]">
                                            <ShieldAlert className="w-3 h-3" />
                                            STALE DATA
                                        </span>
                                    )}
                                </div>
                                <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-widest mb-1 uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 15px rgba(255,255,255,0.2)' }}>
                                    Today's Slate
                                </h1>
                                <p className="text-[#00D4FF] font-bold uppercase tracking-wider text-[13px]">{formattedDate}</p>
                            </div>
                            
                            <div className="flex gap-3">
                                <Link href="/hub/MLB-ANALYTICS/best-bets" className="flex items-center gap-2 bg-gradient-to-b from-[#1a2332] to-[#0d1117] hover:from-[#00D4FF]/20 hover:to-[#0d1117] text-[#00D4FF] border border-[#00D4FF] px-4 py-2 rounded-sm font-bold transition-all text-sm uppercase tracking-wider shadow-[0_0_10px_rgba(0,212,255,0.3)]">
                                    <TrendingUp className="w-4 h-4" />
                                    View Best Bets
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Dashboard Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Top Bets Summary */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] p-5">
                            <div className="flex items-center justify-between mb-5 border-b border-[#3d4f5f] pb-3">
                                <h2 className="text-base font-bold text-white flex items-center gap-2 uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                    <TrendingUp className="w-5 h-5 text-[#00D4FF]" style={{ filter: 'drop-shadow(0 0 5px rgba(0,212,255,0.5))' }} />
                                    Top Edges Today
                                </h2>
                                <Link href="/hub/MLB-ANALYTICS/best-bets" className="text-xs font-bold text-[#00D4FF] hover:text-white flex items-center gap-1 transition-colors uppercase tracking-widest">
                                    See All <ChevronRight className="w-3 h-3" />
                                </Link>
                            </div>
                            
                            {isLoading ? (
                                <div className="text-center py-10 bg-[#1a2332] rounded-lg border border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                                    <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mx-auto mb-2" />
                                    <p className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">Loading Top Bets...</p>
                                </div>
                            ) : topBets.length > 0 ? (
                                <div className="space-y-3">
                                    {topBets.map((bet: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between p-4 rounded-sm bg-[#1a2332] border border-[#3d4f5f] hover:border-[#00D4FF] hover:shadow-[0_0_10px_rgba(0,212,255,0.2)] transition-all group shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                                            <div className="flex items-center gap-4">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-b from-[#2a3a4a] to-[#1a2332] flex items-center justify-center font-extrabold text-[#00D4FF] border border-[#3d4f5f] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                                                    #{idx + 1}
                                                </div>
                                                <div>
                                                    <div className="font-extrabold text-white uppercase tracking-wider">{bet.team} {bet.market === 'h2h' ? 'ML' : bet.market}</div>
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{bet.game_id}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-extrabold text-[#00D4FF]" style={{ textShadow: '0 0 5px rgba(0,212,255,0.5)' }}>{bet.edge ? `+${bet.edge.toFixed(1)}% Edge` : 'High Value'}</div>
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">EV: {bet.ev ? bet.ev.toFixed(2) : '--'}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-10 bg-[#1a2332] rounded-lg border border-dashed border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                                    <p className="text-slate-400 font-bold uppercase tracking-wider text-[11px] mb-1">No top edges available for {formattedDate}</p>
                                    <p className="text-[10px] text-slate-500">The pipeline may still be running or there are no games today.</p>
                                </div>
                            )}
                        </div>

                        {/* Full Slate Grid */}
                        <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] p-5">
                            <h2 className="text-base font-bold text-white flex items-center gap-2 mb-5 border-b border-[#3d4f5f] pb-3 uppercase tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                <Activity className="w-5 h-5 text-[#FF00FF]" style={{ filter: 'drop-shadow(0 0 5px rgba(255,0,255,0.5))' }} />
                                Full Slate
                            </h2>
                            {isLoading ? (
                                <div className="text-center py-12 bg-[#1a2332] rounded-lg border border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                                    <Loader2 className="w-8 h-8 animate-spin text-[#FF00FF] mx-auto mb-2" />
                                    <p className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">Loading Slate...</p>
                                </div>
                            ) : slateGames && slateGames.length > 0 ? (
                                <div className="flex md:grid md:grid-cols-2 gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-5 px-5 md:mx-0 md:px-0" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                                    <style jsx>{`
                                        div::-webkit-scrollbar { display: none; }
                                    `}</style>
                                    {slateGames.map((game: any, idx: number) => {
                                        const gameTime = new Date(game.event_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
                                        const homeProb = parseFloat(game.home_win_prob || '0');
                                        const awayProb = parseFloat(game.away_win_prob || '0');
                                        const homeEdge = parseFloat(game.home_edge || '0');
                                        const awayEdge = parseFloat(game.away_edge || '0');

                                        return (
                                            <div key={game.game_id || idx} className="flex-none w-[85vw] md:w-auto snap-center bg-[#1a2332] border border-[#3d4f5f] rounded-sm p-4 hover:border-[#FF00FF] transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                                                <div className="flex justify-between items-center mb-3">
                                                    <span className="text-[10px] font-bold text-[#00D4FF] uppercase tracking-widest">{gameTime}</span>
                                                    <span className={`text-[9px] px-2 py-0.5 rounded-sm font-extrabold uppercase tracking-widest border ${game.status === 'Scheduled' || game.status === 'Pre-Game' ? 'bg-[#00D4FF]/10 text-[#00D4FF] border-[#00D4FF]/30' : 'bg-[#FF00FF]/10 text-[#FF00FF] border-[#FF00FF]/30'}`}>
                                                        {game.status}
                                                    </span>
                                                </div>
                                                
                                                <div className="space-y-3">
                                                    {/* Away Team */}
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <div className="font-extrabold text-white text-lg tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{game.away_abbr} <span className="text-xs font-bold text-slate-500 ml-1">{game.away_team?.split(' ').pop()}</span></div>
                                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">P: {game.away_pitcher || 'TBD'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            {game.away_win_prob ? (
                                                                <>
                                                                    <div className="font-extrabold text-slate-300">{(awayProb * 100).toFixed(1)}%</div>
                                                                    {awayEdge > 0 && <div className="text-[9px] font-extrabold text-[#00D4FF] uppercase tracking-widest" style={{ textShadow: '0 0 5px rgba(0,212,255,0.4)' }}>+{awayEdge.toFixed(1)}% Edge</div>}
                                                                </>
                                                            ) : (
                                                                <span className="text-[10px] text-slate-500 font-bold">N/A</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Home Team */}
                                                    <div className="flex justify-between items-center pt-2 border-t border-[#3d4f5f]">
                                                        <div>
                                                            <div className="font-extrabold text-white text-lg tracking-wider" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{game.home_abbr} <span className="text-xs font-bold text-slate-500 ml-1">{game.home_team?.split(' ').pop()}</span></div>
                                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">P: {game.home_pitcher || 'TBD'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            {game.home_win_prob ? (
                                                                <>
                                                                    <div className="font-extrabold text-slate-300">{(homeProb * 100).toFixed(1)}%</div>
                                                                    {homeEdge > 0 && <div className="text-[9px] font-extrabold text-[#00D4FF] uppercase tracking-widest" style={{ textShadow: '0 0 5px rgba(0,212,255,0.4)' }}>+{homeEdge.toFixed(1)}% Edge</div>}
                                                                </>
                                                            ) : (
                                                                <span className="text-[10px] text-slate-500 font-bold">N/A</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-[#1a2332] rounded-lg border border-dashed border-[#3d4f5f] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]">
                                    <p className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">No games scheduled for today.</p>
                                    <p className="text-[10px] text-slate-500 mt-1">Check back later for updates.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column - Quick Links / Status */}
                    <div className="space-y-6">
                        {/* Quick Navigation */}
                        <div className="relative bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] p-5">
                            <h2 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-4 border-b border-[#3d4f5f] pb-3">Analytics Tools</h2>
                            <div className="space-y-2">
                                {[
                                    { name: 'Model Accuracy', desc: 'Track predictive performance', href: '/hub/MLB-ANALYTICS/accuracy', icon: BarChart3, color: 'text-[#00D4FF]', bg: 'bg-[#00D4FF]/10 border border-[#00D4FF]/30' },
                                    { name: 'Teams Database', desc: 'Team-level metrics & stats', href: '/hub/MLB-ANALYTICS/teams', icon: ShieldAlert, color: 'text-[#FF00FF]', bg: 'bg-[#FF00FF]/10 border border-[#FF00FF]/30' },
                                    { name: 'System Status', desc: 'Pipeline health & sync', href: '/hub/MLB-ANALYTICS/status', icon: Activity, color: 'text-[#FFD700]', bg: 'bg-[#FFD700]/10 border border-[#FFD700]/30' },
                                ].map((tool, i) => (
                                    <Link key={i} href={tool.href} className="flex items-center gap-3 p-3 rounded-sm bg-[#1a2332] border border-[#3d4f5f] hover:border-[#00D4FF] hover:shadow-[0_0_10px_rgba(0,212,255,0.2)] transition-all group shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                                        <div className={`p-2 rounded-sm ${tool.bg} ${tool.color} group-hover:scale-110 transition-transform`}>
                                            <tool.icon className="w-5 h-5" style={{ filter: `drop-shadow(0 0 5px currentColor)` }} />
                                        </div>
                                        <div>
                                            <div className="font-extrabold text-white uppercase tracking-wider text-[13px]">{tool.name}</div>
                                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{tool.desc}</div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-500 ml-auto group-hover:text-[#00D4FF] transition-colors" />
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            
            <BottomNavBar />
        </div>
    );
}

