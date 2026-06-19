import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import { logError } from '@/utils/logger';

const fetcher = async (url: string) => {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return await res.json();
    } catch (err) {
        logError('SWR Fetch', err);
        throw err;
    }
};

export default function StandingsPage() {
    const router = useRouter();
    const { data, error, isLoading } = useSWR('/api/mlb/standings', fetcher, {
        refreshInterval: 60000,
    });
    
    const standings = data?.teams || [];
    const loading = isLoading && !data;

    return (
        <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
            <Head>
                <title>MLB Standings | Smarter.Poker Hub</title>
                <meta name="description" content="Live MLB Standings and Power Rankings" />
            </Head>
            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS')} />
            <MlbSubNav />
            
            <main className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-wider flex items-center gap-3" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                            <span className="text-[#00D4FF] font-bold">|</span> LEAGUE STANDINGS
                        </h1>
                        <p className="text-slate-400 mt-2 tracking-wide  text-xs">
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
                            <div className="p-12 text-center text-slate-500  text-xs animate-pulse">
                                INITIATING STANDINGS SYNC...
                            </div>
                        ) : standings.length === 0 ? (
                            <div className="p-12 text-center text-slate-500  text-xs">
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
                                    <div className="text-center  text-sm text-[var(--neon-cyan)]">{team.w ?? 0}</div>
                                    <div className="text-center  text-sm text-slate-300">{team.l ?? 0}</div>
                                    <div className="text-center  text-sm text-slate-400 hidden md:block">{team.pct != null ? Number(team.pct).toFixed(3).replace(/^0+/, '') : '.000'}</div>
                                    <div className="text-right  text-sm text-slate-500">{team.gb ?? '-'}</div>
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
