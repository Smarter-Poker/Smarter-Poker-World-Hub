/**
 * Player Tournament Status / My Chips
 * /hub/commander/tournament/[id]/my-status
 * 
 * Allows authenticated players to:
 * - View their tournament status (chips, position, table/seat)
 * - Self-report their chip count (WSOP+ feature)
 * - See tournament info (current level, blinds, players remaining)
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../../../src/lib/supabase';
import SEOHead from '../../../../../src/components/seo/SEOHead';
import TournamentStoryCard from '../../../../../src/components/social/TournamentStoryCard';
import { Trophy, Users, Loader2, CheckCircle2, ChevronLeft, Coins, TrendingUp, Hash, Bell, Share2, Camera } from 'lucide-react';
import useTournamentRealtime from '../../../../../src/hooks/useTournamentRealtime';
import { useRequireAuth, getAccessToken } from '../../../../../src/lib/authUtils';
import useTrainingBus from '../../../../../src/hooks/useTrainingBus';
import { busEmit } from '../../../../../src/engine/EventBus';
import CommanderPageShell from '../../../../../src/components/commander/CommanderPageShell';

const parseBlinds = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.length > 0) { try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch (e) { console.warn('[App] Handled exception:', e); } }
  return [];
};

export default function MyTournamentStatus() {
    const router = useRouter();
    const { id } = router.query;
    const { user: authUser, checking: authChecking } = useRequireAuth(`/hub/commander/tournament/${id}/my-status`);
    useTrainingBus('tournament-my-status');
    const [tournament, setTournament] = useState(null);
    const [myEntry, setMyEntry] = useState(null);
    // Alternates queue placement. RLS hides other players' entries, so the
    // 1-based queue position can only come from the server
    // (GET /api/commander/tournaments/[id]/my-chips).
    const [queueInfo, setQueueInfo] = useState({ position: null, ahead: null });
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
        if (!id || !authUser) return;
        try {

            // Fetch all data directly from Supabase (tournament APIs require staff auth)
            // RLS on commander_tournaments and commander_tournament_entries allows SELECT for all users
            const [tResult, entryResult] = await Promise.all([
                supabase
                    .from('commander_tournaments')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle(),
                // A cancelled entry can coexist with a live re-registration, so
                // exclude cancelled rows and take one - otherwise .maybeSingle()
                // errors on multiple rows and the page shows "not registered".
                supabase
                    .from('commander_tournament_entries')
                    .select('*')
                    .eq('tournament_id', id)
                    .eq('player_id', authUser.id)
                    .neq('status', 'cancelled')
                    .order('registered_at', { ascending: false, nullsFirst: false })
                    .limit(1)
                    .maybeSingle()
            ]);

            // Parse tournament
            if (tResult.data) {
                setTournament(tResult.data);

                // Build clock from tournament data
                const t = tResult.data;
                const blindStructure = parseBlinds(t.blind_structure);
                const currentLevel = t.current_level || 0;
                const currentBlind = blindStructure[currentLevel] || null;
                const settings = t.settings || {};
                const clockState = settings.clock_state || null;

                if (currentBlind) {
                    // Break-aware level number: breaks occupy structure slots but do
                    // not consume a level number (matches the clock API's
                    // currentBlind.level numbering).
                    let displayLevel = 0;
                    for (let i = 0; i <= currentLevel && i < blindStructure.length; i++) {
                        if (!blindStructure[i]?.is_break) displayLevel++;
                    }
                    let timeRemaining = 0;
                    if (clockState) {
                        const levelDuration = (currentBlind.duration ?? currentBlind.duration_minutes ?? 0) * 60 * 1000;
                        const elapsed = clockState.isRunning
                            ? Date.now() - new Date(clockState.levelStartedAt).getTime() - (clockState.pausedDuration || 0)
                            : clockState.pausedAt
                                ? new Date(clockState.pausedAt).getTime() - new Date(clockState.levelStartedAt).getTime() - (clockState.pausedDuration || 0)
                                : 0;
                        timeRemaining = Math.max(0, Math.floor((levelDuration - elapsed) / 1000));
                    }
                    setClock({
                        current_level: displayLevel || 1,
                        is_break: !!currentBlind.is_break,
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

            // Server-side view of my own entry. This is the only source for the
            // alternates queue position (RLS hides other players' rows), and it
            // is authoritative for status/seat, so it wins on conflict.
            let serverEntry = null;
            let position = null;
            let ahead = null;
            try {
                const token = getAccessToken();
                if (token) {
                    const res = await fetch(`/api/commander/tournaments/${id}/my-chips`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const json = await res.json();
                        if (json?.success) {
                            serverEntry = json.data?.entry || null;
                            position = json.data?.queue_position ?? null;
                            ahead = json.data?.alternates_ahead ?? null;
                        }
                    }
                }
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

            setQueueInfo({ position, ahead });

            // Parse my entry (local row supplies fields the server subset omits,
            // e.g. entry_number; the server subset overrides where they overlap)
            const mergedEntry = (entryResult.data || serverEntry)
                ? { ...(entryResult.data || {}), ...(serverEntry || {}) }
                : null;
            if (mergedEntry) {
                setMyEntry(mergedEntry);
                // Seed the input once. The 30s poll must not overwrite a count
                // the player is part way through typing.
                setChipValue(prev => (prev !== '' ? prev : String(mergedEntry.current_chips || '')));
            }
        } catch (err) { console.warn(err); setError('Failed To Load Tournament Data'); }
        finally { setLoading(false); }
    }, [id, authUser]);

    useEffect(() => { if (authChecking) return; let active = true; fetchData(); return () => { active = false; }; }, [fetchData, authChecking]);
    // PERF 2026-08-24: a raw channel used to live here subscribing to
    // commander_tournaments (UPDATE, id=eq.<id>) and commander_tournament_entries
    // (*, tournament_id=eq.<id>) - the EXACT two tables useTournamentRealtime
    // below already subscribes to. Every entry change therefore ran fetchData()
    // TWICE for every player watching, and the raw channel had no debounce, so a
    // table break or a chip-count pass fired one full refetch per player per row
    // changed. useTournamentRealtime is the better implementation of the same
    // thing (it also covers commander_tables, debounces bursts, keeps the
    // callback in a ref so it never resubscribes, and cleans up properly), so
    // the duplicate is deleted rather than debounced.
    //
    // Supabase Realtime - instant sync when tournament/player data changes
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
            console.warn('Push permission error:', err);
        } finally {
            setPushRequesting(false);
        }
    };

    const handleShareStory = async (storyType = 'chip_update') => {
        if (sharingStory) return;
        setSharingStory(true);
        setStoryShared(false);
        try {
            const token = getAccessToken();
            if (!token) return;

            const res = await fetch(`/api/commander/tournaments/${id}/story`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    story_type: storyType,
                    chip_count: myEntry?.current_chips,
                    finish_position: myEntry?.finish_position,
                    payout_amount: myEntry?.payout_amount
                })
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) {
                busEmit.dataMutated('tournaments');
                setStoryShared(true);
                setShowStoryPreview(false);
                setTimeout(() => setStoryShared(false), 3000);
            }
        } catch (err) {
            console.warn('Share story error:', err);
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
            const token = getAccessToken();
            const res = await fetch(`/api/commander/tournaments/${id}/my-chips`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ chips: parseInt(chipValue) || 0 })
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.success) {
                busEmit.dataMutated('tournaments');
                setSaved(true);
                setMyEntry(prev => ({ ...prev, current_chips: json.data?.current_chips ?? prev?.current_chips }));
                setTimeout(() => setSaved(false), 3000);
            } else {
                const errText = typeof json.error === 'string' ? json.error : json.error?.message;
                setError(errText || 'Failed To Update');
            }
        } catch (err) { setError('Network Error'); }
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
        <div className="min-h-screen bg-[#18191A] pb-20">
            <style>{`@keyframes ms-shim{0%{background-position:-500px 0}100%{background-position:500px 0}}.ms-sk{background-image:linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.11) 50%,rgba(255,255,255,0.04) 100%);background-size:500px 100%;animation:ms-shim 1.4s ease-in-out infinite;border-radius:6px}`}</style>
            {/* Header skeleton */}
            <div style={{ background: '#242526', borderBottom: '1px solid #3A3B3C', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="ms-sk" style={{ width: 20, height: 20 }} />
                    <div style={{ flex: 1 }}>
                        <div className="ms-sk" style={{ width: '60%', height: 18, marginBottom: 6 }} />
                        <div className="ms-sk" style={{ width: '30%', height: 12 }} />
                    </div>
                </div>
            </div>
            {/* Clock card skeleton */}
            <div style={{ margin: '16px', background: '#242526', border: '1px solid #3A3B3C', borderRadius: 16, padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
                    {[1,2,3].map(i => (
                        <div key={i}>
                            <div className="ms-sk" style={{ width: 36, height: 10, margin: '0 auto 8px' }} />
                            <div className="ms-sk" style={{ width: 50, height: 22, margin: '0 auto' }} />
                        </div>
                    ))}
                </div>
            </div>
            {/* Player info card skeleton */}
            <div style={{ margin: '0 16px 12px', background: '#242526', border: '1px solid #3A3B3C', borderRadius: 16, padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
                    {[1,2,3].map(i => (
                        <div key={i}>
                            <div className="ms-sk" style={{ width: 20, height: 20, margin: '0 auto 8px', borderRadius: '50%' }} />
                            <div className="ms-sk" style={{ width: 44, height: 20, margin: '0 auto 4px' }} />
                            <div className="ms-sk" style={{ width: 36, height: 8, margin: '0 auto' }} />
                        </div>
                    ))}
                </div>
            </div>
            {/* Chip count panel skeleton */}
            <div style={{ margin: '0 16px', background: '#242526', border: '1px solid #3A3B3C', borderRadius: 16, padding: 16 }}>
                <div className="ms-sk" style={{ width: 160, height: 14, marginBottom: 12 }} />
                <div className="ms-sk" style={{ width: '100%', height: 56, borderRadius: 12, marginBottom: 12 }} />
                <div className="ms-sk" style={{ width: '100%', height: 44, borderRadius: 12 }} />
            </div>
        </div>
    );

    if (!tournament) return (
        <div className="min-h-screen bg-[#18191A] flex items-center justify-center p-6">
            <p className="text-[#B0B3B8] text-lg">Tournament Not Found</p>
        </div>
    );

    const t = tournament;
    const isLive = ['running', 'break', 'final_table'].includes(t.status);
    const isEliminated = myEntry?.status === 'eliminated';
    // Field was full at registration time: the player holds a place in the
    // alternates queue and has no stack until a seat opens.
    const isAlternate = myEntry?.status === 'alternate';

    return (
        <CommanderPageShell>
        <>
            <SEOHead title={`${t.name} - My Status`} description="Your Tournament Status" noindex={true} />
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
                                <p className="text-xs text-[#B0B3B8]">Get Alerts For Blinds, Breaks, And Seat Assignments</p>
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
                                <p className="text-xl font-bold text-white">{clock.is_break ? 'Break' : (clock.current_level || '?')}</p>
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
                                    Blinds: <span className="font-bold text-white">{clock.small_blind?.toLocaleString()}/{clock.big_blind?.toLocaleString()}</span>
                                    {clock.ante > 0 && <span className="text-[#F59E0B]"> Ante {clock.ante.toLocaleString()}</span>}
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
                        <p className="text-[#B0B3B8]">You Are Not Registered In This Tournament</p>
                        <button onClick={() => router.push(`/hub/commander/tournament/${id}/register`)}
                            className="mt-3 px-6 py-2.5 bg-[#1877F2] text-white rounded-xl text-sm font-medium active:bg-[#1565D8]">
                            Register Now
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Alternates List State */}
                        {isAlternate && (
                            <div className="mx-4 mt-4 bg-[#242526] border border-[#F59E0B]/40 rounded-2xl p-5 text-center">
                                <div className="w-12 h-12 rounded-full bg-[#F59E0B]/10 flex items-center justify-center mx-auto mb-3">
                                    <Users className="w-6 h-6 text-[#F59E0B]" />
                                </div>
                                <p className="text-base font-bold text-white">You Are On The Alternates List</p>
                                {queueInfo.position ? (
                                    <>
                                        <p className="text-4xl font-bold text-[#F59E0B] mt-3 leading-none">
                                            #{queueInfo.position.toLocaleString()}
                                        </p>
                                        <p className="text-[10px] text-[#B0B3B8] uppercase tracking-wide mt-1">Your Place In Line</p>
                                        <p className="text-sm text-[#B0B3B8] mt-3">
                                            {queueInfo.ahead === 0
                                                ? 'You Are Next Up'
                                                : `${(queueInfo.ahead ?? 0).toLocaleString()} ${queueInfo.ahead === 1 ? 'Player Is' : 'Players Are'} Ahead Of You`}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-sm text-[#B0B3B8] mt-3">Your Place In Line Is Being Confirmed</p>
                                )}
                                <p className="text-xs text-[#6A6B6D] mt-4 leading-relaxed">
                                    The Field Is Currently Full. You Will Be Seated Automatically As Seats Open, In The Order You Joined The List. You Do Not Need To Do Anything.
                                </p>
                                <p className="text-xs text-[#6A6B6D] mt-2 leading-relaxed">
                                    We Will Send You A Notification With Your Table And Seat The Moment You Are Seated.
                                </p>
                                {!pushEnabled && (
                                    <p className="text-[10px] text-[#F59E0B] mt-3">
                                        Enable Notifications Above So You Do Not Miss Your Seat
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Player Info Card (alternates have no stack or seat yet) */}
                        {!isAlternate && (
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
                                        {myEntry.table_number ? `T${myEntry.table_number}` : '-'}
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
                        )}

                        {/* Eliminated Banner */}
                        {isEliminated && (
                            <div className="mx-4 mt-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl p-4 text-center">
                                <p className="text-sm font-bold text-[#EF4444]">Eliminated, {myEntry.finish_position ? `Finished ${myEntry.finish_position}${myEntry.finish_position === 1 ? 'st' : myEntry.finish_position === 2 ? 'nd' : myEntry.finish_position === 3 ? 'rd' : 'th'}` : 'Better Luck Next Time'}</p>
                                {myEntry.payout_amount > 0 && (
                                    <p className="text-lg font-bold text-[#31A24C] mt-1">${myEntry.payout_amount.toLocaleString()}</p>
                                )}
                            </div>
                        )}

                        {/* Chip Count Entry (active players only - an alternate
                            has no stack to report until they are seated) */}
                        {isLive && !isEliminated && !isAlternate && (
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
                                    placeholder="Enter Your Current Chips"
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
                                    Self-Reported Counts Are Visible On The Public Tournament Page And Leaderboard
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

                        {/* Share to Story (nothing to share until seated) */}
                        {!isAlternate && (
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
                                    <Share2 className="w-4 h-4" /> Share To Story
                                </button>
                            )}
                        </div>
                        )}
                    </>
                )}

                {/* Branding */}
                <div className="mt-8 text-center">
                    <p className="text-white/10 text-xs tracking-wider">Powered By Smarter.Poker</p>
                </div>
            </div>
        </>
        </CommanderPageShell>
    );
}
