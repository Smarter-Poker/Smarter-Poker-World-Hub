/**
 * LevelSelector.tsx
 * ==================
 * Level selection screen for God Mode games.
 * Shows 10 levels in a vertical map with lock/unlock status and high scores.
 *
 * Features:
 * - Visual level "map" from 1-10
 * - Lock logic: Level 1 always unlocked, others require 85%+ on previous
 * - High score display for each level
 * - Play button triggers session start
 *
 * @author Smarter.Poker Engineering
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

interface LevelData {
    level: number;
    title: string;
    description: string;
    passingGrade: number;
    highScore: number | null;
    isUnlocked: boolean;
    isCompleted: boolean;
    attempts: number;
}

interface GameData {
    id: string;
    title: string;
    slug: string;
    category: string;
    engineType: string;
}

interface LevelSelectorProps {
    gameId: string;
    userId: string;
    onBack?: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LEVEL_TITLES = [
    'The Basics',
    'Building Blocks',
    'Getting Serious',
    'Challenge Mode',
    'Mid-Game Mastery',
    'Advanced Tactics',
    'Expert Level',
    'Master Class',
    'Elite Training',
    'Final Exam',
];

const LEVEL_DESCRIPTIONS = [
    'Learn the fundamentals',
    'Reinforce core concepts',
    'Apply what you know',
    'Test your knowledge',
    'Handle complex spots',
    'Advanced decision making',
    'Expert-level scenarios',
    'Master the subtleties',
    'Elite performance required',
    'Prove your mastery',
];

// Passing grades scale up with level
const PASSING_GRADES = [85, 87, 89, 91, 93, 95, 97, 98, 99, 100];

// ============================================================================
// LEVEL CARD COMPONENT
// ============================================================================

const LevelCard: React.FC<{
    levelData: LevelData;
    gameTitle: string;
    onPlay: (level: number) => void;
    index: number;
}> = ({ levelData, gameTitle, onPlay, index }) => {
    const { level, title, description, passingGrade, highScore, isUnlocked, isCompleted, attempts } = levelData;

    // Determine card state
    const getCardStyle = () => {
        if (isCompleted) {
            return {
                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 165, 0, 0.1))',
                border: '2px solid #FFD700',
                boxShadow: '0 0 20px rgba(255, 215, 0, 0.3)',
            };
        }
        if (isUnlocked) {
            return {
                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(0, 100, 200, 0.08))',
                border: '2px solid rgba(0, 212, 255, 0.5)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            };
        }
        return {
            background: 'rgba(30, 30, 50, 0.5)',
            border: '2px solid rgba(100, 100, 120, 0.3)',
            boxShadow: 'none',
            opacity: 0.6,
        };
    };

    const cardStyle = getCardStyle();

    return (
        <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.08, duration: 0.4 }}
            style={{
                ...styles.levelCard,
                ...cardStyle,
            }}
        >
            {/* Level Number Badge */}
            <div style={{
                ...styles.levelBadge,
                background: isCompleted
                    ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                    : isUnlocked
                        ? 'linear-gradient(135deg, #00D4FF, #0099CC)'
                        : 'rgba(100, 100, 120, 0.5)',
                color: isCompleted ? '#000' : '#fff',
            }}>
                {isCompleted ? '✓' : level}
            </div>

            {/* Level Info */}
            <div style={styles.levelInfo}>
                <h3 style={{
                    ...styles.levelTitle,
                    color: isUnlocked ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                }}>
                    Level {level}: {title}
                </h3>
                <p style={{
                    ...styles.levelDesc,
                    color: isUnlocked ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.4)',
                }}>
                    {description}
                </p>

                {/* Pass requirement */}
                <div style={styles.requirement}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 11 }}>
                        Pass: {passingGrade}%
                    </span>
                    {attempts > 0 && (
                        <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 10, marginLeft: 12 }}>
                            {attempts} attempt{attempts !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            </div>

            {/* High Score / Lock Status */}
            <div style={styles.scoreSection}>
                {isUnlocked ? (
                    <>
                        {highScore !== null ? (
                            <div style={{
                                ...styles.highScore,
                                color: highScore >= passingGrade ? '#4CAF50' : '#FF6B35',
                            }}>
                                <span style={styles.highScoreLabel}>Best</span>
                                <span style={styles.highScoreValue}>{highScore}%</span>
                            </div>
                        ) : (
                            <div style={styles.notAttempted}>
                                <span>Not attempted</span>
                            </div>
                        )}

                        {/* Play Button */}
                        <motion.button
                            onClick={() => onPlay(level)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            style={{
                                ...styles.playButton,
                                background: isCompleted
                                    ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                                    : 'linear-gradient(135deg, #00D4FF, #0099CC)',
                                color: isCompleted ? '#000' : '#fff',
                            }}
                        >
                            {isCompleted ? '▶ REPLAY' : highScore !== null ? '▶ RETRY' : '▶ PLAY'}
                        </motion.button>
                    </>
                ) : (
                    <div style={styles.lockedSection}>
                        <span style={styles.lockIcon}>🔒</span>
                        <span style={styles.lockText}>
                            Pass Level {level - 1} first
                        </span>
                    </div>
                )}
            </div>

            {/* Connection Line to Next Level */}
            {level < 10 && (
                <div style={{
                    ...styles.connectionLine,
                    background: isCompleted
                        ? 'linear-gradient(180deg, #FFD700, rgba(255, 215, 0, 0.3))'
                        : 'linear-gradient(180deg, rgba(100, 100, 120, 0.5), rgba(100, 100, 120, 0.1))',
                }} />
            )}
        </motion.div>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const LevelSelector: React.FC<LevelSelectorProps> = ({ gameId, userId, onBack }) => {
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [gameData, setGameData] = useState<GameData | null>(null);
    const [levels, setLevels] = useState<LevelData[]>([]);
    const [startingLevel, setStartingLevel] = useState<number | null>(null);

    // ========================================================================
    // DATA FETCHING
    // ========================================================================

    const fetchGameAndProgress = useCallback(async () => {
        setLoading(true);

        try {
            // Fetch game data
            const gameRes = await fetch(`/api/games/${gameId}`);
            const game = await gameRes.json();

            if (game.error) {
                console.error('Game not found:', game.error);
                return;
            }

            setGameData({
                id: game.id,
                title: game.title,
                slug: game.slug,
                category: game.category,
                engineType: game.engine_type,
            });

            // Fetch user progress for this game
            const progressRes = await fetch(`/api/training/progress?userId=${userId}&gameId=${gameId}`);
            const progressData = await progressRes.json();

            // Build level data with lock logic
            const levelProgress = progressData.levels || {};

            const levelDataList: LevelData[] = [];

            for (let i = 1; i <= 10; i++) {
                const levelKey = `level_${i}`;
                const progress = levelProgress[levelKey] || {};
                const prevProgress = i > 1 ? (levelProgress[`level_${i - 1}`] || {}) : null;

                // Lock logic: Level 1 always unlocked, others need previous level ≥85%
                const isUnlocked = i === 1 || (prevProgress?.highScore || 0) >= PASSING_GRADES[i - 2];
                const isCompleted = (progress.highScore || 0) >= PASSING_GRADES[i - 1];

                levelDataList.push({
                    level: i,
                    title: LEVEL_TITLES[i - 1],
                    description: LEVEL_DESCRIPTIONS[i - 1],
                    passingGrade: PASSING_GRADES[i - 1],
                    highScore: progress.highScore || null,
                    isUnlocked,
                    isCompleted,
                    attempts: progress.attempts || 0,
                });
            }

            setLevels(levelDataList);

        } catch (error) {
            console.error('Failed to fetch game/progress:', error);
        } finally {
            setLoading(false);
        }
    }, [gameId, userId]);

    useEffect(() => {
        fetchGameAndProgress();
    }, [fetchGameAndProgress]);

    // ========================================================================
    // HANDLERS
    // ========================================================================

    const handlePlayLevel = async (level: number) => {
        setStartingLevel(level);

        try {
            // Start session via API
            const res = await fetch('/api/session/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    game_id: gameId,
                    level: level,
                }),
            });

            const session = await res.json();

            if (session.error) {
                console.error('Failed to start session:', session.error);
                setStartingLevel(null);
                return;
            }

            // Navigate to game arena
            router.push(`/hub/training/arena/${gameId}?level=${level}&session=${session.session_id}`);

        } catch (error) {
            console.error('Failed to start session:', error);
            setStartingLevel(null);
        }
    };

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else {
            router.push('/hub/training');
        }
    };

    // ========================================================================
    // RENDER
    // ========================================================================

    // Calculate overall progress
    const completedLevels = levels.filter(l => l.isCompleted).length;
    const totalProgress = (completedLevels / 10) * 100;

    return (
        <div style={styles.container}>
            {/* Header */}
            <header style={styles.header}>
                <button onClick={handleBack} style={styles.backButton}>
                    ← Back
                </button>

                <div style={styles.gameInfo}>
                    <h1 style={styles.gameTitle}>{gameData?.title || 'Loading...'}</h1>
                    <div style={styles.progressSummary}>
                        <span style={styles.progressText}>
                            {completedLevels}/10 Levels Completed
                        </span>
                        <div style={styles.progressTrack}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${totalProgress}%` }}
                                transition={{ duration: 0.5 }}
                                style={styles.progressFill}
                            />
                        </div>
                    </div>
                </div>

                <div style={styles.categoryBadge}>
                    {gameData?.category || '...'}
                </div>
            </header>

            {/* Level Map */}
            <main style={styles.levelMap}>
                {loading ? (
                    <div style={styles.loading}>
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            style={styles.spinner}
                        >
                            🎰
                        </motion.div>
                        <p>Loading levels...</p>
                    </div>
                ) : (
                    <div style={styles.levelList}>
                        {levels.map((levelData, index) => (
                            <LevelCard
                                key={levelData.level}
                                levelData={levelData}
                                gameTitle={gameData?.title || ''}
                                onPlay={handlePlayLevel}
                                index={index}
                            />
                        ))}
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer style={styles.footer}>
                <span>85% minimum to pass each level</span>
                <span>•</span>
                <span>20 hands per round</span>
            </footer>

            {/* Loading Overlay */}
            <AnimatePresence>
                {startingLevel !== null && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={styles.loadingOverlay}
                    >
                        <div style={styles.loadingContent}>
                            <motion.div
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 1, repeat: Infinity }}
                                style={styles.loadingIcon}
                            >
                                🎮
                            </motion.div>
                            <p>Starting Level {startingLevel}...</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ============================================================================
// STYLES
// ============================================================================

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
        color: '#fff',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },

    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    },

    backButton: {
        padding: '8px 16px',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },

    gameInfo: {
        textAlign: 'center' as const,
        flex: 1,
    },

    gameTitle: {
        margin: 0,
        fontSize: 24,
        fontWeight: 800,
        color: '#fff',
        letterSpacing: 0.5,
    },

    progressSummary: {
        marginTop: 8,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: 6,
    },

    progressText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
    },

    progressTrack: {
        width: 200,
        height: 6,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },

    progressFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #FFD700, #FFA500)',
        borderRadius: 3,
    },

    categoryBadge: {
        padding: '6px 12px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.8)',
    },

    levelMap: {
        padding: '24px',
        maxWidth: 600,
        margin: '0 auto',
    },

    loading: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        height: 400,
        gap: 16,
    },

    spinner: {
        fontSize: 48,
    },

    levelList: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 0,
    },

    levelCard: {
        position: 'relative' as const,
        display: 'flex',
        alignItems: 'center',
        padding: '16px 20px',
        borderRadius: 12,
        marginBottom: 16,
        transition: 'all 0.2s ease',
    },

    levelBadge: {
        width: 44,
        height: 44,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        fontWeight: 800,
        flexShrink: 0,
    },

    levelInfo: {
        flex: 1,
        marginLeft: 16,
    },

    levelTitle: {
        margin: 0,
        fontSize: 16,
        fontWeight: 700,
    },

    levelDesc: {
        margin: '4px 0 0 0',
        fontSize: 12,
    },

    requirement: {
        marginTop: 6,
        display: 'flex',
        alignItems: 'center',
    },

    scoreSection: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'flex-end',
        gap: 8,
        minWidth: 100,
    },

    highScore: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'flex-end',
    },

    highScoreLabel: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.5)',
    },

    highScoreValue: {
        fontSize: 20,
        fontWeight: 800,
    },

    notAttempted: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.4)',
    },

    playButton: {
        padding: '8px 16px',
        border: 'none',
        borderRadius: 16,
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        letterSpacing: 0.5,
    },

    lockedSection: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: 4,
    },

    lockIcon: {
        fontSize: 20,
    },

    lockText: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center' as const,
    },

    connectionLine: {
        position: 'absolute' as const,
        bottom: -16,
        left: 38,
        width: 4,
        height: 16,
        borderRadius: 2,
    },

    footer: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        padding: '16px 24px',
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    },

    loadingOverlay: {
        position: 'fixed' as const,
        inset: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },

    loadingContent: {
        textAlign: 'center' as const,
    },

    loadingIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
};

export default LevelSelector;
