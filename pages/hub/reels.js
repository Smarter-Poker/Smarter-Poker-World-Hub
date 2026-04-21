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
import GiphyPicker from '../../src/components/shared/GiphyPicker';
import { getAccessToken } from '../../src/lib/authUtils';


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
    const [muted, setMuted] = useState(false); // Sound always ON — we unmute aggressively after autoplay
    const [userWantsSound, setUserWantsSound] = useState(true); // Sound ON by default
    // Auto-play immediately - no tap required since videos are muted (browser policy compliant)
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
    const overlayTimerRef = useRef(null);
    const viewedReelsRef = useRef(new Set());
    const [refreshing, setRefreshing] = useState(false);
    // #4 Not Interested — persist disliked reel IDs in localStorage
    const [notInterestedIds, setNotInterestedIds] = useState(() => {
        if (typeof window !== 'undefined') {
            try { return new Set(JSON.parse(localStorage.getItem('reels-not-interested') || '[]')); } catch { return new Set(); }
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
    // Phase 6 — Comment engagement
    const [commentLikes, setCommentLikes] = useState({});
    const [replyTo, setReplyTo] = useState(null);
    // Phase 7 — Power features
    const [editingComment, setEditingComment] = useState(null);
    const [editCommentText, setEditCommentText] = useState('');
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [showContextMenu, setShowContextMenu] = useState(false);
    const longPressTimerRef = useRef(null);
    // Phase 8 — Comment sort, char counter, copy link
    const [commentSort, setCommentSort] = useState('newest');
    const [copyToast, setCopyToast] = useState(false);
    const COMMENT_MAX_LENGTH = 280;
    // #10 Error Toast for failed operations
    const [errorToast, setErrorToast] = useState(null);
    const showErrorToast = (msg) => { setErrorToast(msg); setTimeout(() => setErrorToast(null), 3000); };
    // #6 Comment Like Counts (per-comment)
    const [commentLikeCounts, setCommentLikeCounts] = useState({});
    // UX Overhaul — More menu + Reaction picker
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const reactionTimerRef = useRef(null);
    // Phase 10 — Universal HUD auto-hide (5s timeout for usability)
    const [showOverlay, setShowOverlay] = useState(false);
    const hudTimerRef = useRef(null);
    const revealOverlay = () => {
        setShowOverlay(true);
        setShowReactionPicker(false);
        setShowMoreMenu(false);
        clearTimeout(hudTimerRef.current);
        hudTimerRef.current = setTimeout(() => { setShowOverlay(false); setShowReactionPicker(false); setShowMoreMenu(false); }, 5000);
    };
    const pullStartY = useRef(null);
    
    // Phase 9: Long Press Context Menu
    const handleTouchStart = () => {
        longPressTimerRef.current = setTimeout(() => {
            haptic(20);
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
                try { setWatchedReelIds(JSON.parse(saved)); } catch (e) { console.warn('[App] Handled exception:', e); }
            }
        }
    }, []);


    // Reels preferences state
    const [preferences, setPreferences] = useState({
        autoplay: true,
        soundOnScroll: true,
        dataSaver: false,
        showCaptions: true
    });

    // Load sound preference from localStorage on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedPref = localStorage.getItem('reels-sound-enabled');
            // Sound is ON by default — only turn off if explicitly set to false
            if (savedPref === 'false') {
                setUserWantsSound(false);
                setMuted(true);
            }
        }
    }, []);

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
                const savedIds = new Set(saved.map(item => item.reel_id));
                setSavedReels(savedIds);

                // Pre-fetch existing likes (filter by reaction_type='like')
                const { data: likeData } = await supabase
                    .from('social_likes')
                    .select('post_id')
                    .eq('user_id', authUser.id)
                    .eq('reaction_type', 'like');
                if (likeData) {
                    const likeMap = {};
                    likeData.forEach(l => { likeMap[l.post_id] = true; });
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
                    dislikeData.forEach(d => { dislikeMap[d.post_id] = true; });
                    setDisliked(dislikeMap);
                }

                // Pre-fetch follows
                const { data: followData } = await supabase
                    .from('follows')
                    .select('following_id')
                    .eq('follower_id', authUser.id);
                if (followData) {
                    const followMap = {};
                    followData.forEach(f => { followMap[f.following_id] = true; });
                    setFollowing(followMap);
                }
            }
        };
        loadUserData();
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

    // Auto-play AND auto-unmute on every reel — sound must ALWAYS be on
    useEffect(() => {
        if (!loading && reels.length > 0) {
            // Aggressive unmute retry loop: 300ms, 800ms, 1500ms, 3000ms
            // YouTube iframe starts muted for autoplay compliance, we unmute immediately after
            const delays = [300, 800, 1500, 3000];
            const timers = delays.map(delay => setTimeout(() => {
                sendYouTubeCommand('playVideo');
                if (userWantsSound) {
                    sendYouTubeCommand('unMute');
                    sendYouTubeCommand('setVolume', [100]);
                    setMuted(false);
                }
            }, delay));
            return () => timers.forEach(t => clearTimeout(t));
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

    useEffect(() => {
        loadReels();
    }, []);

    const loadReels = async(signal) => {
        setLoading(true);
        try {
            const initialId = router.query.id;

            // Load from social_reels (YouTube shorts posted by SmarterPokerOfficial)
            const { data: reelsData } = await supabase
                .from('social_reels')
                .select('id, author_id, caption, video_url, view_count, like_count, comment_count, created_at, is_public')
                .eq('is_public', true)
                .order('created_at', { ascending: false })
                .limit(50);

            // Load from social_posts (posts with YouTube videos in media_urls)
            const { data: postsData } = await supabase
                .from('social_posts')
                .select('id, author_id, content, content_type, media_urls, like_count, comment_count, created_at, visibility')
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
                    like_count: reel.like_count || 0,
                    comment_count: reel.comment_count || 0,
                    view_count: reel.view_count || 0,
                    created_at: reel.created_at,
                    source: 'reels'
                })));
            }

            // Add videos from social_posts (only YouTube links)
            if (postsData && postsData.length > 0) {
                allVideos.push(...postsData
                    .filter(post => {
                        if (!post.media_urls || post.media_urls.length === 0) return false;
                        // Include posts with YouTube URLs or native video uploads
                        const url = post.media_urls[0];
                        return post.content_type === 'video' || (url && (url.includes('youtube.com') || url.includes('youtu.be') || url.match(/\.(mp4|webm|mov)(\?|$)/i)));
                    })
                    .map(post => ({
                        id: post.id,
                        author_id: post.author_id,
                        video_url: post.media_urls[0],
                        caption: post.content,
                        like_count: post.like_count || 0,
                        comment_count: post.comment_count || 0,
                        view_count: 0,
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
                    author_id: video.author_id,
                    video_url: video.video_url,
                    caption: video.caption,
                    like_count: video.like_count,
                    comment_count: video.comment_count,
                    view_count: video.view_count,
                    created_at: video.created_at,
                    profiles: profileMap[video.author_id] || { username: 'Anonymous' },
                }));

                // Fisher-Yates shuffle for unbiased randomization
                const shuffled = [...mappedReels];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                // #4 Not Interested — move disliked reels to end of feed
                const fresh = shuffled.filter(r => !notInterestedIds.has(r.id));
                const stale = shuffled.filter(r => notInterestedIds.has(r.id));

                if (initialId) {
                    const targetIdx = fresh.findIndex(r => r.id === initialId);
                    if (targetIdx > 0) {
                        const target = fresh.splice(targetIdx, 1)[0];
                        fresh.unshift(target);
                    } else if (targetIdx === -1) {
                        const staleIdx = stale.findIndex(r => r.id === initialId);
                        if (staleIdx !== -1) {
                            const target = stale.splice(staleIdx, 1)[0];
                            fresh.unshift(target);
                        } else {
                            // Video wasn't in the first 150 items. Query directly.
                            let directReel = null;
                            const { data: pData } = await supabase.from('social_posts').select('id, author_id, content, media_urls, like_count, comment_count, created_at').eq('id', initialId).maybeSingle();
                            if (pData) {
                                directReel = { id: pData.id, author_id: pData.author_id, video_url: pData.media_urls?.[0], caption: pData.content, like_count: pData.like_count || 0, comment_count: pData.comment_count || 0, view_count: 0, created_at: pData.created_at, source: 'posts' };
                            } else {
                                const { data: rData } = await supabase.from('social_reels').select('*').eq('id', initialId).maybeSingle();
                                if (rData) {
                                    directReel = { id: rData.id, author_id: rData.author_id, video_url: rData.video_url, caption: rData.caption, like_count: rData.like_count || 0, comment_count: rData.comment_count || 0, view_count: rData.view_count || 0, created_at: rData.created_at, source: 'reels' };
                                }
                            }
                            if (directReel) {
                                let pMap = profileMap[directReel.author_id];
                                if (!pMap) {
                                    const { data: dProfile } = await supabase.from('profiles').select('id, username, avatar_url, full_name').eq('id', directReel.author_id).maybeSingle();
                                    pMap = dProfile || { username: 'Anonymous' };
                                }
                                directReel.profiles = pMap;
                                fresh.unshift(directReel);
                            }
                        }
                    }
                    setCurrentIndex(0);
                }

                setReels([...fresh, ...stale]);

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
            console.warn('Load reels error:', e);
            setLoadError(true);
        }
        setLoading(false);
    };

    // Helper to safely increment counts for reels OR posts
    const incrementMetric = async (reel, field, amount) => {
        if (!reel?.id) return;
        try {
            if (reel.source === 'reels') {
                const { data } = await supabase.from('social_reels').select(field).eq('id', reel.id).maybeSingle();
                if (data) {
                    await supabase.from('social_reels').update({ [field]: Math.max(0, (data[field] || 0) + amount) }).eq('id', reel.id);
                }
            } else {
                const rpc = amount > 0 ? 'increment_post_count' : 'decrement_post_count';
                await supabase.rpc(rpc, { p_post_id: reel.id, p_field: field });
            }
        } catch (e) {
            console.warn('[Engagement] Update failed:', e);
        }
    };

    // Deep-link: if ?id= is in URL, scroll to that reel after load
    useEffect(() => {
        if (reels.length > 0 && router.query.id) {
            const targetIdx = reels.findIndex(r => r.id === router.query.id);
            if (targetIdx > 0 && targetIdx !== currentIndex) {
                setCurrentIndex(targetIdx);
            }
        }
    }, [reels.length, router.query.id]);


    const currentReel = reels[currentIndex];

    // Phase 9: Watched Indicator Timer
    useEffect(() => {
        if (!currentReel?.id) return;
        const watchTimer = setTimeout(() => {
            setWatchedReelIds(prev => {
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
            const allNewVideos = [];

            // Fetch more social_reels
            const { data: reelsData } = await supabase
                .from('social_reels')
                .select('id, author_id, caption, video_url, view_count, like_count, comment_count, created_at, is_public')
                .eq('is_public', true)
                .order('created_at', { ascending: false })
                .range(offset, offset + 49);
            if (reelsData && reelsData.length > 0) {
                allNewVideos.push(...reelsData.map(reel => ({
                    id: reel.id, author_id: reel.author_id, video_url: reel.video_url,
                    caption: reel.caption, like_count: reel.like_count || 0,
                    comment_count: reel.comment_count || 0, view_count: reel.view_count || 0,
                    created_at: reel.created_at, source: 'reels',
                })));
            }

            // Fetch more social_posts with YouTube links
            const { data: postsData } = await supabase
                .from('social_posts')
                .select('id, author_id, content, content_type, media_urls, like_count, comment_count, created_at, visibility')
                .eq('visibility', 'public')
                .not('media_urls', 'is', null)
                .order('created_at', { ascending: false })
                .range(offset, offset + 49);
            const videos = (postsData || []).filter(p => {
                const url = p.media_urls?.[0];
                return p.content_type === 'video' || (url && (url.includes('youtube.com') || url.includes('youtu.be') || url.match(/\.(mp4|webm|mov)(\?|$)/i)));
            });
            if (videos.length > 0) {
                allNewVideos.push(...videos.map(v => ({
                    id: v.id, author_id: v.author_id, video_url: v.media_urls[0],
                    caption: v.content, like_count: v.like_count || 0,
                    comment_count: v.comment_count || 0, view_count: 0,
                    created_at: v.created_at, source: 'posts',
                })));
            }

            if (allNewVideos.length === 0) {
                setHasMore(false);
            } else {
                // Deduplicate against already-loaded reels
                const existingIds = new Set(reels.map(r => r.id));
                const uniqueNew = allNewVideos.filter(v => !existingIds.has(v.id));
                if (uniqueNew.length === 0) {
                    setHasMore(false);
                } else {
                    const authorIds = [...new Set(uniqueNew.map(v => v.author_id))];
                    const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url, full_name').in('id', authorIds);
                    const pm = {}; (profiles || []).forEach(p => { pm[p.id] = p; });
                    const mapped = uniqueNew.map(v => ({
                        id: v.id, author_id: v.author_id, video_url: v.video_url, caption: v.caption,
                        like_count: v.like_count, comment_count: v.comment_count, view_count: v.view_count,
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
            }
        } catch (e) { console.warn('Load more error:', e); }
        setLoadingMore(false);
    };

    // Haptic helper
    const haptic = (ms = 10) => { try { navigator?.vibrate?.(ms); } catch (e) { console.warn('[App] Handled exception:', e); } };

    // Track view count on reel change
    useEffect(() => {
        if (currentReel?.id) {
            setVideoProgress(0);
            setCaptionExpanded(false);
            // Deduplicated view count — only fire once per reel per session (auth only)
            if (user?.id && !viewedReelsRef.current.has(currentReel.id)) {
                viewedReelsRef.current.add(currentReel.id);
                // Increment in DB AND update local state so UI reflects the view
                const reelId = currentReel.id;
                setViewCounts(prev => ({ ...prev, [reelId]: (prev[reelId] || currentReel.view_count || 0) + 1 }));
                incrementMetric(currentReel, 'view_count', 1);
            }
        }
    }, [currentReel?.id]);

    const handleLike = async () => {
        if (!currentReel?.id || !user?.id) return;
        if (likeDebounceRef.current) return;
        likeDebounceRef.current = true;
        setTimeout(() => { likeDebounceRef.current = false; }, 300);

        const postId = currentReel.id;
        const wasLiked = liked[postId];
        setLiked(prev => ({ ...prev, [postId]: !wasLiked }));
        setLikeCounts(prev => ({ ...prev, [postId]: Math.max(0, (prev[postId] || currentReel.like_count || 0) + (wasLiked ? -1 : 1)) }));
        // #7 Animated Like Counter — trigger bounce
        setLikeBounceId(postId);
        setTimeout(() => setLikeBounceId(null), 400);
        haptic(wasLiked ? 5 : 15);
        // Mutual exclusion: remove dislike when liking
        if (!wasLiked && disliked[postId]) {
            setDisliked(prev => ({ ...prev, [postId]: false }));
            try { await supabase.from('social_likes').delete().eq('post_id', postId).eq('user_id', user.id).eq('reaction_type', 'dislike'); } catch (e) { console.warn('[App] Handled exception:', e); }
        }

        try {
            if (wasLiked) {
                await supabase.from('social_likes').delete().eq('post_id', postId).eq('user_id', user.id).eq('reaction_type', 'like');
                busEmit.socialPostLiked(postId, user.id, { added: false, reactionType: 'like' });
                incrementMetric(currentReel, 'like_count', -1);
            } else {
                await supabase.from('social_likes').insert({ post_id: postId, user_id: user.id, reaction_type: 'like' });
                busEmit.socialPostLiked(postId, user.id, { added: true, reactionType: 'like' });
                incrementMetric(currentReel, 'like_count', 1);
            }
        } catch (err) {
            setLiked(prev => ({ ...prev, [postId]: wasLiked }));
            setLikeCounts(prev => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) + (wasLiked ? 1 : -1)) }));
            showErrorToast('Like failed \u2014 try again');
        }
    };

    const handleDislike = async () => {
        if (!currentReel?.id || !user?.id) return;
        if (likeDebounceRef.current) return;
        likeDebounceRef.current = true;
        setTimeout(() => { likeDebounceRef.current = false; }, 300);

        const postId = currentReel.id;
        const wasDisliked = disliked[postId];
        setDisliked(prev => ({ ...prev, [postId]: !wasDisliked }));
        haptic(wasDisliked ? 5 : 10);
        // Mutual exclusion: remove like when disliking
        if (!wasDisliked && liked[postId]) {
            setLiked(prev => ({ ...prev, [postId]: false }));
            setLikeCounts(prev => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) - 1) }));
            try {
                await supabase.from('social_likes').delete().eq('post_id', postId).eq('user_id', user.id).eq('reaction_type', 'like');
                incrementMetric(currentReel, 'like_count', -1);
            } catch (e) { console.warn('[App] Handled exception:', e); }
        }
        try {
            if (wasDisliked) {
                await supabase.from('social_likes').delete().eq('post_id', postId).eq('user_id', user.id).eq('reaction_type', 'dislike');
                // #4 Not Interested — remove from filter
                setNotInterestedIds(prev => { const n = new Set(prev); n.delete(postId); if (typeof window !== 'undefined') localStorage.setItem('reels-not-interested', JSON.stringify([...n])); return n; });
            } else {
                await supabase.from('social_likes').insert({ post_id: postId, user_id: user.id, reaction_type: 'dislike' });
                // #4 Not Interested — add to filter
                setNotInterestedIds(prev => { const n = new Set(prev); n.add(postId); if (typeof window !== 'undefined') localStorage.setItem('reels-not-interested', JSON.stringify([...n])); return n; });
            }
        } catch {
            setDisliked(prev => ({ ...prev, [postId]: wasDisliked }));
        }
    };

    const handleFollow = async () => {
        const authorId = currentReel?.author_id || currentReel?.profiles?.id;
        if (!authorId || !user?.id || authorId === user.id) return;
        const wasFollowing = following[authorId];
        setFollowing(prev => ({ ...prev, [authorId]: !wasFollowing }));
        haptic(wasFollowing ? 5 : 15);
        try {
            if (wasFollowing) {
                await supabase.from('follows').delete()
                    .eq('follower_id', user.id).eq('following_id', authorId);
            } else {
                await supabase.from('follows').insert({
                    follower_id: user.id, following_id: authorId
                });
            }
            busEmit.socialFollowChanged && busEmit.socialFollowChanged(authorId, user.id, { added: !wasFollowing });
        } catch {
            setFollowing(prev => ({ ...prev, [authorId]: wasFollowing }));
            showErrorToast('Follow failed \u2014 try again');
        }
    };

    const handleReport = async () => {
        if (!currentReel?.id || !user?.id || !reportReason.trim()) return;
        try {
            await supabase.from('social_interactions').insert({
                user_id: user.id, post_id: currentReel.id,
                interaction_type: 'report', metadata: { reason: reportReason.trim() }
            });
            setReportSubmitted(true);
            setTimeout(() => { setShowReportModal(false); setReportSubmitted(false); setReportReason(''); }, 2000);
        } catch { /* silent */ }
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
                    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82));
                    uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
                } catch { uploadFile = file; }
            }
            const formData = new FormData();
            formData.append('image', uploadFile);
            const token = getAccessToken();
            const resp = await fetch('/api/social/upload-comment-image', {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                body: formData,
            });
            const result = await resp.json();
            if (resp.ok && result.success) {
                setCommentMediaUrl(result.url);
                setCommentMediaType('image');
            }
        } catch (err) { console.warn('[ReelComment] Upload error:', err); }
        setUploadingImage(false);
    };

    // Upload error toast state
    const [uploadErrorToast, setUploadErrorToast] = useState(false);

    const handleComment = async () => {
        if (!currentReel) return;
        const wasOpen = showCommentPanel;
        setShowCommentPanel(prev => !prev);
        // Always fetch fresh comments when opening (not closing)
        if (!wasOpen) {
            setCommentPage(0);
            try {
                const { data } = await supabase
                    .from('social_comments')
                    .select('id, content, created_at, media_url, media_type, profiles:author_id(username, avatar_url)')
                    .eq('post_id', currentReel.id)
                    .order('created_at', { ascending: commentSort === 'oldest' })
                    .limit(50);
                setComments(data || []);
                setHasMoreComments((data || []).length >= 50);
                // #3 Don't overwrite server count when at page limit (could be 100+ comments)
                if ((data || []).length < 50) {
                    setCommentCounts(prev => ({ ...prev, [currentReel.id]: (data || []).length }));
                }
                // #6 Load comment like counts
                try {
                    const { data: clData } = await supabase.from('social_interactions')
                        .select('metadata').eq('post_id', currentReel.id).eq('interaction_type', 'comment_like');
                    const clCounts = {};
                    (clData || []).forEach(row => { const cid = row.metadata?.comment_id; if (cid) clCounts[cid] = (clCounts[cid] || 0) + 1; });
                    setCommentLikeCounts(clCounts);
                } catch (e) { console.warn('[App] Handled exception:', e); }
            } catch (e) { console.warn('Load comments:', e); }
        }
    };

    // #6 Comment Pagination — Load More
    const loadMoreComments = async () => {
        if (!currentReel?.id || loadingMoreComments || !hasMoreComments) return;
        setLoadingMoreComments(true);
        const nextPage = commentPage + 1;
        try {
            const { data } = await supabase
                .from('social_comments')
                .select('id, content, created_at, media_url, media_type, profiles:author_id(username, avatar_url)')
                .eq('post_id', currentReel.id)
                .order('created_at', { ascending: commentSort === 'oldest' })
                .range(nextPage * 50, (nextPage + 1) * 50 - 1);
            if (data && data.length > 0) {
                setComments(prev => [...prev, ...data]);
                setCommentPage(nextPage);
                setHasMoreComments(data.length >= 50);
            } else {
                setHasMoreComments(false);
            }
        } catch { setHasMoreComments(false); }
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
        setComments(prev => [...prev, {
            id: tempId, content: text,
            profiles: { username: 'You', avatar_url: null },
            created_at: new Date().toISOString(),
            media_url: mediaUrl || null,
            media_type: mediaType || null,
            parent_id: parentId,
        }]);
        try {
            const payload = { post_id: currentReel.id, author_id: user.id, content: text || '' };
            if (mediaUrl) { payload.media_url = mediaUrl; payload.media_type = mediaType; }
            if (parentId) { payload.parent_id = parentId; }
            if (currentReel.source === 'reels') {
                // If it's a social_reel, we might hit FK issues on social_comments if it enforces posts. Assume it works or is unconstrained here.
            }
            const { error } = await supabase.from('social_comments').insert(payload);
            if (error) throw error;
            busEmit.socialCommentAdded(currentReel.id, user.id);
            incrementMetric(currentReel, 'comment_count', 1);
            setCommentCounts(prev => ({ ...prev, [currentReel.id]: (prev[currentReel.id] || 0) + 1 }));
        } catch (err) {
            console.error('[CommentInsert] Failed:', err);
            setComments(prev => prev.filter(c => c.id !== tempId));
        }
        setSubmittingComment(false);
    };

    // Phase 6 — Comment like toggle
    const handleCommentLike = async (commentId) => {
        if (!user?.id) return;
        const wasLiked = commentLikes[commentId];
        setCommentLikes(prev => ({ ...prev, [commentId]: !wasLiked }));
        // #4 Optimistic comment like count sync
        setCommentLikeCounts(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 0) + (wasLiked ? -1 : 1)) }));
        try {
            if (wasLiked) {
                await supabase.from('social_interactions')
                    .delete().match({ user_id: user.id, post_id: currentReel.id, interaction_type: 'comment_like', metadata: { comment_id: commentId } });
            } else {
                await supabase.from('social_interactions').insert({
                    user_id: user.id, post_id: currentReel.id,
                    interaction_type: 'comment_like', metadata: { comment_id: commentId }
                });
            }
        } catch {
            setCommentLikes(prev => ({ ...prev, [commentId]: wasLiked }));
            setCommentLikeCounts(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 0) + (wasLiked ? 1 : -1)) }));
        }
    };

    // Phase 6 — Delete own comment
    const handleDeleteComment = async (commentId) => {
        if (!user?.id || !currentReel?.id) return;
        const prev = comments;
        setComments(c => c.filter(x => x.id !== commentId));
        try {
            const { error } = await supabase.from('social_comments').delete()
                .eq('id', commentId).eq('author_id', user.id);
            if (error) throw error;
            incrementMetric(currentReel, 'comment_count', -1);
            setCommentCounts(p => ({ ...p, [currentReel.id]: Math.max(0, (p[currentReel.id] || 1) - 1) }));
            busEmit.socialCommentAdded && busEmit.socialCommentAdded(currentReel.id, user.id, { removed: true });
        } catch { setComments(prev); }
    };

    // Phase 7 — Edit own comment
    const handleEditComment = (comment) => {
        setEditingComment(comment.id);
        setEditCommentText(comment.content || '');
    };
    const handleSaveEdit = async (commentId) => {
        if (!editCommentText.trim() || !user?.id) return;
        const orig = comments.find(c => c.id === commentId);
        setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: editCommentText.trim() } : c));
        setEditingComment(null);
        try {
            const { error } = await supabase.from('social_comments')
                .update({ content: editCommentText.trim() }).eq('id', commentId).eq('author_id', user.id);
            if (error) throw error;
        } catch {
            if (orig) setComments(prev => prev.map(c => c.id === commentId ? orig : c));
        }
        setEditCommentText('');
    };

    // Phase 7 — Playback speed toggle (YouTube)
    const handleSpeedToggle = () => {
        const speeds = [1, 1.25, 1.5, 2, 0.5, 0.75];
        const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
        const newSpeed = speeds[nextIdx];
        setPlaybackSpeed(newSpeed);
        // Apply to YouTube iframe via postMessage
        const iframe = document.querySelector('iframe[src*="youtube"]');
        if (iframe) {
            iframe.contentWindow?.postMessage(JSON.stringify({
                event: 'command', func: 'setPlaybackRate', args: [newSpeed]
            }), '*');
        }
    };

    // Phase 9: 1-Click Repost Architecture — open modal AND directly share to feed
    const handleShare = () => {
        if (!currentReel?.id) return;
        haptic(10);
        setShowShareModal(true);
        if (!sharedToFeed && !sharingToFeed) {
            handleShareToFeed();
        }
    };

    const shareUrl = currentReel ? ((typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker') + '/hub/reels?id=' + currentReel.id) : '';

    const handleShareAction = async (platform) => {
        setShowShareModal(false);
        const url = shareUrl;
        const title = `Check out this poker reel on Smarter.Poker`;
        try {
            if (platform === 'copy') {
                await navigator.clipboard.writeText(url);
                setShareToast(true);
                setTimeout(() => setShareToast(false), 2000);
            } else if (platform === 'native' && navigator.share) {
                await navigator.share({ title, url });
            } else if (platform === 'x') {
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, '_blank');
            } else if (platform === 'facebook') {
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
            } else if (platform === 'whatsapp') {
                window.open(`https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`, '_blank');
            }
            if (platform !== 'copy') {
                incrementMetric(currentReel, 'share_count', 1);
            }
            if (user?.id) busEmit.socialPostShared(currentReel.id, user.id);
        } catch {
            setShareToast(true);
            setTimeout(() => setShareToast(false), 2000);
        }
    };

    // Share to My Feed — creates a social_posts entry linking this reel
    const [sharingToFeed, setSharingToFeed] = useState(false);
    const [sharedToFeed, setSharedToFeed] = useState(false);
    const handleShareToFeed = async () => {
        if (!currentReel?.id || !user?.id || sharingToFeed) return;
        setSharingToFeed(true);
        try {
            const videoUrl = currentReel.video_url;
            const caption = currentReel.caption || 'Check out this reel!';
            const reelLink = window.location.origin + '/hub/reels?id=' + currentReel.id;
            // #5 Duplicate guard — check if already shared
            const { data: existing } = await supabase.from('social_posts')
                .select('id').eq('author_id', user.id).eq('link_url', reelLink).limit(1);
            if (existing && existing.length > 0) {
                setSharedToFeed(true);
                setSharingToFeed(false);
                setTimeout(() => setSharedToFeed(false), 3000);
                return;
            }
            const postContent = caption + '\n\n' + reelLink;
            const { error } = await supabase.from('social_posts').insert({
                author_id: user.id,
                content: postContent,
                content_type: videoUrl ? 'video' : 'text',
                media_urls: videoUrl ? [videoUrl] : [],
                visibility: 'public',
                link_url: reelLink,
            });
            if (error) throw error;
            incrementMetric(currentReel, 'share_count', 1);
            busEmit.socialPostShared(currentReel.id, user.id);
            busEmit.dataMutated('social');
            setSharedToFeed(true);
            setTimeout(() => { setSharedToFeed(false); }, 3000);
        } catch (err) {
            console.warn('Share to feed failed:', err.message);
            showErrorToast('Share failed — try again');
        }
        setSharingToFeed(false);
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
    }, [currentIndex]);

    const handleSave = async () => {
        if (!currentReel || !user) return;
        const isSaved = savedReels.has(currentReel.id);
        // #1 Optimistic update — instant UI response
        if (isSaved) {
            setSavedReels(prev => { const s = new Set(prev); s.delete(currentReel.id); return s; });
        } else {
            setSavedReels(prev => new Set([...prev, currentReel.id]));
        }
        try {
            if (isSaved) {
                await savedReelsService.unsaveReel(user.id, currentReel.id);
            } else {
                await savedReelsService.saveReel(user.id, currentReel.id);
            }
            busEmit.socialPostBookmarked(currentReel.id, user.id, { added: !isSaved });
        } catch (err) {
            console.warn('[App] Handled exception:', err?.message || err);
            setSavedReels(prev => { const s = new Set(prev); s.delete(currentReel.id); return s; });
            showErrorToast('Save failed — try again');
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
            if (e.key === 'm' || e.key === 'M') {
                setMuted(prev => {
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
            if (e.key === 'l' || e.key === 'L') { handleLikeRef.current?.(); haptic(15); }
            if (e.key === 's' || e.key === 'S') handleSaveRef.current?.();
            if (e.key === 'c' || e.key === 'C') handleCommentRef.current?.();
            if (e.key === '?') setShowShortcutsOverlay(prev => !prev);
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
    useEffect(() => {
        const handleTouchStart = (e) => {
            touchStartY.current = e.touches[0].clientY;
            // Track pull-to-refresh start when at first reel
            if (currentIndexRef.current === 0) {
                pullStartY.current = e.touches[0].clientY;
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
                e.preventDefault();
                e.stopPropagation();

                try { navigator?.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e); }
                if (diff > 0) {
                    slideToNextRef.current();
                } else {
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
                if (data?.event === 'onStateChange') {
                    if (data.info === 0) slideToNextRef.current();
                    if (data.info === 1) { // Playing
                        setShowOverlay(true);
                        clearTimeout(hudTimerRef.current);
                        hudTimerRef.current = setTimeout(() => setShowOverlay(false), 5000);
                    }
                    if (data.info === 2) { // Paused
                        setShowOverlay(true);
                        if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
                    }
                }
                if (data?.info?.currentTime !== undefined && data?.info?.duration) {
                    const pct = (data.info.currentTime / data.info.duration) * 100;
                    setVideoProgress(Math.min(100, Math.max(0, pct)));
                }
            } catch (e) { console.warn('[App] Handled exception:', e); }
        };

        document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
        window.addEventListener('wheel', handleWheel, { passive: true });
        window.addEventListener('message', handleYTMessage);
        return () => {
            document.removeEventListener('touchstart', handleTouchStart, { capture: true });
            document.removeEventListener('touchend', handleTouchEnd, { capture: true });
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('message', handleYTMessage);
        };
    }, []);
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
                // Only update liked state for OTHER users to avoid conflicting with optimistic update
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
                    [d.postId]: Math.max(0, (prev[d.postId] || 0) + (d.removed ? -1 : 1))
                }));
            }
        };
        const handleFollowBus = (event) => {
            const d = event?.payload;
            if (d?.followedId && d?.followerId !== user?.id) {
                setFollowing(prev => ({ ...prev, [d.followedId]: d.added }));
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
            clearTimeout(overlayTimerRef.current);
            clearTimeout(hudTimerRef.current);
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
                        background: 'linear-gradient(110deg, #1a1a1a 8%, #2a2a2a 18%, #1a1a1a 33%)',
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
                    <style>{`@keyframes shimmer { to { background-position-x: -200%; } }`}</style>
                </div>
            </>
        );
    }

    if (loadError && !reels.length) {
        return (
            <>
                <Head><title>Reels | Smarter Poker</title></Head>
                <div style={{
                    position: 'fixed', inset: 0, background: C.bg,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <h1 style={{ color: C.text, fontSize: 24, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>
                        Failed To Load Reels
                    </h1>
                    <p style={{ color: C.textSec, fontSize: 14, marginBottom: 24, textAlign: 'center', maxWidth: 280 }}>
                        Check your connection and try again.
                    </p>
                    <button
                        onClick={() => { setLoadError(false); loadReels(); }}
                        style={{
                            padding: '12px 32px',
                            background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
                            color: 'white', borderRadius: 8, fontWeight: 600, border: 'none',
                            cursor: 'pointer', fontSize: 15,
                        }}
                    >Try Again</button>
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
                <title>{currentReel?.caption ? `${currentReel.caption.slice(0, 60)} | Reels` : 'Reels | Smarter Poker'}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                {/* Dynamic OpenGraph for shared reel links */}
                <meta property="og:title" content={currentReel?.caption ? currentReel.caption.slice(0, 70) : 'Poker Reel on Smarter.Poker'} />
                <meta property="og:description" content={`${currentReel?.profiles?.username ? `by ${currentReel.profiles.username} — ` : ''}Watch poker reels on Smarter.Poker`} />
                {videoId && <meta property="og:image" content={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`} />}
                <meta property="og:type" content="video.other" />
                <meta property="og:url" content={`https://smarter.poker/hub/reels${currentReel?.id ? `?id=${currentReel.id}` : ''}`} />
                <meta name="twitter:card" content="summary_large_image" />
            </Head>

            {/* Universal Header */}
            <div style={{ opacity: showOverlay ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: showOverlay ? 'auto' : 'none', position: 'relative', zIndex: 200 }}>
                <UniversalHeader
                    pageDepth={1}
                    onMenuClick={() => setMenuOpen(true)}
                />
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

                {/* Engagement Stats Pill — view count removed (private to poster only) */}
                <div style={{
                    position: 'absolute', top: 20, right: 16, zIndex: 100,
                    display: 'flex', gap: 12, padding: '6px 14px', borderRadius: 20,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                }}>
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
                    zIndex: 1,
                    pointerEvents: 'none',
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
                                // Play + unmute immediately on iframe load
                                sendYouTubeCommand('playVideo');
                                sendYouTubeCommand('unMute');
                                sendYouTubeCommand('setVolume', [100]);
                                setMuted(false);
                                // Retry for Safari/slow API init
                                setTimeout(() => {
                                    sendYouTubeCommand('playVideo');
                                    sendYouTubeCommand('unMute');
                                    sendYouTubeCommand('setVolume', [100]);
                                }, 200);
                                setTimeout(() => {
                                    sendYouTubeCommand('unMute');
                                    sendYouTubeCommand('setVolume', [100]);
                                }, 600);
                            }}
                            style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: '110%',
                                height: '110%',
                                minWidth: '100vw',
                                minHeight: '100vh',
                                border: 'none',
                                pointerEvents: 'none',
                                objectFit: 'cover',
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
                {/* CENTER ZONE - tap to toggle overlay, double-tap to like, long-press to context menu */}
                <div
                    onTouchStart={handleTouchStart}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onMouseDown={handleTouchStart}
                    onMouseUp={cancelLongPress}
                    onMouseMove={cancelLongPress}
                    onContextMenu={(e) => { e.preventDefault(); setShowContextMenu(true); }}
                    onClick={() => {
                        const now = Date.now();
                        if (now - lastTapRef.current < 300) {
                            // Double tap = like (TikTok behavior: always show heart, only toggle if not liked)
                            setShowHeart(true);
                            setTimeout(() => setShowHeart(false), 800);
                            haptic(15);
                            if (!liked[currentReel?.id]) {
                                handleLike();
                            }
                        } else {
                            // Single tap = reveal overlay
                            revealOverlay();
                        }
                        lastTapRef.current = now;
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
                    opacity: showOverlay ? 1 : 0, transition: 'opacity 0.3s ease',
                }} />

                {/* Author info overlay — ALWAYS VISIBLE & TOUCHABLE */}
                <div style={{
                    position: 'absolute', bottom: 120, left: 16, right: 80, zIndex: 100,
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
                            <div style={{ color: 'white', fontWeight: 600, fontSize: 15, textShadow: '0 1px 4px rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>{currentReel?.profiles?.full_name || currentReel?.profiles?.username}</span>
                                {watchedReelIds.includes(currentReel?.id) && (
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
                                        background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: 4, backdropFilter: 'blur(4px)',
                                    }}>Watched</span>
                                )}
                            </div>
                            <div style={{ color: C.textSec, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {timeAgo(currentReel?.created_at)}
                                <span style={{ opacity: 0.6 }}>·</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    {viewCounts[currentReel?.id] || currentReel?.view_count || 0}
                                </span>
                            </div>
                        </div>
                    </Link>
                    {/* Follow button */}
                    {currentReel?.profiles?.id && user?.id && currentReel.profiles.id !== user.id && (
                        <button onClick={handleFollow} style={{
                            padding: '4px 14px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                            border: following[currentReel.profiles.id] ? '1px solid rgba(255,255,255,0.5)' : 'none',
                            background: following[currentReel.profiles.id] ? 'transparent' : '#1877F2',
                            color: 'white', cursor: 'pointer', marginBottom: 8,
                            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                        }}>
                            {following[currentReel.profiles.id] ? 'Following' : 'Follow'}
                        </button>
                    )}

                    {currentReel?.caption && (
                        <div style={{ maxWidth: '80%' }}>
                            <p style={{
                                color: 'white', fontSize: 14, margin: 0,
                                textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                            }}>
                                {captionExpanded || currentReel.caption.length <= 100
                                    ? currentReel.caption
                                    : currentReel.caption.slice(0, 100) + '...'}
                            </p>
                            {currentReel.caption.length > 100 && (
                                <button onClick={() => setCaptionExpanded(prev => !prev)} style={{
                                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
                                    fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0 0',
                                }}>{captionExpanded ? 'See Less' : 'See More'}</button>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Action Sidebar — ALWAYS VISIBLE & TOUCHABLE on mobile */}
                <div style={{
                    position: 'absolute', right: 12, bottom: 110, zIndex: 100,
                    display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center',
                }}>
                    {/* Heart — tap to like, long-press for reactions */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => {
                                handleLike();
                                if (!liked[currentReel?.id]) {
                                    setShowHeart(true);
                                    setTimeout(() => setShowHeart(false), 800);
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
                                background: 'none', border: 'none', cursor: 'pointer',
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                            }}
                        >
                            <svg width="32" height="32" viewBox="0 0 24 24" fill={liked[currentReel?.id] ? '#ef4444' : 'none'} stroke={liked[currentReel?.id] ? '#ef4444' : 'white'} strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))', transition: 'transform 0.15s ease' }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                            <span style={{
                                color: 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                                transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                transform: likeBounceId === currentReel?.id ? 'scale(1.4)' : 'scale(1)',
                                display: 'inline-block',
                            }}>
                                {likeCounts[currentReel?.id] ?? (currentReel?.like_count || 0)}
                            </span>
                        </button>
                        {/* Reaction Picker — appears on long-press */}
                        {showReactionPicker && (
                            <div style={{
                                position: 'absolute', right: 48, top: '50%', transform: 'translateY(-50%)',
                                display: 'flex', gap: 4, padding: '8px 12px', borderRadius: 24,
                                background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                animation: 'fadeInScale 0.2s ease',
                            }}>
                                {[
                                    { emoji: '\u2764\uFE0F', label: 'Love', type: 'like' },
                                    { emoji: '\uD83D\uDC4D', label: 'Thumbs Up', type: 'thumbsup' },
                                    { emoji: '\uD83D\uDC4E', label: 'Thumbs Down', type: 'dislike' },
                                    { emoji: '\uD83D\uDE02', label: 'Laughing', type: 'laughing' },
                                    { emoji: '\uD83D\uDE22', label: 'Crying', type: 'crying' },
                                    { emoji: '\uD83D\uDE21', label: 'Angry', type: 'angry' },
                                ].map(r => (
                                    <button key={r.type} onClick={() => {
                                        if (r.type === 'like') { handleLike(); if (!liked[currentReel?.id]) { setShowHeart(true); setTimeout(() => setShowHeart(false), 800); } }
                                        else if (r.type === 'dislike') handleDislike();
                                        else { handleLike(); if (!liked[currentReel?.id]) { setShowHeart(true); setTimeout(() => setShowHeart(false), 800); } }
                                        setShowReactionPicker(false);
                                        haptic(10);
                                    }} aria-label={r.label} style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        fontSize: 28, padding: '4px',
                                        transition: 'transform 0.15s ease',
                                    }}
                                    onMouseEnter={e => e.target.style.transform = 'scale(1.3)'}
                                    onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                                    >{r.emoji}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Comment */}
                    <button onClick={handleComment} aria-label="Comments" style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                        <span style={{ color: showCommentPanel ? '#1877F2' : 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            {(commentCounts[currentReel?.id] || comments.length) > 0
                                ? (commentCounts[currentReel?.id] || comments.length)
                                : 'Comment'}
                        </span>
                    </button>

                    {/* Share */}
                    <button onClick={handleShare} aria-label="Share" style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                        <span style={{ color: 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Share</span>
                    </button>

                    {/* Save */}
                    <button onClick={handleSave} aria-label={savedReels.has(currentReel?.id) ? 'Unsave' : 'Save'} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill={savedReels.has(currentReel?.id) ? 'white' : 'none'} stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                        <span style={{ color: 'white', fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            {savedReels.has(currentReel?.id) ? 'Saved' : 'Save'}
                        </span>
                    </button>

                    {/* More (···) — opens panel with Sound, Report, Speed, Link */}
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowMoreMenu(prev => !prev)} aria-label="More options" style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                        }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                                <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                            </svg>
                            <span style={{ color: 'white', fontSize: 10, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>More</span>
                        </button>
                        {/* More Menu Panel */}
                        {showMoreMenu && (
                            <div style={{
                                position: 'absolute', right: 48, bottom: 0,
                                minWidth: 180, padding: '8px 0', borderRadius: 12,
                                background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                animation: 'fadeInScale 0.2s ease',
                            }}>
                                {/* Sound */}
                                <button onClick={() => { muted ? handleUnmute() : handleMute(); setShowMoreMenu(false); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px',
                                    background: 'none', border: 'none', color: 'white', fontSize: 14, cursor: 'pointer',
                                    textAlign: 'left',
                                }}>
                                    {muted ? (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                                    )}
                                    {muted ? 'Unmute' : 'Mute'}
                                </button>
                                {/* Speed */}
                                <button onClick={() => { handleSpeedToggle(); setShowMoreMenu(false); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px',
                                    background: 'none', border: 'none', color: playbackSpeed !== 1 ? '#00d4ff' : 'white', fontSize: 14, cursor: 'pointer',
                                    textAlign: 'left',
                                }}>
                                    <div style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px solid currentColor', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{playbackSpeed}x</div>
                                    Speed ({playbackSpeed}x)
                                </button>
                                {/* Copy Link */}
                                <button onClick={() => {
                                    const url = `${window.location.origin}/hub/reels?id=${currentReel?.id || ''}`;
                                    navigator.clipboard.writeText(url).then(() => {
                                        setCopyToast(true);
                                        setTimeout(() => setCopyToast(false), 2000);
                                    }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                                    setShowMoreMenu(false);
                                }} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px',
                                    background: 'none', border: 'none', color: 'white', fontSize: 14, cursor: 'pointer',
                                    textAlign: 'left',
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                    Copy Link
                                </button>
                                {/* Report */}
                                <button onClick={() => { setShowReportModal(true); setShowMoreMenu(false); }} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px',
                                    background: 'none', border: 'none', color: '#ef4444', fontSize: 14, cursor: 'pointer',
                                    textAlign: 'left', borderTop: '1px solid rgba(255,255,255,0.08)',
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                                    Report
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Floating Mute/Unmute Button — Always visible */}
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
                    }}
                >
                    {muted ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <line x1="23" y1="9" x2="17" y2="15" />
                            <line x1="17" y1="9" x2="23" y2="15" />
                        </svg>
                    ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                        </svg>
                    )}
                </button>

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

                {/* Keyboard Shortcuts Overlay */}
                {showShortcutsOverlay && (
                    <div onClick={() => setShowShortcutsOverlay(false)} style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 260,
                    }}>
                        <div onClick={e => e.stopPropagation()} style={{
                            background: '#1a1a2e', borderRadius: 16, padding: '20px 24px',
                            border: '1px solid rgba(255,255,255,0.15)', maxWidth: 320, width: '90%',
                        }}>
                            <div style={{ color: 'white', fontWeight: 700, fontSize: 16, marginBottom: 16, textAlign: 'center' }}>Keyboard Shortcuts</div>
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
                                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <span style={{ color: '#00d4ff', fontWeight: 600, fontSize: 13, fontFamily: 'monospace', background: 'rgba(0,212,255,0.1)', padding: '2px 8px', borderRadius: 6 }}>{key}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{desc}</span>
                                </div>
                            ))}
                        </div>
                     </div>
                )}
                
                {/* Phase 9: Long Press Context Menu */}
                {showContextMenu && (
                    <div onClick={() => setShowContextMenu(false)} style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
                    }}>
                        <div onClick={e => e.stopPropagation()} style={{
                            background: 'rgba(25, 25, 40, 0.95)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 16, width: 260, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                        }}>
                            <button onClick={() => { setShowContextMenu(false); handleSave(); }} style={{
                                background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                                padding: '16px 20px', color: 'white', fontSize: 16, fontWeight: 600, textAlign: 'left',
                                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill={savedReels.has(currentReel?.id) ? 'white' : 'none'} stroke="white" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> 
                                {savedReels.has(currentReel?.id) ? 'Unsave' : 'Save Reel'}
                            </button>
                            <button onClick={() => { setShowContextMenu(false); handleShare(); }} style={{
                                background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                                padding: '16px 20px', color: 'white', fontSize: 16, fontWeight: 600, textAlign: 'left',
                                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> 
                                Share / Repost
                            </button>
                            <button onClick={() => { setShowContextMenu(false); handleReport(); }} style={{
                                background: 'transparent', border: 'none',
                                padding: '16px 20px', color: '#ff3b30', fontSize: 16, fontWeight: 600, textAlign: 'left',
                                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                                Report
                            </button>
                        </div>
                    </div>
                )}

                {/* #8 Share Options Modal */}
                {showShareModal && (
                    <div onClick={() => setShowShareModal(false)} style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 250,
                    }}>
                        <div onClick={e => e.stopPropagation()} style={{
                            background: '#1a1a2e', borderRadius: '16px 16px 0 0', padding: '16px 20px 24px',
                            width: '100%', maxWidth: 400, border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                            <div style={{ textAlign: 'center', marginBottom: 4 }}>
                                <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, margin: '0 auto 12px' }} />
                                <div style={{ color: 'white', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Share This Reel</div>
                            </div>
                            {/* PRIMARY: Share to My Feed */}
                            <button onClick={handleShareToFeed} disabled={sharingToFeed || sharedToFeed} style={{
                                width: '100%', padding: '14px', borderRadius: 12, marginBottom: 14,
                                background: sharedToFeed ? 'linear-gradient(135deg, #00c853, #69f0ae)' : 'linear-gradient(135deg, #0A84FF, #30D5C8)',
                                color: 'white', fontWeight: 700, fontSize: 15, border: 'none',
                                cursor: sharingToFeed ? 'wait' : 'pointer', opacity: sharingToFeed ? 0.7 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                transition: 'all 0.3s ease',
                            }}>
                                {sharedToFeed ? (
                                    <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg> Shared to My Feed!</>
                                ) : sharingToFeed ? 'Sharing...' : (
                                    <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share to My Feed</>
                                )}
                            </button>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', marginBottom: 10, fontWeight: 500 }}>OR SHARE EXTERNALLY</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                <button onClick={() => handleShareAction('copy')} style={{
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 12, padding: '14px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                    <span style={{ color: 'white', fontSize: 10, fontWeight: 500 }}>Copy Link</span>
                                </button>
                                <button onClick={() => handleShareAction('x')} style={{
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 12, padding: '14px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                }}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                    <span style={{ color: 'white', fontSize: 10, fontWeight: 500 }}>X</span>
                                </button>
                                <button onClick={() => handleShareAction('facebook')} style={{
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 12, padding: '14px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                }}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                    <span style={{ color: 'white', fontSize: 10, fontWeight: 500 }}>Facebook</span>
                                </button>
                                <button onClick={() => handleShareAction('whatsapp')} style={{
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 12, padding: '14px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                }}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                    <span style={{ color: 'white', fontSize: 10, fontWeight: 500 }}>WhatsApp</span>
                                </button>
                            </div>
                            {typeof navigator !== 'undefined' && navigator.share && (
                                <button onClick={() => handleShareAction('native')} style={{
                                    width: '100%', marginTop: 12, padding: '12px', borderRadius: 12,
                                    background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)',
                                    color: 'white', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer',
                                }}>More Sharing Options</button>
                            )}
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
                `}</style>

                {/* Comment Panel */}
                {showCommentPanel && (
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 200,
                        background: 'rgba(0,0,0,0.95)', borderRadius: '16px 16px 0 0',
                        maxHeight: '55vh', display: 'flex', flexDirection: 'column',
                    }}>
                        <div style={{
                            padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <span style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>Comments</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {/* Phase 8 — Sort toggle */}
                                <button onClick={() => {
                                    const next = commentSort === 'newest' ? 'oldest' : 'newest';
                                    setCommentSort(next);
                                    setComments(prev => [...prev].sort((a, b) =>
                                        next === 'newest' ? new Date(b.created_at) - new Date(a.created_at) : new Date(a.created_at) - new Date(b.created_at)
                                    ));
                                }} style={{
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: 12, padding: '3px 10px', fontSize: 10, fontWeight: 600,
                                    color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
                                }}>{commentSort === 'newest' ? 'Newest' : 'Oldest'}</button>
                                <button onClick={() => { setShowCommentPanel(false); setShowGifPicker(false); }} style={{
                                    background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer'
                                }}>x</button>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', maxHeight: 250 }}>
                            {comments.length === 0 && (
                                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: 20, fontSize: 14 }}>
                                    No comments yet. Be the first!
                                </div>
                            )}
                            {comments.map((c, i) => (
                                <div key={c.id || i} style={{ display: 'flex', gap: 10, marginBottom: 12, paddingLeft: c.parent_id ? 24 : 0 }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: '50%', background: '#333',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 14, color: 'white', flexShrink: 0
                                    }}>{(c.profiles?.username || c.author?.username || 'U').charAt(0).toUpperCase()}</div>
                                    <div style={{ flex: 1 }}>
                                        <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{c.profiles?.username || c.author?.username || 'User'}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 8 }}>{c.created_at ? timeAgo(c.created_at) : ''}</span>
                                        {/* Phase 7 — Inline edit mode */}
                                        {editingComment === c.id ? (
                                            <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <input value={editCommentText} onChange={e => setEditCommentText(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(c.id); if (e.key === 'Escape') { setEditingComment(null); setEditCommentText(''); } }}
                                                    style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 8, padding: '6px 10px', color: 'white', fontSize: 13, outline: 'none' }}
                                                    autoFocus />
                                                <button onClick={() => handleSaveEdit(c.id)} style={{ background: '#1877F2', border: 'none', borderRadius: 20, padding: '4px 10px', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                                                <button onClick={() => { setEditingComment(null); setEditCommentText(''); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                                            </div>
                                        ) : (
                                            c.content && <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2 }}>{c.content}</div>
                                        )}
                                        {c.media_url && (
                                            <img src={c.media_url} alt="" style={{
                                                maxWidth: 180, maxHeight: 140, borderRadius: 8, marginTop: 6,
                                                objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)',
                                            }} loading="lazy" />
                                        )}
                                        {/* Phase 6+7 — Comment engagement row */}
                                        <div style={{ display: 'flex', gap: 14, marginTop: 4, alignItems: 'center' }}>
                                            <button onClick={() => handleCommentLike(c.id)} style={{
                                                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                color: commentLikes[c.id] ? '#FF2D55' : 'rgba(255,255,255,0.4)', fontSize: 12,
                                                display: 'flex', alignItems: 'center', gap: 3,
                                            }}>{commentLikes[c.id] ? '❤️' : '🤍'}{commentLikeCounts[c.id] > 0 && <span style={{ fontSize: 10, opacity: 0.6 }}>{commentLikeCounts[c.id]}</span>}</button>
                                            <button onClick={() => { setReplyTo({ id: c.id, username: c.profiles?.username || c.author?.username || 'User' }); setCommentText(`@${c.profiles?.username || c.author?.username || 'User'} `); }} style={{
                                                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                color: 'rgba(255,255,255,0.4)', fontSize: 12,
                                            }}>Reply</button>
                                            {(c.profiles?.username === 'You' || c.author_id === user?.id) && (<>
                                                <button onClick={() => handleEditComment(c)} style={{
                                                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                    color: 'rgba(255,255,255,0.4)', fontSize: 12,
                                                }}>Edit</button>
                                                <button onClick={() => handleDeleteComment(c.id)} style={{
                                                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                    color: 'rgba(255,255,255,0.3)', fontSize: 12, marginLeft: 'auto',
                                                }}>Delete</button>
                                            </>)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {/* #6 Comment Pagination — Load More */}
                            {hasMoreComments && (
                                <button onClick={loadMoreComments} disabled={loadingMoreComments} style={{
                                    width: '100%', padding: '10px', background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
                                    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500,
                                    cursor: loadingMoreComments ? 'wait' : 'pointer', marginTop: 4,
                                }}>{loadingMoreComments ? 'Loading...' : 'Load More Comments'}</button>
                            )}
                        </div>

                        {/* Media preview strip */}
                        {commentMediaUrl && (
                            <div style={{ padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                <img src={commentMediaUrl} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
                                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{commentMediaType === 'gif' ? 'GIF' : 'Image'} attached</span>
                                <button onClick={() => { setCommentMediaUrl(null); setCommentMediaType(null); }} style={{
                                    background: 'none', border: 'none', color: '#ef4444', fontSize: 16, cursor: 'pointer', marginLeft: 'auto',
                                }}>x</button>
                            </div>
                        )}

                        {/* GIF picker */}
                        {showGifPicker && (
                            <div style={{ maxHeight: 200, overflow: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                <GiphyPicker onSelect={(gif) => {
                                    setCommentMediaUrl(gif.images?.fixed_height?.url || gif.url || gif);
                                    setCommentMediaType('gif');
                                    setShowGifPicker(false);
                                }} />
                            </div>
                        )}

                        {/* Reply-to indicator */}
                        {replyTo && (
                            <div style={{ padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,212,255,0.06)' }}>
                                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Replying to <span style={{ color: '#00d4ff', fontWeight: 600 }}>@{replyTo.username}</span></span>
                                <button onClick={() => { setReplyTo(null); setCommentText(''); }} style={{
                                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer', marginLeft: 'auto',
                                }}>x</button>
                            </div>
                        )}

                        {/* Comment input toolbar */}
                        <div style={{
                            padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex', flexDirection: 'column', gap: 6,
                        }}>
                            {/* GIF + Image buttons */}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => setShowGifPicker(prev => !prev)} style={{
                                    background: showGifPicker ? 'rgba(24,119,242,0.2)' : 'rgba(255,255,255,0.08)',
                                    border: showGifPicker ? '1px solid #1877F2' : '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: 14, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                                    color: showGifPicker ? '#1877F2' : 'rgba(255,255,255,0.7)', cursor: 'pointer',
                                }}>GIF</button>
                                <button onClick={() => commentFileInputRef.current?.click()} style={{
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: 14, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                                    color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
                                }}>{uploadingImage ? 'Uploading...' : 'Image'}</button>
                                <input ref={commentFileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                                    onChange={(e) => { if (e.target.files?.[0]) handleCommentImageUpload(e.target.files[0]); e.target.value = ''; }} />
                            </div>
                            {/* Input + Post */}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    value={commentText}
                                    onChange={e => { if (e.target.value.length <= COMMENT_MAX_LENGTH) setCommentText(e.target.value); }}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                                    placeholder="Add A Comment..."
                                    maxLength={COMMENT_MAX_LENGTH}
                                    style={{
                                        flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.1)',
                                        border: 'none', borderRadius: 20, fontSize: 14, color: 'white', outline: 'none'
                                    }}
                                />
                                <button
                                    onClick={submitComment}
                                    disabled={(!commentText.trim() && !commentMediaUrl) || submittingComment}
                                    style={{
                                        padding: '8px 16px', background: '#1877F2', color: 'white',
                                        border: 'none', borderRadius: 20, fontWeight: 600, fontSize: 13,
                                        cursor: (commentText.trim() || commentMediaUrl) ? 'pointer' : 'not-allowed',
                                        opacity: (commentText.trim() || commentMediaUrl) ? 1 : 0.5
                                    }}
                                >{submittingComment ? '...' : 'Post'}</button>
                            </div>
                            {/* Phase 8 — Character counter */}
                            {commentText.length > 0 && (
                                <div style={{ textAlign: 'right', fontSize: 10, color: commentText.length >= COMMENT_MAX_LENGTH - 20 ? '#ef4444' : 'rgba(255,255,255,0.3)', paddingRight: 4 }}>
                                    {commentText.length}/{COMMENT_MAX_LENGTH}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Phase 8 — Copy Link Toast */}
                {copyToast && (
                    <div style={{
                        position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.4)',
                        borderRadius: 12, padding: '8px 20px', color: '#00d4ff',
                        fontSize: 13, fontWeight: 600, zIndex: 300, backdropFilter: 'blur(10px)',
                        animation: 'fadeIn 0.2s ease-out',
                    }}>Link Copied!</div>
                )}

                {/* #10 Error Toast */}
                {errorToast && (
                    <div style={{
                        position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.4)',
                        borderRadius: 12, padding: '10px 22px', color: '#FF453A',
                        fontSize: 13, fontWeight: 600, zIndex: 300, backdropFilter: 'blur(10px)',
                        animation: 'fadeIn 0.2s ease-out', whiteSpace: 'nowrap',
                    }}>{errorToast}</div>
                )}

                {/* Report Modal */}
                {showReportModal && (
                    <div onClick={() => { setShowReportModal(false); setReportReason(''); setReportSubmitted(false); }} style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
                    }}>
                        <div onClick={(e) => e.stopPropagation()} style={{
                            background: '#1a1a2e', borderRadius: 16, padding: 24, width: '85%', maxWidth: 360,
                            border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                            {reportSubmitted ? (
                                <div style={{ textAlign: 'center', color: 'white' }}>
                                    <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                                    <div style={{ fontSize: 16, fontWeight: 600 }}>Report Submitted</div>
                                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>Thank you. We will review this content.</div>
                                </div>
                            ) : (
                                <>
                                    <div style={{ color: 'white', fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Report This Reel</div>
                                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 12 }}>Why are you reporting this content?</div>
                                    {['Inappropriate Content', 'Spam Or Scam', 'Harassment', 'Misinformation', 'Other'].map(reason => (
                                        <button key={reason} onClick={() => setReportReason(reason)} style={{
                                            display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                                            marginBottom: 6, borderRadius: 10, fontSize: 14, cursor: 'pointer',
                                            background: reportReason === reason ? 'rgba(24,119,242,0.2)' : 'rgba(255,255,255,0.06)',
                                            border: reportReason === reason ? '1px solid #1877F2' : '1px solid rgba(255,255,255,0.1)',
                                            color: reportReason === reason ? '#1877F2' : 'white',
                                        }}>{reason}</button>
                                    ))}
                                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                        <button onClick={() => { setShowReportModal(false); setReportReason(''); }} style={{
                                            flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                                            background: 'rgba(255,255,255,0.08)', color: 'white', border: 'none', cursor: 'pointer',
                                        }}>Cancel</button>
                                        <button onClick={handleReport} disabled={!reportReason} style={{
                                            flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                                            background: reportReason ? '#ef4444' : 'rgba(255,255,255,0.08)',
                                            color: 'white', border: 'none', cursor: reportReason ? 'pointer' : 'not-allowed',
                                            opacity: reportReason ? 1 : 0.5,
                                        }}>Submit Report</button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Preload next reel — hidden iframe for instant switching */}
                {reels[currentIndex + 1] && (() => {
                    const nextVid = getYouTubeVideoId(reels[currentIndex + 1]?.video_url);
                    return nextVid ? (
                        <>
                            <img src={`https://img.youtube.com/vi/${nextVid}/hqdefault.jpg`} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} alt="" />
                            <iframe
                                src={`https://www.youtube-nocookie.com/embed/${nextVid}?autoplay=0&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`}
                                title="Preload"
                                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
                                tabIndex={-1}
                                aria-hidden="true"
                            />
                        </>
                    ) : null;
                })()}

                {/* Pull-to-refresh indicator */}
                {refreshing && (
                    <div style={{
                        position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
                        zIndex: 200, display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 18px', borderRadius: 20,
                        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                    }}>
                        <div style={{
                            width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)',
                            borderTopColor: 'white', borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                        }} />
                        <span style={{ color: 'white', fontSize: 13, fontWeight: 500 }}>Refreshing...</span>
                    </div>
                )}

                {/* Loading indicator at bottom */}
                {!showCommentPanel && loadingMore && (
                    <div style={{
                        position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 100,
                        pointerEvents: 'none',
                    }}>
                        <div style={{
                            width: 24, height: 24, border: '2px solid rgba(255,255,255,0.3)',
                            borderTopColor: 'white', borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                        }} />
                    </div>
                )}

                {/* Spin animation for loader */}
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>


            </div >
        </>
    );
}
