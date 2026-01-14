/**
 * REELS COMPONENT - Facebook-style permanent video archive
 * Videos from Stories are saved here permanently
 */

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

// Full-screen Reel Viewer
export function ReelsViewer({ onClose }) {
    const [reels, setReels] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [muted, setMuted] = useState(true);
    const [liked, setLiked] = useState({});
    const videoRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
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
        // TODO: Persist to database
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') goPrev();
            if (e.key === 'Escape') onClose();
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
            <div style={{
                position: 'fixed', inset: 0, background: C.bg, zIndex: 10000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <div style={{ color: C.text, fontSize: 18 }}>Loading Reels...</div>
            </div>
        );
    }

    if (!reels.length) {
        return (
            <div style={{
                position: 'fixed', inset: 0, background: C.bg, zIndex: 10000,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
                <div style={{ color: C.text, fontSize: 18 }}>No Reels yet</div>
                <button onClick={onClose} style={{
                    marginTop: 24, padding: '12px 24px', background: C.blue,
                    color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer',
                }}>Go Back</button>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                inset: 0,
                background: C.bg,
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {/* Close button */}
            <button
                onClick={onClose}
                style={{
                    position: 'absolute', top: 20, left: 20,
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none', color: 'white', fontSize: 20,
                    cursor: 'pointer', zIndex: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >←</button>

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
                <div style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                    {reels.slice(0, 10).map((_, i) => (
                        <div
                            key={i}
                            style={{
                                width: 4,
                                height: i === currentIndex ? 24 : 16,
                                borderRadius: 2,
                                background: i === currentIndex ? 'white' : 'rgba(255,255,255,0.3)',
                                transition: 'all 0.2s',
                            }}
                        />
                    ))}
                </div>

                {/* View count */}
                <div style={{
                    position: 'absolute', bottom: 20, left: 16,
                    color: C.textSec, fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 4,
                }}>
                    👁 {currentReel?.view_count || 0} views
                </div>
            </div>
        </div>
    );
}

// Function to save a video to Reels
export async function saveVideoToReels(userId, videoUrl, caption, sourceStoryId = null) {
    try {
        const { data, error } = await supabase
            .from('social_reels')
            .insert({
                author_id: userId,
                video_url: videoUrl,
                caption: caption,
                source_story_id: sourceStoryId,
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (e) {
        console.error('Save to reels error:', e);
        return null;
    }
}

// Reels icon button for navigation
export function ReelsButton({ onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
        >
            🎬 Reels
        </button>
    );
}
