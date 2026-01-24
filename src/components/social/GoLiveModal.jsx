/* ═══════════════════════════════════════════════════════════════════════════
   GO LIVE MODAL — Facebook/TikTok-style Live Streaming Interface
   Camera preview, stream settings, broadcast controls, and recording
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from 'react';
import { liveStreamService } from '../../services/LiveStreamService';
import { EndStreamModal } from './EndStreamModal';

// Colors matching the social media page
const C = {
    bg: '#F0F2F5',
    card: '#FFFFFF',
    text: '#050505',
    textSec: '#65676B',
    border: '#DADDE1',
    red: '#FA383E',
    redHover: '#E8353A',
};

export function GoLiveModal({ isOpen, onClose, user }) {
    const [stage, setStage] = useState('setup'); // setup, preview, live, ended
    const [title, setTitle] = useState('');
    const [error, setError] = useState('');
    const [viewerCount, setViewerCount] = useState(0);
    const [streamId, setStreamId] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);

    // Recording state
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [thumbnailUrl, setThumbnailUrl] = useState(null);

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const canvasRef = useRef(null);

    // Request camera/mic access when modal opens
    useEffect(() => {
        if (isOpen && stage === 'setup') {
            requestMediaAccess();
        }
        return () => {
            // Cleanup on unmount
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
        };
    }, [isOpen]);

    // Rebind stream to video element whenever stage changes (critical for live stage)
    useEffect(() => {
        if (streamRef.current && videoRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    }, [stage]);

    const requestMediaAccess = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setStage('preview');
            setError('');
        } catch (err) {
            console.error('Camera access denied:', err);
            setError('Camera access denied. Please allow camera and microphone permissions.');
        }
    };

    // Capture thumbnail from video
    const captureThumbnail = () => {
        if (!videoRef.current) return null;

        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 360;
        const ctx = canvas.getContext('2d');

        // Flip horizontally since video is mirrored
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        return canvas.toDataURL('image/jpeg', 0.8);
    };

    // Start recording
    const startRecording = () => {
        if (!streamRef.current) return;

        recordedChunksRef.current = [];

        // Try different MIME types for browser compatibility
        const mimeTypes = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4'
        ];

        let selectedMimeType = '';
        for (const mimeType of mimeTypes) {
            if (MediaRecorder.isTypeSupported(mimeType)) {
                selectedMimeType = mimeType;
                break;
            }
        }

        if (!selectedMimeType) {
            console.warn('No supported MIME type for recording');
            return;
        }

        const mediaRecorder = new MediaRecorder(streamRef.current, {
            mimeType: selectedMimeType,
            videoBitsPerSecond: 2500000 // 2.5 Mbps
        });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: selectedMimeType });
            setRecordedBlob(blob);
            console.log('📹 Recording complete, size:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
        };

        mediaRecorder.start(1000); // Capture in 1-second chunks
        mediaRecorderRef.current = mediaRecorder;
        console.log('🔴 Recording started with:', selectedMimeType);
    };

    const handleGoLive = async () => {
        if (!streamRef.current || !user?.id) {
            setError('Unable to start stream. Please try again.');
            return;
        }

        try {
            // Capture thumbnail at stream start
            const thumb = captureThumbnail();
            setThumbnailUrl(thumb);

            // Set up viewer count callback
            liveStreamService.onViewerCountChange = (count) => {
                setViewerCount(count);
            };

            // Start the broadcast
            const { streamId: newStreamId } = await liveStreamService.startBroadcast(
                user.id,
                title || `${user.name}'s Live`,
                streamRef.current
            );

            setStreamId(newStreamId);
            setStage('live');
            setElapsedTime(0);

            // Start recording
            startRecording();

            // Start elapsed time counter
            timerRef.current = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error('Failed to start broadcast:', err);
            setError(err.message || 'Failed to start broadcast.');
        }
    };

    const handleEndStream = async () => {
        try {
            // Stop recording first to ensure blob is ready
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }

            await liveStreamService.endBroadcast();

            // Stop timer
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }

            // Stop media tracks (but keep the stream for preview in EndStreamModal)
            // We'll stop them after the EndStreamModal closes

            // Transition to ended stage to show EndStreamModal
            setStage('ended');

        } catch (err) {
            console.error('Failed to end broadcast:', err);
            setError(err.message);
        }
    };

    const handleEndStreamModalClose = (action) => {
        // Stop media tracks now
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        // Reset state
        setStage('setup');
        setRecordedBlob(null);
        setThumbnailUrl(null);
        setStreamId(null);
        setElapsedTime(0);

        // Close the main modal
        onClose(action);
    };

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    if (!isOpen) return null;

    // Show EndStreamModal when stream has ended
    if (stage === 'ended') {
        return (
            <EndStreamModal
                isOpen={true}
                onClose={handleEndStreamModalClose}
                streamId={streamId}
                videoBlob={recordedBlob}
                thumbnailUrl={thumbnailUrl}
                duration={elapsedTime}
                user={user}
            />
        );
    }

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.85)',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget && stage !== 'live') {
                    onClose();
                }
            }}
        >
            <div
                style={{
                    background: stage === 'live' ? '#000' : C.card,
                    borderRadius: stage === 'live' ? 0 : 12,
                    width: stage === 'live' ? '100%' : 'min(600px, 90vw)',
                    height: stage === 'live' ? '100%' : 'auto',
                    maxHeight: stage === 'live' ? '100%' : '90vh',
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                {/* Header */}
                {stage !== 'live' && (
                    <div
                        style={{
                            padding: '16px 20px',
                            borderBottom: `1px solid ${C.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}
                    >
                        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>
                            📺 Go Live
                        </h2>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                fontSize: 24,
                                cursor: 'pointer',
                                color: C.textSec,
                                padding: 4,
                            }}
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* Setup Stage - Requesting permissions */}
                {stage === 'setup' && (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 20 }}>📹</div>
                        <h3 style={{ margin: '0 0 12px', color: C.text }}>Camera Access Required</h3>
                        <p style={{ color: C.textSec, margin: '0 0 20px' }}>
                            Please allow camera and microphone access to go live.
                        </p>
                        {error && (
                            <div style={{ color: C.red, marginBottom: 20, fontSize: 14 }}>
                                ⚠️ {error}
                            </div>
                        )}
                        <button
                            onClick={requestMediaAccess}
                            style={{
                                background: C.red,
                                color: 'white',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: 8,
                                fontSize: 16,
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            Allow Camera Access
                        </button>
                    </div>
                )}

                {/* Preview Stage - Ready to go live */}
                {stage === 'preview' && (
                    <div>
                        {/* Video Preview */}
                        <div style={{ position: 'relative', background: '#000', aspectRatio: '16/9' }}>
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                            />
                            {/* Preview badge */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 12,
                                    left: 12,
                                    background: 'rgba(0, 0, 0, 0.6)',
                                    color: 'white',
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    fontSize: 14,
                                    fontWeight: 600,
                                }}
                            >
                                Preview
                            </div>
                        </div>

                        {/* Stream Settings */}
                        <div style={{ padding: 20 }}>
                            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: C.text }}>
                                Stream Title
                            </label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={`${user?.name || 'Your'}'s Live Stream`}
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    borderRadius: 8,
                                    border: `1px solid ${C.border}`,
                                    fontSize: 16,
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />

                            {error && (
                                <div style={{ color: C.red, marginTop: 12, fontSize: 14 }}>
                                    ⚠️ {error}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                                <button
                                    onClick={onClose}
                                    style={{
                                        flex: 1,
                                        padding: '14px 24px',
                                        borderRadius: 8,
                                        border: `1px solid ${C.border}`,
                                        background: 'white',
                                        color: C.text,
                                        fontSize: 16,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleGoLive}
                                    style={{
                                        flex: 1,
                                        padding: '14px 24px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: C.red,
                                        color: 'white',
                                        fontSize: 16,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                    }}
                                >
                                    🔴 Go Live
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Live Stage - Broadcasting */}
                {stage === 'live' && (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Full screen video */}
                        <div style={{ flex: 1, position: 'relative', background: '#000' }}>
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                style={{ width: '100%', height: '100%', objectFit: 'contain', transform: 'scaleX(-1)' }}
                            />

                            {/* Live indicator */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 20,
                                    left: 20,
                                    display: 'flex',
                                    gap: 12,
                                    alignItems: 'center',
                                }}
                            >
                                <div
                                    style={{
                                        background: C.red,
                                        color: 'white',
                                        padding: '8px 16px',
                                        borderRadius: 8,
                                        fontSize: 16,
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        animation: 'pulse 1.5s infinite',
                                    }}
                                >
                                    🔴 LIVE
                                </div>
                                <div
                                    style={{
                                        background: 'rgba(0, 0, 0, 0.6)',
                                        color: 'white',
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        fontSize: 14,
                                        fontWeight: 600,
                                    }}
                                >
                                    ⏱️ {formatTime(elapsedTime)}
                                </div>
                                {/* Recording indicator */}
                                <div
                                    style={{
                                        background: 'rgba(255, 0, 0, 0.8)',
                                        color: 'white',
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        fontSize: 14,
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                    }}
                                >
                                    ⏺️ REC
                                </div>
                            </div>

                            {/* Viewer count */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 20,
                                    right: 20,
                                    background: 'rgba(0, 0, 0, 0.6)',
                                    color: 'white',
                                    padding: '8px 16px',
                                    borderRadius: 8,
                                    fontSize: 16,
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                }}
                            >
                                👁️ {viewerCount} {viewerCount === 1 ? 'viewer' : 'viewers'}
                            </div>

                            {/* End stream button */}
                            <div
                                style={{
                                    position: 'absolute',
                                    bottom: 30,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                }}
                            >
                                <button
                                    onClick={handleEndStream}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.9)',
                                        color: C.red,
                                        border: 'none',
                                        padding: '14px 32px',
                                        borderRadius: 30,
                                        fontSize: 16,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                    }}
                                >
                                    ⬛ End Stream
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Pulse animation for LIVE badge */}
            <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
        </div>
    );
}

export default GoLiveModal;
