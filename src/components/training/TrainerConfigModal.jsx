/**
 * 🎯 TRAINER CONFIG MODAL — GTO Wizard-Style Training Setup
 * ═══════════════════════════════════════════════════════════════════════════
 * Lets users configure their training session before starting:
 * - Game Type: Cash / MTT / Spins
 * - Position: BTN / SB / BB / CO / HJ / UTG / MP
 * - Stack Depth: 20-200BB
 * - Street Focus: Flop / Turn / River / All
 *
 * The config gets passed to DeterministicGTOEngine to filter solver data.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Available configurations based on actual solver data in database
const GAME_TYPES = [
    { id: 'cash', label: 'Cash Game', icon: '💰', desc: 'No Limit Hold\'em 6-Max', pioTypes: ['hu_cash', 'postflop_complete'] },
    { id: 'mtt', label: 'Tournament', icon: '🏆', desc: 'MTT / Multi-Table', pioTypes: ['mtt_6max_icm', 'mtt_9max_icm', 'mtt_6max_chipev'] },
    { id: 'spins', label: 'Spins', icon: '🎰', desc: 'Spin & Go / HyperTurbo', pioTypes: ['turn_spin'] },
];

const POSITIONS = {
    cash: ['BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB'],
    mtt: ['BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB'],
    spins: ['BTN', 'SB', 'BB'],
};

const STACK_DEPTHS = {
    cash: [
        { value: 20, label: '20BB', desc: 'Short Stack' },
        { value: 40, label: '40BB', desc: 'Medium' },
        { value: 60, label: '60BB', desc: 'Standard' },
        { value: 100, label: '100BB', desc: 'Deep' },
        { value: 200, label: '200BB', desc: 'Ultra Deep' },
    ],
    mtt: [
        { value: 10, label: '10BB', desc: 'Push/Fold' },
        { value: 20, label: '20BB', desc: 'Short' },
        { value: 40, label: '40BB', desc: 'Medium' },
        { value: 60, label: '60BB', desc: 'Deep' },
        { value: 100, label: '100BB', desc: 'Chip Leader' },
    ],
    spins: [
        { value: 10, label: '10BB', desc: 'Hyper' },
        { value: 20, label: '20BB', desc: 'Turbo' },
        { value: 40, label: '40BB', desc: 'Normal' },
        { value: 60, label: '60BB', desc: 'Deep' },
    ],
};

const STREETS = [
    { id: 'all', label: 'All Streets', icon: '🃏', desc: 'Random street each hand' },
    { id: 'flop', label: 'Flop', icon: '🟢', desc: '3 community cards' },
    { id: 'turn', label: 'Turn', icon: '🟡', desc: '4 community cards' },
    { id: 'river', label: 'River', icon: '🔴', desc: '5 community cards' },
];

export default function TrainerConfigModal({ isOpen, onClose, onStart, currentGameId }) {
    const [gameType, setGameType] = useState('cash');
    const [position, setPosition] = useState('BTN');
    const [villainPosition, setVillainPosition] = useState('any');
    const [actionScenario, setActionScenario] = useState('any');
    const [stackDepth, setStackDepth] = useState(100);
    const [street, setStreet] = useState('all');
    const [handClass, setHandClass] = useState('all');
    const [questionsCount, setQuestionsCount] = useState(25);

    // Available positions for selected game type
    const availablePositions = useMemo(() => POSITIONS[gameType] || POSITIONS.cash, [gameType]);
    const availableStacks = useMemo(() => STACK_DEPTHS[gameType] || STACK_DEPTHS.cash, [gameType]);

    // Available Villain Positions (exclude Hero Position)
    const availableVillainPositions = useMemo(() => {
        return ['any', ...availablePositions.filter(p => p !== position)];
    }, [availablePositions, position]);

    // Reset position/stack when game type changes
    const handleGameTypeChange = useCallback((type) => {
        setGameType(type);
        const validPositions = POSITIONS[type] || POSITIONS.cash;
        if (!validPositions.includes(position)) setPosition(validPositions[0]);
        setVillainPosition('any');
        setActionScenario('any');
        const validStacks = STACK_DEPTHS[type] || STACK_DEPTHS.cash;
        if (!validStacks.find(s => s.value === stackDepth)) setStackDepth(validStacks[0].value);
    }, [position, stackDepth]);

    // Reset Villain Position if user selects it as Hero
    const handleHeroPositionChange = useCallback((pos) => {
        setPosition(pos);
        if (villainPosition === pos) setVillainPosition('any');
    }, [villainPosition]);

    const handleStart = useCallback(() => {
        const gameTypeConfig = GAME_TYPES.find(g => g.id === gameType);
        const filters = [
            gameTypeConfig?.label,
            position,
            villainPosition !== 'any' ? `vs ${villainPosition}` : null,
            actionScenario !== 'any' ? actionScenario : null,
            `${stackDepth}BB`,
            street === 'all' ? 'All Streets' : street.charAt(0).toUpperCase() + street.slice(1),
            handClass === 'all' ? null : handClass
        ].filter(Boolean).join(' | ');

        onStart({
            gameType,
            position,
            villainPosition: villainPosition === 'any' ? null : villainPosition,
            actionScenario: actionScenario === 'any' ? null : actionScenario,
            stackDepth,
            street: street === 'all' ? null : street,
            handClass: handClass === 'all' ? null : handClass,
            questionsCount,
            pioGameTypes: gameTypeConfig?.pioTypes || ['hu_cash'],
            pioStackDepth: stackDepth,
            label: filters,
        });
    }, [gameType, position, villainPosition, actionScenario, stackDepth, street, handClass, questionsCount, onStart]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={styles.overlay}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 30 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 30 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    style={{ ...styles.modal, maxHeight: '95vh' }}
                >
                    {/* Header */}
                    <div style={styles.header}>
                        <button onClick={onClose} style={styles.closeBtn}>✕</button>
                        <div style={styles.headerTitle}>Configure Trainer</div>
                        <div style={{ width: 32 }} />
                    </div>

                    <div style={styles.scrollArea}>
                        {/* SECTION 1: Game Type */}
                        <div style={styles.section}>
                            <div style={styles.sectionLabel}>GAME TYPE</div>
                            <div style={styles.optionRow}>
                                {GAME_TYPES.map(gt => (
                                    <motion.button
                                        key={gt.id}
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => handleGameTypeChange(gt.id)}
                                        style={{
                                            ...styles.optionCard,
                                            ...(gameType === gt.id ? styles.optionCardActive : {}),
                                        }}
                                    >
                                        <span style={styles.optionIcon}>{gt.icon}</span>
                                        <span style={styles.optionLabel}>{gt.label}</span>
                                        <span style={styles.optionDesc}>{gt.desc}</span>
                                    </motion.button>
                                ))}
                            </div>
                        </div>

                        {/* ROW: Hero & Villain Position */}
                        <div style={{ display: 'flex', gap: 20 }}>
                            {/* SECTION 2: Hero Position */}
                            <div style={{ ...styles.section, flex: 1 }}>
                                <div style={styles.sectionLabel}>HERO POSITION</div>
                                <div style={styles.chipRow}>
                                    {availablePositions.map(pos => (
                                        <motion.button
                                            key={pos}
                                            whileHover={{ scale: 1.08 }}
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() => handleHeroPositionChange(pos)}
                                            style={{
                                                ...styles.chip,
                                                ...(position === pos ? styles.chipActive : {}),
                                            }}
                                        >
                                            {pos}
                                        </motion.button>
                                    ))}
                                </div>
                            </div>

                            {/* SECTION 2B: Villain Position */}
                            <div style={{ ...styles.section, flex: 1 }}>
                                <div style={styles.sectionLabel}>VS VILLAIN</div>
                                <div style={styles.chipRow}>
                                    {availableVillainPositions.map(pos => (
                                        <motion.button
                                            key={pos}
                                            whileHover={{ scale: 1.08 }}
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() => setVillainPosition(pos)}
                                            style={{
                                                ...styles.chip,
                                                ...(villainPosition === pos ? styles.chipActive : {}),
                                            }}
                                        >
                                            {pos === 'any' ? 'Any' : pos}
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* ROW: Preflop Action & Stack Depth */}
                        <div style={{ display: 'flex', gap: 20 }}>
                            {/* SECTION 2C: Preflop Action Scenario */}
                            <div style={{ ...styles.section, flex: 1 }}>
                                <div style={styles.sectionLabel}>ACTION SCENARIO</div>
                                <div style={styles.chipRow}>
                                    {[
                                        { id: 'any', label: 'Any Scenario' },
                                        { id: 'SRP', label: 'Single Raised Pot (SRP)' },
                                        { id: '3BP', label: '3-Bet Pot' },
                                        { id: '4BP', label: '4-Bet+ Pot' },
                                    ].map(act => (
                                        <motion.button
                                            key={act.id}
                                            whileHover={{ scale: 1.08 }}
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() => setActionScenario(act.id)}
                                            style={{
                                                ...styles.chip,
                                                ...(actionScenario === act.id ? styles.chipActive : {}),
                                            }}
                                        >
                                            {act.label}
                                        </motion.button>
                                    ))}
                                </div>
                            </div>

                            {/* SECTION 3: Stack Depth */}
                            <div style={{ ...styles.section, flex: 1 }}>
                                <div style={styles.sectionLabel}>STACK DEPTH</div>
                                <div style={styles.chipRow}>
                                    {availableStacks.map(s => (
                                        <motion.button
                                            key={s.value}
                                            whileHover={{ scale: 1.08 }}
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() => setStackDepth(s.value)}
                                            style={{
                                                ...styles.stackChip,
                                                ...(stackDepth === s.value ? styles.chipActive : {}),
                                            }}
                                        >
                                            <div style={styles.stackValue}>{s.label}</div>
                                            <div style={styles.stackDesc}>{s.desc}</div>
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* SECTION 4: Street */}
                        <div style={styles.section}>
                            <div style={styles.sectionLabel}>STREET FOCUS</div>
                            <div style={styles.chipRow}>
                                {STREETS.map(s => (
                                    <motion.button
                                        key={s.id}
                                        whileHover={{ scale: 1.08 }}
                                        whileTap={{ scale: 0.92 }}
                                        onClick={() => setStreet(s.id)}
                                        style={{
                                            ...styles.streetChip,
                                            ...(street === s.id ? styles.chipActive : {}),
                                        }}
                                    >
                                        <span>{s.icon}</span>
                                        <span style={styles.streetLabel}>{s.label}</span>
                                    </motion.button>
                                ))}
                            </div>
                        </div>

                        {/* SECTION 4.5: Hand Class Filter */}
                        <div style={styles.section}>
                            <div style={styles.sectionLabel}>HAND CLASS</div>
                            <div style={styles.chipRow}>
                                {[
                                    { id: 'all', label: 'Any Hand' },
                                    { id: 'pocket_pairs', label: 'Pocket Pairs (22-AA)' },
                                    { id: 'suited_connectors', label: 'Suited Connectors (e.g. 87s)' },
                                    { id: 'broadways', label: 'Broadways (AT-AK, KQ, etc)' },
                                    { id: 'suited_aces', label: 'Suited Aces (A2s-A9s)' },
                                ].map(h => (
                                    <motion.button
                                        key={h.id}
                                        whileHover={{ scale: 1.08 }}
                                        whileTap={{ scale: 0.92 }}
                                        onClick={() => setHandClass(h.id)}
                                        style={{
                                            ...styles.chip,
                                            ...(handClass === h.id ? styles.chipActive : {}),
                                        }}
                                    >
                                        {h.label}
                                    </motion.button>
                                ))}
                            </div>
                        </div>

                        {/* SECTION 5: Questions Count */}
                        <div style={styles.section}>
                            <div style={styles.sectionLabel}>HANDS PER SESSION</div>
                            <div style={styles.chipRow}>
                                {[10, 25, 50, 100].map(n => (
                                    <motion.button
                                        key={n}
                                        whileHover={{ scale: 1.08 }}
                                        whileTap={{ scale: 0.92 }}
                                        onClick={() => setQuestionsCount(n)}
                                        style={{
                                            ...styles.chip,
                                            ...(questionsCount === n ? styles.chipActive : {}),
                                        }}
                                    >
                                        {n}
                                    </motion.button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* CONFIG SUMMARY + START BUTTON */}
                    <div style={styles.footer}>
                        <div style={styles.configSummary}>
                            <span style={styles.summaryBadge}>
                                {GAME_TYPES.find(g => g.id === gameType)?.icon} {position} {villainPosition !== 'any' ? `vs ${villainPosition}` : ''}
                            </span>
                            {actionScenario !== 'any' && (
                                <span style={styles.summaryBadge}>{actionScenario}</span>
                            )}
                            <span style={styles.summaryBadge}>
                                {stackDepth} BB
                            </span>
                            <span style={styles.summaryBadge}>
                                {street === 'all' ? '🃏 All' : STREETS.find(s => s.id === street)?.icon + ' ' + street.charAt(0).toUpperCase() + street.slice(1)}
                            </span>
                            <span style={styles.summaryBadge}>
                                {questionsCount} hands
                            </span>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(0, 212, 255, 0.4)' }}
                            whileTap={{ scale: 0.97 }}
                            onClick={handleStart}
                            style={styles.startBtn}
                        >
                            Start Training →
                        </motion.button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
    },
    modal: {
        width: '100%',
        maxWidth: 520,
        maxHeight: '90vh',
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
        borderRadius: 16,
        border: '1px solid rgba(0, 212, 255, 0.15)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 212, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: 0.5,
        fontFamily: "'Inter', -apple-system, sans-serif",
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.05)',
        color: '#94a3b8',
        fontSize: 16,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollArea: {
        flex: 1,
        overflowY: 'auto',
        padding: '12px 20px',
    },
    section: {
        marginBottom: 20,
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: 700,
        color: '#64748b',
        letterSpacing: 1.5,
        marginBottom: 10,
        fontFamily: "'Inter', -apple-system, sans-serif",
    },
    optionRow: {
        display: 'flex',
        gap: 10,
    },
    optionCard: {
        flex: 1,
        padding: '14px 10px',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        transition: 'all 0.2s ease',
    },
    optionCardActive: {
        border: '1px solid rgba(0, 212, 255, 0.5)',
        background: 'rgba(0, 212, 255, 0.08)',
        boxShadow: '0 0 15px rgba(0, 212, 255, 0.15)',
    },
    optionIcon: {
        fontSize: 24,
    },
    optionLabel: {
        fontSize: 13,
        fontWeight: 700,
        color: '#e2e8f0',
    },
    optionDesc: {
        fontSize: 10,
        color: '#64748b',
    },
    chipRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        padding: '8px 16px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    chipActive: {
        border: '1px solid rgba(0, 212, 255, 0.5)',
        background: 'rgba(0, 212, 255, 0.12)',
        color: '#00d4ff',
        boxShadow: '0 0 12px rgba(0, 212, 255, 0.15)',
    },
    stackChip: {
        padding: '8px 14px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        color: '#94a3b8',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        minWidth: 65,
        transition: 'all 0.15s ease',
    },
    stackValue: {
        fontSize: 14,
        fontWeight: 700,
    },
    stackDesc: {
        fontSize: 9,
        opacity: 0.6,
    },
    streetChip: {
        padding: '8px 14px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        color: '#94a3b8',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 0.15s ease',
    },
    streetLabel: {
        fontSize: 13,
        fontWeight: 600,
    },
    footer: {
        padding: '16px 20px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    configSummary: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        justifyContent: 'center',
    },
    summaryBadge: {
        padding: '3px 10px',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.06)',
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: 600,
    },
    startBtn: {
        width: '100%',
        padding: '14px 24px',
        borderRadius: 12,
        border: '1px solid rgba(0, 212, 255, 0.4)',
        background: 'linear-gradient(180deg, rgba(0, 212, 255, 0.2) 0%, rgba(0, 100, 200, 0.15) 100%)',
        color: '#00d4ff',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        letterSpacing: 0.5,
        fontFamily: "'Inter', -apple-system, sans-serif",
        transition: 'all 0.2s ease',
    },
};
