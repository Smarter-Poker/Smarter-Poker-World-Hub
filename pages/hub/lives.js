/* ═══════════════════════════════════════════════════════════════════════════
   LIVES PAGE — TikTok-style fullscreen vertical swipe for browsing live/recorded streams
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../../src/lib/supabase';

// Colors
const C = {
    bg: '#000',
    text: '#fff',
    textSec: 'rgba(255,255,255,0.7)',
    red: '#FA383E',
    blue: '#1877F2',
};

export default function LivesPage() {
    const [streams, setStreams] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [touchStart, setTouchStart] = useState(null);
    const containerRef = useRef(null);
    const videoRefs = useRef({});

    // Fetch all streams (active lives + recorded)
    useEffect(() => {
        const fetchStreams = async () => {
            setLoading(true);

            // Get active live streams
            const { data: liveStreams } = await supabase
                .from('live_streams')
                .select('*, profiles!broadcaster_id(username, avatar_url, full_name)')
                .eq('status', 'live')
                .order('started_at', { ascending: false });

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
    useEffect(() => {
        Object.entries(videoRefs.current).forEach(([idx, video]) => {
            if (video) {
                if (parseInt(idx) === currentIndex) {
                    video.play().catch(() => { });
                } else {
                    video.pause();
                }
            }
        });
    }, [currentIndex]);

    const currentStream = streams[currentIndex];

    return (
        <>
            <Head>
                <title>Lives | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

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
                    <Link href="/hub/social-media" style={{
                        color: 'white',
                        textDecoration: 'none',
                        fontSize: 16,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}>
                        ← Back
                    </Link>
                    <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'white' }}>
                        🔴 Lives
                    </h1>
                    <div style={{ width: 60 }} />
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
                        <div>Loading streams...</div>
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
                            />
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
                                />
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
                            <button style={{
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
                                ❤️
                                <span style={{ fontSize: 12 }}>Like</span>
                            </button>

                            {/* Comment Button */}
                            <button style={{
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
                                <span style={{ fontSize: 12 }}>Chat</span>
                            </button>

                            {/* Share Button */}
                            <button style={{
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
                                📤
                                <span style={{ fontSize: 12 }}>Share</span>
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

                {/* Counter */}
                {streams.length > 0 && (
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
        </>
    );
}
