/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  useYouTubeErrorManager — Centralized YouTube Error Detection & Recovery ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  Consolidates YouTube postMessage error handling across all 8 social     ║
 * ║  video surfaces into a single hook. Features:                           ║
 * ║                                                                         ║
 * ║  1. DRY postMessage listener with strict origin validation              ║
 * ║  2. Error code-specific messaging (150, 100, 101, 2, 5)                 ║
 * ║  3. Server-side failure reporting to Supabase                           ║
 * ║  5. Thumbnail fallback background for error overlays                    ║
 * ║  6. Reusable <YouTubeErrorOverlay /> component                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────
const YOUTUBE_ORIGINS = Object.freeze([
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
    'https://youtube.com',
]);

// ── Error Code Registry (Improvement #5) ──────────────────────────────────────
const ERROR_CODES = {
    2:   { title: 'Invalid Video',          description: 'This video ID is invalid or malformed.' },
    5:   { title: 'Playback Error',         description: 'This video cannot play in the current browser.' },
    100: { title: 'Video Removed',          description: 'This video has been removed or made private.' },
    101: { title: 'Embedding Disabled',     description: 'The video owner has disabled embedding.' },
    150: { title: 'Age-Restricted Video',   description: 'This video requires age verification to play.' },
};

function getErrorInfo(code) {
    return ERROR_CODES[code] || { title: 'Video Unavailable', description: 'This video cannot be embedded right now.' };
}

// ── Thumbnail URL Builder (Improvement #6) ────────────────────────────────────
function getYouTubeThumbnailUrl(videoId) {
    if (!videoId) return null;
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// ── Server-Side Failure Reporter (Improvement #2) ─────────────────────────────
// Fire-and-forget — never blocks UI or throws
async function reportFailureToServer(videoId, errorCode, surface) {
    try {
        await fetch('/api/youtube/report-embed-failure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId, errorCode, surface }),
        });
    } catch {
        // Silent — reporting is best-effort, never block UX
    }
}

// ── Main Hook ─────────────────────────────────────────────────────────────────
/**
 * @param {Object} options
 * @param {boolean} options.active        — Whether to listen for messages (e.g., only when viewer is open)
 * @param {string}  options.videoId       — Current YouTube video ID (for reporting + thumbnail)
 * @param {string}  options.surface       — Component name for telemetry (e.g., 'Reels', 'Stories', 'VideoLibrary')
 * @param {Function} options.onError      — Optional callback fired when an error is detected
 * @param {Function} options.onStateChange — Optional callback for YouTube state changes (0=ended, 1=playing, 2=paused)
 * @param {Object} options.iframeRef     — Optional ref used to reject events from stale/unrelated players
 * @param {number}  options.autoActionDelay — Milliseconds before auto-action (default: 3000). Set 0 to disable.
 * @param {'advance'|'close'} options.autoAction — What to do after delay: 'advance' (call onError) or 'close'
 * @returns {{ ytError, clearError, errorInfo, thumbnailUrl }}
 */
export function useYouTubeErrorManager({
    active = true,
    videoId = null,
    surface = 'Unknown',
    onError = null,
    onStateChange = null,
    onPlaybackInfo = null,
    iframeRef = null,
    autoActionDelay = 3000,
    autoAction = 'advance',
} = {}) {
    const [ytError, setYtError] = useState(null);
    const reportedRef = useRef(new Set()); // Prevent duplicate reports per video

    // Clear error (exposed for external reset, e.g., on reel change)
    const clearError = useCallback(() => setYtError(null), []);

    // Clear error when videoId changes
    useEffect(() => {
        setYtError(null);
    }, [videoId]);

    // ── Core postMessage listener ─────────────────────────────────────────────
    useEffect(() => {
        if (!active) return;

        const handleYTMessage = (e) => {
            // Strict origin validation (Security)
            if (!YOUTUBE_ORIGINS.includes(e.origin)) return;
            if (iframeRef?.current?.contentWindow && e.source !== iframeRef.current.contentWindow) return;

            try {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                if (!data?.event) return;

                // Forward state changes (playing/paused/ended)
                if (data.event === 'onStateChange' && onStateChange) {
                    onStateChange(data.info);
                }
                if (data.event === 'infoDelivery' && onPlaybackInfo && data.info) {
                    onPlaybackInfo(data.info);
                }

                // Error detection with type coercion guard
                if (data.event === 'onError' && data?.info) {
                    const errorCode = Number(data.info);
                    if (!errorCode) return; // Filter out info: 0

                    console.warn(`[${surface}] YouTube error:`, errorCode, videoId ? `(${videoId})` : '');
                    setYtError(errorCode);

                    // Report to server (once per video per session)
                    const reportKey = `${videoId || 'unknown'}_${errorCode}`;
                    if (videoId && !reportedRef.current.has(reportKey)) {
                        reportedRef.current.add(reportKey);
                        reportFailureToServer(videoId, errorCode, surface);
                    }

                    // NOTE: onError is NOT called here — the auto-action timer (below)
                    // fires it after autoActionDelay, giving the user time to see the overlay.
                    // Calling it here would cause double-advance in sequential surfaces.
                }
            } catch {
                // Non-JSON or malformed — ignore silently
            }
        };

        window.addEventListener('message', handleYTMessage);
        return () => window.removeEventListener('message', handleYTMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError removed: it's handled by auto-action timer, not this effect
    }, [active, videoId, surface, onStateChange, onPlaybackInfo, iframeRef]);

    // ── Auto-action timer (advance/close) ─────────────────────────────────────
    useEffect(() => {
        if (!ytError || !autoActionDelay) return;
        const timer = setTimeout(() => {
            onError?.(ytError); // Signal parent to advance/close
        }, autoActionDelay);
        return () => clearTimeout(timer);
    }, [ytError, autoActionDelay, onError]);

    // ── Derived values ────────────────────────────────────────────────────────
    const errorInfo = ytError ? getErrorInfo(ytError) : null;
    const thumbnailUrl = videoId ? getYouTubeThumbnailUrl(videoId) : null;

    return {
        ytError,
        clearError,
        errorInfo,       // { title, description } based on error code
        thumbnailUrl,     // YouTube thumbnail for background
    };
}

// ── Reusable Error Overlay Component ──────────────────────────────────────────
/**
 * Drop-in error overlay for any YouTube embed surface.
 *
 * @param {Object} props
 * @param {number} props.errorCode      — YouTube error code (150, 100, etc.)
 * @param {string} props.videoId        — YouTube video ID for CTA link + thumbnail
 * @param {string} props.videoUrl       — Full YouTube URL (fallback for CTA)
 * @param {string} props.thumbnailUrl   — Thumbnail URL for background
 * @param {string} props.actionLabel    — "Skipping in 3 seconds..." or "Closing in 3 seconds..."
 * @param {Object} props.style          — Additional style overrides
 */
export function YouTubeErrorOverlay({
    errorCode,
    videoId,
    videoUrl,
    thumbnailUrl,
    actionLabel = 'Skipping in 3 seconds...',
    style = {},
}) {
    if (!errorCode) return null;

    const { title, description } = getErrorInfo(errorCode);
    const watchUrl = videoUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);

    return (
        <div style={{
            position: 'absolute', inset: 0, zIndex: 50,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 16,
            // Thumbnail background with dark overlay (Improvement #6)
            background: thumbnailUrl
                ? `linear-gradient(135deg, rgba(10,10,20,0.92) 0%, rgba(20,20,30,0.95) 100%)`
                : 'linear-gradient(135deg, rgba(20,20,30,0.97) 0%, rgba(10,10,20,0.99) 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            ...style,
        }}>
            {/* Thumbnail background layer */}
            {thumbnailUrl && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: -1,
                    backgroundImage: `url(${thumbnailUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(20px) brightness(0.3)',
                }} />
            )}

            {/* Warning icon */}
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>

            {/* Error title (Improvement #5: code-specific) */}
            <div style={{ color: 'white', fontSize: 18, fontWeight: 700, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                {title}
            </div>

            {/* Error description */}
            <div style={{
                color: 'rgba(255,255,255,0.6)', fontSize: 13,
                maxWidth: 280, textAlign: 'center',
                textShadow: '0 1px 4px rgba(0,0,0,0.5)',
            }}>
                {description}
            </div>

            {/* Watch on YouTube CTA */}
            {watchUrl && (
                <a
                    href={watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '12px 28px', borderRadius: 8,
                        background: '#FF0000', color: 'white',
                        fontWeight: 700, fontSize: 15, textDecoration: 'none',
                        boxShadow: '0 4px 20px rgba(255,0,0,0.4)',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(255,0,0,0.6)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(255,0,0,0.4)'; }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                        <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z" />
                    </svg>
                    Watch On YouTube
                </a>
            )}

            {/* Auto-action countdown */}
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 4 }}>
                {actionLabel}
            </div>
        </div>
    );
}

// ── Exports ───────────────────────────────────────────────────────────────────
export { YOUTUBE_ORIGINS, ERROR_CODES, getErrorInfo, getYouTubeThumbnailUrl, reportFailureToServer };
export default useYouTubeErrorManager;
