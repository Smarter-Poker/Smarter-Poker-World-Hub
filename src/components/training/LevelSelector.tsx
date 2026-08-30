/**
 * LevelSelector.tsx
 * ==================
 * Level selection screen for God Mode games.
 * Shows 12 levels (Foundations → Boss Mode) in a vertical map with lock/unlock status and high scores.
 *
 * Features:
 * - Visual level "map" from 1-12
 * - Lock logic: Level 1 always unlocked, others require 85%+ on previous
 * - High score display for each level
 * - Play button triggers session start
 *
 * @author Smarter.Poker Engineering
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { getGameById } from '../../data/TRAINING_LIBRARY';
import TrainingGameArt from './TrainingGameArt';
import useVIPGate from '../../hooks/useVIPGate';
import VIPGateModal from '../ui/VIPGateModal';
import { authedFetch, getSessionToken } from '../../lib/authUtils';
import { LEVEL_REGISTRY, MASTERY_THRESHOLD, getLevel } from '../../config/LevelRegistry';

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
    diamondMultiplier?: number;
    tier?: string;
    accentColor?: string;
}

interface GameData {
    id: string;
    title: string;
    slug: string;
    category: string;
    engineType: string;
    focus?: string;
    difficulty?: number;
}

interface LevelSelectorProps {
    gameId: string;
    userId: string;
    onBack?: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Derive level metadata from LevelRegistry (solver-backed source of truth)
// Fallback arrays ensure zero breakage if registry import fails
const LEVEL_TITLES = Array.from({ length: Object.keys(LEVEL_REGISTRY || {}).length }, (_, i) => {
    const reg = LEVEL_REGISTRY[i + 1];
    return reg?.name || ['The Basics', 'Building Blocks', 'Getting Serious', 'Challenge Mode', 'Mid-Game Mastery', 'Advanced Tactics', 'Expert Level', 'Master Class', 'Elite Training', 'Final Exam'][i];
});

const LEVEL_DESCRIPTIONS = Array.from({ length: Object.keys(LEVEL_REGISTRY || {}).length }, (_, i) => {
    const reg = LEVEL_REGISTRY[i + 1];
    return reg?.description || ['Learn the fundamentals', 'Reinforce core concepts', 'Apply what you know', 'Test your knowledge', 'Handle complex spots', 'Advanced decision making', 'Expert-level scenarios', 'Master the subtleties', 'Elite performance required', 'Prove your mastery'][i];
});

// Passing grades from LevelRegistry — masteryThreshold is 0.85 (85%) for L1-10, 0.90 for Boss Mode
// EV tolerance tightens each level, so we scale passing grades based on registry complexity
const PASSING_GRADES = Array.from({ length: Object.keys(LEVEL_REGISTRY || {}).length }, (_, i) => {
    const reg = LEVEL_REGISTRY[i + 1];
    return reg ? Math.round(reg.masteryThreshold * 100) : [85, 87, 89, 91, 93, 95, 97, 98, 99, 100][i];
});

// Level accent colors from registry for UI theming
const LEVEL_COLORS = Array.from({ length: Object.keys(LEVEL_REGISTRY || {}).length }, (_, i) => {
    const reg = LEVEL_REGISTRY[i + 1];
    return reg?.accentColor || '#00D4FF';
});

// ============================================================================
// LEVEL CARD COMPONENT
// ============================================================================

const LevelCard: React.FC<{
    levelData: LevelData;
    gameTitle: string;
    onPlay: (level: number) => void;
    index: number;
    isLast: boolean;
}> = ({ levelData, gameTitle, onPlay, index, isLast }) => {
    const { level, title, description, passingGrade, highScore, isUnlocked, isCompleted, attempts, diamondMultiplier, tier } = levelData;

    // Determine card state
    const getCardStyle = () => {
        if (isCompleted) {
            return {
                background: 'linear-gradient(145deg, rgba(38, 65, 78, 0.98), rgba(4, 16, 24, 0.98) 48%, rgba(14, 37, 49, 0.98))',
                border: '1px solid rgba(139, 234, 255, 0.72)',
                boxShadow: '0 20px 45px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.28), inset 0 -2px 0 rgba(0,0,0,.84), 0 0 24px rgba(35,215,255,.12)',
            };
        }
        if (isUnlocked) {
            return {
                background: 'linear-gradient(145deg, rgba(28, 52, 67, 0.98), rgba(3, 13, 22, 0.98) 48%, rgba(10, 29, 41, 0.98))',
                border: '1px solid rgba(139, 234, 255, 0.45)',
                boxShadow: '0 18px 38px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.2), inset 0 -2px 0 rgba(0,0,0,.8)',
            };
        }
        return {
            background: 'linear-gradient(145deg, rgba(20, 31, 40, 0.9), rgba(3, 9, 14, 0.96))',
            border: '1px solid rgba(107, 133, 147, 0.28)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08), inset 0 -2px 0 rgba(0,0,0,.75)',
            opacity: 0.72,
        };
    };

    const cardStyle = getCardStyle();

    return (
        <motion.div
            className={`sp-level-card ${isCompleted ? 'is-complete' : isUnlocked ? 'is-open' : 'is-locked'}`}
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.08, duration: 0.4 }}
            style={{
                ...styles.levelCard,
                ...cardStyle,
            }}
        >
            {/* Level Number Badge */}
            <div className="sp-level-badge" style={{
                ...styles.levelBadge,
                background: isCompleted
                    ? 'linear-gradient(145deg, #f5fdff, #6ac6e1 45%, #17394d)'
                    : isUnlocked
                        ? 'linear-gradient(145deg, #a9f2ff, #159fd2 45%, #063c58)'
                        : 'linear-gradient(145deg, #607583, #1a2a34)',
                color: '#03101a',
            }}>
                {isCompleted ? '✓' : level}
            </div>

            {/* Level Info */}
            <div className="sp-level-info" style={styles.levelInfo}>
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

                {/* Pass requirement + Reward info */}
                <div style={styles.requirement}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 11 }}>
                        Pass: {passingGrade}%
                    </span>
                    {attempts > 0 && (
                        <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 10, marginLeft: 12 }}>
                            {attempts} attempt{attempts !== 1 ? 's' : ''}
                        </span>
                    )}
                    {diamondMultiplier && diamondMultiplier > 1.0 && (
                        <span style={{ color: '#FBBF24', fontSize: 10, marginLeft: 12, fontWeight: 600 }}>
                            {diamondMultiplier}x Diamonds
                        </span>
                    )}
                </div>
            </div>

            {/* High Score / Lock Status */}
            <div className="sp-level-score" style={styles.scoreSection}>
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
                                <span>Not Attempted</span>
                            </div>
                        )}

                        {/* Play Button */}
                        <motion.button
                            className="sp-level-play"
                            onClick={() => onPlay(level)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            style={{
                                ...styles.playButton,
                                background: isCompleted
                                    ? 'linear-gradient(180deg, #d9f8ff, #2786a7 48%, #0b3448)'
                                    : 'linear-gradient(180deg, #7be9ff, #078cc0 48%, #043a54)',
                                color: '#f5fdff',
                            }}
                        >
                            {isCompleted ? '▶ Replay' : highScore !== null ? '▶ Retry' : '▶ Play'}
                        </motion.button>
                    </>
                ) : (
                    <div style={styles.lockedSection}>
                        <span style={styles.lockIcon}>■</span>
                        <span style={styles.lockText}>
                            Pass Level {level - 1} first
                        </span>
                    </div>
                )}
            </div>

            {/* Connection Line to Next Level */}
            {!isLast && (
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

    // VIP Gating logic
    const { allowed: vipAllowed, showUpgradeModal, upgradeModalVisible, hideUpgradeModal, featureConfig } = useVIPGate('gto-training');

    // ========================================================================
    // DATA FETCHING
    // ========================================================================

    const fetchGameAndProgress = useCallback(async () => {
        setLoading(true);

        try {
            // Fetch game data from API, with TRAINING_LIBRARY fallback
            let gameInfo: any = null;

            try {
                const gameRes = await fetch(`/api/games/${gameId}`);
                const game = await gameRes.json();
                if (!game.error) {
                    gameInfo = game;
                }
            } catch (e) {
                console.warn('[LevelSelector] API fetch failed, using client fallback');
            }

            // Fallback: use TRAINING_LIBRARY if API fails or game not in registry
            if (!gameInfo) {
                const libraryGame = getGameById(gameId);
                if (libraryGame) {
                    gameInfo = {
                        id: libraryGame.id,
                        title: libraryGame.name,
                        slug: libraryGame.id,
                        category: libraryGame.category,
                        engine_type: libraryGame.tags?.includes('gto') ? 'PIO' :
                            libraryGame.category === 'PSYCHOLOGY' ? 'SCENARIO' : 'PIO',
                        focus: libraryGame.focus,
                        difficulty: libraryGame.difficulty,
                    };
                    console.log(`[LevelSelector] Using TRAINING_LIBRARY fallback for: ${gameId}`);
                } else {
                    console.warn('Game not found in registry or library:', gameId);
                    // Still show levels with minimal game data
                    gameInfo = { id: gameId, title: gameId, slug: gameId, category: 'CASH', engine_type: 'PIO' };
                }
            }

            setGameData({
                id: gameInfo.id,
                title: gameInfo.title || gameInfo.name,
                slug: gameInfo.slug || gameInfo.id,
                category: gameInfo.category,
                engineType: gameInfo.engine_type,
                focus: gameInfo.focus || gameInfo.description,
                difficulty: Number(gameInfo.difficulty) || undefined,
            });

            // Fetch user progress for this game
            // 2026-07-19 AUDIT FIX: this fetch sent NO Authorization header, so
            // the endpoint always returned anonymous defaults — combined with
            // the dead-table read server-side, progress never displayed.
            let levelProgress: any = {};
            let highestUnlocked = 1;
            try {
                const progressRes = await authedFetch(`/api/training/progress?userId=${userId}&gameId=${gameId}`);
                const progressData = await progressRes.json();
                levelProgress = progressData?.levels || {};
                highestUnlocked = progressData?.levels?.highestUnlocked
                    ?? progressData?.highest_level_unlocked
                    ?? progressData?.progress?.highest_level_unlocked
                    ?? 1;
            } catch (e) {
                console.warn('[LevelSelector] Progress fetch failed, showing default levels');
            }

            // Build level data with lock logic
            const levelDataList: LevelData[] = [];

            const totalLevels = Object.keys(LEVEL_REGISTRY || {}).length;
            for (let i = 1; i <= totalLevels; i++) {
                const levelKey = `level_${i}`;
                const progress = levelProgress[levelKey] || {};
                const prevProgress = i > 1 ? (levelProgress[`level_${i - 1}`] || {}) : null;

                // Lock logic: Level 1 always unlocked, others unlock via server-reported
                // highest_level_unlocked or previous level high score ≥ passing grade
                const isUnlocked = i === 1 || i <= highestUnlocked || (prevProgress?.highScore || 0) >= PASSING_GRADES[i - 2];
                const isCompleted = (progress.highScore || 0) >= PASSING_GRADES[i - 1];

                const regLevel = getLevel(i);
                levelDataList.push({
                    level: i,
                    title: LEVEL_TITLES[i - 1],
                    description: LEVEL_DESCRIPTIONS[i - 1],
                    passingGrade: PASSING_GRADES[i - 1],
                    highScore: progress.highScore || null,
                    isUnlocked,
                    isCompleted,
                    attempts: progress.attempts || 0,
                    diamondMultiplier: regLevel?.diamondMultiplier || 1.0,
                    tier: regLevel?.tier || 'BEGINNER',
                    accentColor: regLevel?.accentColor || LEVEL_COLORS[i - 1],
                });
            }

            setLevels(levelDataList);

        } catch (error) {
            console.warn('Failed to fetch game/progress:', error);
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
        // Enforce VIP wall for levels 4-10
        if (level > 3 && !vipAllowed) {
            showUpgradeModal();
            return;
        }
        
        setStartingLevel(level);

        try {
            // Get auth token for session start
            let authToken = '';
            try {
                authToken = getSessionToken() || '';
            } catch (e) {
                console.warn('[LevelSelector] Auth token retrieval failed');
            }

            if (!authToken) {
                setStartingLevel(null);
                await router.push({
                    pathname: '/auth/login',
                    query: { redirect: `/hub/training/arena/${gameId}?level=${level}` },
                });
                return;
            }

            // Start session via API (with auth token)
            let sessionId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;

            try {
                const res = await authedFetch('/api/session/start', {
                    method: 'POST',
                    body: JSON.stringify({
                        user_id: userId,
                        game_id: gameId,
                        level: level,
                    }),
                });

                const session = await res.json();
                if (!res.ok) {
                    throw new Error(session?.error || `Session start failed (${res.status})`);
                }
                if (session.session_id) {
                    sessionId = session.session_id;
                } else {
                    console.warn('[LevelSelector] Session API returned no session_id, using client-generated ID');
                }
            } catch (e) {
                console.warn('[LevelSelector] Session start failed, proceeding with client-generated session ID');
            }

            // Navigate to game arena (always proceed, even if session API fails)
            router.push(`/hub/training/arena/${gameId}?level=${level}&session=${sessionId}`);

        } catch (error) {
            console.warn('Failed to start session:', error);
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
    const totalProgress = levels.length > 0 ? (completedLevels / levels.length) * 100 : 0;
    const categoryLabel = (gameData?.category || 'Training')
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    return (
        <div className="sp-level-selector" style={styles.container}>
            {/* Game-specific command deck shared by all catalog games. */}
            <header className="sp-level-header" style={styles.header}>
                <div className="sp-level-command-copy">
                    <div className="sp-level-command-nav">
                        <button className="sp-level-back" onClick={handleBack} style={styles.backButton}>
                            ← Back To Training
                        </button>
                        <div className="sp-level-category" style={styles.categoryBadge}>
                            {categoryLabel} Campaign
                        </div>
                    </div>

                    <div className="sp-level-game-info" style={styles.gameInfo}>
                        <div className="sp-level-eyebrow">Training Campaign / {categoryLabel}</div>
                        <h1 style={styles.gameTitle}>{gameData?.title || 'Loading...'}</h1>
                        <p className="sp-level-focus">{gameData?.focus || 'Build table-ready instincts through progressively harder decisions.'}</p>
                        <div className="sp-level-stats">
                            <div><strong>{completedLevels}</strong><span>Levels Cleared</span></div>
                            <div><strong>{levels.length || 12}</strong><span>Total Levels</span></div>
                            <div><strong>{Math.round(totalProgress)}%</strong><span>Campaign Mastery</span></div>
                        </div>
                        <div style={styles.progressSummary}>
                            <span style={styles.progressText}>Campaign Progress</span>
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
                </div>

                <div className="sp-level-command-art" aria-hidden="true">
                    <TrainingGameArt
                        gameId={gameId}
                        sizes="(max-width: 700px) 100vw, 620px"
                        loading="eager"
                        fetchPriority="high"
                    />
                    <div className="sp-level-command-art-shade" />
                    <div className="sp-level-command-art-label">
                        <span>Live Training System</span>
                        <strong>{gameData?.difficulty ? `Difficulty ${gameData.difficulty} / 5` : 'Adaptive Difficulty'}</strong>
                    </div>
                </div>
            </header>

            {/* Level Map */}
            <main className="sp-level-map" style={styles.levelMap}>
                {loading ? (
                    <div style={styles.loading}>
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            style={styles.spinner}
                        >
                            ◇
                        </motion.div>
                        <p>Loading Levels...</p>
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
                                isLast={index === levels.length - 1}
                            />
                        ))}
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer style={styles.footer}>
                <span>85% Minimum To Pass Each Level</span>
                <span>•</span>
                <span>20 Hands Per Round</span>
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
                                ◇
                            </motion.div>
                            <p>Starting Level {startingLevel}...</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx global>{`
                .sp-level-selector {
                    position: relative;
                    isolation: isolate;
                    overflow-x: hidden;
                }

                .sp-level-selector::before {
                    content: '';
                    position: fixed;
                    inset: 0;
                    z-index: -1;
                    pointer-events: none;
                    background:
                        repeating-linear-gradient(90deg, rgba(121, 220, 255, .018) 0 1px, transparent 1px 5px),
                        linear-gradient(115deg, transparent 20%, rgba(93, 211, 255, .035) 48%, transparent 72%);
                }

                .sp-level-card.is-open:hover,
                .sp-level-card.is-complete:hover {
                    transform: translateY(-2px);
                    border-color: rgba(174, 239, 255, .82) !important;
                    box-shadow: 0 22px 48px rgba(0, 0, 0, .52), inset 0 1px 0 rgba(255, 255, 255, .28), 0 0 28px rgba(35, 215, 255, .14) !important;
                }

                .sp-level-play:hover {
                    filter: brightness(1.14);
                    box-shadow: inset 0 1px 0 rgba(255,255,255,.52), inset 0 -2px 0 rgba(0,0,0,.72), 0 10px 24px rgba(0, 153, 214, .3) !important;
                }

                @media (max-width: 700px) {
                    .sp-level-map {
                        padding: 16px 10px 24px !important;
                    }

                    .sp-level-card {
                        display: grid !important;
                        grid-template-columns: 42px minmax(0, 1fr);
                        gap: 0 12px;
                        align-items: center !important;
                        padding: 15px 14px !important;
                        margin-bottom: 10px !important;
                    }

                    .sp-level-badge {
                        width: 42px !important;
                        height: 42px !important;
                        grid-column: 1;
                        grid-row: 1;
                    }

                    .sp-level-info {
                        grid-column: 2;
                        grid-row: 1;
                        margin-left: 0 !important;
                    }

                    .sp-level-info h3 {
                        font-size: 15px !important;
                    }

                    .sp-level-info p {
                        font-size: 12px !important;
                    }

                    .sp-level-score {
                        grid-column: 1 / -1;
                        grid-row: 2;
                        min-width: 0 !important;
                        margin-top: 13px;
                        padding-top: 12px;
                        border-top: 1px solid rgba(139, 234, 255, .16);
                        flex-direction: row !important;
                        align-items: center !important;
                        justify-content: space-between;
                    }

                    .sp-level-score .sp-level-play {
                        min-width: 116px;
                        min-height: 40px;
                    }
                }

                @media (max-width: 390px) {
                    .sp-level-card {
                        padding-inline: 12px !important;
                    }

                    .sp-level-info p {
                        line-height: 1.32 !important;
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .sp-level-card,
                    .sp-level-play {
                        transition: none !important;
                    }
                }
            `}</style>
        </div>
    );
};

// ============================================================================
// STYLES
// ============================================================================

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        minHeight: 'calc(100dvh - 59px)',
        background: 'radial-gradient(circle at 50% 0%, rgba(13,112,174,.22), transparent 38%), linear-gradient(180deg, rgba(2,10,18,.9), rgba(1,6,11,.98))',
        color: '#eefbff',
        fontFamily: "var(--font-rajdhani, 'Rajdhani'), sans-serif",
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18,
        padding: '18px clamp(16px, 4vw, 56px)',
        background: 'linear-gradient(180deg, rgba(35,57,71,.98), rgba(5,16,24,.98) 48%, rgba(13,32,43,.98))',
        borderTop: '1px solid rgba(217,248,255,.35)', borderBottom: '2px solid rgba(35,215,255,.66)',
        boxShadow: '0 14px 32px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.16)',
    },
    backButton: {
        padding: '8px 16px', background: 'linear-gradient(180deg, #294858, #0a1c28 52%, #020b12)',
        border: '1px solid rgba(159,229,255,.55)', borderRadius: 0, color: '#eefbff',
        fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    },
    gameInfo: { textAlign: 'center' as const, flex: 1, minWidth: 0 },
    gameTitle: {
        margin: 0, fontSize: 24, fontWeight: 800, color: '#f5fdff', letterSpacing: 1.2,
        fontFamily: "var(--font-orbitron, 'Orbitron'), sans-serif",
    },
    progressSummary: { marginTop: 8, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6 },
    progressText: { fontSize: 12, color: '#9eb8c6', letterSpacing: 0.8 },
    progressTrack: {
        width: 220, maxWidth: '100%', height: 6, background: 'rgba(0,0,0,.72)',
        border: '1px solid rgba(139,234,255,.2)', borderRadius: 0, overflow: 'hidden',
    },
    progressFill: {
        height: '100%', background: 'linear-gradient(90deg, #087faf, #70e8ff, #d9f8ff)',
        borderRadius: 0, boxShadow: '0 0 12px rgba(35,215,255,.5)',
    },
    categoryBadge: {
        padding: '7px 12px', background: 'linear-gradient(180deg, rgba(43,73,89,.95), rgba(4,16,24,.96))',
        border: '1px solid rgba(139,234,255,.4)', borderRadius: 0, fontSize: 11, fontWeight: 700,
        color: '#cceef8', letterSpacing: 1.2, whiteSpace: 'nowrap',
    },
    levelMap: { padding: '28px clamp(14px, 4vw, 40px)', maxWidth: 980, margin: '0 auto' },
    loading: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', height: 400, gap: 16 },
    spinner: { fontSize: 48, color: '#7be9ff', textShadow: '0 0 24px rgba(35,215,255,.7)' },
    levelList: { display: 'flex', flexDirection: 'column' as const, gap: 0 },
    levelCard: {
        position: 'relative' as const, display: 'flex', alignItems: 'center', padding: '18px 20px',
        borderRadius: 0, marginBottom: 14, transition: 'transform .2s ease, border-color .2s ease, box-shadow .2s ease',
    },
    levelBadge: {
        width: 48, height: 48, borderRadius: 0, border: '1px solid rgba(221,249,255,.72)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.5), 0 0 18px rgba(35,215,255,.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800,
        flexShrink: 0, fontFamily: "var(--font-orbitron, 'Orbitron'), sans-serif",
    },
    levelInfo: { flex: 1, marginLeft: 18, minWidth: 0 },
    levelTitle: { margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: 0.4 },
    levelDesc: { margin: '4px 0 0 0', fontSize: 13, lineHeight: 1.45 },
    requirement: { marginTop: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, rowGap: 4 },
    scoreSection: { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 8, minWidth: 112 },
    highScore: { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end' },
    highScoreLabel: { fontSize: 10, color: '#829cab', letterSpacing: 1 },
    highScoreValue: { fontSize: 22, fontWeight: 800, fontFamily: "var(--font-orbitron, 'Orbitron'), sans-serif" },
    notAttempted: { fontSize: 11, color: '#829cab' },
    playButton: {
        padding: '9px 18px', border: '1px solid rgba(217,248,255,.7)', borderRadius: 0,
        fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.8,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.42), inset 0 -2px 0 rgba(0,0,0,.72), 0 8px 18px rgba(0,0,0,.34)',
    },
    lockedSection: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4 },
    lockIcon: { fontSize: 16, color: '#607583' },
    lockText: { fontSize: 10, color: '#78909e', textAlign: 'center' as const },
    connectionLine: {
        position: 'absolute' as const, bottom: -14, left: 42, width: 2, height: 14,
        borderRadius: 0, boxShadow: '0 0 8px rgba(35,215,255,.25)',
    },
    footer: {
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '18px 24px',
        fontSize: 12, color: '#829cab', borderTop: '1px solid rgba(139,234,255,.18)', letterSpacing: 0.5,
    },
    loadingOverlay: {
        position: 'fixed' as const, inset: 0,
        background: 'radial-gradient(circle, rgba(9,49,71,.96), rgba(1,6,10,.98) 60%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    },
    loadingContent: { textAlign: 'center' as const },
    loadingIcon: { fontSize: 64, color: '#7be9ff', textShadow: '0 0 24px rgba(35,215,255,.7)', marginBottom: 16 },
};

export default LevelSelector;
