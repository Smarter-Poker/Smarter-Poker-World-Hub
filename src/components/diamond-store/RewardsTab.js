import React from 'react';
import {
    Activity, Award, BarChart2, Book, BookOpen, Bot, Brain, Bug, Building,
    Cake, CalendarCheck, Camera, Circle, CircleDollarSign, Crosshair, Crown,
    Dices, Droplet, Dumbbell, Flag, Flame, FlaskConical, Gauge, Gem, Ghost,
    Gift, Globe, GraduationCap, Infinity as InfinityIcon, LayoutDashboard,
    Link2, MailCheck, Map as MapIcon, MapPin, Medal, MessageSquare,
    MessagesSquare, Moon, Orbit, Palette, PartyPopper, PenTool, PhoneCall,
    Pickaxe, PlayCircle, Rocket, Ruler, Scale, Send, Settings, Shield,
    ShieldCheck, ShoppingBag, Skull, Sliders, Smile, Spade, Sparkles,
    SquarePen, Star, Sunrise, Swords, Target, ThumbsUp, TrendingUp, Trophy,
    UserCheck, UserPlus, Users, Wallet, Wand2, Waves, Wrench, Zap,
} from 'lucide-react';
import {
    DAILY_CAP,
    MONTHLY_CAP,
    EASTER_EGG_MONTHLY_CAP,
    MULTIPLIER_TIERS,
    MAX_MULTIPLIER,
    CATEGORIES,
    EGG_CATEGORIES,
    REFERRAL,
    getReward,
    listRewards,
    listEasterEggs,
    totalWaysToEarn,
} from '../../config/diamondRewards';
import * as storeData from '../../data/diamondStoreData';
import styles from './diamondStoreStyles';

/* ═══════════════════════════════════════════════════════════════════════════
 * CATALOG-DERIVED CONSTANTS
 * Every number rendered by this tab comes from src/config/diamondRewards.js.
 * Nothing is hardcoded; every read has a fallback so a missing or renamed
 * catalog key degrades to sane copy instead of crashing the tab.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** lucide-react component lookup — the catalog stores icon names as STRINGS. */
const ICONS = {
    Activity, Award, BarChart2, Book, BookOpen, Bot, Brain, Bug, Building,
    Cake, CalendarCheck, Camera, Circle, CircleDollarSign, Crosshair, Crown,
    Dices, Droplet, Dumbbell, Flag, Flame, FlaskConical, Gauge, Gem, Ghost,
    Gift, Globe, GraduationCap, Infinity: InfinityIcon, LayoutDashboard,
    Link2, MailCheck, Map: MapIcon, MapPin, Medal, MessageSquare,
    MessagesSquare, Moon, Orbit, Palette, PartyPopper, PenTool, PhoneCall,
    Pickaxe, PlayCircle, Rocket, Ruler, Scale, Send, Settings, Shield,
    ShieldCheck, ShoppingBag, Skull, Sliders, Smile, Spade, Sparkles,
    SquarePen, Star, Sunrise, Swords, Target, ThumbsUp, TrendingUp, Trophy,
    UserCheck, UserPlus, Users, Wallet, Wand2, Waves, Wrench, Zap,
};

const iconFor = (name) => (name && ICONS[name]) || Gem;

/** Finite-number guard. */
const num = (value, fallback) =>
    (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** 3300 -> "3,300" */
const fmt = (value) => num(value, 0).toLocaleString('en-US');

/** Run a catalog helper without letting a bad export take the page down. */
const safeCall = (fn, fallback) => {
    try {
        const out = typeof fn === 'function' ? fn() : undefined;
        return out === undefined || out === null ? fallback : out;
    } catch (err) {
        return fallback;
    }
};

const safeList = (fn) => {
    const out = safeCall(fn, []);
    return Array.isArray(out) ? out : [];
};

// ── Ceilings ───────────────────────────────────────────────────────────────
const FREE_DAILY_CAP = num(DAILY_CAP?.free, 110);
const VIP_DAILY_CAP = num(DAILY_CAP?.vip, 150);
const FREE_MONTHLY_CAP = num(MONTHLY_CAP?.free, 3300);
const VIP_MONTHLY_CAP = num(MONTHLY_CAP?.vip, 4500);
const EGG_MONTHLY_CAP = num(EASTER_EGG_MONTHLY_CAP, 500);

// ── Catalog contents ───────────────────────────────────────────────────────
const ALL_REWARDS = safeList(() => listRewards());
const ALL_EGGS = safeList(() => listEasterEggs());
const EGG_COUNT = ALL_EGGS.length;
const WAYS_TO_EARN = (() => {
    const n = num(safeCall(() => totalWaysToEarn(), 0), 0);
    return n > 0 ? n : ALL_REWARDS.length + EGG_COUNT;
})();
const MAX_EGG_DIAMONDS =
    ALL_EGGS.reduce((max, egg) => Math.max(max, num(egg?.diamonds, 0)), 0) || EGG_MONTHLY_CAP;

// ── Share-streak multiplier ladder (helps you REACH the cap, never raises it)
const TIER_DAYS = [3, 7, 14, 30];
const TIER_COLORS = ['#60a5fa', '#34d399', '#818cf8', '#f59e0b'];
const TIER_NAMES = ['Streak', 'Expert', 'Master', 'Legend'];
const LADDER = (Array.isArray(MULTIPLIER_TIERS) && MULTIPLIER_TIERS.length > 1
    ? MULTIPLIER_TIERS.filter((m) => num(m, 0) > 1)
    : [1.2, 1.5, 1.75, 2.0]
).map((mult, i) => ({
    mult: num(mult, 1),
    days: TIER_DAYS[i] ?? (i + 1) * 7,
    name: TIER_NAMES[i] ?? `Tier ${i + 1}`,
    color: TIER_COLORS[i] ?? '#60a5fa',
}));
const TOP_MULTIPLIER = num(MAX_MULTIPLIER, LADDER.length ? LADDER[LADDER.length - 1].mult : 2.0);

// ── Referral program ───────────────────────────────────────────────────────
const REFERRER_DIAMONDS = num(
    REFERRAL?.referrer,
    num(safeCall(() => getReward('referral_qualified'), null)?.diamonds, 500),
);
const REFEREE_DIAMONDS = num(
    REFERRAL?.referee,
    num(safeCall(() => getReward('referral_referee'), null)?.diamonds, 100),
);
const REFERRAL_VIP_BONUS = num(
    REFERRAL?.vipConversionBonus,
    num(safeCall(() => getReward('referral_vip_conversion'), null)?.diamonds, 500),
);
const MAX_QUALIFIED_REFERRALS = num(REFERRAL?.maxQualifiedPerMonth, 20);

// ── Category ordering (empty groups are skipped at render time) ─────────────
const REWARD_CATEGORY_KEYS = Object.keys(CATEGORIES || {}).length
    ? Object.keys(CATEGORIES)
    : Array.from(new Set(ALL_REWARDS.map((r) => r?.category).filter(Boolean)));

const EGG_CATEGORY_KEYS = Object.keys(EGG_CATEGORIES || {}).length
    ? Object.keys(EGG_CATEGORIES)
    : Array.from(new Set(ALL_EGGS.map((e) => e?.category).filter(Boolean)));

/** "5-25 💎" for scaling rewards, "+15 💎" for flat ones. */
const rewardAmountLabel = (reward) => {
    const base = num(reward?.diamonds, 0);
    const max = num(reward?.maxDiamonds, 0);
    if (max > base) return `${fmt(base)}-${fmt(max)} 💎`;
    return `+${fmt(base)} 💎`;
};

/** Per-reward footnote: how often it pays, and how it relates to the cap. */
const rewardLimitLabel = (reward) => {
    const bits = [];
    if (reward?.lifetime) bits.push('Once ever');
    else if (num(reward?.maxPerDay, 0) > 1) bits.push(`Up to ${fmt(reward.maxPerDay)}/day`);
    else if (num(reward?.maxPerDay, 0) === 1) bits.push('Once per day');
    if (num(reward?.monthlyMax, 0) > 0) bits.push(`Max ${fmt(reward.monthlyMax)}/month`);
    if (reward?.countsTowardDailyCap === false) bits.push('Separate budget line');
    if (reward?.serverOnly) bits.push('Awarded automatically');
    return bits.join(' • ');
};

export default function RewardsTab({ diamondMultiplier, rewardsSubTab, setRewardsSubTab, setActiveTab }) {
    const rarityKey = (r) => { const s = r || 'common'; return s.charAt(0).toUpperCase() + s.slice(1); };
    const VIP_MEMBERSHIP = storeData?.VIP_MEMBERSHIP;
    const annualSavings = Math.round(Number(VIP_MEMBERSHIP?.monthly?.price ?? 19.99) * 12 - Number(VIP_MEMBERSHIP?.annual?.price ?? 199.99));
    return (
        <>

                            <>
                                {/* Active Diamond Multiplier Banner */}
                                <div style={{
                                    margin: '12px 0 0',
                                    padding: '14px 16px',
                                    borderRadius: 12,
                                    background: diamondMultiplier > 1.0
                                        ? 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.12))'
                                        : 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
                                    border: `1px solid ${diamondMultiplier > 1.0 ? 'rgba(245,158,11,0.45)' : 'rgba(99,102,241,0.3)'}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{
                                                width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: diamondMultiplier > 1.0 ? 'rgba(245,158,11,0.2)' : 'rgba(99,102,241,0.2)',
                                                fontSize: 20,
                                            }}>
                                                {diamondMultiplier > 1.0 ? <Zap size={20} color="#f59e0b" /> : <Gem size={20} color="#818cf8" />}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: diamondMultiplier > 1.0 ? '#f59e0b' : '#818cf8' }}>
                                                    {diamondMultiplier > 1.0
                                                        ? `${diamondMultiplier.toFixed(2)}× Diamond Boost Active`
                                                        : 'Activate Your Diamond Boost'}
                                                </div>
                                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                                                    {diamondMultiplier > 1.0
                                                        ? `Each award is multiplied ${diamondMultiplier.toFixed(2)}× by your share streak, so you reach the daily cap faster — the cap itself never moves`
                                                        : 'Share posts daily for 3+ days to reach your daily cap with less work'}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            {LADDER.map(tier => (
                                                <span key={tier.name} style={{
                                                    display: 'inline-block', margin: '2px 3px',
                                                    fontSize: 10, fontWeight: 600, color: tier.color,
                                                    background: `${tier.color}18`, border: `1px solid ${tier.color}35`,
                                                    borderRadius: 6, padding: '2px 6px',
                                                }}>{tier.name} {tier.days}d {tier.mult}×</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Sub-Tab Navigation */}
                                <div style={styles.rewardsSubNav}>
                                    <button
                                        onClick={() => setRewardsSubTab('overview')}
                                        style={{
                                            ...styles.rewardsSubTab,
                                            ...(rewardsSubTab === 'overview' ? styles.rewardsSubTabActive : {}),
                                        }}
                                    >
                                        Overview
                                    </button>
                                    <button
                                        onClick={() => setRewardsSubTab('diamonds')}
                                        style={{
                                            ...styles.rewardsSubTab,
                                            ...(rewardsSubTab === 'diamonds' ? styles.rewardsSubTabActive : {}),
                                        }}
                                    >
                                        Diamond Rewards
                                    </button>

                                    <button
                                        onClick={() => setRewardsSubTab('eggs')}
                                        style={{
                                            ...styles.rewardsSubTab,
                                            ...(rewardsSubTab === 'eggs' ? styles.rewardsSubTabActive : {}),
                                        }}
                                    >
                                        Easter Eggs
                                    </button>
                                </div>

                                {/* OVERVIEW SUB-TAB */}
                                {rewardsSubTab === 'overview' && (
                                    <div style={styles.rewardsOverview}>
                                        <h2 style={styles.earnTitle}>Smarter Rewards</h2>
                                        <p style={styles.introText}>
                                            Welcome To The Smarter Rewards System! Earn Diamonds By Playing, Training, And Engaging With The Community.
                                            1 Diamond = $0.01, So A Dedicated Free Player Can Bank About {fmt(FREE_MONTHLY_CAP)} 💎 A Month
                                            (${(FREE_MONTHLY_CAP / 100).toFixed(0)}) — A VIP Card Plus Diamonds Left Over For The Diamond Arena.
                                        </p>

                                        <div style={styles.overviewGrid}>
                                            <div style={styles.overviewCard}>
                                                <div style={styles.overviewIcon}></div>
                                                <h3 style={styles.overviewCardTitle}>Diamond Rewards</h3>
                                                <p style={styles.overviewCardText}>
                                                    Earn Diamonds Through Daily Logins, Training, Social Engagement, And Referrals.
                                                    <strong style={{ color: '#00ff88' }}> Daily Cap: {fmt(FREE_DAILY_CAP)} Free / {fmt(VIP_DAILY_CAP)} VIP</strong>
                                                    {' '}({fmt(FREE_MONTHLY_CAP)} / {fmt(VIP_MONTHLY_CAP)} Per Month).
                                                    Streak Multipliers Help You Reach That Cap Faster — They Never Raise It.
                                                </p>
                                            </div>

                                            <div style={styles.overviewCard}>
                                                <div style={styles.overviewIcon}></div>
                                                <h3 style={styles.overviewCardTitle}>VIP Membership</h3>
                                                <div style={{ marginTop: 12, marginBottom: 12 }}>
                                                    <img
                                                        src="/images/vip-card.png"
                                                        alt="VIP Membership Card"
                                                        style={{
                                                            width: '100%',
                                                            maxWidth: 320,
                                                            borderRadius: 12,
                                                            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                                                        }}
                                                        draggable={false}
                                                        loading="lazy" />
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    gap: 16,
                                                    marginTop: 8,
                                                }}>
                                                    <div style={{
                                                        background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))',
                                                        border: '1px solid rgba(255,215,0,0.3)',
                                                        borderRadius: 10,
                                                        padding: '10px 18px',
                                                        textAlign: 'center',
                                                    }}>
                                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#FFD700', fontFamily: 'Orbitron, sans-serif' }}>${VIP_MEMBERSHIP?.monthly?.price ?? '19.99'}</div>
                                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Per Month</div>
                                                    </div>
                                                    <div style={{
                                                        background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))',
                                                        border: '1px solid rgba(0,212,255,0.3)',
                                                        borderRadius: 10,
                                                        padding: '10px 18px',
                                                        textAlign: 'center',
                                                    }}>
                                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#00D4FF', fontFamily: 'Orbitron, sans-serif' }}>${VIP_MEMBERSHIP?.annual?.price ?? '199.99'}</div>
                                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Per Year (Save ${annualSavings}!)</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setActiveTab('vip')}
                                                    style={{
                                                        marginTop: 12,
                                                        padding: '10px 28px',
                                                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                                                        border: 'none',
                                                        borderRadius: 8,
                                                        color: '#000',
                                                        fontSize: 14,
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        boxShadow: '0 0 16px rgba(255,215,0,0.3)',
                                                    }}
                                                >
                                                    View VIP Plans →
                                                </button>
                                            </div>

                                            <div style={styles.overviewCard}>
                                                <div style={styles.overviewIcon}></div>
                                                <h3 style={styles.overviewCardTitle}>Easter Eggs</h3>
                                                <p style={styles.overviewCardText}>
                                                    Discover <strong>{fmt(EGG_COUNT)} Hidden Achievements</strong> Across {fmt(EGG_CATEGORY_KEYS.length)} Categories.
                                                    They Pay From Their Own Pool Worth Up To {fmt(EGG_MONTHLY_CAP)} 💎 Per Month On Top Of Your Normal Cap,
                                                    And No Single Egg Pays More Than {fmt(MAX_EGG_DIAMONDS)} 💎.
                                                </p>
                                            </div>
                                        </div>

                                        <div style={{ ...styles.quickStats, flexWrap: 'wrap' }}>
                                            <div style={styles.quickStat}>
                                                <span style={{ ...styles.quickStatValue, fontSize: 26 }}>{fmt(FREE_DAILY_CAP)} / {fmt(VIP_DAILY_CAP)}</span>
                                                <span style={styles.quickStatLabel}>Daily Cap (Free / VIP)</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={{ ...styles.quickStatValue, fontSize: 26 }}>{fmt(FREE_MONTHLY_CAP)} / {fmt(VIP_MONTHLY_CAP)}</span>
                                                <span style={styles.quickStatLabel}>Monthly Cap (Free / VIP)</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>{Object.keys(VIP_MEMBERSHIP || {}).length}</span>
                                                <span style={styles.quickStatLabel}>VIP Plans</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>{fmt(EGG_COUNT)}</span>
                                                <span style={styles.quickStatLabel}>Easter Eggs</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>{fmt(WAYS_TO_EARN)}</span>
                                                <span style={styles.quickStatLabel}>Ways To Earn</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* DIAMOND REWARDS SUB-TAB */}
                                {rewardsSubTab === 'diamonds' && (
                                    <div style={styles.diamondRewardsSection}>
                                        <h2 style={styles.earnTitle}>Diamond Rewards</h2>
                                        <p style={styles.introText}>
                                            All {fmt(WAYS_TO_EARN)} Ways You Can Earn Diamonds On Smarter.Poker —
                                            {' '}{fmt(ALL_REWARDS.length)} Standard Rewards Plus {fmt(EGG_COUNT)} Hidden Achievements.
                                        </p>

                                        {/* Cap Banner */}
                                        <div style={{ ...styles.capBanner, flexWrap: 'wrap' }}>
                                            <div style={styles.capInfo}>
                                                <span style={{ ...styles.capNumber, fontSize: 30 }}>{fmt(FREE_DAILY_CAP)} / {fmt(VIP_DAILY_CAP)}</span>
                                                <span style={styles.capLabel}>Daily Cap (Free / VIP)</span>
                                            </div>
                                            <div style={styles.capDivider} />
                                            <div style={styles.capInfo}>
                                                <span style={{ ...styles.capNumber, fontSize: 30 }}>{fmt(FREE_MONTHLY_CAP)} / {fmt(VIP_MONTHLY_CAP)}</span>
                                                <span style={styles.capLabel}>Monthly Cap (Free / VIP)</span>
                                            </div>
                                            <div style={styles.capDivider} />
                                            <div style={styles.streakMultipliers}>
                                                {LADDER.map((tier, i) => (
                                                    <div key={tier.name} style={styles.multiplierItem}>
                                                        <span style={i === LADDER.length - 1 ? styles.multiplierValueGold : styles.multiplierValue}>{tier.mult}x</span>
                                                        <span style={styles.multiplierLabel}>Share Streak {tier.days}d</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* How the ceiling actually works */}
                                        <p style={styles.introText}>
                                            Your share streak multiplier ({LADDER.map((t) => `${t.mult}×`).join(' / ')}, topping out at {TOP_MULTIPLIER}×)
                                            multiplies each individual award, so you reach the daily cap with less work.
                                            It never raises the cap: {fmt(FREE_DAILY_CAP)} 💎 is {fmt(FREE_DAILY_CAP)} 💎 at 1.00× and at {TOP_MULTIPLIER}×.
                                            Hidden achievements are paid from a separate pool worth up to {fmt(EGG_MONTHLY_CAP)} 💎 per month on top of that,
                                            and nothing in the catalog pays more than {fmt(MAX_EGG_DIAMONDS)} 💎.
                                        </p>

                                        {/* How referrals qualify */}
                                        <p style={styles.introText}>
                                            Referrals: {fmt(REFERRER_DIAMONDS)} 💎 to you and {fmt(REFEREE_DIAMONDS)} 💎 to your friend, released only
                                            after they verify their email AND their phone AND log in on 5 separate days.
                                            Up to {fmt(MAX_QUALIFIED_REFERRALS)} qualified referrals per month, plus {fmt(REFERRAL_VIP_BONUS)} 💎 more
                                            if someone you referred goes VIP. Referrals have their own monthly ceiling.
                                        </p>

                                        {/* Standard Rewards — rendered straight from the v2 catalog */}
                                        {REWARD_CATEGORY_KEYS.map((catKey) => {
                                            const group = ALL_REWARDS.filter((r) => r?.category === catKey);
                                            if (!group.length) return null;
                                            const catLabel = (CATEGORIES && CATEGORIES[catKey]) || catKey;
                                            return (
                                                <div key={catKey} style={styles.rewardCategory}>
                                                    <h3 style={styles.categoryTitle}>{catLabel} ({group.length})</h3>
                                                    <div style={styles.rewardList}>
                                                        {group.map((reward) => {
                                                            const Icon = iconFor(reward?.icon);
                                                            const isReferral = reward?.category === 'referral';
                                                            const limit = rewardLimitLabel(reward);
                                                            return (
                                                                <div key={reward?.key || reward?.label} style={isReferral ? { ...styles.rewardItem, ...styles.referralHighlight } : styles.rewardItem}>
                                                                    <span style={styles.rewardIcon}>
                                                                        <Icon size={24} />
                                                                    </span>
                                                                    <div style={styles.rewardDetails}>
                                                                        <span style={styles.rewardName}>{reward?.label || reward?.key}</span>
                                                                        <span style={styles.rewardNote}>{reward?.description}</span>
                                                                        {limit ? <span style={styles.rewardNote}>{limit}</span> : null}
                                                                    </div>
                                                                    <span style={isReferral ? styles.referralReward : styles.rewardAmount}>{rewardAmountLabel(reward)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* EASTER EGGS SUB-TAB */}
                                {rewardsSubTab === 'eggs' && (
                                    <div style={styles.easterEggsSection}>
                                        <h2 style={styles.earnTitle}>Easter Eggs - {fmt(EGG_COUNT)} Hidden Achievements</h2>
                                        <p style={styles.introText}>
                                            Discover {fmt(EGG_COUNT)} Hidden Achievements Across {fmt(EGG_CATEGORY_KEYS.length)} Categories.
                                            Easter eggs are paid from their own pool worth up to {fmt(EGG_MONTHLY_CAP)} 💎 per month on top of your
                                            normal daily cap, and nothing pays more than {fmt(MAX_EGG_DIAMONDS)} 💎.
                                        </p>

                                        {EGG_CATEGORY_KEYS.map((catKey) => {
                                            const filtered = safeList(() => listEasterEggs(catKey));
                                            const eggs = filtered.length ? filtered : ALL_EGGS.filter((e) => e?.category === catKey);
                                            if (!eggs.length) return null;
                                            const catLabel = (EGG_CATEGORIES && EGG_CATEGORIES[catKey]) || catKey;
                                            return (
                                                <div key={catKey} style={styles.eggCategory}>
                                                    <h3 style={styles.eggCategoryTitle}>{catLabel} ({eggs.length} Achievements)</h3>
                                                    <div style={styles.eggGrid}>
                                                        {eggs.map((egg) => {
                                                            const Icon = iconFor(egg?.icon);
                                                            const rk = rarityKey(egg?.rarity);
                                                            return (
                                                                <div key={egg?.key || egg?.name} style={styles.eggCard}>
                                                                    <div style={styles.eggIcon}>
                                                                        <Icon size={32} />
                                                                    </div>
                                                                    <h4 style={styles.eggName}>{egg?.name || egg?.key}</h4>
                                                                    <div style={{ ...styles.rarityBadge, ...(styles[`rarity${rk}`] || styles.rarityCommon) }}>
                                                                        {(egg?.rarity || 'common').toUpperCase()}
                                                                    </div>
                                                                    <div style={styles.eggReward}>+{fmt(egg?.diamonds)} 💎</div>
                                                                    <p style={styles.eggTrigger}>{egg?.hint}</p>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>

        </>
    );
}
