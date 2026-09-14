/**
 * TRAINER CONFIG MODAL — GTO Wizard-Style Training Setup
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Lets users configure their training session before starting:
 * - Game Type: Cash / MTT / Spins
 * - Position: BTN / SB / BB / CO / HJ / UTG / MP
 * - Stack Depth: 20-200BB
 * - Street Focus: Flop / Turn / River / All
 *
 * The config gets passed to DeterministicGTOEngine to filter solver data.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Available configurations based on actual solver data in database
const GAME_TYPES = [
    { id: 'cash', label: 'Cash Game', icon: '$', desc: 'No Limit Hold\'em 6-Max', pioTypes: ['hu_cash', 'postflop_complete'] },
    { id: 'mtt', label: 'Tournament', icon: 'T', desc: 'MTT / Multi-Table', pioTypes: ['mtt_6max_icm', 'mtt_9max_icm', 'mtt_6max_chipev'] },
    { id: 'spins', label: 'Spins', icon: 'S', desc: 'Spin & Go / HyperTurbo', pioTypes: ['turn_spin'] },
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
    { id: 'all', label: 'All Streets', icon: '◇', desc: 'Random street each hand' },
    { id: 'flop', label: 'Flop', icon: '●', desc: '3 community cards' },
    { id: 'turn', label: 'Turn', icon: '●', desc: '4 community cards' },
    { id: 'river', label: 'River', icon: '●', desc: '5 community cards' },
];

// GTO Wizard Difficulty Modes
//
// The third id is 'exact', NOT 'standard'. Two vocabularies feed
// toEngineDifficulty: this modal's button-set names and SessionSetupModal's
// grading tiers (beginner/standard/expert). They collided on the word
// 'standard', which the mapping resolves to the MIDDLE tier (GROUPED) because
// that is what SessionSetupModal means by it. So picking the card below that
// promises "Exact Sizings, up to 9 buttons" delivered grouped buckets
// instead — and since 'standard' is also this modal's default, exact sizings
// were unreachable from the whole screen. 'exact' has always mapped to
// DIFFICULTY.STANDARD; using it makes the label true.
const DIFFICULTY_MODES = [
    { id: 'simple', label: 'Simple', icon: '1', desc: 'Bet/Check/Fold', detail: '3 buttons max - learn basic decisions' },
    { id: 'grouped', label: 'Grouped', icon: '2', desc: 'Small/Medium/Large/Overbet', detail: '4-5 buttons - sizing categories' },
    { id: 'exact', label: 'Standard', icon: '3', desc: 'Exact Sizings', detail: 'Up to 9 buttons - real solver sizings' },
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
    const [difficultyMode, setDifficultyMode] = useState('exact');
    const [timerEnabled, setTimerEnabled] = useState(false);
    const [timerSeconds, setTimerSeconds] = useState(30);
    const [spotType, setSpotType] = useState('any');
    const [boardTexture, setBoardTexture] = useState('any');
    const modalRef = useRef(null);
    const closeRef = useRef(null);
    const previousFocusRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        previousFocusRef.current = document.activeElement;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose?.();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(modalRef.current?.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ) || []);
            if (!focusable.length) {
                event.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 30);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.clearTimeout(focusTimer);
            const previous = previousFocusRef.current;
            if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
        };
    }, [isOpen, onClose]);

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
            spotType !== 'any' ? spotType : null,
            boardTexture !== 'any' ? boardTexture : null,
            handClass === 'all' ? null : handClass
        ].filter(Boolean).join(' | ');

        onStart({
            gameType,
            position,
            villainPosition: villainPosition === 'any' ? null : villainPosition,
            actionScenario: actionScenario === 'any' ? null : actionScenario,
            stackDepth,
            street: street === 'all' ? null : street,
            spotType: spotType === 'any' ? null : spotType,
            boardTexture: boardTexture === 'any' ? null : boardTexture,
            handClass: handClass === 'all' ? null : handClass,
            questionsCount,
            difficultyMode, // GTO Wizard-style: simple | grouped | standard
            timerEnabled,
            timerSeconds: timerEnabled ? timerSeconds : 0,
            pioGameTypes: gameTypeConfig?.pioTypes || ['hu_cash'],
            pioStackDepth: stackDepth,
            label: filters,
        });
    }, [gameType, position, villainPosition, actionScenario, stackDepth, street, spotType, boardTexture, handClass, questionsCount, difficultyMode, timerEnabled, timerSeconds, onStart]);

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
                    ref={modalRef}
                    className="sp-trainer-config-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="sp-trainer-config-title"
                    initial={{ scale: 0.9, opacity: 0, y: 30 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 30 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    style={{ ...styles.modal, maxHeight: '95vh' }}
                >
                    {/* Header */}
                    <div style={styles.header}>
                        <button ref={closeRef} type="button" aria-label="Close Trainer Configuration" onClick={onClose} style={styles.closeBtn}>✕</button>
                        <div id="sp-trainer-config-title" style={styles.headerTitle}>Configure Trainer</div>
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
                                        aria-pressed={gameType === gt.id}
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
                        <div className="sp-trainer-config-row" style={{ display: 'flex', gap: 20 }}>
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
                                            aria-pressed={position === pos}
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
                                            aria-pressed={villainPosition === pos}
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
                        <div className="sp-trainer-config-row" style={{ display: 'flex', gap: 20 }}>
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
                                            aria-pressed={actionScenario === act.id}
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
                                            aria-pressed={stackDepth === s.value}
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
                                        aria-pressed={street === s.id}
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

                        {/* SECTION: Difficulty Mode (GTO Wizard-style) */}
                        <div style={styles.section}>
                            <div style={styles.sectionLabel}>DIFFICULTY MODE</div>
                            <div style={styles.optionRow}>
                                {DIFFICULTY_MODES.map(dm => (
                                    <motion.button
                                        key={dm.id}
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => setDifficultyMode(dm.id)}
                                        aria-pressed={difficultyMode === dm.id}
                                        style={{
                                            ...styles.optionCard,
                                            ...(difficultyMode === dm.id ? styles.optionCardActive : {}),
                                        }}
                                    >
                                        <span style={styles.optionIcon}>{dm.icon}</span>
                                        <span style={styles.optionLabel}>{dm.label}</span>
                                        <span style={styles.optionDesc}>{dm.desc}</span>
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
                                        aria-pressed={handClass === h.id}
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

                        {/* SECTION: Spot Type (Postflop) */}
                        {(street === 'flop' || street === 'turn' || street === 'river') && (
                            <div style={styles.section}>
                                <div style={styles.sectionLabel}>SPOT TYPE</div>
                                <div style={styles.chipRow}>
                                    {[
                                        { id: 'any', label: 'Any Spot' },
                                        { id: 'cbet', label: 'C-Bet' },
                                        { id: 'checkraise', label: 'Check-Raise' },
                                        { id: 'facing_bet', label: 'Facing Bet' },
                                        { id: 'probe', label: 'Probe Bet' },
                                        { id: 'donk', label: 'Donk Bet' },
                                    ].map(s => (
                                        <motion.button
                                            key={s.id}
                                            whileHover={{ scale: 1.08 }}
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() => setSpotType(s.id)}
                                            aria-pressed={spotType === s.id}
                                            style={{
                                                ...styles.chip,
                                                ...(spotType === s.id ? styles.chipActive : {}),
                                            }}
                                        >
                                            {s.label}
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* SECTION: Board Texture */}
                        {(street === 'flop' || street === 'turn' || street === 'river') && (
                            <div style={styles.section}>
                                <div style={styles.sectionLabel}>BOARD TEXTURE</div>
                                <div style={styles.chipRow}>
                                    {[
                                        { id: 'any', label: 'Any Board' },
                                        { id: 'dry_rainbow', label: 'Dry Rainbow' },
                                        { id: 'monotone', label: 'Monotone' },
                                        { id: 'two_tone', label: 'Two-Tone' },
                                        { id: 'paired', label: 'Paired' },
                                        { id: 'connected', label: 'Connected' },
                                        { id: 'broadway', label: 'Broadway' },
                                    ].map(b => (
                                        <motion.button
                                            key={b.id}
                                            whileHover={{ scale: 1.08 }}
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() => setBoardTexture(b.id)}
                                            aria-pressed={boardTexture === b.id}
                                            style={{
                                                ...styles.chip,
                                                ...(boardTexture === b.id ? styles.chipActive : {}),
                                            }}
                                        >
                                            {b.label}
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        )}

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
                                        aria-pressed={questionsCount === n}
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

                        {/* SECTION 6: Timer */}
                        <div style={styles.section}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={styles.sectionLabel}>DECISION TIMER</div>
                                <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => setTimerEnabled(!timerEnabled)}
                                    aria-pressed={timerEnabled}
                                    style={{
                                        padding: '2px 10px', borderRadius: 12,
                                        fontSize: 12, fontWeight: 700,
                                        border: timerEnabled ? '1px solid rgba(0,212,255,0.5)' : '1px solid rgba(255,255,255,0.15)',
                                        background: timerEnabled ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.05)',
                                        color: timerEnabled ? '#00d4ff' : '#64748b',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {timerEnabled ? 'ON' : 'OFF'}
                                </motion.button>
                            </div>
                            {timerEnabled && (
                                <div style={styles.chipRow}>
                                    {[15, 30, 45, 60].map(s => (
                                        <motion.button
                                            key={s}
                                            whileHover={{ scale: 1.08 }}
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() => setTimerSeconds(s)}
                                            aria-pressed={timerSeconds === s}
                                            style={{
                                                ...styles.chip,
                                                ...(timerSeconds === s ? styles.chipActive : {}),
                                            }}
                                        >
                                            {s}s
                                        </motion.button>
                                    ))}
                                </div>
                            )}
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
                            {spotType !== 'any' && (
                                <span style={styles.summaryBadge}>{spotType}</span>
                            )}
                            {boardTexture !== 'any' && (
                                <span style={styles.summaryBadge}>{boardTexture}</span>
                            )}
                            <span style={styles.summaryBadge}>
                                {stackDepth} BB
                            </span>
                            <span style={styles.summaryBadge}>
                                {street === 'all' ? '◇ All' : STREETS.find(s => s.id === street)?.icon + ' ' + street.charAt(0).toUpperCase() + street.slice(1)}
                            </span>
                            <span style={styles.summaryBadge}>
                                {questionsCount} Hands
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
                    <style jsx global>{`
                        .sp-trainer-config-modal button:focus-visible {
                            outline: 3px solid #8feaff !important;
                            outline-offset: 3px;
                        }
                        @media (max-width: 768px) {
                            .sp-trainer-config-row {
                                flex-direction: column;
                                gap: 0 !important;
                            }
                            .sp-trainer-config-modal {
                                border-left: 0 !important;
                                border-right: 0 !important;
                            }
                        }
                        @media (prefers-reduced-motion: reduce) {
                            .sp-trainer-config-modal,
                            .sp-trainer-config-modal * {
                                scroll-behavior: auto !important;
                                transition-duration: 0.01ms !important;
                            }
                        }
                    `}</style>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STYLES
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
const styles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(circle at 50% 10%, rgba(16, 105, 145, .28), transparent 46%), rgba(0, 5, 10, .94)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 0,
    },
    modal: {
        width: '100%',
        maxWidth: 960,
        height: '100%',
        background: 'linear-gradient(145deg, rgba(24, 48, 63, .99), rgba(2, 10, 17, .995) 32%, rgba(7, 24, 34, .995) 75%, rgba(1, 7, 12, .995))',
        borderLeft: '1px solid rgba(151, 230, 255, .55)',
        borderRight: '1px solid rgba(151, 230, 255, .34)',
        boxShadow: '0 30px 90px rgba(0,0,0,.78), inset 0 1px 0 rgba(255,255,255,.22), inset 0 -2px 0 rgba(0,0,0,.88)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid rgba(137,224,255,.38)',
        background: 'linear-gradient(180deg, rgba(50,83,101,.88), rgba(5,18,27,.96) 62%, rgba(1,8,14,.98))',
        boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 10px 30px rgba(0,0,0,.38)',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: 0.5,
        fontFamily: "'Inter', -apple-system, sans-serif",
    },
    closeBtn: {
        width: 44,
        height: 44,
        borderRadius: 0,
        border: '1px solid rgba(151,230,255,.35)',
        background: 'linear-gradient(180deg, rgba(49,78,94,.9), rgba(3,13,20,.98))',
        color: '#d8f7ff',
        fontSize: 18,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollArea: {
        flex: 1,
        overflowY: 'auto',
        padding: '20px clamp(14px, 4vw, 32px)',
    },
    section: {
        marginBottom: 20,
    },
    sectionLabel: {
        fontSize: 12,
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
        borderRadius: 0,
        border: '1px solid rgba(119,185,211,.32)',
        background: 'linear-gradient(145deg, rgba(35,61,75,.9), rgba(4,14,21,.98) 62%, rgba(10,29,40,.96))',
        boxShadow: 'inset 0 1px rgba(255,255,255,.14), inset 0 -2px rgba(0,0,0,.65), 0 10px 22px rgba(0,0,0,.25)',
        minWidth: 140,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        transition: 'all 0.2s ease',
    },
    optionCardActive: {
        border: '1px solid #8feaff',
        background: 'linear-gradient(180deg, rgba(49,176,218,.48), rgba(4,45,65,.9))',
        boxShadow: 'inset 0 1px rgba(255,255,255,.32), 0 0 22px rgba(48,200,255,.2)',
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
        fontSize: 12,
        color: '#64748b',
    },
    chipRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        padding: '8px 16px',
        minHeight: 44,
        borderRadius: 0,
        border: '1px solid rgba(119,185,211,.3)',
        background: 'linear-gradient(180deg, rgba(31,54,67,.94), rgba(3,13,20,.98))',
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    chipActive: {
        border: '1px solid #8feaff',
        background: 'linear-gradient(180deg, rgba(45,156,194,.5), rgba(3,45,65,.94))',
        color: '#e5fbff',
        boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 0 16px rgba(40,198,255,.14)',
    },
    stackChip: {
        padding: '8px 14px',
        minHeight: 48,
        borderRadius: 0,
        border: '1px solid rgba(119,185,211,.3)',
        background: 'linear-gradient(180deg, rgba(31,54,67,.94), rgba(3,13,20,.98))',
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
        fontSize: 12,
        opacity: 0.6,
    },
    streetChip: {
        padding: '8px 14px',
        minHeight: 44,
        borderRadius: 0,
        border: '1px solid rgba(119,185,211,.3)',
        background: 'linear-gradient(180deg, rgba(31,54,67,.94), rgba(3,13,20,.98))',
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
        padding: '20px 32px',
        borderTop: '1px solid rgba(137,224,255,.3)',
        background: 'linear-gradient(180deg, rgba(14,34,46,.98), rgba(2,10,16,.99))',
        boxShadow: '0 -12px 30px rgba(0,0,0,.32), inset 0 1px rgba(255,255,255,.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
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
        fontSize: 12,
        fontWeight: 600,
    },
    startBtn: {
        width: '100%',
        padding: '16px 24px',
        borderRadius: 0,
        border: '1px solid #b9f5ff',
        background: 'linear-gradient(180deg, #dffbff 0%, #39caef 16%, #087ba4 56%, #02364e 100%)',
        color: '#00131e',
        fontSize: 16,
        fontWeight: 800,
        cursor: 'pointer',
        letterSpacing: 0.5,
        fontFamily: "'Inter', -apple-system, sans-serif",
        transition: 'all 0.2s ease',
        boxShadow: 'inset 0 1px #fff, inset 0 -3px rgba(0,0,0,.45), 0 12px 28px rgba(0,163,216,.3)',
        textShadow: '0 1px rgba(255,255,255,.45)',
    },
};
