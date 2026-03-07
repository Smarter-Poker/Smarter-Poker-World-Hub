/* ═══════════════════════════════════════════════════════════════════════════
   🔍 SCENARIO FILTER PANEL — Custom filtering for Memory Matrix scenarios
   Allows users to practice specific positions, stack depths, and formats
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Filter options
const POSITION_OPTIONS = [
    { value: '', label: 'All Positions' },
    { value: 'UTG', label: 'UTG' },
    { value: 'UTG+1', label: 'UTG+1' },
    { value: 'MP', label: 'MP' },
    { value: 'LJ', label: 'LJ (Lojack)' },
    { value: 'HJ', label: 'HJ (Hijack)' },
    { value: 'CO', label: 'CO (Cutoff)' },
    { value: 'BTN', label: 'BTN (Button)' },
    { value: 'SB', label: 'SB (Small-Blind)' },
    { value: 'BB', label: 'BB (Big-Blind)' },
];

const STACK_DEPTH_OPTIONS = [
    { value: 0, label: 'All Stack Depths' },
    { value: 20, label: '20BB (Short)' },
    { value: 30, label: '30BB' },
    { value: 50, label: '50BB' },
    { value: 100, label: '100BB (Deep)' },
    { value: 200, label: '200BB (Very Deep)' },
];

const FORMAT_OPTIONS = [
    { value: '', label: 'All Formats' },
    { value: '6-max', label: '6-Max' },
    { value: '9-max', label: '9-Max' },
    { value: 'mtt', label: 'MTT (Tournament)' },
    { value: 'ante', label: 'With Ante' },
];

export default function ScenarioFilterPanel({
    onFilterChange,
    onClose,
    currentFilters = {},
    availableScenarios = 0,
    filteredCount = 0,
}) {
    const [position, setPosition] = useState(currentFilters.position || '');
    const [stackDepth, setStackDepth] = useState(currentFilters.stackDepth || 0);
    const [format, setFormat] = useState(currentFilters.format || '');

    const handleApply = () => {
        onFilterChange({
            position: position || null,
            stackDepth: stackDepth || null,
            format: format || null,
        });
    };

    const handleReset = () => {
        setPosition('');
        setStackDepth(0);
        setFormat('');
        onFilterChange({});
    };

    const hasFilters = position || stackDepth || format;

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={styles.container}
        >
            <div style={styles.header}>
                <h3 style={styles.title}>🔍 Filter Scenarios</h3>
                <button onClick={onClose} style={styles.closeButton}>✕</button>
            </div>

            <div style={styles.filterGrid}>
                {/* Position Filter */}
                <div style={styles.filterGroup}>
                    <label style={styles.filterLabel}>Position</label>
                    <select
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        style={styles.select}
                    >
                        {POSITION_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>

                {/* Stack Depth Filter */}
                <div style={styles.filterGroup}>
                    <label style={styles.filterLabel}>Stack Depth</label>
                    <select
                        value={stackDepth}
                        onChange={(e) => setStackDepth(parseInt(e.target.value))}
                        style={styles.select}
                    >
                        {STACK_DEPTH_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>

                {/* Format Filter */}
                <div style={styles.filterGroup}>
                    <label style={styles.filterLabel}>Format</label>
                    <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        style={styles.select}
                    >
                        {FORMAT_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Filter Stats */}
            <div style={styles.statsRow}>
                <span style={styles.statsText}>
                    {hasFilters ? (
                        <>
                            <span style={{ color: '#00D4FF', fontWeight: 700 }}>{filteredCount}</span>
                            <span> of {availableScenarios} scenarios match</span>
                        </>
                    ) : (
                        <span>{availableScenarios} scenarios available</span>
                    )}
                </span>
            </div>

            {/* Action Buttons */}
            <div style={styles.buttonRow}>
                <button
                    onClick={handleReset}
                    style={styles.resetButton}
                    disabled={!hasFilters}
                >
                    ↺ Reset
                </button>
                <button
                    onClick={handleApply}
                    style={styles.applyButton}
                >
                    ✓ Apply Filters
                </button>
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTER SCENARIOS UTILITY
// ═══════════════════════════════════════════════════════════════════════════
export function filterScenarios(scenarios, filters = {}) {
    if (!filters || (!filters.position && !filters.stackDepth && !filters.format)) {
        return scenarios;
    }

    return scenarios.filter(scenario => {
        // Position filter
        if (filters.position && scenario.position !== filters.position) {
            return false;
        }

        // Stack depth filter
        if (filters.stackDepth && scenario.stackDepth !== filters.stackDepth) {
            return false;
        }

        // Format filter (check title for keywords)
        if (filters.format) {
            const titleLower = (scenario.title || '').toLowerCase();
            const idLower = (scenario.id || '').toLowerCase();

            switch (filters.format) {
                case '6-max':
                    if (!titleLower.includes('6-max') && !titleLower.includes('6max')) return false;
                    break;
                case '9-max':
                    // Default format is 9-max if not specified
                    if (titleLower.includes('6-max') || titleLower.includes('6max') || titleLower.includes('mtt')) return false;
                    break;
                case 'mtt':
                    if (!titleLower.includes('mtt') && !titleLower.includes('tournament')) return false;
                    break;
                case 'ante':
                    if (!titleLower.includes('ante')) return false;
                    break;
            }
        }

        return true;
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        background: 'linear-gradient(135deg, rgba(0, 20, 40, 0.95), rgba(0, 10, 30, 0.95))',
        border: '2px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        backdropFilter: 'blur(10px)',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        margin: 0,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 16,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
        marginBottom: 16,
    },
    filterGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    filterLabel: {
        fontSize: 11,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    select: {
        padding: '10px 12px',
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        outline: 'none',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='white' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        paddingRight: 32,
    },
    statsRow: {
        textAlign: 'center',
        marginBottom: 16,
    },
    statsText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    buttonRow: {
        display: 'flex',
        gap: 12,
    },
    resetButton: {
        flex: 1,
        padding: '12px 20px',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 25,
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    applyButton: {
        flex: 2,
        padding: '12px 20px',
        background: 'linear-gradient(135deg, #00D4FF, #0088dd)',
        border: 'none',
        borderRadius: 25,
        color: '#000',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
    },
};
