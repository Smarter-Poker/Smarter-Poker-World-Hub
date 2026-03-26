/**
 * REELS COMPONENT - SmarterPoker-style permanent video archive
 * Videos from Stories are saved here permanently
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { getAuthUser, getAccessToken } from '../../lib/authUtils';
import { busEmit, eventBus, EventType } from '../../engine/EventBus';
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
    const [loadError, setLoadError] = useState(false);
    const [muted, setMuted] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('reel-muted') !== 'false';
        }
        return true;
    });
    const [paused, setPaused] = useState(false);
    const [liked, setLiked] = useState({});
    const [disliked, setDisliked] = useState({});
    const [following, setFollowing] = useState({});
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
    const viewedReelsRef = useRef(new Set());
    const overlayTimerRef = useRef(null);
    const likeDebounceRef = useRef(false);
    const lastTapRef = useRef(0);
    const progressRAF = useRef(null);
    const handleLikeRef = useRef(null);
    const handleSaveRef = useRef(null);
    const handleCommentsRef = useRef(null);
    // GIF + Image state for reel comments
    const [showReelGifPicker, setShowReelGifPicker] = useState(false);
    const [reelCommentMediaUrl, setReelCommentMediaUrl] = useState(null);
    const [reelCommentMediaType, setReelCommentMediaType] = useState(null);
    const [uploadingReelImage, setUploadingReelImage] = useState(false);
    const reelFileInputRef = useRef(null);
    // Report state
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [reportSubmitted, setReportSubmitted] = useState(false);
    const [captionExpanded, setCaptionExpanded] = useState(false);
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

    useEffect(() => {
        loadReels();
        const user = getAuthUser();
        if (user?.id) {
            setCurrentUserId(user.id);
            // Load likes (filter by reaction_type='like')
            supabase.from('social_likes')
                .select('post_id')
                .eq('user_id', user.id)
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
                .eq('user_id', user.id)
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
                .eq('user_id', user.id)
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
                .eq('follower_id', user.id)
                .then(({ data }) => {
                    if (data) {
                        const followMap = {};
                        data.forEach(row => { followMap[row.following_id] = true; });
                        setFollowing(followMap);
                    }
                });
        }
    }, []);

    // EventBus listeners — sync like/bookmark from other viewers
    useEffect(() => {
        const handleLikeBus = (event) => {
            const d = event?.payload;
            if (d?.postId) {
                // Only update count for OTHER users to avoid conflicting with optimistic update
                if (d.userId !== currentUserId) {
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
            if (d?.followedId && d?.followerId !== currentUserId) {
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
    }, [currentUserId]);

    // Realtime subscription — live updates when new reels are posted
    useEffect(() => {
        if (!currentUserId) return;
        const _ch = supabase
            .channel(`reels-viewer:${currentUserId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_reels' }, () => {
                loadReels();
            })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [currentUserId]);

    // Reset paused state when changing reels + track view
    useEffect(() => {
        setPaused(false);
        setShowOverlay(false);
        setProgress(0);
        // Deduplicated view count — only fire once per reel per session (auth only)
        const reelId = reels[currentIndex]?.id;
        if (reelId && currentUserId && !viewedReelsRef.current.has(reelId)) {
            viewedReelsRef.current.add(reelId);
            (async () => { try { await supabase.rpc('increment_post_count', { p_post_id: reelId, p_field: 'view_count' }); } catch {} })();
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
            busEmit.socialPostBookmarked(currentReel.id, currentUserId, { added: !wasSaved });
        } catch {
            setSaved(prev => ({ ...prev, [currentReel.id]: wasSaved }));
        }
    };

    const handleReport = async () => {
        if (!currentReel?.id || !currentUserId || !reportReason.trim()) return;
        try {
            await supabase.from('social_interactions').insert({
                user_id: currentUserId, post_id: currentReel.id,
                interaction_type: 'report', metadata: { reason: reportReason.trim() }
            });
            setReportSubmitted(true);
            setTimeout(() => { setShowReportModal(false); setReportSubmitted(false); setReportReason(''); }, 2000);
        } catch { /* silent */ }
    };

    const handleFollow = async () => {
        const authorId = currentReel?.author_id || currentReel?.profiles?.id;
        if (!authorId || !currentUserId || authorId === currentUserId) return;
        const wasFollowing = following[authorId];
        setFollowing(prev => ({ ...prev, [authorId]: !prev[authorId] }));
        haptic(wasFollowing ? 5 : 15);
        try {
            if (wasFollowing) {
                await supabase.from('social_follows').delete().eq('follower_id', currentUserId).eq('following_id', authorId);
            } else {
                await supabase.from('social_follows').insert({ follower_id: currentUserId, following_id: authorId });
            }
            busEmit.socialFollowChanged && busEmit.socialFollowChanged(authorId, currentUserId, { added: !wasFollowing });
        } catch {
            setFollowing(prev => ({ ...prev, [authorId]: wasFollowing }));
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
        setLoadError(false);
        try {
            // Dual-source: social_reels + social_posts with YouTube links
            const [reelsResult, postsResult] = await Promise.all([
                supabase
                    .from('social_reels')
                    .select(`
                        id, author_id, caption, video_url, thumbnail_url, view_count, like_count, comment_count, created_at, is_public,
                        profiles:author_id (id, username, avatar_url, full_name)
                    `)
                    .eq('is_public', true)
                    .order('created_at', { ascending: false })
                    .limit(50),
                supabase
                    .from('social_posts')
                    .select(`
                        id, author_id, content, media_url, media_type, like_count, comment_count, view_count, created_at,
                        profiles:author_id (id, username, avatar_url, full_name)
                    `)
                    .or('media_type.eq.youtube,media_type.eq.video')
                    .order('created_at', { ascending: false })
                    .limit(20)
            ]);

            const reelsData = reelsResult.data || [];
            // Map social_posts to reel-compatible shape
            const postsAsReels = (postsResult.data || []).map(p => ({
                ...p,
                video_url: p.media_url,
                caption: p.content,
                is_public: true,
            }));

            // Merge, deduplicate by id, sort by date
            const idSet = new Set();
            const merged = [...reelsData, ...postsAsReels].filter(r => {
                if (idSet.has(r.id)) return false;
                idSet.add(r.id);
                return true;
            }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            setReels(merged);
            const lc = {}, cc = {};
            merged.forEach(r => {
                lc[r.id] = r.like_count || 0;
                cc[r.id] = r.comment_count || 0;
            });
            setLikeCounts(lc);
            setCommentCounts(cc);
        } catch (e) {
            console.error('Load reels error:', e);
            setLoadError(true);
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
        if (likeDebounceRef.current) return;
        likeDebounceRef.current = true;
        setTimeout(() => { likeDebounceRef.current = false; }, 300);

        const wasLiked = liked[currentReel.id];
        setLiked(prev => ({ ...prev, [currentReel.id]: !prev[currentReel.id] }));
        setLikeCounts(prev => ({ ...prev, [currentReel.id]: Math.max(0, (prev[currentReel.id] || 0) + (wasLiked ? -1 : 1)) }));
        // #7 Animated Like Counter — trigger bounce
        setLikeBounceId(currentReel.id);
        setTimeout(() => setLikeBounceId(null), 400);
        // Mutual exclusion: remove dislike when liking
        if (!wasLiked && disliked[currentReel.id]) {
            setDisliked(prev => ({ ...prev, [currentReel.id]: false }));
            try { await supabase.from('social_likes').delete().eq('post_id', currentReel.id).eq('user_id', currentUserId).eq('reaction_type', 'dislike'); } catch {}
        }

        try {
            if (wasLiked) {
                await supabase.from('social_likes').delete().eq('post_id', currentReel.id).eq('user_id', currentUserId).eq('reaction_type', 'like');
                busEmit.socialPostLiked(currentReel.id, currentUserId, { added: false, reactionType: 'like' });
                try { await supabase.rpc('decrement_post_count', { p_post_id: currentReel.id, p_field: 'like_count' }); } catch {}
            } else {
                await supabase.from('social_likes').insert({ post_id: currentReel.id, user_id: currentUserId, reaction_type: 'like' });
                busEmit.socialPostLiked(currentReel.id, currentUserId, { added: true, reactionType: 'like' });
                try { await supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'like_count' }); } catch {}
            }
        } catch (err) {
            console.warn('Reel like persistence failed:', err.message);
            setLiked(prev => ({ ...prev, [currentReel.id]: wasLiked }));
            setLikeCounts(prev => ({ ...prev, [currentReel.id]: Math.max(0, (prev[currentReel.id] || 0) + (wasLiked ? 1 : -1)) }));
        }
    };

    const handleDislike = async () => {
        if (!currentReel || !currentUserId) return;
        if (likeDebounceRef.current) return;
        likeDebounceRef.current = true;
        setTimeout(() => { likeDebounceRef.current = false; }, 300);

        const wasDisliked = disliked[currentReel.id];
        setDisliked(prev => ({ ...prev, [currentReel.id]: !prev[currentReel.id] }));
        // Mutual exclusion: remove like when disliking
        if (!wasDisliked && liked[currentReel.id]) {
            setLiked(prev => ({ ...prev, [currentReel.id]: false }));
            setLikeCounts(prev => ({ ...prev, [currentReel.id]: Math.max(0, (prev[currentReel.id] || 0) - 1) }));
            try {
                await supabase.from('social_likes').delete().eq('post_id', currentReel.id).eq('user_id', currentUserId).eq('reaction_type', 'like');
                try { await supabase.rpc('decrement_post_count', { p_post_id: currentReel.id, p_field: 'like_count' }); } catch {}
            } catch {}
        }

        try {
            if (wasDisliked) {
                await supabase.from('social_likes').delete().eq('post_id', currentReel.id).eq('user_id', currentUserId).eq('reaction_type', 'dislike');
                // #4 Not Interested — remove from filter
                setNotInterestedIds(prev => { const n = new Set(prev); n.delete(currentReel.id); if (typeof window !== 'undefined') localStorage.setItem('reels-not-interested', JSON.stringify([...n])); return n; });
            } else {
                await supabase.from('social_likes').insert({ post_id: currentReel.id, user_id: currentUserId, reaction_type: 'dislike' });
                // #4 Not Interested — add to filter
                setNotInterestedIds(prev => { const n = new Set(prev); n.add(currentReel.id); if (typeof window !== 'undefined') localStorage.setItem('reels-not-interested', JSON.stringify([...n])); return n; });
            }
        } catch {
            setDisliked(prev => ({ ...prev, [currentReel.id]: wasDisliked }));
        }
    };

    // Comment handler
    const handleOpenComments = async () => {
        setShowCommentInput(prev => !prev);
        if (!showCommentInput && currentReel?.id) {
            setCommentPage(0);
            try {
                const { data } = await supabase
                    .from('social_comments')
                    .select('*, profiles:author_id (username, avatar_url)')
                    .eq('post_id', currentReel.id)
                    .order('created_at', { ascending: true })
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
                .order('created_at', { ascending: true })
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
            try { await supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'comment_count' }); } catch {}
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

    // #8 Share Options Modal handler
    const handleShare = () => {
        if (!currentReel?.id) return;
        haptic(10);
        setShowShareModal(true);
    };

    const shareReelUrl = currentReel ? `${window.location.origin}/hub/reels?id=${currentReel.id}` : '';

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
            if (currentUserId) busEmit.socialPostShared(currentReel.id, currentUserId);
        } catch {
            setShareToast(true);
            setTimeout(() => setShareToast(false), 2000);
        }
    };

    // Reset comment drawer + caption + report + GIF + share on reel change
    useEffect(() => {
        setShowCommentInput(false);
        setCommentText('');
        setReelComments([]);
        setCaptionExpanded(false);
        setShowReelGifPicker(false);
        setReelCommentMediaUrl(null);
        setReelCommentMediaType(null);
        setShowReportModal(false);
        setReportReason('');
        setReportSubmitted(false);
        setShareToast(false);
        setShowShareModal(false);
    }, [currentIndex]);

    // Keep handler refs fresh for keyboard shortcuts
    const handleDislikeRef = useRef(null);
    handleLikeRef.current = handleLike;
    handleDislikeRef.current = handleDislike;
    handleSaveRef.current = handleSave;
    handleCommentsRef.current = handleOpenComments;

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e) => {
            const tag = e.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') goPrev();
            if (e.key === 'Escape') onClose();
            if (e.key === 'm' || e.key === 'M') {
                setMuted(prev => {
                    const next = !prev;
                    localStorage.setItem('reel-muted', String(next));
                    return next;
                });
            }
            if (e.key === 'l' || e.key === 'L') { handleLikeRef.current?.(); haptic(15); }
            if (e.key === 'd' || e.key === 'D') { handleDislikeRef.current?.(); haptic(10); }
            if (e.key === 's' || e.key === 'S') handleSaveRef.current?.();
            if (e.key === 'c' || e.key === 'C') handleCommentsRef.current?.();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

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
                try { navigator?.vibrate?.(10); } catch {}
                if (diffY > 0) goNext();   // Swipe up = next
                else goPrev();              // Swipe down = prev
            }
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                try { navigator?.vibrate?.(10); } catch {}
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
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
            }}>
                <div style={{
                    width: 280, height: 500, borderRadius: 16,
                    background: 'linear-gradient(110deg, #1a1a1a 8%, #2a2a2a 18%, #1a1a1a 33%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmerReels 1.5s linear infinite',
                }} />
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(110deg, #1a1a1a 8%, #2a2a2a 18%, #1a1a1a 33%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmerReels 1.5s linear infinite',
                    }} />
                    <div>
                        <div style={{ width: 100, height: 12, borderRadius: 6, background: '#1a1a1a', marginBottom: 6 }} />
                        <div style={{ width: 50, height: 8, borderRadius: 4, background: '#1a1a1a' }} />
                    </div>
                </div>
                <style>{`@keyframes shimmerReels { to { background-position-x: -200%; } }`}</style>
            </div>
        );
    }

    if (loadError) {
        return (
            <div style={{
                position: 'fixed', inset: 0, background: C.bg, zIndex: 10000,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                <div style={{ color: C.text, fontSize: 18, marginBottom: 8 }}>Failed To Load Reels</div>
                <div style={{ color: C.textSec, fontSize: 14, marginBottom: 20 }}>Please check your connection and try again.</div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => loadReels()} style={{
                        padding: '12px 24px', background: C.blue,
                        color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
                    }}>Retry</button>
                    <button onClick={onClose} style={{
                        padding: '12px 24px', background: 'rgba(255,255,255,0.1)',
                        color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, cursor: 'pointer',
                    }}>Go Back</button>
                </div>
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
            // Double-tap = like (TikTok behavior: always show heart, only toggle if not liked)
            setShowHeart(true);
            setTimeout(() => setShowHeart(false), 800);
            haptic(15);
            if (!liked[currentReel?.id] && currentUserId) {
                handleLike();
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

    // Cleanup RAF on unmount to prevent memory leak
    useEffect(() => {
        return () => { if (progressRAF.current) cancelAnimationFrame(progressRAF.current); };
    }, []);

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

                {/* Preload next video */}
                {reels[currentIndex + 1]?.video_url && (
                    <link rel="preload" href={reels[currentIndex + 1].video_url} as="video" />
                )}

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
                    {/* Follow button — only for other users' reels */}
                    {currentReel?.author_id && currentUserId && currentReel.author_id !== currentUserId && (
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

                    {currentReel?.caption && (() => {
                        const MAX_LEN = 100;
                        const isLong = currentReel.caption.length > MAX_LEN;
                        return (
                            <p style={{
                                color: 'white', fontSize: 14, margin: 0,
                                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                            }}>
                                {captionExpanded || !isLong ? currentReel.caption : `${currentReel.caption.slice(0, MAX_LEN)}...`}
                                {isLong && (
                                    <span
                                        onClick={(e) => { e.stopPropagation(); setCaptionExpanded(!captionExpanded); }}
                                        style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer', marginLeft: 4, fontSize: 13, pointerEvents: 'auto' }}
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
                        padding: '24px 8px 20px',
                        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
                        opacity: 1,
                        pointerEvents: 'auto',
                        zIndex: 20,
                    }}
                >
                    <button onClick={() => { handleLike(); haptic(15); }} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white',
                    }}>
                        <span style={{ fontSize: 22 }}>{liked[currentReel?.id] ? '\u2764\uFE0F' : '\uD83D\uDC4D'}</span>
                        <span style={{
                            fontSize: 9, fontWeight: 500,
                            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            transform: likeBounceId === currentReel?.id ? 'scale(1.5)' : 'scale(1)',
                            display: 'inline-block',
                        }}>{likeCounts[currentReel?.id] || 0}</span>
                    </button>
                    <button onClick={() => { handleDislike(); haptic(10); }} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: disliked[currentReel?.id] ? '#ef4444' : 'white',
                    }}>
                        <span style={{ fontSize: 22 }}>{disliked[currentReel?.id] ? '👎🏻' : '👎'}</span>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>{disliked[currentReel?.id] ? 'Disliked' : 'Dislike'}</span>
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
                        <span style={{ fontSize: 22 }}>{muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}</span>
                        {/* #10 Sound Waveform Indicator */}
                        {!muted && (
                            <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', height: 8, marginBottom: -2 }}>
                                {[2, 4, 7, 4, 2].map((h, i) => (
                                    <div key={i} style={{
                                        width: 2, background: '#00d4ff', borderRadius: 1,
                                        animation: `soundWave 0.6s ${i * 0.1}s ease-in-out infinite alternate`,
                                        height: h,
                                    }} />
                                ))}
                            </div>
                        )}
                        {muted && <span style={{ fontSize: 9, fontWeight: 500 }}>Unmute</span>}
                    </button>
                    <button onClick={() => setShowReportModal(true)} style={{
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 4, cursor: 'pointer', color: 'rgba(255,255,255,0.6)',
                    }}>
                        <span style={{ fontSize: 18 }}>🚩</span>
                        <span style={{ fontSize: 9, fontWeight: 500 }}>Report</span>
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
                                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 8 }}>{c.created_at ? timeAgo(c.created_at) : ''}</span>
                                        {c.content && <span style={{ color: C.textSec, fontSize: 13, marginLeft: 8 }}>{c.content}</span>}
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
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                {[{id:'copy',label:'Copy Link',icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>},
                                  {id:'x',label:'X',icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>},
                                  {id:'facebook',label:'Facebook',icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>},
                                  {id:'whatsapp',label:'WhatsApp',icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>},
                                ].map(p => (
                                    <button key={p.id} onClick={() => handleShareAction(p.id)} style={{
                                        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 12, padding: '14px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                    }}>{p.icon}<span style={{ color: 'white', fontSize: 10, fontWeight: 500 }}>{p.label}</span></button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {showHeart && (
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: 80, pointerEvents: 'none', zIndex: 25,
                        animation: 'heartBurstReels 0.8s ease-out forwards',
                    }}>❤️</div>
                )}

                {/* Reel counter */}
                <div style={{
                    position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                    color: 'rgba(255,255,255,0.7)', fontSize: 12, zIndex: 20,
                }}>
                    {currentIndex + 1} / {reels.length}
                </div>

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
