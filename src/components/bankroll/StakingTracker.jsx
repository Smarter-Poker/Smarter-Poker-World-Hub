/**
 * STAKING TRACKER
 * Futuristic Metal UI - Manage backer arrangements and staking sessions
 */

import { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, DollarSign, TrendingUp, Calendar, X, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { METAL, GRADIENTS, GLOWS, ANIMATIONS } from './metalStyles';

export default function StakingTracker({ userId }) {
    const [arrangements, setArrangements] = useState([]);
    const [activeArrangement, setActiveArrangement] = useState(null);
    const [stats, setStats] = useState({ yourShare: 0, backerShare: 0, makeup: 0 });
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingArrangement, setEditingArrangement] = useState(null);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        backer_name: '',
        split_player: 50,
        split_backer: 50,
        makeup_start: 0,
        start_date: new Date().toISOString().split('T')[0],
        notes: '',
    });

    useEffect(() => {
        if (userId) loadData();
    }, [userId]);

    const loadData = async () => {
        setLoading(true);

        const { data: arr } = await supabase
            .from('staking_arrangements')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        setArrangements(arr || []);

        // Find active arrangement
        const active = arr?.find(a => a.is_active);
        setActiveArrangement(active || null);

        // Calculate stats from staking sessions
        if (active) {
            const { data: sessions } = await supabase
                .from('staking_sessions')
                .select('your_share, backer_share, makeup_change')
                .eq('arrangement_id', active.id);

            if (sessions) {
                const yourShare = sessions.reduce((sum, s) => sum + (s.your_share || 0), 0);
                const backerShare = sessions.reduce((sum, s) => sum + (s.backer_share || 0), 0);
                const makeupChange = sessions.reduce((sum, s) => sum + (s.makeup_change || 0), 0);
                setStats({
                    yourShare,
                    backerShare,
                    makeup: (active.makeup_start || 0) + makeupChange
                });
            }
        }

        setLoading(false);
    };

    const handleAddNew = () => {
        setEditingArrangement(null);
        setForm({
            backer_name: '',
            split_player: 50,
            split_backer: 50,
            makeup_start: 0,
            start_date: new Date().toISOString().split('T')[0],
            notes: '',
        });
        setShowModal(true);
    };

    const handleEdit = (arr) => {
        setEditingArrangement(arr);
        setForm({
            backer_name: arr.backer_name || '',
            split_player: arr.split_player || 50,
            split_backer: arr.split_backer || 50,
            makeup_start: arr.makeup_start || 0,
            start_date: arr.start_date || new Date().toISOString().split('T')[0],
            notes: arr.notes || '',
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        setSaving(true);

        const data = {
            user_id: userId,
            backer_name: form.backer_name,
            split_player: parseInt(form.split_player),
            split_backer: parseInt(form.split_backer),
            makeup_start: parseFloat(form.makeup_start) || 0,
            start_date: form.start_date,
            notes: form.notes,
            is_active: true,
        };

        // Deactivate other arrangements
        await supabase
            .from('staking_arrangements')
            .update({ is_active: false })
            .eq('user_id', userId);

        if (editingArrangement) {
            await supabase
                .from('staking_arrangements')
                .update(data)
                .eq('id', editingArrangement.id);
        } else {
            await supabase
                .from('staking_arrangements')
                .insert(data);
        }

        setSaving(false);
        setShowModal(false);
        loadData();
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this arrangement?')) return;
        await supabase.from('staking_arrangements').delete().eq('id', id);
        loadData();
    };

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: METAL.cyan }} />
                <span>LOADING STAKING DATA...</span>
                <style jsx global>{ANIMATIONS}</style>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* LED Strip */}
            <div style={styles.ledStrip} />

            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerTitle}>
                    <Users size={16} style={{ color: METAL.cyan }} />
                    <span>STAKING TRACKER</span>
                </div>
                <button onClick={handleAddNew} style={styles.addBtn}>
                    <Plus size={12} />
                    ADD BACKER
                </button>
            </div>

            {/* Active Arrangement */}
            {activeArrangement ? (
                <div style={styles.activeSection}>
                    <div style={styles.activeBadge}>
                        <Users size={10} />
                        ACTIVE
                    </div>
                    <div style={styles.activeCard}>
                        <div style={styles.backerName}>{activeArrangement.backer_name}</div>
                        <div style={styles.splitDisplay}>
                            <span style={styles.splitPlayer}>{activeArrangement.split_player}%</span>
                            <span style={styles.splitDivider}>/</span>
                            <span style={styles.splitBacker}>{activeArrangement.split_backer}%</span>
                        </div>
                        <div style={styles.activeActions}>
                            <button onClick={() => handleEdit(activeArrangement)} style={styles.editBtn}>
                                <Edit2 size={12} /> EDIT
                            </button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div style={styles.statsGrid}>
                        <div style={styles.statBox}>
                            <span style={{ ...styles.statValue, color: METAL.success }}>
                                ${stats.yourShare.toLocaleString()}
                            </span>
                            <span style={styles.statLabel}>YOUR SHARE</span>
                        </div>
                        <div style={styles.statBox}>
                            <span style={{ ...styles.statValue, color: METAL.cyan }}>
                                ${stats.backerShare.toLocaleString()}
                            </span>
                            <span style={styles.statLabel}>BACKER SHARE</span>
                        </div>
                        <div style={styles.statBox}>
                            <span style={{
                                ...styles.statValue,
                                color: stats.makeup > 0 ? METAL.danger : METAL.success
                            }}>
                                ${Math.abs(stats.makeup).toLocaleString()}
                            </span>
                            <span style={styles.statLabel}>
                                {stats.makeup > 0 ? 'IN MAKEUP' : 'CLEAR'}
                            </span>
                        </div>
                    </div>
                </div>
            ) : (
                <div style={styles.emptyState}>
                    <div style={styles.emptyIconContainer}>
                        <Users size={28} style={{ color: METAL.cyan }} />
                    </div>
                    <p style={styles.emptyTitle}>NO ACTIVE STAKING ARRANGEMENT</p>
                    <p style={styles.emptyHint}>Track backer relationships & profit splits</p>
                    <button onClick={handleAddNew} style={styles.emptyAddBtn}>
                        <Plus size={14} /> ADD BACKER
                    </button>
                </div>
            )}

            {/* Past Arrangements */}
            {arrangements.filter(a => !a.is_active).length > 0 && (
                <div style={styles.pastSection}>
                    <div style={styles.sectionHeader}>PAST ARRANGEMENTS</div>
                    {arrangements.filter(a => !a.is_active).map(arr => (
                        <div key={arr.id} style={styles.pastCard}>
                            <div>
                                <span style={styles.pastName}>{arr.backer_name}</span>
                                <span style={styles.pastSplit}>
                                    {arr.split_player}% / {arr.split_backer}%
                                </span>
                            </div>
                            <div style={styles.pastActions}>
                                <button onClick={() => handleEdit(arr)} style={styles.iconBtn}>
                                    <Edit2 size={12} />
                                </button>
                                <button onClick={() => handleDelete(arr.id)} style={{ ...styles.iconBtn, color: METAL.danger }}>
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div style={styles.modal} onClick={e => e.stopPropagation()}>
                        <div style={styles.modalLed} />
                        <h3 style={styles.modalTitle}>
                            {editingArrangement ? 'EDIT ARRANGEMENT' : 'NEW ARRANGEMENT'}
                        </h3>

                        <div style={styles.formGroup}>
                            <label style={styles.formLabel}>BACKER NAME</label>
                            <input
                                value={form.backer_name}
                                onChange={e => setForm({ ...form, backer_name: e.target.value })}
                                placeholder="Enter backer name..."
                                style={styles.formInput}
                            />
                        </div>

                        <div style={styles.formRow}>
                            <div style={styles.formGroup}>
                                <label style={styles.formLabel}>YOUR SPLIT %</label>
                                <input
                                    type="number"
                                    value={form.split_player}
                                    onChange={e => setForm({
                                        ...form,
                                        split_player: e.target.value,
                                        split_backer: 100 - parseInt(e.target.value || 0)
                                    })}
                                    style={styles.formInput}
                                />
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.formLabel}>BACKER SPLIT %</label>
                                <input
                                    type="number"
                                    value={form.split_backer}
                                    onChange={e => setForm({
                                        ...form,
                                        split_backer: e.target.value,
                                        split_player: 100 - parseInt(e.target.value || 0)
                                    })}
                                    style={styles.formInput}
                                />
                            </div>
                        </div>

                        <div style={styles.formRow}>
                            <div style={styles.formGroup}>
                                <label style={styles.formLabel}>STARTING MAKEUP</label>
                                <input
                                    type="number"
                                    value={form.makeup_start}
                                    onChange={e => setForm({ ...form, makeup_start: e.target.value })}
                                    placeholder="0"
                                    style={styles.formInput}
                                />
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.formLabel}>START DATE</label>
                                <input
                                    type="date"
                                    value={form.start_date}
                                    onChange={e => setForm({ ...form, start_date: e.target.value })}
                                    style={styles.formInput}
                                />
                            </div>
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.formLabel}>NOTES</label>
                            <textarea
                                value={form.notes}
                                onChange={e => setForm({ ...form, notes: e.target.value })}
                                placeholder="Optional notes..."
                                rows={2}
                                style={{ ...styles.formInput, resize: 'none' }}
                            />
                        </div>

                        <div style={styles.modalActions}>
                            <button onClick={() => setShowModal(false)} style={styles.cancelBtn}>
                                CANCEL
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !form.backer_name}
                                style={{
                                    ...styles.saveBtn,
                                    opacity: (saving || !form.backer_name) ? 0.5 : 1
                                }}
                            >
                                {saving ? (
                                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> SAVING...</>
                                ) : (
                                    <><Check size={14} /> SAVE</>
                                )}
                            </button>
                        </div>
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
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: 48,
        background: GRADIENTS.darkPanel,
        border: `1px solid ${METAL.mid}`,
        borderRadius: 12,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.15em',
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
    addBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        background: METAL.cyanDim,
        border: `1px solid ${METAL.cyan}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: METAL.cyan,
        cursor: 'pointer',
    },
    activeSection: {
        padding: 16,
    },
    activeBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        background: 'rgba(34,197,94,0.15)',
        border: `1px solid ${METAL.success}`,
        borderRadius: 4,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.15em',
        color: METAL.success,
        marginBottom: 12,
    },
    activeCard: {
        padding: 16,
        background: 'rgba(0,0,0,0.3)',
        border: `2px solid ${METAL.cyan}`,
        borderRadius: 10,
        textAlign: 'center',
        marginBottom: 16,
    },
    backerName: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
    },
    splitDisplay: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 24,
        fontWeight: 700,
        marginBottom: 12,
    },
    splitPlayer: {
        color: METAL.success,
    },
    splitDivider: {
        color: 'rgba(255,255,255,0.3)',
        margin: '0 6px',
    },
    splitBacker: {
        color: METAL.cyan,
    },
    activeActions: {
        display: 'flex',
        justifyContent: 'center',
        gap: 8,
    },
    editBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.mid}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.1em',
        color: 'rgba(255,255,255,0.7)',
        cursor: 'pointer',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
    },
    statBox: {
        padding: 12,
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 8,
        textAlign: 'center',
    },
    statValue: {
        display: 'block',
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 16,
        fontWeight: 700,
    },
    statLabel: {
        display: 'block',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 9,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: '0.1em',
        marginTop: 4,
    },
    emptyState: {
        padding: 48,
        textAlign: 'center',
    },
    emptyIconContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 56,
        height: 56,
        margin: '0 auto 16px',
        background: METAL.cyanDim,
        border: `1px dashed ${METAL.cyan}`,
        borderRadius: '50%',
        animation: 'float 3s ease-in-out infinite',
    },
    emptyTitle: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 13,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        margin: '0 0 6px',
    },
    emptyHint: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        color: 'rgba(255,255,255,0.35)',
        margin: 0,
    },
    emptyAddBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 20,
        padding: '12px 24px',
        background: GRADIENTS.cyanAction,
        border: 'none',
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: '#000',
        cursor: 'pointer',
        boxShadow: GLOWS.cyanSubtle,
        transition: 'transform 0.2s, box-shadow 0.2s',
    },
    pastSection: {
        padding: 16,
        borderTop: `1px solid ${METAL.mid}`,
    },
    sectionHeader: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: '0.15em',
        marginBottom: 12,
    },
    pastCard: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 8,
        marginBottom: 8,
    },
    pastName: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
        marginRight: 8,
    },
    pastSplit: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
    },
    pastActions: {
        display: 'flex',
        gap: 6,
    },
    iconBtn: {
        padding: 6,
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 4,
        color: 'rgba(255,255,255,0.5)',
        cursor: 'pointer',
    },
    modalOverlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
    },
    modal: {
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        background: `linear-gradient(180deg, #1a2a3a 0%, ${METAL.base} 100%)`,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 16,
        padding: 24,
    },
    modalLed: {
        position: 'absolute',
        top: 0,
        left: '20%',
        right: '20%',
        height: 2,
        background: METAL.cyan,
        boxShadow: GLOWS.cyanSubtle,
    },
    modalTitle: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.15em',
        color: '#fff',
        marginBottom: 20,
        textAlign: 'center',
    },
    formGroup: {
        marginBottom: 14,
    },
    formLabel: {
        display: 'block',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.15em',
        marginBottom: 6,
    },
    formInput: {
        width: '100%',
        padding: '12px 14px',
        background: METAL.darkest,
        border: `1px solid ${METAL.mid}`,
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: '#fff',
        boxSizing: 'border-box',
    },
    formRow: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
    },
    modalActions: {
        display: 'flex',
        gap: 12,
        marginTop: 20,
    },
    cancelBtn: {
        flex: 1,
        padding: 14,
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.mid}`,
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
    saveBtn: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: 14,
        background: GRADIENTS.cyanAction,
        border: 'none',
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        fontWeight: 700,
        color: '#000',
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
};
