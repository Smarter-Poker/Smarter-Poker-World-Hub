/**
 * LIVE PLAYER NOTES
 * Track opponents with photos, bios, and gameplay notes
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

export default function PlayerNotes({ userId }) {
    const [players, setPlayers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (userId) loadPlayers();
    }, [userId]);

    async function loadPlayers() {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('player_notes')
                .select('*')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false });

            if (!error && data) {
                setPlayers(data);
            }
        } catch (err) {
            console.error('[PlayerNotes] Load error:', err);
        }
        setIsLoading(false);
    }

    const filteredPlayers = players.filter(p =>
        p.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.real_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.notes?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    function getPlayerTypeColor(type) {
        switch (type) {
            case 'fish': return '#22c55e';
            case 'reg': return '#eab308';
            case 'shark': return '#ef4444';
            case 'unknown': return '#666';
            default: return '#2374e1';
        }
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={styles.title}>🎯 Player Notes</h2>
                <button onClick={() => setShowAddModal(true)} style={styles.addBtn}>
                    + Add Player
                </button>
            </div>

            {/* Search */}
            <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={styles.searchInput}
            />

            {/* Player List */}
            {isLoading ? (
                <div style={styles.loading}>Loading players...</div>
            ) : filteredPlayers.length === 0 ? (
                <div style={styles.empty}>
                    <span style={{ fontSize: 40, marginBottom: 12 }}>🃏</span>
                    <p style={{ margin: 0 }}>No players yet</p>
                    <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.6 }}>
                        Add notes on opponents you've played against
                    </p>
                </div>
            ) : (
                <div style={styles.playerList}>
                    {filteredPlayers.map(player => (
                        <div
                            key={player.id}
                            style={styles.playerCard}
                            onClick={() => setSelectedPlayer(player)}
                        >
                            <div style={styles.playerAvatar}>
                                {player.photo_url ? (
                                    <img src={player.photo_url} alt="" style={styles.avatarImg} />
                                ) : (
                                    <span style={styles.avatarPlaceholder}>
                                        {(player.nickname || player.real_name || '?')[0].toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <div style={styles.playerInfo}>
                                <div style={styles.playerName}>
                                    {player.nickname || player.real_name || 'Unknown'}
                                </div>
                                {player.real_name && player.nickname && (
                                    <div style={styles.playerRealName}>{player.real_name}</div>
                                )}
                                <div style={styles.playerMeta}>
                                    <span style={{
                                        ...styles.playerType,
                                        color: getPlayerTypeColor(player.player_type)
                                    }}>
                                        {player.player_type || 'unknown'}
                                    </span>
                                    {player.stakes && <span style={styles.playerStakes}>{player.stakes}</span>}
                                </div>
                            </div>
                            <span style={styles.playerArrow}>›</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal */}
            <AnimatePresence>
                {(showAddModal || selectedPlayer) && (
                    <PlayerModal
                        player={selectedPlayer}
                        userId={userId}
                        onClose={() => {
                            setShowAddModal(false);
                            setSelectedPlayer(null);
                        }}
                        onSave={() => {
                            loadPlayers();
                            setShowAddModal(false);
                            setSelectedPlayer(null);
                        }}
                        onDelete={() => {
                            loadPlayers();
                            setSelectedPlayer(null);
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

function PlayerModal({ player, userId, onClose, onSave, onDelete }) {
    const [formData, setFormData] = useState({
        nickname: player?.nickname || '',
        real_name: player?.real_name || '',
        photo_url: player?.photo_url || '',
        player_type: player?.player_type || 'unknown',
        stakes: player?.stakes || '',
        venue: player?.venue || '',
        notes: player?.notes || '',
        tells: player?.tells || '',
        tendencies: player?.tendencies || '',
    });
    const [isSaving, setIsSaving] = useState(false);

    async function handleSave() {
        if (!formData.nickname && !formData.real_name) return;

        setIsSaving(true);
        try {
            if (player?.id) {
                await supabase
                    .from('player_notes')
                    .update({
                        ...formData,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', player.id);
            } else {
                await supabase
                    .from('player_notes')
                    .insert({
                        user_id: userId,
                        ...formData
                    });
            }
            onSave();
        } catch (err) {
            console.error('[PlayerModal] Save error:', err);
        }
        setIsSaving(false);
    }

    async function handleDelete() {
        if (!player?.id) return;
        if (!confirm('Delete this player?')) return;

        try {
            await supabase.from('player_notes').delete().eq('id', player.id);
            onDelete();
        } catch (err) {
            console.error('[PlayerModal] Delete error:', err);
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={styles.modalOverlay}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                style={styles.modal}
                onClick={e => e.stopPropagation()}
            >
                <div style={styles.modalHeader}>
                    <h3 style={styles.modalTitle}>
                        {player ? 'Edit Player' : 'Add Player'}
                    </h3>
                    <button onClick={onClose} style={styles.closeBtn}>×</button>
                </div>

                <div style={styles.modalBody}>
                    {/* Basic Info */}
                    <div style={styles.formRow}>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Nickname</label>
                            <input
                                type="text"
                                value={formData.nickname}
                                onChange={e => setFormData({ ...formData, nickname: e.target.value })}
                                placeholder="e.g. 'Tight Mike'"
                                style={styles.input}
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Real Name</label>
                            <input
                                type="text"
                                value={formData.real_name}
                                onChange={e => setFormData({ ...formData, real_name: e.target.value })}
                                placeholder="Optional"
                                style={styles.input}
                            />
                        </div>
                    </div>

                    {/* Photo URL */}
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Photo URL</label>
                        <input
                            type="text"
                            value={formData.photo_url}
                            onChange={e => setFormData({ ...formData, photo_url: e.target.value })}
                            placeholder="https://..."
                            style={styles.input}
                        />
                    </div>

                    {/* Type & Stakes */}
                    <div style={styles.formRow}>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Player Type</label>
                            <select
                                value={formData.player_type}
                                onChange={e => setFormData({ ...formData, player_type: e.target.value })}
                                style={styles.select}
                            >
                                <option value="unknown">Unknown</option>
                                <option value="fish">🐟 Fish</option>
                                <option value="reg">♠️ Reg</option>
                                <option value="shark">🦈 Shark</option>
                                <option value="whale">🐋 Whale</option>
                                <option value="nit">🐢 Nit</option>
                                <option value="lag">🔥 LAG</option>
                                <option value="tag">🎯 TAG</option>
                            </select>
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Typical Stakes</label>
                            <input
                                type="text"
                                value={formData.stakes}
                                onChange={e => setFormData({ ...formData, stakes: e.target.value })}
                                placeholder="e.g. 2/5 NL"
                                style={styles.input}
                            />
                        </div>
                    </div>

                    {/* Venue */}
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Usually Plays At</label>
                        <input
                            type="text"
                            value={formData.venue}
                            onChange={e => setFormData({ ...formData, venue: e.target.value })}
                            placeholder="e.g. Rivers Casino"
                            style={styles.input}
                        />
                    </div>

                    {/* Notes */}
                    <div style={styles.formGroup}>
                        <label style={styles.label}>General Notes</label>
                        <textarea
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Physical description, personality, any general observations..."
                            style={styles.textarea}
                        />
                    </div>

                    {/* Tells */}
                    <div style={styles.formGroup}>
                        <label style={styles.label}>🎭 Tells</label>
                        <textarea
                            value={formData.tells}
                            onChange={e => setFormData({ ...formData, tells: e.target.value })}
                            placeholder="Physical tells, timing tells, bet sizing tells..."
                            style={styles.textarea}
                        />
                    </div>

                    {/* Tendencies */}
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Tendencies</label>
                        <textarea
                            value={formData.tendencies}
                            onChange={e => setFormData({ ...formData, tendencies: e.target.value })}
                            placeholder="3-bets light, folds to river raises, overplays top pair..."
                            style={styles.textarea}
                        />
                    </div>
                </div>

                <div style={styles.modalFooter}>
                    {player && (
                        <button onClick={handleDelete} style={styles.deleteBtn}>
                            Delete
                        </button>
                    )}
                    <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        style={styles.saveBtn}
                    >
                        {isSaving ? 'Saving...' : 'Save Player'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

const styles = {
    container: {
        padding: 20,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        margin: 0,
    },
    addBtn: {
        padding: '10px 16px',
        background: 'linear-gradient(135deg, #2374e1, #1a5fc9)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
    },
    searchInput: {
        width: '100%',
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 10,
        color: '#fff',
        fontSize: 14,
        marginBottom: 16,
        outline: 'none',
        boxSizing: 'border-box',
    },
    loading: {
        padding: 40,
        textAlign: 'center',
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 14,
    },
    empty: {
        padding: 40,
        textAlign: 'center',
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 14,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    playerList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    playerCard: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    playerAvatar: {
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: 'rgba(0, 212, 255, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
    },
    avatarImg: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    avatarPlaceholder: {
        fontSize: 20,
        fontWeight: 700,
        color: '#2374e1',
    },
    playerInfo: {
        flex: 1,
        minWidth: 0,
    },
    playerName: {
        fontSize: 15,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 2,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    playerRealName: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 4,
    },
    playerMeta: {
        display: 'flex',
        gap: 10,
        alignItems: 'center',
    },
    playerType: {
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
    },
    playerStakes: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    playerArrow: {
        fontSize: 20,
        color: 'rgba(255, 255, 255, 0.3)',
    },
    modalOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
    },
    modal: {
        background: 'linear-gradient(135deg, #0a1929, #0d2137)',
        borderRadius: 16,
        border: '1px solid rgba(0, 212, 255, 0.3)',
        width: '100%',
        maxWidth: 500,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    modalHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        margin: 0,
    },
    closeBtn: {
        width: 32,
        height: 32,
        background: 'transparent',
        border: 'none',
        color: '#666',
        fontSize: 24,
        cursor: 'pointer',
    },
    modalBody: {
        padding: 20,
        overflowY: 'auto',
        flex: 1,
    },
    formRow: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
    },
    formGroup: {
        marginBottom: 14,
    },
    label: {
        display: 'block',
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        outline: 'none',
        boxSizing: 'border-box',
    },
    select: {
        width: '100%',
        padding: '10px 12px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        outline: 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
    },
    textarea: {
        width: '100%',
        padding: '10px 12px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        outline: 'none',
        minHeight: 70,
        resize: 'vertical',
        boxSizing: 'border-box',
    },
    modalFooter: {
        display: 'flex',
        gap: 10,
        padding: '16px 20px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    },
    deleteBtn: {
        padding: '12px 16px',
        background: 'rgba(239, 68, 68, 0.2)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: 8,
        color: '#ef4444',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
    },
    cancelBtn: {
        flex: 1,
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
        color: '#888',
        fontSize: 13,
        cursor: 'pointer',
    },
    saveBtn: {
        flex: 1,
        padding: '12px 16px',
        background: 'linear-gradient(135deg, #2374e1, #1a5fc9)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
    },
};
