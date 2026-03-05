/**
 * Training Achievements Page
 * ═══════════════════════════════════════════════════════════════════════════
 * View all achievements and progress
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';

const RARITY_COLORS = {
    common: '#9ca3af',
    uncommon: '#22c55e',
    rare: '#3b82f6',
    epic: '#a855f7',
    legendary: '#fbbf24'
};

const CATEGORY_ICONS = {
    accuracy: '🎯',
    streak: '🔥',
    volume: '📚',
    mastery: '👑'
};

export default function TrainingAchievements() {
    const [user, setUser] = useState(null);
    const [activeCategory, setActiveCategory] = useState('all');

    // Load auth user once
    useEffect(() => {
        getAuthUser().then(u => setUser(u)).catch(() => { });
    }, []);

    // SWR-backed achievements fetch — only fires when user is known
    const swrKey = user ? `/api/training/achievements?userId=${user.id}` : null;
    const { data: swrData, isLoading: loading } = useSWR(swrKey, (url) =>
        fetch(url).then(r => r.json()).then(d => d.success ? (d.achievements || []) : [])
    );
    const achievements = swrData || [];

    const categories = ['all', 'accuracy', 'streak', 'volume', 'mastery'];

    const filteredAchievements = activeCategory === 'all'
        ? achievements
        : achievements.filter(a => a.category === activeCategory);

    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const totalDiamonds = achievements.filter(a => a.unlocked).reduce((sum, a) => sum + (a.diamond_reward || 0), 0);

    return (
        <PageTransition>
            <SEOHead
                title="Training Achievements — Milestones Unlocked"
                description="Track Your GTO Training Achievements And Milestones On Smarter.Poker."
                canonical="/hub/training/achievements"
            />

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <h1 style={styles.title}>🏅 Training Achievements</h1>

                    {/* Stats Overview */}
                    <div style={styles.statsRow}>
                        <div style={styles.statBox}>
                            <div style={styles.statValue}>{unlockedCount}/{achievements.length}</div>
                            <div style={styles.statLabel}>Unlocked</div>
                        </div>
                        <div style={styles.statBox}>
                            <div style={{ ...styles.statValue, color: '#00E0FF' }}>{totalDiamonds}</div>
                            <div style={styles.statLabel}>Diamonds Earned</div>
                        </div>
                    </div>

                    {/* Category Filter */}
                    <div style={styles.filters}>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                style={activeCategory === cat ? styles.filterActive : styles.filterBtn}
                                onClick={() => setActiveCategory(cat)}
                            >
                                {cat === 'all' ? 'ALL' : `${CATEGORY_ICONS[cat]} ${cat.toUpperCase()}`}
                            </button>
                        ))}
                    </div>

                    {/* Achievement List */}
                    {loading ? (
                        <div style={styles.loading}>Loading Achievements...</div>
                    ) : (
                        <div style={styles.grid}>
                            {filteredAchievements.map((ach, i) => (
                                <div
                                    key={ach.id}
                                    style={{
                                        ...styles.achCard,
                                        opacity: ach.unlocked ? 1 : 0.5,
                                        borderColor: ach.unlocked ? RARITY_COLORS[ach.rarity] : '#333'
                                    }}
                                >
                                    <div style={styles.achIcon}>{ach.icon || '🏆'}</div>
                                    <div style={styles.achInfo}>
                                        <div style={styles.achName}>{ach.name}</div>
                                        <div style={styles.achDesc}>{ach.description}</div>
                                        <div style={{ ...styles.achRarity, color: RARITY_COLORS[ach.rarity] }}>
                                            {ach.rarity?.toUpperCase()}
                                        </div>
                                    </div>
                                    <div style={styles.reward}>
                                        <span style={styles.diamonds}>{ach.diamond_reward}</span>
                                        {ach.unlocked && <span style={styles.unlocked}>✓</span>}
                                    </div>
                                </div>
                            ))}

                            {filteredAchievements.length === 0 && (
                                <div style={styles.empty}>
                                    {user ? 'No achievements in this category yet!' : 'Sign in to track achievements'}
                                </div>
                            )}
                        </div>
                    )}



                </div>
            </div>
        </PageTransition>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#FFFFFF'
    },
    content: {
        maxWidth: '800px',
        margin: '0 auto',
        padding: '80px 24px 40px'
    },
    title: {
        fontSize: '28px',
        fontWeight: 700,
        marginBottom: '24px',
        textAlign: 'center'
    },
    statsRow: {
        display: 'flex',
        gap: '16px',
        justifyContent: 'center',
        marginBottom: '24px'
    },
    statBox: {
        padding: '16px 32px',
        background: '#1a1a1a',
        borderRadius: '12px',
        textAlign: 'center'
    },
    statValue: {
        fontSize: '24px',
        fontWeight: 700,
        color: '#fbbf24'
    },
    statLabel: {
        fontSize: '12px',
        color: '#9ca3af',
        marginTop: '4px'
    },
    filters: {
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginBottom: '24px'
    },
    filterBtn: {
        padding: '8px 16px',
        background: 'transparent',
        border: '1px solid #333',
        borderRadius: '8px',
        color: '#9ca3af',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer'
    },
    filterActive: {
        padding: '8px 16px',
        background: '#00E0FF',
        border: '1px solid #00E0FF',
        borderRadius: '8px',
        color: '#000',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer'
    },
    loading: {
        textAlign: 'center',
        padding: '40px',
        color: '#9ca3af'
    },
    grid: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    },
    achCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '16px',
        background: '#1a1a1a',
        border: '2px solid #333',
        borderRadius: '12px'
    },
    achIcon: {
        fontSize: '32px'
    },
    achInfo: {
        flex: 1
    },
    achName: {
        fontSize: '16px',
        fontWeight: 600
    },
    achDesc: {
        fontSize: '13px',
        color: '#9ca3af',
        marginTop: '4px'
    },
    achRarity: {
        fontSize: '10px',
        fontWeight: 700,
        marginTop: '4px'
    },
    reward: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end'
    },
    diamonds: {
        fontSize: '18px',
        fontWeight: 700,
        color: '#00E0FF'
    },
    unlocked: {
        color: '#22c55e',
        fontSize: '20px',
        marginTop: '4px'
    },
    empty: {
        textAlign: 'center',
        padding: '40px',
        color: '#666'
    },
    backLink: {
        display: 'block',
        textAlign: 'center',
        marginTop: '32px',
        color: '#00E0FF',
        textDecoration: 'none'
    }
};
