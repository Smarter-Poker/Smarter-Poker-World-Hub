/**
 * REELS PAGE - Simple Full-Screen YouTube Shorts Experience
 * - Full viewport iframe
 * - Swipe up/down to navigate between videos
 * - Tap video for YouTube controls (play/pause/volume)
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
    const touchStart = useRef(0);

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

    // Swipe handlers
    const handleTouchStart = (e) => {
        touchStart.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
        const diff = touchStart.current - e.changedTouches[0].clientY;
        if (Math.abs(diff) > 60) {
            if (diff > 0 && idx < reels.length - 1) {
                setIdx(idx + 1); // Swipe up = next
            } else if (diff < 0 && idx > 0) {
                setIdx(idx - 1); // Swipe down = prev
            }
        }
    };

    // Keyboard navigation
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'ArrowDown' && idx < reels.length - 1) setIdx(idx + 1);
            if (e.key === 'ArrowUp' && idx > 0) setIdx(idx - 1);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [idx, reels.length]);

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

    return (
        <>
            <Head>
                <title>Reels | Smarter Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: '#000',
                    overflow: 'hidden'
                }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                {/* Full-screen YouTube iframe */}
                {reel && (
                    <iframe
                        key={reel.id}
                        src={`https://www.youtube.com/embed/${reel.videoId}?autoplay=1&mute=1&loop=1&playlist=${reel.videoId}&playsinline=1&controls=1&rel=0&modestbranding=1`}
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
                    textDecoration: 'none',
                    pointerEvents: 'auto'
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
                    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                    pointerEvents: 'none'
                }}>Reels</div>
            </div>
        </>
    );
}
