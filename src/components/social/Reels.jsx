/**
 * REELS COMPONENT - SmarterPoker-style permanent video archive
 * Videos from Stories are saved here permanently
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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

// ─── YouTube URL helpers ──────────────────────────────────────────────────────
function getYouTubeVideoId(url) {
    if (!url) return null;
    // watch?v=ID  |  youtu.be/ID  |  /embed/ID  |  /shorts/ID
    const patterns = [
        /[?&]v=([a-zA-Z0-9_-]{11})/,
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /\/embed\/([a-zA-Z0-9_-]{11})/,
        /\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const re of patterns) {
        const m = url.match(re);
        if (m) return m[1];
    }
    return null;
}

function isYouTubeUrl(url) {
    return !!(url && (url.includes('youtube.com') || url.includes('youtu.be')));
}

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

    // Source-aware atomic engagement counter.
    // Uses SECURITY DEFINER RPCs — single UPDATE, no read-then-write race condition.
    const incrementMetric = async (reel, field, amount) => {
        if (!reel?.id) return;
        try {
            if (reel.source === 'posts') {
                const rpc = amount > 0 ? 'increment_post_count' : 'decrement_post_count';
                const { error } = await supabase.rpc(rpc, { p_post_id: reel.id, p_field: field });
                if (error) throw error;
            } else {
                const rpc = amount > 0 ? 'increment_reel_count' : 'decrement_reel_count';
                const { error } = await supabase.rpc(rpc, { p_reel_id: reel.id, p_field: field });
                if (error) throw error;
            }
        } catch (e) {
            console.warn('[ReelsViewer] Atomic counter update failed:', e?.message || e);
        }
    };

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
    const [viewCounts, setViewCounts] = useState({});
    // Infinite scroll state
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [pageOffset, setPageOffset] = useState(60); // tracks next fetch offset per source

    // Phase 9: Long Press Context Menu
    // Named distinctly from the swipe useEffect's local handleTouchStart to prevent shadowing
    const [showContextMenu, setShowContextMenu] = useState(false);
    const longPressTimerRef = useRef(null);
    const handleLongPressTouchStart = () => {
        longPressTimerRef.current = setTimeout(() => {
            try { navigator?.vibrate?.(20); } catch (err) { console.warn('[ReelsViewer] vibrate failed:', err); }
            setShowContextMenu(true);
        }, 500);
    };
    const cancelLongPress = () => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };

    // Phase 9: Watched Indicator
    const [watchedReelIds, setWatchedReelIds] = useState([]);
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('smarter-reels-watched');
            if (stored) {
                try { setWatchedReelIds(JSON.parse(stored)); } catch (e) { console.warn('Handled exception:', e); }
            }
        }
    }, []);

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
    // #10 Error Toast
    const [errorToast, setErrorToast] = useState(null);
    const showErrorToast = (msg) => { setErrorToast(msg); setTimeout(() => setErrorToast(null), 3000); };
    // #6 Comment Like Counts
    const [commentLikeCounts, setCommentLikeCounts] = useState({});
    // UX Overhaul — More menu + Reaction picker
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const reactionTimerRef = useRef(null);

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
            supabase.from('follows')
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
    // Debounced to 3s to batch rapid inserts and avoid feed-flash
    useEffect(() => {
        if (!currentUserId) return;
        let reloadTimer = null;
        const _ch = supabase
            .channel(`reels-viewer:${currentUserId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_reels' }, () => {
                // Debounce: wait 3s before reloading so multiple rapid inserts collapse into one reload
                clearTimeout(reloadTimer);
                reloadTimer = setTimeout(() => { loadReels(); }, 3000);
            })
            .subscribe();
        return () => { clearTimeout(reloadTimer); supabase.removeChannel(_ch); };
    }, [currentUserId]);

    // Reset paused state when changing reels + track view
    // dep: currentIndex ONLY — we do NOT add `reels` because setReels() alone
    // should NOT trigger a play() call (the video key changes, element remounts)
    useEffect(() => {
        setPaused(false);
        setShowOverlay(false);
        setProgress(0);

        // Cancel any running RAF from the previous reel immediately
        if (progressRAF.current) {
            cancelAnimationFrame(progressRAF.current);
            progressRAF.current = null;
        }

        // Deduplicated view count
        const reelId = reels[currentIndex]?.id;
        if (reelId && currentUserId && !viewedReelsRef.current.has(reelId)) {
            viewedReelsRef.current.add(reelId);
            setViewCounts(prev => ({ ...prev, [reelId]: (prev[reelId] || reels[currentIndex]?.view_count || 0) + 1 }));
            incrementMetric(reels[currentIndex], 'view_count', 1);
        }

        // Play via canplay event — video element may be remounting due to key change,
        // calling play() immediately on a src-less element causes AbortError on mobile.
        const video = videoRef.current;
        if (!video) return;
        const onCanPlay = () => {
            const p = video.play();
            if (p !== undefined) p.catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); // suppress AbortError
        };
        // If already loaded (readyState >= 3), play immediately
        if (video.readyState >= 3) {
            const p = video.play();
            if (p !== undefined) p.catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        } else {
            video.addEventListener('canplay', onCanPlay, { once: true });
        }
        return () => video.removeEventListener('canplay', onCanPlay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentIndex]);

    // Haptic helper
    const haptic = (ms = 10) => { try { navigator?.vibrate?.(ms); } catch (e) { console.warn('Handled exception:', e); } };

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
            showErrorToast('Save failed \u2014 try again');
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
                await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', authorId);
            } else {
                await supabase.from('follows').insert({ follower_id: currentUserId, following_id: authorId });
            }
            busEmit.socialFollowChanged && busEmit.socialFollowChanged(authorId, currentUserId, { added: !wasFollowing });
        } catch {
            setFollowing(prev => ({ ...prev, [authorId]: wasFollowing }));
            showErrorToast('Follow failed \u2014 try again');
        }
    };

    // Auto-hide overlay after 2 seconds
    useEffect(() => {
        if (showOverlay) {
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
        }
        return () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current); };
    }, [showOverlay]);

    const loadReels = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            // 3-source fetch — interleaved to prevent any single source monopolizing the feed
            // BUG FIX: single query ordered by created_at filled the 100-slot limit with only
            // video_library reels (newest timestamps) or only user reels, depending on timing.
            // Solution: fetch each source separately then interleave 2:1 (user:library).
            const REEL_SELECT = `id, author_id, caption, video_url, thumbnail_url, view_count, like_count, comment_count, created_at, is_public, source_type, profiles:author_id (id, username, avatar_url, full_name)`;

            const [userResult, libraryResult, postsResult] = await Promise.all([
                // Slot A: User-uploaded reels (genuine social content)
                supabase
                    .from('social_reels')
                    .select(REEL_SELECT)
                    .eq('is_public', true)
                    .eq('source_type', 'user')
                    .order('created_at', { ascending: false })
                    .limit(60),
                // Slot B: Video-library-bridged reels (curated poker content)
                supabase
                    .from('social_reels')
                    .select(REEL_SELECT)
                    .eq('is_public', true)
                    .eq('source_type', 'video_library')
                    .order('created_at', { ascending: false })
                    .limit(60),
                // Slot C: Social posts with video/YouTube links
                supabase
                    .from('social_posts')
                    .select(`id, author_id, content, content_type, media_urls, like_count, comment_count, created_at, profiles:author_id (id, username, avatar_url, full_name)`)
                    .eq('visibility', 'public')
                    .not('media_urls', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(20)
            ]);

            const userReels = userResult.data || [];
            const libReels = libraryResult.data || [];

            const postsAsReels = (postsResult.data || [])
                .filter(p => {
                    const url = p.media_urls?.[0];
                    return p.content_type === 'video' || (url && (
                        url.includes('youtube.com') || url.includes('youtu.be') ||
                        url.match(/\.(mp4|webm|mov)(\?|$)/i)
                    ));
                })
                .map(p => ({
                    ...p,
                    source: 'posts',
                    video_url: p.media_urls?.[0],
                    caption: p.content,
                    view_count: p.view_count || 0,
                    is_public: true,
                }));

            // Interleave 2 user reels + 1 library reel + sprinkle posts
            // This ensures a natural scroll experience regardless of timestamp differences
            const interleaved = [];
            const maxLen = Math.max(userReels.length, libReels.length);
            let uIdx = 0, lIdx = 0, pIdx = 0;
            for (let i = 0; i < maxLen * 3 && interleaved.length < 120; i++) {
                // Pattern: user, user, library (repeating)
                const slot = i % 3;
                if (slot === 0 || slot === 1) {
                    if (uIdx < userReels.length) interleaved.push(userReels[uIdx++]);
                    else if (lIdx < libReels.length) interleaved.push(libReels[lIdx++]);
                } else {
                    if (lIdx < libReels.length) interleaved.push(libReels[lIdx++]);
                    else if (uIdx < userReels.length) interleaved.push(userReels[uIdx++]);
                }
                // Splice in a post every 10 reels
                if (interleaved.length > 0 && interleaved.length % 10 === 0 && pIdx < postsAsReels.length) {
                    interleaved.push(postsAsReels[pIdx++]);
                }
            }
            // Append any remaining
            while (uIdx < userReels.length) interleaved.push(userReels[uIdx++]);
            while (lIdx < libReels.length) interleaved.push(libReels[lIdx++]);
            while (pIdx < postsAsReels.length) interleaved.push(postsAsReels[pIdx++]);

            // Deduplicate by id
            const idSet = new Set();
            const merged = interleaved.filter(r => {
                if (idSet.has(r.id)) return false;
                idSet.add(r.id);
                return true;
            });

            setReels(merged);
            const lc = {}, cc = {}, vc = {};
            merged.forEach(r => {
                lc[r.id] = r.like_count || 0;
                cc[r.id] = r.comment_count || 0;
                vc[r.id] = r.view_count || 0;
            });
            setLikeCounts(lc);
            setViewCounts(vc);
            setCommentCounts(cc);
        } catch (e) {
            console.warn('Load reels error:', e);
            setLoadError(true);
        }
        setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const currentReel = reels[currentIndex];

    // Phase 9: Watched Indicator Timer
    useEffect(() => {
        if (!currentReel?.id) return;
        const watchTimer = setTimeout(() => {
            setWatchedReelIds(prev => {
                if (prev.includes(currentReel.id)) return prev;
                const next = [...prev, currentReel.id].slice(-500); // limited to 500
                localStorage.setItem('smarter-reels-watched', JSON.stringify(next));
                return next;
            });
        }, 3000); // Flag watched after 3s
        return () => clearTimeout(watchTimer);
    }, [currentReel?.id]);

    const goNext = () => {
        if (currentIndex < reels.length - 1) {
            setCurrentIndex(prev => prev + 1);
            // Trigger background load when 3 reels from end
            if (currentIndex >= reels.length - 4 && hasMore && !loadingMore) {
                loadMoreReels();
            }
        }
    };

    const goPrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    // Infinite scroll — load more reels when near end
    const loadMoreReels = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const REEL_SELECT = 'id, author_id, caption, video_url, thumbnail_url, view_count, like_count, comment_count, created_at, is_public, source_type, profiles:author_id (id, username, avatar_url, full_name)';
            const [userRes, libRes] = await Promise.all([
                supabase.from('social_reels').select(REEL_SELECT)
                    .eq('is_public', true).eq('source_type', 'user')
                    .order('created_at', { ascending: false })
                    .range(pageOffset, pageOffset + 29),
                supabase.from('social_reels').select(REEL_SELECT)
                    .eq('is_public', true).eq('source_type', 'video_library')
                    .order('created_at', { ascending: false })
                    .range(pageOffset, pageOffset + 29),
            ]);
            const newReels = [
                ...(userRes.data || []).map(r => ({ ...r, source: 'reels' })),
                ...(libRes.data || []).map(r => ({ ...r, source: 'reels' })),
            ];
            if (newReels.length === 0) {
                setHasMore(false);
            } else {
                const existingIds = new Set(reels.map(r => r.id));
                const fresh = newReels.filter(r => !existingIds.has(r.id));
                if (fresh.length === 0) {
                    setHasMore(false);
                } else {
                    const lc = {}, cc = {}, vc = {};
                    fresh.forEach(r => {
                        lc[r.id] = r.like_count || 0;
                        cc[r.id] = r.comment_count || 0;
                        vc[r.id] = r.view_count || 0;
                    });
                    setReels(prev => [...prev, ...fresh]);
                    setLikeCounts(prev => ({ ...prev, ...lc }));
                    setCommentCounts(prev => ({ ...prev, ...cc }));
                    setViewCounts(prev => ({ ...prev, ...vc }));
                    setPageOffset(prev => prev + 30);
                }
            }
        } catch (e) { console.warn('[ReelsViewer] loadMoreReels failed:', e?.message); }
        setLoadingMore(false);
    };

    const handleLike = async () => {
        if (!currentReel) return;
        if (likeDebounceRef.current) return;
        likeDebounceRef.current = true;
        setTimeout(() => { likeDebounceRef.current = false; }, 300);

        // Optimistic UI update — always fire so heart turns red immediately
        const wasLiked = liked[currentReel.id];
        setLiked(prev => ({ ...prev, [currentReel.id]: !prev[currentReel.id] }));
        setLikeCounts(prev => ({ ...prev, [currentReel.id]: Math.max(0, (prev[currentReel.id] || 0) + (wasLiked ? -1 : 1)) }));
        // #7 Animated Like Counter — trigger bounce
        setLikeBounceId(currentReel.id);
        setTimeout(() => setLikeBounceId(null), 400);

        // Resolve userId fresh to avoid stale closure
        const userId = currentUserId || getAuthUser()?.id;
        if (!userId) return; // No auth — keep optimistic UI but skip DB write

        // Mutual exclusion: remove dislike when liking
        if (!wasLiked && disliked[currentReel.id]) {
            setDisliked(prev => ({ ...prev, [currentReel.id]: false }));
            try { await supabase.from('social_likes').delete().eq('post_id', currentReel.id).eq('user_id', userId).eq('reaction_type', 'dislike'); } catch (e) { console.warn('Handled exception:', e); }
        }

        try {
            if (wasLiked) {
                await supabase.from('social_likes').delete().eq('post_id', currentReel.id).eq('user_id', userId).eq('reaction_type', 'like');
                busEmit.socialPostLiked(currentReel.id, userId, { added: false, reactionType: 'like' });
                incrementMetric(currentReel, 'like_count', -1);
            } else {
                await supabase.from('social_likes').insert({ post_id: currentReel.id, user_id: userId, reaction_type: 'like' });
                busEmit.socialPostLiked(currentReel.id, userId, { added: true, reactionType: 'like' });
                incrementMetric(currentReel, 'like_count', 1);
            }
        } catch (err) {
            console.warn('Reel like persistence failed:', err.message);
            // Roll back optimistic update on failure
            setLiked(prev => ({ ...prev, [currentReel.id]: wasLiked }));
            setLikeCounts(prev => ({ ...prev, [currentReel.id]: Math.max(0, (prev[currentReel.id] || 0) + (wasLiked ? 1 : -1)) }));
            showErrorToast('Like failed \u2014 try again');
        }
    };

    const handleDislike = async () => {
        if (!currentReel) return;
        if (likeDebounceRef.current) return;
        likeDebounceRef.current = true;
        setTimeout(() => { likeDebounceRef.current = false; }, 300);

        const wasDisliked = disliked[currentReel.id];
        setDisliked(prev => ({ ...prev, [currentReel.id]: !prev[currentReel.id] }));
        // Mutual exclusion: remove like when disliking
        if (!wasDisliked && liked[currentReel.id]) {
            setLiked(prev => ({ ...prev, [currentReel.id]: false }));
            setLikeCounts(prev => ({ ...prev, [currentReel.id]: Math.max(0, (prev[currentReel.id] || 0) - 1) }));
        }

        const userId = currentUserId || getAuthUser()?.id;
        if (!userId) return; // No auth — keep optimistic UI but skip DB write

        // Clean up like from DB if needed
        if (!wasDisliked && liked[currentReel.id]) {
            try {
                await supabase.from('social_likes').delete().eq('post_id', currentReel.id).eq('user_id', userId).eq('reaction_type', 'like');
                incrementMetric(currentReel, 'like_count', -1);
            } catch (e) { console.warn('Handled exception:', e); }
        }

        try {
            if (wasDisliked) {
                await supabase.from('social_likes').delete().eq('post_id', currentReel.id).eq('user_id', userId).eq('reaction_type', 'dislike');
                // #4 Not Interested — remove from filter
                setNotInterestedIds(prev => { const n = new Set(prev); n.delete(currentReel.id); if (typeof window !== 'undefined') localStorage.setItem('reels-not-interested', JSON.stringify([...n])); return n; });
            } else {
                await supabase.from('social_likes').insert({ post_id: currentReel.id, user_id: userId, reaction_type: 'dislike' });
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
                    .order('created_at', { ascending: commentSort === 'oldest' })
                    .limit(50);
                setReelComments(data || []);
                setHasMoreComments((data || []).length >= 50);
                // #6 Load comment like counts
                try {
                    const { data: clData } = await supabase.from('social_interactions')
                        .select('metadata').eq('post_id', currentReel.id).eq('interaction_type', 'comment_like');
                    const clCounts = {};
                    (clData || []).forEach(row => { const cid = row.metadata?.comment_id; if (cid) clCounts[cid] = (clCounts[cid] || 0) + 1; });
                    setCommentLikeCounts(clCounts);
                } catch (e) { console.warn('Handled exception:', e); }
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

    const handleSubmitComment = async (e) => {
        if (e && e.key !== 'Enter') return;
        if ((!commentText.trim() && !reelCommentMediaUrl) || !currentUserId || !currentReel?.id) return;
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
            const payload = { post_id: currentReel.id, author_id: currentUserId, content: text || '' };
            if (mediaUrl) { payload.media_url = mediaUrl; payload.media_type = mediaType; }
            if (parentId) { payload.parent_id = parentId; }
            const { error } = await supabase.from('social_comments').insert(payload);
            if (error) throw error;
            busEmit.socialCommentAdded(currentReel.id, currentUserId);
            // DB trigger (trig_update_reel_comment_count / trig_update_post_comment_count)
            // handles comment_count increment atomically — no RPC needed here
            setCommentCounts(prev => ({ ...prev, [currentReel.id]: (prev[currentReel.id] || 0) + 1 }));
        } catch {
            setReelComments(prev => prev.filter(c => c.id !== tempId));
        }
    };

    // Phase 6 — Comment like toggle
    const handleCommentLike = async (commentId) => {
        if (!currentUserId) return;
        const wasLiked = commentLikes[commentId];
        setCommentLikes(prev => ({ ...prev, [commentId]: !wasLiked }));
        // Optimistic comment like count sync
        setCommentLikeCounts(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 0) + (wasLiked ? -1 : 1)) }));
        try {
            if (wasLiked) {
                // BUG FIX: .match({ metadata: { comment_id } }) does FULL-OBJECT equality match.
                // If metadata has extra keys it won't match. Use PostgREST JSON path filter instead.
                await supabase.from('social_interactions')
                    .delete()
                    .eq('user_id', currentUserId)
                    .eq('post_id', currentReel.id)
                    .eq('interaction_type', 'comment_like')
                    .eq('metadata->>comment_id', commentId);
            } else {
                await supabase.from('social_interactions').insert({
                    user_id: currentUserId, post_id: currentReel.id,
                    interaction_type: 'comment_like', metadata: { comment_id: commentId }
                });
            }
        } catch {
            setCommentLikes(prev => ({ ...prev, [commentId]: wasLiked }));
            setCommentLikeCounts(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 0) + (wasLiked ? 1 : -1)) }));
        }
    };

    // Phase 6 — Delete own comment
    const handleDeleteComment = async (commentId) => {
        if (!currentUserId || !currentReel?.id) return;
        const prev = reelComments;
        setReelComments(c => c.filter(x => x.id !== commentId));
        try {
            const { error } = await supabase.from('social_comments').delete()
                .eq('id', commentId).eq('author_id', currentUserId);
            if (error) throw error;
            // DB trigger handles comment_count decrement atomically
            setCommentCounts(p => ({ ...p, [currentReel.id]: Math.max(0, (p[currentReel.id] || 1) - 1) }));
            busEmit.socialCommentAdded && busEmit.socialCommentAdded(currentReel.id, currentUserId, { removed: true });
        } catch { setReelComments(prev); }
    };

    // Phase 7 — Edit own comment
    const handleEditComment = (comment) => {
        setEditingComment(comment.id);
        setEditCommentText(comment.content || '');
    };
    const handleSaveEdit = async (commentId) => {
        if (!editCommentText.trim() || !currentUserId) return;
        const orig = reelComments.find(c => c.id === commentId);
        setReelComments(prev => prev.map(c => c.id === commentId ? { ...c, content: editCommentText.trim() } : c));
        setEditingComment(null);
        try {
            const { error } = await supabase.from('social_comments')
                .update({ content: editCommentText.trim() }).eq('id', commentId).eq('author_id', currentUserId);
            if (error) throw error;
        } catch {
            if (orig) setReelComments(prev => prev.map(c => c.id === commentId ? orig : c));
        }
        setEditCommentText('');
    };

    // Phase 7 — Playback speed toggle (native video)
    const handleSpeedToggle = () => {
        const speeds = [1, 1.25, 1.5, 2, 0.5, 0.75];
        const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
        const newSpeed = speeds[nextIdx];
        setPlaybackSpeed(newSpeed);
        // Use videoRef instead of document.querySelector to avoid grabbing wrong element
        if (videoRef.current) videoRef.current.playbackRate = newSpeed;
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
        } catch (err) { console.warn('[ReelComment] Upload error:', err); }
        setUploadingReelImage(false);
    };

    // Phase 9: 1-Click Repost Architecture — opens share modal; repost requires explicit user action
    const handleShare = () => {
        if (!currentReel?.id) return;
        haptic(10);
        setShowShareModal(true);
    };

    const shareReelUrl = currentReel ? `${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}/hub/reels?id=${currentReel.id}` : '';

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
            if (platform !== 'copy') incrementMetric(currentReel, 'share_count', 1);
            if (currentUserId) busEmit.socialPostShared(currentReel.id, currentUserId);
        } catch {
            setShareToast(true);
            setTimeout(() => setShareToast(false), 2000);
        }
    };

    // Share to My Feed — creates a social_posts entry linking this reel
    const [sharingToFeed, setSharingToFeed] = useState(false);
    const [sharedToFeed, setSharedToFeed] = useState(false);
    const handleShareToFeed = async () => {
        if (!currentReel?.id || !currentUserId || sharingToFeed) return;
        setSharingToFeed(true);
        try {
            const videoUrl = currentReel.video_url;
            const caption = currentReel.caption || 'Check out this reel!';
            const reelLink = window.location.origin + '/hub/reels?id=' + currentReel.id;
            // #5 Duplicate guard
            const { data: existing } = await supabase.from('social_posts')
                .select('id').eq('author_id', currentUserId).eq('link_url', reelLink).limit(1);
            if (existing && existing.length > 0) {
                setSharedToFeed(true);
                setSharingToFeed(false);
                setTimeout(() => setSharedToFeed(false), 3000);
                return;
            }
            const postContent = caption + '\n\n' + reelLink;
            const { error } = await supabase.from('social_posts').insert({
                author_id: currentUserId,
                content: postContent,
                content_type: videoUrl ? 'video' : 'text',
                media_urls: videoUrl ? [videoUrl] : [],
                visibility: 'public',
                link_url: reelLink,
            });
            if (error) throw error;
            incrementMetric(currentReel, 'share_count', 1);
            busEmit.socialPostShared(currentReel.id, currentUserId);
            busEmit.dataMutated('social');
            setSharedToFeed(true);
            setTimeout(() => { setSharedToFeed(false); }, 3000);
        } catch (err) {
            console.warn('Share to feed failed:', err.message);
            showErrorToast('Share failed \u2014 try again');
        }
        setSharingToFeed(false);
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
            if (e.key === 's' || e.key === 'S') handleSaveRef.current?.();
            if (e.key === 'c' || e.key === 'C') handleCommentsRef.current?.();
            if (e.key === '?') setShowShortcutsOverlay(prev => !prev);
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
                try { navigator?.vibrate?.(10); } catch (e) { console.warn('Handled exception:', e); }
                if (diffY > 0) goNext();   // Swipe up = next
                else goPrev();              // Swipe down = prev
            }
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                try { navigator?.vibrate?.(10); } catch (e) { console.warn('Handled exception:', e); }
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
    // BUG FIX: include reels.length so goNext/goPrev don't close over stale state
    }, [currentIndex, reels.length]);

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
        
        // Execute playback changes synchronously to avoid mobile Safari blocking deferred play()
        if (!showOverlay) {
            setShowOverlay(true);
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
        } else {
            // Tap while overlay visible = toggle play/pause
            // BUG FIX: YouTube iframes have no native videoRef — skip play/pause for them
            const isYT = isYouTubeUrl(currentReel?.video_url);
            if (!isYT && videoRef.current) {
                if (videoRef.current.paused) {
                    const playPromise = videoRef.current.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(e => console.warn('Play intercepted:', e));
                    }
                    setPaused(false);
                    // Playing = Auto hide
                    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
                    overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
                } else {
                    videoRef.current.pause();
                    setPaused(true);
                    // Paused = Anchor HUD
                    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
                }
            } else if (isYT) {
                // YouTube: just auto-hide the overlay after 2.5s
                if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
                overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
            }
        }
    };

    // Progress bar update loop — stored in ref to prevent stale closure in RAF
    const updateProgressRef = useRef(null);
    updateProgressRef.current = () => {
        if (videoRef.current && videoRef.current.duration) {
            setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
        }
        progressRAF.current = requestAnimationFrame(updateProgressRef.current);
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
            onTouchStart={handleLongPressTouchStart}
            onTouchEnd={cancelLongPress}
            onTouchMove={cancelLongPress}
            onMouseDown={handleLongPressTouchStart}
            onMouseUp={cancelLongPress}
            onMouseMove={cancelLongPress}
            onContextMenu={(e) => { e.preventDefault(); setShowContextMenu(true); }}
        >
            {/* Close / Back button — always touchable; fades when overlay hidden */}
            <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                aria-label="Close reels"
                style={{
                    position: 'absolute', top: 20, left: 20,
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none', color: 'white', fontSize: 20,
                    cursor: 'pointer', zIndex: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: showOverlay ? 1 : 0.3,
                    transition: 'opacity 0.3s ease',
                    pointerEvents: 'auto',
                }}
            >←</button>

            {/* Reel container */}
            <div style={{
                width: '100%', maxWidth: 420, height: '100vh',
                position: 'relative', background: '#000',
            }}>
                {/* Video / YouTube iframe — smart renderer */}
                {(() => {
                    const url = currentReel?.video_url;
                    const ytId = getYouTubeVideoId(url);
                    if (ytId) {
                        // YouTube embed — autoplay, muted, loop
                        // BUG FIX: key includes muted state so src re-generates when user toggles mute
                        const embedSrc = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${ytId}&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}`;
                        return (
                            <iframe
                                key={`yt-${currentReel?.id}-muted-${muted}`}
                                src={embedSrc}
                                allow="autoplay; encrypted-media; fullscreen"
                                allowFullScreen
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    border: 'none',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    objectFit: 'cover',
                                    // BUG FIX: pointer-events none — swipe handlers are on container
                                    pointerEvents: 'none',
                                }}
                                title={currentReel?.caption || 'Poker Reel'}
                            />
                        );
                    }
                    // Raw video (MP4, WebM, etc.)
                    return (
                        <video
                            ref={videoRef}
                            key={currentReel?.id}
                            src={url}
                            autoPlay
                            muted={muted}
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onPlay={() => { progressRAF.current = requestAnimationFrame(updateProgressRef.current); }}
                            onPause={() => { if (progressRAF.current) cancelAnimationFrame(progressRAF.current); }}
                            onEnded={() => {
                                if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
                                setProgress(0);
                                if (currentIndex < reels.length - 1) goNext();
                            }}
                        />
                    );
                })()}

                {/* Preload next video — only for MP4/WebM (not YouTube iframes) */}
                {reels[currentIndex + 1]?.video_url &&
                 !isYouTubeUrl(reels[currentIndex + 1]?.video_url) && (
                    <link rel="preload" href={reels[currentIndex + 1].video_url} as="video" />
                )}

                {/* Play Button Overlay — only when paused AND using native video */}
                {paused && !isYouTubeUrl(currentReel?.video_url) && (
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
                            <div style={{ color: 'white', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>{currentReel?.profiles?.full_name || currentReel?.profiles?.username}</span>
                                {watchedReelIds.includes(currentReel?.id) && (
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
                                        background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: 4, backdropFilter: 'blur(4px)',
                                    }}>Watched</span>
                                )}
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

                {/* Right Action Sidebar — ALWAYS VISIBLE & TOUCHABLE on mobile */}
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        position: 'absolute', right: 12, bottom: 110, zIndex: 20,
                        display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center',
                    }}
                >
                    {/* Heart — tap to like, long-press for reactions */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => {
                                handleLike();
                                if (!liked[currentReel?.id]) {
                                    setShowHeart(true);
                                    setTimeout(() => setShowHeart(false), 800);
                                }
                            }}
                            onPointerDown={() => {
                                reactionTimerRef.current = setTimeout(() => {
                                    haptic(20);
                                    setShowReactionPicker(true);
                                }, 500);
                            }}
                            onPointerUp={() => clearTimeout(reactionTimerRef.current)}
                            onPointerLeave={() => clearTimeout(reactionTimerRef.current)}
                            aria-label={liked[currentReel?.id] ? 'Unlike' : 'Like'}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                            }}
                        >
                            <svg width="32" height="32" viewBox="0 0 24 24" fill={liked[currentReel?.id] ? '#ef4444' : 'none'} stroke={liked[currentReel?.id] ? '#ef4444' : 'white'} strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))', transition: 'transform 0.15s ease' }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                            <span style={{
                                color: 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                                transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                transform: likeBounceId === currentReel?.id ? 'scale(1.4)' : 'scale(1)',
                                display: 'inline-block',
                            }}>
                                {likeCounts[currentReel?.id] || 0}
                            </span>
                        </button>
                        {/* Reaction Picker — appears on long-press */}
                        {showReactionPicker && (
                            <div style={{
                                position: 'absolute', right: 48, top: '50%', transform: 'translateY(-50%)',
                                display: 'flex', gap: 4, padding: '8px 12px', borderRadius: 24,
                                background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                animation: 'fadeInScale 0.2s ease',
                            }}>
                                {[
                                    { emoji: '\u2764\uFE0F', label: 'Love', type: 'like' },
                                    { emoji: '\uD83D\uDC4D', label: 'Thumbs Up', type: 'thumbsup' },
                                    { emoji: '\uD83D\uDC4E', label: 'Thumbs Down', type: 'dislike' },
                                    { emoji: '\uD83D\uDE02', label: 'Laughing', type: 'laughing' },
                                    { emoji: '\uD83D\uDE22', label: 'Crying', type: 'crying' },
                                    { emoji: '\uD83D\uDE21', label: 'Angry', type: 'angry' },
                                ].map(r => (
                                    <button key={r.type} onClick={() => {
                                        if (r.type === 'like') { handleLike(); if (!liked[currentReel?.id]) { setShowHeart(true); setTimeout(() => setShowHeart(false), 800); } }
                                        else if (r.type === 'dislike') handleDislike();
                                        else { handleLike(); if (!liked[currentReel?.id]) { setShowHeart(true); setTimeout(() => setShowHeart(false), 800); } }
                                        setShowReactionPicker(false);
                                        haptic(10);
                                    }} aria-label={r.label} style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        fontSize: 28, padding: '4px',
                                        transition: 'transform 0.15s ease',
                                    }}
                                    onMouseEnter={e => e.target.style.transform = 'scale(1.3)'}
                                    onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                                    >{r.emoji}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Comment */}
                    <button onClick={handleOpenComments} aria-label="Comments" style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                        <span style={{ color: showCommentInput ? '#1877F2' : 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            {commentCounts[currentReel?.id] || 0}
                        </span>
                    </button>

                    {/* Share */}
                    <button onClick={() => { handleShare(); haptic(10); }} aria-label="Share" style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                        <span style={{ color: 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Share</span>
                    </button>

                    {/* Save */}
                    <button onClick={handleSave} aria-label={saved[currentReel?.id] ? 'Unsave' : 'Save'} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill={saved[currentReel?.id] ? 'white' : 'none'} stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                        <span style={{ color: 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            {saved[currentReel?.id] ? 'Saved' : 'Save'}
                        </span>
                    </button>

                    {/* More (···) — opens panel with Sound, Report, Speed, Link */}
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowMoreMenu(prev => !prev)} aria-label="More options" style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                        }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                                <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                            </svg>
                            <span style={{ color: 'white', fontSize: 10, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>More</span>
                        </button>
                        {/* More Menu Panel */}
                        {showMoreMenu && (
                            <div style={{
                                position: 'absolute', right: 48, bottom: 0,
                                minWidth: 180, padding: '8px 0', borderRadius: 12,
                                background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                animation: 'fadeInScale 0.2s ease',
                            }}>
                                <button onClick={() => { setMuted(prev => { const next = !prev; localStorage.setItem('reel-muted', String(next)); return next; }); setShowMoreMenu(false); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px',
                                    background: 'none', border: 'none', color: 'white', fontSize: 14, cursor: 'pointer', textAlign: 'left',
                                }}>
                                    {muted ? (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                                    )}
                                    {muted ? 'Unmute' : 'Mute'}
                                </button>
                                <button onClick={() => { handleSpeedToggle(); setShowMoreMenu(false); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px',
                                    background: 'none', border: 'none', color: playbackSpeed !== 1 ? '#00d4ff' : 'white', fontSize: 14, cursor: 'pointer', textAlign: 'left',
                                }}>
                                    <div style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px solid currentColor', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{playbackSpeed}x</div>
                                    Speed ({playbackSpeed}x)
                                </button>
                                <button onClick={() => {
                                    const url = `${window.location.origin}/hub/reels?id=${currentReel?.id || ''}`;
                                    navigator.clipboard.writeText(url).then(() => {
                                        setCopyToast(true); setTimeout(() => setCopyToast(false), 2000);
                                    }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                                    setShowMoreMenu(false);
                                }} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px',
                                    background: 'none', border: 'none', color: 'white', fontSize: 14, cursor: 'pointer', textAlign: 'left',
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                    Copy Link
                                </button>
                                <button onClick={() => { setShowReportModal(true); setShowMoreMenu(false); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px',
                                    background: 'none', border: 'none', color: '#ef4444', fontSize: 14, cursor: 'pointer', textAlign: 'left',
                                    borderTop: '1px solid rgba(255,255,255,0.08)',
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                                    Report
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Comment Drawer */}
                {showCommentInput && (
                    <div onClick={(e) => e.stopPropagation()} style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'rgba(0,0,0,0.9)', borderRadius: '16px 16px 0 0',
                        maxHeight: '50vh', display: 'flex', flexDirection: 'column',
                        zIndex: 30,
                    }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, color: 'white', fontSize: 15 }}>Comments</span>
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
                                <button onClick={() => setShowCommentInput(false)} style={{
                                    background: 'none', border: 'none', color: 'white', fontSize: 18, cursor: 'pointer'
                                }}>x</button>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', maxHeight: 'calc(50vh - 100px)' }}>
                            {reelComments.length === 0 && (
                                <div style={{ color: C.textSec, textAlign: 'center', padding: 20, fontSize: 14 }}>No comments yet. Be the first!</div>
                            )}
                            {reelComments.map((c, i) => (
                                <div key={c.id || i} style={{ display: 'flex', gap: 10, padding: '8px 0', paddingLeft: c.parent_id ? 24 : 0 }}>
                                    <img src={c.profiles?.avatar_url || '/default-avatar.png'} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                                    <div style={{ flex: 1 }}>
                                        <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{c.profiles?.username || 'User'}</span>
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
                                            c.content && <span style={{ color: C.textSec, fontSize: 13, marginLeft: 8 }}>{c.content}</span>
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
                                            }}>{commentLikes[c.id] ? '❤️' : '🤍'}{commentLikeCounts[c.id] > 0 && <span style={{ fontSize: 10, opacity: 0.6 }}>{commentLikeCounts[c.id]}</span>}</button>
                                            <button onClick={() => { setReplyTo({ id: c.id, username: c.profiles?.username || 'User' }); setCommentText(`@${c.profiles?.username || 'User'} `); }} style={{
                                                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                color: 'rgba(255,255,255,0.4)', fontSize: 12,
                                            }}>Reply</button>
                                            {(c.profiles?.username === 'You' || c.author_id === currentUserId) && (<>
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
                        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 10, alignItems: 'center' }}>
                            <input
                                ref={commentInputRef}
                                type="text"
                                placeholder="Add a comment..."
                                value={commentText}
                                onChange={(e) => { if (e.target.value.length <= COMMENT_MAX_LENGTH) setCommentText(e.target.value); }}
                                onKeyDown={handleSubmitComment}
                                maxLength={COMMENT_MAX_LENGTH}
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
                        {/* Phase 8 — Character counter */}
                        {commentText.length > 0 && (
                            <div style={{ textAlign: 'right', fontSize: 10, color: commentText.length >= COMMENT_MAX_LENGTH - 20 ? '#ef4444' : 'rgba(255,255,255,0.3)', paddingRight: 16, paddingBottom: 4 }}>
                                {commentText.length}/{COMMENT_MAX_LENGTH}
                            </div>
                        )}
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

                {/* #10 Error Toast */}
                {errorToast && (
                    <div style={{
                        position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.4)',
                        borderRadius: 12, padding: '8px 20px', color: '#FF453A',
                        fontSize: 13, fontWeight: 600, zIndex: 30, backdropFilter: 'blur(10px)',
                        whiteSpace: 'nowrap',
                    }}>{errorToast}</div>
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
                                ['L', 'Like / Heart'],
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
                {/* Phase 9: Long Press Context Menu */}
                {showContextMenu && (
                    <div onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); }} style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
                    }}>
                        <div onClick={e => e.stopPropagation()} style={{
                            background: 'rgba(25, 25, 40, 0.95)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 16, width: 260, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                        }}>
                            <button onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); handleSave(); }} style={{
                                background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                                padding: '16px 20px', color: 'white', fontSize: 16, fontWeight: 600, textAlign: 'left',
                                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill={saved[currentReel?.id] ? 'white' : 'none'} stroke="white" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> 
                                {saved[currentReel?.id] ? 'Unsave' : 'Save Reel'}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); handleShare(); }} style={{
                                background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                                padding: '16px 20px', color: 'white', fontSize: 16, fontWeight: 600, textAlign: 'left',
                                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> 
                                Share / Repost
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); handleReport(); }} style={{
                                background: 'transparent', border: 'none',
                                padding: '16px 20px', color: '#ff3b30', fontSize: 16, fontWeight: 600, textAlign: 'left',
                                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                                Report
                            </button>
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
                <style>{`
                    @keyframes heartBurstReels {
                        0% { opacity: 1; transform: translate(-50%, -50%) scale(0.3); }
                        50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                        100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
                    }
                    @keyframes soundWave {
                        0% { height: 2px; }
                        100% { height: var(--max-h, 10px); }
                    }
                    @keyframes fadeInScale {
                        from { opacity: 0; transform: scale(0.85); }
                        to { opacity: 1; transform: scale(1); }
                    }
                `}</style>



                {/* View count intentionally hidden from HUD — private to poster only */}
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
        console.warn('Save to reels error:', e);
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
