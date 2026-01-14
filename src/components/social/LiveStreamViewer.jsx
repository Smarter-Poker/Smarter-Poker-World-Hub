/* ═══════════════════════════════════════════════════════════════════════════
   LIVE STREAM VIEWER — Full-screen viewing experience for live streams
   TikTok/Facebook Live style immersive viewer with chat overlay
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from 'react';
import { liveStreamService } from '../../services/LiveStreamService';

const C = {
    red: '#FA383E',
};

export function LiveStreamViewer({ stream, userId, onClose }) {
    const [remoteStream, setRemoteStream] = useState(null);
    const [viewerCount, setViewerCount] = useState(stream?.viewer_count || 0);
    const [isConnecting, setIsConnecting] = useState(true);
    const [error, setError] = useState('');

    const videoRef = useRef(null);

    useEffect(() => {
        if (!stream?.id || !userId) return;

        const connect = async () => {
            try {
                setIsConnecting(true);

                // Set up stream ended callback
                liveStreamService.onStreamEnded = () => {
                    setError('Stream has ended');
                    setTimeout(onClose, 2000);
                };

                // Set up viewer count callback
                liveStreamService.onViewerCountChange = (count) => {
                    setViewerCount(count);
                };

                // Join the stream
                await liveStreamService.joinStream(stream.id, userId, (remoteMediaStream) => {
                    setRemoteStream(remoteMediaStream);
                    if (videoRef.current) {
                        videoRef.current.srcObject = remoteMediaStream;
                    }
                    setIsConnecting(false);
                });

            } catch (err) {
                console.error('Failed to join stream:', err);
                setError(err.message || 'Failed to connect to stream');
                setIsConnecting(false);
            }
        };

        connect();

        return () => {
            liveStreamService.leaveStream();
        };
    }, [stream?.id, userId]);

    // Update video element when remote stream changes
    useEffect(() => {
        if (videoRef.current && remoteStream) {
            videoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    const handleLeave = async () => {
        await liveStreamService.leaveStream();
        onClose();
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: '#000',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {/* Video Container */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: '100%',
                    objectFit: 'contain',
                }}
            />

            {/* Loading/Connecting Overlay */}
            {isConnecting && !error && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        color: 'white',
                    }}
                >
                    <div style={{ fontSize: 40, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>
                        📡
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 500 }}>Connecting to stream...</div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        color: 'white',
                        background: 'rgba(0, 0, 0, 0.8)',
                        padding: '24px 40px',
                        borderRadius: 12,
                    }}
                >
                    <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
                    <div style={{ fontSize: 18, fontWeight: 500 }}>{error}</div>
                </div>
            )}

            {/* Top Bar */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
                }}
            >
                {/* Close Button */}
                <button
                    onClick={handleLeave}
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(10px)',
                        border: 'none',
                        color: 'white',
                        fontSize: 20,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    ✕
                </button>

                {/* Live Badge + Viewer Count */}
                <div style={{ display: 'flex', gap: 8 }}>
                    <div
                        style={{
                            background: C.red,
                            color: 'white',
                            padding: '8px 14px',
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        🔴 LIVE
                    </div>
                    <div
                        style={{
                            background: 'rgba(0, 0, 0, 0.6)',
                            color: 'white',
                            padding: '8px 14px',
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        👁️ {viewerCount}
                    </div>
                </div>
            </div>

            {/* Bottom Bar - Broadcaster Info */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '60px 20px 24px',
                    background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
                }}
            >
                {/* Broadcaster */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <img
                        src={stream?.profiles?.avatar_url || '/default-avatar.png'}
                        alt={stream?.profiles?.username}
                        style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid white' }}
                    />
                    <div>
                        <div style={{ color: 'white', fontWeight: 600, fontSize: 16 }}>
                            {stream?.profiles?.username || 'Anonymous'}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                            Smarter.Poker
                        </div>
                    </div>
                </div>

                {/* Stream Title */}
                {stream?.title && (
                    <div style={{ color: 'white', fontSize: 15, lineHeight: 1.4 }}>
                        {stream.title}
                    </div>
                )}
            </div>

            {/* Pulse animation */}
            <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
        </div>
    );
}

export default LiveStreamViewer;
