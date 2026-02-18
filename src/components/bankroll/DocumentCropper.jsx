/**
 * DOCUMENT CROPPER COMPONENT
 * iOS Notes-style document scanner with edge detection and perspective warp
 * Pure client-side Canvas processing — zero AI APIs, zero external dependencies
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── MATH HELPERS ─────────────────────────────────────────────────
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function orderCorners(pts) {
    // Sort by y first, then by x to get TL, TR, BL, BR
    const sorted = [...pts].sort((a, b) => a.y - b.y);
    const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottom = sorted.slice(2).sort((a, b) => a.x - b.x);
    return [top[0], top[1], bottom[1], bottom[0]]; // TL, TR, BR, BL
}

// ─── EDGE DETECTION (Sobel-based) ─────────────────────────────────
function detectEdges(imageData, width, height) {
    const gray = new Float32Array(width * height);
    const d = imageData.data;

    // Convert to grayscale
    for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        gray[i] = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
    }

    // Gaussian blur (3x3)
    const blurred = new Float32Array(width * height);
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let sum = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    sum += gray[(y + ky) * width + (x + kx)] * kernel[(ky + 1) * 3 + (kx + 1)];
                }
            }
            blurred[y * width + x] = sum / 16;
        }
    }

    // Sobel gradient magnitude
    const edges = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const gx =
                -blurred[(y - 1) * width + (x - 1)] + blurred[(y - 1) * width + (x + 1)]
                - 2 * blurred[y * width + (x - 1)] + 2 * blurred[y * width + (x + 1)]
                - blurred[(y + 1) * width + (x - 1)] + blurred[(y + 1) * width + (x + 1)];
            const gy =
                -blurred[(y - 1) * width + (x - 1)] - 2 * blurred[(y - 1) * width + x] - blurred[(y - 1) * width + (x + 1)]
                + blurred[(y + 1) * width + (x - 1)] + 2 * blurred[(y + 1) * width + x] + blurred[(y + 1) * width + (x + 1)];
            edges[y * width + x] = Math.sqrt(gx * gx + gy * gy);
        }
    }

    return edges;
}

// ─── FIND DOCUMENT CONTOUR ────────────────────────────────────────
function findDocumentCorners(edges, width, height) {
    // Threshold edge map
    let maxEdge = 0;
    for (let i = 0; i < edges.length; i++) {
        if (edges[i] > maxEdge) maxEdge = edges[i];
    }
    const threshold = maxEdge * 0.15;

    // Accumulate edge points in quadrants
    const cx = width / 2, cy = height / 2;
    const quadrants = [[], [], [], []]; // TL, TR, BR, BL

    const step = 2; // Sample every 2nd pixel for speed
    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            if (edges[y * width + x] > threshold) {
                const qx = x < cx ? 0 : 1;
                const qy = y < cy ? 0 : 1;
                const qi = qy * 2 + qx; // 0=TL, 1=TR, 2=BL, 3=BR
                quadrants[qi].push({ x, y });
            }
        }
    }

    // For each quadrant, find the point furthest from center
    const margin = Math.min(width, height) * 0.05;
    const defaultCorners = [
        { x: margin, y: margin },               // TL
        { x: width - margin, y: margin },        // TR
        { x: margin, y: height - margin },       // BL
        { x: width - margin, y: height - margin } // BR
    ];

    const corners = [];
    const targets = [
        { x: 0, y: 0 },               // TL: furthest toward top-left
        { x: width, y: 0 },           // TR: furthest toward top-right
        { x: 0, y: height },          // BL: furthest toward bottom-left
        { x: width, y: height },      // BR: furthest toward bottom-right
    ];

    for (let i = 0; i < 4; i++) {
        if (quadrants[i].length < 10) {
            corners.push(defaultCorners[i]);
            continue;
        }

        // Find point furthest from center (closest to corner of image)
        let best = quadrants[i][0];
        let bestDist = dist(best, targets[i]);
        for (const p of quadrants[i]) {
            const d = dist(p, targets[i]);
            if (d < bestDist) {
                bestDist = d;
                best = p;
            }
        }
        corners.push(best);
    }

    // Reorder: [TL, TR, BR, BL]
    return orderCorners(corners);
}

// ─── PERSPECTIVE TRANSFORM ────────────────────────────────────────
function computeHomography(src, dst) {
    // Build 8x8 matrix for solving homography via DLT
    const A = [];
    for (let i = 0; i < 4; i++) {
        const sx = src[i].x, sy = src[i].y;
        const dx = dst[i].x, dy = dst[i].y;
        A.push([-sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx, dx]);
        A.push([0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy, dy]);
    }

    // Gaussian elimination to solve Ah = 0
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
            for (let j = col; j <= n; j++) {
                M[row][j] -= factor * M[col][j];
            }
        }
    }

    const h = [];
    for (let i = 0; i < n; i++) {
        h.push(-M[i][n] / M[i][i]);
    }
    h.push(1);

    return h; // 3x3 matrix in row-major: [h0,h1,h2, h3,h4,h5, h6,h7,h8]
}

function applyHomography(h, x, y) {
    const w = h[6] * x + h[7] * y + h[8];
    return {
        x: (h[0] * x + h[1] * y + h[2]) / w,
        y: (h[3] * x + h[4] * y + h[5]) / w,
    };
}

function perspectiveWarp(srcCanvas, corners, outputWidth, outputHeight) {
    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = outputWidth;
    dstCanvas.height = outputHeight;
    const dstCtx = dstCanvas.getContext('2d');
    const srcCtx = srcCanvas.getContext('2d');
    const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const dstData = dstCtx.createImageData(outputWidth, outputHeight);

    // Map destination rectangle corners to source corners
    const dst = [
        { x: 0, y: 0 },
        { x: outputWidth, y: 0 },
        { x: outputWidth, y: outputHeight },
        { x: 0, y: outputHeight },
    ];

    // Inverse homography: map from dst → src
    const h = computeHomography(dst, corners);

    const sw = srcCanvas.width, sh = srcCanvas.height;
    const sd = srcData.data, dd = dstData.data;

    for (let dy = 0; dy < outputHeight; dy++) {
        for (let dx = 0; dx < outputWidth; dx++) {
            const src = applyHomography(h, dx, dy);
            const sx = Math.round(src.x), sy = Math.round(src.y);

            if (sx >= 0 && Sx < sw && sy >= 0 && Sy < sh) {
                const si = (sy * sw + sx) * 4;
                const di = (dy * outputWidth + dx) * 4;
                dd[di] = sd[si];
                dd[di + 1] = sd[si + 1];
                dd[di + 2] = sd[si + 2];
                dd[di + 3] = 255;
            }
        }
    }

    dstCtx.putImageData(dstData, 0, 0);
    return dstCanvas;
}

// ─── COMPONENT ────────────────────────────────────────────────────
export default function DocumentCropper({ imageSrc, onConfirm, onCancel }) {
    const canvasRef = useRef(null);
    const overlayRef = useRef(null);
    const imgRef = useRef(null);
    const [corners, setCorners] = useState(null);
    const [dragging, setDragging] = useState(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [displayScale, setDisplayScale] = useState(1);

    // Load image and detect edges
    useEffect(() => {
        if (!imageSrc) return;

        const img = new Image();
        img.onload = () => {
            imgRef.current = img;

            // Scale for display (max 600px wide for the UI)
            const maxW = Math.min(600, window.innerWidth - 48);
            const scale = maxW / img.width;
            const dispW = Math.round(img.width * scale);
            const dispH = Math.round(img.height * scale);
            setDisplayScale(scale);

            // Draw to hidden canvas for edge detection
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Detect edges at reduced resolution for speed
            const detectW = Math.min(img.width, 400);
            const detectScale = detectW / img.width;
            const detectH = Math.round(img.height * detectScale);

            const detectCanvas = document.createElement('canvas');
            detectCanvas.width = detectW;
            detectCanvas.height = detectH;
            const detectCtx = detectCanvas.getContext('2d');
            detectCtx.drawImage(img, 0, 0, detectW, detectH);
            const detectData = detectCtx.getImageData(0, 0, detectW, detectH);

            const edges = detectEdges(detectData, detectW, detectH);
            let detected = findDocumentCorners(edges, detectW, detectH);

            // Scale corners back to full image resolution
            detected = detected.map(c => ({
                x: c.x / detectScale,
                y: c.y / detectScale,
            }));

            setCorners(detected);
            setImageLoaded(true);

            // Set up display canvas
            if (canvasRef.current) {
                canvasRef.current.width = dispW;
                canvasRef.current.height = dispH;
            }
            if (overlayRef.current) {
                overlayRef.current.width = dispW;
                overlayRef.current.height = dispH;
            }
        };
        img.src = imageSrc;
    }, [imageSrc]);

    // Draw overlay with quad, handles, and dark mask
    const drawOverlay = useCallback(() => {
        if (!overlayRef.current || !corners || !imgRef.current) return;
        const ctx = overlayRef.current.getContext('2d');
        const w = overlayRef.current.width;
        const h = overlayRef.current.height;
        const s = displayScale;

        ctx.clearRect(0, 0, w, h);

        // Draw image
        ctx.drawImage(imgRef.current, 0, 0, w, h);

        // Dark overlay outside selection
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, w, h);

        // Cut out the selected region
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.moveTo(corners[0].x * s, corners[0].y * s);
        ctx.lineTo(corners[1].x * s, corners[1].y * s);
        ctx.lineTo(corners[2].x * s, corners[2].y * s);
        ctx.lineTo(corners[3].x * s, corners[3].y * s);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Draw quad border
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(corners[0].x * s, corners[0].y * s);
        for (let i = 1; i <= 3; i++) {
            ctx.lineTo(corners[i].x * s, corners[i].y * s);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw edge guidelines (dashed extension lines)
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        for (let i = 0; i < 4; i++) {
            const c = corners[i];
            // Horizontal guide
            ctx.beginPath();
            ctx.moveTo(0, c.y * s);
            ctx.lineTo(w, c.y * s);
            ctx.stroke();
            // Vertical guide
            ctx.beginPath();
            ctx.moveTo(c.x * s, 0);
            ctx.lineTo(c.x * s, h);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Draw corner handles
        const handleSize = 12;
        for (let i = 0; i < 4; i++) {
            const cx = corners[i].x * s;
            const cy = corners[i].y * s;

            // Outer glow
            ctx.beginPath();
            ctx.arc(cx, cy, handleSize + 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 212, 255, 0.2)';
            ctx.fill();

            // Handle circle
            ctx.beginPath();
            ctx.arc(cx, cy, handleSize, 0, Math.PI * 2);
            ctx.fillStyle = '#00d4ff';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Inner dot
            ctx.beginPath();
            ctx.arc(cx, cy, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        }
    }, [corners, displayScale]);

    useEffect(() => {
        drawOverlay();
    }, [drawOverlay]);

    // ─── Touch / Mouse interaction for corner dragging ──────────
    const getEventPos = (e) => {
        const rect = overlayRef.current.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top,
        };
    };

    const handlePointerDown = (e) => {
        e.preventDefault();
        if (!corners) return;
        const pos = getEventPos(e);
        const s = displayScale;
        const hitRadius = 30; // Touch-friendly

        for (let i = 0; i < 4; i++) {
            const dx = pos.x - corners[i].x * s;
            const dy = pos.y - corners[i].y * s;
            if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
                setDragging(i);
                return;
            }
        }
    };

    const handlePointerMove = (e) => {
        if (dragging === null || !corners || !imgRef.current) return;
        e.preventDefault();
        const pos = getEventPos(e);
        const s = displayScale;
        const newCorners = [...corners];
        newCorners[dragging] = {
            x: clamp(pos.x / s, 0, imgRef.current.width),
            y: clamp(pos.y / s, 0, imgRef.current.height),
        };
        setCorners(newCorners);
    };

    const handlePointerUp = () => {
        setDragging(null);
    };

    // ─── Confirm crop ──────────────────────────────────────────
    const handleCrop = async () => {
        if (!corners || !imgRef.current) return;
        setProcessing(true);

        try {
            // Draw full-res source to canvas
            const srcCanvas = document.createElement('canvas');
            srcCanvas.width = imgRef.current.width;
            srcCanvas.height = imgRef.current.height;
            const srcCtx = srcCanvas.getContext('2d');
            srcCtx.drawImage(imgRef.current, 0, 0);

            // Calculate output dimensions from corner distances
            const topEdge = dist(corners[0], corners[1]);
            const bottomEdge = dist(corners[3], corners[2]);
            const leftEdge = dist(corners[0], corners[3]);
            const rightEdge = dist(corners[1], corners[2]);

            const outW = Math.round(Math.max(topEdge, bottomEdge));
            const outH = Math.round(Math.max(leftEdge, rightEdge));

            // Perspective warp
            const result = perspectiveWarp(srcCanvas, corners, outW, outH);
            const croppedBase64 = result.toDataURL('image/jpeg', 0.92);

            onConfirm(croppedBase64);
        } catch (err) {
            console.error('Crop error:', err);
            // Fallback: return original
            onConfirm(imageSrc);
        } finally {
            setProcessing(false);
        }
    };

    if (!imageSrc) return null;

    return (
        <div style={styles.overlay}>
            <div style={styles.container}>
                {/* Header */}
                <div style={styles.header}>
                    <span style={styles.title}>Adjust Corners</span>
                    <span style={styles.hint}>Drag Corners To Fit The Receipt</span>
                </div>

                {/* Canvas area */}
                <div style={styles.canvasWrap}>
                    {!imageLoaded && (
                        <div style={styles.loading}>
                            <div style={styles.spinner} />
                            Detecting edges...
                        </div>
                    )}
                    <canvas
                        ref={overlayRef}
                        style={styles.canvas}
                        onMouseDown={handlePointerDown}
                        onMouseMove={handlePointerMove}
                        onMouseUp={handlePointerUp}
                        onMouseLeave={handlePointerUp}
                        onTouchStart={handlePointerDown}
                        onTouchMove={handlePointerMove}
                        onTouchEnd={handlePointerUp}
                    />
                </div>

                {/* Actions */}
                <div style={styles.actions}>
                    <button onClick={onCancel} style={styles.skipBtn}>
                        Use Original
                    </button>
                    <button
                        onClick={handleCrop}
                        disabled={processing || !imageLoaded}
                        style={{
                            ...styles.cropBtn,
                            opacity: processing || !imageLoaded ? 0.5 : 1,
                        }}
                    >
                        {processing ? 'Cropping...' : 'Crop & Scan'}
                    </button>
                </div>
            </div>

            <style jsx global>{`
        @keyframes docCropSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}

// ─── STYLES ───────────────────────────────────────────────────────
const styles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 16,
    },
    container: {
        background: '#1a1b1e',
        borderRadius: 16,
        maxWidth: 640,
        width: '100%',
        overflow: 'hidden',
        border: '2px solid rgba(255, 255, 255, 0.1)',
    },
    header: {
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
    },
    hint: {
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    canvasWrap: {
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 300,
        background: '#000',
    },
    canvas: {
        display: 'block',
        maxWidth: '100%',
        cursor: 'crosshair',
        touchAction: 'none',
    },
    loading: {
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
    },
    spinner: {
        width: 24,
        height: 24,
        border: '2px solid rgba(255, 255, 255, 0.1)',
        borderTopColor: '#00d4ff',
        borderRadius: '50%',
        animation: 'docCropSpin 0.8s linear infinite',
    },
    actions: {
        display: 'flex',
        gap: 12,
        padding: '16px 20px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    },
    skipBtn: {
        flex: 1,
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.06)',
        border: '2px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 10,
        color: 'rgba(255, 255, 255, 0.7)',
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    cropBtn: {
        flex: 1,
        padding: '12px 16px',
        background: 'linear-gradient(135deg, #00d4ff 0%, #0090ff 100%)',
        border: 'none',
        borderRadius: 10,
        color: '#000',
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
};
