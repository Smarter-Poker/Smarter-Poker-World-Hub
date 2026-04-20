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
    const containerRef = useRef(null);
    const videoRefs = useRef({});

    // Get auth user for FeatureGate
    useEffect(() => {    const _c = new AbortController();

        const authUser = getAuthUser();
        if (authUser) setUserId(authUser.id);
    return () => _c.abort();
  }, []);

    // ═══ ACTION GATE: Users can explore/watch, but interactions are gated ═══
    const { guardAction, UpgradePopup } = useFeatureGate('lives');

    // Shared stream-loading function
    const loadStreams = useCallback(async () => {
        setLoading(true);

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
            .not('video_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(50);

        // Combine: active lives first, then recorded
        const allStreams = [
            ...(liveStreams || []).map(s => ({ ...s, isLive: true })),
            ...(recordedStreams || []).map(s => ({ ...s, isLive: false }))
        ];

        setStreams(allStreams);
        setLoading(false);
    }, []);

    // Fetch all streams (active lives + recorded)
    useEffect(() => {    const _c = new AbortController();

        loadStreams();
    return () => _c.abort();
  }, [loadStreams]);

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

        Object.entries(videoRefs.current).forEach(([idx, video]) => {
            if (video) {
                if (parseInt(idx) === currentIndex) {
                    video.play().catch(() => { });
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
        const anonUid = typeof window !== 'undefined' ? localStorage.getItem('sp-anon-uid') : null;
        if (anonUid) {
            authedFetch('/api/social/interactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: currentStream.id, user_id: anonUid, interaction_type: 'like' })
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
                const res = await fetch('/api/social/interactions?post_id=' + currentStream.id + '&type=comment');
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                const json = await res.json();
                setChatMessages(json.comments || []);
            } catch (e) { console.error('Load chat:', e); }
        }
    };

    const submitChatMsg = async () => {
        if (!chatText.trim()) return;
        const anonUid = typeof window !== 'undefined' ? localStorage.getItem('sp-anon-uid') : null;
        if (!anonUid) return;
        setSubmittingChat(true);
        try {
            const res = await authedFetch('/api/social/interactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: currentStream.id, user_id: anonUid, interaction_type: 'comment', content: chatText.trim() })
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            if (json.comment) {
                setChatMessages(prev => [...prev, { ...json.comment, author: { username: 'You' } }]);
            }
            setChatText('');
        } catch (e) { console.error('Submit chat:', e); }
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
            const anonUid = typeof window !== 'undefined' ? localStorage.getItem('sp-anon-uid') : null;
            if (anonUid) {
                authedFetch('/api/social/interactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post_id: currentStream.id, user_id: anonUid, interaction_type: 'share' })
                }).catch(() => { }).finally(() => setShareBusy(false));
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
  // Realtime subscription — live updates
  useEffect(() => {
    if (!userId) return;
    const _ch = supabase
      .channel(`lives:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, () => {
        loadStreams();
      })
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
  }, [userId, loadStreams]);

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

                    {/* Loading State */}
                    {loading && (
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            color: 'white',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 40, marginBottom: 16 }}>📺</div>
                            <div>Loading Streams...</div>
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
                                    loop
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
                                    background: '#111',
                                    color: 'white',
                                    fontSize: 64,
                                }}>
                                    🎬
                                </div>
                            )}

                            {/* Bottom gradient overlay */}
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                height: '40%',
                                background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                                pointerEvents: 'none',
                            }} />

                            {/* Stream Info */}
                            <div style={{
                                position: 'absolute',
                                bottom: 80,
                                left: 16,
                                right: 80,
                                zIndex: 10,
                            }}>
                                {/* Live badge */}
                                {stream.isLive && (
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '4px 10px',
                                        background: C.red,
                                        color: 'white',
                                        borderRadius: 4,
                                        fontSize: 12,
                                        fontWeight: 700,
                                        marginBottom: 8,
                                    }}>
                                        🔴 LIVE
                                    </span>
                                )}

                                {/* Broadcaster info */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                    <div style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: '50%',
                                        background: '#333',
                                        overflow: 'hidden',
                                    }}>
                                        {stream.profiles?.avatar_url && (
                                            <img src={stream.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                        )}
                                    </div>
                                    <span style={{ color: 'white', fontWeight: 600, fontSize: 15 }}>
                                        @{stream.profiles?.username || 'unknown'}
                                    </span>
                                </div>

                                {/* Title */}
                                <h3 style={{ margin: '0 0 6px', color: 'white', fontSize: 16, fontWeight: 600 }}>
                                    {stream.title || 'Untitled Stream'}
                                </h3>

                                {/* Viewer count */}
                                <div style={{ color: C.textSec, fontSize: 13 }}>
                                    👁 {stream.viewer_count || 0} viewers
                                </div>
                            </div>

                            {/* Right side action buttons */}
                            <div style={{
                                position: 'absolute',
                                right: 12,
                                bottom: 120,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 20,
                                alignItems: 'center',
                                zIndex: 10,
                            }}>
                                {/* Like */}
                                <button onClick={handleLivelike} disabled={likeBusy} style={{
                                    background: 'none',
                                    border: 'none',
                                    color: likedStreams[stream.id] ? C.red : 'white',
                                    fontSize: 28,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 4,
                                    opacity: likeBusy ? 0.5 : 1,
                                }}>
                                    {likedStreams[stream.id] ? '❤️' : '🤍'}
                                    <span style={{ fontSize: 11, color: C.textSec }}>{stream.like_count || 0}</span>
                                </button>

                                {/* Chat */}
                                <button onClick={handleLiveChat} style={{
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
                                    💬
                                    <span style={{ fontSize: 11, color: C.textSec }}>{stream.comment_count || 0}</span>
                                </button>

                                {/* Share */}
                                <button onClick={handleLiveShare} disabled={shareBusy} style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: 28,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 4,
                                    opacity: shareBusy ? 0.5 : 1,
                                }}>
                                    🔗
                                    <span style={{ fontSize: 11, color: C.textSec }}>{shareMsg || 'Share'}</span>
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Chat overlay */}
                    {showChat && currentStream && (
                        <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: '50%',
                            background: 'rgba(0,0,0,0.9)',
                            zIndex: 200,
                            display: 'flex',
                            flexDirection: 'column',
                            borderTopLeftRadius: 16,
                            borderTopRightRadius: 16,
                        }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'white', fontWeight: 600 }}>Chat</span>
                                <button onClick={() => setShowChat(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer' }}>✕</button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                                {chatMessages.length === 0 && (
                                    <div style={{ color: C.textSec, textAlign: 'center', marginTop: 20 }}>No messages yet</div>
                                )}
                                {chatMessages.map((msg, i) => (
                                    <div key={i} style={{ marginBottom: 12 }}>
                                        <span style={{ color: C.blue, fontWeight: 600, fontSize: 13 }}>{msg.author?.username || 'Anon'}: </span>
                                        <span style={{ color: 'white', fontSize: 13 }}>{msg.content}</span>
                                    </div>
                                ))}
                            </div>
                            <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 8 }}>
                                <input
                                    value={chatText}
                                    onChange={e => setChatText(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && submitChatMsg()}
                                    placeholder="Say something..."
                                    style={{
                                        flex: 1,
                                        padding: '10px 14px',
                                        borderRadius: 20,
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        background: 'rgba(255,255,255,0.1)',
                                        color: 'white',
                                        fontSize: 14,
                                        outline: 'none',
                                    }}
                                />
                                <button
                                    onClick={submitChatMsg}
                                    disabled={submittingChat || !chatText.trim()}
                                    style={{
                                        padding: '10px 16px',
                                        borderRadius: 20,
                                        background: C.blue,
                                        color: 'white',
                                        border: 'none',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        opacity: submittingChat || !chatText.trim() ? 0.5 : 1,
                                    }}
                                >
                                    Send
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Navigation dots */}
                    {streams.length > 1 && (
                        <div style={{
                            position: 'absolute',
                            right: 6,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            zIndex: 50,
                        }}>
                            {streams.slice(0, 10).map((_, i) => (
                                <div
                                    key={i}
                                    onClick={() => setCurrentIndex(i)}
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        background: i === currentIndex ? 'white' : 'rgba(255,255,255,0.3)',
                                        cursor: 'pointer',
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {UpgradePopup}
        </>
    );
}
