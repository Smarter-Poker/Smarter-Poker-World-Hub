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
 *  C. Empty state diamond illustration (inline SVG)
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
 *
 *  ENHANCEMENTS (R8):
 *  I1. Inline SVG empty-state diamond (replaces broken PNG)
 *  I2. Persistent recent recipients (localStorage)
 *  I3. Rate-limit countdown UX for transfers
 *  I4. Date range filter (7d, 30d, 90d, All)
 *  I5. Monthly spending/earning summary with trends
 *  I6. Transaction category donut chart (SVG)
 *  I7. Quick-amount buttons for transfers (10, 25, 50, 100)
 *  I8. VIP badge on transfer recipients
 *  I9. PDF receipt export (jsPDF branded statement)
 *  I10. Lucide React icons (replaces emoji icons)
 *  I11. Swipe-to-copy receipt gesture (mobile)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getAuthUser } from '../../lib/authUtils';
import { showStoreToast } from './StoreToast';
import { eventBus, EventType, busEmit } from '../../engine/EventBus';
import {
    ShoppingCart, Unlock, Gamepad2, Joystick,
    Gift, PartyPopper, Calendar, Puzzle, Flame, Crown,
    Trophy, Zap, Medal, Swords, Target, Brain,
    PenLine, UserPlus, Heart, MessageCircle, Link2, Users,
    CheckCircle, Camera, Video, Star, MapPin, Ticket,
    Send, Download as DownloadIcon, RotateCcw, Settings,
    Search, X, BarChart3, ChevronDown, Copy, FileText,
    Clock, Filter as FilterIcon, ArrowUpRight, ArrowDownRight,
    ChevronsUpDown, Sparkles, Eye,
} from 'lucide-react';
import supabase from '../../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Transaction type config — Lucide icons, labels, colors (R8-I10)
// ─────────────────────────────────────────────────────────────────────────────
const ICON_SIZE = 16;
const TX_TYPES = {
    // Purchases & Spending
    purchase: { Icon: ShoppingCart, label: 'Purchase', color: '#ef4444' },
    feature_unlock: { Icon: Unlock, label: 'Feature Unlock', color: '#f97316' },
    game_cost: { Icon: Gamepad2, label: 'Game Entry', color: '#ef4444' },
    arcade_entry: { Icon: Joystick, label: 'Arcade Entry', color: '#ef4444' },
    // Bonuses & Rewards
    bonus: { Icon: Gift, label: 'Bonus', color: '#a855f7' },
    signup_bonus: { Icon: PartyPopper, label: 'Welcome Bonus', color: '#a855f7' },
    daily_bonus: { Icon: Calendar, label: 'Daily Bonus', color: '#3b82f6' },
    daily_login: { Icon: Calendar, label: 'Daily Login', color: '#3b82f6' },
    daily_trivia: { Icon: Puzzle, label: 'Daily Trivia', color: '#8b5cf6' },
    streak_reward: { Icon: Flame, label: 'Streak Reward', color: '#ff6600' },
    vip_reward: { Icon: Crown, label: 'VIP Reward', color: '#eab308' },
    vip_stipend: { Icon: Crown, label: 'VIP Stipend', color: '#eab308' },
    // Achievements & Challenges
    achievement: { Icon: Trophy, label: 'Achievement', color: '#f59e0b' },
    challenge: { Icon: Zap, label: 'Challenge', color: '#06b6d4' },
    // Competition
    tournament_prize: { Icon: Medal, label: 'Tournament Prize', color: '#eab308' },
    tournament_refund: { Icon: RotateCcw, label: 'Tournament Refund', color: '#94a3b8' },
    pvp_win: { Icon: Swords, label: 'PvP Win', color: '#22c55e' },
    pvp_refund: { Icon: RotateCcw, label: 'PvP Refund', color: '#94a3b8' },
    game_reward: { Icon: Target, label: 'Game Reward', color: '#22c55e' },
    trivia_reward: { Icon: Brain, label: 'Trivia Reward', color: '#8b5cf6' },
    // Social & Community
    social_post: { Icon: PenLine, label: 'Social Post', color: '#ec4899' },
    follow: { Icon: UserPlus, label: 'Follow Reward', color: '#06b6d4' },
    reaction: { Icon: Heart, label: 'Reaction Reward', color: '#f43f5e' },
    comment: { Icon: MessageCircle, label: 'Comment Reward', color: '#06b6d4' },
    share: { Icon: Link2, label: 'Share Reward', color: '#3b82f6' },
    referral: { Icon: Users, label: 'Referral Bonus', color: '#10b981' },
    // Profile & Content
    profile_complete: { Icon: CheckCircle, label: 'Profile Bonus', color: '#22c55e' },
    profile_pic: { Icon: Camera, label: 'Profile Pic Bonus', color: '#06b6d4' },
    video_watch: { Icon: Video, label: 'Video Watch', color: '#8b5cf6' },
    video_favorite: { Icon: Star, label: 'Video Favorite', color: '#eab308' },
    hendonmob_link: { Icon: Link2, label: 'HendonMob Link', color: '#10b981' },
    venue_review: { Icon: MapPin, label: 'Venue Review', color: '#f59e0b' },
    promo_code: { Icon: Ticket, label: 'Promo Code', color: '#a855f7' },
    // Gifts / Transfers
    diamond_gift_sent: { Icon: Send, label: 'Gift Sent', color: '#f97316' },
    diamond_gift_received: { Icon: Gift, label: 'Gift Received', color: '#22c55e' },
    // Other
    refund: { Icon: RotateCcw, label: 'Refund', color: '#94a3b8' },
    adjustment: { Icon: Settings, label: 'Adjustment', color: '#94a3b8' },
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

// ── R8-I4: Date range filter options ──
const DATE_RANGE_OPTIONS = [
    { value: 'all', label: 'All Time' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
];

// ── R8-I7: Quick-amount preset buttons for transfers ──
// Quick amounts removed — users must type amounts manually

// ── R8-I2: Recent recipients localStorage ──
const RECENT_RECIPIENTS_KEY = 'sp-wallet-recent-recipients';
function getPersistedRecipients() {
    try {
        const raw = localStorage.getItem(RECENT_RECIPIENTS_KEY);
        if (!raw) return [];
        return JSON.parse(raw).slice(0, 5);
    } catch (_) { return []; }
}
function persistRecipients(recipients) {
    try {
        localStorage.setItem(RECENT_RECIPIENTS_KEY, JSON.stringify(recipients.slice(0, 5)));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
}

// ── R8-I3: Rate-limit error parser ──
function parseRateLimitError(errorText) {
    if (!errorText) return null;
    // Parse "wait X seconds between transfers" and "cooldown: X seconds remaining" formats
    const secondsMatch = errorText.match(/(\d+)\s*seconds?/i);
    const minutesMatch = errorText.match(/(\d+)\s*minutes?/i);
    if (/wait/i.test(errorText) && secondsMatch) {
        return { type: 'cooldown', seconds: parseInt(secondsMatch[1]) };
    }
    if (/wait/i.test(errorText) && minutesMatch) {
        return { type: 'cooldown', seconds: parseInt(minutesMatch[1]) * 60 };
    }
    // Parse "Daily transfer limit reached" type messages (Guard 3)
    if (/daily\s*(transfer\s*)?limit\s*reached/i.test(errorText)) return { type: 'daily_limit' };
    // Parse "per day to the same friend" messages (Guard 10)
    if (/per\s*day\s*to\s*(the\s*)?same\s*friend/i.test(errorText)) return { type: 'friend_limit' };
    // Parse "daily receive limit" messages (Guard 12)
    if (/daily\s*receive\s*limit/i.test(errorText)) return { type: 'daily_limit' };
    // Parse "per-friend limit" or "per-recipient" messages (generic)
    if (/per[- ]?(friend|recipient)/i.test(errorText)) return { type: 'friend_limit' };
    return null;
}

// ── H1: Copy receipt to clipboard ──
function copyReceiptToClipboard(tx) {
    const txType = tx.transaction_type || tx.type;
    const config = TX_TYPES[txType] || TX_TYPES.adjustment;
    const dt = new Date(tx.created_at);
    const receipt = `Smarter.Poker Diamond Receipt\nRef: ${tx.id || 'N/A'}\nType: ${config.label}\nAmount: ${tx.amount >= 0 ? '+' : ''}${tx.amount} Diamonds\nBalance After: ${tx.balance_after ?? 'N/A'} Diamonds\nDate: ${dt.toLocaleString()}`;
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

// ── R8-I1: Inline SVG empty-state diamond (replaces broken PNG) ──
const EmptyStateDiamond = () => (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ opacity: 0.6, filter: 'drop-shadow(0 0 12px rgba(0, 212, 255, 0.4))' }}>
        <defs>
            <linearGradient id="diamondGrad" x1="20" y1="0" x2="60" y2="80" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#00d4ff" />
                <stop offset="50%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
            <linearGradient id="diamondHighlight" x1="30" y1="10" x2="50" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
        </defs>
        {/* Diamond shape */}
        <polygon points="40,8 68,30 40,72 12,30" fill="url(#diamondGrad)" stroke="rgba(0,212,255,0.4)" strokeWidth="1" />
        {/* Top facets */}
        <polygon points="40,8 28,30 40,30" fill="rgba(255,255,255,0.15)" />
        <polygon points="40,8 52,30 40,30" fill="rgba(255,255,255,0.08)" />
        <polygon points="40,8 12,30 28,30" fill="rgba(0,0,0,0.1)" />
        <polygon points="40,8 68,30 52,30" fill="rgba(0,0,0,0.05)" />
        {/* Bottom facets */}
        <polygon points="28,30 40,72 40,30" fill="rgba(0,0,0,0.15)" />
        <polygon points="52,30 40,72 40,30" fill="rgba(0,0,0,0.08)" />
        <polygon points="12,30 40,72 28,30" fill="rgba(0,0,0,0.25)" />
        <polygon points="68,30 40,72 52,30" fill="rgba(0,0,0,0.2)" />
        {/* Highlight shimmer */}
        <polygon points="40,8 28,30 40,30" fill="url(#diamondHighlight)" />
        {/* Sparkles */}
        <circle cx="22" cy="18" r="1.5" fill="rgba(255,255,255,0.6)">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="62" cy="22" r="1" fill="rgba(255,255,255,0.5)">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="50" cy="12" r="1.2" fill="rgba(255,255,255,0.4)">
            <animate attributeName="opacity" values="0.2;0.8;0.2" dur="2.5s" repeatCount="indefinite" />
        </circle>
    </svg>
);

// ── R8-I6: Transaction category donut chart (SVG) ──
const DonutChart = ({ data }) => {
    if (!data || data.length === 0) return null;
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return null;
    const size = 100;
    const cx = size / 2, cy = size / 2, r = 36;
    const donutWidth = 8;

    let cumAngle = -90; // Start at top
    const slices = data.map((d, i) => {
        const angle = (d.value / total) * 360;
        const startAngle = cumAngle;
        const endAngle = cumAngle + angle;
        cumAngle = endAngle;

        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;
        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);
        const largeArc = angle > 180 ? 1 : 0;

        return (
            <path
                key={i}
                d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
                fill="none"
                stroke={d.color}
                strokeWidth={donutWidth}
                strokeLinecap="round"
                opacity="0.85"
            />
        );
    });

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
                {/* Background ring */}
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={donutWidth} />
                {slices}
                {/* Center text */}
                <text x={cx} y={cy - 4} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="10" fontWeight="700" fontFamily="Orbitron, monospace">
                    {total.toLocaleString()}
                </text>
                <text x={cx} y={cy + 8} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="7">
                    total
                </text>
            </svg>
            <div style={{ flex: 1 }}>
                {data.slice(0, 5).map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.label}
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'Orbitron, monospace', fontWeight: 600 }}>
                            {d.value.toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── R8-I9: PDF receipt export ──
async function exportTransactionsPDF(filteredTx, balance, stats) {
    try {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');
        const doc = new jsPDF();

        // Header
        doc.setFillColor(8, 20, 40);
        doc.rect(0, 0, 210, 40, 'F');
        doc.setTextColor(0, 212, 255);
        doc.setFontSize(20);
        doc.text('Smarter.Poker', 14, 18);
        doc.setFontSize(12);
        doc.setTextColor(255, 255, 255);
        doc.text('Diamond Wallet Statement', 14, 28);
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 35);
        doc.text(`Current Balance: ${(balance ?? 0).toLocaleString()} Diamonds`, 120, 35);

        // Summary
        if (stats) {
            doc.setFontSize(10);
            doc.setTextColor(74, 222, 128);
            doc.text(`Total Earned: +${stats.totalEarned.toLocaleString()}`, 14, 48);
            doc.setTextColor(248, 113, 113);
            doc.text(`Total Spent: -${stats.totalSpent.toLocaleString()}`, 100, 48);
            doc.setTextColor(100, 100, 100);
            doc.text(`Net: ${(stats.totalEarned - stats.totalSpent) >= 0 ? '+' : ''}${(stats.totalEarned - stats.totalSpent).toLocaleString()}`, 14, 55);
        }

        // Transactions table
        const rows = filteredTx.map(tx => {
            const txType = tx.transaction_type || tx.type;
            const config = TX_TYPES[txType] || TX_TYPES.adjustment;
            const dt = new Date(tx.created_at);
            return [
                dt.toLocaleDateString(),
                dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                config.label,
                tx.description || config.label,
                `${tx.amount >= 0 ? '+' : ''}${tx.amount}`,
                tx.balance_after != null ? tx.balance_after.toString() : '',
            ];
        });

        autoTable(doc, {
            startY: stats ? 62 : 48,
            head: [['Date', 'Time', 'Type', 'Description', 'Amount', 'Balance']],
            body: rows,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [0, 40, 80], textColor: [0, 212, 255] },
            alternateRowStyles: { fillColor: [245, 248, 252] },
            columnStyles: {
                4: { halign: 'right', fontStyle: 'bold' },
                5: { halign: 'right' },
            },
        });

        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(`Smarter.Poker Diamond Statement — Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
        }

        doc.save(`diamond-wallet-${new Date().toISOString().slice(0, 10)}.pdf`);
        showStoreToast('success', 'PDF statement exported successfully');
        return true;
    } catch (err) {
        console.warn('PDF export failed:', err);
        showStoreToast('error', 'PDF export failed. Try CSV instead.');
        return false;
    }
}

// ── PERF-2: localStorage cache key for instant modal re-opens ──
const CACHE_KEY = 'sp-cached-wallet-txns';
const CACHE_TTL_MS = 60_000; // 60 seconds
const PAGE_SIZE = 50;
const FILTER_CACHE_KEY = 'sp-wallet-last-filter';
const DATE_RANGE_CACHE_KEY = 'sp-wallet-date-range';

function getCachedTransactions() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { transactions, balance, total, vip_expiration_date, ts } = JSON.parse(raw);
        if (Date.now() - ts > CACHE_TTL_MS) return null; // stale
        return { transactions, balance, total, vip_expiration_date };
    } catch (_) { return null; }
}

function setCachedTransactions(transactions, balance, total, vip_expiration_date) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            transactions, balance, total, vip_expiration_date, ts: Date.now()
        }));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
}

// ── PERF-4: Read cached balance from header cache ──
function getCachedBalance() {
    try {
        const raw = localStorage.getItem('sp-cached-header-user');
        if (raw) {
            const { diamonds } = JSON.parse(raw);
            return diamonds ?? 0;
        }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
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
    const [vipExpirationDate, setVipExpirationDate] = useState(null);
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
    // ── BUS-FIX: Guard against self-feedback when modal emits its own busEvent ──
    const skipNextBusRef = useRef(false);
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
    // ── R8-I2: Persistent recent recipients ──
    const [recentRecipients, setRecentRecipients] = useState(() => getPersistedRecipients());
    const [dailyLimitInfo, setDailyLimitInfo] = useState(null);   // P2-4: Daily limit display

    // ── R8-I4: Date range filter ──
    const [dateRange, setDateRange] = useState(() => {
        try { return localStorage.getItem(DATE_RANGE_CACHE_KEY) || 'all'; } catch (_) { return 'all'; }
    });

    // ── R8-I3: Transfer cooldown countdown ──
    const [cooldownSeconds, setCooldownSeconds] = useState(0);
    const cooldownTimerRef = useRef(null);

    // ── R8-I9: PDF export loading ──
    const [pdfExporting, setPdfExporting] = useState(false);

    // ── R8-I11: Swipe-to-copy gesture refs ──
    const swipeStartX = useRef(0);
    const swipeTxId = useRef(null);

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
                } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            }
            // ENH-4: Also re-fetch transaction list so new transactions appear
            // BUG-R2: Skip if fetch already in-flight (race condition guard)
            if (!fetchInFlightRef.current) {
                fetchTransactions();
            }
        };
        window.addEventListener('diamond-balance-refresh', handleBalanceRefresh);

        // ── EVENTBUS SYNC: Listen for DIAMONDS_EARNED / DIAMONDS_SPENT from global EventBus ──
        // This ensures the wallet modal refreshes when ANY part of the app
        // (Training Engine, Trivia, Store, etc.) mutates diamond balance.
        // NOTE: skipNextBusRef prevents double-deduction when the modal ITSELF emits an event.
        const handleBusEvent = (event) => {
            // ── BUS-FIX: Skip self-originated events to prevent double-deduction ──
            if (skipNextBusRef.current) {
                skipNextBusRef.current = false;
                return;
            }
            const amount = event?.payload?.amount;
            if (amount !== undefined && amount !== null) {
                // Optimistic balance update from EXTERNAL bus event
                setBalance(prev => {
                    const current = prev ?? 0;
                    return event.type === EventType.DIAMONDS_EARNED
                        ? current + amount
                        : current - amount;
                });
            } else {
                // No amount in payload — re-read from cache
                setBalance(getCachedBalance());
            }
            // Re-fetch transactions for fresh list
            if (!fetchInFlightRef.current) {
                fetchTransactions();
            }
        };
        const unsubEarned = eventBus.on(EventType.DIAMONDS_EARNED, handleBusEvent);
        const unsubSpent = eventBus.on(EventType.DIAMONDS_SPENT, handleBusEvent);

        // ── REALTIME DB SYNC: Listen for raw database inserts on diamond_transactions ──
        // This captures backend/admin grants directly from the database
        let realtimeChannel = null;
        const user = getAuthUser();
        if (user && user.id) {
            realtimeChannel = supabase.channel(`diamond-wallet-${user.id}`)
                .on('postgres_changes', { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'diamond_transactions',
                    filter: `user_id=eq.${user.id}`
                }, (payload) => {
                    // Update balance if the transaction has a balance_after
                    if (payload.new && payload.new.balance_after != null) {
                        setBalance(payload.new.balance_after);
                    }
                    // Refetch the transaction list to show the new item
                    if (!fetchInFlightRef.current) {
                        fetchTransactions();
                    }
                })
                .subscribe();
        }

        return () => {
            window.removeEventListener('diamond-balance-refresh', handleBalanceRefresh);
            unsubEarned();
            unsubSpent();
            if (realtimeChannel) {
                supabase.removeChannel(realtimeChannel);
            }
        };
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
                setVipExpirationDate(data.vip_expiration_date || null);
                fetchedRef.current = true;
                // ── PERF-2: Cache first page for instant re-opens ──
                if (offset === 0) {
                    setCachedTransactions(txns, bal, tot, data.vip_expiration_date || null);
                }
            } else {
                throw new Error(`Server error ${res.status}`);
            }
        } catch (err) {
            console.warn('Failed to load transactions:', err);
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
        try { localStorage.setItem(FILTER_CACHE_KEY, value); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
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
    const fetchFriends = useCallback(async () => {
        setFriendsLoading(true);
        try {
            const session = getSession();
            if (!session?.access_token) return;
            const res = await fetch('/api/friends?action=list', {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTransferFriends(data.data?.friends || []);
            }
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); } finally {
            // ── BUG-FIX: Always clear loading state, even on early returns ──
            setFriendsLoading(false);
        }
    }, [getSession]);

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
                const successMsg = `Sent ${amount} diamonds to ${transferRecipient.display_name || transferRecipient.username}${tierLabel}!`;
                setTransferSuccess(successMsg);
                // P2-1: StoreToast for premium notification
                showStoreToast('success', successMsg + (data.dailyRemaining != null ? ` ${data.dailyRemaining} diamonds remaining today.` : ''));
                setTransferAmount('');
                // P2-3 + R8-I2: Save and persist recent recipients
                setRecentRecipients(prev => {
                    const filtered = prev.filter(r => r.id !== transferRecipient.id);
                    const updated = [{ ...transferRecipient, lastAmount: amount, lastSent: Date.now() }, ...filtered].slice(0, 5);
                    persistRecipients(updated);
                    return updated;
                });
                // P2-4: Update daily limit info
                if (data.dailySent != null && data.dailyLimit != null) {
                    setDailyLimitInfo({ sent: data.dailySent, limit: data.dailyLimit, tier: data.tier });
                }
                setTransferRecipient(null);
                // Update balance from server's authoritative newBalance (not client arithmetic)
                const serverBalance = data.newBalance ?? ((balance ?? 0) - amount);
                setBalance(serverBalance);
                // ── BUS-FIX: Set skip flag BEFORE emitting to prevent self-feedback double-deduction ──
                skipNextBusRef.current = true;
                // ── EVENTBUS: Emit diamond-spent through global bus ──
                busEmit.diamondsSpent(amount, 'diamond-transfer');
                // Legacy fallback — include newBalance so listeners don't fall back to stale cache
                window.dispatchEvent(new CustomEvent('diamond-balance-refresh', {
                    detail: { source: 'diamond-transfer', newBalance: serverBalance }
                }));
                // #7: Recipient notification event (other components can listen)
                window.dispatchEvent(new CustomEvent('diamond-gift-sent', {
                    detail: {
                        recipientId: transferRecipient.id,
                        recipientName: data.recipientName || transferRecipient.display_name,
                        amount,
                        senderBalance: serverBalance,
                    }
                }));
                // P2-5: Sparkle animation on success
                showConfettiAnimation();
                // Refetch transactions
                if (!fetchInFlightRef.current) fetchTransactions();
                setTimeout(() => setTransferSuccess(''), 4000);
            } else {
                const errMsg = data.error || 'Transfer failed';
                // R8-I3: Parse rate-limit error and start countdown
                const rateLimit = parseRateLimitError(errMsg);
                if (rateLimit?.type === 'cooldown' && rateLimit.seconds > 0) {
                    setCooldownSeconds(rateLimit.seconds);
                    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
                    cooldownTimerRef.current = setInterval(() => {
                        setCooldownSeconds(prev => {
                            if (prev <= 1) {
                                clearInterval(cooldownTimerRef.current);
                                cooldownTimerRef.current = null;
                                return 0;
                            }
                            return prev - 1;
                        });
                    }, 1000);
                    setTransferError(`Cooldown: ${rateLimit.seconds}s remaining`);
                } else if (rateLimit?.type === 'daily_limit') {
                    setTransferError('Daily transfer limit reached. Try again tomorrow.');
                } else if (rateLimit?.type === 'friend_limit') {
                    setTransferError('Per-friend transfer limit reached. Wait 5 minutes.');
                } else {
                    setTransferError(errMsg);
                }
                showStoreToast('error', errMsg);
            }
        } catch (err) {
            setTransferError(err.message || 'Transfer failed');
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
            // R8-I3: Clear cooldown timer
            setCooldownSeconds(0);
            if (cooldownTimerRef.current) {
                clearInterval(cooldownTimerRef.current);
                cooldownTimerRef.current = null;
            }
            return;
        }

        // ── PERF-2: Show cached data immediately, then refresh in background ──
        const cached = getCachedTransactions();
        if (cached) {
            setTransactions(cached.transactions);
            setBalance(cached.balance ?? getCachedBalance());
            setTotal(cached.total);
            if (cached.vip_expiration_date) setVipExpirationDate(cached.vip_expiration_date);
            setLoading(false);
            // Still refresh in background for freshness
            fetchTransactions();
        } else {
            // ── PERF-4: At least show the cached balance while loading ──
            setBalance(getCachedBalance());
            fetchTransactions();
        }
    }, [isOpen, fetchTransactions]);

    // ── BUG-1 FIX: Client-side filter + ENH-2: search + R8-I4: date range ──
    const filteredTx = useMemo(() => {
        let result = transactions;

        // R8-I4: Apply date range filter
        if (dateRange !== 'all') {
            const now = new Date();
            const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
            const days = daysMap[dateRange] || 0;
            if (days > 0) {
                const cutoff = new Date(now);
                cutoff.setDate(cutoff.getDate() - days);
                result = result.filter(tx => new Date(tx.created_at) >= cutoff);
            }
        }

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
    }, [transactions, filter, searchQuery, dateRange]);

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
        const topSources = Object.entries(sourceMap || {})
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
                // Extract recipient name from description
                const match = (tx.description || '').match(/to (.+?)\s*\[/);
                if (match) recipientMap[match[1]] = (recipientMap[match[1]] || 0) + Math.abs(tx.amount ?? 0);
            }
            if (txType === 'diamond_gift_received') {
                giftsReceived += Math.abs(tx.amount ?? 0);
            }
        });
        const topRecipients = Object.entries(recipientMap || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);

        // R8-I5: Monthly summary with month-over-month comparison
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        let thisMonthEarned = 0, thisMonthSpent = 0, lastMonthEarned = 0, lastMonthSpent = 0;
        transactions.forEach(tx => {
            const txDate = new Date(tx.created_at);
            const amt = tx.amount ?? 0;
            if (txDate >= thisMonth) {
                if (amt >= 0) thisMonthEarned += amt;
                else thisMonthSpent += Math.abs(amt);
            } else if (txDate >= lastMonth && txDate < thisMonth) {
                if (amt >= 0) lastMonthEarned += amt;
                else lastMonthSpent += Math.abs(amt);
            }
        });
        const monthlyTrend = {
            thisMonthEarned, thisMonthSpent,
            lastMonthEarned, lastMonthSpent,
            earnedChange: lastMonthEarned > 0 ? ((thisMonthEarned - lastMonthEarned) / lastMonthEarned * 100) : 0,
            spentChange: lastMonthSpent > 0 ? ((thisMonthSpent - lastMonthSpent) / lastMonthSpent * 100) : 0,
        };

        // R8-I6: Donut chart data — category breakdown with colors
        const categoryColors = ['#00d4ff', '#4ade80', '#f59e0b', '#a855f7', '#ef4444', '#ec4899', '#3b82f6', '#06b6d4'];
        const donutData = topSources.map(([name, amount], i) => ({
            label: name,
            value: amount,
            color: categoryColors[i % categoryColors.length],
        }));

        return {
            totalEarned, totalSpent, weekEarned, weekSpent, topSources,
            giftsSent, giftsReceived, giftCount, topRecipients,
            monthlyTrend, donutData,
        };
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
                    background: 'radial-gradient(ellipse at 50% -10%, rgba(0,80,180,0.45) 0%, rgba(2,8,20,1) 55%)',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'walletFadeScale 0.3s cubic-bezier(0.16,1,0.3,1)',
                    fontFamily: "'Inter', -apple-system, sans-serif",
                    overflow: 'hidden',
                }}
            >
                {/* Close button + Export button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px 0' }}>
                    {/* R8-I9 + ENH-7: Export buttons (CSV + PDF) */}
                    <div style={{ display: 'flex', gap: 6 }}>
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
                                padding: '6px 10px',
                                cursor: filteredTx.length > 0 ? 'pointer' : 'default',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { if (filteredTx.length > 0) { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'; e.currentTarget.style.color = 'white'; } }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; e.currentTarget.style.color = filteredTx.length > 0 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)'; }}
                        >
                            <DownloadIcon size={12} /> CSV
                        </button>
                        <button
                            onClick={async () => {
                                setPdfExporting(true);
                                await exportTransactionsPDF(filteredTx, balance, stats);
                                setPdfExporting(false);
                            }}
                            disabled={filteredTx.length === 0 || pdfExporting}
                            style={{
                                background: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: 8,
                                color: filteredTx.length > 0 && !pdfExporting ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)',
                                fontSize: 11,
                                fontWeight: 600,
                                padding: '6px 10px',
                                cursor: filteredTx.length > 0 && !pdfExporting ? 'pointer' : 'default',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { if (filteredTx.length > 0 && !pdfExporting) { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'; e.currentTarget.style.color = 'white'; } }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; e.currentTarget.style.color = filteredTx.length > 0 && !pdfExporting ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)'; }}
                        >
                            <FileText size={12} /> {pdfExporting ? 'Exporting...' : 'PDF'}
                        </button>
                    </div>
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
                        <X size={16} />
                    </button>
                </div>

                {/* ═══════════════════════════════════════════════
                     PREMIUM HEADER — Exact Reference Match
                ═══════════════════════════════════════════════ */}
                <div style={{
                    position: 'relative',
                    padding: '0 16px 20px',
                    background: 'linear-gradient(180deg, rgba(15,25,45,1) 0%, rgba(5,10,25,1) 100%)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}>
                    {/* The Outer Metallic Tube Frame */}
                    <div style={{
                        position: 'relative',
                        marginTop: 45,
                        width: '100%',
                        border: '3px solid #6b8ebc',
                        borderRadius: 16,
                        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8), 0 0 25px rgba(0,160,255,0.2), inset 0 0 0 1px rgba(255,255,255,0.2)',
                        padding: '40px 14px 20px',
                        background: 'radial-gradient(ellipse at 50% 0%, rgba(20,40,75,0.4) 0%, rgba(5,15,35,0.6) 100%)',
                    }}>
                        
                        {/* Crown Badge — Overlapping Top Border */}
                        <div style={{
                            position: 'absolute',
                            top: -45, left: '50%', transform: 'translateX(-50%)',
                            width: 90, height: 90,
                            borderRadius: '50%',
                            border: '4px solid #6b8ebc',
                            background: 'radial-gradient(circle at 30% 30%, #2a3a5a, #0a1222)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 0 30px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,0,0,0.9), inset 0 0 0 2px rgba(255,255,255,0.15)',
                            zIndex: 2,
                        }}>
                            <img src="/images/wallet-crown.png" alt="Crown" style={{ width: 80, height: 80, objectFit: 'contain', filter: 'drop-shadow(0 0 12px rgba(0,160,255,0.6))', animation: 'walletDiamondFloat 4s ease-in-out infinite', mixBlendMode: 'screen' }} />
                        </div>

                        {/* Welcome Text */}
                        <div style={{ textAlign: 'center', marginBottom: 20 }}>
                            <div style={{
                                fontFamily: "'Orbitron', sans-serif",
                                fontSize: 32, fontWeight: 900,
                                background: 'linear-gradient(180deg, #ffffff 0%, #a0c8ff 40%, #5088d8 100%)',
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                letterSpacing: '1px', lineHeight: 1.2,
                                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8)) drop-shadow(0 0 10px rgba(80,160,255,0.4))',
                            }}>
                                Diamond Wallet
                            </div>
                        </div>

                        {/* Two Cards Row */}
                        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                            
                            {/* DIAMOND CARD */}
                            <div style={{
                                flex: 1,
                                background: 'linear-gradient(180deg, #101c30 0%, #050a15 100%)',
                                border: '3px solid #6b8ebc',
                                borderRadius: 12,
                                padding: '16px 8px 12px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                boxShadow: 'inset 0 0 30px rgba(0,0,0,0.9), 0 10px 20px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1)',
                                position: 'relative',
                            }}>
                                {/* Corner chamfer illusion accents */}
                                <div style={{ position: 'absolute', top: -3, left: -3, width: 12, height: 12, borderTop: '3px solid #8baee0', borderLeft: '3px solid #8baee0', borderRadius: '12px 0 0 0' }}/>
                                <div style={{ position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderTop: '3px solid #8baee0', borderRight: '3px solid #8baee0', borderRadius: '0 12px 0 0' }}/>
                                <div style={{ position: 'absolute', bottom: -3, left: -3, width: 12, height: 12, borderBottom: '3px solid #8baee0', borderLeft: '3px solid #8baee0', borderRadius: '0 0 0 12px' }}/>
                                <div style={{ position: 'absolute', bottom: -3, right: -3, width: 12, height: 12, borderBottom: '3px solid #8baee0', borderRight: '3px solid #8baee0', borderRadius: '0 0 12px 0' }}/>

                                <img
                                    src="/images/wallet-diamond.png"
                                    alt="Diamond"
                                    style={{
                                        width: 110, height: 110, objectFit: 'contain',
                                        filter: 'drop-shadow(0 0 25px rgba(0,180,255,0.8)) brightness(1.2)',
                                        marginBottom: 4, marginTop: -4,
                                        animation: 'walletDiamondFloat 3s ease-in-out infinite',
                                        mixBlendMode: 'screen',
                                    }}
                                />
                                <div style={{
                                    fontFamily: 'Orbitron, monospace', fontSize: 26, fontWeight: 900,
                                    background: 'linear-gradient(180deg, #ffffff 0%, #80c0ff 100%)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8)) drop-shadow(0 0 12px rgba(0,180,255,0.6))',
                                    lineHeight: 1, marginBottom: 4, letterSpacing: '1px'
                                }}>
                                    {(animatedBalance ?? 0).toLocaleString()}
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 900, color: '#80c0ff', marginBottom: 4, letterSpacing: '1px', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>Diamonds</div>
                                <div style={{ fontSize: 11, color: '#ffffff', opacity: 0.8, letterSpacing: '0.5px' }}>In Your Account</div>
                            </div>

                            {/* VIP CARD */}
                            <div style={{
                                flex: 1,
                                background: 'linear-gradient(180deg, #121212 0%, #050505 100%)',
                                border: '3px solid #6b8ebc',
                                borderRadius: 12,
                                padding: '16px 8px 12px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                boxShadow: 'inset 0 0 30px rgba(0,0,0,0.9), 0 10px 20px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1)',
                                position: 'relative',
                            }}>
                                {/* Corner chamfer illusion accents */}
                                <div style={{ position: 'absolute', top: -3, left: -3, width: 12, height: 12, borderTop: '3px solid #8baee0', borderLeft: '3px solid #8baee0', borderRadius: '12px 0 0 0' }}/>
                                <div style={{ position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderTop: '3px solid #8baee0', borderRight: '3px solid #8baee0', borderRadius: '0 12px 0 0' }}/>
                                <div style={{ position: 'absolute', bottom: -3, left: -3, width: 12, height: 12, borderBottom: '3px solid #8baee0', borderLeft: '3px solid #8baee0', borderRadius: '0 0 0 12px' }}/>
                                <div style={{ position: 'absolute', bottom: -3, right: -3, width: 12, height: 12, borderBottom: '3px solid #8baee0', borderRight: '3px solid #8baee0', borderRadius: '0 0 12px 0' }}/>

                                <img
                                    src="/images/wallet-vip-crown.png"
                                    alt="VIP Crown"
                                    style={{
                                        width: 70, height: 70, objectFit: 'contain',
                                        filter: 'drop-shadow(0 0 15px rgba(0,160,255,0.6)) brightness(1.1)',
                                        marginBottom: 0,
                                        animation: 'walletDiamondFloat 3.5s ease-in-out infinite 0.5s',
                                        mixBlendMode: 'screen'
                                    }}
                                />
                                <div style={{
                                    fontFamily: 'Orbitron, monospace', fontSize: 32, fontWeight: 900,
                                    background: 'linear-gradient(180deg, #ffffff 0%, #90b8f0 50%, #5070c0 100%)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                    letterSpacing: '2px', lineHeight: 1, marginBottom: 8,
                                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8)) drop-shadow(0 0 10px rgba(80,160,255,0.4))',
                                }}>VIP</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', textAlign: 'center', lineHeight: 1.4, marginBottom: 6, letterSpacing: '0.2px', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                                    {(() => {
                                        let daysLeftText = '--';
                                        let isVipActive = false;
                                        if (vipExpirationDate) {
                                            const diff = new Date(vipExpirationDate).getTime() - new Date().getTime();
                                            if (diff > 0) {
                                                daysLeftText = Math.ceil(diff / (1000 * 60 * 60 * 24));
                                                isVipActive = true;
                                            } else {
                                                daysLeftText = '0';
                                            }
                                        }
                                        return (
                                            <>
                                                {isVipActive ? 'VIP Member' : '30-Day VIP Card'}<br/>
                                                <span style={{ color: '#a0c0e0', fontSize: 12, letterSpacing: '0.5px' }}>
                                                    {isVipActive ? `Expires: ${daysLeftText} Days` : 'Inactive'}
                                                </span>
                                            </>
                                        );
                                    })()}
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {[...Array(5)].map((_, i) => (
                                        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="url(#starGrad)" style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.8))' }}>
                                            <defs>
                                                <linearGradient id="starGrad" x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
                                                    <stop offset="0%" stopColor="#ffffff" />
                                                    <stop offset="100%" stopColor="#8090b0" />
                                                </linearGradient>
                                            </defs>
                                            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                                        </svg>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Let's Go Styled Action Buttons */}
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button
                                onClick={() => { onClose(); onBuyClick?.(); }}
                                style={{
                                    flex: 1,
                                    padding: '12px 10px',
                                    background: 'linear-gradient(180deg, #1a3055 0%, #0a1835 100%)',
                                    border: '2px solid #6b8ebc',
                                    borderRadius: 8,
                                    position: 'relative',
                                    boxShadow: 'inset 0 0 15px rgba(0,0,0,0.8), 0 5px 15px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.1)',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                }}
                                onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.2)'}
                                onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px #00d4ff)' }}>
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="#fff" />
                                </svg>
                                <span style={{
                                    fontFamily: 'Orbitron, sans-serif', fontSize: 16, fontWeight: 900,
                                    color: '#ffffff', letterSpacing: '1px',
                                    textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 10px #00d4ff',
                                }}>Buy Now</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px #00d4ff)' }}>
                                    <polyline points="13 17 18 12 13 7"></polyline>
                                    <polyline points="6 17 11 12 6 7"></polyline>
                                </svg>
                            </button>
                            
                            <button
                                onClick={() => { setShowTransfer(v => !v); if (!showTransfer) fetchFriends(); }}
                                style={{
                                    flex: 1,
                                    padding: '12px 10px',
                                    background: 'linear-gradient(180deg, #1a3055 0%, #0a1835 100%)',
                                    border: '2px solid #6b8ebc',
                                    borderRadius: 8,
                                    position: 'relative',
                                    boxShadow: 'inset 0 0 15px rgba(0,0,0,0.8), 0 5px 15px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.1)',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                }}
                                onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.2)'}
                                onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px #00d4ff)' }}>
                                    <line x1="22" y1="2" x2="11" y2="13"></line>
                                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                </svg>
                                <span style={{
                                    fontFamily: 'Orbitron, sans-serif', fontSize: 16, fontWeight: 900,
                                    color: '#ffffff', letterSpacing: '1px',
                                    textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 10px #00d4ff',
                                }}>Send</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px #00d4ff)' }}>
                                    <polyline points="13 17 18 12 13 7"></polyline>
                                    <polyline points="6 17 11 12 6 7"></polyline>
                                </svg>
                            </button>
                        </div>
                        
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
                        <Search size={14} style={{ color: 'rgba(255, 255, 255, 0.3)', flexShrink: 0 }} />
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
                                <X size={10} />
                            </button>
                        )}
                    </div>
                </div>

                {/* R8-I4: Date Range Dropdown + Filter Bar + Stats Toggle */}
                <div style={{
                    display: 'flex',
                    gap: 6,
                    padding: '8px 16px',
                    overflowX: 'auto',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    alignItems: 'center',
                }}>
                    {/* Date Range Selector */}
                    <select
                        value={dateRange}
                        onChange={e => {
                            const v = e.target.value;
                            setDateRange(v);
                            try { localStorage.setItem(DATE_RANGE_CACHE_KEY, v); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                        }}
                        style={{
                            background: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: 8,
                            color: dateRange !== 'all' ? '#00d4ff' : 'rgba(255, 255, 255, 0.5)',
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '5px 8px',
                            cursor: 'pointer',
                            flexShrink: 0,
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            backgroundImage: 'none',
                            paddingRight: 22,
                            backgroundPosition: 'right 6px center',
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: '10px',
                        }}
                    >
                        {DATE_RANGE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value} style={{ background: '#0a1628', color: '#fff' }}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
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

                {/* H7: Diamond Transfer Panel — Type-to-search UX */}
                {showTransfer && (
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(249, 115, 22, 0.15)',
                        background: 'rgba(249, 115, 22, 0.04)',
                        animation: 'walletFadeIn 0.2s ease',
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Send Diamonds To A Friend
                        </div>
                        {/* Anti-abuse info */}
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10, lineHeight: 1.4 }}>
                            Standard: 10-100 per transfer | 500/day | 200/day per friend | 60s cooldown<br/>
                            VIP Friends (60+ days): 10-500 per transfer | 2,000/day<br/>
                            5min cooldown between transfers to same friend | 1,000/day receive cap
                        </div>
                        {/* P2-4: Daily limit progress bar */}
                        {dailyLimitInfo && (
                            <div style={{ marginBottom: 10 }}>
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
                        {/* Friend search + Amount — side by side on larger screens, stacked on mobile */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {/* Friend type-to-search input with autocomplete dropdown */}
                            <div style={{ position: 'relative' }}>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                    Recipient
                                </div>
                                {transferRecipient ? (
                                    /* Selected friend display */
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '8px 12px',
                                        background: 'rgba(249, 115, 22, 0.12)',
                                        border: '1px solid rgba(249, 115, 22, 0.4)',
                                        borderRadius: 10,
                                    }}>
                                        {transferRecipient.avatar_url && (
                                            <img src={transferRecipient.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                                        )}
                                        <span style={{ color: '#f97316', fontSize: 13, fontWeight: 600, flex: 1 }}>
                                            {transferRecipient.display_name || transferRecipient.username}
                                        </span>
                                        {transferRecipient.is_vip && (
                                            <Crown size={12} color="#eab308" />
                                        )}
                                        <button
                                            onClick={() => { setTransferRecipient(null); setFriendSearch(''); setTransferAmount(''); setConfirmTransfer(null); }}
                                            style={{
                                                background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
                                                width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: 'rgba(255,255,255,0.5)', cursor: 'pointer', flexShrink: 0,
                                            }}
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                ) : (
                                    /* Search input */
                                    <>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 10, padding: '8px 12px',
                                        }}>
                                            <Search size={14} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                                            <input
                                                type="text"
                                                value={friendSearch}
                                                onChange={e => setFriendSearch(e.target.value)}
                                                placeholder="Type a friend's name..."
                                                autoFocus
                                                style={{
                                                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                                                    color: '#e2e8f0', fontSize: 13, fontFamily: "'Inter', sans-serif",
                                                }}
                                            />
                                            {friendSearch && (
                                                <button
                                                    onClick={() => setFriendSearch('')}
                                                    style={{
                                                        background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
                                                        width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: 'rgba(255,255,255,0.5)', cursor: 'pointer', flexShrink: 0, fontSize: 10,
                                                    }}
                                                >
                                                    <X size={10} />
                                                </button>
                                            )}
                                        </div>
                                        {/* Autocomplete dropdown — shows after 3 chars typed */}
                                        {friendSearch.trim().length >= 3 && (
                                            <div style={{
                                                position: 'absolute', left: 0, right: 0, top: '100%',
                                                zIndex: 10, marginTop: 4,
                                                background: 'rgba(10, 22, 40, 0.98)',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                borderRadius: 10,
                                                maxHeight: 180, overflowY: 'auto',
                                                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                            }}>
                                                {friendsLoading ? (
                                                    <div style={{ padding: '12px 14px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Loading friends...</div>
                                                ) : (() => {
                                                    const q = friendSearch.trim().toLowerCase();
                                                    const matches = transferFriends.filter(f =>
                                                        (f.display_name || '').toLowerCase().includes(q) ||
                                                        (f.username || '').toLowerCase().includes(q)
                                                    );
                                                    if (matches.length === 0) {
                                                        return <div style={{ padding: '12px 14px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>No matching friends found</div>;
                                                    }
                                                    return matches.slice(0, 10).map(f => (
                                                        <button
                                                            key={f.id}
                                                            onClick={() => { setTransferRecipient(f); setFriendSearch(''); }}
                                                            style={{
                                                                width: '100%', padding: '10px 14px',
                                                                background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                                color: '#e2e8f0', fontSize: 12, fontWeight: 500,
                                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                                                                textAlign: 'left', transition: 'background 0.1s',
                                                            }}
                                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249, 115, 22, 0.1)'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                        >
                                                            {f.avatar_url ? (
                                                                <img src={f.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                                            ) : (
                                                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(249,115,22,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#f97316', fontWeight: 700, flexShrink: 0 }}>
                                                                    {(f.display_name || f.username || '?')[0].toUpperCase()}
                                                                </div>
                                                            )}
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontWeight: 600, fontSize: 13 }}>{f.display_name || f.username}</div>
                                                                {f.display_name && f.username && (
                                                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>@{f.username}</div>
                                                                )}
                                                            </div>
                                                            {f.is_vip && <Crown size={12} color="#eab308" />}
                                                        </button>
                                                    ));
                                                })()}
                                            </div>
                                        )}
                                        {/* Hint text when less than 3 chars */}
                                        {friendSearch.trim().length > 0 && friendSearch.trim().length < 3 && (
                                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4, paddingLeft: 4 }}>
                                                Type at least 3 characters to search...
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Amount input — only shown when recipient selected */}
                            {transferRecipient && (
                                <div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                        Amount
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <div style={{
                                            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 10, padding: '8px 12px',
                                        }}>
                                            <Sparkles size={14} color="#00d4ff" />
                                            <input
                                                type="number"
                                                min="10" max="500"
                                                value={transferAmount}
                                                onChange={e => setTransferAmount(e.target.value)}
                                                placeholder="Enter diamond amount..."
                                                autoFocus
                                                style={{
                                                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                                                    color: '#e2e8f0', fontSize: 14, fontWeight: 600,
                                                    fontFamily: "'Inter', sans-serif",
                                                }}
                                            />
                                        </div>
                                        <button
                                            onClick={handleTransfer}
                                            disabled={transferLoading || !transferAmount || cooldownSeconds > 0}
                                            style={{
                                                padding: '9px 18px',
                                                background: transferLoading ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, rgba(249, 115, 22, 0.3), rgba(234, 88, 12, 0.3))',
                                                border: '1px solid rgba(249, 115, 22, 0.5)',
                                                borderRadius: 10, color: '#f97316', fontSize: 12, fontWeight: 700,
                                                cursor: transferLoading || cooldownSeconds > 0 ? 'default' : 'pointer',
                                                opacity: transferLoading || !transferAmount || cooldownSeconds > 0 ? 0.5 : 1,
                                                transition: 'all 0.15s', whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {transferLoading ? 'Sending...' : cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s` : 'Send'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Error / Success feedback */}
                        {transferError && (
                            <div style={{ marginTop: 8, fontSize: 11, color: '#f87171', padding: '6px 10px', background: 'rgba(248,113,113,0.08)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {cooldownSeconds > 0 && <Clock size={12} color="#f87171" />}
                                {cooldownSeconds > 0 ? `Cooldown: ${cooldownSeconds}s remaining` : transferError}
                            </div>
                        )}
                        {transferSuccess && (
                            <div style={{ marginTop: 8, fontSize: 11, color: '#4ade80', padding: '6px 10px', background: 'rgba(74,222,128,0.08)', borderRadius: 6 }}>
                                {transferSuccess}
                            </div>
                        )}
                        {/* #5: Confirmation dialog */}
                        {confirmTransfer && (
                            <div style={{
                                marginTop: 10, padding: '12px 14px',
                                background: 'rgba(249, 115, 22, 0.1)',
                                border: '1px solid rgba(249, 115, 22, 0.3)',
                                borderRadius: 10,
                                animation: 'walletFadeIn 0.15s ease',
                            }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#f97316', marginBottom: 8 }}>
                                    Confirm Transfer
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 10, lineHeight: 1.4 }}>
                                    Send <strong style={{ color: '#00d4ff' }}>{confirmTransfer.amount} diamonds</strong> to{' '}
                                    <strong style={{ color: '#f97316' }}>{confirmTransfer.recipient?.display_name || confirmTransfer.recipient?.username}</strong>?
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
                                            background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.3), rgba(234, 88, 12, 0.3))',
                                            border: '1px solid rgba(249, 115, 22, 0.5)',
                                            borderRadius: 8, color: '#f97316',
                                            fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                        }}
                                    >
                                        Confirm Send {confirmTransfer.amount} Diamonds
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
                        {/* R8-I6: Donut Chart — Category Breakdown */}
                        {stats.donutData?.length > 0 && (
                            <div style={{ marginTop: 12, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category Breakdown</div>
                                <DonutChart data={stats.donutData} />
                            </div>
                        )}

                        {/* R8-I5: Monthly Trends */}
                        {stats.monthlyTrend && (
                            <div style={{ marginTop: 12, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monthly Comparison</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    <div style={{ background: 'rgba(0,212,255,0.06)', borderRadius: 8, padding: '6px 10px' }}>
                                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>This Month Earned</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', fontFamily: 'Orbitron, monospace' }}>
                                            +{stats.monthlyTrend.thisMonthEarned.toLocaleString()}
                                        </div>
                                        {stats.monthlyTrend.earnedChange !== 0 && (
                                            <div style={{
                                                fontSize: 9,
                                                color: stats.monthlyTrend.earnedChange >= 0 ? '#4ade80' : '#f87171',
                                                marginTop: 2,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 2,
                                            }}>
                                                {stats.monthlyTrend.earnedChange >= 0
                                                    ? <ArrowUpRight size={10} />
                                                    : <ArrowDownRight size={10} />}
                                                {Math.abs(stats.monthlyTrend.earnedChange).toFixed(0)}% vs last month
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ background: 'rgba(0,212,255,0.06)', borderRadius: 8, padding: '6px 10px' }}>
                                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>This Month Spent</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171', fontFamily: 'Orbitron, monospace' }}>
                                            -{stats.monthlyTrend.thisMonthSpent.toLocaleString()}
                                        </div>
                                        {stats.monthlyTrend.spentChange !== 0 && (
                                            <div style={{
                                                fontSize: 9,
                                                color: stats.monthlyTrend.spentChange <= 0 ? '#4ade80' : '#f87171',
                                                marginTop: 2,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 2,
                                            }}>
                                                {stats.monthlyTrend.spentChange >= 0
                                                    ? <ArrowUpRight size={10} />
                                                    : <ArrowDownRight size={10} />}
                                                {Math.abs(stats.monthlyTrend.spentChange).toFixed(0)}% vs last month
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {/* P2-2: Gift Analytics (shown when stats are open and gifts exist) */}
                {showStats && stats && (stats.giftsSent > 0 || stats.giftsReceived > 0) && (
                    <div style={{
                        padding: '8px 16px 12px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        background: 'rgba(249, 115, 22, 0.03)',
                        animation: 'walletFadeIn 0.2s ease',
                    }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gift Activity</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <div style={{ background: 'rgba(249,115,22,0.08)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Sent</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#f97316', fontFamily: 'Orbitron, monospace' }}>{stats.giftsSent.toLocaleString()}</div>
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
                            {/* R8-I1: Inline SVG diamond (replaces broken PNG) */}
                            <EmptyStateDiamond />
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
                                        /* R8-I11: Swipe-to-copy gesture (mobile) */
                                        onTouchStart={e => {
                                            swipeStartX.current = e.touches[0].clientX;
                                            swipeTxId.current = tx.id;
                                        }}
                                        onTouchEnd={e => {
                                            if (swipeTxId.current === tx.id) {
                                                const deltaX = (e.changedTouches[0]?.clientX ?? 0) - swipeStartX.current;
                                                if (deltaX > 60) {
                                                    // Swipe right: copy receipt
                                                    const ok = copyReceiptToClipboard(tx);
                                                    if (ok) {
                                                        setCopiedTxId(tx.id);
                                                        showStoreToast('success', 'Receipt copied');
                                                        setTimeout(() => setCopiedTxId(null), 2000);
                                                    }
                                                }
                                            }
                                            swipeStartX.current = 0;
                                            swipeTxId.current = null;
                                        }}
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
                                            {/* Icon — R8-I10: Lucide React */}
                                            <div style={{
                                                width: 36, height: 36,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderRadius: 10,
                                                background: `${config.color}15`,
                                                flexShrink: 0,
                                            }}>
                                                {config.Icon ? <config.Icon size={ICON_SIZE} color={config.color} /> : <Sparkles size={ICON_SIZE} color={config.color} />}
                                            </div>

                                            {/* Details */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: 16,
                                                    fontWeight: 600,
                                                    color: '#e2e8f0',
                                                    marginBottom: 4,
                                                }}>
                                                    {config.label}
                                                </div>
                                                <div style={{
                                                    fontSize: 13,
                                                    color: 'rgba(255, 255, 255, 0.45)',
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
                                                    fontSize: 18,
                                                    fontWeight: 700,
                                                    color: isPositive ? '#4ade80' : '#f87171',
                                                }}>
                                                    {isPositive ? '+' : ''}{(tx.amount ?? 0).toLocaleString()}
                                                </span>
                                                {tx.balance_after != null && (
                                                    <span style={{
                                                        fontSize: 12,
                                                        color: 'rgba(255, 255, 255, 0.35)',
                                                    }}>
                                                        Bal: {tx.balance_after.toLocaleString()}
                                                    </span>
                                                )}
                                                <span style={{
                                                    fontSize: 12,
                                                    color: 'rgba(255, 255, 255, 0.3)',
                                                    marginTop: 4,
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
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');
                @keyframes walletFadeScale {
                    from { opacity: 0; transform: scale(0.97) translateY(6px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
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
                @keyframes walletPulse {
                    0%, 100% { opacity: 0.35; transform: scale(1); box-shadow: 0 0 8px 3px rgba(0,212,255,0.5); }
                    50% { opacity: 1; transform: scale(1.6); box-shadow: 0 0 18px 6px rgba(0,212,255,0.9); }
                }
                @keyframes walletBorderSweep {
                    0% { background-position: -100% 0; }
                    100% { background-position: 200% 0; }
                    from { transform: translateX(-100%); }
                    to { transform: translateX(100%); }
                }
                @keyframes walletFloat {
                    0%, 100% { transform: translateY(0px) rotate(-5deg); }
                    50% { transform: translateY(-8px) rotate(5deg); }
                }
                @keyframes walletDiamondFloat {
                    0%, 100% { transform: translateY(0px); filter: drop-shadow(0 0 20px rgba(0,140,255,1)) drop-shadow(0 0 40px rgba(0,80,255,0.6)) brightness(1.15); }
                    50% { transform: translateY(-5px); filter: drop-shadow(0 0 28px rgba(0,180,255,1)) drop-shadow(0 0 55px rgba(0,120,255,0.8)) brightness(1.25); }
                }
                @keyframes walletCrownGlow {
                    0%, 100% { box-shadow: 0 0 25px rgba(0,140,255,0.45), 0 0 50px rgba(0,80,200,0.2), inset 0 1px 0 rgba(255,255,255,0.12); }
                    50% { box-shadow: 0 0 40px rgba(0,180,255,0.7), 0 0 80px rgba(0,120,255,0.35), inset 0 1px 0 rgba(255,255,255,0.18); }
                }
            `}</style>
        </>
    );
}
