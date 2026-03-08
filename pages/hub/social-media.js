/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  🚨🚨🚨 PROTECTED FILE - READ BEFORE MODIFYING 🚨🚨🚨                      ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                           ║
 * ║  THIS FILE CONTAINS MULTIPLE CRITICAL FEATURES THAT BREAK FREQUENTLY.    ║
 * ║  BEFORE MAKING ANY CHANGES:                                              ║
 * ║                                                                           ║
 * ║  1. RUN: /social-feed-protection workflow                                ║
 * ║  2. READ: .agent/PROTECTED_FILES.md                                      ║
 * ║  3. TEST BEFORE: node scripts/test-article-reader.js                     ║
 * ║  4. TEST AFTER: node scripts/test-article-reader.js                      ║
 * ║                                                                           ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  CRITICAL FEATURES IN THIS FILE - DO NOT BREAK:                          ║
 * ║                                                                           ║
 * ║  📰 Article Reader (Lines ~1186-1200, ~1417, ~2509)                       ║
 * ║     - ArticleCard with onClick → opens ArticleReaderModal                 ║
 * ║     - articleReader state {open, url, title}                             ║
 * ║     - onOpenArticle prop passed to PostCard                              ║
 * ║                                                                           ║
 * ║  📖 Stories Bar (Line ~2330)                                              ║
 * ║     - StoriesBar component with stories fetch                            ║
 * ║                                                                           ║
 * ║   Reels Carousel (Lines ~2510)                                          ║
 * ║     - ReelsFeedCarousel inserted after every 3 posts                     ║
 * ║                                                                           ║
 * ║  🔴 Live Streaming (Lines ~2360-2400)                                     ║
 * ║     - GoLiveModal, LiveStreamCard, LiveStreamViewer                      ║
 * ║                                                                           ║
 * ║  📋 PostCard Component (Lines ~1072-1300)                                 ║
 * ║     - Renders all post types correctly                                   ║
 * ║     - onOpenArticle prop for article clicks                              ║
 * ║                                                                           ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  SMARTER.POKER SOCIAL HUB                                                ║
 * ║  Light Theme + Working Supabase Integration + Go Live Streaming          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { useFeedPrefetchObserver } from '../../src/hooks/useProfilePrefetch';
import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePersistedState } from '../../src/hooks/usePersistedState';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import confetti from 'canvas-confetti';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser, querySocialPosts, queryProfiles, fetchWithAuth } from '../../src/lib/authUtils';
import { useExternalLink } from '../../src/components/ui/ExternalLinkModal';
import { useUnreadCount, UnreadBadge } from '../../src/hooks/useUnreadCount';
import { StoriesBar, ShareToStoryPrompt } from '../../src/components/social/Stories';
import { ReelsFeedCarousel } from '../../src/components/social/ReelsFeedCarousel';
import { GoLiveModal } from '../../src/components/social/GoLiveModal';
import { LiveStreamCard } from '../../src/components/social/LiveStreamCard';
import { LiveStreamViewer } from '../../src/components/social/LiveStreamViewer';
import LiveStreamService from '../../src/services/LiveStreamService';
import ArticleCard, { ArticleCardFromPost, getPostMediaType } from '../../src/components/social/ArticleCard';
import ArticleReaderModal from '../../src/components/social/ArticleReaderModal';
import { BrainHomeButton } from '../../src/components/navigation/WorldNavHeader';
import InviteFriendsModal from '../../src/components/ui/InviteFriendsModal';
import { useActiveIdentity } from '../../src/contexts/ActiveIdentityContext';

// God-Mode Stack
import { useSocialStore } from '../../src/stores/socialStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import toast from '../../src/stores/toastStore';

// Light Theme Colors (SmarterPoker-style)
const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueHover: '#166FE5', green: '#42B72A', red: '#FA383E',
};

const timeAgo = (d) => {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
};

// Decode HTML entities in text (for link preview titles/descriptions)
const decodeHtmlEntities = (text) => {
    if (!text) return text;
    const entities = {
        '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
        '&#039;': "'", '&#39;': "'", '&apos;': "'", '&#x27;': "'",
        '&nbsp;': ' ', '&#8217;': "'", '&#8216;': "'", '&#8220;': '"', '&#8221;': '"'
    };
    return text.replace(/&[#\w]+;/g, match => entities[match] || match);
};

function Avatar({ src, name, size = 40, online, onClick, linkTo }) {
    const router = useRouter();
    const handleClick = onClick || (linkTo ? () => router.push(linkTo) : null);

    return (
        <div
            style={{ position: 'relative', display: 'inline-block', cursor: handleClick ? 'pointer' : 'default' }}
            onClick={handleClick}
        >
            <img
                src={src || '/default-avatar.png'}
                alt={name || 'User'}
                style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
            />
            {online !== undefined && <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: '50%', background: online ? C.green : '#ccc', border: '2px solid white' }} />}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  YOUTUBE URL HELPERS - Detect and convert YouTube URLs for embedding
// ═══════════════════════════════════════════════════════════════════════════

function isYouTubeUrl(url) {
    if (!url) return false;
    return url.includes('youtube.com') || url.includes('youtu.be');
}

function getYouTubeVideoId(url) {
    if (!url) return null;

    // Handle youtube.com/watch?v=VIDEO_ID
    const watchMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) return watchMatch[1];

    // Handle youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) return shortMatch[1];

    // Handle youtube.com/shorts/VIDEO_ID
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return shortsMatch[1];

    // Handle youtube.com/embed/VIDEO_ID
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
    if (embedMatch) return embedMatch[1];

    return null;
}

function getYouTubeEmbedUrl(url) {
    const videoId = getYouTubeVideoId(url);
    if (videoId) {
        // autoplay=1: Start playing immediately
        // rel=0: Don't show related videos at end
        // modestbranding=1: Minimal YouTube branding
        // playsinline=1: Play inline on mobile
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
    }
    return url;
}

function getYouTubeThumbnail(url) {
    const videoId = getYouTubeVideoId(url);
    if (videoId) {
        // Use hqdefault for reliable availability (maxresdefault not always available)
        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  YOUTUBE VIDEO VALIDATOR - Check if video is available before posting
// YouTube returns a 120x90 placeholder for unavailable videos instead of 404
// ═══════════════════════════════════════════════════════════════════════════

async function validateYouTubeVideo(url) {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return { valid: false, error: 'Invalid YouTube URL' };

    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            // YouTube's "Video Unavailable" placeholder is 120x90
            // Real thumbnails are 480x360 (hqdefault) or higher
            if (img.naturalWidth <= 120 && img.naturalHeight <= 90) {
                resolve({ valid: false, error: 'This YouTube video is unavailable or has been removed' });
            } else {
                resolve({ valid: true });
            }
        };
        img.onerror = () => {
            resolve({ valid: false, error: 'Could not verify YouTube video' });
        };
        // Timeout after 5 seconds
        setTimeout(() => resolve({ valid: false, error: 'Video check timed out' }), 5000);
        img.src = thumbnailUrl;
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// 🖼️ VIDEO THUMBNAIL COMPONENT - Robust with fallback for invalid YouTube IDs
// YouTube returns a gray placeholder (not 404) for invalid videos, so we need
// to detect the placeholder by checking the image dimensions after load.
// The default "Video Unavailable" placeholder is 120x90 pixels.
// ═══════════════════════════════════════════════════════════════════════════

function VideoThumbnail({ url, style = {}, onValidated }) {
    const [thumbnailError, setThumbnailError] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isValid, setIsValid] = useState(null); // null = unknown, true = valid, false = invalid
    const imgRef = useRef(null);
    const thumbnailUrl = getYouTubeThumbnail(url);

    // Fallback UI for invalid/unavailable videos
    const FallbackUI = ({ showUnavailable = false }) => (
        <div style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            ...style
        }}>
            <span style={{ fontSize: 48, marginBottom: 8 }}></span>
            <span style={{ fontSize: 14, opacity: 0.8 }}>
                {showUnavailable ? 'Video Unavailable' : 'Video'}
            </span>
        </div>
    );

    // If thumbnail failed to load, no URL, or detected as placeholder, show fallback
    if (thumbnailError || !thumbnailUrl) {
        return <FallbackUI showUnavailable={thumbnailError} />;
    }

    const handleLoad = (e) => {
        setIsLoaded(true);
        // YouTube's "Video Unavailable" placeholder is 120x90
        // Real thumbnails are 480x360 (hqdefault) or higher
        const img = e.target;
        const isInvalid = img.naturalWidth <= 120 && img.naturalHeight <= 90;

        if (isInvalid) {
            setThumbnailError(true);
            setIsValid(false);
            if (onValidated) onValidated(false);
        } else {
            setIsValid(true);
            if (onValidated) onValidated(true);
        }
    };

    const handleError = () => {
        setThumbnailError(true);
        setIsValid(false);
        if (onValidated) onValidated(false);
    };

    return (
        <>
            {!isLoaded && !thumbnailError && <FallbackUI />}
            <img
                ref={imgRef}
                src={thumbnailUrl}
                alt="Video Thumbnail"
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: (isLoaded && !thumbnailError) ? 'block' : 'none',
                    ...style
                }}
                onLoad={handleLoad}
                onError={handleError}
            />
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎥 VIDEO POST WRAPPER - Handles click behavior based on video validity
// ═══════════════════════════════════════════════════════════════════════════

function VideoPostWrapper({ url, onValidVideoClick, children }) {
    const [isVideoValid, setIsVideoValid] = useState(null); // null = unknown, true/false = validated

    const handleClick = () => {
        if (isVideoValid === false) {
            // Video is broken - show alert instead of opening player
            alert('This video is no longer available on YouTube.');
            return;
        }
        // Video is valid or still loading - proceed with click
        if (onValidVideoClick) onValidVideoClick(url);
    };

    return (
        <div
            onClick={handleClick}
            style={{
                position: 'relative',
                cursor: isVideoValid === false ? 'not-allowed' : 'pointer',
                aspectRatio: '16/9',
                maxHeight: 400, // Cap vertical videos
                background: '#000',
                overflow: 'hidden'
            }}
        >
            {isYouTubeUrl(url) ? (
                <VideoThumbnail
                    url={url}
                    onValidated={(valid) => setIsVideoValid(valid)}
                />
            ) : children}

            {/* Play Button Overlay - Show for valid videos */}
            {isVideoValid !== false && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.9)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#333',
                    fontSize: 28, pointerEvents: 'none',
                    transition: 'transform 0.15s, background 0.15s'
                }}>▶</div>
            )}

            {/* Only show overlay for invalid videos */}
            {isVideoValid === false && (
                <>
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 64, height: 64, borderRadius: '50%',
                        background: 'rgba(100,100,100,0.6)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#888',
                        fontSize: 28, pointerEvents: 'none'
                    }}></div>

                    <div style={{
                        position: 'absolute', bottom: 8, left: 8,
                        background: 'rgba(200,50,50,0.8)',
                        padding: '4px 10px',
                        borderRadius: 4, color: 'white', fontSize: 12, fontWeight: 500
                    }}>
                        Video unavailable
                    </div>
                </>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 LINK PREVIEW CARD - Fetches and displays rich link metadata for feed posts
// ═══════════════════════════════════════════════════════════════════════════
//  CRITICAL: DO NOT MODIFY without running /social-feed-protection workflow
// This component has broken 4+ times. Key requirements:
// - Uses useExternalLink for internal popups (NOT target="_blank")
// - Image uses aspectRatio: '16/9' and objectFit: 'cover' (full width, no black bars)
// - decodeHtmlEntities for title/description (fixes &#039; display)
// ═══════════════════════════════════════════════════════════════════════════

// Module-level cache to deduplicate link preview fetches across all cards in a session
const linkPreviewCache = new Map();
const linkPreviewInflight = new Map();

function LinkPreviewCard({ url }) {
    const { openExternal } = useExternalLink();
    const [metadata, setMetadata] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!url) return;

        // Check in-memory cache first to avoid duplicate network requests
        if (linkPreviewCache.has(url)) {
            setMetadata(linkPreviewCache.get(url));
            setLoading(false);
            return;
        }

        const fetchMetadata = async () => {
            try {
                let data;
                // Deduplicate: if a request for this URL is already in-flight, await it
                if (linkPreviewInflight.has(url)) {
                    data = await linkPreviewInflight.get(url);
                } else {
                    const promise = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
                        .then(r => r.json());
                    linkPreviewInflight.set(url, promise);
                    data = await promise;
                    linkPreviewInflight.delete(url);
                }
                linkPreviewCache.set(url, data);
                setMetadata(data);
            } catch (error) {
                console.error('Failed to fetch link metadata:', error);
                linkPreviewInflight.delete(url);
                // Fallback to basic info
                try {
                    const urlObj = new URL(url);
                    setMetadata({
                        title: urlObj.pathname.split('/').pop()?.replace(/-/g, ' ') || 'Link',
                        description: null,
                        image: null,
                        siteName: urlObj.hostname.replace(/^www\./, '')
                    });
                } catch (e) { }
            }
            setLoading(false);
        };

        fetchMetadata();
    }, [url]);

    if (loading) {
        return (
            <div style={{
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                overflow: 'hidden',
                background: C.bg,
                margin: '0 12px 12px'
            }}>
                <div style={{
                    height: 200,
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 24
                }}>⏳ Loading Preview...</div>
            </div>
        );
    }

    const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Open article links directly in new tab - modal was showing "Content Unavailable"
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <div
            onClick={handleClick}
            style={{ textDecoration: 'none', display: 'block', cursor: 'pointer' }}
        >
            <div style={{
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                overflow: 'hidden',
                background: C.bg,
                margin: '0 12px 12px'
            }}>
                {/* Link Preview Image - full width, proper aspect ratio */}
                <div style={{
                    width: '100%',
                    aspectRatio: '16/9',
                    position: 'relative',
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                    overflow: 'hidden'
                }}>
                    {metadata?.image ? (
                        <img
                            src={metadata.image}
                            alt={metadata.title || 'Link preview'}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                objectPosition: 'center center'
                            }}
                        />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'white', fontSize: 48 }}>🔗</div>
                    )}
                </div>
                {/* Link Info */}
                <div style={{ padding: '12px 16px', background: C.card }}>
                    <div style={{ fontSize: 11, color: C.textSec, textTransform: 'uppercase', marginBottom: 4 }}>
                        {metadata?.siteName || new URL(url).hostname.replace('www.', '')}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
                        {decodeHtmlEntities(metadata?.title) || 'View Article'}
                    </div>
                    {metadata?.description && (
                        <div style={{
                            fontSize: 13,
                            color: C.textSec,
                            marginTop: 6,
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                        }}>
                            {decodeHtmlEntities(metadata.description)}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  FULL SCREEN VIDEO VIEWER - TikTok/Reels style immersive viewer
// ═══════════════════════════════════════════════════════════════════════════

function FullScreenVideoViewer({ videoUrl, author, caption, onClose, onLike, onComment, onShare }) {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [showControls, setShowControls] = useState(true);

    useEffect(() => {
        // Auto-hide controls after 3 seconds
        const timer = setTimeout(() => setShowControls(false), 3000);
        return () => clearTimeout(timer);
    }, [showControls]);

    useEffect(() => {
        // Prevent body scroll when modal is open
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const togglePlay = () => {
        if (videoRef.current) {
            if (videoRef.current.paused) {
                videoRef.current.play();
                setIsPlaying(true);
            } else {
                videoRef.current.pause();
                setIsPlaying(false);
            }
        }
    };

    return (
        <div
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: '#000', zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setShowControls(true)}
        >
            {/* Close Button */}
            <button
                onClick={onClose}
                style={{
                    position: 'absolute', top: 16, left: 16, zIndex: 10001,
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)',
                    border: 'none', cursor: 'pointer', color: 'white', fontSize: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
            >×</button>

            {/* Video Container - Detect YouTube URLs vs direct video files */}
            {isYouTubeUrl(videoUrl) ? (
                // YouTube embed - takes full screen
                <iframe
                    src={getYouTubeEmbedUrl(videoUrl)}
                    style={{
                        width: '100vw',
                        height: '100vh',
                        border: 'none'
                    }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                />
            ) : (
                // Direct video file
                <video
                    ref={videoRef}
                    src={videoUrl}
                    autoPlay
                    loop
                    playsInline
                    onClick={togglePlay}
                    style={{
                        maxWidth: '100%', maxHeight: '100%',
                        width: 'auto', height: '100%',
                        objectFit: 'contain', cursor: 'pointer'
                    }}
                />
            )}




            {/* Author Info & Caption Overlay */}
            <div style={{
                position: 'absolute', bottom: 80, left: 16, right: 80,
                color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                opacity: showControls ? 1 : 0.7,
                transition: 'opacity 0.3s'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <img
                        src={author?.avatar || '/default-avatar.png'}
                        alt={author?.name}
                        style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid white' }}
                    />
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>{author?.name || 'Player'}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>Smarter.Poker</div>
                    </div>
                </div>
                {caption && (
                    <div style={{ fontSize: 14, lineHeight: 1.4, maxHeight: 80, overflow: 'hidden' }}>
                        {caption}
                    </div>
                )}
            </div>

            {/* Right Side Engagement Buttons */}
            <div style={{
                position: 'absolute', right: 16, bottom: 120,
                display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center'
            }}>
                <button onClick={onLike} style={{
                    background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)',
                    border: 'none', borderRadius: '50%', width: 48, height: 48,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', fontSize: 22
                }}></button>

                <button onClick={onComment} style={{
                    background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)',
                    border: 'none', borderRadius: '50%', width: 48, height: 48,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', fontSize: 22
                }}></button>

                <button onClick={onShare} style={{
                    background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)',
                    border: 'none', borderRadius: '50%', width: 48, height: 48,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', fontSize: 22
                }}>↗️</button>
            </div>

            {/* Bottom Gradient */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 200,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                pointerEvents: 'none'
            }} />
        </div>
    );
}

// StoriesBar imported from '../../src/components/social/Stories'

const MAX_MEDIA = 10;

function PostCreator({ user, onPost, isPosting, onGoLive, onOpenClubPages }) {
    const [content, setContent] = useState('');
    const [media, setMedia] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionResults, setMentionResults] = useState([]);
    const [showMentions, setShowMentions] = useState(false);
    const [cursorPosition, setCursorPosition] = useState(0);
    // 🔗 LINK PREVIEW STATE - SmarterPoker-style auto-detect
    const [linkPreview, setLinkPreview] = useState(null); // { url, title, image, domain }
    const [linkLoading, setLinkLoading] = useState(false);
    const [showIdentityPicker, setShowIdentityPicker] = useState(false);
    const fileRef = useRef(null);
    const inputRef = useRef(null);
    const mentionTimeout = useRef(null);
    const linkTimeout = useRef(null);

    // Identity switching
    const { isClubMode, clubPage, hasClubPage, switchToPersonal, switchToClub, activeIdentity } = useActiveIdentity();

    const handleFiles = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length || !user?.id) return;

        // Check total media limit
        const remaining = MAX_MEDIA - media.length;
        if (remaining <= 0) {
            setError(`Maximum ${MAX_MEDIA} images/videos allowed per post`);
            return;
        }
        const filesToUpload = files.slice(0, remaining);
        if (files.length > remaining) {
            setError(`Only ${remaining} more file(s) can be added (max ${MAX_MEDIA})`);
        }

        setUploading(true);
        const uploaded = [];
        for (const file of filesToUpload) {
            const isVideo = file.type.startsWith('video/');
            const folder = isVideo ? 'videos' : 'photos';
            try {
                if (isVideo) {
                    // Direct-to-Supabase upload for videos (bypasses Vercel body limit)
                    const _uploadSess = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
                    const metaRes = await fetch('/api/social/upload-url', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(_uploadSess?.access_token ? { Authorization: `Bearer ${_uploadSess.access_token}` } : {}),
                        },
                        body: JSON.stringify({
                            fileName: file.name,
                            fileSize: file.size,
                            mimeType: file.type,
                            folder,
                            prefix: user.id,
                        }),
                    });
                    const meta = await metaRes.json();
                    if (!meta.success) {
                        setError('Upload failed: ' + (meta.error || 'Unknown error'));
                        continue;
                    }
                    // Upload directly to Supabase Storage via signed URL
                    const uploadRes = await fetch(meta.signedUrl, {
                        method: 'PUT',
                        headers: { 'Content-Type': file.type },
                        body: file,
                    });
                    if (!uploadRes.ok) {
                        setError('Video upload failed — please try again');
                        continue;
                    }
                    uploaded.push({ type: 'video', url: meta.publicUrl });
                } else {
                    // Keep existing API for images (small files, no issue)
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('folder', folder);
                    formData.append('prefix', user.id);
                    const _imgSess = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
                    const res = await fetch('/api/social/upload', {
                        method: 'POST',
                        headers: _imgSess?.access_token ? { Authorization: `Bearer ${_imgSess.access_token}` } : {},
                        body: formData,
                    });
                    const json = await res.json();
                    if (json.success && json.url) {
                        uploaded.push({ type: json.type || 'photo', url: json.url });
                    } else {
                        console.error('[PostCreator] Upload failed:', json.error);
                        setError('Upload failed: ' + (json.error || 'Unknown error'));
                    }
                }
            } catch (err) {
                console.error('[PostCreator] Upload error:', err);
                setError('Upload failed: ' + err.message);
            }
        }
        setMedia(prev => [...prev, ...uploaded]);
        setUploading(false);
    };

    // Handle @mention detection AND auto URL detection (SmarterPoker-style)
    const handleContentChange = (e) => {
        const value = e.target.value;
        const pos = e.target.selectionStart;

        // 🔗 AUTO-DETECT URLs - SmarterPoker-style: remove URL and show preview card
        // ONLY trigger when URL is followed by a space (user finished typing the URL)
        // Regex matches: http(s)://... followed by a space
        const urlRegex = /(https?:\/\/\S+)\s/i;
        const urlMatch = value.match(urlRegex);

        if (urlMatch && !linkPreview && !linkLoading) {
            // urlMatch[1] is the captured URL (without the trailing space)
            let detectedUrl = urlMatch[1];

            // Clean up any trailing punctuation (like commas or periods)
            detectedUrl = detectedUrl.replace(/[.,;:!?)]+$/, '');

            // Ensure URL starts with http/https
            if (detectedUrl.toLowerCase().startsWith('www.')) {
                detectedUrl = 'https://' + detectedUrl;
            }

            // Check if it's a YouTube URL
            const isYouTube = /youtube\.com|youtu\.be/i.test(detectedUrl);

            // Remove the URL (but keep other text) from content
            const cleanedValue = value.replace(urlMatch[0], '').trim();
            setContent(cleanedValue);
            setLinkLoading(true);

            // Clear any pending link timeout
            if (linkTimeout.current) clearTimeout(linkTimeout.current);

            linkTimeout.current = setTimeout(async () => {
                try {
                    if (isYouTube) {
                        // Validate YouTube video before showing preview
                        const validation = await validateYouTubeVideo(detectedUrl);
                        if (!validation.valid) {
                            setError(`❌ ${validation.error}`);
                            setLinkLoading(false);
                            return;
                        }
                        // Get YouTube video ID for thumbnail
                        const videoId = getYouTubeVideoId(detectedUrl);
                        setLinkPreview({
                            url: detectedUrl,
                            title: 'YouTube Video',
                            image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                            domain: 'youtube.com',
                            type: 'video'
                        });
                    } else {
                        // For non-YouTube links, fetch real metadata via API
                        try {
                            const response = await fetch(`/api/link-preview?url=${encodeURIComponent(detectedUrl)}`);
                            const metadata = await response.json();

                            setLinkPreview({
                                url: detectedUrl,
                                title: metadata.title || 'Link',
                                description: metadata.description || null,
                                image: metadata.image || null,
                                domain: metadata.siteName || new URL(detectedUrl).hostname.replace(/^www\./i, ''),
                                type: 'link'
                            });
                        } catch (apiError) {
                            console.error('Link preview API error:', apiError);
                            // Fallback to domain-only preview
                            const domain = new URL(detectedUrl).hostname.replace(/^www\./i, '');
                            setLinkPreview({
                                url: detectedUrl,
                                title: domain,
                                description: null,
                                image: null,
                                domain: domain,
                                type: 'link'
                            });
                        }
                    }
                } catch (err) {
                    console.error('Link preview error:', err);
                    setError('Could not load link preview');
                }
                setLinkLoading(false);
            }, 300);

            setCursorPosition(cleanedValue.length);
            return; // Skip further processing
        }

        setContent(value);
        setCursorPosition(pos);

        // Check for @mention pattern
        const textBeforeCursor = value.substring(0, pos);
        const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

        if (mentionMatch) {
            const query = mentionMatch[1];
            setMentionQuery(query);
            setShowMentions(true);

            // Search for users
            if (mentionTimeout.current) clearTimeout(mentionTimeout.current);
            if (query.length >= 1) {
                mentionTimeout.current = setTimeout(async () => {
                    try {
                        const { data } = await supabase.from('profiles')
                            .select('id, username, full_name')
                            .ilike('username', `%${query}%`)
                            .limit(5);
                        if (data) setMentionResults(data);
                    } catch (e) { console.error(e); }
                }, 200);
            }
        } else {
            setShowMentions(false);
            setMentionResults([]);
        }
    };

    // Remove the detected link preview
    const removeLinkPreview = () => {
        setLinkPreview(null);
        setError('');
    };

    const insertMention = (user) => {
        const textBeforeCursor = content.substring(0, cursorPosition);
        const textAfterCursor = content.substring(cursorPosition);
        const mentionStart = textBeforeCursor.lastIndexOf('@');
        const newContent = textBeforeCursor.substring(0, mentionStart) + `@${user.username} ` + textAfterCursor;
        setContent(newContent);
        setShowMentions(false);
        setMentionResults([]);
        inputRef.current?.focus();
    };

    //  CRITICAL: handlePost - Core posting functionality
    // This has broken multiple times. Requires:
    // - RLS policy "Authenticated users can post" WITH CHECK (true)
    // - author_id set from user.id
    // - Run /social-feed-protection workflow after changes
    const handlePost = async () => {
        // Allow posting if there's content, media, OR a link preview
        if (!content.trim() && !media.length && !linkPreview) return;
        setError('');
        let urls = media.map(m => m.url);
        let type = media.some(m => m.type === 'video') ? 'video' : media.length ? 'photo' : 'text';
        let cleanContent = content;

        // 🔗 USE LINK PREVIEW if available (SmarterPoker-style - URL already extracted)
        if (linkPreview && type === 'text') {
            urls = [linkPreview.url];
            type = linkPreview.type || 'link';
            // Content is already clean (URL was auto-removed)
        } else {
            // Fallback: check for URLs in content (shouldn't happen with new flow)
            const youtubeRegex = /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/g;
            const youtubeMatch = content.match(youtubeRegex);
            const generalUrlRegex = /(https?:\/\/[^\s]+)/g;
            const urlMatch = content.match(generalUrlRegex);

            if (youtubeMatch && type === 'text') {
                const fullUrl = youtubeMatch[0].startsWith('http') ? youtubeMatch[0] : `https://${youtubeMatch[0]}`;
                const validation = await validateYouTubeVideo(fullUrl);
                if (!validation.valid) {
                    setError(`❌ ${validation.error}`);
                    return;
                }
                urls = [fullUrl];
                type = 'video';
                cleanContent = content.replace(youtubeRegex, '').trim();
            } else if (urlMatch && type === 'text') {
                urls = [urlMatch[0]];
                type = 'link';
                cleanContent = content.replace(generalUrlRegex, '').trim();
            }
        }

        // Extract mentions from content
        const mentionPattern = /@(\w+)/g;
        const mentions = [];
        let match;
        while ((match = mentionPattern.exec(content)) !== null) {
            mentions.push(match[1]);
        }
        // DEBUG: log linkPreview before passing to parent
        console.log('[PostCreator]  About to call onPost with linkPreview:', JSON.stringify(linkPreview, null, 2));
        const ok = await onPost(cleanContent, urls, type, mentions, linkPreview);
        if (ok) { setContent(''); setMedia([]); setLinkPreview(null); }
        else setError('Unable to post at this time. Please try again later.');
    };

    // Determine display identity
    const postingAs = isClubMode && clubPage ? { name: clubPage.name, avatar: clubPage.avatar_url } : { name: user?.name, avatar: user?.avatar };

    return (
        <div style={{ background: C.card, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', marginBottom: 2, position: 'relative' }}>
            {/* Identity Switcher Banner - only for Commander users */}
            {hasClubPage && (
                <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSec }}>
                        <span>Posting As</span>
                        <button
                            onClick={() => setShowIdentityPicker(!showIdentityPicker)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: isClubMode ? '#E7F3FF' : '#F0F2F5',
                                border: `1px solid ${isClubMode ? '#1877F2' : C.border}`,
                                borderRadius: 20, padding: '4px 12px 4px 4px',
                                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                color: isClubMode ? '#1877F2' : C.text,
                                transition: 'all 0.2s'
                            }}
                        >
                            <div style={{
                                width: 24, height: 24, borderRadius: '50%',
                                background: postingAs.avatar ? `url(${postingAs.avatar}) center/cover` : (isClubMode ? '#1877F2' : '#65676B'),
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontSize: 11, fontWeight: 700
                            }}>
                                {!postingAs.avatar && (postingAs.name?.[0] || '?')}
                            </div>
                            {postingAs.name || 'You'}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                    </div>

                    {/* Identity Picker Dropdown */}
                    {showIdentityPicker && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 12, zIndex: 1001,
                            background: C.card, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                            border: `1px solid ${C.border}`, minWidth: 220, overflow: 'hidden'
                        }}>
                            <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: C.textSec, borderBottom: `1px solid ${C.border}` }}>
                                Switch Identity
                            </div>
                            {/* Personal Identity */}
                            <button
                                onClick={() => { switchToPersonal(); setShowIdentityPicker(false); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                    padding: '10px 12px', border: 'none', cursor: 'pointer',
                                    background: !isClubMode ? '#E7F3FF' : 'transparent',
                                    textAlign: 'left', transition: 'background 0.15s'
                                }}
                                onMouseEnter={e => { if (isClubMode) e.currentTarget.style.background = '#F0F2F5'; }}
                                onMouseLeave={e => { if (isClubMode) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <Avatar src={user?.avatar} name={user?.name} size={36} />
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{user?.name || 'You'}</div>
                                    <div style={{ fontSize: 12, color: C.textSec }}>Personal Account</div>
                                </div>
                                {!isClubMode && <span style={{ marginLeft: 'auto', color: '#1877F2', fontSize: 18 }}>✓</span>}
                            </button>
                            {/* Club Page Identity */}
                            <button
                                onClick={() => { switchToClub(); setShowIdentityPicker(false); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                    padding: '10px 12px', border: 'none', cursor: 'pointer',
                                    background: isClubMode ? '#E7F3FF' : 'transparent',
                                    textAlign: 'left', transition: 'background 0.15s'
                                }}
                                onMouseEnter={e => { if (!isClubMode) e.currentTarget.style.background = '#F0F2F5'; }}
                                onMouseLeave={e => { if (!isClubMode) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: clubPage?.avatar_url ? `url(${clubPage.avatar_url}) center/cover` : '#1877F2',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: 14, fontWeight: 700, flexShrink: 0
                                }}>
                                    {!clubPage?.avatar_url && (clubPage?.name?.[0] || 'C')}
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{clubPage?.name || 'Club Page'}</div>
                                    <div style={{ fontSize: 12, color: C.textSec }}>Club Page</div>
                                </div>
                                {isClubMode && <span style={{ marginLeft: 'auto', color: '#1877F2', fontSize: 18 }}>✓</span>}
                            </button>
                        </div>
                    )}
                </div>
            )}
            <div style={{ padding: 12, display: 'flex', gap: 8 }}>
                {isClubMode && clubPage ? (
                    <div style={{
                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                        background: clubPage.avatar_url ? `url(${clubPage.avatar_url}) center/cover` : '#1877F2',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 16, fontWeight: 700,
                        border: '2px solid #1877F2'
                    }}>
                        {!clubPage.avatar_url && (clubPage.name?.[0] || 'C')}
                    </div>
                ) : (
                    <Link href="/hub/profile" style={{ display: 'block', cursor: 'pointer' }}>
                        <Avatar src={user?.avatar} name={user?.name} size={40} />
                    </Link>
                )}
                <div style={{ flex: 1, position: 'relative' }}>
                    <input
                        ref={inputRef}
                        value={content}
                        onChange={handleContentChange}
                        placeholder={isClubMode ? `Post as ${clubPage?.name || 'Club'}...` : `What's on your mind, ${user?.name || 'Player'}?`}
                        style={{ width: '100%', background: C.bg, border: 'none', borderRadius: 20, padding: '10px 16px', fontSize: 16, outline: 'none', boxSizing: 'border-box', color: C.text }}
                    />
                    {/* @Mention Dropdown */}
                    {showMentions && mentionResults.length > 0 && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                            background: C.card, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            border: `1px solid ${C.border}`, zIndex: 1000, maxHeight: 200, overflowY: 'auto'
                        }}>
                            {mentionResults.map(u => (
                                <div
                                    key={u.id}
                                    onClick={() => insertMention(u)}
                                    style={{
                                        padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                                        borderBottom: `1px solid ${C.border}`, transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Avatar name={u.username} size={32} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>@{u.username}</div>
                                        {u.full_name && <div style={{ fontSize: 12, color: C.textSec }}>{u.full_name}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {/* Media Preview Grid */}
            {media.length > 0 && (
                <div style={{ padding: '0 12px 8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: media.length === 1 ? '1fr' : media.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 4 }}>
                        {media.map((m, i) => (
                            <div key={i} style={{ position: 'relative', aspectRatio: media.length === 1 ? '16/9' : '1', borderRadius: 8, overflow: 'hidden' }}>
                                {m.type === 'video' ? (
                                    <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                                <button
                                    onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))}
                                    style={{
                                        position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%',
                                        background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', cursor: 'pointer',
                                        fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                >×</button>
                                {m.type === 'video' && (
                                    <div style={{
                                        position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.7)',
                                        padding: '2px 6px', borderRadius: 4, color: 'white', fontSize: 10
                                    }}>VIDEO</div>
                                )}
                            </div>
                        ))}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>{media.length}/{MAX_MEDIA} files</div>
                </div>
            )}
            {/* 🔗 LINK PREVIEW CARD - SmarterPoker-style */}
            {(linkPreview || linkLoading) && (
                <div style={{ padding: '0 12px 8px' }}>
                    <div style={{
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: C.bg,
                        position: 'relative'
                    }}>
                        {linkLoading ? (
                            <div style={{
                                padding: 24,
                                textAlign: 'center',
                                color: C.textSec
                            }}>
                                <span style={{ fontSize: 24 }}>⏳</span>
                                <div style={{ marginTop: 8 }}>Loading Preview...</div>
                            </div>
                        ) : linkPreview && (
                            <>
                                {/* Preview Image/Thumbnail */}
                                <div style={{
                                    height: 400,
                                    position: 'relative',
                                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden'
                                }}>
                                    {linkPreview.image ? (
                                        <img
                                            src={linkPreview.image}
                                            alt={linkPreview.title || 'Preview'}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'contain',
                                                objectPosition: 'center center',
                                                position: 'absolute',
                                                top: 0,
                                                left: 0
                                            }}
                                        />
                                    ) : (
                                        <span style={{ fontSize: 48, opacity: 0.5 }}>
                                            {linkPreview.type === 'video' ? '' : '🔗'}
                                        </span>
                                    )}
                                    {linkPreview.type === 'video' && linkPreview.image && (
                                        <div style={{
                                            position: 'absolute',
                                            width: 64, height: 64, borderRadius: '50%',
                                            background: 'rgba(0,0,0,0.7)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'white', fontSize: 28,
                                            zIndex: 1
                                        }}>▶</div>
                                    )}
                                </div>
                                {/* Preview Info */}
                                <div style={{ padding: 12 }}>
                                    <div style={{ fontSize: 11, color: C.textSec, textTransform: 'uppercase', marginBottom: 4 }}>
                                        {linkPreview.domain}
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: linkPreview.description ? 6 : 0 }}>
                                        {linkPreview.title}
                                    </div>
                                    {linkPreview.description && (
                                        <div style={{
                                            fontSize: 12,
                                            color: C.textSec,
                                            lineHeight: 1.4,
                                            overflow: 'hidden',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical'
                                        }}>
                                            {linkPreview.description}
                                        </div>
                                    )}
                                </div>
                                {/* Remove Button */}
                                <button
                                    onClick={removeLinkPreview}
                                    style={{
                                        position: 'absolute', top: 8, right: 8,
                                        width: 28, height: 28, borderRadius: '50%',
                                        background: 'rgba(0,0,0,0.7)', border: 'none',
                                        color: 'white', cursor: 'pointer', fontSize: 14,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                >×</button>
                            </>
                        )}
                    </div>
                </div>
            )}
            {error && <div style={{ padding: '0 12px 8px', color: C.red, fontSize: 13 }}> {error}</div>}
            <div style={{ borderTop: `1px solid ${C.border}`, padding: 8, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 }}>
                    <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleFiles} />
                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={media.length >= MAX_MEDIA}
                        style={{
                            padding: '6px 8px', borderRadius: 6,
                            border: 'none', background: 'transparent', cursor: media.length >= MAX_MEDIA ? 'not-allowed' : 'pointer',
                            color: media.length >= MAX_MEDIA ? '#ccc' : '#65676B', fontSize: 14, fontWeight: 600,
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F0F2F5'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >{uploading ? 'Uploading...' : 'Photo/Video'}</button>
                    <span style={{ color: '#BCC0C4' }}>·</span>
                    <button
                        onClick={onGoLive}
                        style={{
                            padding: '6px 8px', borderRadius: 6,
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            color: '#65676B', fontSize: 14, fontWeight: 600,
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F0F2F5'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >Go Live</button>
                    <span style={{ color: '#BCC0C4' }}>·</span>
                    <Link
                        href="/hub/reels"
                        style={{
                            padding: '6px 8px', borderRadius: 6,
                            background: 'transparent', textDecoration: 'none',
                            color: '#65676B', fontSize: 14, fontWeight: 600,
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F0F2F5'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >Reels</Link>
                    <span style={{ color: '#BCC0C4' }}>·</span>
                    <Link
                        href="/hub/friends"
                        style={{
                            padding: '6px 8px', borderRadius: 6,
                            background: 'transparent', textDecoration: 'none',
                            color: '#65676B', fontSize: 14, fontWeight: 600,
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F0F2F5'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >Find Friends</Link>
                    {onOpenClubPages && <>
                        <span style={{ color: '#BCC0C4' }}>·</span>
                        <span
                            onClick={onOpenClubPages}
                            style={{
                                padding: '6px 8px', borderRadius: 6,
                                background: 'transparent',
                                color: '#65676B', fontSize: 14, fontWeight: 600,
                                transition: 'background 0.2s', cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F0F2F5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >Club Pages</span>
                    </>}
                </div>
                <button onClick={handlePost} disabled={isPosting || (!content.trim() && !media.length && !linkPreview)} style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: C.blue, color: 'white', fontWeight: 600, cursor: 'pointer', opacity: isPosting || (!content.trim() && !media.length && !linkPreview) ? 0.5 : 1, flexShrink: 0 }}>Post</button>
            </div>
        </div>
    );
}

function PostCard({ post, currentUserId, currentUserName, currentUserAvatar, onLike, onDelete, onComment, onOpenArticle }) {
    const router = useRouter();
    const [liked, setLiked] = useState(post.isLiked);
    const [likeCount, setLikeCount] = useState(post.likeCount);
    const [bookmarked, setBookmarked] = useState(post.isBookmarked || false);
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loadingComments, setLoadingComments] = useState(false);
    const [commentCount, setCommentCount] = useState(post.commentCount || 0);
    const [fullScreenVideo, setFullScreenVideo] = useState(null);

    const handleBookmark = async () => {
        if (!currentUserId) return;
        const newBookmarked = !bookmarked;
        setBookmarked(newBookmarked);
        try {
            if (newBookmarked) {
                await supabase.from('social_interactions').upsert(
                    { post_id: post.id, user_id: currentUserId, interaction_type: 'bookmark' },
                    { onConflict: 'user_id,post_id,interaction_type' }
                );
            } else {
                await supabase.from('social_interactions').delete()
                    .eq('post_id', post.id)
                    .eq('user_id', currentUserId)
                    .eq('interaction_type', 'bookmark');
            }
        } catch (e) { console.error('Bookmark error:', e); setBookmarked(!newBookmarked); }
    };

    const handleLike = async () => {
        const newLiked = !liked;
        setLiked(newLiked);
        setLikeCount(prev => newLiked ? prev + 1 : Math.max(0, prev - 1));
        await onLike(post.id, newLiked ? 'like' : null);
    };

    const loadComments = async () => {
        if (comments.length > 0) return;
        setLoadingComments(true);
        try {
            // Step 1: Fetch comments
            const { data: commentsData, error: commentsError } = await supabase.from('social_comments')
                .select('id, content, created_at, author_id')
                .eq('post_id', post.id)
                .order('created_at', { ascending: true })
                .limit(50);

            if (commentsError) {
                console.error('[Comments] Error fetching comments:', commentsError);
                setLoadingComments(false);
                return;
            }

            if (!commentsData || commentsData.length === 0) {
                setComments([]);
                setLoadingComments(false);
                return;
            }

            // Step 2: Fetch author profiles for all comments
            const authorIds = [...new Set(commentsData.map(c => c.author_id).filter(Boolean))];
            let profilesMap = {};

            if (authorIds.length > 0) {
                const { data: profilesData } = await supabase.from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .in('id', authorIds);

                if (profilesData) {
                    profilesData.forEach(p => { profilesMap[p.id] = p; });
                }
            }

            // Step 3: Combine comments with author profiles
            setComments(commentsData.map(c => {
                const author = profilesMap[c.author_id] || {};
                return {
                    id: c.id,
                    text: c.content,
                    authorId: c.author_id,
                    authorName: author.full_name || author.username || 'Player',
                    authorAvatar: author.avatar_url || null,
                    authorUsername: author.username || null,
                    time: timeAgo(c.created_at)
                };
            }));
        } catch (e) {
            console.error('[Comments] Error loading comments:', e);
        }
        setLoadingComments(false);
    };

    const handleToggleComments = () => {
        setShowComments(!showComments);
        if (!showComments) loadComments();
    };

    const handleSubmitComment = async () => {
        if (!newComment.trim() || !currentUserId) return;
        try {
            const { data, error } = await supabase.from('social_comments').insert({ post_id: post.id, author_id: currentUserId, content: newComment }).select('id, content, created_at').maybeSingle();
            if (!error && data) {
                setComments(prev => [...prev, {
                    id: data.id,
                    text: data.content,
                    authorName: currentUserName || 'You',
                    authorId: currentUserId,
                    authorAvatar: currentUserAvatar,
                    time: 'Just now'
                }]);
                setCommentCount(prev => prev + 1);
                setNewComment('');
                if (onComment) onComment(post.id);
            }
        } catch (e) { console.error(e); }
    };

    return (
        <div style={{ background: C.card, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', marginBottom: 2, overflow: 'hidden' }}>
            <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Link href={`/hub/user/${post.author?.username || 'player'}`} style={{ textDecoration: 'none' }}>
                    <Avatar src={post.author?.avatar} name={post.author?.name} size={40} />
                </Link>
                <div style={{ flex: 1 }}>
                    <Link href={`/hub/user/${post.author?.username || 'player'}`} style={{ fontWeight: 600, color: C.text, textDecoration: 'none' }}>
                        {post.author?.name || 'Player'}
                    </Link>
                    <div style={{ fontSize: 12, color: C.textSec }}>{post.timeAgo}</div>
                </div>
                {(post.authorId === currentUserId || post.isGodMode) && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        {post.authorId !== currentUserId && post.isGodMode && (
                            <span style={{ fontSize: 10, background: '#FFD700', color: '#000', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}> GOD</span>
                        )}
                        <button onClick={() => onDelete(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 16 }}></button>
                    </div>
                )}
            </div>
            {post.content && (
                <div style={{ padding: '0 12px 12px', color: C.text, fontSize: 15, lineHeight: 1.4 }}>
                    {(() => {
                        // For link-type posts, strip URLs from displayed content (SmarterPoker-style)
                        let displayContent = post.content;
                        if (post.contentType === 'link' || post.contentType === 'video') {
                            // Remove URLs from content - they'll be shown as clickable preview cards
                            displayContent = displayContent
                                .replace(/https?:\/\/[^\s]+/gi, '')  // Remove http/https URLs
                                .replace(/🔗\s*/g, '')                // Remove link emoji prefix
                                .trim();
                        }

                        // If content is empty after stripping URL, don't render this block
                        if (!displayContent) return null;

                        // Render with @mention highlighting
                        return displayContent.split(/(@\w+)/g).map((part, i) =>
                            part.startsWith('@') ?
                                <span key={i} style={{ color: C.blue, fontWeight: 500, cursor: 'pointer' }}>{part}</span> :
                                part
                        );
                    })()}
                </div>
            )}
            {/* Media Grid - supports up to 10 images/videos */}
            {post.mediaUrls?.length > 0 && (
                <div style={{ padding: post.mediaUrls.length > 1 ? '0 2px 2px' : 0 }}>
                    {post.mediaUrls.length === 1 ? (
                        // Single media - full width
                        post.contentType === 'video' ? (
                            // VIDEO: Use VideoPostWrapper to handle broken video detection
                            // Click opens inline viewer for immediate playback (no navigation)
                            <VideoPostWrapper
                                url={post.mediaUrls[0]}
                                onValidVideoClick={() => setFullScreenVideo(post.mediaUrls[0])}
                            >
                                <video
                                    src={post.mediaUrls[0]}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    muted
                                    playsInline
                                    preload="metadata"
                                />
                            </VideoPostWrapper>
                        ) : (post.contentType === 'link' || post.contentType === 'article') ? (
                            // LINK/ARTICLE: Use centralized ArticleCard component
                            <ArticleCard
                                url={post.link_url || (() => {
                                    const match = post.content?.match(/https?:\/\/[^\s"'<>]+/);
                                    return match ? match[0] : null;
                                })()}
                                title={post.link_title}
                                description={post.link_description}
                                image={post.link_image || post.mediaUrls?.[0]}
                                siteName={post.link_site_name}
                                fallbackContent={post.content}
                                onClick={onOpenArticle}
                            />
                        ) : (
                            <img src={post.mediaUrls[0]} alt="" style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }} />
                        )
                    ) : post.mediaUrls.length === 2 ? (
                        // 2 media - side by side
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                            {post.mediaUrls.map((url, i) => (
                                <div key={i} style={{ aspectRatio: '1', overflow: 'hidden' }}>
                                    {post.contentType === 'video' && i === 0 ? (
                                        <video controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} src={url} />
                                    ) : (
                                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : post.mediaUrls.length === 3 ? (
                        // 3 media - 1 large + 2 small
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 2 }}>
                            <div style={{ aspectRatio: '1', overflow: 'hidden' }}>
                                <img src={post.mediaUrls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {post.mediaUrls.slice(1).map((url, i) => (
                                    <div key={i} style={{ flex: 1, overflow: 'hidden' }}>
                                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : post.mediaUrls.length === 4 ? (
                        // 4 media - 2x2 grid
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                            {post.mediaUrls.map((url, i) => (
                                <div key={i} style={{ aspectRatio: '1', overflow: 'hidden' }}>
                                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        // 5+ media - 2 large + rest in row with +N overlay
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginBottom: 2 }}>
                                {post.mediaUrls.slice(0, 2).map((url, i) => (
                                    <div key={i} style={{ aspectRatio: '1', overflow: 'hidden' }}>
                                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                                {post.mediaUrls.slice(2, 5).map((url, i) => (
                                    <div key={i} style={{ aspectRatio: '1', overflow: 'hidden', position: 'relative' }}>
                                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        {i === 2 && post.mediaUrls.length > 5 && (
                                            <div style={{
                                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: 'white', fontSize: 24, fontWeight: 600
                                            }}>+{post.mediaUrls.length - 5}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {/* 🔗 LINK PREVIEW for posts with link_url but NO media_urls (ghost fleet posts) */}
            {(!post.mediaUrls || post.mediaUrls.length === 0) && post.link_url && (
                <ArticleCard
                    url={post.link_url}
                    title={post.link_title}
                    description={post.link_description}
                    image={post.link_image}
                    siteName={post.link_site_name}
                    fallbackContent={post.content}
                    onClick={onOpenArticle}
                />
            )}
            <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', color: C.textSec, fontSize: 13 }}>
                <span>{likeCount > 0 && `👍 ${likeCount}`}</span>
                <span style={{ cursor: 'pointer' }} onClick={handleToggleComments}>{commentCount > 0 && `${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`}</span>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, display: 'flex' }}>
                <button onClick={handleLike} style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: liked ? C.blue : C.textSec, fontWeight: 500, fontSize: 13 }}>👍 {liked ? 'Liked' : 'Like'}</button>
                <button onClick={handleToggleComments} style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: showComments ? C.blue : C.textSec, fontWeight: 500, fontSize: 13 }}> Comment</button>
                <button
                    onClick={() => {
                        const shareUrl = `${window.location.origin}/hub/post/${post.id}`;
                        if (navigator.share) {
                            navigator.share({
                                title: 'Check out this post on Smarter.Poker',
                                text: post.content?.slice(0, 100) || 'A post from Smarter.Poker',
                                url: shareUrl,
                            }).catch(() => { });
                        } else {
                            navigator.clipboard.writeText(shareUrl);
                            alert('Link copied to clipboard!');
                        }
                    }}
                    style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSec, fontWeight: 500, fontSize: 13 }}
                >↗️ Share</button>
                <button
                    onClick={handleBookmark}
                    style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: bookmarked ? '#FFB800' : C.textSec, fontWeight: 500, fontSize: 13 }}
                >{bookmarked ? '' : ''} Save</button>
            </div>
            {showComments && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
                    {loadingComments && <div style={{ color: C.textSec, fontSize: 13 }}>Loading Comments...</div>}
                    {comments.map(c => (
                        <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <Avatar src={c.authorAvatar} name={c.authorName} size={28} />
                            <div style={{ flex: 1, background: C.bg, borderRadius: 12, padding: '6px 10px' }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{c.authorName}</div>
                                <div style={{ fontSize: 14, color: C.text }}>{c.text}</div>
                            </div>
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <Avatar src={currentUserAvatar} name={currentUserName} size={28} />
                        <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSubmitComment()} placeholder="Write A Comment..." style={{ flex: 1, padding: '8px 14px', borderRadius: 18, border: 'none', background: C.bg, fontSize: 14, outline: 'none' }} />
                        <button onClick={handleSubmitComment} disabled={!newComment.trim()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: newComment.trim() ? C.blue : C.textSec, fontWeight: 600, fontSize: 13 }}>Post</button>
                    </div>
                </div>
            )}

            {/* Full Screen Video Viewer Modal */}
            {fullScreenVideo && (
                <FullScreenVideoViewer
                    videoUrl={fullScreenVideo}
                    author={post.author}
                    caption={post.content}
                    onClose={() => setFullScreenVideo(null)}
                    onLike={handleLike}
                    onComment={() => { setFullScreenVideo(null); setShowComments(true); }}
                    onShare={() => {
                        const shareUrl = `${window.location.origin}/hub/post/${post.id}`;
                        if (navigator.share) {
                            navigator.share({ title: 'Check out this video on Smarter.Poker', url: shareUrl }).catch(() => { });
                        } else {
                            navigator.clipboard.writeText(shareUrl);
                        }
                    }}
                />
            )}
        </div>
    );
}

function ChatWindow({ chat, messages, currentUserId, onSend, onClose }) {
    const [text, setText] = useState('');
    const endRef = useRef(null);
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const send = async () => {
        if (!text.trim()) return;
        await onSend(text);
        setText('');
    };

    return (
        <div style={{ width: 328, height: 400, background: C.card, borderRadius: '8px 8px 0 0', boxShadow: '0 -2px 8px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', border: `1px solid ${C.border}` }}>
            <div style={{ padding: 8, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar src={chat.avatar} name={chat.name} size={32} online={chat.online} />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{chat.name}</div></div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {messages.map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: m.senderId === currentUserId ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '70%', padding: '6px 10px', borderRadius: 16, background: m.senderId === currentUserId ? C.blue : C.bg, color: m.senderId === currentUserId ? 'white' : C.text, fontSize: 14 }}>{m.text}</div>
                    </div>
                ))}
                <div ref={endRef} />
            </div>
            <div style={{ padding: 8, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
                <input value={text} onChange={e => setText(e.target.value)} onKeyPress={e => e.key === 'Enter' && send()} placeholder="Aa" style={{ flex: 1, padding: '6px 12px', borderRadius: 18, border: 'none', background: C.bg, fontSize: 14, outline: 'none' }} />
                <button onClick={send} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, fontSize: 16 }}>➤</button>
            </div>
        </div>
    );
}

// ===== CLUB PAGE CREATE MODAL =====
function ClubPageCreateModal({ C, commanderData, userId, onCreated, onClose }) {
    const [pageName, setPageName] = useState(commanderData?.venue_name || '');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('poker_room');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

    const categories = [
        { key: 'poker_room', label: 'Poker Room' },
        { key: 'casino', label: 'Casino' },
        { key: 'card_club', label: 'Card Club' },
        { key: 'charity', label: 'Charity Organization' },
        { key: 'league', label: 'League / Tour' },
        { key: 'other', label: 'Other' },
    ];

    const handleCreate = async () => {
        if (!pageName.trim()) { setError('Page name is required'); return; }
        setCreating(true);
        setError('');
        try {
            const res = await fetch('/api/social/pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: pageName.trim(),
                    page_type: 'club',
                    description: description.trim(),
                    category,
                    owner_id: userId,
                    linked_venue_id: commanderData?.venue_id ? String(commanderData.venue_id) : undefined,
                    location_city: (() => { try { const v = JSON.parse(localStorage.getItem('commander_venue') || '{}'); return v.city || v.location_city || ''; } catch { return ''; } })(),
                    location_state: (() => { try { const v = JSON.parse(localStorage.getItem('commander_venue') || '{}'); return v.state || v.location_state || ''; } catch { return ''; } })(),
                    is_public: true,
                    allow_member_posts: false,
                }),
            });
            const json = await res.json();
            if (json.success && json.data) {
                onCreated(json.data);
            } else {
                setError(json.error || 'Failed to create page');
            }
        } catch (e) {
            setError('Network error. Please try again.');
        }
        setCreating(false);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
            <div style={{ position: 'relative', background: '#fff', borderRadius: 12, width: '90%', maxWidth: 480, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: C.text }}>Create Your Club Page</h2>
                <p style={{ margin: '0 0 20px', fontSize: 14, color: C.textSec }}>Set Up A Public Page For Your Venue On Smarter.Poker Social</p>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Page Name</label>
                <input value={pageName} onChange={e => setPageName(e.target.value)} placeholder="Your Venue Name"
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 15, outline: 'none', marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit', color: '#050505', background: '#fff' }} />

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, outline: 'none', marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff', color: '#050505' }}>
                    {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell People About Your Venue..."
                    rows={3} style={{ width: '100%', padding: '10px 14px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, outline: 'none', resize: 'vertical', marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit', color: '#050505', background: '#fff' }} />

                {error && <p style={{ color: C.red, fontSize: 13, margin: '0 0 10px' }}>{error}</p>}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#E4E6EB', color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    <button onClick={handleCreate} disabled={creating || !pageName.trim()} style={{
                        padding: '10px 24px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        opacity: creating || !pageName.trim() ? 0.5 : 1
                    }}>{creating ? 'Creating...' : 'Create Page'}</button>
                </div>
            </div>
        </div>
    );
}

// ===== CLUB PAGE DASHBOARD (Owner Management View) =====
const AMENITIES_LIST = [
    {
        cat: 'Dining & Beverages', items: [
            { k: 'food_service', l: 'Food Service' }, { k: 'food_tableside', l: 'Food Tableside' },
            { k: 'order_food_at_table', l: 'Order Food at Table' }, { k: 'full_bar', l: 'Full Bar' },
            { k: 'cocktail_service', l: 'Cocktail Service' }, { k: 'self_serve_drinks', l: 'Self Serve Drink Station' },
            { k: 'snack_bar', l: 'Snack Bar' }, { k: 'room_service', l: 'Room Service' },
        ]
    },
    {
        cat: 'Parking & Lodging', items: [
            { k: 'free_parking', l: 'Free Parking' }, { k: 'self_parking', l: 'Self Parking' },
            { k: 'valet_parking', l: 'Valet Parking' }, { k: 'parking_garage', l: 'Parking Garage' },
            { k: 'hotel_onsite', l: 'Hotel On-Site' }, { k: 'discounted_hotel', l: 'Discounted Hotel Rates' },
        ]
    },
    {
        cat: 'Player Services', items: [
            { k: 'phone_in_list', l: 'Phone-in Waitlist' }, { k: 'check_cashing', l: 'Check Cashing' },
            { k: 'currency_exchange', l: 'Currency Exchange' }, { k: 'safe_deposit', l: 'Safe Deposit Boxes' },
            { k: 'atm_onsite', l: 'ATM On-Site' }, { k: 'coat_check', l: 'Coat Check' },
        ]
    },
    {
        cat: 'Player Perks', items: [
            { k: 'comps_program', l: 'Comps Program' }, { k: 'loyalty_program', l: 'Loyalty Program' },
            { k: 'rewards_card', l: 'Player Rewards Card' }, { k: 'hourly_drawings', l: 'Hourly Drawings' },
            { k: 'jackpot_promos', l: 'Jackpot Promotions' },
        ]
    },
    {
        cat: 'Comfort & Environment', items: [
            { k: 'non_smoking', l: 'Non-Smoking' }, { k: 'smoking_area', l: 'Smoking Area' },
            { k: 'massage', l: 'Massage Service' }, { k: 'nearby_restrooms', l: 'Nearby Restrooms' },
            { k: 'wifi', l: 'Free WiFi' }, { k: 'usb_chargers', l: 'USB Chargers' },
            { k: 'charging_stations', l: 'Charging Stations' }, { k: 'televisions', l: 'Televisions' },
            { k: 'tvs_at_tables', l: 'TVs at Tables' },
        ]
    },
    {
        cat: 'Table Features', items: [
            { k: 'auto_shufflers', l: 'Auto Shufflers' }, { k: 'rfid_tables', l: 'RFID Tables' },
            { k: 'live_streaming', l: 'Live Streaming' },
        ]
    },
    {
        cat: 'Facility', items: [
            { k: 'private_room', l: 'Private Card Room' }, { k: 'high_limit', l: 'High-Limit Room' },
            { k: 'tournament_room', l: 'Tournament Room' }, { k: 'membership_required', l: 'Membership Required' },
        ]
    },
];
const CATEGORY_LABELS = { poker_room: 'Poker Room', casino: 'Casino', card_club: 'Card Club', charity: 'Charity Organization', league: 'League / Tour', home_game: 'Home Game', other: 'Other' };
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

function ClubPageDashboard({ C, page, userId, onBack, onPageUpdated, onGoLive }) {
    const router = useRouter();
    const [activeTab, setActiveTab] = usePersistedState('sp-filters-social-media', 'posts');
    const [posts, setPosts] = useState([]);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [postContent, setPostContent] = useState('');
    const [posting, setPosting] = useState(false);
    const [editingPage, setEditingPage] = useState(false);
    const [editName, setEditName] = useState(page.name || '');
    const [editDesc, setEditDesc] = useState(page.description || '');
    const [editWebsite, setEditWebsite] = useState(page.website || '');
    const [editPhone, setEditPhone] = useState(page.phone || '');
    const [editAvatarUrl, setEditAvatarUrl] = useState(page.avatar_url || '');
    const [editCity, setEditCity] = useState(page.location_city || '');
    const [editState, setEditState] = useState(page.location_state || '');
    const [editAddress, setEditAddress] = useState((page.metadata || {}).address || '');
    const [saving, setSaving] = useState(false);

    // Enhanced state — Photos, Schedule, Tournaments, Amenities
    const meta = page.metadata || {};
    const [photos, setPhotos] = useState(meta.photos || []);
    const [newPhotoUrl, setNewPhotoUrl] = useState('');
    const [newPhotoCaption, setNewPhotoCaption] = useState('');
    const [schedule, setSchedule] = useState(() => {
        const s = meta.run_schedule || {};
        const init = {};
        DAYS.forEach(d => { init[d] = { open: false, hours: '', games: [], location: '', ...(s[d] || {}) }; });
        return init;
    });
    const [newGame, setNewGame] = useState({});
    const [tournaments, setTournaments] = useState([]);
    const [amenities, setAmenities] = useState(meta.amenities || {});
    const [socialLinks, setSocialLinks] = useState(meta.social_links || { facebook: '', instagram: '', twitter: '' });
    const [metaSaving, setMetaSaving] = useState(false);
    const [metaSaved, setMetaSaved] = useState('');

    // Fetch tournaments on mount (always, so floating Live Event button works on all tabs)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/public/venue/${page.id}`);
                const data = await res.json();
                if (!cancelled && data.success) {
                    setTournaments(data.data.upcoming_tournaments || []);
                }
            } catch (err) { console.error('Failed to load tournaments:', err); }
        })();
        return () => { cancelled = true; };
    }, [page.id]);

    // Live Games state
    const [liveGames, setLiveGames] = useState([]);
    const [loadingGames, setLoadingGames] = useState(false);
    // Timer tick for live countdown clocks
    const [timerTick, setTimerTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTimerTick(p => p + 1), 1000);
        return () => clearInterval(t);
    }, []);
    const [pendingFollowers, setPendingFollowers] = useState([]);

    // Cover photo state
    const [coverPhoto, setCoverPhoto] = useState((page.metadata || {}).cover_photo_url || page.cover_url || '');
    const [coverUploading, setCoverUploading] = useState(false);
    const coverInputRef = useRef(null);

    // Logo upload state
    const [logoUrl, setLogoUrl] = useState((page.metadata || {}).logo_url || page.avatar_url || '');
    const [logoUploading, setLogoUploading] = useState(false);
    const logoInputRef = useRef(null);

    // Post media upload state
    const [postMedia, setPostMedia] = useState([]);
    const [postUploading, setPostUploading] = useState(false);
    const postMediaRef = useRef(null);

    const handleCoverUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCoverUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'covers');
            formData.append('prefix', page.id);
            const _coverSess = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
            const uploadRes = await fetch('/api/social/upload', {
                method: 'POST',
                headers: _coverSess?.access_token ? { Authorization: `Bearer ${_coverSess.access_token}` } : {},
                body: formData,
            });
            const uploadJson = await uploadRes.json();
            if (uploadJson.success && uploadJson.url) {
                const url = uploadJson.url;
                setCoverPhoto(url);
                // Save to both metadata.cover_photo_url AND cover_url column so public page stays in sync
                const merged = { ...page.metadata, cover_photo_url: url };
                setMetaSaving(true); setMetaSaved('');
                try {
                    const res = await fetch('/api/social/pages', {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: page.id, owner_id: userId, cover_url: url, metadata: merged }),
                    });
                    const json = await res.json();
                    if (json.success && json.data) {
                        onPageUpdated(json.data);
                        setMetaSaved('Cover photo updated!');
                        setTimeout(() => setMetaSaved(''), 2000);
                    }
                } catch (saveErr) { console.error('Cover save error:', saveErr); }
                setMetaSaving(false);
            } else {
                alert('Cover upload failed: ' + (uploadJson.error || 'Unknown error'));
            }
        } catch (err) { console.error('Cover upload error:', err); alert('Cover upload error: ' + err.message); }
        setCoverUploading(false);
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLogoUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'logos');
            formData.append('prefix', page.id);
            const _logoSess = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
            const uploadRes = await fetch('/api/social/upload', {
                method: 'POST',
                headers: _logoSess?.access_token ? { Authorization: `Bearer ${_logoSess.access_token}` } : {},
                body: formData,
            });
            const uploadJson = await uploadRes.json();
            if (uploadJson.success && uploadJson.url) {
                const url = uploadJson.url;
                setLogoUrl(url);
                // Save to both metadata.logo_url AND avatar_url column so public page stays in sync
                const merged = { ...page.metadata, logo_url: url };
                setMetaSaving(true); setMetaSaved('');
                try {
                    const res = await fetch('/api/social/pages', {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: page.id, owner_id: userId, avatar_url: url, metadata: merged }),
                    });
                    const json = await res.json();
                    if (json.success && json.data) {
                        onPageUpdated(json.data);
                        setMetaSaved('Logo updated!');
                        setTimeout(() => setMetaSaved(''), 2000);
                    }
                } catch (saveErr) { console.error('Logo save error:', saveErr); }
                setMetaSaving(false);
            } else {
                alert('Logo upload failed: ' + (uploadJson.error || 'Unknown error'));
            }
        } catch (err) { console.error('Logo upload error:', err); alert('Logo upload error: ' + err.message); }
        setLogoUploading(false);
        if (logoInputRef.current) logoInputRef.current.value = '';
    };

    const handlePostMediaSelect = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const remaining = 10 - postMedia.length;
        if (remaining <= 0) return;
        const toUpload = files.slice(0, remaining);
        setPostUploading(true);
        const uploaded = [];
        for (const file of toUpload) {
            const isVideo = file.type.startsWith('video/');
            try {
                if (isVideo) {
                    // Direct-to-Supabase upload for videos (bypasses Vercel body limit)
                    const _clubVidSess = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
                    const metaRes = await fetch('/api/social/upload-url', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(_clubVidSess?.access_token ? { Authorization: `Bearer ${_clubVidSess.access_token}` } : {}),
                        },
                        body: JSON.stringify({
                            fileName: file.name,
                            fileSize: file.size,
                            mimeType: file.type,
                            folder: 'club-posts',
                            prefix: page.id,
                        }),
                    });
                    const meta = await metaRes.json();
                    if (!meta.success) {
                        alert('Upload failed: ' + (meta.error || 'Unknown error'));
                        continue;
                    }
                    const uploadRes = await fetch(meta.signedUrl, {
                        method: 'PUT',
                        headers: { 'Content-Type': file.type },
                        body: file,
                    });
                    if (!uploadRes.ok) {
                        alert('Video upload failed — please try again');
                        continue;
                    }
                    uploaded.push({ type: 'video', url: meta.publicUrl });
                } else {
                    // Keep existing API for images (small files)
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('folder', 'club-posts');
                    formData.append('prefix', page.id);
                    const _clubImgSess = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
                    const res = await fetch('/api/social/upload', {
                        method: 'POST',
                        headers: _clubImgSess?.access_token ? { Authorization: `Bearer ${_clubImgSess.access_token}` } : {},
                        body: formData,
                    });
                    const json = await res.json();
                    if (json.success && json.url) {
                        uploaded.push({ type: json.type || 'photo', url: json.url });
                    } else {
                        console.error('[ClubPage] Upload failed:', json.error);
                        alert('Upload failed: ' + (json.error || 'Unknown error'));
                    }
                }
            } catch (err) {
                console.error('[ClubPage] Upload error:', err);
                alert('Upload failed: ' + err.message);
            }
        }
        setPostMedia(prev => [...prev, ...uploaded]);
        setPostUploading(false);
        if (postMediaRef.current) postMediaRef.current.value = '';
    };

    // Fetch live games
    useEffect(() => {
        if (activeTab === 'live_games') {
            const fetchGames = async () => {
                setLoadingGames(true);
                try {
                    const res = await fetch(`/api/social/pages/games?page_id=${page.id}`);
                    const json = await res.json();
                    if (json.success) { setLiveGames(json.data || []); setTimerTick(0); }
                } catch (e) { console.error('Games fetch error:', e); }
                setLoadingGames(false);
            };
            const fetchPending = async () => {
                try {
                    const res = await fetch(`/api/social/pages/follow?page_id=${page.id}&requester_id=${userId}`);
                    const json = await res.json();
                    if (json.success) setPendingFollowers((json.data || []).filter(f => f.status === 'pending'));
                } catch (e) { console.error('Pending fetch error:', e); }
            };
            fetchGames();
            fetchPending();
            const interval = setInterval(() => { fetchGames(); fetchPending(); }, 15000);
            return () => clearInterval(interval);
        }
    }, [activeTab, page.id]);

    const handleApproveFollower = async (followerId, action) => {
        try {
            await fetch('/api/social/pages/follow', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_id: page.id, user_id: userId, action, follower_id: followerId }),
            });
            setPendingFollowers(prev => prev.filter(f => f.user_id !== followerId));
        } catch (e) { console.error('Approve/reject error:', e); }
    };

    // Save metadata helper
    const saveMetadata = async (newMeta, label) => {
        setMetaSaving(true); setMetaSaved('');
        try {
            const merged = { ...page.metadata, ...newMeta };
            const res = await fetch('/api/social/pages', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: page.id, owner_id: userId, metadata: merged }),
            });
            const json = await res.json();
            if (json.success && json.data) {
                onPageUpdated(json.data);
                setMetaSaved(label || 'Saved!');
                setTimeout(() => setMetaSaved(''), 2000);

                // Auto-geocode locations in background (fire-and-forget)
                try {
                    const locations = [];
                    if (json.data.location_city) {
                        locations.push(json.data.location_city + (json.data.location_state ? ', ' + json.data.location_state : ''));
                    }
                    const sched = merged.run_schedule || newMeta.run_schedule;
                    if (sched) {
                        Object.values(sched).forEach(day => {
                            if (day && day.open && day.location && day.location.trim()) {
                                locations.push(day.location.trim());
                            }
                        });
                    }
                    const existing = merged.geocoded_locations || {};
                    const unique = [...new Set(locations)].filter(loc => !existing[loc]);
                    if (unique.length > 0) {
                        fetch('/api/social/geocode-locations', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ page_id: page.id, locations: unique }),
                        }).catch(() => { });
                    }
                } catch (geoErr) {
                    console.warn('[ClubPage] Background geocoding failed:', geoErr);
                }
            }
        } catch (e) { console.error('Meta save error:', e); setMetaSaved('Error saving'); }
        setMetaSaving(false);
    };

    // Fetch posts
    useEffect(() => {
        const fetchPosts = async () => {
            setLoadingPosts(true);
            try {
                const res = await fetch(`/api/social/pages/posts?page_id=${page.id}&user_id=${userId}`);
                const json = await res.json();
                if (json.success) setPosts(json.data || []);
            } catch (e) { console.error('Club page posts fetch error:', e); }
            setLoadingPosts(false);
        };
        fetchPosts();
    }, [page.id, userId]);

    const handlePost = async () => {
        if (!postContent.trim() && postMedia.length === 0) return;
        setPosting(true);
        try {
            const mediaUrls = postMedia.map(m => m.url);
            const contentType = postMedia.some(m => m.type === 'video') ? 'video' : (postMedia.length > 0 ? 'image' : 'text');
            console.log('[ClubPage] Posting:', { page_id: page.id, author_id: userId, content: postContent.trim().substring(0, 50), contentType, mediaUrls });
            const res = await fetch('/api/social/pages/posts', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_id: page.id, author_id: userId, content: postContent.trim(), content_type: contentType, media_urls: mediaUrls }),
            });
            const json = await res.json();
            console.log('[ClubPage] Post response:', json);
            if (json.success && json.data) {
                setPosts(prev => [{ ...json.data, author: { username: 'You' }, user_liked: false }, ...prev]);
                setPostContent('');
                setPostMedia([]);
            } else if (json.error) {
                alert('Post failed: ' + json.error);
            }
        } catch (e) {
            console.error('Post error:', e);
            alert('Post failed: ' + e.message);
        }
        setPosting(false);
    };

    const handleDeletePost = async (postId) => {
        try { await fetch(`/api/social/pages/posts?id=${postId}&author_id=${userId}`, { method: 'DELETE' }); setPosts(prev => prev.filter(p => p.id !== postId)); } catch (e) { console.error('Delete error:', e); }
    };

    const handleSavePage = async () => {
        setSaving(true);
        try {
            // Merge address into metadata
            const updatedMetadata = { ...page.metadata, address: editAddress.trim() };
            const res = await fetch('/api/social/pages', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: page.id, owner_id: userId, name: editName.trim(), description: editDesc.trim(), website: editWebsite.trim(), phone: editPhone.trim(), avatar_url: editAvatarUrl.trim() || null, location_city: editCity.trim(), location_state: editState.trim(), metadata: updatedMetadata }),
            });
            const json = await res.json();
            if (json.success && json.data) { onPageUpdated(json.data); setEditingPage(false); }
        } catch (e) { console.error('Save error:', e); }
        setSaving(false);
    };

    const handleTogglePin = async (post) => {
        try {
            await fetch('/api/social/pages/posts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: post.id, author_id: userId, is_pinned: !post.is_pinned }) });
            setPosts(prev => prev.map(p => p.id === post.id ? { ...p, is_pinned: !p.is_pinned } : p));
        } catch (e) { console.error('Pin error:', e); }
    };

    const inputSt = { width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
    const labelSt = { display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 };
    const btnPrimary = { padding: '8px 20px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
    const btnSec = { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#E4E6EB', color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
    const cardSt = { background: C.card, borderRadius: 12, padding: 16, marginBottom: 8 };
    const savedBadge = metaSaved ? <span style={{ fontSize: 12, color: metaSaved === 'Error saving' ? '#F02849' : '#42B72A', fontWeight: 600, marginLeft: 8 }}>{metaSaved}</span> : null;

    const tabs = [
        { key: 'posts', label: 'Posts' },
        { key: 'photos', label: 'Photos' },
        { key: 'schedule', label: 'Schedule' },
        { key: 'tournaments', label: 'Tourneys' },
        { key: 'amenities', label: 'Amenities' },
        { key: 'live_games', label: 'Live Games' },
        { key: 'about', label: 'About' },
    ];

    return (
        <div style={{ paddingBottom: 8 }}>
            {/* Header */}
            <div style={{ background: C.card, borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
                {/* Cover Photo Area */}
                <div style={{
                    height: 200, position: 'relative',
                    background: coverPhoto ? `url(${coverPhoto}) center/cover no-repeat` : 'linear-gradient(135deg, #1877F2 0%, #166FE5 50%, #1877F2 100%)',
                    display: 'flex', alignItems: 'flex-end', padding: 16
                }}>
                    {/* Edit Cover Photo button */}
                    <input type="file" accept="image/*" ref={coverInputRef} onChange={handleCoverUpload} style={{ display: 'none' }} />
                    <button onClick={() => coverInputRef.current?.click()} disabled={coverUploading} style={{
                        position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 13, fontWeight: 600,
                        fontFamily: 'inherit', backdropFilter: 'blur(4px)'
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                        </svg>
                        {coverUploading ? 'Uploading...' : 'Upload Photo'}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input type="file" accept="image/*" ref={logoInputRef} onChange={handleLogoUpload} style={{ display: 'none' }} />
                        <div
                            onClick={() => logoInputRef.current?.click()}
                            title="Click To Upload Logo"
                            style={{
                                width: 80, height: 80, borderRadius: '50%', background: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 30, fontWeight: 800, color: '#1877F2', border: '3px solid #fff',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.2)', cursor: 'pointer',
                                position: 'relative', overflow: 'hidden'
                            }}
                        >
                            {logoUrl ? (
                                <img src={logoUrl} alt={page.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            ) : (
                                (page.name || 'C')[0].toUpperCase()
                            )}
                            <div style={{
                                position: 'absolute', bottom: 2, right: 2, width: 24, height: 24, borderRadius: '50%',
                                background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                            }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                                </svg>
                            </div>
                            {logoUploading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#1877F2', borderRadius: '50%' }}>...</div>}
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.4)' }}>{page.name}</h2>
                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>
                                {page.follower_count || 0} follower{(page.follower_count || 0) !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Action Bar */}
                <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => { if (window.history.length > 1) router.back(); else onBack(); }} style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none', background: '#E4E6EB',
                        color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Back</button>
                    <button onClick={() => setEditingPage(!editingPage)} style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        background: editingPage ? C.blue : '#E4E6EB',
                        color: editingPage ? '#fff' : C.text,
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Edit Page</button>
                    {onGoLive && <button onClick={onGoLive} style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none', background: '#E4E6EB',
                        color: '#E53935', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 6
                    }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E53935', display: 'inline-block' }}></span>Go Live</button>}
                    <button onClick={() => router.push(`/club/${page.id}`)} style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none', background: '#E4E6EB',
                        color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto'
                    }}>View Public Page</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderTop: `1px solid ${C.border}` }}>
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                            color: activeTab === t.key ? C.blue : C.textSec,
                            fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                            borderBottom: activeTab === t.key ? `3px solid ${C.blue}` : '3px solid transparent'
                        }}>{t.label}</button>
                    ))}
                </div>
            </div>

            {/* Edit Page Panel */}
            {editingPage && (
                <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 8 }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: C.text }}>Edit Page Info</h3>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Name</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, marginBottom: 10, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Description</label>
                    <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, resize: 'vertical', marginBottom: 10, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Website</label>
                            <input value={editWebsite} onChange={e => setEditWebsite(e.target.value)} placeholder="https://..."
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Phone</label>
                            <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="(555) 555-5555"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                        </div>
                    </div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4, marginTop: 10 }}>Profile Image URL</label>
                    <input value={editAvatarUrl} onChange={e => setEditAvatarUrl(e.target.value)} placeholder="https://your-image-url.com/logo.png"
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, marginBottom: 10, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Street Address</label>
                    <input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="123 Main St"
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, marginBottom: 10, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>City</label>
                            <input value={editCity} onChange={e => setEditCity(e.target.value)} placeholder="Las Vegas"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>State</label>
                            <input value={editState} onChange={e => setEditState(e.target.value)} placeholder="NV"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #CCD0D5', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                        <button onClick={() => setEditingPage(false)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#E4E6EB', color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                        <button onClick={handleSavePage} disabled={saving} style={{
                            padding: '8px 20px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.5 : 1
                        }}>{saving ? 'Saving...' : 'Save Changes'}</button>
                    </div>
                </div>
            )}

            {/* Posts Tab */}
            {activeTab === 'posts' && (
                <>
                    {/* Post Composer */}
                    <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                                {(page.name || 'C')[0].toUpperCase()}
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Post as {page.name}</span>
                        </div>
                        <textarea
                            value={postContent}
                            onChange={e => setPostContent(e.target.value)}
                            placeholder={`What's happening at ${page.name || 'your venue'}?`}
                            rows={3}
                            style={{
                                width: '100%', padding: '10px 14px', border: '1px solid #CCD0D5', borderRadius: 8,
                                fontSize: 15, outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                                boxSizing: 'border-box', lineHeight: 1.4, color: '#050505', background: '#fff'
                            }}
                        />

                        {/* Media preview thumbnails */}
                        {postMedia.length > 0 && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                {postMedia.map((m, i) => (
                                    <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid #CCD0D5' }}>
                                        {m.type === 'video' ? (
                                            <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        )}
                                        <button onClick={() => setPostMedia(prev => prev.filter((_, j) => j !== i))} style={{
                                            position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%',
                                            background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer',
                                            fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1
                                        }}>x</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Media toolbar + Post button */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid #E4E6EB' }}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input type="file" accept="image/*,video/*" multiple ref={postMediaRef} onChange={handlePostMediaSelect} style={{ display: 'none' }} />
                                <button onClick={() => postMediaRef.current?.click()} disabled={postUploading} style={{
                                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                                    border: 'none', background: '#F0F2F5', color: '#1877F2', fontSize: 13,
                                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                                }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#45BD62" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                                    </svg>
                                    {postUploading ? 'Uploading...' : 'Photo/Video'}
                                </button>
                            </div>
                            <button onClick={handlePost} disabled={posting || postUploading || (!postContent.trim() && postMedia.length === 0)} style={{
                                padding: '8px 24px', borderRadius: 8, border: 'none', background: '#1877F2', color: '#fff',
                                fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                opacity: (posting || postUploading || (!postContent.trim() && postMedia.length === 0)) ? 0.5 : 1
                            }}>{posting ? 'Posting...' : 'Post'}</button>
                        </div>
                    </div>

                    {/* Posts Feed */}
                    {loadingPosts ? (
                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                            <div style={{ width: 32, height: 32, border: '3px solid #E4E6EB', borderTopColor: '#1877F2', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                            <p>Loading Posts...</p>
                        </div>
                    ) : posts.length === 0 ? (
                        <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center' }}>
                            <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>No Posts Yet</p>
                            <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Share Your First Update With Your Followers!</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {posts.map(post => (
                                <div key={post.id} style={{ background: C.card, borderRadius: 10, border: '1px solid #E4E6EB', overflow: 'hidden' }}>
                                    <div style={{ padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                                                    {(page.name || 'C')[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{page.name}</div>
                                                    <div style={{ fontSize: 11, color: C.textSec }}>{timeAgo(post.created_at)}</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {post.is_pinned && <span style={{ fontSize: 10, background: '#FFB800', color: '#000', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>PINNED</span>}
                                                <button onClick={() => handleTogglePin(post)} title={post.is_pinned ? 'Unpin' : 'Pin'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 13, fontWeight: 600 }}>{post.is_pinned ? 'Unpin' : 'Pin'}</button>
                                                <button onClick={() => handleDeletePost(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 14 }}>x</button>
                                            </div>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 15, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{post.content}</p>
                                    </div>
                                    <div style={{ borderTop: `1px solid ${C.border}`, padding: '6px 14px', display: 'flex', gap: 16, fontSize: 12, color: C.textSec }}>
                                        <span>{post.like_count || 0} likes</span>
                                        <span>{post.comment_count || 0} comments</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Photos Tab */}
            {activeTab === 'photos' && (
                <div style={cardSt}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Photo Gallery</h3>
                        {savedBadge}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                        <input value={newPhotoUrl} onChange={e => setNewPhotoUrl(e.target.value)} placeholder="Image URL (https://...)" style={{ ...inputSt, flex: 2, minWidth: 200 }} />
                        <input value={newPhotoCaption} onChange={e => setNewPhotoCaption(e.target.value)} placeholder="Caption (optional)" style={{ ...inputSt, flex: 1, minWidth: 120 }} />
                        <button onClick={() => {
                            if (!newPhotoUrl.trim()) return;
                            const updated = [...photos, { url: newPhotoUrl.trim(), caption: newPhotoCaption.trim(), uploaded_at: new Date().toISOString() }];
                            setPhotos(updated); setNewPhotoUrl(''); setNewPhotoCaption('');
                            saveMetadata({ photos: updated }, 'Photo added!');
                        }} disabled={!newPhotoUrl.trim() || metaSaving} style={{ ...btnPrimary, opacity: !newPhotoUrl.trim() || metaSaving ? 0.5 : 1, whiteSpace: 'nowrap' }}>+ Add Photo</button>
                    </div>
                    {photos.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                            <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 700 }}>No Photos Yet</div>
                            <p style={{ margin: 0, fontSize: 14 }}>No Photos Yet. Add Photos To Showcase Your Venue!</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                            {photos.map((photo, i) => (
                                <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: '#1a1a2e' }}>
                                    <img src={photo.url} alt={photo.caption || 'Club photo'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                                    {photo.caption && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', padding: '16px 8px 6px', fontSize: 11, color: '#fff' }}>{photo.caption}</div>}
                                    <button onClick={() => {
                                        const updated = photos.filter((_, j) => j !== i);
                                        setPhotos(updated); saveMetadata({ photos: updated }, 'Photo removed');
                                    }} style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Schedule Tab */}
            {activeTab === 'schedule' && (
                <div style={cardSt}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Weekly Run Schedule</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {savedBadge}
                            <button onClick={() => saveMetadata({ run_schedule: schedule }, 'Schedule saved!')} disabled={metaSaving} style={{ ...btnPrimary, opacity: metaSaving ? 0.5 : 1 }}>
                                {metaSaving ? 'Saving...' : 'Save Schedule'}
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {DAYS.map(day => {
                            const d = schedule[day];
                            return (
                                <div key={day} style={{ background: d.open ? 'rgba(24,119,242,0.06)' : '#f5f5f5', borderRadius: 10, padding: '10px 14px', border: `1px solid ${d.open ? 'rgba(24,119,242,0.2)' : '#e4e6eb'}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: d.open ? 8 : 0 }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minWidth: 70 }}>
                                            <input type="checkbox" checked={d.open} onChange={e => setSchedule(prev => ({ ...prev, [day]: { ...prev[day], open: e.target.checked } }))} style={{ width: 18, height: 18, accentColor: C.blue }} />
                                            <span style={{ fontSize: 14, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{day}</span>
                                        </label>
                                        {d.open && (
                                            <input value={d.hours} onChange={e => setSchedule(prev => ({ ...prev, [day]: { ...prev[day], hours: e.target.value } }))} placeholder="e.g. 10am - 4am" style={{ ...inputSt, flex: 1, maxWidth: 180 }} />
                                        )}
                                        {!d.open && <span style={{ fontSize: 13, color: C.textSec, fontStyle: 'italic' }}>Closed</span>}
                                    </div>
                                    {d.open && (
                                        <div style={{ marginLeft: 28 }}>
                                            <input value={d.location || ''} onChange={e => setSchedule(prev => ({ ...prev, [day]: { ...prev[day], location: e.target.value } }))} placeholder="Location (e.g. Chicago, IL)" style={{ ...inputSt, marginBottom: 6, maxWidth: 260 }} />
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                                                {(d.games || []).map((g, gi) => (
                                                    <span key={gi} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: C.blue, color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                                                        {g}
                                                        <button onClick={() => setSchedule(prev => ({ ...prev, [day]: { ...prev[day], games: prev[day].games.filter((_, k) => k !== gi) } }))} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, padding: 0, marginLeft: 2 }}>×</button>
                                                    </span>
                                                ))}
                                            </div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <input value={newGame[day] || ''} onChange={e => setNewGame(prev => ({ ...prev, [day]: e.target.value }))} placeholder="Add Game (e.g. 1/2 NLH)" onKeyDown={e => {
                                                    if (e.key === 'Enter' && (newGame[day] || '').trim()) {
                                                        setSchedule(prev => ({ ...prev, [day]: { ...prev[day], games: [...(prev[day].games || []), newGame[day].trim()] } }));
                                                        setNewGame(prev => ({ ...prev, [day]: '' }));
                                                    }
                                                }} style={{ ...inputSt, flex: 1 }} />
                                                <button onClick={() => {
                                                    if (!(newGame[day] || '').trim()) return;
                                                    setSchedule(prev => ({ ...prev, [day]: { ...prev[day], games: [...(prev[day].games || []), newGame[day].trim()] } }));
                                                    setNewGame(prev => ({ ...prev, [day]: '' }));
                                                }} style={btnSec}>Add</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Tournaments Tab — Read-Only (managed via Commander) */}
            {activeTab === 'tournaments' && (
                <div style={cardSt}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Tournament Schedule</h3>
                    </div>
                    {/* Commander-only notice */}
                    <div style={{ background: 'rgba(24,119,242,0.06)', border: '1px solid rgba(24,119,242,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18 }}>&#9432;</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Tournament Schedules Are Managed Through Club Commander</div>
                            <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>Tournaments Added In Commander Automatically Appear Here And On Your Public Page.</div>
                        </div>
                        <button onClick={() => window.open('/commander/tournaments', '_blank')} style={{ ...btnPrimary, whiteSpace: 'nowrap', fontSize: 12 }}>Open Commander</button>
                    </div>
                    {/* Auto-published tournament list (read-only) */}
                    {tournaments.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 30, color: C.textSec }}><div style={{ fontSize: 24, marginBottom: 8, fontWeight: 700 }}>No Tournaments Yet</div><p style={{ margin: 0, fontSize: 14 }}>Add Tournaments Through Club Commander To See Them Here.</p></div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {tournaments.map((t, i) => {
                                const d = t.scheduled_start ? new Date(t.scheduled_start) : null;
                                const GLABELS = { NLH: "NL Hold'em", PLO: 'PLO', PLO5: 'PLO-5', PLO8: 'PLO Hi-Lo', nlh: "NL Hold'em", plo: 'PLO', plo5: 'PLO-5', plo8: 'PLO Hi-Lo', mixed: 'Mixed', limit: 'Limit', stud: 'Stud', razz: 'Razz' };
                                const isLive = ['running', 'break', 'final_table'].includes(t.status);
                                const isCompleted = t.status === 'completed';
                                const statusColor = isLive ? '#42B72A' : isCompleted ? '#B0B3B8' : '#1877F2';
                                const statusLabel = isLive ? (t.status === 'break' ? 'BREAK' : t.status === 'final_table' ? 'FINAL TABLE' : 'LIVE') : isCompleted ? 'Completed' : 'Upcoming';
                                const prizePool = (t.current_entries || 0) * (t.buyin_amount || 0);
                                return (
                                    <div key={t.id || i}
                                        onClick={() => t.id && window.open(`/commander/tournaments/${t.id}/public`, '_blank')}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                                            background: isLive ? 'rgba(66,183,42,0.04)' : '#f5f5f5',
                                            borderRadius: 10,
                                            border: isLive ? '1px solid rgba(66,183,42,0.25)' : '1px solid #e4e6eb',
                                            cursor: t.id ? 'pointer' : 'default', transition: 'all 0.15s'
                                        }}>
                                        {d && <div style={{ minWidth: 44, textAlign: 'center', background: '#fff', borderRadius: 8, padding: '4px 6px', border: '1px solid #e4e6eb' }}>
                                            <div style={{ fontSize: 10, color: C.textSec, textTransform: 'uppercase', fontWeight: 700 }}>{d.toLocaleDateString('en-US', { month: 'short' })}</div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{d.getDate()}</div>
                                        </div>}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                                                <span style={{
                                                    fontSize: 9, fontWeight: 800, color: statusColor, textTransform: 'uppercase',
                                                    letterSpacing: 0.5, display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    padding: '2px 6px', borderRadius: 4,
                                                    background: isLive ? 'rgba(66,183,42,0.12)' : isCompleted ? 'rgba(176,179,184,0.12)' : 'rgba(24,119,242,0.08)'
                                                }}>
                                                    {isLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#42B72A', animation: 'pulse 1.5s infinite' }} />}
                                                    {statusLabel}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                                                {d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                                                {t.game_type ? ` · ${GLABELS[t.game_type] || t.game_type}` : ''}
                                                {t.buyin_amount ? ` · $${t.buyin_amount} Buy-in` : ''}
                                                {t.guaranteed_prize ? ` · $${t.guaranteed_prize.toLocaleString()} GTD` : ''}
                                            </div>
                                            {(isLive || isCompleted) && (
                                                <div style={{ fontSize: 11, color: isLive ? '#42B72A' : C.textSec, marginTop: 3, fontWeight: 600 }}>
                                                    {isLive && t.players_remaining ? `${t.players_remaining} players remaining` : ''}
                                                    {isLive && t.players_remaining && prizePool > 0 ? ' · ' : ''}
                                                    {prizePool > 0 ? `$${prizePool.toLocaleString()} prize pool` : ''}
                                                    {isLive && !t.players_remaining && t.current_entries ? `${t.current_entries} entries` : ''}
                                                </div>
                                            )}
                                        </div>
                                        {t.id && <span style={{ fontSize: 14, color: C.textSec }}>›</span>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Amenities Tab */}
            {activeTab === 'amenities' && (
                <div style={cardSt}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Venue Amenities</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {savedBadge}
                            <button onClick={() => saveMetadata({ amenities }, 'Amenities saved!')} disabled={metaSaving} style={{ ...btnPrimary, opacity: metaSaving ? 0.5 : 1 }}>
                                {metaSaving ? 'Saving...' : 'Save Amenities'}
                            </button>
                        </div>
                    </div>
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: C.textSec }}>Toggle The Amenities Your Venue Offers. Visitors Will See These On Your Public Page.</p>
                    {AMENITIES_LIST.map(cat => (
                        <div key={cat.cat} style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{cat.cat}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 4 }}>
                                {cat.items.map(item => (
                                    <label key={item.k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: amenities[item.k] ? 'rgba(24,119,242,0.08)' : '#f5f5f5', border: `1px solid ${amenities[item.k] ? 'rgba(24,119,242,0.3)' : '#e4e6eb'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
                                        <input type="checkbox" checked={!!amenities[item.k]} onChange={e => setAmenities(prev => ({ ...prev, [item.k]: e.target.checked }))} style={{ width: 16, height: 16, accentColor: C.blue }} />
                                        <span style={{ fontSize: 13, color: C.text }}>{item.l}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pending Follow Requests — visible above all tabs */}
            {pendingFollowers.length > 0 && (
                <div style={{ ...cardSt, marginBottom: 8 }}>
                    <div style={{ marginBottom: 0, borderRadius: 10, border: '2px solid #f59e0b', background: '#fffbeb', padding: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>Pending Follow Requests ({pendingFollowers.length})</div>
                        {pendingFollowers.map(f => (
                            <div key={f.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #fde68a' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{f.profile?.full_name || f.profile?.username || 'Unknown'}</div>
                                        <div style={{ fontSize: 11, color: C.textSec }}>{f.profile?.username ? `@${f.profile.username}` : `Requested ${new Date(f.created_at).toLocaleDateString()}`}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => handleApproveFollower(f.user_id, 'approve')} style={{ padding: '4px 14px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Approve</button>
                                    <button onClick={() => handleApproveFollower(f.user_id, 'reject')} style={{ padding: '4px 14px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Reject</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Live Games Tab — Read-Only Commander Status */}
            {activeTab === 'live_games' && (
                <div style={cardSt}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Live Game Board</h3>
                        <a href="/hub/commander" style={{ fontSize: 13, fontWeight: 600, color: C.blue, textDecoration: 'none' }}>Manage In Club Commander &rarr;</a>
                    </div>

                    <div style={{ fontSize: 12, color: C.textSec, padding: '8px 12px', background: '#f0f7ff', borderRadius: 8, marginBottom: 12 }}>
                        Live games are managed through Club Commander. This board shows the current game status in real-time.
                    </div>

                    {/* Read-Only Games List */}
                    {loadingGames ? (
                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                            <div style={{ width: 32, height: 32, border: '3px solid #E4E6EB', borderTopColor: C.blue, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                            Loading games...
                        </div>
                    ) : liveGames.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M12 8v4l3 3" /></svg>
                            </div>
                            <div style={{ fontSize: 18, marginBottom: 6, fontWeight: 700, color: C.text }}>No Active Games</div>
                            <p style={{ margin: '0 0 12px', fontSize: 14 }}>Open Club Commander To Create And Manage Live Games</p>
                            <a href="/hub/commander" style={{ display: 'inline-block', padding: '10px 24px', borderRadius: 8, background: C.blue, color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Open Club Commander</a>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {liveGames.map(game => {
                                const seatArr = Array.from({ length: game.max_seats }, (_, i) => {
                                    const taken = (game.seats || []).find(s => s.seat_number === i + 1 && s.status !== 'waitlist');
                                    return { number: i + 1, taken };
                                });
                                const waitlist = (game.seats || []).filter(s => s.status === 'waitlist').sort((a, b) => (a.waitlist_position || 0) - (b.waitlist_position || 0));
                                const occupiedCount = seatArr.filter(s => s.taken).length;
                                const openSeats = game.max_seats - occupiedCount;

                                // Arc-length parameterized ellipse: equal visual spacing
                                const rx = 47, ry = 22, cxE = 50, cyE = 50;
                                const STEPS = 360;
                                const startAngle = Math.PI / 2; // dealer at bottom (90°)
                                const cumArc = [0];
                                for (let i = 1; i <= STEPS; i++) {
                                    const t0 = startAngle + ((i - 1) / STEPS) * 2 * Math.PI;
                                    const t1 = startAngle + (i / STEPS) * 2 * Math.PI;
                                    const dx = rx * (Math.cos(t1) - Math.cos(t0));
                                    const dy = ry * (Math.sin(t1) - Math.sin(t0));
                                    cumArc.push(cumArc[i - 1] + Math.sqrt(dx * dx + dy * dy));
                                }
                                const totalArc = cumArc[STEPS];
                                const allPos = [];
                                for (let p = 0; p < 10; p++) {
                                    const target = (p / 10) * totalArc;
                                    let idx = 1;
                                    while (idx <= STEPS && cumArc[idx] < target) idx++;
                                    const angle = startAngle + (idx / STEPS) * 2 * Math.PI;
                                    allPos.push({
                                        top: `${cyE + ry * Math.sin(angle)}%`,
                                        left: `${cxE + rx * Math.cos(angle)}%`,
                                    });
                                }
                                // pos[0]=dealer(bottom), pos[1-9]=seats going counter-clockwise
                                const dealerTop = allPos[0].top;
                                const dealerLeft = allPos[0].left;
                                const seatPositions = allPos.slice(1);
                                // Clamp top seat to not float above rail
                                seatPositions.forEach(p => { const t = parseFloat(p.top); if (t < 30) p.top = '30%'; });



                                return (
                                    <div key={game.id} style={{ background: '#1a1a2e', borderRadius: 16, border: '1px solid #2d2d44', overflow: 'hidden' }}>
                                        {/* Game Header */}
                                        <div style={{ padding: '12px 16px', background: game.status === 'running' ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)', color: '#fff' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div>
                                                    <div style={{ fontSize: 16, fontWeight: 800 }}>{game.game_name}</div>
                                                    <div style={{ fontSize: 13, opacity: 0.9 }}>
                                                        {game.game_type} &middot; ${game.stakes} &middot; {game.max_seats}-max
                                                        {game.table_number ? ` · ${game.table_number}` : ''}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
                                                        {game.status === 'running' ? '🟢 RUNNING' : '🔵 OPEN'}
                                                    </span>
                                                    <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>
                                                        {occupiedCount}/{game.max_seats} seated
                                                        {openSeats > 0 && <span style={{ color: '#86efac', marginLeft: 4 }}>({openSeats} open)</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Poker Table Visualization — Full Width (cropped viewport) */}
                                        <div style={{ position: 'relative', width: '100%', paddingBottom: '64%', overflow: 'hidden', marginTop: 10, marginBottom: 10 }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: '1 / 1', marginTop: '-18%' }}>
                                                {/* Table image fills entire container */}
                                                <img
                                                    src="/images/poker-table-black-gold.png"
                                                    alt="Poker Table"
                                                    style={{
                                                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                                        objectFit: 'contain', pointerEvents: 'none', zIndex: 0,
                                                    }}
                                                />

                                                {/* Game info in center of table */}
                                                <div style={{
                                                    position: 'absolute', top: '48%', left: '50%',
                                                    transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center',
                                                }}>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                                                        {page.name || 'Club'}
                                                    </div>
                                                    <div style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                                        {game.table_number || game.game_name}
                                                    </div>
                                                    <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: 700 }}>
                                                        ${game.stakes}
                                                    </div>
                                                </div>

                                                {/* Dealer seat — on the bottom rail of the table */}
                                                <div style={{
                                                    position: 'absolute', top: dealerTop, left: dealerLeft,
                                                    transform: 'translate(-50%, -50%)', textAlign: 'center', width: 90, zIndex: 3,
                                                }}>
                                                    <div style={{
                                                        width: 80, height: 80, borderRadius: '50%', margin: '0 auto 4px',
                                                        background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                                                        border: '3px solid #E4E6EB',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        boxShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 16px rgba(24,119,242,0.4)',
                                                        fontSize: 32, fontWeight: 900, color: '#fff',
                                                        letterSpacing: 1,
                                                    }}>D</div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1877F2', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {game.dealer_name || 'No Dealer'}
                                                    </div>
                                                </div>

                                                {/* 9 Player seat chips on the table rail */}
                                                {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                                                    const pos = seatPositions[idx];
                                                    const isOccupied = !!seat.taken;
                                                    const firstName = seat.taken?.player_name?.split(' ')[0] || '';
                                                    const fullName = seat.taken?.player_name || '';
                                                    const avatarUrl = seat.taken?.avatar_url || null;
                                                    // Direction-aware badge: left-side extends right, right-side extends left
                                                    const leftPct = parseFloat(pos.left);
                                                    const isLeftSide = leftPct < 25;
                                                    const isRightSide = leftPct > 75;
                                                    const badgeTransform = isLeftSide
                                                        ? 'translate(-17px, -50%)'
                                                        : isRightSide
                                                            ? 'translate(calc(-100% + 17px), -50%)'
                                                            : 'translate(-50%, -50%)';
                                                    const badgeDirection = isRightSide ? 'row-reverse' : 'row';

                                                    // Timer computation
                                                    let timerText = null, timerColor = null;
                                                    if (isOccupied) {
                                                        const session = (game.sessions || []).find(s => s.seat_number === seat.number);
                                                        if (session) {
                                                            const isTexas = game.venue_type === 'texas';
                                                            if (isTexas) {
                                                                const rem = Math.max(0, (session.time_remaining || 0) - timerTick);
                                                                const mins = Math.floor(rem / 60);
                                                                const secs = rem % 60;
                                                                timerText = `${mins}:${String(secs).padStart(2, '0')}`;
                                                                const isExpired = rem <= 0;
                                                                const isCritical = rem <= 300 && rem > 0;
                                                                const isLow = rem <= 900 && rem > 0;
                                                                timerColor = isExpired ? '#ef4444' : isCritical ? '#ef4444' : isLow ? '#f59e0b' : '#22c55e';
                                                                if (isExpired) timerText = 'EXPIRED';
                                                            } else {
                                                                const elapsed = (session.elapsed_seconds || 0) + timerTick;
                                                                const hrs = Math.floor(elapsed / 3600);
                                                                const mins = Math.floor((elapsed % 3600) / 60);
                                                                timerText = `${hrs}:${String(mins).padStart(2, '0')}`;
                                                                timerColor = '#a78bfa';
                                                            }
                                                        }
                                                    }

                                                    return (
                                                        <div key={seat.number} style={{
                                                            position: 'absolute', top: pos.top, left: pos.left,
                                                            transform: badgeTransform, zIndex: 2,
                                                            display: 'flex', flexDirection: badgeDirection, alignItems: 'center', gap: 10,
                                                            background: 'rgba(36,37,38,0.9)',
                                                            borderRadius: 14,
                                                            padding: '6px 12px 6px 6px',
                                                            border: `2px solid ${isOccupied ? 'rgba(24,119,242,0.5)' : 'rgba(62,64,66,0.6)'}`,
                                                            backdropFilter: 'blur(6px)',
                                                            minWidth: 80,
                                                        }}>
                                                            {/* Avatar circle */}
                                                            <div style={{
                                                                width: 68, height: 68, borderRadius: '50%', flexShrink: 0,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                background: isOccupied
                                                                    ? (avatarUrl ? 'transparent' : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)')
                                                                    : 'rgba(255,255,255,0.06)',
                                                                border: `2px solid ${isOccupied ? '#1877F2' : 'rgba(62,64,66,0.5)'}`,
                                                                overflow: 'hidden',
                                                            }}>
                                                                {isOccupied ? (
                                                                    avatarUrl ? (
                                                                        <img src={avatarUrl} alt={firstName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                                                    ) : (
                                                                        <span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{firstName.charAt(0).toUpperCase()}</span>
                                                                    )
                                                                ) : (
                                                                    <span style={{ fontSize: 18, fontWeight: 600, color: '#B0B3B8' }}>{seat.number}</span>
                                                                )}
                                                            </div>
                                                            {/* Name + Timer text */}
                                                            <div style={{ overflow: 'hidden', textAlign: isRightSide ? 'right' : 'left' }}>
                                                                <div style={{
                                                                    fontSize: 16, fontWeight: 600, lineHeight: 1.2,
                                                                    color: isOccupied ? '#E4E6EB' : '#B0B3B8',
                                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                                    maxWidth: 140,
                                                                }}>
                                                                    {isOccupied ? fullName : 'Open'}
                                                                </div>
                                                                {timerText && (
                                                                    <div style={{
                                                                        fontSize: 14, fontWeight: 700, color: timerColor,
                                                                        fontFamily: 'monospace', lineHeight: 1.2,
                                                                        animation: timerColor === '#ef4444' ? 'pulse 1s infinite' : 'none',
                                                                    }}>
                                                                        {timerText}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Waitlist — Read Only */}
                                        {waitlist.length > 0 && (
                                            <div style={{ padding: '8px 16px 12px', background: '#1a1a2e', borderTop: '1px solid #2d2d44' }}>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>Waitlist</div>
                                                {waitlist.map((w, i) => (
                                                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', padding: '2px 0', fontSize: 11 }}>
                                                        <span style={{ color: '#d4d4d8' }}>#{w.waitlist_position || i + 1} — {w.player_name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                    }
                </div>
            )
            }


            {/* About Tab */}
            {
                activeTab === 'about' && (
                    <div style={{ background: C.card, borderRadius: 12, padding: 16 }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: C.text }}>About</h3>
                        {page.description && <p style={{ margin: '0 0 12px', fontSize: 14, color: C.text, lineHeight: 1.5 }}>{page.description}</p>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {page.category && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /></svg>
                                    <span style={{ fontSize: 14, color: C.text }}>{CATEGORY_LABELS[page.category] || page.category}</span>
                                </div>
                            )}
                            {(page.location_city || page.location_state) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                    <span style={{ fontSize: 14, color: C.text }}>{[page.location_city, page.location_state].filter(Boolean).join(', ')}</span>
                                </div>
                            )}
                            {page.website && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                                    <a href={page.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: C.blue }}>{page.website}</a>
                                </div>
                            )}
                            {page.phone && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" /></svg>
                                    <span style={{ fontSize: 14, color: C.text }}>{page.phone}</span>
                                </div>
                            )}
                        </div>
                        <div style={{ marginTop: 16, padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 13, color: C.textSec }}>Page created {page.created_at ? new Date(page.created_at).toLocaleDateString() : 'recently'}</span>
                        </div>
                    </div>
                )
            }

            {/* Floating Green Live Events Button */}
            {(() => {
                const liveTourneys = tournaments.filter(t => ['running', 'break', 'final_table'].includes(t.status));
                if (liveTourneys.length === 0) return null;
                const lt = liveTourneys[0];
                return (
                    <div
                        onClick={() => lt.id && window.open(`/commander/tournaments/${lt.id}/public`, '_blank')}
                        style={{
                            position: 'fixed', bottom: 24, right: 24, zIndex: 1000, cursor: lt.id ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 22px',
                            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                            borderRadius: 50, boxShadow: '0 4px 24px rgba(34,197,94,0.45), 0 0 0 3px rgba(34,197,94,0.15)',
                            color: '#fff', fontFamily: 'inherit',
                            transition: 'transform 0.2s, box-shadow 0.2s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(34,197,94,0.55), 0 0 0 4px rgba(34,197,94,0.2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(34,197,94,0.45), 0 0 0 3px rgba(34,197,94,0.15)'; }}
                    >
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', boxShadow: '0 0 6px rgba(255,255,255,0.8)', animation: 'pulse 1.5s infinite' }} />
                        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>🏆 LIVE EVENT{liveTourneys.length > 1 ? `S (${liveTourneys.length})` : ''}</span>
                        <span style={{ fontSize: 12, opacity: 0.9, fontWeight: 500 }}>{lt.name}</span>
                    </div>
                );
            })()}

            <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </div >
    );
}

// ===== PUBLIC GAME BOARD (Player Signup View) =====
function PublicGameBoard({ C, pageId, pageName, userId, userName, onClose }) {
    const router = useRouter();
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [gameSource, setGameSource] = useState(null); // 'commander' or null
    const [commanderVenueId, setCommanderVenueId] = useState(null);
    const [playerName, setPlayerName] = useState(userName || '');
    // Sync playerName when userName prop updates (arrives async after auth)
    useEffect(() => { if (userName && !playerName) setPlayerName(userName); }, [userName]);
    const [actionMsg, setActionMsg] = useState('');
    const [followStatus, setFollowStatus] = useState(null); // null = not checked, 'none' | 'pending' | 'approved'
    const [followLoading, setFollowLoading] = useState(true);
    // Timer tick for live countdown clocks
    const [timerTick, setTimerTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTimerTick(p => p + 1), 1000);
        return () => clearInterval(t);
    }, []);

    // Check follow status
    const checkFollowStatus = async () => {
        if (!userId) { setFollowStatus('none'); setFollowLoading(false); return; }
        try {
            const res = await fetch(`/api/social/pages/follow?page_id=${pageId}&requester_id=${userId}`);
            const json = await res.json();
            if (json.success) {
                setFollowStatus(json.my_status || (json.is_following ? 'approved' : 'none'));
            } else { setFollowStatus('none'); }
        } catch { setFollowStatus('none'); }
        setFollowLoading(false);
    };

    const fetchGames = async () => {
        try {
            const res = await fetch(`/api/social/pages/games?page_id=${pageId}`);
            const json = await res.json();
            if (json.success) {
                setGames(json.data || []);
                setTimerTick(0);
                if (json.source === 'commander' && json.venue_id) {
                    setGameSource('commander');
                    setCommanderVenueId(json.venue_id);
                }
            }
        } catch (e) { console.error('Public games fetch error:', e); }
        setLoading(false);
    };

    useEffect(() => {
        checkFollowStatus();
        fetchGames();
        const interval = setInterval(fetchGames, 15000);
        return () => clearInterval(interval);
    }, [pageId]);

    const showMsg = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 3000); };

    const handleFollow = async () => {
        if (!userId) { showMsg('You must be logged in to follow this page'); return; }
        setFollowLoading(true);
        try {
            const res = await fetch('/api/social/pages/follow', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_id: pageId, user_id: userId, action: 'follow' }),
            });
            const json = await res.json();
            if (json.success) {
                const newStatus = json.status || 'approved';
                setFollowStatus(newStatus);
                if (newStatus === 'pending') showMsg('Follow request sent! Waiting for approval.');
                else showMsg('You are now following this page!');
            } else { showMsg(json.error || 'Could not follow page'); }
        } catch { showMsg('Error following page'); }
        setFollowLoading(false);
    };

    const handleTakeSeat = async (gameId, seatNumber) => {
        if (!playerName.trim()) { showMsg('Please enter your name first'); return; }
        try {
            const res = await fetch('/api/social/pages/games', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'take_seat', game_id: gameId, seat_number: seatNumber, player_id: userId || null, player_name: playerName.trim() }),
            });
            const json = await res.json();
            if (json.success) { showMsg(`Seat ${seatNumber} reserved!`); fetchGames(); }
            else { showMsg(json.error || 'Could not take seat'); }
        } catch (e) { showMsg('Error reserving seat'); }
    };

    const handleJoinWaitlist = async (gameId) => {
        if (!playerName.trim()) { showMsg('Please enter your name first'); return; }
        // Commander games: navigate to the Commander waitlist page
        if (gameSource === 'commander' && commanderVenueId) {
            router.push(`/hub/commander/waitlist/${commanderVenueId}`);
            return;
        }
        try {
            const res = await fetch('/api/social/pages/games', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'join_waitlist', game_id: gameId, player_id: userId || null, player_name: playerName.trim() }),
            });
            const json = await res.json();
            if (json.success) { showMsg(`Added to waitlist (position #${json.position})`); fetchGames(); }
            else { showMsg(json.error || 'Could not join waitlist'); }
        } catch (e) { showMsg('Error joining waitlist'); }
    };

    const handleLeave = async (gameId) => {
        if (!playerName.trim()) return;
        try {
            await fetch('/api/social/pages/games', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'leave', game_id: gameId, player_name: playerName.trim() }),
            });
            showMsg('You have been removed from the game'); fetchGames();
        } catch (e) { showMsg('Error leaving game'); }
    };

    const canInteract = followStatus === 'approved';

    return (
        <div style={{ paddingBottom: 8 }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', borderRadius: 12, padding: 16, marginBottom: 8, color: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Live Games</h2>
                        <p style={{ margin: '2px 0 0', fontSize: 13, opacity: 0.8 }}>{pageName || 'Club Games'}</p>
                    </div>
                    {onClose && <button onClick={() => { if (window.history.length > 1) router.back(); else onClose(); }} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>}
                </div>

                {/* Follow Status Banner */}
                {followLoading ? (
                    <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', fontSize: 13 }}>Checking Access...</div>
                ) : followStatus === 'none' ? (
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(24,119,242,0.3)', border: '1px solid rgba(24,119,242,0.5)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700 }}>Follow To Play</div>
                                <div style={{ fontSize: 12, opacity: 0.8 }}>You Must Follow This Page Before You Can Sign Up For Games.</div>
                            </div>
                            <button onClick={handleFollow} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1877F2', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                {!userId ? '🔒 Sign In' : '➕ Follow Page'}
                            </button>
                        </div>
                    </div>
                ) : followStatus === 'pending' ? (
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.5)' }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>⏳ Follow Request Pending</div>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>The Host Needs To Approve Your Request Before You Can Sign Up For Games. Check Back Soon!</div>
                    </div>
                ) : (
                    <>
                        {/* Player Name — locked to Smarter Poker profile name */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Signed In As:</label>
                            <span style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, fontFamily: 'inherit' }}>{playerName || 'Player'}</span>
                        </div>
                    </>
                )}
                {actionMsg && <div style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, background: actionMsg.includes('Error') || actionMsg.includes('Please') || actionMsg.includes('Could not') || actionMsg.includes('must') ? 'rgba(240,40,73,0.2)' : 'rgba(34,197,94,0.2)', fontSize: 13, fontWeight: 600 }}>{actionMsg}</div>}
            </div>

            {/* Games */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                    <div style={{ width: 32, height: 32, border: '3px solid #E4E6EB', borderTopColor: '#1877F2', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                    Loading live games...
                </div>
            ) : games.length === 0 ? (
                <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 700 }}>No Live Games</div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>No Live Games Right Now</p>
                    <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Check Back Soon For Upcoming Games!</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {games.map(game => {
                        const seatArr = Array.from({ length: game.max_seats }, (_, i) => {
                            const taken = (game.seats || []).find(s => s.seat_number === i + 1 && s.status !== 'waitlist');
                            return { number: i + 1, taken };
                        });
                        const waitlist = (game.seats || []).filter(s => s.status === 'waitlist').sort((a, b) => (a.waitlist_position || 0) - (b.waitlist_position || 0));
                        const occupiedCount = seatArr.filter(s => s.taken).length;
                        const openSeats = game.max_seats - occupiedCount;
                        const myReservation = (game.seats || []).find(s => s.player_name === playerName.trim());

                        // Arc-length parameterized ellipse: equal visual spacing
                        const rx = 47, ry = 22, cxE = 50, cyE = 50;
                        const STEPS = 360;
                        const startAngle = Math.PI / 2; // dealer at bottom (90°)
                        const cumArc = [0];
                        for (let i = 1; i <= STEPS; i++) {
                            const t0 = startAngle + ((i - 1) / STEPS) * 2 * Math.PI;
                            const t1 = startAngle + (i / STEPS) * 2 * Math.PI;
                            const dx = rx * (Math.cos(t1) - Math.cos(t0));
                            const dy = ry * (Math.sin(t1) - Math.sin(t0));
                            cumArc.push(cumArc[i - 1] + Math.sqrt(dx * dx + dy * dy));
                        }
                        const totalArc = cumArc[STEPS];
                        const allPos = [];
                        for (let p = 0; p < 10; p++) {
                            const target = (p / 10) * totalArc;
                            let idx = 1;
                            while (idx <= STEPS && cumArc[idx] < target) idx++;
                            const angle = startAngle + (idx / STEPS) * 2 * Math.PI;
                            allPos.push({
                                top: `${cyE + ry * Math.sin(angle)}%`,
                                left: `${cxE + rx * Math.cos(angle)}%`,
                            });
                        }
                        // pos[0]=dealer(bottom), pos[1-9]=seats going counter-clockwise
                        const dealerTop = allPos[0].top;
                        const dealerLeft = allPos[0].left;
                        const seatPositions = allPos.slice(1);
                        // Clamp top seat to not float above rail
                        seatPositions.forEach(p => { const t = parseFloat(p.top); if (t < 30) p.top = '30%'; });


                        return (
                            <div key={game.id} style={{ background: '#1a1a2e', borderRadius: 16, border: '1px solid #2d2d44', overflow: 'hidden' }}>
                                {/* Game Header */}
                                <div style={{ padding: '12px 16px', background: game.status === 'running' ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)', color: '#fff' }}>
                                    {/* Interest List banner for non-running games */}
                                    {game.status !== 'running' && (
                                        <div style={{ textAlign: 'center', marginBottom: 6, fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>INTEREST LIST</div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ fontSize: 18, fontWeight: 800 }}>{game.game_name}</div>
                                            <div style={{ fontSize: 13, opacity: 0.9 }}>{game.game_type} · ${game.stakes} · {game.max_seats}-max{game.table_number ? ` · ${game.table_number}` : ''}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
                                                {game.status === 'running' ? '🟢 RUNNING' : '🔵 INTEREST LIST'}
                                            </div>
                                            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                                                {occupiedCount}/{game.max_seats} seated
                                                {openSeats > 0 && <span style={{ color: '#86efac', marginLeft: 4 }}>({openSeats} open)</span>}
                                            </div>
                                        </div>
                                    </div>
                                    {game.notes && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{game.notes}</div>}
                                </div>

                                {/* Follow-gate / My seat status — above table */}
                                <div style={{ padding: '0 16px' }}>
                                    {!canInteract && (
                                        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', marginBottom: 8, textAlign: 'center' }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24' }}>
                                                {followStatus === 'pending' ? '⏳ Approval pending — you can view but not join yet' : '🔒 Follow this page to sign up for games'}
                                            </span>
                                        </div>
                                    )}

                                    {myReservation && (
                                        <div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: myReservation.status === 'waitlist' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)', border: `1px solid ${myReservation.status === 'waitlist' ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                                                {myReservation.status === 'waitlist'
                                                    ? `📋 You're #${myReservation.waitlist_position} on the waitlist`
                                                    : `✅ You have Seat ${myReservation.seat_number}`}
                                            </span>
                                            <button onClick={() => handleLeave(game.id)} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#F02849', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Leave</button>
                                        </div>
                                    )}
                                </div>

                                {/* Poker Table Visualization — Full Width (cropped viewport) */}
                                <div style={{ position: 'relative', width: '100%', paddingBottom: '64%', overflow: 'hidden', marginTop: 10, marginBottom: 10 }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: '1 / 1', marginTop: '-18%' }}>
                                        {/* Table image fills entire container */}
                                        <img
                                            src="/images/poker-table-black-gold.png"
                                            alt="Poker Table"
                                            style={{
                                                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                                objectFit: 'contain', pointerEvents: 'none', zIndex: 0,
                                            }}
                                        />

                                        {/* Game info in center of table */}
                                        <div style={{
                                            position: 'absolute', top: '48%', left: '50%',
                                            transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                                                {pageName || 'Club'}
                                            </div>
                                            <div style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                                {game.table_number || game.game_name}
                                            </div>
                                            <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: 700 }}>
                                                ${game.stakes}
                                            </div>
                                            {canInteract && !myReservation && (
                                                <div style={{ fontSize: 11, color: game.status === 'running' ? '#93c5fd' : '#86efac', marginTop: 6, fontWeight: 600 }}>
                                                    {game.status === 'running' ? 'JOIN WAITLIST' : 'TAP A SEAT TO RESERVE'}
                                                </div>
                                            )}
                                        </div>

                                        {/* Dealer seat — on the bottom rail of the table (clickable → Dealer Tablet) */}
                                        <div style={{
                                            position: 'absolute', top: dealerTop, left: dealerLeft,
                                            transform: 'translate(-50%, -50%)', textAlign: 'center', width: 90, zIndex: 3,
                                            cursor: 'pointer',
                                        }}
                                            onClick={() => window.open(`/commander/dealer/${game.table_number || 1}`, '_blank')}
                                        >
                                            <div style={{
                                                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 4px',
                                                background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                                                border: '3px solid #E4E6EB',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                boxShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 16px rgba(24,119,242,0.4)',
                                                fontSize: 32, fontWeight: 900, color: '#fff',
                                                letterSpacing: 1,
                                                transition: 'transform 0.15s',
                                            }}>D</div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1877F2', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {game.dealer_name || 'No Dealer'}
                                            </div>
                                        </div>

                                        {/* 9 Player seat chips on the table rail */}
                                        {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                                            const pos = seatPositions[idx];
                                            const isOccupied = !!seat.taken;
                                            const isMe = seat.taken?.player_name === playerName.trim();
                                            const firstName = seat.taken?.player_name?.split(' ')[0] || '';
                                            const fullName = seat.taken?.player_name || '';
                                            const avatarUrl = seat.taken?.avatar_url || null;
                                            // Players can only click seats if game is NOT running (interest list / signup)
                                            // Running games require joining the waitlist instead
                                            const isRunning = game.status === 'running';
                                            const canClick = canInteract && !isOccupied && !myReservation && !isRunning;

                                            // Direction-aware badge: left-side extends right, right-side extends left
                                            const leftPct = parseFloat(pos.left);
                                            const isLeftSide = leftPct < 25;
                                            const isRightSide = leftPct > 75;
                                            const badgeTransform = isLeftSide
                                                ? 'translate(-17px, -50%)'
                                                : isRightSide
                                                    ? 'translate(calc(-100% + 17px), -50%)'
                                                    : 'translate(-50%, -50%)';
                                            const badgeDirection = isRightSide ? 'row-reverse' : 'row';

                                            // Timer computation
                                            let timerText = null, timerColor = null;
                                            if (isOccupied) {
                                                const session = (game.sessions || []).find(s => s.seat_number === seat.number);
                                                if (session) {
                                                    const isTexas = game.venue_type === 'texas';
                                                    if (isTexas) {
                                                        const rem = Math.max(0, (session.time_remaining || 0) - timerTick);
                                                        const mins = Math.floor(rem / 60);
                                                        const secs = rem % 60;
                                                        timerText = `${mins}:${String(secs).padStart(2, '0')}`;
                                                        const isExpired = rem <= 0;
                                                        const isCritical = rem <= 300 && rem > 0;
                                                        const isLow = rem <= 900 && rem > 0;
                                                        timerColor = isExpired ? '#ef4444' : isCritical ? '#ef4444' : isLow ? '#f59e0b' : '#22c55e';
                                                        if (isExpired) timerText = 'EXPIRED';
                                                    } else {
                                                        const elapsed = (session.elapsed_seconds || 0) + timerTick;
                                                        const hrs = Math.floor(elapsed / 3600);
                                                        const mins = Math.floor((elapsed % 3600) / 60);
                                                        timerText = `${hrs}:${String(mins).padStart(2, '0')}`;
                                                        timerColor = '#a78bfa';
                                                    }
                                                }
                                            }

                                            // Badge border color (SmarterPoker dark)
                                            const badgeBorder = isMe
                                                ? 'rgba(74,222,128,0.6)'
                                                : isOccupied
                                                    ? 'rgba(24,119,242,0.5)'
                                                    : canClick
                                                        ? 'rgba(34,197,94,0.3)'
                                                        : 'rgba(62,64,66,0.6)';

                                            return (
                                                <div key={seat.number} style={{
                                                    position: 'absolute', top: pos.top, left: pos.left,
                                                    transform: badgeTransform, zIndex: 2,
                                                    display: 'flex', flexDirection: badgeDirection, alignItems: 'center', gap: 10,
                                                    background: 'rgba(36,37,38,0.9)',
                                                    borderRadius: 14,
                                                    padding: '6px 12px 6px 6px',
                                                    border: `2px solid ${badgeBorder}`,
                                                    backdropFilter: 'blur(6px)',
                                                    cursor: canClick ? 'pointer' : 'default',
                                                    minWidth: 80,
                                                }}
                                                    onClick={() => canClick && handleTakeSeat(game.id, seat.number)}
                                                >
                                                    {/* Avatar circle */}
                                                    <div style={{
                                                        width: 68, height: 68, borderRadius: '50%', flexShrink: 0,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: isMe
                                                            ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                                                            : isOccupied
                                                                ? (avatarUrl ? 'transparent' : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)')
                                                                : canClick
                                                                    ? 'rgba(34,197,94,0.15)'
                                                                    : 'rgba(255,255,255,0.06)',
                                                        border: `2px solid ${isMe ? '#4ade80' : isOccupied ? '#1877F2' : canClick ? 'rgba(34,197,94,0.4)' : 'rgba(62,64,66,0.5)'}`,
                                                        overflow: 'hidden',
                                                    }}>
                                                        {isOccupied ? (
                                                            isMe ? (
                                                                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>YOU</span>
                                                            ) : avatarUrl ? (
                                                                <img src={avatarUrl} alt={firstName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                                            ) : (
                                                                <span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{firstName.charAt(0).toUpperCase()}</span>
                                                            )
                                                        ) : (
                                                            <span style={{ fontSize: canClick ? 22 : 18, fontWeight: 600, color: canClick ? 'rgba(34,197,94,0.7)' : '#B0B3B8' }}>
                                                                {canClick ? '+' : seat.number}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Name + Timer text */}
                                                    <div style={{ overflow: 'hidden', textAlign: isRightSide ? 'right' : 'left' }}>
                                                        <div style={{
                                                            fontSize: 16, fontWeight: 600, lineHeight: 1.2,
                                                            color: isMe ? '#4ade80' : isOccupied ? '#E4E6EB' : canClick ? 'rgba(34,197,94,0.5)' : '#B0B3B8',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                            maxWidth: 140,
                                                        }}>
                                                            {isMe ? 'You' : isOccupied ? fullName : canClick ? 'Reserve' : 'Open'}
                                                        </div>
                                                        {timerText && (
                                                            <div style={{
                                                                fontSize: 14, fontWeight: 700, color: timerColor,
                                                                fontFamily: 'monospace', lineHeight: 1.2,
                                                                animation: timerColor === '#ef4444' ? 'pulse 1s infinite' : 'none',
                                                            }}>
                                                                {timerText}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Waitlist info */}
                                {
                                    waitlist.length > 0 && (
                                        <div style={{ padding: '6px 16px', fontSize: 11, color: '#a1a1aa' }}>
                                            <span style={{ fontWeight: 600, color: '#1877F2' }}>📋 Waitlist: {waitlist.map(w => w.player_name?.split(' ')[0]).join(', ')}</span>
                                        </div>
                                    )
                                }

                                {/* ── Join Waitlist — Large Centered Button ── */}
                                {
                                    canInteract && !myReservation && (
                                        <div style={{ padding: '12px 16px 16px' }}>
                                            <button
                                                onClick={() => handleJoinWaitlist(game.id)}
                                                style={{
                                                    width: '100%',
                                                    padding: '16px 24px',
                                                    borderRadius: 12,
                                                    border: 'none',
                                                    background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                                                    color: '#fff',
                                                    fontSize: 18,
                                                    fontWeight: 800,
                                                    cursor: 'pointer',
                                                    fontFamily: 'inherit',
                                                    letterSpacing: 1,
                                                    textTransform: 'uppercase',
                                                    boxShadow: '0 4px 14px rgba(24,119,242,0.4)',
                                                    transition: 'transform 0.1s, box-shadow 0.1s',
                                                }}
                                                onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(24,119,242,0.5)'; }}
                                                onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(24,119,242,0.4)'; }}
                                            >
                                                Join Waitlist
                                            </button>
                                        </div>
                                    )
                                }
                            </div>
                        );
                    })}
                </div>
            )
            }
            <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ===== CLUB PAGES VIEW COMPONENT =====
function ClubPagesView({ C, pages, setPages, loading, setLoading, category, setCategory, search, setSearch, followingIds, setFollowingIds, onClose, onViewLiveGames }) {
    const router = useRouter();
    const [searchInput, setSearchInput] = useState(search);
    const [showFollowedOnly, setShowFollowedOnly] = useState(false);

    function getAnonUserId() {
        try {
            let uid = localStorage.getItem('sp-anon-uid');
            if (!uid) {
                uid = 'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                localStorage.setItem('sp-anon-uid', uid);
            }
            return uid;
        } catch { return 'anon-fallback'; }
    }

    // Fetch pages data — only home_games, charity, clubs (no venues/tours/series)
    useEffect(() => {
        const fetchClubPages = async () => {
            setLoading(true);
            try {
                const uid = getAnonUserId();
                const baseParams = { sort: 'popular', limit: '80' };
                if (search) baseParams.search = search;
                if (uid) baseParams.user_id = uid;
                if (showFollowedOnly) baseParams.followed_only = 'true';

                let allPages = [];
                if (category === 'all') {
                    // Fetch home_games, charity, clubs in parallel
                    const [hgRes, charRes, clubRes] = await Promise.all(
                        ['home_games', 'charity', 'clubs'].map(cat =>
                            fetch(`/api/poker/pages?${new URLSearchParams({ ...baseParams, category: cat })}`).then(r => r.json())
                        )
                    );
                    if (hgRes.success) allPages.push(...(hgRes.data || []));
                    if (charRes.success) allPages.push(...(charRes.data || []));
                    if (clubRes.success) allPages.push(...(clubRes.data || []));
                } else {
                    const res = await fetch(`/api/poker/pages?${new URLSearchParams({ ...baseParams, category })}`);
                    const json = await res.json();
                    if (json.success) allPages = json.data || [];
                }

                setPages(allPages);
                const fSet = new Set();
                allPages.forEach(p => { if (p.is_following) fSet.add(`${p.page_type}:${p.page_id}`); });
                setFollowingIds(fSet);
            } catch (e) { console.error('Club pages fetch error:', e); }
            setLoading(false);
        };
        fetchClubPages();
    }, [category, search, showFollowedOnly]);

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    const handlePageFollow = async (pageType, pageId) => {
        const key = `${pageType}:${pageId}`;
        const isNowFollowing = !followingIds.has(key);
        setFollowingIds(prev => {
            const next = new Set(prev);
            if (isNowFollowing) next.add(key); else next.delete(key);
            return next;
        });
        setPages(prev => prev.map(p => {
            if (p.page_type === pageType && p.page_id === pageId) {
                return { ...p, is_following: isNowFollowing, follower_count: isNowFollowing ? (p.follower_count || 0) + 1 : Math.max(0, (p.follower_count || 0) - 1) };
            }
            return p;
        }));
        try {
            const storageKey = `followed-${pageType === 'venue' ? 'venues' : pageType === 'tour' ? 'tours' : 'series'}`;
            const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (isNowFollowing) { if (!stored.includes(pageId)) stored.push(pageId); }
            else { const idx = stored.indexOf(pageId); if (idx !== -1) stored.splice(idx, 1); }
            localStorage.setItem(storageKey, JSON.stringify(stored));
        } catch { }
        try {
            await fetch('/api/poker/follow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_type: pageType, page_id: pageId, action: isNowFollowing ? 'follow' : 'unfollow', user_id: getAnonUserId() }),
            });
        } catch { }
    };

    const cats = [
        { key: 'all', label: 'All' },
        { key: 'home_games', label: 'Home Games' },
        { key: 'charity', label: 'Charity' },
        { key: 'clubs', label: 'Clubs' },
    ];

    const typeColors = {
        venue: { bg: '#1877F2', light: '#E7F3FF' },
        tour: { bg: '#E74C3C', light: '#FDEDEC' },
        series: { bg: '#F39C12', light: '#FEF5E7' },
        home_game: { bg: '#22C55E', light: '#F0FDF4' },
        charity: { bg: '#A855F7', light: '#FAF5FF' },
        club: { bg: '#0EA5E9', light: '#F0F9FF' },
    };

    return (
        <div style={{ paddingBottom: 8 }}>
            {/* Header */}
            <div style={{ background: C.card, borderRadius: 12, padding: '16px 16px 12px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Club Pages</h2>
                        <p style={{ margin: '2px 0 0', fontSize: 13, color: C.textSec }}>Follow Home Games, Charity Clubs & More</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {(() => { try { return !!JSON.parse(localStorage.getItem('commander_staff') || 'null'); } catch { return false; } })() && (
                            <button onClick={() => window.location.href = '/commander/dashboard'} style={{
                                background: 'linear-gradient(135deg, #1a1a2e, #0f0f0f)', border: '1px solid #22D3EE', borderRadius: 20, padding: '8px 14px',
                                fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#22D3EE', fontFamily: "'Orbitron', sans-serif",
                                letterSpacing: 1, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6,
                                boxShadow: '0 0 8px rgba(34,211,238,0.2)'
                            }}>Commander</button>
                        )}
                        <button onClick={onClose} style={{
                            background: '#E4E6EB', border: 'none', borderRadius: 20, padding: '8px 16px',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer', color: C.text, fontFamily: 'inherit'
                        }}>Back To Feed</button>
                    </div>
                </div>

                {/* Search */}
                <div style={{ position: 'relative', marginBottom: 10 }}>
                    <input
                        type="text"
                        placeholder="Search Pages..."
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 36px 10px 14px', border: '1px solid #CCD0D5',
                            borderRadius: 20, fontSize: 14, background: '#F0F2F5', color: C.text,
                            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
                        }}
                    />
                    {searchInput && (
                        <button onClick={() => { setSearchInput(''); setSearch(''); }} style={{
                            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer', color: '#65676B', padding: 4
                        }}>x</button>
                    )}
                </div>

                {/* Category Tabs */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    {cats.map(c => (
                        <button key={c.key} onClick={() => setCategory(c.key)} style={{
                            padding: '6px 14px', borderRadius: 20, border: 'none',
                            background: category === c.key ? '#1877F2' : '#E4E6EB',
                            color: category === c.key ? '#fff' : C.text,
                            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                        }}>{c.label}</button>
                    ))}
                </div>

                {/* Following Filter */}
                <button onClick={() => setShowFollowedOnly(!showFollowedOnly)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 20,
                    border: showFollowedOnly ? '1px solid #1877F2' : '1px solid #CCD0D5',
                    background: showFollowedOnly ? '#E7F3FF' : 'transparent',
                    color: showFollowedOnly ? '#1877F2' : C.textSec,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={showFollowedOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                    {showFollowedOnly ? 'Following Only' : 'Show Following'}
                </button>
            </div>

            {/* Pages List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                    <div style={{ width: 32, height: 32, border: '3px solid #E4E6EB', borderTopColor: '#1877F2', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                    <p>Loading Pages...</p>
                </div>
            ) : pages.length === 0 ? (
                <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center' }}>
                    <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>
                        {showFollowedOnly ? 'No followed pages' : 'No pages found'}
                    </p>
                    <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>
                        {showFollowedOnly ? 'Follow some pages to see them here.' : 'Try a different search or category.'}
                    </p>
                    {showFollowedOnly && (
                        <button onClick={() => setShowFollowedOnly(false)} style={{
                            marginTop: 12, padding: '8px 20px', background: '#1877F2', border: 'none',
                            borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                        }}>Browse All Pages</button>
                    )}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pages.map(page => {
                        const tc = typeColors[page.page_type] || typeColors.venue;
                        const isFollowing = followingIds.has(`${page.page_type}:${page.page_id}`);
                        return (
                            <div key={`${page.page_type}-${page.page_id}`} style={{
                                background: C.card, borderRadius: 10, border: '1px solid #E4E6EB', overflow: 'hidden'
                            }}>
                                {/* Banner */}
                                <div style={{
                                    background: tc.bg, padding: '6px 12px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {page.page_type === 'venue' ? 'Venue' : page.page_type === 'tour' ? 'Tour' : page.page_type === 'series' ? 'Series' : page.page_type === 'home_game' ? 'Home Game' : page.page_type === 'charity' ? 'Charity' : page.page_type === 'club' ? 'Club' : page.page_type}
                                    </span>
                                    {page.follower_count > 0 && (
                                        <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                                            {page.follower_count} follower{page.follower_count !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>

                                {/* Body */}
                                <div style={{ padding: '10px 12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                        {page.avatar_url ? (
                                            <img src={page.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{
                                                width: 36, height: 36, borderRadius: 8,
                                                background: tc.light, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: tc.bg, flexShrink: 0
                                            }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    {page.page_type === 'venue' && <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>}
                                                    {page.page_type === 'tour' && <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>}
                                                    {page.page_type === 'series' && <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>}
                                                    {page.page_type === 'home_game' && <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>}
                                                    {page.page_type === 'charity' && <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></>}
                                                    {page.page_type === 'club' && <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>}
                                                </svg>
                                            </div>
                                        )}
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div onClick={() => {
                                                if (page.is_social_page) {
                                                    onViewLiveGames && onViewLiveGames({ id: page.page_id, name: page.name });
                                                } else if (page.detail_url) {
                                                    router.push(page.detail_url);
                                                }
                                            }} style={{
                                                fontSize: 14, fontWeight: 700, color: C.text, cursor: 'pointer',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                            }}>{page.name}</div>
                                            <div style={{ fontSize: 12, color: C.textSec }}>{CATEGORY_LABELS[page.category] || page.category}</div>
                                            {(page.location_city || page.location_state) && (
                                                <div style={{ fontSize: 11, color: C.textSec, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                                    {[page.location_city, page.location_state].filter(Boolean).join(', ')}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {page.subtitle && (
                                        <p style={{ fontSize: 12, color: C.textSec, margin: '0 0 8px' }}>{page.subtitle}</p>
                                    )}

                                    {/* Meta tags */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                                        {page.page_type === 'venue' && page.has_tournaments && (
                                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#E7F3FF', color: '#1877F2' }}>Tournaments</span>
                                        )}
                                        {page.page_type === 'series' && page.total_events && (
                                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#FFF4E5', color: '#E67E22' }}>{page.total_events} Events</span>
                                        )}
                                        {page.page_type === 'series' && page.start_date && (
                                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#E8EAF6', color: '#303F9F' }}>
                                                {new Date(page.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </span>
                                        )}
                                        {page.page_type === 'tour' && page.established && (
                                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#F3E5F5', color: '#7B1FA2' }}>Est. {page.established}</span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button onClick={() => handlePageFollow(page.page_type, page.page_id)} style={{
                                            flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
                                            background: isFollowing ? '#E4E6EB' : '#1877F2',
                                            color: isFollowing ? C.text : '#fff',
                                            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                        }}>
                                            {isFollowing ? 'Following' : 'Follow'}
                                        </button>
                                        <button onClick={() => {
                                            if (page.is_social_page) {
                                                onViewLiveGames && onViewLiveGames({ id: page.page_id, name: page.name });
                                            } else if (page.detail_url) {
                                                router.push(page.detail_url);
                                            }
                                        }} style={{
                                            flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
                                            background: '#E4E6EB', color: C.text,
                                            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                                        }}>{page.is_social_page ? 'Live Games' : 'View Page'}</button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Link to full pages page */}
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        <button onClick={() => router.push('/hub/pages')} style={{
                            padding: '10px 24px', background: '#E4E6EB', border: 'none',
                            borderRadius: 8, color: C.text, fontSize: 14, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit'
                        }}>View All Pages</button>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

export default function SocialMediaPage() {
    const router = useRouter();

    // Auto-prefetch profile data when posts scroll into view
    useFeedPrefetchObserver();

    // Zustand Global State (replaces UI-related useState)
    const sidebarOpen = useSocialStore((s) => s.sidebarOpen);
    const setSidebarOpen = useSocialStore((s) => s.setSidebarOpen);
    const showNotifications = useSocialStore((s) => s.showNotifications);
    const setShowNotifications = useSocialStore((s) => s.setShowNotifications);
    const showGlobalSearch = useSocialStore((s) => s.showGlobalSearch);
    const setShowGlobalSearch = useSocialStore((s) => s.setShowGlobalSearch);
    const showGoLiveModal = useSocialStore((s) => s.showGoLiveModal);
    const setShowGoLiveModal = useSocialStore((s) => s.setShowGoLiveModal);

    // Local state (keep for data/session)
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [posts, setPosts] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [openChats, setOpenChats] = useState([]);
    const [chatMsgs, setChatMsgs] = useState({});
    // showMoreMenu state removed — all sidebar items now always visible
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [isPosting, setIsPosting] = useState(false);
    const [bottomNavVisible, setBottomNavVisible] = useState(true);
    const [notifications, setNotifications] = useState([]);
    // Global Search State
    const [globalSearchQuery, setGlobalSearchQuery] = useState('');
    const [globalSearchResults, setGlobalSearchResults] = useState({ users: [], posts: [] });
    const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
    const searchTimeout = useRef(null);
    const globalSearchTimeout = useRef(null);
    const lastScrollY = useRef(0);

    // Article Reader Modal State
    const [articleReader, setArticleReader] = useState({ open: false, url: null, title: null });

    // Club Pages View State — initialize from URL query param so back-nav preserves state
    const [showClubPages, setShowClubPages] = useState(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            return params.get('view') === 'club-pages';
        }
        return false;
    });
    const [clubPages, setClubPages] = useState([]);
    const [clubPagesLoading, setClubPagesLoading] = useState(false);
    const [clubPagesCategory, setClubPagesCategory] = useState('all');
    const [clubPagesSearch, setClubPagesSearch] = useState('');
    const [clubPagesFollowing, setClubPagesFollowing] = useState(new Set());

    // Club Page Management State (Commander users)
    const [isCommander, setIsCommander] = useState(false);
    const [commanderData, setCommanderData] = useState(null);
    const [myClubPage, setMyClubPage] = useState(null);
    const [showCreatePage, setShowCreatePage] = useState(false);
    const [showPageDashboard, setShowPageDashboard] = useState(false);
    const [myPageLoading, setMyPageLoading] = useState(false);
    const [viewingLiveGamesPage, setViewingLiveGamesPage] = useState(null);


    // ♾️ INFINITE SCROLL STATE
    const [feedOffset, setFeedOffset] = useState(0);
    const [hasMorePosts, setHasMorePosts] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [feedCycle, setFeedCycle] = useState(0); // Track how many times we've looped
    const [seenPostIds, setSeenPostIds] = useState(new Set()); // Track seen posts for variety
    const POSTS_PER_PAGE = 20;
    const MAX_FEED_CYCLES = 10; // Maximum loops before truly ending (shows tons of content)

    //  GOD MODE STATE
    const [isGodMode, setIsGodMode] = useState(false);

    // Global unread message count
    const { unreadCount } = useUnreadCount();

    // LIVE STREAMING STATE
    const [liveStreams, setLiveStreams] = useState([]);
    const [watchingStream, setWatchingStream] = useState(null);

    //  INTRO VIDEO STATE - Video plays while page loads in background
    // Only show once per session (not on every reload)
    const [showIntro, setShowIntro] = useState(() => {
        if (typeof window !== 'undefined') {
            return !sessionStorage.getItem('social-intro-seen');
        }
        return false;
    });
    const introVideoRef = useRef(null);

    // Mark intro as seen when it ends
    const handleIntroEnd = useCallback(() => {
        sessionStorage.setItem('social-intro-seen', 'true');
        setShowIntro(false);
    }, []);

    // Attempt to unmute video after it starts playing
    const handleIntroPlay = useCallback(() => {
        if (introVideoRef.current) {
            introVideoRef.current.muted = false;
        }
    }, []);

    // Bottom nav visibility - hide when scrolling down, show when scrolling up
    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            // Hide nav when scrolling down, show when scrolling up or at top
            if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
                setBottomNavVisible(false);
            } else {
                setBottomNavVisible(true);
            }
            lastScrollY.current = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Route prefetch — preload likely navigation targets during idle time
    useEffect(() => {
        router.prefetch('/hub/notifications');
        router.prefetch('/hub/friends');
        router.prefetch('/hub/messenger');
    }, [router]);

    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 3 REALTIME: Social Feed Subscription
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!user?.id) return;

        // Subscribe to new posts (INSERT events)
        const feedChannel = supabase
            .channel(`social-feed:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'social_posts',
                filter: `visibility=is.null,visibility=eq.public`
            }, async (payload) => {
                console.log('[Social] 🔄 New post detected via realtime:', payload.new.id);
                // Trigger feed reload to pick up new posts
                try {
                    new BroadcastChannel('smarter_poker_social_sync').postMessage('refresh_feed');
                } catch (e) { }
                // Also refresh local feed
                await loadFeed(0, false);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(feedChannel);
        };
    }, [user?.id]);

    // Cross-tab Social Feed sync
    useEffect(() => {
        let socialBc, friendsBc;
        try {
            socialBc = new BroadcastChannel('smarter_poker_social_sync');
            socialBc.onmessage = (event) => {
                if (event.data === 'refresh_feed') {
                    console.log('[Social] Refreshing feed from other tab');
                    loadFeed(0, false);
                }
            };
        } catch { /* noop */ }

        // Friends sync: refresh feed when friend list changes (updates "friend" badges)
        try {
            friendsBc = new BroadcastChannel('smarter_poker_friends_sync');
            friendsBc.onmessage = () => {
                console.log('[Social] Friends changed — refreshing feed');
                loadFeed(0, false);
            };
        } catch { /* noop */ }

        return () => {
            try { socialBc?.close(); } catch { /* noop */ }
            try { friendsBc?.close(); } catch { /* noop */ }
        };
    }, []);

    useEffect(() => {
        (async () => {
            try {
                // NEW APPROACH: Read session directly from localStorage to bypass AbortError
                let authUser = null;

                // PRIMARY: Check explicit smarter-poker-auth key (new auth system)
                const explicitAuth = localStorage.getItem('smarter-poker-auth');
                if (explicitAuth) {
                    try {
                        const tokenData = JSON.parse(explicitAuth);
                        if (tokenData?.user) {
                            authUser = tokenData.user;
                            console.log('[Social] ✅ Got user from smarter-poker-auth:', authUser.email);
                        }
                    } catch (parseError) {
                        console.error('[Social] Failed to parse smarter-poker-auth:', parseError);
                    }
                }

                // FALLBACK: Legacy sb-*-auth-token keys (backwards compatibility)
                if (!authUser) {
                    const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                    console.log('[Social] Looking for legacy auth token, found keys:', sbKeys);

                    if (sbKeys.length > 0) {
                        try {
                            const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
                            if (tokenData?.user) {
                                authUser = tokenData.user;
                                console.log('[Social] ✅ Got user from legacy localStorage:', authUser.email);
                            }
                        } catch (parseError) {
                            console.error('[Social] Failed to parse legacy token:', parseError);
                        }
                    }
                }

                // Final fallback: try getSession if localStorage approach failed
                if (!authUser) {
                    console.log('[Social] No user from localStorage, trying getSession...');
                    try {
                        const sessionData = { session: { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token } };
                        if (sessionData?.session?.user) {
                            authUser = sessionData.session.user;
                            console.log('[Social] ✅ Got user from getSession:', authUser.email);
                        }
                    } catch (e) {
                        console.warn('[Social] getSession failed:', e.message);
                    }
                }

                if (authUser) {
                    // Use native fetch to avoid AbortError (same issue as stories/profiles)
                    console.log('[Social] Fetching profile for user:', authUser.id);

                    let profileRes = await fetch(`https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/profiles?id=eq.${authUser.id}&select=id,username,full_name,display_name_preference,skill_tier,avatar_url,hendon_url,hendon_total_cashes,hendon_total_earnings,hendon_best_finish,hendon_biggest_cash,role`, {
                        headers: {
                            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo',
                            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
                        }
                    });

                    let profiles = await profileRes.json();
                    let p = profiles?.[0] || null;
                    console.log('[Social] Profile loaded:', p ? `${p.username} (avatar: ${p.avatar_url ? 'YES' : 'NO'})` : 'NOT FOUND');

                    // If no profile found by id, check if user owns another profile via owner_id
                    if (!p) {
                        const ownedProfileRes = await fetch(`https://kuklfnapbkmacvwxktbh.supabase.co/rest/v1/profiles?owner_id=eq.${authUser.id}&select=id,username,full_name,display_name_preference,skill_tier,avatar_url,hendon_url,hendon_total_cashes,hendon_total_earnings,hendon_best_finish,hendon_biggest_cash,role`, {
                            headers: {
                                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo',
                                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
                            }
                        });
                        const ownedProfiles = await ownedProfileRes.json();
                        if (ownedProfiles?.[0]) p = ownedProfiles[0];
                    }
                    //  Check for God Mode
                    if (p?.role === 'god') {
                        setIsGodMode(true);
                    }
                    // Respect display_name_preference: 'full_name' shows real name, 'username' shows alias
                    const displayNamePref = p?.display_name_preference || 'full_name';
                    const displayName = displayNamePref === 'full_name' && p?.full_name
                        ? p.full_name
                        : (p?.username || authUser.email?.split('@')[0] || 'Player');
                    setUser({
                        id: p?.id || authUser.id, // Use profile ID if owned, else auth ID
                        name: displayName,
                        username: p?.username || null,
                        avatar: p?.avatar_url || null,
                        tier: p?.skill_tier,
                        role: p?.role || 'user',
                        hendon: p?.hendon_url ? {
                            url: p.hendon_url,
                            cashes: p.hendon_total_cashes,
                            earnings: p.hendon_total_earnings,
                            bestFinish: p.hendon_best_finish,
                            biggestCash: p.hendon_biggest_cash
                        } : null
                    });
                    await loadContacts(authUser.id);

                    // 🕐 Update last_active timestamp (powers "last active" status on friends page)
                    supabase.from('profiles')
                        .update({ last_active: new Date().toISOString() })
                        .eq('id', p?.id || authUser.id)
                        .then(() => console.log('[Social] Updated last_active timestamp'));

                    // Load notifications with actor profile data
                    const { data: notifs, error: notifsError } = await supabase.from('notifications')
                        .select('*')
                        .eq('user_id', authUser.id)
                        .order('created_at', { ascending: false })
                        .limit(50);
                    if (notifsError) console.error('[Social] Failed to load notifications:', notifsError);
                    if (notifs && notifs.length > 0) {
                        // Collect actor IDs from notifications
                        // The data is stored in the 'data' JSONB column: data.commenter_id (comments), data.sender_id (friend requests), data.actor_id (generic)
                        const actorIds = [...new Set(notifs.map(n =>
                            n.data?.commenter_id || n.data?.actor_id || n.data?.sender_id || n.actor_id
                        ).filter(Boolean))];

                        // Also parse actor names from notification titles as fallback
                        const actorNames = [...new Set(notifs.map(n => {
                            const match = n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
                            return match ? match[1] : null;
                        }).filter(Boolean))];

                        // Build profile lookup maps
                        let profileById = {};
                        let profileByName = {};

                        // Lookup by actor_id if available
                        if (actorIds.length > 0) {
                            const { data: profilesById } = await supabase.from('profiles')
                                .select('id, username, full_name, avatar_url')
                                .in('id', actorIds);
                            (profilesById || []).forEach(p => {
                                profileById[p.id] = p;
                            });
                        }

                        // Lookup by full_name as fallback
                        if (actorNames.length > 0) {
                            const { data: profilesByName } = await supabase.from('profiles')
                                .select('id, username, full_name, avatar_url')
                                .in('full_name', actorNames);
                            (profilesByName || []).forEach(p => {
                                if (p.full_name) profileByName[p.full_name.toLowerCase()] = p;
                            });
                        }

                        // Merge actor profile data into notifications
                        const enrichedNotifs = notifs.map(n => {
                            // Get actor ID from the data JSONB column
                            const actorId = n.data?.commenter_id || n.data?.actor_id || n.data?.sender_id || n.actor_id;
                            let profile = actorId ? profileById[actorId] : null;

                            // Fallback to name matching
                            if (!profile) {
                                const match = n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
                                const actorName = match ? match[1] : null;
                                profile = actorName ? profileByName[actorName.toLowerCase()] : null;
                            }

                            // Get display name from data or parse from title
                            const displayName = n.data?.actor_name || n.data?.sender_name || n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/)?.[1] || n.title;

                            return {
                                ...n,
                                actor_avatar_url: profile?.avatar_url || n.metadata?.actor_avatar || null,
                                actor_name: profile?.full_name || displayName,
                                actor_username: profile?.username || null
                            };
                        });
                        setNotifications(enrichedNotifs);
                    }
                } else {
                    console.log('[Social] No authenticated user found');
                }
                // Hydrate feed from cache for instant render
                try {
                    const feedCacheRaw = localStorage.getItem('sp-feed-cache');
                    if (feedCacheRaw) {
                        const feedCache = JSON.parse(feedCacheRaw);
                        if (feedCache._cachedAt && (Date.now() - feedCache._cachedAt) < 15 * 60 * 1000 && feedCache.posts?.length) {
                            setPosts(feedCache.posts);
                        }
                    }
                } catch { /* cache miss */ }
                await loadFeed();
                // Load live streams
                try {
                    const streams = await LiveStreamService.getLiveStreams();
                    setLiveStreams(streams || []);
                } catch (e) { console.log('No live streams:', e); }
            } catch (e) { console.error('[Social] Auth error:', e); }
            setLoading(false);
        })();
    }, []);

    // Commander Detection & My Club Page Fetching
    useEffect(() => {
        try {
            const stored = localStorage.getItem('commander_staff');
            if (stored) {
                const data = JSON.parse(stored);
                if (data && data.venue_id) {
                    setIsCommander(true);
                    setCommanderData(data);
                    console.log('[Social] Commander account detected:', data.venue_name);

                    // Fetch if this Commander already has a club page
                    setMyPageLoading(true);
                    fetch(`/api/social/pages?linked_venue_id=${data.venue_id}`)
                        .then(r => r.json())
                        .then(json => {
                            if (json.success && json.data && json.data.length > 0) {
                                setMyClubPage(json.data[0]);
                                console.log('[Social] Found existing Club Page:', json.data[0].name);
                            } else if (json.success && json.data) {
                                // Also check by owner_id if no linked_venue_id match
                                if (user?.id) {
                                    fetch(`/api/social/pages?owner_id=${user.id}`)
                                        .then(r2 => r2.json())
                                        .then(json2 => {
                                            if (json2.success && json2.data && json2.data.length > 0) {
                                                setMyClubPage(json2.data[0]);
                                            }
                                        })
                                        .catch(() => { });
                                }
                            }
                        })
                        .catch(e => console.error('[Social] Club page fetch error:', e))
                        .finally(() => setMyPageLoading(false));
                }
            }
        } catch (e) {
            console.error('[Social] Commander detection error:', e);
        }

        // Handle ?createPage=true query param (from Commander popup redirect)
        if (router.query.createPage === 'true') {
            setShowClubPages(true);
            router.replace('/hub/social-media?view=club-pages', undefined, { shallow: true });
            // Small delay to let state settle, then open create modal if Commander
            setTimeout(() => {
                const stored = localStorage.getItem('commander_staff');
                if (stored) setShowCreatePage(true);
            }, 500);
        }

        // Handle ?viewPage=<pageId> query param (from Commander "Edit Club Page" link)
        if (router.query.viewPage && user) {
            const pageId = router.query.viewPage;
            (async () => {
                try {
                    const res = await fetch(`/api/social/pages?id=${pageId}`);
                    const json = await res.json();
                    if (json.success && json.data) {
                        const pageData = Array.isArray(json.data) ? json.data[0] : json.data;
                        if (pageData) {
                            setMyClubPage(pageData);
                            setShowClubPages(true);
                            setShowPageDashboard(true);
                        }
                    }
                } catch (e) { console.error('viewPage error:', e); }
                // Clean up the URL but preserve club-pages view state
                router.replace('/hub/social-media?view=club-pages', undefined, { shallow: true });
            })();
        }

        // Handle ?ref=<referral_code> query param (from QR code scan)
        if (router.query.ref && user) {
            const refCode = router.query.ref;
            (async () => {
                try {
                    // Look up the page by referral code
                    const res = await fetch(`/api/social/pages/qrcode?ref=${refCode}`);
                    const json = await res.json();
                    if (json.success && json.data) {
                        const refPage = json.data;
                        // Auto-follow the page
                        await fetch('/api/social/pages/follow', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ page_id: refPage.id, user_id: user.id, action: 'follow' }),
                        });
                        // Show the club pages view and navigate to the referred page's live games
                        setShowClubPages(true);
                        setViewingLiveGamesPage(refPage);
                        // Clean up the URL but preserve club-pages view state
                        router.replace('/hub/social-media?view=club-pages', undefined, { shallow: true });
                    }
                } catch (e) { console.error('Referral follow error:', e); }
            })();
        }
    }, [user, router.query.createPage, router.query.ref, router.query.viewPage]);

    //  REFRESH NOTIFICATIONS when modal opens — always show latest data
    useEffect(() => {
        if (!showNotifications || !user) return;
        (async () => {
            try {
                const { data: notifs, error } = await supabase.from('notifications')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(50);
                if (error) { console.error('[Social] Notification refresh error:', error); return; }
                if (!notifs || notifs.length === 0) { setNotifications([]); return; }

                // Enrich with actor profiles
                const actorIds = [...new Set(notifs.map(n =>
                    n.data?.commenter_id || n.data?.actor_id || n.data?.sender_id || n.actor_id
                ).filter(Boolean))];
                let profileById = {};
                if (actorIds.length > 0) {
                    const { data: profiles } = await supabase.from('profiles')
                        .select('id, username, full_name, avatar_url')
                        .in('id', actorIds);
                    (profiles || []).forEach(p => { profileById[p.id] = p; });
                }
                const enriched = notifs.map(n => {
                    const actorId = n.data?.commenter_id || n.data?.actor_id || n.data?.sender_id || n.actor_id;
                    const profile = actorId ? profileById[actorId] : null;
                    const displayName = n.data?.actor_name || n.data?.sender_name || n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/)?.[1] || n.title;
                    return {
                        ...n,
                        actor_avatar_url: profile?.avatar_url || n.metadata?.actor_avatar || null,
                        actor_name: profile?.full_name || displayName,
                        actor_username: profile?.username || null
                    };
                });
                setNotifications(enriched);
            } catch (e) { console.error('[Social] Notification refresh failed:', e); }
        })();
    }, [showNotifications, user]);

    //  AUTO-MARK NOTIFICATIONS AS READ when dropdown opens
    useEffect(() => {
        if (showNotifications && notifications.length > 0 && user) {
            const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
            if (unreadIds.length > 0) {
                // Mark all as read IMMEDIATELY
                (async () => {
                    await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
                    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                })();
            }
        }
    }, [showNotifications, notifications.length, user]);

    const loadFeed = async (offset = 0, append = false) => {
        try {
            if (append) setLoadingMore(true);

            // Read user from localStorage to avoid getSession AbortError
            let authUser = null;
            try {
                // PRIMARY: Check smarter-poker-auth key first  
                const explicitAuth = localStorage.getItem('smarter-poker-auth');
                if (explicitAuth) {
                    const tokenData = JSON.parse(explicitAuth);
                    authUser = tokenData?.user || null;
                }
                // FALLBACK: Legacy sb-* keys
                if (!authUser) {
                    const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                    if (sbKeys.length > 0) {
                        const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{ }');
                        authUser = tokenData?.user || null;
                    }
                }
            } catch (e) { /* ignore parse errors */ }

            // Get friend IDs for prioritization
            let friendIds = [];
            let followingIds = [];

            if (authUser) {
                // Fetch friends (accepted friendships)
                const { data: friendships } = await supabase
                    .from('friendships')
                    .select('friend_id')
                    .eq('user_id', authUser.id)
                    .eq('status', 'accepted');
                if (friendships) friendIds = friendships.map(f => f.friend_id);

                // Fetch people I'm following
                const { data: follows } = await supabase
                    .from('follows')
                    .select('following_id')
                    .eq('follower_id', authUser.id);
                if (follows) followingIds = follows.map(f => f.following_id);
            }

            // Combine friends and following for priority
            const priorityUserIds = [...new Set([...friendIds, ...followingIds])];

            // ♾️ INFINITE SCROLL: Fetch posts using native fetch to bypass Supabase client AbortError
            console.log('[Social] Loading feed via native fetch, offset:', offset);

            let allPostsData = null;
            let error = null;


            // Define Supabase credentials for native fetch (needed for both posts and profiles)
            const supabaseUrl = 'https://kuklfnapbkmacvwxktbh.supabase.co';
            const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

            // Use native fetch directly to Supabase REST API
            try {
                const queryParams = new URLSearchParams({
                    select: 'id,content,content_type,media_urls,like_count,comment_count,share_count,created_at,author_id,link_url,link_title,link_description,link_image,link_site_name,metadata',
                    or: '(visibility.eq.public,visibility.is.null)',
                    order: 'created_at.desc',
                    offset: offset.toString(),
                    limit: POSTS_PER_PAGE.toString()
                });

                const response = await fetch(`${supabaseUrl}/rest/v1/social_posts?${queryParams}`, {
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                }

                allPostsData = await response.json();
                console.log('[Social] ✅ Feed loaded via fetch - count:', allPostsData?.length);
            } catch (e) {
                console.error('[Social] Feed fetch error:', e);
                error = { message: e.message };
            }

            if (error) throw error;

            // ♾️ INFINITE SCROLL: Continue as long as we get ANY posts back
            // Only stop when absolutely no more posts are returned
            if (!allPostsData || allPostsData.length === 0) {
                // No posts returned - truly at the end
                if (feedCycle < MAX_FEED_CYCLES) {
                    // Loop back from the beginning for endless scroll experience
                    console.log('[Social] Looping feed - cycle', feedCycle + 1);
                    setFeedCycle(prev => prev + 1);
                    setFeedOffset(0);
                    // Don't set hasMorePosts false - let next scroll trigger the loop
                } else {
                    console.log('[Social] Max cycles reached - ending feed');
                    setHasMorePosts(false);
                }
            } else {
                // Got posts - continue infinite scroll
                console.log(`[Social] Got ${allPostsData.length} posts - continuing scroll`);
                setHasMorePosts(true);
            }

            //  smarter-poker-style RANKING: Score posts by relevance
            const calculatePostScore = (post) => {
                let score = 0;

                // Friends get highest priority (+100)
                if (friendIds.includes(post.author_id)) score += 100;

                // Following gets medium priority (+50)
                if (followingIds.includes(post.author_id)) score += 50;

                // Engagement boost
                score += Math.min((post.like_count || 0) * 2, 30); // Max 30 from likes
                score += Math.min((post.comment_count || 0) * 3, 30); // Max 30 from comments
                score += Math.min((post.share_count || 0) * 4, 20); // Max 20 from shares

                // Recency boost - posts less than 24h old get +40
                const ageHours = (Date.now() - new Date(post.created_at).getTime()) / 3600000;
                if (ageHours < 6) score += 50; // Very fresh
                else if (ageHours < 24) score += 40; // Last 24h
                else if (ageHours < 72) score += 20; // Last 3 days

                // Decay older posts
                const ageDays = ageHours / 24;
                score -= Math.min(ageDays * 2, 20); // Max -20 for old posts

                // If we've seen this post before (on loop), reduce score
                if (seenPostIds.has(post.id)) score -= 30;

                // Add some randomization for variety (+/- 15)
                score += (Math.random() * 30) - 15;

                return score;
            };

            // Mark priority posts and calculate scores
            const mixedFeed = (allPostsData || []).map(p => ({
                ...p,
                isPriority: priorityUserIds.includes(p.author_id),
                score: calculatePostScore(p),
                isSuggested: feedCycle > 0 // Mark as suggested on loop
            }));

            // Sort by score (SmarterPoker-style ranking)
            mixedFeed.sort((a, b) => b.score - a.score);

            // Fetch author profiles using native fetch to avoid AbortError
            if (mixedFeed.length > 0) {
                const authorIds = [...new Set(mixedFeed.map(p => p.author_id).filter(Boolean))];
                console.log('[Social]  Processing', mixedFeed.length, 'posts with', authorIds.length, 'unique authors');
                let authorMap = {};
                if (authorIds.length) {
                    try {
                        console.log('[Social] Fetching profiles for author IDs:', authorIds.slice(0, 3), '...');
                        const profilesRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=in.(${authorIds.join(',')})&select=id,username,full_name,display_name_preference,avatar_url`, {
                            headers: {
                                'apikey': supabaseKey,
                                'Authorization': `Bearer ${supabaseKey}`
                            }
                        });

                        console.log('[Social] Profile fetch response status:', profilesRes.status);
                        if (!profilesRes.ok) {
                            const errorText = await profilesRes.text();
                            console.error('[Social] ❌ Profile fetch failed:', profilesRes.status, errorText);
                        } else {
                            const profiles = await profilesRes.json();
                            console.log('[Social] ✅ Loaded', profiles.length, 'profiles:', profiles.map(p => p.username || p.full_name));
                            if (profiles && profiles.length > 0) {
                                authorMap = Object.fromEntries(profiles.map(p => [p.id, p]));
                                console.log('[Social] ✅ Author map created with', Object.keys(authorMap).length, 'entries');
                            } else {
                                console.warn('[Social]  No profiles returned from query');
                            }
                        }
                    } catch (profileError) {
                        console.error('[Social] Profile fetch error:', profileError);
                    }
                }

                const formattedPosts = mixedFeed.map(p => ({
                    id: p.id,
                    authorId: p.author_id,
                    content: p.content,
                    contentType: p.content_type,
                    mediaUrls: p.media_urls || [],
                    likeCount: p.like_count || 0,
                    commentCount: p.comment_count || 0,
                    shareCount: p.share_count || 0,
                    // Link metadata for ArticleCard
                    link_url: p.link_url || null,
                    link_title: p.link_title || null,
                    link_description: p.link_description || null,
                    link_image: p.link_image || null,
                    link_site_name: p.link_site_name || null,
                    timeAgo: timeAgo(p.created_at),
                    isLiked: false,
                    isPriority: p.isPriority,
                    isSuggested: p.isSuggested || false, // Mark as suggested on feed loop
                    isFriend: friendIds.includes(p.author_id),
                    isFollowing: followingIds.includes(p.author_id),
                    metadata: p.metadata || null,
                    author: {
                        // For page posts (mirrored/auto-posts), show the page name instead of personal name
                        name: (() => {
                            const meta = p.metadata;
                            if (meta?.page_name) return meta.page_name;
                            if (meta?.auto_generated && meta?.entity_type) return p.content?.split(' updated ')[0] || 'Page';
                            const a = authorMap[p.author_id];
                            if (!a) return 'Player';
                            const pref = a.display_name_preference || 'full_name';
                            if (pref === 'username') return a.username || a.full_name || 'Player';
                            return a.full_name || a.username || 'Player';
                        })(),
                        username: authorMap[p.author_id]?.username || null,
                        avatar: (() => {
                            const meta = p.metadata;
                            if (meta?.page_avatar_url) return meta.page_avatar_url;
                            return authorMap[p.author_id]?.avatar_url || null;
                        })()
                    }
                }));

                // Track seen posts for variety on loop
                const newSeenIds = new Set(seenPostIds);
                formattedPosts.forEach(p => newSeenIds.add(p.id));
                setSeenPostIds(newSeenIds);

                if (append) {
                    setPosts(prev => [...prev, ...formattedPosts]);
                } else {
                    setPosts(formattedPosts);
                    // Cache first 20 posts for instant render on next visit
                    try {
                        const cacheSlice = formattedPosts.slice(0, 20);
                        localStorage.setItem('sp-feed-cache', JSON.stringify({
                            _cachedAt: Date.now(),
                            posts: cacheSlice,
                        }));
                    } catch { /* quota exceeded */ }
                }
            }
        } catch (e) { console.error('Feed error:', e); }
        finally {
            setLoadingMore(false);
        }
    };

    // ♾️ INFINITE SCROLL: Refs to avoid stale closures in IntersectionObserver
    const feedOffsetRef = useRef(feedOffset);
    const hasMorePostsRef = useRef(hasMorePosts);
    const loadingMoreRef = useRef(loadingMore);

    // Keep refs in sync with state
    useEffect(() => { feedOffsetRef.current = feedOffset; }, [feedOffset]);
    useEffect(() => { hasMorePostsRef.current = hasMorePosts; }, [hasMorePosts]);
    useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);

    // ♾️ INFINITE SCROLL: Load more posts when scrolling
    const loadMorePosts = async () => {
        console.log('[Social] loadMorePosts called, loadingMore:', loadingMoreRef.current, 'hasMorePosts:', hasMorePostsRef.current);
        if (loadingMoreRef.current || !hasMorePostsRef.current) return;
        const newOffset = feedOffsetRef.current + POSTS_PER_PAGE;
        console.log('[Social] Loading more from offset:', newOffset);
        setFeedOffset(newOffset);
        await loadFeed(newOffset, true);
    };

    // ♾️ INFINITE SCROLL: Store observer in ref to avoid recreating
    const observerRef = useRef(null);

    // ♾️ INFINITE SCROLL: Callback ref that attaches observer immediately when element mounts
    const loadMoreCallbackRef = useCallback((node) => {
        // Cleanup previous observer if any
        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }

        // If node is null (unmounting), we're done
        if (!node) {
            console.log('[Social] Sentinel unmounted, observer disconnected');
            return;
        }

        console.log('[Social] ✅ Sentinel mounted! Attaching IntersectionObserver...');

        // Create and attach new observer
        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    console.log('[Social] Sentinel visible! Calling loadMorePosts...');
                    loadMorePosts();
                }
            },
            { threshold: 0.1, rootMargin: '200px' }
        );

        observerRef.current.observe(node);
    }, []); // Empty deps - uses refs for current values

    const handlePost = async (content, urls, type, mentions = [], linkPreview = null) => {
        console.log('[Social]  handlePost called with:', { content: content?.substring(0, 50), urls, type, mentions, hasLinkPreview: !!linkPreview });
        console.log('[Social]  linkPreview FULL OBJECT:', JSON.stringify(linkPreview, null, 2));
        console.log('[Social]  User state:', { id: user?.id, name: user?.name, hasUser: !!user });

        if (!user?.id) {
            console.error('[Social] ❌ Cannot post: user.id is missing!', user);
            return false;
        }

        setIsPosting(true);

        // Check if posting as Club Page
        let identityStoredRaw = null;
        try { identityStoredRaw = localStorage.getItem('active-identity'); } catch (e) { }
        const identityStored = identityStoredRaw ? JSON.parse(identityStoredRaw) : null;
        const isClubPost = identityStored?.mode === 'club' && identityStored?.clubPage?.id;

        try {
            if (isClubPost) {
                // ═══ CLUB PAGE POST — route through page posts API ═══
                const clubPageId = identityStored.clubPage.id;
                console.log('[Social] 🏢 Posting as Club Page:', identityStored.clubPage.name, clubPageId);

                const res = await fetch('/api/social/pages/posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        page_id: clubPageId,
                        author_id: user.id,
                        content,
                        content_type: type,
                        media_urls: urls,
                        ...(linkPreview ? {
                            link_preview: {
                                url: linkPreview.url || urls[0],
                                title: linkPreview.title || null,
                                description: linkPreview.description || null,
                                image: linkPreview.image || null,
                            }
                        } : {})
                    }),
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.error || 'Failed to post as club');

                console.log('[Social] ✅ Club page post created:', json.data?.id);

                // Add to feed with club identity
                setPosts(prev => [{
                    id: json.data?.id || Date.now(), authorId: user.id, content, contentType: type,
                    mediaUrls: urls, likeCount: 0, commentCount: 0, shareCount: 0,
                    timeAgo: 'Just now', isLiked: false, justPosted: true,
                    // Link metadata for ArticleCard rendering
                    link_url: linkPreview?.url || null,
                    link_title: linkPreview?.title || null,
                    link_description: linkPreview?.description || null,
                    link_image: linkPreview?.image || null,
                    author: {
                        name: identityStored.clubPage.name,
                        username: null,
                        avatar: identityStored.clubPage.avatar_url
                    },
                    isClubPagePost: true,
                    clubPageId: clubPageId
                }, ...prev]);

                window.scrollTo({ top: 0, behavior: 'smooth' });
                toast.success(`Posted as ${identityStored.clubPage.name}!`, 2000);
                return true;
            }

            // ═══ PERSONAL POST — existing flow ═══
            // Build base payload
            const insertPayload = {
                author_id: user.id,
                content,
                content_type: type,
                media_urls: urls,
                visibility: 'public',
            };

            // EXPLICIT: Add link metadata if available (from link preview)
            if (linkPreview) {
                console.log('[Social]  Adding link metadata from preview:', linkPreview);
                insertPayload.link_url = linkPreview.url || urls[0];
                insertPayload.link_title = linkPreview.title || null;
                insertPayload.link_description = linkPreview.description || null;
                insertPayload.link_image = linkPreview.image || null;
                insertPayload.link_site_name = linkPreview.domain || null;
            }

            console.log('[Social]  FINAL insert payload:', JSON.stringify(insertPayload, null, 2));

            const { data, error } = await supabase.from('social_posts').insert(insertPayload).select().maybeSingle();

            if (error || !data) {
                console.error('[Social] ❌ Supabase insert error:', error?.message, error?.details, error?.hint, error?.code);
                throw error || new Error('Post creation returned no data');
            }

            console.log('[Social] ✅ Post created successfully:', data.id);

            // Insert mentions if any
            if (mentions.length > 0 && data?.id) {
                // Look up user IDs for mentioned usernames
                const { data: mentionedUsers } = await supabase
                    .from('profiles')
                    .select('id, username')
                    .in('username', mentions);

                if (mentionedUsers?.length > 0) {
                    const mentionInserts = mentionedUsers.map(u => ({
                        post_id: data.id,
                        mentioned_user_id: u.id,
                        mentioned_by_id: user.id
                    }));
                    await supabase.from('mentions').insert(mentionInserts);
                }
            }

            // AUTO-SAVE VIDEOS TO REELS 
            // When a video is posted, automatically create a Reel entry
            if (type === 'video' && urls.length > 0) {
                const videoUrl = urls.find(url =>
                    url.includes('.mp4') || url.includes('.webm') || url.includes('.mov') ||
                    url.includes('video') || !url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                ) || urls[0];

                try {
                    await supabase.from('social_reels').insert({
                        author_id: user.id,
                        video_url: videoUrl,
                        caption: content || null,
                        source_post_id: data.id,
                        is_public: true,
                        view_count: 0,
                        like_count: 0
                    });
                    console.log(' Video auto-saved to Reels!');
                } catch (reelError) {
                    console.error('Failed to auto-save to Reels:', reelError);
                    // Don't fail the post if Reel creation fails
                }
            }

            setPosts(prev => [{
                id: data.id, authorId: user.id, content, contentType: type,
                mediaUrls: urls, likeCount: 0, commentCount: 0, shareCount: 0,
                timeAgo: 'Just now', isLiked: false, justPosted: true, // Mark as just posted for highlight
                author: { name: user.name, username: user.username, avatar: user.avatar }
            }, ...prev]);

            // Scroll to top of feed so user sees their new post immediately (SmarterPoker behavior)
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Show success toast
            toast.success('Posted Successfully!', 2000);

            return true;
        } catch (e) { console.error('Post error:', e); return false; }
        finally { setIsPosting(false); }
    };

    const handleLike = async (postId, type) => {
        if (!user?.id) return;
        try {
            if (!type) {
                await supabase.from('social_interactions').delete().eq('post_id', postId).eq('user_id', user.id).eq('interaction_type', 'like');
            } else {
                await supabase.from('social_interactions').upsert(
                    { post_id: postId, user_id: user.id, interaction_type: 'like' },
                    { onConflict: 'user_id,post_id,interaction_type' }
                );
            }
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (id) => {
        if (!user?.id || !confirm('Delete this post?')) return;
        try {
            // Get auth token for server-side API
            const session = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
            const token = session?.access_token;

            if (!token) {
                console.error('[Delete] No auth token available');
                alert('Please log in again to delete posts');
                return;
            }

            // Call server-side API (bypasses RLS for god mode)
            const response = await fetch('/api/posts/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ postId: id })
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('[Delete] Server error:', result);
                alert(result.error || 'Failed to delete post');
                return;
            }

            // Remove from local state
            setPosts(prev => prev.filter(p => p.id !== id));
            console.log(`[Delete] ✅ Post ${id} deleted successfully (${result.deletedBy})`);
        } catch (e) {
            console.error('[Delete] Error:', e);
            alert('Error deleting post');
        }
    };

    const loadContacts = async (userId) => {
        try {
            // Step 1: Fetch all conversations the user is in (single query)
            const { data: myConvos } = await supabase
                .from('social_conversation_participants')
                .select('conversation_id, social_conversations(last_message_preview)')
                .eq('user_id', userId);
            if (!myConvos || myConvos.length === 0) return;

            // Step 2: Fetch ALL participants for those conversations in one query
            const conversationIds = myConvos.map(c => c.conversation_id);
            const { data: allParts } = await supabase
                .from('social_conversation_participants')
                .select('conversation_id, user_id')
                .in('conversation_id', conversationIds)
                .neq('user_id', userId);
            if (!allParts || allParts.length === 0) return;

            // Build a map: conversation_id -> other user_id
            const convToUser = {};
            for (const p of allParts) {
                if (!convToUser[p.conversation_id]) convToUser[p.conversation_id] = p.user_id;
            }

            // Step 3: Batch-fetch all profiles in one query
            const uniqueUserIds = [...new Set(Object.values(convToUser))];
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username')
                .in('id', uniqueUserIds);
            const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

            // Assemble contacts in-memory
            const list = myConvos.map(c => {
                const otherUserId = convToUser[c.conversation_id];
                if (!otherUserId) return null;
                const prof = profileMap[otherUserId];
                return {
                    id: otherUserId,
                    name: prof?.username || 'Player',
                    avatar: null,
                    conversationId: c.conversation_id,
                    lastMessage: c.social_conversations?.last_message_preview,
                    online: false
                };
            });
            setContacts(list.filter(Boolean));
        } catch (e) { console.error(e); }
    };

    const handleSearch = (q) => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (q.length < 2) { setSearchResults([]); return; }
        searchTimeout.current = setTimeout(async () => {
            try {
                const { data } = await supabase.from('profiles').select('id, username').ilike('username', `%${q}%`).limit(10);
                if (data) setSearchResults(data.map(u => ({ id: u.id, username: u.username })));
            } catch (e) { console.error(e); }
        }, 300);
    };

    // Global search for users and posts
    const handleGlobalSearch = (query) => {
        setGlobalSearchQuery(query);
        if (globalSearchTimeout.current) clearTimeout(globalSearchTimeout.current);
        if (query.length < 2) {
            setGlobalSearchResults({ users: [], posts: [] });
            return;
        }
        setGlobalSearchLoading(true);
        globalSearchTimeout.current = setTimeout(async () => {
            try {
                // Search users
                const { data: users } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url')
                    .ilike('username', `%${query}%`)
                    .limit(5);

                // Search posts
                const { data: posts } = await supabase
                    .from('social_posts')
                    .select('id, content, author_id, created_at')
                    .ilike('content', `%${query}%`)
                    .limit(5);

                // Get author info for posts
                let enrichedPosts = [];
                if (posts?.length) {
                    const authorIds = [...new Set(posts.map(p => p.author_id))];
                    const { data: authors } = await supabase.from('profiles').select('id, username').in('id', authorIds);
                    const authorMap = Object.fromEntries((authors || []).map(a => [a.id, a]));
                    enrichedPosts = posts.map(p => ({
                        ...p,
                        author: authorMap[p.author_id]
                    }));
                }

                setGlobalSearchResults({
                    users: users || [],
                    posts: enrichedPosts
                });
            } catch (e) {
                console.error('Global search error:', e);
            }
            setGlobalSearchLoading(false);
        }, 300);
    };

    const handleOpenChat = async (c) => {
        if (openChats.find(x => x.id === c.id)) return;
        let convId = c.conversationId;
        if (!convId && user?.id) {
            try {
                const { data } = await supabase.rpc('fn_get_or_create_conversation', { user1_id: user.id, user2_id: c.id });
                convId = data;
            } catch (e) { console.error(e); }
        }
        const chat = { id: c.id, name: c.name || c.username, avatar: null, online: false, conversationId: convId };
        setOpenChats(prev => [...prev.slice(-2), chat]);
        if (convId) {
            try {
                const { data } = await supabase.from('social_messages').select('id, content, sender_id').eq('conversation_id', convId).eq('is_deleted', false).order('created_at', { ascending: true }).limit(50);
                if (data) setChatMsgs(prev => ({ ...prev, [c.id]: data.map(m => ({ id: m.id, text: m.content, senderId: m.sender_id })) }));
            } catch (e) { console.error(e); }
        }
    };

    const handleSendMsg = async (cid, txt) => {
        const chat = openChats.find(x => x.id === cid);
        if (!chat?.conversationId || !user?.id) return;
        try {
            await supabase.rpc('fn_send_message', { p_conversation_id: chat.conversationId, p_sender_id: user.id, p_content: txt });
            setChatMsgs(prev => ({ ...prev, [cid]: [...(prev[cid] || []), { id: Date.now(), text: txt, senderId: user.id }] }));
        } catch (e) { console.error(e); }
    };

    // Only show loading spinner if intro is done and still loading
    if (loading && !showIntro) return <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div>Loading...</div></div>;

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
                        src="/videos/social-media-intro.mp4"
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
                title="Social Hub — Poker Community & Feed"
                description="Connect With Poker Players Worldwide. Share Updates, Follow Friends, Join Discussions, And Build Your Poker Network On The Smarter.Poker Social Hub."
                canonical="/hub/social-media"
            />

            {/* Slide-out Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    onClick={() => setSidebarOpen(false)}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', zIndex: 999
                    }}
                />
            )}

            {/* Slide-out Sidebar Panel */}
            <div style={{
                position: 'fixed', top: 0, left: 0, bottom: 0, width: 320,
                background: C.card, zIndex: 1000, boxShadow: '2px 0 10px rgba(0,0,0,0.2)',
                transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.3s ease',
                overflowY: 'auto', paddingBottom: 80
            }}>
                {/* Close button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
                    <button onClick={() => setSidebarOpen(false)} style={{
                        background: '#f0f0f0', border: 'none', width: 32, height: 32,
                        borderRadius: '50%', cursor: 'pointer', fontSize: 16
                    }}>×</button>
                </div>

                {/* User Profile Card */}
                {user && (
                    <Link href="/hub/profile" onClick={() => setSidebarOpen(false)} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', margin: '0 12px 16px',
                        background: C.card, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        textDecoration: 'none', color: 'inherit'
                    }}>
                        <Avatar src={user.avatar} name={user.name} size={48} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 17 }}>{user.name}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>View Your Profile</div>
                        </div>
                        <div style={{
                            background: C.blue, color: 'white', borderRadius: '50%',
                            width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 600
                        }}>9+</div>
                    </Link>
                )}

                {/* Poker Resume - Show when HendonMob is linked */}
                {user?.hendon && (
                    <Link
                        href={user.username ? `/hub/user/${user.username}` : '/hub/profile'}
                        onClick={() => setSidebarOpen(false)}
                        style={{ textDecoration: 'none', display: 'block' }}
                    >
                        <div style={{
                            margin: '0 12px 16px', padding: 16, borderRadius: 12,
                            background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 100%)',
                            border: '1px solid rgba(255, 215, 0, 0.3)',
                            cursor: 'pointer',
                            transition: 'transform 0.2s, box-shadow 0.2s'
                        }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 215, 0, 0.3)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <span style={{ fontSize: 24 }}>Trophy</span>
                                <div>
                                    <div style={{ color: '#FFD700', fontWeight: 700, fontSize: 14 }}>POKER RESUME</div>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Tournament Stats</div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: '#FFD700', fontSize: 18, fontWeight: 700 }}>{user.hendon.cashes || '—'}</div>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>CASHES</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: '#00ff88', fontSize: 18, fontWeight: 700 }}>${user.hendon.earnings?.toLocaleString() || '—'}</div>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>EARNINGS</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: '#00d4ff', fontSize: 18, fontWeight: 700 }}>{user.hendon.biggestCash ? `$${user.hendon.biggestCash.toLocaleString()}` : '—'}</div>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>BIGGEST CASH</div>
                                </div>
                            </div>
                        </div>
                    </Link>
                )}

                {/* Your Shortcuts */}
                <div style={{ padding: '0 16px', marginBottom: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: C.textSec, marginBottom: 12 }}>Your Shortcuts</h4>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Link href="/hub/club-arena" onClick={() => setSidebarOpen(false)} style={{ textAlign: 'center', textDecoration: 'none', color: 'inherit' }}>
                            <div style={{ width: 56, height: 56, borderRadius: 8, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
                                    <path d="M4 4h4v16H4V4zm6 0h4v16h-4V4zm6 0h4v16h-4V4z" />
                                </svg>
                            </div>
                            <div style={{ fontSize: 11, marginTop: 4, color: C.textSec }}>Club Arena</div>
                        </Link>
                        <Link href="/hub" onClick={() => setSidebarOpen(false)} style={{ textAlign: 'center', textDecoration: 'none', color: 'inherit' }}>
                            <div style={{ width: 56, height: 56, borderRadius: 8, background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
                                    <path d="M7 4h10a3 3 0 013 3v10a3 3 0 01-3 3H7a3 3 0 01-3-3V7a3 3 0 013-3zm0 5a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4zM9 15h6v2H9v-2z" />
                                </svg>
                            </div>
                            <div style={{ fontSize: 11, marginTop: 4, color: C.textSec }}>Games Hub</div>
                        </Link>
                    </div>
                </div>

                {/* Menu Grid - Custom AI-Generated Smarter.Poker Icons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 16 }}>
                    {/* Friends - Custom AI icon */}
                    <Link href="/hub/friends" onClick={() => setSidebarOpen(false)} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                        background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1'
                    }}>
                        <img src="/icons/friends.png" alt="" style={{ width: 36, height: 36, marginBottom: 8, objectFit: 'contain' }} />
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Friends</span>
                    </Link>
                    {/* Club Arena - Purple columns SVG (fallback) */}
                    <Link href="/hub/club-arena" onClick={() => setSidebarOpen(false)} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                        background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1'
                    }}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
                            <rect x="2" y="6" width="6" height="14" rx="1" fill="#8b5cf6" />
                            <rect x="9" y="3" width="6" height="17" rx="1" fill="#a78bfa" />
                            <rect x="16" y="6" width="6" height="14" rx="1" fill="#c4b5fd" />
                            <ellipse cx="12" cy="20" rx="10" ry="2" fill="#ddd6fe" opacity="0.5" />
                        </svg>
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Club Arena</span>
                    </Link>
                    {/* Diamond Store - Custom AI icon */}
                    <Link href="/hub/diamond-store" onClick={() => setSidebarOpen(false)} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                        background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1'
                    }}>
                        <img src="/icons/diamond.png" alt="" style={{ width: 36, height: 36, marginBottom: 8, objectFit: 'contain' }} />
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Diamond Store</span>
                    </Link>
                    {/* Tournaments - Custom AI icon */}
                    <Link href="/hub/tournaments" onClick={() => setSidebarOpen(false)} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                        background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1'
                    }}>
                        <img src="/icons/tournaments.png" alt="" style={{ width: 36, height: 36, marginBottom: 8, objectFit: 'contain' }} />
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Tournaments</span>
                    </Link>
                    {/* Club Pages - Venue/Tour/Series Pages (inline view) */}
                    <div onClick={() => { setShowClubPages(true); setSidebarOpen(false); router.replace('/hub/social-media?view=club-pages', undefined, { shallow: true }); }} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                        background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1', cursor: 'pointer'
                    }}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
                            <rect x="2" y="3" width="20" height="18" rx="2" fill="#1877F2" opacity="0.15" />
                            <rect x="2" y="3" width="20" height="7" rx="2" fill="#1877F2" opacity="0.3" />
                            <circle cx="8" cy="14" r="2" fill="#1877F2" />
                            <rect x="12" y="13" width="8" height="2" rx="1" fill="#1877F2" opacity="0.6" />
                            <rect x="12" y="17" width="5" height="1.5" rx="0.75" fill="#1877F2" opacity="0.3" />
                        </svg>
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Club Pages</span>
                    </div>
                    {/* GTO Training - Custom AI icon */}
                    <Link href="/hub/gto-trainer" onClick={() => setSidebarOpen(false)} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                        background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1'
                    }}>
                        <img src="/icons/gto.png" alt="" style={{ width: 36, height: 36, marginBottom: 8, objectFit: 'contain' }} />
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>GTO Training</span>
                    </Link>
                    {/* Reels - Custom AI icon */}
                    <Link href="/hub/reels" onClick={() => setSidebarOpen(false)} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                        background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1'
                    }}>
                        <img src="/icons/reels.png" alt="" style={{ width: 36, height: 36, marginBottom: 8, objectFit: 'contain' }} />
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Reels</span>
                    </Link>
                </div>

                {/* Additional Navigation Items */}
                <div style={{ padding: '0 16px', marginBottom: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Link href="/hub/profile" onClick={() => setSidebarOpen(false)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                            background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1'
                        }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
                                <circle cx="12" cy="12" r="11" fill="#e3f2fd" />
                                <circle cx="12" cy="9" r="4" fill="#1877f2" />
                                <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="#1877f2" />
                            </svg>
                            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Profile</span>
                        </Link>
                        <Link href="/hub/messenger" onClick={() => setSidebarOpen(false)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                            background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1'
                        }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
                                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" fill="#0084ff" />
                            </svg>
                            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Messenger</span>
                        </Link>
                        <Link href="/hub/lives" prefetch={false} onClick={() => setSidebarOpen(false)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                            background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1'
                        }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
                                <circle cx="12" cy="12" r="11" fill="#ff4444" />
                                <circle cx="12" cy="12" r="5" fill="white" />
                            </svg>
                            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Lives</span>
                        </Link>
                        <Link href="/hub/news" onClick={() => setSidebarOpen(false)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                            background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1'
                        }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
                                <rect x="3" y="4" width="18" height="16" rx="2" fill="#4267B2" />
                                <rect x="6" y="8" width="6" height="4" fill="white" />
                                <rect x="6" y="14" width="12" height="2" fill="white" opacity="0.7" />
                                <rect x="14" y="8" width="4" height="2" fill="white" opacity="0.7" />
                            </svg>
                            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>News</span>
                        </Link>
                        <Link href="/hub/poker-near-me" onClick={() => setSidebarOpen(false)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                            background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1'
                        }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
                                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#ea4335" />
                                <circle cx="12" cy="9" r="3" fill="white" />
                            </svg>
                            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Poker Near Me</span>
                        </Link>
                        <div onClick={() => { setSidebarOpen(false); setShowNotifications(true); }} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                            background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1', cursor: 'pointer'
                        }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
                                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" fill="#f5a623" />
                                <path d="M13.73 21a2 2 0 01-3.46 0" stroke="#f5a623" strokeWidth="2" />
                            </svg>
                            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Notifications</span>
                        </div>
                        {/* Invite Friends Card */}
                        <div onClick={() => {
                            if (!user) { alert('Please log in to invite friends.'); return; }
                            setShowInviteModal(true);
                        }} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                            background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1', cursor: 'pointer'
                        }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
                                <circle cx="9" cy="7" r="4" fill="#1877F2" />
                                <path d="M2 21v-2a7 7 0 0114 0v2" fill="#1877F2" opacity="0.5" />
                                <line x1="19" y1="8" x2="19" y2="14" stroke="#1877F2" strokeWidth="2" strokeLinecap="round" />
                                <line x1="16" y1="11" x2="22" y2="11" stroke="#1877F2" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                            <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Invite Friends</span>
                        </div>
                    </div>
                </div>

                {/* Bottom Links */}
                <div style={{ padding: '0 16px' }}>
                    <Link href="/hub/help" onClick={() => setSidebarOpen(false)} style={{
                        padding: '12px 0', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textDecoration: 'none', color: 'inherit'
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
                        </svg>
                        <span style={{ flex: 1, fontSize: 15 }}>Help And Support</span>
                        <span style={{ color: C.textSec }}>›</span>
                    </Link>
                    <Link href="/hub/settings" onClick={() => setSidebarOpen(false)} style={{
                        padding: '12px 0', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textDecoration: 'none', color: 'inherit'
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                        </svg>
                        <span style={{ flex: 1, fontSize: 15 }}>Settings</span>
                        <span style={{ color: C.textSec }}>›</span>
                    </Link>
                </div>
            </div>

            <div style={{ minHeight: '100vh', background: '#0a0e1a', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box' }}>
                {/* Standard Hub Header with Hamburger Menu */}
                <UniversalHeader
                    pageDepth={showClubPages ? 2 : 1}
                    showSearch={false}
                    onMenuClick={() => setSidebarOpen(true)}
                />

                {/* Global Search Overlay */}
                {showGlobalSearch && (
                    <div style={{
                        position: 'fixed', top: 60, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', zIndex: 998
                    }} onClick={() => setShowGlobalSearch(false)} />
                )}
                {showGlobalSearch && (
                    <div style={{
                        position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
                        width: '100%', maxWidth: 600, background: C.card, borderRadius: '0 0 12px 12px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 999, maxHeight: 'calc(100vh - 80px)',
                        overflowY: 'auto'
                    }}>
                        <div style={{ padding: 16 }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                background: C.bg, borderRadius: 24, padding: '0 16px'
                            }}>
                                <span style={{ fontSize: 18 }}></span>
                                <input
                                    type="text"
                                    value={globalSearchQuery}
                                    onChange={e => handleGlobalSearch(e.target.value)}
                                    placeholder="Search Smarter.Poker..."
                                    autoFocus
                                    style={{
                                        flex: 1, border: 'none', background: 'transparent',
                                        padding: '12px 0', fontSize: 16, outline: 'none'
                                    }}
                                />
                                {globalSearchQuery && (
                                    <button
                                        onClick={() => { setGlobalSearchQuery(''); setGlobalSearchResults({ users: [], posts: [] }); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec }}
                                    >×</button>
                                )}
                            </div>
                        </div>

                        {/* Search Results */}
                        {globalSearchLoading && (
                            <div style={{ padding: '20px', textAlign: 'center', color: C.textSec }}>
                                Searching...
                            </div>
                        )}

                        {!globalSearchLoading && globalSearchQuery.length >= 2 && (
                            <div>
                                {/* Users */}
                                {globalSearchResults.users.length > 0 && (
                                    <div style={{ borderTop: `1px solid ${C.border}` }}>
                                        <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: C.textSec }}>
                                            People
                                        </div>
                                        {globalSearchResults.users.map(u => (
                                            <Link
                                                key={u.id}
                                                href={`/hub/user/${u.username}`}
                                                onClick={() => setShowGlobalSearch(false)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 12,
                                                    padding: '10px 16px', textDecoration: 'none', color: 'inherit'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <Avatar src={u.avatar_url} name={u.username} size={40} />
                                                <div style={{ fontWeight: 500 }}>{u.username}</div>
                                            </Link>
                                        ))}
                                    </div>
                                )}

                                {/* Posts */}
                                {globalSearchResults.posts.length > 0 && (
                                    <div style={{ borderTop: `1px solid ${C.border}` }}>
                                        <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: C.textSec }}>
                                            Posts
                                        </div>
                                        {globalSearchResults.posts.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => { setShowGlobalSearch(false); }}
                                                style={{
                                                    padding: '10px 16px', cursor: 'pointer'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <div style={{ fontSize: 13, color: C.textSec, marginBottom: 4 }}>
                                                    {p.author?.username || 'Player'}
                                                </div>
                                                <div style={{ fontSize: 14, color: C.text }}>
                                                    {p.content?.slice(0, 100)}{p.content?.length > 100 ? '...' : ''}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* No results */}
                                {globalSearchResults.users.length === 0 && globalSearchResults.posts.length === 0 && (
                                    <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textSec }}>
                                        <div style={{ fontSize: 32, marginBottom: 8 }}></div>
                                        No results found for "{globalSearchQuery}"
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Notification Full-Screen Modal */}
                {showNotifications && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', zIndex: 9999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }} onClick={(e) => { if (e.target === e.currentTarget) setShowNotifications(false); }}>
                        <div style={{
                            position: 'relative', width: '100%', maxWidth: 520, height: '90vh',
                            background: C.card, borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            margin: '0 12px'
                        }}>
                            {/* Header */}
                            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text }}>Notifications</h3>
                                <button
                                    onClick={() => setShowNotifications(false)}
                                    style={{ background: C.bg, border: 'none', cursor: 'pointer', fontSize: 18, width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text }}
                                >✕</button>
                            </div>
                            {/* Scrollable notification list */}
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                {notifications.length === 0 ? (
                                    <div style={{ padding: '60px 24px', textAlign: 'center', color: C.textSec }}>
                                        <div style={{ fontSize: 48, marginBottom: 12 }}>🔔</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>No Notifications Yet</div>
                                        <div style={{ fontSize: 14 }}>When Someone Interacts With Your Posts Or Profile, You'll See It Here.</div>
                                    </div>
                                ) : (
                                    notifications.map(n => {
                                        const actionIcon = n.type === 'like' ? '👍' : n.type === 'comment' ? '💬' : n.type === 'mention' ? '@' : n.type === 'friend_request' ? '👤' : n.type === 'live' ? '🔴' : '🔔';
                                        const iconBg = n.type === 'like' ? '#1877F2' : n.type === 'comment' ? '#44BD32' : n.type === 'live' ? '#FA383E' : n.type === 'friend_request' ? '#1877F2' : '#65676B';

                                        return (
                                            <div
                                                key={n.id}
                                                onClick={() => {
                                                    setShowNotifications(false);
                                                    if (n.actor_username) {
                                                        router.push(`/hub/user/${n.actor_username}`);
                                                    }
                                                }}
                                                style={{
                                                    padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
                                                    display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'pointer',
                                                    background: n.read ? 'transparent' : 'rgba(24, 119, 242, 0.06)',
                                                    transition: 'background 0.15s'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = n.read ? 'rgba(0,0,0,0.03)' : 'rgba(24,119,242,0.1)'}
                                                onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(24,119,242,0.06)'}
                                            >
                                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                                    <img
                                                        src={n.actor_avatar_url || n.metadata?.actor_avatar || '/default-avatar.png'}
                                                        style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #ddd' }}
                                                    />
                                                    <div style={{
                                                        position: 'absolute', bottom: -2, right: -2,
                                                        width: 24, height: 24, borderRadius: '50%',
                                                        background: iconBg, border: '2px solid white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 12
                                                    }}>{actionIcon}</div>
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 15, color: C.text, lineHeight: 1.4 }}>
                                                        <span style={{ fontWeight: 700 }}>{n.actor_name || n.metadata?.actor_name || n.title}</span>
                                                        {' '}{n.message}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: n.read ? C.textSec : C.blue, marginTop: 4, fontWeight: n.read ? 400 : 600 }}>
                                                        {timeAgo(n.created_at)}
                                                    </div>
                                                </div>
                                                {!n.read && (
                                                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.blue, flexShrink: 0, marginTop: 8 }} />
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Feed - 800px Design Canvas */}
                <main className="social-page-container" style={{ padding: 0, width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>

                    {/* ===== CLUB PAGES: CREATE MODAL ===== */}
                    {showCreatePage && isCommander && (
                        <ClubPageCreateModal
                            C={C}
                            commanderData={commanderData}
                            userId={user?.id}
                            onCreated={(page) => {
                                setMyClubPage(page);
                                setShowCreatePage(false);
                                setShowPageDashboard(true);
                            }}
                            onClose={() => setShowCreatePage(false)}
                        />
                    )}

                    {/* ===== CLUB PAGE DASHBOARD (Owner) ===== */}
                    {showClubPages && showPageDashboard && myClubPage && (
                        <ClubPageDashboard
                            C={C}
                            page={myClubPage}
                            userId={user?.id}
                            onBack={() => setShowPageDashboard(false)}
                            onPageUpdated={(updated) => setMyClubPage(updated)}
                            onGoLive={() => setShowGoLiveModal(true)}
                        />
                    )}

                    {/* ===== PUBLIC LIVE GAME BOARD (Any User) ===== */}
                    {showClubPages && viewingLiveGamesPage && (
                        <PublicGameBoard
                            C={C}
                            pageId={viewingLiveGamesPage.id}
                            pageName={viewingLiveGamesPage.name}
                            userId={user?.id}
                            userName={user?.username || user?.full_name || ''}
                            onClose={() => setViewingLiveGamesPage(null)}
                        />
                    )}

                    {/* ===== CLUB PAGES VIEW (Browse) ===== */}
                    {showClubPages && !showPageDashboard && !viewingLiveGamesPage && (
                        <>
                            {/* Commander Banner — Create or Manage Page */}
                            {isCommander && !myPageLoading && (
                                <div style={{
                                    background: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 8,
                                    border: '1px solid #CCD0D5', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}>
                                    {myClubPage ? (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{
                                                    width: 48, height: 48, borderRadius: 10, background: '#fff',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 22, fontWeight: 800, color: '#1877F2', flexShrink: 0,
                                                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)', overflow: 'hidden'
                                                }}>
                                                    {(myClubPage.metadata || {}).logo_url ? (
                                                        <img src={myClubPage.metadata.logo_url} alt={myClubPage.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        (myClubPage.name || 'C')[0].toUpperCase()
                                                    )}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#050505' }}>{myClubPage.name}</div>
                                                    <div style={{ fontSize: 12, color: '#65676B', marginTop: 1 }}>
                                                        {CATEGORY_LABELS[myClubPage.category] || myClubPage.category || 'Club'} · {myClubPage.follower_count || 0} followers
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button onClick={() => setShowPageDashboard(true)} style={{
                                                    padding: '8px 20px', borderRadius: 8, border: 'none',
                                                    background: '#1877F2', color: '#fff',
                                                    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                                                }}>Manage Page</button>
                                                <button onClick={() => setViewingLiveGamesPage(myClubPage)} style={{
                                                    padding: '8px 16px', borderRadius: 8, border: 'none',
                                                    background: '#E4E6EB', color: '#050505',
                                                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                                                }}>Live Games</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <span style={{ fontSize: 14, fontWeight: 700, color: '#050505' }}>Create Your Club Page</span>
                                                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#65676B' }}>Set Up A Public Page For Your Venue</p>
                                            </div>
                                            <button onClick={() => setShowCreatePage(true)} style={{
                                                padding: '8px 20px', borderRadius: 8, border: 'none',
                                                background: '#fff', color: '#1877F2',
                                                fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
                                            }}>Create Page</button>
                                        </div>
                                    )}
                                </div>
                            )}
                            <ClubPagesView
                                C={C}
                                pages={clubPages}
                                setPages={setClubPages}
                                loading={clubPagesLoading}
                                setLoading={setClubPagesLoading}
                                category={clubPagesCategory}
                                setCategory={setClubPagesCategory}
                                search={clubPagesSearch}
                                setSearch={setClubPagesSearch}
                                followingIds={clubPagesFollowing}
                                setFollowingIds={setClubPagesFollowing}
                                onClose={() => { setShowClubPages(false); router.replace('/hub/social-media', undefined, { shallow: true }); }}
                                onViewLiveGames={setViewingLiveGamesPage}
                            />
                        </>
                    )}

                    {/* ===== NORMAL FEED ===== */}
                    {!showClubPages && <>
                        <div className="social-feed-layout" style={{ display: 'flex', gap: 16, justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>
                            <div className="social-feed-column" style={{ flex: 1, minWidth: 0 }}>
                                {/* Stories Bar */}
                                {user && <StoriesBar userId={user.id} userAvatar={user.avatar} />}

                                {/* Post Creator */}
                                {user && <PostCreator user={user} onPost={handlePost} isPosting={isPosting} onGoLive={() => setShowGoLiveModal(true)} onOpenClubPages={() => { setShowClubPages(true); router.replace('/hub/social-media?view=club-pages', undefined, { shallow: true }); }} />}

                                {/* Login prompt */}
                                {!user && (
                                    <div style={{ background: C.card, borderRadius: 8, padding: 24, textAlign: 'center', marginBottom: 8 }}>
                                        <p style={{ color: C.textSec, marginBottom: 12 }}>Log In To Post And Interact!</p>
                                        <Link href="/auth/login" style={{
                                            display: 'inline-block', padding: '10px 24px', background: C.blue,
                                            color: 'white', borderRadius: 6, fontWeight: 600, textDecoration: 'none'
                                        }}>Log In</Link>
                                    </div>
                                )}

                                {/* LIVE STREAMS SECTION */}
                                {liveStreams.length > 0 && (
                                    <div style={{ marginBottom: 12 }}>
                                        <h4 style={{ margin: '0 0 10px 4px', fontSize: 16, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            🔴 Live Now
                                        </h4>
                                        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                                            {liveStreams.map(stream => (
                                                <div key={stream.id} style={{ flexShrink: 0, width: 280 }}>
                                                    <LiveStreamCard
                                                        stream={stream}
                                                        onClick={() => setWatchingStream(stream)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Posts Feed */}
                                {posts.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                                        <div style={{ fontSize: 48 }}></div>
                                        <h3 style={{ color: C.text }}>No Posts Yet</h3>
                                        <p>Be The First To Share Something!</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Render posts with Reels carousel inserted after every 3 posts */}
                                        {posts.map((p, index) => (
                                            <React.Fragment key={p.id}>
                                                <PostCard
                                                    post={{ ...p, isGodMode }}
                                                    currentUserId={user?.id}
                                                    currentUserName={user?.name}
                                                    currentUserAvatar={user?.avatar}
                                                    onLike={handleLike}
                                                    onDelete={handleDelete}
                                                    onOpenArticle={(url) => setArticleReader({ open: true, url, title: p.link_title || null })}
                                                />
                                                {/* Insert Reels carousel after 3rd post */}
                                                {index === 2 && <ReelsFeedCarousel key="reels-carousel" />}
                                            </React.Fragment>
                                        ))}

                                        {/* ♾️ INFINITE SCROLL: Load more trigger */}
                                        <div ref={loadMoreCallbackRef} style={{
                                            padding: '20px',
                                            textAlign: 'center',
                                            minHeight: 60
                                        }}>
                                            {loadingMore && (
                                                <>
                                                    {/* Skeleton Post Placeholders */}
                                                    {[1, 2].map(i => (
                                                        <div key={`skeleton-${i}`} style={{
                                                            background: C.card,
                                                            borderRadius: 8,
                                                            padding: 16,
                                                            marginBottom: 12,
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                                        }}>
                                                            {/* Skeleton header */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                                                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E4E6EB', animation: 'pulse 1.5s infinite' }} />
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{ width: 120, height: 12, background: '#E4E6EB', borderRadius: 6, marginBottom: 6, animation: 'pulse 1.5s infinite' }} />
                                                                    <div style={{ width: 80, height: 10, background: '#E4E6EB', borderRadius: 5, animation: 'pulse 1.5s infinite' }} />
                                                                </div>
                                                            </div>
                                                            {/* Skeleton content */}
                                                            <div style={{ marginBottom: 12 }}>
                                                                <div style={{ width: '100%', height: 10, background: '#E4E6EB', borderRadius: 5, marginBottom: 8, animation: 'pulse 1.5s infinite' }} />
                                                                <div style={{ width: '80%', height: 10, background: '#E4E6EB', borderRadius: 5, animation: 'pulse 1.5s infinite' }} />
                                                            </div>
                                                            {/* Skeleton image placeholder */}
                                                            <div style={{ width: '100%', height: 200, background: '#E4E6EB', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
                                                        </div>
                                                    ))}
                                                </>
                                            )}
                                            {!hasMorePosts && posts.length > 0 && (
                                                <p style={{ color: C.textSec, fontSize: 14, textAlign: 'center' }}>
                                                    You're all caught up! Check back later for new content.
                                                </p>
                                            )}
                                        </div>

                                    </>
                                )}

                                {/* Layout CSS — rendered outside of posts conditional so it always applies */}
                                <style jsx global>{`
                                    @keyframes spin {
                                        to { transform: rotate(360deg); }
                                    }
                                    @keyframes pulse {
                                        0%, 100% { opacity: 1; }
                                        50% { opacity: 0.5; }
                                    }
                                    .social-feed-column {
                                        max-width: 680px;
                                        overflow-x: hidden;
                                    }
                                    .social-contacts-sidebar {
                                        width: 220px;
                                        flex-shrink: 0;
                                    }
                                    @media (max-width: 768px) {
                                        .social-feed-column {
                                            max-width: 100% !important;
                                            width: 100% !important;
                                        }
                                        .social-feed-layout {
                                            gap: 0 !important;
                                            width: 100% !important;
                                            padding: 0 !important;
                                        }
                                        .social-page-container {
                                            padding: 0 !important;
                                            width: 100% !important;
                                            max-width: 100vw !important;
                                            overflow-x: hidden !important;
                                        }
                                    }
                                    @media (max-width: 900px) {
                                        .social-contacts-sidebar { display: none; }
                                    }
                                `}</style>
                            </div>
                        </div>
                    </>}
                </main>

                {/* Bottom Navigation Bar - SmarterPoker Style with SVG Icons */}
                <nav style={{
                    position: 'fixed', bottom: 0, left: 0, right: 0, height: 56,
                    background: '#ffffff', borderTop: '1px solid #dddfe2',
                    display: 'flex', justifyContent: 'space-around', alignItems: 'stretch',
                    zIndex: 100,
                    transform: bottomNavVisible ? 'translateY(0)' : 'translateY(100%)',
                    transition: 'transform 0.3s ease',
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)'
                }}>
                    {/* Home - Outline house */}
                    <Link href="/hub/social-media" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: '#65676b', flex: 1, padding: '6px 4px', minWidth: 50
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z" />
                        </svg>
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Home</span>
                    </Link>
                    {/* Reels - Rounded rect with play triangle */}
                    <Link href="/hub/reels" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: '#65676b', flex: 1, padding: '6px 4px', minWidth: 50
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="3" />
                            <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
                        </svg>
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Reels</span>
                    </Link>
                    {/* Friends - Connected people icon */}
                    <Link href="/hub/friends" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: '#65676b', flex: 1, padding: '6px 4px', minWidth: 50, position: 'relative'
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="8" cy="8" r="3" />
                            <circle cx="16" cy="8" r="3" />
                            <path d="M8 11a4 4 0 00-4 4v2h8v-2a4 4 0 00-4-4z" />
                            <path d="M16 11c1.5 0 2.8.8 3.5 2 .4.8.5 1.3.5 2v2h-6" />
                        </svg>
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Friends</span>
                    </Link>
                    {/* Clubs - Star in rounded box (Events-style) */}
                    <Link href="/hub/social-media?view=club-pages" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: '#65676b', flex: 1, padding: '6px 4px', minWidth: 50
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="4" y="4" width="16" height="16" rx="2" />
                            <path d="M12 8l1.5 3 3.5.5-2.5 2.5.5 3.5L12 16l-3 1.5.5-3.5-2.5-2.5 3.5-.5z" fill="currentColor" />
                        </svg>
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Clubs</span>
                    </Link>
                    {/* Notifications - Filled bell (blue when active) */}
                    <div onClick={() => setShowNotifications(true)} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: '#1877f2', flex: 1, padding: '6px 4px', minWidth: 50, position: 'relative', cursor: 'pointer'
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2a7 7 0 00-7 7c0 3.5-1.5 5.5-2.5 7-.3.4-.5.8-.5 1.2 0 .5.5.8 1 .8h18c.5 0 1-.3 1-.8 0-.4-.2-.8-.5-1.2-1-1.5-2.5-3.5-2.5-7a7 7 0 00-7-7z" />
                            <path d="M10 20a2 2 0 004 0" />
                        </svg>
                        {notifications.filter(n => !n.read).length > 0 && (
                            <div style={{ position: 'absolute', top: 2, right: 'calc(50% - 18px)', background: '#f02849', color: 'white', borderRadius: 10, minWidth: 18, height: 18, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, padding: '0 5px' }}>{notifications.filter(n => !n.read).length}</div>
                        )}
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 600, color: '#1877f2' }}>Notifications</span>
                    </div>
                    {/* Profile - Avatar or person icon */}
                    <Link href="/hub/profile" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: '#65676b', flex: 1, padding: '6px 4px', minWidth: 50
                    }}>
                        {user ? <Avatar src={user.avatar} name={user.name} size={28} style={{ border: '2px solid #e4e6eb', borderRadius: '50%' }} /> : (
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="8" r="4" />
                                <path d="M4 20v-1a6 6 0 016-6h4a6 6 0 016 6v1" />
                            </svg>
                        )}
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 500 }}>Profile</span>
                    </Link>
                </nav>

                {/* Chat Windows */}
                <div style={{ position: 'fixed', bottom: 70, right: 16, display: 'flex', gap: 8, zIndex: 1000 }}>
                    {openChats.map(ch => <ChatWindow key={ch.id} chat={ch} messages={chatMsgs[ch.id] || []} currentUserId={user?.id} onSend={txt => handleSendMsg(ch.id, txt)} onClose={() => setOpenChats(prev => prev.filter(x => x.id !== ch.id))} />)}
                </div>

                {/* Go Live Modal */}
                <GoLiveModal
                    isOpen={showGoLiveModal}
                    onClose={() => {
                        setShowGoLiveModal(false);
                        // Refresh live streams after closing
                        LiveStreamService.getLiveStreams().then(setLiveStreams).catch(() => { });
                    }}
                    user={user}
                />

                {/* Live Stream Viewer Modal */}
                {watchingStream && (
                    <LiveStreamViewer
                        stream={watchingStream}
                        userId={user?.id}
                        onClose={() => {
                            setWatchingStream(null);
                            // Refresh live streams
                            LiveStreamService.getLiveStreams().then(setLiveStreams).catch(() => { });
                        }}
                    />
                )}
            </div>

            {/* In-App Article Reader Modal */}
            {articleReader.open && (
                <ArticleReaderModal
                    url={articleReader.url}
                    title={articleReader.title}
                    onClose={() => setArticleReader({ open: false, url: null, title: null })}
                />
            )}

            {/* Invite Friends Modal */}
            <InviteFriendsModal
                isOpen={showInviteModal}
                onClose={() => setShowInviteModal(false)}
                user={user}
                contacts={contacts}
                onOpenChat={handleOpenChat}
                onSearch={handleSearch}
                searchResults={searchResults}
            />
        </PageTransition>
    );
}
