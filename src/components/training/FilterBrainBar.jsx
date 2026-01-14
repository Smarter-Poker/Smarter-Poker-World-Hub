/**
 * 🧠 FILTER BRAIN BAR — Exact Mockup Match
 * ═══════════════════════════════════════════════════════════════════════════
 * Matches reference design exactly with proper pill styling
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';

// Filter categories matching reference
const FILTER_OPTIONS = [
    { id: 'ALL', label: 'ALL' },
    { id: 'GTO', label: 'GTO' },
    { id: 'EXPLOITATIVE', label: 'EXPLOITATIVE' },
    { id: 'MATH', label: 'MATH' },
];

export default function FilterBrainBar({
    activeFilter = 'ALL',
    onFilterChange,
    overallMastery = 0,
    playerRank = 'Novice',
    diamondBalance = 0,
}) {
    const handleFilterClick = (filterId) => {
        if (filterId === activeFilter) return;
        onFilterChange?.(filterId);
    };

    return (
        <div style={styles.container}>
            {/* Left: Filter Pills */}
            <div style={styles.filterSection}>
                {FILTER_OPTIONS.map(filter => {
                    const isActive = activeFilter === filter.id;

                    return (
                        <button
                            key={filter.id}
                            onClick={() => handleFilterClick(filter.id)}
                            style={{
                                ...styles.filterPill,
                                background: isActive ? '#fff' : 'transparent',
                                color: isActive ? '#000' : 'rgba(255,255,255,0.7)',
                                border: isActive ? '1px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                            }}
                        >
                            {filter.label}
                        </button>
                    );
                })}
            </div>

            {/* Right: Player State */}
            <div style={styles.playerState}>
                {/* Mastery */}
                <div style={styles.statBlock}>
                    <span style={styles.statLabel}>MASTERY</span>
                    <span style={{
                        ...styles.statValue,
                        color: overallMastery >= 85 ? '#4CAF50' : overallMastery >= 70 ? '#FFD700' : '#FF6B35',
                    }}>
                        {overallMastery}%
                    </span>
                </div>

                <div style={styles.divider} />

                {/* Rank */}
                <div style={styles.statBlock}>
                    <span style={styles.statLabel}>RANK</span>
                    <span style={styles.statValue}>{playerRank}</span>
                </div>

                <div style={styles.divider} />

                {/* Diamonds */}
                <div style={styles.statBlock}>
                    <span style={styles.statLabel}>💎</span>
                    <span style={{ ...styles.statValue, color: '#00D4FF' }}>
                        {diamondBalance.toLocaleString()}
                    </span>
                </div>

                {/* Ready indicator */}
                <div style={styles.readyBadge}>
                    READY
                </div>
            </div>
        </div>
    );
}

const styles = {
    container: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 40px',
        background: 'rgba(13, 17, 23, 0.95)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
    },

    filterSection: {
        display: 'flex',
        gap: 8,
    },

    filterPill: {
        padding: '8px 20px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'Arial, sans-serif',
        letterSpacing: 1,
        borderRadius: 20,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textTransform: 'uppercase',
    },

    playerState: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
    },

    statBlock: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 50,
    },

    statLabel: {
        fontSize: 9,
        fontWeight: 500,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1,
        marginBottom: 2,
    },

    statValue: {
        fontSize: 13,
        fontWeight: 700,
        color: '#fff',
    },

    divider: {
        width: 1,
        height: 24,
        background: 'rgba(255,255,255,0.1)',
    },

    readyBadge: {
        padding: '6px 14px',
        fontSize: 10,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.6)',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 4,
        letterSpacing: 1,
    },
};
