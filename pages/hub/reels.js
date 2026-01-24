/**
 * REELS PAGE - TikTok-style Full-Screen Video Experience
 * Tap top half = previous, tap bottom half = next
 * Video autoplays muted with easy unmute
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';
import Link from 'next/link';

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
    const [liked, setLiked] = useState({});

    useEffect(() => {
        loadReels();
    }, []);

    const loadReels = async () => {
        try {
            const { data } = await supabase
                .from('social_posts')
                .select('id, author_id, content, media_urls, like_count, created_at')
                .eq('content_type', 'video')
                .eq('visibility', 'public')
                .order('created_at', { ascending: false })
                .limit(100);

            if (data?.length > 0) {
                const authorIds = [...new Set(data.map(p => p.author_id))];
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, full_name')
                    .in('id', authorIds);

                const profileMap = {};
                (profiles || []).forEach(p => { profileMap[p.id] = p; });

                const mapped = data
                    .filter(p => p.media_urls?.length > 0)
                    .map(p => ({
                        id: p.id,
                        video_url: p.media_urls[0],
                        caption: p.content,
                        like_count: p.like_count || 0,
                        created_at: p.created_at,
                        profiles: profileMap[p.author_id] || { username: 'Anonymous' },
                    }))
                    .sort(() => Math.random() - 0.5);
                setReels(mapped);
            }
        } catch (e) {
            console.error('Load error:', e);
        }
        setLoading(false);
    };

    const reel = reels[idx];
    const videoId = getYouTubeVideoId(reel?.video_url);

    const goNext = () => idx < reels.length - 1 && setIdx(idx + 1);
    const goPrev = () => idx > 0 && setIdx(idx - 1);

    // Touch swipe handling
    useEffect(() => {
        let startY = 0;
        let startTime = 0;

        const onTouchStart = (e) => {
            startY = e.touches[0].clientY;
            startTime = Date.now();
        };

        const onTouchEnd = (e) => {
            const endY = e.changedTouches[0].clientY;
            const diff = startY - endY;
            const timeDiff = Date.now() - startTime;

            // Quick swipe: > 50px within 500ms
            if (timeDiff < 500 && Math.abs(diff) > 50) {
                if (diff > 0) {
                    // Swipe up = next
                    if (idx < reels.length - 1) setIdx(i => i + 1);
                } else {
                    // Swipe down = previous
                    if (idx > 0) setIdx(i => i - 1);
                }
            }
        };

        document.addEventListener('touchstart', onTouchStart, { passive: true });
        document.addEventListener('touchend', onTouchEnd, { passive: true });

        return () => {
            document.removeEventListener('touchstart', onTouchStart);
            document.removeEventListener('touchend', onTouchEnd);
        };
    }, [idx, reels.length]);

    // Keyboard
    useEffect(() => {
        const h = (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') goPrev();
            if (e.key === 'm') setMuted(m => !m);
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    });

    if (loading) {
        return (
            <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#fff', fontSize: 18 }}>Loading Reels...</div>
            </div>
        );
    }

    if (!reels.length) {
        return (
            <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>🎬</div>
                <h1 style={{ color: '#fff', fontSize: 28, marginBottom: 8 }}>No Reels Yet</h1>
                <Link href="/hub/social-media" style={{ padding: '12px 32px', background: 'linear-gradient(135deg, #833AB4, #FD1D1D)', color: 'white', borderRadius: 8, textDecoration: 'none' }}>
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

            <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
                {videoId && (
                    <iframe
                        key={reel.id}
                        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=1&rel=0&modestbranding=1&playsinline=1&fs=0`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        style={{
                            position: 'absolute',
                            top: '-20px',
                            left: '-20px',
                            width: 'calc(100% + 40px)',
                            height: 'calc(100% + 40px)',
                            border: 'none',
                        }}
                    />
                )}

                {/* Black edge covers to hide any white lines from iframe */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 20, background: '#000', zIndex: 10 }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 20, background: '#000', zIndex: 10 }} />
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 20, background: '#000', zIndex: 10 }} />
                <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 20, background: '#000', zIndex: 10 }} />

                {/* Back button */}
                <Link href="/hub/social-media" style={{
                    position: 'absolute', top: 16, left: 16, zIndex: 100,
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, textDecoration: 'none',
                }}>←</Link>

                {/* Title */}
                <div style={{
                    position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                    color: 'white', fontWeight: 700, fontSize: 18, zIndex: 100,
                }}>Reels</div>



                {/* Author */}
                <div style={{
                    position: 'absolute', bottom: 100, left: 16, right: 80, zIndex: 100,
                    pointerEvents: 'none',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <img src={reel?.profiles?.avatar_url || '/default-avatar.png'}
                            style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid white' }} />
                        <div>
                            <div style={{ color: 'white', fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                                {reel?.profiles?.full_name || reel?.profiles?.username}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{timeAgo(reel?.created_at)}</div>
                        </div>
                    </div>
                    {reel?.caption && (
                        <p style={{ color: 'white', fontSize: 14, margin: 0, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                            {reel.caption.slice(0, 80)}{reel.caption.length > 80 ? '...' : ''}
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div style={{
                    position: 'absolute', bottom: 120, right: 12, zIndex: 100,
                    display: 'flex', flexDirection: 'column', gap: 16,
                }}>
                    <div onClick={() => setLiked(p => ({ ...p, [reel.id]: !p[reel.id] }))} style={{ textAlign: 'center', cursor: 'pointer' }}>
                        <div style={{ fontSize: 32 }}>{liked[reel?.id] ? '❤️' : '🤍'}</div>
                        <div style={{ color: 'white', fontSize: 11 }}>{(reel?.like_count || 0) + (liked[reel?.id] ? 1 : 0)}</div>
                    </div>
                </div>

                {/* Navigation hint at bottom */}
                <div style={{
                    position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)',
                    color: 'rgba(255,255,255,0.6)', fontSize: 12, zIndex: 100,
                    textAlign: 'center',
                }}>
                    Swipe ↑↓ to navigate
                </div>
            </div>
        </>
    );
}
