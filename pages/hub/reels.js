/**
 * REELS PAGE - TikTok-style Full-Screen Vertical Video Experience
 * Swipe up/down to navigate, tap to mute/unmute
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  YouTubeErrorOverlay,
  reportFailureToServer,
  reportToSentry,
} from '../../src/hooks/useYouTubeErrorManager';
import Head from 'next/head';
import SEOHead from '../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import Link from 'next/link';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { reelsPreferences, savedReelsService } from '../../src/services/preferences-service';
import { getAuthUser } from '../../src/lib/authUtils';
import UploadReelModal from '../../src/components/reels/UploadReelModal';
import { saveAppSetting } from '../../src/lib/appSettingsSync';
import { busEmit, eventBus, EventType } from '../../src/engine/EventBus';
import GiphyPicker from '../../src/components/shared/GiphyPicker';
import { getAccessToken } from '../../src/lib/authUtils';
import {
  findBestGames,
  buildSandboxUrl,
  extractCardsFromContext,
} from '../../src/utils/videoToTrainingMapper';

const C = {
  bg: '#000000',
  text: '#FFFFFF',
  textSec: 'rgba(255,255,255,0.7)',
};

function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d ago`;
}

function getYouTubeVideoId(url) {
  if (!url) return null;
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

export default function ReelsPage() {
  const [reels, setReels] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [muted, setMuted] = useState(true); // Start MUTED — required for mobile autoplay (mute=1 in URL)
  const [userWantsSound, setUserWantsSound] = useState(true); // User preference — auto-unmute after YT confirms playing
  // Auto-play immediately - videos start muted per browser policy, unmute after onStateChange confirms playing
  const [liked, setLiked] = useState({});
  const [disliked, setDisliked] = useState({});
  const [likeCounts, setLikeCounts] = useState({});
  const [shareToast, setShareToast] = useState(false);
  const [showCommentPanel, setShowCommentPanel] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentCounts, setCommentCounts] = useState({});
  const [following, setFollowing] = useState({});
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  // GIF/Image comment state
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [commentMediaUrl, setCommentMediaUrl] = useState(null);
  const [commentMediaType, setCommentMediaType] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const commentFileInputRef = useRef(null);
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const videoRef = useRef(null);
  const [isPaused, setIsPaused] = useState(true); // Start true — autoplay may fail, first tap should always send playVideo
  const isPausedRef = useRef(true); // Sync ref for stale-closure-safe keyboard handler (matches initial isPaused=true)
  isPausedRef.current = isPaused; // Keep in sync on every render
  const userWantsSoundRef = useRef(true); // Sync ref for stale-closure-safe YT message handler
  userWantsSoundRef.current = userWantsSound; // Keep in sync on every render
  // Session-sticky gesture flag: persisted to sessionStorage so it survives
  // re-renders, slot transitions, and client-side route changes within the
  // same tab. Once any user gesture is captured anywhere, every subsequent
  // video can unmute on its onPlaying / onStateChange(1) event without an
  // extra click. Mirrors the matching pattern in
  // src/components/social/Reels.jsx and src/components/social/ReelsFeedCarousel.jsx.
  const userInteractedRef = useRef(
    typeof window !== 'undefined' && window.sessionStorage?.getItem('sp:reels:interacted') === '1'
  );
  // Stricter than userInteractedRef: only true when a gesture happened on
  // THIS page load. Browsers gate autoplay-with-sound per-document; the
  // sessionStorage-backed userInteractedRef can be true on reload without
  // any fresh gesture. YT iframe unMute postMessage is silently rejected
  // in that state. Use this ref for slot-transition setMuted(false) gates
  // so React state never lies about being unmuted while YT is muted.
  const userGesturedThisLoadRef = useRef(false);
  const [ytReady, setYtReady] = useState(false); // True once YouTube fires first onStateChange — suppresses phantom play button during autoplay startup
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const swipeStartRef = useRef(null); // { y, x, t } for inline touch overlay
  const swipeDeltaRef = useRef(0); // accumulated vertical delta during swipe
  const lastTapRef = useRef(0);
  const likeDebounceRef = useRef(false);
  const slideDebounceRef = useRef(false);
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [savedReels, setSavedReels] = useState(new Set());
  const [showHeart, setShowHeart] = useState(false);
  const [ttsOverlay, setTtsOverlay] = useState(null); // Train This Spot in-place overlay { ctx, games }
  // Age-restricted / errored YouTube video detection
  const [ytError, setYtError] = useState(null); // { code, videoId } when current reel has a YT error
  const [slideDirection, setSlideDirection] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewCounts, setViewCounts] = useState({});
  const [videoProgress, setVideoProgress] = useState(0);
  const viewedReelsRef = useRef(new Set());
  const autoUnmuteRetryTimersRef = useRef([]); // Cancelled on every reel change — prevents stale-iframe postMessage
  const playVideoOnLoadTimersRef = useRef([]); // Cancelled on every reel change — prevents premature playVideo to new iframe
  const [refreshing, setRefreshing] = useState(false);
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
  // #8 Share Options Modal
  const [showShareModal, setShowShareModal] = useState(false);
  // #7 Animated Like Counter
  const [likeBounceId, setLikeBounceId] = useState(null);
  // Keyboard Shortcuts Overlay
  const [showShortcutsOverlay, setShowShortcutsOverlay] = useState(false);
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
  const [showContextMenu, setShowContextMenu] = useState(false);
  const longPressTimerRef = useRef(null);
  // Phase 8 - Comment sort, char counter, copy link
  const [commentSort, setCommentSort] = useState('newest');
  const [copyToast, setCopyToast] = useState(false);
  const COMMENT_MAX_LENGTH = 280;
  // #10 Error Toast for failed operations
  const [errorToast, setErrorToast] = useState(null);
  // BUG FIX (R3): errorToastTimerRef — tracks the dismiss timer so it can be
  // cancelled on unmount instead of calling setErrorToast on an unmounted page.
  const errorToastTimerRef = useRef(null);
  const showErrorToast = (msg) => {
    setErrorToast(msg);
    clearTimeout(errorToastTimerRef.current);
    errorToastTimerRef.current = setTimeout(() => setErrorToast(null), 3000);
  };
  // #6 Comment Like Counts (per-comment)
  const [commentLikeCounts, setCommentLikeCounts] = useState({});
  // UX Overhaul - More menu + Reaction picker
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const reactionTimerRef = useRef(null);
  const shareToastTimerRef = useRef(null); // Prevents double-fire if share re-triggered within 2s
  const sharedToFeedTimerRef = useRef(null); // Prevents setState-after-unmount in handleShareToFeed
  const reportModalTimerRef = useRef(null); // Prevents setState-after-unmount in handleReport
  // BUG FIX (R-2): track likeBounce dismiss timer — prevents stale setState if user navigates
  // away during the 400ms bounce animation.
  const likeBounceTimerRef = useRef(null);
  // BUG FIX (R-4/R-5): track showHeart dismiss timer — 800ms setShowHeart(false) was bare at
  // every like call-site (button onClick + 2× reaction picker). All consolidated here.
  const showHeartTimerRef = useRef(null);
  // BUG FIX (R-6): track copyToast dismiss timer — prevents setState-after-unmount when
  // user copies link then immediately navigates away.
  const copyToastTimerRef = useRef(null);
  // BUG FIX: track slide animation timers to prevent setState-after-unmount
  const slideAnimationTimerRef = useRef(null);
  // Phase 10 - Universal HUD auto-hide (5s timeout for usability)
  const [showOverlay, setShowOverlay] = useState(false);
  const hudTimerRef = useRef(null);
  const revealOverlay = () => {
    setShowOverlay(true);
    setShowReactionPicker(false);
    setShowMoreMenu(false);
    clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      setShowOverlay(false);
      setShowReactionPicker(false);
      setShowMoreMenu(false);
    }, 5000);
  };
  const pullStartY = useRef(null);

  // Phase 9: Long Press Context Menu
  // Named distinctly to avoid collision with the swipe useEffect's local handleTouchStart
  const handleLongPressTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      try {
        navigator?.vibrate?.(20);
      } catch (err) {
        console.warn('[ReelsPage] vibrate failed:', err);
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
      const saved = localStorage.getItem('smarter-reels-watched');
      if (saved) {
        try {
          setWatchedReelIds(JSON.parse(saved));
        } catch (e) {
          console.warn('[App] Handled exception:', e);
        }
      }
    }
  }, []);

  // Reels preferences state
  const [preferences, setPreferences] = useState({
    autoplay: true,
    soundOnScroll: true,
    dataSaver: false,
    showCaptions: true,
  });

  // Sound is ALWAYS on by default — user requirement: never muted on load.
  // Users can manually mute during a session, but next visit starts fresh with sound on.

  // Load user and preferences
  useEffect(() => {
    const loadUserData = async () => {
      const authUser = getAuthUser();
      setUser(authUser);

      if (authUser) {
        // Load preferences
        const prefs = await reelsPreferences.get(authUser.id);
        setPreferences(prefs);

        // Load saved reels
        const saved = await savedReelsService.getSavedReels(authUser.id);
        const savedIds = new Set(saved.map((item) => item.reel_id));
        setSavedReels(savedIds);

        // Pre-fetch existing likes (filter by reaction_type='like')
        const { data: likeData } = await supabase
          .from('social_likes')
          .select('post_id')
          .eq('user_id', authUser.id)
          .eq('reaction_type', 'like');
        if (likeData) {
          const likeMap = {};
          likeData.forEach((l) => {
            likeMap[l.post_id] = true;
          });
          setLiked(likeMap);
        }

        // Pre-fetch existing dislikes
        const { data: dislikeData } = await supabase
          .from('social_likes')
          .select('post_id')
          .eq('user_id', authUser.id)
          .eq('reaction_type', 'dislike');
        if (dislikeData) {
          const dislikeMap = {};
          dislikeData.forEach((d) => {
            dislikeMap[d.post_id] = true;
          });
          setDisliked(dislikeMap);
        }

        // Pre-fetch follows
        const { data: followData } = await supabase
          .from('social_follows')
          .select('following_id')
          .eq('follower_id', authUser.id);
        if (followData) {
          const followMap = {};
          followData.forEach((f) => {
            followMap[f.following_id] = true;
          });
          setFollowing(followMap);
        }
      }
    };
    loadUserData();
  }, []);

  // YouTube API: Send command to iframe via postMessage
  // The 'listening' handshake initializes the command bridge
  const sendYouTubeCommand = (command, args = []) => {
    if (iframeRef.current?.contentWindow) {
      // Ensure the API bridge is active
      iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func: command,
          args: args,
        }),
        '*'
      );
    }
  };

  // Auto-play retry on every reel change — send playVideo commands
  // CRITICAL: Do NOT send unMute here. On mobile Safari, unmuting before playback
  // starts causes autoplay to fail (violates browser policy). Unmuting happens
  // in the onStateChange(1) handler AFTER YouTube confirms playing.
  useEffect(() => {
    if (!loading && reels.length > 0) {
      const delays = [300, 800, 1500, 3000];
      const timers = delays.map((delay) =>
        setTimeout(() => {
          sendYouTubeCommand('playVideo');
        }, delay)
      );
      return () => timers.forEach((t) => clearTimeout(t));
    }
  }, [currentIndex, loading, reels.length]);

  const handleUnmute = () => {
    sendYouTubeCommand('unMute');
    sendYouTubeCommand('setVolume', [100]);
    setMuted(false);
    setUserWantsSound(true);
    // Save preference to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('reels-sound-enabled', 'true');
      saveAppSetting('reels_sound_enabled', true, 'reels-sound-enabled');
    }
  };

  const handleMute = () => {
    sendYouTubeCommand('mute');
    setMuted(true);
    setUserWantsSound(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('reels-sound-enabled', 'false');
      saveAppSetting('reels_sound_enabled', false, 'reels-sound-enabled');
    }
  };

  // Auto-unmute helper — fires on swipe and on onStateChange(1).
  // Gated on userInteractedRef.current so the unMute postMessage isn't wasted
  // before any gesture has been captured (browsers ignore unMute without a
  // gesture context). After the first gesture, this fires unconditionally
  // for every slot transition.
  const autoUnmute = () => {
    if (!userWantsSoundRef.current) return;
    if (!userInteractedRef.current) return;
    sendYouTubeCommand('unMute');
    sendYouTubeCommand('setVolume', [100]);
    // Only flip React state if a gesture happened on THIS page load.
    // YT iframe is cross-origin so we cannot verify unMute landed; on
    // reload-with-sessionStorage YT silently rejects unMute and React
    // state would lie about being unmuted.
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

  // ─── Global gesture capture for autoplay-with-sound ─────────────────────
  // First user gesture (pointerdown/keydown/wheel/touchstart anywhere on the
  // page) marks userInteractedRef true and persists '1' to sessionStorage,
  // then synchronously unmutes the currently active video and YouTube
  // iframe so the user gets sound on the very first video without an extra
  // tap. The flag stays sticky for the whole tab session, so subsequent
  // swipes inherit it.
  useEffect(() => {
    // No early-return on userInteractedRef — on reload with sessionStorage='1'
    // we still need to listen so the FIRST gesture this page load flips
    // userGesturedThisLoadRef and unblocks slot-transition setMuted(false).
    const onGesture = () => {
      // Always flip per-load ref — every gesture refreshes the gate.
      userGesturedThisLoadRef.current = true;
      // Sticky tab-session flag (idempotent after first set).
      if (!userInteractedRef.current) {
        userInteractedRef.current = true;
        try {
          window.sessionStorage?.setItem('sp:reels:interacted', '1');
        } catch (_) {}
      }
      if (userWantsSoundRef.current) {
        try {
          if (videoRef.current) {
            videoRef.current.muted = false;
            if (videoRef.current.volume === 0) videoRef.current.volume = 1.0;
          }
          sendYouTubeCommand('unMute');
          sendYouTubeCommand('setVolume', [100]);
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

  // Wait for router.isReady so router.query.id is populated before loadReels runs.
  // Without this, ?id= deep-links arrive as undefined on first render and the
  // direct-query fallback inside loadReels never fires.
  useEffect(() => {
    if (!router.isReady) return;
    loadReels();
    // Lock body scroll so swipe gestures don't scroll the page behind the reels container.
    // Use CLASS-based lock (not inline styles) so the CSS desktop failsafe in index.css
    // can distinguish reels-locked state from stale style leaks on other pages.
    document.body.classList.add('reels-lock');
    document.documentElement.classList.add('reels-lock');
    return () => {
      // Always remove the class — never leaves stale state
      document.body.classList.remove('reels-lock');
      document.documentElement.classList.remove('reels-lock');
      // Also clear any legacy inline styles that may have been set before this change
      // when multiple components compete for body scroll state)
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.touchAction = '';
      document.documentElement.style.overflow = '';
      // Cancel pending UI timers to avoid setState-after-unmount on navigation
      clearTimeout(shareToastTimerRef.current);
      clearTimeout(sharedToFeedTimerRef.current);
      clearTimeout(reportModalTimerRef.current);
      // BUG FIX (R4): also cancel hudTimerRef, errorToastTimerRef, longPressTimerRef,
      // reactionTimerRef — all were missing from unmount, could fire after navigation.
      clearTimeout(hudTimerRef.current);
      clearTimeout(errorToastTimerRef.current);
      clearTimeout(longPressTimerRef.current);
      clearTimeout(reactionTimerRef.current);
      // BUG FIX (R-2/R-4/R-6): cancel the new tracked timers on unmount
      clearTimeout(likeBounceTimerRef.current);
      clearTimeout(showHeartTimerRef.current);
      clearTimeout(copyToastTimerRef.current);
      clearTimeout(slideAnimationTimerRef.current);
      // BUG FIX: cancel iframe retry timers on unmount
      autoUnmuteRetryTimersRef.current.forEach((t) => clearTimeout(t));
      autoUnmuteRetryTimersRef.current = [];
      playVideoOnLoadTimersRef.current.forEach((t) => clearTimeout(t));
      playVideoOnLoadTimersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const loadReels = useCallback(async () => {
    setLoading(true);
    try {
      const initialId = router.query.id;

      // BUG FIX: single limit-50 query let video_library (newest timestamps) monopolize feed.
      // Fix: 3 parallel per-source queries, interleaved 2:1 (user:library) so both always appear.
      // M7.1 (2026-05-03): retired the social_posts query. Every public
      // video post has a social_reels mirror via the
      // trg_social_posts_video_to_reel_mirror trigger, so a separate
      // social_posts query produced duplicates that the dedup filter
      // dropped (pure waste). Horse-posted reels surface via the
      // horseResult slot below — same pattern as src/components/social/Reels.jsx.
      // 2026-05-06: added thumbnail_url so the initial feed shows the
      // worker-extracted poster image immediately (was missing here while
      // the load-more REEL_SELECT below already had it — caused a
      // brief black flash on first paint for newly-converted reels).
      const REEL_SELECT =
        'id, author_id, caption, video_url, thumbnail_url, view_count, like_count, comment_count, created_at, is_public, source_type';
      const [userResult, libraryResult, horseResult] = await Promise.all([
        supabase
          .from('social_reels')
          .select(REEL_SELECT)
          .eq('is_public', true)
          .eq('source_type', 'user')
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('social_reels')
          .select(REEL_SELECT)
          .eq('is_public', true)
          .eq('source_type', 'video_library')
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('social_reels')
          .select(REEL_SELECT)
          .eq('is_public', true)
          .in('source_type', ['youtube', 'native'])
          .not('source_post_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(60),
      ]);

      const userReels = (userResult.data || []).map((r) => ({ ...r, source: 'reels' }));
      const libReels = (libraryResult.data || []).map((r) => ({ ...r, source: 'reels' }));
      const horseReels = (horseResult.data || []).map((r) => ({ ...r, source: 'reels' }));

      // Interleave 2:1 (user:library) + sprinkle horse-posted every 10
      const allVideos = [];
      let uIdx = 0,
        lIdx = 0,
        hIdx = 0;
      for (
        let i = 0;
        i < Math.max(userReels.length, libReels.length, horseReels.length) * 3 &&
        allVideos.length < 120;
        i++
      ) {
        const slot = i % 3;
        if (slot === 0 || slot === 1) {
          if (uIdx < userReels.length) allVideos.push(userReels[uIdx++]);
          else if (lIdx < libReels.length) allVideos.push(libReels[lIdx++]);
        } else {
          if (lIdx < libReels.length) allVideos.push(libReels[lIdx++]);
          else if (uIdx < userReels.length) allVideos.push(userReels[uIdx++]);
        }
        // Splice a horse reel every 10 items
        if (allVideos.length > 0 && allVideos.length % 10 === 0 && hIdx < horseReels.length) {
          allVideos.push(horseReels[hIdx++]);
        }
      }
      while (uIdx < userReels.length) allVideos.push(userReels[uIdx++]);
      while (lIdx < libReels.length) allVideos.push(libReels[lIdx++]);
      while (hIdx < horseReels.length) allVideos.push(horseReels[hIdx++]);

      // Deduplicate by BOTH id and video_url.
      // The auto-mirror trigger can clone a social_post into social_reels with a
      // different row ID but the same physical video — id-only dedup lets it render twice.
      const seenIds = new Set();
      const seenUrls = new Set();
      const deduped = allVideos.filter((v) => {
        if (seenIds.has(v.id)) return false;
        if (v.video_url && seenUrls.has(v.video_url)) return false;
        seenIds.add(v.id);
        if (v.video_url) seenUrls.add(v.video_url);
        return true;
      });

      if (deduped.length > 0) {
        // Get all unique author IDs
        const authorIds = [...new Set(deduped.map((v) => v.author_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, full_name')
          .in('id', authorIds)
          .limit(200);

        const profileMap = {};
        (profiles || []).forEach((p) => {
          profileMap[p.id] = p;
        });

        // Map videos with profile data
        // CRITICAL: preserve the source flag so incrementMetric routes to the right table
        const mappedReels = deduped.map((video) => ({
          id: video.id,
          author_id: video.author_id,
          video_url: video.video_url,
          caption: video.caption,
          like_count: video.like_count,
          comment_count: video.comment_count,
          view_count: video.view_count || 0,
          created_at: video.created_at,
          source: video.source || 'reels', // MUST be preserved - drives DB table routing
          profiles: profileMap[video.author_id] || { username: 'Anonymous' },
        }));

        // #4 Not Interested - move disliked reels to end of feed
        // NOTE: no shuffle here - interleave order already provides diversity
        const fresh = mappedReels.filter((r) => !notInterestedIds.has(r.id));
        const stale = mappedReels.filter((r) => notInterestedIds.has(r.id));

        if (initialId) {
          const targetIdx = fresh.findIndex((r) => r.id === initialId);
          if (targetIdx > 0) {
            const target = fresh.splice(targetIdx, 1)[0];
            fresh.unshift(target);
          } else if (targetIdx === -1) {
            const staleIdx = stale.findIndex((r) => r.id === initialId);
            if (staleIdx !== -1) {
              const target = stale.splice(staleIdx, 1)[0];
              fresh.unshift(target);
            } else {
              // Video wasn't in the first 150 items. Query directly.
              let directReel = null;
              const { data: pData } = await supabase
                .from('social_posts')
                .select('id, author_id, content, media_urls, like_count, comment_count, created_at')
                .eq('id', initialId)
                .maybeSingle();
              if (pData) {
                directReel = {
                  id: pData.id,
                  author_id: pData.author_id,
                  video_url: pData.media_urls?.[0],
                  caption: pData.content,
                  like_count: pData.like_count || 0,
                  comment_count: pData.comment_count || 0,
                  view_count: 0,
                  created_at: pData.created_at,
                  source: 'posts',
                };
              } else {
                const { data: rData } = await supabase
                  .from('social_reels')
                  .select('*')
                  .eq('id', initialId)
                  .maybeSingle();
                if (rData) {
                  directReel = {
                    id: rData.id,
                    author_id: rData.author_id,
                    video_url: rData.video_url,
                    caption: rData.caption,
                    like_count: rData.like_count || 0,
                    comment_count: rData.comment_count || 0,
                    view_count: rData.view_count || 0,
                    created_at: rData.created_at,
                    source: 'reels',
                  };
                }
              }
              if (directReel) {
                let pMap = profileMap[directReel.author_id];
                if (!pMap) {
                  const { data: dProfile } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, full_name')
                    .eq('id', directReel.author_id)
                    .maybeSingle();
                  pMap = dProfile || { username: 'Anonymous' };
                }
                directReel.profiles = pMap;
                fresh.unshift(directReel);
              }
            }
          }
          setCurrentIndex(0);
        }

        const finalReels = [...fresh, ...stale];
        setReels(finalReels);

        // Initialize like/comment/view counts from the FINAL displayed array
        // (not shuffled - fresh/stale order may differ, and Not Interested IDs may be excluded)
        const lc = {},
          cc = {},
          vc = {};
        finalReels.forEach((r) => {
          lc[r.id] = r.like_count || 0;
          cc[r.id] = r.comment_count || 0;
          vc[r.id] = r.view_count || 0;
        });
        // AUDIT FIX: merge prev counts so optimistic like updates aren't
        // clobbered when a realtime insert triggers a loadReels() reload.
        setLikeCounts((prev) => ({ ...lc, ...prev }));
        setCommentCounts((prev) => ({ ...cc, ...prev }));
        setViewCounts((prev) => ({ ...vc, ...prev }));
      }
    } catch (e) {
      console.warn('Load reels error:', e);
      setLoadError(true);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notInterestedIds]);

  // Helper to atomically increment/decrement counts for reels OR posts
  // Uses SECURITY DEFINER RPCs - no race condition, no read-then-write
  const incrementMetric = async (reel, field, amount) => {
    if (!reel?.id) return;
    try {
      if (reel.source === 'posts') {
        // social_posts path - use post-specific RPC
        const rpc = amount > 0 ? 'increment_post_count' : 'decrement_post_count';
        const { error } = await supabase.rpc(rpc, { p_post_id: reel.id, p_field: field });
        if (error) throw error;
      } else {
        // social_reels path (native reels) - use reel-specific RPC
        const rpc = amount > 0 ? 'increment_reel_count' : 'decrement_reel_count';
        const { error } = await supabase.rpc(rpc, { p_reel_id: reel.id, p_field: field });
        if (error) throw error;
      }
    } catch (e) {
      console.warn('[Engagement] Atomic counter update failed:', e?.message || e);
    }
  };

  // Deep-link: if ?id= is in URL, scroll to that reel after load.
  // Fires when reels load OR when router.query.id becomes available.
  useEffect(() => {
    if (!router.query.id || reels.length === 0) return;
    const targetIdx = reels.findIndex((r) => r.id === router.query.id);
    if (targetIdx !== -1 && targetIdx !== currentIndex) {
      // Found in current batch - jump to it
      setCurrentIndex(targetIdx);
    } else if (targetIdx === -1) {
      // Not in loaded batch - direct-query for this specific reel and prepend
      (async () => {
        try {
          const { supabase } = await import('../../src/lib/supabase');
          let directReel = null;
          const { data: pData } = await supabase
            .from('social_posts')
            .select(
              'id, author_id, content, content_type, media_urls, like_count, comment_count, created_at'
            )
            .eq('id', router.query.id)
            .maybeSingle();
          if (pData && pData.media_urls?.length) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, username, avatar_url, full_name')
              .eq('id', pData.author_id)
              .maybeSingle();
            directReel = {
              id: pData.id,
              author_id: pData.author_id,
              source: 'posts',
              video_url: pData.media_urls[0],
              caption: pData.content,
              like_count: pData.like_count || 0,
              comment_count: pData.comment_count || 0,
              view_count: 0,
              created_at: pData.created_at,
              profiles: profile || { username: 'Player' },
            };
          } else {
            const { data: rData } = await supabase
              .from('social_reels')
              .select('*, profiles:author_id (id, username, avatar_url, full_name)')
              .eq('id', router.query.id)
              .maybeSingle();
            if (rData) directReel = { ...rData, source: 'reels' };
          }
          if (directReel) {
            setReels((prev) => [directReel, ...prev.filter((r) => r.id !== directReel.id)]);
            setCurrentIndex(0);
          }
        } catch (e) {
          console.warn('[Reels] Direct-query fallback failed:', e?.message);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reels.length, router.query.id]);

  const currentReel = reels[currentIndex];

  // Phase 9: Watched Indicator Timer
  useEffect(() => {
    if (!currentReel?.id) return;
    const watchTimer = setTimeout(() => {
      setWatchedReelIds((prev) => {
        if (prev.includes(currentReel.id)) return prev;
        const next = [...prev, currentReel.id].slice(-500); // Keep last 500
        localStorage.setItem('smarter-reels-watched', JSON.stringify(next));
        return next;
      });
    }, 3000); // 3 seconds = watched
    return () => clearTimeout(watchTimer);
  }, [currentReel?.id]);

  const goNext = () => {
    if (slideDebounceRef.current) return;
    if (currentIndex < reels.length - 1) {
      slideDebounceRef.current = true;
      setSlideDirection('up');
      if (slideAnimationTimerRef.current) clearTimeout(slideAnimationTimerRef.current);
      slideAnimationTimerRef.current = setTimeout(() => {
        slideAnimationTimerRef.current = null;
        setCurrentIndex((prev) => prev + 1);
        setSlideDirection(null);
        slideDebounceRef.current = false;
      }, 250);
    }
  };

  const goPrev = () => {
    if (slideDebounceRef.current) return;
    if (currentIndex > 0) {
      slideDebounceRef.current = true;
      setSlideDirection('down');
      if (slideAnimationTimerRef.current) clearTimeout(slideAnimationTimerRef.current);
      slideAnimationTimerRef.current = setTimeout(() => {
        slideAnimationTimerRef.current = null;
        setCurrentIndex((prev) => prev - 1);
        setSlideDirection(null);
        slideDebounceRef.current = false;
      }, 250);
    }
  };

  // Infinite scroll - load more when near end
  useEffect(() => {
    if (currentIndex >= reels.length - 3 && hasMore && !loadingMore && reels.length > 0) {
      loadMoreReels();
    }
  }, [currentIndex, reels.length, hasMore, loadingMore]);

  const loadMoreReels = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      // BUG FIX (Bug 19): initial load fetches 60 per source, so offset must use 60-row pages
      // to avoid overlap. Old code used 50-row pages causing 10-row overlap on page 2.
      // Also: missing source_type split - library reels could re-monopolize load-more batches.
      const offset = nextPage * 60;
      const allNewVideos = [];

      const REEL_SELECT =
        'id, author_id, caption, video_url, thumbnail_url, view_count, like_count, comment_count, created_at, is_public, source_type';

      // M7.1 (2026-05-03): retired the social_posts query — same reason
      // as loadReels above. Horse-posted reels surface via horseRes.
      const [userResult, libraryResult, horseRes] = await Promise.all([
        supabase
          .from('social_reels')
          .select(REEL_SELECT)
          .eq('is_public', true)
          .eq('source_type', 'user')
          .order('created_at', { ascending: false })
          .range(offset, offset + 29),
        supabase
          .from('social_reels')
          .select(REEL_SELECT)
          .eq('is_public', true)
          .eq('source_type', 'video_library')
          .order('created_at', { ascending: false })
          .range(offset, offset + 29),
        supabase
          .from('social_reels')
          .select(REEL_SELECT)
          .eq('is_public', true)
          .in('source_type', ['youtube', 'native'])
          .not('source_post_id', 'is', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + 19),
      ]);

      // Interleave 2:2:1 - user reels : library reels : horse reels
      const userReels = (userResult.data || []).map((r) => ({ ...r, source: 'reels' }));
      const libReels = (libraryResult.data || []).map((r) => ({ ...r, source: 'reels' }));
      const horseReelsMore = (horseRes.data || []).map((r) => ({ ...r, source: 'reels' }));

      // Interleave in 2:2:1 ratio
      const maxLen = Math.max(userReels.length, libReels.length, horseReelsMore.length);
      for (let i = 0; i < maxLen; i++) {
        if (userReels[i]) allNewVideos.push(userReels[i]);
        if (libReels[i]) allNewVideos.push(libReels[i]);
        if (i % 2 === 0 && horseReelsMore[Math.floor(i / 2)])
          allNewVideos.push(horseReelsMore[Math.floor(i / 2)]);
      }

      if (allNewVideos.length === 0) {
        setHasMore(false);
      } else {
        // AUDIT FIX: deduplicate by BOTH id AND video_url against already-loaded
        // reels. The auto-mirror trigger creates a social_reels row for every
        // social_post video — they share the same video_url with different IDs,
        // so id-only dedup allowed the same clip to reappear on every load-more page.
        const existingIds = new Set(reels.map((r) => r.id));
        const existingUrls = new Set(reels.map((r) => r.video_url).filter(Boolean));
        const seenUrlsThisBatch = new Set();
        const uniqueNew = allNewVideos.filter((v) => {
          if (existingIds.has(v.id)) return false;
          if (v.video_url && existingUrls.has(v.video_url)) return false;
          if (v.video_url && seenUrlsThisBatch.has(v.video_url)) return false;
          if (v.video_url) seenUrlsThisBatch.add(v.video_url);
          return true;
        });
        if (uniqueNew.length === 0) {
          setHasMore(false);
        } else {
          const authorIds = [...new Set(uniqueNew.map((v) => v.author_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, full_name')
            .in('id', authorIds);
          const pm = {};
          (profiles || []).forEach((p) => {
            pm[p.id] = p;
          });
          const mapped = uniqueNew.map((v) => ({
            id: v.id,
            author_id: v.author_id,
            video_url: v.video_url,
            caption: v.caption,
            like_count: v.like_count,
            comment_count: v.comment_count,
            view_count: v.view_count,
            created_at: v.created_at,
            source: v.source || 'reels', // preserve source for incrementMetric routing
            profiles: pm[v.author_id] || { username: 'Anonymous' },
          }));
          setReels((prev) => [...prev, ...mapped]);
          const lc = {},
            cc = {},
            vc = {};
          mapped.forEach((r) => {
            lc[r.id] = r.like_count || 0;
            cc[r.id] = r.comment_count || 0;
            vc[r.id] = r.view_count || 0;
          });
          setLikeCounts((prev) => ({ ...prev, ...lc }));
          setCommentCounts((prev) => ({ ...prev, ...cc }));
          setViewCounts((prev) => ({ ...prev, ...vc }));
          setPage(nextPage);
        }
      }
    } catch (e) {
      console.warn('Load more error:', e);
    }
    setLoadingMore(false);
  };

  // Haptic helper
  const haptic = (ms = 10) => {
    try {
      navigator?.vibrate?.(ms);
    } catch (e) {
      console.warn('[App] Handled exception:', e);
    }
  };

  // Track view count on reel change
  useEffect(() => {
    if (currentReel?.id) {
      setVideoProgress(0);
      setCaptionExpanded(false);
      setYtError(null); // Clear YouTube error state on reel change
      // Deduplicated view count - only fire once per reel per session (auth only)
      if (user?.id && !viewedReelsRef.current.has(currentReel.id)) {
        viewedReelsRef.current.add(currentReel.id);
        // Increment in DB AND update local state so UI reflects the view
        const reelId = currentReel.id;
        setViewCounts((prev) => ({
          ...prev,
          [reelId]: (prev[reelId] || currentReel.view_count || 0) + 1,
        }));
        incrementMetric(currentReel, 'view_count', 1);
      }
    }
  }, [currentReel?.id]);

  // Auto-advance past errored YouTube videos after 3 seconds (with cleanup)
  useEffect(() => {
    if (!ytError) return;
    const timer = setTimeout(() => slideToNextRef.current(), 3000);
    return () => clearTimeout(timer);
  }, [ytError]);

  const handleLike = async () => {
    if (!currentReel?.id || !user?.id) return;
    if (likeDebounceRef.current) return;
    likeDebounceRef.current = true;
    setTimeout(() => {
      likeDebounceRef.current = false;
    }, 300);

    const postId = currentReel.id;
    const wasLiked = liked[postId];
    setLiked((prev) => ({ ...prev, [postId]: !wasLiked }));
    setLikeCounts((prev) => ({
      ...prev,
      [postId]: Math.max(0, (prev[postId] || currentReel.like_count || 0) + (wasLiked ? -1 : 1)),
    }));
    // #7 Animated Like Counter - trigger bounce
    // BUG FIX (R-2): cancel previous bounce timer before starting a new one.
    // Rapid double-taps could accumulate N bare timeouts all firing setLikeBounceId(null),
    // and the last one would fire 400ms after unmount if the user navigated away.
    setLikeBounceId(postId);
    if (likeBounceTimerRef.current) clearTimeout(likeBounceTimerRef.current);
    likeBounceTimerRef.current = setTimeout(() => {
      likeBounceTimerRef.current = null;
      setLikeBounceId(null);
    }, 400);
    haptic(wasLiked ? 5 : 15);
    // Mutual exclusion: remove dislike when liking
    if (!wasLiked && disliked[postId]) {
      setDisliked((prev) => ({ ...prev, [postId]: false }));
      try {
        await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .eq('reaction_type', 'dislike');
      } catch (e) {
        console.warn('[App] Handled exception:', e);
      }
    }

    try {
      if (wasLiked) {
        // DB trigger (trig_sync_like_count) handles like_count decrement atomically - no RPC needed
        await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .eq('reaction_type', 'like');
        busEmit.socialPostLiked(postId, user.id, { added: false, reactionType: 'like' });
      } else {
        // DB trigger (trig_sync_like_count) handles like_count increment atomically - no RPC needed
        await supabase
          .from('social_likes')
          .insert({ post_id: postId, user_id: user.id, reaction_type: 'like' });
        busEmit.socialPostLiked(postId, user.id, { added: true, reactionType: 'like' });
      }
    } catch (err) {
      setLiked((prev) => ({ ...prev, [postId]: wasLiked }));
      setLikeCounts((prev) => ({
        ...prev,
        [postId]: Math.max(0, (prev[postId] || 0) + (wasLiked ? 1 : -1)),
      }));
      showErrorToast('Like failed \u2014 try again');
    }
  };

  const handleDislike = async () => {
    if (!currentReel?.id || !user?.id) return;
    if (likeDebounceRef.current) return;
    likeDebounceRef.current = true;
    setTimeout(() => {
      likeDebounceRef.current = false;
    }, 300);

    const postId = currentReel.id;
    const wasDisliked = disliked[postId];
    setDisliked((prev) => ({ ...prev, [postId]: !wasDisliked }));
    haptic(wasDisliked ? 5 : 10);
    // Mutual exclusion: remove like when disliking
    if (!wasDisliked && liked[postId]) {
      setLiked((prev) => ({ ...prev, [postId]: false }));
      setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) - 1) }));
      try {
        // DB trigger handles like_count decrement when like is removed - no RPC needed
        await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .eq('reaction_type', 'like');
      } catch (e) {
        console.warn('[App] Handled exception:', e);
      }
    }
    try {
      if (wasDisliked) {
        await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .eq('reaction_type', 'dislike');
        // #4 Not Interested - remove from filter
        setNotInterestedIds((prev) => {
          const n = new Set(prev);
          n.delete(postId);
          if (typeof window !== 'undefined')
            localStorage.setItem('reels-not-interested', JSON.stringify([...n]));
          return n;
        });
      } else {
        await supabase
          .from('social_likes')
          .insert({ post_id: postId, user_id: user.id, reaction_type: 'dislike' });
        // #4 Not Interested - add to filter
        setNotInterestedIds((prev) => {
          const n = new Set(prev);
          n.add(postId);
          if (typeof window !== 'undefined')
            localStorage.setItem('reels-not-interested', JSON.stringify([...n]));
          return n;
        });
      }
    } catch {
      setDisliked((prev) => ({ ...prev, [postId]: wasDisliked }));
    }
  };

  const handleFollow = async () => {
    const authorId = currentReel?.author_id || currentReel?.profiles?.id;
    if (!authorId || !user?.id || authorId === user.id) return;
    const wasFollowing = following[authorId];
    setFollowing((prev) => ({ ...prev, [authorId]: !wasFollowing }));
    haptic(wasFollowing ? 5 : 15);
    try {
      if (wasFollowing) {
        await supabase
          .from('social_follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', authorId);
      } else {
        await supabase.from('social_follows').insert({
          follower_id: user.id,
          following_id: authorId,
        });
      }
      busEmit.socialFollowChanged &&
        busEmit.socialFollowChanged(authorId, user.id, { added: !wasFollowing });
    } catch {
      setFollowing((prev) => ({ ...prev, [authorId]: wasFollowing }));
      showErrorToast('Follow failed \u2014 try again');
    }
  };

  const handleReport = async () => {
    if (!currentReel?.id || !user?.id || !reportReason.trim()) return;
    try {
      const { error } = await supabase.from('social_interactions').insert({
        user_id: user.id,
        post_id: currentReel.id,
        interaction_type: 'report',
        metadata: { reason: reportReason.trim() },
      });
      // AUDIT FIX: do NOT show success UI if the insert failed silently
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

  const handleCommentImageUpload = async (file) => {
    if (!file || !user?.id) return;
    setUploadingImage(true);
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
        setCommentMediaUrl(result.url);
        setCommentMediaType('image');
      }
    } catch (err) {
      console.warn('[ReelComment] Upload error:', err);
    }
    setUploadingImage(false);
  };

  // Upload error toast state
  const [uploadErrorToast, setUploadErrorToast] = useState(false);

  const handleComment = async () => {
    if (!currentReel) return;
    const wasOpen = showCommentPanel;
    setShowCommentPanel((prev) => !prev);
    // Always fetch fresh comments when opening (not closing)
    if (!wasOpen) {
      setCommentPage(0);
      try {
        const { data } = await supabase
          .from('social_comments')
          .select(
            'id, content, created_at, media_url, media_type, profiles:author_id(username, avatar_url)'
          )
          .eq('post_id', currentReel.id)
          .order('created_at', { ascending: commentSort === 'oldest' })
          .limit(50);
        setComments(data || []);
        setHasMoreComments((data || []).length >= 50);
        // #3 Don't overwrite server count when at page limit (could be 100+ comments)
        if ((data || []).length < 50) {
          setCommentCounts((prev) => ({ ...prev, [currentReel.id]: (data || []).length }));
        }
        // #6 Load comment like counts (totals) AND current user's own likes
        try {
          const [clAllResult, clMyResult] = await Promise.all([
            // Total likes per comment (all users)
            supabase
              .from('social_interactions')
              .select('metadata')
              .eq('post_id', currentReel.id)
              .eq('interaction_type', 'comment_like'),
            // BUG-R07 FIX: current user's own comment likes (for heart fill state)
            user?.id
              ? supabase
                  .from('social_interactions')
                  .select('metadata')
                  .eq('post_id', currentReel.id)
                  .eq('user_id', user.id)
                  .eq('interaction_type', 'comment_like')
              : Promise.resolve({ data: [] }),
          ]);
          const clCounts = {};
          (clAllResult.data || []).forEach((row) => {
            const cid = row.metadata?.comment_id;
            if (cid) clCounts[cid] = (clCounts[cid] || 0) + 1;
          });
          setCommentLikeCounts(clCounts);
          // Hydrate user's own likes so hearts show as filled
          const myLikes = {};
          (clMyResult.data || []).forEach((row) => {
            const cid = row.metadata?.comment_id;
            if (cid) myLikes[cid] = true;
          });
          if (Object.keys(myLikes).length > 0) {
            setCommentLikes((prev) => ({ ...prev, ...myLikes }));
          }
        } catch (e) {
          console.warn('[App] Handled exception:', e);
        }
      } catch (e) {
        console.warn('Load comments:', e);
      }
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
        .select(
          'id, content, created_at, media_url, media_type, profiles:author_id(username, avatar_url)'
        )
        .eq('post_id', currentReel.id)
        .order('created_at', { ascending: commentSort === 'oldest' })
        .range(nextPage * 50, (nextPage + 1) * 50 - 1);
      if (data && data.length > 0) {
        setComments((prev) => [...prev, ...data]);
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

  const submitComment = async () => {
    if ((!commentText.trim() && !commentMediaUrl) || !user?.id || !currentReel?.id) return;
    const text = commentText.trim();
    const mediaUrl = commentMediaUrl;
    const mediaType = commentMediaType;
    const tempId = Date.now();
    const parentId = replyTo?.id || null;
    setSubmittingComment(true);
    setCommentText('');
    setCommentMediaUrl(null);
    setCommentMediaType(null);
    setShowGifPicker(false);
    setReplyTo(null);
    // Optimistic comment
    setComments((prev) => [
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
      const payload = { post_id: currentReel.id, author_id: user.id, content: text || '' };
      if (mediaUrl) {
        payload.media_url = mediaUrl;
        payload.media_type = mediaType;
      }
      if (parentId) {
        payload.parent_id = parentId;
      }
      // social_comments.post_id FK may reference social_posts only.
      // For social_reels items, first check if a matching social_posts row exists.
      // If not, create a lightweight proxy post so the comment FK is satisfied.
      if (currentReel.source === 'reels') {
        const { data: existing } = await supabase
          .from('social_posts')
          .select('id')
          .eq('id', currentReel.id)
          .maybeSingle();
        if (!existing) {
          // Create a proxy social_posts row for this reel so comments can FK to it
          const { error: proxyErr } = await supabase.from('social_posts').insert({
            id: currentReel.id,
            author_id: user.id, // RLS requires author_id = auth.uid()
            content: currentReel.caption || '',
            content_type: 'video',
            media_urls: currentReel.video_url ? [currentReel.video_url] : [],
            visibility: 'public',
          });
          if (proxyErr) {
            console.warn(
              '[CommentInsert] Proxy post creation failed (may already exist):',
              proxyErr.message
            );
            // Continue anyway — the FK might work if another process created it
          }
        }
      }
      const { error } = await supabase.from('social_comments').insert(payload);
      if (error) throw error;
      busEmit.socialCommentAdded && busEmit.socialCommentAdded(currentReel.id, user.id);
      // DB trigger handles comment_count increment atomically
      setCommentCounts((prev) => ({ ...prev, [currentReel.id]: (prev[currentReel.id] || 0) + 1 }));
    } catch (err) {
      console.error('[CommentInsert] Failed:', err?.message, err?.details, err?.hint);
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      showErrorToast('Comment failed — ' + (err?.message || 'try again'));
    }
    setSubmittingComment(false);
  };

  // Phase 6 - Comment like toggle
  const handleCommentLike = async (commentId) => {
    if (!user?.id) return;
    const wasLiked = commentLikes[commentId];
    setCommentLikes((prev) => ({ ...prev, [commentId]: !wasLiked }));
    // Optimistic comment like count sync
    setCommentLikeCounts((prev) => ({
      ...prev,
      [commentId]: Math.max(0, (prev[commentId] || 0) + (wasLiked ? -1 : 1)),
    }));
    try {
      if (wasLiked) {
        // BUG FIX: .match({ metadata: { comment_id } }) does full-object JSONB equality.
        // Use PostgREST JSON path filter .eq('metadata->>comment_id', id) instead.
        await supabase
          .from('social_interactions')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', currentReel.id)
          .eq('interaction_type', 'comment_like')
          .eq('metadata->>comment_id', commentId);
      } else {
        await supabase.from('social_interactions').insert({
          user_id: user.id,
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
    if (!user?.id || !currentReel?.id) return;
    const prev = comments;
    setComments((c) => c.filter((x) => x.id !== commentId));
    try {
      const { error } = await supabase
        .from('social_comments')
        .delete()
        .eq('id', commentId)
        .eq('author_id', user.id);
      if (error) throw error;
      // DB trigger handles comment_count decrement atomically
      setCommentCounts((p) => ({
        ...p,
        [currentReel.id]: Math.max(0, (p[currentReel.id] || 1) - 1),
      }));
      busEmit.socialCommentAdded &&
        busEmit.socialCommentAdded(currentReel.id, user.id, { removed: true });
    } catch {
      setComments(prev);
    }
  };

  // Phase 7 - Edit own comment
  const handleEditComment = (comment) => {
    setEditingComment(comment.id);
    setEditCommentText(comment.content || '');
  };
  const handleSaveEdit = async (commentId) => {
    if (!editCommentText.trim() || !user?.id) return;
    const orig = comments.find((c) => c.id === commentId);
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, content: editCommentText.trim() } : c))
    );
    setEditingComment(null);
    try {
      const { error } = await supabase
        .from('social_comments')
        .update({ content: editCommentText.trim() })
        .eq('id', commentId)
        .eq('author_id', user.id);
      if (error) throw error;
    } catch {
      if (orig) setComments((prev) => prev.map((c) => (c.id === commentId ? orig : c)));
    }
    setEditCommentText('');
  };

  // Phase 7 - Playback speed toggle (YouTube)
  const handleSpeedToggle = () => {
    const speeds = [1, 1.25, 1.5, 2, 0.5, 0.75];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const newSpeed = speeds[nextIdx];
    setPlaybackSpeed(newSpeed);
    // Send setPlaybackRate command via sendYouTubeCommand (includes listening handshake)
    if (iframeRef.current?.contentWindow) {
      sendYouTubeCommand('setPlaybackRate', [newSpeed]);
    } else if (videoRef.current) {
      // Native video element - set playbackRate directly
      videoRef.current.playbackRate = newSpeed;
    }
  };

  // Phase 9: 1-Click Repost Architecture - open modal AND directly share to feed
  const handleShare = () => {
    if (!currentReel?.id) return;
    haptic(10);
    // BUG FIX (Bug 27): removed auto-shareToFeed - was silently creating a social post
    // on EVERY share button click, even if the user just wanted to copy the link.
    // Share-to-feed is now an explicit user action from within the share modal.
    setShowShareModal(true);
  };

  const shareUrl = currentReel
    ? (typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker') +
      '/hub/reels?id=' +
      currentReel.id
    : '';

  const handleShareAction = async (platform) => {
    setShowShareModal(false);
    const url = shareUrl;
    const title = `Check out this poker reel on Smarter.Poker`;
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
      if (platform !== 'copy') {
        incrementMetric(currentReel, 'share_count', 1);
      }
      if (user?.id) busEmit.socialPostShared(currentReel.id, user.id);
    } catch (err) {
      // AUDIT FIX: do NOT show 'Link Copied' toast on failures unrelated to clipboard.
      // navigator.share() throws AbortError on user-cancel (not an error) and
      // other errors on share failures. Only show the copy toast for actual copy failures.
      if (platform === 'copy') {
        showErrorToast('Copy failed — try again');
      }
      // For native/social platform failures: window.open already fired or user cancelled;
      // no toast needed — the user saw the native OS dialog.
      console.warn('[Reels] Share action failed:', err?.message || err);
    }
  };

  // Share to My Feed - uses API endpoint to bypass RLS/trigger issues
  const [sharingToFeed, setSharingToFeed] = useState(false);
  const [sharedToFeed, setSharedToFeed] = useState(false);
  const [showShareDescriptionModal, setShowShareDescriptionModal] = useState(false);
  const [shareDescription, setShareDescription] = useState('');

  // Opens the description modal instead of auto-posting
  const openShareDescriptionModal = () => {
    setShowShareModal(false);
    setShareDescription('');
    setShowShareDescriptionModal(true);
  };

  const handleShareToFeed = async (descOverride) => {
    if (!currentReel?.id || !user?.id || sharingToFeed) return;
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
        busEmit.socialPostShared(currentReel.id, user.id);
        busEmit.dataMutated('social');
      }
      setSharedToFeed(true);
      clearTimeout(sharedToFeedTimerRef.current);
      sharedToFeedTimerRef.current = setTimeout(() => {
        setSharedToFeed(false);
      }, 3000);
    } catch (err) {
      console.error('[ShareToFeed] Failed:', err?.message || err);
      showErrorToast('Share failed — ' + (err?.message || 'try again'));
    }
    setSharingToFeed(false);
    setShareDescription('');
  };

  // Reset comment panel + media + report + share state when switching reels
  useEffect(() => {
    setShowCommentPanel(false);
    setComments([]);
    setCommentText('');
    setShowGifPicker(false);
    setCommentMediaUrl(null);
    setCommentMediaType(null);
    setShowReportModal(false);
    setReportReason('');
    setReportSubmitted(false);
    setShareToast(false);
    setShowShareModal(false);
    setShowShareDescriptionModal(false);
    setShareDescription('');
    setSharingToFeed(false);
    setSharedToFeed(false);
    // Reset isPaused to true — the play button overlay is guarded by (isPaused && ytReady)
    // and ytReady starts false, so the play button won't show during autoplay startup.
    // If autoplay succeeds, YT fires onStateChange(1) → sets isPaused=false before ytReady=true.
    // If autoplay fails, ytReady=true after 3s fallback → play button correctly appears.
    // Without this reset, isPaused holds STALE state from the previous reel, making the
    // tap-to-play/pause logic inverted on the new video.
    setIsPaused(true);
    setYtReady(false); // Reset — suppress play button until YT fires onStateChange for new video
    setYtError(null); // Clear YouTube error state on reel change

    // Cancel any pending autoUnmute retry timers from the PREVIOUS reel's onStateChange(1).
    // Without this, they fire on the new iframe and can cause stale postMessage or setMuted() re-render.
    autoUnmuteRetryTimersRef.current.forEach((t) => clearTimeout(t));
    autoUnmuteRetryTimersRef.current = [];
    // Cancel any pending playVideo onLoad retry timers from the previous iframe's onLoad.
    // The key prop causes the iframe to remount on index change, but old timers still fire.
    playVideoOnLoadTimersRef.current.forEach((t) => clearTimeout(t));
    playVideoOnLoadTimersRef.current = [];

    // Mobile fallback: iOS Safari may never fire onStateChange via postMessage.
    // If ytReady is still false after 3s, force it true so the play button appears
    // and the user can manually tap to start playback.
    const ytReadyFallback = setTimeout(() => setYtReady(true), 3000);
    return () => {
      clearTimeout(ytReadyFallback);
      // Also cancel any in-flight retry timers on unmount
      autoUnmuteRetryTimersRef.current.forEach((t) => clearTimeout(t));
      autoUnmuteRetryTimersRef.current = [];
      playVideoOnLoadTimersRef.current.forEach((t) => clearTimeout(t));
      playVideoOnLoadTimersRef.current = [];
    };
  }, [currentIndex]);

  const handleSave = async () => {
    if (!currentReel || !user) return;
    const isSaved = savedReels.has(currentReel.id);
    // #1 Optimistic update - instant UI response
    if (isSaved) {
      setSavedReels((prev) => {
        const s = new Set(prev);
        s.delete(currentReel.id);
        return s;
      });
    } else {
      setSavedReels((prev) => new Set([...prev, currentReel.id]));
    }
    try {
      if (isSaved) {
        await savedReelsService.unsaveReel(user.id, currentReel.id);
      } else {
        // BUG FIX (Bug 28): pass source_type so post-sourced reels can be saved
        // without hitting the FK constraint on social_reels
        const srcType = currentReel.source === 'posts' ? 'post' : 'reel';
        await savedReelsService.saveReel(user.id, currentReel.id, srcType);
      }
      busEmit.socialPostBookmarked(currentReel.id, user.id, { added: !isSaved });
    } catch (err) {
      // AUDIT FIX: rollback to the PRE-operation state, not unconditionally delete.
      // Old: always deleted from Set, which was wrong when save (not unsave) failed —
      // the optimistic add was reverted by deleting, but re-adding if isSaved was never handled.
      if (isSaved) {
        setSavedReels((prev) => new Set([...prev, currentReel.id])); // restore the saved state
      } else {
        setSavedReels((prev) => {
          const s = new Set(prev);
          s.delete(currentReel.id);
          return s;
        }); // restore unsaved state
      }
      showErrorToast('Save failed - try again');
      console.warn('Save reel failed:', err?.message || err);
    }
  };

  // Hamburger menu handlers
  const handleUploadReel = () => {
    setShowUploadModal(true);
    setMenuOpen(false);
  };

  const updatePreference = async (key, value) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    if (user) {
      await reelsPreferences.update(user.id, newPrefs);
    }
  };

  // Menu config
  const menuConfig = getMenuConfig('reels', user, preferences, {
    onUploadReel: handleUploadReel,
    setAutoplay: (val) => updatePreference('autoplay', val),
    setSoundOnScroll: (val) => updatePreference('soundOnScroll', val),
    setDataSaver: (val) => updatePreference('dataSaver', val),
    setShowCaptions: (val) => updatePreference('showCaptions', val),
  });

  // Handler refs - prevent stale closures in keyboard shortcuts
  const handleLikeRef = useRef(handleLike);
  const handleDislikeRef = useRef(handleDislike);
  const handleSaveRef = useRef(handleSave);
  const handleCommentRef = useRef(handleComment);
  handleLikeRef.current = handleLike;
  handleDislikeRef.current = handleDislike;
  handleSaveRef.current = handleSave;
  handleCommentRef.current = handleComment;

  useEffect(() => {
    const handleKey = (e) => {
      // Don't intercept keyboard while typing in an input/textarea
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') slideToNextRef.current();
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') slideToPrevRef.current();
      if (e.key === 'Escape') router.push('/hub/social-media');
      // BUG FIX: Space bar is the universal play/pause shortcut — was missing
      // NOTE: Uses DOM state (videoRef.current.paused) and iframeRef for YouTube
      // to avoid stale closures since this effect only re-runs on [router]
      if (e.key === ' ') {
        e.preventDefault();
        if (videoRef.current) {
          // Native video — read paused from DOM (always fresh)
          if (videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          } else {
            videoRef.current.pause();
          }
        } else if (iframeRef.current?.contentWindow) {
          // YouTube — read isPaused via ref to avoid stale closure
          const currentlyPaused = isPausedRef.current;
          if (currentlyPaused) {
            sendYouTubeCommand('playVideo');
            setIsPaused(false);
          } else {
            sendYouTubeCommand('pauseVideo');
            setIsPaused(true);
          }
        }
      }
      if (e.key === 'm' || e.key === 'M') {
        setMuted((prev) => {
          const next = !prev;
          if (next) {
            sendYouTubeCommand('mute');
          } else {
            sendYouTubeCommand('unMute');
            sendYouTubeCommand('setVolume', [100]);
          }
          return next;
        });
      }
      if (e.key === 'l' || e.key === 'L') {
        handleLikeRef.current?.();
        haptic(15);
      }
      if (e.key === 's' || e.key === 'S') handleSaveRef.current?.();
      if (e.key === 'c' || e.key === 'C') handleCommentRef.current?.();
      if (e.key === '?') setShowShortcutsOverlay((prev) => !prev);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [router]);

  // Use refs to avoid stale closures in event handlers
  const currentIndexRef = useRef(currentIndex);
  const reelsLengthRef = useRef(reels.length);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    reelsLengthRef.current = reels.length;
  }, [reels.length]);

  // Slide helper for event handlers (uses refs, no stale closures)
  const slideToNext = () => {
    if (slideDebounceRef.current) return;
    if (currentIndexRef.current < reelsLengthRef.current - 1) {
      slideDebounceRef.current = true;
      setSlideDirection('up');
      if (slideAnimationTimerRef.current) clearTimeout(slideAnimationTimerRef.current);
      slideAnimationTimerRef.current = setTimeout(() => {
        slideAnimationTimerRef.current = null;
        setCurrentIndex((prev) => prev + 1);
        setSlideDirection(null);
        slideDebounceRef.current = false;
      }, 120);
    }
  };
  const slideToPrev = () => {
    if (slideDebounceRef.current) return;
    if (currentIndexRef.current > 0) {
      slideDebounceRef.current = true;
      setSlideDirection('down');
      if (slideAnimationTimerRef.current) clearTimeout(slideAnimationTimerRef.current);
      slideAnimationTimerRef.current = setTimeout(() => {
        slideAnimationTimerRef.current = null;
        setCurrentIndex((prev) => prev - 1);
        setSlideDirection(null);
        slideDebounceRef.current = false;
      }, 120);
    }
  };

  // Stable refs for slide functions (used in useEffect handlers)
  const slideToNextRef = useRef(slideToNext);
  const slideToPrevRef = useRef(slideToPrev);
  useEffect(() => {
    slideToNextRef.current = slideToNext;
    slideToPrevRef.current = slideToPrev;
  });

  // DOCUMENT-LEVEL touch capture to intercept BEFORE YouTube iframe gets them
  useEffect(() => {
    const handleTouchStart = (e) => {
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
      // Track pull-to-refresh start when at first reel
      if (currentIndexRef.current === 0) {
        pullStartY.current = e.touches[0].clientY;
      }
    };

    // CRITICAL: Block default scroll during vertical swipe so our handler works
    const handleTouchMove = (e) => {
      const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
      const dx = Math.abs(e.touches[0].clientX - (touchStartX.current || 0));
      // Only prevent default for vertical swipes (not horizontal)
      if (dy > 10 && dy > dx) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = (e) => {
      const endY = e.changedTouches[0].clientY;
      const diff = touchStartY.current - endY;
      const threshold = 50;

      // Pull-to-refresh: pull down while at reel 0
      if (pullStartY.current !== null && currentIndexRef.current === 0 && diff < -100) {
        pullStartY.current = null;
        setRefreshing(true);
        loadReels().finally(() => setRefreshing(false));
        return;
      }
      pullStartY.current = null;

      if (Math.abs(diff) > threshold) {
        try {
          navigator?.vibrate?.(10);
        } catch (e) {
          console.warn('[App] Handled exception:', e);
        }
        // Unmute synchronously here — this IS the user gesture context.
        // Calling via slideToNext/Prev breaks the gesture chain (goes through
        // setTimeout + React state) and setMuted() triggers a mid-animation re-render.
        if (userWantsSoundRef.current) {
          sendYouTubeCommand('unMute');
          sendYouTubeCommand('setVolume', [100]);
          setMuted(false);
          setUserWantsSound(true);
        }
        if (diff > 0) {
          slideToNextRef.current();
        } else {
          slideToPrevRef.current();
        }
      }
    };

    // Mouse wheel with debounce
    // BUG FIX (R-3): capture the wheelTimeout ID in the outer closure scope so the
    // cleanup function can clear it on unmount. Without this, the 400ms timeout fires
    // into a stale closure if the user navigates away during the cooldown.
    let wheelTimeout = null;
    const handleWheel = (e) => {
      if (wheelTimeout) return;
      wheelTimeout = setTimeout(() => {
        wheelTimeout = null;
      }, 400);
      if (e.deltaY > 30) {
        slideToNextRef.current();
      }
      if (e.deltaY < -30) {
        slideToPrevRef.current();
      }
    };

    // YouTube API message listener - auto-advance on video end
    // Origin-validated: only accept messages from YouTube embed domains
    const YOUTUBE_ORIGINS = [
      'https://www.youtube-nocookie.com',
      'https://www.youtube.com',
      'https://youtube.com',
    ];
    const handleYTMessage = (e) => {
      // Security: reject messages not from YouTube
      if (!YOUTUBE_ORIGINS.includes(e.origin)) return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!data?.event) return;
        if (data?.event === 'onStateChange') {
          if (data.info === 0) slideToNextRef.current();
          if (data.info === 1) {
            // Playing
            setYtReady(true); // YouTube confirmed playback — safe to show play button now
            setIsPaused(false);
            setYtError(null); // Clear any previous error on successful play
            // Auto-unmute after playback confirmed.
            // Cancel previous retry batch before scheduling new one
            // so reel changes don't accumulate stale timers on the wrong iframe.
            autoUnmuteRetryTimersRef.current.forEach((t) => clearTimeout(t));
            if (userWantsSoundRef.current) {
              autoUnmute();
              // Retry: iframe API sometimes isn't ready for unMute on first call
              autoUnmuteRetryTimersRef.current = [100, 300, 600].map((d) =>
                setTimeout(() => autoUnmute(), d)
              );
            } else {
              autoUnmuteRetryTimersRef.current = [];
            }
            setShowOverlay(true);
            clearTimeout(hudTimerRef.current);
            hudTimerRef.current = setTimeout(() => setShowOverlay(false), 5000);
          }
          if (data.info === 2) {
            // Paused
            setYtReady(true); // YouTube confirmed it knows about the video
            setIsPaused(true);
            setShowOverlay(true);
            if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
          }
        }
        // YouTube onError event — code 150 = age-restricted, 100 = not found, 101 = embed disabled
        if (data?.event === 'onError' && data?.info) {
          const errorCode = Number(data.info);
          console.warn('[Reels] YouTube error:', errorCode);
          setYtError({ code: errorCode });
          // Report to server + Sentry (best-effort)
          try {
            const vid = iframeRef.current?.src ? getYouTubeVideoId(iframeRef.current.src) : null;
            if (vid) {
              reportFailureToServer(vid, errorCode, 'HubReels');
              reportToSentry(vid, errorCode, 'HubReels');
            }
          } catch {
            /* best-effort */
          }
        }
        if (data?.info?.currentTime !== undefined && data?.info?.duration) {
          const pct = (data.info.currentTime / data.info.duration) * 100;
          setVideoProgress(Math.min(100, Math.max(0, pct)));
        }
      } catch (e) {
        console.warn('[ReelsPage] YT message parse error:', e);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('message', handleYTMessage);
    return () => {
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('touchmove', handleTouchMove, { capture: true });
      document.removeEventListener('touchend', handleTouchEnd, { capture: true });
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('message', handleYTMessage);
      // BUG FIX (R-3): clear the wheelTimeout closure variable on unmount
      if (wheelTimeout) clearTimeout(wheelTimeout);
    };
  }, []);
  // Realtime subscription - only reload on new social_reels; social_posts inserts are too
  // frequent (every post, not just video posts) to trigger a full feed reload
  useEffect(() => {
    if (!user?.id) return;
    let reloadTimer = null;
    const _ch = supabase
      .channel(`reels:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_reels' }, () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          loadReels();
        }, 3000);
      })
      // M7.4: surgical UPDATE handler — swap state when video_url changes
      // (worker conversion broadcast). Ignores like/comment/view UPDATEs.
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
                thumbnail_url: next.thumbnail_url || r.thumbnail_url,
              };
            })
          );
        }
      )
      // BUG FIX (REELS-DELETE-1): when a user deletes a post from their
      // profile, /hub/user/[username].js cascades the delete into social_reels
      // (and a DB FK migration also makes the cascade structural). Without a
      // DELETE listener here, the deleted reel kept playing in /hub/reels until
      // the next full reload. Subscribe and filter the reel out of state.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'social_reels' },
        (payload) => {
          const id = payload?.old?.id;
          if (!id) return;
          setReels((prev) => prev.filter((r) => r.id !== id));
        }
      )
      // BUG FIX (REELS-DELETE-2): if a reel was created from a social_post
      // (source_post_id is set), the post-delete path also matters. Filter any
      // reel whose source_post_id matches the deleted post id. This catches
      // the rare case where the reel row itself wasn't deleted but the post
      // was — the user expects the reel to disappear in either case.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'social_posts' },
        (payload) => {
          const postId = payload?.old?.id;
          if (!postId) return;
          setReels((prev) => prev.filter((r) => r.source_post_id !== postId));
        }
      )
      .subscribe();
    return () => {
      clearTimeout(reloadTimer);
      supabase.removeChannel(_ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // EventBus listeners - sync state from other video viewers
  useEffect(() => {
    const handleLikeBus = (event) => {
      const d = event?.payload;
      if (d?.postId) {
        // Only update liked state for OTHER users to avoid conflicting with optimistic update
        if (d.userId !== user?.id) {
          setLikeCounts((prev) => ({
            ...prev,
            [d.postId]: Math.max(0, (prev[d.postId] || 0) + (d.added ? 1 : -1)),
          }));
        }
      }
    };
    const handleBookmarkBus = (event) => {
      const d = event?.payload;
      if (d?.postId && user?.id) {
        setSavedReels((prev) => {
          const newSet = new Set(prev);
          if (d.added) newSet.add(d.postId);
          else newSet.delete(d.postId);
          return newSet;
        });
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
      if (d?.followedId && d?.followerId !== user?.id) {
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
      clearTimeout(hudTimerRef.current);
    };
  }, [user?.id]);

  if (loading) {
    return (
      <>
        <SEOHead
          title="Poker Reels - Short Poker Content"
          description="Watch And Share Short Poker Videos, Highlights, And Tips On Smarter.Poker Reels."
          canonical="/hub/reels"
        />
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: C.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* Shimmer skeleton */}
          <div
            style={{
              width: 280,
              height: 500,
              borderRadius: 16,
              background: 'linear-gradient(110deg, #1a1a1a 8%, #2a2a2a 18%, #1a1a1a 33%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s linear infinite',
            }}
          />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'linear-gradient(110deg, #1a1a1a 8%, #2a2a2a 18%, #1a1a1a 33%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s linear infinite',
              }}
            />
            <div>
              <div
                style={{
                  width: 120,
                  height: 14,
                  borderRadius: 7,
                  background: '#1a1a1a',
                  marginBottom: 6,
                }}
              />
              <div style={{ width: 60, height: 10, borderRadius: 5, background: '#1a1a1a' }} />
            </div>
          </div>
          <style>{`@keyframes shimmer { to { background-position-x: -200%; } }`}</style>
        </div>
      </>
    );
  }

  if (loadError && !reels.length) {
    return (
      <>
        <Head>
          <title>Reels | Smarter Poker</title>
        </Head>
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: C.bg,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h1
            style={{ color: C.text, fontSize: 24, fontWeight: 700, marginTop: 16, marginBottom: 8 }}
          >
            Failed To Load Reels
          </h1>
          <p
            style={{
              color: C.textSec,
              fontSize: 14,
              marginBottom: 24,
              textAlign: 'center',
              maxWidth: 280,
            }}
          >
            Check your connection and try again.
          </p>
          <button
            onClick={() => {
              setLoadError(false);
              loadReels();
            }}
            style={{
              padding: '12px 32px',
              background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
              color: 'white',
              borderRadius: 8,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              fontSize: 15,
            }}
          >
            Try Again
          </button>
        </div>
      </>
    );
  }

  if (!reels.length) {
    return (
      <>
        <Head>
          <title>Reels | Smarter Poker</title>
        </Head>
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: C.bg,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#888"
            strokeWidth="1.5"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M10 9l5 3-5 3V9z" fill="#888" />
          </svg>
          <h1 style={{ color: C.text, fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            No Reels Yet
          </h1>
          <p
            style={{
              color: C.textSec,
              fontSize: 16,
              marginBottom: 32,
              textAlign: 'center',
              maxWidth: 300,
            }}
          >
            Fresh poker clips are posted hourly!
          </p>
          <Link
            href="/hub/social-media"
            style={{
              padding: '12px 32px',
              background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
              color: 'white',
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Back to Feed
          </Link>
        </div>
      </>
    );
  }

  const videoId = getYouTubeVideoId(currentReel?.video_url);

  return (
    <>
      <Head>
        <title>
          {currentReel?.caption
            ? `${currentReel.caption.slice(0, 60)} | Reels`
            : 'Reels | Smarter Poker'}
        </title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        {/* Dynamic OpenGraph for shared reel links */}
        <meta
          property="og:title"
          content={
            currentReel?.caption ? currentReel.caption.slice(0, 70) : 'Poker Reel on Smarter.Poker'
          }
        />
        <meta
          property="og:description"
          content={`${currentReel?.profiles?.username ? `by ${currentReel.profiles.username} - ` : ''}Watch poker reels on Smarter.Poker`}
        />
        {videoId && (
          <meta
            property="og:image"
            content={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
          />
        )}
        <meta property="og:type" content="video.other" />
        <meta
          property="og:url"
          content={`https://smarter.poker/hub/reels${currentReel?.id ? `?id=${currentReel.id}` : ''}`}
        />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      {/* Universal Header */}
      <div
        style={{
          opacity: showOverlay ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: showOverlay ? 'auto' : 'none',
          position: 'relative',
          zIndex: 200,
        }}
      >
        <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />
      </div>

      {/* Hamburger Menu */}
      <HamburgerMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        direction="left"
        theme="dark"
        user={user}
        showProfile={false}
        menuItems={menuConfig.menuItems}
        bottomLinks={menuConfig.bottomLinks}
      />

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadReelModal
          user={user}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false);
            loadReels();
          }}
        />
      )}

      {/* Full-screen container */}
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          inset: 0,
          background: C.bg,
          overflow: 'hidden',
        }}
      >
        {/* Back button */}
        <Link
          href="/hub/social-media"
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 100,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 20,
            textDecoration: 'none',
          }}
        >
          ←
        </Link>

        {/* Title — fades with overlay so it doesn't block video content */}
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'white',
            fontWeight: 700,
            fontSize: 18,
            zIndex: 100,
            opacity: showOverlay ? 1 : 0,
            transition: 'opacity 0.3s ease',
            pointerEvents: 'none',
          }}
        >
          Reels
        </div>

        {/* Engagement Stats Pill REMOVED - duplicated the sidebar heart/comment buttons */}

        {/* VIDEO WRAPPER with slide animation */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            clipPath: 'inset(0)',
            background: '#000',
            zIndex: 1,
            pointerEvents: 'none',
            transition: slideDirection ? 'transform 0.12s ease-out, opacity 0.1s ease-out' : 'none',
            transform:
              slideDirection === 'up'
                ? 'translateY(-100%)'
                : slideDirection === 'down'
                  ? 'translateY(100%)'
                  : 'translateY(0)',
            opacity: slideDirection ? 0.3 : 1,
          }}
        >
          {/* Videos auto-play immediately (muted per browser policy) */}

          {/* Auto-play immediately - muted for browser compliance */}
          {videoId ? (
            <iframe
              ref={iframeRef}
              key={currentReel?.id}
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}&iv_load_policy=3&disablekb=1&fs=0&cc_load_policy=0`}
              title="Poker Reel"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              onLoad={(e) => {
                // Initialize YouTube postMessage API bridge
                // CRITICAL: The 'listening' event MUST be sent first to establish
                // the command channel. Without it, all commands are silently ignored.
                const iframeWindow = e.target.contentWindow;
                try {
                  iframeWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
                  iframeWindow.postMessage(
                    JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                    '*'
                  );
                  // Aggressive retry loop: YouTube API inside iframe needs time to initialize
                  // CRITICAL: Do NOT send unMute here — on mobile Safari, unmuting before
                  // playback starts causes autoplay to fail. Unmute only after
                  // onStateChange confirms Playing (info === 1).
                  // Cancel previous batch before scheduling new one.
                  playVideoOnLoadTimersRef.current.forEach((t) => clearTimeout(t));
                  playVideoOnLoadTimersRef.current = [300, 800, 1500, 3000].map((delay) =>
                    setTimeout(() => {
                      try {
                        iframeWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
                        iframeWindow.postMessage(
                          JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                          '*'
                        );
                      } catch (err) {
                        console.warn('[Reels] YT command retry failed:', err);
                      }
                    }, delay)
                  );
                } catch (err) {
                  console.warn('[Reels] YT onLoad init failed:', err);
                }
              }}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '100%',
                height: '100%',
                border: 'none',
                pointerEvents: 'none',
              }}
            />
          ) : currentReel?.video_url ? (
            /* Native video (mp4/webm/mov) - user-uploaded content */
            <>
              <video
                ref={videoRef}
                key={currentReel.id}
                src={currentReel.video_url}
                autoPlay
                loop
                playsInline
                // Always render muted=true — guarantees autoplay regardless
                // of browser policy. The new onPlaying handler flips
                // muted=false synchronously inside the playing event IF
                // the user has gestured this tab session (see the global
                // gesture-capture useEffect above).
                muted={true}
                onPlay={() => setIsPaused(false)}
                onPlaying={(e) => {
                  // Verify-after-unmute: when sessionStorage[sp:reels:interacted]
                  // is preset from a prior load, userInteractedRef is true but
                  // the browser hasn't seen a fresh gesture this load. The
                  // muted=false write may be silently ignored. Only flip React
                  // state after the DOM accepted it — never lie.
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
                onPause={() => setIsPaused(true)}
                onEnded={() => {
                  setIsPaused(false);
                  goNext();
                }}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.duration) setVideoProgress((v.currentTime / v.duration) * 100);
                }}
                // Surface decode failures (most commonly HEVC on Chrome
                // desktop — Chrome doesn't license H.265). Without this,
                // users see a black box with the play button forever.
                onError={(e) => {
                  const err = e.currentTarget?.error;
                  console.warn('[Reels] video decode failed', {
                    code: err?.code,
                    message: err?.message,
                    src: currentReel.video_url,
                    suggestion: 'Likely H.265/HEVC — needs server-side transcode to H.264',
                  });
                  if (typeof window !== 'undefined') {
                    window.__reelDecodeError = (window.__reelDecodeError || 0) + 1;
                  }
                }}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  pointerEvents: 'none',
                }}
              />
            </>
          ) : null}
        </div>

        {/* Video Progress Bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: 3,
            background: 'rgba(255,255,255,0.15)',
            zIndex: 60,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: `${videoProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #00d4ff, #7c3aed)',
              borderRadius: '0 2px 2px 0',
              transition: 'width 0.3s linear',
              boxShadow: '0 0 8px rgba(0,212,255,0.5)',
            }}
          />
        </div>

        {/* FULL-SCREEN TOUCH OVERLAY — captures ALL touch events over the iframe */}
        {/* This is the ONLY reliable way to handle touches on iOS Safari over YouTube embeds */}
        <div
          onTouchStart={(e) => {
            // Record swipe start position
            swipeStartRef.current = {
              y: e.touches[0].clientY,
              x: e.touches[0].clientX,
              t: Date.now(),
            };
            swipeDeltaRef.current = 0;
            handleLongPressTouchStart();
          }}
          onTouchMove={(e) => {
            if (!swipeStartRef.current) return;
            const dy = e.touches[0].clientY - swipeStartRef.current.y;
            swipeDeltaRef.current = dy;
            cancelLongPress();
            // Block page scroll
            e.preventDefault();
          }}
          onTouchEnd={(e) => {
            cancelLongPress();
            const delta = swipeDeltaRef.current;
            const elapsed = Date.now() - (swipeStartRef.current?.t || Date.now());
            swipeStartRef.current = null;

            // Swipe gesture (more than 50px vertical)
            if (Math.abs(delta) > 50) {
              if (e.cancelable) e.preventDefault();
              try {
                navigator?.vibrate?.(10);
              } catch (_) {}
              if (delta < 0) {
                // Swiped UP = next video
                slideToNextRef.current();
              } else {
                // Swiped DOWN = previous video
                slideToPrevRef.current();
              }
              return;
            }

            // Tap gesture (small delta, short duration)
            // For taps: handled via onClick
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowContextMenu(true);
          }}
          onClick={(e) => {
            const now = Date.now();
            const tapX = e.clientX;
            const screenW = window.innerWidth;

            // First tap EVER on this reel: auto-unmute + force play (iOS requires user gesture)
            if (isPaused || muted) {
              sendYouTubeCommand('playVideo');
              sendYouTubeCommand('unMute');
              sendYouTubeCommand('setVolume', [100]);
              setIsPaused(false);
              setMuted(false);
              setYtReady(true);
              lastTapRef.current = now;
              revealOverlay();
              return;
            }

            // LEFT 30% = previous
            if (tapX < screenW * 0.3) {
              slideToPrevRef.current();
              return;
            }
            // RIGHT 30% = next
            if (tapX > screenW * 0.7) {
              slideToNextRef.current();
              return;
            }

            // CENTER 40%: double-tap / single-tap
            if (now - lastTapRef.current < 300) {
              // Double tap = toggle play/pause
              haptic(15);
              if (videoId) {
                if (isPaused) {
                  sendYouTubeCommand('playVideo');
                  setIsPaused(false);
                } else {
                  sendYouTubeCommand('pauseVideo');
                  setIsPaused(true);
                  clearTimeout(hudTimerRef.current);
                }
              } else if (videoRef.current) {
                if (videoRef.current.paused) {
                  videoRef.current
                    .play()
                    .catch((e) => console.warn('[Reels] play() failed:', e?.message));
                } else {
                  videoRef.current.pause();
                  clearTimeout(hudTimerRef.current);
                }
              }
              lastTapRef.current = 0;
            } else {
              // Single tap = show/hide overlay ONLY
              revealOverlay();
              lastTapRef.current = now;
            }
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 50,
            cursor: 'pointer',
            touchAction: 'none', // Prevent browser handling of all touch gestures
          }}
        />

        {/* Age-restricted / errored YouTube video overlay */}
        {videoId && ytError && (
          <YouTubeErrorOverlay
            errorCode={ytError.code}
            videoId={videoId}
            thumbnailUrl={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
            actionLabel="Skipping in 3 seconds..."
            style={{ zIndex: 60 }}
          />
        )}

        {!videoId && !currentReel?.video_url && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
              zIndex: 2,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#666"
                strokeWidth="1.5"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M10 9l5 3-5 3V9z" fill="#666" />
              </svg>
              <div>Video Unavailable</div>
            </div>
          </div>
        )}

        {/* Pause indicator - shown only after YT confirms video state (ytReady) to avoid phantom play button during autoplay */}
        {isPaused && ytReady && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 55,
              animation: 'fadeInScale 0.2s ease',
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          </div>
        )}

        {/* Bottom gradient for text readability */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 300,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0.9))',
            pointerEvents: 'none',
            zIndex: 90,
            opacity: showOverlay ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />

        {/* Author info overlay - hidden by default, shown on tap */}
        <div
          style={{
            position: 'absolute',
            bottom: 120,
            left: 16,
            right: 80,
            zIndex: 100,
            opacity: showOverlay ? 1 : 0,
            transition: 'opacity 0.3s ease',
            pointerEvents: showOverlay ? 'auto' : 'none',
          }}
        >
          <Link
            href={`/hub/user/${currentReel?.profiles?.username}`}
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
                width: 44,
                height: 44,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid white',
              }}
              loading="lazy"
            />
            <div>
              <div
                style={{
                  color: 'white',
                  fontWeight: 600,
                  fontSize: 15,
                  textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>{currentReel?.profiles?.full_name || currentReel?.profiles?.username}</span>
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
              <div
                style={{
                  color: C.textSec,
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {timeAgo(currentReel?.created_at)}
                <span style={{ opacity: 0.6 }}>·</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {viewCounts[currentReel?.id] || currentReel?.view_count || 0}
                </span>
              </div>
            </div>
          </Link>
          {/* Follow button */}
          {currentReel?.profiles?.id && user?.id && currentReel.profiles.id !== user.id && (
            <button
              onClick={handleFollow}
              style={{
                padding: '4px 14px',
                borderRadius: 16,
                fontSize: 12,
                fontWeight: 600,
                border: following[currentReel.profiles.id]
                  ? '1px solid rgba(255,255,255,0.5)'
                  : 'none',
                background: following[currentReel.profiles.id] ? 'transparent' : '#1877F2',
                color: 'white',
                cursor: 'pointer',
                marginBottom: 8,
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              }}
            >
              {following[currentReel.profiles.id] ? 'Following' : 'Follow'}
            </button>
          )}

          {currentReel?.caption && (
            <div style={{ maxWidth: '80%' }}>
              <p
                style={{
                  color: 'white',
                  fontSize: 14,
                  margin: 0,
                  textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                }}
              >
                {captionExpanded || currentReel.caption.length <= 100
                  ? currentReel.caption
                  : currentReel.caption.slice(0, 100) + '...'}
              </p>
              {currentReel.caption.length > 100 && (
                <button
                  onClick={() => setCaptionExpanded((prev) => !prev)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '4px 0 0',
                  }}
                >
                  {captionExpanded ? 'See Less' : 'See More'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Action Sidebar - hidden by default, shown on tap */}
        <div
          style={{
            position: 'absolute',
            right: 12,
            bottom: 110,
            zIndex: 100,
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
                  // BUG FIX (R-4): cancel previous heart hide timer before scheduling
                  // a new one. Rapid taps accumulated N bare timeouts that all fired
                  // setShowHeart(false) on an unmounted component.
                  setShowHeart(true);
                  if (showHeartTimerRef.current) clearTimeout(showHeartTimerRef.current);
                  showHeartTimerRef.current = setTimeout(() => {
                    showHeartTimerRef.current = null;
                    setShowHeart(false);
                  }, 800);
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
                {likeCounts[currentReel?.id] ?? (currentReel?.like_count || 0)}
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
                      // BUG FIX (R-5): use showHeartTimerRef for all reaction-picker heart animations
                      const triggerHeart = () => {
                        if (!liked[currentReel?.id]) {
                          setShowHeart(true);
                          if (showHeartTimerRef.current) clearTimeout(showHeartTimerRef.current);
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
            onClick={handleComment}
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
                color: showCommentPanel ? '#1877F2' : 'white',
                fontSize: 11,
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              }}
            >
              {(commentCounts[currentReel?.id] || comments.length) > 0
                ? commentCounts[currentReel?.id] || comments.length
                : 'Comment'}
            </span>
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
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
            <span style={{ color: 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              Share
            </span>
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            aria-label={savedReels.has(currentReel?.id) ? 'Unsave' : 'Save'}
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
              fill={savedReels.has(currentReel?.id) ? 'white' : 'none'}
              stroke="white"
              strokeWidth="2"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <span style={{ color: 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              {savedReels.has(currentReel?.id) ? 'Saved' : 'Save'}
            </span>
          </button>

          {/* Train This Spot — opens in-place overlay (no navigation) */}
          <button
            onClick={() => {
              const ytVid = getYouTubeVideoId(currentReel?.video_url);
              const title = (currentReel?.caption || '').slice(0, 80);
              const ctx = {
                ref: 'reels',
                vid: ytVid || currentReel?.id || '',
                title,
                source: 'Reels',
                tags: currentReel?.tags || [],
              };
              const gameIds = findBestGames(ctx);
              // Lazy-load to avoid Webpack circular initialization
              const { getGameById: lookupGame } = require('../../src/data/TRAINING_LIBRARY');
              const games = gameIds
                .map((id) => lookupGame(id))
                .filter(Boolean)
                .slice(0, 3);
              setTtsOverlay({ ctx, games });

              // Fire analytics (fire-and-forget)
              fetch('/api/training/log-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ref: 'reels',
                  vid: ctx.vid,
                  title: ctx.title,
                  source: 'Reels',
                  matchedGameIds: gameIds.slice(0, 3),
                }),
              }).catch(() => {});
            }}
            aria-label="Train This Spot"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(0,200,83,0.25)',
                border: '1.5px solid rgba(0,200,83,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                filter: 'drop-shadow(0 0 6px rgba(0,200,83,0.5))',
                animation: 'tts-glow 2.5s ease-in-out infinite',
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#34C759"
                strokeWidth="2.5"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span
              style={{
                color: '#34C759',
                fontSize: 10,
                fontWeight: 700,
                textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              }}
            >
              Train
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
                style={{ color: 'white', fontSize: 10, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
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
                {/* Sound */}
                <button
                  onClick={() => {
                    muted ? handleUnmute() : handleMute();
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
                {/* Speed */}
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
                {/* Copy Link */}
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/hub/reels?id=${currentReel?.id || ''}`;
                    navigator.clipboard
                      .writeText(url)
                      .then(() => {
                        // BUG FIX (R-6): cancel previous copyToast timer before starting a new one.
                        // Prevents setState-after-unmount if user copies then immediately navigates.
                        setCopyToast(true);
                        if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
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
                {/* Report */}
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

        {/* Floating Mute/Unmute Button - hidden by default, shown on tap */}
        <button
          onClick={() => {
            if (muted) {
              handleUnmute();
            } else {
              handleMute();
            }
          }}
          aria-label={muted ? 'Unmute' : 'Mute'}
          style={{
            position: 'absolute',
            bottom: 20,
            right: 16,
            zIndex: 120,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: muted ? 'rgba(255,255,255,0.15)' : 'rgba(0,212,255,0.2)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: muted ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,212,255,0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            opacity: muted || showOverlay ? 1 : 0,
            pointerEvents: muted || showOverlay ? 'auto' : 'none',
          }}
        >
          {muted ? (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#00d4ff"
              strokeWidth="2"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
        </button>

        {/* Instagram-style heart burst with particles */}
        {showHeart && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 150,
              width: 120,
              height: 120,
            }}
          >
            {/* Main heart */}
            <svg
              width="80"
              height="80"
              viewBox="0 0 24 24"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                animation: 'heartBurstMain 0.8s ease-out forwards',
                filter: 'drop-shadow(0 0 20px rgba(239,68,68,0.6))',
              }}
            >
              <path
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                fill="#ef4444"
                stroke="#ff6b6b"
                strokeWidth="1"
              />
            </svg>
            {/* Particle hearts */}
            {[0, 60, 120, 180, 240, 300].map((angle, i) => (
              <svg
                key={i}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  animation: `heartParticle${i} 0.7s ${i * 0.05}s ease-out forwards`,
                  opacity: 0,
                }}
              >
                <path
                  d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                  fill={['#ef4444', '#ff6b6b', '#f472b6', '#ef4444', '#ff6b6b', '#f472b6'][i]}
                />
              </svg>
            ))}
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
              zIndex: 200,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            Link Copied
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
                ['Esc', 'Back to Feed'],
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
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase 9: Long Press Context Menu */}
        {showContextMenu && (
          <div
            onClick={() => setShowContextMenu(false)}
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
                onClick={() => {
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
                  fill={savedReels.has(currentReel?.id) ? 'white' : 'none'}
                  stroke="white"
                  strokeWidth="2"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                {savedReels.has(currentReel?.id) ? 'Unsave' : 'Save Reel'}
              </button>
              <button
                onClick={() => {
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
              <button
                onClick={() => {
                  setShowContextMenu(false);
                  handleReport();
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
              zIndex: 250,
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
                <div style={{ color: 'white', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <button
                  onClick={() => handleShareAction('copy')}
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
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#00d4ff"
                    strokeWidth="2"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span style={{ color: 'white', fontSize: 10, fontWeight: 500 }}>Copy Link</span>
                </button>
                <button
                  onClick={() => handleShareAction('x')}
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
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span style={{ color: 'white', fontSize: 10, fontWeight: 500 }}>X</span>
                </button>
                <button
                  onClick={() => handleShareAction('facebook')}
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
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#1877F2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  <span style={{ color: 'white', fontSize: 10, fontWeight: 500 }}>Facebook</span>
                </button>
                <button
                  onClick={() => handleShareAction('whatsapp')}
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
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <span style={{ color: 'white', fontSize: 10, fontWeight: 500 }}>WhatsApp</span>
                </button>
              </div>
              {typeof navigator !== 'undefined' && navigator.share && (
                <button
                  onClick={() => handleShareAction('native')}
                  style={{
                    width: '100%',
                    marginTop: 12,
                    padding: '12px',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: 14,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  More Sharing Options
                </button>
              )}
            </div>
          </div>
        )}

        {/* Share Description Modal — user adds description before posting to feed */}
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

              {/* Reel preview */}
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
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 1.4 }}>
                    {currentReel.caption.length > 100
                      ? currentReel.caption.slice(0, 100) + '...'
                      : currentReel.caption}
                  </div>
                </div>
              )}

              {/* Description textarea */}
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
                  alignItems: 'center',
                  marginTop: 6,
                  marginBottom: 16,
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
                  {shareDescription.length}/500
                </span>
              </div>

              {/* Post button */}
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
                  transition: 'all 0.3s ease',
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

              {/* Skip description option */}
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

        {/* Heart burst + slide animation CSS */}
        <style>{`
                    @keyframes heartBurstMain {
                        0% { opacity: 0; transform: translate(-50%, -50%) scale(0); }
                        30% { opacity: 1; transform: translate(-50%, -50%) scale(1.4); }
                        60% { opacity: 1; transform: translate(-50%, -50%) scale(0.95); }
                        80% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.1); }
                        100% { opacity: 0; transform: translate(-50%, -50%) scale(1.3); }
                    }
                    @keyframes heartParticle0 { 0% { opacity: 1; transform: translate(-50%,-50%) scale(0.5); } 100% { opacity: 0; transform: translate(calc(-50% + 45px), calc(-50% - 35px)) scale(0.3) rotate(20deg); } }
                    @keyframes heartParticle1 { 0% { opacity: 1; transform: translate(-50%,-50%) scale(0.5); } 100% { opacity: 0; transform: translate(calc(-50% + 50px), calc(-50% + 20px)) scale(0.3) rotate(-15deg); } }
                    @keyframes heartParticle2 { 0% { opacity: 1; transform: translate(-50%,-50%) scale(0.5); } 100% { opacity: 0; transform: translate(calc(-50% + 15px), calc(-50% + 50px)) scale(0.3) rotate(30deg); } }
                    @keyframes heartParticle3 { 0% { opacity: 1; transform: translate(-50%,-50%) scale(0.5); } 100% { opacity: 0; transform: translate(calc(-50% - 45px), calc(-50% + 30px)) scale(0.3) rotate(-25deg); } }
                    @keyframes heartParticle4 { 0% { opacity: 1; transform: translate(-50%,-50%) scale(0.5); } 100% { opacity: 0; transform: translate(calc(-50% - 50px), calc(-50% - 20px)) scale(0.3) rotate(10deg); } }
                    @keyframes heartParticle5 { 0% { opacity: 1; transform: translate(-50%,-50%) scale(0.5); } 100% { opacity: 0; transform: translate(calc(-50% - 15px), calc(-50% - 50px)) scale(0.3) rotate(-30deg); } }
                    @keyframes shimmer { to { background-position-x: -200%; } }
                    @keyframes soundWave {
                        0% { height: 2px; }
                        100% { height: var(--max-h, 10px); }
                    }
                    @keyframes fadeInScale {
                        from { opacity: 0; transform: scale(0.85); }
                        to { opacity: 1; transform: scale(1); }
                    }
                    @keyframes pulse {
                        0%, 100% { box-shadow: 0 0 0 0 rgba(0,212,255,0.3); }
                        50% { box-shadow: 0 0 0 8px rgba(0,212,255,0); }
                    }
                    @keyframes tts-glow {
                        0%, 100% { box-shadow: 0 0 6px rgba(0,200,83,0.4); border-color: rgba(0,200,83,0.7); }
                        50%       { box-shadow: 0 0 18px rgba(0,200,83,0.8); border-color: rgba(0,200,83,1); }
                    }
                `}</style>

        {/* Comment Panel */}
        {showCommentPanel && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 200,
              background: 'rgba(0,0,0,0.95)',
              borderRadius: '16px 16px 0 0',
              maxHeight: '55vh',
              display: 'flex',
              flexDirection: 'column',
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
              <span style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Comments</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Phase 8 - Sort toggle */}
                <button
                  onClick={() => {
                    const next = commentSort === 'newest' ? 'oldest' : 'newest';
                    setCommentSort(next);
                    setComments((prev) =>
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
                  onClick={() => {
                    setShowCommentPanel(false);
                    setShowGifPicker(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'white',
                    fontSize: 20,
                    cursor: 'pointer',
                  }}
                >
                  x
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', maxHeight: 250 }}>
              {comments.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.5)',
                    padding: 20,
                    fontSize: 14,
                  }}
                >
                  No comments yet. Be the first!
                </div>
              )}
              {comments.map((c, i) => (
                <div
                  key={c.id || i}
                  style={{
                    display: 'flex',
                    gap: 10,
                    marginBottom: 12,
                    paddingLeft: c.parent_id ? 24 : 0,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#333',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      color: 'white',
                      flexShrink: 0,
                    }}
                  >
                    {(c.profiles?.username || c.author?.username || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>
                      {c.profiles?.username || c.author?.username || 'User'}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 8 }}>
                      {c.created_at ? timeAgo(c.created_at) : ''}
                    </span>
                    {/* Phase 7 - Inline edit mode */}
                    {editingComment === c.id ? (
                      <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
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
                            borderRadius: 20,
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
                        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2 }}>
                          {c.content}
                        </div>
                      )
                    )}
                    {c.media_url && (
                      <img
                        src={c.media_url}
                        alt=""
                        style={{
                          maxWidth: 180,
                          maxHeight: 140,
                          borderRadius: 8,
                          marginTop: 6,
                          objectFit: 'cover',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                        loading="lazy"
                      />
                    )}
                    {/* Phase 6+7 - Comment engagement row */}
                    <div style={{ display: 'flex', gap: 14, marginTop: 4, alignItems: 'center' }}>
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
                            username: c.profiles?.username || c.author?.username || 'User',
                          });
                          setCommentText(
                            `@${c.profiles?.username || c.author?.username || 'User'} `
                          );
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
                      {(c.profiles?.username === 'You' || c.author_id === user?.id) && (
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

            {/* Media preview strip */}
            {commentMediaUrl && (
              <div
                style={{
                  padding: '6px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <img
                  src={commentMediaUrl}
                  alt=""
                  style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }}
                />
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                  {commentMediaType === 'gif' ? 'GIF' : 'Image'} attached
                </span>
                <button
                  onClick={() => {
                    setCommentMediaUrl(null);
                    setCommentMediaType(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: 16,
                    cursor: 'pointer',
                    marginLeft: 'auto',
                  }}
                >
                  x
                </button>
              </div>
            )}

            {/* GIF picker */}
            {showGifPicker && (
              <div
                style={{
                  maxHeight: 200,
                  overflow: 'auto',
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <GiphyPicker
                  onSelect={(gif) => {
                    setCommentMediaUrl(gif.images?.fixed_height?.url || gif.url || gif);
                    setCommentMediaType('gif');
                    setShowGifPicker(false);
                  }}
                />
              </div>
            )}

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
                  <span style={{ color: '#00d4ff', fontWeight: 600 }}>@{replyTo.username}</span>
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

            {/* Comment input toolbar */}
            <div
              style={{
                padding: '8px 16px',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {/* GIF + Image buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowGifPicker((prev) => !prev)}
                  style={{
                    background: showGifPicker ? 'rgba(24,119,242,0.2)' : 'rgba(255,255,255,0.08)',
                    border: showGifPicker
                      ? '1px solid #1877F2'
                      : '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 14,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: showGifPicker ? '#1877F2' : 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                  }}
                >
                  GIF
                </button>
                <button
                  onClick={() => commentFileInputRef.current?.click()}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 14,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                  }}
                >
                  {uploadingImage ? 'Uploading...' : 'Image'}
                </button>
                <input
                  ref={commentFileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleCommentImageUpload(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              {/* Input + Post */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={commentText}
                  onChange={(e) => {
                    if (e.target.value.length <= COMMENT_MAX_LENGTH) setCommentText(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitComment();
                    }
                  }}
                  placeholder="Add A Comment..."
                  maxLength={COMMENT_MAX_LENGTH}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    borderRadius: 20,
                    fontSize: 14,
                    color: 'white',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={submitComment}
                  disabled={(!commentText.trim() && !commentMediaUrl) || submittingComment}
                  style={{
                    padding: '8px 16px',
                    background: '#1877F2',
                    color: 'white',
                    border: 'none',
                    borderRadius: 20,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: commentText.trim() || commentMediaUrl ? 'pointer' : 'not-allowed',
                    opacity: commentText.trim() || commentMediaUrl ? 1 : 0.5,
                  }}
                >
                  {submittingComment ? '...' : 'Post'}
                </button>
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
                    paddingRight: 4,
                  }}
                >
                  {commentText.length}/{COMMENT_MAX_LENGTH}
                </div>
              )}
            </div>
          </div>
        )}

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
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            Link Copied!
          </div>
        )}

        {/* #10 Error Toast */}
        {errorToast && (
          <div
            style={{
              position: 'absolute',
              top: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(255,69,58,0.15)',
              border: '1px solid rgba(255,69,58,0.4)',
              borderRadius: 12,
              padding: '10px 22px',
              color: '#FF453A',
              fontSize: 13,
              fontWeight: 600,
              zIndex: 300,
              backdropFilter: 'blur(10px)',
              animation: 'fadeIn 0.2s ease-out',
              whiteSpace: 'nowrap',
            }}
          >
            {errorToast}
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
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 300,
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
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
                    Thank you. We will review this content.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ color: 'white', fontWeight: 700, fontSize: 18, marginBottom: 16 }}>
                    Report This Reel
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 12 }}>
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

        {/* Preload next reel - hidden iframe for instant switching */}
        {reels[currentIndex + 1] &&
          (() => {
            const nextVid = getYouTubeVideoId(reels[currentIndex + 1]?.video_url);
            return nextVid ? (
              <>
                <img
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
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${nextVid}?autoplay=0&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}`}
                  title="Preload"
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    opacity: 0,
                    pointerEvents: 'none',
                  }}
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </>
            ) : null;
          })()}

        {/* Pull-to-refresh indicator */}
        {refreshing && (
          <div
            style={{
              position: 'absolute',
              top: 60,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 200,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 18px',
              borderRadius: 20,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: 'white',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span style={{ color: 'white', fontSize: 13, fontWeight: 500 }}>Refreshing...</span>
          </div>
        )}

        {/* Loading indicator at bottom */}
        {!showCommentPanel && loadingMore && (
          <div
            style={{
              position: 'absolute',
              bottom: 60,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              zIndex: 100,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: 'white',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          </div>
        )}

        {/* Spin animation for loader */}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* ── Train This Spot In-Place Overlay ── */}
        {ttsOverlay && (
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 9500,
              animation: 'tts-sheet-up 0.32s cubic-bezier(0.34,1.56,0.64,1) both',
            }}
          >
            {/* Scrim */}
            <div
              onClick={() => setTtsOverlay(null)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.55)',
                zIndex: -1,
              }}
            />

            <div
              style={{
                background: 'linear-gradient(180deg, #0a0f1e 0%, #060a14 100%)',
                borderRadius: '20px 20px 0 0',
                border: '1px solid rgba(0,200,83,0.2)',
                borderBottom: 'none',
                maxHeight: '75vh',
                overflow: 'auto',
                boxShadow: '0 -10px 60px rgba(0,0,0,0.7), 0 0 40px rgba(0,200,83,0.08)',
              }}
            >
              {/* Drag handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                <div
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    background: 'rgba(255,255,255,0.15)',
                  }}
                />
              </div>

              {/* Header */}
              <div
                style={{ padding: '8px 20px 14px', display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(0,200,83,0.3), rgba(0,150,60,0.15))',
                    border: '1.5px solid rgba(0,200,83,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#34C759"
                    strokeWidth="2.5"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontSize: 14, fontWeight: 800, color: '#34C759', letterSpacing: 0.3 }}
                  >
                    Train This Spot
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    AI-matched drills for this reel
                  </div>
                </div>
                <button
                  onClick={() => setTtsOverlay(null)}
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: 16,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Video context card */}
              <div
                style={{
                  padding: '0 20px 12px',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: 100,
                    height: 56,
                    borderRadius: 8,
                    overflow: 'hidden',
                    flexShrink: 0,
                    background: '#111',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <img
                    src={`https://img.youtube.com/vi/${ttsOverlay.ctx.vid}/mqdefault.jpg`}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#fff',
                      lineHeight: 1.35,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {ttsOverlay.ctx.title || 'Poker Reel'}
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      marginTop: 4,
                      background: 'rgba(255,68,68,0.1)',
                      border: '1px solid rgba(255,68,68,0.2)',
                      borderRadius: 6,
                      padding: '2px 7px',
                    }}
                  >
                    <div
                      style={{ width: 5, height: 5, borderRadius: '50%', background: '#FF4444' }}
                    />
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#FF8888' }}>
                      {ttsOverlay.ctx.source || 'Reels'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Matched drills */}
              <div style={{ padding: '0 20px 8px' }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.25)',
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  AI-Recommended Drills
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ttsOverlay.games.map((game, idx) => (
                    <button
                      key={game.id}
                      onClick={() => {
                        setTtsOverlay(null);
                        router.push(`/hub/training?autoLaunch=${game.id}`);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        background: idx === 0 ? 'rgba(0,200,83,0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1.5px solid ${idx === 0 ? 'rgba(0,200,83,0.3)' : 'rgba(255,255,255,0.06)'}`,
                        borderRadius: 10,
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 7,
                          flexShrink: 0,
                          background: idx === 0 ? 'rgba(0,200,83,0.15)' : 'rgba(255,255,255,0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 16,
                        }}
                      >
                        {game.icon || '🎯'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: idx === 0 ? '#34C759' : '#fff',
                            }}
                          >
                            {game.name}
                          </span>
                          {idx === 0 && (
                            <span
                              style={{
                                fontSize: 8,
                                fontWeight: 800,
                                color: '#34C759',
                                background: 'rgba(0,200,83,0.12)',
                                borderRadius: 5,
                                padding: '1px 5px',
                              }}
                            >
                              BEST MATCH
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                          {game.focus} · {'★'.repeat(Math.min(game.difficulty || 1, 5))} Difficulty
                        </div>
                      </div>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth="2.5"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div
                style={{
                  padding: '6px 20px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {/* Solve in Sandbox */}
                <button
                  onClick={() => {
                    setTtsOverlay(null);
                    router.push(buildSandboxUrl(ttsOverlay.ctx));
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(0,150,255,0.1), rgba(0,100,200,0.1))',
                    border: '1.5px solid rgba(0,150,255,0.35)',
                    color: '#4DA6FF',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    transition: 'all 0.15s',
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8" />
                    <path d="M12 17v4" />
                  </svg>
                  {(() => {
                    const ex = extractCardsFromContext(ttsOverlay.ctx);
                    return ex.hand
                      ? `Solve in Sandbox (${ex.hand.slice(0, 2)} ${ex.hand.slice(2)})`
                      : 'Open in Virtual Sandbox';
                  })()}
                </button>

                {/* Browse all training */}
                <button
                  onClick={() => {
                    setTtsOverlay(null);
                    router.push('/hub/training');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: 8,
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.3)',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  Browse All 100 Training Games
                </button>
              </div>
            </div>
          </div>
        )}
        <style>{`
                    @keyframes tts-sheet-up {
                        from { transform: translateY(100%); opacity: 0.7; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                `}</style>
      </div>
    </>
  );
}
