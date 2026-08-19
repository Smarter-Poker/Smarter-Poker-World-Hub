/**
 * My Tournament History
 * /hub/my-tournaments
 * 
 * Player-facing page showing all tournaments a player has entered.
 * Shows tournament cards with: name, date, finish position, payout, buy-in.
 * Links to each tournament's public page for full details.
 * Requires authentication.
 */
import { useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import { useRequireAuth, getAccessToken, getAuthUser } from '../../src/lib/authUtils';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import SEOHead from '../../src/components/seo/SEOHead';
import {
    Trophy, DollarSign, Users, Calendar, Loader2,
    ChevronRight
} from 'lucide-react';

function ordinal(n) {
    if (!n) return '-';
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function MyTournaments() {
    const router = useRouter();
    // Resilient auth gate — waits for Supabase session to stabilize
    const { user: authUser, checking: authChecking } = useRequireAuth('/hub/my-tournaments');
    useTrainingBus('my-tournaments');
    const sessionToken = authChecking ? null : getAccessToken();

    // SWR-backed tournament fetch — only fires once token is available
    const { data: swrData, isLoading: swrLoading, mutate } = useSWR(
        sessionToken ? ['/api/commander/tournaments/my?limit=50', sessionToken] : null,
        ([url, token]) => fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(json => json.success && json.data?.registrations ? json.data.registrations : [])
    );

    // Realtime: revalidate SWR when my tournament registrations change status
    useEffect(() => {
        const authUser = getAuthUser();
        if (!authUser?.id) return;

        // Subscribe to tournament_registrations changes for this user
        const regChannel = supabase
            .channel(`my-tournaments:${authUser.id}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'tournament_registrations',
                filter: `user_id=eq.${authUser.id}`,
            }, () => { mutate(); })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    console.warn('[MyTournaments] Realtime channel status:', status);
                }
            });

        // Also listen for tournament status changes (cancellations, completions).
        // 2026-07-20 club-arena retirement: repointed from the legacy
        // club_tournaments table (dead since 2026-03) to canonical tournaments —
        // status changes now happen there, so this channel fires again.
        const tournChannel = supabase
            .channel(`my-tournaments-status:${authUser.id}`)
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'tournaments',
            }, (payload) => {
                // Only revalidate if this tournament is in our list
                const knownIds = (swrData || []).map(r => r.tournament_id);
                if (knownIds.includes(payload.new?.id)) mutate();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(regChannel);
            supabase.removeChannel(tournChannel);
        };
    }, [sessionToken, mutate]);

    const loading = authChecking || swrLoading;
    const tournaments = swrData || [];
    const stats = {
        played: tournaments.length,
        wins: tournaments.filter(r => r.finish_position === 1).length,
        itm: tournaments.filter(r => r.prize_amount > 0).length,
        totalPrize: tournaments.reduce((sum, r) => sum + (r.prize_amount || 0), 0),
        totalBuyin: tournaments.reduce((sum, r) => sum + (r.buyin || 0) + (r.fee || 0), 0),
    };

    if (loading) return (
        <div className="min-h-screen bg-[#18191A] pb-20">
            <style>{`
                @keyframes mt-shimmer { 0% { background-position: -600px 0; } 100% { background-position: 600px 0; } }
                .mt-skel { background-image: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%); background-size: 600px 100%; animation: mt-shimmer 1.4s ease-in-out infinite; border-radius: 6px; }
            `}</style>
            {/* Header */}
            <div style={{ background: '#242526', borderBottom: '1px solid #3A3B3C', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="mt-skel" style={{ width: 20, height: 20, borderRadius: 4 }} />
                    <div>
                        <div className="mt-skel" style={{ width: 160, height: 20, marginBottom: 6 }} />
                        <div className="mt-skel" style={{ width: 120, height: 12 }} />
                    </div>
                </div>
            </div>
            {/* Stats grid skeleton */}
            <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[1,2,3,4].map(i => (
                    <div key={i} style={{ background: '#242526', border: '1px solid #3A3B3C', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                        <div className="mt-skel" style={{ width: 36, height: 22, margin: '0 auto 6px' }} />
                        <div className="mt-skel" style={{ width: 44, height: 10, margin: '0 auto' }} />
                    </div>
                ))}
            </div>
            {/* Tournament row skeletons */}
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3,4,5].map(i => (
                    <div key={i} style={{ background: '#242526', border: '1px solid #3A3B3C', borderRadius: 12, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                                <div className="mt-skel" style={{ width: '65%', height: 14, marginBottom: 8 }} />
                                <div className="mt-skel" style={{ width: '45%', height: 11 }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                <div className="mt-skel" style={{ width: 40, height: 16 }} />
                                <div className="mt-skel" style={{ width: 16, height: 16 }} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const roi = stats.totalBuyin > 0 ? ((stats.totalPrize - stats.totalBuyin) / stats.totalBuyin * 100).toFixed(0) : '0';

    return (
        <>
            <SEOHead title="My Tournaments" description="Your Tournament History On Smarter.Poker" noindex={true} />
            <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter'] pb-20">
                {/* Header */}
                <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.back()} className="text-[#B0B3B8] active:text-white">←</button>
                        <div>
                            <h1 className="text-xl font-bold text-white">My Tournaments</h1>
                            <p className="text-xs text-[#B0B3B8]">{stats.played} Tournaments Played</p>
                        </div>
                    </div>
                </div>

                {/* Stats Summary */}
                <div className="px-4 mt-4 grid grid-cols-4 gap-2">
                    <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-3 text-center">
                        <p className="text-lg font-bold text-white">{stats.played}</p>
                        <p className="text-[9px] text-[#B0B3B8] uppercase">Played</p>
                    </div>
                    <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-3 text-center">
                        <p className="text-lg font-bold text-[#F59E0B]">{stats.wins}</p>
                        <p className="text-[9px] text-[#B0B3B8] uppercase">Wins</p>
                    </div>
                    <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-3 text-center">
                        <p className="text-lg font-bold text-[#31A24C]">${stats.totalPrize.toLocaleString()}</p>
                        <p className="text-[9px] text-[#B0B3B8] uppercase">Won</p>
                    </div>
                    <div className="bg-[#242526] border border-[#3A3B3C] rounded-xl p-3 text-center">
                        <p className={`text-lg font-bold ${Number(roi) >= 0 ? 'text-[#31A24C]' : 'text-[#EF4444]'}`}>{roi}%</p>
                        <p className="text-[9px] text-[#B0B3B8] uppercase">ROI</p>
                    </div>
                </div>

                {/* Tournament List */}
                <div className="px-4 mt-4 space-y-2">
                    {tournaments.length === 0 ? (
                        <div className="text-center py-12">
                            <Trophy className="w-12 h-12 text-[#3A3B3C] mx-auto mb-3" />
                            <p className="text-[#B0B3B8] text-sm">No Tournaments Yet</p>
                            <p className="text-[#6A6B6D] text-xs mt-1">Enter A Tournament To See Your History Here</p>
                        </div>
                    ) : tournaments.map(t => {
                        const isWin = t.finish_position === 1;
                        const isITM = t.prize_amount > 0;
                        const isLive = ['running', 'break', 'final_table'].includes(t.tournament_status);
                        return (
                            <button key={t.id}
                                onClick={() => router.push(`/commander/tournaments/${t.tournament_id}/public`)}
                                className="w-full bg-[#242526] border border-[#3A3B3C] rounded-xl p-4 text-left active:bg-[#3A3B3C] transition-colors">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {isWin && <Trophy className="w-4 h-4 text-[#F59E0B] flex-shrink-0" />}
                                            <h3 className="text-sm font-bold text-white truncate">{t.tournament_name || 'Tournament'}</h3>
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] text-[#B0B3B8]">
                                            {t.scheduled_start && (
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {new Date(t.scheduled_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1">
                                                <DollarSign className="w-3 h-3" />${t.buyin || 0}
                                            </span>
                                            {t.entries && (
                                                <span className="flex items-center gap-1">
                                                    <Users className="w-3 h-3" />{t.entries}
                                                </span>
                                            )}
                                        </div>
                                        {t.venue && (
                                            <p className="text-[10px] text-[#6A6B6D] mt-1">{t.venue.name}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                        <div className="text-right">
                                            {isLive && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#31A24C]/15 text-[10px] font-bold text-[#31A24C]">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[#31A24C] animate-pulse" />LIVE
                                                </span>
                                            )}
                                            {t.finish_position && (
                                                <p className={`text-sm font-bold ${isWin ? 'text-[#F59E0B]' : isITM ? 'text-[#31A24C]' : 'text-[#B0B3B8]'}`}>
                                                    {ordinal(t.finish_position)}
                                                </p>
                                            )}
                                            {isITM && (
                                                <p className="text-xs font-semibold text-[#31A24C]">${t.prize_amount.toLocaleString()}</p>
                                            )}
                                            {!t.finish_position && !isLive && t.status === 'registered' && (
                                                <span className="text-[10px] text-[#1877F2] font-semibold">Registered</span>
                                            )}
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-[#3A3B3C]" />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Branding */}
                <div className="mt-8 text-center">
                    <p className="text-white/10 text-xs tracking-wider">Powered By Smarter.Poker</p>
                </div>
            </div>
        </>
    );
}
