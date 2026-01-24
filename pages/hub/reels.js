/**
 * REELS PAGE - TikTok-style Full-Screen Vertical Video Experience
 * Swipe up/down to navigate, tap to mute/unmute
 */

import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import Link from 'next/link';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

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
    const [muted, setMuted] = useState(false);
    const [liked, setLiked] = useState({});
    const containerRef = useRef(null);
    const touchStartY = useRef(0);
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

                // Shuffle for variety
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

    // Touch swipe navigation
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleTouchStart = (e) => {
            touchStartY.current = e.touches[0].clientY;
        };

        const handleTouchEnd = (e) => {
            const endY = e.changedTouches[0].clientY;
            const diff = touchStartY.current - endY;
            if (diff > 80) goNext();  // Swipe up = next
            if (diff < -80) goPrev(); // Swipe down = previous
        };

        // Mouse wheel
        let wheelTimeout = null;
        const handleWheel = (e) => {
            e.preventDefault();
            if (wheelTimeout) return;
            wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 400);
            if (e.deltaY > 30) goNext();
            if (e.deltaY < -30) goPrev();
        };

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchend', handleTouchEnd, { passive: true });
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchend', handleTouchEnd);
            container.removeEventListener('wheel', handleWheel);
        };
    }, [currentIndex]);

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
            <div
                ref={containerRef}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: C.bg,
                    overflow: 'hidden',
                }}
            >
                {/* Back button */}
                <Link
                    href="/hub/social-media"
                    style={{
                        position: 'absolute', top: 16, left: 16, zIndex: 100,
                        width: 44, height: 44, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 20, textDecoration: 'none',
                    }}
                >←</Link>

                {/* Title */}
                <div style={{
                    position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                    color: 'white', fontWeight: 700, fontSize: 18, zIndex: 100,
                }}>
                    Reels
                </div>

                {/* YouTube Video - TRUE FULL SCREEN */}
                {videoId ? (
                    <iframe
                        key={currentReel?.id}
                        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1`}
                        title="Poker Reel"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowFullScreen
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            border: 'none',
                        }}
                    />
                ) : (
                    <div style={{
                        width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666',
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 48, marginBottom: 8 }}>🎬</div>
                            <div>Video loading...</div>
                        </div>
                    </div>
                )}

                {/* Author info overlay */}
                <div style={{
                    position: 'absolute', bottom: 120, left: 16, right: 80, zIndex: 100,
                }}>
                    <Link href={`/hub/user/${currentReel?.profiles?.username}`} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        textDecoration: 'none', marginBottom: 12,
                    }}>
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
                    </Link>

                    {currentReel?.caption && (
                        <p style={{
                            color: 'white', fontSize: 14, margin: 0,
                            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                            maxWidth: '80%',
                        }}>
                            {currentReel.caption.length > 100 ? currentReel.caption.slice(0, 100) + '...' : currentReel.caption}
                        </p>
                    )}
                </div>

                {/* Action buttons (right side) */}
                <div style={{
                    position: 'absolute', bottom: 140, right: 16,
                    display: 'flex', flexDirection: 'column', gap: 20, zIndex: 100,
                }}>
                    {/* Like */}
                    <button onClick={handleLike} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <span style={{ fontSize: 32, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                            {liked[currentReel?.id] ? '❤️' : '🤍'}
                        </span>
                        <span style={{ color: 'white', fontSize: 12, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            {(currentReel?.like_count || 0) + (liked[currentReel?.id] ? 1 : 0)}
                        </span>
                    </button>

                    {/* Comment */}
                    <button style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <span style={{ fontSize: 32, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>💬</span>
                        <span style={{ color: 'white', fontSize: 12, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Comment</span>
                    </button>

                    {/* Share */}
                    <button style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <span style={{ fontSize: 32, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>📤</span>
                        <span style={{ color: 'white', fontSize: 12, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Share</span>
                    </button>

                    {/* Sound */}
                    <button onClick={() => setMuted(prev => !prev)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <span style={{ fontSize: 28, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                            {muted ? '🔇' : '🔊'}
                        </span>
                    </button>
                </div>

                {/* Swipe instruction */}
                <div style={{
                    position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 100,
                }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Swipe up for next</span>
                    <span style={{ fontSize: 20, marginTop: 4, color: 'rgba(255,255,255,0.6)' }}>↑</span>
                </div>

                {/* Counter */}
                <div style={{
                    position: 'absolute', bottom: 20, right: 16, zIndex: 100,
                    color: C.textSec, fontSize: 12,
                }}>
                    {currentIndex + 1} / {reels.length}
                </div>
            </div>
        </>
    );
}
