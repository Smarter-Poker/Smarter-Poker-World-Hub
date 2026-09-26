/**
 * VIDEO LIBRARY - Full Poker Videos from Global Livestreams
 * Browse and watch complete hands from HCL, The Lodge, Triton, and more
 */

import { Component, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';
import { useYouTubeErrorManager } from '../../src/hooks/useYouTubeErrorManager';
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
import dynamic from 'next/dynamic';
import { getVideoPlaylists, createPlaylist, addVideoToPlaylist, removeVideoFromPlaylist } from '../../src/services/videoPlaylists';
import { getAccessToken } from '../../src/lib/authUtils';
import { useAvatar } from '../../src/contexts/AvatarContext';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import VideoLibraryCommandRail from '../../src/components/video-library/VideoLibraryCommandRail';
import HubPageShell from '../../src/components/ui/HubPageShell';
import PullToRefresh from '../../src/components/ui/PullToRefresh';
import toast from '../../src/stores/toastStore';
import { useLoadFailsafe } from '../../src/hooks/useLoadFailsafe';
import { useHaptics } from '../../src/hooks/useHaptics';
import { useOnlineStatus, OFFLINE_TOAST } from '../../src/hooks/useOnlineStatus';
import { useModalHistory } from '../../src/hooks/useModalHistory';
import VideoLibraryConsole, {
    ConsoleCopy,
} from '../../src/components/video-library/console/VideoLibraryConsole';
import { isVideoLibraryVideoAllowed } from '../../src/lib/videoLibraryAvailability';
import { createVideoLibraryOwnerScope } from '../../src/lib/videoLibraryOwnerScope.mjs';

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
// `videos` is seeded from STATIC_CATALOG and needs no fetch to render. An
// earlier fix pulled SEOHead out of this wrapper for the same reason, which
// treated the symptom without naming the cause. PageTransition is a
// framer-motion div that touches no browser API during render.
import PageTransition from '../../src/components/transitions/PageTransition';
// ReelsViewer is dynamically loaded to reduce initial bundle size
const ReelsViewer = dynamic(() => import('../../src/components/social/Reels').then(mod => mod.ReelsViewer), { ssr: false });
import { findBestGames } from '../../src/utils/videoToTrainingMapper';

// Static records retain legacy-ID aliases only. Playback fails closed until a
// live catalog response supplies fresh persisted availability evidence.
import {
    FULL_VIDEOS as STATIC_VIDEOS,
    SOURCES
} from '../../src/data/videoLibraryData';

// Persistence uses YouTube's video ID as the canonical key. The legacy static
// catalog used display-only aliases (hcl1, lodge1, ...), which orphaned saved
// state whenever the database hydrated. Invalid FAKE placeholders are excluded
// from any live catalog response instead of producing guaranteed dead embeds.
const STATIC_VIDEO_ALIASES = new Map(STATIC_VIDEOS.map(video => [video.id, video.videoId]));
const STATIC_VIDEO_CANONICAL_ALIASES = new Map(STATIC_VIDEOS.map(video => [video.videoId, video.id]));
const canonicalStoredVideoId = videoId => STATIC_VIDEO_ALIASES.get(videoId) || videoId;
const STATIC_CATALOG = STATIC_VIDEOS
    .filter(isVideoLibraryVideoAllowed)
    .map(video => ({ ...video, legacyId: video.id, id: video.videoId, videoId: video.videoId }));

const EMPTY_VIDEO_SET = new Set();
const EMPTY_VIDEO_MAP = new Map();
const DEFAULT_VIDEO_LIBRARY_PREFERENCES = Object.freeze({ autoplay: true, captions: false });

const LIBRARY_VIEW_OPTIONS = [
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
                <VideoLibraryConsole
                    eyebrow="Reels Signal Interrupted"
                    title="Reopen The Feed"
                    subtitle="Your Library Place Is Safe"
                    pill="Offline"
                    pillInk="red"
                    foot="plates"
                    plates={{
                        secondary: { label: 'Back To Library', onClick: this.props.onClose },
                        primary: { label: 'Try Again', ink: 'white', onClick: () => this.setState({ hasError: false }) },
                    }}
                >
                    <ConsoleCopy align="center">
                        The Full Library Is Still Available. Retry Reels Or Return Without Losing Your Place.
                    </ConsoleCopy>
                </VideoLibraryConsole>
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

function recoverYouTubeThumbnail(event, videoId) {
    const image = event.currentTarget;
    if (event.type !== 'error' && image.naturalWidth > 120) return;
    if (image.src.includes('maxresdefault')) {
        image.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    } else if (image.src.includes('hqdefault')) {
        image.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    } else if (event.type === 'error') {
        image.hidden = true;
        image.parentElement?.classList.add('vl-media-failed');
    }
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
    const setSelectedVideo = useVideoLibraryStore((s) => s.setSelectedVideo);

    // Persisted filters for source and type
    const { filters, setFilter } = usePersistedFilters('video-library', {
        selectedSource: 'ALL',
        selectedType: 'ALL'
    });

    const selectedSource = SOURCES.some(source => source?.id === filters.selectedSource)
        ? filters.selectedSource
        : 'ALL';
    const selectedType = ['ALL', 'cash', 'tournament'].includes(filters.selectedType)
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
    const [videos, setVideos] = useState(STATIC_CATALOG);
    const [displayedCount, setDisplayedCount] = useState(STATIC_CATALOG.length);
    const [allVideos, setAllVideos] = useState(STATIC_CATALOG); // unfiltered master list
    const [catalogRefreshFailed, setCatalogRefreshFailed] = useState(false);
    const [catalogLoading, setCatalogLoading] = useState(true);
    useLoadFailsafe(catalogLoading, setCatalogLoading);
    const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
    const [catalogTotal, setCatalogTotal] = useState(STATIC_CATALOG.length);
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
        });
        const navigationQueryChanged = lastNavigationQueryRef.current !== navigationQueryKey;
        if (navigationQueryChanged) {
        lastNavigationQueryRef.current = navigationQueryKey;
        const hasNavigationQuery = Boolean(router.query.type || router.query.source || router.query.filter || router.query.q || router.query.sort);
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
            if (['all', 'cash', 'tournament'].includes(requestedType)) {
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
            if (f === 'favorites' || f === 'history' || f === 'watchlater' || f === 'playlists') {
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
            if (requestedVideoId !== rawVideoId) {
                void router.replace(
                    { pathname: router.pathname, query: { ...router.query, v: requestedVideoId } },
                    undefined,
                    { shallow: true, scroll: false },
                );
            }
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
    const [newWeekVisible, setNewWeekVisible] = useState(INITIAL_RAIL_CARDS);
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
    // 2026-08-15: the three "My Library" hamburger entries
    // (?filter=favorites|history|watchlater) previously fell into a handler
    // that just ran setSearchQuery('favorites'), so users got
    // `0 results for "favorites"`. There was no such view at all. The data
    // was already in state (favorites / watchLater / watchedVideos are Sets
    // of video ids) — it just was never wired to a filter.
    const [libraryFilter, setLibraryFilter] = useState('ALL');
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

    // "New This Week" rail dismiss state
    const [newThisWeekDismissed, setNewThisWeekDismissed] = useState(false);

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
        const wasSaved = watchLater.has(videoId);

        setWatchLater(prev => {
            const next = new Set(personalStateIsCurrent ? prev : EMPTY_VIDEO_SET);
            if (wasSaved) next.delete(videoId); else next.add(videoId);
            return next;
        });

        try {
            if (wasSaved) {
                await removeFromWatchLater(userId, videoId, video.legacyId ? [video.legacyId] : []);
            } else {
                await addToWatchLater(userId, videoId, {
                    title: video.title,
                    source: video.source,
                    video_url: `https://youtube.com/watch?v=${video.videoId}`
                });
            }
            return ownerScopeRef.current.commit(ownerToken, () => {
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
    }, [userId, watchLater, personalStateIsCurrent, showActionNotice]);

    const saveWatchSession = useCallback(async (startTime, video, { quiet = false, sessionUserId = watchSessionUserIdRef.current } = {}) => {
        const effectiveUserId = sessionUserId || userId;
        if (!startTime || !video || !effectiveUserId) return false;
        const ownerToken = ownerScopeRef.current.capture(effectiveUserId);
        if (!ownerScopeRef.current.isCurrent(ownerToken)) return false;
        const watchedSeconds = Math.floor((Date.now() - startTime) / 1000);
        if (watchedSeconds <= 0) return false;

        const previousWatched = watchProgressRef.current.get(video.id)?.watchedSeconds || 0;
        const totalWatched = previousWatched + watchedSeconds;

        try {
            const savedSession = await updateWatchDuration(effectiveUserId, video.id, watchedSeconds, {
                title: video.title,
                url: `https://youtube.com/watch?v=${video.videoId}`,
                thumbnail: `https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`,
                durationSeconds: parseDuration(video.duration),
                progressSeconds: playerPositionRef.current
            });
            if (!ownerScopeRef.current.isCurrent(ownerToken)) return false;
            const persistedProgress = Number(savedSession?.progress_seconds);
            const persistedTotal = Number(savedSession?.watch_duration_seconds);
            const nextProgress = Number.isFinite(persistedProgress)
                ? persistedProgress
                : totalWatched;

            ownerScopeRef.current.commit(ownerToken, () => {
                setWatchProgress(prev => {
                    const next = new Map(prev);
                    const current = next.get(video.id) || {};
                    next.set(video.id, {
                        ...current,
                        watchedSeconds: Math.max(current.watchedSeconds || 0, nextProgress),
                        totalWatchedSeconds: Math.max(current.totalWatchedSeconds || 0, Number.isFinite(persistedTotal) ? persistedTotal : totalWatched),
                        durationSeconds: parseDuration(video.duration) || current.durationSeconds || 0,
                        watchedAt: new Date().toISOString()
                    });
                    watchProgressRef.current = next;
                    return next;
                });
                const confirmedTotal = Math.max(totalWatched, Number.isFinite(persistedTotal) ? persistedTotal : 0);
                if (confirmedTotal >= 30) setWatchedVideos(prev => new Set(prev).add(video.id));
            });
            const confirmedTotal = Math.max(totalWatched, Number.isFinite(persistedTotal) ? persistedTotal : 0);
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
        const hadActiveSession = Boolean(currentWatchingVideoRef.current);
        if (currentWatchingVideoRef.current?.id === video.id) return;
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
    }, [saveWatchSession]);
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
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        handleOpenVideo(video);
    }, [handleOpenVideo]);
    // Make the callback available before the earlier query effect runs. This
    // keeps static-fallback deep links working even when catalog refresh fails.
    handleOpenVideoRef.current = handleOpenVideo;

    // Navigate to next video in list (TikTok swipe down / arrow right)
    const handleNextVideo = useCallback(() => {
        if (!selectedVideo || videos.length === 0) return;
        const idx = videos.findIndex(v => v.videoId === selectedVideo.videoId);
        if (idx < 0) {
            handleOpenVideo(videos[0]);
            return;
        }
        const next = videos[(idx + 1) % videos.length];
        handleOpenVideo(next);
    }, [selectedVideo, videos, handleOpenVideo]);

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
        const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}/hub/video-library?v=${video.videoId}`;
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
            if (!userId) {
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
            if (personalIdsForFilter.length === 0) {
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
        if (libraryFilter !== 'ALL') params.set('ids', personalIdsForFilter.join(','));

        try {
            const response = await fetch(`/api/video-library/catalog?${params.toString()}`, {
                signal: controller.signal,
                cache: 'no-store',
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
            const payload = await response.json();
            if (!payload?.success || !Array.isArray(payload.data)) throw new Error('Catalog response was invalid');
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
                return combined.filter(video => {
                    if (!video?.videoId || seen.has(video.videoId)) return false;
                    seen.add(video.videoId);
                    return true;
                });
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
                let fallback = STATIC_CATALOG;
                if (selectedType !== 'ALL') fallback = fallback.filter(video => video.type === selectedType);
                if (selectedSource !== 'ALL') fallback = fallback.filter(video => video.source === selectedSource);
                if (libraryFilter !== 'ALL') {
                    const ids = new Set(personalIdsForFilter);
                    fallback = fallback.filter(video => ids.has(video.id));
                }
                if (catalogSearchQuery.trim()) {
                    const query = catalogSearchQuery.trim().toLowerCase();
                    fallback = fallback.filter(video => `${video.title} ${video.source} ${(video.tags || []).join(' ')}`.toLowerCase().includes(query));
                }
                setAllVideos(fallback);
                setVideos(fallback);
                setDisplayedCount(fallback.length);
                setCatalogTotal(fallback.length);
                setCatalogHasMore(false);
                setCatalogNextOffset(0);
            }
        } finally {
            if (requestId === catalogRequestRef.current) {
                setCatalogLoading(false);
                setCatalogLoadingMore(false);
            }
        }
    }, [libraryFilter, userId, visibleLibrarySyncState, personalIdsForFilter, selectedSource, selectedType, catalogSearchQuery, sortMode]);

    useEffect(() => {
        void fetchCatalogPage({ append: false });
        return () => catalogAbortRef.current?.abort();
    }, [selectedSource, selectedType, catalogSearchQuery, sortMode, libraryFilter, userId, visibleLibrarySyncState, personalIdsForFilter, fetchCatalogPage]);

    // A shared video deep link may point beyond the currently paginated page.
    // Resolve that one catalog row directly rather than downloading the whole
    // archive or silently leaving the requested video closed.
    useEffect(() => {
        if (!router.isReady || !handleOpenVideoRef.current) return undefined;
        if (!router.query.v) {
            queryVideoFetchRef.current = null;
            setDeepLinkStatus(null);
            return undefined;
        }
        const rawVideoId = String(Array.isArray(router.query.v) ? router.query.v[0] : router.query.v);
        const requestedVideoId = canonicalStoredVideoId(rawVideoId);
        if (requestedVideoId !== rawVideoId) {
            void router.replace(
                { pathname: router.pathname, query: { ...router.query, v: requestedVideoId } },
                undefined,
                { shallow: true, scroll: false },
            );
        }
        if (!isVideoLibraryVideoAllowed(requestedVideoId)) {
            queryVideoFetchRef.current = requestedVideoId;
            setDeepLinkStatus({
                type: 'unavailable',
                message: 'This saved video is no longer available for verified embedded playback.',
            });
            return undefined;
        }
        if (openedQueryVideoRef.current === requestedVideoId || allVideos.some(video => video.videoId === requestedVideoId)) return undefined;
        if (queryVideoFetchRef.current === requestedVideoId) return undefined;
        queryVideoFetchRef.current = requestedVideoId;
        setDeepLinkStatus(null);
        const controller = new AbortController();
        fetch(`/api/video-library/catalog?limit=1&ids=${encodeURIComponent(requestedVideoId)}`, {
            signal: controller.signal,
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        })
            .then(response => response.ok ? response.json() : Promise.reject(new Error(`Deep-link catalog request failed (${response.status})`)))
            .then(payload => {
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
                if (error?.name !== 'AbortError') {
                    queryVideoFetchRef.current = null;
                    setDeepLinkStatus({
                        type: 'error',
                        message: 'The saved video could not be verified right now. Retry without clearing your bookmark.',
                    });
                    reportVideoLibraryIssue('catalog_load', error);
                }
            });
        return () => controller.abort();
    }, [router.isReady, router.query.v, allVideos, deepLinkRetryNonce]);

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
            if (!selectedVideo) return;
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
    }, [selectedVideo, showPlaylistModal, ttsOverlay, handleCloseVideo, handleNextVideo, handlePrevVideo, handleFullscreen]);

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
        if (!selectedVideo) {
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
    }, [selectedVideo, showPlaylistModal, ttsOverlay]);

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

    // Get YouTube thumbnail
    const getThumbnail = (videoId) => `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

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

    // "New This Week" — videos scraped in the past 7 days, sorted newest first
    // useMemo: inline .filter().sort() on 345 videos on every render was causing
    // unnecessary CPU work on every state change (HUD, modal open, etc.)
    const newThisWeek = useMemo(() => allVideos
        .filter(v => {
            const scraped = v.scrapedAt || v.publishedAt;
            if (!scraped) return false;
            const age = (Date.now() - new Date(scraped).getTime()) / 1000;
            return age < 7 * 24 * 3600;
        })
        .sort((a, b) => new Date(b.scrapedAt || b.publishedAt) - new Date(a.scrapedAt || a.publishedAt))
        .slice(0, 20)
    , [allVideos]); // ← stable: recomputes only when library refreshes

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
        selectedType !== 'ALL' ? (selectedType === 'cash' ? 'Cash Games' : 'Tournaments') : null,
        selectedSource !== 'ALL' ? activeSourceName : null,
        sortMode !== 'default' ? (sortMode === 'trending' ? 'Trending' : 'Top Rated') : null,
        libraryFilter !== 'ALL' ? ({ favorites: 'Favorites', history: 'Watch History', watchlater: 'Watch Later', playlists: 'Playlists' }[libraryFilter] || libraryFilter) : null,
        searchQuery ? `Search: “${searchQuery}”` : null,
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
        setSearchQuery('');
        setCatalogSearchQuery('');
        setSelectedSource('ALL');
        setSelectedType('ALL');
        setSortMode('default');
        setLibraryFilter('ALL');
        if (router.query.type || router.query.source || router.query.filter || router.query.q || router.query.sort) {
            const { type: _type, source: _source, filter: _filter, q: _q, sort: _sort, ...nextQuery } = router.query;
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

    const selectedVideoProgress = selectedVideo
        ? getProgressPercent(selectedVideo.id, selectedVideo.duration)
        : 0;
    const selectedVideoResumeSeconds = selectedVideo && selectedVideoProgress > 0 && selectedVideoProgress < 95
        ? Math.floor(watchProgress.get(selectedVideo.id)?.watchedSeconds || 0)
        : 0;

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
                <div className="vl-command-layout">
                    <VideoLibraryCommandRail
                        mode="desktop"
                        selectedType={selectedType}
                        libraryFilter={libraryFilter}
                        sortMode={sortMode}
                        libraryViews={LIBRARY_VIEW_OPTIONS}
                        personalViewCounts={personalViewCounts}
                        visibleCount={videos.length}
                        onBrowse={selectBrowseView}
                        onLibrary={selectPersonalView}
                        onSort={selectSortView}
                        onOpenReels={() => setShowReelsModal(true)}
                        reelsTriggerRef={reelsTriggerRef}
                    />

                <section className="vl-command-main" data-tutorial="main">
                    <VideoLibraryConsole
                        eyebrow={currentViewMeta.kicker}
                        title={currentViewMeta.title}
                        titleAs="h1"
                        subtitle={activeFilterLabels.length ? activeFilterLabels.join(' / ') : 'Verified Poker Broadcasts'}
                        pill={catalogLoading ? 'Loading' : `${videos.length} Videos`}
                        pillInk={catalogRefreshFailed ? 'red' : 'blue'}
                        foot="foot"
                        className="vl-library-console"
                    >
                    <VideoLibraryCommandRail
                        mode="mobile"
                        ref={mobileFilterRailRef}
                        selectedType={selectedType}
                        libraryFilter={libraryFilter}
                        sortMode={sortMode}
                        libraryViews={LIBRARY_VIEW_OPTIONS}
                        personalViewCounts={personalViewCounts}
                        visibleCount={videos.length}
                        onBrowse={selectBrowseView}
                        onLibrary={selectPersonalView}
                        onSort={selectSortView}
                        onOpenReels={() => setShowReelsModal(true)}
                        reelsTriggerRef={mobileReelsTriggerRef}
                    />
                    <div className="vl-console-content">
                    <div className="vl-command-bar">
                        <div className="vl-command-heading">
                            <span>{currentViewMeta.kicker}</span>
                            <h2>{currentViewMeta.title}</h2>
                            <p>{currentViewMeta.description}</p>
                        </div>

                        {/* Search Input */}
                        <div className="vl-search-wrap" data-tutorial="search">
                            <input
                                ref={searchInputRef}
                                type="text"
                                aria-label="Search the poker video library"
                                aria-keyshortcuts="/"
                                aria-controls="video-library-grid"
                                placeholder={libraryFilter === 'ALL' ? 'Search Videos...' : `Search ${currentViewMeta.title}...`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape' && searchQuery) {
                                        event.stopPropagation();
                                        setSearchQuery('');
                                    }
                                }}
                            />
                            {searchQuery ? (
                                <button
                                    type="button"
                                    className="vl-search-clear"
                                    aria-label="Clear video search"
                                    onClick={() => {
                                        setSearchQuery('');
                                        searchInputRef.current?.focus();
                                    }}
                                >Clear</button>
                            ) : (
                                <kbd className="vl-search-shortcut" aria-hidden="true">/</kbd>
                            )}
                        </div>
                    </div>

                    {/* Search results count — shown when query is active */}
                    {searchQuery && (
                        <div className="vl-search-results">
                            {videos.length} result{videos.length !== 1 ? 's' : ''} For <strong>&ldquo;{searchQuery}&rdquo;</strong>
                            {videos.length === 0 && (
                                <button
                                    type="button"
                                    onClick={clearAllFilters}
                                    className="vl-glass-action"
                                >
                                    Clear Filters
                                </button>
                            )}
                        </div>
                    )}


                    {/* Premium Creator Cards */}
                    <div className={`vl-source-pills${sourcesExpanded ? ' is-expanded' : ''}`} data-tutorial="sources">
                        {[{ id: 'ALL', name: 'All Sources', logo: null }, ...SOURCES.filter(source => source && typeof source === 'object' && source.id && source.id !== 'ALL')].map(source => {
                            const isActive = selectedSource === source.id;
                            const initials = (source.name || source.id || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
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
                                        {source.name}
                                    </span>
                                    {isActive && <span className="vl-source-active-dot" aria-hidden="true" />}
                                </button>
                            );
                        })}
                    </div>
                    {!sourcesExpanded && SOURCES.length > 10 && (
                        <button
                            type="button"
                            className="vl-show-all-sources vl-show-more"
                            onClick={() => { haptic('light'); setSourcesExpanded(true); }}
                        >
                            Show All {SOURCES.filter(source => source && typeof source === 'object' && source.id && source.id !== 'ALL').length + 1} Sources
                        </button>
                    )}

                    {libraryFilter !== 'ALL' && (
                        <section className="vl-subview-banner" aria-labelledby="vl-subview-title">
                            <div className="vl-subview-copy">
                                <span>{currentViewMeta.kicker}</span>
                                <h2 id="vl-subview-title">{currentViewMeta.title}</h2>
                                <p>{currentViewMeta.description}</p>
                            </div>
                            <div className="vl-subview-status">
                                <strong>{catalogTotal}</strong>
                                <span>
                                    {catalogTotal === 1 ? 'matching video' : 'matching videos'}
                                    {userId ? ` · ${personalSavedVideoCounts[libraryFilter]} saved` : ''}
                                </span>
                                {!userId && <em>Sign In To Sync</em>}
                            </div>
                        </section>
                    )}

                    {userId && libraryFilter !== 'ALL' && visibleLibrarySyncState === 'loading' && (
                        <div className="vl-sync-panel is-loading" role="status" aria-live="polite">
                            <span className="vl-sync-pulse" aria-hidden="true" />
                            <div><strong>Syncing Your Library</strong><span>Loading Saved Videos And Cross-Device Progress.</span></div>
                        </div>
                    )}

                    {userId && (visibleLibrarySyncState === 'partial' || visibleLibrarySyncState === 'error') && (
                        <div className="vl-sync-panel is-error" role="alert">
                            <div>
                                <strong>{visibleLibrarySyncState === 'error' ? 'Your Library Did Not Load' : 'Part Of Your Library Is Offline'}</strong>
                                <span>{visibleLibrarySyncErrors.length ? `Retry ${visibleLibrarySyncErrors.join(', ')}.` : 'Retry the saved-library connection.'}</span>
                            </div>
                            <button type="button" onClick={() => void refreshUserLibraryRef.current?.({ force: true })}>Retry Sync</button>
                        </div>
                    )}

                    {hasActiveFilters && (
                        <div className="vl-active-view" aria-label="Active video filters">
                            <div className="vl-active-view-copy">
                                <span>Active View</span>
                                <div className="vl-active-filter-list">
                                    {activeFilterLabels.map(label => <strong key={label}>{label}</strong>)}
                                </div>
                            </div>
                            <button type="button" onClick={clearAllFilters}>Reset View</button>
                        </div>
                    )}

                {/* Watch Stats moved to hamburger menu - removed from main page */}

                {/* Continue Watching / Recently Watched Section */}
                {continueWatchingVideos.length > 0 && (
                    <section className="vl-continue-watching" data-tutorial="continue" aria-labelledby="vl-continue-title">
                        <div className="vl-continuity-header">
                            <div>
                                <span className="vl-continuity-kicker">Session Continuity</span>
                                <h2 id="vl-continue-title">Continue Watching</h2>
                            </div>
                            <div className="vl-continuity-actions">
                                <span>{continueWatchingVideos.length} {continueWatchingVideos.length === 1 ? 'session' : 'sessions'} Ready</span>
                                <button
                                    type="button"
                                    onClick={() => handleOpenVideo(continueWatchingVideos[0].video)}
                                    aria-label={`Resume latest video: ${continueWatchingVideos[0].video.title}`}
                                >
                                    Resume Latest
                                </button>
                            </div>
                        </div>
                        <div className="vl-cw-scroll vl-cw-grid">
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
                                        className="vl-continuity-card"
                                    >
                                        <div className="vl-continuity-media">
                                            <img
                                                src={getThumbnail(video.videoId)}
                                                alt=""
                                                loading="lazy"
                                                decoding="async"
                                                onLoad={event => recoverYouTubeThumbnail(event, video.videoId)}
                                                onError={event => recoverYouTubeThumbnail(event, video.videoId)}
                                            />
                                            {/* Resume play button */}
                                            <div className="vl-continuity-play">
                                                <span>Resume</span>
                                            </div>
                                            {/* Progress bar */}
                                            <div
                                                className="vl-continuity-progress"
                                                role="progressbar"
                                                aria-label={`${video.title} watch progress`}
                                                aria-valuemin="0"
                                                aria-valuemax="100"
                                                aria-valuenow={roundedProgress}
                                            >
                                                <span style={{ '--vl-progress': `${progress}%` }} />
                                            </div>
                                        </div>
                                        <div className="vl-continuity-copy">
                                            <strong>
                                                {video.title}
                                            </strong>
                                            <span>
                                                {roundedProgress}% Complete · {formatTime(item.watch_duration_seconds || 0)} Watched
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {continueWatchingVideos.length > cwVisible && (
                            <button type="button" className="vl-show-more" onClick={() => { haptic('light'); setCwVisible(continueWatchingVideos.length); }}>
                                Show All {continueWatchingVideos.length} Sessions
                            </button>
                        )}
                    </section>
                )}

                {/* New This Week: videos scraped in the last 7 days, a grid of four then Show More */}
                {newThisWeek.length > 0 && !newThisWeekDismissed && (
                    <section className="vl-new-this-week" aria-labelledby="vl-new-week-title">
                        <div className="vl-new-week-header">
                            <h2 id="vl-new-week-title">
                                <span>New</span>
                                New This Week
                            </h2>
                            <button type="button" onClick={() => setNewThisWeekDismissed(true)}>Dismiss</button>
                        </div>
                        <div className="vl-new-week-scroll vl-new-week-grid">
                            {newThisWeek.slice(0, newWeekVisible).map(video => (
                                <div
                                    key={video.videoId}
                                    className="vl-new-week-card"
                                    onClick={() => handleOpenVideo(video)}
                                    onKeyDown={(event) => handleVideoCardKeyDown(event, video)}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Play ${video.title}`}
                                >
                                    <div className="vl-new-week-media">
                                        <img src={getThumbnail(video.videoId)} alt="" loading="lazy" decoding="async" onLoad={event => recoverYouTubeThumbnail(event, video.videoId)} onError={event => recoverYouTubeThumbnail(event, video.videoId)} />
                                        <span className="vl-new-week-stamp">New</span>
                                        {video.duration && (
                                            <span className="vl-new-week-duration">{video.duration}</span>
                                        )}
                                    </div>
                                    <div className="vl-new-week-copy">
                                        <strong>{video.title}</strong>
                                        <span>{video.source.replace('_', ' ')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {newThisWeek.length > newWeekVisible && (
                            <button type="button" className="vl-show-more" onClick={() => { haptic('light'); setNewWeekVisible(newThisWeek.length); }}>
                                Show All {newThisWeek.length} New Videos
                            </button>
                        )}
                    </section>
                )}

                {/* Video Grid */}
                {catalogRefreshFailed && (
                    <div className="vl-catalog-notice" role="alert">
                        <span>Live Catalog Refresh Is Temporarily Unavailable. Unverified Cached Videos Stay Hidden.</span>
                        <button type="button" onClick={() => void fetchCatalogPage({ append: false })}>Retry Catalog</button>
                    </div>
                )}
                {deepLinkStatus && (
                    <div className="vl-catalog-notice" role="alert" data-video-deep-link-status={deepLinkStatus.type}>
                        <span>{deepLinkStatus.message}</span>
                        {deepLinkStatus.type === 'error' ? (
                            <button type="button" onClick={() => setDeepLinkRetryNonce(value => value + 1)}>Retry Video</button>
                        ) : (
                            <button
                                type="button"
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
                            <span className="vl-skeleton-line is-wide" />
                            <span className="vl-skeleton-line" />
                        </div>
                    ))}
                    {/* `videos` is seeded from STATIC_CATALOG - 161 titles that
                        need no request - and the comment on that import says it
                        exists to be shown "until DB fetch resolves". The
                        `!catalogLoading` gate meant it never was: every first
                        paint, and every server render, showed six skeletons
                        instead of the catalogue it already had, which is why a
                        crawler read 106 words on a page of 161 videos. The
                        skeleton branch just above still covers the only case
                        that needs it - loading with nothing to show yet. */}
                    {videos.map((video, index) => {
                        const progress = getProgressPercent(video.id, video.duration);
                        const roundedProgress = Math.round(progress);
                        const openLabel = progress > 0 && progress < 95 ? 'Resume' : 'Play';
                        const isFeatured = index === 0 && !hasActiveFilters && videos.length > 0;
                        return (
                        <div
                            key={video.id}
                            className={`vl-video-card${isFeatured ? ' is-featured' : ''}`}
                        >
                            <button
                                type="button"
                                className="vl-card-open-button"
                                aria-label={`${openLabel} ${video.title}${progress > 0 ? `, ${roundedProgress}% complete` : ''}`}
                                onClick={() => handleOpenVideo(video)}
                            />
                            {/* Thumbnail */}
                            <div className="vl-video-thumb">
                                <img
                                    src={getThumbnail(video.videoId)}
                                        alt=""
                                    loading={index === 0 ? 'eager' : 'lazy'}
                                    fetchpriority={index === 0 ? 'high' : 'auto'}
                                    decoding="async"
                                    onLoad={(event) => recoverYouTubeThumbnail(event, video.videoId)}
                                    onError={(event) => recoverYouTubeThumbnail(event, video.videoId)}
                                />
                                {/* Duration badge */}
                                <div className="vl-duration">
                                    {video.duration}
                                </div>
                                {/* Watched badge — tappable to mark-unwatched */}
                                {watchedVideos.has(video.id) && (
                                    <button
                                        type="button"
                                        className="vl-watched-badge"
                                        aria-label={`Mark ${video.title} as unwatched`}
                                        title="Mark as unwatched"
                                        onClick={e => { e.stopPropagation(); void handleMarkUnwatched(video); }}
                                    >
                                        Watched
                                    </button>
                                )}
                                {/* AI badge removed per user request */}
                                {/* Progress bar */}
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
                                {/* Play button overlay */}
                                <div className="vl-play-button" aria-hidden="true">
                                    <span>{openLabel}</span>
                                </div>
                            </div>

                            {/* Info */}
                            <div className="vl-card-info">
                                <h3 className="vl-card-title">
                                    {video.title}
                                </h3>

                                {progress > 0 && (
                                    <div className="vl-watch-signal" aria-hidden="true">
                                        <span>{progress >= 95 ? 'Watched' : 'Resume'}</span>
                                        <strong>{roundedProgress}%</strong>
                                    </div>
                                )}

                                <div className="vl-card-meta">
                                    <span className="vl-source-chip">
                                        {SOURCES.find(s => s.id === video.source)?.logo && (
                                            <span className="vl-source-chip-logo" aria-hidden="true">
                                                <img
                                                    src={SOURCES.find(s => s.id === video.source)?.logo}
                                                    alt=""
                                                />
                                            </span>
                                        )}
                                        {video.source.replace('_', ' ')}
                                    </span>
                                    <span className="vl-card-views">
                                        {video.views} Views
                                    </span>
                                    {/* Share button */}
                                    <button
                                        type="button"
                                        id={`vl-share-${video.videoId}`}
                                        className="vl-share-button"
                                        title="Copy link"
                                        onClick={e => { e.stopPropagation(); handleShareVideo(video); }}
                                        data-copied={visibleShareToast?.kind === 'share' && visibleShareToast?.tone === 'success' && visibleShareToast?.videoId === video.videoId ? 'true' : 'false'}
                                    >
                                        {visibleShareToast?.kind === 'share' && visibleShareToast?.tone === 'success' && visibleShareToast?.videoId === video.videoId ? 'Copied' : 'Share'}
                                    </button>
                                </div>
                            </div>
                        </div>
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
                        <div className="vl-empty-signal" aria-hidden="true"><span /></div>
                        <span className="vl-empty-kicker">{emptyState.eyebrow}</span>
                        <h3>{emptyState.title}</h3>
                        <p>{emptyState.copy}</p>
                        <button
                            type="button"
                            onClick={handleEmptyStateAction}
                        >
                            {emptyState.action}
                        </button>
                    </div>
                )}

                {/* Video count */}
                <div className="vl-video-count">
                    Showing {videos.length} Of {catalogTotal} Matching
                    {libraryFilter !== 'ALL' ? ` · ${personalSavedVideoCounts[libraryFilter]} saved` : ''}
                </div>
                    </div>
                    </VideoLibraryConsole>
                </section>
                </div>
                </PullToRefresh>
                </HubPageShell>
            </div>

            {/* Video Modal */}
            {selectedVideo && (
                <div
                    ref={modalOverlayRef}
                    className="vl-viewer"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="vl-viewer-title"
                    aria-describedby="vl-viewer-help"
                >
                    <p id="vl-viewer-help" className="vl-sr-only">
                        Use The Arrow Keys For The Previous Or Next Video, F For Fullscreen, And Escape To Close.
                    </p>
                    {/* Close button — positioned top-right, clear of YouTube's title bar */}
                    <button
                        ref={modalCloseButtonRef}
                        type="button"
                        onClick={handleCloseVideo}
                        className="vl-modal-close"
                        aria-label="Close"
                    >Close</button>

                    {/* Fullscreen & sound are handled by YouTube's native controls at bottom of iframe */}

                    {/* Prev / Next navigation arrows — desktop only (JS detection, no CSS tricks) */}
                    {!isTouchDevice && (
                      <>
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
                      </>
                    )}

                    {/* YouTube embed — takes FULL viewport on mobile */}
                    <div
                        className="vl-player-stage"
                        onMouseMove={!isTouchDevice ? vlRevealHud : undefined}
                        onFocusCapture={!isTouchDevice ? vlRevealHud : undefined}
                    >
                        {/* Edge swipe strips — thin vertical zones on left/right edges.
                            Center 70% remains fully interactive for YouTube controls/playback. */}
                        {isTouchDevice && (
                          <>
                            {/* Left edge swipe zone (15% width) */}
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
                            {/* Right edge swipe zone (15% width) */}
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

                        {/* Right-side HUD — Heart / Share / Save */}
                        <div
                            className={`vl-hud ${vlHudVisible ? 'vl-hud--visible' : ''}`}
                            data-always-visible={isTouchDevice ? 'true' : 'false'}
                            aria-hidden={!isTouchDevice && !vlHudVisible}
                            onFocusCapture={vlRevealHud}
                        >
                            {/* Heart / Like */}
                            <button
                                type="button"
                                aria-label={favorites.has(selectedVideo?.id || selectedVideo?.videoId) ? 'Remove video from favorites' : 'Add video to favorites'}
                                aria-pressed={favorites.has(selectedVideo?.id || selectedVideo?.videoId)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedVideo) void toggleFavorite(selectedVideo);
                                    vlRevealHud(); // reset auto-hide timer
                                }}
                                title="Like"
                            >
                                <span className="vl-hud-command">
                                    {favorites.has(selectedVideo?.id || selectedVideo?.videoId) ? 'Liked' : 'Like'}
                                </span>
                            </button>


                            {/* Share */}
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

                            {/* Save / Watch Later */}
                            <button
                                type="button"
                                aria-label={watchLater.has(selectedVideo?.id || selectedVideo?.videoId) ? 'Remove video from watch later' : 'Save video to watch later'}
                                aria-pressed={watchLater.has(selectedVideo?.id || selectedVideo?.videoId)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedVideo) void toggleWatchLater(selectedVideo);
                                    vlRevealHud();
                                }}
                                title="Save"
                            >
                                <span className="vl-hud-command">
                                    {watchLater.has(selectedVideo?.id || selectedVideo?.videoId) ? 'Saved' : 'Save'}
                                </span>
                            </button>

                            {/* Playlist */}
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
                        </div>

                        <iframe
                            ref={playerIframeRef}
                            key={iframeKey}
                            id="youtube-player"
                            src={`https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=${preferences.autoplay === false ? 0 : 1}&start=${selectedVideoResumeSeconds}&mute=${isTouchDevice ? 0 : 1}&rel=0&fs=1&iv_load_policy=3&enablejsapi=1&playsinline=1&cc_load_policy=${preferences.captions ? 1 : 0}&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}`}
                            title={selectedVideo.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                            allowFullScreen
                            onLoad={(e) => {
                                // mute=1 in URL ensures mobile autoplay compliance.
                                // Now unmute immediately — the user tapped a card (valid gesture), so audio is allowed.
                                // BUG-K FIX: track timer IDs so they can be cancelled if modal closes < 1200ms
                                iframeUnmuteTimers.current.forEach(clearTimeout);
                                iframeUnmuteTimers.current = [];
                                try {
                                    const win = e.target.contentWindow;
                                    win.postMessage(JSON.stringify({ event: 'listening' }), '*');

                                    // Autoplay: mobile uses mute=0 (user gesture from card tap allows it).
                                    // Desktop uses mute=1 + postMessage unmute.
                                    if (!isTouchDevice) {
                                        iframeUnmuteTimers.current = [200, 600, 1200].map(d => setTimeout(() => {
                                            try {
                                                win.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
                                                win.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }), '*');
                                            } catch (error) {
                                                reportVideoLibraryIssue('youtube_unmute_command', error);
                                            }
                                        }, d));
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
                                <VideoLibraryConsole
                                    eyebrow={`Playback Signal ${vlYtManaged}`}
                                    title={vlYtErrorInfo?.title || 'Video Unavailable'}
                                    subtitle="Closing In 3 Seconds"
                                    pill="Offline"
                                    pillInk="red"
                                    foot="plates"
                                    plates={{
                                        secondary: { label: 'Close Viewer', onClick: handleCloseVideo },
                                        primary: {
                                            label: 'Open On YouTube',
                                            ink: 'white',
                                            onClick: () => window.open(`https://www.youtube.com/watch?v=${selectedVideo.videoId}`, '_blank', 'noopener,noreferrer'),
                                        },
                                    }}
                                >
                                    <ConsoleCopy align="center">
                                        {vlYtErrorInfo?.description || 'This Video Cannot Be Played In The Embedded Viewer Right Now.'}
                                    </ConsoleCopy>
                                </VideoLibraryConsole>
                            </div>
                        )}
                    </div>


                    {/* Video info bar + Related Videos Rail — ABSOLUTE on mobile, flex child on desktop */}
                    <div className="vl-info-bar">
                        {/* Info Row */}
                        <div className="vl-info-copy">
                            <h2 id="vl-viewer-title">
                                {selectedVideo.title}
                            </h2>
                            <div className="vl-info-meta">
                                <span className="vl-info-source">
                                    {SOURCES.find(s => s.id === selectedVideo.source)?.logo && (
                                        <img src={SOURCES.find(s => s.id === selectedVideo.source)?.logo}
                                            alt="" decoding="async" />
                                    )}
                                    {selectedVideo.source.replace('_', ' ')}
                                </span>
                                <span>
                                    {selectedVideo.views} Views
                                </span>
                                <span>
                                    {selectedVideo.duration}
                                </span>
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
                                    Train This Spot
                                </button>
                            </div>
                        </div>

                        {/* ── P3: Related Videos Rail ── */}
                        {relatedVideos.length > 0 && (
                            <div className="vl-up-next-rail">
                                <div className="vl-up-next-label">
                                    Up Next
                                </div>
                                <div className="vl-up-next-scroll vl-up-next-grid">
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
                                                <img
                                                    src={getThumbnail(v.videoId)}
                                                    alt=""
                                                    loading="lazy"
                                                    decoding="async"
                                                    onLoad={event => recoverYouTubeThumbnail(event, v.videoId)}
                                                    onError={event => recoverYouTubeThumbnail(event, v.videoId)}
                                                />
                                                {v.duration && (
                                                    <span className="vl-up-next-duration">{v.duration}</span>
                                                )}
                                            </div>
                                            <div className="vl-up-next-copy">
                                                <strong>{v.title}</strong>
                                                <span>
                                                    {v.source.replace('_', ' ')}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                /* The viewer Close control clears the status bar. The page that
                   owns the full-screen overlay carries the inset itself
                   (overlays-leave-room-to-close.law), matching the world sheet. */
                .vl-modal-close { top: calc(env(safe-area-inset-top, 0px) + 12px); }
                .vl-show-more { display: block; width: 100%; min-height: 44px; margin-top: 12px; }
                .vl-show-all-sources { display: none; }
                @media (max-width: 768px) {
                    .vl-search-wrap { width: 100% !important; flex-basis: 100% !important; margin-left: 0 !important; }
                    .vl-show-all-sources { display: block; }
                    .vl-info-bar { position: relative !important; max-height: 46dvh !important; flex: 0 0 auto; pointer-events: auto; z-index: 6; }
                    .vl-up-next-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
                }
                @media (min-width: 769px) { .vl-info-bar { max-height: min(25dvh, 200px); } }
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
                        <VideoLibraryConsole
                            eyebrow="Personal Library"
                            title="Save To Playlist"
                            titleId="vl-playlist-title"
                            subtitle="Choose A Playlist Or Create One"
                            pill={`${playlists.length} Lists`}
                            pillInk="gold"
                            foot="foot"
                        >
                        <div className="vl-playlist-header">
                            <button onClick={() => { setShowPlaylistModal(null); setPlaylistActionError(null); }}
                                type="button" aria-label="Close playlist dialog"
                                className="vl-glass-action">Close</button>
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
                                            <strong>{p.name}</strong>
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
                        </VideoLibraryConsole>
                    </div>
                </div>
            )}

            {/* ── Train This Spot In-Place Overlay ── */}
            {ttsOverlay && (
                <div className="vl-tts-sheet" role="presentation">
                    <div className="vl-tts-backdrop" onClick={() => setTtsOverlay(null)} />
                    <div ref={ttsDialogRef} className="vl-tts-dialog" role="dialog" aria-modal="true" aria-labelledby="vl-tts-title">
                        <VideoLibraryConsole
                            eyebrow="Smarter Training"
                            title="Train This Spot"
                            titleId="vl-tts-title"
                            subtitle="Matched Drills For This Video"
                            pill={`${ttsOverlay.games.length} Drills`}
                            pillInk="green"
                            foot="foot"
                        >
                        <div className="vl-tts-header">
                            <button ref={ttsCloseButtonRef} type="button" aria-label="Close" className="vl-glass-action" onClick={() => setTtsOverlay(null)}>Close</button>
                        </div>
                        <div className="vl-tts-video">
                            <div className="vl-tts-video-media">
                                <img src={`https://img.youtube.com/vi/${ttsOverlay.ctx.vid}/mqdefault.jpg`} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
                            </div>
                            <div className="vl-tts-video-copy">
                                <strong>{ttsOverlay.ctx.title || 'Poker Video'}</strong>
                                <div className="vl-tts-source">
                                    <span>{(ttsOverlay.ctx.source || '').replace(/_/g, ' ')}</span>
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
                        </VideoLibraryConsole>
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
