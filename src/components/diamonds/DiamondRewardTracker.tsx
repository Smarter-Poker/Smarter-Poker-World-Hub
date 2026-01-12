/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND REWARD TRACKER — Visual display of all earnable rewards
   Shows standard payouts, easter eggs, and daily progress
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { REWARD_RULES } from '../../services/DiamondRewardService';

// ═══════════════════════════════════════════════════════════════════════════
// REWARD DATA (Static for display)
// ═══════════════════════════════════════════════════════════════════════════

const STANDARD_PAYOUTS = [
    { id: 'daily_login', name: 'Daily Login', diamonds: '5-50', note: 'Scales with streak', icon: '📅', repeatable: true },
    { id: 'first_training', name: 'First Training of Day', diamonds: 25, icon: '🎯', repeatable: true },
    { id: 'level_85', name: 'Level Completion (85%+)', diamonds: 10, icon: '✅', repeatable: true },
    { id: 'perfect_score', name: 'Perfect Score Bonus', diamonds: 5, icon: '💯', repeatable: true },
    { id: 'new_level', name: 'New Level Unlocked', diamonds: 50, icon: '🔓', repeatable: true },
    { id: 'social_post', name: 'Share a Post', diamonds: 15, icon: '📝', repeatable: true },
    { id: 'strategy_comment', name: 'Strategy Comment', diamonds: 5, icon: '💬', repeatable: true },
    { id: 'xp_level_up', name: 'XP Level Up', diamonds: 100, icon: '⬆️', repeatable: true },
    { id: 'chart_study', name: 'GTO Chart Study (3+ min)', diamonds: 10, icon: '📊', repeatable: true },
    { id: 'referral', name: 'Referral Success', diamonds: 500, icon: '👥', note: 'Bypasses cap!', bypasses: true },
];

const EASTER_EGG_CATEGORIES = [
    {
        name: 'Performance',
        range: '1-10',
        color: '#00D4FF',
        eggs: [
            { name: 'GTO Machine', desc: '100 questions, no hints', diamonds: 100, rarity: 'epic' },
            { name: 'Speed Demon', desc: '20 answers < 3s each', diamonds: 50, rarity: 'rare' },
            { name: 'The Optimizer', desc: 'First-try Leak Signal fix', diamonds: 40, rarity: 'uncommon' },
            { name: 'Dead Reckoning', desc: 'Level 5+ 100% first try', diamonds: 200, rarity: 'legendary' },
            { name: 'The Perfectionist', desc: '5 levels, 0 errors', diamonds: 150, rarity: 'epic' },
        ],
    },
    {
        name: 'Timing & Loyalty',
        range: '11-25',
        color: '#00ff88',
        eggs: [
            { name: 'The Night Owl', desc: 'Train at 2AM-5AM', diamonds: 50, rarity: 'rare' },
            { name: 'Weekend Warrior', desc: 'Hit 500 cap Sat & Sun', diamonds: 150, rarity: 'epic' },
            { name: 'The Ghost', desc: '30-day perfect streak', diamonds: 500, rarity: 'legendary' },
            { name: 'The Jackpot', desc: '1/1000 Diamond Crit', diamonds: 45, rarity: 'legendary' },
            { name: 'Button Masher', desc: 'Click logo 10x rapidly', diamonds: 5, rarity: 'common' },
        ],
    },
    {
        name: 'Strategy Mastery',
        range: '26-45',
        color: '#8a2be2',
        eggs: [
            { name: 'Pre-Flop Bot', desc: '500 preflop at 100%', diamonds: 250, rarity: 'legendary' },
            { name: 'The Sniper', desc: 'Level in < 10s total', diamonds: 150, rarity: 'legendary' },
            { name: 'Value Extractor', desc: 'Max EV in one level', diamonds: 80, rarity: 'epic' },
            { name: 'The Bluffcatcher', desc: 'Call triple-barrel bluff', diamonds: 50, rarity: 'rare' },
            { name: 'Folding Legend', desc: 'GTO Fold with Top Pair', diamonds: 60, rarity: 'rare' },
        ],
    },
    {
        name: 'Social & Viral',
        range: '46-65',
        color: '#ff6b9d',
        eggs: [
            { name: 'The Whale', desc: '100 referrals', diamonds: 10000, rarity: 'legendary' },
            { name: 'The Ambassador', desc: '20 referrals', diamonds: 1000, rarity: 'legendary' },
            { name: 'Retweet Royalty', desc: 'Developer shares post', diamonds: 500, rarity: 'legendary' },
            { name: 'Wall of Fame', desc: 'Daily Top Grinder', diamonds: 300, rarity: 'legendary' },
            { name: 'Squad Goals', desc: '5 referrals active', diamonds: 250, rarity: 'epic' },
        ],
    },
    {
        name: 'Meta & Interface',
        range: '66-85',
        color: '#ffa500',
        eggs: [
            { name: 'Konami Code', desc: 'Up Up Down Down...', diamonds: 50, rarity: 'rare' },
            { name: 'The Minimalist', desc: 'Play with 0 HUD', diamonds: 100, rarity: 'epic' },
            { name: 'Multi-Tabber', desc: '4 charts in 4 windows', diamonds: 100, rarity: 'epic' },
            { name: 'Terminal Junkie', desc: '10 commands, no mouse', diamonds: 75, rarity: 'rare' },
            { name: 'Developer\'s Handshake', desc: 'Scroll Credits bottom', diamonds: 50, rarity: 'rare' },
        ],
    },
    {
        name: 'Legacy Milestones',
        range: '86-100+',
        color: '#FFD700',
        eggs: [
            { name: 'To Infinity', desc: '1M total diamonds', diamonds: 5000, rarity: 'legendary' },
            { name: 'Millionaire', desc: '1M lifetime XP', diamonds: 2500, rarity: 'legendary' },
            { name: 'The Finisher', desc: 'Complete every game', diamonds: 2000, rarity: 'legendary' },
            { name: 'Zero Leak', desc: '1K hands, no leaks', diamonds: 1500, rarity: 'legendary' },
            { name: 'The Centurion', desc: '100-day streak', diamonds: 1000, rarity: 'legendary' },
        ],
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// RARITY BADGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function RarityBadge({ rarity }: { rarity: string }) {
    const colors: Record<string, { bg: string; text: string }> = {
        common: { bg: 'rgba(255,255,255,0.1)', text: 'rgba(255,255,255,0.6)' },
        uncommon: { bg: 'rgba(0,255,136,0.2)', text: '#00ff88' },
        rare: { bg: 'rgba(138,43,226,0.2)', text: '#8a2be2' },
        epic: { bg: 'rgba(255,107,157,0.2)', text: '#ff6b9d' },
        legendary: { bg: 'rgba(255,215,0,0.2)', text: '#FFD700' },
    };

    const style = colors[rarity] || colors.common;

    return (
        <span
            style={{
                padding: '2px 8px',
                background: style.bg,
                color: style.text,
                fontSize: 10,
                fontWeight: 600,
                borderRadius: 4,
                textTransform: 'uppercase',
            }}
        >
            {rarity}
        </span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN REWARD TRACKER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface RewardTrackerProps {
    diamondsToday?: number;
    currentStreak?: number;
}

export function DiamondRewardTracker({ diamondsToday = 0, currentStreak = 0 }: RewardTrackerProps) {
    const [activeTab, setActiveTab] = useState<'standard' | 'easter'>('standard');
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

    const streakMultiplier = currentStreak >= 7 ? 2.0 : currentStreak >= 4 ? 1.5 : 1.0;
    const remainingCap = Math.max(0, REWARD_RULES.DAILY_CAP - diamondsToday);

    return (
        <div style={styles.container}>
            {/* Header with Daily Progress */}
            <div style={styles.header}>
                <div style={styles.progressSection}>
                    <div style={styles.progressLabel}>
                        <span>Today's Earnings</span>
                        <span style={styles.capText}>{diamondsToday} / {REWARD_RULES.DAILY_CAP}</span>
                    </div>
                    <div style={styles.progressBar}>
                        <div
                            style={{
                                ...styles.progressFill,
                                width: `${Math.min((diamondsToday / REWARD_RULES.DAILY_CAP) * 100, 100)}%`,
                            }}
                        />
                    </div>
                    <div style={styles.remainingText}>
                        {remainingCap > 0 ? `${remainingCap} 💎 remaining` : '🎉 Cap reached!'}
                    </div>
                </div>

                <div style={styles.streakSection}>
                    <div style={styles.streakNumber}>{currentStreak}</div>
                    <div style={styles.streakLabel}>Day Streak</div>
                    {streakMultiplier > 1 && (
                        <div style={styles.multiplierBadge}>{streakMultiplier}x</div>
                    )}
                </div>
            </div>

            {/* Tab Switcher */}
            <div style={styles.tabBar}>
                <button
                    onClick={() => setActiveTab('standard')}
                    style={{
                        ...styles.tab,
                        ...(activeTab === 'standard' ? styles.tabActive : {}),
                    }}
                >
                    💰 Standard Rewards
                </button>
                <button
                    onClick={() => setActiveTab('easter')}
                    style={{
                        ...styles.tab,
                        ...(activeTab === 'easter' ? styles.tabActive : {}),
                    }}
                >
                    🥚 Easter Eggs (100+)
                </button>
            </div>

            {/* Content */}
            <div style={styles.content}>
                {activeTab === 'standard' ? (
                    <div style={styles.standardList}>
                        {STANDARD_PAYOUTS.map((reward) => (
                            <div key={reward.id} style={styles.rewardRow}>
                                <span style={styles.rewardIcon}>{reward.icon}</span>
                                <div style={styles.rewardInfo}>
                                    <div style={styles.rewardName}>{reward.name}</div>
                                    {reward.note && (
                                        <div style={styles.rewardNote}>{reward.note}</div>
                                    )}
                                </div>
                                <div style={styles.rewardDiamonds}>
                                    <span style={reward.bypasses ? styles.bypassAmount : styles.diamondAmount}>
                                        +{reward.diamonds} 💎
                                    </span>
                                </div>
                            </div>
                        ))}

                        {/* Rules Summary */}
                        <div style={styles.rulesSummary}>
                            <div style={styles.rule}>📊 Daily Cap: <strong>500 diamonds</strong></div>
                            <div style={styles.rule}>🔥 Streak Bonus: <strong>Days 4-6: 1.5x | Day 7+: 2.0x</strong></div>
                            <div style={styles.rule}>⭐ Min Award: <strong>5 diamonds</strong></div>
                            <div style={styles.rule}>👥 Referrals: <strong>Bypass daily cap!</strong></div>
                        </div>
                    </div>
                ) : (
                    <div style={styles.easterList}>
                        {EASTER_EGG_CATEGORIES.map((category) => (
                            <div key={category.name} style={styles.categoryCard}>
                                <button
                                    onClick={() => setExpandedCategory(
                                        expandedCategory === category.name ? null : category.name
                                    )}
                                    style={{
                                        ...styles.categoryHeader,
                                        borderColor: category.color,
                                    }}
                                >
                                    <div style={styles.categoryTitle}>
                                        <span style={{ color: category.color }}>{category.range}</span>
                                        <span>{category.name}</span>
                                    </div>
                                    <span style={styles.expandIcon}>
                                        {expandedCategory === category.name ? '▼' : '▶'}
                                    </span>
                                </button>

                                {expandedCategory === category.name && (
                                    <div style={styles.categoryEggs}>
                                        {category.eggs.map((egg) => (
                                            <div key={egg.name} style={styles.eggRow}>
                                                <div style={styles.eggInfo}>
                                                    <div style={styles.eggName}>{egg.name}</div>
                                                    <div style={styles.eggDesc}>{egg.desc}</div>
                                                </div>
                                                <div style={styles.eggReward}>
                                                    <RarityBadge rarity={egg.rarity} />
                                                    <span style={styles.eggDiamonds}>+{egg.diamonds} 💎</span>
                                                </div>
                                            </div>
                                        ))}
                                        <div style={styles.moreText}>
                                            + more hidden eggs to discover...
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        <div style={styles.totalEggs}>
                            🥚 <strong>100+ Easter Eggs</strong> to discover! Some are one-time,
                            some require specific actions. Keep exploring!
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
    container: {
        background: 'rgba(0, 20, 40, 0.8)',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        borderRadius: 16,
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        background: 'rgba(0, 212, 255, 0.1)',
        borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
    },
    progressSection: {
        flex: 1,
        marginRight: 24,
    },
    progressLabel: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
        marginBottom: 8,
    },
    capText: {
        color: '#00D4FF',
        fontWeight: 600,
    },
    progressBar: {
        height: 8,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #00D4FF, #00ff88)',
        borderRadius: 4,
        transition: 'width 0.3s ease',
    },
    remainingText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 6,
    },
    streakSection: {
        textAlign: 'center' as const,
        position: 'relative' as const,
    },
    streakNumber: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 36,
        fontWeight: 700,
        color: '#FFD700',
    },
    streakLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    multiplierBadge: {
        position: 'absolute' as const,
        top: -8,
        right: -8,
        background: 'linear-gradient(135deg, #00ff88, #00D4FF)',
        color: '#0a1628',
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: 4,
    },
    tabBar: {
        display: 'flex',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    },
    tab: {
        flex: 1,
        padding: '14px 16px',
        background: 'transparent',
        border: 'none',
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    tabActive: {
        color: '#00D4FF',
        background: 'rgba(0, 212, 255, 0.1)',
        borderBottom: '2px solid #00D4FF',
    },
    content: {
        padding: 20,
        maxHeight: 400,
        overflowY: 'auto' as const,
    },
    standardList: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 12,
    },
    rewardRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 10,
    },
    rewardIcon: {
        fontSize: 24,
    },
    rewardInfo: {
        flex: 1,
    },
    rewardName: {
        fontSize: 14,
        fontWeight: 500,
        color: '#fff',
    },
    rewardNote: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    rewardDiamonds: {},
    diamondAmount: {
        fontSize: 14,
        fontWeight: 600,
        color: '#00D4FF',
    },
    bypassAmount: {
        fontSize: 14,
        fontWeight: 600,
        color: '#00ff88',
    },
    rulesSummary: {
        marginTop: 16,
        padding: 16,
        background: 'rgba(255, 215, 0, 0.1)',
        border: '1px solid rgba(255, 215, 0, 0.3)',
        borderRadius: 10,
    },
    rule: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.8)',
        marginBottom: 6,
    },
    easterList: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 12,
    },
    categoryCard: {
        borderRadius: 10,
        overflow: 'hidden',
    },
    categoryHeader: {
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 16px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid',
        borderRadius: 10,
        color: '#fff',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    categoryTitle: {
        display: 'flex',
        gap: 12,
    },
    expandIcon: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    categoryEggs: {
        padding: 12,
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '0 0 10px 10px',
    },
    eggRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    },
    eggInfo: {},
    eggName: {
        fontSize: 13,
        fontWeight: 500,
        color: '#fff',
    },
    eggDesc: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    eggReward: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
    },
    eggDiamonds: {
        fontSize: 13,
        fontWeight: 600,
        color: '#00D4FF',
    },
    moreText: {
        textAlign: 'center' as const,
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
        fontStyle: 'italic',
        marginTop: 8,
    },
    totalEggs: {
        textAlign: 'center' as const,
        padding: 16,
        background: 'rgba(255, 215, 0, 0.1)',
        borderRadius: 10,
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
    },
};

export default DiamondRewardTracker;
