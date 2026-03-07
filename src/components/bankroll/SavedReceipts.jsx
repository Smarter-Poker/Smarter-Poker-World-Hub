/**
 * SAVED RECEIPTS COMPONENT
 * Shows all bankroll entries that have receipt images attached
 * Grid layout with thumbnails, dates, and amounts
 */

import { useState, useEffect, useCallback } from 'react';
import { Image, X, Trash2, Calendar, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { METAL, GRADIENTS, GLOWS } from './metalStyles';

export default function SavedReceipts({ userId }) {
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lightboxUrl, setLightboxUrl] = useState(null);

    const loadReceipts = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('bankroll_ledger')
                .select('id, category, entry_date, net_result, media_urls, location_name, notes')
                .eq('user_id', userId)
                .not('media_urls', 'is', null)
                .order('entry_date', { ascending: false })
                .limit(100);

            if (error) throw error;

            // Flatten: each image is a separate card linked to its entry
            const flat = [];
            (data || []).forEach(entry => {
                if (entry.media_urls && Array.isArray(entry.media_urls)) {
                    entry.media_urls.forEach((url, idx) => {
                        flat.push({
                            entryId: entry.id,
                            imageUrl: url,
                            imageIndex: idx,
                            category: entry.category,
                            date: entry.entry_date,
                            netResult: entry.net_result,
                            location: entry.location_name,
                            notes: entry.notes,
                        });
                    });
                }
            });
            setReceipts(flat);
        } catch (err) {
            console.error('Failed to load receipts:', err);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadReceipts(); }, [loadReceipts]);

    const handleDeleteReceipt = async (receipt) => {
        if (!confirm('Remove this receipt image?')) return;
        try {
            // Fetch current entry
            const { data: entry } = await supabase
                .from('bankroll_ledger')
                .select('media_urls')
                .eq('id', receipt.entryId)
                .maybeSingle();

            if (!entry) return;

            const updated = (entry.media_urls || []).filter((_, i) => i !== receipt.imageIndex);
            await supabase
                .from('bankroll_ledger')
                .update({ media_urls: updated.length > 0 ? updated : null })
                .eq('id', receipt.entryId);

            loadReceipts();
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const LABELS = {
        cash: 'Cash Game', tournament: 'Tournament', expense: 'Expense',
        deposit: 'Deposit', withdrawal: 'Withdrawal', sports_bet: 'Sports Bet',
        casino: 'Table Game', slots: 'Slots',
    };

    if (loading) {
        return (
            <div style={styles.loadingState}>
                <div style={styles.spinner} />
                <span>Loading Receipts...</span>
            </div>
        );
    }

    if (receipts.length === 0) {
        return (
            <div style={styles.emptyState}>
                <Image size={40} style={{ color: 'rgba(255,255,255,0.2)', marginBottom: 16 }} />
                <p style={styles.emptyTitle}>No Saved Receipts</p>
                <p style={styles.emptyHint}>Scan Or Upload A Receipt From The Scan Receipt Section To See It Here.</p>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h3 style={styles.title}>Saved Receipts</h3>
                <span style={styles.count}>{receipts.length} receipt{receipts.length !== 1 ? 's' : ''}</span>
            </div>

            <div style={styles.grid}>
                {receipts.map((r, i) => (
                    <div key={`${r.entryId}-${r.imageIndex}`} style={styles.card}>
                        <div
                            style={styles.thumbnailWrap}
                            onClick={() => setLightboxUrl(r.imageUrl)}
                        >
                            <img src={r.imageUrl} alt="Receipt" style={styles.thumbnail} />
                        </div>
                        <div style={styles.cardInfo}>
                            <div style={styles.cardCategory}>{LABELS[r.category] || r.category}</div>
                            <div style={styles.cardMeta}>
                                {r.date && (
                                    <span style={styles.metaItem}>
                                        <Calendar size={10} />
                                        {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                )}
                                {r.netResult != null && (
                                    <span style={{
                                        ...styles.metaItem,
                                        color: r.netResult >= 0 ? '#22c55e' : '#ef4444',
                                    }}>
                                        <DollarSign size={10} />
                                        {r.netResult >= 0 ? '+' : ''}{r.netResult.toLocaleString()}
                                    </span>
                                )}
                            </div>
                            {r.location && (
                                <div style={styles.cardLocation}>{r.location}</div>
                            )}
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteReceipt(r); }}
                            style={styles.deleteBtn}
                            title="Remove Receipt"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Lightbox */}
            {lightboxUrl && (
                <div style={styles.lightbox} onClick={() => setLightboxUrl(null)}>
                    <button style={styles.lightboxClose} onClick={() => setLightboxUrl(null)}>
                        <X size={24} />
                    </button>
                    <img src={lightboxUrl} alt="Receipt" style={styles.lightboxImage} />
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        padding: '16px 0',
    },
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
        gridTemplateColumns: 'repeat(2, 1fr)',
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
        width: '100%',
        height: 140,
        overflow: 'hidden',
        cursor: 'pointer',
        borderBottom: `1px solid ${METAL.mid}`,
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
        gap: 10,
        alignItems: 'center',
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
        top: 6,
        right: 6,
        width: 28,
        height: 28,
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
        width: 40,
        height: 40,
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
