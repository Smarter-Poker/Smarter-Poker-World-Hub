/**
 * COMPLETED EVENTS LIST
 * ═══════════════════════════════════════════════════════════════
 * Renders the completed gig cards with edit/delete/view report actions.
 * Extracted from TokeTracker.jsx for maintainability.
 * ═══════════════════════════════════════════════════════════════
 */

import React, { memo, useState } from 'react';
import { motion } from 'framer-motion';

const formatCurrency = (amount) =>
    `$${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CompletedEventsList({
    completedGigs,
    isLoading,
    loadError,
    onViewReport,
    onSaveEdit,
    onDeleteGig,
    styles,
}) {
    const [editingCompletedGig, setEditingCompletedGig] = useState(null);
    const [completedEditForm, setCompletedEditForm] = useState({ venue_name: '', hourly_rate: '', notes: '' });

    const handleEditClick = (e, gig) => {
        e.stopPropagation();
        setEditingCompletedGig(gig.id);
        setCompletedEditForm({
            venue_name: gig.venue_name || '',
            hourly_rate: gig.hourly_rate || '',
            notes: gig.notes || '',
        });
    };

    const handleSave = async (gigId) => {
        try {
            await onSaveEdit(gigId, completedEditForm);
            setEditingCompletedGig(null);
        } catch (err) {
            // Keep form open on failure — parent shows toast
        }
    };

    return (
        <div style={styles.historySection}>
            <h3 style={styles.historyTitle}>Completed Events</h3>
            {isLoading ? (
                <div style={styles.loadingPlaceholder}>Loading Events...</div>
            ) : loadError ? (
                <div style={{ ...styles.emptyState, color: '#ef4444' }}>Error: {loadError}</div>
            ) : completedGigs.length === 0 ? (
                <div style={styles.emptyState}>No Completed Events Yet. Start Your First Event Above!</div>
            ) : (
                <div style={styles.gigGrid}>
                    {completedGigs.map(gig => (
                        <motion.div
                            key={gig.id}
                            whileHover={{ scale: 1.02 }}
                            style={styles.gigCard}
                        >
                            {editingCompletedGig === gig.id ? (
                                <div style={{ padding: '12px 14px' }}>
                                    <input
                                        type="text"
                                        value={completedEditForm.venue_name}
                                        onChange={e => setCompletedEditForm(f => ({ ...f, venue_name: e.target.value }))}
                                        placeholder="Venue Name"
                                        style={styles.editInlineInput}
                                        autoFocus
                                    />
                                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                        <input
                                            type="number"
                                            value={completedEditForm.hourly_rate}
                                            onChange={e => setCompletedEditForm(f => ({ ...f, hourly_rate: e.target.value }))}
                                            placeholder="Hourly Rate"
                                            style={{ ...styles.editInlineInput, flex: 1 }}
                                        />
                                        <input
                                            type="text"
                                            value={completedEditForm.notes}
                                            onChange={e => setCompletedEditForm(f => ({ ...f, notes: e.target.value }))}
                                            placeholder="Notes"
                                            style={{ ...styles.editInlineInput, flex: 2 }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                        <button onClick={() => handleSave(gig.id)} style={styles.eventSaveBtn}>Save</button>
                                        <button onClick={() => setEditingCompletedGig(null)} style={styles.eventCancelBtn}>Cancel</button>
                                        <button onClick={(e) => { e.stopPropagation(); onDeleteGig(e, gig.id); }} style={{ ...styles.eventDeleteBtn, padding: '10px 14px', flex: 0 }} title="Delete Event">🗑️</button>
                                    </div>
                                </div>
                            ) : (
                                <div onClick={() => onViewReport(gig.id)} style={{ cursor: 'pointer' }}>
                                    <div style={styles.gigCardHeader}>
                                        <h4 style={styles.gigCardName}>{gig.venue_name}</h4>
                                        <span style={{ ...styles.gigCardTokes, color: '#38bdf8' }}>
                                            {formatCurrency(gig.totalTokes || 0)}
                                        </span>
                                    </div>
                                    <div style={styles.gigCardMeta}>
                                        <span>{new Date(gig.start_date + 'T12:00:00').toLocaleDateString()}</span>
                                        {gig.end_date && <span> — {new Date(gig.end_date + 'T12:00:00').toLocaleDateString()}</span>}
                                    </div>
                                    <div style={styles.gigCardFooter}>
                                        <span>{gig.totalDowns || 0} downs · {(gig.totalHoursWorked || 0).toFixed(1)}h</span>
                                        <span style={styles.viewReportLink}>View Report →</span>
                                    </div>
                                </div>
                            )}
                            {editingCompletedGig !== gig.id && (
                                <div style={styles.eventActionRow}>
                                    <button onClick={(e) => handleEditClick(e, gig)} style={styles.eventEditBtn} title="Edit Settings">✏️ Edit</button>
                                </div>
                            )}
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default memo(CompletedEventsList);
