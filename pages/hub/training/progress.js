/**
 * Training Progress Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Displays user's training progress, stats, and achievements
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';

export default function TrainingProgress() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalQuestions: 0,
        correctAnswers: 0,
        accuracy: 0,
        totalTime: 0,
        averageTime: 0,
        streak: 0,
        categoryBreakdown: {},
        recentActivity: [],
        weakAreas: []
    });

    useEffect(() => {
        loadProgress();
    }, []);

    const loadProgress = async () => {
        try {
            const authUser = await getAuthUser();
            setUser(authUser);

            if (!authUser) {
                setLoading(false);
                return;
            }

            // Fetch training sessions
            const { data: sessions, error } = await supabase
                .from('training_sessions')
                .select('*')
                .eq('user_id', authUser.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Calculate stats
            const totalQuestions = sessions?.reduce((sum, s) => sum + (s.questions_answered || 0), 0) || 0;
            const correctAnswers = sessions?.reduce((sum, s) => sum + (s.correct_answers || 0), 0) || 0;
            const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
            const totalTime = sessions?.reduce((sum, s) => sum + (s.time_spent || 0), 0) || 0;
            const averageTime = totalQuestions > 0 ? Math.round(totalTime / totalQuestions) : 0;

            // Category breakdown
            const categoryBreakdown = {};
            sessions?.forEach(session => {
                const category = session.category || 'General';
                if (!categoryBreakdown[category]) {
                    categoryBreakdown[category] = { total: 0, correct: 0 };
                }
                categoryBreakdown[category].total += session.questions_answered || 0;
                categoryBreakdown[category].correct += session.correct_answers || 0;
            });

            // Recent activity (last 10 sessions)
            const recentActivity = sessions?.slice(0, 10).map(s => ({
                date: new Date(s.created_at),
                category: s.category || 'General',
                questions: s.questions_answered || 0,
                correct: s.correct_answers || 0,
                accuracy: s.questions_answered > 0 ? Math.round((s.correct_answers / s.questions_answered) * 100) : 0
            })) || [];

            // Weak areas (categories with < 70% accuracy)
            const weakAreas = Object.entries(categoryBreakdown)
                .map(([category, data]) => ({
                    category,
                    accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
                    total: data.total
                }))
                .filter(area => area.accuracy < 70 && area.total >= 5)
                .sort((a, b) => a.accuracy - b.accuracy);

            setStats({
                totalQuestions,
                correctAnswers,
                accuracy,
                totalTime,
                averageTime,
                streak: 0, // TODO: Calculate streak
                categoryBreakdown,
                recentActivity,
                weakAreas
            });

            setLoading(false);
        } catch (error) {
            console.error('Error loading progress:', error);
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.spinner}>📊</div>
                <p style={styles.loadingText}>Loading your progress...</p>
            </div>
        );
    }

    if (!user) {
        return (
            <PageTransition>
                <div style={styles.container}>
                    <UniversalHeader pageDepth={2} />
                    <div style={styles.emptyState}>
                        <h2>Sign in to view your progress</h2>
                        <Link href="/login">
                            <a style={styles.button}>Sign In</a>
                        </Link>
                    </div>
                </div>
            </PageTransition>
        );
    }

    return (
        <PageTransition>
            <Head>
                <title>Training Progress — Smarter.Poker</title>
            </Head>

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <h1 style={styles.title}>📊 Your Training Progress</h1>

                    {/* Overall Stats */}
                    <div style={styles.statsGrid}>
                        <StatCard
                            icon="🎯"
                            label="Total Questions"
                            value={stats.totalQuestions.toLocaleString()}
                        />
                        <StatCard
                            icon="✅"
                            label="Correct Answers"
                            value={stats.correctAnswers.toLocaleString()}
                        />
                        <StatCard
                            icon="📈"
                            label="Accuracy"
                            value={`${stats.accuracy}%`}
                            color={stats.accuracy >= 80 ? '#31A24C' : stats.accuracy >= 60 ? '#FFB800' : '#FF4444'}
                        />
                        <StatCard
                            icon="⏱️"
                            label="Avg Time/Question"
                            value={`${stats.averageTime}s`}
                        />
                    </div>

                    {/* Category Breakdown */}
                    <section style={styles.section}>
                        <h2 style={styles.sectionTitle}>📚 Category Breakdown</h2>
                        <div style={styles.categoryList}>
                            {Object.entries(stats.categoryBreakdown).map(([category, data]) => {
                                const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                                return (
                                    <CategoryCard
                                        key={category}
                                        category={category}
                                        total={data.total}
                                        correct={data.correct}
                                        accuracy={accuracy}
                                    />
                                );
                            })}
                        </div>
                    </section>

                    {/* Weak Areas */}
                    {stats.weakAreas.length > 0 && (
                        <section style={styles.section}>
                            <h2 style={styles.sectionTitle}>⚠️ Areas to Improve</h2>
                            <div style={styles.weakAreasList}>
                                {stats.weakAreas.map(area => (
                                    <WeakAreaCard key={area.category} {...area} />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Recent Activity */}
                    <section style={styles.section}>
                        <h2 style={styles.sectionTitle}>📅 Recent Activity</h2>
                        <div style={styles.activityList}>
                            {stats.recentActivity.map((activity, i) => (
                                <ActivityCard key={i} {...activity} />
                            ))}
                        </div>
                    </section>

                    {/* Actions */}
                    <div style={styles.actions}>
                        <Link href="/hub/training">
                            <a style={styles.primaryButton}>Continue Training</a>
                        </Link>
                        <Link href="/hub/training/leaderboard">
                            <a style={styles.secondaryButton}>View Leaderboard</a>
                        </Link>
                    </div>
                </div>
            </div>
        </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({ icon, label, value, color = '#00E0FF' }) {
    return (
        <motion.div
            style={styles.statCard}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
        >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>{icon}</div>
            <div style={{ ...styles.statValue, color }}>{value}</div>
            <div style={styles.statLabel}>{label}</div>
        </motion.div>
    );
}

function CategoryCard({ category, total, correct, accuracy }) {
    return (
        <div style={styles.categoryCard}>
            <div style={styles.categoryHeader}>
                <span style={styles.categoryName}>{category}</span>
                <span style={{ ...styles.categoryAccuracy, color: accuracy >= 70 ? '#31A24C' : '#FFB800' }}>
                    {accuracy}%
                </span>
            </div>
            <div style={styles.categoryStats}>
                {correct}/{total} correct
            </div>
            <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${accuracy}%`, background: accuracy >= 70 ? '#31A24C' : '#FFB800' }} />
            </div>
        </div>
    );
}

function WeakAreaCard({ category, accuracy, total }) {
    return (
        <div style={styles.weakAreaCard}>
            <div style={styles.weakAreaHeader}>
                <span>{category}</span>
                <span style={styles.weakAreaAccuracy}>{accuracy}%</span>
            </div>
            <p style={styles.weakAreaHint}>Practice more {category} questions to improve</p>
        </div>
    );
}

function ActivityCard({ date, category, questions, correct, accuracy }) {
    return (
        <div style={styles.activityCard}>
            <div style={styles.activityDate}>
                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            <div style={styles.activityDetails}>
                <div style={styles.activityCategory}>{category}</div>
                <div style={styles.activityStats}>
                    {correct}/{questions} correct ({accuracy}%)
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#FFFFFF'
    },
    content: {
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '80px 24px 40px'
    },
    title: {
        fontSize: '32px',
        fontWeight: 700,
        marginBottom: '32px',
        textAlign: 'center'
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '40px'
    },
    statCard: {
        background: '#1a1a1a',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'center'
    },
    statValue: {
        fontSize: '28px',
        fontWeight: 700,
        marginBottom: '4px'
    },
    statLabel: {
        fontSize: '14px',
        color: '#9ca3af'
    },
    section: {
        marginBottom: '40px'
    },
    sectionTitle: {
        fontSize: '20px',
        fontWeight: 600,
        marginBottom: '16px'
    },
    categoryList: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '16px'
    },
    categoryCard: {
        background: '#1a1a1a',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '16px'
    },
    categoryHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
    },
    categoryName: {
        fontSize: '16px',
        fontWeight: 600
    },
    categoryAccuracy: {
        fontSize: '18px',
        fontWeight: 700
    },
    categoryStats: {
        fontSize: '14px',
        color: '#9ca3af',
        marginBottom: '12px'
    },
    progressBar: {
        height: '6px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '3px',
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        transition: 'width 0.3s ease'
    },
    weakAreasList: {
        display: 'grid',
        gap: '12px'
    },
    weakAreaCard: {
        background: 'rgba(255, 68, 68, 0.1)',
        border: '1px solid rgba(255, 68, 68, 0.3)',
        borderRadius: '8px',
        padding: '16px'
    },
    weakAreaHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
        fontWeight: 600
    },
    weakAreaAccuracy: {
        color: '#FF4444'
    },
    weakAreaHint: {
        fontSize: '14px',
        color: '#9ca3af',
        margin: 0
    },
    activityList: {
        display: 'grid',
        gap: '12px'
    },
    activityCard: {
        display: 'flex',
        gap: '16px',
        background: '#1a1a1a',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '16px'
    },
    activityDate: {
        fontSize: '14px',
        fontWeight: 600,
        color: '#00E0FF',
        minWidth: '60px'
    },
    activityDetails: {
        flex: 1
    },
    activityCategory: {
        fontSize: '16px',
        fontWeight: 600,
        marginBottom: '4px'
    },
    activityStats: {
        fontSize: '14px',
        color: '#9ca3af'
    },
    actions: {
        display: 'flex',
        gap: '16px',
        justifyContent: 'center',
        marginTop: '40px'
    },
    primaryButton: {
        padding: '12px 32px',
        background: 'linear-gradient(135deg, #00E0FF, #0099FF)',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: '8px',
        fontSize: '16px',
        fontWeight: 600,
        cursor: 'pointer',
        textDecoration: 'none',
        display: 'inline-block'
    },
    secondaryButton: {
        padding: '12px 32px',
        background: 'transparent',
        color: '#00E0FF',
        border: '1px solid #00E0FF',
        borderRadius: '8px',
        fontSize: '16px',
        fontWeight: 600,
        cursor: 'pointer',
        textDecoration: 'none',
        display: 'inline-block'
    },
    loadingContainer: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#FFFFFF'
    },
    spinner: {
        fontSize: '48px',
        animation: 'pulse 1.5s ease-in-out infinite'
    },
    loadingText: {
        marginTop: '16px',
        color: '#9ca3af'
    },
    emptyState: {
        textAlign: 'center',
        padding: '80px 24px',
        color: '#FFFFFF'
    },
    button: {
        display: 'inline-block',
        marginTop: '24px',
        padding: '12px 32px',
        background: '#00E0FF',
        color: '#FFFFFF',
        borderRadius: '8px',
        textDecoration: 'none',
        fontWeight: 600
    }
};
