/**
 * Memory Games - Achievements
 * Wired to Supabase with real achievement tracking
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { useAvatar } from '../../../src/contexts/AvatarContext';

// Initialize Supabase
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Achievement categories for filtering
const CATEGORIES = [
    { key: 'all', label: 'All' },
    { key: 'basics', label: 'Basics' },
    { key: 'mastery', label: 'Mastery' },
    { key: 'speed', label: 'Speed' },
    { key: 'progress', label: 'Progress' },
    { key: 'consistency', label: 'Streaks' },
    { key: 'economy', label: 'Economy' },
    { key: 'games', label: 'Games' },
    { key: 'ai', label: 'AI' },
    { key: 'challenges', label: 'Challenges' },
];

// Fallback achievements if database not ready
const FALLBACK_ACHIEVEMENTS = [
    { key: 'first_game', name: 'First Match', description: 'Complete your first memory game', icon: '⭐', category: 'basics', unlocked: false },
    { key: 'perfect_memory', name: 'Perfect Memory', description: 'Complete a game with 100% accuracy', icon: '💯', category: 'mastery', unlocked: false },
    { key: 'speed_demon', name: 'Speed Demon', description: 'Complete a game in under 60 seconds', icon: '⚡', category: 'speed', unlocked: false },
    { key: 'level_5', name: 'Halfway There', description: 'Reach Level 5', icon: '📈', category: 'progress', unlocked: false },
    { key: 'level_10', name: 'Level Master', description: 'Complete Level 10', icon: '🎯', category: 'progress', unlocked: false },
    { key: 'streak_7', name: 'Week Warrior', description: 'Play 7 days in a row', icon: '💪', category: 'consistency', unlocked: false },
    { key: 'diamond_1000', name: 'Diamond Hunter', description: 'Earn 1,000 diamonds', icon: '💰', category: 'economy', unlocked: false },
    { key: 'games_100', name: 'Memory Veteran', description: 'Complete 100 games', icon: '🏅', category: 'games', unlocked: false },
    { key: 'grok_25', name: 'Grok Genius', description: 'Complete 25 AI-generated scenarios', icon: '🧠', category: 'ai', unlocked: false },
];

export default function MemoryGamesAchievements() {
    const router = useRouter();
    const { user } = useAvatar();
    const [achievements, setAchievements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');

    // Fetch achievements
    useEffect(() => {
        fetchAchievements();
    }, [user]);

    const fetchAchievements = async () => {
        setLoading(true);
        try {
            if (user?.id) {
                // Try to get user achievements from Supabase
                const { data, error } = await supabase.rpc('get_user_achievements', {
                    p_user_id: user.id
                });

                if (error) {
                    console.error('[Achievements] RPC error:', error);
                    setAchievements(FALLBACK_ACHIEVEMENTS);
                } else {
                    setAchievements(data || FALLBACK_ACHIEVEMENTS);
                }
            } else {
                setAchievements(FALLBACK_ACHIEVEMENTS);
            }
        } catch (err) {
            console.error('[Achievements] Fetch error:', err);
            setAchievements(FALLBACK_ACHIEVEMENTS);
        } finally {
            setLoading(false);
        }
    };

    // Filter achievements by category
    const filteredAchievements = selectedCategory === 'all'
        ? achievements
        : achievements.filter(a => a.category === selectedCategory);

    // Stats
    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const totalCount = achievements.length;
    const progressPercent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

    return (
        <>
            <Head>
                <title>Achievements | Memory Games</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        {/* Back Button */}
                        <button
                            onClick={() => router.push('/hub/memory-games')}
                            style={{
                                background: 'rgba(0, 212, 255, 0.1)',
                                border: '1px solid rgba(0, 212, 255, 0.3)',
                                color: '#00D4FF',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            ← Back to Memory Games
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '20px' }}>
                            🏆 Memory Achievements
                        </h1>

                        {/* Progress Banner */}
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.2))',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '16px',
                            padding: '24px',
                            marginBottom: '24px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ color: '#fff', fontSize: '24px', fontWeight: 700 }}>
                                        {unlockedCount} / {totalCount} Unlocked
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                                        {progressPercent}% Complete
                                    </div>
                                </div>
                                <div style={{ fontSize: '48px' }}>
                                    {progressPercent >= 100 ? '👑' : progressPercent >= 50 ? '🔥' : '⭐'}
                                </div>
                            </div>
                            <div style={{
                                background: 'rgba(0,0,0,0.3)',
                                borderRadius: '10px',
                                height: '12px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    background: 'linear-gradient(90deg, #8b5cf6, #ec4899)',
                                    height: '100%',
                                    width: `${progressPercent}%`,
                                    transition: 'width 0.5s ease'
                                }} />
                            </div>
                        </div>

                        {/* Category Filter */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => setSelectedCategory(cat.key)}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '20px',
                                        border: selectedCategory === cat.key
                                            ? '1px solid #8b5cf6'
                                            : '1px solid rgba(255,255,255,0.15)',
                                        background: selectedCategory === cat.key
                                            ? 'rgba(139, 92, 246, 0.2)'
                                            : 'rgba(255,255,255,0.05)',
                                        color: selectedCategory === cat.key ? '#8b5cf6' : 'rgba(255,255,255,0.7)',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 500,
                                    }}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        {/* Achievements Grid */}
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.5)' }}>
                                Loading achievements...
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                                {filteredAchievements.map(achievement => (
                                    <div
                                        key={achievement.key}
                                        style={{
                                            background: achievement.unlocked
                                                ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(236, 72, 153, 0.15))'
                                                : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${achievement.unlocked ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255,255,255,0.1)'}`,
                                            borderRadius: '16px',
                                            padding: '20px',
                                            display: 'flex',
                                            gap: '16px',
                                            alignItems: 'center',
                                            opacity: achievement.unlocked ? 1 : 0.6,
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        <div style={{
                                            fontSize: '42px',
                                            filter: achievement.unlocked ? 'none' : 'grayscale(100%)',
                                            minWidth: '50px',
                                            textAlign: 'center'
                                        }}>
                                            {achievement.icon}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{
                                                color: achievement.unlocked ? '#fff' : 'rgba(255,255,255,0.7)',
                                                fontWeight: 700,
                                                marginBottom: '4px',
                                                fontSize: '16px'
                                            }}>
                                                {achievement.name}
                                            </div>
                                            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                                                {achievement.description}
                                            </div>
                                            {achievement.unlocked && achievement.unlocked_at && (
                                                <div style={{ color: '#10b981', fontSize: '11px', marginTop: '6px' }}>
                                                    Unlocked {new Date(achievement.unlocked_at).toLocaleDateString()}
                                                </div>
                                            )}
                                        </div>
                                        {achievement.unlocked && (
                                            <div style={{
                                                color: '#10b981',
                                                fontSize: '24px',
                                            }}>
                                                ✓
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
