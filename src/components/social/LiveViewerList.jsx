/**
 * LiveViewerList — Slide-up sheet showing who's watching.
 *
 * STREAM-BUG-11 upgrades:
 *   - Search input filters by username OR full_name (case-insensitive).
 *   - Optional `currentUser` + `inviteCode` props enable an Invite button
 *     per row that DMs the stream link via the in-app messenger (same
 *     shape as GuestInviteModal.sendInvite).
 *   - "Recent chats" section: the broadcaster's 10 most recent messenger
 *     contacts who are NOT currently watching, so they can be invited.
 */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getAccessToken } from '../../lib/authUtils';

export function LiveViewerList({ streamId, viewerCount, isOpen, onClose, currentUser, inviteCode }) {
    const [viewers, setViewers] = useState([]);
    const [recentChats, setRecentChats] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [invitingIds, setInvitingIds] = useState(new Set());
    const [invitedIds, setInvitedIds] = useState(new Set());
    // BUG-FIX-DEEP-AUDIT-R5 VL-4: track per-avatar failure so a broken
    // avatar URL falls back to the default rather than showing a broken-
    // image icon.
    const [failedAvatars, setFailedAvatars] = useState({});

    useEffect(() => {
        if (!isOpen || !streamId) return;
        // BUG FIX (L3): mounted flag prevents stale setState if isOpen toggles
        // false while the two-step query is still in-flight.
        let mounted = true;

        const loadViewers = async () => {
            if (!mounted) return;
            setLoading(true);
            // BUG-FIX-DEEP-AUDIT-R5 VL-1: order by last_seen_at desc so we
            // get the actually-watching-right-now viewers. The previous
            // version did .limit(50) without order, which returned an
            // arbitrary 50 — on streams with 1000+ viewers, this was
            // whoever's row Postgres happened to scan first.
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const { data: rows } = await supabase
                .from('live_viewers')
                .select('viewer_id, last_seen_at')
                .eq('stream_id', streamId)
                .gte('last_seen_at', fiveMinAgo)
                .order('last_seen_at', { ascending: false })
                .limit(50);
            if (!mounted) return;
            if (!rows?.length) { setViewers([]); }
            else {
                const ids = rows.map(r => r.viewer_id);
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .in('id', ids);
                if (!mounted) return;
                const profileMap = new Map((profiles || []).map(p => [p.id, p]));
                const ordered = ids.map(id => profileMap.get(id)).filter(Boolean);
                setViewers(ordered);
            }
            setLoading(false);
        };

        // STREAM-BUG-11 + AUDIT-FIX-1: pull recent messenger contacts via the
        // canonical API. The previous code queried a non-existent
        // 'messenger_messages' table (the real schema is social_conversations
        // + social_conversation_participants + social_messages) so the
        // recent-chats section was always empty in production.
        // /api/messenger/get-conversations returns the user's 1-on-1
        // conversations sorted by last_message_at desc, with otherUser
        // already joined to the profile.
        const loadRecentChats = async () => {
            if (!currentUser?.id) return;
            try {
                const token = getAccessToken();
                if (!token) { setRecentChats([]); return; }
                const resp = await fetch('/api/messenger/get-conversations', {
                    method: 'GET',
                    headers: { Authorization: `Bearer ${token}` },
                });
                const json = await resp.json().catch(() => ({}));
                if (!mounted) return;
                if (!resp.ok || !Array.isArray(json?.conversations)) {
                    setRecentChats([]); return;
                }
                const partners = [];
                const seen = new Set([currentUser.id]);
                for (const c of json.conversations) {
                    if (c.is_group) continue;
                    // get-conversations shapes each row as
                    //   { id, otherUser:{ id, username, full_name, avatar_url }, ... }
                    const o = c.otherUser || c.other_user || null;
                    const otherId = o?.id || c.other_user_id || null;
                    if (!otherId || seen.has(otherId)) continue;
                    seen.add(otherId);
                    partners.push({
                        id: otherId,
                        username: o?.username || c.other_user_username || null,
                        full_name: o?.full_name || o?.display_name || null,
                        avatar_url: o?.avatar_url || c.other_user_avatar || null,
                    });
                    if (partners.length >= 10) break;
                }
                // Hydrate any partner whose API row lacked a username/full_name.
                const needsHydrate = partners.filter(p => !p.username && !p.full_name).map(p => p.id);
                if (needsHydrate.length) {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, username, full_name, avatar_url')
                        .in('id', needsHydrate);
                    if (!mounted) return;
                    const pmap = new Map((profiles || []).map(p => [p.id, p]));
                    for (const p of partners) {
                        const fresh = pmap.get(p.id);
                        if (fresh) Object.assign(p, fresh);
                    }
                }
                setRecentChats(partners);
            } catch (_) { /* non-fatal — recent-chats is a nice-to-have */ }
        };

        loadViewers();
        loadRecentChats();

        // BUG-FIX-DEEP-AUDIT-R5 VL-3: subscribe to live_viewers changes
        // while the panel is open. Without this, the list was a one-shot
        // snapshot — new viewers joining or leaving were invisible until
        // the user closed and reopened. We debounce by re-running the
        // load query (not patching state row-by-row) because the two-step
        // join-profiles pattern is simpler than maintaining incremental
        // state. Bounded by panel-open lifetime.
        let debounceTimer = null;
        const ch = supabase.channel(`live-viewers-list-${streamId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'live_viewers', filter: `stream_id=eq.${streamId}` },
                () => {
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        if (mounted) loadViewers();
                    }, 1500);  // batch a burst of viewer changes
                })
            .subscribe();

        return () => {
            mounted = false;
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(ch);
        };
    }, [isOpen, streamId]);

    // Apply search filter (case-insensitive on username + full_name).
    // Watchers come first; recentChats filtered to exclude anyone already
    // in the viewers list (no duplicates) and the current user.
    const watcherIdSet = useMemo(() => new Set(viewers.map(v => v.id)), [viewers]);
    const filteredViewers = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return viewers;
        return viewers.filter(v =>
            (v.username || '').toLowerCase().includes(q) ||
            (v.full_name || '').toLowerCase().includes(q)
        );
    }, [viewers, search]);
    const filteredRecentChats = useMemo(() => {
        const q = search.trim().toLowerCase();
        return recentChats.filter(p => {
            if (watcherIdSet.has(p.id)) return false;
            if (currentUser?.id && p.id === currentUser.id) return false;
            if (!q) return true;
            return (p.username || '').toLowerCase().includes(q) ||
                   (p.full_name || '').toLowerCase().includes(q);
        });
    }, [recentChats, watcherIdSet, search, currentUser?.id]);

    // STREAM-BUG-11 + AUDIT-FIX-1: send-invite-to-stream helper.
    // Uses the canonical two-step messenger API path (identical to
    // GoLiveModal.GuestInviteModal.sendInvite):
    //   1. POST /api/messenger/start-conversation { otherUserId }
    //      → returns { success, conversationId } (server RPC handles
    //        get-or-create + participant rows + friend/request gating).
    //   2. POST /api/messenger/send-message { conversationId, content,
    //        message_type:'text' } with Authorization: Bearer <token>.
    //        Content uses [LIVE_INVITE]room=…&invite=… so the messenger
    //        UI renders a live-stream invite card.
    //
    // The previous version did a direct supabase insert into a phantom
    // 'messenger_messages' table — wrong name, no conversation_id FK,
    // no participant validation, errors silently swallowed.
    const sendStreamInvite = async (recipientId) => {
        if (!recipientId || !currentUser?.id || !inviteCode || !streamId) return;
        if (invitedIds.has(recipientId) || invitingIds.has(recipientId)) return;
        setInvitingIds(prev => new Set([...prev, recipientId]));
        try {
            const token = getAccessToken();
            if (!token) throw new Error('Not authenticated');

            const convResp = await fetch('/api/messenger/start-conversation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ otherUserId: recipientId }),
            });
            const convData = await convResp.json().catch(() => ({}));
            if (!convResp.ok || !convData?.conversationId) {
                throw new Error(convData?.error || 'Could not open conversation');
            }
            const convId = convData.conversationId;

            const inviteQs = `room=${streamId}&invite=${inviteCode}`;
            const msgResp = await fetch('/api/messenger/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    conversationId: convId,
                    content: `[LIVE_INVITE]${inviteQs}`,
                    message_type: 'text',
                }),
            });
            if (!msgResp.ok) {
                const msgData = await msgResp.json().catch(() => ({}));
                throw new Error(msgData?.error || 'Send failed');
            }
            setInvitedIds(prev => new Set([...prev, recipientId]));
        } catch (err) {
            console.warn('[LiveViewerList] sendStreamInvite failed:', err?.message || err);
        } finally {
            setInvitingIds(prev => { const n = new Set(prev); n.delete(recipientId); return n; });
        }
    };

    if (!isOpen) return null;

    // BUG-FIX-DEEP-AUDIT-R5 VL-5: derive anonymous-viewer count. The
    // live_viewers table has no row for anonymous viewers (the viewer_id
    // FK requires a profile). viewer_count is the authoritative LiveKit-
    // participant count from the broadcaster, so the gap = anon viewers.
    const safeCount = Number.isFinite(viewerCount) ? viewerCount : 0;
    const anonCount = Math.max(0, safeCount - viewers.length);
    const canInvite = !!(currentUser?.id && inviteCode);

    return (
        <div
            onClick={onClose}
            style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.4)', zIndex: 50,
                display: 'flex', alignItems: 'flex-end',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%',
                    background: 'rgba(18,18,30,0.97)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '20px 20px 0 0',
                    padding: '16px 0 32px',
                    maxHeight: '60vh',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* Handle */}
                <div style={{
                    width: 40, height: 4, background: 'rgba(255,255,255,0.3)',
                    borderRadius: 2, margin: '0 auto 16px',
                }} />

                <div style={{ padding: '0 20px', color: 'white', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
                    {/* BUG-FIX-DEEP-AUDIT-R5 VL-2: NaN coercion */}
                    {safeCount} Watching
                </div>

                {/* STREAM-BUG-11: search input. fontSize:16 to avoid iOS auto-zoom. */}
                <div style={{ padding: '0 20px 12px' }}>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search viewers and contacts..."
                        aria-label="Search viewers"
                        style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: 22,
                            border: '1px solid rgba(255,255,255,0.18)',
                            background: 'rgba(0,0,0,0.4)',
                            color: 'white',
                            fontSize: 16,
                            outline: 'none',
                        }}
                    />
                </div>

                <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px' }}>
                    {loading && (
                        <div style={{ color: 'rgba(255,255,255,0.4)', padding: '24px', textAlign: 'center', fontSize: 14 }}>
                            Loading viewers...
                        </div>
                    )}
                    {!loading && filteredViewers.length === 0 && filteredRecentChats.length === 0 && anonCount === 0 && (
                        <div style={{ color: 'rgba(255,255,255,0.4)', padding: '24px', textAlign: 'center', fontSize: 14 }}>
                            {search.trim() ? 'No matches' : 'No viewers yet'}
                        </div>
                    )}
                    {filteredViewers.length > 0 && (
                        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, letterSpacing: 0.5, padding: '4px 8px 6px', textTransform: 'uppercase' }}>
                            Watching now
                        </div>
                    )}
                    {filteredViewers.map(viewer => (
                        <div key={viewer.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 8px', borderRadius: 12,
                        }}>
                            <img
                                src={failedAvatars[viewer.id] ? '/default-avatar.png' : (viewer.avatar_url || '/default-avatar.png')}
                                alt={viewer.username}
                                onError={() => setFailedAvatars(prev => ({ ...prev, [viewer.id]: true }))}
                                style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                            />
                            <span style={{ color: 'white', fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {viewer.username || viewer.full_name || 'Anonymous'}
                            </span>
                        </div>
                    ))}
                    {/* BUG-FIX-DEEP-AUDIT-R5 VL-5: anonymous-viewer footer. */}
                    {!loading && anonCount > 0 && (
                        <div style={{
                            color: 'rgba(255,255,255,0.5)', padding: '12px 8px 4px',
                            fontSize: 13, textAlign: 'center', fontStyle: 'italic',
                        }}>
                            + {anonCount.toLocaleString()} anonymous viewer{anonCount === 1 ? '' : 's'}
                        </div>
                    )}
                    {/* STREAM-BUG-11: recent chats — invite friends to the stream */}
                    {filteredRecentChats.length > 0 && (
                        <>
                            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, letterSpacing: 0.5, padding: '12px 8px 6px', textTransform: 'uppercase' }}>
                                Recent chats
                            </div>
                            {filteredRecentChats.map(p => {
                                const inviting = invitingIds.has(p.id);
                                const invited = invitedIds.has(p.id);
                                return (
                                    <div key={p.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 8px', borderRadius: 12,
                                    }}>
                                        <img
                                            src={failedAvatars[p.id] ? '/default-avatar.png' : (p.avatar_url || '/default-avatar.png')}
                                            alt={p.username || ''}
                                            onError={() => setFailedAvatars(prev => ({ ...prev, [p.id]: true }))}
                                            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                                        />
                                        <span style={{ color: 'white', fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {p.username || p.full_name || 'Unknown'}
                                        </span>
                                        {canInvite && (
                                            <button
                                                type="button"
                                                onClick={() => sendStreamInvite(p.id)}
                                                disabled={inviting || invited}
                                                aria-label={`Invite ${p.username || p.full_name || 'user'} to stream`}
                                                style={{
                                                    padding: '6px 14px',
                                                    borderRadius: 999,
                                                    border: 'none',
                                                    background: invited ? 'rgba(255,255,255,0.12)' : 'rgba(0,102,255,0.85)',
                                                    color: invited ? 'rgba(255,255,255,0.6)' : 'white',
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    cursor: inviting || invited ? 'default' : 'pointer',
                                                }}
                                            >
                                                {invited ? 'Invited' : inviting ? '...' : 'Invite'}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default LiveViewerList;
