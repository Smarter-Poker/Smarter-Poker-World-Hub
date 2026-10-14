/**
 * VIDEO LIBRARY - Full Poker Videos from Global Livestreams
 * Browse and watch complete hands from HCL, The Lodge, Triton, and more
 */

import { Component, Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';
import { useYouTubeErrorManager } from '../../src/hooks/useYouTubeErrorManager';
import BrowseSearch from '../../src/components/video-library/BrowseSearch';
import LiveNow from '../../src/components/video-library/LiveNow';
import StudyStatus from '../../src/components/video-library/StudyStatus';
import MemberClipUpload from '../../src/components/video-library/MemberClipUpload';
import VideoQueue from '../../src/components/video-library/VideoQueue';
import useVideoLibraryQueue from '../../src/components/video-library/useVideoLibraryQueue';
import { playlistPath } from '../../src/lib/videoLibraryQueue.mjs';
import { videoLibrarySocialShareHref } from '../../src/lib/videoLibrarySocialShare.mjs';
import { channelPath, CHANNEL_KEY_RE } from '../../src/lib/videoLibraryChannels.mjs';
import { BROWSE_FILTER_OPTIONS, normalizeBrowseFilters } from '../../src/lib/videoLibraryBrowse.mjs';
import WatchPlaybackTools, { WatchDescription } from '../../src/components/video-library/WatchPlaybackTools';
import PauseQuiz from '../../src/components/video-library/PauseQuiz';
import PlayerLinks from '../../src/components/video-library/PlayerLinks';
import { buildWatchDescription } from '../../src/lib/videoLibraryWatch.mjs';
import SEOHead from '../../src/components/seo/SEOHead';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import HubPageSummary from '../../src/components/seo/HubPageSummary';

// AEO phase 3 (2026-09-17).
const VIDEO_LIBRARY_SCHEMA = hubProductSchema({
    path: '/hub/video-library',
    name: 'Smarter.Poker Video Library',
    description:
        'A Curated Poker Video Library: Strategy Content, Tournament Coverage And Training Videos, With Watch History And AI Tactical Analysis. Free To Watch.',
    trail: [['Hub', '/hub'], ['Video Library', '/hub/video-library']],
});
import { useRouter } from 'next/router';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getVideoPlaylists, createPlaylist, addVideoToPlaylist, removeVideoFromPlaylist } from '../../src/services/videoPlaylists';
import { getAccessToken } from '../../src/lib/authUtils';
import { useAvatar } from '../../src/contexts/AvatarContext';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import VideoLibraryCommandRail from '../../src/components/video-library/VideoLibraryCommandRail';
import VideoLearningLoop from '../../src/components/video-learning/VideoLearningLoop';
import HubPageShell from '../../src/components/ui/HubPageShell';
import PullToRefresh from '../../src/components/ui/PullToRefresh';
import toast from '../../src/stores/toastStore';
import { useLoadFailsafe } from '../../src/hooks/useLoadFailsafe';
import { useHaptics } from '../../src/hooks/useHaptics';
import { useOnlineStatus, OFFLINE_TOAST } from '../../src/hooks/useOnlineStatus';
import { useModalHistory } from '../../src/hooks/useModalHistory';
import { isVideoLibraryVideoAllowed } from '../../src/lib/videoLibraryAvailability';
import { createVideoLibraryOwnerScope } from '../../src/lib/videoLibraryOwnerScope.mjs';
import {
    formatVideoAge,
    formatViewCount,
    getVideoChannel,
    getVideoMetaLine,
} from '../../src/lib/videoLibraryCards';
import { watchPath } from '../../src/lib/videoLibraryWatch.mjs';
import {
    THUMBNAIL_SIZES,
    dedupeVideos,
    nextThumbnailFallback,
    thumbnailCandidates,
} from '../../src/lib/videoLibraryCuration.mjs';

const UniversalHeader = dynamic(() => import('../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../src/components/ui/HamburgerMenu'), { ssr: false });
import { getVideoLibraryPreferences, updateVideoLibraryPreferences } from '../../src/services/videoLibraryPreferences';
import { getVideoFavorites, addVideoFavorite, removeVideoFavorite } from '../../src/services/videoFavorites';
import { getWatchLater, addToWatchLater, removeFromWatchLater } from '../../src/services/videoWatchLater';
import { updateWatchDuration, flushWatchDuration, getWatchedVideos, getWatchProgress, getRecentlyWatched, removeFromWatchHistory } from '../../src/services/videoWatchHistory';

// God-Mode Stack
import { useVideoLibraryStore } from '../../src/stores/videoLibraryStore';
import useTrainingBus from '../../src/hooks/useTrainingBus';

// DISCOVERABILITY PHASE 7 (2026-09-19). This was dynamic(..., { ssr: false })
// and the whole page body sits inside it, so the server rendered the head and
// nothing else: a crawler got 106 words and not one video title, even though
// PageTransition is a framer-motion div that touches no browser API during
// render. The playable catalog itself is never bundled here: only the live,
// freshly verified catalog API may hydrate it.
import PageTransition from '../../src/components/transitions/PageTransition';
// ReelsViewer is dynamically loaded to reduce initial bundle size
const ReelsViewer = dynamic(() => import('../../src/components/social/Reels').then(mod => mod.ReelsViewer), { ssr: false });
import { findBestGames } from '../../src/utils/videoToTrainingMapper';

import {
    LEGACY_VIDEO_ID_ALIASES,
    VIDEO_LIBRARY_SOURCES as SOURCES,
} from '../../src/data/videoLibraryCompatibility';

// Persistence uses YouTube's video ID as the canonical key. These maps migrate
// old display-only aliases (hcl1, lodge1, ...) without retaining titles,
// thumbnails, playback URLs or any other duplicate catalog authority.
const STATIC_VIDEO_ALIASES = new Map(Object.entries(LEGACY_VIDEO_ID_ALIASES));
const STATIC_VIDEO_CANONICAL_ALIASES = new Map(
    Object.entries(LEGACY_VIDEO_ID_ALIASES).map(([legacyId, videoId]) => [videoId, legacyId]),
);
const canonicalStoredVideoId = videoId => STATIC_VIDEO_ALIASES.get(videoId) || videoId;

const EMPTY_VIDEO_SET = new Set();
const EMPTY_VIDEO_MAP = new Map();
const DEFAULT_VIDEO_LIBRARY_PREFERENCES = Object.freeze({ autoplay: true, captions: false });

const LIBRARY_VIEW_OPTIONS = [
    { id: 'recommended', label: 'Recommended For You', shortLabel: 'For You' },
    { id: 'favorites', label: 'Favorites', shortLabel: 'Favorites' },
    { id: 'watchlater', label: 'Watch Later', shortLabel: 'Watch Later' },
    { id: 'history', label: 'Watch History', shortLabel: 'History' },
    { id: 'playlists', label: 'Playlists', shortLabel: 'Playlists' },
];

const LIBRARY_VIEW_META = {
    ALL: {
        kicker: 'Live Poker Broadcast Archive',
        title: 'Poker Video Library',
        description: 'Study Complete Sessions, Tournament Coverage, And Creator Breakdowns From One Command Deck.',
    },
    recommended: { kicker: 'Personal Library', title: 'Recommended For You', description: 'Verified Poker Videos Ranked Using Available Study History And Saved Lessons.' },
    favorites: {
        kicker: 'Personal Library / Favorites',
        title: 'Favorite Videos',
        description: 'Your Strongest Hands, Breakdowns, And Broadcasts Saved For A Fast Return.',
    },
    watchlater: {
        kicker: 'Personal Library / Study Queue',
        title: 'Watch Later',
        description: 'A Focused Queue For The Videos You Want In Your Next Study Session.',
    },
    history: {
        kicker: 'Personal Library / Session Log',
        title: 'Watch History',
        description: 'Resume Recent Sessions Or Revisit Videos You Have Already Studied.',
    },
    playlists: {
        kicker: 'Personal Library / Playlists',
        title: 'Playlist Videos',
        description: 'Browse Every Video Organized Inside Your Named Study Playlists.',
    },
};

class VideoLibraryReelsBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.warn('[VideoLibraryReelsBoundary]', error, errorInfo);
        reportVideoLibraryIssue('reels_boundary', error);
    }

    render() {
        if (!this.state.hasError) return this.props.children;
        return (
            <div className="vl-reels-fallback" role="alert">
                <div className="vl-sheet-card">
                    <h2>Reels Did Not Load</h2>
                    <p>The Full Library Is Still Available. Retry Reels Or Go Back Without Losing Your Place.</p>
                    <div className="vl-sheet-actions">
                        <button type="button" className="vl-pill-button" onClick={this.props.onClose}>Back To Library</button>
                        <button type="button" className="vl-pill-button is-primary" onClick={() => this.setState({ hasError: false })}>Try Again</button>
                    </div>
                </div>
            </div>
        );
    }
}

/** Parse duration string (e.g., "18:34" or "1:23:45") to seconds */
function parseDuration(durationStr) {
    if (!durationStr) return 0;
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

/* MOBILE PHASE 9 (docs/mobile-standard): the rail scroller is gone. It
   scrolled a sideways strip so the chosen control came into view; every
   control row wraps now, so the chosen control is on screen by construction.
   Four cards at first on Continue Watching and New This Week, then Show More. */
const INITIAL_RAIL_CARDS = 4;

/** Copy text with a legacy fallback for browsers where Clipboard API is unavailable. */
async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        return document.execCommand('copy');
    } finally {
        textarea.remove();
    }
}

function getFocusableElements(container) {
    if (!container) return [];
    return [...container.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
    )].filter(element => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]'));
}

function containDialogFocus(event, container) {
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function recoverYouTubeThumbnail(event, candidates) {
    const image = event.currentTarget;
    // YouTube answers a missing size with a 120px grey placeholder (or a 404),
    // so a tiny image counts as missing too.
    if (event.type !== 'error' && image.naturalWidth > 120) return;
    const next = nextThumbnailFallback(image.getAttribute('src'), candidates);
    if (next) {
        image.src = next;
        return;
    }
    image.hidden = true;
    image.parentElement?.classList.add('vl-media-failed');
}

/**
 * One thumbnail element for every card (Phase 1, 2026-10-12): 640px images on
 * cards, 320px on shelves, YouTube's original-aspect frame for Shorts, and a
 * fallback ladder so no card is left blank.
 */
function VideoThumbnail({ video, size = THUMBNAIL_SIZES.card, priority = false, vertical = false }) {
    const candidates = thumbnailCandidates(video.videoId, { size, vertical, catalogThumbnail: video?.thumbnail });
    return (
        <img
            src={candidates[0]}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            fetchpriority={priority ? 'high' : 'auto'}
            decoding="async"
            onLoad={event => recoverYouTubeThumbnail(event, candidates)}
            onError={event => recoverYouTubeThumbnail(event, candidates)}
        />
    );
}

function ChannelAvatar({ video, channel = getVideoChannel(video) }) {
    const source = String(video?.source || '');
    const path = source !== 'ALL' && CHANNEL_KEY_RE.test(source) ? channelPath(source) : null;
    const content = channel.logo ? <img src={channel.logo} alt="" loading="lazy" decoding="async" /> : <span>{channel.initials}</span>;
    if (path) return <a className="vl-avatar vl-channel-avatar" href={path} aria-label={`View ${channel.name} Channel`}>{content}</a>;
    return (
        <span className="vl-avatar" aria-hidden="true">
            {channel.logo
                ? <img src={channel.logo} alt="" loading="lazy" decoding="async" />
                : <span>{channel.initials}</span>}
        </span>
    );
}

function reportVideoLibraryIssue(event, error) {
    if (typeof window === 'undefined') return;
    const message = String(error?.message || error || 'Unknown client failure').slice(0, 500);
    void fetch('/api/video-library/client-error', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, message }),
    }).catch(reportingError => {
        console.warn('[video-library] client error report was not delivered:', reportingError);
    });
}

export default function VideoLibraryPage() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;
    const playbackQueue = useVideoLibraryQueue(userId);
    const ownerScopeRef = useRef(null);
    const pendingVideoActionsRef = useRef(new Set());
    const watchProgressRef = useRef(new Map());
    const watchStartTimeRef = useRef(null);
    const currentWatchingVideoRef = useRef(null);
    const watchSessionUserIdRef = useRef(null);
    const pendingFlushRef = useRef(false);
    const shareToastTimer = useRef(null);

    if (!ownerScopeRef.current) {
        ownerScopeRef.current = createVideoLibraryOwnerScope(userId);
    }
    const ownerChangedThisRender = ownerScopeRef.current.activate(userId);
    if (ownerChangedThisRender) {
        // Reset ref-backed personal state during render. Account B can interact
        // before effects run without inheriting account A's action locks or
        // progress cache.
        pendingVideoActionsRef.current.clear();
        watchProgressRef.current = new Map();
        watchStartTimeRef.current = null;
        currentWatchingVideoRef.current = null;
        watchSessionUserIdRef.current = null;
        pendingFlushRef.current = false;
        if (shareToastTimer.current) clearTimeout(shareToastTimer.current);
        shareToastTimer.current = null;
    }

    // Connect to global telemetry bus
    useTrainingBus('video-library');

    // Zustand storebal State (replaces UI-related useState)
    const selectedVideo = useVideoLibraryStore((s) => s.selectedVideo);
    const [quizMarkers, setQuizMarkers] = useState([]);
    useEffect(() => { setQuizMarkers([]); }, [selectedVideo?.videoId, userId]);
    const setSelectedVideo = useVideoLibraryStore((s) => s.setSelectedVideo);

    // Persisted filters for source and type
    const { filters, setFilter } = usePersistedFilters('video-library', {
        selectedSource: 'ALL',
        selectedType: 'ALL'
    });

    const selectedSource = SOURCES.some(source => source?.id === filters.selectedSource)
        ? filters.selectedSource
        : 'ALL';
    const selectedType = ['ALL', 'cash', 'tournament', 'slots', 'sports'].includes(filters.selectedType)
        ? filters.selectedType
        : 'ALL';
    const setSelectedSource = (val) => setFilter('selectedSource', val);
    const setSelectedType = (val) => setFilter('selectedType', val);

    // Old localStorage values from retired filters fail closed to the current
    // command vocabulary instead of marooning the user in an empty view.
    useEffect(() => {
        if (filters.selectedSource !== selectedSource) setSelectedSource(selectedSource);
        if (filters.selectedType !== selectedType) setSelectedType(selectedType);
    }, [filters.selectedSource, filters.selectedType, selectedSource, selectedType]);

    // Local state starts fail-closed; the live verified catalog hydrates it.
    const [videos, setVideos] = useState([]);
    const [displayedCount, setDisplayedCount] = useState(0);
    const [allVideos, setAllVideos] = useState([]); // verified, unfiltered master list
    const [catalogRefreshFailed, setCatalogRefreshFailed] = useState(false);
    const [catalogLoading, setCatalogLoading] = useState(true);
    useLoadFailsafe(catalogLoading, setCatalogLoading);
    const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
    const [catalogTotal, setCatalogTotal] = useState(0);
    const [catalogHasMore, setCatalogHasMore] = useState(false);
    const [catalogNextOffset, setCatalogNextOffset] = useState(0);
    const catalogAbortRef = useRef(null);
    const catalogRequestRef = useRef(0);
    const [deepLinkStatus, setDeepLinkStatus] = useState(null);
    const [deepLinkRetryNonce, setDeepLinkRetryNonce] = useState(0);


    // Handle query parameters for deep linking
    const savedScrollY = useRef(0); // restore scroll when modal closes
    // Stable ref so the early query-param useEffect can call handleOpenVideo
    // without putting it in the dependency array (avoids TDZ in minified output)
    const handleOpenVideoRef = useRef(null);
    const handleCloseVideoRef = useRef(null);
    const saveWatchSessionRef = useRef(null);
    const openedQueryVideoRef = useRef(null);
    const queryVideoFetchRef = useRef(null);
    const queryVideoRequestRef = useRef(0);
    const requestedQueryVideoIdRef = useRef(null);
    const hadNavigationQueryRef = useRef(false);
    const lastNavigationQueryRef = useRef(null);
    useEffect(() => {
        if (!router.isReady) return;

        const navigationQueryKey = JSON.stringify({
            type: router.query.type || '',
            source: router.query.source || '',
            filter: router.query.filter || '',
            q: router.query.q || '',
            sort: router.query.sort || '',
            game: router.query.game || '', stakes: router.query.stakes || '', skill: router.query.skill || '',
        });
        const navigationQueryChanged = lastNavigationQueryRef.current !== navigationQueryKey;
        if (navigationQueryChanged) {
        setBrowseFilters(normalizeBrowseFilters(router.query));
        lastNavigationQueryRef.current = navigationQueryKey;
        const hasNavigationQuery = Boolean(router.query.type || router.query.source || router.query.filter || router.query.q || router.query.sort || router.query.game || router.query.stakes || router.query.skill);
        if (!hasNavigationQuery && hadNavigationQueryRef.current) {
            setSelectedType('ALL');
            setSelectedSource('ALL');
            setLibraryFilter('ALL');
            setSearchQuery('');
            setSortMode('default');
        }
        hadNavigationQueryRef.current = hasNavigationQuery;

        if (hasNavigationQuery) {
            if (!router.query.type) setSelectedType('ALL');
            if (!router.query.source) setSelectedSource('ALL');
            if (!router.query.filter) {
                setLibraryFilter('ALL');
            }
            if (!router.query.q) setSearchQuery('');
            if (!router.query.sort) setSortMode('default');
        }

        if (router.query.type) {
            // 2026-08-15: was .toUpperCase(), which produced 'CASH'/'TOURNAMENT'
            // and never matched v.type — the DB CHECK constraint stores these
            // lowercase. Every ?type= deep link (two hamburger-menu entries and
            // the sitemap links) landed on an empty "No Videos Found" page.
            const requestedType = String(router.query.type).toLowerCase();
            if (['all', 'cash', 'tournament', 'slots', 'sports'].includes(requestedType)) {
                setSelectedType(requestedType === 'all' ? 'ALL' : requestedType);
            }
        }
        if (router.query.source) {
            const requestedSource = String(router.query.source).toUpperCase();
            if (requestedSource === 'ALL' || SOURCES.some(source => source?.id === requestedSource)) {
                setSelectedSource(requestedSource);
            }
        }
        if (router.query.filter) {
            const requestedFilter = Array.isArray(router.query.filter) ? router.query.filter[0] : router.query.filter;
            const f = String(requestedFilter).toLowerCase();
            if (f === 'recommended' || f === 'favorites' || f === 'history' || f === 'watchlater' || f === 'playlists') {
                setLibraryFilter(f);
            } else {
                setSearchQuery(String(requestedFilter));
            }
        }
        if (router.query.q) {
            const requestedSearch = Array.isArray(router.query.q) ? router.query.q[0] : router.query.q;
            setSearchQuery(String(requestedSearch).slice(0, 80));
        }
        if (router.query.sort) {
            const requestedSort = Array.isArray(router.query.sort) ? router.query.sort[0] : router.query.sort;
            if (['default', 'trending', 'top_rated'].includes(String(requestedSort))) {
                setSortMode(String(requestedSort));
            }
        }
        }
        // ?v=VIDEO_ID — auto-open a specific video
        if (router.query.v && allVideos.length > 0) {
            const rawVideoId = String(Array.isArray(router.query.v) ? router.query.v[0] : router.query.v);
            const requestedVideoId = canonicalStoredVideoId(rawVideoId);
            const target = allVideos.find(v => v.videoId === requestedVideoId);
            if (target && openedQueryVideoRef.current !== requestedVideoId && handleOpenVideoRef.current) {
                setDeepLinkStatus(null);
                openedQueryVideoRef.current = requestedVideoId;
                handleOpenVideoRef.current(target);
            }
        } else {
            openedQueryVideoRef.current = null;
        }
    }, [router.isReady, router.query, allVideos]);
    const [searchQuery, setSearchQuery] = useState('');
    const [browseFilters, setBrowseFilters] = useState({ game: 'ALL', stakes: 'ALL', skill: 'ALL' });
    const [browseSuggestions, setBrowseSuggestions] = useState([]);
    const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
    const [showReelsModal, setShowReelsModal] = useState(false);
    const searchInputRef = useRef(null);
    // Phase 0a foundation (mobile phase 9). The catalog skeleton is capped at
    // eight seconds; a pull at the top re-reads the catalog; card taps buzz;
    // an offline refresh says so instead of spinning.
    const haptic = useHaptics();
    const online = useOnlineStatus();
    const requireOnline = useCallback(() => {
        if (online) return true;
        toast.error(OFFLINE_TOAST);
        return false;
    }, [online]);
    const [cwVisible, setCwVisible] = useState(INITIAL_RAIL_CARDS);
    const [sourcesExpanded, setSourcesExpanded] = useState(false);
    const mobileFilterRailRef = useRef(null);
    const reelsDialogRef = useRef(null);
    const reelsTriggerRef = useRef(null);
    const mobileReelsTriggerRef = useRef(null);
    const modalOverlayRef = useRef(null); // ref for native fullscreen
    const playerIframeRef = useRef(null);
    const playerPositionRef = useRef(0);
    const modalCloseButtonRef = useRef(null);
    const viewerFocusInitializedRef = useRef(false);
    const videoTriggerRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [iframeKey, setIframeKey] = useState(0); // bump to force iframe remount (guarantees autoplay)
    // BUG-K FIX: store unmute timer IDs so we can clear them if modal closes before 1200ms
    const iframeUnmuteTimers = useRef([]);

    // Touch device detection — set after mount to avoid SSR hydration mismatch.
    // This MUST be state (not a direct typeof window check) because SSR renders
    // with window=undefined, and React won't re-evaluate inline conditions on hydration.
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    useEffect(() => {
        setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    }, []);

    // Swipe / TikTok navigation state
    const swipeTouchStart = useRef(null);
    const swipeTouchStartY = useRef(null);

    // Content tracking state
    const [storedFavorites, setFavorites] = useState(new Set());
    const [storedPlaylists, setPlaylists] = useState([]);
    const [showPlaylistModal, setShowPlaylistModal] = useState(null); // video object
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false); // loading state for playlist creation
    const [playlistActionError, setPlaylistActionError] = useState(null); // error feedback
    const createPlaylistButtonRef = useRef(null);
    const playlistDialogRef = useRef(null);
    const playlistNameInputRef = useRef(null);
    const playlistTriggerRef = useRef(null);
    const [storedWatchLater, setWatchLater] = useState(new Set());
    const [learningStudyIds, setLearningStudyIds] = useState(new Set());
    const [learningProgressByVideo, setLearningProgressByVideo] = useState(new Map());
    // 2026-08-15: the three "My Library" hamburger entries
    // (?filter=favorites|history|watchlater) previously fell into a handler
    // that just ran setSearchQuery('favorites'), so users got
    // `0 results for "favorites"`. There was no such view at all. The data
    // was already in state (favorites / watchLater / watchedVideos are Sets
    // of video ids) — it just was never wired to a filter.
    const [libraryFilter, setLibraryFilter] = useState('ALL');
    useEffect(() => {
        if (libraryFilter !== 'ALL' || !allVideos.length) return;
        setBrowseSuggestions(previous => [...new Set([...previous, ...allVideos.flatMap(video => [video.title, getVideoChannel(video).name])].filter(value => typeof value === 'string' && value.trim()))].slice(-150));
    }, [allVideos, libraryFilter]);

    const [storedWatchedVideos, setWatchedVideos] = useState(new Set()); // Videos watched 60+ seconds
    const [storedWatchProgress, setWatchProgress] = useState(new Map()); // video_id → { watchedSeconds, watchedAt }
    const [storedRecentlyWatched, setRecentlyWatched] = useState([]); // Recently watched videos
    const [libraryStateOwnerId, setLibraryStateOwnerId] = useState(userId || null);
    const [librarySyncState, setLibrarySyncState] = useState('idle'); // idle | loading | ready | partial | error
    const [librarySyncErrors, setLibrarySyncErrors] = useState([]);
    const refreshUserLibraryRef = useRef(null);

    // ── P3: Sort mode — 'default' | 'trending' | 'top_rated' ─────────────────
    const [sortMode, setSortMode] = useState('default');

    // Account A's backing state is synchronously masked on account B's first
    // render, then cleared by the ownership effect below. This closes the
    // one-frame personal-data leak that an ordinary useEffect-only reset leaves.
    const personalStateIsCurrent = libraryStateOwnerId === (userId || null);
    const favorites = personalStateIsCurrent ? storedFavorites : EMPTY_VIDEO_SET;
    const playlists = personalStateIsCurrent ? storedPlaylists : [];
    const watchLater = personalStateIsCurrent ? storedWatchLater : EMPTY_VIDEO_SET;
    const watchedVideos = personalStateIsCurrent ? storedWatchedVideos : EMPTY_VIDEO_SET;
    const watchProgress = personalStateIsCurrent ? storedWatchProgress : EMPTY_VIDEO_MAP;
    const recentlyWatched = personalStateIsCurrent ? storedRecentlyWatched : [];
    const visibleLibrarySyncState = personalStateIsCurrent
        ? librarySyncState
        : (userId ? 'loading' : 'idle');
    const visibleLibrarySyncErrors = personalStateIsCurrent ? librarySyncErrors : [];

    const playlistVideoIds = useMemo(() => new Set(
        playlists.flatMap(playlist => (playlist.items || []).map(item => canonicalStoredVideoId(item.video_id)))
    ), [playlists]);

    const personalViewCounts = {
        favorites: favorites.size,
        watchlater: watchLater.size,
        history: watchedVideos.size,
        playlists: playlists.length,
    };
    const personalSavedVideoCounts = {
        favorites: favorites.size,
        watchlater: watchLater.size,
        history: watchedVideos.size,
        playlists: playlistVideoIds.size,
    };
    const currentViewMeta = LIBRARY_VIEW_META[libraryFilter] || LIBRARY_VIEW_META.ALL;

    // Keep the command rail and URL in lockstep so every subview is shareable,
    // back-button safe, and visually reports the state it actually represents.
    const replaceNavigationQuery = useCallback((patch) => {
        const nextQuery = { ...router.query };
        Object.entries(patch).forEach(([key, value]) => {
            if (value == null || value === '' || value === 'ALL') delete nextQuery[key];
            else nextQuery[key] = value;
        });
        void router.replace(
            { pathname: router.pathname || '/hub/video-library', query: nextQuery },
            undefined,
            { shallow: true, scroll: false }
        );
    }, [router]);

    const selectBrowseView = (type, button) => {
        setSelectedType(type);
        setLibraryFilter('ALL');
        setSearchQuery('');
        setCatalogSearchQuery('');
        replaceNavigationQuery({ type: type === 'ALL' ? null : type, filter: null });
        button?.focus?.();
    };

    const selectPersonalView = (filter, button) => {
        setSelectedType('ALL');
        setLibraryFilter(filter);
        setSearchQuery('');
        setCatalogSearchQuery('');
        replaceNavigationQuery({ type: null, filter });
        button?.focus?.();
    };

    const selectSourceView = (source, button) => {
        setSelectedSource(source);
        replaceNavigationQuery({
            source: source === 'ALL' ? null : source,
            type: selectedType === 'ALL' ? null : selectedType,
            filter: libraryFilter === 'ALL' ? null : libraryFilter,
        });
        button?.focus?.();
    };

    const selectSortView = (nextSortMode, button) => {
        setSortMode(nextSortMode);
        replaceNavigationQuery({ sort: nextSortMode === 'default' ? null : nextSortMode });
        button?.focus?.();
    };

    // Command-status notice for copy, save, favorite, and history feedback.
    const [shareToast, setShareToast] = useState(null); // { message, videoId, tone, kind, ownerToken }
    const [ttsOverlay, setTtsOverlay] = useState(null); // Train This Spot in-place overlay { ctx, games }
    const ttsDialogRef = useRef(null);
    const ttsCloseButtonRef = useRef(null);
    const ttsTriggerRef = useRef(null);
    const showActionNotice = useCallback((message, { videoId = null, tone = 'success', kind = 'action' } = {}) => {
        if (shareToastTimer.current) clearTimeout(shareToastTimer.current);
        setShareToast({ message, videoId, tone, kind, ownerToken: ownerScopeRef.current.capture(userId) });
        shareToastTimer.current = setTimeout(() => setShareToast(null), 2800);
    }, [userId]);
    const visibleShareToast = shareToast && ownerScopeRef.current.isCurrent(shareToast.ownerToken)
        ? shareToast
        : null;

    useEffect(() => {
        watchProgressRef.current = watchProgress;
    }, [watchProgress]);

    // Video modal HUD (heart/comment/share/save) — tap to show, auto-hides
    const [vlHudVisible, setVlHudVisible] = useState(false);
    const vlHudTimer = useRef(null);
    const hideHudIfIdle = useCallback(() => {
        if (modalOverlayRef.current?.querySelector('.vl-hud:focus-within')) {
            vlHudTimer.current = setTimeout(hideHudIfIdle, 5000);
            return;
        }
        setVlHudVisible(false);
    }, []);
    const vlRevealHud = useCallback(() => {
        setVlHudVisible(true);
        clearTimeout(vlHudTimer.current);
        vlHudTimer.current = setTimeout(hideHudIfIdle, 5000);
    }, [hideHudIfIdle]);

    const [discoveryView, setDiscoveryView] = useState('new-today');
    // YouTube-style "more actions" sheet for a feed card (owner update 2026-10-11).
    const [cardMenuVideo, setCardMenuVideo] = useState(null);
    const playerAutoplayRef = useRef(true);
    const playerResumeRef = useRef({ key: null, seconds: 0 });
    const [miniPlayer, setMiniPlayer] = useState(false);
    const [nextAutoplay, setNextAutoplay] = useState(true);
    const [shortsVisible, setShortsVisible] = useState(INITIAL_RAIL_CARDS);

    const isPlayerPlayingRef = useRef(false);
    const handlePlaybackInfo = useCallback((info) => {
        const currentTime = Number(info?.currentTime);
        if (Number.isFinite(currentTime) && currentTime >= 0) playerPositionRef.current = currentTime;
    }, []);
    const handlePlayerStateChange = useCallback((state) => {
        if (state === 1) {
            isPlayerPlayingRef.current = true;
            watchSessionUserIdRef.current = userId || null;
            if (currentWatchingVideoRef.current && !watchStartTimeRef.current) watchStartTimeRef.current = Date.now();
            return;
        }
        if (state === 0 || state === 2 || state === 3 || state === 5) {
            isPlayerPlayingRef.current = false;
            const startTime = watchStartTimeRef.current;
            const video = currentWatchingVideoRef.current;
            watchStartTimeRef.current = null;
            if (startTime && video) void saveWatchSessionRef.current?.(startTime, video, { quiet: true });
        }
    }, [userId]);

    const handleManagedPlayerError = useCallback(() => {
        handleCloseVideoRef.current?.();
    }, []);

    // Centralized YouTube error management for video library player
    const {
        ytError: vlYtManaged,
        errorInfo: vlYtErrorInfo,
        thumbnailUrl: vlThumbnailUrl,
    } = useYouTubeErrorManager({
        active: !!selectedVideo,
        videoId: selectedVideo?.videoId || null,
        surface: 'VideoLibrary',
        autoActionDelay: 3000,
        onStateChange: handlePlayerStateChange,
        onPlaybackInfo: handlePlaybackInfo,
        iframeRef: playerIframeRef,
        onError: handleManagedPlayerError,
    });



    
    const loadMoreRef = useRef(null);

    // Hamburger menu preferences
    const [storedPreferences, setPreferences] = useState(DEFAULT_VIDEO_LIBRARY_PREFERENCES);
    const preferences = personalStateIsCurrent
        ? storedPreferences
        : DEFAULT_VIDEO_LIBRARY_PREFERENCES;

    // Intro video removed by request
        
    // Mark intro as seen when it ends

    // Attempt to unmute video after it starts playing

    // Load user-owned state on sign-in and refresh it when the page regains focus.
    // The relevant tables are intentionally not in the production Realtime
    // publication, so focus refresh is the reliable cross-device sync point.
    useEffect(() => {
        let cancelled = false;
        let refreshInFlight = false;
        let lastRefreshAt = 0;
        const ownerToken = ownerScopeRef.current.capture(userId);

        const clearUserLibrary = () => {
            setFavorites(new Set());
            setWatchLater(new Set());
            setWatchedVideos(new Set());
            setWatchProgress(new Map());
            watchProgressRef.current = new Map();
            setRecentlyWatched([]);
            setPlaylists([]);
            setShowPlaylistModal(null);
            setNewPlaylistName('');
            setIsCreatingPlaylist(false);
            setPlaylistActionError(null);
            setShareToast(null);
            if (shareToastTimer.current) clearTimeout(shareToastTimer.current);
        };

        if (!userId) {
            setPreferences(DEFAULT_VIDEO_LIBRARY_PREFERENCES);
            clearUserLibrary();
            setLibraryStateOwnerId(null);
            setLibrarySyncState('idle');
            setLibrarySyncErrors([]);
            return undefined;
        }

        clearUserLibrary();
        setPreferences(DEFAULT_VIDEO_LIBRARY_PREFERENCES);
        setLibraryStateOwnerId(userId);
        setLibrarySyncState('loading');
        setLibrarySyncErrors([]);

        const refreshUserLibrary = async ({ force = false } = {}) => {
            if (!ownerScopeRef.current.isCurrent(ownerToken)) return;
            const now = Date.now();
            if (refreshInFlight || (!force && now - lastRefreshAt < 500)) return;
            refreshInFlight = true;
            lastRefreshAt = now;
            if (force) {
                setLibrarySyncState('loading');
                setLibrarySyncErrors([]);
            }
            const results = await Promise.allSettled([
                getVideoLibraryPreferences(userId),
                getVideoFavorites(userId),
                getWatchLater(userId),
                getWatchedVideos(userId, 30),
                getWatchProgress(userId),
                getRecentlyWatched(userId, 10),
                getVideoPlaylists(userId),
            ]);
            refreshInFlight = false;
            if (cancelled || !ownerScopeRef.current.isCurrent(ownerToken)) return;

            ownerScopeRef.current.commit(ownerToken, () => {
                const [preferenceResult, favoriteResult, laterResult, watchedResult, progressResult, recentResult, playlistResult] = results;
                if (preferenceResult.status === 'fulfilled') setPreferences(preferenceResult.value);
                if (favoriteResult.status === 'fulfilled') setFavorites(new Set(favoriteResult.value.map(item => canonicalStoredVideoId(item.video_id))));
                if (laterResult.status === 'fulfilled') setWatchLater(new Set(laterResult.value.map(item => canonicalStoredVideoId(item.video_id))));
                if (watchedResult.status === 'fulfilled') setWatchedVideos(new Set([...watchedResult.value].map(canonicalStoredVideoId)));
                if (progressResult.status === 'fulfilled') {
                    const canonicalProgress = new Map();
                    progressResult.value.forEach((progress, videoId) => {
                        const canonicalId = canonicalStoredVideoId(videoId);
                        const existing = canonicalProgress.get(canonicalId);
                        if (!existing || progress.watchedSeconds > existing.watchedSeconds) canonicalProgress.set(canonicalId, progress);
                    });
                    setWatchProgress(canonicalProgress);
                    watchProgressRef.current = canonicalProgress;
                }
                if (recentResult.status === 'fulfilled') {
                    const seenRecent = new Set();
                    setRecentlyWatched(recentResult.value.map(item => ({ ...item, video_id: canonicalStoredVideoId(item.video_id) })).filter(item => {
                        if (seenRecent.has(item.video_id)) return false;
                        seenRecent.add(item.video_id);
                        return true;
                    }));
                }
                if (playlistResult.status === 'fulfilled') setPlaylists(playlistResult.value);
                const resourceNames = ['settings', 'favorites', 'Watch Later', 'history', 'progress', 'recent sessions', 'playlists'];
                const failedResources = results
                    .map((result, index) => result.status === 'rejected' ? resourceNames[index] : null)
                    .filter(Boolean);
                setLibrarySyncErrors(failedResources);
                setLibrarySyncState(failedResources.length === 0 ? 'ready' : failedResources.length === results.length ? 'error' : 'partial');
                if (failedResources.length > 0) {
                    reportVideoLibraryIssue('library_sync', new Error(`Failed resources: ${failedResources.join(', ')}`));
                    showActionNotice('Some saved library data could not be refreshed. Try again.', { tone: 'error' });
                }
            });
        };

        refreshUserLibraryRef.current = refreshUserLibrary;
        void refreshUserLibrary();
        const refreshOnVisible = () => {
            if (document.visibilityState === 'visible') void refreshUserLibrary();
        };
        window.addEventListener('focus', refreshUserLibrary);
        document.addEventListener('visibilitychange', refreshOnVisible);
        return () => {
            cancelled = true;
            refreshUserLibraryRef.current = null;
            if (watchSessionUserIdRef.current === userId) {
                const startTime = watchStartTimeRef.current;
                const video = currentWatchingVideoRef.current;
                watchStartTimeRef.current = null;
                currentWatchingVideoRef.current = null;
                watchSessionUserIdRef.current = null;
                isPlayerPlayingRef.current = false;
                if (startTime && video) {
                    void saveWatchSessionRef.current?.(startTime, video, { quiet: true, sessionUserId: userId });
                }
                setSelectedVideo(null);
            }
            window.removeEventListener('focus', refreshUserLibrary);
            document.removeEventListener('visibilitychange', refreshOnVisible);
        };
    }, [userId, setSelectedVideo, showActionNotice]);

    // Phase 8 learning state is authoritative for the Study Circuit. Hydrate it
    // independently from the legacy library tables and discard stale account
    // responses so an account switch can never expose another owner's state.
    useEffect(() => {
        const controller = new AbortController();
        const token = getAccessToken();
        setLearningStudyIds(new Set());
        setLearningProgressByVideo(new Map());
        if (!userId || !token) return () => controller.abort();
        const ownerToken = ownerScopeRef.current.capture(userId);
        void fetch(`/api/video-library/study-list?ownerId=${encodeURIComponent(userId)}`, {
            cache: 'no-store',
            signal: controller.signal,
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        }).then(async response => {
            if (!response.ok) throw new Error(`Study state request failed (${response.status})`);
            const payload = await response.json();
            if (!payload?.success || payload.ownerId !== userId || !ownerScopeRef.current.isCurrent(ownerToken)) return;
            const lists = Array.isArray(payload.data?.lists) ? payload.data.lists : [];
            const progress = Array.isArray(payload.data?.progress) ? payload.data.progress : [];
            ownerScopeRef.current.commit(ownerToken, () => {
                setLearningStudyIds(new Set(lists.flatMap(list => list.items || []).map(item => item.videoId).filter(Boolean)));
                setLearningProgressByVideo(new Map(progress.filter(item => item.videoId).map(item => [item.videoId, item])));
            });
        }).catch(error => {
            if (error?.name !== 'AbortError') reportVideoLibraryIssue('learning_state_sync', error);
        });
        return () => controller.abort();
    }, [userId]);

    // Hamburger menu handlers - save to Supabase
    const updatePreference = useCallback(async (key, value) => {
        const ownerToken = ownerScopeRef.current.capture(userId);
        const previousValue = preferences[key];
        // BUG-C FIX: use functional setState so rapid toggles never read stale preferences
        setPreferences(prev => ({
            ...(personalStateIsCurrent ? prev : DEFAULT_VIDEO_LIBRARY_PREFERENCES),
            [key]: value,
        }));

        if (userId) {
            try {
                await updateVideoLibraryPreferences(userId, { [key]: value });
            } catch (error) {
                if (!ownerScopeRef.current.isCurrent(ownerToken)) return false;
                console.warn('Failed to save preference:', error);
                ownerScopeRef.current.commit(ownerToken, () => {
                    setPreferences(prev => ({ ...prev, [key]: previousValue }));
                    showActionNotice('Player setting was not saved. Try again.', { tone: 'error' });
                });
                return false;
            }
        }
        return ownerScopeRef.current.isCurrent(ownerToken);
    }, [userId, preferences, personalStateIsCurrent, showActionNotice]);

    const menuConfig = getMenuConfig('video-library', user, preferences, {
        setAutoplay: (val) => updatePreference('autoplay', val),
        setCaptions: (val) => updatePreference('captions', val)
    });

    // Content tracking handlers
    const toggleFavorite = useCallback(async (video) => {
        if (!userId) {
            showActionNotice('Sign in to favorite videos.', { videoId: video.videoId, tone: 'info' });
            return false;
        }

        const ownerToken = ownerScopeRef.current.capture(userId);
        const videoId = video.id;
        const actionKey = `${ownerToken.ownerId}:${ownerToken.generation}:favorite:${videoId}`;
        if (pendingVideoActionsRef.current.has(actionKey)) return false;
        pendingVideoActionsRef.current.add(actionKey);
        const wasFavorite = favorites.has(videoId);

        setFavorites(prev => {
            const next = new Set(personalStateIsCurrent ? prev : EMPTY_VIDEO_SET);
            if (wasFavorite) next.delete(videoId); else next.add(videoId);
            return next;
        });

        try {
            if (wasFavorite) {
                await removeVideoFavorite(userId, videoId, video.legacyId ? [video.legacyId] : []);
            } else {
                await addVideoFavorite(userId, videoId, {
                    title: video.title,
                    source: video.source,
                    video_url: `https://youtube.com/watch?v=${video.videoId}`
                });
            }
            return ownerScopeRef.current.commit(ownerToken, () => {
                showActionNotice(wasFavorite ? 'Removed from favorites.' : 'Added to favorites.', { videoId: video.videoId });
            });
        } catch (error) {
            if (!ownerScopeRef.current.isCurrent(ownerToken)) return false;
            ownerScopeRef.current.commit(ownerToken, () => {
                setFavorites(prev => {
                    const next = new Set(prev);
                    if (wasFavorite) next.add(videoId); else next.delete(videoId);
                    return next;
                });
                showActionNotice('Favorite was not saved. Try again.', { videoId: video.videoId, tone: 'error' });
            });
            return false;
        } finally {
            if (ownerScopeRef.current.isCurrent(ownerToken)) pendingVideoActionsRef.current.delete(actionKey);
        }
    }, [userId, favorites, personalStateIsCurrent, showActionNotice]);

    const toggleWatchLater = useCallback(async (video) => {
        if (!userId) {
            showActionNotice('Sign in to save videos.', { videoId: video.videoId, tone: 'info' });
            return false;
        }

        const ownerToken = ownerScopeRef.current.capture(userId);
        const videoId = video.id;
        const actionKey = `${ownerToken.ownerId}:${ownerToken.generation}:watch-later:${videoId}`;
        if (pendingVideoActionsRef.current.has(actionKey)) return false;
        pendingVideoActionsRef.current.add(actionKey);
        const wasSaved = learningStudyIds.has(video.videoId) || watchLater.has(videoId);

        setWatchLater(prev => {
            const next = new Set(personalStateIsCurrent ? prev : EMPTY_VIDEO_SET);
            if (wasSaved) next.delete(videoId); else next.add(videoId);
            return next;
        });

        try {
            const learningToken = getAccessToken();
            if (!learningToken) throw new Error('Study list authentication is unavailable');
            const learningRequest = async method => {
                const response = await fetch('/api/video-library/study-list', {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${learningToken}`,
                    },
                    body: JSON.stringify({ videoId: video.videoId, ownerId: userId }),
                });
                if (!response.ok) throw new Error(`Study list request failed (${response.status})`);
            };
            if (wasSaved) {
                await learningRequest('DELETE');
                try {
                    await removeFromWatchLater(userId, videoId, video.legacyId ? [video.legacyId] : []);
                } catch (error) {
                    await learningRequest('POST').catch(compensationError => {
                        reportVideoLibraryIssue('study_list_compensation', compensationError);
                    });
                    throw error;
                }
            } else {
                await learningRequest('POST');
                try {
                    await addToWatchLater(userId, videoId, {
                        title: video.title,
                        source: video.source,
                        video_url: `https://youtube.com/watch?v=${video.videoId}`
                    });
                } catch (error) {
                    await learningRequest('DELETE').catch(compensationError => {
                        reportVideoLibraryIssue('study_list_compensation', compensationError);
                    });
                    throw error;
                }
            }
            return ownerScopeRef.current.commit(ownerToken, () => {
                setLearningStudyIds(prev => {
                    const next = new Set(prev);
                    if (wasSaved) next.delete(video.videoId); else next.add(video.videoId);
                    return next;
                });
                showActionNotice(wasSaved ? 'Removed from Watch Later.' : 'Saved to Watch Later.', { videoId: video.videoId });
            });
        } catch (error) {
            if (!ownerScopeRef.current.isCurrent(ownerToken)) return false;
            ownerScopeRef.current.commit(ownerToken, () => {
                setWatchLater(prev => {
                    const next = new Set(prev);
                    if (wasSaved) next.add(videoId); else next.delete(videoId);
                    return next;
                });
                showActionNotice('Watch Later was not updated. Try again.', { videoId: video.videoId, tone: 'error' });
            });
            return false;
        } finally {
            if (ownerScopeRef.current.isCurrent(ownerToken)) pendingVideoActionsRef.current.delete(actionKey);
        }
    }, [userId, learningStudyIds, watchLater, personalStateIsCurrent, showActionNotice]);

    const saveWatchSession = useCallback(async (startTime, video, { quiet = false, sessionUserId = watchSessionUserIdRef.current } = {}) => {
        const effectiveUserId = sessionUserId || userId;
        if (!startTime || !video || !effectiveUserId) return false;
        const ownerToken = ownerScopeRef.current.capture(effectiveUserId);
        if (!ownerScopeRef.current.isCurrent(ownerToken)) return false;
        const watchedSeconds = Math.floor((Date.now() - startTime) / 1000);
        if (watchedSeconds <= 0) return false;

        try {
            const savedSession = await updateWatchDuration(effectiveUserId, video.id, watchedSeconds, {
                title: video.title,
                url: `https://youtube.com/watch?v=${video.videoId}`,
                thumbnail: `https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`,
                durationSeconds: parseDuration(video.duration),
                progressSeconds: playerPositionRef.current
            });
            const learningDuration = parseDuration(video.duration);
            const learningToken = getAccessToken();
            if (learningDuration > 0 && learningToken) {
                const learningResponse = await fetch('/api/video-library/study-list', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${learningToken}`,
                    },
                    body: JSON.stringify({
                        action: 'progress',
                        ownerId: effectiveUserId,
                        videoId: video.videoId,
                        positionSeconds: Math.min(playerPositionRef.current, learningDuration),
                        durationSeconds: learningDuration,
                    }),
                });
                if (!learningResponse.ok) throw new Error(`Learning progress request failed (${learningResponse.status})`);
            }
            if (!ownerScopeRef.current.isCurrent(ownerToken)) return false;
            const persistedProgress = Number(savedSession?.progress_seconds);
            const persistedTotal = Number(savedSession?.watch_duration_seconds);
            if (!Number.isFinite(persistedProgress) || persistedProgress < 0 || !Number.isFinite(persistedTotal) || persistedTotal < 0) throw new Error('Watch Progress Could Not Be Confirmed');
            const nextProgress = persistedProgress;

            ownerScopeRef.current.commit(ownerToken, () => {
                setWatchProgress(prev => {
                    const next = new Map(prev);
                    const current = next.get(video.id) || {};
                    next.set(video.id, {
                        ...current,
                        watchedSeconds: nextProgress,
                        totalWatchedSeconds: persistedTotal,
                        durationSeconds: parseDuration(video.duration) || current.durationSeconds || 0,
                        watchedAt: new Date().toISOString()
                    });
                    watchProgressRef.current = next;
                    return next;
                });
                const confirmedTotal = persistedTotal;
                if (confirmedTotal >= 30) setWatchedVideos(prev => new Set(prev).add(video.id));
            });
            const confirmedTotal = persistedTotal;
            getRecentlyWatched(effectiveUserId, 10)
                .then(recent => {
                    ownerScopeRef.current.commit(ownerToken, () => setRecentlyWatched(recent));
                })
                .catch(() => {
                    ownerScopeRef.current.commit(ownerToken, () => {
                        setRecentlyWatched(prev => [{
                            video_id: video.id,
                            video_title: video.title,
                            watch_duration_seconds: confirmedTotal,
                            watched_at: new Date().toISOString()
                        }, ...prev.filter(item => item.video_id !== video.id)].slice(0, 10));
                    });
                });

            return true;
        } catch (error) {
            if (!ownerScopeRef.current.isCurrent(ownerToken)) return false;
            console.warn('Error saving watch duration:', error);
            ownerScopeRef.current.commit(ownerToken, () => {
                if (!quiet) showActionNotice('Watch progress was not saved. Try again.', { videoId: video.videoId, tone: 'error' });
            });
            return false;
        }
    }, [userId, showActionNotice]);

    // Navigate to a specific video in the current filtered list
    const handleOpenVideo = useCallback(async (video) => {
        if (!isVideoLibraryVideoAllowed(video)) return;
        setMiniPlayer(false);
        const hadActiveSession = Boolean(currentWatchingVideoRef.current);
        if (currentWatchingVideoRef.current?.id === video.id) return;
        playerAutoplayRef.current = preferences.autoplay !== false;
        if (hadActiveSession && watchStartTimeRef.current) {
            const previousVideo = currentWatchingVideoRef.current;
            const previousStartTime = watchStartTimeRef.current;
            watchStartTimeRef.current = null;
            currentWatchingVideoRef.current = null;
            void saveWatchSession(previousStartTime, previousVideo);
        }
        if (!hadActiveSession && typeof document !== 'undefined') {
            const activeElement = document.activeElement;
            videoTriggerRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
                ? activeElement
                : null;
        }
        savedScrollY.current = typeof window !== 'undefined' ? window.scrollY : 0;
        watchStartTimeRef.current = null;
        currentWatchingVideoRef.current = video;
        playerPositionRef.current = watchProgressRef.current.get(video.id)?.watchedSeconds || 0;
        isPlayerPlayingRef.current = false;
        setSelectedVideo(video);
        setIframeKey(k => k + 1); // force iframe remount → guaranteed autoplay
    }, [saveWatchSession, preferences.autoplay]);
    useEffect(() => { saveWatchSessionRef.current = saveWatchSession; }, [saveWatchSession]);
    useEffect(() => () => {
        const startTime = watchStartTimeRef.current;
        const video = currentWatchingVideoRef.current;
        watchStartTimeRef.current = null;
        currentWatchingVideoRef.current = null;
        isPlayerPlayingRef.current = false;
        iframeUnmuteTimers.current.forEach(clearTimeout);
        iframeUnmuteTimers.current = [];
        if (startTime && video) void saveWatchSessionRef.current?.(startTime, video, { quiet: true });
        setSelectedVideo(null);
    }, [setSelectedVideo]);

    const handleVideoCardKeyDown = useCallback((event, video) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        handleOpenVideo(video);
    }, [handleOpenVideo]);
    // Make the callback available before the earlier query effect runs. This
    // keeps static-fallback deep links working even when catalog refresh fails.
    handleOpenVideoRef.current = handleOpenVideo;

    // Navigate to next video in list (TikTok swipe down / arrow right)
    const handleNextVideo = useCallback(() => {
        if (!selectedVideo) return;
        const queuedIndex = playbackQueue.queue.items.findIndex(item => item.videoId === selectedVideo.videoId);
        if (queuedIndex >= 0) {
            const next = playbackQueue.advance(selectedVideo.videoId);
            if (next) void router.push(`${watchPath(next)}?play=1`);
            return;
        }
        if (videos.length === 0) return;
        const idx = videos.findIndex(v => v.videoId === selectedVideo.videoId);
        if (idx < 0) {
            handleOpenVideo(videos[0]);
            return;
        }
        const next = videos[(idx + 1) % videos.length];
        handleOpenVideo(next);
    }, [selectedVideo, videos, handleOpenVideo, playbackQueue, router]);

    // Navigate to previous video (arrow left)
    const handlePrevVideo = useCallback(() => {
        if (!selectedVideo || videos.length === 0) return;
        const idx = videos.findIndex(v => v.videoId === selectedVideo.videoId);
        if (idx < 0) {
            handleOpenVideo(videos[videos.length - 1]);
            return;
        }
        const prev = videos[(idx - 1 + videos.length) % videos.length];
        handleOpenVideo(prev);
    }, [selectedVideo, videos, handleOpenVideo]);


    // Native fullscreen — puts the entire overlay element into browser fullscreen
    const handleFullscreen = useCallback(() => {
        const el = modalOverlayRef.current;
        if (!el) return;
        if (!document.fullscreenElement) {
            el.requestFullscreen?.() ||
            el.webkitRequestFullscreen?.() ||
            el.mozRequestFullScreen?.();
        } else {
            document.exitFullscreen?.() || document.webkitExitFullscreen?.();
        }
    }, []);

    const handleMiniPlayerChange = useCallback((nextMini) => {
        const currentVideoId = currentWatchingVideoRef.current?.videoId;
        const apply = () => {
            if (currentWatchingVideoRef.current?.videoId === currentVideoId) setMiniPlayer(nextMini);
        };
        if (nextMini && (document.fullscreenElement || document.webkitFullscreenElement)) {
            try {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                Promise.resolve(exit.call(document)).then(apply).catch(() => {
                    showActionNotice('Exit Fullscreen To Browse The Library.', { tone: 'error' });
                });
            } catch {
                showActionNotice('Exit Fullscreen To Browse The Library.', { tone: 'error' });
            }
        } else apply();
    }, [showActionNotice]);

    const restoreVideoTriggerFocus = useCallback(() => {
        if (typeof window === 'undefined') return;
        requestAnimationFrame(() => {
            const trigger = videoTriggerRef.current;
            if (trigger?.isConnected) trigger.focus({ preventScroll: true });
            videoTriggerRef.current = null;
        });
    }, []);


    // Handle closing a video - save watch duration
    const handleCloseVideo = useCallback(() => {
        // BUG-J FIX: guard against double-save (Escape + close button simultaneously).
        // Null the refs BEFORE the await so a concurrent call exits immediately.
        const startTime = watchStartTimeRef.current;
        const video = currentWatchingVideoRef.current;
        watchStartTimeRef.current = null;
        currentWatchingVideoRef.current = null;

        // Close immediately; persistence continues without trapping the user in
        // the viewer on a slow network.
        // BUG-K FIX: cancel in-flight iframe unmute timers before iframe unmounts
        iframeUnmuteTimers.current.forEach(clearTimeout);
        iframeUnmuteTimers.current = [];
        setSelectedVideo(null);
        // Reset HUD state
        setVlHudVisible(false);
        clearTimeout(vlHudTimer.current);
        // Restore scroll position after modal closes
        if (typeof window !== 'undefined' && savedScrollY.current > 0) {
            requestAnimationFrame(() => window.scrollTo({ top: savedScrollY.current, behavior: 'instant' }));
        }
        restoreVideoTriggerFocus();
        if (router.query.v) {
            const { v: _videoQuery, ...nextQuery } = router.query;
            openedQueryVideoRef.current = null;
            void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true, scroll: false });
        }
        void saveWatchSession(startTime, video);
    }, [saveWatchSession, restoreVideoTriggerFocus, router]);
    useEffect(() => { handleCloseVideoRef.current = handleCloseVideo; }, [handleCloseVideo]);
    // Back closes the viewer, the Reels viewer and the playlist sheet before
    // it leaves the page (mobile phase 0a).
    useModalHistory(Boolean(selectedVideo), handleCloseVideo);
    const closeReels = useCallback(() => setShowReelsModal(false), []);
    useModalHistory(showReelsModal, closeReels);
    const closePlaylistSheet = useCallback(() => { setShowPlaylistModal(null); setPlaylistActionError(null); }, []);
    useModalHistory(Boolean(showPlaylistModal), closePlaylistSheet);

    // Share a video — copy deep-link to clipboard and show toast
    const handleShareVideo = useCallback(async (video) => {
        // Phase 2: share the video's own page, which previews as that video.
        const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}${watchPath(video)}`;
        try {
            const copied = await copyTextToClipboard(url);
            if (!copied) throw new Error('Copy command was rejected');
            showActionNotice('Video link copied.', { videoId: video.videoId, kind: 'share' });
        } catch (error) {
            showActionNotice('Link could not be copied. Try again.', { videoId: video.videoId, tone: 'error' });
        }
    }, [showActionNotice]);

    // Mark a video as unwatched and remove its persisted history/progress record.
    const handleMarkUnwatched = useCallback(async (video) => {
        if (!userId) return;
        const ownerToken = ownerScopeRef.current.capture(userId);
        const videoId = video.id;
        const actionKey = `${ownerToken.ownerId}:${ownerToken.generation}:history:${videoId}`;
        if (pendingVideoActionsRef.current.has(actionKey)) return;
        pendingVideoActionsRef.current.add(actionKey);

        try {
            await removeFromWatchHistory(userId, videoId, video.legacyId ? [video.legacyId] : []);
            if (!ownerScopeRef.current.isCurrent(ownerToken)) return;
            ownerScopeRef.current.commit(ownerToken, () => {
                setWatchedVideos(prev => { const next = new Set(prev); next.delete(videoId); return next; });
                setWatchProgress(prev => {
                    const next = new Map(prev);
                    next.delete(videoId);
                    watchProgressRef.current = next;
                    return next;
                });
                setRecentlyWatched(prev => prev.filter(item => item.video_id !== videoId));
                showActionNotice('Removed from watch history.', { videoId: video.videoId });
            });
        } catch (error) {
            if (!ownerScopeRef.current.isCurrent(ownerToken)) return;
            ownerScopeRef.current.commit(ownerToken, () => {
                showActionNotice('Watch history was not updated. Try again.', { videoId: video.videoId, tone: 'error' });
            });
        } finally {
            if (ownerScopeRef.current.isCurrent(ownerToken)) pendingVideoActionsRef.current.delete(actionKey);
        }
    }, [userId, showActionNotice]);

    const personalIdsForFilter = useMemo(() => {
        if (libraryFilter === 'favorites') return [...favorites];
        if (libraryFilter === 'watchlater') return [...watchLater];
        if (libraryFilter === 'history') return [...watchedVideos];
        if (libraryFilter === 'playlists') return [...playlistVideoIds];
        return [];
    }, [libraryFilter, favorites, watchLater, watchedVideos, playlistVideoIds]);

    // Search and order are first-class URL state, just like source/type/library.
    // A small debounce keeps typing responsive and produces useful back-button
    // history without issuing a catalog request for every keypress.
    useEffect(() => {
        if (!router.isReady) return undefined;
        const timer = setTimeout(() => {
            setCatalogSearchQuery(searchQuery);
            const currentQuery = Array.isArray(router.query.q) ? router.query.q[0] : (router.query.q || '');
            if (String(currentQuery) !== searchQuery) replaceNavigationQuery({ q: searchQuery || null });
        }, 300);
        return () => clearTimeout(timer);
    }, [router.isReady, router.query.q, searchQuery, replaceNavigationQuery]);

    const fetchCatalogPage = useCallback(async ({ append = false, offset = 0 } = {}) => {
        if (libraryFilter !== 'ALL') {
            if (!userId && libraryFilter !== 'recommended') {
                catalogAbortRef.current?.abort();
                setAllVideos([]);
                setVideos([]);
                setCatalogTotal(0);
                setCatalogHasMore(false);
                setCatalogNextOffset(0);
                setDisplayedCount(0);
                setCatalogLoading(false);
                return;
            }
            if (visibleLibrarySyncState === 'loading') return;
            if (libraryFilter !== 'recommended' && personalIdsForFilter.length === 0) {
                setAllVideos([]);
                setVideos([]);
                setCatalogTotal(0);
                setCatalogHasMore(false);
                setCatalogNextOffset(0);
                setDisplayedCount(0);
                setCatalogLoading(false);
                return;
            }
        }

        const requestId = ++catalogRequestRef.current;
        catalogAbortRef.current?.abort();
        const controller = new AbortController();
        catalogAbortRef.current = controller;
        if (append) setCatalogLoadingMore(true);
        else {
            setCatalogLoading(true);
            setAllVideos([]);
            setVideos([]);
            setDisplayedCount(0);
        }
        setCatalogRefreshFailed(false);

        const params = new URLSearchParams({ limit: '30', offset: String(offset) });
        if (selectedSource !== 'ALL') params.set('source', selectedSource);
        if (selectedType !== 'ALL') params.set('type', selectedType);
        if (catalogSearchQuery.trim()) params.set('q', catalogSearchQuery.trim());
        if (sortMode !== 'default') params.set('sort', sortMode);
        for (const [key, value] of Object.entries(browseFilters)) if (value !== 'ALL') params.set(key, value);
        if (libraryFilter !== 'ALL' && libraryFilter !== 'recommended') params.set('ids', personalIdsForFilter.join(','));

        try {
            // Faceted queries must be filtered before pagination. Semantic search
            // has a bounded candidate pool, so refined searches use the catalog.
            const semanticDiscovery = libraryFilter === 'recommended' || (libraryFilter === 'ALL' && Boolean(catalogSearchQuery.trim())
                && Object.values(browseFilters).every(value => value === 'ALL'));
            const discoveryToken = semanticDiscovery ? getAccessToken() : null;
            if (semanticDiscovery) {
                params.delete('offset');
                params.set('mode', router.query.rank === 'chronological' ? 'chronological' : 'recommended');
                if (userId && discoveryToken) params.set('ownerId', userId);
            }
            const endpoint = semanticDiscovery ? '/api/video-library/discovery' : '/api/video-library/catalog';
            const response = await fetch(`${endpoint}?${params.toString()}`, {
                signal: controller.signal,
                cache: 'no-store',
                headers: {
                    Accept: 'application/json',
                    ...(discoveryToken ? { Authorization: `Bearer ${discoveryToken}` } : {}),
                },
            });
            if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
            const payload = await response.json();
            if (!payload?.success || !Array.isArray(payload.data)) throw new Error('Catalog response was invalid');
            if (semanticDiscovery && discoveryToken && payload.ownerId !== userId) throw new Error('Discovery response owner mismatch');
            if (requestId !== catalogRequestRef.current) return;

            const pageVideos = payload.data
                .filter(isVideoLibraryVideoAllowed)
                .map(video => ({
                    ...video,
                    legacyId: STATIC_VIDEO_CANONICAL_ALIASES.get(video.videoId) || null,
                }));
            const mergePage = previous => {
                const combined = append ? [...previous, ...pageVideos] : pageVideos;
                const seen = new Set();
                const unique = combined.filter(video => {
                    if (!video?.videoId || seen.has(video.videoId)) return false;
                    seen.add(video.videoId);
                    return true;
                });
                // A reposted clip can sit on two different catalog pages; the
                // personal views keep every row the player saved.
                return libraryFilter === 'ALL' ? dedupeVideos(unique) : unique;
            };
            setAllVideos(mergePage);
            setVideos(previous => {
                const next = mergePage(previous);
                setDisplayedCount(next.length);
                return next;
            });
            setCatalogTotal(Number(payload.pagination?.total || pageVideos.length));
            setCatalogHasMore(Boolean(payload.pagination?.hasMore));
            setCatalogNextOffset(Number(payload.pagination?.nextOffset || 0));
        } catch (error) {
            if (error?.name === 'AbortError' || requestId !== catalogRequestRef.current) return;
            console.warn('Video catalog refresh failed; showing the fail-closed empty state:', error);
            reportVideoLibraryIssue('catalog_load', error);
            setCatalogRefreshFailed(true);
            if (!append) {
                // Never fall back to bundled or previously cached playback
                // records. Without fresh persisted availability evidence the
                // only honest catalog is empty.
                setAllVideos([]);
                setVideos([]);
                setDisplayedCount(0);
                setCatalogTotal(0);
                setCatalogHasMore(false);
                setCatalogNextOffset(0);
            }
        } finally {
            if (requestId === catalogRequestRef.current) {
                setCatalogLoading(false);
                setCatalogLoadingMore(false);
            }
        }
    }, [libraryFilter, userId, visibleLibrarySyncState, personalIdsForFilter, selectedSource, selectedType, catalogSearchQuery, sortMode, router.query.rank, browseFilters]);

    useEffect(() => {
        void fetchCatalogPage({ append: false });
        return () => catalogAbortRef.current?.abort();
    }, [selectedSource, selectedType, catalogSearchQuery, sortMode, libraryFilter, userId, visibleLibrarySyncState, personalIdsForFilter, fetchCatalogPage]);

    const rawRequestedQueryVideoId = router.query.v
        ? String(Array.isArray(router.query.v) ? router.query.v[0] : router.query.v)
        : null;
    const requestedQueryVideoId = rawRequestedQueryVideoId
        ? canonicalStoredVideoId(rawRequestedQueryVideoId)
        : null;
    const requestedQueryVideoInCurrentPage = requestedQueryVideoId
        ? allVideos.some(video => video.videoId === requestedQueryVideoId)
        : false;
    requestedQueryVideoIdRef.current = requestedQueryVideoId;

    useEffect(() => {
        if (
            !router.isReady
            || !rawRequestedQueryVideoId
            || !requestedQueryVideoId
            || requestedQueryVideoId === rawRequestedQueryVideoId
        ) return;
        void router.replace(
            { pathname: router.pathname, query: { ...router.query, v: requestedQueryVideoId } },
            undefined,
            { shallow: true, scroll: false },
        );
    }, [router.isReady, router.pathname, rawRequestedQueryVideoId, requestedQueryVideoId]);

    // A shared video deep link may point beyond the currently paginated page.
    // Resolve that one catalog row directly rather than downloading the whole
    // archive or silently leaving the requested video closed. Depend on the
    // requested row's presence instead of the allVideos array identity: the
    // first catalog page normally arrives while this request is in flight, and
    // aborting on every page refresh used to strand valid legacy bookmarks.
    useEffect(() => {
        if (!router.isReady || !handleOpenVideoRef.current) return undefined;
        if (!requestedQueryVideoId) {
            queryVideoFetchRef.current = null;
            setDeepLinkStatus(null);
            return undefined;
        }
        const requestedVideoId = requestedQueryVideoId;
        if (!isVideoLibraryVideoAllowed(requestedVideoId)) {
            queryVideoFetchRef.current = requestedVideoId;
            setDeepLinkStatus({
                type: 'unavailable',
                message: 'This saved video is no longer available for verified embedded playback.',
            });
            return undefined;
        }
        if (openedQueryVideoRef.current === requestedVideoId || requestedQueryVideoInCurrentPage) return undefined;
        if (queryVideoFetchRef.current === requestedVideoId) return undefined;
        queryVideoFetchRef.current = requestedVideoId;
        const requestId = ++queryVideoRequestRef.current;
        const requestIsCurrent = () => (
            requestId === queryVideoRequestRef.current
            && requestedQueryVideoIdRef.current === requestedVideoId
            && queryVideoFetchRef.current === requestedVideoId
        );
        setDeepLinkStatus(null);
        const controller = new AbortController();
        fetch(`/api/video-library/catalog?limit=1&ids=${encodeURIComponent(requestedVideoId)}`, {
            signal: controller.signal,
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        })
            .then(response => response.ok ? response.json() : Promise.reject(new Error(`Deep-link catalog request failed (${response.status})`)))
            .then(payload => {
                if (!requestIsCurrent()) return;
                const video = payload?.data?.[0];
                if (video?.videoId !== requestedVideoId || !isVideoLibraryVideoAllowed(video)) {
                    setDeepLinkStatus({
                        type: 'unavailable',
                        message: 'This saved video is private, restricted, removed, or no longer allows verified embedded playback.',
                    });
                    return;
                }
                if (openedQueryVideoRef.current === requestedVideoId || !handleOpenVideoRef.current) return;
                setDeepLinkStatus(null);
                openedQueryVideoRef.current = requestedVideoId;
                handleOpenVideoRef.current({
                    ...video,
                    legacyId: STATIC_VIDEO_CANONICAL_ALIASES.get(video.videoId) || null,
                });
            })
            .catch(error => {
                if (error?.name === 'AbortError' || !requestIsCurrent()) return;
                queryVideoFetchRef.current = null;
                setDeepLinkStatus({
                    type: 'error',
                    message: 'The saved video could not be verified right now. Retry without clearing your bookmark.',
                });
                reportVideoLibraryIssue('catalog_load', error);
            });
        return () => {
            if (requestId === queryVideoRequestRef.current) {
                queryVideoRequestRef.current += 1;
            }
            controller.abort();
            if (
                queryVideoFetchRef.current === requestedVideoId
                && openedQueryVideoRef.current !== requestedVideoId
            ) {
                queryVideoFetchRef.current = null;
            }
        };
    }, [router.isReady, requestedQueryVideoId, requestedQueryVideoInCurrentPage, deepLinkRetryNonce]);

    // Server-backed infinite pagination. The current response is appended only
    // if it still belongs to the latest filter/search request.
    useEffect(() => {
        if (!catalogHasMore || catalogLoading || catalogLoadingMore || !loadMoreRef.current) return undefined;
        const sentinel = loadMoreRef.current;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                void fetchCatalogPage({ append: true, offset: catalogNextOffset });
            }
        }, { rootMargin: '400px' });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [displayedCount, catalogNextOffset, catalogHasMore, catalogLoading, catalogLoadingMore, fetchCatalogPage]);


    // Keyboard navigation in modal
    useEffect(() => {
        const handleKey = (e) => {
            if (showPlaylistModal) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowPlaylistModal(null);
                    setPlaylistActionError(null);
                }
                return;
            }
            if (ttsOverlay) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    setTtsOverlay(null);
                }
                return;
            }
            if (!selectedVideo || miniPlayer) return;
            const target = e.target;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === 'Escape') { e.preventDefault(); handleCloseVideo(); }
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); handleNextVideo(); }
            if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp') { e.preventDefault(); handlePrevVideo(); }
            if (e.key === 'f' || e.key === 'F') { e.preventDefault(); handleFullscreen(); }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [selectedVideo, miniPlayer, showPlaylistModal, ttsOverlay, handleCloseVideo, handleNextVideo, handlePrevVideo, handleFullscreen]);

    // Slash is the command shortcut for search when no overlay is active.
    useEffect(() => {
        const handleSearchShortcut = (event) => {
            if (selectedVideo || menuOpen || showReelsModal || showPlaylistModal) return;
            if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;

            const target = event.target;
            const isTyping = target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                target?.isContentEditable;
            if (isTyping) return;

            event.preventDefault();
            searchInputRef.current?.focus();
        };

        window.addEventListener('keydown', handleSearchShortcut);
        return () => window.removeEventListener('keydown', handleSearchShortcut);
    }, [selectedVideo, menuOpen, showReelsModal, showPlaylistModal]);

    // Treat the full-screen viewer as a true modal: lock background scrolling,
    // place focus on Close, and keep keyboard focus inside until it is dismissed.
    useEffect(() => {
        if (!selectedVideo || miniPlayer) {
            viewerFocusInitializedRef.current = false;
            return undefined;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusFrame = !showPlaylistModal && !ttsOverlay && !viewerFocusInitializedRef.current
            ? requestAnimationFrame(() => {
                modalCloseButtonRef.current?.focus();
                viewerFocusInitializedRef.current = true;
            })
            : null;

        const containFocus = (event) => {
            if (showPlaylistModal || ttsOverlay) return;
            containDialogFocus(event, modalOverlayRef.current);
        };

        document.addEventListener('keydown', containFocus);
        return () => {
            if (focusFrame) cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', containFocus);
            document.body.style.overflow = previousOverflow;
        };
    }, [selectedVideo, miniPlayer, showPlaylistModal, ttsOverlay]);

    useEffect(() => {
        if (!showPlaylistModal) return undefined;
        const focusFrame = requestAnimationFrame(() => playlistNameInputRef.current?.focus());
        const containFocus = event => containDialogFocus(event, playlistDialogRef.current);
        document.addEventListener('keydown', containFocus);
        return () => {
            cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', containFocus);
            requestAnimationFrame(() => playlistTriggerRef.current?.focus({ preventScroll: true }));
        };
    }, [showPlaylistModal]);

    useEffect(() => {
        if (!ttsOverlay) return undefined;
        const focusFrame = requestAnimationFrame(() => ttsCloseButtonRef.current?.focus());
        const containFocus = event => containDialogFocus(event, ttsDialogRef.current);
        document.addEventListener('keydown', containFocus);
        return () => {
            cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', containFocus);
            requestAnimationFrame(() => ttsTriggerRef.current?.focus({ preventScroll: true }));
        };
    }, [ttsOverlay]);

    useEffect(() => {
        if (!showReelsModal) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusFrame = requestAnimationFrame(() => {
            const firstControl = getFocusableElements(reelsDialogRef.current)[0];
            (firstControl || reelsDialogRef.current)?.focus();
        });
        const containFocus = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setShowReelsModal(false);
                return;
            }
            containDialogFocus(event, reelsDialogRef.current);
        };
        document.addEventListener('keydown', containFocus);
        return () => {
            cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', containFocus);
            document.body.style.overflow = previousOverflow;
            requestAnimationFrame(() => {
                const trigger = [reelsTriggerRef.current, mobileReelsTriggerRef.current]
                    .find(button => button?.getClientRects().length > 0);
                trigger?.focus({ preventScroll: true });
            });
        };
    }, [showReelsModal]);


    // parseViews / parseDuration are now module-scope functions (defined above the component)
    // to prevent a TDZ crash during SSR prerendering. See the comment above for details.


    // Format seconds to readable time
    const formatTime = (seconds) => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    };

    // BUG-D FIX: removed dead progressPercentMap useState (frozen empty Map, never used)
    // and its no-op useEffect([watchProgress]). getProgressPercent reads watchProgress directly.
    const getProgressPercent = useCallback((videoId, durationStr) => {
        const progress = watchProgress.get(videoId);
        if (!progress) return 0;
        const totalSeconds = parseDuration(durationStr);
        if (totalSeconds === 0) return 0;
        return Math.min(100, (progress.watchedSeconds / totalSeconds) * 100);
    }, [watchProgress]);

    // Resolve history records once so the continuity rail never renders empty
    // shells when a video has since left the active catalog.
    const continueWatchingVideos = useMemo(() => recentlyWatched
        .map(item => {
            const video = allVideos.find(candidate => candidate.id === item.video_id);
            if (!video) return null;
            return {
                item,
                video,
                progress: getProgressPercent(video.id, video.duration),
            };
        })
        .filter(entry => entry && entry.progress > 0 && entry.progress < 95), [recentlyWatched, allVideos, getProgressPercent]);

    // ── P3: Related Videos — same source first, then tag overlap, max 8 ──────
    // useMemo: only recomputes when selectedVideo or allVideos changes.
    // CRITICAL: IIFE would score all 345 videos on every render (HUD show/hide,
    // state updates) causing visible jank on mobile. useMemo prevents this.
    const relatedVideos = useMemo(() => {
        if (!selectedVideo) return [];
        const currentTags = new Set((selectedVideo.tags || []).map(t => t.toLowerCase()));
        const scored = allVideos
            .filter(v => v.id !== selectedVideo.id)
            .map(v => {
                let score = 0;
                if (v.source === selectedVideo.source) score += 10;
                if (v.type === selectedVideo.type) score += 3;
                const vTags = (v.tags || []).map(t => t.toLowerCase());
                const overlap = vTags.filter(t => currentTags.has(t)).length;
                score += overlap * 5;
                const ageMs = v.scrapedAt ? Date.now() - new Date(v.scrapedAt).getTime() : Infinity;
                if (ageMs < 7 * 24 * 3600 * 1000) score += 2;
                return { video: v, score };
            })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)
            .map(x => x.video);
        return scored;
    }, [selectedVideo, allVideos]); // ← recomputes only when modal video or library changes


    const discoveryViews = useMemo(() => {
        const now = Date.now();
        const sorted = [...allVideos].sort((a, b) => new Date(b.scrapedAt || b.publishedAt || 0) - new Date(a.scrapedAt || a.publishedAt || 0));
        const searchText = video => [video.title, video.source, ...(video.tags || [])].filter(Boolean).join(' ').toLowerCase();
        const tagged = matcher => sorted.filter(video => matcher(searchText(video)));
        return [
            { id: 'new-today', label: 'New Today', videos: sorted.filter(video => {
                const published = new Date(video.scrapedAt || video.publishedAt || 0).getTime();
                return published > 0 && now - published <= 24 * 60 * 60 * 1000;
            }) },
            { id: 'shorts', label: 'Shorts', videos: sorted.filter(video => parseDuration(video.duration) > 0 && parseDuration(video.duration) <= 180) },
            { id: 'skill-level', label: 'Skill Level', videos: tagged(text => /beginner|intermediate|advanced|fundamental|masterclass/.test(text)) },
            { id: 'creator', label: 'Creator', videos: sorted.filter(video => Boolean(video.source)) },
            { id: 'event', label: 'Event', videos: tagged(text => /wsop|wpt|tournament|event|final table|main event/.test(text)) },
            { id: 'duration', label: 'Under 10 Min', videos: sorted.filter(video => parseDuration(video.duration) > 0 && parseDuration(video.duration) <= 600) },
        ];
    }, [allVideos]);
    // Explore shelf: every discovery view except Shorts, which has its own shelf.
    // An empty default tab falls through to the first view that has videos.
    const exploreViews = useMemo(() => discoveryViews.filter(view => view.id !== 'shorts'), [discoveryViews]);
    const activeDiscoveryView = exploreViews.find(view => view.id === discoveryView && view.videos.length > 0)
        || exploreViews.find(view => view.id === discoveryView)
        || exploreViews.find(view => view.videos.length > 0)
        || discoveryViews[0];
    const shortsVideos = useMemo(() => discoveryViews.find(view => view.id === 'shorts')?.videos || [], [discoveryViews]);

    // Cleanup share toast timer on unmount
    useEffect(() => () => { if (shareToastTimer.current) clearTimeout(shareToastTimer.current); }, []);

    // Cleanup HUD timer on unmount
    useEffect(() => () => { if (vlHudTimer.current) clearTimeout(vlHudTimer.current); }, []);

    // Persist a bounded heartbeat while playback continues. The server caps
    // credit by elapsed time; frequent saves also make browser-close loss small.
    useEffect(() => {
        if (!selectedVideo || !userId) return undefined;
        const heartbeat = setInterval(() => {
            if (!isPlayerPlayingRef.current || !watchStartTimeRef.current || !currentWatchingVideoRef.current) return;
            const startTime = watchStartTimeRef.current;
            const video = currentWatchingVideoRef.current;
            watchStartTimeRef.current = Date.now();
            void saveWatchSession(startTime, video, { quiet: true });
        }, 15000);
        return () => clearInterval(heartbeat);
    }, [selectedVideo, userId, saveWatchSession]);

    // ── BUG-I FIX: Flush pending watch time on tab hide / browser close ──────────
    // Without this, a user closing the tab mid-video loses all watch time because
    // handleCloseVideo never runs. visibilitychange fires reliably on mobile too.
    useEffect(() => {
        const flushWatchTime = () => {
            if (pendingFlushRef.current) return; // debounce double-fire
            if (!watchStartTimeRef.current || !currentWatchingVideoRef.current || !userId) return;
            const sessionOwnerId = watchSessionUserIdRef.current;
            if (!sessionOwnerId || sessionOwnerId !== userId) return;
            const ownerToken = ownerScopeRef.current.capture(sessionOwnerId);
            pendingFlushRef.current = true;
            const startTime = watchStartTimeRef.current;
            const video = currentWatchingVideoRef.current;
            const watchedSeconds = Math.floor((Date.now() - startTime) / 1000);
            watchStartTimeRef.current = null;
            currentWatchingVideoRef.current = null;
            if (watchedSeconds > 0) {
                void flushWatchDuration(video.id, watchedSeconds, {
                    title: video.title,
                    thumbnail: `https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`,
                    durationSeconds: parseDuration(video.duration),
                    progressSeconds: playerPositionRef.current,
                }).catch(error => {
                    if (!ownerScopeRef.current.isCurrent(ownerToken)) return;
                    console.warn('[video-library] lifecycle progress flush failed:', error);
                    reportVideoLibraryIssue('watch_progress_flush', error);
                });
            }
            // Reset debounce after 2s
            setTimeout(() => { pendingFlushRef.current = false; }, 2000);
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushWatchTime();
            } else if (selectedVideo && isPlayerPlayingRef.current && !currentWatchingVideoRef.current) {
                pendingFlushRef.current = false;
                currentWatchingVideoRef.current = selectedVideo;
                watchStartTimeRef.current = Date.now();
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('beforeunload', flushWatchTime);
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('beforeunload', flushWatchTime);
        };
    }, [userId, selectedVideo]);

    const activeSourceName = SOURCES.find(source => source?.id === selectedSource)?.name || selectedSource;
    const activeFilterLabels = [
        selectedType !== 'ALL' ? ({
            cash: 'Cash Games',
            tournament: 'Tournaments',
            slots: 'Casino And Slots',
            sports: 'Sports',
        }[selectedType] || selectedType) : null,
        selectedSource !== 'ALL' ? activeSourceName : null,
        sortMode !== 'default' ? (sortMode === 'trending' ? 'Trending' : 'Top Rated') : null,
        libraryFilter !== 'ALL' ? ({ recommended: 'Recommended For You', favorites: 'Favorites', history: 'Watch History', watchlater: 'Watch Later', playlists: 'Playlists' }[libraryFilter] || libraryFilter) : null,
        searchQuery ? `Search: “${searchQuery}”` : null,
        ...Object.entries(browseFilters).filter(([, value]) => value !== 'ALL').map(([key, value]) => BROWSE_FILTER_OPTIONS[key].find(option => option.id === value)?.label),
    ].filter(Boolean);
    const hasActiveFilters = activeFilterLabels.length > 0;

    const emptyState = catalogRefreshFailed && !hasActiveFilters
        ? {
            eyebrow: 'Catalog Signal Offline',
            title: 'Verified Videos Are Temporarily Unavailable',
            copy: 'The Library Is Failing Closed Until Fresh Availability Evidence Can Be Loaded.',
            action: 'Retry Catalog',
        }
        : searchQuery
        ? {
            eyebrow: 'Search complete',
            title: 'No Match In The Library',
            copy: `Nothing matches “${searchQuery}”. Clear the search to return to the full table.`,
            action: 'Clear Search',
        }
        : libraryFilter === 'favorites'
            ? {
                eyebrow: 'Favorites',
                title: userId ? 'No Favorites Yet' : 'Favorites Need Your Profile',
                copy: userId
                    ? 'Favorite a video in the viewer and it will be waiting here for your next study session.'
                    : 'Sign in through the Hub to load and sync your favorite videos across devices.',
                action: userId ? 'Browse All Videos' : 'Sign In To Sync',
            }
            : libraryFilter === 'watchlater'
                ? {
                    eyebrow: 'Watch Later',
                    title: userId ? 'Your Queue Is Clear' : 'Your Queue Needs Your Profile',
                    copy: userId
                        ? 'Save a video from the viewer to build a focused study queue.'
                        : 'Sign in through the Hub to load and sync your Watch Later queue.',
                    action: userId ? 'Browse All Videos' : 'Sign In To Sync',
                }
                : libraryFilter === 'history'
                    ? {
                        eyebrow: 'Watch History',
                        title: userId ? 'No Watch History Yet' : 'History Needs Your Profile',
                        copy: userId
                            ? 'Start a video and your recent sessions will appear here automatically.'
                            : 'Sign in through the Hub to resume your recent study sessions across devices.',
                        action: userId ? 'Browse All Videos' : 'Sign In To Sync',
                    }
                    : libraryFilter === 'playlists'
                        ? {
                            eyebrow: 'Playlists',
                            title: userId ? 'No Playlist Videos Yet' : 'Playlists Need Your Profile',
                            copy: userId
                                ? 'Add a video to a named playlist from the viewer and it will appear here.'
                                : 'Sign in through the Hub to load and sync your study playlists across devices.',
                            action: userId ? 'Browse All Videos' : 'Sign In To Sync',
                        }
                    : {
                        eyebrow: 'Filter complete',
                        title: 'No Videos In This View',
                        copy: 'This combination is too narrow. Reset the view to reopen the full library.',
                        action: 'Reset View',
                    };

    const clearAllFilters = () => {
        setBrowseFilters({ game: 'ALL', stakes: 'ALL', skill: 'ALL' });
        setSearchQuery('');
        setCatalogSearchQuery('');
        setSelectedSource('ALL');
        setSelectedType('ALL');
        setSortMode('default');
        setLibraryFilter('ALL');
        if (router.query.type || router.query.source || router.query.filter || router.query.q || router.query.sort || router.query.rank || router.query.game || router.query.stakes || router.query.skill) {
            const { type: _type, source: _source, filter: _filter, q: _q, sort: _sort, rank: _rank, game: _game, stakes: _stakes, skill: _skill, ...nextQuery } = router.query;
            hadNavigationQueryRef.current = false;
            void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true, scroll: false });
        }
    };

    const handleEmptyStateAction = () => {
        if (catalogRefreshFailed && !hasActiveFilters) {
            void fetchCatalogPage({ append: false });
            return;
        }
        if (!userId && libraryFilter !== 'ALL' && !searchQuery) {
            void router.push(`/auth/login?redirect=${encodeURIComponent(router.asPath)}`);
            return;
        }
        const returningFromSearch = Boolean(searchQuery);
        clearAllFilters();
        requestAnimationFrame(() => {
            if (returningFromSearch) {
                searchInputRef.current?.focus();
                return;
            }
            document.querySelector('.vl-card-open-button')?.focus();
        });
    };

    const selectedLearningProgress = selectedVideo ? learningProgressByVideo.get(selectedVideo.videoId) : null;
    const selectedVideoProgress = selectedLearningProgress
        ? Number(selectedLearningProgress.percent_complete || 0) * 100
        : selectedVideo
            ? getProgressPercent(selectedVideo.id, selectedVideo.duration)
            : 0;
    const latestSavedResumeSeconds = selectedVideo && selectedVideoProgress > 0 && selectedVideoProgress < 95
        ? Math.floor(selectedLearningProgress?.position_seconds || watchProgress.get(selectedVideo.id)?.watchedSeconds || 0)
        : 0;

    // Watch-history saves update the displayed progress, never the active
    // iframe URL. A new player key captures the latest saved resume point.
    if (playerResumeRef.current.key !== iframeKey) {
        playerResumeRef.current = { key: iframeKey, seconds: latestSavedResumeSeconds };
    }
    const selectedVideoResumeSeconds = playerResumeRef.current.seconds;

    const refreshLibrary = useCallback(async () => {
        if (!requireOnline()) return;
        haptic('light');
        setCatalogRefreshFailed(false);
        await fetchCatalogPage({ append: false });
    }, [requireOnline, haptic, fetchCatalogPage]);

    return (
        <>
            {/* AEO phase 3 (2026-09-17): this MUST stay outside <PageTransition>.
                PageTransition is dynamic(..., { ssr: false }), so a head that
                sits inside it never reaches the server HTML. This page shipped
                no title, no description and no canonical to any crawler, while
                sitting in the sitemap at priority 0.8. */}
            <SEOHead
                title="Poker Video Library: Strategy And Coverage"
                description="A Curated Poker Video Library On Smarter.Poker: Strategy Content, Tournament Coverage And Training Videos, With Watch History And AI Tactical Analysis. Free To Watch."
                canonical="/hub/video-library"
                jsonLd={VIDEO_LIBRARY_SCHEMA}
            />

        {/* disableInitialAnimation: the entrance variant starts at opacity 0,
            and text that arrives invisible and waits for JavaScript is the
            wrong thing to serve a crawler or a slow connection. */}
        <PageTransition disableInitialAnimation>

            {/* MOBILE PHASE 9 (docs/mobile-standard): HubPageShell owns the shell
                (100dvh, overflow-x clip, no page-owned bottom pad: BottomNavSpacer
                in _app.js clears the bottom bar). The world background and the
                page padding stay on .video-library-page. */}
            <div className="video-library-page">
                <HubPageShell
                    className="video-library"
                    maxWidth={1600}
                    header={(
                        <div className="vl-header-area">
                            <div className="vl-global-header">
                                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />
                                <HamburgerMenu
                                    isOpen={menuOpen}
                                    onClose={() => setMenuOpen(false)}
                                    direction="left"
                                    theme="dark"
                                    user={null}
                                    showProfile={false}
                                    menuItems={menuConfig.menuItems}
                                    bottomLinks={menuConfig.bottomLinks}
                                />
                            </div>
                        </div>
                    )}
                >
                <PullToRefresh
                    onRefresh={refreshLibrary}
                    disabled={menuOpen || Boolean(selectedVideo) || showReelsModal || Boolean(showPlaylistModal)}
                >
                <div className="vl-yt" data-tutorial="main">
                    <h1 className="vl-sr-only">{currentViewMeta.title}</h1>

                    {/* Search, then one row of chips: the YouTube phone layout. */}
                    <div className="vl-topbar">
                        <BrowseSearch
                            inputRef={searchInputRef}
                            value={searchQuery}
                            onChange={setSearchQuery}
                            onSearch={query => { setCatalogSearchQuery(query); replaceNavigationQuery({ q: query || null }); }}
                            suggestions={browseSuggestions}
                            placeholder={libraryFilter === 'ALL' ? 'Search Poker Videos' : `Search ${currentViewMeta.title}`}
                        />
                        <VideoLibraryCommandRail
                            ref={mobileFilterRailRef}
                            selectedType={selectedType}
                            libraryFilter={libraryFilter}
                            sortMode={sortMode}
                            libraryViews={LIBRARY_VIEW_OPTIONS}
                            personalViewCounts={personalViewCounts}
                            onBrowse={selectBrowseView}
                            onLibrary={selectPersonalView}
                            onSort={selectSortView}
                            onOpenReels={() => setShowReelsModal(true)}
                            reelsTriggerRef={reelsTriggerRef}
                        />
                    </div>

                    <section className="vl-browse-filters" aria-label="Poker Video Filters">
                        <div className="vl-browse-filter-fields">
                            {Object.entries({ game: 'Game', stakes: 'Stakes', skill: 'Skill Level' }).map(([key, label]) => (
                                <label key={key}>{label}
                                    <select aria-label={label} value={browseFilters[key]} onChange={event => {
                                        const value = event.target.value;
                                        const next = { ...browseFilters, [key]: value };
                                        setBrowseFilters(next);
                                        replaceNavigationQuery(next);
                                    }}>
                                        {BROWSE_FILTER_OPTIONS[key].map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                                    </select>
                                </label>
                            ))}
                            {Object.values(browseFilters).some(value => value !== 'ALL') && <button type="button" onClick={clearAllFilters}>Clear Filters</button>}
                        </div>
                        <p>Filters Match Published Titles And Tags. Unlabeled Videos Appear In All.
                            {Object.values(browseFilters).some(value => value !== 'ALL') && ' Filtered Search Matches Published Titles And Channels.'}</p>
                    </section>

                    <nav className="vl-learning-navigation" aria-label="Poker Learning"><Link href="/hub/video-library/players">Poker Players</Link><Link href="/hub/video-library/owner">Control Panel</Link></nav>
                    <MemberClipUpload />
                    {/* Channels: round avatars like YouTube subscriptions, laid out
                        in rows (no hidden sideways rail), the rest behind Show All. */}
                    <div className={`vl-source-pills${sourcesExpanded ? ' is-expanded' : ''}`} data-tutorial="sources" role="group" aria-label="Channels">
                        {[{ id: 'ALL', name: 'All Channels', logo: null }, ...SOURCES.filter(source => source && typeof source === 'object' && source.id && source.id !== 'ALL')].map(source => {
                            const isActive = selectedSource === source.id;
                            const initials = source.id === 'ALL' ? 'All' : (source.name || source.id || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                            return (
                                <button
                                    type="button"
                                    key={source.id}
                                    className={`vl-source-button${isActive ? ' is-active' : ''}`}
                                    aria-label={`Show videos from ${source.name}`}
                                    aria-pressed={isActive}
                                    aria-controls="video-library-grid"
                                    onClick={(event) => {
                                        selectSourceView(source.id, event.currentTarget);
                                    }}
                                    title={source.name}
                                >
                                    <span className="vl-source-logo-media" aria-hidden="true">
                                        {source.logo ? (
                                            <img
                                                src={source.logo}
                                                alt=""
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        ) : (
                                            <span className={source.id === 'ALL' ? 'vl-source-all-mark' : undefined}>{initials}</span>
                                        )}
                                    </span>
                                    <span className="vl-source-name">
                                        {source.id === 'ALL' ? 'All' : source.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {SOURCES.length > 10 && (
                        <button
                            type="button"
                            className="vl-text-button vl-show-all-sources"
                            aria-expanded={sourcesExpanded}
                            onClick={() => { haptic('light'); setSourcesExpanded(expanded => !expanded); }}
                        >
                            {sourcesExpanded
                                ? 'Show Fewer Channels'
                                : `Show All ${SOURCES.filter(source => source && typeof source === 'object' && source.id && source.id !== 'ALL').length} Channels`}
                        </button>
                    )}
                    {selectedSource !== 'ALL' && <a className="vl-channel-link vl-selected-channel" href={channelPath(selectedSource)}>View {activeSourceName} Channel</a>}

                    {/* Search results count — shown when query is active */}
                    {searchQuery && (
                        <div className="vl-search-results">
                            <span>{videos.length} result{videos.length !== 1 ? 's' : ''} For <strong>&ldquo;{searchQuery}&rdquo;</strong></span>
                            {videos.length === 0 && (
                                <button
                                    type="button"
                                    onClick={clearAllFilters}
                                    className="vl-text-button"
                                >
                                    Clear Filters
                                </button>
                            )}
                        </div>
                    )}

                    {libraryFilter !== 'ALL' && (
                        <section className="vl-subview-banner" aria-labelledby="vl-subview-title">
                            <div className="vl-subview-copy">
                                <h2 id="vl-subview-title">{currentViewMeta.title}</h2>
                                <span>
                                    {catalogTotal} {catalogTotal === 1 ? 'video' : 'videos'}
                                    {userId && libraryFilter !== 'recommended' ? ` · ${personalSavedVideoCounts[libraryFilter]} saved` : ''}
                                </span>
                            </div>
                            {!userId && (
                                <button
                                    type="button"
                                    className="vl-pill-button is-primary"
                                    onClick={() => void router.push(`/auth/login?redirect=${encodeURIComponent(router.asPath)}`)}
                                >
                                    Sign In To Sync
                                </button>
                            )}
                        </section>
                    )}

                    {userId && libraryFilter !== 'ALL' && visibleLibrarySyncState === 'loading' && (
                        <div className="vl-sync-panel is-loading" role="status" aria-live="polite">
                            <span className="vl-sync-pulse" aria-hidden="true" />
                            <div><strong>Syncing Your Library</strong><span>Loading Saved Videos And Progress.</span></div>
                        </div>
                    )}

                    {userId && (visibleLibrarySyncState === 'partial' || visibleLibrarySyncState === 'error') && (
                        <div className="vl-sync-panel is-error" role="alert">
                            <div>
                                <strong>{visibleLibrarySyncState === 'error' ? 'Your Library Did Not Load' : 'Part Of Your Library Is Offline'}</strong>
                                <span>{visibleLibrarySyncErrors.length ? `Retry ${visibleLibrarySyncErrors.join(', ')}.` : 'Retry the saved-library connection.'}</span>
                            </div>
                            <button type="button" className="vl-pill-button" onClick={() => void refreshUserLibraryRef.current?.({ force: true })}>Retry Sync</button>
                        </div>
                    )}

                    {hasActiveFilters && (
                        <div className="vl-active-view" aria-label="Active video filters">
                            <span className="vl-active-filter-list">{activeFilterLabels.join(' · ')}</span>
                            <button type="button" className="vl-text-button" onClick={clearAllFilters}>Reset</button>
                        </div>
                    )}

                {/* Continue Watching: a laid-out grid of cards with a progress bar */}
                {continueWatchingVideos.length > 0 && (
                    <section className="vl-shelf vl-continue-watching" data-tutorial="continue" aria-labelledby="vl-continue-title">
                        <div className="vl-shelf-header">
                            <h2 id="vl-continue-title">Continue Watching</h2>
                            <button
                                type="button"
                                className="vl-text-button"
                                onClick={() => handleOpenVideo(continueWatchingVideos[0].video)}
                                aria-label={`Resume latest video: ${continueWatchingVideos[0].video.title}`}
                            >
                                Resume Latest
                            </button>
                        </div>
                        <div className="vl-shelf-grid">
                            {continueWatchingVideos.slice(0, cwVisible).map(({ item, video, progress }) => {
                                const roundedProgress = Math.round(progress);
                                return (
                                    <div
                                        key={item.video_id}
                                        onClick={() => handleOpenVideo(video)}
                                        onKeyDown={(event) => handleVideoCardKeyDown(event, video)}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Resume ${video.title}, ${roundedProgress}% complete`}
                                        className="vl-shelf-card"
                                    >
                                        <div className="vl-shelf-media">
                                            <VideoThumbnail video={video} size={THUMBNAIL_SIZES.small} />
                                            {video.duration && <span className="vl-duration">{video.duration}</span>}
                                            <div
                                                className="vl-progress-track"
                                                role="progressbar"
                                                aria-label={`${video.title} watch progress`}
                                                aria-valuemin="0"
                                                aria-valuemax="100"
                                                aria-valuenow={roundedProgress}
                                            >
                                                <span className="vl-progress-fill" style={{ '--vl-progress': `${progress}%` }} />
                                            </div>
                                        </div>
                                        <strong className="vl-shelf-title">{video.title}</strong>
                                        <span className="vl-shelf-meta">{formatTime(item.watch_duration_seconds || 0)} Watched</span>
                                    </div>
                                );
                            })}
                        </div>
                        {continueWatchingVideos.length > cwVisible && (
                            <button type="button" className="vl-show-more" onClick={() => { haptic('light'); setCwVisible(continueWatchingVideos.length); }}>
                                Show All {continueWatchingVideos.length}
                            </button>
                        )}
                    </section>
                )}

                {/* Video Grid */}
                {catalogRefreshFailed && (
                    <div className="vl-catalog-notice" role="alert">
                        <span>Live Catalog Refresh Is Temporarily Unavailable. Unverified Cached Videos Stay Hidden.</span>
                        <button type="button" className="vl-pill-button" onClick={() => void fetchCatalogPage({ append: false })}>Retry Catalog</button>
                    </div>
                )}
                {deepLinkStatus && (
                    <div className="vl-catalog-notice" role="alert" data-video-deep-link-status={deepLinkStatus.type}>
                        <span>{deepLinkStatus.message}</span>
                        {deepLinkStatus.type === 'error' ? (
                            <button type="button" className="vl-pill-button" onClick={() => setDeepLinkRetryNonce(value => value + 1)}>Retry Video</button>
                        ) : (
                            <button
                                type="button"
                                className="vl-pill-button"
                                onClick={() => void router.replace(
                                    { pathname: router.pathname, query: { ...router.query, v: undefined } },
                                    undefined,
                                    { shallow: true, scroll: false },
                                )}
                            >
                                Browse Verified Library
                            </button>
                        )}
                    </div>
                )}
                <span className="vl-sr-only" role="status" aria-live="polite">
                    {`${videos.length} videos available`}
                </span>
                <StudyStatus />
                {playbackQueue.error && <p role="alert">{playbackQueue.error}</p>}
                <VideoQueue currentVideoId={selectedVideo?.videoId} ownerId={userId} onPlay={item => void router.push(`${watchPath(item)}?play=1`)} />
                {libraryFilter === 'playlists' && userId && <section className="vl-playlist-index" aria-label="Your Playlists">{playlists.map(list => <a key={list.id} className="vl-playlist-index-link" href={playlistPath(list.id)}><span data-user-content>{list.name}</span><span>{(list.items || []).length} Saved Videos</span></a>)}</section>}
                {libraryFilter === 'ALL' && <LiveNow channelId={selectedSource === 'ALL' ? undefined : selectedSource} />}
                <div
                    id="video-library-grid"
                    className="vl-video-grid"
                    data-tutorial="grid"
                    /* aria-label is prohibited on a role-less div (axe
                       aria-prohibited-attr, serious). A labelled region is
                       what the command rail's aria-controls points at. */
                    role="region"
                    aria-label="Poker videos"
                >
                    {catalogLoading && videos.length === 0 && Array.from({ length: 6 }, (_, index) => (
                        <div key={`catalog-skeleton-${index}`} className="vl-video-skeleton" aria-hidden="true">
                            <span className="vl-skeleton-media" />
                            <span className="vl-skeleton-row">
                                <span className="vl-skeleton-avatar" />
                                <span className="vl-skeleton-lines">
                                    <span className="vl-skeleton-line is-wide" />
                                    <span className="vl-skeleton-line" />
                                </span>
                            </span>
                        </div>
                    ))}
                    {/* Only verified live rows render. Loading has an explicit
                        skeleton above; a failed refresh stays empty and shows
                        the retry state below instead of stale playable data. */}
                    {videos.map((video, index) => {
                        const progress = getProgressPercent(video.id, video.duration);
                        const roundedProgress = Math.round(progress);
                        const openLabel = progress > 0 && progress < 95 ? 'Resume' : 'Play';
                        const isFeatured = index === 0 && !hasActiveFilters && videos.length > 0;
                        const channel = getVideoChannel(video);
                        const showShortsShelf = index === 3 && !hasActiveFilters && shortsVideos.length > 0;
                        const showExploreShelf = index === Math.min(7, videos.length - 1) && !hasActiveFilters && exploreViews.length > 0;
                        return (
                        <Fragment key={video.id}>
                        <div
                            className={`vl-video-card${isFeatured ? ' is-featured' : ''}`}
                        >
                            {/* A real link to the video's own page (Phase 2): crawlers and
                                "open in new tab" follow it; a plain tap or click opens the
                                in-page viewer instead, exactly as before. */}
                            <a
                                href={watchPath(video)}
                                className="vl-card-open-button"
                                aria-label={`${openLabel} ${video.title}${progress > 0 ? `, ${roundedProgress}% complete` : ''}`}
                                onClick={(event) => {
                                    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                                    event.preventDefault();
                                    handleOpenVideo(video);
                                }}
                            />
                            {/* Thumbnail */}
                            <div className="vl-video-thumb">
                                <VideoThumbnail video={video} priority={index === 0} />
                                {video.duration && <span className="vl-duration">{video.duration}</span>}
                                {watchedVideos.has(video.id) && progress <= 0 && (
                                    <span className="vl-watched-badge">Watched</span>
                                )}
                                {progress > 0 && (
                                    <div
                                        className="vl-progress-track"
                                        role="progressbar"
                                        aria-label={`${video.title} watch progress`}
                                        aria-valuemin="0"
                                        aria-valuemax="100"
                                        aria-valuenow={roundedProgress}
                                    >
                                        <span className="vl-progress-fill" style={{ '--vl-progress': `${progress}%` }} />
                                    </div>
                                )}
                            </div>

                            {/* Info: channel avatar, title, one meta line, more-actions */}
                            <div className="vl-card-info">
                                <ChannelAvatar video={video} channel={channel} />
                                <div className="vl-card-text">
                                    <h3 className="vl-card-title">
                                        {video.title}
                                    </h3>
                                    <p className="vl-card-meta">{getVideoMetaLine(video)}</p>
                                    <PlayerLinks video={video} />
                                </div>
                                <button
                                    type="button"
                                    id={`vl-share-${video.videoId}`}
                                    className="vl-card-menu-button"
                                    aria-label={`More actions for ${video.title}`}
                                    aria-haspopup="dialog"
                                    onClick={e => { e.stopPropagation(); haptic('light'); setCardMenuVideo(video); }}
                                >
                                    <span aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                        {showShortsShelf && (
                            <section className="vl-shelf vl-shorts-shelf" aria-labelledby="vl-shorts-title">
                                <div className="vl-shelf-header">
                                    <h2 id="vl-shorts-title">Shorts</h2>
                                    <button type="button" className="vl-text-button" onClick={() => setShowReelsModal(true)}>Open Reels</button>
                                </div>
                                <div className="vl-shorts-grid">
                                    {shortsVideos.slice(0, shortsVisible).map(short => (
                                        <div
                                            key={`short-${short.videoId}`}
                                            className="vl-short-card"
                                            onClick={() => handleOpenVideo(short)}
                                            onKeyDown={(event) => handleVideoCardKeyDown(event, short)}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Play ${short.title}`}
                                        >
                                            <VideoThumbnail video={short} vertical />
                                            <div className="vl-short-copy">
                                                <strong>{short.title}</strong>
                                                <span>{formatViewCount(short.views) || short.duration}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {shortsVideos.length > shortsVisible && (
                                    <button type="button" className="vl-show-more" onClick={() => { haptic('light'); setShortsVisible(value => value + 4); }}>
                                        Show More Shorts
                                    </button>
                                )}
                            </section>
                        )}
                        {showExploreShelf && (
                            <section className="vl-shelf vl-explore-shelf" aria-labelledby="vl-discovery-title" data-video-library-discovery>
                                <div className="vl-shelf-header">
                                    <h2 id="vl-discovery-title">Explore</h2>
                                </div>
                                <div className="vl-explore-tabs" role="tablist" aria-label="Video discovery views">
                                    {exploreViews.map(view => (
                                        <button
                                            type="button"
                                            role="tab"
                                            key={view.id}
                                            className={`vl-filter-button${activeDiscoveryView.id === view.id ? ' is-active' : ''}`}
                                            aria-selected={activeDiscoveryView.id === view.id}
                                            onClick={() => setDiscoveryView(view.id)}
                                        >
                                            <span>{view.label}</span>
                                        </button>
                                    ))}
                                </div>
                                {activeDiscoveryView.videos.length > 0 ? (
                                    <div className="vl-shelf-grid" role="tabpanel" aria-label={activeDiscoveryView.label}>
                                        {activeDiscoveryView.videos.slice(0, 4).map(item => (
                                            <div
                                                key={`${activeDiscoveryView.id}-${item.videoId}`}
                                                className="vl-shelf-card"
                                                onClick={() => handleOpenVideo(item)}
                                                onKeyDown={(event) => handleVideoCardKeyDown(event, item)}
                                                role="button"
                                                tabIndex={0}
                                                aria-label={`Play ${item.title}`}
                                            >
                                                <div className="vl-shelf-media">
                                                    <VideoThumbnail video={item} size={THUMBNAIL_SIZES.small} />
                                                    {item.duration ? <span className="vl-duration">{item.duration}</span> : null}
                                                </div>
                                                <strong className="vl-shelf-title">{item.title}</strong>
                                                <span className="vl-shelf-meta">{getVideoChannel(item).name}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="vl-empty-copy" role="status">No Verified Videos Match This View Yet.</p>}
                            </section>
                        )}
                        </Fragment>
                        );
                    })}
                </div>

                {/* Infinite Scroll Sentinel */}
                {catalogHasMore && (
                    <div ref={loadMoreRef} className="vl-load-more-sentinel" aria-hidden="true" />
                )}

                {catalogLoadingMore && <div className="vl-load-more-status" role="status">Loading More Videos</div>}

                {/* No results */}
                {!catalogLoading && videos.length === 0 && (
                    <div className="vl-empty-state">
                        <span className="vl-empty-kicker">{emptyState.eyebrow}</span>
                        <h3>{emptyState.title}</h3>
                        <p>{emptyState.copy}</p>
                        <button
                            type="button"
                            className="vl-pill-button is-primary"
                            onClick={handleEmptyStateAction}
                        >
                            {emptyState.action}
                        </button>
                    </div>
                )}

                {/* Video count */}
                {videos.length > 0 && (
                    <div className="vl-video-count">
                        Showing {videos.length} Of {catalogTotal}
                        {libraryFilter !== 'ALL' && libraryFilter !== 'recommended' ? ` · ${personalSavedVideoCounts[libraryFilter]} saved` : ''}
                    </div>
                )}
                </div>
                </PullToRefresh>
                </HubPageShell>
            </div>

            {/* Video Modal: YouTube watch layout. The player sits at the top
                (pinned while the page below it scrolls on a phone), then the
                title, channel, one row of actions, study tools and Up Next.
                On desktop Up Next moves into a right-hand column. */}
            {selectedVideo && (() => {
                const selectedChannel = getVideoChannel(selectedVideo);
                const selectedVideoKey = selectedVideo?.id || selectedVideo?.videoId;
                return (
                <div
                    ref={modalOverlayRef}
                    className={`vl-viewer${miniPlayer ? ' is-mini-player' : ''}`}
                    role={miniPlayer ? 'region' : 'dialog'}
                    aria-modal={miniPlayer ? undefined : true}
                    aria-label={miniPlayer ? selectedVideo.title : undefined}
                    aria-labelledby={miniPlayer ? undefined : 'vl-viewer-title'}
                    aria-describedby={miniPlayer ? undefined : 'vl-viewer-help'}
                >
                    <p id="vl-viewer-help" className="vl-sr-only">
                        Use The Arrow Keys For The Previous Or Next Video, F For Fullscreen, And Escape To Close.
                    </p>

                    <div className="vl-watch">
                    <div className="vl-watch-player">
                        <div className="vl-watch-topbar">
                            <button
                                ref={modalCloseButtonRef}
                                type="button"
                                onClick={handleCloseVideo}
                                className="vl-modal-close"
                                aria-label="Close"
                            ><span className="vl-back-chevron" aria-hidden="true" />Close</button>
                            {/* Prev / Next — desktop only (JS detection, no CSS tricks) */}
                            {!isTouchDevice && (
                              <span className="vl-player-nav-group">
                                <button
                                    type="button"
                                    className="vl-player-nav"
                                    data-side="previous"
                                    onClick={handlePrevVideo}
                                    aria-label="Play previous video"
                                    title="Previous Video"
                                >Previous</button>
                                <button
                                    type="button"
                                    className="vl-player-nav"
                                    data-side="next"
                                    onClick={handleNextVideo}
                                    aria-label="Play next video"
                                    title="Next Video"
                                >Next</button>
                              </span>
                            )}
                        </div>

                    <div
                        className={`vl-player-stage${parseDuration(selectedVideo.duration) > 0 && parseDuration(selectedVideo.duration) <= 180 ? ' is-vertical-player' : ''}`}
                        onMouseMove={!isTouchDevice ? vlRevealHud : undefined}
                        onFocusCapture={!isTouchDevice ? vlRevealHud : undefined}
                    >
                        {/* Edge swipe strips — thin vertical zones on left/right edges.
                            Center 70% remains fully interactive for YouTube controls/playback. */}
                        {isTouchDevice && (
                          <>
                            <div
                                onTouchStart={e => {
                                    swipeTouchStart.current = e.touches[0].clientX;
                                    swipeTouchStartY.current = e.touches[0].clientY;
                                }}
                                onTouchEnd={e => {
                                    const dy = e.changedTouches[0].clientY - (swipeTouchStartY.current || 0);
                                    swipeTouchStart.current = null;
                                    swipeTouchStartY.current = null;
                                    if (Math.abs(dy) > 50) {
                                        if (dy < 0) handleNextVideo(); else handlePrevVideo();
                                    }
                                }}
                                className="vl-swipe-zone vl-swipe-zone--previous"
                            />
                            <div
                                onTouchStart={e => {
                                    swipeTouchStart.current = e.touches[0].clientX;
                                    swipeTouchStartY.current = e.touches[0].clientY;
                                }}
                                onTouchEnd={e => {
                                    const dy = e.changedTouches[0].clientY - (swipeTouchStartY.current || 0);
                                    swipeTouchStart.current = null;
                                    swipeTouchStartY.current = null;
                                    if (Math.abs(dy) > 50) {
                                        if (dy < 0) handleNextVideo(); else handlePrevVideo();
                                    }
                                }}
                                className="vl-swipe-zone vl-swipe-zone--next"
                            />
                          </>
                        )}

                        <iframe
                            ref={playerIframeRef}
                            key={iframeKey}
                            id="youtube-player"
                            src={`https://www.youtube-nocookie.com/embed/${selectedVideo.videoId}?autoplay=${playerAutoplayRef.current ? 1 : 0}&start=${selectedVideoResumeSeconds}&mute=${isTouchDevice ? 0 : 1}&rel=0&controls=1&fs=1&iv_load_policy=3&enablejsapi=1&playsinline=1&cc_load_policy=${preferences.captions ? 1 : 0}&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker')}&widget_referrer=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker')}`}
                            title={selectedVideo.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                            onLoad={(e) => {
                                // One requested sound-on start. The playback tools handle an
                                // explicit provider autoplay-block event with one muted start.
                                iframeUnmuteTimers.current.forEach(clearTimeout);
                                iframeUnmuteTimers.current = [];
                                try {
                                    const win = e.target.contentWindow;
                                    win.postMessage(JSON.stringify({ event: 'listening' }), 'https://www.youtube-nocookie.com');
                                    if (!isTouchDevice && playerAutoplayRef.current) {
                                        win.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), 'https://www.youtube-nocookie.com');
                                        win.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }), 'https://www.youtube-nocookie.com');
                                    }
                                } catch (error) {
                                    reportVideoLibraryIssue('youtube_player_handshake', error);
                                }
                            }}
                        />
                        {/* YouTube Error Overlay */}
                        {vlYtManaged && (
                            <div className="vl-youtube-error" role="alert">
                                {vlThumbnailUrl && <img src={vlThumbnailUrl} alt="" aria-hidden="true" />}
                                <div className="vl-sheet-card">
                                    <span className="vl-empty-kicker">Playback Signal {vlYtManaged}</span>
                                    <h2>{vlYtErrorInfo?.title || 'Video Unavailable'}</h2>
                                    <p>{vlYtErrorInfo?.description || 'This video cannot be played in the embedded viewer right now.'}</p>
                                    <div className="vl-sheet-actions">
                                        <button type="button" className="vl-pill-button" onClick={handleCloseVideo}>Close Viewer</button>
                                        <button
                                            type="button"
                                            className="vl-pill-button is-primary"
                                            onClick={() => window.open(`https://www.youtube.com/watch?v=${selectedVideo.videoId}`, '_blank', 'noopener,noreferrer')}
                                        >Open On YouTube</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    </div>

                    <div className="vl-watch-tools">
                        {playbackQueue.error && <p role="alert">{playbackQueue.error}</p>}
                        <WatchPlaybackTools key={`tools:${selectedVideo.videoId}:${userId || 'anonymous'}`} iframeRef={playerIframeRef}
                            onMarkersChange={setQuizMarkers}
                            duration={parseDuration(selectedVideo.duration)} attemptPlayback={playerAutoplayRef.current}
                            autoplay={nextAutoplay && preferences.autoplay !== false} onAutoplayChange={value => { setNextAutoplay(value); void updatePreference('autoplay', value); }}
                            nextTitle={playbackQueue.queue.items.some(item => item.videoId === selectedVideo.videoId) ? playbackQueue.queue.items[playbackQueue.queue.items.findIndex(item => item.videoId === selectedVideo.videoId) + 1]?.title : videos.length > 1 ? videos[(videos.findIndex(item => item.videoId === selectedVideo.videoId) + 1) % videos.length]?.title : null}
                            onNext={handleNextVideo} mini={miniPlayer} onMiniChange={handleMiniPlayerChange} />
                        {['cash', 'tournament'].includes(selectedVideo.type) && <PauseQuiz key={`quiz:${selectedVideo.videoId}:${userId || 'anonymous'}`} iframeRef={playerIframeRef} videoId={selectedVideo.videoId} active={!vlYtManaged} markers={quizMarkers} />}
                    </div>
                    {/* Title, channel, actions and study tools */}
                    <div className="vl-info-bar">
                        <div className="vl-info-copy">
                            <h2 id="vl-viewer-title">
                                {selectedVideo.title}
                            </h2>
                            <PlayerLinks video={selectedVideo} />
                            <p className="vl-info-meta">
                                {[formatViewCount(selectedVideo.views), formatVideoAge(selectedVideo.publishedAt || selectedVideo.scrapedAt), selectedVideo.duration].filter(Boolean).join(' · ')}
                            </p>
                        </div>

                        <div className="vl-info-channel">
                            <ChannelAvatar video={selectedVideo} channel={selectedChannel} />
                            <span className="vl-info-source">{selectedChannel.name}</span>
                        </div>

                        <WatchDescription key={selectedVideo.videoId} text={buildWatchDescription(selectedVideo, selectedChannel.name)} />
                        {/* Action row — Like / Share / Save / Playlist / Train This Spot */}
                        <div
                            className="vl-hud"
                            role="group"
                            aria-label="Video actions"
                            onFocusCapture={vlRevealHud}
                        >
                            <button
                                type="button"
                                aria-label={favorites.has(selectedVideoKey) ? 'Remove video from favorites' : 'Add video to favorites'}
                                aria-pressed={favorites.has(selectedVideoKey)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedVideo) void toggleFavorite(selectedVideo);
                                    vlRevealHud();
                                }}
                                title="Like"
                            >
                                <span className="vl-hud-command">
                                    {favorites.has(selectedVideoKey) ? 'Liked' : 'Like'}
                                </span>
                            </button>
                            <button
                                type="button"
                                aria-label="Copy video link"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedVideo) handleShareVideo(selectedVideo);
                                    vlRevealHud();
                                }}
                                title="Share"
                            >
                                <span className="vl-hud-command">Share</span>
                            </button>
                            <button
                                type="button"
                                aria-label={watchLater.has(selectedVideoKey) ? 'Remove video from watch later' : 'Save video to watch later'}
                                aria-pressed={watchLater.has(selectedVideoKey)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedVideo) void toggleWatchLater(selectedVideo);
                                    vlRevealHud();
                                }}
                                title="Save"
                            >
                                <span className="vl-hud-command">
                                    {watchLater.has(selectedVideoKey) ? 'Saved' : 'Save'}
                                </span>
                            </button>
                            <button
                                ref={playlistTriggerRef}
                                type="button"
                                aria-label="Save video to a playlist"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    if (!userId) {
                                        showActionNotice('Sign in to use playlists.', { videoId: selectedVideo.videoId, tone: 'info' });
                                    } else {
                                        setPlaylistActionError(null);
                                        setShowPlaylistModal(selectedVideo);
                                    }
                                    vlRevealHud();
                                }}
                                title="Playlist"
                            >
                                <span className="vl-hud-command">Playlist</span>
                            </button>
                            <a className="vl-hud-link" href={videoLibrarySocialShareHref(selectedVideo)}>Share To Feed</a>
                            <button type="button" disabled={!videos.some(item => item.videoId !== selectedVideo.videoId)} onClick={() => playbackQueue.enqueueNext(videos.find(item => item.videoId !== selectedVideo.videoId), selectedVideo)}>Queue Next Video</button>
                            {/* ── Train This Spot — in-place overlay ── */}
                            <button
                                ref={ttsTriggerRef}
                                type="button"
                                className="vl-train-spot-button"
                                onClick={() => {
                                    const tags = Array.isArray(selectedVideo.tags)
                                        ? selectedVideo.tags.filter(t => t && t.trim())
                                        : [];
                                    const ctx = {
                                        ref: 'video-library',
                                        vid: selectedVideo.videoId,
                                        title: selectedVideo.title.slice(0, 80),
                                        source: selectedVideo.source,
                                        sourceName: selectedChannel.name,
                                        tags,
                                    };
                                    const gameIds = findBestGames(ctx);
                                    // Lazy-load to avoid Webpack circular initialization
                                    const { getGameById: lookupGame } = require('../../src/data/TRAINING_LIBRARY');
                                    const games = gameIds.map(id => lookupGame(id)).filter(Boolean).slice(0, 3);
                                    setTtsOverlay({ ctx, games });
                                    // Fire analytics
                                    const analyticsToken = getAccessToken();
                                    fetch('/api/training/log-request', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            ...(analyticsToken ? { Authorization: `Bearer ${analyticsToken}` } : {}),
                                        },
                                        body: JSON.stringify({ ref: 'video-library', vid: ctx.vid, title: ctx.title, source: ctx.source, tags, matchedGameIds: gameIds.slice(0, 3) }),
                                    }).catch(error => reportVideoLibraryIssue('training_log_request', error));
                                }}
                                title="Open GTO Trainer with AI-matched drills from this video"
                            >
                                <span className="vl-hud-command">Train This Spot</span>
                            </button>
                        </div>

                        <VideoLearningLoop
                            title="Build Your Next Study Rep"
                            source={selectedChannel.name}
                            topic={(selectedVideo.tags || [selectedVideo.type])[0]}
                            reason={selectedVideo.recommendationReasons || selectedVideo.recommendationReason || selectedVideo.selectionReason}
                            mode={sortMode === 'default' ? 'latest' : 'learning'}
                            resumeLabel={selectedVideoResumeSeconds > 0 ? `Resume At ${formatTime(selectedVideoResumeSeconds)}` : 'Ready To Study'}
                            saved={learningStudyIds.has(selectedVideo.videoId) || watchLater.has(selectedVideo.id)}
                            onSave={() => void toggleWatchLater(selectedVideo)}
                            chronologicalHref={`/hub/video-library?${new URLSearchParams({ q: catalogSearchQuery || selectedVideo.title, rank: 'chronological' }).toString()}`}
                            relatedLessons={relatedVideos}
                            onOpenLesson={handleOpenVideo}
                            onAskGeeves={() => window.dispatchEvent(new window.CustomEvent('geeves-open'))}
                            quizHref={`/hub/trivia?topic=${encodeURIComponent((selectedVideo.tags || [selectedVideo.type || 'poker'])[0])}`}
                            sandboxHref="/hub/personal-assistant/sandbox"
                        />
                    </div>

                    {/* ── Up Next ── */}
                    {relatedVideos.length > 0 && (
                        <div className="vl-up-next-rail">
                            <h3 className="vl-up-next-label">Up Next</h3>
                            <div className="vl-up-next-grid">
                                {relatedVideos.map(v => (
                                    <div
                                        key={v.id}
                                        onClick={() => handleOpenVideo(v)}
                                        onKeyDown={(event) => handleVideoCardKeyDown(event, v)}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Play ${v.title}`}
                                        className="vl-up-next-card"
                                    >
                                        <div className="vl-up-next-media">
                                            <VideoThumbnail video={v} size={THUMBNAIL_SIZES.small} />
                                            {v.duration && (
                                                <span className="vl-duration">{v.duration}</span>
                                            )}
                                        </div>
                                        <div className="vl-up-next-copy">
                                            <strong>{v.title}</strong>
                                            <span>{getVideoMetaLine(v)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    </div>
                </div>
                );
            })()}

            {/* Card "more actions" sheet (YouTube's three-dot menu) */}
            {cardMenuVideo && (
                <div className="vl-card-menu-overlay" role="presentation" onClick={() => setCardMenuVideo(null)}>
                    <div
                        className="vl-card-menu-sheet"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="vl-card-menu-title"
                        onClick={event => event.stopPropagation()}
                        onKeyDown={event => {
                            if (event.key === 'Escape') { event.stopPropagation(); setCardMenuVideo(null); }
                            containDialogFocus(event, event.currentTarget);
                        }}
                    >
                        <p id="vl-card-menu-title" className="vl-card-menu-title">{cardMenuVideo.title}</p>
                        {[
                            { label: 'Play', run: () => handleOpenVideo(cardMenuVideo) },
                            { label: 'Play Next', run: () => { try { if (!playbackQueue.enqueueNext(cardMenuVideo, selectedVideo || null)) throw new Error('Queue Storage Unavailable'); showActionNotice('Added To Your Session Queue.', { videoId: cardMenuVideo.videoId }); } catch { showActionNotice('Your Queue Could Not Be Saved.', { videoId: cardMenuVideo.videoId, tone: 'error' }); } } },
                            { label: 'Share To Feed', run: () => void router.push(videoLibrarySocialShareHref(cardMenuVideo)) },
                            { label: watchLater.has(cardMenuVideo.id) ? 'Remove From Watch Later' : 'Save To Watch Later', run: () => void toggleWatchLater(cardMenuVideo) },
                            { label: favorites.has(cardMenuVideo.id) ? 'Remove From Favorites' : 'Add To Favorites', run: () => void toggleFavorite(cardMenuVideo) },
                            {
                                label: 'Save To Playlist',
                                run: () => {
                                    if (!userId) {
                                        showActionNotice('Sign in to use playlists.', { videoId: cardMenuVideo.videoId, tone: 'info' });
                                    } else {
                                        setPlaylistActionError(null);
                                        setShowPlaylistModal(cardMenuVideo);
                                    }
                                },
                            },
                            { label: 'Share', run: () => handleShareVideo(cardMenuVideo) },
                            ...(watchedVideos.has(cardMenuVideo.id) ? [{ label: 'Mark As Unwatched', run: () => void handleMarkUnwatched(cardMenuVideo) }] : []),
                        ].map((action, actionIndex) => (
                            <button
                                key={action.label}
                                type="button"
                                className="vl-card-menu-item"
                                autoFocus={actionIndex === 0}
                                onClick={() => { setCardMenuVideo(null); action.run(); }}
                            >
                                {action.label}
                            </button>
                        ))}
                        <button type="button" className="vl-card-menu-item is-cancel" onClick={() => setCardMenuVideo(null)}>Cancel</button>
                    </div>
                </div>
            )}

            <style>{`
                /* The viewer Close control clears the status bar. The page that
                   owns the full-screen overlay carries the inset itself
                   (overlays-leave-room-to-close.law), matching the world sheet. */
                .vl-watch-topbar { padding-top: env(safe-area-inset-top, 0px); }
                .vl-card-menu-sheet { padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px); }
            `}</style>

            {/* Reels Modal — full-screen TikTok doom-scroll */}
            {showReelsModal && (
                <div ref={reelsDialogRef} className="vl-reels-dialog" role="dialog" aria-modal="true" aria-label="Video reels" tabIndex={-1}>
                    <VideoLibraryReelsBoundary onClose={() => setShowReelsModal(false)}>
                        <ReelsViewer onClose={() => setShowReelsModal(false)} />
                    </VideoLibraryReelsBoundary>
                </div>
            )}

            {/* Share Toast \u2014 floating clipboard feedback */}
            {visibleShareToast && (
                <div
                    className={`vl-action-notice vl-action-notice--${visibleShareToast.tone}`}
                    role={visibleShareToast.tone === 'error' ? 'alert' : 'status'}
                    aria-live={visibleShareToast.tone === 'error' ? 'assertive' : 'polite'}
                >
                    {visibleShareToast.message}
                </div>
            )}
    
            {/* Playlist Modal */}
            {personalStateIsCurrent && showPlaylistModal && (
                <div className="vl-playlist-overlay" role="presentation" onClick={() => { setShowPlaylistModal(null); setPlaylistActionError(null); }}>
                    <div
                        ref={playlistDialogRef}
                        className="vl-playlist-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="vl-playlist-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="vl-playlist-header">
                            <h2 id="vl-playlist-title">Save To Playlist</h2>
                            <button onClick={() => { setShowPlaylistModal(null); setPlaylistActionError(null); }}
                                type="button" aria-label="Close playlist dialog"
                                className="vl-text-button">Close</button>
                        </div>
                        <div className="vl-playlist-list">
                            {playlists.length === 0 && (
                                <div className="vl-playlist-empty">
                                    <strong>No Playlists Yet</strong>
                                    <span>Create One Below To Save This Video</span>
                                </div>
                            )}
                            {playlists.map(p => {
                                const inPlaylist = p.items?.some(i => i.video_id === showPlaylistModal.videoId);
                                return (
                                    <div key={p.id} className="vl-playlist-row">
                                        <div className="vl-playlist-copy">
                                            <strong data-user-content>{p.name}</strong>
                                            {p.items?.length != null && (
                                                <span>{p.items.length} video{p.items.length !== 1 ? 's' : ''}</span>
                                            )}
                                        </div>
                                        <button onClick={async () => {
                                            const ownerToken = ownerScopeRef.current.capture(userId);
                                            try {
                                                setPlaylistActionError(null);
                                                if (inPlaylist) {
                                                    await removeVideoFromPlaylist(p.id, showPlaylistModal.videoId);
                                                } else {
                                                    await addVideoToPlaylist(p.id, showPlaylistModal.videoId, showPlaylistModal.title, showPlaylistModal.source);
                                                }
                                                if (!ownerScopeRef.current.isCurrent(ownerToken)) return;
                                                const refreshedPlaylists = await getVideoPlaylists(userId);
                                                if (!ownerScopeRef.current.isCurrent(ownerToken)) return;
                                                ownerScopeRef.current.commit(ownerToken, () => {
                                                    setPlaylists(refreshedPlaylists);
                                                    showActionNotice(inPlaylist ? 'Removed from playlist.' : 'Added to playlist.', { videoId: showPlaylistModal.videoId });
                                                });
                                            } catch (err) {
                                                if (!ownerScopeRef.current.isCurrent(ownerToken)) return;
                                                ownerScopeRef.current.commit(ownerToken, () => setPlaylistActionError('Action failed. Please try again.'));
                                            }
                                        }} data-active={inPlaylist ? 'true' : 'false'}>
                                            {inPlaylist ? 'Remove' : 'Add'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        {playlistActionError && (
                            <div className="vl-playlist-error" role="alert">
                                {playlistActionError}
                            </div>
                        )}
                        <div className="vl-playlist-create">
                            <input
                                ref={playlistNameInputRef}
                                value={newPlaylistName}
                                onChange={e => setNewPlaylistName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && newPlaylistName.trim() && !isCreatingPlaylist) { e.preventDefault(); createPlaylistButtonRef.current?.click(); } }}
                                placeholder="New playlist name..."
                                disabled={isCreatingPlaylist}
                            />
                            <button
                                ref={createPlaylistButtonRef}
                                type="button"
                                onClick={async () => {
                                    if (!newPlaylistName.trim() || isCreatingPlaylist) return;
                                    const ownerToken = ownerScopeRef.current.capture(userId);
                                    setIsCreatingPlaylist(true);
                                    setPlaylistActionError(null);
                                    try {
                                        const p = await createPlaylist(userId, newPlaylistName.trim());
                                        if (!ownerScopeRef.current.isCurrent(ownerToken)) return;
                                        await addVideoToPlaylist(p.id, showPlaylistModal.videoId, showPlaylistModal.title, showPlaylistModal.source);
                                        if (!ownerScopeRef.current.isCurrent(ownerToken)) return;
                                        ownerScopeRef.current.commit(ownerToken, () => setNewPlaylistName(''));
                                        const refreshedPlaylists = await getVideoPlaylists(userId);
                                        if (!ownerScopeRef.current.isCurrent(ownerToken)) return;
                                        ownerScopeRef.current.commit(ownerToken, () => {
                                            setPlaylists(refreshedPlaylists);
                                            showActionNotice('Playlist created and video added.', { videoId: showPlaylistModal.videoId });
                                        });
                                    } catch (err) {
                                        if (!ownerScopeRef.current.isCurrent(ownerToken)) return;
                                        ownerScopeRef.current.commit(ownerToken, () => setPlaylistActionError('Failed to create playlist. Please try again.'));
                                    } finally {
                                        if (ownerScopeRef.current.isCurrent(ownerToken)) setIsCreatingPlaylist(false);
                                    }
                                }}
                                disabled={isCreatingPlaylist || !newPlaylistName.trim()}
                            >
                                {isCreatingPlaylist ? '...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Train This Spot In-Place Overlay ── */}
            {ttsOverlay && (
                <div className="vl-tts-sheet" role="presentation">
                    <div className="vl-tts-backdrop" onClick={() => setTtsOverlay(null)} />
                    <div ref={ttsDialogRef} className="vl-tts-dialog" role="dialog" aria-modal="true" aria-labelledby="vl-tts-title">
                        <div className="vl-tts-header">
                            <div>
                                <h2 id="vl-tts-title">Train This Spot</h2>
                                <span>{ttsOverlay.games.length} Matched {ttsOverlay.games.length === 1 ? 'drill' : 'drills'} For This Video</span>
                            </div>
                            <button ref={ttsCloseButtonRef} type="button" aria-label="Close" className="vl-text-button" onClick={() => setTtsOverlay(null)}>Close</button>
                        </div>
                        <div className="vl-tts-video">
                            <div className="vl-tts-video-media">
                                <img src={`https://img.youtube.com/vi/${ttsOverlay.ctx.vid}/mqdefault.jpg`} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
                            </div>
                            <div className="vl-tts-video-copy">
                                <strong>{ttsOverlay.ctx.title || 'Poker Video'}</strong>
                                <div className="vl-tts-source">
                                    <span>{ttsOverlay.ctx.sourceName || ''}</span>
                                </div>
                            </div>
                        </div>
                        <div className="vl-tts-drills">
                            <div className="vl-tts-label">AI Recommended Drills</div>
                            <div className="vl-tts-drill-list">
                                {ttsOverlay.games.map((game, idx) => (
                                    <button key={game.id} data-best-match={idx === 0 ? 'true' : 'false'} onClick={() => { setTtsOverlay(null); router.push(`/hub/training?autoLaunch=${game.id}`); }}>
                                        <div className="vl-tts-drill-copy">
                                            <div className="vl-tts-drill-name">
                                                <span>{game.name}</span>
                                                {idx === 0 && <em>Best Match</em>}
                                            </div>
                                            <small>{game.focus} / Level {Math.min(game.difficulty || 1, 5)}</small>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="vl-tts-actions">
                            <button onClick={() => { setTtsOverlay(null); router.push('/hub/training?source=video-library'); }}>
                                Open Verified Training
                            </button>
                            <button onClick={() => { setTtsOverlay(null); router.push('/hub/training'); }}>Browse All 100 Training Games</button>
                        </div>
                    </div>
                </div>
            )}

        </PageTransition>
        {/* Outside <PageTransition> for the same reason the head is, and
            AFTER it so the app still opens at the top of the page: this is the
            only body copy a crawler that runs no JavaScript ever sees here. */}
        {/* as="h1" while the body did not server-render and this was the only
            heading a crawler saw. The body renders now and brings its own. */}
        <HubPageSummary page="video-library" />
        </>
    );
}
