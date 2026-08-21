/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND REWARD TRACKER — Visual display of all earnable rewards
   Shows standard payouts, hidden achievements, and daily progress.

   THIS COMPONENT OWNS NO NUMBERS. Every payout, cap, limit and multiplier is
   read from src/config/diamondRewards.js, the canonical catalog. If a number
   here looks wrong, fix the catalog — not this file.

   The economy in one paragraph: 1 💎 = $0.01. The daily cap is 110 💎 free /
   150 💎 VIP (3,300 / 4,500 a month), measured AFTER the share-streak
   multiplier. The multiplier ladder helps you REACH the cap with less work; it
   never raises the cap. Hidden achievements draw on a separate 500 💎/month
   budget on top of that, and nothing pays more than 500 💎.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import {
    CATEGORIES,
    DAILY_CAP,
    EASTER_EGG_MONTHLY_CAP,
    EGG_CATEGORIES,
    MONTHLY_CAP,
    MULTIPLIER_TIERS,
    REFERRAL,
    listEasterEggs,
    listRewards,
    totalWaysToEarn,
} from '../../config/diamondRewards';

// ═══════════════════════════════════════════════════════════════════════════
// CATALOG TYPES
// diamondRewards.js is deliberately dependency-free JS (API routes and cron
// workers import it too), so the shapes it returns are described here.
// ═══════════════════════════════════════════════════════════════════════════

interface CatalogReward {
    key: string;
    label: string;
    description: string;
    diamonds: number;
    maxDiamonds?: number;
    maxPerDay: number;
    monthlyMax?: number;
    category: string;
    countsTowardDailyCap: boolean;
    lifetime: boolean;
    oncePerTarget?: boolean;
    oncePerYear?: boolean;
    oncePerMonth?: boolean;
    serverOnly?: boolean;
    gate: string;
    icon: string;
}

interface CatalogEgg {
    key: string;
    name: string;
    rarity: string;
    diamonds: number;
    hint: string;
    category: string;
    verifiable: boolean;
    icon: string;
}

interface StandardPayout {
    id: string;
    name: string;
    amount: string;
    note: string;
    icon: string;
    category: string;
}

interface EggCategoryView {
    key: string;
    name: string;
    count: number;
    color: string;
    eggs: CatalogEgg[];
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTION OF THE CATALOG
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_EMOJI: Record<string, string> = {
    daily: '📅',
    training: '🎯',
    content: '🎬',
    social: '💬',
    engagement: '📍',
    profile: '👤',
    referral: '👥',
    vip: '👑',
    secret: '🥚',
};

const EGG_CATEGORY_COLORS: Record<string, string> = {
    performance: '#00D4FF',
    timing_loyalty: '#00ff88',
    strategy_mastery: '#8a2be2',
    social_viral: '#ff6b9d',
    discovery: '#ffa500',
    legacy_milestones: '#FFD700',
};

function fmt(n: number): string {
    return Number(n).toLocaleString('en-US');
}

/** '5-25 Diamonds' for the streak-scaled login, '+15 Diamonds' otherwise. */
function formatAmount(r: CatalogReward): string {
    const max = r.maxDiamonds;
    if (!r.diamonds && max) return `Up to ${fmt(max)} 💎`;
    if (max && max > r.diamonds) return `${fmt(r.diamonds)}-${fmt(max)} 💎`;
    return `+${fmt(r.diamonds)} 💎`;
}

/** The honest limit line. Nothing on this screen is uncapped. */
function formatNote(r: CatalogReward): string {
    if (r.key === 'referral_qualified') {
        return `${fmt(REFERRAL.referrer)} 💎 to you + ${fmt(REFERRAL.referee)} 💎 to your friend — released only after they verify email AND phone AND log in on 5 separate days. Max ${REFERRAL.maxQualifiedPerMonth} qualified referrals per month.`;
    }
    const limit = r.lifetime
        ? 'Once, ever'
        : r.oncePerYear
            ? 'Once per calendar year'
            : r.oncePerMonth
                ? 'Once per month'
                : r.monthlyMax
                    ? `Up to ${r.monthlyMax} per month`
                    : r.maxPerDay > 1
                        ? `Up to ${r.maxPerDay} per day`
                        : '1 per day';
    const budget = r.category === 'secret'
        ? `separate ${fmt(EASTER_EGG_MONTHLY_CAP)} 💎/month egg budget`
        : r.countsTowardDailyCap
            ? 'counts toward your daily cap'
            : 'separate budget with its own limit';
    const gate = r.gate === 'vip' ? ' · VIP only' : '';
    return `${limit} · ${budget}${gate}`;
}

const STANDARD_PAYOUTS: StandardPayout[] = (listRewards() as CatalogReward[]).map((r) => ({
    id: r.key,
    name: r.label,
    amount: formatAmount(r),
    note: formatNote(r),
    icon: CATEGORY_EMOJI[r.category] || '💎',
    category: (CATEGORIES as Record<string, string>)[r.category] || r.category,
}));

const EGG_CATEGORY_VIEWS: EggCategoryView[] = Object.keys(EGG_CATEGORIES).map((key) => {
    const eggs = listEasterEggs(key) as CatalogEgg[];
    return {
        key,
        name: (EGG_CATEGORIES as Record<string, string>)[key],
        count: eggs.length,
        color: EGG_CATEGORY_COLORS[key] || '#00D4FF',
        eggs,
    };
});

const TOTAL_EGGS: number = (listEasterEggs() as CatalogEgg[]).length;
const TOTAL_WAYS: number = totalWaysToEarn();

/**
 * The share-streak ladder. MULTIPLIER_TIERS is the catalog's list of legal
 * multipliers; these are the day thresholds they unlock at. Zipping the two
 * means a catalog change to the tiers shows up here automatically.
 */
const SHARE_STREAK_DAYS = [0, 3, 7, 14, 30];
const MULTIPLIER_LADDER: { days: number; mult: number }[] = (MULTIPLIER_TIERS as number[])
    .map((mult, i) => ({ mult, days: SHARE_STREAK_DAYS[i] ?? 0 }))
    .filter((tier) => tier.mult > 1);

/** Highest tier the share streak has unlocked. Never raises the cap. */
function multiplierFor(shareStreakDays: number): number {
    let mult = 1;
    for (const tier of MULTIPLIER_LADDER) {
        if (shareStreakDays >= tier.days) mult = tier.mult;
    }
    return mult;
}

/** The login payout for a TRUE consecutive-day streak: 5 💎 + 2 💎 per day, max 25 💎. */
const LOGIN_REWARD = (listRewards('daily') as CatalogReward[]).find((r) => r.key === 'daily_login');
const LOGIN_MIN: number = LOGIN_REWARD?.diamonds ?? 5;
const LOGIN_MAX: number = LOGIN_REWARD?.maxDiamonds ?? 25;

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

function DiamondIcon() {
    return (
        <img
            src="/images/diamond.png"
            alt="Diamond"
            style={{ width: 20, height: 20, display: 'inline-block', verticalAlign: 'middle' }}
        />
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN REWARD TRACKER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface RewardTrackerProps {
    diamondsToday?: number;
    /** TRUE consecutive login days — drives the daily login payout. */
    currentStreak?: number;
    /** Consecutive share days — drives the multiplier, never the cap. */
    shareStreak?: number;
    isVip?: boolean;
}

export function DiamondRewardTracker({
    diamondsToday = 0,
    currentStreak = 0,
    shareStreak = 0,
    isVip = false,
}: RewardTrackerProps) {
    const [activeTab, setActiveTab] = useState<'standard' | 'easter'>('standard');
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

    const dailyCap: number = isVip ? DAILY_CAP.vip : DAILY_CAP.free;
    const monthlyCap: number = isVip ? MONTHLY_CAP.vip : MONTHLY_CAP.free;
    const streakMultiplier = multiplierFor(shareStreak);
    const remainingCap = Math.max(0, dailyCap - diamondsToday);
    const todaysLogin = Math.min(LOGIN_MIN + Math.max(0, currentStreak - 1) * 2, LOGIN_MAX);

    return (
        <div style={styles.container}>
            {/* Header with Daily Progress */}
            <div style={styles.header}>
                <div style={styles.progressSection}>
                    <div style={styles.progressLabel}>
                        <span>Today&apos;s Earnings</span>
                        <span style={styles.capText}>{diamondsToday} / {dailyCap}</span>
                    </div>
                    <div style={styles.progressBar}>
                        <div
                            style={{
                                ...styles.progressFill,
                                width: `${Math.min((diamondsToday / dailyCap) * 100, 100)}%`,
                            }}
                        />
                    </div>
                    <div style={styles.remainingText}>
                        {remainingCap > 0 ? (
                            <>{remainingCap} <DiamondIcon /> remaining today · {fmt(monthlyCap)} 💎/month max</>
                        ) : (
                            <>🎉 Daily cap reached — resets at midnight</>
                        )}
                    </div>
                </div>

                <div style={styles.streakSection}>
                    <div style={styles.streakNumber}>{currentStreak}</div>
                    <div style={styles.streakLabel}>Day Streak</div>
                    <div style={styles.streakSub}>Login pays {todaysLogin} 💎</div>
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
                    💰 Standard Rewards ({STANDARD_PAYOUTS.length})
                </button>
                <button
                    onClick={() => setActiveTab('easter')}
                    style={{
                        ...styles.tab,
                        ...(activeTab === 'easter' ? styles.tabActive : {}),
                    }}
                >
                    🥚 Hidden Achievements ({TOTAL_EGGS})
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
                                    <div style={styles.rewardNote}>{reward.note}</div>
                                </div>
                                <div style={styles.rewardDiamonds}>
                                    <span style={styles.diamondAmount}>{reward.amount}</span>
                                </div>
                            </div>
                        ))}

                        {/* Rules Summary — all values read from the catalog */}
                        <div style={styles.rulesSummary}>
                            <div style={styles.rule}>
                                📊 Daily Cap: <strong>{DAILY_CAP.free} 💎 free / {DAILY_CAP.vip} 💎 VIP</strong>{' '}
                                ({fmt(MONTHLY_CAP.free)} / {fmt(MONTHLY_CAP.vip)} per month)
                            </div>
                            <div style={styles.rule}>
                                🔥 Share Streak:{' '}
                                <strong>
                                    {MULTIPLIER_LADDER.map((t) => `${t.mult}x at ${t.days}d`).join(' | ')}
                                </strong>
                                {' '}— reaches the cap with less work, never raises it
                            </div>
                            <div style={styles.rule}>
                                📅 Daily Login: <strong>{LOGIN_MIN}-{LOGIN_MAX} 💎</strong> on a true consecutive-day
                                streak (+2 💎 a day, resets if you miss one)
                            </div>
                            <div style={styles.rule}>
                                👥 Referrals: <strong>{fmt(REFERRAL.referrer)} 💎 to you + {fmt(REFERRAL.referee)} 💎 to your friend</strong>,
                                released after they verify email AND phone AND log in on 5 separate days.
                                Max {REFERRAL.maxQualifiedPerMonth} qualified per month.
                            </div>
                            <div style={styles.rule}>
                                🥚 Hidden Achievements: <strong>up to {fmt(EASTER_EGG_MONTHLY_CAP)} 💎/month</strong> on
                                top of the daily cap. Nothing pays more than {fmt(EASTER_EGG_MONTHLY_CAP)} 💎.
                            </div>
                            <div style={styles.rule}>
                                💵 1 💎 = $0.01. A dedicated free player earns about {fmt(MONTHLY_CAP.free)} 💎 a month
                                (${(MONTHLY_CAP.free / 100).toFixed(0)}) — a VIP card plus a stack for the Diamond Arena.
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={styles.easterList}>
                        {EGG_CATEGORY_VIEWS.map((category) => (
                            <div key={category.key} style={styles.categoryCard}>
                                <button
                                    onClick={() => setExpandedCategory(
                                        expandedCategory === category.key ? null : category.key
                                    )}
                                    style={{
                                        ...styles.categoryHeader,
                                        borderColor: category.color,
                                    }}
                                >
                                    <div style={styles.categoryTitle}>
                                        <span style={{ color: category.color }}>{category.count}</span>
                                        <span>{category.name}</span>
                                    </div>
                                    <span style={styles.expandIcon}>
                                        {expandedCategory === category.key ? '▼' : '▶'}
                                    </span>
                                </button>

                                {expandedCategory === category.key && (
                                    <div style={styles.categoryEggs}>
                                        {category.eggs.map((egg) => (
                                            <div key={egg.key} style={styles.eggRow}>
                                                <div style={styles.eggInfo}>
                                                    <div style={styles.eggName}>{egg.name}</div>
                                                    <div style={styles.eggDesc}>{egg.hint}</div>
                                                </div>
                                                <div style={styles.eggReward}>
                                                    <RarityBadge rarity={egg.rarity} />
                                                    <span style={styles.eggDiamonds}>+{fmt(egg.diamonds)} <DiamondIcon /></span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        <div style={styles.totalEggs}>
                            🥚 <strong>{TOTAL_EGGS} hidden achievements</strong> to discover across{' '}
                            {EGG_CATEGORY_VIEWS.length} categories — part of {TOTAL_WAYS} total ways to earn.
                            All of them together pay at most {fmt(EASTER_EGG_MONTHLY_CAP)} 💎 a month.
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
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: 36,
        fontWeight: 700,
        color: '#FFD700',
    },
    streakLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    streakSub: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.45)',
        marginTop: 2,
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
    exemptAmount: {
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
