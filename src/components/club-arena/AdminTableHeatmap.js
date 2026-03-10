import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// Helper to determine the "heat" rating of a table
function getTableHeat(table) {
    if (table.status === 'closed' || table.status === 'deleted') return { color: '#3A3B3C', label: 'Closed' };
    if (!table.current_players || table.current_players === 0) return { color: '#78909C', label: 'Empty' };

    const fillRatio = table.current_players / (table.max_players || 9);

    // Cold: < 30% full
    if (fillRatio < 0.3) return { color: '#2196F3', label: 'Cold' };
    // Warm: 30% - 70% full
    if (fillRatio <= 0.7) return { color: '#FFA726', label: 'Warm' };
    // Hot: > 70% full but not waiting
    if (fillRatio < 1) return { color: '#FF5252', label: 'Hot' };

    // Full / Waiting
    return { color: '#E91E63', label: 'Full', isPulse: true };
}

export default function AdminTableHeatmap({ clubId, tables = [], onAction }) {
    // We will render tables as an actual physical top-down 2D grid matrix
    const [viewMode, setViewMode] = useState('density'); // 'density', 'stakes', 'variant'

    // Safety check
    if (!tables || tables.length === 0) {
        return <div style={{ padding: 20, textAlign: 'center', color: '#B0B3B8' }}>No tables available for God View.</div>;
    }

    // Filter out deleted/closed
    const activeTables = tables.filter(t => t.status !== 'deleted' && t.status !== 'closed');

    return (
        <div style={styles.container}>
            {/* Control Bar */}
            <div style={styles.controlBar}>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        style={viewMode === 'density' ? styles.btnActive : styles.btnInactive}
                        onClick={() => setViewMode('density')}
                    >🔥 Density</button>
                    <button
                        style={viewMode === 'stakes' ? styles.btnActive : styles.btnInactive}
                        onClick={() => setViewMode('stakes')}
                    >💰 Stakes</button>
                    <button
                        style={viewMode === 'variant' ? styles.btnActive : styles.btnInactive}
                        onClick={() => setViewMode('variant')}
                    >🃏 Variant</button>
                </div>
                <div style={{ fontSize: 11, color: '#B0B3B8' }}>{activeTables.length} Active Tables</div>
            </div>

            {/* Matrix Grid */}
            <div style={styles.grid}>
                {activeTables.map(t => {
                    const heat = getTableHeat(t);
                    return (
                        <div
                            key={t.id}
                            style={{
                                ...styles.tableNode,
                                borderColor: heat.color,
                                boxShadow: heat.isPulse ? `0 0 12px ${heat.color}80` : 'none',
                                animation: heat.isPulse ? 'pulseBorder 2s infinite' : 'none'
                            }}
                            onClick={() => onAction?.({ action: 'manage', table: t })}
                        >
                            {/* The "Felt" */}
                            <div style={styles.feltArea}>
                                {/* Meta Data Overlay */}
                                <div style={styles.tableCenter}>
                                    <div style={styles.tableName}>{t.name?.length > 10 ? t.name.slice(0, 10) + '...' : t.name}</div>

                                    {viewMode === 'stakes' && (
                                        <div style={styles.heroData}>{t.small_blind}/{t.big_blind}</div>
                                    )}
                                    {viewMode === 'variant' && (
                                        <div style={{ ...styles.heroData, color: '#A855F7' }}>{t.game_variant?.toUpperCase().replace('_', ' ')}</div>
                                    )}
                                    {viewMode === 'density' && (
                                        <div style={{ ...styles.heroData, color: heat.color }}>
                                            {t.current_players || 0}/{t.max_players || 9}
                                        </div>
                                    )}

                                </div>

                                {/* 2D Seat Dots (Max 9) */}
                                <div style={styles.seatsContainer}>
                                    {Array.from({ length: t.max_players || 9 }).map((_, i) => {
                                        const isOccupied = i < (t.current_players || 0);
                                        return (
                                            <div
                                                key={i}
                                                style={{
                                                    ...styles.seatDot,
                                                    background: isOccupied ? heat.color : 'rgba(255,255,255,0.1)',
                                                    border: `1px solid ${isOccupied ? '#fff' : 'rgba(255,255,255,0.2)'}`
                                                }}
                                            />
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div style={styles.legendRow}>
                <div style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#78909C' }} /> Empty</div>
                <div style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#2196F3' }} /> Cold</div>
                <div style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#FFA726' }} /> Warm</div>
                <div style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#FF5252' }} /> Hot</div>
                <div style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#E91E63' }} /> Full</div>
            </div>
        </div>
    );
}

const styles = {
    container: {
        width: '100%',
        padding: '16px',
        background: '#18191A',
        borderRadius: 12,
        border: '1px solid #3E4042',
    },
    controlBar: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 12,
        borderBottom: '1px solid #3E4042'
    },
    btnActive: {
        background: '#2374E1',
        border: '1px solid #2374E1',
        color: '#fff',
        padding: '6px 12px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer'
    },
    btnInactive: {
        background: 'transparent',
        border: '1px solid #3E4042',
        color: '#B0B3B8',
        padding: '6px 12px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer'
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '16px',
        marginBottom: '20px'
    },
    tableNode: {
        background: '#242526',
        borderRadius: 16,
        border: '2px solid',
        padding: '8px',
        cursor: 'pointer',
        transition: 'transform 0.1s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        minHeight: 100
    },
    feltArea: {
        width: '100%',
        height: '100%',
        background: '#0c0c14',
        borderRadius: 12,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
    },
    tableCenter: {
        textAlign: 'center',
        zIndex: 2,
        padding: 4
    },
    tableName: {
        fontSize: 10,
        color: '#E4E6EB',
        fontWeight: 600,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5
    },
    heroData: {
        fontSize: 18,
        fontWeight: 800,
        fontFamily: '"Orbitron", monospace',
        textShadow: '0 2px 4px rgba(0,0,0,0.8)'
    },
    seatsContainer: {
        position: 'absolute',
        bottom: 8,
        display: 'flex',
        gap: 3,
        zIndex: 2,
        background: 'rgba(0,0,0,0.4)',
        padding: '2px 6px',
        borderRadius: 10
    },
    seatDot: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        boxShadow: '0 1px 2px rgba(0,0,0,0.5)'
    },
    legendRow: {
        display: 'flex',
        gap: 16,
        justifyContent: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid #3E4042'
    },
    legendItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: '#B0B3B8',
        fontWeight: 600
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: '50%'
    }
};

// Inject animations securely
if (typeof document !== 'undefined') {
    const s = document.createElement('style');
    s.innerHTML = `
        @keyframes pulseBorder {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.02); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
        }
    `;
    document.head.appendChild(s);
}
