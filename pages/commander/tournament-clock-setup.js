/**
 * Tournament Clock Setup — Selector
 * Lists tournaments, navigates to their settings page for blind structure / clock configuration
 * Route: /commander/tournament-clock-setup
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { Settings, Clock, Trophy, Loader2, ChevronRight, Layers } from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const STATUS_COLORS = {
    running: { bg: 'bg-[#31A24C]/10', text: 'text-[#31A24C]', label: 'Running' },
    break: { bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', label: 'On Break' },
    final_table: { bg: 'bg-[#8B5CF6]/10', text: 'text-[#8B5CF6]', label: 'Final Table' },
    registering: { bg: 'bg-[#1877F2]/10', text: 'text-[#1877F2]', label: 'Registration' },
    scheduled: { bg: 'bg-[#B0B3B8]/10', text: 'text-[#B0B3B8]', label: 'Scheduled' },
    completed: { bg: 'bg-[#64748B]/10', text: 'text-[#64748B]', label: 'Completed' },
};

export default function TournamentClockSetup() {
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
                    const order = ['scheduled', 'registering', 'running', 'break', 'final_table', 'completed'];
                    const all = (data.data?.tournaments || [])
                        .filter(t => t.status !== 'cancelled')
                        .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
                    setTournaments(all);
                }
            } catch (err) { console.error(err); }
            finally { setLoading(false); }
        };
        fetchTournaments();
    }, [router]);

    return (
        <CommanderLayout title="Clock Setup | Commander" backHref="/commander/dashboard?card=tournaments">
            <SEOHead title="Commander — Tournament Clock Setup" description="Club Commander Poker Room Management Tool." noindex={true} />
            <div className="cmd-page">
                <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-[#22D3EE]/10 rounded-lg flex items-center justify-center">
                            <Settings className="w-5 h-5 text-[#22D3EE]" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">Tournament Clock Setup</h1>
                            <p className="text-sm text-[#64748B]">Configure blind structures, level times, and break intervals</p>
                        </div>
                    </div>

                    {/* Quick link to template settings */}
                    <button onClick={() => router.push('/commander/tournament-settings')}
                        className="w-full cmd-panel p-4 flex items-center gap-4 hover:bg-[#132240] transition-colors text-left border-[#22D3EE]/20">
                        <div className="w-12 h-12 rounded-xl bg-[#22D3EE]/10 flex items-center justify-center">
                            <Layers className="w-6 h-6 text-[#22D3EE]" />
                        </div>
                        <div className="flex-1">
                            <p className="font-medium text-white">Tournament Templates</p>
                            <p className="text-xs text-[#64748B] mt-0.5">Create tournaments from pre-built blind structures</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[#64748B]" />
                    </button>

                    <div className="border-t border-[#1E3A5F] pt-4">
                        <h2 className="text-sm font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">
                            Edit Existing Tournament Clock
                        </h2>
                    </div>

                    {loading ? (
                        <div className="py-20 text-center">
                            <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin mx-auto" />
                        </div>
                    ) : tournaments.length === 0 ? (
                        <div className="cmd-panel p-8 text-center">
                            <Trophy className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                            <p className="text-[#64748B] mb-4">No tournaments found</p>
                            <button onClick={() => router.push('/commander/tournament-settings')}
                                className="px-4 py-2 cmd-btn cmd-btn-primary rounded-lg text-sm font-medium">
                                Create From Template
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {tournaments.map(t => {
                                const sc = STATUS_COLORS[t.status] || STATUS_COLORS.scheduled;
                                const isEditable = ['scheduled', 'registering'].includes(t.status);
                                return (
                                    <button key={t.id} onClick={() => router.push(`/commander/tournaments/${t.id}/settings`)}
                                        className="w-full cmd-panel p-4 flex items-center gap-4 hover:bg-[#132240] transition-colors text-left">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isEditable ? 'bg-[#22D3EE]/10' : 'bg-[#0D192E]'}`}>
                                            <Clock className={`w-6 h-6 ${isEditable ? 'text-[#22D3EE]' : 'text-[#4A5E78]'}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-white truncate">{t.name}</p>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${sc.bg} ${sc.text}`}>{sc.label}</span>
                                                {t.scheduled_start && (
                                                    <span className="text-xs text-[#64748B]">
                                                        {new Date(t.scheduled_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        {' '}
                                                        {new Date(t.scheduled_start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                                    </span>
                                                )}
                                                {t.blind_structure && (
                                                    <span className="text-xs text-[#64748B]">{t.blind_structure.length} levels</span>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-[#64748B] flex-shrink-0" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </CommanderLayout>
    );
}
