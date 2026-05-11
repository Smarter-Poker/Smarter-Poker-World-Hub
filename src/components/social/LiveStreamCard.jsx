/* ═══════════════════════════════════════════════════════════════════════════
   LIVE STREAM CARD v3 — Lightweight looping preview clip in social feed

   BUG-FIX-LIVE-5 (per Dan: "couldn't we make it as a streaming loop? or a
   preview video that is just auto playing? make it like a video thats looping
   for users to click instead of downloading a whole stream").

   v2 opened a per-card LiveKit WHEP connection. With N live broadcasters in
   the feed, that was N concurrent WebRTC connections per viewer device —
   battery, data, and CPU disaster on mobile.

   v3 reads `preview_clip_url` from the live_streams row — a rolling ~12s clip
   uploaded every 25s by StreamPreviewCapture on the broadcaster side. The
   feed card is now a plain `<video autoplay muted loop playsinline>`.

   • CDN-cacheable static MP4/WebM
   • No tokens, no auth, no realtime
   • Browser caches and loops the file for free
   • Cache-busted by appending `?t=preview_updated_at` so the card refreshes
     when the broadcaster's clip rolls forward.

   First clip lands ~25s into the broadcast — until then we show the static
   thumbnail (graceful cold-start). On older Safari versions where WebM/VP9
   playback fails, the video element silently does nothing and the thumbnail
   underneath remains visible. Tap-to-open behavior is unchanged.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef, useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

const C = {
    card: '#FFFFFF',
    text: '#050505',
    textSec: '#65676B',
    border: '#DADDE1',
    red: '#FA383E',
};

// STREAM-BUG-4: Module-scope cache so multiple cards for the same stream
// don't each re-query the same row. Keyed by stream id, value is
// { preview_clip_url, preview_updated_at }. Implicitly cleared on page reload.
const _previewCache = new Map();

/**
 * @param {object} props
 * @param {object} props.stream  — live_streams row (id, title, thumbnail_url,
 *                                  preview_clip_url, preview_updated_at,
 *                                  viewer_count, broadcaster?, profiles?)
 * @param {() => void} props.onClick — tap handler (opens viewer)
 * @param {boolean} [props.inlineAutoplay] — kept for API compat; preview now
 *                                            autoplays unconditionally
 */
export function LiveStreamCard({ stream, onClick }) {
    const [isHovered, setIsHovered] = useState(false);
    const [previewLoaded, setPreviewLoaded] = useState(false);
    const [previewFailed, setPreviewFailed] = useState(false);
    // BUG-FIX-DEEP-AUDIT-R4 LSC-4: track thumbnail load failure so a 404
    // on the static thumbnail URL falls back to the gradient placeholder
    // rather than displaying a broken-image icon. Mirrors the avatar's
    // onError pattern below.
    const [thumbnailFailed, setThumbnailFailed] = useState(false);
    // RIGOR-AUDIT-2 LSC-1: pause off-screen preview videos. With 8+ live
    // broadcasters in the feed, decoding all 8 MP4s simultaneously was a
    // CPU/battery drain on mobile — same class of bug the v2→v3 rewrite
    // was meant to solve (the file header documents it).
    const [isInView, setIsInView] = useState(false);
    const videoRef = useRef(null);
    const wrapperRef = useRef(null);

    // STREAM-BUG-4: lazy-fetched preview clip data. The feed render at
    // pages/hub/social-media/index.js passes only { id, thumbnail_url, title }
    // to LiveStreamCard, so without fetching the live_streams row we never
    // have a preview_clip_url and the <video> stays hidden — Dan's symptom
    // ("no preview was playing, only the small live box"). When the caller
    // already provides preview_clip_url we skip the fetch entirely.
    const initialCached = stream.id ? _previewCache.get(stream.id) : null;
    const [fetched, setFetched] = useState(initialCached || null);

    useEffect(() => {
        // Skip if caller already provided preview, or we have nothing to query.
        if (stream.preview_clip_url) return;
        if (!stream.id) return;
        const cached = _previewCache.get(stream.id);
        if (cached) {
            setFetched(cached);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const { data, error } = await supabase
                    .from('live_streams')
                    .select('preview_clip_url, preview_updated_at')
                    .eq('id', stream.id)
                    .maybeSingle();
                if (cancelled) return;
                if (error || !data) return;
                _previewCache.set(stream.id, data);
                setFetched(data);
            } catch (_) { /* non-fatal — thumbnail fallback already covers this */ }
        })();
        return () => { cancelled = true; };
    }, [stream.id, stream.preview_clip_url]);

    // Resolve the effective preview values from prop or fetched state.
    const effClipUrl = stream.preview_clip_url || fetched?.preview_clip_url || null;
    const effUpdatedAt = stream.preview_updated_at || fetched?.preview_updated_at || null;

    // Cache-buster: when preview_updated_at advances, the URL changes and the
    // browser fetches the fresh clip. Memoised so we don't churn the <video>
    // src on unrelated re-renders.
    //
    // BUG-FIX-DEEP-AUDIT-R4 LSC-5: detect existing query string. Signed
    // CDN URLs may already contain a `?` (e.g. `?signed=xyz`); appending
    // another `?` yields a malformed URL. Use `&` when one is present.
    const previewSrc = useMemo(() => {
        if (!effClipUrl) return null;
        if (!effUpdatedAt) return effClipUrl;
        const sep = effClipUrl.includes('?') ? '&' : '?';
        return `${effClipUrl}${sep}t=${encodeURIComponent(effUpdatedAt)}`;
    }, [effClipUrl, effUpdatedAt]);

    // Reset preview state when src changes (e.g. broadcaster's rolling clip
    // moved to a new window).
    useEffect(() => {
        setPreviewLoaded(false);
        setPreviewFailed(false);
        // BUG-FIX-DEEP-AUDIT-R4 LSC-4: reset thumbnail-failed flag too, so
        // a card that recovers from a 404 (e.g. CDN warm-up race) tries
        // again on the next render cycle.
        setThumbnailFailed(false);
    }, [previewSrc]);

    // RIGOR-AUDIT-2 LSC-1: Observe whether the card is on screen. When off
    // screen, pause the <video> so it doesn't decode. When back on screen,
    // resume play. The observer disconnects on unmount.
    useEffect(() => {
        const node = wrapperRef.current;
        if (!node || typeof IntersectionObserver === 'undefined') {
            // No IO support (very old browsers) — assume always in view,
            // which preserves prior behaviour.
            setIsInView(true);
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    setIsInView(entry.isIntersecting);
                }
            },
            { rootMargin: '100px', threshold: 0.1 },  // 100px buffer so it preloads just before scroll into view
        );
        io.observe(node);
        return () => io.disconnect();
    }, []);

    // Drive video play/pause from isInView. Browsers may auto-pause muted
    // videos when off screen anyway, but this is explicit and reliable.
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        if (isInView && previewSrc) {
            // play() returns a Promise that rejects on autoplay policy
            // violations (rare for muted+playsinline). Swallow it — failure
            // means the static thumbnail underneath stays visible.
            v.play?.().catch(() => {});
        } else {
            try { v.pause?.(); } catch (_) {}
        }
    }, [isInView, previewSrc]);

    const showPreviewVideo = !!previewSrc && previewLoaded && !previewFailed && isInView;
    // BUG-FIX-DEEP-AUDIT-R4 LSC-4: gate thumbnail render on !thumbnailFailed.
    const showThumbnail = !showPreviewVideo && stream.thumbnail_url && !thumbnailFailed;

    return (
        <div
            ref={wrapperRef}
            onClick={onClick}
            style={{
                background: C.card,
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: isHovered
                    ? '0 4px 16px rgba(0,0,0,0.18)'
                    : '0 1px 2px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* ── Preview clip / thumbnail ── */}
            <div
                style={{
                    position: 'relative',
                    aspectRatio: '16/9',
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                    overflow: 'hidden',
                }}
            >
                {/* Static thumbnail — always rendered as a poster behind the video */}
                {showThumbnail && (
                    <img
                        src={stream.thumbnail_url}
                        alt={stream.title || 'Live stream'}
                        onError={() => setThumbnailFailed(true)}
                        style={{
                            position: 'absolute', inset: 0,
                            width: '100%', height: '100%',
                            objectFit: 'cover',
                        }}
                    />
                )}

                {/* Placeholder icon when no thumbnail AND no preview clip */}
                {!showPreviewVideo && !showThumbnail && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div style={{ fontSize: 48, opacity: 0.5 }}>📺</div>
                    </div>
                )}

                {/* Looping preview clip — autoplay muted, loops in place.
                    Always in the DOM so the browser begins fetching as soon
                    as previewSrc is known; opacity gates visibility until
                    the first frame loads (avoids flashing a black box). */}
                {previewSrc && (
                    <video
                        ref={videoRef}
                        src={previewSrc}
                        muted
                        autoPlay
                        loop
                        playsInline
                        disablePictureInPicture
                        preload="auto"
                        onLoadedData={() => setPreviewLoaded(true)}
                        onError={() => setPreviewFailed(true)}
                        style={{
                            position: 'absolute', inset: 0,
                            width: '100%', height: '100%',
                            objectFit: 'cover',
                            opacity: showPreviewVideo ? 1 : 0,
                            transition: 'opacity 0.4s ease',
                        }}
                    />
                )}

                {/* LIVE Badge */}
                <div
                    style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        background: C.red,
                        color: 'white',
                        padding: '4px 10px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        animation: 'lscPulse 1.5s infinite',
                        zIndex: 2,
                    }}
                >
                    🔴 LIVE
                </div>

                {/* Subtle "playing" pip when the preview clip is active */}
                {showPreviewVideo && (
                    <div style={{
                        position: 'absolute', top: 10, right: 10,
                        background: 'rgba(0,0,0,0.6)',
                        color: '#00FF88',
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        zIndex: 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                    }}>
                        <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: '#00FF88',
                            boxShadow: '0 0 4px #00FF88',
                            display: 'inline-block',
                        }} />
                        LIVE
                    </div>
                )}

                {/* Viewer Count */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: 10,
                        right: 10,
                        background: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        zIndex: 2,
                    }}
                >
                    👁️ {Number.isFinite(stream.viewer_count) ? stream.viewer_count : 0}
                </div>
            </div>

            {/* Stream Info */}
            <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img
                        src={stream.broadcaster?.avatar_url || stream.profiles?.avatar_url || '/default-avatar.png'}
                        alt={stream.broadcaster?.username || stream.profiles?.username}
                        style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                        onError={(e) => { e.target.src = '/default-avatar.png'; }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                            style={{
                                fontWeight: 600,
                                color: C.text,
                                fontSize: 14,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {stream.title || 'Live Stream'}
                        </div>
                        <div style={{ color: C.textSec, fontSize: 13 }}>
                            {stream.broadcaster?.username || stream.profiles?.username || 'Streamer'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Animations */}
            <style>{`
                @keyframes lscPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            `}</style>
        </div>
    );
}

export default LiveStreamCard;
