/* ═══════════════════════════════════════════════════════════════════════════
   LIVES PAGE — TikTok-style fullscreen vertical swipe for browsing live/recorded streams
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { supabase } from '../../src/lib/supabase';

import { useFeatureGate } from '../../src/components/gates/FeatureGatePopup';
import { getAuthUser, authedFetch } from '../../src/lib/authUtils';

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
    const [categoryFilter, setCategoryFilter] = useState('all');
    const containerRef = useRef(null);
    const videoRefs = useRef({});

    // Get auth user for FeatureGate
    useEffect(() => {    const _c = new AbortController();

        const user = getAuthUser();
        if (user) setUserId(user.id);
    return () => _c.abort();
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
                .select('*, profiles!broadcaster_id(username, avatar_url, full_name)')
                .eq('status', 'live')
                .order('started_at', { ascending: false })
                .limit(50);

            // Get recorded streams with video URLs (posted ones)
            const { data: recordedStreams } = await supabase
                .from('live_streams')
                .select('*, profiles!broadcaster_id(username, avatar_url, full_name)')
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
    }, [fetchStreams, categoryFilter]);

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

        if (Math.abs(diff) > 50) {
            if (diff > 0 && currentIndex < streams.length - 1) {
                // Swipe up - next video
                setCurrentIndex(prev => prev + 1);
            } else if (diff < 0 && currentIndex > 0) {
                // Swipe down - previous video
                setCurrentIndex(prev => prev - 1);
            }
        }
        setTouchStart(null);
    };

    // Handle wheel scroll
    const handleWheel = useCallback((e) => {
        if (e.deltaY > 30 && currentIndex < streams.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else if (e.deltaY < -30 && currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    }, [currentIndex, streams.length]);

    // Auto-play current video, pause others
    useEffect(() => {    const _c = new AbortController();

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
        const userId = typeof window !== 'undefined' ? localStorage.getItem('sp-anon-uid') : null;
        if (userId) {
            authedFetch('/api/social/interactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: currentStream.id, user_id: userId, interaction_type: 'like' })
            }).catch(() => {
                setLikedStreams(prev => ({ ...prev, [currentStream.id]: wasLiked }));
            }).finally(() => setLikeBusy(false));
        } else {
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

    const submitChatMsg = async () => {
        if (!chatText.trim()) return;
        const userId = typeof window !== 'undefined' ? localStorage.getItem('sp-anon-uid') : null;
        if (!userId) return;
        setSubmittingChat(true);
        try {
            const res = await authedFetch('/api/social/interactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: currentStream.id, user_id: userId, interaction_type: 'comment', content: chatText.trim() })
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.comment) {
                setChatMessages(prev => [...prev, { ...json.comment, author: { username: 'You' } }]);
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
            setShareMsg('Copied!');
            setTimeout(() => setShareMsg(''), 2000);
            const userId = typeof window !== 'undefined' ? localStorage.getItem('sp-anon-uid') : null;
            if (userId) {
                authedFetch('/api/social/interactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post_id: currentStream.id, user_id: userId, interaction_type: 'share' })
                }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)).finally(() => setShareBusy(false));
            } else {
                setShareBusy(false);
            }
        } catch {
            setShareMsg('Failed');
            setTimeout(() => setShareMsg(''), 2000);
            setShareBusy(false);
        }
    };

    // Reset chat when switching streams
    useEffect(() => {    const _c = new AbortController();

        setShowChat(false);
        setChatMessages([]);
        setChatText('');
    return () => _c.abort();
  }, [currentIndex]);
  // Realtime subscription — soft re-fetch on stream changes (no hard reload)
  useEffect(() => {
    if (!userId) return;
    const _ch = supabase
      .channel(`lives:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, () => {
        // Soft re-fetch: silently refresh the stream list without destroying scroll position
        fetchStreams();
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
                    </div>

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
                                    muted
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

                            {/* Live Badge */}
                            {stream.isLive && (
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
                                }}>
                                    🔴 LIVE
                                </div>
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
                                        src={stream.profiles?.avatar_url || '/avatars/default.png'}
                                        alt={stream.profiles?.username}
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
                                            @{stream.profiles?.username || 'Unknown'}
                                        </div>
                                        <div style={{ color: C.textSec, fontSize: 13 }}>
                                            {stream.profiles?.full_name || ''}
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
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill={likedStreams[stream.id] ? '#FA383E' : 'none'} stroke={likedStreams[stream.id] ? '#FA383E' : 'white'} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
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
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
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
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
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
                                        <span style={{ color: C.blue, fontWeight: 600, fontSize: 13 }}>{m.author?.username || 'User'}: </span>
                                        <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>{m.content}</span>
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
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitChatMsg(); } }}
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
                </div>

                {/* Pulse animation */}
                <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>

            {UpgradePopup}
        </>
    );
}
