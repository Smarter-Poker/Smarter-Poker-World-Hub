/**
 * REELS FEED CAROUSEL - SmarterPoker-style inline Reels in the feed
 * Horizontal scrollable carousel that appears between posts
 * Swipe right to see more reels
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useSupabase } from '../../providers/SupabaseProvider';
import { busEmit, eventBus, EventType } from '../../engine/EventBus';
import { getAccessToken, getAuthUser } from '../../lib/authUtils';
import Link from 'next/link';
import GiphyPicker from '../shared/GiphyPicker';

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
    const [muted, setMuted] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('reel-muted') !== 'false';
        }
        return false;
    });
    const [liked, setLiked] = useState({});
    const [disliked, setDisliked] = useState({});
    const [following, setFollowing] = useState({});
    const [showComments, setShowComments] = useState(false);
    const [reelComments, setReelComments] = useState([]);
    const [commentText, setCommentText] = useState('');
    const [showOverlay, setShowOverlay] = useState(false);
    const [shareToast, setShareToast] = useState(false);
    const [showHeart, setShowHeart] = useState(false);
    const [progress, setProgress] = useState(0);
    const [likeCounts, setLikeCounts] = useState({});
    const [commentCounts, setCommentCounts] = useState({});
    const [saved, setSaved] = useState({});
    const [slideDir, setSlideDir] = useState(null);
    const [captionExpanded, setCaptionExpanded] = useState(false);
    const [showShortcutsOverlay, setShowShortcutsOverlay] = useState(false);
    // #8 Share Options Modal
    const [showShareModal, setShowShareModal] = useState(false);
    // #7 Animated Like Counter
    const [likeBounceId, setLikeBounceId] = useState(null);
    // #4 Not Interested — persist disliked reel IDs in localStorage
    const [notInterestedIds, setNotInterestedIds] = useState(() => {
        if (typeof window !== 'undefined') {
            try { return new Set(JSON.parse(localStorage.getItem('reels-not-interested') || '[]')); } catch { return new Set(); }
        }
        return new Set();
    });
    // #6 Comment Pagination
    const [commentPage, setCommentPage] = useState(0);
    const [hasMoreComments, setHasMoreComments] = useState(false);
    const [loadingMoreComments, setLoadingMoreComments] = useState(false);
    // Phase 6 — Comment engagement
    const [commentLikes, setCommentLikes] = useState({});
    const [replyTo, setReplyTo] = useState(null);
    // Phase 7 — Power features
    const [editingComment, setEditingComment] = useState(null);
    const [editCommentText, setEditCommentText] = useState('');
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    // Phase 8 — Comment sort, char counter, copy link
    const [commentSort, setCommentSort] = useState('newest');
    const [copyToast, setCopyToast] = useState(false);
    const COMMENT_MAX_LENGTH = 280;
    // GIF + Image state for reel comments
    const [showReelGifPicker, setShowReelGifPicker] = useState(false);
    const [reelCommentMediaUrl, setReelCommentMediaUrl] = useState(null);
    const [reelCommentMediaType, setReelCommentMediaType] = useState(null);
    const [uploadingReelImage, setUploadingReelImage] = useState(false);
    const commentInputRef = useRef(null);
    const viewedReelsRef = useRef(new Set());
    const reelFileInputRef = useRef(null);
    const videoRef = useRef(null);
    // Report state
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [reportSubmitted, setReportSubmitted] = useState(false);
    const containerRef = useRef(null);
    const overlayTimerRef = useRef(null);
    const touchStartRef = useRef({ x: 0, y: 0 });
    const likeDebounceRef = useRef(false);
    const lastTapRef = useRef(0);
    const progressRAF = useRef(null);
    const handleLikeRef = useRef(null);
    const handleSaveRef = useRef(null);
    const handleCommentsRef = useRef(null);

    const currentReel = reels[currentIndex];

    // Pre-fetch existing likes + bookmarks + dislikes + follows on mount
    useEffect(() => {
        if (!authUser?.id) return;
        // Load likes (filter by reaction_type='like')
        supabase.from('social_likes')
            .select('post_id')
            .eq('user_id', authUser.id)
            .eq('reaction_type', 'like')
            .then(({ data }) => {
                if (data) {
                    const likeMap = {};
                    data.forEach(row => { likeMap[row.post_id] = true; });
                    setLiked(likeMap);
                }
            });
        // Load dislikes
        supabase.from('social_likes')
            .select('post_id')
            .eq('user_id', authUser.id)
            .eq('reaction_type', 'dislike')
            .then(({ data }) => {
                if (data) {
                    const dislikeMap = {};
                    data.forEach(row => { dislikeMap[row.post_id] = true; });
                    setDisliked(dislikeMap);
                }
            });
        // Load bookmarks
        supabase.from('social_interactions')
            .select('post_id')
            .eq('user_id', authUser.id)
            .eq('interaction_type', 'bookmark')
            .then(({ data }) => {
                if (data) {
                    const saveMap = {};
                    data.forEach(row => { saveMap[row.post_id] = true; });
                    setSaved(saveMap);
                }
            });
        // Load follows
        supabase.from('social_follows')
            .select('following_id')
            .eq('follower_id', authUser.id)
            .then(({ data }) => {
                if (data) {
                    const followMap = {};
                    data.forEach(row => { followMap[row.following_id] = true; });
                    setFollowing(followMap);
                }
            });
    }, [authUser?.id]);

    // EventBus listeners — sync like/bookmark from other viewers
    useEffect(() => {
        const handleLikeBus = (event) => {
            const d = event?.payload;
            if (d?.postId) {
                // Only update count for OTHER users to avoid conflicting with optimistic update
                if (d.userId !== authUser?.id) {
                    setLikeCounts(prev => ({
                        ...prev,
                        [d.postId]: Math.max(0, (prev[d.postId] || 0) + (d.added ? 1 : -1))
                    }));
                }
            }
        };
        const handleBookmarkBus = (event) => {
            const d = event?.payload;
            if (d?.postId) setSaved(prev => ({ ...prev, [d.postId]: d.added }));
        };
        const handleCommentBus = (event) => {
            const d = event?.payload;
            if (d?.postId) {
                setCommentCounts(prev => ({
                    ...prev,
                    [d.postId]: Math.max(0, (prev[d.postId] || 0) + (d.removed ? -1 : 1))
                }));
            }
        };
        const handleFollowBus = (event) => {
            const d = event?.payload;
            if (d?.followedId && d?.followerId !== authUser?.id) {
                setFollowing(prev => ({ ...prev, [d.followedId]: d.added }));
            }
        };
        eventBus.on(EventType.SOCIAL_POST_LIKED, handleLikeBus);
        eventBus.on(EventType.SOCIAL_POST_BOOKMARKED, handleBookmarkBus);
        eventBus.on(EventType.SOCIAL_COMMENT_ADDED, handleCommentBus);
        eventBus.on(EventType.SOCIAL_FOLLOW_CHANGED, handleFollowBus);
        return () => {
            eventBus.off(EventType.SOCIAL_POST_LIKED, handleLikeBus);
            eventBus.off(EventType.SOCIAL_POST_BOOKMARKED, handleBookmarkBus);
            eventBus.off(EventType.SOCIAL_COMMENT_ADDED, handleCommentBus);
            eventBus.off(EventType.SOCIAL_FOLLOW_CHANGED, handleFollowBus);
        };
    }, [authUser?.id]);

    // Initialize counts from reel data
    useEffect(() => {
        const lc = {}, cc = {};
        reels.forEach(r => {
            lc[r.id] = r.like_count || 0;
            cc[r.id] = r.comment_count || 0;
        });
        setLikeCounts(lc);
        setCommentCounts(cc);
    }, [reels]);

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
            overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
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
                try { navigator?.vibrate?.(10); } catch {}
                if (dy < 0) goNext();  // Swipe up = next
                else goPrev();         // Swipe down = prev
            }
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                try { navigator?.vibrate?.(10); } catch {}
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
        if (likeDebounceRef.current) return;
        likeDebounceRef.current = true;
        setTimeout(() => { likeDebounceRef.current = false; }, 300);

        const currentId = currentReel.id;
        const userId = authUser.id;
        const wasLiked = liked[currentId];
        setLiked(prev => ({ ...prev, [currentId]: !prev[currentId] }));
        setLikeCounts(prev => ({ ...prev, [currentId]: Math.max(0, (prev[currentId] || 0) + (wasLiked ? -1 : 1)) }));
        // #7 Animated Like Counter — trigger bounce
        setLikeBounceId(currentId);
        setTimeout(() => setLikeBounceId(null), 400);
        // Mutual exclusion: remove dislike when liking
        if (!wasLiked && disliked[currentId]) {
            setDisliked(prev => ({ ...prev, [currentId]: false }));
            try { await supabase.from('social_likes').delete().eq('post_id', currentId).eq('user_id', userId).eq('reaction_type', 'dislike'); } catch {}
        }

        try {
            if (wasLiked) {
                await supabase.from('social_likes').delete().eq('post_id', currentId).eq('user_id', userId).eq('reaction_type', 'like');
                busEmit.socialPostLiked(currentId, userId, { added: false, reactionType: 'like' });
                try { await supabase.rpc('decrement_post_count', { p_post_id: currentId, p_field: 'like_count' }); } catch {}
            } else {
                await supabase.from('social_likes').insert({ post_id: currentId, user_id: userId, reaction_type: 'like' });
                busEmit.socialPostLiked(currentId, userId, { added: true, reactionType: 'like' });
                try { await supabase.rpc('increment_post_count', { p_post_id: currentId, p_field: 'like_count' }); } catch {}
            }
        } catch (err) {
            console.warn('Reel like persistence failed:', err.message);
            setLiked(prev => ({ ...prev, [currentId]: wasLiked }));
            setLikeCounts(prev => ({ ...prev, [currentId]: Math.max(0, (prev[currentId] || 0) + (wasLiked ? 1 : -1)) }));
        }
    };

    const handleDislike = async () => {
        if (!currentReel || !authUser?.id) return;
        if (likeDebounceRef.current) return;
        likeDebounceRef.current = true;
        setTimeout(() => { likeDebounceRef.current = false; }, 300);

        const currentId = currentReel.id;
        const userId = authUser.id;
        const wasDisliked = disliked[currentId];
        setDisliked(prev => ({ ...prev, [currentId]: !prev[currentId] }));
        // Mutual exclusion: remove like when disliking
        if (!wasDisliked && liked[currentId]) {
            setLiked(prev => ({ ...prev, [currentId]: false }));
            setLikeCounts(prev => ({ ...prev, [currentId]: Math.max(0, (prev[currentId] || 0) - 1) }));
            try {
                await supabase.from('social_likes').delete().eq('post_id', currentId).eq('user_id', userId).eq('reaction_type', 'like');
                try { await supabase.rpc('decrement_post_count', { p_post_id: currentId, p_field: 'like_count' }); } catch {}
            } catch {}
        }

        try {
            if (wasDisliked) {
                await supabase.from('social_likes').delete().eq('post_id', currentId).eq('user_id', userId).eq('reaction_type', 'dislike');
                // #4 Not Interested — remove from filter
                setNotInterestedIds(prev => { const n = new Set(prev); n.delete(currentId); if (typeof window !== 'undefined') localStorage.setItem('reels-not-interested', JSON.stringify([...n])); return n; });
            } else {
                await supabase.from('social_likes').insert({ post_id: currentId, user_id: userId, reaction_type: 'dislike' });
                // #4 Not Interested — add to filter
                setNotInterestedIds(prev => { const n = new Set(prev); n.add(currentId); if (typeof window !== 'undefined') localStorage.setItem('reels-not-interested', JSON.stringify([...n])); return n; });
            }
        } catch {
            setDisliked(prev => ({ ...prev, [currentId]: wasDisliked }));
        }
    };

    // Toggle comment drawer and load comments
    const handleToggleComments = async () => {
        const opening = !showComments;
        setShowComments(opening);
        // Always fetch fresh comments when opening
        if (opening && currentReel?.id) {
            setCommentPage(0);
            try {
                const { data } = await supabase
                    .from('social_comments')
                    .select('*, profiles:author_id (username, avatar_url)')
                    .eq('post_id', currentReel.id)
                    .order('created_at', { ascending: commentSort === 'oldest' })
                    .limit(50);
                setReelComments(data || []);
                setHasMoreComments((data || []).length >= 50);
            } catch { setReelComments([]); }
            setTimeout(() => commentInputRef.current?.focus(), 100);
        }
    };

    // #6 Comment Pagination — Load More
    const loadMoreComments = async () => {
        if (!currentReel?.id || loadingMoreComments || !hasMoreComments) return;
        setLoadingMoreComments(true);
        const nextPage = commentPage + 1;
        try {
            const { data } = await supabase
                .from('social_comments')
                .select('*, profiles:author_id (username, avatar_url)')
                .eq('post_id', currentReel.id)
                .order('created_at', { ascending: commentSort === 'oldest' })
                .range(nextPage * 50, (nextPage + 1) * 50 - 1);
            if (data && data.length > 0) {
                setReelComments(prev => [...prev, ...data]);
                setCommentPage(nextPage);
                setHasMoreComments(data.length >= 50);
            } else {
                setHasMoreComments(false);
            }
        } catch { setHasMoreComments(false); }
        setLoadingMoreComments(false);
    };

    // Submit comment (supports text + GIF/image media)
    const handleSubmitComment = async (e) => {
        if (e && e.key !== 'Enter') return;
        if ((!commentText.trim() && !reelCommentMediaUrl) || !authUser?.id || !currentReel?.id) return;
        const text = commentText.trim();
        const mediaUrl = reelCommentMediaUrl;
        const mediaType = reelCommentMediaType;
        const tempId = Date.now();
        const parentId = replyTo?.id || null;
        setCommentText('');
        setReelCommentMediaUrl(null);
        setReelCommentMediaType(null);
        setShowReelGifPicker(false);
        setReplyTo(null);
        setReelComments(prev => [...prev, {
            id: tempId, content: text,
            profiles: { username: 'You', avatar_url: null },
            created_at: new Date().toISOString(),
            media_url: mediaUrl || null,
            media_type: mediaType || null,
            parent_id: parentId,
        }]);
        try {
            const payload = { post_id: currentReel.id, author_id: authUser.id, content: text || '' };
            if (mediaUrl) { payload.media_url = mediaUrl; payload.media_type = mediaType; }
            if (parentId) { payload.parent_id = parentId; }
            const { error } = await supabase.from('social_comments').insert(payload);
            if (error) throw error;
            busEmit.socialCommentAdded(currentReel.id, authUser.id);
            try { await supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'comment_count' }); } catch {}
            setCommentCounts(prev => ({ ...prev, [currentReel.id]: (prev[currentReel.id] || 0) + 1 }));
        } catch {
            setReelComments(prev => prev.filter(c => c.id !== tempId));
        }
    };

    // Phase 6 — Comment like toggle
    const handleCommentLike = async (commentId) => {
        if (!authUser?.id) return;
        const wasLiked = commentLikes[commentId];
        setCommentLikes(prev => ({ ...prev, [commentId]: !wasLiked }));
        try {
            if (wasLiked) {
                await supabase.from('social_interactions')
                    .delete().match({ user_id: authUser.id, post_id: currentReel.id, interaction_type: 'comment_like', metadata: { comment_id: commentId } });
            } else {
                await supabase.from('social_interactions').insert({
                    user_id: authUser.id, post_id: currentReel.id,
                    interaction_type: 'comment_like', metadata: { comment_id: commentId }
                });
            }
        } catch { setCommentLikes(prev => ({ ...prev, [commentId]: wasLiked })); }
    };

    // Phase 6 — Delete own comment
    const handleDeleteComment = async (commentId) => {
        if (!authUser?.id || !currentReel?.id) return;
        const prev = reelComments;
        setReelComments(c => c.filter(x => x.id !== commentId));
        try {
            const { error } = await supabase.from('social_comments').delete()
                .eq('id', commentId).eq('author_id', authUser.id);
            if (error) throw error;
            try { await supabase.rpc('decrement_post_count', { p_post_id: currentReel.id, p_field: 'comment_count' }); } catch {}
            setCommentCounts(p => ({ ...p, [currentReel.id]: Math.max(0, (p[currentReel.id] || 1) - 1) }));
        } catch { setReelComments(prev); }
    };

    // Phase 7 — Edit own comment
    const handleEditComment = (comment) => {
        setEditingComment(comment.id);
        setEditCommentText(comment.content || '');
    };
    const handleSaveEdit = async (commentId) => {
        if (!editCommentText.trim() || !authUser?.id) return;
        const orig = reelComments.find(c => c.id === commentId);
        setReelComments(prev => prev.map(c => c.id === commentId ? { ...c, content: editCommentText.trim() } : c));
        setEditingComment(null);
        try {
            const { error } = await supabase.from('social_comments')
                .update({ content: editCommentText.trim() }).eq('id', commentId).eq('author_id', authUser.id);
            if (error) throw error;
        } catch {
            if (orig) setReelComments(prev => prev.map(c => c.id === commentId ? orig : c));
        }
        setEditCommentText('');
    };

    // Phase 7 — Playback speed toggle
    const handleSpeedToggle = () => {
        const speeds = [1, 1.25, 1.5, 2, 0.5, 0.75];
        const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
        const newSpeed = speeds[nextIdx];
        setPlaybackSpeed(newSpeed);
        const video = document.querySelector('video');
        if (video) video.playbackRate = newSpeed;
        const iframe = document.querySelector('iframe[src*="youtube"]');
        if (iframe) {
            iframe.contentWindow?.postMessage(JSON.stringify({
                event: 'command', func: 'setPlaybackRate', args: [newSpeed]
            }), '*');
        }
    };

    // Handle image upload for reel comments
    const handleReelImageUpload = async (file) => {
        if (!file || !authUser?.id) return;
        setUploadingReelImage(true);
        try {
            const formData = new FormData();
            // Client-side compression if large
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
    // #8 Share Options Modal handler
    const handleShare = () => {
        if (!currentReel?.id) return;
        haptic(10);
        setShowShareModal(true);
    };

    const shareReelUrl = currentReel ? `${window.location.origin}/hub/social-media?reel=${currentReel.id}` : '';

    const handleShareAction = async (platform) => {
        setShowShareModal(false);
        const url = shareReelUrl;
        const title = 'Check out this poker reel on Smarter.Poker';
        try {
            if (platform === 'copy') {
                await navigator.clipboard.writeText(url);
                setShareToast(true);
                setTimeout(() => setShareToast(false), 2000);
            } else if (platform === 'native' && navigator.share) {
                await navigator.share({ title, url });
            } else if (platform === 'x') {
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, '_blank');
            } else if (platform === 'facebook') {
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
            } else if (platform === 'whatsapp') {
                window.open(`https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`, '_blank');
            }
            (async () => { try { await supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'share_count' }); } catch {} })();
            if (authUser?.id) busEmit.socialPostShared(currentReel.id, authUser.id);
        } catch {
            setShareToast(true);
            setTimeout(() => setShareToast(false), 2000);
        }
    };

    // Share to My Feed — creates a social_posts entry linking this reel
    const [sharingToFeed, setSharingToFeed] = useState(false);
    const [sharedToFeed, setSharedToFeed] = useState(false);
    const handleShareToFeed = async () => {
        if (!currentReel?.id || !authUser?.id || sharingToFeed) return;
        setSharingToFeed(true);
        try {
            const videoUrl = currentReel.video_url;
            const caption = currentReel.caption || 'Check out this reel!';
            const reelLink = window.location.origin + '/hub/reels?id=' + currentReel.id;
            const postContent = caption + '\n\n' + reelLink;
            const { error } = await supabase.from('social_posts').insert({
                author_id: authUser.id,
                content: postContent,
                content_type: videoUrl ? 'video' : 'text',
                media_urls: videoUrl ? [videoUrl] : [],
                visibility: 'public',
                link_url: reelLink,
            });
            if (error) throw error;
            try { await supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'share_count' }); } catch {}
            busEmit.socialPostShared(currentReel.id, authUser.id);
            busEmit.dataMutated('social');
            setSharedToFeed(true);
            setTimeout(() => { setShowShareModal(false); setSharedToFeed(false); }, 1500);
        } catch (err) {
            console.warn('Share to feed failed:', err.message);
        }
        setSharingToFeed(false);
    };

    const handleReport = async () => {
        if (!currentReel?.id || !reportReason.trim()) return;
        const authUserLocal = getAuthUser();
        if (!authUserLocal?.id) return;
        try {
            await supabase.from('social_interactions').insert({
                user_id: authUserLocal.id, post_id: currentReel.id,
                interaction_type: 'report', metadata: { reason: reportReason.trim() }
            });
            setReportSubmitted(true);
            setTimeout(() => { setShowReportModal(false); setReportSubmitted(false); setReportReason(''); }, 2000);
        } catch { /* silent */ }
    };

    // YouTube auto-advance: listen for onStateChange postMessage (state 0 = ended)
    useEffect(() => {
        const handleYTMessage = (event) => {
            try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (data?.event === 'onStateChange' && data?.info === 0) {
                    // Video ended — auto-advance
                    if (currentIndex < reels.length - 1) goNext();
                }
            } catch { /* not a YouTube message */ }
        };
        window.addEventListener('message', handleYTMessage);
        return () => window.removeEventListener('message', handleYTMessage);
    }, [currentIndex, reels.length]);

    const handleFollow = async () => {
        const authorId = currentReel?.author_id || currentReel?.profiles?.id;
        if (!authorId || !authUser?.id || authorId === authUser.id) return;
        const wasFollowing = following[authorId];
        setFollowing(prev => ({ ...prev, [authorId]: !prev[authorId] }));
        haptic(wasFollowing ? 5 : 15);
        try {
            if (wasFollowing) {
                await supabase.from('social_follows').delete().eq('follower_id', authUser.id).eq('following_id', authorId);
            } else {
                await supabase.from('social_follows').insert({ follower_id: authUser.id, following_id: authorId });
            }
            busEmit.socialFollowChanged && busEmit.socialFollowChanged(authorId, authUser.id, { added: !wasFollowing });
        } catch {
            setFollowing(prev => ({ ...prev, [authorId]: wasFollowing }));
        }
    };

    // Reset on reel change + track view
    useEffect(() => {
        setShowComments(false);
        setReelComments([]);
        setCommentText('');
        setShowOverlay(false);
        setProgress(0);
        setCaptionExpanded(false);
        setShowReelGifPicker(false);
        setReelCommentMediaUrl(null);
        setReelCommentMediaType(null);
        setShowReportModal(false);
        setReportReason('');
        setReportSubmitted(false);
        setShareToast(false);
        setShowShareModal(false);
        // Deduplicated view count — only fire once per reel per session (auth only)
        const reelId = reels[currentIndex]?.id;
        if (reelId && authUser?.id && !viewedReelsRef.current.has(reelId)) {
            viewedReelsRef.current.add(reelId);
            (async () => { try { await supabase.rpc('increment_post_count', { p_post_id: reelId, p_field: 'view_count' }); } catch {} })();
        }
    }, [currentIndex]);

    // Haptic helper
    const haptic = (ms = 10) => { try { navigator?.vibrate?.(ms); } catch {} };

    // Save/Bookmark handler
    const handleSave = async () => {
        if (!currentReel?.id || !authUser?.id) return;
        const wasSaved = saved[currentReel.id];
        setSaved(prev => ({ ...prev, [currentReel.id]: !prev[currentReel.id] }));
        haptic(wasSaved ? 5 : 15);
        try {
            if (wasSaved) {
                await supabase.from('social_interactions').delete()
                    .eq('post_id', currentReel.id)
                    .eq('user_id', authUser.id)
                    .eq('interaction_type', 'bookmark');
            } else {
                await supabase.from('social_interactions').delete()
                    .eq('post_id', currentReel.id)
                    .eq('user_id', authUser.id)
                    .eq('interaction_type', 'bookmark');
                await supabase.from('social_interactions').insert({
                    post_id: currentReel.id, user_id: authUser.id, interaction_type: 'bookmark'
                });
            }
            busEmit.socialPostBookmarked(currentReel.id, authUser.id, { added: !wasSaved });
        } catch {
            setSaved(prev => ({ ...prev, [currentReel.id]: wasSaved }));
        }
    };

    // Keep handler refs fresh for keyboard shortcuts
    const handleDislikeRef = useRef(null);
    handleLikeRef.current = handleLike;
    handleDislikeRef.current = handleDislike;
    handleSaveRef.current = handleSave;
    handleCommentsRef.current = handleToggleComments;

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e) => {
            // Don't intercept keyboard while typing in an input/textarea
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { setSlideDir('up'); goNext(); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { setSlideDir('down'); goPrev(); }
            if (e.key === 'Escape') { if (showComments) setShowComments(false); else onClose(); }
            if (e.key === 'm' || e.key === 'M') {
                setMuted(prev => {
                    const next = !prev;
                    // Send YouTube command via postMessage
                    const iframe = containerRef.current?.querySelector('iframe');
                    if (iframe?.contentWindow) {
                        iframe.contentWindow.postMessage(JSON.stringify({
                            event: 'command',
                            func: next ? 'mute' : 'unMute',
                            args: []
                        }), '*');
                        if (!next) {
                            iframe.contentWindow.postMessage(JSON.stringify({
                                event: 'command',
                                func: 'setVolume',
                                args: [100]
                            }), '*');
                        }
                    }
                    localStorage.setItem('reel-muted', String(next));
                    return next;
                });
            }
            if (e.key === 'l' || e.key === 'L') { handleLikeRef.current?.(); haptic(15); }
            if (e.key === 'd' || e.key === 'D') { handleDislikeRef.current?.(); haptic(10); }
            if (e.key === 's' || e.key === 'S') handleSaveRef.current?.();
            if (e.key === 'c' || e.key === 'C') handleCommentsRef.current?.();
            if (e.key === '?') setShowShortcutsOverlay(prev => !prev);
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [currentIndex, onClose, showComments]);

    if (!currentReel) return null;

    // Double-tap to like + single-tap overlay
    const handleTap = () => {
        const now = Date.now();
        const DOUBLE_TAP_WINDOW = 300;
        if (now - lastTapRef.current < DOUBLE_TAP_WINDOW) {
            // Double-tap = like (TikTok behavior: always show heart, only toggle if not liked)
            setShowHeart(true);
            setTimeout(() => setShowHeart(false), 800);
            haptic(15);
            if (!liked[currentReel.id] && authUser?.id) {
                handleLike();
            }
            lastTapRef.current = 0;
            return;
        }
        lastTapRef.current = now;
        // Single tap (after 300ms delay fails to double-tap)
        setTimeout(() => {
            if (lastTapRef.current !== now) return; // was overridden by double-tap
            if (!showOverlay) {
                setShowOverlay(true);
            } else {
                if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
                overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2000);
            }
        }, DOUBLE_TAP_WINDOW);
    };

    // Progress bar update loop for native videos
    const updateProgress = () => {
        if (videoRef.current && videoRef.current.duration) {
            setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
        }
        progressRAF.current = requestAnimationFrame(updateProgress);
    };

    // Cleanup RAF on unmount to prevent memory leak
    useEffect(() => {
        return () => { if (progressRAF.current) cancelAnimationFrame(progressRAF.current); };
    }, []);

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

            {/* Reel position counter */}
            <div style={{
                position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)',
                color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500,
                zIndex: 10, pointerEvents: 'none',
            }}>{currentIndex + 1} / {reels.length}</div>

            {/* Reel container - FULLSCREEN TikTok-style */}
            <div style={{
                width: '100vw', height: '100vh',
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: '#000',
            }}>
                {isYouTubeUrl(currentReel.video_url) ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}>
                        <iframe
                            key={currentReel.id}
                            src={`https://www.youtube-nocookie.com/embed/${getYouTubeVideoId(currentReel.video_url)}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1&controls=0&showinfo=0&iv_load_policy=3&fs=0&disablekb=1&cc_load_policy=0&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                            style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            onLoad={(e) => {
                                // Force play via YouTube postMessage API
                                try {
                                    e.target.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
                                    // Listen for stateChange events (for auto-advance)
                                    e.target.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
                                    setTimeout(() => {
                                        e.target.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
                                    }, 500);
                                } catch {}
                            }}
                        />
                    </div>
                ) : (
                    <video
                        ref={videoRef}
                        key={currentReel.id}
                        src={currentReel.video_url}
                        autoPlay
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
                )}

                {/* Preload next video — hidden iframe for YouTube, link preload for native */}
                {reels[currentIndex + 1]?.video_url && (() => {
                    const nextUrl = reels[currentIndex + 1].video_url;
                    if (isYouTubeUrl(nextUrl)) {
                        const nextVid = getYouTubeVideoId(nextUrl);
                        return nextVid ? (
                            <>
                                <img src={`https://img.youtube.com/vi/${nextVid}/hqdefault.jpg`} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} alt="" />
                                <iframe
                                    src={`https://www.youtube-nocookie.com/embed/${nextVid}?autoplay=0&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`}
                                    title="Preload"
                                    style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
                                    tabIndex={-1}
                                    aria-hidden="true"
                                />
                            </>
                        ) : null;
                    } else {
                        return <link rel="preload" href={nextUrl} as="video" />;
                    }
                })()}

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
                    {/* Follow button — only for other users' reels */}
                    {currentReel.author_id && authUser?.id && currentReel.author_id !== authUser.id && (
                        <button onClick={(e) => { e.stopPropagation(); handleFollow(); }} style={{
                            pointerEvents: 'auto', padding: '4px 14px', borderRadius: 6,
                            fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            background: following[currentReel.author_id] ? 'transparent' : '#1877F2',
                            color: 'white',
                            border: following[currentReel.author_id] ? '1px solid rgba(255,255,255,0.5)' : 'none',
                            marginBottom: 8,
                        }}>
                            {following[currentReel.author_id] ? 'Following' : 'Follow'}
                        </button>
                    )}
                    {currentReel.caption && (() => {
                        const MAX_LEN = 100;
                        const isLong = currentReel.caption.length > MAX_LEN;
                        return (
                            <p style={{ color: 'white', fontSize: 14, margin: 0, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                                {captionExpanded || !isLong ? currentReel.caption : `${currentReel.caption.slice(0, MAX_LEN)}...`}
                                {isLong && (
                                    <span
                                        onClick={(e) => { e.stopPropagation(); setCaptionExpanded(!captionExpanded); }}
                                        style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer', marginLeft: 4, fontSize: 13 }}
                                    >{captionExpanded ? ' Less' : ' See More'}</span>
                                )}
                            </p>
                        );
                    })()}
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
                    <button onClick={() => { handleLike(); haptic(15); }} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 24 }}>{liked[currentReel.id] ? '\u2764\uFE0F' : '\uD83D\uDC4D'}</span>
                        <span style={{
                            fontSize: 10, fontWeight: 500,
                            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            transform: likeBounceId === currentReel.id ? 'scale(1.5)' : 'scale(1)',
                            display: 'inline-block',
                        }}>{likeCounts[currentReel.id] || 0}</span>
                    </button>
                    <button onClick={() => { handleDislike(); haptic(10); }} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: disliked[currentReel.id] ? '#ef4444' : 'white',
                    }}>
                        <span style={{ fontSize: 24 }}>{disliked[currentReel.id] ? '👎🏻' : '👎'}</span>
                        <span style={{ fontSize: 10, fontWeight: 500 }}>{disliked[currentReel.id] ? 'Disliked' : 'Dislike'}</span>
                    </button>
                    <button onClick={handleToggleComments} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 24 }}>💬</span>
                        <span style={{ fontSize: 10, fontWeight: 500 }}>{commentCounts[currentReel.id] || 0}</span>
                    </button>
                    <button onClick={handleSave} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 24 }}>{saved[currentReel.id] ? '💾' : '🔖'}</span>
                        <span style={{ fontSize: 10, fontWeight: 500 }}>{saved[currentReel.id] ? 'Saved' : 'Save'}</span>
                    </button>
                    <button onClick={() => { handleShare(); haptic(10); }} style={{
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
                        <span style={{ fontSize: 24 }}>{muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}</span>
                        {/* #10 Sound Waveform Indicator */}
                        {!muted && (
                            <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', height: 10, marginBottom: -2 }}>
                                {[3, 5, 8, 5, 3].map((h, i) => (
                                    <div key={i} style={{
                                        width: 2.5, background: '#00d4ff', borderRadius: 1,
                                        animation: `soundWave 0.6s ${i * 0.1}s ease-in-out infinite alternate`,
                                        height: h,
                                    }} />
                                ))}
                            </div>
                        )}
                        {muted && <span style={{ fontSize: 10, fontWeight: 500 }}>Unmute</span>}
                    </button>
                    <button onClick={() => setShowReportModal(true)} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'rgba(255,255,255,0.6)',
                    }}>
                        <span style={{ fontSize: 18 }}>🚩</span>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>Report</span>
                    </button>

                    {/* Phase 7 — Speed Control */}
                    <button onClick={handleSpeedToggle} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        color: playbackSpeed !== 1 ? '#00d4ff' : 'rgba(255,255,255,0.6)',
                    }}>
                        <div style={{
                            width: 26, height: 26, borderRadius: '50%',
                            background: playbackSpeed !== 1 ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.1)',
                            border: playbackSpeed !== 1 ? '1px solid rgba(0,212,255,0.4)' : '1px solid rgba(255,255,255,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700,
                        }}>{playbackSpeed}x</div>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>Speed</span>
                    </button>

                    {/* Phase 8 — Copy Reel Link */}
                    <button onClick={() => {
                        const url = `${window.location.origin}/hub/reels?id=${currentReel?.id || ''}`;
                        navigator.clipboard.writeText(url).then(() => {
                            setCopyToast(true);
                            setTimeout(() => setCopyToast(false), 2000);
                        }).catch(() => {});
                    }} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        color: 'rgba(255,255,255,0.6)',
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>Link</span>
                    </button>
                </div>

                {/* Double-tap heart burst */}
                {showHeart && (
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: 80, pointerEvents: 'none', zIndex: 25,
                        animation: 'heartBurst 0.8s ease-out forwards',
                    }}>❤️</div>
                )}

                {/* Progress bar for native videos */}
                {!isYouTubeUrl(currentReel.video_url) && progress > 0 && (
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

                {/* Share Toast */}
                {shareToast && (
                    <div style={{
                        position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(255,255,255,0.15)', color: 'white',
                        padding: '8px 20px', borderRadius: 20, fontSize: 14, zIndex: 30,
                        backdropFilter: 'blur(10px)',
                    }}>Link Copied</div>
                )}

                {/* Keyboard Shortcuts Overlay */}
                {showShortcutsOverlay && (
                    <div onClick={() => setShowShortcutsOverlay(false)} style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 260,
                    }}>
                        <div onClick={e => e.stopPropagation()} style={{
                            background: '#1a1a2e', borderRadius: 16, padding: '20px 24px',
                            border: '1px solid rgba(255,255,255,0.15)', maxWidth: 320, width: '90%',
                        }}>
                            <div style={{ color: 'white', fontWeight: 700, fontSize: 16, marginBottom: 16, textAlign: 'center' }}>Keyboard Shortcuts</div>
                            {[
                                ['↑ / ↓', 'Previous / Next Reel'],
                                ['← / →', 'Previous / Next Reel'],
                                ['L', 'Like'],
                                ['D', 'Dislike'],
                                ['S', 'Save / Bookmark'],
                                ['C', 'Comments'],
                                ['M', 'Mute / Unmute'],
                                ['Esc', 'Close Viewer'],
                                ['?', 'Toggle This Menu'],
                            ].map(([key, desc]) => (
                                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <span style={{ color: '#00d4ff', fontWeight: 600, fontSize: 13, fontFamily: 'monospace', background: 'rgba(0,212,255,0.1)', padding: '2px 8px', borderRadius: 6 }}>{key}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{desc}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* #8 Share Options Modal */}
                {showShareModal && (
                    <div onClick={() => setShowShareModal(false)} style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 40,
                    }}>
                        <div onClick={e => e.stopPropagation()} style={{
                            background: '#1a1a2e', borderRadius: '16px 16px 0 0', padding: '16px 20px 24px',
                            width: '100%', maxWidth: 400, border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                            <div style={{ textAlign: 'center', marginBottom: 4 }}>
                                <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, margin: '0 auto 12px' }} />
                                <div style={{ color: 'white', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Share This Reel</div>
                            </div>
                            {/* PRIMARY: Share to My Feed */}
                            <button onClick={handleShareToFeed} disabled={sharingToFeed || sharedToFeed} style={{
                                width: '100%', padding: '14px', borderRadius: 12, marginBottom: 14,
                                background: sharedToFeed ? 'linear-gradient(135deg, #00c853, #69f0ae)' : 'linear-gradient(135deg, #0A84FF, #30D5C8)',
                                color: 'white', fontWeight: 700, fontSize: 15, border: 'none',
                                cursor: sharingToFeed ? 'wait' : 'pointer', opacity: sharingToFeed ? 0.7 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                transition: 'all 0.3s ease',
                            }}>
                                {sharedToFeed ? (
                                    <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg> Shared to My Feed!</>
                                ) : sharingToFeed ? 'Sharing...' : (
                                    <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share to My Feed</>
                                )}
                            </button>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', marginBottom: 10, fontWeight: 500 }}>OR SHARE EXTERNALLY</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                {[{id:'copy',label:'Copy Link',color:'#00d4ff'},{id:'x',label:'X',color:'#fff'},{id:'facebook',label:'Facebook',color:'#1877F2'},{id:'whatsapp',label:'WhatsApp',color:'#25D366'}].map(p => (
                                    <button key={p.id} onClick={() => handleShareAction(p.id)} style={{
                                        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 12, padding: '14px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                    }}>
                                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span style={{ fontSize: 12, color: p.id === 'x' ? '#000' : '#fff', fontWeight: 700 }}>{p.id === 'copy' ? '\u{1F517}' : p.id === 'x' ? 'X' : p.id === 'facebook' ? 'f' : 'W'}</span>
                                        </div>
                                        <span style={{ color: 'white', fontSize: 10, fontWeight: 500 }}>{p.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Heart burst animation CSS */}
                <style jsx>{`
                    @keyframes heartBurst {
                        0% { opacity: 1; transform: translate(-50%, -50%) scale(0.3); }
                        50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                        100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
                    }
                    @keyframes soundWave {
                        0% { height: 2px; }
                        100% { height: var(--max-h, 10px); }
                    }
                `}</style>

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
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, color: 'white', fontSize: 14 }}>Comments ({reelComments.length})</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {/* Phase 8 — Sort toggle */}
                                <button onClick={() => {
                                    const next = commentSort === 'newest' ? 'oldest' : 'newest';
                                    setCommentSort(next);
                                    setReelComments(prev => [...prev].sort((a, b) =>
                                        next === 'newest' ? new Date(b.created_at) - new Date(a.created_at) : new Date(a.created_at) - new Date(b.created_at)
                                    ));
                                }} style={{
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: 12, padding: '3px 10px', fontSize: 10, fontWeight: 600,
                                    color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
                                }}>{commentSort === 'newest' ? 'Newest' : 'Oldest'}</button>
                                <button onClick={() => setShowComments(false)} style={{
                                    background: 'none', border: 'none', color: 'white', fontSize: 18, cursor: 'pointer'
                                }}>x</button>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
                            {reelComments.length === 0 && (
                                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', padding: 20 }}>No comments yet. Be the first!</p>
                            )}
                            {reelComments.map(c => (
                                <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 12, paddingLeft: c.parent_id ? 24 : 0 }}>
                                    <img src={c.profiles?.avatar_url || '/default-avatar.png'} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                                    <div style={{ flex: 1 }}>
                                        <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 600 }}>{c.profiles?.username || 'User'}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 8 }}>{c.created_at ? timeAgo(c.created_at) : ''}</span>
                                        {/* Phase 7 — Inline edit mode */}
                                        {editingComment === c.id ? (
                                            <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <input value={editCommentText} onChange={e => setEditCommentText(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(c.id); if (e.key === 'Escape') { setEditingComment(null); setEditCommentText(''); } }}
                                                    style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 8, padding: '6px 10px', color: 'white', fontSize: 13, outline: 'none' }}
                                                    autoFocus />
                                                <button onClick={() => handleSaveEdit(c.id)} style={{ background: '#1877F2', border: 'none', borderRadius: 6, padding: '4px 10px', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                                                <button onClick={() => { setEditingComment(null); setEditCommentText(''); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                                            </div>
                                        ) : (
                                            c.content && <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: '2px 0 0' }}>{c.content}</p>
                                        )}
                                        {c.media_url && (
                                            <div style={{ position: 'relative', display: 'inline-block', marginTop: 4 }}>
                                                <img src={c.media_url} alt={c.media_type === 'gif' ? 'GIF' : 'Image'}
                                                    style={{ maxWidth: 180, maxHeight: 140, borderRadius: 8, display: 'block' }}
                                                    onError={e => { e.target.style.display = 'none'; }} />
                                                {c.media_type === 'gif' && (
                                                    <span style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>GIF</span>
                                                )}
                                            </div>
                                        )}
                                        {/* Phase 6+7 — Comment engagement row */}
                                        <div style={{ display: 'flex', gap: 14, marginTop: 4, alignItems: 'center' }}>
                                            <button onClick={() => handleCommentLike(c.id)} style={{
                                                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                color: commentLikes[c.id] ? '#FF2D55' : 'rgba(255,255,255,0.4)', fontSize: 12,
                                                display: 'flex', alignItems: 'center', gap: 3,
                                            }}>{commentLikes[c.id] ? '❤️' : '🤍'}</button>
                                            <button onClick={() => { setReplyTo({ id: c.id, username: c.profiles?.username || 'User' }); setCommentText(`@${c.profiles?.username || 'User'} `); }} style={{
                                                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                color: 'rgba(255,255,255,0.4)', fontSize: 12,
                                            }}>Reply</button>
                                            {(c.profiles?.username === 'You' || c.author_id === authUser?.id) && (<>
                                                <button onClick={() => handleEditComment(c)} style={{
                                                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                    color: 'rgba(255,255,255,0.4)', fontSize: 12,
                                                }}>Edit</button>
                                                <button onClick={() => handleDeleteComment(c.id)} style={{
                                                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                    color: 'rgba(255,255,255,0.3)', fontSize: 12, marginLeft: 'auto',
                                                }}>Delete</button>
                                            </>)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {/* #6 Comment Pagination — Load More */}
                            {hasMoreComments && (
                                <button onClick={loadMoreComments} disabled={loadingMoreComments} style={{
                                    width: '100%', padding: '10px', background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
                                    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500,
                                    cursor: loadingMoreComments ? 'wait' : 'pointer', marginTop: 4,
                                }}>{loadingMoreComments ? 'Loading...' : 'Load More Comments'}</button>
                            )}
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
                        {/* Reply-to indicator */}
                        {replyTo && (
                            <div style={{ padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,212,255,0.06)' }}>
                                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Replying to <span style={{ color: '#00d4ff', fontWeight: 600 }}>@{replyTo.username}</span></span>
                                <button onClick={() => { setReplyTo(null); setCommentText(''); }} style={{
                                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer', marginLeft: 'auto',
                                }}>x</button>
                            </div>
                        )}
                        <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                                ref={commentInputRef}
                                value={commentText}
                                onChange={e => { if (e.target.value.length <= COMMENT_MAX_LENGTH) setCommentText(e.target.value); }}
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
                                placeholder="Add a comment..."
                                style={{
                                    flex: 1, padding: '8px 12px', borderRadius: 20,
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'rgba(255,255,255,0.1)',
                                    color: 'white', fontSize: 13, outline: 'none',
                                }}
                                maxLength={COMMENT_MAX_LENGTH}
                            />
                            <button onClick={() => setShowReelGifPicker(!showReelGifPicker)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: showReelGifPicker ? '#1877F2' : 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 11 }}
                            >GIF</button>
                            <button onClick={() => reelFileInputRef.current?.click()} disabled={uploadingReelImage}
                                style={{ background: 'none', border: 'none', cursor: uploadingReelImage ? 'wait' : 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 15, opacity: uploadingReelImage ? 0.5 : 1 }}
                            >{uploadingReelImage ? '...' : '📷'}</button>
                            {(commentText.trim() || reelCommentMediaUrl) && (
                                <button onClick={() => handleSubmitComment(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1877F2', fontWeight: 600, fontSize: 13 }}
                                >Post</button>
                            )}
                        </div>
                        {/* Phase 8 — Character counter */}
                        {commentText.length > 0 && (
                            <div style={{ textAlign: 'right', fontSize: 10, color: commentText.length >= COMMENT_MAX_LENGTH - 20 ? '#ef4444' : 'rgba(255,255,255,0.3)', paddingRight: 16, paddingBottom: 4 }}>
                                {commentText.length}/{COMMENT_MAX_LENGTH}
                            </div>
                        )}
                    </div>
                )}

                {/* Phase 8 — Copy Link Toast */}
                {copyToast && (
                    <div style={{
                        position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.4)',
                        borderRadius: 12, padding: '8px 20px', color: '#00d4ff',
                        fontSize: 13, fontWeight: 600, zIndex: 300, backdropFilter: 'blur(10px)',
                    }}>Link Copied!</div>
                )}

                {/* Report Modal */}
                {showReportModal && (
                    <div onClick={() => { setShowReportModal(false); setReportReason(''); setReportSubmitted(false); }} style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002,
                    }}>
                        <div onClick={(e) => e.stopPropagation()} style={{
                            background: '#1a1a2e', borderRadius: 16, padding: 24, width: '85%', maxWidth: 360,
                            border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                            {reportSubmitted ? (
                                <div style={{ textAlign: 'center', color: 'white' }}>
                                    <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                                    <div style={{ fontSize: 16, fontWeight: 600 }}>Report Submitted</div>
                                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>Thank you. We will review this content.</div>
                                </div>
                            ) : (
                                <>
                                    <div style={{ color: 'white', fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Report This Reel</div>
                                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 12 }}>Why are you reporting this content?</div>
                                    {['Inappropriate Content', 'Spam Or Scam', 'Harassment', 'Misinformation', 'Other'].map(reason => (
                                        <button key={reason} onClick={() => setReportReason(reason)} style={{
                                            display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                                            marginBottom: 6, borderRadius: 10, fontSize: 14, cursor: 'pointer',
                                            background: reportReason === reason ? 'rgba(24,119,242,0.2)' : 'rgba(255,255,255,0.06)',
                                            border: reportReason === reason ? '1px solid #1877F2' : '1px solid rgba(255,255,255,0.1)',
                                            color: reportReason === reason ? '#1877F2' : 'white',
                                        }}>{reason}</button>
                                    ))}
                                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                        <button onClick={() => { setShowReportModal(false); setReportReason(''); }} style={{
                                            flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                                            background: 'rgba(255,255,255,0.08)', color: 'white', border: 'none', cursor: 'pointer',
                                        }}>Cancel</button>
                                        <button onClick={handleReport} disabled={!reportReason} style={{
                                            flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                                            background: reportReason ? '#ef4444' : 'rgba(255,255,255,0.08)',
                                            color: 'white', border: 'none', cursor: reportReason ? 'pointer' : 'not-allowed',
                                            opacity: reportReason ? 1 : 0.5,
                                        }}>Submit Report</button>
                                    </div>
                                </>
                            )}
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
            const allReels = [];

            // Fetch from social_reels
            const { data: reelsData } = await supabase
                .from('social_reels')
                .select(`
                    id, author_id, caption, video_url, thumbnail_url, view_count, like_count, comment_count, created_at, is_public,
                    profiles:author_id (id, username, avatar_url, full_name)
                `)
                .eq('is_public', true)
                .order('created_at', { ascending: false })
                .limit(20);
            if (reelsData) allReels.push(...reelsData);

            // Also fetch social_posts with YouTube URLs
            const { data: postsData } = await supabase
                .from('social_posts')
                .select('id, author_id, content, media_urls, like_count, comment_count, created_at, visibility')
                .eq('visibility', 'public')
                .not('media_urls', 'is', null)
                .order('created_at', { ascending: false })
                .limit(30);
            const ytPosts = (postsData || []).filter(p => {
                const url = p.media_urls?.[0];
                return url && (url.includes('youtube.com') || url.includes('youtu.be'));
            });
            if (ytPosts.length > 0) {
                const authorIds = [...new Set(ytPosts.map(p => p.author_id))];
                const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url, full_name').in('id', authorIds);
                const pm = {}; (profiles || []).forEach(p => { pm[p.id] = p; });
                const existingIds = new Set(allReels.map(r => r.id));
                ytPosts.forEach(p => {
                    if (!existingIds.has(p.id)) {
                        allReels.push({
                            id: p.id, author_id: p.author_id,
                            video_url: p.media_urls[0], caption: p.content,
                            like_count: p.like_count || 0, comment_count: p.comment_count || 0,
                            view_count: 0, created_at: p.created_at,
                            profiles: pm[p.author_id] || { username: 'Anonymous' },
                        });
                    }
                });
            }

            setReels(allReels);
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
