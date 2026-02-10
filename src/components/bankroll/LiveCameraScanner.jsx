/**
 * LIVE CAMERA SCANNER
 * Real-time camera viewfinder with automatic document detection & capture
 * Like iOS Notes scanner — holds camera, detects receipt edges, auto-captures
 * Pure client-side Canvas processing — zero external dependencies
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── GEOMETRY HELPERS ─────────────────────────────────────────────
function angleBetween(a, b, c) {
    const abx = a.x - b.x, aby = a.y - b.y;
    const cbx = c.x - b.x, cby = c.y - b.y;
    const dot = abx * cbx + aby * cby;
    const cross = abx * cby - aby * cbx;
    return Math.abs(Math.atan2(cross, dot)) * (180 / Math.PI);
}

function isRoughlyRectangular(corners) {
    const angles = [
        angleBetween(corners[3], corners[0], corners[1]),
        angleBetween(corners[0], corners[1], corners[2]),
        angleBetween(corners[1], corners[2], corners[3]),
        angleBetween(corners[2], corners[3], corners[0]),
    ];
    return angles.every(a => a > 60 && a < 120);
}

// ─── EDGE DETECTION ───────────────────────────────────────────────
function detectDocumentInFrame(canvas, ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const d = imageData.data;
    const len = width * height;

    // Grayscale
    const gray = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        const idx = i * 4;
        gray[i] = (d[idx] * 77 + d[idx + 1] * 150 + d[idx + 2] * 29) >> 8;
    }

    // Sobel
    const edges = new Uint8Array(len);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const gx = Math.abs(
                -gray[i - width - 1] + gray[i - width + 1]
                - 2 * gray[i - 1] + 2 * gray[i + 1]
                - gray[i + width - 1] + gray[i + width + 1]
            );
            const gy = Math.abs(
                -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1]
                + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1]
            );
            edges[i] = Math.min(255, gx + gy);
        }
    }

    // Threshold
    const threshold = 80;
    let edgeCount = 0;
    for (let i = 0; i < len; i++) {
        if (edges[i] > threshold) edgeCount++;
    }

    const edgeRatio = edgeCount / len;
    if (edgeRatio < 0.005 || edgeRatio > 0.3) return null;

    // Find corners in each quadrant
    const cx = width / 2, cy = height / 2;
    const margin = Math.min(width, height) * 0.08;

    const corners = [
        { x: margin, y: margin },
        { x: width - margin, y: margin },
        { x: width - margin, y: height - margin },
        { x: margin, y: height - margin },
    ];

    const targets = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
    ];

    const bestDist = [Infinity, Infinity, Infinity, Infinity];

    for (let y = 2; y < height - 2; y += 3) {
        for (let x = 2; x < width - 2; x += 3) {
            if (edges[y * width + x] <= threshold) continue;
            const qx = x < cx ? 0 : 1;
            const qy = y < cy ? 0 : 1;
            const qi = qy === 0 ? (qx === 0 ? 0 : 1) : (qx === 1 ? 2 : 3);
            const dx = x - targets[qi].x;
            const dy = y - targets[qi].y;
            const dist = dx * dx + dy * dy;
            if (dist < bestDist[qi]) {
                bestDist[qi] = dist;
                corners[qi] = { x, y };
            }
        }
    }

    // Validate side lengths
    const minSide = Math.min(width, height) * 0.15;
    const sides = [
        Math.sqrt((corners[1].x - corners[0].x) ** 2 + (corners[1].y - corners[0].y) ** 2),
        Math.sqrt((corners[2].x - corners[1].x) ** 2 + (corners[2].y - corners[1].y) ** 2),
        Math.sqrt((corners[3].x - corners[2].x) ** 2 + (corners[3].y - corners[2].y) ** 2),
        Math.sqrt((corners[0].x - corners[3].x) ** 2 + (corners[0].y - corners[3].y) ** 2),
    ];
    if (sides.some(s => s < minSide)) return null;

    // Validate area (>= 15% of frame)
    const area = 0.5 * Math.abs(
        (corners[1].x - corners[0].x) * (corners[2].y - corners[0].y) -
        (corners[2].x - corners[0].x) * (corners[1].y - corners[0].y)
    ) + 0.5 * Math.abs(
        (corners[2].x - corners[0].x) * (corners[3].y - corners[0].y) -
        (corners[3].x - corners[0].x) * (corners[2].y - corners[0].y)
    );
    if (area < width * height * 0.15) return null;

    // Validate rectangularity — reject weird angled shapes
    if (!isRoughlyRectangular(corners)) return null;

    return corners;
}

// ─── COMPONENT ────────────────────────────────────────────────────
export default function LiveCameraScanner({ onCapture, onClose }) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const overlayRef = useRef(null);
    const streamRef = useRef(null);
    const rafRef = useRef(null);
    const stableCountRef = useRef(0);
    const lastCornersRef = useRef(null);
    const warmupTimerRef = useRef(null);

    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const [detected, setDetected] = useState(false);
    const [capturing, setCapturing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [warmedUp, setWarmedUp] = useState(false);

    const STABLE_FRAMES_NEEDED = 60; // ~2 seconds of stable rectangular detection
    const WARMUP_DELAY = 1500; // 1.5s before detection starts

    // Start camera
    useEffect(() => {
        let mounted = true;

        async function startCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                });

                if (!mounted) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                streamRef.current = stream;

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play();
                        setCameraReady(true);
                    };
                }
            } catch (err) {
                console.error('Camera error:', err);
                if (mounted) {
                    setCameraError(
                        err.name === 'NotAllowedError'
                            ? 'Camera permission denied. Please allow camera access.'
                            : err.name === 'NotFoundError'
                                ? 'No camera found on this device.'
                                : 'Could not access camera. Try uploading instead.'
                    );
                }
            }
        }

        startCamera();

        return () => {
            mounted = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
            if (warmupTimerRef.current) {
                clearTimeout(warmupTimerRef.current);
            }
        };
    }, []);

    // Frame processing loop
    useEffect(() => {
        if (!cameraReady || capturing) return;

        // Warmup: give user 1.5s to position their receipt before detection starts
        if (!warmedUp) {
            warmupTimerRef.current = setTimeout(() => setWarmedUp(true), WARMUP_DELAY);
            return () => clearTimeout(warmupTimerRef.current);
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!video || !canvas || !overlay) return;

        const processFrame = () => {
            if (!video.videoWidth) {
                rafRef.current = requestAnimationFrame(processFrame);
                return;
            }

            const w = video.videoWidth;
            const h = video.videoHeight;

            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, w, h);

            // Detect at lower res for performance
            const detectW = Math.min(w, 320);
            const scale = detectW / w;
            const detectH = Math.round(h * scale);

            const detectCanvas = document.createElement('canvas');
            detectCanvas.width = detectW;
            detectCanvas.height = detectH;
            const detectCtx = detectCanvas.getContext('2d');
            detectCtx.drawImage(video, 0, 0, detectW, detectH);

            const corners = detectDocumentInFrame(detectCanvas, detectCtx, detectW, detectH);

            // Draw overlay
            const oCtx = overlay.getContext('2d');
            const ow = overlay.width;
            const oh = overlay.height;
            oCtx.clearRect(0, 0, ow, oh);

            if (corners) {
                const sx = ow / detectW;
                const sy = oh / detectH;
                const scaled = corners.map(c => ({ x: c.x * sx, y: c.y * sy }));

                // Check stability
                if (lastCornersRef.current) {
                    const prev = lastCornersRef.current;
                    const maxDrift = Math.max(...scaled.map((c, i) =>
                        Math.sqrt((c.x - prev[i].x) ** 2 + (c.y - prev[i].y) ** 2)
                    ));
                    if (maxDrift < 15) {
                        stableCountRef.current++;
                    } else {
                        stableCountRef.current = Math.max(0, stableCountRef.current - 2);
                    }
                }
                lastCornersRef.current = scaled;

                const stableRatio = Math.min(1, stableCountRef.current / STABLE_FRAMES_NEEDED);
                setProgress(stableRatio);
                setDetected(true);

                // Draw detected quad
                oCtx.strokeStyle = stableRatio >= 1
                    ? '#22c55e'
                    : `rgba(0, 212, 255, ${0.5 + stableRatio * 0.5})`;
                oCtx.lineWidth = stableRatio >= 1 ? 4 : 2;
                oCtx.setLineDash([]);
                oCtx.beginPath();
                oCtx.moveTo(scaled[0].x, scaled[0].y);
                for (let i = 1; i < 4; i++) oCtx.lineTo(scaled[i].x, scaled[i].y);
                oCtx.closePath();
                oCtx.stroke();

                // Corner dots
                const handleR = stableRatio >= 1 ? 8 : 6;
                for (const c of scaled) {
                    oCtx.beginPath();
                    oCtx.arc(c.x, c.y, handleR, 0, Math.PI * 2);
                    oCtx.fillStyle = stableRatio >= 1 ? '#22c55e' : '#00d4ff';
                    oCtx.fill();
                }

                // Auto-capture when stable for ~2 seconds
                if (stableCountRef.current >= STABLE_FRAMES_NEEDED && !capturing) {
                    setCapturing(true);

                    const fullCanvas = document.createElement('canvas');
                    fullCanvas.width = w;
                    fullCanvas.height = h;
                    const fullCtx = fullCanvas.getContext('2d');
                    fullCtx.drawImage(video, 0, 0, w, h);

                    const capturedImage = fullCanvas.toDataURL('image/jpeg', 0.92);

                    if (streamRef.current) {
                        streamRef.current.getTracks().forEach(t => t.stop());
                    }

                    setTimeout(() => onCapture(capturedImage), 300);
                    return;
                }
            } else {
                stableCountRef.current = Math.max(0, stableCountRef.current - 3);
                lastCornersRef.current = null;
                setDetected(false);
                setProgress(Math.min(1, stableCountRef.current / STABLE_FRAMES_NEEDED));
            }

            rafRef.current = requestAnimationFrame(processFrame);
        };

        rafRef.current = requestAnimationFrame(processFrame);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [cameraReady, capturing, onCapture, warmedUp]);

    // Handle overlay canvas sizing
    useEffect(() => {
        if (!cameraReady || !videoRef.current || !overlayRef.current) return;

        const resizeOverlay = () => {
            const video = videoRef.current;
            if (!video) return;
            const rect = video.getBoundingClientRect();
            overlayRef.current.width = rect.width;
            overlayRef.current.height = rect.height;
        };

        resizeOverlay();
        const observer = new ResizeObserver(resizeOverlay);
        observer.observe(videoRef.current);
        return () => observer.disconnect();
    }, [cameraReady]);

    // Manual capture
    const handleManualCapture = () => {
        if (!videoRef.current || capturing) return;
        setCapturing(true);

        const video = videoRef.current;
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;
        const ctx = captureCanvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        const image = captureCanvas.toDataURL('image/jpeg', 0.92);

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }

        setTimeout(() => onCapture(image), 200);
    };

    return (
        <div style={styles.container}>
            <div style={styles.viewfinder}>
                <video ref={videoRef} playsInline muted style={styles.video} />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <canvas ref={overlayRef} style={styles.overlay} />

                {/* Status indicator */}
                {cameraReady && !capturing && (
                    <div style={styles.statusBar}>
                        <div style={{
                            ...styles.statusDot,
                            background: !warmedUp
                                ? 'rgba(255,255,255,0.3)'
                                : detected ? (progress >= 1 ? '#22c55e' : '#00d4ff') : 'rgba(255,255,255,0.3)',
                        }} />
                        <span style={styles.statusText}>
                            {!warmedUp
                                ? 'Position receipt in frame...'
                                : detected
                                    ? progress >= 1 ? 'Capturing...' : 'Hold steady...'
                                    : 'Looking for receipt...'}
                        </span>
                    </div>
                )}

                {/* Progress ring */}
                {cameraReady && detected && warmedUp && !capturing && (
                    <div style={styles.progressRing}>
                        <svg width="60" height="60" viewBox="0 0 60 60">
                            <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                            <circle
                                cx="30" cy="30" r="26"
                                fill="none"
                                stroke={progress >= 1 ? '#22c55e' : '#00d4ff'}
                                strokeWidth="3"
                                strokeDasharray={`${2 * Math.PI * 26}`}
                                strokeDashoffset={`${2 * Math.PI * 26 * (1 - progress)}`}
                                strokeLinecap="round"
                                transform="rotate(-90 30 30)"
                                style={{ transition: 'stroke-dashoffset 0.1s ease' }}
                            />
                        </svg>
                    </div>
                )}

                {/* Capture flash */}
                {capturing && <div style={styles.captureFlash} />}

                {/* Camera error */}
                {cameraError && (
                    <div style={styles.errorState}>
                        <span style={{ fontSize: 32, marginBottom: 12 }}>📷</span>
                        <p style={{ color: '#fff', fontSize: 14, textAlign: 'center', margin: '0 0 16px' }}>{cameraError}</p>
                    </div>
                )}

                {/* Loading */}
                {!cameraReady && !cameraError && (
                    <div style={styles.loadingState}>
                        <div style={styles.spinner} />
                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Starting camera...</span>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div style={styles.controls}>
                <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
                <button
                    onClick={handleManualCapture}
                    disabled={!cameraReady || capturing}
                    style={{ ...styles.captureBtn, opacity: !cameraReady || capturing ? 0.4 : 1 }}
                >
                    <div style={styles.captureBtnInner} />
                </button>
                <div style={{ width: 60 }} />
            </div>

            <div style={styles.instructions}>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center' }}>
                    Auto-captures when receipt is detected · Or tap the button to capture manually
                </p>
            </div>

            <style jsx global>{`
        @keyframes liveScannerFlash {
          0% { opacity: 0.8; }
          100% { opacity: 0; }
        }
        @keyframes liveScannerSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}

// ─── STYLES ───────────────────────────────────────────────────────
const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        background: '#000',
        borderRadius: '0 0 16px 16px',
        overflow: 'hidden',
    },
    viewfinder: {
        position: 'relative',
        width: '100%',
        aspectRatio: '4/3',
        background: '#111',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    video: { width: '100%', height: '100%', objectFit: 'cover' },
    overlay: { position: 'absolute', inset: 0, pointerEvents: 'none' },
    statusBar: {
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        background: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 20,
        backdropFilter: 'blur(8px)',
    },
    statusDot: { width: 8, height: 8, borderRadius: '50%', transition: 'background 0.2s ease' },
    statusText: { color: '#fff', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, -apple-system, sans-serif' },
    progressRing: { position: 'absolute', bottom: 16, right: 16 },
    captureFlash: {
        position: 'absolute',
        inset: 0,
        background: '#fff',
        animation: 'liveScannerFlash 0.3s ease-out forwards',
    },
    errorState: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111',
        padding: 24,
    },
    loadingState: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        background: '#111',
    },
    spinner: {
        width: 24,
        height: 24,
        border: '2px solid rgba(255, 255, 255, 0.1)',
        borderTopColor: '#00d4ff',
        borderRadius: '50%',
        animation: 'liveScannerSpin 0.8s linear infinite',
    },
    controls: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        background: '#000',
    },
    cancelBtn: {
        width: 60,
        background: 'none',
        border: 'none',
        color: '#fff',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    captureBtn: {
        width: 64,
        height: 64,
        borderRadius: '50%',
        border: '3px solid rgba(255, 255, 255, 0.8)',
        background: 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
    },
    captureBtnInner: { width: 52, height: 52, borderRadius: '50%', background: '#fff' },
    instructions: { padding: '8px 16px 16px', background: '#000' },
};
