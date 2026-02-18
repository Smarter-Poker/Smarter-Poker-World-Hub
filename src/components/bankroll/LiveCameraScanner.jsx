/**
 * LIVE CAMERA SCANNER — v4 (OpenCV.js)
 * Real-time document detection using OpenCV contour detection
 *
 * Pipeline (same as jscanify / iOS Notes / CamScanner):
 *   1. cv.Canny → edge detection
 *   2. cv.GaussianBlur → smooth edges
 *   3. cv.threshold (OTSU) → binary
 *   4. cv.findContours → find all closed shapes
 *   5. Largest contour = document
 *   6. Corner extraction from contour points
 *   7. cv.getPerspectiveTransform + cv.warpPerspective → crop & flatten
 *
 * UX: camera w/ morphing quad → auto-capture → cropped preview → Use / Retry
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════
// OPENCV HELPERS
// ═══════════════════════════════════════════════════════════════════

function isOpenCvReady() {
    return typeof cv !== 'undefined' && cv.Mat;
}

function waitForOpenCv(timeout = 15000) {
    return new Promise((resolve, reject) => {
        if (isOpenCvReady()) return resolve();
        const start = Date.now();
        const check = setInterval(() => {
            if (isOpenCvReady()) { clearInterval(check); resolve(); }
            else if (Date.now() - start > timeout) { clearInterval(check); reject(new Error('OpenCV timeout')); }
        }, 100);
    });
}

// ─── Distance helper ──────────────────────────────────────────────
function dist(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// ─── Find document contour (Canny → blur → threshold → findContours) ──
function findDocumentContour(src) {
    const edges = new cv.Mat();
    cv.Canny(src, edges, 50, 200);

    const blurred = new cv.Mat();
    cv.GaussianBlur(edges, blurred, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);

    const thresh = new cv.Mat();
    cv.threshold(blurred, thresh, 0, 255, cv.THRESH_OTSU);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    // Find largest contour
    let maxArea = 0;
    let maxIdx = -1;
    for (let i = 0; i < contours.size(); i++) {
        const area = cv.contourArea(contours.get(i));
        if (area > maxArea) { maxArea = area; maxIdx = i; }
    }

    let result = null;
    if (maxIdx >= 0) {
        const contour = contours.get(maxIdx);
        // Only accept if area is > 5% of image
        const imgArea = src.rows * src.cols;
        if (maxArea > imgArea * 0.05) {
            result = getCornerPoints(contour);
        }
    }

    // Cleanup OpenCV mats
    edges.delete(); blurred.delete(); thresh.delete();
    hierarchy.delete();
    // Don't delete contours individually — delete the vector
    contours.delete();

    return result; // { tl, tr, bl, br } or null
}

// ─── Extract corner points from contour ───────────────────────────
function getCornerPoints(contour) {
    const rect = cv.minAreaRect(contour);
    const center = rect.center;

    let tl = null, tr = null, bl = null, br = null;
    let tlDist = 0, trDist = 0, blDist = 0, brDist = 0;

    const data = contour.data32S;
    for (let i = 0; i < data.length; i += 2) {
        const point = { x: data[i], y: data[i + 1] };
        const d = dist(point, center);

        if (point.x < center.x && point.y < center.y) {
            if (d > tlDist) { tl = point; tlDist = d; }
        } else if (point.x > Center.x && Point.y < center.y) {
            if (d > trDist) { tr = point; trDist = d; }
        } else if (point.x < center.x && point.y > center.y) {
            if (d > blDist) { bl = point; blDist = d; }
        } else if (point.x > center.x && point.y > center.y) {
            if (d > brDist) { br = point; brDist = d; }
        }
    }

    if (!tl || !tr || !bl || !br) return null;
    return { tl, tr, bl, br };
}

// ─── Perspective warp using OpenCV ────────────────────────────────
function perspectiveCropCV(srcMat, corners, outW, outH) {
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        corners.tl.x, corners.tl.y,
        corners.tr.x, corners.tr.y,
        corners.bl.x, corners.bl.y,
        corners.br.x, corners.br.y,
    ]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        outW, 0,
        0, outH,
        outW, outH,
    ]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const warped = new cv.Mat();
    cv.warpPerspective(srcMat, warped, M, new cv.Size(outW, outH),
        cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

    // Convert to canvas
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    cv.imshow(outCanvas, warped);

    // Cleanup
    srcTri.delete(); dstTri.delete(); M.delete(); warped.delete();
    return outCanvas.toDataURL('image/jpeg', 0.92);
}

// ─── Smooth interpolation for quad corners ────────────────────────
function lerpPoints(prev, next, t) {
    if (!prev) return next;
    return {
        tl: { x: prev.tl.x + (next.tl.x - prev.tl.x) * t, y: prev.tl.y + (next.tl.y - prev.tl.y) * t },
        tr: { x: prev.tr.x + (next.tr.x - prev.tr.x) * t, y: prev.tr.y + (next.tr.y - prev.tr.y) * t },
        bl: { x: prev.bl.x + (next.bl.x - prev.bl.x) * t, y: prev.bl.y + (next.bl.y - prev.bl.y) * t },
        br: { x: prev.br.x + (next.br.x - prev.br.x) * t, y: prev.br.y + (next.br.y - prev.br.y) * t },
    };
}


// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function LiveCameraScanner({ onCapture, onClose }) {
    const videoRef = useRef(null);
    const overlayRef = useRef(null);
    const streamRef = useRef(null);
    const rafRef = useRef(null);
    const stableRef = useRef(0);
    const smoothRef = useRef(null);
    const frameCountRef = useRef(0);
    const lastCornersRef = useRef(null);
    const capturingRef = useRef(false);

    const [phase, setPhase] = useState('loading'); // loading | camera | processing | preview
    const [cameraError, setCameraError] = useState(null);
    const [detected, setDetected] = useState(false);
    const [progress, setProgress] = useState(0);
    const [croppedImage, setCroppedImage] = useState(null);
    const [cvStatus, setCvStatus] = useState('loading');

    const STABLE_NEEDED = 45; // ~1.5s at 30fps

    // ─── Load OpenCV + start camera ─────────────────────────────────
    useEffect(() => {
        let mounted = true;

        async function init() {
            try {
                // Wait for OpenCV.js WASM to load
                setCvStatus('loading');
                await waitForOpenCv(20000);
                if (!mounted) return;
                setCvStatus('ready');

                // Start camera
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: false,
                });
                if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play();
                        if (mounted) setPhase('camera');
                    };
                }
            } catch (err) {
                if (!mounted) return;
                if (err.message === 'OpenCV timeout') {
                    setCameraError('OpenCV failed to load. Check your connection.');
                } else if (err.name === 'NotAllowedError') {
                    setCameraError('Camera permission denied.');
                } else if (err.name === 'NotFoundError') {
                    setCameraError('No camera found.');
                } else {
                    setCameraError('Could not start scanner.');
                }
            }
        }

        init();
        return () => {
            mounted = false;
            streamRef.current?.getTracks().forEach(t => t.stop());
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    // ─── Real-time detection loop ───────────────────────────────────
    useEffect(() => {
        if (phase !== 'camera' || !isOpenCvReady()) return;

        // 1s warmup
        const warmup = setTimeout(() => {
            const processFrame = () => {
                if (capturingRef.current) return;
                const video = videoRef.current;
                const overlay = overlayRef.current;
                if (!video || !overlay || !video.videoWidth) {
                    rafRef.current = requestAnimationFrame(processFrame);
                    return;
                }

                const vw = video.videoWidth, vh = video.videoHeight;

                // Size overlay canvas to match displayed video
                const rect = video.getBoundingClientRect();
                if (overlay.width !== rect.width) overlay.width = rect.width;
                if (overlay.height !== rect.height) overlay.height = rect.height;
                const oCtx = overlay.getContext('2d');
                oCtx.clearRect(0, 0, overlay.width, overlay.height);

                // Run detection every 3rd frame for performance
                frameCountRef.current++;
                if (frameCountRef.current % 3 === 0) {
                    // Read video frame into temp canvas, then into cv.Mat
                    const tmpCanvas = document.createElement('canvas');
                    // Process at reduced resolution for speed
                    const scale = Math.min(1, 400 / Math.max(vw, vh));
                    const procW = Math.round(vw * scale);
                    const procH = Math.round(vh * scale);
                    tmpCanvas.width = procW;
                    tmpCanvas.height = procH;
                    const tmpCtx = tmpCanvas.getContext('2d');
                    tmpCtx.drawImage(video, 0, 0, procW, procH);

                    let src = null;
                    try {
                        src = cv.imread(tmpCanvas);
                        const rawCorners = findDocumentContour(src);

                        if (rawCorners) {
                            // Scale corners back to full video coords
                            const fullCorners = {
                                tl: { x: rawCorners.tl.x / scale, y: rawCorners.tl.y / scale },
                                tr: { x: rawCorners.tr.x / scale, y: rawCorners.tr.y / scale },
                                bl: { x: rawCorners.bl.x / scale, y: rawCorners.bl.y / scale },
                                br: { x: rawCorners.br.x / scale, y: rawCorners.br.y / scale },
                            };
                            lastCornersRef.current = fullCorners;
                            smoothRef.current = lerpPoints(smoothRef.current, fullCorners, 0.35);
                            stableRef.current = Math.min(stableRef.current + 1, STABLE_NEEDED);
                            setDetected(true);
                        } else {
                            stableRef.current = Math.max(0, stableRef.current - 3);
                            if (stableRef.current === 0) { smoothRef.current = null; lastCornersRef.current = null; }
                            setDetected(false);
                        }
                    } catch (e) {
                        console.warn('Detection error:', e);
                    } finally {
                        if (src) src.delete();
                    }
                }

                // Draw overlay quad from smoothed corners
                const smooth = smoothRef.current;
                if (smooth) {
                    // Map video coords → display coords (accounting for object-fit: cover)
                    const videoAspect = vw / vh;
                    const displayAspect = rect.width / rect.height;
                    let scaleX, scaleY, offsetX = 0, offsetY = 0;
                    if (videoAspect > displayAspect) {
                        scaleY = rect.height / vh; scaleX = scaleY;
                        offsetX = (rect.width - vw * scaleX) / 2;
                    } else {
                        scaleX = rect.width / vw; scaleY = scaleX;
                        offsetY = (rect.height - vh * scaleY) / 2;
                    }
                    const toDisplay = (p) => ({ x: p.x * scaleX + offsetX, y: p.y * scaleY + offsetY });

                    const dtl = toDisplay(smooth.tl);
                    const dtr = toDisplay(smooth.tr);
                    const dbr = toDisplay(smooth.br);
                    const dbl = toDisplay(smooth.bl);

                    const stableRatio = Math.min(1, stableRef.current / STABLE_NEEDED);
                    setProgress(stableRatio);
                    const isReady = stableRatio >= 1;

                    // Draw quad
                    oCtx.strokeStyle = isReady ? '#22c55e' : `rgba(0, 180, 255, ${0.5 + stableRatio * 0.5})`;
                    oCtx.lineWidth = isReady ? 3.5 : 2.5;
                    oCtx.lineJoin = 'round';
                    oCtx.beginPath();
                    oCtx.moveTo(dtl.x, dtl.y);
                    oCtx.lineTo(dtr.x, dtr.y);
                    oCtx.lineTo(dbr.x, dbr.y);
                    oCtx.lineTo(dbl.x, dbl.y);
                    oCtx.closePath();
                    oCtx.stroke();

                    // Fill
                    oCtx.fillStyle = isReady ? 'rgba(34, 197, 94, 0.08)' : 'rgba(0, 180, 255, 0.04)';
                    oCtx.fill();

                    // Corner dots
                    const dotR = isReady ? 6 : 4;
                    for (const c of [dtl, dtr, dbr, dbl]) {
                        oCtx.beginPath();
                        oCtx.arc(c.x, c.y, dotR, 0, Math.PI * 2);
                        oCtx.fillStyle = isReady ? '#22c55e' : '#00b4ff';
                        oCtx.fill();
                    }

                    // Auto-capture
                    if (stableRef.current >= STABLE_NEEDED && !capturingRef.current) {
                        capturingRef.current = true;
                        doCapture(smooth);
                        return;
                    }
                } else {
                    setProgress(0);
                }

                rafRef.current = requestAnimationFrame(processFrame);
            };

            rafRef.current = requestAnimationFrame(processFrame);
        }, 1000);

        return () => {
            clearTimeout(warmup);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [phase]);

    // ─── Capture & crop ─────────────────────────────────────────────
    const doCapture = useCallback((corners) => {
        const video = videoRef.current;
        if (!video) return;

        setPhase('processing');

        // Capture full-res frame
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = video.videoWidth;
        fullCanvas.height = video.videoHeight;
        fullCanvas.getContext('2d').drawImage(video, 0, 0);

        // Stop camera
        streamRef.current?.getTracks().forEach(t => t.stop());

        try {
            const src = cv.imread(fullCanvas);
            const outW = Math.round(Math.max(dist(corners.tl, corners.tr), dist(corners.bl, corners.br)));
            const outH = Math.round(Math.max(dist(corners.tl, corners.bl), dist(corners.tr, corners.br)));
            const cropped = perspectiveCropCV(src, corners, outW, outH);
            src.delete();
            setCroppedImage(cropped);
            setPhase('preview');
        } catch (err) {
            console.error('Crop failed:', err);
            // Fallback to full frame
            setCroppedImage(fullCanvas.toDataURL('image/jpeg', 0.92));
            setPhase('preview');
        }
    }, []);

    // ─── Manual capture ─────────────────────────────────────────────
    const handleManualCapture = useCallback(() => {
        if (phase !== 'camera') return;
        capturingRef.current = true;
        const corners = smoothRef.current || lastCornersRef.current;
        if (corners) {
            doCapture(corners);
        } else {
            // No detection — capture full frame
            const video = videoRef.current;
            if (!video) return;
            setPhase('processing');
            streamRef.current?.getTracks().forEach(t => t.stop());
            const fc = document.createElement('canvas');
            fc.width = video.videoWidth; fc.height = video.videoHeight;
            fc.getContext('2d').drawImage(video, 0, 0);
            setCroppedImage(fc.toDataURL('image/jpeg', 0.92));
            setPhase('preview');
        }
    }, [phase, doCapture]);

    // ─── Retry ──────────────────────────────────────────────────────
    const handleRetry = useCallback(() => {
        setCroppedImage(null);
        setProgress(0);
        stableRef.current = 0;
        smoothRef.current = null;
        lastCornersRef.current = null;
        capturingRef.current = false;
        setDetected(false);

        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
        }).then(stream => {
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current.play();
                    setPhase('camera');
                };
            }
        }).catch(() => setCameraError('Could not restart camera.'));
    }, []);

    // ─── Use image ──────────────────────────────────────────────────
    const handleUseImage = useCallback(() => {
        if (croppedImage) onCapture(croppedImage);
    }, [croppedImage, onCapture]);

    // ═══════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════
    return (
        <div style={styles.container}>
            {/* LOADING */}
            {phase === 'loading' && !cameraError && (
                <div style={styles.centerView}>
                    <div style={styles.spinner} />
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 12 }}>
                        {cvStatus === 'loading' ? 'Loading scanner engine...' : 'Starting camera...'}
                    </span>
                </div>
            )}

            {/* ERROR */}
            {cameraError && (
                <div style={styles.centerView}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Camera Error</span>
                    <p style={{ color: '#fff', fontSize: 14, textAlign: 'center', margin: 0 }}>{cameraError}</p>
                    <button onClick={onClose} style={{ ...styles.retryBtn, marginTop: 16, maxWidth: 160 }}>Close</button>
                </div>
            )}

            {/* CAMERA */}
            {(phase === 'camera' || phase === 'loading') && (
                <div style={{ ...styles.viewfinder, display: phase === 'loading' ? 'none' : 'block' }}>
                    <video ref={videoRef} playsInline muted style={styles.video} />
                    <canvas ref={overlayRef} style={styles.overlay} />

                    {/* Status pill */}
                    <div style={styles.statusBar}>
                        <div style={{
                            ...styles.statusDot,
                            background: detected
                                ? progress >= 1 ? '#22c55e' : '#00b4ff'
                                : 'rgba(255,255,255,0.3)',
                        }} />
                        <span style={styles.statusText}>
                            {detected
                                ? progress >= 1 ? 'Capturing...' : 'Hold steady...'
                                : 'Point at receipt'}
                        </span>
                    </div>

                    {/* Progress ring */}
                    {detected && progress > 0 && Progress < 1 && (
                        <div style={styles.progressRing}>
                            <svg width="50" height="50" viewBox="0 0 50 50">
                                <circle cx="25" cy="25" r="21" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                                <circle cx="25" cy="25" r="21" fill="none" stroke="#00b4ff" strokeWidth="3"
                                    strokeDasharray={`${2 * Math.PI * 21}`}
                                    strokeDashoffset={`${2 * Math.PI * 21 * (1 - progress)}`}
                                    strokeLinecap="round" transform="rotate(-90 25 25)"
                                    style={{ transition: 'stroke-dashoffset 0.15s ease' }}
                                />
                            </svg>
                        </div>
                    )}
                </div>
            )}

            {/* Camera controls */}
            {phase === 'camera' && (
                <>
                    <div style={styles.controls}>
                        <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
                        <button onClick={handleManualCapture} style={styles.captureBtn}>
                            <div style={styles.captureBtnInner} />
                        </button>
                        <div style={{ width: 60 }} />
                    </div>
                    <div style={styles.hint}>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center' }}>
                            Outline wraps around receipt · Auto-captures when stable
                        </p>
                    </div>
                </>
            )}

            {/* PROCESSING */}
            {phase === 'processing' && (
                <div style={styles.centerView}>
                    <div style={styles.spinner} />
                    <span style={{ color: '#fff', fontSize: 14, marginTop: 12 }}>Cropping Receipt...</span>
                </div>
            )}

            {/* PREVIEW */}
            {phase === 'preview' && croppedImage && (
                <>
                    <div style={styles.previewHeader}>
                        <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Receipt Captured</span>
                    </div>
                    <div style={styles.previewArea}>
                        <img src={croppedImage} alt="Cropped Receipt" style={styles.previewImage} />
                    </div>
                    <div style={styles.previewActions}>
                        <button onClick={handleRetry} style={styles.retryBtn}>Try Again</button>
                        <button onClick={handleUseImage} style={styles.useBtn}>Use Image</button>
                    </div>
                </>
            )}

            <style jsx global>{`
        @keyframes lcsSpinner { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════
const styles = {
    container: {
        display: 'flex', flexDirection: 'column',
        background: '#000', borderRadius: '0 0 16px 16px', overflow: 'hidden',
    },
    viewfinder: {
        position: 'relative', width: '100%', aspectRatio: '3/4',
        background: '#111', overflow: 'hidden',
    },
    video: { width: '100%', height: '100%', objectFit: 'cover' },
    overlay: { position: 'absolute', inset: 0, pointerEvents: 'none' },
    centerView: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px', background: '#111', minHeight: 200,
    },
    statusBar: {
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 14px', background: 'rgba(0,0,0,0.65)',
        borderRadius: 20, backdropFilter: 'blur(8px)',
    },
    statusDot: { width: 8, height: 8, borderRadius: '50%', transition: 'background 0.2s' },
    statusText: { color: '#fff', fontSize: 14, fontWeight: 500, fontFamily: 'Inter, -apple-system, sans-serif' },
    progressRing: { position: 'absolute', bottom: 16, right: 16 },
    spinner: {
        width: 28, height: 28,
        border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#00b4ff',
        borderRadius: '50%', animation: 'lcsSpinner 0.8s linear infinite',
    },
    controls: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', background: '#000',
    },
    cancelBtn: {
        width: 60, background: 'none', border: 'none', color: '#fff',
        fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, -apple-system, sans-serif',
    },
    captureBtn: {
        width: 64, height: 64, borderRadius: '50%',
        border: '3px solid rgba(255,255,255,0.8)', background: 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    },
    captureBtnInner: { width: 52, height: 52, borderRadius: '50%', background: '#fff' },
    hint: { padding: '4px 16px 14px', background: '#000' },
    previewHeader: {
        padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#1a1b1e',
    },
    previewArea: {
        padding: 16, background: '#000', display: 'flex', justifyContent: 'center',
        maxHeight: 400, overflow: 'auto',
    },
    previewImage: {
        maxWidth: '100%', maxHeight: 380, objectFit: 'contain',
        borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
    },
    previewActions: {
        display: 'flex', gap: 12, padding: '16px 20px',
        borderTop: '1px solid rgba(255,255,255,0.08)', background: '#1a1b1e',
    },
    retryBtn: {
        flex: 1, padding: '14px 16px', background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
        color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 15, fontWeight: 600, cursor: 'pointer',
    },
    useBtn: {
        flex: 1, padding: '14px 16px',
        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        border: 'none', borderRadius: 10, color: '#fff',
        fontFamily: 'Inter, -apple-system, sans-serif', fontSize: 15, fontWeight: 600, cursor: 'pointer',
    },
};
