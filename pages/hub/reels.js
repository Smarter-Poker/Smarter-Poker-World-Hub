/**
 * REELS PAGE - Full-Screen TikTok-Style Video Experience
 * 
 * KEY FEATURES:
 * 1. Full-screen video with black borders (hides YouTube letterboxing)
 * 2. YouTube IFrame API for REAL unmute (no iframe reload)
 * 3. Swipe/tap navigation
 * 4. Videos autoplay muted (browser requirement)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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
    const [showUnmuteHint, setShowUnmuteHint] = useState(true);

    const iframeRef = useRef(null);
    const touchStartY = useRef(0);
    const touchStartTime = useRef(0);
    const isNavigating = useRef(false);

    useEffect(() => {
        loadReels();
        // Hide unmute hint after first interaction
        const hideHint = () => setShowUnmuteHint(false);
        document.addEventListener('touchstart', hideHint, { once: true });
        document.addEventListener('click', hideHint, { once: true });
        return () => {
            document.removeEventListener('touchstart', hideHint);
            document.removeEventListener('click', hideHint);
        };
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

    // Send command to YouTube iframe via postMessage
    const sendYouTubeCommand = useCallback((command, args = []) => {
        if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: command,
                args: args
            }), '*');
        }
    }, []);

    // Unmute the video using YouTube API
    const handleUnmute = useCallback(() => {
        sendYouTubeCommand('unMute');
        sendYouTubeCommand('setVolume', [100]);
        setShowUnmuteHint(false);
    }, [sendYouTubeCommand]);

    const goNext = useCallback(() => {
        if (isNavigating.current) return;
        if (idx < reels.length - 1) {
            isNavigating.current = true;
            setIdx(prev => prev + 1);
            setShowUnmuteHint(true); // Show hint for new video
            setTimeout(() => { isNavigating.current = false; }, 300);
        }
    }, [idx, reels.length]);

    const goPrev = useCallback(() => {
        if (isNavigating.current) return;
        if (idx > 0) {
            isNavigating.current = true;
            setIdx(prev => prev - 1);
            setShowUnmuteHint(true);
            setTimeout(() => { isNavigating.current = false; }, 300);
        }
    }, [idx]);

    // Document-level touch handlers
    useEffect(() => {
        const handleTouchStart = (e) => {
            touchStartY.current = e.touches[0].clientY;
            touchStartTime.current = Date.now();
        };

        const handleTouchEnd = (e) => {
            const deltaY = touchStartY.current - e.changedTouches[0].clientY;
            const deltaTime = Date.now() - touchStartTime.current;

            if (Math.abs(deltaY) > 80 && deltaTime < 400) {
                e.preventDefault();
                if (deltaY > 0) goNext();
                else goPrev();
            }
        };

        document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });

        return () => {
            document.removeEventListener('touchstart', handleTouchStart, { capture: true });
            document.removeEventListener('touchend', handleTouchEnd, { capture: true });
        };
    }, [goNext, goPrev]);

    // Keyboard navigation
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'ArrowDown') goNext();
            if (e.key === 'ArrowUp') goPrev();
            if (e.key === 'm' || e.key === 'M') handleUnmute();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [goNext, goPrev, handleUnmute]);

    // Mouse wheel navigation
    useEffect(() => {
        let wheelCooldown = false;
        const handler = (e) => {
            if (wheelCooldown) return;
            if (Math.abs(e.deltaY) > 50) {
                wheelCooldown = true;
                if (e.deltaY > 0) goNext();
                else goPrev();
                setTimeout(() => { wheelCooldown = false; }, 500);
            }
        };
        window.addEventListener('wheel', handler, { passive: true });
        return () => window.removeEventListener('wheel', handler);
    }, [goNext, goPrev]);

    const reel = reels[idx];

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

    // YouTube URL with mute=1 for autoplay (browser requirement), enablejsapi=1 for API control
    const youtubeUrl = `https://www.youtube.com/embed/${reel?.videoId}?autoplay=1&mute=1&loop=1&playlist=${reel?.videoId}&playsinline=1&controls=1&rel=0&modestbranding=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`;

    // Black frame size
    const FRAME = 30;

    return (
        <>
            <Head>
                <title>Reels | Smarter Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            {/* Main container - full screen black */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: '#000',
                overflow: 'hidden',
                touchAction: 'none'
            }}>

                {/* VIDEO AREA - inset with black frame */}
                <div style={{
                    position: 'absolute',
                    top: FRAME,
                    left: FRAME,
                    right: FRAME,
                    bottom: FRAME,
                    overflow: 'hidden',
                    borderRadius: 12,
                    background: '#111'
                }}>
                    {reel && (
                        <iframe
                            ref={iframeRef}
                            key={reel.id}
                            src={youtubeUrl}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            style={{
                                position: 'absolute',
                                top: -15,
                                left: -15,
                                width: 'calc(100% + 30px)',
                                height: 'calc(100% + 30px)',
                                border: 'none'
                            }}
                        />
                    )}
                </div>

                {/* NAVIGATION TAP ZONES - on the black frame edges */}
                {/* LEFT - Previous */}
                <div
                    onClick={goPrev}
                    style={{
                        position: 'absolute',
                        top: FRAME,
                        left: 0,
                        width: FRAME + 40,
                        height: `calc(100% - ${FRAME * 2}px)`,
                        zIndex: 20,
                        cursor: 'pointer'
                    }}
                />

                {/* RIGHT - Next */}
                <div
                    onClick={goNext}
                    style={{
                        position: 'absolute',
                        top: FRAME,
                        right: 0,
                        width: FRAME + 40,
                        height: `calc(100% - ${FRAME * 2}px)`,
                        zIndex: 20,
                        cursor: 'pointer'
                    }}
                />

                {/* UNMUTE BUTTON - Tap to enable sound */}
                {showUnmuteHint && (
                    <div
                        onClick={handleUnmute}
                        style={{
                            position: 'absolute',
                            bottom: FRAME + 80,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 50,
                            background: 'rgba(255,255,255,0.95)',
                            color: '#000',
                            padding: '14px 28px',
                            borderRadius: 50,
                            fontSize: 16,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
                        }}
                    >
                        <span style={{ fontSize: 22 }}>🔊</span>
                        Tap for Sound
                    </div>
                )}

                {/* Header bar */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: FRAME,
                    background: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px',
                    zIndex: 30
                }}>
                    <Link href="/hub/social-media" style={{
                        color: 'white',
                        fontSize: 22,
                        textDecoration: 'none'
                    }}>←</Link>

                    <span style={{
                        color: 'white',
                        fontWeight: 700,
                        fontSize: 16
                    }}>Reels</span>

                    <span style={{
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: 12
                    }}>{idx + 1}/{reels.length}</span>
                </div>

                {/* Footer hint */}
                <div style={{
                    position: 'absolute',
                    bottom: 8,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: 12,
                    zIndex: 30
                }}>
                    Swipe ↑↓ or tap edges
                </div>
            </div>
        </>
    );
}
