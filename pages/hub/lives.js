/* ═══════════════════════════════════════════════════════════════════════════
   LIVES PAGE — TikTok-style fullscreen vertical swipe for browsing live/recorded streams
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { supabase } from '../../src/lib/supabase';
import { LiveStreamViewer } from '../../src/components/social/LiveStreamViewer';

import { useFeatureGate } from '../../src/components/gates/FeatureGatePopup';
import { getAuthUser, authedFetch, getAccessToken } from '../../src/lib/authUtils';

// Colors
const C = {
    bg: '#000',
    text: '#fff',
    textSec: 'rgba(255,255,255,0.7)',
    red: '#FA383E',
    blue: '#1877F2',
};

export default function LivesPage() {
    const router = useRouter();
    const [streams, setStreams] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [touchStart, setTouchStart] = useState(null);
    const [likedStreams, setLikedStreams] = useState({});
    const [shareMsg, setShareMsg] = useState('');
    const [showChat, setShowChat] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatText, setChatText] = useState('');
    const [submittingChat, setSubmittingChat] = useState(false);
    const [likeBusy, setLikeBusy] = useState(false);
    const [shareBusy, setShareBusy] = useState(false);
    const [userId, setUserId] = useState(null);
    const [user, setUser] = useState(null);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [watchingStream, setWatchingStream] = useState(null);
    const [myDrafts, setMyDrafts] = useState([]);
    const [showDrafts, setShowDrafts] = useState(false);
    const [publishingDraft, setPublishingDraft] = useState(null);
    const [publishToast, setPublishToast] = useState(null);  // #5: success feedback
    const [scheduledLives, setScheduledLives] = useState([]); // #20: upcoming scheduled streams
    // BUG FIX (LV-AUDIT-3 restore): countdown tick — drive scheduledLives countdown re-renders.
    const [tick, setTick] = useState(0);
    const containerRef = useRef(null);
    // BUG FIX (LV-AUDIT-7 restore): keep fetchStreams in a ref so realtime channel doesn't
    // re-subscribe on every categoryFilter change.
    const fetchStreamsRef = useRef(null);
    const videoRefs = useRef({});
    // BUG FIX (L-LIVES-1,3,4): store toast/share timer refs for cleanup on unmount
    const publishToastTimerRef = useRef(null);
    const shareMsgTimerRef = useRef(null);

    // Cleanup timer refs on unmount
    useEffect(() => {
        return () => {
            if (publishToastTimerRef.current) clearTimeout(publishToastTimerRef.current);
            if (shareMsgTimerRef.current) clearTimeout(shareMsgTimerRef.current);
        };
    }, []);

    // BUG FIX (LV-AUDIT-3 restore): drive scheduledLives countdown re-renders.
    useEffect(() => {
        if (scheduledLives.length === 0) return;
        const id = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(id);
    }, [scheduledLives.length]);

    // Get auth user for FeatureGate
    useEffect(() => {
        const authUser = getAuthUser();
        if (authUser) {
            setUserId(authUser.id);
            setUser(authUser);
        }
    }, []);

    // ═══ ACTION GATE: Users can explore/watch, but interactions are gated ═══
    const { guardAction, UpgradePopup } = useFeatureGate('lives');

    // Fetch all streams (active lives + recorded)
    const fetchStreams = useCallback(async () => {
        setLoading(true);
        try {
            // Get active live streams
            const { data: liveStreams } = await supabase
                .from('live_streams')
                .select('*, broadcaster:profiles!broadcaster_id(username, avatar_url, full_name)')
                .eq('status', 'live')
                .order('started_at', { ascending: false })
                .limit(50);

            // Get recorded streams with video URLs (posted ones)
            const { data: recordedStreams } = await supabase
                .from('live_streams')
                .select('*, broadcaster:profiles!broadcaster_id(username, avatar_url, full_name)')
                .eq('status', 'ended')
                .eq('is_posted', true)
                .not('video_url', 'is', null)
                .order('created_at', { ascending: false })
                .limit(50);

            // Combine: active lives first, then recorded
            let allStreams = [
                ...(liveStreams || []).map(s => ({ ...s, isLive: true })),
                ...(recordedStreams || []).map(s => ({ ...s, isLive: false }))
            ];

            // Apply category filter if set
            if (categoryFilter !== 'all') {
                allStreams = allStreams.filter(s => s.category === categoryFilter);
            }

            setStreams(allStreams);
        } catch (e) {
            console.warn('fetchStreams error:', e);
        }
        setLoading(false);
    }, [categoryFilter]);

    useEffect(() => {
        fetchStreams();
    }, [fetchStreams]);

    // BUG FIX (LV-AUDIT-7 restore): keep ref synced so realtime subscription's stable-deps
    // closure always invokes the latest fetchStreams.
    useEffect(() => {
        fetchStreamsRef.current = fetchStreams;
    }, [fetchStreams]);

    // BUG FIX (LV-AUDIT-6 restore): seed likedStreams from DB so the UI shows correct
    // liked-state on mount.
    useEffect(() => {
        if (!userId || streams.length === 0) return;
        let cancelled = false;
        (async () => {
            try {
                const ids = streams.map(s => s.id).filter(Boolean);
                if (ids.length === 0) return;
                const { data, error } = await supabase
                    .from('social_interactions')
                    .select('post_id')
                    .eq('user_id', userId)
                    .eq('interaction_type', 'like')
                    .in('post_id', ids);
                if (error || cancelled || !data) return;
                const seeded = {};
                for (const row of data) {
                    if (row.post_id) seeded[row.post_id] = true;
                }
                setLikedStreams(prev => ({ ...seeded, ...prev }));
            } catch (e) { console.warn('seed likes:', e); }
        })();
        return () => { cancelled = true; };
    }, [userId, streams]);

    // Fetch user's draft (saved but not published) streams
    const fetchMyDrafts = useCallback(async () => {
        if (!userId) return;
        try {
            const { data } = await supabase
                .from('live_streams')
                .select('*')
                .eq('broadcaster_id', userId)
                .eq('status', 'ended')
                .eq('is_draft', true)
                .not('video_url', 'is', null)
                .order('created_at', { ascending: false })
                .limit(20);
            setMyDrafts(data || []);
        } catch (e) {
            console.warn('fetchMyDrafts error:', e);
        }
    }, [userId]);

    useEffect(() => {
        fetchMyDrafts();
    }, [fetchMyDrafts]);

    // #20: Fetch upcoming scheduled lives
    const fetchScheduledLives = useCallback(async () => {
        try {
            const { data } = await supabase
                .from('scheduled_lives')
                .select('*, profiles:broadcaster_id(username, avatar_url, full_name)')
                .gte('scheduled_at', new Date().toISOString())
                .order('scheduled_at', { ascending: true })
                .limit(5);
            setScheduledLives(data || []);
        } catch (e) {
            console.warn('fetchScheduledLives error:', e);
        }
    }, []);

    useEffect(() => {
        fetchScheduledLives();
    }, [fetchScheduledLives]);

    // Publish a draft stream to the feed + social posts
    const publishDraft = async (draft) => {
        if (publishingDraft) return;
        setPublishingDraft(draft.id);
        try {
            const token = getAccessToken();
            const resp = await fetch('/api/live/end-stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                credentials: 'same-origin',
                body: JSON.stringify({ stream_id: draft.id, action: 'post', caption: draft.title || 'Live Replay' }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Publish failed');
            // #5: Success toast
            setPublishToast('Stream Published to Feed!');
            // BUG FIX (L-LIVES-1): track timer to prevent setState on unmounted component
            if (publishToastTimerRef.current) clearTimeout(publishToastTimerRef.current);
            publishToastTimerRef.current = setTimeout(() => {
                publishToastTimerRef.current = null;
                setPublishToast(null);
            }, 3000);
            await Promise.all([fetchStreams(), fetchMyDrafts()]);
        } catch (err) {
            console.warn('Publish draft error:', err);
        } finally {
            setPublishingDraft(null);
        }
    };

    // Delete a draft stream
    const deleteDraft = async (draft) => {
        if (!confirm('Delete this saved stream? This cannot be undone.')) return;
        try {
            const token = getAccessToken();
            // BUG FIX (LV-AUDIT-9): fetch resolves with a Response on HTTP 4xx/5xx — it does NOT
            // throw. Previously deleteDraft awaited the fetch and unconditionally ran
            // fetchMyDrafts() afterwards, so a server-side rejection (RLS denial, banned user,
            // 500) showed the user a refreshed list as if the delete succeeded. Destructive-action
            // UI lie. Now we check resp.ok explicitly (matching publishDraft's pattern at L177)
            // and surface failures via a toast so the user knows the draft is still there.
            const resp = await fetch('/api/live/end-stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                credentials: 'same-origin',
                body: JSON.stringify({ stream_id: draft.id, action: 'delete' }),
            });
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                throw new Error(data.error || `Delete failed (${resp.status})`);
            }
            await fetchMyDrafts();
        } catch (err) {
            console.warn('Delete draft error:', err);
            // Surface the failure so the user knows the draft is still present
            setPublishToast('Could not delete draft — please try again');
            if (publishToastTimerRef.current) clearTimeout(publishToastTimerRef.current);
            publishToastTimerRef.current = setTimeout(() => {
                publishToastTimerRef.current = null;
                setPublishToast(null);
            }, 4000);
        }
    };

    // Handle ?id= deep link — jump to specific stream after load
    useEffect(() => {
        if (!router.isReady || !streams.length || !router.query.id) return;
        const idx = streams.findIndex(s => s.id === router.query.id);
        if (idx !== -1) {
            setCurrentIndex(idx);
            router.replace('/hub/lives', undefined, { shallow: true });
        }
    }, [streams, router.isReady, router.query.id]);

    // Handle swipe navigation
    const handleTouchStart = (e) => {
        setTouchStart(e.touches[0].clientY);
    };

    const handleTouchEnd = (e) => {
        if (!touchStart) return;

        const touchEnd = e.changedTouches[0].clientY;
        const diff = touchStart - touchEnd;

        // BUG FIX (LV-AUDIT-8 restore): clamp boundary inside functional updater.
        const max = streams.length - 1;
        if (Math.abs(diff) > 50) {
            if (diff > 0) {
                setCurrentIndex(prev => prev < max ? prev + 1 : prev);
            } else {
                setCurrentIndex(prev => prev > 0 ? prev - 1 : prev);
            }
        }
        setTouchStart(null);
    };

    // Handle wheel scroll
    // BUG FIX (LV-AUDIT-8 restore): clamp via functional updater; drop currentIndex from deps.
    const handleWheel = useCallback((e) => {
        if (e.deltaY > 30) {
            setCurrentIndex(prev => prev < streams.length - 1 ? prev + 1 : prev);
        } else if (e.deltaY < -30) {
            setCurrentIndex(prev => prev > 0 ? prev - 1 : prev);
        }
    }, [streams.length]);

    // Auto-play current video, pause others
    useEffect(() => {
        const _c = new AbortController();

        Object.entries(videoRefs.current || {}).forEach(([idx, video]) => {
            if (video) {
                if (parseInt(idx) === currentIndex) {
                    video.play().catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                } else {
                    video.pause();
                }
            }
        });
        return () => _c.abort();
    }, [currentIndex]);

    const currentStream = streams[currentIndex];

    const handleLivelike = async () => {
        // ═══ ACTION GATE: Like requires access ═══
        if (!guardAction()) return;
        if (!currentStream || likeBusy) return;
        setLikeBusy(true);
        const wasLiked = likedStreams[currentStream.id];
        setLikedStreams(prev => ({ ...prev, [currentStream.id]: !wasLiked }));
        // BUG FIX (REMOVED-LIKES): use authenticated userId from state — not the anon localStorage uid
        // which shadows the outer `userId` state and attributes likes to the wrong identity.
        const likeUserId = userId;
        if (likeUserId) {
            // BUG FIX (REMOVED-1 restore): authedFetch returns Response without throwing on
            // HTTP errors. .catch()-only would let 403/429/RLS-denial silently keep the optimistic
            // UI flipped. Check res.ok and roll back on any non-2xx.
            authedFetch('/api/social/interactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: currentStream.id, user_id: likeUserId, interaction_type: 'like' })
            }).then(res => {
                if (!res || !res.ok) {
                    setLikedStreams(prev => ({ ...prev, [currentStream.id]: wasLiked }));
                }
            }).catch(() => {
                setLikedStreams(prev => ({ ...prev, [currentStream.id]: wasLiked }));
            }).finally(() => setLikeBusy(false));
        } else {
            // LV-AUDIT-5 restore: rollback the optimistic flip — no DB write happened
            setLikedStreams(prev => ({ ...prev, [currentStream.id]: wasLiked }));
            setLikeBusy(false);
        }
    };

    const handleLiveChat = async () => {
        // ═══ ACTION GATE: Chat requires access ═══
        if (!guardAction()) return;
        if (!currentStream) return;
        setShowChat(prev => !prev);
        if (!showChat && chatMessages.length === 0) {
            try {
                // For recorded streams: load live_comments as chat replay
                if (!currentStream.isLive && currentStream.id) {
                    const { data: liveComments } = await supabase
                        .from('live_comments')
                        .select('*')
                        .eq('stream_id', currentStream.id)
                        .order('created_at', { ascending: true })
                        .limit(100);
                    if (liveComments?.length) {
                        setChatMessages(liveComments.map(c => ({
                            id: c.id,
                            text: c.text,
                            author_name: c.author_name,
                            created_at: c.created_at,
                        })));
                        return;
                    }
                }
                // Fallback: load social interactions comments
                const res = await fetch('/api/social/interactions?post_id=' + currentStream.id + '&type=comment');
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                const json = await res.json();
                setChatMessages(json.comments || []);
            } catch (e) { console.warn('Load chat:', e); }
        }
    };

    // BUG FIX (L-LIVES-2,5): live streams should use /api/live/comment (enforces
    // ban/slow mode); replay streams use social interactions for comment replay.
    const submitChatMsg = async () => {
        // BUG FIX (LV-AUDIT-2 restore): re-entry guard — Enter-mash double-submit
        if (!chatText.trim() || !currentStream || submittingChat) return;
        // BUG FIX (L-LIVES-2): use authenticated userId from state, not anon localStorage uid
        const authedUserId = userId;
        if (!authedUserId) return;
        setSubmittingChat(true);
        try {
            if (currentStream.isLive) {
                // Live stream: use /api/live/comment (enforces ban/slow mode server-side)
                const token = getAccessToken();
                const res = await fetch('/api/live/comment', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({ stream_id: currentStream.id, text: chatText.trim() }),
                });
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    throw new Error(d.error || `Request failed (${res.status})`);
                }
                const json = await res.json();
                if (json.comment) {
                    setChatMessages(prev => [...prev, { ...json.comment, author: { username: 'You' } }]);
                }
            } else {
                // Recorded stream: use social interactions (chat replay)
                const res = await authedFetch('/api/social/interactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post_id: currentStream.id, user_id: authedUserId, interaction_type: 'comment', content: chatText.trim() }),
                });
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                const json = await res.json();
                if (json.comment) {
                    setChatMessages(prev => [...prev, { ...json.comment, author: { username: 'You' } }]);
                }
            }
            setChatText('');
        } catch (e) { console.warn('Submit chat:', e); }
        setSubmittingChat(false);
    };

    const handleLiveShare = async () => {
        // ═══ ACTION GATE: Share requires access ═══
        if (!guardAction()) return;
        if (!currentStream || shareBusy) return;
        setShareBusy(true);
        const url = window.location.origin + '/hub/lives?id=' + currentStream.id;
        try {
            await navigator.clipboard.writeText(url);
            // BUG FIX (L-LIVES-3): cancel previous timer before setting new one
            if (shareMsgTimerRef.current) clearTimeout(shareMsgTimerRef.current);
            setShareMsg('Copied!');
            shareMsgTimerRef.current = setTimeout(() => {
                shareMsgTimerRef.current = null;
                setShareMsg('');
            }, 2000);
            // BUG FIX (LV-SHARE): use authenticated userId from state — not the anon localStorage uid
            // BUG FIX (REMOVED-1 restore): authedFetch doesn't throw on 4xx/5xx — surface non-2xx
            // so monitoring catches RLS / rate-limit denials silently dropping share interactions.
            if (userId) {
                authedFetch('/api/social/interactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post_id: currentStream.id, user_id: userId, interaction_type: 'share' }),
                }).then(res => {
                    if (!res || !res.ok) console.warn('[App] Share interaction non-2xx:', res?.status);
                }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)).finally(() => setShareBusy(false));
            } else {
                setShareBusy(false);
            }
        } catch {
            // BUG FIX (L-LIVES-4): cancel previous timer before setting new one
            if (shareMsgTimerRef.current) clearTimeout(shareMsgTimerRef.current);
            setShareMsg('Failed');
            shareMsgTimerRef.current = setTimeout(() => {
                shareMsgTimerRef.current = null;
                setShareMsg('');
            }, 2000);
            setShareBusy(false);
        }
    };

    // Reset chat when switching streams
    useEffect(() => {
        const _c = new AbortController();

        setShowChat(false);
        setChatMessages([]);
        setChatText('');
        return () => _c.abort();
    }, [currentIndex]);
    // Realtime subscription — soft re-fetch on stream changes (no hard reload).
    // BUG FIX (LV-AUDIT-7 restore): deps reduced to [userId] only via fetchStreamsRef.
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`lives:${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, () => {
                if (fetchStreamsRef.current) fetchStreamsRef.current();
            })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    return (
        <>
            <SEOHead
                title="Live Streams — Watch Poker Live"
                description="Watch Live Poker Streams And Events. Follow Your Favorite Players And Catch The Action In Real Time."
                canonical="/hub/lives"
            />

            <div
                ref={containerRef}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onWheel={handleWheel}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: C.bg,
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    padding: '16px 20px',
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
                    zIndex: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <button
                        onClick={() => router.back()}
                        style={{
                            width: 32,
                            height: 32,
                            background: 'none',
                            border: 'none',
                            color: 'white',
                            fontSize: 24,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        ←
                    </button>
                    <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'white' }}>
                        🔴 Lives
                    </h1>
                    <div style={{ width: 32 }} />
                </div>

                {/* Category Filter Bar */}
                <div style={{
                    position: 'absolute', top: 50, left: 0, right: 0, zIndex: 8,
                    display: 'flex', gap: 8, padding: '8px 16px', overflowX: 'auto',
                    scrollbarWidth: 'none',
                }}>
                    {[
                        { value: 'all', label: 'All' },
                        { value: 'cash_game', label: 'Cash Game' },
                        { value: 'tournament', label: 'Tournament' },
                        { value: 'strategy', label: 'Strategy' },
                        { value: 'hand_review', label: 'Hand Review' },
                        { value: 'just_chatting', label: 'Chatting' },
                    ].map(cat => (
                        <button
                            key={cat.value}
                            onClick={() => { setCategoryFilter(cat.value); setCurrentIndex(0); }}
                            style={{
                                padding: '6px 14px', borderRadius: 20, border: 'none',
                                background: categoryFilter === cat.value ? C.red : 'rgba(255,255,255,0.15)',
                                color: 'white', fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', whiteSpace: 'nowrap',
                                transition: 'background 0.2s',
                            }}
                        >
                            {cat.label}
                        </button>
                    ))}
                    {/* My Drafts button — only show if user has drafts */}
                    {myDrafts.length > 0 && (
                        <button
                            onClick={() => setShowDrafts(true)}
                            style={{
                                padding: '6px 14px', borderRadius: 20, border: '1px solid rgba(255,215,0,0.4)',
                                background: 'rgba(255,215,0,0.1)',
                                color: '#FFD700', fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                        >
                            My Drafts ({myDrafts.length})
                        </button>
                    )}
                </div>

                {/* #20: Upcoming Scheduled Lives */}
                {scheduledLives.length > 0 && (
                    <div style={{
                        position: 'absolute', top: 90, left: 0, right: 0, zIndex: 7,
                        display: 'flex', gap: 10, padding: '0 16px', overflowX: 'auto',
                        scrollbarWidth: 'none',
                    }}>
                        {scheduledLives.map(sl => {
                            void tick; // eslint-disable-line no-unused-expressions — LV-AUDIT-3 restore
                            const scheduledDate = new Date(sl.scheduled_at);
                            const now = new Date();
                            const diffMs = scheduledDate - now;
                            const hours = Math.floor(Math.max(0, diffMs) / 3600000);
                            const mins = Math.floor((Math.max(0, diffMs) % 3600000) / 60000);
                            const countdown = diffMs <= 0 ? 'Starting soon' : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                            return (
                                <div key={sl.id} style={{
                                    minWidth: 160,
                                    background: 'rgba(0,0,0,0.7)',
                                    backdropFilter: 'blur(10px)',
                                    borderRadius: 12,
                                    padding: '10px 14px',
                                    border: '1px solid rgba(255,100,100,0.3)',
                                    flexShrink: 0,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        <img
                                            src={sl.profiles?.avatar_url || '/avatars/default.png'}
                                            alt={sl.profiles?.username}
                                            style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                                            loading="lazy"
                                        />
                                        <span style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>
                                            @{sl.profiles?.username || 'user'}
                                        </span>
                                    </div>
                                    <div style={{ color: 'white', fontSize: 13, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>
                                        {sl.title || 'Scheduled Stream'}
                                    </div>
                                    <div style={{ color: '#FF6B6B', fontSize: 12, fontWeight: 700 }}>
                                        Starts in {countdown}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Loading State — Shimmer Skeleton */}
                {loading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '80px 20px 20px' }}>
                        <style>{`
                                @keyframes lives-shimmer {
                                    0%   { background-position: -600px 0; }
                                    100% { background-position: 600px 0; }
                                }
                                .lives-skel {
                                    background-image: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.04) 100%);
                                    background-size: 600px 100%;
                                    animation: lives-shimmer 1.4s ease-in-out infinite;
                                    border-radius: 8px;
                                }
                            `}</style>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{ marginBottom: 24, opacity: 1 - i * 0.25 }}>
                                <div className="lives-skel" style={{ width: '60%', height: 16, marginBottom: 8 }} />
                                <div className="lives-skel" style={{ width: '40%', height: 12, marginBottom: 16 }} />
                                <div className="lives-skel" style={{ width: '100%', height: 200 }} />
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {!loading && streams.length === 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: 'white',
                        textAlign: 'center',
                        padding: 40,
                    }}>
                        <div style={{ fontSize: 64, marginBottom: 20 }}>🔴</div>
                        <h2 style={{ margin: '0 0 12px', fontSize: 24 }}>No Lives Yet</h2>
                        <p style={{ color: C.textSec, margin: '0 0 24px' }}>
                            Be the first to go live and share with the community!
                        </p>
                        {/* #4: Show draft count when user has saved streams */}
                        {myDrafts.length > 0 && (
                            <button
                                onClick={() => setShowDrafts(true)}
                                style={{
                                    display: 'block',
                                    margin: '0 auto 16px',
                                    padding: '10px 22px',
                                    background: 'rgba(255, 215, 0, 0.15)',
                                    border: '1px solid rgba(255, 215, 0, 0.4)',
                                    borderRadius: 8,
                                    color: '#FFD700',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                You have {myDrafts.length} saved {myDrafts.length === 1 ? 'stream' : 'streams'} ready to publish
                            </button>
                        )}
                        <Link href="/hub/social-media" style={{
                            display: 'inline-block',
                            padding: '14px 28px',
                            background: C.red,
                            color: 'white',
                            borderRadius: 8,
                            fontWeight: 600,
                            textDecoration: 'none',
                        }}>
                            Go Live Now
                        </Link>
                    </div>
                )}

                {/* Stream Videos */}
                {streams.map((stream, idx) => (
                    <div
                        key={stream.id}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
                            transform: `translateY(${(idx - currentIndex) * 100}%)`,
                            opacity: Math.abs(idx - currentIndex) <= 1 ? 1 : 0,
                        }}
                    >
                        {/* Video Player */}
                        {stream.video_url ? (
                            <video
                                ref={el => videoRefs.current[idx] = el}
                                src={stream.video_url}
                                poster={stream.thumbnail_url}
                                loop={stream.isLive}
                                controls={!stream.isLive}
                                // BUG FIX (LV-AUDIO): only mute live streams (required for autoplay).
                                // Recorded replays should play with audio — muting them silences
                                // the entire broadcast recording the user just posted.
                                muted={stream.isLive}
                                playsInline
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'contain',
                                    background: '#000',
                                }}
                                onClick={(e) => {
                                    // Toggle play/pause on tap
                                    if (e.target.paused) {
                                        e.target.play();
                                    } else {
                                        e.target.pause();
                                    }
                                }}
                            />
                        ) : stream.thumbnail_url ? (
                            <img
                                src={stream.thumbnail_url}
                                alt={stream.title}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'contain',
                                }}
                                loading="lazy" />
                        ) : (
                            <div style={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: C.textSec,
                                fontSize: 60,
                            }}>
                                📺
                            </div>
                        )}

                        {/* Live Badge + Watch Button */}
                        {stream.isLive && (
                            <>
                                <div style={{
                                    position: 'absolute',
                                    top: 70,
                                    left: 20,
                                    background: C.red,
                                    color: 'white',
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    fontSize: 14,
                                    fontWeight: 700,
                                    animation: 'pulse 1.5s infinite',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                }}>
                                    LIVE
                                    {(stream.viewer_count > 0) && (
                                        <span style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                                            {stream.viewer_count} watching
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => setWatchingStream(stream)}
                                    style={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        background: 'rgba(250, 56, 62, 0.9)',
                                        backdropFilter: 'blur(10px)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 16,
                                        padding: '16px 32px',
                                        fontSize: 18,
                                        fontWeight: 700,
                                        // BUG FIX (LV-WATCH): compare by stream.id not object reference —
                                        // object identity changes after setWatchingStream(stream), so
                                        // `watchingStream === stream` was always false, never showing 'Connecting...'.
                                        cursor: watchingStream?.id === stream.id ? 'wait' : 'pointer',
                                        opacity: watchingStream?.id === stream.id ? 0.6 : 1,
                                        boxShadow: '0 4px 24px rgba(250, 56, 62, 0.4)',
                                        zIndex: 10,
                                    }}
                                >
                                    {watchingStream?.id === stream.id ? 'Connecting...' : 'Watch Live'}
                                </button>
                                </>
                            )}

                {/* Bottom Info Overlay */}
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 80, // Leave room for action buttons
                    padding: '40px 20px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                }}>
                    {/* Broadcaster Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <img
                            src={stream.broadcaster?.avatar_url || stream.profiles?.avatar_url || '/avatars/default.png'}
                            alt={stream.broadcaster?.username || stream.profiles?.username}
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: '50%',
                                border: '2px solid white',
                                objectFit: 'cover',
                            }}
                            loading="lazy" />
                        <div>
                            <div style={{ fontWeight: 700, color: 'white', fontSize: 16 }}>
                                @{stream.broadcaster?.username || stream.profiles?.username || 'Unknown'}
                            </div>
                            <div style={{ color: C.textSec, fontSize: 13 }}>
                                {stream.broadcaster?.full_name || stream.profiles?.full_name || ''}
                            </div>
                        </div>
                    </div>

                    {/* Stream Title */}
                    <div style={{ color: 'white', fontSize: 15, marginBottom: 8 }}>
                        {stream.title || 'Live Stream'}
                    </div>

                    {/* Stats */}
                    <div style={{ color: C.textSec, fontSize: 13 }}>
                        {stream.isLive ? (
                            <span>👁️ {stream.viewer_count || 0} watching</span>
                        ) : (
                            <span>▶️ Replay • {new Date(stream.created_at).toLocaleDateString()}</span>
                        )}
                    </div>
                </div>

                {/* Right Side Action Buttons */}
                <div style={{
                    position: 'absolute',
                    bottom: 100,
                    right: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 20,
                    alignItems: 'center',
                }}>
                    {/* Like Button */}
                    <button onClick={handleLivelike} style={{
                        background: 'none',
                        border: 'none',
                        color: 'white',
                        fontSize: 28,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill={likedStreams[stream.id] ? '#FA383E' : 'none'} stroke={likedStreams[stream.id] ? '#FA383E' : 'white'} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                        <span style={{ fontSize: 12 }}>{likedStreams[stream.id] ? 'Liked' : 'Like'}</span>
                    </button>

                    {/* Comment Button */}
                    <button onClick={handleLiveChat} style={{
                        background: 'none',
                        border: 'none',
                        color: showChat ? C.blue : 'white',
                        fontSize: 28,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        <span style={{ fontSize: 12 }}>Chat</span>
                    </button>

                    {/* Share Button */}
                    <button onClick={handleLiveShare} style={{
                        background: 'none',
                        border: 'none',
                        color: 'white',
                        fontSize: 28,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                        <span style={{ fontSize: 12 }}>{shareMsg || 'Share'}</span>
                    </button>
                </div>
            </div>
                    ))}

            {/* Navigation Dots */}
            {streams.length > 1 && (
                <div style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    zIndex: 100,
                }}>
                    {streams.slice(0, 10).map((_, idx) => (
                        <div
                            key={idx}
                            onClick={() => setCurrentIndex(idx)}
                            style={{
                                width: 6,
                                height: idx === currentIndex ? 20 : 6,
                                borderRadius: 3,
                                background: idx === currentIndex ? 'white' : 'rgba(255,255,255,0.4)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Chat Panel */}
            {showChat && (
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 200,
                    background: 'rgba(0,0,0,0.95)', borderRadius: '16px 16px 0 0',
                    maxHeight: '50vh', display: 'flex', flexDirection: 'column',
                }}>
                    <div style={{
                        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <span style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Live Chat</span>
                        <button onClick={() => setShowChat(false)} style={{
                            background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer'
                        }}>x</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', maxHeight: 250 }}>
                        {chatMessages.length === 0 && (
                            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: 20, fontSize: 14 }}>
                                No messages yet. Start the conversation!
                            </div>
                        )}
                        {chatMessages.map((m, i) => (
                            <div key={m.id || i} style={{ marginBottom: 10 }}>
                                <span style={{ color: C.blue, fontWeight: 600, fontSize: 13 }}>{m.author_name || m.author?.username || 'User'}: </span>
                                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>{m.text || m.content}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{
                        padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex', gap: 8
                    }}>
                        <input
                            value={chatText}
                            onChange={e => setChatText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !submittingChat) { e.preventDefault(); submitChatMsg(); } }}
                            placeholder="Say Something..."
                            style={{
                                flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.1)',
                                border: 'none', borderRadius: 20, fontSize: 14, color: 'white', outline: 'none'
                            }}
                        />
                        <button
                            onClick={submitChatMsg}
                            disabled={!chatText.trim() || submittingChat}
                            style={{
                                padding: '8px 16px', background: C.red, color: 'white',
                                border: 'none', borderRadius: 20, fontWeight: 600, fontSize: 13,
                                cursor: chatText.trim() ? 'pointer' : 'not-allowed',
                                opacity: chatText.trim() ? 1 : 0.5
                            }}
                        >{submittingChat ? '...' : 'Send'}</button>
                    </div>
                </div>
            )}

            {/* Counter */}
            {streams.length > 0 && !showChat && (
                <div style={{
                    position: 'absolute',
                    bottom: 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: 12,
                }}>
                    {currentIndex + 1} / {streams.length}
                </div>
            )}
        </div >

            {/* Pulse animation */ }
            < style > {`
         @keyframes pulse {
           0%, 100% { opacity: 1; }
           50% { opacity: 0.7; }
         }

         /* BUG FIX (LV-AUDIT-4 restore): publishToast referenced 'slideUp' but the keyframes
            were never defined. Toast appeared with no enter animation. Define here. */
         @keyframes slideUp {
           0%   { transform: translateX(-50%) translateY(20px); opacity: 0; }
           100% { transform: translateX(-50%) translateY(0);    opacity: 1; }
         }

         @media (prefers-reduced-motion: reduce) {
           [aria-label="Live now"] { animation: none !important; }
           .lives-skel { animation-duration: 2s !important; }
         }
       `}</style >

    {/* My Drafts drawer */ }
{
    showDrafts && (
        <div
            onClick={() => setShowDrafts(false)}
            style={{
                position: 'fixed', inset: 0, zIndex: 500,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex', alignItems: 'flex-end',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%',
                    background: '#111',
                    borderRadius: '20px 20px 0 0',
                    maxHeight: '70vh',
                    overflow: 'auto',
                    padding: '20px 16px',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, color: 'white', fontSize: 18, fontWeight: 700 }}>My Saved Streams</h3>
                    <button onClick={() => setShowDrafts(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>&#10005;</button>
                </div>
                {myDrafts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.5)' }}>
                        No saved streams. After going live, choose &quot;Save To Lives&quot; to save here.
                    </div>
                ) : (
                    myDrafts.map(draft => (
                        <div key={draft.id} style={{
                            display: 'flex', gap: 12, padding: '12px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                            alignItems: 'center',
                        }}>
                            <div style={{
                                width: 80, height: 56, borderRadius: 8, overflow: 'hidden',
                                background: '#222', flexShrink: 0,
                            }}>
                                {draft.thumbnail_url ? (
                                    <img src={draft.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 24 }}>&#128250;</div>
                                )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ color: 'white', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {draft.title || 'Untitled Stream'}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>
                                    {new Date(draft.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </div>
                            </div>
                            <button
                                onClick={() => publishDraft(draft)}
                                disabled={publishingDraft === draft.id}
                                style={{
                                    padding: '8px 16px',
                                    background: publishingDraft === draft.id ? '#333' : 'linear-gradient(135deg, #00D4FF, #0088FF)',
                                    color: 'white', border: 'none', borderRadius: 8,
                                    fontSize: 13, fontWeight: 700,
                                    cursor: publishingDraft === draft.id ? 'wait' : 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {publishingDraft === draft.id ? 'Publishing...' : 'Publish'}
                            </button>
                            <button
                                onClick={() => deleteDraft(draft)}
                                style={{
                                    padding: '8px 12px',
                                    background: 'rgba(250,56,62,0.15)',
                                    color: '#FA383E',
                                    border: '1px solid rgba(250,56,62,0.3)',
                                    borderRadius: 8, fontSize: 13, fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

{/* LiveStreamViewer overlay for watching active live streams */ }
{
    watchingStream && userId && (
        <LiveStreamViewer
            stream={watchingStream}
            userId={userId}
            user={user}
            onClose={(action) => {
                setWatchingStream(null);
                fetchStreams();
            }}
        />
    )
}

{/* #5: Publish success toast */ }
{
    publishToast && (
        <div style={{
            position: 'fixed',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 200, 100, 0.95)',
            color: 'white',
            padding: '12px 28px',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            zIndex: 10001,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            animation: 'slideUp 0.3s ease-out',
        }}>
            {publishToast}
        </div>
    )
}

{ UpgradePopup }
        </>
    );
}
