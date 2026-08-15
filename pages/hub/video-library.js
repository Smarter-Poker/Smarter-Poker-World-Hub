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
import { updateWatchDuration, getWatchedVideos, getWatchProgress, getRecentlyWatched, getWatchStats } from '../../src/services/videoWatchHistory';

// God-Mode Stack
import { useVideoLibraryStore } from '../../src/stores/videoLibraryStore';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { DiamondEngine } from '../../src/services/DiamondEngine';

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
        // Sort key: prefer published_at when it's a real date (not today), else use scraped_at
        _sortKey: row.published_at,
    };
}

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
    const [videos, setVideos] = useState(STATIC_VIDEOS);
    const [displayedCount, setDisplayedCount] = useState(30);
    const [allVideos, setAllVideos] = useState(STATIC_VIDEOS); // unfiltered master list
    const [dbLoaded, setDbLoaded] = useState(false);

    // Fetch live videos from Supabase (replaces / extends static list)
    useEffect(() => {
        let cancelled = false;
        const PAGE_SIZE = 1000;
        let allDbVideos = [];

        async function fetchAllPages() {
            let from = 0;
            while (true) {
                const { data, error } = await supabase
                    .from('video_library_videos')
                    .select('youtube_video_id, source_id, source_name, type, title, thumbnail_url, views_text, views_count, duration, published_at, scraped_at, tags')
                    .order('scraped_at', { ascending: false })
                    .range(from, from + PAGE_SIZE - 1);
                if (cancelled || error || !data || data.length === 0) break;
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
            const staticOnly = STATIC_VIDEOS.filter(v => !dbIds.has(v.videoId));
            const merged = [...deduped, ...staticOnly];
            setAllVideos(merged);
            setVideos(merged);
            setDbLoaded(true);
        }

        fetchAllPages();
        return () => { cancelled = true; };
    }, []);


    // Handle query parameters for deep linking
    const savedScrollY = useRef(0); // restore scroll when modal closes
    // Stable ref so the early query-param useEffect can call handleOpenVideo
    // without putting it in the dependency array (avoids TDZ in minified output)
    const handleOpenVideoRef = useRef(null);
    useEffect(() => {
        if (router.query.type) {
            // 2026-08-15: was .toUpperCase(), which produced 'CASH'/'TOURNAMENT'
            // and never matched v.type — the DB CHECK constraint stores these
            // lowercase. Every ?type= deep link (two hamburger-menu entries and
            // the sitemap links) landed on an empty "No Videos Found" page.
            setSelectedType(router.query.type.toLowerCase());
        }
        if (router.query.source) {
            setSelectedSource(router.query.source.toUpperCase());
        }
        if (router.query.filter) {
            setSearchQuery(router.query.filter);
        }
        // ?v=VIDEO_ID — auto-open a specific video
        if (router.query.v && allVideos.length > 0) {
            const target = allVideos.find(v => v.videoId === router.query.v);
            if (target && handleOpenVideoRef.current) handleOpenVideoRef.current(target);
        }
    }, [router.query, allVideos]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showReelsModal, setShowReelsModal] = useState(false);
    const modalRef = useRef(null);
    const modalOverlayRef = useRef(null); // ref for native fullscreen
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
    const [watchLater, setWatchLater] = useState(new Set());
    const [watchedVideos, setWatchedVideos] = useState(new Set()); // Videos watched 60+ seconds
    const [watchProgress, setWatchProgress] = useState(new Map()); // video_id → { watchedSeconds, watchedAt }
    const [recentlyWatched, setRecentlyWatched] = useState([]); // Recently watched videos
    const [watchStats, setWatchStats] = useState(null); // User's watch statistics
    const [showStats, setShowStats] = useState(false); // Stats modal visibility

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


    // Share toast (copy-to-clipboard feedback)
    const [shareToast, setShareToast] = useState(null); // { message, videoId }
    const [ttsOverlay, setTtsOverlay] = useState(null); // Train This Spot in-place overlay { ctx, games }
    const shareToastTimer = useRef(null);

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

    // Centralized YouTube error management for video library player
    const { ytError: vlYtManaged, thumbnailUrl: vlThumbnailUrl } = useYouTubeErrorManager({
        active: !!selectedVideo,
        videoId: selectedVideo?.videoId || null,
        surface: 'VideoLibrary',
        autoActionDelay: 3000,
        onError: () => {
            // BUG-19 FIX: flush watch time + restore scroll on YT error close
            // (previously only closed modal, leaving scroll locked at video position)
            if (watchStartTimeRef.current && currentWatchingVideoRef.current && userId) {
                const watchedSeconds = Math.floor((Date.now() - watchStartTimeRef.current) / 1000);
                const video = currentWatchingVideoRef.current;
                watchStartTimeRef.current = null;
                currentWatchingVideoRef.current = null;
                if (watchedSeconds > 0) {
                    updateWatchDuration(userId, video.id, watchedSeconds, {
                        title: video.title,
                        url: `https://youtube.com/watch?v=${video.videoId}`,
                        thumbnail: `https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`
                    }).catch(() => {});
                }
            } else {
                watchStartTimeRef.current = null;
                currentWatchingVideoRef.current = null;
            }
            setSelectedVideo(null);
            if (typeof window !== 'undefined' && savedScrollY.current > 0) {
                requestAnimationFrame(() => window.scrollTo({ top: savedScrollY.current, behavior: 'instant' }));
            }
        },
    });



    
    // Infinite scroll observer — created once, uses functional updater so no dep on videos.length
    const loadMoreRef = useRef(null);
    useEffect(() => {
        if (!loadMoreRef.current) return;
        const sentinel = loadMoreRef.current;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                // Use the ref directly to get current videos count, avoiding stale closure
                setDisplayedCount(prev => prev + 30);
            }
        }, { rootMargin: '400px' });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []); // [] — sentinel DOM node never changes, functional updater avoids stale closure

    // Reset displayed count when filters OR sort mode changes
    useEffect(() => {
        setDisplayedCount(30);
    // BUG-18 FIX: sortMode added — switching Trending/Top-Rated/Latest now resets pagination
    }, [selectedSource, selectedType, searchQuery, sortMode]);

    const timeTrackingInterval = useRef(null); // keep for watch-time ticking

    // Watch time tracking
    const watchStartTimeRef = useRef(null);
    const currentWatchingVideoRef = useRef(null);

    // Hamburger menu preferences
    const [preferences, setPreferences] = useState({
        autoplay: true,
        hdQuality: true,
        captions: false
    });

    // Intro video removed by request
        
    // Mark intro as seen when it ends

    // Attempt to unmute video after it starts playing

    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 3 REALTIME: Video Library Updates (P3: also syncs watchProgress Map)
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!userId) return;

        const videoLibraryChannel = supabase
            .channel(`video-library:${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                // FIX: was 'user_video_watch_history' — actual table is 'video_watch_history'
                // (confirmed in src/services/videoWatchHistory.js). Wrong name = RT never fires.
                table: 'video_watch_history',
                filter: `user_id=eq.${userId}`
            }, () => {
                // Reload watch stats, recently watched, AND watch progress map (cross-device sync)
                getWatchStats(userId).then(stats => setWatchStats(stats));
                getRecentlyWatched(userId, 10).then(recent => setRecentlyWatched(recent));
                getWatchProgress(userId).then(progressMap => setWatchProgress(progressMap)).catch(() => {});
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'video_favorites',
                filter: `user_id=eq.${userId}`
            }, () => {
                getVideoPlaylists(userId).then(setPlaylists).catch(err => console.warn('Playlists error:', err));
                getVideoFavorites(userId).then(data => {
                    setFavorites(new Set((data || []).map(v => v.video_id)));
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(videoLibraryChannel);
        };
    }, [userId]);

    // Load preferences from Supabase on mount
    useEffect(() => {
        if (userId) {
            getVideoLibraryPreferences(userId).then(setPreferences);

            // Load favorites and watch later lists
            getVideoFavorites(userId).then(data => {
                setFavorites(new Set(data.map(v => v.video_id)));
            }).catch(err => console.warn('Error loading favorites:', err));

            getWatchLater(userId).then(data => {
                setWatchLater(new Set(data.map(v => v.video_id)));
            }).catch(err => console.warn('Error loading watch later:', err));

            // Load watched videos (30+ second threshold - lowered for better feedback)
            getWatchedVideos(userId, 30).then(watchedSet => {
                setWatchedVideos(watchedSet);
            }).catch(err => console.warn('Error loading watched videos:', err));

            // Load watch progress for progress bars
            getWatchProgress(userId).then(progressMap => {
                setWatchProgress(progressMap);
            }).catch(err => console.warn('Error loading watch progress:', err));

            // Load recently watched for carousel
            getRecentlyWatched(userId, 10).then(recent => {
                setRecentlyWatched(recent);
            }).catch(err => console.warn('Error loading recently watched:', err));

            // Load watch stats
            getWatchStats(userId).then(stats => {
                setWatchStats(stats);
            }).catch(err => console.warn('Error loading watch stats:', err));
        }
    }, [userId]);

    // Hamburger menu handlers - save to Supabase
    const updatePreference = useCallback(async (key, value) => {
        // BUG-C FIX: use functional setState so rapid toggles never read stale preferences
        setPreferences(prev => ({ ...prev, [key]: value }));

        if (userId) {
            try {
                await updateVideoLibraryPreferences(userId, { [key]: value });
            } catch (error) {
                console.warn('Failed to save preference:', error);
            }
        }
    }, [userId]);

    const menuConfig = getMenuConfig('video-library', user, preferences, {
        setAutoplay: (val) => updatePreference('autoplay', val),
        setHdQuality: (val) => updatePreference('hdQuality', val),
        setCaptions: (val) => updatePreference('captions', val)
    });

    // Content tracking handlers
    const toggleFavorite = useCallback(async (video) => {
        if (!userId) return;

        const videoId = video.id;
        if (favorites.has(videoId)) {
            await removeVideoFavorite(userId, videoId);
            setFavorites(prev => {
                const newSet = new Set(prev);
                newSet.delete(videoId);
                return newSet;
            });
        } else {
            await addVideoFavorite(userId, videoId, {
                title: video.title,
                source: video.source,
                video_url: `https://youtube.com/watch?v=${video.videoId}`
            });
            setFavorites(prev => new Set(prev).add(videoId));
        }
    }, [userId, favorites]);

    const toggleWatchLater = useCallback(async (video) => {
        if (!userId) return;

        const videoId = video.id;
        if (watchLater.has(videoId)) {
            await removeFromWatchLater(userId, videoId);
            setWatchLater(prev => {
                const newSet = new Set(prev);
                newSet.delete(videoId);
                return newSet;
            });
        } else {
            await addToWatchLater(userId, videoId, {
                title: video.title,
                source: video.source,
                video_url: `https://youtube.com/watch?v=${video.videoId}`
            });
            setWatchLater(prev => new Set(prev).add(videoId));
        }
    }, [userId, watchLater]);

    // Navigate to a specific video in the current filtered list
    const handleOpenVideo = useCallback(async (video) => {
        savedScrollY.current = typeof window !== 'undefined' ? window.scrollY : 0;
        watchStartTimeRef.current = Date.now();
        currentWatchingVideoRef.current = video;
        setSelectedVideo(video);
        setIframeKey(k => k + 1); // force iframe remount → guaranteed autoplay
    }, []);
    // Keep ref in sync so early useEffects can call it without a TDZ dep
    useEffect(() => { handleOpenVideoRef.current = handleOpenVideo; }, [handleOpenVideo]);

    // Navigate to next video in list (TikTok swipe down / arrow right)
    const handleNextVideo = useCallback(() => {
        if (!selectedVideo || videos.length === 0) return;
        const idx = videos.findIndex(v => v.videoId === selectedVideo.videoId);
        const next = videos[(idx + 1) % videos.length];
        handleOpenVideo(next);
    }, [selectedVideo, videos, handleOpenVideo]);

    // Navigate to previous video (arrow left)
    const handlePrevVideo = useCallback(() => {
        if (!selectedVideo || videos.length === 0) return;
        const idx = videos.findIndex(v => v.videoId === selectedVideo.videoId);
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
            document.exitFullscreen?.();
        }
    }, []);


    // Handle closing a video - save watch duration
    const handleCloseVideo = useCallback(async () => {
        // BUG-J FIX: guard against double-save (Escape + close button simultaneously).
        // Null the refs BEFORE the await so a concurrent call exits immediately.
        if (!watchStartTimeRef.current || !currentWatchingVideoRef.current || !userId) {
            setSelectedVideo(null);
            setVlHudVisible(false);
            clearTimeout(vlHudTimer.current);
            if (typeof window !== 'undefined' && savedScrollY.current > 0) {
                requestAnimationFrame(() => window.scrollTo({ top: savedScrollY.current, behavior: 'instant' }));
            }
            return;
        }
        const startTime = watchStartTimeRef.current;
        const video = currentWatchingVideoRef.current;
        // Clear refs IMMEDIATELY to prevent concurrent call from re-entering
        watchStartTimeRef.current = null;
        currentWatchingVideoRef.current = null;

        if (true) { // scoping block (was if (watchStartTimeRef.current...))
            const watchedSeconds = Math.floor((Date.now() - startTime) / 1000);


            if (watchedSeconds > 0) {
                try {
                    await updateWatchDuration(userId, video.id, watchedSeconds, {
                        title: video.title,
                        url: `https://youtube.com/watch?v=${video.videoId}`,
                        thumbnail: `https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`
                    });

                    // Update progress for immediate UI feedback
                    setWatchProgress(prev => {
                        const newMap = new Map(prev);
                        const existing = newMap.get(video.id) || { watchedSeconds: 0 };
                        newMap.set(video.id, {
                            watchedSeconds: (existing.watchedSeconds || 0) + watchedSeconds,
                            watchedAt: new Date().toISOString()
                        });
                        return newMap;
                    });

                    // Refresh recentlyWatched from DB for cross-session accuracy (fire-and-forget)
                    if (watchedSeconds >= 30) {
                        getRecentlyWatched(userId, 10)
                            .then(recent => setRecentlyWatched(recent))
                            .catch(() => {
                                // Fallback: optimistic local update
                                setRecentlyWatched(prev => {
                                    const filtered = prev.filter(v => v.video_id !== video.id);
                                    return [{
                                        video_id: video.id,
                                        video_title: video.title,
                                        watch_duration_seconds: (watchProgress.get(video.id)?.watchedSeconds || 0) + watchedSeconds,
                                        watched_at: new Date().toISOString()
                                    }, ...filtered].slice(0, 10);
                                });
                            });
                    }

                    // Update stats
                    setWatchStats(prev => prev ? {
                        ...prev,
                        totalWatchTimeSeconds: prev.totalWatchTimeSeconds + watchedSeconds
                    } : prev);

                    // If user watched 30+ seconds, add to watched set for immediate UI update
                    const previousWatched = watchProgress.get(video.id)?.watchedSeconds || 0;
                    const totalWatched = previousWatched + watchedSeconds;

                    if (totalWatched >= 30) {
                        setWatchedVideos(prev => new Set(prev).add(video.id));

                        // Award diamonds if this is the first time crossing the 30s threshold
                        if (previousWatched < 30) {
                            try {
                                await DiamondEngine.init(userId);
                                await DiamondEngine.award(2, 'video_watch', {
                                    description: `Watched: ${video.title.substring(0, 50)}...`,
                                    reference_id: video.id
                                });
                            } catch (diamondErr) {
                                console.warn('Failed to award diamonds for video watch:', diamondErr);
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Error saving watch duration:', err);
                }
            }
        } // end scoping block

        // Refs already cleared above — just clean up UI
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
    }, [userId, watchProgress]);

    // Share a video — copy deep-link to clipboard and show toast
    const handleShareVideo = useCallback((video) => {
        if (shareToastTimer.current) clearTimeout(shareToastTimer.current);
        const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}/hub/video-library?v=${video.videoId}`;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).catch(() => {});
        }
        setShareToast({ message: 'Link copied!', videoId: video.videoId });
        shareToastTimer.current = setTimeout(() => setShareToast(null), 2500);
    }, []);

    // Mark a video as unwatched (remove from watchedVideos set)
    const handleMarkUnwatched = useCallback((videoId) => {
        setWatchedVideos(prev => { const s = new Set(prev); s.delete(videoId); return s; });
    }, []);

    // Filter videos (runs when any filter changes OR when DB data loads)
    useEffect(() => {
        let filtered = allVideos;
        if (selectedType !== 'ALL') {
            filtered = filtered.filter(v => v.type === selectedType);
        }
        if (selectedSource !== 'ALL') {
            filtered = filtered.filter(v => v.source === selectedSource);
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
    }, [selectedSource, selectedType, searchQuery, watchedVideos, allVideos, sortMode, trendingScores]);


    // Keyboard navigation in modal
    useEffect(() => {
        const handleKey = (e) => {
            if (!selectedVideo) return;
            if (e.key === 'Escape') handleCloseVideo();
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') handleNextVideo();
            if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   handlePrevVideo();
            if (e.key === 'f' || e.key === 'F') handleFullscreen();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [selectedVideo, handleCloseVideo, handleNextVideo, handlePrevVideo, handleFullscreen]);

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

    // Cleanup interval on unmount
    useEffect(() => () => { if (timeTrackingInterval.current) clearInterval(timeTrackingInterval.current); }, []);

    // ── BUG-I FIX: Flush pending watch time on tab hide / browser close ──────────
    // Without this, a user closing the tab mid-video loses all watch time because
    // handleCloseVideo never runs. visibilitychange fires reliably on mobile too.
    const pendingFlushRef = useRef(false);
    useEffect(() => {
        const flushWatchTime = () => {
            if (pendingFlushRef.current) return; // debounce double-fire
            if (!watchStartTimeRef.current || !currentWatchingVideoRef.current || !userId) return;
            pendingFlushRef.current = true;
            const watchedSeconds = Math.floor((Date.now() - watchStartTimeRef.current) / 1000);
            const video = currentWatchingVideoRef.current;
            // Fire-and-forget via service — if page is unloading, supabase will try its best
            if (watchedSeconds > 0) {
                // Optimistic: reset refs immediately
                watchStartTimeRef.current = null;
                currentWatchingVideoRef.current = null;
                // Fire-and-forget via service — if page is unloading, supabase will try its best
                updateWatchDuration(userId, video.id, watchedSeconds, {
                    title: video.title,
                    url: `https://youtube.com/watch?v=${video.videoId}`,
                    thumbnail: `https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`
                }).catch(() => {});
            }
            // Reset debounce after 2s
            setTimeout(() => { pendingFlushRef.current = false; }, 2000);
        };
        const onHide = () => { if (document.visibilityState === 'hidden') flushWatchTime(); };
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('beforeunload', flushWatchTime);
        return () => {
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('beforeunload', flushWatchTime);
        };
    }, [userId]);

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
                    <div style={{ marginBottom: 20 }}>
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

                    {/* Type toggle + Search Row */}
                    <div className="vl-type-toggle-row" style={{
                        display: 'flex',
                        gap: 8,
                        marginBottom: 16,
                        justifyContent: 'flex-start',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        rowGap: 8,
                    }}>
                        {[
                            { id: 'ALL',        name: 'All Videos' },
                            { id: 'cash',       name: 'Cash Games' },
                            { id: 'tournament', name: 'Tournaments' },
                        ].map(type => {
                            const isActive = selectedType === type.id;
                            return (
                                <button
                                    key={type.id}
                                    onClick={() => setSelectedType(type.id)}
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
                        {[
                            { id: 'default',   label: 'Latest' },
                            { id: 'trending',  label: '🔥 Trending' },
                            { id: 'top_rated', label: '⭐ Top Rated' },
                        ].map(s => {
                            const isActive = sortMode === s.id;
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => setSortMode(s.id)}
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
                        <button
                            id="vl-reels-tab-btn"
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

                        {/* Search Input */}
                        <div className="vl-search-wrap" style={{
                            position: 'relative',
                            width: 220,
                            marginLeft: 12,
                            flexShrink: 0,
                            flexBasis: 220,
                        }}>
                            <input
                                type="text"
                                placeholder="Search Videos..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
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
                            <span style={{
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
                        </div>
                    </div>

                    {/* Search results count — shown when query is active */}
                    {searchQuery && (
                        <div style={{
                            fontSize: 13,
                            color: 'rgba(255,255,255,0.45)',
                            marginBottom: 8,
                            paddingLeft: 2,
                        }}>
                            {videos.length} result{videos.length !== 1 ? 's' : ''} for <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>&ldquo;{searchQuery}&rdquo;</span>
                            {videos.length === 0 && (
                                <button
                                    onClick={() => { setSearchQuery(''); setSelectedSource('ALL'); setSelectedType('ALL'); }}
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
                        {SOURCES.filter(source => source && typeof source === 'object' && source.id && source.id !== 'ALL').map(source => {
                            const isActive = selectedSource === source.id;
                            const initials = (source.name || source.id || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                            return (
                                <button
                                    key={source.id}
                                    onClick={() => setSelectedSource(source.id)}
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
                                    <div style={{
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
                                        <div style={{
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
                                                    alt={source.name}
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
                                                />
                                            ) : (
                                                <span style={{
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
                                    <div style={{
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
                                        <div style={{
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
                </div>

                {/* Watch Stats moved to hamburger menu - removed from main page */}

                {/* Continue Watching / Recently Watched Section */}
                {recentlyWatched.length > 0 && (
                    <div className="vl-continue-watching" style={{
                        maxWidth: 1400,
                        margin: '0 auto 30px',
                    }}>
                        <h2 style={{
                            color: C.text,
                            fontSize: 18,
                            fontWeight: 600,
                            marginBottom: 16,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            <span style={{ color: '#00D4FF' }}>▶</span> Continue Watching
                        </h2>
                        <div className="vl-cw-scroll" style={{
                            display: 'flex',
                            gap: 16,
                            overflowX: 'auto',
                            paddingBottom: 8,
                            scrollbarWidth: 'thin',
                        }}>
                            {recentlyWatched.map(item => {
                                const video = allVideos.find(v => v.id === item.video_id);
                                if (!video) return null;
                                const progress = getProgressPercent(video.id, video.duration);
                                return (
                                    <div
                                        key={item.video_id}
                                        onClick={() => handleOpenVideo(video)}
                                        className="metal-frame video-card-metal"
                                        style={{
                                            minWidth: 240,
                                            cursor: 'pointer',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <div style={{ position: 'relative', aspectRatio: '16/9' }}>
                                            <img
                                                src={getThumbnail(video.videoId)}
                                                alt={video.title}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                            {/* Resume play button */}
                                            <div style={{
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
                                            <div style={{
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
                                                {formatTime(item.watch_duration_seconds || 0)} watched
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
                    <div style={{ maxWidth: 1400, margin: '0 auto 28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: '#00D4FF', fontSize: 14, background: 'rgba(0,212,255,0.2)', border: '1px solid rgba(0,212,255,0.4)', borderRadius: 6, padding: '2px 8px', fontWeight: 700, letterSpacing: '0.5px' }}>NEW</span>
                                New This Week
                            </h2>
                            <button onClick={() => setNewThisWeekDismissed(true)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 12, cursor: 'pointer', padding: 4 }}>Dismiss</button>
                        </div>
                        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
                            {newThisWeek.map(video => (
                                <div
                                    key={video.videoId}
                                    onClick={() => handleOpenVideo(video)}
                                    style={{ minWidth: 220, flexShrink: 0, cursor: 'pointer', borderRadius: 10, overflow: 'hidden', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', transition: 'transform 0.18s, box-shadow 0.18s' }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                                >
                                    <div style={{ position: 'relative', aspectRatio: '16/9', background: '#111' }}>
                                        <img src={getThumbnail(video.videoId)} alt={video.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
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
                <div className="vl-video-grid" style={{
                    maxWidth: 1400,
                    margin: '0 auto',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: 20,
                }}>
                    {/* Skeleton loading cards while DB fetch runs */}
                    {!dbLoaded && Array.from({ length: 12 }).map((_, i) => (
                        <div key={`sk-${i}`} className="metal-frame video-card-metal" style={{ cursor: 'default' }}>
                            <div style={{ aspectRatio: '16/9', background: 'linear-gradient(90deg, #1a1a1a 25%, #252525 50%, #1a1a1a 75%)', backgroundSize: '200% 100%', animation: 'vl-shimmer 1.4s infinite' }} />
                            <div style={{ padding: 16 }}>
                                <div style={{ height: 14, width: '85%', borderRadius: 6, background: 'linear-gradient(90deg, #1a1a1a 25%, #252525 50%, #1a1a1a 75%)', backgroundSize: '200% 100%', animation: 'vl-shimmer 1.4s infinite', marginBottom: 8 }} />
                                <div style={{ height: 14, width: '55%', borderRadius: 6, background: 'linear-gradient(90deg, #1a1a1a 25%, #252525 50%, #1a1a1a 75%)', backgroundSize: '200% 100%', animation: 'vl-shimmer 1.4s infinite' }} />
                            </div>
                        </div>
                    ))}
                    {dbLoaded && videos.slice(0, Math.min(displayedCount, videos.length)).map(video => (
                        <div
                            key={video.id}
                            onClick={() => handleOpenVideo(video)}
                            className="metal-frame video-card-metal"
                            style={{
                                cursor: 'pointer',
                            }}
                        >
                            {/* Thumbnail */}
                            <div style={{
                                position: 'relative',
                                aspectRatio: '16/9',
                                background: '#222',
                            }}>
                                <img
                                    src={getThumbnail(video.videoId)}
                                    alt={video.title}
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
                                <div style={{
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
                                    <div
                                        title="Click to mark unwatched"
                                        onClick={e => { e.stopPropagation(); handleMarkUnwatched(video.id); }}
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
                                        }}
                                    >
                                        <span>✓</span> Watched
                                    </div>
                                )}
                                {/* AI badge removed per user request */}
                                {/* Progress bar */}
                                {getProgressPercent(video.id, video.duration) > 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        height: 4,
                                        background: 'rgba(255,255,255,0.3)',
                                    }}>
                                        <div style={{
                                            width: `${getProgressPercent(video.id, video.duration)}%`,
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
                                    className="play-btn"
                                >
                                    <span style={{ fontSize: 28, marginLeft: 4 }}>▶</span>
                                </div>
                            </div>

                            {/* Info */}
                            <div className="vl-card-info" style={{ padding: 16 }}>
                                <h3 style={{
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

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}>
                                    <span style={{
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
                                            <div style={{
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
                                    <span style={{ color: C.textSec, fontSize: 13 }}>
                                        {video.views} views
                                    </span>
                                    {/* Share button */}
                                    <button
                                        id={`vl-share-${video.videoId}`}
                                        title="Copy link"
                                        onClick={e => { e.stopPropagation(); handleShareVideo(video); }}
                                        style={{
                                            background: shareToast?.videoId === video.videoId ? 'rgba(52,199,89,0.2)' : 'rgba(255,255,255,0.06)',
                                            border: shareToast?.videoId === video.videoId ? '1px solid rgba(52,199,89,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 8,
                                            color: shareToast?.videoId === video.videoId ? '#34C759' : 'rgba(255,255,255,0.5)',
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
                                        {shareToast?.videoId === video.videoId ? '✓ Copied' : '⎘ Share'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Infinite Scroll Sentinel */}
                {displayedCount < videos.length && (
                    <div ref={loadMoreRef} style={{ height: 20, width: '100%' }} />
                )}

                {/* No results */}
                {dbLoaded && videos.length === 0 && (
                    <div style={{
                        textAlign: 'center',
                        padding: '80px 20px',
                        color: C.textSec,
                    }}>
                        <div style={{ fontSize: 64, marginBottom: 16 }}>🎬</div>
                        <h3 style={{ color: C.text, marginBottom: 8 }}>No Videos Found</h3>
                        <p style={{ marginBottom: 20 }}>
                            {searchQuery ? `No results for "${searchQuery}"` : 'Try Adjusting Your Filters'}
                        </p>
                        <button
                            onClick={() => { setSearchQuery(''); setSelectedSource('ALL'); setSelectedType('ALL'); }}
                            style={{
                                padding: '10px 24px',
                                background: 'rgba(0,212,255,0.15)',
                                border: '1px solid rgba(0,212,255,0.4)',
                                borderRadius: 10,
                                color: '#00D4FF',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            Clear All Filters
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
                    Showing {videos.length} of {allVideos.length} videos
                </div>
            </div>

            {/* Video Modal */}
            {selectedVideo && (
                <div
                    ref={modalOverlayRef}
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
                    {/* Close button — positioned top-right, clear of YouTube's title bar */}
                    <button
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
                            onClick={handlePrevVideo}
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
                            onClick={handleNextVideo}
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
                    <div style={{
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
                                    top: 0, left: 0,
                                    width: '15%',
                                    height: '100%',
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
                                    top: 0, right: 0,
                                    width: '15%',
                                    height: '100%',
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
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!userId || !selectedVideo) return;
                                    const videoId = selectedVideo.id || selectedVideo.videoId;
                                    if (favorites.has(videoId)) {
                                        setFavorites(prev => { const s = new Set(prev); s.delete(videoId); return s; });
                                        removeVideoFavorite(userId, videoId).catch(() => {});
                                    } else {
                                        setFavorites(prev => new Set([...prev, videoId]));
                                        // BUG-B FIX: pass full metadata so DB columns are not null
                                        addVideoFavorite(userId, videoId, {
                                            title: selectedVideo?.title || '',
                                            source: selectedVideo?.source || '',
                                            video_url: `https://youtube.com/watch?v=${selectedVideo?.videoId || videoId}`
                                        }).catch(() => {});
                                    }
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
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!userId || !selectedVideo) return;
                                    const videoId = selectedVideo.id || selectedVideo.videoId;
                                    if (watchLater.has(videoId)) {
                                        setWatchLater(prev => { const s = new Set(prev); s.delete(videoId); return s; });
                                        removeFromWatchLater(userId, videoId).catch(() => {});
                                    } else {
                                        setWatchLater(prev => new Set([...prev, videoId]));
                                        addToWatchLater(userId, videoId).catch(() => {});
                                    }
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
                        </div>

                        <iframe
                            key={iframeKey}
                            id="youtube-player"
                            src={`https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=1&mute=${isTouchDevice ? 0 : 1}&rel=0&modestbranding=1&fs=1&iv_load_policy=3&showinfo=0&enablejsapi=1&playsinline=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}`}
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
                                    iframeUnmuteTimers.current = [200, 600, 1200].map(d => setTimeout(() => {
                                        try {
                                            win.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
                                            win.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }), '*');
                                        } catch { /* best-effort */ }
                                    }, d));
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
                            <h2 style={{
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
                                            alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'contain' }} />
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
                                                    alt={v.title}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    loading="lazy"
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
                div:hover .play-btn {
                    opacity: 1 !important;
                }

                /* Skeleton shimmer animation */
                @keyframes vl-shimmer {
                    0%   { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
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
                        position: absolute !important;
                        bottom: 0 !important;
                        left: 0 !important;
                        right: 0 !important;
                        max-height: 140px !important;
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
                        position: absolute !important;
                        bottom: 0 !important;
                        left: 0 !important;
                        right: 0 !important;
                        max-height: 140px !important;
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
              <BottomNavBar />

            {/* Reels Modal — full-screen TikTok doom-scroll */}
            {showReelsModal && (
                <div style={{
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
                <div style={{
                    position: 'fixed',
                    bottom: 90,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(30,30,30,0.95)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(52,199,89,0.5)',
                    color: '#34C759',
                    fontSize: 14,
                    fontWeight: 700,
                    padding: '12px 24px',
                    borderRadius: 12,
                    zIndex: 9999,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                    animation: 'fadeInUp 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <span>✓</span> Link Copied To Clipboard
                </div>
            )}
    
            {/* Playlist Modal */}
            {showPlaylistModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 10000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => { setShowPlaylistModal(null); setPlaylistActionError(null); }}>
                    <div style={{
                        background: '#1C1C1E', padding: 24, borderRadius: 16, width: '90%', maxWidth: 400,
                        border: '1px solid #333'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h3 style={{ margin: 0, color: 'white', fontSize: 17, fontWeight: 700 }}>Save to Playlist</h3>
                            <button onClick={() => { setShowPlaylistModal(null); setPlaylistActionError(null); }}
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
                                                getVideoPlaylists(userId).then(setPlaylists);
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
                                value={newPlaylistName}
                                onChange={e => setNewPlaylistName(e.target.value)}
                                onKeyDown={async (e) => { if (e.key === 'Enter' && newPlaylistName.trim() && !isCreatingPlaylist) { e.preventDefault(); e.currentTarget.blur(); } }}
                                placeholder="New playlist name..."
                                disabled={isCreatingPlaylist}
                                style={{ flex: 1, padding: '9px 12px', borderRadius: 8, background: '#000', border: '1px solid #444', color: 'white', fontSize: 14, opacity: isCreatingPlaylist ? 0.6 : 1 }}
                            />
                            <button
                                onClick={async () => {
                                    if (!newPlaylistName.trim() || isCreatingPlaylist) return;
                                    setIsCreatingPlaylist(true);
                                    setPlaylistActionError(null);
                                    try {
                                        const p = await createPlaylist(userId, newPlaylistName.trim());
                                        await addVideoToPlaylist(p.id, showPlaylistModal.videoId, showPlaylistModal.title, showPlaylistModal.source);
                                        setNewPlaylistName('');
                                        getVideoPlaylists(userId).then(setPlaylists);
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
                <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9500, animation: 'tts-sheet-up 0.32s cubic-bezier(0.34,1.56,0.64,1) both' }}>
                    <div onClick={() => setTtsOverlay(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: -1 }} />
                    <div style={{ background: 'linear-gradient(180deg, #0a0f1e, #060a14)', borderRadius: '20px 20px 0 0', border: '1px solid rgba(0,200,83,0.2)', borderBottom: 'none', maxHeight: '75vh', overflow: 'auto', boxShadow: '0 -10px 60px rgba(0,0,0,0.7), 0 0 40px rgba(0,200,83,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}><div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} /></div>
                        <div style={{ padding: '8px 20px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, rgba(0,200,83,0.3), rgba(0,150,60,0.15))', border: '1.5px solid rgba(0,200,83,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 800, color: '#34C759' }}>Train This Spot</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>AI-matched drills for this video</div>
                            </div>
                            <button onClick={() => setTtsOverlay(null)} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>✕</button>
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
