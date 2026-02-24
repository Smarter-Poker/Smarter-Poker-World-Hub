/**
 * Tournament Controls — Selector
 * Lists active tournaments, navigates to the Tournament Director control center
 * Route: /commander/tournament-controls
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { Trophy, Users, Clock, Loader2, ChevronRight, Play, Pause } from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const STATUS_COLORS = {
    running: { bg: 'bg-[#31A24C]/10', text: 'text-[#31A24C]', label: 'Running' },
    break: { bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', label: 'On Break' },
    final_table: { bg: 'bg-[#8B5CF6]/10', text: 'text-[#8B5CF6]', label: 'Final Table' },
    registering: { bg: 'bg-[#1877F2]/10', text: 'text-[#1877F2]', label: 'Registration' },
    scheduled: { bg: 'bg-[#B0B3B8]/10', text: 'text-[#B0B3B8]', label: 'Scheduled' },
};

export default function TournamentControlsSelector() {
    const router = useRouter();
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const staff = localStorage.getItem('commander_staff');
        if (!staff) { router.push('/commander/login').catch(() => { }); return; }

        const fetchTournaments = async () => {
            try {
                const staffSession = localStorage.getItem('commander_staff') || '';
                const res = await fetch('/api/commander/tournaments', {
                    headers: { 'x-staff-session': staffSession },
                });
                const data = await res.json();
                if (data.success) {
                    const order = ['running', 'break', 'final_table', 'registering', 'scheduled'];
                    const active = (data.data?.tournaments || [])
                        .filter(t => !['completed', 'cancelled'].includes(t.status))
                        .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
                    setTournaments(active);
                }
            } catch (err) { console.error(err); }
            finally { setLoading(false); }
        };
        fetchTournaments();
    }, [router]);

    return (
        <CommanderLayout title="Tournament Controls | Commander" backHref="/commander/dashboard?card=tournaments">
            <SEOHead title="Commander — Tournament Controls" description="Club Commander Poker Room Management Tool." noindex={true} />
            <div className="cmd-page">
                <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-[#10B981]/10 rounded-lg flex items-center justify-center">
                            <Play className="w-5 h-5 text-[#10B981]" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">Tournament Controls</h1>
                            <p className="text-sm text-[#64748B]">Select a tournament to open the TD control center</p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-20 text-center">
                            <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin mx-auto" />
                        </div>
                    ) : tournaments.length === 0 ? (
                        <div className="cmd-panel p-8 text-center">
                            <Trophy className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                            <p className="text-[#64748B] mb-4">No active tournaments</p>
                            <button onClick={() => router.push('/commander/tournaments')}
                                className="px-4 py-2 cmd-btn cmd-btn-primary rounded-lg text-sm font-medium">
                                Go to Tournament Manager
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {tournaments.map(t => {
                                const sc = STATUS_COLORS[t.status] || STATUS_COLORS.scheduled;
                                const isLive = ['running', 'break', 'final_table'].includes(t.status);
                                return (
                                    <button key={t.id} onClick={() => router.push(`/commander/td/${t.id}`)}
                                        className={`w-full cmd-panel p-4 flex items-center gap-4 hover:bg-[#132240] transition-colors text-left ${isLive ? 'border-[#10B981]/30' : ''}`}>
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isLive ? 'bg-[#10B981]/10' : 'bg-[#0D192E]'}`}>
                                            {isLive
                                                ? <Play className="w-6 h-6 text-[#10B981]" />
                                                : <Clock className="w-6 h-6 text-[#4A5E78]" />
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-white truncate">{t.name}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${sc.bg} ${sc.text}`}>{sc.label}</span>
                                                {t.player_count > 0 && (
                                                    <span className="text-xs text-[#64748B] flex items-center gap-1">
                                                        <Users className="w-3 h-3" /> {t.player_count}
                                                    </span>
                                                )}
                                                {t.current_level > 0 && <span className="text-xs text-[#64748B]">Level {t.current_level}</span>}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-[#64748B] flex-shrink-0" />
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <p className="text-xs text-[#4A5E78] text-center mt-6">
                        Opens the Tournament Director tablet — clock, tables, players, registrations, and balance
                    </p>
                </div>
            </div>
        </CommanderLayout>
    );
}
