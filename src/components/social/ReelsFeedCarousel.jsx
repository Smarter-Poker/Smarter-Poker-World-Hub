/**
 * REELS FEED CAROUSEL - SmarterPoker-style inline Reels in the feed
 * Horizontal scrollable carousel that appears between posts
 * Swipe right to see more reels
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useSupabase } from '../../providers/SupabaseProvider';
import { busEmit } from '../../engine/EventBus';
import Link from 'next/link';

const C = {
    bg: '#FFFFFF',
    card: '#FFFFFF',
    text: '#050505',
    textSec: '#65676B',
    border: '#DADDE1',
    blue: '#1877F2',
};

// Time ago helper
function timeAgo(d) {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
}

// Format view count (456000 -> 456K)
function formatViews(count) {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toString();
}

// YouTube URL helpers
function isYouTubeUrl(url) {
    if (!url) return false;
    return url.includes('youtube.com') || url.includes('youtu.be');
}

function getYouTubeVideoId(url) {
    if (!url) return null;
    // Handle YouTube Shorts URLs
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

function getYouTubeThumbnail(url) {
    const videoId = getYouTubeVideoId(url);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    return null;
}

// Individual Reel Card in the carousel
function ReelCard({ reel, onClick }) {
    const [isHovered, setIsHovered] = useState(false);
    const videoRef = useRef(null);

    const isYouTube = isYouTubeUrl(reel.video_url);
    const youtubeThumbnail = isYouTube ? (reel.thumbnail_url || getYouTubeThumbnail(reel.video_url)) : null;

    const handleClick = () => {
        // Always use internal viewer - no more opening YouTube externally
        if (onClick) {
            onClick();
        }
    };

    const handleMouseEnter = () => {
        setIsHovered(true);
        if (!isYouTube && videoRef.current) videoRef.current.play();
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        if (!isYouTube && videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
    };

    return (
        <div
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
                width: 140,
                height: 250,
                borderRadius: 12,
                overflow: 'hidden',
                position: 'relative',
                cursor: 'pointer',
                flexShrink: 0,
                background: '#000',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                transition: 'transform 0.2s',
            }}
        >
            {/* Thumbnail image for YouTube, video for direct URLs */}
            {isYouTube ? (
                <img
                    src={youtubeThumbnail || '/default-reel-thumb.jpg'}
                    alt={reel.caption || 'Reel'}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                />
            ) : (
                <video
                    ref={videoRef}
                    src={reel.video_url}
                    muted
                    loop
                    playsInline
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                />
            )}


            {/* Gradient overlay */}
            <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 80,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
            }} />

            {/* Author info */}
            <div style={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                right: 8,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <img
                        src={reel.profiles?.avatar_url || '/default-avatar.png'}
                        style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '2px solid white',
                        }}
                    />
                    <span style={{
                        color: 'white',
                        fontSize: 11,
                        fontWeight: 600,
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {reel.profiles?.username || 'User'}
                    </span>
                </div>
                {reel.caption && (
                    <p style={{
                        color: 'rgba(255,255,255,0.9)',
                        fontSize: 10,
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    }}>
                        {reel.caption}
                    </p>
                )}
            </div>

            {/* View count */}
            <div style={{
                position: 'absolute',
                top: 8,
                left: 8,
                background: 'rgba(0,0,0,0.6)',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 10,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
            }}>
                {formatViews(reel.view_count)} views
            </div>
        </div>
    );
}

function ReelViewer({ reels, startIndex, onClose }) {
    const { user: authUser } = useSupabase();
    const [currentIndex, setCurrentIndex] = useState(startIndex);
    const [muted, setMuted] = useState(false);
    const [liked, setLiked] = useState({});
    const [showComments, setShowComments] = useState(false);
    const [reelComments, setReelComments] = useState([]);
    const [commentText, setCommentText] = useState('');
    const [showOverlay, setShowOverlay] = useState(false);
    const commentInputRef = useRef(null);
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const overlayTimerRef = useRef(null);
    const touchStartRef = useRef({ x: 0, y: 0 });

    const currentReel = reels[currentIndex];

    const goNext = () => {
        if (currentIndex < reels.length - 1) setCurrentIndex(prev => prev + 1);
    };

    const goPrev = () => {
        if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
    };

    // Auto-hide overlay after 2 seconds
    useEffect(() => {
        if (showOverlay) {
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2000);
        }
        return () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current); };
    }, [showOverlay]);

    // Swipe gesture support
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handleTouchStart = (e) => {
            touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        };
        const handleTouchEnd = (e) => {
            const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
            const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 50) {
                if (dy < 0) goNext();  // Swipe up = next
                else goPrev();         // Swipe down = prev
            }
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                if (dx < 0) goNext();  // Swipe left = next
                else goPrev();         // Swipe right = prev
            }
        };
        el.addEventListener('touchstart', handleTouchStart, { passive: true });
        el.addEventListener('touchend', handleTouchEnd, { passive: true });
        return () => {
            el.removeEventListener('touchstart', handleTouchStart);
            el.removeEventListener('touchend', handleTouchEnd);
        };
    }, [currentIndex, reels.length]);

    const handleLike = async () => {
        if (!currentReel || !authUser?.id) return;
        const currentId = currentReel.id;
        const userId = authUser.id;
        const wasLiked = liked[currentId];
        setLiked(prev => ({ ...prev, [currentId]: !prev[currentId] }));

        try {
            if (wasLiked) {
                await supabase.from('social_interactions')
                    .delete()
                    .eq('post_id', currentId)
                    .eq('user_id', userId)
                    .eq('interaction_type', 'like');
                busEmit.socialPostLiked(currentId, userId, { added: false, reactionType: 'like' });
            } else {
                await supabase.from('social_interactions')
                    .insert({ post_id: currentId, user_id: userId, interaction_type: 'like' });
                busEmit.socialPostLiked(currentId, userId, { added: true, reactionType: 'like' });
            }
        } catch (err) {
            console.warn('Reel like persistence failed:', err.message);
            setLiked(prev => ({ ...prev, [currentId]: wasLiked }));
        }
    };

    // Toggle comment drawer and load comments
    const handleToggleComments = async () => {
        const opening = !showComments;
        setShowComments(opening);
        if (opening && currentReel?.id) {
            try {
                const { data } = await supabase
                    .from('social_comments')
                    .select('*, profiles:author_id (username, avatar_url)')
                    .eq('post_id', currentReel.id)
                    .order('created_at', { ascending: true })
                    .limit(20);
                setReelComments(data || []);
            } catch { setReelComments([]); }
            setTimeout(() => commentInputRef.current?.focus(), 100);
        }
    };

    // Submit comment
    const handleSubmitComment = async (e) => {
        if (e.key !== 'Enter' || !commentText.trim() || !authUser?.id || !currentReel?.id) return;
        const text = commentText.trim();
        const tempId = Date.now();
        setCommentText('');
        setReelComments(prev => [...prev, {
            id: tempId, content: text,
            profiles: { username: 'You', avatar_url: null },
            created_at: new Date().toISOString()
        }]);
        try {
            const { error } = await supabase.from('social_comments').insert({
                post_id: currentReel.id, author_id: authUser.id, content: text
            });
            if (error) throw error;
            busEmit.socialCommentAdded(currentReel.id, authUser.id);
            supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'comment_count' }).catch(() => {});
        } catch {
            setReelComments(prev => prev.filter(c => c.id !== tempId));
        }
    };

    // Share handler
    const handleShare = async () => {
        if (!currentReel?.id) return;
        const url = `${window.location.origin}/hub/social-media?reel=${currentReel.id}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Check out this reel on Smarter.Poker', url });
            } else {
                await navigator.clipboard.writeText(url);
            }
        } catch { /* user cancelled or clipboard failed */ }
        // Increment share_count in Supabase
        supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'share_count' }).catch(() => {});
        busEmit.socialPostShared?.(currentReel.id, authUser?.id);
    };

    // Reset on reel change
    useEffect(() => {
        setShowComments(false);
        setReelComments([]);
        setCommentText('');
        setShowOverlay(false);
    }, [currentIndex]);

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e) => {
            if (showComments && e.target.tagName === 'INPUT') return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev();
            if (e.key === 'Escape') { if (showComments) setShowComments(false); else onClose(); }
            if (e.key === 'm') setMuted(prev => !prev);
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [currentIndex, onClose, showComments]);

    if (!currentReel) return null;

    const handleTap = () => {
        if (!showOverlay) {
            setShowOverlay(true);
        } else {
            setShowOverlay(true); // Reset timer
        }
    };

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.95)', zIndex: 10000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={handleTap}
        >
            {/* Close button */}
            <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                aria-label="Close reels"
                style={{
                    position: 'absolute', top: 20, right: 20,
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none', color: 'white', fontSize: 20,
                    cursor: 'pointer', zIndex: 10,
                }}
            >✕</button>

            {/* Reel container - FULLSCREEN TikTok-style */}
            <div style={{
                width: '100vw', height: '100vh',
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: '#000',
            }}>
                {isYouTubeUrl(currentReel.video_url) ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        <iframe
                            key={currentReel.id}
                            src={`https://www.youtube.com/embed/${getYouTubeVideoId(currentReel.video_url)}?autoplay=1&rel=0&modestbranding=1&playsinline=1&controls=1&showinfo=0&iv_load_policy=3&fs=0&disablekb=0&cc_load_policy=0&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                        {!showOverlay && <div style={{ position: 'absolute', inset: 0, zIndex: 1 }} />}
                    </div>
                ) : (
                    <video
                        ref={videoRef}
                        key={currentReel.id}
                        src={currentReel.video_url}
                        autoPlay
                        loop
                        muted={muted}
                        playsInline
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                )}

                {/* Author overlay */}
                <div style={{
                    position: 'absolute', bottom: 80, left: 16, right: 16,
                    pointerEvents: 'none',
                }}>
                    <Link href={`/hub/user/${currentReel.profiles?.username}`} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        textDecoration: 'none', marginBottom: 12, pointerEvents: 'auto',
                    }}>
                        <img
                            src={currentReel.profiles?.avatar_url || '/default-avatar.png'}
                            style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid white' }}
                        />
                        <div>
                            <div style={{ color: 'white', fontWeight: 600 }}>
                                {currentReel.profiles?.full_name || currentReel.profiles?.username}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                                {timeAgo(currentReel.created_at)}
                            </div>
                        </div>
                    </Link>
                    {currentReel.caption && (
                        <p style={{ color: 'white', fontSize: 14, margin: 0, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                            {currentReel.caption}
                        </p>
                    )}
                </div>

                {/* Bottom Overlay — tap to reveal, auto-hides after 2s */}
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                        padding: '24px 12px 20px',
                        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
                        opacity: showOverlay ? 1 : 0,
                        pointerEvents: showOverlay ? 'auto' : 'none',
                        transition: 'opacity 0.3s ease',
                        zIndex: 20,
                    }}
                >
                    <button onClick={handleLike} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 24 }}>{liked[currentReel.id] ? '❤️' : '👍'}</span>
                        <span style={{ fontSize: 10, fontWeight: 500 }}>Like</span>
                    </button>
                    <button onClick={() => {}} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 24 }}>👎</span>
                        <span style={{ fontSize: 10, fontWeight: 500 }}>Dislike</span>
                    </button>
                    <button onClick={handleToggleComments} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 24 }}>💬</span>
                        <span style={{ fontSize: 10, fontWeight: 500 }}>Comment</span>
                    </button>
                    <button onClick={() => {}} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 24 }}>🔖</span>
                        <span style={{ fontSize: 10, fontWeight: 500 }}>Save</span>
                    </button>
                    <button onClick={handleShare} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 24 }}>📤</span>
                        <span style={{ fontSize: 10, fontWeight: 500 }}>Share</span>
                    </button>
                    <button onClick={() => setMuted(prev => !prev)} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 24 }}>{muted ? '🔇' : '🔊'}</span>
                        <span style={{ fontSize: 10, fontWeight: 500 }}>{muted ? 'Unmute' : 'Mute'}</span>
                    </button>
                </div>

                {/* Counter */}
                <div style={{
                    position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                    color: 'rgba(255,255,255,0.7)', fontSize: 12,
                }}>
                    {currentIndex + 1} / {reels.length}
                </div>

                {/* Comment drawer */}
                {showComments && (
                    <div onClick={(e) => e.stopPropagation()} style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        maxHeight: '40vh', background: 'rgba(0,0,0,0.85)',
                        borderTop: '1px solid rgba(255,255,255,0.15)',
                        display: 'flex', flexDirection: 'column',
                        backdropFilter: 'blur(12px)', zIndex: 30,
                    }}>
                        <div style={{ padding: '12px 16px', fontWeight: 600, color: 'white', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            Comments ({reelComments.length})
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
                            {reelComments.length === 0 && (
                                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', padding: 20 }}>No comments yet. Be the first!</p>
                            )}
                            {reelComments.map(c => (
                                <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                    <img src={c.profiles?.avatar_url || '/default-avatar.png'} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                                    <div>
                                        <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 600 }}>{c.profiles?.username || 'User'}</span>
                                        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: '2px 0 0' }}>{c.content}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 8 }}>
                            <input
                                ref={commentInputRef}
                                value={commentText}
                                onChange={e => setCommentText(e.target.value)}
                                onKeyDown={handleSubmitComment}
                                placeholder="Add a comment..."
                                style={{
                                    flex: 1, padding: '8px 12px', borderRadius: 20,
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'rgba(255,255,255,0.1)',
                                    color: 'white', fontSize: 13, outline: 'none',
                                }}
                                maxLength={2000}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Main Reels Feed Carousel component
export function ReelsFeedCarousel() {
    const [reels, setReels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerStartIndex, setViewerStartIndex] = useState(0);
    const scrollRef = useRef(null);

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
                .order('created_at', { ascending: false })
                .limit(20);

            if (data) setReels(data);
        } catch (e) {
            console.error('Load reels error:', e);
        }
        setLoading(false);
    };

    const openViewer = (index) => {
        setViewerStartIndex(index);
        setViewerOpen(true);
    };

    // Don't render if no reels
    if (!loading && reels.length === 0) return null;

    // Loading state
    if (loading) {
        return (
            <div style={{
                background: C.card,
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}>
                <div style={{ display: 'flex', gap: 12, overflow: 'hidden' }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} style={{
                            width: 140, height: 250, borderRadius: 12,
                            background: '#E4E6EB', flexShrink: 0,
                            animation: 'pulse 1.5s infinite',
                        }} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <>
            <div style={{
                background: C.card,
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>🎬</span>
                        <span style={{ fontWeight: 600, color: C.text }}>Reels</span>
                    </div>
                    <Link href="/hub/reels" style={{
                        color: C.blue,
                        fontSize: 14,
                        fontWeight: 600,
                        textDecoration: 'none',
                    }}>
                        See All →
                    </Link>
                </div>

                {/* Horizontal scroll container */}
                <div
                    ref={scrollRef}
                    style={{
                        display: 'flex',
                        gap: 12,
                        overflowX: 'auto',
                        paddingBottom: 8,
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        scrollSnapType: 'x mandatory',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    {reels.map((reel, index) => (
                        <div key={reel.id} style={{ scrollSnapAlign: 'start' }}>
                            <ReelCard
                                reel={reel}
                                onClick={() => openViewer(index)}
                            />
                        </div>
                    ))}

                    {/* See more card */}
                    <Link
                        href="/hub/reels"
                        style={{
                            width: 140,
                            height: 250,
                            borderRadius: 12,
                            flexShrink: 0,
                            background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textDecoration: 'none',
                            scrollSnapAlign: 'start',
                        }}
                    >
                        <div style={{
                            width: 48, height: 48, borderRadius: '50%',
                            background: 'rgba(255,255,255,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: 8,
                        }}>
                            <span style={{ fontSize: 24, color: 'white' }}>→</span>
                        </div>
                        <span style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>See All</span>
                        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Reels</span>
                    </Link>
                </div>
            </div>

            {/* Full-screen viewer */}
            {viewerOpen && (
                <ReelViewer
                    reels={reels}
                    startIndex={viewerStartIndex}
                    onClose={() => setViewerOpen(false)}
                />
            )}

            {/* Hide scrollbar */}
            <style jsx global>{`
                .reels-carousel::-webkit-scrollbar { display: none; }
            `}</style>
        </>
    );
}

export default ReelsFeedCarousel;
