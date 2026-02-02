/**
 * RECEIPT SCANNER COMPONENT
 * Camera/upload UI for scanning poker + travel expense receipts
 */

import { useState, useRef, useCallback } from 'react';
import { Camera, Upload, X, Loader2, Check, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';

const EXPENSE_ICONS = {
    buy_in: '🎰',
    hotel: '🏨',
    flights: '✈️',
    rental_car: '🚗',
    gas: '⛽',
    meals: '🍔',
    transport: '🚕',
    tips: '💵',
    tournament: '🏆',
    other: '📦'
};

const EXPENSE_LABELS = {
    buy_in: 'Buy-In',
    hotel: 'Hotel',
    flights: 'Flight',
    rental_car: 'Rental Car',
    gas: 'Gas',
    meals: 'Meal',
    transport: 'Transport',
    tips: 'Tips',
    tournament: 'Tournament',
    other: 'Other'
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

        // Preview
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
            // Convert to base64
            const base64 = await fileToBase64(file);

            // Get auth token
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                setError('Not authenticated');
                return;
            }

            // Call scan API
            const response = await fetch('/api/bankroll/scan-receipt', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image: base64 }),
            });

            if (!response.ok) {
                throw new Error('Scan failed');
            }

            const { data } = await response.json();
            setScanResult(data);
        } catch (err) {
            console.error('Scan error:', err);
            setError('Failed to scan receipt. Try again.');
        } finally {
            setIsScanning(false);
        }
    };

    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleConfirm = () => {
        if (scanResult && onScanComplete) {
            onScanComplete({
                ...scanResult,
                tripId
            });
        }
        resetScanner();
    };

    const resetScanner = () => {
        setScanResult(null);
        setImagePreview(null);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h3 style={styles.title}>📸 Scan Receipt</h3>
                {(imagePreview || scanResult) && (
                    <button onClick={resetScanner} style={styles.resetBtn}>
                        <RefreshCw size={14} /> New Scan
                    </button>
                )}
            </div>

            {/* Upload Area */}
            {!imagePreview && !isScanning && (
                <div style={styles.uploadArea}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileSelect}
                        style={styles.fileInput}
                    />
                    <div style={styles.uploadContent}>
                        <Camera size={32} style={{ color: 'rgba(255,255,255,0.4)' }} />
                        <p style={styles.uploadText}>Tap to scan receipt</p>
                        <p style={styles.uploadHint}>Buy-ins, hotels, meals, gas, rentals</p>
                    </div>
                </div>
            )}

            {/* Loading State */}
            {isScanning && (
                <div style={styles.loadingArea}>
                    <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#00D4FF' }} />
                    <p style={styles.loadingText}>Analyzing receipt...</p>
                </div>
            )}

            {/* Preview + Results */}
            {imagePreview && !isScanning && (
                <div style={styles.resultsArea}>
                    {/* Image thumbnail */}
                    <div style={styles.previewRow}>
                        <img src={imagePreview} alt="Receipt" style={styles.previewImage} />
                        <div style={styles.statusBadge}>
                            {scanResult ? (
                                <><Check size={12} /> Scanned</>
                            ) : error ? (
                                <><X size={12} /> Failed</>
                            ) : null}
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={styles.errorBox}>
                            {error}
                            <button onClick={() => scanReceipt(fileInputRef.current?.files?.[0])} style={styles.retryBtn}>
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Scan Result */}
                    {scanResult && (
                        <div style={styles.resultCard}>
                            <div style={styles.resultHeader}>
                                <span style={styles.categoryBadge}>
                                    {EXPENSE_ICONS[scanResult.category]} {EXPENSE_LABELS[scanResult.category]}
                                </span>
                                <span style={styles.confidence}>
                                    {scanResult.confidence > 0 ? `${scanResult.confidence}% confident` : 'Manual review'}
                                </span>
                            </div>

                            <div style={styles.resultAmount}>
                                {formatCurrency(scanResult.amount, displayEUR)}
                            </div>

                            <div style={styles.resultDetails}>
                                {scanResult.vendor && (
                                    <div style={styles.detailRow}>
                                        <span style={styles.detailLabel}>Vendor</span>
                                        <span style={styles.detailValue}>{scanResult.vendor}</span>
                                    </div>
                                )}
                                {scanResult.location && (
                                    <div style={styles.detailRow}>
                                        <span style={styles.detailLabel}>Location</span>
                                        <span style={styles.detailValue}>{scanResult.location}</span>
                                    </div>
                                )}
                                {scanResult.date && (
                                    <div style={styles.detailRow}>
                                        <span style={styles.detailLabel}>Date</span>
                                        <span style={styles.detailValue}>{scanResult.date}</span>
                                    </div>
                                )}
                                {scanResult.description && (
                                    <div style={styles.detailRow}>
                                        <span style={styles.detailLabel}>Description</span>
                                        <span style={styles.detailValue}>{scanResult.description}</span>
                                    </div>
                                )}
                            </div>

                            {/* Itemized breakdown */}
                            {scanResult.itemized?.length > 0 && (
                                <div style={styles.itemized}>
                                    <div style={styles.itemizedHeader}>Items</div>
                                    {scanResult.itemized.map((item, i) => (
                                        <div key={i} style={styles.itemRow}>
                                            <span>{item.item}</span>
                                            <span>{formatCurrency(item.amount, displayEUR)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Tax deductible indicator */}
                            {scanResult.tax_deductible && (
                                <div style={styles.taxBadge}>
                                    ✅ Tax Deductible Expense
                                </div>
                            )}

                            {/* Actions */}
                            <div style={styles.actions}>
                                <button onClick={resetScanner} style={styles.cancelBtn}>
                                    Cancel
                                </button>
                                <button onClick={handleConfirm} style={styles.confirmBtn}>
                                    Add to Log
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}

const styles = {
    container: {
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: 16,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    title: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        margin: 0,
    },
    resetBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11,
        cursor: 'pointer',
    },
    uploadArea: {
        position: 'relative',
        border: '2px dashed rgba(255,255,255,0.15)',
        borderRadius: 10,
        padding: 32,
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
    },
    fileInput: {
        position: 'absolute',
        inset: 0,
        opacity: 0,
        cursor: 'pointer',
    },
    uploadContent: {
        pointerEvents: 'none',
    },
    uploadText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        marginTop: 8,
        marginBottom: 4,
    },
    uploadHint: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        margin: 0,
    },
    loadingArea: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 32,
        gap: 12,
    },
    loadingText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
    },
    resultsArea: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    previewRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    previewImage: {
        width: 60,
        height: 60,
        objectFit: 'cover',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
    },
    statusBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        background: 'rgba(34,197,94,0.1)',
        border: '1px solid rgba(34,197,94,0.3)',
        borderRadius: 6,
        color: '#22c55e',
        fontSize: 11,
    },
    errorBox: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 10,
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 8,
        color: '#ef4444',
        fontSize: 12,
    },
    retryBtn: {
        padding: '4px 10px',
        background: 'rgba(239,68,68,0.2)',
        border: 'none',
        borderRadius: 4,
        color: '#ef4444',
        fontSize: 11,
        cursor: 'pointer',
    },
    resultCard: {
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 10,
        padding: 14,
    },
    resultHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    categoryBadge: {
        padding: '4px 10px',
        background: 'rgba(0,212,255,0.1)',
        border: '1px solid rgba(0,212,255,0.3)',
        borderRadius: 6,
        color: '#00D4FF',
        fontSize: 11,
    },
    confidence: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
    },
    resultAmount: {
        fontSize: 28,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 12,
    },
    resultDetails: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    detailRow: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 12,
    },
    detailLabel: {
        color: 'rgba(255,255,255,0.5)',
    },
    detailValue: {
        color: '#fff',
        fontWeight: 500,
    },
    itemized: {
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid rgba(255,255,255,0.06)',
    },
    itemizedHeader: {
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    itemRow: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
        padding: '3px 0',
    },
    taxBadge: {
        marginTop: 12,
        padding: 8,
        background: 'rgba(34,197,94,0.1)',
        border: '1px solid rgba(34,197,94,0.2)',
        borderRadius: 6,
        color: '#22c55e',
        fontSize: 11,
        textAlign: 'center',
    },
    actions: {
        display: 'flex',
        gap: 8,
        marginTop: 14,
    },
    cancelBtn: {
        flex: 1,
        padding: '10px 0',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        cursor: 'pointer',
    },
    confirmBtn: {
        flex: 1,
        padding: '10px 0',
        background: 'linear-gradient(135deg, #00D4FF, #00A3CC)',
        border: 'none',
        borderRadius: 8,
        color: '#000',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
    },
};
