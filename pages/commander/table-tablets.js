/**
 * Table Tablets — Selector
 * Lists all tables with their current status and mode (cash/tournament/inactive)
 * Tapping a table opens the dealer tablet view for that table
 * Route: /commander/table-tablets
 *
 * This is the "Table Tablets" feature from the dashboard.
 * Each table's dealer tablet is at /commander/dealer/[tableNumber]
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { Monitor, Users, Loader2, ChevronRight, Power, DollarSign, Trophy } from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const MODE_CONFIG = {
    cash: { bg: 'bg-[#31A24C]/10', text: 'text-[#31A24C]', label: 'Cash Game', icon: DollarSign },
    tournament: { bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', label: 'Tournament', icon: Trophy },
    inactive: { bg: 'bg-[#B0B3B8]/10', text: 'text-[#B0B3B8]', label: 'Inactive', icon: Power },
};

export default function TableTabletsSelector() {
    const router = useRouter();
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const staff = localStorage.getItem('commander_staff');
        if (!staff) { router.push('/commander/login').catch(() => { }); return; }

        const fetchTables = async () => {
            try {
                const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
                const res = await fetch('/api/commander/tables', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (data.success) {
                    // Sort: active tables first (cash/tournament), then inactive
                    const sorted = (data.data || data.tables || []).sort((a, b) => {
                        const order = { cash: 0, tournament: 1, inactive: 2 };
                        return (order[a.mode] ?? 2) - (order[b.mode] ?? 2) || (a.table_number || 0) - (b.table_number || 0);
                    });
                    setTables(sorted);
                }
            } catch (err) { console.error(err); }
            finally { setLoading(false); }
        };
        fetchTables();
    }, [router]);

    const openTablet = (tableNumber) => {
        router.push(`/commander/dealer/${tableNumber}`);
    };

    return (
        <CommanderLayout title="Table Tablets | Commander" backHref="/commander/dashboard?card=floor">
            <SEOHead title="Commander — Table Tablets" description="Club Commander Poker Room Management Tool." noindex={true} />
            <div className="cmd-page">
                <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-[#1877F2]/10 rounded-lg flex items-center justify-center">
                            <Monitor className="w-5 h-5 text-[#1877F2]" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">Table Tablets</h1>
                            <p className="text-sm text-[#64748B]">Select a table to open its dealer tablet view</p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-20 text-center">
                            <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin mx-auto" />
                        </div>
                    ) : tables.length === 0 ? (
                        <div className="cmd-panel p-8 text-center">
                            <Monitor className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                            <p className="text-[#64748B] mb-4">No tables configured</p>
                            <button onClick={() => router.push('/commander/tables')}
                                className="px-4 py-2 cmd-btn cmd-btn-primary rounded-lg text-sm font-medium">
                                Go to Table Management
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {tables.map(table => {
                                const mode = MODE_CONFIG[table.mode] || MODE_CONFIG.inactive;
                                const ModeIcon = mode.icon;
                                const isActive = table.mode === 'cash' || table.mode === 'tournament';
                                return (
                                    <button key={table.id || table.table_number} onClick={() => openTablet(table.table_number)}
                                        className={`w-full cmd-panel p-4 flex items-center gap-4 hover:bg-[#132240] transition-colors text-left ${isActive ? 'border-[#1877F2]/20' : ''}`}>
                                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-xl ${isActive ? 'bg-[#1877F2]/10 text-[#1877F2]' : 'bg-[#0D192E] text-[#4A5E78]'}`}>
                                            {table.table_number}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-white">Table {table.table_number}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${mode.bg} ${mode.text}`}>
                                                    <ModeIcon className="w-3 h-3" />
                                                    {mode.label}
                                                </span>
                                                {table.game_type && <span className="text-xs text-[#64748B]">{table.game_type}</span>}
                                                {table.stakes && <span className="text-xs text-[#64748B]">{table.stakes}</span>}
                                            </div>
                                        </div>
                                        {table.seated_count > 0 && (
                                            <div className="flex items-center gap-1 text-sm text-[#B0B3B8]">
                                                <Users className="w-4 h-4" />
                                                <span>{table.seated_count}/{table.max_seats || 9}</span>
                                            </div>
                                        )}
                                        <ChevronRight className="w-5 h-5 text-[#64748B] flex-shrink-0" />
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <p className="text-xs text-[#4A5E78] text-center mt-6">
                        Opens the dealer tablet view — seat players via QR scan, track time, manage the table
                    </p>
                </div>
            </div>
        </CommanderLayout>
    );
}
