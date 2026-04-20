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

    // Expose user at component scope so render code can safely reference it
    const user = typeof window !== 'undefined' ? getAuthUser() : null;

    // Get auth user for FeatureGate
    useEffect(() => {    const _c = new AbortController();

        if (user) setUserId(user.id);
    return () => _c.abort();
  }, [user]);

    // ═══ ACTION GATE: Users can explore/watch, but interactions are gated ═══
    const { guardAction, UpgradePopup } = useFeatureGate('lives');

    // Fetch all streams (active lives + recorded)
    useEffect(() => {    const _c = new AbortController();

        const fetchStreams = async(signal) => {
            setLoading(true);

            // Get active live streams
            const { data: liveStreams } = await supabase
                .from('live_streams')
                .select('*, profiles!broadcaster_id(username, avatar_url, full_name)')
                .eq('status', 'live')
                .order('started_at', { ascending: false })
                .limit(50) // live streams

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
        };

        fetchStreams();
    return () => _c.abort();
  }, []);

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
        const localUserId = typeof window !== 'undefined' ? localStorage.getItem('sp-anon-uid') : null;
        if (localUserId) {
            authedFetch('/api/social/interactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: currentStream.id, user_id: localUserId, interaction_type: 'like' })
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
        const localUserId = typeof window !== 'undefined' ? localStorage.getItem('sp-anon-uid') : null;
        if (!localUserId) return;
        setSubmittingChat(true);
        try {
            const res = await authedFetch('/api/social/interactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: currentStream.id, user_id: localUserId, interaction_type: 'comment', content: chatText.trim() })
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
            if (navigator.share) {
                await navigator.share({ title: currentStream.title || 'Live Stream', url });
            } else {
                await navigator.clipboard.writeText(url);
                setShareMsg('Copied!');
                setTimeout(() => setShareMsg(''), 2000);
            }
        } catch (e) { console.error('Share:', e); }
        setShareBusy(false);
    };

    // Loading state
    if (loading) {
        return (
            <>
                <SEOHead title="Lives | Smarter Poker" description="Watch live poker streams" />
                <div style={{
                    minHeight: '100vh', background: C.bg, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: C.text
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>📡</div>
                        <div style={{ fontSize: 16, color: C.textSec }}>Loading streams...</div>
                    </div>
                </div>
            </>
        );
    }

    // Empty state
    if (streams.length === 0) {
        return (
            <>
                <SEOHead title="Lives | Smarter Poker" description="Watch live poker streams" />
                <div style={{
                    minHeight: '100vh', background: C.bg, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: C.text, padding: 20
                }}>
                    <div style={{ textAlign: 'center', maxWidth: 400 }}>
                        <div style={{ fontSize: 60, marginBottom: 16 }}>📺</div>
                        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>No Streams Yet</h2>
                        <p style={{ color: C.textSec, fontSize: 15, marginBottom: 24 }}>
                            Be the first to go live! Start streaming your poker sessions.
                        </p>
                        <Link href="/hub" style={{
                            display: 'inline-block', padding: '12px 24px',
                            background: C.red, color: 'white', borderRadius: 12,
                            fontWeight: 600, textDecoration: 'none'
                        }}>
                            Back to Hub
                        </Link>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <SEOHead title="Lives | Smarter Poker" description="Watch live poker streams" />

                {/* Back Button */}
                <div style={{
                    position: 'absolute', top: 16, left: 16, zIndex: 100,
                }}>
                    <Link href="/hub" style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        color: 'white', textDecoration: 'none', fontSize: 14,
                        background: 'rgba(0,0,0,0.5)', padding: '8px 14px',
                        borderRadius: 20, backdropFilter: 'blur(10px)'
                    }}>
                        ← Hub
                    </Link>
                </div>

                {/* Main Swipe Container */}
                <div
                    ref={containerRef}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onWheel={handleWheel}
                    style={{
                        height: '100vh', width: '100vw', overflow: 'hidden',
                        background: C.bg, position: 'relative',
                    }}
                >
                    {streams.map((stream, idx) => (
                        <div
                            key={stream.id}
                            style={{
                                position: 'absolute',
                                top: 0, left: 0, width: '100%', height: '100%',
                                transform: `translateY(${(idx - currentIndex) * 100}%)`,
                                transition: 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {/* Video/Thumbnail */}
                            {stream.video_url ? (
                                <video
                                    ref={el => { if (el) videoRefs.current[idx] = el; }}
                                    src={stream.video_url}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    loop
                                    muted
                                    playsInline
                                />
                            ) : (
                                <div style={{
                                    width: '100%', height: '100%',
                                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexDirection: 'column', gap: 16,
                                }}>
                                    <div style={{ fontSize: 60 }}>{stream.isLive ? '🔴' : '📹'}</div>
                                    <div style={{ color: 'white', fontSize: 18, fontWeight: 600 }}>
                                        {stream.title || 'Stream'}
                                    </div>
                                </div>
                            )}

                            {/* Live Badge */}
                            {stream.isLive && (
                                <div style={{
                                    position: 'absolute', top: 60, left: 16,
                                    background: C.red, color: 'white',
                                    padding: '4px 12px', borderRadius: 4,
                                    fontSize: 12, fontWeight: 700, letterSpacing: 1,
                                }}>
                                    ● LIVE
                                </div>
                            )}

                            {/* Bottom Info Overlay */}
                            <div style={{
                                position: 'absolute',
                                bottom: 80,
                                left: 12,
                                right: 80,
                                zIndex: 10,
                            }}>
                                {/* Broadcaster Info */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%',
                                        background: 'rgba(255,255,255,0.2)',
                                        backgroundImage: stream.profiles?.avatar_url ? `url(${stream.profiles.avatar_url})` : 'none',
                                        backgroundSize: 'cover',
                                        border: stream.isLive ? `2px solid ${C.red}` : '2px solid rgba(255,255,255,0.3)',
                                    }} />
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
                                    {likedStreams[stream.id] ? '❤️' : '🤍'}
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
                                    💬
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
                                    🔗
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
                <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>

            {UpgradePopup}
        </>
    );
}
