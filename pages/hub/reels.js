/**
 * REELS PAGE - TikTok-style Full-Screen Vertical Video Experience
 * Swipe up/down to navigate, tap to mute/unmute
 */

import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import styles from './reels-console.module.css';
import { useFitText } from '../../src/components/video-library/console/useFitText';
import {
  YouTubeErrorOverlay,
  reportFailureToServer,
} from '../../src/hooks/useYouTubeErrorManager';
import Head from 'next/head';
import SEOHead from '../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import Link from 'next/link';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { reelsPreferences, savedReelsService } from '../../src/services/preferences-service';
import { getAuthUser } from '../../src/lib/authUtils';
import UploadReelModal from '../../src/components/reels/UploadReelModal';
import ReelPublicationRecoveryBanner from '../../src/components/reels/ReelPublicationRecoveryBanner';
import { saveAppSetting } from '../../src/lib/appSettingsSync';
import { busEmit, eventBus, EventType } from '../../src/engine/EventBus';
import GiphyPicker from '../../src/components/shared/GiphyPicker';
import { getAccessToken } from '../../src/lib/authUtils';
import { getYouTubeVideoId } from '../../src/lib/socialHelpers';
import {
  findBestGames,
} from '../../src/utils/videoToTrainingMapper';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import {
  fetchPokerReels,
  mergePokerReels,
} from '../../src/lib/reelsFeedClient';
import {
  loadReelFollowState,
  loadReelInteractionState,
  normaliseReelAuthorIds,
} from '../../src/lib/reelInteractionHydration';
import { createLatestRequestGuard } from '../../src/lib/latestRequestGuard.mjs';
import { scanReelsContinuations } from '../../src/lib/reelsContinuation.mjs';
import {
  BACKGROUND_REELS_REFRESH,
  REELS_BACKGROUND_REFRESH_DELAY_MS,
  createReelRealtimeChangeFilter,
  createReelsRefreshCoordinator,
  mergeBackgroundReels,
  resolveStaleReels,
} from '../../src/lib/reelsRealtimeRefresh.mjs';
import {
  loadWatchedReelIds,
  loadNotInterestedReelIds,
  persistWatchedReelIds,
  persistNotInterestedReelIds,
  readReelsSessionFlag,
  safeSetReelsLocalStorage,
  safeSetReelsSessionStorage,
} from '../../src/lib/reelsWatchedStorage.mjs';
import { createReelAccountScope } from '../../src/lib/reelAccountScope.mjs';
import VideoLibraryConsole, {
  ConsoleCopy,
  ConsoleDataRow,
} from '../../src/components/video-library/console/VideoLibraryConsole';
import {
  fetchPublicReelsListing,
  feedListingCacheHeaders,
} from '../../src/lib/seo/publicFeedData';
import {
  FEED_LISTING_LIMIT,
  FEED_LISTING_TIMEOUT_MS,
  formatListingDate,
  reelsItemListSchema,
  withDeadline,
} from '../../src/lib/seo/publicFeedListing.mjs';
import { readPokerReelsFeed } from '../../src/lib/server/reelsFeed';

const C = {
  bg: '#000000',
  text: '#FFFFFF',
  textSec: 'rgba(255,255,255,0.7)',
};

function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'Just Now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)} Days Ago`;
}

function ReelsConsoleScreen({
  eyebrow = 'Video Library',
  title,
  subtitle,
  pill,
  pillInk = 'blue',
  copy,
  rows = [],
  secondary,
  primary,
  titleAs = 'h1',
}) {
  return (
    <main className={styles.screen}>
      <VideoLibraryConsole
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        pill={pill}
        pillInk={pillInk}
        titleAs={titleAs}
        foot="plates"
        plates={{ secondary, primary }}
        aria-label={title}
      >
        <ConsoleCopy align="center">{consoleText(copy)}</ConsoleCopy>
        {rows.map((row) => <ConsoleDataRow key={row.label} {...row} />)}
      </VideoLibraryConsole>
    </main>
  );
}

function consoleText(value) {
  return String(value || '').replace(/\\u2014|—/g, ' - ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function ReelAction({ children, className = '', ...props }) {
  const text = Array.isArray(children) ? children.join('') : String(children ?? '');
  const fitRef = useFitText(text, 1, 0.5);
  return (
    <button type="button" {...props} className={`${styles.action} ${className}`}>
      <span className={styles.actionFace}><span ref={fitRef}>{children}</span></span>
    </button>
  );
}

function ReelsConsoleDialog({ title, children, onClose, primary, ...rest }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const focusables = () => [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not([type="hidden"]), textarea, select, [tabindex="0"]')]
      .filter((element) => element.getClientRects().length > 0);
    (focusables()[0] || dialog)?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current?.();
      } else if (event.key === 'Tab') {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        if (!first) { event.preventDefault(); dialog?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-sp-skip-a11y="backdrop: click dismisses, Escape is the keyboard path" className={styles.dialogBackdrop} onClick={() => closeRef.current?.()}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true"
        aria-labelledby={titleId} tabIndex={-1} data-sp-skip-a11y="propagation guard, not a control" onClick={(event) => event.stopPropagation()} {...rest}>
        <VideoLibraryConsole eyebrow="Reel Controls" title={title} titleId={titleId}
          foot={primary ? 'plates' : 'foot'}
          plates={primary ? { secondary: { label: 'Close', onClick: onClose }, primary } : undefined}>
          {children}
          {!primary && <ReelAction onClick={onClose}>Close</ReelAction>}
        </VideoLibraryConsole>
      </div>
    </div>, document.body
  );
}

/**
 * The crawler listing, printed as console text on the page's own black glass:
 * lit blue caption links, muted dates and an engraved rule between rows, with
 * no card, radius or fill. It sits in the normal flow right after
 * HubPageSummary, below the fixed full-screen console, in every branch. The
 * items and their ItemList JSON-LD are the ones the shared public listing
 * (src/components/seo/PublicFeedListing.js) carries; nothing renders when the
 * server read returned null or nothing.
 */
function ReelsListing({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const schema = reelsItemListSchema(items);
  return (
    <section className={styles.feedListing} aria-labelledby="reels-listing">
      {schema ? (
        <Head>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
          />
        </Head>
      ) : null}
      <h2 id="reels-listing" className={styles.feedListingTitle}>
        Latest Reels
      </h2>
      <ol className={styles.feedListingList}>
        {items.map((reel) => (
          <li key={reel.id} className={`${styles.comment} ${styles.feedListingItem}`}>
            <Link href={reel.href} className={styles.link}>
              {reel.caption}
            </Link>
            <time dateTime={reel.createdAt} className={`${styles.copy} ${styles.muted}`}>
              {formatListingDate(reel.createdAt)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Ids the canonical Reels reader admits for the public feed, or null.
 *
 * readPokerReelsFeed (src/lib/server/reelsFeed.js) is the same fail-closed
 * reader behind /api/reels/feed that the browser feed uses: poker topics
 * only, ready playback, fresh verified availability and the confirmed-failure
 * quarantine. A failure, a timeout or an empty answer yields null, so no
 * listing is rendered rather than an unverified one.
 */
async function readCanonicalCrawlerReelIds() {
  const result = await withDeadline(
    readPokerReelsFeed({ limit: FEED_LISTING_LIMIT, sort: 'recent', scope: 'all' }),
    FEED_LISTING_TIMEOUT_MS,
    null
  );
  if (!result || !Array.isArray(result.data)) return null;
  const ids = result.data.map((row) => row?.id).filter((id) => typeof id === 'string' && id);
  return ids.length ? new Set(ids) : null;
}

/** Only ever narrows: an item is kept when the canonical reader admitted its id. */
function admitCanonicalReels(items, canonicalIds) {
  if (!Array.isArray(items) || !(canonicalIds instanceof Set)) return null;
  const admitted = items.filter((item) => canonicalIds.has(item?.id));
  return admitted.length ? admitted : null;
}

/**
 * The latest public reels, read on the server so the HTML carries them
 * (AEO, 2026-09-22: a non-JavaScript crawler saw 105 words and no reels).
 * Anonymous client, row limit and deadline live in publicFeedData.js, so
 * nothing a signed-out visitor cannot read reaches the HTML. A reel is then
 * listed only if the canonical reader admits it too, so a private, off-topic
 * (slots), unverified or quarantined reel never reaches the server HTML. On
 * any failure reelsListing is null and the page renders without a listing.
 */
export async function getServerSideProps({ res }) {
  feedListingCacheHeaders(res);
  const canonicalIds = readCanonicalCrawlerReelIds().catch(() => null);
  const publicListing = await fetchPublicReelsListing();
  const reelsListing = admitCanonicalReels(publicListing, await canonicalIds);
  return { props: { reelsListing } };
}

export default function ReelsPage({ reelsListing = null }) {
  const [reels, setReels] = useState([]);
  const reelsCursorRef = useRef(null);
  const reelsRequestGuardRef = useRef(null);
  const commentRequestGuardRef = useRef(null);
  const activeCommentReelIdRef = useRef(null);
  if (!reelsRequestGuardRef.current) reelsRequestGuardRef.current = createLatestRequestGuard();
  if (!commentRequestGuardRef.current) commentRequestGuardRef.current = createLatestRequestGuard();
  // Background refresh plumbing (realtime changes, tab focus). See
  // src/lib/reelsRealtimeRefresh.mjs for the policy.
  const loadReelsRef = useRef(null);
  const reelsRefreshCoordinatorRef = useRef(null);
  if (!reelsRefreshCoordinatorRef.current) {
    reelsRefreshCoordinatorRef.current = createReelsRefreshCoordinator(reelsRequestGuardRef.current);
  }
  const backgroundReelsRefreshTimerRef = useRef(null);
  const staleReelIdsRef = useRef(new Set());
  const reelRealtimeFilterRef = useRef(null);
  if (!reelRealtimeFilterRef.current) reelRealtimeFilterRef.current = createReelRealtimeChangeFilter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const loadErrorRef = useRef(null);
  loadErrorRef.current = loadError;
  // Every navigation starts muted so browser autoplay is deterministic. Sound
  // can be restored only inside a fresh user gesture; carrying an unmuted value
  // across reloads causes Chrome/Safari to leave the first reel paused.
  const [muted, setMuted] = useState(true);
  // Persist the in-session control state for diagnostics and UI continuity,
  // but never use it to bypass the cold-start autoplay requirement above.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    safeSetReelsLocalStorage('sp:reels:muted', muted ? '1' : '0');
  }, [muted]);
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
    readReelsSessionFlag('sp:reels:interacted')
  );
  // Stricter than userInteractedRef: only true when a gesture happened on
  // THIS page load. Browsers gate autoplay-with-sound per-document; the
  // sessionStorage-backed userInteractedRef can be true on reload without
  // any fresh gesture. YT iframe unMute postMessage is silently rejected
  // in that state. Use this ref for slot-transition setMuted(false) gates
  // so React state never lies about being unmuted while YT is muted.
  const userGesturedThisLoadRef = useRef(false);
  // SOUND-AUTOPLAY FIX (2026-05-11): tracks the YouTube videoId we already
  // pre-loaded + unMuted inside the most recent gesture event tick. When the
  // currentIndex change useEffect later runs to load the SAME video, it
  // skips its mute-pivot (which would re-mute the player) and only fires
  // the safety-net retry timers. Without this coordination, every swipe
  // re-muted what the gesture had just unmuted → user heard nothing → had
  // to tap to unmute again. Reset to null after the useEffect honors it.
  const lastLoadedVideoIdRef = useRef(null);
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
  const activeUserIdRef = useRef(null);
  const accountScopeRef = useRef(null);
  if (!accountScopeRef.current) accountScopeRef.current = createReelAccountScope();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpenRef = useRef(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [savedReels, setSavedReels] = useState(new Set());
  const savedTargetsByReelRef = useRef(new Map());
  const [showHeart, setShowHeart] = useState(false);
  const [ttsOverlay, setTtsOverlay] = useState(null); // Train This Spot in-place overlay { ctx, games }
  // Age-restricted / errored YouTube video detection
  const [ytError, setYtError] = useState(null); // { code, videoId } when current reel has a YT error
  const [slideDirection, setSlideDirection] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(null);
  const [viewCounts, setViewCounts] = useState({});
  const [videoProgress, setVideoProgress] = useState(0);
  const viewedReelsRef = useRef(new Set());
  const autoUnmuteRetryTimersRef = useRef([]); // Cancelled on every reel change — prevents stale-iframe postMessage
  const playVideoOnLoadTimersRef = useRef([]); // Cancelled on every reel change — prevents premature playVideo to new iframe
  const [refreshing, setRefreshing] = useState(false);
  // #4 Not Interested - persist disliked reel IDs in localStorage
  const [notInterestedIds, setNotInterestedIds] = useState(loadNotInterestedReelIds);
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
  // Stall watchdog: when a native <video> reaches loadedmetadata or playing,
  // we clear this timer. If neither fires within 6s of the reel becoming
  // active, we treat it as a broken/undecodable URL (most often HEVC on
  // Chrome desktop which silently hangs without firing onError) and
  // auto-advance to the next reel. Mirrors the YouTube error overlay's
  // 3s skip — the user never gets stuck on a black screen.
  const videoStallTimerRef = useRef(null);
  // Session-scoped skip set: any video URL whose decode failed (or stalled
  // past the watchdog) is added here so loadReels filters it out on next
  // refresh and the user never sees the same broken reel twice in this tab.
  const brokenUrlsRef = useRef(new Set());
  // Phase 10 - Universal HUD auto-hide (5s timeout for usability)
  const [showOverlay, setShowOverlay] = useState(false);
  const hudTimerRef = useRef(null);
  const scheduleHudHide = () => {
    clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      if (menuOpenRef.current) return;
      setShowOverlay(false);
      setShowReactionPicker(false);
      setShowMoreMenu(false);
    }, 5000);
  };
  const revealOverlay = () => {
    setShowOverlay(true);
    setShowReactionPicker(false);
    setShowMoreMenu(false);
    scheduleHudHide();
  };
  const handleCommandMenuOpenChange = (open) => {
    menuOpenRef.current = open;
    setMenuOpen(open);
    clearTimeout(hudTimerRef.current);
    setShowOverlay(true);
    if (!open) scheduleHudHide();
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
    setWatchedReelIds(loadWatchedReelIds(activeUserIdRef.current));
  }, []);

  // Reels preferences state
  const [preferences, setPreferences] = useState({
    autoplay: true,
    soundOnScroll: true,
    dataSaver: false,
    showCaptions: true,
  });
  // Preferences are read from localStorage after hydration. Media must not
  // start before that read completes or a saved "autoplay off" choice can be
  // ignored for the first reel.
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  // Sound is ALWAYS on by default — user requirement: never muted on load.
  // Users can manually mute during a session, but next visit starts fresh with sound on.

  const clearAccountOwnedState = useCallback(() => {
    reelsRequestGuardRef.current?.abort();
    commentRequestGuardRef.current?.abort();
    setLiked({});
    setDisliked({});
    setFollowing({});
    setSavedReels(new Set());
    savedTargetsByReelRef.current = new Map();
    setWatchedReelIds(loadWatchedReelIds(activeUserIdRef.current));
    setNotInterestedIds(loadNotInterestedReelIds(activeUserIdRef.current));
    setCommentLikes({});
    setCommentLikeCounts({});
    setCommentText('');
    setComments([]);
    setReplyTo(null);
    setEditingComment(null);
    setEditCommentText('');
    setCommentMediaUrl(null);
    setCommentMediaType(null);
    setShowGifPicker(false);
    setShowCommentPanel(false);
    setShowReactionPicker(false);
    setShowMoreMenu(false);
    setShowShareModal(false);
    setShowShareDescriptionModal(false);
    setShareDescription('');
    setSharingToFeed(false);
    setSharedToFeed(false);
    setShowReportModal(false);
    setReportReason('');
    setReportSubmitted(false);
    setSubmittingComment(false);
    setUploadingImage(false);
    likeDebounceRef.current = false;
  }, []);

  const bindAuthUser = useCallback((nextUser) => {
    const next = nextUser?.id ? nextUser : null;
    const binding = accountScopeRef.current.bind(next?.id);
    activeUserIdRef.current = next?.id || null;
    if (binding.changed) clearAccountOwnedState();
    setUser(next);
  }, [clearAccountOwnedState]);

  // React to both same-tab Supabase transitions and cross-tab storage changes.
  // The owner ref changes before React paints, so no late A response can reach B.
  useEffect(() => {
    bindAuthUser(getAuthUser());
    const handleStorage = (event) => {
      if (event.key !== 'smarter-poker-auth'
        && !(event.key?.startsWith('sb-') && event.key?.endsWith('-auth-token'))) return;
      bindAuthUser(event.key === 'smarter-poker-auth' && !event.newValue ? null : getAuthUser());
    };
    window.addEventListener('storage', handleStorage);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      bindAuthUser(event === 'SIGNED_OUT' ? null : session?.user || getAuthUser());
    });
    return () => {
      window.removeEventListener('storage', handleStorage);
      subscription?.unsubscribe();
    };
  }, [bindAuthUser]);

  // Reels preferences are account-scoped and local-first. Clear A's values
  // while B loads; a rejected B read falls back to the safe defaults.
  useEffect(() => {
    const ownerRequest = accountScopeRef.current.capture(user?.id);
    let cancelled = false;
    setPreferencesLoaded(false);
    setPreferences({ autoplay: true, soundOnScroll: true, dataSaver: false, showCaptions: true });
    reelsPreferences.get(ownerRequest.ownerId).then((prefs) => {
      if (!cancelled && ownerRequest.isCurrent()) setPreferences(prefs);
    }).catch((error) => {
      if (!cancelled && ownerRequest.isCurrent()) {
        console.warn('[Reels] Could not load preferences:', error?.message || error);
      }
    }).finally(() => {
      if (!cancelled && ownerRequest.isCurrent()) setPreferencesLoaded(true);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  // Interaction and follow truth are scoped to the currently loaded Reels.
  // The canonical saved API resolves historical loser/post aliases before the
  // UI decides whether the displayed winner is saved.
  useEffect(() => {
    if (!user?.id || reels.length === 0) {
      setLiked({});
      setDisliked({});
      setFollowing({});
      setSavedReels(new Set());
      savedTargetsByReelRef.current = new Map();
      return undefined;
    }
    const ownerRequest = accountScopeRef.current.capture(user.id);
    let cancelled = false;
    const controller = new AbortController();
    Promise.all([
      loadReelInteractionState(supabase, user.id, reels, {
        loadSavedReels: (ownerId, reelIds, options) => savedReelsService.getSavedReelsForIds(ownerId, reelIds, options),
        signal: controller.signal,
      }),
      loadReelFollowState(supabase, user.id, normaliseReelAuthorIds(reels)),
    ]).then(([interactionState, followState]) => {
      if (cancelled || !ownerRequest.isCurrent()) return;
      setLiked(interactionState.liked);
      setDisliked(interactionState.disliked);
      setFollowing(followState);
      setSavedReels(new Set(Object.keys(interactionState.saved)));
      savedTargetsByReelRef.current = new Map(Object.entries(interactionState.savedTargets));
    }).catch((error) => {
      if (cancelled || !ownerRequest.isCurrent() || error?.name === 'AbortError') return;
      console.warn('[Reels] Interaction hydration failed:', error?.message || error);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reels, user?.id]);

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

  // On every reel change: load the new YouTube video into the persistent iframe
  // (no remount — use loadVideoById postMessage) and retry playVideo.
  // Keyed on the active Reel's identity and playback address, never on the
  // array length: a background merge or an appended page must not restart
  // the Reel that is already playing.
  const activeReelId = reels[currentIndex]?.id || null;
  const activeReelVideoUrl = reels[currentIndex]?.video_url || null;
  useEffect(() => {
    if (!preferencesLoaded || loading || reels.length === 0) return;
    const reel = reels[currentIndex];
    if (!reel) return;
    const ytId = getYouTubeVideoId(reel.video_url);

    // Cancel previous retry batch before scheduling new one
    playVideoOnLoadTimersRef.current.forEach((t) => clearTimeout(t));
    playVideoOnLoadTimersRef.current = [];

    if (ytId) {
      // GESTURE COORDINATION (2026-05-11 — fixes "press play for sound on 90%
      // of videos"): if the wheel/touch/key gesture handler already loaded
      // this same video INSIDE its gesture-event tick, skip the mute-pivot
      // (which would re-mute what the gesture just unMuted) and only schedule
      // the safety-net retry timers. Chrome's transient activation window
      // expires before this useEffect runs (~120ms+ later via setTimeout +
      // setCurrentIndex + re-render), so an unMute fired from here is
      // rejected by YT. The gesture-handler path keeps the unMute inside
      // the activation window, which Chrome honors.
      const alreadyLoadedInGesture = lastLoadedVideoIdRef.current === ytId;
      const wantsSoundAtSwipe = preferences.soundOnScroll && userWantsSoundRef.current;

      if (!alreadyLoadedInGesture) {
        // No-gesture path (auto-advance: YT video-ended, ytError 3s skip,
        // stall watchdog). Mute the player BEFORE loadVideoById so the
        // new video boots muted (Chrome unconditionally allows muted
        // autoplay). The 200ms retry below tries to unMute — will succeed
        // if the document has high Media Engagement Index, otherwise
        // YT keeps it muted but at least the video plays.
        if (wantsSoundAtSwipe) sendYouTubeCommand('mute');
        sendYouTubeCommand(preferences.autoplay ? 'loadVideoById' : 'cueVideoById', [
          { videoId: ytId, startSeconds: 0 },
        ]);
      } else {
        // Gesture-handler already issued loadVideoById + unMute. Don't
        // re-mute. Clear the marker so a subsequent same-video re-render
        // (e.g., a hot-reload) doesn't suppress correct behavior.
        lastLoadedVideoIdRef.current = null;
      }

      // Retry playVideo + unMute — YT API may not be ready immediately after loadVideoById.
      // The unMute fires AFTER playVideo so Chrome sees an already-playing video.
      // For the gesture path, these retries reinforce the unMute YT already
      // accepted; for the non-gesture path, they're a best-effort attempt.
      if (preferences.autoplay) {
        playVideoOnLoadTimersRef.current = [200, 500, 1000, 2000].map((delay) =>
          setTimeout(() => {
            sendYouTubeCommand('playVideo');
            if (wantsSoundAtSwipe) {
              sendYouTubeCommand('unMute');
              sendYouTubeCommand('setVolume', [100]);
            }
            autoUnmute();
          }, delay)
        );
      } else {
        sendYouTubeCommand('pauseVideo');
      }
      // Pause native video if it was playing (switching FROM native TO YouTube)
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    } else {
      // Native video — pause YouTube first to prevent audio bleed
      sendYouTubeCommand('pauseVideo');
    }

    setIsPaused(true); // reset — actual play state set by onPlay / onStateChange
    setYtReady(false); // suppress phantom play button during autoplay startup
    setYtError(null);

    return () => {
      playVideoOnLoadTimersRef.current.forEach((t) => clearTimeout(t));
      playVideoOnLoadTimersRef.current = [];
      autoUnmuteRetryTimersRef.current.forEach((t) => clearTimeout(t));
      autoUnmuteRetryTimersRef.current = [];
    };
  }, [activeReelId, activeReelVideoUrl, loading, preferences.autoplay, preferences.soundOnScroll, preferencesLoaded]);

  const handleUnmute = () => {
    sendYouTubeCommand('unMute');
    sendYouTubeCommand('setVolume', [100]);
    setMuted(false);
    setUserWantsSound(true);
    // Save preference to localStorage
    if (typeof window !== 'undefined') {
      safeSetReelsLocalStorage('reels-sound-enabled', 'true');
      saveAppSetting('reels_sound_enabled', true, 'reels-sound-enabled');
    }
  };

  const handleMute = () => {
    sendYouTubeCommand('mute');
    setMuted(true);
    setUserWantsSound(false);
    if (typeof window !== 'undefined') {
      safeSetReelsLocalStorage('reels-sound-enabled', 'false');
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
    // A session flag survives navigation, but browser media activation does
    // not. Only unmute after a gesture in this document or Chrome/Safari can
    // pause an otherwise valid muted autoplay during cold start.
    if (!userGesturedThisLoadRef.current) return;
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
          safeSetReelsSessionStorage('sp:reels:interacted', '1');
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
  }, [router.isReady, router.query.feed, router.query.id]);

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

  const loadReels = useCallback(async (mode) => {
    // A BACKGROUND refresh never shows the loading console, resets the cursor
    // or moves the active Reel: it merges into the mounted feed. It never
    // supersedes an unresolved foreground load; it runs once that load settles.
    const background = mode === BACKGROUND_REELS_REFRESH;
    // An error console is resolved by an explicit retry, not by a quiet refresh.
    if (background && loadErrorRef.current && !reelsRef.current.length) return;
    // Sequenced over the latest-request guard; null means this background
    // refresh was queued behind an unresolved foreground load.
    const reelsRequest = reelsRefreshCoordinatorRef.current.begin({ background });
    if (!reelsRequest) return;
    // Either kind of full refresh supersedes an unresolved append.
    setLoadingMore(false);
    if (!background) {
      setLoading(true);
      setLoadError(null);
      setLoadMoreError(null);
      setHasMore(true);
      reelsCursorRef.current = null;
    }
    const initialId = Array.isArray(router.query.id) ? router.query.id[0] : router.query.id;
    const deepLinkRequest = { id: initialId };
    try {
      const feedMode = ['following', 'trending'].includes(String(router.query.feed))
        ? String(router.query.feed)
        : 'foryou';
      const authUser = feedMode === 'following' ? getAuthUser() : null;
      if (feedMode === 'following' && !authUser?.id) {
        setReels([]);
        setCurrentIndex(0);
        setHasMore(false);
        return;
      }
      const mapFeedReel = (video) => ({
        ...video,
        source: 'reels',
        profiles: video.profiles || { username: 'Anonymous' },
      });
      const payload = await scanReelsContinuations({
        fetchPage: (cursor, pageNumber) => fetchPokerReels({
          limit: 120,
          cursor,
          // The deep-linked Reel is pinned only by a foreground load; a
          // background refresh reads the natural window it merges into.
          id: pageNumber === 1 && !background ? deepLinkRequest.id || null : null,
          sort: feedMode === 'trending' ? 'popular' : 'recent',
          signal: reelsRequest.signal,
          scope: feedMode === 'following' ? 'following' : 'standalone',
          accessToken: feedMode === 'following' ? getAccessToken() : null,
        }),
        selectRows: (rows) => {
          const mappedReels = rows.map(mapFeedReel);
          const fresh = mappedReels.filter((reel) => !notInterestedIds.has(reel.id));
          const stale = mappedReels.filter((reel) => notInterestedIds.has(reel.id));
          if (initialId) {
            const targetIdx = fresh.findIndex((reel) => (
              reel.id === initialId || reel.source_post_id === initialId
            ));
            if (targetIdx > 0) fresh.unshift(fresh.splice(targetIdx, 1)[0]);
            else if (targetIdx === -1) {
              const staleIdx = stale.findIndex((reel) => (
                reel.id === initialId || reel.source_post_id === initialId
              ));
              if (staleIdx !== -1) fresh.unshift(stale.splice(staleIdx, 1)[0]);
            }
          }
          const broken = brokenUrlsRef.current;
          return [...fresh, ...stale].filter((reel) => !broken.has(reel.video_url));
        },
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
              sort: feedMode === 'trending' ? 'popular' : 'recent',
              signal: reelsRequest.signal,
              scope: feedMode === 'following' ? 'following' : 'standalone',
              accessToken: feedMode === 'following' ? getAccessToken() : null,
            })).data.map(mapFeedReel),
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
          cc = {},
          vc = {};
        merged.additions.forEach((r) => {
          lc[r.id] = r.like_count || 0;
          cc[r.id] = r.comment_count || 0;
          vc[r.id] = r.view_count || 0;
        });
        setLikeCounts((prev) => ({ ...lc, ...prev }));
        setCommentCounts((prev) => ({ ...cc, ...prev }));
        setViewCounts((prev) => ({ ...vc, ...prev }));
        return;
      }
      reelsCursorRef.current = payload.next_cursor || null;
      setHasMore(Boolean(payload.next_cursor));
      const finalReels = payload.data;

      if (finalReels.length > 0) {
        if (initialId) setCurrentIndex(0);
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
      } else {
        setReels([]);
        setCurrentIndex(0);
      }
    } catch (e) {
      if (e?.name === 'AbortError' || !reelsRequest.isCurrent()) return;
      if (background) {
        // A failed quiet refresh leaves the mounted feed and player untouched.
        console.warn('Background reels refresh failed:', e?.message || e);
        return;
      }
      console.warn('Load reels error:', e);
      setReels([]);
      setLoadError(
        initialId && [400, 404, 410].includes(e?.status) ? 'unavailable' : 'network',
      );
    } finally {
      const settled = reelsRefreshCoordinatorRef.current.settle(reelsRequest);
      if (settled.current && !background) setLoading(false);
      if (settled.flushQueued) scheduleBackgroundReelsRefresh();
    }
  }, [notInterestedIds, router.query.feed, router.query.id, scheduleBackgroundReelsRefresh]);
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
  // Applied once per deep-link id: a later background merge or appended page
  // changes reels.length and must not pull the viewer back to the target.
  const deepLinkAppliedRef = useRef(null);
  useEffect(() => {
    if (!router.query.id || reels.length === 0) return;
    if (deepLinkAppliedRef.current === router.query.id) return;
    const targetIdx = reels.findIndex(
      (r) => r.id === router.query.id || r.source_post_id === router.query.id
    );
    if (targetIdx === -1) return;
    deepLinkAppliedRef.current = router.query.id;
    if (targetIdx !== currentIndex) {
      // Both legacy Reel IDs and post IDs are resolved by the canonical API.
      setCurrentIndex(targetIdx);
    }
  }, [reels.length, router.query.id]);

  const currentReel = reels[currentIndex];
  activeCommentReelIdRef.current = currentReel?.id || null;

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
  }, [currentReel?.id, user?.id]);

  // ─── Stall watchdog ────────────────────────────────────────────────────
  // For NATIVE video reels only (YouTube iframes have their own onError +
  // 3s auto-skip overlay): start a 6s timer when the reel becomes active.
  // If the <video> element doesn't reach readyState >= 2 (HAVE_CURRENT_DATA)
  // by then, treat as broken/undecodable and auto-advance to the next reel.
  // The onPlaying / onLoadedMetadata handlers clear this timer on success.
  // Catches HEVC silent-hang on Chrome desktop, broken/corrupt MP4s, and
  // dead Supabase Storage URLs — none of which fire onError reliably.
  useEffect(() => {
    if (!currentReel?.id) return;
    const url = currentReel?.video_url || '';
    // Only run for native video; YT iframe path skips this watchdog.
    // Only run for native video; YT iframe path skips this watchdog.
    // getYouTubeVideoId returns truthy ID for any YT URL, null otherwise —
    // semantically equivalent to isYouTubeUrl which this file does not
    // define (that helper lives in src/components/social/Reels.jsx).
    if (!url || getYouTubeVideoId(url)) return;
    if (videoStallTimerRef.current) clearTimeout(videoStallTimerRef.current);
    videoStallTimerRef.current = setTimeout(() => {
      videoStallTimerRef.current = null;
      const v = videoRef.current;
      // Only auto-skip if video genuinely hasn't loaded any data.
      // readyState >= 2 means HAVE_CURRENT_DATA or better — we have at
      // least one frame, so it's playable.
      if (v && v.readyState < 2) {
        console.warn('[Reels] video stall watchdog tripped - auto-skipping', {
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
  }, [currentReel?.id, currentReel?.video_url]);

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
    if (
      currentIndex >= reels.length - 3
      && hasMore
      && !loadingMore
      && !loadMoreError
      && reels.length > 0
    ) {
      loadMoreReels();
    }
  }, [currentIndex, reels.length, hasMore, loadingMore, loadMoreError]);

  const loadMoreReels = async () => {
    if (loadingMore || !hasMore || !reelsCursorRef.current) return;
    const reelsRequest = reelsRequestGuardRef.current.begin({ append: true });
    if (!reelsRequest) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const feedMode = ['following', 'trending'].includes(String(router.query.feed))
        ? String(router.query.feed)
        : 'foryou';
      const existingIds = new Set(reels.map((reel) => reel.id));
      const existingUrls = new Set(reels.map((reel) => reel.video_url).filter(Boolean));
      const seenUrlsThisScan = new Set();
      const payload = await scanReelsContinuations({
        cursor: reelsCursorRef.current,
        fetchPage: (cursor) => fetchPokerReels({
          limit: 60,
          cursor,
          sort: feedMode === 'trending' ? 'popular' : 'recent',
          signal: reelsRequest.signal,
          scope: feedMode === 'following' ? 'following' : 'standalone',
          accessToken: feedMode === 'following' ? getAccessToken() : null,
        }),
        selectRows: (rows) => rows
          .map((reel) => ({
            ...reel,
            source: 'reels',
            profiles: reel.profiles || { username: 'Anonymous' },
          }))
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
      const mappedFiltered = payload.data;

      if (mappedFiltered.length === 0) {
        if (payload.next_cursor) {
          setLoadMoreError('More Reels remain beyond filtered results. Continue when ready.');
        }
      } else {
        setReels((prev) => mergePokerReels(prev, mappedFiltered));
        const lc = {},
          cc = {},
          vc = {};
        mappedFiltered.forEach((reel) => {
          lc[reel.id] = reel.like_count || 0;
          cc[reel.id] = reel.comment_count || 0;
          vc[reel.id] = reel.view_count || 0;
        });
        setLikeCounts((prev) => ({ ...prev, ...lc }));
        setCommentCounts((prev) => ({ ...prev, ...cc }));
        setViewCounts((prev) => ({ ...prev, ...vc }));
      }
    } catch (e) {
      if (e?.name === 'AbortError' || !reelsRequest.isCurrent()) return;
      console.warn('Load more error:', e);
      // Preserve the cursor but gate automatic retries. Without this state the
      // near-end effect immediately retriggered after every failed request,
      // creating a tight request loop during an outage.
      setLoadMoreError('More Reels could not be loaded.');
      showErrorToast('More Reels could not be loaded. Tap Retry when you are ready.');
    } finally {
      if (reelsRequest.finish()) setLoadingMore(false);
    }
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
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!currentReel?.id) return;
    if (!ownerRequest.ownerId) return showErrorToast('Sign in to like reels');
    if (!ownerRequest.isCurrent()) return;
    const ownerId = ownerRequest.ownerId;
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
        const { error: err_social_likes_061sa } = await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', ownerId)
          .eq('reaction_type', 'dislike');
        if (err_social_likes_061sa) throw err_social_likes_061sa;
        if (!ownerRequest.isCurrent()) return;
      } catch (e) {
        if (!ownerRequest.isCurrent()) return;
        setDisliked((prev) => ({ ...prev, [postId]: true }));
        setLiked((prev) => ({ ...prev, [postId]: wasLiked }));
        setLikeCounts((prev) => ({
          ...prev,
          [postId]: Math.max(0, (prev[postId] || 0) + (wasLiked ? 1 : -1)),
        }));
        showErrorToast('Like failed - try again');
        return;
      }
    }

    try {
      if (wasLiked) {
        // DB trigger (trig_sync_like_count) handles like_count decrement atomically - no RPC needed
        const { error: err_social_likes_sz3lr } = await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', ownerId)
          .eq('reaction_type', 'like');
        if (err_social_likes_sz3lr) throw err_social_likes_sz3lr;
        if (!ownerRequest.isCurrent()) return;
        busEmit.socialPostLiked(postId, ownerId, { added: false, reactionType: 'like' });
      } else {
        // DB trigger (trig_sync_like_count) handles like_count increment atomically - no RPC needed
        const { error: err_social_likes_3qvxx } = await supabase
          .from('social_likes')
          .insert({ post_id: postId, user_id: ownerId, reaction_type: 'like' });
        if (err_social_likes_3qvxx) throw err_social_likes_3qvxx;
        if (!ownerRequest.isCurrent()) return;
        busEmit.socialPostLiked(postId, ownerId, { added: true, reactionType: 'like' });
      }
    } catch (err) {
      if (!ownerRequest.isCurrent()) return;
      setLiked((prev) => ({ ...prev, [postId]: wasLiked }));
      setLikeCounts((prev) => ({
        ...prev,
        [postId]: Math.max(0, (prev[postId] || 0) + (wasLiked ? 1 : -1)),
      }));
      showErrorToast('Like failed \u2014 try again');
    }
  };

  const handleDislike = async () => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!currentReel?.id || !ownerRequest.ownerId || !ownerRequest.isCurrent()) return;
    const ownerId = ownerRequest.ownerId;
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
        const { error: err_social_likes_fmb7o } = await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', ownerId)
          .eq('reaction_type', 'like');
        if (err_social_likes_fmb7o) throw err_social_likes_fmb7o;
        if (!ownerRequest.isCurrent()) return;
      } catch (e) {
        if (!ownerRequest.isCurrent()) return;
        setLiked((prev) => ({ ...prev, [postId]: true }));
        setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
        setDisliked((prev) => ({ ...prev, [postId]: wasDisliked }));
        showErrorToast('Dislike failed - try again');
        return;
      }
    }
    try {
      if (wasDisliked) {
        const { error: err_social_likes_gsc1r } = await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', ownerId)
          .eq('reaction_type', 'dislike');
        if (err_social_likes_gsc1r) throw err_social_likes_gsc1r;
        if (!ownerRequest.isCurrent()) return;
        // #4 Not Interested - remove from filter
        setNotInterestedIds((prev) => {
          const n = new Set(prev);
          n.delete(postId);
          return persistNotInterestedReelIds(n, ownerId);
        });
      } else {
        const { error: err_social_likes_xk2a9 } = await supabase
          .from('social_likes')
          .insert({ post_id: postId, user_id: ownerId, reaction_type: 'dislike' });
        if (err_social_likes_xk2a9) throw err_social_likes_xk2a9;
        if (!ownerRequest.isCurrent()) return;
        // #4 Not Interested - add to filter
        setNotInterestedIds((prev) => {
          const n = new Set(prev);
          n.add(postId);
          return persistNotInterestedReelIds(n, ownerId);
        });
      }
    } catch {
      if (!ownerRequest.isCurrent()) return;
      setDisliked((prev) => ({ ...prev, [postId]: wasDisliked }));
      showErrorToast('Dislike failed - try again');
    }
  };

  const handleFollow = async () => {
    const authorId = currentReel?.author_id || currentReel?.profiles?.id;
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!authorId || authorId === ownerRequest.ownerId) return;
    if (!ownerRequest.ownerId) return showErrorToast('Sign in to follow players');
    if (!ownerRequest.isCurrent()) return;
    const ownerId = ownerRequest.ownerId;
    const wasFollowing = following[authorId];
    setFollowing((prev) => ({ ...prev, [authorId]: !wasFollowing }));
    haptic(wasFollowing ? 5 : 15);
    try {
      if (wasFollowing) {
        const { error: err_social_follows_gan5p } = await supabase
          .from('social_follows')
          .delete()
          .eq('follower_id', ownerId)
          .eq('following_id', authorId);
        if (err_social_follows_gan5p) throw err_social_follows_gan5p;
      } else {
        const { error: err_social_follows_n962e } = await supabase.from('social_follows').insert({
          follower_id: ownerId,
          following_id: authorId,
        });
        if (err_social_follows_n962e) throw err_social_follows_n962e;
      }
      if (!ownerRequest.isCurrent()) return;
      busEmit.socialFollowChanged &&
        busEmit.socialFollowChanged(authorId, ownerId, { added: !wasFollowing });
    } catch {
      if (!ownerRequest.isCurrent()) return;
      setFollowing((prev) => ({ ...prev, [authorId]: wasFollowing }));
      showErrorToast('Follow failed \u2014 try again');
    }
  };

  const handleReport = async () => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!currentReel?.id || !ownerRequest.ownerId || !ownerRequest.isCurrent() || !reportReason.trim()) return;
    try {
      const { error } = await supabase.from('social_interactions').insert({
        user_id: ownerRequest.ownerId,
        post_id: currentReel.id,
        interaction_type: 'report',
        metadata: { reason: reportReason.trim() },
      });
      // AUDIT FIX: do NOT show success UI if the insert failed silently
      if (error) throw error;
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
      showErrorToast('Report failed \u2014 please try again');
    }
  };

  const handleCommentImageUpload = async (file) => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!file || !ownerRequest.ownerId || !ownerRequest.isCurrent()) return;
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
      if (resp.ok && result.success && ownerRequest.isCurrent()) {
        setCommentMediaUrl(result.url);
        setCommentMediaType('image');
      }
    } catch (err) {
      if (ownerRequest.isCurrent()) console.warn('[ReelComment] Upload error:', err);
    }
    if (ownerRequest.isCurrent()) setUploadingImage(false);
  };

  // Upload error toast state
  const [uploadErrorToast, setUploadErrorToast] = useState(false);

  const handleComment = async () => {
    if (!currentReel) return;
    const wasOpen = showCommentPanel;
    setShowCommentPanel((prev) => !prev);
    if (wasOpen) {
      commentRequestGuardRef.current.abort();
      return;
    }
    // Always fetch fresh comments when opening (not closing)
    const reelId = currentReel.id;
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    const commentRequest = commentRequestGuardRef.current.begin({ append: false });
    setCommentPage(0);
    setLoadingMoreComments(false);
    try {
        const { data, error } = await supabase
          .from('social_comments')
          .select(
            'id, content, created_at, media_url, media_type, profiles:author_id(username, avatar_url)'
          )
          .eq('post_id', reelId)
          .order('created_at', { ascending: commentSort === 'oldest' })
          .limit(50);
        if (error) throw error;
        if (!commentRequest.isCurrent() || !ownerRequest.isCurrent() || activeCommentReelIdRef.current !== reelId) return;
        setComments(data || []);
        setHasMoreComments((data || []).length >= 50);
        // #3 Don't overwrite server count when at page limit (could be 100+ comments)
        if ((data || []).length < 50) {
          setCommentCounts((prev) => ({ ...prev, [reelId]: (data || []).length }));
        }
        // #6 Load comment like counts (totals) AND current user's own likes
        try {
          const [clAllResult, clMyResult] = await Promise.all([
            // Total likes per comment (all users)
            supabase
              .from('social_interactions')
              .select('metadata')
              .eq('post_id', reelId)
              .eq('interaction_type', 'comment_like'),
            // BUG-R07 FIX: current user's own comment likes (for heart fill state)
            ownerRequest.ownerId
              ? supabase
                  .from('social_interactions')
                  .select('metadata')
                  .eq('post_id', reelId)
                  .eq('user_id', ownerRequest.ownerId)
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
          if (commentRequest.isCurrent() && ownerRequest.isCurrent() && activeCommentReelIdRef.current === reelId) {
            console.warn('[App] Handled exception:', e);
          }
        }
      } catch (e) {
        if (commentRequest.isCurrent() && ownerRequest.isCurrent() && activeCommentReelIdRef.current === reelId) {
          console.warn('Load comments:', e);
        }
      } finally {
        commentRequest.finish();
      }
  };

  // #6 Comment Pagination - Load More
  const loadMoreComments = async () => {
    if (!currentReel?.id || loadingMoreComments || !hasMoreComments) return;
    const commentRequest = commentRequestGuardRef.current.begin({ append: true });
    if (!commentRequest) return;
    const reelId = currentReel.id;
    setLoadingMoreComments(true);
    const nextPage = commentPage + 1;
    try {
      const { data, error } = await supabase
        .from('social_comments')
        .select(
          'id, content, created_at, media_url, media_type, profiles:author_id(username, avatar_url)'
        )
        .eq('post_id', reelId)
        .order('created_at', { ascending: commentSort === 'oldest' })
        .range(nextPage * 50, (nextPage + 1) * 50 - 1);
      if (error) throw error;
      if (!commentRequest.isCurrent() || activeCommentReelIdRef.current !== reelId) return;
      if (data && data.length > 0) {
        setComments((prev) => [...prev, ...data]);
        setCommentPage(nextPage);
        setHasMoreComments(data.length >= 50);
      } else {
        setHasMoreComments(false);
      }
    } catch (error) {
      if (commentRequest.isCurrent() && activeCommentReelIdRef.current === reelId) {
        console.warn('Load more comments:', error);
        setHasMoreComments(false);
      }
    } finally {
      if (commentRequest.finish()) setLoadingMoreComments(false);
    }
  };

  const submitComment = async () => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if ((!commentText.trim() && !commentMediaUrl) || !ownerRequest.ownerId || !ownerRequest.isCurrent() || !currentReel?.id) return;
    const reelId = currentReel.id;
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
      const payload = { post_id: reelId, author_id: ownerRequest.ownerId, content: text || '' };
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
      busEmit.socialCommentAdded && busEmit.socialCommentAdded(reelId, ownerRequest.ownerId);
      // DB trigger handles comment_count increment atomically
      setCommentCounts((prev) => ({ ...prev, [reelId]: (prev[reelId] || 0) + 1 }));
    } catch (err) {
      if (!ownerRequest.isCurrent()) return;
      console.error('[CommentInsert] Failed:', err?.message, err?.details, err?.hint);
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      showErrorToast('Comment failed - ' + (err?.message || 'try again'));
    }
    if (ownerRequest.isCurrent()) setSubmittingComment(false);
  };

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
        // BUG FIX: .match({ metadata: { comment_id } }) does full-object JSONB equality.
        // Use PostgREST JSON path filter .eq('metadata->>comment_id', id) instead.
        const { error: err_social_interactions_av320 } = await supabase
          .from('social_interactions')
          .delete()
          .eq('user_id', ownerRequest.ownerId)
          .eq('post_id', reelId)
          .eq('interaction_type', 'comment_like')
          .eq('metadata->>comment_id', commentId);
        if (err_social_interactions_av320) throw err_social_interactions_av320;
      } else {
        const { error: err_social_interactions_wvfm0 } = await supabase.from('social_interactions').insert({
          user_id: ownerRequest.ownerId,
          post_id: reelId,
          interaction_type: 'comment_like',
          metadata: { comment_id: commentId },
        });
        if (err_social_interactions_wvfm0) throw err_social_interactions_wvfm0;
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
  const handleDeleteComment = async (commentId) => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!ownerRequest.ownerId || !ownerRequest.isCurrent() || !currentReel?.id) return;
    const reelId = currentReel.id;
    const deletedIndex = comments.findIndex((comment) => comment.id === commentId);
    const deletedComment = deletedIndex >= 0 ? comments[deletedIndex] : null;
    setComments((c) => c.filter((x) => x.id !== commentId));
    try {
      const { error } = await supabase
        .from('social_comments')
        .delete()
        .eq('id', commentId)
        .eq('author_id', ownerRequest.ownerId);
      if (error) throw error;
      if (!ownerRequest.isCurrent()) return;
      // DB trigger handles comment_count decrement atomically
      setCommentCounts((p) => ({
        ...p,
        [reelId]: Math.max(0, (p[reelId] || 1) - 1),
      }));
      busEmit.socialCommentAdded &&
        busEmit.socialCommentAdded(reelId, ownerRequest.ownerId, { removed: true });
    } catch (error) {
      console.warn('[ReelsPage] Comment delete failed:', error?.message || error);
      if (!ownerRequest.isCurrent() || activeCommentReelIdRef.current !== reelId || !deletedComment) return;
      setComments((current) => {
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
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    if (!editCommentText.trim() || !ownerRequest.ownerId || !ownerRequest.isCurrent() || !currentReel?.id) return;
    const reelId = currentReel.id;
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
        .eq('author_id', ownerRequest.ownerId);
      if (error) throw error;
    } catch (error) {
      console.warn('[ReelsPage] Comment edit failed:', error?.message || error);
      if (ownerRequest.isCurrent() && activeCommentReelIdRef.current === reelId && orig) {
        setComments((prev) => prev.map((c) => (c.id === commentId ? orig : c)));
      }
    }
    if (ownerRequest.isCurrent()) setEditCommentText('');
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
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    const reel = currentReel;
    if (!reel?.id) return;
    setShowShareModal(false);
    const url = shareUrl;
    const title = `Check out this poker reel on Smarter.Poker`;
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
      if (platform !== 'copy') {
        incrementMetric(reel, 'share_count', 1);
      }
      if (ownerRequest.ownerId) busEmit.socialPostShared(reel.id, ownerRequest.ownerId);
    } catch (err) {
      if (!ownerRequest.isCurrent()) return;
      // AUDIT FIX: do NOT show 'Link Copied' toast on failures unrelated to clipboard.
      // navigator.share() throws AbortError on user-cancel (not an error) and
      // other errors on share failures. Only show the copy toast for actual copy failures.
      if (platform === 'copy') {
        showErrorToast('Copy failed - try again');
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
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    const reel = currentReel;
    if (!reel?.id || !ownerRequest.ownerId || !ownerRequest.isCurrent() || sharingToFeed) return;
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
      if (!res.ok) throw new Error(result.error || 'Share failed');
      if (!ownerRequest.isCurrent()) return;
      if (result.already_shared) {
        showErrorToast('Already shared this reel!');
      } else {
        incrementMetric(reel, 'share_count', 1);
        busEmit.socialPostShared(reel.id, ownerRequest.ownerId);
        busEmit.dataMutated('social');
      }
      setSharedToFeed(true);
      clearTimeout(sharedToFeedTimerRef.current);
      sharedToFeedTimerRef.current = setTimeout(() => {
        setSharedToFeed(false);
      }, 3000);
    } catch (err) {
      if (!ownerRequest.isCurrent()) return;
      console.error('[ShareToFeed] Failed:', err?.message || err);
      showErrorToast('Share failed - ' + (err?.message || 'try again'));
    }
    if (ownerRequest.isCurrent()) {
      setSharingToFeed(false);
      setShareDescription('');
    }
  };

  // Reset comment panel + media + report + share state when switching reels
  useEffect(() => {
    commentRequestGuardRef.current.abort();
    setShowCommentPanel(false);
    setComments([]);
    setLoadingMoreComments(false);
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
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    const reel = currentReel;
    if (!reel) return;
    if (!ownerRequest.ownerId) return showErrorToast('Sign in to save reels');
    if (!ownerRequest.isCurrent()) return;
    const isSaved = savedReels.has(reel.id);
    const previousTargets = savedTargetsByReelRef.current.get(reel.id) || [];
    // #1 Optimistic update - instant UI response
    if (isSaved) {
      setSavedReels((prev) => {
        const s = new Set(prev);
        s.delete(reel.id);
        return s;
      });
    } else {
      setSavedReels((prev) => new Set([...prev, reel.id]));
    }
    try {
      if (isSaved) {
        await savedReelsService.unsaveReel(
          ownerRequest.ownerId,
          previousTargets.length ? previousTargets : reel.id,
        );
        if (!ownerRequest.isCurrent()) return;
        savedTargetsByReelRef.current.delete(reel.id);
      } else {
        await savedReelsService.saveReel(ownerRequest.ownerId, reel.id, 'reel');
        if (!ownerRequest.isCurrent()) return;
        savedTargetsByReelRef.current.set(reel.id, [reel.id]);
      }
      try {
        busEmit.socialPostBookmarked(reel.id, ownerRequest.ownerId, { added: !isSaved });
      } catch (eventError) {
        console.warn('[Reels] Bookmark event failed:', eventError?.message || eventError);
      }
    } catch (err) {
      if (!ownerRequest.isCurrent()) return;
      // AUDIT FIX: rollback to the PRE-operation state, not unconditionally delete.
      // Old: always deleted from Set, which was wrong when save (not unsave) failed —
      // the optimistic add was reverted by deleting, but re-adding if isSaved was never handled.
      if (isSaved) {
        setSavedReels((prev) => new Set([...prev, reel.id])); // restore the saved state
      } else {
        setSavedReels((prev) => {
          const s = new Set(prev);
          s.delete(reel.id);
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

  // `/hub/reels?upload=1` is the public upload CTA used by the My Reels page.
  // Keep the deep-link functional instead of silently landing on the feed.
  useEffect(() => {
    if (!router.isReady || router.query.upload !== '1') return;
    setShowUploadModal(true);
  }, [router.isReady, router.query.upload]);

  const updatePreference = async (key, value) => {
    const ownerRequest = accountScopeRef.current.capture(activeUserIdRef.current);
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    try {
      // Storage is local-first, so guest choices must persist too.
      await reelsPreferences.update(ownerRequest.ownerId, newPrefs);
    } catch (error) {
      if (!ownerRequest.isCurrent()) return;
      setPreferences(preferences);
      showErrorToast('Preference could not be saved');
      console.warn('[Reels] Preference update failed:', error?.message || error);
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

      if (
        e.key === 'ArrowDown' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowLeft'
      ) {
        // GESTURE-CONTEXT FAST PATH (2026-05-11): same pattern as
        // handleTouchEnd + handleWheel — pre-load the next/prev reel and
        // unMute it inside this synchronous keydown event, before any
        // slideTo* setTimeout drops us out of Chrome's transient activation
        // window. Sets lastLoadedVideoIdRef so the useEffect skips its
        // mute-pivot and doesn't re-mute the player.
        const direction = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
        const nextIdx = currentIndexRef.current + direction;
        const nextReel = reelsRef?.current?.[nextIdx] || reels[nextIdx];
        const nextYtId = nextReel ? getYouTubeVideoId(nextReel.video_url) : null;
        if (
          preferencesRef.current.autoplay &&
          preferencesRef.current.soundOnScroll &&
          userWantsSoundRef.current
        ) {
          sendYouTubeCommand('unMute');
          sendYouTubeCommand('setVolume', [100]);
          setMuted(false);
          setUserWantsSound(true);
          if (nextYtId) {
            sendYouTubeCommand('loadVideoById', [{ videoId: nextYtId, startSeconds: 0 }]);
            sendYouTubeCommand('playVideo');
            sendYouTubeCommand('unMute');
            sendYouTubeCommand('setVolume', [100]);
            lastLoadedVideoIdRef.current = nextYtId;
          }
        }
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') slideToNextRef.current();
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') slideToPrevRef.current();
      // The command drawer owns Escape while it is open. Without this guard,
      // both window listeners run for the same keypress: the drawer closes and
      // Reels also navigates back to Social Media.
      if (e.key === 'Escape') {
        const commandMenu = document.querySelector('[data-world-command-menu="social-media"]');
        if (
          e.defaultPrevented
          || menuOpenRef.current
          || (commandMenu && window.getComputedStyle(commandMenu).visibility === 'visible')
        ) return;
        router.push('/hub/social-media');
      }
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
  // 2026-05-11: full reels array ref — the gesture-handler fast path
  // (handleTouchEnd / handleWheel / handleKey) needs to look up
  // reels[currentIndex ± 1] synchronously to pre-load the next video
  // inside the gesture activation window. The handlers are registered
  // once with deps=[], so they close over the INITIAL `reels` (empty)
  // — this ref keeps them at the latest array.
  const reelsRef = useRef(reels);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    reelsLengthRef.current = reels.length;
    reelsRef.current = reels;
  }, [reels]);

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
        // GESTURE-CONTEXT FAST PATH (2026-05-11): pre-load the NEXT reel and
        // unMute it INSIDE this synchronous gesture event, before the slide
        // animation's 120ms setTimeout drops us out of Chrome's transient
        // activation window. Without this, the useEffect's loadVideoById
        // ran ~120ms later — outside activation — and YT silently rejected
        // the unMute → 90% of swipes appeared muted with a play-button
        // overlay. The lastLoadedVideoIdRef tells the useEffect that this
        // video is already loaded so it won't re-mute.
        const direction = diff > 0 ? 1 : -1;
        const nextIdx = currentIndexRef.current + direction;
        const nextReel = reelsRef?.current?.[nextIdx] || reels[nextIdx];
        const nextYtId = nextReel ? getYouTubeVideoId(nextReel.video_url) : null;
        if (
          preferencesRef.current.autoplay &&
          preferencesRef.current.soundOnScroll &&
          userWantsSoundRef.current
        ) {
          // First unMute the current iframe (visible during the slide animation)
          sendYouTubeCommand('unMute');
          sendYouTubeCommand('setVolume', [100]);
          setMuted(false);
          setUserWantsSound(true);
          // Then pre-load + unMute the NEXT reel SYNCHRONOUSLY — same iframe,
          // same gesture tick, YT accepts the unMute because activation is live.
          if (nextYtId) {
            sendYouTubeCommand('loadVideoById', [{ videoId: nextYtId, startSeconds: 0 }]);
            sendYouTubeCommand('playVideo');
            sendYouTubeCommand('unMute');
            sendYouTubeCommand('setVolume', [100]);
            lastLoadedVideoIdRef.current = nextYtId; // useEffect will skip its mute-pivot
          }
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
      if (Math.abs(e.deltaY) > 30) {
        // GESTURE-CONTEXT FAST PATH (2026-05-11): same pattern as
        // handleTouchEnd — pre-load the NEXT reel and unMute it inside
        // this synchronous wheel-event tick, before the slideTo* setTimeout
        // drops us outside Chrome's transient activation window. The
        // useEffect on currentIndex will see lastLoadedVideoIdRef matches
        // and skip its mute-pivot so it doesn't re-mute the player.
        const direction = e.deltaY > 0 ? 1 : -1;
        const nextIdx = currentIndexRef.current + direction;
        const nextReel = reelsRef?.current?.[nextIdx] || reels[nextIdx];
        const nextYtId = nextReel ? getYouTubeVideoId(nextReel.video_url) : null;
        if (
          preferencesRef.current.autoplay &&
          preferencesRef.current.soundOnScroll &&
          userWantsSoundRef.current
        ) {
          sendYouTubeCommand('unMute');
          sendYouTubeCommand('setVolume', [100]);
          setMuted(false);
          setUserWantsSound(true);
          if (nextYtId) {
            sendYouTubeCommand('loadVideoById', [{ videoId: nextYtId, startSeconds: 0 }]);
            sendYouTubeCommand('playVideo');
            sendYouTubeCommand('unMute');
            sendYouTubeCommand('setVolume', [100]);
            lastLoadedVideoIdRef.current = nextYtId;
          }
        }
      }
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
            if (
              preferencesRef.current.autoplay &&
              preferencesRef.current.soundOnScroll &&
              userWantsSoundRef.current
            ) {
              autoUnmute();
              // Retry: iframe API sometimes isn't ready for unMute on first call
              autoUnmuteRetryTimersRef.current = [100, 300, 600].map((d) =>
                setTimeout(() => autoUnmute(), d)
              );
            } else {
              autoUnmuteRetryTimersRef.current = [];
            }
            setShowOverlay(true);
            scheduleHudHide();
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
          // Report to server (best-effort)
          try {
            const vid = iframeRef.current?.src ? getYouTubeVideoId(iframeRef.current.src) : null;
            if (vid) {
              reportFailureToServer(vid, errorCode, 'HubReels');
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

  // Realtime subscription. social_reels publishes every counter bump, the
  // signed-in viewer's own view recording included, so counter, like and view
  // updates are ignored here. Only a change that can alter playback or
  // eligibility (playback address or identity, visibility, deletion, topic,
  // media or rights status, or an INSERT/DELETE) acts: an explicitly
  // ineligible mounted Reel is removed at once, and everything else schedules
  // one debounced BACKGROUND refresh that merges into the mounted feed without
  // swapping the player for the loading console.
  useEffect(() => {
    if (!user?.id) return;
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
      .channel(`reels:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_reels' }, (payload) => {
        handleReelChange('INSERT', payload?.new);
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'social_reels' },
        (payload) => handleReelChange('UPDATE', payload?.new)
      )
      // BUG FIX (REELS-DELETE-1): when a user deletes a post from their
      // profile, /hub/user/[username].js cascades the delete into social_reels
      // (and a DB FK migration also makes the cascade structural). Without a
      // DELETE listener here, the deleted reel kept playing in /hub/reels until
      // the next full reload. Subscribe and filter the reel out of state.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'social_reels' },
        (payload) => handleReelChange('DELETE', payload?.old)
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
          removeMountedReels((reel) => reel.source_post_id === postId);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(_ch);
    };
  }, [user?.id, removeMountedReels, scheduleBackgroundReelsRefresh]);

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
      if (d?.postId && user?.id && d.userId === user.id) {
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
      if (d?.followedId && user?.id && d.followerId === user.id) {
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

  const uploadModal = showUploadModal && user ? (
    <UploadReelModal
      user={user}
      onClose={() => setShowUploadModal(false)}
      onSuccess={() => {
        setShowUploadModal(false);
        loadReels();
      }}
    />
  ) : null;

  if (loading) {
    return (
      <>
        <SEOHead
          title="Poker Reels - Short Poker Content"
          description="Watch And Share Short Poker Video On Smarter.Poker Reels: Hands Worth Watching Twice, Reads That Paid Off And Moments From The Circuit. Free To Watch, No Account Needed, And Nothing In It Is A Wager."
          canonical="/hub/reels"
        />
        {user && <ReelPublicationRecoveryBanner user={user} onRecovered={loadReels} />}
        {uploadModal}
        <ReelsConsoleScreen
          title="Tuning Reel Signal"
          titleAs="h2"
          subtitle="Live Poker Video"
          pill="Connecting"
          copy="The console is verifying playable poker footage and preparing your first reel."
          rows={[
            { label: 'Source', value: 'Verified Library' },
            { label: 'Playback', value: 'Preparing', valueInk: 'blue' },
          ]}
          secondary={{ label: 'Back To Feed', onClick: () => router.push('/hub/social-media') }}
          primary={{ label: 'Retry Signal', onClick: () => loadReels(), ink: 'blue' }}
        />
        {/* Server rendered: this loading branch is the one a crawler always
            receives (AEO phase 3, 2026-09-17), so the summary keeps the page h1
            here and the transient console title above is an h2. */}
        <HubPageSummary page="reels" as="h1" />
        <ReelsListing items={reelsListing} />
      </>
    );
  }

  if (loadError && !reels.length) {
    const unavailable = loadError === 'unavailable';
    return (
      <>
        <Head>
          <title>Reels | Smarter Poker</title>
        </Head>
        {user && <ReelPublicationRecoveryBanner user={user} onRecovered={loadReels} />}
        {uploadModal}
        <ReelsConsoleScreen
          eyebrow="Playback Control"
          title={unavailable ? 'Video Unavailable' : 'Signal Interrupted'}
          subtitle="Reel Recovery"
          pill="Attention"
          pillInk="red"
          copy={unavailable
            ? 'This saved video is no longer available or has not passed playback verification.'
            : 'The Reel service did not answer. Your account state has been kept isolated.'}
          rows={[
            { label: 'Library', value: unavailable ? 'Available Reels' : 'Connection Required' },
            { label: 'Account State', value: 'Protected', valueInk: 'green' },
          ]}
          secondary={{ label: 'Back To Feed', onClick: () => router.push('/hub/social-media') }}
          primary={{
            label: unavailable ? 'Browse Available Reels' : 'Try Again',
            ink: unavailable ? 'silver' : 'blue',
            onClick: () => {
              setLoadError(null);
              if (unavailable) router.replace('/hub/reels');
              else loadReels();
            },
          }}
        />
        {/* Server rendered for crawlers (AEO phase 3). The console title above is
            this state's only h1, so the summary heading stays an h2. */}
        <HubPageSummary page="reels" />
        <ReelsListing items={reelsListing} />
      </>
    );
  }

  if (!reels.length) {
    return (
      <>
        <Head>
          <title>Reels | Smarter Poker</title>
        </Head>
        {user && <ReelPublicationRecoveryBanner user={user} onRecovered={loadReels} />}
        {uploadModal}
        <ReelsConsoleScreen
          title="No Reels Yet"
          subtitle="Verified Poker Video"
          pill={hasMore ? 'Scanning' : 'Stand By'}
          copy="No playable Reel is available in this pass. Continue the verified scan or return to the social feed."
          rows={[
            { label: 'Playback', value: 'No Match' },
            { label: 'Safety Check', value: 'Complete', valueInk: 'green' },
          ]}
          secondary={{ label: 'Back To Feed', onClick: () => router.push('/hub/social-media') }}
          primary={{
            label: loadingMore ? 'Finding Reels' : hasMore ? 'Continue Finding Reels' : 'Refresh Library',
            ink: 'blue',
            disabled: loadingMore,
            onClick: hasMore && reelsCursorRef.current
              ? () => void loadMoreReels()
              : () => void loadReels(),
          }}
        />
        {/* Server rendered for crawlers (AEO phase 3). The console title above is
            this state's only h1, so the summary heading stays an h2. */}
        <HubPageSummary page="reels" />
        <ReelsListing items={reelsListing} />
      </>
    );
  }

  const videoId = getYouTubeVideoId(currentReel?.video_url);
  const handleNativeVideoMetadata = (event) => {
    const duration = Number(event.currentTarget?.duration);
    // Some synthetic health checks announce metadata before their final
    // duration. Validate on both metadata and duration changes so a 64ms test
    // fragment cannot pin a paused/autoplay-off feed at 0:00.
    if (Number.isFinite(duration) && duration > 0 && duration < 1) {
      if (currentReel?.video_url) brokenUrlsRef.current.add(currentReel.video_url);
      goNext();
      return;
    }
    if (Number.isFinite(duration) && duration >= 1 && videoStallTimerRef.current) {
      clearTimeout(videoStallTimerRef.current);
      videoStallTimerRef.current = null;
    }
  };

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
          content="width=device-width, initial-scale=1, viewport-fit=cover"
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

      {user && <ReelPublicationRecoveryBanner user={user} onRecovered={loadReels} />}

      {/* Universal Header */}
      {showOverlay && (
        <div style={{ position: 'relative', zIndex: 10001 }}>
          <UniversalHeader
            pageDepth={1}
            commandMenuOpen={menuOpen}
            onCommandMenuOpenChange={handleCommandMenuOpenChange}
            commandMenuItems={menuConfig.menuItems}
            commandMenuBottomLinks={menuConfig.bottomLinks}
            commandMenuShowProfile={false}
          />
        </div>
      )}

      {/* Upload Modal */}
      {uploadModal}

      <main className={styles.viewerShell}>
        <VideoLibraryConsole
          eyebrow="Video Library"
          title="Reels"
          subtitle={currentReel?.profiles?.username ? `By ${currentReel.profiles.username}` : 'Live Poker Video'}
          pill={`${currentIndex + 1} Of ${reels.length}`}
          pillInk="blue"
          titleAs="h1"
          foot="plates"
          plates={{
            secondary: { label: 'Previous Reel', onClick: () => slideToPrevRef.current(), disabled: currentIndex === 0 },
            primary: { label: 'Next Reel', onClick: () => slideToNextRef.current() },
          }}
          className={styles.liveConsole}
          aria-label="Poker Reels viewer"
        >
      {/* Live video stage */}
      <div
        ref={containerRef}
        className={styles.stage}
        style={{
          position: 'fixed',
          inset: 0,
          background: C.bg,
          overflow: 'hidden',
        }}
      >
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
              key="yt-player-persistent"
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${preferencesLoaded && preferences.autoplay ? 1 : 0}&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}&iv_load_policy=3&disablekb=1&fs=0&cc_load_policy=${preferences.showCaptions ? 1 : 0}`}
              title="Poker Reel"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              onLoad={(e) => {
                // BUG FIX: With key="yt-player-persistent" this onLoad fires ONCE at
                // mount (not on every reel swipe). Establish the postMessage API bridge
                // here; subsequent video switches go through loadVideoById in the
                // currentIndex useEffect (no player reinitialisation needed).
                const iframeWindow = e.target.contentWindow;
                try {
                  iframeWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
                  if (preferencesLoaded && preferences.autoplay) iframeWindow.postMessage(
                    JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*'
                  );
                  // Retry playVideo — YT API inside the iframe may not be ready yet.
                  playVideoOnLoadTimersRef.current.forEach((t) => clearTimeout(t));
                  playVideoOnLoadTimersRef.current = [300, 800, 1500].map((delay) =>
                    setTimeout(() => {
                      try {
                        iframeWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
                        if (preferencesLoaded && preferences.autoplay) iframeWindow.postMessage(
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
                // Show the reel's thumbnail BEFORE any video frames decode.
                // Without this, HEVC stalls on Chrome desktop (which can't
                // decode H.265 without an Apple license) display a pure
                // black box for 6+ seconds before the watchdog skips. With
                // poster, users see the still frame immediately so the
                // swipe feels identical to YouTube-iframe reels (which
                // always show YouTube's poster underneath the player).
                poster={currentReel?.thumbnail_url || undefined}
                autoPlay={preferencesLoaded && preferences.autoplay}
                preload={preferences.dataSaver ? 'metadata' : 'auto'}
                playsInline
                // Always render muted=true — guarantees autoplay regardless
                // of browser policy. The new onPlaying handler flips
                // muted=false synchronously inside the playing event IF
                // the user has gestured this tab session (see the global
                // gesture-capture useEffect above).
                muted={muted}
                onPlay={() => setIsPaused(false)}
                onPlaying={(e) => {
                  // Successful playback — clear the stall watchdog so it
                  // doesn't auto-skip a video that just took longer to
                  // start (cold storage, slow network, etc).
                  if (videoStallTimerRef.current) {
                    clearTimeout(videoStallTimerRef.current);
                    videoStallTimerRef.current = null;
                  }
                  // Verify-after-unmute: when sessionStorage[sp:reels:interacted]
                  // is preset from a prior load, userInteractedRef is true but
                  // the browser hasn't seen a fresh gesture this load. The
                  // muted=false write may be silently ignored. Only flip React
                  // state after the DOM accepted it — never lie.
                  if (userGesturedThisLoadRef.current && userWantsSoundRef.current) {
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
                onLoadedMetadata={handleNativeVideoMetadata}
                onDurationChange={handleNativeVideoMetadata}
                // Surface decode failures (most commonly HEVC on Chrome
                // desktop — Chrome doesn't license H.265). Without this,
                // users saw a black box with the play button forever.
                // Now: record broken URL in session-scoped skip-set, then
                // auto-advance so the same broken reel is never shown twice.
                onError={(e) => {
                  const err = e.currentTarget?.error;
                  const url = currentReel?.video_url;
                  console.warn('[Reels] video decode failed', {
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
                  // Auto-advance — user never gets stuck on a broken video.
                  goNext();
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

        <progress className={styles.progress} value={Math.round(videoProgress)} max={100} aria-label="Video Progress" />

        {/* FULL-SCREEN TOUCH OVERLAY — captures ALL touch events over the iframe */}
        {/* This is the ONLY reliable way to handle touches on iOS Safari over YouTube embeds */}
        <div
          data-sp-skip-a11y="backdrop: click dismisses, Escape is the keyboard path"
          data-reels-overlay-trigger="true"
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
              actionLabel="Skipping In 3 Seconds"
            style={{ zIndex: 60 }}
          />
        )}

{!videoId && !currentReel?.video_url && <div className={styles.stageSignal}>Video Unavailable</div>}
        {isPaused && ytReady && <div className={styles.stageSignal}>Paused</div>}
        {showHeart && <div className={`${styles.stageSignal} ${styles.likedSignal}`}>Liked</div>}
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

        {/*
          TIKTOK-STYLE PREFETCH (2026-05-11): warm the browser cache for the
          NEXT 10 reels so swiping feels instant. Three preload strategies:
            1. Native MP4 reels → <link rel="preload" as="video">. The browser
               pre-downloads (or at least pre-resolves + pre-fetches start) the
               file. Crucial for /hub/reels which previously had NO preload at
               all — every native swipe cold-loaded. ReelsFeedCarousel.jsx
               already does this; we're achieving parity.
            2. YouTube reels → <img> hqdefault.jpg prefetch. YT serves these
               from a separate CDN; pre-fetching skips ~100-200ms latency on
               the swipe-thumbnail render path. (Pre-loading the actual YT
               iframe for >1 ahead would trigger YT's anti-throttling limits.)
            3. <link rel="dns-prefetch"> + <link rel="preconnect"> for YT
               domains so the TLS handshake is cached for any iframe load.
        */}
        {(() => {
          if (typeof window === 'undefined') return null;
          const upcoming = reels.slice(currentIndex + 1, currentIndex + 11);
          if (upcoming.length === 0) return null;
          return (
            <>
              {/* DNS preconnect for YT — done once, cheap, helps every YT swipe */}
              <link rel="dns-prefetch" href="https://www.youtube-nocookie.com" />
              <link
                rel="preconnect"
                href="https://www.youtube-nocookie.com"
                crossOrigin="anonymous"
              />
              <link rel="dns-prefetch" href="https://img.youtube.com" />
              {upcoming.map((r) => {
                const url = r?.video_url || '';
                if (!url) return null;
                const ytId = getYouTubeVideoId(url);
                if (ytId) {
                  // YT reel — prefetch thumbnail only (NOT the iframe — would
                  // trigger YT's per-page iframe quota and degrade everything).
                  return (
                    <img
                      key={`spw-prefetch-${r.id}`}
                      src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                      alt=""
                      style={{
                        position: 'absolute',
                        width: 1,
                        height: 1,
                        opacity: 0,
                        pointerEvents: 'none',
                      }}
                    />
                  );
                }
                // Native MP4 — full preload hint to the browser. <link as=video>
                // is a valid hint anywhere in the DOM (not just <head>) per
                // HTML5 spec — Chrome/Safari honor it and pre-fetch the start
                // of the file. Result: native swipes feel instant.
                return <link key={`spw-prefetch-${r.id}`} rel="preload" href={url} as="video" />;
              })}
            </>
          );
        })()}


      </div>
      <div className={styles.body}>
        <nav className={styles.actions} aria-label="Reel Navigation">
          <ReelAction onClick={() => router.push('/hub/social-media')}>Back To Feed</ReelAction>
          <ReelAction onClick={() => handleCommandMenuOpenChange(true)} aria-haspopup="dialog" aria-expanded={menuOpen}>Menu</ReelAction>
          <ReelAction onClick={() => setShowShortcutsOverlay(true)}>Keyboard Help</ReelAction>
        </nav>
        <div className={styles.actions} aria-label="Playback Controls">
          <ReelAction onClick={() => {
            if (videoRef.current) {
              if (videoRef.current.paused) videoRef.current.play().catch(() => showErrorToast('Playback Could Not Start'));
              else videoRef.current.pause();
            } else {
              sendYouTubeCommand(isPaused ? 'playVideo' : 'pauseVideo');
              setIsPaused(!isPaused);
            }
          }}>{isPaused ? 'Play' : 'Pause'}</ReelAction>
          <ReelAction onClick={() => muted ? handleUnmute() : handleMute()}>{muted ? 'Unmute' : 'Mute'}</ReelAction>
          <ReelAction onClick={handleSpeedToggle}>Speed {Math.round(playbackSpeed * 100)}%</ReelAction>
        </div>
        <div className={styles.creator}>
          {currentReel?.profiles?.avatar_url && <img src={currentReel.profiles.avatar_url} alt="" className={styles.avatar} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}
          {currentReel?.profiles?.username
            ? <Link className={styles.link} href={`/hub/user/${currentReel.profiles.username}`}>{currentReel.profiles.full_name || currentReel.profiles.username}</Link>
            : <span className={styles.copy}>Poker Creator</span>}
        </div>
        {currentReel?.profiles?.id && user?.id && currentReel.profiles.id !== user.id && (
          <ReelAction onClick={handleFollow} aria-pressed={Boolean(following[currentReel.profiles.id])}>{following[currentReel.profiles.id] ? 'Following' : 'Follow'}</ReelAction>
        )}
        <ConsoleDataRow label="Views" value={Math.floor(viewCounts[currentReel?.id] || currentReel?.view_count || 0)} />
        <ConsoleDataRow label="Published" value={timeAgo(currentReel?.created_at)} />
        {watchedReelIds.includes(currentReel?.id) && <p className={styles.status}>Watched</p>}
        {preferences.showCaptions && currentReel?.caption && (
          <>
            <p className={styles.copy}>{captionExpanded || currentReel.caption.length <= 100 ? currentReel.caption : currentReel.caption.slice(0, 100) + '...'}</p>
            {currentReel.caption.length > 100 && <ReelAction onClick={() => setCaptionExpanded((previous) => !previous)}>{captionExpanded ? 'See Less' : 'See More'}</ReelAction>}
          </>
        )}
        <div className={styles.actions} aria-label="Reel Actions">
          <ReelAction aria-label={liked[currentReel?.id] ? 'Unlike' : 'Like'} aria-pressed={Boolean(liked[currentReel?.id])}
            onClick={() => {
              handleLike();
              if (!liked[currentReel?.id]) {
                setShowHeart(true);
                if (showHeartTimerRef.current) clearTimeout(showHeartTimerRef.current);
                showHeartTimerRef.current = setTimeout(() => { showHeartTimerRef.current = null; setShowHeart(false); }, 800);
              }
            }}
            onPointerDown={() => { reactionTimerRef.current = setTimeout(() => { haptic(20); setShowReactionPicker(true); }, 500); }}
            onPointerUp={() => clearTimeout(reactionTimerRef.current)}
            onPointerLeave={() => clearTimeout(reactionTimerRef.current)}
            onPointerCancel={() => clearTimeout(reactionTimerRef.current)}
          >{liked[currentReel?.id] ? 'Liked' : 'Like'}</ReelAction>
          <ReelAction onClick={handleComment} aria-label="Comments">Comments</ReelAction>
          <ReelAction onClick={handleShare} aria-label="Share">Share</ReelAction>
          <ReelAction onClick={handleSave} aria-label={savedReels.has(currentReel?.id) ? 'Unsave' : 'Save'} aria-pressed={savedReels.has(currentReel?.id)}>{savedReels.has(currentReel?.id) ? 'Saved' : 'Save'}</ReelAction>
          <ReelAction onClick={() => {
            const ytVid = getYouTubeVideoId(currentReel?.video_url);
            const title = (currentReel?.caption || '').slice(0, 80);
            const ctx = { ref: 'reels', vid: ytVid || currentReel?.id || '', title, source: 'Reels', tags: currentReel?.tags || [] };
            const gameIds = findBestGames(ctx);
            const { getGameById: lookupGame } = require('../../src/data/TRAINING_LIBRARY');
            const games = gameIds.map((id) => lookupGame(id)).filter(Boolean).slice(0, 3);
            setTtsOverlay({ ctx, games });
            fetch('/api/training/log-request', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ref: 'reels', vid: ctx.vid, title: ctx.title, source: 'Reels', matchedGameIds: gameIds.slice(0, 3) }),
            }).catch((error) => console.warn('[Reels] Training Analytics Failed:', error));
          }} aria-label="Train This Spot">Train This Spot</ReelAction>
          <ReelAction onClick={() => setShowMoreMenu(true)} aria-label="More options">More</ReelAction>
        </div>
        <ConsoleDataRow label="Likes" value={Math.floor(likeCounts[currentReel?.id] ?? (currentReel?.like_count || 0))} />
        <ConsoleDataRow label="Comments" value={Math.floor(commentCounts[currentReel?.id] || comments.length || 0)} />
        {(shareToast || copyToast) && <p role="status" className={styles.status}>Link Copied</p>}
        {errorToast && <p role="alert" className={`${styles.status} ${styles.error}`}>{consoleText(errorToast)}</p>}
        {refreshing && <p role="status" className={styles.status}>Refreshing</p>}
        {!showCommentPanel && loadingMore && <p role="status" className={styles.status}>Finding Reels</p>}
        {!showCommentPanel && loadMoreError && !loadingMore && (
          <ReelAction onClick={() => void loadMoreReels()} aria-label="Retry loading more Reels">Retry More Reels</ReelAction>
        )}
        {hasMore && !loadingMore && !loadMoreError && <ReelAction onClick={() => void loadMoreReels()}>Continue Finding Reels</ReelAction>}
      </div>
        </VideoLibraryConsole>
      </main>

      {showShortcutsOverlay && (
        <ReelsConsoleDialog title="Keyboard Shortcuts" onClose={() => setShowShortcutsOverlay(false)} data-reels-shortcuts-overlay="true">
          {[['Up / Down', 'Previous / Next Reel'], ['Left / Right', 'Previous / Next Reel'], ['Space', 'Play / Pause'], ['L', 'Like'], ['S', 'Save'], ['C', 'Comments'], ['M', 'Mute / Unmute'], ['Esc', 'Close / Back To Feed'], ['?', 'Toggle This Menu']].map(([label, value]) => <ConsoleDataRow key={label} label={label} value={value} />)}
        </ReelsConsoleDialog>
      )}

      {(showContextMenu || showMoreMenu) && (
        <ReelsConsoleDialog title="Reel Options" onClose={() => { setShowContextMenu(false); setShowMoreMenu(false); }}>
          <ReelAction onClick={() => { setShowContextMenu(false); setShowMoreMenu(false); handleSave(); }}>{savedReels.has(currentReel?.id) ? 'Unsave' : 'Save Reel'}</ReelAction>
          <ReelAction onClick={() => { setShowContextMenu(false); setShowMoreMenu(false); handleShare(); }}>Share / Repost</ReelAction>
          <ReelAction onClick={() => { muted ? handleUnmute() : handleMute(); setShowMoreMenu(false); }}>{muted ? 'Unmute' : 'Mute'}</ReelAction>
          <ReelAction onClick={handleSpeedToggle}>Speed {Math.round(playbackSpeed * 100)}%</ReelAction>
          <ReelAction onClick={() => {
            navigator.clipboard.writeText(shareUrl).then(() => {
              setCopyToast(true);
              if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
              copyToastTimerRef.current = setTimeout(() => { copyToastTimerRef.current = null; setCopyToast(false); }, 2000);
            }).catch(() => showErrorToast('Copy Failed - Try Again'));
            setShowContextMenu(false); setShowMoreMenu(false);
          }}>Copy Link</ReelAction>
          <ReelAction onClick={() => { setShowContextMenu(false); setShowMoreMenu(false); setShowReportModal(true); }}>Report</ReelAction>
        </ReelsConsoleDialog>
      )}

      {showReactionPicker && (
        <ReelsConsoleDialog title="Reactions" onClose={() => setShowReactionPicker(false)}>
          {[{ label: 'Love', type: 'like' }, { label: 'Approve', type: 'thumbsup' }, { label: 'Not For Me', type: 'dislike' }, { label: 'Funny', type: 'laughing' }, { label: 'Tough Spot', type: 'crying' }, { label: 'Disagree', type: 'angry' }].map((reaction) => (
            <ReelAction key={reaction.type} onClick={() => {
              if (reaction.type === 'dislike') handleDislike();
              else {
                handleLike();
                if (!liked[currentReel?.id]) {
                  setShowHeart(true);
                  if (showHeartTimerRef.current) clearTimeout(showHeartTimerRef.current);
                  showHeartTimerRef.current = setTimeout(() => { showHeartTimerRef.current = null; setShowHeart(false); }, 800);
                }
              }
              setShowReactionPicker(false); haptic(10);
            }}>{reaction.label}</ReelAction>
          ))}
        </ReelsConsoleDialog>
      )}

      {showShareModal && (
        <ReelsConsoleDialog title="Share This Reel" onClose={() => setShowShareModal(false)}
          primary={{ label: sharedToFeed ? 'Shared To My Feed' : 'Share To My Feed', onClick: openShareDescriptionModal, disabled: sharingToFeed || sharedToFeed }}>
          <ConsoleCopy align="center">Share Externally</ConsoleCopy>
          <div className={styles.actions}>
            <ReelAction onClick={() => handleShareAction('copy')}>Copy Link</ReelAction>
            <ReelAction onClick={() => handleShareAction('x')}>X</ReelAction>
            <ReelAction onClick={() => handleShareAction('facebook')}>Facebook</ReelAction>
            <ReelAction onClick={() => handleShareAction('whatsapp')}>WhatsApp</ReelAction>
          </div>
          {typeof navigator !== 'undefined' && navigator.share && <ReelAction onClick={() => handleShareAction('native')}>More Sharing Options</ReelAction>}
        </ReelsConsoleDialog>
      )}

      {showShareDescriptionModal && (
        <ReelsConsoleDialog title="Share To My Feed" onClose={() => setShowShareDescriptionModal(false)}
          primary={{ label: sharingToFeed ? 'Posting' : 'Post To My Feed', onClick: handleShareToFeed, disabled: sharingToFeed }}>
          {currentReel?.caption && <p className={styles.copy}>{currentReel.caption}</p>}
          <label className={styles.fieldLabel} htmlFor="reel-share-description">Your Thoughts</label>
          <textarea id="reel-share-description" className={styles.field} value={shareDescription} maxLength={500}
            onChange={(event) => setShareDescription(event.target.value.slice(0, 500))} placeholder="Add Your Thoughts (Optional)" />
          <ConsoleDataRow label="Characters" value={`${shareDescription.length} / 500`} />
          <ReelAction disabled={sharingToFeed} onClick={() => { setShareDescription(''); handleShareToFeed(''); }}>Skip Description - Share Now</ReelAction>
        </ReelsConsoleDialog>
      )}

      {showCommentPanel && (
        <ReelsConsoleDialog title="Comments" onClose={() => { setShowCommentPanel(false); setShowGifPicker(false); }}
          primary={{ label: submittingComment ? 'Posting' : 'Post Comment', onClick: submitComment, disabled: (!commentText.trim() && !commentMediaUrl) || submittingComment }}>
          <ReelAction onClick={() => {
            const next = commentSort === 'newest' ? 'oldest' : 'newest';
            setCommentSort(next);
            setComments((previous) => [...previous].sort((a, b) => next === 'newest' ? new Date(b.created_at) - new Date(a.created_at) : new Date(a.created_at) - new Date(b.created_at)));
          }}>{commentSort === 'newest' ? 'Newest First' : 'Oldest First'}</ReelAction>
          <div className={styles.list}>
            {comments.length === 0 && <ConsoleCopy align="center">No Comments Yet. Be The First!</ConsoleCopy>}
            {comments.map((comment, index) => (
              <article key={comment.id || index} className={`${styles.comment} ${comment.parent_id ? styles.reply : ''}`}>
                <p className={styles.copy}>{comment.profiles?.username || comment.author?.username || 'User'}</p>
                <p className={`${styles.copy} ${styles.muted}`}>{timeAgo(comment.created_at)}</p>
                {editingComment === comment.id ? (
                  <>
                    <label className={styles.fieldLabel} htmlFor={`edit-reel-comment-${comment.id}`}>Edit Comment</label>
                    <input id={`edit-reel-comment-${comment.id}`} className={styles.field} value={editCommentText} onChange={(event) => setEditCommentText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleSaveEdit(comment.id);
                        if (event.key === 'Escape') { event.stopPropagation(); setEditingComment(null); setEditCommentText(''); }
                      }} />
                    <div className={styles.actions}>
                      <ReelAction onClick={() => handleSaveEdit(comment.id)}>Save</ReelAction>
                      <ReelAction onClick={() => { setEditingComment(null); setEditCommentText(''); }}>Cancel Edit</ReelAction>
                    </div>
                  </>
                ) : comment.content && <p className={styles.copy}>{comment.content}</p>}
                {comment.media_url && <img src={comment.media_url} className={styles.media} alt="Comment Attachment" loading="lazy" />}
                <div className={styles.actions}>
                  <ReelAction aria-pressed={Boolean(commentLikes[comment.id])} onClick={() => handleCommentLike(comment.id)}>{commentLikes[comment.id] ? 'Liked' : 'Like'}</ReelAction>
                  <ReelAction onClick={() => {
                    setReplyTo({ id: comment.id, username: comment.profiles?.username || comment.author?.username || 'User' });
                    setCommentText(`@${comment.profiles?.username || comment.author?.username || 'User'} `);
                  }}>Reply</ReelAction>
                  {(comment.profiles?.username === 'You' || comment.author_id === user?.id) && (
                    <>
                      <ReelAction onClick={() => handleEditComment(comment)}>Edit</ReelAction>
                      <ReelAction onClick={() => handleDeleteComment(comment.id)}>Delete</ReelAction>
                    </>
                  )}
                </div>
                {commentLikeCounts[comment.id] > 0 && <ConsoleDataRow label="Likes" value={Math.floor(commentLikeCounts[comment.id])} />}
              </article>
            ))}
          </div>
          {hasMoreComments && <ReelAction onClick={loadMoreComments} disabled={loadingMoreComments}>{loadingMoreComments ? 'Loading' : 'Load More Comments'}</ReelAction>}
          {commentMediaUrl && (
            <>
              <img src={commentMediaUrl} className={styles.media} alt="Selected Comment Attachment" />
              <ConsoleCopy>{commentMediaType === 'gif' ? 'GIF Attached' : 'Image Attached'}</ConsoleCopy>
              <ReelAction onClick={() => { setCommentMediaUrl(null); setCommentMediaType(null); }}>Remove Attachment</ReelAction>
            </>
          )}
          {showGifPicker && <GiphyPicker onSelect={(gif) => { setCommentMediaUrl(gif.images?.fixed_height?.url || gif.url || gif); setCommentMediaType('gif'); setShowGifPicker(false); }} />}
          {replyTo && (
            <>
              <ConsoleCopy>Replying To @{replyTo.username}</ConsoleCopy>
              <ReelAction onClick={() => { setReplyTo(null); setCommentText(''); }}>Cancel Reply</ReelAction>
            </>
          )}
          <div className={styles.actions}>
            <ReelAction aria-pressed={showGifPicker} onClick={() => setShowGifPicker((previous) => !previous)}>GIF</ReelAction>
            <ReelAction onClick={() => commentFileInputRef.current?.click()} disabled={uploadingImage}>{uploadingImage ? 'Uploading' : 'Image'}</ReelAction>
          </div>
          <input ref={commentFileInputRef} type="file" accept="image/*" hidden onChange={(event) => { if (event.target.files?.[0]) handleCommentImageUpload(event.target.files[0]); event.target.value = ''; }} />
          <label className={styles.fieldLabel} htmlFor="reel-comment-text">Your Comment</label>
          <input id="reel-comment-text" className={styles.field} value={commentText} maxLength={COMMENT_MAX_LENGTH}
            onChange={(event) => { if (event.target.value.length <= COMMENT_MAX_LENGTH) setCommentText(event.target.value); }}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitComment(); } }}
            placeholder="Add A Comment..." />
          <ConsoleDataRow label="Characters" value={`${commentText.length} / ${COMMENT_MAX_LENGTH}`} />
          {errorToast && <p role="alert" className={`${styles.status} ${styles.error}`}>{consoleText(errorToast)}</p>}
        </ReelsConsoleDialog>
      )}

      {showReportModal && (
        <ReelsConsoleDialog title={reportSubmitted ? 'Report Submitted' : 'Report This Reel'}
          onClose={() => { setShowReportModal(false); setReportReason(''); setReportSubmitted(false); }}
          primary={reportSubmitted ? undefined : { label: 'Submit Report', onClick: handleReport, disabled: !reportReason, ink: 'red' }}>
          {reportSubmitted ? <ConsoleCopy align="center">Thank You. We Will Review This Content.</ConsoleCopy> : (
            <>
              <ConsoleCopy>Why Are You Reporting This Content?</ConsoleCopy>
              {['Inappropriate Content', 'Spam Or Scam', 'Harassment', 'Misinformation', 'Other'].map((reason) => (
                <ReelAction key={reason} onClick={() => setReportReason(reason)} aria-pressed={reportReason === reason}>{reason}</ReelAction>
              ))}
            </>
          )}
          {errorToast && <p role="alert" className={`${styles.status} ${styles.error}`}>{consoleText(errorToast)}</p>}
        </ReelsConsoleDialog>
      )}

      {ttsOverlay && (
        <ReelsConsoleDialog title="Train This Spot" onClose={() => setTtsOverlay(null)}
          primary={{ label: 'Open Audited Hand Review', onClick: () => { setTtsOverlay(null); router.push('/hub/training/hand-history-upload?source=reels'); } }}>
          {(videoId || currentReel?.thumbnail_url) && <img src={videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : currentReel.thumbnail_url} className={styles.media} alt="Training Source Reel" />}
          <p className={styles.copy}>{ttsOverlay.ctx.title || 'Poker Reel'}</p>
          <ConsoleCopy>AI-Matched Drills For This Reel</ConsoleCopy>
          {ttsOverlay.games.map((game, index) => (
            <div key={game.id} className={styles.comment}>
              <ConsoleDataRow label={index === 0 ? 'Best Match' : `Match ${index + 1}`} value={consoleText(game.name)} />
              <p className={`${styles.copy} ${styles.muted}`}>{consoleText(game.focus)} / {Math.floor(Math.min(game.difficulty || 1, 5))} Of 5 Difficulty</p>
              <ReelAction onClick={() => { setTtsOverlay(null); router.push(`/hub/training?autoLaunch=${game.id}`); }}>Start Drill</ReelAction>
            </div>
          ))}
          <ReelAction onClick={() => { setTtsOverlay(null); router.push('/hub/training'); }}>Browse All 100 Training Games</ReelAction>
        </ReelsConsoleDialog>
      )}
      {/* Server rendered: measured on production this page returned
          almost nothing to a crawler (AEO phase 3, 2026-09-17). The viewer
          console title is the page h1, so this heading stays an h2. */}
      <HubPageSummary page="reels" />
      <ReelsListing items={reelsListing} />
    </>
  );
}
