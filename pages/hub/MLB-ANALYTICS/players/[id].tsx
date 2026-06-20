import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, User, Activity, Target, Shield } from 'lucide-react';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { useState, useEffect } from 'react';
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

export default function PlayerProfilePage() {
    const router = useRouter();
    const { id } = router.query;

    const { data, error, isLoading } = useSWR(id ? `/api/mlb/players/${id}` : null, fetcher, {
        refreshInterval: 300000, // 5 min — player stats update nightly, revalidateOnFocus: false
    });

    const headshotUrl = id ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current` : '/default-avatar.png';
    const [imgSrc, setImgSrc] = useState(headshotUrl);

    useEffect(() => {
        if (id) {
            setImgSrc(`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`);
        }
    }, [id]);

    const formatValue = (key: string, val: any) => {
        if (typeof val !== 'number') return val;
        if (key.includes('pct') || key.includes('rate')) return `${(Number(val) * 100).toFixed(1)}%`;
        if (key.includes('woba') || key.includes('iso') || key.includes('avg') || key.includes('obp') || key.includes('slg')) return Number(val).toFixed(3);
        if (Number(val) % 1 !== 0) return Number(val).toFixed(2);
        return val;
    };

    const isPrimaryStat = (key: string) => {
        const primary = ['player_id', 'full_name', 'team_id', 'wrc_plus', 'woba', 'pa', 'fip', 'siera', 'bf'];
        return primary.includes(key);
    };

    if (error || data?.error) {
        logError('UI Error', error || (typeof data !== 'undefined' ? data?.error : null));
        return (
            <div className="min-h-screen bg-[#0a0a15] pb-[70px] w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
                <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS/players')} />
                <MlbSubNav />
                <div className="p-8 text-center">
                    <div className="text-red-500 font-extrabold text-2xl uppercase tracking-widest" style={{ fontFamily: '"Rajdhani", sans-serif' }}>Error Loading Player</div>
                    <Link href="/hub/MLB-ANALYTICS/players" className="text-[#00D4FF] underline mt-4 inline-block font-bold">Return to Database</Link>
                </div>
                <BottomNavBar />
            </div>
        );
    }

    const profile = data?.profile;
    const type = data?.type; // 'hitter' or 'pitcher'

    return (
        <div className="min-h-screen bg-[#0a0a15] pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
            <SEOHead 
                title={profile ? `${profile.full_name} — MLB ${type === 'pitcher' ? 'Pitcher' : 'Hitter'} Analytics & Stats | Smarter.Poker` : 'MLB Player Profile | Smarter.Poker'} 
                description={profile ? `Advanced analytics and situational splits for ${profile.full_name}. ${type === 'pitcher' ? 'ERA, FIP, SIERA, strikeouts, and pitch-level data' : 'wRC+, wOBA, OPS, home runs, and platoon splits'} for the 2025 MLB season.` : 'In-depth MLB player analytics, advanced statistics, and situational splits.'}
                ogImage="/images/mlb/og.png"
                jsonLd={{
                    '@context': 'https://schema.org',
                    '@type': 'Person',
                    name: profile?.full_name || 'MLB Player',
                    jobTitle: type === 'pitcher' ? 'Pitcher' : 'Hitter',
                    memberOf: { '@type': 'SportsTeam', name: 'MLB Team' }
                }}
            />

            <UniversalHeader pageDepth={2} onBackClick={() => router.push('/hub/MLB-ANALYTICS/players')} />
            <MlbSubNav />

            <div className="p-4 w-full max-w-4xl mx-auto box-border relative">
               
               {/* Background Glows */}
               <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#00D4FF] rounded-full mix-blend-screen filter blur-[150px] opacity-[0.05] pointer-events-none"></div>

               <div className="mb-6">
                   <Link href="/hub/MLB-ANALYTICS/players" className="inline-flex items-center gap-1 text-[#00D4FF] text-[10px] font-extrabold tracking-widest uppercase hover:text-white transition-colors mb-4">
                       <ArrowLeft size={14} /> Back to Database
                   </Link>
               </div>

               {isLoading || !profile ? (
                   <div className="animate-pulse">
                       {/* Hero Skeleton */}
                       <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.5)] mb-6 flex flex-col md:flex-row items-center gap-6">
                           <div className="w-32 h-32 rounded-full bg-[#1a2332] border-[3px] border-[#3d4f5f] shrink-0" />
                           <div className="flex-1 text-center md:text-left space-y-3 w-full">
                               <div className="w-24 h-5 bg-[#1a2332] rounded mx-auto md:mx-0" />
                               <div className="w-64 h-10 bg-[#1a2332] rounded mx-auto md:mx-0" />
                               <div className="w-32 h-4 bg-[#1a2332] rounded mx-auto md:mx-0" />
                           </div>
                       </div>

                       {/* Primary Metrics Skeleton */}
                       <div className="w-40 h-5 bg-[#3d4f5f] rounded mb-4" />
                       <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                           {[1, 2, 3].map(i => (
                               <div key={i} className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 h-24">
                                   <div className="w-16 h-3 bg-[#1a2332] rounded mb-2" />
                                   <div className="w-20 h-8 bg-[#1a2332] rounded mt-4" />
                               </div>
                           ))}
                       </div>

                       {/* Secondary Metrics Skeleton */}
                       <div className="w-48 h-5 bg-[#3d4f5f] rounded mb-4" />
                       <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4">
                           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                               {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                                   <div key={i} className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3 h-16">
                                       <div className="w-12 h-2 bg-[#3d4f5f] rounded mb-2" />
                                       <div className="w-16 h-5 bg-[#3d4f5f] rounded mt-2" />
                                   </div>
                               ))}
                           </div>
                       </div>
                   </div>
               ) : (
                   <>
                       {/* Hero Header */}
                       <div className="bg-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] mb-6 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
                           <div className="absolute left-0 top-0 bottom-0 w-2 bg-[#00D4FF] shadow-[0_0_15px_rgba(0,212,255,0.8)]" />
                           
                           <div className="relative w-32 h-32 shrink-0 z-10">
                               {/* eslint-disable-next-line @next/next/no-img-element */}
                               <img 
                                   src={imgSrc} 
                                   onError={() => setImgSrc('/default-avatar.png')}
                                   alt={profile.full_name}
                                   loading="lazy"
                                   className="w-32 h-32 rounded-full object-cover bg-[#1a2332] border-[3px] border-[#00D4FF] shadow-[0_0_20px_rgba(0,212,255,0.4),inset_0_4px_8px_rgba(0,0,0,0.8)]"
                               />
                               {profile.team_id && (
                                   // eslint-disable-next-line @next/next/no-img-element
                                   <img 
                                       src={`https://www.mlbstatic.com/team-logos/${profile.team_id}.svg`} 
                                       alt="Team Logo"
                                       className="absolute -bottom-2 -right-2 w-10 h-10 bg-[#0d1117] rounded-full p-1 border-[2px] border-[#3d4f5f] shadow-[0_4px_10px_rgba(0,0,0,0.8)]" loading="lazy"
                                   />
                               )}
                           </div>

                           <div className="flex-1 text-center md:text-left z-10">
                               <div className="inline-block bg-[#1a2332] border border-[#3d4f5f] px-3 py-1 rounded-sm text-[10px] font-extrabold text-[#00D4FF] tracking-widest uppercase mb-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                                   {type === 'pitcher' ? 'Pitcher Profile' : 'Hitter Profile'}
                               </div>
                               <h1 className="m-0 text-3xl md:text-5xl font-extrabold text-white tracking-widest uppercase" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                                   {profile.full_name}
                               </h1>
                               <div className="text-slate-400 font-bold text-sm tracking-widest uppercase mt-2">
                                   ID: {profile.player_id}
                               </div>
                           </div>
                       </div>

                       {/* Primary Metrics */}
                       <h2 className="text-base font-extrabold text-white mb-4 uppercase tracking-widest pl-2 border-l-[3px] border-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>Primary Ratings</h2>
                       <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                           {type === 'hitter' ? (
                               <>
                                   <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)] relative overflow-hidden">
                                       <div className="absolute top-0 right-0 p-2 opacity-10 text-[#00D4FF]"><Target size={40} /></div>
                                       <div className="text-[10px] font-extrabold text-slate-400 tracking-widest mb-1 uppercase">wRC+</div>
                                       <div className="text-3xl font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(0,212,255,0.3)' }}>{profile.wrc_plus != null ? Number(profile.wrc_plus).toFixed(0) : '—'}</div>
                                   </div>
                                   <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)] relative overflow-hidden">
                                       <div className="absolute top-0 right-0 p-2 opacity-10 text-[#00D4FF]"><Activity size={40} /></div>
                                       <div className="text-[10px] font-extrabold text-slate-400 tracking-widest mb-1 uppercase">wOBA</div>
                                       <div className="text-3xl font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(0,212,255,0.3)' }}>{profile.woba != null ? Number(profile.woba).toFixed(3) : '—'}</div>
                                   </div>
                                   <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)] relative overflow-hidden">
                                       <div className="absolute top-0 right-0 p-2 opacity-10 text-slate-400"><User size={40} /></div>
                                       <div className="text-[10px] font-extrabold text-slate-400 tracking-widest mb-1 uppercase">Plate Appearances</div>
                                       <div className="text-3xl font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{profile.pa || '—'}</div>
                                   </div>
                               </>
                           ) : (
                               <>
                                   <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)] relative overflow-hidden">
                                       <div className="absolute top-0 right-0 p-2 opacity-10 text-[#00D4FF]"><Shield size={40} /></div>
                                       <div className="text-[10px] font-extrabold text-slate-400 tracking-widest mb-1 uppercase">FIP</div>
                                       <div className="text-3xl font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(0,212,255,0.3)' }}>{profile.fip != null ? Number(profile.fip).toFixed(2) : '—'}</div>
                                   </div>
                                   <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)] relative overflow-hidden">
                                       <div className="absolute top-0 right-0 p-2 opacity-10 text-[#00D4FF]"><Activity size={40} /></div>
                                       <div className="text-[10px] font-extrabold text-slate-400 tracking-widest mb-1 uppercase">SIERA</div>
                                       <div className="text-3xl font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif', textShadow: '0 0 10px rgba(0,212,255,0.3)' }}>{profile.siera != null ? Number(profile.siera).toFixed(2) : '—'}</div>
                                   </div>
                                   <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)] relative overflow-hidden">
                                       <div className="absolute top-0 right-0 p-2 opacity-10 text-slate-400"><User size={40} /></div>
                                       <div className="text-[10px] font-extrabold text-slate-400 tracking-widest mb-1 uppercase">Batters Faced</div>
                                       <div className="text-3xl font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>{profile.bf || '—'}</div>
                                   </div>
                               </>
                           )}
                       </div>

                       {/* Secondary Metrics / Full Vault */}
                       <h2 className="text-base font-extrabold text-white mb-4 uppercase tracking-widest pl-2 border-l-[3px] border-[#00D4FF]" style={{ fontFamily: '"Rajdhani", sans-serif' }}>Advanced Metrics Vault</h2>
                       <div className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 shadow-[0_4px_15px_rgba(0,0,0,0.3)]">
                           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                               {Object.keys(profile)
                                   .filter(k => !isPrimaryStat(k) && profile[k] !== null && typeof profile[k] !== 'object')
                                   .map(key => (
                                       <div key={key} className="bg-[#1a2332] border border-[#3d4f5f] rounded-lg p-3 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                                           <div className="text-[9px] font-extrabold text-slate-400 tracking-widest uppercase mb-1 truncate">{key.replace(/_/g, ' ')}</div>
                                           <div className="text-lg font-extrabold text-white" style={{ fontFamily: '"Rajdhani", sans-serif' }}>
                                               {formatValue(key, profile[key])}
                                           </div>
                                       </div>
                                   ))}
                           </div>
                       </div>
                   </>
               )}
            </div>
            <BottomNavBar />
        </div>
    );
}
