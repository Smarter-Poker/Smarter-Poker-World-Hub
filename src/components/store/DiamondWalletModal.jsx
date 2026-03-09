/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DIAMOND WALLET MODAL — Transaction History Popup
 *  Opens when user clicks the diamond balance in the header
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { getAuthUser } from '../../lib/authUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Transaction type config — icons, labels, colors
// ─────────────────────────────────────────────────────────────────────────────
const TX_TYPES = {
    // Purchases & Spending
    purchase: { icon: '🛒', label: 'Purchase', color: '#ef4444' },
    feature_unlock: { icon: '🔓', label: 'Feature Unlock', color: '#f97316' },
    game_cost: { icon: '🎮', label: 'Game Entry', color: '#ef4444' },
    arcade_entry: { icon: '🕹️', label: 'Arcade Entry', color: '#ef4444' },
    // Bonuses & Rewards
    bonus: { icon: '🎁', label: 'Bonus', color: '#a855f7' },
    signup_bonus: { icon: '🎉', label: 'Welcome Bonus', color: '#a855f7' },
    daily_bonus: { icon: '📅', label: 'Daily Bonus', color: '#3b82f6' },
    daily_login: { icon: '📅', label: 'Daily Login', color: '#3b82f6' },
    daily_trivia: { icon: '🧩', label: 'Daily Trivia', color: '#8b5cf6' },
    streak_reward: { icon: '🔥', label: 'Streak Reward', color: '#ff6600' },
    vip_reward: { icon: '👑', label: 'VIP Reward', color: '#eab308' },
    vip_stipend: { icon: '👑', label: 'VIP Stipend', color: '#eab308' },
    // Achievements & Challenges
    achievement: { icon: '🏆', label: 'Achievement', color: '#f59e0b' },
    challenge: { icon: '⚡', label: 'Challenge', color: '#06b6d4' },
    // Competition
    tournament_prize: { icon: '🥇', label: 'Tournament Prize', color: '#eab308' },
    tournament_refund: { icon: '🔄', label: 'Tournament Refund', color: '#94a3b8' },
    pvp_win: { icon: '⚔️', label: 'PvP Win', color: '#22c55e' },
    pvp_refund: { icon: '🔄', label: 'PvP Refund', color: '#94a3b8' },
    game_reward: { icon: '🎯', label: 'Game Reward', color: '#22c55e' },
    trivia_reward: { icon: '🧠', label: 'Trivia Reward', color: '#8b5cf6' },
    // Social & Community
    social_post: { icon: '📝', label: 'Social Post', color: '#ec4899' },
    follow: { icon: '👤', label: 'Follow Reward', color: '#06b6d4' },
    reaction: { icon: '❤️', label: 'Reaction Reward', color: '#f43f5e' },
    comment: { icon: '💬', label: 'Comment Reward', color: '#06b6d4' },
    share: { icon: '🔗', label: 'Share Reward', color: '#3b82f6' },
    referral: { icon: '🤝', label: 'Referral Bonus', color: '#10b981' },
    // Profile & Content
    profile_complete: { icon: '✅', label: 'Profile Bonus', color: '#22c55e' },
    profile_pic: { icon: '📸', label: 'Profile Pic Bonus', color: '#06b6d4' },
    video_watch: { icon: '🎬', label: 'Video Watch', color: '#8b5cf6' },
    video_favorite: { icon: '⭐', label: 'Video Favorite', color: '#eab308' },
    hendonmob_link: { icon: '🔗', label: 'HendonMob Link', color: '#10b981' },
    venue_review: { icon: '📍', label: 'Venue Review', color: '#f59e0b' },
    promo_code: { icon: '🎟️', label: 'Promo Code', color: '#a855f7' },
    // Other
    refund: { icon: '🔄', label: 'Refund', color: '#94a3b8' },
    adjustment: { icon: '⚙️', label: 'Adjustment', color: '#94a3b8' },
};

const FILTER_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'purchase', label: 'Purchases' },
    { value: 'earned', label: 'Earned' },
    { value: 'spent', label: 'Spent' },
    { value: 'refund', label: 'Refunds' },
];

const EARNED_TYPES = [
    'bonus', 'signup_bonus', 'daily_bonus', 'daily_login', 'daily_trivia',
    'streak_reward', 'achievement', 'challenge',
    'tournament_prize', 'pvp_win', 'game_reward', 'trivia_reward',
    'vip_reward', 'vip_stipend',
    'social_post', 'follow', 'reaction', 'comment', 'share', 'referral',
    'profile_complete', 'profile_pic', 'video_watch', 'video_favorite',
    'hendonmob_link', 'venue_review', 'promo_code'
];

// ─────────────────────────────────────────────────────────────────────────────
// Modal Component
// ─────────────────────────────────────────────────────────────────────────────
export default function DiamondWalletModal({ isOpen, onClose, onBuyClick }) {
    const [transactions, setTransactions] = useState([]);
    const [balance, setBalance] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [total, setTotal] = useState(0);

    const fetchTransactions = useCallback(async () => {
        setLoading(true);
        try {
            const user = getAuthUser();
            if (!user) return;

            const session = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
            if (!session?.access_token) return;

            const params = new URLSearchParams({ limit: '50' });
            // For 'earned'/'spent' we fetch all and filter client-side
            if (filter !== 'all' && filter !== 'earned' && filter !== 'spent') {
                params.set('type', filter);
            }

            const res = await fetch(`/api/store/diamond-transactions?${params}`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setTransactions(data.transactions || []);
                setBalance(data.balance || 0);
                setTotal(data.total || 0);
            }
        } catch (err) {
            console.error('Failed to load transactions:', err);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        if (isOpen) fetchTransactions();
    }, [isOpen, fetchTransactions]);

    // Client-side filter for earned/spent groups
    // NOTE: DB uses 'transaction_type' column, normalize for backward compat
    const filteredTx = transactions.filter(tx => {
        const txType = tx.transaction_type || tx.type;
        if (filter === 'all') return true;
        if (filter === 'earned') return EARNED_TYPES.includes(txType);
        if (filter === 'spent') return tx.amount < 0 && !['refund', 'tournament_refund', 'pvp_refund'].includes(txType);
        return txType === filter;
    });

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 9998,
                    background: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(4px)',
                    animation: 'walletFadeIn 0.2s ease',
                }}
            />

            {/* Modal — Full Screen */}
            <div
                style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 9999,
                    background: 'linear-gradient(180deg, rgba(8, 20, 40, 0.99) 0%, rgba(4, 10, 24, 1) 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'walletFadeScale 0.25s ease',
                    fontFamily: "'Inter', -apple-system, sans-serif",
                }}
            >
                {/* Close button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px 0' }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: 8,
                            color: 'rgba(255, 255, 255, 0.6)',
                            fontSize: 18,
                            width: 36, height: 36,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; e.currentTarget.style.color = 'white'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'; }}
                    >
                        ✕
                    </button>
                </div>

                {/* Header — Balance Display */}
                <div style={{
                    padding: '16px 20px 20px',
                    borderBottom: '1px solid rgba(0, 212, 255, 0.12)',
                    textAlign: 'center',
                }}>
                    <div style={{
                        fontSize: 14, fontWeight: 600,
                        color: 'rgba(255, 255, 255, 0.5)',
                        textTransform: 'uppercase',
                        letterSpacing: '1.5px',
                        marginBottom: 8,
                    }}>
                        Diamond Wallet
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                    }}>
                        <img
                            src="/images/diamond.png"
                            alt="Diamond"
                            style={{ width: 32, height: 32 }}
                        />
                        <span style={{
                            fontFamily: 'Orbitron, monospace',
                            fontSize: 36,
                            fontWeight: 700,
                            color: '#00d4ff',
                            textShadow: '0 0 20px rgba(0, 212, 255, 0.4)',
                        }}>
                            {loading ? '...' : balance.toLocaleString()}
                        </span>
                    </div>

                    <button
                        onClick={() => { onClose(); onBuyClick?.(); }}
                        style={{
                            marginTop: 12,
                            padding: '8px 24px',
                            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 150, 255, 0.2))',
                            border: '1px solid rgba(0, 212, 255, 0.5)',
                            borderRadius: 20,
                            color: '#00d4ff',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 212, 255, 0.35), rgba(0, 150, 255, 0.35))';
                            e.currentTarget.style.transform = 'scale(1.03)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 150, 255, 0.2))';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        + Buy Diamonds
                    </button>
                </div>

                {/* Filter Bar */}
                <div style={{
                    display: 'flex',
                    gap: 6,
                    padding: '12px 16px',
                    overflowX: 'auto',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                }}>
                    {FILTER_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setFilter(opt.value)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: 16,
                                border: filter === opt.value
                                    ? '1px solid rgba(0, 212, 255, 0.6)'
                                    : '1px solid rgba(255, 255, 255, 0.08)',
                                background: filter === opt.value
                                    ? 'rgba(0, 212, 255, 0.15)'
                                    : 'rgba(255, 255, 255, 0.04)',
                                color: filter === opt.value ? '#00d4ff' : 'rgba(255, 255, 255, 0.6)',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s',
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Transaction List */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '4px 0',
                }}>
                    {loading ? (
                        <div style={{
                            textAlign: 'center',
                            padding: 40,
                            color: 'rgba(255, 255, 255, 0.4)',
                        }}>
                            Loading transactions...
                        </div>
                    ) : filteredTx.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: 40,
                            color: 'rgba(255, 255, 255, 0.3)',
                        }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>💎</div>
                            No transactions yet
                        </div>
                    ) : (
                        filteredTx.map(tx => {
                            const txType = tx.transaction_type || tx.type;
                            const config = TX_TYPES[txType] || TX_TYPES.adjustment;
                            const isPositive = tx.amount >= 0;
                            const dt = new Date(tx.created_at);

                            return (
                                <div
                                    key={tx.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: '12px 16px',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    {/* Icon */}
                                    <div style={{
                                        width: 36, height: 36,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: 10,
                                        background: `${config.color}15`,
                                        fontSize: 18,
                                        flexShrink: 0,
                                    }}>
                                        {config.icon}
                                    </div>

                                    {/* Details */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: 13,
                                            fontWeight: 600,
                                            color: '#e2e8f0',
                                            marginBottom: 2,
                                        }}>
                                            {config.label}
                                        </div>
                                        <div style={{
                                            fontSize: 11,
                                            color: 'rgba(255, 255, 255, 0.35)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {tx.description || config.label}
                                        </div>
                                    </div>

                                    {/* Amount + Time */}
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-end',
                                        flexShrink: 0,
                                    }}>
                                        <span style={{
                                            fontFamily: 'Orbitron, monospace',
                                            fontSize: 14,
                                            fontWeight: 700,
                                            color: isPositive ? '#4ade80' : '#f87171',
                                        }}>
                                            {isPositive ? '+' : ''}{tx.amount.toLocaleString()}
                                        </span>
                                        {tx.balance_after != null && (
                                            <span style={{
                                                fontSize: 10,
                                                color: 'rgba(255, 255, 255, 0.25)',
                                            }}>
                                                Bal: {tx.balance_after.toLocaleString()}
                                            </span>
                                        )}
                                        <span style={{
                                            fontSize: 10,
                                            color: 'rgba(255, 255, 255, 0.2)',
                                            marginTop: 2,
                                        }}>
                                            {dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            {' '}
                                            {dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                {!loading && total > 50 && (
                    <div style={{
                        textAlign: 'center',
                        padding: '10px 16px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        fontSize: 11,
                        color: 'rgba(255, 255, 255, 0.3)',
                    }}>
                        Showing latest 50 of {total} transactions
                    </div>
                )}
            </div>

            {/* Keyframe animations */}
            <style jsx global>{`
                @keyframes walletFadeScale {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes walletFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </>
    );
}
