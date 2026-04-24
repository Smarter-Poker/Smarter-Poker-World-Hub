/**
 * VIDEO LIBRARY - Full Poker Videos from Global Livestreams
 * Browse and watch complete hands from HCL, The Lodge, Triton, and more
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';
import { useYouTubeErrorManager, YouTubeErrorOverlay } from '../../src/hooks/useYouTubeErrorManager';
import SEOHead from '../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { supabase } from '../../src/lib/supabase';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { useAvatar } from '../../src/contexts/AvatarContext';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getVideoLibraryPreferences, updateVideoLibraryPreferences } from '../../src/services/videoLibraryPreferences';
import { getVideoFavorites, addVideoFavorite, removeVideoFavorite } from '../../src/services/videoFavorites';
import { getWatchLater, addToWatchLater, removeFromWatchLater } from '../../src/services/videoWatchLater';
import { updateWatchDuration, getWatchedVideos, getWatchProgress, getRecentlyWatched, getWatchStats } from '../../src/services/videoWatchHistory';

// God-Mode Stack
import { useVideoLibraryStore } from '../../src/stores/videoLibraryStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { DiamondEngine } from '../../src/services/DiamondEngine';
import BottomNavBar from '../../src/components/ui/BottomNavBar';
import { ReelsViewer } from '../../src/components/social/Reels';

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
    accent: '#FF4444',
    blue: '#0A84FF',
};

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
                    .select('youtube_video_id, source_id, source_name, type, title, thumbnail_url, views_text, views_count, duration, published_at, scraped_at')
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
    useEffect(() => {
        if (router.query.type) {
            setSelectedType(router.query.type.toUpperCase());
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
            if (target) handleOpenVideo(target);
        }
    }, [router.query, allVideos]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showReelsModal, setShowReelsModal] = useState(false);
    const modalRef = useRef(null);
    const modalOverlayRef = useRef(null); // ref for native fullscreen
    const [menuOpen, setMenuOpen] = useState(false);
    const [iframeKey, setIframeKey] = useState(0); // bump to force iframe remount (guarantees autoplay)

    // Swipe / TikTok navigation state
    const swipeTouchStart = useRef(null);
    const swipeTouchStartY = useRef(null);

    // Content tracking state
    const [favorites, setFavorites] = useState(new Set());
    const [playlists, setPlaylists] = useState([]);
    const [showPlaylistModal, setShowPlaylistModal] = useState(null); // video object
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [watchLater, setWatchLater] = useState(new Set());
    const [watchedVideos, setWatchedVideos] = useState(new Set()); // Videos watched 60+ seconds
    const [watchProgress, setWatchProgress] = useState(new Map()); // video_id → { watchedSeconds, watchedAt }
    const [recentlyWatched, setRecentlyWatched] = useState([]); // Recently watched videos
    const [watchStats, setWatchStats] = useState(null); // User's watch statistics
    const [showStats, setShowStats] = useState(false); // Stats modal visibility

    // ── Stage 2/3 Feature State ──────────────────────────────────────────────
    // Duration filter: 'ALL' | 'SHORT' (<15 min) | 'MEDIUM' (15-30) | 'LONG' (>30)
    const [selectedDuration, setSelectedDuration] = useState('ALL');
    // Share toast (copy-to-clipboard feedback)
    const [shareToast, setShareToast] = useState(null); // { message, videoId }
    const shareToastTimer = useRef(null);
    // YouTube error state for video library player
    const [vlYtError, setVlYtError] = useState(null); // YouTube embed error code (150=age-restricted)
    // "New This Week" rail dismiss state
    const [newThisWeekDismissed, setNewThisWeekDismissed] = useState(false);

    // Centralized YouTube error management for video library player
    const { ytError: vlYtManaged, thumbnailUrl: vlThumbnailUrl } = useYouTubeErrorManager({
        active: !!selectedVideo,
        videoId: selectedVideo?.videoId || null,
        surface: 'VideoLibrary',
        autoActionDelay: 3000,
        onError: () => {
            setVlYtError(null);
            setSelectedVideo(null);
        },
    });

    // Sync managed error to local state
    useEffect(() => {
        if (vlYtManaged) setVlYtError(vlYtManaged);
    }, [vlYtManaged]);

    
    // Infinite scroll observer
    const loadMoreRef = useRef(null);
    useEffect(() => {
        if (!loadMoreRef.current) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setDisplayedCount(prev => Math.min(prev + 30, videos.length));
            }
        }, { rootMargin: '400px' });
        observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [videos.length]);

    // Reset displayed count when filters change
    useEffect(() => {
        setDisplayedCount(30);
    }, [selectedSource, selectedType, selectedDuration, searchQuery]);

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

    //  INTRO VIDEO STATE - Video plays while page loads in background
    // Only show once per session (not on every reload)
    const [showIntro, setShowIntro] = useState(() => {
        if (typeof window !== 'undefined') {
            return !sessionStorage.getItem('video-library-intro-seen');
        }
        return false;
    });
    const introVideoRef = useRef(null);

    // Mark intro as seen when it ends
    const handleIntroEnd = useCallback(() => {
        sessionStorage.setItem('video-library-intro-seen', 'true');
        setShowIntro(false);
    }, []);

    // Attempt to unmute video after it starts playing
    const handleIntroPlay = useCallback(() => {
        if (introVideoRef.current) {
            introVideoRef.current.muted = false;
        }
    }, []);

    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 3 REALTIME: Video Library Updates
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!userId) return;

        const videoLibraryChannel = supabase
            .channel(`video-library:${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'user_video_watch_history',
                filter: `user_id=eq.${userId}`
            }, () => {
                // Reload watch stats and recently watched
                getWatchStats(userId).then(stats => setWatchStats(stats));
                getRecentlyWatched(userId, 10).then(recent => setRecentlyWatched(recent));
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
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);

        if (userId) {
            try {
                await updateVideoLibraryPreferences(userId, { [key]: value });
            } catch (error) {
                console.warn('Failed to save preference:', error);
            }
        }
    }, [preferences]);

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

    // Play a random video from the current filtered list
    const handlePlayRandom = useCallback(() => {
        if (videos.length === 0) return;
        const rand = videos[Math.floor(Math.random() * videos.length)];
        handleOpenVideo(rand);
    }, [videos, handleOpenVideo]);

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
        if (watchStartTimeRef.current && currentWatchingVideoRef.current && userId) {
            const watchedSeconds = Math.floor((Date.now() - watchStartTimeRef.current) / 1000);
            const video = currentWatchingVideoRef.current;

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

                    // Update recently watched
                    setRecentlyWatched(prev => {
                        const filtered = prev.filter(v => v.video_id !== video.id);
                        return [{
                            video_id: video.id,
                            video_title: video.title,
                            watch_duration_seconds: (watchProgress.get(video.id)?.watchedSeconds || 0) + watchedSeconds,
                            watched_at: new Date().toISOString()
                        }, ...filtered].slice(0, 10);
                    });

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
        }

        // Clear refs
        watchStartTimeRef.current = null;
        currentWatchingVideoRef.current = null;
        setSelectedVideo(null);
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
        // Duration filter
        if (selectedDuration !== 'ALL') {
            filtered = filtered.filter(v => {
                const secs = parseDuration(v.duration);
                if (selectedDuration === 'SHORT')  return secs > 0 && secs < 15 * 60;
                if (selectedDuration === 'MEDIUM') return secs >= 15 * 60 && secs <= 30 * 60;
                if (selectedDuration === 'LONG')   return secs > 30 * 60;
                return true;
            });
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(v =>
                v.title.toLowerCase().includes(q) ||
                v.source.toLowerCase().includes(q)
            );
        }
        filtered = filtered.sort((a, b) => {
            const aWatched = watchedVideos.has(a.id);
            const bWatched = watchedVideos.has(b.id);
            if (aWatched === bWatched) return 0;
            return aWatched ? 1 : -1;
        });
        setVideos(filtered);
    }, [selectedSource, selectedType, selectedDuration, searchQuery, watchedVideos, allVideos]);


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

    // Parse duration string (e.g., "18:34" or "1:23:45") to seconds
    const parseDuration = (durationStr) => {
        if (!durationStr) return 0;
        const parts = durationStr.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] || 0;
    };

    // Format seconds to readable time
    const formatTime = (seconds) => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    };

    // Get progress percentage for a video
    const getProgressPercent = (videoId, durationStr) => {
        const progress = watchProgress.get(videoId);
        if (!progress) return 0;
        const totalSeconds = parseDuration(durationStr);
        if (totalSeconds === 0) return 0;
        return Math.min(100, (progress.watchedSeconds / totalSeconds) * 100);
    };

    // "New This Week" — videos scraped in the past 7 days, sorted newest first
    const newThisWeek = allVideos
        .filter(v => {
            const scraped = v.scrapedAt || v.publishedAt;
            if (!scraped) return false;
            const age = (Date.now() - new Date(scraped).getTime()) / 1000;
            return age < 7 * 24 * 3600;
        })
        .sort((a, b) => new Date(b.scrapedAt || b.publishedAt) - new Date(a.scrapedAt || a.publishedAt))
        .slice(0, 20);

    // Cleanup share toast timer on unmount
    useEffect(() => () => { if (shareToastTimer.current) clearTimeout(shareToastTimer.current); }, []);

    // Cleanup interval on unmount
    useEffect(() => () => { if (timeTrackingInterval.current) clearInterval(timeTrackingInterval.current); }, []);

    return (
        <PageTransition>
            {/*  INTRO VIDEO OVERLAY - Plays while page loads behind it */}
            {showIntro && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 99999,
                    background: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <video
                        ref={introVideoRef}
                        src="/videos/video-library-intro.mp4"
                        autoPlay
                        muted
                        playsInline
                        onPlay={handleIntroPlay}
                        onEnded={handleIntroEnd}
                        onError={handleIntroEnd}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain'
                        }}
                    />
                    {/* Skip button */}
                    <button
                        onClick={handleIntroEnd}
                        style={{
                            position: 'absolute',
                            top: 20,
                            right: 20,
                            padding: '8px 20px',
                            background: 'rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 20,
                            color: 'white',
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: 'pointer',
                            zIndex: 100000
                        }}
                    >
                        Skip
                    </button>
                </div>
            )}
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
                                            ? 'linear-gradient(135deg, #FF3333 0%, #FF6B6B 100%)'
                                            : 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                                        border: isActive
                                            ? '1.5px solid rgba(255,100,100,0.7)'
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
                                            ? '0 0 16px rgba(255,60,60,0.35), 0 4px 12px rgba(0,0,0,0.4)'
                                            : '0 2px 8px rgba(0,0,0,0.3)',
                                        whiteSpace: 'nowrap',
                                    }}
                                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)'; e.currentTarget.style.transform = 'none'; } }}
                                >
                                    {type.name}
                                </button>
                            );
                        })}

                        {/* Reels Button — opens TikTok doom-scroll */}
                        <button
                            id="vl-reels-tab-btn"
                            onClick={() => setShowReelsModal(true)}
                            style={{
                                padding: '9px 22px',
                                background: 'linear-gradient(135deg, rgba(255,45,85,0.18) 0%, rgba(120,0,255,0.18) 100%)',
                                border: '1.5px solid rgba(255,45,85,0.45)',
                                borderRadius: 10,
                                color: '#FF2D55',
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: 'pointer',
                                letterSpacing: '0.3px',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                whiteSpace: 'nowrap',
                                boxShadow: '0 0 12px rgba(255,45,85,0.2), 0 2px 8px rgba(0,0,0,0.3)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,45,85,0.32) 0%, rgba(120,0,255,0.28) 100%)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(255,45,85,0.4), 0 4px 12px rgba(0,0,0,0.4)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,45,85,0.18) 0%, rgba(120,0,255,0.18) 100%)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 0 12px rgba(255,45,85,0.2), 0 2px 8px rgba(0,0,0,0.3)'; }}
                        >
                            <span style={{ fontSize: 15 }}>▶</span> Reels
                        </button>

                        {/* Play Random Button */}
                        <button
                            id="vl-play-random-btn"
                            onClick={handlePlayRandom}
                            className="metal-frame-sm"
                            style={{
                                padding: '10px 20px',
                                background: 'linear-gradient(135deg, rgba(255,180,0,0.2), rgba(255,120,0,0.2))',
                                border: '1px solid rgba(255,160,0,0.5)',
                                color: '#FFA500',
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                borderRadius: 10,
                                transition: 'all 0.2s',
                                letterSpacing: '0.3px',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,180,0,0.4), rgba(255,120,0,0.4))'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,180,0,0.2), rgba(255,120,0,0.2))'; e.currentTarget.style.transform = 'none'; }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
                            </svg>
                            Play Random
                        </button>

                        {/* Search Input */}
                        <div className="vl-search-wrap" style={{
                            position: 'relative',
                            width: 220,
                            marginLeft: 12,
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

                    {/* Duration filter row */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: 600, marginRight: 4, letterSpacing: '0.5px' }}>DURATION</span>
                        {[
                            { id: 'ALL',    name: 'Any Length' },
                            { id: 'SHORT',  name: '< 15 min' },
                            { id: 'MEDIUM', name: '15-30 min' },
                            { id: 'LONG',   name: '30+ min' },
                        ].map(dur => {
                            const isActive = selectedDuration === dur.id;
                            return (
                                <button
                                    key={dur.id}
                                    onClick={() => setSelectedDuration(dur.id)}
                                    style={{
                                        padding: '7px 16px',
                                        background: isActive ? 'rgba(10,132,255,0.25)' : 'rgba(255,255,255,0.04)',
                                        border: isActive ? '1.5px solid rgba(10,132,255,0.7)' : '1.5px solid rgba(255,255,255,0.1)',
                                        borderRadius: 8,
                                        color: isActive ? '#4DA8FF' : 'rgba(255,255,255,0.6)',
                                        fontSize: 12,
                                        fontWeight: isActive ? 700 : 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.18s',
                                        whiteSpace: 'nowrap',
                                    }}
                                >{dur.name}</button>
                            );
                        })}
                    </div>

                    {/* Premium Creator Cards */}
                    <div className="vl-source-pills" style={{
                        display: 'flex',
                        gap: 12,
                        overflowX: 'auto',
                        padding: '8px 4px 12px',
                        scrollbarWidth: 'none',
                    }}>
                        {SOURCES.filter(source => source.id !== 'ALL').map(source => {
                            const isActive = selectedSource === source.id;
                            const initials = source.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
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
                                    {/* Logo ring — glows red when active */}
                                    <div style={{
                                        width: 70,
                                        height: 70,
                                        borderRadius: 18,
                                        padding: 2.5,
                                        background: isActive
                                            ? 'linear-gradient(135deg, #FF2222 0%, #FF8C00 50%, #FF2222 100%)'
                                            : 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(100,115,135,0.3) 100%)',
                                        boxShadow: isActive
                                            ? '0 0 24px rgba(255,50,50,0.6), 0 0 10px rgba(255,50,50,0.3), 0 8px 24px rgba(0,0,0,0.7)'
                                            : '0 4px 18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
                                        transition: 'all 0.25s ease',
                                    }}>
                                        <div style={{
                                            width: '100%',
                                            height: '100%',
                                            borderRadius: 15,
                                            background: isActive
                                                ? 'linear-gradient(160deg, #1c0808 0%, #2e0a0a 100%)'
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
                                                        width: '80%',
                                                        height: '80%',
                                                        objectFit: 'contain',
                                                        filter: isActive
                                                            ? 'brightness(1.2) drop-shadow(0 0 8px rgba(255,80,80,0.7))'
                                                            : 'brightness(0.85) saturate(0.9)',
                                                        transition: 'filter 0.25s',
                                                    }}
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <span style={{
                                                    fontSize: 17,
                                                    fontWeight: 800,
                                                    color: isActive ? '#FF6060' : 'rgba(190,205,225,0.7)',
                                                    letterSpacing: '-0.5px',
                                                    fontFamily: "'Inter', system-ui, sans-serif",
                                                    textShadow: isActive ? '0 0 14px rgba(255,80,80,0.9)' : 'none',
                                                    transition: 'all 0.25s',
                                                }}>{initials}</span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Name plate */}
                                    <div style={{
                                        width: 72,
                                        textAlign: 'center',
                                        fontSize: 9.5,
                                        fontWeight: isActive ? 700 : 500,
                                        color: isActive ? '#FF7575' : 'rgba(185,200,220,0.6)',
                                        letterSpacing: '0.15px',
                                        lineHeight: 1.3,
                                        textShadow: isActive ? '0 0 10px rgba(255,80,80,0.6)' : 'none',
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
                                            background: '#FF4444',
                                            boxShadow: '0 0 8px rgba(255,68,68,0.9)',
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
                            <span style={{ color: '#FF4444' }}>▶</span> Continue Watching
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
                                                background: 'rgba(255,68,68,0.95)',
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
                                                    background: '#FF4444',
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
                                <span style={{ color: '#FF4444', fontSize: 14, background: 'rgba(255,68,68,0.2)', border: '1px solid rgba(255,68,68,0.4)', borderRadius: 6, padding: '2px 8px', fontWeight: 700, letterSpacing: '0.5px' }}>NEW</span>
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
                                        <div style={{ position: 'absolute', top: 6, left: 6, background: '#FF4444', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.5px' }}>NEW</div>
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
                    {videos.slice(0, displayedCount).map(video => (
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
                                            background: '#FF4444',
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
                                    background: 'rgba(255,68,68,0.9)',
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
                                        background: 'rgba(255,68,68,0.15)',
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
                {videos.length === 0 && (
                    <div style={{
                        textAlign: 'center',
                        padding: '80px 20px',
                        color: C.textSec,
                    }}>
                        <div style={{ fontSize: 64, marginBottom: 16 }}></div>
                        <h3 style={{ color: C.text, marginBottom: 8 }}>No Videos Found</h3>
                        <p>Try Adjusting Your Search Or Filter</p>
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
                    /* Touch-swipe for TikTok-style navigation */
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
                    {/* Close button */}
                    <button
                        onClick={handleCloseVideo}
                        className="vl-modal-close"
                        style={{
                            position: 'absolute',
                            top: 16,
                            right: 16,
                            width: 48,
                            height: 48,
                            background: 'rgba(255,255,255,0.18)',
                            border: 'none',
                            borderRadius: '50%',
                            color: 'white',
                            fontSize: 24,
                            cursor: 'pointer',
                            zIndex: 1001,
                            backdropFilter: 'blur(10px)',
                        }}
                    >×</button>

                    {/* Fullscreen button */}
                    <button
                        onClick={handleFullscreen}
                        title="Fullscreen (F)"
                        style={{
                            position: 'absolute',
                            top: 16,
                            right: 76,
                            width: 48,
                            height: 48,
                            background: 'rgba(255,255,255,0.18)',
                            border: 'none',
                            borderRadius: '50%',
                            color: 'white',
                            cursor: 'pointer',
                            zIndex: 1001,
                            backdropFilter: 'blur(10px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                        </svg>
                    </button>

                    {/* Prev / Next navigation arrows */}
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

                    {/* Fullscreen YouTube embed with IFrame API for time tracking */}
                    <div style={{
                        flex: 1,
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                    }}>
                        <iframe
                            key={iframeKey}
                            id="youtube-player"
                            src={`https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=1&mute=0&rel=0&modestbranding=1&fs=1&iv_load_policy=3&showinfo=0&enablejsapi=1&playsinline=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}`}
                            title={selectedVideo.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                            allowFullScreen
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                            }}
                        />
                        {/* YouTube Error Overlay */}
                        {vlYtError && (
                            <YouTubeErrorOverlay
                                errorCode={vlYtError}
                                videoId={selectedVideo.videoId}
                                thumbnailUrl={vlThumbnailUrl}
                                actionLabel="Closing in 3 seconds..."
                            />
                        )}
                    </div>


                    {/* Video info bar at bottom */}
                    <div style={{
                        padding: '16px 24px',
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.95))',
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                    }}>
                        <h2 style={{
                            color: 'white',
                            fontSize: 18,
                            fontWeight: 700,
                            margin: 0,
                            marginBottom: 8,
                        }}>
                            {selectedVideo.title}
                        </h2>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                        }}>
                            <span style={{
                                color: C.accent,
                                fontSize: 13,
                                fontWeight: 600,
                                background: 'rgba(255,68,68,0.2)',
                                padding: '6px 14px',
                                borderRadius: 12,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}>
                                {SOURCES.find(s => s.id === selectedVideo.source)?.logo && (
                                    <div style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 8,
                                        background: 'rgba(255, 255, 255, 0.12)',
                                        backdropFilter: 'blur(8px)',
                                        border: '1px solid rgba(255, 255, 255, 0.18)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 4,
                                        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.25)',
                                    }}>
                                        <img
                                            src={SOURCES.find(s => s.id === selectedVideo.source)?.logo}
                                            alt=""
                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                        />
                                    </div>
                                )}
                                {selectedVideo.source.replace('_', ' ')}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                                {selectedVideo.views} views
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                                {selectedVideo.duration}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* CSS */}
            <style>{`
                div:hover .play-btn {
                    opacity: 1 !important;
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
                }} onClick={() => setShowPlaylistModal(null)}>
                    <div style={{
                        background: '#1C1C1E', padding: 24, borderRadius: 16, width: '90%', maxWidth: 400,
                        border: '1px solid #333'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginTop: 0, color: 'white' }}>Save to Playlist</h3>
                        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
                            {playlists.map(p => {
                                const inPlaylist = p.items?.some(i => i.video_id === showPlaylistModal.videoId);
                                return (
                                    <div key={p.id} style={{
                                        padding: '12px 0', borderBottom: '1px solid #333',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <span style={{ color: 'white' }}>{p.name}</span>
                                        <button onClick={async () => {
                                            if (inPlaylist) {
                                                await removeVideoFromPlaylist(p.id, showPlaylistModal.videoId);
                                            } else {
                                                await addVideoToPlaylist(p.id, showPlaylistModal.videoId, showPlaylistModal.title, showPlaylistModal.source);
                                            }
                                            getVideoPlaylists(userId).then(setPlaylists);
                                        }} style={{
                                            background: inPlaylist ? '#FF453A' : '#0A84FF',
                                            color: 'white', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer'
                                        }}>
                                            {inPlaylist ? 'Remove' : 'Add'}
                                        </button>
                                    </div>
                                );
                            })}
                            {playlists.length === 0 && <div style={{ color: '#888', padding: '12px 0' }}>No playlists yet.</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input 
                                value={newPlaylistName}
                                onChange={e => setNewPlaylistName(e.target.value)}
                                placeholder="New playlist name"
                                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: '#000', border: '1px solid #333', color: 'white' }}
                            />
                            <button onClick={async () => {
                                if (!newPlaylistName.trim()) return;
                                const p = await createPlaylist(userId, newPlaylistName);
                                await addVideoToPlaylist(p.id, showPlaylistModal.videoId, showPlaylistModal.title, showPlaylistModal.source);
                                setNewPlaylistName('');
                                getVideoPlaylists(userId).then(setPlaylists);
                            }} style={{
                                background: 'white', color: 'black', border: 'none', borderRadius: 8, padding: '0 16px', fontWeight: 'bold', cursor: 'pointer'
                            }}>Create</button>
                        </div>
                    </div>
                </div>
            )}

        </PageTransition>
    );
}
