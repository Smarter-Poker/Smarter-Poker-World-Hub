import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { ChevronRight, TrendingUp, ShieldAlert, BarChart3, Activity, Loader2 } from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import SEOHead from '../../../src/components/seo/SEOHead';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <SEOHead 
                title={`MLB Slate - ${formattedDate}`}
                description="Daily MLB Slate, predictive analytics, and top game insights."
            />
            
            <UniversalHeader />
            <MlbSubNav />

            <main className="max-w-7xl mx-auto px-4 py-6">
                {/* Header Section */}
                <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
                        <div className="absolute top-0 right-32 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
                        
                        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
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
                            
                            {topBets.length > 0 ? (
                                <div className="space-y-3">
                                    {topBets.map((bet, idx) => (
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
                                                <div className="font-extrabold text-emerald-600">{bet.edge ? `+${bet.edge.toFixed(1)}% Edge` : 'High Value'}</div>
                                                <div className="text-xs font-bold text-slate-400">EV: {bet.ev ? bet.ev.toFixed(2) : '--'}</div>
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
                            {slateGames && slateGames.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {slateGames.map((game: any, idx: number) => {
                                        const gameTime = new Date(game.event_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
                                        const homeProb = parseFloat(game.home_win_prob || '0');
                                        const awayProb = parseFloat(game.away_win_prob || '0');
                                        const homeEdge = parseFloat(game.home_edge || '0');
                                        const awayEdge = parseFloat(game.away_edge || '0');

                                        return (
                                            <div key={game.game_id || idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4 hover:shadow-md hover:border-slate-300 transition-all">
                                                <div className="flex justify-between items-center mb-3">
                                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{gameTime}</span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${game.status === 'Scheduled' || game.status === 'Pre-Game' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                        {game.status}
                                                    </span>
                                                </div>
                                                
                                                <div className="space-y-3">
                                                    {/* Away Team */}
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <div className="font-extrabold text-slate-800 text-lg">{game.away_abbr} <span className="text-sm font-medium text-slate-500 ml-1">{game.away_team?.split(' ').pop()}</span></div>
                                                            <div className="text-[11px] text-slate-500 font-medium">P: {game.away_pitcher || 'TBD'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            {game.away_win_prob ? (
                                                                <>
                                                                    <div className="font-bold text-slate-700">{(awayProb * 100).toFixed(1)}%</div>
                                                                    {awayEdge > 0 && <div className="text-[10px] font-bold text-emerald-500">+{awayEdge.toFixed(1)}% Edge</div>}
                                                                </>
                                                            ) : (
                                                                <span className="text-xs text-slate-400">N/A</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Home Team */}
                                                    <div className="flex justify-between items-center pt-2 border-t border-slate-200/60">
                                                        <div>
                                                            <div className="font-extrabold text-slate-800 text-lg">{game.home_abbr} <span className="text-sm font-medium text-slate-500 ml-1">{game.home_team?.split(' ').pop()}</span></div>
                                                            <div className="text-[11px] text-slate-500 font-medium">P: {game.home_pitcher || 'TBD'}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            {game.home_win_prob ? (
                                                                <>
                                                                    <div className="font-bold text-slate-700">{(homeProb * 100).toFixed(1)}%</div>
                                                                    {homeEdge > 0 && <div className="text-[10px] font-bold text-emerald-500">+{homeEdge.toFixed(1)}% Edge</div>}
                                                                </>
                                                            ) : (
                                                                <span className="text-xs text-slate-400">N/A</span>
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
