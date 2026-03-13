/**
 * RECEIPT SCANNER COMPONENT
 * Captures receipt image → uploads to Supabase Storage → saves URL to bankroll entry
 * NO AI / NO APIs — just image upload to Supabase
 */

import { useState, useRef, useCallback } from 'react';
import { Camera, Upload, X, Loader2, Check, RefreshCw, Scan, Shield, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { eventBus, EventType } from '../../engine/EventBus';
import { METAL, GRADIENTS, GLOWS, ANIMATIONS } from './metalStyles';
import DocumentCropper from './DocumentCropper';
import LiveCameraScanner from './LiveCameraScanner';

// No emoji icons - use labels only for clean SmarterPoker-style UI
const EXPENSE_ICONS = {
    buy_in: '', hotel: '', flights: '', rental_car: '',
    gas: '', meals: '', transport: '', tips: '',
    tournament: '', other: ''
};

const EXPENSE_LABELS = {
    buy_in: 'BUY-IN', hotel: 'HOTEL', flights: 'FLIGHT', rental_car: 'RENTAL',
    gas: 'GAS', meals: 'MEAL', transport: 'TRANSPORT', tips: 'TIPS',
    tournament: 'TOURNAMENT', other: 'OTHER'
};

export default function ReceiptScanner({ onScanComplete, userId, displayEUR = false, tripId = null }) {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedUrl, setUploadedUrl] = useState(null);
    const [extractedData, setExtractedData] = useState(null);
    const [error, setError] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [showCropper, setShowCropper] = useState(false);
    const [rawImage, setRawImage] = useState(null);
    const [showLiveCamera, setShowLiveCamera] = useState(false);
    const [confidenceScore, setConfidenceScore] = useState(null); // 0-100
    const [verified, setVerified] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const fileInputRef = useRef(null);

    // Compute confidence from OCR result quality
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

    const handleFileSelect = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            setRawImage(ev.target.result);
            setShowCropper(true);
        };
        reader.readAsDataURL(file);
    }, []);

    const handleCropConfirm = useCallback(async (croppedBase64) => {
        setShowCropper(false);
        setImagePreview(croppedBase64);
        await processReceipt(croppedBase64, 'receipt-cropped.jpg');
    }, [userId]);

    const handleCropSkip = useCallback(async () => {
        setShowCropper(false);
        if (rawImage) {
            setImagePreview(rawImage);
            await processReceipt(rawImage, 'receipt-original.jpg');
        }
    }, [rawImage, userId]);

    // Handle live camera capture — already cropped by the scanner
    const handleLiveCapture = useCallback(async (capturedBase64) => {
        setShowLiveCamera(false);
        setImagePreview(capturedBase64);
        await processReceipt(capturedBase64, 'receipt-cropped.jpg');
    }, [userId]);

    // Upload receipt image and perform AI OCR simultaneously
    const processReceipt = async (base64Data, fileName) => {
        setIsUploading(true);
        setError(null);
        setUploadedUrl(null);
        setExtractedData(null);

        try {
            const session = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
            if (!session?.user?.id) {
                setError('Sign in required');
                return;
            }

            // 1. Setup blob for storage upload
            const res = await fetch(base64Data);
            const blob = await res.blob();
            const file = new File([blob], fileName, { type: 'image/jpeg' });

            const uid = userId || session.user.id;
            const fileExt = file.name?.split('.').pop() || 'jpg';
            const storageName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
            const filePath = `bankroll/${uid}/${storageName}`;

            // 2. Upload to Supabase Storage
            const uploadPromise = supabase.storage
                .from('images')
                .upload(filePath, file)
                .then(async ({ error }) => {
                    if (error) throw error;
                    const { data: { publicUrl } } = supabase.storage
                        .from('images')
                        .getPublicUrl(filePath);
                    return publicUrl;
                });

            // 3. Call OCR API
            const ocrPromise = fetch('/api/bankroll/scan-receipt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ image: base64Data })
            }).then(async r => {
                if (!r.ok) return null; // Don't fail upload if OCR fails
                return r.json();
            }).catch(() => null);

            // Wait for both tasks to complete
            const [publicUrl, ocrResult] = await Promise.all([uploadPromise, ocrPromise]);

            setUploadedUrl(publicUrl);
            if (ocrResult?.success && ocrResult.data) {
                setExtractedData(ocrResult.data);
                const conf = computeConfidence(ocrResult.data);
                setConfidenceScore(conf);
            } else {
                setConfidenceScore(10); // Very low confidence — no OCR data
            }
        } catch (err) {
            console.error('Process error:', err);
            setError('UPLOAD FAILED - RETRY');
        } finally {
            setIsUploading(false);
        }
    };

    const handleConfirm = () => {
        if (uploadedUrl && onScanComplete) {
            onScanComplete({ imageUrl: uploadedUrl, extractedData, tripId });
        }
        resetScanner();
    };

    const resetScanner = () => {
        setUploadedUrl(null);
        setImagePreview(null);
        setRawImage(null);
        setExtractedData(null);
        setConfidenceScore(null);
        setVerified(false);
        setVerifying(false);
        setShowCropper(false);
        setShowLiveCamera(false);
        setError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Verify & Lock — marks receipt as auditor-verified
    const handleVerifyLock = async () => {
        setVerifying(true);
        try {
            // In production, this would update the expense_receipts row
            // For now, we emit EventBus and set local state
            setVerified(true);
            eventBus.emit(EventType.SESSION_END, {
                source: 'ReceiptScanner',
                action: 'receipt_verified',
                confidence: confidenceScore,
            }, 'ReceiptScanner');
        } catch (e) {
            console.error('[ReceiptScanner] Verify error:', e);
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div style={styles.container}>
            {/* LED Strip */}
            <div style={styles.ledStrip} />

            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerTitle}>
                    <Scan size={16} style={{ color: METAL.cyan }} />
                    <span>SCAN RECEIPT</span>
                </div>
                {(imagePreview || uploadedUrl) && (
                    <button onClick={resetScanner} style={styles.resetBtn}>
                        <RefreshCw size={12} />
                        NEW SCAN
                    </button>
                )}
            </div>

            {/* Scanning State */}
            {isUploading && (
                <div style={styles.scanningState}>
                    <div style={styles.scannerOverlay}>
                        <div style={styles.scanLine} />
                    </div>
                    {imagePreview && (
                        <img src={imagePreview} alt="Uploading" style={styles.scanningImage} />
                    )}
                    <div style={styles.scanningInfo}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>ANALYZING RECEIPT...</span>
                    </div>
                </div>
            )}

            {/* Live Camera */}
            {showLiveCamera && !imagePreview && !isUploading && (
                <LiveCameraScanner
                    onCapture={handleLiveCapture}
                    onClose={() => setShowLiveCamera(false)}
                />
            )}

            {/* Upload Area — shows when no camera active */}
            {!showLiveCamera && !imagePreview && !isUploading && (
                <div style={styles.uploadArea}>
                    <div
                        style={styles.cameraLaunchBtn}
                        onClick={() => setShowLiveCamera(true)}
                    >
                        <div style={styles.uploadIcon}>
                            <Camera size={32} />
                        </div>
                        <p style={styles.uploadText}>TAP TO SCAN RECEIPT</p>
                        <p style={styles.uploadHint}>Auto-detects And Captures Receipts</p>
                    </div>
                    <div style={styles.uploadDivider}>
                        <span style={styles.uploadDividerLine} />
                        <span style={styles.uploadDividerText}>Or</span>
                        <span style={styles.uploadDividerLine} />
                    </div>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        style={styles.fileUploadBtn}
                    >
                        <Upload size={14} />
                        Upload from gallery
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

            {/* Error State */}
            {error && !isUploading && (
                <div style={styles.errorBox}>
                    <X size={16} />
                    <span>{error}</span>
                    <button onClick={resetScanner} style={styles.retryBtn}>
                        RETRY
                    </button>
                </div>
            )}

            {/* Scan Result */}
            {uploadedUrl && !isUploading && (
                <div style={styles.resultContainer}>
                    {/* Confidence Badge */}
                    {confidenceScore !== null && (() => {
                        const conf = getConfidenceLabel(confidenceScore);
                        return (
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 8, padding: '8px 16px', marginBottom: 16,
                                background: conf.bg, border: `1px solid ${conf.border}`,
                                borderRadius: 20, width: 'fit-content', margin: '0 auto 16px',
                            }}>
                                {conf.label === 'HIGH' ? <Shield size={14} style={{ color: conf.color }} /> : <AlertTriangle size={14} style={{ color: conf.color }} />}
                                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, fontWeight: 800, color: conf.color, letterSpacing: '0.1em' }}>
                                    {conf.label} CONFIDENCE — {confidenceScore}%
                                </span>
                            </div>
                        );
                    })()}

                    {/* Verified Badge */}
                    {verified && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 6, padding: '6px 12px', marginBottom: 16,
                            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                            borderRadius: 20, width: 'fit-content', margin: '0 auto 16px',
                        }}>
                            <Shield size={12} style={{ color: '#4ade80' }} />
                            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 12, fontWeight: 800, color: '#4ade80', letterSpacing: '0.1em' }}>VERIFIED & LOCKED</span>
                        </div>
                    )}

                    {/* Preview Image */}
                    <div style={styles.previewContainer}>
                        <img src={uploadedUrl} alt="Receipt" style={styles.previewImage} />
                    </div>

                    {/* AI Data Extraction Preview — with field-level confidence flags */}
                    {extractedData && (
                        <div style={styles.dataGrid}>
                            {extractedData.vendor != null && (
                                <div style={{
                                    ...styles.dataRow,
                                    borderColor: (!extractedData.vendor || extractedData.vendor.length < 3) ? 'rgba(239,68,68,0.4)' : styles.dataRow.border?.includes?.('mid') ? undefined : undefined,
                                    ...((!extractedData.vendor || extractedData.vendor.length < 3) ? { border: '2px solid rgba(239,68,68,0.4)' } : {}),
                                }}>
                                    <span style={styles.dataLabel}>VENDOR {(!extractedData.vendor || extractedData.vendor.length < 3) && <span style={{ color: '#f87171', fontSize: 10 }}>⚠ REVIEW</span>}</span>
                                    <span style={styles.dataValue}>{extractedData.vendor || '—'}</span>
                                </div>
                            )}
                            {extractedData.amount != null && (
                                <div style={{
                                    ...styles.dataRow,
                                    ...(parseFloat(extractedData.amount) <= 0 ? { border: '2px solid rgba(239,68,68,0.4)' } : {}),
                                }}>
                                    <span style={styles.dataLabel}>AMOUNT {parseFloat(extractedData.amount) <= 0 && <span style={{ color: '#f87171', fontSize: 10 }}>⚠ REVIEW</span>}</span>
                                    <span style={{ ...styles.dataValue, color: '#4ade80' }}>${parseFloat(extractedData.amount).toFixed(2)}</span>
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

                    {/* Actions */}
                    <div style={styles.actions}>
                        <button onClick={resetScanner} style={styles.cancelBtn}>
                            <X size={14} />
                            DISCARD
                        </button>
                        {!verified && confidenceScore !== null && confidenceScore < 75 && (
                            <button
                                onClick={handleVerifyLock}
                                disabled={verifying}
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
                        <button onClick={handleConfirm} style={styles.confirmBtn}>
                            <Check size={14} />
                            SAVE RECEIPT
                        </button>
                    </div>
                </div>
            )}

            <style jsx global>{ANIMATIONS}</style>

            {/* Document Cropper Overlay */}
            {showCropper && rawImage && (
                <DocumentCropper
                    imageSrc={rawImage}
                    onConfirm={handleCropConfirm}
                    onCancel={handleCropSkip}
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
        background: METAL.cyan,
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
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.15em',
        color: '#fff',
    },
    resetBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
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
        padding: '48px 24px',
        cursor: 'pointer',
        transition: 'background 0.2s',
    },
    fileInput: {
        position: 'absolute',
        opacity: 0,
        pointerEvents: 'none',
    },
    uploadIcon: {
        width: 64,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,212,255,0.1)',
        border: `2px dashed ${METAL.cyan}`,
        borderRadius: '50%',
        color: METAL.cyan,
        marginBottom: 16,
    },
    uploadText: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: '0.15em',
        color: '#fff',
        margin: 0,
    },
    uploadHint: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 6,
    },
    cameraLaunchBtn: {
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 0',
    },
    uploadDivider: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 24px',
        margin: '4px 0',
    },
    uploadDividerLine: {
        flex: 1,
        height: 1,
        background: 'rgba(255,255,255,0.1)',
    },
    uploadDividerText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.3)',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    fileUploadBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '10px 0',
        background: 'none',
        border: 'none',
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    scanningState: {
        position: 'relative',
        padding: '32px 24px',
        textAlign: 'center',
    },
    scannerOverlay: {
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,212,255,0.03)',
        overflow: 'hidden',
    },
    scanLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 3,
        background: `linear-gradient(90deg, transparent, ${METAL.cyan}, transparent)`,
        boxShadow: GLOWS.cyanSubtle,
        animation: 'scanLine 1.5s ease-in-out infinite',
    },
    scanningImage: {
        width: 120,
        height: 120,
        objectFit: 'cover',
        borderRadius: 8,
        border: `2px solid ${METAL.cyan}`,
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
        color: METAL.cyan,
    },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '20px',
        background: 'rgba(239,68,68,0.1)',
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
        padding: '6px 12px',
        background: 'rgba(239,68,68,0.2)',
        border: `2px solid ${METAL.danger}`,
        borderRadius: 6,
        color: METAL.danger,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
    },
    resultContainer: {
        padding: 16,
    },
    confidenceBadge: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '6px 12px',
        background: METAL.cyanDim,
        border: `2px solid ${METAL.cyan}`,
        borderRadius: 20,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: METAL.cyan,
        letterSpacing: '0.1em',
        marginBottom: 16,
        width: 'fit-content',
        margin: '0 auto 16px',
    },
    previewContainer: {
        marginBottom: 16,
        textAlign: 'center',
    },
    previewImage: {
        maxWidth: '100%',
        maxHeight: 150,
        objectFit: 'contain',
        borderRadius: 8,
        border: `2px solid ${METAL.mid}`,
    },
    dataGrid: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginBottom: 16,
    },
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
    statusBadge: {
        padding: '4px 10px',
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.05em',
    },
    itemizedSection: {
        background: 'rgba(0,0,0,0.2)',
        border: `2px solid ${METAL.mid}`,
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 16,
    },
    itemizedHeader: {
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.1)',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.15em',
        borderBottom: `1px solid ${METAL.mid}`,
    },
    itemizedRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '10px 14px',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        borderBottom: `1px solid ${METAL.mid}`,
    },
    actions: {
        display: 'flex',
        gap: 12,
    },
    cancelBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '12px',
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
        padding: '12px',
        background: GRADIENTS.cyanAction,
        border: 'none',
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: '#000',
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
};
