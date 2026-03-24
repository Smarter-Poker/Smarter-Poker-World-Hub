/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DIAMOND WALLET MODAL — Transaction History Popup
 *  Opens when user clicks the diamond balance in the header
 *
 *  ENHANCEMENTS (R3):
 *  1. Date grouping (Today, Yesterday, This Week, Earlier)
 *  2. Transaction search bar
 *  3. "Load More" pagination (beyond 50 limit)
 *  4. Auto-refresh transaction list while modal is open
 *  5. Dynamic skeleton count based on viewport
 *  6. Running balance sparkline chart
 *  7. Export/download CSV
 *
 *  ENHANCEMENTS (R6):
 *  A. Animated balance counter (count up/down)
 *  B. Expandable transaction rows (click for details)
 *  C. Empty state diamond illustration
 *  D. Keyboard accessibility (Escape, aria-labels)
 *  E. Pull-to-refresh on mobile
 *  F. Filter persistence (localStorage)
 *  G. Transaction analytics stats panel
 *
 *  ENHANCEMENTS (R7):
 *  H1. Transaction receipt copy
 *  H2. Filter badge counts
 *  H3. Enhanced empty state CTA
 *  H4. Optimistic balance update
 *  H5. Stats skeleton loading
 *  H6. Confetti on first purchase
 *  H7. Diamond transfer to friends (with anti-abuse)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getAuthUser } from '../../lib/authUtils';
import { showStoreToast } from './StoreToast';

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
    // Gifts / Transfers
    diamond_gift_sent: { icon: '🎁', label: 'Gift Sent', color: '#00d4ff' },
    diamond_gift_received: { icon: '🎁', label: 'Gift Received', color: '#22c55e' },
    // Other
    refund: { icon: '🔄', label: 'Refund', color: '#94a3b8' },
    adjustment: { icon: '⚙️', label: 'Adjustment', color: '#94a3b8' },
};

const FILTER_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'purchase', label: 'Purchases' },
    { value: 'earned', label: 'Earned' },
    { value: 'spent', label: 'Spent' },
    { value: 'gifts', label: 'Gifts' },
    { value: 'refund', label: 'Refunds' },
];

const EARNED_TYPES = [
    'bonus', 'signup_bonus', 'daily_bonus', 'daily_login', 'daily_trivia',
    'streak_reward', 'achievement', 'challenge',
    'tournament_prize', 'pvp_win', 'game_reward', 'trivia_reward',
    'vip_reward', 'vip_stipend',
    'social_post', 'follow', 'reaction', 'comment', 'share', 'referral',
    'profile_complete', 'profile_pic', 'video_watch', 'video_favorite',
    'hendonmob_link', 'venue_review', 'promo_code',
    'diamond_gift_received'
];

const SPENT_TYPES_EXCLUDE = ['refund', 'tournament_refund', 'pvp_refund'];

// ── H1: Copy receipt to clipboard ──
function copyReceiptToClipboard(tx) {
    const txType = tx.transaction_type || tx.type;
    const config = TX_TYPES[txType] || TX_TYPES.adjustment;
    const dt = new Date(tx.created_at);
    const receipt = `Smarter.Poker Diamond Receipt\nRef: ${tx.id || 'N/A'}\nType: ${config.label}\nAmount: ${tx.amount >= 0 ? '+' : ''}${tx.amount}💎\nBalance After: ${tx.balance_after ?? 'N/A'}💎\nDate: ${dt.toLocaleString()}`;
    try {
        navigator.clipboard.writeText(receipt);
        return true;
    } catch (_) {
        return false;
    }
}

// ── H6: Confetti CSS animation helper ──
function showConfettiAnimation() {
    const container = document.createElement('div');
    container.id = 'wallet-confetti';
    container.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;overflow:hidden;';
    const colors = ['#00d4ff', '#4ade80', '#f59e0b', '#a855f7', '#f43f5e', '#FFD700'];
    for (let i = 0; i < 60; i++) {
        const p = document.createElement('div');
        const c = colors[i % colors.length];
        p.style.cssText = `position:absolute;width:${6+Math.random()*6}px;height:${6+Math.random()*6}px;background:${c};border-radius:${Math.random()>0.5?'50%':'2px'};left:${Math.random()*100}%;top:-10%;opacity:0.9;animation:confettiFall ${1.5+Math.random()*2}s ease-out ${Math.random()*0.5}s forwards;`;
        container.appendChild(p);
    }
    document.body.appendChild(container);
    setTimeout(() => { container.remove(); }, 4000);
}

// ── PERF-2: localStorage cache key for instant modal re-opens ──
const CACHE_KEY = 'sp-cached-wallet-txns';
const CACHE_TTL_MS = 60_000; // 60 seconds
const PAGE_SIZE = 50;
const FILTER_CACHE_KEY = 'sp-wallet-last-filter';

function getCachedTransactions() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { transactions, balance, total, ts } = JSON.parse(raw);
        if (Date.now() - ts > CACHE_TTL_MS) return null; // stale
        return { transactions, balance, total };
    } catch (_) { return null; }
}

function setCachedTransactions(transactions, balance, total) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            transactions, balance, total, ts: Date.now()
        }));
    } catch (_) { /* quota exceeded — ignore */ }
}

// ── PERF-4: Read cached balance from header cache ──
function getCachedBalance() {
    try {
        const raw = localStorage.getItem('sp-cached-header-user');
        if (raw) {
            const { diamonds } = JSON.parse(raw);
            return diamonds ?? 0;
        }
    } catch (_) {}
    return 0;
}

// ── ENH-1: Date grouping helper ──
function getDateGroup(dateStr) {
    const now = new Date();
    const dt = new Date(dateStr);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    if (dt >= today) return 'Today';
    if (dt >= yesterday) return 'Yesterday';
    if (dt >= weekAgo) return 'This Week';
    return 'Earlier';
}

// ── ENH-7: Export CSV helper ──
function exportTransactionsCSV(filteredTx) {
    const headers = ['Date', 'Type', 'Description', 'Amount', 'Balance After'];
    const rows = filteredTx.map(tx => {
        const txType = tx.transaction_type || tx.type;
        const config = TX_TYPES[txType] || TX_TYPES.adjustment;
        const dt = new Date(tx.created_at);
        return [
            dt.toISOString().slice(0, 19).replace('T', ' '),
            config.label,
            (tx.description || config.label).replace(/,/g, ';'),
            tx.amount ?? 0,
            tx.balance_after ?? ''
        ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diamond-wallet-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── ENH-6: Sparkline SVG component ──
const BalanceSparkline = ({ transactions }) => {
    // Extract balance_after from the last 20 transactions (reversed to chronological order)
    const points = useMemo(() => {
        const withBalance = transactions
            .filter(tx => tx.balance_after != null)
            .slice(0, 20)
            .reverse();
        if (withBalance.length < 2) return null;
        return withBalance.map(tx => tx.balance_after);
    }, [transactions]);

    if (!points) return null;

    const width = 200;
    const height = 32;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const padding = 2;

    const pathData = points.map((val, i) => {
        const x = padding + (i / (points.length - 1)) * (width - padding * 2);
        const y = padding + (1 - (val - min) / range) * (height - padding * 2);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');

    // Determine trend color
    const isUp = points[points.length - 1] >= points[0];
    const lineColor = isUp ? '#4ade80' : '#f87171';

    return (
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ opacity: 0.7 }}>
                <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                    </linearGradient>
                </defs>
                {/* Fill area */}
                <path
                    d={`${pathData} L ${(width - padding).toFixed(1)} ${height} L ${padding} ${height} Z`}
                    fill="url(#sparkGrad)"
                />
                {/* Line */}
                <path d={pathData} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 10, color: isUp ? '#4ade80' : '#f87171', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {isUp ? '▲' : '▼'} {Math.abs(points[points.length - 1] - points[0]).toLocaleString()}
            </span>
        </div>
    );
};

// ── ENH-5: Dynamic skeleton row count ──
function getSkeletonCount() {
    if (typeof window === 'undefined') return 5;
    // Each skeleton row is ~60px. Available space = viewport - header(~220px) - filter(~48px)
    const available = window.innerHeight - 268;
    return Math.max(3, Math.min(10, Math.floor(available / 60)));
}

// ── Skeleton shimmer row ──
const SkeletonRow = () => (
    <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
    }}>
        <div style={{
            width: 36, height: 36,
            borderRadius: 10,
            background: 'rgba(255, 255, 255, 0.06)',
            animation: 'walletShimmer 1.2s ease-in-out infinite',
            flexShrink: 0,
        }} />
        <div style={{ flex: 1 }}>
            <div style={{
                width: '60%', height: 12, borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.06)',
                animation: 'walletShimmer 1.2s ease-in-out infinite',
                marginBottom: 6,
            }} />
            <div style={{
                width: '40%', height: 10, borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.04)',
                animation: 'walletShimmer 1.2s ease-in-out infinite',
                animationDelay: '0.2s',
            }} />
        </div>
        <div style={{
            width: 48, height: 14, borderRadius: 4,
            background: 'rgba(255, 255, 255, 0.06)',
            animation: 'walletShimmer 1.2s ease-in-out infinite',
            animationDelay: '0.4s',
            flexShrink: 0,
        }} />
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Modal Component
// ─────────────────────────────────────────────────────────────────────────────
// ── ENH-A: Animated balance counter hook ──
function useAnimatedCounter(target, duration = 600) {
    const [display, setDisplay] = useState(target);
    const prevRef = useRef(target);
    const rafRef = useRef(null);

    useEffect(() => {
        const from = prevRef.current;
        const to = target;
        if (from === to) return;
        prevRef.current = to;
        const diff = to - from;
        const start = performance.now();

        const tick = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(from + diff * eased));
            if (progress < 1) {
                rafRef.current = requestAnimationFrame(tick);
            }
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [target, duration]);

    return display;
}

export default function DiamondWalletModal({ isOpen, onClose, onBuyClick, initialBalance }) {
    const [transactions, setTransactions] = useState([]);
    // ── PERF-4: Initialize balance from prop (header cache) or localStorage ──
    const [balance, setBalance] = useState(() => initialBalance ?? getCachedBalance());
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    // ── ENH-F: Restore last filter from localStorage ──
    const [filter, setFilter] = useState(() => {
        try { return localStorage.getItem(FILTER_CACHE_KEY) || 'all'; } catch (_) { return 'all'; }
    });
    const [total, setTotal] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedTxId, setExpandedTxId] = useState(null); // ENH-B
    const [showStats, setShowStats] = useState(false); // ENH-G
    const [pullDistance, setPullDistance] = useState(0); // ENH-E
    const [isRefreshing, setIsRefreshing] = useState(false); // ENH-E
    const fetchedRef = useRef(false);
    const fetchInFlightRef = useRef(false);
    const skeletonCount = useRef(getSkeletonCount());
    const touchStartY = useRef(0); // ENH-E
    const scrollContainerRef = useRef(null); // ENH-E

    // ── H1: Receipt copy feedback ──
    const [copiedTxId, setCopiedTxId] = useState(null);
    // ── H7: Transfer state ──
    const [showTransfer, setShowTransfer] = useState(false);
    const [transferFriends, setTransferFriends] = useState([]);
    const [transferLoading, setTransferLoading] = useState(false);
    const [transferRecipient, setTransferRecipient] = useState(null);
    const [transferAmount, setTransferAmount] = useState('');
    const [transferError, setTransferError] = useState('');
    const [transferSuccess, setTransferSuccess] = useState('');
    const [friendsLoading, setFriendsLoading] = useState(false);
    const [friendSearch, setFriendSearch] = useState('');       // #8: Friend search
    const [confirmTransfer, setConfirmTransfer] = useState(null); // #5: Confirmation dialog
    const [recentRecipients, setRecentRecipients] = useState([]); // P2-3: Recent recipients
    const [dailyLimitInfo, setDailyLimitInfo] = useState(null);   // P2-4: Daily limit display
    const [userSearchMode, setUserSearchMode] = useState(false);  // P3: Search all users fallback
    const [userSearchResults, setUserSearchResults] = useState([]); // P3: User search results
    const [userSearchLoading, setUserSearchLoading] = useState(false); // P3: Search loading

    // ── ENH-A: Animated balance counter ──
    const animatedBalance = useAnimatedCounter(balance ?? 0);

    // ── GAP-2 FIX: Sync initialBalance prop when header gets realtime updates ──
    useEffect(() => {
        if (initialBalance !== undefined && initialBalance !== null) {
            setBalance(initialBalance);
        }
    }, [initialBalance]);

    // ── GAP-1 FIX + ENH-4: Update balance AND refetch transactions in real time while modal is open ──
    useEffect(() => {
        if (!isOpen) return;
        const handleBalanceRefresh = (e) => {
            // H4: Read from event detail first (premiumFeatureGate, AvatarContext pass newBalance)
            const fromEvent = e?.detail?.newBalance;
            if (fromEvent !== undefined && fromEvent !== null) {
                setBalance(fromEvent);
            } else {
                // Fallback: re-read cached balance
                const fresh = getCachedBalance();
                setBalance(fresh);
            }
            // H6: Confetti on first purchase
            if (e?.detail?.source === 'diamond-store-purchase') {
                try {
                    if (!localStorage.getItem('sp-first-purchase-celebrated')) {
                        localStorage.setItem('sp-first-purchase-celebrated', '1');
                        showConfettiAnimation();
                    }
                } catch (_) {}
            }
            // ENH-4: Also re-fetch transaction list so new transactions appear
            // BUG-R2: Skip if fetch already in-flight (race condition guard)
            if (!fetchInFlightRef.current) {
                fetchTransactions();
            }
        };
        window.addEventListener('diamond-balance-refresh', handleBalanceRefresh);
        return () => window.removeEventListener('diamond-balance-refresh', handleBalanceRefresh);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Helper: get auth session for API calls ──
    const getSession = useCallback(() => {
        try {
            return { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
        } catch (_) { return null; }
    }, []);

    // ── BUG-1 FIX: Fetch once on open, filter purely client-side ──
    const fetchTransactions = useCallback(async (offset = 0) => {
        // BUG-R2: Guard against concurrent fetches
        if (fetchInFlightRef.current) return;
        fetchInFlightRef.current = true;
        if (offset === 0) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }
        if (offset === 0) setError(null);
        try {
            const user = getAuthUser();
            if (!user) return;

            const session = getSession();
            if (!session?.access_token) return;

            const res = await fetch(`/api/store/diamond-transactions?limit=${PAGE_SIZE}&offset=${offset}`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });

            if (res.ok) {
                const data = await res.json();
                const txns = data.transactions || [];
                const bal = data.balance ?? 0;
                const tot = data.total || 0;

                if (offset === 0) {
                    setTransactions(txns);
                } else {
                    // ENH-3: Append for "Load More"
                    setTransactions(prev => [...prev, ...txns]);
                }
                setBalance(bal);
                setTotal(tot);
                fetchedRef.current = true;
                // ── PERF-2: Cache first page for instant re-opens ──
                if (offset === 0) {
                    setCachedTransactions(txns, bal, tot);
                }
            } else {
                throw new Error(`Server error ${res.status}`);
            }
        } catch (err) {
            console.error('Failed to load transactions:', err);
            if (offset === 0) {
                setError('Failed to load transactions. Please try again.');
            }
        } finally {
            fetchInFlightRef.current = false;
            setLoading(false);
            setLoadingMore(false);
        }
    }, [getSession]);

    // ── ENH-D: Keyboard accessibility — Escape to close ──
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // ── ENH-F: Persist filter selection ──
    const handleFilterChange = useCallback((value) => {
        setFilter(value);
        try { localStorage.setItem(FILTER_CACHE_KEY, value); } catch (_) {}
    }, []);

    // ── ENH-E: Pull-to-refresh on mobile ──
    const handleTouchStart = useCallback((e) => {
        if (scrollContainerRef.current?.scrollTop === 0) {
            touchStartY.current = e.touches[0].clientY;
        } else {
            touchStartY.current = 0;
        }
    }, []);

    const handleTouchMove = useCallback((e) => {
        if (!touchStartY.current) return;
        const delta = e.touches[0].clientY - touchStartY.current;
        if (delta > 0 && delta < 120) {
            setPullDistance(delta);
        }
    }, []);

    const handleTouchEnd = useCallback(async () => {
        if (pullDistance > 60 && !fetchInFlightRef.current) {
            setIsRefreshing(true);
            await fetchTransactions();
            setIsRefreshing(false);
        }
        setPullDistance(0);
        touchStartY.current = 0;
    }, [pullDistance, fetchTransactions]);

    // ── H7: Fetch friends list when transfer panel opens ──
    const allUsersCache = useRef([]);  // BUG-1 FIX: Cache all users from initial fetch
    const fetchFriends = useCallback(async () => {
        setFriendsLoading(true);
        try {
            const session = getSession();
            if (!session?.access_token) {
                console.warn('[Diamond Transfer] No auth session for friends fetch');
                setFriendsLoading(false);
                return;
            }
            // Use action=full to get friends + suggestions for search
            const res = await fetch('/api/friends?action=full', {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const friends = data.data?.friends || [];
                setTransferFriends(friends);
                // BUG-1 FIX: Cache all users for local search (no re-fetch per keystroke)
                allUsersCache.current = data.data?.suggestions || [];
                // If no friends, auto-switch to user search mode
                if (friends.length === 0) {
                    setUserSearchMode(true);
                }
            } else {
                console.warn('[Diamond Transfer] Friends API error:', res.status);
            }
        } catch (err) {
            console.warn('[Diamond Transfer] Friends fetch failed:', err.message);
        }
        setFriendsLoading(false);
    }, [getSession]);

    // ── P3: Search all platform users (local filter from cached data) ──
    const searchUsers = useCallback((query) => {
        if (!query || query.trim().length < 2) {
            setUserSearchResults([]);
            return;
        }
        const q = query.trim().toLowerCase();
        // BUG-1 FIX: Filter locally from cached allUsersCache — no API call per keystroke
        const matches = allUsersCache.current.filter(u =>
            (u.display_name || '').toLowerCase().includes(q) ||
            (u.username || '').toLowerCase().includes(q)
        ).slice(0, 10);
        setUserSearchResults(matches);
    }, []);

    // ── H7: Send diamonds to friend ──
    const handleTransfer = useCallback(async () => {
        if (!transferRecipient || !transferAmount) return;
        const amount = parseInt(transferAmount);
        if (isNaN(amount) || amount < 10) {
            setTransferError('Minimum transfer is 10 diamonds');
            return;
        }
        if (amount > (balance ?? 0)) {
            setTransferError('Insufficient diamond balance');
            return;
        }
        // #5: Show confirmation dialog first
        if (!confirmTransfer) {
            setConfirmTransfer({ amount, recipient: transferRecipient });
            return;
        }
        setConfirmTransfer(null);
        setTransferLoading(true);
        setTransferError('');
        setTransferSuccess('');
        try {
            const session = getSession();
            // BUG-2 FIX: Guard against null session
            if (!session?.access_token) {
                setTransferError('Please log in to send diamonds');
                showStoreToast('error', 'Please log in to send diamonds');
                setTransferLoading(false);
                return;
            }
            const res = await fetch('/api/store/diamond-transfer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    recipientId: transferRecipient.id,
                    amount
                })
            });
            const data = await res.json();
            if (data.success) {
                const tierLabel = data.tier === 'vip' ? ' (VIP Friend)' : '';
                const successMsg = `Sent ${amount}💎 to ${transferRecipient.display_name || transferRecipient.username}${tierLabel}!`;
                setTransferSuccess(successMsg);
                // P2-1: StoreToast for premium notification
                showStoreToast('success', successMsg + (data.dailyRemaining != null ? ` ${data.dailyRemaining}💎 remaining today.` : ''));
                setTransferAmount('');
                // P2-3: Save to recent recipients
                setRecentRecipients(prev => {
                    const filtered = prev.filter(r => r.id !== transferRecipient.id);
                    return [{ ...transferRecipient, lastAmount: amount, lastSent: Date.now() }, ...filtered].slice(0, 3);
                });
                // P2-4: Update daily limit info
                if (data.dailySent != null && data.dailyLimit != null) {
                    setDailyLimitInfo({ sent: data.dailySent, limit: data.dailyLimit, tier: data.tier });
                }
                setTransferRecipient(null);
                // Update balance optimistically
                setBalance(prev => (prev ?? 0) - amount);
                // Dispatch refresh event
                window.dispatchEvent(new CustomEvent('diamond-balance-refresh', { detail: { source: 'diamond-transfer' } }));
                // #7: Recipient notification event (other components can listen)
                window.dispatchEvent(new CustomEvent('diamond-gift-sent', {
                    detail: {
                        recipientId: transferRecipient.id,
                        recipientName: data.recipientName || transferRecipient.display_name,
                        amount,
                        senderBalance: data.newBalance,
                    }
                }));
                // P2-5: Sparkle animation on success
                showConfettiAnimation();
                // Refetch transactions
                if (!fetchInFlightRef.current) fetchTransactions();
                setTimeout(() => setTransferSuccess(''), 4000);
            } else {
                setTransferError(data.error || 'Transfer failed');
                // P2-1: StoreToast for error
                showStoreToast('error', data.error || 'Transfer failed');
            }
        } catch (err) {
            const errMsg = err.message || 'Transfer failed';
            setTransferError(errMsg);
            // BUG-3 FIX: Show StoreToast for network/unexpected errors too
            showStoreToast('error', errMsg);
        }
        setTransferLoading(false);
    }, [transferRecipient, transferAmount, balance, getSession, fetchTransactions, confirmTransfer]);

    useEffect(() => {
        if (!isOpen) {
            // Reset state when closing so next open starts fresh
            fetchedRef.current = false;
            setSearchQuery('');
            setExpandedTxId(null);
            setShowStats(false);
            setPullDistance(0);
            setShowTransfer(false);
            setTransferError('');
            setTransferSuccess('');
            setFriendSearch('');
            setConfirmTransfer(null);
            setDailyLimitInfo(null);
            setUserSearchMode(false);
            setUserSearchResults([]);
            return;
        }

        // ── PERF-2: Show cached data immediately, then refresh in background ──
        const cached = getCachedTransactions();
        if (cached) {
            setTransactions(cached.transactions);
            setBalance(cached.balance ?? getCachedBalance());
            setTotal(cached.total);
            setLoading(false);
            // Still refresh in background for freshness
            fetchTransactions();
        } else {
            // ── PERF-4: At least show the cached balance while loading ──
            setBalance(getCachedBalance());
            fetchTransactions();
        }
    }, [isOpen, fetchTransactions]);

    // ── BUG-1 FIX: Client-side filter + ENH-2: search ──
    const filteredTx = useMemo(() => {
        let result = transactions;

        // Apply type filter
        if (filter !== 'all') {
         result = result.filter(tx => {
                const txType = tx.transaction_type || tx.type;
                if (filter === 'earned') return EARNED_TYPES.includes(txType);
                if (filter === 'spent') return tx.amount < 0 && !['refund', 'tournament_refund', 'pvp_refund'].includes(txType);
                if (filter === 'refund') return ['refund', 'tournament_refund', 'pvp_refund'].includes(txType);
                if (filter === 'purchase') return ['purchase', 'feature_unlock', 'game_cost', 'arcade_entry'].includes(txType);
                if (filter === 'gifts') return ['diamond_gift_sent', 'diamond_gift_received'].includes(txType);
                return txType === filter;
            });
        }

        // Apply search filter
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter(tx => {
                const txType = tx.transaction_type || tx.type;
                const config = TX_TYPES[txType] || TX_TYPES.adjustment;
                return (
                    config.label.toLowerCase().includes(q) ||
                    (tx.description || '').toLowerCase().includes(q) ||
                    String(tx.amount).includes(q)
                );
            });
        }

        return result;
    }, [transactions, filter, searchQuery]);

    // ── H2: Filter badge counts ──
    const filterCounts = useMemo(() => {
        const counts = { all: transactions.length, purchase: 0, earned: 0, spent: 0, refund: 0, gifts: 0 };
        transactions.forEach(tx => {
            const txType = tx.transaction_type || tx.type;
            if (EARNED_TYPES.includes(txType)) counts.earned++;
            if (tx.amount < 0 && !SPENT_TYPES_EXCLUDE.includes(txType)) counts.spent++;
            if (['refund', 'tournament_refund', 'pvp_refund'].includes(txType)) counts.refund++;
            if (['purchase', 'feature_unlock', 'game_cost', 'arcade_entry'].includes(txType)) counts.purchase++;
            if (['diamond_gift_sent', 'diamond_gift_received'].includes(txType)) counts.gifts++;
        });
        return counts;
    }, [transactions]);

    // ── ENH-1: Group filtered transactions by date ──
    const groupedTx = useMemo(() => {
        const groups = [];
        let currentGroup = null;

        filteredTx.forEach(tx => {
            const group = getDateGroup(tx.created_at);
            if (group !== currentGroup) {
                groups.push({ type: 'header', label: group });
                currentGroup = group;
            }
            groups.push({ type: 'tx', data: tx });
        });

        return groups;
    }, [filteredTx]);

    // ── ENH-3: Can load more? ──
    const canLoadMore = transactions.length < total;

    // ── ENH-G: Transaction analytics stats (computed from loaded transactions) ──
    const stats = useMemo(() => {
        if (!transactions.length) return null;
        let totalEarned = 0, totalSpent = 0;
        const sourceMap = {};
        const now = new Date();
        const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
        let weekEarned = 0, weekSpent = 0;

        transactions.forEach(tx => {
            const amt = tx.amount ?? 0;
            const txType = tx.transaction_type || tx.type;
            const config = TX_TYPES[txType] || TX_TYPES.adjustment;
            if (amt >= 0) {
                totalEarned += amt;
                if (new Date(tx.created_at) >= weekAgo) weekEarned += amt;
            } else {
                totalSpent += Math.abs(amt);
                if (new Date(tx.created_at) >= weekAgo) weekSpent += Math.abs(amt);
            }
            sourceMap[config.label] = (sourceMap[config.label] || 0) + Math.abs(amt);
        });

        // Top 5 sources
        const topSources = Object.entries(sourceMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        // P2-2: Transfer analytics
        let giftsSent = 0, giftsReceived = 0, giftCount = 0;
        const recipientMap = {};
        transactions.forEach(tx => {
            const txType = tx.transaction_type || tx.type;
            if (txType === 'diamond_gift_sent') {
                giftsSent += Math.abs(tx.amount ?? 0);
                giftCount++;
                const match = (tx.description || '').match(/to (.+?)\s*\[/);
                if (match) recipientMap[match[1]] = (recipientMap[match[1]] || 0) + Math.abs(tx.amount ?? 0);
            }
            if (txType === 'diamond_gift_received') {
                giftsReceived += Math.abs(tx.amount ?? 0);
            }
        });
        const topRecipients = Object.entries(recipientMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

        return { totalEarned, totalSpent, weekEarned, weekSpent, topSources, giftsSent, giftsReceived, giftCount, topRecipients };
    }, [transactions]);

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
                role="dialog"
                aria-modal="true"
                aria-label="Diamond Wallet"
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
                {/* Close button + Export button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px 0' }}>
                    {/* ENH-7: Export CSV button */}
                    <button
                        onClick={() => exportTransactionsCSV(filteredTx)}
                        disabled={filteredTx.length === 0}
                        style={{
                            background: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: 8,
                            color: filteredTx.length > 0 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)',
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '6px 12px',
                            cursor: filteredTx.length > 0 ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { if (filteredTx.length > 0) { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'; e.currentTarget.style.color = 'white'; } }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; e.currentTarget.style.color = filteredTx.length > 0 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)'; }}
                    >
                        Export CSV
                    </button>
                    {/* Close button */}
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

                {/* Header — Balance Display + Sparkline */}
                <div style={{
                    padding: '12px 20px 16px',
                    borderBottom: '1px solid rgba(0, 212, 255, 0.12)',
                    textAlign: 'center',
                }}>
                    <div style={{
                        fontSize: 14, fontWeight: 600,
                        color: 'rgba(255, 255, 255, 0.5)',
                        textTransform: 'uppercase',
                        letterSpacing: '1.5px',
                        marginBottom: 6,
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
                            {/* ── ENH-A: Animated counter display ── */}
                            {(animatedBalance ?? 0).toLocaleString()}
                        </span>
                    </div>

                    {/* ENH-6: Balance sparkline */}
                    <BalanceSparkline transactions={transactions} />

                    <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
                        <button
                            onClick={() => { onClose(); onBuyClick?.(); }}
                            style={{
                                padding: '8px 20px',
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
                        {/* H7: Send Diamonds button */}
                        <button
                            onClick={() => { setShowTransfer(v => !v); if (!showTransfer) fetchFriends(); }}
                            style={{
                                padding: '8px 20px',
                                background: showTransfer
                                    ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(0, 150, 200, 0.25))'
                                    : 'linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(0, 150, 200, 0.12))',
                                border: `1px solid ${showTransfer ? 'rgba(0, 212, 255, 0.6)' : 'rgba(0, 212, 255, 0.35)'}`,
                                borderRadius: 20,
                                color: '#00d4ff',
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 212, 255, 0.3), rgba(0, 150, 200, 0.3))';
                                e.currentTarget.style.transform = 'scale(1.03)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = showTransfer
                                    ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(0, 150, 200, 0.25))'
                                    : 'linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(0, 150, 200, 0.12))';
                                e.currentTarget.style.transform = 'scale(1)';
                            }}
                        >
                            Send Diamonds
                        </button>
                    </div>
                </div>

                {/* ENH-2: Search Bar */}
                <div style={{ padding: '8px 16px 4px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 10,
                        padding: '6px 12px',
                    }}>
                        <span style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.3)' }}>&#x1F50D;</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search transactions..."
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: '#e2e8f0',
                                fontSize: 13,
                                fontFamily: "'Inter', -apple-system, sans-serif",
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: 18, height: 18,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    fontSize: 10,
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter Bar + Stats Toggle */}
                <div style={{
                    display: 'flex',
                    gap: 6,
                    padding: '8px 16px',
                    overflowX: 'auto',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    alignItems: 'center',
                }}>
                    {FILTER_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => handleFilterChange(opt.value)}
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
                            {/* H2: Show filter badge counts */}
                            {opt.label}{transactions.length > 0 ? ` (${filterCounts[opt.value] ?? 0})` : ''}
                        </button>
                    ))}
                    {/* ENH-G: Stats toggle */}
                    <button
                        onClick={() => setShowStats(v => !v)}
                        style={{
                            marginLeft: 'auto',
                            padding: '6px 10px',
                            borderRadius: 16,
                            border: showStats
                                ? '1px solid rgba(168, 85, 247, 0.6)'
                                : '1px solid rgba(255, 255, 255, 0.08)',
                            background: showStats
                                ? 'rgba(168, 85, 247, 0.15)'
                                : 'rgba(255, 255, 255, 0.04)',
                            color: showStats ? '#a855f7' : 'rgba(255, 255, 255, 0.4)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s',
                            flexShrink: 0,
                        }}
                    >
                        Stats
                    </button>
                </div>

                {/* H7: Diamond Transfer Panel */}
                {showTransfer && (
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(0, 212, 255, 0.12)',
                        background: 'linear-gradient(180deg, rgba(8, 20, 40, 0.95) 0%, rgba(4, 12, 30, 0.98) 100%)',
                        animation: 'walletFadeIn 0.2s ease',
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#00d4ff', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Send Diamonds to a Friend
                        </div>
                        {/* Anti-abuse info */}
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 8, lineHeight: 1.4 }}>
                            Standard: 10-100 per transfer | 500/day | 200/day per friend | 60s cooldown<br/>
                            VIP Friends (60+ days): 10-500 per transfer | 2,000/day<br/>
                            5min cooldown between transfers to same friend | 1,000/day receive cap
                        </div>
                        {/* P2-4: Daily limit progress bar */}
                        {dailyLimitInfo && (
                            <div style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>
                                    <span>Today: {dailyLimitInfo.sent.toLocaleString()} / {dailyLimitInfo.limit.toLocaleString()}</span>
                                    <span style={{ color: dailyLimitInfo.sent >= dailyLimitInfo.limit * 0.8 ? '#f87171' : '#4ade80' }}>
                                        {(dailyLimitInfo.limit - dailyLimitInfo.sent).toLocaleString()} remaining
                                    </span>
                                </div>
                                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${Math.min((dailyLimitInfo.sent / dailyLimitInfo.limit) * 100, 100)}%`,
                                        height: '100%', borderRadius: 2, transition: 'width 0.3s ease',
                                        background: dailyLimitInfo.sent >= dailyLimitInfo.limit * 0.8
                                            ? 'linear-gradient(90deg, #f97316, #ef4444)'
                                            : 'linear-gradient(90deg, #4ade80, #22c55e)',
                                    }} />
                                </div>
                            </div>
                        )}
                        {/* P2-3: Recent recipients quick-send */}
                        {recentRecipients.length > 0 && !transferRecipient && (
                            <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent</div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {recentRecipients.map(r => (
                                        <button
                                            key={r.id}
                                            onClick={() => setTransferRecipient(r)}
                                            style={{
                                                padding: '4px 10px', borderRadius: 12,
                                                border: '1px solid rgba(0,212,255,0.2)',
                                                background: 'rgba(0,212,255,0.06)',
                                                color: '#00d4ff', fontSize: 10, fontWeight: 500,
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {r.avatar_url && <img src={r.avatar_url} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover' }} />}
                                            {r.display_name || r.username || 'User'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Friend picker / User search */}
                        <div style={{ marginBottom: 8 }}>
                            {friendsLoading ? (
                                <div style={{ padding: '8px 12px', background: 'rgba(0,212,255,0.04)', borderRadius: 8, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Loading friends...</div>
                            ) : transferFriends.length === 0 && !userSearchMode ? (
                                <div style={{ padding: '10px 12px', background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.08)', borderRadius: 10, textAlign: 'center' }}>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>No friends found</div>
                                    <button
                                        onClick={() => setUserSearchMode(true)}
                                        style={{
                                            padding: '5px 14px', borderRadius: 8,
                                            background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)',
                                            color: '#00d4ff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                        }}
                                    >Search All Users</button>
                                </div>
                            ) : userSearchMode ? (
                                <div>
                                    <div style={{ marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            value={friendSearch}
                                            onChange={e => { setFriendSearch(e.target.value); searchUsers(e.target.value); }}
                                            placeholder="Search by name or username..."
                                            style={{
                                                flex: 1, padding: '7px 12px',
                                                background: 'rgba(0,212,255,0.04)',
                                                border: '1px solid rgba(0,212,255,0.15)',
                                                borderRadius: 8, color: '#e2e8f0', fontSize: 12,
                                                outline: 'none', fontFamily: "'Inter', sans-serif",
                                            }}
                                            autoFocus
                                        />
                                        {transferFriends.length > 0 && (
                                            <button
                                                onClick={() => { setUserSearchMode(false); setFriendSearch(''); setUserSearchResults([]); }}
                                                style={{
                                                    padding: '6px 10px', borderRadius: 8,
                                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                                    color: 'rgba(255,255,255,0.5)', fontSize: 10, cursor: 'pointer',
                                                }}
                                            >Friends</button>
                                        )}
                                    </div>
                                    {userSearchLoading && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: '4px 0' }}>Searching...</div>}
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {userSearchResults.map(u => (
                                            <button
                                                key={u.id}
                                                onClick={() => setTransferRecipient(transferRecipient?.id === u.id ? null : u)}
                                                style={{
                                                    padding: '5px 10px', borderRadius: 14,
                                                    border: transferRecipient?.id === u.id
                                                        ? '1px solid rgba(0, 212, 255, 0.6)'
                                                        : '1px solid rgba(255,255,255,0.08)',
                                                    background: transferRecipient?.id === u.id
                                                        ? 'rgba(0, 212, 255, 0.12)'
                                                        : 'rgba(255,255,255,0.04)',
                                                    color: transferRecipient?.id === u.id ? '#00d4ff' : 'rgba(255,255,255,0.6)',
                                                    fontSize: 11, fontWeight: 500, cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: 5,
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                {u.avatar_url && <img src={u.avatar_url} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />}
                                                {u.display_name || u.username || 'User'}
                                            </button>
                                        ))}
                                    </div>
                                    {friendSearch.length >= 2 && userSearchResults.length === 0 && !userSearchLoading && (
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: '6px 0', textAlign: 'center' }}>No users found</div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* Friend search (shown when >6 friends) */}
                                    {transferFriends.length > 6 && (
                                        <div style={{ marginBottom: 6, display: 'flex', gap: 6 }}>
                                            <input
                                                type="text"
                                                value={friendSearch}
                                                onChange={e => setFriendSearch(e.target.value)}
                                                placeholder="Search friends..."
                                                style={{
                                                    flex: 1, padding: '5px 10px',
                                                    background: 'rgba(0,212,255,0.04)',
                                                    border: '1px solid rgba(0,212,255,0.1)',
                                                    borderRadius: 8, color: '#e2e8f0', fontSize: 11,
                                                    outline: 'none', fontFamily: "'Inter', sans-serif",
                                                }}
                                            />
                                            <button
                                                onClick={() => { setUserSearchMode(true); setFriendSearch(''); }}
                                                style={{
                                                    padding: '5px 10px', borderRadius: 8,
                                                    background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.12)',
                                                    color: '#00d4ff', fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap',
                                                }}
                                            >All Users</button>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {transferFriends
                                            .filter(f => {
                                                if (!friendSearch.trim()) return true;
                                                const q = friendSearch.trim().toLowerCase();
                                                return (f.display_name || '').toLowerCase().includes(q) ||
                                                       (f.username || '').toLowerCase().includes(q);
                                            })
                                            .slice(0, 20).map(f => (
                                        <button
                                            key={f.id}
                                            onClick={() => setTransferRecipient(transferRecipient?.id === f.id ? null : f)}
                                            style={{
                                                padding: '5px 10px', borderRadius: 14,
                                                border: transferRecipient?.id === f.id
                                                    ? '1px solid rgba(0, 212, 255, 0.6)'
                                                    : '1px solid rgba(255,255,255,0.08)',
                                                background: transferRecipient?.id === f.id
                                                    ? 'rgba(0, 212, 255, 0.12)'
                                                    : 'rgba(255,255,255,0.04)',
                                                color: transferRecipient?.id === f.id ? '#00d4ff' : 'rgba(255,255,255,0.6)',
                                                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: 5,
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {f.avatar_url && (
                                                <img src={f.avatar_url} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
                                            )}
                                            {f.display_name || f.username || 'User'}
                                        </button>
                                    ))}
                                    </div>
                                </>
                            )}
                        </div>
                        {/* Amount + Send */}
                        {transferRecipient && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <div style={{
                                    flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                                    background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.12)',
                                    borderRadius: 10, padding: '6px 12px',
                                }}>
                                    <span style={{ fontSize: 14 }}>💎</span>
                                    <input
                                        type="number"
                                        min="10" max="500"
                                        value={transferAmount}
                                        onChange={e => setTransferAmount(e.target.value)}
                                        placeholder="Amount"
                                        style={{
                                            flex: 1, background: 'transparent', border: 'none', outline: 'none',
                                            color: '#e2e8f0', fontSize: 14, fontWeight: 600,
                                            fontFamily: "'Inter', sans-serif", width: 60,
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={handleTransfer}
                                    disabled={transferLoading || !transferAmount}
                                    style={{
                                        padding: '8px 16px',
                                        background: transferLoading ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(0, 150, 200, 0.25))',
                                        border: '1px solid rgba(0, 212, 255, 0.45)',
                                        borderRadius: 10, color: '#00d4ff', fontSize: 12, fontWeight: 700,
                                        cursor: transferLoading ? 'default' : 'pointer',
                                        opacity: transferLoading || !transferAmount ? 0.5 : 1,
                                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                                    }}
                                >
                                    {transferLoading ? 'Sending...' : `Send to ${transferRecipient.display_name || transferRecipient.username}`}
                                </button>
                            </div>
                        )}
                        {/* Error / Success feedback */}
                        {transferError && (
                            <div style={{ marginTop: 6, fontSize: 11, color: '#f87171', padding: '4px 8px', background: 'rgba(248,113,113,0.08)', borderRadius: 6 }}>
                                {transferError}
                            </div>
                        )}
                        {transferSuccess && (
                            <div style={{ marginTop: 6, fontSize: 11, color: '#4ade80', padding: '4px 8px', background: 'rgba(74,222,128,0.08)', borderRadius: 6 }}>
                                {transferSuccess}
                            </div>
                        )}
                        {/* #5: Confirmation dialog */}
                        {confirmTransfer && (
                            <div style={{
                                marginTop: 8, padding: '10px 14px',
                                background: 'rgba(0, 212, 255, 0.06)',
                                border: '1px solid rgba(0, 212, 255, 0.2)',
                                borderRadius: 10,
                                animation: 'walletFadeIn 0.15s ease',
                            }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#00d4ff', marginBottom: 8 }}>
                                    Confirm Transfer
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 10, lineHeight: 1.4 }}>
                                    Send <strong style={{ color: '#00d4ff' }}>{confirmTransfer.amount}💎</strong> to{' '}
                                    <strong style={{ color: '#4ade80' }}>{confirmTransfer.recipient?.display_name || confirmTransfer.recipient?.username}</strong>?
                                    This cannot be undone.
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={() => setConfirmTransfer(null)}
                                        style={{
                                            flex: 1, padding: '7px 0',
                                            background: 'rgba(255,255,255,0.06)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 8, color: 'rgba(255,255,255,0.5)',
                                            fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleTransfer}
                                        style={{
                                            flex: 1, padding: '7px 0',
                                            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(0, 150, 200, 0.25))',
                                            border: '1px solid rgba(0, 212, 255, 0.45)',
                                            borderRadius: 8, color: '#00d4ff',
                                            fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                        }}
                                    >
                                        Confirm Send {confirmTransfer.amount}💎
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* H5: Stats skeleton when loading */}
                {showStats && !stats && (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(168,85,247,0.04)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, height: 60, animation: 'walletShimmer 1.2s ease-in-out infinite' }} />
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, height: 60, animation: 'walletShimmer 1.2s ease-in-out infinite', animationDelay: '0.2s' }} />
                        </div>
                    </div>
                )}
                {/* ENH-G: Analytics Stats Panel */}
                {showStats && stats && (
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        background: 'rgba(168, 85, 247, 0.04)',
                        animation: 'walletFadeIn 0.2s ease',
                    }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                            <div style={{ background: 'rgba(74, 222, 128, 0.08)', borderRadius: 8, padding: '8px 10px' }}>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Total Earned</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: '#4ade80', fontFamily: 'Orbitron, monospace' }}>+{stats.totalEarned.toLocaleString()}</div>
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>This week: +{stats.weekEarned.toLocaleString()}</div>
                            </div>
                            <div style={{ background: 'rgba(248, 113, 113, 0.08)', borderRadius: 8, padding: '8px 10px' }}>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Total Spent</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: '#f87171', fontFamily: 'Orbitron, monospace' }}>-{stats.totalSpent.toLocaleString()}</div>
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>This week: -{stats.weekSpent.toLocaleString()}</div>
                            </div>
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>Top Sources</div>
                        {stats.topSources.map(([name, amount], i) => (
                            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                <div style={{
                                    flex: 1, height: 4, borderRadius: 2,
                                    background: 'rgba(255,255,255,0.06)',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        width: `${(amount / stats.topSources[0][1]) * 100}%`,
                                        height: '100%',
                                        borderRadius: 2,
                                        background: `hsl(${200 + i * 30}, 70%, 55%)`,
                                    }} />
                                </div>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', minWidth: 80 }}>
                                    {name}: {amount.toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                {/* P2-2: Gift Analytics (shown when stats are open and gifts exist) */}
                {showStats && stats && (stats.giftsSent > 0 || stats.giftsReceived > 0) && (
                    <div style={{
                        padding: '8px 16px 12px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        background: 'rgba(0, 212, 255, 0.03)',
                        animation: 'walletFadeIn 0.2s ease',
                    }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gift Activity</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <div style={{ background: 'rgba(0,212,255,0.08)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Sent</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#00d4ff', fontFamily: 'Orbitron, monospace' }}>{stats.giftsSent.toLocaleString()}</div>
                            </div>
                            <div style={{ background: 'rgba(74,222,128,0.08)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Received</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', fontFamily: 'Orbitron, monospace' }}>{stats.giftsReceived.toLocaleString()}</div>
                            </div>
                            <div style={{ background: 'rgba(0,212,255,0.08)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Gifts</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#00d4ff', fontFamily: 'Orbitron, monospace' }}>{stats.giftCount}</div>
                            </div>
                        </div>
                        {stats.topRecipients.length > 0 && (
                            <>
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>Top Recipients</div>
                                {stats.topRecipients.map(([name, amount], i) => (
                                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                        <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                            <div style={{ width: `${(amount / stats.topRecipients[0][1]) * 100}%`, height: '100%', borderRadius: 2, background: `hsl(${25 + i * 15}, 80%, 55%)` }} />
                                        </div>
                                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', minWidth: 70 }}>
                                            {name}: {amount.toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* ENH-E: Pull-to-refresh indicator */}
                {pullDistance > 0 && (
                    <div style={{
                        textAlign: 'center',
                        padding: `${Math.min(pullDistance / 2, 30)}px 0`,
                        color: pullDistance > 60 ? '#00d4ff' : 'rgba(255,255,255,0.3)',
                        fontSize: 11,
                        fontWeight: 600,
                        transition: pullDistance === 0 ? 'all 0.2s' : 'none',
                    }}>
                        {isRefreshing ? 'Refreshing...' : pullDistance > 60 ? 'Release to refresh' : 'Pull down to refresh'}
                    </div>
                )}

                {/* Transaction List */}
                <div
                    ref={scrollContainerRef}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    role="list"
                    aria-label="Diamond transactions"
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '4px 0',
                        WebkitOverflowScrolling: 'touch',
                    }}>
                    {/* ── BUG-3: Error state with retry button ── */}
                    {error ? (
                        <div style={{
                            textAlign: 'center',
                            padding: 40,
                            color: 'rgba(255, 255, 255, 0.4)',
                        }}>
                            <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.5 }}>&#x26A0;&#xFE0F;</div>
                            <div style={{ fontSize: 13, marginBottom: 14, color: 'rgba(255, 255, 255, 0.45)' }}>
                                {error}
                            </div>
                            <button
                                onClick={() => fetchTransactions()}
                                style={{
                                    padding: '8px 20px',
                                    background: 'rgba(0, 212, 255, 0.15)',
                                    border: '1px solid rgba(0, 212, 255, 0.4)',
                                    borderRadius: 16,
                                    color: '#00d4ff',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Retry
                            </button>
                        </div>
                    ) : loading && transactions.length === 0 ? (
                        /* ── ENH-5 + POLISH-1: Dynamic skeleton rows ── */
                        <>
                            {Array.from({ length: skeletonCount.current }, (_, i) => (
                                <SkeletonRow key={i} />
                            ))}
                        </>
                    ) : groupedTx.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '30px 40px',
                            color: 'rgba(255, 255, 255, 0.3)',
                        }}>
                            {/* ENH-C: Premium diamond illustration for empty state */}
                            <img
                                src="/images/diamond-empty-state.png"
                                alt="No transactions"
                                style={{
                                    width: 80, height: 80,
                                    marginBottom: 12,
                                    opacity: 0.6,
                                    filter: 'drop-shadow(0 0 12px rgba(0, 212, 255, 0.3))',
                                }}
                            />
                            <div style={{ fontSize: 13, fontWeight: 500 }}>
                                {searchQuery
                                    ? `No results for "${searchQuery}"`
                                    : filter === 'all'
                                        ? 'No transactions yet'
                                        : `No ${FILTER_OPTIONS.find(o => o.value === filter)?.label?.toLowerCase() || ''} transactions`
                                }
                            </div>
                            {filter === 'all' && !searchQuery && (
                                <>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>
                                        Earn diamonds through daily logins, trivia, and more
                                    </div>
                                    {/* H3: Enhanced empty state CTA */}
                                    {(balance ?? 0) === 0 && (
                                        <button
                                            onClick={() => { onClose(); onBuyClick?.(); }}
                                            style={{
                                                marginTop: 16,
                                                padding: '10px 28px',
                                                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(0, 150, 255, 0.25))',
                                                border: '1px solid rgba(0, 212, 255, 0.6)',
                                                borderRadius: 20,
                                                color: '#00d4ff',
                                                fontSize: 14,
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                textShadow: '0 0 10px rgba(0,212,255,0.3)',
                                            }}
                                        >
                                            Get Your First Diamonds
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    ) : (
                        <>
                            {groupedTx.map((item, idx) => {
                                // ── ENH-1: Date group header ──
                                if (item.type === 'header') {
                                    return (
                                        <div
                                            key={`header-${idx}`}
                                            style={{
                                                padding: '10px 16px 4px',
                                                fontSize: 11,
                                                fontWeight: 700,
                                                color: 'rgba(0, 212, 255, 0.5)',
                                                textTransform: 'uppercase',
                                                letterSpacing: '1px',
                                                borderTop: idx > 0 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
                                            }}
                                        >
                                            {item.label}
                                        </div>
                                    );
                                }

                                // Transaction row
                                const tx = item.data;
                                const txType = tx.transaction_type || tx.type;
                                const config = TX_TYPES[txType] || TX_TYPES.adjustment;
                                const isPositive = tx.amount >= 0;
                                const dt = new Date(tx.created_at);

                                const isExpanded = expandedTxId === tx.id;

                                return (
                                    <div
                                        key={tx.id}
                                        role="listitem"
                                        aria-label={`${config.label}: ${isPositive ? '+' : ''}${tx.amount ?? 0} diamonds`}
                                        onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                                        style={{
                                            cursor: 'pointer',
                                            borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                                            transition: 'background 0.15s',
                                            background: isExpanded ? 'rgba(0, 212, 255, 0.03)' : 'transparent',
                                        }}
                                        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; }}
                                        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12,
                                            padding: '12px 16px',
                                        }}>
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
                                                    {isPositive ? '+' : ''}{(tx.amount ?? 0).toLocaleString()}
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

                                        {/* ENH-B: Expanded transaction details */}
                                        {isExpanded && (
                                            <div style={{
                                                padding: '0 16px 12px 64px',
                                                animation: 'walletFadeIn 0.15s ease',
                                            }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 11 }}>
                                                    <div>
                                                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>Type: </span>
                                                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>{txType}</span>
                                                    </div>
                                                    <div>
                                                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>Date: </span>
                                                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>{dt.toLocaleString()}</span>
                                                    </div>
                                                    {tx.reference_id && (
                                                        <div style={{ gridColumn: '1 / -1' }}>
                                                            <span style={{ color: 'rgba(255,255,255,0.3)' }}>Ref: </span>
                                                            <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 10 }}>{tx.reference_id}</span>
                                                        </div>
                                                    )}
                                                    {tx.description && tx.description !== config.label && (
                                                        <div style={{ gridColumn: '1 / -1' }}>
                                                            <span style={{ color: 'rgba(255,255,255,0.3)' }}>Details: </span>
                                                            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{tx.description}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {/* H1: Copy receipt button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (copyReceiptToClipboard(tx)) {
                                                            setCopiedTxId(tx.id);
                                                            setTimeout(() => setCopiedTxId(null), 2000);
                                                        }
                                                    }}
                                                    style={{
                                                        marginTop: 6,
                                                        padding: '3px 10px',
                                                        background: copiedTxId === tx.id ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)',
                                                        border: `1px solid ${copiedTxId === tx.id ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                                        borderRadius: 6,
                                                        color: copiedTxId === tx.id ? '#4ade80' : 'rgba(255,255,255,0.4)',
                                                        fontSize: 10,
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s',
                                                    }}
                                                >
                                                    {copiedTxId === tx.id ? 'Copied!' : 'Copy Receipt'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* ENH-3: Load More button */}
                            {canLoadMore && (
                                <div style={{ textAlign: 'center', padding: '12px 16px' }}>
                                    <button
                                        onClick={() => fetchTransactions(transactions.length)}
                                        disabled={loadingMore}
                                        style={{
                                            padding: '8px 24px',
                                            background: loadingMore ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 212, 255, 0.1)',
                                            border: '1px solid rgba(0, 212, 255, 0.3)',
                                            borderRadius: 16,
                                            color: '#00d4ff',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            cursor: loadingMore ? 'default' : 'pointer',
                                            transition: 'all 0.15s',
                                            opacity: loadingMore ? 0.5 : 1,
                                        }}
                                    >
                                        {loadingMore ? 'Loading...' : `Load More (${transactions.length} of ${total})`}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {!loading && total > 0 && (
                    <div style={{
                        textAlign: 'center',
                        padding: '8px 16px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        fontSize: 11,
                        color: 'rgba(255, 255, 255, 0.3)',
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 12,
                    }}>
                        <span>{total.toLocaleString()} total transactions</span>
                        {filteredTx.length !== transactions.length && (
                            <span>| {filteredTx.length} shown</span>
                        )}
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
                @keyframes walletShimmer {
                    0% { opacity: 0.4; }
                    50% { opacity: 0.8; }
                    100% { opacity: 0.4; }
                }
                @keyframes confettiFall {
                    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
                }
            `}</style>
        </>
    );
}
