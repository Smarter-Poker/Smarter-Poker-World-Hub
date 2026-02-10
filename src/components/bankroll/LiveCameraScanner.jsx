/**
 * LIVE CAMERA SCANNER — v2
 * Guide-frame camera → detects content in frame → auto-captures
 * After capture: Hough line detection → auto-crop → preview → Use/Retry
 *
 * Architecture:
 *   1. Live camera feed with guide rectangle overlay
 *   2. Basic brightness/contrast check inside guide area (is there content?)
 *   3. When stable content detected for ~2s → auto-capture
 *   4. Post-capture: proper Hough Line Transform finds document edges
 *   5. Perspective warp crops to just the document
 *   6. Shows cropped result with "Use Image" / "Try Again"
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════
// DOCUMENT DETECTION ENGINE (runs ONCE on captured still image)
// ═══════════════════════════════════════════════════════════════════

function toGrayscale(imageData) {
    const { data, width, height } = imageData;
    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
    return gray;
}

function gaussianBlur(gray, width, height) {
    // 5x5 Gaussian kernel (sigma ≈ 1.4)
    const kernel = [
        2, 4, 5, 4, 2,
        4, 9, 12, 9, 4,
        5, 12, 15, 12, 5,
        4, 9, 12, 9, 4,
        2, 4, 5, 4, 2,
    ];
    const kSum = 159;
    const out = new Float32Array(width * height);

    for (let y = 2; y < height - 2; y++) {
        for (let x = 2; x < width - 2; x++) {
            let sum = 0;
            for (let ky = -2; ky <= 2; ky++) {
                for (let kx = -2; kx <= 2; kx++) {
                    sum += gray[(y + ky) * width + (x + kx)] * kernel[(ky + 2) * 5 + (kx + 2)];
                }
            }
            out[y * width + x] = sum / kSum;
        }
    }
    return out;
}

function sobelEdges(gray, width, height) {
    const mag = new Float32Array(width * height);
    const dir = new Float32Array(width * height);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const gx =
                -gray[i - width - 1] + gray[i - width + 1]
                - 2 * gray[i - 1] + 2 * gray[i + 1]
                - gray[i + width - 1] + gray[i + width + 1];
            const gy =
                -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1]
                + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
            mag[i] = Math.sqrt(gx * gx + gy * gy);
            dir[i] = Math.atan2(gy, gx);
        }
    }
    return { mag, dir };
}

function nonMaxSuppression(mag, dir, width, height) {
    const nms = new Float32Array(width * height);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const m = mag[i];
            if (m === 0) continue;

            // Round direction to 0, 45, 90, 135 degrees
            let angle = dir[i] * (180 / Math.PI);
            if (angle < 0) angle += 180;

            let m1 = 0, m2 = 0;
            if (angle < 22.5 || angle >= 157.5) {
                m1 = mag[i - 1]; m2 = mag[i + 1];
            } else if (angle < 67.5) {
                m1 = mag[i - width + 1]; m2 = mag[i + width - 1];
            } else if (angle < 112.5) {
                m1 = mag[i - width]; m2 = mag[i + width];
            } else {
                m1 = mag[i - width - 1]; m2 = mag[i + width + 1];
            }

            nms[i] = (m >= m1 && m >= m2) ? m : 0;
        }
    }
    return nms;
}

function hysteresisThreshold(nms, width, height, lowRatio, highRatio) {
    // Find automatic thresholds
    let maxVal = 0;
    for (let i = 0; i < nms.length; i++) {
        if (nms[i] > maxVal) maxVal = nms[i];
    }
    const highThresh = maxVal * highRatio;
    const lowThresh = maxVal * lowRatio;

    const result = new Uint8Array(width * height);
    const STRONG = 255, WEAK = 128;

    for (let i = 0; i < nms.length; i++) {
        if (nms[i] >= highThresh) result[i] = STRONG;
        else if (nms[i] >= lowThresh) result[i] = WEAK;
    }

    // Connect weak edges to strong edges
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            if (result[i] !== WEAK) continue;

            // Check 8-connected neighbors for strong edge
            let hasStrong = false;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (result[(y + dy) * width + (x + dx)] === STRONG) {
                        hasStrong = true;
                        break;
                    }
                }
                if (hasStrong) break;
            }
            result[i] = hasStrong ? STRONG : 0;
        }
    }

    return result;
}

// ─── HOUGH LINE TRANSFORM ─────────────────────────────────────────
function houghLines(edges, width, height, threshold) {
    const rhoMax = Math.ceil(Math.sqrt(width * width + height * height));
    const thetaSteps = 180;
    const accumulator = new Int32Array(2 * rhoMax * thetaSteps);

    // Precompute sin/cos
    const cosTable = new Float32Array(thetaSteps);
    const sinTable = new Float32Array(thetaSteps);
    for (let t = 0; t < thetaSteps; t++) {
        const theta = (t * Math.PI) / thetaSteps;
        cosTable[t] = Math.cos(theta);
        sinTable[t] = Math.sin(theta);
    }

    // Vote
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (edges[y * width + x] === 0) continue;
            for (let t = 0; t < thetaSteps; t++) {
                const rho = Math.round(x * cosTable[t] + y * sinTable[t]) + rhoMax;
                accumulator[rho * thetaSteps + t]++;
            }
        }
    }

    // Find peaks
    const lines = [];
    for (let r = 0; r < 2 * rhoMax; r++) {
        for (let t = 0; t < thetaSteps; t++) {
            const votes = accumulator[r * thetaSteps + t];
            if (votes < threshold) continue;

            // Local maximum check (3x3 neighborhood)
            let isMax = true;
            for (let dr = -2; dr <= 2 && isMax; dr++) {
                for (let dt = -2; dt <= 2 && isMax; dt++) {
                    if (dr === 0 && dt === 0) continue;
                    const nr = r + dr, nt = t + dt;
                    if (nr >= 0 && nr < 2 * rhoMax && nt >= 0 && nt < thetaSteps) {
                        if (accumulator[nr * thetaSteps + nt] > votes) isMax = false;
                    }
                }
            }
            if (isMax) {
                lines.push({
                    rho: r - rhoMax,
                    theta: (t * Math.PI) / thetaSteps,
                    votes,
                });
            }
        }
    }

    // Sort by votes descending
    lines.sort((a, b) => b.votes - a.votes);
    return lines;
}

// ─── FIND DOCUMENT CORNERS VIA LINE INTERSECTIONS ─────────────────
function lineIntersection(l1, l2) {
    const cos1 = Math.cos(l1.theta), sin1 = Math.sin(l1.theta);
    const cos2 = Math.cos(l2.theta), sin2 = Math.sin(l2.theta);
    const det = cos1 * sin2 - cos2 * sin1;
    if (Math.abs(det) < 1e-6) return null; // Parallel lines
    return {
        x: (l1.rho * sin2 - l2.rho * sin1) / det,
        y: (l2.rho * cos1 - l1.rho * cos2) / det,
    };
}

function findDocumentQuad(lines, width, height) {
    if (lines.length < 4) return null;

    // Separate lines into roughly horizontal and roughly vertical
    const horizontal = []; // theta near 90° (pi/2)
    const vertical = [];   // theta near 0° or 180°

    for (const line of lines.slice(0, 40)) { // Top 40 lines max
        const deg = (line.theta * 180) / Math.PI;
        if (deg > 45 && deg < 135) {
            horizontal.push(line);
        } else {
            vertical.push(line);
        }
    }

    if (horizontal.length < 2 || vertical.length < 2) return null;

    // Merge similar lines (within 15px rho and 5° theta)
    const mergeLines = (lines) => {
        const merged = [];
        const used = new Set();
        for (let i = 0; i < lines.length; i++) {
            if (used.has(i)) continue;
            let rhoSum = lines[i].rho;
            let thetaSum = lines[i].theta;
            let votesSum = lines[i].votes;
            let count = 1;
            for (let j = i + 1; j < lines.length; j++) {
                if (used.has(j)) continue;
                const dRho = Math.abs(lines[i].rho - lines[j].rho);
                const dTheta = Math.abs(lines[i].theta - lines[j].theta);
                if (dRho < 15 && dTheta < (5 * Math.PI) / 180) {
                    rhoSum += lines[j].rho;
                    thetaSum += lines[j].theta;
                    votesSum += lines[j].votes;
                    count++;
                    used.add(j);
                }
            }
            merged.push({
                rho: rhoSum / count,
                theta: thetaSum / count,
                votes: votesSum,
            });
            used.add(i);
        }
        return merged;
    };

    const hMerged = mergeLines(horizontal);
    const vMerged = mergeLines(vertical);

    if (hMerged.length < 2 || vMerged.length < 2) return null;

    // Sort horizontal by rho (top to bottom) and vertical by rho (left to right)
    hMerged.sort((a, b) => a.rho - b.rho);
    vMerged.sort((a, b) => a.rho - b.rho);

    // Try all combinations of 2 horizontal + 2 vertical to find best quadrilateral
    let bestQuad = null;
    let bestArea = 0;

    const hCount = Math.min(hMerged.length, 5);
    const vCount = Math.min(vMerged.length, 5);

    for (let h1 = 0; h1 < hCount; h1++) {
        for (let h2 = h1 + 1; h2 < hCount; h2++) {
            for (let v1 = 0; v1 < vCount; v1++) {
                for (let v2 = v1 + 1; v2 < vCount; v2++) {
                    const tl = lineIntersection(hMerged[h1], vMerged[v1]);
                    const tr = lineIntersection(hMerged[h1], vMerged[v2]);
                    const br = lineIntersection(hMerged[h2], vMerged[v2]);
                    const bl = lineIntersection(hMerged[h2], vMerged[v1]);

                    if (!tl || !tr || !br || !bl) continue;

                    // All corners must be within image bounds (with some margin)
                    const m = -width * 0.05;
                    const corners = [tl, tr, br, bl];
                    const inBounds = corners.every(c =>
                        c.x >= m && c.x <= width * 1.05 && c.y >= m && c.y <= height * 1.05
                    );
                    if (!inBounds) continue;

                    // Compute area using Shoelace formula
                    const area = 0.5 * Math.abs(
                        (tr.x - tl.x) * (br.y - tl.y) - (br.x - tl.x) * (tr.y - tl.y) +
                        (br.x - tl.x) * (bl.y - tl.y) - (bl.x - tl.x) * (br.y - tl.y)
                    );

                    // Must cover at least 8% of image
                    if (area < width * height * 0.08) continue;
                    // Must not exceed 98% (would be the whole image)
                    if (area > width * height * 0.98) continue;

                    // Check roughly rectangular (angles between 60-120°)
                    const angleBetween = (a, b, c) => {
                        const abx = a.x - b.x, aby = a.y - b.y;
                        const cbx = c.x - b.x, cby = c.y - b.y;
                        const dot = abx * cbx + aby * cby;
                        const cross = abx * cby - aby * cbx;
                        return Math.abs(Math.atan2(cross, dot)) * (180 / Math.PI);
                    };

                    const angles = [
                        angleBetween(bl, tl, tr),
                        angleBetween(tl, tr, br),
                        angleBetween(tr, br, bl),
                        angleBetween(br, bl, tl),
                    ];

                    if (!angles.every(a => a > 50 && a < 130)) continue;

                    if (area > bestArea) {
                        bestArea = area;
                        bestQuad = corners;
                    }
                }
            }
        }
    }

    return bestQuad; // [TL, TR, BR, BL] or null
}

// ─── PERSPECTIVE TRANSFORM ────────────────────────────────────────
function computeHomography(src, dst) {
    const A = [];
    for (let i = 0; i < 4; i++) {
        const sx = src[i].x, sy = src[i].y;
        const dx = dst[i].x, dy = dst[i].y;
        A.push([-sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx, dx]);
        A.push([0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy, dy]);
    }
    const n = 8;
    const M = A.map(row => [...row]);
    for (let col = 0; col < n; col++) {
        let maxRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
        }
        [M[col], M[maxRow]] = [M[maxRow], M[col]];
        if (Math.abs(M[col][col]) < 1e-10) continue;
        for (let row = 0; row < n; row++) {
            if (row === col) continue;
            const factor = M[row][col] / M[col][col];
            for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
        }
    }
    const h = [];
    for (let i = 0; i < n; i++) h.push(-M[i][n] / M[i][i]);
    h.push(1);
    return h;
}

function perspectiveWarp(srcCanvas, corners, outW, outH) {
    const dst = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }];
    const h = computeHomography(dst, corners);
    const srcCtx = srcCanvas.getContext('2d');
    const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = outW;
    dstCanvas.height = outH;
    const dstCtx = dstCanvas.getContext('2d');
    const dstData = dstCtx.createImageData(outW, outH);
    const sw = srcCanvas.width, sh = srcCanvas.height;
    const sd = srcData.data, dd = dstData.data;

    for (let dy = 0; dy < outH; dy++) {
        for (let dx = 0; dx < outW; dx++) {
            const w = h[6] * dx + h[7] * dy + h[8];
            const sx = Math.round((h[0] * dx + h[1] * dy + h[2]) / w);
            const sy = Math.round((h[3] * dx + h[4] * dy + h[5]) / w);
            if (sx >= 0 && sx < sw && sy >= 0 && sy < sh) {
                const si = (sy * sw + sx) * 4;
                const di = (dy * outW + dx) * 4;
                dd[di] = sd[si]; dd[di + 1] = sd[si + 1]; dd[di + 2] = sd[si + 2]; dd[di + 3] = 255;
            }
        }
    }
    dstCtx.putImageData(dstData, 0, 0);
    return dstCanvas;
}

// ─── MAIN DETECTION PIPELINE ──────────────────────────────────────
function detectAndCropDocument(imageBase64) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            // Work at reduced resolution for speed
            const maxDim = 500;
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            const imageData = ctx.getImageData(0, 0, w, h);
            const gray = toGrayscale(imageData);
            const blurred = gaussianBlur(gray, w, h);
            const { mag, dir } = sobelEdges(blurred, w, h);
            const nms = nonMaxSuppression(mag, dir, w, h);
            const edges = hysteresisThreshold(nms, w, h, 0.05, 0.15);

            // Hough line detection
            const minVotes = Math.max(30, Math.min(w, h) * 0.15);
            const lines = houghLines(edges, w, h, minVotes);

            const quad = findDocumentQuad(lines, w, h);

            if (quad) {
                // Scale corners back to full resolution
                const fullCorners = quad.map(c => ({
                    x: c.x / scale,
                    y: c.y / scale,
                }));

                // Full-res source canvas
                const fullCanvas = document.createElement('canvas');
                fullCanvas.width = img.width;
                fullCanvas.height = img.height;
                const fullCtx = fullCanvas.getContext('2d');
                fullCtx.drawImage(img, 0, 0);

                // Calculate output dimensions
                const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
                const outW = Math.round(Math.max(dist(fullCorners[0], fullCorners[1]), dist(fullCorners[3], fullCorners[2])));
                const outH = Math.round(Math.max(dist(fullCorners[0], fullCorners[3]), dist(fullCorners[1], fullCorners[2])));

                const cropped = perspectiveWarp(fullCanvas, fullCorners, outW, outH);
                resolve({
                    success: true,
                    croppedImage: cropped.toDataURL('image/jpeg', 0.92),
                    corners: fullCorners,
                });
            } else {
                // No document detected — return original
                resolve({
                    success: false,
                    croppedImage: imageBase64,
                    corners: null,
                });
            }
        };
        img.onerror = () => resolve({ success: false, croppedImage: imageBase64, corners: null });
        img.src = imageBase64;
    });
}

// ═══════════════════════════════════════════════════════════════════
// LIVE CAMERA COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function LiveCameraScanner({ onCapture, onClose }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const stableRef = useRef(0);
    const rafRef = useRef(null);

    const [phase, setPhase] = useState('camera'); // 'camera' | 'processing' | 'preview'
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const [contentDetected, setContentDetected] = useState(false);
    const [progress, setProgress] = useState(0);
    const [croppedImage, setCroppedImage] = useState(null);
    const [capturedRaw, setCapturedRaw] = useState(null);

    const STABLE_NEEDED = 50; // ~1.7 seconds

    // Start camera
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

    // Content detection loop (checks if there's something to scan in the guide area)
    useEffect(() => {
        if (!cameraReady || phase !== 'camera') return;

        // Wait 1 second before starting detection
        const warmup = setTimeout(() => {
            const checkContent = () => {
                const video = videoRef.current;
                if (!video || !video.videoWidth) {
                    rafRef.current = requestAnimationFrame(checkContent);
                    return;
                }

                // Sample the center 60% of the frame
                const vw = video.videoWidth, vh = video.videoHeight;
                const sampleCanvas = document.createElement('canvas');
                const sw = 160, sh = 120;
                sampleCanvas.width = sw;
                sampleCanvas.height = sh;
                const sCtx = sampleCanvas.getContext('2d');

                // Crop center 60%
                const cropX = vw * 0.2, cropY = vh * 0.2;
                const cropW = vw * 0.6, cropH = vh * 0.6;
                sCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, sw, sh);

                const data = sCtx.getImageData(0, 0, sw, sh).data;

                // Check for variation (standard deviation of brightness)
                let sum = 0, sumSq = 0;
                const n = sw * sh;
                for (let i = 0; i < n; i++) {
                    const idx = i * 4;
                    const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                    sum += lum;
                    sumSq += lum * lum;
                }
                const mean = sum / n;
                const variance = sumSq / n - mean * mean;
                const stdDev = Math.sqrt(Math.max(0, variance));

                // Also check for edge density
                let edgePixels = 0;
                for (let y = 1; y < sh - 1; y++) {
                    for (let x = 1; x < sw - 1; x += 2) {
                        const i = y * sw + x;
                        const idx = i * 4;
                        const cur = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                        const right = 0.299 * data[idx + 4] + 0.587 * data[idx + 5] + 0.114 * data[idx + 6];
                        const below = 0.299 * data[(i + sw) * 4] + 0.587 * data[(i + sw) * 4 + 1] + 0.114 * data[(i + sw) * 4 + 2];
                        if (Math.abs(cur - right) > 25 || Math.abs(cur - below) > 25) edgePixels++;
                    }
                }
                const edgeRatio = edgePixels / (n / 2);

                // Content present if there's enough variation AND edges
                const hasContent = stdDev > 30 && edgeRatio > 0.03;

                if (hasContent) {
                    stableRef.current = Math.min(stableRef.current + 1, STABLE_NEEDED);
                } else {
                    stableRef.current = Math.max(0, stableRef.current - 3);
                }

                setContentDetected(hasContent);
                setProgress(stableRef.current / STABLE_NEEDED);

                // Auto-capture when stable
                if (stableRef.current >= STABLE_NEEDED) {
                    captureFrame();
                    return;
                }

                rafRef.current = requestAnimationFrame(checkContent);
            };

            rafRef.current = requestAnimationFrame(checkContent);
        }, 1000);

        return () => {
            clearTimeout(warmup);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [cameraReady, phase]);

    // Capture and process
    const captureFrame = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        const raw = canvas.toDataURL('image/jpeg', 0.92);

        // Stop camera
        streamRef.current?.getTracks().forEach(t => t.stop());

        setCapturedRaw(raw);
        setPhase('processing');

        // Run detection pipeline
        detectAndCropDocument(raw).then(result => {
            setCroppedImage(result.croppedImage);
            setPhase('preview');
        });
    }, []);

    // Manual capture
    const handleManualCapture = useCallback(() => {
        if (phase !== 'camera' || !cameraReady) return;
        stableRef.current = STABLE_NEEDED;
        captureFrame();
    }, [phase, cameraReady, captureFrame]);

    // Retry
    const handleRetry = useCallback(() => {
        setCroppedImage(null);
        setCapturedRaw(null);
        setProgress(0);
        stableRef.current = 0;
        setContentDetected(false);
        setPhase('camera');

        // Restart camera
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

    // Use image
    const handleUseImage = useCallback(() => {
        onCapture(croppedImage || capturedRaw);
    }, [croppedImage, capturedRaw, onCapture]);

    // ─── RENDER ─────────────────────────────────────────────────────
    return (
        <div style={styles.container}>
            {/* === CAMERA PHASE === */}
            {phase === 'camera' && (
                <>
                    <div style={styles.viewfinder}>
                        <video ref={videoRef} playsInline muted style={styles.video} />

                        {/* Guide frame overlay */}
                        {cameraReady && (
                            <div style={styles.guideOverlay}>
                                <div style={{
                                    ...styles.guideFrame,
                                    borderColor: contentDetected
                                        ? progress >= 1 ? '#22c55e' : '#00d4ff'
                                        : 'rgba(255,255,255,0.3)',
                                }}>
                                    {/* Corner brackets */}
                                    <div style={{ ...styles.cornerBracket, top: -2, left: -2, borderTop: '3px solid', borderLeft: '3px solid', borderColor: 'inherit' }} />
                                    <div style={{ ...styles.cornerBracket, top: -2, right: -2, borderTop: '3px solid', borderRight: '3px solid', borderColor: 'inherit' }} />
                                    <div style={{ ...styles.cornerBracket, bottom: -2, right: -2, borderBottom: '3px solid', borderRight: '3px solid', borderColor: 'inherit' }} />
                                    <div style={{ ...styles.cornerBracket, bottom: -2, left: -2, borderBottom: '3px solid', borderLeft: '3px solid', borderColor: 'inherit' }} />
                                </div>
                            </div>
                        )}

                        {/* Status */}
                        {cameraReady && (
                            <div style={styles.statusBar}>
                                <div style={{
                                    ...styles.statusDot,
                                    background: contentDetected
                                        ? progress >= 1 ? '#22c55e' : '#00d4ff'
                                        : 'rgba(255,255,255,0.3)',
                                }} />
                                <span style={styles.statusText}>
                                    {contentDetected
                                        ? progress >= 1 ? 'Capturing...' : 'Hold steady...'
                                        : 'Position receipt in frame'}
                                </span>
                            </div>
                        )}

                        {/* Progress ring */}
                        {cameraReady && contentDetected && progress > 0 && progress < 1 && (
                            <div style={styles.progressRing}>
                                <svg width="56" height="56" viewBox="0 0 56 56">
                                    <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                                    <circle cx="28" cy="28" r="24" fill="none" stroke="#00d4ff" strokeWidth="3"
                                        strokeDasharray={`${2 * Math.PI * 24}`}
                                        strokeDashoffset={`${2 * Math.PI * 24 * (1 - progress)}`}
                                        strokeLinecap="round" transform="rotate(-90 28 28)"
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
                            Auto-captures when receipt is detected · Or tap capture button
                        </p>
                    </div>
                </>
            )}

            {/* === PROCESSING PHASE === */}
            {phase === 'processing' && (
                <div style={styles.processingView}>
                    <div style={styles.spinner} />
                    <span style={{ color: '#fff', fontSize: 14, marginTop: 12 }}>Detecting & cropping receipt...</span>
                </div>
            )}

            {/* === PREVIEW PHASE === */}
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
        @keyframes liveScanFlash { 0% { opacity: 0.8; } 100% { opacity: 0; } }
        @keyframes liveScanSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════
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
        aspectRatio: '3/4',
        background: '#111',
        overflow: 'hidden',
    },
    video: { width: '100%', height: '100%', objectFit: 'cover' },
    guideOverlay: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
    },
    guideFrame: {
        position: 'relative',
        width: '80%',
        height: '70%',
        border: '2px solid rgba(255,255,255,0.3)',
        borderRadius: 8,
        transition: 'border-color 0.3s ease',
    },
    cornerBracket: {
        position: 'absolute',
        width: 24,
        height: 24,
    },
    statusBar: {
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        background: 'rgba(0,0,0,0.65)',
        borderRadius: 20,
        backdropFilter: 'blur(8px)',
    },
    statusDot: { width: 8, height: 8, borderRadius: '50%', transition: 'background 0.2s' },
    statusText: { color: '#fff', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, -apple-system, sans-serif' },
    progressRing: { position: 'absolute', bottom: 16, right: 16 },
    errorState: {
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: '#111', padding: 24,
    },
    loadingState: {
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12, background: '#111',
    },
    spinner: {
        width: 28, height: 28,
        border: '2px solid rgba(255,255,255,0.1)',
        borderTopColor: '#00d4ff',
        borderRadius: '50%',
        animation: 'liveScanSpin 0.8s linear infinite',
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
        border: '3px solid rgba(255,255,255,0.8)',
        background: 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    },
    captureBtnInner: { width: 52, height: 52, borderRadius: '50%', background: '#fff' },
    hint: { padding: '4px 16px 14px', background: '#000' },

    // Processing
    processingView: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px', background: '#111',
    },

    // Preview
    previewHeader: {
        padding: '14px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: '#1a1b1e',
    },
    previewArea: {
        padding: 16,
        background: '#000',
        display: 'flex',
        justifyContent: 'center',
        maxHeight: 400,
        overflow: 'auto',
    },
    previewImage: {
        maxWidth: '100%',
        maxHeight: 380,
        objectFit: 'contain',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
    },
    previewActions: {
        display: 'flex',
        gap: 12,
        padding: '16px 20px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: '#1a1b1e',
    },
    retryBtn: {
        flex: 1, padding: '14px 16px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 10, color: 'rgba(255,255,255,0.7)',
        fontFamily: 'Inter, -apple-system, sans-serif', fontSize: 15, fontWeight: 600, cursor: 'pointer',
    },
    useBtn: {
        flex: 1, padding: '14px 16px',
        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        border: 'none', borderRadius: 10, color: '#fff',
        fontFamily: 'Inter, -apple-system, sans-serif', fontSize: 15, fontWeight: 600, cursor: 'pointer',
    },
};
