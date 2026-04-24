/**
 * SharedVideoComponents — Extracted from social-media/index.js L214-811
 * VideoThumbnail, VideoPostWrapper, FullScreenVideoViewer
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SOCIAL_COLORS as C, isYouTubeUrl, getYouTubeVideoId, getYouTubeEmbedUrl, getYouTubeThumbnail } from '../../lib/socialHelpers';
import { useYouTubeErrorManager, YouTubeErrorOverlay } from '../../hooks/useYouTubeErrorManager';
import toast from '../../stores/toastStore';

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO THUMBNAIL - Robust with fallback for invalid YouTube IDs
// ═══════════════════════════════════════════════════════════════════════════

export function VideoThumbnail({ url, style = {}, onValidated }) {
    const [thumbnailError, setThumbnailError] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isValid, setIsValid] = useState(null);
    const imgRef = useRef(null);
    const thumbnailUrl = getYouTubeThumbnail(url);

    const FallbackUI = ({ showUnavailable = false }) => (
        <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: 'white', ...style
        }}>
            <span style={{ fontSize: 48, marginBottom: 8 }}></span>
            <span style={{ fontSize: 14, opacity: 0.8 }}>
                {showUnavailable ? 'Video Unavailable' : 'Video'}
            </span>
        </div>
    );

    if (thumbnailError || !thumbnailUrl) {
        return <FallbackUI showUnavailable={thumbnailError} />;
    }

    const handleLoad = (e) => {
        setIsLoaded(true);
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
                    width: '100%', height: '100%', objectFit: 'cover',
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
// VIDEO POST WRAPPER - Handles click behavior based on video validity
// ═══════════════════════════════════════════════════════════════════════════

export function VideoPostWrapper({ url, onValidVideoClick, children }) {
    const [isVideoValid, setIsVideoValid] = useState(null);

    const handleClick = () => {
        if (isVideoValid === false) {
            toast.error('This video is no longer available on YouTube.');
            return;
        }
        if (onValidVideoClick) onValidVideoClick(url);
    };

    return (
        <div
            onClick={handleClick}
            style={{
                position: 'relative',
                cursor: isVideoValid === false ? 'not-allowed' : 'pointer',
                aspectRatio: '16/9', maxHeight: 400,
                background: '#000', overflow: 'hidden'
            }}
        >
            {isYouTubeUrl(url) ? (
                <VideoThumbnail url={url} onValidated={(valid) => setIsVideoValid(valid)} />
            ) : children}

            {isVideoValid !== false && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.9)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#333', fontSize: 28, pointerEvents: 'none',
                    transition: 'transform 0.15s, background 0.15s'
                }}>▶</div>
            )}

            {isVideoValid === false && (
                <>
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 64, height: 64, borderRadius: '50%',
                        background: 'rgba(100,100,100,0.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#888', fontSize: 28, pointerEvents: 'none'
                    }}></div>
                    <div style={{
                        position: 'absolute', bottom: 8, left: 8,
                        background: 'rgba(200,50,50,0.8)',
                        padding: '4px 10px', borderRadius: 4,
                        color: 'white', fontSize: 12, fontWeight: 500
                    }}>Video unavailable</div>
                </>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL SCREEN VIDEO VIEWER - TikTok/Reels style immersive viewer
// ═══════════════════════════════════════════════════════════════════════════

export function FullScreenVideoViewer({ videoUrl, author, caption, onClose, onLike, onComment, onShare }) {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [showOverlay, setShowOverlay] = useState(false);
    const [showHeart, setShowHeart] = useState(false);
    const [progress, setProgress] = useState(0);
    const [shareToast, setShareToast] = useState(false);

    const overlayTimerRef = useRef(null);
    const touchStartRef = useRef({ x: 0, y: 0 });
    const lastTapRef = useRef(0);
    const progressRAF = useRef(null);

    // Centralized YouTube error management
    const ytVideoId = isYouTubeUrl(videoUrl) ? getYouTubeVideoId(videoUrl) : null;
    const { ytError: managedYtError, errorInfo, thumbnailUrl } = useYouTubeErrorManager({
        active: !!ytVideoId,
        videoId: ytVideoId,
        surface: 'FullScreenVideoViewer',
        autoActionDelay: 3000,
        onError: () => onClose?.(),
    });



    useEffect(() => {
        if (showOverlay && isPlaying) {
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2000);
        }
        return () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current); };
    }, [showOverlay, isPlaying]);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
            // Cancel any running progress RAF to prevent memory leak
            if (progressRAF.current) cancelAnimationFrame(progressRAF.current);
        };
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handleTouchStart = (e) => {
            touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        };
        const handleTouchEnd = (e) => {
            const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
            const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
            if (dy > 80 && Math.abs(dy) > Math.abs(dx)) { onClose(); }
        };
        el.addEventListener('touchstart', handleTouchStart, { passive: true });
        el.addEventListener('touchend', handleTouchEnd, { passive: true });
        return () => {
            el.removeEventListener('touchstart', handleTouchStart);
            el.removeEventListener('touchend', handleTouchEnd);
        };
    }, [onClose]);

    const handleTap = (e) => {
        const now = Date.now();
        const DOUBLE_TAP_WINDOW = 300;
        if (now - lastTapRef.current < DOUBLE_TAP_WINDOW) {
            onLike?.();
            try { navigator?.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            setShowHeart(true);
            setTimeout(() => setShowHeart(false), 800);
            lastTapRef.current = 0;
            return;
        }
        lastTapRef.current = now;

        // Single tap = reveal overlay + toggle play/pause simultaneously
        // BUG FIX: Previously first tap only showed overlay (no play/pause toggle),
        // requiring a second tap to actually play/pause the video.
        setShowOverlay(true);
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = setTimeout(() => setShowOverlay(false), 2000);

        const isYT = isYouTubeUrl(videoUrl);
        if (!isYT && videoRef.current) {
            if (videoRef.current.paused) {
                videoRef.current.play();
                setIsPlaying(true);
            } else {
                videoRef.current.pause();
                setIsPlaying(false);
                // Paused = anchor overlay (don't auto-hide)
                if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            }
        } else if (isYT) {
            const iframe = containerRef.current?.querySelector('iframe');
            if (iframe?.contentWindow) {
                if (!isPlaying) {
                    iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
                    setIsPlaying(true);
                } else {
                    iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
                    setIsPlaying(false);
                    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
                }
            }
        }
    };

    const updateProgress = () => {
        if (videoRef.current && videoRef.current.duration) {
            setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
        }
        progressRAF.current = requestAnimationFrame(updateProgress);
    };

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: '#000', zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={handleTap}
        >
            {/* Close Button */}
            <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                style={{
                    position: 'absolute', top: 16, left: 16, zIndex: 10001,
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
                    border: 'none', cursor: 'pointer', color: 'white', fontSize: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
            >×</button>

            {/* Video */}
            {isYouTubeUrl(videoUrl) ? (
                <div style={{ position: 'relative', width: '100vw', height: '100vh', pointerEvents: 'none' }}>
                    <iframe
                        src={`${getYouTubeEmbedUrl(videoUrl)}&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}`}
                        style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowFullScreen
                    />
                    {/* Age-restricted / unavailable video overlay */}
                    {managedYtError && (
                        <YouTubeErrorOverlay
                            errorCode={managedYtError}
                            videoId={getYouTubeVideoId(videoUrl)}
                            thumbnailUrl={thumbnailUrl}
                            actionLabel="Closing in 3 seconds..."
                            style={{ pointerEvents: 'auto' }}
                        />
                    )}
                </div>
            ) : (
                <video
                    ref={videoRef}
                    src={videoUrl}
                    autoPlay loop playsInline
                    style={{
                        maxWidth: '100%', maxHeight: '100%',
                        width: 'auto', height: '100%',
                        objectFit: 'contain', cursor: 'pointer'
                    }}
                    onPlay={() => { progressRAF.current = requestAnimationFrame(updateProgress); }}
                    onPause={() => { if (progressRAF.current) cancelAnimationFrame(progressRAF.current); }}
                />
            )}

            {/* Author Info */}
            <div style={{
                position: 'absolute', bottom: 80, left: 16, right: 16,
                color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
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

            {/* Bottom Overlay */}
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                    padding: '24px 12px 20px',
                    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
                    opacity: showOverlay ? 1 : 0,
                    pointerEvents: showOverlay ? 'auto' : 'none',
                    transition: 'opacity 0.3s ease', zIndex: 10002,
                }}
            >
                <button onClick={onLike} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white' }}>
                    <span style={{ fontSize: 24 }}>👍</span><span style={{ fontSize: 10, fontWeight: 500 }}>Like</span>
                </button>
                <button onClick={() => {}} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white' }}>
                    <span style={{ fontSize: 24 }}>👎</span><span style={{ fontSize: 10, fontWeight: 500 }}>Dislike</span>
                </button>
                <button onClick={onComment} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white' }}>
                    <span style={{ fontSize: 24 }}>💬</span><span style={{ fontSize: 10, fontWeight: 500 }}>Comment</span>
                </button>
                <button onClick={() => {}} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white' }}>
                    <span style={{ fontSize: 24 }}>🔖</span><span style={{ fontSize: 10, fontWeight: 500 }}>Save</span>
                </button>
                <button onClick={() => { onShare?.(); setShareToast(true); setTimeout(() => setShareToast(false), 2000); }} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white' }}>
                    <span style={{ fontSize: 24 }}>📤</span><span style={{ fontSize: 10, fontWeight: 500 }}>Share</span>
                </button>
                <button onClick={() => {}} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'white' }}>
                    <span style={{ fontSize: 24 }}>🤖</span><span style={{ fontSize: 10, fontWeight: 500 }}>Jarvis</span>
                </button>
            </div>

            {/* Double-tap heart */}
            {showHeart && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: 80, pointerEvents: 'none', zIndex: 10003,
                    animation: 'heartBurstFS 0.8s ease-out forwards',
                }}>❤️</div>
            )}

            {/* Progress bar */}
            {!isYouTubeUrl(videoUrl) && progress > 0 && (
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: 3, background: 'rgba(255,255,255,0.2)', zIndex: 10003,
                }}>
                    <div style={{
                        width: `${progress}%`, height: '100%',
                        background: 'linear-gradient(90deg, #FF2D55, #FF6B6B)',
                        transition: 'width 0.1s linear',
                    }} />
                </div>
            )}

            {/* Share Toast */}
            {shareToast && (
                <div style={{
                    position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(255,255,255,0.15)', color: 'white',
                    padding: '8px 20px', borderRadius: 20, fontSize: 14, zIndex: 10003,
                    backdropFilter: 'blur(10px)',
                }}>Link Copied</div>
            )}

            {/* Heart burst animation CSS */}
            <style>{`
                @keyframes heartBurstFS {
                    0% { opacity: 1; transform: translate(-50%, -50%) scale(0.3); }
                    50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
                }
            `}</style>

            {/* Paused indicator */}
            {!isPlaying && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.4)', border: '2px solid rgba(255,255,255,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 32, pointerEvents: 'none',
                }}>▶</div>
            )}
        </div>
    );
}
