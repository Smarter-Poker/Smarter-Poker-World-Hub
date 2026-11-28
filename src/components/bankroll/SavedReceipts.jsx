/**
 * SAVED RECEIPTS
 *
 * Every image attached to a bankroll entry, as a grid of thumbnails with the
 * entry's date, result and venue. The decisions (labels, which image a delete
 * removes, what happens to the receipt behind it) live in
 * src/lib/bankroll/receiptGallery.mjs so they are tested without a browser.
 */

import { useState, useEffect, useCallback } from 'react';
import { Image, X, Trash2, Calendar, DollarSign, FileText, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from '../../stores/toastStore';
import { parseLedgerDay } from '../../lib/bankroll/localDates.mjs';
import { receiptCards, mediaWithout, RECEIPT_UNASSIGN } from '../../lib/bankroll/receiptGallery.mjs';
import { METAL } from './metalStyles';

export default function SavedReceipts({ userId }) {
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(true);
    // A failed load is said, not shown as "No Saved Receipts": an empty grid
    // after a dropped connection told the player their receipts were gone.
    const [loadFailed, setLoadFailed] = useState(false);
    const [removingKey, setRemovingKey] = useState(null);
    const [lightboxUrl, setLightboxUrl] = useState(null);

    const loadReceipts = useCallback(async () => {
        if (!userId) { setLoading(false); return; }
        setLoading(true);
        setLoadFailed(false);
        try {
            const { data, error } = await supabase
                .from('bankroll_ledger')
                // CHECK 13 (2026-08-14): location_name is not a column - the
                // select 42703'd and saved receipts NEVER loaded. The venue
                // name lives on bankroll_locations via the location_id FK.
                .select('id, category, entry_date, net_result, media_urls, notes, location:bankroll_locations(name)')
                .eq('user_id', userId)
                .not('media_urls', 'is', null)
                .order('entry_date', { ascending: false })
                .limit(100);

            if (error) throw error;
            setReceipts(receiptCards(data));
        } catch (err) {
            console.warn('Failed to load receipts:', err?.message || err);
            setLoadFailed(true);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadReceipts(); }, [loadReceipts]);

    useEffect(() => {
        if (!lightboxUrl || typeof window === 'undefined') return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setLightboxUrl(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [lightboxUrl]);

    /**
     * Take an image off its entry. The receipt it came from is NOT deleted:
     * it goes back to Receipts Waiting, so it can be filed again elsewhere.
     */
    const handleDeleteReceipt = async (receipt) => {
        if (removingKey) return;
        if (typeof window !== 'undefined'
            && !window.confirm('Remove This Image From Its Entry? The Receipt Goes Back To Receipts Waiting.')) return;
        setRemovingKey(receipt.key);
        try {
            const { data: entry, error: readError } = await supabase
                .from('bankroll_ledger')
                .select('media_urls')
                .eq('id', receipt.entryId)
                .eq('user_id', userId)
                .maybeSingle();
            if (readError) throw readError;
            if (!entry) throw new Error('entry-not-found');

            const { error: updateError } = await supabase
                .from('bankroll_ledger')
                .update({ media_urls: mediaWithout(entry.media_urls, receipt.imageUrl) })
                .eq('id', receipt.entryId)
                .eq('user_id', userId);
            if (updateError) throw updateError;

            // Back to Receipts Waiting, never orphaned.
            const { error: receiptError } = await supabase
                .from('bankroll_receipts')
                .update(RECEIPT_UNASSIGN)
                .eq('user_id', userId)
                .eq('image_url', receipt.imageUrl)
                .eq('assigned_id', receipt.entryId);
            if (receiptError) console.warn('[SavedReceipts] receipt not returned to waiting:', receiptError.message);

            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bankroll-updated'));
            toast.success('Image Removed. The Receipt Is Back In Receipts Waiting.');
            await loadReceipts();
        } catch (err) {
            console.warn('Delete failed:', err?.message || err);
            toast.error('Could Not Remove That Image. Try Again.');
        } finally {
            setRemovingKey(null);
        }
    };

    if (loading) {
        return (
            <div className="sd-panel" style={styles.loadingState}>
                <div style={styles.spinner} />
                <span>Loading Receipts...</span>
            </div>
        );
    }

    if (loadFailed) {
        return (
            <div className="sd-panel" style={styles.emptyState} role="alert">
                <p style={styles.emptyTitle}>Saved Receipts Could Not Load</p>
                <p style={styles.emptyHint}>Nothing Was Lost. Check Your Connection And Try Again.</p>
                <button type="button" onClick={loadReceipts} style={styles.retryBtn}>
                    <RefreshCw size={14} /> Try Again
                </button>
            </div>
        );
    }

    if (receipts.length === 0) {
        return (
            <div className="sd-panel" style={styles.emptyState}>
                <Image size={40} style={{ color: 'rgba(255,255,255,0.2)', marginBottom: 16 }} />
                <p style={styles.emptyTitle}>No Saved Receipts</p>
                <p style={styles.emptyHint}>Scan Or Upload A Receipt From The Scan Receipt Section To See It Here.</p>
            </div>
        );
    }

    return (
        <div className="sd-panel">
            <div style={styles.header}>
                <h3 style={styles.title}>Saved Receipts</h3>
                <span style={styles.count}>{receipts.length} Receipt{receipts.length !== 1 ? 's' : ''}</span>
            </div>

            <div style={styles.grid}>
                {receipts.map((r) => (
                    <div key={r.key} style={styles.card}>
                        {r.isPdf ? (
                            <a href={r.imageUrl} target="_blank" rel="noopener noreferrer" style={styles.thumbnailWrap} aria-label={`Open ${r.label} Document`}>
                                <span style={styles.pdfTile}><FileText size={28} /> PDF</span>
                            </a>
                        ) : (
                            <button
                                type="button"
                                style={styles.thumbnailWrap}
                                onClick={() => setLightboxUrl(r.imageUrl)}
                                aria-label={`View ${r.label} Receipt`}
                            >
                                <img src={r.imageUrl} alt="" style={styles.thumbnail} loading="lazy" />
                            </button>
                        )}
                        <div style={styles.cardInfo}>
                            <div style={styles.cardCategory}>{r.label}</div>
                            <div style={styles.cardMeta}>
                                {r.date && (
                                    <span style={styles.metaItem}>
                                        <Calendar size={10} />
                                        {parseLedgerDay(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                )}
                                {r.netResult !== null && (
                                    <span style={{
                                        ...styles.metaItem,
                                        color: r.netResult >= 0 ? '#22c55e' : '#ef4444',
                                    }}>
                                        <DollarSign size={10} />
                                        {r.netResult >= 0 ? '+' : '-'}{Math.abs(r.netResult).toLocaleString()}
                                    </span>
                                )}
                            </div>
                            {r.location && (
                                <div style={styles.cardLocation}>{r.location}</div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteReceipt(r); }}
                            disabled={removingKey === r.key}
                            style={{ ...styles.deleteBtn, opacity: removingKey === r.key ? 0.5 : 1 }}
                            aria-label="Remove This Image From Its Entry"
                            title="Remove Image"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Lightbox */}
            {lightboxUrl && (
                <div style={styles.lightbox} onClick={() => setLightboxUrl(null)} role="dialog" aria-modal="true" aria-label="Receipt Image">
                    <button type="button" style={styles.lightboxClose} onClick={() => setLightboxUrl(null)} aria-label="Close">
                        <X size={24} />
                    </button>
                    <img src={lightboxUrl} alt="Receipt" style={styles.lightboxImage} />
                </div>
            )}
        </div>
    );
}

const styles = {
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        padding: '0 4px',
    },
    title: {
        margin: 0,
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
        fontFamily: "'Rajdhani', sans-serif",
        letterSpacing: '0.05em',
    },
    count: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        fontFamily: "'Rajdhani', sans-serif",
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 12,
    },
    card: {
        position: 'relative',
        background: 'rgba(255,255,255,0.1)',
        border: `2px solid ${METAL.mid}`,
        borderRadius: 10,
        overflow: 'hidden',
    },
    thumbnailWrap: {
        display: 'block',
        width: '100%',
        height: 140,
        padding: 0,
        margin: 0,
        background: 'none',
        border: 'none',
        overflow: 'hidden',
        cursor: 'pointer',
        borderBottom: `1px solid ${METAL.mid}`,
        textDecoration: 'none',
    },
    pdfTile: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: '100%',
        height: '100%',
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        fontWeight: 600,
    },
    retryBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 16,
        padding: '10px 16px',
        minHeight: 44,
        background: 'none',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    thumbnail: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    cardInfo: {
        padding: '8px 10px',
    },
    cardCategory: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        fontFamily: "'Rajdhani', sans-serif",
        letterSpacing: '0.05em',
        marginBottom: 4,
    },
    cardMeta: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '2px 10px',
        alignItems: 'center',
        minWidth: 0,
    },
    metaItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
    },
    cardLocation: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.3)',
        marginTop: 4,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    deleteBtn: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        border: '2px solid rgba(239,68,68,0.3)',
        borderRadius: 6,
        color: '#ef4444',
        cursor: 'pointer',
    },
    loadingState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 0',
        gap: 12,
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
    },
    spinner: {
        width: 24,
        height: 24,
        border: '2px solid rgba(255,255,255,0.1)',
        borderTopColor: METAL.cyan,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
    },
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        textAlign: 'center',
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        margin: '0 0 8px',
    },
    emptyHint: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.3)',
        margin: 0,
        lineHeight: 1.5,
    },
    lightbox: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        cursor: 'pointer',
    },
    lightboxClose: {
        position: 'absolute',
        top: 16,
        right: 16,
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        borderRadius: '50%',
        width: 44,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        cursor: 'pointer',
    },
    lightboxImage: {
        maxWidth: '90vw',
        maxHeight: '85vh',
        objectFit: 'contain',
        borderRadius: 8,
    },
};
