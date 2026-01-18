/**
 * REELS PAGE - Facebook-style permanent video archive
 * Videos from Stories are saved here permanently
 */

import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import Link from 'next/link';

const C = {
    bg: '#000000',
    card: '#1C1C1E',
    text: '#FFFFFF',
    textSec: 'rgba(255,255,255,0.7)',
    border: '#2C2C2E',
    blue: '#0A84FF',
    red: '#FF453A',
    pink: '#FF2D55',
};

// Time ago helper
function timeAgo(d) {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d ago`;
}

export default function ReelsPage() {
    const [reels, setReels] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [muted, setMuted] = useState(true);
    const [liked, setLiked] = useState({});
    const [user, setUser] = useState(null);
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const router = useRouter();

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user) setUser(data.user);
        });
        loadReels();
    }, []);

    const loadReels = async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('social_reels')
                .select(`
                    *,
                    profiles:author_id (id, username, avatar_url, full_name)
                `)
                .eq('is_public', true)
                .order('created_at', { ascending: false })
                .limit(50);

            if (data) setReels(data);
        } catch (e) {
            console.error('Load reels error:', e);
        }
        setLoading(false);
    };

    const currentReel = reels[currentIndex];

    const goNext = () => {
        if (currentIndex < reels.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const goPrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const handleLike = async () => {
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
    }, [currentIndex]);

    // Touch/scroll navigation
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let startY = 0;
        const handleTouchStart = (e) => { startY = e.touches[0].clientY; };
        const handleTouchEnd = (e) => {
            const endY = e.changedTouches[0].clientY;
            const diff = startY - endY;
            if (diff > 50) goNext();
            if (diff < -50) goPrev();
        };

        container.addEventListener('touchstart', handleTouchStart);
        container.addEventListener('touchend', handleTouchEnd);
        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [currentIndex]);

    if (loading) {
        return (
            <>
                <Head><title>Reels | Smarter Poker</title></Head>
                <div style={{
                    minHeight: '100vh', background: C.bg,
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
                    minHeight: '100vh', background: C.bg,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>🎬</div>
                    <h1 style={{ color: C.text, fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
                        No Reels Yet
                    </h1>
                    <p style={{ color: C.textSec, fontSize: 16, marginBottom: 32, textAlign: 'center', maxWidth: 300 }}>
                        When you post videos to your Stories, they'll be saved here permanently as Reels.
                    </p>
                    <Link href="/hub/social-media" style={{
                        padding: '12px 32px',
                        background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
                        color: 'white',
                        borderRadius: 8,
                        fontWeight: 600,
                        textDecoration: 'none',
                    }}>
                        Back to Feed
                    </Link>
                </div>
            </>
        );
    }

    return (
        <>
            <Head>
                <title>Reels | Smarter Poker</title>
                <meta name="viewport" content="width=800, user-scalable=no" />
                <style>{`
                    .reels-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .reels-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .reels-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .reels-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .reels-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .reels-page { zoom: 1.5; } }
                `}</style>
            </Head>
            <div className="reels-page"
                ref={containerRef}
                style={{
                    minHeight: '100vh',
                    background: C.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {/* Back button */}
                <Link
                    href="/hub/social-media"
                    style={{
                        position: 'fixed', top: 20, left: 20,
                        width: 44, height: 44, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)',
                        border: 'none', color: 'white', fontSize: 20,
                        cursor: 'pointer', zIndex: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none',
                    }}
                >←</Link>

                {/* Title */}
                <div style={{
                    position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
                    color: 'white', fontWeight: 700, fontSize: 18, zIndex: 10,
                }}>
                    Reels
                </div>

                {/* Reel container */}
                <div style={{
                    width: '100%',
                    maxWidth: 420,
                    height: '100vh',
                    position: 'relative',
                    background: '#000',
                }}>
                    {/* Video */}
                    <video
                        ref={videoRef}
                        key={currentReel?.id}
                        src={currentReel?.video_url}
                        autoPlay
                        loop
                        muted={muted}
                        playsInline
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }}
                        onClick={() => setMuted(prev => !prev)}
                    />

                    {/* Author info overlay */}
                    <div style={{
                        position: 'absolute', bottom: 80, left: 16, right: 80,
                        zIndex: 10,
                    }}>
                        <Link href={`/hub/user/${currentReel?.profiles?.username}`} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            textDecoration: 'none', marginBottom: 12,
                        }}>
                            <img
                                src={currentReel?.profiles?.avatar_url || '/default-avatar.png'}
                                style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid white' }}
                            />
                            <div>
                                <div style={{ color: 'white', fontWeight: 600, fontSize: 15 }}>
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
                                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                            }}>
                                {currentReel.caption}
                            </p>
                        )}
                    </div>

                    {/* Action buttons (right side) */}
                    <div style={{
                        position: 'absolute', bottom: 100, right: 16,
                        display: 'flex', flexDirection: 'column', gap: 20,
                        zIndex: 10,
                    }}>
                        {/* Like */}
                        <button
                            onClick={handleLike}
                            style={{
                                background: 'none', border: 'none',
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                cursor: 'pointer',
                            }}
                        >
                            <span style={{ fontSize: 28 }}>
                                {liked[currentReel?.id] ? '❤️' : '🤍'}
                            </span>
                            <span style={{ color: 'white', fontSize: 12 }}>
                                {(currentReel?.like_count || 0) + (liked[currentReel?.id] ? 1 : 0)}
                            </span>
                        </button>

                        {/* Comment */}
                        <button style={{
                            background: 'none', border: 'none',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            cursor: 'pointer',
                        }}>
                            <span style={{ fontSize: 28 }}>💬</span>
                            <span style={{ color: 'white', fontSize: 12 }}>Comment</span>
                        </button>

                        {/* Share */}
                        <button style={{
                            background: 'none', border: 'none',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            cursor: 'pointer',
                        }}>
                            <span style={{ fontSize: 28 }}>📤</span>
                            <span style={{ color: 'white', fontSize: 12 }}>Share</span>
                        </button>

                        {/* Sound toggle */}
                        <button
                            onClick={() => setMuted(prev => !prev)}
                            style={{
                                background: 'none', border: 'none',
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                cursor: 'pointer',
                            }}
                        >
                            <span style={{ fontSize: 24 }}>{muted ? '🔇' : '🔊'}</span>
                        </button>
                    </div>

                    {/* Navigation indicators */}
                    {reels.length > 1 && (
                        <div style={{
                            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                            display: 'flex', flexDirection: 'column', gap: 4,
                        }}>
                            {reels.slice(0, 10).map((_, i) => (
                                <div
                                    key={i}
                                    onClick={() => setCurrentIndex(i)}
                                    style={{
                                        width: 4,
                                        height: i === currentIndex ? 24 : 16,
                                        borderRadius: 2,
                                        background: i === currentIndex ? 'white' : 'rgba(255,255,255,0.3)',
                                        transition: 'all 0.2s',
                                        cursor: 'pointer',
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* View count */}
                    <div style={{
                        position: 'absolute', bottom: 20, left: 16,
                        color: C.textSec, fontSize: 12,
                        display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                        👁 {currentReel?.view_count || 0} views
                    </div>

                    {/* Reel counter */}
                    <div style={{
                        position: 'absolute', bottom: 20, right: 16,
                        color: C.textSec, fontSize: 12,
                    }}>
                        {currentIndex + 1} / {reels.length}
                    </div>
                </div>
            </div>
        </>
    );
}
