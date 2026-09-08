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
    const [extractedData, setExtractedData] = useState(null);
    // What the scan was read as, and where it is headed. Held separately from
    // the raw OCR so the user can correct the type without re-scanning.
    const [scanKind, setScanKind] = useState(null);
    const [typeOverridden, setTypeOverridden] = useState(false);
    const [confidenceScore, setConfidenceScore] = useState(null);
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
        const ocrPromise = runOcr(scan.blob, accessToken);

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
    }, [userId]);

    const runOcr = useCallback(async (blob, accessToken) => {
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('read-failed'));
                reader.readAsDataURL(blob);
            });
            const res = await fetch('/api/bankroll/scan-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ image: base64 }),
            });
            if (!res.ok) {
                const detail = await res.json().catch(() => null);
                console.warn('[ReceiptScanner] Read failed:', res.status, detail && detail.detail);
                if (mountedRef.current) setConfidenceScore(10);
                return;
            }
            const result = await res.json();
            if (!mountedRef.current) return;
            if (result && result.success && result.data) {
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
        } catch (_err) {
            // Reading the receipt is optional. The image still saves.
            if (mountedRef.current) setConfidenceScore(10);
        }
    }, [computeConfidence]);

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

        const approved = { blob: scan.blob, previewUrl, width: scan.width, height: scan.height };
        setApprovedScan(approved);
        await uploadApprovedScan(approved);
    }, [uploadApprovedScan]);

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
                // What it was read as and where it belongs, so the page can
                // open the right destination already filled in.
                documentType: scanKind ? scanKind.scan.documentType : 'unknown',
                route: scanKind ? scanKind.route : null,
                typeConfirmedByUser: typeOverridden,
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
