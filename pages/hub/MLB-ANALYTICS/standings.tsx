import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { UniversalHeader } from '@/components/UniversalHeader';
import { BottomNavBar } from '@/components/BottomNavBar';
import { MlbSubNav } from '@/components/mlb/MlbSubNav';

export default function StandingsPage() {
    const [standings, setStandings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStandings() {
            try {
                // For demonstration, we simply query dim_teams and order by team_id
                // (Replace this with real standings from fact_games or dim_teams if available)
                const res = await fetch('/api/mlb/standings');
                if (res.ok) {
                    const data = await res.json();
                    setStandings(data.teams || []);
                }
            } catch (err) {
                console.error('Error fetching standings:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchStandings();
    }, []);

    return (
        <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
            <Head>
                <title>MLB Standings | Smarter.Poker Hub</title>
                <meta name="description" content="Live MLB Standings and Power Rankings" />
            </Head>
            <UniversalHeader pageDepth={2} />
            <MlbSubNav />
            
            <main className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-wider flex items-center gap-3" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                            <span className="text-[#FF00FF] font-bold">|</span> LEAGUE STANDINGS
                        </h1>
                        <p className="text-slate-400 mt-2 tracking-wide font-mono text-xs">
                            LIVE WIN/LOSS TRACKING AND DIVISIONAL RANKINGS
                        </p>
                    </div>
                </div>

                <div className="bg-[#0d1117] rounded-xl border border-slate-800/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--neon-cyan)] rounded-full mix-blend-screen filter blur-[100px] opacity-[0.05] pointer-events-none"></div>
                    
                    <div className="p-1 border-b border-slate-800/60 bg-slate-900/40">
                        <div className="grid grid-cols-4 md:grid-cols-6 gap-4 p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <div className="col-span-2">Team</div>
                            <div className="text-center">W</div>
                            <div className="text-center">L</div>
                            <div className="text-center hidden md:block">PCT</div>
                            <div className="text-right">GB</div>
                        </div>
                    </div>

                    <div className="divide-y divide-slate-800/40">
                        {loading ? (
                            <div className="p-12 text-center text-slate-500 font-mono text-xs animate-pulse">
                                INITIATING STANDINGS SYNC...
                            </div>
                        ) : standings.length === 0 ? (
                            <div className="p-12 text-center text-slate-500 font-mono text-xs">
                                STANDINGS UNAVAILABLE
                            </div>
                        ) : (
                            standings.map((team, idx) => (
                                <div key={team.team_id || idx} className="grid grid-cols-4 md:grid-cols-6 gap-4 p-4 items-center hover:bg-slate-800/20 transition-colors">
                                    <div className="col-span-2 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-xs">
                                            {team.abbr || 'TBD'}
                                        </div>
                                        <span className="font-bold text-slate-200">{team.name || 'Unknown'}</span>
                                    </div>
                                    <div className="text-center font-mono text-sm text-[var(--neon-cyan)]">0</div>
                                    <div className="text-center font-mono text-sm text-slate-300">0</div>
                                    <div className="text-center font-mono text-sm text-slate-400 hidden md:block">.000</div>
                                    <div className="text-right font-mono text-sm text-slate-500">-</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </main>
            <BottomNavBar />
        </div>
    );
}
