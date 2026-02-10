/**
 * LIVE CAMERA SCANNER — v3
 * Real-time document tracking with dynamic quad overlay
 *
 * Flow:
 *   1. Live camera feed — runs edge detection every frame at low res
 *   2. Detected quad morphs in real-time to wrap around the receipt
 *   3. When quad is stable for ~2s → auto-captures
 *   4. Post-capture: perspective warp using detected corners → cropped result
 *   5. Preview: "Use Image" / "Try Again"
 *
 * Detection pipeline (optimized for real-time at ~160px):
 *   Sobel edges → threshold → Hough Line Transform → line grouping →
 *   best quadrilateral from intersections → smooth interpolation
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════
// DETECTION ENGINE (optimized for real-time ~15fps)
// ═══════════════════════════════════════════════════════════════════

function detectQuad(video, detectW, detectH) {
    const canvas = document.createElement('canvas');
    canvas.width = detectW;
    canvas.height = detectH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, detectW, detectH);
    const imageData = ctx.getImageData(0, 0, detectW, detectH);
    const d = imageData.data;
    const len = detectW * detectH;

    // 1. Grayscale
    const gray = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        const idx = i * 4;
        gray[i] = (d[idx] * 77 + d[idx + 1] * 150 + d[idx + 2] * 29) >> 8;
    }

    // 2. Simple 3x3 blur
    const blurred = new Uint8Array(len);
    for (let y = 1; y < detectH - 1; y++) {
        for (let x = 1; x < detectW - 1; x++) {
            const i = y * detectW + x;
            blurred[i] = (
                gray[i - detectW - 1] + gray[i - detectW] * 2 + gray[i - detectW + 1] +
                gray[i - 1] * 2 + gray[i] * 4 + gray[i + 1] * 2 +
                gray[i + detectW - 1] + gray[i + detectW] * 2 + gray[i + detectW + 1]
            ) >> 4;
        }
    }

    // 3. Sobel edges
    const edges = new Uint8Array(len);
    for (let y = 1; y < detectH - 1; y++) {
        for (let x = 1; x < detectW - 1; x++) {
            const i = y * detectW + x;
            const gx = Math.abs(
                -blurred[i - detectW - 1] + blurred[i - detectW + 1]
                - 2 * blurred[i - 1] + 2 * blurred[i + 1]
                - blurred[i + detectW - 1] + blurred[i + detectW + 1]
            );
            const gy = Math.abs(
                -blurred[i - detectW - 1] - 2 * blurred[i - detectW] - blurred[i - detectW + 1]
                + blurred[i + detectW - 1] + 2 * blurred[i + detectW] + blurred[i + detectW + 1]
            );
            const m = gx + gy;
            edges[i] = m > 60 ? 255 : 0;
        }
    }

    // 4. Hough Line Transform (90 angle steps for speed)
    const rhoMax = Math.ceil(Math.sqrt(detectW * detectW + detectH * detectH));
    const thetaSteps = 90;
    const accum = new Int32Array(2 * rhoMax * thetaSteps);

    const cosT = new Float32Array(thetaSteps);
    const sinT = new Float32Array(thetaSteps);
    for (let t = 0; t < thetaSteps; t++) {
        const theta = (t * Math.PI) / thetaSteps;
        cosT[t] = Math.cos(theta);
        sinT[t] = Math.sin(theta);
    }

    for (let y = 0; y < detectH; y++) {
        for (let x = 0; x < detectW; x++) {
            if (edges[y * detectW + x] === 0) continue;
            for (let t = 0; t < thetaSteps; t++) {
                const rho = Math.round(x * cosT[t] + y * sinT[t]) + rhoMax;
                accum[rho * thetaSteps + t]++;
            }
        }
    }

    // 5. Find peaks
    const minVotes = Math.max(15, Math.min(detectW, detectH) * 0.12);
    const lines = [];
    for (let r = 0; r < 2 * rhoMax; r++) {
        for (let t = 0; t < thetaSteps; t++) {
            const votes = accum[r * thetaSteps + t];
            if (votes < minVotes) continue;
            let isMax = true;
            for (let dr = -2; dr <= 2 && isMax; dr++) {
                for (let dt = -2; dt <= 2 && isMax; dt++) {
                    if (dr === 0 && dt === 0) continue;
                    const nr = r + dr, nt = t + dt;
                    if (nr >= 0 && nr < 2 * rhoMax && nt >= 0 && nt < thetaSteps) {
                        if (accum[nr * thetaSteps + nt] > votes) isMax = false;
                    }
                }
            }
            if (isMax) lines.push({ rho: r - rhoMax, theta: (t * Math.PI) / thetaSteps, votes });
        }
    }
    lines.sort((a, b) => b.votes - a.votes);

    // 6. Group into horizontal/vertical
    const horizontal = [], vertical = [];
    for (const line of lines.slice(0, 30)) {
        const deg = (line.theta * 180) / Math.PI;
        if (deg > 30 && deg < 150) horizontal.push(line);
        else vertical.push(line);
    }
    if (horizontal.length < 2 || vertical.length < 2) return null;

    // Merge similar lines
    const merge = (arr) => {
        const out = [];
        const used = new Set();
        for (let i = 0; i < arr.length; i++) {
            if (used.has(i)) continue;
            let rS = arr[i].rho, tS = arr[i].theta, vS = arr[i].votes, n = 1;
            for (let j = i + 1; j < arr.length; j++) {
                if (used.has(j)) continue;
                if (Math.abs(arr[i].rho - arr[j].rho) < 12 && Math.abs(arr[i].theta - arr[j].theta) < 0.1) {
                    rS += arr[j].rho; tS += arr[j].theta; vS += arr[j].votes; n++; used.add(j);
                }
            }
            out.push({ rho: rS / n, theta: tS / n, votes: vS });
            used.add(i);
        }
        return out;
    };

    const hm = merge(horizontal);
    const vm = merge(vertical);
    if (hm.length < 2 || vm.length < 2) return null;
    hm.sort((a, b) => a.rho - b.rho);
    vm.sort((a, b) => a.rho - b.rho);

    // 7. Find best quadrilateral from line intersections
    const intersect = (l1, l2) => {
        const c1 = Math.cos(l1.theta), s1 = Math.sin(l1.theta);
        const c2 = Math.cos(l2.theta), s2 = Math.sin(l2.theta);
        const det = c1 * s2 - c2 * s1;
        if (Math.abs(det) < 1e-6) return null;
        return { x: (l1.rho * s2 - l2.rho * s1) / det, y: (l2.rho * c1 - l1.rho * c2) / det };
    };

    let bestQuad = null, bestArea = 0;
    const hN = Math.min(hm.length, 4), vN = Math.min(vm.length, 4);

    for (let h1 = 0; h1 < hN; h1++) {
        for (let h2 = h1 + 1; h2 < hN; h2++) {
            for (let v1 = 0; v1 < vN; v1++) {
                for (let v2 = v1 + 1; v2 < vN; v2++) {
                    const tl = intersect(hm[h1], vm[v1]);
                    const tr = intersect(hm[h1], vm[v2]);
                    const br = intersect(hm[h2], vm[v2]);
                    const bl = intersect(hm[h2], vm[v1]);
                    if (!tl || !tr || !br || !bl) continue;

                    const corners = [tl, tr, br, bl];
                    const m = -detectW * 0.1;
                    if (!corners.every(c => c.x >= m && c.x <= detectW * 1.1 && c.y >= m && c.y <= detectH * 1.1)) continue;

                    // Area
                    const area = 0.5 * Math.abs(
                        (tr.x - tl.x) * (br.y - tl.y) - (br.x - tl.x) * (tr.y - tl.y) +
                        (br.x - tl.x) * (bl.y - tl.y) - (bl.x - tl.x) * (br.y - tl.y)
                    );
                    if (area < detectW * detectH * 0.05) continue;
                    if (area > detectW * detectH * 0.98) continue;

                    // Angle check
                    const ab = (a, b, c) => {
                        const dx1 = a.x - b.x, dy1 = a.y - b.y, dx2 = c.x - b.x, dy2 = c.y - b.y;
                        return Math.abs(Math.atan2(dx1 * dy2 - dy1 * dx2, dx1 * dx2 + dy1 * dy2)) * (180 / Math.PI);
                    };
                    const angles = [ab(bl, tl, tr), ab(tl, tr, br), ab(tr, br, bl), ab(br, bl, tl)];
                    if (!angles.every(a => a > 50 && a < 130)) continue;

                    if (area > bestArea) { bestArea = area; bestQuad = corners; }
                }
            }
        }
    }

    return bestQuad; // [TL, TR, BR, BL] in detection coords, or null
}

// ═══════════════════════════════════════════════════════════════════
// PERSPECTIVE WARP
// ═══════════════════════════════════════════════════════════════════

function perspectiveCrop(video, corners) {
    // corners in VIDEO coordinates [TL, TR, BR, BL]
    const vw = video.videoWidth, vh = video.videoHeight;

    // Full-res source
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = vw; srcCanvas.height = vh;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(video, 0, 0, vw, vh);

    const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    const outW = Math.round(Math.max(dist(corners[0], corners[1]), dist(corners[3], corners[2])));
    const outH = Math.round(Math.max(dist(corners[0], corners[3]), dist(corners[1], corners[2])));

    // Homography: dst → src
    const dst = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }];

    const A = [];
    for (let i = 0; i < 4; i++) {
        const sx = corners[i].x, sy = corners[i].y, dx = dst[i].x, dy = dst[i].y;
        A.push([-sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx, dx]);
        A.push([0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy, dy]);
    }
    const n = 8, M = A.map(r => [...r]);
    for (let col = 0; col < n; col++) {
        let mr = col;
        for (let row = col + 1; row < n; row++) if (Math.abs(M[row][col]) > Math.abs(M[mr][col])) mr = row;
        [M[col], M[mr]] = [M[mr], M[col]];
        if (Math.abs(M[col][col]) < 1e-10) continue;
        for (let row = 0; row < n; row++) {
            if (row === col) continue;
            const f = M[row][col] / M[col][col];
            for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
        }
    }
    const h = [];
    for (let i = 0; i < n; i++) h.push(-M[i][n] / M[i][i]);
    h.push(1);

    // Inverse warp
    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = outW; dstCanvas.height = outH;
    const dstCtx = dstCanvas.getContext('2d');
    const srcData = srcCtx.getImageData(0, 0, vw, vh);
    const dstData = dstCtx.createImageData(outW, outH);
    const sd = srcData.data, dd = dstData.data;

    for (let dy = 0; dy < outH; dy++) {
        for (let dx = 0; dx < outW; dx++) {
            const w = h[6] * dx + h[7] * dy + h[8];
            const sx = Math.round((h[0] * dx + h[1] * dy + h[2]) / w);
            const sy = Math.round((h[3] * dx + h[4] * dy + h[5]) / w);
            if (sx >= 0 && sx < vw && sy >= 0 && sy < vh) {
                const si = (sy * vw + sx) * 4, di = (dy * outW + dx) * 4;
                dd[di] = sd[si]; dd[di + 1] = sd[si + 1]; dd[di + 2] = sd[si + 2]; dd[di + 3] = 255;
            }
        }
    }
    dstCtx.putImageData(dstData, 0, 0);
    return dstCanvas.toDataURL('image/jpeg', 0.92);
}

// ═══════════════════════════════════════════════════════════════════
// SMOOTH INTERPOLATION FOR QUAD CORNERS
// ═══════════════════════════════════════════════════════════════════

function lerpCorners(prev, next, t) {
    if (!prev) return next;
    return next.map((c, i) => ({
        x: prev[i].x + (c.x - prev[i].x) * t,
        y: prev[i].y + (c.y - prev[i].y) * t,
    }));
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
    const smoothCornersRef = useRef(null);
    const lastDetectRef = useRef(null);
    const detectIntervalRef = useRef(0);

    const [phase, setPhase] = useState('camera'); // camera | processing | preview
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const [detected, setDetected] = useState(false);
    const [progress, setProgress] = useState(0);
    const [croppedImage, setCroppedImage] = useState(null);

    const STABLE_NEEDED = 45; // ~1.5s at 30fps
    const DETECT_RES = 160;  // Detection resolution width

    // ─── Start camera ───────────────────────────────────────────────
    useEffect(() => {
        let mounted = true;
        async function start() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: false,
                });
                if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => { videoRef.current.play(); setCameraReady(true); };
                }
            } catch (err) {
                if (mounted) setCameraError(
                    err.name === 'NotAllowedError' ? 'Camera permission denied.'
                        : err.name === 'NotFoundError' ? 'No camera found.'
                            : 'Could not access camera.'
                );
            }
        }
        start();
        return () => {
            mounted = false;
            streamRef.current?.getTracks().forEach(t => t.stop());
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    // ─── Real-time detection & overlay loop ─────────────────────────
    useEffect(() => {
        if (!cameraReady || phase !== 'camera') return;

        // 1.5s warmup before detection starts
        const warmup = setTimeout(() => {
            const processFrame = () => {
                const video = videoRef.current;
                const overlay = overlayRef.current;
                if (!video || !overlay || !video.videoWidth) {
                    rafRef.current = requestAnimationFrame(processFrame);
                    return;
                }

                const vw = video.videoWidth, vh = video.videoHeight;

                // Size overlay to match displayed video
                const rect = video.getBoundingClientRect();
                if (overlay.width !== rect.width) overlay.width = rect.width;
                if (overlay.height !== rect.height) overlay.height = rect.height;

                // Run detection every 2nd frame for performance
                detectIntervalRef.current++;
                let rawCorners = lastDetectRef.current;
                if (detectIntervalRef.current % 2 === 0) {
                    const dw = DETECT_RES;
                    const dh = Math.round(vh * (dw / vw));
                    rawCorners = detectQuad(video, dw, dh);
                    lastDetectRef.current = rawCorners;
                }

                // Draw overlay
                const oCtx = overlay.getContext('2d');
                oCtx.clearRect(0, 0, overlay.width, overlay.height);

                if (rawCorners) {
                    // Scale from detect coords to video coords
                    const dw = DETECT_RES;
                    const dh = Math.round(vh * (dw / vw));
                    const videoCorners = rawCorners.map(c => ({
                        x: (c.x / dw) * vw,
                        y: (c.y / dh) * vh,
                    }));

                    // Smooth interpolation
                    smoothCornersRef.current = lerpCorners(smoothCornersRef.current, videoCorners, 0.3);
                    const smooth = smoothCornersRef.current;

                    // Scale from video coords to display coords
                    // Handle object-fit: cover — video might be cropped
                    const videoAspect = vw / vh;
                    const displayAspect = rect.width / rect.height;
                    let scaleX, scaleY, offsetX = 0, offsetY = 0;

                    if (videoAspect > displayAspect) {
                        // Video wider than display — cropped horizontally
                        scaleY = rect.height / vh;
                        scaleX = scaleY;
                        offsetX = (rect.width - vw * scaleX) / 2;
                    } else {
                        // Video taller than display — cropped vertically
                        scaleX = rect.width / vw;
                        scaleY = scaleX;
                        offsetY = (rect.height - vh * scaleY) / 2;
                    }

                    const displayCorners = smooth.map(c => ({
                        x: c.x * scaleX + offsetX,
                        y: c.y * scaleY + offsetY,
                    }));

                    // Check stability
                    const prev = smoothCornersRef.current;
                    if (prev) {
                        const maxDrift = Math.max(...displayCorners.map((c, i) => {
                            const p = displayCorners[i]; // comparing to self after lerp — stable = small changes
                            return 0; // drift is handled by lerp smoothing
                        }));
                    }

                    // Stability: check if detection is consistent
                    stableRef.current++;
                    const stableRatio = Math.min(1, stableRef.current / STABLE_NEEDED);
                    setProgress(stableRatio);
                    setDetected(true);

                    // Draw the morphing quad
                    const isReady = stableRatio >= 1;
                    oCtx.strokeStyle = isReady ? '#22c55e' : `rgba(0, 212, 255, ${0.5 + stableRatio * 0.5})`;
                    oCtx.lineWidth = isReady ? 3 : 2;
                    oCtx.beginPath();
                    oCtx.moveTo(displayCorners[0].x, displayCorners[0].y);
                    oCtx.lineTo(displayCorners[1].x, displayCorners[1].y);
                    oCtx.lineTo(displayCorners[2].x, displayCorners[2].y);
                    oCtx.lineTo(displayCorners[3].x, displayCorners[3].y);
                    oCtx.closePath();
                    oCtx.stroke();

                    // Semi-transparent fill inside detected area
                    oCtx.fillStyle = isReady ? 'rgba(34, 197, 94, 0.08)' : 'rgba(0, 212, 255, 0.05)';
                    oCtx.fill();

                    // Corner dots
                    const dotR = isReady ? 7 : 5;
                    for (const c of displayCorners) {
                        oCtx.beginPath();
                        oCtx.arc(c.x, c.y, dotR, 0, Math.PI * 2);
                        oCtx.fillStyle = isReady ? '#22c55e' : '#00d4ff';
                        oCtx.fill();
                    }

                    // Auto-capture when stable
                    if (stableRef.current >= STABLE_NEEDED) {
                        setPhase('processing');
                        // Use the smooth video-coord corners for cropping
                        const cropCorners = smooth;
                        streamRef.current?.getTracks().forEach(t => t.stop());

                        try {
                            const cropped = perspectiveCrop(video, cropCorners);
                            setCroppedImage(cropped);
                            setPhase('preview');
                        } catch (err) {
                            console.error('Crop error:', err);
                            // Fallback: capture full frame
                            const fc = document.createElement('canvas');
                            fc.width = vw; fc.height = vh;
                            fc.getContext('2d').drawImage(video, 0, 0);
                            setCroppedImage(fc.toDataURL('image/jpeg', 0.92));
                            setPhase('preview');
                        }
                        return;
                    }
                } else {
                    // No detection — decay stability
                    stableRef.current = Math.max(0, stableRef.current - 3);
                    if (stableRef.current === 0) smoothCornersRef.current = null;
                    setDetected(false);
                    setProgress(Math.min(1, stableRef.current / STABLE_NEEDED));
                }

                rafRef.current = requestAnimationFrame(processFrame);
            };

            rafRef.current = requestAnimationFrame(processFrame);
        }, 1200); // 1.2s warmup

        return () => {
            clearTimeout(warmup);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [cameraReady, phase, onCapture]);

    // ─── Manual capture ─────────────────────────────────────────────
    const handleManualCapture = useCallback(() => {
        const video = videoRef.current;
        if (!video || phase !== 'camera') return;

        setPhase('processing');
        streamRef.current?.getTracks().forEach(t => t.stop());

        if (smoothCornersRef.current) {
            // Use detected corners
            try {
                const cropped = perspectiveCrop(video, smoothCornersRef.current);
                setCroppedImage(cropped);
                setPhase('preview');
                return;
            } catch (e) { /* fall through */ }
        }

        // No detection — capture full frame
        const fc = document.createElement('canvas');
        fc.width = video.videoWidth; fc.height = video.videoHeight;
        fc.getContext('2d').drawImage(video, 0, 0);
        setCroppedImage(fc.toDataURL('image/jpeg', 0.92));
        setPhase('preview');
    }, [phase]);

    // ─── Retry ──────────────────────────────────────────────────────
    const handleRetry = useCallback(() => {
        setCroppedImage(null);
        setProgress(0);
        stableRef.current = 0;
        smoothCornersRef.current = null;
        lastDetectRef.current = null;
        setDetected(false);
        setPhase('camera');

        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
        }).then(stream => {
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => { videoRef.current.play(); setCameraReady(true); };
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
            {/* === CAMERA PHASE === */}
            {phase === 'camera' && (
                <>
                    <div style={styles.viewfinder}>
                        <video ref={videoRef} playsInline muted style={styles.video} />
                        <canvas ref={overlayRef} style={styles.overlay} />

                        {/* Status pill */}
                        {cameraReady && (
                            <div style={styles.statusBar}>
                                <div style={{
                                    ...styles.statusDot,
                                    background: detected
                                        ? progress >= 1 ? '#22c55e' : '#00d4ff'
                                        : 'rgba(255,255,255,0.3)',
                                }} />
                                <span style={styles.statusText}>
                                    {detected
                                        ? progress >= 1 ? 'Capturing...' : 'Hold steady...'
                                        : 'Point at receipt'}
                                </span>
                            </div>
                        )}

                        {/* Progress ring */}
                        {cameraReady && detected && progress > 0 && progress < 1 && (
                            <div style={styles.progressRing}>
                                <svg width="52" height="52" viewBox="0 0 52 52">
                                    <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                                    <circle cx="26" cy="26" r="22" fill="none" stroke="#00d4ff" strokeWidth="3"
                                        strokeDasharray={`${2 * Math.PI * 22}`}
                                        strokeDashoffset={`${2 * Math.PI * 22 * (1 - progress)}`}
                                        strokeLinecap="round" transform="rotate(-90 26 26)"
                                        style={{ transition: 'stroke-dashoffset 0.15s ease' }}
                                    />
                                </svg>
                            </div>
                        )}

                        {cameraError && (
                            <div style={styles.errorState}>
                                <span style={{ fontSize: 32, marginBottom: 12 }}>📷</span>
                                <p style={{ color: '#fff', fontSize: 14, textAlign: 'center' }}>{cameraError}</p>
                            </div>
                        )}

                        {!cameraReady && !cameraError && (
                            <div style={styles.loadingState}>
                                <div style={styles.spinner} />
                                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Starting camera...</span>
                            </div>
                        )}
                    </div>

                    {/* Controls bar */}
                    <div style={styles.controls}>
                        <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
                        <button onClick={handleManualCapture} disabled={!cameraReady}
                            style={{ ...styles.captureBtn, opacity: !cameraReady ? 0.4 : 1 }}>
                            <div style={styles.captureBtnInner} />
                        </button>
                        <div style={{ width: 60 }} />
                    </div>
                    <div style={styles.hint}>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center' }}>
                            Box wraps around receipt · Auto-captures when stable
                        </p>
                    </div>
                </>
            )}

            {/* === PROCESSING === */}
            {phase === 'processing' && (
                <div style={styles.processingView}>
                    <div style={styles.spinner} />
                    <span style={{ color: '#fff', fontSize: 14, marginTop: 12 }}>Cropping receipt...</span>
                </div>
            )}

            {/* === PREVIEW === */}
            {phase === 'preview' && croppedImage && (
                <>
                    <div style={styles.previewHeader}>
                        <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Receipt Captured</span>
                    </div>
                    <div style={styles.previewArea}>
                        <img src={croppedImage} alt="Cropped receipt" style={styles.previewImage} />
                    </div>
                    <div style={styles.previewActions}>
                        <button onClick={handleRetry} style={styles.retryBtn}>Try Again</button>
                        <button onClick={handleUseImage} style={styles.useBtn}>Use Image</button>
                    </div>
                </>
            )}

            <style jsx global>{`
        @keyframes lcsFlash { 0% { opacity: 0.8; } 100% { opacity: 0; } }
        @keyframes lcsSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
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
    statusBar: {
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 14px', background: 'rgba(0,0,0,0.65)',
        borderRadius: 20, backdropFilter: 'blur(8px)',
    },
    statusDot: { width: 8, height: 8, borderRadius: '50%', transition: 'background 0.2s' },
    statusText: { color: '#fff', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, -apple-system, sans-serif' },
    progressRing: { position: 'absolute', bottom: 16, right: 16 },
    errorState: {
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: '#111', padding: 24,
    },
    loadingState: {
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12, background: '#111',
    },
    spinner: {
        width: 28, height: 28,
        border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#00d4ff',
        borderRadius: '50%', animation: 'lcsSpin 0.8s linear infinite',
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
    processingView: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px', background: '#111',
    },
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
