/**
 * STAKING TRACKER COMPONENT
 * Manage backer relationships, makeup, and split calculations
 */

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Users, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';

export default function StakingTracker({ userId, displayEUR = false }) {
    const [arrangements, setArrangements] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingArrangement, setEditingArrangement] = useState(null);

    useEffect(() => {
        if (userId) {
            loadData();
        }
    }, [userId]);

    const loadData = async () => {
        setIsLoading(true);

        // Fetch arrangements
        const { data: arrangementData } = await supabase
            .from('staking_arrangements')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        setArrangements(arrangementData || []);

        // Fetch staking sessions
        const { data: sessionData } = await supabase
            .from('staking_sessions')
            .select('*, staking_arrangements(backer_name)')
            .order('created_at', { ascending: false });

        setSessions(sessionData || []);
        setIsLoading(false);
    };

    const activeArrangement = useMemo(() => {
        return arrangements.find(a => a.is_active);
    }, [arrangements]);

    const totalStats = useMemo(() => {
        let totalPlayerShare = 0;
        let totalBackerShare = 0;

        sessions.forEach(s => {
            totalPlayerShare += s.player_share || 0;
            totalBackerShare += s.backer_share || 0;
        });

        return {
            totalPlayerShare,
            totalBackerShare,
            sessionCount: sessions.length
        };
    }, [sessions]);

    const handleDelete = async (id) => {
        if (!confirm('Delete this staking arrangement?')) return;

        await supabase
            .from('staking_arrangements')
            .delete()
            .eq('id', id);

        loadData();
    };

    const handleEdit = (arrangement) => {
        setEditingArrangement(arrangement);
        setShowModal(true);
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.titleRow}>
                    <Users size={18} style={{ color: '#00D4FF' }} />
                    <h3 style={styles.title}>Staking Tracker</h3>
                </div>
                <button onClick={() => { setEditingArrangement(null); setShowModal(true); }} style={styles.addBtn}>
                    <Plus size={14} /> Add Backer
                </button>
            </div>

            {/* Active Arrangement */}
            {activeArrangement && (
                <div style={styles.activeCard}>
                    <div style={styles.activeHeader}>
                        <span style={styles.activeBadge}>● Active</span>
                        <span style={styles.activeBackerName}>{activeArrangement.backer_name}</span>
                    </div>
                    <div style={styles.activeDetails}>
                        <div style={styles.detailItem}>
                            <span style={styles.detailLabel}>Split</span>
                            <span style={styles.detailValue}>{activeArrangement.split_percentage}/{100 - activeArrangement.split_percentage}</span>
                        </div>
                        <div style={styles.detailItem}>
                            <span style={styles.detailLabel}>Makeup</span>
                            <span style={{
                                ...styles.detailValue,
                                color: activeArrangement.current_makeup > 0 ? '#ef4444' : '#22c55e'
                            }}>
                                {activeArrangement.current_makeup > 0 ? '-' : ''}{formatCurrency(Math.abs(activeArrangement.current_makeup), displayEUR)}
                            </span>
                        </div>
                        <div style={styles.detailItem}>
                            <span style={styles.detailLabel}>Since</span>
                            <span style={styles.detailValue}>
                                {new Date(activeArrangement.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                            </span>
                        </div>
                    </div>
                    <div style={styles.activeActions}>
                        <button onClick={() => handleEdit(activeArrangement)} style={styles.editBtn}>
                            <Edit2 size={12} /> Edit
                        </button>
                        <button onClick={() => handleDelete(activeArrangement.id)} style={styles.deleteBtn}>
                            <Trash2 size={12} />
                        </button>
                    </div>
                </div>
            )}

            {/* Stats Summary */}
            <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                    <div style={styles.statIcon}><DollarSign size={14} /></div>
                    <div>
                        <div style={styles.statLabel}>Your Share</div>
                        <div style={{ ...styles.statValue, color: totalStats.totalPlayerShare >= 0 ? '#22c55e' : '#ef4444' }}>
                            {formatCurrency(totalStats.totalPlayerShare, displayEUR)}
                        </div>
                    </div>
                </div>
                <div style={styles.statCard}>
                    <div style={styles.statIcon}><Users size={14} /></div>
                    <div>
                        <div style={styles.statLabel}>Backer's Share</div>
                        <div style={styles.statValue}>
                            {formatCurrency(totalStats.totalBackerShare, displayEUR)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Past Arrangements */}
            {arrangements.filter(a => !a.is_active).length > 0 && (
                <div style={styles.pastSection}>
                    <h4 style={styles.sectionTitle}>Past Arrangements</h4>
                    {arrangements.filter(a => !a.is_active).map(arr => (
                        <div key={arr.id} style={styles.pastCard}>
                            <div style={styles.pastInfo}>
                                <span style={styles.pastName}>{arr.backer_name}</span>
                                <span style={styles.pastDates}>
                                    {new Date(arr.start_date).toLocaleDateString()} - {arr.end_date ? new Date(arr.end_date).toLocaleDateString() : 'Ongoing'}
                                </span>
                            </div>
                            <span style={styles.pastSplit}>{arr.split_percentage}/{100 - arr.split_percentage}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Empty State */}
            {!isLoading && arrangements.length === 0 && (
                <div style={styles.emptyState}>
                    <Users size={32} style={{ color: 'rgba(255,255,255,0.2)' }} />
                    <p>No staking arrangements yet</p>
                    <button onClick={() => setShowModal(true)} style={styles.emptyBtn}>
                        Add Your First Backer
                    </button>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <StakingModal
                    arrangement={editingArrangement}
                    userId={userId}
                    onClose={() => setShowModal(false)}
                    onSave={() => { setShowModal(false); loadData(); }}
                />
            )}
        </div>
    );
}

function StakingModal({ arrangement, userId, onClose, onSave }) {
    const [form, setForm] = useState({
        backer_name: arrangement?.backer_name || '',
        backer_email: arrangement?.backer_email || '',
        split_percentage: arrangement?.split_percentage || 50,
        markup_percentage: arrangement?.markup_percentage || 0,
        starting_makeup: arrangement?.starting_makeup || 0,
        current_makeup: arrangement?.current_makeup || 0,
        start_date: arrangement?.start_date || new Date().toISOString().split('T')[0],
        notes: arrangement?.notes || '',
        is_active: arrangement?.is_active ?? true,
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);

        try {
            if (arrangement?.id) {
                await supabase
                    .from('staking_arrangements')
                    .update({ ...form, updated_at: new Date().toISOString() })
                    .eq('id', arrangement.id);
            } else {
                await supabase
                    .from('staking_arrangements')
                    .insert({ ...form, user_id: userId });
            }
            onSave();
        } catch (err) {
            console.error('Save error:', err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={modalStyles.overlay} onClick={onClose}>
            <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
                <h3 style={modalStyles.title}>{arrangement ? 'Edit' : 'Add'} Staking Arrangement</h3>

                <form onSubmit={handleSubmit}>
                    <div style={modalStyles.field}>
                        <label style={modalStyles.label}>Backer Name *</label>
                        <input
                            type="text"
                            value={form.backer_name}
                            onChange={e => setForm({ ...form, backer_name: e.target.value })}
                            style={modalStyles.input}
                            required
                        />
                    </div>

                    <div style={modalStyles.row}>
                        <div style={modalStyles.field}>
                            <label style={modalStyles.label}>Your Split %</label>
                            <input
                                type="number"
                                value={form.split_percentage}
                                onChange={e => setForm({ ...form, split_percentage: Number(e.target.value) })}
                                style={modalStyles.input}
                                min={0}
                                max={100}
                            />
                        </div>
                        <div style={modalStyles.field}>
                            <label style={modalStyles.label}>Markup %</label>
                            <input
                                type="number"
                                value={form.markup_percentage}
                                onChange={e => setForm({ ...form, markup_percentage: Number(e.target.value) })}
                                style={modalStyles.input}
                                min={0}
                            />
                        </div>
                    </div>

                    <div style={modalStyles.row}>
                        <div style={modalStyles.field}>
                            <label style={modalStyles.label}>Starting Makeup</label>
                            <input
                                type="number"
                                value={form.starting_makeup}
                                onChange={e => setForm({ ...form, starting_makeup: Number(e.target.value), current_makeup: Number(e.target.value) })}
                                style={modalStyles.input}
                            />
                        </div>
                        <div style={modalStyles.field}>
                            <label style={modalStyles.label}>Start Date</label>
                            <input
                                type="date"
                                value={form.start_date}
                                onChange={e => setForm({ ...form, start_date: e.target.value })}
                                style={modalStyles.input}
                            />
                        </div>
                    </div>

                    <div style={modalStyles.field}>
                        <label style={modalStyles.label}>Notes</label>
                        <textarea
                            value={form.notes}
                            onChange={e => setForm({ ...form, notes: e.target.value })}
                            style={{ ...modalStyles.input, minHeight: 60 }}
                        />
                    </div>

                    <div style={modalStyles.actions}>
                        <button type="button" onClick={onClose} style={modalStyles.cancelBtn}>Cancel</button>
                        <button type="submit" disabled={isSaving} style={modalStyles.saveBtn}>
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
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
        marginBottom: 16,
    },
    titleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontSize: 15,
        fontWeight: 600,
        color: '#fff',
        margin: 0,
    },
    addBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        background: 'rgba(0,212,255,0.1)',
        border: '1px solid rgba(0,212,255,0.3)',
        borderRadius: 6,
        color: '#00D4FF',
        fontSize: 11,
        cursor: 'pointer',
    },
    activeCard: {
        background: 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(0,100,150,0.05))',
        border: '1px solid rgba(0,212,255,0.2)',
        borderRadius: 10,
        padding: 14,
        marginBottom: 12,
    },
    activeHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    activeBadge: {
        color: '#22c55e',
        fontSize: 10,
    },
    activeBackerName: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
    },
    activeDetails: {
        display: 'flex',
        gap: 16,
        marginBottom: 10,
    },
    detailItem: {
        display: 'flex',
        flexDirection: 'column',
    },
    detailLabel: {
        fontSize: 9,
        color: 'rgba(255,255,255,0.5)',
    },
    detailValue: {
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
    },
    activeActions: {
        display: 'flex',
        gap: 8,
    },
    editBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        color: 'rgba(255,255,255,0.7)',
        fontSize: 10,
        cursor: 'pointer',
    },
    deleteBtn: {
        padding: '4px 8px',
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 4,
        color: '#ef4444',
        cursor: 'pointer',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
        marginBottom: 16,
    },
    statCard: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
    },
    statIcon: {
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,212,255,0.1)',
        borderRadius: 6,
        color: '#00D4FF',
    },
    statLabel: {
        fontSize: 9,
        color: 'rgba(255,255,255,0.5)',
    },
    statValue: {
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
    },
    pastSection: {
        marginTop: 12,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    pastCard: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 10,
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 6,
        marginBottom: 6,
    },
    pastInfo: {
        display: 'flex',
        flexDirection: 'column',
    },
    pastName: {
        fontSize: 12,
        color: '#fff',
    },
    pastDates: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
    },
    pastSplit: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.6)',
    },
    emptyState: {
        textAlign: 'center',
        padding: 24,
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
    },
    emptyBtn: {
        marginTop: 12,
        padding: '8px 16px',
        background: 'rgba(0,212,255,0.1)',
        border: '1px solid rgba(0,212,255,0.3)',
        borderRadius: 6,
        color: '#00D4FF',
        fontSize: 12,
        cursor: 'pointer',
    },
};

const modalStyles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
    },
    modal: {
        width: '100%',
        maxWidth: 400,
        background: '#1a1a2e',
        borderRadius: 12,
        padding: 20,
        border: '1px solid rgba(255,255,255,0.1)',
    },
    title: {
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 16,
    },
    field: {
        marginBottom: 12,
    },
    row: {
        display: 'flex',
        gap: 12,
        marginBottom: 12,
    },
    label: {
        display: 'block',
        fontSize: 10,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 4,
    },
    input: {
        width: '100%',
        padding: '8px 10px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        color: '#fff',
        fontSize: 13,
    },
    actions: {
        display: 'flex',
        gap: 10,
        marginTop: 16,
    },
    cancelBtn: {
        flex: 1,
        padding: '10px 0',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: 'rgba(255,255,255,0.7)',
        cursor: 'pointer',
    },
    saveBtn: {
        flex: 1,
        padding: '10px 0',
        background: 'linear-gradient(135deg, #00D4FF, #00A3CC)',
        border: 'none',
        borderRadius: 8,
        color: '#000',
        fontWeight: 600,
        cursor: 'pointer',
    },
};
