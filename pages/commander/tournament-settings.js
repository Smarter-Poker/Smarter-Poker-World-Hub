/**
 * Tournament Settings — Template picker, blind structure editor, defaults
 * Users can select from 6 pre-built templates or create custom ones
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
    Trophy, Zap, Crown, Target, RefreshCw, Rocket,
    ChevronRight, Settings, Clock, Loader2, Eye, Copy,
    DollarSign, Layers, Users, Coffee
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';
import BlindStructureEditor from '../../src/components/commander/tournaments/BlindStructureEditor';
import {
    TOURNAMENT_TEMPLATES,
    TOURNAMENT_TYPES,
    formatBuyin,
    formatChips,
    estimateDuration
} from '../../src/components/commander/tournaments/tournamentTemplates';

const ICON_MAP = {
    Trophy, Zap, Crown, Target, RefreshCw, Rocket,
};

export default function TournamentSettingsPage() {
    const router = useRouter();
    const [staff, setStaff] = useState(null);
    const [venue, setVenue] = useState(null);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [viewingStructure, setViewingStructure] = useState(null);
    const [creating, setCreating] = useState(false);
    const [createSuccess, setCreateSuccess] = useState(null);

    useEffect(() => {
        const storedStaff = localStorage.getItem('commander_staff');
        if (!storedStaff) { router.push('/commander/login'); return; }
        try {
            const staffData = JSON.parse(storedStaff);
            if (!staffData.venue_id) { router.push('/commander/login'); return; }
            setStaff(staffData);
            setVenue({ id: staffData.venue_id, name: staffData.venue_name });
        } catch { router.push('/commander/login'); }
    }, [router]);

    async function useTemplate(template) {
        setCreating(true);
        setCreateSuccess(null);

        // Build the tournament payload from template
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(19, 0, 0, 0);

        try {
            const res = await fetch('/api/commander/tournaments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    venue_id: venue.id,
                    name: template.name,
                    tournament_type: template.tournament_type,
                    buyin_amount: template.buyin_amount,
                    buyin_fee: template.buyin_fee,
                    starting_chips: template.starting_chips,
                    scheduled_start: tomorrow.toISOString(),
                    blind_structure: template.blind_structure,
                    late_registration_levels: template.late_registration_levels,
                    allows_rebuys: template.allows_rebuys || false,
                    rebuy_amount: template.rebuy_amount || null,
                    rebuy_chips: template.rebuy_chips || null,
                    max_rebuys: template.max_rebuys || null,
                    rebuy_end_level: template.rebuy_end_level || null,
                    allows_addon: template.allows_addon || false,
                    addon_amount: template.addon_amount || null,
                    addon_chips: template.addon_chips || null,
                    addon_at_break: template.addon_at_break || null,
                    bounty_amount: template.bounty_amount || null,
                    status: 'scheduled',
                    broadcast_to_smarter: true,
                }),
            });

            const data = await res.json();
            if (data.success) {
                setCreateSuccess(template.name);
                // Auto-sync to Club Page
                try {
                    await fetch('/api/commander/sync-tournament-to-club', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            venue_id: venue.id,
                            tournament: data.data?.tournament || {
                                name: template.name,
                                tournament_type: template.tournament_type,
                                buyin_amount: template.buyin_amount,
                                buyin_fee: template.buyin_fee,
                                scheduled_start: tomorrow.toISOString(),
                                starting_chips: template.starting_chips,
                                guaranteed_pool: null,
                            },
                        }),
                    });
                } catch (syncErr) {
                    console.warn('Club Page sync skipped:', syncErr);
                }

                setTimeout(() => setCreateSuccess(null), 4000);
            }
        } catch (err) {
            console.error('Failed to create tournament:', err);
        } finally {
            setCreating(false);
        }
    }

    if (!staff) {
        return (
            <div className="cmd-page flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
        );
    }

    return (
        <CommanderLayout title={`Tournament Settings | ${venue?.name || 'Commander'}`}>
            <Head>
                <title>Tournament Settings | Club Commander</title>
            </Head>
            <div className="cmd-page">
                <div className="max-w-4xl mx-auto px-4 py-4 space-y-6">

                    {/* Success Banner */}
                    {createSuccess && (
                        <div className="p-3 bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg flex items-center gap-3 animate-fadeIn">
                            <Trophy className="w-5 h-5 text-[#10B981]" />
                            <span className="text-sm text-[#10B981] font-medium">
                                "{createSuccess}" created and added to schedule. Edit details in Tournament Manager.
                            </span>
                        </div>
                    )}

                    {/* Section Header */}
                    <div>
                        <h1 className="text-xl font-bold text-white">Tournament Templates</h1>
                        <p className="text-sm text-[#64748B] mt-1">
                            Choose a pre-built template to instantly create a tournament with expert blind structures, or view the structure details first.
                        </p>
                    </div>

                    {/* Template Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {TOURNAMENT_TEMPLATES.map((template) => {
                            const IconComponent = ICON_MAP[template.icon] || Trophy;
                            const isExpanded = viewingStructure === template.id;

                            return (
                                <div key={template.id} className="cmd-panel overflow-hidden">
                                    {/* Card Header */}
                                    <div className="p-4">
                                        <div className="flex items-start gap-3">
                                            <div
                                                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                                                style={{ backgroundColor: `${template.color}20` }}
                                            >
                                                <IconComponent className="w-5 h-5" style={{ color: template.color }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-semibold text-white">{template.name}</h3>
                                                <p className="text-xs text-[#64748B] mt-0.5 line-clamp-2">{template.description}</p>
                                            </div>
                                        </div>

                                        {/* Stats Row */}
                                        <div className="grid grid-cols-4 gap-2 mt-3">
                                            <div className="text-center">
                                                <p className="text-xs text-[#64748B]">Buy-in</p>
                                                <p className="text-sm font-medium text-white">
                                                    {formatBuyin(template.buyin_amount, template.buyin_fee, 0)}
                                                </p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs text-[#64748B]">Chips</p>
                                                <p className="text-sm font-medium text-white">{formatChips(template.starting_chips)}</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs text-[#64748B]">Duration</p>
                                                <p className="text-sm font-medium text-[#22D3EE]">{template.estimated_duration}</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs text-[#64748B]">Type</p>
                                                <p className="text-sm font-medium capitalize" style={{ color: template.color }}>
                                                    {template.tournament_type}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Extra Info for Bounty/Rebuy */}
                                        {(template.bounty_amount > 0 || template.allows_rebuys) && (
                                            <div className="mt-2 flex gap-2 flex-wrap">
                                                {template.bounty_amount > 0 && (
                                                    <span className="px-2 py-0.5 bg-[#EF4444]/10 rounded text-xs text-[#EF4444]">
                                                        ${template.bounty_amount} bounty
                                                    </span>
                                                )}
                                                {template.allows_rebuys && (
                                                    <span className="px-2 py-0.5 bg-[#10B981]/10 rounded text-xs text-[#10B981]">
                                                        Rebuys L1-{template.rebuy_end_level}
                                                    </span>
                                                )}
                                                {template.allows_addon && (
                                                    <span className="px-2 py-0.5 bg-[#A855F7]/10 rounded text-xs text-[#A855F7]">
                                                        Add-on: {formatChips(template.addon_chips)} chips
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Action Buttons */}
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={() => useTemplate(template)}
                                                disabled={creating}
                                                className="flex-1 h-9 cmd-btn cmd-btn-primary flex items-center justify-center gap-2 text-sm font-medium rounded-lg"
                                            >
                                                {creating ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Copy className="w-3.5 h-3.5" />
                                                        Use Template
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => setViewingStructure(isExpanded ? null : template.id)}
                                                className="h-9 px-3 bg-[#0D192E] hover:bg-[#132240] rounded-lg transition-colors flex items-center gap-1.5 text-sm text-[#94A3B8]"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                                {isExpanded ? 'Hide' : 'View'} Structure
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Blind Structure */}
                                    {isExpanded && (
                                        <div className="border-t border-[#1E3A5F] p-4 bg-[#0A1628]">
                                            <BlindStructureEditor
                                                structure={template.blind_structure}
                                                onChange={() => { }}
                                                readOnly={true}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Quick Actions */}
                    <div className="space-y-3">
                        <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                onClick={() => router.push('/commander/tournaments')}
                                className="cmd-panel p-4 flex items-center gap-3 hover:bg-[#132240] transition-colors text-left"
                            >
                                <div className="w-10 h-10 bg-[#22D3EE]/10 rounded-lg flex items-center justify-center">
                                    <Trophy className="w-5 h-5 text-[#22D3EE]" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">Tournament Manager</p>
                                    <p className="text-xs text-[#64748B]">View, edit, and manage all tournaments</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-[#64748B] ml-auto" />
                            </button>

                            <button
                                onClick={() => router.push('/commander/tournament-clock')}
                                className="cmd-panel p-4 flex items-center gap-3 hover:bg-[#132240] transition-colors text-left"
                            >
                                <div className="w-10 h-10 bg-[#F59E0B]/10 rounded-lg flex items-center justify-center">
                                    <Clock className="w-5 h-5 text-[#F59E0B]" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">Tournament Clock</p>
                                    <p className="text-xs text-[#64748B]">Run the live tournament clock display</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-[#64748B] ml-auto" />
                            </button>
                        </div>
                    </div>

                    {/* Tournament Type Reference */}
                    <div className="space-y-3">
                        <h2 className="text-lg font-semibold text-white">Tournament Types Reference</h2>
                        <div className="cmd-panel p-4">
                            <div className="space-y-3">
                                {TOURNAMENT_TYPES.map((type) => (
                                    <div key={type.value} className="flex items-start gap-3 py-2 border-b border-[#1E3A5F]/50 last:border-0">
                                        <span className="text-sm font-medium text-[#22D3EE] capitalize min-w-[100px]">{type.label}</span>
                                        <span className="text-sm text-[#94A3B8]">{type.description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
        </CommanderLayout>
    );
}
