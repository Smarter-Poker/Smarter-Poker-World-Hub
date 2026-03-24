/**
 * REELS COMPONENT - SmarterPoker-style permanent video archive
 * Videos from Stories are saved here permanently
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { busEmit } from '../../engine/EventBus';
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

// Full-screen Reel Viewer
export function ReelsViewer({ onClose }) {
    const [reels, setReels] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [muted, setMuted] = useState(true);
    const [paused, setPaused] = useState(false);
    const [liked, setLiked] = useState({});
    const [currentUserId, setCurrentUserId] = useState(null);
    const [showCommentInput, setShowCommentInput] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [reelComments, setReelComments] = useState([]);
    const [shareToast, setShareToast] = useState(false);
    const [showOverlay, setShowOverlay] = useState(false);
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const commentInputRef = useRef(null);
    const overlayTimerRef = useRef(null);

    useEffect(() => {
        loadReels();
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                setCurrentUserId(user.id);
                supabase.from('social_interactions')
                    .select('post_id')
                    .eq('user_id', user.id)
                    .eq('interaction_type', 'like')
                    .then(({ data }) => {
                        if (data) {
                            const likeMap = {};
                            data.forEach(row => { likeMap[row.post_id] = true; });
                            setLiked(likeMap);
                        }
                    });
            }
        });
    }, []);

    // Reset paused state when changing reels
    useEffect(() => {
        setPaused(false);
        setShowOverlay(false);
    }, [currentIndex]);

    // Auto-hide overlay after 2 seconds
    useEffect(() => {
        if (showOverlay) {
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2000);
        }
        return () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current); };
    }, [showOverlay]);

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
        if (!currentReel || !currentUserId) return;
        const wasLiked = liked[currentReel.id];
        setLiked(prev => ({ ...prev, [currentReel.id]: !prev[currentReel.id] }));

        try {
            if (wasLiked) {
                await supabase.from('social_interactions')
                    .delete()
                    .eq('post_id', currentReel.id)
                    .eq('user_id', currentUserId)
                    .eq('interaction_type', 'like');
                busEmit.socialPostLiked(currentReel.id, currentUserId, { added: false, reactionType: 'like' });
            } else {
                await supabase.from('social_interactions')
                    .insert({ post_id: currentReel.id, user_id: currentUserId, interaction_type: 'like' });
                busEmit.socialPostLiked(currentReel.id, currentUserId, { added: true, reactionType: 'like' });
            }
        } catch (err) {
            console.warn('Reel like persistence failed:', err.message);
            setLiked(prev => ({ ...prev, [currentReel.id]: wasLiked }));
        }
    };

    // Comment handler
    const handleOpenComments = async () => {
        setShowCommentInput(prev => !prev);
        if (!showCommentInput && currentReel?.id) {
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

    const handleSubmitComment = async (e) => {
        if (e.key !== 'Enter' || !commentText.trim() || !currentUserId || !currentReel?.id) return;
        const text = commentText.trim();
        setCommentText('');
        setReelComments(prev => [...prev, {
            id: Date.now(), content: text,
            profiles: { username: 'You', avatar_url: null },
            created_at: new Date().toISOString()
        }]);
        try {
            await supabase.from('social_comments').insert({
                post_id: currentReel.id, author_id: currentUserId, content: text
            });
        } catch { /* optimistic stays */ }
    };

    // Share handler
    const handleShare = async () => {
        if (!currentReel?.id) return;
        const url = `${window.location.origin}/app/social/reel/${currentReel.id}`;
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
    };

    // Reset comment drawer on reel change
    useEffect(() => {
        setShowCommentInput(false);
        setCommentText('');
        setReelComments([]);
    }, [currentIndex]);

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e) => {
            const tag = e.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') goPrev();
            if (e.key === 'Escape') onClose();
            if (e.key === 'm') setMuted(prev => !prev);
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [currentIndex]);

    // Touch/scroll navigation (swipe to next/prev)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let startY = 0;
        let startX = 0;
        const handleTouchStart = (e) => {
            startY = e.touches[0].clientY;
            startX = e.touches[0].clientX;
        };
        const handleTouchEnd = (e) => {
            const endY = e.changedTouches[0].clientY;
            const endX = e.changedTouches[0].clientX;
            const diffY = startY - endY;
            const diffX = startX - endX;
            if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 50) {
                if (diffY > 0) goNext();   // Swipe up = next
                else goPrev();              // Swipe down = prev
            }
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                if (diffX > 0) goNext();   // Swipe left = next
                else goPrev();              // Swipe right = prev
            }
        };

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchend', handleTouchEnd, { passive: true });
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
                <div style={{ color: C.text, fontSize: 18 }}>No Reels Yet</div>
                <button onClick={onClose} style={{
                    marginTop: 24, padding: '12px 24px', background: C.blue,
                    color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer',
                }}>Go Back</button>
            </div>
        );
    }

    const handleTap = (e) => {
        // Don't trigger on comment drawer clicks
        if (showCommentInput) return;
        if (!showOverlay) {
            setShowOverlay(true);
        } else {
            // Tap while overlay visible = toggle play/pause
            if (videoRef.current) {
                if (videoRef.current.paused) {
                    videoRef.current.play();
                    setPaused(false);
                } else {
                    videoRef.current.pause();
                    setPaused(true);
                }
            }
            setShowOverlay(true); // Reset timer
        }
    };

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed', inset: 0,
                background: C.bg, zIndex: 10000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={handleTap}
        >
            {/* Close button */}
            <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
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
                width: '100%', maxWidth: 420, height: '100vh',
                position: 'relative', background: '#000',
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
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

                {/* Play Button Overlay — only when paused */}
                {paused && (
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.4)',
                        border: '2px solid rgba(255,255,255,0.8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 40, zIndex: 20, pointerEvents: 'none',
                    }}>▶</div>
                )}

                {/* Author info overlay — always visible */}
                <div style={{
                    position: 'absolute', bottom: 80, left: 16, right: 16,
                    zIndex: 10, pointerEvents: 'none',
                }}>
                    <Link href={`/hub/user/${currentReel?.profiles?.username}`} onClick={(e) => e.stopPropagation()} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        textDecoration: 'none', marginBottom: 12, pointerEvents: 'auto',
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

                {/* Bottom Overlay — tap to reveal, auto-hides after 2s */}
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                        padding: '24px 8px 20px',
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
                        <span style={{ fontSize: 22 }}>{liked[currentReel?.id] ? '❤️' : '👍'}</span>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>Like</span>
                    </button>
                    <button onClick={() => {}} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 22 }}>👎</span>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>Dislike</span>
                    </button>
                    <button onClick={handleOpenComments} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 22 }}>💬</span>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>Comment</span>
                    </button>
                    <button onClick={() => {}} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 22 }}>🔖</span>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>Save</span>
                    </button>
                    <button onClick={handleShare} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 22 }}>📤</span>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>Share</span>
                    </button>
                    <button onClick={() => setMuted(prev => !prev)} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 22 }}>{muted ? '🔇' : '🔊'}</span>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>{muted ? 'Unmute' : 'Mute'}</span>
                    </button>
                </div>

                {/* Comment Drawer */}
                {showCommentInput && (
                    <div onClick={(e) => e.stopPropagation()} style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'rgba(0,0,0,0.9)', borderRadius: '16px 16px 0 0',
                        maxHeight: '50vh', display: 'flex', flexDirection: 'column',
                        zIndex: 30,
                    }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontWeight: 600, color: 'white', fontSize: 15 }}>
                            Comments
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', maxHeight: 'calc(50vh - 100px)' }}>
                            {reelComments.length === 0 && (
                                <div style={{ color: C.textSec, textAlign: 'center', padding: 20, fontSize: 14 }}>No comments yet. Be the first!</div>
                            )}
                            {reelComments.map((c, i) => (
                                <div key={c.id || i} style={{ display: 'flex', gap: 10, padding: '8px 0' }}>
                                    <img src={c.profiles?.avatar_url || '/default-avatar.png'} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                                    <div>
                                        <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{c.profiles?.username || 'User'}</span>
                                        <span style={{ color: C.textSec, fontSize: 13, marginLeft: 8 }}>{c.content}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 10 }}>
                            <input
                                ref={commentInputRef}
                                type="text"
                                placeholder="Add a comment..."
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyDown={handleSubmitComment}
                                style={{
                                    flex: 1, background: 'rgba(255,255,255,0.1)', border: 'none',
                                    borderRadius: 20, padding: '10px 16px', color: 'white', fontSize: 14,
                                    outline: 'none',
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Share Toast */}
                {shareToast && (
                    <div style={{
                        position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(255,255,255,0.15)', color: 'white',
                        padding: '8px 20px', borderRadius: 20, fontSize: 14, zIndex: 30,
                        backdropFilter: 'blur(10px)',
                    }}>Link Copied</div>
                )}

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
                    position: 'absolute', top: 20, left: 60,
                    color: C.textSec, fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 4,
                    pointerEvents: 'none',
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
            .maybeSingle();

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
