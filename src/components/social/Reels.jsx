import { readReelComments } from '../../lib/reelCommentsReader.mjs';
import { createReelHydrationRevision } from '../../lib/reelHydrationRevision.mjs';
import { mutateReelReaction } from '../../lib/reelReactionMutation.mjs';
import useReelsEnhancements from '../../hooks/useReelsEnhancements';
import ReelCaptionControl from '../reels/ReelCaptionControl';
import { getOrCreateReelCommentAttempt, forgetReelCommentAttempt, shouldRestoreReelCommentDraft } from '../../lib/reelCommentAttempts.mjs';
import { createReelMutationGuard, postReelComment, removeReelComment, editReelComment } from '../../lib/reelMutationGuard.mjs';
import { useNativeReelVisibility } from '../../hooks/useNativeReelVisibility';
/**
 * REELS COMPONENT - SmarterPoker-style permanent video archive
 * Videos from Stories are saved here permanently
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { prefetchVideoStart } from '../../lib/reelsPrefetcher';
import {
  YouTubeErrorOverlay,
  reportFailureToServer,
} from '../../hooks/useYouTubeErrorManager';
import { supabase } from '../../lib/supabase';
import { getAuthUser, getAccessToken } from '../../lib/authUtils';
import { submitReelReport } from '../../lib/reelsReportClient.mjs';
import { busEmit, eventBus, EventType } from '../../engine/EventBus';
import Link from 'next/link';
import ReelTrustStrip from '../reels/ReelTrustStrip';
import PokerCardText from './PokerCardText';
import GiphyPicker from '../shared/GiphyPicker';
import {
  buildReelPath,
  fetchPokerReels,
  mergeReels,
} from '../../lib/reelsFeedClient';
import {
  loadReelFollowState,
  loadReelInteractionState,
  normaliseReelAuthorIds,
  normaliseReelIds,
} from '../../lib/reelInteractionHydration';
import { createLatestRequestGuard } from '../../lib/latestRequestGuard.mjs';
import { loadCanonicalReelsWindow } from '../../lib/reelsFeedController.mjs';
import { capReelsInMemory, dataSaverEnabled, nativeDeliveryPolicy } from '../../lib/reelsDeliveryContract.mjs';
import {
  BACKGROUND_REELS_REFRESH,
  REELS_BACKGROUND_REFRESH_DELAY_MS,
  createReelRealtimeChangeFilter,
  createReelsRefreshCoordinator,
  mergeBackgroundReels,
  resolveStaleReels,
} from '../../lib/reelsRealtimeRefresh.mjs';
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
import ReelResponsibleGamingNotice from './ReelResponsibleGamingNotice';
import ReelPlayerFrame from '../reels/ReelPlayerFrame';
import ReelFeedbackActions from '../reels/ReelFeedbackActions';
import { reelSourceKey } from '../../lib/reelsFeedback.mjs';
import styles from './ReelsConsole.module.css';
import immersiveStyles from '../reels/ImmersiveReels.module.css';
import ReelActionVisual, { ReelIcon } from '../reels/ReelActionVisual';
import ReelProgress from '../reels/ReelProgress';
import ReelYouTubePlayer from '../reels/ReelYouTubePlayer';
import ReelsStatusScreen from '../reels/ReelsStatusScreen';

// ReelsConsole.module.css keeps every full-screen close action below env(safe-area-inset-top).

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

function reelTopicLabel(reel) {
  const topic = String(reel?.topic || '').trim().toLowerCase();
  if (topic === 'cash') return 'Cash Poker';
  if (topic === 'tournament') return 'Tournament Poker';
  if (topic === 'slots') return 'Casino And Slots';
  if (topic === 'sports') return 'Sports';
  return 'Poker';
}

function reelSourceName(reel) {
  return reel?.channel_name
    || reel?.profiles?.full_name
    || reel?.profiles?.username
    || 'Creator Unavailable';
}

function reelSourceUrl(reel) {
  if (reel?.playback_type !== 'youtube_embed' && !isYouTubeUrl(reel?.video_url)) return null;
  return reel?.source_attribution_url || reel?.source_url || reel?.original_youtube_url || null;
}

// Time ago helper
function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'Just Now';
  if (s < 3600) return `${Math.floor(s / 60)} Min Ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} Hr Ago`;
  return `${Math.floor(s / 86400)} Day Ago`;
}

function formatConsoleMessage(value) {
  return String(value || '')
    .replace(/\s+-\s+/g, '. ')
    .replace(/\b[a-z]/g, character => character.toUpperCase());
}

function ReelViewerConsoleState({ title, subtitle, pill, pillInk = 'blue', copy, rows, secondary, primary }) {
  return <ReelsStatusScreen title={title} copy={copy} subtitle={subtitle} rows={rows} primary={primary} secondary={secondary} />;
}

// Full-screen Reel Viewer
export function ReelsViewer({ onClose }) {
  const prefersDataSaver = useMemo(() => dataSaverEnabled({
    connection: typeof navigator !== 'undefined' ? navigator.connection : null,
  }), []);
  const recordShareMetric = async (reel, destination = 'external') => {
    const token = getAccessToken();
    if (!reel?.id || !token) return;
    const response = await fetch('/api/social/share-count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ post_id: reel.id, destination }),
    });
    if (!response.ok) throw new Error('Share metric failed');
  };

  const [reels, setReels] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [muted, setMuted] = useState(() => {
    // BUG FIX (2026-05-12 autoplay-final): muted is now bound to React state
    // (JSX uses muted={muted}, not muted={true}). Initialize from localStorage
    // so the user's unmute decision STICKS across reloads - same pattern
    // TikTok / Facebook use. First load defaults to muted=true (cold autoplay
    // is allowed without gesture); after the first gesture the preference
    // flips and persists indefinitely.
    if (typeof window === 'undefined') return true;
    try { return localStorage.getItem('sp:reels:muted') !== '0'; }
    catch (_) { return true; }
  });
  // Persist muted preference across reloads - see useState initializer above.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem('sp:reels:muted', muted ? '1' : '0'); }
    catch (_) { /* sandboxed contexts may throw */ }
  }, [muted]);
  const [paused, setPaused] = useState(true); // Start true - autoplay may fail, first tap should send playVideo
  const [ytReady, setYtReady] = useState(false); // True once YouTube fires first onStateChange - suppresses phantom play button during autoplay startup
  const [ytError, setYtError] = useState(null); // YouTube embed error code (150=age-restricted, 100=not found)
  const [liked, setLiked] = useState({});
  const [disliked, setDisliked] = useState({});
  const [following, setFollowing] = useState({});
  const [currentUserId, setCurrentUserId] = useState(null);
  const activeUserIdRef = useRef(null);
  const accountScopeRef = useRef(null);
  const interactionRevisionRef = useRef(null);
  if (!interactionRevisionRef.current) interactionRevisionRef.current = createReelHydrationRevision();
  if (!accountScopeRef.current) accountScopeRef.current = createReelAccountScope();
  const interactionReelIds = useMemo(() => normaliseReelIds(reels), [reels]);
  const interactionAuthorIds = useMemo(() => normaliseReelAuthorIds(reels), [reels]);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [reelComments, setReelComments] = useState([]);
  const [commentLoadError, setCommentLoadError] = useState('');
  const [shareToast, setShareToast] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [progress, setProgress] = useState(0);
  const [likeCounts, setLikeCounts] = useState({});
  const [commentCounts, setCommentCounts] = useState({});
  const [saved, setSaved] = useState({});
  const savedTargetsByReelRef = useRef(new Map());
  // Infinite scroll state
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [continuationPaused, setContinuationPaused] = useState(false);
  const reelsCursorRef = useRef(null);
  const reelsRequestGuardRef = useRef(null);
  const commentRequestGuardRef = useRef(null);
  const activeCommentReelIdRef = useRef(null);
  if (!reelsRequestGuardRef.current) reelsRequestGuardRef.current = createLatestRequestGuard();
  if (!commentRequestGuardRef.current) commentRequestGuardRef.current = createLatestRequestGuard();
  // Background refresh plumbing (realtime changes, tab focus). See
  // src/lib/reelsRealtimeRefresh.mjs for the policy.
  const reelsRef = useRef(reels);
  const currentIndexRef = useRef(currentIndex);
  const loadErrorRef = useRef(loadError);
  loadErrorRef.current = loadError;
  const loadReelsRef = useRef(null);
  const reelsRefreshCoordinatorRef = useRef(null);
  if (!reelsRefreshCoordinatorRef.current) {
    reelsRefreshCoordinatorRef.current = createReelsRefreshCoordinator(reelsRequestGuardRef.current);
  }
  const backgroundReelsRefreshTimerRef = useRef(null);
  const staleReelIdsRef = useRef(new Set());
  const reelRealtimeFilterRef = useRef(null);
  if (!reelRealtimeFilterRef.current) reelRealtimeFilterRef.current = createReelRealtimeChangeFilter();
  useEffect(() => {
    reelsRef.current = reels;
    currentIndexRef.current = currentIndex;
  }, [reels, currentIndex]);

  useEffect(() => () => {
    reelsRequestGuardRef.current?.abort();
    commentRequestGuardRef.current?.abort();
    clearTimeout(backgroundReelsRefreshTimerRef.current);
  }, []);

  // One debounced background refresh serves realtime changes and tab focus.
  const scheduleBackgroundReelsRefresh = useCallback(() => {
    clearTimeout(backgroundReelsRefreshTimerRef.current);
    backgroundReelsRefreshTimerRef.current = setTimeout(() => {
      backgroundReelsRefreshTimerRef.current = null;
      loadReelsRef.current?.(BACKGROUND_REELS_REFRESH);
    }, REELS_BACKGROUND_REFRESH_DELAY_MS);
  }, []);

  // Fail-closed removal that keeps the active Reel when it survives and hands
  // over to the next surviving Reel when it does not.
  const removeMountedReels = useCallback((shouldRemove) => {
    const current = reelsRef.current;
    const removeIds = current.filter(shouldRemove).map((reel) => reel.id);
    if (!removeIds.length) return;
    const merged = mergeBackgroundReels({
      current,
      activeIndex: currentIndexRef.current,
      removeIds,
    });
    reelsRef.current = merged.reels;
    setReels(merged.reels);
    if (merged.activeIndex !== currentIndexRef.current) {
      currentIndexRef.current = merged.activeIndex;
      setCurrentIndex(merged.activeIndex);
    }
  }, []);

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
    setWatchedReelIds(loadWatchedReelIds(activeUserIdRef.current));
  }, []);

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const commentInputRef = useRef(null);
  const overlayTimerRef = useRef(null);
  const likeDebounceRef = useRef(false);
  const lastTapRef = useRef(0);
  const progressRAF = useRef(null);
  const handleLikeRef = useRef(null);
  const handleSaveRef = useRef(null);
  const handleCommentsRef = useRef(null);
  const ytIframeRef = useRef(null); // Persistent YouTube iframe ref
  const youtubeEventRef = useRef(null);
  // userInteractedRef is session-sticky: once any user gesture happens (click,
  // keydown, wheel, touchstart, pointerdown) we record it in sessionStorage so
  // re-renders, slot transitions, and even client-side route changes within the
  // same tab keep "user has gestured" = true. This is the gate that lets video
  // elements unmute themselves automatically without forcing the user to click
  // again on every new slot.
  const userInteractedRef = useRef(
    readReelsSessionFlag('sp:reels:interacted')
  );
  // Stricter than userInteractedRef: only true when a gesture happens on
  // THIS page load. Browsers gate autoplay-with-sound per-document, so the
  // sessionStorage-backed userInteractedRef can be true on reload without
  // any fresh gesture context. YT iframe unMute postMessage is silently
  // rejected in that state. Use this ref (NOT userInteractedRef) for
  // slot-transition setMuted(false) gates so React state never lies about
  // being unmuted while the YT player is actually still muted.
  const userGesturedThisLoadRef = useRef(false);
  const userWantsSoundRef = useRef(true); // User sound preference - persists across reel changes
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
  // twice in this tab. Lost on reload (correct - worker may have transcoded
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
  // #10 Error Toast
  const [errorToast, setErrorToast] = useState(null);
  // BUG FIX (R1): errorToastTimerRef - tracks the dismiss timer so it can be
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
  // BUG FIX (R2): showHeartTimerRef - tracks the 800ms heart-flash timer so it
  // can be cancelled on unmount or on rapid successive like-taps.
  const showHeartTimerRef = useRef(null);
  // BUG FIX (RLXS-1): likeBounceTimerRef - tracks the 400ms like-count bounce so
  // rapid double-taps don't accumulate orphan timers.
  const likeBounceTimerRef = useRef(null);
  // BUG FIX (RLXS-2): commentFocusTimerRef - prevents focus() on unmounted input.
  const commentFocusTimerRef = useRef(null);
  // BUG FIX (RLXS-4): copyToastTimerRef - prevents setState-after-unmount on copy-link dismiss.
  const copyToastTimerRef = useRef(null);

  const clearAccountOwnedState = useCallback(() => {
    reelsRequestGuardRef.current?.abort();
    const mountedRows = reelsRef.current || [];
    const activeRow = mountedRows[currentIndexRef.current];
    const publicRows = mountedRows.filter(row => row?.is_public === true);
    if (publicRows.length !== mountedRows.length) {
      if (activeRow?.is_public !== true) {
        videoRef.current?.pause();
        youtubeCommandRef.current?.('pauseVideo', []);
      }
      const retainedIndex = publicRows.findIndex(row => row.id === activeRow?.id);
      const nextIndex = retainedIndex >= 0 ? retainedIndex : Math.max(0, Math.min(currentIndexRef.current, publicRows.length - 1));
      reelsRef.current = publicRows;
      currentIndexRef.current = nextIndex;
      setReels(publicRows);
      setCurrentIndex(nextIndex);
    }
    commentRequestGuardRef.current?.abort();
    setLiked({});
    setDisliked({});
    setFollowing({});
    setSaved({});
    savedTargetsByReelRef.current = new Map();
    setWatchedReelIds(loadWatchedReelIds(activeUserIdRef.current));
    setNotInterestedIds(loadNotInterestedReelIds(activeUserIdRef.current));
    setCommentLikes({});
    setCommentLikeCounts({});
    setCommentText('');
    setReelComments([]);
    setCommentLoadError('');
    setReplyTo(null);
    setEditingComment(null);
    setEditCommentText('');
    setReelCommentMediaUrl(null);
    setReelCommentMediaType(null);
    setShowReelGifPicker(false);
    setShowCommentInput(false);
    setShowReactionPicker(false);
    setShowMoreMenu(false);
    setShowShareModal(false);
    setShowReportModal(false);
    setReportReason('');
    setReportSubmitted(false);
    setUploadingReelImage(false);
    likeDebounceRef.current = false;
  }, []);

  const bindAuthOwner = useCallback((nextUser) => {
    const nextOwnerId = nextUser?.id || null;
    const binding = accountScopeRef.current.bind(nextOwnerId);
    activeUserIdRef.current = nextOwnerId;
    if (binding.changed) clearAccountOwnedState();
    setCurrentUserId(nextOwnerId);
  }, [clearAccountOwnedState]);

  useEffect(() => {
    // The callback is declared later in this component. Effects run only after
    // the complete render has assigned the ref, so the initial load must use
    // the ref instead of evaluating the callback inside its temporal dead zone.
    loadReelsRef.current?.();
    bindAuthOwner(getAuthUser());
    const handleStorage = (event) => {
      if (event.key !== 'smarter-poker-auth'
        && !(event.key?.startsWith('sb-') && event.key?.endsWith('-auth-token'))) return;
      bindAuthOwner(event.key === 'smarter-poker-auth' && !event.newValue ? null : getAuthUser());
    };
    window.addEventListener('storage', handleStorage);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      bindAuthOwner(event === 'SIGNED_OUT' ? null : session?.user || getAuthUser());
    });
    return () => {
      window.removeEventListener('storage', handleStorage);
      subscription?.unsubscribe();
    };
  }, [bindAuthOwner]);

  // Query only the IDs currently loaded in the viewer. Chunking avoids the
  // historical 1,000-row cap and re-runs when infinite scroll appends Reels.
  useEffect(() => {
    if (!currentUserId || interactionReelIds.length === 0) {
      setLiked({});
      setDisliked({});
      setSaved({});
      savedTargetsByReelRef.current = new Map();
      return undefined;
    }

    const ownerRequest = accountScopeRef.current.capture(currentUserId);
    const hydration = interactionRevisionRef.current.capture(ownerRequest);
    let cancelled = false;
    const controller = new AbortController();
    loadReelInteractionState(supabase, currentUserId, reels, {
      loadSavedReels: (ownerId, reelIds, options) => savedReelsService.getSavedReelsForIds(ownerId, reelIds, options),
      signal: controller.signal,
    })
      .then((state) => {
        if (cancelled || !ownerRequest.isCurrent()) return;
        setLiked(previous => hydration.merge('reaction', state.liked, previous));
        setDisliked(previous => hydration.merge('reaction', state.disliked, previous));
        setSaved(previous => hydration.merge('save', state.saved, previous));
        savedTargetsByReelRef.current = new Map(Object.entries(hydration.merge('save', state.savedTargets, Object.fromEntries(savedTargetsByReelRef.current))));
      })
      .catch((error) => {
        if (!cancelled && ownerRequest.isCurrent()) console.warn('[ReelsViewer] Interaction hydration failed:', error?.message || error);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentUserId, interactionReelIds, reels]);

  useEffect(() => {
    if (!currentUserId || interactionAuthorIds.length === 0) {
      setFollowing({});
      return undefined;
    }
    const ownerRequest = accountScopeRef.current.capture(currentUserId);
    const hydration = interactionRevisionRef.current.capture(ownerRequest);
    let cancelled = false;
    loadReelFollowState(supabase, currentUserId, interactionAuthorIds)
      .then((state) => {
        if (!cancelled && ownerRequest.isCurrent()) setFollowing(previous => hydration.merge('follow', state, previous));
      })
      .catch((error) => {
        if (!cancelled && ownerRequest.isCurrent()) console.warn('[ReelsViewer] Follow hydration failed:', error?.message || error);
      });
    return () => { cancelled = true; };
  }, [currentUserId, interactionAuthorIds]);

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
      if (d?.postId && currentUserId && d.userId === currentUserId) {
        setSaved((prev) => ({ ...prev, [d.postId]: d.added }));
        if (d.added) savedTargetsByReelRef.current.set(d.postId, [d.postId]);
        else savedTargetsByReelRef.current.delete(d.postId);
      }
    };
    const handleCommentBus = (event) => {
      const d = event?.payload;
      if (d?.postId && d.authorId !== activeUserIdRef.current) {
        setCommentCounts((prev) => ({
          ...prev,
          [d.postId]: Number.isInteger(d.commentCount) && d.commentCount >= 0 ? d.commentCount : Math.max(0, (prev[d.postId] || 0) + (d.removed ? -1 : 1)),
        }));
      }
    };
    const handleFollowBus = (event) => {
      const d = event?.payload;
      if (d?.followedId && currentUserId && d.followerId === currentUserId) {
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

  // Realtime subscription. social_reels publishes every counter bump, the
  // signed-in viewer's own view recording included, so counter, like and view
  // updates are ignored here. Only a change that can alter playback or
  // eligibility (playback address or identity, visibility, deletion, topic,
  // media or rights status, or an INSERT/DELETE) acts: an explicitly
  // ineligible mounted Reel is removed at once, and everything else schedules
  // one debounced BACKGROUND refresh that merges into the mounted feed without
  // swapping the player for the loading console.
  useEffect(() => {
    const realtimeFilter = reelRealtimeFilterRef.current;
    const handleReelChange = (eventType, row) => {
      const stateReel = row?.id
        ? reelsRef.current.find((reel) => reel.id === row.id) || null
        : null;
      const verdict = realtimeFilter.classify({ eventType, row, stateReel });
      if (verdict.remove) removeMountedReels((reel) => reel.id === row.id);
      if (!verdict.refresh) return;
      if (stateReel && !verdict.remove) staleReelIdsRef.current.add(row.id);
      scheduleBackgroundReelsRefresh();
    };
    const _ch = supabase
      .channel(`reels-viewer:${currentUserId || 'public'}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_reels' }, (payload) => {
        handleReelChange('INSERT', payload?.new);
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'social_reels' },
        (payload) => handleReelChange('UPDATE', payload?.new)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'social_reels' },
        (payload) => handleReelChange('DELETE', payload?.old)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(_ch);
    };
  }, [currentUserId, removeMountedReels, scheduleBackgroundReelsRefresh]);

  // YouTube auto-advance & state tracking: listen for onStateChange postMessage
  useEffect(() => {
    const YOUTUBE_ORIGINS = [
      'https://www.youtube-nocookie.com',
      'https://www.youtube.com',
      'https://youtube.com',
    ];
    const handleYTMessage = (event) => {
      if (!YOUTUBE_ORIGINS.includes(event.origin) || event.source !== ytIframeRef.current?.contentWindow) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.event === 'onStateChange') {

          if (data.info === 1) {
            // Playing
            setYtReady(true);
            setPaused(false);
            setYtError(null);
            setShowOverlay(true);
            clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2500);
            // Auto-unmute - swipe IS a user gesture, so unMute is always valid here
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
        if (data?.event === 'infoDelivery' && Number.isFinite(data.info?.currentTime) && data.info?.duration > 0) setProgress(Math.max(0, Math.min(100, data.info.currentTime / data.info.duration * 100)));
        if (data?.event === 'onReady') setYtReady(true);
        if (data?.event === 'onAutoplayBlocked') { setYtReady(true); setPaused(true); }
        if (data?.event === 'onError' && data?.info) {
          const errCode = Number(data.info);
          setYtError(errCode);
          // Report to server (best-effort)
          try {
            const vid = data.videoId;
            if (vid) {
              reportFailureToServer(vid, errCode, 'Reels');
            }
          } catch {
            /* best-effort */
          }
        }
      } catch {
        /* not a YouTube message */
      }
    };
    youtubeEventRef.current = handleYTMessage;
    return () => { youtubeEventRef.current = null; };
    // BUG FIX (revised 2026-05-11): the prior version had `[currentIndex, goNext]`
    // in the dep array, but `const goNext = useCallback(...)` is declared ~400
    // lines below - referencing it here put it in the TDZ and crashed the viewer
    // on mount with `ReferenceError: Cannot access 'goNext' before initialization`.
    // Same class of bug as the `isYouTubeUrl` crash on /hub/reels (fixed PR #353).
    // Fixed: read goNext through goNextRef (set just below the useCallback so it
    // always has the current binding by the time the listener fires). Effect deps
    // shrunk to [currentIndex] - handler closure reads ref.current at call time,
    // so freshness is preserved without TDZ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Stable ref to goNext so the YT message handler above can read the current
  // binding without putting goNext in its dep array (which would TDZ - see comment
  // above). Updated by the effect just after the useCallback declaration so it
  // always points at the latest closure.
  const goNextRef = useRef(null);

  // Reset paused state when changing reels + track view
  // dep: currentIndex ONLY - we do NOT add `reels` because setReels() alone
  // should NOT trigger a play() call (the video key changes, element remounts)
  useEffect(() => {
    setPaused(true); // New reel starts as paused - autoplay may fail, first tap should send playVideo
    setYtReady(false); // Reset - suppress play button until YT fires onStateChange for new video
    setShowOverlay(false);
    setProgress(0);
    setYtError(null); // Clear YouTube error state on reel change

    // Cancel pending onLoad retry timers from the previous reel's iframe.onLoad.
    // The key prop causes the iframe to remount on index change, but the old
    // timers still fire and send commands to the NEW iframe prematurely.
    onLoadRetryTimersRef.current.forEach((t) => clearTimeout(t));
    onLoadRetryTimersRef.current = [];



    // Cancel any running RAF from the previous reel immediately
    if (progressRAF.current) {
      cancelAnimationFrame(progressRAF.current);
      progressRAF.current = null;
    }

    const viewCountTimer = null;

    // Native video autoplay - only for non-YouTube reels
    const reel = reels[currentIndex];
    const isNativeVideo = reel && !isYouTubeUrl(reel.video_url);
    const video = isNativeVideo ? videoRef.current : null;
    if (!video)
      return () => {

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

      clearTimeout(viewCountTimer);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('play', onPlay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, reels[currentIndex]?.id]);

  // Auto-unmute helper - called from onStateChange(1), goNext, goPrev, swipe
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

  const commentEditEpochRef = useRef(0);
  const mutationGuardRef = useRef(null);
  if (!mutationGuardRef.current) mutationGuardRef.current = createReelMutationGuard();
  const withReelMutation = (kind, target, task) => async (...args) => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!ownerRequest.ownerId) return task(...args);
    let operation;
    const targetId = target();
    try { operation = mutationGuardRef.current.begin({ ownerRequest, kind, target: targetId }); }
    catch (error) { showErrorToast(error.message); return false; }
    if (!operation) return false;
    const finishRevision = interactionRevisionRef.current.begin(ownerRequest, kind, targetId);
    try { return await task(...args); }
    finally { finishRevision(); operation.finish(); }
  };
  const handleSave = withReelMutation('save', () => reels[currentIndex]?.id, async () => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    const reel = currentReel;
    if (!reel?.id || !ownerRequest.ownerId || !ownerRequest.isCurrent()) return;
    const wasSaved = saved[reel.id];
    setSaved((prev) => ({ ...prev, [reel.id]: !prev[reel.id] }));
    haptic(wasSaved ? 5 : 15);
    try {
      if (wasSaved) {
        const savedTargets = savedTargetsByReelRef.current.get(reel.id);
        await savedReelsService.unsaveReel(
          ownerRequest.ownerId,
          savedTargets?.length
            ? savedTargets
            : [reel.id, reel.source_post_id].filter(Boolean),
        );
        if (!ownerRequest.isCurrent()) return;
        savedTargetsByReelRef.current.delete(reel.id);
      } else {
        await savedReelsService.saveReel(ownerRequest.ownerId, reel.id, 'reel');
        if (!ownerRequest.isCurrent()) return;
        savedTargetsByReelRef.current.set(reel.id, [reel.id]);
      }
      try {
        busEmit.socialPostBookmarked(reel.id, ownerRequest.ownerId, { added: !wasSaved });
      } catch (eventError) {
        console.warn('[ReelsViewer] Bookmark event failed:', eventError?.message || eventError);
      }
    } catch {
      if (!ownerRequest.isCurrent()) return;
      setSaved((prev) => ({ ...prev, [reel.id]: wasSaved }));
      showErrorToast('Save failed - try again');
    }
  });

  const handleReport = async () => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!currentReel?.id || !ownerRequest.ownerId || !ownerRequest.isCurrent() || !reportReason.trim()) return;
    try {
      await submitReelReport({ reelId: currentReel.id, reason: reportReason, ownerId: ownerRequest.ownerId, accessToken: getAccessToken() });
      if (!ownerRequest.isCurrent()) return;
      setReportSubmitted(true);
      clearTimeout(reportModalTimerRef.current);
      reportModalTimerRef.current = setTimeout(() => {
        setShowReportModal(false);
        setReportSubmitted(false);
        setReportReason('');
      }, 2000);
    } catch {
      if (!ownerRequest.isCurrent()) return;
      showErrorToast('Report failed - please try again');
    }
  };

  const handleFollow = withReelMutation('follow', () => reels[currentIndex]?.author_id || reels[currentIndex]?.profiles?.id, async () => {
    const authorId = currentReel?.author_id || currentReel?.profiles?.id;
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!authorId || !ownerRequest.ownerId || !ownerRequest.isCurrent() || authorId === ownerRequest.ownerId) return;
    const wasFollowing = following[authorId];
    setFollowing((prev) => ({ ...prev, [authorId]: !prev[authorId] }));
    haptic(wasFollowing ? 5 : 15);
    try {
      if (wasFollowing) {
        const { error } = await supabase
          .from('social_follows')
          .delete()
          .eq('follower_id', ownerRequest.ownerId)
          .eq('following_id', authorId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('social_follows')
          .insert({ follower_id: ownerRequest.ownerId, following_id: authorId });
        if (error) throw error;
      }
      if (!ownerRequest.isCurrent()) return;
      busEmit.socialFollowChanged &&
        busEmit.socialFollowChanged(authorId, ownerRequest.ownerId, { added: !wasFollowing });
    } catch {
      if (!ownerRequest.isCurrent()) return;
      setFollowing((prev) => ({ ...prev, [authorId]: wasFollowing }));
      showErrorToast('Follow failed - try again');
    }
  });

  // Auto-hide overlay after 2.5 seconds - but NOT when video is paused
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

  // Lock body scroll while ReelsViewer is mounted - class-based so CSS desktop
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

  const loadReels = useCallback(async (mode) => {
    // A BACKGROUND refresh never shows the loading console, resets the cursor
    // or moves the active Reel: it merges into the mounted feed. It never
    // supersedes an unresolved foreground load; it runs once that load settles.
    const background = mode === BACKGROUND_REELS_REFRESH;
    // An error console is resolved by an explicit retry, not by a quiet refresh.
    if (background && loadErrorRef.current) return;
    // Sequenced over the latest-request guard; null means this background
    // refresh was queued behind an unresolved foreground load.
    const reelsRequest = reelsRefreshCoordinatorRef.current.begin({ background });
    if (!reelsRequest) return;
    // Either kind of full refresh supersedes an unresolved append.
    setLoadingMore(false);
    if (!background) {
      setLoading(true);
      setLoadError(false);
      setContinuationPaused(false);
      reelsCursorRef.current = null;
    }
    try {
      const idSet = new Set();
      const urlSet = new Set();
      const payload = await loadCanonicalReelsWindow({
        limit: 120,
        signal: reelsRequest.signal,
        scope: 'library-viewer',
        category: 'for-you',
        selectRows: (rows) => rows
          .map((reel) => ({ ...reel, source: 'reels' }))
          .filter((reel) => {
            if (reel.id && idSet.has(reel.id)) return false;
            if (reel.video_url && (
              urlSet.has(reel.video_url) || brokenUrlsRef.current.has(reel.video_url)
            )) return false;
            if (reel.id) idSet.add(reel.id);
            if (reel.video_url) urlSet.add(reel.video_url);
            return true;
          }),
      });
      if (!reelsRequest.isCurrent()) return;
      if (background) {
        const windowComplete = !payload.next_cursor && payload.continuation_paused !== true;
        const flaggedIds = [...staleReelIdsRef.current];
        const windowIds = new Set(payload.data.map((reel) => reel.id));
        const mountedIds = new Set(reelsRef.current.map((reel) => reel.id));
        const verdicts = windowComplete
          ? { replacements: [], removeIds: [] }
          : await resolveStaleReels({
            ids: flaggedIds.filter((id) => mountedIds.has(id) && !windowIds.has(id)),
            isCurrent: reelsRequest.isCurrent,
            fetchDetail: async (id) => (await fetchPokerReels({
              limit: 1,
              id,
              signal: reelsRequest.signal,
              scope: 'library-viewer',
              category: 'for-you',
            })).data.map((reel) => ({ ...reel, source: 'reels' })),
          });
        if (!reelsRequest.isCurrent()) return;
        // Ids without a verdict (not yet checked, or a non-verdict failure)
        // stay flagged for the next background refresh.
        const settledIds = new Set([
          ...windowIds,
          ...verdicts.removeIds,
          ...verdicts.replacements.map((reel) => reel.id),
        ]);
        flaggedIds.forEach((id) => {
          if (windowComplete || settledIds.has(id) || !mountedIds.has(id)) {
            staleReelIdsRef.current.delete(id);
          }
        });
        if (!reelsCursorRef.current && payload.next_cursor) {
          reelsCursorRef.current = payload.next_cursor;
          setHasMore(true);
        }
        const merged = mergeBackgroundReels({
          current: reelsRef.current,
          incoming: payload.data,
          activeIndex: currentIndexRef.current,
          removeIds: verdicts.removeIds,
          replacements: verdicts.replacements,
          windowComplete,
        });
        if (!merged.changed) return;
        reelsRef.current = merged.reels;
        setReels(merged.reels);
        if (merged.activeIndex !== currentIndexRef.current) {
          currentIndexRef.current = merged.activeIndex;
          setCurrentIndex(merged.activeIndex);
        }
        const lc = {},
          cc = {};
        merged.additions.forEach((r) => {
          lc[r.id] = r.like_count || 0;
          cc[r.id] = r.comment_count || 0;
        });
        // Mounted counts (including optimistic ones) win over a quiet refresh.
        setLikeCounts((prev) => ({ ...lc, ...prev }));
        setCommentCounts((prev) => ({ ...cc, ...prev }));
        return;
      }
      reelsCursorRef.current = payload.next_cursor || null;
      setHasMore(Boolean(payload.next_cursor));
      setContinuationPaused(payload.continuation_paused === true);
      const filteredMerged = payload.data;

      setReels(filteredMerged);
      const lc = {},
        cc = {};
      filteredMerged.forEach((r) => {
        lc[r.id] = r.like_count || 0;
        cc[r.id] = r.comment_count || 0;
      });
      // DB is source of truth on a full reload - DB values win over stale optimistic counts
      setLikeCounts((prev) => ({ ...prev, ...lc }));
      setCommentCounts((prev) => ({ ...prev, ...cc }));
    } catch (e) {
      if (e?.name === 'AbortError' || !reelsRequest.isCurrent()) return;
      if (background) {
        // A failed quiet refresh leaves the mounted feed and player untouched.
        console.warn('Background reels refresh failed:', e?.message || e);
        return;
      }
      console.warn('Load reels error:', e);
      setReels([]);
      setLoadError(true);
    } finally {
      const settled = reelsRefreshCoordinatorRef.current.settle(reelsRequest);
      if (settled.current && !background) setLoading(false);
      if (settled.flushQueued) scheduleBackgroundReelsRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  loadReelsRef.current = loadReels;

  useEffect(() => {
    // Returning to the tab revalidates quietly: the background refresh merges
    // into the mounted feed and never swaps the player or restarts playback.
    const revalidateVisibleFeed = () => {
      if (document.visibilityState === 'visible') scheduleBackgroundReelsRefresh();
    };
    window.addEventListener('focus', revalidateVisibleFeed);
    document.addEventListener('visibilitychange', revalidateVisibleFeed);
    return () => {
      window.removeEventListener('focus', revalidateVisibleFeed);
      document.removeEventListener('visibilitychange', revalidateVisibleFeed);
    };
  }, [scheduleBackgroundReelsRefresh]);

  const currentReel = reels[currentIndex];
  const captionUploadRef = useRef(null);
  const enhancements = useReelsEnhancements({
    reels, currentIndex, setReels: setReels, ownerId: activeUserIdRef.current || null,
    mode: 'latest', surface: 'library', videoRef, dataSaver: prefersDataSaver,
    onCompleted: (id) => setWatchedReelIds((previous) => persistWatchedReelIds([...new Set([...previous, id])], activeUserIdRef.current || null)),
  });
  const enhancedYouTubeEventRef = useRef(null);
  enhancedYouTubeEventRef.current = (event) => {
    const frame = ytIframeRef.current;
    if (frame && event?.source === frame.contentWindow && ['https://www.youtube.com', 'https://www.youtube-nocookie.com'].includes(event.origin)) enhancements.youtubeEvent(event);
    youtubeEventRef.current?.(event);
  };



  useNativeReelVisibility(videoRef, `${activeUserIdRef.current || 'public'}:${currentReel?.id || ''}`);
  const adjacentNativeUrl = reels[currentIndex + 1]?.video_url || null;
  useEffect(() => {
    if (prefersDataSaver || !adjacentNativeUrl) return;
    return prefetchVideoStart(adjacentNativeUrl, { dataSaver: prefersDataSaver, connection: typeof navigator !== 'undefined' ? navigator.connection : null });
  }, [adjacentNativeUrl, prefersDataSaver]);

  activeCommentReelIdRef.current = currentReel?.id || null;

  const handleRecommendationFeedback = (action) => {
    enhancements.feedback(action);
    if (!currentReel?.id) return;
    const ownerId = currentUserId || null;
    if (action === 'not-interested') {
      void handleDislike();
    } else if (action === 'already-watched') {
      setWatchedReelIds((previous) => persistWatchedReelIds([...new Set([...previous, currentReel.id])], ownerId));
    } else {
      const source = reelSourceKey(currentReel);
      setNotInterestedIds((previous) => {
        const next = new Set(previous);
        if (action === 'hide-source' && source) reels.forEach((reel) => { if (reelSourceKey(reel) === source) next.add(reel.id); });
        else next.add(currentReel.id);
        return persistNotInterestedReelIds(next, ownerId);
      });
      goNext();
    }
    setShowMoreMenu(false);
    setShowContextMenu(false);
  };



  // Explicit user commands go through the ready official API owner.
  const youtubeCommandRef = useRef(null);
  const sendYTCmd = (command, args = []) => youtubeCommandRef.current?.(command, args);

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
  // closure on every render - cheap, no allocation churn.
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
    if (loadingMore || !hasMore || !reelsCursorRef.current) return;
    const reelsRequest = reelsRequestGuardRef.current.begin({ append: true });
    if (!reelsRequest) return;
    setLoadingMore(true);
    setContinuationPaused(false);
    try {
      const existingIds = new Set(reels.map((reel) => reel.id));
      const existingUrls = new Set(reels.map((reel) => reel.video_url).filter(Boolean));
      const seenUrlsThisScan = new Set();
      const payload = await loadCanonicalReelsWindow({
        cursor: reelsCursorRef.current,
        limit: 60,
        signal: reelsRequest.signal,
        scope: 'library-viewer',
        category: 'for-you',
        selectRows: (rows) => rows
          .map((reel) => ({ ...reel, source: 'reels' }))
          .filter((reel) => {
            if (existingIds.has(reel.id) || notInterestedIds.has(reel.id)) return false;
            if (reel.video_url && (
              existingUrls.has(reel.video_url)
              || seenUrlsThisScan.has(reel.video_url)
              || brokenUrlsRef.current.has(reel.video_url)
            )) return false;
            if (reel.video_url) seenUrlsThisScan.add(reel.video_url);
            return true;
          }),
      });
      if (!reelsRequest.isCurrent()) return;
      reelsCursorRef.current = payload.next_cursor || null;
      setHasMore(Boolean(payload.next_cursor));
      setContinuationPaused(payload.continuation_paused === true);
      const fresh = payload.data;

      if (fresh.length > 0) {
        const lc = {},
          cc = {};
        fresh.forEach((reel) => {
          lc[reel.id] = reel.like_count || 0;
          cc[reel.id] = reel.comment_count || 0;
        });
        setReels((prev) => capReelsInMemory(
          mergeReels(prev, fresh, { category: 'for-you' }),
          currentReel?.id,
        ));
        setLikeCounts((prev) => ({ ...prev, ...lc }));
        setCommentCounts((prev) => ({ ...prev, ...cc }));
      }
    } catch (e) {
      if (e?.name !== 'AbortError' && reelsRequest.isCurrent()) {
        console.warn('[ReelsViewer] loadMoreReels failed:', e?.message);
      }
    } finally {
      if (reelsRequest.finish()) setLoadingMore(false);
    }
  };

  const handleLike = withReelMutation('reaction', () => reels[currentIndex]?.id, async () => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!currentReel?.id) return;
    if (!ownerRequest.ownerId) return showErrorToast('Sign in to like Reels');
    if (!ownerRequest.isCurrent()) return;
    const reelId = currentReel.id;
    const wasLiked = Boolean(liked[reelId]);
    const wasDisliked = Boolean(disliked[reelId]);
    const previousCount = likeCounts[reelId] ?? currentReel.like_count ?? 0;
    setLiked(prev => ({ ...prev, [reelId]: !wasLiked }));
    if (!wasLiked) setDisliked(prev => ({ ...prev, [reelId]: false }));
    setLikeCounts(prev => ({ ...prev, [reelId]: Math.max(0, previousCount + (wasLiked ? -1 : 1)) }));
    setLikeBounceId(reelId);
    if (likeBounceTimerRef.current) clearTimeout(likeBounceTimerRef.current);
    likeBounceTimerRef.current = setTimeout(() => {
      likeBounceTimerRef.current = null;
      setLikeBounceId(null);
    }, 400);
    try {
      const result = await mutateReelReaction(supabase, { reelId, reaction: 'like', active: !wasLiked });
      if (!ownerRequest.isCurrent()) return;
      setLiked(prev => ({ ...prev, [reelId]: result.liked }));
      setDisliked(prev => ({ ...prev, [reelId]: result.disliked }));
      setLikeCounts(prev => ({ ...prev, [reelId]: result.likeCount }));
      if (result.liked !== wasLiked) busEmit.socialPostLiked(reelId, ownerRequest.ownerId, { added: result.liked, reactionType: 'like' });
    } catch (error) {
      if (!ownerRequest.isCurrent()) return;
      setLiked(prev => ({ ...prev, [reelId]: wasLiked }));
      setDisliked(prev => ({ ...prev, [reelId]: wasDisliked }));
      setLikeCounts(prev => ({ ...prev, [reelId]: previousCount }));
      showErrorToast(error.code === '55P03' ? 'Reaction is busy. Try again.' : 'Like could not be confirmed. Refresh before trying again.');
    }
  });

  const handleDislike = withReelMutation('reaction', () => reels[currentIndex]?.id, async () => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!currentReel?.id) return;
    if (!ownerRequest.ownerId) return showErrorToast('Sign in to manage Reel recommendations');
    if (!ownerRequest.isCurrent()) return;
    const reelId = currentReel.id;
    const wasLiked = Boolean(liked[reelId]);
    const wasDisliked = Boolean(disliked[reelId]);
    const previousCount = likeCounts[reelId] ?? currentReel.like_count ?? 0;
    setDisliked(prev => ({ ...prev, [reelId]: !wasDisliked }));
    if (!wasDisliked && wasLiked) {
      setLiked(prev => ({ ...prev, [reelId]: false }));
      setLikeCounts(prev => ({ ...prev, [reelId]: Math.max(0, previousCount - 1) }));
    }
    try {
      const result = await mutateReelReaction(supabase, { reelId, reaction: 'dislike', active: !wasDisliked });
      if (!ownerRequest.isCurrent()) return;
      setLiked(prev => ({ ...prev, [reelId]: result.liked }));
      setDisliked(prev => ({ ...prev, [reelId]: result.disliked }));
      setLikeCounts(prev => ({ ...prev, [reelId]: result.likeCount }));
      setNotInterestedIds(prev => {
        const next = new Set(prev);
        if (result.disliked) next.add(reelId); else next.delete(reelId);
        return persistNotInterestedReelIds(next, ownerRequest.ownerId);
      });
      if (result.liked !== wasLiked) busEmit.socialPostLiked(reelId, ownerRequest.ownerId, { added: result.liked, reactionType: 'like' });
    } catch (error) {
      if (!ownerRequest.isCurrent()) return;
      setLiked(prev => ({ ...prev, [reelId]: wasLiked }));
      setDisliked(prev => ({ ...prev, [reelId]: wasDisliked }));
      setLikeCounts(prev => ({ ...prev, [reelId]: previousCount }));
      showErrorToast(error.code === '55P03' ? 'Reaction is busy. Try again.' : 'Reaction could not be confirmed. Refresh before trying again.');
    }
  });

  // Comment handler
  const handleOpenComments = async () => {
    // BUG FIX (Bug 24): stale state anti-pattern
    // Old: setShowCommentInput(prev => !prev) then immediately check !showCommentInput
    // This fires the data-fetch branch on BOTH open AND close clicks because
    // showCommentInput holds the PRE-toggle value in the closure.
    // Fix: determine intent from current value BEFORE toggling.
    const isOpening = !showCommentInput;
    setShowCommentInput(isOpening);
    if (!isOpening) {
      commentRequestGuardRef.current.abort();
      return;
    }
    if (isOpening && currentReel?.id) {
      const reelId = currentReel.id;
      const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
      const commentRequest = commentRequestGuardRef.current.begin({ append: false });
      setCommentPage(0);
      setCommentLoadError('');
      setLoadingMoreComments(false);
      try {
        const data = await readReelComments(supabase, reelId, { page: 0, oldest: commentSort === 'oldest', signal: commentRequest.signal });
        if (!commentRequest.isCurrent() || !ownerRequest.isCurrent() || activeCommentReelIdRef.current !== reelId) return;
        setReelComments(data || []);
        setHasMoreComments((data || []).length >= 50);
        // #6 Load comment like counts (totals) AND current user's own hearts
        try {
          const userId = ownerRequest.ownerId;
          const [clAllResult, clMyResult] = await Promise.all([
            // Total likes per comment (all users)
            supabase
              .from('social_interactions')
              .select('metadata')
              .eq('post_id', reelId)
              .eq('interaction_type', 'comment_like'),
            // BUG FIX (Bug 20): hydrate own comment hearts so they show filled on open
            userId
              ? supabase
                  .from('social_interactions')
                  .select('metadata')
                  .eq('post_id', reelId)
                  .eq('user_id', userId)
                  .eq('interaction_type', 'comment_like')
              : Promise.resolve({ data: [] }),
          ]);
          if (!commentRequest.isCurrent() || !ownerRequest.isCurrent() || activeCommentReelIdRef.current !== reelId) return;
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
          if (commentRequest.isCurrent() && ownerRequest.isCurrent() && activeCommentReelIdRef.current === reelId) {
            console.warn('Handled exception:', e);
          }
        }
      } catch (error) {
        if (commentRequest.isCurrent() && ownerRequest.isCurrent() && activeCommentReelIdRef.current === reelId) {
          console.warn('[ReelsViewer] Comment load failed:', error?.message || error);
          setCommentLoadError('Comments Could Not Be Loaded. Close And Reopen To Try Again.');
          setReelComments([]);
        }
      } finally {
        commentRequest.finish();
      }
      if (!commentRequest.isCurrent() || activeCommentReelIdRef.current !== reelId) return;
      // BUG FIX (RLXS-2): cancel previous focus timer - prevents focus() on unmounted input.
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
    const commentRequest = commentRequestGuardRef.current.begin({ append: true });
    if (!commentRequest) return;
    const reelId = currentReel.id;
    setCommentLoadError('');
    setLoadingMoreComments(true);
    const nextPage = commentPage + 1;
    try {
      const data = await readReelComments(supabase, reelId, { page: nextPage, oldest: commentSort === 'oldest', signal: commentRequest.signal });
      if (!commentRequest.isCurrent() || activeCommentReelIdRef.current !== reelId) return;
      if (data && data.length > 0) {
        setReelComments((prev) => [...prev, ...data]);
        setCommentPage(nextPage);
        setHasMoreComments(data.length >= 50);
      } else {
        setHasMoreComments(false);
      }
    } catch (error) {
      if (commentRequest.isCurrent() && activeCommentReelIdRef.current === reelId) {
        console.warn('[ReelsViewer] More comments failed:', error?.message || error);
        setCommentLoadError('Comments Could Not Be Loaded. Close And Reopen To Try Again.');
        setHasMoreComments(false);
      }
    } finally {
      if (commentRequest.finish()) setLoadingMoreComments(false);
    }
  };

  const commentAttemptDraftRef = useRef(null);
  commentAttemptDraftRef.current = { text: commentText, mediaUrl: reelCommentMediaUrl, mediaType: reelCommentMediaType, reply: replyTo };
  const handleSubmitComment = withReelMutation('comment', () => reels[currentIndex]?.id, async (e) => {
    if (e && e.key !== 'Enter') return;
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if ((!commentText.trim() && !reelCommentMediaUrl) || !ownerRequest.ownerId || !ownerRequest.isCurrent() || !currentReel?.id) return;
    const reelId = currentReel.id;
    const text = commentText.trim();
    const mediaUrl = reelCommentMediaUrl;
    const mediaType = reelCommentMediaType;
    const parentId = replyTo?.id || null;
    const capturedReply = replyTo;
    const payload = { post_id: reelId, author_id: ownerRequest.ownerId, content: text, parent_id: parentId, media_url: mediaUrl || null, media_type: mediaType || null };
    const attempt = await getOrCreateReelCommentAttempt(payload);
    if (!ownerRequest.isCurrent() || activeCommentReelIdRef.current !== reelId) { if (!attempt.reused) forgetReelCommentAttempt(attempt); return; }
    const latestDraft = commentAttemptDraftRef.current;
    if (latestDraft.text.trim() !== text || latestDraft.mediaUrl !== mediaUrl || latestDraft.reply?.id !== capturedReply?.id) { if (!attempt.reused) forgetReelCommentAttempt(attempt); return; }
    const tempId = attempt.id;
    const alreadyVisible = reelComments.some((comment) => comment.id === tempId);
    commentAttemptDraftRef.current = { text: '', mediaUrl: null, mediaType: null, reply: null };
    setCommentText('');
    setReelCommentMediaUrl(null);
    setReelCommentMediaType(null);
    setShowReelGifPicker(false);
    setReplyTo(null);
    setReelComments((prev) => prev.some((comment) => comment.id === tempId) ? prev : [
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
    let persistedComment = false;
    try {
      const { comment: confirmedComment } = await postReelComment(supabase, { ...payload, id: tempId });
      persistedComment = true;
      try { forgetReelCommentAttempt(attempt); } catch (storageError) { console.warn('[Reels] Confirmed comment retry identity retained:', storageError?.message); }
      if (!ownerRequest.isCurrent()) return;
      if (activeCommentReelIdRef.current === reelId) setReelComments((previous) => previous.map((comment) => comment.id === tempId ? { ...comment, ...confirmedComment } : comment));
      // BUG FIX: guard busEmit call (socialCommentAdded may be undefined in some build configs)
      busEmit.socialCommentAdded && busEmit.socialCommentAdded(reelId, ownerRequest.ownerId);
      // DB trigger (trig_update_reel_comment_count / trig_update_post_comment_count)
      // handles comment_count increment atomically - no RPC needed here
      const persistedCount = await Promise.resolve(supabase.from('social_reels').select('comment_count').eq('id', reelId).maybeSingle()).catch((error) => ({ error }));
      if (ownerRequest.isCurrent() && !persistedCount.error && Number.isFinite(persistedCount.data?.comment_count)) {
        setCommentCounts((prev) => ({ ...prev, [reelId]: persistedCount.data.comment_count }));
      }
    } catch (error) {
      if (!ownerRequest.isCurrent() || persistedComment) return;
      if (activeCommentReelIdRef.current === reelId) {
        if (!alreadyVisible) setReelComments((prev) => prev.filter((c) => c.id !== tempId));
        if (shouldRestoreReelCommentDraft(commentAttemptDraftRef.current)) {
          setCommentText((current) => current.trim() ? current : text);
          setReelCommentMediaUrl((current) => current || mediaUrl);
          setReelCommentMediaType((current) => current || mediaType);
          setReplyTo((current) => current || capturedReply);
        }
      }
      showErrorToast('Comment failed - please try again');
    }
  });

  // Phase 6 - Comment like toggle
  const handleCommentLike = async (commentId) => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!ownerRequest.ownerId || !ownerRequest.isCurrent() || !currentReel?.id) return;
    const reelId = currentReel.id;
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
        const { error } = await supabase
          .from('social_interactions')
          .delete()
          .eq('user_id', ownerRequest.ownerId)
          .eq('post_id', reelId)
          .eq('interaction_type', 'comment_like')
          .eq('metadata->>comment_id', commentId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('social_interactions').insert({
          user_id: ownerRequest.ownerId,
          post_id: reelId,
          interaction_type: 'comment_like',
          metadata: { comment_id: commentId },
        });
        if (error) throw error;
      }
    } catch {
      if (!ownerRequest.isCurrent()) return;
      setCommentLikes((prev) => ({ ...prev, [commentId]: wasLiked }));
      setCommentLikeCounts((prev) => ({
        ...prev,
        [commentId]: Math.max(0, (prev[commentId] || 0) + (wasLiked ? 1 : -1)),
      }));
    }
  };

  // Phase 6 - Delete own comment
  const handleDeleteComment = withReelMutation('comment-delete', () => reels[currentIndex]?.id, async (commentId) => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!ownerRequest.ownerId || !ownerRequest.isCurrent() || !currentReel?.id) return;
    const reelId = currentReel.id;
    const deletedIndex = reelComments.findIndex((comment) => comment.id === commentId);
    const deletedComment = deletedIndex >= 0 ? reelComments[deletedIndex] : null;
    setReelComments((c) => c.filter((x) => x.id !== commentId));
    try {
      const deletion = await removeReelComment(supabase, { id: commentId, postId: reelId, ownerId: ownerRequest.ownerId });
      if (!ownerRequest.isCurrent()) return;
      // DB trigger handles comment_count decrement atomically
      if (deletion.commentCount !== null) setCommentCounts(prev => ({ ...prev, [reelId]: deletion.commentCount }));
      busEmit.socialCommentAdded &&
        busEmit.socialCommentAdded(reelId, ownerRequest.ownerId, { removed: true, commentCount: deletion.commentCount });
    } catch (error) {
      if (error.code === 'REEL_COMMENT_DELETE_UNKNOWN') { if (ownerRequest.isCurrent()) showErrorToast(error.message); return; }
      console.warn('[ReelsViewer] Comment delete failed:', error?.message || error);
      if (!ownerRequest.isCurrent() || activeCommentReelIdRef.current !== reelId || !deletedComment) return;
      setReelComments((current) => {
        if (current.some((comment) => comment.id === commentId)) return current;
        const restored = [...current];
        restored.splice(Math.min(deletedIndex, restored.length), 0, deletedComment);
        return restored;
      });
      showErrorToast('Delete failed - please try again');
    }
  });

  // Phase 7 - Edit own comment
  const handleEditComment = (comment) => {
    commentEditEpochRef.current += 1;
    setEditingComment(comment.id);
    setEditCommentText(comment.content || '');
  };
  const handleSaveEdit = withReelMutation('comment-edit', () => reels[currentIndex]?.id, async (commentId) => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!editCommentText.trim() || !ownerRequest.ownerId || !ownerRequest.isCurrent() || !currentReel?.id) return;
    const reelId = currentReel.id;
    const editEpoch = commentEditEpochRef.current;
    const content = editCommentText.trim();
    const orig = reelComments.find((c) => c.id === commentId);
    setReelComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, content } : c))
    );
    setEditingComment(null);
    try {
      await editReelComment(supabase, { id: commentId, postId: reelId, ownerId: ownerRequest.ownerId, content });
      if (!ownerRequest.isCurrent()) return;
    } catch (error) {
      if (error.code === 'REEL_COMMENT_EDIT_UNKNOWN') { if (ownerRequest.isCurrent()) showErrorToast(error.message); return; }
      if (ownerRequest.isCurrent()) showErrorToast('Edit could not be confirmed. Refresh before trying again.');
      console.warn('[ReelsViewer] Comment edit failed:', error?.message || error);
      if (ownerRequest.isCurrent() && activeCommentReelIdRef.current === reelId && orig) {
        setReelComments((prev) => prev.map((c) => (c.id === commentId ? orig : c)));
      }
    }
    if (ownerRequest.isCurrent() && commentEditEpochRef.current === editEpoch) setEditCommentText('');
  });

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
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!file || !ownerRequest.ownerId || !ownerRequest.isCurrent()) return;
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
      if (resp.ok && result.success && ownerRequest.isCurrent()) {
        setReelCommentMediaUrl(result.url);
        setReelCommentMediaType('image');
      }
    } catch (err) {
      if (ownerRequest.isCurrent()) console.warn('[ReelComment] Upload error:', err);
    }
    if (ownerRequest.isCurrent()) setUploadingReelImage(false);
  };

  // Phase 9: 1-Click Repost Architecture - opens share modal; repost requires explicit user action
  const handleShare = () => {
    if (!currentReel?.id) return;
    haptic(10);
    setShowShareModal(true);
  };

  const shareReelUrl = currentReel
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}${buildReelPath(currentReel)}`
    : '';

  const handleShareAction = async (platform) => {
    const reel = currentReel;
    const userId = activeUserIdRef.current;
    const ownerRequest = accountScopeRef.current.capture(userId);
    if (!reel?.id) return;
    setShowShareModal(false);
    const url = shareReelUrl;
    const title = 'Check Out This Reel On Smarter.Poker';
    try {
      if (platform === 'copy') {
        await navigator.clipboard.writeText(url);
        if (!ownerRequest.isCurrent()) return;
        setShareToast(true);
        clearTimeout(shareToastTimerRef.current);
        shareToastTimerRef.current = setTimeout(() => setShareToast(false), 2000);
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
      if (!ownerRequest.isCurrent()) return;
      if (platform !== 'copy') await recordShareMetric(reel, platform === 'native' ? 'external' : platform);
      if (userId) busEmit.socialPostShared(reel.id, userId);
    } catch (err) {
      if (!ownerRequest.isCurrent()) return;
      // AUDIT FIX: do NOT show "Link Copied" toast on failures unrelated to clipboard.
      // navigator.share() throws AbortError on user-cancel (not an error) and
      // other errors on share failures. Only show the copy toast for actual copy failures.
      if (platform === 'copy') {
        // Clipboard copy failed - try fallback via selection
        showErrorToast('Copy failed - try again');
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
    const reel = currentReel;
    const userId = activeUserIdRef.current;
    if (!reel?.id || !userId || sharingToFeed) return;
    const ownerRequest = accountScopeRef.current.capture(userId);
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
          reel_id: reel.id,
          video_url: reel.video_url || null,
          caption: reel.caption || '',
          user_description: descToSend.trim() || '',
        }),
      });
      const result = await res.json();
      if (!ownerRequest.isCurrent()) return;
      if (!res.ok) throw new Error(result.error || 'Share failed');
      if (result.already_shared) {
        showErrorToast('Already shared this reel!');
      } else {
        await recordShareMetric(reel, 'feed');
        busEmit.socialPostShared(reel.id, userId);
        busEmit.dataMutated('social');
      }
      setSharedToFeed(true);
      clearTimeout(sharedToFeedTimerRef.current);
      sharedToFeedTimerRef.current = setTimeout(() => {
        setSharedToFeed(false);
      }, 3000);
    } catch (err) {
      if (!ownerRequest.isCurrent()) return;
      console.warn('Share to feed failed:', err.message);
      showErrorToast('Share failed - try again');
    }
    if (ownerRequest.isCurrent()) {
      setSharingToFeed(false);
      setShareDescription('');
    }
  };

  // Reset comment drawer + caption + report + GIF + share on reel change
  useEffect(() => {
    commentRequestGuardRef.current.abort();
    setShowCommentInput(false);
    setCommentText('');
    setReelComments([]);
    setCommentLoadError('');
    setLoadingMoreComments(false);
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

  const dialogRef = useRef(null);
  const dialogReturnFocusRef = useRef(null);
  const dialogOpenRef = useRef(false);
  const activeDialogKey = showReelGifPicker
    ? 'gif'
    : showShareDescriptionModal
      ? 'share-description'
      : showReportModal
        ? 'report'
        : showShareModal
          ? 'share'
          : showContextMenu
            ? 'context'
            : showShortcutsOverlay
              ? 'shortcuts'
              : showReactionPicker
                ? 'reactions'
                : showMoreMenu
                  ? 'options'
                  : showCommentInput
                    ? 'comments'
                    : '';
  dialogOpenRef.current = Boolean(activeDialogKey);

  const closeDialog = useCallback((key) => {
    if (key === 'gif') setShowReelGifPicker(false);
    else if (key === 'share-description') setShowShareDescriptionModal(false);
    else if (key === 'report') {
      setShowReportModal(false);
      setReportSubmitted(false);
      setReportReason('');
    } else if (key === 'share') setShowShareModal(false);
    else if (key === 'context') setShowContextMenu(false);
    else if (key === 'shortcuts') setShowShortcutsOverlay(false);
    else if (key === 'reactions') setShowReactionPicker(false);
    else if (key === 'options') setShowMoreMenu(false);
    else if (key === 'comments') {
      setShowReelGifPicker(false);
      setShowCommentInput(false);
    }
  }, []);

  useEffect(() => {
    if (!activeDialogKey) return undefined;
    const previousFocus = document.activeElement;
    dialogReturnFocusRef.current = previousFocus;
    const focusTimer = requestAnimationFrame(() => {
      const initial = dialogRef.current?.querySelector(
        '[data-autofocus="true"], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href]'
      );
      initial?.focus();
    });
    const handleDialogKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeDialog(activeDialogKey);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href]'
        ) || []
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKey, true);
    return () => {
      cancelAnimationFrame(focusTimer);
      document.removeEventListener('keydown', handleDialogKey, true);
      if (dialogReturnFocusRef.current?.isConnected) dialogReturnFocusRef.current.focus();
    };
  }, [activeDialogKey, closeDialog]);

  // ─── Global gesture capture for autoplay-with-sound ─────────────────────
  // Browsers gate unmuted autoplay behind a real user gesture. The earlier
  // we capture the FIRST gesture the better - by the time the
  // IntersectionObserver fires post-scroll, the gesture context has already
  // expired in some browsers. Listening on pointerdown/keydown/wheel/touch
  // catches the gesture synchronously and persists it to sessionStorage so
  // every subsequent slot transition (swipe up/down, arrow key, click) can
  // unmute without re-prompting.
  useEffect(() => {
    // NOTE: do NOT early-return when userInteractedRef.current is already true
    // (from sessionStorage). On a page reload with sessionStorage='1', the
    // sticky flag tells us the user has gestured BEFORE in this tab session,
    // but the BROWSER's autoplay context is per-document - it has not seen
    // a gesture on THIS page load. We must keep listening so we can mark
    // userGesturedThisLoadRef the moment the user gestures again, otherwise
    // slot-transition setMuted(false) calls would fire while YT silently
    // rejects unMute to UI lie. Listeners are cheap.
    const onGesture = () => {
      // Always flip the per-load ref - every gesture refreshes the gate.
      userGesturedThisLoadRef.current = true;
      // Sticky tab-session flag (idempotent after first set).
      if (!userInteractedRef.current) {
        userInteractedRef.current = true;
        try {
          safeSetReelsSessionStorage('sp:reels:interacted', '1');
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
      if (dialogOpenRef.current) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        // BUG FIX (2026-05-11): sync-unmute inside the keypress gesture so
        // Chrome accepts the unMute postMessage for the next iframe.
        // The global gesture-capture effect unmutes the CURRENT media, but
        // when the user keys to advance, the new iframe inherits no gesture
        // context - onPlaying / IO unmute runs post-expiry. Sync-call here.
        if (userWantsSoundRef.current) {
          try {
            if (videoRef.current) {
              videoRef.current.muted = false;
              if (videoRef.current.volume === 0) videoRef.current.volume = 1.0;
            }
            sendYTCmd('unMute');
            sendYTCmd('setVolume', [100]);
            setMuted(false);
          } catch (_) { /* best-effort */ }
        }
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape') onClose();
      // BUG FIX: Space bar is the universal play/pause shortcut - was missing
      // Uses DOM refs only to avoid stale closures (effect deps = [onClose])
      if (e.key === ' ') {
        e.preventDefault(); // Prevent page scroll
        if (videoRef.current) {
          // Native video - read paused from DOM (always fresh)
          if (videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          } else {
            videoRef.current.pause();
          }
        } else {
          // YouTube - use setPaused callback to read fresh state
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

  // M4: IntersectionObserver - single source of truth for currentIndex
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
          // 2026-08-15 audit: the old eviction set evictEl.src = '' - React
          // never re-commits an unchanged src prop, so scrolling back up two
          // slots showed a permanently blank video. Release decoder memory
          // without touching src: pause + drop buffered position.
          const evictEl = container.querySelector(`[data-reel-index="${newIdx - 2}"] video`);
          if (evictEl) {
            try { evictEl.pause(); evictEl.currentTime = 0; } catch (_) {}
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
  // Storage URLs - none of which fire onError reliably.
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
        console.warn('[ReelsViewer] video stall watchdog tripped - auto-skipping', {
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
  }, [reels[currentIndex]?.id, reels[currentIndex]?.video_url]);

  // Progress hooks must remain above every loading/error/empty early return.
  // Keeping them below those returns changed the hook count after loadReels()
  // resolved and crashed the production viewer with React invariant #310.
  const updateProgressRef = useRef(null);
  updateProgressRef.current = () => {
    if (videoRef.current && videoRef.current.duration) {
      setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
    }
    progressRAF.current = requestAnimationFrame(updateProgressRef.current);
  };

  // Cleanup RAF + interaction timers on every unmount, including loading and
  // error-state unmounts.
  useEffect(() => {
    return () => {
      if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    };
  }, []);

  if (loading) {
    return (
      <ReelViewerConsoleState
        title="Tuning Reel Signal"
        subtitle="Embedded Viewer"
        pill="Connecting"
        copy="The console is verifying playable Reel footage and preparing the viewer."
        rows={[
          { label: 'Source', value: 'Verified Library' },
          { label: 'Playback', value: 'Preparing', valueInk: 'blue' },
        ]}
        secondary={{ label: 'Close Viewer', onClick: onClose, ink: 'silver' }}
        primary={{ label: 'Retry Signal', onClick: () => loadReels(), ink: 'blue' }}
      />
    );
  }

  if (loadError) {
    return (
      <ReelViewerConsoleState
        title="Signal Interrupted"
        subtitle="Embedded Viewer"
        pill="Attention"
        pillInk="red"
        copy="The Reel service did not answer. No previous account state will be shown while it reconnects."
        rows={[
          { label: 'Playback', value: 'Connection Required' },
          { label: 'Account State', value: 'Protected', valueInk: 'green' },
        ]}
        secondary={{ label: 'Close Viewer', onClick: onClose, ink: 'silver' }}
        primary={{ label: 'Try Again', onClick: () => loadReels(), ink: 'blue' }}
      />
    );
  }

  if (!reels.length) {
    return (
      <ReelViewerConsoleState
        title="No Reels Yet"
        subtitle="Verified Reel Video"
        pill={hasMore ? 'Scanning' : 'Stand By'}
        copy="No playable Reel is available in this pass. Continue the scan or close the viewer."
        rows={[
          { label: 'Playback', value: 'No Match' },
          { label: 'Safety Check', value: 'Complete', valueInk: 'green' },
        ]}
        secondary={{ label: 'Close Viewer', onClick: onClose, ink: 'silver' }}
        primary={{
          label: loadingMore ? 'Finding Reels' : hasMore ? 'Continue Scan' : 'Refresh Viewer',
          disabled: loadingMore,
          onClick: hasMore && reelsCursorRef.current ? () => void loadMoreReels() : () => loadReels(),
          ink: 'blue',
        }}
      />
    );
  }

  const handleTap = () => {
    if (showCommentInput) return;
    const now = Date.now();
    userInteractedRef.current = true;
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (!liked[currentReel?.id]) handleLike();
      if (currentUserId) {
        setShowHeart(true);
        clearTimeout(showHeartTimerRef.current);
        showHeartTimerRef.current = setTimeout(() => setShowHeart(false), 800);
      }
      if (isYouTubeUrl(currentReel?.video_url)) sendYTCmd('playVideo');
      else videoRef.current?.play().catch(() => showErrorToast('Tap Play To Resume'));
      return;
    }
    lastTapRef.current = now;
    togglePlayback();
  };

  const togglePlayback = () => {
    const isYouTube = isYouTubeUrl(currentReel?.video_url);
    if (isYouTube) {
      sendYTCmd(paused ? 'playVideo' : 'pauseVideo');
      setPaused((value) => !value);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const toggleSound = () => {
    setMuted((value) => {
      const next = !value;
      userWantsSoundRef.current = !next;
      sendYTCmd(next ? 'mute' : 'unMute');
      if (!next) sendYTCmd('setVolume', [100]);
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  };

  const copyCurrentLink = () => {
    navigator.clipboard
      .writeText(shareReelUrl)
      .then(() => {
        setCopyToast(true);
        clearTimeout(copyToastTimerRef.current);
        copyToastTimerRef.current = setTimeout(() => setCopyToast(false), 2000);
      })
      .catch(() => showErrorToast('Copy Failed. Try Again.'));
  };

  const toggleCommentSort = () => {
    const next = commentSort === 'newest' ? 'oldest' : 'newest';
    setCommentSort(next);
    setReelComments((comments) =>
      [...comments].sort((a, b) =>
        next === 'newest'
          ? new Date(b.created_at) - new Date(a.created_at)
          : new Date(a.created_at) - new Date(b.created_at)
      )
    );
  };

  const authorId = currentReel?.author_id || currentReel?.profiles?.id;
  const authorName = reelSourceName(currentReel);
  const topicLabel = reelTopicLabel(currentReel);
  const sourceUrl = reelSourceUrl(currentReel);
  const publisherName = currentReel?.profiles?.full_name || currentReel?.profiles?.username || null;
  const publisherLabel = publisherName || authorName;
  const showAuthorAvatar = Boolean(currentReel?.profiles?.avatar_url);
  const authorIdentity = (
    <>
      {showAuthorAvatar ? (
        <img
          className={styles.avatar}
          src={currentReel.profiles.avatar_url}
          alt={`${publisherLabel} Avatar`}
        />
      ) : null}
      <span>
        <span className={styles.authorName}>{publisherLabel}</span>
        <span className={styles.authorMeta}>
          {timeAgo(currentReel?.created_at)}
          {watchedReelIds.includes(currentReel?.id) ? ' / Watched' : ''}
        </span>
      </span>
    </>
  );
  const currentCaption = currentReel?.caption || '';
  const visibleCaption =
    captionExpanded || currentCaption.length <= 140
      ? currentCaption
      : `${currentCaption.slice(0, 140)}...`;
  const speedPercent = Math.round(playbackSpeed * 100);

  const dialogTitles = {
    gif: 'GIF Archive',
    comments: 'Reel Comments',
    reactions: 'Reel Reactions',
    options: 'Playback Options',
    context: 'Reel Commands',
    share: 'Share This Reel',
    'share-description': 'Share To My Feed',
    report: 'Report This Reel',
    shortcuts: 'Keyboard Commands',
  };
  const dialogSubtitles = {
    gif: 'Select Comment Media',
    comments: 'Conversation Console',
    reactions: 'Engagement Console',
    options: 'Playback Console',
    context: 'Context Console',
    share: 'Distribution Console',
    'share-description': 'Social Feed Console',
    report: 'Safety Console',
    shortcuts: 'Control Reference',
  };
  const dialogPills = {
    gif: 'Media',
    comments: `${reelComments.length} Loaded`,
    reactions: liked[currentReel?.id] ? 'Liked' : 'Ready',
    options: `${speedPercent} Percent`,
    context: 'Ready',
    share: 'Choose Route',
    'share-description': `${shareDescription.length} Of 500`,
    report: reportSubmitted ? 'Submitted' : 'Review',
    shortcuts: 'Reference',
  };

  let dialogContent = null;

  if (activeDialogKey === 'gif') {
    dialogContent = (
      <>
        <GiphyPicker
          compact
          onSelect={(gifUrl) => {
            setReelCommentMediaUrl(gifUrl);
            setReelCommentMediaType('gif');
            setShowReelGifPicker(false);
          }}
          onClose={() => setShowReelGifPicker(false)}
        />
        <button type="button" className={styles.wordAction} onClick={() => closeDialog('gif')}>
          Back To Comments
        </button>
      </>
    );
  } else if (activeDialogKey === 'comments') {
    dialogContent = (
      <>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.wordAction} onClick={toggleCommentSort}>
            Sort {commentSort === 'newest' ? 'Newest' : 'Oldest'}
          </button>
          {hasMoreComments ? (
            <button
              type="button"
              className={styles.wordAction}
              onClick={loadMoreComments}
              disabled={loadingMoreComments}
            >
              {loadingMoreComments ? 'Loading Comments' : 'Load More Comments'}
            </button>
          ) : (
            <button type="button" className={styles.wordAction} onClick={() => closeDialog('comments')}>
              Close Comments
            </button>
          )}
        </div>

        <div className={styles.commentList}>
          {commentLoadError && <ConsoleCopy align="center" role="alert">{commentLoadError}</ConsoleCopy>}
          {!commentLoadError && reelComments.length === 0 ? (
            <ConsoleCopy align="center">No Comments Yet. Be The First.</ConsoleCopy>
          ) : null}
          {reelComments.map((comment) => {
            const ownComment = comment.author_id === currentUserId;
            return (
              <article
                className={`${styles.comment} ${
                  comment.profiles?.avatar_url ? '' : styles.commentTextOnly
                }`}
                key={comment.id}
              >
                {comment.profiles?.avatar_url ? (
                  <img
                    className={styles.commentAvatar}
                    src={comment.profiles.avatar_url}
                    alt={`${comment.profiles?.username || 'Poker Player'} Avatar`}
                  />
                ) : null}
                <div className={styles.commentBody}>
                  <p className={styles.commentName}>
                    {comment.profiles?.username || 'Poker Player'}
                  </p>
                  {editingComment === comment.id ? (
                    <input
                      className={styles.field}
                      value={editCommentText}
                      onChange={(event) => setEditCommentText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleSaveEdit(comment.id);
                        if (event.key === 'Escape') {
                          setEditingComment(null);
                          setEditCommentText('');
                        }
                      }}
                      aria-label="Edit Comment"
                    />
                  ) : comment.content ? (
                    <p className={styles.commentCopy}><PokerCardText text={comment.content} /></p>
                  ) : null}
                  {comment.media_url ? (
                    <img
                      className={styles.commentMedia}
                      src={comment.media_url}
                      alt={comment.media_type === 'gif' ? 'Comment GIF' : 'Comment Image'}
                    />
                  ) : null}
                  <div className={styles.commentActions}>
                    <button
                      type="button"
                      className={styles.inlineAction}
                      onClick={() => handleCommentLike(comment.id)}
                    >
                      {commentLikes[comment.id] ? 'Unlike' : 'Like'}
                      {commentLikeCounts[comment.id] > 0
                        ? ` ${commentLikeCounts[comment.id]}`
                        : ''}
                    </button>
                    <button
                      type="button"
                      className={styles.inlineAction}
                      onClick={() => {
                        setReplyTo({
                          id: comment.id,
                          username: comment.profiles?.username || 'Poker Player',
                        });
                        setCommentText(`@${comment.profiles?.username || 'Poker Player'} `);
                      }}
                    >
                      Reply
                    </button>
                    {ownComment ? (
                      <>
                        {editingComment === comment.id ? (
                          <button
                            type="button"
                            className={styles.inlineAction}
                            onClick={() => handleSaveEdit(comment.id)}
                          >
                            Save Edit
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.inlineAction}
                            onClick={() => handleEditComment(comment)}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.inlineAction}
                          onClick={() => handleDeleteComment(comment.id)}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className={styles.composer}>
          {replyTo ? (
            <p className={styles.dialogCopy}>
              Replying To @{replyTo.username}
              <button
                type="button"
                className={styles.inlineAction}
                onClick={() => {
                  setReplyTo(null);
                  setCommentText('');
                }}
              >
                Cancel Reply
              </button>
            </p>
          ) : null}
          {reelCommentMediaUrl ? (
            <div>
              <img
                className={styles.previewMedia}
                src={reelCommentMediaUrl}
                alt="Selected Comment Media"
              />
              <button
                type="button"
                className={styles.inlineAction}
                onClick={() => {
                  setReelCommentMediaUrl(null);
                  setReelCommentMediaType(null);
                }}
              >
                Remove Media
              </button>
            </div>
          ) : null}
          <input
            ref={commentInputRef}
            className={styles.field}
            type="text"
            placeholder="Add A Comment"
            value={commentText}
            maxLength={COMMENT_MAX_LENGTH}
            onChange={(event) => setCommentText(event.target.value.slice(0, COMMENT_MAX_LENGTH))}
            onKeyDown={handleSubmitComment}
            onPaste={(event) => {
              const items = event.clipboardData?.items;
              if (!items) return;
              for (const item of items) {
                if (item.type.startsWith('image/')) {
                  event.preventDefault();
                  handleReelImageUpload(item.getAsFile());
                  return;
                }
              }
            }}
          />
          <p className={styles.counter}>
            {commentText.length} Of {COMMENT_MAX_LENGTH} Characters
          </p>
          <div className={styles.composerActions}>
            <button
              type="button"
              className={styles.wordAction}
              onClick={() => setShowReelGifPicker(true)}
            >
              Add GIF
            </button>
            <label className={styles.fileAction} htmlFor="reel-comment-image">
              {uploadingReelImage ? 'Uploading Image' : 'Add Image'}
            </label>
            <input
              id="reel-comment-image"
              className={styles.fileInput}
              ref={reelFileInputRef}
              type="file"
              accept="image/*"
              disabled={uploadingReelImage}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleReelImageUpload(file);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className={styles.wordAction}
              onClick={() => handleSubmitComment(null)}
              disabled={!commentText.trim() && !reelCommentMediaUrl}
            >
              Post Comment
            </button>
            <button type="button" className={styles.wordAction} onClick={() => closeDialog('comments')}>
              Done
            </button>
          </div>
        </div>
      </>
    );
  } else if (activeDialogKey === 'reactions') {
    dialogContent = (
      <div className={styles.choiceList}>
        {['Love', 'Approve', 'Funny', 'Tough Spot', 'Disagree'].map((label) => (
          <button
            type="button"
            className={styles.wordAction}
            key={label}
            onClick={() => {
              handleLike();
              setShowReactionPicker(false);
              haptic(10);
            }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={styles.wordActionDanger}
          onClick={() => {
            handleDislike();
            setShowReactionPicker(false);
          }}
        >
          Not For Me
        </button>
        <button type="button" className={styles.wordAction} onClick={() => closeDialog('reactions')}>
          Close Reactions
        </button>
      </div>
    );
  } else if (activeDialogKey === 'options') {
    dialogContent = (
      <div className={styles.choiceList}>
        {currentReel?.playback_type === 'native' && activeUserIdRef.current && currentReel.author_id === activeUserIdRef.current ? <button type="button" className={styles.wordAction} onClick={() => { setShowMoreMenu(false); captionUploadRef.current?.(); }}>Add Or Replace Spoken Captions</button> : null}
        <button type="button" className={styles.wordAction} onClick={toggleSound}>
          {muted ? 'Unmute Reel' : 'Mute Reel'}
        </button>
        <button type="button" className={styles.wordAction} onClick={handleSpeedToggle}>
          Playback Speed {speedPercent} Percent
        </button>
        <button type="button" className={styles.wordAction} onClick={copyCurrentLink}>
          Copy Reel Link
        </button>
        <button
          type="button"
          className={styles.wordAction}
          onClick={() => {
            setShowMoreMenu(false);
            setShowShortcutsOverlay(true);
          }}
        >
          Keyboard Help
        </button>
        <button type="button" className={styles.wordAction} onClick={() => { setShowMoreMenu(false); setShowReactionPicker(true); }}>Reactions</button>
        <ReelFeedbackActions buttonClassName={styles.wordActionDanger} onFeedback={handleRecommendationFeedback} />
        <button
          type="button"
          className={styles.wordActionDanger}
          onClick={() => {
            setShowMoreMenu(false);
            setShowReportModal(true);
          }}
        >
          Report Reel
        </button>
        <button type="button" className={styles.wordAction} onClick={() => closeDialog('options')}>
          Close Options
        </button>
      </div>
    );
  } else if (activeDialogKey === 'context') {
    dialogContent = (
      <div className={styles.choiceList}>
        <button
          type="button"
          className={styles.wordAction}
          onClick={() => {
            setShowContextMenu(false);
            handleSave();
          }}
        >
          {saved[currentReel?.id] ? 'Remove Save' : 'Save Reel'}
        </button>
        <button
          type="button"
          className={styles.wordAction}
          onClick={() => {
            setShowContextMenu(false);
            handleShare();
          }}
        >
          Share Reel
        </button>
        <button
          type="button"
          className={styles.wordActionDanger}
          onClick={() => {
            setShowContextMenu(false);
            setShowReportModal(true);
          }}
        >
          Report Reel
        </button>
        <button type="button" className={styles.wordAction} onClick={() => closeDialog('context')}>
          Close Commands
        </button>
      </div>
    );
  } else if (activeDialogKey === 'share') {
    dialogContent = (
      <div className={styles.shareGrid}>
        {currentUserId ? (
          <button
            type="button"
            className={styles.wordAction}
            onClick={openShareDescriptionModal}
            disabled={sharingToFeed}
          >
            Share To My Feed
          </button>
        ) : null}
        <button type="button" className={styles.wordAction} onClick={() => handleShareAction('copy')}>
          Copy Link
        </button>
        <button type="button" className={styles.wordAction} onClick={() => handleShareAction('x')}>
          Share To X
        </button>
        <button type="button" className={styles.wordAction} onClick={() => handleShareAction('facebook')}>
          Share To Facebook
        </button>
        <button type="button" className={styles.wordAction} onClick={() => handleShareAction('whatsapp')}>
          Share To WhatsApp
        </button>
        {typeof navigator !== 'undefined' && navigator.share ? (
          <button type="button" className={styles.wordAction} onClick={() => handleShareAction('native')}>
            More Sharing Options
          </button>
        ) : null}
        <button type="button" className={styles.wordAction} onClick={() => closeDialog('share')}>
          Close Sharing
        </button>
      </div>
    );
  } else if (activeDialogKey === 'share-description') {
    dialogContent = (
      <>
        {currentCaption ? <p className={styles.dialogCopy}>{currentCaption}</p> : null}
        <textarea
          className={styles.textArea}
          value={shareDescription}
          onChange={(event) => setShareDescription(event.target.value.slice(0, 500))}
          placeholder="Add Your Thoughts"
          data-autofocus="true"
        />
        <p className={styles.counter}>{shareDescription.length} Of 500 Characters</p>
        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.wordAction}
            onClick={() => handleShareToFeed()}
            disabled={sharingToFeed}
          >
            {sharingToFeed ? 'Posting To Feed' : 'Post To My Feed'}
          </button>
          <button
            type="button"
            className={styles.wordAction}
            onClick={() => handleShareToFeed('')}
            disabled={sharingToFeed}
          >
            Share Without Description
          </button>
          <button
            type="button"
            className={styles.wordAction}
            onClick={() => closeDialog('share-description')}
          >
            Close Sharing
          </button>
        </div>
      </>
    );
  } else if (activeDialogKey === 'report') {
    dialogContent = reportSubmitted ? (
      <>
        <ConsoleCopy align="center" role="status">Report Submitted. Thank You.</ConsoleCopy>
        <button type="button" className={styles.wordAction} onClick={() => closeDialog('report')}>
          Close Report
        </button>
      </>
    ) : (
      <>
        <ConsoleCopy align="center">Why Are You Reporting This Content?</ConsoleCopy>
        <div className={styles.choiceList}>
          {[
            'Inappropriate Content',
            'Copyright Or Rights',
            'Incorrect Attribution',
            'Unlabeled Promotion',
            'Unlabeled Generated Media',
            'Underage Or Safety',
            'Gambling Harm',
            'Playback Unavailable',
            'Spam Or Scam',
            'Harassment',
            'Misinformation',
            'Other',
          ].map((reason) => (
            <button
              type="button"
              className={styles.wordAction}
              aria-pressed={reportReason === reason}
              key={reason}
              onClick={() => setReportReason(reason)}
            >
              {reportReason === reason ? `Selected ${reason}` : reason}
            </button>
          ))}
        </div>
        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.wordActionDanger}
            onClick={handleReport}
            disabled={!reportReason}
          >
            Submit Report
          </button>
          <button type="button" className={styles.wordAction} onClick={() => closeDialog('report')}>
            Close Report
          </button>
        </div>
      </>
    );
  } else if (activeDialogKey === 'shortcuts') {
    dialogContent = (
      <>
        <div className={styles.shortcutList}>
          {[
            ['Arrow Keys', 'Previous Or Next Reel'],
            ['Space', 'Play Or Pause'],
            ['L', 'Like Reel'],
            ['S', 'Save Reel'],
            ['C', 'Open Comments'],
            ['M', 'Mute Or Unmute'],
            ['Escape', 'Close Viewer'],
            ['Question Mark', 'Toggle Keyboard Help'],
          ].map(([key, description]) => (
            <div className={styles.shortcut} key={key}>
              <strong>{key}</strong>
              <span>{description}</span>
            </div>
          ))}
        </div>
        <button type="button" className={styles.wordAction} onClick={() => closeDialog('shortcuts')}>
          Close Help
        </button>
      </>
    );
  }

  return (
    <main className={`${styles.shell} ${immersiveStyles.root}`} data-reels-experience="immersive" aria-label={`Embedded ${topicLabel} Reels Viewer`}>
      <section className={styles.console} data-reels-console aria-label={`Embedded ${topicLabel} Reels Viewer`}>
        <header data-reels-topbar>
          <button type="button" onClick={onClose} aria-label="Close"><ReelIcon name="back" /></button>
          <ReelCaptionControl native={currentReel?.playback_type === 'native'} reel={currentReel} ownerId={activeUserIdRef.current || null} getAccessToken={getAccessToken} uploadCommandRef={captionUploadRef} videoRef={videoRef} requested={enhancements.captionRequested} onToggle={enhancements.toggleCaptions} state={{...enhancements.captionState, videoId: currentReel?.id}} />
          <h1 className="sp-reels-top-title">Reels</h1>
          <button type="button" onClick={toggleSound} aria-label={muted ? 'Unmute' : 'Mute'}><ReelIcon name={muted ? 'muted' : 'sound'} /></button>
        </header>
        <nav data-reels-navigation aria-label="Reel Navigation">
          <button type="button" onClick={goPrev} disabled={currentIndex === 0} aria-label="Previous Reel"><ReelIcon name="up" /></button>
          <button type="button" onClick={goNext} disabled={currentIndex >= reels.length - 1} aria-label="Next Reel"><ReelIcon name="down" /></button>
        </nav>
        <div className={styles.liveArea}>
          <div data-reels-layout className={styles.liveGrid} aria-hidden={activeDialogKey ? 'true' : undefined}>
            <div
              ref={containerRef}
              className={styles.viewport}
              data-reels-stage
              data-reels-scroll-stage
              onTouchStart={handleLongPressTouchStart}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}
              onMouseDown={handleLongPressTouchStart}
              onMouseUp={cancelLongPress}
              onMouseMove={cancelLongPress}
              onContextMenu={(event) => {
                event.preventDefault();
                setShowContextMenu(true);
              }}
            >
              {[currentIndex - 1, currentIndex, currentIndex + 1].map((index) => {
                if (index < 0 || index >= reels.length) return null;
                const reel = reels[index];
                if (!reel) return null;
                const isActive = index === currentIndex;
                const videoId = getYouTubeVideoId(reel.video_url);

                return (
                  <ReelPlayerFrame
                    as="section"
                    active={isActive}
                    reelId={reel.id}
                    dataSaver={prefersDataSaver}
                    key={reel.id}
                    className={styles.slide}
                    data-reel-index={index}
                    aria-label={`Reel ${index + 1} Of ${reels.length}`}
                    onClick={undefined}
                  >
                    {reel.thumbnail_url ? (
                      <img
                        className={styles.poster}
                        src={reel.thumbnail_url}
                        alt=""
                        aria-hidden="true"
                      />
                    ) : null}

                    {isActive && videoId ? (
                      <ReelYouTubePlayer videoId={videoId} iframeRef={ytIframeRef} eventRef={enhancedYouTubeEventRef} captionsRequested={enhancements.captionRequested} onCaptionsStateChange={enhancements.onCaptionsStateChange}
                      commandRef={youtubeCommandRef} playbackScopeKey={activeUserIdRef.current || 'public'}
                        muted={!(userGesturedThisLoadRef.current && userWantsSoundRef.current)} onMutedChange={setMuted}
                        title={reel.caption || `${reelTopicLabel(reel)} Reel`} />
                    ) : isActive && reel.video_url ? (
                      <video
                        crossOrigin="anonymous"
                        ref={videoRef}
                        className={styles.media}
                        key={reel.id}
                        src={reel.video_url}
                        poster={reel.thumbnail_url || undefined}
                        preload={nativeDeliveryPolicy({ dataSaver: prefersDataSaver, connection: typeof navigator !== 'undefined' ? navigator.connection : null }).preload}
                        playsInline
                        loop
                        muted={muted}
                        onCanPlay={(event) => {
                          if (!isActive) return;
                          event.currentTarget.muted = muted;
                          event.currentTarget.play().catch(() => {});
                        }}
                        onPlaying={(event) => {
                          if (!isActive) return;
                          if (videoStallTimerRef.current) {
                            clearTimeout(videoStallTimerRef.current);
                            videoStallTimerRef.current = null;
                          }
                          if (userInteractedRef.current && userWantsSoundRef.current) {
                            try {
                              event.currentTarget.muted = false;
                              if (!event.currentTarget.muted) {
                                if (event.currentTarget.volume === 0) event.currentTarget.volume = 1;
                                setMuted(false);
                              }
                            } catch (_) {}
                          }
                        }}
                        onLoadedMetadata={() => {
                          if (isActive && videoStallTimerRef.current) {
                            clearTimeout(videoStallTimerRef.current);
                            videoStallTimerRef.current = null;
                          }
                        }}
                        onError={(event) => {
                          const error = event.currentTarget?.error;
                          console.warn('[ReelsViewer] Video Decode Failed', {
                            code: error?.code,
                            message: error?.message,
                            src: reel.video_url,
                          });
                          if (typeof window !== 'undefined') {
                            window.__reelDecodeError = (window.__reelDecodeError || 0) + 1;
                          }
                          brokenUrlsRef.current.add(reel.video_url);
                          if (isActive && videoStallTimerRef.current) {
                            clearTimeout(videoStallTimerRef.current);
                            videoStallTimerRef.current = null;
                          }
                          if (isActive) goNext();
                        }}
                        onPlay={() => {
                          if (!isActive) return;
                          setPaused(false);
                          setYtReady(true);
                          progressRAF.current = requestAnimationFrame(updateProgressRef.current);
                        }}
                        onPause={() => {
                          if (!isActive) return;
                          setPaused(true);
                          if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
                        }}
                        onEnded={() => {
                          if (!isActive) return;
                          if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
                          setProgress(0);
                        }}
                      />
                    ) : null}

                    {isActive ? <div data-reels-tap onClick={handleTap} style={{ position: 'absolute', inset: 0, zIndex: 5, touchAction: 'pan-y' }} /> : null}
                    {isActive && !reel.video_url ? (
                      <div className={styles.stageSignal}>Video Unavailable</div>
                    ) : null}
                    {isActive && ytError ? (
                      <YouTubeErrorOverlay
                        errorCode={ytError}
                        videoId={videoId}
                        videoUrl={reel.video_url}
                        thumbnailUrl={reel.thumbnail_url || undefined}
                        actionLabel="Advancing Automatically"
                      />
                    ) : null}
                    {isActive && paused && ytReady && !ytError ? (
                      <div className={styles.stageSignal}><ReelIcon name="play" filled /></div>
                    ) : null}
                    {isActive ? <ReelProgress value={progress} isYouTube={Boolean(videoId)} videoRef={videoRef} commandRef={youtubeCommandRef} /> : null}
                  </ReelPlayerFrame>
                );
              })}
            </div>

            <aside className={styles.commandPanel} data-reels-copy aria-label="Reel Commands">
              {currentReel?.profiles?.username ? (
                <Link
                  href={`/hub/user/${currentReel.profiles.username}`}
                  className={`${styles.authorLink} ${
                    showAuthorAvatar ? '' : styles.authorTextOnly
                  }`}
                >
                  {authorIdentity}
                </Link>
              ) : sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${styles.authorLink} ${styles.authorTextOnly}`}
                >
                  {authorIdentity}
                </a>
              ) : (
                <Link href="/hub/reels?category=for-you" className={`${styles.authorLink} ${styles.authorTextOnly}`}>
                  {authorIdentity}
                </Link>
              )}

              {currentCaption ? (
                <p className={styles.caption}>
                  {visibleCaption}
                  {currentCaption.length > 140 ? (
                    <button
                      type="button"
                      className={styles.captionAction}
                      onClick={() => setCaptionExpanded((value) => !value)}
                    >
                      {captionExpanded ? 'Show Less' : 'Show More'}
                    </button>
                  ) : null}
                </p>
              ) : null}

              {sourceUrl ? (
                <a
                  className={styles.wordAction}
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Original On {authorName}
                </a>
              ) : null}

              <ReelResponsibleGamingNotice topic={currentReel?.topic} />
              <ReelTrustStrip reel={currentReel} compact immersive />

                {authorId && currentUserId && authorId !== currentUserId ? (
                  <button type="button" className={styles.wordAction} onClick={handleFollow}>
                    {following[authorId] ? 'Unfollow Creator' : 'Follow Creator'}
                  </button>
                ) : null}
              <div className={styles.actionGrid} data-reels-actions>
                <button
                  type="button"
                  className={styles.wordAction}
                  aria-label={liked[currentReel?.id] ? 'Unlike' : 'Like'}
                  aria-pressed={Boolean(liked[currentReel?.id])}
                  onClick={handleLike}
                  onPointerDown={() => {
                    reactionTimerRef.current = setTimeout(() => {
                      haptic(20);
                      setShowReactionPicker(true);
                    }, 500);
                  }}
                  onPointerUp={() => clearTimeout(reactionTimerRef.current)}
                  onPointerLeave={() => clearTimeout(reactionTimerRef.current)}
                >
                  <ReelActionVisual icon="heart" filled={Boolean(liked[currentReel?.id])} count={likeCounts[currentReel?.id] || 0} />
                </button>
                <button type="button" className={styles.wordAction} onClick={handleOpenComments} aria-label="Comments">
                  <ReelActionVisual icon="comment" count={commentCounts[currentReel?.id] || 0} />
                </button>
                <button type="button" className={styles.wordAction} onClick={handleShare} aria-label="Share">
                  <ReelActionVisual icon="share" count={currentReel?.share_count || 0} />
                </button>
                <button type="button" className={styles.wordAction} data-reel-action="save" onClick={handleSave} aria-label={saved[currentReel?.id] ? 'Unsave' : 'Save'} aria-pressed={Boolean(saved[currentReel?.id])}>
                  <ReelActionVisual icon="bookmark" filled={Boolean(saved[currentReel?.id])} />
                </button>

                <button
                  type="button"
                  className={styles.wordAction}
                  aria-label="More Options"
                  onClick={() => setShowMoreMenu(true)}
                >
                  <ReelActionVisual icon="more" />
                </button>
              </div>
            </aside>
          </div>

          <div className={styles.statusStack} data-reels-status aria-live="polite" aria-atomic="true">
            {showHeart ? <p className={styles.status}>Reel Liked</p> : null}
            {shareToast || copyToast ? <p className={styles.status}>Link Copied</p> : null}
            {sharedToFeed ? <p className={styles.status}>Shared To My Feed</p> : null}
            {errorToast ? (
              <p className={`${styles.status} ${styles.errorStatus}`}>
                {formatConsoleMessage(errorToast)}
              </p>
            ) : null}
            {loadingMore ? <p className={styles.status}>Finding Reels</p> : null}
          </div>

          {hasMore && reelsCursorRef.current && currentIndex >= reels.length - 2 ? (
            <button
              type="button"
              className={styles.wordAction}
              onClick={() => void loadMoreReels()}
              disabled={loadingMore}
            >
              {loadingMore
                ? 'Finding Reels'
                : continuationPaused
                  ? 'Continue Finding Reels'
                  : 'Load More Reels'}
            </button>
          ) : null}
        </div>
      </section>
      {activeDialogKey ? (
        <div className={immersiveStyles.sheetBackdrop} onClick={() => closeDialog(activeDialogKey)}>
          <div
            ref={dialogRef}
            className={immersiveStyles.sheet}
            data-reels-sheet={activeDialogKey === 'comments' ? 'comments' : undefined}
            role="dialog"
            aria-modal="true"
            aria-labelledby="embedded-reel-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sp-reels-sheet-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id="embedded-reel-dialog-title">{dialogTitles[activeDialogKey]}</h2>
              <button type="button" aria-label="Close panel" onClick={() => closeDialog(activeDialogKey)}><ReelIcon name="close" /></button>
            </div>
            {dialogContent}
          </div>
        </div>
      ) : null}
    </main>
  );
}

export function ReelsButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} className={styles.wordAction} aria-label="Open Reels">
      Reels
    </button>
  );
}
