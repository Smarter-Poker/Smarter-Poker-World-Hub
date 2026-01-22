/* ═══════════════════════════════════════════════════════════════════════════
   TRIVIA ORB — Poker Trivia & Knowledge Games
   Test your poker knowledge and earn diamonds
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// God-Mode Stack
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// ═══════════════════════════════════════════════════════════════════════════
// TRIVIA CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════
const TRIVIA_CATEGORIES = [
    {
        id: 'history',
        name: 'Poker History',
        icon: '📜',
        description: 'Origins, legends, and iconic moments',
        questions: 50,
        color: '#8B4513',
    },
    {
        id: 'wsop',
        name: 'WSOP Knowledge',
        icon: '🏆',
        description: 'World Series of Poker facts',
        questions: 75,
        color: '#FFD700',
    },
    {
        id: 'math',
        name: 'Poker Math',
        icon: '🧮',
        description: 'Odds, probabilities, and calculations',
        questions: 100,
        color: '#00D4FF',
    },
    {
        id: 'pros',
        name: 'Pro Players',
        icon: '⭐',
        description: 'Famous players and their achievements',
        questions: 60,
        color: '#ff6b9d',
    },
    {
        id: 'rules',
        name: 'Rules & Etiquette',
        icon: '📋',
        description: 'Official rules and table manners',
        questions: 40,
        color: '#00ff88',
    },
    {
        id: 'strategy',
        name: 'Strategy Concepts',
        icon: '🧠',
        description: 'GTO, exploitative play, and theory',
        questions: 80,
        color: '#8a2be2',
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function CategoryCard({ category, onSelect }) {
    return (
        <motion.div
            whileHover={{ scale: 1.02, y: -4 }}
            onClick={() => onSelect(category.id)}
            style={{
                ...styles.categoryCard,
                borderColor: category.color,
            }}
        >
            <div style={{ ...styles.categoryIcon, background: `${category.color}22` }}>
                <span style={{ fontSize: 36 }}>{category.icon}</span>
            </div>
            <div style={styles.categoryInfo}>
                <h3 style={styles.categoryName}>{category.name}</h3>
                <p style={styles.categoryDescription}>{category.description}</p>
                <div style={styles.categoryMeta}>
                    <span style={{ color: category.color }}>{category.questions} questions</span>
                </div>
            </div>
            <div style={styles.playBadge}>COMING SOON</div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TRIVIA ORB PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function TriviaOrbPage() {
    const router = useRouter();
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [userStats, setUserStats] = useState({
        totalAnswered: 0,
        correctAnswers: 0,
        diamondsEarned: 0,
        streak: 0,
    });

    return (
        <PageTransition>
            <Head>
                <title>Trivia Orb — Smarter.Poker</title>
                <meta name="description" content="Test your poker knowledge and earn diamonds" />
                <meta name="viewport" content="width=800, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    .trivia-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .trivia-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .trivia-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .trivia-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .trivia-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .trivia-page { zoom: 1.5; } }
                `}</style>
            </Head>

            <div className="trivia-page" style={styles.container}>
                {/* Background */}
                <div style={styles.bgGrid} />
                <div style={styles.bgGlow} />

                {/* Header */}
                <UniversalHeader pageDepth={1} />

                <div style={styles.header}>
                    <h1 style={styles.pageTitle}>🎯 Trivia Orb</h1>
                </div>

                {/* Main Content */}
                <div style={styles.content}>
                    {/* Stats Banner */}
                    <div style={styles.statsBanner}>
                        <div style={styles.statItem}>
                            <span style={styles.statValue}>{userStats.totalAnswered}</span>
                            <span style={styles.statLabel}>Answered</span>
                        </div>
                        <div style={styles.statDivider} />
                        <div style={styles.statItem}>
                            <span style={styles.statValue}>{userStats.correctAnswers}</span>
                            <span style={styles.statLabel}>Correct</span>
                        </div>
                        <div style={styles.statDivider} />
                        <div style={styles.statItem}>
                            <span style={{ ...styles.statValue, color: '#00D4FF' }}>{userStats.diamondsEarned} 💎</span>
                            <span style={styles.statLabel}>Earned</span>
                        </div>
                        <div style={styles.statDivider} />
                        <div style={styles.statItem}>
                            <span style={{ ...styles.statValue, color: '#ff6b9d' }}>{userStats.streak} 🔥</span>
                            <span style={styles.statLabel}>Streak</span>
                        </div>
                    </div>

                    {/* Categories Grid */}
                    <h2 style={styles.sectionTitle}>Choose a Category</h2>
                    <div style={styles.categoriesGrid}>
                        {TRIVIA_CATEGORIES.map(cat => (
                            <CategoryCard
                                key={cat.id}
                                category={cat}
                                onSelect={setSelectedCategory}
                            />
                        ))}
                    </div>

                    {/* Rewards Info */}
                    <div style={styles.rewardsInfo}>
                        <h3 style={styles.rewardsTitle}>💎 Diamond Rewards</h3>
                        <div style={styles.rewardsGrid}>
                            <div style={styles.rewardItem}>
                                <span>Correct Answer</span>
                                <span style={styles.rewardValue}>+2 💎</span>
                            </div>
                            <div style={styles.rewardItem}>
                                <span>5-Streak Bonus</span>
                                <span style={styles.rewardValue}>+10 💎</span>
                            </div>
                            <div style={styles.rewardItem}>
                                <span>Perfect Round (10/10)</span>
                                <span style={styles.rewardValue}>+50 💎</span>
                            </div>
                            <div style={styles.rewardItem}>
                                <span>Category Mastery</span>
                                <span style={styles.rewardValue}>+100 💎</span>
                            </div>
                        </div>
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
    container: {
        minHeight: '100vh',
        background: '#0a1628',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
    },
    bgGrid: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(255, 107, 157, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 107, 157, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: '30%', left: '50%',
        width: '100%', height: '100%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at center, rgba(255, 107, 157, 0.08), transparent 60%)',
        pointerEvents: 'none',
    },
    header: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'sticky',
        top: 0,
        background: 'rgba(10, 22, 40, 0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: 100,
    },
    pageTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: '#fff',
    },
    content: {
        maxWidth: 800,
        margin: '0 auto',
        padding: '32px 24px',
    },
    statsBanner: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 24,
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        padding: '20px 32px',
        marginBottom: 32,
    },
    statItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    statValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
    },
    statLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 4,
    },
    statDivider: {
        width: 1,
        height: 40,
        background: 'rgba(255, 255, 255, 0.1)',
    },
    sectionTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 20,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 20,
    },
    categoriesGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 16,
        marginBottom: 32,
    },
    categoryCard: {
        position: 'relative',
        display: 'flex',
        gap: 16,
        background: 'rgba(255, 255, 255, 0.03)',
        border: '2px solid',
        borderRadius: 16,
        padding: '20px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    categoryIcon: {
        width: 60,
        height: 60,
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    categoryInfo: {
        flex: 1,
    },
    categoryName: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 6,
    },
    categoryDescription: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 8,
        lineHeight: 1.4,
    },
    categoryMeta: {
        fontSize: 13,
        fontWeight: 600,
    },
    playBadge: {
        position: 'absolute',
        top: 12,
        right: 12,
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 9,
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    rewardsInfo: {
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(138, 43, 226, 0.1))',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 16,
        padding: '24px',
    },
    rewardsTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 16,
        textAlign: 'center',
    },
    rewardsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
    },
    rewardItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 10,
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
    },
    rewardValue: {
        fontWeight: 600,
        color: '#00D4FF',
    },
};
