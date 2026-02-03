/**
 * RECEIPT SCANNER COMPONENT
 * Futuristic Metal UI - OCR for poker + travel expense receipts
 * Industrial sci-fi scanner interface with LED indicators
 */

import { useState, useRef, useCallback } from 'react';
import { Camera, Upload, X, Loader2, Check, RefreshCw, Scan, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';
import { METAL, GRADIENTS, GLOWS, ANIMATIONS } from './metalStyles';

const EXPENSE_ICONS = {
    buy_in: '🎰', hotel: '🏨', flights: '✈️', rental_car: '🚗',
    gas: '⛽', meals: '🍔', transport: '🚕', tips: '💵',
    tournament: '🏆', other: '📦'
};

const EXPENSE_LABELS = {
    buy_in: 'BUY-IN', hotel: 'HOTEL', flights: 'FLIGHT', rental_car: 'RENTAL',
    gas: 'GAS', meals: 'MEAL', transport: 'TRANSPORT', tips: 'TIPS',
    tournament: 'TOURNAMENT', other: 'OTHER'
};

export default function ReceiptScanner({ onScanComplete, displayEUR = false, tripId = null }) {
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const [error, setError] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileSelect = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => setImagePreview(e.target.result);
        reader.readAsDataURL(file);

        await scanReceipt(file);
    }, []);

    const scanReceipt = async (file) => {
        setIsScanning(true);
        setError(null);
        setScanResult(null);

        try {
            const base64 = await fileToBase64(file);
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                setError('Authentication required');
                return;
            }

            const response = await fetch('/api/bankroll/scan-receipt', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image: base64 }),
            });

            if (!response.ok) throw new Error('Scan failed');

            const { data } = await response.json();
            setScanResult(data);
        } catch (err) {
            console.error('Scan error:', err);
            setError('SCAN FAILED - RETRY');
        } finally {
            setIsScanning(false);
        }
    };

    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const handleConfirm = () => {
        if (scanResult && onScanComplete) {
            onScanComplete({ ...scanResult, tripId });
        }
        resetScanner();
    };

    const resetScanner = () => {
        setScanResult(null);
        setImagePreview(null);
        setError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
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
                {(imagePreview || scanResult) && (
                    <button onClick={resetScanner} style={styles.resetBtn}>
                        <RefreshCw size={12} />
                        NEW SCAN
                    </button>
                )}
            </div>

            {/* Scanning State */}
            {isScanning && (
                <div style={styles.scanningState}>
                    <div style={styles.scannerOverlay}>
                        <div style={styles.scanLine} />
                    </div>
                    {imagePreview && (
                        <img src={imagePreview} alt="Scanning" style={styles.scanningImage} />
                    )}
                    <div style={styles.scanningInfo}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>ANALYZING RECEIPT...</span>
                    </div>
                </div>
            )}

            {/* Upload Area */}
            {!imagePreview && !isScanning && (
                <div
                    style={styles.uploadArea}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileSelect}
                        style={styles.fileInput}
                    />
                    <div style={styles.uploadIcon}>
                        <Camera size={32} />
                    </div>
                    <p style={styles.uploadText}>TAP TO SCAN RECEIPT</p>
                    <p style={styles.uploadHint}>Buy-ins, hotels, meals, gas, rentals</p>
                </div>
            )}

            {/* Error State */}
            {error && !isScanning && (
                <div style={styles.errorBox}>
                    <X size={16} />
                    <span>{error}</span>
                    <button onClick={() => fileInputRef.current?.click()} style={styles.retryBtn}>
                        RETRY
                    </button>
                </div>
            )}

            {/* Scan Result */}
            {scanResult && !isScanning && (
                <div style={styles.resultContainer}>
                    {/* Confidence Indicator */}
                    <div style={styles.confidenceBadge}>
                        <Zap size={10} />
                        {scanResult.confidence > 0
                            ? `${scanResult.confidence}% CONFIDENCE`
                            : 'DEMO DATA'
                        }
                    </div>

                    {/* Preview Image */}
                    {imagePreview && (
                        <div style={styles.previewContainer}>
                            <img src={imagePreview} alt="Receipt" style={styles.previewImage} />
                        </div>
                    )}

                    {/* Extracted Data */}
                    <div style={styles.dataGrid}>
                        {/* Category */}
                        <div style={styles.dataRow}>
                            <span style={styles.dataLabel}>CATEGORY</span>
                            <span style={styles.dataValue}>
                                {EXPENSE_ICONS[scanResult.category]} {EXPENSE_LABELS[scanResult.category]}
                            </span>
                        </div>

                        {/* Amount */}
                        <div style={styles.dataRow}>
                            <span style={styles.dataLabel}>AMOUNT</span>
                            <span style={{ ...styles.dataValue, color: METAL.cyan, fontSize: 20 }}>
                                {formatCurrency(scanResult.amount, scanResult.currency || 'USD')}
                            </span>
                        </div>

                        {/* Vendor */}
                        {scanResult.vendor && (
                            <div style={styles.dataRow}>
                                <span style={styles.dataLabel}>VENDOR</span>
                                <span style={styles.dataValue}>{scanResult.vendor}</span>
                            </div>
                        )}

                        {/* Date */}
                        {scanResult.date && (
                            <div style={styles.dataRow}>
                                <span style={styles.dataLabel}>DATE</span>
                                <span style={styles.dataValue}>{scanResult.date}</span>
                            </div>
                        )}

                        {/* Location */}
                        {scanResult.location && (
                            <div style={styles.dataRow}>
                                <span style={styles.dataLabel}>LOCATION</span>
                                <span style={styles.dataValue}>{scanResult.location}</span>
                            </div>
                        )}

                        {/* Tax Deductible */}
                        <div style={styles.dataRow}>
                            <span style={styles.dataLabel}>TAX DEDUCTIBLE</span>
                            <span style={{
                                ...styles.statusBadge,
                                background: scanResult.tax_deductible
                                    ? 'rgba(34,197,94,0.15)'
                                    : 'rgba(239,68,68,0.15)',
                                color: scanResult.tax_deductible ? METAL.success : METAL.danger,
                                border: `1px solid ${scanResult.tax_deductible ? METAL.success : METAL.danger}`,
                            }}>
                                {scanResult.tax_deductible ? '✓ YES' : '✕ NO'}
                            </span>
                        </div>
                    </div>

                    {/* Itemized Breakdown */}
                    {scanResult.itemized?.length > 0 && (
                        <div style={styles.itemizedSection}>
                            <div style={styles.itemizedHeader}>ITEMIZED</div>
                            {scanResult.itemized.map((item, i) => (
                                <div key={i} style={styles.itemizedRow}>
                                    <span>{item.item}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                                        ${item.amount?.toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Actions */}
                    <div style={styles.actions}>
                        <button onClick={resetScanner} style={styles.cancelBtn}>
                            <X size={14} />
                            DISCARD
                        </button>
                        <button onClick={handleConfirm} style={styles.confirmBtn}>
                            <Check size={14} />
                            ADD TO LOG
                        </button>
                    </div>
                </div>
            )}

            <style jsx global>{ANIMATIONS}</style>
        </div>
    );
}

const styles = {
    container: {
        position: 'relative',
        background: GRADIENTS.darkPanel,
        border: `1px solid ${METAL.mid}`,
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
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.15em',
        color: '#fff',
    },
    resetBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
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
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.15em',
        color: '#fff',
        margin: 0,
    },
    uploadHint: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 6,
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
        fontSize: 12,
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
        border: `1px solid ${METAL.danger}`,
        margin: 16,
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        fontWeight: 600,
        color: METAL.danger,
        letterSpacing: '0.1em',
    },
    retryBtn: {
        padding: '6px 12px',
        background: 'rgba(239,68,68,0.2)',
        border: `1px solid ${METAL.danger}`,
        borderRadius: 6,
        color: METAL.danger,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
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
        border: `1px solid ${METAL.cyan}`,
        borderRadius: 20,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
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
        border: `1px solid ${METAL.mid}`,
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
        border: `1px solid ${METAL.mid}`,
        borderRadius: 8,
    },
    dataLabel: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
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
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.05em',
    },
    itemizedSection: {
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 16,
    },
    itemizedHeader: {
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.03)',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
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
        fontSize: 12,
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
        border: `1px solid ${METAL.mid}`,
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
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
        fontSize: 12,
        fontWeight: 700,
        color: '#000',
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
};
