/**
 * REELS PAGE - Full-Screen TikTok-Style Video Experience
 * 
 * CRITICAL FIXES:
 * 1. WHITE LINE/BLUE GLOW: EXTREME overscan (80px) + BLACK EDGE COVERS
 * 2. SWIPE: Document-level touch handlers + tap zones
 * 3. UNMUTE: Big centered unmute button
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
    const [muted, setMuted] = useState(true);

    const touchStartY = useRef(0);
    const touchStartTime = useRef(0);
    const isNavigating = useRef(false);

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

    const goNext = useCallback(() => {
        if (isNavigating.current) return;
        if (idx < reels.length - 1) {
            isNavigating.current = true;
            setIdx(prev => prev + 1);
            setMuted(true);
            setTimeout(() => { isNavigating.current = false; }, 300);
        }
    }, [idx, reels.length]);

    const goPrev = useCallback(() => {
        if (isNavigating.current) return;
        if (idx > 0) {
            isNavigating.current = true;
            setIdx(prev => prev - 1);
            setMuted(true);
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
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [goNext, goPrev]);

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

    const youtubeUrl = `https://www.youtube.com/embed/${reel?.videoId}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${reel?.videoId}&playsinline=1&controls=1&rel=0&modestbranding=1&enablejsapi=1`;

    // EXTREME overscan to hide YouTube's ambient glow
    const OVERSCAN = 80;

    return (
        <>
            <Head>
                <title>Reels | Smarter Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            {/* Main container */}
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

                {/* VIDEO CONTAINER with clip-path */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    clipPath: 'inset(0)',
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
                                top: -OVERSCAN,
                                left: -OVERSCAN,
                                width: `calc(100% + ${OVERSCAN * 2}px)`,
                                height: `calc(100% + ${OVERSCAN * 2}px)`,
                                border: 'none',
                                pointerEvents: 'auto'
                            }}
                        />
                    )}
                </div>

                {/* BLACK EDGE COVERS - Physically cover any glow that leaks through */}
                {/* LEFT COVER */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 60,
                    height: '100%',
                    background: 'linear-gradient(to right, #000 0%, #000 70%, transparent 100%)',
                    zIndex: 8,
                    pointerEvents: 'none'
                }} />

                {/* RIGHT COVER */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: 60,
                    height: '100%',
                    background: 'linear-gradient(to left, #000 0%, #000 70%, transparent 100%)',
                    zIndex: 8,
                    pointerEvents: 'none'
                }} />

                {/* TOP COVER */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: 60,
                    background: 'linear-gradient(to bottom, #000 0%, #000 70%, transparent 100%)',
                    zIndex: 8,
                    pointerEvents: 'none'
                }} />

                {/* BOTTOM COVER */}
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: 60,
                    background: 'linear-gradient(to top, #000 0%, #000 70%, transparent 100%)',
                    zIndex: 8,
                    pointerEvents: 'none'
                }} />

                {/* LEFT TAP ZONE */}
                <div
                    onClick={() => goPrev()}
                    style={{
                        position: 'absolute',
                        top: 60,
                        left: 0,
                        width: '30%',
                        height: 'calc(100% - 180px)',
                        zIndex: 15,
                        cursor: 'pointer'
                    }}
                />

                {/* RIGHT TAP ZONE */}
                <div
                    onClick={() => goNext()}
                    style={{
                        position: 'absolute',
                        top: 60,
                        right: 0,
                        width: '30%',
                        height: 'calc(100% - 180px)',
                        zIndex: 15,
                        cursor: 'pointer'
                    }}
                />

                {/* UNMUTE BUTTON */}
                {muted && (
                    <div
                        onClick={() => setMuted(false)}
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 50,
                            background: 'rgba(0,0,0,0.9)',
                            color: 'white',
                            padding: '20px 40px',
                            borderRadius: 100,
                            fontSize: 20,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                            border: '3px solid rgba(255,255,255,0.5)'
                        }}
                    >
                        <span style={{ fontSize: 32 }}>🔊</span>
                        TAP TO UNMUTE
                    </div>
                )}

                {/* Back button */}
                <Link href="/hub/social-media" style={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    zIndex: 100,
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.9)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    textDecoration: 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                }}>←</Link>

                {/* Title */}
                <div style={{
                    position: 'absolute',
                    top: 18,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 18,
                    zIndex: 100,
                    textShadow: '0 2px 8px rgba(0,0,0,1)',
                    pointerEvents: 'none'
                }}>Reels</div>

                {/* Navigation hint */}
                <div style={{
                    position: 'absolute',
                    bottom: 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 13,
                    zIndex: 100,
                    pointerEvents: 'none',
                    textShadow: '0 1px 4px rgba(0,0,0,0.8)'
                }}>
                    Swipe ↑↓ or tap edges
                </div>

                {/* Video counter */}
                <div style={{
                    position: 'absolute',
                    bottom: 20,
                    right: 20,
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 12,
                    zIndex: 100,
                    pointerEvents: 'none'
                }}>
                    {idx + 1} / {reels.length}
                </div>
            </div>
        </>
    );
}
