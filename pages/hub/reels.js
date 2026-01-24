/**
 * REELS PAGE - TikTok-style Full-Screen Vertical Video Experience
 * Tap left/right edges to navigate, video autoplays (muted for browser compliance)
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import Link from 'next/link';

const C = {
    bg: '#000000',
    text: '#FFFFFF',
    textSec: 'rgba(255,255,255,0.7)',
};

function timeAgo(d) {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d ago`;
}

function getYouTubeVideoId(url) {
    if (!url) return null;
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return shortsMatch[1];
    const watchMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) return watchMatch[1];
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) return shortMatch[1];
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
    if (embedMatch) return embedMatch[1];
    return null;
}

export default function ReelsPage() {
    const [reels, setReels] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [muted, setMuted] = useState(true); // Start muted for autoplay compliance
    const [liked, setLiked] = useState({});
    const router = useRouter();

    useEffect(() => {
        loadReels();
    }, []);

    const loadReels = async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('social_posts')
                .select('id, author_id, content, media_urls, like_count, comment_count, created_at')
                .eq('content_type', 'video')
                .eq('visibility', 'public')
                .order('created_at', { ascending: false })
                .limit(100);

            if (data && data.length > 0) {
                const authorIds = [...new Set(data.map(p => p.author_id))];
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, full_name')
                    .in('id', authorIds);

                const profileMap = {};
                (profiles || []).forEach(p => { profileMap[p.id] = p; });

                const mappedReels = data
                    .filter(post => post.media_urls && post.media_urls.length > 0)
                    .map(post => ({
                        id: post.id,
                        video_url: post.media_urls[0],
                        caption: post.content,
                        like_count: post.like_count || 0,
                        created_at: post.created_at,
                        profiles: profileMap[post.author_id] || { username: 'Anonymous' },
                    }));

                const shuffled = mappedReels.sort(() => Math.random() - 0.5);
                setReels(shuffled);
            }
        } catch (e) {
            console.error('Load reels error:', e);
        }
        setLoading(false);
    };

    const currentReel = reels[currentIndex];

    const goNext = () => {
        if (currentIndex < reels.length - 1) setCurrentIndex(prev => prev + 1);
    };

    const goPrev = () => {
        if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
    };

    const handleLike = () => {
        if (!currentReel) return;
        setLiked(prev => ({ ...prev, [currentReel.id]: !prev[currentReel.id] }));
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') goPrev();
            if (e.key === 'Escape') router.push('/hub/social-media');
            if (e.key === 'm') setMuted(prev => !prev);
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [currentIndex, router]);

    if (loading) {
        return (
            <>
                <Head><title>Reels | Smarter Poker</title></Head>
                <div style={{
                    position: 'fixed', inset: 0, background: C.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{ color: C.text, fontSize: 18 }}>Loading Reels...</div>
                </div>
            </>
        );
    }

    if (!reels.length) {
        return (
            <>
                <Head><title>Reels | Smarter Poker</title></Head>
                <div style={{
                    position: 'fixed', inset: 0, background: C.bg,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>🎬</div>
                    <h1 style={{ color: C.text, fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
                        No Reels Yet
                    </h1>
                    <p style={{ color: C.textSec, fontSize: 16, marginBottom: 32, textAlign: 'center', maxWidth: 300 }}>
                        Fresh poker clips are posted hourly!
                    </p>
                    <Link href="/hub/social-media" style={{
                        padding: '12px 32px',
                        background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
                        color: 'white', borderRadius: 8, fontWeight: 600, textDecoration: 'none',
                    }}>
                        Back to Feed
                    </Link>
                </div>
            </>
        );
    }

    const videoId = getYouTubeVideoId(currentReel?.video_url);

    return (
        <>
            <Head>
                <title>Reels | Smarter Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            {/* Full-screen container */}
            <div style={{ position: 'fixed', inset: 0, background: C.bg, overflow: 'hidden' }}>

                {/* Back button */}
                <Link
                    href="/hub/social-media"
                    style={{
                        position: 'absolute', top: 16, left: 16, zIndex: 200,
                        width: 44, height: 44, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 20, textDecoration: 'none',
                    }}
                >←</Link>

                {/* Title */}
                <div style={{
                    position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                    color: 'white', fontWeight: 700, fontSize: 18, zIndex: 200,
                }}>
                    Reels
                </div>

                {/* YouTube Video - AUTOPLAY with mute for browser compliance */}
                {videoId && (
                    <iframe
                        key={`${currentReel?.id}-${muted}`}
                        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`}
                        title="Poker Reel"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowFullScreen
                        style={{
                            position: 'absolute',
                            top: 0, left: 0,
                            width: '100%', height: '100%',
                            border: 'none',
                            pointerEvents: 'auto',
                        }}
                    />
                )}

                {/* LEFT TAP ZONE - Go to previous */}
                <div
                    onClick={goPrev}
                    style={{
                        position: 'absolute',
                        top: 80, left: 0, bottom: 150,
                        width: 80,
                        zIndex: 100,
                        cursor: currentIndex > 0 ? 'pointer' : 'default',
                    }}
                />

                {/* RIGHT TAP ZONE - Go to next */}
                <div
                    onClick={goNext}
                    style={{
                        position: 'absolute',
                        top: 80, right: 0, bottom: 150,
                        width: 80,
                        zIndex: 100,
                        cursor: currentIndex < reels.length - 1 ? 'pointer' : 'default',
                    }}
                />

                {/* BOTTOM TAP ZONE for navigation buttons */}
                <div style={{
                    position: 'absolute',
                    bottom: 30,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 24,
                    zIndex: 200,
                }}>
                    <button
                        onClick={goPrev}
                        disabled={currentIndex === 0}
                        style={{
                            width: 60, height: 60, borderRadius: '50%',
                            background: currentIndex === 0 ? 'rgba(50,50,50,0.6)' : 'rgba(255,255,255,0.25)',
                            backdropFilter: 'blur(8px)',
                            border: '2px solid rgba(255,255,255,0.4)',
                            color: 'white', fontSize: 28,
                            cursor: currentIndex === 0 ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >↑</button>
                    <button
                        onClick={goNext}
                        disabled={currentIndex === reels.length - 1}
                        style={{
                            width: 60, height: 60, borderRadius: '50%',
                            background: currentIndex === reels.length - 1 ? 'rgba(50,50,50,0.6)' : 'rgba(255,255,255,0.25)',
                            backdropFilter: 'blur(8px)',
                            border: '2px solid rgba(255,255,255,0.4)',
                            color: 'white', fontSize: 28,
                            cursor: currentIndex === reels.length - 1 ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >↓</button>
                </div>

                {/* Unmute button - prominent since video starts muted */}
                {muted && (
                    <button
                        onClick={() => setMuted(false)}
                        style={{
                            position: 'absolute',
                            top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 200,
                            width: 80, height: 80, borderRadius: '50%',
                            background: 'rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(10px)',
                            border: '3px solid white',
                            color: 'white', fontSize: 36,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            animation: 'pulse 2s infinite',
                        }}
                    >🔊</button>
                )}

                {/* Author info overlay */}
                <div style={{
                    position: 'absolute', bottom: 120, left: 16, right: 100, zIndex: 150,
                    pointerEvents: 'none',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <img
                            src={currentReel?.profiles?.avatar_url || '/default-avatar.png'}
                            style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid white' }}
                        />
                        <div>
                            <div style={{ color: 'white', fontWeight: 600, fontSize: 15, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                                {currentReel?.profiles?.full_name || currentReel?.profiles?.username}
                            </div>
                            <div style={{ color: C.textSec, fontSize: 12 }}>
                                {timeAgo(currentReel?.created_at)}
                            </div>
                        </div>
                    </div>
                    {currentReel?.caption && (
                        <p style={{
                            color: 'white', fontSize: 14, margin: 0,
                            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                        }}>
                            {currentReel.caption.length > 80 ? currentReel.caption.slice(0, 80) + '...' : currentReel.caption}
                        </p>
                    )}
                </div>

                {/* Action buttons (right side) */}
                <div style={{
                    position: 'absolute', bottom: 180, right: 12,
                    display: 'flex', flexDirection: 'column', gap: 16, zIndex: 150,
                }}>
                    <button onClick={handleLike} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <span style={{ fontSize: 32, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                            {liked[currentReel?.id] ? '❤️' : '🤍'}
                        </span>
                        <span style={{ color: 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            {(currentReel?.like_count || 0) + (liked[currentReel?.id] ? 1 : 0)}
                        </span>
                    </button>

                    <button onClick={() => setMuted(prev => !prev)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <span style={{ fontSize: 28, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                            {muted ? '🔇' : '🔊'}
                        </span>
                    </button>
                </div>

                {/* Counter */}
                <div style={{
                    position: 'absolute', top: 20, right: 16, zIndex: 200,
                    color: C.textSec, fontSize: 14,
                    background: 'rgba(0,0,0,0.5)',
                    padding: '4px 10px',
                    borderRadius: 12,
                }}>
                    {currentIndex + 1} / {reels.length}
                </div>

                {/* Pulse animation for unmute button */}
                <style jsx global>{`
                    @keyframes pulse {
                        0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                        50% { transform: translate(-50%, -50%) scale(1.05); opacity: 0.9; }
                    }
                `}</style>
            </div>
        </>
    );
}
