/**
 * 🎮 MISSION CONTROL TRAINING HUB
 * 
 * The command center for all training modules.
 * Dynamically renders game cards from GameContentFactory.
 * Features:
 * - Daily Challenge Hero Section
 * - Neon Filter Pills with real-time filtering
 * - 3D Game Cards with hover effects
 * - Mission Briefing Modal
 * - Netflix-style category rails
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { GAMES_LIST, getGamesByCategory, getGamesByTag, type GameDefinition } from '../../lib/MasterGameLibrary';
import { GameContentFactory } from '../../lib/GameContentFactory';
import { UniversalTrainingTable } from './UniversalTrainingTable';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type FilterCategory = 'ALL' | 'TOURNAMENTS' | 'CASH GAMES' | 'SIT N GO\'S' | 'DRILLS' | 'ADVANCED';

interface DailyChallenge {
    game: GameDefinition;
    xpMultiplier: number;
    requiredHands: number;
    passThreshold: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const FILTER_OPTIONS: FilterCategory[] = [
    'ALL',
    'TOURNAMENTS',
    'CASH GAMES',
    'SIT N GO\'S',
    'DRILLS',
    'ADVANCED'
];

const FILTER_MAPPING: Record<FilterCategory, string[]> = {
    'ALL': [],
    'TOURNAMENTS': ['MTT', 'PKO', 'Satellite'],
    'CASH GAMES': ['Cash'],
    'SIT N GO\'S': ['Spin_Go', 'HeadsUp_SNG', 'SitAndGo'],
    'DRILLS': ['Drill'],
    'ADVANCED': ['advanced', 'expert']
};

// S.P. Brand Colors
const COLORS = {
    orange: '#f59e0b',
    orangeGlow: 'rgba(245, 158, 11, 0.5)',
    cyan: '#00d4ff',
    cyanGlow: 'rgba(0, 212, 255, 0.3)',
    gold: '#FFD700',
    goldGlow: 'rgba(255, 215, 0, 0.4)',
    darkBg: '#0a0a1a',
    cardBg: 'rgba(20, 20, 40, 0.8)',
    borderDim: 'rgba(255, 255, 255, 0.1)'
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function TrainingHub() {
    // State
    const [activeFilter, setActiveFilter] = useState<FilterCategory>('ALL');
    const [selectedGame, setSelectedGame] = useState<GameDefinition | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showBriefing, setShowBriefing] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Get all games from library
    const allGames = useMemo(() => Object.values(GAMES_LIST), []);

    // Daily challenges (featured games)
    const dailyChallenges = useMemo((): DailyChallenge[] => {
        // Pick first 3 games as daily challenges
        const featured = allGames.slice(0, 3);
        return featured.map((game, index) => ({
            game,
            xpMultiplier: 2.5 - (index * 0.5), // 2.5x, 2.0x, 1.5x
            requiredHands: 20,
            passThreshold: 85 - (index * 5) // 85%, 80%, 75%
        }));
    }, [allGames]);

    // Filter games based on active filter
    const filteredGames = useMemo(() => {
        if (activeFilter === 'ALL') return allGames;

        const filterCategories = FILTER_MAPPING[activeFilter];
        if (!filterCategories.length) return allGames;

        return allGames.filter(game => {
            // Check category match
            if (filterCategories.includes(game.category)) return true;
            // Check tag match
            if (game.tags?.some(tag => filterCategories.includes(tag))) return true;
            // Check difficulty for advanced
            if (activeFilter === 'ADVANCED' && game.difficulty.level >= 4) return true;
            return false;
        });
    }, [allGames, activeFilter]);

    // Group games by category for rails
    const gameRails = useMemo(() => {
        const mttGames = filteredGames.filter(g =>
            g.category === 'MTT' || g.category === 'PKO' || g.category === 'Satellite'
        );
        const cashGames = filteredGames.filter(g => g.category === 'Cash');
        const drillGames = filteredGames.filter(g => g.category === 'Drill');
        const sngGames = filteredGames.filter(g =>
            g.category === 'Spin_Go' || g.category === 'HeadsUp_SNG'
        );

        return [
            { title: 'MTT Mastery', games: mttGames, color: COLORS.gold },
            { title: 'Cash Game Grind', games: cashGames, color: COLORS.cyan },
            { title: 'Skill Drills', games: drillGames, color: COLORS.orange },
            { title: 'Sit & Go Specialist', games: sngGames, color: '#a855f7' }
        ].filter(rail => rail.games.length > 0);
    }, [filteredGames]);

    // Hover sound effect
    const playHoverSound = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.volume = 0.2;
            audioRef.current.play().catch(() => { });
        }
    }, []);

    // Launch game
    const launchGame = useCallback((game: GameDefinition) => {
        setSelectedGame(game);
        setShowBriefing(true);
    }, []);

    const startGame = useCallback(() => {
        setShowBriefing(false);
        setIsPlaying(true);
    }, []);

    const exitGame = useCallback(() => {
        setIsPlaying(false);
        setSelectedGame(null);
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER: Playing State
    // ═══════════════════════════════════════════════════════════════════════
    if (isPlaying && selectedGame) {
        return (
            <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
                <button
                    onClick={exitGame}
                    style={{
                        position: 'absolute',
                        top: '16px',
                        left: '16px',
                        zIndex: 10000,
                        padding: '8px 16px',
                        background: 'rgba(0,0,0,0.8)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '8px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    ← Exit to Hub
                </button>
                <UniversalTrainingTable
                    gameId={selectedGame.id}
                    onComplete={(correct, xp, diamonds) => {
                        console.log('Game complete:', { correct, xp, diamonds });
                    }}
                />
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER: Main Hub
    // ═══════════════════════════════════════════════════════════════════════
    return (
        <div style={{
            minHeight: '100vh',
            background: `linear-gradient(180deg, ${COLORS.darkBg}, #1a1a2e)`,
            color: '#fff',
            paddingBottom: '60px'
        }}>
            {/* Hover Sound */}
            <audio ref={audioRef} src="/audio/hover_tick.mp3" preload="auto" />

            {/* ═══ HERO SECTION: Daily Challenge ═══ */}
            <DailyHeroSection
                challenge={dailyChallenges[0]}
                onPlay={() => launchGame(dailyChallenges[0].game)}
            />

            {/* ═══ NEON FILTER PILLS ═══ */}
            <div style={{
                padding: '24px',
                display: 'flex',
                justifyContent: 'center',
                gap: '8px',
                flexWrap: 'wrap'
            }}>
                {FILTER_OPTIONS.map(filter => (
                    <FilterPill
                        key={filter}
                        label={filter}
                        isActive={activeFilter === filter}
                        onClick={() => setActiveFilter(filter)}
                    />
                ))}
            </div>

            {/* ═══ TODAY'S DAILY CHALLENGES ═══ */}
            <section style={{ padding: '0 24px', marginBottom: '48px' }}>
                <SectionHeader title="Today's Daily Challenges" emoji="🎯" />
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '24px',
                    marginTop: '16px'
                }}>
                    <AnimatePresence mode="popLayout">
                        {dailyChallenges.map((challenge, index) => (
                            <motion.div
                                key={challenge.game.id}
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ delay: index * 0.1 }}
                            >
                                <GameCard
                                    game={challenge.game}
                                    isDaily={true}
                                    xpBonus={challenge.xpMultiplier}
                                    onHover={playHoverSound}
                                    onClick={() => launchGame(challenge.game)}
                                />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </section>

            {/* ═══ CATEGORY RAILS ═══ */}
            <LayoutGroup>
                <AnimatePresence mode="popLayout">
                    {gameRails.map((rail, railIndex) => (
                        <motion.section
                            key={rail.title}
                            layout
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ delay: railIndex * 0.1 }}
                            style={{ padding: '0 24px', marginBottom: '40px' }}
                        >
                            <SectionHeader
                                title={rail.title}
                                color={rail.color}
                                count={rail.games.length}
                            />
                            <div style={{
                                display: 'flex',
                                gap: '20px',
                                overflowX: 'auto',
                                paddingBottom: '16px',
                                marginTop: '16px',
                                scrollSnapType: 'x mandatory'
                            }}>
                                {rail.games.map((game, index) => (
                                    <motion.div
                                        key={game.id}
                                        layout
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        style={{ scrollSnapAlign: 'start', flexShrink: 0 }}
                                    >
                                        <GameCard
                                            game={game}
                                            isDaily={false}
                                            onHover={playHoverSound}
                                            onClick={() => launchGame(game)}
                                        />
                                    </motion.div>
                                ))}
                            </div>
                        </motion.section>
                    ))}
                </AnimatePresence>
            </LayoutGroup>

            {/* ═══ MISSION BRIEFING MODAL ═══ */}
            <AnimatePresence>
                {showBriefing && selectedGame && (
                    <MissionBriefingModal
                        game={selectedGame}
                        onStart={startGame}
                        onClose={() => setShowBriefing(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Daily Hero Section - Featured game with cinematic presentation
 */
function DailyHeroSection({
    challenge,
    onPlay
}: {
    challenge: DailyChallenge;
    onPlay: () => void;
}) {
    return (
        <div style={{
            position: 'relative',
            height: '400px',
            background: `linear-gradient(135deg, ${COLORS.darkBg}, #1a1a3a)`,
            overflow: 'hidden',
            borderBottom: `1px solid ${COLORS.orangeGlow}`
        }}>
            {/* Background glow effects */}
            <div style={{
                position: 'absolute',
                top: '-50%',
                left: '20%',
                width: '60%',
                height: '200%',
                background: `radial-gradient(ellipse, ${COLORS.orangeGlow} 0%, transparent 60%)`,
                opacity: 0.3
            }} />

            {/* Content */}
            <div style={{
                position: 'relative',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 60px',
                maxWidth: '1400px',
                margin: '0 auto'
            }}>
                {/* Left: Text Content */}
                <div style={{ maxWidth: '550px' }}>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: COLORS.orange,
                            textTransform: 'uppercase',
                            letterSpacing: '2px',
                            marginBottom: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: COLORS.orange,
                            animation: 'pulse 2s infinite'
                        }} />
                        TODAY'S DAILY CHALLENGE
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        style={{
                            fontSize: '48px',
                            fontWeight: 800,
                            margin: 0,
                            background: `linear-gradient(135deg, #fff, ${COLORS.orange})`,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}
                    >
                        {challenge.game.name}
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        style={{
                            fontSize: '18px',
                            color: '#aaa',
                            margin: '16px 0 24px',
                            lineHeight: 1.6
                        }}
                    >
                        {challenge.game.description} • {challenge.requiredHands} Hands • {challenge.passThreshold}% to Pass
                    </motion.p>

                    <motion.button
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onPlay}
                        style={{
                            padding: '16px 40px',
                            background: `linear-gradient(135deg, ${COLORS.orange}, #ea580c)`,
                            border: 'none',
                            borderRadius: '12px',
                            color: '#fff',
                            fontSize: '18px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: `0 0 30px ${COLORS.orangeGlow}`,
                            animation: 'pulse-glow 2s infinite'
                        }}
                    >
                        PLAY NOW • ×{challenge.xpMultiplier} XP
                    </motion.button>
                </div>

                {/* Right: 3D Card Preview */}
                <motion.div
                    initial={{ opacity: 0, x: 50, rotateY: -15 }}
                    animate={{ opacity: 1, x: 0, rotateY: 0 }}
                    transition={{ delay: 0.2 }}
                    style={{
                        width: '320px',
                        height: '280px',
                        background: COLORS.cardBg,
                        borderRadius: '20px',
                        border: `2px solid ${COLORS.gold}`,
                        boxShadow: `
                            0 0 40px ${COLORS.goldGlow},
                            0 20px 40px rgba(0,0,0,0.5)
                        `,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '80px',
                        transform: 'perspective(1000px) rotateY(-5deg)'
                    }}
                >
                    🎯
                </motion.div>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                @keyframes pulse-glow {
                    0%, 100% { box-shadow: 0 0 30px ${COLORS.orangeGlow}; }
                    50% { box-shadow: 0 0 50px ${COLORS.orange}; }
                }
            `}</style>
        </div>
    );
}

/**
 * Neon Filter Pill Button
 */
function FilterPill({
    label,
    isActive,
    onClick
}: {
    label: string;
    isActive: boolean;
    onClick: () => void;
}) {
    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            style={{
                padding: '10px 20px',
                background: isActive
                    ? `linear-gradient(135deg, ${COLORS.orange}22, ${COLORS.orange}11)`
                    : 'rgba(255,255,255,0.05)',
                border: isActive
                    ? `2px solid ${COLORS.orange}`
                    : '2px solid transparent',
                borderRadius: '25px',
                color: isActive ? COLORS.orange : '#888',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: isActive ? `0 0 20px ${COLORS.orangeGlow}` : 'none'
            }}
        >
            {label}
        </motion.button>
    );
}

/**
 * Section Header with emoji and count
 */
function SectionHeader({
    title,
    emoji,
    color = COLORS.cyan,
    count
}: {
    title: string;
    emoji?: string;
    color?: string;
    count?: number;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {emoji && <span style={{ fontSize: '24px' }}>{emoji}</span>}
            <h2 style={{
                fontSize: '20px',
                fontWeight: 700,
                margin: 0,
                color: color
            }}>
                {title}
            </h2>
            {count !== undefined && (
                <span style={{
                    padding: '2px 10px',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#888'
                }}>
                    {count}
                </span>
            )}
        </div>
    );
}

/**
 * 3D Game Card with glow effects
 */
function GameCard({
    game,
    isDaily,
    xpBonus,
    onHover,
    onClick
}: {
    game: GameDefinition;
    isDaily: boolean;
    xpBonus?: number;
    onHover: () => void;
    onClick: () => void;
}) {
    const accentColor = game.visuals?.accentColor || COLORS.cyan;
    const glowColor = isDaily ? COLORS.goldGlow : `${accentColor}44`;
    const borderColor = isDaily ? COLORS.gold : accentColor;

    return (
        <motion.div
            whileHover={{ scale: 1.05, y: -5 }}
            onHoverStart={onHover}
            onClick={onClick}
            style={{
                width: '280px',
                background: COLORS.cardBg,
                borderRadius: '16px',
                border: `2px solid ${borderColor}`,
                boxShadow: `0 0 20px ${glowColor}, 0 10px 30px rgba(0,0,0,0.3)`,
                cursor: 'pointer',
                overflow: 'hidden',
                transition: 'box-shadow 0.3s'
            }}
        >
            {/* Card Image */}
            <div style={{
                height: '150px',
                background: `linear-gradient(135deg, ${accentColor}33, ${COLORS.darkBg})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '60px',
                position: 'relative'
            }}>
                {getCategoryEmoji(game.category)}

                {/* XP Bonus Badge */}
                {xpBonus && (
                    <div style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        padding: '4px 10px',
                        background: `linear-gradient(135deg, ${COLORS.orange}, #ea580c)`,
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#fff'
                    }}>
                        ×{xpBonus} XP
                    </div>
                )}

                {/* Difficulty Stars */}
                <div style={{
                    position: 'absolute',
                    bottom: '12px',
                    left: '12px',
                    display: 'flex',
                    gap: '2px'
                }}>
                    {[1, 2, 3, 4, 5].map(level => (
                        <span key={level} style={{
                            fontSize: '10px',
                            color: level <= game.difficulty.level ? COLORS.gold : '#444'
                        }}>
                            ★
                        </span>
                    ))}
                </div>
            </div>

            {/* Card Content */}
            <div style={{ padding: '16px' }}>
                <h3 style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    margin: '0 0 8px',
                    color: '#fff'
                }}>
                    {game.name}
                </h3>
                <p style={{
                    fontSize: '12px',
                    color: '#888',
                    margin: 0,
                    lineHeight: 1.4
                }}>
                    {game.description}
                </p>

                {/* Tags */}
                <div style={{
                    display: 'flex',
                    gap: '6px',
                    marginTop: '12px',
                    flexWrap: 'wrap'
                }}>
                    <span style={{
                        padding: '3px 8px',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        fontSize: '10px',
                        color: '#aaa'
                    }}>
                        {game.tableSize}-Max
                    </span>
                    <span style={{
                        padding: '3px 8px',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        fontSize: '10px',
                        color: '#aaa'
                    }}>
                        {game.economics.stackDepth}BB
                    </span>
                    <span style={{
                        padding: '3px 8px',
                        background: `${accentColor}33`,
                        borderRadius: '8px',
                        fontSize: '10px',
                        color: accentColor
                    }}>
                        {game.category}
                    </span>
                </div>
            </div>
        </motion.div>
    );
}

/**
 * Mission Briefing Modal - Tactical overlay before game launch
 */
function MissionBriefingModal({
    game,
    onStart,
    onClose
}: {
    game: GameDefinition;
    onStart: () => void;
    onClose: () => void;
}) {
    const accentColor = game.visuals?.accentColor || COLORS.cyan;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                padding: '24px'
            }}
        >
            <motion.div
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 30 }}
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: '800px',
                    background: `linear-gradient(135deg, ${COLORS.darkBg}, #1a1a3a)`,
                    borderRadius: '24px',
                    border: `2px solid ${accentColor}`,
                    boxShadow: `0 0 60px ${accentColor}44`,
                    overflow: 'hidden'
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '24px 32px',
                    background: `linear-gradient(135deg, ${accentColor}22, transparent)`,
                    borderBottom: `1px solid ${COLORS.borderDim}`
                }}>
                    <div style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: accentColor,
                        textTransform: 'uppercase',
                        letterSpacing: '2px',
                        marginBottom: '8px'
                    }}>
                        MISSION BRIEFING
                    </div>
                    <h2 style={{ fontSize: '32px', fontWeight: 800, margin: 0 }}>
                        {game.name}
                    </h2>
                </div>

                {/* Content */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '32px',
                    padding: '32px'
                }}>
                    {/* Left: Visual */}
                    <div style={{
                        background: `linear-gradient(135deg, ${accentColor}22, ${COLORS.darkBg})`,
                        borderRadius: '16px',
                        padding: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '100px'
                    }}>
                        {getCategoryEmoji(game.category)}
                    </div>

                    {/* Right: Objectives */}
                    <div>
                        <h3 style={{
                            fontSize: '14px',
                            fontWeight: 700,
                            color: '#888',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            marginBottom: '16px'
                        }}>
                            Mission Objectives
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <ObjectiveRow
                                label="Situation"
                                value={game.scenario.situation.replace(/_/g, ' ')}
                            />
                            <ObjectiveRow
                                label="Stack Depth"
                                value={`${game.economics.stackDepth} Big Blinds`}
                            />
                            <ObjectiveRow
                                label="Table Format"
                                value={`${game.tableSize}-Max ${game.category}`}
                            />
                            <ObjectiveRow
                                label="Difficulty"
                                value={`${'★'.repeat(game.difficulty.level)}${'☆'.repeat(5 - game.difficulty.level)}`}
                            />
                            <ObjectiveRow
                                label="Hero Position"
                                value={game.scenario.heroPosition}
                            />
                        </div>

                        <p style={{
                            fontSize: '14px',
                            color: '#888',
                            lineHeight: 1.6,
                            marginTop: '24px'
                        }}>
                            {game.longDescription || game.description}
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '24px 32px',
                    background: 'rgba(0,0,0,0.3)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '12px 24px',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '10px',
                            color: '#888',
                            fontSize: '14px',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onStart}
                        style={{
                            padding: '14px 40px',
                            background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
                            border: 'none',
                            borderRadius: '10px',
                            color: '#fff',
                            fontSize: '16px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: `0 0 20px ${accentColor}44`
                        }}
                    >
                        🚀 Initialize Mission
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
}

function ObjectiveRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: `1px solid ${COLORS.borderDim}`
        }}>
            <span style={{ color: '#888', fontSize: '13px' }}>{label}</span>
            <span style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>{value}</span>
        </div>
    );
}

// Helper function
function getCategoryEmoji(category: string): string {
    switch (category) {
        case 'MTT': return '🏆';
        case 'PKO': return '💀';
        case 'Cash': return '💰';
        case 'Spin_Go': return '🎰';
        case 'HeadsUp_SNG': return '🥊';
        case 'Satellite': return '🛰️';
        case 'Drill': return '🎯';
        default: return '🃏';
    }
}

export default TrainingHub;
