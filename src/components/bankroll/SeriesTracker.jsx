/**
 * SERIES TRACKER
 * Futuristic Metal UI - Track tournament series ROI
 */

import { useState, useEffect } from 'react';
import { Trophy, Plus, Edit2, Trash2, Calendar, MapPin, Target, TrendingUp, Loader2, X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { METAL, GRADIENTS, GLOWS, ANIMATIONS } from './metalStyles';

export default function SeriesTracker({ userId }) {
    const [series, setSeries] = useState([]);
    const [stats, setStats] = useState({ totalEvents: 0, netResult: 0, roi: 0 });
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingSeries, setEditingSeries] = useState(null);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        name: '',
        type: 'wsop',
        location: '',
        start_date: '',
        end_date: '',
        planned_budget: 0,
    });

    const SERIES_TYPES = {
        wsop: { label: 'WSOP', icon: '🏆' },
        wpt: { label: 'WPT', icon: '🎯' },
        mspt: { label: 'MSPT', icon: '♠️' },
        other: { label: 'OTHER', icon: '🎰' },
    };

    useEffect(() => {
        if (userId) loadData();
    }, [userId]);

    const loadData = async () => {
        setLoading(true);

        const { data } = await supabase
            .from('tournament_series')
            .select('*, bankroll_ledger(result)')
            .eq('user_id', userId)
            .order('start_date', { ascending: false });

        // Calculate stats for each series
        const enriched = (data || []).map(s => {
            const results = s.bankroll_ledger || [];
            const net = results.reduce((sum, r) => sum + (r.result || 0), 0);
            const events = results.length;
            const roi = s.planned_budget > 0 ? ((net / s.planned_budget) * 100).toFixed(1) : 0;
            return { ...s, net, events, roi };
        });

        setSeries(enriched);

        // Overall stats
        const totalEvents = enriched.reduce((sum, s) => sum + s.events, 0);
        const netResult = enriched.reduce((sum, s) => sum + s.net, 0);
        const totalBudget = enriched.reduce((sum, s) => sum + (s.planned_budget || 0), 0);
        const overallRoi = totalBudget > 0 ? ((netResult / totalBudget) * 100).toFixed(1) : 0;

        setStats({ totalEvents, netResult, roi: overallRoi });
        setLoading(false);
    };

    const handleAddNew = () => {
        setEditingSeries(null);
        setForm({
            name: '',
            type: 'wsop',
            location: '',
            start_date: '',
            end_date: '',
            planned_budget: 0,
        });
        setShowModal(true);
    };

    const handleEdit = (s) => {
        setEditingSeries(s);
        setForm({
            name: s.name || '',
            type: s.type || 'wsop',
            location: s.location || '',
            start_date: s.start_date || '',
            end_date: s.end_date || '',
            planned_budget: s.planned_budget || 0,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        setSaving(true);

        const data = {
            user_id: userId,
            name: form.name,
            type: form.type,
            location: form.location,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            planned_budget: parseFloat(form.planned_budget) || 0,
        };

        if (editingSeries) {
            await supabase.from('tournament_series').update(data).eq('id', editingSeries.id);
        } else {
            await supabase.from('tournament_series').insert(data);
        }

        setSaving(false);
        setShowModal(false);
        loadData();
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this series?')) return;
        await supabase.from('tournament_series').delete().eq('id', id);
        loadData();
    };

    // Is series currently active?
    const isActive = (s) => {
        const now = new Date();
        const start = s.start_date ? new Date(s.start_date) : null;
        const end = s.end_date ? new Date(s.end_date) : null;
        return start && end && now >= start && now <= end;
    };

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: METAL.cyan }} />
                <span>LOADING SERIES DATA...</span>
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
                    <Trophy size={16} style={{ color: METAL.gold }} />
                    <span>SERIES TRACKER</span>
                </div>
                <button onClick={handleAddNew} style={styles.addBtn}>
                    <Plus size={12} />
                    ADD SERIES
                </button>
            </div>

            {/* Overall Stats */}
            <div style={styles.statsSection}>
                <div style={styles.statsGrid}>
                    <div style={styles.statBox}>
                        <span style={styles.statValue}>{stats.totalEvents}</span>
                        <span style={styles.statLabel}>EVENTS</span>
                    </div>
                    <div style={styles.statBox}>
                        <span style={{
                            ...styles.statValue,
                            color: stats.netResult >= 0 ? METAL.success : METAL.danger
                        }}>
                            ${Math.abs(stats.netResult).toLocaleString()}
                        </span>
                        <span style={styles.statLabel}>NET RESULT</span>
                    </div>
                    <div style={styles.statBox}>
                        <span style={{
                            ...styles.statValue,
                            color: parseFloat(stats.roi) >= 0 ? METAL.success : METAL.danger
                        }}>
                            {stats.roi}%
                        </span>
                        <span style={styles.statLabel}>ROI</span>
                    </div>
                </div>
            </div>

            {/* Series List */}
            <div style={styles.seriesList}>
                {series.length === 0 ? (
                    <div style={styles.emptyState}>
                        <Trophy size={32} style={{ color: 'rgba(255,255,255,0.2)' }} />
                        <p>NO SERIES TRACKED</p>
                        <button onClick={handleAddNew} style={styles.emptyAddBtn}>
                            <Plus size={14} /> ADD SERIES
                        </button>
                    </div>
                ) : (
                    series.map(s => (
                        <div key={s.id} style={{
                            ...styles.seriesCard,
                            ...(isActive(s) ? styles.seriesCardActive : {}),
                        }}>
                            {isActive(s) && (
                                <div style={styles.liveBadge}>
                                    <span style={styles.liveDot} /> LIVE
                                </div>
                            )}
                            <div style={styles.seriesHeader}>
                                <span style={styles.seriesType}>
                                    {SERIES_TYPES[s.type]?.icon} {SERIES_TYPES[s.type]?.label}
                                </span>
                                <div style={styles.seriesActions}>
                                    <button onClick={() => handleEdit(s)} style={styles.iconBtn}>
                                        <Edit2 size={12} />
                                    </button>
                                    <button onClick={() => handleDelete(s.id)} style={{ ...styles.iconBtn, color: METAL.danger }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                            <div style={styles.seriesName}>{s.name}</div>
                            <div style={styles.seriesInfo}>
                                {s.location && (
                                    <span><MapPin size={10} /> {s.location}</span>
                                )}
                                {s.start_date && (
                                    <span><Calendar size={10} /> {new Date(s.start_date).toLocaleDateString()}</span>
                                )}
                            </div>
                            <div style={styles.seriesStats}>
                                <div style={styles.seriesStatItem}>
                                    <span style={styles.seriesStatValue}>{s.events}</span>
                                    <span style={styles.seriesStatLabel}>EVENTS</span>
                                </div>
                                <div style={styles.seriesStatItem}>
                                    <span style={{
                                        ...styles.seriesStatValue,
                                        color: s.net >= 0 ? METAL.success : METAL.danger
                                    }}>
                                        ${Math.abs(s.net).toLocaleString()}
                                    </span>
                                    <span style={styles.seriesStatLabel}>NET</span>
                                </div>
                                <div style={styles.seriesStatItem}>
                                    <span style={{
                                        ...styles.seriesStatValue,
                                        color: parseFloat(s.roi) >= 0 ? METAL.success : METAL.danger
                                    }}>
                                        {s.roi}%
                                    </span>
                                    <span style={styles.seriesStatLabel}>ROI</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div style={styles.modal} onClick={e => e.stopPropagation()}>
                        <div style={styles.modalLed} />
                        <h3 style={styles.modalTitle}>
                            {editingSeries ? 'EDIT SERIES' : 'NEW SERIES'}
                        </h3>

                        <div style={styles.formGroup}>
                            <label style={styles.formLabel}>SERIES NAME</label>
                            <input
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                placeholder="e.g. WSOP 2026"
                                style={styles.formInput}
                            />
                        </div>

                        <div style={styles.formRow}>
                            <div style={styles.formGroup}>
                                <label style={styles.formLabel}>TYPE</label>
                                <select
                                    value={form.type}
                                    onChange={e => setForm({ ...form, type: e.target.value })}
                                    style={styles.formInput}
                                >
                                    {Object.entries(SERIES_TYPES).map(([key, val]) => (
                                        <option key={key} value={key}>{val.icon} {val.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.formLabel}>LOCATION</label>
                                <input
                                    value={form.location}
                                    onChange={e => setForm({ ...form, location: e.target.value })}
                                    placeholder="Las Vegas"
                                    style={styles.formInput}
                                />
                            </div>
                        </div>

                        <div style={styles.formRow}>
                            <div style={styles.formGroup}>
                                <label style={styles.formLabel}>START DATE</label>
                                <input
                                    type="date"
                                    value={form.start_date}
                                    onChange={e => setForm({ ...form, start_date: e.target.value })}
                                    style={styles.formInput}
                                />
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.formLabel}>END DATE</label>
                                <input
                                    type="date"
                                    value={form.end_date}
                                    onChange={e => setForm({ ...form, end_date: e.target.value })}
                                    style={styles.formInput}
                                />
                            </div>
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.formLabel}>PLANNED BUDGET ($)</label>
                            <input
                                type="number"
                                value={form.planned_budget}
                                onChange={e => setForm({ ...form, planned_budget: e.target.value })}
                                placeholder="10000"
                                style={styles.formInput}
                            />
                        </div>

                        <div style={styles.modalActions}>
                            <button onClick={() => setShowModal(false)} style={styles.cancelBtn}>
                                CANCEL
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !form.name}
                                style={{
                                    ...styles.saveBtn,
                                    opacity: (saving || !form.name) ? 0.5 : 1
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
        background: METAL.gold,
        boxShadow: `0 0 10px ${METAL.goldGlow}`,
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
        background: 'rgba(245,158,11,0.15)',
        border: `1px solid ${METAL.gold}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: METAL.gold,
        cursor: 'pointer',
    },
    statsSection: {
        padding: 16,
        borderBottom: `1px solid ${METAL.mid}`,
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
    },
    statBox: {
        padding: 14,
        background: 'rgba(0,0,0,0.3)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 10,
        textAlign: 'center',
    },
    statValue: {
        display: 'block',
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 18,
        fontWeight: 700,
        color: METAL.gold,
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
    seriesList: {
        padding: 16,
    },
    emptyState: {
        padding: 32,
        textAlign: 'center',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: '0.1em',
    },
    emptyAddBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 16,
        padding: '12px 20px',
        background: GRADIENTS.goldPremium,
        border: 'none',
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: '#000',
        cursor: 'pointer',
    },
    seriesCard: {
        position: 'relative',
        padding: 16,
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 10,
        marginBottom: 12,
    },
    seriesCardActive: {
        borderColor: METAL.success,
        boxShadow: `0 0 15px ${METAL.successGlow}`,
    },
    liveBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        background: 'rgba(34,197,94,0.15)',
        border: `1px solid ${METAL.success}`,
        borderRadius: 4,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 9,
        fontWeight: 700,
        color: METAL.success,
        letterSpacing: '0.1em',
    },
    liveDot: {
        width: 6,
        height: 6,
        background: METAL.success,
        borderRadius: '50%',
        animation: 'metalGlow 1s ease-in-out infinite',
    },
    seriesHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    seriesType: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        fontWeight: 600,
        color: METAL.gold,
        letterSpacing: '0.1em',
    },
    seriesActions: {
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
    seriesName: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 15,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
    },
    seriesInfo: {
        display: 'flex',
        gap: 16,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 12,
    },
    seriesStats: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        padding: '10px 0 0',
        borderTop: `1px solid ${METAL.mid}`,
    },
    seriesStatItem: {
        textAlign: 'center',
    },
    seriesStatValue: {
        display: 'block',
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
    },
    seriesStatLabel: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 9,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: '0.1em',
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
        background: METAL.gold,
        boxShadow: `0 0 10px ${METAL.goldGlow}`,
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
        background: GRADIENTS.goldPremium,
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
