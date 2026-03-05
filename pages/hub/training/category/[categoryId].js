/**
 *  TRAINING CATEGORY PAGE — Mobile Optimized
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Shows all games in a specific category when user clicks category header.
 * Optimized for mobile with grid layout and back navigation.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { useState } from 'react';
import confetti from 'canvas-confetti';
import GameCard from '../../../../src/components/training/GameCard';
import { getGamesByCategory } from '../../../../src/data/TRAINING_LIBRARY';
import useTrainingProgress from '../../../../src/hooks/useTrainingProgress';
import { getGameImage } from '../../../../src/data/GAME_IMAGES';
import GameIntroSplash from '../../../../src/components/training/GameIntroSplash';

// God-Mode Stack
import PageTransition from '../../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';

// Category metadata
const CATEGORY_META = {
    MTT: {
        title: 'MTT MASTERY',
        icon: 'Trophy',
        color: '#FF6B35',
        description: 'Master Tournament Poker Strategy From Early Stages to Final Tables'
    },
    CASH: {
        title: 'CASH GAME GRIND',
        icon: '',
        color: '#4CAF50',
        description: 'Dominate Cash Games with Optimal Strategy for Every Street'
    },
    SPINS: {
        title: 'SPINS & SNGS',
        icon: '++',
        color: '#FFD700',
        description: 'Fast-paced Sit & Go Strategy for Maximum ROI'
    },
    PSYCHOLOGY: {
        title: 'MENTAL GAME',
        icon: '',
        color: '#9C27B0',
        description: 'Master the Psychological Aspects of Poker Excellence'
    },
    ADVANCED: {
        title: 'ADVANCED THEORY',
        icon: '🤖',
        color: '#2196F3',
        description: 'Deep Dive Into GTO, Range Construction, and Solver Work'
    },
};

export default function CategoryPage() {
    const router = useRouter();
    if (!router.isReady) return null;
    const { categoryId } = router.query;
    const { getGameProgress } = useTrainingProgress();
    const [showIntro, setShowIntro] = useState(false);
    const [pendingGame, setPendingGame] = useState(null);

    const categoryMeta = CATEGORY_META[categoryId] || {};
    const games = categoryId ? getGamesByCategory(categoryId) : [];

    // Handle game click
    const handleGameClick = (game) => {
        setPendingGame(game);
        setShowIntro(true);
    };

    // After intro, navigate to game
    const handleIntroComplete = () => {
        setShowIntro(false);
        if (pendingGame) {
            router.push(`/hub/training/play/${pendingGame.id}`);
            setPendingGame(null);
        }
    };

    // Handle back
    const handleBack = () => {
        router.back();
    };

    if (!categoryId || games.length === 0) {
        return (
            <div style={styles.loading}>
                <p>Loading...</p>
            </div>
        );
    }

    return (
        <PageTransition>
            <SEOHead
                title="Training Category"
                description="Smarter.Poker — The Future Of The Game."
                noindex={true}
            />

            {/* Intro Splash */}
            <GameIntroSplash
                isVisible={showIntro}
                game={pendingGame ? { ...pendingGame, image: getGameImage(pendingGame.id) } : null}
                onComplete={handleIntroComplete}
            />

            <div className="training-category-page" style={styles.page}>
                {/* UniversalHeader */}
                <UniversalHeader pageDepth={2} />

                {/* Header */}
                <div style={{ ...styles.header, borderBottom: `2px solid ${categoryMeta.color}` }}>

                    <div style={styles.headerContent}>
                        <span style={styles.headerIcon}>{categoryMeta.icon}</span>
                        <div>
                            <h1 style={{ ...styles.headerTitle, color: categoryMeta.color }}>
                                {categoryMeta.title}
                            </h1>
                            <p style={styles.headerDescription}>{categoryMeta.description}</p>
                        </div>
                    </div>

                    <div style={styles.headerStats}>
                        <span style={styles.headerCount}>{games.length} Games</span>
                    </div>
                </div>

                {/* Games Grid */}
                <div style={styles.gamesContainer}>
                    <div style={styles.gamesGrid}>
                        {games.map((game, i) => (
                            <motion.div
                                key={game.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                            >
                                <GameCard
                                    game={game}
                                    progress={getGameProgress(game.id)}
                                    onClick={handleGameClick}
                                    index={i}
                                    image={getGameImage(game.id)}
                                />
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    page: {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
        color: '#fff',
        fontFamily: 'Inter, -apple-system, sans-serif',
        paddingBottom: 40,
    },

    loading: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a0a15',
        color: '#fff',
    },

    // Header
    header: {
        padding: '16px',
        background: 'rgba(10,10,21,0.98)',
        backdropFilter: 'blur(10px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
    },

    backButton: {
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        marginBottom: 12,
        display: 'inline-block',
    },

    headerContent: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },

    headerIcon: {
        fontSize: 40,
    },

    headerTitle: {
        fontSize: 24,
        fontWeight: 800,
        letterSpacing: 1,
        textTransform: 'uppercase',
        margin: 0,
    },

    headerDescription: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 4,
    },

    headerStats: {
        display: 'flex',
        gap: 16,
    },

    headerCount: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: 600,
    },

    // Games Grid
    gamesContainer: {
        padding: '20px 16px',
    },

    gamesGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 16,
        maxWidth: 1200,
        margin: '0 auto',
    },
};
