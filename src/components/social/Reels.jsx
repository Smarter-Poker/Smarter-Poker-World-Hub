/**
 * REELS COMPONENT - SmarterPoker-style permanent video archive
 * Videos from Stories are saved here permanently
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { prefetchVideoStart } from '../../lib/reelsPrefetcher';
import {
  YouTubeErrorOverlay,
  reportFailureToServer,
  reportToSentry,
} from '../../hooks/useYouTubeErrorManager';
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
      console.warn('[ReelsViewer] Atomic counter update failed:', e?.message || e);
    }
  };

  const [reels, setReels] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [muted, setMuted] = useState(true); // Start MUTED for mobile autoplay compliance — unmute after playback confirmed
  const [paused, setPaused] = useState(true); // Start true — autoplay may fail, first tap should send playVideo
  const [ytReady, setYtReady] = useState(false); // True once YouTube fires first onStateChange — suppresses phantom play button during autoplay startup
  const [ytError, setYtError] = useState(null); // YouTube embed error code (150=age-restricted, 100=not found)
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

  // Anti-Drift: Preserve viewed reel when new reels are inserted above it
  const prevReelIdRef = useRef(null);
  useEffect(() => {
    if (!reels || reels.length === 0) return;
    const currentReelId = reels[currentIndex]?.id;

    if (prevReelIdRef.current && currentReelId !== prevReelIdRef.current) {
      // reels array changed under us! Find where our reel moved to.
      const newIndex = reels.findIndex((r) => r.id === prevReelIdRef.current);
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
  // Named distinctly from the swipe useEffect's local handleTouchStart to prevent shadowing
  const [showContextMenu, setShowContextMenu] = useState(false);
  const longPressTimerRef = useRef(null);
  const handleLongPressTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      try {
        navigator?.vibrate?.(20);
      } catch (err) {
        console.warn('[ReelsViewer] vibrate failed:', err);
      }
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
        try {
          setWatchedReelIds(JSON.parse(stored));
        } catch (e) {
          console.warn('Handled exception:', e);
        }
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
  const ytIframeRef = useRef(null); // Persistent YouTube iframe ref
  // userInteractedRef is session-sticky: once any user gesture happens (click,
  // keydown, wheel, touchstart, pointerdown) we record it in sessionStorage so
  // re-renders, slot transitions, and even client-side route changes within the
  // same tab keep "user has gestured" = true. This is the gate that lets video
  // elements unmute themselves automatically without forcing the user to click
  // again on every new slot.
  const userInteractedRef = useRef(
    typeof window !== 'undefined' && window.sessionStorage?.getItem('sp:reels:interacted') === '1'
  );
  // Stricter than userInteractedRef: only true when a gesture happens on
  // THIS page load. Browsers gate autoplay-with-sound per-document, so the
  // sessionStorage-backed userInteractedRef can be true on reload without
  // any fresh gesture context. YT iframe unMute postMessage is silently
  // rejected in that state. Use this ref (NOT userInteractedRef) for
  // slot-transition setMuted(false) gates so React state never lies about
  // being unmuted while the YT player is actually still muted.
  const userGesturedThisLoadRef = useRef(false);
  const userWantsSoundRef = useRef(true); // User sound preference — persists across reel changes
  const onLoadRetryTimersRef = useRef([]); // Cancelled on reel change to avoid stale-iframe commands
  // Stall watchdog (parity with /hub/reels): cleared on onPlaying / onLoadedMetadata.
  // If neither fires within 6s of a native reel becoming active, the URL is
  // treated as broken/undecodable (most often HEVC silent-hang on Chrome
  // desktop) and we auto-advance. YouTube iframes have their own onError
  // path so this ref is only consulted on native <video> elements.
  const videoStallTimerRef = useRef(null);
  // Session-scoped skip set: any video URL whose decode failed (or stalled
  // past the watchdog) is added here so loadReels / loadMoreReels filter it
  // out on the next refresh and the user never sees the same broken reel
  // twice in this tab. Lost on reload (correct — worker may have transcoded
  // the HEVC source by then).
  const brokenUrlsRef = useRef(new Set());
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
  // #4 Not Interested - persist disliked reel IDs in localStorage
  const [notInterestedIds, setNotInterestedIds] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return new Set(JSON.parse(localStorage.getItem('reels-not-interested') || '[]'));
      } catch {
        return new Set();
      }
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
  // #10 Error Toast
  const [errorToast, setErrorToast] = useState(null);
  // BUG FIX (R1): errorToastTimerRef — tracks the dismiss timer so it can be
  // cancelled on unmount and never fires setErrorToast on an unmounted component.
  const errorToastTimerRef = useRef(null);
  const showErrorToast = (msg) => {
    setErrorToast(msg);
    clearTimeout(errorToastTimerRef.current);
    errorToastTimerRef.current = setTimeout(() => setErrorToast(null), 3000);
  };
  // #6 Comment Like Counts
  const [commentLikeCounts, setCommentLikeCounts] = useState({});
  // UX Overhaul - More menu + Reaction picker
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const reactionTimerRef = useRef(null);
  const shareToastTimerRef = useRef(null); // Prevents double-fire if share is re-triggered within 2s
  const sharedToFeedTimerRef = useRef(null); // Prevents setState-after-unmount in handleShareToFeed
  const reportModalTimerRef = useRef(null); // Prevents setState-after-unmount in handleReport
  // BUG FIX (R2): showHeartTimerRef — tracks the 800ms heart-flash timer so it
  // can be cancelled on unmount or on rapid successive like-taps.
  const showHeartTimerRef = useRef(null);
  // BUG FIX (RLXS-1): likeBounceTimerRef — tracks the 400ms like-count bounce so
  // rapid double-taps don't accumulate orphan timers.
  const likeBounceTimerRef = useRef(null);
  // BUG FIX (RLXS-2): commentFocusTimerRef — prevents focus() on unmounted input.
  const commentFocusTimerRef = useRef(null);
  // BUG FIX (RLXS-4): copyToastTimerRef — prevents setState-after-unmount on copy-link dismiss.
  const copyToastTimerRef = useRef(null);

  useEffect(() => {
    loadReels();
    const user = getAuthUser();
    if (user?.id) {
      setCurrentUserId(user.id);
      // IMPROVEMENT: parallelized from 4 serial .then() chains → one Promise.all()
      // Cuts initial user-state hydration latency by ~3x (sequential 4×50ms → ~60ms parallel)
      Promise.all([
        supabase
          .from('social_likes')
          .select('post_id, reaction_type')
          .eq('user_id', user.id)
          .in('reaction_type', ['like', 'dislike']),
        supabase
          .from('social_interactions')
          .select('post_id')
          .eq('user_id', user.id)
          .eq('interaction_type', 'bookmark'),
        supabase.from('social_follows').select('following_id').eq('follower_id', user.id),
      ])
        .then(([likesRes, bookmarksRes, followsRes]) => {
          if (likesRes.data) {
            const likeMap = {},
              dislikeMap = {};
            likesRes.data.forEach((row) => {
              if (row.reaction_type === 'like') likeMap[row.post_id] = true;
              else if (row.reaction_type === 'dislike') dislikeMap[row.post_id] = true;
            });
            setLiked(likeMap);
            setDisliked(dislikeMap);
          }
          if (bookmarksRes.data) {
            const saveMap = {};
            bookmarksRes.data.forEach((row) => {
              saveMap[row.post_id] = true;
            });
            setSaved(saveMap);
          }
          if (followsRes.data) {
            const followMap = {};
            followsRes.data.forEach((row) => {
              followMap[row.following_id] = true;
            });
            setFollowing(followMap);
          }
        })
        .catch((e) => console.warn('[ReelsViewer] User state hydration failed:', e?.message));
    }
  }, []);

  // EventBus listeners - sync like/bookmark from other viewers
  useEffect(() => {
    const handleLikeBus = (event) => {
      const d = event?.payload;
      if (d?.postId) {
        // Only update count for OTHER users to avoid conflicting with optimistic update
        if (d.userId !== currentUserId) {
          setLikeCounts((prev) => ({
            ...prev,
            [d.postId]: Math.max(0, (prev[d.postId] || 0) + (d.added ? 1 : -1)),
          }));
        }
      }
    };
    const handleBookmarkBus = (event) => {
      const d = event?.payload;
      if (d?.postId) setSaved((prev) => ({ ...prev, [d.postId]: d.added }));
    };
    const handleCommentBus = (event) => {
      const d = event?.payload;
      if (d?.postId) {
        setCommentCounts((prev) => ({
          ...prev,
          [d.postId]: Math.max(0, (prev[d.postId] || 0) + (d.removed ? -1 : 1)),
        }));
      }
    };
    const handleFollowBus = (event) => {
      const d = event?.payload;
      if (d?.followedId && d?.followerId !== currentUserId) {
        setFollowing((prev) => ({ ...prev, [d.followedId]: d.added }));
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

  // Realtime subscription - live updates when new reels are posted
  // Debounced to 3s to batch rapid inserts and avoid feed-flash
  useEffect(() => {
    if (!currentUserId) return;
    let reloadTimer = null;
    const _ch = supabase
      .channel(`reels-viewer:${currentUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_reels' }, () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          loadReels();
        }, 3000);
      })
      // M7.4: surgical UPDATE handler. When the YT worker converts a reel
      // and broadcasts the new Supabase URL to siblings (UPDATE), swap state
      // in place so mid-session viewers see the native player without
      // a full reload. Only acts when video_url actually changed; ignores
      // like_count / view_count / comment_count UPDATE noise.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'social_reels' },
        (payload) => {
          const next = payload?.new;
          if (!next?.id) return;
          setReels((prev) =>
            prev.map((r) => {
              if (r.id !== next.id) return r;
              if (r.video_url === next.video_url) return r;
              return {
                ...r,
                video_url: next.video_url,
                source_type: next.source_type,
                media_status: next.media_status,
                thumbnail_url: next.thumbnail_url || r.thumbnail_url,
              };
            })
          );
        }
      )
      .subscribe();
    return () => {
      clearTimeout(reloadTimer);
      supabase.removeChannel(_ch);
    };
  }, [currentUserId]);

  // YouTube auto-advance & state tracking: listen for onStateChange postMessage
  useEffect(() => {
    const YOUTUBE_ORIGINS = [
      'https://www.youtube-nocookie.com',
      'https://www.youtube.com',
      'https://youtube.com',
    ];
    const handleYTMessage = (event) => {
      if (!YOUTUBE_ORIGINS.includes(event.origin)) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.event === 'onStateChange') {
          if (data.info === 0) goNextRef.current?.(); // Video ended → auto advance (ref-routed, see TDZ fix below)
          if (data.info === 1) {
            // Playing
            setYtReady(true);
            setPaused(false);
            setYtError(null);
            setShowOverlay(true);
            clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
            // Auto-unmute — swipe IS a user gesture, so unMute is always valid here
            if (userWantsSoundRef.current) {
              autoUnmute();
            }
          }
          if (data.info === 2) {
            // Paused
            setYtReady(true);
            setPaused(true);
            setShowOverlay(true);
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
          }
        }
        if (data?.event === 'onError' && data?.info) {
          const errCode = Number(data.info);
          setYtError(errCode);
          // Report to server + Sentry (best-effort)
          try {
            const vid = getYouTubeVideoId(reels[currentIndex]?.video_url);
            if (vid) {
              reportFailureToServer(vid, errCode, 'Reels');
              reportToSentry(vid, errCode, 'Reels');
            }
          } catch {
            /* best-effort */
          }
        }
      } catch {
        /* not a YouTube message */
      }
    };
    window.addEventListener('message', handleYTMessage);
    return () => window.removeEventListener('message', handleYTMessage);
    // BUG FIX (revised 2026-05-11): the prior version had `[currentIndex, goNext]`
    // in the dep array, but `const goNext = useCallback(...)` is declared ~400
    // lines below — referencing it here put it in the TDZ and crashed the viewer
    // on mount with `ReferenceError: Cannot access 'goNext' before initialization`.
    // Same class of bug as the `isYouTubeUrl` crash on /hub/reels (fixed PR #353).
    // Fixed: read goNext through goNextRef (set just below the useCallback so it
    // always has the current binding by the time the listener fires). Effect deps
    // shrunk to [currentIndex] — handler closure reads ref.current at call time,
    // so freshness is preserved without TDZ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Stable ref to goNext so the YT message handler above can read the current
  // binding without putting goNext in its dep array (which would TDZ — see comment
  // above). Updated by the effect just after the useCallback declaration so it
  // always points at the latest closure.
  const goNextRef = useRef(null);

  // Reset paused state when changing reels + track view
  // dep: currentIndex ONLY - we do NOT add `reels` because setReels() alone
  // should NOT trigger a play() call (the video key changes, element remounts)
  useEffect(() => {
    setPaused(true); // New reel starts as paused — autoplay may fail, first tap should send playVideo
    setYtReady(false); // Reset — suppress play button until YT fires onStateChange for new video
    setShowOverlay(false);
    setProgress(0);
    setYtError(null); // Clear YouTube error state on reel change

    // Cancel pending onLoad retry timers from the previous reel's iframe.onLoad.
    // The key prop causes the iframe to remount on index change, but the old
    // timers still fire and send commands to the NEW iframe prematurely.
    onLoadRetryTimersRef.current.forEach((t) => clearTimeout(t));
    onLoadRetryTimersRef.current = [];

    // Mobile fallback: iOS Safari may never fire onStateChange via postMessage.
    // If ytReady is still false after 5s, force it true so the play button appears.
    const ytReadyFallback = setTimeout(() => setYtReady(true), 5000);

    // Cancel any running RAF from the previous reel immediately
    if (progressRAF.current) {
      cancelAnimationFrame(progressRAF.current);
      progressRAF.current = null;
    }

    // Deduplicated view count — defer 2s so rapid swipes don't inflate counts
    const reelId = reels[currentIndex]?.id;
    const viewCountTimer =
      reelId && currentUserId && !viewedReelsRef.current.has(reelId)
        ? setTimeout(() => {
            viewedReelsRef.current.add(reelId);
            setViewCounts((prev) => ({
              ...prev,
              [reelId]: (prev[reelId] || reels[currentIndex]?.view_count || 0) + 1,
            }));
            incrementMetric(reels[currentIndex], 'view_count', 1);
          }, 2000)
        : null;

    // Native video autoplay — only for non-YouTube reels
    const reel = reels[currentIndex];
    const isNativeVideo = reel && !isYouTubeUrl(reel.video_url);
    const video = isNativeVideo ? videoRef.current : null;
    if (!video)
      return () => {
        clearTimeout(ytReadyFallback);
        clearTimeout(viewCountTimer);
      };
    // For native video, set ytReady immediately when play starts
    const onPlay = () => setYtReady(true);
    video.addEventListener('play', onPlay, { once: true });
    const onCanPlay = () => {
      const p = video.play();
      if (p !== undefined)
        p.catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
    };
    if (video.readyState >= 3) {
      const p = video.play();
      if (p !== undefined)
        p.catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
    } else {
      video.addEventListener('canplay', onCanPlay, { once: true });
    }
    return () => {
      clearTimeout(ytReadyFallback);
      clearTimeout(viewCountTimer);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('play', onPlay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Auto-unmute helper — called from onStateChange(1), goNext, goPrev, swipe
  // handlers, iframe onLoad, and IntersectionObserver. Only fires once a user
  // gesture has been captured anywhere in the tab session (see the global
  // gesture-capture effect above). YouTube's iframe API ignores unMute
  // postMessage when there's no gesture context, so this gate prevents
  // wasted commands and matches the native-video onPlaying path.
  const autoUnmute = () => {
    if (!userWantsSoundRef.current) return;
    if (!userInteractedRef.current) return; // wait for gesture; first reel stays muted until user touches anything
    sendYTCmd('unMute');
    sendYTCmd('setVolume', [100]);
    // Only flip React state if a gesture happened on THIS page load.
    // YT iframe is cross-origin so we cannot verify the unMute landed;
    // when sessionStorage='1' but no fresh gesture exists, YT silently
    // rejects unMute and React state would lie about being unmuted.
    if (userGesturedThisLoadRef.current) {
      setMuted(false);
    }
    if (videoRef.current) {
      try {
        videoRef.current.muted = false;
        if (videoRef.current.volume === 0) videoRef.current.volume = 1.0;
      } catch (_) {}
    }
  };

  // Haptic helper
  const haptic = (ms = 10) => {
    try {
      navigator?.vibrate?.(ms);
    } catch (e) {
      console.warn('Handled exception:', e);
    }
  };

  // Auto-advance on YouTube error after 3 seconds
  useEffect(() => {
    if (!ytError) return;
    const timer = setTimeout(() => {
      setCurrentIndex((prev) => {
        if (prev < reels.length - 1) return prev + 1;
        return prev;
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [ytError, reels.length]);

  // Reveal overlay with 2.5s auto-hide timer
  const revealOverlay = () => {
    setShowOverlay(true);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
  };

  // Save/Bookmark handler
  const handleSave = async () => {
    if (!currentReel?.id || !currentUserId) return;
    const wasSaved = saved[currentReel.id];
    setSaved((prev) => ({ ...prev, [currentReel.id]: !prev[currentReel.id] }));
    haptic(wasSaved ? 5 : 15);
    try {
      if (wasSaved) {
        await supabase
          .from('social_interactions')
          .delete()
          .eq('post_id', currentReel.id)
          .eq('user_id', currentUserId)
          .eq('interaction_type', 'bookmark');
      } else {
        // BUG FIX (Bug 31): removed redundant DELETE before INSERT on save path
        // Old: always deleted first even when not saved (wasteful extra roundtrip)
        await supabase.from('social_interactions').insert({
          post_id: currentReel.id,
          user_id: currentUserId,
          interaction_type: 'bookmark',
        });
      }
      busEmit.socialPostBookmarked(currentReel.id, currentUserId, { added: !wasSaved });
    } catch {
      setSaved((prev) => ({ ...prev, [currentReel.id]: wasSaved }));
      showErrorToast('Save failed - try again');
    }
  };

  const handleReport = async () => {
    if (!currentReel?.id || !currentUserId || !reportReason.trim()) return;
    try {
      const { error } = await supabase.from('social_interactions').insert({
        user_id: currentUserId,
        post_id: currentReel.id,
        interaction_type: 'report',
        metadata: { reason: reportReason.trim() },
      });
      // BUG FIX: do NOT show success UI if the insert failed silently
      if (error) throw error;
      setReportSubmitted(true);
      clearTimeout(reportModalTimerRef.current);
      reportModalTimerRef.current = setTimeout(() => {
        setShowReportModal(false);
        setReportSubmitted(false);
        setReportReason('');
      }, 2000);
    } catch {
      showErrorToast('Report failed \u2014 please try again');
    }
  };

  const handleFollow = async () => {
    const authorId = currentReel?.author_id || currentReel?.profiles?.id;
    if (!authorId || !currentUserId || authorId === currentUserId) return;
    const wasFollowing = following[authorId];
    setFollowing((prev) => ({ ...prev, [authorId]: !prev[authorId] }));
    haptic(wasFollowing ? 5 : 15);
    try {
      if (wasFollowing) {
        await supabase
          .from('social_follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', authorId);
      } else {
        await supabase
          .from('social_follows')
          .insert({ follower_id: currentUserId, following_id: authorId });
      }
      busEmit.socialFollowChanged &&
        busEmit.socialFollowChanged(authorId, currentUserId, { added: !wasFollowing });
    } catch {
      setFollowing((prev) => ({ ...prev, [authorId]: wasFollowing }));
      showErrorToast('Follow failed \u2014 try again');
    }
  };

  // Auto-hide overlay after 2.5 seconds — but NOT when video is paused
  // BUG FIX: Previously this useEffect unconditionally restarted the auto-hide timer
  // whenever showOverlay became true, overriding the timer cancellation in handleTap
  // when pausing. Now it respects paused state to keep the HUD anchored.
  useEffect(() => {
    if (showOverlay && !paused) {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
    }
    return () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, [showOverlay, paused]);

  // Lock body scroll while ReelsViewer is mounted — class-based so CSS desktop
  // failsafe in index.css can permit scroll on all OTHER pages.
  useEffect(() => {
    document.body.classList.add('reels-lock');
    document.documentElement.classList.add('reels-lock');
    return () => {
      document.body.classList.remove('reels-lock');
      document.documentElement.classList.remove('reels-lock');
      // Also clear any legacy inline styles for safety
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.touchAction = '';
      document.documentElement.style.overflow = '';
      // Cancel all pending UI timers to avoid setState-after-unmount
      clearTimeout(shareToastTimerRef.current);
      clearTimeout(sharedToFeedTimerRef.current);
      clearTimeout(reportModalTimerRef.current);
      // R1+R2: also cancel error toast and heart-flash timers
      clearTimeout(errorToastTimerRef.current);
      clearTimeout(showHeartTimerRef.current);
      // RLXS-1/2: cancel bounce and focus timers
      clearTimeout(likeBounceTimerRef.current);
      clearTimeout(commentFocusTimerRef.current);
      // RLXS-4: cancel copy-link toast timer
      clearTimeout(copyToastTimerRef.current);
      // WH-6 BUG FIX: cancel any pending interaction retry batch
      if (onLoadRetryTimersRef.current) {
        onLoadRetryTimersRef.current.forEach((t) => clearTimeout(t));
        onLoadRetryTimersRef.current = [];
      }
    };
  }, []);

  const loadReels = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      // 3-source fetch - interleaved to prevent any single source monopolizing the feed
      // BUG FIX: single query ordered by created_at filled the 100-slot limit with only
      // video_library reels (newest timestamps) or only user reels, depending on timing.
      // Solution: fetch each source separately then interleave 2:1 (user:library).
      const REEL_SELECT = `id, author_id, caption, video_url, thumbnail_url, view_count, like_count, comment_count, created_at, is_public, source_type, profiles:author_id (id, username, avatar_url, full_name)`;

      // M7 (2026-05-03): postsResult removed. Every public video post in
      // social_posts now has a social_reels mirror via the new
      // trg_social_posts_video_to_reel_mirror trigger, so a separate
      // social_posts query produces duplicates rather than fresh content.
      // Horse-posted videos surface via the new horseResult slot below
      // (source_type IN ('youtube','native') with source_post_id set).
      const [userResult, libraryResult, horseResult] = await Promise.all([
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
        // Slot C: Horse-posted reels (from social_posts via trigger mirror)
        // includes both 'youtube' (still iframe while queue drains) and
        // 'native' (already converted to Supabase MP4)
        supabase
          .from('social_reels')
          .select(REEL_SELECT)
          .eq('is_public', true)
          .in('source_type', ['youtube', 'native'])
          .not('source_post_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(60),
      ]);

      const userReels = userResult.data || [];
      const libReels = libraryResult.data || [];
      const horseReels = (horseResult.data || []).map((r) => ({ ...r, source: 'reels' }));

      // Interleave 2 user reels + 1 library reel + sprinkle horse content
      const interleaved = [];
      const maxLen = Math.max(userReels.length, libReels.length, horseReels.length);
      let uIdx = 0,
        lIdx = 0,
        pIdx = 0;
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
        // Splice in a horse-posted reel every 10 items
        if (interleaved.length > 0 && interleaved.length % 10 === 0 && pIdx < horseReels.length) {
          interleaved.push(horseReels[pIdx++]);
        }
      }
      // Append any remaining
      while (uIdx < userReels.length) interleaved.push(userReels[uIdx++]);
      while (lIdx < libReels.length) interleaved.push(libReels[lIdx++]);
      while (pIdx < horseReels.length) interleaved.push(horseReels[pIdx++]);

      // Deduplicate by id AND video_url. Same physical video can land in
      // BOTH social_reels (auto-mirror via source_post_id) AND social_posts
      // — different table IDs, same video. id-only dedup let the same clip
      // render twice. (Bug reported 2026-04-29: V12 upload showed twice in
      // the feed Reels carousel.)
      const idSet = new Set();
      const urlSet = new Set();
      const merged = interleaved.filter((r) => {
        if (r.id && idSet.has(r.id)) return false;
        if (r.video_url && urlSet.has(r.video_url)) return false;
        if (r.id) idSet.add(r.id);
        if (r.video_url) urlSet.add(r.video_url);
        return true;
      });

      // Filter out URLs already known to be broken/undecodable in this tab
      // session (HEVC failures, dead Supabase URLs, corrupt MP4s that hung
      // the watchdog). brokenUrlsRef is session-scoped, lost on reload —
      // which is correct because the worker may have transcoded HEVC by then.
      const broken = brokenUrlsRef.current;
      const filteredMerged =
        broken.size > 0 ? merged.filter((r) => !broken.has(r.video_url)) : merged;

      setReels(filteredMerged);
      const lc = {},
        cc = {},
        vc = {};
      filteredMerged.forEach((r) => {
        lc[r.id] = r.like_count || 0;
        cc[r.id] = r.comment_count || 0;
        vc[r.id] = r.view_count || 0;
      });
      // DB is source of truth on a full reload — DB values win over stale optimistic counts
      setLikeCounts((prev) => ({ ...prev, ...lc }));
      setViewCounts((prev) => ({ ...prev, ...vc }));
      setCommentCounts((prev) => ({ ...prev, ...cc }));
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
      setWatchedReelIds((prev) => {
        if (prev.includes(currentReel.id)) return prev;
        const next = [...prev, currentReel.id].slice(-500); // limited to 500
        localStorage.setItem('smarter-reels-watched', JSON.stringify(next));
        return next;
      });
    }, 3000); // Flag watched after 3s
    return () => clearTimeout(watchTimer);
  }, [currentReel?.id]);

  // Helper: send YouTube postMessage command to persistent iframe ref
  const sendYTCmd = useCallback((cmd, args = []) => {
    const iframe = ytIframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: cmd, args }), '*');
    }
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= reels.length - 1) return prev;
      if (prev >= reels.length - 4 && hasMore && !loadingMore) loadMoreReels();
      const next = prev + 1;
      requestAnimationFrame(() => {
        containerRef.current
          ?.querySelector(`[data-reel-index="${next}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return next;
    });
  }, [reels.length, hasMore, loadingMore]);

  // Keep the YT message handler's ref-routed goNext call (see TDZ comment ~400
  // lines above) pointed at the freshest binding. Runs after every render that
  // recomputes goNext via useCallback. No deps so it captures the current
  // closure on every render — cheap, no allocation churn.
  useEffect(() => {
    goNextRef.current = goNext;
  });

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev <= 0) return prev;
      const next = prev - 1;
      requestAnimationFrame(() => {
        containerRef.current
          ?.querySelector(`[data-reel-index="${next}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return next;
    });
  }, []);

  // Infinite scroll - load more reels when near end
  const loadMoreReels = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const REEL_SELECT =
        'id, author_id, caption, video_url, thumbnail_url, view_count, like_count, comment_count, created_at, is_public, source_type, profiles:author_id (id, username, avatar_url, full_name)';
      // M7 (2026-05-03): retired the social_posts query — every public
      // video post now has a social_reels mirror, so a separate query
      // produced duplicates. Horse-posted reels surface via the
      // horseRes slot (same pattern as loadReels).
      const [userRes, libRes, horseRes] = await Promise.all([
        supabase
          .from('social_reels')
          .select(REEL_SELECT)
          .eq('is_public', true)
          .eq('source_type', 'user')
          .order('created_at', { ascending: false })
          .range(pageOffset, pageOffset + 29),
        supabase
          .from('social_reels')
          .select(REEL_SELECT)
          .eq('is_public', true)
          .eq('source_type', 'video_library')
          .order('created_at', { ascending: false })
          .range(pageOffset, pageOffset + 29),
        supabase
          .from('social_reels')
          .select(REEL_SELECT)
          .eq('is_public', true)
          .in('source_type', ['youtube', 'native'])
          .not('source_post_id', 'is', null)
          .order('created_at', { ascending: false })
          .range(pageOffset, pageOffset + 29),
      ]);
      const horseReels = (horseRes.data || []).map((r) => ({ ...r, source: 'reels' }));

      const reelItems = [
        ...(userRes.data || []).map((r) => ({ ...r, source: 'reels' })),
        ...(libRes.data || []).map((r) => ({ ...r, source: 'reels' })),
      ];
      // Splice a horse reel every 10 items (mirrors loadReels interleave pattern)
      const combined = [];
      let pIdx = 0;
      reelItems.forEach((r, i) => {
        combined.push(r);
        if ((i + 1) % 10 === 0 && pIdx < horseReels.length) combined.push(horseReels[pIdx++]);
      });
      // Append remaining horse reels
      while (pIdx < horseReels.length) combined.push(horseReels[pIdx++]);

      if (combined.length === 0) {
        setHasMore(false);
      } else {
        const existingIds = new Set(reels.map((r) => r.id));
        // AUDIT-5 FIX (2026-04-30): also dedupe by video_url. Same
        // physical video can appear with two different IDs — once
        // from social_reels (auto-mirror via source_post_id) and
        // once from social_posts (the original post the trigger
        // mirrored from). loadReels() at line 609-617 already does
        // this dual dedup; loadMoreReels was only id-deduping, so
        // the duplicate Dan reported on the initial feed re-emerged
        // every time the user scrolled past page 1.
        const existingUrls = new Set(reels.map((r) => r.video_url).filter(Boolean));
        const seenUrlsThisBatch = new Set();
        // BUG FIX (Bug 29): also filter out "not interested" reels from load-more batches
        // loadReels() filtered them, but loadMoreReels() did not - disliked reels re-appeared
        // Same session-scoped broken-URL skip-set used in loadReels — the
        // user must never re-encounter a broken video they already auto-skipped.
        const broken = brokenUrlsRef.current;
        const fresh = combined.filter((r) => {
          if (existingIds.has(r.id)) return false;
          if (notInterestedIds.has(r.id)) return false;
          if (r.video_url) {
            if (existingUrls.has(r.video_url)) return false;
            if (seenUrlsThisBatch.has(r.video_url)) return false;
            if (broken.has(r.video_url)) return false;
            seenUrlsThisBatch.add(r.video_url);
          }
          return true;
        });
        if (fresh.length === 0) {
          setHasMore(false);
        } else {
          const lc = {},
            cc = {},
            vc = {};
          fresh.forEach((r) => {
            lc[r.id] = r.like_count || 0;
            cc[r.id] = r.comment_count || 0;
            vc[r.id] = r.view_count || 0;
          });
          setReels((prev) => [...prev, ...fresh]);
          setLikeCounts((prev) => ({ ...prev, ...lc }));
          setCommentCounts((prev) => ({ ...prev, ...cc }));
          setViewCounts((prev) => ({ ...prev, ...vc }));
          setPageOffset((prev) => prev + 30);
        }
      }
    } catch (e) {
      console.warn('[ReelsViewer] loadMoreReels failed:', e?.message);
    }
    setLoadingMore(false);
  };

  const handleLike = async () => {
    if (!currentReel) return;
    if (likeDebounceRef.current) return;
    likeDebounceRef.current = true;
    setTimeout(() => {
      likeDebounceRef.current = false;
    }, 300);

    // Optimistic UI update - always fire so heart turns red immediately
    const wasLiked = liked[currentReel.id];
    setLiked((prev) => ({ ...prev, [currentReel.id]: !prev[currentReel.id] }));
    setLikeCounts((prev) => ({
      ...prev,
      [currentReel.id]: Math.max(0, (prev[currentReel.id] || 0) + (wasLiked ? -1 : 1)),
    }));
    // #7 Animated Like Counter - trigger bounce
    // BUG FIX (RLXS-1): cancel previous bounce timer before starting a new one.
    setLikeBounceId(currentReel.id);
    if (likeBounceTimerRef.current) clearTimeout(likeBounceTimerRef.current);
    likeBounceTimerRef.current = setTimeout(() => {
      likeBounceTimerRef.current = null;
      setLikeBounceId(null);
    }, 400);

    // Resolve userId fresh to avoid stale closure
    const userId = currentUserId || getAuthUser()?.id;
    if (!userId) return; // No auth - keep optimistic UI but skip DB write

    // Mutual exclusion: remove dislike when liking
    if (!wasLiked && disliked[currentReel.id]) {
      setDisliked((prev) => ({ ...prev, [currentReel.id]: false }));
      try {
        await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', currentReel.id)
          .eq('user_id', userId)
          .eq('reaction_type', 'dislike');
      } catch (e) {
        console.warn('Handled exception:', e);
      }
    }

    try {
      if (wasLiked) {
        // DB trigger (trig_sync_like_count) handles like_count decrement atomically - no RPC needed
        await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', currentReel.id)
          .eq('user_id', userId)
          .eq('reaction_type', 'like');
        busEmit.socialPostLiked(currentReel.id, userId, { added: false, reactionType: 'like' });
      } else {
        // DB trigger (trig_sync_like_count) handles like_count increment atomically - no RPC needed
        await supabase
          .from('social_likes')
          .insert({ post_id: currentReel.id, user_id: userId, reaction_type: 'like' });
        busEmit.socialPostLiked(currentReel.id, userId, { added: true, reactionType: 'like' });
      }
    } catch (err) {
      console.warn('Reel like persistence failed:', err.message);
      // Roll back optimistic update on failure
      setLiked((prev) => ({ ...prev, [currentReel.id]: wasLiked }));
      setLikeCounts((prev) => ({
        ...prev,
        [currentReel.id]: Math.max(0, (prev[currentReel.id] || 0) + (wasLiked ? 1 : -1)),
      }));
      showErrorToast('Like failed \u2014 try again');
    }
  };

  const handleDislike = async () => {
    if (!currentReel) return;
    if (likeDebounceRef.current) return;
    likeDebounceRef.current = true;
    setTimeout(() => {
      likeDebounceRef.current = false;
    }, 300);

    const wasDisliked = disliked[currentReel.id];
    setDisliked((prev) => ({ ...prev, [currentReel.id]: !prev[currentReel.id] }));
    // Mutual exclusion: remove like when disliking
    if (!wasDisliked && liked[currentReel.id]) {
      setLiked((prev) => ({ ...prev, [currentReel.id]: false }));
      setLikeCounts((prev) => ({
        ...prev,
        [currentReel.id]: Math.max(0, (prev[currentReel.id] || 0) - 1),
      }));
    }

    const userId = currentUserId || getAuthUser()?.id;
    if (!userId) return; // No auth - keep optimistic UI but skip DB write

    // Clean up like from DB if needed
    if (!wasDisliked && liked[currentReel.id]) {
      try {
        await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', currentReel.id)
          .eq('user_id', userId)
          .eq('reaction_type', 'like');
        incrementMetric(currentReel, 'like_count', -1);
      } catch (e) {
        console.warn('Handled exception:', e);
      }
    }

    try {
      if (wasDisliked) {
        const { error } = await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', currentReel.id)
          .eq('user_id', userId)
          .eq('reaction_type', 'dislike');
        if (error) throw error;
        // #4 Not Interested - remove from filter
        setNotInterestedIds((prev) => {
          const n = new Set(prev);
          n.delete(currentReel.id);
          if (typeof window !== 'undefined')
            localStorage.setItem('reels-not-interested', JSON.stringify([...n]));
          return n;
        });
      } else {
        const { error } = await supabase
          .from('social_likes')
          .insert({ post_id: currentReel.id, user_id: userId, reaction_type: 'dislike' });
        if (error) throw error;
        // #4 Not Interested - add to filter
        setNotInterestedIds((prev) => {
          const n = new Set(prev);
          n.add(currentReel.id);
          if (typeof window !== 'undefined')
            localStorage.setItem('reels-not-interested', JSON.stringify([...n]));
          return n;
        });
      }
    } catch {
      // BUG FIX: show error toast on dislike failure (was silently rolling back with no user feedback)
      setDisliked((prev) => ({ ...prev, [currentReel.id]: wasDisliked }));
      if (!wasDisliked && liked[currentReel.id]) {
        setLiked((prev) => ({ ...prev, [currentReel.id]: true }));
        setLikeCounts((prev) => ({ ...prev, [currentReel.id]: (prev[currentReel.id] || 0) + 1 }));
      }
      showErrorToast('Dislike failed \u2014 try again');
    }
  };

  // Comment handler
  const handleOpenComments = async () => {
    // BUG FIX (Bug 24): stale state anti-pattern
    // Old: setShowCommentInput(prev => !prev) then immediately check !showCommentInput
    // This fires the data-fetch branch on BOTH open AND close clicks because
    // showCommentInput holds the PRE-toggle value in the closure.
    // Fix: determine intent from current value BEFORE toggling.
    const isOpening = !showCommentInput;
    setShowCommentInput(isOpening);
    if (isOpening && currentReel?.id) {
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
        // #6 Load comment like counts (totals) AND current user's own hearts
        try {
          const userId = currentUserId || getAuthUser()?.id;
          const [clAllResult, clMyResult] = await Promise.all([
            // Total likes per comment (all users)
            supabase
              .from('social_interactions')
              .select('metadata')
              .eq('post_id', currentReel.id)
              .eq('interaction_type', 'comment_like'),
            // BUG FIX (Bug 20): hydrate own comment hearts so they show filled on open
            userId
              ? supabase
                  .from('social_interactions')
                  .select('metadata')
                  .eq('post_id', currentReel.id)
                  .eq('user_id', userId)
                  .eq('interaction_type', 'comment_like')
              : Promise.resolve({ data: [] }),
          ]);
          const clCounts = {};
          (clAllResult.data || []).forEach((row) => {
            const cid = row.metadata?.comment_id;
            if (cid) clCounts[cid] = (clCounts[cid] || 0) + 1;
          });
          setCommentLikeCounts(clCounts);
          // Hydrate own likes so hearts appear filled
          const myLikes = {};
          (clMyResult.data || []).forEach((row) => {
            const cid = row.metadata?.comment_id;
            if (cid) myLikes[cid] = true;
          });
          if (Object.keys(myLikes).length > 0) {
            setCommentLikes((prev) => ({ ...prev, ...myLikes }));
          }
        } catch (e) {
          console.warn('Handled exception:', e);
        }
      } catch {
        setReelComments([]);
      }
      // BUG FIX (RLXS-2): cancel previous focus timer — prevents focus() on unmounted input.
      if (commentFocusTimerRef.current) clearTimeout(commentFocusTimerRef.current);
      commentFocusTimerRef.current = setTimeout(() => {
        commentFocusTimerRef.current = null;
        commentInputRef.current?.focus();
      }, 100);
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
        setReelComments((prev) => [...prev, ...data]);
        setCommentPage(nextPage);
        setHasMoreComments(data.length >= 50);
      } else {
        setHasMoreComments(false);
      }
    } catch {
      setHasMoreComments(false);
    }
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
    setReelComments((prev) => [
      ...prev,
      {
        id: tempId,
        content: text,
        profiles: { username: 'You', avatar_url: null },
        created_at: new Date().toISOString(),
        media_url: mediaUrl || null,
        media_type: mediaType || null,
        parent_id: parentId,
      },
    ]);
    try {
      // Proxy post creation for reels: if the reel comes from social_reels,
      // create a proxy record in social_posts so the FK on social_comments works.
      if (currentReel.source === 'reels' || !currentReel.source) {
        const { data: existing } = await supabase
          .from('social_posts')
          .select('id')
          .eq('id', currentReel.id)
          .maybeSingle();
        if (!existing) {
          const { error: proxyErr } = await supabase.from('social_posts').insert({
            id: currentReel.id,
            author_id: currentUserId, // RLS requires author_id = auth.uid()
            content: currentReel.caption || '',
            content_type: 'video',
            media_urls: currentReel.video_url ? [currentReel.video_url] : [],
            visibility: 'public',
          });
          if (proxyErr) console.warn('[Reels] Proxy post creation failed:', proxyErr?.message);
        }
      }
      const payload = { post_id: currentReel.id, author_id: currentUserId, content: text || '' };
      if (mediaUrl) {
        payload.media_url = mediaUrl;
        payload.media_type = mediaType;
      }
      if (parentId) {
        payload.parent_id = parentId;
      }
      const { error } = await supabase.from('social_comments').insert(payload);
      if (error) throw error;
      // BUG FIX: guard busEmit call (socialCommentAdded may be undefined in some build configs)
      busEmit.socialCommentAdded && busEmit.socialCommentAdded(currentReel.id, currentUserId);
      // DB trigger (trig_update_reel_comment_count / trig_update_post_comment_count)
      // handles comment_count increment atomically - no RPC needed here
      setCommentCounts((prev) => ({ ...prev, [currentReel.id]: (prev[currentReel.id] || 0) + 1 }));
    } catch {
      setReelComments((prev) => prev.filter((c) => c.id !== tempId));
      showErrorToast('Comment failed — please try again');
    }
  };

  // Phase 6 - Comment like toggle
  const handleCommentLike = async (commentId) => {
    if (!currentUserId) return;
    const wasLiked = commentLikes[commentId];
    setCommentLikes((prev) => ({ ...prev, [commentId]: !wasLiked }));
    // Optimistic comment like count sync
    setCommentLikeCounts((prev) => ({
      ...prev,
      [commentId]: Math.max(0, (prev[commentId] || 0) + (wasLiked ? -1 : 1)),
    }));
    try {
      if (wasLiked) {
        // BUG FIX: .match({ metadata: { comment_id } }) does FULL-OBJECT equality match.
        // If metadata has extra keys it won't match. Use PostgREST JSON path filter instead.
        await supabase
          .from('social_interactions')
          .delete()
          .eq('user_id', currentUserId)
          .eq('post_id', currentReel.id)
          .eq('interaction_type', 'comment_like')
          .eq('metadata->>comment_id', commentId);
      } else {
        await supabase.from('social_interactions').insert({
          user_id: currentUserId,
          post_id: currentReel.id,
          interaction_type: 'comment_like',
          metadata: { comment_id: commentId },
        });
      }
    } catch {
      setCommentLikes((prev) => ({ ...prev, [commentId]: wasLiked }));
      setCommentLikeCounts((prev) => ({
        ...prev,
        [commentId]: Math.max(0, (prev[commentId] || 0) + (wasLiked ? 1 : -1)),
      }));
    }
  };

  // Phase 6 - Delete own comment
  const handleDeleteComment = async (commentId) => {
    if (!currentUserId || !currentReel?.id) return;
    const prev = reelComments;
    setReelComments((c) => c.filter((x) => x.id !== commentId));
    try {
      const { error } = await supabase
        .from('social_comments')
        .delete()
        .eq('id', commentId)
        .eq('author_id', currentUserId);
      if (error) throw error;
      // DB trigger handles comment_count decrement atomically
      setCommentCounts((p) => ({
        ...p,
        [currentReel.id]: Math.max(0, (p[currentReel.id] || 1) - 1),
      }));
      busEmit.socialCommentAdded &&
        busEmit.socialCommentAdded(currentReel.id, currentUserId, { removed: true });
    } catch {
      setReelComments(prev);
    }
  };

  // Phase 7 - Edit own comment
  const handleEditComment = (comment) => {
    setEditingComment(comment.id);
    setEditCommentText(comment.content || '');
  };
  const handleSaveEdit = async (commentId) => {
    if (!editCommentText.trim() || !currentUserId) return;
    const orig = reelComments.find((c) => c.id === commentId);
    setReelComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, content: editCommentText.trim() } : c))
    );
    setEditingComment(null);
    try {
      const { error } = await supabase
        .from('social_comments')
        .update({ content: editCommentText.trim() })
        .eq('id', commentId)
        .eq('author_id', currentUserId);
      if (error) throw error;
    } catch {
      if (orig) setReelComments((prev) => prev.map((c) => (c.id === commentId ? orig : c)));
    }
    setEditCommentText('');
  };

  // Phase 7 - Playback speed toggle (native video)
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
          const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
          uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
          });
        } catch {
          uploadFile = file;
        }
      }
      const formData = new FormData();
      formData.append('image', uploadFile);
      const token = getAccessToken();
      const resp = await fetch('/api/social/upload-comment-image', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const result = await resp.json();
      if (resp.ok && result.success) {
        setReelCommentMediaUrl(result.url);
        setReelCommentMediaType('image');
      }
    } catch (err) {
      console.warn('[ReelComment] Upload error:', err);
    }
    setUploadingReelImage(false);
  };

  // Phase 9: 1-Click Repost Architecture - opens share modal; repost requires explicit user action
  const handleShare = () => {
    if (!currentReel?.id) return;
    haptic(10);
    setShowShareModal(true);
  };

  const shareReelUrl = currentReel
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}/hub/reels?id=${currentReel.id}`
    : '';

  const handleShareAction = async (platform) => {
    setShowShareModal(false);
    const url = shareReelUrl;
    const title = 'Check out this poker reel on Smarter.Poker';
    try {
      if (platform === 'copy') {
        await navigator.clipboard.writeText(url);
        setShareToast(true);
        clearTimeout(shareToastTimerRef.current);
        shareToastTimerRef.current = setTimeout(() => setShareToast(false), 2000);
      } else if (platform === 'native' && navigator.share) {
        await navigator.share({ title, url });
      } else if (platform === 'x') {
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
          '_blank'
        );
      } else if (platform === 'facebook') {
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
          '_blank'
        );
      } else if (platform === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`, '_blank');
      }
      if (platform !== 'copy') incrementMetric(currentReel, 'share_count', 1);
      if (currentUserId) busEmit.socialPostShared(currentReel.id, currentUserId);
    } catch (err) {
      // AUDIT FIX: do NOT show "Link Copied" toast on failures unrelated to clipboard.
      // navigator.share() throws AbortError on user-cancel (not an error) and
      // other errors on share failures. Only show the copy toast for actual copy failures.
      if (platform === 'copy') {
        // Clipboard copy failed — try fallback via selection
        showErrorToast('Copy failed — try again');
      }
      // For native/x/facebook/whatsapp failures, the window.open already fired or
      // navigator.share was cancelled by user; no toast needed.
      console.warn('[Reels] Share action failed:', err?.message || err);
    }
  };

  // Share to My Feed - uses API endpoint to bypass RLS/trigger issues
  const [sharingToFeed, setSharingToFeed] = useState(false);
  const [sharedToFeed, setSharedToFeed] = useState(false);
  const [showShareDescriptionModal, setShowShareDescriptionModal] = useState(false);
  const [shareDescription, setShareDescription] = useState('');

  const openShareDescriptionModal = () => {
    setShowShareModal(false);
    setShareDescription('');
    setShowShareDescriptionModal(true);
  };

  const handleShareToFeed = async (descOverride) => {
    if (!currentReel?.id || !currentUserId || sharingToFeed) return;
    // descOverride allows the skip button to bypass stale shareDescription state
    const descToSend = typeof descOverride === 'string' ? descOverride : shareDescription;
    setSharingToFeed(true);
    setShowShareDescriptionModal(false);
    try {
      const token = getAccessToken();
      const res = await fetch('/api/social/share-reel-to-feed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          reel_id: currentReel.id,
          video_url: currentReel.video_url || null,
          caption: currentReel.caption || '',
          user_description: descToSend.trim() || '',
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Share failed');
      if (result.already_shared) {
        showErrorToast('Already shared this reel!');
      } else {
        incrementMetric(currentReel, 'share_count', 1);
        busEmit.socialPostShared(currentReel.id, currentUserId);
        busEmit.dataMutated('social');
      }
      setSharedToFeed(true);
      clearTimeout(sharedToFeedTimerRef.current);
      sharedToFeedTimerRef.current = setTimeout(() => {
        setSharedToFeed(false);
      }, 3000);
    } catch (err) {
      console.warn('Share to feed failed:', err.message);
      showErrorToast('Share failed \u2014 try again');
    }
    setSharingToFeed(false);
    setShareDescription('');
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
    setShowShareDescriptionModal(false);
    setShareDescription('');
    setSharingToFeed(false);
    setSharedToFeed(false);
  }, [currentIndex]);

  // Keep handler refs fresh for keyboard shortcuts
  const handleDislikeRef = useRef(null);
  handleLikeRef.current = handleLike;
  handleDislikeRef.current = handleDislike;
  handleSaveRef.current = handleSave;
  handleCommentsRef.current = handleOpenComments;

  // ─── Global gesture capture for autoplay-with-sound ─────────────────────
  // Browsers gate unmuted autoplay behind a real user gesture. The earlier
  // we capture the FIRST gesture the better — by the time the
  // IntersectionObserver fires post-scroll, the gesture context has already
  // expired in some browsers. Listening on pointerdown/keydown/wheel/touch
  // catches the gesture synchronously and persists it to sessionStorage so
  // every subsequent slot transition (swipe up/down, arrow key, click) can
  // unmute without re-prompting.
  useEffect(() => {
    // NOTE: do NOT early-return when userInteractedRef.current is already true
    // (from sessionStorage). On a page reload with sessionStorage='1', the
    // sticky flag tells us the user has gestured BEFORE in this tab session,
    // but the BROWSER's autoplay context is per-document — it has not seen
    // a gesture on THIS page load. We must keep listening so we can mark
    // userGesturedThisLoadRef the moment the user gestures again, otherwise
    // slot-transition setMuted(false) calls would fire while YT silently
    // rejects unMute → UI lie. Listeners are cheap.
    const onGesture = () => {
      // Always flip the per-load ref — every gesture refreshes the gate.
      userGesturedThisLoadRef.current = true;
      // Sticky tab-session flag (idempotent after first set).
      if (!userInteractedRef.current) {
        userInteractedRef.current = true;
        try {
          window.sessionStorage?.setItem('sp:reels:interacted', '1');
        } catch (_) {}
      }
      // Immediately unmute the currently active media so the user gets
      // sound on the first video without an extra click. This call IS
      // inside a real gesture event so the browser allows it.
      if (userWantsSoundRef.current) {
        try {
          if (videoRef.current) {
            videoRef.current.muted = false;
            if (videoRef.current.volume === 0) videoRef.current.volume = 1.0;
          }
          sendYTCmd('unMute');
          sendYTCmd('setVolume', [100]);
          setMuted(false);
        } catch (_) {
          /* best-effort */
        }
      }
    };
    const opts = { capture: true, passive: true, once: false };
    window.addEventListener('pointerdown', onGesture, opts);
    window.addEventListener('keydown', onGesture, opts);
    window.addEventListener('wheel', onGesture, opts);
    window.addEventListener('touchstart', onGesture, opts);
    return () => {
      window.removeEventListener('pointerdown', onGesture, opts);
      window.removeEventListener('keydown', onGesture, opts);
      window.removeEventListener('wheel', onGesture, opts);
      window.removeEventListener('touchstart', onGesture, opts);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape') onClose();
      // BUG FIX: Space bar is the universal play/pause shortcut — was missing
      // Uses DOM refs only to avoid stale closures (effect deps = [onClose])
      if (e.key === ' ') {
        e.preventDefault(); // Prevent page scroll
        if (videoRef.current) {
          // Native video — read paused from DOM (always fresh)
          if (videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          } else {
            videoRef.current.pause();
          }
        } else {
          // YouTube — use setPaused callback to read fresh state
          setPaused((prev) => {
            const cmd = prev ? 'playVideo' : 'pauseVideo';
            sendYTCmd(cmd);
            return !prev;
          });
        }
      }
      if (e.key === 'm' || e.key === 'M') {
        setMuted((prev) => {
          const next = !prev;
          userWantsSoundRef.current = !next;
          if (next) {
            sendYTCmd('mute');
          } else {
            sendYTCmd('unMute');
            sendYTCmd('setVolume', [100]);
          }
          // Also update native video
          if (videoRef.current) videoRef.current.muted = next;
          return next;
        });
      }
      if (e.key === 'l' || e.key === 'L') {
        handleLikeRef.current?.();
        haptic(15);
      }
      if (e.key === 's' || e.key === 'S') handleSaveRef.current?.();
      if (e.key === 'c' || e.key === 'C') handleCommentsRef.current?.();
      if (e.key === '?') setShowShortcutsOverlay((prev) => !prev);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // M4: IntersectionObserver — single source of truth for currentIndex
  useEffect(() => {
    const container = containerRef.current;
    if (!container || reels.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio < 0.6) return;
          const newIdx = parseInt(entry.target.dataset.reelIndex, 10);
          if (isNaN(newIdx)) return;
          setCurrentIndex(newIdx);
          // Only attempt to flip the UI/DOM mute state if a real gesture
          // has been captured AND the user wants sound. The IO callback
          // runs asynchronously (post-scroll) so the gesture context may
          // have expired. We rely on the onPlaying handler (called inside
          // the actual playback event) for the authoritative unmute, and
          // verify the DOM honored it before lying to React state.
          const activeMedia = entry.target.querySelector('video, iframe');
          if (activeMedia?.tagName === 'VIDEO') {
            if (userInteractedRef.current && userWantsSoundRef.current) {
              activeMedia.muted = false;
              activeMedia.play().catch(() => {});
              // Verify-after-unmute: only update React state if DOM honored.
              if (!activeMedia.muted) setMuted(false);
            } else {
              activeMedia.muted = true;
              activeMedia.play().catch(() => {});
            }
          } else if (activeMedia?.tagName === 'IFRAME') {
            activeMedia.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
              '*'
            );
            if (userInteractedRef.current && userWantsSoundRef.current) {
              activeMedia.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
                '*'
              );
              activeMedia.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }),
                '*'
              );
            }
          }
          container.querySelectorAll('[data-reel-index]').forEach((el) => {
            if (parseInt(el.dataset.reelIndex, 10) === newIdx) return;
            const vid = el.querySelector('video');
            if (vid) vid.pause();
            const ifr = el.querySelector('iframe');
            if (ifr?.contentWindow)
              ifr.contentWindow.postMessage(
                JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
                '*'
              );
          });
          const nextReel = reels[newIdx + 1];
          if (nextReel?.video_url && !isYouTubeUrl(nextReel.video_url))
            prefetchVideoStart(nextReel.video_url);
          const evictEl = container.querySelector(`[data-reel-index="${newIdx - 2}"] video`);
          if (evictEl) {
            evictEl.src = '';
            evictEl.load();
          }
        });
      },
      { threshold: 0.6, root: container }
    );
    container.querySelectorAll('[data-reel-index]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, reels.length]);

  // ─── Stall watchdog (parity with /hub/reels) ──────────────────────────
  // For NATIVE video reels only (YouTube iframes have their own onError +
  // 3s auto-skip overlay): start a 6s timer when the active reel changes.
  // If the active <video> doesn't reach readyState >= 2 (HAVE_CURRENT_DATA)
  // by then, treat as broken/undecodable and auto-advance. The onPlaying /
  // onLoadedMetadata handlers clear this timer on success. Catches HEVC
  // silent-hang on Chrome desktop, broken/corrupt MP4s, and dead Supabase
  // Storage URLs — none of which fire onError reliably.
  useEffect(() => {
    const activeReel = reels[currentIndex];
    if (!activeReel?.id) return;
    const url = activeReel?.video_url || '';
    if (!url || isYouTubeUrl(url)) return;
    if (videoStallTimerRef.current) clearTimeout(videoStallTimerRef.current);
    videoStallTimerRef.current = setTimeout(() => {
      videoStallTimerRef.current = null;
      const v = videoRef.current;
      if (v && v.readyState < 2) {
        console.warn('[ReelsViewer] video stall watchdog tripped — auto-skipping', {
          src: url,
          readyState: v.readyState,
          networkState: v.networkState,
          reason: 'No metadata after 6s — likely HEVC/corrupt/dead URL',
        });
        if (typeof window !== 'undefined') {
          window.__reelStallSkip = (window.__reelStallSkip || 0) + 1;
        }
        brokenUrlsRef.current.add(url);
        goNext();
      }
    }, 6000);
    return () => {
      if (videoStallTimerRef.current) {
        clearTimeout(videoStallTimerRef.current);
        videoStallTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reels[currentIndex]?.id, reels[currentIndex]?.video_url]);

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: C.bg,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        <div
          style={{
            width: 280,
            height: 500,
            borderRadius: 16,
            background: 'linear-gradient(110deg, #1a1a1a 8%, #2a2a2a 18%, #1a1a1a 33%)',
            backgroundSize: '200% 100%',
            animation: 'shimmerReels 1.5s linear infinite',
          }}
        />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'linear-gradient(110deg, #1a1a1a 8%, #2a2a2a 18%, #1a1a1a 33%)',
              backgroundSize: '200% 100%',
              animation: 'shimmerReels 1.5s linear infinite',
            }}
          />
          <div>
            <div
              style={{
                width: 100,
                height: 12,
                borderRadius: 6,
                background: '#1a1a1a',
                marginBottom: 6,
              }}
            />
            <div style={{ width: 50, height: 8, borderRadius: 4, background: '#1a1a1a' }} />
          </div>
        </div>
        <style>{`@keyframes shimmerReels { to { background-position-x: -200%; } }`}</style>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: C.bg,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <div style={{ color: C.text, fontSize: 18, marginBottom: 8 }}>Failed To Load Reels</div>
        <div style={{ color: C.textSec, fontSize: 14, marginBottom: 20 }}>
          Please check your connection and try again.
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => loadReels()}
            style={{
              padding: '12px 24px',
              background: C.blue,
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Retry
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              background: 'rgba(255,255,255,0.1)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!reels.length) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: C.bg,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
        <div style={{ color: C.text, fontSize: 18 }}>No Reels Yet</div>
        <button
          onClick={onClose}
          style={{
            marginTop: 24,
            padding: '12px 24px',
            background: C.blue,
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  const handleTap = (e) => {
    // Don't trigger on comment drawer clicks
    if (showCommentInput) return;
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
      revealOverlay();
      return;
    }

    if (now - lastTapRef.current < DOUBLE_TAP_WINDOW) {
      // Double-tap = toggle play/pause
      haptic(15);
      if (!isYT && videoRef.current) {
        if (videoRef.current.paused) {
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined)
            playPromise.catch((e) => console.warn('Play intercepted:', e));
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
    revealOverlay();
  };

  // Progress bar update loop - stored in ref to prevent stale closure in RAF
  const updateProgressRef = useRef(null);
  updateProgressRef.current = () => {
    if (videoRef.current && videoRef.current.duration) {
      setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
    }
    progressRAF.current = requestAnimationFrame(updateProgressRef.current);
  };

  // Cleanup RAF + all timer refs on unmount to prevent memory leaks and
  // stale state updates on unmounted component (React warning prevention)
  useEffect(() => {
    return () => {
      if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
      // BUG FIX: clear long-press timer on unmount (was never cleared)
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      // BUG FIX: clear overlay auto-hide timer on unmount
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      // BUG FIX: clear reaction picker timer on unmount
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        overflowY: 'scroll',
        scrollSnapType: 'y mandatory',
        overscrollBehaviorY: 'contain',
        WebkitOverflowScrolling: 'touch',
        background: '#000',
      }}
      onTouchStart={handleLongPressTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onMouseDown={handleLongPressTouchStart}
      onMouseUp={cancelLongPress}
      onMouseMove={cancelLongPress}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowContextMenu(true);
      }}
    >
      {/* Fixed close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close reels"
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          color: 'white',
          fontSize: 20,
          cursor: 'pointer',
          zIndex: 10001,
          opacity: showOverlay ? 1 : 0.3,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'auto',
        }}
      >
        ←
      </button>

      {/* M4: 3-slot virtualized window */}
      {[currentIndex - 1, currentIndex, currentIndex + 1].map((idx) => {
        if (idx < 0 || idx >= reels.length) return null;
        const reel = reels[idx];
        if (!reel) return null;
        const isActive = idx === currentIndex;
        const url = reel.video_url;
        const ytId = getYouTubeVideoId(url);
        const isYT = !!ytId;
        const embedSrc = ytId
          ? `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&rel=0&modestbranding=1&playsinline=1&controls=0&showinfo=0&iv_load_policy=3&fs=0&disablekb=1&cc_load_policy=0&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}`
          : null;

        return (
          <div
            key={reel.id}
            data-reel-index={idx}
            onClick={isActive ? handleTap : undefined}
            style={{
              height: '100vh',
              width: '100%',
              maxWidth: 420,
              margin: '0 auto',
              position: 'relative',
              background: '#000',
              scrollSnapAlign: 'start',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {reel.thumbnail_url && (
              <img
                src={reel.thumbnail_url}
                alt=""
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  zIndex: 0,
                }}
              />
            )}

            {isYT ? (
              <iframe
                ref={isActive ? ytIframeRef : null}
                key={reel.id}
                src={embedSrc}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  objectFit: 'cover',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
                title={reel.caption || 'Poker Reel'}
                onLoad={() => {
                  if (!isActive) return;
                  onLoadRetryTimersRef.current.forEach((t) => clearTimeout(t));
                  sendYTCmd('playVideo');
                  autoUnmute();
                  onLoadRetryTimersRef.current = [300, 800, 1500].map((delay) =>
                    setTimeout(() => {
                      sendYTCmd('playVideo');
                      if (userInteractedRef.current && userWantsSoundRef.current) {
                        sendYTCmd('unMute');
                        sendYTCmd('setVolume', [100]);
                      }
                    }, delay)
                  );
                }}
              />
            ) : (
              <video
                ref={isActive ? videoRef : null}
                key={reel.id}
                src={url}
                preload="auto"
                playsInline
                loop
                // ALWAYS render muted=true so the browser allows autoplay
                // unconditionally. We unmute synchronously after the
                // 'playing' event fires, gated on the session-sticky
                // userInteractedRef. This is the only reliable way to get
                // sound on swipe without re-clicking — the IntersectionObserver
                // path runs too late (post-scroll) to count as a gesture
                // context in Chrome/Safari.
                muted={true}
                poster={reel.thumbnail_url || undefined}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  position: 'absolute',
                  inset: 0,
                  zIndex: 1,
                }}
                onCanPlay={(e) => {
                  if (isActive) {
                    // Always start muted; muted play() always succeeds.
                    e.target.muted = true;
                    e.target.play().catch(() => {});
                  }
                }}
                onPlaying={(e) => {
                  // Successful playback — clear stall watchdog so it doesn't
                  // auto-skip a video that simply took longer to start.
                  if (isActive && videoStallTimerRef.current) {
                    clearTimeout(videoStallTimerRef.current);
                    videoStallTimerRef.current = null;
                  }
                  // Once the browser has actually started playback,
                  // we can flip muted=false IF the user has gestured
                  // at any point in this tab session. This is the
                  // critical handler for the swipe-with-sound flow.
                  // Verify-after-unmute: when the page is reloaded with
                  // sessionStorage[sp:reels:interacted]='1' from a prior
                  // load, userInteractedRef is truthy but the browser has
                  // not seen a gesture on THIS page load and may silently
                  // keep muted=true. Only flip React state if the DOM
                  // actually accepted muted=false — never lie to the UI.
                  if (isActive && userInteractedRef.current && userWantsSoundRef.current) {
                    try {
                      e.target.muted = false;
                      if (!e.target.muted) {
                        if (e.target.volume === 0) e.target.volume = 1.0;
                        setMuted(false);
                      }
                    } catch (_) {
                      /* best-effort */
                    }
                  }
                }}
                onLoadedMetadata={() => {
                  // Metadata reached → video IS decodable. Clear stall
                  // watchdog so we don't auto-skip a healthy reel that
                  // took >6s to download metadata over a slow link.
                  if (isActive && videoStallTimerRef.current) {
                    clearTimeout(videoStallTimerRef.current);
                    videoStallTimerRef.current = null;
                  }
                }}
                onError={(e) => {
                  // Surface decode failures (most commonly HEVC on Chrome
                  // desktop — Chrome doesn't license H.265). Without this,
                  // users saw a black box with the play button forever.
                  // Now: record broken URL in session-scoped skip-set, then
                  // auto-advance so the same broken reel is never shown twice.
                  const err = e.currentTarget?.error;
                  console.warn('[ReelsViewer] video decode failed', {
                    code: err?.code,
                    message: err?.message,
                    src: url,
                    suggestion: 'Likely H.265/HEVC — needs server-side transcode to H.264',
                  });
                  if (typeof window !== 'undefined') {
                    window.__reelDecodeError = (window.__reelDecodeError || 0) + 1;
                  }
                  if (url) brokenUrlsRef.current.add(url);
                  if (isActive && videoStallTimerRef.current) {
                    clearTimeout(videoStallTimerRef.current);
                    videoStallTimerRef.current = null;
                  }
                  // Auto-advance only the active reel — user never gets stuck.
                  if (isActive) goNext();
                }}
                onPlay={() => {
                  if (isActive) {
                    setPaused(false);
                    setYtReady(true);
                    progressRAF.current = requestAnimationFrame(updateProgressRef.current);
                  }
                }}
                onPause={() => {
                  if (isActive) {
                    setPaused(true);
                    if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
                  }
                }}
                onEnded={() => {
                  if (isActive) {
                    if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
                    setProgress(0);
                    if (currentIndex < reels.length - 1) goNext();
                  }
                }}
              />
            )}

            {/* Active-slot social overlays only */}
            {isActive && (
              <>
                {/* Play Button Overlay - visible when explicitly paused (ytReady suppresses it during autoplay startup) */}
                {paused && ytReady && !ytError && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.4)',
                      border: '2px solid rgba(255,255,255,0.8)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: 40,
                      zIndex: 20,
                      pointerEvents: 'none',
                    }}
                  >
                    ▶
                  </div>
                )}

                {/* YouTube Error Overlay — Age-restricted / unavailable video */}
                {ytError &&
                  (() => {
                    const videoUrl = currentReel?.video_url;
                    const videoId = getYouTubeVideoId(videoUrl);
                    return (
                      <YouTubeErrorOverlay
                        errorCode={ytError}
                        videoId={videoId}
                        videoUrl={videoUrl}
                        thumbnailUrl={
                          videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null
                        }
                        actionLabel="Skipping in 3 seconds..."
                        style={{ pointerEvents: 'auto' }}
                      />
                    );
                  })()}

                {/* Author info overlay - hidden by default, shown on tap */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 80,
                    left: 16,
                    right: 16,
                    zIndex: 10,
                    pointerEvents: showOverlay ? 'auto' : 'none',
                    opacity: showOverlay ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                  }}
                >
                  <Link
                    href={`/hub/user/${currentReel?.profiles?.username}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      textDecoration: 'none',
                      marginBottom: 12,
                    }}
                  >
                    <img
                      src={currentReel?.profiles?.avatar_url || '/default-avatar.png'}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid white',
                      }}
                    />
                    <div>
                      <div
                        style={{
                          color: 'white',
                          fontWeight: 600,
                          fontSize: 15,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span>
                          {currentReel?.profiles?.full_name || currentReel?.profiles?.username}
                        </span>
                        {watchedReelIds.includes(currentReel?.id) && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: 'rgba(255,255,255,0.7)',
                              background: 'rgba(255,255,255,0.15)',
                              padding: '2px 6px',
                              borderRadius: 4,
                              backdropFilter: 'blur(4px)',
                            }}
                          >
                            Watched
                          </span>
                        )}
                      </div>
                      <div style={{ color: C.textSec, fontSize: 12 }}>
                        {timeAgo(currentReel?.created_at)}
                      </div>
                    </div>
                  </Link>
                  {/* Follow button - only for other users' reels */}
                  {currentReel?.author_id &&
                    currentUserId &&
                    currentReel.author_id !== currentUserId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFollow();
                        }}
                        style={{
                          padding: '4px 14px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: following[currentReel.author_id] ? 'transparent' : '#1877F2',
                          color: 'white',
                          border: following[currentReel.author_id]
                            ? '1px solid rgba(255,255,255,0.5)'
                            : 'none',
                          marginBottom: 8,
                        }}
                      >
                        {following[currentReel.author_id] ? 'Following' : 'Follow'}
                      </button>
                    )}

                  {currentReel?.caption &&
                    (() => {
                      const MAX_LEN = 100;
                      const isLong = currentReel.caption.length > MAX_LEN;
                      return (
                        <p
                          style={{
                            color: 'white',
                            fontSize: 14,
                            margin: 0,
                            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                          }}
                        >
                          {captionExpanded || !isLong
                            ? currentReel.caption
                            : `${currentReel.caption.slice(0, MAX_LEN)}...`}
                          {isLong && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setCaptionExpanded(!captionExpanded);
                              }}
                              style={{
                                color: 'rgba(255,255,255,0.6)',
                                cursor: 'pointer',
                                marginLeft: 4,
                                fontSize: 13,
                              }}
                            >
                              {captionExpanded ? ' Less' : ' See More'}
                            </span>
                          )}
                        </p>
                      );
                    })()}
                </div>

                {/* Right Action Sidebar - hidden by default, shown on tap */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    right: 12,
                    bottom: 110,
                    zIndex: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 24,
                    alignItems: 'center',
                    opacity: showOverlay ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                    pointerEvents: showOverlay ? 'auto' : 'none',
                  }}
                >
                  {/* Heart - tap to like, long-press for reactions */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => {
                        handleLike();
                        if (!liked[currentReel?.id]) {
                          setShowHeart(true);
                          clearTimeout(showHeartTimerRef.current);
                          showHeartTimerRef.current = setTimeout(() => setShowHeart(false), 800);
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
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                      }}
                    >
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill={liked[currentReel?.id] ? '#ef4444' : 'none'}
                        stroke={liked[currentReel?.id] ? '#ef4444' : 'white'}
                        strokeWidth="2"
                        style={{
                          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                          transition: 'transform 0.15s ease',
                        }}
                      >
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      <span
                        style={{
                          color: 'white',
                          fontSize: 11,
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                          transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                          transform: likeBounceId === currentReel?.id ? 'scale(1.4)' : 'scale(1)',
                          display: 'inline-block',
                        }}
                      >
                        {likeCounts[currentReel?.id] || 0}
                      </span>
                    </button>
                    {/* Reaction Picker - appears on long-press */}
                    {showReactionPicker && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 48,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          display: 'flex',
                          gap: 4,
                          padding: '8px 12px',
                          borderRadius: 24,
                          background: 'rgba(0,0,0,0.85)',
                          backdropFilter: 'blur(12px)',
                          WebkitBackdropFilter: 'blur(12px)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                          animation: 'fadeInScale 0.2s ease',
                        }}
                      >
                        {[
                          { emoji: '\u2764\uFE0F', label: 'Love', type: 'like' },
                          { emoji: '\uD83D\uDC4D', label: 'Thumbs Up', type: 'thumbsup' },
                          { emoji: '\uD83D\uDC4E', label: 'Thumbs Down', type: 'dislike' },
                          { emoji: '\uD83D\uDE02', label: 'Laughing', type: 'laughing' },
                          { emoji: '\uD83D\uDE22', label: 'Crying', type: 'crying' },
                          { emoji: '\uD83D\uDE21', label: 'Angry', type: 'angry' },
                        ].map((r) => (
                          <button
                            key={r.type}
                            onClick={() => {
                              // BUG FIX (RLXS-3): use showHeartTimerRef for all reaction-picker heart animations
                              const triggerHeart = () => {
                                if (!liked[currentReel?.id]) {
                                  setShowHeart(true);
                                  if (showHeartTimerRef.current)
                                    clearTimeout(showHeartTimerRef.current);
                                  showHeartTimerRef.current = setTimeout(() => {
                                    showHeartTimerRef.current = null;
                                    setShowHeart(false);
                                  }, 800);
                                }
                              };
                              if (r.type === 'like') {
                                handleLike();
                                triggerHeart();
                              } else if (r.type === 'dislike') handleDislike();
                              else {
                                handleLike();
                                triggerHeart();
                              }
                              setShowReactionPicker(false);
                              haptic(10);
                            }}
                            aria-label={r.label}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 28,
                              padding: '4px',
                              transition: 'transform 0.15s ease',
                            }}
                            onMouseEnter={(e) => (e.target.style.transform = 'scale(1.3)')}
                            onMouseLeave={(e) => (e.target.style.transform = 'scale(1)')}
                          >
                            {r.emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Comment */}
                  <button
                    onClick={handleOpenComments}
                    aria-label="Comments"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
                    >
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                    <span
                      style={{
                        color: showCommentInput ? '#1877F2' : 'white',
                        fontSize: 11,
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      }}
                    >
                      {commentCounts[currentReel?.id] || 0}
                    </span>
                  </button>

                  {/* Share */}
                  <button
                    onClick={() => {
                      handleShare();
                      haptic(10);
                    }}
                    aria-label="Share"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
                    >
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    <span
                      style={{
                        color: 'white',
                        fontSize: 11,
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      }}
                    >
                      Share
                    </span>
                  </button>

                  {/* Save */}
                  <button
                    onClick={handleSave}
                    aria-label={saved[currentReel?.id] ? 'Unsave' : 'Save'}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill={saved[currentReel?.id] ? 'white' : 'none'}
                      stroke="white"
                      strokeWidth="2"
                      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    <span
                      style={{
                        color: 'white',
                        fontSize: 11,
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      }}
                    >
                      {saved[currentReel?.id] ? 'Saved' : 'Save'}
                    </span>
                  </button>

                  {/* More (···) - opens panel with Sound, Report, Speed, Link */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setShowMoreMenu((prev) => !prev)}
                      aria-label="More options"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                      }}
                    >
                      <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="white"
                        stroke="none"
                        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
                      >
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                      <span
                        style={{
                          color: 'white',
                          fontSize: 10,
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                        }}
                      >
                        More
                      </span>
                    </button>
                    {/* More Menu Panel */}
                    {showMoreMenu && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 48,
                          bottom: 0,
                          minWidth: 180,
                          padding: '8px 0',
                          borderRadius: 12,
                          background: 'rgba(0,0,0,0.9)',
                          backdropFilter: 'blur(16px)',
                          WebkitBackdropFilter: 'blur(16px)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                          animation: 'fadeInScale 0.2s ease',
                        }}
                      >
                        <button
                          onClick={() => {
                            setMuted((prev) => {
                              const next = !prev;
                              userWantsSoundRef.current = !next;
                              if (next) {
                                sendYTCmd('mute');
                              } else {
                                sendYTCmd('unMute');
                                sendYTCmd('setVolume', [100]);
                              }
                              if (videoRef.current) videoRef.current.muted = next;
                              return next;
                            });
                            setShowMoreMenu(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            width: '100%',
                            padding: '10px 16px',
                            background: 'none',
                            border: 'none',
                            color: 'white',
                            fontSize: 14,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          {muted ? (
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                              <line x1="23" y1="9" x2="17" y2="15" />
                              <line x1="17" y1="9" x2="23" y2="15" />
                            </svg>
                          ) : (
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            </svg>
                          )}
                          {muted ? 'Unmute' : 'Mute'}
                        </button>
                        <button
                          onClick={() => {
                            handleSpeedToggle();
                            setShowMoreMenu(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            width: '100%',
                            padding: '10px 16px',
                            background: 'none',
                            border: 'none',
                            color: playbackSpeed !== 1 ? '#00d4ff' : 'white',
                            fontSize: 14,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <div
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              border: '1.5px solid currentColor',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 9,
                              fontWeight: 700,
                            }}
                          >
                            {playbackSpeed}x
                          </div>
                          Speed ({playbackSpeed}x)
                        </button>
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/hub/reels?id=${currentReel?.id || ''}`;
                            navigator.clipboard
                              .writeText(url)
                              .then(() => {
                                // BUG FIX (RLXS-4): cancel previous copyToast timer before scheduling a new one.
                                setCopyToast(true);
                                if (copyToastTimerRef.current)
                                  clearTimeout(copyToastTimerRef.current);
                                copyToastTimerRef.current = setTimeout(() => {
                                  copyToastTimerRef.current = null;
                                  setCopyToast(false);
                                }, 2000);
                              })
                              .catch((e) =>
                                console.warn('[App] Handled promise rejection:', e?.message || e)
                              );
                            setShowMoreMenu(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            width: '100%',
                            padding: '10px 16px',
                            background: 'none',
                            border: 'none',
                            color: 'white',
                            fontSize: 14,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          Copy Link
                        </button>
                        <button
                          onClick={() => {
                            setShowReportModal(true);
                            setShowMoreMenu(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            width: '100%',
                            padding: '10px 16px',
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            fontSize: 14,
                            cursor: 'pointer',
                            textAlign: 'left',
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                          }}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                            <line x1="4" y1="22" x2="4" y2="15" />
                          </svg>
                          Report
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Comment Drawer */}
                {showCommentInput && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'rgba(0,0,0,0.9)',
                      borderRadius: '16px 16px 0 0',
                      maxHeight: '50vh',
                      display: 'flex',
                      flexDirection: 'column',
                      zIndex: 30,
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: 'white', fontSize: 15 }}>
                        Comments
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Phase 8 - Sort toggle */}
                        <button
                          onClick={() => {
                            const next = commentSort === 'newest' ? 'oldest' : 'newest';
                            setCommentSort(next);
                            setReelComments((prev) =>
                              [...prev].sort((a, b) =>
                                next === 'newest'
                                  ? new Date(b.created_at) - new Date(a.created_at)
                                  : new Date(a.created_at) - new Date(b.created_at)
                              )
                            );
                          }}
                          style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 12,
                            padding: '3px 10px',
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'rgba(255,255,255,0.6)',
                            cursor: 'pointer',
                          }}
                        >
                          {commentSort === 'newest' ? 'Newest' : 'Oldest'}
                        </button>
                        <button
                          onClick={() => setShowCommentInput(false)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'white',
                            fontSize: 18,
                            cursor: 'pointer',
                          }}
                        >
                          x
                        </button>
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '8px 16px',
                        maxHeight: 'calc(50vh - 100px)',
                      }}
                    >
                      {reelComments.length === 0 && (
                        <div
                          style={{
                            color: C.textSec,
                            textAlign: 'center',
                            padding: 20,
                            fontSize: 14,
                          }}
                        >
                          No comments yet. Be the first!
                        </div>
                      )}
                      {reelComments.map((c, i) => (
                        <div
                          key={c.id || i}
                          style={{
                            display: 'flex',
                            gap: 10,
                            padding: '8px 0',
                            paddingLeft: c.parent_id ? 24 : 0,
                          }}
                        >
                          <img
                            src={c.profiles?.avatar_url || '/default-avatar.png'}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              objectFit: 'cover',
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>
                              {c.profiles?.username || 'User'}
                            </span>
                            <span
                              style={{
                                color: 'rgba(255,255,255,0.4)',
                                fontSize: 11,
                                marginLeft: 8,
                              }}
                            >
                              {c.created_at ? timeAgo(c.created_at) : ''}
                            </span>
                            {/* Phase 7 - Inline edit mode */}
                            {editingComment === c.id ? (
                              <div
                                style={{
                                  marginTop: 4,
                                  display: 'flex',
                                  gap: 6,
                                  alignItems: 'center',
                                }}
                              >
                                <input
                                  value={editCommentText}
                                  onChange={(e) => setEditCommentText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit(c.id);
                                    if (e.key === 'Escape') {
                                      setEditingComment(null);
                                      setEditCommentText('');
                                    }
                                  }}
                                  style={{
                                    flex: 1,
                                    background: 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(0,212,255,0.3)',
                                    borderRadius: 8,
                                    padding: '6px 10px',
                                    color: 'white',
                                    fontSize: 13,
                                    outline: 'none',
                                  }}
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveEdit(c.id)}
                                  style={{
                                    background: '#1877F2',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '4px 10px',
                                    color: 'white',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingComment(null);
                                    setEditCommentText('');
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'rgba(255,255,255,0.4)',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              c.content && (
                                <span style={{ color: C.textSec, fontSize: 13, marginLeft: 8 }}>
                                  {c.content}
                                </span>
                              )
                            )}
                            {c.media_url && (
                              <div
                                style={{
                                  position: 'relative',
                                  display: 'inline-block',
                                  marginTop: 4,
                                }}
                              >
                                <img
                                  src={c.media_url}
                                  alt={c.media_type === 'gif' ? 'GIF' : 'Image'}
                                  style={{
                                    maxWidth: 180,
                                    maxHeight: 140,
                                    borderRadius: 8,
                                    display: 'block',
                                  }}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                                {c.media_type === 'gif' && (
                                  <span
                                    style={{
                                      position: 'absolute',
                                      bottom: 4,
                                      left: 4,
                                      background: 'rgba(0,0,0,0.6)',
                                      color: 'white',
                                      fontSize: 8,
                                      fontWeight: 700,
                                      padding: '1px 4px',
                                      borderRadius: 3,
                                    }}
                                  >
                                    GIF
                                  </span>
                                )}
                              </div>
                            )}
                            {/* Phase 6+7 - Comment engagement row */}
                            <div
                              style={{
                                display: 'flex',
                                gap: 14,
                                marginTop: 4,
                                alignItems: 'center',
                              }}
                            >
                              <button
                                onClick={() => handleCommentLike(c.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: 0,
                                  color: commentLikes[c.id] ? '#FF2D55' : 'rgba(255,255,255,0.4)',
                                  fontSize: 12,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 3,
                                }}
                              >
                                {commentLikes[c.id] ? '❤️' : '🤍'}
                                {commentLikeCounts[c.id] > 0 && (
                                  <span style={{ fontSize: 10, opacity: 0.6 }}>
                                    {commentLikeCounts[c.id]}
                                  </span>
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setReplyTo({
                                    id: c.id,
                                    username: c.profiles?.username || 'User',
                                  });
                                  setCommentText(`@${c.profiles?.username || 'User'} `);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: 0,
                                  color: 'rgba(255,255,255,0.4)',
                                  fontSize: 12,
                                }}
                              >
                                Reply
                              </button>
                              {(c.profiles?.username === 'You' ||
                                c.author_id === currentUserId) && (
                                <>
                                  <button
                                    onClick={() => handleEditComment(c)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: 0,
                                      color: 'rgba(255,255,255,0.4)',
                                      fontSize: 12,
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteComment(c.id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: 0,
                                      color: 'rgba(255,255,255,0.3)',
                                      fontSize: 12,
                                      marginLeft: 'auto',
                                    }}
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* #6 Comment Pagination - Load More */}
                      {hasMoreComments && (
                        <button
                          onClick={loadMoreComments}
                          disabled={loadingMoreComments}
                          style={{
                            width: '100%',
                            padding: '10px',
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 10,
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: loadingMoreComments ? 'wait' : 'pointer',
                            marginTop: 4,
                          }}
                        >
                          {loadingMoreComments ? 'Loading...' : 'Load More Comments'}
                        </button>
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
                      <div
                        style={{
                          padding: '4px 16px',
                          position: 'relative',
                          display: 'inline-block',
                        }}
                      >
                        <img
                          src={reelCommentMediaUrl}
                          alt="Preview"
                          style={{
                            maxWidth: 140,
                            maxHeight: 100,
                            borderRadius: 8,
                            display: 'block',
                          }}
                        />
                        <button
                          onClick={() => {
                            setReelCommentMediaUrl(null);
                            setReelCommentMediaType(null);
                          }}
                          style={{
                            position: 'absolute',
                            top: 8,
                            right: 20,
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: 'rgba(0,0,0,0.6)',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          &times;
                        </button>
                      </div>
                    )}
                    {/* Hidden file input */}
                    <input
                      type="file"
                      accept="image/*"
                      ref={reelFileInputRef}
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleReelImageUpload(f);
                        e.target.value = '';
                      }}
                    />
                    {/* Reply-to indicator */}
                    {replyTo && (
                      <div
                        style={{
                          padding: '6px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          borderTop: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(0,212,255,0.06)',
                        }}
                      >
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                          Replying to{' '}
                          <span style={{ color: '#00d4ff', fontWeight: 600 }}>
                            @{replyTo.username}
                          </span>
                        </span>
                        <button
                          onClick={() => {
                            setReplyTo(null);
                            setCommentText('');
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255,255,255,0.4)',
                            fontSize: 14,
                            cursor: 'pointer',
                            marginLeft: 'auto',
                          }}
                        >
                          x
                        </button>
                      </div>
                    )}
                    <div
                      style={{
                        padding: '10px 16px',
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <input
                        ref={commentInputRef}
                        type="text"
                        placeholder="Add a comment..."
                        value={commentText}
                        onChange={(e) => {
                          if (e.target.value.length <= COMMENT_MAX_LENGTH)
                            setCommentText(e.target.value);
                        }}
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
                          flex: 1,
                          background: 'rgba(255,255,255,0.1)',
                          border: 'none',
                          borderRadius: 20,
                          padding: '10px 16px',
                          color: 'white',
                          fontSize: 14,
                          outline: 'none',
                        }}
                      />
                      <button
                        onClick={() => setShowReelGifPicker(!showReelGifPicker)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: showReelGifPicker ? '#0A84FF' : 'rgba(255,255,255,0.6)',
                          fontWeight: 700,
                          fontSize: 11,
                        }}
                      >
                        GIF
                      </button>
                      <button
                        onClick={() => reelFileInputRef.current?.click()}
                        disabled={uploadingReelImage}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: uploadingReelImage ? 'wait' : 'pointer',
                          color: 'rgba(255,255,255,0.6)',
                          fontSize: 15,
                          opacity: uploadingReelImage ? 0.5 : 1,
                        }}
                      >
                        {uploadingReelImage ? '...' : '📷'}
                      </button>
                      {(commentText.trim() || reelCommentMediaUrl) && (
                        <button
                          onClick={() => handleSubmitComment(null)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#0A84FF',
                            fontWeight: 600,
                            fontSize: 13,
                          }}
                        >
                          Post
                        </button>
                      )}
                    </div>
                    {/* Phase 8 - Character counter */}
                    {commentText.length > 0 && (
                      <div
                        style={{
                          textAlign: 'right',
                          fontSize: 10,
                          color:
                            commentText.length >= COMMENT_MAX_LENGTH - 20
                              ? '#ef4444'
                              : 'rgba(255,255,255,0.3)',
                          paddingRight: 16,
                          paddingBottom: 4,
                        }}
                      >
                        {commentText.length}/{COMMENT_MAX_LENGTH}
                      </div>
                    )}
                  </div>
                )}

                {/* Share Toast */}
                {shareToast && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 60,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(255,255,255,0.15)',
                      color: 'white',
                      padding: '8px 20px',
                      borderRadius: 20,
                      fontSize: 14,
                      zIndex: 30,
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    Link Copied
                  </div>
                )}

                {/* #10 Error Toast */}
                {errorToast && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 60,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(255,69,58,0.15)',
                      border: '1px solid rgba(255,69,58,0.4)',
                      borderRadius: 12,
                      padding: '8px 20px',
                      color: '#FF453A',
                      fontSize: 13,
                      fontWeight: 600,
                      zIndex: 30,
                      backdropFilter: 'blur(10px)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {errorToast}
                  </div>
                )}

                {/* Keyboard Shortcuts Overlay */}
                {showShortcutsOverlay && (
                  <div
                    onClick={() => setShowShortcutsOverlay(false)}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0,0,0,0.7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 260,
                    }}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: '#1a1a2e',
                        borderRadius: 16,
                        padding: '20px 24px',
                        border: '1px solid rgba(255,255,255,0.15)',
                        maxWidth: 320,
                        width: '90%',
                      }}
                    >
                      <div
                        style={{
                          color: 'white',
                          fontWeight: 700,
                          fontSize: 16,
                          marginBottom: 16,
                          textAlign: 'center',
                        }}
                      >
                        Keyboard Shortcuts
                      </div>
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
                        <div
                          key={key}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <span
                            style={{
                              color: '#00d4ff',
                              fontWeight: 600,
                              fontSize: 13,
                              fontFamily: 'monospace',
                              background: 'rgba(0,212,255,0.1)',
                              padding: '2px 8px',
                              borderRadius: 6,
                            }}
                          >
                            {key}
                          </span>
                          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                            {desc}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Phase 9: Long Press Context Menu */}
                {showContextMenu && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowContextMenu(false);
                    }}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0,0,0,0.6)',
                      backdropFilter: 'blur(10px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 300,
                    }}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: 'rgba(25, 25, 40, 0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 16,
                        width: 260,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowContextMenu(false);
                          handleSave();
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          padding: '16px 20px',
                          color: 'white',
                          fontSize: 16,
                          fontWeight: 600,
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          cursor: 'pointer',
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill={saved[currentReel?.id] ? 'white' : 'none'}
                          stroke="white"
                          strokeWidth="2"
                        >
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                        {saved[currentReel?.id] ? 'Unsave' : 'Save Reel'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowContextMenu(false);
                          handleShare();
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          padding: '16px 20px',
                          color: 'white',
                          fontSize: 16,
                          fontWeight: 600,
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          cursor: 'pointer',
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="2"
                        >
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                        Share / Repost
                      </button>
                      {/* BUG FIX: context menu Report must open the report modal (which has reason selection),
                                NOT call handleReport() directly. Direct call always fails silently because
                                reportReason is '' when triggered from context menu — no reason has been selected. */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowContextMenu(false);
                          setShowReportModal(true);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '16px 20px',
                          color: '#ff3b30',
                          fontSize: 16,
                          fontWeight: 600,
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          cursor: 'pointer',
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                          <line x1="4" y1="22" x2="4" y2="15" />
                        </svg>
                        Report
                      </button>
                    </div>
                  </div>
                )}

                {/* #8 Share Options Modal */}
                {showShareModal && (
                  <div
                    onClick={() => setShowShareModal(false)}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0,0,0,0.7)',
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      zIndex: 40,
                    }}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: '#1a1a2e',
                        borderRadius: '16px 16px 0 0',
                        padding: '16px 20px 24px',
                        width: '100%',
                        maxWidth: 400,
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <div style={{ textAlign: 'center', marginBottom: 4 }}>
                        <div
                          style={{
                            width: 40,
                            height: 4,
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: 2,
                            margin: '0 auto 12px',
                          }}
                        />
                        <div
                          style={{
                            color: 'white',
                            fontWeight: 700,
                            fontSize: 16,
                            marginBottom: 16,
                          }}
                        >
                          Share This Reel
                        </div>
                      </div>
                      {/* PRIMARY: Share to My Feed — opens description modal */}
                      <button
                        onClick={openShareDescriptionModal}
                        disabled={sharingToFeed || sharedToFeed}
                        style={{
                          width: '100%',
                          padding: '14px',
                          borderRadius: 12,
                          marginBottom: 14,
                          background: sharedToFeed
                            ? 'linear-gradient(135deg, #00c853, #69f0ae)'
                            : 'linear-gradient(135deg, #0A84FF, #30D5C8)',
                          color: 'white',
                          fontWeight: 700,
                          fontSize: 15,
                          border: 'none',
                          cursor: sharingToFeed ? 'wait' : 'pointer',
                          opacity: sharingToFeed ? 0.7 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          transition: 'all 0.3s ease',
                        }}
                      >
                        {sharedToFeed ? (
                          <>
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="3"
                            >
                              <path d="M20 6L9 17l-5-5" />
                            </svg>{' '}
                            Shared to My Feed!
                          </>
                        ) : (
                          <>
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="2"
                            >
                              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                              <polyline points="16 6 12 2 8 6" />
                              <line x1="12" y1="2" x2="12" y2="15" />
                            </svg>{' '}
                            Share to My Feed
                          </>
                        )}
                      </button>
                      <div
                        style={{
                          color: 'rgba(255,255,255,0.4)',
                          fontSize: 11,
                          textAlign: 'center',
                          marginBottom: 10,
                          fontWeight: 500,
                        }}
                      >
                        OR SHARE EXTERNALLY
                      </div>
                      <div
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}
                      >
                        {[
                          {
                            id: 'copy',
                            label: 'Copy Link',
                            icon: (
                              <svg
                                width="22"
                                height="22"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#00d4ff"
                                strokeWidth="2"
                              >
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            ),
                          },
                          {
                            id: 'x',
                            label: 'X',
                            icon: (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                              </svg>
                            ),
                          },
                          {
                            id: 'facebook',
                            label: 'Facebook',
                            icon: (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                              </svg>
                            ),
                          },
                          {
                            id: 'whatsapp',
                            label: 'WhatsApp',
                            icon: (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                              </svg>
                            ),
                          },
                        ].map((p) => (
                          <button
                            key={p.id}
                            onClick={() => handleShareAction(p.id)}
                            style={{
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: 12,
                              padding: '14px 4px',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            {p.icon}
                            <span style={{ color: 'white', fontSize: 10, fontWeight: 500 }}>
                              {p.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {showHeart && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: 80,
                      pointerEvents: 'none',
                      zIndex: 25,
                      animation: 'heartBurstReels 0.8s ease-out forwards',
                    }}
                  >
                    ❤️
                  </div>
                )}

                {/* Progress bar for native videos */}
                {progress > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 3,
                      background: 'rgba(255,255,255,0.2)',
                      zIndex: 25,
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #FF2D55, #FF6B6B)',
                        transition: 'width 0.1s linear',
                      }}
                    />
                  </div>
                )}

                {/* Share Description Modal */}
                {showShareDescriptionModal && (
                  <div
                    onClick={() => setShowShareDescriptionModal(false)}
                    style={{
                      position: 'fixed',
                      inset: 0,
                      background: 'rgba(0,0,0,0.75)',
                      zIndex: 10003,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 20,
                    }}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: '#1a1a2e',
                        borderRadius: 16,
                        padding: '20px',
                        width: '100%',
                        maxWidth: 420,
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 16,
                        }}
                      >
                        <div style={{ color: 'white', fontWeight: 700, fontSize: 17 }}>
                          Share to My Feed
                        </div>
                        <button
                          onClick={() => setShowShareDescriptionModal(false)}
                          style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            color: 'white',
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            cursor: 'pointer',
                            fontSize: 16,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      {currentReel?.caption && (
                        <div
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: 10,
                            padding: '10px 12px',
                            marginBottom: 14,
                            borderLeft: '3px solid #0A84FF',
                          }}
                        >
                          <div
                            style={{
                              color: 'rgba(255,255,255,0.5)',
                              fontSize: 11,
                              fontWeight: 600,
                              marginBottom: 4,
                            }}
                          >
                            SHARING REEL
                          </div>
                          <div
                            style={{
                              color: 'rgba(255,255,255,0.8)',
                              fontSize: 13,
                              lineHeight: 1.4,
                            }}
                          >
                            {currentReel.caption.length > 100
                              ? currentReel.caption.slice(0, 100) + '...'
                              : currentReel.caption}
                          </div>
                        </div>
                      )}
                      <textarea
                        value={shareDescription}
                        onChange={(e) => setShareDescription(e.target.value.slice(0, 500))}
                        placeholder="Add your thoughts... (optional)"
                        autoFocus
                        style={{
                          width: '100%',
                          minHeight: 100,
                          padding: '12px 14px',
                          borderRadius: 12,
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          color: 'white',
                          fontSize: 15,
                          resize: 'vertical',
                          outline: 'none',
                          fontFamily: 'inherit',
                          lineHeight: 1.5,
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#0A84FF';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = 'rgba(255,255,255,0.15)';
                        }}
                      />
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginTop: 6,
                          marginBottom: 16,
                        }}
                      >
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
                          {shareDescription.length}/500
                        </span>
                      </div>
                      <button
                        onClick={handleShareToFeed}
                        disabled={sharingToFeed}
                        style={{
                          width: '100%',
                          padding: '14px',
                          borderRadius: 12,
                          background: 'linear-gradient(135deg, #0A84FF, #30D5C8)',
                          color: 'white',
                          fontWeight: 700,
                          fontSize: 15,
                          border: 'none',
                          cursor: sharingToFeed ? 'wait' : 'pointer',
                          opacity: sharingToFeed ? 0.7 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                      >
                        {sharingToFeed ? (
                          'Posting...'
                        ) : (
                          <>
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="2"
                            >
                              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                              <polyline points="16 6 12 2 8 6" />
                              <line x1="12" y1="2" x2="12" y2="15" />
                            </svg>{' '}
                            Post to My Feed
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setShareDescription('');
                          handleShareToFeed('');
                        }}
                        disabled={sharingToFeed}
                        style={{
                          width: '100%',
                          marginTop: 8,
                          padding: '10px',
                          background: 'transparent',
                          border: 'none',
                          color: 'rgba(255,255,255,0.4)',
                          fontSize: 13,
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        Skip Description — Share Now
                      </button>
                    </div>
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

                {/* View count intentionally hidden from HUD - private to poster only */}
                {/* Phase 8 - Copy Link Toast */}
                {copyToast && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 80,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(0,212,255,0.15)',
                      border: '1px solid rgba(0,212,255,0.4)',
                      borderRadius: 12,
                      padding: '8px 20px',
                      color: '#00d4ff',
                      fontSize: 13,
                      fontWeight: 600,
                      zIndex: 300,
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    Link Copied!
                  </div>
                )}

                {/* Report Modal */}
                {showReportModal && (
                  <div
                    onClick={() => {
                      setShowReportModal(false);
                      setReportReason('');
                      setReportSubmitted(false);
                    }}
                    style={{
                      position: 'fixed',
                      inset: 0,
                      background: 'rgba(0,0,0,0.8)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 10002,
                    }}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: '#1a1a2e',
                        borderRadius: 16,
                        padding: 24,
                        width: '85%',
                        maxWidth: 360,
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      {reportSubmitted ? (
                        <div style={{ textAlign: 'center', color: 'white' }}>
                          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                          <div style={{ fontSize: 16, fontWeight: 600 }}>Report Submitted</div>
                          <div
                            style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}
                          >
                            Thank you. We will review this content.
                          </div>
                        </div>
                      ) : (
                        <>
                          <div
                            style={{
                              color: 'white',
                              fontWeight: 700,
                              fontSize: 18,
                              marginBottom: 16,
                            }}
                          >
                            Report This Reel
                          </div>
                          <div
                            style={{
                              color: 'rgba(255,255,255,0.6)',
                              fontSize: 13,
                              marginBottom: 12,
                            }}
                          >
                            Why are you reporting this content?
                          </div>
                          {[
                            'Inappropriate Content',
                            'Spam Or Scam',
                            'Harassment',
                            'Misinformation',
                            'Other',
                          ].map((reason) => (
                            <button
                              key={reason}
                              onClick={() => setReportReason(reason)}
                              style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '10px 14px',
                                marginBottom: 6,
                                borderRadius: 10,
                                fontSize: 14,
                                cursor: 'pointer',
                                background:
                                  reportReason === reason
                                    ? 'rgba(24,119,242,0.2)'
                                    : 'rgba(255,255,255,0.06)',
                                border:
                                  reportReason === reason
                                    ? '1px solid #1877F2'
                                    : '1px solid rgba(255,255,255,0.1)',
                                color: reportReason === reason ? '#1877F2' : 'white',
                              }}
                            >
                              {reason}
                            </button>
                          ))}
                          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                            <button
                              onClick={() => {
                                setShowReportModal(false);
                                setReportReason('');
                              }}
                              style={{
                                flex: 1,
                                padding: '10px',
                                borderRadius: 10,
                                fontSize: 14,
                                fontWeight: 600,
                                background: 'rgba(255,255,255,0.08)',
                                color: 'white',
                                border: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleReport}
                              disabled={!reportReason}
                              style={{
                                flex: 1,
                                padding: '10px',
                                borderRadius: 10,
                                fontSize: 14,
                                fontWeight: 600,
                                background: reportReason ? '#ef4444' : 'rgba(255,255,255,0.08)',
                                color: 'white',
                                border: 'none',
                                cursor: reportReason ? 'pointer' : 'not-allowed',
                                opacity: reportReason ? 1 : 0.5,
                              }}
                            >
                              Submit Report
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
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
