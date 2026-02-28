/**
 * My Tournament History
 * /hub/my-tournaments
 * 
 * Player-facing page showing all tournaments a player has entered.
 * Shows tournament cards with: name, date, finish position, payout, buy-in.
 * Links to each tournament's public page for full details.
 * Requires authentication.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import SEOHead from '../../src/components/seo/SEOHead';
import {
    Trophy, DollarSign, Users, Calendar, Loader2,
    ChevronRight
} from 'lucide-react';

function ordinal(n) {
    if (!n) return '—';
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function MyTournaments() {
    const router = useRouter();
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ played: 0, wins: 0, itm: 0, totalPrize: 0, totalBuyin: 0 });

    useEffect(() => {
        fetchMyTournaments();
    }, []);

    const fetchMyTournaments = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                router.push('/auth/login?redirect=/hub/my-tournaments');
                setLoading(false);
                return;
            }

            const res = await fetch('/api/commander/tournaments/my?limit=50', {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            const json = await res.json();

            if (json.success && json.data?.registrations) {
                const regs = json.data.registrations;
                setTournaments(regs);

                const played = regs.length;
                const wins = regs.filter(r => r.finish_position === 1).length;
                const itm = regs.filter(r => r.prize_amount > 0).length;
                const totalPrize = regs.reduce((sum, r) => sum + (r.prize_amount || 0), 0);
                const totalBuyin = regs.reduce((sum, r) => sum + (r.buyin || 0) + (r.fee || 0), 0);
                setStats({ played, wins, itm, totalPrize, totalBuyin });
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    if (loading) return (
        <div className="min-h-screen bg-[#18191A] flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
        </div>
    );

    const roi = stats.totalBuyin > 0 ? ((stats.totalPrize - stats.totalBuyin) / stats.totalBuyin * 100).toFixed(0) : '0';

    return (
        <>
            <SEOHead title="My Tournaments" description="Your tournament history on Smarter.Poker" noindex={true} />
            <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter'] pb-20">
                {/* Header */}
                <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.back()} className="text-[#B0B3B8] active:text-white">←</button>
                        <div>
                            <h1 className="text-xl font-bold text-white">My Tournaments</h1>
                            <p className="text-xs text-[#B0B3B8]">{stats.played} tournaments played</p>
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
                            <p className="text-[#B0B3B8] text-sm">No tournaments yet</p>
                            <p className="text-[#6A6B6D] text-xs mt-1">Enter a tournament to see your history here</p>
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
