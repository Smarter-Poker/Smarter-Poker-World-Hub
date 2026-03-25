/**
 * REELS PAGE - TikTok-style Full-Screen Vertical Video Experience
 * Swipe up/down to navigate, tap to mute/unmute
 */

import { useState, useEffect, useRef } from 'react';
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
    const [muted, setMuted] = useState(true); // MUST be true for autoplay to work
    const [userWantsSound, setUserWantsSound] = useState(false); // localStorage preference
    // Auto-play immediately - no tap required since videos are muted (browser policy compliant)
    const [liked, setLiked] = useState({});
    const [likeCounts, setLikeCounts] = useState({});
    const [shareToast, setShareToast] = useState(false);
    const [showCommentPanel, setShowCommentPanel] = useState(false);
    const [comments, setComments] = useState([]);
    const [commentText, setCommentText] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [commentCounts, setCommentCounts] = useState({});
    const containerRef = useRef(null);
    const iframeRef = useRef(null);
    const touchStartY = useRef(0);
    const lastTapRef = useRef(0);
    const likeDebounceRef = useRef(false);
    const slideDebounceRef = useRef(false);
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [savedReels, setSavedReels] = useState(new Set());
    const [showHeart, setShowHeart] = useState(false);
    const [slideDirection, setSlideDirection] = useState(null);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [viewCounts, setViewCounts] = useState({});
    const [videoProgress, setVideoProgress] = useState(0);
    const [overlayVisible, setOverlayVisible] = useState(true);
    const overlayTimerRef = useRef(null);
    const viewedReelsRef = useRef(new Set());

    // Reels preferences state
    const [preferences, setPreferences] = useState({
        autoplay: true,
        soundOnScroll: true,
        dataSaver: false,
        showCaptions: true
    });

    // Load sound preference from localStorage on mount
    useEffect(() => {    const _c = new AbortController();

        if (typeof window !== 'undefined') {
            const savedPref = localStorage.getItem('reels-sound-enabled');
            if (savedPref === 'true') {
                setUserWantsSound(true);
            }
        }
    return () => _c.abort();
  }, []);

    // Load user and preferences
    useEffect(() => {    const _c = new AbortController();

        const loadUserData = async(signal) => {
            const authUser = getAuthUser();
            setUser(authUser);

            if (authUser) {
                // Load preferences
                const prefs = await reelsPreferences.get(authUser.id);
                setPreferences(prefs);

                // Load saved reels
                const saved = await savedReelsService.getSavedReels(authUser.id);
                const savedIds = new Set(saved.map(item => item.reel_id));
                setSavedReels(savedIds);

                // Pre-fetch existing likes
                const { data: likeData } = await supabase
                    .from('social_likes')
                    .select('post_id')
                    .eq('user_id', authUser.id);
                if (likeData) {
                    const likeMap = {};
                    likeData.forEach(l => { likeMap[l.post_id] = true; });
                    setLiked(likeMap);
                }
            }
        };
        loadUserData();
    return () => _c.abort();
  }, []);

    // YouTube API: Send command to iframe via postMessage
    const sendYouTubeCommand = (command, args = []) => {
        if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: command,
                args: args
            }), '*');
        }
    };

    // Auto-play immediately on load (muted videos comply with browser autoplay policy)
    // Then auto-unmute since user explicitly came here to watch videos with sound
    useEffect(() => {    const _c = new AbortController();

        if (!loading && reels.length > 0) {
            // Wait for iframe to load, then force play + unmute
            const timer = setTimeout(() => {
                // FORCE PLAY via YouTube API
                sendYouTubeCommand('playVideo');

                // AUTO-UNMUTE: User came here to watch videos, they want sound!
                sendYouTubeCommand('unMute');
                sendYouTubeCommand('setVolume', [100]);
                setMuted(false);
            }, 500); // Give iframe time to initialize YouTube API
            return () => clearTimeout(timer);
        }}, [currentIndex, loading, reels.length]);

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

    useEffect(() => {    const _c = new AbortController();

        loadReels();
    return () => _c.abort();
  }, []);

    const loadReels = async(signal) => {
        setLoading(true);
        try {
            // Load from social_reels (YouTube shorts posted by SmarterPokerOfficial)
            const { data: reelsData } = await supabase
                .from('social_reels')
                .select('id, author_id, caption, video_url, view_count, created_at, is_public')
                .eq('is_public', true)
                .order('created_at', { ascending: false })
                .limit(50);

            // Load from social_posts (posts with YouTube videos in media_urls)
            const { data: postsData } = await supabase
                .from('social_posts')
                .select('id, author_id, content, media_urls, like_count, created_at, visibility')
                .eq('visibility', 'public')
                .not('media_urls', 'is', null)
                .order('created_at', { ascending: false })
                .limit(100); // Get more to filter for YouTube links

            // Combine both sources
            const allVideos = [];

            // Add reels from social_reels
            if (reelsData && reelsData.length > 0) {
                allVideos.push(...reelsData.map(reel => ({
                    id: reel.id,
                    author_id: reel.author_id,
                    video_url: reel.video_url,
                    caption: reel.caption,
                    like_count: reel.view_count || 0,
                    created_at: reel.created_at,
                    source: 'reels'
                })));
            }

            // Add videos from social_posts (only YouTube links)
            if (postsData && postsData.length > 0) {
                allVideos.push(...postsData
                    .filter(post => {
                        if (!post.media_urls || post.media_urls.length === 0) return false;
                        // Only include posts with YouTube URLs
                        const url = post.media_urls[0];
                        return url && (url.includes('youtube.com') || url.includes('youtu.be'));
                    })
                    .map(post => ({
                        id: post.id,
                        author_id: post.author_id,
                        video_url: post.media_urls[0],
                        caption: post.content,
                        like_count: post.like_count || 0,
                        created_at: post.created_at,
                        source: 'posts'
                    })));
            }

            if (allVideos.length > 0) {
                // Get all unique author IDs
                const authorIds = [...new Set(allVideos.map(v => v.author_id))];
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, full_name')
                    .in('id', authorIds)
                    .limit(50) // reel profiles

                const profileMap = {};
                (profiles || []).forEach(p => { profileMap[p.id] = p; });

                // Map videos with profile data
                const mappedReels = allVideos.map(video => ({
                    id: video.id,
                    video_url: video.video_url,
                    caption: video.caption,
                    like_count: video.like_count,
                    created_at: video.created_at,
                    profiles: profileMap[video.author_id] || { username: 'Anonymous' },
                }));

                // Shuffle for variety
                const shuffled = mappedReels.sort(() => Math.random() - 0.5);
                setReels(shuffled);

                // Initialize like/comment/view counts from loaded data
                const lc = {}, cc = {}, vc = {};
                shuffled.forEach(r => {
                    lc[r.id] = r.like_count || 0;
                    cc[r.id] = r.comment_count || 0;
                    vc[r.id] = r.view_count || 0;
                });
                setLikeCounts(lc);
                setCommentCounts(cc);
                setViewCounts(vc);
            }
        } catch (e) {
            console.error('Load reels error:', e);
        }
        setLoading(false);
    };


    const currentReel = reels[currentIndex];

    const goNext = () => {
        if (slideDebounceRef.current) return;
        if (currentIndex < reels.length - 1) {
            slideDebounceRef.current = true;
            setSlideDirection('up');
            setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
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
            setTimeout(() => {
                setCurrentIndex(prev => prev - 1);
                setSlideDirection(null);
                slideDebounceRef.current = false;
            }, 250);
        }
    };

    // Infinite scroll — load more when near end
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
            const offset = nextPage * 50;
            const { data: postsData } = await supabase
                .from('social_posts')
                .select('id, author_id, content, media_urls, like_count, comment_count, created_at, visibility')
                .eq('visibility', 'public')
                .not('media_urls', 'is', null)
                .order('created_at', { ascending: false })
                .range(offset, offset + 49);
            const videos = (postsData || []).filter(p => {
                const url = p.media_urls?.[0];
                return url && (url.includes('youtube.com') || url.includes('youtu.be'));
            });
            if (videos.length === 0) {
                setHasMore(false);
            } else {
                const authorIds = [...new Set(videos.map(v => v.author_id))];
                const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url, full_name').in('id', authorIds);
                const pm = {}; (profiles || []).forEach(p => { pm[p.id] = p; });
                const mapped = videos.map(v => ({
                    id: v.id, video_url: v.media_urls[0], caption: v.content,
                    like_count: v.like_count || 0, comment_count: v.comment_count || 0,
                    created_at: v.created_at, profiles: pm[v.author_id] || { username: 'Anonymous' },
                }));
                setReels(prev => [...prev, ...mapped]);
                const lc = {}, cc = {}, vc = {};
                mapped.forEach(r => { lc[r.id] = r.like_count || 0; cc[r.id] = r.comment_count || 0; vc[r.id] = r.view_count || 0; });
                setLikeCounts(prev => ({ ...prev, ...lc }));
                setCommentCounts(prev => ({ ...prev, ...cc }));
                setViewCounts(prev => ({ ...prev, ...vc }));
                setPage(nextPage);
            }
        } catch (e) { console.error('Load more error:', e); }
        setLoadingMore(false);
    };

    // Haptic helper
    const haptic = (ms = 10) => { try { navigator?.vibrate?.(ms); } catch {} };

    // Track view count on reel change + auto-hide overlay
    useEffect(() => {
        if (currentReel?.id) {
            setVideoProgress(0); // Reset progress bar
            // Show overlay on reel change, auto-hide after 3s
            setOverlayVisible(true);
            clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => setOverlayVisible(false), 3000);
            // Deduplicated view count — only fire once per reel per session
            if (!viewedReelsRef.current.has(currentReel.id)) {
                viewedReelsRef.current.add(currentReel.id);
                (async () => { try { await supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'view_count' }); } catch {} })();
            }
        }
    }, [currentReel?.id]);

    const handleLike = async () => {
        if (!currentReel?.id || !user?.id) return;
        // Debounce: prevent rapid-fire
        if (likeDebounceRef.current) return;
        likeDebounceRef.current = true;
        setTimeout(() => { likeDebounceRef.current = false; }, 300);

        const postId = currentReel.id;
        const wasLiked = liked[postId];
        // Optimistic update
        setLiked(prev => ({ ...prev, [postId]: !wasLiked }));
        setLikeCounts(prev => ({ ...prev, [postId]: Math.max(0, (prev[postId] || currentReel.like_count || 0) + (wasLiked ? -1 : 1)) }));
        haptic(wasLiked ? 5 : 15);

        try {
            if (wasLiked) {
                await supabase.from('social_likes')
                    .delete()
                    .eq('post_id', postId)
                    .eq('user_id', user.id);
                busEmit.socialPostLiked(postId, user.id, { added: false, reactionType: 'like' });
                try { await supabase.rpc('decrement_post_count', { p_post_id: postId, p_field: 'like_count' }); } catch {}
            } else {
                await supabase.from('social_likes')
                    .insert({ post_id: postId, user_id: user.id, reaction_type: 'like' });
                busEmit.socialPostLiked(postId, user.id, { added: true, reactionType: 'like' });
                try { await supabase.rpc('increment_post_count', { p_post_id: postId, p_field: 'like_count' }); } catch {}
            }
        } catch (err) {
            // Rollback on error
            setLiked(prev => ({ ...prev, [postId]: wasLiked }));
            setLikeCounts(prev => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) + (wasLiked ? 1 : -1)) }));
        }
    };

    const handleComment = async () => {
        if (!currentReel) return;
        setShowCommentPanel(prev => !prev);
        if (!showCommentPanel && comments.length === 0) {
            try {
                const { data } = await supabase
                    .from('social_comments')
                    .select('id, content, created_at, media_url, media_type, profiles:author_id(username, avatar_url)')
                    .eq('post_id', currentReel.id)
                    .order('created_at', { ascending: true })
                    .limit(50);
                setComments(data || []);
                setCommentCounts(prev => ({ ...prev, [currentReel.id]: (data || []).length }));
            } catch (e) { console.error('Load comments:', e); }
        }
    };

    const submitComment = async () => {
        if (!commentText.trim() || !user?.id || !currentReel?.id) return;
        const text = commentText.trim();
        const tempId = Date.now();
        setSubmittingComment(true);
        setCommentText('');
        // Optimistic comment
        setComments(prev => [...prev, {
            id: tempId, content: text,
            profiles: { username: 'You', avatar_url: null },
            created_at: new Date().toISOString(),
        }]);
        try {
            const { error } = await supabase.from('social_comments')
                .insert({ post_id: currentReel.id, author_id: user.id, content: text });
            if (error) throw error;
            busEmit.socialCommentAdded(currentReel.id, user.id);
            try { await supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'comment_count' }); } catch {}
            setCommentCounts(prev => ({ ...prev, [currentReel.id]: (prev[currentReel.id] || 0) + 1 }));
        } catch {
            setComments(prev => prev.filter(c => c.id !== tempId));
        }
        setSubmittingComment(false);
    };

    const handleShare = async () => {
        if (!currentReel?.id) return;
        haptic(10);
        const url = window.location.origin + '/hub/reels?id=' + currentReel.id;
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Poker Reel', url });
            } else {
                await navigator.clipboard.writeText(url);
            }
            setShareToast(true);
            setTimeout(() => setShareToast(false), 2000);
            try { await supabase.rpc('increment_post_count', { p_post_id: currentReel.id, p_field: 'share_count' }); } catch {}
            if (user?.id) busEmit.socialPostShared(currentReel.id, user.id);
        } catch {
            setShareToast(true);
            setTimeout(() => setShareToast(false), 2000);
        }
    };

    // Reset comment panel when switching reels
    useEffect(() => {    const _c = new AbortController();

        setShowCommentPanel(false);
        setComments([]);
        setCommentText('');
    return () => _c.abort();
  }, [currentIndex]);

    const handleSave = async () => {
        if (!currentReel || !user) return;

        const isSaved = savedReels.has(currentReel.id);

        try {
            if (isSaved) {
                await savedReelsService.unsaveReel(user.id, currentReel.id);
                setSavedReels(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(currentReel.id);
                    return newSet;
                });
            } else {
                await savedReelsService.saveReel(user.id, {
                    id: currentReel.id,
                    video_url: currentReel.video_url,
                    caption: currentReel.caption
                });
                setSavedReels(prev => new Set([...prev, currentReel.id]));
            }
            busEmit.socialPostBookmarked(currentReel.id, user.id, { added: !isSaved });
        } catch (err) {
            console.warn('Save reel failed:', err);
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
        setShowCaptions: (val) => updatePreference('showCaptions', val)
    });

    // Handler refs — prevent stale closures in keyboard shortcuts
    const handleLikeRef = useRef(handleLike);
    const handleSaveRef = useRef(handleSave);
    const handleCommentRef = useRef(handleComment);
    handleLikeRef.current = handleLike;
    handleSaveRef.current = handleSave;
    handleCommentRef.current = handleComment;

    // Keyboard navigation
    useEffect(() => {    const _c = new AbortController();

        const handleKey = (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') goPrev();
            if (e.key === 'Escape') router.push('/hub/social-media');
            if (e.key === 'm' || e.key === 'M') setMuted(prev => !prev);
            if (e.key === 'l' || e.key === 'L') { handleLikeRef.current?.(); haptic(15); }
            if (e.key === 's' || e.key === 'S') handleSaveRef.current?.();
            if (e.key === 'c' || e.key === 'C') handleCommentRef.current?.();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);}, [currentIndex, router]);

    // Use refs to avoid stale closures in event handlers
    const currentIndexRef = useRef(currentIndex);
    const reelsLengthRef = useRef(reels.length);

    useEffect(() => {    const _c = new AbortController();
        currentIndexRef.current = currentIndex;
    return () => _c.abort();
  }, [currentIndex]);

    useEffect(() => {    const _c = new AbortController();
        reelsLengthRef.current = reels.length;
    return () => _c.abort();
  }, [reels.length]);

    // Slide helper for event handlers (uses refs, no stale closures)
    const slideToNext = () => {
        if (slideDebounceRef.current) return;
        if (currentIndexRef.current < reelsLengthRef.current - 1) {
            slideDebounceRef.current = true;
            setSlideDirection('up');
            setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
                setSlideDirection(null);
                slideDebounceRef.current = false;
            }, 250);
        }
    };
    const slideToPrev = () => {
        if (slideDebounceRef.current) return;
        if (currentIndexRef.current > 0) {
            slideDebounceRef.current = true;
            setSlideDirection('down');
            setTimeout(() => {
                setCurrentIndex(prev => prev - 1);
                setSlideDirection(null);
                slideDebounceRef.current = false;
            }, 250);
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
    useEffect(() => {    const _c = new AbortController();

        const handleTouchStart = (e) => {
            touchStartY.current = e.touches[0].clientY;
        };

        const handleTouchEnd = (e) => {
            const endY = e.changedTouches[0].clientY;
            const diff = touchStartY.current - endY;
            const threshold = 50; // Lower threshold for more responsive swipes

            if (Math.abs(diff) > threshold) {
                e.preventDefault();
                e.stopPropagation();

                try { navigator?.vibrate?.(10); } catch {}
                if (diff > 0) {
                    // Swipe up = next
                    slideToNextRef.current();
                } else {
                    // Swipe down = previous
                    slideToPrevRef.current();
                }
            }
        };

        // Mouse wheel with debounce
        let wheelTimeout = null;
        const handleWheel = (e) => {
            if (wheelTimeout) return;
            wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 400);
            if (e.deltaY > 30) {
                slideToNextRef.current();
            }
            if (e.deltaY < -30) {
                slideToPrevRef.current();
            }
        };

        // YouTube API message listener — auto-advance on video end
        const handleYTMessage = (e) => {
            try {
                if (typeof e.data !== 'string') return;
                const data = JSON.parse(e.data);
                // YouTube iframe API sends onStateChange with info.playerState
                if (data?.event === 'onStateChange' && data?.info === 0) {
                    // 0 = ended — auto-advance to next reel
                    slideToNextRef.current();
                }
                // Track progress from infoDelivery messages
                if (data?.info?.currentTime !== undefined && data?.info?.duration) {
                    const pct = (data.info.currentTime / data.info.duration) * 100;
                    setVideoProgress(Math.min(100, Math.max(0, pct)));
                }
                // Also handle ended state via infoDelivery format
                if (data?.info?.playerState === 0) {
                    slideToNextRef.current();
                }
            } catch {}
        };

        // CAPTURE phase - intercepts before iframe
        document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
        window.addEventListener('wheel', handleWheel, { passive: true });
        window.addEventListener('message', handleYTMessage);
        return () => { _c.abort();
            document.removeEventListener('touchstart', handleTouchStart, { capture: true });
            document.removeEventListener('touchend', handleTouchEnd, { capture: true });
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('message', handleYTMessage);
        };}, []);
  // Realtime subscription — live updates
  useEffect(() => {
    if (!user?.id) return;
    const _ch = supabase
      .channel(`reels:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_reels' }, () => {
        loadReels();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_posts' }, () => {
        loadReels();
      })
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
  }, [user?.id]);

    // EventBus listeners — sync state from other video viewers
    useEffect(() => {
        const handleLikeBus = (event) => {
            const d = event?.payload;
            if (d?.postId) {
                setLiked(prev => ({ ...prev, [d.postId]: d.added }));
                // Only adjust count for events from OTHER components (avoid double-count with optimistic update)
                if (d.userId !== user?.id) {
                    setLikeCounts(prev => ({
                        ...prev,
                        [d.postId]: Math.max(0, (prev[d.postId] || 0) + (d.added ? 1 : -1))
                    }));
                }
            }
        };
        const handleBookmarkBus = (event) => {
            const d = event?.payload;
            if (d?.postId && user?.id) {
                setSavedReels(prev => {
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
                setCommentCounts(prev => ({
                    ...prev,
                    [d.postId]: (prev[d.postId] || 0) + 1
                }));
            }
        };
        eventBus.on(EventType.SOCIAL_POST_LIKED, handleLikeBus);
        eventBus.on(EventType.SOCIAL_POST_BOOKMARKED, handleBookmarkBus);
        eventBus.on(EventType.SOCIAL_COMMENT_ADDED, handleCommentBus);
        return () => {
            eventBus.off(EventType.SOCIAL_POST_LIKED, handleLikeBus);
            eventBus.off(EventType.SOCIAL_POST_BOOKMARKED, handleBookmarkBus);
            eventBus.off(EventType.SOCIAL_COMMENT_ADDED, handleCommentBus);
        };
    }, [user?.id]);


    if (loading) {
        return (
            <>
                <SEOHead
                    title="Poker Reels — Short Poker Content"
                    description="Watch And Share Short Poker Videos, Highlights, And Tips On Smarter.Poker Reels."
                    canonical="/hub/reels"
                />
                <div style={{
                    position: 'fixed', inset: 0, background: C.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: 20,
                }}>
                    {/* Shimmer skeleton */}
                    <div style={{
                        width: 280, height: 500, borderRadius: 16,
                        background: 'linear-gradient, paddingBottom: 70(110deg, #1a1a1a 8%, #2a2a2a 18%, #1a1a1a 33%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s linear infinite',
                    }} />
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: '50%',
                            background: 'linear-gradient(110deg, #1a1a1a 8%, #2a2a2a 18%, #1a1a1a 33%)',
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 1.5s linear infinite',
                        }} />
                        <div>
                            <div style={{ width: 120, height: 14, borderRadius: 7, background: '#1a1a1a', marginBottom: 6 }} />
                            <div style={{ width: 60, height: 10, borderRadius: 5, background: '#1a1a1a' }} />
                        </div>
                    </div>
                    <style jsx>{`@keyframes shimmer { to { background-position-x: -200%; } }`}</style>
                </div>
            </>
        );
    }

    if (!reels.length) {
        return (
            <>
                <Head><title>Reels | Smarter Poker</title></Head>
                <div style={{
                    position: 'fixed', inset: 0, background: C.bg,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 9l5 3-5 3V9z" fill="#888" /></svg>
                    <h1 style={{ color: C.text, fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
                        No Reels Yet
                    </h1>
                    <p style={{ color: C.textSec, fontSize: 16, marginBottom: 32, textAlign: 'center', maxWidth: 300 }}>
                        Fresh poker clips are posted hourly!
                    </p>
                    <Link href="/hub/social-media" style={{
                        padding: '12px 32px',
                        background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
                        color: 'white', borderRadius: 8, fontWeight: 600, textDecoration: 'none',
                    }}>
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
                <title>Reels | Smarter Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            {/* Universal Header */}
            <UniversalHeader
                pageDepth={1}
                onMenuClick={() => setMenuOpen(true)}
            />

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
                        position: 'absolute', top: 16, left: 16, zIndex: 100,
                        width: 44, height: 44, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 20, textDecoration: 'none',
                    }}
                >←</Link>

                {/* Title */}
                <div style={{
                    position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                    color: 'white', fontWeight: 700, fontSize: 18, zIndex: 100,
                }}>
                    Reels
                </div>

                {/* Engagement Stats Pill */}
                <div style={{
                    opacity: overlayVisible ? 1 : 0,
                    transition: 'opacity 0.35s ease',
                    pointerEvents: overlayVisible ? 'auto' : 'none',
                    position: 'absolute', top: 20, right: 16, zIndex: 100,
                    display: 'flex', gap: 12, padding: '6px 14px', borderRadius: 20,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                }}>
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        {viewCounts[currentReel?.id] || currentReel?.view_count || 0}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                        {likeCounts[currentReel?.id] ?? (currentReel?.like_count || 0)}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                        {commentCounts[currentReel?.id] || 0}
                    </span>
                </div>

                {/* VIDEO WRAPPER with slide animation */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    clipPath: 'inset(0)',
                    background: '#000',
                    transition: slideDirection ? 'transform 0.25s ease-out, opacity 0.2s ease-out' : 'none',
                    transform: slideDirection === 'up' ? 'translateY(-100%)' : slideDirection === 'down' ? 'translateY(100%)' : 'translateY(0)',
                    opacity: slideDirection ? 0.3 : 1,
                }}>
                    {/* Videos auto-play immediately (muted per browser policy) */}

                    {/* Auto-play immediately - muted for browser compliance */}
                    {videoId ? (
                        <iframe
                            ref={iframeRef}
                            key={currentReel?.id}
                            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&iv_load_policy=3&disablekb=1&fs=0&cc_load_policy=0`}
                            title="Poker Reel"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                            allowFullScreen
                            onLoad={() => {
                                // Send playVideo immediately on load for all browsers
                                sendYouTubeCommand('playVideo');
                                // Also try again after a short delay for Safari
                                setTimeout(() => {
                                    sendYouTubeCommand('playVideo');
                                    if (userWantsSound) {
                                        sendYouTubeCommand('unMute');
                                        sendYouTubeCommand('setVolume', [100]);
                                    }
                                }, 300);
                            }}
                            style={{
                                position: 'absolute',
                                top: -40,
                                left: -40,
                                width: 'calc(100% + 80px)',
                                height: 'calc(100% + 80px)',
                                border: 'none',
                                pointerEvents: 'none',
                            }}
                        />
                    ) : null}
                </div>

                {/* Video Progress Bar */}
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: 3,
                    background: 'rgba(255,255,255,0.15)',
                    zIndex: 60,
                    pointerEvents: 'none',
                }}>
                    <div style={{
                        width: `${videoProgress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #00d4ff, #7c3aed)',
                        borderRadius: '0 2px 2px 0',
                        transition: 'width 0.3s linear',
                        boxShadow: '0 0 8px rgba(0,212,255,0.5)',
                    }} />
                </div>

                {/* INVISIBLE TAP ZONES - for navigation */}
                {/* LEFT ZONE - tap for previous */}
                <div
                    onClick={goPrev}
                    style={{
                        position: 'absolute',
                        top: 80,
                        left: 0,
                        width: '30%',
                        height: 'calc(100% - 200px)',
                        zIndex: 50,
                        cursor: 'pointer',
                    }}
                />
                {/* CENTER ZONE - tap to toggle overlay */}
                <div
                    onClick={() => {
                        setOverlayVisible(v => {
                            const next = !v;
                            clearTimeout(overlayTimerRef.current);
                            if (next) {
                                overlayTimerRef.current = setTimeout(() => setOverlayVisible(false), 3000);
                            }
                            return next;
                        });
                    }}
                    style={{
                        position: 'absolute',
                        top: 80,
                        left: '30%',
                        width: '40%',
                        height: 'calc(100% - 200px)',
                        zIndex: 50,
                        cursor: 'pointer',
                    }}
                />
                {/* RIGHT ZONE - tap for next */}
                <div
                    onClick={goNext}
                    style={{
                        position: 'absolute',
                        top: 80,
                        right: 0,
                        width: '30%',
                        height: 'calc(100% - 200px)',
                        zIndex: 50,
                        cursor: 'pointer',
                    }}
                />

                {!videoId && (
                    <div style={{
                        width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666',
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 9l5 3-5 3V9z" fill="#666" /></svg>
                            <div>Video Loading...</div>
                        </div>
                    </div>
                )}

                {/* Bottom gradient for text readability */}
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 300,
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0.9))',
                    pointerEvents: 'none', zIndex: 90,
                    opacity: overlayVisible ? 1 : 0,
                    transition: 'opacity 0.35s ease',
                }} />

                {/* Author info overlay */}
                <div style={{
                    position: 'absolute', bottom: 120, left: 16, right: 80, zIndex: 100,
                    opacity: overlayVisible ? 1 : 0,
                    transition: 'opacity 0.35s ease',
                    pointerEvents: overlayVisible ? 'auto' : 'none',
                }}>
                    <Link href={`/hub/user/${currentReel?.profiles?.username}`} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        textDecoration: 'none', marginBottom: 12,
                    }}>
                        <img
                            src={currentReel?.profiles?.avatar_url || '/default-avatar.png'}
                            style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid white' }}
                         loading="lazy" />
                        <div>
                            <div style={{ color: 'white', fontWeight: 600, fontSize: 15, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                                {currentReel?.profiles?.full_name || currentReel?.profiles?.username}
                            </div>
                            <div style={{ color: C.textSec, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {timeAgo(currentReel?.created_at)}
                                <span style={{ opacity: 0.6 }}>·</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    {viewCounts[currentReel?.id] || currentReel?.view_count || 0}
                                </span>
                                <span style={{ opacity: 0.6 }}>·</span>
                                <span style={{ fontSize: 11, opacity: 0.7 }}>{currentIndex + 1}/{reels.length}</span>
                            </div>
                        </div>
                    </Link>

                    {currentReel?.caption && (
                        <p style={{
                            color: 'white', fontSize: 14, margin: 0,
                            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                            maxWidth: '80%',
                        }}>
                            {currentReel.caption.length > 100 ? currentReel.caption.slice(0, 100) + '...' : currentReel.caption}
                        </p>
                    )}
                </div>

                {/* Action buttons (right side) */}
                <div style={{
                    position: 'absolute', bottom: 140, right: 16,
                    display: 'flex', flexDirection: 'column', gap: 20, zIndex: 100,
                    opacity: overlayVisible ? 1 : 0,
                    transition: 'opacity 0.35s ease',
                    pointerEvents: overlayVisible ? 'auto' : 'none',
                }}>
                    {/* Like */}
                    <button onClick={() => {
                        handleLike();
                        if (!liked[currentReel?.id]) {
                            setShowHeart(true);
                            setTimeout(() => setShowHeart(false), 800);
                        }
                    }} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill={liked[currentReel?.id] ? '#ef4444' : 'none'} stroke={liked[currentReel?.id] ? '#ef4444' : 'white'} strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                        <span style={{ color: 'white', fontSize: 12, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            {likeCounts[currentReel?.id] ?? (currentReel?.like_count || 0)}
                        </span>
                    </button>

                    {/* Comment */}
                    <button onClick={handleComment} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                        <span style={{ color: showCommentPanel ? '#1877F2' : 'white', fontSize: 12, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            {(commentCounts[currentReel?.id] || comments.length) > 0
                                ? (commentCounts[currentReel?.id] || comments.length)
                                : 'Comment'}
                        </span>
                    </button>

                    {/* Share */}
                    <button onClick={handleShare} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                        <span style={{ color: 'white', fontSize: 12, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Share</span>
                    </button>

                    {/* Save */}
                    <button onClick={handleSave} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill={savedReels.has(currentReel?.id) ? 'white' : 'none'} stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                        <span style={{ color: 'white', fontSize: 12, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            {savedReels.has(currentReel?.id) ? 'Saved' : 'Save'}
                        </span>
                    </button>

                    {/* Sound */}
                    <button onClick={muted ? handleUnmute : handleMute} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        {muted ? (
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                        ) : (
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                        )}
                    </button>
                </div>

                {/* Instagram-style heart burst with particles */}
                {showHeart && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 150, width: 120, height: 120 }}>
                        {/* Main heart */}
                        <svg width="80" height="80" viewBox="0 0 24 24" style={{
                            position: 'absolute', top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            animation: 'heartBurstMain 0.8s ease-out forwards',
                            filter: 'drop-shadow(0 0 20px rgba(239,68,68,0.6))',
                        }}>
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="#ef4444" stroke="#ff6b6b" strokeWidth="1"/>
                        </svg>
                        {/* Particle hearts */}
                        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
                            <svg key={i} width="18" height="18" viewBox="0 0 24 24" style={{
                                position: 'absolute', top: '50%', left: '50%',
                                animation: `heartParticle${i} 0.7s ${i * 0.05}s ease-out forwards`,
                                opacity: 0,
                            }}>
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill={['#ef4444','#ff6b6b','#f472b6','#ef4444','#ff6b6b','#f472b6'][i]}/>
                            </svg>
                        ))}
                    </div>
                )}

                {/* Share Toast */}
                {shareToast && (
                    <div style={{
                        position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(255,255,255,0.15)', color: 'white',
                        padding: '8px 20px', borderRadius: 20, fontSize: 14, zIndex: 200,
                        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                    }}>Link Copied</div>
                )}

                {/* Center double-tap zone */}
                <div
                    onClick={(e) => {
                        const now = Date.now();
                        if (now - lastTapRef.current < 300) {
                            // Double tap!
                            if (!liked[currentReel?.id]) {
                                handleLike();
                                setShowHeart(true);
                                setTimeout(() => setShowHeart(false), 800);
                            }
                        }
                        lastTapRef.current = now;
                    }}
                    style={{
                        position: 'absolute', top: '20%', left: '15%',
                        width: '70%', height: '40%', zIndex: 55,
                    }}
                />

                {/* Heart burst + slide animation CSS */}
                <style jsx>{`
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
                `}</style>

                {/* Comment Panel */}
                {showCommentPanel && (
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 200,
                        background: 'rgba(0,0,0,0.95)', borderRadius: '16px 16px 0 0',
                        maxHeight: '50vh', display: 'flex', flexDirection: 'column',
                    }}>
                        <div style={{
                            padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <span style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Comments</span>
                            <button onClick={() => setShowCommentPanel(false)} style={{
                                background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer'
                            }}>x</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', maxHeight: 250 }}>
                            {comments.length === 0 && (
                                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: 20, fontSize: 14 }}>
                                    No comments yet. Be the first!
                                </div>
                            )}
                            {comments.map((c, i) => (
                                <div key={c.id || i} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: '50%', background: '#333',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 14, color: 'white', flexShrink: 0
                                    }}>{(c.profiles?.username || c.author?.username || 'U').charAt(0).toUpperCase()}</div>
                                    <div>
                                        <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{c.profiles?.username || c.author?.username || 'User'}</span>
                                        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2 }}>{c.content}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{
                            padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex', gap: 8
                        }}>
                            <input
                                value={commentText}
                                onChange={e => setCommentText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                                placeholder="Add A Comment..."
                                style={{
                                    flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.1)',
                                    border: 'none', borderRadius: 20, fontSize: 14, color: 'white', outline: 'none'
                                }}
                            />
                            <button
                                onClick={submitComment}
                                disabled={!commentText.trim() || submittingComment}
                                style={{
                                    padding: '8px 16px', background: '#1877F2', color: 'white',
                                    border: 'none', borderRadius: 20, fontWeight: 600, fontSize: 13,
                                    cursor: commentText.trim() ? 'pointer' : 'not-allowed',
                                    opacity: commentText.trim() ? 1 : 0.5
                                }}
                            >{submittingComment ? '...' : 'Post'}</button>
                        </div>
                    </div>
                )}

                {/* Preload next reel thumbnail in background */}
                {reels[currentIndex + 1] && (() => {
                    const nextVid = getYouTubeVideoId(reels[currentIndex + 1]?.video_url);
                    return nextVid ? <img src={`https://img.youtube.com/vi/${nextVid}/hqdefault.jpg`} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} alt="" /> : null;
                })()}

                {/* Swipe instruction + position */}
                {!showCommentPanel && (
                    <div style={{
                        position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 100,
                        opacity: overlayVisible ? 1 : 0,
                        transition: 'opacity 0.35s ease',
                        pointerEvents: 'none',
                    }}>
                        {loadingMore ? (
                            <div style={{
                                width: 24, height: 24, border: '2px solid rgba(255,255,255,0.3)',
                                borderTopColor: 'white', borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                            }} />
                        ) : currentIndex < reels.length - 1 ? (
                            <>
                                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Swipe Up For Next</span>
                                <span style={{ fontSize: 20, marginTop: 4, color: 'rgba(255,255,255,0.6)' }}>↑</span>
                            </>
                        ) : (
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                                {hasMore ? 'Loading more...' : 'You\'ve seen all reels'}
                            </span>
                        )}
                    </div>
                )}

                {/* Spin animation for loader */}
                <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>


            </div >
        </>
    );
}
