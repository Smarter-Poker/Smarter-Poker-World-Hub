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
 * ║  🎬 Reels Carousel (Lines ~2510)                                          ║
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

import Head from 'next/head';
import Link from 'next/link';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef, useCallback } from 'react';
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

// God-Mode Stack
import { useSocialStore } from '../../src/stores/socialStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import toast from '../../src/stores/toastStore';

// Light Theme Colors (Facebook-style)
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
// 🎬 YOUTUBE URL HELPERS - Detect and convert YouTube URLs for embedding
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
// 🔍 YOUTUBE VIDEO VALIDATOR - Check if video is available before posting
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
            <span style={{ fontSize: 48, marginBottom: 8 }}>🎬</span>
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
                alt="Video thumbnail"
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

            {/* Play Button Overlay - dim for invalid videos */}
            <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 64, height: 64, borderRadius: '50%',
                background: isVideoValid === false ? 'rgba(100,100,100,0.6)' : 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: isVideoValid === false ? '#888' : 'white',
                fontSize: 28, pointerEvents: 'none'
            }}>{isVideoValid === false ? '⚠️' : '▶'}</div>

            {/* Status hint */}
            <div style={{
                position: 'absolute', bottom: 8, left: 8,
                background: isVideoValid === false ? 'rgba(200,50,50,0.8)' : 'rgba(0,0,0,0.6)',
                padding: '4px 10px',
                borderRadius: 4, color: 'white', fontSize: 12, fontWeight: 500
            }}>
                {isVideoValid === false ? '⚠️ Video unavailable' : '▶ Tap to play'}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 LINK PREVIEW CARD - Fetches and displays rich link metadata for feed posts
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ CRITICAL: DO NOT MODIFY without running /social-feed-protection workflow
// This component has broken 4+ times. Key requirements:
// - Uses useExternalLink for internal popups (NOT target="_blank")
// - Image uses aspectRatio: '16/9' and objectFit: 'cover' (full width, no black bars)
// - decodeHtmlEntities for title/description (fixes &#039; display)
// ═══════════════════════════════════════════════════════════════════════════

function LinkPreviewCard({ url }) {
    const { openExternal } = useExternalLink();
    const [metadata, setMetadata] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!url) return;

        const fetchMetadata = async () => {
            try {
                const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
                const data = await response.json();
                setMetadata(data);
            } catch (error) {
                console.error('Failed to fetch link metadata:', error);
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
                }}>⏳ Loading preview...</div>
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
// 🎬 FULL SCREEN VIDEO VIEWER - TikTok/Reels style immersive viewer
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
            >✕</button>

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

            {/* Play/Pause Overlay */}
            {!isPlaying && (
                <div
                    onClick={togglePlay}
                    style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: 36, color: 'white'
                    }}
                >▶</div>
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
                }}>❤️</button>

                <button onClick={onComment} style={{
                    background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)',
                    border: 'none', borderRadius: '50%', width: 48, height: 48,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', fontSize: 22
                }}>💬</button>

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

function PostCreator({ user, onPost, isPosting, onGoLive }) {
    const [content, setContent] = useState('');
    const [media, setMedia] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionResults, setMentionResults] = useState([]);
    const [showMentions, setShowMentions] = useState(false);
    const [cursorPosition, setCursorPosition] = useState(0);
    // 🔗 LINK PREVIEW STATE - Facebook-style auto-detect
    const [linkPreview, setLinkPreview] = useState(null); // { url, title, image, domain }
    const [linkLoading, setLinkLoading] = useState(false);
    const fileRef = useRef(null);
    const inputRef = useRef(null);
    const mentionTimeout = useRef(null);
    const linkTimeout = useRef(null);

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
            const path = `${isVideo ? 'videos' : 'photos'}/${user.id}/${Date.now()}_${file.name}`;
            const { error: upErr } = await supabase.storage.from('social-media').upload(path, file);
            if (!upErr) {
                const { data } = supabase.storage.from('social-media').getPublicUrl(path);
                uploaded.push({ type: isVideo ? 'video' : 'photo', url: data.publicUrl });
            }
        }
        setMedia(prev => [...prev, ...uploaded]);
        setUploading(false);
    };

    // Handle @mention detection AND auto URL detection (Facebook-style)
    const handleContentChange = (e) => {
        const value = e.target.value;
        const pos = e.target.selectionStart;

        // 🔗 AUTO-DETECT URLs - Facebook-style: remove URL and show preview card
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

    // ⚠️ CRITICAL: handlePost - Core posting functionality
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

        // 🔗 USE LINK PREVIEW if available (Facebook-style - URL already extracted)
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
        console.log('[PostCreator] 📤 About to call onPost with linkPreview:', JSON.stringify(linkPreview, null, 2));
        const ok = await onPost(cleanContent, urls, type, mentions, linkPreview);
        if (ok) { setContent(''); setMedia([]); setLinkPreview(null); }
        else setError('Unable to post at this time. Please try again later.');
    };

    return (
        <div style={{ background: C.card, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', marginBottom: 2, position: 'relative' }}>
            <div style={{ padding: 12, display: 'flex', gap: 8 }}>
                <Link href="/hub/profile" style={{ display: 'block', cursor: 'pointer' }}>
                    <Avatar src={user?.avatar} name={user?.name} size={40} />
                </Link>
                <div style={{ flex: 1, position: 'relative' }}>
                    <input
                        ref={inputRef}
                        value={content}
                        onChange={handleContentChange}
                        placeholder={`What's on your mind, ${user?.name || 'Player'}?`}
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
                                >✕</button>
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
            {/* 🔗 LINK PREVIEW CARD - Facebook-style */}
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
                                <div style={{ marginTop: 8 }}>Loading preview...</div>
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
                                            {linkPreview.type === 'video' ? '🎬' : '🔗'}
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
                                >✕</button>
                            </>
                        )}
                    </div>
                </div>
            )}
            {error && <div style={{ padding: '0 12px 8px', color: C.red, fontSize: 13 }}>⚠️ {error}</div>}
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
            const { data, error } = await supabase.from('social_comments').insert({ post_id: post.id, author_id: currentUserId, content: newComment }).select('id, content, created_at').single();
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
                            <span style={{ fontSize: 10, background: '#FFD700', color: '#000', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>👑 GOD</span>
                        )}
                        <button onClick={() => onDelete(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 16 }}>🗑️</button>
                    </div>
                )}
            </div>
            {post.content && (
                <div style={{ padding: '0 12px 12px', color: C.text, fontSize: 15, lineHeight: 1.4 }}>
                    {(() => {
                        // For link-type posts, strip URLs from displayed content (Facebook-style)
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
                            <img src={post.mediaUrls[0]} alt="" style={{ width: '100%', height: 'auto', maxHeight: 500, objectFit: 'cover', display: 'block' }} />
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
            <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', color: C.textSec, fontSize: 13 }}>
                <span>{likeCount > 0 && `👍 ${likeCount}`}</span>
                <span style={{ cursor: 'pointer' }} onClick={handleToggleComments}>{commentCount > 0 && `${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`}</span>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, display: 'flex' }}>
                <button onClick={handleLike} style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: liked ? C.blue : C.textSec, fontWeight: 500, fontSize: 13 }}>👍 {liked ? 'Liked' : 'Like'}</button>
                <button onClick={handleToggleComments} style={{ flex: 1, padding: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: showComments ? C.blue : C.textSec, fontWeight: 500, fontSize: 13 }}>💬 Comment</button>
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
                >{bookmarked ? '🔖' : '📑'} Save</button>
            </div>
            {showComments && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
                    {loadingComments && <div style={{ color: C.textSec, fontSize: 13 }}>Loading comments...</div>}
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
                        <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSubmitComment()} placeholder="Write a comment..." style={{ flex: 1, padding: '8px 14px', borderRadius: 18, border: 'none', background: C.bg, fontSize: 14, outline: 'none' }} />
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
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
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

function ContactsSidebar({ contacts, onOpenChat, onSearch, searchResults }) {
    const [q, setQ] = useState('');
    return (
        <aside style={{ width: 200, position: 'sticky', top: 70, height: 'fit-content' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: C.textSec }}>Contacts</h4>
            <input value={q} onChange={e => { setQ(e.target.value); onSearch(e.target.value); }} placeholder="🔍 Search..." style={{ width: '100%', padding: '8px 10px', borderRadius: 20, border: 'none', background: C.bg, fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
            {q.length >= 2 && searchResults.length > 0 && searchResults.map(u => (
                <div key={u.id} onClick={() => onOpenChat(u)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', borderRadius: 6 }}>
                    <Avatar name={u.username} size={32} /><span style={{ fontSize: 13 }}>{u.username}</span>
                </div>
            ))}
            {contacts.length === 0 ? <p style={{ color: C.textSec, fontSize: 12, textAlign: 'left', margin: 0 }}>No contacts yet</p> : contacts.map(c => (
                <div key={c.id} onClick={() => onOpenChat(c)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', borderRadius: 6 }}>
                    <Avatar src={c.avatar} name={c.name} size={36} online={c.online} /><span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                </div>
            ))}
        </aside>
    );
}

export default function SocialMediaPage() {
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
    const [showMoreMenu, setShowMoreMenu] = useState(false);
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

    // ♾️ INFINITE SCROLL STATE
    const [feedOffset, setFeedOffset] = useState(0);
    const [hasMorePosts, setHasMorePosts] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [feedCycle, setFeedCycle] = useState(0); // Track how many times we've looped
    const [seenPostIds, setSeenPostIds] = useState(new Set()); // Track seen posts for variety
    const POSTS_PER_PAGE = 20;
    const MAX_FEED_CYCLES = 10; // Maximum loops before truly ending (shows tons of content)

    // 👑 GOD MODE STATE
    const [isGodMode, setIsGodMode] = useState(false);

    // Global unread message count
    const { unreadCount } = useUnreadCount();

    // 📺 LIVE STREAMING STATE
    const [liveStreams, setLiveStreams] = useState([]);
    const [watchingStream, setWatchingStream] = useState(null);

    // 🎬 INTRO VIDEO STATE - Video plays while page loads in background
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
                        const { data: sessionData } = await supabase.auth.getSession();
                        if (sessionData?.session?.user) {
                            authUser = sessionData.session.user;
                            console.log('[Social] ✅ Got user from getSession:', authUser.email);
                        }
                    } catch (e) {
                        console.warn('[Social] getSession failed:', e.message);
                    }
                }

                if (authUser) {
                    // Check for profile by id OR by owner_id (allows login access to owned profiles)
                    let { data: p } = await supabase.from('profiles').select('id, username, full_name, display_name_preference, skill_tier, avatar_url, hendon_url, hendon_total_cashes, hendon_total_earnings, hendon_best_finish, role').eq('id', authUser.id).maybeSingle();
                    // If no profile found by id, check if user owns another profile via owner_id
                    if (!p) {
                        const { data: ownedProfile } = await supabase.from('profiles').select('id, username, full_name, display_name_preference, skill_tier, avatar_url, hendon_url, hendon_total_cashes, hendon_total_earnings, hendon_best_finish, role').eq('owner_id', authUser.id).maybeSingle();
                        if (ownedProfile) p = ownedProfile;
                    }
                    // 👑 Check for God Mode
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
                    const { data: notifs } = await supabase.from('notifications')
                        .select('*')
                        .eq('user_id', authUser.id)
                        .order('created_at', { ascending: false })
                        .limit(20);
                    if (notifs && notifs.length > 0) {
                        // Collect actor IDs from notifications
                        // The data is stored in the 'data' JSONB column: data.actor_id (social) or data.sender_id (friend requests)
                        const actorIds = [...new Set(notifs.map(n =>
                            n.data?.actor_id || n.data?.sender_id || n.actor_id
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
                            const actorId = n.data?.actor_id || n.data?.sender_id || n.actor_id;
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

    // 🔔 AUTO-MARK NOTIFICATIONS AS READ when dropdown opens
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
                        const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
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

            // Use native fetch directly to Supabase REST API
            try {
                const supabaseUrl = 'https://kuklfnapbkmacvwxktbh.supabase.co';
                const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

                const queryParams = new URLSearchParams({
                    select: 'id,content,content_type,media_urls,like_count,comment_count,share_count,created_at,author_id,link_url,link_title,link_description,link_image,link_site_name',
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

            // 📈 FACEBOOK-STYLE RANKING: Score posts by relevance
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

            // Sort by score (Facebook-style ranking)
            mixedFeed.sort((a, b) => b.score - a.score);

            // Fetch author profiles using native fetch to avoid AbortError
            if (mixedFeed.length > 0) {
                const authorIds = [...new Set(mixedFeed.map(p => p.author_id).filter(Boolean))];
                let authorMap = {};
                if (authorIds.length) {
                    try {
                        console.log('[Social] Fetching profiles for', authorIds.length, 'authors');
                        const profilesRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=in.(${authorIds.join(',')})&select=id,username,full_name,display_name_preference,avatar_url`, {
                            headers: {
                                'apikey': supabaseKey,
                                'Authorization': `Bearer ${supabaseKey}`
                            }
                        });

                        if (!profilesRes.ok) {
                            console.error('[Social] Profile fetch failed:', profilesRes.status, await profilesRes.text());
                        } else {
                            const profiles = await profilesRes.json();
                            console.log('[Social] ✅ Loaded', profiles.length, 'profiles');
                            if (profiles) authorMap = Object.fromEntries(profiles.map(p => [p.id, p]));
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
                    author: {
                        // Respect display_name_preference: 'full_name' shows full name, 'username' shows username
                        name: (() => {
                            const a = authorMap[p.author_id];
                            if (!a) return 'Player';
                            const pref = a.display_name_preference || 'full_name';
                            if (pref === 'username') return a.username || a.full_name || 'Player';
                            return a.full_name || a.username || 'Player';
                        })(),
                        username: authorMap[p.author_id]?.username || null,
                        avatar: authorMap[p.author_id]?.avatar_url || null
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
        console.log('[Social] 📝 handlePost called with:', { content: content?.substring(0, 50), urls, type, mentions, hasLinkPreview: !!linkPreview });
        console.log('[Social] 📝 linkPreview FULL OBJECT:', JSON.stringify(linkPreview, null, 2));
        console.log('[Social] 📝 User state:', { id: user?.id, name: user?.name, hasUser: !!user });

        if (!user?.id) {
            console.error('[Social] ❌ Cannot post: user.id is missing!', user);
            return false;
        }

        setIsPosting(true);
        try {
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
                console.log('[Social] 📝 Adding link metadata from preview:', linkPreview);
                insertPayload.link_url = linkPreview.url || urls[0];
                insertPayload.link_title = linkPreview.title || null;
                insertPayload.link_description = linkPreview.description || null;
                insertPayload.link_image = linkPreview.image || null;
                insertPayload.link_site_name = linkPreview.domain || null;
            }

            console.log('[Social] 📝 FINAL insert payload:', JSON.stringify(insertPayload, null, 2));

            const { data, error } = await supabase.from('social_posts').insert(insertPayload).select().single();

            if (error) {
                console.error('[Social] ❌ Supabase insert error:', error.message, error.details, error.hint, error.code);
                throw error;
            }

            console.log('[Social] ✅ Post created successfully:', data?.id);

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

            // AUTO-SAVE VIDEOS TO REELS 🎬
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
                    console.log('🎬 Video auto-saved to Reels!');
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

            // Scroll to top of feed so user sees their new post immediately (Facebook behavior)
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
            const { data: { session } } = await supabase.auth.getSession();
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
            const { data } = await supabase.from('social_conversation_participants').select('conversation_id, social_conversations(last_message_preview)').eq('user_id', userId);
            if (!data) return;
            const list = await Promise.all(data.map(async c => {
                const { data: parts } = await supabase.from('social_conversation_participants').select('user_id').eq('conversation_id', c.conversation_id).neq('user_id', userId);
                if (!parts?.[0]) return null;
                const { data: prof } = await supabase.from('profiles').select('username').eq('id', parts[0].user_id).maybeSingle();
                return { id: parts[0].user_id, name: prof?.username || 'Player', avatar: null, conversationId: c.conversation_id, lastMessage: c.social_conversations?.last_message_preview, online: false };
            }));
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
            {/* 🎬 INTRO VIDEO OVERLAY - Plays while page loads behind it */}
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
                            objectFit: 'cover'
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
            <Head>
                <title>Social Hub | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <style>{`
                    /* Facebook-style Responsive Layout - NO ZOOM, proper mobile sizing */
                    html, body { 
                        background: ${C.bg} !important; 
                        margin: 0;
                        padding: 0;
                    }
                    
                    .social-page-container {
                        width: 100%;
                        max-width: 680px;
                        margin: 0 auto;
                        min-height: 100vh;
                        overflow-x: hidden;
                    }
                    
                    /* Mobile-first: Full width on phones, centered on larger screens */
                    @media (max-width: 680px) {
                        .social-page-container {
                            max-width: 100%;
                            padding: 0;
                        }
                    }
                    
                    /* Desktop: Centered column with max-width */
                    @media (min-width: 681px) {
                        .social-page-container {
                            padding: 0 16px;
                        }
                    }
                `}</style>
            </Head>

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
                    }}>✕</button>
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
                            <div style={{ fontSize: 13, color: C.textSec }}>View your profile</div>
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
                                <span style={{ fontSize: 24 }}>🏆</span>
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
                                    <div style={{ color: '#00d4ff', fontSize: 18, fontWeight: 700 }}>${user.hendon.biggestCash?.toLocaleString() || user.hendon.bestFinish || '—'}</div>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}>BIGGEST CASH</div>
                                </div>
                            </div>
                        </div>
                    </Link>
                )}

                {/* Your Shortcuts */}
                <div style={{ padding: '0 16px', marginBottom: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: C.textSec, marginBottom: 12 }}>Your shortcuts</h4>
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

                {/* See More - Expandable Section */}
                <div style={{ padding: '0 16px', marginBottom: 16 }}>
                    <button
                        onClick={() => setShowMoreMenu && setShowMoreMenu(!showMoreMenu)}
                        style={{
                            width: '100%', padding: 12, background: '#e4e6eb', border: 'none',
                            borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', color: '#1c1e21',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                        }}
                    >
                        {showMoreMenu ? 'See less' : 'See more'}
                        <span style={{ transform: showMoreMenu ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                    </button>

                    {/* Expandable Items */}
                    {showMoreMenu && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
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
                            <Link href="/hub/notifications" onClick={() => setSidebarOpen(false)} style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '14px 12px',
                                background: '#fff', borderRadius: 8, textDecoration: 'none', border: '1px solid #dadde1'
                            }}>
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
                                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" fill="#f5a623" />
                                    <path d="M13.73 21a2 2 0 01-3.46 0" stroke="#f5a623" strokeWidth="2" />
                                </svg>
                                <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1e21' }}>Notifications</span>
                            </Link>
                        </div>
                    )}
                </div>

                {/* Bottom Links */}
                <div style={{ padding: '0 16px' }}>
                    <Link href="/hub/help" onClick={() => setSidebarOpen(false)} style={{
                        padding: '12px 0', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textDecoration: 'none', color: 'inherit'
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
                        </svg>
                        <span style={{ flex: 1, fontSize: 15 }}>Help and support</span>
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

            <div style={{ minHeight: '100vh', background: '#0a0e1a', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif', paddingBottom: 70 }}>
                {/* Standard Hub Header with Hamburger Menu */}
                <UniversalHeader
                    pageDepth={1}
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
                                <span style={{ fontSize: 18 }}>🔍</span>
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
                                    >✕</button>
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
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                                        No results found for "{globalSearchQuery}"
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Notification Dropdown */}
                {showNotifications && (
                    <div style={{
                        position: 'fixed', top: 60, right: 12, width: 360, maxHeight: 480,
                        background: C.card, borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                        zIndex: 1000, overflowY: 'auto'
                    }}>
                        <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Notifications</h3>
                            <button
                                onClick={() => setShowNotifications(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}
                            >✕</button>
                        </div>
                        {notifications.length === 0 ? (
                            <div style={{ padding: 24, textAlign: 'center', color: C.textSec }}>
                                No notifications yet
                            </div>
                        ) : (
                            notifications.map(n => {
                                // Get action icon based on type
                                const actionIcon = n.type === 'like' ? '👍' : n.type === 'comment' ? '💬' : n.type === 'mention' ? '@' : n.type === 'friend_request' ? '👥' : n.type === 'live' ? '🔴' : '🔔';
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
                                            padding: 12, borderBottom: `1px solid ${C.border}`,
                                            display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
                                            background: n.read ? 'transparent' : 'rgba(24, 119, 242, 0.08)'
                                        }}
                                    >
                                        {/* Facebook-style avatar with action icon */}
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <img
                                                src={n.actor_avatar_url || n.metadata?.actor_avatar || '/default-avatar.png'}
                                                style={{
                                                    width: 56, height: 56, borderRadius: '50%',
                                                    objectFit: 'cover', border: '2px solid #ddd'
                                                }}
                                            />
                                            {/* Action type icon overlay */}
                                            <div style={{
                                                position: 'absolute', bottom: -2, right: -2,
                                                width: 24, height: 24, borderRadius: '50%',
                                                background: iconBg, border: '2px solid white',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 12
                                            }}>{actionIcon}</div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 14, color: C.text, lineHeight: 1.4 }}>
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
                )}

                {/* Main Feed - 800px Design Canvas */}
                <main className="social-page-container" style={{ padding: '8px' }}>
                    {/* Stories Bar */}
                    {user && <StoriesBar userId={user.id} userAvatar={user.avatar} />}

                    {/* Post Creator */}
                    {user && <PostCreator user={user} onPost={handlePost} isPosting={isPosting} onGoLive={() => setShowGoLiveModal(true)} />}

                    {/* Login prompt */}
                    {!user && (
                        <div style={{ background: C.card, borderRadius: 8, padding: 24, textAlign: 'center', marginBottom: 8 }}>
                            <p style={{ color: C.textSec, marginBottom: 12 }}>Log in to post and interact!</p>
                            <Link href="/auth/login" style={{
                                display: 'inline-block', padding: '10px 24px', background: C.blue,
                                color: 'white', borderRadius: 6, fontWeight: 600, textDecoration: 'none'
                            }}>Log In</Link>
                        </div>
                    )}

                    {/* 📺 LIVE STREAMS SECTION */}
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
                            <div style={{ fontSize: 48 }}>🌟</div>
                            <h3 style={{ color: C.text }}>No posts yet</h3>
                            <p>Be the first to share something!</p>
                        </div>
                    ) : (
                        <>
                            {/* Render posts with Reels carousel inserted after every 3 posts */}
                            {posts.map((p, index) => (
                                <>
                                    <PostCard
                                        key={p.id}
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
                                </>
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

                            <style jsx>{`
                                @keyframes spin {
                                    to { transform: rotate(360deg); }
                                }
                                @keyframes pulse {
                                    0%, 100% { opacity: 1; }
                                    50% { opacity: 0.5; }
                                }
                            `}</style>
                        </>
                    )}
                </main>

                {/* Bottom Navigation Bar - Facebook Style with SVG Icons */}
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
                    <Link href="/hub/club-arena" style={{
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
                    <Link href="/hub/notifications" style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', color: '#1877f2', flex: 1, padding: '6px 4px', minWidth: 50, position: 'relative'
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2a7 7 0 00-7 7c0 3.5-1.5 5.5-2.5 7-.3.4-.5.8-.5 1.2 0 .5.5.8 1 .8h18c.5 0 1-.3 1-.8 0-.4-.2-.8-.5-1.2-1-1.5-2.5-3.5-2.5-7a7 7 0 00-7-7z" />
                            <path d="M10 20a2 2 0 004 0" />
                        </svg>
                        {notifications.filter(n => !n.read).length > 0 && (
                            <div style={{ position: 'absolute', top: 2, right: 'calc(50% - 18px)', background: '#f02849', color: 'white', borderRadius: 10, minWidth: 18, height: 18, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, padding: '0 5px' }}>{notifications.filter(n => !n.read).length}</div>
                        )}
                        <span style={{ fontSize: 10, marginTop: 2, fontWeight: 600, color: '#1877f2' }}>Notifications</span>
                    </Link>
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
        </PageTransition>
    );
}
