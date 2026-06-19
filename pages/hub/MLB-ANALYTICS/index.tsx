import React from 'react';
import { useRouter } from 'next/router';
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
    const router = useRouter();
    const { data, error, isLoading } = useSWR('/api/mlb/dashboard', fetcher, {
        refreshInterval: 15000,
    });

    const todayStr = data?.todayStr || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
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
            <div className="min-h-screen bg-slate-50 pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-800">
                <SEOHead title="MLB Error" description="Data fetch failed" />
                <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub')} />
                <MlbSubNav />
                <main className="max-w-7xl mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
                    <div className="text-center bg-white p-8 rounded-xl border border-red-200 shadow-sm relative overflow-hidden">
                        <Activity className="w-12 h-12 text-red-500 mx-auto mb-4 relative z-10" />
                        <h2 className="text-2xl font-bold text-slate-800 tracking-wider mb-2 relative z-10">System Error</h2>
                        <p className="text-red-500 font-bold uppercase tracking-widest text-xs relative z-10">Failed to load data. Please try again later.</p>
                    </div>
                </main>
                <BottomNavBar />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
            <SEOHead 
                title={`MLB Slate - ${formattedDate}`}
                description="Daily MLB Slate, predictive analytics, and top game insights."
            />
            
            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub')} />
            <MlbSubNav />

            <main className="max-w-7xl mx-auto px-4 py-6">
                {/* Header Section */}
                <div className="mb-6 bg-slate-900 rounded-xl overflow-hidden shadow-lg">
                    <div className="px-6 py-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                        <div className="absolute bottom-0 left-32 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
                        
                        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4 pl-4 md:pl-6 border-l-4 border-emerald-500">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="bg-slate-800 text-slate-300 text-xs font-bold px-2 py-0.5 rounded border border-slate-700">MLB ANALYTICS</span>
                                    {isStale && (
                                        <span className="flex items-center gap-1 bg-amber-500/20 text-amber-300 text-xs font-bold px-2 py-0.5 rounded border border-amber-500/30">
                                            <ShieldAlert className="w-3 h-3" />
                                            STALE DATA
                                        </span>
                                    )}
                                </div>
                                <h1 className="text-3xl font-extrabold text-white tracking-tight mb-1">
                                    Today's Slate
                                </h1>
                                <p className="text-slate-400 font-medium">{formattedDate}</p>
                            </div>
                            
                            <div className="flex gap-3">
                                <Link href="/hub/MLB-ANALYTICS/best-bets" className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold transition-colors text-sm">
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
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                                    Top Edges Today
                                </h2>
                                <Link href="/hub/MLB-ANALYTICS/best-bets" className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
                                    See All <ChevronRight className="w-4 h-4" />
                                </Link>
                            </div>
                            
                            {isLoading && !data ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-4 animate-pulse">
                                            <div className="h-4 w-1/3 bg-slate-200 rounded mb-3"></div>
                                            <div className="h-6 w-1/4 bg-slate-200 rounded"></div>
                                        </div>
                                    ))}
                                </div>
                            ) : topBets.length > 0 ? (
                                <div className="space-y-3">
                                    {topBets.map((bet: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-colors group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 border border-slate-300">
                                                    #{idx + 1}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800">{bet.team} {bet.market === 'h2h' ? 'ML' : bet.market}</div>
                                                    <div className="text-xs font-semibold text-slate-500">{bet.game_id}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-extrabold text-emerald-600">{bet.edge ? `+${Number(bet.edge).toFixed(1)}% Edge` : 'High Value'}</div>
                                                <div className="text-xs font-bold text-slate-400">EV: {bet.ev ? Number(bet.ev).toFixed(2) : '--'}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-10 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                    <p className="text-slate-500 font-medium mb-2">No top edges available for {formattedDate}</p>
                                    <p className="text-sm text-slate-400">The pipeline may still be running or there are no games today.</p>
                                </div>
                            )}
                        </div>

                        {/* Full Slate Grid */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                                <Activity className="w-5 h-5 text-blue-500" />
                                Full Slate
                            </h2>
                            {isLoading && !data ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-6 animate-pulse">
                                            <div className="h-3 w-1/4 bg-slate-200 rounded mb-4"></div>
                                            <div className="h-6 w-2/3 bg-slate-200 rounded mb-2"></div>
                                            <div className="h-6 w-1/2 bg-slate-200 rounded"></div>
                                        </div>
                                    ))}
                                </div>
                            ) : slateGames && slateGames.length > 0 ? (
                                <div className="flex md:grid md:grid-cols-2 gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-5 px-5 md:mx-0 md:px-0" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                                    <style jsx>{`
                                        div::-webkit-scrollbar { display: none; }
                                    `}</style>
                                    {slateGames.map((game: any, idx: number) => {
                                        const gameTime = new Date(game.event_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
                                        const homeProb = Number(game.home_win_prob || '0');
                                        const awayProb = Number(game.away_win_prob || '0');
                                        const homeEdge = game.home_edge ? Number(game.home_edge) : 0;
                                        const awayEdge = game.away_edge ? Number(game.away_edge) : 0;

                                        return (
                                            <div key={game.game_id || idx} className="flex-none w-[85vw] md:w-auto snap-center bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                                <div className="flex justify-between items-center mb-3">
                                                    <span className="text-xs font-semibold text-slate-500">{gameTime}</span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${game.status === 'Scheduled' || game.status === 'Pre-Game' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                                                        {game.status}
                                                    </span>
                                                </div>
                                                
                                                <div className="space-y-3">
                                                    {/* Away Team */}
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <div className="font-bold text-slate-800 text-base">{game.away_abbr} <span className="text-sm font-medium text-slate-500 ml-1">{game.away_team?.split(' ').pop()}</span></div>
                                                            <div className="text-xs text-slate-400 font-medium mt-0.5">P: {game.away_pitcher || 'TBD'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            {game.away_win_prob ? (
                                                                <>
                                                                    <div className="font-bold text-slate-700">{(awayProb * 100).toFixed(1)}%</div>
                                                                    {awayEdge > 0 && <div className="text-[10px] font-bold text-emerald-600 mt-0.5">+{Number(awayEdge).toFixed(1)}% Edge</div>}
                                                                </>
                                                            ) : (
                                                                <span className="text-xs text-slate-400 font-medium">N/A</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Home Team */}
                                                    <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                                                        <div>
                                                            <div className="font-bold text-slate-800 text-base">{game.home_abbr} <span className="text-sm font-medium text-slate-500 ml-1">{game.home_team?.split(' ').pop()}</span></div>
                                                            <div className="text-xs text-slate-400 font-medium mt-0.5">P: {game.home_pitcher || 'TBD'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            {game.home_win_prob ? (
                                                                <>
                                                                    <div className="font-bold text-slate-700">{(homeProb * 100).toFixed(1)}%</div>
                                                                    {homeEdge > 0 && <div className="text-[10px] font-bold text-emerald-600 mt-0.5">+{Number(homeEdge).toFixed(1)}% Edge</div>}
                                                                </>
                                                            ) : (
                                                                <span className="text-xs text-slate-400 font-medium">N/A</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                    <p className="text-slate-500 font-medium">No games scheduled for today.</p>
                                    <p className="text-sm text-slate-400 mt-1">Check back later for updates.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column - Quick Links / Status */}
                    <div className="space-y-6">
                        {/* Quick Navigation */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Analytics Tools</h2>
                            <div className="space-y-2">
                                {[
                                    { name: 'Model Accuracy', desc: 'Track predictive performance', href: '/hub/MLB-ANALYTICS/accuracy', icon: BarChart3, color: 'text-blue-500', bg: 'bg-blue-100' },
                                    { name: 'Teams Database', desc: 'Team-level metrics & stats', href: '/hub/MLB-ANALYTICS/teams', icon: ShieldAlert, color: 'text-indigo-500', bg: 'bg-indigo-100' },
                                    { name: 'System Status', desc: 'Pipeline health & sync', href: '/hub/MLB-ANALYTICS/status', icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-100' },
                                ].map((tool, i) => (
                                    <Link key={i} href={tool.href} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group">
                                        <div className={`p-2 rounded-lg ${tool.bg} ${tool.color} group-hover:scale-110 transition-transform`}>
                                            <tool.icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-800">{tool.name}</div>
                                            <div className="text-xs text-slate-500 font-medium">{tool.desc}</div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-300 ml-auto group-hover:text-slate-500 transition-colors" />
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
