/**
 * REELS FEED CAROUSEL - SmarterPoker-style inline Reels in the feed
 * Horizontal scrollable carousel that appears between posts
 * Swipe right to see more reels
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { YouTubeErrorOverlay, reportFailureToServer, reportToSentry } from '../../hooks/useYouTubeErrorManager';
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
        if (!isYouTube && videoRef.current) {
            const p = videoRef.current.play();
            if (p !== undefined) p.catch(() => { }); // suppress AbortError on rapid hover
        }
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
                    loading="lazy"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center top',
                    }}
                />
            ) : (
                <video
                    ref={videoRef}
                    src={reel.video_url}
                    muted
                    loop
                    playsInline
                    preload="none"
                    poster={reel.thumbnail_url || undefined}
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
                        alt={reel.profiles?.username || 'User'}
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

            {/* View count intentionally hidden - visible to poster only, not shown publicly */}
        </div>
    );
}

function ReelViewer({ reels, startIndex, onClose }) {
    const { user: authUser } = useSupabase();

    // Source-aware atomic engagement counter.
    // Reels in the carousel may come from social_reels OR social_posts.
    // Uses SECURITY DEFINER RPCs - single UPDATE, no read-then-write race condition.
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
            console.warn('[ReelCarousel] Atomic counter update failed:', e?.message || e);
        }
    };


    const [currentIndex, setCurrentIndex] = useState(startIndex);
    const [muted, setMuted] = useState(true); // Start MUTED for mobile autoplay compliance — unmute after playback confirmed
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
    const [paused, setPaused] = useState(true); // Start true — autoplay may fail, first tap should send playVideo
    const [ytReady, setYtReady] = useState(false); // True once YouTube fires first onStateChange — suppresses phantom play button during autoplay startup
    const [ytError, setYtError] = useState(null); // YouTube embed error code (150=age-restricted, 100=not found)
    const [likeCounts, setLikeCounts] = useState({});
    const [commentCounts, setCommentCounts] = useState({});
    const [saved, setSaved] = useState({});
    const [viewCounts, setViewCounts] = useState({});
    const [slideDir, setSlideDir] = useState(null);
    const [captionExpanded, setCaptionExpanded] = useState(false);
    const [showShortcutsOverlay, setShowShortcutsOverlay] = useState(false);

    // Anti-Drift: Preserve viewed reel when new reels are inserted above it
    const prevReelIdRef = useRef(null);
    useEffect(() => {
        if (!reels || reels.length === 0) return;
        const currentReelId = reels[currentIndex]?.id;

        if (prevReelIdRef.current && currentReelId !== prevReelIdRef.current) {
            // reels array changed under us! Find where our reel moved to.
            const newIndex = reels.findIndex(r => r.id === prevReelIdRef.current);
            if (newIndex !== -1 && newIndex !== currentIndex) {
                setCurrentIndex(newIndex);
            }
        }

        // Update the ref to the currently viewing reel
        if (reels[currentIndex]?.id) {
            prevReelIdRef.current = reels[currentIndex].id;
        }
    }, [reels, currentIndex]);

    // Phase 9: Long Press Context Menu
    const [showContextMenu, setShowContextMenu] = useState(false);
    const longPressTimerRef = useRef(null);
    // Long-press handlers (haptic defined later - accessed via ref)
    const handleLongPressTouchStart = () => {
        longPressTimerRef.current = setTimeout(() => {
            try { navigator?.vibrate?.(20); } catch (e) { console.warn('[ReelsFeedCarousel] Handled exception:', e); }
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
                try { setWatchedReelIds(JSON.parse(stored)); } catch (e) { console.warn('[ReelsFeedCarousel] Handled exception:', e); }
            }
        }
    }, []);


    // #8 Share Options Modal
    const [showShareModal, setShowShareModal] = useState(false);
    // #7 Animated Like Counter
    const [likeBounceId, setLikeBounceId] = useState(null);
    // #4 Not Interested - persist disliked reel IDs in localStorage
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
    // Phase 6 - Comment engagement
    const [commentLikes, setCommentLikes] = useState({});
    const [replyTo, setReplyTo] = useState(null);
    // Phase 7 - Power features
    const [editingComment, setEditingComment] = useState(null);
    const [editCommentText, setEditCommentText] = useState('');
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    // Phase 8 - Comment sort, char counter, copy link
    const [commentSort, setCommentSort] = useState('newest');
    const [copyToast, setCopyToast] = useState(false);
    const COMMENT_MAX_LENGTH = 280;
    // #10 Error Toast — timer tracked in ref so it can be cleared on unmount
    const [errorToast, setErrorToast] = useState(null);
    const errorToastTimerRef = useRef(null);
    const showErrorToast = (msg) => {
        if (errorToastTimerRef.current) clearTimeout(errorToastTimerRef.current);
        setErrorToast(msg);
        errorToastTimerRef.current = setTimeout(() => setErrorToast(null), 3000);
    };
    // #6 Comment Like Counts
    const [commentLikeCounts, setCommentLikeCounts] = useState({});
    // UX Overhaul - More menu + Reaction picker
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const reactionTimerRef = useRef(null);
    // BUG FIX (RFC-1): track all toast/modal/animation dismiss timers so they can be
    // cancelled on unmount and prevent setState-after-unmount.
    const shareToastTimerRef = useRef(null);
    const sharedToFeedTimerRef = useRef(null);
    const reportModalTimerRef = useRef(null);
    const likeBounceTimerRef = useRef(null);
    const showHeartTimerRef = useRef(null);
    const copyToastTimerRef = useRef(null);
    // Array ref for the onLoad retry batch (300/800/1500ms) — prevents stale postMessage
    // to wrong iframe when user swipes before the retry loop fires.
    const ytAutoplayTimersRef = useRef([]);
    const autoUnmuteRetryTimersRef = useRef([]);
    // Unmute-after-loadVideoById timer (100ms) — tracked so it can be cancelled on unmount.
    const unmuteTimerRef = useRef(null);
    // Comment input focus timer (100ms) — prevents focus() on unmounted input.
    const commentFocusTimerRef = useRef(null);
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
    const swipeStartRef = useRef(null);
    const swipeDeltaRef = useRef(0);
    const userInteractedRef = useRef(false); // Tracks if user has touched/swiped at least once
    const userWantsSoundRef = useRef(true);  // User preference — persists across reel changes
    const likeDebounceRef = useRef(false);
    const lastTapRef = useRef(0);
    const progressRAF = useRef(null);
    const ytIframeRef = useRef(null);         // Persistent YouTube iframe ref — never remounted
    const ytIframeReadyRef = useRef(false);   // True after first onLoad of persistent iframe
    const handleLikeRef = useRef(null);
    const handleSaveRef = useRef(null);
    const handleCommentsRef = useRef(null);
    // Stable refs so handleYTMessage can read fresh values without being re-registered on every swipe
    const currentIndexRef = useRef(0);
    const reelsRef = useRef([]);
    const goNextRef = useRef(null);

    const currentReel = reels[currentIndex];

    // Phase 9: Watched Indicator Timer
    useEffect(() => {
        if (!currentReel?.id) return;
        const watchTimer = setTimeout(() => {
            setWatchedReelIds(prev => {
                if (prev.includes(currentReel.id)) return prev;
                const next = [...prev, currentReel.id].slice(-500);
                localStorage.setItem('smarter-reels-watched', JSON.stringify(next));
                return next;
            });
        }, 3000); // 3 seconds = watched
        return () => clearTimeout(watchTimer);
    }, [currentReel?.id]);

    // Pre-fetch existing likes + bookmarks + dislikes + follows on mount
    useEffect(() => {
        if (!authUser?.id) return;
        // Load likes — limit 500 to guard against users with massive engagement history
        supabase.from('social_likes')
            .select('post_id')
            .eq('user_id', authUser.id)
            .eq('reaction_type', 'like')
            .limit(500)
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
            .limit(500)
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
            .limit(500)
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
            .limit(1000)
            .then(({ data }) => {
                if (data) {
                    const followMap = {};
                    data.forEach(row => { followMap[row.following_id] = true; });
                    setFollowing(followMap);
                }
            });
    }, [authUser?.id]);

    // EventBus listeners - sync like/bookmark from other viewers
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

    // Initialize counts from reel data — MERGE only, never overwrite existing optimistic values.
    // Critical: loadReels() fires on every Realtime INSERT. Without merge, optimistic like/view
    // updates are silently nuked the moment any new post appears in the feed.
    useEffect(() => {
        setLikeCounts(prev => {
            const merged = { ...prev };
            reels.forEach(r => { if (!(r.id in merged)) merged[r.id] = r.like_count || 0; });
            return merged;
        });
        setCommentCounts(prev => {
            const merged = { ...prev };
            reels.forEach(r => { if (!(r.id in merged)) merged[r.id] = r.comment_count || 0; });
            return merged;
        });
        setViewCounts(prev => {
            const merged = { ...prev };
            reels.forEach(r => { if (!(r.id in merged)) merged[r.id] = r.view_count || 0; });
            return merged;
        });
    }, [reels]);

    // Helper: send YouTube postMessage command to persistent iframe
    const sendYTCmd = useCallback((cmd, args = []) => {
        const iframe = ytIframeRef.current;
        if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: cmd, args }), '*');
        }
    }, []);

    const goNext = useCallback(() => {
        setCurrentIndex(prev => {
            if (prev >= reelsRef.current.length - 1) return prev;
            return prev + 1;
        });
    }, []);

    const goPrev = useCallback(() => {
        setCurrentIndex(prev => prev > 0 ? prev - 1 : prev);
    }, []);

    // Keep stable refs in sync so the single-registered YT message handler always reads fresh data
    useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
    useEffect(() => { reelsRef.current = reels; }, [reels]);
    useEffect(() => { goNextRef.current = goNext; }, [goNext]);

    // Switch video on index change using loadVideoById (NO iframe remount!)
    useEffect(() => {
        const reel = reels[currentIndex];
        if (!reel) return;
        const isYT = isYouTubeUrl(reel.video_url);

        setPaused(true);
        setYtReady(false);
        setYtError(null);
        setShowComments(false);
        setShowMoreMenu(false);
        setShowReactionPicker(false);
        setShowShareModal(false);
        setCaptionExpanded(false);

        if (isYT && ytIframeReadyRef.current) {
            const videoId = getYouTubeVideoId(reel.video_url);
            if (videoId) {
                // Use loadVideoById — switches video without reloading the player
                sendYTCmd('loadVideoById', [videoId]);
                // Unmute if user has interacted
                // BUG FIX (RFC-2): track unmute timer so it can be cancelled on unmount
                // (and when currentIndex changes again before 100ms elapses).
                if (userInteractedRef.current && userWantsSoundRef.current) {
                    if (unmuteTimerRef.current) clearTimeout(unmuteTimerRef.current);
                    unmuteTimerRef.current = setTimeout(() => {
                        unmuteTimerRef.current = null;
                        sendYTCmd('unMute');
                        sendYTCmd('setVolume', [100]);
                        setMuted(false);
                    }, 100);
                }
            }
            // Pause native video if it was playing (switching FROM native TO YouTube)
            if (videoRef.current && !videoRef.current.paused) {
                videoRef.current.pause();
            }
        } else if (!isYT) {
            // Switching to native video — pause YouTube iframe to stop audio bleed
            sendYTCmd('pauseVideo');
        }

        // 5s fallback: if YouTube never fires onStateChange, show play button
        const ytFallback = setTimeout(() => setYtReady(true), 5000);
        return () => {
            clearTimeout(ytFallback);
            autoUnmuteRetryTimersRef.current.forEach(t => clearTimeout(t));
            autoUnmuteRetryTimersRef.current = [];
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentIndex]);

    // Auto-hide overlay after 2.5 seconds — but NOT when video is paused
    // BUG FIX: Previously this useEffect unconditionally restarted the auto-hide timer
    // whenever showOverlay became true, overriding the timer cancellation in handleTap
    // when pausing. Now it respects paused state to keep the HUD anchored.
    useEffect(() => {
        if (showOverlay && !paused) {
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
        }
        return () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current); };
    }, [showOverlay, paused]);

    // Lock body scroll while ReelViewer is mounted — class-based so the CSS
    // desktop failsafe in index.css can permit scroll on all OTHER pages.
    useEffect(() => {
        document.body.classList.add('reels-lock');
        document.documentElement.classList.add('reels-lock');
        return () => {
            document.body.classList.remove('reels-lock');
            document.documentElement.classList.remove('reels-lock');
            // Clear any legacy inline styles that may still be on the elements
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.touchAction = '';
            document.documentElement.style.overflow = '';
            // BUG FIX (RFC-1): cancel all tracked timers to prevent setState-after-unmount
            clearTimeout(shareToastTimerRef.current);
            clearTimeout(sharedToFeedTimerRef.current);
            clearTimeout(reportModalTimerRef.current);
            clearTimeout(likeBounceTimerRef.current);
            clearTimeout(showHeartTimerRef.current);
            clearTimeout(copyToastTimerRef.current);
            clearTimeout(unmuteTimerRef.current);
            clearTimeout(commentFocusTimerRef.current);
            // Cancel any pending YT autoplay retry batch
            ytAutoplayTimersRef.current.forEach(t => clearTimeout(t));
            ytAutoplayTimersRef.current = [];
            autoUnmuteRetryTimersRef.current.forEach(t => clearTimeout(t));
            autoUnmuteRetryTimersRef.current = [];
        };
    }, []);

    // YouTube postMessage listener — registered ONCE at mount (empty deps) so swipes never
    // create a listener gap. All state reads go through stable refs to avoid stale closures.
    useEffect(() => {
        const YOUTUBE_ORIGINS = ['https://www.youtube-nocookie.com', 'https://www.youtube.com'];
        const handleYTMessage = (e) => {
            if (!YOUTUBE_ORIGINS.some(o => e.origin === o)) return;
            try {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                if (data?.event === 'onStateChange') {
                    if (data.info === 0) { // Video ended — advance via stable ref
                        goNextRef.current?.();
                    }
                    if (data.info === 1) { // Playing
                        setYtReady(true);
                        setPaused(false);
                        setYtError(null);
                        // Show overlay briefly on play
                        setShowOverlay(true);
                        clearTimeout(overlayTimerRef.current);
                        overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
                        // Auto-unmute ONLY if user wants sound
                        autoUnmuteRetryTimersRef.current.forEach(t => clearTimeout(t));
                        if (userWantsSoundRef.current) {
                            const doUnmute = () => {
                                if (!userWantsSoundRef.current) return;
                                sendYTCmd('unMute');
                                sendYTCmd('setVolume', [100]);
                                setMuted(false);
                            };
                            doUnmute();
                            autoUnmuteRetryTimersRef.current = [100, 300, 600].map(d => setTimeout(doUnmute, d));
                        } else {
                            autoUnmuteRetryTimersRef.current = [];
                        }
                    }
                    if (data.info === 2) { // Paused
                        setPaused(true);
                        setYtReady(true);
                        setShowOverlay(true);
                        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
                    }
                }
                if (data?.event === 'onError') {
                    setYtError({ code: data.info });
                    // Report to server + Sentry (best-effort) — read index via stable ref
                    try {
                        const vid = getYouTubeVideoId(reelsRef.current[currentIndexRef.current]?.video_url);
                        if (vid) { reportFailureToServer(vid, data.info, 'ReelsFeedCarousel'); reportToSentry(vid, data.info, 'ReelsFeedCarousel'); }
                    } catch { /* best-effort */ }
                }
            } catch (_) { }
        };
        window.addEventListener('message', handleYTMessage);
        return () => window.removeEventListener('message', handleYTMessage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // MUST stay [] — listener registered once; reads fresh data via refs

    const handleLike = async () => {
        if (!currentReel) return;
        if (likeDebounceRef.current) return;
        likeDebounceRef.current = true;
        setTimeout(() => { likeDebounceRef.current = false; }, 300);

        const currentId = currentReel.id;
        // Optimistic UI update - always fire so heart turns red immediately
        const wasLiked = liked[currentId];
        setLiked(prev => ({ ...prev, [currentId]: !prev[currentId] }));
        setLikeCounts(prev => ({ ...prev, [currentId]: Math.max(0, (prev[currentId] || 0) + (wasLiked ? -1 : 1)) }));
        // #7 Animated Like Counter - trigger bounce
        // BUG FIX (RFC-3): cancel previous bounce timer before starting a new one.
        setLikeBounceId(currentId);
        if (likeBounceTimerRef.current) clearTimeout(likeBounceTimerRef.current);
        likeBounceTimerRef.current = setTimeout(() => { likeBounceTimerRef.current = null; setLikeBounceId(null); }, 400);

        // Resolve userId fresh to avoid stale closure if authUser not yet hydrated
        const userId = authUser?.id || getAuthUser()?.id;
        if (!userId) return; // No auth - keep optimistic UI but skip DB write

        // Mutual exclusion: remove dislike when liking
        if (!wasLiked && disliked[currentId]) {
            setDisliked(prev => ({ ...prev, [currentId]: false }));
            try { await supabase.from('social_likes').delete().eq('post_id', currentId).eq('user_id', userId).eq('reaction_type', 'dislike'); } catch (e) { console.warn('[ReelsFeedCarousel] Handled exception:', e); }
        }

        try {
            if (wasLiked) {
                // DB trigger (trig_sync_like_count) handles like_count atomically - no RPC needed
                await supabase.from('social_likes').delete().eq('post_id', currentId).eq('user_id', userId).eq('reaction_type', 'like');
                busEmit.socialPostLiked(currentId, userId, { added: false, reactionType: 'like' });
            } else {
                // DB trigger (trig_sync_like_count) handles like_count atomically - no RPC needed
                await supabase.from('social_likes').insert({ post_id: currentId, user_id: userId, reaction_type: 'like' });
                busEmit.socialPostLiked(currentId, userId, { added: true, reactionType: 'like' });
            }
        } catch (err) {
            console.warn('Reel like persistence failed:', err.message);
            // Roll back optimistic update on failure
            setLiked(prev => ({ ...prev, [currentId]: wasLiked }));
            setLikeCounts(prev => ({ ...prev, [currentId]: Math.max(0, (prev[currentId] || 0) + (wasLiked ? 1 : -1)) }));
            showErrorToast('Like failed - try again');
        }
    };

    const handleDislike = async () => {
        if (!currentReel) return;
        if (likeDebounceRef.current) return;
        likeDebounceRef.current = true;
        setTimeout(() => { likeDebounceRef.current = false; }, 300);

        const currentId = currentReel.id;
        const wasDisliked = disliked[currentId];
        setDisliked(prev => ({ ...prev, [currentId]: !prev[currentId] }));
        // Mutual exclusion: remove like when disliking
        if (!wasDisliked && liked[currentId]) {
            setLiked(prev => ({ ...prev, [currentId]: false }));
            setLikeCounts(prev => ({ ...prev, [currentId]: Math.max(0, (prev[currentId] || 0) - 1) }));
        }

        const userId = authUser?.id || getAuthUser()?.id;
        if (!userId) return; // No auth - keep optimistic UI but skip DB write

        if (!wasDisliked && liked[currentId]) {
            try {
                // DB trigger handles like_count decrement when like is removed - no RPC needed
                await supabase.from('social_likes').delete().eq('post_id', currentId).eq('user_id', userId).eq('reaction_type', 'like');
            } catch (e) { console.warn('[ReelsFeedCarousel] Handled exception:', e); }
        }

        try {
            if (wasDisliked) {
                await supabase.from('social_likes').delete().eq('post_id', currentId).eq('user_id', userId).eq('reaction_type', 'dislike');
                // #4 Not Interested - remove from filter
                setNotInterestedIds(prev => { const n = new Set(prev); n.delete(currentId); if (typeof window !== 'undefined') localStorage.setItem('reels-not-interested', JSON.stringify([...n])); return n; });
            } else {
                await supabase.from('social_likes').insert({ post_id: currentId, user_id: userId, reaction_type: 'dislike' });
                // #4 Not Interested - add to filter
                setNotInterestedIds(prev => { const n = new Set(prev); n.add(currentId); if (typeof window !== 'undefined') localStorage.setItem('reels-not-interested', JSON.stringify([...n])); return n; });
            }
        } catch {
            // Roll back optimistic dislike update and alert the user
            setDisliked(prev => ({ ...prev, [currentId]: wasDisliked }));
            // Also roll back the like-count adjustment that mutual exclusion made
            if (!wasDisliked && liked[currentId]) {
                setLiked(prev => ({ ...prev, [currentId]: true }));
                setLikeCounts(prev => ({ ...prev, [currentId]: (prev[currentId] || 0) + 1 }));
            }
            showErrorToast('Dislike failed \u2014 try again');
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
                // #6 Load comment like counts
                try {
                    const { data: clData } = await supabase.from('social_interactions')
                        .select('metadata').eq('post_id', currentReel.id).eq('interaction_type', 'comment_like');
                    const clCounts = {};
                    (clData || []).forEach(row => { const cid = row.metadata?.comment_id; if (cid) clCounts[cid] = (clCounts[cid] || 0) + 1; });
                    setCommentLikeCounts(clCounts);
                } catch (e) { console.warn('[ReelsFeedCarousel] Handled exception:', e); }
            } catch { setReelComments([]); }
            // BUG FIX (RFC-4): cancel previous focus timer — prevents focus() on unmounted input.
            if (commentFocusTimerRef.current) clearTimeout(commentFocusTimerRef.current);
            commentFocusTimerRef.current = setTimeout(() => { commentFocusTimerRef.current = null; commentInputRef.current?.focus(); }, 100);
        }
    };

    // #6 Comment Pagination - Load More
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
            // Proxy post creation for reels: if the reel comes from social_reels,
            // create a proxy record in social_posts so the FK on social_comments works.
            if (currentReel.source === 'reels') {
                const { data: existing } = await supabase
                    .from('social_posts')
                    .select('id')
                    .eq('id', currentReel.id)
                    .maybeSingle();
                if (!existing) {
                    // BUG FIX #18: social_posts uses author_id (not user_id) and
                    // media_urls as a JSONB array (not media_url text). The wrong
                    // column names were silently swallowed by .catch(), preventing
                    // the proxy FK row from ever being created — causing all comments
                    // on social_reels-sourced reels to fail with a FK violation.
                    await supabase.from('social_posts').insert({
                        id: currentReel.id,
                        author_id: currentReel.author_id || authUser.id,
                        content: currentReel.caption || '',
                        content_type: 'video',
                        media_urls: currentReel.video_url ? [currentReel.video_url] : [],
                        visibility: 'public',
                    }).catch(e => console.warn('[ReelsFeedCarousel] Proxy post creation failed:', e?.message));
                }
            }
            const payload = { post_id: currentReel.id, author_id: authUser.id, content: text || '' };
            if (mediaUrl) { payload.media_url = mediaUrl; payload.media_type = mediaType; }
            if (parentId) { payload.parent_id = parentId; }
            const { error } = await supabase.from('social_comments').insert(payload);
            if (error) throw error;
            busEmit.socialCommentAdded(currentReel.id, authUser.id);
            // DB trigger handles comment_count increment atomically
            setCommentCounts(prev => ({ ...prev, [currentReel.id]: (prev[currentReel.id] || 0) + 1 }));
        } catch {
            setReelComments(prev => prev.filter(c => c.id !== tempId));
            showErrorToast('Comment failed \u2014 please try again');
        }
    };

    // Phase 6 - Comment like toggle
    const handleCommentLike = async (commentId) => {
        if (!authUser?.id) return;
        // Guard: skip temp comments (optimistic, not yet DB-persisted).
        // Temp IDs are Date.now() — a 13-digit numeric string when cast.
        // Liking a temp ID would insert a dangling social_interactions row
        // with a non-UUID comment_id that can never be cleaned up.
        if (typeof commentId === 'number' || String(commentId).length === 13) return;
        const wasLiked = commentLikes[commentId];
        setCommentLikes(prev => ({ ...prev, [commentId]: !wasLiked }));
        // #4 Optimistic comment like count sync
        setCommentLikeCounts(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 0) + (wasLiked ? -1 : 1)) }));
        try {
            if (wasLiked) {
                // Use .eq('metadata->>comment_id') not .match({metadata:{...}})
                // .match() applies JSONB '=' (exact object equality) and fails if
                // the stored value has any extra keys or different serialization.
                // The text-cast operator maps to the partial index on metadata->>'comment_id'.
                await supabase.from('social_interactions')
                    .delete()
                    .eq('user_id', authUser.id)
                    .eq('post_id', currentReel.id)
                    .eq('interaction_type', 'comment_like')
                    .eq('metadata->>comment_id', commentId);
            } else {
                await supabase.from('social_interactions').insert({
                    user_id: authUser.id, post_id: currentReel.id,
                    interaction_type: 'comment_like', metadata: { comment_id: commentId }
                });
            }
        } catch {
            // Roll back optimistic update and alert user
            setCommentLikes(prev => ({ ...prev, [commentId]: wasLiked }));
            setCommentLikeCounts(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 0) + (wasLiked ? 1 : -1)) }));
            showErrorToast('Like failed \u2014 try again');
        }
    };

    // Phase 6 - Delete own comment
    const handleDeleteComment = async (commentId) => {
        if (!authUser?.id || !currentReel?.id) return;
        // Optimistic remove — functional updater avoids stale-snapshot issues
        // under concurrent rapid deletes (using 'const prev = ...' is a closure
        // snapshot that becomes wrong after the first async delete in flight)
        setReelComments(c => c.filter(x => x.id !== commentId));
        try {
            const { error } = await supabase.from('social_comments').delete()
                .eq('id', commentId).eq('author_id', authUser.id);
            if (error) throw error;
            // DB trigger handles comment_count decrement atomically
            setCommentCounts(p => ({ ...p, [currentReel.id]: Math.max(0, (p[currentReel.id] || 1) - 1) }));
            busEmit.socialCommentAdded && busEmit.socialCommentAdded(currentReel.id, authUser.id, { removed: true });
        } catch {
            // Re-fetch to restore accurate state (safer than restoring a stale snapshot)
            supabase.from('social_comments')
                .select('*, profiles:author_id (username, avatar_url)')
                .eq('post_id', currentReel.id)
                .order('created_at', { ascending: commentSort === 'oldest' })
                .limit(50)
                .then(({ data }) => { if (data) setReelComments(data); });
            showErrorToast('Delete failed \u2014 please try again');
        }
    };

    // Phase 7 - Edit own comment
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

    // Phase 7 - Playback speed toggle
    const handleSpeedToggle = () => {
        const speeds = [1, 1.25, 1.5, 2, 0.5, 0.75];
        const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
        const newSpeed = speeds[nextIdx];
        setPlaybackSpeed(newSpeed);
        // Use videoRef instead of document.querySelector to avoid grabbing wrong element
        if (videoRef.current) videoRef.current.playbackRate = newSpeed;
        sendYTCmd('setPlaybackRate', [newSpeed]);
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
            if (uploadFile.size > 4.5 * 1024 * 1024) {
                showErrorToast('Image is too large (max 4.5MB).');
                setUploadingReelImage(false);
                return;
            }
            formData.append('image', uploadFile);
            const token = getAccessToken();
            if (!token) {
                showErrorToast('Auth required - please refresh.');
                setUploadingReelImage(false);
                return;
            }
            const resp = await fetch('/api/social/upload-comment-image', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
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

    // Share handler - opens share modal only; repost to feed requires explicit user tap
    const handleShare = () => {
        if (!currentReel?.id) return;
        haptic(10);
        setShowShareModal(true);
    };

    const shareReelUrl = currentReel ? `${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}/hub/social-media?reel=${currentReel.id}` : '';

    const handleShareAction = async (platform) => {
        setShowShareModal(false);
        const url = shareReelUrl;
        const title = 'Check out this poker reel on Smarter.Poker';
        try {
            if (platform === 'copy') {
                await navigator.clipboard.writeText(url);
                // BUG FIX (RFC-5): cancel previous share toast timer before scheduling a new one.
                if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
                setShareToast(true);
                shareToastTimerRef.current = setTimeout(() => { shareToastTimerRef.current = null; setShareToast(false); }, 2000);
            } else if (platform === 'native' && navigator.share) {
                await navigator.share({ title, url });
            } else if (platform === 'x') {
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, '_blank');
            } else if (platform === 'facebook') {
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
            } else if (platform === 'whatsapp') {
                window.open(`https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`, '_blank');
            }
            // Clipboard copy = link preview, not a social share — skip metric + bus event
            if (platform !== 'copy') {
                incrementMetric(currentReel, 'share_count', 1);
                if (authUser?.id) busEmit.socialPostShared(currentReel.id, authUser.id);
            }
        } catch {
            // BUG FIX (RFC-5 fallback): same cancel-before-reschedule pattern in error path
            if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
            setShareToast(true);
            shareToastTimerRef.current = setTimeout(() => { shareToastTimerRef.current = null; setShareToast(false); }, 2000);
        }
    };

    // Share to My Feed - creates a social_posts entry linking this reel
    const [sharingToFeed, setSharingToFeed] = useState(false);
    const [sharedToFeed, setSharedToFeed] = useState(false);
    const handleShareToFeed = async () => {
        if (!currentReel?.id || !authUser?.id || sharingToFeed) return;
        setSharingToFeed(true);
        try {
            const videoUrl = currentReel.video_url;
            const caption = currentReel.caption || 'Check out this reel!';
            const reelLink = window.location.origin + '/hub/reels?id=' + currentReel.id;
            // #5 Duplicate guard
            const { data: existing } = await supabase.from('social_posts')
                .select('id').eq('author_id', authUser.id).eq('link_url', reelLink).limit(1);
            if (existing && existing.length > 0) {
                setSharedToFeed(true);
                setSharingToFeed(false);
                // BUG FIX (RFC-6): cancel-before-reschedule, prevent setState-after-unmount
                if (sharedToFeedTimerRef.current) clearTimeout(sharedToFeedTimerRef.current);
                sharedToFeedTimerRef.current = setTimeout(() => { sharedToFeedTimerRef.current = null; setSharedToFeed(false); }, 3000);
                return;
            }
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
            incrementMetric(currentReel, 'share_count', 1);
            busEmit.socialPostShared(currentReel.id, authUser.id);
            busEmit.dataMutated('social');
            setSharedToFeed(true);
            // BUG FIX (RFC-6): cancel-before-reschedule on success path
            if (sharedToFeedTimerRef.current) clearTimeout(sharedToFeedTimerRef.current);
            sharedToFeedTimerRef.current = setTimeout(() => { sharedToFeedTimerRef.current = null; setSharedToFeed(false); }, 3000);
        } catch (err) {
            console.warn('Share to feed failed:', err.message);
            showErrorToast('Share failed \u2014 try again');
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
            // BUG FIX (RFC-7): track report modal dismiss timer — prevents setState-after-unmount.
            if (reportModalTimerRef.current) clearTimeout(reportModalTimerRef.current);
            reportModalTimerRef.current = setTimeout(() => { reportModalTimerRef.current = null; setShowReportModal(false); setReportSubmitted(false); setReportReason(''); }, 2000);
        } catch (err) {
            // Roll back the optimistic submitted state and show an error
            setReportSubmitted(false);
            console.warn('[ReelsFeedCarousel] Report submission failed:', err?.message || err);
            showErrorToast('Report failed — please try again');
        }
    };

    // (Duplicate YouTube auto-advance listener removed — merged into the single
    //  handleYTMessage listener at lines ~598-635 to prevent double goNext() calls)

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
            showErrorToast('Follow failed \u2014 try again');
        }
    };

    // Secondary reset on reel change: comment state, view tracking, native video play.
    // NOTE: paused/ytReady/ytError resets are in the PRIMARY effect above (~line 531).
    // This effect handles the remaining state and native video autoplay.
    // dep: currentIndex ONLY - do NOT add `reels` (causes double-fire + play on unloaded src)
    useEffect(() => {
        setReelComments([]);
        setCommentText('');
        setShowOverlay(false);
        setProgress(0);
        setShowReelGifPicker(false);
        setReelCommentMediaUrl(null);
        setReelCommentMediaType(null);
        setShowReportModal(false);
        setReportReason('');
        setReportSubmitted(false);
        setShareToast(false);

        // Cancel any running RAF from the previous reel immediately
        if (progressRAF.current) {
            cancelAnimationFrame(progressRAF.current);
            progressRAF.current = null;
        }

        // Deduplicated view count — defer 2s so rapid swipes don't inflate counts.
        // Only fires if the user actually watches for at least 2 seconds.
        const reelId = reels[currentIndex]?.id;
        const viewCountTimer = (reelId && authUser?.id && !viewedReelsRef.current.has(reelId))
            ? setTimeout(() => {
                viewedReelsRef.current.add(reelId);
                setViewCounts(prev => ({ ...prev, [reelId]: (prev[reelId] || reels[currentIndex]?.view_count || 0) + 1 }));
                incrementMetric(reels[currentIndex], 'view_count', 1);
            }, 2000)
            : null;

        // Native video autoplay — only runs for non-YouTube reels.
        // Play via canplay event because the video element may be remounting due to key change;
        // calling play() immediately causes AbortError on mobile Safari.
        const reel = reels[currentIndex];
        const isNativeVideo = reel && !isYouTubeUrl(reel.video_url);
        const video = isNativeVideo ? videoRef.current : null;
        if (!video) return () => { clearTimeout(viewCountTimer); };
        // For native video, set ytReady immediately when play starts so the
        // pause/play button is visible without waiting for the 5s fallback timer.
        const onPlay = () => setYtReady(true);
        video.addEventListener('play', onPlay, { once: true });
        const onCanPlay = () => {
            const p = video.play();
            if (p !== undefined) p.catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); // suppress AbortError
        };
        if (video.readyState >= 3) {
            const p = video.play();
            if (p !== undefined) p.catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        } else {
            video.addEventListener('canplay', onCanPlay, { once: true });
        }
        return () => {
            clearTimeout(viewCountTimer);
            video.removeEventListener('canplay', onCanPlay);
            video.removeEventListener('play', onPlay);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentIndex]);

    // Auto-advance on YouTube error after 3 seconds
    useEffect(() => {
        if (!ytError) return;
        const timer = setTimeout(() => {
            setCurrentIndex(prev => {
                if (prev < reels.length - 1) return prev + 1;
                return prev;
            });
        }, 3000);
        return () => clearTimeout(timer);
    }, [ytError, reels.length]);

    // Haptic helper
    const haptic = (ms = 10) => { try { navigator?.vibrate?.(ms); } catch (e) { console.warn('[ReelsFeedCarousel] Handled exception:', e); } };

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
                // Removed redundant DELETE before INSERT — if state says not saved,
                // no row exists to delete. The extra round-trip wasted latency.
                await supabase.from('social_interactions').insert({
                    post_id: currentReel.id, user_id: authUser.id, interaction_type: 'bookmark'
                });
            }
            busEmit.socialPostBookmarked(currentReel.id, authUser.id, { added: !wasSaved });
        } catch {
            setSaved(prev => ({ ...prev, [currentReel.id]: wasSaved }));
            showErrorToast('Save failed \u2014 try again');
        }
    };

    // Keep handler refs fresh for keyboard shortcuts
    const handleDislikeRef = useRef(null);
    handleLikeRef.current = handleLike;
    handleDislikeRef.current = handleDislike;
    handleSaveRef.current = handleSave;
    handleCommentsRef.current = handleToggleComments;

    // Cleanup RAF + pending timers on unmount to prevent memory leaks.
    // reactionTimerRef and longPressTimerRef can fire into a dead component
    // if the user starts a long-press and the viewer closes before the timeout.
    useEffect(() => {
        return () => {
            if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
            if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            if (errorToastTimerRef.current) clearTimeout(errorToastTimerRef.current);
        };
    }, []);

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e) => {
            // Don't intercept keyboard while typing in an input/textarea
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { setSlideDir('up'); goNext(); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { setSlideDir('down'); goPrev(); }
            if (e.key === 'Escape') { if (showComments) setShowComments(false); else onClose(); }
            // BUG FIX: Space bar is the universal play/pause shortcut — was missing
            // Uses DOM refs only to avoid stale closures
            if (e.key === ' ') {
                e.preventDefault();
                if (videoRef.current) {
                    if (videoRef.current.paused) {
                        videoRef.current.play().catch(() => { });
                    } else {
                        videoRef.current.pause();
                    }
                } else {
                    // YouTube — use sendYTCmd with persistent iframe ref
                    setPaused(prev => {
                        sendYTCmd(prev ? 'playVideo' : 'pauseVideo');
                        return !prev;
                    });
                }
            }
            if (e.key === 'm' || e.key === 'M') {
                setMuted(prev => {
                    const next = !prev;
                    sendYTCmd(next ? 'mute' : 'unMute');
                    if (!next) sendYTCmd('setVolume', [100]);
                    userWantsSoundRef.current = !next;
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
    }, [currentIndex, onClose, showComments]);

    if (!currentReel) return null;

    // Double-tap to like + single-tap overlay
    // sendYTCommand is now sendYTCmd (defined above, uses persistent iframe ref)

    const handleTap = (e) => {
        const now = Date.now();
        const DOUBLE_TAP_WINDOW = 300;
        const isYT = isYouTubeUrl(currentReel?.video_url);
        userInteractedRef.current = true; // Mark user as having interacted

        // First tap EVER: force play + unmute (iOS requires user gesture)
        if ((paused || muted) && isYT) {
            sendYTCmd('playVideo');
            sendYTCmd('unMute');
            sendYTCmd('setVolume', [100]);
            setPaused(false);
            setMuted(false);
            setYtReady(true);
            userWantsSoundRef.current = true;
            lastTapRef.current = now;
            setShowOverlay(true);
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
            return;
        }

        // LEFT 30% = previous
        if (e?.clientX && e.clientX < window.innerWidth * 0.3) {
            if (userWantsSoundRef.current) {
                sendYTCmd('unMute');
                sendYTCmd('setVolume', [100]);
                setMuted(false);
                setUserWantsSound(true);
            }
            goPrev();
            return;
        }
        // RIGHT 30% = next
        if (e?.clientX && e.clientX > window.innerWidth * 0.7) {
            if (userWantsSoundRef.current) {
                sendYTCmd('unMute');
                sendYTCmd('setVolume', [100]);
                setMuted(false);
                setUserWantsSound(true);
            }
            goNext();
            return;
        }

        if (now - lastTapRef.current < DOUBLE_TAP_WINDOW) {
            // Double-tap = toggle play/pause
            haptic(15);
            if (!isYT && videoRef.current) {
                if (videoRef.current.paused) {
                    const playPromise = videoRef.current.play();
                    if (playPromise !== undefined) playPromise.catch(e => console.warn('Play intercepted:', e));
                    setPaused(false);
                } else {
                    videoRef.current.pause();
                    setPaused(true);
                    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
                }
            } else if (isYT) {
                if (paused) {
                    sendYTCmd('playVideo');
                    setPaused(false);
                } else {
                    sendYTCmd('pauseVideo');
                    setPaused(true);
                    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
                }
            }
            lastTapRef.current = 0;
            return;
        }
        lastTapRef.current = now;

        // Single tap = show overlay ONLY (no play/pause)
        setShowOverlay(true);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
    };

    // Progress bar update loop for native videos
    const updateProgress = () => {
        // Early-exit when paused: avoids running setProgress at 60fps for nothing.
        // onPause/onEnded cancel the RAF; this guard catches any edge cases where
        // the cancel fires just after the rAF callback has already been scheduled.
        if (!videoRef.current || videoRef.current.paused) {
            progressRAF.current = null;
            return;
        }
        if (videoRef.current.duration) {
            setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
        }
        progressRAF.current = requestAnimationFrame(updateProgress);
    };

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.95)', zIndex: 10000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
        >
            {/* FULL-SCREEN TOUCH OVERLAY — handles taps + swipes ABOVE the iframe */}
            <div
                onTouchStart={(e) => {
                    swipeStartRef.current = { y: e.touches[0].clientY, x: e.touches[0].clientX, t: Date.now() };
                    swipeDeltaRef.current = 0;
                    userInteractedRef.current = true; // Mark user as having interacted
                    handleLongPressTouchStart();
                }}
                onTouchMove={(e) => {
                    if (!swipeStartRef.current) return;
                    swipeDeltaRef.current = e.touches[0].clientY - swipeStartRef.current.y;
                    cancelLongPress();
                    e.preventDefault();
                }}
                onTouchEnd={(e) => {
                    cancelLongPress();
                    const delta = swipeDeltaRef.current;
                    swipeStartRef.current = null;
                    if (Math.abs(delta) > 50) {
                        if (e.cancelable) e.preventDefault();
                        try { navigator?.vibrate?.(10); } catch (_) { }
                        if (userWantsSoundRef.current) {
                            sendYTCmd('unMute');
                            sendYTCmd('setVolume', [100]);
                            setMuted(false);
                            setUserWantsSound(true);
                        }
                        if (delta < 0) goNext();
                        else goPrev();
                        return;
                    }
                }}
                onClick={handleTap}
                onContextMenu={(e) => { e.preventDefault(); setShowContextMenu(true); }}
                style={{
                    position: 'absolute', inset: 0, zIndex: 5,
                    touchAction: 'none', cursor: 'pointer',
                }}
            />
            {/* Close button - always touchable; fades when overlay hidden but stays accessible */}
            <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                aria-label="Close reels"
                style={{
                    position: 'absolute', top: 20, right: 20,
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none', color: 'white', fontSize: 20,
                    cursor: 'pointer', zIndex: 10,
                    opacity: showOverlay ? 1 : 0.3,
                    transition: 'opacity 0.3s ease',
                    pointerEvents: 'auto',
                }}
            >✕</button>



            {/* Reel container - FULLSCREEN TikTok-style */}
            <div style={{
                width: '100vw', height: '100vh',
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: '#000',
            }}>
                {/* YouTube thumbnail — instant visual feedback while iframe loads */}
                {isYouTubeUrl(currentReel.video_url) && (
                    <img
                        src={`https://img.youtube.com/vi/${getYouTubeVideoId(currentReel.video_url)}/maxresdefault.jpg`}
                        style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            objectFit: 'cover', zIndex: 0,
                        }}
                        alt=""
                        onError={(e) => {
                            // maxresdefault may not exist; fall back to hqdefault
                            e.target.src = `https://img.youtube.com/vi/${getYouTubeVideoId(currentReel.video_url)}/hqdefault.jpg`;
                        }}
                    />
                )}

                {/* PERSISTENT YouTube iframe — ALWAYS rendered, hidden when viewing native video.
                    This prevents React from destroying/recreating the iframe when switching
                    between YouTube and direct-upload reels. */}
                {(() => {
                    // Find the first YouTube video in the reel list for the initial iframe src.
                    // startIndex may point to a direct upload, so we need a valid YT ID.
                    const firstYTReel = reels.find(r => isYouTubeUrl(r.video_url));
                    const initialVideoId = firstYTReel ? getYouTubeVideoId(firstYTReel.video_url) : null;
                    if (!initialVideoId) return null; // No YouTube reels at all — skip iframe entirely
                    const isCurrentYT = isYouTubeUrl(currentReel.video_url);
                    return (
                        <div style={{
                            position: 'relative', width: '100%', height: '100%', pointerEvents: 'none',
                            display: isCurrentYT ? 'block' : 'none', // Hide but keep alive
                        }}>
                            <iframe
                                ref={ytIframeRef}
                                src={`https://www.youtube-nocookie.com/embed/${initialVideoId}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1&controls=0&showinfo=0&iv_load_policy=3&fs=0&disablekb=1&cc_load_policy=0&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                                style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none', position: 'relative', zIndex: 1 }}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                onLoad={() => {
                                    ytIframeReadyRef.current = true;
                                    // Force play + unmute via postMessage
                                    sendYTCmd('playVideo');
                                    if (userInteractedRef.current && userWantsSoundRef.current) {
                                        sendYTCmd('unMute');
                                        sendYTCmd('setVolume', [100]);
                                        setMuted(false);
                                    }
                                    // BUG FIX (RFC-8): cancel any previous retry batch before
                                    // scheduling new ones — prevents stale postMessage to old iframe
                                    // when user swipes while the timers are pending.
                                    ytAutoplayTimersRef.current.forEach(t => clearTimeout(t));
                                    ytAutoplayTimersRef.current = [300, 800, 1500].map(delay => setTimeout(() => {
                                        sendYTCmd('playVideo');
                                        if (userInteractedRef.current && userWantsSoundRef.current) {
                                            sendYTCmd('unMute');
                                            sendYTCmd('setVolume', [100]);
                                        }
                                    }, delay));
                                }}
                            />
                        </div>
                    );
                })()}

                {/* Native video element — shown for direct uploads, hidden for YouTube */}
                <video
                    ref={videoRef}
                    key={currentReel.id}
                    src={!isYouTubeUrl(currentReel.video_url) ? currentReel.video_url : undefined}
                    autoPlay={!isYouTubeUrl(currentReel.video_url)}
                    muted={muted}
                    playsInline
                    poster={currentReel.thumbnail_url || undefined}
                    style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                        display: !isYouTubeUrl(currentReel.video_url) ? 'block' : 'none',
                    }}
                    onPlay={() => {
                        setPaused(false);
                        progressRAF.current = requestAnimationFrame(updateProgress);
                    }}
                    onPause={() => {
                        setPaused(true);
                        if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
                    }}
                    onEnded={() => {
                        if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
                        setProgress(0);
                        goNext();
                    }}
                />

                {/* Preload next 10 YouTube thumbnails for instant visual feedback */}
                {Array.from({ length: 10 }, (_, offset) => offset + 1).map(offset => {
                    const nextReel = reels[currentIndex + offset];
                    if (!nextReel?.video_url) return null;
                    const nextUrl = nextReel.video_url;
                    if (isYouTubeUrl(nextUrl)) {
                        const nextVid = getYouTubeVideoId(nextUrl);
                        if (!nextVid) return null;
                        return (
                            <img
                                key={`preload-${nextReel.id}`}
                                src={`https://img.youtube.com/vi/${nextVid}/hqdefault.jpg`}
                                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
                                alt=""
                            />
                        );
                    } else {
                        return <link key={`preload-${nextReel.id}`} rel="preload" href={nextUrl} as="video" />;
                    }
                })}

                {/* Play Button Overlay - visible when explicitly paused (ytReady suppresses it during autoplay startup) */}
                {paused && ytReady && !ytError && (
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

                {/* YouTube Error Overlay — Age-restricted / unavailable video */}
                {ytError && (() => {
                    const videoUrl = currentReel?.video_url;
                    const videoId = getYouTubeVideoId(videoUrl);
                    return (
                        <YouTubeErrorOverlay
                            errorCode={ytError}
                            videoId={videoId}
                            videoUrl={videoUrl}
                            thumbnailUrl={videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null}
                            actionLabel="Skipping in 3 seconds..."
                            style={{ pointerEvents: 'auto' }}
                        />
                    );
                })()}

                {/* Author overlay */}
                <div style={{
                    position: 'absolute', bottom: 80, left: 16, right: 16,
                    pointerEvents: showOverlay ? 'auto' : 'none',
                    opacity: showOverlay ? 1 : 0, transition: 'opacity 0.3s ease',
                }}>
                    <Link href={`/hub/user/${currentReel.profiles?.username}`} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        textDecoration: 'none', marginBottom: 12,
                    }}>
                        <img
                            src={currentReel.profiles?.avatar_url || '/default-avatar.png'}
                            alt={currentReel.profiles?.username || 'User'}
                            style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid white' }}
                        />
                        <div>
                            <div style={{ color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>{currentReel.profiles?.full_name || currentReel.profiles?.username}</span>
                                {watchedReelIds.includes(currentReel?.id) && (
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
                                        background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: 4, backdropFilter: 'blur(4px)',
                                    }}>Watched</span>
                                )}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                                {timeAgo(currentReel.created_at)}
                            </div>
                        </div>
                    </Link>
                    {/* Follow button - only for other users' reels */}
                    {currentReel.author_id && authUser?.id && currentReel.author_id !== authUser.id && (
                        <button onClick={(e) => { e.stopPropagation(); handleFollow(); }} style={{
                            padding: '4px 14px', borderRadius: 6,
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

                {/* Right Action Sidebar - hidden by default, shown on tap */}
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        position: 'absolute', right: 12, bottom: 110, zIndex: 20,
                        display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center',
                        opacity: showOverlay ? 1 : 0, transition: 'opacity 0.3s ease',
                        pointerEvents: showOverlay ? 'auto' : 'none',
                    }}
                >
                    {/* Heart - tap to like, long-press for reactions */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => {
                                handleLike();
                                if (!liked[currentReel.id]) {
                                    // BUG FIX (RFC-9): cancel previous heart timer, use tracked ref
                                    setShowHeart(true);
                                    if (showHeartTimerRef.current) clearTimeout(showHeartTimerRef.current);
                                    showHeartTimerRef.current = setTimeout(() => { showHeartTimerRef.current = null; setShowHeart(false); }, 800);
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
                            aria-label={liked[currentReel.id] ? 'Unlike' : 'Like'}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                            }}
                        >
                            <svg width="32" height="32" viewBox="0 0 24 24" fill={liked[currentReel.id] ? '#ef4444' : 'none'} stroke={liked[currentReel.id] ? '#ef4444' : 'white'} strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))', transition: 'transform 0.15s ease' }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                            <span style={{
                                color: 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                                transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                transform: likeBounceId === currentReel.id ? 'scale(1.4)' : 'scale(1)',
                                display: 'inline-block',
                            }}>
                                {likeCounts[currentReel.id] || 0}
                            </span>
                        </button>
                        {/* Reaction Picker - appears on long-press */}
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
                                        // BUG FIX (RFC-9): use showHeartTimerRef for all reaction-picker heart animations
                                        const triggerHeart = () => { if (!liked[currentReel.id]) { setShowHeart(true); if (showHeartTimerRef.current) clearTimeout(showHeartTimerRef.current); showHeartTimerRef.current = setTimeout(() => { showHeartTimerRef.current = null; setShowHeart(false); }, 800); } };
                                        if (r.type === 'like') { handleLike(); triggerHeart(); }
                                        else if (r.type === 'dislike') handleDislike();
                                        else { handleLike(); triggerHeart(); }
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
                    <button onClick={handleToggleComments} aria-label="Comments" style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                        <span style={{ color: showComments ? '#1877F2' : 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            {commentCounts[currentReel.id] || 0}
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
                    <button onClick={handleSave} aria-label={saved[currentReel.id] ? 'Unsave' : 'Save'} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill={saved[currentReel.id] ? 'white' : 'none'} stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                        <span style={{ color: 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            {saved[currentReel.id] ? 'Saved' : 'Save'}
                        </span>
                    </button>

                    {/* More (···) - opens panel with Sound, Report, Speed, Link */}
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
                                <button onClick={() => { setMuted(prev => { const next = !prev; sendYTCmd(next ? 'mute' : 'unMute'); if (!next) sendYTCmd('setVolume', [100]); userWantsSoundRef.current = !next; return next; }); setShowMoreMenu(false); }} style={{
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
                                        // BUG FIX (RFC-10): cancel previous copyToast timer before starting a new one.
                                        setCopyToast(true);
                                        if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
                                        copyToastTimerRef.current = setTimeout(() => { copyToastTimerRef.current = null; setCopyToast(false); }, 2000);
                                    }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                                    setShowMoreMenu(false);
                                }} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px',
                                    background: 'none', border: 'none', color: 'white', fontSize: 14, cursor: 'pointer', textAlign: 'left',
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
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

                {/* Double-tap heart burst */}
                {showHeart && (
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: 80, pointerEvents: 'none', zIndex: 25,
                        animation: 'heartBurst 0.8s ease-out forwards',
                    }}>❤️</div>
                )}

                {/* Progress bar for native videos - rail always rendered, fill tracks playback */}
                {!isYouTubeUrl(currentReel.video_url) && (
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: 3, background: 'rgba(255,255,255,0.15)', zIndex: 25,
                    }}>
                        <div style={{
                            width: `${progress}%`, height: '100%',
                            background: 'linear-gradient(90deg, #FF2D55, #FF6B6B)',
                            transition: 'width 0.1s linear',
                            willChange: 'width',
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
                                <svg width="20" height="20" viewBox="0 0 24 24" fill={saved[currentReel?.id] ? 'white' : 'none'} stroke="white" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                                {saved[currentReel?.id] ? 'Unsave' : 'Save Reel'}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); handleShare(); }} style={{
                                background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                                padding: '16px 20px', color: 'white', fontSize: 16, fontWeight: 600, textAlign: 'left',
                                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                                Share / Repost
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); setShowReportModal(true); }} style={{
                                background: 'transparent', border: 'none',
                                padding: '16px 20px', color: '#ff3b30', fontSize: 16, fontWeight: 600, textAlign: 'left',
                                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
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
                                    <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg> Shared to My Feed!</>
                                ) : sharingToFeed ? 'Sharing...' : (
                                    <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg> Share to My Feed</>
                                )}
                            </button>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', marginBottom: 10, fontWeight: 500 }}>OR SHARE EXTERNALLY</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                {[{ id: 'copy', label: 'Copy Link', color: '#00d4ff' }, { id: 'x', label: 'X', color: '#fff' }, { id: 'facebook', label: 'Facebook', color: '#1877F2' }, { id: 'whatsapp', label: 'WhatsApp', color: '#25D366' }].map(p => (
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
                <style>{`
                    @keyframes heartBurst {
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
                                {/* Phase 8 - Sort toggle */}
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
                                    <img src={c.profiles?.avatar_url || '/default-avatar.png'} alt={c.profiles?.username || 'User'} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                                    <div style={{ flex: 1 }}>
                                        <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 600 }}>{c.profiles?.username || 'User'}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 8 }}>{c.created_at ? timeAgo(c.created_at) : ''}</span>
                                        {/* Phase 7 - Inline edit mode */}
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
                                        {/* Phase 6+7 - Comment engagement row */}
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
                            {/* #6 Comment Pagination - Load More */}
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
                        {/* Phase 8 - Character counter */}
                        {commentText.length > 0 && (
                            <div style={{ textAlign: 'right', fontSize: 10, color: commentText.length >= COMMENT_MAX_LENGTH - 20 ? '#ef4444' : 'rgba(255,255,255,0.3)', paddingRight: 16, paddingBottom: 4 }}>
                                {commentText.length}/{COMMENT_MAX_LENGTH}
                            </div>
                        )}
                    </div>
                )}

                {/* Phase 8 - Copy Link Toast */}
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
    const [loadError, setLoadError] = useState(false);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerStartIndex, setViewerStartIndex] = useState(0);
    const scrollRef = useRef(null);
    // Tracks first vs subsequent loads — background refreshes skip the loading skeleton
    const isInitialLoadRef = useRef(true);
    // Debounce ref: collapses burst Realtime INSERTs into a single reload
    const reloadDebounceRef = useRef(null);

    const loadReels = useCallback(async (isBackground = false) => {
        // Background refresh (triggered by Realtime): don't flash the loading skeleton.
        // Only the very first load should show the shimmer placeholder.
        if (!isBackground) setLoading(true);
        try {
            // M7.1 (2026-05-03): retired the social_posts fallback. Every public
            // video post now has a social_reels mirror via the
            // trg_social_posts_video_to_reel_mirror trigger, so a separate
            // social_posts query produced duplicates rather than fresh content
            // (and the dedup-by-video_url filter dropped the iframe variant
            // anyway, making the work pure waste). All reel content surfaces
            // through social_reels now — including horse-posted videos.
            const reelsResult = await supabase
                .from('social_reels')
                .select(`
                    id, author_id, caption, video_url, thumbnail_url, view_count, like_count, comment_count, created_at, is_public, source_type, source_post_id,
                    profiles:author_id (id, username, avatar_url, full_name)
                `)
                .eq('is_public', true)
                .order('created_at', { ascending: false })
                .limit(50);

            const rawReels = reelsResult.data || [];
            // Dedup by video_url — multiple horses can post the SAME YouTube
            // clip, each landing as its own social_reels row via the mirror
            // trigger. Without this filter the carousel renders the same clip
            // up to 169 times in a row.
            const seenUrls = new Set();
            const allReels = rawReels.filter(r => {
                if (!r.video_url) return true;
                if (seenUrls.has(r.video_url)) return false;
                seenUrls.add(r.video_url);
                return true;
            }).map(r => ({ ...r, source: 'reels' }));

            // Sort merged set by date descending
            allReels.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            setReels(allReels);
            setLoadError(false);
        } catch (e) {
            console.warn('Load reels error:', e);
            setLoadError(true);
        }
        isInitialLoadRef.current = false;
        setLoading(false);
    }, []);

    // Initial load + Realtime subscriptions
    useEffect(() => {
        loadReels();

        // Unique channel name prevents duplicate subscriptions in React StrictMode
        // (double-invoke of useEffect in dev would create two channels with the same
        // static name, causing loadReels() to fire twice per INSERT event).
        // Debounced background reload: two rapid INSERTs collapse into one fetch.
        const debouncedReload = () => {
            if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
            reloadDebounceRef.current = setTimeout(() => loadReels(true), 400);
        };
        const _ch = supabase
            .channel(`reels-feed-carousel-${Math.random().toString(36).slice(2, 8)}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_reels' }, debouncedReload)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_posts' }, debouncedReload)
            // M7.4: surgical UPDATE handler for worker conversion broadcasts.
            // Only acts when video_url actually changed; ignores like/comment UPDATEs.
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'social_reels' }, (payload) => {
                const next = payload?.new;
                if (!next?.id) return;
                setReels(prev => prev.map(r => {
                    if (r.id !== next.id) return r;
                    if (r.video_url === next.video_url) return r;
                    return { ...r, video_url: next.video_url, source_type: next.source_type, thumbnail_url: next.thumbnail_url || r.thumbnail_url };
                }));
            })
            .subscribe();

        const handleDataMutated = (event) => {
            if (event?.payload === 'social' || event?.payload === 'reels') {
                // EventBus-triggered reload is also a background refresh
                if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
                reloadDebounceRef.current = setTimeout(() => loadReels(true), 400);
            }
        };
        eventBus.on(EventType.DATA_MUTATED, handleDataMutated);

        return () => {
            if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
            supabase.removeChannel(_ch);
            eventBus.off(EventType.DATA_MUTATED, handleDataMutated);
        };
    }, [loadReels]);

    const openViewer = (index) => {
        setViewerStartIndex(index);
        setViewerOpen(true);
    };

    // Don't render if no reels
    if (!loading && reels.length === 0) return null;

    // Loading state - skeleton shimmer
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
                            background: C.border, flexShrink: 0,
                            animation: 'pulse 1.5s ease-in-out infinite',
                        }} />
                    ))}
                </div>
            </div>
        );
    }

    // Error state with retry
    if (loadError) {
        return (
            <div style={{
                background: C.card, borderRadius: 8, padding: 16,
                marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                textAlign: 'center',
            }}>
                <div style={{ color: C.textSec, fontSize: 13, marginBottom: 8 }}>Could not load reels</div>
                <button
                    onClick={() => loadReels()}
                    style={{
                        background: C.blue, color: 'white', border: 'none', borderRadius: 20,
                        padding: '6px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                >Retry</button>
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
            <style>{`
                .reels-carousel::-webkit-scrollbar { display: none; }
            `}</style>
        </>
    );
}

export default ReelsFeedCarousel;
