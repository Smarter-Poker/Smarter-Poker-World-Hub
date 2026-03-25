/**
 * REELS COMPONENT - SmarterPoker-style permanent video archive
 * Videos from Stories are saved here permanently
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { getAuthUser, getAccessToken } from '../../lib/authUtils';
import { busEmit } from '../../engine/EventBus';
import Link from 'next/link';
import GiphyPicker from '../shared/GiphyPicker';

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
    const [showHeart, setShowHeart] = useState(false);
    const [progress, setProgress] = useState(0);
    const [likeCounts, setLikeCounts] = useState({});
    const [commentCounts, setCommentCounts] = useState({});
    const [saved, setSaved] = useState({});
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const commentInputRef = useRef(null);
    const overlayTimerRef = useRef(null);
    const likeDebounceRef = useRef(false);
    const lastTapRef = useRef(0);
    const progressRAF = useRef(null);
    // GIF + Image state for reel comments
    const [showReelGifPicker, setShowReelGifPicker] = useState(false);
    const [reelCommentMediaUrl, setReelCommentMediaUrl] = useState(null);
    const [reelCommentMediaType, setReelCommentMediaType] = useState(null);
    const [uploadingReelImage, setUploadingReelImage] = useState(false);
    const reelFileInputRef = useRef(null);

    useEffect(() => {
        loadReels();
        const user = getAuthUser();
        if (user?.id) {
            setCurrentUserId(user.id);
            supabase.from('social_likes')
                .select('post_id')
                .eq('user_id', user.id)
                .then(({ data }) => {
                    if (data) {
                        const likeMap = {};
                        data.forEach(row => { likeMap[row.post_id] = true; });
                        setLiked(likeMap);
                    }
                });
            supabase.from('social_interactions')
                .select('post_id')
                .eq('user_id', user.id)
                .eq('interaction_type', 'bookmark')
                .then(({ data }) => {
                    if (data) {
                        const saveMap = {};
                        data.forEach(row => { saveMap[row.post_id] = true; });
                        setSaved(saveMap);
                    }
                });
        }
    }, []);

    // Reset paused state when changing reels + track view
    useEffect(() => {
        setPaused(false);
        setShowOverlay(false);
        setProgress(0);
        // Track view count
        if (reels[currentIndex]?.id) {
            supabase.rpc('increment_post_count', { p_post_id: reels[currentIndex].id, p_field: 'view_count' }).catch(() => {});
        }
    }, [currentIndex]);

    // Haptic helper
    const haptic = (ms = 10) => { try { navigator?.vibrate?.(ms); } catch {} };

    // Save/Bookmark handler
    const handleSave = async () => {
        if (!currentReel?.id || !currentUserId) return;
        const wasSaved = saved[currentReel.id];
        setSaved(prev => ({ ...prev, [currentReel.id]: !prev[currentReel.id] }));
        haptic(wasSaved ? 5 : 15);
        try {
            if (wasSaved) {
                await supabase.from('social_interactions').delete()
                    .eq('post_id', currentReel.id)
                    .eq('user_id', currentUserId)
                    .eq('interaction_type', 'bookmark');
            } else {
                await supabase.from('social_interactions').delete()
                    .eq('post_id', currentReel.id)
                    .eq('user_id', currentUserId)
                    .eq('interaction_type', 'bookmark');
                await supabase.from('social_interactions').insert({
                    post_id: currentReel.id, user_id: currentUserId, interaction_type: 'bookmark'
                });
            }
        } catch {
            setSaved(prev => ({ ...prev, [currentReel.id]: wasSaved }));
        }
    };

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

            if (data) {
                setReels(data);
                // Initialize counts from reel data
                const lc = {}, cc = {};
                data.forEach(r => {
                    lc[r.id] = r.like_count || 0;
                    cc[r.id] = r.comment_count || 0;
                });
                setLikeCounts(lc);
                setCommentCounts(cc);
            }
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
        // Debounce: prevent rapid-fire
        if (likeDebounceRef.current) return;
        likeDebounceRef.current = true;
        setTimeout(() => { likeDebounceRef.current = false; }, 300);

        const wasLiked = liked[currentReel.id];
        setLiked(prev => ({ ...prev, [currentReel.id]: !prev[currentReel.id] }));
        setLikeCounts(prev => ({ ...prev, [currentReel.id]: Math.max(0, (prev[currentReel.id] || 0) + (wasLiked ? -1 : 1)) }));

        try {
            if (wasLiked) {
                await supabase.from('social_likes')
                    .delete()
                    .eq('post_id', currentReel.id)
                    .eq('user_id', currentUserId);
                busEmit.socialPostLiked(currentReel.id, currentUserId, { added: false, reactionType: 'like' });
                supabase.rpc('decrement_post_count', { p_post_id: currentReel.id, p_field: 'like_count' }).catch(() => {});
            } else {
                await supabase.from('social_likes')
                    .insert({ post_id: currentReel.id, user_id: currentUserId, reaction_type: 'like' });
                busEmit.socialPostLiked(currentReel.id, currentUserId, { added: true, reactionType: 'like' });
                supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'like_count' }).catch(() => {});
            }
        } catch (err) {
            console.warn('Reel like persistence failed:', err.message);
            setLiked(prev => ({ ...prev, [currentReel.id]: wasLiked }));
            setLikeCounts(prev => ({ ...prev, [currentReel.id]: Math.max(0, (prev[currentReel.id] || 0) + (wasLiked ? 1 : -1)) }));
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
        if (e && e.key !== 'Enter') return;
        if ((!commentText.trim() && !reelCommentMediaUrl) || !currentUserId || !currentReel?.id) return;
        const text = commentText.trim();
        const mediaUrl = reelCommentMediaUrl;
        const mediaType = reelCommentMediaType;
        const tempId = Date.now();
        setCommentText('');
        setReelCommentMediaUrl(null);
        setReelCommentMediaType(null);
        setShowReelGifPicker(false);
        setReelComments(prev => [...prev, {
            id: tempId, content: text,
            profiles: { username: 'You', avatar_url: null },
            created_at: new Date().toISOString(),
            media_url: mediaUrl || null,
            media_type: mediaType || null,
        }]);
        try {
            const payload = { post_id: currentReel.id, author_id: currentUserId, content: text || '' };
            if (mediaUrl) { payload.media_url = mediaUrl; payload.media_type = mediaType; }
            const { error } = await supabase.from('social_comments').insert(payload);
            if (error) throw error;
            busEmit.socialCommentAdded(currentReel.id, currentUserId);
            supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'comment_count' }).catch(() => {});
            setCommentCounts(prev => ({ ...prev, [currentReel.id]: (prev[currentReel.id] || 0) + 1 }));
        } catch {
            // Rollback optimistic comment on failure
            setReelComments(prev => prev.filter(c => c.id !== tempId));
        }
    };

    // Handle image upload for reel comments
    const handleReelImageUpload = async (file) => {
        if (!file || !currentUserId) return;
        setUploadingReelImage(true);
        try {
            let uploadFile = file;
            if (file.size > 500 * 1024 && file.type !== 'image/gif') {
                try {
                    const bitmap = await createImageBitmap(file);
                    const canvas = document.createElement('canvas');
                    const maxDim = 1200;
                    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
                    canvas.width = bitmap.width * scale;
                    canvas.height = bitmap.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82));
                    uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
                } catch { uploadFile = file; }
            }
            const formData = new FormData();
            formData.append('image', uploadFile);
            const token = getAccessToken();
            const resp = await fetch('/api/social/upload-comment-image', {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                body: formData,
            });
            const result = await resp.json();
            if (resp.ok && result.success) {
                setReelCommentMediaUrl(result.url);
                setReelCommentMediaType('image');
            }
        } catch (err) { console.error('[ReelComment] Upload error:', err); }
        setUploadingReelImage(false);
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
        // Increment share_count + EventBus
        supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'share_count' }).catch(() => {});
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
    }, [currentIndex, onClose]);

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
        const now = Date.now();
        const DOUBLE_TAP_WINDOW = 300;
        if (now - lastTapRef.current < DOUBLE_TAP_WINDOW) {
            // Double-tap = like
            if (!liked[currentReel?.id] && currentUserId) {
                handleLike();
                setShowHeart(true);
                setTimeout(() => setShowHeart(false), 800);
            }
            lastTapRef.current = 0;
            return;
        }
        lastTapRef.current = now;
        setTimeout(() => {
            if (lastTapRef.current !== now) return;
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
                if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
                overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2000);
            }
        }, DOUBLE_TAP_WINDOW);
    };

    // Progress bar update loop
    const updateProgress = () => {
        if (videoRef.current && videoRef.current.duration) {
            setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
        }
        progressRAF.current = requestAnimationFrame(updateProgress);
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
                    onPlay={() => { progressRAF.current = requestAnimationFrame(updateProgress); }}
                    onPause={() => { if (progressRAF.current) cancelAnimationFrame(progressRAF.current); }}
                    onEnded={() => {
                        if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
                        setProgress(0);
                        if (currentIndex < reels.length - 1) goNext();
                    }}
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
                    <button onClick={() => { handleLike(); haptic(15); }} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 22 }}>{liked[currentReel?.id] ? '❤️' : '👍'}</span>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>{likeCounts[currentReel?.id] || 0}</span>
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
                        <span style={{ fontSize: 9, fontWeight: 500 }}>{commentCounts[currentReel?.id] || 0}</span>
                    </button>
                    <button onClick={handleSave} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 22 }}>{saved[currentReel?.id] ? '💾' : '🔖'}</span>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>{saved[currentReel?.id] ? 'Saved' : 'Save'}</span>
                    </button>
                    <button onClick={() => { handleShare(); haptic(10); }} style={{
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
                                    <div style={{ flex: 1 }}>
                                        <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{c.profiles?.username || 'User'}</span>
                                        {c.content && <span style={{ color: C.textSec, fontSize: 13, marginLeft: 8 }}>{c.content}</span>}
                                        {c.media_url && (
                                            <img src={c.media_url} alt={c.media_type === 'gif' ? 'GIF' : 'Image'}
                                                style={{ maxWidth: 180, maxHeight: 140, borderRadius: 8, marginTop: 4, display: 'block' }} />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* GIF Picker for reel comments */}
                        {showReelGifPicker && (
                            <div style={{ padding: '0 8px 4px' }}>
                                <GiphyPicker
                                    compact
                                    onSelect={(gifUrl) => {
                                        setReelCommentMediaUrl(gifUrl);
                                        setReelCommentMediaType('gif');
                                        setShowReelGifPicker(false);
                                    }}
                                    onClose={() => setShowReelGifPicker(false)}
                                />
                            </div>
                        )}
                        {/* Media preview */}
                        {reelCommentMediaUrl && (
                            <div style={{ padding: '4px 16px', position: 'relative', display: 'inline-block' }}>
                                <img src={reelCommentMediaUrl} alt="Preview" style={{ maxWidth: 140, maxHeight: 100, borderRadius: 8, display: 'block' }} />
                                <button onClick={() => { setReelCommentMediaUrl(null); setReelCommentMediaType(null); }}
                                    style={{ position: 'absolute', top: 8, right: 20, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >&times;</button>
                            </div>
                        )}
                        {/* Hidden file input */}
                        <input type="file" accept="image/*" ref={reelFileInputRef} style={{ display: 'none' }}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReelImageUpload(f); e.target.value = ''; }} />
                        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 10, alignItems: 'center' }}>
                            <input
                                ref={commentInputRef}
                                type="text"
                                placeholder="Add a comment..."
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyDown={handleSubmitComment}
                                onPaste={(e) => {
                                    const items = e.clipboardData?.items;
                                    if (!items) return;
                                    for (const item of items) {
                                        if (item.type.startsWith('image/')) {
                                            e.preventDefault();
                                            handleReelImageUpload(item.getAsFile());
                                            return;
                                        }
                                    }
                                }}
                                style={{
                                    flex: 1, background: 'rgba(255,255,255,0.1)', border: 'none',
                                    borderRadius: 20, padding: '10px 16px', color: 'white', fontSize: 14,
                                    outline: 'none',
                                }}
                            />
                            <button onClick={() => setShowReelGifPicker(!showReelGifPicker)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: showReelGifPicker ? '#0A84FF' : 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 11 }}
                            >GIF</button>
                            <button onClick={() => reelFileInputRef.current?.click()} disabled={uploadingReelImage}
                                style={{ background: 'none', border: 'none', cursor: uploadingReelImage ? 'wait' : 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 15, opacity: uploadingReelImage ? 0.5 : 1 }}
                            >{uploadingReelImage ? '...' : '📷'}</button>
                            {(commentText.trim() || reelCommentMediaUrl) && (
                                <button onClick={() => handleSubmitComment(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0A84FF', fontWeight: 600, fontSize: 13 }}
                                >Post</button>
                            )}
                        </div>
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

                {/* Double-tap heart burst */}
                {showHeart && (
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: 80, pointerEvents: 'none', zIndex: 25,
                        animation: 'heartBurstReels 0.8s ease-out forwards',
                    }}>❤️</div>
                )}

                {/* Progress bar for native videos */}
                {progress > 0 && (
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: 3, background: 'rgba(255,255,255,0.2)', zIndex: 25,
                    }}>
                        <div style={{
                            width: `${progress}%`, height: '100%',
                            background: 'linear-gradient(90deg, #FF2D55, #FF6B6B)',
                            transition: 'width 0.1s linear',
                        }} />
                    </div>
                )}

                {/* Heart burst animation CSS */}
                <style jsx>{`
                    @keyframes heartBurstReels {
                        0% { opacity: 1; transform: translate(-50%, -50%) scale(0.3); }
                        50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                        100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
                    }
                `}</style>

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
