/**
 * REELS FEED CAROUSEL - SmarterPoker-style inline Reels in the feed
 * Horizontal scrollable carousel that appears between posts
 * Swipe right to see more reels
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  YouTubeErrorOverlay,
  reportFailureToServer,
} from '../../hooks/useYouTubeErrorManager';
import { supabase } from '../../lib/supabase';
import { useSupabase } from '../../providers/SupabaseProvider';
import { busEmit, eventBus, EventType } from '../../engine/EventBus';
import { getAccessToken, getAuthUser } from '../../lib/authUtils';
import Link from 'next/link';
import { useRouter } from 'next/router';
import GiphyPicker from '../shared/GiphyPicker';
import { fetchPokerReels } from '../../lib/reelsFeedClient';
import {
  loadReelFollowState,
  loadReelInteractionState,
  normaliseReelAuthorIds,
  normaliseReelIds,
} from '../../lib/reelInteractionHydration';
import { createLatestRequestGuard } from '../../lib/latestRequestGuard.mjs';
import { savedReelsService } from '../../services/preferences-service';
import {
  loadWatchedReelIds,
  loadNotInterestedReelIds,
  persistWatchedReelIds,
  persistNotInterestedReelIds,
  readReelsSessionFlag,
  safeSetReelsSessionStorage,
} from '../../lib/reelsWatchedStorage.mjs';
import { createReelAccountScope } from '../../lib/reelAccountScope.mjs';
import VideoLibraryConsole, {
  ConsoleCopy,
  ConsoleDataRow,
} from '../video-library/console/VideoLibraryConsole';

// Time ago helper
function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'Just Now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Format view count (456000 -> 456K)
function formatViews(count) {
  if (!count) return '0';
  if (count >= 1000000) return `${Math.floor(count / 1000000)}M`;
  if (count >= 1000) return `${Math.floor(count / 1000)}K`;
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
  const isYouTube = isYouTubeUrl(reel.video_url);
  const youtubeThumbnail = isYouTube
    ? reel.thumbnail_url || getYouTubeThumbnail(reel.video_url)
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="vlc-reel-card"
      aria-label={`Open reel by ${reel.profiles?.username || 'Poker Creator'}`}
    >
      <span className="vlc-reel-card__media">
        {isYouTube && youtubeThumbnail ? (
          <img src={youtubeThumbnail} alt={reel.caption || 'Reel'} loading="lazy" />
        ) : !isYouTube ? (
          <video
            src={reel.video_url}
            muted
            playsInline
            preload="none"
            poster={reel.thumbnail_url || undefined}
            aria-label={reel.caption || 'Poker reel preview'}
          />
        ) : (
          <span className="vlc-reel-card__fallback">Verified Poker Video</span>
        )}
      </span>
      <span className="vlc-reel-card__author">
        {reel.profiles?.avatar_url ? <img src={reel.profiles.avatar_url} alt="" /> : null}
        <span>{reel.profiles?.username || 'Poker Creator'}</span>
      </span>
      <span className="vlc-reel-card__caption">{reel.caption || 'Open Reel'}</span>
    </button>
  );
}

function ReelViewer({ reels, startIndex, onClose }) {
  const { user: providerUser } = useSupabase();
  const [authUser, setAuthUser] = useState(providerUser || null);
  const activeUserIdRef = useRef(providerUser?.id || null);
  const accountScopeRef = useRef(null);
  if (!accountScopeRef.current) {
    accountScopeRef.current = createReelAccountScope(providerUser?.id);
  }

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
  const [muted, setMuted] = useState(() => {
    // BUG FIX (2026-05-12 autoplay-final): muted is now bound to React state
    // (JSX uses muted={muted}, not muted={true}). Initialize from localStorage
    // so the user's unmute decision STICKS across reloads — same pattern
    // TikTok / Facebook use. First load defaults to muted=true (cold autoplay
    // is allowed without gesture); after the first gesture the preference
    // flips and persists indefinitely.
    if (typeof window === 'undefined') return true;
    try {
      return localStorage.getItem('sp:reels:muted') !== '0';
    } catch (_) {
      return true;
    }
  });
  // Persist muted preference across reloads — see useState initializer above.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('sp:reels:muted', muted ? '1' : '0');
    } catch (_) {
      /* sandboxed contexts may throw */
    }
  }, [muted]);
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
  const savedTargetsByReelRef = useRef(new Map());
  const [viewCounts, setViewCounts] = useState({});
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [showShortcutsOverlay, setShowShortcutsOverlay] = useState(false);

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
  const [showContextMenu, setShowContextMenu] = useState(false);
  const longPressTimerRef = useRef(null);
  // Long-press handlers (haptic defined later - accessed via ref)
  const handleLongPressTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      try {
        navigator?.vibrate?.(20);
      } catch (e) {
        console.warn('[ReelsFeedCarousel] Handled exception:', e);
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
    setWatchedReelIds(loadWatchedReelIds(activeUserIdRef.current));
  }, []);

  // #8 Share Options Modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingToFeed, setSharingToFeed] = useState(false);
  const [sharedToFeed, setSharedToFeed] = useState(false);
  // #7 Animated Like Counter
  const [likeBounceId, setLikeBounceId] = useState(null);
  // #4 Not Interested - persist disliked reel IDs in localStorage
  const [notInterestedIds, setNotInterestedIds] = useState(loadNotInterestedReelIds);
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
    setErrorToast(String(msg).replace(/\b[a-z]/g, (letter) => letter.toUpperCase()));
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
  const commentRequestGuardRef = useRef(null);
  const activeCommentReelIdRef = useRef(null);
  if (!commentRequestGuardRef.current) commentRequestGuardRef.current = createLatestRequestGuard();
  const viewedReelsRef = useRef(new Set());
  const reelFileInputRef = useRef(null);
  const videoRef = useRef(null);
  // Report state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const containerRef = useRef(null);
  const dialogRef = useRef(null);
  const overlayTimerRef = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const swipeStartRef = useRef(null);
  const swipeDeltaRef = useRef(0);
  // Session-sticky gesture flag: persisted to sessionStorage so it survives
  // re-renders and slot transitions. Once any user gesture is captured,
  // every subsequent video can unmute on its onPlaying event without an
  // extra click. See the matching fix in src/components/social/Reels.jsx.
  const userInteractedRef = useRef(readReelsSessionFlag('sp:reels:interacted'));
  // Stricter than userInteractedRef: only true when a gesture happened on
  // THIS page load. Browsers gate autoplay-with-sound per-document; the
  // sessionStorage-backed userInteractedRef can be true on reload without
  // any fresh gesture. YT iframe unMute is silently rejected in that
  // state. Use this ref for slot-transition setMuted(false) gates.
  const userGesturedThisLoadRef = useRef(false);
  const userWantsSoundRef = useRef(true); // User preference — persists across reel changes
  // Stall watchdog (parity with /hub/reels): cleared on onPlaying / onLoadedMetadata.
  // If neither fires within 6s of a native reel becoming active, treat URL as
  // broken/undecodable (HEVC silent-hang on Chrome desktop, dead Supabase URLs)
  // and auto-advance. YouTube iframes have their own onError + 3s skip overlay.
  const videoStallTimerRef = useRef(null);
  // Session-scoped skip set: any video URL whose decode failed (or stalled
  // past the watchdog) is added here so loadReels filters it out on the next
  // refresh. Lost on reload — correct, the worker may have transcoded HEVC by then.
  const brokenUrlsRef = useRef(new Set());
  const likeDebounceRef = useRef(false);
  const lastTapRef = useRef(0);
  const progressRAF = useRef(null);
  const ytIframeRef = useRef(null); // Persistent YouTube iframe ref — never remounted
  const ytIframeReadyRef = useRef(false); // True after first onLoad of persistent iframe
  const handleLikeRef = useRef(null);
  const handleSaveRef = useRef(null);
  const handleCommentsRef = useRef(null);
  // Stable refs so handleYTMessage can read fresh values without being re-registered on every swipe
  const currentIndexRef = useRef(0);
  const reelsRef = useRef([]);
  const goNextRef = useRef(null);

  const currentReel = reels[currentIndex];
  activeCommentReelIdRef.current = currentReel?.id || null;
  const interactionReelIds = useMemo(() => normaliseReelIds(reels), [reels]);
  const interactionAuthorIds = useMemo(() => normaliseReelAuthorIds(reels), [reels]);

  const clearAccountOwnedState = useCallback(() => {
    commentRequestGuardRef.current.abort();
    setLiked({});
    setDisliked({});
    setFollowing({});
    setSaved({});
    savedTargetsByReelRef.current = new Map();
    setWatchedReelIds(loadWatchedReelIds(activeUserIdRef.current));
    setNotInterestedIds(loadNotInterestedReelIds(activeUserIdRef.current));
    setShowComments(false);
    setReelComments([]);
    setCommentText('');
    setCommentLikes({});
    setCommentLikeCounts({});
    setReplyTo(null);
    setEditingComment(null);
    setEditCommentText('');
    setShowReelGifPicker(false);
    setReelCommentMediaUrl(null);
    setReelCommentMediaType(null);
    setUploadingReelImage(false);
    setShowShareModal(false);
    setSharingToFeed(false);
    setSharedToFeed(false);
    setShowMoreMenu(false);
    setShowReactionPicker(false);
    setShowContextMenu(false);
    setShowReportModal(false);
    setReportReason('');
    setReportSubmitted(false);
    setShareToast(false);
    setCopyToast(false);
    setErrorToast(null);
  }, []);

  const bindAuthUser = useCallback(
    (nextUser) => {
      const nextOwnerId = nextUser?.id || null;
      const changed = accountScopeRef.current.bind(nextOwnerId);
      activeUserIdRef.current = nextOwnerId;
      if (changed) clearAccountOwnedState();
      setAuthUser(nextUser || null);
    },
    [clearAccountOwnedState]
  );

  useEffect(() => {
    bindAuthUser(providerUser || null);
  }, [bindAuthUser, providerUser]);

  useEffect(() => {
    let cancelled = false;
    const hydrateCurrentUser = () => {
      const nextUser = getAuthUser() || null;
      if (!cancelled) bindAuthUser(nextUser);
    };
    hydrateCurrentUser();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) bindAuthUser(session?.user || null);
    });
    window.addEventListener('storage', hydrateCurrentUser);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', hydrateCurrentUser);
      subscription?.subscription?.unsubscribe?.();
    };
  }, [bindAuthUser]);

  // Phase 9: Watched Indicator Timer
  useEffect(() => {
    if (!currentReel?.id) return;
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    const watchTimer = setTimeout(() => {
      if (!ownerRequest.isCurrent()) return;
      setWatchedReelIds((prev) => {
        if (prev.includes(currentReel.id)) return prev;
        return persistWatchedReelIds([...prev, currentReel.id], ownerRequest.ownerId);
      });
    }, 3000); // 3 seconds = watched
    return () => clearTimeout(watchTimer);
  }, [currentReel?.id, authUser?.id]);

  // Hydrate interaction truth only for Reels loaded in this viewer. The helper
  // chunks IDs so query-string and PostgREST row limits cannot truncate state.
  useEffect(() => {
    const ownerId = activeUserIdRef.current;
    if (!ownerId || interactionReelIds.length === 0) {
      setLiked({});
      setDisliked({});
      setSaved({});
      savedTargetsByReelRef.current = new Map();
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    const ownerRequest = accountScopeRef.current.capture(ownerId);
    loadReelInteractionState(supabase, ownerId, reels, {
      loadSavedReels: (ownerId, reelIds, options) =>
        savedReelsService.getSavedReelsForIds(ownerId, reelIds, options),
      signal: controller.signal,
    })
      .then((state) => {
        if (cancelled || !ownerRequest.isCurrent()) return;
        setLiked(state.liked);
        setDisliked(state.disliked);
        setSaved(state.saved);
        savedTargetsByReelRef.current = new Map(Object.entries(state.savedTargets));
      })
      .catch((error) => {
        if (!cancelled && ownerRequest.isCurrent()) {
          setLiked({});
          setDisliked({});
          setSaved({});
          savedTargetsByReelRef.current = new Map();
          console.warn('[ReelCarousel] Interaction hydration failed:', error?.message || error);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authUser?.id, interactionReelIds, reels]);

  // Follow state is author-scoped and limited to creators in this viewer.
  useEffect(() => {
    const ownerId = activeUserIdRef.current;
    if (!ownerId || interactionAuthorIds.length === 0) {
      setFollowing({});
      return undefined;
    }
    let cancelled = false;
    const ownerRequest = accountScopeRef.current.capture(ownerId);
    loadReelFollowState(supabase, ownerId, interactionAuthorIds)
      .then((state) => {
        if (!cancelled && ownerRequest.isCurrent()) setFollowing(state);
      })
      .catch((error) => {
        if (!cancelled && ownerRequest.isCurrent()) {
          setFollowing({});
          console.warn('[ReelCarousel] Follow hydration failed:', error?.message || error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authUser?.id, interactionAuthorIds]);

  // EventBus listeners - sync like/bookmark from other viewers
  useEffect(() => {
    const handleLikeBus = (event) => {
      const d = event?.payload;
      if (d?.postId) {
        // Only update count for OTHER users to avoid conflicting with optimistic update
        if (d.userId !== authUser?.id) {
          setLikeCounts((prev) => ({
            ...prev,
            [d.postId]: Math.max(0, (prev[d.postId] || 0) + (d.added ? 1 : -1)),
          }));
        }
      }
    };
    const handleBookmarkBus = (event) => {
      const d = event?.payload;
      if (d?.postId && authUser?.id && d.userId === authUser.id) {
        setSaved((prev) => ({ ...prev, [d.postId]: d.added }));
        if (d.added) savedTargetsByReelRef.current.set(d.postId, [d.postId]);
        else savedTargetsByReelRef.current.delete(d.postId);
      }
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
      if (d?.followedId && authUser?.id && d.followerId === authUser.id) {
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
  }, [authUser?.id]);

  // Initialize counts from reel data — MERGE only, never overwrite existing optimistic values.
  // Critical: loadReels() fires on every Realtime INSERT. Without merge, optimistic like/view
  // updates are silently nuked the moment any new post appears in the feed.
  useEffect(() => {
    setLikeCounts((prev) => {
      const merged = { ...prev };
      reels.forEach((r) => {
        if (!(r.id in merged)) merged[r.id] = r.like_count || 0;
      });
      return merged;
    });
    setCommentCounts((prev) => {
      const merged = { ...prev };
      reels.forEach((r) => {
        if (!(r.id in merged)) merged[r.id] = r.comment_count || 0;
      });
      return merged;
    });
    setViewCounts((prev) => {
      const merged = { ...prev };
      reels.forEach((r) => {
        if (!(r.id in merged)) merged[r.id] = r.view_count || 0;
      });
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
    setCurrentIndex((prev) => {
      if (prev >= reelsRef.current.length - 1) return prev;
      return prev + 1;
    });
  }, []);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  // Keep stable refs in sync so the single-registered YT message handler always reads fresh data
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  useEffect(() => {
    reelsRef.current = reels;
  }, [reels]);
  useEffect(() => {
    goNextRef.current = goNext;
  }, [goNext]);

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
        // MUTE-PIVOT (2026-05-11 — parity with PR #380 on /hub/reels): mute
        // the player BEFORE loadVideoById so the new video boots muted, which
        // Chrome unconditionally allows to autoplay. Without this, the new
        // video tried to autoplay UNMUTED (because the player was unmuted
        // from the previous reel), Chrome blocked it, and YT paused → user
        // saw the play button on every swipe. The existing 100ms-deferred
        // unMute below already handles re-enabling sound after playback
        // starts. Trade-off: ~100ms of silence at start of each new reel.
        const wantsSoundAtSwipe = userInteractedRef.current && userWantsSoundRef.current;
        if (wantsSoundAtSwipe) sendYTCmd('mute');
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
            // Only flip React state if a gesture happened on THIS load.
            // Otherwise YT silently rejects unMute and React would lie.
            if (userGesturedThisLoadRef.current) setMuted(false);
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
      autoUnmuteRetryTimersRef.current.forEach((t) => clearTimeout(t));
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
    return () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, [showOverlay, paused]);

  // Lock body scroll while ReelViewer is mounted — class-based so the CSS
  // desktop failsafe in index.css can permit scroll on all OTHER pages.
  useEffect(() => {
    document.body.classList.add('reels-lock');
    document.documentElement.classList.add('reels-lock');
    return () => {
      commentRequestGuardRef.current?.abort();
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
      ytAutoplayTimersRef.current.forEach((t) => clearTimeout(t));
      ytAutoplayTimersRef.current = [];
      autoUnmuteRetryTimersRef.current.forEach((t) => clearTimeout(t));
      autoUnmuteRetryTimersRef.current = [];
    };
  }, []);

  // YouTube postMessage listener — registered ONCE at mount (empty deps) so swipes never
  // create a listener gap. All state reads go through stable refs to avoid stale closures.
  useEffect(() => {
    const YOUTUBE_ORIGINS = ['https://www.youtube-nocookie.com', 'https://www.youtube.com'];
    const handleYTMessage = (e) => {
      if (!YOUTUBE_ORIGINS.some((o) => e.origin === o)) return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.event === 'onStateChange') {
          if (data.info === 0) {
            // Video ended — advance via stable ref
            goNextRef.current?.();
          }
          if (data.info === 1) {
            // Playing
            setYtReady(true);
            setPaused(false);
            setYtError(null);
            // Show overlay briefly on play
            setShowOverlay(true);
            clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
            // Auto-unmute ONLY if user wants sound AND a real gesture has
            // been captured this tab session. Without the gesture gate,
            // YouTube's iframe API silently rejects the unMute postMessage
            // (no gesture context) and React state still flips to
            // muted=false — UI lie. Same gate as the IntersectionObserver
            // in src/components/social/Reels.jsx.
            autoUnmuteRetryTimersRef.current.forEach((t) => clearTimeout(t));
            if (userInteractedRef.current && userWantsSoundRef.current) {
              const doUnmute = () => {
                if (!userInteractedRef.current || !userWantsSoundRef.current) return;
                sendYTCmd('unMute');
                sendYTCmd('setVolume', [100]);
                // Only flip React state if a gesture happened on THIS load.
                // YT iframe is cross-origin so we cannot verify unMute landed.
                if (userGesturedThisLoadRef.current) setMuted(false);
              };
              doUnmute();
              autoUnmuteRetryTimersRef.current = [100, 300, 600].map((d) =>
                setTimeout(doUnmute, d)
              );
            } else {
              autoUnmuteRetryTimersRef.current = [];
            }
          }
          if (data.info === 2) {
            // Paused
            setPaused(true);
            setYtReady(true);
            setShowOverlay(true);
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
          }
        }
        if (data?.event === 'onError') {
          setYtError({ code: data.info });
          // Report to server (best-effort) — read index via stable ref
          try {
            const vid = getYouTubeVideoId(reelsRef.current[currentIndexRef.current]?.video_url);
            if (vid) {
              reportFailureToServer(vid, data.info, 'ReelsFeedCarousel');
            }
          } catch {
            /* best-effort */
          }
        }
      } catch (_) {}
    };
    window.addEventListener('message', handleYTMessage);
    return () => window.removeEventListener('message', handleYTMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // MUST stay [] — listener registered once; reads fresh data via refs

  const handleLike = async () => {
    if (!currentReel) return;
    const currentId = currentReel.id;
    const userId = activeUserIdRef.current;
    if (!userId) {
      showErrorToast('Sign in to like Reels');
      return;
    }
    const ownerRequest = accountScopeRef.current.capture(userId);
    if (likeDebounceRef.current) return;
    likeDebounceRef.current = true;
    setTimeout(() => {
      likeDebounceRef.current = false;
    }, 300);

    // Optimistic UI update - always fire so heart turns red immediately
    const wasLiked = liked[currentId];
    const wasDisliked = disliked[currentId];
    setLiked((prev) => ({ ...prev, [currentId]: !prev[currentId] }));
    setLikeCounts((prev) => ({
      ...prev,
      [currentId]: Math.max(0, (prev[currentId] || 0) + (wasLiked ? -1 : 1)),
    }));
    // #7 Animated Like Counter - trigger bounce
    // BUG FIX (RFC-3): cancel previous bounce timer before starting a new one.
    setLikeBounceId(currentId);
    if (likeBounceTimerRef.current) clearTimeout(likeBounceTimerRef.current);
    likeBounceTimerRef.current = setTimeout(() => {
      likeBounceTimerRef.current = null;
      setLikeBounceId(null);
    }, 400);

    // Mutual exclusion: remove dislike when liking
    let removedDislike = false;
    if (!wasLiked && wasDisliked) {
      setDisliked((prev) => ({ ...prev, [currentId]: false }));
      try {
        const { error } = await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', currentId)
          .eq('user_id', userId)
          .eq('reaction_type', 'dislike');
        if (error) throw error;
        if (!ownerRequest.isCurrent()) return;
        removedDislike = true;
      } catch (e) {
        if (!ownerRequest.isCurrent()) return;
        setDisliked((prev) => ({ ...prev, [currentId]: true }));
        setLiked((prev) => ({ ...prev, [currentId]: wasLiked }));
        setLikeCounts((prev) => ({
          ...prev,
          [currentId]: Math.max(0, (prev[currentId] || 0) + (wasLiked ? 1 : -1)),
        }));
        showErrorToast('Like failed - try again');
        return;
      }
    }

    try {
      if (wasLiked) {
        // DB trigger (trig_sync_like_count) handles like_count atomically - no RPC needed
        const { error } = await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', currentId)
          .eq('user_id', userId)
          .eq('reaction_type', 'like');
        if (error) throw error;
        if (!ownerRequest.isCurrent()) return;
        busEmit.socialPostLiked(currentId, userId, { added: false, reactionType: 'like' });
      } else {
        // DB trigger (trig_sync_like_count) handles like_count atomically - no RPC needed
        const { error } = await supabase
          .from('social_likes')
          .insert({ post_id: currentId, user_id: userId, reaction_type: 'like' });
        if (error) throw error;
        if (!ownerRequest.isCurrent()) return;
        busEmit.socialPostLiked(currentId, userId, { added: true, reactionType: 'like' });
      }
    } catch (err) {
      if (!ownerRequest.isCurrent()) return;
      console.warn('Reel like persistence failed:', err.message);
      showErrorToast('Like failed - resyncing state...');
      // Authoritative state resynchronization
      try {
        const counterTable = currentReel.source === 'posts' ? 'social_posts' : 'social_reels';
        const [postResult, likeResult] = await Promise.all([
          supabase.from(counterTable).select('like_count').eq('id', currentId).maybeSingle(),
          supabase
            .from('social_likes')
            .select('reaction_type')
            .eq('post_id', currentId)
            .eq('user_id', userId),
        ]);
        if (!ownerRequest.isCurrent()) return;
        if (postResult.error) throw postResult.error;
        if (likeResult.error) throw likeResult.error;
        if (postResult.data) {
          setLikeCounts((prev) => ({ ...prev, [currentId]: postResult.data.like_count || 0 }));
        }
        const reactions = likeResult.data || [];
        setLiked((prev) => ({
          ...prev,
          [currentId]: reactions.some((r) => r.reaction_type === 'like'),
        }));
        setDisliked((prev) => ({
          ...prev,
          [currentId]: reactions.some((r) => r.reaction_type === 'dislike'),
        }));
      } catch (e) {
        if (!ownerRequest.isCurrent()) return;
        console.warn('Resync failed:', e);
        setLiked((prev) => ({ ...prev, [currentId]: wasLiked }));
        setDisliked((prev) => ({ ...prev, [currentId]: removedDislike ? false : wasDisliked }));
        setLikeCounts((prev) => ({
          ...prev,
          [currentId]: Math.max(0, (prev[currentId] || 0) + (wasLiked ? 1 : -1)),
        }));
      }
    }
  };

  const handleDislike = async () => {
    if (!currentReel) return;
    const currentId = currentReel.id;
    const userId = activeUserIdRef.current;
    if (!userId) {
      showErrorToast('Sign in to manage Reel recommendations');
      return;
    }
    const ownerRequest = accountScopeRef.current.capture(userId);
    if (likeDebounceRef.current) return;
    likeDebounceRef.current = true;
    setTimeout(() => {
      likeDebounceRef.current = false;
    }, 300);

    const wasDisliked = disliked[currentId];
    const wasLiked = liked[currentId];
    setDisliked((prev) => ({ ...prev, [currentId]: !prev[currentId] }));
    // Mutual exclusion: remove like when disliking
    if (!wasDisliked && wasLiked) {
      setLiked((prev) => ({ ...prev, [currentId]: false }));
      setLikeCounts((prev) => ({ ...prev, [currentId]: Math.max(0, (prev[currentId] || 0) - 1) }));
    }

    let removedLike = false;
    if (!wasDisliked && wasLiked) {
      try {
        // DB trigger handles like_count decrement when like is removed - no RPC needed
        const { error } = await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', currentId)
          .eq('user_id', userId)
          .eq('reaction_type', 'like');
        if (error) throw error;
        if (!ownerRequest.isCurrent()) return;
        removedLike = true;
      } catch (e) {
        if (!ownerRequest.isCurrent()) return;
        setLiked((prev) => ({ ...prev, [currentId]: true }));
        setLikeCounts((prev) => ({ ...prev, [currentId]: (prev[currentId] || 0) + 1 }));
        setDisliked((prev) => ({ ...prev, [currentId]: wasDisliked }));
        showErrorToast('Dislike failed - try again');
        return;
      }
    }

    try {
      if (wasDisliked) {
        const { error } = await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', currentId)
          .eq('user_id', userId)
          .eq('reaction_type', 'dislike');
        if (error) throw error;
        if (!ownerRequest.isCurrent()) return;
        // #4 Not Interested - remove from filter
        setNotInterestedIds((prev) => {
          const n = new Set(prev);
          n.delete(currentId);
          return persistNotInterestedReelIds(n, userId);
        });
      } else {
        const { error } = await supabase
          .from('social_likes')
          .insert({ post_id: currentId, user_id: userId, reaction_type: 'dislike' });
        if (error) throw error;
        if (!ownerRequest.isCurrent()) return;
        // #4 Not Interested - add to filter
        setNotInterestedIds((prev) => {
          const n = new Set(prev);
          n.add(currentId);
          return persistNotInterestedReelIds(n, userId);
        });
        /*
         * Move off it. The load filter above keeps it away on every future
         * load, but without this the reel you just said you did not want stays
         * on screen until a reload - which reads as the button doing nothing,
         * which is how this feature looked for its whole life. goNext is
         * bounds-safe and stops at the last reel.
         */
        goNext();
      }
    } catch (err) {
      if (!ownerRequest.isCurrent()) return;
      console.warn('Reel dislike persistence failed:', err.message);
      showErrorToast('Action failed - resyncing state...');
      // Authoritative state resynchronization
      try {
        const counterTable = currentReel.source === 'posts' ? 'social_posts' : 'social_reels';
        const [postResult, likeResult] = await Promise.all([
          supabase.from(counterTable).select('like_count').eq('id', currentId).maybeSingle(),
          supabase
            .from('social_likes')
            .select('reaction_type')
            .eq('post_id', currentId)
            .eq('user_id', userId),
        ]);
        if (!ownerRequest.isCurrent()) return;
        if (postResult.error) throw postResult.error;
        if (likeResult.error) throw likeResult.error;
        if (postResult.data) {
          setLikeCounts((prev) => ({ ...prev, [currentId]: postResult.data.like_count || 0 }));
        }
        const reactions = likeResult.data || [];
        setLiked((prev) => ({
          ...prev,
          [currentId]: reactions.some((r) => r.reaction_type === 'like'),
        }));
        setDisliked((prev) => ({
          ...prev,
          [currentId]: reactions.some((r) => r.reaction_type === 'dislike'),
        }));
      } catch (e) {
        if (!ownerRequest.isCurrent()) return;
        console.warn('Resync failed:', e);
        setDisliked((prev) => ({ ...prev, [currentId]: wasDisliked }));
        setLiked((prev) => ({ ...prev, [currentId]: removedLike ? false : wasLiked }));
      }
    }
  };

  // Toggle comment drawer and load comments
  const handleToggleComments = async () => {
    const opening = !showComments;
    setShowComments(opening);
    if (!opening) {
      commentRequestGuardRef.current.abort();
      setLoadingMoreComments(false);
      return;
    }
    // Always fetch fresh comments when opening
    if (currentReel?.id) {
      const reelId = currentReel.id;
      const ownerRequest = accountScopeRef.current.capture();
      const commentRequest = commentRequestGuardRef.current.begin({ append: false });
      setCommentPage(0);
      try {
        const { data, error } = await supabase
          .from('social_comments')
          .select('*, profiles:author_id (username, avatar_url)')
          .eq('post_id', reelId)
          .order('created_at', { ascending: commentSort === 'oldest' })
          .limit(50);
        if (error) throw error;
        if (
          !ownerRequest.isCurrent() ||
          !commentRequest.isCurrent() ||
          activeCommentReelIdRef.current !== reelId
        )
          return;
        setReelComments(data || []);
        setHasMoreComments((data || []).length >= 50);
        // #6 Load comment like counts
        try {
          const { data: clData, error: commentLikesError } = await supabase
            .from('social_interactions')
            .select('metadata')
            .eq('post_id', reelId)
            .eq('interaction_type', 'comment_like');
          if (commentLikesError) throw commentLikesError;
          if (
            !ownerRequest.isCurrent() ||
            !commentRequest.isCurrent() ||
            activeCommentReelIdRef.current !== reelId
          )
            return;
          const clCounts = {};
          (clData || []).forEach((row) => {
            const cid = row.metadata?.comment_id;
            if (cid) clCounts[cid] = (clCounts[cid] || 0) + 1;
          });
          setCommentLikeCounts(clCounts);
        } catch (e) {
          if (
            ownerRequest.isCurrent() &&
            commentRequest.isCurrent() &&
            activeCommentReelIdRef.current === reelId
          ) {
            console.warn('[ReelsFeedCarousel] Handled exception:', e);
          }
        }
      } catch (error) {
        if (
          ownerRequest.isCurrent() &&
          commentRequest.isCurrent() &&
          activeCommentReelIdRef.current === reelId
        ) {
          console.warn('[ReelsFeedCarousel] Comment load failed:', error?.message || error);
          setReelComments([]);
        }
      } finally {
        commentRequest.finish();
      }
      if (
        !ownerRequest.isCurrent() ||
        !commentRequest.isCurrent() ||
        activeCommentReelIdRef.current !== reelId
      )
        return;
      // BUG FIX (RFC-4): cancel previous focus timer — prevents focus() on unmounted input.
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
    const reelId = currentReel.id;
    const ownerRequest = accountScopeRef.current.capture();
    const commentRequest = commentRequestGuardRef.current.begin({ append: true });
    if (!commentRequest) return;
    setLoadingMoreComments(true);
    const nextPage = commentPage + 1;
    try {
      const { data, error } = await supabase
        .from('social_comments')
        .select('*, profiles:author_id (username, avatar_url)')
        .eq('post_id', reelId)
        .order('created_at', { ascending: commentSort === 'oldest' })
        .range(nextPage * 50, (nextPage + 1) * 50 - 1);
      if (error) throw error;
      if (
        !ownerRequest.isCurrent() ||
        !commentRequest.isCurrent() ||
        activeCommentReelIdRef.current !== reelId
      )
        return;
      if (data && data.length > 0) {
        setReelComments((prev) => [...prev, ...data]);
        setCommentPage(nextPage);
        setHasMoreComments(data.length >= 50);
      } else {
        setHasMoreComments(false);
      }
    } catch (error) {
      if (
        ownerRequest.isCurrent() &&
        commentRequest.isCurrent() &&
        activeCommentReelIdRef.current === reelId
      ) {
        console.warn('[ReelsFeedCarousel] Comment pagination failed:', error?.message || error);
        setHasMoreComments(false);
      }
    } finally {
      if (ownerRequest.isCurrent() && commentRequest.finish()) setLoadingMoreComments(false);
    }
  };

  // Submit comment (supports text + GIF/image media)
  const handleSubmitComment = async (e) => {
    if (e && e.key !== 'Enter') return;
    const userId = activeUserIdRef.current;
    if ((!commentText.trim() && !reelCommentMediaUrl) || !userId || !currentReel?.id) return;
    const ownerRequest = accountScopeRef.current.capture(userId);
    const reelId = currentReel.id;
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
      const payload = { post_id: reelId, author_id: userId, content: text || '' };
      if (mediaUrl) {
        payload.media_url = mediaUrl;
        payload.media_type = mediaType;
      }
      if (parentId) {
        payload.parent_id = parentId;
      }
      const { error } = await supabase.from('social_comments').insert(payload);
      if (error) throw error;
      if (!ownerRequest.isCurrent()) return;
      busEmit.socialCommentAdded(reelId, userId);
      // DB trigger handles comment_count increment atomically
      setCommentCounts((prev) => ({ ...prev, [reelId]: (prev[reelId] || 0) + 1 }));
    } catch {
      if (!ownerRequest.isCurrent()) return;
      setReelComments((prev) => prev.filter((c) => c.id !== tempId));
      showErrorToast('Comment failed - please try again');
    }
  };

  // Phase 6 - Comment like toggle
  const handleCommentLike = async (commentId) => {
    const userId = activeUserIdRef.current;
    if (!userId || !currentReel?.id) return;
    const ownerRequest = accountScopeRef.current.capture(userId);
    const reelId = currentReel.id;
    // Guard: skip temp comments (optimistic, not yet DB-persisted).
    // Temp IDs are Date.now() — a 13-digit numeric string when cast.
    // Liking a temp ID would insert a dangling social_interactions row
    // with a non-UUID comment_id that can never be cleaned up.
    if (typeof commentId === 'number' || String(commentId).length === 13) return;
    const wasLiked = commentLikes[commentId];
    setCommentLikes((prev) => ({ ...prev, [commentId]: !wasLiked }));
    // #4 Optimistic comment like count sync
    setCommentLikeCounts((prev) => ({
      ...prev,
      [commentId]: Math.max(0, (prev[commentId] || 0) + (wasLiked ? -1 : 1)),
    }));
    try {
      if (wasLiked) {
        // Use .eq('metadata->>comment_id') not .match({metadata:{...}})
        // .match() applies JSONB '=' (exact object equality) and fails if
        // the stored value has any extra keys or different serialization.
        // The text-cast operator maps to the partial index on metadata->>'comment_id'.
        const { error } = await supabase
          .from('social_interactions')
          .delete()
          .eq('user_id', userId)
          .eq('post_id', reelId)
          .eq('interaction_type', 'comment_like')
          .eq('metadata->>comment_id', commentId);
        if (error) throw error;
        if (!ownerRequest.isCurrent()) return;
      } else {
        const { error } = await supabase.from('social_interactions').insert({
          user_id: userId,
          post_id: reelId,
          interaction_type: 'comment_like',
          metadata: { comment_id: commentId },
        });
        if (error) throw error;
        if (!ownerRequest.isCurrent()) return;
      }
    } catch (err) {
      if (!ownerRequest.isCurrent()) return;
      console.warn('Comment like persistence failed:', err.message);
      showErrorToast('Like failed - resyncing state...');
      // Authoritative state resynchronization
      try {
        // 2026-08-15 CHECK 13: comment likes live in social_interactions
        // (metadata->>comment_id), not social_likes — which has no comment_id
        // column, so this resync 42703'd and never resynced anything.
        const [{ data: commentData }, { data: likeData }] = await Promise.all([
          supabase.from('social_comments').select('like_count').eq('id', commentId).maybeSingle(),
          supabase
            .from('social_interactions')
            .select('id')
            .eq('user_id', userId)
            .eq('post_id', reelId)
            .eq('interaction_type', 'comment_like')
            .eq('metadata->>comment_id', commentId),
        ]);
        if (!ownerRequest.isCurrent()) return;
        if (commentData)
          setCommentLikeCounts((prev) => ({ ...prev, [commentId]: commentData.like_count || 0 }));
        if (likeData) setCommentLikes((prev) => ({ ...prev, [commentId]: likeData.length > 0 }));
      } catch (e) {
        if (ownerRequest.isCurrent()) console.warn('Resync failed:', e);
      }
    }
  };

  // Phase 6 - Delete own comment
  const handleDeleteComment = async (commentId) => {
    const userId = activeUserIdRef.current;
    if (!userId || !currentReel?.id) return;
    const ownerRequest = accountScopeRef.current.capture(userId);
    const reelId = currentReel.id;
    const deletedIndex = reelComments.findIndex((comment) => comment.id === commentId);
    const deletedComment = deletedIndex >= 0 ? reelComments[deletedIndex] : null;
    setReelComments((c) => c.filter((x) => x.id !== commentId));
    try {
      const { error } = await supabase
        .from('social_comments')
        .delete()
        .eq('id', commentId)
        .eq('author_id', userId);
      if (error) throw error;
      if (!ownerRequest.isCurrent()) return;
      // DB trigger handles comment_count decrement atomically
      setCommentCounts((p) => ({
        ...p,
        [reelId]: Math.max(0, (p[reelId] || 1) - 1),
      }));
      busEmit.socialCommentAdded && busEmit.socialCommentAdded(reelId, userId, { removed: true });
    } catch (error) {
      if (!ownerRequest.isCurrent()) return;
      console.warn('[ReelCarousel] Comment delete failed:', error?.message || error);
      if (activeCommentReelIdRef.current !== reelId || !deletedComment) return;
      setReelComments((current) => {
        if (current.some((comment) => comment.id === commentId)) return current;
        const restored = [...current];
        restored.splice(Math.min(deletedIndex, restored.length), 0, deletedComment);
        return restored;
      });
      showErrorToast('Delete failed - please try again');
    }
  };

  // Phase 7 - Edit own comment
  const handleEditComment = (comment) => {
    setEditingComment(comment.id);
    setEditCommentText(comment.content || '');
  };
  const handleSaveEdit = async (commentId) => {
    const userId = activeUserIdRef.current;
    if (!editCommentText.trim() || !userId || !currentReel?.id) return;
    const ownerRequest = accountScopeRef.current.capture(userId);
    const reelId = currentReel.id;
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
        .eq('author_id', userId);
      if (error) throw error;
      if (!ownerRequest.isCurrent()) return;
    } catch (error) {
      if (!ownerRequest.isCurrent()) return;
      console.warn('[ReelCarousel] Comment edit failed:', error?.message || error);
      if (activeCommentReelIdRef.current === reelId && orig) {
        setReelComments((prev) => prev.map((c) => (c.id === commentId ? orig : c)));
        showErrorToast('Edit failed - please try again');
      }
    }
    if (ownerRequest.isCurrent()) setEditCommentText('');
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
    const userId = activeUserIdRef.current;
    if (!file || !userId) return;
    const ownerRequest = accountScopeRef.current.capture(userId);
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
          const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
          if (!ownerRequest.isCurrent()) return;
          uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
          });
        } catch {
          uploadFile = file;
        }
      }
      if (!ownerRequest.isCurrent()) return;
      if (uploadFile.size > 4.5 * 1024 * 1024) {
        if (!ownerRequest.isCurrent()) return;
        showErrorToast('Image Is Too Large. Maximum 4608 KB.');
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
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await resp.json();
      if (ownerRequest.isCurrent() && resp.ok && result.success) {
        setReelCommentMediaUrl(result.url);
        setReelCommentMediaType('image');
      }
    } catch (err) {
      if (ownerRequest.isCurrent()) console.warn('[ReelComment] Upload error:', err);
    }
    if (ownerRequest.isCurrent()) setUploadingReelImage(false);
  };

  // Share handler - opens share modal only; repost to feed requires explicit user tap
  const handleShare = () => {
    if (!currentReel?.id) return;
    haptic(10);
    setShowShareModal(true);
  };

  const shareReelUrl = currentReel
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}/hub/reels?id=${encodeURIComponent(currentReel.id)}`
    : '';

  const handleShareAction = async (platform) => {
    const reel = currentReel;
    const userId = activeUserIdRef.current;
    const ownerRequest = accountScopeRef.current.capture(userId);
    if (!reel?.id) return;
    setShowShareModal(false);
    const url = shareReelUrl;
    const title = 'Check out this poker reel on Smarter.Poker';
    try {
      if (platform === 'copy') {
        await navigator.clipboard.writeText(url);
        if (!ownerRequest.isCurrent()) return;
        // BUG FIX (RFC-5): cancel previous share toast timer before scheduling a new one.
        if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
        setShareToast(true);
        shareToastTimerRef.current = setTimeout(() => {
          shareToastTimerRef.current = null;
          setShareToast(false);
        }, 2000);
      } else if (platform === 'native' && navigator.share) {
        await navigator.share({ title, url });
        if (!ownerRequest.isCurrent()) return;
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
      // Clipboard copy = link preview, not a social share — skip metric + bus event
      if (platform !== 'copy') {
        if (!ownerRequest.isCurrent()) return;
        incrementMetric(reel, 'share_count', 1);
        if (userId) busEmit.socialPostShared(reel.id, userId);
      }
    } catch {
      if (!ownerRequest.isCurrent()) return;
      // BUG FIX (RFC-5 fallback): same cancel-before-reschedule pattern in error path
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
      setShareToast(true);
      shareToastTimerRef.current = setTimeout(() => {
        shareToastTimerRef.current = null;
        setShareToast(false);
      }, 2000);
    }
  };

  // Share to My Feed - creates a social_posts entry linking this reel
  const handleShareToFeed = async () => {
    const reel = currentReel;
    const userId = activeUserIdRef.current;
    if (!reel?.id || !userId || sharingToFeed) return;
    const ownerRequest = accountScopeRef.current.capture(userId);
    setSharingToFeed(true);
    try {
      const videoUrl = reel.video_url;
      const caption = reel.caption || 'Check out this reel!';
      const reelLink = window.location.origin + '/hub/reels?id=' + reel.id;
      // #5 Duplicate guard
      const { data: existing } = await supabase
        .from('social_posts')
        .select('id')
        .eq('author_id', userId)
        .eq('link_url', reelLink)
        .limit(1);
      if (!ownerRequest.isCurrent()) return;
      if (existing && existing.length > 0) {
        setSharedToFeed(true);
        setSharingToFeed(false);
        // BUG FIX (RFC-6): cancel-before-reschedule, prevent setState-after-unmount
        if (sharedToFeedTimerRef.current) clearTimeout(sharedToFeedTimerRef.current);
        sharedToFeedTimerRef.current = setTimeout(() => {
          sharedToFeedTimerRef.current = null;
          setSharedToFeed(false);
        }, 3000);
        return;
      }
      const postContent = caption + '\n\n' + reelLink;
      const { error } = await supabase.from('social_posts').insert({
        author_id: userId,
        content: postContent,
        content_type: videoUrl ? 'video' : 'text',
        media_urls: videoUrl ? [videoUrl] : [],
        visibility: 'public',
        link_url: reelLink,
      });
      if (error) throw error;
      if (!ownerRequest.isCurrent()) return;
      incrementMetric(reel, 'share_count', 1);
      busEmit.socialPostShared(reel.id, userId);
      busEmit.dataMutated('social');
      setSharedToFeed(true);
      // BUG FIX (RFC-6): cancel-before-reschedule on success path
      if (sharedToFeedTimerRef.current) clearTimeout(sharedToFeedTimerRef.current);
      sharedToFeedTimerRef.current = setTimeout(() => {
        sharedToFeedTimerRef.current = null;
        setSharedToFeed(false);
      }, 3000);
    } catch (err) {
      if (!ownerRequest.isCurrent()) return;
      console.warn('Share to feed failed:', err.message);
      showErrorToast('Share failed - try again');
    }
    if (ownerRequest.isCurrent()) setSharingToFeed(false);
  };

  const handleReport = async () => {
    if (!currentReel?.id || !reportReason.trim()) return;
    const userId = activeUserIdRef.current;
    if (!userId) return;
    const ownerRequest = accountScopeRef.current.capture(userId);
    try {
      const { error } = await supabase.from('social_interactions').insert({
        user_id: userId,
        post_id: currentReel.id,
        interaction_type: 'report',
        metadata: { reason: reportReason.trim() },
      });
      if (error) throw error;
      if (!ownerRequest.isCurrent()) return;
      setReportSubmitted(true);
      // BUG FIX (RFC-7): track report modal dismiss timer — prevents setState-after-unmount.
      if (reportModalTimerRef.current) clearTimeout(reportModalTimerRef.current);
      reportModalTimerRef.current = setTimeout(() => {
        reportModalTimerRef.current = null;
        setShowReportModal(false);
        setReportSubmitted(false);
        setReportReason('');
      }, 2000);
    } catch (err) {
      if (!ownerRequest.isCurrent()) return;
      // Roll back the optimistic submitted state and show an error
      setReportSubmitted(false);
      console.warn('[ReelsFeedCarousel] Report submission failed:', err?.message || err);
      showErrorToast('Report failed - please try again');
    }
  };

  // (Duplicate YouTube auto-advance listener removed — merged into the single
  //  handleYTMessage listener at lines ~598-635 to prevent double goNext() calls)

  const handleFollow = async () => {
    const authorId = currentReel?.author_id || currentReel?.profiles?.id;
    const userId = activeUserIdRef.current;
    if (!authorId || !userId || authorId === userId) return;
    const ownerRequest = accountScopeRef.current.capture(userId);
    const wasFollowing = following[authorId];
    setFollowing((prev) => ({ ...prev, [authorId]: !prev[authorId] }));
    haptic(wasFollowing ? 5 : 15);
    try {
      if (wasFollowing) {
        const { error } = await supabase
          .from('social_follows')
          .delete()
          .eq('follower_id', userId)
          .eq('following_id', authorId);
        if (error) throw error;
        if (!ownerRequest.isCurrent()) return;
      } else {
        const { error } = await supabase
          .from('social_follows')
          .insert({ follower_id: userId, following_id: authorId });
        if (error) throw error;
        if (!ownerRequest.isCurrent()) return;
      }
      busEmit.socialFollowChanged &&
        busEmit.socialFollowChanged(authorId, userId, { added: !wasFollowing });
    } catch {
      if (!ownerRequest.isCurrent()) return;
      setFollowing((prev) => ({ ...prev, [authorId]: wasFollowing }));
      showErrorToast('Follow failed - try again');
    }
  };

  // Secondary reset on reel change: comment state, view tracking, native video play.
  // NOTE: paused/ytReady/ytError resets are in the PRIMARY effect above (~line 531).
  // This effect handles the remaining state and native video autoplay.
  // dep: currentIndex ONLY - do NOT add `reels` (causes double-fire + play on unloaded src)
  useEffect(() => {
    commentRequestGuardRef.current.abort();
    setLoadingMoreComments(false);
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
    const viewCountTimer =
      reelId && authUser?.id && !viewedReelsRef.current.has(reelId)
        ? setTimeout(() => {
            viewedReelsRef.current.add(reelId);
            setViewCounts((prev) => ({
              ...prev,
              [reelId]: (prev[reelId] || reels[currentIndex]?.view_count || 0) + 1,
            }));
            incrementMetric(reels[currentIndex], 'view_count', 1);
          }, 2000)
        : null;

    // Native video autoplay — only runs for non-YouTube reels.
    // Play via canplay event because the video element may be remounting due to key change;
    // calling play() immediately causes AbortError on mobile Safari.
    const reel = reels[currentIndex];
    const isNativeVideo = reel && !isYouTubeUrl(reel.video_url);
    const video = isNativeVideo ? videoRef.current : null;
    if (!video)
      return () => {
        clearTimeout(viewCountTimer);
      };
    // For native video, set ytReady immediately when play starts so the
    // pause/play button is visible without waiting for the 5s fallback timer.
    const onPlay = () => setYtReady(true);
    video.addEventListener('play', onPlay, { once: true });
    const onCanPlay = () => {
      const p = video.play();
      if (p !== undefined)
        p.catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e)); // suppress AbortError
    };
    if (video.readyState >= 3) {
      const p = video.play();
      if (p !== undefined)
        p.catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
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
      setCurrentIndex((prev) => {
        if (prev < reels.length - 1) return prev + 1;
        return prev;
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [ytError, reels.length]);

  // ─── Stall watchdog (parity with /hub/reels) ──────────────────────────
  // For NATIVE video reels only (YouTube iframes have their own onError +
  // 3s auto-advance above): start a 6s timer when currentReel changes.
  // If the active <video> doesn't reach readyState >= 2 by then, treat as
  // broken/undecodable and auto-advance. The onPlaying / onLoadedMetadata
  // handlers clear this timer on success. Catches HEVC silent-hang on
  // Chrome desktop, broken MP4s, and dead Supabase Storage URLs.
  useEffect(() => {
    if (!currentReel?.id) return;
    const url = currentReel?.video_url || '';
    if (!url || isYouTubeUrl(url)) return;
    if (videoStallTimerRef.current) clearTimeout(videoStallTimerRef.current);
    videoStallTimerRef.current = setTimeout(() => {
      videoStallTimerRef.current = null;
      const v = videoRef.current;
      if (v && v.readyState < 2) {
        console.warn('[ReelsFeedCarousel] video stall watchdog tripped - auto-skipping', {
          src: url,
          readyState: v.readyState,
          networkState: v.networkState,
          reason: 'No metadata after 6s - likely HEVC/corrupt/dead URL',
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
  }, [currentReel?.id, currentReel?.video_url]);

  // Haptic helper
  const haptic = (ms = 10) => {
    try {
      navigator?.vibrate?.(ms);
    } catch (e) {
      console.warn('[ReelsFeedCarousel] Handled exception:', e);
    }
  };

  // Save/Bookmark handler
  const handleSave = async () => {
    const reel = currentReel;
    const userId = activeUserIdRef.current;
    if (!reel?.id || !userId) return;
    const ownerRequest = accountScopeRef.current.capture(userId);
    const wasSaved = saved[reel.id];
    setSaved((prev) => ({ ...prev, [reel.id]: !prev[reel.id] }));
    haptic(wasSaved ? 5 : 15);
    try {
      if (wasSaved) {
        const savedTargets = savedTargetsByReelRef.current.get(reel.id);
        await savedReelsService.unsaveReel(
          userId,
          savedTargets?.length ? savedTargets : [reel.id, reel.source_post_id].filter(Boolean)
        );
        if (!ownerRequest.isCurrent()) return;
        savedTargetsByReelRef.current.delete(reel.id);
      } else {
        await savedReelsService.saveReel(userId, reel.id, 'reel');
        if (!ownerRequest.isCurrent()) return;
        savedTargetsByReelRef.current.set(reel.id, [reel.id]);
      }
      try {
        busEmit.socialPostBookmarked(reel.id, userId, { added: !wasSaved });
      } catch (eventError) {
        console.warn('[ReelCarousel] Bookmark event failed:', eventError?.message || eventError);
      }
    } catch {
      if (!ownerRequest.isCurrent()) return;
      setSaved((prev) => ({ ...prev, [reel.id]: wasSaved }));
      showErrorToast('Save failed - try again');
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

  // ─── Global gesture capture for autoplay-with-sound ─────────────────────
  // First user gesture (pointerdown/keydown/wheel/touchstart anywhere on the
  // page) marks userInteractedRef true and persists to sessionStorage. After
  // that, every video can unmute on its onPlaying event without an extra
  // click. Mirrors the matching effect in src/components/social/Reels.jsx.
  useEffect(() => {
    // No early-return on userInteractedRef being already true (sticky from
    // sessionStorage). On reload we must keep listening so the FIRST gesture
    // this page load flips userGesturedThisLoadRef and unblocks setMuted(false)
    // in slot-transition paths.
    const onGesture = () => {
      // Always flip per-load ref — every gesture refreshes the gate.
      userGesturedThisLoadRef.current = true;
      // Sticky tab-session flag (idempotent after first set).
      if (!userInteractedRef.current) {
        userInteractedRef.current = true;
        try {
          safeSetReelsSessionStorage('sp:reels:interacted', '1');
        } catch (_) {}
      }
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
    const opts = { capture: true, passive: true };
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

  // The master is the only visible surface. Keep focus in its live controls
  // and return it to the actual carousel trigger when the viewer closes.
  useEffect(() => {
    const returnFocus = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const trapFocus = (event) => {
      if (event.key !== 'Tab') return;
      const controls = [
        ...(dialogRef.current?.querySelectorAll(
          'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]'
        ) || []),
      ].filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      document.body.style.overflow = oldOverflow;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (
      showComments ||
      showShareModal ||
      showReportModal ||
      showContextMenu ||
      showMoreMenu ||
      showReactionPicker ||
      showShortcutsOverlay
    ) {
      dialogRef.current?.focus();
    }
  }, [
    showComments,
    showShareModal,
    showReportModal,
    showContextMenu,
    showMoreMenu,
    showReactionPicker,
    showShortcutsOverlay,
  ]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      // Don't intercept keyboard while typing in an input/textarea
      const tag = e.target.tagName;
      if (
        e.key !== 'Escape' &&
        (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable)
      )
        return;
      if (
        showComments ||
        showShareModal ||
        showReportModal ||
        showContextMenu ||
        showMoreMenu ||
        showReactionPicker ||
        showShortcutsOverlay
      ) {
        if (e.key === 'Escape') {
          setShowComments(false);
          setShowShareModal(false);
          setShowReportModal(false);
          setShowContextMenu(false);
          setShowMoreMenu(false);
          setShowReactionPicker(false);
          setShowShortcutsOverlay(false);
          setShowReelGifPicker(false);
          dialogRef.current?.focus();
        }
        return;
      }
      if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp'
      ) {
        // BUG FIX (2026-05-11): sync-unmute inside the keypress gesture so
        // Chrome accepts the unMute postMessage for the next iframe. Without
        // this the new iframe's onStateChange(1) unmute runs after the
        // keypress gesture has expired and YouTube silently rejects it.
        // Mirrors the existing window-level gesture-capture pattern (which
        // only unmutes the CURRENT iframe, not the next one).
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
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        goNext();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        goPrev();
      }
      if (e.key === 'Escape') {
        if (showComments) setShowComments(false);
        else onClose();
      }
      // BUG FIX: Space bar is the universal play/pause shortcut — was missing
      // Uses DOM refs only to avoid stale closures
      if (e.key === ' ') {
        e.preventDefault();
        if (
          videoRef.current &&
          !isYouTubeUrl(reelsRef.current[currentIndexRef.current]?.video_url)
        ) {
          if (videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          } else {
            videoRef.current.pause();
          }
        } else {
          // YouTube — use sendYTCmd with persistent iframe ref
          setPaused((prev) => {
            sendYTCmd(prev ? 'playVideo' : 'pauseVideo');
            return !prev;
          });
        }
      }
      if (e.key === 'm' || e.key === 'M') {
        setMuted((prev) => {
          const next = !prev;
          sendYTCmd(next ? 'mute' : 'unMute');
          if (!next) sendYTCmd('setVolume', [100]);
          userWantsSoundRef.current = !next;
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
  }, [
    currentIndex,
    onClose,
    showComments,
    showShareModal,
    showReportModal,
    showContextMenu,
    showMoreMenu,
    showReactionPicker,
    showShortcutsOverlay,
  ]);

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
        userWantsSoundRef.current = true;
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
        userWantsSoundRef.current = true;
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

  const closePanel = () => {
    setShowComments(false);
    setShowShareModal(false);
    setShowReportModal(false);
    setShowContextMenu(false);
    setShowMoreMenu(false);
    setShowReactionPicker(false);
    setShowShortcutsOverlay(false);
    setShowReelGifPicker(false);
    setReportReason('');
    setReportSubmitted(false);
  };
  const panelTitle = showReportModal
    ? 'Report This Reel'
    : showShareModal
      ? 'Share This Reel'
      : showContextMenu
        ? 'Reel Actions'
        : showShortcutsOverlay
          ? 'Keyboard Shortcuts'
          : showReactionPicker
            ? 'Choose A Reaction'
            : showMoreMenu
              ? 'Playback Options'
              : showComments
                ? 'Reel Comments'
                : null;
  const togglePlayback = () => {
    userInteractedRef.current = true;
    if (isYouTubeUrl(currentReel.video_url)) {
      sendYTCmd(paused ? 'playVideo' : 'pauseVideo');
      setPaused(!paused);
      setYtReady(true);
    } else if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => showErrorToast('Tap Play To Resume'));
      } else videoRef.current.pause();
    }
  };
  const toggleSound = () => {
    setMuted((previous) => {
      const next = !previous;
      sendYTCmd(next ? 'mute' : 'unMute');
      if (!next) sendYTCmd('setVolume', [100]);
      userWantsSoundRef.current = !next;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  };

  return (
    <div
      className="vlc-carousel-viewer-shell"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="carousel-viewer-title"
      tabIndex={-1}
    >
      <VideoLibraryConsole
        eyebrow="Social Feed"
        title={panelTitle || 'Reel Viewer'}
        titleId="carousel-viewer-title"
        titleAs="h1"
        subtitle={
          currentReel.profiles?.username ? `By ${currentReel.profiles.username}` : 'Poker Video'
        }
        pill={`${currentIndex + 1} Of ${reels.length}`}
        pillInk="blue"
        foot="plates"
        plates={
          panelTitle
            ? {
                secondary: { label: 'Close Viewer', onClick: onClose, ink: 'silver' },
                primary: { label: 'Back To Reel', onClick: closePanel, ink: 'white' },
              }
            : {
                secondary: {
                  label: 'Previous Reel',
                  onClick: goPrev,
                  disabled: currentIndex === 0,
                  ink: 'silver',
                },
                primary: {
                  label: 'Next Reel',
                  onClick: goNext,
                  disabled: currentIndex >= reels.length - 1,
                  ink: 'white',
                },
              }
        }
        className="vlc-carousel-viewer-console"
      >
        <div className="vlc-carousel-viewer-toolbar">
          <button type="button" onClick={onClose} aria-label="Close">
            Close Viewer
          </button>
          {panelTitle && (
            <button type="button" onClick={closePanel}>
              Back To Reel
            </button>
          )}
        </div>
        <div className="vlc-carousel-viewer-layout" hidden={Boolean(panelTitle)}>
          <div
            ref={containerRef}
            className="vlc-carousel-viewer-stage"
            data-overlay-visible={showOverlay}
          >
            {/* FULL-SCREEN TOUCH OVERLAY — handles taps + swipes ABOVE the iframe */}
            <div
              onTouchStart={(e) => {
                swipeStartRef.current = {
                  y: e.touches[0].clientY,
                  x: e.touches[0].clientX,
                  t: Date.now(),
                };
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
                  try {
                    navigator?.vibrate?.(10);
                  } catch (_) {}
                  if (userWantsSoundRef.current) {
                    sendYTCmd('unMute');
                    sendYTCmd('setVolume', [100]);
                    setMuted(false);
                    userWantsSoundRef.current = true;
                  }
                  if (delta < 0) goNext();
                  else goPrev();
                  return;
                }
              }}
              onClick={handleTap}
              onContextMenu={(e) => {
                e.preventDefault();
                setShowContextMenu(true);
              }}
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 5,
                touchAction: 'none',
                cursor: 'pointer',
              }}
            />

            <div className="vlc-carousel-viewer-media">
              {/* YouTube thumbnail — instant visual feedback while iframe loads */}
              {isYouTubeUrl(currentReel.video_url) && (
                <img
                  src={`https://img.youtube.com/vi/${getYouTubeVideoId(currentReel.video_url)}/maxresdefault.jpg`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    zIndex: 0,
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
                const firstYTReel = reels.find((r) => isYouTubeUrl(r.video_url));
                const initialVideoId = firstYTReel
                  ? getYouTubeVideoId(firstYTReel.video_url)
                  : null;
                if (!initialVideoId) return null; // No YouTube reels at all — skip iframe entirely
                const isCurrentYT = isYouTubeUrl(currentReel.video_url);
                return (
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      display: isCurrentYT ? 'block' : 'none', // Hide but keep alive
                    }}
                  >
                    <iframe
                      ref={ytIframeRef}
                      src={`https://www.youtube-nocookie.com/embed/${initialVideoId}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1&controls=0&showinfo=0&iv_load_policy=3&fs=0&disablekb=1&cc_load_policy=0&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        pointerEvents: 'none',
                        position: 'relative',
                        zIndex: 1,
                      }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      onLoad={() => {
                        ytIframeReadyRef.current = true;
                        // Force play + unmute via postMessage
                        sendYTCmd('playVideo');
                        if (userInteractedRef.current && userWantsSoundRef.current) {
                          sendYTCmd('unMute');
                          sendYTCmd('setVolume', [100]);
                          // Only flip React state if a gesture happened on THIS load.
                          // YT iframe is cross-origin so we cannot verify unMute.
                          if (userGesturedThisLoadRef.current) setMuted(false);
                        }
                        // BUG FIX (RFC-8): cancel any previous retry batch before
                        // scheduling new ones — prevents stale postMessage to old iframe
                        // when user swipes while the timers are pending.
                        ytAutoplayTimersRef.current.forEach((t) => clearTimeout(t));
                        ytAutoplayTimersRef.current = [300, 800, 1500].map((delay) =>
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
                  </div>
                );
              })()}

              {/* Native video element — shown for direct uploads, hidden for YouTube */}
              <video
                ref={videoRef}
                key={currentReel.id}
                src={!isYouTubeUrl(currentReel.video_url) ? currentReel.video_url : undefined}
                autoPlay={!isYouTubeUrl(currentReel.video_url)}
                // Always render muted=true so the browser permits autoplay
                // unconditionally. The new onPlaying handler flips muted=false
                // synchronously inside the playing event IF the user has
                // gestured this tab session — see the global gesture-capture
                // useEffect added above.
                muted={muted}
                playsInline
                poster={currentReel.thumbnail_url || undefined}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: !isYouTubeUrl(currentReel.video_url) ? 'block' : 'none',
                }}
                onPlaying={(e) => {
                  // Successful playback — clear stall watchdog so it doesn't
                  // auto-skip a video that simply took longer to start.
                  if (videoStallTimerRef.current) {
                    clearTimeout(videoStallTimerRef.current);
                    videoStallTimerRef.current = null;
                  }
                  // Verify-after-unmute: when sessionStorage[sp:reels:interacted]
                  // is preset from a prior page load, userInteractedRef is true
                  // but the browser hasn't seen a fresh gesture this load. Setting
                  // muted=false may be silently ignored. Only flip React state
                  // after confirming the DOM accepted the change — never lie.
                  if (userInteractedRef.current && userWantsSoundRef.current) {
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
                  // Metadata reached → video IS decodable. Clear stall watchdog.
                  if (videoStallTimerRef.current) {
                    clearTimeout(videoStallTimerRef.current);
                    videoStallTimerRef.current = null;
                  }
                }}
                onError={(e) => {
                  // Surface decode failures (most commonly HEVC on Chrome desktop —
                  // Chrome doesn't license H.265). Without this, users saw a black
                  // box with the play button forever. Now: record broken URL in
                  // session-scoped skip-set, then auto-advance.
                  const err = e.currentTarget?.error;
                  const url = currentReel?.video_url;
                  console.warn('[ReelsFeedCarousel] video decode failed', {
                    code: err?.code,
                    message: err?.message,
                    src: url,
                    suggestion: 'Likely H.265/HEVC - needs server-side transcode to H.264',
                  });
                  if (typeof window !== 'undefined') {
                    window.__reelDecodeError = (window.__reelDecodeError || 0) + 1;
                  }
                  if (url) brokenUrlsRef.current.add(url);
                  if (videoStallTimerRef.current) {
                    clearTimeout(videoStallTimerRef.current);
                    videoStallTimerRef.current = null;
                  }
                  goNext();
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
              {Array.from({ length: 10 }, (_, offset) => offset + 1).map((offset) => {
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
                      style={{
                        position: 'absolute',
                        width: 1,
                        height: 1,
                        opacity: 0,
                        pointerEvents: 'none',
                      }}
                      alt=""
                    />
                  );
                } else {
                  return (
                    <link key={`preload-${nextReel.id}`} rel="preload" href={nextUrl} as="video" />
                  );
                }
              })}
            </div>
            {paused && ytReady && !ytError && (
              <span className="vlc-carousel-play-state" aria-live="polite">
                Paused
              </span>
            )}
            {showHeart && (
              <span className="vlc-carousel-like-confirmation" role="status">
                Liked
              </span>
            )}
            {ytError && (
              <YouTubeErrorOverlay
                errorCode={ytError}
                videoId={getYouTubeVideoId(currentReel.video_url)}
                videoUrl={currentReel.video_url}
                thumbnailUrl={getYouTubeThumbnail(currentReel.video_url)}
                actionLabel="Skipping In 3 Seconds"
              />
            )}
          </div>
          <div className="vlc-carousel-viewer-details">
            <div className="vlc-carousel-command-grid">
              <button type="button" onClick={togglePlayback}>
                {paused ? 'Play' : 'Pause'}
              </button>
              <button type="button" onClick={toggleSound}>
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                type="button"
                onClick={() => {
                  handleLike();
                  if (!liked[currentReel.id]) {
                    setShowHeart(true);
                    clearTimeout(showHeartTimerRef.current);
                    showHeartTimerRef.current = setTimeout(() => setShowHeart(false), 800);
                  }
                }}
                onPointerDown={() => {
                  clearTimeout(reactionTimerRef.current);
                  reactionTimerRef.current = setTimeout(() => {
                    haptic(20);
                    setShowReactionPicker(true);
                  }, 500);
                }}
                onPointerUp={() => clearTimeout(reactionTimerRef.current)}
                onPointerLeave={() => clearTimeout(reactionTimerRef.current)}
                onPointerCancel={() => clearTimeout(reactionTimerRef.current)}
                aria-label={liked[currentReel.id] ? 'Unlike' : 'Like'}
                aria-pressed={Boolean(liked[currentReel.id])}
              >
                {liked[currentReel.id] ? 'Liked' : 'Like'}{' '}
                {formatViews(likeCounts[currentReel.id] || 0)}
              </button>
              <button type="button" onClick={handleToggleComments} aria-label="Comments">
                Comments {formatViews(commentCounts[currentReel.id] || 0)}
              </button>
              <button
                type="button"
                onClick={() => {
                  handleShare();
                  haptic(10);
                }}
                aria-label="Share"
              >
                Share
              </button>
              <button
                type="button"
                onClick={handleSave}
                aria-label={saved[currentReel.id] ? 'Unsave' : 'Save'}
                aria-pressed={Boolean(saved[currentReel.id])}
              >
                {saved[currentReel.id] ? 'Saved' : 'Save'}
              </button>
              <button type="button" onClick={() => setShowReactionPicker(true)}>
                Reactions
              </button>
              <button type="button" onClick={() => setShowMoreMenu(true)} aria-label="More Options">
                More Options
              </button>
            </div>
            <div className="vlc-carousel-author">
              {currentReel.profiles?.avatar_url && (
                <img src={currentReel.profiles.avatar_url} alt="" />
              )}
              {currentReel.profiles?.username ? (
                <Link href={`/hub/user/${currentReel.profiles.username}`}>
                  {currentReel.profiles.full_name || currentReel.profiles.username}
                </Link>
              ) : (
                <span>Poker Creator</span>
              )}
            </div>
            <ConsoleDataRow label="Published" value={timeAgo(currentReel.created_at)} />
            <ConsoleDataRow
              label="Views"
              value={formatViews(viewCounts[currentReel.id] || currentReel.view_count || 0)}
            />
            {watchedReelIds.includes(currentReel.id) && (
              <ConsoleDataRow label="Watch State" value="Watched" valueInk="blue" />
            )}
            {!isYouTubeUrl(currentReel.video_url) && (
              <ConsoleDataRow label="Playback" value={`${Math.floor(progress)}%`} />
            )}
            {currentReel.author_id && authUser?.id && currentReel.author_id !== authUser.id && (
              <button
                type="button"
                onClick={handleFollow}
                aria-pressed={Boolean(following[currentReel.author_id])}
              >
                {following[currentReel.author_id] ? 'Following' : 'Follow Creator'}
              </button>
            )}
            {currentReel.caption && (
              <ConsoleCopy>
                {captionExpanded || currentReel.caption.length <= 100
                  ? currentReel.caption
                  : `${currentReel.caption.slice(0, 100)}...`}
                {currentReel.caption.length > 100 && (
                  <button type="button" onClick={() => setCaptionExpanded(!captionExpanded)}>
                    {captionExpanded ? 'See Less' : 'See More'}
                  </button>
                )}
              </ConsoleCopy>
            )}
          </div>
        </div>

        {panelTitle && (
          <div className="vlc-carousel-panel">
            {showReportModal ? (
              reportSubmitted ? (
                <ConsoleCopy role="status">
                  Report Submitted. Thank You. We Will Review This Content.
                </ConsoleCopy>
              ) : (
                <>
                  <ConsoleCopy>Why Are You Reporting This Content?</ConsoleCopy>
                  <div className="vlc-carousel-options" role="group" aria-label="Report Reason">
                    {[
                      'Inappropriate Content',
                      'Spam Or Scam',
                      'Harassment',
                      'Misinformation',
                      'Other',
                    ].map((reason) => (
                      <button
                        type="button"
                        key={reason}
                        onClick={() => setReportReason(reason)}
                        aria-pressed={reportReason === reason}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <div className="vlc-carousel-command-grid">
                    <button type="button" onClick={closePanel}>
                      Cancel
                    </button>
                    <button type="button" onClick={handleReport} disabled={!reportReason}>
                      Submit Report
                    </button>
                  </div>
                </>
              )
            ) : showShareModal ? (
              <>
                <button
                  type="button"
                  onClick={handleShareToFeed}
                  disabled={sharingToFeed || sharedToFeed}
                >
                  {sharedToFeed
                    ? 'Shared To My Feed'
                    : sharingToFeed
                      ? 'Sharing...'
                      : 'Share To My Feed'}
                </button>
                <ConsoleCopy>Or Share Externally</ConsoleCopy>
                <div className="vlc-carousel-command-grid">
                  {[
                    ['copy', 'Copy Link'],
                    ['x', 'X'],
                    ['facebook', 'Facebook'],
                    ['whatsapp', 'WhatsApp'],
                  ].map(([id, label]) => (
                    <button type="button" key={id} onClick={() => handleShareAction(id)}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : showContextMenu ? (
              <div className="vlc-carousel-options">
                <button
                  type="button"
                  onClick={() => {
                    closePanel();
                    handleSave();
                  }}
                >
                  {saved[currentReel.id] ? 'Unsave' : 'Save Reel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closePanel();
                    handleShare();
                  }}
                >
                  Share / Repost
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closePanel();
                    setShowReportModal(true);
                  }}
                >
                  Report
                </button>
              </div>
            ) : showShortcutsOverlay ? (
              <>
                {[
                  ['Up / Down', 'Previous / Next Reel'],
                  ['Left / Right', 'Previous / Next Reel'],
                  ['Space', 'Play / Pause'],
                  ['L', 'Like'],
                  ['S', 'Save'],
                  ['C', 'Comments'],
                  ['M', 'Mute / Unmute'],
                  ['Esc', 'Close'],
                  ['?', 'This Menu'],
                ].map(([key, label]) => (
                  <ConsoleDataRow key={key} label={key} value={label} />
                ))}
              </>
            ) : showReactionPicker ? (
              <div className="vlc-carousel-options">
                {[
                  ['like', 'Love'],
                  ['thumbsup', 'Approve'],
                  ['dislike', 'Not For Me'],
                  ['laughing', 'Funny'],
                  ['crying', 'Tough Spot'],
                  ['angry', 'Disagree'],
                ].map(([type, label]) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => {
                      if (type === 'dislike') handleDislike();
                      else handleLike();
                      closePanel();
                      haptic(10);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : showMoreMenu ? (
              <div className="vlc-carousel-options">
                <button type="button" onClick={toggleSound}>
                  {muted ? 'Unmute' : 'Mute'}
                </button>
                <button type="button" onClick={handleSpeedToggle}>
                  Speed {Math.round(playbackSpeed * 100)}%
                </button>
                <button type="button" onClick={() => handleShareAction('copy')}>
                  Copy Link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closePanel();
                    setShowShortcutsOverlay(true);
                  }}
                >
                  Keyboard Shortcuts
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closePanel();
                    setShowReportModal(true);
                  }}
                >
                  Report
                </button>
              </div>
            ) : showComments ? (
              <>
                <ConsoleDataRow label="Comments" value={formatViews(reelComments.length)} />
                <button
                  type="button"
                  onClick={() => {
                    const next = commentSort === 'newest' ? 'oldest' : 'newest';
                    setCommentSort(next);
                    setReelComments((previous) =>
                      [...previous].sort((a, b) =>
                        next === 'newest'
                          ? new Date(b.created_at) - new Date(a.created_at)
                          : new Date(a.created_at) - new Date(b.created_at)
                      )
                    );
                  }}
                >
                  Sort: {commentSort === 'newest' ? 'Newest' : 'Oldest'}
                </button>
                <div className="vlc-carousel-comments">
                  {reelComments.length === 0 && (
                    <ConsoleCopy>No Comments Yet. Be The First!</ConsoleCopy>
                  )}
                  {reelComments.map((comment) => (
                    <article
                      key={comment.id}
                      className="vlc-carousel-comment"
                      data-reply={Boolean(comment.parent_id)}
                    >
                      <div className="vlc-carousel-author">
                        {comment.profiles?.avatar_url && (
                          <img src={comment.profiles.avatar_url} alt="" />
                        )}
                        <span>{comment.profiles?.username || 'Poker Member'}</span>
                        <span>{timeAgo(comment.created_at)}</span>
                      </div>
                      {editingComment === comment.id ? (
                        <div className="vlc-carousel-edit">
                          <label>
                            Edit Comment
                            <input
                              value={editCommentText}
                              onChange={(event) => setEditCommentText(event.target.value)}
                              maxLength={COMMENT_MAX_LENGTH}
                              autoFocus
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') handleSaveEdit(comment.id);
                                if (event.key === 'Escape') {
                                  setEditingComment(null);
                                  setEditCommentText('');
                                }
                              }}
                            />
                          </label>
                          <button type="button" onClick={() => handleSaveEdit(comment.id)}>
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingComment(null);
                              setEditCommentText('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        comment.content && <ConsoleCopy>{comment.content}</ConsoleCopy>
                      )}
                      {comment.media_url && (
                        <img
                          className="vlc-carousel-comment-media"
                          src={comment.media_url}
                          alt={comment.media_type === 'gif' ? 'Comment GIF' : 'Comment Image'}
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <div className="vlc-carousel-command-grid">
                        <button
                          type="button"
                          onClick={() => handleCommentLike(comment.id)}
                          aria-pressed={Boolean(commentLikes[comment.id])}
                        >
                          {commentLikes[comment.id] ? 'Liked' : 'Like'}{' '}
                          {formatViews(commentLikeCounts[comment.id] || 0)}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTo({
                              id: comment.id,
                              username: comment.profiles?.username || 'Poker Member',
                            });
                            setCommentText(`@${comment.profiles?.username || 'Poker Member'} `);
                            commentInputRef.current?.focus();
                          }}
                        >
                          Reply
                        </button>
                        {comment.author_id === authUser?.id && (
                          <>
                            <button type="button" onClick={() => handleEditComment(comment)}>
                              Edit
                            </button>
                            <button type="button" onClick={() => handleDeleteComment(comment.id)}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                  {hasMoreComments && (
                    <button type="button" onClick={loadMoreComments} disabled={loadingMoreComments}>
                      {loadingMoreComments ? 'Loading...' : 'Load More Comments'}
                    </button>
                  )}
                </div>
                {showReelGifPicker && (
                  <GiphyPicker
                    compact
                    onSelect={(gifUrl) => {
                      setReelCommentMediaUrl(gifUrl);
                      setReelCommentMediaType('gif');
                      setShowReelGifPicker(false);
                    }}
                    onClose={() => setShowReelGifPicker(false)}
                  />
                )}
                {reelCommentMediaUrl && (
                  <div className="vlc-carousel-media-preview">
                    <img
                      className="vlc-carousel-comment-media"
                      src={reelCommentMediaUrl}
                      alt="Comment Media Preview"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setReelCommentMediaUrl(null);
                        setReelCommentMediaType(null);
                      }}
                    >
                      Remove Media
                    </button>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  ref={reelFileInputRef}
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleReelImageUpload(file);
                    event.target.value = '';
                  }}
                />
                {replyTo && (
                  <div className="vlc-carousel-reply">
                    <ConsoleCopy>Replying To @{replyTo.username}</ConsoleCopy>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(null);
                        setCommentText('');
                      }}
                    >
                      Cancel Reply
                    </button>
                  </div>
                )}
                <label className="vlc-carousel-comment-input">
                  Add A Comment
                  <input
                    ref={commentInputRef}
                    value={commentText}
                    maxLength={COMMENT_MAX_LENGTH}
                    onChange={(event) => {
                      if (event.target.value.length <= COMMENT_MAX_LENGTH)
                        setCommentText(event.target.value);
                    }}
                    onKeyDown={handleSubmitComment}
                    onPaste={(event) => {
                      for (const item of event.clipboardData?.items || []) {
                        if (item.type.startsWith('image/')) {
                          event.preventDefault();
                          handleReelImageUpload(item.getAsFile());
                          return;
                        }
                      }
                    }}
                    placeholder="Add A Comment..."
                  />
                </label>
                <div className="vlc-carousel-command-grid">
                  <button type="button" onClick={() => setShowReelGifPicker(!showReelGifPicker)}>
                    GIF
                  </button>
                  <button
                    type="button"
                    onClick={() => reelFileInputRef.current?.click()}
                    disabled={uploadingReelImage}
                  >
                    {uploadingReelImage ? 'Uploading' : 'Add Image'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmitComment(null)}
                    disabled={!commentText.trim() && !reelCommentMediaUrl}
                  >
                    Post
                  </button>
                </div>
                {commentText.length > 0 && (
                  <ConsoleDataRow
                    label="Characters"
                    value={`${commentText.length} / ${COMMENT_MAX_LENGTH}`}
                  />
                )}
              </>
            ) : null}
          </div>
        )}
        {(shareToast || copyToast) && <ConsoleCopy role="status">Link Copied</ConsoleCopy>}
        {errorToast && <ConsoleCopy role="alert">{errorToast}</ConsoleCopy>}
      </VideoLibraryConsole>
      <ReelsFeedConsoleStyles />
    </div>
  );
}
// Main Reels Feed Carousel component
export function ReelsFeedCarousel() {
  const router = useRouter();
  const { user: providerUser } = useSupabase();
  const ownerId = providerUser?.id || null;
  const [reels, setReels] = useState([]);
  const reelsRequestGuardRef = useRef(null);
  if (!reelsRequestGuardRef.current) reelsRequestGuardRef.current = createLatestRequestGuard();
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
    const reelsRequest = reelsRequestGuardRef.current.begin({ append: false });
    // Background refresh (triggered by Realtime): don't flash the loading skeleton.
    // Only the very first load should show the shimmer placeholder.
    if (!isBackground) setLoading(true);
    try {
      const payload = await fetchPokerReels({
        limit: 50,
        signal: reelsRequest.signal,
        scope: 'social-carousel',
      });
      if (!reelsRequest.isCurrent()) return;
      const notInterested = loadNotInterestedReelIds(ownerId);
      const allReels = payload.data
        .filter((reel) => !notInterested.has(reel.id))
        .map((reel) => ({ ...reel, source: 'reels' }));

      // Sort merged set by date descending
      allReels.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setReels(allReels);
      setLoadError(false);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.warn('Load reels error:', e);
      if (reelsRequest.isCurrent()) {
        setReels([]);
        setLoadError(true);
      }
    } finally {
      if (reelsRequest.finish()) {
        isInitialLoadRef.current = false;
        setLoading(false);
      }
    }
  }, [ownerId]);

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
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'social_reels' },
        debouncedReload
      )
      // (social_posts INSERT listener removed 2026-08-15: loadReels reads
      // only social_reels since M7.1, and the video→reel mirror trigger
      // already emits a social_reels INSERT — every text post platform-wide
      // was costing a full 50-row reels refetch.)
      // M7.4: surgical UPDATE handler for worker conversion broadcasts.
      // Only acts when video_url actually changed; ignores like/comment UPDATEs.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'social_reels' },
        debouncedReload
      )
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
      reelsRequestGuardRef.current.abort();
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
      supabase.removeChannel(_ch);
      eventBus.off(EventType.DATA_MUTATED, handleDataMutated);
    };
  }, [loadReels]);

  useEffect(() => {
    const revalidateVisibleFeed = () => {
      if (document.visibilityState === 'visible') loadReels(true);
    };
    window.addEventListener('focus', revalidateVisibleFeed);
    document.addEventListener('visibilitychange', revalidateVisibleFeed);
    return () => {
      window.removeEventListener('focus', revalidateVisibleFeed);
      document.removeEventListener('visibilitychange', revalidateVisibleFeed);
    };
  }, [loadReels]);

  const openViewer = (index) => {
    setViewerStartIndex(index);
    setViewerOpen(true);
  };

  // Loading uses the exact same native-ratio chassis as the final carousel.
  if (loading) {
    return (
      <div className="vlc-feed-console-shell">
        <VideoLibraryConsole
          eyebrow="Social Feed"
          title="Poker Reels"
          subtitle="Verified Video Channel"
          pill="Tuning"
          pillInk="blue"
          foot="foot"
          aria-label="Poker Reels Loading"
        >
          <ConsoleCopy align="center">Preparing The Latest Playable Poker Reels.</ConsoleCopy>
          <ConsoleDataRow label="Signal" value="Connecting" valueInk="blue" />
        </VideoLibraryConsole>
        <ReelsFeedConsoleStyles />
      </div>
    );
  }

  // Keep recovery visible; the legacy pre-check returned null before this branch.
  if (loadError) {
    return (
      <div className="vlc-feed-console-shell">
        <VideoLibraryConsole
          eyebrow="Social Feed"
          title="Reel Signal Interrupted"
          subtitle="Account State Protected"
          pill="Attention"
          pillInk="red"
          foot="plates"
          plates={{
            secondary: {
              label: 'Browse All Reels',
              onClick: () => router.push('/hub/reels'),
              ink: 'silver',
            },
            primary: { label: 'Retry Signal', onClick: () => loadReels(), ink: 'blue' },
          }}
          aria-label="Poker Reels Connection Recovery"
        >
          <ConsoleCopy align="center">
            The Reel Service Did Not Answer. Try The Signal Again.
          </ConsoleCopy>
          <ConsoleDataRow label="Account State" value="Protected" valueInk="green" />
        </VideoLibraryConsole>
        <ReelsFeedConsoleStyles />
      </div>
    );
  }

  // Preserve the feed's quiet behavior when the verified service has no rows.
  if (reels.length === 0) return null;

  return (
    <>
      <div className="vlc-feed-console-shell">
        <VideoLibraryConsole
          eyebrow="Social Feed"
          title="Poker Reels"
          subtitle="Swipe The Verified Video Rail"
          pill={`${reels.length} Live`}
          pillInk="blue"
          foot="plates"
          plates={{
            secondary: { label: 'Refresh Reels', onClick: () => loadReels(), ink: 'silver' },
            primary: {
              label: 'Browse All Reels',
              onClick: () => router.push('/hub/reels'),
              ink: 'white',
            },
          }}
          aria-label="Poker Reels In The Social Feed"
        >
          <div ref={scrollRef} className="vlc-feed-reel-strip">
            {reels.map((reel, index) => (
              <ReelCard key={reel.id} reel={reel} onClick={() => openViewer(index)} />
            ))}
          </div>
          <ConsoleCopy align="center">Select A Reel To Enter The Full Viewer.</ConsoleCopy>
        </VideoLibraryConsole>
        <ReelsFeedConsoleStyles />
      </div>

      {/* Full-screen viewer */}
      {viewerOpen && (
        <ReelViewer
          reels={reels}
          startIndex={viewerStartIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}

function ReelsFeedConsoleStyles() {
  return (
    <style jsx global>{`
      .vlc-feed-console-shell {
        width: 100%;
        max-width: 760px;
        margin: 0 auto 16px;
        background: #000;
      }
      .vlc-feed-reel-strip {
        display: flex;
        gap: 2.4cqw;
        width: 100%;
        overflow-x: auto;
        padding-bottom: 2cqw;
        scroll-snap-type: x mandatory;
        overscroll-behavior-inline: contain;
      }
      .vlc-reel-card {
        appearance: none;
        display: flex;
        flex-direction: column;
        position: relative;
        flex: 0 0 38cqw;
        min-width: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: #f4f7fb;
        cursor: pointer;
        scroll-snap-align: start;
        font-family: 'Roboto Condensed', 'Arial Narrow', sans-serif;
        text-align: left;
      }
      .vlc-reel-card:focus-visible {
        outline: 2px solid #45adff;
        outline-offset: -2px;
      }
      .vlc-reel-card__media {
        display: grid;
        width: 100%;
        aspect-ratio: 9 / 16;
        overflow: hidden;
      }
      .vlc-reel-card__media img,
      .vlc-reel-card__media video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .vlc-reel-card__fallback {
        align-self: center;
        color: #45adff;
        font-size: 3cqw;
        text-align: center;
      }
      .vlc-reel-card__author {
        display: flex;
        align-items: center;
        gap: 1.5cqw;
        padding-top: 2cqw;
        color: #45adff;
        font-size: 3cqw;
        overflow-wrap: anywhere;
      }
      .vlc-reel-card__author img {
        width: 6cqw;
        height: 6cqw;
        object-fit: cover;
      }
      .vlc-reel-card__caption {
        padding-top: 1cqw;
        font:
          500 3cqw/1.4 Inter,
          system-ui,
          sans-serif;
        overflow-wrap: anywhere;
      }
      .vlc-carousel-viewer-shell.vlc-carousel-viewer-shell {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: grid;
        align-items: start;
        justify-items: center;
        width: 100%;
        height: 100dvh;
        max-width: none;
        max-height: none;
        overflow: auto;
        padding: max(8px, env(safe-area-inset-top)) 0 max(8px, env(safe-area-inset-bottom));
        border: 0 !important;
        border-radius: 0 !important;
        background-color: #000 !important;
        background-image: none !important;
        box-shadow: none !important;
      }
      .vlc-carousel-viewer-console {
        width: min(100%, 540px);
      }
      .vlc-carousel-viewer-layout {
        display: grid;
        gap: 3cqw;
        min-width: 0;
      }
      .vlc-carousel-viewer-layout[hidden] {
        display: none;
      }
      .vlc-carousel-viewer-stage {
        position: relative;
        width: 100%;
        aspect-ratio: 9 / 16;
        overflow: hidden;
        background: #000;
      }
      .vlc-carousel-viewer-media {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .vlc-carousel-viewer-details {
        display: flex;
        flex-direction: column;
        gap: 2cqw;
        min-width: 0;
      }
      .vlc-carousel-viewer-toolbar,
      .vlc-carousel-command-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: center;
        gap: 1.5cqw;
      }
      .vlc-carousel-panel,
      .vlc-carousel-options,
      .vlc-carousel-comments,
      .vlc-carousel-edit,
      .vlc-carousel-media-preview,
      .vlc-carousel-reply {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 3cqw;
      }
      .vlc-carousel-viewer-console .vlc-carousel-panel button,
      .vlc-carousel-viewer-console .vlc-carousel-viewer-toolbar button,
      .vlc-carousel-viewer-console .vlc-carousel-viewer-details button {
        appearance: none;
        display: block;
        width: 100%;
        min-width: 0;
        min-height: 44px;
        padding: 2cqw;
        border: 0 !important;
        border-radius: 0 !important;
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
        color: #45adff !important;
        font:
          700 3.7cqw/1.3 'Roboto Condensed',
          'Arial Narrow',
          sans-serif;
        text-align: center;
        overflow-wrap: anywhere;
        cursor: pointer;
      }
      .vlc-carousel-viewer-console button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .vlc-carousel-viewer-console button[aria-pressed='true'] {
        color: #c8ffd2 !important;
      }
      .vlc-carousel-viewer-console button:focus-visible,
      .vlc-carousel-viewer-console input:focus-visible {
        outline: 2px solid #45adff;
        outline-offset: -2px;
      }
      .vlc-carousel-viewer-console button:active {
        color: #f4f7fb !important;
      }
      .vlc-carousel-author {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 2cqw;
        overflow-wrap: anywhere;
      }
      .vlc-carousel-author img {
        width: 8cqw;
        height: 8cqw;
        object-fit: cover;
      }
      .vlc-carousel-author a,
      .vlc-carousel-author span {
        color: #e4e7ec;
        font:
          600 3.5cqw/1.4 'Roboto Condensed',
          sans-serif;
      }
      .vlc-carousel-comment {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 2cqw;
        padding-block: 2cqw;
      }
      .vlc-carousel-comment[data-reply='true'] {
        padding-left: 3cqw;
      }
      .vlc-carousel-comment-media {
        max-width: 100%;
        max-height: 50cqw;
        object-fit: contain;
        align-self: flex-start;
      }
      .vlc-carousel-comment-input,
      .vlc-carousel-edit label {
        display: flex;
        flex-direction: column;
        gap: 2cqw;
        color: #45adff;
        font:
          600 3.7cqw/1.4 'Roboto Condensed',
          sans-serif;
      }
      .vlc-carousel-viewer-console input:not([type='file']) {
        width: 100%;
        min-width: 0;
        min-height: 44px;
        padding: 2cqw;
        border: 0 !important;
        border-radius: 0 !important;
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
        color: #e4e7ec !important;
        font:
          500 3.7cqw/1.4 Inter,
          system-ui,
          sans-serif;
      }
      .vlc-carousel-play-state,
      .vlc-carousel-like-confirmation {
        position: absolute;
        inset: 42% 0 auto;
        z-index: 6;
        pointer-events: none;
        text-align: center;
        color: #f4f7fb;
        font:
          800 6cqw/1.4 'Roboto Condensed',
          sans-serif;
        text-shadow: 0 1px 2px #000;
      }
      .vlc-carousel-like-confirmation {
        animation: carouselLikeConfirmation 0.8s ease-out forwards;
      }
      @keyframes carouselLikeConfirmation {
        0% {
          opacity: 1;
          transform: scale(0.8);
        }
        50% {
          opacity: 1;
          transform: scale(1.1);
        }
        100% {
          opacity: 0;
          transform: scale(1.2);
        }
      }
      @media (min-width: 900px) {
        .vlc-carousel-viewer-shell.vlc-carousel-viewer-shell {
          padding: 16px;
        }
        .vlc-carousel-viewer-console {
          width: min(100%, 900px);
        }
        .vlc-carousel-viewer-layout {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          align-items: start;
        }
        .vlc-carousel-viewer-console .vlc-carousel-panel button,
        .vlc-carousel-viewer-console .vlc-carousel-viewer-toolbar button,
        .vlc-carousel-viewer-console .vlc-carousel-viewer-details button,
        .vlc-carousel-author a,
        .vlc-carousel-author span {
          font-size: 2.1cqw;
        }
        .vlc-carousel-author img {
          width: 5cqw;
          height: 5cqw;
        }
      }
    `}</style>
  );
}

export default ReelsFeedCarousel;
