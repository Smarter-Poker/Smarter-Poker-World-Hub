import React from 'react';
import { Zap, Gem } from 'lucide-react';
import { STANDARD_REWARDS, EASTER_EGGS, VIP_MEMBERSHIP } from '../../data/diamondStoreData';
import styles from './diamondStoreStyles';

export default function RewardsTab({ diamondMultiplier, rewardsSubTab, setRewardsSubTab, setActiveTab }) {
    const rarityKey = (r) => { const s = r || 'common'; return s.charAt(0).toUpperCase() + s.slice(1); };
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
                                                        ? `Every diamond you earn is multiplied ${diamondMultiplier.toFixed(2)}× by your share streak`
                                                        : 'Share posts daily for 3+ days to boost ALL your diamond earnings'}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            {[
                                                { label: 'Streak 3d', mult: '1.2×', color: '#60a5fa' },
                                                { label: 'Expert 7d', mult: '1.5×', color: '#34d399' },
                                                { label: 'Master 14d', mult: '1.75×', color: '#818cf8' },
                                                { label: 'Legend 30d', mult: '2.0×', color: '#f59e0b' },
                                            ].map(tier => (
                                                <span key={tier.label} style={{
                                                    display: 'inline-block', margin: '2px 3px',
                                                    fontSize: 10, fontWeight: 600, color: tier.color,
                                                    background: `${tier.color}18`, border: `1px solid ${tier.color}35`,
                                                    borderRadius: 6, padding: '2px 6px',
                                                }}>{tier.label} {tier.mult}</span>
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
                                        </p>

                                        <div style={styles.overviewGrid}>
                                            <div style={styles.overviewCard}>
                                                <div style={styles.overviewIcon}></div>
                                                <h3 style={styles.overviewCardTitle}>Diamond Rewards</h3>
                                                <p style={styles.overviewCardText}>
                                                    Earn Diamonds Through Daily Logins, Training, Social Engagement, And Referrals.
                                                    <strong style={{ color: '#00ff88' }}> Daily Cap: 500</strong> With Streak Multipliers!
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
                                                    Discover <strong>100 Hidden Achievements</strong> Across 6 Categories.
                                                    From Performance To Legacy Milestones, Find Them All For Massive Rewards!
                                                </p>
                                            </div>
                                        </div>

                                        <div style={styles.quickStats}>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>500</span>
                                                <span style={styles.quickStatLabel}>Daily Cap</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>{Object.keys(VIP_MEMBERSHIP || {}).length}</span>
                                                <span style={styles.quickStatLabel}>VIP Plans</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>100</span>
                                                <span style={styles.quickStatLabel}>Easter Eggs</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>14</span>
                                                <span style={styles.quickStatLabel}>Standard Rewards</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* DIAMOND REWARDS SUB-TAB */}
                                {rewardsSubTab === 'diamonds' && (
                                    <div style={styles.diamondRewardsSection}>
                                        <h2 style={styles.earnTitle}>Diamond Rewards</h2>
                                        <p style={styles.introText}>
                                            All 14 Ways You Can Earn Diamonds On Smarter.Poker
                                        </p>

                                        {/* Daily Cap Banner */}
                                        <div style={styles.capBanner}>
                                            <div style={styles.capInfo}>
                                                <span style={styles.capNumber}>500</span>
                                                <span style={styles.capLabel}>Daily Cap</span>
                                            </div>
                                            <div style={styles.capDivider} />
                                            <div style={styles.streakMultipliers}>
                                                <div style={styles.multiplierItem}>
                                                    <span style={styles.multiplierValue}>1.5x</span>
                                                    <span style={styles.multiplierLabel}>Login Days 4-6</span>
                                                </div>
                                                <div style={styles.multiplierItem}>
                                                    <span style={styles.multiplierValueGold}>2.0x</span>
                                                    <span style={styles.multiplierLabel}>Login Day 7+</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Standard Rewards List */}
                                        <div style={styles.rewardCategory}>
                                            <h3 style={styles.categoryTitle}>All Standard Rewards</h3>
                                            <div style={styles.rewardList}>
                                                {(STANDARD_REWARDS || []).map((reward, idx) => (
                                                    <div key={idx} style={reward.bypassesCap ? { ...styles.rewardItem, ...styles.referralHighlight } : styles.rewardItem}>
                                                        <span style={styles.rewardIcon}>
                                                            {reward.icon && <reward.icon size={24} />}
                                                        </span>
                                                        <div style={styles.rewardDetails}>
                                                            <span style={styles.rewardName}>{reward.name}</span>
                                                            <span style={styles.rewardNote}>{reward.note}</span>
                                                        </div>
                                                        <span style={reward.bypassesCap ? styles.referralReward : styles.rewardAmount}>{reward.amount}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* EASTER EGGS SUB-TAB */}
                                {rewardsSubTab === 'eggs' && (
                                    <div style={styles.easterEggsSection}>
                                        <h2 style={styles.earnTitle}>Easter Eggs - 100 Hidden Achievements</h2>
                                        <p style={styles.introText}>
                                            Discover 100 Hidden Achievements Across 6 Categories For Massive Bonus Rewards!
                                        </p>

                                        {/* Performance Category (10 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>Performance (10 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {(EASTER_EGGS.performance || []).map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>
                                                            {egg.icon && <egg.icon size={32} />}
                                                        </div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...(styles[`rarity${rarityKey(egg.rarity)}`] || {}) }}>
                                                            {(egg.rarity || 'common').toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Timing & Loyalty Category (15 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>Timing & Loyalty (15 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {(EASTER_EGGS.timing_loyalty || []).map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>
                                                            {egg.icon && <egg.icon size={32} />}
                                                        </div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...(styles[`rarity${rarityKey(egg.rarity)}`] || {}) }}>
                                                            {(egg.rarity || 'common').toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Strategy & Mastery Category (20 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>Strategy & Mastery (20 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {(EASTER_EGGS.strategy_mastery || []).map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>
                                                            {egg.icon && <egg.icon size={32} />}
                                                        </div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...(styles[`rarity${rarityKey(egg.rarity)}`] || {}) }}>
                                                            {(egg.rarity || 'common').toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Social/Viral Category (20 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>Social & Viral (20 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {(EASTER_EGGS.social_viral || []).map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>
                                                            {egg.icon && <egg.icon size={32} />}
                                                        </div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...(styles[`rarity${rarityKey(egg.rarity)}`] || {}) }}>
                                                            {(egg.rarity || 'common').toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Meta/Interface Category (20 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>Meta & Interface (20 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {(EASTER_EGGS.meta_interface || []).map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>
                                                            {egg.icon && <egg.icon size={32} />}
                                                        </div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...(styles[`rarity${rarityKey(egg.rarity)}`] || {}) }}>
                                                            {(egg.rarity || 'common').toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Legacy/Milestones Category (15 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>Legacy & Milestones (15 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {(EASTER_EGGS.legacy_milestones || []).map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>
                                                            {egg.icon && <egg.icon size={32} />}
                                                        </div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...(styles[`rarity${rarityKey(egg.rarity)}`] || {}) }}>
                                                            {(egg.rarity || 'common').toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        
        </>
    );
}