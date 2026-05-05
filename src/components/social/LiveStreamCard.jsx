/* ═══════════════════════════════════════════════════════════════════════════
   LIVE STREAM CARD v2 — Live video preview in social feed
   ─ Hover to see a real-time muted video preview via LiveKit WHEP
   ─ Falls back to thumbnail if unavailable
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRef, useState, useCallback, useEffect } from 'react';

const C = {
    card: '#FFFFFF',
    text: '#050505',
    textSec: '#65676B',
    border: '#DADDE1',
    red: '#FA383E',
};

/**
 * Lightweight LiveKit preview connection.
 * Dynamically imports livekit-client so it NEVER runs server-side.
 * Accepts an AbortSignal so the caller can cancel mid-connect.
 */
async function connectPreview(streamId, videoEl, signal) {
    // Dynamic import — livekit-client uses browser APIs (RTCPeerConnection, etc.)
    // that don't exist on the server. Static import causes `window is not defined`
    // errors during Next.js SSR. This ensures it's only evaluated in the browser.
    const { Room, RoomEvent, Track } = await import('livekit-client');
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const resp = await fetch(`/api/live/preview-token?room=${encodeURIComponent(streamId)}`);
    if (!resp.ok) throw new Error('Token unavailable');
    const { token, url } = await resp.json();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const room = new Room({ adaptiveStream: true, dynacast: false });

    await room.connect(url, token, { autoSubscribe: true });
    if (signal?.aborted) {
        await room.disconnect().catch(() => {});
        throw new DOMException('Aborted', 'AbortError');
    }

    // Deliver first video track to the video element
    const assignTrack = (track) => {
        if (track.kind !== Track.Kind.Video) return;
        if (!track.mediaStreamTrack) return;
        const ms = new MediaStream([track.mediaStreamTrack]);
        videoEl.srcObject = ms;
        videoEl.play().catch(() => {});
    };

    // Check already-subscribed participants (broadcaster joined before us)
    for (const [, participant] of room.remoteParticipants) {
        for (const [, pub] of participant.trackPublications) {
            if (pub.isSubscribed && pub.track?.kind === Track.Kind.Video && pub.track.mediaStreamTrack) {
                assignTrack(pub.track);
                return room;
            }
        }
    }

    // Listen for new subscriptions
    room.on(RoomEvent.TrackSubscribed, (track) => assignTrack(track));

    return room;
}

export function LiveStreamCard({ stream, onClick }) {
    const [isHovered, setIsHovered] = useState(false);
    const [previewActive, setPreviewActive] = useState(false);
    const [previewFailed, setPreviewFailed] = useState(false);
    const videoRef = useRef(null);
    const roomRef = useRef(null);
    const hoverTimerRef = useRef(null); // debounce — don't connect on quick brush
    const abortControllerRef = useRef(null); // to cancel mid-flight connection

    const stopPreview = useCallback(async () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        if (roomRef.current) {
            try {
                await roomRef.current.disconnect();
            } catch (_) {}
            roomRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setPreviewActive(false);
    }, []);

    const startPreview = useCallback(async () => {
        if (roomRef.current || previewFailed) return; // already connected or permanently failed
        const videoEl = videoRef.current;
        if (!videoEl) return;

        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            const room = await connectPreview(stream.id, videoEl, signal);
            if (!signal.aborted) {
                roomRef.current = room;
                setPreviewActive(true);
            }
        } catch (err) {
            if (err.name === 'AbortError') return; // ignore cancellations
            console.warn('[LiveStreamCard] Preview failed:', err.message);
            if (!signal.aborted) {
                setPreviewFailed(true);
            }
        }
    }, [stream.id, previewFailed]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopPreview();
        };
    }, [stopPreview]);

    const handleMouseEnter = useCallback(() => {
        setIsHovered(true);
        // 400ms debounce — avoid connecting on accidental hover
        hoverTimerRef.current = setTimeout(() => startPreview(), 400);
    }, [startPreview]);

    const handleMouseLeave = useCallback(() => {
        setIsHovered(false);
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        stopPreview();
    }, [stopPreview]);

    // Also support touch (mobile) — tap-hold pattern not needed; preview on card tap
    // is handled by the parent onClick; no extra gesture needed here.

    const showVideo = previewActive && !previewFailed;
    const showThumbnail = !showVideo && stream.thumbnail_url;

    return (
        <div
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
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* ── Thumbnail / Live Preview ── */}
            <div
                style={{
                    position: 'relative',
                    aspectRatio: '16/9',
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                    overflow: 'hidden',
                }}
            >
                {/* Static thumbnail (always rendered, hidden when video is live) */}
                {showThumbnail && (
                    <img
                        src={stream.thumbnail_url}
                        alt={stream.title}
                        style={{
                            position: 'absolute', inset: 0,
                            width: '100%', height: '100%',
                            objectFit: 'cover',
                        }}
                    />
                )}

                {/* Placeholder icon when no thumbnail AND no live preview */}
                {!showVideo && !showThumbnail && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div style={{ fontSize: 48, opacity: 0.5 }}>📺</div>
                    </div>
                )}

                {/* Live video preview element — always in DOM, invisible until active */}
                <video
                    ref={videoRef}
                    muted
                    autoPlay
                    playsInline
                    disablePictureInPicture
                    style={{
                        position: 'absolute', inset: 0,
                        width: '100%', height: '100%',
                        objectFit: 'cover',
                        opacity: showVideo ? 1 : 0,
                        transition: 'opacity 0.4s ease',
                    }}
                />

                {/* Hover hint — "HOVER TO PREVIEW" before connection */}
                {isHovered && !previewActive && !previewFailed && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', gap: 6,
                    }}>
                        <div style={{
                            width: 32, height: 32,
                            border: '3px solid rgba(255,255,255,0.3)',
                            borderTopColor: 'white',
                            borderRadius: '50%',
                            animation: 'lscSpin 0.8s linear infinite',
                        }} />
                        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>
                            Loading Preview...
                        </div>
                    </div>
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

                {/* LIVE indicator when video preview is active */}
                {showVideo && (
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
                    👁️ {stream.viewer_count || 0}
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
                @keyframes lscSpin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

export default LiveStreamCard;
