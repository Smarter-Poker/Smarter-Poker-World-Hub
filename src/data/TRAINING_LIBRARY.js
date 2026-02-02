/**
 * 🎮 TRAINING LIBRARY — 100-Game Sovereign Library
 * ═══════════════════════════════════════════════════════════════════════════
 * Complete training game library organized into 5 categories:
 * - MTT (25 games): Tournament tactics
 * - Cash (25 games): Ring game fundamentals
 * - Spins (10 games): Hyper-turbo formats
 * - Psychology (20 games): Mental game mastery
 * - Advanced (20 games): Solver-level concepts
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Game Icons by category/type
export const GAME_ICONS = {
    // MTT Icons
    push_fold: '🎯',
    icm: '📊',
    bubble: '🫧',
    final_table: '🏆',
    pko: '💰',
    satellite: '🎫',
    deep_stack: '📚',
    short_stack: '⚡',
    resteal: '🔄',
    squeeze: '🤏',
    // Cash Icons
    preflop: '♠️',
    cbet: '💥',
    defense: '🛡️',
    sizing: '📏',
    position: '🪑',
    exploit: '🎣',
    bluff: '🃏',
    value: '💎',
    // Spins Icons
    hyper: '⚡',
    jackpot: '🎰',
    heads_up: '👤',
    // Psychology Icons
    tilt: '😤',
    timing: '⏱️',
    discipline: '🧘',
    pressure: '🔥',
    patience: '🐢',
    focus: '🎯',
    // Advanced Icons
    solver: '🤖',
    blocker: '🚫',
    node_lock: '🔒',
    gto: '📐',
    frequency: '📈',
    range: '🎨',
};

// Category definitions with colors
export const CATEGORIES = {
    MTT: { id: 'mtt', name: 'MTT', color: '#FF6B35', icon: '🏆', count: 25 },
    CASH: { id: 'cash', name: 'Cash', color: '#4CAF50', icon: '💵', count: 25 },
    SPINS: { id: 'spins', name: 'Spins', color: '#FFD700', icon: '⚡', count: 10 },
    PSYCHOLOGY: { id: 'psychology', name: 'Psychology', color: '#9C27B0', icon: '🧠', count: 20 },
    ADVANCED: { id: 'advanced', name: 'Advanced', color: '#2196F3', icon: '🤖', count: 20 },
};

// Complete 100-game library
export const TRAINING_LIBRARY = [
    // ═══════════════════════════════════════════════════════════════════════
    // MTT GAMES (25)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'mtt-001', name: 'Push/Fold Mastery', focus: 'Short stack all-in ranges', category: 'MTT', difficulty: 2, icon: '🎯', tags: ['gto', 'math'] },
    { id: 'mtt-002', name: 'ICM Fundamentals', focus: 'Independent chip model basics', category: 'MTT', difficulty: 3, icon: '📊', tags: ['math'] },
    { id: 'mtt-003', name: 'Bubble Pressure', focus: 'Pre-money survival tactics', category: 'MTT', difficulty: 3, icon: '🫧', tags: ['exploitative'] },
    { id: 'mtt-004', name: 'Final Table ICM', focus: 'Pay jump optimization', category: 'MTT', difficulty: 4, icon: '🏆', tags: ['math', 'gto'] },
    { id: 'mtt-005', name: 'PKO Bounty Hunter', focus: 'Bounty chip calculations', category: 'MTT', difficulty: 3, icon: '💰', tags: ['math'] },
    { id: 'mtt-006', name: 'Satellite Survival', focus: 'Extreme ICM discipline', category: 'MTT', difficulty: 4, icon: '🎫', tags: ['gto'] },
    { id: 'mtt-007', name: 'Deep Stack MTT', focus: 'Early tournament strategy', category: 'MTT', difficulty: 2, icon: '📚', tags: ['gto'] },
    { id: 'mtt-008', name: 'Short Stack Ninja', focus: '10-20BB mastery', category: 'MTT', difficulty: 3, icon: '⚡', tags: ['gto', 'math'] },
    { id: 'mtt-009', name: 'Resteal Wars', focus: '3-bet shove defense', category: 'MTT', difficulty: 3, icon: '🔄', tags: ['exploitative'] },
    { id: 'mtt-010', name: 'Squeeze Master', focus: 'Multi-way pressure plays', category: 'MTT', difficulty: 4, icon: '🤏', tags: ['exploitative'] },
    { id: 'mtt-011', name: 'Ante Theft', focus: 'BB ante exploitation', category: 'MTT', difficulty: 2, icon: '💸', tags: ['exploitative'] },
    { id: 'mtt-012', name: 'Big Stack Bully', focus: 'Covering stack pressure', category: 'MTT', difficulty: 3, icon: '🦈', tags: ['exploitative'] },
    { id: 'mtt-013', name: 'Ladder Jump', focus: 'Pay jump patience', category: 'MTT', difficulty: 4, icon: '🪜', tags: ['math', 'gto'] },
    { id: 'mtt-014', name: '3-Max Blitz', focus: 'Final 3 aggression', category: 'MTT', difficulty: 4, icon: '⚔️', tags: ['gto'] },
    { id: 'mtt-015', name: 'Heads Up Duel', focus: '1v1 tournament finale', category: 'MTT', difficulty: 5, icon: '👑', tags: ['gto', 'exploitative'] },
    { id: 'mtt-016', name: 'Chip & Chair', focus: 'Micro-stack comeback', category: 'MTT', difficulty: 3, icon: '🪑', tags: ['math'] },
    { id: 'mtt-017', name: 'Blind Defense MTT', focus: 'Tournament BB play', category: 'MTT', difficulty: 3, icon: '🛡️', tags: ['gto'] },
    { id: 'mtt-018', name: 'Button Warfare', focus: 'BTN open/defend ranges', category: 'MTT', difficulty: 3, icon: '🔘', tags: ['gto'] },
    { id: 'mtt-019', name: 'Stop & Go', focus: 'Delayed shove tactics', category: 'MTT', difficulty: 3, icon: '🚦', tags: ['exploitative'] },
    { id: 'mtt-020', name: 'Multi-way Bounty', focus: 'PKO pot odds overlay', category: 'MTT', difficulty: 4, icon: '💎', tags: ['math'] },
    { id: 'mtt-021', name: 'Check-Shove Power', focus: 'Postflop aggression', category: 'MTT', difficulty: 4, icon: '💪', tags: ['gto'] },
    { id: 'mtt-022', name: 'Clock Management', focus: 'Time bank strategy', category: 'MTT', difficulty: 2, icon: '⏰', tags: ['exploitative'] },
    { id: 'mtt-023', name: 'Registration Edge', focus: 'Late reg advantages', category: 'MTT', difficulty: 2, icon: '📝', tags: ['math'] },
    { id: 'mtt-024', name: 'Triple Barrel', focus: 'MTT bluff sequences', category: 'MTT', difficulty: 4, icon: '🎰', tags: ['exploitative'] },
    { id: 'mtt-025', name: 'Level 10: MTT Champion', focus: 'Full tourney simulation', category: 'MTT', difficulty: 5, icon: '🏅', tags: ['gto', 'math', 'exploitative'] },

    // ═══════════════════════════════════════════════════════════════════════
    // CASH GAMES (25)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'cash-001', name: 'Preflop Blueprint', focus: '6-Max RFI ranges', category: 'CASH', difficulty: 2, icon: '♠️', tags: ['gto'] },
    { id: 'cash-002', name: 'C-Bet Academy', focus: 'Continuation bet sizing', category: 'CASH', difficulty: 2, icon: '💥', tags: ['gto'] },
    { id: 'cash-003', name: 'Defense Matrix', focus: 'Facing aggression', category: 'CASH', difficulty: 3, icon: '🛡️', tags: ['gto'] },
    { id: 'cash-004', name: 'Value Extractor', focus: 'Thin value betting', category: 'CASH', difficulty: 3, icon: '💎', tags: ['gto', 'exploitative'] },
    { id: 'cash-005', name: 'Bluff Catcher', focus: 'Hero call decisions', category: 'CASH', difficulty: 4, icon: '🃏', tags: ['exploitative'] },
    { id: 'cash-006', name: 'Position Power', focus: 'IP vs OOP dynamics', category: 'CASH', difficulty: 2, icon: '🪑', tags: ['gto'] },
    { id: 'cash-007', name: '3-Bet Pots', focus: 'Elevated pot strategy', category: 'CASH', difficulty: 3, icon: '🔺', tags: ['gto'] },
    { id: 'cash-008', name: '4-Bet Wars', focus: 'Pre-flop escalation', category: 'CASH', difficulty: 4, icon: '⚔️', tags: ['gto', 'math'] },
    { id: 'cash-009', name: 'Deep Stack Cash', focus: '200BB+ strategy', category: 'CASH', difficulty: 4, icon: '📚', tags: ['gto'] },
    { id: 'cash-010', name: 'Short Stack Rat', focus: '40BB hit-and-run', category: 'CASH', difficulty: 3, icon: '🐀', tags: ['exploitative'] },
    { id: 'cash-011', name: 'Donk Defense', focus: 'Facing lead bets', category: 'CASH', difficulty: 3, icon: '🫏', tags: ['exploitative'] },
    { id: 'cash-012', name: 'River Decisions', focus: 'Final street mastery', category: 'CASH', difficulty: 4, icon: '🌊', tags: ['gto', 'math'] },
    { id: 'cash-013', name: 'Probe Betting', focus: 'Taking the initiative', category: 'CASH', difficulty: 3, icon: '🔍', tags: ['exploitative'] },
    { id: 'cash-014', name: 'Check-Raise Art', focus: 'Aggression tactics', category: 'CASH', difficulty: 4, icon: '📈', tags: ['gto'] },
    { id: 'cash-015', name: 'Overbetting', focus: 'Polarized big bets', category: 'CASH', difficulty: 4, icon: '💣', tags: ['gto'] },
    { id: 'cash-016', name: 'Multi-way Pots', focus: '3+ player dynamics', category: 'CASH', difficulty: 3, icon: '👥', tags: ['gto'] },
    { id: 'cash-017', name: 'Rake Awareness', focus: 'Rake-adjusted strategy', category: 'CASH', difficulty: 3, icon: '🧮', tags: ['math'] },
    { id: 'cash-018', name: 'Blind vs Blind', focus: 'SB vs BB warfare', category: 'CASH', difficulty: 3, icon: '🥊', tags: ['gto'] },
    { id: 'cash-019', name: 'Straddle Games', focus: 'Extended pot dynamics', category: 'CASH', difficulty: 3, icon: '🦶', tags: ['exploitative'] },
    { id: 'cash-020', name: 'Table Selection', focus: 'Finding soft spots', category: 'CASH', difficulty: 2, icon: '🎯', tags: ['exploitative'] },
    { id: 'cash-021', name: 'Mixed Strategies', focus: 'Frequency execution', category: 'CASH', difficulty: 4, icon: '🎲', tags: ['gto', 'math'] },
    { id: 'cash-022', name: 'Texture Reading', focus: 'Board analysis', category: 'CASH', difficulty: 3, icon: '🔬', tags: ['gto'] },
    { id: 'cash-023', name: 'Equity Denial', focus: 'Protection betting', category: 'CASH', difficulty: 3, icon: '🚫', tags: ['gto'] },
    { id: 'cash-024', name: 'Pot Control', focus: 'Medium strength hands', category: 'CASH', difficulty: 3, icon: '⚖️', tags: ['gto'] },
    { id: 'cash-025', name: 'Level 10: Cash King', focus: 'Full session grind', category: 'CASH', difficulty: 5, icon: '👑', tags: ['gto', 'math', 'exploitative'] },

    // ═══════════════════════════════════════════════════════════════════════
    // SPINS (10)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'spins-001', name: 'Hyper Opener', focus: '3-Max early game', category: 'SPINS', difficulty: 2, icon: '⚡', tags: ['gto'] },
    { id: 'spins-002', name: 'Jackpot Pressure', focus: 'High multiplier play', category: 'SPINS', difficulty: 4, icon: '🎰', tags: ['exploitative'] },
    { id: 'spins-003', name: 'Button Limp', focus: 'Trap strategies', category: 'SPINS', difficulty: 3, icon: '🪤', tags: ['exploitative'] },
    { id: 'spins-004', name: 'SNG Endgame', focus: 'Final 2 battles', category: 'SPINS', difficulty: 3, icon: '🏁', tags: ['gto'] },
    { id: 'spins-005', name: 'Phase Shifting', focus: 'Stack depth transitions', category: 'SPINS', difficulty: 3, icon: '🔄', tags: ['gto', 'math'] },
    { id: 'spins-006', name: 'Limb Trap', focus: 'Limp-call lines', category: 'SPINS', difficulty: 3, icon: '🕳️', tags: ['exploitative'] },
    { id: 'spins-007', name: '50/50 Survival', focus: 'Extreme ICM', category: 'SPINS', difficulty: 4, icon: '⚖️', tags: ['math', 'gto'] },
    { id: 'spins-008', name: 'Aggression Mode', focus: 'Constant pressure', category: 'SPINS', difficulty: 3, icon: '🔥', tags: ['exploitative'] },
    { id: 'spins-009', name: 'Chip Lead Lock', focus: 'Protecting the lead', category: 'SPINS', difficulty: 3, icon: '🔒', tags: ['gto'] },
    { id: 'spins-010', name: 'Level 10: Spin Master', focus: 'Full spin simulation', category: 'SPINS', difficulty: 5, icon: '🌀', tags: ['gto', 'math', 'exploitative'] },

    // ═══════════════════════════════════════════════════════════════════════
    // PSYCHOLOGY (20)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'psy-001', name: 'Tilt Control', focus: 'Emotional regulation', category: 'PSYCHOLOGY', difficulty: 3, icon: '😤', tags: [] },
    { id: 'psy-002', name: 'Timing Discipline', focus: 'Consistent action speed', category: 'PSYCHOLOGY', difficulty: 2, icon: '⏱️', tags: [] },
    { id: 'psy-003', name: 'Cooler Cage', focus: 'Bad beat resilience', category: 'PSYCHOLOGY', difficulty: 4, icon: '🥶', tags: [] },
    { id: 'psy-004', name: 'Pressure Chamber', focus: 'High stakes decisions', category: 'PSYCHOLOGY', difficulty: 4, icon: '🔥', tags: [] },
    { id: 'psy-005', name: 'Patience Master', focus: 'Waiting for spots', category: 'PSYCHOLOGY', difficulty: 3, icon: '🐢', tags: [] },
    { id: 'psy-006', name: 'Focus Flow', focus: 'Concentration drills', category: 'PSYCHOLOGY', difficulty: 2, icon: '🎯', tags: [] },
    { id: 'psy-007', name: 'Result Detachment', focus: 'Process over outcome', category: 'PSYCHOLOGY', difficulty: 4, icon: '🧘', tags: [] },
    { id: 'psy-008', name: 'Confidence Builder', focus: 'Trust your reads', category: 'PSYCHOLOGY', difficulty: 3, icon: '💪', tags: [] },
    { id: 'psy-009', name: 'Fear Eraser', focus: 'Bold decision making', category: 'PSYCHOLOGY', difficulty: 3, icon: '🦁', tags: [] },
    { id: 'psy-010', name: 'Ego Killer', focus: 'Humble learning', category: 'PSYCHOLOGY', difficulty: 3, icon: '🪞', tags: [] },
    { id: 'psy-011', name: 'Session Stamina', focus: 'Long session focus', category: 'PSYCHOLOGY', difficulty: 3, icon: '🏃', tags: [] },
    { id: 'psy-012', name: 'Snap Decision', focus: 'Instinct training', category: 'PSYCHOLOGY', difficulty: 3, icon: '⚡', tags: [] },
    { id: 'psy-013', name: 'Tell Blindness', focus: 'Ignoring false reads', category: 'PSYCHOLOGY', difficulty: 3, icon: '🙈', tags: [] },
    { id: 'psy-014', name: 'Bankroll Mind', focus: 'Money management', category: 'PSYCHOLOGY', difficulty: 2, icon: '💰', tags: ['math'] },
    { id: 'psy-015', name: 'Winners Tilt', focus: 'Staying sharp ahead', category: 'PSYCHOLOGY', difficulty: 3, icon: '🎢', tags: [] },
    { id: 'psy-016', name: 'Variance Zen', focus: 'Accepting swings', category: 'PSYCHOLOGY', difficulty: 4, icon: '☯️', tags: ['math'] },
    { id: 'psy-017', name: 'Study Habits', focus: 'Effective learning', category: 'PSYCHOLOGY', difficulty: 2, icon: '📖', tags: [] },
    { id: 'psy-018', name: 'Table Image', focus: 'Perception awareness', category: 'PSYCHOLOGY', difficulty: 3, icon: '🎭', tags: ['exploitative'] },
    { id: 'psy-019', name: 'Autopilot Escape', focus: 'Staying present', category: 'PSYCHOLOGY', difficulty: 3, icon: '✈️', tags: [] },
    { id: 'psy-020', name: 'Level 10: Mind Master', focus: 'Full mental game', category: 'PSYCHOLOGY', difficulty: 5, icon: '🧠', tags: [] },

    // ═══════════════════════════════════════════════════════════════════════
    // ADVANCED (20)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'adv-001', name: 'Solver Mimicry', focus: 'GTO execution', category: 'ADVANCED', difficulty: 4, icon: '🤖', tags: ['gto'] },
    { id: 'adv-002', name: 'Blocker Logic', focus: 'Card removal effects', category: 'ADVANCED', difficulty: 4, icon: '🚫', tags: ['gto', 'math'] },
    { id: 'adv-003', name: 'Node Locking', focus: 'Exploitative trees', category: 'ADVANCED', difficulty: 5, icon: '🔒', tags: ['exploitative'] },
    { id: 'adv-004', name: 'Range Construction', focus: 'Building strategies', category: 'ADVANCED', difficulty: 4, icon: '🏗️', tags: ['gto'] },
    { id: 'adv-005', name: 'Frequency Math', focus: 'Mixed strategy %', category: 'ADVANCED', difficulty: 4, icon: '📊', tags: ['gto', 'math'] },
    { id: 'adv-006', name: 'EV Calculations', focus: 'Expected value math', category: 'ADVANCED', difficulty: 4, icon: '🧮', tags: ['math'] },
    { id: 'adv-007', name: 'Indifference Theory', focus: 'Making villains neutral', category: 'ADVANCED', difficulty: 5, icon: '⚖️', tags: ['gto', 'math'] },
    { id: 'adv-008', name: 'Range Advantage', focus: 'Equity distribution', category: 'ADVANCED', difficulty: 4, icon: '📈', tags: ['gto'] },
    { id: 'adv-009', name: 'Nut Advantage', focus: 'Polarization spots', category: 'ADVANCED', difficulty: 4, icon: '🥜', tags: ['gto'] },
    { id: 'adv-010', name: 'Board Coverage', focus: 'Range composition', category: 'ADVANCED', difficulty: 4, icon: '🎨', tags: ['gto'] },
    { id: 'adv-011', name: 'SPR Mastery', focus: 'Stack-to-pot ratios', category: 'ADVANCED', difficulty: 3, icon: '📐', tags: ['math'] },
    { id: 'adv-012', name: 'MDF Defender', focus: 'Minimum defense', category: 'ADVANCED', difficulty: 4, icon: '🛡️', tags: ['gto', 'math'] },
    { id: 'adv-013', name: 'Combo Counting', focus: 'Hand combinations', category: 'ADVANCED', difficulty: 3, icon: '🔢', tags: ['math'] },
    { id: 'adv-014', name: 'Bet Sizing Theory', focus: 'Geometric sizing', category: 'ADVANCED', difficulty: 4, icon: '📏', tags: ['gto', 'math'] },
    { id: 'adv-015', name: 'Population Reads', focus: 'Pool tendencies', category: 'ADVANCED', difficulty: 3, icon: '👥', tags: ['exploitative'] },
    { id: 'adv-016', name: 'Exploit Ladder', focus: 'Deviation strategy', category: 'ADVANCED', difficulty: 4, icon: '🪜', tags: ['exploitative'] },
    { id: 'adv-017', name: 'Capped Ranges', focus: 'Playing condensed', category: 'ADVANCED', difficulty: 4, icon: '📦', tags: ['gto'] },
    { id: 'adv-018', name: 'Polarity Index', focus: 'Range splitting', category: 'ADVANCED', difficulty: 5, icon: '🧲', tags: ['gto'] },
    { id: 'adv-019', name: 'Solver Scripts', focus: 'Sim interpretation', category: 'ADVANCED', difficulty: 5, icon: '💻', tags: ['gto'] },
    { id: 'adv-020', name: 'Level 10: GTO Apex', focus: 'Ultimate theory test', category: 'ADVANCED', difficulty: 5, icon: '🏛️', tags: ['gto', 'math', 'exploitative'] },
];

// Helper functions

// Convert a name to a slug (e.g., "Blind vs Blind" -> "blind-vs-blind")
const toSlug = (name) => name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const getGamesByCategory = (category) =>
    TRAINING_LIBRARY.filter(g => g.category === category);

export const getGameById = (id) =>
    TRAINING_LIBRARY.find(g => g.id === id);

// Find game by slug (e.g., "blind-vs-blind")
export const getGameBySlug = (slug) =>
    TRAINING_LIBRARY.find(g => toSlug(g.name) === slug || g.id === slug);

export const getGamesByTag = (tag) =>
    TRAINING_LIBRARY.filter(g => g.tags?.includes(tag));

export const getBossGames = () =>
    TRAINING_LIBRARY.filter(g => g.name.toLowerCase().includes('boss'));

export const getGamesByDifficulty = (min, max) =>
    TRAINING_LIBRARY.filter(g => g.difficulty >= min && g.difficulty <= max);

// Lane definitions for the training hub
export const TRAINING_LANES = [
    {
        id: 'featured',
        title: 'FEATURED TODAY',
        icon: '⭐',
        games: () => TRAINING_LIBRARY.slice(0, 4), // Dynamic selection
        special: true,
    },
    {
        id: 'mtt',
        title: 'MTT MASTERY',
        icon: '🏆',
        color: '#FF6B35',
        games: () => getGamesByCategory('MTT'),
    },
    {
        id: 'cash',
        title: 'CASH GAME GRIND',
        icon: '💵',
        color: '#4CAF50',
        games: () => getGamesByCategory('CASH'),
    },
    {
        id: 'spins',
        title: 'SPINS & SNGS',
        icon: '⚡',
        color: '#FFD700',
        games: () => getGamesByCategory('SPINS'),
    },
    {
        id: 'psychology',
        title: 'MENTAL GAME',
        icon: '🧠',
        color: '#9C27B0',
        games: () => getGamesByCategory('PSYCHOLOGY'),
    },
    {
        id: 'advanced',
        title: 'ADVANCED THEORY',
        icon: '🤖',
        color: '#2196F3',
        games: () => getGamesByCategory('ADVANCED'),
    },
];

export default TRAINING_LIBRARY;
