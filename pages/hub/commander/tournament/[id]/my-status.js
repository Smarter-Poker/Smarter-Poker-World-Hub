/**
 * Player Tournament Status / My Chips
 * /hub/commander/tournament/[id]/my-status
 * 
 * Allows authenticated players to:
 * - View their tournament status (chips, position, table/seat)
 * - Self-report their chip count (WSOP+ feature)
 * - See tournament info (current level, blinds, players remaining)
 */
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../../../src/lib/supabase';
import SEOHead from '../../../../../src/components/seo/SEOHead';
import TournamentStoryCard from '../../../../../src/components/social/TournamentStoryCard';
import { Trophy, Users, Clock, Loader2, CheckCircle2, ChevronLeft, Coins, TrendingUp, Hash, Bell, Share2, Camera } from 'lucide-react';
import useTournamentRealtime from '../../../../../src/hooks/useTournamentRealtime';

export default function MyTournamentStatus() {
    const router = useRouter();
    if (!router.isReady) return null;
    const { id } = router.query;
    const [tournament, setTournament] = useState(null);
    const [myEntry, setMyEntry] = useState(null);
    const [clock, setClock] = useState(null);
    const [loading, setLoading] = useState(true);
    const [chipValue, setChipValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState(null);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [pushRequesting, setPushRequesting] = useState(false);
    const [sharingStory, setSharingStory] = useState(false);
    const [storyShared, setStoryShared] = useState(false);
    const [showStoryPreview, setShowStoryPreview] = useState(false);

    const fetchData = useCallback(async () => {
        if (!id) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                router.push(`/auth/login?redirect=/hub/commander/tournament/${id}/my-status`);
                return;
            }

            // Fetch all data directly from Supabase (tournament APIs require staff auth)
            // RLS on commander_tournaments and commander_tournament_entries allows SELECT for all users
            const [tResult, entryResult] = await Promise.all([
                supabase
                    .from('commander_tournaments')
                    .select('*')
                    .eq('id', id)
                    .single(),
                supabase
                    .from('commander_tournament_entries')
                    .select('*')
                    .eq('tournament_id', id)
                    .eq('player_id', session.user.id)
                    .single()
            ]);

            // Parse tournament
            if (tResult.data) {
                setTournament(tResult.data);

                // Build clock from tournament data
                const t = tResult.data;
                const blindStructure = t.blind_structure || [];
                const currentLevel = t.current_level || 0;
                const currentBlind = blindStructure[currentLevel] || null;
                const settings = t.settings || {};
                const clockState = settings.clock_state || null;

                if (currentBlind) {
                    let timeRemaining = 0;
                    if (clockState) {
                        const levelDuration = (currentBlind.duration || 0) * 60 * 1000;
                        const elapsed = clockState.isRunning
                            ? Date.now() - new Date(clockState.levelStartedAt).getTime() - (clockState.pausedDuration || 0)
                            : clockState.pausedAt
                                ? new Date(clockState.pausedAt).getTime() - new Date(clockState.levelStartedAt).getTime() - (clockState.pausedDuration || 0)
                                : 0;
                        timeRemaining = Math.max(0, Math.floor((levelDuration - elapsed) / 1000));
                    }
                    setClock({
                        current_level: currentLevel + 1,
                        time_remaining: timeRemaining,
                        is_running: clockState?.isRunning || false,
                        small_blind: currentBlind.small_blind,
                        big_blind: currentBlind.big_blind,
                        ante: currentBlind.ante || 0,
                        players_remaining: t.players_remaining,
                        average_stack: t.average_stack
                    });
                }
            }

            // Parse my entry
            if (entryResult.data) {
                setMyEntry(entryResult.data);
                setChipValue(String(entryResult.data.current_chips || ''));
            }
        } catch (err) { console.error(err); setError('Failed to load tournament data'); }
        finally { setLoading(false); }
    }, [id, router]);

    useEffect(() => { let active = true; fetchData(); return () => { active = false; }; }, [fetchData]);

    // Supabase Realtime — instant sync when tournament/player data changes
    useTournamentRealtime(id, fetchData);

    // Fallback polling
    useEffect(() => {
        if (!id) return;
        const _c = new AbortController();
        const interval = setInterval(fetchData, 30000);
        return () => { _c.abort(); clearInterval(interval); };
    }, [id, fetchData]);

    // Check push notification status
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPushEnabled(Notification.permission === 'granted');
        }
    }, []);

    const handleEnablePush = async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        setPushRequesting(true);
        try {
            const result = await Notification.requestPermission();
            setPushEnabled(result === 'granted');
        } catch (err) {
            console.error('Push permission error:', err);
        } finally {
            setPushRequesting(false);
        }
    };

    const handleShareStory = async (storyType = 'chip_update') => {
        if (sharingStory) return;
        setSharingStory(true);
        setStoryShared(false);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return;

            const res = await fetch(`/api/commander/tournaments/${id}/story`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    story_type: storyType,
                    chip_count: myEntry?.current_chips,
                    finish_position: myEntry?.finish_position,
                    payout_amount: myEntry?.payout_amount
                })
            });
            const json = await res.json();
            if (json.success) {
                setStoryShared(true);
                setShowStoryPreview(false);
                setTimeout(() => setStoryShared(false), 3000);
            }
        } catch (err) {
            console.error('Share story error:', err);
        } finally {
            setSharingStory(false);
        }
    };

    const handleUpdateChips = async () => {
        if (!chipValue || saving) return;
        setSaving(true);
        setSaved(false);
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/commander/tournaments/${id}/my-chips`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ chips: parseInt(chipValue) || 0 })
            });
            const json = await res.json();
            if (json.success) {
                setSaved(true);
                setMyEntry(prev => ({ ...prev, current_chips: json.data.current_chips }));
                setTimeout(() => setSaved(false), 3000);
            } else {
                setError(json.error || 'Failed to update');
            }
        } catch (err) { setError('Network error'); }
        finally { setSaving(false); }
    };

    const formatChips = (n) => {
        if (!n) return '0';
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
        return n.toLocaleString();
    };

    const formatTime = (s) => {
        if (!s && s !== 0) return '--:--';
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    if (loading) return (
        <div className="min-h-screen bg-[#18191A] flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
        </div>
    );

    if (!tournament) return (
        <div className="min-h-screen bg-[#18191A] flex items-center justify-center p-6">
            <p className="text-[#B0B3B8] text-lg">Tournament not found</p>
        </div>
    );

    const t = tournament;
    const isLive = ['running', 'break', 'final_table'].includes(t.status);
    const isEliminated = myEntry?.status === 'eliminated';

    return (
        <>
            <SEOHead title={`${t.name} — My Status`} description="Your tournament status" noindex={true} />
            <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter'] pb-20">
                {/* Header */}
                <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.back()} className="text-[#B0B3B8] active:text-white">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-lg font-bold text-white truncate">{t.name}</h1>
                            <p className="text-xs text-[#B0B3B8]">
                                {isLive ? (
                                    <span className="inline-flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#31A24C] animate-pulse" />
                                        Live
                                    </span>
                                ) : t.status}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Push Notification Opt-In */}
                {!pushEnabled && (
                    <div className="mx-4 mt-4 bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#1877F2]/10 flex items-center justify-center flex-shrink-0">
                                <Bell className="w-5 h-5 text-[#1877F2]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white">Enable Notifications</p>
                                <p className="text-xs text-[#B0B3B8]">Get alerts for blinds, breaks, and seat assignments</p>
                            </div>
                            <button
                                onClick={handleEnablePush}
                                disabled={pushRequesting}
                                className="px-4 py-2 bg-[#1877F2] text-white rounded-lg text-xs font-semibold active:bg-[#1565D8] disabled:opacity-50 flex-shrink-0"
                            >
                                {pushRequesting ? 'Enabling...' : 'Enable'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Clock Info (if live) */}
                {isLive && clock && (
                    <div className="mx-4 mt-4 bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div>
                                <p className="text-xs text-[#B0B3B8] uppercase">Level</p>
                                <p className="text-xl font-bold text-white">{clock.current_level || '?'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-[#B0B3B8] uppercase">Time</p>
                                <p className="text-xl font-mono font-bold text-white">{formatTime(clock.time_remaining)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-[#B0B3B8] uppercase">Players</p>
                                <p className="text-xl font-bold text-white">{clock.players_remaining || '?'}</p>
                            </div>
                        </div>
                        {clock.small_blind && (
                            <div className="mt-3 pt-3 border-t border-[#3A3B3C] text-center">
                                <p className="text-sm text-[#B0B3B8]">
                                    Blinds: <span className="font-bold text-white">{clock.small_blind.toLocaleString()}/{clock.big_blind.toLocaleString()}</span>
                                    {clock.ante > 0 && <span className="text-[#F59E0B]"> ante {clock.ante.toLocaleString()}</span>}
                                </p>
                                {clock.average_stack && (
                                    <p className="text-xs text-[#6A6B6D] mt-1">
                                        Avg Stack: {formatChips(clock.average_stack)}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* My Status */}
                {!myEntry ? (
                    <div className="mx-4 mt-4 bg-[#242526] border border-[#3A3B3C] rounded-2xl p-6 text-center">
                        <Users className="w-10 h-10 text-[#3A3B3C] mx-auto mb-3" />
                        <p className="text-[#B0B3B8]">You are not registered in this tournament</p>
                        <button onClick={() => router.push(`/hub/commander/tournament/${id}/register`)}
                            className="mt-3 px-6 py-2.5 bg-[#1877F2] text-white rounded-xl text-sm font-medium active:bg-[#1565D8]">
                            Register Now
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Player Info Card */}
                        <div className="mx-4 mt-4 bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div>
                                    <Coins className="w-5 h-5 text-[#F59E0B] mx-auto mb-1" />
                                    <p className="text-lg font-bold text-white">{formatChips(myEntry.current_chips)}</p>
                                    <p className="text-[9px] text-[#B0B3B8] uppercase">My Chips</p>
                                </div>
                                <div>
                                    <Hash className="w-5 h-5 text-[#1877F2] mx-auto mb-1" />
                                    <p className="text-lg font-bold text-white">
                                        {myEntry.table_number ? `T${myEntry.table_number}` : '—'}
                                        {myEntry.seat_number ? `/S${myEntry.seat_number}` : ''}
                                    </p>
                                    <p className="text-[9px] text-[#B0B3B8] uppercase">Table/Seat</p>
                                </div>
                                <div>
                                    <TrendingUp className="w-5 h-5 text-[#31A24C] mx-auto mb-1" />
                                    <p className="text-lg font-bold text-white">
                                        {myEntry.finish_position ? `${myEntry.finish_position}` : isEliminated ? 'Out' : 'Active'}
                                    </p>
                                    <p className="text-[9px] text-[#B0B3B8] uppercase">Status</p>
                                </div>
                            </div>
                        </div>

                        {/* Eliminated Banner */}
                        {isEliminated && (
                            <div className="mx-4 mt-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl p-4 text-center">
                                <p className="text-sm font-bold text-[#EF4444]">Eliminated — {myEntry.finish_position ? `Finished ${myEntry.finish_position}${myEntry.finish_position === 1 ? 'st' : myEntry.finish_position === 2 ? 'nd' : myEntry.finish_position === 3 ? 'rd' : 'th'}` : 'Better luck next time'}</p>
                                {myEntry.payout_amount > 0 && (
                                    <p className="text-lg font-bold text-[#31A24C] mt-1">${myEntry.payout_amount.toLocaleString()}</p>
                                )}
                            </div>
                        )}

                        {/* Chip Count Entry (if still active and tournament is live) */}
                        {isLive && !isEliminated && (
                            <div className="mx-4 mt-4 bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
                                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                    <Coins className="w-4 h-4 text-[#F59E0B]" />
                                    Update My Chip Count
                                </h3>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    value={chipValue}
                                    onChange={e => setChipValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && chipValue) handleUpdateChips(); }}
                                    placeholder="Enter your current chips"
                                    className="w-full px-4 py-4 bg-[#18191A] border-2 border-[#3A3B3C] rounded-xl text-2xl font-mono font-bold text-white text-center focus:border-[#1877F2] focus:outline-none"
                                />
                                <button
                                    onClick={handleUpdateChips}
                                    disabled={saving || !chipValue || saved}
                                    className={`w-full mt-3 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 ${saved ? 'bg-[#31A24C]/20 text-[#31A24C] border border-[#31A24C]/30' : 'bg-[#1877F2] text-white active:bg-[#1565D8]'} disabled:opacity-50`}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
                                    {saved ? 'Updated!' : saving ? 'Saving...' : 'Update Chips'}
                                </button>
                                {error && <p className="text-xs text-[#EF4444] mt-2 text-center">{error}</p>}
                                <p className="text-[10px] text-[#6A6B6D] mt-2 text-center">
                                    Self-reported counts are visible on the public tournament page and leaderboard
                                </p>
                            </div>
                        )}

                        {/* Quick Link to Public Page */}
                        <div className="mx-4 mt-4">
                            <button onClick={() => router.push(`/commander/tournaments/${id}/public`)}
                                className="w-full py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl text-sm text-[#B0B3B8] font-medium flex items-center justify-center gap-2 active:bg-[#3A3B3C]">
                                <Trophy className="w-4 h-4" /> View Public Tournament Page
                            </button>
                        </div>

                        {/* Share to Story */}
                        <div className="mx-4 mt-3">
                            {storyShared ? (
                                <div className="w-full py-3 bg-[#31A24C]/10 border border-[#31A24C]/30 rounded-xl text-sm text-[#31A24C] font-medium flex items-center justify-center gap-2">
                                    <CheckCircle2 className="w-4 h-4" /> Story Shared!
                                </div>
                            ) : showStoryPreview ? (
                                <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
                                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                        <Camera className="w-4 h-4 text-[#1877F2]" />
                                        Share Tournament Story
                                    </h3>
                                    <div className="flex justify-center mb-3">
                                        <TournamentStoryCard
                                            storyType={isEliminated ? (myEntry.payout_amount > 0 ? 'itm' : 'custom') : 'chip_update'}
                                            tournamentName={t.name}
                                            chipCount={myEntry?.current_chips}
                                            finishPosition={myEntry?.finish_position}
                                            payoutAmount={myEntry?.payout_amount}
                                            compact={true}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowStoryPreview(false)}
                                            className="flex-1 py-2.5 bg-[#3A3B3C] text-white rounded-xl text-sm font-medium active:bg-[#4E4F50]"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => handleShareStory(isEliminated ? (myEntry.payout_amount > 0 ? 'itm' : 'custom') : 'chip_update')}
                                            disabled={sharingStory}
                                            className="flex-1 py-2.5 bg-[#1877F2] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 active:bg-[#1565D8] disabled:opacity-50"
                                        >
                                            {sharingStory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                                            {sharingStory ? 'Sharing...' : 'Share'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowStoryPreview(true)}
                                    className="w-full py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl text-sm text-[#B0B3B8] font-medium flex items-center justify-center gap-2 active:bg-[#3A3B3C]"
                                >
                                    <Share2 className="w-4 h-4" /> Share to Story
                                </button>
                            )}
                        </div>
                    </>
                )}

                {/* Branding */}
                <div className="mt-8 text-center">
                    <p className="text-white/10 text-xs tracking-wider">Powered By Smarter.Poker</p>
                </div>
            </div>
        </>
    );
}
