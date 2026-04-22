/**
 * VIDEO LIBRARY - Full Poker Videos from Global Livestreams
 * Browse and watch complete hands from HCL, The Lodge, Triton, and more
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';
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
import { getAccessToken } from '../../src/lib/authUtils';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

// Static fallback catalog — used until DB fetch resolves
import {
    FULL_VIDEOS as STATIC_VIDEOS,
    SOURCES
} from '../../src/data/videoLibraryData';

/** Normalise a DB video_library_videos row to match the FULL_VIDEOS shape */
function normaliseDbVideo(row) {
    return {
        id: row.youtube_video_id,          // use yt ID as local key
        videoId: row.youtube_video_id,
        source: row.source_id,
        type: row.type,
        title: row.title,
        views: row.views_text || '0',
        duration: row.duration || '',
        thumbnail: row.thumbnail_url,
        publishedAt: row.published_at,
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
    const selectedCategory = useVideoLibraryStore((s) => s.selectedCategory);
    const setSelectedCategory = useVideoLibraryStore((s) => s.setSelectedCategory);
    const selectedVideo = useVideoLibraryStore((s) => s.selectedVideo);
    const setSelectedVideo = useVideoLibraryStore((s) => s.setSelectedVideo);
    const showPlayer = useVideoLibraryStore((s) => s.showPlayer);
    const setShowPlayer = useVideoLibraryStore((s) => s.setShowPlayer);

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
    const [allVideos, setAllVideos] = useState(STATIC_VIDEOS); // unfiltered master list
    const [dbLoaded, setDbLoaded] = useState(false);

    // Fetch live videos from Supabase (replaces / extends static list)
    useEffect(() => {
        let cancelled = false;
        supabase
            .from('video_library_videos')
            .select('youtube_video_id, source_id, source_name, type, title, thumbnail_url, views_text, duration, published_at')
            .order('published_at', { ascending: false })
            .limit(500)
            .then(({ data, error }) => {
                if (cancelled || error || !data || data.length === 0) return;
                // Merge DB rows with static data; DB rows take precedence by youtube_video_id
                const dbVideos = data.map(normaliseDbVideo);
                const dbIds = new Set(dbVideos.map(v => v.videoId));
                const staticOnly = STATIC_VIDEOS.filter(v => !dbIds.has(v.videoId));
                const merged = [...dbVideos, ...staticOnly];
                setAllVideos(merged);
                setVideos(merged);
                setDbLoaded(true);
            });
        return () => { cancelled = true; };
    }, []);


    // Handle query parameters for deep linking
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
    }, [router.query]);
    const [searchQuery, setSearchQuery] = useState('');
    const modalRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);

    // Content tracking state
    const [favorites, setFavorites] = useState(new Set());
    const [watchLater, setWatchLater] = useState(new Set());
    const [watchedVideos, setWatchedVideos] = useState(new Set()); // Videos watched 60+ seconds
    const [watchProgress, setWatchProgress] = useState(new Map()); // video_id -> { watchedSeconds, watchedAt }
    const [recentlyWatched, setRecentlyWatched] = useState([]); // Recently watched videos
    const [watchStats, setWatchStats] = useState(null); // User's watch statistics
    const [showStats, setShowStats] = useState(false); // Stats modal visibility

    // Jarvis Insights state - Timestamp-synced contextual commentary
    const [aiAnalysis, setAiAnalysis] = useState(null); // Current video AI analysis
    const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
    const [aiAnalysisSource, setAiAnalysisSource] = useState(null); // 'cache' or 'generated'
    const [showAiPanel, setShowAiPanel] = useState(false); // Toggle AI panel visibility
    const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false); // Mobile bottom sheet expanded state
    const [currentVideoTime, setCurrentVideoTime] = useState(0); // Current playback position in seconds
    const [activeInsight, setActiveInsight] = useState(null); // Current insight being displayed
    const [insightHistory, setInsightHistory] = useState([]); // Past insights shown
    const ytPlayerRef = useRef(null); // YouTube player instance
    const timeTrackingInterval = useRef(null); // Interval for tracking video time

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
                table: 'user_video_favorites',
                filter: `user_id=eq.${userId}`
            }, () => {
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

    // Handle opening a video - start timer (Jarvis is now on-demand)
    const handleOpenVideo = useCallback(async (video) => {
        watchStartTimeRef.current = Date.now();
        currentWatchingVideoRef.current = video;
        setSelectedVideo(video);
        setShowAiPanel(false);
        setAiAnalysis(null); // Reset for new video
        setAiAnalysisSource(null);
    }, []);

    // Handle Jarvis button click - fetch analysis ON DEMAND only
    const handleJarvisClick = useCallback(async () => {
        const controller = new AbortController();
        const { signal } = controller;
        if (!selectedVideo) return;

        // Toggle panel
        if (showAiPanel) {
            setShowAiPanel(false);
            return;
        }

        setShowAiPanel(true);

        // Only fetch if we don't already have analysis for this video
        if (aiAnalysis) return;

        setAiAnalysisLoading(true);
        try {
            const token = getAccessToken();
            const response = await fetch(`/api/video/analyze?videoId=${selectedVideo.videoId}&title=${encodeURIComponent(selectedVideo.title)}`, {
                signal,
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const data = await response.json();
            if (data.success && data.analysis) {
                setAiAnalysis(data.analysis);
                setAiAnalysisSource(data.source || 'generated');
            }
        } catch (err) {
            console.warn('Failed to fetch AI analysis:', err);
        } finally {
            setAiAnalysisLoading(false);
        }
    }, [selectedVideo, showAiPanel, aiAnalysis]);

    // Handle closing a video - save watch duration
    const handleCloseVideo = useCallback(async () => {
        const controller = new AbortController();
        const { signal } = controller;
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
                    const totalWatched = (watchProgress.get(video.id)?.watchedSeconds || 0) + watchedSeconds;
                    if (totalWatched >= 30) {
                        setWatchedVideos(prev => new Set(prev).add(video.id));
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
    }, [userId, watchProgress]);

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
    }, [selectedSource, selectedType, searchQuery, watchedVideos, allVideos]);


    // Close modal on escape
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') handleCloseVideo();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

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

    // Parse timestamp string (e.g., "5:15" or "1:23:45") to seconds for AI insights
    const parseTimestampToSeconds = (timestamp) => {
        if (!timestamp) return 0;
        const parts = timestamp.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] || 0;
    };

    // Get all timed insights from the analysis, sorted by timestamp
    const getTimedInsights = useCallback(() => {
        if (!aiAnalysis) return [];
        const insights = [];

        // Add chapters as insights
        if (aiAnalysis.chapters) {
            aiAnalysis.chapters.forEach((ch, idx) => {
                insights.push({
                    type: 'chapter',
                    timestamp: ch.timestamp,
                    seconds: parseTimestampToSeconds(ch.timestamp),
                    title: ch.title,
                    description: ch.description,
                    id: `chapter-${idx}`
                });
            });
        }

        // Add key hands as insights
        if (aiAnalysis.keyHands) {
            aiAnalysis.keyHands.forEach((hand, idx) => {
                insights.push({
                    type: 'keyHand',
                    timestamp: hand.timestamp,
                    seconds: parseTimestampToSeconds(hand.timestamp),
                    title: hand.title,
                    situation: hand.situation,
                    analysis: hand.analysis,
                    result: hand.result,
                    id: `hand-${idx}`
                });
            });
        }

        // Sort by timestamp
        return insights.sort((a, b) => a.seconds - b.seconds);
    }, [aiAnalysis]);

    // Find the current insight based on video time
    const findCurrentInsight = useCallback((currentTime) => {
        const insights = getTimedInsights();
        if (insights.length === 0) return null;

        // Find the latest insight that has passed but is within 30 seconds of its timestamp
        // This creates a "window" where the insight is shown
        for (let i = insights.length - 1; i >= 0; i--) {
            const insight = insights[i];
            const timeSinceInsight = currentTime - insight.seconds;
            // Show insight if we're within 0-60 seconds past its timestamp
            if (timeSinceInsight >= 0 && timeSinceInsight <= 60) {
                return insight;
            }
        }
        return null;
    }, [getTimedInsights]);

    // Track video time and update active insight when AI panel is open
    useEffect(() => {
        if (!showAiPanel || !aiAnalysis) {
            if (timeTrackingInterval.current) {
                clearInterval(timeTrackingInterval.current);
                timeTrackingInterval.current = null;
            }
            return;
        }

        // Poll for current time (YouTube postMessage API fallback)
        timeTrackingInterval.current = setInterval(() => {
            if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
                const time = ytPlayerRef.current.getCurrentTime();
                setCurrentVideoTime(time);

                const newInsight = findCurrentInsight(time);
                if (newInsight && (!activeInsight || newInsight.id !== activeInsight.id)) {
                    // New insight found - update and add previous to history
                    if (activeInsight) {
                        setInsightHistory(prev => [...prev, activeInsight].slice(-5)); // Keep last 5
                    }
                    setActiveInsight(newInsight);
                }
            }
        }, 1000);

        return () => {
            if (timeTrackingInterval.current) {
                clearInterval(timeTrackingInterval.current);
            }
            // Clean up message listener added in iframe onLoad
            if (ytPlayerRef.current?.messageHandler) {
                window.removeEventListener('message', ytPlayerRef.current.messageHandler);
                ytPlayerRef.current.messageHandler = null;
            }
        };
    }, [showAiPanel, aiAnalysis, findCurrentInsight, activeInsight]);

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
                        gap: 12,
                        marginBottom: 16,
                        justifyContent: 'center',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                    }}>
                        {[
                            { id: 'cash', name: 'Cash Games', icon: '' },
                            { id: 'ALL', name: 'All Videos', icon: '' },
                            { id: 'tournament', name: 'Tournaments', icon: '' },
                        ].map(type => (
                            <button
                                key={type.id}
                                onClick={() => setSelectedType(type.id)}
                                className="metal-frame-sm"
                                style={{
                                    padding: '10px 20px',
                                    background: selectedType === type.id
                                        ? 'linear-gradient(135deg, #FF4444, #FF6B6B)'
                                        : 'transparent',
                                    border: 'none',
                                    color: C.text,
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    transform: selectedType === type.id ? 'translateY(-2px)' : 'none',
                                }}
                                onMouseEnter={(e) => {
                                    if (selectedType !== type.id) {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (selectedType !== type.id) {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                        e.currentTarget.style.transform = 'none';
                                    }
                                }}
                            >
                                <span style={{ fontSize: 20 }}>{type.icon}</span>
                                {type.name}
                            </button>
                        ))}

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

                    {/* Source filter pills */}
                    <div className="vl-source-pills" style={{
                        display: 'flex',
                        gap: 10,
                        overflowX: 'auto',
                        padding: '8px 0',
                    }}>
                        {SOURCES.filter(source => source.id !== 'ALL').map(source => (
                            <button
                                key={source.id}
                                onClick={() => setSelectedSource(source.id)}
                                style={{
                                    padding: '10px 18px',
                                    background: selectedSource === source.id
                                        ? 'linear-gradient(135deg, #FF4444, #FF6B6B)'
                                        : '#0a0a0a',
                                    border: 'none',
                                    borderRadius: 24,
                                    color: C.text,
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    transition: 'all 0.2s',
                                    boxShadow: selectedSource === source.id
                                        ? '0 0 0 2px rgba(255, 68, 68, 0.6), 0 4px 16px rgba(255, 68, 68, 0.3)'
                                        : '0 0 0 2px rgba(160, 170, 180, 0.7), 0 0 0 3px rgba(80, 90, 100, 0.5), 0 4px 12px rgba(0, 0, 0, 0.4)',
                                }}
                            >
                                {source.logo && (
                                    <div style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 10,
                                        background: 'rgba(255, 255, 255, 0.08)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 4,
                                    }}>
                                        <img src={source.logo} alt={source.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" />
                                    </div>
                                )}
                                {source.name}
                            </button>
                        ))}
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

                {/* Video Grid */}
                <div className="vl-video-grid" style={{
                    maxWidth: 1400,
                    margin: '0 auto',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: 20,
                }}>
                    {videos.map(video => (
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
                                {/* Watched badge */}
                                {watchedVideos.has(video.id) && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 8,
                                        left: 8,
                                        background: 'rgba(0, 200, 83, 0.9)',
                                        padding: '4px 10px',
                                        borderRadius: 12,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                    }}>
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
                                    <span style={{
                                        color: C.textSec,
                                        fontSize: 13,
                                    }}>
                                        {video.views} views
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

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
                    onClick={(e) => {
                        if (e.target === e.currentTarget) handleCloseVideo();
                    }}
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
                >
                    {/* Close button - always visible */}
                    <button
                        onClick={handleCloseVideo}
                        className="vl-modal-close"
                        style={{
                            position: 'absolute',
                            top: 16,
                            right: 16,
                            width: 48,
                            height: 48,
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            borderRadius: '50%',
                            color: 'white',
                            fontSize: 24,
                            cursor: 'pointer',
                            zIndex: 1001,
                            backdropFilter: 'blur(10px)',
                        }}
                    >×</button>

                    {/* Jarvis Insights button - ON DEMAND analysis */}
                    <button
                        onClick={handleJarvisClick}
                        className="jarvis-button"
                        style={{
                            position: 'absolute',
                            top: 16,
                            right: 80,
                            height: 46,
                            padding: '0 18px',
                            background: showAiPanel
                                ? 'linear-gradient(135deg, #00D4FF 0%, #0099CC 50%, #7B2CBF 100%)'
                                : 'linear-gradient(135deg, rgba(0,212,255,0.25) 0%, rgba(123,44,191,0.25) 100%)',
                            border: '1px solid rgba(0,212,255,0.5)',
                            borderRadius: 23,
                            color: 'white',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            zIndex: 1001,
                            backdropFilter: 'blur(12px)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: showAiPanel
                                ? '0 0 20px rgba(0,212,255,0.4), 0 4px 15px rgba(0,0,0,0.3)'
                                : '0 4px 15px rgba(0,0,0,0.3)',
                            letterSpacing: '0.3px',
                        }}
                    >
                        <div style={{
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(0,212,255,0.3) 0%, rgba(123,44,191,0.3) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid rgba(255,255,255,0.2)',
                        }}>
                            <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
                        </div>
                        {aiAnalysisLoading ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: '#00D4FF',
                                    animation: 'pulse 1s infinite'
                                }} />
                                Loading...
                            </span>
                        ) : aiAnalysis && aiAnalysisSource === 'cache' ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                Jarvis Insights
                                <span style={{
                                    fontSize: 9,
                                    background: 'rgba(0,200,83,0.3)',
                                    color: '#00C853',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    fontWeight: 600
                                }}>CACHED</span>
                            </span>
                        ) : 'Jarvis Insights'}
                    </button>

                    {/* Fullscreen YouTube embed with IFrame API for time tracking */}
                    <div style={{
                        flex: 1,
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                    }}>
                        <iframe
                            id="youtube-player"
                            src={`https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=1&rel=0&modestbranding=1&fs=1&iv_load_policy=3&showinfo=0&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                            title={selectedVideo.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                            allowFullScreen
                            ref={(el) => {
                                // Setup time tracking using postMessage API
                                if (el && !ytPlayerRef.current) {
                                    ytPlayerRef.current = {
                                        iframe: el,
                                        getCurrentTime: () => currentVideoTime,
                                    };

                                    // Listen for messages from YouTube player
                                    const handleMessage = (event) => {
                                        if (event.origin !== 'https://www.youtube.com') return;
                                        try {
                                            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                                            if (data.info && typeof data.info.currentTime === 'number') {
                                                setCurrentVideoTime(data.info.currentTime);
                                            }
                                        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                                    };
                                    window.addEventListener('message', handleMessage);
                                    ytPlayerRef.current.messageHandler = handleMessage; // store for cleanup

                                    // Request current time every second when panel is open
                                    const requestTime = () => {
                                        if (el && el.contentWindow) {
                                            el.contentWindow.postMessage(JSON.stringify({
                                                event: 'listening',
                                                id: 1,
                                                channel: 'widget'
                                            }), '*');
                                            el.contentWindow.postMessage(JSON.stringify({
                                                event: 'command',
                                                func: 'getCurrentTime',
                                                args: []
                                            }), '*');
                                        }
                                    };

                                    // Start polling when AI panel opens
                                    if (showAiPanel) {
                                        const pollInterval = setInterval(requestTime, 1000);
                                        ytPlayerRef.current.pollInterval = pollInterval;
                                    }
                                }
                            }}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                            }}
                        />

                        {/* Jarvis Caption-Style Insight Overlay - appears at bottom like subtitles */}
                        {showAiPanel && activeInsight && (
                            <div style={{
                                position: 'absolute',
                                bottom: 60,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                maxWidth: '90%',
                                width: 'auto',
                                minWidth: 300,
                                background: 'rgba(0, 0, 0, 0.85)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: 12,
                                padding: '12px 16px',
                                paddingRight: 40,
                                color: 'white',
                                zIndex: 1005,
                                animation: 'fadeInUp 0.3s ease',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 1px rgba(0,212,255,0.5)',
                                border: '1px solid rgba(0,212,255,0.3)',
                            }}>
                                {/* Dismiss X button */}
                                <button
                                    onClick={() => setActiveInsight(null)}
                                    style={{
                                        position: 'absolute',
                                        top: 8,
                                        right: 8,
                                        width: 24,
                                        height: 24,
                                        background: 'rgba(255,255,255,0.1)',
                                        border: 'none',
                                        borderRadius: '50%',
                                        color: 'rgba(255,255,255,0.7)',
                                        fontSize: 14,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >×</button>

                                {/* Jarvis icon + insight content */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                    <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: '50%',
                                        border: '2px solid rgba(0,212,255,0.5)',
                                        flexShrink: 0,
                                    }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* Timestamp + Type */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <span style={{
                                                color: '#00D4FF',
                                                fontSize: 11,
                                                fontWeight: 700,
                                                background: 'rgba(0,212,255,0.2)',
                                                padding: '2px 6px',
                                                borderRadius: 4,
                                            }}>{activeInsight.timestamp}</span>
                                            <span style={{
                                                color: 'rgba(255,255,255,0.5)',
                                                fontSize: 10,
                                                textTransform: 'uppercase',
                                            }}>
                                                {activeInsight.type === 'keyHand' ? 'Key Hand' : 'Chapter'}
                                            </span>
                                        </div>
                                        {/* Title */}
                                        <p style={{
                                            color: 'white',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            margin: 0,
                                            marginBottom: activeInsight.analysis ? 6 : 0,
                                        }}>
                                            {activeInsight.title}
                                        </p>
                                        {/* Analysis/Description */}
                                        {activeInsight.analysis && (
                                            <p style={{
                                                color: 'rgba(255,255,255,0.8)',
                                                fontSize: 12,
                                                margin: 0,
                                                lineHeight: 1.4,
                                            }}>
                                                {activeInsight.analysis}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Loading indicator when fetching analysis */}
                        {showAiPanel && aiAnalysisLoading && (
                            <div style={{
                                position: 'absolute',
                                bottom: 60,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0, 0, 0, 0.85)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: 12,
                                padding: '16px 24px',
                                color: 'white',
                                zIndex: 1005,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                            }}>
                                <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: '50%',
                                    animation: 'pulse 1s infinite',
                                }} />
                                <span style={{ fontSize: 13 }}>Jarvis Analyzing Video...</span>
                            </div>
                        )}

                        {/* Initial prompt when panel opens but no active insight yet */}
                        {showAiPanel && aiAnalysis && !activeInsight && !aiAnalysisLoading && (
                            <div style={{
                                position: 'absolute',
                                bottom: 60,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0, 0, 0, 0.85)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: 12,
                                padding: '12px 20px',
                                paddingRight: 40,
                                color: 'white',
                                zIndex: 1005,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                                border: '1px solid rgba(0,212,255,0.2)',
                            }}>
                                <button
                                    onClick={() => setShowAiPanel(false)}
                                    style={{
                                        position: 'absolute',
                                        top: 8,
                                        right: 8,
                                        width: 24,
                                        height: 24,
                                        background: 'rgba(255,255,255,0.1)',
                                        border: 'none',
                                        borderRadius: '50%',
                                        color: 'rgba(255,255,255,0.7)',
                                        fontSize: 14,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >×</button>
                                <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{ width: 28, height: 28, borderRadius: '50%' }} />
                                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                                    Insights will appear at key moments...
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Jarvis Insights Bottom Sheet / Side Panel (Responsive) - Futuristic Metal UI */}                    {/* OLD PANEL - HIDDEN (replaced by caption overlay below) */}
                    <div
                        className="jarvis-panel"
                        style={{
                            display: 'none', /* HIDDEN - replaced by caption overlay */
                            position: 'absolute',
                            /* Desktop: Side panel from right */
                            /* Mobile: Bottom sheet from bottom */
                            /* METAL UI: Brushed steel gradient with depth */
                            background: 'linear-gradient(180deg, #1a2332 0%, #0d1520 50%, #0a0a15 100%)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                            zIndex: 1002,
                            overflowY: 'auto',
                            /* METAL UI: 5-layer neon glow stack */
                            boxShadow: `
                                -10px 0 50px rgba(0, 0, 0, 0.7),
                                inset 0 0 80px rgba(0, 212, 255, 0.03),
                                0 0 1px rgba(255, 255, 255, 0.8),
                                0 0 10px rgba(0, 212, 255, 0.4),
                                0 0 20px rgba(0, 212, 255, 0.2)
                            `,
                            /* METAL UI: Hard cyan border */
                            borderLeft: '3px solid #00d4ff',
                        }}
                    >
                        {/* Drag Handle (Mobile Only) */}
                        <div
                            className="jarvis-drag-handle"
                            onClick={() => setBottomSheetExpanded(!bottomSheetExpanded)}
                            style={{
                                width: '100%',
                                padding: '12px 0 8px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <div style={{
                                width: 40,
                                height: 4,
                                background: 'rgba(255,255,255,0.3)',
                                borderRadius: 2,
                            }} />
                            {/* Collapsed Preview (Mobile) */}
                            <div className="jarvis-collapsed-preview" style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                width: '100%',
                                padding: '0 16px',
                            }}>
                                <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{ width: 28, height: 28, borderRadius: '50%' }} />
                                <div style={{ flex: 1 }}>
                                    <span style={{ color: '#00D4FF', fontSize: 13, fontWeight: 600 }}>Jarvis Insights</span>
                                    {activeInsight && (
                                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {activeInsight.title}
                                        </p>
                                    )}
                                </div>
                                <div style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    background: 'rgba(0,212,255,0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 12,
                                    color: '#00D4FF',
                                    transform: bottomSheetExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.3s ease',
                                }}>▲</div>
                            </div>
                        </div>

                        {/* Panel Content */}
                        <div className="jarvis-panel-content" style={{ padding: '0 20px 24px' }}>
                            {/* Panel Header (Desktop) - METAL UI Style */}
                            <div className="jarvis-desktop-header" style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 16,
                                paddingBottom: 16,
                                borderBottom: '1px solid #2a3a4a',
                                position: 'relative',
                            }}>
                                {/* LED Strip under header */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    height: 2,
                                    background: 'linear-gradient(90deg, transparent 0%, #00d4ff 20%, #00d4ff 80%, transparent 100%)',
                                    boxShadow: '0 0 10px rgba(0, 212, 255, 0.5), 0 0 20px rgba(0, 212, 255, 0.3)',
                                }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {/* Porthole-style avatar */}
                                    <div style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: '50%',
                                        background: 'linear-gradient(180deg, #2a3a4a 0%, #1a2332 100%)',
                                        border: '2px solid #00d4ff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 0 10px rgba(0, 212, 255, 0.4), inset 0 2px 4px rgba(0,0,0,0.5)',
                                    }}>
                                        <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                                    </div>
                                    <div>
                                        <h3 style={{
                                            color: '#00D4FF',
                                            fontSize: 14,
                                            fontWeight: 700,
                                            margin: 0,
                                            textTransform: 'uppercase',
                                            letterSpacing: '2px',
                                            textShadow: '0 0 10px rgba(0, 212, 255, 0.5)',
                                        }}>
                                            JARVIS INSIGHTS
                                        </h3>
                                        <p style={{
                                            color: '#4a5a6a',
                                            fontSize: 10,
                                            margin: 0,
                                            marginTop: 2,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                        }}>
                                            LIVE ANALYSIS
                                        </p>
                                    </div>
                                </div>
                                {/* Industrial close button */}
                                <button
                                    onClick={() => setShowAiPanel(false)}
                                    style={{
                                        background: 'linear-gradient(180deg, #2a3a4a 0%, #1a2332 100%)',
                                        border: '2px solid #4a5a6a',
                                        borderRadius: 6,
                                        width: 32,
                                        height: 32,
                                        color: '#4a5a6a',
                                        cursor: 'pointer',
                                        fontSize: 18,
                                        fontWeight: 700,
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.borderColor = '#00d4ff';
                                        e.target.style.color = '#00d4ff';
                                        e.target.style.boxShadow = '0 0 10px rgba(0, 212, 255, 0.4)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.borderColor = '#4a5a6a';
                                        e.target.style.color = '#4a5a6a';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                >×</button>
                            </div>

                            {aiAnalysisLoading ? (
                                <div style={{ textAlign: 'center', padding: 40 }}>
                                    {/* Animated Jarvis avatar */}
                                    <div style={{
                                        width: 64,
                                        height: 64,
                                        margin: '0 auto 20px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, rgba(0,212,255,0.2) 0%, rgba(0,212,255,0.05) 100%)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        animation: 'pulse 2s ease-in-out infinite',
                                    }}>
                                        <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: '50%',
                                            objectFit: 'cover'
                                        }} />
                                    </div>
                                    <p style={{
                                        color: '#00D4FF',
                                        fontSize: 14,
                                        fontWeight: 600,
                                        marginBottom: 8
                                    }}>Analyzing Video...</p>
                                    <p style={{
                                        color: 'rgba(255,255,255,0.5)',
                                        fontSize: 12
                                    }}>Preparing Strategic Insights</p>
                                    {/* Shimmer loading bars */}
                                    <div style={{ marginTop: 24 }}>
                                        {[1, 0.8, 0.6].map((w, i) => (
                                            <div key={i} style={{
                                                height: 12,
                                                width: `${w * 100}%`,
                                                background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(0,212,255,0.15) 50%, rgba(255,255,255,0.05) 100%)',
                                                backgroundSize: '200% 100%',
                                                animation: 'shimmer 1.5s infinite',
                                                borderRadius: 6,
                                                marginBottom: 8,
                                                marginLeft: 'auto',
                                                marginRight: 'auto',
                                            }} />
                                        ))}
                                    </div>
                                </div>
                            ) : aiAnalysis ? (
                                <>
                                    {/* Current Active Insight */}
                                    {activeInsight ? (
                                        <div style={{
                                            padding: '16px',
                                            background: activeInsight.type === 'keyHand'
                                                ? 'linear-gradient(135deg, rgba(255, 68, 68, 0.15) 0%, rgba(255, 68, 68, 0.05) 100%)'
                                                : 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 212, 255, 0.05) 100%)',
                                            borderRadius: 12,
                                            borderLeft: `4px solid ${activeInsight.type === 'keyHand' ? '#FF4444' : '#00D4FF'}`,
                                            marginBottom: 20,
                                            animation: 'slideIn 0.4s ease',
                                        }}>
                                            {/* Insight Header */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                                <span style={{
                                                    color: activeInsight.type === 'keyHand' ? '#FF4444' : '#00D4FF',
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    background: activeInsight.type === 'keyHand'
                                                        ? 'rgba(255, 68, 68, 0.3)'
                                                        : 'rgba(0, 212, 255, 0.3)',
                                                    padding: '4px 10px',
                                                    borderRadius: 6,
                                                }}>{activeInsight.timestamp}</span>
                                                <span style={{
                                                    fontSize: 10,
                                                    color: 'rgba(255,255,255,0.5)',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '1px'
                                                }}>
                                                    {activeInsight.type === 'keyHand' ? '♠️ KEY HAND' : '📺 CHAPTER'}
                                                </span>
                                            </div>

                                            {/* Insight Title */}
                                            <h4 style={{
                                                color: 'white',
                                                fontSize: 16,
                                                fontWeight: 700,
                                                margin: 0,
                                                marginBottom: 12,
                                                lineHeight: 1.4
                                            }}>
                                                {activeInsight.title}
                                            </h4>

                                            {/* Key Hand Details */}
                                            {activeInsight.type === 'keyHand' && (
                                                <>
                                                    {activeInsight.situation && (
                                                        <div style={{ marginBottom: 10 }}>
                                                            <span style={{ color: '#FFD700', fontSize: 11, fontWeight: 600 }}>SITUATION</span>
                                                            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '4px 0 0 0', lineHeight: 1.5 }}>
                                                                {activeInsight.situation}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {activeInsight.analysis && (
                                                        <div style={{ marginBottom: 10 }}>
                                                            <span style={{ color: '#00D4FF', fontSize: 11, fontWeight: 600 }}>ANALYSIS</span>
                                                            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '4px 0 0 0', lineHeight: 1.5 }}>
                                                                {activeInsight.analysis}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {activeInsight.result && (
                                                        <div>
                                                            <span style={{ color: '#10B981', fontSize: 11, fontWeight: 600 }}>RESULT</span>
                                                            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '4px 0 0 0', lineHeight: 1.5 }}>
                                                                {activeInsight.result}
                                                            </p>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Chapter Description */}
                                            {activeInsight.type === 'chapter' && activeInsight.description && (
                                                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                                                    {activeInsight.description}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        /* Waiting for next insight */
                                        <div style={{
                                            padding: '28px',
                                            background: 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(0,212,255,0.02) 100%)',
                                            borderRadius: 16,
                                            border: '1px solid rgba(0,212,255,0.15)',
                                            textAlign: 'center',
                                            marginBottom: 20,
                                        }}>
                                            <div style={{
                                                width: 56,
                                                height: 56,
                                                margin: '0 auto 16px',
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, rgba(0,212,255,0.15) 0%, rgba(0,212,255,0.05) 100%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                animation: 'float 3s ease-in-out infinite',
                                            }}>
                                                <span style={{ fontSize: 24 }}>🎯</span>
                                            </div>
                                            <p style={{
                                                color: '#00D4FF',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                margin: 0,
                                                marginBottom: 6
                                            }}>
                                                Watching for key moments
                                            </p>
                                            <p style={{
                                                color: 'rgba(255,255,255,0.5)',
                                                fontSize: 12,
                                                margin: 0,
                                                lineHeight: 1.5
                                            }}>
                                                Insights will appear at important timestamps
                                            </p>
                                        </div>
                                    )}

                                    {/* Upcoming Insights Timeline */}
                                    {getTimedInsights().filter(i => i.seconds > currentVideoTime).length > 0 && (
                                        <div style={{ marginTop: 16 }}>
                                            <h4 style={{
                                                color: 'rgba(255,255,255,0.5)',
                                                fontSize: 11,
                                                fontWeight: 600,
                                                marginBottom: 12,
                                                textTransform: 'uppercase',
                                                letterSpacing: '1px'
                                            }}>
                                                Coming Up
                                            </h4>
                                            {getTimedInsights()
                                                .filter(i => i.seconds > currentVideoTime)
                                                .slice(0, 3)
                                                .map((insight, idx) => (
                                                    <div
                                                        key={insight.id}
                                                        className="jarvis-timeline-item"
                                                        onClick={() => {
                                                            // Seek to this timestamp using YouTube API
                                                            try {
                                                                const iframe = document.getElementById('youtube-player');
                                                                if (iframe && iframe.contentWindow) {
                                                                    iframe.contentWindow.postMessage(JSON.stringify({
                                                                        event: 'command',
                                                                        func: 'seekTo',
                                                                        args: [insight.seconds, true]
                                                                    }), '*');
                                                                }
                                                            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                                                        }}
                                                        style={{
                                                            padding: '12px 14px',
                                                            background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
                                                            borderRadius: 10,
                                                            marginBottom: 8,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 12,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s ease',
                                                            border: '1px solid transparent',
                                                        }}>
                                                        <div style={{
                                                            minWidth: 48,
                                                            height: 28,
                                                            background: insight.type === 'keyHand'
                                                                ? 'linear-gradient(135deg, rgba(255,68,68,0.25) 0%, rgba(255,68,68,0.1) 100%)'
                                                                : 'linear-gradient(135deg, rgba(0,212,255,0.25) 0%, rgba(0,212,255,0.1) 100%)',
                                                            borderRadius: 6,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}>
                                                            <span style={{
                                                                color: insight.type === 'keyHand' ? '#FF4444' : '#00D4FF',
                                                                fontSize: 11,
                                                                fontWeight: 700,
                                                            }}>{insight.timestamp}</span>
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <span style={{
                                                                color: 'rgba(255,255,255,0.85)',
                                                                fontSize: 13,
                                                                fontWeight: 500,
                                                                display: 'block',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                {insight.title}
                                                            </span>
                                                            <span style={{
                                                                color: 'rgba(255,255,255,0.4)',
                                                                fontSize: 10,
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.5px',
                                                            }}>
                                                                {insight.type === 'keyHand' ? '♠️ Key Hand' : '📺 Chapter'}
                                                            </span>
                                                        </div>
                                                        <div style={{
                                                            width: 24,
                                                            height: 24,
                                                            borderRadius: '50%',
                                                            background: 'rgba(255,255,255,0.08)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}>
                                                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>▶</span>
                                                        </div>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    )}

                                    {/* Summary at bottom - METAL UI Card */}
                                    {aiAnalysis.summary && (
                                        <div style={{
                                            marginTop: 24,
                                            padding: '16px',
                                            background: 'linear-gradient(180deg, #1a2332 0%, #0d1520 100%)',
                                            borderRadius: 8,
                                            border: '1px solid #2a3a4a',
                                            position: 'relative',
                                            overflow: 'hidden',
                                        }}>
                                            {/* Gold LED strip at top */}
                                            <div style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                height: 2,
                                                background: 'linear-gradient(90deg, transparent 0%, #FFD700 30%, #FFD700 70%, transparent 100%)',
                                                boxShadow: '0 0 10px rgba(255, 215, 0, 0.5)',
                                            }} />
                                            <h4 style={{
                                                color: '#FFD700',
                                                fontSize: 11,
                                                fontWeight: 700,
                                                marginBottom: 10,
                                                textTransform: 'uppercase',
                                                letterSpacing: '1.5px',
                                                textShadow: '0 0 10px rgba(255, 215, 0, 0.4)',
                                                margin: 0,
                                                marginBottom: 10,
                                            }}>VIDEO OVERVIEW</h4>
                                            <p style={{
                                                color: '#B0B3B8',
                                                fontSize: 12,
                                                lineHeight: 1.7,
                                                margin: 0
                                            }}>
                                                {aiAnalysis.summary}
                                            </p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: 40 }}>
                                    <div style={{ fontSize: 32, marginBottom: 16 }}>🎬</div>
                                    <p style={{ color: 'rgba(255,255,255,0.7)' }}>No Insights Available</p>
                                </div>
                            )}
                        </div>
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

            {/* CSS for hover effects and responsive Jarvis panel */}
            <style>{`
                div:hover .play-btn {
                    opacity: 1 !important;
                }
                /* Jarvis Panel - HIDDEN (replaced by caption overlay) */
                .jarvis-panel {
                    display: none !important;
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
                
                .jarvis-drag-handle {
                    display: none !important;
                }
                
                .jarvis-desktop-header {
                    display: flex !important;
                }
                
                .jarvis-collapsed-preview {
                    display: none !important;
                }
                
                .jarvis-panel-content {
                    flex: 1 !important;
                    overflow-y: auto !important;
                    max-height: none !important;
                    display: block !important;
                }

                /* Animation for active insight cards */
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.98);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                /* Pulse animation for when new insight appears */
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }

                /* Glow pulse for Jarvis branding */
                @keyframes glowPulse {
                    0%, 100% { 
                        box-shadow: 0 0 20px rgba(0, 212, 255, 0.3),
                                    0 0 40px rgba(0, 212, 255, 0.1);
                    }
                    50% { 
                        box-shadow: 0 0 30px rgba(0, 212, 255, 0.5),
                                    0 0 60px rgba(0, 212, 255, 0.2);
                    }
                }

                /* Shimmer loading effect */
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }

                /* Float animation for waiting state */
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-8px); }
                }

                /* Subtle border glow for active insight */
                .jarvis-panel {
                    animation: metalGlow 3s ease-in-out infinite;
                }

                /* METAL UI: 3-second breathing LED glow */
                @keyframes metalGlow {
                    0%, 100% { 
                        border-left-color: rgba(0, 212, 255, 0.8);
                        box-shadow: -10px 0 50px rgba(0, 0, 0, 0.7),
                                    0 0 10px rgba(0, 212, 255, 0.3),
                                    0 0 20px rgba(0, 212, 255, 0.15);
                    }
                    50% { 
                        border-left-color: rgba(0, 212, 255, 1);
                        box-shadow: -10px 0 50px rgba(0, 0, 0, 0.7),
                                    0 0 15px rgba(0, 212, 255, 0.5),
                                    0 0 30px rgba(0, 212, 255, 0.25);
                    }
                }

                .jarvis-insight-active {
                    animation: slideIn 0.4s ease forwards;
                }

                /* METAL UI Scrollbar */
                .jarvis-panel-content {
                    scroll-behavior: smooth;
                }
                .jarvis-panel-content::-webkit-scrollbar {
                    width: 6px;
                }
                .jarvis-panel-content::-webkit-scrollbar-track {
                    background: #0d1520;
                    border-radius: 3px;
                }
                .jarvis-panel-content::-webkit-scrollbar-thumb {
                    background: linear-gradient(180deg, #2a3a4a 0%, #1a2332 100%);
                    border-radius: 3px;
                    border: 1px solid #00d4ff;
                }
                .jarvis-panel-content::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(180deg, #3a4a5a 0%, #2a3a4a 100%);
                    box-shadow: 0 0 5px rgba(0, 212, 255, 0.5);
                }

                /* Jarvis button hover effect */
                .jarvis-button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 0 25px rgba(0,212,255,0.5), 0 6px 20px rgba(0,0,0,0.4) !important;
                }
                .jarvis-button:active {
                    transform: translateY(0);
                }

                /* Timeline item hover - METAL UI glow effect */
                .jarvis-timeline-item:hover {
                    background: linear-gradient(135deg, rgba(0,212,255,0.1) 0%, rgba(0,212,255,0.02) 100%) !important;
                    border-color: rgba(0,212,255,0.4) !important;
                    transform: translateX(4px);
                }
                .jarvis-timeline-item:hover > div:last-child {
                    background: rgba(0,212,255,0.2) !important;
                }
                .jarvis-timeline-item:hover > div:last-child span {
                    color: #00d4ff !important;
                }

                /* Mobile - Bottom right corner overlay */
                @media (max-width: 768px) {
                    .jarvis-panel {
                        top: auto !important;
                        bottom: 16px !important;
                        right: 8px !important;
                        left: 8px !important;
                        width: auto !important;
                        max-height: 45vh !important;
                        border-left: none !important;
                        border-top: 3px solid #00d4ff !important;
                    }
                }
            `}</style>
              <BottomNavBar />
    </PageTransition>
    );
}
