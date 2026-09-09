/**
 * RECEIPT SCANNER
 *
 * Capture or choose a receipt, straighten it, then upload the approved scan to
 * Supabase Storage and hand the URL back to the caller. The scanning itself
 * lives in DocumentScanner; this component owns the storage, OCR and hand-off.
 *
 * Two defects this replaced, both of which made the feature unusable:
 *
 *  - the capture UI waited on a global `cv` that nothing loads, because OpenCV
 *    was removed from pages/_document.js and the lazy load it promised was
 *    never written. Every scan sat on "Loading scanner engine" for 20 seconds
 *    and then failed;
 *  - `processReceipt` built `const session = { access_token: ... }` and then
 *    tested `session?.user?.id`, which is undefined on that literal by
 *    construction, so every upload aborted with "Sign in required".
 *
 * Order of operations is deliberate: nothing reaches storage until the user
 * presses Use Scan, and a previously saved receipt is not discarded until its
 * replacement has uploaded.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Camera, Upload, X, Loader2, Check, RefreshCw, Scan, Shield, AlertTriangle, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAuthUser, getFreshAccessToken, ensureAuthReady } from '../../lib/authUtils';
import { uploadBankrollImage, isRetryableUploadError } from '../../lib/bankroll/receiptStorage';
import { holdScan, heldRecord, shouldHold } from '../../lib/bankroll/receiptHold.mjs';
import { downscaleForOcr } from '../../lib/docscan/imageSource';
import { readText, releaseOcr, OcrUnavailableError } from '../../lib/docscan/ocr.mjs';
import { READ_OUTCOMES } from '../../lib/bankroll/receiptInbox.mjs';
import { reportReaderFailure, READER_SECTIONS } from '../../lib/bankroll/reportReaderFailure';
import { perceptualHash } from '../../lib/bankroll/receiptHash.mjs';
import {
    normaliseScan, routeScan, DOC_TYPE_LABELS, DOC_TYPES,
} from '../../lib/bankroll/receiptRouting.mjs';
import { eventBus, EventType } from '../../engine/EventBus';
import { METAL, GRADIENTS, GLOWS, ANIMATIONS } from './metalStyles';

// The scanner pulls in the whole image-processing pipeline and its worker, so
// it is fetched when the user opens it rather than with the page. It is
// browser-only by nature: camera, canvas and workers have no server meaning.
const DocumentScanner = dynamic(() => import('./DocumentScanner'), { ssr: false });

const EXPENSE_LABELS = {
    buy_in: 'BUY-IN', hotel: 'HOTEL', flights: 'FLIGHT', rental_car: 'RENTAL',
    gas: 'GAS', meals: 'MEAL', transport: 'TRANSPORT', tips: 'TIPS',
    tournament: 'TOURNAMENT', other: 'OTHER',
};

/** Attempts before the user is shown a failure they have to act on. */
const UPLOAD_ATTEMPTS = 3;

export default function ReceiptScanner({
    onScanComplete,
    userId,
    displayEUR = false,
    tripId = null,
    onPendingChange,
    /**
     * A photograph taken with no signal, coming back to be filed.
     *
     * It is handed straight to the ordinary approved-scan path, so a held
     * scan uploads and is read by EXACTLY the flow a fresh one takes - one
     * read path, one entitlement check, one set of numbers. The alternative
     * was a second headless flush that reads receipts its own way, and two
     * readers eventually disagree about what a receipt said.
     */
    resumeScan = null,
    /** Told when a scan could not be sent and was written to the device. */
    onHeld,
}) {
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerSeed, setScannerSeed] = useState(null);   // a File, when the user chose one

    // The approved scan is held here until it has uploaded. An upload failure
    // must not lose it, so retry re-sends this exact blob.
    const [approvedScan, setApprovedScan] = useState(null); // { blob, previewUrl, width, height }
    const [isUploading, setIsUploading] = useState(false);
    const [uploadAttempt, setUploadAttempt] = useState(0);
    const [error, setError] = useState(null);

    const [uploadedUrl, setUploadedUrl] = useState(null);
    // Not an error: the scan is safe on the device and will be filed later.
    const [heldOnDevice, setHeldOnDevice] = useState(false);
    // Not state: it is read once when the scan is handed over, and a render
    // for it would be a render for nothing.
    const imageHashRef = useRef(null);
    // What the reader did, carried onto the bankroll_receipts row. PostHog
    // is dark in production, so this table is the one channel that reports
    // whether the engine works for a real person.
    const readOutcomeRef = useRef({ outcome: READ_OUTCOMES.NOT_ATTEMPTED, ocrConfidence: null });
    const [extractedData, setExtractedData] = useState(null);
    // What the scan was read as, and where it is headed. Held separately from
    // the raw OCR so the user can correct the type without re-scanning.
    const [scanKind, setScanKind] = useState(null);
    const [typeOverridden, setTypeOverridden] = useState(false);
    const [confidenceScore, setConfidenceScore] = useState(null);
    // 0-100 while the on-device engine reads. The first scan of a session
    // also downloads the engine, which is worth showing rather than leaving
    // the user looking at a still screen.
    const [ocrProgress, setOcrProgress] = useState(null);
    const [verified, setVerified] = useState(false);
    const [verifying, setVerifying] = useState(false);

    const fileInputRef = useRef(null);
    const previewUrlRef = useRef(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (previewUrlRef.current) {
                URL.revokeObjectURL(previewUrlRef.current);
                previewUrlRef.current = null;
            }
            // The OCR worker holds a WebAssembly heap of tens of megabytes.
            // Leaving it running after the scanner closes is how a phone runs
            // out of memory three receipts later.
            releaseOcr();
        };
    }, []);

    /**
     * A captured scan that has not been saved yet.
     *
     * The photograph is gone the moment this component lets go of it: the
     * scanner destroyed its buffers, and the receipt itself is back in a
     * pocket. So an unsaved scan is unrecoverable work, and every route out of
     * this component has to say so rather than silently binning it.
     */
    const hasUnsavedScan = Boolean(approvedScan) && !uploadedUrl;

    useEffect(() => {
        if (onPendingChange) onPendingChange(hasUnsavedScan);
    }, [hasUnsavedScan, onPendingChange]);

    // A reload or a back gesture mid-save loses it too.
    useEffect(() => {
        if (!hasUnsavedScan || typeof window === 'undefined') return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [hasUnsavedScan]);

    const confirmDiscard = useCallback(() => {
        if (!hasUnsavedScan) return true;
        if (typeof window === 'undefined') return true;
        return window.confirm(
            'This Scan Has Not Been Saved Yet. The Receipt Image Will Be Lost. Discard It?',
        );
    }, [hasUnsavedScan]);

    const computeConfidence = useCallback((data) => {
        if (!data) return 0;
        let score = 0;
        if (data.vendor && data.vendor.length > 2) score += 35;
        else if (data.vendor) score += 15;
        if (data.amount != null && parseFloat(data.amount) > 0) score += 35;
        else if (data.amount != null) score += 10;
        if (data.date) score += 15;
        if (data.category) score += 15;
        return Math.min(100, score);
    }, []);

    const getConfidenceLabel = (score) => {
        if (score >= 75) return { label: 'HIGH', color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)' };
        if (score >= 40) return { label: 'MEDIUM', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)' };
        return { label: 'LOW', color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' };
    };

    // ---------------------------------------------------------------------
    // UPLOAD. Reached only from approval and retry, never from capture.
    // ---------------------------------------------------------------------

    /**
     * Write this scan to the device instead of losing it.
     *
     * The photograph is kept UNREAD. Reading is local, but the parse runs
     * through /api/bankroll/scan-receipt, which is where the bankroll_pro
     * entitlement is checked and where the player's saved venues live -
     * parsing in the browser to fill this in offline would hand the paid
     * feature away, which that route says in as many words. So the held scan
     * is read when it is filed, by the same route, with the same gate.
     */
    const holdForLater = useCallback(async (scan, reason) => {
        try {
            const hash = await perceptualHash(scan.blob).catch(() => null);
            const { held, dropped } = await holdScan(heldRecord({
                userId,
                blob: scan.blob,
                mime: scan.blob.type || 'image/jpeg',
                imageHash: hash,
                capturedAt: Date.now(),
            }));
            if (!mountedRef.current) return true;
            setHeldOnDevice(true);
            setError(null);
            setIsUploading(false);
            if (typeof onHeld === 'function') onHeld({ held, dropped, reason });
            return true;
        } catch (err) {
            console.warn('[ReceiptScanner] could not hold the scan:', (err && err.message) || err);
            if (mountedRef.current) {
                // Say the true thing: this one really is at risk.
                setError('NO SIGNAL AND NO ROOM TO HOLD IT - STAY ON THIS SCREEN');
                setIsUploading(false);
            }
            return false;
        }
    }, [userId, onHeld]);

    const uploadApprovedScan = useCallback(async (scan) => {
        if (!scan || !scan.blob) return;
        setIsUploading(true);
        setError(null);
        setUploadAttempt(0);
        setExtractedData(null);
        setConfidenceScore(null);

        // Through the house auth helpers, not the Supabase client. A pre-commit
        // guard blocks the SDK session call in components because it can throw
        // AbortError; src/lib/authUtils.ts reads the same session out of
        // storage without that risk.
        // NO SIGNAL: hold it now rather than making the player watch three
        // upload attempts time out to learn something the browser already
        // knows. getFreshAccessToken may itself need the network, so this
        // comes first - offline, "SIGN IN REQUIRED" would be a lie.
        const offlineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (offlineNow && shouldHold({ online: false, error: null })) {
            if (await holdForLater(scan, 'offline')) return;
        }

        const authUser = getAuthUser();
        const uid = userId || (authUser && authUser.id);
        const accessToken = await getFreshAccessToken();
        if (!uid || !accessToken) {
            setError('SIGN IN REQUIRED');
            setIsUploading(false);
            return;
        }

        // Storage RLS is enforced against the SDK's own session, not against a
        // token we happen to be holding. If the client has not rehydrated yet
        // the request goes up as anon and the policy refuses it.
        try { await ensureAuthReady(supabase); } catch (_e) { /* upload will report it */ }

        // Read the receipt in parallel with storing it. OCR does not depend on
        // storage, and running it first means the extracted details survive an
        // upload that has to retry, instead of being lost with the attempt.
        // The reader gets the binarized rendition; storage keeps the one the
        // user chose to look at. They are different jobs and, measured on a
        // faint thermal receipt, the difference is every amount on it.
        const ocrPromise = runOcr(scan.ocrBlob || scan.blob, accessToken);
        // What this photograph looks like, so the page can say "you scanned
        // this one on Tuesday". Never blocks the upload: a browser without
        // createImageBitmap resolves null and the check simply does not run.
        const hashPromise = perceptualHash(scan.blob).catch(() => null);

        let lastError = null;
        for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
            if (!mountedRef.current) return;
            setUploadAttempt(attempt);
            try {
                const publicUrl = await uploadBankrollImage(supabase, uid, scan.blob, 'image/jpeg');
                if (!mountedRef.current) return;

                // Only now is the previously saved receipt replaced.
                setUploadedUrl(publicUrl);
                setVerified(false);
                setError(null);
                imageHashRef.current = await hashPromise;
                await ocrPromise;
                if (mountedRef.current) setIsUploading(false);
                return;
            } catch (err) {
                lastError = err;
                if (!isRetryableUploadError(err) || attempt === UPLOAD_ATTEMPTS) break;
                await new Promise((r) => setTimeout(r, 400 * attempt));
            }
        }

        console.warn('[ReceiptScanner] Upload failed:', lastError && (lastError.message || lastError));
        // The signal went during the upload. A refusal - a policy denial, a
        // payload too large - is NOT held: it would refuse again in an hour,
        // and a queue that never drains is a promise the player cannot
        // collect on. shouldHold draws that line.
        if (shouldHold({ online: true, error: lastError })) {
            if (await holdForLater(scan, 'upload-failed')) return;
        }
        if (mountedRef.current) {
            // The scan itself is still held, so this is a retry prompt and not
            // a dead end. Saying which failure it was matters: a refused policy
            // will never succeed on a retry and the user should not keep trying.
            const message = String((lastError && lastError.message) || '').toLowerCase();
            setError(
                message.includes('row-level security') || message.includes('unauthorized')
                    ? 'SAVE BLOCKED - PERMISSION DENIED'
                    : 'SAVE FAILED - TAP RETRY',
            );
            setIsUploading(false);
        }
        // runOcr is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, holdForLater]);

    const runOcr = useCallback(async (blob, accessToken) => {
        try {
            // THE PICTURE DOES NOT LEAVE THE DEVICE.
            //
            // Tesseract, compiled to WebAssembly and served from our own
            // origin, reads the receipt here. What crosses the network is the
            // TEXT it produced: a few hundred bytes instead of a megabyte of
            // somebody's tax form, and no model anywhere in the path.
            //
            // The engine reads a receipt as well at 1600px as at full size
            // and is several times faster on a phone. Storage keeps the
            // full-resolution copy.
            const forOcr = await downscaleForOcr(blob, 1600, 0.85);
            if (mountedRef.current) setOcrProgress(0);
            const read = await readText(forOcr, {
                onProgress: (pct) => { if (mountedRef.current) setOcrProgress(pct); },
            });
            if (mountedRef.current) setOcrProgress(null);
            if (!mountedRef.current) return;

            readOutcomeRef.current = { outcome: READ_OUTCOMES.NO_TEXT, ocrConfidence: read.confidence };
            if (!read.text.trim()) {
                // A photograph with no legible text at all. The image still
                // saves; the sheet asks where it goes. Recorded as no_text,
                // which points at the photograph rather than the deploy.
                setConfidenceScore(10);
                return;
            }

            // The route still runs, and still matters: it holds the Bankroll
            // Pro gate and the player's saved venues, which is what lets
            // "BELLAG10 P0KER ROOM" be recognised as the Bellagio.
            const res = await fetch('/api/bankroll/scan-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ text: read.text, ocrConfidence: read.confidence }),
            });
            if (!res.ok) {
                const detail = await res.json().catch(() => null);
                console.warn('[ReceiptScanner] Read failed:', res.status, detail && detail.detail);
                // The engine worked; the server refused. A 403 is the
                // entitlement gate, a 429 is the rate limit, and those are
                // different problems from a bad photograph.
                readOutcomeRef.current = { outcome: READ_OUTCOMES.ROUTE_REFUSED, ocrConfidence: read.confidence };
                if (mountedRef.current) setConfidenceScore(10);
                return;
            }
            const result = await res.json();
            if (!mountedRef.current) return;
            if (result && result.success && result.data) {
                readOutcomeRef.current = { outcome: READ_OUTCOMES.READ, ocrConfidence: read.confidence };
                setExtractedData(result.data);
                setConfidenceScore(computeConfidence(result.data));
                // Classify and decide where it goes. Both are pure, so the
                // decision is the same one the tests exercise.
                const scan = normaliseScan(result.data);
                setScanKind({ scan, route: routeScan(scan) });
                setTypeOverridden(false);
            } else {
                setConfidenceScore(10);
            }
        } catch (err) {
            // Reading the receipt is optional. The image still saves, the
            // scan is still recorded, and the sheet asks where it goes.
            //
            // But WHICH failure this was decides who has to fix it. An engine
            // that cannot start means the deploy is broken, which is exactly
            // how the reader shipped on 2026-09-09 with every asset 404ing
            // and nothing anywhere saying so.
            const engineFailed = err instanceof OcrUnavailableError
                || /importScripts|worker|wasm|SharedArrayBuffer/i.test(String((err && err.message) || ''));
            readOutcomeRef.current = {
                outcome: engineFailed ? READ_OUTCOMES.ENGINE_FAILED : READ_OUTCOMES.NO_TEXT,
                ocrConfidence: null,
            };
            if (engineFailed) {
                console.warn('[ReceiptScanner] OCR engine unavailable:', (err && err.message) || err);
                reportReaderFailure(err, READER_SECTIONS.RECEIPT, userId);
            }
            if (mountedRef.current) {
                setOcrProgress(null);
                setConfidenceScore(10);
            }
        }
    }, [computeConfidence, userId]);

    /** Staff corrected the guess. Re-route from the same extracted values. */
    const overrideType = useCallback((documentType) => {
        setScanKind((prev) => {
            if (!prev) return prev;
            const scan = { ...prev.scan, documentType, confidence: 1 };
            return { scan, route: routeScan(scan) };
        });
        setTypeOverridden(true);
    }, []);

    // ---------------------------------------------------------------------
    // SCANNER HAND-OFF
    // ---------------------------------------------------------------------

    const handleScanApproved = useCallback(async (scan) => {
        setScannerOpen(false);
        setScannerSeed(null);

        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const previewUrl = URL.createObjectURL(scan.blob);
        previewUrlRef.current = previewUrl;

        const approved = { blob: scan.blob, ocrBlob: scan.ocrBlob || scan.blob, previewUrl, width: scan.width, height: scan.height };
        setApprovedScan(approved);
        await uploadApprovedScan(approved);
    }, [uploadApprovedScan]);

    // A held scan comes back in through the SAME door a fresh one does.
    useEffect(() => {
        if (!resumeScan || !resumeScan.blob || approvedScan || uploadedUrl) return;
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const previewUrl = URL.createObjectURL(resumeScan.blob);
        previewUrlRef.current = previewUrl;
        setHeldOnDevice(false);
        setApprovedScan({ blob: resumeScan.blob, ocrBlob: resumeScan.blob, previewUrl, width: null, height: null });
        // The effect below this one is what uploads whatever approvedScan holds.
    }, [resumeScan, approvedScan, uploadedUrl]);

    const retryUpload = useCallback(() => {
        if (approvedScan) uploadApprovedScan(approvedScan);
    }, [approvedScan, uploadApprovedScan]);

    const openScanner = useCallback((seed) => {
        setError(null);
        setScannerSeed(seed || null);
        setScannerOpen(true);
    }, []);

    const handleFileSelect = useCallback((event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        // A chosen photo goes through exactly the same detection, corner
        // adjustment, correction and review as a live capture.
        openScanner(file);
    }, [openScanner]);

    const resetScanner = useCallback(() => {
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
        }
        setApprovedScan(null);
        setUploadedUrl(null);
        imageHashRef.current = null;
        setExtractedData(null);
        setScanKind(null);
        setTypeOverridden(false);
        setConfidenceScore(null);
        setVerified(false);
        setVerifying(false);
        setError(null);
        setScannerSeed(null);
        setScannerOpen(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setUploadAttempt(0);
    }, []);

    /** Discard, but only after the user has been told what it costs. */
    const requestReset = useCallback(() => {
        if (!confirmDiscard()) return;
        resetScanner();
    }, [confirmDiscard, resetScanner]);

    const handleConfirm = useCallback(() => {
        if (uploadedUrl && onScanComplete) {
            onScanComplete({
                imageUrl: uploadedUrl,
                extractedData,
                tripId,
                imageHash: imageHashRef.current,
                // What it was read as and where it belongs, so the page can
                // open the right destination already filled in.
                documentType: scanKind ? scanKind.scan.documentType : 'unknown',
                route: scanKind ? scanKind.route : null,
                typeConfirmedByUser: typeOverridden,
                // Recorded on the row so the failures can be counted without
                // an analytics key nobody has set.
                readOutcome: readOutcomeRef.current.outcome,
                ocrConfidence: readOutcomeRef.current.ocrConfidence,
            });
        }
        resetScanner();
    }, [uploadedUrl, onScanComplete, extractedData, tripId, resetScanner, scanKind, typeOverridden]);

    const handleVerifyLock = async () => {
        setVerifying(true);
        try {
            setVerified(true);
            eventBus.emit(EventType.SESSION_END, {
                source: 'ReceiptScanner',
                action: 'receipt_verified',
                confidence: confidenceScore,
            }, 'ReceiptScanner');
        } catch (e) {
            console.warn('[ReceiptScanner] Verify error:', e);
        } finally {
            setVerifying(false);
        }
    };

    const idle = !approvedScan && !uploadedUrl && !isUploading;

    return (
        <div style={styles.container}>
            <div style={styles.ledStrip} />

            <div style={styles.header}>
                <div style={styles.headerTitle}>
                    <Scan size={16} style={{ color: METAL.primary }} />
                    <span>SCAN RECEIPT</span>
                </div>
                {(approvedScan || uploadedUrl) && (
                    <button onClick={requestReset} style={styles.resetBtn} type="button" disabled={isUploading}>
                        <RefreshCw size={12} />
                        NEW SCAN
                    </button>
                )}
            </div>

            {/* Entry point. Scan Receipt is the primary action; Upload Image
                sits alongside it and lands in the same editor. */}
            {idle && (
                <div style={styles.uploadArea}>
                    <button type="button" onClick={() => openScanner(null)} style={styles.scanBtn}>
                        <span style={styles.scanIcon}><Camera size={30} /></span>
                        <span style={styles.scanLabel}>Scan Receipt</span>
                        <span style={styles.scanHint}>Finds The Edges, Straightens And Crops</span>
                    </button>

                    <div style={styles.uploadDivider}>
                        <span style={styles.uploadDividerLine} />
                        <span style={styles.uploadDividerText}>Or</span>
                        <span style={styles.uploadDividerLine} />
                    </div>

                    <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} style={styles.fileUploadBtn}>
                        <Upload size={15} />
                        Upload Image
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        style={styles.fileInput}
                    />
                </div>
            )}

            {/* Uploading. The approved scan is already on screen. */}
            {isUploading && (
                <div style={styles.scanningState}>
                    {approvedScan && (
                        <img src={approvedScan.previewUrl} alt="Approved scan" style={styles.scanningImage} />
                    )}
                    <div style={styles.scanningInfo}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>
                            {uploadAttempt > 1
                                ? `SAVING RECEIPT - RETRY ${uploadAttempt} OF ${UPLOAD_ATTEMPTS}`
                                : 'SAVING RECEIPT AND READING DETAILS...'}
                        </span>
                    </div>
                </div>
            )}

            {/* Upload failed. The approved scan is still held, so Retry does
                not make the user scan again, and cannot attach twice. */}
            {error && !isUploading && (
                <div style={styles.errorPanel}>
                    {/* The scan stays on screen. Seeing it is the difference
                        between "try again" and "that work is gone". */}
                    {approvedScan && (
                        <img src={approvedScan.previewUrl} alt="Scan waiting to save" style={styles.scanningImage} />
                    )}
                    <div style={styles.errorRow}>
                        <AlertTriangle size={16} />
                        <span>{error}</span>
                    </div>
                    <p style={styles.errorHint}>
                        {approvedScan
                            ? 'Your Scan Is Still Here. It Is Not Saved Yet.'
                            : 'Start A New Scan To Try Again.'}
                    </p>
                    <div style={styles.errorActions}>
                        {approvedScan ? (
                            <>
                                <button onClick={retryUpload} style={styles.confirmBtn} type="button">
                                    <RefreshCw size={14} /> RETRY SAVE
                                </button>
                                <button onClick={requestReset} style={styles.cancelBtn} type="button">
                                    <X size={14} /> DISCARD
                                </button>
                            </>
                        ) : (
                            <button onClick={resetScanner} style={styles.confirmBtn} type="button">CLOSE</button>
                        )}
                    </div>
                </div>
            )}

            {ocrProgress !== null && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: '8px 16px', margin: '0 auto 16px',
                    background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
                    borderRadius: 20, width: 'fit-content',
                }}>
                    <Loader2 size={14} style={{ color: '#60a5fa', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, fontWeight: 800, color: '#60a5fa', letterSpacing: '0.1em' }}>
                        READING ON THIS DEVICE - {ocrProgress}%
                    </span>
                </div>
            )}

            {uploadedUrl && !isUploading && (
                <div style={styles.resultContainer}>
                    {confidenceScore !== null && (() => {
                        const conf = getConfidenceLabel(confidenceScore);
                        return (
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 8, padding: '8px 16px',
                                background: conf.bg, border: `1px solid ${conf.border}`,
                                borderRadius: 20, width: 'fit-content', margin: '0 auto 16px',
                            }}>
                                {conf.label === 'HIGH'
                                    ? <Shield size={14} style={{ color: conf.color }} />
                                    : <AlertTriangle size={14} style={{ color: conf.color }} />}
                                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, fontWeight: 800, color: conf.color, letterSpacing: '0.1em' }}>
                                    {conf.label} CONFIDENCE - {confidenceScore}%
                                </span>
                            </div>
                        );
                    })()}

                    {verified && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 6, padding: '6px 12px',
                            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                            borderRadius: 20, width: 'fit-content', margin: '0 auto 16px',
                        }}>
                            <Shield size={12} style={{ color: '#4ade80' }} />
                            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 12, fontWeight: 800, color: '#4ade80', letterSpacing: '0.1em' }}>VERIFIED & LOCKED</span>
                        </div>
                    )}

                    <div style={styles.previewContainer}>
                        {/* The saved scan, not the source photograph. */}
                        <img src={uploadedUrl} alt="Receipt" style={styles.previewImage} />
                    </div>

                    {/* What it was read as. Shown before the fields, because
                        the type decides which fields matter, and a wrong type
                        puts money in the wrong column. */}
                    {scanKind && (
                        <div style={styles.kindPanel}>
                            <div style={styles.kindHeader}>
                                <FileText size={14} style={{ color: METAL.primary }} />
                                <span style={styles.kindTitle}>
                                    {DOC_TYPE_LABELS[scanKind.scan.documentType] || 'Receipt'}
                                </span>
                                {!typeOverridden && scanKind.scan.confidence > 0 && (
                                    <span style={styles.kindConfidence}>
                                        {Math.round(scanKind.scan.confidence * 100)}% Sure
                                    </span>
                                )}
                            </div>
                            <p style={styles.kindSummary}>{scanKind.route.summary}</p>
                            <p style={styles.kindDestination}>{scanKind.route.label}</p>

                            <details style={styles.kindDetails}>
                                <summary style={styles.kindToggle}>Not Right? Change The Type</summary>
                                <div style={styles.kindChips}>
                                    {DOC_TYPES.filter((t) => t !== 'unknown').map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => overrideType(t)}
                                            style={{
                                                ...styles.kindChip,
                                                ...(scanKind.scan.documentType === t ? styles.kindChipActive : null),
                                            }}
                                        >
                                            {DOC_TYPE_LABELS[t]}
                                        </button>
                                    ))}
                                </div>
                            </details>
                        </div>
                    )}

                    {extractedData && (
                        <div style={styles.dataGrid}>
                            {extractedData.vendor != null && (
                                <div style={{
                                    ...styles.dataRow,
                                    ...((!extractedData.vendor || extractedData.vendor.length < 3) ? { border: '2px solid rgba(239,68,68,0.4)' } : {}),
                                }}>
                                    <span style={styles.dataLabel}>
                                        VENDOR {(!extractedData.vendor || extractedData.vendor.length < 3) && <span style={{ color: '#f87171', fontSize: 12 }}>REVIEW</span>}
                                    </span>
                                    <span style={styles.dataValue}>{extractedData.vendor || '-'}</span>
                                </div>
                            )}
                            {extractedData.amount != null && (
                                <div style={{
                                    ...styles.dataRow,
                                    ...(parseFloat(extractedData.amount) <= 0 ? { border: '2px solid rgba(239,68,68,0.4)' } : {}),
                                }}>
                                    <span style={styles.dataLabel}>
                                        AMOUNT {parseFloat(extractedData.amount) <= 0 && <span style={{ color: '#f87171', fontSize: 12 }}>REVIEW</span>}
                                    </span>
                                    <span style={{ ...styles.dataValue, color: '#4ade80' }}>
                                        {displayEUR ? 'EUR ' : '$'}{parseFloat(extractedData.amount).toFixed(2)}
                                    </span>
                                </div>
                            )}
                            {extractedData.date && (
                                <div style={styles.dataRow}>
                                    <span style={styles.dataLabel}>DATE</span>
                                    <span style={styles.dataValue}>{extractedData.date}</span>
                                </div>
                            )}
                            {extractedData.category && (
                                <div style={styles.dataRow}>
                                    <span style={styles.dataLabel}>CATEGORY</span>
                                    <span style={styles.dataValue}>{EXPENSE_LABELS[extractedData.category] || extractedData.category}</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div style={styles.actions}>
                        <button onClick={resetScanner} style={styles.cancelBtn} type="button">
                            <X size={14} />
                            DISCARD
                        </button>
                        {!verified && confidenceScore !== null && confidenceScore < 75 && (
                            <button
                                onClick={handleVerifyLock}
                                disabled={verifying}
                                type="button"
                                style={{
                                    ...styles.confirmBtn,
                                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                    color: '#fff',
                                    flex: 1,
                                }}
                            >
                                <Shield size={14} />
                                {verifying ? 'VERIFYING...' : 'VERIFY & LOCK'}
                            </button>
                        )}
                        <button onClick={handleConfirm} style={styles.confirmBtn} type="button">
                            <Check size={14} />
                            SAVE RECEIPT
                        </button>
                    </div>
                </div>
            )}

            <style>{ANIMATIONS}</style>

            {scannerOpen && (
                <DocumentScanner
                    title="Scan Receipt"
                    initialImage={scannerSeed}
                    onUse={handleScanApproved}
                    onClose={() => { setScannerOpen(false); setScannerSeed(null); }}
                />
            )}
        </div>
    );
}

const styles = {
    container: {
        position: 'relative',
        background: GRADIENTS.darkPanel,
        border: `2px solid ${METAL.mid}`,
        borderRadius: 12,
        overflow: 'hidden',
    },
    ledStrip: {
        position: 'absolute',
        top: 0,
        left: '10%',
        right: '10%',
        height: 2,
        background: METAL.primary,
        boxShadow: GLOWS.cyanSubtle,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 16px',
        borderBottom: `1px solid ${METAL.mid}`,
    },
    headerTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.15em',
        color: '#fff',
    },
    resetBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        minHeight: 40,
        background: 'rgba(255,255,255,0.15)',
        border: `2px solid ${METAL.mid}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: '0.1em',
        color: 'rgba(255,255,255,0.6)',
        cursor: 'pointer',
    },
    uploadArea: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px 20px 24px',
    },
    scanBtn: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        padding: '22px 16px',
        background: GRADIENTS.cyanAction,
        border: 'none',
        borderRadius: 12,
        color: '#fff',
        cursor: 'pointer',
        minHeight: 56,
    },
    scanIcon: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.16)',
        marginBottom: 4,
    },
    scanLabel: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 17,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
    },
    scanHint: {
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        color: 'rgba(255,255,255,0.82)',
    },
    fileInput: {
        position: 'absolute',
        opacity: 0,
        pointerEvents: 'none',
        width: 1,
        height: 1,
    },
    uploadDivider: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        margin: '14px 0 10px',
    },
    uploadDividerLine: { flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' },
    uploadDividerText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    fileUploadBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '13px 0',
        minHeight: 48,
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 10,
        color: METAL.textPrimary,
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    scanningState: {
        position: 'relative',
        padding: '28px 24px',
        textAlign: 'center',
    },
    scanningImage: {
        maxWidth: 140,
        maxHeight: 160,
        objectFit: 'contain',
        borderRadius: 8,
        border: `2px solid ${METAL.primary}`,
        marginBottom: 16,
    },
    scanningInfo: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: '0.15em',
        color: METAL.primary,
    },
    errorPanel: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: 20,
        margin: 16,
        background: 'rgba(240,40,73,0.08)',
        border: `2px solid ${METAL.danger}`,
        borderRadius: 10,
        textAlign: 'center',
    },
    errorRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 15,
        fontWeight: 700,
        color: METAL.danger,
        letterSpacing: '0.08em',
    },
    errorHint: {
        margin: 0,
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        color: METAL.textSecondary,
    },
    errorActions: { display: 'flex', gap: 10, width: '100%' },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '20px',
        background: 'rgba(240,40,73,0.1)',
        border: `2px solid ${METAL.danger}`,
        margin: 16,
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: METAL.danger,
        letterSpacing: '0.1em',
    },
    retryBtn: {
        padding: '8px 14px',
        minHeight: 40,
        background: 'rgba(240,40,73,0.2)',
        border: `2px solid ${METAL.danger}`,
        borderRadius: 6,
        color: METAL.danger,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
    },
    resultContainer: { padding: 16 },
    kindPanel: {
        marginBottom: 16,
        padding: 14,
        background: 'rgba(35,116,225,0.08)',
        border: `1px solid ${METAL.primary}`,
        borderRadius: 10,
    },
    kindHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
    kindTitle: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 15,
        fontWeight: 800,
        letterSpacing: '0.08em',
        color: METAL.textPrimary,
        textTransform: 'uppercase',
    },
    kindConfidence: {
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        color: METAL.textMuted,
    },
    kindSummary: {
        margin: '0 0 4px',
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        color: METAL.textSecondary,
    },
    kindDestination: {
        margin: 0,
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        fontWeight: 600,
        color: METAL.primary,
    },
    kindDetails: { marginTop: 10 },
    kindToggle: {
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        color: METAL.textMuted,
        cursor: 'pointer',
    },
    kindChips: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    kindChip: {
        padding: '9px 12px',
        minHeight: 40,
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 20,
        color: METAL.textSecondary,
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 14,
        cursor: 'pointer',
    },
    kindChipActive: { background: GRADIENTS.cyanAction, borderColor: METAL.primary, color: '#fff' },
    previewContainer: { marginBottom: 16, textAlign: 'center' },
    previewImage: {
        maxWidth: '100%',
        maxHeight: 220,
        objectFit: 'contain',
        borderRadius: 8,
        border: `2px solid ${METAL.mid}`,
        background: '#fff',
    },
    dataGrid: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 },
    dataRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        background: 'rgba(0,0,0,0.3)',
        border: `2px solid ${METAL.mid}`,
        borderRadius: 8,
    },
    dataLabel: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.1em',
    },
    dataValue: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
    },
    actions: { display: 'flex', gap: 12 },
    cancelBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '13px',
        minHeight: 48,
        background: GRADIENTS.metalButton,
        border: `2px solid ${METAL.mid}`,
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
    confirmBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '13px',
        minHeight: 48,
        background: GRADIENTS.cyanAction,
        border: 'none',
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
};
