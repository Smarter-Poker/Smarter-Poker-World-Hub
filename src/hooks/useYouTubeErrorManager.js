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

import { useState, useEffect, useCallback } from 'react';
import { getAccessToken } from '../lib/authUtils';
import styles from './YouTubeErrorOverlay.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────
const YOUTUBE_ORIGINS = Object.freeze([
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
    'https://youtube.com',
]);

// ── Error Code Registry (Improvement #5) ──────────────────────────────────────
const ERROR_CODES = {
    2:   { title: 'Invalid Video',          description: 'This Video ID Is Invalid Or Malformed.' },
    5:   { title: 'Playback Error',         description: 'This Video Cannot Play In The Current Browser.' },
    100: { title: 'Video Removed',          description: 'This Video Has Been Removed Or Made Private.' },
    101: { title: 'Embedding Disabled',     description: 'The Video Owner Has Disabled Embedding.' },
    150: { title: 'Age-Restricted Video',   description: 'This Video Requires Age Verification To Play.' },
};

function getErrorInfo(code) {
    return ERROR_CODES[code] || {
        title: 'Video Unavailable',
        description: 'This Video Cannot Be Embedded Right Now.',
    };
}

function formatOverlayActionLabel(value) {
    return String(value || '')
        .replace(/\b[a-z]/g, character => character.toUpperCase())
        .replace(/\.{3}$/u, '');
}

// ── Thumbnail URL Builder (Improvement #6) ────────────────────────────────────
function getYouTubeThumbnailUrl(videoId) {
    if (!videoId) return null;
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// ── Server-Side Failure Reporter (Improvement #2) ─────────────────────────────
const FAILURE_REPORT_CODES = new Set([100, 101, 150]);
const FAILURE_REPORT_RETRY_DELAYS_MS = Object.freeze([0, 250, 1000]);
const FAILURE_REPORT_COOLDOWN_MS = 30_000;
const FAILURE_REPORT_TIMEOUT_MS = 5_000;
const MAX_SUCCESSFUL_REPORTS = 1000;
const MAX_TRACKED_FAILURE_REPORTS = 1000;
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const failureReportInFlight = new Map();
const successfulFailureReports = new Set();
const failureReportCooldowns = new Map();

function waitForFailureReportRetry(delayMs) {
    return delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();
}

function rememberSuccessfulFailureReport(reportKey) {
    if (successfulFailureReports.size >= MAX_SUCCESSFUL_REPORTS) {
        successfulFailureReports.delete(successfulFailureReports.values().next().value);
    }
    successfulFailureReports.add(reportKey);
}

function rememberFailureReportCooldown(reportKey, cooldownUntil) {
    if (failureReportCooldowns.size >= MAX_TRACKED_FAILURE_REPORTS) {
        failureReportCooldowns.delete(failureReportCooldowns.keys().next().value);
    }
    failureReportCooldowns.set(reportKey, cooldownUntil);
}

// Fire-and-forget safe: callers may ignore the returned shared promise.
async function reportFailureToServer(videoId, errorCode, surface) {
    const code = Number(errorCode);
    const normalisedVideoId = String(videoId || '').trim();
    if (!YOUTUBE_VIDEO_ID_RE.test(normalisedVideoId) || !FAILURE_REPORT_CODES.has(code)) return false;

    const reportKey = `${normalisedVideoId}_${code}`;
    if (successfulFailureReports.has(reportKey)) return true;

    const existingRequest = failureReportInFlight.get(reportKey);
    if (existingRequest) return existingRequest;
    if (failureReportInFlight.size >= MAX_TRACKED_FAILURE_REPORTS) return false;

    const cooldownUntil = failureReportCooldowns.get(reportKey) || 0;
    if (cooldownUntil > Date.now()) return false;
    failureReportCooldowns.delete(reportKey);

    const request = (async () => {
        for (let attempt = 0; attempt < FAILURE_REPORT_RETRY_DELAYS_MS.length; attempt += 1) {
            await waitForFailureReportRetry(FAILURE_REPORT_RETRY_DELAYS_MS[attempt]);

            // Read on every attempt: the auth provider may have refreshed the
            // session while an earlier request was failing.
            const accessToken = getAccessToken();
            if (!accessToken) continue;

            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeout = controller
                ? setTimeout(() => controller.abort(), FAILURE_REPORT_TIMEOUT_MS)
                : null;
            try {
                const response = await fetch('/api/youtube/report-embed-failure', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({ videoId: normalisedVideoId, errorCode: code, surface }),
                    ...(controller ? { signal: controller.signal } : {}),
                });
                if (response.ok && response.status === 202) {
                    rememberSuccessfulFailureReport(reportKey);
                    failureReportCooldowns.delete(reportKey);
                    return true;
                }

                // Retrying malformed/forbidden requests cannot make them valid.
                if (response.status >= 400 && response.status < 500
                    && ![401, 408, 425, 429].includes(response.status)) {
                    break;
                }
            } catch {
                // Network failures and timeouts are retried within the bound.
            } finally {
                if (timeout) clearTimeout(timeout);
            }
        }

        rememberFailureReportCooldown(reportKey, Date.now() + FAILURE_REPORT_COOLDOWN_MS);
        return false;
    })();

    failureReportInFlight.set(reportKey, request);
    try {
        return await request;
    } finally {
        failureReportInFlight.delete(reportKey);
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

                    // Delivery dedupe/retry is module-wide so every video surface
                    // shares the same in-flight request and success memory.
                    if (videoId) {
                        void reportFailureToServer(videoId, errorCode, surface);
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
 * @param {string} props.actionLabel    - "Skipping In 3 Seconds" or "Closing In 3 Seconds"
 * @param {Object} props.style          - Additional positioning and interaction overrides
 */
export function YouTubeErrorOverlay({
    errorCode,
    videoId,
    videoUrl,
    thumbnailUrl,
    actionLabel = 'Skipping In 3 Seconds',
    style = {},
}) {
    if (!errorCode) return null;

    const { title, description } = getErrorInfo(errorCode);
    const watchUrl = videoUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
    const displayActionLabel = formatOverlayActionLabel(actionLabel);

    return (
        <div
            className={styles.overlay}
            style={style}
            role="alert"
            aria-live="polite"
            aria-atomic="true"
            data-youtube-error-code={errorCode}
        >
            {thumbnailUrl && (
                <img
                    className={styles.thumbnail}
                    src={thumbnailUrl}
                    alt=""
                    aria-hidden="true"
                    draggable="false"
                    onError={event => {
                        event.currentTarget.hidden = true;
                    }}
                />
            )}
            <div className={styles.scrim} aria-hidden="true" />

            <div className={styles.content}>
                <span className={styles.eyebrow}>Playback Command</span>
                <strong className={styles.title}>{title}</strong>
                <span className={styles.description}>{description}</span>

                {watchUrl && (
                    <a
                        className={styles.action}
                        href={watchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={event => event.stopPropagation()}
                        aria-label={`Watch ${title} On YouTube`}
                    >
                        Watch On YouTube
                    </a>
                )}

                {displayActionLabel ? (
                    <span className={styles.countdown}>{displayActionLabel}</span>
                ) : null}
            </div>
        </div>
    );
}

// ── Exports ───────────────────────────────────────────────────────────────────
export {
    YOUTUBE_ORIGINS,
    ERROR_CODES,
    formatOverlayActionLabel,
    getErrorInfo,
    getYouTubeThumbnailUrl,
    reportFailureToServer,
};
export default useYouTubeErrorManager;
