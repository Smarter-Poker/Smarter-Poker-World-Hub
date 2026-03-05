/**
 * 🔥 TRAINING STREAKS PAGE
 * ═══════════════════════════════════════════════════════════════════════════
 * Visual streak calendar, milestone progress, and reward claiming
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';

// Milestone definitions (must match API)
const STREAK_MILESTONES = [
    { days: 3, diamonds: 25, name: '3-Day Streak', icon: '🔥' },
    { days: 7, diamonds: 75, name: 'Week Warrior', icon: '⚡' },
    { days: 14, diamonds: 150, name: 'Two Week Champion', icon: '💪' },
    { days: 30, diamonds: 400, name: 'Monthly Master', icon: '🏆' },
    { days: 60, diamonds: 800, name: 'Double Month Legend', icon: '👑' },
    { days: 100, diamonds: 2000, name: 'Century Grinder', icon: '🌟' },
    { days: 365, diamonds: 10000, name: 'Year of Dedication', icon: '🎖️' },
];

export default function StreaksPage() {
    const [user, setUser] = useState(null);
    const [claiming, setClaiming] = useState(null);

    useEffect(() => {
        getAuthUser().then(u => setUser(u)).catch(() => {});
    }, []);

    const swrKey = user ? `/api/training/streak?userId=${user.id}` : null;
    const { data: swrData, isLoading: loading, mutate: refreshStreak } = useSWR(swrKey, async (url) => {
        const [streakRes, { data: sessions }] = await Promise.all([
            fetch(url).then(r => r.json()),
            supabase.from('jarvis_training_sessions')
                .select('created_at')
                .eq('user_id', user.id)
                .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        ]);
        const uniqueDays = [...new Set((sessions || []).map(s => new Date(s.created_at).toISOString().split('T')[0]))];
        return {
            streak: streakRes.success && streakRes.streak ? streakRes.streak : { currentStreak: 0, longestStreak: 0, lastTrainingDate: null, streakStartDate: null, allMilestones: [], claimableMilestones: [] },
            trainingDays: uniqueDays
        };
    });
    const streak = swrData?.streak || { currentStreak: 0, longestStreak: 0, lastTrainingDate: null, streakStartDate: null, allMilestones: [], claimableMilestones: [] };
    const trainingDays = swrData?.trainingDays || [];

    const loadStreakData = () => refreshStreak();

    const claimMilestone = async (milestoneDays) => {
        if (!user) return;
        setClaiming(milestoneDays);

        try {
            const res = await fetch('/api/training/streak', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    milestoneDays
                })
            });

            const data = await res.json();
            if (data.success) {
                // Refresh data
                loadStreakData();
            }
        } catch (error) {
            console.error('Claim error:', error);
        } finally {
            setClaiming(null);
        }
    };

    // Generate 30-day calendar
    const generateCalendar = () => {
        const days = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            days.push({
                date: dateStr,
                dayOfMonth: date.getDate(),
                isToday: i === 0,
                trained: trainingDays.includes(dateStr)
            });
        }
        return days;
    };

    if (loading) {
        return (
            <div style={{ ...styles.loadingContainer, padding: 24 }}>
                <SkeletonLoader variant="profile" style={{ maxWidth: 480, margin: '0 auto 24px' }} />
                <SkeletonLoader variant="card" count={2} style={{ maxWidth: 480, margin: '0 auto' }} />
            </div>
        );
    }

    if (!user) {
        return (
            <PageTransition>
                <div style={styles.container}>
                    <UniversalHeader pageDepth={2} />
                    <div style={styles.emptyState}>
                        <h2>Sign In To View Your Streak</h2>
                        <Link href="/login" style={styles.button}>Sign In</Link>
                    </div>
                </div>
            </PageTransition>
        );
    }

    const calendar = generateCalendar();
    const nextMilestone = STREAK_MILESTONES.find(m => m.days > streak.currentStreak);

    return (
        <PageTransition>
            <SEOHead
                title="Training Streaks — Stay Consistent"
                description="Build And Maintain Your Daily Training Streaks On Smarter.Poker."
                canonical="/hub/training/streaks"
                noindex={true}
            />

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    {/* Hero Section */}
                    <motion.div
                        style={styles.heroSection}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div style={styles.flameContainer}>
                            <span style={styles.flame}>🔥</span>
                        </div>
                        <div style={styles.streakNumber}>{streak.currentStreak}</div>
                        <div style={styles.streakLabel}>Day Streak</div>
                        {streak.longestStreak > streak.currentStreak && (
                            <div style={styles.longestStreak}>
                                Best: {streak.longestStreak} days
                            </div>
                        )}
                        {streak.currentStreak >= 3 && (
                            <button
                                onClick={async () => {
                                    try {
                                        const res = await fetch('/api/training/share', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                userId: user.id,
                                                shareType: 'streak',
                                                data: {
                                                    days: streak.currentStreak
                                                }
                                            })
                                        });
                                        const data = await res.json();
                                        if (data.success) {
                                            alert('🔥 Streak shared to your feed!');
                                        }
                                    } catch (e) {
                                        console.error('Share error:', e);
                                    }
                                }}
                                style={styles.shareStreakBtn}
                            >
                                📢 Share Streak
                            </button>
                        )}
                    </motion.div>

                    {/* Next Milestone Progress */}
                    {nextMilestone && (
                        <div style={styles.nextMilestoneCard}>
                            <div style={styles.nextMilestoneHeader}>
                                <span>{nextMilestone.icon} Next: {nextMilestone.name}</span>
                                <span style={styles.diamondReward}>
                                    💎 {nextMilestone.diamonds}
                                </span>
                            </div>
                            <div style={styles.progressBarContainer}>
                                <div
                                    style={{
                                        ...styles.progressBarFill,
                                        width: `${(streak.currentStreak / nextMilestone.days) * 100}%`
                                    }}
                                />
                            </div>
                            <div style={styles.progressText}>
                                {streak.currentStreak}/{nextMilestone.days} days
                            </div>
                        </div>
                    )}

                    {/* 30-Day Calendar */}
                    <section style={styles.section}>
                        <h2 style={styles.sectionTitle}>📅 Last 30 Days</h2>
                        <div style={styles.calendarGrid}>
                            {calendar.map((day, i) => (
                                <motion.div
                                    key={day.date}
                                    style={{
                                        ...styles.calendarDay,
                                        background: day.trained
                                            ? 'linear-gradient(135deg, #FF6B35, #FF4444)'
                                            : day.isToday
                                                ? 'rgba(0, 224, 255, 0.2)'
                                                : '#1a1a1a',
                                        border: day.isToday ? '2px solid #00E0FF' : '1px solid rgba(255,255,255,0.1)'
                                    }}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: i * 0.02 }}
                                >
                                    <span style={styles.calendarDayNumber}>{day.dayOfMonth}</span>
                                    {day.trained && <span style={styles.trainedIndicator}>🔥</span>}
                                </motion.div>
                            ))}
                        </div>
                        <div style={styles.calendarLegend}>
                            <span><span style={styles.legendDot} /> Trained</span>
                            <span><span style={{ ...styles.legendDot, background: '#00E0FF' }} /> Today</span>
                        </div>
                    </section>

                    {/* Milestones */}
                    <section style={styles.section}>
                        <h2 style={styles.sectionTitle}>🏆 Milestones</h2>
                        <div style={styles.milestonesGrid}>
                            {(streak.allMilestones || STREAK_MILESTONES.map(m => ({
                                ...m,
                                achieved: m.days <= streak.currentStreak,
                                claimed: false
                            }))).map(milestone => {
                                const isClaimable = milestone.achieved && !milestone.claimed;
                                const baseData = STREAK_MILESTONES.find(m => m.days === milestone.days) || milestone;

                                return (
                                    <motion.div
                                        key={milestone.days}
                                        style={{
                                            ...styles.milestoneCard,
                                            opacity: milestone.achieved ? 1 : 0.5,
                                            border: isClaimable ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.1)'
                                        }}
                                        whileHover={isClaimable ? { scale: 1.02 } : {}}
                                    >
                                        <div style={styles.milestoneIcon}>{baseData.icon}</div>
                                        <div style={styles.milestoneInfo}>
                                            <div style={styles.milestoneName}>{baseData.name}</div>
                                            <div style={styles.milestoneDays}>{baseData.days} days</div>
                                        </div>
                                        <div style={styles.milestoneReward}>
                                            💎 {baseData.diamonds}
                                        </div>
                                        {milestone.claimed ? (
                                            <div style={styles.claimedBadge}>✅ Claimed</div>
                                        ) : isClaimable ? (
                                            <button
                                                onClick={() => claimMilestone(milestone.days)}
                                                disabled={claiming === milestone.days}
                                                style={styles.claimButton}
                                            >
                                                {claiming === milestone.days ? 'Claiming...' : 'Claim'}
                                            </button>
                                        ) : null}
                                    </motion.div>
                                );
                            })}
                        </div>
                    </section>



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
        background: '#0a0a0a',
        color: '#FFFFFF'
    },
    content: {
        maxWidth: '600px',
        margin: '0 auto',
        padding: '80px 24px 40px'
    },
    heroSection: {
        textAlign: 'center',
        padding: '40px 20px',
        background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.1), rgba(255, 68, 68, 0.1))',
        borderRadius: '20px',
        marginBottom: '24px'
    },
    flameContainer: {
        marginBottom: '16px'
    },
    flame: {
        fontSize: '64px',
        animation: 'pulse 1.5s ease-in-out infinite'
    },
    streakNumber: {
        fontSize: '72px',
        fontWeight: 800,
        background: 'linear-gradient(135deg, #FF6B35, #FF4444)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
    },
    streakLabel: {
        fontSize: '20px',
        color: '#9ca3af',
        marginTop: '8px'
    },
    longestStreak: {
        marginTop: '16px',
        fontSize: '14px',
        color: '#6b7280',
        background: 'rgba(255,255,255,0.05)',
        padding: '8px 16px',
        borderRadius: '20px',
        display: 'inline-block'
    },
    shareStreakBtn: {
        marginTop: '20px',
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #00E0FF, #0099FF)',
        border: 'none',
        borderRadius: '12px',
        color: '#fff',
        fontWeight: 600,
        fontSize: '14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        margin: '20px auto 0'
    },
    nextMilestoneCard: {
        background: '#1a1a1a',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px'
    },
    nextMilestoneHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        fontWeight: 600
    },
    diamondReward: {
        color: '#00E0FF'
    },
    progressBarContainer: {
        height: '8px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '8px'
    },
    progressBarFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #FF6B35, #FFD700)',
        borderRadius: '4px',
        transition: 'width 0.3s ease'
    },
    progressText: {
        fontSize: '14px',
        color: '#9ca3af',
        textAlign: 'center'
    },
    section: {
        marginBottom: '32px'
    },
    sectionTitle: {
        fontSize: '18px',
        fontWeight: 600,
        marginBottom: '16px'
    },
    calendarGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '6px',
        marginBottom: '16px'
    },
    calendarDay: {
        aspectRatio: '1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '8px',
        position: 'relative'
    },
    calendarDayNumber: {
        fontSize: '12px',
        fontWeight: 500
    },
    trainedIndicator: {
        fontSize: '10px',
        position: 'absolute',
        bottom: '2px'
    },
    calendarLegend: {
        display: 'flex',
        gap: '20px',
        justifyContent: 'center',
        fontSize: '12px',
        color: '#9ca3af'
    },
    legendDot: {
        display: 'inline-block',
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #FF6B35, #FF4444)',
        marginRight: '6px',
        verticalAlign: 'middle'
    },
    milestonesGrid: {
        display: 'grid',
        gap: '12px'
    },
    milestoneCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: '#1a1a1a',
        borderRadius: '12px',
        padding: '16px'
    },
    milestoneIcon: {
        fontSize: '32px'
    },
    milestoneInfo: {
        flex: 1
    },
    milestoneName: {
        fontWeight: 600,
        marginBottom: '4px'
    },
    milestoneDays: {
        fontSize: '13px',
        color: '#9ca3af'
    },
    milestoneReward: {
        fontSize: '16px',
        fontWeight: 600,
        color: '#00E0FF'
    },
    claimedBadge: {
        fontSize: '14px',
        color: '#31A24C',
        padding: '6px 12px',
        background: 'rgba(49, 162, 76, 0.1)',
        borderRadius: '6px'
    },
    claimButton: {
        padding: '8px 16px',
        background: 'linear-gradient(135deg, #FFD700, #FF6B35)',
        border: 'none',
        borderRadius: '6px',
        color: '#000',
        fontWeight: 600,
        cursor: 'pointer'
    },
    actions: {
        textAlign: 'center',
        marginTop: '40px'
    },
    backButton: {
        color: '#00E0FF',
        textDecoration: 'none',
        fontSize: '16px'
    },
    loadingContainer: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a'
    },
    loadingText: {
        color: '#9ca3af'
    },
    emptyState: {
        textAlign: 'center',
        padding: '80px 24px'
    },
    button: {
        display: 'inline-block',
        marginTop: '24px',
        padding: '12px 32px',
        background: '#00E0FF',
        color: '#000',
        borderRadius: '8px',
        textDecoration: 'none',
        fontWeight: 600
    }
};
