import React, { useState, useEffect } from 'react';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useScrimDismiss } from '../../hooks/useScrimDismiss';
import { getUserLocations, renameLocation } from '../../lib/bankroll/locationMemory';
import { supabase } from '../../lib/supabase';
import toast from '../../stores/toastStore';
import { requireOnlineNow } from '../../hooks/useOnlineStatus';

/**
 * ManageVenuesModal - edit / rename / delete venues
 */
export default function ManageVenuesModal({ userId, onClose, onUpdate }) {
    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    // Phone back gesture closes the sheet (mobile phase 0a). Mounted only while
    // open, so isOpen is constant; the hook pops our history entry on unmount
    // (an X-close never leaves a dead "back" behind).
    useModalHistory(true, onClose);
    // Tap outside closes; a drag that merely ends outside does not.
    const scrim = useScrimDismiss(onClose);

    useEffect(() => { loadVenues(); }, []);

    const loadVenues = async () => {
        try {
            const data = await getUserLocations(userId);
            setVenues(data);
        } catch (err) {
            console.warn('Failed to load venues:', err);
        }
        setLoading(false);
    };

    const handleRename = async (venueId) => {
        if (!editName.trim()) return;
        if (!requireOnlineNow(toast)) return;
        try {
            await renameLocation(userId, venueId, editName.trim());
            toast.success('Venue Renamed');
            setEditingId(null);
            setEditName('');
            await loadVenues();
            onUpdate?.();
        } catch (err) {
            toast.error('Failed To Rename: ' + (err.message || ''));
        }
    };

    const handleDelete = async (venueId) => {
        if (!requireOnlineNow(toast)) return;
        setDeletingId(venueId);
        try {
            // Unlink ledger entries first (non-critical)
            const { error: err_bankroll_ledger_nbcd5 } = await supabase
              .from('bankroll_ledger')
              .update({ location_id: null })
                .eq('user_id', userId)
                .eq('location_id', venueId);
            if (err_bankroll_ledger_nbcd5) console.warn('[Supabase] Silent mutation failed in bankroll_ledger:', err_bankroll_ledger_nbcd5.message);

            // Delete the location directly via Supabase
            const { error } = await supabase
                .from('bankroll_locations')
                .delete()
                .eq('id', venueId)
                .eq('user_id', userId);

            if (error) {
                console.warn('[ManageVenues] Delete error:', error);
                toast.error('Failed To Delete: ' + (error.message || 'Unknown Error'));
                return;
            }

            // Optimistic removal from local state
            setVenues(prev => prev.filter(v => v.id !== venueId));
            toast.success('Venue Deleted');
            setConfirmDeleteId(null);
            onUpdate?.();
        } catch (err) {
            console.warn('[ManageVenues] Delete exception:', err);
            toast.error('Failed To Delete: ' + (err.message || ''));
        } finally {
            setDeletingId(null);
        }
    };

    const startEdit = (venue) => {
        setEditingId(venue.id);
        setEditName(venue.name);
        setConfirmDeleteId(null);
    };

    return (
        <div className="bankroll-modal-overlay" style={s.overlay} {...scrim}>
            <div className="bankroll-modal" role="dialog" aria-modal="true" style={s.modal} onClick={(e) => e.stopPropagation()}>
                <div className="bankroll-sheet-handle" aria-hidden="true" />
                {/* Header */}
                <div className="bankroll-modal-header" style={s.header}>
                    <h2 style={s.title}>Manage Venues</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="bankroll-modal-close sp-icon-btn" style={s.closeBtn}>✕</button>
                </div>

                {/* Content */}
                <div className="bankroll-modal-body" style={s.content}>
                    {loading ? (
                        <p style={s.emptyText}>Loading...</p>
                    ) : venues.length === 0 ? (
                        <p style={s.emptyText}>No Venues Yet. Add One When Logging An Entry.</p>
                    ) : (
                        venues.map((venue) => (
                            <div key={venue.id} style={s.venueRow}>
                                {editingId === venue.id ? (
                                    /* Edit mode */
                                    <div style={s.editRow}>
                                        <input
                                            autoFocus
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleRename(venue.id)}
                                            style={s.editInput}
                                        />
                                        <button onClick={() => handleRename(venue.id)} style={s.saveBtn}>Save</button>
                                        <button onClick={() => setEditingId(null)} style={s.cancelBtn}>Cancel</button>
                                    </div>
                                ) : confirmDeleteId === venue.id ? (
                                    /* Confirm delete */
                                    <div style={s.editRow}>
                                        <span style={s.confirmText}>Delete "{venue.name}"? Entries Will Be Unlinked, Not Removed.</span>
                                        <button onClick={() => handleDelete(venue.id)} style={s.deleteBtnConfirm}>Delete</button>
                                        <button onClick={() => setConfirmDeleteId(null)} style={s.cancelBtn}>Cancel</button>
                                    </div>
                                ) : (
                                    /* View mode */
                                    <>
                                        <span style={s.venueName}>{venue.name}</span>
                                        <div style={s.actions}>
                                            <button onClick={() => startEdit(venue)} style={s.actionBtn} title="Rename">Edit</button>
                                            <button onClick={() => { setConfirmDeleteId(venue.id); setEditingId(null); }} style={s.actionBtn} title="Delete">Del</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

/* -- Styles -- */
const s = {
    overlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    },
    modal: {
        background: '#1a1d2e', borderRadius: 14, width: '100%', maxWidth: 480,
        maxHeight: '80dvh', display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)', boxSizing: 'border-box',
        border: '2px solid rgba(255,255,255,0.1)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    },
    header: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
    },
    title: { margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' },
    closeBtn: {
        background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer',
        width: 44, height: 44, minWidth: 44, minHeight: 44, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    },
    content: { padding: '12px 16px', overflowY: 'auto', flex: 1 },
    emptyText: { color: '#8a8d91', fontSize: 14, textAlign: 'center', padding: '40px 0' },
    venueRow: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 8px', borderBottom: '1px solid rgba(255,255,255,0.15)',
        minHeight: 48,
    },
    venueName: { color: '#fff', fontSize: 14, fontWeight: 500 },
    actions: { display: 'flex', gap: 4 },
    actionBtn: {
        background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
        padding: '6px 12px', cursor: 'pointer', fontSize: 14, color: '#fff',
        minHeight: 44, minWidth: 44, touchAction: 'manipulation',
    },
    editRow: {
        display: 'flex', gap: 8, alignItems: 'center', width: '100%', flexWrap: 'wrap',
    },
    editInput: {
        flex: 1, minWidth: 120, padding: '8px 12px', borderRadius: 8,
        border: '2px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.15)',
        color: '#fff', fontSize: 16, outline: 'none', minHeight: 44, boxSizing: 'border-box',
    },
    saveBtn: {
        minHeight: 44, touchAction: 'manipulation',
        padding: '8px 14px', borderRadius: 8, border: 'none',
        background: '#2374e1', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600,
    },
    cancelBtn: {
        minHeight: 44, touchAction: 'manipulation',
        padding: '8px 14px', borderRadius: 8, border: '2px solid rgba(255,255,255,0.1)',
        background: 'transparent', color: '#b0b3b8', fontSize: 14, cursor: 'pointer',
    },
    deleteBtnConfirm: {
        minHeight: 44, touchAction: 'manipulation',
        padding: '8px 14px', borderRadius: 8, border: 'none',
        background: '#d32f2f', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600,
    },
    confirmText: { color: '#ff6b6b', fontSize: 14, flex: 1 },
};
