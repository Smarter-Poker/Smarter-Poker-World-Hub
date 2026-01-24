/**
 * REELS PAGE - Full-Screen YouTube Shorts Experience
 * 
 * SOLUTIONS IMPLEMENTED:
 * 1. SWIPE: Touch capture zones on left/right edges (40% each) to intercept swipes
 *    Center 20% left open for YouTube controls
 * 2. UNMUTE: Tap-to-unmute overlay - tapping reloads iframe with mute=0
 * 3. WHITE LINE: Slight overscan with overflow:hidden + frameBorder=0
 */

import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';
import Link from 'next/link';

function getYouTubeVideoId(url) {
    if (!url) return null;
    const patterns = [
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
        /youtu\.be\/([a-zA-Z0-9_-]+)/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}

export default function ReelsPage() {
    const [reels, setReels] = useState([]);
    const [idx, setIdx] = useState(0);
    const [loading, setLoading] = useState(true);
    const [muted, setMuted] = useState(true); // Start muted for autoplay
    const touchStartY = useRef(0);
    const touchStartTime = useRef(0);

    useEffect(() => {
        loadReels();
    }, []);

    const loadReels = async () => {
        try {
            const { data } = await supabase
                .from('social_posts')
                .select('id, media_urls')
                .eq('content_type', 'video')
                .eq('visibility', 'public')
                .order('created_at', { ascending: false })
                .limit(100);

            if (data?.length > 0) {
                const videos = data
                    .filter(p => p.media_urls?.length > 0 && getYouTubeVideoId(p.media_urls[0]))
                    .map(p => ({
                        id: p.id,
                        videoId: getYouTubeVideoId(p.media_urls[0])
                    }))
                    .sort(() => Math.random() - 0.5);
                setReels(videos);
            }
        } catch (e) {
            console.error('Load error:', e);
        }
        setLoading(false);
    };

    const reel = reels[idx];

    // Navigate to next/prev reel
    const goNext = () => {
        if (idx < reels.length - 1) {
            setIdx(idx + 1);
            setMuted(true); // Reset to muted on navigation
        }
    };

    const goPrev = () => {
        if (idx > 0) {
            setIdx(idx - 1);
            setMuted(true); // Reset to muted on navigation
        }
    };

    // Swipe handlers for touch zones
    const handleTouchStart = (e) => {
        touchStartY.current = e.touches[0].clientY;
        touchStartTime.current = Date.now();
    };

    const handleTouchEnd = (e) => {
        const deltaY = touchStartY.current - e.changedTouches[0].clientY;
        const deltaTime = Date.now() - touchStartTime.current;

        // Only trigger if swipe is significant (>60px) and fast enough (<500ms)
        if (Math.abs(deltaY) > 60 && deltaTime < 500) {
            if (deltaY > 0) {
                goNext(); // Swipe up = next
            } else {
                goPrev(); // Swipe down = prev
            }
        }
    };

    // Keyboard navigation
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'ArrowDown') goNext();
            if (e.key === 'ArrowUp') goPrev();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [idx, reels.length]);

    // Mouse wheel navigation
    useEffect(() => {
        let wheelTimeout = null;
        const handler = (e) => {
            if (wheelTimeout) return; // Debounce
            if (e.deltaY > 50) {
                goNext();
                wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 500);
            } else if (e.deltaY < -50) {
                goPrev();
                wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 500);
            }
        };
        window.addEventListener('wheel', handler, { passive: true });
        return () => window.removeEventListener('wheel', handler);
    }, [idx, reels.length]);

    // Handle unmute tap
    const handleUnmute = () => {
        setMuted(false);
    };

    if (loading) {
        return (
            <div style={{
                position: 'fixed', inset: 0, background: '#000',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <div style={{ color: '#fff', fontSize: 18 }}>Loading...</div>
            </div>
        );
    }

    if (!reels.length) {
        return (
            <div style={{
                position: 'fixed', inset: 0, background: '#000',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
            }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>🎬</div>
                <h1 style={{ color: '#fff', fontSize: 24, marginBottom: 16 }}>No Reels Yet</h1>
                <Link href="/hub/social-media" style={{
                    padding: '12px 24px', background: '#fff', color: '#000',
                    borderRadius: 8, textDecoration: 'none', fontWeight: 600
                }}>
                    Back to Feed
                </Link>
            </div>
        );
    }

    // Build YouTube URL with appropriate mute setting
    const youtubeUrl = `https://www.youtube.com/embed/${reel?.videoId}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${reel?.videoId}&playsinline=1&controls=1&rel=0&modestbranding=1&enablejsapi=1`;

    return (
        <>
            <Head>
                <title>Reels | Smarter Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: '#000',
                overflow: 'hidden'
            }}>
                {/* Video container with slight overscan to hide white edges */}
                <div style={{
                    position: 'absolute',
                    top: -5,
                    left: -5,
                    right: -5,
                    bottom: -5,
                    overflow: 'hidden'
                }}>
                    {reel && (
                        <iframe
                            key={`${reel.id}-${muted}`}
                            src={youtubeUrl}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                border: 'none'
                            }}
                        />
                    )}
                </div>

                {/* LEFT TOUCH ZONE - captures swipes on left 40% */}
                <div
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '40%',
                        height: '100%',
                        zIndex: 10,
                        // Transparent - only captures touch, doesn't block view
                    }}
                />

                {/* RIGHT TOUCH ZONE - captures swipes on right 40% */}
                <div
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '40%',
                        height: '100%',
                        zIndex: 10,
                    }}
                />

                {/* TAP TO UNMUTE OVERLAY - only shows when muted */}
                {muted && (
                    <div
                        onClick={handleUnmute}
                        style={{
                            position: 'absolute',
                            bottom: 100,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 20,
                            background: 'rgba(0,0,0,0.8)',
                            color: 'white',
                            padding: '16px 32px',
                            borderRadius: 50,
                            fontSize: 18,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                            border: '2px solid rgba(255,255,255,0.3)'
                        }}
                    >
                        <span style={{ fontSize: 24 }}>🔊</span>
                        Tap to Unmute
                    </div>
                )}

                {/* Back button */}
                <Link href="/hub/social-media" style={{
                    position: 'absolute',
                    top: 16,
                    left: 16,
                    zIndex: 100,
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    textDecoration: 'none'
                }}>←</Link>

                {/* Title */}
                <div style={{
                    position: 'absolute',
                    top: 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 18,
                    zIndex: 100,
                    textShadow: '0 2px 8px rgba(0,0,0,0.9)',
                    pointerEvents: 'none'
                }}>Reels</div>

                {/* Swipe hint - shows briefly */}
                <div style={{
                    position: 'absolute',
                    bottom: 40,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 14,
                    zIndex: 5,
                    pointerEvents: 'none',
                    textShadow: '0 1px 4px rgba(0,0,0,0.8)'
                }}>
                    Swipe ↑↓ to navigate
                </div>
            </div>
        </>
    );
}
