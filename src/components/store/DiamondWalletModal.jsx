/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DIAMOND WALLET MODAL: Transaction History Popup
 *  Opens when user clicks the diamond balance in the header
 *
 *  ENHANCEMENTS (R3):
 *  1. Date grouping (Today, Yesterday, This Week, Earlier)
 *  2. Transaction search bar
 *  3. "Load More" pagination (beyond 50 limit)
 *  4. Auto-refresh transaction list while modal is open
 *  5. Dynamic skeleton count based on viewport
 *  6. Running balance sparkline chart
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
 *  I7. Quick-amount buttons: REMOVED (manual amount entry only)
 *  I8. VIP badge on transfer recipients
 *  I10. Lucide React icons (replaces emoji icons)
 *  I11. Swipe-to-copy receipt gesture (mobile)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getAuthUser } from '../../lib/authUtils';
import { showStoreToast } from './StoreToast';
import { eventBus, EventType, busEmit } from '../../engine/EventBus';
import {
  ShoppingCart,
  Unlock,
  Gamepad2,
  Joystick,
  Gift,
  PartyPopper,
  Calendar,
  Puzzle,
  Flame,
  Crown,
  Trophy,
  Zap,
  Medal,
  Swords,
  Target,
  Brain,
  PenLine,
  UserPlus,
  Heart,
  MessageCircle,
  Link2,
  Users,
  CheckCircle,
  Camera,
  Video,
  Star,
  MapPin,
  Ticket,
  Send,
  RotateCcw,
  Settings,
  Search,
  X,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';
import supabase from '../../lib/supabase';
import CapHitPopup from '../diamonds/CapHitPopup';
// One definition of what each wallet tab means, shared with the API that counts
// and queries them. See the file header for why it is not a list of type names.
import { matchesFilter } from '../../lib/diamonds/ledgerFilters';
import { boundedCommerceFetch } from '../../lib/store/boundedCommerceFetch';
import {
  clearCommerceRequestId,
  getOrCreateCommerceRequestId,
} from '../../lib/store/checkoutIntentStore';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import {
  formatWalletDescriptionParts,
  titleCaseWalletText as toTitleCase,
} from '../../lib/store/walletDescription.mjs';
// #SMARTERCASINOREALISM. Same tokens as the Club Arena vault; see the header.
import styles from './DiamondWalletModal.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Transaction type config: Lucide icons, labels, colors (R8-I10)
// ─────────────────────────────────────────────────────────────────────────────
const ICON_SIZE = 16;
const MARKETPLACE_ANALYTICS_COLORS = [
  '#00d4ff',
  '#58d9ff',
  '#3b82f6',
  '#8aa8b8',
  '#f59e0b',
  '#ef4444',
  '#c4d3da',
  '#06b6d4',
];
const TX_TYPES = {
  // Purchases & Spending
  purchase: { Icon: ShoppingCart, label: 'Purchase', color: '#ef4444' },
  feature_unlock: { Icon: Unlock, label: 'Feature Unlock', color: '#ffffff' },
  game_cost: { Icon: Gamepad2, label: 'Game Entry', color: '#ef4444' },
  arcade_entry: { Icon: Joystick, label: 'Arcade Entry', color: '#ef4444' },
  // Bonuses & Rewards
  bonus: { Icon: Gift, label: 'Bonus', color: '#8aa8b8' },
  signup_bonus: { Icon: PartyPopper, label: 'Welcome Bonus', color: '#8aa8b8' },
  daily_bonus: { Icon: Calendar, label: 'Daily Bonus', color: '#3b82f6' },
  daily_login: { Icon: Calendar, label: 'Daily Login', color: '#3b82f6' },
  daily_trivia: { Icon: Puzzle, label: 'Daily Trivia', color: '#7395a8' },
  streak_reward: { Icon: Flame, label: 'Streak Reward', color: '#ffffff' },
  vip_reward: { Icon: Crown, label: 'VIP Reward', color: '#eab308' },
  vip_stipend: { Icon: Crown, label: 'VIP Stipend', color: '#eab308' },
  // Achievements & Challenges
  achievement: { Icon: Trophy, label: 'Achievement', color: '#f59e0b' },
  challenge: { Icon: Zap, label: 'Challenge', color: '#06b6d4' },
  // Competition
  tournament_prize: { Icon: Medal, label: 'Tournament Prize', color: '#eab308' },
  tournament_refund: { Icon: RotateCcw, label: 'Tournament Refund', color: '#94a3b8' },
  pvp_win: { Icon: Swords, label: 'PvP Win', color: '#00a8e8' },
  pvp_refund: { Icon: RotateCcw, label: 'PvP Refund', color: '#94a3b8' },
  game_reward: { Icon: Target, label: 'Game Reward', color: '#00a8e8' },
  trivia_reward: { Icon: Brain, label: 'Trivia Reward', color: '#7395a8' },
  // Social & Community
  social_post: { Icon: PenLine, label: 'Social Post', color: '#c4d3da' },
  follow: { Icon: UserPlus, label: 'Follow Reward', color: '#06b6d4' },
  reaction: { Icon: Heart, label: 'Reaction Reward', color: '#f43f5e' },
  comment: { Icon: MessageCircle, label: 'Comment Reward', color: '#06b6d4' },
  share: { Icon: Link2, label: 'Share Reward', color: '#3b82f6' },
  referral: { Icon: Users, label: 'Referral Bonus', color: '#189fd0' },
  // Profile & Content
  profile_complete: { Icon: CheckCircle, label: 'Profile Bonus', color: '#00a8e8' },
  profile_pic: { Icon: Camera, label: 'Profile Pic Bonus', color: '#06b6d4' },
  video_watch: { Icon: Video, label: 'Video Watch', color: '#7395a8' },
  video_favorite: { Icon: Star, label: 'Video Favorite', color: '#eab308' },
  hendonmob_link: { Icon: Link2, label: 'HendonMob Link', color: '#189fd0' },
  venue_review: { Icon: MapPin, label: 'Venue Review', color: '#f59e0b' },
  promo_code: { Icon: Ticket, label: 'Promo Code', color: '#8aa8b8' },
  // Gifts / Transfers
  diamond_gift_sent: { Icon: Send, label: 'Gift Sent', color: '#ffffff' },
  diamond_gift_received: { Icon: Gift, label: 'Gift Received', color: '#00a8e8' },
  // Written by pages/api/store/diamond-transfer.js when a transfer is rolled back
  diamond_gift_refund: { Icon: RotateCcw, label: 'Gift Refunded', color: '#00a8e8' },
  // Written by pages/api/store/diamond-transfer.js on the recipient's ledger
  diamond_received: { Icon: Gift, label: 'Diamonds Received', color: '#00a8e8' },
  // Written by pages/api/store/purchase-daily-vip.js
  vip_daily: { Icon: Crown, label: 'Daily VIP Pass', color: '#eab308' },
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

/*
 * EARNED_TYPES, SPENT_TYPES_EXCLUDE and GIFT_TX_TYPES lived here until
 * 2026-09-05 and are now in src/lib/diamonds/ledgerFilters.js, shared with the
 * API so the count, the query and the rendered list are one opinion.
 *
 * EARNED_TYPES was a hand-written allowlist of thirty type names, and it had
 * fallen behind by ten live kinds: `reconciliation` (420 rows, 679,549
 * diamonds), `pvp_refund` (488 rows), `adjustment` (45,645 diamonds),
 * `live_gift_received`, `easter_egg`, `training_reward` and others - 941 credit
 * rows worth 740,908 diamonds a player had been paid and could not find under
 * Earned. It is replaced by the sign of the amount, which is a fact about the
 * row rather than a fact about our list, so it cannot go stale. Club Arena
 * settled this identically on 2026-08-25; the shared module records both.
 *
 * If you are about to add a type name to a list to make a tab show a row:
 * that is the bug, not the fix.
 */

// ── R8-I4: Date range filter options ──
const DATE_RANGE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
];

// ── R8-I7: Quick-amount preset buttons for transfers ──
// Quick amounts removed: users must type amounts manually

// ── R8-I2: Recent recipients localStorage ──
const RECENT_RECIPIENTS_KEY = 'sp-wallet-recent-recipients';
function getPersistedRecipients() {
  try {
    const raw = localStorage.getItem(RECENT_RECIPIENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw).slice(0, 5);
  } catch (_) {
    return [];
  }
}
function persistRecipients(recipients) {
  try {
    localStorage.setItem(RECENT_RECIPIENTS_KEY, JSON.stringify(recipients.slice(0, 5)));
  } catch (_) {
    console.warn('[App] Handled exception:', _?.message || _);
  }
}

// ── R8-I3: Rate-limit error parser ──
function parseRateLimitError(errorText) {
  if (!errorText) return null;
  // Parse "wait X seconds between transfers" and "X second(s) remaining/cooldown/left" formats
  const secondsMatch = errorText.match(/(\d+)\s*seconds?/i);
  const minutesMatch = errorText.match(/(\d+)\s*minutes?/i);
  const isCooldownText = /wait|cooldown|remaining|left/i.test(errorText);
  if (isCooldownText && secondsMatch) {
    return { type: 'cooldown', seconds: parseInt(secondsMatch[1]) };
  }
  if (isCooldownText && minutesMatch) {
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
const WalletDescription = ({ value }) => {
  const { copy, identity } = formatWalletDescriptionParts(value);
  return (
    <>
      {copy}
      {identity != null && (
        <>
          {' '}
          <span data-user-content="true" data-preserve-case="true">
            {identity}
          </span>
        </>
      )}
    </>
  );
};

async function copyReceiptToClipboard(tx) {
  const txType = tx.transaction_type || tx.type;
  const config = TX_TYPES[txType] || TX_TYPES.adjustment;
  const dt = new Date(tx.created_at);
  const receipt = `Smarter.Poker Diamond Receipt\nRef: ${tx.id || 'N/A'}\nType: ${config.label}\nAmount: ${tx.amount >= 0 ? '+' : ''}${tx.amount} Diamonds\nBalance After: ${tx.balance_after ?? 'N/A'} Diamonds\nDate: ${dt.toLocaleString()}`;
  try {
    // Await the async clipboard write so permission/focus failures
    // don't falsely report success
    await navigator.clipboard.writeText(receipt);
    return true;
  } catch (_) {
    return false;
  }
}

// ── H6: Confetti CSS animation helper ──
function showConfettiAnimation() {
  const container = document.createElement('div');
  container.id = 'wallet-confetti';
  container.style.cssText =
    'position:fixed;inset:0;z-index:99999;pointer-events:none;overflow:hidden;';
  const colors = ['#00d4ff', '#58d9ff', '#f59e0b', '#8aa8b8', '#f43f5e', '#FFD700'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('div');
    const c = colors[i % colors.length];
    p.style.cssText = `position:absolute;width:${6 + Math.random() * 6}px;height:${6 + Math.random() * 6}px;background:${c};border-radius:${Math.random() > 0.5 ? '50%' : '2px'};left:${Math.random() * 100}%;top:-10%;opacity:0.9;animation:confettiFall ${1.5 + Math.random() * 2}s ease-out ${Math.random() * 0.5}s forwards;`;
    container.appendChild(p);
  }
  document.body.appendChild(container);
  setTimeout(() => {
    container.remove();
  }, 4000);
}

// ── R8-I1: Inline SVG empty-state diamond (replaces broken PNG) ──
const EmptyStateDiamond = () => (
  <svg
    width="80"
    height="80"
    viewBox="0 0 80 80"
    fill="none"
    style={{ opacity: 0.6, filter: 'drop-shadow(0 0 12px rgba(0, 212, 255, 0.4))' }}
  >
    <defs>
      <linearGradient
        id="diamondGrad"
        x1="20"
        y1="0"
        x2="60"
        y2="80"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="#00d4ff" />
        <stop offset="50%" stopColor="#8aa8b8" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
      <linearGradient
        id="diamondHighlight"
        x1="30"
        y1="10"
        x2="50"
        y2="40"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
      </linearGradient>
    </defs>
    {/* Diamond shape */}
    <polygon
      points="40,8 68,30 40,72 12,30"
      fill="url(#diamondGrad)"
      stroke="rgba(0,212,255,0.4)"
      strokeWidth="1"
    />
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
  const cx = size / 2,
    cy = size / 2,
    r = 36;
  const donutWidth = 8;

  let cumAngle = -90; // Start at top
  const slices = data.map((d, i) => {
    // Clamp to just under 360 so a single 100% slice still draws
    // (an SVG arc from a point back to itself renders nothing)
    const angle = Math.min((d.value / total) * 360, 359.99);
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
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={donutWidth}
        />
        {slices}
        {/* Center text */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fill="rgba(255,255,255,0.6)"
          fontSize="10"
          fontWeight="700"
          fontFamily="Rajdhani, monospace"
        >
          {total.toLocaleString()}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="7">
          Total
        </text>
      </svg>
      <div style={{ flex: 1 }}>
        {data.slice(0, 5).map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div
              style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.5)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {marketplaceCopy(d.label)}
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.4)',
                fontFamily: 'Rajdhani, monospace',
                fontWeight: 600,
              }}
            >
              {d.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── PERF-2: localStorage cache key for instant modal re-opens ──
const CACHE_KEY = 'sp-cached-wallet-txns';
const CACHE_TTL_MS = 60_000; // 60 seconds
const PAGE_SIZE = 50;
const FILTER_CACHE_KEY = 'sp-wallet-last-filter';
const DATE_RANGE_CACHE_KEY = 'sp-wallet-date-range';

/**
 * THE CACHE IS STAMPED WITH WHOSE IT IS.
 *
 * This held a whole ledger - rows, balance, VIP tier - under a key nothing
 * cleared on sign-out (the sweep in HamburgerMenu clears six other keys, not
 * this one) and with no record of which account it belonged to. Sign out, let
 * somebody else sign in on the same device inside the 60-second TTL, open the
 * wallet: they saw the previous person's transactions and balance until the
 * fetch landed.
 *
 * `UniversalHeader.js` already had the answer for its own cache - refuse a
 * cached blob whose `userId` is not the current one - so this copies it rather
 * than inventing a second approach. Owner-stamping is the load-bearing half:
 * it holds even if a sign-out path forgets to sweep, or the tab is closed
 * before the sweep runs.
 */
function getCachedTransactions(userId) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { transactions, balance, total, vip_expiration_date, is_vip, vip_tier, ts, uid } =
      JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null; // stale
    // No owner recorded means it was written before this fix; treat it as
    // somebody else's and drop it rather than guessing it is ours.
    if (!uid || !userId || uid !== userId) return null;
    return { transactions, balance, total, vip_expiration_date, is_vip, vip_tier };
  } catch (_) {
    return null;
  }
}

function setCachedTransactions(
  userId,
  transactions,
  balance,
  total,
  vip_expiration_date,
  is_vip,
  vip_tier
) {
  try {
    // Refuse to write an unattributable ledger; an unstamped blob is exactly
    // what the next account would read.
    if (!userId) return;
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        uid: userId,
        transactions,
        balance,
        total,
        vip_expiration_date,
        is_vip,
        vip_tier,
        ts: Date.now(),
      })
    );
  } catch (_) {
    console.warn('[App] Handled exception:', _?.message || _);
  }
}

// ── PERF-4: Read cached balance from header cache ──
function getCachedBalance() {
  try {
    const raw = localStorage.getItem('sp-cached-header-user');
    if (raw) {
      const { diamonds } = JSON.parse(raw);
      return diamonds ?? 0;
    }
  } catch (_) {
    console.warn('[App] Handled exception:', _?.message || _);
  }
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

// ── ENH-6: Sparkline SVG component ──

// ── ENH-5: Dynamic skeleton row count ──
function getSkeletonCount() {
  if (typeof window === 'undefined') return 5;
  // Each skeleton row is ~60px. Available space = viewport - header(~220px) - filter(~48px)
  const available = window.innerHeight - 268;
  return Math.max(3, Math.min(10, Math.floor(available / 60)));
}

// ── Skeleton shimmer row ──
const SkeletonRow = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
    }}
  >
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: 'rgba(255, 255, 255, 0.06)',
        animation: 'walletShimmer 1.2s ease-in-out infinite',
        flexShrink: 0,
      }}
    />
    <div style={{ flex: 1 }}>
      <div
        style={{
          width: '60%',
          height: 12,
          borderRadius: 4,
          background: 'rgba(255, 255, 255, 0.06)',
          animation: 'walletShimmer 1.2s ease-in-out infinite',
          marginBottom: 6,
        }}
      />
      <div
        style={{
          width: '40%',
          height: 10,
          borderRadius: 4,
          background: 'rgba(255, 255, 255, 0.04)',
          animation: 'walletShimmer 1.2s ease-in-out infinite',
          animationDelay: '0.2s',
        }}
      />
    </div>
    <div
      style={{
        width: 48,
        height: 14,
        borderRadius: 4,
        background: 'rgba(255, 255, 255, 0.06)',
        animation: 'walletShimmer 1.2s ease-in-out infinite',
        animationDelay: '0.4s',
        flexShrink: 0,
      }}
    />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Modal Component
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ── ENH-A: Animated balance counter hook ──
 *
 * Three defects, all of the class Club Arena's own counter was audited for on
 * 2026-08-25 (`useAnimatedNumber` in PlayerWalletPage.tsx). The same fix is
 * applied here so the two wallets animate the same number the same way.
 *
 *  1. THE START POINT WENT STALE ON EVERY INTERRUPTION. `prevRef` was set to
 *     the TARGET the moment an animation began, not to what was on screen, and
 *     the cleanup cancels the frame as soon as the target moves. Two balance
 *     values landing inside 600ms - the normal case here, since a realtime
 *     `balance_after` is followed by the refetch's own `setBalance` - made the
 *     second animation start from the first one's destination, so the figure
 *     snapped instead of counting. `currentRef` now tracks what was actually
 *     drawn, written by the frame that draws it.
 *
 *  2. A NON-FINITE TARGET WAS PERMANENT. `NaN - 0` is NaN and `NaN === NaN` is
 *     false, so the guard never caught it, `Math.round(NaN)` committed NaN, and
 *     every later target computed `NaN - NaN`. The readout would have read
 *     "NaN" for the life of the modal. One undefined balance from a failed read
 *     is all it takes.
 *
 *  3. REDUCED MOTION IS A SETTING, NOT A SUGGESTION. A player who asked the OS
 *     for no motion got 600ms of rolling digits on every balance change.
 */
function useAnimatedCounter(target, duration = 600) {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [display, setDisplay] = useState(safeTarget);
  /** What the screen is showing RIGHT NOW, not what it last settled on. */
  const currentRef = useRef(safeTarget);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = currentRef.current;
    const diff = safeTarget - from;
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!Number.isFinite(diff) || diff === 0 || reduceMotion) {
      currentRef.current = safeTarget;
      setDisplay(safeTarget);
      return;
    }

    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + diff * eased);
      currentRef.current = next;
      setDisplay(next);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        currentRef.current = safeTarget;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [safeTarget, duration]);

  return display;
}

export default function DiamondWalletModal({ isOpen, onClose, onBuyClick, initialBalance }) {
  const [transactions, setTransactions] = useState([]);
  // ── PERF-4: Initialize balance from prop (header cache) or localStorage ──
  const [balance, setBalance] = useState(() => initialBalance ?? getCachedBalance());
  const [vipExpirationDate, setVipExpirationDate] = useState(null);
  const [isVipStatus, setIsVipStatus] = useState(false);
  const [vipTier, setVipTier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  // ── ENH-F: Restore last filter from localStorage ──
  const [filter, setFilter] = useState(() => {
    try {
      return localStorage.getItem(FILTER_CACHE_KEY) || 'all';
    } catch (_) {
      return 'all';
    }
  });
  const [total, setTotal] = useState(0);
  /* Every tab's size over the WHOLE ledger, from the API. `null` until the
       first response, and again if the count query fails - the badges then
       render without a number rather than with a wrong one. */
  const [serverCounts, setServerCounts] = useState(null);
  /* Lifetime earned / spent / gifts / monthly, summed over the WHOLE ledger
       by the API. Sent only with a first page, so it is not overwritten with
       `null` by a Load More. */
  const [lifetime, setLifetime] = useState(null);
  /* The tab the in-flight request belongs to. A ref, not the state value,
       because `fetchTransactions` must keep one identity: it is what the
       balance-event subscriptions and the pull-to-refresh are built from, and
       a new identity per tab change would tear those down and rebuild them. */
  const filterRef = useRef(filter);
  /* How many rows are currently rendered. A ref, so the fetch's catch block can
     ask "is there anything on screen to protect?" without taking `transactions`
     as a dependency and rebuilding every subscription built on this callback. */
  const rowCountRef = useRef(0);
  /* The "Copied!" reset. Held so it can be cancelled on unmount and so a second
     copy restarts the two seconds rather than inheriting the first one's. */
  const copyTimerRef = useRef(null);
  /* The re-run of a fetch that arrived while another was in flight. */
  const deferredFetchRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTxId, setExpandedTxId] = useState(null); // ENH-B
  const [showStats, setShowStats] = useState(false); // ENH-G
  const [pullDistance, setPullDistance] = useState(0); // ENH-E
  const [isRefreshing, setIsRefreshing] = useState(false); // ENH-E
  const fetchInFlightRef = useRef(false);
  // ── BALANCE-AUTHORITY: a balance-change event landed mid-fetch; refetch after ──
  const pendingRefetchRef = useRef(false);
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
  const [friendSearch, setFriendSearch] = useState(''); // #8: Friend search
  const [confirmTransfer, setConfirmTransfer] = useState(null); // #5: Confirmation dialog
  // ── R8-I2: Persistent recent recipients ──
  const [recentRecipients, setRecentRecipients] = useState(() => getPersistedRecipients());
  const [dailyLimitInfo, setDailyLimitInfo] = useState(null); // P2-4: Daily limit display
  const [popupData, setPopupData] = useState(null);

  // ── R8-I4: Date range filter ──
  const [dateRange, setDateRange] = useState(() => {
    try {
      return localStorage.getItem(DATE_RANGE_CACHE_KEY) || 'all';
    } catch (_) {
      return 'all';
    }
  });

  // ── R8-I3: Transfer cooldown countdown ──
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownTimerRef = useRef(null);
  // Double-submit guard: set synchronously before the transfer POST so a
  // second click can't slip through before React re-renders
  const transferInFlightRef = useRef(false);
  const successTimeoutRef = useRef(null);

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
      // ── BALANCE-AUTHORITY: the server is the only source of truth ──
      // H4: Read from event detail first (premiumFeatureGate, AvatarContext pass newBalance).
      // If the emitter did NOT include an authoritative value we deliberately
      // leave the current balance alone and let the refetch below supply it :
      // re-reading the localStorage header cache can be OLDER than the value
      // we already hold and would visibly roll the balance backwards.
      const fromEvent = e?.detail?.newBalance;
      if (fromEvent !== undefined && fromEvent !== null) {
        setBalance(fromEvent);
      }
      // H6: Confetti on first purchase
      if (e?.detail?.source === 'diamond-store-purchase') {
        try {
          if (!localStorage.getItem('sp-first-purchase-celebrated')) {
            localStorage.setItem('sp-first-purchase-celebrated', '1');
            showConfettiAnimation();
          }
        } catch (_) {
          console.warn('[App] Handled exception:', _?.message || _);
        }
      }
      // ENH-4: Also re-fetch transaction list so new transactions appear,
      // and (re)read the authoritative balance from the API.
      refreshBalanceFromServer();
    };
    window.addEventListener('diamond-balance-refresh', handleBalanceRefresh);

    // ── EVENTBUS SYNC: Listen for DIAMONDS_EARNED / DIAMONDS_SPENT from global EventBus ──
    // This ensures the wallet modal refreshes when ANY part of the app
    // (Training Engine, Trivia, Store, etc.) mutates diamond balance.
    // NOTE: skipNextBusRef prevents double-deduction when the modal ITSELF emits an event.
    const handleBusEvent = (event) => {
      // ── BUS-FIX: Skip self-originated events to prevent double-deduction ──
      // The modal only ever self-emits DIAMONDS_SPENT, so only consume the
      // flag for that type: an external DIAMONDS_EARNED arriving first
      // must not be swallowed.
      if (skipNextBusRef.current && event?.type === EventType.DIAMONDS_SPENT) {
        skipNextBusRef.current = false;
        return;
      }
      // ── BALANCE-AUTHORITY: prefer a server-computed balance from the
      //    payload; otherwise refetch. We deliberately do NOT do
      //    `prev ± payload.amount`: VIP/streak multipliers and the
      //    server-side clamping in the deduct RPC mean the delta the
      //    emitter reports is not always the delta the ledger applied,
      //    so the arithmetic drifts. We also never fall back to the
      //    localStorage header cache, which can be staler than the
      //    value currently on screen.
      const serverBalance = event?.payload?.newBalance ?? event?.payload?.balance_after;
      if (serverBalance !== undefined && serverBalance !== null) {
        setBalance(serverBalance);
      }
      // Re-fetch for the fresh list AND the authoritative balance
      refreshBalanceFromServer();
    };
    const unsubEarned = eventBus.on(EventType.DIAMONDS_EARNED, handleBusEvent);
    const unsubSpent = eventBus.on(EventType.DIAMONDS_SPENT, handleBusEvent);

    // ── REALTIME DB SYNC: Listen for raw database inserts on diamond_transactions ──
    // This captures backend/admin grants directly from the database
    let realtimeChannel = null;
    const user = getAuthUser();
    if (user && user.id) {
      realtimeChannel = supabase
        .channel(`diamond-wallet-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'diamond_transactions',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // balance_after is written by the ledger itself: authoritative
            if (payload.new && payload.new.balance_after != null) {
              setBalance(payload.new.balance_after);
            }
            // Refetch the transaction list to show the new item
            refreshBalanceFromServer();
          }
        )
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
      return {
        access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token,
      };
    } catch (_) {
      return null;
    }
  }, []);

  const fetchTransactions = useCallback(
    async (offset = 0) => {
      /*
       * A DROPPED FETCH IS NOT A DEFERRED ONE.
       *
       * This mutex used to `return` outright, and `pendingRefetchRef` was set
       * only by the balance refresher - so a fetch requested while any other
       * was running was thrown away. That mattered most for the one caller who
       * had already destroyed the old state to make room: selecting a filter
       * clears the rows, sets total to 0 and asks for page one of the new tab.
       * If a background refresh happened to be in flight - and this component
       * starts one on a bus event, a DOM event and a realtime INSERT - the tab
       * change was swallowed, the list stayed empty with `loading` false
       * (the return happened before setLoading), and the previous tab's
       * response then landed and was applied to the new tab.
       *
       * That is exactly the defect the server-side filter was built to remove.
       * A request that arrives during another one is now REMEMBERED and re-run
       * when the current one finishes.
       */
      if (fetchInFlightRef.current) {
        pendingRefetchRef.current = true;
        return;
      }
      fetchInFlightRef.current = true;
      if (offset === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      if (offset === 0) setError(null);
      try {
        const user = getAuthUser();
        if (!user) {
          if (offset === 0) setError('Please sign in to view your transactions.');
          return;
        }

        const session = getSession();
        if (!session?.access_token) {
          if (offset === 0) setError('Please sign in to view your transactions.');
          return;
        }

        /* The active tab goes to the server, so a page of "Refunds" is a
               page of refunds rather than 50 raw rows the browser then sieves
               down to whatever happened to be in them. */
        const requestedFilter = filterRef.current;
        const res = await fetch(
          `/api/store/diamond-transactions?limit=${PAGE_SIZE}&offset=${offset}&filter=${encodeURIComponent(requestedFilter)}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );

        /*
         * A RESPONSE BELONGS TO THE TAB THAT ASKED FOR IT.
         *
         * The tab can change while this request is in the air. Applying a page
         * of Earned rows under Refunds is the same lie the server-side filter
         * removed, arriving by a different route - so a response whose tab is
         * no longer selected is dropped. The `finally` below re-runs the fetch
         * for whatever tab is current, so nothing is lost by dropping it.
         */
        if (filterRef.current !== requestedFilter) {
          pendingRefetchRef.current = true;
          return;
        }

        if (res.ok) {
          const data = await res.json();
          const txns = data.transactions || [];
          const bal = data.balance ?? 0;
          const tot = data.total || 0;
          if (data.counts) setServerCounts(data.counts);
          // Only a first page carries it; never clear it on a Load More.
          if (data.lifetime) setLifetime(data.lifetime);

          if (offset === 0) {
            // Merge the fresh first page into any already-loaded pages so
            // a background refresh doesn't snap a long list back to 50 rows
            setTransactions((prev) => {
              if (prev.length <= txns.length) return txns;
              const seen = new Set(txns.map((t) => t.id));
              return [...txns, ...prev.filter((t) => !seen.has(t.id))];
            });
          } else {
            // ENH-3: Append for "Load More": dedupe by id since the offset
            // drifts when new transactions arrive between page fetches
            setTransactions((prev) => {
              const seen = new Set(prev.map((t) => t.id));
              return [...prev, ...txns.filter((t) => !seen.has(t.id))];
            });
          }
          setBalance(bal);
          setTotal(tot);
          setVipExpirationDate(data.vip_expiration_date || null);
          setIsVipStatus(data.is_vip || false);
          setVipTier(data.vip_tier || null);
          /* ── PERF-2: Cache first page for instant re-opens ──
             Only the unfiltered first page: a cached page of "Refunds" would be
             restored on the next open under whatever tab was then selected. */
          if (offset === 0 && filterRef.current === 'all') {
            setCachedTransactions(
              user.id,
              txns,
              bal,
              tot,
              data.vip_expiration_date || null,
              data.is_vip || false,
              data.vip_tier || null
            );
          }
        } else {
          throw new Error(`Server error ${res.status}`);
        }
      } catch (err) {
        console.warn('Failed to load transactions:', err);
        /*
         * A FAILED REFRESH MUST NOT ERASE WHAT IS ON SCREEN.
         *
         * This read `if (offset === 0) setError(...)`, and the render checks
         * `error` before anything else - so one dropped request on a flaky
         * connection replaced fifty rendered transactions with an error panel.
         * `fetchTransactions(0)` is also the BACKGROUND refresh path (after a
         * cache hit, and on every balance event), so the failure the player
         * saw was usually not one they had asked for.
         *
         * The error panel is for the case where there is nothing else to show.
         * With rows on screen the read simply did not refresh, which is not
         * worth destroying the ledger over.
         */
        if (offset === 0 && rowCountRef.current === 0) {
          setError('Failed to load transactions. Please try again.');
        }
      } finally {
        fetchInFlightRef.current = false;
        setLoading(false);
        setLoadingMore(false);
        // A balance-changing event arrived while this fetch was in flight :
        // run one more first-page fetch so the newest mutation isn't missed.
        if (pendingRefetchRef.current) {
          pendingRefetchRef.current = false;
          deferredFetchRef.current = setTimeout(() => {
            deferredFetchRef.current = null;
            fetchTransactions(0);
          }, 0);
        }
      }
    },
    [getSession]
  );

  // ── BALANCE-AUTHORITY: coalesced server refresh ──
  // Balance-change events tell us the balance CHANGED, not what it changed TO.
  // Instead of client-side arithmetic or a stale localStorage read, re-read the
  // authoritative balance from /api/store/diamond-transactions. If a fetch is
  // already in flight, flag a follow-up rather than silently dropping the update.
  const refreshBalanceFromServer = useCallback(() => {
    if (fetchInFlightRef.current) {
      pendingRefetchRef.current = true;
      return;
    }
    fetchTransactions(0);
  }, [fetchTransactions]);

  // ── Cleanup: clear timers if the component unmounts while the modal is open
  //    (route change) so the interval doesn't keep firing setState ──
  useEffect(
    () => () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      // The receipt-copy reset was neither stored nor cleared before.
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      /* And the deferred refetch: it fired `fetchTransactions(0)` on a zero
         timer, so navigating away in that instant sent a request for a
         component that no longer exists. */
      if (deferredFetchRef.current) clearTimeout(deferredFetchRef.current);
    },
    []
  );

  /* Mirror the rendered row count into the ref the fetch's error path reads.
     Done in one effect rather than beside all four setTransactions call sites,
     so the two cannot drift apart. It holds what the last render showed, which
     is exactly the question "is there anything on screen to protect". */
  useEffect(() => {
    rowCountRef.current = transactions.length;
  }, [transactions]);

  // ── ENH-D: Keyboard accessibility: Escape to close ──
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ── ENH-F: Persist filter selection ──
  const handleFilterChange = useCallback(
    (value) => {
      setFilter(value);
      /* Selecting a tab is now a new QUERY, not a sieve over what is loaded.
           The rows on screen belong to the old tab, so they are cleared and
           page one of the new tab is fetched - otherwise "Refunds" would show
           whichever refunds happened to be among the last tab's rows, which is
           the defect this whole change exists to remove. */
      filterRef.current = value;
      setTransactions([]);
      setTotal(0);
      fetchTransactions(0);
      try {
        localStorage.setItem(FILTER_CACHE_KEY, value);
      } catch (_) {
        console.warn('[App] Handled exception:', _?.message || _);
      }
    },
    [fetchTransactions]
  );

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
    /* A pull is honoured even if a background refresh is running. It used to
       read `&& !fetchInFlightRef.current`, so pulling during one of this
       component's several automatic refreshes did nothing at all - the banner
       just vanished with no "Refreshing..." and no result, which reads as a
       broken gesture. The fetch now defers itself rather than being dropped. */
    if (pullDistance > 60) {
      setIsRefreshing(true);
      await fetchTransactions();
      setIsRefreshing(false);
    }
    setPullDistance(0);
    touchStartY.current = 0;
  }, [pullDistance, fetchTransactions]);

  /* iOS fires `touchcancel` with NO `touchend` when the system takes the
     gesture - an incoming call, the app switcher, an edge swipe. Without this
     the pull banner stayed wedged open at the top of the list, with its
     padding, until the player happened to touch the screen again. */
  const handleTouchCancel = useCallback(() => {
    setPullDistance(0);
    touchStartY.current = 0;
  }, []);

  // ── H7: Fetch friends list when transfer panel opens ──
  const fetchFriends = useCallback(async () => {
    setFriendsLoading(true);
    try {
      const session = getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/friends?action=list', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTransferFriends(data.data?.friends || []);
      }
    } catch (_) {
      console.warn('[App] Handled exception:', _?.message || _);
    } finally {
      // ── BUG-FIX: Always clear loading state, even on early returns ──
      setFriendsLoading(false);
    }
  }, [getSession]);

  // ── H7: Send diamonds to friend ──
  const handleTransfer = useCallback(async () => {
    // Double-submit guard: the ref is set synchronously before the POST,
    // closing the window where a second click lands before React re-renders
    if (transferLoading || transferInFlightRef.current) return;
    // #5 FIX: When invoked from the Confirm button, send the exact values
    // shown in the dialog: NOT the live input, which may have been edited
    // after the dialog opened
    const recipient = confirmTransfer ? confirmTransfer.recipient : transferRecipient;
    if (!recipient || (!confirmTransfer && !transferAmount)) return;
    const amount = confirmTransfer ? confirmTransfer.amount : parseInt(transferAmount, 10);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      setTransferError('Enter A Positive Whole Diamond Amount');
      return;
    }
    if (!confirmTransfer && !Number.isInteger(Number(transferAmount))) {
      setTransferError('Transfer amount must be a whole number');
      return;
    }
    if (amount > (balance ?? 0)) {
      setTransferError('Insufficient diamond balance');
      return;
    }
    // #5: Show confirmation dialog first
    if (!confirmTransfer) {
      setConfirmTransfer({ amount, recipient });
      return;
    }
    setConfirmTransfer(null);
    transferInFlightRef.current = true;
    setTransferLoading(true);
    setTransferError('');
    setTransferSuccess('');
    try {
      const session = getSession();
      if (!session?.access_token) {
        setTransferError('Session expired. Please sign in again.');
        return;
      }
      const currentUser = getAuthUser();
      if (!currentUser?.id) {
        setTransferError('Session Expired. Please Sign In Again.');
        return;
      }
      const transferIntent = {
        scope: 'diamond-transfer',
        userId: currentUser.id,
        paymentMethod: 'diamonds',
        intent: {
          recipientId: recipient.id,
          amount,
        },
      };
      // Keep the same identity through timeouts, connection loss, and
      // uncertain responses. Only an authoritative success or refusal retires it.
      const transferRequestId = getOrCreateCommerceRequestId(transferIntent);
      const res = await boundedCommerceFetch('/api/store/diamond-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'X-Idempotency-Key': transferRequestId,
        },
        body: JSON.stringify({
          recipientId: recipient.id,
          amount,
        }),
      });
      let data;
      try {
        data = await res.json();
      } catch (_) {
        // Non-JSON error page (e.g. 502 HTML): show a clean message
        data = { error: `Server error ${res.status}. Please try again.` };
      }
      if (data.success) {
        clearCommerceRequestId(transferIntent);
        const tierLabel = data.tier === 'vip' ? ' (VIP Friend)' : '';
        const successMsg = `Sent ${amount} Diamonds To ${recipient.display_name || recipient.username}${tierLabel}!`;
        setTransferSuccess(successMsg);
        // P2-1: StoreToast for premium notification
        showStoreToast(
          'success',
          'Diamond Transfer Completed.' +
            (data.dailyRemaining != null ? ` ${data.dailyRemaining} diamonds remaining today.` : '')
        );
        setTransferAmount('');
        // P2-3 + R8-I2: Save and persist recent recipients
        setRecentRecipients((prev) => {
          const filtered = prev.filter((r) => r.id !== recipient.id);
          const updated = [
            { ...recipient, lastAmount: amount, lastSent: Date.now() },
            ...filtered,
          ].slice(0, 5);
          persistRecipients(updated);
          return updated;
        });
        // P2-4: Update daily limit info.
        // NOTE: /api/store/diamond-transfer currently returns only
        // { success, transferred, newBalance, tier, graduated, recipientName },
        // so these fields are absent and the progress bar below stays hidden
        // (by design: no empty panel is rendered). The guards are kept so the
        // panel lights up automatically if the API starts returning them.
        // `limit > 0` is required because the bar divides by it.
        const dailySent = Number(data.dailySent);
        const dailyLimit = Number(data.dailyLimit);
        if (
          data.dailySent != null &&
          data.dailyLimit != null &&
          Number.isFinite(dailySent) &&
          Number.isFinite(dailyLimit) &&
          dailyLimit > 0
        ) {
          setDailyLimitInfo({ sent: dailySent, limit: dailyLimit, tier: data.tier });
        }
        setTransferRecipient(null);
        refreshBalanceFromServer();
        window.dispatchEvent(
          new CustomEvent('diamond-balance-refresh', {
            detail: { source: 'diamond-transfer' },
          })
        );
        // #7: Recipient notification event (other components can listen)
        window.dispatchEvent(
          new CustomEvent('diamond-gift-sent', {
            detail: {
              recipientId: recipient.id,
              recipientName: data.recipientName || recipient.display_name,
              amount,
            },
          })
        );
        // P2-5: Sparkle animation on success
        showConfettiAnimation();
        if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = setTimeout(() => setTransferSuccess(''), 4000);
      } else {
        if (data.idempotencyTerminal === true) {
          clearCommerceRequestId(transferIntent);
        }
        const errMsg = data.error || 'Transfer failed';
        if (data?.gateType) {
          setPopupData(data);
          setTransferError('');
        } else {
          // R8-I3: Parse rate-limit error and start countdown
          const rateLimit = parseRateLimitError(errMsg);
          if (rateLimit?.type === 'cooldown' && rateLimit.seconds > 0) {
            setCooldownSeconds(rateLimit.seconds);
            if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = setInterval(() => {
              /* A STATE UPDATER IS NOT A PLACE FOR SIDE EFFECTS.
                 This block used to clearInterval, null a ref and call
                 setTransferError from INSIDE the updater. React StrictMode
                 double-invokes updaters in development, so all three ran twice;
                 they happen to be idempotent, so nothing broke, but the next
                 effect added there would not be. The decision is made in the
                 updater; the effects are done outside it. */
              let expired = false;
              setCooldownSeconds((prev) => {
                if (prev <= 1) {
                  expired = true;
                  return 0;
                }
                return prev - 1;
              });
              if (expired) {
                clearInterval(cooldownTimerRef.current);
                cooldownTimerRef.current = null;
                // Clear the stale "Cooldown: Xs remaining" text
                // so the error box doesn't linger after expiry
                setTransferError('');
              }
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
      }
    } catch (err) {
      setTransferError(err.message || 'Transfer failed');
    } finally {
      transferInFlightRef.current = false;
      setTransferLoading(false);
    }
  }, [
    transferRecipient,
    transferAmount,
    balance,
    getSession,
    fetchTransactions,
    confirmTransfer,
    transferLoading,
    refreshBalanceFromServer,
  ]);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when closing so next open starts fresh
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
      setPopupData(null);
      /* THREE THAT WERE LEFT BEHIND.
         `transferRecipient` and `transferAmount` survived a close, so reopening
         the Send panel found it armed with the previous recipient and a
         pre-filled amount - one tap from re-sending. `error` survived too, so a
         failed load left the error panel showing on the next open until a fetch
         replaced it. */
      setTransferRecipient(null);
      setTransferAmount('');
      setError(null);
      // R8-I3: Clear cooldown timer
      setCooldownSeconds(0);
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
      return;
    }

    /* ── PERF-2: Show cached data immediately, then refresh in background ──
       Only ever the CURRENT user's cache, and only under the unfiltered tab -
       the cached page is page one of "all", so restoring it under "Refunds"
       would show non-refunds beneath a Refunds heading. */
    const cached = filterRef.current === 'all' ? getCachedTransactions(getAuthUser()?.id) : null;
    if (cached) {
      setTransactions(cached.transactions);
      /*
       * BALANCE-AUTHORITY, and this line used to break it.
       *
       * It read `cached.balance ?? getCachedBalance()` and assigned
       * unconditionally - so reopening the wallet inside the 60s TTL after
       * spending diamonds elsewhere rolled the figure BACKWARDS to the
       * pre-spend number before the refetch corrected it. The prop sync has
       * already put the live header value in `balance` by this point, so a
       * cached number may only fill a gap, never overwrite.
       */
      setBalance((prev) =>
        prev === null || prev === undefined ? (cached.balance ?? getCachedBalance()) : prev
      );
      setTotal(cached.total);
      if (cached.vip_expiration_date) setVipExpirationDate(cached.vip_expiration_date);
      setIsVipStatus(cached.is_vip || false);
      setVipTier(cached.vip_tier || null);
      setLoading(false);
      // Still refresh in background for freshness
      fetchTransactions();
    } else {
      // ── PERF-4: At least show the cached balance while loading ──
      // BALANCE-AUTHORITY: only as a placeholder when we have nothing :
      // never let the header cache clobber a value we already got from
      // the server (or from the initialBalance prop).
      setBalance((prev) => (prev === null || prev === undefined ? getCachedBalance() : prev));
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
        result = result.filter((tx) => new Date(tx.created_at) >= cutoff);
      }
    }

    /*
     * The type filter is applied by the SERVER now (the request carries
     * `filter`), so what arrives is already the right set. This pass is
     * kept as a sieve using the SAME shared predicate, for the one case
     * where the two can differ: a cached first page rendered before the
     * refetch for a newly-selected tab has landed.
     */
    if (filter !== 'all') {
      result = result.filter((tx) => matchesFilter(tx, filter));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((tx) => {
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

  /*
   * ── H2: Filter badge counts ── THESE COME FROM THE SERVER.
   *
   * They used to be counted here, over `transactions` - the rows currently
   * LOADED. Measured on production 2026-09-05, a 416-row wallet rendered
   * All (50), Refunds (31), Earned (48 by sign, 15 by the old allowlist),
   * Spent (2), Gifts (0), Purchases (0). The ledger actually held 416, 246,
   * 390, 25, 18 and 11. Every badge was a fact about the first page wearing
   * the costume of a fact about the account - and Gifts and Purchases told a
   * player with 18 gifts and 11 purchases that they had none.
   *
   * A count of a page cannot be repaired by counting the page more carefully.
   * `/api/store/diamond-transactions` counts each tab over the whole ledger.
   * `null` means that count failed; the badge then shows no number rather
   * than a wrong one.
   */
  const filterCounts = serverCounts;

  /*
   * What the caption strip says, from THIS viewer's tier.
   *
   * The artwork's baked-in line promised "30 Days" to everybody. A Lifetime
   * VIP read that as an expiry they do not have, and a player with no VIP at
   * all read it as a benefit they had not bought. Every branch below is a
   * statement that is true for the person looking at it.
   */
  const vipCaption = useMemo(() => {
    if (vipTier === 'lifetime' || vipTier === 'founder') {
      return 'Lifetime VIP. Your Membership Never Expires.';
    }
    if (isVipStatus && vipExpirationDate) {
      const days = Math.ceil((new Date(vipExpirationDate) - new Date()) / 86400000);
      if (days > 1)
        return `Your VIP Membership Unlocks All Premium Features For ${days} More Days.`;
      if (days === 1) return 'Your VIP Membership Unlocks All Premium Features For One More Day.';
      return 'Your VIP Membership Has Expired. Renew To Restore Premium Features.';
    }
    if (isVipStatus) return 'Your VIP Membership Unlocks All Premium Features.';
    return 'VIP Unlocks All Premium Features. Tap VIP To See What Is Included.';
  }, [vipTier, isVipStatus, vipExpirationDate]);

  // ── ENH-1: Group filtered transactions by date ──
  const groupedTx = useMemo(() => {
    const groups = [];
    let currentGroup = null;

    filteredTx.forEach((tx) => {
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

  /* One definition of "close to the daily cap", read by both the remaining
     figure and the bar. They each computed it separately before, so a change to
     one threshold would have left the number warning while the bar did not. */
  const nearDailyCap = !!dailyLimitInfo && dailyLimitInfo.sent >= dailyLimitInfo.limit * 0.8;

  /*
   * ── ENH-G: Transaction analytics ── LIFETIME FIGURES COME FROM THE SERVER.
   *
   * This block used to open `if (!transactions.length) return null` and then
   * sum `transactions` - the LOADED rows - under the headline "Total Earned".
   * Its own comment said "computed from loaded transactions". On a 416-row
   * wallet displaying 50, that lifetime headline was built from 12% of the
   * ledger, and it moved every time the player pressed Load More.
   *
   * `lifetime` is summed over the whole ledger by
   * /api/store/diamond-transactions, by the sign of the amount, with the same
   * 5,000 ceiling Club Arena uses - so the two wallets cannot report
   * different lifetimes for the same ledger. `null` means it could not be
   * computed, and the panel says so rather than showing zeros.
   */
  const stats = useMemo(() => {
    if (!lifetime) return null;
    const totalEarned = lifetime.earned || 0;
    const totalSpent = lifetime.spent || 0;
    const weekEarned = lifetime.weekEarned || 0;
    const weekSpent = lifetime.weekSpent || 0;

    // Server keys the sources by raw kind; render them by their label.
    const sourceMap = {};
    for (const [kind, value] of Object.entries(lifetime.bySource || {})) {
      const label = (TX_TYPES[kind] || TX_TYPES.adjustment).label;
      sourceMap[label] = (sourceMap[label] || 0) + value;
    }

    // Top 5 sources
    const topSources = Object.entries(sourceMap || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // P2-2: Transfer analytics: whole ledger, same server pass.
    const giftsSent = lifetime.giftsSent || 0;
    const giftsReceived = lifetime.giftsReceived || 0;
    const giftCount = lifetime.giftCount || 0;
    const topRecipients = Object.entries(lifetime.recipients || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // R8-I5: Monthly summary: whole ledger, same server pass. Computed on
    // the browser it compared "this month" against "last month" using only
    // the rows loaded, so a month that had scrolled off read as zero and
    // the percentage change was measured against nothing.
    const thisMonthEarned = lifetime.thisMonthEarned || 0;
    const thisMonthSpent = lifetime.thisMonthSpent || 0;
    const lastMonthEarned = lifetime.lastMonthEarned || 0;
    const lastMonthSpent = lifetime.lastMonthSpent || 0;
    const monthlyTrend = {
      thisMonthEarned,
      thisMonthSpent,
      lastMonthEarned,
      lastMonthSpent,
      earnedChange:
        lastMonthEarned > 0 ? ((thisMonthEarned - lastMonthEarned) / lastMonthEarned) * 100 : 0,
      spentChange:
        lastMonthSpent > 0 ? ((thisMonthSpent - lastMonthSpent) / lastMonthSpent) * 100 : 0,
    };

    // R8-I6: Donut chart data: category breakdown with colors
    const donutData = topSources.map(([name, amount], i) => ({
      label: name,
      value: amount,
      color: MARKETPLACE_ANALYTICS_COLORS[i % MARKETPLACE_ANALYTICS_COLORS.length],
    }));

    return {
      totalEarned,
      totalSpent,
      weekEarned,
      weekSpent,
      topSources,
      giftsSent,
      giftsReceived,
      giftCount,
      topRecipients,
      monthlyTrend,
      donutData,
    };
  }, [lifetime]);

  if (!isOpen) return null;

  return (
    <>
      <CapHitPopup open={!!popupData} data={popupData} onClose={() => setPopupData(null)} />
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 89,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          animation: 'walletFadeIn 0.2s ease',
        }}
      />

      {/* Modal: Full Screen */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Diamond Wallet"
        className={styles.preserveIdentityScope}
        style={{
          position: 'fixed',
          // 60 is the UniversalHeader height; the header itself grows by
          // the status-bar inset, so the modal must too (mobile phase 0b).
          top: 'calc(env(safe-area-inset-top, 0px) + 60px)',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 90,
          background: `radial-gradient(ellipse at 50% -10%, rgba(0,100,220,0.25) 0%, rgba(2,8,20,0.4) 100%), url('/images/diamond-wallet-bg-new.png') center/cover no-repeat`,
          display: 'flex',
          flexDirection: 'column',
          animation: 'walletFadeScale 0.3s cubic-bezier(0.16,1,0.3,1)',
          fontFamily: "'Inter', -apple-system, sans-serif",
          textTransform: 'capitalize',
          overflow: 'hidden',
        }}
      >
        {/* Close button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '12px 16px 0',
            maxWidth: 600,
            margin: '0 auto',
            width: '100%',
          }}
        >
          {/* Close button */}
          <button onClick={onClose} aria-label="Close" className={`sp-icon-btn ${styles.closeBtn}`}>
            <X size={16} aria-hidden="true" />
            <span className={styles.srOnly}>Close Wallet</span>
          </button>
        </div>
        {/* Scrollable Modal Content */}
        <div
          ref={scrollContainerRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          style={{
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            maxWidth: 600,
            margin: '0 auto',
            width: '100%',
          }}
        >
          {/* ═══════════════════════════════════════════════
                     PREMIUM HEADER : Image-Backed Layout
                ═══════════════════════════════════════════════ */}
          <div className={styles.art}>
            <img
              className={styles.artImage}
              src="/images/diamond-wallet-bg.jpg"
              alt=""
              aria-hidden="true"
            />

            {/* Diamond Balance Overlay - measured to the plate bay */}
            <div className={`${styles.artReadout} ${styles.artReadoutBalance}`}>
              <div className={styles.artFigure}>{(animatedBalance ?? 0).toLocaleString()}</div>
              <div className={styles.artLabel}>Diamonds</div>
            </div>

            {/* VIP Expiration Overlay - measured to the plate bay */}
            <div className={`${styles.artReadout} ${styles.artReadoutVip}`}>
              {(() => {
                let daysLeftText = '--';
                let isVipActive = isVipStatus;

                /*
                 * A LIFETIME TIER OUTRANKS ANY DATE ON THE ROW.
                 *
                 * This used to test `vipExpirationDate` FIRST and
                 * only reach the lifetime branch when that column
                 * was null. 692 of the 1,021 lifetime members carry
                 * a future `vip_expires_at` anyway - measured on
                 * production 2026-09-05 - so two thirds of the
                 * people who bought a membership that never expires
                 * were shown "Expires: N Days" counting down.
                 *
                 * The tier is the fact about what was bought; the
                 * date is a leftover from how it was granted.
                 */
                if (vipTier === 'lifetime' || vipTier === 'founder') {
                  daysLeftText = 'Lifetime VIP';
                  isVipActive = true;
                } else if (vipExpirationDate) {
                  const diff = new Date(vipExpirationDate).getTime() - new Date().getTime();
                  if (diff > 0) {
                    daysLeftText = `Expires: ${Math.ceil(diff / (1000 * 60 * 60 * 24))} Days`;
                    isVipActive = true;
                  } else {
                    daysLeftText = 'Inactive';
                    isVipActive = false;
                  }
                } else if (isVipStatus) {
                  daysLeftText = 'Active VIP';
                } else {
                  daysLeftText = 'Inactive';
                }

                return (
                  <div className={`${styles.artLabel} ${isVipActive ? '' : styles.artLabelDim}`}>
                    {daysLeftText}
                  </div>
                );
              })()}
            </div>

            {/*
                        BUY AND SEND ARE REAL BUTTONS NOW.
                        ═══════════════════════════════════════════════════════
                        They were two bare `<div onClick>` laid over buttons
                        PAINTED INTO the JPEG: no role, no tabIndex, no key
                        handler, an accessible name only in `title`. So the two
                        money controls of this wallet could not be reached by
                        keyboard at all, and a screen reader announced nothing
                        where the page's most important actions were. The
                        artwork still draws them; these carry the behaviour, and
                        `<button>` brings focus, Enter and Space with it.
                    */}
            <button
              type="button"
              className={styles.artHitbox}
              style={{ left: '10%' }}
              onClick={() => {
                onClose();
                onBuyClick?.();
              }}
            >
              <span className={styles.srOnly}>Buy Diamonds</span>
            </button>

            <button
              type="button"
              className={styles.artHitbox}
              style={{ right: '10%' }}
              onClick={() => {
                setShowTransfer((value) => !value);
                fetchFriends();
              }}
            >
              <span className={styles.srOnly}>Send Diamonds To A Friend</span>
            </button>

            {/*
                        THE ARTWORK'S CAPTION IS COVERED, BECAUSE IT LIES.
                        ═══════════════════════════════════════════════════════
                        `diamond-wallet-bg.jpg` has "Your Vip Membership Unlocks
                        All Premium Features For 30 Days" baked into its bottom
                        strip - measured to start at 88.0% of the image height.
                        It is shown to EVERY viewer, so a Lifetime VIP was told
                        their membership runs out in 30 days, directly beneath a
                        plate reading "Lifetime VIP". No code could correct a
                        sentence painted into a raster, so the strip is masked
                        and the truth is rendered over it from the viewer's own
                        tier.
                    */}
            <div className={styles.artCaption} aria-live="polite">
              {vipCaption}
            </div>
          </div>

          {/* ENH-2: Search Bar */}
          <div className={styles.searchWrap}>
            <div className={styles.searchField}>
              <Search size={14} className={styles.searchIcon} aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Transactions..."
                aria-label="Search Transactions"
                className={styles.searchInput}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className={styles.searchClear}
                >
                  <X size={10} aria-hidden="true" />
                  <span className={styles.srOnly}>Clear Search</span>
                </button>
              )}
            </div>
          </div>

          {/* R8-I4: Date Range Dropdown + Filter Bar + Stats Toggle */}
          <div className={styles.filterRail}>
            {/* Date Range Selector */}
            <select
              aria-label="Filter By Date Range"
              value={dateRange}
              onChange={(e) => {
                const v = e.target.value;
                setDateRange(v);
                try {
                  localStorage.setItem(DATE_RANGE_CACHE_KEY, v);
                } catch (_) {
                  console.warn('[App] Handled exception:', _?.message || _);
                }
              }}
              className={`${styles.rangeSelect} ${dateRange !== 'all' ? styles.rangeSelectActive : ''}`}
            >
              {DATE_RANGE_OPTIONS.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  style={{ background: '#0a1628', color: '#fff' }}
                >
                  {opt.label}
                </option>
              ))}
            </select>
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleFilterChange(opt.value)}
                aria-pressed={filter === opt.value}
                className={`${styles.filterChip} ${filter === opt.value ? styles.filterChipOn : ''}`}
              >
                {/* H2: Show filter badge counts */}
                {/* The number appears only when the SERVER has
                                supplied it. It used to be gated on
                                `transactions.length > 0`, which is why every
                                badge described the loaded page; and `?? 0`
                                turned "not counted yet" into the confident
                                claim "you have none". A tab with an unknown
                                size now shows its name alone. */}
                {opt.label}
                {filterCounts && typeof filterCounts[opt.value] === 'number'
                  ? ` (${filterCounts[opt.value].toLocaleString()})`
                  : ''}
              </button>
            ))}
            {/* ENH-G: Stats toggle */}
            <button
              type="button"
              onClick={() => setShowStats((v) => !v)}
              aria-pressed={showStats}
              aria-expanded={showStats}
              className={`${styles.statsToggle} ${showStats ? styles.statsToggleOn : ''}`}
            >
              Stats
            </button>
          </div>

          {/* H7: Diamond Transfer Panel: Type-to-search UX */}
          {/* One definition of "close to the cap", so the figure and the bar
              cannot disagree about whether to warn. */}
          {showTransfer && (
            <div className={styles.sendPanel}>
              <div className={styles.sendTitle}>Send Diamonds To A Friend</div>
              {/* Anti-abuse info */}
              <div className={styles.sendRules}>
                Send Available Diamonds To An Accepted Friend. Current Sending Limits Apply.
                <br />
                Game Custody And Purchased Refund Collateral Stay Protected.
              </div>
              {/* P2-4: Daily limit progress bar */}
              {dailyLimitInfo && (
                <div className={styles.sendMeter}>
                  <div className={styles.sendMeterRow}>
                    <span>
                      Today: {dailyLimitInfo.sent.toLocaleString()} /{' '}
                      {dailyLimitInfo.limit.toLocaleString()}
                    </span>
                    <span
                      className={`${styles.sendMeterLeft} ${nearDailyCap ? styles.sendMeterLeftLow : ''}`}
                    >
                      {(dailyLimitInfo.limit - dailyLimitInfo.sent).toLocaleString()} Remaining
                    </span>
                  </div>
                  <div
                    className={styles.sendMeterTrack}
                    role="progressbar"
                    aria-label="Diamonds Sent Today"
                    aria-valuemin={0}
                    aria-valuemax={dailyLimitInfo.limit}
                    aria-valuenow={dailyLimitInfo.sent}
                  >
                    <div
                      className={`${styles.sendMeterFill} ${nearDailyCap ? styles.sendMeterFillLow : ''}`}
                      style={{
                        width: `${Math.min((dailyLimitInfo.sent / dailyLimitInfo.limit) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              {/* Friend search + Amount: side by side on larger screens, stacked on mobile */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Friend type-to-search input with autocomplete dropdown */}
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.35)',
                      marginBottom: 4,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                    }}
                  >
                    Recipient
                  </div>
                  {transferRecipient ? (
                    /* Selected friend display */
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: 10,
                      }}
                    >
                      {transferRecipient.avatar_url && (
                        <img
                          src={transferRecipient.avatar_url}
                          alt=""
                          style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }}
                        />
                      )}
                      <span
                        data-user-content="true"
                        data-preserve-case="true"
                        style={{ color: '#ffffff', fontSize: 13, fontWeight: 600, flex: 1 }}
                      >
                        {transferRecipient.display_name || transferRecipient.username}
                      </span>
                      {transferRecipient.is_vip && <Crown size={12} color="#eab308" />}
                      <button
                        onClick={() => {
                          setTransferRecipient(null);
                          setFriendSearch('');
                          setTransferAmount('');
                          setConfirmTransfer(null);
                        }}
                        style={{
                          background: 'rgba(255,255,255,0.1)',
                          border: 'none',
                          borderRadius: '50%',
                          width: 20,
                          height: 20,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'rgba(255,255,255,0.5)',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    /* Search input */
                    <>
                      {/* R8-I2: Recent recipients: one-tap re-send chips */}
                      {recentRecipients.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                          {recentRecipients.map((r) => (
                            <button
                              key={r.id}
                              onClick={() => {
                                setTransferRecipient(r);
                                setFriendSearch('');
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '4px 10px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 12,
                                color: 'rgba(255,255,255,0.7)',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              <span data-user-content="true" data-preserve-case="true">
                                {r.display_name || r.username}
                              </span>
                              {r.lastAmount != null && (
                                <span style={{ color: 'rgba(0,212,255,0.6)', fontSize: 10 }}>
                                  {r.lastAmount}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 10,
                          padding: '8px 12px',
                        }}
                      >
                        <Search
                          size={14}
                          style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}
                        />
                        <input
                          type="text"
                          value={friendSearch}
                          onChange={(e) => setFriendSearch(e.target.value)}
                          placeholder="Type A Friend's Name..."
                          autoFocus
                          style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            boxShadow: 'none',
                            textTransform: 'capitalize',
                            color: '#e2e8f0',
                            fontSize: 13,
                            fontFamily: "'Inter', sans-serif",
                          }}
                        />
                        {friendSearch && (
                          <button
                            onClick={() => setFriendSearch('')}
                            style={{
                              background: 'rgba(255,255,255,0.1)',
                              border: 'none',
                              borderRadius: '50%',
                              width: 18,
                              height: 18,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'rgba(255,255,255,0.5)',
                              cursor: 'pointer',
                              flexShrink: 0,
                              fontSize: 10,
                            }}
                          >
                            <X size={10} />
                          </button>
                        )}
                      </div>
                      {/* Autocomplete dropdown: shows after 3 chars typed */}
                      {friendSearch.trim().length >= 3 && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '100%',
                            zIndex: 10,
                            marginTop: 4,
                            background: 'rgba(10, 22, 40, 0.98)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 10,
                            maxHeight: 180,
                            overflowY: 'auto',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                          }}
                        >
                          {friendsLoading ? (
                            <div
                              style={{
                                padding: '12px 14px',
                                fontSize: 12,
                                color: 'rgba(255,255,255,0.4)',
                              }}
                            >
                              Loading Friends...
                            </div>
                          ) : (
                            (() => {
                              const q = friendSearch.trim().toLowerCase();
                              const matches = transferFriends.filter(
                                (f) =>
                                  (f.display_name || '').toLowerCase().includes(q) ||
                                  (f.username || '').toLowerCase().includes(q)
                              );
                              if (matches.length === 0) {
                                return (
                                  <div
                                    style={{
                                      padding: '12px 14px',
                                      fontSize: 12,
                                      color: 'rgba(255,255,255,0.4)',
                                    }}
                                  >
                                    No Matching Friends Found
                                  </div>
                                );
                              }
                              return matches.slice(0, 10).map((f) => (
                                <button
                                  key={f.id}
                                  onClick={() => {
                                    setTransferRecipient(f);
                                    setFriendSearch('');
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    background: 'transparent',
                                    border: 'none',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    color: '#e2e8f0',
                                    fontSize: 12,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    textAlign: 'left',
                                    transition: 'background 0.1s',
                                  }}
                                >
                                  {f.avatar_url ? (
                                    <img
                                      src={f.avatar_url}
                                      alt=""
                                      style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        flexShrink: 0,
                                      }}
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: '50%',
                                        background: 'rgba(255,255,255,0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                        color: '#ffffff',
                                        fontWeight: 700,
                                        flexShrink: 0,
                                      }}
                                    >
                                      {(f.display_name || f.username || '?')[0].toUpperCase()}
                                    </div>
                                  )}
                                  <div style={{ flex: 1 }}>
                                    <div
                                      data-user-content="true"
                                      data-preserve-case="true"
                                      style={{ fontWeight: 600, fontSize: 13 }}
                                    >
                                      {f.display_name || f.username}
                                    </div>
                                    {f.display_name && f.username && (
                                      <div
                                        data-user-content="true"
                                        data-preserve-case="true"
                                        style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}
                                      >
                                        @{f.username}
                                      </div>
                                    )}
                                  </div>
                                  {f.is_vip && <Crown size={12} color="#eab308" />}
                                </button>
                              ));
                            })()
                          )}
                        </div>
                      )}
                      {/* Hint text when less than 3 chars */}
                      {friendSearch.trim().length > 0 && friendSearch.trim().length < 3 && (
                        <div
                          style={{
                            fontSize: 10,
                            color: 'rgba(255,255,255,0.25)',
                            marginTop: 4,
                            paddingLeft: 4,
                          }}
                        >
                          Type At Least 3 Characters To Search...
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Amount input: only shown when recipient selected */}
                {transferRecipient && (
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.35)',
                        marginBottom: 4,
                        fontWeight: 600,
                        letterSpacing: '0.3px',
                      }}
                    >
                      Amount
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 10,
                          padding: '8px 12px',
                        }}
                      >
                        <Sparkles size={14} color="#00d4ff" />
                        <input
                          type="number"
                          min="1"
                          max="2147483647"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          placeholder="Enter Diamond Amount..."
                          autoFocus
                          style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            boxShadow: 'none',
                            color: '#e2e8f0',
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "'Inter', sans-serif",
                          }}
                        />
                      </div>
                      <button
                        onClick={handleTransfer}
                        /* Disabled while the confirm dialog is open: otherwise a second
                                               click on Send executes the transfer (confirmTransfer is truthy
                                               in handleTransfer) without the user ever pressing Confirm */
                        disabled={
                          transferLoading ||
                          !transferAmount ||
                          cooldownSeconds > 0 ||
                          !!confirmTransfer
                        }
                        style={{
                          padding: '9px 18px',
                          background: transferLoading
                            ? 'rgba(255,255,255,0.04)'
                            : 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: 10,
                          color: '#ffffff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor:
                            transferLoading || cooldownSeconds > 0 || confirmTransfer
                              ? 'default'
                              : 'pointer',
                          opacity:
                            transferLoading ||
                            !transferAmount ||
                            cooldownSeconds > 0 ||
                            confirmTransfer
                              ? 0.5
                              : 1,
                          transition: 'all 0.15s',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {transferLoading
                          ? 'Sending...'
                          : cooldownSeconds > 0
                            ? `Wait ${cooldownSeconds}s`
                            : 'Send'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Error / Success feedback */}
              {transferError && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: '#f87171',
                    padding: '6px 10px',
                    background: 'rgba(248,113,113,0.08)',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {cooldownSeconds > 0 && <Clock size={12} color="#f87171" />}
                  {cooldownSeconds > 0
                    ? `Cooldown: ${cooldownSeconds}s Remaining`
                    : marketplaceCopy(transferError)}
                </div>
              )}
              {transferSuccess && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: '#58d9ff',
                    padding: '6px 10px',
                    background: 'rgba(0,212,255,0.08)',
                    borderRadius: 6,
                  }}
                >
                  <span data-user-content="true" data-preserve-case="true">
                    {transferSuccess}
                  </span>
                </div>
              )}
              {/* #5: Confirmation dialog */}
              {confirmTransfer && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 10,
                    animation: 'walletFadeIn 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', marginBottom: 8 }}>
                    Confirm Transfer
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.7)',
                      marginBottom: 10,
                      lineHeight: 1.4,
                    }}
                  >
                    Send{' '}
                    <strong style={{ color: '#00d4ff' }}>{confirmTransfer.amount} Diamonds</strong>{' '}
                    To{' '}
                    <strong
                      data-user-content="true"
                      data-preserve-case="true"
                      style={{ color: '#ffffff' }}
                    >
                      {confirmTransfer.recipient?.display_name ||
                        confirmTransfer.recipient?.username}
                    </strong>
                    ? This Cannot Be Undone.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setConfirmTransfer(null)}
                      style={{
                        flex: 1,
                        padding: '7px 0',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        color: 'rgba(255,255,255,0.5)',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleTransfer}
                      disabled={transferLoading || cooldownSeconds > 0}
                      style={{
                        flex: 1,
                        padding: '7px 0',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: 8,
                        color: '#ffffff',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: transferLoading || cooldownSeconds > 0 ? 'default' : 'pointer',
                        opacity: transferLoading || cooldownSeconds > 0 ? 0.5 : 1,
                      }}
                    >
                      {transferLoading
                        ? 'Sending...'
                        : `Confirm Send ${confirmTransfer.amount} Diamonds`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* H5: Stats skeleton when loading */}
          {showStats && !stats && (
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(0,212,255,0.04)',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 8,
                    height: 60,
                    animation: 'walletShimmer 1.2s ease-in-out infinite',
                  }}
                />
                <div
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 8,
                    height: 60,
                    animation: 'walletShimmer 1.2s ease-in-out infinite',
                    animationDelay: '0.2s',
                  }}
                />
              </div>
            </div>
          )}
          {/* ENH-G: Analytics Stats Panel */}
          {showStats && stats && (
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                background: 'rgba(0, 212, 255, 0.04)',
                animation: 'walletFadeIn 0.2s ease',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    background: 'rgba(0, 212, 255, 0.08)',
                    borderRadius: 8,
                    padding: '8px 10px',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>
                    Total Earned
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#58d9ff',
                      fontFamily: 'Rajdhani, monospace',
                    }}
                  >
                    +{stats.totalEarned.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                    This Week: +{stats.weekEarned.toLocaleString()}
                  </div>
                </div>
                <div
                  style={{
                    background: 'rgba(248, 113, 113, 0.08)',
                    borderRadius: 8,
                    padding: '8px 10px',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>
                    Total Spent
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#f87171',
                      fontFamily: 'Rajdhani, monospace',
                    }}
                  >
                    -{stats.totalSpent.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                    This Week: -{stats.weekSpent.toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>
                Top Sources
              </div>
              {stats.topSources.map(([name, amount], i) => (
                <div
                  key={name}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: 'rgba(255,255,255,0.06)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${(amount / stats.topSources[0][1]) * 100}%`,
                        height: '100%',
                        borderRadius: 2,
                        background:
                          MARKETPLACE_ANALYTICS_COLORS[i % MARKETPLACE_ANALYTICS_COLORS.length],
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.5)',
                      whiteSpace: 'nowrap',
                      minWidth: 80,
                    }}
                  >
                    {marketplaceCopy(name)}: {amount.toLocaleString()}
                  </span>
                </div>
              ))}
              {/* R8-I6: Donut Chart: Category Breakdown */}
              {stats.donutData?.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '8px 0',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.35)',
                      marginBottom: 8,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Category Breakdown
                  </div>
                  <DonutChart data={stats.donutData} />
                </div>
              )}

              {/* R8-I5: Monthly Trends */}
              {stats.monthlyTrend && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '8px 0',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.35)',
                      marginBottom: 8,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Monthly Comparison
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div
                      style={{
                        background: 'rgba(0,212,255,0.06)',
                        borderRadius: 8,
                        padding: '6px 10px',
                      }}
                    >
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
                        This Month Earned
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#58d9ff',
                          fontFamily: 'Rajdhani, monospace',
                        }}
                      >
                        +{stats.monthlyTrend.thisMonthEarned.toLocaleString()}
                      </div>
                      {stats.monthlyTrend.earnedChange !== 0 && (
                        <div
                          style={{
                            fontSize: 9,
                            color: stats.monthlyTrend.earnedChange >= 0 ? '#58d9ff' : '#f87171',
                            marginTop: 2,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                          }}
                        >
                          {stats.monthlyTrend.earnedChange >= 0 ? (
                            <ArrowUpRight size={10} />
                          ) : (
                            <ArrowDownRight size={10} />
                          )}
                          {Math.abs(stats.monthlyTrend.earnedChange).toFixed(0)}% Vs Last Month
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        background: 'rgba(0,212,255,0.06)',
                        borderRadius: 8,
                        padding: '6px 10px',
                      }}
                    >
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
                        This Month Spent
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#f87171',
                          fontFamily: 'Rajdhani, monospace',
                        }}
                      >
                        -{stats.monthlyTrend.thisMonthSpent.toLocaleString()}
                      </div>
                      {stats.monthlyTrend.spentChange !== 0 && (
                        <div
                          style={{
                            fontSize: 9,
                            color: stats.monthlyTrend.spentChange <= 0 ? '#58d9ff' : '#f87171',
                            marginTop: 2,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                          }}
                        >
                          {stats.monthlyTrend.spentChange >= 0 ? (
                            <ArrowUpRight size={10} />
                          ) : (
                            <ArrowDownRight size={10} />
                          )}
                          {Math.abs(stats.monthlyTrend.spentChange).toFixed(0)}% Vs Last Month
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
            <div
              style={{
                padding: '8px 16px 12px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                background: 'rgba(255, 255, 255, 0.02)',
                animation: 'walletFadeIn 0.2s ease',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.35)',
                  marginBottom: 6,
                  letterSpacing: '0.5px',
                }}
              >
                Gift Activity
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 8,
                    padding: '6px 8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Sent</div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#ffffff',
                      fontFamily: 'Rajdhani, monospace',
                    }}
                  >
                    {stats.giftsSent.toLocaleString()}
                  </div>
                </div>
                <div
                  style={{
                    background: 'rgba(0,212,255,0.08)',
                    borderRadius: 8,
                    padding: '6px 8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Received</div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#58d9ff',
                      fontFamily: 'Rajdhani, monospace',
                    }}
                  >
                    {stats.giftsReceived.toLocaleString()}
                  </div>
                </div>
                <div
                  style={{
                    background: 'rgba(0,212,255,0.08)',
                    borderRadius: 8,
                    padding: '6px 8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Gifts</div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#00d4ff',
                      fontFamily: 'Rajdhani, monospace',
                    }}
                  >
                    {stats.giftCount}
                  </div>
                </div>
              </div>
              {stats.topRecipients.length > 0 && (
                <>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>
                    Top Recipients
                  </div>
                  {stats.topRecipients.map(([name, amount], i) => (
                    <div
                      key={name}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}
                    >
                      <div
                        style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 2,
                          background: 'rgba(255,255,255,0.06)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${(amount / stats.topRecipients[0][1]) * 100}%`,
                            height: '100%',
                            borderRadius: 2,
                            background:
                              MARKETPLACE_ANALYTICS_COLORS[
                                (i + 4) % MARKETPLACE_ANALYTICS_COLORS.length
                              ],
                          }}
                        />
                      </div>
                      <span
                        data-user-content="true"
                        data-preserve-case="true"
                        style={{
                          fontSize: 9,
                          color: 'rgba(255,255,255,0.45)',
                          whiteSpace: 'nowrap',
                          minWidth: 70,
                        }}
                      >
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
            <div
              style={{
                textAlign: 'center',
                padding: `${Math.min(pullDistance / 2, 30)}px 0`,
                color: pullDistance > 60 ? '#00d4ff' : 'rgba(255,255,255,0.3)',
                fontSize: 11,
                fontWeight: 600,
                transition: pullDistance === 0 ? 'all 0.2s' : 'none',
              }}
            >
              {isRefreshing
                ? 'Refreshing...'
                : pullDistance > 60
                  ? 'Release to refresh'
                  : 'Pull down to refresh'}
            </div>
          )}

          {/* Transaction List */}
          <div
            role="list"
            aria-label="Diamond Transactions"
            style={{
              padding: '4px 0 24px 0',
            }}
          >
            {/* ── BUG-3: Error state with retry button ── */}
            {error ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: 40,
                  color: 'rgba(255, 255, 255, 0.4)',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.5 }}>&#X26A0;&#XFE0F;</div>
                <div style={{ fontSize: 13, marginBottom: 14, color: 'rgba(255, 255, 255, 0.45)' }}>
                  {marketplaceCopy(error)}
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
              <div
                style={{
                  textAlign: 'center',
                  padding: '30px 40px',
                  color: 'rgba(255, 255, 255, 0.3)',
                }}
              >
                {/* R8-I1: Inline SVG diamond (replaces broken PNG) */}
                <EmptyStateDiamond />
                {/*
                    AN EMPTY VIEW IS NOT AN EMPTY WALLET.
                    ═══════════════════════════════════════════════════════════
                    The search box and the date range are applied to the rows
                    the browser has LOADED; only the tab is a server query. So a
                    player who once picked "Last 7 Days", then had a quiet week,
                    opened a wallet holding hundreds of transactions and was
                    told "No transactions yet" - followed by advice on how to
                    earn their first diamonds. Every branch below now says which
                    narrowing produced the blank, and offers to undo it.
                */}
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {searchQuery
                    ? `No Loaded Transactions Match "${searchQuery}"`
                    : dateRange !== 'all'
                      ? `Nothing In The ${DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label || 'Selected Range'}`
                      : filter === 'all'
                        ? 'No Transactions Yet'
                        : `No ${FILTER_OPTIONS.find((o) => o.value === filter)?.label || ''} Yet`}
                </div>
                {/* The way out of a filter the player may have forgotten. */}
                {(searchQuery || dateRange !== 'all') && (
                  <button
                    type="button"
                    className={styles.emptyReset}
                    onClick={() => {
                      setSearchQuery('');
                      setDateRange('all');
                      try {
                        localStorage.setItem(DATE_RANGE_CACHE_KEY, 'all');
                      } catch (_) {
                        console.warn('[App] Handled exception:', _?.message || _);
                      }
                    }}
                  >
                    Show Everything
                  </button>
                )}
                {filter === 'all' && !searchQuery && dateRange === 'all' && (
                  <>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>
                      Earn Diamonds Through Daily Logins, Trivia, And More
                    </div>
                    {/* H3: Enhanced empty state CTA */}
                    {(balance ?? 0) === 0 && (
                      <button
                        onClick={() => {
                          onClose();
                          onBuyClick?.();
                        }}
                        style={{
                          marginTop: 16,
                          padding: '10px 28px',
                          background:
                            'linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(0, 150, 255, 0.25))',
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
                      onTouchStart={(e) => {
                        swipeStartX.current = e.touches[0].clientX;
                        swipeTxId.current = tx.id;
                      }}
                      onTouchEnd={async (e) => {
                        if (swipeTxId.current === tx.id) {
                          const deltaX = (e.changedTouches[0]?.clientX ?? 0) - swipeStartX.current;
                          swipeStartX.current = 0;
                          swipeTxId.current = null;
                          if (deltaX > 60) {
                            // Swipe right: copy receipt
                            const ok = await copyReceiptToClipboard(tx);
                            if (ok) {
                              setCopiedTxId(tx.id);
                              showStoreToast('success', 'Receipt copied');
                              clearTimeout(copyTimerRef.current);
                              copyTimerRef.current = setTimeout(() => setCopiedTxId(null), 2000);
                            }
                          }
                        } else {
                          swipeStartX.current = 0;
                          swipeTxId.current = null;
                        }
                      }}
                      className={`${styles.txRow} ${isExpanded ? styles.txRowOpen : ''}`}
                    >
                      <div className={styles.txRowMain}>
                        {/* Icon: R8-I10: Lucide React */}
                        <div className={styles.txIcon}>
                          {config.Icon ? (
                            <config.Icon size={ICON_SIZE} color={config.color} />
                          ) : (
                            <Sparkles size={ICON_SIZE} color={config.color} />
                          )}
                        </div>

                        {/* Details */}
                        <div className={styles.txBody}>
                          <div className={styles.txLabel}>{toTitleCase(config.label)}</div>
                          <div className={styles.txDesc}>
                            <WalletDescription value={tx.description || config.label} />
                          </div>
                        </div>

                        {/* Amount + Time */}
                        <div className={styles.txSide}>
                          <span
                            className={`${styles.txAmount} ${isPositive ? styles.txAmountIn : styles.txAmountOut}`}
                          >
                            {isPositive ? '+' : ''}
                            {(tx.amount ?? 0).toLocaleString()}
                          </span>
                          {tx.balance_after != null && (
                            <span
                              style={{
                                fontSize: 12,
                                color: 'rgba(255, 255, 255, 0.35)',
                              }}
                            >
                              Bal: {tx.balance_after.toLocaleString()}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 12,
                              color: 'rgba(255, 255, 255, 0.3)',
                              marginTop: 4,
                            }}
                          >
                            {dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                            {dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      {/* ENH-B: Expanded transaction details */}
                      {isExpanded && (
                        <div
                          style={{
                            padding: '0 16px 12px 64px',
                            animation: 'walletFadeIn 0.15s ease',
                          }}
                        >
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '4px 16px',
                              fontSize: 11,
                            }}
                          >
                            <div>
                              <span style={{ color: 'rgba(255,255,255,0.3)' }}>Type: </span>
                              <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                                {toTitleCase(txType)}
                              </span>
                            </div>
                            <div>
                              <span style={{ color: 'rgba(255,255,255,0.3)' }}>Date: </span>
                              <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                                {dt.toLocaleString()}
                              </span>
                            </div>
                            {tx.reference_id && (
                              <div style={{ gridColumn: '1 / -1' }}>
                                <span style={{ color: 'rgba(255,255,255,0.3)' }}>Ref: </span>
                                <span
                                  style={{
                                    color: 'rgba(255,255,255,0.5)',
                                    fontFamily: 'monospace',
                                    fontSize: 10,
                                  }}
                                >
                                  {tx.reference_id}
                                </span>
                              </div>
                            )}
                            {tx.description && tx.description !== config.label && (
                              <div style={{ gridColumn: '1 / -1' }}>
                                <span style={{ color: 'rgba(255,255,255,0.3)' }}>Details: </span>
                                <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                                  <WalletDescription value={tx.description} />
                                </span>
                              </div>
                            )}
                          </div>
                          {/* H1: Copy receipt button */}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (await copyReceiptToClipboard(tx)) {
                                setCopiedTxId(tx.id);
                                clearTimeout(copyTimerRef.current);
                                copyTimerRef.current = setTimeout(() => setCopiedTxId(null), 2000);
                              }
                            }}
                            style={{
                              marginTop: 6,
                              padding: '3px 10px',
                              background:
                                copiedTxId === tx.id
                                  ? 'rgba(0,212,255,0.15)'
                                  : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${copiedTxId === tx.id ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                              borderRadius: 6,
                              color: copiedTxId === tx.id ? '#58d9ff' : 'rgba(255,255,255,0.4)',
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
                        background: loadingMore
                          ? 'rgba(255, 255, 255, 0.04)'
                          : 'rgba(0, 212, 255, 0.1)',
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
                      {loadingMore
                        ? 'Loading...'
                        : `Load More (${transactions.length} of ${total})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>{' '}
        {/* End Scrollable Modal Content */}
        {/* Footer */}
        {!loading && total > 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '8px 16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              fontSize: 11,
              color: 'rgba(255, 255, 255, 0.3)',
              display: 'flex',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <span>{total.toLocaleString()} Total Transactions</span>
            {filteredTx.length !== transactions.length && <span>| {filteredTx.length} Shown</span>}
          </div>
        )}
      </div>

      {/* Keyframe animations */}
      <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@700;900&display=swap');
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
            `}</style>
    </>
  );
}
