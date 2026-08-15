/**
 * 🎬 STORIES COMPONENT v2 - TikTok/SmarterPoker/Instagram-Style Stories
 * 
 * KEY UX PATTERNS FROM RESEARCH:
 * 1. Full-screen camera-first interface
 * 2. Easy camera roll upload with immediate preview
 * 3. 24-hour ephemeral content with progress bars
 * 4. Text overlays, stickers, filters
 * 5. Gradient backgrounds for text-only stories
 * 6. Interactive elements (polls, questions)
 * 7. Clear visual feedback for all actions
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { sniffMimeType, getYouTubeVideoId } from '../../lib/socialHelpers';
import { useYouTubeErrorManager, YouTubeErrorOverlay } from '../../hooks/useYouTubeErrorManager';
import { checkProfanity } from '../../lib/profanityFilter';
import toast from '../../stores/toastStore';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', green: '#42B72A',
};

// Gradient backgrounds for text-only stories
const STORY_GRADIENTS = [
    'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
    'linear-gradient(135deg, #0f0f23 0%, #2d1b4e 100%)',
    'linear-gradient(135deg, #1f1c2c 0%, #928DAB 100%)',
    'linear-gradient(135deg, #1877F2 0%, #0a5dc2 100%)',
    'linear-gradient(135deg, #0052D4 0%, #4364F7 50%, #6FB1FC 100%)',
    'linear-gradient(135deg, #141E30 0%, #243B55 100%)',
    'linear-gradient(135deg, #D4AF37 0%, #AA8C2C 50%, #6B5B1E 100%)',
    'linear-gradient(135deg, #3E2723 0%, #8D6E63 100%)',
    'linear-gradient(135deg, #134E5E 0%, #71B280 100%)',
    'linear-gradient(135deg, #0F2027 0%, #203A43 50%, #2C5364 100%)',
    'linear-gradient(135deg, #8B0000 0%, #DC143C 100%)',
    'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #FCB045 100%)',
];

// Story Ring - shows colored ring for unviewed stories or LIVE status
function StoryRing({ hasUnviewed, isLive, children, size = 64, onClick }) {
    // Red glowing ring for live users
    const liveGradient = 'linear-gradient(135deg, #0066FF, #00C6FF, #0066FF)';
    const unviewedGradient = 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)';
    const defaultBorder = '#DADDE1';

    const ringBackground = isLive ? liveGradient : hasUnviewed ? unviewedGradient : defaultBorder;

    return (
        <>
        {/* Inject keyframe once — CSS deduplicates identical <style> blocks */}
        {isLive && <style>{`
            @keyframes liveGlow {
                0%, 100% { box-shadow: 0 0 12px rgba(0, 120, 255, 0.6), 0 0 24px rgba(0, 180, 255, 0.25); }
                50% { box-shadow: 0 0 22px rgba(0, 120, 255, 0.9), 0 0 45px rgba(0, 180, 255, 0.5); }
            }
        `}</style>}
        <div
            onClick={onClick}
            style={{
                width: size + 8,
                height: size + 8,
                borderRadius: '50%',
                background: ringBackground,
                padding: 3,
                cursor: 'pointer',
                // Pulsing animation for live users
                animation: isLive ? 'liveGlow 1.5s ease-in-out infinite' : 'none',
                boxShadow: isLive ? '0 0 18px rgba(0, 120, 255, 0.75), 0 0 35px rgba(0, 180, 255, 0.35)' : 'none',
            }}
        >
            <div style={{
                width: size + 2,
                height: size + 2,
                borderRadius: '50%',
                background: 'white',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {children}
            </div>
        </div>
        </>
    );
}

// Helper function to extract YouTube video ID and generate thumbnail URL
function getYouTubeThumbnail(linkUrl) {
    if (!linkUrl) return null;

    // Extract video ID from various YouTube URL formats
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
        const match = linkUrl.match(pattern);
        if (match && match[1]) {
            return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
        }
    }

    return null;
}

// Story Avatar - individual story in the bar
function StoryAvatar({ story, onClick, isOwn, hasStory, onCreateStory, isLive }) {
    const [thumbnailFailed, setThumbnailFailed] = useState(false);

    // Show ring if: other user has unviewed story, OR this is user's own story and they have stories
    const hasUnviewed = !story?.is_viewed && !isOwn;
    const showRing = hasUnviewed || (isOwn && hasStory);

    // Get thumbnail from link_url if it's a YouTube video
    const youtubeThumb = getYouTubeThumbnail(story?.link_url);
    const thumbnailUrl = youtubeThumb || story?.media_url;

    // If thumbnail failed, use profile avatar instead
    const displayUrl = (thumbnailFailed || !thumbnailUrl)
        ? (story?.author_avatar || '/default-avatar.png')
        : thumbnailUrl;

    return (
        <div
            onClick={onClick}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                minWidth: 80,
                position: 'relative',
            }}
        >
            <StoryRing hasUnviewed={showRing} isLive={isLive} size={64}>
                <div style={{ position: 'relative', width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', background: '#E4E6EB' }}>
                    {/* Always show profile avatar in story ring - "Aa" only appears in full-screen viewer */}
                    <img
                        src={displayUrl}
                        onLoad={(e) => {
                            // YouTube returns a 120x90 gray placeholder for invalid video IDs
                            // Check if this is a placeholder and switch to profile avatar
                            if (thumbnailUrl && e.target.naturalWidth <= 120) {
                                setThumbnailFailed(true);
                            }
                        }}
                        onError={(e) => {
                            // Mark thumbnail as failed and switch to profile avatar
                            if (!thumbnailFailed && thumbnailUrl) {
                                setThumbnailFailed(true);
                            }
                            // Immediate fallback
                            e.target.src = story?.author_avatar || '/default-avatar.png';
                        }}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {isLive && (
                        <div style={{
                            position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
                            background: '#0066FF', color: 'white',
                            padding: '2px 6px', borderRadius: 4,
                            fontSize: 10, fontWeight: 700,
                            border: '2px solid white',
                        }}>LIVE</div>
                    )}
                </div>
            </StoryRing>

            {/* + button moved outside the ring, positioned below the avatar */}
            {isOwn && (
                <div
                    onClick={(e) => { e.stopPropagation(); onCreateStory?.(); }}
                    style={{
                        position: 'absolute', top: 52, right: 6,
                        width: 24, height: 24, borderRadius: '50%',
                        background: C.blue, border: '3px solid white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, color: 'white', fontWeight: 700,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        cursor: 'pointer',
                    }}>+</div>
            )}

            <span style={{
                fontSize: 12,
                color: isLive ? '#0066FF' : C.text,
                fontWeight: isLive ? 700 : 400,
                textAlign: 'center',
                maxWidth: 70,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
                {isOwn ? 'Your Story' : (story?.author_fullname || story?.author_username || 'User')}
            </span>
        </div>
    );
}

// Stories Bar - horizontal scroll of stories at top of feed
export function StoriesBar({ userId, userAvatar, onCreateStory, onOpenLive }) {
    const [stories, setStories] = useState([]);
    const [liveUsers, setLiveUsers] = useState(new Set()); // Track who is live
    const [liveStreamMap, setLiveStreamMap] = useState({}); // author_id → stream object
    const [loading, setLoading] = useState(true);
    const [viewingStory, setViewingStory] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (userId) {
            loadStories();
            loadLiveUsers();
        }
    }, [userId]);

    const loadLiveUsers = async () => {
        try {
            const { data } = await supabase
                .from('live_streams')
                .select('id, broadcaster_id, title, thumbnail_url, status, viewer_count, category, description, broadcaster:profiles!broadcaster_id(id, username, full_name, avatar_url)')
                .eq('status', 'live');
            if (data) {
                setLiveUsers(new Set(data.map(s => s.broadcaster_id)));
                const map = {};
                data.forEach(s => { map[s.broadcaster_id] = s; });
                setLiveStreamMap(map);
            }
        } catch {
            // live_streams table may not exist — fail silently
        }
    };

    // Realtime: refresh live badges when any stream goes live or ends.
    // BUG FIX: use a unique channel name per mount so React StrictMode double-invoke
    // and hot-reload don't create two subscribers on the same logical channel.
    // Supabase deduplicates by name — the second subscriber would silently drop events.
    //
    // STREAM-POLISH-R4 STORY-LIVE-1: throttle refetch to once per 5s.
    // Previously every realtime event (including high-frequency
    // viewer_count UPDATEs every ~5s per active stream) triggered an
    // immediate loadLiveUsers() SELECT-all-live-streams. With N viewers
    // browsing during M concurrent streams that scaled as N×M queries
    // every few seconds. Throttle collapses bursts and serves freshness
    // bounded at 5s, which is fine for the story-ring "is X live?"
    // indicator — story rings don't need sub-second precision.
    useEffect(() => {
        if (!userId) return;
        let lastFetchAt = 0;
        let pendingTimer = null;
        const THROTTLE_MS = 5000;
        const throttledRefresh = () => {
            const now = Date.now();
            const elapsed = now - lastFetchAt;
            if (elapsed >= THROTTLE_MS) {
                lastFetchAt = now;
                loadLiveUsers();
            } else if (!pendingTimer) {
                // Schedule a trailing-edge refresh so the last burst is captured.
                pendingTimer = setTimeout(() => {
                    pendingTimer = null;
                    lastFetchAt = Date.now();
                    loadLiveUsers();
                }, THROTTLE_MS - elapsed);
            }
        };
        const channelName = `stories-live-monitor-${Date.now()}`;
        const ch = supabase
            .channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, throttledRefresh)
            .subscribe();
        return () => {
            if (pendingTimer) clearTimeout(pendingTimer);
            supabase.removeChannel(ch);
        };
    }, [userId]);

    const loadStories = async () => {
        console.debug('[Stories] Loading stories for userId:', userId);
        setLoading(true);
        try {
            // Use native fetch to avoid AbortError
            const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

            // BUG FIX: Always use the user's JWT access token for authenticated RPC calls.
            // Using anon key gave Supabase no user context → RLS blocked all stories.
            let accessToken = sbKey; // fallback to anon
            try {
                const raw = localStorage.getItem('smarter-poker-auth');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed?.access_token) accessToken = parsed.access_token;
                }
                if (accessToken === sbKey) {
                    // Fallback: try sb-* keys
                    const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                    if (sbKeys.length > 0) {
                        const parsed = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
                        if (parsed?.access_token) accessToken = parsed.access_token;
                    }
                }
            } catch (_) { /* non-critical */ }

            const response = await fetch(`${sbUrl}/rest/v1/rpc/fn_get_stories`, {
                method: 'POST',
                headers: {
                    'apikey': sbKey,
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ p_viewer_id: userId })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.warn('[Stories] RPC fetch failed:', response.status, errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.debug('[Stories] RPC response:', { data: data?.length || 0 });

            if (data) {
                const grouped = {};
                data.forEach(story => {
                    if (!grouped[story.author_id]) {
                        grouped[story.author_id] = { ...story, stories: [story] };
                    } else {
                        grouped[story.author_id].stories.push(story);
                    }
                });
                console.debug('[Stories] Grouped stories:', Object.keys(grouped || {}).length);
                setStories(Object.values(grouped || {}));
            }
        } catch (e) {
            console.warn('Error loading stories:', e);
        }
        setLoading(false);
    };

    const handleViewStory = async (storyGroup) => {
        // If the user is live, route to the live stream instead
        if (liveUsers.has(storyGroup.author_id)) {
            const stream = liveStreamMap[storyGroup.author_id];
            if (onOpenLive && stream) {
                onOpenLive(stream);
                return;
            }
        }
        setViewingStory(storyGroup);
        if (!storyGroup.is_own) {
            const { error: viewStoryErr } = await supabase.rpc('fn_view_story', {
                p_story_id: storyGroup.id,
                p_viewer_id: userId,
            });
            if (viewStoryErr) console.warn('[Stories] fn_view_story RPC failed (non-fatal):', viewStoryErr.message);
        }
    };

    const ownStory = stories.find(s => s.is_own);
    const otherStories = stories.filter(s => !s.is_own);

    return (
        <>
            <div style={{
                background: C.card,
                borderRadius: 8,
                padding: '12px 8px',
                marginBottom: 16,
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}>
                <div
                    ref={scrollRef}
                    style={{
                        display: 'flex',
                        gap: 8,
                        overflowX: 'auto',
                        paddingBottom: 8,
                        scrollbarWidth: 'none',
                    }}
                >
                    <StoryAvatar
                        story={ownStory || { author_avatar: userAvatar || '/default-avatar.png' }}
                        isOwn={true}
                        hasStory={!!ownStory}
                        isLive={liveUsers.has(userId)}
                        onClick={() => ownStory ? handleViewStory(ownStory) : setShowCreate(true)}
                        onCreateStory={() => setShowCreate(true)}
                    />

                    {otherStories.map(storyGroup => (
                        <StoryAvatar
                            key={storyGroup.author_id}
                            story={storyGroup}
                            onClick={() => handleViewStory(storyGroup)}
                            isLive={liveUsers.has(storyGroup.author_id)}
                        />
                    ))}

                    {/* Live-only users: broadcasters who are live but have no stories */}
                    {Object.entries(liveStreamMap)
                        .filter(([broadcasterId]) => {
                            // Skip self (already shown above) and anyone already in stories
                            if (broadcasterId === userId) return false;
                            return !otherStories.some(s => s.author_id === broadcasterId);
                        })
                        .map(([broadcasterId, stream]) => (
                            <StoryAvatar
                                key={`live-${broadcasterId}`}
                                story={{
                                    author_id: broadcasterId,
                                    author_avatar: stream.broadcaster?.avatar_url || '/default-avatar.png',
                                    author_fullname: stream.broadcaster?.full_name || stream.broadcaster?.username || stream.title || 'Live',
                                    author_username: stream.broadcaster?.username,
                                }}
                                onClick={() => {
                                    if (onOpenLive) onOpenLive(stream);
                                }}
                                isLive={true}
                            />
                        ))
                    }

                    {loading && !stories.length && (
                        <div style={{ padding: '20px 40px', color: C.textSec }}>Loading Stories...</div>
                    )}
                </div>
            </div>

            {viewingStory && (
                <StoryViewer
                    storyGroup={viewingStory}
                    onClose={() => { setViewingStory(null); loadStories(); }}
                    userId={userId}
                />
            )}

            {showCreate && (
                <CreateStoryModal
                    userId={userId}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); loadStories(); }}
                />
            )}
        </>
    );
}

// Full-screen Story Viewer
function StoryViewer({ storyGroup, onClose, userId }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [ytError, setYtError] = useState(null); // YouTube embed error code
    const stories = storyGroup.stories || [storyGroup];
    const currentStory = stories[currentIndex];
    const timerRef = useRef(null);
    const isYT = currentStory?.link_url?.includes('youtube');
    const storyYtVideoId = isYT ? getYouTubeVideoId(currentStory.link_url) : null;

    // Centralized YouTube error management
    const { ytError: managedYtError, thumbnailUrl } = useYouTubeErrorManager({
        active: isYT,
        videoId: storyYtVideoId,
        surface: 'Stories',
        autoActionDelay: 3000,
        onError: () => {
            if (currentIndex < stories.length - 1) {
                setCurrentIndex(prev => prev + 1);
            } else {
                onClose();
            }
        },
    });

    // Sync managed error to local state (local copy needed for timer-pause side-effect)
    useEffect(() => {
        if (managedYtError) {
            setYtError(managedYtError);
            if (timerRef.current) clearInterval(timerRef.current);
        } else {
            setYtError(null);
        }
    }, [managedYtError]);

    const [videoDurationMs, setVideoDurationMs] = useState(null);
    useEffect(() => {
        setProgress(0);
        setYtError(null); // Clear error on story change
        setVideoDurationMs(null);
        const interval = 50;
        let elapsed = 0;

        timerRef.current = setInterval(() => {
            const duration = (stories[currentIndex]?.media_type === 'video' && videoDurationMs) ? videoDurationMs : 5000;
            elapsed += interval;
            setProgress((elapsed / duration) * 100);

            if (elapsed >= duration) {
                if (currentIndex < stories.length - 1) {
                    setCurrentIndex(prev => prev + 1);
                } else {
                    onClose();
                }
            }
        }, interval);

        return () => clearInterval(timerRef.current);
    // BUG FIX: added stories.length and onClose to deps.
    // Without stories.length: if a realtime insert changes the story count while the
    // viewer is open, the closure captures the stale count and auto-advances incorrectly.
    // Without onClose: parent re-renders with a new callback reference go unnoticed,
    // and the old callback fires (potential stale state or missing overlay teardown).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentIndex, stories.length, onClose, videoDurationMs]);

    // 2026-08-15 audit: fn_view_story was only called for the FIRST story of
    // a group — stories 2..N never recorded a view. Record each story as it
    // is shown (deduped per viewer session).
    const seenStoriesRef = useRef(new Set());
    useEffect(() => {
        const s = stories[currentIndex];
        if (!s?.id || s.is_own || !userId) return;
        if (seenStoriesRef.current.has(s.id)) return;
        seenStoriesRef.current.add(s.id);
        supabase.rpc('fn_view_story', { p_story_id: s.id, p_viewer_id: userId })
            .then(({ error }) => { if (error) console.warn('[Stories] fn_view_story failed:', error.message); });
    }, [currentIndex, stories, userId]);



    const goNext = () => {
        if (currentIndex < stories.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            onClose();
        }
    };

    const goPrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.95)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <button
                onClick={onClose}
                style={{
                    position: 'absolute', top: 20, right: 20,
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none', color: 'white', fontSize: 24,
                    cursor: 'pointer', zIndex: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >✕</button>

            <div style={{
                width: '100vw',
                height: '100vh',
                position: 'relative',
                background: currentStory.background_color || currentStory.media_url ? 'black' : STORY_GRADIENTS[0],
            }}>
                {/* Progress bars */}
                <div style={{
                    position: 'absolute', top: 8, left: 8, right: 8,
                    display: 'flex', gap: 4, zIndex: 10,
                }}>
                    {stories.map((_, i) => (
                        <div key={i} style={{
                            flex: 1, height: 3, borderRadius: 2,
                            background: 'rgba(255,255,255,0.3)',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                height: '100%',
                                background: 'white',
                                width: i < currentIndex ? '100%' : i === currentIndex ? `${progress}%` : '0%',
                            }} />
                        </div>
                    ))}
                </div>

                {/* Header */}
                <div style={{
                    position: 'absolute', top: 20, left: 12, right: 12,
                    display: 'flex', alignItems: 'center', gap: 12,
                    zIndex: 10,
                }}>
                    <img
                        src={currentStory.author_avatar || '/default-avatar.png'}
                        style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid white' }}
                    />
                    <div>
                        <div style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>
                            {currentStory.author_fullname || currentStory.author_username}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                            {timeAgo(currentStory.created_at)}
                        </div>
                    </div>
                </div>

                {/* Story content */}
                {currentStory.link_url && currentStory.link_url.includes('youtube') ? (
                    // Embed YouTube video for video stories
                    <>
                        <iframe
                            src={(() => {
                                let embedUrl = currentStory.link_url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/');
                                const sep = embedUrl.includes('?') ? '&' : '?';
                                return `${embedUrl}${sep}enablejsapi=1&autoplay=1&mute=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}`;
                            })()}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                objectFit: 'contain'
                            }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                        {/* YouTube Error Overlay */}
                        {ytError && (
                            <YouTubeErrorOverlay
                                errorCode={ytError}
                                videoId={storyYtVideoId}
                                videoUrl={currentStory.link_url}
                                thumbnailUrl={thumbnailUrl}
                                actionLabel="Skipping in 3 seconds..."
                                style={{ pointerEvents: 'auto' }}
                            />
                        )}
                    </>
                ) : currentStory.media_url ? (
                    currentStory.media_type === 'video' ? (
                        <video
                            src={currentStory.media_url}
                            autoPlay
                            muted
                            playsInline
                            onLoadedMetadata={(e) => {
                                // Size the advance timer to the real video
                                // length (capped 30s) instead of cutting every
                                // story video at 5s.
                                const d = e.currentTarget?.duration;
                                if (Number.isFinite(d) && d > 0) {
                                    setVideoDurationMs(Math.min(Math.round(d * 1000), 30000));
                                }
                            }}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                    ) : (
                        <img
                            src={currentStory.media_url}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                    )
                ) : (
                    <div style={{
                        width: '100%', height: '100%',
                        background: currentStory.background_color || STORY_GRADIENTS[0],
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 40,
                    }}>
                        <p style={{
                            color: 'white', fontSize: 28, fontWeight: 700,
                            textAlign: 'center', textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                        }}>
                            {currentStory.content}
                        </p>
                    </div>
                )}

                {/* Text overlay */}
                {currentStory.media_url && currentStory.content && (
                    <div style={{
                        position: 'absolute', bottom: 80, left: 20, right: 20,
                        color: 'white', fontSize: 18, fontWeight: 500,
                        textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                        textAlign: 'center',
                    }}>
                        {currentStory.content}
                    </div>
                )}

                {/* Navigation */}
                <div onClick={goPrev} style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0, width: '30%',
                    cursor: 'pointer',
                }} />
                <div onClick={goNext} style={{
                    position: 'absolute', top: 0, right: 0, bottom: 0, width: '70%',
                    cursor: 'pointer',
                }} />

                {/* View count */}
                {storyGroup.is_own && (
                    <div style={{
                        position: 'absolute', bottom: 20, left: 20,
                        color: 'white', fontSize: 14,
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        👁 {currentStory.view_count || 0} views
                    </div>
                )}
            </div>
        </div>
    );
}

function timeAgo(d) {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
}

// 🎬 CREATE STORY MODAL - Full-screen TikTok/Instagram style
function CreateStoryModal({ userId, onClose, onCreated }) {
    const [mode, setMode] = useState('select'); // 'select', 'text', 'media', 'preview'
    const [text, setText] = useState('');
    const [selectedGradient, setSelectedGradient] = useState(0);
    const [mediaUrl, setMediaUrl] = useState(null);
    const [mediaType, setMediaType] = useState('image');
    const [mediaPreview, setMediaPreview] = useState(null); // Local preview URL
    const [uploading, setUploading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);
    const [showSuccess, setShowSuccess] = useState(false); // Success toast
    const fileInputRef = useRef(null);

    // Handle file selection with IMMEDIATE preview
    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);

        // Validate file size (50MB limit for stories bucket)
        const MAX_STORY_BYTES = 50 * 1024 * 1024;
        if (file.size > MAX_STORY_BYTES) {
            setError(`File too large — max 50MB for stories (your file: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
            return;
        }

        // Create immediate local preview
        const localPreviewUrl = URL.createObjectURL(file);
        setMediaPreview(localPreviewUrl);
        setMode('preview');

        // Use sniffMimeType — iOS Photo Library may return empty or codec-suffixed file.type
        const cleanMime = sniffMimeType(file);
        const isVideo = cleanMime.startsWith('video/');
        setMediaType(isVideo ? 'video' : 'image');

        // Upload via signed URL — avoids SDK storage.upload() which internally
        // acquires the auth session lock, causing contention with realtime subscriptions.
        setUploading(true);
        try {
            // Read token directly from localStorage — zero lock contention
            let accessToken = null;
            try {
                const raw = localStorage.getItem('smarter-poker-auth');
                if (raw) accessToken = JSON.parse(raw)?.access_token || null;
                if (!accessToken) {
                    const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                    if (sbKeys.length > 0) accessToken = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.access_token || null;
                }
            } catch (_) {}

            // Step 1: Get a signed upload URL from our API
            const metaRes = await fetch('/api/social/upload-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: cleanMime,
                    folder: 'stories',
                    prefix: userId,
                    bucket: 'stories',
                }),
            });

            if (!metaRes.ok) {
                const errJson = await metaRes.json().catch(() => ({}));
                throw new Error(errJson.error || `Upload auth failed (${metaRes.status})`);
            }
            const meta = await metaRes.json();
            if (!meta.success) throw new Error(meta.error || 'Upload URL request failed');

            // Step 2: PUT the file directly to Supabase — no lock, no SDK
            const putRes = await fetch(meta.signedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': cleanMime },
                body: file,
            });
            if (!putRes.ok) {
                throw new Error(`Upload failed (HTTP ${putRes.status}) — please try again`);
            }

            setMediaUrl(meta.publicUrl);
            console.debug('✅ Story uploaded to:', meta.publicUrl);
        } catch (err) {
            console.warn('[Stories] Upload error:', err);
            setError(`Upload failed: ${err.message}`);
        }
        setUploading(false);
    };

    const handleCreate = async () => {
        console.debug('[Stories] handleCreate called');
        console.debug('[Stories] userId:', userId);
        console.debug('[Stories] text:', text);
        console.debug('[Stories] mediaUrl:', mediaUrl);
        console.debug('[Stories] mode:', mode);

        // Validate based on mode
        if (mode === 'select') {
            setError('Please choose Text or Photo/Video first');
            return;
        }

        if (mode === 'preview' && !mediaUrl) {
            if (uploading) {
                setError('Still uploading... please wait');
            } else {
                setError('Please select a photo or video');
            }
            return;
        }

        // For text mode, we can post even without text (gradient-only story is valid)
        // But we need SOMETHING for media mode
        if (mode !== 'text' && !text && !mediaUrl) {
            setError('Nothing to post');
            console.debug('[Stories] No content to post, returning');
            return;
        }

        if (!userId) {
            setError('You must be logged in to post a story');
            console.debug('[Stories] No userId!');
            return;
        }

        // STREAM-POLISH-R4 STORY-CREATE-2: profanity filter on caption.
        // Mirrors the chat filter added in R3-2 — blocks slurs + direct
        // self-harm threats client-side. The 500-char length cap added
        // in fn_create_story (migration 20260511210000) gives server-
        // side enforcement; this provides immediate UX feedback.
        if (text) {
            const profanity = checkProfanity(text);
            if (profanity.blocked) {
                setError(profanity.reason === 'threat'
                    ? 'That story violates community guidelines and cannot be posted'
                    : 'That story contains a slur and cannot be posted');
                return;
            }
        }

        setCreating(true);
        setError(null);

        try {
            console.debug('[Stories] Calling fn_create_story...');
            const { data: storyId, error: createError } = await supabase.rpc('fn_create_story', {
                p_user_id: userId,
                p_content: text || null,
                p_media_url: mediaUrl || null,
                p_media_type: mediaUrl ? mediaType : null,
                p_background_color: mode === 'text' ? STORY_GRADIENTS[selectedGradient] : null,
                p_link_url: null,
            });

            if (createError) {
                console.debug('[Stories] Create error:', createError);
                throw createError;
            }

            console.debug('[Stories] ✅ Story created! ID:', storyId);

            // Auto-save videos to Reels
            if (mediaType === 'video' && mediaUrl) {
                const { error: err_social_reels_j0afb } = await supabase.from('social_reels').insert({
                    author_id: userId,
                    video_url: mediaUrl,
                    caption: text || null,
                    source_story_id: storyId,
                });
                if (err_social_reels_j0afb) console.warn('[Supabase] Silent mutation failed in social_reels:', err_social_reels_j0afb.message);
            }

            // Cleanup local preview
            if (mediaPreview) URL.revokeObjectURL(mediaPreview);

            // Show success toast, then close after 2 seconds
            setShowSuccess(true);
            toast.success('Posted Successfully!', 2000);
            setTimeout(() => {
                onCreated();
            }, 2000);
        } catch (e) {
            console.warn('Create story error:', e);
            setError(`Failed to create story: ${e.message}`);
        }
        setCreating(false);
    };

    // BUG FIX: mediaPreview is a string state, so the cleanup useEffect closes over
    // the initial value (always null at mount time). URL.revokeObjectURL(null) is a
    // no-op — the blob URL leaks until GC.
    // Fix: track the current preview URL in a ref so the cleanup always reads the
    // latest value, regardless of how many times the user changes their file selection.
    const mediaPreviewRef = useRef(null);
    useEffect(() => {
        mediaPreviewRef.current = mediaPreview;
    }, [mediaPreview]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (mediaPreviewRef.current) URL.revokeObjectURL(mediaPreviewRef.current);
        };
    }, []);

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: '#000',
                zIndex: 10000,
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    maxWidth: 500,
                    margin: '0 auto',
                    width: '100%',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(0,0,0,0.5)',
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            fontSize: 20,
                            cursor: 'pointer',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >✕</button>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'white' }}>Create Story</h3>
                    <button
                        onClick={handleCreate}
                        disabled={mode === 'select' || creating || uploading}
                        style={{
                            background: mode !== 'select' && !creating && !uploading ? C.blue : 'rgba(255,255,255,0.2)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 20,
                            padding: '10px 20px',
                            fontWeight: 600,
                            cursor: mode !== 'select' && !creating && !uploading ? 'pointer' : 'not-allowed',
                            opacity: mode !== 'select' && !creating && !uploading ? 1 : 0.5,
                        }}
                    >
                        {creating ? 'Posting...' : uploading ? 'Uploading...' : mode === 'select' ? 'Choose Content' : 'Share'}
                    </button>
                </div>

                {/* Error message */}
                {error && (
                    <div style={{
                        background: '#ff4444',
                        color: 'white',
                        padding: '10px 20px',
                        textAlign: 'center',
                        fontSize: 14,
                    }}>
                        {error}
                    </div>
                )}

                {/* Success Toast Overlay */}
                {showSuccess && (
                    <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.85)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 100,
                        animation: 'fadeIn 0.3s ease',
                    }}>
                        <div style={{
                            fontSize: 64,
                            marginBottom: 16,
                            animation: 'bounceIn 0.5s ease',
                        }}>✅</div>
                        <div style={{
                            color: 'white',
                            fontSize: 24,
                            fontWeight: 700,
                            textAlign: 'center',
                        }}>Story Posted!</div>
                        <div style={{
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: 14,
                            marginTop: 8,
                        }}>Your Story Is Now Live For 24 Hours</div>
                    </div>
                )}

                {/* Content Area */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                }}>
                    {/* Selection Mode */}
                    {mode === 'select' && (
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 24,
                            padding: 40,
                        }}>
                            <h2 style={{ color: 'white', fontSize: 24, fontWeight: 700, margin: 0 }}>
                                What do you want to share?
                            </h2>

                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        width: 140,
                                        height: 140,
                                        borderRadius: 16,
                                        background: 'linear-gradient(135deg, #833AB4, #FD1D1D)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                        boxShadow: '0 4px 20px rgba(131, 58, 180, 0.4)',
                                    }}
                                >
                                    <span style={{ fontSize: 48 }}>📷</span>
                                    <span style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>Photo/Video</span>
                                </button>

                                <button
                                    onClick={() => setMode('text')}
                                    style={{
                                        width: 140,
                                        height: 140,
                                        borderRadius: 16,
                                        background: 'linear-gradient(135deg, #1877F2, #00D4FF)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                        boxShadow: '0 4px 20px rgba(24, 119, 242, 0.4)',
                                    }}
                                >
                                    <span style={{ fontSize: 48 }}>Aa</span>
                                    <span style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>Text Story</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Text Mode */}
                    {mode === 'text' && (
                        <div style={{
                            flex: 1,
                            background: STORY_GRADIENTS[selectedGradient],
                            display: 'flex',
                            flexDirection: 'column',
                        }}>
                            <div style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 40,
                            }}>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="Start Typing..."
                                    autoFocus
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'white',
                                        fontSize: 28,
                                        fontWeight: 700,
                                        textAlign: 'center',
                                        width: '100%',
                                        resize: 'none',
                                        outline: 'none',
                                        textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                    }}
                                    rows={5}
                                />
                            </div>

                            {/* Background selector */}
                            <div style={{
                                padding: 16,
                                background: 'rgba(0,0,0,0.3)',
                            }}>
                                <p style={{ color: 'white', fontSize: 12, marginBottom: 8, opacity: 0.7 }}>Background</p>
                                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                                    {STORY_GRADIENTS.map((grad, i) => (
                                        <div
                                            key={i}
                                            onClick={() => setSelectedGradient(i)}
                                            style={{
                                                width: 44,
                                                height: 44,
                                                borderRadius: 8,
                                                background: grad,
                                                cursor: 'pointer',
                                                border: selectedGradient === i ? '3px solid white' : '2px solid rgba(255,255,255,0.3)',
                                                flexShrink: 0,
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Preview Mode (after selecting photo/video) */}
                    {mode === 'preview' && (
                        <div style={{
                            flex: 1,
                            background: '#000',
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                        }}>
                            {/* Media preview */}
                            <div style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                            }}>
                                {mediaPreview && (
                                    mediaType === 'video' ? (
                                        <video
                                            src={mediaPreview}
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                            controls
                                            autoPlay
                                            muted
                                        />
                                    ) : (
                                        <img
                                            src={mediaPreview}
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                            alt="Preview"
                                        />
                                    )
                                )}

                                {/* Upload indicator overlay */}
                                {uploading && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 0, left: 0, right: 0, bottom: 0,
                                        background: 'rgba(0,0,0,0.5)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <div style={{
                                            background: 'rgba(0,0,0,0.8)',
                                            padding: '20px 40px',
                                            borderRadius: 12,
                                            color: 'white',
                                            fontSize: 16,
                                            fontWeight: 600,
                                        }}>
                                            📤 Uploading...
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Caption input */}
                            <div style={{
                                padding: 16,
                                background: 'rgba(0,0,0,0.5)',
                            }}>
                                <input
                                    type="text"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="Add A Caption..."
                                    style={{
                                        width: '100%',
                                        background: 'rgba(255,255,255,0.1)',
                                        border: 'none',
                                        padding: '12px 16px',
                                        borderRadius: 24,
                                        color: 'white',
                                        fontSize: 16,
                                        outline: 'none',
                                    }}
                                />
                            </div>

                            {/* Change photo button */}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    position: 'absolute',
                                    bottom: 80,
                                    right: 16,
                                    background: 'rgba(255,255,255,0.2)',
                                    border: 'none',
                                    padding: '8px 16px',
                                    borderRadius: 20,
                                    color: 'white',
                                    fontSize: 14,
                                    cursor: 'pointer',
                                }}
                            >
                                📷 Change
                            </button>
                        </div>
                    )}
                </div>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    hidden
                    onChange={handleFileSelect}
                />
            </div>
        </div>
    );
}

// Share to Story prompt
export function ShareToStoryPrompt({ mediaUrl, mediaType, userId, onClose, onShared }) {
    const [sharing, setSharing] = useState(false);

    const handleShare = async () => {
        setSharing(true);
        try {
            const { error: createStoryErr } = await supabase.rpc('fn_create_story', {
                p_user_id: userId,
                p_content: null,
                p_media_url: mediaUrl,
                p_media_type: mediaType || 'image',
                p_background_color: null,
                p_link_url: null, // BUG FIX: fn_create_story requires all declared params;
                // omitting p_link_url caused a silent RPC error on some Postgres versions.
            });
            if (createStoryErr) throw createStoryErr;
            onShared?.();
        } catch (e) {
            console.warn('Share to story error:', e);
        }
        setSharing(false);
    };

    return (
        <div style={{
            padding: 16,
            background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
            borderRadius: 12,
            marginBottom: 16,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ color: 'white', fontWeight: 600, fontSize: 15 }}>Add To Your Story?</div>
                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Share This With Your Followers</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: 'none', borderRadius: 20, padding: '8px 16px',
                        color: 'white', fontWeight: 500, cursor: 'pointer',
                    }}>Not Now</button>
                    <button onClick={handleShare} disabled={sharing} style={{
                        background: 'white',
                        border: 'none', borderRadius: 20, padding: '8px 20px',
                        color: '#833AB4', fontWeight: 600, cursor: 'pointer',
                    }}>{sharing ? '...' : 'Share'}</button>
                </div>
            </div>
        </div>
    );
}

export default StoriesBar;
