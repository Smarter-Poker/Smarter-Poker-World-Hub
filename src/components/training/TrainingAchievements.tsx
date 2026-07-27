/**
 * TRAINING ACHIEVEMENTS COMPONENT
 * Shows unlocked and locked achievements with progress
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const RARITY_COLORS = {
    common: { bg: 'rgba(156, 163, 175, 0.2)', border: '#9ca3af', glow: 'none' },
    rare: { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', glow: '0 0 20px rgba(59, 130, 246, 0.3)' },
    epic: { bg: 'rgba(139, 92, 246, 0.2)', border: '#8b5cf6', glow: '0 0 20px rgba(139, 92, 246, 0.4)' },
    legendary: { bg: 'rgba(255, 215, 0, 0.2)', border: '#ffd700', glow: '0 0 25px rgba(255, 215, 0, 0.5)' }
};

export function TrainingAchievements({ userId, compact = false, onNewUnlock }) {
    const [achievements, setAchievements] = useState<any[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ unlocked: 0, total: 0 });

    useEffect(() => {
        if (userId) fetchAchievements();
    }, [userId]);

    const fetchAchievements = async () => {
        try {
            const res = await fetch(`/api/training/achievements?userId=${userId}`);
            const data = await res.json();
            if (data.success) {
                setAchievements(data.achievements);
                setStats({ unlocked: data.totalUnlocked, total: data.totalAchievements });
            }
        } catch (error) {
            console.warn('Failed to fetch achievements:', error);
        }
        setLoading(false);
    };

    const categories = [
        { key: 'all', label: 'All' },
        { key: 'accuracy', label: 'Accuracy' },
        { key: 'streak', label: 'Streaks' },
        { key: 'volume', label: 'Volume' },
        { key: 'mastery', label: 'Mastery' }
    ];

    const filtered = selectedCategory === 'all'
        ? achievements
        : achievements.filter(a => a.category === selectedCategory);

    const displayed = compact ? filtered.slice(0, 6) : filtered;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.titleRow}>
                    <h3 style={styles.title}>Achievements</h3>
                    <span style={styles.progress}>
                        {stats.unlocked}/{stats.total} Unlocked
                    </span>
                </div>

                {!compact && (
                    <div style={styles.categories}>
                        {categories.map(cat => (
                            <button
                                key={cat.key}
                                onClick={() => setSelectedCategory(cat.key)}
                                style={{
                                    ...styles.catBtn,
                                    ...(selectedCategory === cat.key ? styles.catBtnActive : {})
                                }}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div style={styles.grid}>
                {loading ? (
                    <div style={styles.loading}>Loading...</div>
                ) : (
                    <AnimatePresence>
                        {displayed.map((ach, idx) => {
                            const rarity = RARITY_COLORS[ach.rarity] || RARITY_COLORS.common;
                            return (
                                <motion.div
                                    key={ach.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.05 }}
                                    style={{
                                        ...styles.achievement,
                                        background: ach.unlocked ? rarity.bg : 'rgba(50,50,50,0.5)',
                                        borderColor: ach.unlocked ? rarity.border : '#333',
                                        boxShadow: ach.unlocked ? rarity.glow : 'none',
                                        opacity: ach.unlocked ? 1 : 0.5
                                    }}
                                >
                                    <div style={styles.icon}>{ach.icon}</div>
                                    <div style={styles.achInfo}>
                                        <div style={styles.achName}>{ach.name}</div>
                                        <div style={styles.achDesc}>{ach.description}</div>
                                        {!ach.unlocked && ach.progress > 0 && (
                                            <div style={styles.progressBar}>
                                                <div
                                                    style={{
                                                        ...styles.progressFill,
                                                        width: `${(ach.progress / ach.threshold) * 100}%`
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <div style={styles.reward}>
                                        <span style={{ fontSize: 10, color: '#888' }}>Reward</span>
                                        <span style={styles.diamonds}>◆ {ach.diamond_reward}</span>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}

const styles = {
    container: {
        background: 'linear-gradient(135deg, rgba(0,0,0,0.8), rgba(20,20,40,0.9))',
        borderRadius: 16,
        border: '1px solid rgba(139,92,246,0.3)',
        overflow: 'hidden'
    },
    header: {
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
    },
    titleRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    title: {
        margin: 0,
        fontSize: 18,
        fontWeight: 700,
        color: '#8b5cf6'
    },
    progress: {
        fontSize: 12,
        color: '#888'
    },
    categories: {
        display: 'flex',
        gap: 6,
        marginTop: 12,
        flexWrap: 'wrap' as const
    },
    catBtn: {
        padding: '4px 10px',
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        borderRadius: 6,
        color: '#888',
        fontSize: 11,
        cursor: 'pointer'
    },
    catBtnActive: {
        background: 'rgba(139,92,246,0.2)',
        color: '#8b5cf6'
    },
    grid: {
        padding: 12,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 10,
        maxHeight: 400,
        overflowY: 'auto' as const
    },
    loading: {
        textAlign: 'center' as const,
        padding: 20,
        color: '#666'
    },
    achievement: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 12,
        border: '1px solid'
    },
    icon: {
        fontSize: 28,
        width: 40,
        textAlign: 'center' as const
    },
    achInfo: {
        flex: 1
    },
    achName: {
        fontWeight: 600,
        color: '#fff',
        fontSize: 13
    },
    achDesc: {
        fontSize: 11,
        color: '#888',
        marginTop: 2
    },
    progressBar: {
        marginTop: 6,
        height: 4,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
        borderRadius: 2
    },
    reward: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'flex-end'
    },
    diamonds: {
        color: '#00d4ff',
        fontWeight: 600,
        fontSize: 12
    }
};

export default TrainingAchievements;
