/**
 * Tournament Director — Unified Selector
 * Lists all active/scheduled tournaments with 3 actions each:
 *   - TD Controls (floor management)
 *   - Launch Clock (TV/projector display)
 *   - Edit Settings (blind structure, configuration)
 * Route: /commander/tournament-controls
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { Trophy, Users, Clock, Loader2, Play, Monitor, Settings, ChevronRight } from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const STATUS_COLORS = {
    running: { bg: 'bg-[#31A24C]/10', text: 'text-[#31A24C]', label: 'Running' },
    break: { bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', label: 'On Break' },
    final_table: { bg: 'bg-[#8B5CF6]/10', text: 'text-[#8B5CF6]', label: 'Final Table' },
    registering: { bg: 'bg-[#1877F2]/10', text: 'text-[#1877F2]', label: 'Registration' },
    scheduled: { bg: 'bg-[#B0B3B8]/10', text: 'text-[#B0B3B8]', label: 'Scheduled' },
};

export default function TournamentDirector() {
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
        <CommanderLayout title="Tournament Director | Commander" backHref="/commander/dashboard?card=tournaments">
            <SEOHead title="Commander — Tournament Director" description="Club Commander Poker Room Management Tool." noindex={true} />
            <div className="cmd-page">
                <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-[#10B981]/10 rounded-lg flex items-center justify-center">
                            <Trophy className="w-5 h-5 text-[#10B981]" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">Tournament Director</h1>
                            <p className="text-sm text-[#64748B]">Manage live tournaments — controls, clock display, and settings</p>
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
                        <div className="space-y-4">
                            {tournaments.map(t => {
                                const sc = STATUS_COLORS[t.status] || STATUS_COLORS.scheduled;
                                const isLive = ['running', 'break', 'final_table'].includes(t.status);
                                return (
                                    <div key={t.id} className={`cmd-panel overflow-hidden ${isLive ? 'border-[#10B981]/30' : ''}`}>
                                        {/* Tournament Info Header */}
                                        <div className="p-4 pb-3">
                                            <div className="flex items-start gap-3">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isLive ? 'bg-[#10B981]/10' : 'bg-[#0D192E]'}`}>
                                                    <Trophy className={`w-5 h-5 ${isLive ? 'text-[#10B981]' : 'text-[#4A5E78]'}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-white truncate">{t.name}</p>
                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${sc.bg} ${sc.text}`}>{sc.label}</span>
                                                        {t.scheduled_start && (
                                                            <span className="text-xs text-[#64748B]">
                                                                {new Date(t.scheduled_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                                {' '}
                                                                {new Date(t.scheduled_start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                                            </span>
                                                        )}
                                                        {t.player_count > 0 && (
                                                            <span className="text-xs text-[#64748B] flex items-center gap-1">
                                                                <Users className="w-3 h-3" /> {t.player_count}
                                                            </span>
                                                        )}
                                                        {t.current_level > 0 && <span className="text-xs text-[#64748B]">Level {t.current_level}</span>}
                                                    </div>
                                                </div>
                                                {isLive && (
                                                    <span className="flex items-center gap-1 text-xs font-medium text-[#31A24C] flex-shrink-0">
                                                        <span className="w-2 h-2 bg-[#31A24C] rounded-full animate-pulse" />
                                                        LIVE
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="border-t border-[#1E3A5F] grid grid-cols-3 divide-x divide-[#1E3A5F]">
                                            <button
                                                onClick={() => router.push(`/commander/td/${t.id}`)}
                                                className="flex items-center justify-center gap-2 py-3 px-2 hover:bg-[#132240] transition-colors text-sm"
                                            >
                                                <Play className="w-4 h-4 text-[#10B981]" />
                                                <span className="text-[#E4E6EB] font-medium">TD Controls</span>
                                            </button>
                                            <button
                                                onClick={() => window.open(`/commander/tournaments/${t.id}/clock-display`, '_blank')}
                                                className="flex items-center justify-center gap-2 py-3 px-2 hover:bg-[#132240] transition-colors text-sm"
                                            >
                                                <Monitor className="w-4 h-4 text-[#F59E0B]" />
                                                <span className="text-[#E4E6EB] font-medium">Launch Clock</span>
                                            </button>
                                            <button
                                                onClick={() => router.push(`/commander/tournaments/${t.id}/settings`)}
                                                className="flex items-center justify-center gap-2 py-3 px-2 hover:bg-[#132240] transition-colors text-sm"
                                            >
                                                <Settings className="w-4 h-4 text-[#22D3EE]" />
                                                <span className="text-[#E4E6EB] font-medium">Settings</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <p className="text-xs text-[#4A5E78] text-center mt-6">
                        TD Controls = manage clock, players, tables, and balance on a tablet.
                        Launch Clock = full-screen clock display for TV/projector.
                    </p>
                </div>
            </div>
        </CommanderLayout>
    );
}
