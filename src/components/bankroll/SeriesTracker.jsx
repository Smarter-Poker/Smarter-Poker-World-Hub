/**
 * SERIES TRACKER COMPONENT
 * Manage tournament series (WSOP, WPT, etc.) with series-level ROI
 */

import { useState, useEffect, useMemo } from 'react';
import { Trophy, Plus, Edit2, Trash2, TrendingUp, Calendar, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/bankroll/currencyUtils';

const SERIES_TYPES = [
    { id: 'wsop', label: 'WSOP' },
    { id: 'wpt', label: 'WPT' },
    { id: 'wpt_online', label: 'WPT Online' },
    { id: 'mspt', label: 'MSPT' },
    { id: 'regional', label: 'Regional' },
    { id: 'online', label: 'Online' },
    { id: 'other', label: 'Other' },
];

export default function SeriesTracker({ userId, displayEUR = false }) {
    const [series, setSeries] = useState([]);
    const [seriesStats, setSeriesStats] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingSeries, setEditingSeries] = useState(null);

    useEffect(() => {
        if (userId) {
            loadData();
        }
    }, [userId]);

    const loadData = async () => {
        setIsLoading(true);

        // Fetch series
        const { data: seriesData } = await supabase
            .from('tournament_series')
            .select('*')
            .eq('user_id', userId)
            .order('start_date', { ascending: false });

        setSeries(seriesData || []);

        // Fetch stats for each series
        const stats = {};
        for (const s of (seriesData || [])) {
            const { data: sessions } = await supabase
                .from('bankroll_ledger')
                .select('gross_in, gross_out')
                .eq('series_id', s.id);

            let buyIns = 0;
            let cashOuts = 0;
            sessions?.forEach(sess => {
                buyIns += sess.gross_in || 0;
                cashOuts += sess.gross_out || 0;
            });

            stats[s.id] = {
                events: sessions?.length || 0,
                buyIns,
                cashOuts,
                net: cashOuts - buyIns,
                roi: buyIns > 0 ? ((cashOuts - buyIns) / buyIns * 100) : 0
            };
        }
        setSeriesStats(stats);
        setIsLoading(false);
    };

    const currentSeries = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        return series.find(s => s.start_date <= today && (!s.end_date || s.end_date >= today));
    }, [series]);

    const totalStats = useMemo(() => {
        let totalBuyIns = 0;
        let totalCashOuts = 0;
        let totalEvents = 0;

        Object.values(seriesStats).forEach(s => {
            totalBuyIns += s.buyIns;
            totalCashOuts += s.cashOuts;
            totalEvents += s.events;
        });

        return {
            totalBuyIns,
            totalCashOuts,
            net: totalCashOuts - totalBuyIns,
            events: totalEvents,
            roi: totalBuyIns > 0 ? ((totalCashOuts - totalBuyIns) / totalBuyIns * 100) : 0
        };
    }, [seriesStats]);

    const handleDelete = async (id) => {
        if (!confirm('Delete this series?')) return;
        await supabase.from('tournament_series').delete().eq('id', id);
        loadData();
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.titleRow}>
                    <Trophy size={18} style={{ color: '#f59e0b' }} />
                    <h3 style={styles.title}>Tournament Series</h3>
                </div>
                <button onClick={() => { setEditingSeries(null); setShowModal(true); }} style={styles.addBtn}>
                    <Plus size={14} /> Add Series
                </button>
            </div>

            {/* Overall Stats */}
            <div style={styles.overallStats}>
                <div style={styles.overallItem}>
                    <div style={styles.overallLabel}>Total Series</div>
                    <div style={styles.overallValue}>{series.length}</div>
                </div>
                <div style={styles.overallItem}>
                    <div style={styles.overallLabel}>Events</div>
                    <div style={styles.overallValue}>{totalStats.events}</div>
                </div>
                <div style={styles.overallItem}>
                    <div style={styles.overallLabel}>Net Result</div>
                    <div style={{ ...styles.overallValue, color: totalStats.net >= 0 ? '#22c55e' : '#ef4444' }}>
                        {formatCurrency(totalStats.net, displayEUR)}
                    </div>
                </div>
                <div style={styles.overallItem}>
                    <div style={styles.overallLabel}>ROI</div>
                    <div style={{ ...styles.overallValue, color: totalStats.roi >= 0 ? '#22c55e' : '#ef4444' }}>
                        {totalStats.roi >= 0 ? '+' : ''}{totalStats.roi.toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* Current Series */}
            {currentSeries && (
                <div style={styles.currentCard}>
                    <div style={styles.currentBadge}>● Active</div>
                    <div style={styles.currentName}>{currentSeries.name}</div>
                    <div style={styles.currentMeta}>
                        <span><MapPin size={11} /> {currentSeries.location}</span>
                        <span><Calendar size={11} /> {new Date(currentSeries.start_date).toLocaleDateString()}</span>
                    </div>
                    {seriesStats[currentSeries.id] && (
                        <div style={styles.currentStats}>
                            <span>{seriesStats[currentSeries.id].events} events</span>
                            <span style={{ color: seriesStats[currentSeries.id].net >= 0 ? '#22c55e' : '#ef4444' }}>
                                {formatCurrency(seriesStats[currentSeries.id].net, displayEUR)}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Series List */}
            <div style={styles.seriesList}>
                {series.filter(s => s !== currentSeries).map(s => (
                    <div key={s.id} style={styles.seriesCard}>
                        <div style={styles.seriesHeader}>
                            <div>
                                <div style={styles.seriesName}>{s.name}</div>
                                <div style={styles.seriesMeta}>
                                    {s.location} • {new Date(s.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                </div>
                            </div>
                            <div style={styles.seriesActions}>
                                <button onClick={() => { setEditingSeries(s); setShowModal(true); }} style={styles.editBtn}>
                                    <Edit2 size={11} />
                                </button>
                                <button onClick={() => handleDelete(s.id)} style={styles.deleteBtn}>
                                    <Trash2 size={11} />
                                </button>
                            </div>
                        </div>
                        {seriesStats[s.id] && (
                            <div style={styles.seriesStatsRow}>
                                <span>{seriesStats[s.id].events} events</span>
                                <span style={{ color: seriesStats[s.id].net >= 0 ? '#22c55e' : '#ef4444' }}>
                                    {formatCurrency(seriesStats[s.id].net, displayEUR)} ({seriesStats[s.id].roi >= 0 ? '+' : ''}{seriesStats[s.id].roi.toFixed(0)}%)
                                </span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Empty State */}
            {!isLoading && series.length === 0 && (
                <div style={styles.emptyState}>
                    <Trophy size={32} style={{ color: 'rgba(255,255,255,0.2)' }} />
                    <p>No tournament series tracked yet</p>
                    <button onClick={() => setShowModal(true)} style={styles.emptyBtn}>
                        Add Your First Series
                    </button>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <SeriesModal
                    series={editingSeries}
                    userId={userId}
                    onClose={() => setShowModal(false)}
                    onSave={() => { setShowModal(false); loadData(); }}
                />
            )}
        </div>
    );
}

function SeriesModal({ series, userId, onClose, onSave }) {
    const [form, setForm] = useState({
        name: series?.name || '',
        series_type: series?.series_type || 'wsop',
        location: series?.location || '',
        start_date: series?.start_date || new Date().toISOString().split('T')[0],
        end_date: series?.end_date || '',
        planned_budget: series?.planned_budget || '',
        notes: series?.notes || '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);

        const payload = {
            ...form,
            planned_budget: form.planned_budget ? Number(form.planned_budget) : null,
            end_date: form.end_date || null,
        };

        try {
            if (series?.id) {
                await supabase.from('tournament_series').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', series.id);
            } else {
                await supabase.from('tournament_series').insert({ ...payload, user_id: userId });
            }
            onSave();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={modalStyles.overlay} onClick={onClose}>
            <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
                <h3 style={modalStyles.title}>{series ? 'Edit' : 'Add'} Tournament Series</h3>

                <form onSubmit={handleSubmit}>
                    <div style={modalStyles.field}>
                        <label style={modalStyles.label}>Series Name *</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            placeholder="WSOP 2026"
                            style={modalStyles.input}
                            required
                        />
                    </div>

                    <div style={modalStyles.row}>
                        <div style={modalStyles.field}>
                            <label style={modalStyles.label}>Type</label>
                            <select
                                value={form.series_type}
                                onChange={e => setForm({ ...form, series_type: e.target.value })}
                                style={modalStyles.input}
                            >
                                {SERIES_TYPES.map(t => (
                                    <option key={t.id} value={t.id}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                        <div style={modalStyles.field}>
                            <label style={modalStyles.label}>Location</label>
                            <input
                                type="text"
                                value={form.location}
                                onChange={e => setForm({ ...form, location: e.target.value })}
                                placeholder="Las Vegas, NV"
                                style={modalStyles.input}
                            />
                        </div>
                    </div>

                    <div style={modalStyles.row}>
                        <div style={modalStyles.field}>
                            <label style={modalStyles.label}>Start Date</label>
                            <input
                                type="date"
                                value={form.start_date}
                                onChange={e => setForm({ ...form, start_date: e.target.value })}
                                style={modalStyles.input}
                            />
                        </div>
                        <div style={modalStyles.field}>
                            <label style={modalStyles.label}>End Date</label>
                            <input
                                type="date"
                                value={form.end_date}
                                onChange={e => setForm({ ...form, end_date: e.target.value })}
                                style={modalStyles.input}
                            />
                        </div>
                    </div>

                    <div style={modalStyles.field}>
                        <label style={modalStyles.label}>Planned Budget</label>
                        <input
                            type="number"
                            value={form.planned_budget}
                            onChange={e => setForm({ ...form, planned_budget: e.target.value })}
                            placeholder="10000"
                            style={modalStyles.input}
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
        background: 'rgba(245,158,11,0.1)',
        border: '1px solid rgba(245,158,11,0.3)',
        borderRadius: 6,
        color: '#f59e0b',
        fontSize: 11,
        cursor: 'pointer',
    },
    overallStats: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8,
        marginBottom: 14,
    },
    overallItem: {
        textAlign: 'center',
        padding: 10,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
    },
    overallLabel: {
        fontSize: 9,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 2,
    },
    overallValue: {
        fontSize: 13,
        fontWeight: 700,
        color: '#fff',
    },
    currentCard: {
        background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(200,100,0,0.1))',
        border: '1px solid rgba(245,158,11,0.3)',
        borderRadius: 10,
        padding: 14,
        marginBottom: 14,
    },
    currentBadge: {
        color: '#22c55e',
        fontSize: 10,
        marginBottom: 4,
    },
    currentName: {
        fontSize: 15,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 6,
    },
    currentMeta: {
        display: 'flex',
        gap: 12,
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 8,
    },
    currentStats: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        paddingTop: 8,
        borderTop: '1px solid rgba(255,255,255,0.1)',
    },
    seriesList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    seriesCard: {
        padding: 12,
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 8,
    },
    seriesHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    seriesName: {
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
    },
    seriesMeta: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
    },
    seriesActions: {
        display: 'flex',
        gap: 6,
    },
    editBtn: {
        padding: 4,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        color: 'rgba(255,255,255,0.6)',
        cursor: 'pointer',
    },
    deleteBtn: {
        padding: 4,
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: 4,
        color: '#ef4444',
        cursor: 'pointer',
    },
    seriesStatsRow: {
        display: 'flex',
        justifyContent: 'space-between',
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
        background: 'rgba(245,158,11,0.1)',
        border: '1px solid rgba(245,158,11,0.3)',
        borderRadius: 6,
        color: '#f59e0b',
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
        flex: 1,
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
        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        border: 'none',
        borderRadius: 8,
        color: '#000',
        fontWeight: 600,
        cursor: 'pointer',
    },
};
