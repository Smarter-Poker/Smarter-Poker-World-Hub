/**
 * VIDEO LIBRARY - Full Poker Videos from Global Livestreams
 * Browse and watch complete hands from HCL, The Lodge, Triton, and more
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';
import { useYouTubeErrorManager, YouTubeErrorOverlay } from '../../src/hooks/useYouTubeErrorManager';
import SEOHead from '../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { getVideoPlaylists, createPlaylist, addVideoToPlaylist, removeVideoFromPlaylist } from '../../src/services/videoPlaylists';
import { supabase } from '../../src/lib/supabase';
import { useAvatar } from '../../src/contexts/AvatarContext';
import { getMenuConfig } from '../../src/config/hamburgerMenus';

const UniversalHeader = dynamic(() => import('../../src/components/ui/UniversalHeader'), { ssr: false });
const HamburgerMenu = dynamic(() => import('../../src/components/ui/HamburgerMenu'), { ssr: false });
import { getVideoLibraryPreferences, updateVideoLibraryPreferences } from '../../src/services/videoLibraryPreferences';
import { getVideoFavorites, addVideoFavorite, removeVideoFavorite } from '../../src/services/videoFavorites';
import { getWatchLater, addToWatchLater, removeFromWatchLater } from '../../src/services/videoWatchLater';
import { updateWatchDuration, getWatchedVideos, getWatchProgress, getRecentlyWatched, removeFromWatchHistory } from '../../src/services/videoWatchHistory';

// God-Mode Stack
import { useVideoLibraryStore } from '../../src/stores/videoLibraryStore';
import useTrainingBus from '../../src/hooks/useTrainingBus';

const PageTransition = dynamic(() => import('../../src/components/transitions/PageTransition'), { ssr: false });
const BottomNavBar = dynamic(() => import('../../src/components/ui/BottomNavBar'), { ssr: false });
// ReelsViewer is dynamically loaded to reduce initial bundle size
const ReelsViewer = dynamic(() => import('../../src/components/social/Reels').then(mod => mod.ReelsViewer), { ssr: false });
import { findBestGames, buildSandboxUrl, extractCardsFromContext } from '../../src/utils/videoToTrainingMapper';

// Static fallback catalog — used until DB fetch resolves
import {
    FULL_VIDEOS as STATIC_VIDEOS,
    SOURCES
} from '../../src/data/videoLibraryData';

/** Format a raw view count number into a short human-readable string */
function formatViews(n) {
    if (!n || n === 0) return '';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
}

/** Normalise a DB video_library_videos row to match the FULL_VIDEOS shape */
function normaliseDbVideo(row) {
    // views_text may be '0' or null for some static-seeded rows — fall back to views_count
    const viewsText = (row.views_text && row.views_text !== '0')
        ? row.views_text
        : formatViews(row.views_count);
    return {
        id: row.youtube_video_id,
        videoId: row.youtube_video_id,
        source: row.source_id,
        type: row.type || 'cash',
        title: row.title,
        views: viewsText || '',
        duration: row.duration || '',
        thumbnail: row.thumbnail_url || `https://img.youtube.com/vi/${row.youtube_video_id}/maxresdefault.jpg`,
        publishedAt: row.published_at,
        scrapedAt: row.scraped_at,
        tags: Array.isArray(row.tags) ? row.tags : (row.tags || []),
        legacyId: STATIC_VIDEO_CANONICAL_ALIASES.get(row.youtube_video_id) || null,
        // Sort key: prefer published_at when it's a real date (not today), else use scraped_at
        _sortKey: row.published_at,
    };
}

// Persistence uses YouTube's video ID as the canonical key. The legacy static
// catalog used display-only aliases (hcl1, lodge1, ...), which orphaned saved
// state whenever the database hydrated. Invalid FAKE placeholders are excluded
// from the playable fallback catalog instead of producing guaranteed dead embeds.
const STATIC_VIDEO_ALIASES = new Map(STATIC_VIDEOS.map(video => [video.id, video.videoId]));
const STATIC_VIDEO_CANONICAL_ALIASES = new Map(STATIC_VIDEOS.map(video => [video.videoId, video.id]));
const canonicalStoredVideoId = videoId => STATIC_VIDEO_ALIASES.get(videoId) || videoId;
const STATIC_CATALOG = STATIC_VIDEOS
    .filter(video => video.videoId && !String(video.videoId).startsWith('FAKE'))
    .map(video => ({ ...video, legacyId: video.id, id: video.videoId, videoId: video.videoId }));

const C = {
    bg: '#0a0a0a',
    card: '#1a1a1a',
    cardHover: '#252525',
    text: '#FFFFFF',
    textSec: 'rgba(255,255,255,0.6)',
    border: '#333',
    accent: '#00D4FF',
    blue: '#0A84FF',
};

// ─── Pure helpers at module scope (must be here, not inside the component).
// Placing them inside the component caused a TDZ crash during SSR prerendering:
// useMemo(trendingScores) references parseViews before its `const` declaration
// when the minifier reorders declarations, producing "Cannot access 'e8' before
// initialization" and breaking the /hub/video-library static build step.

/** Parse views string ('1.5K' → 1500, '2.3M' → 2300000, '800' → 800) */
function parseViews(v) {
    if (!v) return 0;
    const s = String(v).trim();
    const m = s.match(/^([0-9.]+)\s*([KMkm])?/);
    if (!m) return 0;
    const num = parseFloat(m[1]) || 0;
    const suffix = (m[2] || '').toUpperCase();
    if (suffix === 'M') return Math.round(num * 1_000_000);
    if (suffix === 'K') return Math.round(num * 1_000);
    return Math.round(num);
}

/** Parse duration string (e.g., "18:34" or "1:23:45") to seconds */
function parseDuration(durationStr) {
    if (!durationStr) return 0;
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

/** Keep a newly selected horizontal-rail control visible without moving the page. */
function keepRailButtonInView(button) {
    const rail = button?.parentElement;
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;

    window.requestAnimationFrame(() => {
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        rail.scrollTo({
            left: button.offsetLeft - ((rail.clientWidth - button.clientWidth) / 2),
            behavior: reducedMotion ? 'auto' : 'smooth',
        });
    });
}

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
    }
}

export default function VideoLibraryPage() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;

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

    const selectedSource = filters.selectedSource;
    const selectedType = filters.selectedType;
    const setSelectedSource = (val) => setFilter('selectedSource', val);
    const setSelectedType = (val) => setFilter('selectedType', val);

    // Local state — initialise with static data instantly, then hydrate from DB
    const [videos, setVideos] = useState(STATIC_CATALOG);
    const [displayedCount, setDisplayedCount] = useState(30);
    const [allVideos, setAllVideos] = useState(STATIC_CATALOG); // unfiltered master list
    const [catalogRefreshFailed, setCatalogRefreshFailed] = useState(false);

    // Fetch live videos from Supabase (replaces / extends static list)
    useEffect(() => {
        let cancelled = false;
        const PAGE_SIZE = 1000;
        let allDbVideos = [];

        async function fetchAllPages() {
            setCatalogRefreshFailed(false);
            let from = 0;
            while (true) {
                const { data, error } = await supabase
                    .from('video_library_videos')
                    .select('youtube_video_id, source_id, source_name, type, title, thumbnail_url, views_text, views_count, duration, published_at, scraped_at, tags')
                    .order('scraped_at', { ascending: false })
                    .range(from, from + PAGE_SIZE - 1);
                if (cancelled) return;
                if (error) throw error;
                if (!data || data.length === 0) break;
                allDbVideos = allDbVideos.concat(data.map(normaliseDbVideo));
                if (data.length < PAGE_SIZE) break; // last page
                from += PAGE_SIZE;
            }
            if (cancelled) return;
            // Deduplicate by videoId (DB takes precedence over static)
            const seen = new Set();
            const deduped = [];
            for (const v of allDbVideos) {
                if (!seen.has(v.videoId)) { seen.add(v.videoId); deduped.push(v); }
            }
            const dbIds = seen;
            // Include any static-only videos not yet in DB (safety net fallback)
            const staticOnly = STATIC_CATALOG.filter(v => !dbIds.has(v.videoId));
            const merged = [...deduped, ...staticOnly];
            setAllVideos(merged);
            setVideos(merged);
        }

        fetchAllPages().catch(error => {
            console.warn('Video catalog refresh failed; using static fallback:', error);
            if (!cancelled) setCatalogRefreshFailed(true);
        });
        return () => { cancelled = true; };
    }, []);


    // Handle query parameters for deep linking
    const savedScrollY = useRef(0); // restore scroll when modal closes
    // Stable ref so the early query-param useEffect can call handleOpenVideo
    // without putting it in the dependency array (avoids TDZ in minified output)
    const handleOpenVideoRef = useRef(null);
    const handleCloseVideoRef = useRef(null);
    const saveWatchSessionRef = useRef(null);
    const openedQueryVideoRef = useRef(null);
    const hadNavigationQueryRef = useRef(false);
    useEffect(() => {
        if (!router.isReady) return;

        const hasNavigationQuery = Boolean(router.query.type || router.query.source || router.query.filter);
        if (!hasNavigationQuery && hadNavigationQueryRef.current) {
            setSelectedType('ALL');
            setSelectedSource('ALL');
            setLibraryFilter('ALL');
            setSearchQuery('');
        }
        hadNavigationQueryRef.current = hasNavigationQuery;

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
            if (f === 'favorites' || f === 'history' || f === 'watchlater') {
                setLibraryFilter(f);
            } else {
                setSearchQuery(String(requestedFilter));
            }
        }
        // ?v=VIDEO_ID — auto-open a specific video
        if (router.query.v && allVideos.length > 0) {
            const requestedVideoId = String(router.query.v);
            const target = allVideos.find(v => v.videoId === requestedVideoId);
            if (target && openedQueryVideoRef.current !== requestedVideoId && handleOpenVideoRef.current) {
                openedQueryVideoRef.current = requestedVideoId;
                handleOpenVideoRef.current(target);
            }
        } else {
            openedQueryVideoRef.current = null;
        }
    }, [router.isReady, router.query, allVideos]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showReelsModal, setShowReelsModal] = useState(false);
    const searchInputRef = useRef(null);
    const reelsDialogRef = useRef(null);
    const reelsTriggerRef = useRef(null);
    const modalOverlayRef = useRef(null); // ref for native fullscreen
    const playerIframeRef = useRef(null);
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
    const [favorites, setFavorites] = useState(new Set());
    const [playlists, setPlaylists] = useState([]);
    const [showPlaylistModal, setShowPlaylistModal] = useState(null); // video object
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false); // loading state for playlist creation
    const [playlistActionError, setPlaylistActionError] = useState(null); // error feedback
    const createPlaylistButtonRef = useRef(null);
    const playlistDialogRef = useRef(null);
    const playlistNameInputRef = useRef(null);
    const playlistTriggerRef = useRef(null);
    const [watchLater, setWatchLater] = useState(new Set());
    // 2026-08-15: the three "My Library" hamburger entries
    // (?filter=favorites|history|watchlater) previously fell into a handler
    // that just ran setSearchQuery('favorites'), so users got
    // `0 results for "favorites"`. There was no such view at all. The data
    // was already in state (favorites / watchLater / watchedVideos are Sets
    // of video ids) — it just was never wired to a filter.
    const [libraryFilter, setLibraryFilter] = useState('ALL');
    const [watchedVideos, setWatchedVideos] = useState(new Set()); // Videos watched 60+ seconds
    const [watchProgress, setWatchProgress] = useState(new Map()); // video_id → { watchedSeconds, watchedAt }
    const watchProgressRef = useRef(new Map());
    const [recentlyWatched, setRecentlyWatched] = useState([]); // Recently watched videos

    // ── P3: Sort mode — 'default' | 'trending' | 'top_rated' ─────────────────
    const [sortMode, setSortMode] = useState('default');

    // ── P3: Trending score — views × recency decay (7-day half-life)
    // useMemo: stable Map reference — only recomputes when allVideos changes.
    // CRITICAL: IIFE here would create a new Map every render, triggering the
    // filter useEffect on every state change (infinite re-render loop in trending mode).
    const trendingScores = useMemo(() => {
        const now = Date.now();
        const HALF_LIFE_MS = 7 * 24 * 3600 * 1000; // 7 days
        const scores = new Map();
        allVideos.forEach(v => {
            const views = parseViews(v.views);
            const scraped = v.scrapedAt || v.publishedAt;
            const ageMs = scraped ? now - new Date(scraped).getTime() : HALF_LIFE_MS * 4;
            const decay = Math.pow(2, -ageMs / HALF_LIFE_MS);
            scores.set(v.id, views * decay + (ageMs < 3 * 24 * 3600 * 1000 ? 50000 : 0));
        });
        return scores;
    }, [allVideos]); // ← stable dep: only recomputes when the video list changes


    // Command-status notice for copy, save, favorite, and history feedback.
    const [shareToast, setShareToast] = useState(null); // { message, videoId, tone, kind }
    const [ttsOverlay, setTtsOverlay] = useState(null); // Train This Spot in-place overlay { ctx, games }
    const ttsDialogRef = useRef(null);
    const ttsCloseButtonRef = useRef(null);
    const ttsTriggerRef = useRef(null);
    const shareToastTimer = useRef(null);
    const pendingVideoActionsRef = useRef(new Set());
    const showActionNotice = useCallback((message, { videoId = null, tone = 'success', kind = 'action' } = {}) => {
        if (shareToastTimer.current) clearTimeout(shareToastTimer.current);
        setShareToast({ message, videoId, tone, kind });
        shareToastTimer.current = setTimeout(() => setShareToast(null), 2800);
    }, []);

    useEffect(() => {
        watchProgressRef.current = watchProgress;
    }, [watchProgress]);

    // Video modal HUD (heart/comment/share/save) — tap to show, auto-hides
    const [vlHudVisible, setVlHudVisible] = useState(false);
    const vlHudTimer = useRef(null);
    const vlRevealHud = useCallback(() => {
        setVlHudVisible(true);
        clearTimeout(vlHudTimer.current);
        vlHudTimer.current = setTimeout(() => setVlHudVisible(false), 5000);
    }, []);

    // "New This Week" rail dismiss state
    const [newThisWeekDismissed, setNewThisWeekDismissed] = useState(false);

    const isPlayerPlayingRef = useRef(false);
    const handlePlayerStateChange = useCallback((state) => {
        if (state === 1) {
            isPlayerPlayingRef.current = true;
            watchSessionUserIdRef.current = userId || null;
            if (currentWatchingVideoRef.current && !watchStartTimeRef.current) watchStartTimeRef.current = Date.now();
            return;
        }
        if (state === 0 || state === 2) {
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
    const { ytError: vlYtManaged, thumbnailUrl: vlThumbnailUrl } = useYouTubeErrorManager({
        active: !!selectedVideo,
        videoId: selectedVideo?.videoId || null,
        surface: 'VideoLibrary',
        autoActionDelay: 3000,
        onStateChange: handlePlayerStateChange,
        iframeRef: playerIframeRef,
        onError: handleManagedPlayerError,
    });



    
    // Infinite scroll observer — created once, uses functional updater so no dep on videos.length
    const loadMoreRef = useRef(null);
    useEffect(() => {
        if (displayedCount >= videos.length || !loadMoreRef.current) return;
        const sentinel = loadMoreRef.current;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                // Use the ref directly to get current videos count, avoiding stale closure
                setDisplayedCount(prev => prev + 30);
            }
        }, { rootMargin: '400px' });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [displayedCount, videos.length]);

    // Reset displayed count when filters OR sort mode changes
    useEffect(() => {
        setDisplayedCount(30);
    // BUG-18 FIX: sortMode added — switching Trending/Top-Rated/Latest now resets pagination
    }, [selectedSource, selectedType, searchQuery, sortMode, libraryFilter]);

    // Watch time tracking
    const watchStartTimeRef = useRef(null);
    const currentWatchingVideoRef = useRef(null);
    const watchSessionUserIdRef = useRef(null);

    // Hamburger menu preferences
    const [preferences, setPreferences] = useState({
        autoplay: true,
        hdQuality: true,
        captions: false
    });

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

        const clearUserLibrary = () => {
            setFavorites(new Set());
            setWatchLater(new Set());
            setWatchedVideos(new Set());
            setWatchProgress(new Map());
            watchProgressRef.current = new Map();
            setRecentlyWatched([]);
            setPlaylists([]);
        };

        if (!userId) {
            setPreferences({ autoplay: true, hdQuality: true, captions: false });
            clearUserLibrary();
            return undefined;
        }

        clearUserLibrary();

        const refreshUserLibrary = async () => {
            const now = Date.now();
            if (refreshInFlight || now - lastRefreshAt < 500) return;
            refreshInFlight = true;
            lastRefreshAt = now;
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
            if (cancelled) return;

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
            if (results.some(result => result.status === 'rejected')) {
                showActionNotice('Some saved library data could not be refreshed. Try again.', { tone: 'error' });
            }
        };

        void refreshUserLibrary();
        const refreshOnVisible = () => {
            if (document.visibilityState === 'visible') void refreshUserLibrary();
        };
        window.addEventListener('focus', refreshUserLibrary);
        document.addEventListener('visibilitychange', refreshOnVisible);
        return () => {
            cancelled = true;
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
        const previousValue = preferences[key];
        // BUG-C FIX: use functional setState so rapid toggles never read stale preferences
        setPreferences(prev => ({ ...prev, [key]: value }));

        if (userId) {
            try {
                await updateVideoLibraryPreferences(userId, { [key]: value });
            } catch (error) {
                console.warn('Failed to save preference:', error);
                setPreferences(prev => ({ ...prev, [key]: previousValue }));
                showActionNotice('Player setting was not saved. Try again.', { tone: 'error' });
            }
        }
    }, [userId, preferences, showActionNotice]);

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

        const videoId = video.id;
        const actionKey = `favorite:${videoId}`;
        if (pendingVideoActionsRef.current.has(actionKey)) return false;
        pendingVideoActionsRef.current.add(actionKey);
        const wasFavorite = favorites.has(videoId);

        setFavorites(prev => {
            const next = new Set(prev);
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
            showActionNotice(wasFavorite ? 'Removed from favorites.' : 'Added to favorites.', { videoId: video.videoId });
            return true;
        } catch (error) {
            setFavorites(prev => {
                const next = new Set(prev);
                if (wasFavorite) next.add(videoId); else next.delete(videoId);
                return next;
            });
            showActionNotice('Favorite was not saved. Try again.', { videoId: video.videoId, tone: 'error' });
            return false;
        } finally {
            pendingVideoActionsRef.current.delete(actionKey);
        }
    }, [userId, favorites, showActionNotice]);

    const toggleWatchLater = useCallback(async (video) => {
        if (!userId) {
            showActionNotice('Sign in to save videos.', { videoId: video.videoId, tone: 'info' });
            return false;
        }

        const videoId = video.id;
        const actionKey = `watch-later:${videoId}`;
        if (pendingVideoActionsRef.current.has(actionKey)) return false;
        pendingVideoActionsRef.current.add(actionKey);
        const wasSaved = watchLater.has(videoId);

        setWatchLater(prev => {
            const next = new Set(prev);
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
            showActionNotice(wasSaved ? 'Removed from Watch Later.' : 'Saved to Watch Later.', { videoId: video.videoId });
            return true;
        } catch (error) {
            setWatchLater(prev => {
                const next = new Set(prev);
                if (wasSaved) next.add(videoId); else next.delete(videoId);
                return next;
            });
            showActionNotice('Watch Later was not updated. Try again.', { videoId: video.videoId, tone: 'error' });
            return false;
        } finally {
            pendingVideoActionsRef.current.delete(actionKey);
        }
    }, [userId, watchLater, showActionNotice]);

    const saveWatchSession = useCallback(async (startTime, video, { quiet = false, sessionUserId = watchSessionUserIdRef.current } = {}) => {
        const effectiveUserId = sessionUserId || userId;
        if (!startTime || !video || !effectiveUserId) return false;
        const watchedSeconds = Math.floor((Date.now() - startTime) / 1000);
        if (watchedSeconds <= 0) return false;

        const previousWatched = watchProgressRef.current.get(video.id)?.watchedSeconds || 0;
        const totalWatched = previousWatched + watchedSeconds;

        try {
            const savedSession = await updateWatchDuration(effectiveUserId, video.id, watchedSeconds, {
                title: video.title,
                url: `https://youtube.com/watch?v=${video.videoId}`,
                thumbnail: `https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`,
                durationSeconds: parseDuration(video.duration)
            });
            const persistedProgress = Number(savedSession?.progress_seconds);
            const persistedTotal = Number(savedSession?.watch_duration_seconds);
            const nextProgress = Number.isFinite(persistedProgress)
                ? persistedProgress
                : totalWatched;

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
            getRecentlyWatched(effectiveUserId, 10)
                .then(recent => setRecentlyWatched(recent))
                .catch(() => {
                    setRecentlyWatched(prev => [{
                        video_id: video.id,
                        video_title: video.title,
                        watch_duration_seconds: confirmedTotal,
                        watched_at: new Date().toISOString()
                    }, ...prev.filter(item => item.video_id !== video.id)].slice(0, 10));
                });

            return true;
        } catch (error) {
            console.warn('Error saving watch duration:', error);
            if (!quiet) showActionNotice('Watch progress was not saved. Try again.', { videoId: video.videoId, tone: 'error' });
            return false;
        }
    }, [userId, showActionNotice]);

    // Navigate to a specific video in the current filtered list
    const handleOpenVideo = useCallback(async (video) => {
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
    // Keep ref in sync so early useEffects can call it without a TDZ dep
    useEffect(() => { handleOpenVideoRef.current = handleOpenVideo; }, [handleOpenVideo]);

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
        const videoId = video.id;
        const actionKey = `history:${videoId}`;
        if (pendingVideoActionsRef.current.has(actionKey)) return;
        pendingVideoActionsRef.current.add(actionKey);

        try {
            await removeFromWatchHistory(userId, videoId, video.legacyId ? [video.legacyId] : []);
            setWatchedVideos(prev => { const next = new Set(prev); next.delete(videoId); return next; });
            setWatchProgress(prev => {
                const next = new Map(prev);
                next.delete(videoId);
                watchProgressRef.current = next;
                return next;
            });
            setRecentlyWatched(prev => prev.filter(item => item.video_id !== videoId));
            showActionNotice('Removed from watch history.', { videoId: video.videoId });
        } catch (error) {
            showActionNotice('Watch history was not updated. Try again.', { videoId: video.videoId, tone: 'error' });
        } finally {
            pendingVideoActionsRef.current.delete(actionKey);
        }
    }, [userId, showActionNotice]);

    // Filter videos (runs when any filter changes OR when DB data loads)
    useEffect(() => {
        let filtered = allVideos;
        if (selectedType !== 'ALL') {
            filtered = filtered.filter(v => v.type === selectedType);
        }
        if (selectedSource !== 'ALL') {
            filtered = filtered.filter(v => v.source === selectedSource);
        }

        if (libraryFilter !== 'ALL') {
            const set = libraryFilter === 'favorites' ? favorites
                : libraryFilter === 'watchlater' ? watchLater
                : watchedVideos;
            filtered = filtered.filter(v => set.has(v.id));
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(v =>
                v.title.toLowerCase().includes(q) ||
                v.source.toLowerCase().includes(q) ||
                (v.tags && v.tags.some(t => t.toLowerCase().includes(q)))
            );
        }
        // Apply sort mode
        if (sortMode === 'trending') {
            filtered = [...filtered].sort((a, b) => (trendingScores.get(b.id) || 0) - (trendingScores.get(a.id) || 0));
        } else if (sortMode === 'top_rated') {
            // FIX: was regex-based parser that gave '2.3M' → 23,000,000 (10x wrong)
            // parseViews() correctly handles decimals: '2.3M' → 2,300,000
            filtered = [...filtered].sort((a, b) => parseViews(b.views) - parseViews(a.views));
        } else {
            // Default: watched videos sink to bottom
            filtered = [...filtered].sort((a, b) => {
                const aWatched = watchedVideos.has(a.id);
                const bWatched = watchedVideos.has(b.id);
                if (aWatched === bWatched) return 0;
                return aWatched ? 1 : -1;
            });
        }
        setVideos(filtered);
    }, [selectedSource, selectedType, searchQuery, watchedVideos, allVideos, sortMode, trendingScores, libraryFilter, favorites, watchLater]);


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
            requestAnimationFrame(() => reelsTriggerRef.current?.focus({ preventScroll: true }));
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

    // ── BUG-I FIX: Flush pending watch time on tab hide / browser close ──────────
    // Without this, a user closing the tab mid-video loses all watch time because
    // handleCloseVideo never runs. visibilitychange fires reliably on mobile too.
    const pendingFlushRef = useRef(false);
    useEffect(() => {
        const flushWatchTime = () => {
            if (pendingFlushRef.current) return; // debounce double-fire
            if (!watchStartTimeRef.current || !currentWatchingVideoRef.current || !userId) return;
            pendingFlushRef.current = true;
            const startTime = watchStartTimeRef.current;
            const video = currentWatchingVideoRef.current;
            watchStartTimeRef.current = null;
            currentWatchingVideoRef.current = null;
            void saveWatchSession(startTime, video, { quiet: true });
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
    }, [userId, selectedVideo, saveWatchSession]);

    const activeSourceName = SOURCES.find(source => source?.id === selectedSource)?.name || selectedSource;
    const activeFilterLabels = [
        selectedType !== 'ALL' ? (selectedType === 'cash' ? 'Cash Games' : 'Tournaments') : null,
        selectedSource !== 'ALL' ? activeSourceName : null,
        sortMode !== 'default' ? (sortMode === 'trending' ? 'Trending' : 'Top Rated') : null,
        libraryFilter !== 'ALL' ? ({ favorites: 'Favorites', history: 'Watch History', watchlater: 'Watch Later' }[libraryFilter] || libraryFilter) : null,
        searchQuery ? `Search: “${searchQuery}”` : null,
    ].filter(Boolean);
    const hasActiveFilters = activeFilterLabels.length > 0;

    const emptyState = searchQuery
        ? {
            eyebrow: 'Search complete',
            title: 'No Match In The Library',
            copy: `Nothing matches “${searchQuery}”. Clear the search to return to the full table.`,
            action: 'Clear Search',
        }
        : libraryFilter === 'favorites'
            ? {
                eyebrow: 'Favorites',
                title: 'No Favorites Yet',
                copy: 'Favorite a video in the viewer and it will be waiting here for your next study session.',
                action: 'Browse All Videos',
            }
            : libraryFilter === 'watchlater'
                ? {
                    eyebrow: 'Watch Later',
                    title: 'Your Queue Is Clear',
                    copy: 'Save a video from the viewer to build a focused study queue.',
                    action: 'Browse All Videos',
                }
                : libraryFilter === 'history'
                    ? {
                        eyebrow: 'Watch History',
                        title: 'No Watch History Yet',
                        copy: 'Start a video and your recent sessions will appear here automatically.',
                        action: 'Browse All Videos',
                    }
                    : {
                        eyebrow: 'Filter complete',
                        title: 'No Videos In This View',
                        copy: 'This combination is too narrow. Reset the view to reopen the full library.',
                        action: 'Reset View',
                    };

    const clearAllFilters = () => {
        setSearchQuery('');
        setSelectedSource('ALL');
        setSelectedType('ALL');
        setSortMode('default');
        setLibraryFilter('ALL');
        if (router.query.type || router.query.source || router.query.filter) {
            const { type: _type, source: _source, filter: _filter, ...nextQuery } = router.query;
            hadNavigationQueryRef.current = false;
            void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true, scroll: false });
        }
    };

    const handleEmptyStateAction = () => {
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

    return (
        <PageTransition>
            
            <SEOHead
                title="Poker Video Library — Watch & Learn"
                description="Curated Poker Video Library With Strategy Content, Tournament Coverage, And Training Videos. Track Your Watch History And Get AI Tactical Analysis."
                canonical="/hub/video-library"
            />

            <div className="video-library-page" style={{
                minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
                background: C.bg,
                padding: '20px',
            }}>
                {/* Header */}
                <div className="vl-header-area" style={{
                    maxWidth: 1400,
                    margin: '0 auto',
                    marginBottom: 24,
                }}>
                    {/* Global Header - Full Width */}
                    <div className="vl-global-header" style={{ marginBottom: 20 }}>
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

                <div className="vl-command-layout">
                    <aside className="vl-command-rail" aria-label="Video library filters">
                        <div className="vl-rail-kicker">Smarter.Poker Hub</div>
                        <h1 className="vl-rail-title">Video <span>Library</span></h1>

                    {/* Type, sort, and format filters */}
                    <div className="vl-type-toggle-row" role="group" aria-label="Browse and sort videos" style={{
                        display: 'flex',
                        gap: 8,
                        marginBottom: 16,
                        justifyContent: 'flex-start',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        rowGap: 8,
                    }}>
                        <span className="vl-filter-group-label">Browse</span>
                        {[
                            { id: 'ALL',        name: 'All Videos' },
                            { id: 'cash',       name: 'Cash Games' },
                            { id: 'tournament', name: 'Tournaments' },
                        ].map(type => {
                            const isActive = selectedType === type.id;
                            return (
                                <button
                                    type="button"
                                    key={type.id}
                                    className={`vl-filter-button${isActive ? ' is-active' : ''}`}
                                    data-filter-group="type"
                                    aria-pressed={isActive}
                                    aria-controls="video-library-grid"
                                    onClick={(event) => {
                                        setSelectedType(type.id);
                                        keepRailButtonInView(event.currentTarget);
                                    }}
                                    style={{
                                        padding: '9px 22px',
                                        background: isActive
                                            ? 'linear-gradient(135deg, #00B4D8 0%, #00D4FF 100%)'
                                            : 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                                        border: isActive
                                            ? '1.5px solid rgba(0,212,255,0.7)'
                                            : '1.5px solid rgba(255,255,255,0.12)',
                                        borderRadius: 10,
                                        color: isActive ? '#fff' : 'rgba(255,255,255,0.75)',
                                        fontSize: 13,
                                        fontWeight: isActive ? 700 : 500,
                                        cursor: 'pointer',
                                        letterSpacing: '0.3px',
                                        transition: 'all 0.2s ease',
                                        transform: isActive ? 'translateY(-1px)' : 'none',
                                        boxShadow: isActive
                                            ? '0 0 16px rgba(0,212,255,0.35), 0 4px 12px rgba(0,0,0,0.4)'
                                            : '0 2px 8px rgba(0,0,0,0.3)',
                                        whiteSpace: 'nowrap',
                                    }}
                                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(0,212,255,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)'; e.currentTarget.style.transform = 'none'; } }}
                                >
                                    {type.name}
                                </button>
                            );
                        })}

                        {/* Sort Mode Buttons */}
                        <span className="vl-filter-group-label">Order</span>
                        {[
                            { id: 'default',   label: 'Latest' },
                            { id: 'trending',  label: '🔥 Trending' },
                            { id: 'top_rated', label: '⭐ Top Rated' },
                        ].map(s => {
                            const isActive = sortMode === s.id;
                            return (
                                <button
                                    type="button"
                                    key={s.id}
                                    className={`vl-filter-button vl-sort-button${isActive ? ' is-active' : ''}`}
                                    data-filter-group="sort"
                                    aria-label={`Sort videos by ${s.label.replace(/[🔥⭐]/gu, '').trim()}`}
                                    aria-pressed={isActive}
                                    aria-controls="video-library-grid"
                                    onClick={(event) => {
                                        setSortMode(s.id);
                                        keepRailButtonInView(event.currentTarget);
                                    }}
                                    style={{
                                        padding: '9px 18px',
                                        background: isActive
                                            ? 'linear-gradient(135deg, rgba(0,212,255,0.25) 0%, rgba(0,180,216,0.25) 100%)'
                                            : 'rgba(255,255,255,0.04)',
                                        border: isActive
                                            ? '1.5px solid rgba(0,212,255,0.7)'
                                            : '1.5px solid rgba(255,255,255,0.1)',
                                        borderRadius: 10,
                                        color: isActive ? '#00D4FF' : 'rgba(255,255,255,0.6)',
                                        fontSize: 13,
                                        fontWeight: isActive ? 700 : 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        whiteSpace: 'nowrap',
                                        boxShadow: isActive ? '0 0 12px rgba(0,212,255,0.2)' : 'none',
                                    }}
                                >
                                    {s.label}
                                </button>
                            );
                        })}

                        {/* Reels Button — opens TikTok doom-scroll */}
                        <span className="vl-filter-group-label">Format</span>
                        <button
                            ref={reelsTriggerRef}
                            type="button"
                            id="vl-reels-tab-btn"
                            className="vl-filter-button vl-reels-button"
                            aria-label="Open the video Reels viewer"
                            onClick={() => setShowReelsModal(true)}
                            style={{
                                padding: '9px 22px',
                                background: 'linear-gradient(135deg, rgba(0,212,255,0.18) 0%, rgba(0,180,216,0.18) 100%)',
                                border: '1.5px solid rgba(0,212,255,0.45)',
                                borderRadius: 10,
                                color: '#00D4FF',
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: 'pointer',
                                letterSpacing: '0.3px',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                whiteSpace: 'nowrap',
                                boxShadow: '0 0 12px rgba(0,212,255,0.2), 0 2px 8px rgba(0,0,0,0.3)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0,212,255,0.32) 0%, rgba(0,180,216,0.28) 100%)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(0,212,255,0.4), 0 4px 12px rgba(0,0,0,0.4)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0,212,255,0.18) 0%, rgba(0,180,216,0.18) 100%)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 0 12px rgba(0,212,255,0.2), 0 2px 8px rgba(0,0,0,0.3)'; }}
                        >
                            <span style={{ fontSize: 15 }}>▶</span> Reels
                        </button>

                    </div>

                    <div className="vl-rail-count" aria-live="polite">
                        <strong>{videos.length}</strong>
                        <span>videos showing</span>
                    </div>
                </aside>

                <main className="vl-command-main">
                    <div className="vl-command-bar">
                        <div className="vl-command-heading">
                            <span>Smarter.Poker Hub</span>
                            <h2>Poker Video Library</h2>
                        </div>

                        {/* Search Input */}
                        <div className="vl-search-wrap" style={{
                            position: 'relative',
                            width: 220,
                            marginLeft: 12,
                            flexShrink: 0,
                            flexBasis: 220,
                        }}>
                            <input
                                ref={searchInputRef}
                                type="text"
                                aria-label="Search the poker video library"
                                aria-keyshortcuts="/"
                                aria-controls="video-library-grid"
                                placeholder="Search Videos..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape' && searchQuery) {
                                        event.stopPropagation();
                                        setSearchQuery('');
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px 10px 38px',
                                    background: '#0a0a0a',
                                    border: 'none',
                                    borderRadius: 10,
                                    color: C.text,
                                    fontSize: 14,
                                    outline: 'none',
                                    boxShadow: '0 0 0 2px rgba(160, 170, 180, 0.7), 0 0 0 3px rgba(80, 90, 100, 0.5)',
                                }}
                            />
                            <span aria-hidden="true" className="vl-search-icon" style={{
                                position: 'absolute',
                                left: 12,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                opacity: 0.5,
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="m21 21-4.35-4.35" />
                                </svg>
                            </span>
                            {searchQuery ? (
                                <button
                                    type="button"
                                    className="vl-search-clear"
                                    aria-label="Clear video search"
                                    onClick={() => {
                                        setSearchQuery('');
                                        searchInputRef.current?.focus();
                                    }}
                                >×</button>
                            ) : (
                                <kbd className="vl-search-shortcut" aria-hidden="true">/</kbd>
                            )}
                        </div>
                    </div>

                    {/* Search results count — shown when query is active */}
                    {searchQuery && (
                        <div className="vl-search-results" style={{
                            fontSize: 13,
                            color: 'rgba(255,255,255,0.45)',
                            marginBottom: 8,
                            paddingLeft: 2,
                        }}>
                            {videos.length} result{videos.length !== 1 ? 's' : ''} for <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>&ldquo;{searchQuery}&rdquo;</span>
                            {videos.length === 0 && (
                                <button
                                    type="button"
                                    onClick={clearAllFilters}
                                    style={{ marginLeft: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(255,255,255,0.7)', fontSize: 12, padding: '3px 10px', cursor: 'pointer' }}
                                >
                                    Clear Filters
                                </button>
                            )}
                        </div>
                    )}


                    {/* Premium Creator Cards */}
                    <div className="vl-source-pills" style={{
                        display: 'flex',
                        gap: 12,
                        overflowX: 'auto',
                        padding: '8px 4px 12px',
                        scrollbarWidth: 'none',
                    }}>
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
                                        setSelectedSource(source.id);
                                        keepRailButtonInView(event.currentTarget);
                                    }}
                                    style={{
                                        flexShrink: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 7,
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '4px 2px',
                                        outline: 'none',
                                        transition: 'transform 0.2s ease',
                                        transform: isActive ? 'translateY(-5px)' : 'none',
                                    }}
                                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.transform = 'translateY(-3px)'; }}
                                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.transform = 'none'; }}
                                    title={source.name}
                                >
                                    {/* Logo ring — glows cyan when active */}
                                    <div className="vl-source-logo-frame" style={{
                                        width: 70,
                                        height: 70,
                                        borderRadius: 18,
                                        padding: 2.5,
                                        background: isActive
                                            ? 'linear-gradient(135deg, #00B4D8 0%, #00D4FF 50%, #00B4D8 100%)'
                                            : 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(100,115,135,0.3) 100%)',
                                        boxShadow: isActive
                                            ? '0 0 24px rgba(0,212,255,0.6), 0 0 10px rgba(0,212,255,0.3), 0 8px 24px rgba(0,0,0,0.7)'
                                            : '0 4px 18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
                                        transition: 'all 0.25s ease',
                                    }}>
                                        <div className="vl-source-logo-inner" style={{
                                            width: '100%',
                                            height: '100%',
                                            borderRadius: 15,
                                            background: isActive
                                                ? 'linear-gradient(160deg, #081c1c 0%, #0a2e2e 100%)'
                                                : 'linear-gradient(160deg, #0c1018 0%, #141c28 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            overflow: 'hidden',
                                            border: isActive
                                                ? '1px solid rgba(255,80,80,0.35)'
                                                : '1px solid rgba(255,255,255,0.07)',
                                        }}>
                                            {source.logo ? (
                                                <img
                                                    src={source.logo}
                                                    alt=""
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover',
                                                        borderRadius: 15,
                                                        filter: isActive
                                                            ? 'brightness(1.1) drop-shadow(0 0 8px rgba(0,212,255,0.7))'
                                                            : 'brightness(1) saturate(1)',
                                                        transition: 'filter 0.25s',
                                                    }}
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            ) : (
                                                <span className={source.id === 'ALL' ? 'vl-source-all-mark' : undefined} style={{
                                                    fontSize: 17,
                                                    fontWeight: 800,
                                                    color: isActive ? '#00D4FF' : 'rgba(190,205,225,0.7)',
                                                    letterSpacing: '-0.5px',
                                                    fontFamily: "'Inter', system-ui, sans-serif",
                                                    textShadow: isActive ? '0 0 14px rgba(0,212,255,0.9)' : 'none',
                                                    transition: 'all 0.25s',
                                                }}>{initials}</span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Name plate */}
                                    <div className="vl-source-name" style={{
                                        width: 72,
                                        textAlign: 'center',
                                        fontSize: 12,
                                        fontWeight: isActive ? 700 : 500,
                                        color: isActive ? '#00D4FF' : 'rgba(185,200,220,0.6)',
                                        letterSpacing: '0.15px',
                                        lineHeight: 1.3,
                                        textShadow: isActive ? '0 0 10px rgba(0,212,255,0.6)' : 'none',
                                        transition: 'all 0.25s',
                                        wordBreak: 'break-word',
                                    }}>
                                        {source.name}
                                    </div>
                                    {/* Active dot */}
                                    {isActive && (
                                        <div className="vl-source-active-dot" style={{
                                            width: 5,
                                            height: 5,
                                            borderRadius: '50%',
                                            background: '#00D4FF',
                                            boxShadow: '0 0 8px rgba(0,212,255,0.9)',
                                            marginTop: -4,
                                        }} />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {hasActiveFilters && (
                        <div className="vl-active-view" aria-label="Active video filters">
                            <div className="vl-active-view-copy">
                                <span>Active view</span>
                                <div className="vl-active-filter-list">
                                    {activeFilterLabels.map(label => <strong key={label}>{label}</strong>)}
                                </div>
                            </div>
                            <button type="button" onClick={clearAllFilters}>Reset view</button>
                        </div>
                    )}

                {/* Watch Stats moved to hamburger menu - removed from main page */}

                {/* Continue Watching / Recently Watched Section */}
                {continueWatchingVideos.length > 0 && (
                    <div className="vl-continue-watching" style={{
                        maxWidth: 1400,
                        margin: '0 auto 30px',
                    }}>
                        <div className="vl-continuity-header">
                            <div>
                                <span className="vl-continuity-kicker">Session continuity</span>
                                <h2><span aria-hidden="true">▶</span> Continue Watching</h2>
                            </div>
                            <div className="vl-continuity-actions">
                                <span>{continueWatchingVideos.length} {continueWatchingVideos.length === 1 ? 'session' : 'sessions'} ready</span>
                                <button
                                    type="button"
                                    onClick={() => handleOpenVideo(continueWatchingVideos[0].video)}
                                    aria-label={`Resume latest video: ${continueWatchingVideos[0].video.title}`}
                                >
                                    Resume Latest <span aria-hidden="true">→</span>
                                </button>
                            </div>
                        </div>
                        <div className="vl-cw-scroll" style={{
                            display: 'flex',
                            gap: 16,
                            overflowX: 'auto',
                            paddingBottom: 8,
                            scrollbarWidth: 'thin',
                        }}>
                            {continueWatchingVideos.map(({ item, video, progress }) => {
                                const roundedProgress = Math.round(progress);
                                return (
                                    <div
                                        key={item.video_id}
                                        onClick={() => handleOpenVideo(video)}
                                        onKeyDown={(event) => handleVideoCardKeyDown(event, video)}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Resume ${video.title}, ${roundedProgress}% complete`}
                                        className="metal-frame video-card-metal vl-continuity-card"
                                        style={{
                                            minWidth: 240,
                                            cursor: 'pointer',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <div style={{ position: 'relative', aspectRatio: '16/9' }}>
                                            <img
                                                src={getThumbnail(video.videoId)}
                                                alt=""
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                loading="lazy"
                                                decoding="async"
                                                onLoad={event => recoverYouTubeThumbnail(event, video.videoId)}
                                                onError={event => recoverYouTubeThumbnail(event, video.videoId)}
                                            />
                                            {/* Resume play button */}
                                            <div className="vl-continuity-play" style={{
                                                position: 'absolute',
                                                top: '50%',
                                                left: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                width: 48,
                                                height: 48,
                                                background: 'rgba(0,212,255,0.95)',
                                                borderRadius: '50%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}>
                                                <span style={{ fontSize: 20, marginLeft: 2 }}>▶</span>
                                            </div>
                                            {/* Progress bar */}
                                            <div
                                                className="vl-continuity-progress"
                                                role="progressbar"
                                                aria-label={`${video.title} watch progress`}
                                                aria-valuemin="0"
                                                aria-valuemax="100"
                                                aria-valuenow={roundedProgress}
                                                style={{
                                                position: 'absolute',
                                                bottom: 0,
                                                left: 0,
                                                right: 0,
                                                height: 4,
                                                background: 'rgba(255,255,255,0.3)',
                                            }}>
                                                <div style={{
                                                    width: `${progress}%`,
                                                    height: '100%',
                                                    background: '#00D4FF',
                                                }} />
                                            </div>
                                        </div>
                                        <div style={{ padding: 12 }}>
                                            <div style={{
                                                color: C.text,
                                                fontSize: 13,
                                                fontWeight: 500,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {video.title}
                                            </div>
                                            <div style={{
                                                color: C.textSec,
                                                fontSize: 11,
                                                marginTop: 4,
                                            }}>
                                                {roundedProgress}% complete · {formatTime(item.watch_duration_seconds || 0)} watched
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* New This Week rail — videos scraped in last 7 days */}
                {newThisWeek.length > 0 && !newThisWeekDismissed && (
                    <div className="vl-new-this-week" style={{ maxWidth: 1400, margin: '0 auto 28px' }}>
                        <div className="vl-new-week-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: '#00D4FF', fontSize: 14, background: 'rgba(0,212,255,0.2)', border: '1px solid rgba(0,212,255,0.4)', borderRadius: 6, padding: '2px 8px', fontWeight: 700, letterSpacing: '0.5px' }}>NEW</span>
                                New This Week
                            </h2>
                            <button onClick={() => setNewThisWeekDismissed(true)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 12, cursor: 'pointer', padding: 4 }}>Dismiss</button>
                        </div>
                        <div className="vl-new-week-scroll" style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
                            {newThisWeek.map(video => (
                                <div
                                    key={video.videoId}
                                    className="vl-new-week-card"
                                    onClick={() => handleOpenVideo(video)}
                                    onKeyDown={(event) => handleVideoCardKeyDown(event, video)}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Play ${video.title}`}
                                    style={{ minWidth: 220, flexShrink: 0, cursor: 'pointer', borderRadius: 10, overflow: 'hidden', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', transition: 'transform 0.18s, box-shadow 0.18s' }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                                >
                                    <div style={{ position: 'relative', aspectRatio: '16/9', background: '#111' }}>
                                        <img src={getThumbnail(video.videoId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" onLoad={event => recoverYouTubeThumbnail(event, video.videoId)} onError={event => recoverYouTubeThumbnail(event, video.videoId)} />
                                        <div style={{ position: 'absolute', top: 6, left: 6, background: '#00D4FF', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.5px' }}>NEW</div>
                                        {video.duration && (
                                            <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>{video.duration}</div>
                                        )}
                                    </div>
                                    <div style={{ padding: 10 }}>
                                        <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{video.title}</div>
                                        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>{video.source.replace('_', ' ')}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Video Grid */}
                {catalogRefreshFailed && (
                    <div className="vl-catalog-notice" role="status">
                        Live catalog refresh is temporarily unavailable. Showing the verified fallback library.
                    </div>
                )}
                <span className="vl-sr-only" role="status" aria-live="polite">
                    {`${videos.length} videos available`}
                </span>
                <div
                    id="video-library-grid"
                    className="vl-video-grid"
                    aria-label="Poker videos"
                    style={{
                    maxWidth: 1400,
                    margin: '0 auto',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: 20,
                }}>
                    {videos.slice(0, Math.min(displayedCount, videos.length)).map((video, index) => {
                        const progress = getProgressPercent(video.id, video.duration);
                        const roundedProgress = Math.round(progress);
                        const openLabel = progress > 0 && progress < 95 ? 'Resume' : 'Play';
                        return (
                        <div
                            key={video.id}
                            className="metal-frame video-card-metal vl-video-card"
                            style={{
                                cursor: 'pointer',
                            }}
                        >
                            <button
                                type="button"
                                className="vl-card-open-button"
                                aria-label={`${openLabel} ${video.title}${progress > 0 ? `, ${roundedProgress}% complete` : ''}`}
                                onClick={() => handleOpenVideo(video)}
                            />
                            {/* Thumbnail */}
                            <div className="vl-video-thumb" style={{
                                position: 'relative',
                                aspectRatio: '16/9',
                                background: '#222',
                            }}>
                                <img
                                    src={getThumbnail(video.videoId)}
                                        alt=""
                                    loading={index === 0 ? 'eager' : 'lazy'}
                                    fetchPriority={index === 0 ? 'high' : 'auto'}
                                    decoding="async"
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                    }}
                                    onLoad={(e) => {
                                        // YouTube returns 120x90 placeholder when maxres not available
                                        if (e.target.naturalWidth <= 120 && !e.target.src.includes('hqdefault')) {
                                            e.target.src = `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`;
                                        }
                                    }}
                                    onError={(e) => {
                                        // Fallback chain: try hqdefault, then mqdefault
                                        if (e.target.src.includes('maxresdefault')) {
                                            e.target.src = `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`;
                                        } else if (e.target.src.includes('hqdefault')) {
                                            e.target.src = `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`;
                                        }
                                    }}
                                />
                                {/* Duration badge */}
                                <div className="vl-duration" style={{
                                    position: 'absolute',
                                    bottom: 8,
                                    right: 8,
                                    background: 'rgba(0,0,0,0.8)',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: 'white',
                                }}>
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
                                        style={{
                                            position: 'absolute',
                                            top: 8,
                                            left: 8,
                                            background: 'rgba(0,200,83,0.9)',
                                            padding: '4px 10px',
                                            borderRadius: 12,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            cursor: 'pointer',
                                            border: 'none',
                                        }}
                                    >
                                        <span>✓</span> Watched
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
                                        style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        height: 4,
                                        background: 'rgba(255,255,255,0.3)',
                                    }}>
                                        <div className="vl-progress-fill" style={{
                                            width: `${progress}%`,
                                            height: '100%',
                                            background: '#00D4FF',
                                            transition: 'width 0.3s ease',
                                        }} />
                                    </div>
                                )}
                                {/* Play button overlay */}
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: 64,
                                    height: 64,
                                    background: 'rgba(0,212,255,0.9)',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: 0,
                                    transition: 'opacity 0.2s',
                                }}
                                    className="play-btn vl-play-button"
                                >
                                    <span style={{ fontSize: 28, marginLeft: 4 }}>▶</span>
                                </div>
                            </div>

                            {/* Info */}
                            <div className="vl-card-info" style={{ padding: 16 }}>
                                <h3 className="vl-card-title" style={{
                                    color: C.text,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    margin: 0,
                                    marginBottom: 8,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    lineHeight: 1.4,
                                }}>
                                    {video.title}
                                </h3>

                                {progress > 0 && (
                                    <div className="vl-watch-signal" aria-hidden="true">
                                        <span>{progress >= 95 ? 'Watched' : 'Resume'}</span>
                                        <strong>{roundedProgress}%</strong>
                                    </div>
                                )}

                                <div className="vl-card-meta" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}>
                                    <span className="vl-source-chip" style={{
                                        color: C.accent,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        background: 'rgba(0,212,255,0.15)',
                                        padding: '6px 12px',
                                        borderRadius: 12,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                    }}>
                                        {SOURCES.find(s => s.id === video.source)?.logo && (
                                            <div className="vl-source-chip-logo" style={{
                                                width: 26,
                                                height: 26,
                                                borderRadius: 8,
                                                background: 'rgba(255, 255, 255, 0.1)',
                                                backdropFilter: 'blur(8px)',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: 4,
                                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                                            }}>
                                                <img
                                                    src={SOURCES.find(s => s.id === video.source)?.logo}
                                                    alt=""
                                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                />
                                            </div>
                                        )}
                                        {video.source.replace('_', ' ')}
                                    </span>
                                    <span className="vl-card-views" style={{ color: C.textSec, fontSize: 13 }}>
                                        {video.views} views
                                    </span>
                                    {/* Share button */}
                                    <button
                                        type="button"
                                        id={`vl-share-${video.videoId}`}
                                        className="vl-share-button"
                                        title="Copy link"
                                        onClick={e => { e.stopPropagation(); handleShareVideo(video); }}
                                        style={{
                                            background: shareToast?.kind === 'share' && shareToast?.tone === 'success' && shareToast?.videoId === video.videoId ? 'rgba(52,199,89,0.2)' : 'rgba(255,255,255,0.06)',
                                            border: shareToast?.kind === 'share' && shareToast?.tone === 'success' && shareToast?.videoId === video.videoId ? '1px solid rgba(52,199,89,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 8,
                                            color: shareToast?.kind === 'share' && shareToast?.tone === 'success' && shareToast?.videoId === video.videoId ? '#34C759' : 'rgba(255,255,255,0.5)',
                                            padding: '5px 10px',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4,
                                        }}
                                    >
                                        {shareToast?.kind === 'share' && shareToast?.tone === 'success' && shareToast?.videoId === video.videoId ? '✓ Copied' : '⎘ Share'}
                                    </button>
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>

                {/* Infinite Scroll Sentinel */}
                {displayedCount < videos.length && (
                    <div ref={loadMoreRef} style={{ height: 20, width: '100%' }} />
                )}

                {/* No results */}
                {videos.length === 0 && (
                    <div className="vl-empty-state">
                        <div className="vl-empty-signal" aria-hidden="true"><span /></div>
                        <span className="vl-empty-kicker">{emptyState.eyebrow}</span>
                        <h3>{emptyState.title}</h3>
                        <p>{emptyState.copy}</p>
                        <button
                            type="button"
                            onClick={handleEmptyStateAction}
                        >
                            {emptyState.action} <span aria-hidden="true">→</span>
                        </button>
                    </div>
                )}

                {/* Video count */}
                <div className="vl-video-count" style={{
                    maxWidth: 1400,
                    margin: '30px auto 0',
                    textAlign: 'center',
                    color: C.textSec,
                    fontSize: 14,
                }}>
                    Showing {Math.min(displayedCount, videos.length)} of {videos.length} matching · {allVideos.length} total
                </div>
                </main>
                </div>
            </div>

            {/* Video Modal */}
            {selectedVideo && (
                <div
                    ref={modalOverlayRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="vl-viewer-title"
                    aria-describedby="vl-viewer-help"
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: '#000',
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                    /* Touch-swipe for TikTok-style navigation — handled by dedicated overlay below */
                    onTouchStart={e => {
                        swipeTouchStart.current = e.touches[0].clientX;
                        swipeTouchStartY.current = e.touches[0].clientY;
                    }}
                    onTouchEnd={e => {
                        if (swipeTouchStart.current === null) return;
                        const dx = e.changedTouches[0].clientX - swipeTouchStart.current;
                        const dy = e.changedTouches[0].clientY - swipeTouchStartY.current;
                        swipeTouchStart.current = null;
                        swipeTouchStartY.current = null;
                        // Vertical swipe (TikTok-style): up = next, down = prev
                        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 50) {
                            if (dy < 0) handleNextVideo(); else handlePrevVideo();
                        }
                        // Horizontal swipe: left = next, right = prev
                        else if (Math.abs(dx) > 50) {
                            if (dx < 0) handleNextVideo(); else handlePrevVideo();
                        }
                    }}
                >
                    <p id="vl-viewer-help" className="vl-sr-only">
                        Use the arrow keys for the previous or next video, F for fullscreen, and Escape to close.
                    </p>
                    {/* Close button — positioned top-right, clear of YouTube's title bar */}
                    <button
                        ref={modalCloseButtonRef}
                        type="button"
                        onClick={handleCloseVideo}
                        className="vl-modal-close"
                        aria-label="Close video"
                        style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            width: 40,
                            height: 40,
                            background: 'rgba(0,0,0,0.65)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '50%',
                            color: 'white',
                            fontSize: 20,
                            cursor: 'pointer',
                            zIndex: 1001,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.85)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.65)'; }}
                    >×</button>

                    {/* Fullscreen & sound are handled by YouTube's native controls at bottom of iframe */}

                    {/* Prev / Next navigation arrows — desktop only (JS detection, no CSS tricks) */}
                    {!isTouchDevice && (
                      <>
                        <button
                            type="button"
                            onClick={handlePrevVideo}
                            aria-label="Play previous video"
                            title="Previous video (←)"
                            style={{
                                position: 'absolute',
                                left: 16,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: 52,
                                height: 52,
                                background: 'rgba(255,255,255,0.15)',
                                border: 'none',
                                borderRadius: '50%',
                                color: 'white',
                                fontSize: 26,
                                cursor: 'pointer',
                                zIndex: 1001,
                                backdropFilter: 'blur(10px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background 0.2s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                        >‹</button>
                        <button
                            type="button"
                            onClick={handleNextVideo}
                            aria-label="Play next video"
                            title="Next video (→)"
                            style={{
                                position: 'absolute',
                                right: 16,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: 52,
                                height: 52,
                                background: 'rgba(255,255,255,0.15)',
                                border: 'none',
                                borderRadius: '50%',
                                color: 'white',
                                fontSize: 26,
                                cursor: 'pointer',
                                zIndex: 1001,
                                backdropFilter: 'blur(10px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background 0.2s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                        >›</button>
                      </>
                    )}

                    {/* YouTube embed — takes FULL viewport on mobile */}
                    <div
                        onMouseMove={!isTouchDevice ? vlRevealHud : undefined}
                        onFocusCapture={!isTouchDevice ? vlRevealHud : undefined}
                        style={{
                        flex: 1,
                        width: '100%',
                        minHeight: 0,
                        position: 'relative',
                        overflow: 'hidden',
                    }}>
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
                                style={{
                                    position: 'absolute',
                                    top: 0, bottom: 64, left: 0,
                                    width: '15%',
                                    height: 'auto',
                                    zIndex: 5,
                                    background: 'transparent',
                                    WebkitTapHighlightColor: 'transparent',
                                }}
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
                                style={{
                                    position: 'absolute',
                                    top: 0, bottom: 64, right: 0,
                                    width: '15%',
                                    height: 'auto',
                                    zIndex: 5,
                                    background: 'transparent',
                                    WebkitTapHighlightColor: 'transparent',
                                }}
                            />
                          </>
                        )}

                        {/* Right-side HUD — Heart / Share / Save */}
                        <div
                            className={`vl-hud ${vlHudVisible ? 'vl-hud--visible' : ''}`}
                            aria-hidden={!isTouchDevice && !vlHudVisible}
                            style={{
                                position: 'absolute',
                                right: 12,
                                bottom: 80,
                                zIndex: 1002,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 20,
                                alignItems: 'center',
                                // On touch devices: always visible. On desktop: toggle on hover/click.
                                opacity: isTouchDevice ? 1 : (vlHudVisible ? 1 : 0),
                                transform: isTouchDevice ? 'translateX(0)' : (vlHudVisible ? 'translateX(0)' : 'translateX(60px)'),
                                transition: 'opacity 0.3s ease, transform 0.3s ease',
                                pointerEvents: isTouchDevice ? 'auto' : (vlHudVisible ? 'auto' : 'none'),
                            }}
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
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                    padding: 0,
                                }}
                            >
                                <div style={{
                                    width: 52, height: 52, borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.6)',
                                    backdropFilter: 'blur(10px)',
                                    border: favorites.has(selectedVideo?.id || selectedVideo?.videoId)
                                        ? '1.5px solid #00D4FF' : '1.5px solid rgba(255,255,255,0.25)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.2s',
                                }}>
                                    <svg width="26" height="26" viewBox="0 0 24 24" fill={favorites.has(selectedVideo?.id || selectedVideo?.videoId) ? '#00D4FF' : 'none'} stroke={favorites.has(selectedVideo?.id || selectedVideo?.videoId) ? '#00D4FF' : 'white'} strokeWidth="2">
                                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                                    </svg>
                                </div>
                                <span style={{ color: 'white', fontSize: 11, fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
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
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                    padding: 0,
                                }}
                            >
                                <div style={{
                                    width: 52, height: 52, borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.6)',
                                    backdropFilter: 'blur(10px)',
                                    border: '1.5px solid rgba(255,255,255,0.25)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                                        <polyline points="16 6 12 2 8 6"/>
                                        <line x1="12" y1="2" x2="12" y2="15"/>
                                    </svg>
                                </div>
                                <span style={{ color: 'white', fontSize: 11, fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>Share</span>
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
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                    padding: 0,
                                }}
                            >
                                <div style={{
                                    width: 52, height: 52, borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.6)',
                                    backdropFilter: 'blur(10px)',
                                    border: watchLater.has(selectedVideo?.id || selectedVideo?.videoId)
                                        ? '1.5px solid #FFD700' : '1.5px solid rgba(255,255,255,0.25)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.2s',
                                }}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill={watchLater.has(selectedVideo?.id || selectedVideo?.videoId) ? '#FFD700' : 'none'} stroke={watchLater.has(selectedVideo?.id || selectedVideo?.videoId) ? '#FFD700' : 'white'} strokeWidth="2">
                                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                                    </svg>
                                </div>
                                <span style={{ color: 'white', fontSize: 11, fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
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
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                    padding: 0,
                                }}
                            >
                                <div style={{
                                    width: 52, height: 52, borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.6)',
                                    backdropFilter: 'blur(10px)',
                                    border: '1.5px solid rgba(255,255,255,0.25)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <path d="M4 6h16M4 12h10M4 18h8" />
                                        <path d="M18 15v6M15 18h6" />
                                    </svg>
                                </div>
                                <span style={{ color: 'white', fontSize: 11, fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>Playlist</span>
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
                                            } catch { /* best-effort */ }
                                        }, d));
                                    }
                                } catch { /* best-effort */ }
                            }}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                display: 'block',
                            }}
                        />
                        {/* YouTube Error Overlay */}
                        {vlYtManaged && (
                            <YouTubeErrorOverlay
                                errorCode={vlYtManaged}
                                videoId={selectedVideo.videoId}
                                thumbnailUrl={vlThumbnailUrl}
                                actionLabel="Closing in 3 seconds..."
                            />
                        )}
                    </div>


                    {/* Video info bar + Related Videos Rail — ABSOLUTE on mobile, flex child on desktop */}
                    <div className="vl-info-bar" style={{
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.95) 30%)',
                        flexShrink: 0,
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        scrollbarWidth: 'thin',
                    }}>
                        {/* Info Row */}
                        <div style={{ padding: '10px 20px 8px' }}>
                            <h2 id="vl-viewer-title" style={{
                                color: 'white',
                                fontSize: 15,
                                fontWeight: 700,
                                margin: 0,
                                marginBottom: 6,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}>
                                {selectedVideo.title}
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{
                                    color: C.accent, fontSize: 12, fontWeight: 600,
                                    background: 'rgba(0,212,255,0.2)', padding: '4px 10px',
                                    borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    {SOURCES.find(s => s.id === selectedVideo.source)?.logo && (
                                        <img src={SOURCES.find(s => s.id === selectedVideo.source)?.logo}
                                            alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'contain' }} decoding="async" />
                                    )}
                                    {selectedVideo.source.replace('_', ' ')}
                                </span>
                                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                                    {selectedVideo.views} views
                                </span>
                                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                                    {selectedVideo.duration}
                                </span>
                                {/* ── Train This Spot — in-place overlay ── */}
                                <button
                                    ref={ttsTriggerRef}
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
                                        fetch('/api/training/log-request', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ ref: 'video-library', vid: ctx.vid, title: ctx.title, source: ctx.source, tags, matchedGameIds: gameIds.slice(0, 3) }),
                                        }).catch(() => {});
                                    }}
                                    style={{
                                        padding: '5px 14px',
                                        background: 'linear-gradient(135deg, rgba(0,200,83,0.2) 0%, rgba(0,150,60,0.2) 100%)',
                                        border: '1.5px solid rgba(0,200,83,0.55)',
                                        borderRadius: 10,
                                        color: '#34C759',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        transition: 'all 0.2s',
                                        whiteSpace: 'nowrap',
                                        boxShadow: '0 0 8px rgba(0,200,83,0.15)',
                                        letterSpacing: '0.2px',
                                        animation: 'tts-pulse 2.5s ease-in-out infinite',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0,200,83,0.35) 0%, rgba(0,150,60,0.35) 100%)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(0,200,83,0.45)'; e.currentTarget.style.animation = 'none'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0,200,83,0.2) 0%, rgba(0,150,60,0.2) 100%)'; e.currentTarget.style.boxShadow = '0 0 8px rgba(0,200,83,0.15)'; e.currentTarget.style.animation = 'tts-pulse 2.5s ease-in-out infinite'; }}
                                    title="Open GTO Trainer with AI-matched drills from this video"
                                >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                                    </svg>
                                    Train This Spot
                                </button>
                            </div>
                        </div>

                        {/* ── P3: Related Videos Rail ── */}
                        {relatedVideos.length > 0 && (
                            <div className="vl-up-next-rail" style={{ padding: '4px 20px 14px' }}>
                                <div style={{
                                    fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)',
                                    letterSpacing: '0.8px', marginBottom: 10, textTransform: 'uppercase',
                                }}>
                                    Up Next
                                </div>
                                <div style={{
                                    display: 'flex',
                                    gap: 12,
                                    overflowX: 'auto',
                                    scrollbarWidth: 'thin',
                                    paddingBottom: 4,
                                }}>
                                    {relatedVideos.map(v => (
                                        <div
                                            key={v.id}
                                            onClick={() => handleOpenVideo(v)}
                                            onKeyDown={(event) => handleVideoCardKeyDown(event, v)}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`Play ${v.title}`}
                                            className="vl-up-next-card"
                                            style={{
                                                minWidth: 160,
                                                flexShrink: 0,
                                                cursor: 'pointer',
                                                borderRadius: 8,
                                                overflow: 'hidden',
                                                background: '#1a1a1a',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                transition: 'transform 0.15s, border-color 0.15s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                                        >
                                            <div style={{ position: 'relative', aspectRatio: '16/9', background: '#111' }}>
                                                <img
                                                    src={getThumbnail(v.videoId)}
                                                    alt=""
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    loading="lazy"
                                                    decoding="async"
                                                    onLoad={event => recoverYouTubeThumbnail(event, v.videoId)}
                                                    onError={event => recoverYouTubeThumbnail(event, v.videoId)}
                                                />
                                                {v.duration && (
                                                    <div style={{
                                                        position: 'absolute', bottom: 4, right: 4,
                                                        background: 'rgba(0,0,0,0.85)', color: '#fff',
                                                        fontSize: 9, fontWeight: 600, padding: '2px 5px', borderRadius: 3,
                                                    }}>{v.duration}</div>
                                                )}
                                            </div>
                                            <div style={{ padding: '7px 8px' }}>
                                                <div style={{
                                                    color: '#fff', fontSize: 11, fontWeight: 600,
                                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                                    display: '-webkit-box', WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical', lineHeight: 1.3,
                                                }}>{v.title}</div>
                                                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, marginTop: 3 }}>
                                                    {v.source.replace('_', ' ')}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* CSS */}
            <style>{`
                .vl-video-card:hover .play-btn {
                    opacity: 1 !important;
                }

                /* Train This Spot button pulse */
                @keyframes tts-pulse {
                    0%, 100% { box-shadow: 0 0 8px rgba(0,200,83,0.15); border-color: rgba(0,200,83,0.55); }
                    50%       { box-shadow: 0 0 20px rgba(0,200,83,0.4); border-color: rgba(0,200,83,0.85); }
                }

                /* Mobile: stack search on its own row */
                @media (max-width: 480px) {
                    .vl-search-wrap {
                        width: 100% !important;
                        flex-basis: 100% !important;
                        margin-left: 0 !important;
                    }
                }

                /* Mobile + Tablet: absolute info bar, hide Up Next */
                @media (max-width: 1024px) and (hover: none) and (pointer: coarse) {
                    .vl-info-bar {
                        position: relative !important;
                        max-height: 140px !important;
                        flex: 0 0 auto;
                        pointer-events: auto;
                        z-index: 6;
                    }
                    .vl-up-next-rail {
                        display: none !important;
                    }
                }
                /* Narrow screen fallback */
                @media (max-width: 767px) {
                    .vl-info-bar {
                        position: relative !important;
                        max-height: 140px !important;
                        flex: 0 0 auto;
                        pointer-events: auto;
                        z-index: 6;
                    }
                    .vl-up-next-rail {
                        display: none !important;
                    }
                }
                /* Desktop: info bar caps */
                @media (min-width: 768px) and (hover: hover) and (pointer: fine) {
                    .vl-info-bar {
                        max-height: min(25vh, 200px);
                    }
                }
                @media (min-width: 1025px) {
                    .vl-info-bar {
                        max-height: min(25vh, 200px);
                    }
                }

                /* Caption-style animation */
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
            `}</style>
              <BottomNavBar theme="dark" />

            {/* Reels Modal — full-screen TikTok doom-scroll */}
            {showReelsModal && (
                <div ref={reelsDialogRef} role="dialog" aria-modal="true" aria-label="Video reels" tabIndex={-1} style={{
                    position: 'fixed', inset: 0,
                    zIndex: 9999,
                    background: '#000',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    <ReelsViewer onClose={() => setShowReelsModal(false)} />
                </div>
            )}

            {/* Share Toast \u2014 floating clipboard feedback */}
            {shareToast && (
                <div
                    className={`vl-action-notice vl-action-notice--${shareToast.tone}`}
                    role={shareToast.tone === 'error' ? 'alert' : 'status'}
                    aria-live={shareToast.tone === 'error' ? 'assertive' : 'polite'}
                    style={{
                    position: 'fixed',
                    bottom: 90,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(30,30,30,0.95)',
                    backdropFilter: 'blur(12px)',
                    fontSize: 14,
                    fontWeight: 700,
                    padding: '12px 24px',
                    borderRadius: 12,
                    zIndex: 10001,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                    animation: 'fadeInUp 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <span aria-hidden="true">{shareToast.tone === 'error' ? '!' : shareToast.tone === 'info' ? 'i' : '✓'}</span>
                    {shareToast.message}
                </div>
            )}
    
            {/* Playlist Modal */}
            {showPlaylistModal && (
                <div role="presentation" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 10000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => { setShowPlaylistModal(null); setPlaylistActionError(null); }}>
                    <div
                        ref={playlistDialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="vl-playlist-title"
                        style={{
                        background: '#1C1C1E', padding: 24, borderRadius: 16, width: '90%', maxWidth: 400,
                        border: '1px solid #333'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h3 id="vl-playlist-title" style={{ margin: 0, color: 'white', fontSize: 17, fontWeight: 700 }}>Save to Playlist</h3>
                            <button onClick={() => { setShowPlaylistModal(null); setPlaylistActionError(null); }}
                                type="button" aria-label="Close playlist dialog"
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer', padding: 0 }}>×</button>
                        </div>
                        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
                            {playlists.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '24px 0 16px', color: 'rgba(255,255,255,0.35)' }}>
                                    <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
                                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No Playlists Yet</div>
                                    <div style={{ fontSize: 12 }}>Create one below to save this video</div>
                                </div>
                            )}
                            {playlists.map(p => {
                                const inPlaylist = p.items?.some(i => i.video_id === showPlaylistModal.videoId);
                                return (
                                    <div key={p.id} style={{
                                        padding: '12px 0', borderBottom: '1px solid #333',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ color: 'white', fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                                            {p.items?.length != null && (
                                                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 }}>{p.items.length} video{p.items.length !== 1 ? 's' : ''}</div>
                                            )}
                                        </div>
                                        <button onClick={async () => {
                                            try {
                                                setPlaylistActionError(null);
                                                if (inPlaylist) {
                                                    await removeVideoFromPlaylist(p.id, showPlaylistModal.videoId);
                                                } else {
                                                    await addVideoToPlaylist(p.id, showPlaylistModal.videoId, showPlaylistModal.title, showPlaylistModal.source);
                                                }
                                                const refreshedPlaylists = await getVideoPlaylists(userId);
                                                setPlaylists(refreshedPlaylists);
                                                showActionNotice(inPlaylist ? 'Removed from playlist.' : 'Added to playlist.', { videoId: showPlaylistModal.videoId });
                                            } catch (err) {
                                                setPlaylistActionError('Action failed. Please try again.');
                                            }
                                        }} style={{
                                            background: inPlaylist ? 'rgba(255,69,58,0.2)' : 'rgba(10,132,255,0.2)',
                                            color: inPlaylist ? '#FF453A' : '#0A84FF',
                                            border: `1px solid ${inPlaylist ? 'rgba(255,69,58,0.4)' : 'rgba(10,132,255,0.4)'}`,
                                            borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                                            fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                                        }}>
                                            {inPlaylist ? 'Remove' : 'Add'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        {playlistActionError && (
                            <div style={{ color: '#FF453A', fontSize: 12, marginBottom: 10, padding: '6px 10px', background: 'rgba(255,69,58,0.1)', borderRadius: 6, border: '1px solid rgba(255,69,58,0.25)' }}>
                                {playlistActionError}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                ref={playlistNameInputRef}
                                value={newPlaylistName}
                                onChange={e => setNewPlaylistName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && newPlaylistName.trim() && !isCreatingPlaylist) { e.preventDefault(); createPlaylistButtonRef.current?.click(); } }}
                                placeholder="New playlist name..."
                                disabled={isCreatingPlaylist}
                                style={{ flex: 1, padding: '9px 12px', borderRadius: 8, background: '#000', border: '1px solid #444', color: 'white', fontSize: 14, opacity: isCreatingPlaylist ? 0.6 : 1 }}
                            />
                            <button
                                ref={createPlaylistButtonRef}
                                type="button"
                                onClick={async () => {
                                    if (!newPlaylistName.trim() || isCreatingPlaylist) return;
                                    setIsCreatingPlaylist(true);
                                    setPlaylistActionError(null);
                                    try {
                                        const p = await createPlaylist(userId, newPlaylistName.trim());
                                        await addVideoToPlaylist(p.id, showPlaylistModal.videoId, showPlaylistModal.title, showPlaylistModal.source);
                                        setNewPlaylistName('');
                                        const refreshedPlaylists = await getVideoPlaylists(userId);
                                        setPlaylists(refreshedPlaylists);
                                        showActionNotice('Playlist created and video added.', { videoId: showPlaylistModal.videoId });
                                    } catch (err) {
                                        setPlaylistActionError('Failed to create playlist. Please try again.');
                                    } finally {
                                        setIsCreatingPlaylist(false);
                                    }
                                }}
                                disabled={isCreatingPlaylist || !newPlaylistName.trim()}
                                style={{
                                    background: isCreatingPlaylist || !newPlaylistName.trim() ? 'rgba(255,255,255,0.15)' : 'white',
                                    color: isCreatingPlaylist || !newPlaylistName.trim() ? 'rgba(255,255,255,0.35)' : 'black',
                                    border: 'none', borderRadius: 8, padding: '0 16px',
                                    fontWeight: 700, cursor: isCreatingPlaylist || !newPlaylistName.trim() ? 'not-allowed' : 'pointer',
                                    fontSize: 14, transition: 'all 0.15s', minWidth: 72,
                                }}
                            >
                                {isCreatingPlaylist ? '...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Train This Spot In-Place Overlay ── */}
            {ttsOverlay && (
                <div className="vl-tts-sheet" role="presentation" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9500, animation: 'tts-sheet-up 0.32s cubic-bezier(0.34,1.56,0.64,1) both' }}>
                    <div onClick={() => setTtsOverlay(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: -1 }} />
                    <div ref={ttsDialogRef} role="dialog" aria-modal="true" aria-labelledby="vl-tts-title" style={{ background: 'linear-gradient(180deg, #0a0f1e, #060a14)', borderRadius: '20px 20px 0 0', border: '1px solid rgba(0,200,83,0.2)', borderBottom: 'none', maxHeight: '75vh', overflow: 'auto', boxShadow: '0 -10px 60px rgba(0,0,0,0.7), 0 0 40px rgba(0,200,83,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}><div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} /></div>
                        <div style={{ padding: '8px 20px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, rgba(0,200,83,0.3), rgba(0,150,60,0.15))', border: '1.5px solid rgba(0,200,83,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div id="vl-tts-title" style={{ fontSize: 14, fontWeight: 800, color: '#34C759' }}>Train This Spot</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>AI-matched drills for this video</div>
                            </div>
                            <button ref={ttsCloseButtonRef} type="button" aria-label="Close training recommendations" onClick={() => setTtsOverlay(null)} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>✕</button>
                        </div>
                        <div style={{ padding: '0 20px 12px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <div style={{ width: 100, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#111', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <img src={`https://img.youtube.com/vi/${ttsOverlay.ctx.vid}/mqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{ttsOverlay.ctx.title || 'Poker Video'}</div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 6, padding: '2px 7px' }}>
                                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00D4FF' }} />
                                    <span style={{ fontSize: 9, fontWeight: 700, color: '#FF8888' }}>{(ttsOverlay.ctx.source || '').replace(/_/g, ' ')}</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '0 20px 8px' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>AI-Recommended Drills</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {ttsOverlay.games.map((game, idx) => (
                                    <button key={game.id} onClick={() => { setTtsOverlay(null); router.push(`/hub/training?autoLaunch=${game.id}`); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: idx === 0 ? 'rgba(0,200,83,0.08)' : 'rgba(255,255,255,0.03)', border: `1.5px solid ${idx === 0 ? 'rgba(0,200,83,0.3)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s' }}>
                                        <div style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, background: idx === 0 ? 'rgba(0,200,83,0.15)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{game.icon || '🎯'}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: idx === 0 ? '#34C759' : '#fff' }}>{game.name}</span>
                                                {idx === 0 && <span style={{ fontSize: 8, fontWeight: 800, color: '#34C759', background: 'rgba(0,200,83,0.12)', borderRadius: 5, padding: '1px 5px' }}>BEST MATCH</span>}
                                            </div>
                                            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{game.focus} · {'★'.repeat(Math.min(game.difficulty || 1, 5))} Difficulty</div>
                                        </div>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div style={{ padding: '6px 20px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <button onClick={() => { setTtsOverlay(null); router.push(buildSandboxUrl(ttsOverlay.ctx)); }} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'linear-gradient(135deg, rgba(0,150,255,0.1), rgba(0,100,200,0.1))', border: '1.5px solid rgba(0,150,255,0.35)', color: '#4DA6FF', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all 0.15s' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
                                {(() => { const ex = extractCardsFromContext(ttsOverlay.ctx); return ex.hand ? `Solve in Sandbox (${ex.hand.slice(0,2)} ${ex.hand.slice(2)})` : 'Open in Virtual Sandbox'; })()}
                            </button>
                            <button onClick={() => { setTtsOverlay(null); router.push('/hub/training'); }} style={{ width: '100%', padding: '8px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Browse All 100 Training Games</button>
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

        </PageTransition>
    );
}
