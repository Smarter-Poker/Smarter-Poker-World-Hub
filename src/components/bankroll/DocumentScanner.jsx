/**
 * DOCUMENT SCANNER
 *
 * Point the phone at a receipt, get back a cropped, perspective-corrected scan
 * with the background removed. Replaces the previous capture, which waited on a
 * global `cv` that nothing loads and so timed out on every device.
 *
 * Flow: Scan Receipt -> Capture -> Review / Adjust -> Use Scan.
 *
 * Two rules shape the whole component:
 *
 *  1. Detection runs on a small frame; correction runs on the full-resolution
 *     one. The live preview is never the thing that gets saved. Coordinates are
 *     carried across three spaces (display, detection, source) and every hop is
 *     a single scalar, computed where the scale is known.
 *
 *  2. The pristine source stays in memory for the life of the editor. Rotating,
 *     re-cornering and re-filtering all regenerate from it, so nothing
 *     accumulates resampling or JPEG damage across edits.
 *
 * Nothing here uploads. The caller gets a blob only when the user presses
 * Use Scan.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Camera, Upload, X, Check, Loader2, RefreshCw, Maximize2, AlertTriangle,
    RotateCw, Image as ImageIcon,
} from 'lucide-react';
import { METAL, GRADIENTS } from './metalStyles';
import { createScanClient } from '../../lib/docscan/scanClient';
import {
    decodeToImageData,
    downscaleImageData,
    frameFromVideo,
    rgbaToBlob,
    UndecodableImageError,
} from '../../lib/docscan/imageSource';
import {
    fallbackQuad,
    scaleQuad,
    quadMotion,
    validateQuad,
    outputSizeFor,
    dist,
} from '../../lib/docscan/pipeline.mjs';

// Live detection frame size. Small enough for a steady preview on a mid-range
// phone, large enough that a receipt edge is still several pixels of gradient.
const LIVE_DETECT_DIM = 384;
// Uploads and captured stills get a closer look; there is no frame budget.
const STILL_DETECT_DIM = 720;
const DETECT_INTERVAL_MS = 110;

// Auto-capture gates. All four must hold, for STABLE_FRAMES consecutive
// detections, before the shutter fires on its own.
const AUTO = {
    minConfidence: 0.42,
    minSupport: 0.42,
    maxMotion: 0.014,      // mean corner travel, fraction of the frame diagonal
    minSharpness: 26,      // variance of the Laplacian
    minExposure: 0.7,      // fraction of pixels neither crushed nor blown out
    stableFrames: 5,
};

const FILTER_OPTIONS = [
    { id: 'original', label: 'Original Color' },
    { id: 'enhanced', label: 'Enhanced' },
    { id: 'grayscale', label: 'Grayscale' },
    { id: 'bw', label: 'Black & White' },
];

// Manual corners may legitimately select a small or unusual region, so only the
// genuinely broken shapes are refused.
const MANUAL_QUAD_RULES = {
    minAreaFraction: 0.004,
    maxAreaFraction: 1,
    minCornerAngleDeg: 12,
    maxAspectRatio: 60,
};

function cameraErrorFor(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return {
            title: 'Camera Access Blocked',
            body: 'Smarter.Poker does not have permission to use the camera. Allow it in your browser settings, or upload a photo instead.',
        };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return { title: 'No Camera Found', body: 'This device has no camera available. Upload a photo instead.' };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
        return {
            title: 'Camera In Use',
            body: 'Another app or tab is using the camera. Close it and try again, or upload a photo instead.',
        };
    }
    if (name === 'OverconstrainedError') {
        return { title: 'Camera Not Supported', body: 'This camera cannot be started for scanning. Upload a photo instead.' };
    }
    if (err && err.message === 'insecure-context') {
        return { title: 'Secure Connection Required', body: 'Live camera capture needs an HTTPS connection. Upload a photo instead.' };
    }
    return { title: 'Camera Unavailable', body: 'The scanner could not start the camera. Upload a photo instead.' };
}

export default function DocumentScanner({
    title = 'Scan Receipt',
    initialImage = null,
    onUse,
    onClose,
}) {
    // starting | camera | processing | review | corners | camera-error | decode-error
    const [phase, setPhase] = useState(initialImage ? 'processing' : 'starting');
    const [statusText, setStatusText] = useState('Position Receipt Inside Frame');
    const [autoCapture, setAutoCapture] = useState(true);
    const [detected, setDetected] = useState(false);
    const [stability, setStability] = useState(0);
    const [cameraError, setCameraError] = useState(null);
    const [decodeError, setDecodeError] = useState(null);
    const [cameras, setCameras] = useState([]);
    const [cameraIndex, setCameraIndex] = useState(0);
    const [filter, setFilter] = useState('original');
    const [quarterTurns, setQuarterTurns] = useState(0);
    const [showSource, setShowSource] = useState(false);
    const [cornerNotice, setCornerNotice] = useState(null);
    const [busy, setBusy] = useState(false);
    const [detectionFailed, setDetectionFailed] = useState(false);
    const [draftCorners, setDraftCorners] = useState(null);
    const [dragging, setDragging] = useState(null);
    const [dragPoint, setDragPoint] = useState(null);
    // Bumped on resize and orientation change so the corner editor re-fits.
    const [layoutTick, setLayoutTick] = useState(0);
    // Bumped whenever a new set of preview pixels is ready to paint.
    const [previewVersion, setPreviewVersion] = useState(0);

    const videoRef = useRef(null);
    const overlayRef = useRef(null);
    const previewCanvasRef = useRef(null);
    const sourceCanvasRef = useRef(null);
    const cornerCanvasRef = useRef(null);
    const loupeCanvasRef = useRef(null);

    const streamRef = useRef(null);
    const clientRef = useRef(null);
    const timerRef = useRef(null);
    const rafRef = useRef(null);
    const capturingRef = useRef(false);
    const detectBusyRef = useRef(false);
    const pausedRef = useRef(false);
    const mountedRef = useRef(true);

    const pickerRef = useRef(null);
    const captureRef = useRef(null);
    const draggingRef = useRef(null);

    const smoothQuadRef = useRef(null);      // detection-space, smoothed for drawing
    const lastQuadRef = useRef(null);        // detection-space, raw previous frame
    const detectScaleRef = useRef(1);        // detection space -> video space
    const detectWidthRef = useRef(0);        // width of the frame those corners came from
    const stableCountRef = useRef(0);

    const sourceRef = useRef(null);          // { data, width, height } pristine
    const quadRef = useRef(null);            // source-space corners
    const baseRef = useRef(null);            // rectified, unfiltered, rotated
    const previewRef = useRef(null);         // rectified + filtered, what gets saved

    if (!clientRef.current && typeof window !== 'undefined') {
        clientRef.current = createScanClient();
    }

    // -----------------------------------------------------------------------
    // TEARDOWN. Every path out of this component runs through here.
    // -----------------------------------------------------------------------

    const stopCamera = useCallback(() => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        const stream = streamRef.current;
        streamRef.current = null;
        if (stream) stream.getTracks().forEach((track) => track.stop());
        const video = videoRef.current;
        if (video) {
            try { video.pause(); } catch (_e) { /* already stopped */ }
            video.srcObject = null;
        }
    }, []);

    const releaseBuffers = useCallback(() => {
        sourceRef.current = null;
        baseRef.current = null;
        previewRef.current = null;
        quadRef.current = null;
        smoothQuadRef.current = null;
        lastQuadRef.current = null;
        for (const ref of [previewCanvasRef, sourceCanvasRef, cornerCanvasRef, loupeCanvasRef, overlayRef]) {
            const c = ref.current;
            if (c) { c.width = 0; c.height = 0; }
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            stopCamera();
            releaseBuffers();
            if (clientRef.current) { clientRef.current.dispose(); clientRef.current = null; }
        };
    }, [stopCamera, releaseBuffers]);

    const handleClose = useCallback(() => {
        stopCamera();
        releaseBuffers();
        if (onClose) onClose();
    }, [stopCamera, releaseBuffers, onClose]);

    // -----------------------------------------------------------------------
    // CAMERA
    // -----------------------------------------------------------------------

    const startCamera = useCallback(async (deviceId) => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const insecure = typeof window !== 'undefined' && !window.isSecureContext;
            setCameraError(cameraErrorFor(insecure ? new Error('insecure-context') : new Error('unsupported')));
            setPhase('camera-error');
            return;
        }

        stopCamera();
        capturingRef.current = false;
        stableCountRef.current = 0;
        smoothQuadRef.current = null;
        lastQuadRef.current = null;
        setStability(0);
        setDetected(false);
        setPhase('starting');

        // The rear camera is a preference, not a requirement: `ideal` lets a
        // laptop with only a front camera still open the scanner.
        const attempts = [
            deviceId
                ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }
                : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
            { video: { facingMode: { ideal: 'environment' } }, audio: false },
            { video: true, audio: false },
        ];

        let stream = null;
        let lastError = null;
        for (const constraints of attempts) {
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                break;
            } catch (err) {
                lastError = err;
                // Permission and hardware failures will not be fixed by relaxing
                // constraints, so stop asking.
                if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError' || err.name === 'NotFoundError')) break;
            }
        }

        if (!stream) {
            setCameraError(cameraErrorFor(lastError));
            setPhase('camera-error');
            return;
        }
        if (!mountedRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
        }

        streamRef.current = stream;
        stream.getVideoTracks().forEach((track) => {
            track.addEventListener('ended', () => {
                if (!mountedRef.current || capturingRef.current) return;
                setCameraError({ title: 'Camera Stopped', body: 'The camera was disconnected or taken over by another app.' });
                setPhase('camera-error');
            });
        });

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        try {
            await video.play();
        } catch (_err) {
            // Autoplay can be refused until a gesture; the shutter still works
            // and the browser starts the stream on first interaction.
        }
        if (!mountedRef.current) return;
        setPhase('camera');

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter((d) => d.kind === 'videoinput');
            if (mountedRef.current) setCameras(videoInputs);
        } catch (_err) {
            // Device labels need permission on some browsers; not fatal.
        }
    }, [stopCamera]);

    useEffect(() => {
        if (initialImage) return undefined;
        startCamera();
        return undefined;
        // startCamera is stable; re-running on every render would restart the stream.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Backgrounding: stop feeding frames to the detector, and pick up on return.
    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const onVisibility = () => {
            pausedRef.current = document.hidden;
            if (!document.hidden && phase === 'camera' && videoRef.current) {
                videoRef.current.play().catch(() => { /* resumed on next gesture */ });
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [phase]);

    // -----------------------------------------------------------------------
    // LIVE DETECTION
    // -----------------------------------------------------------------------

    const runDetection = useCallback(async () => {
        const video = videoRef.current;
        const client = clientRef.current;
        if (!video || !client || capturingRef.current || pausedRef.current || detectBusyRef.current) return;
        if (!video.videoWidth) return;

        detectBusyRef.current = true;
        try {
            const frame = frameFromVideo(video, LIVE_DETECT_DIM);
            if (!frame) return;
            detectScaleRef.current = video.videoWidth / frame.width;
            detectWidthRef.current = frame.width;

            const { detection, sharpness, exposure } = await client.detect(frame, { detectMaxDim: LIVE_DETECT_DIM });
            if (!mountedRef.current || capturingRef.current) return;

            if (!detection) {
                stableCountRef.current = 0;
                lastQuadRef.current = null;
                smoothQuadRef.current = null;
                setDetected(false);
                setStability(0);
                setStatusText('Position Receipt Inside Frame');
                return;
            }

            const motion = quadMotion(lastQuadRef.current, detection.quad, frame.width, frame.height);
            lastQuadRef.current = detection.quad;

            // Smooth only what is drawn. The capture uses the raw corners.
            const prev = smoothQuadRef.current;
            smoothQuadRef.current = prev
                ? detection.quad.map((p, i) => ({
                    x: prev[i].x + (p.x - prev[i].x) * 0.45,
                    y: prev[i].y + (p.y - prev[i].y) * 0.45,
                }))
                : detection.quad;

            setDetected(true);

            const steady = motion <= AUTO.maxMotion;
            const confident = detection.confidence >= AUTO.minConfidence && detection.support >= AUTO.minSupport;
            const sharp = sharpness >= AUTO.minSharpness;
            const lit = exposure >= AUTO.minExposure;

            if (steady && confident && sharp && lit) {
                stableCountRef.current = Math.min(AUTO.stableFrames, stableCountRef.current + 1);
            } else {
                stableCountRef.current = Math.max(0, stableCountRef.current - 1);
            }
            setStability(stableCountRef.current / AUTO.stableFrames);

            if (!confident) setStatusText('Move Closer To The Receipt');
            else if (!lit) setStatusText('More Light Needed');
            else if (!sharp) setStatusText('Hold Steady');
            else if (!steady) setStatusText('Hold Steady');
            else setStatusText(autoCapture ? 'Capturing' : 'Ready. Tap The Shutter');

            if (autoCapture && stableCountRef.current >= AUTO.stableFrames && !capturingRef.current) {
                // Through a ref so this loop can never hold a stale capture.
                if (captureRef.current) captureRef.current(detection.quad, frame.width);
            }
        } catch (err) {
            if (String(err && err.message) !== 'disposed') {
                console.warn('[docscan] detection failed:', err && err.message);
            }
        } finally {
            detectBusyRef.current = false;
        }
        // capture is declared below; it is stable via useCallback.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoCapture]);

    useEffect(() => {
        if (phase !== 'camera') return undefined;
        let cancelled = false;
        const tick = async () => {
            if (cancelled) return;
            await runDetection();
            if (cancelled) return;
            timerRef.current = setTimeout(tick, DETECT_INTERVAL_MS);
        };
        // Give the camera a moment to expose before judging the first frame.
        timerRef.current = setTimeout(tick, 400);
        return () => {
            cancelled = true;
            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        };
    }, [phase, runDetection]);

    // Overlay drawing, on its own rAF so the outline stays smooth between detections.
    useEffect(() => {
        if (phase !== 'camera') return undefined;

        const draw = () => {
            const video = videoRef.current;
            const overlay = overlayRef.current;
            if (video && overlay && video.videoWidth) {
                const rect = video.getBoundingClientRect();
                const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
                const w = Math.max(1, Math.round(rect.width));
                const h = Math.max(1, Math.round(rect.height));
                if (overlay.width !== w * dpr || overlay.height !== h * dpr) {
                    overlay.width = w * dpr;
                    overlay.height = h * dpr;
                    overlay.style.width = `${w}px`;
                    overlay.style.height = `${h}px`;
                }
                const ctx = overlay.getContext('2d');
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.clearRect(0, 0, w, h);

                const quad = smoothQuadRef.current;
                if (quad) {
                    // detection space -> video space -> display space, allowing
                    // for object-fit: cover cropping the video on one axis.
                    const vw = video.videoWidth;
                    const vh = video.videoHeight;
                    const s = detectScaleRef.current;
                    const cover = Math.max(w / vw, h / vh);
                    const offX = (w - vw * cover) / 2;
                    const offY = (h - vh * cover) / 2;
                    const toDisplay = (p) => ({ x: p.x * s * cover + offX, y: p.y * s * cover + offY });
                    const pts = quad.map(toDisplay);

                    const ready = stableCountRef.current >= AUTO.stableFrames;
                    const accent = ready ? METAL.success : METAL.primary;

                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
                    ctx.closePath();
                    ctx.fillStyle = ready ? 'rgba(49,162,76,0.12)' : 'rgba(35,116,225,0.10)';
                    ctx.fill();
                    ctx.strokeStyle = accent;
                    ctx.lineWidth = ready ? 4 : 3;
                    ctx.lineJoin = 'round';
                    ctx.stroke();

                    for (const p of pts) {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, ready ? 8 : 6, 0, Math.PI * 2);
                        ctx.fillStyle = accent;
                        ctx.fill();
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                        ctx.stroke();
                    }
                }
            }
            rafRef.current = requestAnimationFrame(draw);
        };
        rafRef.current = requestAnimationFrame(draw);
        return () => {
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        };
    }, [phase]);

    // -----------------------------------------------------------------------
    // RECTIFY
    // -----------------------------------------------------------------------

    const rectify = useCallback(async (quad, turns) => {
        const client = clientRef.current;
        const source = sourceRef.current;
        if (!client || !source) return false;

        const outSize = outputSizeFor(quad);
        if (!outSize) return false;

        const base = await client.rectify({
            image: source,
            quad,
            outSize,
            filter: 'original',
            quarterTurns: turns || 0,
        });
        if (!mountedRef.current) return false;

        baseRef.current = {
            data: new Uint8ClampedArray(base.buffer),
            width: base.width,
            height: base.height,
        };
        quadRef.current = quad;
        return true;
    }, []);

    const renderPreview = useCallback(async (mode) => {
        const client = clientRef.current;
        const base = baseRef.current;
        if (!client || !base) return;

        // Filters always run against the pristine rectified image, never against
        // the previous preview, so switching filters cannot compound.
        const out = mode === 'original'
            ? { width: base.width, height: base.height, buffer: base.data.buffer.slice(0) }
            : await client.filter({ image: base, filter: mode });
        if (!mountedRef.current) return;

        previewRef.current = {
            data: new Uint8ClampedArray(out.buffer),
            width: out.width,
            height: out.height,
        };
        // Painting happens in an effect, not here. The first render of a scan
        // computes its pixels while the review screen is still unmounted, so
        // writing to previewCanvasRef at this point wrote to nothing and the
        // user was shown a blank 300x150 canvas.
        setPreviewVersion((v) => v + 1);
    }, []);

    useEffect(() => {
        if (phase !== 'review') return;
        const canvas = previewCanvasRef.current;
        const preview = previewRef.current;
        if (!canvas || !preview) return;
        canvas.width = preview.width;
        canvas.height = preview.height;
        canvas.getContext('2d').putImageData(
            new ImageData(new Uint8ClampedArray(preview.data), preview.width, preview.height),
            0, 0,
        );
    }, [phase, previewVersion]);

    // -----------------------------------------------------------------------
    // CAPTURE (camera) AND INGEST (upload)
    // -----------------------------------------------------------------------

    const capture = useCallback(async (detectQuad, detectWidth) => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;
        if (capturingRef.current) return;      // one capture per session, no duplicates
        capturingRef.current = true;
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

        setPhase('processing');

        const full = frameFromVideo(video);
        stopCamera();
        if (!full) { setPhase('camera-error'); setCameraError(cameraErrorFor(new Error('no-frame'))); return; }

        sourceRef.current = { data: full.data, width: full.width, height: full.height };

        let quad = null;
        if (detectQuad && detectWidth) {
            quad = scaleQuad(detectQuad, full.width / detectWidth);
        }
        if (!quad || !validateQuad(quad, full.width, full.height).ok) {
            // The shutter was pressed with nothing detected. Take one careful
            // look at the still, then hand over to manual corners.
            const found = await detectStill(full);
            quad = found || null;
        }

        if (!quad) {
            setDetectionFailed(true);
            quadRef.current = fallbackQuad(full.width, full.height);
            setDraftCorners(quadRef.current);
            setPhase('corners');
            return;
        }

        setDetectionFailed(false);
        const ok = await rectify(quad, 0);
        if (!ok) {
            quadRef.current = fallbackQuad(full.width, full.height);
            setDraftCorners(quadRef.current);
            setPhase('corners');
            return;
        }
        setQuarterTurns(0);
        setFilter('original');
        await renderPreview('original');
        setPhase('review');
        // detectStill is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stopCamera, rectify, renderPreview]);

    useEffect(() => { captureRef.current = capture; }, [capture]);

    const detectStill = useCallback(async (source) => {
        const client = clientRef.current;
        if (!client) return null;
        try {
            const small = downscaleImageData(
                new ImageData(new Uint8ClampedArray(source.data), source.width, source.height),
                STILL_DETECT_DIM,
            );
            const { detection } = await client.detect(small.imageData, { detectMaxDim: STILL_DETECT_DIM });
            if (!detection) return null;
            return scaleQuad(detection.quad, 1 / small.scale);
        } catch (err) {
            console.warn('[docscan] still detection failed:', err && err.message);
            return null;
        }
    }, []);

    const ingest = useCallback(async (blob) => {
        setPhase('processing');
        setDecodeError(null);
        try {
            const decoded = await decodeToImageData(blob);
            if (!mountedRef.current) return;
            sourceRef.current = { data: decoded.data, width: decoded.width, height: decoded.height };

            const quad = await detectStill(sourceRef.current);
            if (!quad) {
                setDetectionFailed(true);
                quadRef.current = fallbackQuad(decoded.width, decoded.height);
                setDraftCorners(quadRef.current);
                setPhase('corners');
                return;
            }
            setDetectionFailed(false);
            const ok = await rectify(quad, 0);
            if (!ok) {
                quadRef.current = fallbackQuad(decoded.width, decoded.height);
                setDraftCorners(quadRef.current);
                setPhase('corners');
                return;
            }
            setQuarterTurns(0);
            setFilter('original');
            await renderPreview('original');
            setPhase('review');
        } catch (err) {
            if (!mountedRef.current) return;
            if (err instanceof UndecodableImageError && err.likelyHeic) {
                setDecodeError({
                    title: 'HEIC Photo Not Supported Here',
                    body: 'This browser cannot open Apple HEIC photos. Use Scan Receipt to capture it directly, or set iPhone Settings, Camera, Formats to Most Compatible and take the photo again.',
                });
            } else {
                setDecodeError({
                    title: 'Image Could Not Be Opened',
                    body: 'That file is not an image this browser can read. Try a JPEG or PNG, or use Scan Receipt.',
                });
            }
            setPhase('decode-error');
        }
    }, [detectStill, rectify, renderPreview]);

    // Re-ingests when the prop changes, not only on mount. Keyed on identity so
    // a re-render with the same image does not scan it twice. Mount-only was a
    // footgun: DocumentCropper hands this component `imageSrc` from callers
    // that keep it mounted, and a second image would have been ignored in
    // silence.
    const ingestedRef = useRef(null);
    useEffect(() => {
        if (!initialImage || ingestedRef.current === initialImage) return;
        ingestedRef.current = initialImage;
        if (typeof initialImage === 'string') {
            fetch(initialImage).then((r) => r.blob()).then(ingest).catch(() => {
                setDecodeError({ title: 'Image Could Not Be Opened', body: 'That image could not be read.' });
                setPhase('decode-error');
            });
        } else {
            ingest(initialImage);
        }
        // ingest is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialImage]);

    // -----------------------------------------------------------------------
    // REVIEW ACTIONS
    // -----------------------------------------------------------------------

    const changeFilter = useCallback(async (mode) => {
        setFilter(mode);
        setBusy(true);
        try { await renderPreview(mode); } finally { if (mountedRef.current) setBusy(false); }
    }, [renderPreview]);

    const rotate = useCallback(async () => {
        const turns = (quarterTurns + 1) % 4;
        setQuarterTurns(turns);
        setBusy(true);
        try {
            if (quadRef.current) {
                await rectify(quadRef.current, turns);
                await renderPreview(filter);
            }
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [quarterTurns, rectify, renderPreview, filter]);

    // From the camera, Retake reopens the camera. From an upload, there is
    // nothing to re-shoot, so it reopens the picker instead of dead-ending.
    const fromUpload = Boolean(initialImage);
    const retake = useCallback(() => {
        releaseBuffers();
        setDetectionFailed(false);
        setShowSource(false);
        setCornerNotice(null);
        if (fromUpload) {
            if (pickerRef.current) pickerRef.current.click();
            return;
        }
        startCamera(cameras[cameraIndex] ? cameras[cameraIndex].deviceId : undefined);
    }, [releaseBuffers, fromUpload, startCamera, cameras, cameraIndex]);

    const useScan = useCallback(async () => {
        const preview = previewRef.current;
        if (!preview || !onUse) return;
        setBusy(true);
        try {
            const blob = await rgbaToBlob(preview.data, preview.width, preview.height, 0.92);
            onUse({
                blob,
                width: preview.width,
                height: preview.height,
                filter,
                source: initialImage ? 'upload' : 'camera',
            });
        } catch (err) {
            console.warn('[docscan] export failed:', err && err.message);
            setCornerNotice('The scan could not be exported. Try again.');
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [onUse, filter, initialImage]);

    // -----------------------------------------------------------------------
    // CORNER ADJUSTMENT
    // -----------------------------------------------------------------------

    const openCorners = useCallback(() => {
        setCornerNotice(null);
        setDraftCorners(quadRef.current || (sourceRef.current ? fallbackQuad(sourceRef.current.width, sourceRef.current.height) : null));
        setPhase('corners');
    }, []);

    const cornerLayout = useMemo(() => {
        const source = sourceRef.current;
        if (!source) return null;
        const maxW = typeof window !== 'undefined' ? Math.min(720, window.innerWidth - 32) : 360;
        const maxH = typeof window !== 'undefined' ? Math.max(220, window.innerHeight - 300) : 420;
        const scale = Math.min(maxW / source.width, maxH / source.height, 1);
        return { scale, width: Math.round(source.width * scale), height: Math.round(source.height * scale) };
        // Recomputed when the corner editor opens and when the screen turns.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, layoutTick]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const onResize = () => setLayoutTick((n) => n + 1);
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, []);

    useEffect(() => {
        if (phase !== 'corners' || !cornerLayout) return;
        const source = sourceRef.current;
        const canvas = cornerCanvasRef.current;
        if (!source || !canvas) return;

        canvas.width = cornerLayout.width;
        canvas.height = cornerLayout.height;
        const ctx = canvas.getContext('2d');

        const off = document.createElement('canvas');
        off.width = source.width;
        off.height = source.height;
        off.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(source.data), source.width, source.height), 0, 0);
        ctx.drawImage(off, 0, 0, cornerLayout.width, cornerLayout.height);
        off.width = 0;
        off.height = 0;

        const pts = (draftCorners || []).map((p) => ({ x: p.x * cornerLayout.scale, y: p.y * cornerLayout.scale }));
        if (pts.length === 4) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = METAL.primary;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            ctx.stroke();

            pts.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, dragging === i ? 16 : 13, 0, Math.PI * 2);
                ctx.fillStyle = dragging === i ? METAL.success : METAL.primary;
                ctx.fill();
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#fff';
                ctx.stroke();
            });
        }
    }, [phase, cornerLayout, draftCorners, dragging]);

    // Loupe: a magnified crop of the source around the corner being dragged, so
    // a fingertip is not covering the pixel it is trying to place.
    useEffect(() => {
        if (dragging === null || !dragPoint) return;
        const canvas = loupeCanvasRef.current;
        const source = sourceRef.current;
        if (!canvas || !source) return;

        const size = 120;
        const zoom = 3;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size);

        const span = Math.round(size / zoom);
        const sx = Math.round(dragPoint.x - span / 2);
        const sy = Math.round(dragPoint.y - span / 2);
        const crop = ctx.createImageData(span, span);
        for (let y = 0; y < span; y++) {
            for (let x = 0; x < span; x++) {
                const gx = Math.min(source.width - 1, Math.max(0, sx + x));
                const gy = Math.min(source.height - 1, Math.max(0, sy + y));
                const si = (gy * source.width + gx) * 4;
                const di = (y * span + x) * 4;
                crop.data[di] = source.data[si];
                crop.data[di + 1] = source.data[si + 1];
                crop.data[di + 2] = source.data[si + 2];
                crop.data[di + 3] = 255;
            }
        }
        const tmp = document.createElement('canvas');
        tmp.width = span;
        tmp.height = span;
        tmp.getContext('2d').putImageData(crop, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, size, size);
        tmp.width = 0;
        tmp.height = 0;

        ctx.strokeStyle = METAL.primary;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
        ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
        ctx.stroke();
    }, [dragging, dragPoint]);

    const pointerPos = (event) => {
        const canvas = cornerCanvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const touch = event.touches && event.touches[0] ? event.touches[0] : event;
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };

    const onCornerDown = (event) => {
        if (!draftCorners || !cornerLayout) return;
        const pos = pointerPos(event);
        if (!pos) return;
        let nearest = -1;
        let nearestDist = Infinity;
        draftCorners.forEach((p, i) => {
            const d = dist(pos, { x: p.x * cornerLayout.scale, y: p.y * cornerLayout.scale });
            if (d < nearestDist) { nearestDist = d; nearest = i; }
        });
        // 44px is the minimum comfortable touch target; the handle itself is
        // smaller so the outline stays readable.
        if (nearest >= 0 && nearestDist <= 44) {
            event.preventDefault();
            // The ref is what the move handler reads. Relying on the state
            // alone loses every move event that arrives before React commits
            // the press, which on a quick drag is the first few pixels.
            draggingRef.current = nearest;
            setDragging(nearest);
            setDragPoint(draftCorners[nearest]);
        }
    };

    const onCornerMove = (event) => {
        const dragging = draggingRef.current;
        if (dragging === null || !draftCorners || !cornerLayout) return;
        const pos = pointerPos(event);
        if (!pos) return;
        event.preventDefault();
        const source = sourceRef.current;
        const next = draftCorners.slice();
        next[dragging] = {
            x: Math.min(source.width, Math.max(0, pos.x / cornerLayout.scale)),
            y: Math.min(source.height, Math.max(0, pos.y / cornerLayout.scale)),
        };
        setDraftCorners(next);
        setDragPoint(next[dragging]);
    };

    const onCornerUp = () => {
        draggingRef.current = null;
        setDragging(null);
        setDragPoint(null);
    };

    const applyCorners = useCallback(async () => {
        const source = sourceRef.current;
        if (!draftCorners || !source) return;
        const check = validateQuad(draftCorners, source.width, source.height, MANUAL_QUAD_RULES);
        if (!check.ok) {
            setCornerNotice(
                check.reason === 'not-convex-or-crossed'
                    ? 'Those corners cross over each other. Drag them so the outline stays a simple four sided shape.'
                    : 'That selection is too flat to straighten. Move the corners further apart.',
            );
            return;
        }
        setCornerNotice(null);
        setBusy(true);
        try {
            const ok = await rectify(draftCorners, quarterTurns);
            if (!ok) {
                setCornerNotice('That selection could not be straightened. Move the corners and try again.');
                return;
            }
            await renderPreview(filter);
            setDetectionFailed(false);
            setPhase('review');
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [draftCorners, rectify, renderPreview, filter, quarterTurns]);

    // -----------------------------------------------------------------------
    // SOURCE PHOTO PREVIEW (for comparison)
    // -----------------------------------------------------------------------

    useEffect(() => {
        if (!showSource) return;
        const source = sourceRef.current;
        const canvas = sourceCanvasRef.current;
        if (!source || !canvas) return;
        canvas.width = source.width;
        canvas.height = source.height;
        canvas.getContext('2d').putImageData(
            new ImageData(new Uint8ClampedArray(source.data), source.width, source.height), 0, 0,
        );
    }, [showSource]);

    // -----------------------------------------------------------------------
    // RENDER
    // -----------------------------------------------------------------------

    const canSwitchCamera = cameras.length > 1;

    const switchCamera = useCallback(() => {
        if (!canSwitchCamera) return;
        const next = (cameraIndex + 1) % cameras.length;
        setCameraIndex(next);
        startCamera(cameras[next] && cameras[next].deviceId);
    }, [canSwitchCamera, cameraIndex, cameras, startCamera]);

    /**
     * Rendered into document.body, not in place.
     *
     * A z-index only competes inside its own stacking context. This scanner is
     * mounted from ReceiptScanner, which sits inside `.bankroll-modal-overlay`
     * at z-index 9000, and that container IS a stacking context: every z-index
     * underneath it, however large, is still resolved as "somewhere within
     * 9000". So the global header at 10050 painted over the scanner and its
     * close button could not be clicked at all. Raising the number does not
     * fix that, and did not - measured twice on production. Escaping the
     * context does.
     *
     * This also makes the component immune to a future ancestor growing a
     * transform or a filter, either of which would trap a fixed overlay the
     * same way. It is mounted from four surfaces now, so that matters.
     */
    const tree = (
        <div style={S.overlay} role="dialog" aria-modal="true" aria-label={title}>
            <div style={S.header}>
                <button type="button" onClick={handleClose} style={S.iconBtn} aria-label="Close scanner">
                    <X size={20} />
                </button>
                <span style={S.title}>
                    {phase === 'corners' ? 'Adjust Corners' : phase === 'review' ? 'Review Scan' : title}
                </span>
                <div style={{ width: 40 }} />
            </div>

            <div style={S.body}>
                {/* ---------------- CAMERA ---------------- */}
                {(phase === 'starting' || phase === 'camera') && (
                    <div style={S.viewfinder}>
                        <video
                            ref={videoRef}
                            playsInline
                            muted
                            autoPlay
                            style={S.video}
                        />
                        <canvas ref={overlayRef} style={S.overlayCanvas} />

                        <div style={S.statusPill}>
                            <span style={{
                                ...S.statusDot,
                                background: detected ? (stability >= 1 ? METAL.success : METAL.primary) : 'rgba(255,255,255,0.35)',
                            }} />
                            <span style={S.statusLabel}>
                                {phase === 'starting' ? 'Starting Camera' : statusText}
                            </span>
                        </div>

                        {phase === 'camera' && autoCapture && detected && stability > 0 && stability < 1 && (
                            <div style={S.progressWrap}>
                                <div style={{ ...S.progressFill, width: `${Math.round(stability * 100)}%` }} />
                            </div>
                        )}

                        {phase === 'starting' && (
                            <div style={S.centerOverlay}>
                                <Loader2 size={26} style={S.spin} />
                            </div>
                        )}
                    </div>
                )}

                {/* ---------------- PROCESSING ---------------- */}
                {phase === 'processing' && (
                    <div style={S.centerPanel}>
                        <Loader2 size={28} style={S.spin} />
                        <p style={S.centerText}>Straightening Scan</p>
                    </div>
                )}

                {/* ---------------- CAMERA ERROR ---------------- */}
                {phase === 'camera-error' && cameraError && (
                    <div style={S.centerPanel}>
                        <AlertTriangle size={28} style={{ color: METAL.warning }} />
                        <p style={S.centerTitle}>{cameraError.title}</p>
                        <p style={S.centerText}>{cameraError.body}</p>
                        <div style={S.errorActions}>
                            <button type="button" onClick={() => startCamera()} style={S.secondaryBtn}>
                                <RefreshCw size={15} /> Try Again
                            </button>
                            <button type="button" onClick={() => pickerRef.current && pickerRef.current.click()} style={S.primaryBtn}>
                                <Upload size={15} /> Upload Image
                            </button>
                        </div>
                    </div>
                )}

                {/* ---------------- DECODE ERROR ---------------- */}
                {phase === 'decode-error' && decodeError && (
                    <div style={S.centerPanel}>
                        <AlertTriangle size={28} style={{ color: METAL.warning }} />
                        <p style={S.centerTitle}>{decodeError.title}</p>
                        <p style={S.centerText}>{decodeError.body}</p>
                        <div style={S.errorActions}>
                            <button type="button" onClick={() => pickerRef.current && pickerRef.current.click()} style={S.secondaryBtn}>
                                <Upload size={15} /> Choose Another
                            </button>
                            <button type="button" onClick={handleClose} style={S.primaryBtn}>Close</button>
                        </div>
                    </div>
                )}

                {/* ---------------- REVIEW ---------------- */}
                {phase === 'review' && (
                    <div style={S.reviewArea}>
                        <div style={S.previewFrame}>
                            <canvas
                                ref={previewCanvasRef}
                                style={{ ...S.previewCanvas, display: showSource ? 'none' : 'block' }}
                            />
                            <canvas
                                ref={sourceCanvasRef}
                                style={{ ...S.previewCanvas, display: showSource ? 'block' : 'none' }}
                            />
                            {busy && (
                                <div style={S.previewBusy}><Loader2 size={22} style={S.spin} /></div>
                            )}
                        </div>

                        <button type="button" onClick={() => setShowSource((v) => !v)} style={S.linkBtn}>
                            <ImageIcon size={14} />
                            {showSource ? 'Back To Scan' : 'View Original Photo'}
                        </button>

                        <div style={S.filterRow}>
                            {FILTER_OPTIONS.map((opt) => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => changeFilter(opt.id)}
                                    style={{ ...S.chip, ...(filter === opt.id ? S.chipActive : null) }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        <div style={S.toolRow}>
                            <button type="button" onClick={openCorners} style={S.toolBtn}>
                                <Maximize2 size={16} /> Adjust Corners
                            </button>
                            <button type="button" onClick={rotate} style={S.toolBtn}>
                                <RotateCw size={16} /> Rotate
                            </button>
                        </div>

                        {cornerNotice && <p style={S.notice}>{cornerNotice}</p>}
                    </div>
                )}

                {/* ---------------- CORNERS ---------------- */}
                {phase === 'corners' && (
                    <div style={S.reviewArea}>
                        {detectionFailed && (
                            <p style={S.notice}>
                                No Receipt Edges Were Found. Drag The Four Corners Onto The Receipt.
                            </p>
                        )}
                        <div style={S.cornerWrap}>
                            <canvas
                                ref={cornerCanvasRef}
                                style={S.cornerCanvas}
                                onMouseDown={onCornerDown}
                                onMouseMove={onCornerMove}
                                onMouseUp={onCornerUp}
                                onMouseLeave={onCornerUp}
                                onTouchStart={onCornerDown}
                                onTouchMove={onCornerMove}
                                onTouchEnd={onCornerUp}
                            />
                            {dragging !== null && (
                                <canvas ref={loupeCanvasRef} style={S.loupe} />
                            )}
                        </div>
                        {cornerNotice && <p style={S.notice}>{cornerNotice}</p>}
                    </div>
                )}
            </div>

            {/* ---------------- CONTROLS ---------------- */}
            <div style={{ ...S.controls, display: ['camera', 'review', 'corners'].includes(phase) ? 'block' : 'none' }}>
                {phase === 'camera' && (
                    <>
                        <div style={S.autoRow}>
                            <button
                                type="button"
                                onClick={() => setAutoCapture(true)}
                                style={{ ...S.segment, ...(autoCapture ? S.segmentActive : null) }}
                            >
                                Auto
                            </button>
                            <button
                                type="button"
                                onClick={() => { setAutoCapture(false); stableCountRef.current = 0; setStability(0); }}
                                style={{ ...S.segment, ...(!autoCapture ? S.segmentActive : null) }}
                            >
                                Manual
                            </button>
                        </div>
                        <div style={S.shutterRow}>
                            <button
                                type="button"
                                onClick={() => pickerRef.current && pickerRef.current.click()}
                                style={S.sideBtn}
                                aria-label="Upload image instead"
                            >
                                <Upload size={18} />
                                <span style={S.sideLabel}>Upload</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => capture(lastQuadRef.current, detectWidthRef.current)}
                                style={S.shutter}
                                aria-label="Capture"
                            >
                                <span style={S.shutterInner} />
                            </button>
                            {canSwitchCamera ? (
                                <button type="button" onClick={switchCamera} style={S.sideBtn} aria-label="Switch camera">
                                    <Camera size={18} />
                                    <span style={S.sideLabel}>Flip</span>
                                </button>
                            ) : (
                                <div style={{ width: 68 }} />
                            )}
                        </div>
                        <p style={S.hint}>
                            {autoCapture
                                ? 'Captures On Its Own When The Outline Holds Steady'
                                : 'Tap The Shutter When The Outline Fits'}
                        </p>
                    </>
                )}

                {phase === 'review' && (
                    <div style={S.actionRow}>
                        <button type="button" onClick={retake} style={S.secondaryBtn} disabled={busy}>
                            <RefreshCw size={15} /> Retake
                        </button>
                        <button type="button" onClick={useScan} style={S.primaryBtn} disabled={busy}>
                            <Check size={15} /> Use Scan
                        </button>
                    </div>
                )}

                {phase === 'corners' && (
                    <div style={S.actionRow}>
                        <button
                            type="button"
                            onClick={() => { setCornerNotice(null); if (baseRef.current) setPhase('review'); else retake(); }}
                            style={S.secondaryBtn}
                            disabled={busy}
                        >
                            {baseRef.current ? 'Cancel' : 'Retake'}
                        </button>
                        <button type="button" onClick={applyCorners} style={S.primaryBtn} disabled={busy}>
                            {busy ? <Loader2 size={15} style={S.spin} /> : <Check size={15} />} Apply Corners
                        </button>
                    </div>
                )}
            </div>

            {/* Shared picker: the fallback when the camera is unavailable and
                the Retake target when the scan came from a file. */}
            <input
                ref={pickerRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                    const file = e.target.files && e.target.files[0];
                    e.target.value = '';
                    if (!file) return;
                    stopCamera();
                    capturingRef.current = true;
                    releaseBuffers();
                    ingest(file);
                }}
                style={{ display: 'none' }}
            />

            <style>{`
                @keyframes docScanSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );

    // Rendered in place while there is no document, which only happens if this
    // is ever pulled into a server render. Every current caller loads it with
    // ssr: false, so the portal is what actually runs.
    return typeof document === 'undefined' ? tree : createPortal(tree, document.body);
}

// ---------------------------------------------------------------------------
// STYLES
// Smarter.Poker Bankroll Manager surface: matte dark panels, #4e4f50 frames,
// Smarter.Poker blue accents, Inter and Rajdhani. Controls clear the browser
// chrome and the device safe area rather than sitting under it.
// ---------------------------------------------------------------------------

const S = {
    overlay: {
        position: 'fixed',
        inset: 0,
        // Above the global header, which is sticky at 10050. At 10001 the
        // header's hamburger sat on top of this overlay's close button, so the
        // X could not be clicked at all: the only way out of the scanner was
        // the browser back gesture. Measured on production, not guessed.
        // 99999 is the house level for a full-screen modal (ReportBugWidget,
        // LocationEnableModal); 999999 stays reserved for error recovery.
        zIndex: 99999,
        background: METAL.darkest,
        display: 'flex',
        flexDirection: 'column',
        overscrollBehavior: 'contain',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 12px 10px',
        borderBottom: `1px solid ${METAL.highlight}`,
        background: METAL.base,
        flexShrink: 0,
    },
    title: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: '0.12em',
        color: METAL.textPrimary,
        textTransform: 'uppercase',
    },
    iconBtn: {
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        borderRadius: 8,
        color: METAL.textPrimary,
        cursor: 'pointer',
    },
    body: {
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        background: METAL.darkest,
    },
    viewfinder: {
        position: 'relative',
        flex: 1,
        minHeight: 0,
        background: '#000',
        overflow: 'hidden',
    },
    video: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        background: '#000',
    },
    overlayCanvas: {
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
    },
    statusPill: {
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 14px',
        borderRadius: 20,
        background: 'rgba(24,25,26,0.82)',
        border: `1px solid ${METAL.highlight}`,
        maxWidth: 'calc(100% - 32px)',
    },
    statusDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
    statusLabel: {
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        fontWeight: 600,
        color: METAL.textPrimary,
        whiteSpace: 'nowrap',
    },
    progressWrap: {
        position: 'absolute',
        left: 24,
        right: 24,
        bottom: 18,
        height: 4,
        borderRadius: 2,
        background: 'rgba(255,255,255,0.18)',
        overflow: 'hidden',
    },
    progressFill: { height: '100%', background: METAL.primary, transition: 'width 0.12s linear' },
    centerOverlay: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
    },
    centerPanel: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '40px 24px',
        textAlign: 'center',
    },
    centerTitle: {
        margin: 0,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 17,
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: METAL.textPrimary,
    },
    centerText: {
        margin: 0,
        maxWidth: 420,
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
        color: METAL.textSecondary,
    },
    errorActions: { display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },
    reviewArea: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: 16,
    },
    previewFrame: {
        position: 'relative',
        width: '100%',
        maxWidth: 640,
        display: 'flex',
        justifyContent: 'center',
        padding: 10,
        background: METAL.base,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 12,
    },
    previewCanvas: {
        maxWidth: '100%',
        // Leaves room on a 375x812 phone for the filter chips and the Adjust
        // Corners / Rotate row without them being clipped by the action bar.
        maxHeight: '44vh',
        width: 'auto',
        height: 'auto',
        objectFit: 'contain',
        borderRadius: 6,
        background: '#fff',
    },
    previewBusy: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(24,25,26,0.55)',
        borderRadius: 12,
    },
    linkBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        minHeight: 40,
        background: 'transparent',
        border: 'none',
        color: METAL.primary,
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    filterRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
        width: '100%',
        maxWidth: 640,
    },
    chip: {
        padding: '10px 14px',
        minHeight: 44,
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 22,
        color: METAL.textSecondary,
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    chipActive: {
        background: GRADIENTS.cyanAction,
        borderColor: METAL.primary,
        color: '#fff',
    },
    toolRow: { display: 'flex', gap: 10, width: '100%', maxWidth: 640 },
    toolBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '13px 12px',
        minHeight: 48,
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 10,
        color: METAL.textPrimary,
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    cornerWrap: { position: 'relative', display: 'flex', justifyContent: 'center', width: '100%' },
    cornerCanvas: {
        display: 'block',
        maxWidth: '100%',
        borderRadius: 8,
        border: `1px solid ${METAL.highlight}`,
        touchAction: 'none',
        cursor: 'crosshair',
    },
    loupe: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 120,
        height: 120,
        borderRadius: 60,
        border: `2px solid ${METAL.primary}`,
        pointerEvents: 'none',
        background: '#000',
    },
    notice: {
        margin: 0,
        maxWidth: 640,
        padding: '10px 14px',
        background: 'rgba(247,185,40,0.10)',
        border: '1px solid rgba(247,185,40,0.35)',
        borderRadius: 8,
        color: METAL.textPrimary,
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        lineHeight: 1.45,
        textAlign: 'center',
    },
    controls: {
        flexShrink: 0,
        padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)',
        background: METAL.base,
        borderTop: `1px solid ${METAL.highlight}`,
    },
    autoRow: {
        display: 'flex',
        gap: 0,
        width: 180,
        margin: '0 auto 12px',
        borderRadius: 22,
        border: `1px solid ${METAL.highlight}`,
        overflow: 'hidden',
    },
    segment: {
        flex: 1,
        padding: '10px 0',
        minHeight: 44,
        background: 'transparent',
        border: 'none',
        color: METAL.textSecondary,
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    segmentActive: { background: METAL.primary, color: '#fff' },
    shutterRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    sideBtn: {
        width: 68,
        minHeight: 56,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        background: 'transparent',
        border: 'none',
        color: METAL.textSecondary,
        cursor: 'pointer',
    },
    sideLabel: { fontFamily: 'Inter, -apple-system, sans-serif', fontSize: 14, fontWeight: 500 },
    shutter: {
        width: 68,
        height: 68,
        borderRadius: '50%',
        border: `3px solid ${METAL.textPrimary}`,
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        cursor: 'pointer',
        flexShrink: 0,
    },
    shutterInner: { width: 54, height: 54, borderRadius: '50%', background: METAL.textPrimary },
    hint: {
        margin: '10px 0 0',
        textAlign: 'center',
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        color: METAL.textMuted,
    },
    actionRow: { display: 'flex', gap: 12 },
    secondaryBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '14px 16px',
        minHeight: 50,
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 10,
        color: METAL.textPrimary,
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
    },
    primaryBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '14px 16px',
        minHeight: 50,
        background: GRADIENTS.cyanAction,
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 15,
        fontWeight: 700,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
    },
    spin: { animation: 'docScanSpin 0.9s linear infinite', color: METAL.primary },
};
